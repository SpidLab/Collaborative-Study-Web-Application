"""Collaborative Study — local Site Agent.

A headless daemon that runs on the collaborator's machine (in Docker). It
long-polls the central collaboration server for jobs, runs QC/GWAS locally
against raw CSVs in DATA_DIR, and uploads only derived outputs. Raw genotype
files never leave the machine. Outbound HTTPS only — no inbound ports.
"""
import json
import logging
import time

import requests

from config import Config
from jobs_client import JobsClient
import data_loader
from data_loader import load_dataframe, file_sha256, expected_hash_matches
import actions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("siteagent")

# Only these top-level result keys may be uploaded. Everything the agent
# produces is a QC-derived aggregate; the raw input is never in here.
ALLOWED_RESULT_KEYS = {
    "surviving_samples", "surviving_snps", "pca_coords", "transformed_data", "stats",
}


def egress_guard(result):
    """Refuse to upload anything other than known derived outputs / oversize payloads."""
    bad = set(result) - ALLOWED_RESULT_KEYS
    if bad:
        raise ValueError(f"Egress guard blocked unexpected result keys: {sorted(bad)}")
    size = len(json.dumps(result).encode("utf-8"))
    if size > Config.MAX_RESULT_BYTES:
        raise ValueError(f"Egress guard blocked oversize payload: {size} bytes")
    return result


def sync_local_datasets(client):
    """On startup, tell the server the metadata for each local dataset — sample
    count, file hash, and SNP marker names (the CSV header only, never genotypes) —
    so the study can display the markers without anyone typing them in."""
    try:
        datasets = client.list_datasets()
    except Exception as e:
        logger.warning("Could not list datasets for metadata sync: %s", e)
        return
    for ds in datasets:
        phenotype = ds.get("phenotype")
        if not phenotype:
            continue
        try:
            csv_path, _ = data_loader.resolve_dataset(Config.DATA_DIR, phenotype)
        except FileNotFoundError:
            continue  # this dataset isn't on this machine
        try:
            snp_ids = data_loader.read_snp_ids(csv_path)
            client.register_metadata(ds["id"], phenotype,
                                     data_loader.count_samples(csv_path),
                                     file_sha256(csv_path), snp_ids)
            logger.info("Registered metadata for '%s': %d samples, %d markers.",
                        phenotype, data_loader.count_samples(csv_path), len(snp_ids))
        except Exception as e:
            logger.warning("Metadata sync failed for '%s': %s", phenotype, e)


def handle_job(job, client):
    action = job.get("action")
    params = job.get("params", {}) or {}
    phenotype = job.get("phenotype") or params.get("phenotype")
    dataset_id = job.get("dataset_id") or params.get("dataset_id")

    csv_path, dataset_dir = data_loader.resolve_dataset(Config.DATA_DIR, phenotype)

    # Register / verify the dataset fingerprint without uploading any rows.
    # Metadata = sample count, file hash, and the SNP marker names (header only).
    file_hash = file_sha256(csv_path)
    if dataset_id:
        try:
            client.register_metadata(dataset_id, phenotype,
                                     data_loader.count_samples(csv_path), file_hash,
                                     data_loader.read_snp_ids(csv_path))
        except requests.HTTPError as e:
            logger.warning("Metadata registration failed (continuing): %s", e)
    if job.get("expected_file_sha256") and not expected_hash_matches(csv_path, job["expected_file_sha256"]):
        raise ValueError(
            f"Local file for '{phenotype}' does not match the registered hash; refusing to run."
        )

    df = load_dataframe(csv_path)
    logger.info("Job %s action=%s phenotype=%s shape=%s", job.get("id"), action, phenotype, df.shape)

    if action == "chained_qc":
        result = actions.run_chained_qc(df, params.get("methods", []), Config.MODELS_DIR)
    elif action == "privacy_transform":
        result = actions.run_privacy_transform(df, params)
    elif action == "gwas_summary":
        sample_ids = params.get("sample_ids") or [str(i) for i in df.index.tolist()]
        # Support both case/control conventions: a phenotype column inside the CSV
        # (auto-detected by gwas_summary) OR per-dataset case_ids.txt/control_ids.txt
        # in this phenotype's folder. Explicit params, if any, take precedence.
        if not params.get("case_ids_path") and not params.get("control_ids_path"):
            case_path, control_path = data_loader.find_case_control_files(dataset_dir, phenotype)
            if case_path and control_path:
                params = dict(params, case_ids_path=case_path, control_ids_path=control_path)
                logger.info("Using case/control ID files from the data folder for GWAS.")
        result = actions.run_gwas_summary(df, sample_ids, params)
    else:
        raise ValueError(f"Unknown job action: {action}")

    egress_guard(result)
    client.post_result(job["id"], result)
    logger.info("Job %s complete; uploaded keys=%s", job.get("id"), sorted(result))


def main():
    Config.validate()
    # Prefer an explicit token, then a previously saved one, then enroll with a code.
    token = Config.AGENT_TOKEN or Config.read_saved_token()
    if not token:
        if not Config.ENROLL_CODE:
            raise SystemExit("No saved token and no ENROLL_CODE provided. Paste your enrollment code and restart.")
        logger.info("First run: exchanging enrollment code for a token...")
        token = JobsClient.enroll(Config.SERVER_URL, Config.ENROLL_CODE, Config.REQUEST_TIMEOUT)
        Config.save_token(token)
        logger.info("Enrolled successfully. Token saved — you won't need the code again.")

    client = JobsClient(Config.SERVER_URL, token, Config.REQUEST_TIMEOUT)
    try:
        logger.info("Connected to %s (server version: %s)", Config.SERVER_URL, client.version())
    except Exception as e:
        logger.warning("Version check failed (continuing): %s", e)

    # Push SNP marker names + counts for local datasets so they show up on the site.
    sync_local_datasets(client)

    logger.info("Agent running. Polling for jobs every ~%ss. Data dir: %s", Config.POLL_INTERVAL, Config.DATA_DIR)
    backoff = Config.POLL_INTERVAL
    while True:
        try:
            job = client.next_job(Config.POLL_TIMEOUT)
            backoff = Config.POLL_INTERVAL
            if not job:
                continue
            try:
                handle_job(job, client)
            except Exception as job_err:
                logger.exception("Job %s failed: %s", job.get("id"), job_err)
                try:
                    client.post_failure(job["id"], job_err)
                except Exception:
                    logger.exception("Could not report job failure for %s", job.get("id"))
        except KeyboardInterrupt:
            logger.info("Shutting down.")
            break
        except Exception as loop_err:
            logger.warning("Poll error: %s (retrying in %ss)", loop_err, backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 300)


if __name__ == "__main__":
    main()

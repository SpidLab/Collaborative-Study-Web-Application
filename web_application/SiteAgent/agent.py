"""Collaborative Study — local Site Agent.

A headless daemon that runs on the collaborator's machine (in Docker). It
long-polls the central collaboration server for jobs, runs QC/GWAS locally
against raw CSVs in DATA_DIR, and uploads only derived outputs. Raw genotype
files never leave the machine. Outbound HTTPS only — no inbound ports.
"""
import base64
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
    # Federated Learning: PCA coords reuse "pca_coords"; training rounds return a
    # model weight update (weights + sample count + local metrics — no raw data).
    "model_update",
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


def _jwt_uid(token):
    """Best-effort read of the 'uid' claim from a JWT WITHOUT verifying the
    signature (the server verifies it; we only need it to detect an account
    switch). Returns None if the token can't be parsed."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8")).get("uid")
    except Exception:
        return None


def sync_local_datasets(client):
    """On startup, tell the server the metadata for each local dataset — sample
    count, file hash, and SNP marker names (the CSV header only, never genotypes) —
    so the study can display the markers without anyone typing them in.

    Returns a list of (phenotype, n_samples, n_markers) tuples for the datasets
    that were found locally and registered, so the caller can print a friendly
    'ready' summary."""
    ready = []
    try:
        datasets = client.list_datasets()
    except Exception as e:
        logger.warning("Could not list datasets for metadata sync: %s", e)
        return ready
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
            n_samples = data_loader.count_samples(csv_path)
            client.register_metadata(ds["id"], phenotype, n_samples,
                                     file_sha256(csv_path), snp_ids)
            logger.info("Registered metadata for '%s': %d samples, %d markers.",
                        phenotype, n_samples, len(snp_ids))
            ready.append((phenotype, n_samples, len(snp_ids)))
        except Exception as e:
            logger.warning("Metadata sync failed for '%s': %s", phenotype, e)
    return ready


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

    if action == "fl_project":
        # Federated Learning stage 1: PCA-project local genotypes + DP noise.
        result = actions.run_fl_project(df, params, Config.MODELS_DIR)
    elif action == "fl_train_round":
        # Federated Learning stage 3: one local training round on this site's data.
        result = actions.run_fl_train_round(df, params)
    elif action == "chained_qc":
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
    # Credential resolution: an explicit AGENT_TOKEN wins; otherwise use the saved
    # token from the /config volume. If an ENROLL_CODE is also present, it is used to
    # enroll on first run AND to RE-ENROLL when it belongs to a different account than
    # the saved token — otherwise a stale saved token would silently keep the agent
    # acting as the wrong account (a pilot footgun we hit in testing).
    explicit = Config.AGENT_TOKEN
    saved = Config.read_saved_token()
    code = Config.ENROLL_CODE
    token = explicit or saved

    if not explicit and code:
        code_uid = _jwt_uid(code)
        saved_uid = _jwt_uid(saved) if saved else None
        if not saved:
            logger.info("First run: exchanging enrollment code for a token...")
            token = JobsClient.enroll(Config.SERVER_URL, code, Config.REQUEST_TIMEOUT)
            Config.save_token(token)
            logger.info("Enrolled successfully. Token saved — you won't need the code again.")
        elif code_uid and code_uid != saved_uid:
            logger.info("This enrollment code is for a different account than the saved login — "
                        "re-enrolling with the new code.")
            token = JobsClient.enroll(Config.SERVER_URL, code, Config.REQUEST_TIMEOUT)
            Config.save_token(token)
            logger.info("Re-enrolled successfully. Now connected as the new account.")

    if not token:
        raise SystemExit("No saved token and no ENROLL_CODE provided. Paste your enrollment code and restart.")

    client = JobsClient(Config.SERVER_URL, token, Config.REQUEST_TIMEOUT)
    try:
        version = client.version()
        logger.info("Connected to %s (server version: %s)", Config.SERVER_URL,
                    version.get("version", version) if isinstance(version, dict) else version)
    except Exception as e:
        logger.warning("Version check failed (continuing): %s", e)

    # Announce WHICH account this agent is acting as. If it's the wrong one, the
    # collaborator sees it immediately instead of silently polling an empty queue.
    try:
        who = client.me()
        identity = who.get("email") or who.get("name") or who.get("uid")
        logger.info("✅ Connected as %s", identity)
    except Exception as e:
        logger.warning("Could not confirm which account this agent is for (continuing): %s", e)

    # Push SNP marker names + counts for local datasets so they show up on the site,
    # and print a friendly summary of what's ready on this machine.
    ready = sync_local_datasets(client)
    if ready:
        logger.info("Datasets ready on this machine: %s",
                    ", ".join(f"{p} ({s} samples, {m} markers)" for p, s, m in ready))
    else:
        logger.warning("No local datasets matched your registered phenotypes yet. Make sure each "
                       "dataset folder under %s is named exactly like the phenotype you registered "
                       "on the website (e.g. <folder>/eye_color/rawdata.csv).", Config.DATA_DIR)

    logger.info("Setup looks good — waiting for jobs. Polling every ~%ss. Data dir: %s",
                Config.POLL_INTERVAL, Config.DATA_DIR)
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

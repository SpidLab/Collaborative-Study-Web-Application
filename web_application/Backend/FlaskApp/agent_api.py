"""Agent API + job queue for the central collaboration server.

Replaces the Node.js/Kubernetes orchestrator. Collaborator machines run a local
Site Agent (see web_application/SiteAgent) that authenticates with a bearer
token, long-polls for jobs scoped to its user, runs QC/GWAS locally, and uploads
only derived outputs. Raw genotypes are never received here.

Usage in app.py:
    from agent_api import register_agent_api
    enqueue_job = register_agent_api(app, db)
"""
import gzip
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta

import jwt
from bson.objectid import ObjectId
from flask import request, jsonify

logger = logging.getLogger("agent_api")

# Outputs the agent is allowed to send back, and where each lands on the
# collaboration document (keyed per user id).
ALLOWED_RESULT_KEYS = {"surviving_samples", "surviving_snps", "pca_coords", "transformed_data", "stats"}

# Arrays/objects larger than this many entries are offloaded to the qc_results
# collection to stay under MongoDB's 16 MB document limit (existing pattern).
OVERFLOW_THRESHOLD = 50000

AGENT_VERSION = "1.0.0"

# If an agent claims a job (status in_progress) but never posts a result within
# this window — e.g. it crashed or was killed mid-job — the job is requeued so a
# restarted agent retries it. MAX_ATTEMPTS stops a "poison" job looping forever.
STALE_AFTER_SECONDS = int(os.getenv("AGENT_JOB_STALE_SECONDS", "900"))
MAX_ATTEMPTS = int(os.getenv("AGENT_JOB_MAX_ATTEMPTS", "3"))


def register_agent_api(app, db, signing_key=None):
    secret = signing_key or app.config.get("SECRET_KEY")
    jobs = db["jobs"]
    collaborations = db["collaborations"]
    datasets = db["datasets"]
    qc_results = db["qc_results"]

    # ---- token helpers -----------------------------------------------------
    def mint_enrollment_code(user_id, ttl_hours=24):
        return jwt.encode(
            {"typ": "enroll", "uid": str(user_id),
             "exp": datetime.utcnow() + timedelta(hours=ttl_hours)},
            secret, algorithm="HS256")

    def mint_agent_token(user_id, ttl_days=3650):
        return jwt.encode(
            {"typ": "agent", "uid": str(user_id),
             "exp": datetime.utcnow() + timedelta(days=ttl_days)},
            secret, algorithm="HS256")

    def current_agent_uid():
        """Return the user_id this agent token is scoped to, or (None, error_response)."""
        header = request.headers.get("Authorization", "")
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None, (jsonify({"error": "Missing bearer token"}), 401)
        try:
            data = jwt.decode(parts[1], secret, algorithms=["HS256"])
        except Exception:
            return None, (jsonify({"error": "Invalid or expired agent token"}), 401)
        if data.get("typ") != "agent":
            return None, (jsonify({"error": "Not an agent token"}), 403)
        return data["uid"], None

    # ---- job queue ---------------------------------------------------------
    def requeue_stale_jobs(user_id):
        """Recover jobs an agent claimed but never finished (crash/kill mid-job).

        Any in_progress job older than STALE_AFTER_SECONDS is set back to pending
        so a restarted agent retries it; once attempts exceed MAX_ATTEMPTS it is
        marked failed instead of looping forever.
        """
        cutoff = datetime.utcnow() - timedelta(seconds=STALE_AFTER_SECONDS)
        stale = jobs.find({
            "user_id": str(user_id),
            "status": "in_progress",
            "claimed_at": {"$lt": cutoff},
        })
        for job in stale:
            if job.get("attempts", 0) >= MAX_ATTEMPTS:
                jobs.update_one({"job_id": job["job_id"]}, {"$set": {
                    "status": "failed",
                    "completed_at": datetime.utcnow(),
                    "error": f"Exceeded {MAX_ATTEMPTS} attempts (agent kept failing before posting a result).",
                }})
                logger.warning("Job %s failed permanently after %s attempts", job["job_id"], job.get("attempts"))
            else:
                jobs.update_one({"job_id": job["job_id"]}, {"$set": {"status": "pending", "claimed_at": None}})
                logger.info("Requeued stale job %s (attempt %s)", job["job_id"], job.get("attempts", 0))

    def enqueue_job(collaboration_uuid, user_id, action, params):
        """Create a pending job for a user's agent. Returns the job id."""
        job_id = uuid.uuid4().hex
        jobs.insert_one({
            "job_id": job_id,
            "collaboration_uuid": collaboration_uuid,
            "user_id": str(user_id),
            "action": action,
            "params": params or {},
            "status": "pending",
            "attempts": 0,
            "created_at": datetime.utcnow(),
            "claimed_at": None,
            "completed_at": None,
            "error": None,
        })
        logger.info("Enqueued job %s action=%s user=%s collab=%s", job_id, action, user_id, collaboration_uuid)
        return job_id

    # ---- result ingestion --------------------------------------------------
    def _store_per_user(collab_uuid, uid, key, value):
        """Write a per-user result onto the collaboration, offloading huge values."""
        if isinstance(value, (list, dict)) and len(value) > OVERFLOW_THRESHOLD:
            ref = f"{collab_uuid}:{uid}:{key}:{uuid.uuid4().hex}"
            qc_results.update_one({"ref": ref}, {"$set": {"ref": ref, "value": value}}, upsert=True)
            collaborations.update_one({"uuid": collab_uuid}, {"$set": {f"{key}.{uid}": {"__ref__": ref}}})
        else:
            collaborations.update_one({"uuid": collab_uuid}, {"$set": {f"{key}.{uid}": value}})

    # ---- routes ------------------------------------------------------------
    @app.route("/api/agent/enroll", methods=["POST"])
    def agent_enroll():
        code = (request.get_json(silent=True) or {}).get("code")
        if not code:
            return jsonify({"error": "Missing enrollment code"}), 400
        try:
            data = jwt.decode(code, secret, algorithms=["HS256"])
        except Exception:
            return jsonify({"error": "Invalid or expired enrollment code"}), 401
        if data.get("typ") != "enroll":
            return jsonify({"error": "Not an enrollment code"}), 400
        return jsonify({"token": mint_agent_token(data["uid"])}), 200

    @app.route("/api/agent/version", methods=["GET"])
    def agent_version():
        uid, err = current_agent_uid()
        if err:
            return err
        return jsonify({"version": AGENT_VERSION, "server": "collaborative-study"}), 200

    @app.route("/api/agent/datasets", methods=["GET"])
    def agent_list_datasets():
        """List this agent's datasets so it can proactively register metadata
        (sample count, SNP marker names) for the ones it has locally."""
        uid, err = current_agent_uid()
        if err:
            return err
        out = []
        for ds in datasets.find({"user_id": str(uid)}, {"phenotype": 1}):
            out.append({"id": str(ds["_id"]), "phenotype": ds.get("phenotype")})
        return jsonify({"datasets": out}), 200

    @app.route("/api/agent/datasets/<dataset_id>/metadata", methods=["POST"])
    def agent_dataset_metadata(dataset_id):
        uid, err = current_agent_uid()
        if err:
            return err
        body = request.get_json(silent=True) or {}
        try:
            oid = ObjectId(dataset_id)
        except Exception:
            return jsonify({"error": "Invalid dataset id"}), 400
        ds = datasets.find_one({"_id": oid})
        if not ds:
            return jsonify({"error": "Dataset not found"}), 404
        if str(ds.get("user_id")) != str(uid):
            return jsonify({"error": "Dataset does not belong to this agent"}), 403
        update = {
            "phenotype": body.get("phenotype", ds.get("phenotype")),
            "number_of_samples": body.get("number_of_samples"),
            "file_sha256": body.get("file_sha256"),
            "metadata_updated_at": datetime.utcnow(),
        }
        # SNP marker names (header only — not genotype data). Stored for display.
        snp_ids = body.get("snp_ids")
        if snp_ids is not None:
            update["snp_ids"] = snp_ids
            update["n_snps"] = len(snp_ids)
        datasets.update_one({"_id": oid}, {"$set": update})
        return jsonify({"success": True}), 200

    @app.route("/api/agent/jobs/next", methods=["GET"])
    def agent_next_job():
        uid, err = current_agent_uid()
        if err:
            return err
        try:
            wait = min(int(request.args.get("wait", 0)), 50)
        except ValueError:
            wait = 0

        # Recover any jobs this agent previously claimed but never finished.
        requeue_stale_jobs(uid)

        deadline = time.time() + wait
        while True:
            job = jobs.find_one_and_update(
                {"user_id": str(uid), "status": "pending"},
                {"$set": {"status": "in_progress", "claimed_at": datetime.utcnow()},
                 "$inc": {"attempts": 1}},
                sort=[("created_at", 1)],
            )
            if job:
                params = job.get("params", {})
                return jsonify({"job": {
                    "id": job["job_id"],
                    "action": job["action"],
                    "collaboration_uuid": job.get("collaboration_uuid"),
                    "phenotype": params.get("phenotype"),
                    "dataset_id": params.get("dataset_id"),
                    "expected_file_sha256": params.get("expected_file_sha256"),
                    "params": params,
                }}), 200
            if time.time() >= deadline:
                return ("", 204)
            time.sleep(1)

    @app.route("/api/agent/jobs/<job_id>/result", methods=["POST"])
    def agent_job_result(job_id):
        uid, err = current_agent_uid()
        if err:
            return err
        job = jobs.find_one({"job_id": job_id})
        if not job:
            return jsonify({"error": "Job not found"}), 404
        if str(job.get("user_id")) != str(uid):
            return jsonify({"error": "Job does not belong to this agent"}), 403

        # Decode body (gzip-encoded JSON, or plain JSON for failures)
        raw = request.get_data()
        if request.headers.get("Content-Encoding", "").lower() == "gzip":
            try:
                raw = gzip.decompress(raw)
            except Exception:
                return jsonify({"error": "Malformed gzip body"}), 400
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            return jsonify({"error": "Malformed JSON body"}), 400

        if payload.get("status") == "failed":
            jobs.update_one({"job_id": job_id}, {"$set": {
                "status": "failed", "completed_at": datetime.utcnow(),
                "error": str(payload.get("error"))[:2000]}})
            return jsonify({"success": True, "status": "failed"}), 200

        # Egress guard (server side): only known derived outputs are accepted.
        unexpected = set(payload) - ALLOWED_RESULT_KEYS
        if unexpected:
            return jsonify({"error": f"Rejected unexpected result keys: {sorted(unexpected)}"}), 400

        collab_uuid = job.get("collaboration_uuid")
        for key in ALLOWED_RESULT_KEYS:
            if key in payload:
                _store_per_user(collab_uuid, str(uid), key, payload[key])

        jobs.update_one({"job_id": job_id}, {"$set": {
            "status": "complete", "completed_at": datetime.utcnow()}})
        return jsonify({"success": True, "status": "complete"}), 200

    # Expose token minting for use by an authenticated website route in app.py.
    app.config["AGENT_MINT_ENROLLMENT_CODE"] = mint_enrollment_code
    return enqueue_job

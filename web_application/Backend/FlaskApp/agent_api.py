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

import notifications

logger = logging.getLogger("agent_api")

# Outputs the agent is allowed to send back, and where each lands on the
# collaboration document (keyed per user id).
ALLOWED_RESULT_KEYS = {"surviving_samples", "surviving_snps", "pca_coords", "transformed_data", "stats",
                       # Federated Learning: PCA coords reuse "pca_coords"; a training
                       # round returns a "model_update" (weights + sample count + local
                       # metrics). Round-scoped FL results are also stored on the job doc.
                       "model_update",
                       # The agent confirming it wrote the final global model to its own
                       # local models dir. Only after this does the server drop its copy.
                       "model_saved",
                       # Black-box inference: the requester's agent exports the samples to
                       # be classified, the model owner's agent returns predictions only.
                       "samples", "predictions"}

# Results that belong to a single request rather than a collaboration are kept on
# the job document (see _store_job_payload) instead of on a collaboration doc.
JOB_SCOPED_ACTIONS = {"fl_save_model", "export_samples", "classify_samples"}

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

    def _is_oversize(value):
        """True if a value should be offloaded rather than embedded in a document.

        Counts CELLS, not top-level keys: a genotype matrix arrives as
        {sample_id: {snp: value}}, so 200 samples x 3000 markers is only 200
        top-level keys but 600k cells — comfortably over Mongo's 16 MB doc limit
        if stored inline.
        """
        if not isinstance(value, (list, dict)):
            return False
        n = len(value)
        if n > OVERFLOW_THRESHOLD:
            return True
        try:
            first = next(iter(value.values())) if isinstance(value, dict) else (value[0] if value else None)
        except StopIteration:
            return False
        return isinstance(first, (list, dict)) and n * len(first) > OVERFLOW_THRESHOLD

    def _store_job_payload(job_id, payload):
        """Store a request-scoped result on the job document itself.

        Used for work that isn't tied to a collaboration (model delivery, sample
        export, black-box classification). Oversize values are offloaded to
        qc_results and replaced by a {"__ref__": ...} pointer, matching the
        convention already used for per-collaboration results.
        """
        stored = {}
        for key, value in payload.items():
            if _is_oversize(value):
                ref = f"job:{job_id}:{key}:{uuid.uuid4().hex}"
                qc_results.update_one({"ref": ref}, {"$set": {"ref": ref, "value": value}}, upsert=True)
                stored[key] = {"__ref__": ref}
            else:
                stored[key] = value
        return stored

    def _record_model_delivery(collab_uuid, uid):
        """An agent confirmed it saved the global model locally. Once every target
        site has confirmed, drop the server's transient copy."""
        if not collab_uuid:
            return
        collaborations.update_one(
            {"uuid": collab_uuid},
            {"$addToSet": {"fl_state.model_delivered_to": str(uid)}})
        try:
            from fl import pipeline as _fl
            _fl.maybe_clear_delivered_model(collaborations, collab_uuid)
        except Exception:
            logger.exception("Could not finalize model delivery for %s (the server "
                             "keeps its copy, which is the safe outcome)", collab_uuid)

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

    @app.route("/api/agent/me", methods=["GET"])
    def agent_me():
        """Return the account this agent token is scoped to, so the agent can show
        the collaborator which account it is acting as (catches wrong-account setups
        immediately instead of silently polling an empty queue)."""
        uid, err = current_agent_uid()
        if err:
            return err
        user = None
        try:
            user = db["users"].find_one({"_id": ObjectId(uid)}, {"email": 1, "name": 1})
        except Exception:
            user = None
        return jsonify({
            "uid": str(uid),
            "email": (user or {}).get("email"),
            "name": (user or {}).get("name"),
        }), 200

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
        action = str(job.get("action", ""))
        job_scoped = action in JOB_SCOPED_ACTIONS or not collab_uuid

        completion = {"status": "complete", "completed_at": datetime.utcnow()}
        if job_scoped:
            # Request-scoped work (model delivery, sample export, classification)
            # and any job not attached to a collaboration: the result belongs to
            # the job, not to a collaboration document.
            completion["result"] = _store_job_payload(job_id, payload)
        else:
            for key in ALLOWED_RESULT_KEYS:
                if key in payload:
                    _store_per_user(collab_uuid, str(uid), key, payload[key])
            # Federated Learning rounds/projection are round-scoped: keep the full
            # payload on the job doc so the FL orchestrator can collect this exact
            # round's results by job id (per-user collab keys get overwritten each round).
            if action.startswith("fl_"):
                completion["result"] = payload
        jobs.update_one({"job_id": job_id}, {"$set": completion})

        if action == "fl_save_model" and payload.get("model_saved"):
            _record_model_delivery(collab_uuid, uid)

        # A QC/stat result just landed — nudge the next blocker / notify on stage completion.
        if collab_uuid and not job_scoped:
            notifications.notify_progress(db, collab_uuid)
        return jsonify({"success": True, "status": "complete"}), 200

    # ---- agent-authenticated payload fetches -------------------------------
    # Bulk payloads (model weights, samples to classify) are fetched by the agent
    # over its own authenticated channel rather than carried inside job params,
    # so the job queue never holds a second copy of them.

    @app.route("/api/agent/models/<model_id>/weights", methods=["GET"])
    def agent_fetch_model_weights(model_id):
        """The final global model, for a site that participated in training it.

        This is the ONLY route by which model weights leave this server, and it
        is reachable only by an agent token belonging to a participating site.
        No website route serves weights to anyone.
        """
        uid, err = current_agent_uid()
        if err:
            return err
        entry = db["model_repository"].find_one(
            {"model_id": model_id}, {"collaboration_uuid": 1})
        if not entry or not entry.get("collaboration_uuid"):
            return jsonify({"error": "Model not found"}), 404
        collab = collaborations.find_one({"uuid": entry["collaboration_uuid"]}) or {}
        state = collab.get("fl_state") or {}
        targets = {str(t) for t in (state.get("delivery_targets") or [])}
        if str(uid) not in targets:
            return jsonify({"error": "This site did not participate in training this model"}), 403
        weights = state.get("global_model")
        if not weights:
            return jsonify({"error": "Weights are no longer held by the server"}), 410
        cfg = state.get("config") or {}
        return jsonify({
            "model_id": model_id,
            "weights_b64": weights,
            "weights_format": "base64(npz with keys w0..wK = model.state_dict() values, in order)",
            "num_classes": cfg.get("num_classes"),
            "class_names": cfg.get("label_names"),
        }), 200

    @app.route("/api/agent/inference/<request_id>/samples", methods=["GET"])
    def agent_fetch_inference_samples(request_id):
        """Samples a requester asked this agent's owner to classify.

        Readable only by the model owner's agent, only while the request is
        awaiting classification. The server holds these samples transiently and
        deletes them as soon as the predictions come back.
        """
        uid, err = current_agent_uid()
        if err:
            return err
        req = db["inference_requests"].find_one({"request_id": request_id})
        if not req:
            return jsonify({"error": "Request not found"}), 404
        if str(req.get("owner_id")) != str(uid):
            return jsonify({"error": "This request is not addressed to you"}), 403
        if req.get("status") != "classifying":
            return jsonify({"error": f"Request is not awaiting classification (status={req.get('status')})"}), 409
        samples = req.get("samples")
        if isinstance(samples, dict) and "__ref__" in samples:
            doc = qc_results.find_one({"ref": samples["__ref__"]}) or {}
            samples = doc.get("value")
        if not samples:
            return jsonify({"error": "Samples are no longer available"}), 410
        return jsonify({
            "request_id": request_id,
            "model_id": req.get("model_id"),
            "samples": samples,
        }), 200

    # Expose token minting for use by an authenticated website route in app.py.
    app.config["AGENT_MINT_ENROLLMENT_CODE"] = mint_enrollment_code
    # Expose the oversize-value offload helper so app.py can resolve/store the
    # same {"__ref__": ...} pointers the job pipeline writes.
    app.config["AGENT_IS_OVERSIZE"] = _is_oversize
    return enqueue_job

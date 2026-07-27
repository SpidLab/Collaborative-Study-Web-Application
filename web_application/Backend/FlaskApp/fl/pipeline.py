"""High-level FL pipeline driver used by Flask.

Given a collaboration UUID, this module orchestrates the three stages described
in Sub Aim 1.3:

  Stage 1  per-site public-PCA projection with ε-LDP Laplace noise
  Stage 2  pairwise Earth Mover's Distance matrix on those projections
  --- initiator picks a threshold in the UI; backend persists it ---
  Stage 3  Flower-based federated training on the surviving sites (FedAvg)

Stages 1 + 2 run together in a background thread (`run_projection_and_emd`);
stage 3 runs in a separate background thread (`run_training`) after the
initiator applies their threshold via the Flask API. Progress is persisted
on the `collaborations` doc under `fl_state` so the frontend can poll.
"""
from __future__ import annotations

import logging
import os
import threading
import time
import traceback
from datetime import datetime, timezone
from typing import Callable

import numpy as np
import pandas as pd
from pymongo.collection import Collection

from .data import load_site
from .emd import pairwise_emd_matrix, surviving_collaborators
from .fl_config import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_EMD_THRESHOLD,
    DEFAULT_EPSILON,
    DEFAULT_FL_ROUNDS,
    DEFAULT_LEARNING_RATE,
    DEFAULT_LOCAL_EPOCHS,
    DEFAULT_NUM_SITES,
    FL_DATA_DIR,
    SITE_DATA_PATTERN,
    SUPER_POPULATIONS,
)
from .local_fedavg import LocalFedAvgConfig, run_local_fedavg
from .pca_projector import ProjectionArtifacts, load_public_artifacts, project_with_dp

logger = logging.getLogger(__name__)


def _flower_backend():
    """Lazy import of the Flower simulation backend (pulls in Ray)."""
    from .simulation import FlowerRunConfig, run_simulation
    return FlowerRunConfig, run_simulation

STAGE_IDLE = "idle"
STAGE_PROJECTING = "projecting"
STAGE_EMD = "computing_emd"
STAGE_AWAITING_THRESHOLD = "awaiting_threshold"
STAGE_READY_TO_TRAIN = "ready_to_train"
STAGE_TRAINING = "training"
STAGE_COMPLETE = "complete"
STAGE_FAILED = "failed"


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_fl_state(collaborations: Collection, uuid: str, patch: dict) -> None:
    patch = {**patch, "fl_state.updated_at": _utcnow_iso()}
    collaborations.update_one({"uuid": uuid}, {"$set": patch})


def _set_nested(collaborations: Collection, uuid: str, key: str, value) -> None:
    collaborations.update_one({"uuid": uuid}, {"$set": {f"fl_state.{key}": value, "fl_state.updated_at": _utcnow_iso()}})


def _load_collaboration(collaborations: Collection, uuid: str) -> dict:
    doc = collaborations.find_one({"uuid": uuid})
    if not doc:
        raise ValueError(f"Collaboration {uuid} not found.")
    return doc


def assign_sites(doc: dict, num_sites: int = DEFAULT_NUM_SITES) -> dict:
    """Deterministically assign each participant to one synpop site index.

    The initiator always gets site 1; accepted invitees get 2..N (wrapping if
    there are more collaborators than sites). Rejected / pending users are
    skipped so they don't pollute EMD or training.
    """
    assignments: dict[str, int] = {}
    creator_id = str(doc["creator_id"])
    assignments[creator_id] = 1

    slot = 2
    for invited in doc.get("invited_users", []):
        if invited.get("status") != "accepted":
            continue
        uid = str(invited["user_id"])
        if uid == creator_id:
            continue
        assignments[uid] = ((slot - 1) % num_sites) + 1
        slot += 1
    return assignments


def initial_fl_config(
    epsilon: float = DEFAULT_EPSILON,
    emd_threshold: float = DEFAULT_EMD_THRESHOLD,
    num_rounds: int = DEFAULT_FL_ROUNDS,
    local_epochs: int = DEFAULT_LOCAL_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    learning_rate: float = DEFAULT_LEARNING_RATE,
) -> dict:
    return {
        "epsilon": float(epsilon),
        "emd_threshold": float(emd_threshold),
        "num_rounds": int(num_rounds),
        "local_epochs": int(local_epochs),
        "batch_size": int(batch_size),
        "learning_rate": float(learning_rate),
        "num_classes": len(SUPER_POPULATIONS),
        "label_names": SUPER_POPULATIONS,
    }


def bootstrap_fl_state(collaborations: Collection, uuid: str) -> dict:
    """Initialize `fl_state` on a collaboration doc (idempotent)."""
    doc = _load_collaboration(collaborations, uuid)
    existing = doc.get("fl_state")
    if existing:
        return existing

    assignments = assign_sites(doc)
    config = initial_fl_config()
    state = {
        "stage": STAGE_IDLE,
        "config": config,
        "site_assignments": assignments,
        "error": None,
        "started_at": _utcnow_iso(),
        "updated_at": _utcnow_iso(),
    }
    collaborations.update_one({"uuid": uuid}, {"$set": {"fl_state": state}})
    return state


# ---------------------------------------------------------------------------
# Stage 1 + 2: projections and EMD
# ---------------------------------------------------------------------------


def run_projection_and_emd(
    collaborations: Collection,
    uuid: str,
    artifacts_loader: Callable[[], ProjectionArtifacts] = load_public_artifacts,
) -> None:
    """Synchronous: project each site through public PCA, then compute EMD."""
    try:
        doc = _load_collaboration(collaborations, uuid)
        bootstrap_fl_state(collaborations, uuid)
        _set_nested(collaborations, uuid, "stage", STAGE_PROJECTING)

        state = _load_collaboration(collaborations, uuid)["fl_state"]
        cfg = state["config"]
        # Recompute site assignments from the *current* doc: when the
        # collaboration is first created no invitee has accepted yet, so the
        # bootstrap-time snapshot only contains the creator. Acceptances arrive
        # later, so we re-derive the mapping here (and persist it) rather than
        # trusting the stale snapshot.
        assignments: dict[str, int] = assign_sites(doc)
        _set_nested(collaborations, uuid, "site_assignments", assignments)
        if len(assignments) < 2:
            raise ValueError(
                "FL pipeline requires ≥ 2 participants (initiator + 1 accepted invitee)."
            )

        artifacts = artifacts_loader()
        projections: dict[str, np.ndarray] = {}
        site_summary: dict[str, dict] = {}

        for uid, site_idx in sorted(assignments.items(), key=lambda kv: kv[1]):
            data_path = FL_DATA_DIR / SITE_DATA_PATTERN.format(idx=site_idx)
            if not data_path.exists():
                raise FileNotFoundError(
                    f"Site {site_idx} data missing at {data_path}. Run prepare_data.py first."
                )
            df = pd.read_csv(data_path, index_col=0)
            logger.info("Projecting %s (site %d, %d samples)", uid, site_idx, len(df))
            proj = project_with_dp(
                df,
                epsilon=float(cfg["epsilon"]),
                artifacts=artifacts,
                seed=hash(uid) & 0xFFFF,
            )
            projections[uid] = proj
            site_summary[uid] = {
                "site_idx": int(site_idx),
                "num_samples": int(proj.shape[0]),
                "n_components": int(proj.shape[1]),
            }

        _set_nested(collaborations, uuid, "stage", STAGE_EMD)
        _set_nested(collaborations, uuid, "site_summary", site_summary)

        emd = pairwise_emd_matrix(projections)
        emd_payload = {
            "client_order": emd.client_order,
            "matrix": emd.matrix.tolist(),
        }

        creator_id = str(_load_collaboration(collaborations, uuid)["creator_id"])
        survivors_rows = surviving_collaborators(
            creator_id, emd, float(cfg["emd_threshold"])
        )

        _set_fl_state(collaborations, uuid, {
            "fl_state.emd": emd_payload,
            "fl_state.survivors_preview": survivors_rows,
            "fl_state.stage": STAGE_AWAITING_THRESHOLD,
        })
        logger.info(
            "FL projection+EMD complete for %s: %d clients, stage=%s",
            uuid, len(projections), STAGE_AWAITING_THRESHOLD,
        )
    except Exception as exc:
        logger.exception("FL projection/EMD failed for %s", uuid)
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_FAILED,
            "fl_state.error": f"{type(exc).__name__}: {exc}",
            "fl_state.error_trace": traceback.format_exc(limit=10),
        })


# ---------------------------------------------------------------------------
# Stage 3: federated training
# ---------------------------------------------------------------------------


def apply_threshold(
    collaborations: Collection,
    uuid: str,
    threshold: float,
) -> list[dict]:
    doc = _load_collaboration(collaborations, uuid)
    state = doc.get("fl_state") or {}
    emd_payload = state.get("emd")
    if not emd_payload:
        raise ValueError("EMD matrix not yet computed.")
    # Reconstruct a light-weight EMDResult view.
    from .emd import EMDResult
    emd = EMDResult(
        matrix=np.asarray(emd_payload["matrix"], dtype=np.float32),
        client_order=list(emd_payload["client_order"]),
    )
    creator_id = str(doc["creator_id"])
    rows = surviving_collaborators(creator_id, emd, float(threshold))
    _set_fl_state(collaborations, uuid, {
        "fl_state.config.emd_threshold": float(threshold),
        "fl_state.survivors_preview": rows,
        "fl_state.survivors": [r["client_id"] for r in rows if r["survives"]],
        "fl_state.stage": STAGE_READY_TO_TRAIN,
    })
    return rows


def reset_training(collaborations: Collection, uuid: str) -> dict:
    """Recover a collaboration whose training stage is stuck (e.g. the server
    was killed mid-run). Rewinds to 'ready_to_train' if survivors exist, else
    back to 'awaiting_threshold'. Keeps the EMD matrix and survivor set.
    """
    doc = _load_collaboration(collaborations, uuid)
    state = doc.get("fl_state") or {}
    survivors = state.get("survivors") or []
    next_stage = STAGE_READY_TO_TRAIN if len(survivors) >= 2 else STAGE_AWAITING_THRESHOLD
    _set_fl_state(collaborations, uuid, {
        "fl_state.stage": next_stage,
        "fl_state.training_history": [],
        "fl_state.final_metrics": {},
        "fl_state.training_progress": None,
        "fl_state.error": None,
    })
    return {"stage": next_stage, "survivors": survivors}


def run_training(
    collaborations: Collection,
    uuid: str,
    num_snps_override: int | None = None,
) -> None:
    try:
        doc = _load_collaboration(collaborations, uuid)
        state = doc.get("fl_state") or {}
        cfg = state.get("config") or {}
        survivors: list[str] = state.get("survivors") or []
        assignments: dict[str, int] = state.get("site_assignments") or {}

        if len(survivors) < 2:
            raise ValueError(
                "Need ≥ 2 surviving collaborators to run FL training. "
                "Loosen the EMD threshold."
            )

        site_ids = [assignments[uid] for uid in survivors if uid in assignments]
        if len(site_ids) < 2:
            raise ValueError("Survivors have no site assignments.")

        # Number of SNPs equals the width of each site CSV (minus the index col).
        first_site = load_site(site_ids[0])
        num_snps = num_snps_override or first_site.X_train.shape[1]

        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_TRAINING,
            "fl_state.training_started_at": _utcnow_iso(),
            "fl_state.training_heartbeat": _utcnow_iso(),
            "fl_state.training_history": [],
            "fl_state.final_metrics": {},
        })

        num_classes = int(cfg.get("num_classes", len(SUPER_POPULATIONS)))
        num_rounds = int(cfg.get("num_rounds", DEFAULT_FL_ROUNDS))
        local_epochs = int(cfg.get("local_epochs", DEFAULT_LOCAL_EPOCHS))
        batch_size = int(cfg.get("batch_size", DEFAULT_BATCH_SIZE))
        learning_rate = float(cfg.get("learning_rate", DEFAULT_LEARNING_RATE))

        # Default: lightweight single-process FedAvg (low memory, per-round
        # progress). Set FL_USE_FLOWER=true to use the Ray/Flower simulation
        # backend instead (heavier — intended for multi-core machines / the
        # future distributed-pods phase).
        use_flower = os.getenv("FL_USE_FLOWER", "false").lower() == "true"

        if use_flower:
            FlowerRunConfig, run_simulation = _flower_backend()
            run_cfg = FlowerRunConfig(
                site_ids=site_ids,
                num_snps=num_snps,
                num_classes=num_classes,
                num_rounds=num_rounds,
                local_epochs=local_epochs,
                batch_size=batch_size,
                learning_rate=learning_rate,
                device="cpu",
            )
            summary = run_simulation(run_cfg)
        else:
            def _on_round(rnd: int, payload: dict) -> None:
                _set_fl_state(collaborations, uuid, {
                    "fl_state.training_history": payload["round_history"],
                    "fl_state.final_metrics": payload["final_metrics"],
                    "fl_state.training_progress": {
                        "current_round": payload["current_round"],
                        "total_rounds": payload["total_rounds"],
                    },
                    "fl_state.training_heartbeat": _utcnow_iso(),
                })

            local_cfg = LocalFedAvgConfig(
                site_ids=site_ids,
                num_snps=num_snps,
                num_classes=num_classes,
                num_rounds=num_rounds,
                local_epochs=local_epochs,
                batch_size=batch_size,
                learning_rate=learning_rate,
                device="cpu",
            )
            summary = run_local_fedavg(local_cfg, on_round=_on_round)

        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_COMPLETE,
            "fl_state.training_history": summary["round_history"],
            "fl_state.final_metrics": summary["final_metrics"],
            "fl_state.training_completed_at": _utcnow_iso(),
        })
        _maybe_publish(collaborations, uuid)
        logger.info("FL training complete for %s: %s", uuid, summary["final_metrics"])
    except Exception as exc:
        logger.exception("FL training failed for %s", uuid)
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_FAILED,
            "fl_state.error": f"{type(exc).__name__}: {exc}",
            "fl_state.error_trace": traceback.format_exc(limit=10),
        })


# ---------------------------------------------------------------------------
# Agent mode — federate over the Site Agent job queue (Sub Aim 1.3, real FL)
#
# Each participant runs a local Site Agent. The server never sees raw genotypes:
# it enqueues jobs, the agents compute on their own machines, and only PCA
# coordinates (projection) and model weight updates (training rounds) come back.
# ---------------------------------------------------------------------------

FL_PROJECT_ACTION = "fl_project"
FL_TRAIN_ACTION = "fl_train_round"
# How long to wait for every agent to finish a stage before giving up. Generous,
# because agents may be started by collaborators minutes after jobs are enqueued.
AGENT_STAGE_TIMEOUT = int(os.getenv("FL_AGENT_STAGE_TIMEOUT", "3600"))
AGENT_POLL_SECONDS = int(os.getenv("FL_AGENT_POLL_SECONDS", "3"))


def execution_mode() -> str:
    """'agents' (federate over Site Agents) or 'simulation' (in-process, synpop)."""
    return os.getenv("FL_EXECUTION", "agents").strip().lower()


def _fl_participants(collaborations: Collection, datasets: Collection, uuid: str) -> list[dict]:
    """Creator + accepted invitees, each as {uid, phenotype, dataset_id}."""
    doc = _load_collaboration(collaborations, uuid)
    parts: list[dict] = []
    creator_id = str(doc["creator_id"])
    creator_ds_id = doc.get("creator_dataset_id")
    creator_pheno = None
    if creator_ds_id and datasets is not None:
        cds = datasets.find_one({"_id": creator_ds_id}, {"phenotype": 1}) or {}
        creator_pheno = cds.get("phenotype")
    parts.append({
        "uid": creator_id,
        "phenotype": creator_pheno,
        "dataset_id": str(creator_ds_id) if creator_ds_id else None,
    })
    for iu in doc.get("invited_users", []):
        if iu.get("status") != "accepted":
            continue
        uid = str(iu["user_id"])
        if uid == creator_id:
            continue
        parts.append({
            "uid": uid,
            "phenotype": iu.get("phenotype"),
            "dataset_id": str(iu.get("user_dataset_id")) if iu.get("user_dataset_id") else None,
        })
    return parts


def _coords_dict_to_array(coords: dict) -> np.ndarray:
    """{sample_id: {PC_1:.., PC_2:..}} -> [n_samples, n_pcs] sorted by sample id."""
    if not coords:
        return np.zeros((0, 0), dtype=np.float32)
    sample_ids = sorted(coords.keys())
    pc_names = sorted(coords[sample_ids[0]].keys(), key=lambda s: int(s.split("_")[1]))
    return np.array(
        [[float(coords[sid][pc]) for pc in pc_names] for sid in sample_ids],
        dtype=np.float32,
    )


def _resolve_job_result(jobs: Collection, qc_results: Collection | None, job: dict) -> dict:
    """Return a job's FL result payload, resolving any overflow ref."""
    result = job.get("result")
    if isinstance(result, dict) and "__ref__" in result and qc_results is not None:
        ref = qc_results.find_one({"ref": result["__ref__"]})
        return (ref or {}).get("value", {})
    return result or {}


def _wait_for_jobs(
    jobs: Collection,
    collaborations: Collection,
    uuid: str,
    job_id_by_uid: dict[str, str],
    heartbeat_key: str,
    timeout: int = AGENT_STAGE_TIMEOUT,
) -> dict[str, dict]:
    """Block until every job completes or fails (or timeout). Returns {uid: job}.

    Updates a heartbeat + waiting count on fl_state each poll so the UI can show
    live "waiting for N/M agents" progress. Raises on timeout or if any job failed.
    """
    deadline = time.time() + timeout
    all_ids = set(job_id_by_uid.values())
    while True:
        docs = {j["job_id"]: j for j in jobs.find({"job_id": {"$in": list(all_ids)}})}
        done, failed, pending = {}, {}, 0
        for uid, jid in job_id_by_uid.items():
            j = docs.get(jid)
            st = (j or {}).get("status")
            if st == "complete":
                done[uid] = j
            elif st == "failed":
                failed[uid] = (j or {}).get("error", "unknown error")
            else:
                pending += 1
        _set_fl_state(collaborations, uuid, {
            f"fl_state.{heartbeat_key}": _utcnow_iso(),
            "fl_state.agent_progress": {
                "completed": len(done), "failed": len(failed),
                "pending": pending, "total": len(job_id_by_uid),
            },
        })
        if failed:
            raise RuntimeError(
                "Agent job(s) failed: " + "; ".join(f"{u}: {e}" for u, e in failed.items())
            )
        if len(done) == len(job_id_by_uid):
            return done
        if time.time() >= deadline:
            raise TimeoutError(
                f"Timed out after {timeout}s waiting for agents "
                f"({len(done)}/{len(job_id_by_uid)} done). Are all collaborators' agents running?"
            )
        time.sleep(AGENT_POLL_SECONDS)


def run_projection_and_emd_agents(
    collaborations: Collection,
    jobs: Collection,
    enqueue_job,
    datasets: Collection,
    uuid: str,
    qc_results: Collection | None = None,
) -> None:
    """Agent-mode stage 1+2: enqueue fl_project per participant, collect the
    DP-protected PCA coords their agents upload, assemble the EMD matrix."""
    try:
        bootstrap_fl_state(collaborations, uuid)
        state = _load_collaboration(collaborations, uuid)["fl_state"]
        cfg = state["config"]
        participants = _fl_participants(collaborations, datasets, uuid)
        if len(participants) < 2:
            raise ValueError("FL requires ≥ 2 participants (initiator + 1 accepted invitee).")

        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_PROJECTING,
            "fl_state.execution": "agents",
            "fl_state.participants": participants,
        })

        job_id_by_uid = {}
        for p in participants:
            params = {
                "phenotype": p["phenotype"],
                "dataset_id": p["dataset_id"],
                "epsilon": float(cfg["epsilon"]),
                "clip_norm": float(cfg.get("clip_norm", 5.0)),
                "pca_model_name": "fl_pca_model",
            }
            job_id_by_uid[p["uid"]] = enqueue_job(uuid, p["uid"], FL_PROJECT_ACTION, params)
        _set_fl_state(collaborations, uuid, {"fl_state.projection_jobs": job_id_by_uid})
        logger.info("FL(agents) enqueued %d projection jobs for %s", len(job_id_by_uid), uuid)

        done = _wait_for_jobs(jobs, collaborations, uuid, job_id_by_uid, "projection_heartbeat")

        projections, site_summary = {}, {}
        for uid, job in done.items():
            payload = _resolve_job_result(jobs, qc_results, job)
            coords = payload.get("pca_coords") or {}
            arr = _coords_dict_to_array(coords)
            if arr.shape[0] == 0:
                raise ValueError(f"Agent for {uid} returned no projection coordinates.")
            projections[uid] = arr
            site_summary[uid] = {"num_samples": int(arr.shape[0]), "n_components": int(arr.shape[1])}

        _set_fl_state(collaborations, uuid, {"fl_state.stage": STAGE_EMD, "fl_state.site_summary": site_summary})

        emd = pairwise_emd_matrix(projections)
        creator_id = str(_load_collaboration(collaborations, uuid)["creator_id"])
        rows = surviving_collaborators(creator_id, emd, float(cfg["emd_threshold"]))
        _set_fl_state(collaborations, uuid, {
            "fl_state.emd": {"client_order": emd.client_order, "matrix": emd.matrix.tolist()},
            "fl_state.survivors_preview": rows,
            "fl_state.stage": STAGE_AWAITING_THRESHOLD,
        })
        logger.info("FL(agents) projection+EMD complete for %s (%d clients)", uuid, len(projections))
    except Exception as exc:
        logger.exception("FL(agents) projection/EMD failed for %s", uuid)
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_FAILED,
            "fl_state.error": f"{type(exc).__name__}: {exc}",
            "fl_state.error_trace": traceback.format_exc(limit=10),
        })


def _fedavg_encoded(updates: list[tuple[str, int]]) -> str:
    """Weighted-average base64 weight updates by sample count → base64 weights."""
    from .weights import decode_weights, encode_weights

    total = sum(n for _, n in updates) or 1
    decoded = [(decode_weights(w), n) for w, n in updates]
    num_tensors = len(decoded[0][0])
    averaged = []
    for t in range(num_tensors):
        acc = np.zeros_like(decoded[0][0][t], dtype=np.float64)
        for arrays, n in decoded:
            acc += arrays[t].astype(np.float64) * (n / total)
        averaged.append(acc.astype(decoded[0][0][t].dtype))
    return encode_weights(averaged)


def run_training_agents(
    collaborations: Collection,
    jobs: Collection,
    enqueue_job,
    datasets: Collection,
    uuid: str,
    qc_results: Collection | None = None,
) -> None:
    """Agent-mode stage 3: run FedAvg over the surviving agents, one job per round."""
    try:
        doc = _load_collaboration(collaborations, uuid)
        state = doc.get("fl_state") or {}
        cfg = state.get("config") or {}
        survivors = state.get("survivors") or []
        participants = {p["uid"]: p for p in (state.get("participants") or [])}
        if len(survivors) < 2:
            raise ValueError("Need ≥ 2 surviving collaborators. Loosen the EMD threshold.")

        num_classes = int(cfg.get("num_classes", len(SUPER_POPULATIONS)))
        class_names = cfg.get("label_names", SUPER_POPULATIONS)
        num_rounds = int(cfg.get("num_rounds", DEFAULT_FL_ROUNDS))
        local_epochs = int(cfg.get("local_epochs", DEFAULT_LOCAL_EPOCHS))
        batch_size = int(cfg.get("batch_size", DEFAULT_BATCH_SIZE))
        learning_rate = float(cfg.get("learning_rate", DEFAULT_LEARNING_RATE))

        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_TRAINING,
            "fl_state.execution": "agents",
            "fl_state.training_started_at": _utcnow_iso(),
            "fl_state.training_heartbeat": _utcnow_iso(),
            "fl_state.training_history": [],
            "fl_state.final_metrics": {},
        })

        global_weights = None
        round_history: list[dict] = []
        final_metrics: dict = {}

        for rnd in range(1, num_rounds + 1):
            job_id_by_uid = {}
            for uid in survivors:
                p = participants.get(uid, {})
                params = {
                    "phenotype": p.get("phenotype"),
                    "dataset_id": p.get("dataset_id"),
                    "round": rnd,
                    "num_classes": num_classes,
                    "class_names": class_names,
                    "local_epochs": local_epochs,
                    "batch_size": batch_size,
                    "learning_rate": learning_rate,
                    "seed": 42,
                    "global_weights": global_weights,
                }
                job_id_by_uid[uid] = enqueue_job(uuid, uid, FL_TRAIN_ACTION, params)
            _set_fl_state(collaborations, uuid, {
                "fl_state.round_jobs": {"round": rnd, "jobs": job_id_by_uid},
            })
            logger.info("FL(agents) round %d/%d: enqueued %d train jobs", rnd, num_rounds, len(job_id_by_uid))

            done = _wait_for_jobs(jobs, collaborations, uuid, job_id_by_uid, "training_heartbeat")

            updates, val_accs, val_f1s, train_losses = [], [], [], []
            for uid, job in done.items():
                mu = _resolve_job_result(jobs, qc_results, job).get("model_update") or {}
                if "weights" not in mu:
                    raise ValueError(f"Agent {uid} returned no model weights in round {rnd}.")
                n = int(mu.get("num_samples", 1))
                updates.append((mu["weights"], n))
                val_accs.append((float(mu.get("val_accuracy", 0.0)), n))
                val_f1s.append((float(mu.get("val_f1", 0.0)), n))
                train_losses.append((float(mu.get("train_loss", 0.0)), n))

            global_weights = _fedavg_encoded(updates)
            tot = sum(n for _, n in updates) or 1
            agg_loss = sum(v * n for v, n in train_losses) / tot
            agg_acc = sum(v * n for v, n in val_accs) / tot
            agg_f1 = sum(v * n for v, n in val_f1s) / tot

            round_history.append({"round": rnd, "phase": "fit", "train_loss": agg_loss})
            round_history.append({"round": rnd, "phase": "evaluate", "accuracy": agg_acc, "f1_macro": agg_f1})
            final_metrics = {"accuracy": agg_acc, "f1_macro": agg_f1, "train_loss": agg_loss}
            _set_fl_state(collaborations, uuid, {
                "fl_state.training_history": list(round_history),
                "fl_state.final_metrics": dict(final_metrics),
                "fl_state.training_progress": {"current_round": rnd, "total_rounds": num_rounds},
                "fl_state.training_heartbeat": _utcnow_iso(),
            })
            logger.info("FL(agents) round %d aggregate: acc=%.4f f1=%.4f loss=%.4f",
                        rnd, agg_acc, agg_f1, agg_loss)

        # Persist the final global model weights (base64) for later inference/download.
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_COMPLETE,
            "fl_state.final_metrics": final_metrics,
            "fl_state.training_history": round_history,
            "fl_state.global_model": global_weights,
            "fl_state.training_completed_at": _utcnow_iso(),
        })
        _maybe_publish(collaborations, uuid)
        logger.info("FL(agents) training complete for %s: %s", uuid, final_metrics)
    except Exception as exc:
        logger.exception("FL(agents) training failed for %s", uuid)
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_FAILED,
            "fl_state.error": f"{type(exc).__name__}: {exc}",
            "fl_state.error_trace": traceback.format_exc(limit=10),
        })


# ---------------------------------------------------------------------------
# Model Repository — publish a completed global model so any user can view /
# download it (opt-in per collaboration via the `publish_model` flag).
# ---------------------------------------------------------------------------

MODEL_REPO_COLLECTION = "model_repository"


def publish_global_model(collaborations: Collection, uuid: str) -> dict | None:
    """Publish the just-completed global model to the public Model Repository.

    Best-effort and idempotent: no-op unless the collaboration opted in
    (`publish_model`) and training actually completed. Upserts one repository
    entry per collaboration (keyed by collaboration uuid) so re-runs refresh it.
    Only the aggregated model weights + metrics + metadata are stored — never any
    raw genotype data.
    """
    doc = _load_collaboration(collaborations, uuid)
    if not doc.get("publish_model"):
        return None

    state = doc.get("fl_state") or {}
    if state.get("stage") != STAGE_COMPLETE:
        return None

    cfg = state.get("config") or {}
    survivors = state.get("survivors") or []
    weights_b64 = state.get("global_model")  # None in the in-process sim backend

    db = collaborations.database
    creator_id = str(doc.get("creator_id"))
    creator_name = None
    try:
        from bson import ObjectId
        creator = db["users"].find_one({"_id": doc.get("creator_id")}, {"name": 1}) \
            or db["users"].find_one({"_id": ObjectId(creator_id)}, {"name": 1})
        creator_name = (creator or {}).get("name")
    except Exception:
        creator_name = None

    # Public handle for the model. Derived one-way from the collaboration uuid so
    # it is stable (idempotent re-publish) but does NOT expose the uuid itself —
    # the uuid is a capability key for other collaboration endpoints and must not
    # leak into the public repository listing.
    import hashlib
    model_id = "mdl_" + hashlib.sha256(f"fl-model:{uuid}".encode()).hexdigest()[:20]

    class_names = cfg.get("label_names") or list(SUPER_POPULATIONS)
    entry = {
        "model_id": model_id,
        "collaboration_uuid": uuid,  # internal only — never returned by the API
        "name": f"{doc.get('name', 'Federated model')} — global model",
        "collaboration_name": doc.get("name"),
        "created_by_id": creator_id,
        "created_by_name": creator_name or "Unknown",
        "published_at": _utcnow_iso(),
        "task": "Genotype → super-population classification",
        "framework": "PyTorch",
        "architecture": "GenoPhenoCNN (1D CNN + MLP classifier head)",
        "num_classes": int(cfg.get("num_classes", len(class_names))),
        "class_names": class_names,
        "epsilon": cfg.get("epsilon"),
        "num_rounds": cfg.get("num_rounds"),
        "local_epochs": cfg.get("local_epochs"),
        "num_participants": len(survivors),
        "metrics": state.get("final_metrics") or {},
        "training_history": state.get("training_history") or [],
        "has_weights": bool(weights_b64),
        "weights_format": "base64(npz with keys w0..wK = model.state_dict() values, in order)",
        "weights_b64": weights_b64,
        "load_instructions": (
            "from fl.model import build_model, set_model_parameters\n"
            "from fl.weights import decode_weights\n"
            "model = build_model(num_snps=3000, num_classes=NUM_CLASSES)  # num_snps is arbitrary (AdaptiveAvgPool)\n"
            "set_model_parameters(model, decode_weights(WEIGHTS_B64))\n"
            "model.eval()"
        ),
    }
    db[MODEL_REPO_COLLECTION].update_one(
        {"model_id": model_id}, {"$set": entry}, upsert=True
    )
    # Leave a breadcrumb on the collaboration so the FL view can link/download.
    _set_fl_state(collaborations, uuid, {"fl_state.published_model_id": model_id})
    logger.info("Published global model for %s to the Model Repository as %s", uuid, model_id)
    return entry


def _maybe_publish(collaborations: Collection, uuid: str) -> None:
    """Wrapper that never lets a publish error break training completion."""
    try:
        publish_global_model(collaborations, uuid)
    except Exception:
        logger.exception("Model Repository publish failed for %s (non-fatal)", uuid)


# ---------------------------------------------------------------------------
# Thread helpers (fire-and-forget from Flask routes)
# ---------------------------------------------------------------------------


def launch_projection_and_emd(
    collaborations: Collection,
    uuid: str,
    jobs: Collection | None = None,
    enqueue_job=None,
    datasets: Collection | None = None,
    qc_results: Collection | None = None,
) -> str:
    bootstrap_fl_state(collaborations, uuid)
    use_agents = execution_mode() == "agents" and enqueue_job is not None and jobs is not None
    if use_agents:
        target, args = run_projection_and_emd_agents, (
            collaborations, jobs, enqueue_job, datasets, uuid, qc_results)
    else:
        target, args = run_projection_and_emd, (collaborations, uuid)
    thread = threading.Thread(target=target, args=args, name=f"fl-pca-emd-{uuid[:8]}", daemon=True)
    thread.start()
    return thread.name


def launch_training(
    collaborations: Collection,
    uuid: str,
    jobs: Collection | None = None,
    enqueue_job=None,
    datasets: Collection | None = None,
    qc_results: Collection | None = None,
) -> str:
    use_agents = execution_mode() == "agents" and enqueue_job is not None and jobs is not None
    if use_agents:
        target, args = run_training_agents, (
            collaborations, jobs, enqueue_job, datasets, uuid, qc_results)
    else:
        target, args = run_training, (collaborations, uuid)
    thread = threading.Thread(target=target, args=args, name=f"fl-train-{uuid[:8]}", daemon=True)
    thread.start()
    return thread.name

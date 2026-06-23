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
        logger.info("FL training complete for %s: %s", uuid, summary["final_metrics"])
    except Exception as exc:
        logger.exception("FL training failed for %s", uuid)
        _set_fl_state(collaborations, uuid, {
            "fl_state.stage": STAGE_FAILED,
            "fl_state.error": f"{type(exc).__name__}: {exc}",
            "fl_state.error_trace": traceback.format_exc(limit=10),
        })


# ---------------------------------------------------------------------------
# Thread helpers (fire-and-forget from Flask routes)
# ---------------------------------------------------------------------------


def launch_projection_and_emd(collaborations: Collection, uuid: str) -> str:
    bootstrap_fl_state(collaborations, uuid)
    thread = threading.Thread(
        target=run_projection_and_emd,
        args=(collaborations, uuid),
        name=f"fl-pca-emd-{uuid[:8]}",
        daemon=True,
    )
    thread.start()
    return thread.name


def launch_training(collaborations: Collection, uuid: str) -> str:
    thread = threading.Thread(
        target=run_training,
        args=(collaborations, uuid),
        name=f"fl-train-{uuid[:8]}",
        daemon=True,
    )
    thread.start()
    return thread.name

"""Lightweight, single-process FedAvg — laptop-friendly alternative to Flower.

Flower's simulation backend uses Ray, which spawns one OS process per client,
each loading its own PyTorch + model + data copy. On a small machine (e.g. a
MacBook Air) that easily exhausts RAM. This module performs the *same* FedAvg
computation sequentially in one process:

  - one model lives in memory at a time (train_local/evaluate_local rebuild it)
  - each round trains every surviving site against the current global weights,
    then weight-averages the updates by sample count (classic FedAvg)
  - a per-round callback persists progress, so a crash leaves a consistent
    state and the UI sees live updates instead of a single end-of-run dump

The Flower-based path (`simulation.run_simulation`) is kept for the future
"real distributed pods" phase; this is the default for local runs.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

import numpy as np

from .data import SiteData, load_site
from .model import build_model, model_parameters_as_ndarrays
from .trainer import TrainConfig, evaluate_local, train_local

logger = logging.getLogger(__name__)


@dataclass
class LocalFedAvgConfig:
    site_ids: list[int]
    num_snps: int
    num_classes: int
    num_rounds: int = 5
    local_epochs: int = 2
    batch_size: int = 32
    learning_rate: float = 1e-3
    device: str = "cpu"
    seed: int = 42


def _weighted_average(updates: list[tuple[list[np.ndarray], int]]) -> list[np.ndarray]:
    """FedAvg: element-wise mean of client params weighted by #samples."""
    total = sum(n for _, n in updates) or 1
    num_tensors = len(updates[0][0])
    averaged: list[np.ndarray] = []
    for t in range(num_tensors):
        acc = np.zeros_like(updates[0][0][t], dtype=np.float64)
        for params, n in updates:
            acc += params[t].astype(np.float64) * (n / total)
        averaged.append(acc.astype(updates[0][0][t].dtype))
    return averaged


def _aggregate_metrics(per_client: list[dict]) -> dict:
    total = sum(m["num_samples"] for m in per_client) or 1
    out = {}
    for key in ("loss", "accuracy", "f1_macro"):
        out[key] = float(sum(m[key] * m["num_samples"] for m in per_client) / total)
    out["num_samples"] = int(total)
    return out


def run_local_fedavg(
    cfg: LocalFedAvgConfig,
    on_round: Callable[[int, dict], None] | None = None,
) -> dict:
    """Run sequential FedAvg. Returns a summary dict with full round history.

    on_round(round_index, payload) is called after every round's fit+evaluate
    so the caller can persist incremental progress. round_index is 1-based.
    """
    if len(cfg.site_ids) < 2:
        raise ValueError("Federated training requires at least 2 sites.")

    np.random.seed(cfg.seed)

    # Load each surviving site's split once, as float32 to keep memory low.
    sites: list[SiteData] = []
    for sid in cfg.site_ids:
        site = load_site(sid, seed=cfg.seed)
        sites.append(site)
        logger.info(
            "Loaded site %d: train=%d val=%d classes=%d",
            sid, len(site.X_train), len(site.X_val), site.num_classes,
        )

    train_cfg = TrainConfig(
        num_snps=cfg.num_snps,
        num_classes=cfg.num_classes,
        local_epochs=cfg.local_epochs,
        batch_size=cfg.batch_size,
        learning_rate=cfg.learning_rate,
        device=cfg.device,
    )

    # Initialise the global model weights once.
    global_params = model_parameters_as_ndarrays(
        build_model(cfg.num_snps, cfg.num_classes)
    )

    round_history: list[dict] = []
    final_metrics: dict = {}

    for rnd in range(1, cfg.num_rounds + 1):
        # ---- local training on each site ----
        updates: list[tuple[list[np.ndarray], int]] = []
        train_losses = []
        for site in sites:
            params, loss, n = train_local(global_params, site.X_train, site.y_train, train_cfg)
            updates.append((params, n))
            train_losses.append((loss, n))
            logger.info("  round %d site %s: train_loss=%.4f n=%d", rnd, site.site_id, loss, n)

        # ---- FedAvg aggregation ----
        global_params = _weighted_average(updates)
        total_train_n = sum(n for _, n in train_losses) or 1
        agg_train_loss = float(sum(l * n for l, n in train_losses) / total_train_n)

        # ---- evaluate aggregated model on each site's val split ----
        per_client = [
            evaluate_local(global_params, site.X_val, site.y_val, train_cfg)
            for site in sites
        ]
        agg_eval = _aggregate_metrics(per_client)

        fit_row = {"round": rnd, "phase": "fit", "train_loss": agg_train_loss}
        eval_row = {
            "round": rnd, "phase": "evaluate",
            "loss": agg_eval["loss"],
            "accuracy": agg_eval["accuracy"],
            "f1_macro": agg_eval["f1_macro"],
        }
        round_history.append(fit_row)
        round_history.append(eval_row)
        final_metrics = {
            "accuracy": agg_eval["accuracy"],
            "f1_macro": agg_eval["f1_macro"],
            "train_loss": agg_train_loss,
            "loss": agg_eval["loss"],
        }
        logger.info(
            "  round %d aggregate: acc=%.4f f1=%.4f loss=%.4f",
            rnd, agg_eval["accuracy"], agg_eval["f1_macro"], agg_eval["loss"],
        )
        if on_round is not None:
            on_round(rnd, {
                "round_history": list(round_history),
                "final_metrics": dict(final_metrics),
                "current_round": rnd,
                "total_rounds": cfg.num_rounds,
            })

    return {
        "num_rounds": cfg.num_rounds,
        "num_clients": len(cfg.site_ids),
        "site_ids": cfg.site_ids,
        "round_history": round_history,
        "final_metrics": final_metrics,
    }

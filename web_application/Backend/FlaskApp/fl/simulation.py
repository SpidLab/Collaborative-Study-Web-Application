"""Flower-based federated-training driver (simulation mode).

This runs the whole Flower server + N clients in a single Python process using
`flwr.simulation.start_simulation`. It is what the orchestrator invokes for the
initial "Federated Learning" experiment. The same client class is reused
verbatim by real per-pod runs — only the driver changes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import flwr as fl
import numpy as np
import torch
from flwr.common import Context, EvaluateIns, EvaluateRes, FitIns, FitRes, Metrics, Parameters, Scalar
from flwr.common import ndarrays_to_parameters, parameters_to_ndarrays
from flwr.server.strategy import FedAvg

from .data import load_site
from .model import build_model, model_parameters_as_ndarrays
from .trainer import TrainConfig, evaluate_local, train_local

logger = logging.getLogger(__name__)


@dataclass
class FlowerRunConfig:
    site_ids: list[int]                   # list of synpop site indices to include
    num_snps: int                         # inferred from first site at driver level
    num_classes: int
    num_rounds: int = 5
    local_epochs: int = 2
    batch_size: int = 32
    learning_rate: float = 1e-3
    device: str = "cpu"
    seed: int = 42
    round_history: list[dict] = field(default_factory=list)


class GenoPhenoFlowerClient(fl.client.NumPyClient):
    """Flower client bound to one site's local split."""

    def __init__(self, site_idx: int, cfg: FlowerRunConfig):
        self.site_idx = site_idx
        self.cfg = cfg
        self.site = load_site(site_idx, seed=cfg.seed)
        self.train_cfg = TrainConfig(
            num_snps=cfg.num_snps,
            num_classes=cfg.num_classes,
            local_epochs=cfg.local_epochs,
            batch_size=cfg.batch_size,
            learning_rate=cfg.learning_rate,
            device=cfg.device,
        )

    def get_parameters(self, config):
        model = build_model(self.cfg.num_snps, self.cfg.num_classes)
        return model_parameters_as_ndarrays(model)

    def fit(self, parameters, config):
        new_params, loss, n = train_local(
            parameters, self.site.X_train, self.site.y_train, self.train_cfg
        )
        return new_params, n, {"train_loss": float(loss), "site_id": self.site.site_id}

    def evaluate(self, parameters, config):
        metrics = evaluate_local(
            parameters, self.site.X_val, self.site.y_val, self.train_cfg
        )
        return float(metrics["loss"]), int(metrics["num_samples"]), {
            "accuracy": float(metrics["accuracy"]),
            "f1_macro": float(metrics["f1_macro"]),
            "site_id": self.site.site_id,
        }


def _weighted_avg(metrics: list[tuple[int, Metrics]]) -> Metrics:
    total = sum(n for n, _ in metrics) or 1
    out: dict[str, Scalar] = {}
    for key in ("accuracy", "f1_macro", "train_loss"):
        vals = [(n, float(m[key])) for n, m in metrics if key in m]
        if vals:
            out[key] = sum(n * v for n, v in vals) / sum(n for n, _ in vals)
    return out


def run_simulation(cfg: FlowerRunConfig) -> dict:
    """Run the simulation and return a summary dict with per-round metrics."""
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    num_clients = len(cfg.site_ids)
    if num_clients < 2:
        raise ValueError("Federated training requires at least 2 sites.")

    initial_params = model_parameters_as_ndarrays(
        build_model(cfg.num_snps, cfg.num_classes)
    )

    def client_fn(context: Context) -> fl.client.Client:
        partition_id = int(context.node_config.get("partition-id", 0))
        site_idx = cfg.site_ids[partition_id]
        return GenoPhenoFlowerClient(site_idx, cfg).to_client()

    round_history: list[dict] = []

    def fit_metrics_agg(metrics: list[tuple[int, Metrics]]) -> Metrics:
        agg = _weighted_avg(metrics)
        round_history.append({"phase": "fit", **agg})
        return agg

    def eval_metrics_agg(metrics: list[tuple[int, Metrics]]) -> Metrics:
        agg = _weighted_avg(metrics)
        round_history.append({"phase": "evaluate", **agg})
        return agg

    strategy = FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=num_clients,
        min_evaluate_clients=num_clients,
        min_available_clients=num_clients,
        initial_parameters=ndarrays_to_parameters(initial_params),
        fit_metrics_aggregation_fn=fit_metrics_agg,
        evaluate_metrics_aggregation_fn=eval_metrics_agg,
    )

    history = fl.simulation.start_simulation(
        client_fn=client_fn,
        num_clients=num_clients,
        config=fl.server.ServerConfig(num_rounds=cfg.num_rounds),
        strategy=strategy,
        client_resources={"num_cpus": 1, "num_gpus": 0.0},
    )

    last_eval = {}
    if history.metrics_distributed:
        for k, series in history.metrics_distributed.items():
            if series:
                last_eval[k] = float(series[-1][1])
    cfg.round_history = round_history
    return {
        "num_rounds": cfg.num_rounds,
        "num_clients": num_clients,
        "site_ids": cfg.site_ids,
        "round_history": round_history,
        "final_metrics": last_eval,
    }

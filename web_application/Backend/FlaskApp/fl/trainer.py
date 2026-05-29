"""Local training/eval loops used by the Flower client.

Kept framework-agnostic so we can reuse them from simulation mode *and* from
real per-pod client runs.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import torch
from sklearn.metrics import accuracy_score, f1_score

from .data import batch_iter
from .model import (
    build_model,
    loss_for,
    model_parameters_as_ndarrays,
    predict_from_logits,
    prepare_targets,
    set_model_parameters,
)

logger = logging.getLogger(__name__)


@dataclass
class TrainConfig:
    num_snps: int
    num_classes: int
    local_epochs: int = 2
    batch_size: int = 32
    learning_rate: float = 1e-3
    device: str = "cpu"


def train_local(
    initial_parameters: list[np.ndarray],
    X: np.ndarray,
    y: np.ndarray,
    cfg: TrainConfig,
) -> tuple[list[np.ndarray], float, int]:
    device = torch.device(cfg.device)
    model = build_model(cfg.num_snps, cfg.num_classes).to(device)
    set_model_parameters(model, initial_parameters)
    model.train()

    optimizer = torch.optim.Adam(model.parameters(), lr=cfg.learning_rate)
    loss_fn = loss_for(cfg.num_classes)

    total_loss = 0.0
    total_samples = 0
    for epoch in range(cfg.local_epochs):
        for xb, yb in batch_iter(X, y, cfg.batch_size, shuffle=True, seed=epoch):
            xb_t = torch.as_tensor(xb, dtype=torch.float32, device=device)
            yb_t = prepare_targets(yb, cfg.num_classes).to(device)
            optimizer.zero_grad()
            logits = model(xb_t)
            loss = loss_fn(logits, yb_t)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.item()) * len(xb)
            total_samples += len(xb)

    avg_loss = total_loss / max(total_samples, 1)
    return model_parameters_as_ndarrays(model), avg_loss, total_samples


def evaluate_local(
    parameters: list[np.ndarray],
    X: np.ndarray,
    y: np.ndarray,
    cfg: TrainConfig,
) -> dict:
    device = torch.device(cfg.device)
    model = build_model(cfg.num_snps, cfg.num_classes).to(device)
    set_model_parameters(model, parameters)
    model.eval()
    loss_fn = loss_for(cfg.num_classes)

    preds = []
    losses = []
    targets = []
    with torch.no_grad():
        for xb, yb in batch_iter(X, y, cfg.batch_size, shuffle=False):
            xb_t = torch.as_tensor(xb, dtype=torch.float32, device=device)
            yb_t = prepare_targets(yb, cfg.num_classes).to(device)
            logits = model(xb_t)
            loss = loss_fn(logits, yb_t)
            losses.append(float(loss.item()) * len(xb))
            preds.append(predict_from_logits(logits, cfg.num_classes))
            targets.append(yb)
    y_pred = np.concatenate(preds) if preds else np.array([])
    y_true = np.concatenate(targets) if targets else np.array([])
    total_samples = int(len(y_true))
    avg_loss = float(sum(losses) / max(total_samples, 1))
    if total_samples == 0:
        return {"loss": avg_loss, "accuracy": 0.0, "f1_macro": 0.0, "num_samples": 0}

    acc = float(accuracy_score(y_true, y_pred))
    average = "binary" if cfg.num_classes == 2 else "macro"
    f1 = float(f1_score(y_true, y_pred, average=average, zero_division=0))
    return {"loss": avg_loss, "accuracy": acc, "f1_macro": f1, "num_samples": total_samples}

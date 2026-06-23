"""Genotype → phenotype model: 1D CNN + MLP head.

The architecture is parametric on `num_classes` so the same module handles
binary disease prediction (sigmoid + BCE) and multi-class ancestry/phenotype
prediction (softmax + cross-entropy) with no code duplication. Sub Aim 2.1 of
the proposal calls for a 1D CNN over the genotype sequence; we keep attention
as a future extension behind the same interface.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class ModelConfig:
    num_snps: int
    num_classes: int
    channels: int = 32
    kernel_size: int = 7
    hidden: int = 128
    dropout: float = 0.2


class GenoPhenoCNN(nn.Module):
    """1D CNN over SNP positions (values 0/1/2) + MLP classifier head."""

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        out_dim = 1 if cfg.num_classes == 2 else cfg.num_classes

        # Early MaxPool downsamples the (potentially ~10k-long) SNP axis before
        # the second conv, keeping activation memory low enough to train on a
        # laptop without blowing up RAM.
        self.conv = nn.Sequential(
            nn.Conv1d(1, cfg.channels, kernel_size=cfg.kernel_size, padding=cfg.kernel_size // 2),
            nn.BatchNorm1d(cfg.channels),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(kernel_size=4),
            nn.Conv1d(cfg.channels, cfg.channels * 2, kernel_size=cfg.kernel_size, padding=cfg.kernel_size // 2),
            nn.BatchNorm1d(cfg.channels * 2),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(cfg.channels * 2, cfg.hidden),
            nn.ReLU(inplace=True),
            nn.Dropout(cfg.dropout),
            nn.Linear(cfg.hidden, out_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, num_snps] → [B, 1, num_snps]
        if x.dim() == 2:
            x = x.unsqueeze(1)
        features = self.conv(x)
        return self.head(features)


def build_model(num_snps: int, num_classes: int) -> GenoPhenoCNN:
    return GenoPhenoCNN(ModelConfig(num_snps=num_snps, num_classes=num_classes))


def loss_for(num_classes: int) -> nn.Module:
    return nn.BCEWithLogitsLoss() if num_classes == 2 else nn.CrossEntropyLoss()


def prepare_targets(y: np.ndarray, num_classes: int) -> torch.Tensor:
    if num_classes == 2:
        return torch.as_tensor(y, dtype=torch.float32).view(-1, 1)
    return torch.as_tensor(y, dtype=torch.long)


def predict_from_logits(logits: torch.Tensor, num_classes: int) -> np.ndarray:
    if num_classes == 2:
        probs = torch.sigmoid(logits).detach().cpu().numpy().ravel()
        return (probs >= 0.5).astype(np.int64)
    return logits.argmax(dim=1).detach().cpu().numpy()


def model_parameters_as_ndarrays(model: nn.Module) -> list[np.ndarray]:
    return [p.detach().cpu().numpy() for p in model.state_dict().values()]


def set_model_parameters(model: nn.Module, parameters: list[np.ndarray]) -> None:
    state_dict = model.state_dict()
    keys = list(state_dict.keys())
    if len(keys) != len(parameters):
        raise ValueError(
            f"Parameter count mismatch: model={len(keys)} vs incoming={len(parameters)}"
        )
    new_state = {k: torch.as_tensor(v) for k, v in zip(keys, parameters)}
    model.load_state_dict(new_state, strict=True)

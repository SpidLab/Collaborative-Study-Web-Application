"""Apply the public PCA to a site's genotype matrix and add LDP noise.

This implements the first half of Sub Aim 1.3: clients project their local
genotype matrix into a shared PC space and add ε-LDP-calibrated Laplace noise
before the projections ever leave the site. The noisy projections are what the
server sees for similarity (EMD) assessment — never the raw genotypes.
"""
from __future__ import annotations

import json
import logging
import pickle
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .fl_config import (
    PUBLIC_FEATURE_LIST_PATH,
    PUBLIC_PCA_PATH,
    PUBLIC_SCALER_PATH,
)

logger = logging.getLogger(__name__)


@dataclass
class ProjectionArtifacts:
    scaler: object
    pca: object
    feature_list: list[str]


def load_public_artifacts(
    pca_path: Path = PUBLIC_PCA_PATH,
    scaler_path: Path = PUBLIC_SCALER_PATH,
    feature_list_path: Path = PUBLIC_FEATURE_LIST_PATH,
) -> ProjectionArtifacts:
    with open(pca_path, "rb") as fp:
        pca = pickle.load(fp)
    with open(scaler_path, "rb") as fp:
        scaler = pickle.load(fp)
    with open(feature_list_path) as fp:
        feature_list = json.load(fp)
    return ProjectionArtifacts(scaler=scaler, pca=pca, feature_list=feature_list)


def align_columns(df: pd.DataFrame, feature_list: list[str]) -> pd.DataFrame:
    """Reindex a site's SNP matrix to the public PCA's feature list.

    Missing SNPs are filled with the per-column mean (0 under StandardScaler
    assumptions); extra SNPs are dropped silently. This is the minimal
    assumption under which cross-site PCA projection is defined.
    """
    overlap = [c for c in feature_list if c in df.columns]
    missing = len(feature_list) - len(overlap)
    if missing:
        logger.warning(
            "Site is missing %d/%d PCA features; filling with column mean (0 after scaling).",
            missing,
            len(feature_list),
        )
    aligned = df.reindex(columns=feature_list)
    if aligned.isna().any().any():
        # Fill NaN with column-wise mean computed from the site itself as a
        # graceful fallback; scaler will then normalize relative to public fit.
        col_mean = aligned.mean(axis=0).fillna(0.0)
        aligned = aligned.fillna(col_mean).fillna(0.0)
    return aligned


def project(
    df: pd.DataFrame,
    artifacts: ProjectionArtifacts,
) -> np.ndarray:
    aligned = align_columns(df, artifacts.feature_list)
    scaled = artifacts.scaler.transform(aligned.values.astype(np.float32))
    return artifacts.pca.transform(scaled)


def add_ldp_laplace_noise(
    projections: np.ndarray,
    epsilon: float,
    clip_norm: float = 5.0,
    rng: np.random.Generator | None = None,
) -> np.ndarray:
    """Add per-sample Laplace noise calibrated for row-level ε-LDP.

    Each sample's projection vector is first clipped to L1 norm `clip_norm`
    (bounded sensitivity), then Laplace(0, clip_norm/ε) noise is added per
    component. This is the standard local DP mechanism when the queried
    statistic is a bounded vector, as used throughout the FL-pp stack.
    """
    if epsilon <= 0:
        raise ValueError(f"epsilon must be > 0 (got {epsilon}).")
    rng = rng or np.random.default_rng()
    clipped = projections.copy()
    l1 = np.abs(clipped).sum(axis=1, keepdims=True)
    scale_factor = np.where(l1 > clip_norm, clip_norm / np.maximum(l1, 1e-12), 1.0)
    clipped = clipped * scale_factor
    scale = clip_norm / epsilon
    noise = rng.laplace(loc=0.0, scale=scale, size=clipped.shape)
    return clipped + noise


def project_with_dp(
    df: pd.DataFrame,
    epsilon: float,
    artifacts: ProjectionArtifacts | None = None,
    clip_norm: float = 5.0,
    seed: int | None = None,
) -> np.ndarray:
    """One-shot helper: load artifacts (if not given), project, add DP noise."""
    arts = artifacts or load_public_artifacts()
    projections = project(df, arts)
    rng = np.random.default_rng(seed)
    return add_ldp_laplace_noise(projections, epsilon=epsilon, clip_norm=clip_norm, rng=rng)

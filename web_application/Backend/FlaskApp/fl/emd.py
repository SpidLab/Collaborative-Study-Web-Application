"""Pairwise Earth Mover's Distance (EMD) on DP-projected PCA point clouds.

Full multivariate optimal transport is O(n^3 log n) and overkill when the only
thing we need is a scalar "are these two distributions close?" per pair. We use
the proposal's approach: treat each sample's PC coordinates as a point cloud
per client, then compute the **sliced Wasserstein distance** — project each
point cloud onto a set of random unit directions and average 1-D Wasserstein
distances (which is `scipy.stats.wasserstein_distance`, a.k.a. 1-D EMD).

This is:
  * Proper optimal transport in 1-D for each slice.
  * Bounded variance via averaging over K directions.
  * Linear in the number of samples, quadratic-free over pairs.
  * Metric on distributions — used throughout the federated / domain-adaptation
    literature as a tractable proxy for full Wasserstein EMD.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from scipy.stats import wasserstein_distance

logger = logging.getLogger(__name__)


@dataclass
class EMDResult:
    matrix: np.ndarray  # N x N symmetric
    client_order: list[str]


def sliced_wasserstein_distance(
    a: np.ndarray,
    b: np.ndarray,
    n_projections: int = 64,
    seed: int = 42,
) -> float:
    """Sliced 1-D Wasserstein distance averaged over `n_projections` directions."""
    if a.ndim != 2 or b.ndim != 2:
        raise ValueError("Inputs must be 2-D [num_samples, dim].")
    if a.shape[1] != b.shape[1]:
        raise ValueError(
            f"Dimensionality mismatch: {a.shape[1]} vs {b.shape[1]}"
        )
    rng = np.random.default_rng(seed)
    dim = a.shape[1]
    directions = rng.normal(size=(n_projections, dim)).astype(np.float32)
    directions /= np.linalg.norm(directions, axis=1, keepdims=True) + 1e-12

    distances = []
    for direction in directions:
        a_proj = a @ direction
        b_proj = b @ direction
        distances.append(wasserstein_distance(a_proj, b_proj))
    return float(np.mean(distances))


def pairwise_emd_matrix(
    projections_by_client: dict[str, np.ndarray],
    n_projections: int = 64,
    seed: int = 42,
) -> EMDResult:
    client_order = sorted(projections_by_client.keys())
    n = len(client_order)
    matrix = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(i + 1, n):
            a = projections_by_client[client_order[i]]
            b = projections_by_client[client_order[j]]
            d = sliced_wasserstein_distance(a, b, n_projections=n_projections, seed=seed + i * n + j)
            matrix[i, j] = d
            matrix[j, i] = d
    return EMDResult(matrix=matrix, client_order=client_order)


def surviving_collaborators(
    initiator_id: str,
    emd: EMDResult,
    threshold: float,
) -> list[dict]:
    """Return collaborators whose EMD to the initiator is <= threshold.

    Output rows: {client_id, emd, survives}. The initiator is always included
    with emd=0 and survives=True so the UI can render a complete row.
    """
    if initiator_id not in emd.client_order:
        raise ValueError(f"Initiator {initiator_id} not in EMD matrix.")
    i = emd.client_order.index(initiator_id)
    rows = []
    for j, cid in enumerate(emd.client_order):
        dist = 0.0 if j == i else float(emd.matrix[i, j])
        rows.append({
            "client_id": cid,
            "emd": dist,
            "survives": bool(dist <= threshold),
        })
    return rows

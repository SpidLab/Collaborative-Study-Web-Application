"""One-off data prep: split synpop into non-IID sites and train the public PCA.

Run this once (or whenever you want to regenerate the demo data):

    python -m web_application.Backend.FlaskApp.fl.prepare_data \
        --synpop /Users/.../FL-pp/dataset/synpop_snps.csv \
        --labels /Users/.../FL-pp/dataset/synpop_labels.csv

Outputs under `datasets/fl_synpop/`:
  - public_pca_reference.csv / public_pca_reference_labels.csv
  - site_{1..5}_data.csv / site_{1..5}_labels.csv
  - split_manifest.json

And under `web_application/Backend/FlaskApp/fl/models/`:
  - public_pca.pkl, public_scaler.pkl, public_feature_list.json
"""
from __future__ import annotations

import argparse
import json
import logging
import pickle
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from .fl_config import (
    DEFAULT_NUM_SITES,
    DEFAULT_PCA_COMPONENTS,
    DEFAULT_REFERENCE_FRACTION,
    FL_DATA_DIR,
    FL_MODELS_DIR,
    PUBLIC_FEATURE_LIST_PATH,
    PUBLIC_PCA_PATH,
    PUBLIC_SCALER_PATH,
    REFERENCE_DATA_PATH,
    REFERENCE_LABELS_PATH,
    SITE_DATA_PATTERN,
    SITE_LABELS_PATTERN,
    SPLIT_MANIFEST_PATH,
    SUPER_POPULATION,
    SUPER_POPULATIONS,
)

logger = logging.getLogger(__name__)

# Non-IID mixture recipes — share of each super-population at each site.
# Deliberately varied so EMD produces a spread of distances: sites 1–3 are
# population-dominant (far from each other), site 4 blends under-represented
# groups, site 5 is a uniform mix (close to most others).
SITE_MIXTURES = [
    {"EUR": 0.65, "AFR": 0.10, "EAS": 0.10, "SAS": 0.10, "AMR": 0.05},
    {"EUR": 0.05, "AFR": 0.70, "EAS": 0.10, "SAS": 0.10, "AMR": 0.05},
    {"EUR": 0.10, "AFR": 0.10, "EAS": 0.65, "SAS": 0.10, "AMR": 0.05},
    {"EUR": 0.05, "AFR": 0.05, "EAS": 0.10, "SAS": 0.45, "AMR": 0.35},
    {"EUR": 0.20, "AFR": 0.20, "EAS": 0.20, "SAS": 0.20, "AMR": 0.20},
]


def _strip_quote(value: str) -> str:
    return value.strip().strip('"').strip("'")


def _load_synpop(snps_path: Path, labels_path: Path) -> tuple[pd.DataFrame, pd.Series]:
    logger.info("Loading synpop SNPs from %s", snps_path)
    # The synpop CSV has NO index column — every column is a SNP and every row is
    # an individual. Read with a default RangeIndex, then assign a UNIQUE synthetic
    # sample_id per individual. (Using index_col=0 here would silently consume the
    # first SNP as a non-unique "index" of genotype values 0/1/2 — which collapses
    # per-sample keying downstream in the agent path.)
    snps = pd.read_csv(snps_path)
    snps.index = [f"ind_{i}" for i in range(len(snps))]
    snps.index.name = "sample_id"
    logger.info("Loading synpop labels from %s", labels_path)
    labels_raw = pd.read_csv(labels_path)
    label_col = labels_raw.columns[0]
    labels = labels_raw[label_col].map(_strip_quote)
    if len(snps) != len(labels):
        raise ValueError(
            f"SNP row count ({len(snps)}) != label count ({len(labels)})"
        )
    labels.index = snps.index
    return snps, labels


def _assign_super_populations(labels: pd.Series) -> pd.Series:
    def _resolve(label: str) -> str | None:
        if label in SUPER_POPULATION:
            return SUPER_POPULATION[label]
        # Try exact match against short codes (EUR/AFR/...).
        if label in SUPER_POPULATIONS:
            return label
        return None

    mapped = labels.map(_resolve)
    missing = labels[mapped.isna()].unique().tolist()
    if missing:
        raise ValueError(
            f"{len(missing)} population labels are unmapped: {missing[:5]}..."
        )
    return mapped


def _stratified_split(
    index_by_group: dict[str, list[int]],
    reference_fraction: float,
    rng: random.Random,
) -> tuple[list[int], dict[str, list[int]]]:
    """Hold out a stratified share per super-population for the public PCA."""
    reference_indices: list[int] = []
    remaining: dict[str, list[int]] = {}
    for group, idxs in index_by_group.items():
        shuffled = idxs[:]
        rng.shuffle(shuffled)
        n_ref = max(1, int(len(shuffled) * reference_fraction))
        reference_indices.extend(shuffled[:n_ref])
        remaining[group] = shuffled[n_ref:]
    return reference_indices, remaining


def _build_site_indices(
    pool_by_group: dict[str, list[int]],
    num_sites: int,
    mixtures: list[dict[str, float]],
    rng: random.Random,
) -> list[list[int]]:
    """Sample indices for each site from the remaining pool using mixture ratios.

    We compute per-site target sizes so each site ends up with roughly the same
    total count; then we draw without replacement from each super-population's
    pool proportional to the mixture weights.
    """
    total_pool = sum(len(v) for v in pool_by_group.values())
    per_site_total = total_pool // num_sites

    # Copies of the pools so draws are independent per site.
    work_pools = {g: v[:] for g, v in pool_by_group.items()}
    for g in work_pools:
        rng.shuffle(work_pools[g])

    site_indices: list[list[int]] = [[] for _ in range(num_sites)]
    for site_idx in range(num_sites):
        mixture = mixtures[site_idx]
        for group, weight in mixture.items():
            want = int(round(per_site_total * weight))
            pool = work_pools.get(group, [])
            take = pool[:want]
            work_pools[group] = pool[want:]
            site_indices[site_idx].extend(take)
        rng.shuffle(site_indices[site_idx])
    return site_indices


def _train_public_pca(
    reference_df: pd.DataFrame,
    n_components: int,
) -> tuple[StandardScaler, PCA]:
    logger.info(
        "Training public PCA on %d reference samples × %d SNPs (n_components=%d)",
        reference_df.shape[0],
        reference_df.shape[1],
        n_components,
    )
    scaler = StandardScaler()
    scaled = scaler.fit_transform(reference_df.values.astype(np.float32))
    pca = PCA(n_components=n_components, random_state=42)
    pca.fit(scaled)
    logger.info(
        "PCA trained. Explained variance ratio (first 5): %s (total=%.4f)",
        np.round(pca.explained_variance_ratio_[:5], 4),
        float(pca.explained_variance_ratio_.sum()),
    )
    return scaler, pca


def prepare(
    synpop_path: Path,
    labels_path: Path,
    num_sites: int = DEFAULT_NUM_SITES,
    reference_fraction: float = DEFAULT_REFERENCE_FRACTION,
    n_components: int = DEFAULT_PCA_COMPONENTS,
    seed: int = 42,
) -> dict:
    FL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    FL_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)
    snps, labels = _load_synpop(synpop_path, labels_path)
    super_pops = _assign_super_populations(labels)

    by_group: dict[str, list[int]] = defaultdict(list)
    for i, pop in enumerate(super_pops):
        by_group[pop].append(i)

    reference_idx, remaining = _stratified_split(by_group, reference_fraction, rng)
    mixtures = SITE_MIXTURES[:num_sites]
    site_indices = _build_site_indices(remaining, num_sites, mixtures, rng)

    # Persist the reference data (used to train the public PCA).
    ref_df = snps.iloc[reference_idx]
    ref_labels = pd.DataFrame({
        "sample_id": ref_df.index.astype(str),
        "population": labels.iloc[reference_idx].values,
        "super_population": super_pops.iloc[reference_idx].values,
    })
    ref_df.to_csv(REFERENCE_DATA_PATH)
    ref_labels.to_csv(REFERENCE_LABELS_PATH, index=False)
    logger.info("Wrote reference data (%d rows) to %s", len(ref_df), REFERENCE_DATA_PATH)

    # Persist each per-site split.
    site_meta = []
    for site_idx, idxs in enumerate(site_indices, start=1):
        site_df = snps.iloc[idxs]
        site_labels = pd.DataFrame({
            "sample_id": site_df.index.astype(str),
            "population": labels.iloc[idxs].values,
            "super_population": super_pops.iloc[idxs].values,
        })
        data_path = FL_DATA_DIR / SITE_DATA_PATTERN.format(idx=site_idx)
        labels_out = FL_DATA_DIR / SITE_LABELS_PATTERN.format(idx=site_idx)
        site_df.to_csv(data_path)
        site_labels.to_csv(labels_out, index=False)
        counts = site_labels["super_population"].value_counts().to_dict()
        site_meta.append({
            "site": site_idx,
            "num_samples": int(len(site_df)),
            "super_pop_counts": {k: int(v) for k, v in counts.items()},
            "data_path": str(data_path),
            "labels_path": str(labels_out),
        })
        logger.info("Site %d: %d samples, mix=%s", site_idx, len(site_df), counts)

    # Train public PCA on the reference data (SNP columns only).
    scaler, pca = _train_public_pca(ref_df, n_components)
    with open(PUBLIC_PCA_PATH, "wb") as fp:
        pickle.dump(pca, fp)
    with open(PUBLIC_SCALER_PATH, "wb") as fp:
        pickle.dump(scaler, fp)
    with open(PUBLIC_FEATURE_LIST_PATH, "w") as fp:
        json.dump(list(snps.columns), fp)

    manifest = {
        "synpop_source": str(synpop_path),
        "num_sites": num_sites,
        "reference_fraction": reference_fraction,
        "n_components": n_components,
        "seed": seed,
        "reference_samples": int(len(ref_df)),
        "super_populations": SUPER_POPULATIONS,
        "public_pca_path": str(PUBLIC_PCA_PATH),
        "public_scaler_path": str(PUBLIC_SCALER_PATH),
        "public_feature_list_path": str(PUBLIC_FEATURE_LIST_PATH),
        "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
        "sites": site_meta,
    }
    with open(SPLIT_MANIFEST_PATH, "w") as fp:
        json.dump(manifest, fp, indent=2)
    logger.info("Wrote split manifest to %s", SPLIT_MANIFEST_PATH)

    return manifest


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--synpop",
        type=Path,
        required=True,
        help="Path to synpop_snps.csv (rows = individuals, cols = SNPs).",
    )
    parser.add_argument(
        "--labels",
        type=Path,
        required=True,
        help="Path to synpop_labels.csv (one Population column).",
    )
    parser.add_argument("--num-sites", type=int, default=DEFAULT_NUM_SITES)
    parser.add_argument("--reference-fraction", type=float, default=DEFAULT_REFERENCE_FRACTION)
    parser.add_argument("--n-components", type=int, default=DEFAULT_PCA_COMPONENTS)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _parse_args()
    prepare(
        synpop_path=args.synpop,
        labels_path=args.labels,
        num_sites=args.num_sites,
        reference_fraction=args.reference_fraction,
        n_components=args.n_components,
        seed=args.seed,
    )

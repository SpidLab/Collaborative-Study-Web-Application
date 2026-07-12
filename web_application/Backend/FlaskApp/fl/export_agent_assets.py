"""Export FL assets the Site Agent needs to run federated learning locally.

Produces two things from the already-prepared synpop split + public PCA:

  1. SiteAgent/models/fl_pca_model.npz
     The public PCA panel in the agent's pure-numpy format (feature_names,
     scaler_mean, scaler_scale, pca_mean, components) so the agent can project
     without unpickling a version-specific sklearn estimator.

  2. <out_dir>/site_<N>/<phenotype>/rawdata.csv   (one per synpop site)
     A collaborator-style raw dataset: first column sample_id, then the SNP
     genotype columns, then a `label` column holding the super-population class.
     Each of these folders is a DATA_DIR for one local test agent.

Run after prepare_data.py:
    python -m web_application.Backend.FlaskApp.fl.export_agent_assets
"""
from __future__ import annotations

import argparse
import json
import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from .fl_config import (
    DEFAULT_NUM_SITES,
    FL_DATA_DIR,
    FL_DEFAULT_PHENOTYPE,
    PUBLIC_FEATURE_LIST_PATH,
    PUBLIC_PCA_PATH,
    PUBLIC_SCALER_PATH,
    SITE_DATA_PATTERN,
    SITE_LABELS_PATTERN,
)

logger = logging.getLogger(__name__)

# SiteAgent lives at web_application/SiteAgent; this file is at
# web_application/Backend/FlaskApp/fl/export_agent_assets.py
SITEAGENT_DIR = Path(__file__).resolve().parents[3] / "SiteAgent"
AGENT_PCA_NPZ = SITEAGENT_DIR / "models" / "fl_pca_model.npz"
DEFAULT_AGENT_DATA_DIR = SITEAGENT_DIR / "fl-data"


def export_pca_panel() -> Path:
    with open(PUBLIC_PCA_PATH, "rb") as fp:
        pca = pickle.load(fp)
    with open(PUBLIC_SCALER_PATH, "rb") as fp:
        scaler = pickle.load(fp)
    with open(PUBLIC_FEATURE_LIST_PATH) as fp:
        feature_names = json.load(fp)

    AGENT_PCA_NPZ.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        AGENT_PCA_NPZ,
        feature_names=np.array([str(f) for f in feature_names]),
        scaler_mean=scaler.mean_.astype(float),
        scaler_scale=scaler.scale_.astype(float),
        pca_mean=pca.mean_.astype(float),
        components=pca.components_.astype(float),
    )
    logger.info(
        "Wrote FL PCA panel: %s (%d features, %d components)",
        AGENT_PCA_NPZ, len(feature_names), pca.components_.shape[0],
    )
    return AGENT_PCA_NPZ


def export_site_datasets(
    num_sites: int,
    phenotype: str,
    out_dir: Path,
) -> list[Path]:
    written = []
    for site_idx in range(1, num_sites + 1):
        data_path = FL_DATA_DIR / SITE_DATA_PATTERN.format(idx=site_idx)
        labels_path = FL_DATA_DIR / SITE_LABELS_PATTERN.format(idx=site_idx)
        if not data_path.exists():
            logger.warning("Site %d data missing (%s) — skipping", site_idx, data_path)
            continue
        df = pd.read_csv(data_path, index_col=0)
        labels = pd.read_csv(labels_path)
        # Align label rows to the genotype rows by position (both come from the
        # same prepare_data split, in the same order).
        label_series = labels["super_population"].to_numpy()
        if len(label_series) != len(df):
            raise ValueError(
                f"Site {site_idx}: label count {len(label_series)} != rows {len(df)}"
            )

        out = df.copy()
        out.insert(0, "sample_id", [str(x) for x in df.index.tolist()])
        out["label"] = label_series

        site_dir = out_dir / f"site_{site_idx}" / phenotype
        site_dir.mkdir(parents=True, exist_ok=True)
        csv_path = site_dir / "rawdata.csv"
        out.to_csv(csv_path, index=False)
        written.append(csv_path)
        counts = pd.Series(label_series).value_counts().to_dict()
        logger.info("Site %d → %s  (%d samples, labels=%s)", site_idx, csv_path, len(out), counts)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--num-sites", type=int, default=DEFAULT_NUM_SITES)
    parser.add_argument("--phenotype", default=FL_DEFAULT_PHENOTYPE)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_AGENT_DATA_DIR)
    args = parser.parse_args()

    export_pca_panel()
    paths = export_site_datasets(args.num_sites, args.phenotype, args.out_dir)
    logger.info("Done. Wrote %d site datasets under %s", len(paths), args.out_dir)
    logger.info(
        "Each site_<N>/ folder is a DATA_DIR for one local test agent; "
        "phenotype folder is '%s'.", args.phenotype,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()

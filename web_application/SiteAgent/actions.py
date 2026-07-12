"""Local QC/GWAS execution — lifted from the old orchestrator qc_worker.py.

These run entirely on the collaborator's machine against the local raw CSV and
return ONLY derived outputs (surviving SNP/sample IDs, PCA coordinates,
privacy-transformed matrix, per-SNP case/control counts). The raw input is never
returned.
"""
import os
import sys
import logging
from datetime import datetime

import numpy as np
import pandas as pd

# Make the bundled QC modules importable. The Dockerfile copies the QC modules and
# gwas_summary.py into ./qc_modules — these are the authoritative, version-matched
# copies, so they take priority on sys.path. The repo's Collaborator_Server is only
# a dev-time fallback if the bundle is missing.
_HERE = os.path.dirname(__file__)
_BUNDLED = os.path.join(_HERE, "qc_modules")
if os.path.isdir(_BUNDLED) and _BUNDLED not in sys.path:
    sys.path.insert(0, _BUNDLED)  # bundled modules win
for _p in (
    os.path.abspath(os.path.join(_HERE, "..", "Backend", "FlaskApp", "Collaborator_Server")),
):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.append(_p)  # dev fallback only

from minor_allele_freq import MAFQualityControl
from hardy_weinberg_qc import HardyWeinbergQC
from missing_data_qc import MissingDataQC
from privacy_transform import PrivacyTransform
from gwas_summary import raw_to_gwas_stat, build_stats_dict

logger = logging.getLogger("siteagent.actions")

# Columns that hold the case/control label, not a genotype. They must be dropped
# before the QC filter chain / PCA (otherwise they'd be treated as a "SNP"), but
# kept for GWAS, where raw_to_gwas_stat uses them to split cases vs controls.
LABEL_COLS = {"phenotype", "case_control", "status", "group", "sex", "label"}

METHOD_ORDER = {"missing": 0, "maf": 1, "hwe": 2, "pca": 3}
NAME_TO_ID = {
    "Missing Data QC": "missing", "missing": "missing",
    "Minor Allele Frequency (MAF)": "maf", "MAF": "maf", "maf": "maf",
    "Hardy-Weinberg Equilibrium (HWE)": "hwe", "HWE": "hwe", "hwe": "hwe",
    "Population Stratification (PCA)": "pca", "PCA": "pca", "pca": "pca",
}

_pca_model_cache = {}


def _load_pca_model(models_dir, model_name):
    """Load the PCA panel as plain numpy arrays (version-independent — no sklearn
    estimator is unpickled, so the installed sklearn version is irrelevant here)."""
    key = (models_dir, model_name)
    if key not in _pca_model_cache:
        path = os.path.join(models_dir, f"{model_name}.npz")
        if not os.path.isfile(path):
            raise ValueError(f"PCA model not found: {path}")
        d = np.load(path, allow_pickle=False)
        _pca_model_cache[key] = {
            "feature_names": [str(x) for x in d["feature_names"]],
            "mean": d["scaler_mean"].astype(float),
            "scale": d["scaler_scale"].astype(float),
            "pca_mean": d["pca_mean"].astype(float),
            "components": d["components"].astype(float),
        }
    return _pca_model_cache[key]


def _tmp(name):
    return f"/tmp/{name}_{datetime.now().timestamp()}.csv"


def _run_maf(df, params):
    f = _tmp("maf")
    df.to_csv(f, index=False)
    try:
        qc = MAFQualityControl(threshold=params.get("threshold", 0.05),
                               method=params.get("method", "combined"), verbose=False)
        return qc.process_file(input_file=f, output_file=None)
    finally:
        if os.path.exists(f):
            os.remove(f)


def _run_hwe(df, params):
    f = _tmp("hwe")
    df.to_csv(f, index=False)
    try:
        qc = HardyWeinbergQC(threshold=params.get("threshold", 1e-6),
                             population=params.get("population", "combined"),
                             method=params.get("method", "chi2"), verbose=False)
        return qc.process_file(input_file=f, output_file=None)
    finally:
        if os.path.exists(f):
            os.remove(f)


def _run_missing(df, params):
    f = _tmp("missing")
    df.to_csv(f, index=False)
    try:
        qc = MissingDataQC(missing_threshold=params.get("threshold", 0.10),
                           filter_individuals=params.get("filter_individuals", True),
                           filter_snps=params.get("filter_snps", True), verbose=False)
        return qc.process_file(input_file=f, output_file=None)
    finally:
        if os.path.exists(f):
            os.remove(f)


def _run_pca(df, params, models_dir):
    """Project the dataset onto the pretrained PCA panel (pure numpy).

    Aligns the dataset's SNP columns to the model's panel BY NAME (so column order,
    extra SNPs, and a few missing SNPs are all fine): missing panel SNPs are imputed
    to the panel mean (neutral after scaling). Refuses if the dataset shares too few
    SNPs with the panel — projecting near-empty data would be meaningless.
    `df` is column-form with the sample ID as the first column.
    """
    model_name = params.get("model_name", "pca_model")
    m = _load_pca_model(models_dir, model_name)
    feature_names = m["feature_names"]
    mean, scale, pca_mean, components = m["mean"], m["scale"], m["pca_mean"], m["components"]

    id_col = df.columns[0]
    geno = df.set_index(id_col)

    present = [f for f in feature_names if f in geno.columns]
    overlap = (len(present) / len(feature_names)) if feature_names else 0.0
    min_overlap = float(params.get("min_panel_overlap", 0.5))
    if overlap < min_overlap:
        raise ValueError(
            f"insufficient SNP overlap with the PCA panel: {len(present)}/{len(feature_names)} "
            f"SNPs ({overlap:.0%} < required {min_overlap:.0%})"
        )

    # Build matrix in the panel's exact order; impute missing SNPs / NaNs to panel mean.
    cols = []
    for i, feat in enumerate(feature_names):
        if feat in geno.columns:
            col = pd.to_numeric(geno[feat], errors="coerce").fillna(mean[i]).to_numpy(dtype=float)
        else:
            col = np.full(len(geno), mean[i], dtype=float)
        cols.append(col)
    X = np.column_stack(cols)

    # StandardScaler + PCA projection, done explicitly with numpy.
    scaled = (X - mean) / scale
    pcs = (scaled - pca_mean) @ components.T

    if overlap < 1.0:
        logger.info("PCA: aligned to panel using %d/%d SNPs (rest imputed to panel mean).",
                    len(present), len(feature_names))

    out = pd.DataFrame(pcs, columns=[f"PC_{i + 1}" for i in range(pcs.shape[1])])
    out.insert(0, id_col, geno.index.to_numpy())
    return out


def _run_privacy(df, params):
    f_in, f_out = _tmp("privacy_in"), _tmp("privacy_out")
    df.to_csv(f_in, index=False)
    try:
        t = PrivacyTransform(
            epsilon=params.get("epsilon", 5.0),
            seed=params.get("seed", 1234),
            num_synthetic_samples=params.get("num_synthetic_samples", 0),
            num_samples_to_combine=params.get("num_samples_to_combine", 3),
            shuffle=params.get("shuffle", True),
            verbose=False,
        )
        return t.process_file(input_file=f_in, output_file=f_out)
    finally:
        for p in (f_in, f_out):
            if os.path.exists(p):
                os.remove(p)


def _to_column_form(df):
    """Convert an index-form df (sample id as index) to column form (sample id as first column)."""
    col = df.reset_index()
    if col.columns[0] in (None, "index"):
        col = col.rename(columns={col.columns[0]: "sample_id"})
    return col


def _strip_label_columns(df_colform):
    """Drop case/control label columns (keep the first/ID column) so the QC filter
    chain operates only on genotype columns."""
    drop = [c for i, c in enumerate(df_colform.columns)
            if i != 0 and str(c).strip().lower() in LABEL_COLS]
    return df_colform.drop(columns=drop) if drop else df_colform


def _surviving(df):
    first = str(df.columns[0]).lower()
    if first in ("", "unnamed: 0", "sample_id", "individual_id", "index"):
        samples = [str(x) for x in df.iloc[:, 0].tolist()]
        snps = [str(c) for c in df.columns[1:]]
    else:
        samples = [str(x) for x in df.index.tolist()]
        snps = [str(c) for c in df.columns.tolist()]
    return samples, snps


def _matrix_dict(df):
    """{sample_id: {snp: value}} from a column-form df whose first column is sample id."""
    work = df.copy()
    work = work.set_index(work.columns[0])
    work.index = work.index.astype(str)
    return {str(idx): row.to_dict() for idx, row in work.iterrows()}


def run_chained_qc(df, methods, models_dir):
    """Run the per-site QC steps locally and return only derived outputs.

    The filter chain (Missing -> MAF -> HWE) runs sequentially to produce the
    surviving SNP/sample lists. PCA (for Population Stratification) runs on the
    FULL original matrix, not the filtered one, because the pretrained PCA model
    expects the complete SNP set — this matches the original orchestrator, where
    PCA was a standalone transform on the raw data rather than the last filter step.
    """
    base = _strip_label_columns(_to_column_form(df))
    filter_steps = [m for m in methods if NAME_TO_ID.get(m.get("method", ""), "") in ("missing", "maf", "hwe")]
    has_pca = any(NAME_TO_ID.get(m.get("method", ""), "") == "pca" for m in methods)

    filter_steps = sorted(
        filter_steps, key=lambda m: METHOD_ORDER.get(NAME_TO_ID.get(m.get("method", ""), ""), 99)
    )
    work = base
    for step in filter_steps:
        mid = NAME_TO_ID.get(step.get("method", ""), "")
        p = step.get("params", {})
        if mid == "missing":
            work = _run_missing(work, p)
        elif mid == "maf":
            work = _run_maf(work, p)
        elif mid == "hwe":
            work = _run_hwe(work, p)

    samples, snps = _surviving(work)
    out = {"surviving_samples": samples, "surviving_snps": snps}

    if has_pca:
        pca_params = next(
            (m.get("params", {}) for m in methods if NAME_TO_ID.get(m.get("method", ""), "") == "pca"), {}
        )
        # PCA (for Population Stratification) needs the pretrained model's exact SNP
        # set. It is a REQUIRED step for this scheme, so if it can't run, FAIL the job
        # loudly rather than completing with no coordinates — otherwise the
        # collaboration would silently stall at "Initiate QC Calculation". A failed
        # job surfaces a clear "Retry QC" in the UI.
        try:
            pca_df = _run_pca(base, pca_params, models_dir)
        except Exception as e:
            raise ValueError(
                "Population Stratification (PCA) could not run for this dataset: "
                f"{e}. Use data with the full marker panel, or remove Population "
                "Stratification from the QC scheme, then retry."
            )
        out["pca_coords"] = _matrix_dict(pca_df)
    return out


def run_privacy_transform(df, params):
    """Privacy transform for Sample Relatedness; returns the transformed matrix only."""
    transformed = _run_privacy(_strip_label_columns(_to_column_form(df)), params)
    return {"transformed_data": _matrix_dict(transformed)}


def run_gwas_summary(df, sample_ids, params):
    """Per-SNP case/control counts for the GWAS chi-square meta-analysis."""
    stat_df = raw_to_gwas_stat(
        df,
        sample_ids,
        phenotype_col=params.get("phenotype_col"),
        phenotype_sample_map=params.get("phenotype_sample_map"),
        case_ids_path=params.get("case_ids_path"),
        control_ids_path=params.get("control_ids_path"),
        snp_ids_to_include=params.get("snp_ids_to_include"),
    )
    return {"stats": build_stats_dict(stat_df)}


# --------------------------------------------------------------------------- #
# Federated Learning (Sub Aim 1.3) — local compute, weights/coords only leave.
# --------------------------------------------------------------------------- #
def _fl_panel_path(models_dir, params):
    name = params.get("pca_model_name", "fl_pca_model")
    return os.path.join(models_dir, f"{name}.npz")


def run_fl_project(df, params, models_dir):
    """Stage 1: PCA-project local genotypes + Laplace DP noise → pca_coords."""
    import fl_local
    panel_path = _fl_panel_path(models_dir, params)
    if not os.path.isfile(panel_path):
        raise ValueError(f"FL PCA panel not found: {panel_path}")
    panel = fl_local.load_pca_panel(panel_path)
    epsilon = float(params.get("epsilon", 3.0))
    clip_norm = float(params.get("clip_norm", 5.0))
    seed = params.get("seed")
    return fl_local.run_project(df, panel, epsilon, clip_norm=clip_norm,
                                seed=int(seed) if seed is not None else None)


def run_fl_train_round(df, params):
    """Stage 3: train the genotype→phenotype CNN locally for one FL round."""
    import fl_local
    return fl_local.run_train_round(df, params)

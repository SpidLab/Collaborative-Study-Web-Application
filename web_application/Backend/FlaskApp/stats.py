"""
GWAS chi-square helpers.

Implementation note (perf):
    We avoid scipy.stats.chi2_contingency in a loop: it's a Python wrapper that
    calls NumPy a few times per invocation, so per-SNP overhead dominates for
    GWAS-scale workloads. Instead we compute all chi-square statistics in one
    vectorized NumPy pass over a stacked (N, 2, 3) tensor of 2x3 contingency
    tables, then call scipy.stats.chi2.sf once for the p-values.

    We also tried multiprocessing here -- it was strictly worse on macOS/Python
    3.12, because the default "spawn" start method re-imports the entire Flask
    app (and re-connects to MongoDB) in every worker. For microsecond-per-SNP
    work, that overhead dwarfs the math by orders of magnitude. The serial
    fallback below is for resilience only; the vectorized path handles
    millions of SNPs in seconds.

Input shape per SNP: [[case_0, case_1, case_2], [control_0, control_1, control_2]]
Output: { snp_id: {"chi_square": float | None, "p_value": float | None} }
"""

from __future__ import annotations

import logging

import numpy as np
from scipy.stats import chi2, chi2_contingency

logger = logging.getLogger(__name__)


def calc_chi_pvalue_for_snp(snp_id, counts):
    """Chi-square test for a single SNP's 2x3 contingency table (serial fallback)."""
    try:
        table = np.asarray(counts, dtype=float)
        chi2_stat, p_value, _, _ = chi2_contingency(table)
        return snp_id, {"chi_square": float(chi2_stat), "p_value": float(p_value)}
    except Exception:
        return snp_id, {"chi_square": None, "p_value": None}


def _calc_chi_pvalue_vectorized(snp_stats: dict) -> dict:
    """
    Vectorized chi-square for many 2x3 contingency tables at once.

    Assumes the caller has already replaced zero counts with a small pseudocount
    (the existing pipeline does this with 0.5), so degrees of freedom is the
    standard (rows-1) * (cols-1) = 2 for every SNP.
    """
    snp_ids = list(snp_stats.keys())
    if not snp_ids:
        return {}

    # Stack into a single (N, 2, 3) array. We tolerate ragged tables by skipping
    # malformed entries; they'll fall through to the serial path.
    valid_ids: list = []
    rows: list = []
    bad_ids: list = []
    for sid in snp_ids:
        counts = snp_stats[sid]
        try:
            arr = np.asarray(counts, dtype=float)
        except (TypeError, ValueError):
            bad_ids.append(sid)
            continue
        if arr.shape != (2, 3):
            bad_ids.append(sid)
            continue
        valid_ids.append(sid)
        rows.append(arr)

    if not valid_ids:
        return {sid: {"chi_square": None, "p_value": None} for sid in snp_ids}

    tables = np.stack(rows, axis=0)  # (N, 2, 3)

    row_totals = tables.sum(axis=2, keepdims=True)   # (N, 2, 1)
    col_totals = tables.sum(axis=1, keepdims=True)   # (N, 1, 3)
    grand = tables.sum(axis=(1, 2), keepdims=True)   # (N, 1, 1)

    # Expected = row_total * col_total / grand. Mask any degenerate tables
    # (grand==0) so they emit NaN and we report None for them.
    safe_grand = np.where(grand == 0, np.nan, grand)
    expected = (row_totals * col_totals) / safe_grand  # (N, 2, 3)

    # (O - E)^2 / E, summed over the 2x3 cells.
    with np.errstate(divide="ignore", invalid="ignore"):
        contrib = np.where(expected > 0, (tables - expected) ** 2 / expected, np.nan)
    chi2_stats = np.nansum(contrib, axis=(1, 2))  # (N,)

    # If every cell was NaN (degenerate row/col) np.nansum returns 0; mark those bad.
    all_nan = np.all(np.isnan(contrib), axis=(1, 2))
    chi2_stats = np.where(all_nan, np.nan, chi2_stats)

    p_values = chi2.sf(chi2_stats, df=2)

    results: dict = {}
    for i, sid in enumerate(valid_ids):
        c = chi2_stats[i]
        p = p_values[i]
        if not np.isfinite(c) or not np.isfinite(p):
            results[sid] = {"chi_square": None, "p_value": None}
        else:
            results[sid] = {"chi_square": float(c), "p_value": float(p)}
    for sid in bad_ids:
        results[sid] = {"chi_square": None, "p_value": None}
    return results


def calc_chi_pvalue(snp_stats: dict) -> dict:
    """
    Compute chi-square + p-value for every SNP in `snp_stats`.

    snp_stats: { snp_id: [[case_0, case_1, case_2], [control_0, control_1, control_2]], ... }
    returns:   { snp_id: {"chi_square": float, "p_value": float}, ... }
    """
    if not snp_stats:
        return {}

    try:
        return _calc_chi_pvalue_vectorized(snp_stats)
    except Exception as exc:
        # Defensive: if anything in the vectorized path fails for an unexpected
        # input shape, drop to a serial scipy fallback per-SNP so the user
        # still gets results, just slower. This should be rare in practice.
        logger.warning("Vectorized chi-square failed, falling back to serial: %s", exc)
        results: dict = {}
        for snp_id, counts in snp_stats.items():
            sid, res = calc_chi_pvalue_for_snp(snp_id, counts)
            results[sid] = res
        return results

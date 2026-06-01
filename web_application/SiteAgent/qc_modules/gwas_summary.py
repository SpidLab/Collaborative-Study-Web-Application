#!/usr/bin/env python3
"""
GWAS Summary Dataset Generator

Converts raw genotype data to GWAS stat format (SNP_ID, Case_0, Case_1, Case_2, Control_0, Control_1, Control_2).
Only includes samples from the QC-filtered sample list.
Case/control: use case_ids.txt and control_ids.txt (one ID per line), or phenotype column, or phenotype_sample_map.
"""
import pandas as pd
import numpy as np
import os


def _load_id_set(filepath):
    """Load IDs from file (one per line), return set for O(1) lookup. Strips whitespace, skips empty lines."""
    if not filepath or not os.path.isfile(filepath):
        return None
    with open(filepath, 'r') as f:
        return {str(line.strip()) for line in f if line.strip()}


def raw_to_gwas_stat(
    raw_df,
    sample_ids_to_include,
    phenotype_col=None,
    phenotype_sample_map=None,
    case_ids_path=None,
    control_ids_path=None,
    snp_ids_to_include=None,
):
    """
    Convert raw genotype data to GWAS stat format.

    Args:
        raw_df: DataFrame with sample IDs as index/row labels, SNP IDs as columns, genotypes 0/1/2.
        sample_ids_to_include: List/set of sample IDs to include (from QC filtered results).
        phenotype_col: Name of column with case/control (1=case, 0=control). Auto-detected if None.
        phenotype_sample_map: Optional dict sample_id -> 0|1 (0=control, 1=case). Overrides phenotype_col.
        case_ids_path: Path to file with case IDs (one per line). Uses set for O(1) lookup.
        control_ids_path: Path to file with control IDs (one per line). Uses set for O(1) lookup.
        snp_ids_to_include: Optional list/set of SNP IDs to include (from QC filtered results). If None, all SNPs are used.

    Returns:
        DataFrame with columns: SNP_ID, Case_0, Case_1, Case_2, Control_0, Control_1, Control_2
    """
    sample_ids_set = {str(s) for s in sample_ids_to_include}

    # Ensure index is sample ID
    if raw_df.index.name is None or raw_df.index.name == '':
        raw_df = raw_df.copy()
        raw_df.index.name = 'sample_id'

    # Filter to included samples only
    raw_df = raw_df[raw_df.index.astype(str).isin(sample_ids_set)]
    if raw_df.empty:
        raise ValueError(
            f"No samples from the QC list found in raw data. "
            f"QC list has {len(sample_ids_set)} samples. Check sample ID format (e.g. string vs int)."
        )

    # Build case/control mask - priority: phenotype_sample_map > case/control ID files > phenotype column
    index_str = raw_df.index.astype(str)
    pheno_col = None

    if phenotype_sample_map is not None:
        pmap = {str(k): int(v) for k, v in phenotype_sample_map.items()}
        case_mask = index_str.map(lambda x: pmap.get(x, -1)) == 1
        control_mask = index_str.map(lambda x: pmap.get(x, -1)) == 0
    elif case_ids_path and control_ids_path:
        case_ids_set = _load_id_set(case_ids_path)
        control_ids_set = _load_id_set(control_ids_path)
        if case_ids_set is None:
            raise ValueError(f"case_ids file not found or empty: {case_ids_path}")
        if control_ids_set is None:
            raise ValueError(f"control_ids file not found or empty: {control_ids_path}")
        case_mask = index_str.isin(case_ids_set)
        control_mask = index_str.isin(control_ids_set)
    else:
        phenotype_candidates = ['phenotype', 'Phenotype', 'case_control', 'Case_Control', 'status', 'Status', 'group', 'Group']
        pheno_col = phenotype_col
        if pheno_col is None:
            for c in phenotype_candidates:
                if c in raw_df.columns:
                    pheno_col = c
                    break
        if pheno_col is None or pheno_col not in raw_df.columns:
            raise ValueError(
                "Raw data must have case/control assignment. Use case_ids.txt and control_ids.txt, "
                "or a 'phenotype' column (1=case, 0=control), or provide phenotype_sample_map."
            )
        pheno = raw_df[pheno_col].astype(str).str.lower().str.strip()
        pheno_map = {'1': 1, 'case': 1, '1.0': 1, '0': 0, 'control': 0, '0.0': 0}
        case_mask = pheno.map(lambda x: pheno_map.get(x, np.nan)) == 1
        control_mask = pheno.map(lambda x: pheno_map.get(x, np.nan)) == 0
        try:
            pheno_num = pd.to_numeric(raw_df[pheno_col], errors='coerce')
            case_mask = case_mask | (pheno_num == 1)
            control_mask = control_mask | (pheno_num == 0)
        except Exception:
            pass

    snp_cols = [c for c in raw_df.columns if (pheno_col is None or c != pheno_col) and c != raw_df.index.name]
    if snp_ids_to_include is not None:
        snp_ids_set = frozenset(str(s) for s in snp_ids_to_include)
        snp_cols = [c for c in snp_cols if str(c) in snp_ids_set]
    if not snp_cols:
        raise ValueError("No SNP columns found in raw data.")

    if not case_mask.any():
        raise ValueError("No case samples (phenotype=1) found in the filtered data.")
    if not control_mask.any():
        raise ValueError("No control samples (phenotype=0) found in the filtered data.")

    # Build stat rows: for each SNP, count Case_0, Case_1, Case_2, Control_0, Control_1, Control_2
    stat_rows = []
    for snp_id in snp_cols:
        col = raw_df[snp_id]
        # Normalize genotype: 0, 1, 2; -1, 9, NaN = missing (exclude)
        geno = pd.to_numeric(col, errors='coerce')
        valid = geno.notna() & geno.isin([0, 1, 2])

        case_vals = geno[case_mask & valid]
        control_vals = geno[control_mask & valid]

        case_0 = int((case_vals == 0).sum())
        case_1 = int((case_vals == 1).sum())
        case_2 = int((case_vals == 2).sum())
        control_0 = int((control_vals == 0).sum())
        control_1 = int((control_vals == 1).sum())
        control_2 = int((control_vals == 2).sum())

        stat_rows.append({
            'SNP_ID': snp_id,
            'Case_0': case_0,
            'Case_1': case_1,
            'Case_2': case_2,
            'Control_0': control_0,
            'Control_1': control_1,
            'Control_2': control_2,
        })

    return pd.DataFrame(stat_rows)


def build_stats_dict(stat_df):
    """
    Convert stat DataFrame to the format expected by collaboration.stats.{user_id}.
    Matches upload_csv_stats structure.
    """
    user_stats = {}
    for _, row in stat_df.iterrows():
        snp_id = str(row['SNP_ID'])
        user_stats[snp_id] = {
            "case": {"0": int(row['Case_0']), "1": int(row['Case_1']), "2": int(row['Case_2'])},
            "control": {"0": int(row['Control_0']), "1": int(row['Control_1']), "2": int(row['Control_2'])}
        }
    return user_stats

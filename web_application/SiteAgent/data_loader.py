"""Resolve and load a collaborator's local raw dataset for a job.

Layout — one folder per phenotype, named exactly like the dataset's metadata name
registered on the collaboration server:

    <DATA_DIR>/<phenotype>/rawdata.csv                      # case/control in a column
    <DATA_DIR>/<phenotype>/rawdata.csv + case_ids.txt + control_ids.txt

So an incoming job's phenotype maps deterministically to one folder, and each
dataset carries its OWN case/control files. A flat <DATA_DIR>/<phenotype>.csv is
still accepted for backward compatibility. The raw data never leaves the machine —
only QC-derived outputs are uploaded.
"""
import hashlib
import os

import pandas as pd

# Accepted names for the raw CSV inside a phenotype folder (first match wins).
RAW_CSV_CANDIDATES = ["rawdata.csv", "rawdataset.csv", "raw_dataset.csv", "dataset.csv", "data.csv"]


def resolve_dataset(data_dir, phenotype):
    """Return (csv_path, dataset_dir) for a phenotype.

    Prefers the per-phenotype folder layout; falls back to a flat
    <data_dir>/<phenotype>.csv. dataset_dir is where case/control files (if any)
    for this dataset live.
    """
    safe = os.path.basename(str(phenotype))
    folder = os.path.join(data_dir, safe)

    if os.path.isdir(folder):
        for name in RAW_CSV_CANDIDATES + [f"{safe}.csv"]:
            candidate = os.path.join(folder, name)
            if os.path.isfile(candidate):
                return candidate, folder
        csvs = [f for f in os.listdir(folder) if f.lower().endswith(".csv")]
        if len(csvs) == 1:
            return os.path.join(folder, csvs[0]), folder
        if not csvs:
            raise FileNotFoundError(f"No CSV found in dataset folder: {folder}")
        raise FileNotFoundError(
            f"Multiple CSVs in {folder}; name the raw file one of: {', '.join(RAW_CSV_CANDIDATES)}"
        )

    flat = os.path.join(data_dir, f"{safe}.csv")
    if os.path.isfile(flat):
        return flat, data_dir

    raise FileNotFoundError(
        f"No dataset for phenotype '{phenotype}'. Expected a folder '{folder}/' "
        f"containing rawdata.csv, or a file '{flat}'."
    )


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_dataframe(path, index_col=0):
    """Load the raw CSV with sample IDs as the index."""
    df = pd.read_csv(path, index_col=index_col)
    df.index = df.index.astype(str)
    return df


def expected_hash_matches(path, expected_hash):
    if not expected_hash:
        return True
    return file_sha256(path) == expected_hash


def find_case_control_files(dataset_dir, phenotype):
    """Locate this dataset's case/control ID files inside its folder, for datasets
    that carry case/control as separate files instead of a phenotype column.

    Returns (case_path, control_path) only if BOTH exist, else (None, None).
    Checks phenotype-specific names first, then generic ones.
    """
    pheno = os.path.basename(str(phenotype))
    candidates = [
        (f"{pheno}_case_ids.txt", f"{pheno}_control_ids.txt"),
        ("case_ids.txt", "control_ids.txt"),
    ]
    for case_name, control_name in candidates:
        case_path = os.path.join(dataset_dir, case_name)
        control_path = os.path.join(dataset_dir, control_name)
        if os.path.isfile(case_path) and os.path.isfile(control_path):
            return case_path, control_path
    return None, None

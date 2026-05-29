"""Data loading utilities shared by the FL client/server."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from .fl_config import (
    FL_DATA_DIR,
    SITE_DATA_PATTERN,
    SITE_LABELS_PATTERN,
    SUPER_POPULATIONS,
)

logger = logging.getLogger(__name__)


@dataclass
class SiteData:
    site_id: str
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    num_classes: int
    label_names: list[str]
    feature_list: list[str]


def _encode_super_population(labels: pd.Series) -> tuple[np.ndarray, list[str]]:
    names = SUPER_POPULATIONS
    mapping = {name: idx for idx, name in enumerate(names)}
    y = labels.map(mapping).to_numpy()
    if np.any(pd.isna(y)):
        unknown = labels[pd.isna(y)].unique().tolist()
        raise ValueError(f"Unknown super-population labels: {unknown}")
    return y.astype(np.int64), names


def load_site(
    site_idx: int,
    val_fraction: float = 0.2,
    seed: int = 42,
    data_dir: Path | None = None,
) -> SiteData:
    data_dir = data_dir or FL_DATA_DIR
    data_path = data_dir / SITE_DATA_PATTERN.format(idx=site_idx)
    labels_path = data_dir / SITE_LABELS_PATTERN.format(idx=site_idx)
    if not data_path.exists() or not labels_path.exists():
        raise FileNotFoundError(
            f"Site {site_idx} data missing. Run `python -m web_application.Backend.FlaskApp.fl.prepare_data` first. "
            f"Expected: {data_path} and {labels_path}"
        )

    df = pd.read_csv(data_path, index_col=0)
    labels_df = pd.read_csv(labels_path)
    y, names = _encode_super_population(labels_df["super_population"])
    X = df.values.astype(np.float32)

    # Stratified split; fall back to random if a class is too small.
    try:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=val_fraction, random_state=seed, stratify=y
        )
    except ValueError:
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=val_fraction, random_state=seed
        )

    return SiteData(
        site_id=f"site_{site_idx}",
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        num_classes=len(names),
        label_names=names,
        feature_list=list(df.columns),
    )


def batch_iter(
    X: np.ndarray,
    y: np.ndarray,
    batch_size: int,
    shuffle: bool = True,
    seed: int | None = None,
):
    idx = np.arange(len(X))
    if shuffle:
        rng = np.random.default_rng(seed)
        rng.shuffle(idx)
    for start in range(0, len(idx), batch_size):
        chunk = idx[start:start + batch_size]
        yield X[chunk], y[chunk]

"""Self-contained federated-learning local compute for the Site Agent.

Runs entirely on the collaborator's machine. Two operations:

  * project_with_dp(...)   PCA-project the local genotypes onto the public panel
                           and add Laplace ε-LDP noise → coordinates only.
  * train_round(...)       start from the server's global weights, train the
                           genotype→phenotype CNN locally for a few epochs on the
                           local data + labels, return the updated weights.

Raw genotypes never leave the machine — only PCA coordinates and model weights.

IMPORTANT: the model architecture and weight codec here are mirrored verbatim
from the server (web_application/Backend/FlaskApp/fl/model.py and weights.py).
They MUST stay identical so state_dict tensor order matches during FedAvg.
"""
from __future__ import annotations

import base64
import io
import logging

import numpy as np

logger = logging.getLogger("siteagent.fl")

# Label column names that hold the class/phenotype, not a genotype marker.
_LABEL_COLS = {"phenotype", "case_control", "status", "group", "sex", "label"}


# --------------------------------------------------------------------------- #
# Weight codec — mirror of fl/weights.py
# --------------------------------------------------------------------------- #
def encode_weights(arrays):
    buf = io.BytesIO()
    np.savez(buf, **{f"w{i}": np.asarray(a) for i, a in enumerate(arrays)})
    return base64.b64encode(buf.getvalue()).decode("ascii")


def decode_weights(b64):
    raw = base64.b64decode(b64.encode("ascii"))
    with np.load(io.BytesIO(raw), allow_pickle=False) as d:
        return [d[f"w{i}"] for i in range(len(d.files))]


# --------------------------------------------------------------------------- #
# Model — mirror of fl/model.py (GenoPhenoCNN)
# --------------------------------------------------------------------------- #
def _build_model(num_snps, num_classes, channels=32, kernel_size=7, hidden=128, dropout=0.2):
    import torch.nn as nn

    out_dim = 1 if num_classes == 2 else num_classes

    class GenoPhenoCNN(nn.Module):
        def __init__(self):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv1d(1, channels, kernel_size=kernel_size, padding=kernel_size // 2),
                nn.BatchNorm1d(channels),
                nn.ReLU(inplace=True),
                nn.MaxPool1d(kernel_size=4),
                nn.Conv1d(channels, channels * 2, kernel_size=kernel_size, padding=kernel_size // 2),
                nn.BatchNorm1d(channels * 2),
                nn.ReLU(inplace=True),
                nn.AdaptiveAvgPool1d(1),
            )
            self.head = nn.Sequential(
                nn.Flatten(),
                nn.Linear(channels * 2, hidden),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout),
                nn.Linear(hidden, out_dim),
            )

        def forward(self, x):
            if x.dim() == 2:
                x = x.unsqueeze(1)
            return self.head(self.conv(x))

    return GenoPhenoCNN()


def _set_weights(model, arrays):
    import torch

    state = model.state_dict()
    keys = list(state.keys())
    if len(keys) != len(arrays):
        raise ValueError(f"weight count mismatch: model={len(keys)} incoming={len(arrays)}")
    model.load_state_dict({k: torch.as_tensor(v) for k, v in zip(keys, arrays)}, strict=True)


def _get_weights(model):
    return [p.detach().cpu().numpy() for p in model.state_dict().values()]


# --------------------------------------------------------------------------- #
# Data helpers
# --------------------------------------------------------------------------- #
def _split_features_labels(df, label_col=None, class_names=None):
    """From an index-form df (sample id index), return (X float32, y int, classes).

    The label column is auto-detected (any of _LABEL_COLS) unless `label_col` is
    given. Remaining columns are treated as genotype features. `class_names`, if
    provided, fixes the label→index mapping so every site agrees on class order.
    """
    cols_lower = {str(c).strip().lower(): c for c in df.columns}
    if label_col and label_col in df.columns:
        lc = label_col
    else:
        lc = next((cols_lower[n] for n in _LABEL_COLS if n in cols_lower), None)
    if lc is None:
        raise ValueError(
            "No label column found. Expected one of "
            f"{sorted(_LABEL_COLS)} (or pass label_col)."
        )

    y_raw = df[lc].astype(str).to_numpy()
    feats = df.drop(columns=[lc])
    X = feats.apply(lambda s: __import__("pandas").to_numeric(s, errors="coerce")).fillna(0.0)
    X = X.to_numpy(dtype=np.float32)

    if class_names is None:
        class_names = sorted(set(y_raw.tolist()))
    mapping = {name: i for i, name in enumerate(class_names)}
    if any(v not in mapping for v in y_raw):
        unknown = sorted(set(v for v in y_raw if v not in mapping))
        raise ValueError(f"labels not in class list {class_names}: {unknown}")
    y = np.array([mapping[v] for v in y_raw], dtype=np.int64)
    return X, y, list(class_names)


# --------------------------------------------------------------------------- #
# PCA projection + DP (mirror of fl/pca_projector.py math)
# --------------------------------------------------------------------------- #
def project_with_dp(df, panel, epsilon, clip_norm=5.0, seed=None):
    """PCA-project index-form genotypes onto `panel`, add Laplace ε-LDP noise.

    panel: dict(feature_names, mean, scale, pca_mean, components) as loaded from
    the fl_pca_model.npz. Returns a numpy array [n_samples, n_components].
    """
    feature_names = panel["feature_names"]
    mean, scale = panel["mean"], panel["scale"]
    pca_mean, components = panel["pca_mean"], panel["components"]

    import pandas as pd

    geno = df.copy()
    geno.columns = [str(c) for c in geno.columns]
    # Drop any label columns before projecting.
    drop = [c for c in geno.columns if str(c).strip().lower() in _LABEL_COLS]
    if drop:
        geno = geno.drop(columns=drop)

    cols = []
    for i, feat in enumerate(feature_names):
        if feat in geno.columns:
            cols.append(pd.to_numeric(geno[feat], errors="coerce").fillna(mean[i]).to_numpy(dtype=float))
        else:
            cols.append(np.full(len(geno), mean[i], dtype=float))
    X = np.column_stack(cols)

    scaled = (X - mean) / scale
    pcs = (scaled - pca_mean) @ components.T

    # Row-level ε-LDP: clip each sample's projection to L1<=clip_norm, add Laplace.
    if epsilon <= 0:
        raise ValueError("epsilon must be > 0")
    rng = np.random.default_rng(seed)
    l1 = np.abs(pcs).sum(axis=1, keepdims=True)
    factor = np.where(l1 > clip_norm, clip_norm / np.maximum(l1, 1e-12), 1.0)
    clipped = pcs * factor
    noise = rng.laplace(loc=0.0, scale=clip_norm / epsilon, size=clipped.shape)
    return clipped + noise


def load_pca_panel(npz_path):
    d = np.load(npz_path, allow_pickle=False)
    return {
        "feature_names": [str(x) for x in d["feature_names"]],
        "mean": d["scaler_mean"].astype(float),
        "scale": d["scaler_scale"].astype(float),
        "pca_mean": d["pca_mean"].astype(float),
        "components": d["components"].astype(float),
    }


# --------------------------------------------------------------------------- #
# Public ops used by actions.py
# --------------------------------------------------------------------------- #
def run_project(df, panel, epsilon, clip_norm=5.0, seed=None):
    """Return {'pca_coords': {sample_id: {PC_1:.., ...}}} for EMD on the server."""
    coords = project_with_dp(df, panel, epsilon, clip_norm=clip_norm, seed=seed)
    ids = [str(x) for x in df.index.tolist()]
    out = {}
    for i, sid in enumerate(ids):
        out[sid] = {f"PC_{j + 1}": float(coords[i, j]) for j in range(coords.shape[1])}
    return {"pca_coords": out}


def run_train_round(df, params):
    """Train the CNN locally starting from global weights; return a model update.

    params:
      global_weights : base64 weights (None on round 1 → agent inits fresh)
      num_classes    : int
      class_names    : list[str]  (fixes label order across sites)
      label_col      : optional explicit label column
      local_epochs, batch_size, learning_rate
    Returns {'model_update': {weights, num_samples, train_loss, val_accuracy, val_f1}}.
    """
    import torch
    import torch.nn as nn
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.model_selection import train_test_split

    num_classes = int(params.get("num_classes", 2))
    class_names = params.get("class_names")
    X, y, class_names = _split_features_labels(df, params.get("label_col"), class_names)
    num_snps = X.shape[1]

    local_epochs = int(params.get("local_epochs", 1))
    batch_size = int(params.get("batch_size", 16))
    lr = float(params.get("learning_rate", 1e-3))
    seed = int(params.get("seed", 42))

    torch.manual_seed(seed)
    np.random.seed(seed)

    # Local train/val split for a per-round validation metric.
    try:
        Xtr, Xval, ytr, yval = train_test_split(X, y, test_size=0.2, random_state=seed, stratify=y)
    except ValueError:
        Xtr, Xval, ytr, yval = train_test_split(X, y, test_size=0.2, random_state=seed)

    model = _build_model(num_snps, num_classes)
    gw = params.get("global_weights")
    if gw:
        _set_weights(model, decode_weights(gw))

    loss_fn = nn.BCEWithLogitsLoss() if num_classes == 2 else nn.CrossEntropyLoss()
    opt = torch.optim.Adam(model.parameters(), lr=lr)

    def _targets(arr):
        if num_classes == 2:
            return torch.as_tensor(arr, dtype=torch.float32).view(-1, 1)
        return torch.as_tensor(arr, dtype=torch.long)

    model.train()
    total_loss, total_n = 0.0, 0
    idx = np.arange(len(Xtr))
    for ep in range(local_epochs):
        rng = np.random.default_rng(seed + ep)
        rng.shuffle(idx)
        for s in range(0, len(idx), batch_size):
            chunk = idx[s:s + batch_size]
            xb = torch.as_tensor(Xtr[chunk], dtype=torch.float32)
            yb = _targets(ytr[chunk])
            opt.zero_grad()
            logits = model(xb)
            loss = loss_fn(logits, yb)
            loss.backward()
            opt.step()
            total_loss += float(loss.item()) * len(chunk)
            total_n += len(chunk)
    train_loss = total_loss / max(total_n, 1)

    # Local validation with the just-updated weights.
    model.eval()
    with torch.no_grad():
        logits = model(torch.as_tensor(Xval, dtype=torch.float32))
        if num_classes == 2:
            pred = (torch.sigmoid(logits).numpy().ravel() >= 0.5).astype(np.int64)
        else:
            pred = logits.argmax(dim=1).numpy()
    val_acc = float(accuracy_score(yval, pred)) if len(yval) else 0.0
    avg = "binary" if num_classes == 2 else "macro"
    val_f1 = float(f1_score(yval, pred, average=avg, zero_division=0)) if len(yval) else 0.0

    return {"model_update": {
        "weights": encode_weights(_get_weights(model)),
        "num_samples": int(len(Xtr)),
        "train_loss": float(train_loss),
        "val_accuracy": val_acc,
        "val_f1": val_f1,
        "class_names": class_names,
    }}


def run_classify(samples, weights_b64, num_classes, class_names=None):
    """Classify samples with a model held locally. Black-box service side.

    samples: {sample_id: {marker: value}} sent by the requester.
    Returns {sample_id: {predicted_class, confidence}} — predictions only, never
    anything derived from the model's parameters.
    """
    import pandas as pd
    import torch

    if not samples:
        return {}

    df = pd.DataFrame.from_dict(samples, orient="index")
    # Drop any label column that rode along; we are predicting the label.
    drop = [c for c in df.columns if str(c).strip().lower() in _LABEL_COLS]
    if drop:
        df = df.drop(columns=drop)
    # Stable column order so every sample lines up with the same feature slots.
    df = df.reindex(sorted(df.columns, key=str), axis=1)
    X = df.apply(lambda s: pd.to_numeric(s, errors="coerce")).fillna(0.0).to_numpy(dtype=np.float32)

    num_classes = int(num_classes or 2)
    model = _build_model(X.shape[1], num_classes)
    _set_weights(model, decode_weights(weights_b64))
    model.eval()

    with torch.no_grad():
        logits = model(torch.as_tensor(X, dtype=torch.float32))
        if num_classes == 2:
            prob_pos = torch.sigmoid(logits).numpy().ravel()
            idx = (prob_pos >= 0.5).astype(int)
            conf = np.where(idx == 1, prob_pos, 1.0 - prob_pos)
        else:
            probs = torch.softmax(logits, dim=1).numpy()
            idx = probs.argmax(axis=1)
            conf = probs.max(axis=1)

    names = list(class_names or [])
    out = {}
    for i, sid in enumerate(df.index.tolist()):
        label = names[int(idx[i])] if int(idx[i]) < len(names) else int(idx[i])
        out[str(sid)] = {"predicted_class": label, "confidence": round(float(conf[i]), 4)}
    return out

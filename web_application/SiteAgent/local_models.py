"""Loading models this site owns, whatever framework they came from.

A site can own two kinds of model:

  * one this sandbox trained, delivered after federated learning — our own
    GenoPhenoCNN, stored as base64 npz weights;
  * one the researcher already had and registered in the Model Repository — a
    scikit-learn estimator, a TorchScript export, or our own format.

Both need to answer the same two questions locally: "what do you predict for these
samples?" (the black-box classification service) and "how much do you leak about your
training cohort?" (the privacy audit). This module hides the format differences behind
one small interface so neither of those has to care.

FEATURE ORDER IS THE DANGEROUS PART. A model is a function of its input columns in a
fixed order. Samples arrive as {sample_id: {marker: value}} — a mapping with no
inherent order — so if the columns are assembled in a different order than the model
was trained on, it still returns confident predictions, and they are all wrong. So a
model may declare its feature order, and when it does we align to it by name and say
how many were missing. Silently guessing is the one thing we do not do.
"""
from __future__ import annotations

import glob
import json
import logging
import os

import numpy as np

logger = logging.getLogger("siteagent.models")

NATIVE_SUFFIX = ".weights.b64"
# Extension -> format, for a model file dropped in without a sidecar.
EXTENSION_FORMATS = {
    ".joblib": "sklearn",
    ".pkl": "sklearn",
    ".pickle": "sklearn",
    ".pt": "torchscript",
    ".pth": "torchscript",
    ".b64": "native",
}


class LoadedModel:
    """A local model plus everything needed to feed it correctly."""

    def __init__(self, model_id, fmt, predict_proba, num_classes, class_names,
                 features=None, path=None):
        self.model_id = model_id
        self.format = fmt
        self._predict_proba = predict_proba
        self.num_classes = int(num_classes)
        self.class_names = list(class_names or [])
        self.features = list(features) if features else None
        self.path = path

    def predict_proba(self, X):
        proba = np.asarray(self._predict_proba(X), dtype=np.float64)
        if proba.ndim == 1:
            proba = np.column_stack([1.0 - proba, proba])
        return proba

    def align(self, matrix):
        """Build the feature matrix this model expects from {sample_id: {marker: v}}.

        Returns (X, sample_ids, report). When the model declared its feature order we
        follow it exactly and fill anything absent with 0.0, reporting how many were
        missing so the caller can refuse a hopeless mismatch. With no declared order we
        fall back to sorted marker names, which is stable but only correct if the model
        was trained on that same ordering — hence the warning.
        """
        sample_ids = list(matrix.keys())
        present = set()
        for row in matrix.values():
            if isinstance(row, dict):
                present.update(str(k) for k in row.keys())

        if self.features:
            columns = list(self.features)
            missing = [c for c in columns if c not in present]
            report = {"declared_features": True, "n_features": len(columns),
                      "n_missing": len(missing),
                      "missing_examples": missing[:5]}
        else:
            columns = sorted(present)
            report = {"declared_features": False, "n_features": len(columns),
                      "n_missing": 0,
                      "note": ("This model did not declare its feature order, so markers "
                               "were used in alphabetical order. If it was trained on a "
                               "different column order the predictions will be wrong — "
                               "add a \"features\" list to its sidecar JSON to be sure.")}

        X = np.zeros((len(sample_ids), len(columns)), dtype=np.float32)
        for i, sid in enumerate(sample_ids):
            row = matrix.get(sid) or {}
            for j, col in enumerate(columns):
                v = row.get(col)
                if v is None:
                    continue
                try:
                    X[i, j] = float(v)
                except (TypeError, ValueError):
                    X[i, j] = 0.0
        return X, sample_ids, report


def _sidecar(owned_dir, model_id):
    path = os.path.join(owned_dir, f"{_safe(model_id)}.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def _safe(model_id):
    safe = "".join(c for c in str(model_id) if c.isalnum() or c in "-_")
    if not safe:
        raise ValueError(f"Invalid model id: {model_id!r}")
    return safe


def _candidate_files(owned_dir, model_id):
    """Every file in the store that could be this model, best guess first."""
    safe = _safe(model_id)
    found = []
    native = os.path.join(owned_dir, f"{safe}{NATIVE_SUFFIX}")
    if os.path.isfile(native):
        found.append((native, "native"))
    for path in sorted(glob.glob(os.path.join(owned_dir, f"{safe}.*"))):
        if path.endswith(".json") or path == native:
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext in EXTENSION_FORMATS:
            found.append((path, EXTENSION_FORMATS[ext]))
    return found


def _load_native(path, meta):
    import fl_local
    with open(path) as f:
        weights_b64 = f.read().strip()
    num_classes = int(meta.get("num_classes") or 2)
    class_names = meta.get("class_names") or []

    def predict(X):
        model = fl_local._build_model(X.shape[1], num_classes)
        fl_local._set_weights(model, fl_local.decode_weights(weights_b64))
        model.eval()
        import mia_local
        return mia_local._predict_proba(model, X, num_classes)

    return predict, num_classes, class_names


def _load_sklearn(path, meta):
    try:
        import joblib
        estimator = joblib.load(path)
    except Exception:
        import pickle
        with open(path, "rb") as f:
            estimator = pickle.load(f)

    # `classes_` is a numpy array; `array or []` raises on ambiguous truth value, so
    # test for None explicitly rather than relying on truthiness.
    raw_classes = getattr(estimator, "classes_", None)
    classes = list(raw_classes) if raw_classes is not None else []

    # `classes_` IS the column order of predict_proba, so it defines the labels — a
    # sidecar must not override it. scikit-learn sorts classes, so a sidecar listing
    # them in training order (say ["low", "high"] against a sorted ["high", "low"])
    # would silently invert every prediction while still returning plausible labels.
    if classes:
        class_names = [str(c) for c in classes]
        declared = [str(c) for c in (meta.get("class_names") or [])]
        if declared and declared != class_names:
            logger.warning(
                "Ignoring the declared class order %s: this model reports its own order "
                "as %s, which is what its probability columns mean.", declared, class_names)
    else:
        class_names = [str(c) for c in (meta.get("class_names") or [])]
    num_classes = int(meta.get("num_classes") or len(classes) or 2)

    def predict(X):
        if hasattr(estimator, "predict_proba"):
            return estimator.predict_proba(X)
        if hasattr(estimator, "decision_function"):
            scores = np.asarray(estimator.decision_function(X), dtype=float)
            if scores.ndim == 1:
                scores = np.column_stack([-scores, scores])
            exp = np.exp(scores - scores.max(axis=1, keepdims=True))
            return exp / exp.sum(axis=1, keepdims=True)
        # Last resort: a hard label, expressed as a one-hot "probability". The audit
        # still works (the rule-based attack only needs the argmax) but the black-box
        # attack has far less to learn from, so say so rather than pretend otherwise.
        logger.warning("Model at %s exposes no probabilities — only hard labels are "
                       "available, which weakens the black-box attack.", path)
        preds = np.asarray(estimator.predict(X)).ravel()
        lookup = {c: i for i, c in enumerate(classes or sorted(set(preds.tolist())))}
        out = np.zeros((len(preds), max(num_classes, len(lookup))), dtype=float)
        for i, p in enumerate(preds):
            out[i, lookup.get(p, 0)] = 1.0
        return out

    return predict, num_classes, class_names


def _load_torchscript(path, meta):
    import torch
    module = torch.jit.load(path)
    module.eval()
    num_classes = int(meta.get("num_classes") or 2)
    class_names = meta.get("class_names") or []

    def predict(X):
        with torch.no_grad():
            out = module(torch.as_tensor(X, dtype=torch.float32))
        out = out.numpy() if hasattr(out, "numpy") else np.asarray(out)
        if out.ndim == 1 or out.shape[-1] == 1:
            p1 = 1.0 / (1.0 + np.exp(-out.ravel()))
            return np.column_stack([1.0 - p1, p1])
        exp = np.exp(out - out.max(axis=1, keepdims=True))
        return exp / exp.sum(axis=1, keepdims=True)

    return predict, num_classes, class_names


LOADERS = {"native": _load_native, "sklearn": _load_sklearn, "torchscript": _load_torchscript}


def load_local_model(owned_dir, model_id, declared=None):
    """Load a model this site owns, in whatever format it is stored.

    Looks for, in order: the file the owner named when registering the model, a sidecar
    JSON next to the store, our native weights file, then any `<model_id>.<known
    extension>`. `declared` carries what the owner told the website — the model id is an
    opaque handle, so nobody should have to rename their file after it.
    """
    # The sidecar sitting next to the file wins: it is written by whoever put the model
    # there, and describes what is actually on disk.
    meta = {k: v for k, v in (declared or {}).items() if v}
    meta.update({k: v for k, v in _sidecar(owned_dir, model_id).items() if v is not None})
    candidates = []

    declared = meta.get("file")
    if declared:
        # Constrain to the store: a model id and its sidecar both come from the server.
        path = os.path.join(owned_dir, os.path.basename(str(declared)))
        fmt = meta.get("format") or EXTENSION_FORMATS.get(
            os.path.splitext(path)[1].lower(), "sklearn")
        if os.path.isfile(path):
            candidates.append((path, fmt))
        else:
            raise ValueError(
                f"This model's record points at '{os.path.basename(str(declared))}', but that "
                f"file is not in the model folder ({owned_dir}). Copy it there and try again.")
    candidates += _candidate_files(owned_dir, model_id)

    if not candidates:
        raise ValueError(
            f"Model {model_id} is not on this machine ({owned_dir}). A model trained here "
            "is saved automatically when federated training finishes. For a model you "
            f"registered yourself, copy the file into that folder named '{_safe(model_id)}"
            ".joblib' (scikit-learn) or '.pt' (TorchScript), or name it in the model's "
            "record.")

    path, fmt = candidates[0]
    loader = LOADERS.get(fmt)
    if not loader:
        raise ValueError(f"Unsupported model format '{fmt}' for {path}")
    predict, num_classes, class_names = loader(path, meta)
    logger.info("Loaded local model %s (%s) from %s", model_id, fmt, os.path.basename(path))
    return LoadedModel(model_id, fmt, predict, num_classes, class_names,
                       features=meta.get("features"), path=path)

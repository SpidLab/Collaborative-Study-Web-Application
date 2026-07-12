"""Model-weight codec shared by the FL server orchestrator and the Site Agent.

Weights are a list of numpy arrays (a model's state_dict values in order). We
serialize them to a compact .npz in memory and base64-encode so they can ride
inside a JSON job payload / result. Server and agent MUST use the identical
codec — this module is mirrored verbatim in web_application/SiteAgent/fl_local.py.
"""
from __future__ import annotations

import base64
import io

import numpy as np


def encode_weights(arrays: list[np.ndarray]) -> str:
    """list[ndarray] -> base64 string of an .npz (keys w0, w1, ...)."""
    buf = io.BytesIO()
    np.savez(buf, **{f"w{i}": np.asarray(a) for i, a in enumerate(arrays)})
    return base64.b64encode(buf.getvalue()).decode("ascii")


def decode_weights(b64: str) -> list[np.ndarray]:
    """Inverse of encode_weights, preserving order."""
    raw = base64.b64decode(b64.encode("ascii"))
    with np.load(io.BytesIO(raw), allow_pickle=False) as d:
        n = len(d.files)
        return [d[f"w{i}"] for i in range(n)]

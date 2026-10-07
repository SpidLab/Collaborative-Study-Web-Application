"""Membership inference risk analysis — runs entirely on the model owner's machine.

Membership inference asks: given the trained model, can an attacker tell whether a
particular person's genotype was in the training cohort? For genomic studies that is
a direct privacy failure — a cohort is usually defined by having a condition, so
proving membership can reveal the diagnosis.

Two attacks, following the ART tutorial the study is modelled on
(art/attacks/inference/membership_inference):

  * rule-based  — if the model classifies a sample correctly, call it a member.
                  Needs nothing but the model's predictions.
  * black-box   — train a small attack classifier on (prediction vector, true label)
                  pairs drawn from known members and known non-members, then use it
                  on held-back samples. Strictly stronger than the rule.

ART is used when it is installed, so the numbers match the reference implementation;
otherwise an equivalent implementation runs, and the report says which engine
produced it.

WHAT LEAVES THIS MACHINE: aggregate risk metrics only — accuracies, precision/recall,
AUC, a downsampled ROC curve, and per-class true-positive rates. Never the per-sample
membership predictions, which would themselves disclose who was in the cohort.
"""
from __future__ import annotations

import logging

import numpy as np

logger = logging.getLogger("siteagent.mia")

# Points kept when the ROC curve is sent back for plotting.
ROC_POINTS = 100


def _finite(value, default=None):
    """A JSON-safe float. inf/NaN are not representable in JSON, and sklearn's
    roc_curve deliberately returns +inf as its first threshold, so letting one
    through produces a body the browser refuses to parse at all."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return default
    return f if np.isfinite(f) else default


def _json_safe(obj):
    """Recursively replace non-finite floats so the report can always be serialized."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        return _finite(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    return obj


def _art_available():
    try:
        import art  # noqa: F401
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# Metrics
# --------------------------------------------------------------------------- #
def _precision_recall(predicted, actual, positive_value=1):
    """Precision/recall of the attack's "this was a member" calls.

    Mirrors calc_precision_recall in the ART notebook, including its convention of
    returning 1.0 when the denominator is zero (an attack that never guesses
    "member" is vacuously precise).
    """
    predicted = np.asarray(predicted).ravel()
    actual = np.asarray(actual).ravel()
    predicted_positive = int(np.sum(predicted == positive_value))
    actual_positive = int(np.sum(actual == positive_value))
    hits = int(np.sum((predicted == positive_value) & (actual == positive_value)))
    precision = 1.0 if predicted_positive == 0 else hits / predicted_positive
    recall = 1.0 if actual_positive == 0 else hits / actual_positive
    return float(precision), float(recall)


def _attack_accuracies(inferred_members, inferred_non_members):
    """Member accuracy, non-member accuracy, balanced accuracy, and the weighted mean.

    BALANCED accuracy — the plain mean of the two per-class rates — is the headline,
    because it is the only one whose "no better than guessing" point is 0.5 whatever
    the class ratio.

    That matters here: members are the model's 80% training split and non-members the
    20% held out, so the evaluation set is 4:1. On that set an attack that simply says
    "member" every time scores 0.80 on the sample-weighted mean while detecting
    nothing at all. The ART notebook reports the weighted figure because its member and
    non-member sets are the same size; ours are not, so reporting it as though it had a
    0.5 baseline would overstate the risk of every model by ~0.30.

    The weighted figure is still returned, for comparability with the notebook, but it
    is always presented next to the majority-class baseline that makes it readable.
    """
    n_m, n_n = len(inferred_members), len(inferred_non_members)
    member_acc = float(np.sum(inferred_members) / n_m) if n_m else 0.0
    non_member_acc = float(1 - (np.sum(inferred_non_members) / n_n)) if n_n else 0.0
    total = n_m + n_n
    weighted = ((member_acc * n_m + non_member_acc * n_n) / total) if total else 0.0
    balanced = (member_acc + non_member_acc) / 2.0
    majority_baseline = (max(n_m, n_n) / total) if total else 0.5
    return member_acc, non_member_acc, float(balanced), float(weighted), float(majority_baseline)


def _roc_at_fpr(scores, labels, targeted_fpr=0.01):
    """(fpr, tpr, threshold) at the highest TPR whose FPR stays within the target.

    The worst-case view. Average attack accuracy can sit at chance while the attack
    still identifies a handful of members with near-certainty, and it is those
    confident hits that actually expose someone — so this is the number that matters
    most, not the headline accuracy.

    Returns None when no operating point other than the trivial origin qualifies.
    That is not the same as "no members can be identified": with n non-members the
    finest false-positive rate measurable is 1/n, so asking for 1% FPR of 50
    non-members is asking for something the cohort cannot express. Reporting the
    (0, 0) origin in that case would read as a clean bill of health that was never
    actually measured — the caller is expected to say "not measurable" instead.
    """
    from sklearn.metrics import roc_curve
    scores = np.asarray(scores, dtype=float).ravel()
    labels = np.asarray(labels).ravel()
    if len(np.unique(labels)) < 2:
        return None
    fpr, tpr, thresholds = roc_curve(y_true=labels, y_score=scores)
    allowed = np.where(fpr <= targeted_fpr)[0]
    if len(allowed) == 0:
        return None
    idx = allowed[np.argmax(tpr[allowed])]
    if tpr[idx] <= 0.0:
        return None  # only the origin qualifies — nothing was measured
    return float(fpr[idx]), float(tpr[idx]), _finite(thresholds[idx])


def _roc_summary(scores, labels, targeted_fpr=0.01):
    """AUC, a downsampled ROC curve for plotting, and the worst-case operating point."""
    from sklearn.metrics import roc_auc_score, roc_curve
    scores = np.asarray(scores, dtype=float).ravel()
    labels = np.asarray(labels).ravel()
    if len(np.unique(labels)) < 2 or len(scores) == 0:
        return {}
    fpr, tpr, _ = roc_curve(y_true=labels, y_score=scores)
    # Keep the curve small enough to store and plot without losing its shape.
    if len(fpr) > ROC_POINTS:
        keep = np.unique(np.linspace(0, len(fpr) - 1, ROC_POINTS).astype(int))
        fpr, tpr = fpr[keep], tpr[keep]
    out = {
        "auc": float(roc_auc_score(labels, scores)),
        "roc": [[round(float(a), 5), round(float(b), 5)] for a, b in zip(fpr, tpr)],
    }
    n_neg = int(np.sum(labels == 0))
    # The finest false-positive rate this cohort can express. Asking below it cannot
    # be answered, and the report should say so rather than imply a zero result.
    resolution = (1.0 / n_neg) if n_neg else 1.0
    worst = _roc_at_fpr(scores, labels, targeted_fpr)
    if worst:
        out["worst_case"] = {"targeted_fpr": float(targeted_fpr), "fpr": worst[0],
                             "tpr": worst[1], "threshold": worst[2],
                             "fpr_resolution": round(resolution, 5)}
    else:
        out["worst_case_unavailable"] = {
            "targeted_fpr": float(targeted_fpr),
            "fpr_resolution": round(resolution, 5),
            "n_non_members": n_neg,
            "reason": (
                f"No operating point reaches a {targeted_fpr:.1%} false-positive rate on "
                f"{n_neg} non-members — the finest rate this held-out set can express is "
                f"{resolution:.1%}. Audit a larger held-out set, or raise the target, "
                "to measure this."
                if targeted_fpr < resolution else
                f"The attack identified no members at a {targeted_fpr:.1%} false-positive "
                "rate, so there is no high-confidence operating point to report."),
        }
    return out


def _per_class_worst_case(scores, labels, target_labels, class_names, targeted_fpr=0.01):
    """Worst-case TPR per TRUE class of the sample being attacked.

    Leakage is rarely uniform: a class with few training examples is memorised more
    readily, so the people in it are the most exposed. Reporting only the average
    would hide exactly the group most at risk.

    Buckets are the sample's TRUE class, not the model's prediction — the question is
    which real group is exposed, and bucketing by prediction would move a person into
    whichever group the model happened to guess.
    """
    scores = np.asarray(scores, dtype=float).ravel()
    labels = np.asarray(labels).ravel()
    target_labels = np.asarray(target_labels).ravel()
    out = []
    for value in np.unique(target_labels):
        mask = target_labels == value
        if mask.sum() < 4 or len(np.unique(labels[mask])) < 2:
            continue  # too few, or all one membership class — no meaningful ROC
        point = _roc_at_fpr(scores[mask], labels[mask], targeted_fpr)
        if not point:
            continue
        idx = int(value)
        out.append({
            "class": (class_names[idx] if class_names and idx < len(class_names) else str(value)),
            "n": int(mask.sum()),
            "fpr": point[0], "tpr": point[1], "threshold": _finite(point[2]),
        })
    return out


# --------------------------------------------------------------------------- #
# Risk interpretation
# --------------------------------------------------------------------------- #
def assess_risk(attack_accuracy, worst_case_tpr, generalization_gap):
    """Turn the raw numbers into a rating plus an explanation a researcher can act on.

    Two signals, because they fail differently:
      * advantage over guessing — how well membership can be inferred on average
      * TPR at a low false-positive rate — how many members can be identified with
        high confidence, which is what actually exposes an individual
    The generalization gap is reported as the underlying cause, since a model that
    scores far better on its training data than on held-out data is memorising it.
    """
    advantage = max(0.0, float(attack_accuracy) - 0.5)
    tpr = float(worst_case_tpr or 0.0)

    if advantage >= 0.15 or tpr >= 0.20:
        level, summary = "high", (
            "Membership in this model's training data can be inferred well above "
            "chance. Publishing it as-is may reveal which records were used.")
    elif advantage >= 0.05 or tpr >= 0.05:
        level, summary = "moderate", (
            "There is measurable membership leakage. It is not severe, but the model "
            "does carry some signal about which records were in the training data.")
    else:
        level, summary = "low", (
            "Membership inference performs at or near chance. On this evidence the "
            "model does not obviously reveal which records were in the training data.")

    advice = []
    if generalization_gap is not None and generalization_gap >= 0.10:
        advice.append(
            f"The model scores {generalization_gap:.0%} better on data it trained on "
            "than on held-out data. That gap is what membership inference exploits — "
            "more training data, fewer epochs, or stronger regularisation all shrink it.")
    if level != "low":
        advice.append(
            "Options: train for fewer rounds/epochs, add regularisation or dropout, "
            "or train with differential privacy (e.g. DP-SGD) so no single participant "
            "measurably changes the model.")
        advice.append(
            "Until then, consider keeping this model private, or offering it only as a "
            "black-box classification service rather than sharing its metadata widely.")
    return {"level": level, "summary": summary, "advantage": round(advantage, 4),
            "advice": advice}


# --------------------------------------------------------------------------- #
# Model wrapper
# --------------------------------------------------------------------------- #
def _predict_proba(model, X, num_classes, batch_size=256):
    """Class probabilities from whatever kind of local model this is.

    Anything exposing `predict_proba` (a LoadedModel wrapping scikit-learn, TorchScript,
    or our own network) is asked directly; a bare torch module is driven here. Either
    way the result is one column per class, because every attack and metric downstream
    assumes that shape — the binary network emits a single logit, so it is expanded.
    """
    if hasattr(model, "predict_proba"):
        proba = np.asarray(model.predict_proba(X), dtype=np.float64)
        if proba.ndim == 1:
            proba = np.column_stack([1.0 - proba, proba])
        if proba.shape[1] == 1:
            proba = np.column_stack([1.0 - proba[:, 0], proba[:, 0]])
        return proba

    import torch
    model.eval()
    outputs = []
    with torch.no_grad():
        for start in range(0, len(X), batch_size):
            chunk = torch.as_tensor(X[start:start + batch_size], dtype=torch.float32)
            logits = model(chunk)
            if num_classes == 2 and logits.shape[-1] == 1:
                p1 = torch.sigmoid(logits).numpy().ravel()
                outputs.append(np.column_stack([1.0 - p1, p1]))
            else:
                outputs.append(torch.softmax(logits, dim=1).numpy())
    return np.vstack(outputs).astype(np.float64)


# --------------------------------------------------------------------------- #
# Attacks
# --------------------------------------------------------------------------- #
def _rule_based(proba_members, y_members, proba_non_members, y_non_members):
    """Correctly classified => called a member. The ART rule-based attack."""
    inferred_m = (proba_members.argmax(axis=1) == y_members).astype(int)
    inferred_n = (proba_non_members.argmax(axis=1) == y_non_members).astype(int)
    member_acc, non_member_acc, balanced, weighted, majority = _attack_accuracies(
        inferred_m, inferred_n)
    precision, recall = _precision_recall(
        np.concatenate((inferred_m, inferred_n)),
        np.concatenate((np.ones(len(inferred_m)), np.zeros(len(inferred_n)))))
    return {
        "attack": "rule_based",
        "member_accuracy": round(member_acc, 4),
        "non_member_accuracy": round(non_member_acc, 4),
        "attack_accuracy": round(balanced, 4),
        "weighted_accuracy": round(weighted, 4),
        "majority_baseline": round(majority, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "n_members_evaluated": int(len(inferred_m)),
        "n_non_members_evaluated": int(len(inferred_n)),
    }


def _attack_features(proba, y, num_classes):
    """Attack-model input: the prediction vector plus the one-hot true label.

    This is the feature set ART's black-box attack uses — the attacker sees what the
    model said and what the right answer was, and learns that confident-and-correct
    looks like training data.
    """
    one_hot = np.zeros((len(y), num_classes), dtype=np.float64)
    one_hot[np.arange(len(y)), np.asarray(y, dtype=int)] = 1.0
    return np.hstack([proba, one_hot])


def _black_box_native(proba_m, y_m, proba_n, y_n, num_classes, attack_train_ratio, seed):
    """Black-box attack without ART: a random forest over (predictions, true label).

    Same inputs, same split discipline and same reported metrics as the ART path, so
    a report produced here is comparable with one produced there.
    """
    from sklearn.ensemble import RandomForestClassifier

    n_m_fit = max(1, int(len(proba_m) * attack_train_ratio))
    n_n_fit = max(1, int(len(proba_n) * attack_train_ratio))

    X_fit = np.vstack([_attack_features(proba_m[:n_m_fit], y_m[:n_m_fit], num_classes),
                       _attack_features(proba_n[:n_n_fit], y_n[:n_n_fit], num_classes)])
    y_fit = np.concatenate([np.ones(n_m_fit), np.zeros(n_n_fit)])

    attack_model = RandomForestClassifier(n_estimators=100, random_state=seed)
    attack_model.fit(X_fit, y_fit)

    X_m_eval = _attack_features(proba_m[n_m_fit:], y_m[n_m_fit:], num_classes)
    X_n_eval = _attack_features(proba_n[n_n_fit:], y_n[n_n_fit:], num_classes)
    if len(X_m_eval) == 0 or len(X_n_eval) == 0:
        raise ValueError("Not enough samples left to evaluate the attack after fitting it.")

    inferred_m = attack_model.predict(X_m_eval).astype(int)
    inferred_n = attack_model.predict(X_n_eval).astype(int)
    scores_m = attack_model.predict_proba(X_m_eval)[:, 1]
    scores_n = attack_model.predict_proba(X_n_eval)[:, 1]
    return inferred_m, inferred_n, scores_m, scores_n, y_m[n_m_fit:], y_n[n_n_fit:]


def _black_box_art(model, X_m, y_m, X_n, y_n, num_classes, attack_train_ratio, seed):
    """Black-box attack through ART, matching the reference notebook."""
    import torch
    from torch import nn
    from art.attacks.inference.membership_inference import MembershipInferenceBlackBox
    from art.estimators.classification.pytorch import PyTorchClassifier

    n_features = X_m.shape[1]
    # ART needs a classifier whose outputs are one column per class; the binary
    # model has a single logit, so wrap it to present two.
    class _TwoColumn(nn.Module):
        def __init__(self, inner):
            super().__init__()
            self.inner = inner

        def forward(self, x):
            out = self.inner(x)
            if out.shape[-1] == 1:
                # softmax([0, z]) == [1 - sigmoid(z), sigmoid(z)], so this presents
                # the model's actual probabilities. Using [-z, z] would give
                # sigmoid(2z) — monotonic, but no longer the model's own numbers,
                # and these probabilities are the attack's input features.
                return torch.cat([torch.zeros_like(out), out], dim=1)
            return out

    wrapped = _TwoColumn(model)
    classifier = PyTorchClassifier(
        model=wrapped, loss=nn.CrossEntropyLoss(),
        input_shape=(n_features,), nb_classes=num_classes, clip_values=None)

    n_m_fit = max(1, int(len(X_m) * attack_train_ratio))
    n_n_fit = max(1, int(len(X_n) * attack_train_ratio))
    attack = MembershipInferenceBlackBox(classifier, attack_model_type="rf")
    attack.fit(X_m[:n_m_fit].astype(np.float32), y_m[:n_m_fit],
               X_n[:n_n_fit].astype(np.float32), y_n[:n_n_fit])

    X_m_eval, y_m_eval = X_m[n_m_fit:].astype(np.float32), y_m[n_m_fit:]
    X_n_eval, y_n_eval = X_n[n_n_fit:].astype(np.float32), y_n[n_n_fit:]
    if len(X_m_eval) == 0 or len(X_n_eval) == 0:
        raise ValueError("Not enough samples left to evaluate the attack after fitting it.")

    inferred_m = np.asarray(attack.infer(X_m_eval, y_m_eval)).ravel().astype(int)
    inferred_n = np.asarray(attack.infer(X_n_eval, y_n_eval)).ravel().astype(int)
    scores_m = np.asarray(attack.infer(X_m_eval, y_m_eval, probabilities=True)).reshape(len(X_m_eval), -1)[:, -1]
    scores_n = np.asarray(attack.infer(X_n_eval, y_n_eval, probabilities=True)).reshape(len(X_n_eval), -1)[:, -1]
    return inferred_m, inferred_n, scores_m, scores_n, y_m_eval, y_n_eval


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def run_audit(model, X_members, y_members, X_non_members, y_non_members,
              num_classes, class_names=None, attack_train_ratio=0.5,
              targeted_fpr=0.01, seed=42, prefer_art=True, cohort_note=None):
    """Run both attacks and return an aggregate risk report.

    X_members / y_members must be exactly the data the model trained on, and the
    non-members must be data it never saw — otherwise the numbers measure nothing.
    """
    class_names = list(class_names or [])
    y_members = np.asarray(y_members, dtype=int).ravel()
    y_non_members = np.asarray(y_non_members, dtype=int).ravel()

    if len(X_members) < 8 or len(X_non_members) < 8:
        raise ValueError(
            f"Not enough data for a meaningful audit: {len(X_members)} members and "
            f"{len(X_non_members)} non-members. At least 8 of each is needed.")

    proba_m = _predict_proba(model, X_members, num_classes)
    proba_n = _predict_proba(model, X_non_members, num_classes)

    train_accuracy = float(np.mean(proba_m.argmax(axis=1) == y_members))
    held_out_accuracy = float(np.mean(proba_n.argmax(axis=1) == y_non_members))
    generalization_gap = train_accuracy - held_out_accuracy

    rule = _rule_based(proba_m, y_members, proba_n, y_non_members)

    # ART's black-box attack drives a PyTorchClassifier, so it only applies to our own
    # network. A scikit-learn or TorchScript model goes through the built-in attack,
    # which needs nothing but the probabilities every model here can produce.
    is_torch_module = hasattr(model, "eval") and not hasattr(model, "predict_proba")
    if prefer_art and _art_available() and is_torch_module:
        engine = "art"
    elif prefer_art and _art_available():
        engine = "builtin (ART covers PyTorch models only)"
    else:
        engine = "builtin"
    try:
        if engine == "art":  # noqa: SIM108 — the fallback below needs the try/except
            inferred_m, inferred_n, scores_m, scores_n, y_m_eval, y_n_eval = _black_box_art(
                model, X_members, y_members, X_non_members, y_non_members,
                num_classes, attack_train_ratio, seed)
        else:
            inferred_m, inferred_n, scores_m, scores_n, y_m_eval, y_n_eval = _black_box_native(
                proba_m, y_members, proba_n, y_non_members,
                num_classes, attack_train_ratio, seed)
    except Exception as exc:
        if engine != "art":
            raise
        # A model shape or ART version ART can't handle shouldn't cost the whole
        # audit — fall back and say so in the report.
        logger.warning("ART black-box attack failed (%s); using the built-in attack.", exc)
        engine = "builtin (ART failed: %s)" % type(exc).__name__
        inferred_m, inferred_n, scores_m, scores_n, y_m_eval, y_n_eval = _black_box_native(
            proba_m, y_members, proba_n, y_non_members,
            num_classes, attack_train_ratio, seed)

    member_acc, non_member_acc, balanced, weighted, majority = _attack_accuracies(
        inferred_m, inferred_n)
    precision, recall = _precision_recall(
        np.concatenate((inferred_m, inferred_n)),
        np.concatenate((np.ones(len(inferred_m)), np.zeros(len(inferred_n)))))

    scores = np.concatenate((scores_m, scores_n))
    labels = np.concatenate((np.ones(len(scores_m)), np.zeros(len(scores_n))))
    roc = _roc_summary(scores, labels, targeted_fpr)
    per_class = _per_class_worst_case(
        scores, labels, np.concatenate((y_m_eval, y_n_eval)), class_names, targeted_fpr)

    black_box = {
        "attack": "black_box",
        "engine": engine,
        "member_accuracy": round(member_acc, 4),
        "non_member_accuracy": round(non_member_acc, 4),
        "attack_accuracy": round(balanced, 4),
        "weighted_accuracy": round(weighted, 4),
        "majority_baseline": round(majority, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "n_members_evaluated": int(len(inferred_m)),
        "n_non_members_evaluated": int(len(inferred_n)),
        **roc,
    }

    worst_tpr = (roc.get("worst_case") or {}).get("tpr")
    # Balanced accuracy, so 0.5 really is the no-signal point for both attacks.
    # The rating follows whichever attack did better — a defender should be judged
    # against the strongest attack tried, not the average of them.
    headline = max(black_box["attack_accuracy"], rule["attack_accuracy"])
    risk = assess_risk(headline, worst_tpr, generalization_gap)

    return _json_safe({
        "risk": risk,
        "model_accuracy": {
            "on_training_data": round(train_accuracy, 4),
            "on_held_out_data": round(held_out_accuracy, 4),
            "generalization_gap": round(generalization_gap, 4),
        },
        "cohort": {
            "n_members": int(len(X_members)),
            "n_non_members": int(len(X_non_members)),
            "num_classes": int(num_classes),
            "class_names": class_names,
            "attack_train_ratio": float(attack_train_ratio),
        },
        "rule_based": rule,
        "black_box": black_box,
        "per_class_worst_case": per_class,
        "engine": engine,
        "notes": (cohort_note or
            "Members are exactly the samples this model trained on; non-members are "
            "the held-out split it never saw. Only aggregate metrics leave this "
            "machine — never per-sample membership predictions."),
    })

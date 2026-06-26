"""Collaboration status-change email notifications (best-effort, de-duplicated).

Fired on real state transitions (everyone responded; QC/stat results arriving) rather
than on a timer. Each distinct message is sent at most once per collaboration via an
atomic claim on ``collaborations.status_emails_sent.<key>``, so repeated/concurrent
calls (e.g. several agents posting at once) never spam. Every function swallows its
errors — sending email must never break the request that triggered it.
"""
import logging

from bson.objectid import ObjectId

import email_utils

logger = logging.getLogger("notifications")

# A user counts as "QC done" once any per-user QC output exists for them.
QC_FIELDS = ('surviving_samples', 'surviving_snps', 'pca_coords', 'transformed_data')


def _email_for(db, uid):
    try:
        u = db["users"].find_one({"_id": ObjectId(str(uid))}, {"email": 1})
    except Exception:
        u = None
    return (u or {}).get("email")


def _obligated(collab):
    """Participants who must contribute: the creator + every accepted invitee."""
    ids = {str(collab.get("creator_id"))}
    for iu in collab.get("invited_users", []) or []:
        if iu.get("status") == "accepted":
            ids.add(str(iu.get("user_id")))
    ids.discard("None")
    return ids


def _claim(db, uuid, key):
    """Atomically mark a one-time email as sent. Returns True only for the caller that
    actually set the flag, so concurrent posts can't double-send the same message."""
    res = db["collaborations"].update_one(
        {"uuid": uuid, f"status_emails_sent.{key}": {"$ne": True}},
        {"$set": {f"status_emails_sent.{key}": True}},
    )
    return res.modified_count == 1


def notify_started(db, uuid):
    """Everyone invited has responded and QC has kicked off — tell all participants once."""
    try:
        collab = db["collaborations"].find_one({"uuid": uuid})
        if not collab:
            return
        if not _claim(db, uuid, "started"):
            return
        recips = [e for e in (_email_for(db, u) for u in _obligated(collab)) if e]
        if recips:
            email_utils.notify_collaboration_started(recips, collab.get("name", "your study"), uuid)
    except Exception as e:
        logger.warning("started email skipped for %s: %s", uuid, e)


def notify_progress(db, uuid):
    """Call whenever a QC or stat result is stored. Nudges the participant(s) the study
    is waiting on, and tells the initiator when a stage completes. Fully de-duplicated."""
    try:
        collab = db["collaborations"].find_one({"uuid": uuid})
        if not collab:
            return
        obligated = _obligated(collab)
        if len(obligated) < 2:
            return
        name = collab.get("name", "your study")
        creator = str(collab.get("creator_id"))

        # --- QC stage ---
        qc_done = {u for u in obligated if any(u in (collab.get(f) or {}) for f in QC_FIELDS)}
        if qc_done and qc_done != obligated:
            for u in (obligated - qc_done):           # partial: nudge each laggard once
                if _claim(db, uuid, f"qc_action:{u}"):
                    # Re-confirm they're still outstanding, so a stale snapshot from a
                    # near-simultaneous post can't nudge someone who just finished.
                    fresh = db["collaborations"].find_one(
                        {"uuid": uuid}, {f: 1 for f in QC_FIELDS}) or {}
                    if any(u in (fresh.get(f) or {}) for f in QC_FIELDS):
                        continue
                    em = _email_for(db, u)
                    if em:
                        email_utils.notify_action_needed(em, name, uuid, "quality control")
        elif qc_done == obligated:                    # complete: tell the initiator once
            if _claim(db, uuid, "qc_done"):
                em = _email_for(db, creator)
                if em:
                    email_utils.notify_stage_advanced(
                        em, name, uuid, "quality control is complete", "Create the GWAS dataset")

        # --- GWAS-counts stage (only once stats have started arriving) ---
        stats = collab.get("stats", {}) or {}
        if stats:
            stat_done = {u for u in obligated if u in stats}
            if stat_done and stat_done != obligated:
                for u in (obligated - stat_done):
                    if _claim(db, uuid, f"stat_action:{u}"):
                        fresh = db["collaborations"].find_one({"uuid": uuid}, {"stats": 1}) or {}
                        if u in (fresh.get("stats") or {}):
                            continue
                        em = _email_for(db, u)
                        if em:
                            email_utils.notify_action_needed(em, name, uuid, "its GWAS counts")
            elif stat_done == obligated:
                if _claim(db, uuid, "stats_done"):
                    em = _email_for(db, creator)
                    if em:
                        email_utils.notify_stage_advanced(
                            em, name, uuid, "all GWAS counts are in", "Run the GWAS calculation")
    except Exception as e:
        logger.warning("progress email skipped for %s: %s", uuid, e)

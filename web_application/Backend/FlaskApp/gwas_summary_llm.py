"""
GWAS one-page summary via LLM.

Privacy contract:
- We NEVER send raw genotypes, sample IDs, or participant names to the LLM.
- Collaborator user_ids are replaced with stable anonymized labels ("Site A", "Site B", ...).
- Only aggregated chi-square statistics and overall sample counts (per site) are sent.
- The mapping label -> user_id is returned separately to the caller for UI rendering.
"""

from __future__ import annotations

import json
import logging
import math
import os
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("GWAS_SUMMARY_MODEL", "gpt-4o-mini")
SIG_THRESHOLD = 5e-8           # genome-wide significance
SUGGESTIVE_THRESHOLD = 1e-5
TOP_SNP_COUNT = 25


def _site_label(idx: int) -> str:
    """Stable anonymized label: Site A, Site B, ..., Site Z, Site AA, ..."""
    if idx < 26:
        return f"Site {chr(ord('A') + idx)}"
    a, b = divmod(idx, 26)
    return f"Site {chr(ord('A') + a - 1)}{chr(ord('A') + b)}"


def _is_finite_p(p: Any) -> bool:
    try:
        return p is not None and not math.isnan(float(p)) and float(p) > 0
    except (TypeError, ValueError):
        return False


def build_digest(collaboration: dict) -> dict:
    """
    Build a small JSON-friendly digest from the collaboration document.

    The digest is what gets sent to the LLM.
    """
    chi = collaboration.get("chi_square_results") or {}
    stats = collaboration.get("stats") or {}
    if not chi:
        raise ValueError("chi_square_results is not available on the collaboration")

    aggregated = chi.get("aggregated") or {}
    if not aggregated:
        raise ValueError("aggregated chi-square results missing")

    creator_id = str(collaboration["creator_id"])
    invited = collaboration.get("invited_users") or []

    ordered_user_ids: list[str] = []
    if creator_id in chi:
        ordered_user_ids.append(creator_id)
    for iu in invited:
        uid = str(iu.get("user_id"))
        if iu.get("status") == "accepted" and uid in chi and uid not in ordered_user_ids:
            ordered_user_ids.append(uid)

    label_for = {uid: _site_label(i) for i, uid in enumerate(ordered_user_ids)}

    per_site_meta = []
    for uid in ordered_user_ids:
        ustats = stats.get(uid, {})
        n_cases = n_controls = 0
        for _, snp_data in ustats.items():
            case = snp_data.get("case", {}) if isinstance(snp_data, dict) else {}
            control = snp_data.get("control", {}) if isinstance(snp_data, dict) else {}
            n_cases = int(sum(case.get(str(k), 0) for k in range(3)))
            n_controls = int(sum(control.get(str(k), 0) for k in range(3)))
            break
        per_site_meta.append({
            "label": label_for[uid],
            "n_samples": n_cases + n_controls,
            "n_cases": n_cases,
            "n_controls": n_controls,
        })

    snps_total = len(aggregated)
    snps_sig_joint = sum(
        1 for r in aggregated.values()
        if isinstance(r, dict) and _is_finite_p(r.get("p_value")) and float(r["p_value"]) < SIG_THRESHOLD
    )
    snps_suggestive_joint = sum(
        1 for r in aggregated.values()
        if isinstance(r, dict) and _is_finite_p(r.get("p_value")) and float(r["p_value"]) < SUGGESTIVE_THRESHOLD
    )

    snps_significant_per_site: dict[str, int] = {}
    for uid in ordered_user_ids:
        site_results = chi.get(uid, {}) or {}
        snps_significant_per_site[label_for[uid]] = sum(
            1 for r in site_results.values()
            if isinstance(r, dict) and _is_finite_p(r.get("p_value")) and float(r["p_value"]) < SIG_THRESHOLD
        )

    sorted_snps = sorted(
        (
            (str(snp), r) for snp, r in aggregated.items()
            if isinstance(r, dict) and _is_finite_p(r.get("p_value"))
        ),
        key=lambda kv: float(kv[1]["p_value"]),
    )[:TOP_SNP_COUNT]

    top_snps = []
    for snp_id, agg_r in sorted_snps:
        per_site_p: dict[str, float] = {}
        for uid in ordered_user_ids:
            site_r = (chi.get(uid) or {}).get(snp_id)
            if isinstance(site_r, dict) and _is_finite_p(site_r.get("p_value")):
                per_site_p[label_for[uid]] = float(site_r["p_value"])
        top_snps.append({
            "snp": snp_id,
            "joint_chi2": (
                float(agg_r["chi_square"]) if agg_r.get("chi_square") is not None else None
            ),
            "joint_p": float(agg_r["p_value"]),
            "per_site_p": per_site_p,
        })

    top_snp_ids = [t["snp"] for t in top_snps]
    site_concordance: dict[str, dict[str, Any]] = {}
    for uid in ordered_user_ids:
        label = label_for[uid]
        site_results = chi.get(uid) or {}
        ps_top: list[float] = []
        for snp_id in top_snp_ids:
            r = site_results.get(snp_id)
            if isinstance(r, dict) and _is_finite_p(r.get("p_value")):
                ps_top.append(float(r["p_value"]))
        if ps_top:
            median_p = float(np.median(ps_top))
            frac_suggestive = sum(1 for p in ps_top if p < SUGGESTIVE_THRESHOLD) / len(ps_top)
        else:
            median_p, frac_suggestive = None, None
        site_concordance[label] = {
            "median_p_top_snps": median_p,
            "frac_top_snps_suggestive": (
                round(frac_suggestive, 3) if frac_suggestive is not None else None
            ),
            "n_significant_total": snps_significant_per_site.get(label, 0),
        }

    digest = {
        "phenotype": str(
            collaboration.get("phenotype")
            or collaboration.get("experiment_type")
            or "unspecified"
        ),
        "n_collaborators": len(ordered_user_ids),
        "collaborators": per_site_meta,
        "snps_total": snps_total,
        "snps_significant_joint": snps_sig_joint,
        "snps_suggestive_joint": snps_suggestive_joint,
        "significance_threshold_joint": SIG_THRESHOLD,
        "suggestive_threshold": SUGGESTIVE_THRESHOLD,
        "snps_significant_per_site": snps_significant_per_site,
        "site_concordance": site_concordance,
        "top_snps": top_snps,
        # Internal-only; stripped before sending to the LLM.
        "_label_to_user_id": {label_for[uid]: uid for uid in ordered_user_ids},
    }
    return digest


SYSTEM_PROMPT = """You write a one-page analysis report for a GWAS meta-analysis.
You are given a digest containing aggregated chi-square statistics and per-site sample
counts. Individual-level data is never provided. Sites are anonymized as "Site A",
"Site B", etc.

Write in a neutral, analytical voice as a human statistical analyst would.
Do NOT mention AI, language models, automation, or that the report was machine-generated.
Phrase findings as "the data suggest", "these results indicate", etc.

Return STRICT JSON matching this schema (no extra keys, no markdown wrapper):

{
  "overview": "<2-3 sentences: study summary, total samples across sites, number of significant hits at genome-wide significance>",
  "top_snps": "<markdown bullet list of 5-10 most significant SNPs. For each: SNP ID, joint p-value (scientific notation), brief biological context if the SNP is well-characterized in published literature, and which sites contribute signal>",
  "per_collaborator": "<one short paragraph per site labelled by 'Site A', 'Site B', etc., in the order given. For each: does the site agree with the joint signal? Do they add signal, are neutral, or appear to conflict? Cite the site's number of significant SNPs and median p-value on the top SNPs.>",
  "recommendation": {
    "verdict": "continue" | "continue_with_caveats" | "reconsider",
    "headline": "<one bold-worthy sentence summarizing the verdict>",
    "rationale": "<a detailed multi-sentence paragraph (4-6 sentences). Explain WHY this verdict, citing concrete numbers from the digest: number of joint significant SNPs, per-site agreement on the top SNPs, sample sizes, and any concerning asymmetry between sites. Acknowledge risks (small sample size, single-site dominance, lack of biological plausibility, etc.) and the limitations of the current data. End with what specifically would strengthen the conclusion.>",
    "next_steps": "<markdown bullet list of 3-5 concrete next actions the initiator can take: e.g., expand sample size, recruit additional sites with similar phenotype definition, request replication of top SNPs, re-run QC at a stricter threshold, verify phenotype consistency, etc.>"
  }
}

Verdict rules:
- "continue": multiple sites concordantly support joint significant hits.
- "continue_with_caveats": joint hits exist but largely driven by one site, or borderline significance, or large per-site asymmetry.
- "reconsider": no joint significant hits AND no overlap in suggestive signals across sites; OR strong evidence the sites are studying different populations or phenotypes.

Quality rules:
- Use only facts from the digest. Do not invent SNPs, sites, p-values, or sample sizes.
- The "rationale" must cite specific numbers from the digest. Do not write a one-sentence rationale.
- Use scientific notation for very small p-values (e.g. 4.1e-19).
- Do not include any meta commentary about how the report was produced.
"""


def generate_summary(digest: dict, *, model: str | None = None) -> dict:
    """Call OpenAI to produce the structured summary. Raises on misconfiguration."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to the Flask backend env to enable AI summaries."
        )

    try:
        from openai import OpenAI
    except ImportError as e:
        raise RuntimeError(
            "openai package is not installed. Run `pip install -r requirements.txt`."
        ) from e

    client = OpenAI(api_key=api_key)
    public_digest = {k: v for k, v in digest.items() if not k.startswith("_")}

    used_model = model or DEFAULT_MODEL
    logger.info(
        "Requesting GWAS summary from %s (snps=%d, sites=%d, sig=%d)",
        used_model,
        public_digest.get("snps_total", 0),
        public_digest.get("n_collaborators", 0),
        public_digest.get("snps_significant_joint", 0),
    )

    response = client.chat.completions.create(
        model=used_model,
        response_format={"type": "json_object"},
        temperature=0.2,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Produce the JSON report for this digest:\n\n"
                    + json.dumps(public_digest, indent=2)
                ),
            },
        ],
    )

    raw = response.choices[0].message.content or ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("LLM returned non-JSON content: %s", raw[:500])
        raise RuntimeError(f"LLM returned malformed JSON: {e}") from e

    for required in ("overview", "top_snps", "per_collaborator", "recommendation"):
        if required not in parsed:
            raise RuntimeError(f"LLM response missing required field: {required}")

    rec = parsed["recommendation"]
    if not isinstance(rec, dict) or "verdict" not in rec:
        raise RuntimeError("LLM response 'recommendation' is malformed")
    if rec["verdict"] not in {"continue", "continue_with_caveats", "reconsider"}:
        rec["verdict"] = "continue_with_caveats"

    return {
        "model": used_model,
        "schema_version": 1,
        "content": parsed,
        "site_label_map": digest.get("_label_to_user_id", {}),
        "digest_meta": {
            "phenotype": public_digest.get("phenotype"),
            "n_collaborators": public_digest.get("n_collaborators"),
            "snps_total": public_digest.get("snps_total"),
            "snps_significant_joint": public_digest.get("snps_significant_joint"),
            "snps_suggestive_joint": public_digest.get("snps_suggestive_joint"),
        },
    }

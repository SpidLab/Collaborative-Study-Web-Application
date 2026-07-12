#!/usr/bin/env python3
"""
Generate PILOT_DEPLOYMENT_PLAN.pdf for the Collaborative Study Web Application.
Run: python scripts/generate_pilot_deployment_pdf.py
"""

from __future__ import annotations

import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_PDF = os.path.join(REPO_ROOT, "PILOT_DEPLOYMENT_PLAN.pdf")


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "DocTitle",
            parent=base["Title"],
            fontSize=22,
            leading=26,
            alignment=TA_CENTER,
            spaceAfter=12,
            textColor=colors.HexColor("#1a365d"),
        ),
        "subtitle": ParagraphStyle(
            "DocSubtitle",
            parent=base["Normal"],
            fontSize=12,
            leading=16,
            alignment=TA_CENTER,
            spaceAfter=24,
            textColor=colors.HexColor("#4a5568"),
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontSize=16,
            leading=20,
            spaceBefore=18,
            spaceAfter=10,
            textColor=colors.HexColor("#1a365d"),
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontSize=13,
            leading=16,
            spaceBefore=14,
            spaceAfter=8,
            textColor=colors.HexColor("#2c5282"),
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontSize=11,
            leading=14,
            spaceBefore=10,
            spaceAfter=6,
            textColor=colors.HexColor("#2d3748"),
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontSize=10,
            leading=14,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontSize=10,
            leading=13,
            leftIndent=18,
            bulletIndent=8,
            spaceAfter=4,
        ),
        "mono": ParagraphStyle(
            "Mono",
            parent=base["Code"],
            fontSize=8,
            leading=10,
            fontName="Courier",
            backColor=colors.HexColor("#f7fafc"),
            spaceAfter=6,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=base["Normal"],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
        ),
    }
    return styles


def table(data, col_widths=None, header=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style_cmds = [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header and len(data) > 0:
        style_cmds.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf2f7")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ])
    t.setStyle(TableStyle(style_cmds))
    return t


def bullet_list(items, style):
    return [Paragraph(f"• {item}", style) for item in items]


def add_section_title(story, styles, text, level=1):
    key = {1: "h1", 2: "h2", 3: "h3"}[level]
    story.append(Paragraph(text, styles[key]))


def build_story(styles):
    story = []
    today = datetime.now().strftime("%B %d, %Y")

    # Title page
    story.append(Spacer(1, 1.5 * inch))
    story.append(Paragraph("Collaborative Study Web Application", styles["title"]))
    story.append(Paragraph("Pilot Deployment Plan", styles["title"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph(
        "Centralized coordination with local data processing<br/>"
        "for non-technical research collaborators",
        styles["subtitle"],
    ))
    story.append(Spacer(1, 0.5 * inch))
    story.append(Paragraph(f"Document version: 1.0<br/>Date: {today}", styles["subtitle"]))
    story.append(PageBreak())

    # Executive summary
    add_section_title(story, styles, "1. Executive Summary", 1)
    story.append(Paragraph(
        "This document describes the recommended deployment architecture for piloting the "
        "Collaborative Study Web Application with multiple research sites. The goal is to "
        "operate one shared central platform while ensuring that raw genotype data never "
        "leaves each collaborator's institution. Non-technical collaborators install a "
        "simple desktop application once; all heavy quality control (QC), GWAS summary "
        "computation, and PCA run locally. Only privacy-preserving aggregates are transmitted "
        "to the central server for meta-analysis, chi-square testing, sample relatedness, "
        "and collaboration management.",
        styles["body"],
    ))
    story.append(Paragraph(
        "<b>One-sentence summary:</b> One website hosted centrally for everyone, one small "
        "desktop app per collaborator installed once — raw data stays local, only summaries "
        "come to the central server.",
        styles["body"],
    ))
    story.append(Spacer(1, 6))

    # Plain English
    add_section_title(story, styles, "2. Plain-English Overview (for stakeholders)", 1)
    for para in [
        "We keep one website running on our server that everyone logs into. That is where "
        "users sign up, start collaborations, invite partners, and view final results. "
        "Collaborators continue to use the website in their browser exactly as they do today.",
        "The only new step for collaborators is installing a small desktop application "
        "(a signed installer for Mac or Windows, similar to installing Zoom). They open "
        "the app once, paste an invite code from email, register their dataset via a file "
        "picker, and then leave the app running in the background.",
        "When a study on the website needs their data, the desktop app performs all heavy "
        "work on their own computer: QC filtering (missing data, MAF, HWE), PCA, and GWAS "
        "summary statistics. It then sends only safe, aggregated results to our server — "
        "per-SNP case/control counts and PCA coordinates. Raw genotype rows never leave "
        "their machine.",
        "Our central server combines summary results from every site, runs the final "
        "statistical analysis (chi-square meta-analysis, pairwise distances), and displays "
        "results on the website to authorized collaboration members.",
    ]:
        story.append(Paragraph(para, styles["body"]))

    story.append(PageBreak())

    # Current vs target
    add_section_title(story, styles, "3. Current State vs. Target Architecture", 1)
    add_section_title(story, styles, "3.1 Current State (development)", 2)
    story.append(table([
        ["Component", "Technology", "Role"],
        ["Frontend", "React (Vite), Material UI", "User interface; calls Flask API"],
        ["Central Flask", "app.py", "Users, collaborations, chi-square, pairwise, LLM summary"],
        ["Orchestrator", "Node.js + Kubernetes", "Spawns QC worker pods per request"],
        ["QC Worker", "qc_worker.py + Collaborator_Server", "Reads raw genotypes from MongoDB; runs QC"],
        ["Databases", "MongoDB Atlas (2 clusters)", "Central metadata + per-user raw data stores"],
    ], col_widths=[1.2 * inch, 1.5 * inch, 3.8 * inch]))

    story.append(Spacer(1, 10))
    add_section_title(story, styles, "3.2 Target State (pilot)", 2)
    story.append(table([
        ["Layer", "Location", "Responsibility"],
        ["Central website", "Cloud / institutional VM", "Auth, collaborations, metadata, aggregated results, final stats"],
        ["Central API", "Same host as website", "Job queue, enrollment, result ingestion — no raw genotypes"],
        ["MongoDB Atlas", "Managed cloud", "Users, datasets (metadata), collaborations, stats, jobs"],
        ["Desktop Site Agent", "Each collaborator machine", "QC, GWAS summary, PCA on local CSVs"],
        ["Local data", "Collaborator filesystem", "Raw genotype files; never uploaded by default"],
    ], col_widths=[1.3 * inch, 1.5 * inch, 3.7 * inch]))

    story.append(Spacer(1, 10))
    add_section_title(story, styles, "3.3 Key Architectural Invariants", 2)
    story.extend(bullet_list([
        "Central server never receives raw genotype rows in the default pilot configuration.",
        "Local Site Agent uses outbound HTTPS only — no inbound firewall ports required.",
        "No Kubernetes or Docker required on collaborator machines.",
        "No terminal, command line, or developer tooling required for collaborators.",
        "Each site's agent is authenticated with a site-specific token; jobs are scoped per user.",
    ], styles["bullet"]))

    story.append(PageBreak())

    # Data privacy levels
    add_section_title(story, styles, "4. Data Sharing Levels", 1)
    story.append(Paragraph(
        "The application already produces three levels of QC output. For the pilot, "
        "only Levels A and B are transmitted to the central server by default.",
        styles["body"],
    ))
    story.append(table([
        ["Level", "Contents", "Risk", "Pilot default"],
        ["A — Aggregates", "Per-SNP case/control counts (0/1/2); no sample IDs", "Lowest", "Send"],
        ["B — PCA / privacy", "PCA coordinates or privacy-transformed rows", "Medium", "Send"],
        ["C — Cleaned raw", "Post-QC genotype matrix (filtered SNPs/samples)", "Highest", "Never (opt-in only)"],
    ], col_widths=[1.1 * inch, 2.2 * inch, 0.9 * inch, 1.3 * inch]))

    story.append(Spacer(1, 10))
    add_section_title(story, styles, "4.1 What Each Level Enables", 2)
    story.append(table([
        ["Central feature", "Data required", "Level"],
        ["GWAS chi-square meta-analysis", "Per-SNP aggregated counts", "A"],
        ["Sample relatedness", "PCA coordinates per sample", "B"],
        ["Population stratification", "PCA coordinates per sample", "B"],
        ["Re-running QC with different thresholds", "Cleaned matrix", "C (local only)"],
    ], col_widths=[2.0 * inch, 2.5 * inch, 1.0 * inch]))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "<b>Privacy statement for pilot sites:</b> \"Raw genotypes never leave your computer; "
        "we only receive aggregated SNP counts and PCA coordinates.\"",
        styles["body"],
    ))

    story.append(PageBreak())

    # End-to-end flow
    add_section_title(story, styles, "5. End-to-End Collaboration Flow", 1)
    steps = [
        ("Sign-up and dataset registration",
         "Collaborator logs into the central website. They register dataset metadata (phenotype, "
         "sample count). The desktop app discovers the local CSV, computes file hash and dimensions, "
         "and posts metadata to the central server without uploading rows."),
        ("Collaboration invitation",
         "Study initiator creates a collaboration on the website and invites partners. "
         "Existing JWT-based invitation flow is unchanged."),
        ("QC job enqueue",
         "When all parties accept, the central server enqueues a chained_qc job per participant "
         "(Missing → MAF → HWE → PCA) instead of calling the Kubernetes orchestrator."),
        ("Local QC execution",
         "Each site's desktop agent polls for its job, runs QC locally, and posts surviving "
         "SNP IDs, sample IDs, and PCA coordinates (Level A/B) back to the central server."),
        ("GWAS summary",
         "Central server enqueues gwas_summary jobs. Each agent computes per-SNP case/control "
         "counts locally and uploads aggregates."),
        ("Meta-analysis",
         "Initiator triggers chi-square on the central server. Computation uses only aggregated "
         "counts (vectorized NumPy implementation; no raw data required)."),
        ("Relatedness and stratification",
         "Pairwise distances computed on centrally stored PCA coordinates from each site."),
        ("AI summary (optional)",
         "Initiator can generate a one-page GWAS summary via LLM using only aggregated, "
         "anonymized statistics (Site A, Site B labels — no raw data sent to OpenAI)."),
    ]
    for i, (title, desc) in enumerate(steps, 1):
        add_section_title(story, styles, f"5.{i} {title}", 3)
        story.append(Paragraph(desc, styles["body"]))

    story.append(PageBreak())

    # Desktop app
    add_section_title(story, styles, "6. Local Desktop Site Agent", 1)
    add_section_title(story, styles, "6.1 Technology Choice", 2)
    story.append(Paragraph(
        "Recommended stack: <b>PySide6 (Qt)</b> for the user interface plus <b>PyInstaller</b> "
        "to produce signed macOS (.app / .dmg) and Windows (.exe / .msi) installers. The entire "
        "QC pipeline is already Python; this avoids a second toolchain and keeps maintenance simple. "
        "Estimated installer size: approximately 40 MB. No Python installation required on the "
        "collaborator's machine.",
        styles["body"],
    ))

    add_section_title(story, styles, "6.2 Collaborator Onboarding (5 steps)", 2)
    story.extend(bullet_list([
        "Download signed installer from email link (Mac or Windows).",
        "Install: drag to Applications (Mac) or Next-Next-Finish (Windows).",
        "Open app, paste invite code from email.",
        "Click \"Add dataset,\" select CSV via file dialog, enter phenotype name.",
        "Use the central website in browser for collaborations; app handles processing automatically.",
    ], styles["bullet"]))

    add_section_title(story, styles, "6.3 Application Features", 2)
    story.extend(bullet_list([
        "Main window: connection status, registered datasets, activity log.",
        "System tray / menu bar icon for background operation.",
        "Long-poll connection to central server for job delivery.",
        "Local file reads only from user-selected paths.",
        "Privacy tripwire: refuses to POST payloads containing raw genotype matrices.",
        "Auto-update check on startup via central /agent/version endpoint.",
        "Logs written to OS-standard log directory for support troubleshooting.",
    ], styles["bullet"]))

    add_section_title(story, styles, "6.4 Code Reuse Mapping", 2)
    story.append(table([
        ["Existing code", "Role in desktop agent"],
        ["Collaborator_Server/*.py", "QC algorithms (MAF, HWE, Missing, PCA, privacy)"],
        ["gwas_summary.py", "GWAS per-SNP count generation"],
        ["qc_worker.py action handlers", "Lifted to shared actions.py module"],
        ["orchestrator_client.py", "Replaced by JobsClient (agent → central HTTP)"],
    ], col_widths=[2.2 * inch, 4.3 * inch]))

    add_section_title(story, styles, "6.5 Code Signing Requirements", 2)
    story.append(Paragraph(
        "Before distributing to pilot sites, installers must be code-signed and notarized "
        "(macOS) or signed with an OV/EV certificate (Windows). Without this, operating systems "
        "display security warnings that block many non-technical users and trigger IT review.",
        styles["body"],
    ))

    story.append(PageBreak())

    # Job polling security
    add_section_title(story, styles, "7. Job Polling and Site Isolation", 1)
    story.append(Paragraph(
        "The desktop agent uses a pull model: it periodically calls "
        "<font face='Courier'>GET /api/agent/jobs/next</font> with its bearer token. "
        "The central server authenticates the token, identifies the associated user_id, and "
        "returns only jobs tagged for that user. Jobs for other collaborators are never exposed "
        "to this agent.",
        styles["body"],
    ))
    add_section_title(story, styles, "7.1 Enrollment Flow", 2)
    story.extend(bullet_list([
        "Administrator generates an enrollment / invite code tied to a specific user account.",
        "Collaborator pastes code into desktop app on first launch.",
        "Central server validates code and issues a long-lived bearer token.",
        "Token stored locally in app config (e.g. ~/Library/Application Support/CollabStudy/).",
        "All subsequent API calls include Authorization: Bearer &lt;token&gt;.",
    ], styles["bullet"]))

    add_section_title(story, styles, "7.2 Job Creation", 2)
    story.append(Paragraph(
        "When a collaboration requires processing from N sites, the central server creates N "
        "separate jobs in the jobs collection, each tagged with the corresponding user_id. "
        "This mirrors the existing per-user dataset binding in app.py. Analogy: like email — "
        "everyone connects to the same server, but each inbox only receives messages addressed "
        "to that account.",
        styles["body"],
    ))

    story.append(PageBreak())

    # Central API
    add_section_title(story, styles, "8. Central Server Changes", 1)
    add_section_title(story, styles, "8.1 New Jobs API Endpoints", 2)
    story.append(table([
        ["Endpoint", "Method", "Purpose"],
        ["/api/agent/enroll", "POST", "Exchange invite code for bearer token"],
        ["/api/agent/datasets", "GET", "List datasets owned by this site"],
        ["/api/agent/datasets/{id}/metadata", "POST", "Register metadata + file hash (no rows)"],
        ["/api/agent/jobs/next", "GET", "Long-poll next job for authenticated site"],
        ["/api/agent/jobs/{id}/result", "POST", "Upload job results (Level A/B)"],
        ["/api/agent/version", "GET", "App version check for auto-update"],
    ], col_widths=[2.0 * inch, 0.7 * inch, 3.8 * inch]))

    add_section_title(story, styles, "8.2 Flask Refactoring", 2)
    story.extend(bullet_list([
        "Replace orchestrator.submit_* calls with enqueue_job(...) writes to db.jobs collection.",
        "Remove central-server reads/writes to CollaboratorDB per-user raw data collections.",
        "Set USE_ORCHESTRATOR=false for pilot deployment.",
        "Add MAX_CONTENT_LENGTH and gzip support for agent result uploads.",
        "Frontend: use VITE_API_URL environment variable instead of hardcoded localhost.",
    ], styles["bullet"]))

    add_section_title(story, styles, "8.3 Environment Variables (Central)", 2)
    story.append(table([
        ["Variable", "Purpose"],
        ["MONGO_URI", "MongoDB Atlas connection (collaborative study cluster)"],
        ["SECRET_KEY", "JWT signing (rotate before pilot)"],
        ["AGENT_ENROLLMENT_SIGNING_KEY", "Mint and verify site enrollment codes"],
        ["ALLOWED_ORIGINS", "CORS for production frontend URL"],
        ["USE_ORCHESTRATOR", "Set to false for pilot"],
        ["OPENAI_API_KEY", "Optional: GWAS AI summary for initiators"],
    ], col_widths=[2.2 * inch, 4.3 * inch]))

    add_section_title(story, styles, "8.4 Central Hosting Options", 2)
    story.append(table([
        ["Option", "Components", "Estimated cost", "Best for"],
        ["Simple PaaS", "Render/Fly/Railway + Atlas + Cloudflare Pages", "$30–60/month", "Fast pilot launch"],
        ["AWS", "ECS Fargate + Atlas + S3/CloudFront", "Variable", "Production scale"],
        ["Institutional VM", "Docker Compose (Flask + Nginx) + Atlas", "Existing infra", "IRB / data residency"],
    ], col_widths=[1.1 * inch, 2.3 * inch, 1.0 * inch, 2.1 * inch]))

    story.append(PageBreak())

    # Upload strategy
    add_section_title(story, styles, "9. Result Upload Strategy (POST Size)", 1)
    story.append(Paragraph(
        "For typical pilot datasets, a single gzipped HTTPS POST is sufficient. The agent "
        "automatically selects the appropriate tier based on payload size.",
        styles["body"],
    ))
    story.append(table([
        ["Dataset scale", "GWAS counts (gzip)", "PCA coords (gzip)", "Tier"],
        ["471 samples × 3K SNPs", "~60 KB", "~250 KB", "1 — single POST"],
        ["5K samples × 500K SNPs", "~3 MB", "~1 MB", "1 — single POST"],
        ["100K samples × 5M SNPs", "~30 MB", "~15 MB", "2 — chunked POST"],
        [">100 MB total", "—", "—", "3 — presigned S3/R2 URL"],
    ], col_widths=[1.5 * inch, 1.2 * inch, 1.2 * inch, 2.6 * inch]))

    story.append(Spacer(1, 8))
    story.extend(bullet_list([
        "Tier 1 (≤5 MB gzip): Single POST with Content-Encoding: gzip.",
        "Tier 2 (5–100 MB): Chunked POST with finalize flag; merge server-side.",
        "Tier 3 (>100 MB): Presigned URL to object storage (Cloudflare R2, Backblaze B2, or S3).",
        "MongoDB 16 MB document limit: large results stored in qc_results collection with batching (existing pattern).",
    ], styles["bullet"]))

    story.append(PageBreak())

    # Security
    add_section_title(story, styles, "10. Security and Privacy", 1)
    story.extend(bullet_list([
        "Outbound-only network from site agents — simplifies institutional firewall approval.",
        "Per-site bearer tokens scoped to own datasets and collaborations only.",
        "Agent egress filter: refuse payloads containing raw data keys or exceeding size thresholds.",
        "SHA-256 file hash registration for dataset integrity without uploading file contents.",
        "Optional TLS certificate pinning in agent for central server.",
        "Audit log: all job creation, completion, and metadata updates in audit_events collection.",
        "LLM summary: only aggregated, anonymized digest sent to OpenAI; no raw genotypes or sample IDs.",
        "GDPR/HIPAA narrative: central server holds de-identified aggregates; raw data remains at site.",
    ], styles["bullet"]))

    story.append(PageBreak())

    # Rollout
    add_section_title(story, styles, "11. Pilot Rollout Timeline", 1)
    story.append(table([
        ["Week", "Focus", "Deliverables"],
        ["Week 1", "Central refactor", "Jobs API, enqueue_job migration, agent auth, production frontend deploy"],
        ["Week 2", "Desktop agent", "actions.py extraction, PySide6 app, PyInstaller, code signing pipeline"],
        ["Week 3", "Pilot validation", "E2E on eye_color dataset; first external site; audit log review"],
    ], col_widths=[0.7 * inch, 1.3 * inch, 4.5 * inch]))

    story.append(Spacer(1, 10))
    add_section_title(story, styles, "11.1 Validation Criteria", 2)
    story.extend(bullet_list([
        "Chi-square results match current development environment on same dataset.",
        "Pairwise distance matrices match within numerical tolerance.",
        "No raw genotype documents written to central MongoDB during pilot flow.",
        "Collaborator completes onboarding without terminal or Docker.",
        "Job isolation verified: Site A agent never receives Site B jobs.",
    ], styles["bullet"]))

    story.append(PageBreak())

    # Decisions
    add_section_title(story, styles, "12. Decisions Required Before Implementation", 1)
    story.append(table([
        ["#", "Decision", "Recommendation"],
        ["1", "Privacy posture: send only Levels A + B?", "Yes — never raw rows by default"],
        ["2", "OS coverage for pilot installers", "macOS + Windows; add Linux if required"],
        ["3", "Central hosting provider", "Choose based on IT constraints"],
        ["4", "Retire K8s orchestrator for pilot?", "Yes — simplifies collaborator experience"],
        ["5", "Local dataset file naming convention", "e.g. data/<phenotype>.csv"],
    ], col_widths=[0.3 * inch, 2.5 * inch, 3.7 * inch]))

    story.append(Spacer(1, 12))
    add_section_title(story, styles, "13. What Stays vs. What Changes", 1)
    story.append(table([
        ["Category", "Keep unchanged", "Change for pilot"],
        ["Algorithms", "MAF, HWE, Missing, PCA, privacy, GWAS summary, chi-square", "—"],
        ["UI", "React collaboration flows, GWAS tables, AI summary card", "API URL config only"],
        ["Central DB schema", "collaborations.stats, surviving_snps, chi_square_results", "—"],
        ["Infrastructure", "—", "Job queue replaces orchestrator; raw data off central Atlas"],
        ["Collaborator UX", "—", "Desktop app replaces K8s/Docker/terminal"],
    ], col_widths=[1.0 * inch, 2.5 * inch, 2.9 * inch]))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Collaborative Study Web Application — Pilot Deployment Plan v1.0 — {today}",
        styles["footer"],
    ))

    return story


def main():
    os.makedirs(os.path.dirname(OUTPUT_PDF) or ".", exist_ok=True)
    styles = build_styles()
    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Pilot Deployment Plan",
        author="Collaborative Study Web Application",
    )
    story = build_story(styles)
    doc.build(story)
    print(f"Generated: {OUTPUT_PDF}")
    print(f"Size: {os.path.getsize(OUTPUT_PDF) / 1024:.1f} KB")


if __name__ == "__main__":
    main()

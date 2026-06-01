# Collaborative Study Web Application — Technical Overview

> **Architecture update (pilot):** The Node.js + Kubernetes orchestrator and the
> per-user CollaboratorDB have been **removed**. QC/GWAS now run on each
> collaborator's machine via a headless **Site Agent**
> ([web_application/SiteAgent](./web_application/SiteAgent/README.md)) that polls
> the central server for jobs (`db.jobs`) and uploads only derived outputs
> (surviving SNP/sample IDs, PCA coordinates, privacy-transformed matrices,
> per-SNP counts). The central server stores **metadata + aggregates only — never
> raw genotype rows**. Agent endpoints live under `/api/agent/*` (see
> [agent_api.py](./web_application/Backend/FlaskApp/agent_api.py)). Deployment is a
> single cost-effective EC2 host — see [deploy/README.md](./deploy/README.md).
> Sections 10 (Orchestrator) and 4.2 (CollaboratorDB) below are historical.

This document is intended for **developers**, **reviewers**, and **AI assistants** that need full context on architecture, data flows, and major features. For step-by-step runbooks, see also [START_SERVICES.md](./START_SERVICES.md), [ENV_VARIABLES_DOCUMENTATION.md](./ENV_VARIABLES_DOCUMENTATION.md), and [COMPLETE_FLOW_WALKTHROUGH.md](./COMPLETE_FLOW_WALKTHROUGH.md).

---

## Table of contents

1. [Purpose](#1-purpose)
2. [High-level architecture](#2-high-level-architecture)
3. [Repository layout (conceptual)](#3-repository-layout-conceptual)
4. [Data stores: two MongoDB contexts](#4-data-stores-two-mongodb-contexts)
5. [Authentication](#5-authentication)
6. [Collaboration lifecycle](#6-collaboration-lifecycle)
7. [Quality control (QC)](#7-quality-control-qc)
8. [Population stratification & threshold logic](#8-population-stratification--threshold-logic)
9. [GWAS pipeline](#9-gwas-pipeline)
10. [Orchestrator & workers](#10-orchestrator--workers)
11. [Frontend highlights](#11-frontend-highlights)
12. [Privacy & security notes](#12-privacy--security-notes)
13. [Known implementation details & pitfalls](#13-known-implementation-details--pitfalls)
14. [Related documentation in this repo](#14-related-documentation-in-this-repo)

---

## 1. Purpose

A **web platform for multi-site genomic collaboration**. Researchers:

- Share **metadata** and coordinate **collaborations**
- Run **QC** on local/per-user data (often via orchestrated workers)
- Optionally **chain** multiple filter QC steps (missingness → MAF → HWE → PCA)
- Run **pairwise QC** across participants (sample relatedness, population stratification)
- Build **GWAS summary statistics** per participant and compute **aggregated chi-square** results from pooled summary tables

The design emphasizes **not exchanging raw genotype files as the primary collaboration artifact**—instead using **dataset metadata**, **QC-filtered representations**, and **summary statistics** stored in the collaboration document, with optional **privacy-oriented transforms**.

---

## 2. High-level architecture

| Layer | Technology | Role |
|--------|------------|------|
| **Frontend** | React, Material UI, Axios | Login/register, collaborations, uploads, QC/GWAS UI, thresholds |
| **Main API** | Flask (`web_application/Backend/FlaskApp/app.py`) | REST API, JWT auth, collaborations, datasets, QC initiation, GWAS, chi-square aggregation |
| **Orchestrator** | Node.js (`web_application/Backend/FlaskApp/ORCHISTRATION SERVER/server.js`) | Job queue, spawns QC worker pods/containers |
| **QC / GWAS worker** | Python (`.../ORCHISTRATION SERVER/qc_worker.py`) | Executes QC actions, chained QC, GWAS summary generation; reads CollaboratorDB; writes Collaborative Study DB where configured |
| **QC libraries** | Python (`web_application/Backend/FlaskApp/Collaborator_Server/`) | MAF, HWE, Missing Data, PCA handler, privacy transform, sample relatedness, etc. |

---

## 3. Repository layout (conceptual)

```
Collaborative-Study-Web-Application/
├── README.md
├── PROJECT_TECHNICAL_OVERVIEW.md   ← this file
├── web_application/
│   ├── Frontend/                   # React SPA
│   └── Backend/
│       └── FlaskApp/
│           ├── app.py              # Main Flask application
│           ├── orchestrator_client.py
│           ├── stats.py            # Chi-square / multiprocessing
│           ├── Collaborator_Server/  # QC modules (MAF, HWE, missing, PCA, privacy, relatedness)
│           └── ORCHISTRATION SERVER/   # Node orchestrator + qc_worker.py + gwas_summary.py
└── (other tooling / datasets / docs at repo root)
```

---

## 4. Data stores: two MongoDB contexts

### 4.1 Collaborative Study cluster (main app DB)

Used by Flask (`MONGO_URI`, database often `test`). Typical collections:

| Collection | Purpose |
|------------|---------|
| `users` | Accounts (name, email, password hash) |
| `datasets` | User datasets: metadata + genotype `data` (dict), flags like `is_qc_data`, `collaboration_specific` |
| `collaborations` | Collaboration documents: `uuid`, `creator_id`, `creator_dataset_id`, `invited_users[]`, `qc_scheme`, `threshold`, `stats`, `chi_square_results`, `surviving_snps`, `surviving_samples`, filtered QC results, auto-QC flags, etc. |
| `qc_results` | Optional overflow storage for very large QC result arrays |

### 4.2 CollaboratorDB cluster (per-user lab data)

Separate Mongo connection used by **QC workers** for:

- `rawdata` — raw CSV text per phenotype/user
- `qcdata` — QC outputs

Workers **must** also receive **`COLLABORATIVE_STUDY_MONGO_URI`** and **`COLLABORATIVE_STUDY_DB`** so they can update `collaborations` / `datasets` on the **same** cluster Flask uses (not only CollaboratorDB).

---

## 5. Authentication

- **POST `/api/register`** — `name`, `email`, `password`
- **POST `/api/login`** — returns JWT
- Protected routes: `Authorization: Bearer <token>`

---

## 6. Collaboration lifecycle

1. **Metadata** (`/api/upload_csv_qc`): creates a dataset row (phenotype, sample count, empty `data` until raw upload).
2. **Start collaboration** (`POST /api/start_collaboration`):  
   - `collabName`, `experiments` (e.g. GWAS), **`collabQcScheme`**: `[{ "method": "...", "params": { ... } }, ...]`  
   - `creatorDatasetId`, `invitedUsers` with `_id`, `dataset_id`, `phenotype`  
   - Backend creates **per-invite `user_dataset_id`** rows (`collaboration_specific: true`) for isolation between collaborations.
3. **Invitations** (`GET /api/invitations`): initiator vs invitee views; includes experiments, QC scheme, optional **`my_dataset_info`** (phenotype + samples for **current user only**).
4. **Accept / reject** (`/api/acceptinvitation`, `/api/rejectinvitation`): updates `invited_users[].status`.
5. **Auto chained QC** (when all invitees have responded, no `pending`): backend can submit **chained filter QC** for initiator + **accepted** collaborators via orchestrator (`create_chained`), store surviving lists and refresh cleaned dataset content.

---

## 7. Quality control (QC)

### 7.1 Per-user filter QC (chained)

**Orchestrator/worker action:** `create_chained`

**Processing order** (fixed in worker; not UI checkbox order):

1. **Missing Data QC** — threshold on missing rate; filters **individuals** and/or **SNPs** (configurable params).
2. **MAF** — minor allele frequency threshold (e.g. 0.05); `combined` vs `separate` methods.
3. **HWE** — Hardy–Weinberg equilibrium p-value threshold (e.g. 1e-6); population/method per `HardyWeinbergQC`.
4. **PCA** (when selected) — transforms SNP matrix to PCs via `PCAHandler` (pretrained model + scaler).

**Outputs:**

- Filtered dataframe written to CollaboratorDB `qcdata` as applicable
- **`surviving_snps`** / **`surviving_samples`** stored on `collaborations` keyed by user id
- **Collaborative Study `datasets`** document for that user may be updated with **cleaned** `data` so downstream **pairwise QC** uses filtered genotypes

### 7.2 Pairwise QC (cross-user)

Triggered via **`POST /api/datasets/<collab_uuid>`** (`initiate_qc`) with `qc_scheme` listing methods such as:

- **Sample Relatedness** — combined dataset → `compute_coefficients_array` → `phi_value` per pair
- **Population Stratification** — PCA-based distances (see [§8](#8-population-stratification--threshold-logic))

Results stored under collaboration keys such as `full_qc`, `population_stratification` (or externalized to `qc_results` if huge).

---

## 8. Population stratification & threshold logic

1. **Data assembly:** `get_combined_datasets_for_pca` loads **accepted** invitee datasets + builds **`creator_df`** from creator dataset; combined frame used for PCA-distance computation.

2. **Distance:** `calculate_pairwise_distances_pca`:
   - Numeric columns only
   - **Euclidean** distance between each **creator** row and each **combined** row
   - **Min–max normalization** of distances to **[0, 1]**

3. **Threshold** (user-submitted, stored on collaboration):
   - For Population Stratification: **keep** pairs where **`distance <= threshold`**
   - Logic mirrors relatedness filtering but uses key **`distance`** instead of **`phi_value`**

4. **Filtered sample lists:** `POST /api/datasets/<uuid>/qc-results` produces per-user **`filtered_qc_population_stratification`** (naming pattern may vary slightly—see `app.py` for exact key).

**Interpretation:** Lower distance ≈ more similar genetic background (in PC space) to the reference (creator) set; threshold controls how strict that match must be.

---

## 9. GWAS pipeline

1. **Optional / automated:** Create GWAS summary dataset — orchestrator runs **`create_gwas_summary`**:
   - Loads raw data from CollaboratorDB `rawdata`
   - Case/control from **`case_ids.txt` / `control_ids.txt`** (worker image) or phenotype column / map
   - Optional **`snp_ids_to_include`** from **`collaborations.surviving_snps[user]`** after chained QC
   - Writes **`collaborations.stats[user_id]`** as SNP → contingency-style counts

2. **Association:** Flask **`calculate_and_store_chi_square_results`**:
   - Aggregates tables across **creator + accepted** users
   - **Batched** `calc_chi_pvalue` (see `stats.py`) for performance
   - Stores **`chi_square_results`** including **`aggregated`**

3. **Frontend:** Must treat empty objects vs `"complete"` status carefully when displaying results.

---

## 10. Orchestrator & workers

- **Flask** uses **`orchestrator_client.py`** to call orchestrator HTTP API (`/qc/process`, `/gwas/process`).
- **Environment:** `USE_ORCHESTRATOR`, `ORCHESTRATOR_URL`, worker image, pod limits, **`COLLABORATIVE_STUDY_MONGO_URI`**, **`COLLABORATIVE_STUDY_DB`** passed into workers.
- **Docker:** `ORCHISTRATION SERVER/Dockerfile.qc_worker` builds image with `qc_worker.py`, `gwas_summary.py`, QC modules, optional case/control ID files.

See [ORCHISTRATION SERVER/BUILD.md](./web_application/Backend/FlaskApp/ORCHISTRATION%20SERVER/BUILD.md), [INTEGRATION_GUIDE.md](./web_application/Backend/FlaskApp/ORCHISTRATION%20SERVER/INTEGRATION_GUIDE.md).

---

## 11. Frontend highlights

| Area | Notes |
|------|--------|
| **Start collaboration** | GWAS experiment type; QC scheme with **thresholds** for MAF / HWE / Missing; `collabQcScheme` as objects |
| **Collaborations page** | Quick view: experiments (GWAS), QC chips, **your dataset** phenotype/samples; experiment labels normalized |
| **Collaboration details** | Chained QC messaging, pairwise QC (resolve **pairwise** method name from scheme, not `[0]`), GWAS dataset creation, GWAS run/results |
| **Upload / metadata** | Phenotype + sample count; success copy can say “Metadata uploaded successfully” |

---

## 12. Privacy & security notes

- **Privacy transform** and **optional Laplace noise** (e.g. in PCA path) exist in codebase; whether they run depends on **selected QC path and parameters**.
- **Production** still requires: TLS, secret management, network isolation, RBAC, and **IRB** governance—the app assists workflow but does not replace institutional compliance.
- **NIH-style narrative** often emphasizes federated/summary-level analysis and optional differential-privacy-style mechanisms; align claims with what is **actually enabled in deployment**.

---

## 13. Known implementation details & pitfalls

| Topic | Detail |
|-------|--------|
| **QC scheme shape** | Stored as `[{method, params}]`; legacy string entries normalized on read |
| **Mixed MAF + pairwise** | UI/API must pick **pairwise** method (Population Stratification / Sample Relatedness), not first list item |
| **`snp_ids_to_include`** | `gwas_summary.raw_to_gwas_stat` must accept this kwarg or worker errors |
| **Chi-square display** | `{}` is truthy in JS—check `status === 'complete'` and keys length |
| **Dataset dropdown duplicates** | Backend may dedupe raw rows by phenotype+samples and exclude `collaboration_specific` from initiator list |
| **Mongo clusters** | Workers writing only to CollaboratorDB cannot update collaborations—must set Collaborative Study URI |

---

## 14. Related documentation in this repo

| Document | Topic |
|----------|--------|
| [README.md](./README.md) | Project intro |
| [START_SERVICES.md](./START_SERVICES.md) | Running services |
| [ENV_VARIABLES_DOCUMENTATION.md](./ENV_VARIABLES_DOCUMENTATION.md) | Environment variables |
| [COMPLETE_FLOW_WALKTHROUGH.md](./COMPLETE_FLOW_WALKTHROUGH.md) | End-to-end flow |
| [END_TO_END_TESTING_GUIDE.md](./END_TO_END_TESTING_GUIDE.md) | Testing |
| [SETUP_KUBERNETES.md](./SETUP_KUBERNETES.md) | K8s |
| [CONTAINER_LIFECYCLE_EXPLANATION.md](./CONTAINER_LIFECYCLE_EXPLANATION.md) | Containers |
| [REBUILD_STEPS.md](./REBUILD_STEPS.md) | Rebuild |
| [METADATA_UPLOAD_ORCHESTRATOR_FLOW.md](./METADATA_UPLOAD_ORCHESTRATOR_FLOW.md) | Metadata + orchestrator |
| `web_application/Backend/FlaskApp/Collaborator_Server/README_*.md` | MAF / HWE / Missing QC behavior |

---

## Appendix A — QC chain order (filter methods)

When **Missing**, **MAF**, **HWE**, and **PCA** are all selected, execution order is:

**Missing → MAF → HWE → PCA**

---

## Appendix B — Key REST surfaces (non-exhaustive)

| Method | Path | Role |
|--------|------|------|
| POST | `/api/register`, `/api/login` | Auth |
| POST | `/api/upload_csv_qc` | Metadata dataset creation |
| GET/POST | `/api/start_collaboration` | Load form data / create collaboration |
| GET | `/api/invitations` | List collaborations for dashboard |
| POST | `/api/acceptinvitation`, `/api/rejectinvitation` | Invite response |
| POST | `/api/qc/create_chained` | Manual chained QC (also auto-triggered in flow) |
| POST | `/api/datasets/<uuid>` | Initiate pairwise QC |
| GET/POST | `/api/datasets/<uuid>/qc-results` | Fetch matrices / apply threshold filter |
| POST | `/api/create_gwas_dataset` | GWAS summary generation via orchestrator |
| Various | GWAS chi-square routes in `app.py` | Store/retrieve aggregated results |

*(Exact route names may vary slightly—always confirm in `app.py`.)*

---

## Appendix C — Suggested blurb for yearly reports (NIH)

*Short paragraph you can adapt:*

> We extended the collaborative sandbox to support chained per-site QC (missingness, MAF, HWE, PCA), automated QC dataset creation upon collaboration activation, user-configurable QC thresholds, and orchestrated GWAS summary generation with aggregated chi-square association testing on pooled summary statistics—reducing manual steps while keeping analysis within a federated, privacy-aware workflow.

---

*Last updated: generated as a project-wide technical overview for maintainers and AI context. Adjust deployment-specific claims to match your environment.*

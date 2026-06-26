# Manual end-to-end test on a single machine

This walks the **whole system by hand** on one computer: the website, a real
collaboration with an invitation, two local agents polling for jobs, QC running
locally (including **Population Stratification / PCA**), results coming back, and the
pilot-feedback features (≥2-participant guard, no-QC-scheme block, search-by-name,
collaborator filter, form reset, "My Data", agent friendly startup log + auto
re-enroll, status emails, and **QC-failure retry**).

You use **two accounts and two agents** on one machine to exercise the multi-site flow.

## Test data (3000-SNP, real subsets of `data_party_a.csv`)
Under `web_application/SiteAgent/raw-data/`:
- `eye_color/rawdata.csv` — 35 samples × **3000 SNPs**, `phenotype` column (case/control),
  plus `case_ids.txt`/`control_ids.txt`.
- `eye_color2/rawdata.csv` — **another 35 samples, non-overlapping**, same 3000 SNPs.

Two folders (= two "sites") so both agents, sharing one machine, read different files.
Because both carry the full 3000-SNP panel, **Population Stratification (PCA) works** —
which it can't on the tiny 12-SNP `blood_pressure` sample (that one is only for a quick
filter-only check; it will deliberately **fail** a PCA scheme now, see "Retry" below).

---

## 0. Prerequisites
Docker, Python 3.10+, Node 18+. Open ~5 terminals.

## 1. MongoDB (Terminal 1)
```bash
docker rm -f collab-mongo 2>/dev/null; docker run -d --name collab-mongo -p 27017:27017 mongo:7
```

## 2. Backend (Terminal 2) — port 5050, email ON
```bash
cd web_application/Backend/FlaskApp
python3 -m venv .venv 2>/dev/null; source .venv/bin/activate
pip install -q -r requirements.txt
export MONGO_URI="mongodb://localhost:27017"
export SECRET_KEY="dev-secret-please-change"
export PORT=5050
# Optional email (leave unset to skip email; everything else still works):
export SMTP_USER="collabstudy.noreply@gmail.com"
export SMTP_PASS="your-16-char-app-password"
export EMAIL_FROM="collabstudy.noreply@gmail.com"
export EMAIL_FROM_NAME="Collaborative Study"
export APP_BASE_URL="http://localhost:5173"
python app.py            # http://localhost:5050
```

## 3. Frontend (Terminal 3)
```bash
cd web_application/Frontend
npm install
VITE_API_URL=http://localhost:5050 npm run dev    # http://localhost:5173
```

## 4. Two accounts + a collaboration (browser, http://localhost:5173)
Use real inboxes you can open if you want to see the emails. Two windows (one normal +
one incognito) so both stay logged in.

1. **Register User A** and **User B** (✅ message says "you can now log in", not "verify email").
2. Register dataset metadata (**Metadata** page):
   - **User A** → phenotype **`eye_color`**, samples **35**.
   - **User B** → phenotype **`eye_color2`**, samples **35**.
   (✅ each user: check the **My Data** page — your dataset is listed.)
3. As **A** → **Start Collaboration**:
   - ✅ deselect all QC schemes → **Create** is disabled (A2). Re-select.
   - QC scheme: **Missing Data QC + MAF + HWE + Population Stratification** (the 3000-SNP
     data supports PCA now).
   - Experiment **GWAS**, pick A's **`eye_color`** dataset, ✅ use the **name** search to
     find **B**, invite B (pick B's **`eye_color2`**). Create. (✅ form resets afterward.)
4. As **A**, open the collaboration → ✅ amber "needs ≥2 participants" banner while B is pending.
5. As **B** → Invitations → **Accept**. Banner clears; QC auto-queues for both.

## 5. Connection codes (browser)
For **A** and **B**: account menu → **Edit Profile → Connect my computer → Generate code**. Copy each.

## 6. Two agents (Terminals 4 and 5)
```bash
# Terminal 4 — User A
cd web_application/SiteAgent
python3 -m venv .venv 2>/dev/null; source .venv/bin/activate
pip install -q -r requirements.txt
export SERVER_URL=http://localhost:5050
export DATA_DIR="$(pwd)/raw-data"
export CONFIG_DIR="$(pwd)/.agentconfig_A"
export ENROLL_CODE="<paste User A's code>"
python agent.py
```
```bash
# Terminal 5 — User B (same venv)
cd web_application/SiteAgent
source .venv/bin/activate
export SERVER_URL=http://localhost:5050
export DATA_DIR="$(pwd)/raw-data"
export CONFIG_DIR="$(pwd)/.agentconfig_B"
export ENROLL_CODE="<paste User B's code>"
python agent.py
```
Each agent logs: `✅ Connected as <email>` → `Datasets ready ... (35 samples, 3000 markers)`
→ runs Missing/MAF/HWE **+ PCA** → `Job ... complete; uploaded keys=[... 'pca_coords']`.
(✅ E8 identity; ✅ My Data now shows the marker count; ✅ job isolation.)

## 7. Run the analysis (browser, as User A)
Because the scheme includes Population Stratification, this is the **pairwise** path:
1. **Initiate QC Calculation** → the server computes pairwise PCA distances on the uploaded
   coordinates. Then **Get QC Results** and **Confirm Threshold** (set a cutoff).
2. **Create GWAS dataset** → agents compute per-SNP case/control counts locally (from the
   `phenotype` column) and upload them.
3. **Initiate GWAS / chi-square** → view the aggregated results table.

> For a quicker run, use a **filter-only** scheme (Missing + MAF + HWE, no Population
> Stratification): it skips the Initiate-QC pairwise step and goes straight to GWAS.

## 8. QC-failure retry (new) — try it deliberately
Make a second collaboration but have **B register/use `blood_pressure`** (12 SNPs) with a
**Population Stratification** scheme. B's agent will **fail** that job (PCA needs the full
panel). On B's collaboration page you'll now see a red **"Your quality-control step
failed: … Retry QC"** alert instead of the page stalling at "Initiate QC Calculation". Fix
the data (use `eye_color2`) and click **Retry QC** → it re-runs and succeeds.

## 9. Status emails (only if SMTP set in step 2)
Watch the two inboxes: **invitation** → B, **accepted** → A, **collaboration started** →
both, **action needed** (force by starting only one agent) → the off side, **stage
advanced** → A ("Create the GWAS dataset", then "Run the GWAS calculation"), **results
ready** → both. One per event per collaboration; "started"/"results" are Bcc'd.

## 10. Verify what reached the server
```bash
docker exec -it collab-mongo mongosh test --quiet --eval '
  const c = db.collaborations.findOne({}, {surviving_snps:1,stats:1,pca_coords:1,_id:0});
  printjson({hasSurvivingSNPs:!!c.surviving_snps, hasPCA:!!c.pca_coords, hasStats:!!c.stats});
  db.jobs.find({},{action:1,status:1,_id:0}).forEach(j=>printjson(j));
  db.datasets.find({},{phenotype:1,data:1,_id:0}).forEach(d=>printjson({phenotype:d.phenotype,hasRawData:!!d.data}));'
```
**Expected:** jobs `complete`; collaboration has `surviving_snps`/`pca_coords`/`stats`; every
dataset `hasRawData: false` (raw genotypes never left the machines).

## Cleanup
```bash
docker rm -f collab-mongo
rm -rf web_application/SiteAgent/.agentconfig_A web_application/SiteAgent/.agentconfig_B
```

---

### Faster single-user variant
As one user, create a collaboration, then use the collaboration page's **Run QC** /
**Retry QC Dataset Creation** action (calls `/api/qc/create_chained`, queues a job for you).
Run one agent, then do GWAS. Skips the invite flow but still exercises queue → poll → local
QC → result. (The ≥2-participant guard means a true single-site collaboration won't
auto-run multi-site QC — the two-account flow above is the full test.)
```

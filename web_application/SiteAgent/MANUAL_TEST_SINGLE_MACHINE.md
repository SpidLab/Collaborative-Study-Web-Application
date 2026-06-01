# Manual end-to-end test on a single machine

This walks the **whole system by hand** on one computer: the website, a real
collaboration with an invitation, the local agent polling for jobs, QC running
locally, and results coming back. You'll use **two user accounts and two agents**
on the same machine to exercise the multi-site flow (including job isolation).

Test data is already provided under `web_application/SiteAgent/raw-data/`, one
folder per phenotype:
- `blood_pressure/rawdata.csv` — 20 individuals (10 cases / 10 controls), 12 SNPs
  with a `phenotype` column (case/control **in the file**).
- `eye_color/rawdata.csv` + `case_ids.txt` + `control_ids.txt` — case/control
  supplied as **ID files** instead. (471 samples × 3000 SNPs — also usable for the
  Population Stratification / PCA path since it has the full SNP set.)

The folder name is what you register as the phenotype/metadata name on the website.

> Population Stratification (PCA) needs the 3000-SNP pretrained model, so for this
> small dataset use a QC scheme of **Missing + MAF + HWE** (and GWAS). Skip
> "Population Stratification" here.

---

## 0. Prerequisites
- Docker (just for a throwaway MongoDB), Python 3.10+, Node 18+.
- Open ~5 terminal tabs.

## 1. MongoDB (Terminal 1)
```bash
docker run -d --name collab-mongo -p 27017:27017 mongo:7
```

## 2. Backend (Terminal 2)
```bash
cd web_application/Backend/FlaskApp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MONGO_URI="mongodb://localhost:27017"
export SECRET_KEY="dev-secret-please-change"
python app.py            # http://localhost:5000
```

## 3. Frontend (Terminal 3)
```bash
cd web_application/Frontend
npm install
VITE_API_URL=http://localhost:5000 npm run dev    # http://localhost:5173
```

## 4. Create two accounts + a collaboration (browser)
Open http://localhost:5173.

1. **Register User A** (e.g. `a@test.com`) and **User B** (`b@test.com`).
   Use two browser profiles or one normal + one incognito window so both can be
   logged in at once.
2. As **each** user: upload dataset **metadata** — set the **phenotype name to
   `blood_pressure`** and sample count `20`. (No file rows are stored on the
   server; this just registers the name.)
3. As **User A**: start a collaboration, choose experiment **GWAS**, set the QC
   scheme to **Missing Data QC + MAF + HWE**, pick A's `blood_pressure` dataset,
   and **invite User B** (select B and B's `blood_pressure` phenotype).
4. As **User B**: open invitations and **Accept**.

When B accepts and no invite is left pending, the server automatically **enqueues
a `chained_qc` job for both A and B**.

## 5. Get each user's connection code (browser)
For **User A** and **User B** separately: go to **Profile → "Connect my computer"
→ Generate connection code**, and copy each code.

## 6. Run an agent for each user (Terminals 4 and 5)
Both agents can read the same local folder (the file is named `blood_pressure.csv`);
each authenticates as its own user and only receives its own job.

Terminal 4 — **User A's agent**:
```bash
cd web_application/SiteAgent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SERVER_URL=http://localhost:5000
export DATA_DIR="$(pwd)/raw-data"
export CONFIG_DIR="$(pwd)/.agentconfig_A"     # separate token store per agent
export ENROLL_CODE="<paste User A's code>"
python agent.py
```

Terminal 5 — **User B's agent** (reuse the same venv):
```bash
cd web_application/SiteAgent
source .venv/bin/activate
export SERVER_URL=http://localhost:5000
export DATA_DIR="$(pwd)/raw-data"
export CONFIG_DIR="$(pwd)/.agentconfig_B"
export ENROLL_CODE="<paste User B's code>"
python agent.py
```

You should see each agent log: connect → poll → pick up **its** `chained_qc` job →
run Missing/MAF/HWE locally → `Job ... complete; uploaded keys=['surviving_samples',
'surviving_snps']`. (Prefer Docker instead? Use `./collab-agent.sh` — see the
COLLABORATOR_GUIDE.)

## 7. Run GWAS + see results (browser, as User A)
In the collaboration page:
1. Trigger **Create GWAS dataset** — this enqueues a `gwas_summary` job for the
   participants; the agents compute per-SNP case/control counts locally and upload
   them. Watch the agent logs.
2. Run the **GWAS / chi-square** step and view the aggregated results table.

## 8. Verify what reached the server (Terminal 1 or a Mongo shell)
```bash
docker exec -it collab-mongo mongosh test --quiet --eval '
  const c = db.collaborations.findOne({}, {surviving_snps:1, surviving_samples:1, stats:1, _id:0});
  printjson({hasSurvivingSNPs: !!c.surviving_snps, hasStats: !!c.stats});
  print("jobs:"); db.jobs.find({}, {action:1, status:1, _id:0}).forEach(j=>printjson(j));
  print("datasets still raw-free:");
  db.datasets.find({}, {phenotype:1, data:1, _id:0}).forEach(d=>printjson({phenotype:d.phenotype, hasRawData: !!d.data}));
'
```
**Expected:** jobs show `status: "complete"`; the collaboration has
`surviving_snps` / `surviving_samples` / `stats`; every dataset shows
`hasRawData: false` (the privacy invariant — raw rows never reached the server).

## What this proved
Website auth, dataset metadata, the invite/accept flow, automatic job creation,
**per-user job isolation** (A's agent never sees B's job), local QC + GWAS
execution, result upload, aggregated results in the UI, and that **no raw
genotypes were stored centrally**.

## Cleanup
```bash
docker rm -f collab-mongo
rm -rf web_application/SiteAgent/.agentconfig_A web_application/SiteAgent/.agentconfig_B
```

---

### Faster single-user variant
If you don't want two accounts: as one user, create a collaboration with a
Missing/MAF/HWE scheme, then use the collaboration page's **Run QC** action (it
calls `/api/qc/create_chained`, which queues a job for *you*). Run one agent with
your code, then do the GWAS step. This skips the invite flow but still exercises
queue → poll → local QC → result.

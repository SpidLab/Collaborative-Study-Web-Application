# Testing every feature on one laptop

Covers the changes from the 2026-07-28 meeting: one experiment type per
collaboration, the Model Repository as a metadata catalog, registering your own
models, the black-box classification service, and the redesigned Data Sharing
request flow.

You will simulate **3 institutions** on one machine: three user accounts, each
with its own Site Agent, its own data folder, and its own model store.

**Everything runs against a throwaway local MongoDB**, not your Atlas cluster, so
none of this touches real data.

---

## 0. One-time prep

You need a Python with `torch` installed. On this machine that is
`/opt/anaconda3/bin/python3` — check it:

```bash
/opt/anaconda3/bin/python3 -c "import torch, flask, pymongo; print('torch', torch.__version__)"
```

If that fails, install the agent deps into whichever interpreter you want to use:

```bash
/opt/anaconda3/bin/python3 -m pip install -r web_application/SiteAgent/requirements.txt
```

Set a shortcut for the repo root (used throughout):

```bash
export REPO=/Users/sahithreddyj/Downloads/Collaborative-Study-Web-Application
```

### Build the three sites' data folders

Site 1/2/3 each get a `SuperPopulation` dataset (for federated learning, 401
samples with a `label` column of 5 super-populations) and an `eye_color` dataset
(35 samples, for data sharing).

```bash
cd $REPO/web_application/SiteAgent && for i in 1 2 3; do mkdir -p $HOME/collab-test/site$i/SuperPopulation $HOME/collab-test/site$i/eye_color && cp fl-data/site_$i/SuperPopulation/rawdata.csv $HOME/collab-test/site$i/SuperPopulation/ && cp raw-data/eye_color/rawdata.csv $HOME/collab-test/site$i/eye_color/; done && echo "site data ready" && ls $HOME/collab-test/site1
```

> The folder name must match the phenotype you register on the website **exactly** —
> that is how the agent finds the file.

---

## 1. Start the stack (3 terminals, leave all running)

### Terminal 1 — throwaway MongoDB on port 27018

```bash
mkdir -p $HOME/collab-test/mongo && /opt/homebrew/bin/mongod --port 27018 --dbpath $HOME/collab-test/mongo --bind_ip 127.0.0.1
```

### Terminal 2 — backend on port 5050

```bash
cd $REPO/web_application/Backend/FlaskApp && MONGO_URI="mongodb://127.0.0.1:27018/?directConnection=true" SECRET_KEY="local-test-secret" PORT=5050 FL_EXECUTION=agents FL_AGENT_POLL_SECONDS=2 EMAIL_ENABLED=false /opt/anaconda3/bin/python3 app.py
```

Exported variables win over `.env`, so this points at the local database, not Atlas.
You should see `Pinged your deployment. You successfully connected to MongoDB!` **and**
`Running on http://127.0.0.1:5050`.

> **Check for `Address already in use`.** If an older backend is still holding 5050,
> this one dies but the page keeps working — against the *stale* server, so you end
> up testing old code and seeing wrong results. Make sure the port is free first:
>
> ```bash
> lsof -nP -iTCP:5050 -sTCP:LISTEN
> ```
>
> Nothing printed = free. If something is listening, kill it (`kill -9 <PID>`) and
> start the backend again.

Sanity check in another shell — it must list **only** GWAS and Federated Learning:

```bash
curl -s http://localhost:5050/api/experiments
```

### Terminal 3 — frontend on port 5173

```bash
cd $REPO/web_application/Frontend && npm install && npm run dev
```

Open **http://localhost:5173**.

---

## 2. Create three accounts

Register three users through the UI (Register New Account):

| Name | Email | Password | Plays |
|---|---|---|---|
| Alice Chen | `alice@test.local` | `Passw0rd!123` | initiator / data owner / model owner |
| Bob Rivera | `bob@test.local` | `Passw0rd!123` | participating site / data requester |
| Carol Diaz | `carol@test.local` | `Passw0rd!123` | outsider — never in a collaboration |

For **each** of the three, go to **Metadata** and register two datasets:

| Phenotype(s) | # of Samples |
|---|---|
| `SuperPopulation` | `401` |
| `eye_color` | `35` |

Spelling matters — it must match the folder names from step 0.

---

## 3. Start the three Site Agents (3 more terminals)

For each user: log in as them → **Profile** → **Connect my computer** → copy the code.

Each agent gets its own `CONFIG_DIR` (its login) and its own `OWNED_MODELS_DIR`
(the models that site owns). Keeping those separate is what makes the three
"institutions" genuinely independent on one laptop.

### Terminal 4 — Alice's agent (site 1)

```bash
cd $REPO/web_application/SiteAgent && ENROLL_CODE="PASTE_ALICE_CODE" SERVER_URL=http://localhost:5050 DATA_DIR=$HOME/collab-test/site1 CONFIG_DIR=$PWD/.cfg_t1 MODELS_DIR=$PWD/models OWNED_MODELS_DIR=$PWD/.owned_t1 POLL_INTERVAL=3 POLL_TIMEOUT=20 /opt/anaconda3/bin/python3 agent.py
```

### Terminal 5 — Bob's agent (site 2)

```bash
cd $REPO/web_application/SiteAgent && ENROLL_CODE="PASTE_BOB_CODE" SERVER_URL=http://localhost:5050 DATA_DIR=$HOME/collab-test/site2 CONFIG_DIR=$PWD/.cfg_t2 MODELS_DIR=$PWD/models OWNED_MODELS_DIR=$PWD/.owned_t2 POLL_INTERVAL=3 POLL_TIMEOUT=20 /opt/anaconda3/bin/python3 agent.py
```

### Terminal 6 — Carol's agent (site 3)

```bash
cd $REPO/web_application/SiteAgent && ENROLL_CODE="PASTE_CAROL_CODE" SERVER_URL=http://localhost:5050 DATA_DIR=$HOME/collab-test/site3 CONFIG_DIR=$PWD/.cfg_t3 MODELS_DIR=$PWD/models OWNED_MODELS_DIR=$PWD/.owned_t3 POLL_INTERVAL=3 POLL_TIMEOUT=20 /opt/anaconda3/bin/python3 agent.py
```

Each should print:

```
✅ Connected as alice@test.local
Registered metadata for 'SuperPopulation': 401 samples, 10004 markers.
Registered metadata for 'eye_color': 35 samples, ... markers.
Setup looks good — waiting for jobs.
```

Confirm the account line matches the intended user. If it says the wrong one,
stop it, `rm -rf .cfg_tN`, and restart with the right code.

Refresh **My Data** in the browser — sample counts and markers should now be filled in.

---

## TEST 1 — One experiment type per collaboration

**As Alice** → Start a New Collaboration.

- [ ] Under *Experiment Type* you see **radio buttons**, not a multi-select, with the
      caption "A collaboration runs exactly one experiment type. Choose one."
- [ ] Only **GWAS** and **Federated Learning** are offered — **Data Sharing is gone**.
- [ ] Picking one deselects the other; you cannot end up with two.
- [ ] With nothing selected, *Create Collaboration* is disabled and says
      "Choose an experiment type to create a collaboration."

Server-side proof that two are refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5050/api/start_collaboration -H "Content-Type: application/json" -H "Authorization: Bearer $(curl -s -X POST http://localhost:5050/api/login -H 'Content-Type: application/json' -d '{"email":"alice@test.local","password":"Passw0rd!123"}' | /opt/anaconda3/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')" -d '{"collabName":"nope","experiments":["GWAS","Federated Learning"],"collabQcScheme":[{"method":"Minor Allele Frequency (MAF)","params":{}}],"invitedUsers":[]}'
```

- [ ] Prints **400**.

---

## TEST 2 — Data Sharing: advertise → request → approve → download

This replaces the old Data Sharing experiment. One-directional: the approver's
data goes to the requester, never the reverse.

### 2a. Alice advertises a dataset

**As Alice** → **My Data**.

- [ ] Both datasets are listed with the sample/marker counts her agent reported.
- [ ] On the `eye_color` row, expand/edit it: add a description, turn on
      **Available to share**, and set **ε = 4**.
- [ ] The mechanism is shown read-only (randomized response + row shuffle).
- [ ] Try ε = 50 → rejected (allowed range is 0.1–20).
- [ ] Row now shows **Available to share · ε = 4**; the `SuperPopulation` row still
      shows **Not shared**.

### 2b. Bob finds it and asks

**As Bob** → **Search / Find Collaborators** → search phenotype `eye_color`.

- [ ] Alice's row is badged **shareable, ε = 4**, and shows her description.
- [ ] Click **Request data**, enter a purpose ("Replicating the 2024 pigmentation
      GWAS"), submit.
- [ ] The row now shows the request status instead of the button.
- [ ] Requesting the same dataset again is refused with a clear "you already have an
      open request" message (not a crash).
- [ ] Carol's / Bob's own `eye_color` rows are **not** badged shareable — only Alice
      opted in.

### 2c. Alice approves

**As Alice** → **Data Requests** (nav bar) → *Incoming* tab.

- [ ] Bob's request is there with his stated purpose.
- [ ] It says he receives it at **ε = 4** — "the privacy budget you advertised for
      this dataset. Requesters cannot pick their own."
- [ ] It warns that her own Site Agent will build the copy locally, so the agent
      must be running.
- [ ] Click **Approve** → status becomes **Transforming** with a progress indicator.

Watch Terminal 4 (Alice's agent) — it should pick up a `privacy_transform` job and
report `Job ... complete; uploaded keys=['transformed_data']`.

### 2d. Bob downloads

**As Bob** → **Data Requests** → *Your requests* tab (wait ~10s / hit Refresh).

- [ ] Status is **Ready**, showing ε, mechanism, and `35 samples × N markers`.
- [ ] **Download CSV** produces a real matrix (`sample_id,` header + rows).
- [ ] Values are noised, not Alice's raw file — compare against
      `$HOME/collab-test/site1/eye_color/rawdata.csv`; they should differ.

### 2e. Boundaries

- [ ] **As Carol**, request the same dataset → Alice can **Deny** it → Carol sees
      Denied, and Alice cannot answer it twice.
- [ ] **As Alice**, turn **Available to share** off → Carol can no longer request it.
- [ ] Only Bob can download his own request:

```bash
CAROL=$(curl -s -X POST http://localhost:5050/api/login -H 'Content-Type: application/json' -d '{"email":"carol@test.local","password":"Passw0rd!123"}' | /opt/anaconda3/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'); curl -s -o /dev/null -w "carol on bob's request: %{http_code}\n" -H "Authorization: Bearer $CAROL" "http://localhost:5050/api/data-requests/PASTE_BOBS_REQUEST_ID/download"
```

- [ ] Prints **403**. (Alice, the owner, also gets 403 — the link is the requester's.)

### 2f. Legacy check

- [ ] Any Data Sharing collaboration created before this change still opens and is
      labelled a **legacy** collaboration, pointing you to the new flow.

---

## TEST 3 — Model Repository is a catalog, not a store

**As Alice** → **Model Repository**.

- [ ] The header says it is a listing, not a store, and that weights stay on the
      owner's machine.
- [ ] There is **no Download button anywhere**, on any card. This is the core point.
- [ ] There is **no "privacy budget ε"** on any model card (differential privacy is
      only used in preprocessing, so showing it on a model was misleading).

### 3a. Register a model you already own

- [ ] Click **Register a model**. There is **no file upload field** — metadata only.
- [ ] Fill in: name `Ancestry classifier v2`, dataset `SuperPopulation`, task,
      framework `PyTorch`, architecture, classes `AFR,AMR,EAS,EUR,SAS`,
      accuracy `0.87`, visibility **Private**. Save.
- [ ] The card shows a **Registered** source chip, a **Private** chip, and
      **Trained on SuperPopulation**, with "Measured on SuperPopulation — not a
      universal score."
- [ ] Non-numeric text in a metric field is rejected rather than silently dropped.

The server refuses weights even if something tries:

```bash
ALICE=$(curl -s -X POST http://localhost:5050/api/login -H 'Content-Type: application/json' -d '{"email":"alice@test.local","password":"Passw0rd!123"}' | /opt/anaconda3/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'); curl -s -X POST http://localhost:5050/api/models -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"name":"sneaky","weights_b64":"AAAA"}'
```

- [ ] Returns 400 with "the Model Repository stores metadata only".

### 3b. Private really is private

- [ ] **As Carol** → Model Repository → Alice's private model is **not listed**.
- [ ] **As Alice** → **My models** tab → it **is** listed. (This tab is why someone
      whose models are all private doesn't see an empty page.)

### 3c. Publish it later

- [ ] **As Alice**, flip the model to **Public** from the card's owner controls.
- [ ] **As Carol**, refresh → she now sees the metadata, and **still no download**.
- [ ] **As Alice**, tick **Accept classification requests**.
- [ ] Flip back to **Private** → notice the service switch is forced off and
      disabled ("Make it public first — a private entry cannot advertise a
      service"). Set it back to Public + service on for the next test.
- [ ] Owner controls do not appear for Carol on Alice's model.

---

## TEST 4 — Federated learning, PUBLIC model → every site keeps a copy

**As Alice** → Start a New Collaboration:

- Name: `FL public test`
- Experiment Type: **Federated Learning**
- Model Visibility: **Public**, and tick **Offer black-box classification**
- Dataset: `SuperPopulation`
- Find Collaborators: search `SuperPopulation`, invite **Bob**
- Create

- [ ] The visibility panel states that every site that trained it keeps its own copy.

**As Bob** → accept the invitation.

Now watch it run (Terminals 4 and 5 show the work; the page polls):

- [ ] Stage goes **projecting** → both agents run `fl_project` → **awaiting_threshold**.
- [ ] Alice (initiator) sees the **EMD threshold slider** and the site table.
      Bob does **not** see those controls.
- [ ] Alice sets a loose threshold (e.g. max) → Apply → **ready_to_train**.
- [ ] Alice sets rounds = 1, local epochs = 1 → **Start training**.
- [ ] Agents run `fl_train_round`; stage reaches **complete** with accuracy/F1.

### 4a. Delivery and the server wiping its copy

- [ ] The completion card has **no download button**.
- [ ] It says the model is listed **Public** in the Model Repository, with a link.
- [ ] "Where the trained model is" reports it was saved onto **your own Site Agent
      machine**, and shows **Delivered to 2 of 2 participating sites**.
- [ ] **As Bob**, the same card also says the model landed on his machine.

Both sites hold the file:

```bash
ls -l $REPO/web_application/SiteAgent/.owned_t1 $REPO/web_application/SiteAgent/.owned_t2
```

- [ ] Each contains a `mdl_*.weights.b64` and a `mdl_*.json`.

The server no longer holds the weights:

```bash
/opt/anaconda3/bin/python3 - <<'PY'
from pymongo import MongoClient
db = MongoClient("mongodb://127.0.0.1:27018/?directConnection=true")["test"]
for c in db.collaborations.find({}, {"name":1,"fl_state.stage":1,"fl_state.global_model":1,"fl_state.delivery_scope":1,"fl_state.model_delivered_to":1}):
    fs = c.get("fl_state") or {}
    if not fs: continue
    print(f"{c['name']:24} stage={fs.get('stage'):10} scope={fs.get('delivery_scope')} "
          f"delivered_to={len(fs.get('model_delivered_to') or [])} "
          f"server_holds_weights={bool(fs.get('global_model'))}")
PY
```

- [ ] `scope=all_sites`, `delivered_to=2`, **`server_holds_weights=False`**.

And no route will hand a model to a person:

```bash
curl -s -o /dev/null -w "model download: %{http_code}\n" -H "Authorization: Bearer $ALICE" http://localhost:5050/api/models/PASTE_MODEL_ID/download
```

- [ ] **404** — the endpoint is gone. (Get the model id from the Model Repository card.)

### 4b. Black-box classification, run on the owner's machine

**As Carol** (never in the collaboration) → Model Repository:

- [ ] She sees the federated model's metadata, no download, and a
      **Request classification** button.
- [ ] Click it → pick her own `eye_color` or `SuperPopulation` dataset, max samples
      `10`, add a note → submit. The dialog explains the samples go to the owner,
      whose agent classifies locally and returns only predictions.

**As Alice** → **Inference Requests** → *Incoming*:

- [ ] Carol's request is listed, saying the model never leaves Alice's machine.
- [ ] **Approve**.

Watch the two agents in order:

- [ ] Terminal 6 (**Carol's**) runs `export_samples` — her agent sends the samples.
- [ ] Terminal 4 (**Alice's**) runs `classify_samples` — **her** machine runs the model.

**As Carol** → *Your requests*:

- [ ] Status walks **pending → collecting → classifying → complete**.
- [ ] **View predictions** shows a per-sample table of `predicted_class` +
      `confidence`, downloadable as CSV. Nothing about the model's parameters.

The relayed samples are deleted afterwards:

```bash
/opt/anaconda3/bin/python3 - <<'PY'
from pymongo import MongoClient
db = MongoClient("mongodb://127.0.0.1:27018/?directConnection=true")["test"]
for r in db.inference_requests.find({}, {"request_id":1,"status":1,"samples":1}):
    print(r["request_id"], r["status"], "samples_still_on_server=", bool(r.get("samples")))
print("job copies left:", [bool((j.get('result') or {}).get('samples'))
                           for j in db.jobs.find({"action":"export_samples"})])
PY
```

- [ ] `samples_still_on_server= False` and `job copies left: [False]`.

- [ ] **As Alice**, untick **Accept classification requests** → Carol can no longer
      raise a new one.
- [ ] Alice can also **Deny** a request, and Carol sees Denied.

---

## TEST 5 — Federated learning, PRIVATE model → initiator only

This is the rule you asked for: a private model stays with the initiator.

**As Alice** → Start a New Collaboration:

- Name: `FL private test`
- Experiment Type: **Federated Learning**
- Model Visibility: **Private**
- Dataset: `SuperPopulation`, invite **Bob**, create

- [ ] The Private option states the model is saved onto your machine alone and the
      other sites do not keep a copy.

Run it exactly as in Test 4 (Bob accepts → threshold → 1 round → complete).

- [ ] **As Alice**: the card says the model was saved onto her machine, and
      "Saved on 1 of 1 machine (the initiator's — this model is private)."
- [ ] **As Bob**: the card says **"The initiator kept this model private, so it was
      saved onto their Site Agent machine only. Participating sites do not receive
      a copy."** He is not left waiting for a delivery that will never come.

Check the filesystem — note the timestamps, there should be **exactly one new file**
on site 1 and **none** on site 2:

```bash
ls -lt $REPO/web_application/SiteAgent/.owned_t1/*.weights.b64 $REPO/web_application/SiteAgent/.owned_t2/*.weights.b64
```

- [ ] Site 1 gained a second model; site 2 still has only the one from Test 4.

Re-run the Mongo snippet from 4a:

- [ ] The private collaboration shows `scope=initiator`, `delivered_to=1`,
      `server_holds_weights=False`.

- [ ] **As Bob** → Model Repository → the private model is **not listed**.
- [ ] **As Alice** → **My models** → it **is** listed, chipped **Private**.
- [ ] **As Alice**, flip it to **Public** → Bob now sees the metadata, but
      `ls .owned_t2` shows **no new file**: publishing later changes who can see the
      catalog entry, it does not move weights between machines. The card says so.
- [ ] **Delete** is not offered on a federated model (its entry records a real
      collaboration). Proof:

```bash
curl -s -X DELETE -H "Authorization: Bearer $ALICE" http://localhost:5050/api/models/PASTE_FEDERATED_MODEL_ID
```

- [ ] 400, telling you to set it private instead.

---

## TEST 6 — GWAS still works (regression)

The creation form changed, so confirm the untouched path still runs.

- [ ] **As Alice**, create a **GWAS** collaboration on `eye_color`, pick a QC scheme
      (e.g. Minor Allele Frequency), invite Bob, create.
- [ ] Bob accepts → both agents run `chained_qc` → QC results appear as before.

---

## Troubleshooting

**`401 UNAUTHORIZED` from an agent.** Usually a saved token from an older run with a
different `SECRET_KEY`. The agent now detects this at startup and re-enrolls itself
using `ENROLL_CODE`, logging:

```
The saved login is no longer accepted by the server — re-enrolling with your enrollment code...
Re-enrolled successfully.
```

The code you supply must have been minted by the **currently running** backend. If it
still fails, get a fresh code from Profile and clear the saved logins:

```bash
cd $REPO/web_application/SiteAgent && rm -rf .cfg_t1 .cfg_t2 .cfg_t3
```

**Wrong / stale results everywhere.** Almost always the port-conflict above: a
previous backend is still serving 5050. Check `lsof -nP -iTCP:5050 -sTCP:LISTEN`,
kill it, restart. Restarting the backend invalidates existing agent tokens if
`SECRET_KEY` differs, so restart the agents afterwards too.

**`ERROR: '/opt/homebrew/bin/python3' has no torch`.** Use the anaconda interpreter:
prefix the command with `PYTHON=/opt/anaconda3/bin/python3`, or call
`/opt/anaconda3/bin/python3 agent.py` directly.

**`No credentials found. Paste your enrollment code`.** The command got split — the
one-line commands above must be pasted as a **single line**. A blank line between
`\` continuations breaks them into fragments and the variables are lost.

**Agent says `No local datasets matched your registered phenotypes`.** The folder
name under `DATA_DIR` must equal the phenotype string you typed on the website,
character for character (`SuperPopulation`, `eye_color`).

**A request sits at "transforming" or "collecting" forever.** The relevant agent
isn't running. Check which one: the data transform runs on the **owner's** agent;
`export_samples` runs on the **requester's**; `classify_samples` runs on the **model
owner's**.

**FL stuck at `projecting`.** Both participants' agents must be running and both must
have the `SuperPopulation` folder. Check the agent logs for the `fl_project` job.

**Model missing after a container restart (real deployments).** The agent's owned-model
store is now a persistent Docker volume (`/models`). If you deploy with
`docker compose`, make sure the `agent_models` volume exists — the server deletes its
copy after delivery, so that volume can hold the only copy of a model.

---

## Reset between runs

```bash
cd $REPO/web_application/SiteAgent && rm -rf .cfg_t1 .cfg_t2 .cfg_t3 .owned_t1 .owned_t2 .owned_t3 && rm -rf $HOME/collab-test/mongo && echo "reset — recreate the mongo dir and re-register users"
```

Stop everything with Ctrl-C in each terminal.

---

## Automated versions of all of this

Three scripts exercise the same flows headlessly against their own isolated
database and real agents, if you want a fast regression check:

```bash
cd /private/tmp/claude-501/-Users-sahithreddyj-Downloads-Collaborative-Study-Web-Application/47c0209a-ce2f-48d9-8b90-9c44f77c1af0/scratchpad && /opt/anaconda3/bin/python3 e2e_core.py && /opt/anaconda3/bin/python3 e2e_fl.py && /opt/anaconda3/bin/python3 e2e_private_model.py
```

Expected: 43/43, 39/39, 18/18. They start and stop their own mongod on port 27018,
so stop the Terminal 1 mongod first (it uses the same port).

# Federated Learning — local end-to-end test (real agents, one machine)

This runs the full FL flow with **real Site Agents** doing the local compute, all
on your laptop. Each agent plays a different collaborator, trains on its own
synpop "site" data, and only PCA coordinates + model weight updates ever reach
the server. You drive the collaboration from the web UI.

> Architecture: the server never sees raw genotypes. It enqueues jobs on the
> agent job-queue; each collaborator's agent long-polls, runs PCA-projection or a
> local training round on its own CSV, and uploads only derived outputs. FedAvg
> happens on the server across the surviving agents.

---

## 0. One-time setup

```bash
# From the repo root — generate the public PCA panel + 5 per-site data folders.
python -m web_application.Backend.FlaskApp.fl.prepare_data \
  --synpop /path/to/FL-pp/dataset/synpop_snps.csv \
  --labels /path/to/FL-pp/dataset/synpop_labels.csv
python -m web_application.Backend.FlaskApp.fl.export_agent_assets
# → web_application/SiteAgent/fl-data/site_1..5/SuperPopulation/rawdata.csv
# → web_application/SiteAgent/models/fl_pca_model.npz

# Install agent deps (now includes torch) into whatever Python you'll run agents with.
cd web_application/SiteAgent
pip install -r requirements.txt
```

The backend defaults to **port 5050** (`PORT` in `.env`), and the agent + frontend
default to `http://localhost:5050`. Keep them aligned.

## 1. Start the servers

```bash
# terminal 1 — backend
cd web_application/Backend/FlaskApp && python app.py     # serves on :5050

# terminal 2 — frontend
cd web_application/Frontend && npm run dev
```

Confirm `FL_AVAILABLE= True` in the backend startup log.

## 2. Create the collaborators and get their connection codes

In the browser, register **N users** (e.g. 4: a creator + 3 invitees). For each:

1. Log in → **Profile** → **Generate connection code** → copy the code.
2. Keep track of which code belongs to which user (agent *i* below = the user
   you want mapped to synpop `site_i`; the creator is usually agent 1).

Also upload dataset **metadata** for each user with phenotype exactly
**`SuperPopulation`** (any sample count — the agent reads the real file locally).

## 3. Launch the agents

```bash
cd web_application/SiteAgent
# agent i is enrolled with CODE i and serves fl-data/site_i
PYTHON=$(which python) ./run_local_fl_agents.sh <CODE_creator> <CODE_user2> <CODE_user3> <CODE_user4>
```

Each agent logs to `.fl_logs/agent_<i>.log`. You should see `✅ Connected as …`
and `waiting for jobs`. Leave this running.

## 4. Drive the collaboration in the UI

1. As the **creator**: **Start a New Collaboration** → Experiment Type =
   **Federated Learning** → pick an ε → select the `SuperPopulation` dataset →
   invite the other users → **Create**.
2. As each **invitee**: open the collaboration → **Accept**.
3. When the last invitee accepts, the server enqueues `fl_project` jobs. The
   agents pick them up, project locally + add DP noise, and upload coordinates.
   The FL page advances: `Projecting → Computing EMD → Awaiting EMD threshold`.
4. As the **creator**: read the EMD heatmap, choose a threshold, **Apply**.
   Confirm the survivors, then **Start FedAvg training**.
5. The server runs rounds: each round it enqueues `fl_train_round` to every
   surviving agent, the agents train locally and upload weight updates, the
   server FedAvgs. The dashboard fills in per round; the final global-model
   accuracy shows when it's done.

## 5. Notes & troubleshooting

- **Agents must be running** for the pipeline to advance — jobs wait patiently
  in the queue until an agent claims them. The FL page shows
  "waiting for N/M agents" while it waits.
- **Crash recovery**: if an agent dies mid-round, its job is requeued after a
  few minutes and a restarted agent retries it (built into the job queue).
- **Which site a user gets** is decided purely by the agent's `DATA_DIR`
  (set by the launcher: agent *i* → `fl-data/site_i`). The server doesn't assign
  sites — it just enqueues jobs per user.
- **Quick no-agent smoke test**: set `FL_EXECUTION=simulation` in the backend env
  to run the whole thing in-process against the synpop sites (no agents needed).
  Unset it (or set `agents`) for the real agent flow.
- Logs: backend console for orchestration, `.fl_logs/agent_<i>.log` per agent.

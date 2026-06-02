# Collaborative Study — Site Agent

> **Non-technical collaborator?** Don't read this file — follow the friendly,
> step-by-step **[COLLABORATOR_GUIDE.md](./COLLABORATOR_GUIDE.md)** instead. The
> short version: install Docker Desktop, put your CSVs in a folder, then run
> `./collab-agent.sh` (Mac/Linux) or `collab-agent.ps1` (Windows) and answer three
> questions. This README is the technical reference.

A small, headless program that runs on a **collaborator's own machine** inside
Docker. It keeps running in the background, polls the central collaboration
server for jobs, performs all heavy work locally (QC filtering, PCA, privacy
transform, GWAS per-SNP counts), and uploads **only derived results**.

**Your raw genotype CSV never leaves your computer.** Only surviving SNP/sample
IDs, PCA coordinates, the privacy-transformed matrix, and per-SNP case/control
counts are sent to the server. The agent makes outbound HTTPS calls only — no
inbound ports or firewall changes are required.

## How it fits together

```
Central server (deployed once)  ──jobs──▶  Site Agent (this, on each machine)
        ▲                                          │ reads /data/<phenotype>.csv
        └────────── derived outputs only ──────────┘ (raw stays local)
```

## 1. Prepare your data folder

One folder per dataset, named exactly like the phenotype registered on the website,
each containing a `rawdata.csv`. Case/control can be a column in the CSV
(`phenotype`/`status`/`group`, 1 = case, 0 = control) **or** per-dataset
`case_ids.txt` + `control_ids.txt` files in the same folder.

```
/path/to/data/
├── blood_pressure/
│   └── rawdata.csv            # has a phenotype column
└── eye_color/
    ├── rawdata.csv            # no phenotype column...
    ├── case_ids.txt           # ...case/control supplied as ID files instead
    └── control_ids.txt
```

`rawdata.csv`: first column = sample ID, remaining columns = SNP genotypes (0/1/2).
A flat `<phenotype>.csv` (no folder) is still accepted for backward compatibility.

## 2. Get a token

Log into the website, create an agent enrollment code, and either:
- paste it as `ENROLL_CODE` (the agent exchanges it for a token on first run), or
- paste an existing token as `AGENT_TOKEN`.

## 3. Run

**Easiest (collaborators):** double-click **`Start Agent.command`** (Mac) or
**`Start Agent.bat`** (Windows) and answer the 3 prompts — see
[COLLABORATOR_GUIDE.md](./COLLABORATOR_GUIDE.md). The wizard (`collab-agent.sh` /
`collab-agent.ps1`) checks Docker, writes `.env`, builds, and starts via
`docker compose`.

**Manual / advanced:**
```bash
docker build -t collabstudy-agent web_application/SiteAgent

docker run -d --name collab-agent \
  -e SERVER_URL=https://collab.example.org \
  -e ENROLL_CODE=<one-time-code> \
  -v /path/to/data:/data:ro \
  -v collab_agent_config:/config \
  collabstudy-agent
```

The data volume is mounted **read-only** (`:ro`) — the agent can read your CSVs
but can never modify or delete them. The `/config` volume persists the token after
first enrollment. Check logs with `docker logs -f collab-agent`.

## Configuration

See `.env.example`. Key variables: `SERVER_URL`, `AGENT_TOKEN`/`ENROLL_CODE`,
`DATA_DIR`, `POLL_INTERVAL`, `POLL_TIMEOUT`.

## What runs locally

| Job action        | Local work                                   | Uploaded output |
|-------------------|----------------------------------------------|-----------------|
| `chained_qc`      | Missing → MAF → HWE → PCA filter chain        | surviving SNP/sample IDs, PCA coordinates |
| `privacy_transform` | Privacy transform (noise/synthetic)        | privacy-transformed matrix (for relatedness) |
| `gwas_summary`    | Per-SNP case/control counts on QC'd samples   | `stats` counts |

An **egress guard** (`agent.py`) refuses to upload anything other than these
known derived outputs, and rejects oversized payloads.

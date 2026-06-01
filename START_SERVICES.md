# Running the system

The architecture is now: **one central collaboration server** (deployed once) plus
**one local Site Agent per collaborator** (Docker, on their own machine). The old
Node/Kubernetes orchestrator and the per-user CollaboratorDB have been removed.

## Central server (you host this)

```bash
# Backend (central API + agent job queue)
cd web_application/Backend/FlaskApp
export MONGO_URI="<your MongoDB Atlas URI>"
export SECRET_KEY="<random secret>"
python app.py

# Frontend (separate terminal)
cd web_application/Frontend
npm install
npm run dev
```

Or run both with `./start_all.sh`.

For production deployment to AWS (EC2 + Docker Compose + Caddy, constant URL),
see [`deploy/README.md`](deploy/README.md).

## Site Agent (each collaborator runs this on their machine)

1. Put raw CSVs in a folder named `<phenotype>.csv` (e.g. `~/collab-data/eye_color.csv`).
2. Log into the website and create an agent enrollment code.
3. Run the agent in Docker:

```bash
docker build -t collabstudy-agent web_application/SiteAgent

docker run -d --name collab-agent \
  -e SERVER_URL=https://collab.example.org \
  -e ENROLL_CODE=<code-from-website> \
  -v ~/collab-data:/data:ro \
  collabstudy-agent
```

The agent polls for jobs, runs QC/GWAS locally, and uploads only derived results.
Raw genotype files never leave the machine. See
[`web_application/SiteAgent/README.md`](web_application/SiteAgent/README.md).

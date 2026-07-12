#!/usr/bin/env bash
# Launch N local Site Agents for federated-learning testing on ONE machine.
#
# Each agent acts as a different collaborator: it uses its own synpop site data
# folder (fl-data/site_<i>), its own token store, and connects to the local
# server. This lets you drive the whole FL flow through the web UI with real
# agents doing the local compute — no cloud, no Docker required.
#
# Prereqs:
#   1. Generate the per-site demo data + PCA panel (once):
#        python -m web_application.Backend.FlaskApp.fl.export_agent_assets
#   2. Install agent deps (includes torch) into the Python you pass as $PYTHON:
#        pip install -r requirements.txt
#   3. Start the backend (PORT=5050) and frontend, register N users in the UI,
#      and copy each user's enrollment code from the "Connect your data / agent"
#      screen.
#
# Usage:
#   ./run_local_fl_agents.sh <ENROLL_CODE_1> <ENROLL_CODE_2> [<ENROLL_CODE_3> ...]
#   # agent i is enrolled with CODE i and serves fl-data/site_i
#
# Env overrides:
#   PYTHON       python interpreter that has torch (default: python3)
#   SERVER_URL   collaboration server (default: http://localhost:5050)
#   PHENOTYPE    dataset folder name each agent serves (default: SuperPopulation)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
SERVER_URL="${SERVER_URL:-http://localhost:5050}"
PHENOTYPE="${PHENOTYPE:-SuperPopulation}"
LOG_DIR="$HERE/.fl_logs"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <ENROLL_CODE_1> <ENROLL_CODE_2> [<ENROLL_CODE_3> ...]" >&2
  echo "Each code maps to one collaborator; agent i serves fl-data/site_i." >&2
  exit 1
fi

if ! "$PYTHON" -c "import torch" 2>/dev/null; then
  echo "ERROR: '$PYTHON' has no torch. Install deps first:  pip install -r $HERE/requirements.txt" >&2
  echo "Or pass a torch-enabled interpreter: PYTHON=/path/to/python $0 ..." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
PIDS=()
cleanup() { echo; echo "Stopping agents..."; for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup INT TERM EXIT

i=0
for CODE in "$@"; do
  i=$((i + 1))
  DATA_DIR="$HERE/fl-data/site_$i"
  if [ ! -d "$DATA_DIR/$PHENOTYPE" ]; then
    echo "ERROR: missing $DATA_DIR/$PHENOTYPE — run export_agent_assets first." >&2
    exit 1
  fi
  echo "Agent $i → site_$i  (data: $DATA_DIR, phenotype: $PHENOTYPE)"
  ENROLL_CODE="$CODE" \
  DATA_DIR="$DATA_DIR" \
  CONFIG_DIR="$HERE/.cfg_fl_$i" \
  MODELS_DIR="$HERE/models" \
  SERVER_URL="$SERVER_URL" \
  POLL_INTERVAL=3 POLL_TIMEOUT=20 \
    "$PYTHON" "$HERE/agent.py" > "$LOG_DIR/agent_$i.log" 2>&1 &
  PIDS+=("$!")
done

echo
echo "Launched ${#PIDS[@]} agents. Logs: $LOG_DIR/agent_<i>.log"
echo "Now drive the collaboration in the web UI. Press Ctrl-C here to stop all agents."
wait

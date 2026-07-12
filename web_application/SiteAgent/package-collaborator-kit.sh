#!/usr/bin/env bash
# Build a clean zip to hand to collaborators. Includes only what a non-technical
# collaborator needs (guide + double-click launchers + scripts + the agent that
# builds/runs in Docker). Excludes dev/test files, venvs, caches, local config.
#
#   ./package-collaborator-kit.sh
# produces: collabstudy-agent-kit.zip
set -euo pipefail
cd "$(dirname "$0")"

OUT="collabstudy-agent-kit.zip"
STAGE="$(mktemp -d)/collabstudy-agent-kit"
mkdir -p "$STAGE"

# Refresh the printable guide PDF from the Markdown (best-effort; needs reportlab +
# markdown + matplotlib fonts). Falls back to whatever "START HERE.pdf" already exists.
python3 build_guide_pdf.py 2>/dev/null || echo "NOTE: could not rebuild START HERE.pdf — shipping the existing one."

# Files a collaborator needs (the helper builds the Docker image locally on first run)
INCLUDE=(
  "START HERE.pdf"
  "COLLABORATOR_GUIDE.md"
  "Start Agent.command"
  "Start Agent.bat"
  "collab-agent.sh"
  "collab-agent.ps1"
  ".env.example"
  "Dockerfile"
  ".dockerignore"
  "docker-compose.yml"
  "requirements.txt"
  "config.py"
  "agent.py"
  "actions.py"
  "jobs_client.py"
  "data_loader.py"
)
for f in "${INCLUDE[@]}"; do
  [ -e "$f" ] && cp "$f" "$STAGE/" || { echo "WARNING: missing $f"; }
done
cp -R qc_modules "$STAGE/qc_modules"
cp -R models "$STAGE/models"

# Scrub anything that should never ship
find "$STAGE" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$STAGE" -name "*.pyc" -delete 2>/dev/null || true
find "$STAGE" -name ".DS_Store" -delete 2>/dev/null || true

rm -f "$OUT"
( cd "$(dirname "$STAGE")" && zip -rqX "$OLDPWD/$OUT" "collabstudy-agent-kit" )
rm -rf "$(dirname "$STAGE")"

echo "Built $OUT"
echo "Contents:"
unzip -l "$OUT" | sed 's/^/  /'
echo
echo "Hand this single zip to each collaborator along with the study link."

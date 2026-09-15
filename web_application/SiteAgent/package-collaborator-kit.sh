#!/usr/bin/env bash
# Build a clean zip to hand to collaborators. Includes only what a non-technical
# collaborator needs (guide + double-click launchers + the agent that builds/runs in
# Docker). Excludes dev/build files, venvs, caches, local config.
#
#   ./package-collaborator-kit.sh https://your-study-server
#   STUDY_URL=https://your-study-server ./package-collaborator-kit.sh
#
# The study server address is INJECTED HERE rather than committed. The files in git
# carry the placeholder https://YOUR-STUDY-SERVER so this public repository never
# publishes the address of a live pilot server; the built kit carries the real one, so
# a collaborator only has to press Enter at the setup prompt.
#
# produces: collabstudy-agent-kit.zip
set -euo pipefail
cd "$(dirname "$0")"

PLACEHOLDER="https://YOUR-STUDY-SERVER"
STUDY_URL="${1:-${STUDY_URL:-}}"
if [ -z "$STUDY_URL" ]; then
  echo "ERROR: no study server address given." >&2
  echo "  usage: ./package-collaborator-kit.sh https://your-study-server" >&2
  echo "     or: STUDY_URL=https://your-study-server ./package-collaborator-kit.sh" >&2
  exit 1
fi
case "$STUDY_URL" in
  https://*) ;;
  *) echo "ERROR: study address must start with https:// (got '$STUDY_URL')" >&2; exit 1 ;;
esac
STUDY_URL="${STUDY_URL%/}"

OUT="collabstudy-agent-kit.zip"
STAGE="$(mktemp -d)/collabstudy-agent-kit"
mkdir -p "$STAGE"

# Files a collaborator needs (the helper builds the Docker image locally on first run).
# Deliberately NOT shipped: README.md (developer-facing), build_guide_pdf.py and this
# script (build tooling) — three overlapping documents confused our first pilot users.
INCLUDE=(
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
  [ -e "$f" ] && cp -p "$f" "$STAGE/" || echo "WARNING: missing $f"
done
cp -Rp qc_modules "$STAGE/qc_modules"
cp -Rp models "$STAGE/models"
[ -d sample-data ] && cp -Rp sample-data "$STAGE/sample-data"

# Inject the real study address into the staged copies only (never back into git).
for f in "COLLABORATOR_GUIDE.md" "collab-agent.sh" "collab-agent.ps1" ".env.example"; do
  [ -e "$STAGE/$f" ] || continue
  python3 - "$STAGE/$f" "$PLACEHOLDER" "$STUDY_URL" <<'PY'
import io, sys
path, ph, url = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(path, encoding="utf-8").read()
io.open(path, "w", encoding="utf-8").write(s.replace(ph, url))
PY
done

# Build the printable guide FROM THE SUBSTITUTED markdown so the PDF carries the real
# address too (build_guide_pdf.py resolves paths next to itself, so run it in STAGE).
cp -p build_guide_pdf.py "$STAGE/"
( cd "$STAGE" && python3 build_guide_pdf.py >/dev/null 2>&1 ) \
  || { echo "ERROR: could not build 'START HERE.pdf' (needs reportlab + markdown)." >&2; exit 1; }
rm -f "$STAGE/build_guide_pdf.py"

# Fail loudly rather than shipping a kit that still points at the placeholder.
if grep -rqI "$PLACEHOLDER" "$STAGE"; then
  echo "ERROR: placeholder survived substitution — refusing to ship." >&2; exit 1
fi

# Scrub anything that should never ship
find "$STAGE" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$STAGE" -name "*.pyc" -delete 2>/dev/null || true
find "$STAGE" -name ".DS_Store" -delete 2>/dev/null || true
find "$STAGE" -name ".env" -delete 2>/dev/null || true

# macOS/Linux need the executable bit to survive the zip or the launcher opens as text.
chmod +x "$STAGE/Start Agent.command" "$STAGE/collab-agent.sh" 2>/dev/null || true

rm -f "$OUT"
( cd "$(dirname "$STAGE")" && zip -rqX "$OLDPWD/$OUT" "collabstudy-agent-kit" )
rm -rf "$(dirname "$STAGE")"

echo "Built $OUT  (study server: $STUDY_URL)"
echo "Contents:"
unzip -l "$OUT" | sed 's/^/  /'
echo
echo "Hand this single zip to each collaborator. The guide inside is self-contained —"
echo "it already carries the study address, so no follow-up email is needed."

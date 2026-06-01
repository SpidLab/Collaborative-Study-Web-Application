#!/usr/bin/env bash
# Friendly setup + control script for the Collaborative Study Site Agent (macOS/Linux).
#
#   ./collab-agent.sh            run the guided setup, then start
#   ./collab-agent.sh start      start the agent (background)
#   ./collab-agent.sh stop       stop the agent
#   ./collab-agent.sh status     is it running?
#   ./collab-agent.sh logs       watch what it's doing (Ctrl+C to exit)
#   ./collab-agent.sh update     get the newest version and restart
#   ./collab-agent.sh reset      forget settings and start over
#
# Nothing here touches or uploads your raw data files. They are mounted read-only.

set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=".env"

# Colors (fall back to plain if not a terminal)
if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'; else B=""; G=""; Y=""; R=""; N=""; fi
say()  { printf "%s\n" "$*"; }
ok()   { printf "%s✓%s %s\n" "$G" "$N" "$*"; }
warn() { printf "%s!%s %s\n" "$Y" "$N" "$*"; }
err()  { printf "%s✗%s %s\n" "$R" "$N" "$*" >&2; }

compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@";
  elif command -v docker-compose >/dev/null 2>&1; then docker-compose "$@";
  else err "Docker Compose not found."; return 1; fi
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed."
    say ""
    say "Please install ${B}Docker Desktop${N} first (free):"
    say "  • Mac:     https://www.docker.com/products/docker-desktop/"
    say "  • Windows: use the Windows guide (collab-agent.ps1)"
    say ""
    say "After installing, OPEN Docker Desktop once, wait for it to say 'running',"
    say "then run this script again."
    case "$(uname -s)" in Darwin) command -v open >/dev/null && open "https://www.docker.com/products/docker-desktop/" || true;; esac
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker is installed but not running."
    say "Please OPEN the ${B}Docker Desktop${N} app and wait until it says 'running', then try again."
    case "$(uname -s)" in Darwin) open -a Docker >/dev/null 2>&1 || true;; esac
    exit 1
  fi
  ok "Docker is installed and running."
}

setup_wizard() {
  say ""
  say "${B}Welcome! Let's connect your computer to the study.${N}"
  say "This takes about 2 minutes. Your raw data never leaves this machine."
  say ""

  # 1) Server URL
  local default_url="https://collab.example.org"
  read -r -p "1) Paste the study server address (from your coordinator) [${default_url}]: " SERVER_URL
  SERVER_URL="${SERVER_URL:-$default_url}"

  # 2) Data folder
  say ""
  say "2) Where are your data files? They should be named like  eye_color.csv"
  local default_dir="$HOME/collab-data"
  read -r -p "   Folder path [${default_dir}]: " HOST_DATA_DIR
  HOST_DATA_DIR="${HOST_DATA_DIR:-$default_dir}"
  HOST_DATA_DIR="${HOST_DATA_DIR/#\~/$HOME}"
  if [ ! -d "$HOST_DATA_DIR" ]; then
    warn "That folder doesn't exist yet."
    read -r -p "   Create it now? [Y/n]: " mk
    case "${mk:-Y}" in [Yy]*) mkdir -p "$HOST_DATA_DIR"; ok "Created $HOST_DATA_DIR";; *) err "Please create the folder and re-run."; exit 1;; esac
  fi
  local n_csv; n_csv=$(find "$HOST_DATA_DIR" -maxdepth 1 -name '*.csv' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n_csv" = "0" ]; then warn "No .csv files in that folder yet — you can add them later."; else ok "Found $n_csv CSV file(s)."; fi

  # 3) Enrollment code
  say ""
  say "3) On the website, go to your account → 'Connect my computer' and copy the one-time code."
  read -r -p "   Paste the code here: " ENROLL_CODE
  while [ -z "${ENROLL_CODE// }" ]; do read -r -p "   The code can't be empty. Paste it: " ENROLL_CODE; done

  cat > "$ENV_FILE" <<EOF
SERVER_URL=${SERVER_URL%/}
HOST_DATA_DIR=${HOST_DATA_DIR}
ENROLL_CODE=${ENROLL_CODE}
AGENT_TOKEN=
AGENT_IMAGE=collabstudy-agent:local
EOF
  ok "Saved your settings to .env"
}

start_agent() {
  [ -f "$ENV_FILE" ] || { err "Not set up yet — run: ./collab-agent.sh"; exit 1; }
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  if [ -z "${HOST_DATA_DIR:-}" ] || [ ! -d "${HOST_DATA_DIR}" ]; then
    err "Your data folder (HOST_DATA_DIR) is missing: ${HOST_DATA_DIR:-<unset>}"; exit 1
  fi
  say "Building and starting the agent (first time can take a few minutes)..."
  if printf '%s' "${AGENT_IMAGE:-}" | grep -q '/'; then compose pull || true; compose up -d;
  else compose up -d --build; fi
  ok "Agent started. It runs in the background and restarts automatically with your computer."
  say ""
  say "Watch it work:   ${B}./collab-agent.sh logs${N}"
  say "Check status:    ${B}./collab-agent.sh status${N}"
}

case "${1:-setup}" in
  setup|"")
    check_docker
    if [ -f "$ENV_FILE" ]; then
      warn "Already set up."; read -r -p "Reconfigure from scratch? [y/N]: " a
      case "${a:-N}" in [Yy]*) setup_wizard;; *) :;; esac
    else
      setup_wizard
    fi
    start_agent
    ;;
  start)   check_docker; start_agent ;;
  stop)    compose down && ok "Agent stopped." ;;
  restart) check_docker; compose down || true; start_agent ;;
  status)
    if docker ps --filter "name=collab-agent" --format '{{.Names}} {{.Status}}' | grep -q collab-agent; then
      ok "Agent is RUNNING:"; docker ps --filter "name=collab-agent" --format '   {{.Status}}'
    else warn "Agent is NOT running. Start it with: ./collab-agent.sh start"; fi
    ;;
  logs)    compose logs -f --tail=50 ;;
  update)  check_docker; say "Updating..."; if printf '%s' "$(grep AGENT_IMAGE "$ENV_FILE" 2>/dev/null)" | grep -q '/'; then compose pull; else compose build --pull; fi; compose up -d && ok "Updated and restarted." ;;
  reset)   compose down -v 2>/dev/null || true; rm -f "$ENV_FILE"; ok "Settings cleared. Run ./collab-agent.sh to set up again." ;;
  *) err "Unknown command: $1"; say "Use: setup | start | stop | restart | status | logs | update | reset"; exit 1 ;;
esac

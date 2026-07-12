#!/bin/bash
# Double-click this file (Mac) to set up / start the Site Agent — no typing needed.
# The first time, macOS may ask you to confirm: right-click this file -> Open.
cd "$(dirname "$0")" || exit 1
chmod +x collab-agent.sh 2>/dev/null
./collab-agent.sh
echo ""
echo "------------------------------------------------------------"
echo "Done. The agent runs in the background — you can close this window."
read -n 1 -s -r -p "Press any key to close this window..."
echo ""

#!/bin/bash
# Start the central collaboration server (Backend + Frontend).
# The QC/GWAS workers no longer run here — collaborators run the local Site Agent
# (web_application/SiteAgent) in Docker on their own machines.

echo "🚀 Starting central services..."
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Terminal 1: Flask Backend (central API + agent job queue)
echo "🐍 Starting Flask Backend..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/web_application/Backend/FlaskApp' && python app.py\""

sleep 2

# Terminal 2: Frontend
echo "⚛️  Starting Frontend..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/web_application/Frontend' && npm run dev\""

echo ""
echo "✅ Central services started in separate Terminal windows!"
echo ""
echo "Services:"
echo "  - Backend: http://localhost:5000 (or check your PORT env var)"
echo "  - Frontend: http://localhost:5173"
echo ""
echo "📝 Collaborators run the Site Agent separately:"
echo "   docker run -d -e SERVER_URL=<url> -e AGENT_TOKEN=<token> -v /local/data:/data:ro collabstudy-agent"

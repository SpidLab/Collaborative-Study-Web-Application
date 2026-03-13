#!/bin/bash
# Start all services: Orchestrator, Backend, and Frontend

echo "🚀 Starting all services..."
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Terminal 1: Orchestrator Server
echo "📦 Starting Orchestrator Server..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/web_application/Backend/FlaskApp/ORCHISTRATION SERVER' && export USE_ORCHESTRATOR=true && export ORCHESTRATOR_URL=http://localhost:3000 && export WARM_POOL_SIZE=3 && export MAX_PODS=10 && export NAMESPACE=default && export WORKER_IMAGE=qc-worker:latest && ./start.sh\""

# Wait a bit
sleep 3

# Terminal 2: Flask Backend
echo "🐍 Starting Flask Backend..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/web_application/Backend/FlaskApp' && export USE_ORCHESTRATOR=true && export ORCHESTRATOR_URL=http://localhost:3000 && export QC_CONTROLLER_URL=http://localhost:5001 && python app.py\""

# Wait a bit
sleep 2

# Terminal 3: Frontend
echo "⚛️  Starting Frontend..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/web_application/Frontend' && npm run dev\""

echo ""
echo "✅ All services started in separate Terminal windows!"
echo ""
echo "Services:"
echo "  - Orchestrator: http://localhost:3000"
echo "  - Backend: http://localhost:5000 (or check your PORT env var)"
echo "  - Frontend: http://localhost:5173"
echo ""
echo "📝 Note: Make sure Docker Desktop is running with Kubernetes enabled!"

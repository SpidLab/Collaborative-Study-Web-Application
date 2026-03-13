#!/bin/bash
# Start the Orchestrator Server

# Load environment variables from .env (ignore comments and empty lines)
if [ -f .env ]; then
export $(grep -v '^#' .env | grep -v '^$' | xargs)
fi

# Start the server
echo "🚀 Starting QC Orchestrator Server..."
echo "   Port: ${ORCHESTRATOR_URL:-http://localhost:3000}"
echo "   Namespace: ${NAMESPACE:-default}"
echo "   Max Pods: ${MAX_PODS:-10}"
echo ""

node server.js

#!/bin/bash
# Complete rebuild script for QC Worker and Orchestrator

set -e  # Exit on error

echo "🚀 Starting complete rebuild process..."
echo ""

# Step 1: Clean up old Kubernetes pods
echo "🧹 Step 1: Cleaning up old Kubernetes pods..."
kubectl delete pods -l type=qc-worker 2>/dev/null || echo "  No pods to delete"
kubectl delete pods -l pool=warm 2>/dev/null || echo "  No warm pods to delete"
echo "  ✅ Old pods cleaned up"
echo ""

# Step 2: Clean up old Docker images
echo "🧹 Step 2: Cleaning up old Docker images..."
docker rmi qc-worker:latest 2>/dev/null || echo "  No old image to remove"
echo "  ✅ Old images cleaned up"
echo ""

# Step 3: Rebuild Docker image
echo "🔨 Step 3: Rebuilding QC Worker Docker image..."
cd web_application/Backend/FlaskApp
docker build -f "ORCHISTRATION SERVER/Dockerfile.qc_worker" -t qc-worker:latest .

if [ $? -eq 0 ]; then
    echo "  ✅ Docker image built successfully"
else
    echo "  ❌ Docker build failed!"
    exit 1
fi
echo ""

# Step 4: Verify image
echo "📋 Step 4: Verifying Docker image..."
docker images | grep qc-worker
echo ""

# Step 5: Check Kubernetes cluster
echo "🔍 Step 5: Checking Kubernetes cluster..."
if kubectl cluster-info &>/dev/null; then
    echo "  ✅ Kubernetes cluster is accessible"
else
    echo "  ⚠️  Kubernetes cluster not accessible - make sure it's running"
fi
echo ""

echo "✅ Rebuild complete!"
echo ""
echo "📝 Next steps (run these in separate terminals):"
echo ""
echo "1. Start Orchestrator:"
echo "   cd web_application/Backend/FlaskApp/ORCHISTRATION\\ SERVER"
echo "   ./start.sh"
echo ""
echo "2. Start Flask Backend:"
echo "   cd web_application/Backend/FlaskApp"
echo "   python app.py"
echo ""
echo "3. Start Frontend (optional):"
echo "   cd web_application/Frontend"
echo "   npm start"
echo ""

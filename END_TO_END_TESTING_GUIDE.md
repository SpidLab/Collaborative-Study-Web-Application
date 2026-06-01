# End-to-End Testing Guide: Option 3 (Warm Pool + Async)

## 🚀 Complete Setup and Testing Steps

This guide walks you through running the entire system with Option 3 (Warm Pool + Async) enabled.

---

## 📋 Prerequisites

1. **Kubernetes cluster running** (minikube, Docker Desktop Kubernetes, or cloud cluster)
2. **Docker images built**:
   - `qc-worker:latest` (QC worker image)
3. **MongoDB Atlas credentials** configured
4. **Node.js** installed (for orchestrator)
5. **Python 3.10+** installed (for Flask backend)

---

## 🔧 Step 1: Build Docker Images

### Build QC Worker Image

```bash
cd web_application/Backend/FlaskApp/ORCHISTRATION\ SERVER

# Build the QC worker image
docker build -f Dockerfile.qc_worker -t qc-worker:latest .

# Verify image was created
docker images | grep qc-worker
```

**Expected output:**

```
qc-worker    latest    abc123def456    2 minutes ago    1.2GB
```

---

## ⚙️ Step 2: Configure Environment Variables

### Orchestrator Server Environment

Create `.env` file in `ORCHISTRATION SERVER/` directory:

```bash
cd web_application/Backend/FlaskApp/ORCHISTRATION\ SERVER

cat > .env << 'EOF'
# Kubernetes Configuration
NAMESPACE=default
MAX_PODS=10
WARM_POOL_SIZE=3
WORKER_IMAGE=qc-worker:latest
ORCHESTRATOR_URL=http://localhost:3000

# MongoDB Atlas (for QC workers)
MONGO_USERNAME=CollaboratorDB
MONGO_PASSWORD=CollaboratorDB@123
MONGO_CLUSTER=collaboratordb.68hkp69.mongodb.net
EOF
```

### Flask Backend Environment

Create/update `.env` file in `FlaskApp/` directory:

```bash
cd web_application/Backend/FlaskApp

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
fi

# Add orchestrator configuration
cat >> .env << 'EOF'

# Orchestrator Configuration
USE_ORCHESTRATOR=true
ORCHESTRATOR_URL=http://localhost:3000
QC_CONTROLLER_URL=http://localhost:5001
EOF

# Edit .env and set your MongoDB URI, PORT, SECRET_KEY
nano .env
```

**Required in `.env`:**

```bash
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/test?retryWrites=true&w=majority
PORT=5002
SECRET_KEY=your-secret-key-here
USE_ORCHESTRATOR=true
ORCHESTRATOR_URL=http://localhost:3000
```

---

## 🎬 Step 3: Start Services

### Terminal 1: Orchestrator Server

```bash
cd web_application/Backend/FlaskApp/ORCHISTRATION\ SERVER

# Install dependencies (first time only)
npm install

# Load environment variables
export $(cat .env | xargs)

# Start orchestrator
node server.js
```

**Expected output:**

```
==================================================
Orchestrator Server Started
==================================================
Listening on port 3000
Max Containers: 10
Warm Pool Size: 3
Worker Image: qc-worker:latest
Callback URL: http://localhost:3000
==================================================
🔥 [Warm Pool] Initializing warm pool (target size: 3)...
🔥 [Warm Pool] Created warm pod: qc-warm-1736534829-abc123
🔥 [Warm Pool] Created warm pod: qc-warm-1736534830-def456
🔥 [Warm Pool] Created warm pod: qc-warm-1736534831-ghi789
✅ [Warm Pool] Warm pool initialized (3 pods ready)
```

**Verify warm pods:**

```bash
# In another terminal
kubectl get pods -l pool=warm
```

**Expected:**

```
NAME                          READY   STATUS    RESTARTS   AGE
qc-warm-1736534829-abc123    1/1     Running   0          30s
qc-warm-1736534830-def456    1/1     Running   0          29s
qc-warm-1736534831-ghi789    1/1     Running   0          28s
```

---

### Terminal 2: Flask Backend

```bash
cd web_application/Backend/FlaskApp

# Load environment variables
export $(cat .env | xargs)

# Start Flask app
python app.py
```

**Expected output:**

```
✅ Orchestrator enabled at http://localhost:3000
✅ Using direct QC Controller at http://localhost:5001
 * Running on http://0.0.0.0:5002
```

**Note:** If you see "Using direct QC Controller", check that `USE_ORCHESTRATOR=true` in your `.env` file.

---

### Terminal 3: Frontend (Optional - if testing UI)

```bash
cd web_application/Frontend

# Install dependencies (first time only)
npm install

# Start frontend
npm run dev
```

**Expected output:**

```
  VITE v5.x.x  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 🧪 Step 4: Test End-to-End

### Test 1: Check Orchestrator Status

```bash
curl http://localhost:3000/status
```

**Expected response:**

```json
{
  "running": 0,
  "queued": 0,
  "warmPool": 3,
  "warmPoolTarget": 3,
  "maxCapacity": 10,
  "available": 10,
  "completedRequests": 0
}
```

---

### Test 2: Submit QC Request (via API)

```bash
# First, get auth token (login via frontend or API)
# Then submit QC request

curl -X POST http://localhost:5002/api/qc/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "phenotype": "data1",
    "method": "pca"
  }'
```

**Expected response (immediate - < 1 second):**

```json
{
  "success": true,
  "message": "QC request accepted and processing",
  "request_id": "683db31333e5a4b5ae8b3a11-1736534829",
  "status": "processing",
  "poll_url": "/api/qc/status/683db31333e5a4b5ae8b3a11-1736534829"
}
```

**Key points:**

- ✅ Returns immediately (no waiting!)
- ✅ Status is "processing"
- ✅ You get a `request_id` to poll

---

### Test 3: Check Request Status

```bash
# Replace REQUEST_ID with the one from previous response
curl http://localhost:5002/api/qc/status/683db31333e5a4b5ae8b3a11-1736534829 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (while processing):**

```json
{
  "request_id": "683db31333e5a4b5ae8b3a11-1736534829",
  "status": "processing",
  "pod_name": "qc-warm-1736534829-abc123",
  "start_time": "2024-01-25T13:11:00Z"
}
```

**Response (when completed):**

```json
{
  "request_id": "683db31333e5a4b5ae8b3a11-1736534829",
  "status": "completed",
  "results": {
    "success": true,
    "data": "csv_content...",
    "output_shape": [157, 3]
  },
  "completed_at": "2024-01-25T13:11:45Z"
}
```

---

### Test 4: Monitor Pods

```bash
# Watch pods in real-time
kubectl get pods -w

# Or check specific labels
kubectl get pods -l pool=warm        # Warm pool pods
kubectl get pods -l state=processing # Processing pods
```

**What you'll see:**

1. Warm pods in "Running" state (ready)
2. When request arrives, pod changes to "processing"
3. After completion, pod returns to "ready" (or gets deleted if pool full)

---

### Test 5: Check Orchestrator Logs

In Terminal 1 (orchestrator), you should see:

```
📨 New QC Request:
   Request ID: 683db31333e5a4b5ae8b3a11-1736534829
   User: Sahith (683db31333e5a4b5ae8b3a11)
   Action: create
   Phenotype: data1
   Method: pca

🔥 [Warm Pool] Assigned request 683db31333e5a4b5ae8b3a11-1736534829 to warm pod: qc-warm-1736534829-abc123
   Warm pool: 2/3, Running: 1/10

📬 [Callback] QC Container qc-warm-1736534829-abc123 completed
   User ID: 683db31333e5a4b5ae8b3a11
   Status: success
✅ [Callback] qc-warm-1736534829-abc123 completed in 15.23s

🔥 [Warm Pool] Returned pod qc-warm-1736534829-abc123 to warm pool (Pool size: 3/3)
```

---

## 🎯 Test Scenarios

### Scenario 1: Single Request

1. Submit one request
2. Should use warm pod (fast)
3. Pod returns to pool after completion

### Scenario 2: Multiple Concurrent Requests

1. Submit 5 requests simultaneously
2. First 3 use warm pods
3. Next 2 create new pods (or queue if at capacity)
4. All process in parallel

### Scenario 3: Queue Test

1. Set `MAX_PODS=2` and `WARM_POOL_SIZE=1`
2. Submit 5 requests
3. First 2 process immediately
4. Next 3 queue
5. As pods complete, queued requests start

### Scenario 4: Warm Pool Maintenance

1. Submit requests until warm pool is empty
2. Wait 30 seconds
3. Check orchestrator logs - should see pool maintenance
4. Verify new warm pods created

---

## 🔍 Troubleshooting

### Issue: Orchestrator can't create pods

**Check:**

```bash
# Verify Kubernetes connection
kubectl cluster-info

# Check if namespace exists
kubectl get namespace default

# Check RBAC permissions
kubectl auth can-i create pods --namespace=default
```

**Fix:**

```bash
# If using minikube, ensure it's running
minikube status

# If using Docker Desktop, ensure Kubernetes is enabled
```

---

### Issue: Warm pods not starting

**Check:**

```bash
# Check pod status
kubectl get pods -l pool=warm

# Check pod logs
kubectl logs qc-warm-XXXXX

# Check pod events
kubectl describe pod qc-warm-XXXXX
```

**Common causes:**

- Image not found: `qc-worker:latest` doesn't exist
- Resource limits: Not enough CPU/memory
- Image pull errors

**Fix:**

```bash
# Rebuild image
docker build -f Dockerfile.qc_worker -t qc-worker:latest .

# If using minikube, load image
minikube image load qc-worker:latest
```

---

### Issue: Flask not using orchestrator

**Check:**

```bash
# Verify environment variable
echo $USE_ORCHESTRATOR

# Check Flask logs
# Should see: "✅ Orchestrator enabled at http://localhost:3000"
```

**Fix:**

```bash
# Ensure .env file has:
USE_ORCHESTRATOR=true
ORCHESTRATOR_URL=http://localhost:3000

# Restart Flask app
```

---

### Issue: Status endpoint returns 404

**Check:**

- Request ID is correct
- Request was actually submitted
- Orchestrator received the request

**Debug:**

```bash
# Check orchestrator logs for request_id
# Check Flask logs for errors
# Verify request_id format matches
```

---

## 📊 Monitoring Commands

### Check System Status

```bash
# Orchestrator status
curl http://localhost:3000/status | jq

# Kubernetes pods
kubectl get pods -l type=qc-worker

# Flask health (if you have one)
curl http://localhost:5002/health
```

### Watch Real-Time Activity

```bash
# Terminal 1: Watch pods
watch -n 1 'kubectl get pods -l type=qc-worker'

# Terminal 2: Watch orchestrator logs
tail -f orchestrator.log

# Terminal 3: Watch Flask logs
tail -f flask.log
```

---

## ✅ Success Criteria

Your system is working correctly if:

1. ✅ Orchestrator starts and creates 3 warm pods
2. ✅ Flask connects to orchestrator (logs show "Orchestrator enabled")
3. ✅ Request returns immediately with `request_id`
4. ✅ Status endpoint shows "processing" then "completed"
5. ✅ Warm pods are reused (same pod name appears multiple times)
6. ✅ Results are returned when status is "completed"
7. ✅ Pods return to pool after processing

---

## 🎉 Next Steps

Once everything is working:

1. **Test with frontend** - Use UI to submit requests
2. **Monitor performance** - Check response times
3. **Adjust warm pool size** - Tune `WARM_POOL_SIZE` based on load
4. **Scale up** - Test with multiple concurrent users
5. **Production deployment** - Deploy to Kubernetes cluster

---

## 📝 Quick Reference

### Start All Services

```bash
# Terminal 1: Orchestrator
cd ORCHISTRATION\ SERVER && npm start

# Terminal 2: Flask
cd FlaskApp && python app.py

# Terminal 3: Frontend (optional)
cd Frontend && npm run dev
```

### Test Request

```bash
curl -X POST http://localhost:5002/api/qc/create \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phenotype":"data1","method":"pca"}'
```

### Check Status

```bash
curl http://localhost:5002/api/qc/status/REQUEST_ID \
  -H "Authorization: Bearer TOKEN"
```

### Monitor Pods

```bash
kubectl get pods -w -l type=qc-worker
```

---

**You're all set! Start testing the end-to-end flow.** 🚀

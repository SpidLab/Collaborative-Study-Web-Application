# Option 3 Implementation: Warm Pool + Async Processing

## ✅ Implementation Complete

Option 3 (Hybrid: Warm Pool + Async) has been fully implemented with configurable warm pool size.

---

## 🎯 Key Features

### 1. **Warm Pod Pool**

- Maintains configurable number of ready pods (default: 3)
- Pods are pre-created and ready to accept requests
- Eliminates pod creation latency (0-2s instead of 5-15s)
- Pods are reused after processing (returned to pool)

### 2. **Async Request Processing**

- Requests return immediately with `request_id`
- No waiting for processing to complete
- Frontend can poll status endpoint
- Better UX - user doesn't wait

### 3. **Smart Pod Management**

- Assigns requests to warm pods first (fastest)
- Creates new pods if warm pool empty
- Returns pods to pool after processing (if pool not full)
- Deletes pods if pool is full

### 4. **Status Tracking**

- `/api/qc/status/<request_id>` endpoint
- Tracks: queued → processing → completed/failed
- Returns results when completed

---

## 📋 Configuration

### Environment Variables

**Orchestrator Server (`server.js`):**

```bash
WARM_POOL_SIZE=3        # Number of warm pods to maintain (default: 3)
MAX_PODS=10            # Maximum concurrent pods (default: 10)
NAMESPACE=default      # Kubernetes namespace
WORKER_IMAGE=qc-worker:latest
```

**Flask Backend (`app.py`):**

```bash
USE_ORCHESTRATOR=true
ORCHESTRATOR_URL=http://localhost:3000
```

---

## 🔄 Complete Flow

### Step 1: User Sends Request

```
POST /api/qc/create
{
  "phenotype": "data1",
  "method": "pca"
}
```

### Step 2: Flask Returns Immediately

```json
{
  "success": true,
  "request_id": "683db31333e5a4b5ae8b3a11-1736534829",
  "status": "processing",
  "poll_url": "/api/qc/status/683db31333e5a4b5ae8b3a11-1736534829"
}
```

**Response time: < 1 second** (no waiting!)

### Step 3: Orchestrator Assigns to Warm Pod

- Checks warm pool (3 ready pods)
- Assigns request to first available pod
- Updates pod environment with request data
- Pod starts processing immediately

### Step 4: Pod Processes Request

- Connects to MongoDB
- Runs QC method (MAF/HWE/PCA/etc.)
- Stores results in user's database
- Sends completion callback

### Step 5: Pod Returns to Pool

- Orchestrator receives callback
- Stores results
- Returns pod to warm pool (if pool not full)
- Or deletes pod if pool is full

### Step 6: Frontend Polls Status

```
GET /api/qc/status/683db31333e5a4b5ae8b3a11-1736534829
```

**Response (processing):**

```json
{
  "request_id": "...",
  "status": "processing",
  "pod_name": "qc-warm-1736534829-abc123"
}
```

**Response (completed):**

```json
{
  "request_id": "...",
  "status": "completed",
  "results": {
    "success": true,
    "data": "...",
    "output_shape": [157, 3]
  },
  "completed_at": "2024-01-25T13:11:00Z"
}
```

---

## 📊 Performance Comparison

### Before (On-Demand Pods):

- Pod creation: 5-15 seconds
- Processing: 10-30 seconds
- **Total wait time: 15-45 seconds**

### After (Warm Pool + Async):

- Request accepted: < 1 second (immediate)
- Pod assignment: 0-2 seconds (warm pod ready)
- Processing: 10-30 seconds (background)
- **User wait time: 0 seconds** (returns immediately!)

---

## 🎛️ Warm Pool Behavior

### Pool Initialization

- On orchestrator startup, creates `WARM_POOL_SIZE` pods
- Pods are labeled as `pool=warm`, `state=ready`
- Pods wait for requests

### Request Assignment

1. Check warm pool for available pod
2. If available → Assign request (update env vars)
3. If empty → Create new pod (fallback)
4. If at capacity → Queue request

### Pod Lifecycle

```
Warm Pool (ready) → Processing → Warm Pool (ready) → Processing → ...
                    ↓ (if pool full)
                 Deleted
```

### Pool Maintenance

- Checks pool size every 30 seconds
- Creates new pods if below target
- Maintains `WARM_POOL_SIZE` ready pods

---

## 🔧 API Endpoints

### 1. Submit Request (Async)

```
POST /api/qc/create
```

**Returns immediately:**

```json
{
  "success": true,
  "request_id": "...",
  "status": "processing" | "queued",
  "position": 1  // if queued
}
```

### 2. Check Status

```
GET /api/qc/status/<request_id>
```

**Returns:**

- `queued` - Waiting in queue
- `processing` - Currently processing
- `completed` - Done, includes results
- `failed` - Error occurred

### 3. Orchestrator Status

```
GET /status
```

**Returns:**

```json
{
  "running": 2,
  "queued": 1,
  "warmPool": 3,
  "warmPoolTarget": 3,
  "maxCapacity": 10,
  "available": 8
}
```

---

## 🚀 Usage

### 1. Set Environment Variables

```bash
# Orchestrator Server
export WARM_POOL_SIZE=3
export MAX_PODS=10

# Flask Backend
export USE_ORCHESTRATOR=true
export ORCHESTRATOR_URL=http://localhost:3000
```

### 2. Start Orchestrator

```bash
cd ORCHISTRATION\ SERVER
npm start
```

**Output:**

```
🔥 [Warm Pool] Initializing warm pool (target size: 3)...
🔥 [Warm Pool] Created warm pod: qc-warm-1736534829-abc123
🔥 [Warm Pool] Created warm pod: qc-warm-1736534830-def456
🔥 [Warm Pool] Created warm pod: qc-warm-1736534831-ghi789
✅ [Warm Pool] Warm pool initialized (3 pods ready)
```

### 3. Start Flask Backend

```bash
cd web_application/Backend/FlaskApp
python app.py
```

### 4. Frontend Implementation

```javascript
// Submit request
const response = await axios.post("/api/qc/create", {
  phenotype: "data1",
  method: "pca",
});

const { request_id, status } = response.data;

// Poll for status
const pollStatus = async () => {
  const statusResponse = await axios.get(`/api/qc/status/${request_id}`);

  if (statusResponse.data.status === "completed") {
    // Process results
    const results = statusResponse.data.results;
    // Update UI
  } else if (statusResponse.data.status === "processing") {
    // Show progress, poll again in 2 seconds
    setTimeout(pollStatus, 2000);
  }
};

pollStatus();
```

---

## 📈 Benefits

1. **Fast Response**: Requests return immediately (< 1s)
2. **Low Latency**: Warm pods eliminate creation time
3. **Better UX**: Users don't wait, can continue working
4. **Resource Efficient**: Pods reused, not recreated
5. **Scalable**: Handles bursts with warm pool + queue
6. **Configurable**: Adjust warm pool size based on load

---

## 🔍 Monitoring

### Check Warm Pool Status

```bash
kubectl get pods -l pool=warm
```

### Check Processing Pods

```bash
kubectl get pods -l state=processing
```

### View Orchestrator Logs

```bash
# See warm pool operations
grep "Warm Pool" orchestrator.log
```

---

## ✅ Summary

**Option 3 is fully implemented and ready to use!**

- ✅ Warm pool with configurable size
- ✅ Async request processing
- ✅ Pod reuse and lifecycle management
- ✅ Status tracking and polling
- ✅ Queue management
- ✅ Auto-scaling and maintenance

**Result: Fast, efficient, scalable QC processing with zero user wait time!** 🚀

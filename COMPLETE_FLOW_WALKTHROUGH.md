# Complete Flow Walkthrough: Frontend Button → Kubernetes Pod

## 🎬 Complete Flow with Orchestrator

### Step-by-Step Flow When User Clicks "Create QC Dataset"

---

### 1. **Frontend Button Click**

**File**: `CollaborationDetails.jsx` line ~290

```javascript
// User clicks "Create New QC Dataset" button
const handleCreateQcDataset = async () => {
  const userInfo = getCurrentUserInfo(); // Gets phenotype from collaboration

  // Sends request to backend
  const response = await axios.post(
    `${URL}/api/qc/create`,
    {
      phenotype: userInfo.phenotype, // e.g., "data1"
      method: selectedQcMethod, // e.g., "pca"
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
};
```

**What happens**: Frontend sends `POST /api/qc/create` with phenotype and method.

---

### 2. **Backend Receives Request**

**File**: `app.py` line ~1781 (`qc_create` endpoint)

```python
@app.route('/api/qc/create', methods=['POST'])
def qc_create():
    phenotype = data.get('phenotype')  # "data1"
    method = data.get('method')        # "pca"
    user_name = current_user.user_json.get('name')
    user_id = str(current_user.id)
```

**What happens**: Flask receives request, extracts user info and QC parameters.

---

### 3. **Route to Orchestrator or Direct QC**

**File**: `app.py` line ~1880

```python
if USE_ORCHESTRATOR and orchestrator:
    # ✅ NEW: Use Kubernetes Orchestrator
    qc_result = orchestrator.submit_qc_request(
        username=user_name,     # "Sahith"
        user_id=user_id,        # "683db31333e5a4b5ae8b3a11"
        phenotype=phenotype,    # "data1"
        method=method,          # "pca"
        action='create'
    )
else:
    # ❌ OLD: Direct HTTP call to QC Controller
    response = http_requests.post(f"{QC_CONTROLLER_URL}/api/qc", ...)
```

**What happens**: If orchestrator is enabled, routes through orchestrator. Otherwise, direct call.

---

### 4. **Orchestrator Client Submits Request**

**File**: `orchestrator_client.py` line ~40

```python
def submit_qc_request(self, username, user_id, phenotype, method, action):
    # Sends request to Kubernetes Orchestrator
    response = requests.post(
        f"{self.orchestrator_url}/qc/process",  # http://localhost:3000/qc/process
        json={
            'userId': user_id,
            'username': username,
            'phenotype': phenotype,
            'method': method,
            'action': action
        }
    )
```

**What happens**: Python client sends request to Node.js orchestrator server.

---

### 5. **Orchestrator Server Receives Request**

**File**: `server.js` line ~142

```javascript
app.post("/qc/process", async (req, res) => {
  const { userId, username, phenotype, method, action } = req.body;

  // Check capacity
  if (runningContainers.size < MAX_PODS) {
    // ✅ Start QC container immediately
    const result = await startQcContainer(userId, username, requestData);
    return res.json({ status: "processing", podName, requestId });
  } else {
    // ⏳ Queue the request
    requestQueue.push({ userId, username, requestData });
    return res.json({ status: "queued", position });
  }
});
```

**What happens**: Orchestrator checks capacity and either starts a pod or queues the request.

---

### 6. **Kubernetes Pod Created**

**File**: `server.js` line ~48

```javascript
async function startQcContainer(userId, username, requestData) {
  const podName = `qc-${username}-${timestamp}`;

  // Create Kubernetes Pod manifest
  const podManifest = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: podName,
      labels: { type: "qc-worker", username: username },
    },
    spec: {
      containers: [
        {
          name: "qc-worker",
          image: "qc-worker:latest", // Your QC worker image
          env: [
            { name: "REQUEST_DATA", value: JSON.stringify(requestData) },
            { name: "USER_ID", value: userId },
            { name: "USERNAME", value: username },
            // MongoDB credentials, callback URL, etc.
          ],
        },
      ],
      restartPolicy: "Never", // Pod terminates after completion
    },
  };

  // Create the pod in Kubernetes
  await k8sApi.createNamespacedPod(NAMESPACE, podManifest);
}
```

**What happens**:

- Orchestrator creates a NEW Kubernetes pod
- Pod name: `qc-sahith-1736534829-abc123`
- Pod is labeled for tracking
- Pod has isolated resources

---

### 7. **QC Worker Pod Starts**

**File**: `qc_worker.py` line ~145

```python
def main():
    # Get environment variables from pod
    pod_name = os.environ.get('POD_NAME')
    user_id = os.environ.get('USER_ID')
    raw_data = os.environ.get('REQUEST_DATA')

    # Parse request
    request_data = json.loads(raw_data)
    # request_data = {
    #     "username": "Sahith",
    #     "user_id": "683db31333e5a4b5ae8b3a11",
    #     "phenotype": "data1",
    #     "method": "pca",
    #     "action": "create"
    # }

    # Process QC request
    results = process_qc_request(request_data)
```

**What happens**:

- Pod starts executing `qc_worker.py`
- Reads request data from environment variables
- Connects to MongoDB Atlas (user-specific database)

---

### 8. **QC Processing in Isolated Container**

**File**: `qc_worker.py` line ~38

```python
def process_qc_request(request_data):
    username = request_data['username']  # "Sahith"
    phenotype = request_data['phenotype']  # "data1"
    method = request_data['method']       # "pca"

    # Connect to MongoDB
    client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())
    user_db = client[username]  # Database: "Sahith"

    # Get raw data from user's database
    raw_doc = user_db['rawdata'].find_one({"phenotype": phenotype})
    df = pd.read_csv(io.StringIO(raw_doc['data']))

    # Process with QC method (MAF, HWE, PCA, etc.)
    # ... QC processing logic ...

    # Store results in qcdata collection
    output_filename = f"{phenotype}_{method}_output.csv"
    qc_doc = {
        "filename": output_filename,
        "phenotype": phenotype,
        "method": method,
        "data": csv_output,
        "rows": len(df),
        "columns": len(df.columns)
    }

    user_db['qcdata'].update_one(
        {"filename": output_filename},
        {"$set": qc_doc},
        upsert=True
    )

    return {
        "success": True,
        "data": csv_output,
        "output_shape": [len(df), len(df.columns)]
    }
```

**What happens**:

- Worker connects to its own MongoDB (isolated)
- Processes QC method (MAF/HWE/PCA/etc.)
- Stores results in user's QC database
- Returns results

---

### 9. **Worker Sends Completion Callback**

**File**: `qc_worker.py` line ~13

```python
def send_completion_callback(pod_name, user_id, status, results):
    callback_url = os.environ.get('CALLBACK_URL')
    # callback_url = "http://qc-orchestrator-service/qc-complete"

    payload = {
        'podName': pod_name,
        'userId': user_id,
        'status': status,  # "success" or "failed"
        'results': results
    }

    requests.post(callback_url, json=payload)
```

**What happens**: Worker notifies orchestrator that it's done.

---

### 10. **Orchestrator Receives Callback**

**File**: `server.js` line ~197

```javascript
app.post("/qc-complete", async (req, res) => {
  const { podName, userId, status, results } = req.body;

  // Log completion
  const duration = new Date() - containerInfo.startTime;
  console.log(`✅ ${podName} completed in ${duration / 1000}s`);

  // Store results for retrieval
  completedRequests.set(requestId, { status, results });

  // Delete the pod automatically
  await k8sApi.deleteNamespacedPod(podName, NAMESPACE);

  // Process next request in queue
  processQueue();
});
```

**What happens**:

- Orchestrator receives callback
- Stores results temporarily
- **Deletes the Kubernetes pod** (cleanup!)
- Processes next queued request if any

---

### 11. **Orchestrator Client Polls for Results**

**File**: `orchestrator_client.py` line ~79

```python
# Poll for results
while True:
    results_response = requests.get(
        f"{self.orchestrator_url}/qc/results/{request_id}"
    )

    if results_response.status_code == 200:
        # Results ready!
        return results_response.json()

    # Still processing, wait and retry
    time.sleep(2)
```

**What happens**: Python client polls orchestrator until results are ready.

---

### 12. **Results Returned to app.py**

**File**: `app.py` line ~1900

```python
qc_result = orchestrator.submit_qc_request(...)
# qc_result = {
#     "success": True,
#     "data": "csv_content...",
#     "output_shape": [157, 3],
#     "method": "pca"
# }

# Parse and store in main database
df = pd.read_csv(io.StringIO(qc_result['data']))
dataset = {
    "user_id": user_id,
    "phenotype": phenotype,
    "data": {...},  # Parsed data
    "is_qc_data": True,
    "qc_method": method
}
db['datasets'].insert_one(dataset)
```

**What happens**: app.py receives results and stores in main datasets collection.

---

### 13. **Response to Frontend**

**File**: `app.py` line ~2010

```python
return jsonify({
    "success": True,
    "message": f"QC data created successfully using {method}",
    "dataset_id": qc_dataset_id,
    "phenotype": phenotype,
    "qc_method": method
}), 200
```

**What happens**: Frontend receives success response with dataset_id.

---

### 14. **Frontend Updates UI**

**File**: `CollaborationDetails.jsx` line ~312

```javascript
if (response.status === 200) {
  setSnackbar({ message: `QC dataset created successfully!` });

  // Refresh QC datasets list
  await fetchQcDatasets();

  // Auto-select the newly created dataset
  setSelectedQcDataset(response.data.dataset_id);
}
```

**What happens**:

- Success message shown
- QC datasets list refreshed
- New dataset auto-selected
- User can now use it for collaboration

---

## 🎯 Summary

### Without Orchestrator (Current):

```
Frontend → app.py → QC Controller (always running) → Results
```

- ❌ Single QC Controller handles all requests
- ❌ No isolation between users
- ❌ Must always be running

### With Orchestrator (New):

```
Frontend → app.py → Orchestrator → [Pod 1 for User A]
                                  → [Pod 2 for User B] → Results
                                  → [Pod 3 for User C]
                                  ↓ (Auto-deleted after completion)
```

- ✅ Isolated container per user/request
- ✅ Auto-scaling (up to MAX_PODS concurrent)
- ✅ Auto-cleanup after completion
- ✅ Queue management for capacity
- ✅ Kubernetes native

## 🔧 To Enable Orchestrator

### Option 1: Environment Variable (Recommended)

```bash
export USE_ORCHESTRATOR=true
export ORCHESTRATOR_URL=http://localhost:3000
python app.py
```

### Option 2: Always Use Orchestrator

In `app.py` line ~42, change:

```python
USE_ORCHESTRATOR = True  # Always use orchestrator
```

## 🧪 Testing

### With Orchestrator Disabled (Default):

```bash
export USE_ORCHESTRATOR=false
python app.py
# Uses direct QC Controller at localhost:5001
```

### With Orchestrator Enabled:

```bash
export USE_ORCHESTRATOR=true
export ORCHESTRATOR_URL=http://localhost:3000
python app.py
# Uses Kubernetes pods via orchestrator
```

## ✅ Integration Complete!

The orchestrator is now **fully integrated** with your app.py.

**To use it:**

1. Deploy orchestrator to Kubernetes
2. Set `USE_ORCHESTRATOR=true`
3. Click "Create QC Dataset" in frontend
4. Watch Kubernetes pods being created and deleted automatically!

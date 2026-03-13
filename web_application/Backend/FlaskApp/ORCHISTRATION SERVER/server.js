const express = require('express');
const k8s = require('@kubernetes/client-node');
const http = require('http');
const app = express();
// Increase body size limit to 50MB for large QC results
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 1. Initialize Kubernetes Client
// Try to load from default kubeconfig (for local development)
// Falls back to cluster config if running inside Kubernetes
const kc = new k8s.KubeConfig();
try {
    // First try loading from default kubeconfig (~/.kube/config)
    kc.loadFromDefault();
    console.log('✅ Loaded Kubernetes config from default kubeconfig');
} catch (err) {
    // If that fails, try in-cluster config (when running inside Kubernetes)
    try {
        kc.loadFromCluster();
        console.log('✅ Loaded Kubernetes config from cluster');
    } catch (clusterErr) {
        console.error('❌ Failed to load Kubernetes config:', clusterErr.message);
        throw new Error('Cannot connect to Kubernetes cluster. Make sure kubectl is configured.');
    }
}
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = process.env.NAMESPACE || 'default';
const MAX_PODS = parseInt(process.env.MAX_PODS || '10');  // Max concurrent QC containers
const WORKER_IMAGE = process.env.WORKER_IMAGE || 'qc-worker:latest';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator-service';
// For pods to reach orchestrator running on host, use host.docker.internal (Docker Desktop) or host IP
const CALLBACK_URL_FOR_PODS = process.env.CALLBACK_URL_FOR_PODS ||
    (ORCHESTRATOR_URL.includes('localhost') ? ORCHESTRATOR_URL.replace('localhost', 'host.docker.internal') : ORCHESTRATOR_URL);
const MONGO_USERNAME = process.env.MONGO_USERNAME || 'CollaboratorDB';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'CollaboratorDB@123';
const MONGO_CLUSTER = process.env.MONGO_CLUSTER || 'collaboratordb.68hkp69.mongodb.net';
// Collaborative Study cluster (app.py) - for GWAS stats → collaborations
const COLLABORATIVE_STUDY_MONGO_URI = process.env.COLLABORATIVE_STUDY_MONGO_URI || '';
const COLLABORATIVE_STUDY_DB = process.env.COLLABORATIVE_STUDY_DB || 'test';

// State Management
const runningContainers = new Map(); // podName -> { userId, username, requestData, startTime, requestId }
const requestQueue = []; // Queue of { userId, username, requestData, requestId }
const completedRequests = new Map(); // requestId -> { status, results, error, completedAt }
const requestStatus = new Map(); // requestId -> { status: 'queued'|'processing'|'completed'|'failed', podName, startTime }

// Helper: Get list of current worker pods
async function getWorkerPods() {
    // append name to the pod 
    try {
        const res = await k8sApi.listNamespacedPod(
            NAMESPACE,
            undefined, undefined, undefined, undefined,
            'type=dynamic-worker'
        );
        return res.body.items;
    } catch (err) {
        console.error("Error listing pods:", err);
        return [];
    }
}

// Helper: Delete a specific pod
async function deletePod(podName) {
    console.log(`[Orchestrator] Deleting pod: ${podName}`);
    try {
        await k8sApi.deleteNamespacedPod(podName, NAMESPACE);
        runningContainers.delete(podName);
        console.log(`[Orchestrator] Pod ${podName} deleted successfully`);
    } catch (err) {
        console.error(`Error deleting pod ${podName}:`, err);
    }
}

// Helper: Start a new QC container for user
async function startQcContainer(userId, username, requestData, requestId) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const podName = `qc-${username}-${timestamp}-${randomId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const requestDataString = JSON.stringify(requestData);

    const podManifest = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
            name: podName,
            labels: {
                'type': 'qc-worker',
                'user-id': userId,
                'username': username,
                'state': 'processing'
            }
        },
        spec: {
            containers: [{
                name: 'qc-worker',
                image: WORKER_IMAGE,
                imagePullPolicy: 'Never',
                env: [
                    { name: 'REQUEST_DATA', value: requestDataString },
                    { name: 'USER_ID', value: userId },
                    { name: 'USERNAME', value: username },
                    { name: 'REQUEST_ID', value: requestId },
                    { name: 'CALLBACK_URL', value: `${CALLBACK_URL_FOR_PODS}/qc-complete` },
                    { name: 'POD_NAME', value: podName },
                    { name: 'MONGO_USERNAME', value: MONGO_USERNAME },
                    { name: 'MONGO_PASSWORD', value: MONGO_PASSWORD },
                    { name: 'MONGO_CLUSTER', value: MONGO_CLUSTER },
                    { name: 'COLLABORATIVE_STUDY_MONGO_URI', value: COLLABORATIVE_STUDY_MONGO_URI },
                    { name: 'COLLABORATIVE_STUDY_DB', value: COLLABORATIVE_STUDY_DB },
                    { name: 'WARM_POD', value: 'false' }
                ],
                resources: {
                    requests: { memory: "512Mi", cpu: "500m" },
                    limits: { memory: "1Gi", cpu: "1000m" }
                }
            }],
            restartPolicy: 'Never'
        }
    };

    try {
        await k8sApi.createNamespacedPod(NAMESPACE, podManifest);
        runningContainers.set(podName, {
            userId,
            username,
            requestData,
            requestId,
            startTime: new Date()
        });

        requestStatus.set(requestId, {
            status: 'processing',
            podName,
            startTime: new Date()
        });

        console.log(`✅ [Orchestrator] Started QC container: ${podName} for user ${username}`);
        console.log(`   Running: ${runningContainers.size}/${MAX_PODS}`);
        return { success: true, podName, requestId };
    } catch (err) {
        console.error("❌ Failed to create pod:", err.body || err);
        return { success: false, error: err.body || err.message };
    }
}

// Helper: Delete pod after processing (always delete, no warm pool)
async function deletePodAfterProcessing(podName) {
        await deletePod(podName);
}

// Process next item in queue if capacity available
async function processQueue() {
    if (requestQueue.length === 0) return;
    if (runningContainers.size >= MAX_PODS) return;

    const request = requestQueue.shift();
    console.log(`📥 [Queue] Processing queued request for user ${request.username}`);
    console.log(`   Queue size: ${requestQueue.length}`);

    // Always create new pod
    const result = await startQcContainer(request.userId, request.username, request.requestData, request.requestId);

    // Continue processing if there's more capacity and more requests
    if (runningContainers.size < MAX_PODS && requestQueue.length > 0) {
        setTimeout(processQueue, 100);
    }
}

// API: Submit GWAS dataset creation request (same pod flow as QC)
app.post('/gwas/process', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const { userId, username, phenotype, collaborationUuid, sampleIds, snpIds } = req.body;

    if (!userId || !username || !phenotype || !collaborationUuid || !sampleIds || !Array.isArray(sampleIds)) {
        return res.status(400).json({
            error: 'userId, username, phenotype, collaborationUuid, and sampleIds (array) are required'
        });
    }

    const requestData = {
        username,
        user_id: userId,
        phenotype,
        method: 'gwas_summary',
        action: 'create_gwas_summary',
        params: {
            sample_ids: sampleIds,
            collaboration_uuid: collaborationUuid,
            snp_ids_to_include: snpIds || null
        }
    };

    const timestamp = Date.now();
    const requestId = `gwas-${userId}-${timestamp}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 New GWAS Summary Request:`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   User: ${username} (${userId})`);
    console.log(`   Phenotype: ${phenotype}`);
    console.log(`   Samples: ${sampleIds.length}`);
    console.log(`${'='.repeat(60)}\n`);

    if (runningContainers.size < MAX_PODS) {
        const result = await startQcContainer(userId, username, requestData, requestId);

        if (result.success) {
            res.json({
                status: 'processing',
                requestId: result.requestId,
                podName: result.podName,
                running: runningContainers.size,
                queued: requestQueue.length,
                message: 'GWAS summary request accepted and processing'
            });
        } else {
            requestQueue.push({ userId, username, requestData, requestId });
            requestStatus.set(requestId, { status: 'queued', startTime: new Date() });
            res.json({
                status: 'queued',
                requestId,
                position: requestQueue.length,
                running: runningContainers.size,
                maxPods: MAX_PODS,
                message: 'Request queued'
            });
        }
    } else {
        requestQueue.push({ userId, username, requestData, requestId });
        requestStatus.set(requestId, { status: 'queued', startTime: new Date() });
        res.json({
            status: 'queued',
            requestId,
            position: requestQueue.length,
            running: runningContainers.size,
            maxPods: MAX_PODS,
            message: 'Request queued'
        });
    }
});

// API: Submit QC request
app.post('/qc/process', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const { userId, username, phenotype, method, action, params } = req.body;

    // 1. Validate required fields
    if (!userId || !username) {
        return res.status(400).json({ error: 'userId and username are required' });
    }

    if (!action) {
        return res.status(400).json({ error: 'action is required (initialize|create|create_chained|create_gwas_summary)' });
    }

    if (action === 'create' && !method) {
        return res.status(400).json({ error: 'method is required for create action' });
    }

    // 2. Prepare request data
    const requestData = {
        username,
        user_id: userId,
        phenotype,
        method,
        action,
        params: params || {}
    };

    // Generate request ID
    const timestamp = Date.now();
    const requestId = `${userId}-${timestamp}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 New QC Request:`);
    console.log(`   Request ID: ${requestId}`);
    console.log(`   User: ${username} (${userId})`);
    console.log(`   Action: ${action}`);
    console.log(`   Phenotype: ${phenotype}`);
    console.log(`   Method: ${method}`);
    console.log(`${'='.repeat(60)}\n`);

    // 3. Check capacity and create pod
    if (runningContainers.size < MAX_PODS) {
        // Always create new pod
        const result = await startQcContainer(userId, username, requestData, requestId);

        if (result.success) {
            // Return immediately with request ID (async mode)
            res.json({
                status: 'processing',
                requestId: result.requestId,
                podName: result.podName,
                running: runningContainers.size,
                queued: requestQueue.length,
                message: 'Request accepted and processing'
            });
        } else {
            // Failed to start, add to queue
            requestQueue.push({ userId, username, requestData, requestId });
            requestStatus.set(requestId, {
                status: 'queued',
                startTime: new Date()
            });
            res.json({
                status: 'queued',
                requestId,
                position: requestQueue.length,
                running: runningContainers.size,
                maxPods: MAX_PODS,
                message: 'Request queued - will process when capacity available'
            });
        }
    } else {
        // Add to queue
        requestQueue.push({ userId, username, requestData, requestId });
        requestStatus.set(requestId, {
            status: 'queued',
            startTime: new Date()
        });
        console.log(`⏳ [Queue] Request queued for ${username} | Queue size: ${requestQueue.length}`);
        res.json({
            status: 'queued',
            requestId,
            position: requestQueue.length,
            running: runningContainers.size,
            maxPods: MAX_PODS,
            message: 'Request queued - will process when capacity available'
        });
    }
});

// API: QC Container signals completion
app.post('/qc-complete', async (req, res) => {
    const { podName, userId, status, results, error } = req.body;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📬 [Callback] QC Container ${podName} completed`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Status: ${status}`);
    console.log(`${'='.repeat(60)}\n`);

    if (!runningContainers.has(podName)) {
        console.log(`⚠️  Pod ${podName} not found in tracking (may have been cleaned up)`);
        return res.status(404).json({ error: 'Container not found in tracking' });
    }

    const containerInfo = runningContainers.get(podName);

    // Verify user matches
    if (containerInfo.userId !== userId) {
        console.log(`❌ User ID mismatch: expected ${containerInfo.userId}, got ${userId}`);
        return res.status(403).json({ error: 'User ID mismatch' });
    }

    // Log completion
    const duration = new Date() - containerInfo.startTime;
    console.log(`✅ [Callback] ${podName} completed in ${(duration / 1000).toFixed(2)}s`);

    // Store results for retrieval
    if (containerInfo.requestId) {
        completedRequests.set(containerInfo.requestId, {
            status,
            results,
            error,
            completedAt: new Date()
        });
        requestStatus.set(containerInfo.requestId, {
            status: status === 'success' ? 'completed' : 'failed',
            podName,
            startTime: containerInfo.startTime,
            completedAt: new Date()
        });
        console.log(`💾 Results stored for request ID: ${containerInfo.requestId}`);
    }

    // Always delete pod after processing
    await deletePodAfterProcessing(podName);

    // Process next in queue
    processQueue();

    res.json({
        status: 'acknowledged',
        message: 'Container terminated, results stored',
        running: runningContainers.size,
        queued: requestQueue.length
    });
});

// API: Get status for a request
app.get('/qc/status/:requestId', (req, res) => {
    const { requestId } = req.params;

    // Check if completed
    if (completedRequests.has(requestId)) {
        const result = completedRequests.get(requestId);
        return res.json({
            requestId,
            status: result.status === 'success' ? 'completed' : 'failed',
            results: result.results,
            error: result.error,
            completedAt: result.completedAt
        });
    }

    // Check if still processing or queued
    if (requestStatus.has(requestId)) {
        const status = requestStatus.get(requestId);
        return res.json({
            requestId,
            status: status.status,
            podName: status.podName,
            startTime: status.startTime
        });
    }

    // Not found
    return res.status(404).json({
        error: 'Request not found',
        requestId
    });
});

// API: Get results for a request (legacy endpoint, redirects to status)
app.get('/qc/results/:requestId', (req, res) => {
    const { requestId } = req.params;

    if (!completedRequests.has(requestId)) {
        return res.status(404).json({
            error: 'Request not found or still processing',
            requestId
        });
    }

    const result = completedRequests.get(requestId);
    res.json({
        requestId,
        status: result.status,
        results: result.results,
        error: result.error,
        completedAt: result.completedAt
    });

    // Clean up after retrieval
    completedRequests.delete(requestId);
    requestStatus.delete(requestId);
});

// API: Get orchestrator status
app.get('/status', async (req, res) => {
    const pods = await getWorkerPods();
    res.json({
        running: runningContainers.size,
        queued: requestQueue.length,
        maxCapacity: MAX_PODS,
        available: MAX_PODS - runningContainers.size,
        completedRequests: completedRequests.size,
        activePods: pods.map(p => ({
            name: p.metadata.name,
            status: p.status.phase,
            created: p.metadata.creationTimestamp,
            user: p.metadata.labels['username'],
            pool: p.metadata.labels['pool'] || 'none',
            state: p.metadata.labels['state'] || 'unknown'
        })),
        queuedRequests: requestQueue.map((r, idx) => ({
            position: idx + 1,
            username: r.username,
            action: r.requestData.action,
            requestId: r.requestId
        }))
    });
});

// API: Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(3000, async () => {
    console.log('='.repeat(50));
    console.log('Orchestrator Server Started');
    console.log('='.repeat(50));
    console.log(`Listening on port 3000`);
    console.log(`Max Containers: ${MAX_PODS}`);
    console.log(`Worker Image: ${WORKER_IMAGE}`);
    console.log(`Callback URL: ${ORCHESTRATOR_URL}`);
    console.log('='.repeat(50));
});
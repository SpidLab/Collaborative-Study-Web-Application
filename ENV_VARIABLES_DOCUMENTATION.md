# Environment Variables Documentation

## 📍 .env File Location

**The `.env` file should be located at:**

```
web_application/Backend/FlaskApp/.env
```

This is the same directory as `app.py`, because `app.py` uses:

```python
load_dotenv(find_dotenv())  # Searches for .env starting from current directory
```

---

## 📋 Complete Environment Variables List

### 🔴 **REQUIRED** - Flask Backend (app.py)

| Variable     | Description                                 | Default             | Example                                                                        |
| ------------ | ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `MONGO_URI`  | MongoDB connection string for main database | **None** (required) | `mongodb+srv://user:pass@cluster.mongodb.net/test?retryWrites=true&w=majority` |
| `PORT`       | Flask server port                           | **None** (required) | `5002`                                                                         |
| `SECRET_KEY` | Flask secret key for sessions/JWT           | **None** (required) | Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`      |

**Location in code:** `app.py` lines 63-65

---

### 🟡 **OPTIONAL** - QC Controller & Orchestrator

| Variable            | Description                                           | Default                 | Used By                            |
| ------------------- | ----------------------------------------------------- | ----------------------- | ---------------------------------- |
| `QC_CONTROLLER_URL` | Direct QC Controller URL (when orchestrator disabled) | `http://localhost:5001` | `app.py`                           |
| `USE_ORCHESTRATOR`  | Enable Kubernetes orchestrator                        | `false`                 | `app.py`                           |
| `ORCHESTRATOR_URL`  | Orchestrator server URL                               | `http://localhost:3000` | `app.py`, `orchestrator_client.py` |

**Location in code:** `app.py` lines 48-50

---

### 🟡 **OPTIONAL** - MongoDB Atlas (QC Operations)

| Variable         | Description               | Default                              | Used By                                         |
| ---------------- | ------------------------- | ------------------------------------ | ----------------------------------------------- |
| `MONGO_USERNAME` | MongoDB Atlas username    | `CollaboratorDB`                     | `qc_controller.py`, `qc_worker.py`, `server.js` |
| `MONGO_PASSWORD` | MongoDB Atlas password    | `CollaboratorDB@123`                 | `qc_controller.py`, `qc_worker.py`, `server.js` |
| `MONGO_CLUSTER`  | MongoDB Atlas cluster URL | `collaboratordb.68hkp69.mongodb.net` | `qc_controller.py`, `qc_worker.py`, `server.js` |

**Location in code:**

- `qc_controller.py` lines 40-42
- `qc_worker.py` lines 17-19
- `server.js` lines 15-17

---

### 🟢 **OPTIONAL** - QC Controller Specific

| Variable            | Description                                | Default                                                                    | Used By            |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | ------------------ |
| `DEFAULT_DATA_FILE` | Default data file path for initialization  | `/app/data/data_party_a.csv` (Docker) or `./data/data_party_a.csv` (local) | `qc_controller.py` |
| `PCA_MODEL_PATH`    | PCA model directory path                   | `models`                                                                   | `qc_controller.py` |
| `PORT`              | QC Controller port (if running separately) | `5001`                                                                     | `qc_controller.py` |
| `DEBUG`             | QC Controller debug mode                   | `false`                                                                    | `qc_controller.py` |

**Location in code:** `qc_controller.py` lines 50, 53, 666-667

---

### 🔵 **AUTOMATIC** - Orchestrator Server (Node.js)

| Variable       | Description             | Default            | Used By     |
| -------------- | ----------------------- | ------------------ | ----------- |
| `NAMESPACE`    | Kubernetes namespace    | `default`          | `server.js` |
| `MAX_PODS`     | Maximum concurrent pods | `10`               | `server.js` |
| `WORKER_IMAGE` | QC worker Docker image  | `qc-worker:latest` | `server.js` |

**Location in code:** `server.js` lines 11-13

**Note:** These are typically set in Kubernetes ConfigMaps/Secrets, not .env file.

---

### 🔵 **AUTOMATIC** - QC Worker Pods

| Variable       | Description               | Set By       | Used By        |
| -------------- | ------------------------- | ------------ | -------------- |
| `CALLBACK_URL` | Orchestrator callback URL | Orchestrator | `qc_worker.py` |
| `POD_NAME`     | Kubernetes pod name       | Kubernetes   | `qc_worker.py` |
| `USER_ID`      | User ID for request       | Orchestrator | `qc_worker.py` |
| `REQUEST_DATA` | JSON request data         | Orchestrator | `qc_worker.py` |

**Location in code:** `qc_worker.py` lines 192-194

**Note:** These are automatically set by the orchestrator when creating pods. **Do not set manually.**

---

## 🚀 Quick Setup

### 1. Create .env file:

```bash
cd web_application/Backend/FlaskApp
cp .env.example .env
```

### 2. Edit .env file with your values:

```bash
# Required
MONGO_URI=your-mongodb-connection-string
PORT=5002
SECRET_KEY=your-generated-secret-key

# Optional (for orchestrator)
USE_ORCHESTRATOR=false
ORCHESTRATOR_URL=http://localhost:3000
```

### 3. Generate SECRET_KEY:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 📁 File Structure

```
web_application/Backend/FlaskApp/
├── .env                    # ← Your .env file here (same level as app.py)
├── .env.example            # ← Template (safe to commit)
├── app.py                  # ← Uses load_dotenv(find_dotenv())
├── orchestrator_client.py
├── Collaborator_Server/
│   ├── qc_controller.py    # Uses os.environ.get() (reads from system/env)
│   └── ...
└── ORCHISTRATION SERVER/
    ├── server.js           # Uses process.env (reads from system/env)
    └── qc_worker.py       # Uses os.environ.get() (reads from system/env)
```

---

## 🔍 How Environment Variables Are Loaded

### Flask Backend (app.py):

```python
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())  # Searches for .env from current dir up

# Then uses:
MONGO_URI = os.getenv("MONGO_URI")
PORT = os.getenv("PORT")
SECRET_KEY = os.getenv('SECRET_KEY')
```

### QC Controller (qc_controller.py):

```python
# Uses os.environ.get() - reads from system environment
# If running locally, reads from .env if exported
# If running in Docker, reads from Docker environment
MONGO_USERNAME = os.environ.get('MONGO_USERNAME', 'CollaboratorDB')
```

### Orchestrator Server (server.js):

```javascript
// Uses process.env - reads from system environment
// Set via: export VAR=value or .env file (if using dotenv package)
const NAMESPACE = process.env.NAMESPACE || "default";
```

---

## 🐳 Docker/Kubernetes Notes

### For Docker:

- Set environment variables in `docker-compose.yml` or `Dockerfile` ENV directives
- Or pass via `docker run -e VAR=value`

### For Kubernetes:

- Use **ConfigMaps** for non-sensitive data
- Use **Secrets** for sensitive data (passwords, keys)
- Set in pod/deployment manifests

**Example Kubernetes Secret:**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mongo-credentials
type: Opaque
stringData:
  MONGO_USERNAME: CollaboratorDB
  MONGO_PASSWORD: CollaboratorDB@123
  MONGO_CLUSTER: collaboratordb.68hkp69.mongodb.net
```

---

## ✅ Minimum Required .env File

For basic operation (without orchestrator):

```bash
# .env file at: web_application/Backend/FlaskApp/.env

MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/test?retryWrites=true&w=majority
PORT=5002
SECRET_KEY=your-secret-key-here
```

For orchestrator-enabled operation:

```bash
# .env file at: web_application/Backend/FlaskApp/.env

MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/test?retryWrites=true&w=majority
PORT=5002
SECRET_KEY=your-secret-key-here

# Orchestrator settings
USE_ORCHESTRATOR=true
ORCHESTRATOR_URL=http://localhost:3000

# MongoDB Atlas (for QC operations)
MONGO_USERNAME=CollaboratorDB
MONGO_PASSWORD=CollaboratorDB@123
MONGO_CLUSTER=collaboratordb.68hkp69.mongodb.net
```

---

## 🔒 Security Best Practices

1. ✅ **Never commit .env to git** (already in .gitignore)
2. ✅ **Use .env.example** for documentation (safe to commit)
3. ✅ **Generate strong SECRET_KEY** (use secrets.token_hex(32))
4. ✅ **Use Kubernetes Secrets** in production (not .env files)
5. ✅ **Rotate credentials** regularly
6. ✅ **Use different credentials** for dev/staging/production

---

## 🧪 Testing Environment Variables

### Check if variables are loaded:

```python
# In Python (app.py)
import os
print("MONGO_URI:", os.getenv("MONGO_URI"))
print("PORT:", os.getenv("PORT"))
print("USE_ORCHESTRATOR:", os.getenv("USE_ORCHESTRATOR"))
```

### Check in Node.js (orchestrator):

```javascript
console.log("NAMESPACE:", process.env.NAMESPACE);
console.log("MAX_PODS:", process.env.MAX_PODS);
```

---

## 📝 Summary

- **Location**: `web_application/Backend/FlaskApp/.env` (same directory as `app.py`)
- **Required**: `MONGO_URI`, `PORT`, `SECRET_KEY`
- **Optional**: `USE_ORCHESTRATOR`, `ORCHESTRATOR_URL`, `QC_CONTROLLER_URL`
- **Template**: Use `.env.example` as starting point
- **Security**: Never commit `.env`, use Kubernetes Secrets in production

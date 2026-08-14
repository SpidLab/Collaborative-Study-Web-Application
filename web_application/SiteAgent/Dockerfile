# Build context = this SiteAgent/ directory.
#   docker build -t collabstudy-agent web_application/SiteAgent
FROM python:3.10-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    CONFIG_DIR=/config \
    MODELS_DIR=/app/models \
    OWNED_MODELS_DIR=/models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py jobs_client.py data_loader.py actions.py agent.py fl_local.py ./
COPY qc_modules/ ./qc_modules/
COPY models/ ./models/

# /data  = your raw CSVs, mounted read-only at runtime (-v /local/data:/data:ro)
# /config = small persistent store for the saved token (a named docker volume)
# /models = models THIS site owns. These must survive the container being
#   recreated: after federated training the server deletes its copy, so this
#   volume can hold the only remaining copy of a model you own.
VOLUME ["/data", "/config", "/models"]

CMD ["python", "agent.py"]

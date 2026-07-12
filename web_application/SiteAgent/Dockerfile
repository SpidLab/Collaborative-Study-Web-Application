# Build context = this SiteAgent/ directory.
#   docker build -t collabstudy-agent web_application/SiteAgent
FROM python:3.10-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    CONFIG_DIR=/config \
    MODELS_DIR=/app/models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py jobs_client.py data_loader.py actions.py agent.py ./
COPY qc_modules/ ./qc_modules/
COPY models/ ./models/

# /data  = your raw CSVs, mounted read-only at runtime (-v /local/data:/data:ro)
# /config = small persistent store for the saved token (a named docker volume)
VOLUME ["/data", "/config"]

CMD ["python", "agent.py"]

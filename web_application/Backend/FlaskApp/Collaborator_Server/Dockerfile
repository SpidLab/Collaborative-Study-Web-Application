# QC Controller Docker Image
# Using official Python image which already has SSL certificates
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install only essential build dependencies (SSL certs already in base image)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create directories
RUN mkdir -p /app/data /app/models

# Copy application code
COPY . .

# Data and models are already copied with COPY . .
# They will be accessible at /app/data/ and /app/models/
# Volume mounts in docker-compose.yml will override these for development

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=5001
ENV MONGO_USERNAME=CollaboratorDB
ENV MONGO_PASSWORD=CollaboratorDB@123
ENV MONGO_CLUSTER=collaboratordb.68hkp69.mongodb.net
ENV DEFAULT_DATA_FILE=/app/data/data_party_a_small.csv
ENV PCA_MODEL_PATH=/app/models

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:5001/health')" || exit 1

# Run the application
CMD ["python", "qc_controller.py"]


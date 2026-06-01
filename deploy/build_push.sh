#!/usr/bin/env bash
# Build and push the central API image to ECR.
# Usage: AWS_REGION=us-east-1 ECR_REPO_URL=<acct>.dkr.ecr.us-east-1.amazonaws.com/collabstudy-api ./build_push.sh [tag]
set -euo pipefail

TAG="${1:-latest}"
: "${AWS_REGION:?set AWS_REGION}"
: "${ECR_REPO_URL:?set ECR_REPO_URL (terraform output ecr_repository_url)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_CTX="$REPO_ROOT/web_application/Backend/FlaskApp"
REGISTRY="${ECR_REPO_URL%%/*}"

echo "Logging in to ECR ($REGISTRY)..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "Building API image for linux/arm64 (matches t4g instance)..."
docker buildx build --platform linux/arm64 \
  -f "$REPO_ROOT/deploy/Dockerfile.api" \
  -t "$ECR_REPO_URL:$TAG" \
  "$API_CTX" --push

echo "Pushed $ECR_REPO_URL:$TAG"
echo "On the host (or via 'terraform apply' user_data) run: docker compose pull && docker compose up -d"

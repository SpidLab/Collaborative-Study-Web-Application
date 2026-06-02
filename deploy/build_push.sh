#!/usr/bin/env bash
# Manually build & push BOTH images to ECR (the GitHub Actions pipeline does this
# automatically on push to the `pilot` branch — use this only for local/manual deploys).
#
# Usage:
#   AWS_REGION=us-east-2 \
#   ECR_API=<acct>.dkr.ecr.us-east-2.amazonaws.com/collabstudy-api \
#   ECR_WEB=<acct>.dkr.ecr.us-east-2.amazonaws.com/collabstudy-web \
#   VITE_API_URL=https://collab.example.org \
#   ./build_push.sh [tag]
set -euo pipefail

TAG="${1:-latest}"
: "${AWS_REGION:?set AWS_REGION}"
: "${ECR_API:?set ECR_API (terraform output ecr_api_repository_url)}"
: "${ECR_WEB:?set ECR_WEB (terraform output ecr_web_repository_url)}"
: "${VITE_API_URL:?set VITE_API_URL (the public site URL)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${ECR_API%%/*}"

echo "Logging in to ECR ($REGISTRY)..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

echo "Building API image (linux/arm64)..."
docker buildx build --platform linux/arm64 \
  -f "$REPO_ROOT/deploy/Dockerfile.api" \
  -t "$ECR_API:$TAG" \
  "$REPO_ROOT/web_application/Backend/FlaskApp" --push

echo "Building web image (frontend + Caddy, linux/arm64)..."
docker buildx build --platform linux/arm64 \
  -f "$REPO_ROOT/deploy/Dockerfile.web" \
  --build-arg "VITE_API_URL=$VITE_API_URL" \
  -t "$ECR_WEB:$TAG" \
  "$REPO_ROOT" --push

echo "Pushed $ECR_API:$TAG and $ECR_WEB:$TAG"
echo "On the host: cd /opt/collabstudy && docker compose pull && docker compose up -d"

# Deploying the collaboration server (cost-effective AWS)

Deploys **only the central server**. Collaborators run the Site Agent on their own
machines (see `web_application/SiteAgent`) — nothing local is deployed to AWS.

## What gets created

- One **EC2 `t4g.small`** (ARM) running Docker Compose: the Flask **API** + **Caddy**
  (serves the React build, proxies `/api`, automatic Let's Encrypt HTTPS — no ALB).
- An **Elastic IP** + **Route 53 A record** → a **constant URL** that never changes
  across instance replacements.
- An **ECR** repo for the API image.
- **SSM Parameter Store** SecureStrings for `MONGO_URI`, `SECRET_KEY`, `OPENAI_API_KEY`.

MongoDB is **Atlas** (external; the free M0 tier is fine for the pilot) — its
connection string goes in `MONGO_URI`. Estimated cost ≈ **$15–20/mo**.

## Prerequisites

- An AWS account + `aws` CLI configured; `terraform` and `docker buildx`.
- A registered domain with a **Route 53 hosted zone** (you supply its zone ID).
- A MongoDB Atlas cluster + connection string.

## Steps

```bash
cd deploy/terraform

terraform init
terraform apply \
  -var="domain_name=collab.example.org" \
  -var="route53_zone_id=Z0123456789ABC" \
  -var="mongo_uri=mongodb+srv://user:pass@cluster/db" \
  -var="secret_key=$(openssl rand -hex 32)" \
  -var="ssh_cidr=$(curl -s ifconfig.me)/32"

# Build + push the API image to the ECR repo from the output:
cd ..
AWS_REGION=us-east-1 ECR_REPO_URL=$(terraform -chdir=terraform output -raw ecr_repository_url) \
  ./build_push.sh latest

# Build the frontend pointing at the constant URL and upload it to the host's
# Caddy web root (/opt/collabstudy/site):
cd ../web_application/Frontend
VITE_API_URL=https://collab.example.org npm run build
# then copy dist/* to the instance's /opt/collabstudy/site (scp or SSM), e.g.:
#   scp -r dist/* ec2-user@collab.example.org:/opt/collabstudy/site/
```

The instance pulls the image and starts containers on boot via `user_data`. After
pushing a new image: on the host run `docker compose pull && docker compose up -d`.

## Validate without provisioning

```bash
cd deploy/terraform
terraform init -backend=false
terraform validate
```

> `terraform apply` provisions real, billable AWS resources. Review the plan first.

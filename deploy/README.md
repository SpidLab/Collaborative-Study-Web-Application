# Deploying the collaboration server (cost-effective AWS + GitHub CI/CD)

Deploys **only the central server** (API + web). Collaborators run the Site Agent on
their own machines — nothing local is deployed to AWS.

## Architecture
- One small **EC2 `t4g.small`** running Docker Compose with two images pulled from ECR:
  - **api** — Flask backend (gunicorn, threaded for the agent long-polls).
  - **web** — Caddy + the baked-in React build; serves the site and proxies `/api`,
    with automatic Let's Encrypt **HTTPS** (no ALB).
- **Elastic IP + Route 53** A record → a **constant URL** that never changes.
- **SSM Parameter Store** for secrets; **MongoDB Atlas** external (free M0 is fine).
- **GitHub Actions** builds + pushes both images and triggers a pull/restart via SSM.
- Est. cost ≈ **$15–20/mo**.

## One-time setup

### 1. Provision infrastructure
```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # set mongo_uri + secret_key (region defaults to us-east-2)
terraform init
terraform apply
```
This creates: EC2 + a constant **Elastic IP**, two ECR repos, SSM secrets, the
instance role, and a CI IAM user for GitHub Actions. No domain or Route 53 needed —
the server is reachable at a constant **`https://<elastic-ip>.sslip.io`** (Caddy gets
a real Let's Encrypt cert for that name). The instance shows a "provisioning"
placeholder until the first image push.

Grab the outputs:
```bash
terraform output            # url, public_ip, instance_id, ecr_*_repository_url, ci_access_key_id
terraform output -raw ci_secret_access_key   # the CI secret (sensitive)
```

### 2. Configure the GitHub repo
In **Settings → Secrets and variables → Actions**:

**Secrets**
- `AWS_ACCESS_KEY_ID` = `ci_access_key_id`
- `AWS_SECRET_ACCESS_KEY` = `ci_secret_access_key`

**Variables**
- `AWS_REGION` = e.g. `us-east-2`
- `ECR_API_REPOSITORY_URL` = `ecr_api_repository_url`
- `ECR_WEB_REPOSITORY_URL` = `ecr_web_repository_url`
- `VITE_API_URL` = the `url` output, e.g. `https://3-21-0-0.sslip.io`
- `DEPLOY_INSTANCE_ID` = `instance_id`

### 3. HTTPS
Nothing to configure — `sslip.io` resolves `<elastic-ip>.sslip.io` to your Elastic
IP automatically, and Caddy fetches the Let's Encrypt cert on first start (give it a
minute). The agents' `SERVER_URL` is this same `url`.

## Deploying (ongoing)
Push to the **`pilot_deployment`** branch (or run the workflow manually):
```bash
git checkout pilot_deployment   # the deployment branch
git push origin pilot_deployment
```
GitHub Actions (`.github/workflows/deploy-pilot.yml`) then:
1. builds + pushes the `api` and `web` images (arm64) to ECR, and
2. tells the instance (via SSM) to `docker compose pull && up -d`.

No SSH, no manual file copy. First deploy replaces the placeholder page with the app.

### Manual deploy (without CI)
```bash
cd deploy
AWS_REGION=us-east-2 \
ECR_API=$(terraform -chdir=terraform output -raw ecr_api_repository_url) \
ECR_WEB=$(terraform -chdir=terraform output -raw ecr_web_repository_url) \
VITE_API_URL=$(terraform -chdir=terraform output -raw url) \
./build_push.sh latest
# then, on the host: cd /opt/collabstudy && docker compose pull && docker compose up -d
```

## Validate Terraform without provisioning
```bash
cd deploy/terraform
terraform init -backend=false
terraform validate
```

> `terraform apply` creates real, billable AWS resources — review the plan first.
> Keep Terraform state private (it holds the CI access key); an encrypted S3 backend
> is recommended. For a hardened setup, swap the CI IAM user for GitHub OIDC.

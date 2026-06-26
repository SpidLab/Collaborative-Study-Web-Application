variable "region" {
  type    = string
  default = "us-east-2"
}

variable "project" {
  type    = string
  default = "collabstudy"
}

variable "environment" {
  type    = string
  default = "pilot"
}

variable "instance_type" {
  type        = string
  default     = "t4g.small" # ARM, cost-effective; matches arm64 image build
  description = "EC2 instance type for the single-host central server."
}

variable "ssh_cidr" {
  type        = string
  description = "CIDR allowed to SSH (port 22). Use your IP/32; set to empty to disable SSH."
  default     = ""
}

variable "key_name" {
  type        = string
  description = "Existing EC2 key pair name for SSH (optional)."
  default     = ""
}

# Secrets stored in SSM Parameter Store (SecureString) and injected at boot.
variable "mongo_uri" {
  type        = string
  sensitive   = true
  description = "MongoDB Atlas connection string (external managed cluster)."
}

variable "secret_key" {
  type        = string
  sensitive   = true
  description = "Flask SECRET_KEY / JWT + agent token signing key."
}

variable "openai_api_key" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Optional: enables the GWAS AI summary."
}

variable "smtp_user" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Gmail account used to send notification emails (SMTP login). Empty = email disabled."
}

variable "smtp_pass" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Gmail App Password for smtp_user (NOT the account password). Empty = email disabled."
}

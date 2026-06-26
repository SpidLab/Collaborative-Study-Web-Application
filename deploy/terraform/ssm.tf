# Secrets live in SSM Parameter Store (SecureString) — cheaper than Secrets Manager
# and read by the instance at boot.
resource "aws_ssm_parameter" "mongo_uri" {
  name  = "/${local.name}/MONGO_URI"
  type  = "SecureString"
  value = var.mongo_uri
  tags  = local.tags
}

resource "aws_ssm_parameter" "secret_key" {
  name  = "/${local.name}/SECRET_KEY"
  type  = "SecureString"
  value = var.secret_key
  tags  = local.tags
}

resource "aws_ssm_parameter" "openai_api_key" {
  name  = "/${local.name}/OPENAI_API_KEY"
  type  = "SecureString"
  value = var.openai_api_key == "" ? "unset" : var.openai_api_key
  tags  = local.tags
}

resource "aws_ssm_parameter" "smtp_user" {
  name  = "/${local.name}/SMTP_USER"
  type  = "SecureString"
  value = var.smtp_user == "" ? "unset" : var.smtp_user
  tags  = local.tags
}

resource "aws_ssm_parameter" "smtp_pass" {
  name  = "/${local.name}/SMTP_PASS"
  type  = "SecureString"
  value = var.smtp_pass == "" ? "unset" : var.smtp_pass
  tags  = local.tags
}

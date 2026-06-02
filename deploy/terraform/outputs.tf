output "url" {
  value       = "https://${aws_eip.server.public_ip}.sslip.io"
  description = "Constant HTTPS URL of the collaboration server (sslip.io over the Elastic IP). Use this as VITE_API_URL and the agents' SERVER_URL."
}

output "public_ip" {
  value       = aws_eip.server.public_ip
  description = "Elastic IP — constant; never changes across instance replacements."
}

output "ecr_api_repository_url" {
  value       = aws_ecr_repository.api.repository_url
  description = "Push the API image here."
}

output "ecr_web_repository_url" {
  value       = aws_ecr_repository.web.repository_url
  description = "Push the web (frontend + Caddy) image here."
}

output "instance_id" {
  value       = aws_instance.server.id
  description = "EC2 instance id (CI/CD targets it by tag Name = project-environment)."
}

output "ci_access_key_id" {
  value       = aws_iam_access_key.ci.id
  description = "GitHub Actions AWS access key id (store as repo secret AWS_ACCESS_KEY_ID)."
}

output "ci_secret_access_key" {
  value       = aws_iam_access_key.ci.secret
  sensitive   = true
  description = "GitHub Actions AWS secret (terraform output -raw ci_secret_access_key). Store as AWS_SECRET_ACCESS_KEY."
}

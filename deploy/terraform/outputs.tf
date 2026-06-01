output "url" {
  value       = "https://${var.domain_name}"
  description = "Constant URL of the collaboration server."
}

output "public_ip" {
  value       = aws_eip.server.public_ip
  description = "Elastic IP (stable across instance replacements)."
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.api.repository_url
  description = "Push the API image here (see deploy/build_push.sh)."
}

output "instance_id" {
  value = aws_instance.server.id
}

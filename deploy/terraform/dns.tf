# Constant URL: the domain points at the Elastic IP and never changes across
# instance replacements.
resource "aws_route53_record" "server" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}

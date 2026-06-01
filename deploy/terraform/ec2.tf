# Latest Amazon Linux 2023 ARM64 AMI
data "aws_ami" "al2023_arm" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-arm64"]
  }
  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

locals {
  api_image = "${aws_ecr_repository.api.repository_url}:latest"

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region          = var.region
    registry        = split("/", aws_ecr_repository.api.repository_url)[0]
    api_image       = local.api_image
    domain          = var.domain_name
    mongo_uri_param = aws_ssm_parameter.mongo_uri.name
    secret_key_param = aws_ssm_parameter.secret_key.name
    openai_param    = aws_ssm_parameter.openai_api_key.name
    caddyfile       = file("${path.module}/../Caddyfile")
    compose         = file("${path.module}/../docker-compose.yml")
  })
}

resource "aws_instance" "server" {
  ami                    = data.aws_ami.al2023_arm.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  key_name               = var.key_name == "" ? null : var.key_name
  user_data              = local.user_data

  user_data_replace_on_change = true

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = merge(local.tags, { Name = local.name })
}

resource "aws_eip" "server" {
  domain   = "vpc"
  instance = aws_instance.server.id
  tags     = merge(local.tags, { Name = local.name })
}

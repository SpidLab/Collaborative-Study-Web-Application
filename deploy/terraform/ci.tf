# Dedicated IAM user for GitHub Actions CI/CD: push images to ECR and tell the
# instance to pull + restart (via SSM Run Command). Least-privilege.
#
# NOTE: this creates a long-lived access key stored in Terraform state. Keep state
# private (e.g. an encrypted S3 backend). For a hardened setup, switch to GitHub
# OIDC + an IAM role instead of static keys.

resource "aws_iam_user" "ci" {
  name = "${local.name}-ci"
  tags = local.tags
}

resource "aws_iam_access_key" "ci" {
  user = aws_iam_user.ci.name
}

data "aws_iam_policy_document" "ci" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [aws_ecr_repository.api.arn, aws_ecr_repository.web.arn]
  }

  statement {
    sid       = "SsmDeploy"
    actions   = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.region}:*:instance/${aws_instance.server.id}",
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid       = "SsmTrackCommand"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "ci" {
  name   = "${local.name}-ci"
  user   = aws_iam_user.ci.name
  policy = data.aws_iam_policy_document.ci.json
}

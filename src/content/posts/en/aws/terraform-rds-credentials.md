---
title: Terraform RDS Credentials Management
description: Managing RDS credentials securely using variables instead of hardcoding.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - aws
  - terraform
  - rds
  - security
  - work
category: aws
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html
    title: Password management with Amazon RDS and AWS Secrets Manager
    type: official
source_content_hash: 4eb3bcd5d3ac64a954c14f427420dbbf47aeb372113fa67fe5648097249dd5ad
---

I once ran `git log -p` on a Terraform repo and found a database password in plaintext inside a `main.tf` file from six months ago. The password had been removed in a later commit, but Git never forgets. That password was in the repository history forever, accessible to anyone with read access. The developer who wrote it had moved on, the password was still active in production, and rotating it meant coordinating downtime across three services.

This is what happens when you hardcode credentials in Terraform. The fix is not complicated -- Terraform has several built-in mechanisms for handling sensitive values -- but you need to pick the right one for your situation.

---

## The Four Methods

There are four ways to pass RDS credentials to Terraform without hardcoding them. Each suits a different workflow.

### Method 1: Environment Variables (Best for CI/CD)

Terraform automatically reads any environment variable prefixed with `TF_VAR_` and maps it to the corresponding Terraform variable. Set the variables in your shell or CI/CD pipeline before running Terraform commands.

```bash
export TF_VAR_rds_master_username="postgres"
export TF_VAR_rds_master_password="your-password"

terraform plan
terraform apply
```

This is the recommended approach for CI/CD pipelines. GitHub Actions, GitLab CI, and AWS CodeBuild all support injecting secrets as environment variables. The credentials never touch disk, never appear in Terraform files, and are scoped to the execution environment.

The naming convention is strict: `TF_VAR_` prefix followed by the exact variable name from your `variables.tf`. For a variable named `rds_master_password`, the environment variable must be `TF_VAR_rds_master_password` -- case-sensitive.

### Method 2: terraform.tfvars (Best for Local Development)

Create a `terraform.tfvars` file alongside your `.tf` files. Terraform loads this file automatically during `plan` and `apply`.

```hcl
rds_master_username = "postgres"
rds_master_password = "your-password"
```

This is convenient for local development because you set it once and forget it. But the file contains secrets in plaintext, so it must be in `.gitignore`. Every developer on the team needs their own copy, distributed through a secure channel (password manager, encrypted Slack message, etc.).

The file is auto-loaded only if it is named exactly `terraform.tfvars` or `terraform.tfvars.json`. For any other name, you need the explicit flag:

```bash
terraform apply -var-file="prod.tfvars"
```

### Method 3: Command Line Variables (Best for One-Off Runs)

Pass variables directly on the command line:

```bash
terraform apply \
  -var="rds_master_username=postgres" \
  -var="rds_master_password=your-password"
```

This works for quick, one-off operations but has a significant drawback: the values appear in your shell history. On a shared server or a CI runner that logs commands, this is a security risk. Use this method only on your personal machine for ephemeral operations, and clear your shell history afterward.

### Method 4: AWS Secrets Manager (Best for Production)

For production environments, the gold standard is storing credentials in AWS Secrets Manager and having Terraform read them at plan/apply time.

```hcl
data "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = "my-app/prod"
}

locals {
  rds_creds = jsondecode(data.aws_secretsmanager_secret_version.rds_credentials.secret_string)
}

# Usage:
# master_username = local.rds_creds.DB_USERNAME
# master_password = local.rds_creds.DB_PASSWORD
```

This approach keeps credentials entirely outside Terraform's configuration and state files. The secret is managed in AWS, which provides encryption at rest, access logging via CloudTrail, and automatic rotation if you configure it. Terraform reads the secret value at runtime through a `data` block, so the credentials never need to exist as environment variables or files on the machine running Terraform.

The trade-off is added complexity. Someone needs to create and manage the secret in AWS Secrets Manager before Terraform can reference it. This creates a chicken-and-egg problem for initial setup: you need the secret to exist before Terraform can use it, but you might want Terraform to manage everything. The common solution is to create the initial secret manually or with a separate bootstrap Terraform configuration.

Here is how the four methods compare:

| Method              | Security   | Convenience | Best For        |
| ------------------- | ---------- | ----------- | --------------- |
| Environment vars    | Good       | Medium      | CI/CD pipelines |
| terraform.tfvars    | Medium     | High        | Local dev       |
| Command line        | Low        | Low         | One-off runs    |
| AWS Secrets Manager | Excellent  | Low         | Production      |

---

## Variable Configuration

Regardless of which method you use to supply the values, you need corresponding variable declarations in `variables.tf`. The `sensitive = true` flag is critical -- it tells Terraform to redact the value from all output, including plan diffs and log files.

```hcl
# variables.tf
variable "rds_master_username" {
  description = "RDS master username"
  type        = string
  sensitive   = true
}

variable "rds_master_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}
```

Without `sensitive = true`, running `terraform plan` would print the password in the terminal output. With it, you see:

```bash
# Verify plan (password shows as "sensitive value")
export TF_VAR_rds_master_password="test"
terraform plan

# Output shows:
# ~ master_password = (sensitive value)
```

This redaction happens everywhere Terraform displays values: in plan output, in `terraform show`, and in state file representations shown to the user. Note that the value is still stored in the state file itself -- `sensitive = true` controls display, not storage. If you need the state file to be encrypted, use a remote backend with encryption (S3 with SSE, Terraform Cloud, etc.).

---

## Security Best Practices

Five rules for keeping RDS credentials out of trouble:

1. **Never commit credentials** to the repository. Not in `.tf` files, not in `.tfvars`, not in comments, not in example files. Once a secret enters Git history, consider it compromised.

2. **Use environment variables** in CI/CD pipelines. They are the cleanest injection method -- no files to manage, no command-line arguments to leak into logs.

3. **Mark variables as sensitive** with `sensitive = true` in every variable that holds a credential. This is a one-line change that prevents accidental exposure in terminal output.

4. **Add terraform.tfvars to .gitignore** before creating the file. Adding it after means the file already exists in Git history even if you remove it later.

5. **Use AWS Secrets Manager for production.** Environment variables are fine for CI/CD, but Secrets Manager adds encryption, access logging, and rotation capabilities that environment variables cannot provide.

---

## Practical Takeaway

The right method depends on where Terraform runs. For local development, a `.tfvars` file in `.gitignore` is the path of least resistance. For CI/CD, environment variables keep secrets out of files entirely. For production, AWS Secrets Manager provides the strongest guarantees.

Whatever method you choose, the `sensitive = true` flag on your variable declarations is non-negotiable. It costs nothing and prevents the most common credential leak vector: someone running `terraform plan` in a shared terminal or CI log and the password appearing in plaintext.

Start with environment variables. Graduate to Secrets Manager when your team or compliance requirements demand it. And if you find hardcoded credentials in an existing Terraform repo, rotate them immediately -- removing them from the current code does not remove them from Git history.

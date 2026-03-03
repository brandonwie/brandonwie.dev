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
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html
    title: Password management with Amazon RDS and AWS Secrets Manager
    type: official
---

## Methods

### Method 1: Environment Variables (Recommended for CI/CD)

```bash
export TF_VAR_rds_master_username="postgres"
export TF_VAR_rds_master_password="your-password"

terraform plan
terraform apply
```

### Method 2: terraform.tfvars (Local Development)

Create `terraform.tfvars` (add to .gitignore):

```hcl
rds_master_username = "postgres"
rds_master_password = "your-password"
```

### Method 3: Command Line Variables

```bash
terraform apply \
  -var="rds_master_username=postgres" \
  -var="rds_master_password=your-password"
```

### Method 4: AWS Secrets Manager

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

## Variable Configuration

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

## Security Best Practices

1. **Never commit credentials** to repository
2. **Use environment variables** in CI/CD pipelines
3. **Mark variables as sensitive** (`sensitive = true`)
4. **terraform.tfvars** should be in .gitignore
5. **Consider AWS Secrets Manager** for production

## Testing

```bash
# Verify plan (password shows as "sensitive value")
export TF_VAR_rds_master_password="test"
terraform plan

# Output shows:
# ~ master_password = (sensitive value)
```

---
title: Terraform Fundamentals
description: Core Terraform concepts for AWS infrastructure management.
date: 2025-04-29T00:00:00.000Z
updated: 2026-02-24T00:00:00.000Z
tags:
  - aws
  - terraform
  - infrastructure-as-code
category: aws
draft: false
lang: en
references:
  - url: 'https://developer.hashicorp.com/terraform/intro'
    title: What is Terraform
    type: official
source_content_hash: f6b78fc490cd6fb3273ddea4a90cb61e88221aa72eb351cd6ffe70a3bc83a551
---

## Key Terraform Files

### .terraform.lock.hcl

Dependency lock file for provider versions:

- **Created by**: `terraform init`
- **Purpose**: Ensures consistent provider versions across team
- **Contains**: Provider versions, hash values for integrity
- **Git**: Should be committed

```hcl
# This file is maintained automatically by "terraform init".
# Manual edits may be lost in future updates.

provider "registry.terraform.io/hashicorp/aws" {
  version     = "5.84.0"
  constraints = "~> 5.0"
  hashes = [
    "h1:aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789...",
    "zh:0123456789abcdef0123456789abcdef...",
  ]
}
```

The `hashes` array contains integrity checksums for the provider binary. When
another team member runs `terraform init`, Terraform verifies the downloaded
provider matches these hashes, preventing supply-chain tampering. The
`constraints` field records what version constraint (from `required_providers`)
produced this locked version.

### .tfvars Files

Variable values for environment-specific configuration:

- **Purpose**: Separate configuration from code
- **Usage**: `terraform apply -var-file="prod.tfvars"`
- **Contains**: Sensitive info (passwords, keys, environment settings)
- **Git**: Should be in `.gitignore`

```hcl
# prod.tfvars
db_username = "admin"
db_password = "secretpassword"
environment = "production"
```

### terraform.tfstate

State file tracking managed infrastructure:

- **Purpose**: Maps Terraform config to real AWS resources
- **Contains**: Resource IDs, attributes, metadata, dependencies
- **Critical**: Required for Terraform to track and modify infrastructure
- **Git**: Should be in `.gitignore` (use remote state in production)

```json
{
  "version": 4,
  "resources": [
    {
      "type": "aws_instance",
      "name": "web",
      "instances": [{ "id": "i-1234567890abcdef0" }]
    }
  ]
}
```

### terraform.tfstate.backup

Terraform automatically creates a `.tfstate.backup` file before updating the
state. This is a copy of the **previous** state, providing a local safety net:

- **Created**: Automatically before every `terraform apply` that modifies state
- **Contains**: The exact state from before the current operation
- **Recovery**: If `terraform.tfstate` is corrupted, rename `.backup` to
  `.tfstate` to restore the previous known-good state
- **Git**: Should be in `.gitignore` (same as `.tfstate`)
- **Remote state**: When using S3 backend with versioning, the backup file is
  less critical because S3 versioning provides the same rollback capability

**Note:** This is a local-only safety mechanism. For team environments, remote
state (S3 + DynamoDB locking) is the proper solution for state management and
recovery.

---

## Resource vs Data Source

### resource Block

Creates and manages AWS resources:

```hcl
# Terraform CREATES this subnet
resource "aws_subnet" "main" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}
```

- Creates resource if it doesn't exist
- Updates resource if configuration changes
- Deletes resource on `terraform destroy`
- Terraform owns and manages lifecycle

### data Block

Reads existing resources (read-only):

```hcl
# Terraform READS this existing subnet
data "aws_subnet" "existing" {
  id = "subnet-1234abcd"
}

# Use the data
output "subnet_cidr" {
  value = data.aws_subnet.existing.cidr_block
}
```

- Never creates or modifies resources
- Useful for referencing resources created outside Terraform
- Cross-account resource references
- Querying AWS for existing infrastructure

**Summary**: `resource` = "create this", `data` = "find this existing thing"

---

## depends_on Attribute

Explicit dependency declaration:

```hcl
resource "aws_eip" "nat" {
  domain = "vpc"
  # Wait for IGW before creating EIP
  depends_on = [aws_internet_gateway.main]
}
```

**When to use:**

- When Terraform can't infer the dependency
- Network resources that must exist before others
- API ordering requirements

**Note**: `depends_on` takes a list, even for single dependencies.

---

## domain = "vpc" (EIP)

Historical setting for VPC vs EC2-Classic:

```hcl
resource "aws_eip" "nat" {
  domain = "vpc"  # Explicitly VPC context
}
```

- EC2-Classic was deprecated in August 2022
- All modern AWS accounts use VPC only
- Setting is still recommended for code clarity
- Default is "vpc" in new Terraform versions

---

## Lifecycle Management

Control how Terraform handles resource changes:

```hcl
resource "aws_ecs_service" "app" {
  name = "my-service"

  lifecycle {
    # Ignore changes made outside Terraform
    ignore_changes = [task_definition]

    # Create new resource before destroying old
    create_before_destroy = true

    # Prevent accidental deletion
    prevent_destroy = true
  }
}
```

**Common use cases:**

- `ignore_changes`: CI/CD manages task definitions
- `create_before_destroy`: Zero-downtime updates
- `prevent_destroy`: Protect critical resources

---

## File Summary

| File                       | Purpose               | Git Status          |
| -------------------------- | --------------------- | ------------------- |
| `.terraform.lock.hcl`      | Provider version lock | Commit              |
| `*.tfvars`                 | Environment variables | Ignore              |
| `terraform.tfstate`        | Infrastructure state  | Ignore (use remote) |
| `terraform.tfstate.backup` | Previous state backup | Ignore              |
| `*.tf`                     | Configuration code    | Commit              |

---

## Best Practices

1. **Use remote state** (S3 + DynamoDB) for team environments
2. **Never commit** `.tfvars` with secrets
3. **Always commit** `.terraform.lock.hcl`
4. **Use workspaces** for environment separation
5. **Use modules** for reusable components

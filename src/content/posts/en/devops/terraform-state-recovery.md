---
title: Terraform State Recovery
description: Procedures for recovering from Terraform state drift when state file doesn't
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - devops
  - terraform
  - aws
  - disaster-recovery
category: devops
draft: false
lang: en
references:
  - url: 'https://developer.hashicorp.com/terraform/cli/state/recover'
    title: Recover state from backup
    type: official
---

match AWS reality.

## Symptoms of State Drift

- `terraform plan` shows changes that shouldn't happen
- Resources marked for destroy that are actively used
- Resources marked for create that already exist
- Unexpected instance replacements

## Recovery Phases

### Phase 1: Assessment

1. **Backup current state**

   ```bash
   cp terraform.tfstate terraform.tfstate.backup-$(date +%Y%m%d)
   ```

2. **Run refresh to sync with AWS**

   ```bash
   terraform refresh
   ```

3. **Analyze drift**

   ```bash
   terraform plan -out=drift-analysis.tfplan
   ```

### Phase 2: Import Missing Resources

For resources that exist in AWS but not in state:

```bash
# RDS Cluster
terraform import aws_rds_cluster.main moba-rds-prod-cluster

# RDS Instance
terraform import aws_rds_cluster_instance.main moba-rds-prod

# EC2 Instance
terraform import aws_instance.main i-0123456789abcdef0
```

### Phase 3: Fix Configuration Drift

Common issues and fixes:

| Issue | Fix |
| ----- | --- |
| AMI mismatch | Pin AMI in configuration |
| Security group type | Use `vpc_security_group_ids` for VPC |
| ECS task definition | Add lifecycle ignore |

## Common Patterns

### Pin AMI to Prevent Replacement

```hcl
resource "aws_instance" "main" {
  ami           = "ami-03205447c85f5199b"  # Pin to current
  instance_type = "t3.medium"

  lifecycle {
    ignore_changes = [ami]  # Or pin and manage manually
  }
}
```

### ECS Task Definition Lifecycle

When task definitions are managed by CI/CD:

```hcl
resource "aws_ecs_service" "main" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn

  lifecycle {
    ignore_changes = [task_definition]
  }
}
```

### VPC Security Groups

For VPC-based instances, use `vpc_security_group_ids`:

```hcl
# ❌ Wrong for VPC instances
resource "aws_instance" "main" {
  security_groups = [aws_security_group.main.name]
}

# ✅ Correct for VPC instances
resource "aws_instance" "main" {
  vpc_security_group_ids = [aws_security_group.main.id]
}
```

## Prevention

### Remote State Backend

Prevents drift by centralizing state:

```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

### State Locking

DynamoDB table for locking:

```hcl
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

## Key Lessons

1. **Always backup state first** - Before any recovery operation
2. **Import before manage** - Don't recreate existing resources
3. **Use lifecycle blocks** - For CI/CD-managed resources
4. **Plan extensively** - Run `terraform plan` multiple times
5. **Document each step** - For future reference and auditing
6. **Set up remote state** - Prevents most drift issues

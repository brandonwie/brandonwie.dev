---
title: Terraform State Recovery
description: Procedures for recovering from Terraform state drift when state file doesn't
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-02'
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
source_content_hash: d8b04c23bdcc5706afd145c03074678034d30b9d5b016fdb9ba35c54e9e84a42
expanded: true
---

I ran `terraform plan` and it wanted to destroy an actively-used RDS cluster. The state file had drifted from AWS reality — resources existed in AWS that Terraform didn't know about, and Terraform's view of existing resources was outdated. Instead of panicking and running `apply`, I needed a systematic recovery process.

Terraform state drift happens when the state file doesn't match what actually exists in your cloud provider. This can occur from manual console changes, failed applies, or state file corruption. The recovery process is methodical: backup first, assess the damage, import missing resources, and fix configuration drift.

## Recognizing State Drift

These symptoms in `terraform plan` output indicate drift:

- Resources marked for **destroy** that are actively used in production
- Resources marked for **create** that already exist in AWS
- Unexpected instance replacements (destroy + recreate)
- Changes that nobody made appearing in the plan

If `terraform plan` shows any of these, do NOT run `terraform apply`. Diagnose first.

## Recovery: Phase 1 — Assessment

The first rule is: **always backup the current state** before touching anything.

```bash
cp terraform.tfstate terraform.tfstate.backup-$(date +%Y%m%d)
```

Next, run a refresh to sync Terraform's view with AWS reality. This updates the state file with the current state of resources Terraform already tracks:

```bash
terraform refresh
```

Then analyze what drift remains:

```bash
terraform plan -out=drift-analysis.tfplan
```

Review this plan carefully. Categorize each change: is Terraform trying to create something that exists? Destroy something that's running? Modify something that was changed manually?

## Recovery: Phase 2 — Import Missing Resources

For resources that exist in AWS but aren't in Terraform state (Terraform wants to create them when they already exist), use `terraform import`:

```bash
# RDS Cluster
terraform import aws_rds_cluster.main app-rds-prod-cluster

# RDS Instance
terraform import aws_rds_cluster_instance.main app-rds-prod

# EC2 Instance
terraform import aws_instance.main i-0123456789abcdef0
```

Each import command tells Terraform "this resource in my configuration corresponds to this existing resource in AWS." After importing, Terraform tracks the resource without trying to recreate it.

## Recovery: Phase 3 — Fix Configuration Drift

After importing, `terraform plan` may still show changes because your `.tf` configuration doesn't match the actual resource attributes. Common issues and fixes:

| Issue               | Fix                                  |
| ------------------- | ------------------------------------ |
| AMI mismatch        | Pin AMI in configuration             |
| Security group type | Use `vpc_security_group_ids` for VPC |
| ECS task definition | Add lifecycle ignore                 |

### Pin AMI to Prevent Replacement

If Terraform wants to replace an EC2 instance because the AMI changed:

```hcl
resource "aws_instance" "main" {
  ami           = "ami-03205447c85f5199b"  # Pin to current
  instance_type = "t3.medium"

  lifecycle {
    ignore_changes = [ami]  # Or pin and manage manually
  }
}
```

The `lifecycle.ignore_changes` block tells Terraform to skip this attribute during planning. Use this for attributes managed outside of Terraform (like AMIs updated by a separate patching process).

### ECS Task Definition Lifecycle

When CI/CD manages task definitions separately from Terraform:

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

Without this, every `terraform plan` shows a diff because CI/CD has updated the task definition since Terraform last applied.

### VPC Security Groups

A common source of drift is using the wrong security group attribute for VPC instances:

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

Using `security_groups` (by name) instead of `vpc_security_group_ids` (by ID) causes Terraform to detect drift on every plan because the API returns IDs, not names.

## Prevention: Remote State Backend

Most state drift can be prevented by using a remote state backend. This centralizes the state file and adds locking to prevent concurrent modifications:

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

The DynamoDB table provides state locking — preventing two people from running `terraform apply` simultaneously:

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

1. **Always backup state first** — Before any recovery operation, copy the state file
2. **Import before manage** — Don't recreate existing resources; import them into state
3. **Use lifecycle blocks** — For resources managed by CI/CD or external processes
4. **Plan extensively** — Run `terraform plan` multiple times during recovery; never `apply` without reviewing
5. **Document each step** — For future reference and auditing
6. **Set up remote state** — Prevents most drift issues by centralizing state management

## Takeaway

Terraform state recovery follows a predictable pattern: backup, refresh, import missing resources, fix configuration drift, and verify with `plan`. The key is to never run `apply` before understanding every change in the plan. Set up remote state with locking from day one to prevent most drift scenarios. When drift does happen, the systematic approach (assess → import → fix → verify) gets you back to a clean state without destroying production resources.

## References

- [Terraform State Recovery Documentation](https://developer.hashicorp.com/terraform/cli/state/recover)

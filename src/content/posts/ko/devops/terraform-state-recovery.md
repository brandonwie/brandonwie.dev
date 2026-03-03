---
title: "Terraform 상태 복구"
description: "Terraform state 파일이 AWS 실제 상태와 맞지 않을 때 복구하는 절차를 정리했어요."
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - devops
  - terraform
  - aws
  - disaster-recovery
category: devops
draft: false
lang: ko
source_lang: en
source_slug: terraform-state-recovery
source_updated: "2026-01-26"
translation_date: "2026-03-04"
references:
  - url: "https://developer.hashicorp.com/terraform/cli/state/recover"
    title: Recover state from backup
    type: official
---

## State Drift 증상

- `terraform plan`에서 발생하면 안 되는 변경이 표시돼요
- 실제로 사용 중인 리소스가 삭제 대상으로 표시돼요
- 이미 존재하는 리소스가 생성 대상으로 표시돼요
- 예상치 못한 인스턴스 교체가 발생해요

## 복구 단계

### 1단계: 현황 파악

1. **현재 state 백업**

   ```bash
   cp terraform.tfstate terraform.tfstate.backup-$(date +%Y%m%d)
   ```

2. **refresh로 AWS와 동기화**

   ```bash
   terraform refresh
   ```

3. **drift 분석**

   ```bash
   terraform plan -out=drift-analysis.tfplan
   ```

### 2단계: 누락된 리소스 Import

AWS에 존재하지만 state에 없는 리소스:

```bash
# RDS Cluster
terraform import aws_rds_cluster.main moba-rds-prod-cluster

# RDS Instance
terraform import aws_rds_cluster_instance.main moba-rds-prod

# EC2 Instance
terraform import aws_instance.main i-0123456789abcdef0
```

### 3단계: 설정 Drift 수정

주요 이슈와 해결 방법:

| 이슈                | 해결                                    |
| ------------------- | --------------------------------------- |
| AMI 불일치          | 설정에 AMI 고정                         |
| Security group 타입 | VPC에서는 `vpc_security_group_ids` 사용 |
| ECS task definition | lifecycle ignore 추가                   |

## 자주 나오는 패턴

### AMI 고정으로 교체 방지

```hcl
resource "aws_instance" "main" {
  ami           = "ami-03205447c85f5199b"  # 현재 값으로 고정
  instance_type = "t3.medium"

  lifecycle {
    ignore_changes = [ami]  # 또는 고정 후 수동 관리
  }
}
```

### ECS Task Definition Lifecycle

CI/CD에서 task definition을 관리하는 경우:

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

VPC 기반 인스턴스에서는 `vpc_security_group_ids`를 사용하세요:

```hcl
# ❌ VPC 인스턴스에서 잘못된 방법
resource "aws_instance" "main" {
  security_groups = [aws_security_group.main.name]
}

# ✅ VPC 인스턴스에서 올바른 방법
resource "aws_instance" "main" {
  vpc_security_group_ids = [aws_security_group.main.id]
}
```

## 예방

### Remote State Backend

state를 중앙화해서 drift를 방지해요:

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

잠금용 DynamoDB 테이블:

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

## 핵심 교훈

1. **항상 state를 먼저 백업** - 복구 작업 전에 반드시
2. **관리 전에 import** - 기존 리소스를 다시 만들지 말 것
3. **lifecycle 블록 활용** - CI/CD가 관리하는 리소스에 적용
4. **plan을 충분히 실행** - `terraform plan`을 여러 번 돌리세요
5. **각 단계를 문서화** - 향후 참조와 감사를 위해
6. **remote state 설정** - 대부분의 drift 문제를 예방해요

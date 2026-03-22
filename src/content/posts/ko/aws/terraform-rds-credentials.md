---
title: Terraform RDS 자격증명 관리
description: 하드코딩 대신 변수를 사용해서 RDS 자격증명을 안전하게 관리하는 방법.
date: 2026-01-23T00:00:00.000Z
updated: '2026-03-22'
tags:
  - aws
  - terraform
  - rds
  - security
  - work
category: aws
draft: false
lang: ko
source_lang: en
source_slug: terraform-rds-credentials
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html
    title: Password management with Amazon RDS and AWS Secrets Manager
    type: official
---

## 방법

### 방법 1: 환경 변수(CI/CD 권장)

```bash
export TF_VAR_rds_master_username="postgres"
export TF_VAR_rds_master_password="your-password"

terraform plan
terraform apply
```

### 방법 2: terraform.tfvars(로컬 개발용)

`terraform.tfvars`를 생성하고(.gitignore에 추가):

```hcl
rds_master_username = "postgres"
rds_master_password = "your-password"
```

### 방법 3: 커맨드 라인 변수

```bash
terraform apply \
  -var="rds_master_username=postgres" \
  -var="rds_master_password=your-password"
```

### 방법 4: AWS Secrets Manager

```hcl
data "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = "my-app/prod"
}

locals {
  rds_creds = jsondecode(data.aws_secretsmanager_secret_version.rds_credentials.secret_string)
}

# 사용법:
# master_username = local.rds_creds.DB_USERNAME
# master_password = local.rds_creds.DB_PASSWORD
```

## 변수 설정

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

## 보안 모범 사례

1. **자격증명을 저장소에 절대 커밋하지 마세요**
2. **CI/CD 파이프라인에서 환경 변수를 사용하세요**
3. **변수에 sensitive 표시**(`sensitive = true`)
4. **terraform.tfvars**는 .gitignore에 추가
5. **프로덕션에서는 AWS Secrets Manager를 고려하세요**

## 테스트

```bash
# plan 확인(비밀번호가 "sensitive value"로 표시)
export TF_VAR_rds_master_password="test"
terraform plan

# 출력 예시:
# ~ master_password = (sensitive value)
```

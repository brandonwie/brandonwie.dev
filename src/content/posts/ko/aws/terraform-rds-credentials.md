---
title: Terraform RDS 자격증명 관리
description: 하드코딩 대신 변수를 사용해서 RDS 자격증명을 안전하게 관리하는 방법.
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
tags:
  - aws
  - terraform
  - rds
  - security
category: aws
draft: false
lang: ko
source_lang: en
source_slug: terraform-rds-credentials
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html
    title: Password management with Amazon RDS and AWS Secrets Manager
    type: official
  - url: 'https://developer.hashicorp.com/terraform/language/values/variables'
    title: 'Terraform: Input Variables'
    type: official
  - url: 'https://developer.hashicorp.com/terraform/language/state/sensitive-data'
    title: 'Terraform: Sensitive Data in State'
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

자동 로딩되는 파일명은 하나가 아니에요. Terraform은 `terraform.tfvars`,
`terraform.tfvars.json`, 그리고 `.auto.tfvars`나 `.auto.tfvars.json`으로
끝나는 파일을 모두 자동으로 읽어요. 그 외의 이름(`prod.tfvars` 같은)은
`-var-file` 플래그로 직접 지정해야 하고요.

우선순위도 알아두면 좋아요. 공식 문서 기준으로 낮은 쪽부터 높은 쪽 순서는
변수의 `default`, 환경 변수, `terraform.tfvars`, `terraform.tfvars.json`,
사전순으로 읽히는 `*.auto.tfvars`, 마지막이 커맨드 라인의 `-var`와
`-var-file`이에요. 환경 변수가 아래쪽에 있어서, 작업 디렉터리에 남아 있는
`terraform.tfvars` 하나가 CI에서 주입한 `TF_VAR_` 값을 조용히 덮어써요.

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

`sensitive = true`는 CLI 출력에서 값을 가려주는 옵션이에요. plan 출력,
`terraform show`, 사용자에게 보여지는 state 표현에는 값이 나오지 않아요.
다만 state 파일 자체에는 값이 그대로 저장돼요. 표시를 통제하는 것이지
저장을 막는 게 아니고, 로컬 state 파일은 평문이에요. state를 암호화하려면
백엔드 쪽에서 해결해야 해요 — 암호화를 켠 S3, 고객 관리 키를 쓰는 GCS,
HCP Terraform 같은 선택지가 있어요.

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

---
title: Terraform 기초
description: AWS 인프라 관리를 위한 핵심 Terraform 개념 정리.
date: 2025-04-29T00:00:00.000Z
updated: '2026-03-22'
tags:
  - aws
  - terraform
  - infrastructure-as-code
category: aws
draft: false
lang: ko
source_lang: en
source_slug: terraform-fundamentals
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: 'https://developer.hashicorp.com/terraform/intro'
    title: What is Terraform
    type: official
---

## 주요 Terraform 파일

### .terraform.lock.hcl

프로바이더 버전 잠금 파일이에요:

- **생성 시점**: `terraform init`
- **목적**: 팀 전체에서 일관된 프로바이더 버전을 보장해요
- **내용**: 프로바이더 버전, 무결성 확인용 해시 값
- **Git**: 커밋해야 해요

```hcl
# 이 파일은 "terraform init"에 의해 자동으로 관리돼요.
# 수동 편집은 향후 업데이트에서 사라질 수 있어요.

provider "registry.terraform.io/hashicorp/aws" {
  version     = "5.84.0"
  constraints = "~> 5.0"
  hashes = [
    "h1:aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789...",
    "zh:0123456789abcdef0123456789abcdef...",
  ]
}
```

`hashes` 배열은 프로바이더 바이너리의 무결성 체크섬이에요. 다른 팀원이 `terraform init`을 실행하면, Terraform이 다운로드한 프로바이더가 이 해시와 일치하는지 확인해서 공급망 변조를 방지해요. `constraints` 필드는 어떤 버전 제약(`required_providers`에서 설정)이 이 잠긴 버전을 생성했는지 기록해요.

### .tfvars 파일

환경별 설정을 위한 변수 값 파일이에요:

- **목적**: 설정을 코드와 분리해요
- **사용법**: `terraform apply -var-file="prod.tfvars"`
- **내용**: 민감 정보(비밀번호, 키, 환경 설정)
- **Git**: `.gitignore`에 추가해야 해요

```hcl
# prod.tfvars
db_username = "admin"
db_password = "secretpassword"
environment = "production"
```

### terraform.tfstate

관리 중인 인프라를 추적하는 상태 파일이에요:

- **목적**: Terraform 설정을 실제 AWS 리소스에 매핑해요
- **내용**: 리소스 ID, 속성, 메타데이터, 의존성
- **중요**: Terraform이 인프라를 추적하고 수정하는 데 필수예요
- **Git**: `.gitignore`에 추가(프로덕션에서는 원격 상태 사용)

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

Terraform은 상태를 업데이트하기 전에 자동으로 `.tfstate.backup` 파일을 생성해요. **이전** 상태의 복사본으로 로컬 안전망 역할을 해요:

- **생성 시점**: 상태를 변경하는 모든 `terraform apply` 전에 자동으로 생성
- **내용**: 현재 작업 이전의 정확한 상태
- **복구**: `terraform.tfstate`가 손상되면 `.backup`을 `.tfstate`로 이름을 바꿔서 이전 정상 상태를 복원할 수 있어요
- **Git**: `.gitignore`에 추가(`.tfstate`와 동일)
- **원격 상태**: S3 backend에 버전 관리를 사용하면 S3 버전 관리가 동일한 rollback 기능을 제공하기 때문에 백업 파일의 중요도가 낮아져요

**참고:** 로컬 전용 안전 메커니즘이에요. 팀 환경에서는 원격 상태(S3 + DynamoDB 잠금)가 상태 관리와 복구를 위한 적절한 솔루션이에요.

---

## Resource vs Data Source

### resource 블록

AWS 리소스를 생성하고 관리해요:

```hcl
# Terraform이 이 subnet을 생성해요
resource "aws_subnet" "main" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}
```

- 리소스가 없으면 생성해요
- 설정이 바뀌면 업데이트해요
- `terraform destroy`하면 삭제해요
- Terraform이 lifecycle을 소유하고 관리해요

### data 블록

기존 리소스를 읽어요(읽기 전용):

```hcl
# Terraform이 이 기존 subnet을 읽어요
data "aws_subnet" "existing" {
  id = "subnet-1234abcd"
}

# 데이터 사용
output "subnet_cidr" {
  value = data.aws_subnet.existing.cidr_block
}
```

- 리소스를 생성하거나 수정하지 않아요
- Terraform 외부에서 생성된 리소스를 참조할 때 유용해요
- 크로스 계정 리소스 참조에 사용돼요
- 기존 인프라에 대해 AWS에 쿼리해요

**요약**: `resource` = "이걸 생성해", `data` = "이 기존 것을 찾아"

---

## depends_on 속성

명시적 의존성 선언이에요:

```hcl
resource "aws_eip" "nat" {
  domain = "vpc"
  # EIP 생성 전에 IGW를 기다려요
  depends_on = [aws_internet_gateway.main]
}
```

**사용 시점:**

- Terraform이 의존성을 추론할 수 없을 때
- 다른 리소스보다 먼저 존재해야 하는 네트워크 리소스
- API 순서 요구사항이 있을 때

**참고**: `depends_on`은 단일 의존성이어도 리스트를 받아요.

---

## domain = "vpc"(EIP)

VPC vs EC2-Classic을 위한 레거시 설정이에요:

```hcl
resource "aws_eip" "nat" {
  domain = "vpc"  # 명시적으로 VPC 컨텍스트
}
```

- EC2-Classic은 2022년 8월에 폐기되었어요
- 모든 최신 AWS 계정은 VPC만 사용해요
- 코드 명확성을 위해 여전히 설정하는 게 권장돼요
- 새 Terraform 버전에서 기본값은 "vpc"예요

---

## Lifecycle 관리

Terraform이 리소스 변경을 처리하는 방식을 제어해요:

```hcl
resource "aws_ecs_service" "app" {
  name = "my-service"

  lifecycle {
    # Terraform 외부에서 이뤄진 변경을 무시
    ignore_changes = [task_definition]

    # 기존 것을 삭제하기 전에 새 리소스를 생성
    create_before_destroy = true

    # 실수로 삭제하는 걸 방지
    prevent_destroy = true
  }
}
```

**일반적인 사용 사례:**

- `ignore_changes`: CI/CD가 task definition을 관리할 때
- `create_before_destroy`: 무중단 업데이트
- `prevent_destroy`: 중요 리소스 보호

---

## 파일 요약

| 파일                       | 목적                 | Git 상태        |
| -------------------------- | -------------------- | --------------- |
| `.terraform.lock.hcl`      | 프로바이더 버전 잠금 | 커밋            |
| `*.tfvars`                 | 환경 변수            | 무시            |
| `terraform.tfstate`        | 인프라 상태          | 무시(원격 사용) |
| `terraform.tfstate.backup` | 이전 상태 백업       | 무시            |
| `*.tf`                     | 설정 코드            | 커밋            |

---

## 모범 사례

1. **원격 상태 사용**(S3 + DynamoDB) 팀 환경에서
2. **시크릿이 있는 `.tfvars`는 절대 커밋하지 마세요**
3. **`.terraform.lock.hcl`은 항상 커밋하세요**
4. **워크스페이스 사용** 환경 분리를 위해
5. **모듈 사용** 재사용 가능한 컴포넌트를 위해

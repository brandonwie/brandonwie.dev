---
title: Terraform 상태 복구
description: Terraform state 파일이 AWS 실제 상태와 맞지 않을 때 복구하는 절차를 정리했어요.
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-12'
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
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://developer.hashicorp.com/terraform/cli/state/recover'
    title: Recover state from backup
    type: official
  - url: 'https://developer.hashicorp.com/terraform/cli/commands/refresh'
    title: 'Command: refresh'
    type: official
  - url: 'https://developer.hashicorp.com/terraform/cli/import'
    title: Import existing resources
    type: official
  - url: 'https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle'
    title: The lifecycle meta-argument
    type: official
  - url: 'https://developer.hashicorp.com/terraform/language/backend/s3'
    title: 'Backend type: s3'
    type: official
---

`terraform plan`을 돌렸는데 실제로 쓰고 있는 RDS cluster를 삭제하겠다고 나왔어요. state 파일이 AWS 실제 상태와 어긋난 거죠. AWS에는 있는데 Terraform은 모르는 리소스가 있었고, Terraform이 알고 있는 리소스 정보도 낡아 있었어요. 당황해서 `apply`를 누르는 대신, 순서가 있는 복구 절차가 필요했어요.

State drift는 state 파일이 클라우드에 실제로 존재하는 것과 맞지 않을 때 생겨요. 콘솔에서 수동으로 바꿨거나, apply가 중간에 실패했거나, state 파일이 깨진 경우가 대표적이에요. 복구는 순서대로예요. 먼저 백업하고, 피해 범위를 파악하고, 빠진 리소스를 import하고, 설정 drift를 고쳐요.

## State Drift 증상

`terraform plan` 출력에서 이런 게 보이면 drift예요.

- 운영에서 실제로 쓰고 있는 리소스가 **destroy** 대상으로 표시돼요
- AWS에 이미 존재하는 리소스가 **create** 대상으로 표시돼요
- 예상치 못한 인스턴스 교체(destroy + recreate)가 잡혀요
- 아무도 건드리지 않은 변경이 plan에 나타나요

하나라도 보이면 `terraform apply`는 절대 누르지 마세요. 진단이 먼저예요.

## 복구 1단계 — 현황 파악

첫 번째 규칙은 **뭘 하기 전에 현재 state를 백업**하는 거예요.

Local state라면 파일 복사면 돼요.

```bash
cp terraform.tfstate terraform.tfstate.backup-$(date +%Y%m%d)
```

Remote backend를 쓰면 복사할 로컬 파일이 없어요. 대신 pull하면 돼요. `terraform state pull`은 설정된 backend에서 state를 읽어오고, 짝이 되는 `terraform state push`가 state 파일을 다시 써넣어요. HashiCorp가 백업으로부터 state를 복구할 때 문서화해 둔 조합이 이 둘이에요.

```bash
terraform state pull > terraform.tfstate.backup-$(date +%Y%m%d)
```

다음은 Terraform이 알고 있는 상태를 AWS 실제 상태와 맞추는 단계예요. 제가 처음 손이 간 명령은 `terraform refresh`였는데, 이게 잘못된 습관이었어요. HashiCorp CLI 문서의 해당 페이지에는 지금 이런 deprecation 안내가 붙어 있어요. "This command is deprecated. Instead, add the `-refresh-only` flag to `terraform apply` and `terraform plan` commands."

문법보다 이유가 중요해요. `terraform refresh`는 `terraform apply -refresh-only -auto-approve`와 같아요. 발견한 내용을 검토 과정 없이 state에 바로 써버려요. 문서는 실패 모드를 아주 직설적으로 적어 뒀어요. Provider credential이 잘못 설정돼 있으면 Terraform이 관리 대상 객체가 전부 삭제됐다고 착각할 수 있고, "causing it to remove all of the tracked objects without any confirmation prompt"라고요.

이 글 전체가 피하려는 상황이 바로 그거예요. 그러니 쓰기 전에 읽어요.

```bash
# 읽기 전용: refresh가 state를 어떻게 바꿀지만 보여줘요
terraform plan -refresh-only

# 출력을 확인한 다음에만 실행 — 승인 프롬프트가 떠요
terraform apply -refresh-only
```

그다음 남은 drift를 분석해요.

```bash
terraform plan -out=drift-analysis.tfplan
```

이 plan은 꼼꼼히 읽어야 해요. 변경 하나하나를 분류하세요. 이미 존재하는 걸 만들려는 건가요? 돌고 있는 걸 지우려는 건가요? 수동으로 바꾼 걸 되돌리려는 건가요?

## 복구 2단계 — 누락된 리소스 Import

AWS에는 있는데 state에는 없는 리소스(= Terraform이 create하려는 것)는 import로 관리 범위에 넣어요. `terraform import` CLI 명령은 리소스 주소와 provider가 쓰는 실제 객체 ID를 받아요.

```bash
# RDS Cluster
terraform import aws_rds_cluster.main app-prod-cluster

# RDS Instance
terraform import aws_rds_cluster_instance.main app-prod-instance-1

# EC2 Instance
terraform import aws_instance.main i-0123456789abcdef0
```

각 명령은 Terraform에게 "내 설정의 이 리소스가 AWS의 저 리소스야"라고 알려주는 거예요. import 후에는 Terraform이 그 리소스를 다시 만들려 하지 않고 그대로 추적해요.

시작 전에 알아 둘 점이 하나 있어요. CLI 명령은 "can only import resources into the state"이고 "does _not_ generate configuration"이에요. 즉 `.tf` 설정은 직접 써야 하고, 그게 정확히 3단계에서 할 일이에요. 설정 생성까지 원하거나 import를 즉시 실행하지 않고 plan에서 검토하고 싶다면, Terraform 문서는 선언형 `import` 블록을 대안으로 안내해요.

## 복구 3단계 — 설정 Drift 수정

import 후에도 `terraform plan`에 변경이 남을 수 있어요. `.tf` 설정이 실제 리소스 속성과 다르기 때문이에요. 자주 나오는 이슈와 해결이에요.

| 이슈                | 해결                                    |
| ------------------- | --------------------------------------- |
| AMI 불일치          | 설정에 AMI 고정                         |
| Security group 타입 | VPC에서는 `vpc_security_group_ids` 사용 |
| ECS task definition | lifecycle ignore 추가                   |

### AMI 고정으로 교체 방지

AMI가 바뀌었다는 이유로 Terraform이 EC2 인스턴스를 교체하려 할 때예요.

```hcl
resource "aws_instance" "main" {
  ami           = "ami-0abcdef1234567890" # 인스턴스가 실제로 쓰는 AMI ID로 바꾸세요
  instance_type = "t3.medium"

  lifecycle {
    ignore_changes = [ami] # 또는 고정 후 수동 관리
  }
}
```

`lifecycle.ignore_changes`는 plan을 만들 때 특정 속성을 건너뛰라고 알려줘요. HashiCorp는 이걸 "to let Terraform share management responsibilities of a single object with a separate process", 즉 하나의 객체를 다른 프로세스와 나눠서 관리하기 위한 장치로 설명해요. AMI가 딱 그 경우예요. Terraform 밖의 패치 파이프라인이 값을 바꾸고 있으니까요.

공짜는 아니에요. 무시하기로 한 속성은 Terraform이 더는 맞춰주지 않아요. 시끄러운 drift가 사라지는 게 아니라 안 보이게 되는 거예요. 다른 주체가 정말로 소유한 속성에만, 가능한 한 좁게 쓰세요.

### ECS Task Definition Lifecycle

CI/CD가 task definition을 Terraform과 별도로 관리하는 경우예요.

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

이게 없으면 `terraform plan`마다 diff가 떠요. Terraform이 마지막으로 apply한 이후에 CI/CD가 task definition을 갱신했기 때문이에요.

### VPC Security Groups

VPC 인스턴스에서 security group 속성을 잘못 쓰는 것도 흔한 drift 원인이에요.

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

이름 기반인 `security_groups` 대신 ID 기반인 `vpc_security_group_ids`를 써야 해요. API가 이름이 아니라 ID를 돌려주기 때문에, 전자를 쓰면 plan마다 drift가 잡혀요.

## 예방 — Remote State Backend

대부분의 drift는 복구보다 예방이 싸요. Remote backend는 state를 중앙화하고 locking을 붙여서 두 사람이 동시에 apply하는 걸 막아줘요.

```hcl
terraform {
  backend "s3" {
    bucket       = "mycompany-terraform-state"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

몇 년 전에 이 backend를 배웠다면 `use_lockfile`이 낯설 거예요. 대부분의 튜토리얼은 아직 `dynamodb_table` 인자와 `LockID` hash key를 가진 별도 `aws_dynamodb_table` 리소스를 보여주거든요. 그 방식도 아직 동작하지만, S3 backend 문서는 지금 "DynamoDB-based locking is deprecated and will be removed in a future minor version"이라고 적고 있고, S3 네이티브 방식인 `use_lockfile`을 대체재로 안내해요. 마이그레이션 중에는 둘을 동시에 설정할 수 있어서, 한 번에 갈아엎지 않아도 돼요.

바꾸기 전에 본인이 쓰는 Terraform 버전 기준으로 backend 문서를 확인하세요. locking은 블로그 글만 보고 잘못 설정하면 곤란한 부분이에요.

## 핵심 교훈

1. **state는 항상 먼저 백업하세요.** Local state는 파일을 복사하고, remote
   backend는 `terraform state pull`을 쓰면 돼요.
2. **진짜 refresh 전에 읽기 전용으로 먼저 확인하세요.** `plan -refresh-only`는
   보여주기만 하고, `refresh`는 그냥 써버려요.
3. **관리하기 전에 import하세요.** 기존 리소스를 다시 만들지 마세요. import한
   뒤에 설정을 맞추면 돼요.
4. **lifecycle 블록은 의도적으로 쓰세요.** 다른 프로세스가 실제로 소유한
   속성에만 쓰고, 그 이상으로 넓히지 마세요.
5. **plan을 충분히 돌리세요.** 복구 중에는 `terraform plan`을 여러 번 실행하고,
   검토 없이 `apply`하지 마세요.
6. **remote state와 locking을 설정하세요.** state를 중앙에서 관리하면 대부분의
   drift를 예방할 수 있어요.

## 마무리

Terraform state 복구는 패턴이 정해져 있어요. 백업하고, 읽기 전용으로 맞춰보고, 빠진 리소스를 import하고, 설정 drift를 고치고, `plan`으로 확인해요. 핵심은 무엇이 state에 쓰일지 읽기 전에는 아무것도 쓰지 못하게 하는 거예요. 그래서 아직 실행은 되더라도 deprecated된 `terraform refresh`는 습관에서 지울 만해요. Remote state와 locking은 처음부터 설정해 두면 drift 상황 대부분을 막아줘요. 그래도 drift가 생기면, 파악 → import → 수정 → 검증 순서가 운영 리소스를 날리지 않고 깨끗한 state로 돌아가는 길이에요.

## 참고 자료

- [Recover state from backup](https://developer.hashicorp.com/terraform/cli/state/recover)
  — remote state를 읽고 복구할 때 쓰는 `terraform state pull` / `state push` 조합
- [Command: refresh](https://developer.hashicorp.com/terraform/cli/commands/refresh)
  — deprecation 안내와, `-refresh-only`가 더 안전한 이유가 되는 auto-approve 위험
- [Import existing resources](https://developer.hashicorp.com/terraform/cli/import)
  — CLI import는 state에만 넣고 설정은 생성하지 않아요
- [The lifecycle meta-argument](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)
  — `ignore_changes`가 하는 일과, 공동 관리 상황에서 쓰는 이유
- [Backend type: s3](https://developer.hashicorp.com/terraform/language/backend/s3)
  — S3 네이티브 locking인 `use_lockfile`과 DynamoDB locking deprecation

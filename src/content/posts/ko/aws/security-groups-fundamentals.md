---
title: AWS Security Group 기초
description: 'Security Group의 stateful 동작, 최소 권한 원칙, 실전 패턴 — 연결 안 되는 원인 1위를 파헤쳐요.'
date: 2025-04-29T00:00:00.000Z
updated: '2026-02-19'
tags:
  - aws
  - security
  - networking
category: aws
draft: false
lang: ko
source_lang: en
source_slug: security-groups-fundamentals
source_updated: '2026-03-22'
translation_date: '2026-02-20'
references:
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'
    title: AWS Security Group 공식 문서
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: Security Group 규칙 레퍼런스
    type: official
---

ECS 서비스를 배포하고, task definition을 설정하고, 컨테이너가 정상인 걸 확인했는데 -- 아무것도 접근이 안 됐어요. 에러도 없고, 타임아웃 메시지도 없고, 그냥 침묵이었어요. 코드, 환경 변수, DNS를 한 시간 동안 확인한 뒤에야 security group에 애플리케이션 포트의 ingress 규칙이 없다는 걸 깨달았어요. 규칙 하나 누락, 도움 되는 에러 메시지 제로.

Security group은 "로컬에서는 되는데 AWS에서는 안 되는" 문제의 가장 흔한 원인이고, 트래픽을 차단할 때 로그를 남기지 않아요.

## 왜 중요한가

VPC의 모든 AWS 리소스에는 네트워크 레벨 접근 제어가 필요해요. Security group이 제대로 설정되지 않으면 리소스가 인터넷 전체에 노출되거나(보안 위험), 완전히 접근 불가능해져요(연결 끊김). 잘못 설정된 규칙은 AWS 보안 감사에서 가장 자주 발견되는 항목이고, 모든 포트에 `0.0.0.0/0`처럼 과도하게 허용적인 규칙은 공격의 빌미가 돼요.

## 헤맸던 부분들

실제로 디버깅 시간을 잡아먹은 함정들이에요:

- **Stateful 동작이 처음엔 헷갈려요.** 포트 443의 인바운드를 허용하면, 응답 트래픽이 명시적 egress 규칙 없이 자동으로 허용돼요. 양방향을 모두 설정하는 전통적인 방화벽 경험이 있으면 직관적이지 않아요.
- **기본 거부 vs 기본 허용 비대칭.** 인바운드는 기본 전체 차단인데 아웃바운드는 기본 전체 허용이에요. 이걸 잊으면 왜 아무것도 연결 안 되는지(ingress 누락) 헤매거나, egress 제한이 있다고 착각해요.
- **Security group 참조 vs CIDR 블록.** 서비스 간 통신(앱-데이터베이스 등)에 CIDR 블록을 쓰면 IP가 바뀔 때 깨져요. Security group 참조는 자동 업데이트되지만, Terraform 문법이 다르고 헷갈리기 쉬워요.
- **연결 디버깅이 불투명해요.** Security group 거부는 기본적으로 로그를 남기지 않아요(NACL과 다름). 거부된 트래픽을 보려면 VPC Flow Logs를 명시적으로 활성화해야 하고, 그래도 어떤 security group 규칙이 원인인지는 안 알려줘요.
- **규칙 한도에 쉽게 도달해요.** 기본 한도가 security group당 60개 규칙, ENI당 5개 security group이에요. 규칙을 통합하려면 포트 범위와 CIDR 집합을 이해해야 해요.

## 사용하면 좋을 때

Security group은 VPC의 모든 리소스(EC2, RDS, ECS, VPC 내 Lambda)의 접근 제어, 서비스 티어 간 최소 권한 네트워크 접근 구현, 데이터베이스 접근을 애플리케이션 서버로만 제한, SSH/RDP 접근을 특정 IP 범위나 bastion 호스트로 제한할 때 적합해요.

서브넷 레벨 트래픽 제어(NACL 사용), 특정 IP 차단(security group에는 deny 규칙이 없음 -- NACL 사용), 속도 제한이나 DDoS 방어(AWS WAF나 Shield 사용), 애플리케이션 레이어 필터링(security group은 L3/L4만 -- ALB 규칙이나 WAF 사용), 크로스 VPC 규칙(security group 참조는 같은 VPC나 피어링된 VPC에서만 동작)에는 적합하지 않아요.

## 핵심 개념

### Stateful 방화벽

Security Group은 **stateful**이에요. 이게 가장 중요한 이해 포인트예요:

- 인바운드 트래픽이 허용되면 응답 트래픽은 자동으로 아웃바운드 허용
- 응답을 위한 별도 egress 규칙 불필요
- 규칙 관리가 크게 단순해짐

Stateless인 Network ACL(NACL)과 비교하세요. NACL은 양방향에 명시적 규칙이 필요해요.

### 기본 동작

많은 분을 당황하게 하는 두 가지 기본값:

- **인바운드**: 모든 트래픽 기본 차단
- **아웃바운드**: 모든 트래픽 기본 허용

이 비대칭은 커스텀 규칙이 없는 새 security group이 들어오는 연결은 모두 차단하지만, 리소스가 인터넷의 모든 곳에 접근할 수 있다는 뜻이에요.

## Ingress 규칙 (인바운드)

Ingress 규칙은 리소스로 **들어오는** 트래픽을 제어해요:

```hcl
ingress {
  description = "PostgreSQL from VPC"
  from_port   = 5432
  to_port     = 5432
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

핵심 파라미터:

- `from_port` / `to_port`: 포트 범위 (단일 포트면 같은 값)
- `protocol`: `tcp`, `udp`, `icmp`, 또는 `-1` (전체 프로토콜)
- `cidr_blocks`: CIDR 표기법의 소스 IP 범위
- `security_groups`: 소스 security group (서비스 간 트래픽에 권장)

## Egress 규칙 (아웃바운드)

Egress 규칙은 리소스에서 **나가는** 트래픽을 제어해요:

```hcl
# 모든 아웃바운드 허용 (일반적인 기본값)
egress {
  from_port        = 0
  to_port          = 0
  protocol         = "-1"
  cidr_blocks      = ["0.0.0.0/0"]
  ipv6_cidr_blocks = ["::/0"]
}
```

알아둘 특수 값:

- `from_port = 0, to_port = 0, protocol = "-1"`: 모든 포트의 모든 트래픽
- `cidr_blocks = ["0.0.0.0/0"]`: 모든 IPv4 목적지
- `ipv6_cidr_blocks = ["::/0"]`: 모든 IPv6 목적지

## 보안 모범 사례

### 1. 최소 권한 원칙

보안 감사 통과와 실패의 차이는 규칙이 얼마나 구체적인지에 달려 있어요:

```hcl
# BAD: 너무 허용적
ingress {
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # 모든 IP, 모든 포트
}

# GOOD: 구체적이고 최소한
ingress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]  # VPC만
}
```

### 2. Security Group 참조 사용

서비스 간 통신에는 CIDR 블록보다 항상 security group 참조를 사용하세요:

```hcl
# 데이터베이스는 앱 서버에서만 트래픽 허용
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.app_servers.id]
}
```

이 방식은 소스 IP가 바뀌면 자동 업데이트되고, 의도가 명확하고(app -> db), IP 범위보다 감사하기 쉬워요.

### 3. SSH/RDP 접근 제한

SSH를 절대 `0.0.0.0/0`으로 열지 마세요. 알려진 IP 범위나 bastion 호스트로 제한하세요:

```hcl
# 회사 IP 범위에서만 SSH 허용
ingress {
  description = "SSH from office"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["203.0.113.0/24"]  # 회사 IP 범위
}
```

### 4. 가능하면 Egress도 제한

대부분의 팀이 egress를 완전히 열어둬요. 민감한 워크로드에는 제한하세요:

```hcl
# 특정 서비스로만 HTTPS 아웃바운드 허용
egress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["54.239.28.85/32"]  # 특정 서비스 IP
}
```

## 일반적인 패턴

### 웹 서버 Security Group

일반적인 웹 서버는 인터넷에서 HTTP/HTTPS, bastion에서만 SSH가 필요해요:

```hcl
resource "aws_security_group" "web" {
  name        = "web-server-sg"
  description = "Security group for web servers"
  vpc_id      = aws_vpc.main.id

  # 어디서든 HTTP 허용
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 어디서든 HTTPS 허용
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # bastion에서만 SSH 허용
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  # 모든 아웃바운드 허용
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### 데이터베이스 Security Group

데이터베이스는 애플리케이션 서버에서만 연결을 받아야 하고, 인터넷에서 절대 직접 접근하면 안 돼요:

```hcl
resource "aws_security_group" "database" {
  name        = "database-sg"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.main.id

  # 앱 서버에서만 PostgreSQL 허용
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # RDS는 직접 아웃바운드가 필요 없음
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### ALB Security Group

ALB는 인터넷에서 HTTPS를 받고 특정 포트로 애플리케이션 서버에 전달해요:

```hcl
resource "aws_security_group" "alb" {
  name        = "alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.main.id

  # 인터넷에서 HTTPS 허용
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # 타겟 그룹으로 헬스 체크
  egress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}
```

## Terraform에서 Inline vs Standalone 규칙

Terraform으로 security group 규칙을 관리하는 방법은 두 가지예요. 어떤 방식을
선택하느냐에 따라 state drift가 발생할 수 있어요. 저도 직접 겪었는데 --
`terraform plan`이 AWS 콘솔에서 직접 추가한 개발자 IP를 삭제하려 했어요.
security group에 inline ingress 블록이 하나라도 있으면, Terraform이 모든
ingress 규칙의 소유권을 가져가거든요.

### Inline 규칙 (`aws_security_group` 내부)

```hcl
resource "aws_security_group" "app" {
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }
}
```

inline `ingress` 블록이 하나라도 있으면, Terraform은 이 security group의
모든 ingress 규칙을 관리해요. `terraform plan` 실행 시 AWS에서 현재 state를
가져와서 코드에 없는 규칙은 삭제 대상으로 표시해요. egress도 독립적으로
동일하게 적용돼요.

### Standalone 규칙 (`aws_security_group_rule`)

```hcl
resource "aws_security_group_rule" "app_ssh" {
  type                     = "ingress"
  from_port                = 22
  to_port                  = 22
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.bastion.id
}
```

각 규칙이 독립적인 리소스예요. 부모 security group은 standalone 규칙을 알지
못하고 -- 해당 규칙이 state에 표시되지 않아요. standalone 규칙을 추가하거나
삭제해도 다른 규칙(수동 추가나 다른 standalone 리소스)에 영향을 주지 않아요.

### 핵심 규칙

| Inline ingress 블록 수 | Terraform 동작                                  |
| ---------------------- | ----------------------------------------------- |
| 1개 이상               | 모든 ingress 관리 -- 코드에 없는 규칙 삭제      |
| 0개                    | ingress 관리 안 함 -- 수동/standalone 규칙 무시 |

egress 블록도 ingress와 독립적으로 동일하게 적용돼요.

### Standalone 규칙을 쓸 때

**순환 의존성:** SG A가 어떤 규칙에서 SG B를 참조하고, SG B가 또 다른 규칙에서
SG A를 참조하는 경우예요. 두 리소스에 inline 블록을 쓰면 Terraform 의존성 사이클이
생겨요. 한 방향을 standalone 규칙으로 분리해서 사이클을 끊으세요.

**혼합 소유권:** 일부 규칙은 Terraform으로 관리하고, 나머지는 수동으로 관리하는
경우예요(개발자 IP, 운영팀 추가 규칙 등). inline 블록을 아예 없애고 Terraform
규칙은 standalone 리소스로 관리하세요. 수동 규칙이 plan/apply 사이클에서 살아남아야
한다면 SG 리소스에 `lifecycle { ignore_changes = [ingress] }`를 추가하세요.

**크로스 모듈 참조:** 다른 모듈에 정의된 security group을 참조하는 규칙이
필요할 때예요. standalone 규칙을 쓰면 모듈 간 결합도를 낮출 수 있고, inline
규칙을 작성하기 위해 SG ID를 모듈 output으로 굳이 넘길 필요도 없어요.

### Import ID 형식

기존 standalone 규칙을 Terraform state로 import해야 할 때 사용하는 ID 형식이에요:

```text
{sg_id}_{type}_{protocol}_{from_port}_{to_port}_{source}
```

예시: `sg-abc123_ingress_tcp_22_22_sg-def456`

## 디버깅 팁

뭔가 연결이 안 되고 security group을 의심할 때 이 명령어들이 도움이 돼요:

```bash
# security group 규칙 확인
aws ec2 describe-security-groups \
  --group-ids sg-1234567890abcdef0

# 인바운드 규칙 확인
aws ec2 describe-security-group-rules \
  --filters Name=group-id,Values=sg-1234567890abcdef0

# 연결 테스트
nc -zv <ip> <port>  # 소스에서
telnet <ip> <port>  # 대안
```

`nc`가 아무것도 반환하지 않고 에러도 없으면, security group이 트래픽을 조용히 드롭하고 있는 거예요. VPC Flow Logs를 활성화해서 확인하세요.

## 실전 정리

Security group은 두 가지를 내재화하면 간단해요: stateful이라서 응답이 자동이고, 인바운드 거부/아웃바운드 허용이 기본값이에요.

서비스 간 규칙에는 항상 CIDR 블록 대신 security group 참조를 사용하세요. CIDR 블록은 배포나 스케일링 이벤트 중에 IP가 바뀌면 깨져요. Security group 참조는 이걸 자동으로 처리해요.

연결 문제를 디버깅할 때는 다른 것보다 security group부터 확인하세요. AWS 네트워크 문제의 가장 흔한 원인이고, 기본적으로 로그 출력이 전혀 없어요. 트러블슈팅이 필요할 수 있는 환경에는 VPC Flow Logs를 활성화해 두세요.

## 참고 자료

- [AWS Security Group 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [Security Group 규칙 레퍼런스](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html)

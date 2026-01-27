---
title: 'AWS Security Group 기초'
description: >-
  Security Group은 AWS 리소스의 가상 방화벽으로, 인스턴스 레벨에서 인바운드/아웃바운드 트래픽을 제어합니다.
date: 2025-04-29T00:00:00.000Z
updated: '2026-01-28'
tags:
  - aws
  - security
  - networking
category: aws
draft: false
lang: ko
source_lang: en
source_slug: security-groups-fundamentals
source_updated: 2026-01-27T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'
    title: AWS Security Group 공식 문서
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: Security Group 규칙 레퍼런스
    type: official
---

# AWS Security Group 기초

Security Group은 AWS 리소스의 가상 방화벽으로, 인스턴스 레벨에서 인바운드(ingress)와 아웃바운드(egress) 트래픽을 제어합니다.

---

## 핵심 개념

### Stateful 방화벽

Security Group은 **stateful**입니다:

- 인바운드 트래픽이 허용되면 응답 트래픽은 자동으로 허용됨
- 응답을 위한 egress 규칙을 따로 만들 필요 없음
- 규칙 관리가 단순해짐

### 기본 동작

- **인바운드**: 모든 트래픽 기본 차단
- **아웃바운드**: 모든 트래픽 기본 허용

---

## Ingress 규칙 (인바운드)

리소스로 **들어오는** 트래픽을 제어합니다:

```hcl
ingress {
  description = "PostgreSQL from VPC"
  from_port   = 5432
  to_port     = 5432
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

**파라미터:**

- `from_port` / `to_port`: 포트 범위 (단일 포트면 같은 값)
- `protocol`: `tcp`, `udp`, `icmp`, 또는 `-1` (전체)
- `cidr_blocks`: 소스 IP 범위
- `security_groups`: 소스 security group (권장)

---

## Egress 규칙 (아웃바운드)

리소스에서 **나가는** 트래픽을 제어합니다:

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

**특수 값:**

- `from_port = 0, to_port = 0, protocol = "-1"`: 모든 트래픽
- `cidr_blocks = ["0.0.0.0/0"]`: 모든 IPv4 목적지
- `ipv6_cidr_blocks = ["::/0"]`: 모든 IPv6 목적지

---

## 보안 모범 사례

### 1. 최소 권한 원칙

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

CIDR 블록보다 다른 security group 참조를 선호하세요:

```hcl
# 데이터베이스는 앱 서버에서만 트래픽 허용
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.app_servers.id]
}
```

**장점:**

- 소스 IP가 바뀌면 자동 업데이트
- 의도가 명확함 (app → db)
- 감사하기 쉬움

### 3. SSH/RDP 접근 제한

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

```hcl
# 특정 서비스로만 HTTPS 아웃바운드 허용
egress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["54.239.28.85/32"]  # 특정 서비스 IP
}
```

---

## 일반적인 패턴

### 웹 서버 Security Group

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

---

## 디버깅 팁

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

---

## 참고 자료

- [AWS Security Group 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [Security Group 규칙 레퍼런스](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html)

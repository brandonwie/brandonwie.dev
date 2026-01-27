---
title: 'AWS VPC 네트워킹 기초'
description: >-
  AWS VPC 네트워킹 개념, CIDR 표기법, 네트워크 아키텍처 패턴을 정리한 가이드입니다.
date: 2025-04-29T00:00:00.000Z
updated: '2026-01-28'
tags:
  - aws
  - networking
  - vpc
  - terraform
category: aws
draft: false
lang: ko
source_lang: en
source_slug: vpc-networking-fundamentals
source_updated: 2026-01-27T00:00:00.000Z
translation_date: '2026-01-28'
references:
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/'
    title: AWS VPC 사용자 가이드
    type: official
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html'
    title: NAT Gateway 문서
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

## IP 주소와 CIDR

### CIDR 표기법 기초

IP 주소(IPv4)는 32비트 숫자로, 보통 점으로 구분된 4개의 옥텟으로 표기합니다 (예: `10.0.1.5`). 각 옥텟은 0-255 범위입니다.

CIDR (Classless Inter-Domain Routing) 표기법: `기본_주소/프리픽스_길이`

```text
예시: 10.0.0.0/24
- 10.0.0.0 = 기본 주소
- /24 = 처음 24비트가 네트워크 부분 (고정)
- 나머지 8비트 = 호스트 부분 (가변)
```

### 프리픽스 길이별 IP 주소 개수

| 프리픽스 | 호스트 비트 | 총 IP 수 | AWS 사용 가능 |
| -------- | ----------- | -------- | ------------- |
| /32 | 0 | 1 | 단일 IP |
| /28 | 4 | 16 | 11 |
| /27 | 5 | 32 | 27 |
| /26 | 6 | 64 | 59 |
| /25 | 7 | 128 | 123 |
| /24 | 8 | 256 | 251 |
| /23 | 9 | 512 | 507 |
| /22 | 10 | 1,024 | 1,019 |
| /16 | 16 | 65,536 | 일반적인 VPC 크기 |

공식: `2^(32-프리픽스_길이) = 총 IP 수`

### AWS 예약 IP

각 서브넷에서 AWS가 5개의 IP 주소를 예약합니다:

```text
10.0.1.0/24 서브넷:
10.0.1.0   - 네트워크 주소 (예약)
10.0.1.1   - AWS 게이트웨이 (예약)
10.0.1.2   - AWS DNS (예약)
10.0.1.3   - AWS 향후 사용 (예약)
10.0.1.255 - 브로드캐스트 주소 (예약)

사용 가능: 10.0.1.4 ~ 10.0.1.254 (251개)
```

---

## 서브넷 IP vs 연결 용량

**중요한 구분**: 서브넷 IP 개수 ≠ 연결 용량

- IP 주소는 배포할 수 있는 **리소스** 수를 제한 (EC2, RDS 등)
- 각 EC2 인스턴스는 수천 개의 동시 연결을 처리할 수 있음
- 연결 용량은 인스턴스 타입과 애플리케이션 설계에 따라 달라짐

예시 아키텍처:

```text
/24 서브넷 (251개 사용 가능 IP):
- 5개 EC2 인스턴스 (5 IP)
- 1개 RDS 인스턴스 (1 IP)
- 1개 ElastiCache (1 IP)
- 각 EC2가 2,000개 연결 처리
- 총 용량: ~10,000 동시 연결
```

---

## VPC 아키텍처

### 표준 VPC 설계

```terraform
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"  # 65,536 IP
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}
```

### 서브넷 레이아웃 컨벤션

```text
VPC: 10.0.0.0/16

Public 서브넷 (인터넷 연결):
├── 10.0.1.0/24  - AZ-a public
├── 10.0.2.0/24  - AZ-b public
├── 10.0.3.0/24  - AZ-c public
└── 10.0.4.0/24  - AZ-d public

Private 서브넷 (내부용):
├── 10.0.11.0/24 - AZ-a private
├── 10.0.12.0/24 - AZ-b private
├── 10.0.13.0/24 - AZ-c private
└── 10.0.14.0/24 - AZ-d private
```

**컨벤션의 장점:**

- 예측 가능한 IP 패턴
- IP만 보고 서브넷 용도 파악 가능
- 확장 여지 있음
- 명확한 보안 경계

---

## 네트워크 구성 요소

### Internet Gateway (IGW)

- VPC를 인터넷에 연결
- VPC당 하나만 가능 (하드 리밋)
- IP 주소 소비 없음
- public 서브넷의 인터넷 접근 활성화

```terraform
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

### NAT Gateway

NAT Gateway는 private 서브넷의 리소스가 인터넷에 접근할 수 있게 합니다 (아웃바운드만).

**중요한 배치 규칙**: NAT Gateway는 **public 서브넷**에 있어야 합니다.

<Mermaid code={`
flowchart LR
    subgraph Private["Private 서브넷"]
        EC2["EC2 인스턴스"]
    end
    subgraph Public["Public 서브넷"]
        NAT["NAT Gateway"]
    end
    IGW["Internet Gateway"]
    Internet["인터넷"]
    EC2 --> NAT
    NAT --> IGW
    IGW --> Internet
`} />

```terraform
# NAT Gateway용 EIP
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}

# NAT Gateway는 PUBLIC 서브넷에 배치
resource "aws_nat_gateway" "main" {
  subnet_id     = aws_subnet.public_a.id  # 반드시 public이어야 함!
  allocation_id = aws_eip.nat.id
  depends_on    = [aws_internet_gateway.main]
}
```

**비용 고려**: NAT Gateway는 월 ~$32 + 데이터 처리 비용. private 서브넷이 인터넷 접근이 필요할 때만 생성하세요.

### Elastic IP (EIP)

- 고정 public IP 주소
- 인스턴스 중지/시작해도 유지됨
- 실행 중인 인스턴스에 연결되면 무료
- 연결 안 되면 과금 (월 ~$3.6)

**EIP 대안:**

| 옵션 | 비용 | 사용 사례 |
| ---- | ---- | --------- |
| 기본 public IP | 무료 | 개발/테스트, LB 뒤 |
| EIP | 무료 (연결 시) | 고정 IP 필요 |
| Load Balancer | 월 ~$16 | 프로덕션 서비스 |
| Route 53 | 월 ~$0.50 | DNS 기반 라우팅 |

---

## Route Table

### Public Route Table

인터넷 트래픽을 IGW로 라우팅:

```terraform
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}
```

### Private Route Table

인터넷 트래픽을 NAT Gateway로 라우팅:

```terraform
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id  # 참고: gateway_id가 아님
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}
```

---

## 트래픽 흐름

### Public 서브넷 트래픽

```text
인터넷 → IGW → Public Route Table → Public 서브넷 → EC2
```

### Private 서브넷 아웃바운드

```text
EC2 (private) → Private Route Table → NAT Gateway → IGW → 인터넷
```

### Private 서브넷 인바운드 (ALB 통해)

```text
인터넷 → IGW → ALB (public) → EC2 (private)
```

---

## VPC 관련 AWS 비용

**무료 리소스:**

- VPC 자체
- 서브넷
- Route table
- Security group
- Network ACL
- Private IP 주소

**유료 리소스:**

- NAT Gateway (시간당 ~$0.045 + 데이터)
- Elastic IP (연결 안 됐을 때)
- 데이터 전송 (cross-AZ, 인터넷 아웃바운드)
- VPN 연결
- Transit Gateway

---

## 전체 VPC 예시

```terraform
# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}

# Public 서브넷
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = { Name = "public-subnet-a" }
}

# Private 서브넷
resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "ap-northeast-2a"
  tags = { Name = "private-subnet-a" }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags = { Name = "main-igw" }
}

# NAT Gateway (public 서브넷에 배치)
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  subnet_id     = aws_subnet.public_a.id
  allocation_id = aws_eip.nat.id
  depends_on    = [aws_internet_gateway.main]
  tags = { Name = "main-nat" }
}

# Public route table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "public-rt" }
}

# Private route table
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "private-rt" }
}

# 연결
resource "aws_route_table_association" "public_a" {
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}
```

---

## 참고 자료

- [AWS VPC 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [NAT Gateway 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)

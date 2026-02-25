---
title: "AWS VPC 네트워킹 기초"
description: "CIDR 계산, NAT Gateway 배치, Route Table — 왜 다들 처음에 헤매는지, 어떻게 제대로 잡는지 정리했어요."
date: 2025-04-29T00:00:00.000Z
updated: 2026-02-24T00:00:00.000Z
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
source_updated: "2026-02-24"
translation_date: "2026-02-25"
references:
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/"
    title: AWS VPC 사용자 가이드
    type: official
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"
    title: NAT Gateway 문서
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

AWS를 처음 쓸 때 Terraform으로 VPC, 서브넷 4개, NAT Gateway, Internet Gateway를 만들었는데 -- 어떤 리소스가 인터넷이 필요한 건지 전혀 감이 안 왔어요. "Private" 서브넷의 EC2가 외부와 통신되고(나쁨), "public" 서브넷의 EC2는 인터넷이 안 되더라고요(역시 나쁨). VPC 네트워킹은 쉬워 보이다가 갑자기 안 돼요.

핵심 문제는 VPC가 모든 AWS 서비스의 기반이라는 거예요. CIDR 블록을 너무 작게 잡으면 팀이 커질 때 IP가 부족해지고, NAT Gateway를 private 서브넷에 놓으면(논리적으로 맞아 보이지만) 라우팅이 전혀 안 돼요. Route table을 명시적으로 연결하지 않으면 "private" 서브넷이 main route table의 IGW 라우트를 상속받아서 -- 아무도 모르게 public이 되어버려요.

이 글에서는 VPC 네트워킹을 처음부터 다룰게요. CIDR 표기법, 서브넷 설계, 게이트웨이, Route Table, 그리고 직접 쓸 수 있는 Terraform 예시까지 정리했어요.

## IP 주소와 CIDR

서브넷을 설계하려면 IP 주소 범위가 어떻게 동작하는지 먼저 알아야 해요. 2의 거듭제곱으로 생각해야 하기 때문에 여기서 많이 헤매요.

### CIDR 표기법 기초

IP 주소(IPv4)는 32비트 숫자로, 점으로 구분된 4개의 옥텟으로 표기해요(예: `10.0.1.5`). 각 옥텟은 0-255 범위예요.

CIDR(Classless Inter-Domain Routing) 표기법은 기본 주소와 프리픽스 길이를 조합해요: `기본_주소/프리픽스_길이`

```text
예시: 10.0.0.0/24
- 10.0.0.0 = 기본 주소
- /24 = 처음 24비트가 네트워크 부분 (고정)
- 나머지 8비트 = 호스트 부분 (가변)
```

프리픽스 길이가 네트워크 식별자로 고정되는 비트 수를 알려줘요. 나머지 비트를 개별 호스트에 할당할 수 있어요.

### 프리픽스 길이별 IP 주소 개수

| 프리픽스 | 호스트 비트 | 총 IP 수 | AWS 사용 가능     |
| -------- | ----------- | -------- | ----------------- |
| /32      | 0           | 1        | 단일 IP           |
| /28      | 4           | 16       | 11                |
| /27      | 5           | 32       | 27                |
| /26      | 6           | 64       | 59                |
| /25      | 7           | 128      | 123               |
| /24      | 8           | 256      | 251               |
| /23      | 9           | 512      | 507               |
| /22      | 10          | 1,024    | 1,019             |
| /16      | 16          | 65,536   | 일반적인 VPC 크기 |

공식: `2^(32 - 프리픽스_길이) = 총 IP 수`

"AWS 사용 가능" 열이 총 IP 수보다 항상 적은 거 보이시죠? AWS가 모든 서브넷에서 주소를 예약하기 때문이에요.

### AWS 예약 IP

각 서브넷에서 AWS가 리소스에 할당할 수 없는 IP 5개를 예약해요:

```text
10.0.1.0/24 서브넷:
10.0.1.0   - 네트워크 주소 (예약)
10.0.1.1   - AWS 게이트웨이 (예약)
10.0.1.2   - AWS DNS (예약)
10.0.1.3   - AWS 향후 사용 (예약)
10.0.1.255 - 브로드캐스트 주소 (예약)

사용 가능: 10.0.1.4 ~ 10.0.1.254 (251개)
```

생각보다 중요해요. /28 서브넷은 16개 IP처럼 보이지만, AWS가 5개를 가져가면 실제로는 11개뿐이에요. 작은 클러스터를 운영한다면 확장 여지가 있느냐 없느냐의 차이가 돼요.

## 서브넷 IP vs 연결 용량

서브넷 크기와 트래픽 용량을 혼동하는 분이 정말 많아요. 이 둘은 완전히 다른 걸 측정해요.

**서브넷 IP 개수 ≠ 연결 용량**

- IP 주소는 배포할 수 있는 **리소스 수**를 제한해요(EC2, RDS 등)
- 각 EC2 인스턴스는 수천 개의 동시 연결을 처리할 수 있어요
- 연결 용량은 인스턴스 타입과 애플리케이션 설계에 따라 달라져요

실제로는 이런 모습이에요:

```text
/24 서브넷 (251개 사용 가능 IP):
- 5개 EC2 인스턴스 (5 IP)
- 1개 RDS 인스턴스 (1 IP)
- 1개 ElastiCache (1 IP)
- 각 EC2가 2,000개 연결 처리
- 총 용량: ~10,000 동시 연결
```

251개 IP를 가진 /24 서브넷으로 10,000명 이상의 동시 사용자를 처리할 수 있어요. 연결이 251개로 제한되는 게 아니에요. 서브넷 크기는 예상 트래픽이 아니라, 배포할 리소스 수를 기준으로 정하세요.

## VPC 아키텍처

CIDR과 서브넷을 이해했으니, VPC 자체를 어떻게 구성하는지 볼게요.

### 표준 VPC 설계

/16 블록은 65,536개 IP를 제공해요 -- 대부분의 프로덕션 워크로드에 충분해요:

```terraform
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"  # 65,536 IP
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}
```

### 서브넷 레이아웃 컨벤션

예측 가능한 번호 체계를 쓰면 나중에 디버깅 시간을 크게 줄일 수 있어요. 확장성이 좋은 패턴은 이래요:

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

세 번째 옥텟이 한 자리(1-4)면 public, 두 자리(11-14)면 private이에요. IP 주소만 보고도 어떤 서브넷인지 바로 알 수 있어서 스프레드시트를 뒤질 필요가 없어요.

## 네트워크 구성 요소

서브넷이 준비됐으니, 트래픽을 실제로 이동시킬 게이트웨이와 Route Table이 필요해요. 구성 요소부터 보고, 그다음에 연결해 볼게요.

### Internet Gateway (IGW)

Internet Gateway는 VPC의 정문이에요:

- VPC를 인터넷에 연결해요
- VPC당 하나만 가능해요(하드 리밋)
- IP 주소를 소비하지 않아요
- Public 서브넷의 인터넷 접근을 활성화해요

```terraform
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

IGW를 만든다고 바로 public이 되는 건 아니에요 -- 그건 곧 다룰 Route Table이 결정해요.

### NAT Gateway

NAT Gateway는 private 서브넷 리소스가 아웃바운드 트래픽(Docker 이미지 pull이나 외부 API 호출 등)으로 인터넷에 접근하면서도 외부에서는 접근 불가능하게 해줘요.

여기서 다들 헤매는 부분이에요: **NAT Gateway는 public 서브넷에 있어야 해요**, 리소스가 있는 private 서브넷이 아니라요. 거꾸로 같지만, NAT Gateway가 private 리소스의 트래픽을 프록시하려면 자기 자신이 먼저 인터넷에 접근(IGW를 통해)할 수 있어야 해요.

<Mermaid code={`flowchart LR
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
    IGW --> Internet`} />

```terraform
# NAT Gateway용 EIP
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}

# NAT Gateway는 PUBLIC 서브넷에 배치
resource "aws_nat_gateway" "main" {
  subnet_id     = aws_subnet.public_a.id  # 반드시 public이어야 해요!
  allocation_id = aws_eip.nat.id
  depends_on    = [aws_internet_gateway.main]
}
```

**비용을 주의하세요.** NAT Gateway 하나에 월 ~$32, 여기에 데이터 처리 비용이 추가돼요. 프로덕션 멀티 AZ 구성에서 AZ마다 하나씩 두면 데이터 비용 전에 월 ~$96이에요. 개발 환경이라면 private 서브넷에서 인터넷 접근이 정말 필요한지 먼저 생각해 보세요.

### IGW-to-EIP 의존성 순서

EIP와 NAT Gateway 리소스의 `depends_on`은 IP 할당과 관련 없어요. **생성 순서**에 관한 거예요. Internet Gateway가 VPC에 먼저 존재하고 연결되어야 EIP와 NAT Gateway를 만들 수 있어요. NAT Gateway가 동작하려면 인터넷 경로가 확보되어 있어야 하기 때문이에요.

**IGW와 EIP 핵심 사항:**

- IGW는 IP 주소를 소비하거나 할당하지 **않아요** -- VPC와 인터넷 사이의 논리적 연결 지점이에요
- VPC 하나에 IGW는 최대 하나(AWS 하드 리밋)
- EIP는 IGW에 연결되는 게 **아니에요** -- NAT Gateway(또는 EC2 인스턴스)에 연결돼요
- `depends_on`은 단일 의존성이라도 배열 문법을 사용해요

```hcl
resource "aws_eip" "nat" {
  domain     = "vpc"
  # 순서 보장: EIP 생성 전에 IGW가 존재해야 해요
  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  subnet_id     = aws_subnet.public_a.id
  allocation_id = aws_eip.nat.id
  # 같은 순서 보장: NAT GW 생성 전에 IGW가 존재해야 해요
  depends_on = [aws_internet_gateway.main]
}
```

`depends_on` 없이는 Terraform이 EIP와 NAT Gateway를 IGW와 병렬로 만들 수 있어요. AWS API가 비동기적이라서 간헐적 실패가 발생할 수 있어요 -- NAT Gateway 생성은 성공하지만 IGW가 완전히 연결되기 전까지 트래픽을 라우팅하지 못해요.

### Elastic IP (EIP)

Elastic IP는 인스턴스를 중지/시작해도 유지되는 고정 public IP예요. 실행 중인 인스턴스에 연결돼 있으면 무료지만, 연결 안 된 EIP는 월 ~$3.6이 과금돼요 -- Terraform으로 만들어 놓고 나중에 분리하면 슬며시 비용이 나가요.

### IP 설정 옵션 비교

AWS 리소스에 public IP를 부여하는 다섯 가지 방법이 있고, 비용과 유연성이 각각 달라요:

| 옵션                      | 비용                          | 고정 IP  | 중지/시작 유지 | 적합한 용도                |
| ------------------------- | ----------------------------- | -------- | -------------- | -------------------------- |
| 기본 Public IP            | 무료(EC2에 포함)              | 아니오   | 아니오         | 개발/테스트, LB 뒤         |
| Load Balancer + Public IP | LB 비용만(월 ~$16)            | DNS 이름 | 해당 없음      | 프로덕션 HA 클러스터       |
| Route 53 + 기본 Public IP | 월 ~$0.50 + 쿼리 비용         | DNS 이름 | 짧은 TTL 필요  | 저비용 도메인 라우팅       |
| Private IP + NAT Gateway  | NAT GW 공유(월 ~$32 + 데이터) | 아니오   | 해당 없음      | 백엔드 서비스, 직접 노출 X |
| Elastic IP(연결 시)       | 실행 중인 EC2에 연결하면 무료 | 예       | 예             | 고정 IP 필요(NAT GW, EC2)  |

**비용 기준 의사 결정 가이드:**

1. **고정 IP 불필요** -- 기본 public IP 사용(무료)
2. **서버 여러 대, 단일 엔드포인트** -- Load Balancer + 기본 public IP
3. **고정 이름 필요, IP 무관** -- Route 53 + 기본 public IP
4. **고정 IP 필요** -- Elastic IP(제대로 연결하면 무료)
5. **외부 노출 불필요** -- Private 서브넷 + 공유 NAT Gateway

**NAT Gateway EIP 참고:** Terraform 코드에서 NAT Gateway에 EIP를 사용하는데, 이건 필수예요. NAT Gateway가 private 서브넷의 아웃바운드 트래픽을 처리하려면 안정적인 public IP가 필요하기 때문이에요. NAT Gateway에 연결된 상태라면 이 EIP는 무료예요.

## Route Table

Route Table은 VPC의 트래픽 규칙이에요. 모든 서브넷은 트래픽의 목적지를 결정하는 Route Table과 연결돼요. "public vs private" 구분이 실제로 일어나는 곳은 서브넷 자체가 아니라, 서브넷에 연결된 Route Table이에요.

### Public Route Table

Public Route Table은 로컬이 아닌 모든 트래픽(`0.0.0.0/0`)을 Internet Gateway로 보내요:

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

Private Route Table은 아웃바운드 트래픽을 NAT Gateway로 보내요:

```terraform
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id  # gateway_id가 아님에 주의
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}
```

**꼭 알아둘 점:** Route Table과 명시적으로 연결되지 않은 서브넷은 VPC의 **main route table**을 사용해요. 누군가 main table에 IGW 라우트를 추가하면, 연결되지 않은 모든 서브넷이 명시적 변경 없이 public이 돼요. 항상 Route Table을 직접 만들어서 명시적으로 연결하세요 -- 기본값에 의존하면 안 돼요.

## 트래픽 흐름

패킷이 VPC를 통해 어떻게 이동하는지 이해하면 연결 문제를 훨씬 빨리 디버깅할 수 있어요. 세 가지 일반적인 패턴이에요:

### Public 서브넷 트래픽

```text
인터넷 -> IGW -> Public Route Table -> Public 서브넷 -> EC2
```

### Private 서브넷 아웃바운드

```text
EC2 (private) -> Private Route Table -> NAT Gateway -> IGW -> 인터넷
```

### Private 서브넷 인바운드 (ALB 경유)

```text
인터넷 -> IGW -> ALB (public) -> EC2 (private)
```

ALB 패턴이 대부분의 프로덕션 애플리케이션에서 쓰이는 방식이에요. 로드 밸런서가 public 서브넷에서 트래픽을 받고, 실제 애플리케이션 서버는 외부에서 직접 접근할 수 없는 private 서브넷에 있어요.

## VPC 관련 AWS 비용

어떤 게 돈이 드는지 알아두면 AWS 요금 폭탄을 피할 수 있어요.

**무료 리소스:**

- VPC 자체
- 서브넷
- Route Table
- Security Group
- Network ACL
- Private IP 주소

**유료 리소스:**

- NAT Gateway(시간당 ~$0.045 + 데이터)
- Elastic IP(연결 안 됐을 때)
- 데이터 전송(cross-AZ, 인터넷 아웃바운드)
- VPN 연결
- Transit Gateway

가장 흔한 요금 폭탄은 NAT Gateway예요. 항상 켜져 있고, 항상 과금되고, 아웃바운드 트래픽이 많으면 데이터 처리 비용이 빠르게 쌓여요.

## 전체 VPC 예시

여기까지 다룬 내용을 모두 연결한 프로덕션 수준의 Terraform 설정이에요. 이걸 시작점으로 AZ를 추가하거나 애플리케이션별 리소스를 확장하면 돼요:

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

## 실전 정리

VPC는 AWS 인프라의 기반이에요. 처음에 제대로 잡는 게 중요한데 -- 서비스가 돌아가는 상태에서 CIDR 블록과 서브넷을 바꾸는 건 정말 고통스러워요.

**커스텀 VPC를 쓸 때:** 네트워크 격리가 필요한 컴퓨팅 리소스(EC2, ECS, RDS)를 배포하거나, public과 내부 전용 티어로 나뉘는 멀티 티어 아키텍처를 구성하거나, 데이터베이스와 애플리케이션 서버용 private 서브넷이 있는 프로덕션 환경에서 사용하세요.

**커스텀 VPC를 안 써도 될 때:** 서버리스 전용 스택(Lambda + DynamoDB + S3)이라면 VPC를 추가하면 콜드 스타트 지연이 늘어나요. S3 + CloudFront 정적 사이트도 VPC가 필요 없어요. 빠른 프로토타이핑에는 기본 VPC로 충분해요.

**꼭 피해야 할 실수 세 가지:**

1. NAT Gateway를 private 서브넷에 놓는 것 -- public 서브넷에 있어야 해요
2. Main route table에 의존하는 것 -- 항상 Route Table을 직접 만들어서 명시적으로 연결하세요
3. 개발 환경에 NAT Gateway를 만드는 것 -- 월 $32씩, 아웃바운드 인터넷 접근이 필요 없는 리소스에는 낭비예요

## 참고 자료

- [AWS VPC 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [NAT Gateway 공식 문서](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)

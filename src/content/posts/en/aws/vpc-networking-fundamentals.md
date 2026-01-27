---
title: AWS VPC Networking Fundamentals
description: 'Comprehensive guide to AWS VPC networking concepts, CIDR notation, and network'
date: 2025-04-29T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - aws
  - networking
  - vpc
  - terraform
category: aws
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/'
    title: userguide
    type: official
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html'
    title: vpc nat gateway.html
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

## IP Addressing and CIDR

### CIDR Notation Basics

IP addresses (IPv4) are 32-bit numbers, typically written as 4 octets separated
by dots (e.g., `10.0.1.5`). Each octet ranges from 0-255.

CIDR (Classless Inter-Domain Routing) notation: `base_address/prefix_length`

```text
Example: 10.0.0.0/24
- 10.0.0.0 = base address
- /24 = first 24 bits are network portion (fixed)
- Remaining 8 bits = host portion (variable)
```

### Prefix Length to IP Address Count

| Prefix | Host Bits | Total IPs | AWS Usable |
| ------ | --------- | --------- | ---------- |
| /32 | 0 | 1 | Single IP |
| /28 | 4 | 16 | 11 |
| /27 | 5 | 32 | 27 |
| /26 | 6 | 64 | 59 |
| /25 | 7 | 128 | 123 |
| /24 | 8 | 256 | 251 |
| /23 | 9 | 512 | 507 |
| /22 | 10 | 1,024 | 1,019 |
| /16 | 16 | 65,536 | Common VPC size |

Formula: `2^(32-prefix_length) = total IPs`

### AWS Reserved IPs

In each subnet, AWS reserves 5 IP addresses:

```text
10.0.1.0/24 subnet:
10.0.1.0   - Network address (reserved)
10.0.1.1   - AWS gateway (reserved)
10.0.1.2   - AWS DNS (reserved)
10.0.1.3   - AWS future use (reserved)
10.0.1.255 - Broadcast address (reserved)

Usable: 10.0.1.4 to 10.0.1.254 (251 addresses)
```

---

## Subnet IP vs Connection Capacity

**Important clarification**: Subnet IP count ≠ connection capacity.

- IP addresses limit **resources** you can deploy (EC2, RDS, etc.)
- Each EC2 instance can handle thousands of concurrent connections
- Connection capacity depends on instance type and application design

Example architecture:

```text
/24 subnet (251 usable IPs):
- 5 EC2 instances (5 IPs)
- 1 RDS instance (1 IP)
- 1 ElastiCache (1 IP)
- Each EC2 handles 2,000 connections
- Total capacity: ~10,000 concurrent connections
```

---

## VPC Architecture

### Standard VPC Design

```terraform
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"  # 65,536 IPs
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}
```

### Subnet Layout Convention

```text
VPC: 10.0.0.0/16

Public Subnets (internet-facing):
├── 10.0.1.0/24  - AZ-a public
├── 10.0.2.0/24  - AZ-b public
├── 10.0.3.0/24  - AZ-c public
└── 10.0.4.0/24  - AZ-d public

Private Subnets (internal):
├── 10.0.11.0/24 - AZ-a private
├── 10.0.12.0/24 - AZ-b private
├── 10.0.13.0/24 - AZ-c private
└── 10.0.14.0/24 - AZ-d private
```

**Convention benefits:**

- Predictable IP patterns
- Easy to identify subnet purpose from IP
- Room for expansion
- Clear security boundaries

---

## Network Components

### Internet Gateway (IGW)

- Connects VPC to the internet
- One IGW per VPC (hard limit)
- No IP address consumption
- Enables public subnet internet access

```terraform
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

### NAT Gateway

NAT Gateway enables private subnet resources to access the internet (outbound
only).

**Critical placement rule**: NAT Gateway must be in a **public subnet**.

<Mermaid code={`
flowchart LR
    subgraph Private["Private Subnet"]
        EC2["EC2 Instance"]
    end
    subgraph Public["Public Subnet"]
        NAT["NAT Gateway"]
    end
    IGW["Internet Gateway"]
    Internet["Internet"]
    EC2 --> NAT
    NAT --> IGW
    IGW --> Internet
`} />

```terraform
# EIP for NAT Gateway
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]
}

# NAT Gateway in PUBLIC subnet
resource "aws_nat_gateway" "main" {
  subnet_id     = aws_subnet.public_a.id  # Must be public!
  allocation_id = aws_eip.nat.id
  depends_on    = [aws_internet_gateway.main]
}
```

**Cost consideration**: NAT Gateway costs ~$32/month + data processing fees.
Only create if private subnets need internet access.

### Elastic IP (EIP)

- Static public IP address
- Persists across instance stop/start
- Free when attached to running instance
- Charged when unattached (~$3.6/month)

**Alternatives to EIP:**

| Option | Cost | Use Case |
| ------ | ---- | -------- |
| Default public IP | Free | Dev/test, behind LB |
| EIP | Free (attached) | Fixed IP requirement |
| Load Balancer | ~$16/month | Production services |
| Route 53 | ~$0.50/month | DNS-based routing |

---

## Route Tables

### Public Route Table

Routes internet traffic through IGW:

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

Routes internet traffic through NAT Gateway:

```terraform
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id  # Note: nat_gateway_id, not gateway_id
  }
}

resource "aws_route_table_association" "private_a" {
  subnet_id      = aws_subnet.private_a.id
  route_table_id = aws_route_table.private.id
}
```

---

## Traffic Flow

### Public Subnet Traffic

```text
Internet → IGW → Public Route Table → Public Subnet → EC2
```

### Private Subnet Outbound

```text
EC2 (private) → Private Route Table → NAT Gateway → IGW → Internet
```

### Private Subnet Inbound (via ALB)

```text
Internet → IGW → ALB (public) → EC2 (private)
```

---

## AWS Billing for VPC

**Free resources:**

- VPC itself
- Subnets
- Route tables
- Security groups
- Network ACLs
- Private IP addresses

**Charged resources:**

- NAT Gateway (~$0.045/hour + data)
- Elastic IP (when unattached)
- Data transfer (cross-AZ, internet egress)
- VPN connections
- Transit Gateway

---

## Complete VPC Example

```terraform
# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}

# Public subnet
resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-northeast-2a"
  map_public_ip_on_launch = true
  tags = { Name = "public-subnet-a" }
}

# Private subnet
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

# NAT Gateway (in public subnet)
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

# Associations
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

## References

- [AWS VPC Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [NAT Gateway Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)

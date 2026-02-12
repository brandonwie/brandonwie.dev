---
title: AWS VPC Networking Fundamentals
description: "Comprehensive guide to AWS VPC networking concepts, CIDR notation, and network"
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
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/"
    title: userguide
    type: official
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"
    title: vpc nat gateway.html
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

When I first set up AWS infrastructure with Terraform, I created a VPC, four subnets, a NAT Gateway, and an Internet Gateway -- with no real understanding of which resources needed internet access. My "private" subnet EC2 instances could reach the outside world (bad), and my "public" subnet EC2 instances could not reach the internet (also bad). VPC networking looks straightforward until it stops working.

The core problem is that VPC is the foundation every other AWS service builds on. Size the CIDR block too small and you run out of IPs as the team grows. Put the NAT Gateway in the private subnet (which seems logical) and routing breaks entirely. Skip the explicit route table association and your "private" subnet inherits the main route table's IGW route -- becoming public without anyone noticing.

This post covers VPC networking from the ground up: CIDR notation, subnet design, gateways, route tables, and Terraform examples you can use directly.

## IP Addressing and CIDR

Before designing subnets, you need to understand how IP address ranges work. This is where most people stumble, because it requires thinking in powers of two.

### CIDR Notation Basics

IP addresses (IPv4) are 32-bit numbers, typically written as 4 octets separated by dots (e.g., `10.0.1.5`). Each octet ranges from 0-255.

CIDR (Classless Inter-Domain Routing) notation combines a base address with a prefix length: `base_address/prefix_length`

```text
Example: 10.0.0.0/24
- 10.0.0.0 = base address
- /24 = first 24 bits are network portion (fixed)
- Remaining 8 bits = host portion (variable)
```

The prefix length tells you how many bits are locked as the network identifier. The remaining bits are available for individual hosts.

### Prefix Length to IP Address Count

| Prefix | Host Bits | Total IPs | AWS Usable      |
| ------ | --------- | --------- | --------------- |
| /32    | 0         | 1         | Single IP       |
| /28    | 4         | 16        | 11              |
| /27    | 5         | 32        | 27              |
| /26    | 6         | 64        | 59              |
| /25    | 7         | 128       | 123             |
| /24    | 8         | 256       | 251             |
| /23    | 9         | 512       | 507             |
| /22    | 10        | 1,024     | 1,019           |
| /16    | 16        | 65,536    | Common VPC size |

Formula: `2^(32-prefix_length) = total IPs`

Notice the "AWS Usable" column is always less than total IPs. That is because AWS reserves addresses in every subnet.

### AWS Reserved IPs

In each subnet, AWS reserves 5 IP addresses that you cannot assign to resources:

```text
10.0.1.0/24 subnet:
10.0.1.0   - Network address (reserved)
10.0.1.1   - AWS gateway (reserved)
10.0.1.2   - AWS DNS (reserved)
10.0.1.3   - AWS future use (reserved)
10.0.1.255 - Broadcast address (reserved)

Usable: 10.0.1.4 to 10.0.1.254 (251 addresses)
```

This matters more than you think. A /28 subnet looks like 16 IPs, but after AWS takes 5, you only get 11. For a small cluster, that is the difference between having room to grow and hitting a ceiling.

## Subnet IP vs Connection Capacity

A confusion I see constantly: people equate subnet size with traffic capacity. These measure completely different things.

**Subnet IP count does not equal connection capacity.**

- IP addresses limit the **resources** you can deploy (EC2, RDS, etc.)
- Each EC2 instance can handle thousands of concurrent connections
- Connection capacity depends on instance type and application design

In practice, it looks like this:

```text
/24 subnet (251 usable IPs):
- 5 EC2 instances (5 IPs)
- 1 RDS instance (1 IP)
- 1 ElastiCache (1 IP)
- Each EC2 handles 2,000 connections
- Total capacity: ~10,000 concurrent connections
```

A /24 subnet with 251 IPs can serve 10,000+ concurrent users. The 251 IPs do not limit you to 251 connections. Size subnets based on how many resources you plan to deploy, not expected traffic volume.

## VPC Architecture

With CIDR and subnets understood, here is how to structure the VPC itself.

### Standard VPC Design

A /16 block gives you 65,536 IPs -- enough for most production workloads:

```terraform
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"  # 65,536 IPs
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}
```

### Subnet Layout Convention

A predictable numbering scheme saves debugging time later. Here is a pattern that scales well:

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

The third octet tells you the subnet type at a glance: single digit (1-4) is public, double digit (11-14) is private. You can identify which subnet a resource is in from its IP alone, without digging through a spreadsheet.

## Network Components

With subnets in place, you need gateways and route tables to actually move traffic. Let me cover the components first, then how they connect.

### Internet Gateway (IGW)

The Internet Gateway is the front door of your VPC:

- Connects VPC to the internet
- One IGW per VPC (hard limit)
- No IP address consumption
- Enables public subnet internet access

```terraform
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

Creating an IGW does not make anything public by itself -- that is determined by route tables, which I will cover next.

### NAT Gateway

NAT Gateway enables private subnet resources to access the internet for outbound traffic (like pulling Docker images or calling external APIs) while remaining unreachable from outside.

Here is where most people get confused: **the NAT Gateway must live in a public subnet**, not the private subnet where the resources that need it are. It seems backwards, but the NAT Gateway needs internet access itself (via the IGW) to proxy traffic for private resources.

<Mermaid code={`flowchart LR
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
    IGW --> Internet`} />

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

**Watch the cost.** A single NAT Gateway runs ~$32/month plus data processing fees. For a production multi-AZ setup with one per AZ, that is ~$96/month before data costs. For dev environments, think carefully about whether your private subnets actually need internet access.

### Elastic IP (EIP)

An Elastic IP is a static public IP that persists across instance stop/start cycles. It is free when attached to a running instance but costs ~$3.6/month when unattached -- a sneaky cost if you create one in Terraform and later detach it.

| Option            | Cost            | Use Case             |
| ----------------- | --------------- | -------------------- |
| Default public IP | Free            | Dev/test, behind LB  |
| EIP               | Free (attached) | Fixed IP requirement |
| Load Balancer     | ~$16/month      | Production services  |
| Route 53          | ~$0.50/month    | DNS-based routing    |

## Route Tables

Route tables are the traffic rules of your VPC. Every subnet is associated with a route table that determines where traffic goes. The "public vs private" distinction is not inherent to the subnet itself -- it is determined by which route table the subnet is associated with.

### Public Route Table

The public route table sends all non-local traffic (`0.0.0.0/0`) to the Internet Gateway:

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

The private route table sends outbound traffic through the NAT Gateway:

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

**Critical gotcha:** Subnets not explicitly associated with a route table use the VPC's **main route table**. If someone adds an IGW route to the main table, every unassociated subnet becomes public with no explicit change. Always create and explicitly associate route tables -- never rely on the default.

## Traffic Flow

Understanding how packets move through the VPC makes debugging connectivity issues much faster. Here are the three common patterns:

### Public Subnet Traffic

```text
Internet -> IGW -> Public Route Table -> Public Subnet -> EC2
```

### Private Subnet Outbound

```text
EC2 (private) -> Private Route Table -> NAT Gateway -> IGW -> Internet
```

### Private Subnet Inbound (via ALB)

```text
Internet -> IGW -> ALB (public) -> EC2 (private)
```

The ALB pattern is how most production applications work. The load balancer sits in the public subnet accepting traffic, while the actual application servers are in private subnets where they cannot be reached directly from the internet.

## AWS Billing for VPC

Knowing what costs money helps avoid surprise bills:

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

The most common surprise bill is NAT Gateway. It is always on, always charging, and data processing fees add up fast if you have significant outbound traffic.

## Complete VPC Example

Here is a production-ready Terraform configuration that ties everything together. Use this as a starting point and add more AZs or application-specific resources as needed:

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

## Practical Takeaway

VPC is the foundation of AWS infrastructure. Getting it right early matters -- changing CIDR blocks and subnet layouts with running services is painful.

**Use a custom VPC when:** You are deploying compute resources (EC2, ECS, RDS) that need network isolation, building multi-tier architectures with public and internal-only tiers, or running production environments with private subnets for databases and application servers.

**Skip the custom VPC when:** You are running a serverless-only stack (Lambda + DynamoDB + S3) where adding a VPC increases cold start latency, hosting static sites with S3 + CloudFront, or doing quick prototyping where the default VPC is sufficient.

**Three mistakes to avoid:**

1. Putting the NAT Gateway in a private subnet -- it must be in a public subnet
2. Relying on the main route table -- always create and explicitly associate route tables
3. Creating NAT Gateways for dev environments -- that is $32/month per gateway for resources that may not need outbound internet access

## References

- [AWS VPC Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [NAT Gateway Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)

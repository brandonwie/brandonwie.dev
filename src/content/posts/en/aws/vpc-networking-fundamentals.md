---
title: AWS VPC Networking Fundamentals
description: "Why CIDR math, NAT Gateway placement, and route tables trip up every developer — and how to get them right from the start."
date: 2025-04-29T00:00:00.000Z
updated: 2026-02-12T00:00:00.000Z
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
    title: AWS VPC User Guide
    type: official
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"
    title: NAT Gateway Documentation
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

I spent my first week with AWS staring at a Terraform plan that created a VPC, four subnets, a NAT Gateway, and an Internet Gateway — with no idea which resources actually needed internet access. My EC2 instance in a "private" subnet could reach the outside world (bad), and the one in a "public" subnet couldn't (also bad). VPC networking looked straightforward until it wasn't.

The root problem is that VPC is the foundation every other AWS service builds on. Get the CIDR block too small and you run out of IPs when the team scales. Put the NAT Gateway in the private subnet (where it seems logical) and nothing routes correctly. Forget to explicitly associate a route table and your "private" subnet silently inherits the main table's Internet Gateway route — making it public without anyone noticing.

This post walks through VPC networking from the ground up: CIDR notation, subnet design, gateways, route tables, and a complete Terraform example you can adapt for your own infrastructure.

## IP Addressing and CIDR

Before you can design subnets, you need to understand how IP address ranges work. This is the part that trips most people up because it requires thinking in powers of two.

### CIDR Notation Basics

IP addresses (IPv4) are 32-bit numbers, typically written as 4 octets separated by dots (e.g., `10.0.1.5`). Each octet ranges from 0-255.

CIDR (Classless Inter-Domain Routing) notation combines a base address with a prefix length: `base_address/prefix_length`

```text
Example: 10.0.0.0/24
- 10.0.0.0 = base address
- /24 = first 24 bits are network portion (fixed)
- Remaining 8 bits = host portion (variable)
```

The prefix length tells you how many bits are locked in as the network identifier. The remaining bits are yours to assign to individual hosts.

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

Formula: `2^(32 - prefix_length) = total IPs`

Notice the "AWS Usable" column — it's always less than the total. That's because AWS reserves addresses in every subnet.

### AWS Reserved IPs

In each subnet, AWS reserves 5 IP addresses that you cannot assign to your resources:

```text
10.0.1.0/24 subnet:
10.0.1.0   - Network address (reserved)
10.0.1.1   - AWS gateway (reserved)
10.0.1.2   - AWS DNS (reserved)
10.0.1.3   - AWS future use (reserved)
10.0.1.255 - Broadcast address (reserved)

Usable: 10.0.1.4 to 10.0.1.254 (251 addresses)
```

This matters more than you'd think. A /28 subnet looks like it gives you 16 IPs, but after AWS takes its 5, you only have 11. If you're running a small cluster, that can be the difference between having room to grow and needing to re-architect your subnets.

## Subnet IP vs Connection Capacity

One of the most common misconceptions is equating subnet size with traffic capacity. They measure completely different things.

**Subnet IP count ≠ connection capacity.**

- IP addresses limit **how many resources** you can deploy (EC2, RDS, etc.)
- Each EC2 instance can handle thousands of concurrent connections
- Connection capacity depends on instance type and application design

Here's what this looks like in practice:

```text
/24 subnet (251 usable IPs):
- 5 EC2 instances (5 IPs)
- 1 RDS instance (1 IP)
- 1 ElastiCache (1 IP)
- Each EC2 handles 2,000 connections
- Total capacity: ~10,000 concurrent connections
```

A /24 subnet with 251 IPs can serve 10,000+ concurrent users — you're not limited to 251 connections. Size your subnets based on how many resources you need to deploy, not how much traffic you expect.

## VPC Architecture

With CIDR and subnets understood, let's look at how to structure the VPC itself.

### Standard VPC Design

A /16 block gives you 65,536 IPs — plenty of room for most production workloads:

```terraform
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"  # 65,536 IPs
  enable_dns_hostnames = true
  tags = { Name = "production-vpc" }
}
```

### Subnet Layout Convention

A predictable numbering convention saves hours of debugging later. Here's a pattern that scales well:

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

Single-digit third octets (1-4) for public, double-digit (11-14) for private. Anyone looking at an IP address can immediately tell which subnet type it belongs to — no need to cross-reference a spreadsheet.

## Network Components

Now that subnets are in place, they need gateways and route tables to actually move traffic. Let's start with the components, then wire them together.

### Internet Gateway (IGW)

The Internet Gateway is the front door of your VPC:

- Connects your VPC to the public internet
- One IGW per VPC (hard limit)
- Consumes no IP addresses
- Enables public subnet internet access

```terraform
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}
```

Creating an IGW alone doesn't make anything public — that's determined by route tables, which we'll cover shortly.

### NAT Gateway

NAT Gateway enables private subnet resources to reach the internet for outbound traffic (like pulling Docker images or calling external APIs) while remaining unreachable from the outside.

Here's the part that trips everyone up: **the NAT Gateway must live in a public subnet**, not the private subnet where your resources are. It seems backwards, but the NAT Gateway needs its own internet access (via the IGW) before it can proxy traffic for private resources.

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

**Watch the costs.** A single NAT Gateway runs ~$32/month plus data processing fees. In a production multi-AZ setup with one NAT Gateway per AZ, that's ~$96/month before any data charges. For dev environments, consider whether you actually need private subnet internet access at all.

### Elastic IP (EIP)

An Elastic IP is a static public IP that persists across instance stop/start cycles. It's free while attached to a running instance, but AWS charges ~$3.6/month for unattached EIPs — a subtle cost that catches teams who create EIPs in Terraform and later detach them.

| Option            | Cost            | Use Case             |
| ----------------- | --------------- | -------------------- |
| Default public IP | Free            | Dev/test, behind LB  |
| EIP               | Free (attached) | Fixed IP requirement |
| Load Balancer     | ~$16/month      | Production services  |
| Route 53          | ~$0.50/month    | DNS-based routing    |

## Route Tables

Route tables are the traffic rules of your VPC. Every subnet is associated with a route table that determines where its traffic goes. This is where the "public vs private" distinction actually happens — not in the subnet itself, but in the route table attached to it.

### Public Route Table

A public route table sends all non-local traffic (`0.0.0.0/0`) to the Internet Gateway:

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

A private route table sends outbound traffic through the NAT Gateway instead:

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

**A critical gotcha:** subnets that aren't explicitly associated with a route table use the VPC's **main route table**. If someone adds an IGW route to the main table, every unassociated subnet becomes public without anyone explicitly changing it. Always create and explicitly associate route tables — never rely on the default.

## Traffic Flow

Understanding how packets move through the VPC makes debugging connectivity issues much faster. Here are the three common patterns:

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

The ALB pattern is how most production applications work: the load balancer sits in a public subnet accepting traffic, while the actual application servers stay in private subnets where they can't be directly reached from the internet.

## AWS Billing for VPC

Understanding what costs money helps you avoid surprises on your AWS bill.

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

The most common budget surprise is NAT Gateway. It's always running, always charging, and the data processing fees add up fast with heavy outbound traffic.

## Complete VPC Example

Here's a production-ready Terraform configuration that ties everything together. You can use this as a starting point and extend it with additional AZs and application-specific resources:

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

VPC is the foundation of your AWS infrastructure, and it's worth getting right the first time — restructuring CIDR blocks and subnets after services are running is painful.

**Use a custom VPC when** you're deploying any compute resources (EC2, ECS, RDS) that need network isolation, building multi-tier architectures with public-facing and internal-only resources, or running production environments with private subnets for databases and application servers.

**Skip the custom VPC when** you're building a serverless-only stack (Lambda + DynamoDB + S3) where adding a VPC increases cold start latency. Static sites on S3 + CloudFront don't need a VPC either. And for quick prototyping, the default VPC works fine.

**The three mistakes to avoid:**

1. Putting the NAT Gateway in the private subnet — it needs to be in a public subnet
2. Relying on the main route table — always create and explicitly associate route tables
3. Creating NAT Gateways in dev environments — at $32/month each, they add up fast for resources that might not need outbound internet access

## References

- [AWS VPC Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/)
- [NAT Gateway Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)

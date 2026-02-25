---
title: AWS Security Groups Fundamentals
description: 'Security Groups are virtual firewalls for AWS resources, controlling inbound'
date: 2025-04-29T00:00:00.000Z
updated: 2026-02-19T00:00:00.000Z
tags:
  - aws
  - security
  - networking
category: aws
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'
    title: vpc security groups.html
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: security group rules reference.html
    type: official
---

(ingress) and outbound (egress) traffic at the instance level.

---

## The Problem

Every AWS resource in a VPC needs network-level access control. Without properly
configured security groups, resources are either exposed to the entire internet
(security risk) or completely unreachable (broken connectivity). Understanding
security groups is essential because misconfigured rules are the most common
cause of "it works locally but not on AWS" issues, and overly permissive rules
are a top finding in AWS security audits.

---

## Difficulties Encountered

- **Stateful behavior is confusing at first** -- if you allow inbound on port
  443, the response traffic is automatically allowed outbound without an
  explicit egress rule; this is unintuitive coming from traditional firewall
  experience where you configure both directions
- **Default deny vs default allow asymmetry** -- inbound defaults to deny-all
  while outbound defaults to allow-all; forgetting this leads to either
  wondering why nothing connects (missing ingress) or assuming you have egress
  restrictions when you do not
- **Security group references vs CIDR blocks** -- using CIDR blocks for
  inter-service communication (e.g., app-to-database) breaks when IPs change;
  security group references auto-update but the syntax is different and easy to
  confuse in Terraform
- **Debugging connectivity is opaque** -- security group denials produce no logs
  by default (unlike NACLs); VPC Flow Logs must be explicitly enabled to see
  rejected traffic, and even then the logs do not tell you which security group
  rule caused the rejection
- **Rule limits are easy to hit** -- the default limit is 60 rules per security
  group and 5 security groups per ENI; consolidating rules requires
  understanding port ranges and CIDR aggregation

---

## When to Use

- Controlling access to any VPC resource (EC2, RDS, ECS, Lambda in VPC, etc.)
- Implementing least-privilege network access between service tiers
- Restricting database access to only application servers
- Limiting SSH/RDP access to specific IP ranges or bastion hosts

---

## When NOT to Use

- **Subnet-level traffic control** -- security groups operate per-ENI (instance
  level); use Network ACLs (NACLs) for subnet-wide rules that apply to all
  resources in a subnet
- **Blocking specific IP addresses** -- security groups only allow (no deny
  rules); use NACLs for explicit deny rules to block known bad actors
- **Rate limiting or DDoS protection** -- security groups have no concept of
  request rate; use AWS WAF or Shield for rate-based rules
- **Application-layer filtering** -- security groups work at L3/L4 (IP and
  port); use ALB rules or WAF for HTTP path/header-based access control
- **Cross-VPC or cross-account rules** -- security group references only work
  within the same VPC (or peered VPCs with specific configuration); use VPC
  endpoints or Transit Gateway for cross-boundary access

---

## Core Concepts

### Stateful Firewall

Security Groups are **stateful**:

- If inbound traffic is allowed, response traffic is automatically allowed
- No need to create matching egress rules for responses
- Simplifies rule management

### Default Behavior

- **Inbound**: All traffic denied by default
- **Outbound**: All traffic allowed by default

---

## Ingress Rules (Inbound)

Control traffic **entering** the resource:

```hcl
ingress {
  description = "PostgreSQL from VPC"
  from_port   = 5432
  to_port     = 5432
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

**Parameters:**

- `from_port` / `to_port`: Port range (same for single port)
- `protocol`: `tcp`, `udp`, `icmp`, or `-1` (all)
- `cidr_blocks`: Source IP ranges
- `security_groups`: Source security groups (preferred)

---

## Egress Rules (Outbound)

Control traffic **leaving** the resource:

```hcl
# Allow all outbound (common default)
egress {
  from_port        = 0
  to_port          = 0
  protocol         = "-1"
  cidr_blocks      = ["0.0.0.0/0"]
  ipv6_cidr_blocks = ["::/0"]
}
```

**Special values:**

- `from_port = 0, to_port = 0, protocol = "-1"`: All traffic
- `cidr_blocks = ["0.0.0.0/0"]`: All IPv4 destinations
- `ipv6_cidr_blocks = ["::/0"]`: All IPv6 destinations

---

## Security Best Practices

### 1. Principle of Least Privilege

```hcl
# BAD: Too permissive
ingress {
  from_port   = 0
  to_port     = 65535
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]  # All IPs, all ports
}

# GOOD: Specific and minimal
ingress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]  # VPC only
}
```

### 2. Use Security Group References

Prefer referencing other security groups over CIDR blocks:

```hcl
# Database only accepts traffic from app servers
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.app_servers.id]
}
```

**Benefits:**

- Auto-updates when source IPs change
- Clearer intent (app → db)
- Easier to audit

### 3. Restrict SSH/RDP Access

```hcl
# Allow SSH only from company IP range
ingress {
  description = "SSH from office"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["203.0.113.0/24"]  # Office IP range
}
```

### 4. Limit Egress When Possible

```hcl
# Only allow HTTPS outbound to specific service
egress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["54.239.28.85/32"]  # Specific service IP
}
```

---

## Common Patterns

### Web Server Security Group

```hcl
resource "aws_security_group" "web" {
  name        = "web-server-sg"
  description = "Security group for web servers"
  vpc_id      = aws_vpc.main.id

  # HTTP from anywhere
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS from anywhere
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH from bastion only
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  # All outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

### Database Security Group

```hcl
resource "aws_security_group" "database" {
  name        = "database-sg"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.main.id

  # PostgreSQL from app servers only
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # No direct outbound needed for RDS
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

  # HTTPS from internet
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Health checks to target group
  egress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}
```

---

## Inline vs Standalone Rules in Terraform

Terraform offers two ways to manage SG rules. The choice has critical
implications for how Terraform handles drift.

### Inline Rules (inside `aws_security_group`)

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

**Behavior:** If ANY inline `ingress` block exists, Terraform manages ALL
ingress rules on this SG. During `terraform plan`, it refreshes from AWS and
removes any rule not in code.

### Standalone Rules (`aws_security_group_rule`)

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

**Behavior:** Each rule is an independent resource. The parent SG doesn't know
about them. Other rules (manual or from other standalone resources) are not
affected.

### The Critical Rule

| Inline ingress blocks | Terraform behavior                                        |
| --------------------- | --------------------------------------------------------- |
| 1 or more             | Manages ALL ingress — removes unrecognized rules          |
| Zero                  | Does NOT manage ingress — ignores manual/standalone rules |

Same applies independently for `egress`.

### When to Use Standalone

- **Circular dependencies:** SG A references SG B and vice versa. Inline blocks
  create a cycle. Extract one direction to standalone.
- **Mixed ownership:** Some rules are Terraform-managed, others are
  manually-managed (e.g., developer IPs). Use zero inline blocks + standalone
  for Terraform rules + `lifecycle { ignore_changes = [ingress] }` for manual
  rules.
- **Cross-module references:** When a rule needs to reference a SG from another
  module, standalone rules avoid tight coupling.

### Import ID Format

`{sg_id}_{type}_{protocol}_{from_port}_{to_port}_{source}`

Example: `sg-abc123_ingress_tcp_22_22_sg-def456`

---

## Debugging Tips

```bash
# Check security group rules
aws ec2 describe-security-groups \
  --group-ids sg-1234567890abcdef0

# Check inbound rules
aws ec2 describe-security-group-rules \
  --filters Name=group-id,Values=sg-1234567890abcdef0

# Test connectivity
nc -zv <ip> <port>  # From source
telnet <ip> <port>  # Alternative
```

---

## References

- [AWS Security Groups Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [Security Group Rules Reference](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html)

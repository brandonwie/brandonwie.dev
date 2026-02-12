---
title: AWS Security Groups Fundamentals
description: "Security Groups are virtual firewalls for AWS resources, controlling inbound"
date: 2025-04-29T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - aws
  - security
  - networking
category: aws
draft: false
lang: en
references:
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html"
    title: vpc security groups.html
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: security group rules reference.html
    type: official
---

I deployed an ECS service, configured the task definition, verified the container was healthy -- and nothing could reach it. No error, no timeout message, just silence. After an hour of checking code, environment variables, and DNS, I realized the security group had no ingress rule for the application port. One missing rule, zero helpful error messages.

Security groups are the most common cause of "it works locally but not on AWS" issues, and they produce no logs when they block traffic.

## Why This Matters

Every AWS resource in a VPC needs network-level access control. Without properly configured security groups, resources are either exposed to the entire internet (security risk) or completely unreachable (broken connectivity). Misconfigured rules are a top finding in AWS security audits, and overly permissive rules like `0.0.0.0/0` on all ports are an invitation for exploitation.

## What Tripped Me Up

These are the gotchas that cost me real debugging time:

- **Stateful behavior is confusing at first.** If you allow inbound on port 443, the response traffic is automatically allowed outbound without an explicit egress rule. Coming from traditional firewall experience where you configure both directions, this is unintuitive.
- **Default deny vs default allow asymmetry.** Inbound defaults to deny-all while outbound defaults to allow-all. Forgetting this leads to either wondering why nothing connects (missing ingress) or assuming you have egress restrictions when you do not.
- **Security group references vs CIDR blocks.** Using CIDR blocks for inter-service communication (like app-to-database) breaks when IPs change. Security group references auto-update, but the Terraform syntax is different and easy to confuse.
- **Debugging connectivity is opaque.** Security group denials produce no logs by default (unlike NACLs). VPC Flow Logs must be explicitly enabled to see rejected traffic, and even then the logs do not tell you which security group rule caused the rejection.
- **Rule limits are easy to hit.** The default limit is 60 rules per security group and 5 security groups per ENI. Consolidating rules requires understanding port ranges and CIDR aggregation.

## When to Use Security Groups

Security groups are the right tool for controlling access to any VPC resource (EC2, RDS, ECS, Lambda in VPC), implementing least-privilege network access between service tiers, restricting database access to only application servers, and limiting SSH/RDP access to specific IP ranges or bastion hosts.

They are not the right tool for subnet-level traffic control (use NACLs), blocking specific IP addresses (security groups have no deny rules -- use NACLs), rate limiting or DDoS protection (use AWS WAF or Shield), application-layer filtering (security groups work at L3/L4 only -- use ALB rules or WAF), or cross-VPC rules (security group references only work within the same VPC or peered VPCs).

## Core Concepts

### Stateful Firewall

Security Groups are **stateful**. This is the single most important thing to understand:

- If inbound traffic is allowed, response traffic is automatically allowed outbound
- No need to create matching egress rules for responses
- This simplifies rule management significantly

Compare this with Network ACLs (NACLs), which are stateless and require explicit rules for both directions.

### Default Behavior

Two defaults that catch people off guard:

- **Inbound**: All traffic denied by default
- **Outbound**: All traffic allowed by default

This asymmetry means a new security group with no custom rules will block all incoming connections but allow the resource to reach anything on the internet.

## Ingress Rules (Inbound)

Ingress rules control traffic **entering** the resource:

```hcl
ingress {
  description = "PostgreSQL from VPC"
  from_port   = 5432
  to_port     = 5432
  protocol    = "tcp"
  cidr_blocks = ["10.0.0.0/16"]
}
```

The key parameters:

- `from_port` / `to_port`: Port range (use the same value for a single port)
- `protocol`: `tcp`, `udp`, `icmp`, or `-1` (all protocols)
- `cidr_blocks`: Source IP ranges in CIDR notation
- `security_groups`: Source security groups (preferred for inter-service traffic)

## Egress Rules (Outbound)

Egress rules control traffic **leaving** the resource:

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

The special values to know:

- `from_port = 0, to_port = 0, protocol = "-1"`: All traffic on all ports
- `cidr_blocks = ["0.0.0.0/0"]`: All IPv4 destinations
- `ipv6_cidr_blocks = ["::/0"]`: All IPv6 destinations

## Security Best Practices

### 1. Principle of Least Privilege

The difference between a security audit pass and fail often comes down to how specific your rules are:

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

For inter-service communication, always prefer security group references over CIDR blocks:

```hcl
# Database only accepts traffic from app servers
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.app_servers.id]
}
```

This approach auto-updates when source IPs change, makes the intent clear (app -> db), and is easier to audit than IP ranges.

### 3. Restrict SSH/RDP Access

Never open SSH to `0.0.0.0/0`. Limit it to known IP ranges or bastion hosts:

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

Most teams leave egress wide open. For sensitive workloads, restrict it:

```hcl
# Only allow HTTPS outbound to specific service
egress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["54.239.28.85/32"]  # Specific service IP
}
```

## Common Patterns

### Web Server Security Group

A typical web server needs HTTP/HTTPS from the internet and SSH only from a bastion:

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

Databases should only accept connections from application servers, never from the internet:

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

The ALB accepts HTTPS from the internet and forwards to application servers on a specific port:

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

## Debugging Tips

When something cannot connect and you suspect security groups, these commands help:

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

If `nc` returns nothing and there is no error, the traffic is being silently dropped by a security group. Enable VPC Flow Logs to confirm.

## Practical Takeaway

Security groups are straightforward once you internalize two things: they are stateful (responses are automatic) and they default to deny-inbound/allow-outbound.

For inter-service rules, always use security group references instead of CIDR blocks. CIDR blocks break when IPs change during deployments or scaling events. Security group references handle this automatically.

When debugging connectivity, check security groups before anything else. They are the most common cause of network issues on AWS, and they produce zero log output by default. Enable VPC Flow Logs in any environment where you might need to troubleshoot.

## References

- [AWS Security Groups Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [Security Group Rules Reference](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html)

---
title: AWS Security Groups Fundamentals
description: 'Security Groups are virtual firewalls for AWS resources, controlling inbound'
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
  - url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html'
    title: vpc security groups.html
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: security group rules reference.html
    type: official
---

# AWS Security Groups Fundamentals

Security Groups are virtual firewalls for AWS resources, controlling inbound
(ingress) and outbound (egress) traffic at the instance level.

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

---
title: AWS Security Groups Fundamentals
description: "Security Groups are virtual firewalls for AWS resources, controlling inbound"
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
  - url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html"
    title: vpc security groups.html
    type: official
  - url: >-
      https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html
    title: security group rules reference.html
    type: official
---

I deployed an ECS service, configured the task definition, verified the
container was healthy -- and nothing could reach it. No error, no timeout
message, just silence. After an hour of checking code, environment variables,
and DNS, I realized the security group had no ingress rule for the application
port. One missing rule, zero helpful error messages.

Security groups are the most common cause of "it works locally but not on AWS"
issues, and they produce no logs when they block traffic.

## Why This Matters

Every AWS resource in a VPC needs network-level access control. EC2 instances,
RDS databases, ECS tasks, Lambda functions running inside a VPC -- all of them
are governed by security groups. Without properly configured rules, resources
are either exposed to the entire internet (a security risk) or completely
unreachable (a broken service).

Misconfigured security group rules are one of the top findings in AWS security
audits. Overly permissive ingress rules -- especially 0.0.0.0/0 on sensitive
ports -- and forgotten wide-open egress are the usual culprits. Getting
comfortable with security groups early saves real pain later.

## What Tripped Me Up

The five things that confused me most when learning security groups:

**Stateful behavior is unintuitive.** If you allow inbound traffic on port 443,
the response traffic is automatically allowed outbound -- no explicit egress
rule needed. Coming from traditional firewall experience where you configure
both directions, this feels wrong at first. It's actually a feature.

**Default deny vs. default allow are asymmetric.** Inbound defaults to deny-all.
Outbound defaults to allow-all. Forgetting this leads to wondering why nothing
connects (missing ingress rule) or assuming you have egress restrictions when
you do not.

**Security group references vs. CIDR blocks behave differently.** Using CIDR
blocks for inter-service communication (e.g., app-to-database) breaks when IPs
change. Security group references auto-update, but the Terraform syntax is
different enough to cause confusion when you're writing rules quickly.

**Debugging connectivity is opaque.** Security group denials produce no logs by
default, unlike NACLs. VPC Flow Logs must be explicitly enabled to see rejected
traffic, and even then the logs do not tell you which specific security group
rule caused the rejection. The silence is intentional -- but it's brutal when
you're troubleshooting.

**Rule limits are easy to hit.** The default limit is 60 rules per security
group and 5 security groups per ENI. When a service accumulates many ingress
rules over time, you hit this ceiling and need to consolidate using port ranges
or CIDR aggregation.

## When to Use

Use security groups whenever you need to control network access to a VPC
resource. Restricting database access so only application servers can connect,
limiting SSH access to a bastion host, controlling which services can reach an
internal API -- these are all security group problems.

The mental model is per-resource virtual firewall. Each ENI (network interface)
gets one or more security groups attached, and only traffic matching an allow
rule gets through.

## When NOT to Use

Security groups are not the right tool for everything.

For subnet-level traffic control, use Network ACLs (NACLs). Security groups
operate per-ENI; NACLs apply to all resources within a subnet regardless of
what's attached to them.

For blocking specific IP addresses, use NACLs as well. Security groups only
have allow rules -- there is no deny rule. If you need to explicitly block a
known bad actor's IP range, NACLs are the right layer.

For rate limiting or DDoS protection, use AWS WAF or Shield. Security groups
have no concept of request rate or connection frequency.

For application-layer filtering based on HTTP paths or headers, use ALB
listener rules or WAF. Security groups work at L3/L4 (IP and port) only.

For cross-VPC or cross-account rules, security group references only work
within the same VPC (or peered VPCs with specific configuration). Use VPC
endpoints or Transit Gateway for cross-boundary access control.

## Core Concepts

### Stateful Firewall

This is the single most important thing to understand about security groups:
they are stateful. When inbound traffic is allowed, the return traffic for that
connection is automatically permitted outbound. You do not need to write a
matching egress rule for responses.

If an application server on port 8080 receives a request from a client, the
response packets are allowed back through automatically -- regardless of what
your egress rules say. Terraform's `ingress` and `egress` blocks control what
can initiate connections, not what can respond.

### Default Behavior

Two defaults that catch people off guard.

All inbound traffic is denied by default. A freshly created security group with
no ingress rules will silently drop everything trying to connect to it. This
is why my ECS service was unreachable -- I forgot to add an ingress rule.

All outbound traffic is allowed by default. Unless you remove or restrict the
default egress rule, resources can make outbound connections to anywhere. Most
teams leave this alone, but tightening egress is part of a defense-in-depth
posture.

## Ingress Rules (Inbound)

Ingress rules control what traffic can enter the resource. Each rule specifies
a port range, protocol, and source -- either a CIDR block or another security
group.

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

- `from_port` / `to_port`: Port range. Use the same value for a single port.
- `protocol`: `tcp`, `udp`, `icmp`, or `-1` for all protocols.
- `cidr_blocks`: Source IP ranges in CIDR notation.
- `security_groups`: Source security group IDs (preferred over CIDR for
  inter-service rules).

## Egress Rules (Outbound)

Egress rules control what traffic can leave the resource. The most common
pattern is allowing all outbound traffic, which is the default behavior.

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

The special values:

- `from_port = 0, to_port = 0, protocol = "-1"`: Matches all traffic.
- `cidr_blocks = ["0.0.0.0/0"]`: All IPv4 destinations.
- `ipv6_cidr_blocks = ["::/0"]`: All IPv6 destinations.

Remember that because security groups are stateful, restricting egress does
not block response traffic -- it only blocks new outbound connections initiated
by the resource.

## Security Best Practices

The difference between a security audit pass and fail often comes down to a
handful of security group decisions made early in a project. These four
practices cover the most common gaps.

### Least Privilege

Grant only the access required, nothing more. A wide-open ingress rule is a
liability -- both a security risk and an audit finding.

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

### Security Group References

When two services in the same VPC need to talk to each other, reference the
source security group instead of its IP range. This auto-updates when source
IPs change and makes the intent clear -- "app servers can connect to the
database" reads directly from the rule.

```hcl
# Database only accepts traffic from app servers
ingress {
  from_port       = 3306
  to_port         = 3306
  protocol        = "tcp"
  security_groups = [aws_security_group.app_servers.id]
}
```

CIDR-based rules for inter-service traffic break silently when IPs shift during
redeployments or scaling events. Security group references stay correct
automatically.

### Restrict SSH/RDP

Never open SSH to 0.0.0.0/0. This is the single most common finding in AWS
security audits, and it's also actively scanned and exploited. Restrict SSH
to your office IP range, a bastion host security group, or a VPN CIDR.

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

### Limit Egress

Most teams leave egress wide open and move on. That's understandable during
initial development, but for production services handling sensitive data, it's
worth locking down. A compromised instance with unrestricted egress can
exfiltrate data to anywhere. Constrained egress limits the blast radius.

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

### Web Server SG

A typical web server needs to accept HTTP and HTTPS from the internet, SSH from
a bastion only, and unrestricted outbound for package updates and API calls.

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

### Database SG

Databases should only accept connections from application servers, never from
the internet. This pattern makes the intent explicit: the database SG references
the app SG, so the rule reads as "app servers can reach the database."

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

### ALB SG

The ALB accepts HTTPS from the internet and forwards to the application tier.
The egress rule scopes outbound traffic to the app security group on the
application port, rather than allowing all outbound.

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

## Inline vs. Standalone Rules in Terraform

Terraform offers two ways to manage security group rules, and the choice has
critical drift implications. I learned this the hard way when a `terraform plan`
tried to remove manually-added developer IPs that had been added directly in the
AWS console -- because the security group had at least one inline ingress block,
Terraform decided it owned all ingress rules.

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

If ANY inline `ingress` block exists, Terraform manages ALL ingress rules on
this security group. During `terraform plan`, it refreshes state from AWS and
plans to remove any rule not represented in code. The same applies independently
to egress.

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

Each rule is an independent resource. The parent security group does not know
about standalone rules -- they are not visible in its state. Other rules (manual
or from other standalone resources) are unaffected when a standalone rule is
added or removed.

### The Critical Rule

| Inline ingress blocks | Terraform behavior                                         |
| --------------------- | ---------------------------------------------------------- |
| 1 or more             | Manages ALL ingress -- removes unrecognized rules          |
| Zero                  | Does NOT manage ingress -- ignores manual/standalone rules |

The same logic applies independently for egress blocks.

### When to Use Standalone Rules

**Circular dependencies:** SG A references SG B for one rule, and SG B
references SG A for another. Inline blocks in both resources create a Terraform
dependency cycle. Extract one direction as a standalone rule to break the cycle.

**Mixed ownership:** Some rules are Terraform-managed, others are manually
managed (developer IPs, ops team additions). Use zero inline blocks combined
with standalone resources for Terraform rules. Add
`lifecycle { ignore_changes = [ingress] }` to the SG resource if manual rules
must coexist and survive plan/apply cycles.

**Cross-module references:** When a rule needs to reference a security group
defined in a different module, standalone rules avoid tight coupling between
modules and eliminate the need to pass SG IDs through module outputs just to
write inline rules.

### Import ID Format

If you need to import an existing standalone rule into Terraform state, the
import ID format is:

```text
{sg_id}_{type}_{protocol}_{from_port}_{to_port}_{source}
```

Example: `sg-abc123_ingress_tcp_22_22_sg-def456`

## Debugging Tips

When something cannot connect and you suspect security groups, start by pulling
the current rules for the target resource's security group.

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

If `nc` returns nothing or immediately closes, the connection is being blocked
somewhere. Enable VPC Flow Logs on the VPC or specific ENI to confirm. Flow
Logs record accepted and rejected traffic with source/destination IP, port, and
action. They do not tell you which specific rule rejected the packet, but they
confirm that rejection is happening and from which source.

Check both the source resource's egress rules and the destination resource's
ingress rules. Either side can block the connection.

## Practical Takeaway

Security groups are stateful -- responses to allowed connections pass through
automatically, so you only need to think about what initiates connections, not
responses.

The defaults are: deny all inbound, allow all outbound. Every new security group
starts there. Every service you deploy needs explicit ingress rules for the
ports it listens on.

Always use security group references instead of CIDR blocks for inter-service
rules within a VPC. The rules self-maintain as IPs change and the intent is
immediately readable.

When something cannot connect on AWS, check security groups before anything
else. The answer is almost always a missing ingress rule, a rule pointing at
the wrong CIDR, or a rule referencing the wrong security group ID.

## References

- [AWS Security Groups Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [Security Group Rules Reference](https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules-reference.html)

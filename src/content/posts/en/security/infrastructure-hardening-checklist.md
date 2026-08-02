---
title: Infrastructure Hardening Checklist
description: "A security hardening checklist for AWS infrastructure: network
  isolation, WAF deployment, and the cost cuts that fell out of the same work."
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - security
  - aws
  - infrastructure
  - checklist
category: security
draft: false
lang: en
expanded: true
source_content_hash: f31f5f956e58ca9a8e7601d3d78fa8774b70695d785c41533d1f79903485f442
references:
  - url: "https://www.cisecurity.org/cis-benchmarks"
    title: CIS Benchmarks
    type: authoritative
---

In 2025 I ran a hardening pass over a single AWS environment: ECS services
behind an ALB, with RDS and ElastiCache sitting behind them. This is the
checklist that came out of that pass, grouped by area rather than by the order
I worked through it.

Nothing on the list is novel. It is ordinary AWS practice, and the exhaustive
formal version of it lives in the [CIS
Benchmarks](https://www.cisecurity.org/cis-benchmarks). The two items I would
pull out are ordering constraints: add the developer IP rules before removing
`0.0.0.0/0`, and test every route before flipping the WAF into block mode. The
Implementation Order section at the end is a sequence I would recommend, not a
log of what I did first.

## What Actually Changed

These numbers come from that one environment. They are not properties of the
checklist, and I would not expect them to transfer.

| Change                      | What I observed                                                                     | Monthly cost |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| WAF in block mode           | Over 1,000 blocked requests per day in the WAF logs                                 | +$30         |
| RDS + ElastiCache isolation | Both stopped accepting `0.0.0.0/0`; reachable only from ECS and a few developer IPs | $0           |
| Unused NAT Gateway removal  | No traffic at all in the metric window                                              | -$90         |
| **Net**                     |                                                                                     | **-$60**     |

My first draft of this note claimed a "95% risk reduction" and a "100% attack
surface reduction." I cut both. Without a stated risk model those are not
measurements, and I did not have one — what I had was a security group that
stopped answering the whole internet.

The cost column is worth reading on its own. Removing a NAT Gateway nobody was
using paid for the WAF three times over, so this particular round of hardening
came out cheaper than leaving the environment alone.

## Network Security Checklist

### Database Isolation

```text
BEFORE: 0.0.0.0/0 access (entire internet)
AFTER:  ECS security group + developer IPs only
```

- [ ] RDS: Remove `0.0.0.0/0` from security groups
- [ ] ElastiCache: Remove `0.0.0.0/0` from security groups
- [ ] Add ECS security group as allowed source
- [ ] Add developer IPs (CIDR blocks) for direct access
- [ ] Remove unnecessary ports (e.g., 443 on database instances)

```hcl
resource "aws_security_group_rule" "rds_from_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_security_group_rule" "rds_from_dev" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = var.developer_ips  # ["x.x.x.x/32", "y.y.y.y/32"]
  security_group_id = aws_security_group.rds.id
}
```

### Load Balancer Hardening

- [ ] Enforce TLS 1.2+ minimum
- [ ] Enable HTTP/2
- [ ] Optimize health check intervals
- [ ] Configure proper idle timeouts

```hcl
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
}
```

### NAT Gateway Review

Check for unused NAT Gateways:

```bash
# Check NAT Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name BytesOutToDestination \
  --dimensions Name=NatGatewayId,Value=nat-xxxxx \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T00:00:00Z \
  --period 86400 \
  --statistics Sum
```

If zero utilization, consider removal (~$90/month savings).

## WAF Deployment Checklist

- [ ] Deploy WAF with allowlist approach (block by default)
- [ ] Add all legitimate API routes to allowlist
- [ ] Add health check endpoints
- [ ] Add WebSocket/Socket.IO paths
- [ ] Test all routes before enabling block mode
- [ ] Set up CloudWatch logging for blocked requests

See [WAF Allowlist Patterns](/posts/waf-allowlist-patterns) for
implementation details.

## Database Backup Checklist

- [ ] Increase backup retention (7+ days recommended)
- [ ] Enable deletion protection
- [ ] Configure automated snapshots
- [ ] Test restore procedure

```hcl
resource "aws_db_instance" "main" {
  # ...
  backup_retention_period = 7
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.project}-final-snapshot"
}
```

## Developer Access Checklist

Short-term (IP-based):

- [ ] Document developer IPs
- [ ] Add to security group rules
- [ ] Create process for IP updates

Long-term (recommended):

- [ ] VPN setup (AWS Client VPN or third-party)
- [ ] Bastion host for SSH tunneling
- [ ] AWS Systems Manager Session Manager

## Monitoring Checklist

- [ ] CloudWatch alarms for security group changes
- [ ] WAF logging to CloudWatch Logs
- [ ] ALB access logging to S3
- [ ] AWS Config rules for security compliance

## Implementation Order

The sections above are grouped by area, not by sequence. This is the sequence I
would recommend for minimal disruption:

1. **WAF deployment** - Deploy in monitor mode first
2. **Database isolation** - Update security groups (no downtime)
3. **Developer access** - Add IP rules before removing 0.0.0.0/0
4. **ALB hardening** - TLS policy, health checks (minimal impact)
5. **NAT Gateway removal** - After confirming no utilization
6. **Backup enhancement** - Non-disruptive

## Follow-up Improvements

After initial hardening:

- [ ] Private subnet migration for all resources
- [ ] Remote state backend with encryption
- [ ] AWS Secrets Manager for credentials
- [ ] VPN setup for developer access
- [ ] Infrastructure as Code security scanning

## Key Lessons

1. **Security and cost can align** - Removing unused resources improves both
2. **Incremental changes** - Monitor between each change
3. **IP-based access is temporary** - Plan for VPN/bastion
4. **Document everything** - Security changes need audit trail
5. **Test before production** - Verify in dev environment first

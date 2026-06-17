---
title: Infrastructure Hardening Checklist
description: Comprehensive security hardening checklist for AWS infrastructure. Covers
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
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

network isolation, WAF deployment, and cost-effective security improvements.

## Quick Impact Summary

| Improvement         | Security Impact               | Cost Impact |
| ------------------- | ----------------------------- | ----------- |
| WAF deployment      | Blocked 1000+ daily attacks   | +$30/month  |
| Database isolation  | 100% attack surface reduction | $0          |
| NAT Gateway removal | -                             | -$90/month  |
| **Net result**      | 95% risk reduction            | -$60/month  |

Security and cost optimization can go hand-in-hand.

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

Recommended sequence for minimal disruption:

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

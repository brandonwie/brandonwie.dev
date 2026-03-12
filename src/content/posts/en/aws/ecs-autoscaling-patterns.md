---
title: ECS Autoscaling Patterns
description: Best practices for implementing ECS service autoscaling with migration task
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - aws
  - ecs
  - autoscaling
  - infrastructure
category: aws
draft: false
lang: en
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
    title: Automatically scale your Amazon ECS service
    type: official
source_content_hash: db41bfacfa5669e916016e70a26fd6da92b9b9ce60b26850dc0df4db64b45664
---

separation to prevent race conditions.

## Migration Task Separation

### The Problem

When ECS scales out, multiple containers start simultaneously. If each runs
database migrations:

```text
Container 1: Running migration...
Container 2: Running migration... (CONFLICT!)
Container 3: Running migration... (CONFLICT!)
```

### The Solution

Separate migration into its own task definition that runs **once** before
service scaling.

```hcl
# Migration task - runs once
resource "aws_ecs_task_definition" "migration" {
  family = "${var.project}-migration"
  container_definitions = jsonencode([{
    name    = "migration"
    image   = var.image
    command = ["npm", "run", "migration:run"]
  }])
}

# Service task - runs multiple instances
resource "aws_ecs_task_definition" "service" {
  family = "${var.project}-service"
  container_definitions = jsonencode([{
    name    = "api"
    image   = var.image
    command = ["npm", "run", "start:prod"]
  }])
}
```

### Deployment Order

```text
1. Run migration task (single instance, wait for completion)
2. Update service task definition
3. Let autoscaling manage instance count
```

## Target Tracking Policies

### Recommended Configuration

```hcl
resource "aws_appautoscaling_target" "ecs" {
  service_namespace  = "ecs"
  resource_id        = "service/${var.cluster}/${var.service}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = 4
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70  # CPU target percentage
    scale_in_cooldown  = 300 # 5 minutes (conservative)
    scale_out_cooldown = 60  # 1 minute (responsive)

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${var.project}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 80  # Memory target percentage
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
```

### Why These Values

| Parameter          | Value | Reasoning                     |
| ------------------ | ----- | ----------------------------- |
| CPU Target         | 70%   | Leaves headroom for spikes    |
| Memory Target      | 80%   | Memory is less spiky than CPU |
| Scale-out Cooldown | 60s   | Respond quickly to load       |
| Scale-in Cooldown  | 300s  | Prevent flapping              |
| Min Capacity       | 1     | Cost optimization             |
| Max Capacity       | 4     | Stay within connection limits |

## Connection Pool Math

Critical calculation for max capacity:

```text
Max Connections = Max Tasks × Connections per Task
RDS Limit = ~90-100 (db.t4g.medium)

Example:
- 4 tasks × 20 connections = 80 connections
- RDS limit = 90-100
- Headroom = 10-20 connections ✅
```

Always verify max capacity against database connection limits.

## WebSocket Considerations

### Graceful Handling

- Frontend must handle reconnection during scale events
- Session affinity NOT required (stateless design)
- Connection draining during scale-in

### WAF Allowlist

Don't forget to add WebSocket paths to WAF:

```hcl
# Socket.IO path allowlist
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
  # ...
}
```

## Testing Checklist

Before production deployment:

- [ ] Scale-out (1 → 2+ tasks) when CPU > 70%
- [ ] Scale-out to maximum (1 → 4 tasks)
- [ ] Scale-in (4 → 1 tasks) after load decreases
- [ ] Connection pool stays within limits
- [ ] No 5XX errors during scaling events
- [ ] WebSocket reconnection works
- [ ] Migrations don't run multiple times

## Key Lessons

1. **Separate migrations** - Never run migrations from service containers
2. **Conservative scale-in** - 5 minute cooldown prevents flapping
3. **Connection limits first** - Calculate max capacity from DB limits
4. **Test during low traffic** - Have rollback commands ready
5. **Monitor CloudWatch** - Set alarms for max capacity scenarios

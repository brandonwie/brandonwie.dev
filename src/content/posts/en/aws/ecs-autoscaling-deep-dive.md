---
title: ECS Auto-Scaling Deep Dive
description: "Comprehensive guide to ECS auto-scaling concepts, algorithms, and container"
date: 2025-08-23T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - aws
  - ecs
  - autoscaling
  - fargate
category: aws
draft: false
lang: en
references:
  - url: "https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/"
    title: bestpracticesguide
    type: official
  - url: "https://docs.aws.amazon.com/autoscaling/application/userguide/"
    title: userguide
    type: official
---

I set `target_value = 70` for CPU auto-scaling and assumed it meant "if CPU exceeds 70%, add one container." It does not. The algorithm calculated that I needed three additional containers at once, and my database connection pool immediately ran out. That misunderstanding cost me an hour of debugging and an embarrassing page in production.

ECS auto-scaling is not a thermostat. It is proportional control, and the difference matters.

## Why This Matters

Running containers at a fixed count wastes money during low traffic and drops requests during spikes. ECS auto-scaling solves this, but configuring it correctly requires understanding target tracking algorithms, cooldown periods, the difference between scaling policies and CloudWatch alarms, and how scaling interacts with deployments.

Misconfiguration leads to flapping (rapid scale-out/in cycles), runaway costs from unbounded scaling, or unresponsive services that fail to scale when needed.

## The Mistakes I Made

Every one of these came from real production incidents:

- **Target tracking is not threshold-based.** I assumed "if CPU > 70%, add one container." The actual algorithm calculates the proportional number of tasks needed to bring the metric back to target, which can add multiple tasks at once.
- **Cooldown asymmetry is not obvious.** Using the same cooldown for scale-in and scale-out causes flapping. Scale-in must be much longer (300s+) because removing capacity too quickly leads to immediate scale-out again.
- **Auto-scaling and CloudWatch alarms are different things.** Both reference CPU thresholds but serve completely different purposes. Alarms notify humans while scaling policies act automatically. Setting them to the same value defeats the purpose of the alarm as an early warning.
- **Memory scaling is often forgotten.** CPU-only policies miss memory leaks entirely. A Node.js app can OOM-kill at 95% memory while CPU sits at 30%, and no scaling event fires.
- **Max capacity without context is dangerous.** Setting `max_capacity = 100` as a "safe high number" can exhaust database connection pools or hit API rate limits long before reaching that count.

## When to Use Auto-Scaling

It fits well for stateless HTTP services behind a load balancer with variable traffic, microservices with different load profiles, production workloads that need automatic recovery from traffic spikes, and cost optimization for services with predictable daily or weekly traffic patterns (combine with scheduled scaling).

Skip it for stateful services with persistent connections (WebSocket, gRPC streams), services with very slow startup (5+ minutes), single-task services where `min = max = 1`, batch processing workloads, and development/staging environments where you want predictable billing.

## Container Orchestration Concepts

Before diving into auto-scaling specifics, it helps to understand where ECS fits in the container landscape.

### What Container Orchestration Does

Container orchestration handles five core responsibilities:

- **Scheduling**: Decides where containers run
- **Scaling**: Adds/removes containers based on demand
- **Networking**: Ensures containers can communicate
- **Health Monitoring**: Restarts failed containers
- **Load Balancing**: Distributes traffic evenly

### ECS vs EKS vs Fargate

A common confusion: Fargate is NOT an orchestrator. It is a compute engine.

```text
ORCHESTRATORS:
├── ECS (AWS Native)     <- Simpler, AWS-integrated
└── EKS (Kubernetes)     <- Industry standard, portable

COMPUTE ENGINES:
├── Fargate (Serverless) <- No server management
└── EC2 (Virtual Machines) <- Full control
```

Think of it this way: the orchestrator (ECS/EKS) is the brain deciding what to do, and the compute engine (Fargate/EC2) is the muscles doing the work. Fargate works with either ECS or EKS.

## Auto-Scaling Types

### Horizontal Scaling (Recommended)

Horizontal scaling adds or removes container instances to handle load changes:

```text
Normal Load:           High Load (Horizontal):
[Container 1 @ 70%]    [Container 1 @ 35%]
                       [Container 2 @ 35%]
```

This is the right choice for stateless applications. No downtime during scaling.

### Vertical Scaling (Not Recommended for Auto-Scaling)

Vertical scaling changes container size:

```text
Normal:                High Load (Vertical):
[2 CPU, 4GB RAM]  ->    [4 CPU, 8GB RAM]
```

This requires a container restart, causing downtime. Use horizontal scaling instead.

## Target Tracking Scaling Algorithm

Target tracking is like cruise control for your service. It maintains a metric at a specified value by adding or removing tasks proportionally:

```python
# Simplified algorithm
current_cpu = get_average_cpu()
target_cpu = 70
current_tasks = get_task_count()

if current_cpu > target_cpu:
    # Calculate needed tasks
    desired_tasks = current_tasks * (current_cpu / target_cpu)
    desired_tasks = min(desired_tasks, max_capacity)
    if not in_cooldown_period():
        scale_to(desired_tasks)
```

This is the critical insight: it is NOT "if CPU > 70% add one container." If you have 2 tasks running at 140% average CPU with a 70% target, the algorithm calculates `2 * (140 / 70) = 4` tasks needed. It adds two at once, not one.

## Cooldown Periods

### Why Cooldowns Exist

Without cooldowns, auto-scaling over-provisions and creates flapping:

**Without Cooldowns (BAD):**

```text
12:00:00 - CPU 75% -> Add container
12:00:10 - Still 75% -> Add container (new one not ready!)
12:00:20 - Still 75% -> Add container
12:01:00 - CPU 20% each -> WASTED MONEY
```

**With Cooldowns (GOOD):**

```text
12:00:00 - CPU 75% -> Add container
12:00:10 - Still 75% -> WAIT (cooldown)
12:01:00 - CPU 40% each -> Perfect!
```

### Recommended Cooldown Values

| Cooldown  | Value | Reasoning          |
| --------- | ----- | ------------------ |
| Scale-Out | 60s   | Responsive to load |
| Scale-In  | 300s  | Prevents flapping  |

The asymmetry is deliberate. You want to add capacity fast when needed, but remove it slowly to avoid thrashing. Scale-in at 60 seconds causes a common pattern: scale out, load drops, scale in too fast, load spikes again, scale out again -- an expensive oscillation.

## Auto-Scaling vs CloudWatch Alarms

These serve different purposes and should use different thresholds:

| Feature      | Auto-Scaling Policy   | CloudWatch Alarm    |
| ------------ | --------------------- | ------------------- |
| Purpose      | Add/remove containers | Send notifications  |
| CPU Setting  | 70% target            | 85% alert threshold |
| Action       | Immediate scaling     | Human notification  |
| Intervention | None needed           | May require action  |

Why different thresholds? The 70% target keeps your service running optimally through auto-scaling. The 85% alarm fires when auto-scaling might not be keeping up, warning a human to investigate. If both are at 70%, every normal scaling event triggers an alert, creating noise.

## Industry Standard Settings

### Your Settings vs Industry

| Metric             | Setting | Industry | Assessment           |
| ------------------ | ------- | -------- | -------------------- |
| CPU Target         | 70%     | 65-75%   | Excellent            |
| Memory Target      | 80%     | 75-85%   | Excellent            |
| Scale-Out Cooldown | 60s     | 60-120s  | Good                 |
| Scale-In Cooldown  | 300s    | 300-600s | Standard             |
| Min Tasks          | 1       | 1-2      | Consider 2 for HA    |
| Max Tasks          | 4       | Varies   | Application-specific |

### How Major Companies Configure

For reference, here is what large-scale services typically use:

```text
Netflix:    CPU 60-75%, Scale-Out 60s, Scale-In 300s
Uber:       CPU 65-70%, Scale-Out 30s, Scale-In 600s
Airbnb:     CPU 65%,    Scale-Out 90s, Scale-In 600s
```

The pattern is clear: aggressive scale-out, conservative scale-in.

## Cost Optimization

### Fargate Pricing

Fargate charges per-second based on vCPU and memory:

```text
Example: 2 vCPU, 4 GB Memory
- CPU: $0.04048/hour
- Memory: $0.01778/hour
- Total: ~$0.058/hour per task
- Monthly (1 task 24/7): ~$42
```

### Cost Strategies

Four ways to reduce your auto-scaling costs:

1. **Right-sizing**: Monitor actual usage. If CPU stays below 50%, reduce the task size.
2. **Higher thresholds**: A 75% target runs fewer containers than 65%.
3. **Scheduled scaling**: Reduce minimum capacity at night if traffic drops.
4. **Fargate Spot**: Up to 70% savings for fault-tolerant workloads that can handle interruptions.

## Monitoring During Scaling

### Key Metrics to Watch

Track three categories:

**Performance:**

- CPU Utilization (target: 70%)
- Memory Usage (target: 80%)

**Scaling:**

- Task Count (should stay within min-max range)
- Scaling Events (look for frequent oscillation)

**Health:**

- HTTP 5xx Rate (spikes during scaling indicate health check issues)
- Response Time (P50/P95/P99)

### CloudWatch Dashboard Setup

```bash
# View current task count
aws ecs describe-services \
  --cluster my-cluster \
  --services my-service \
  --query 'services[0].runningCount'

# View scaling history
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/my-cluster/my-service
```

## Common Mistakes

### 1. Thresholds Too Low

```hcl
# BAD
target_value = 40.0  # Too aggressive, wastes money

# GOOD
target_value = 70.0  # Balanced
```

A 40% target keeps containers barely utilized, doubling your costs for marginal latency improvement.

### 2. Same Cooldowns for Scale-In/Out

```hcl
# BAD
scale_in_cooldown  = 60
scale_out_cooldown = 60

# GOOD
scale_in_cooldown  = 300  # Conservative
scale_out_cooldown = 60   # Responsive
```

### 3. No Max Capacity Limit

```hcl
# BAD
max_capacity = 100  # Runaway costs possible

# GOOD
max_capacity = 4    # Based on DB connection limits
```

Set max capacity based on your downstream limits: database connection pools, API rate limits, or budget constraints.

### 4. Only CPU Scaling (No Memory)

```hcl
# BAD - Memory leaks won't trigger scaling

# GOOD - Both metrics
resource "aws_appautoscaling_policy" "cpu" { ... }
resource "aws_appautoscaling_policy" "memory" { ... }
```

A Node.js app with a memory leak can OOM-kill while CPU auto-scaling sits idle at 30%.

## Troubleshooting

### Auto-Scaling Not Working

```bash
# Check IAM permissions
aws iam get-role --role-name ecsAutoscaleRole

# Check service limits
aws service-quotas get-service-quota \
  --service-code fargate \
  --quota-code L-3032A538

# Review scaling activities
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/cluster/service
```

### Rapid Scaling (Flapping)

If containers constantly add and remove, increase cooldowns:

```hcl
scale_in_cooldown  = 600  # 10 minutes
scale_out_cooldown = 120  # 2 minutes
```

### Decision Tree

When debugging scaling issues, follow this path:

```text
High CPU Alert?
├── YES -> Check Task Count
│   ├── At Max -> Increase max_capacity
│   └── Not at Max -> Check IAM permissions
└── NO -> Check Memory
    ├── High (>80%) -> Check for memory leaks
    └── Normal -> System operating correctly
```

## Quick Reference

### Recommended Configuration

```yaml
Auto-Scaling:
  CPU Target: 70%
  Memory Target: 80%
  Min Tasks: 1-2
  Max Tasks: Based on DB limits
  Scale-Out Cooldown: 60 seconds
  Scale-In Cooldown: 300 seconds

Alarms (Notifications):
  CPU Alert: 85% for 2 minutes
  Memory Alert: 90% for 2 minutes
```

### Essential Commands

```bash
# Current task count
aws ecs describe-services \
  --cluster CLUSTER --services SERVICE \
  --query 'services[0].runningCount'

# Scaling history
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/CLUSTER/SERVICE

# Current policies
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs
```

## Practical Takeaway

ECS auto-scaling works well once you understand that it is proportional, not threshold-based. The target value is not a trigger -- it is a goal the algorithm continuously works toward.

Start with these settings: CPU target at 70%, memory target at 80%, scale-out cooldown at 60 seconds, scale-in cooldown at 300 seconds. Then tune based on your specific traffic patterns. And always set max capacity based on what your downstream services (databases, APIs) can actually handle, not what sounds like a safe number.

## References

- [ECS Best Practices Guide](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/)

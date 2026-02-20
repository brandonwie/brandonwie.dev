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

orchestration.

---

## The Problem

Running containers at a fixed count wastes money during low traffic and drops
requests during spikes. ECS auto-scaling solves this, but configuring it
correctly requires understanding target tracking algorithms, cooldown periods,
the difference between scaling policies and CloudWatch alarms, and how scaling
interacts with deployments. Misconfiguration leads to flapping (rapid
scale-out/in cycles), runaway costs from unbounded scaling, or unresponsive
services that fail to scale when needed.

---

## Difficulties Encountered

- **Target tracking is not threshold-based** -- the initial assumption was "if
  CPU > 70%, add one container," but the actual algorithm calculates the
  proportional number of tasks needed to bring the metric back to target, which
  can add multiple tasks at once
- **Cooldown asymmetry is not obvious** -- using the same cooldown for scale-in
  and scale-out causes flapping; scale-in must be much longer (300s+) because
  removing capacity too quickly leads to immediate scale-out again
- **Auto-scaling vs CloudWatch alarms confusion** -- both reference CPU
  thresholds but serve completely different purposes; alarms notify humans while
  scaling policies act automatically, and setting them to the same value defeats
  the purpose of the alarm as an early warning
- **Memory scaling is often forgotten** -- CPU-only policies miss memory leaks
  entirely; a Node.js app can OOM-kill at 95% memory while CPU sits at 30%, and
  no scaling event fires
- **Max capacity without context is dangerous** -- setting `max_capacity = 100`
  as a "safe high number" can exhaust database connection pools or hit API rate
  limits long before reaching that count

---

## When to Use

- Stateless HTTP services behind a load balancer with variable traffic
- Microservices architecture where individual services have different load
  profiles
- Production workloads that need automatic recovery from traffic spikes
- Cost optimization for services with predictable daily or weekly traffic
  patterns (combine with scheduled scaling)

---

## When NOT to Use

- **Stateful services with persistent connections** -- WebSocket servers or
  long-lived gRPC streams break when tasks are removed; use sticky sessions or
  connection draining instead
- **Services with very slow startup** -- if your container takes 5+ minutes to
  become healthy (heavy initialization, large ML model loading), auto-scaling
  cannot respond to sudden spikes fast enough; pre-warm with scheduled scaling
- **Single-task services at minimum** -- if `min_capacity = max_capacity = 1`,
  auto-scaling adds configuration complexity with zero benefit; just set a fixed
  desired count
- **Batch processing workloads** -- jobs that run to completion do not benefit
  from target tracking; use ECS scheduled tasks or Step Functions instead
- **Development and staging environments** -- auto-scaling adds unpredictable
  cost variance; use fixed task counts for non-production to keep billing
  predictable

---

## Container Orchestration Concepts

### What Container Orchestration Does

- **Scheduling**: Decides where containers run
- **Scaling**: Adds/removes containers based on demand
- **Networking**: Ensures containers can communicate
- **Health Monitoring**: Restarts failed containers
- **Load Balancing**: Distributes traffic evenly

### ECS vs EKS vs Fargate

```text
ORCHESTRATORS:
├── ECS (AWS Native)     ← Simpler, AWS-integrated
└── EKS (Kubernetes)     ← Industry standard, portable

COMPUTE ENGINES:
├── Fargate (Serverless) ← No server management
└── EC2 (Virtual Machines) ← Full control
```

**Clarification**: Fargate is NOT Kubernetes. Fargate is serverless compute that
works with EITHER ECS or EKS.

- **Orchestrator** (ECS/EKS) = The brain deciding what to do
- **Compute** (Fargate/EC2) = The muscles doing the work

---

## Auto-Scaling Types

### Horizontal Scaling (Recommended)

Adds/removes container instances:

```text
Normal Load:           High Load (Horizontal):
[Container 1 @ 70%]    [Container 1 @ 35%]
                       [Container 2 @ 35%]
```

- Better for stateless applications
- No downtime during scaling

### Vertical Scaling (Not Recommended for Auto-Scaling)

Changes container size:

```text
Normal:                High Load (Vertical):
[2 CPU, 4GB RAM]  →    [4 CPU, 8GB RAM]
```

- Requires container restart
- Causes downtime

---

## Target Tracking Scaling Algorithm

Target tracking maintains a metric value (like cruise control):

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

**Important**: It's NOT a simple "if CPU > 70% add one container".

---

## Cooldown Periods

### Why Cooldowns Exist

Prevent over-provisioning and flapping:

**Without Cooldowns (BAD):**

```text
12:00:00 - CPU 75% → Add container
12:00:10 - Still 75% → Add container (new one not ready!)
12:00:20 - Still 75% → Add container
12:01:00 - CPU 20% each → WASTED MONEY
```

**With Cooldowns (GOOD):**

```text
12:00:00 - CPU 75% → Add container
12:00:10 - Still 75% → WAIT (cooldown)
12:01:00 - CPU 40% each → Perfect!
```

### Recommended Cooldown Values

| Cooldown  | Value | Reasoning          |
| --------- | ----- | ------------------ |
| Scale-Out | 60s   | Responsive to load |
| Scale-In  | 300s  | Prevents flapping  |

---

## Auto-Scaling vs CloudWatch Alarms

**These serve different purposes:**

| Feature      | Auto-Scaling Policy   | CloudWatch Alarm    |
| ------------ | --------------------- | ------------------- |
| Purpose      | Add/remove containers | Send notifications  |
| CPU Setting  | 70% target            | 85% alert threshold |
| Action       | Immediate scaling     | Human notification  |
| Intervention | None needed           | May require action  |

**Why different thresholds?**

- 70% target: Auto-scaling maintains this level
- 85% alarm: Warns when auto-scaling might not be enough

---

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

```text
Netflix:    CPU 60-75%, Scale-Out 60s, Scale-In 300s
Uber:       CPU 65-70%, Scale-Out 30s, Scale-In 600s
Airbnb:     CPU 65%,    Scale-Out 90s, Scale-In 600s
```

---

## Cost Optimization

### Fargate Pricing

Per-second billing based on vCPU and memory:

```text
Example: 2 vCPU, 4 GB Memory
- CPU: $0.04048/hour
- Memory: $0.01778/hour
- Total: ~$0.058/hour per task
- Monthly (1 task 24/7): ~$42
```

### Cost Strategies

1. **Right-sizing**: Monitor actual usage, reduce if CPU is below 50%
2. **Higher thresholds**: 75% target = fewer containers
3. **Scheduled scaling**: Reduce min at night
4. **Fargate Spot**: Up to 70% savings for fault-tolerant workloads

---

## Monitoring During Scaling

### Key Metrics to Watch

**Performance:**

- CPU Utilization (target: 70%)
- Memory Usage (target: 80%)

**Scaling:**

- Task Count (within min-max range)
- Scaling Events (history)

**Health:**

- HTTP 5xx Rate
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

---

## Common Mistakes

### 1. Thresholds Too Low

```hcl
# BAD
target_value = 40.0  # Too aggressive, wastes money

# GOOD
target_value = 70.0  # Balanced
```

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

### 4. Only CPU Scaling (No Memory)

```hcl
# BAD - Memory leaks won't trigger scaling

# GOOD - Both metrics
resource "aws_appautoscaling_policy" "cpu" { ... }
resource "aws_appautoscaling_policy" "memory" { ... }
```

---

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

**Symptom**: Containers constantly adding/removing

**Solution**: Increase cooldowns

```hcl
scale_in_cooldown  = 600  # 10 minutes
scale_out_cooldown = 120  # 2 minutes
```

### Decision Tree

```text
High CPU Alert?
├── YES → Check Task Count
│   ├── At Max → Increase max_capacity
│   └── Not at Max → Check IAM permissions
└── NO → Check Memory
    ├── High (>80%) → Check for memory leaks
    └── Normal → System operating correctly
```

---

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

---

## References

- [ECS Best Practices Guide](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/)
- See also: [ecs-autoscaling-patterns.md](./ecs-autoscaling-patterns.md)

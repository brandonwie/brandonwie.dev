---
title: ECR/ECS Deployment Workflow
description: Complete guide to container deployment using Amazon ECR and ECS.
date: 2025-04-29T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - aws
  - ecs
  - ecr
  - docker
  - cicd
category: aws
draft: false
lang: en
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-types.html
    title: deployment types.html
    type: official
  - url: >-
      https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html
    title: LifecyclePolicies.html
    type: official
---

<script>
import Mermaid from '$lib/components/Mermaid.svelte';
</script>

My first ECS deployment took three hours longer than it should have. I pushed an image to ECR, updated the task definition, then watched the service sit there doing nothing. The issue: ECS created a new task definition revision, but the service was still pointing at the old one. Nobody tells you that `register-task-definition` and `update-service` are two separate steps that must happen in sequence. That was the first of many lessons in getting ECR/ECS deployments right.

## Why This Matters

Deploying containerized applications to AWS requires coordinating multiple services -- ECR for image storage, ECS for orchestration, Fargate for compute -- with specific authentication flows, image tagging strategies, and deployment configurations. Without a clear end-to-end workflow, deployments are error-prone: images get pushed to wrong repos, task definitions reference stale images, rolling updates cause downtime, and failed deployments have no automatic rollback.

## The Hard-Won Lessons

Every one of these tripped me up in production:

- **ECR authentication is session-based.** The Docker login token expires after 12 hours. CI/CD pipelines fail silently with cryptic "no basic auth credentials" errors if the token is not refreshed before each push.
- **Task definition versioning is confusing.** ECS creates a new revision on every `register-task-definition` call, but the service does not automatically pick up the latest revision. You must explicitly update the service with the new revision ARN.
- **Rolling update percentage math is unintuitive.** `minimum_healthy_percent` and `maximum_percent` are relative to `desired_count`, not absolute numbers. The actual task count during deployment depends on the combination of all three values.
- **Health check timing gaps kill deployments.** If the health check grace period is too short, ECS kills tasks that are still starting up (especially JVM or NestJS apps with slow cold starts), causing an infinite deployment loop.
- **Circuit breaker is not enabled by default.** Without `deployment_circuit_breaker`, a bad image causes ECS to endlessly retry launching failing tasks, burning Fargate costs until you manually intervene.

## When to Use ECR/ECS

This workflow fits well for deploying Docker containers to AWS with managed orchestration, teams wanting AWS-native CI/CD without Kubernetes complexity, applications needing zero-downtime rolling deployments, and projects already using Terraform for AWS infrastructure.

Skip it for single static sites (use S3 + CloudFront), multi-cloud requirements (use Kubernetes), very short-lived batch jobs (use Lambda), local development (use Docker Compose), and budget-constrained hobby projects (a t3.micro EC2 with Docker is cheaper).

## Architecture Overview

The deployment pipeline flows from your local code through Docker builds to AWS services:

<Mermaid code={`flowchart LR
    subgraph Development
        Code["Application Code"]
        Docker["Docker Build"]
    end
    subgraph AWS
        ECR["ECR Repository"]
        ECS["ECS Service"]
        Fargate["Fargate Tasks"]
    end
    Code --> Docker
    Docker --> ECR
    ECR --> ECS
    ECS --> Fargate`} />

## ECR: Storing Your Images

ECR is AWS's managed Docker container registry. Start by creating a repository with Terraform:

```hcl
resource "aws_ecr_repository" "app" {
  name                 = "my-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true  # Security scanning
  }
}
```

Enabling `scan_on_push` gives you automatic vulnerability scanning. It checks for known CVEs in OS packages, scans dependencies for vulnerabilities, and makes results viewable in the AWS Console or API.

### Push Workflow

Every push follows the same four steps -- authenticate, build, tag, push:

```bash
# 1. Authenticate Docker to ECR
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  ${ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com

# 2. Build image
docker build -t my-app .

# 3. Tag for ECR
docker tag my-app:latest \
  ${ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest

# 4. Push to ECR
docker push \
  ${ACCOUNT_ID}.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
```

Remember: the authentication token expires after 12 hours. In CI/CD, always refresh it before pushing.

## ECS Deployment Flow

Here is the complete deployment sequence from code push to running tasks:

<Mermaid code={`sequenceDiagram
    participant Dev as Developer
    participant CI as CI/CD
    participant ECR as ECR
    participant ECS as ECS Service
    participant Tasks as Running Tasks
    Dev->>CI: Push Code / Trigger Deploy
    CI->>CI: Build Docker Image
    CI->>ECR: Push Image with Tag
    CI->>ECS: Register New Task Definition
    CI->>ECS: Update Service
    Note over ECS,Tasks: Rolling Update Begins
    loop For Each Task
        ECS->>Tasks: Start New Task
        ECS->>Tasks: Health Check
        ECS->>Tasks: Drain Old Task
        ECS->>Tasks: Terminate Old
    end
    ECS->>CI: Deployment Complete`} />

### Manual Deployment Steps

When you need to deploy manually (debugging, hotfixes), these three commands cover it:

```bash
# 1. Build and push image (see above)

# 2. Register new task definition
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json

# 3. Update service with new task definition
aws ecs update-service \
  --cluster my-cluster \
  --service my-service \
  --task-definition my-task:NEW_REVISION \
  --force-new-deployment
```

The critical detail: step 3 is not optional. Without `update-service`, ECS continues running the old task definition revision even though a new one exists.

## Rolling Updates

### How They Work

ECS replaces tasks one by one to ensure zero downtime. Here is what a typical rolling update looks like with `desired_count = 2`:

```text
Time     | Old v1.0 | New v2.0 | Total | Status
---------|----------|----------|-------|------------------
00:00    | 2        | 0        | 2     | Deploy starts
00:30    | 2        | 1        | 3     | New task starting
01:30    | 1        | 1        | 2     | First old removed
02:00    | 1        | 2        | 3     | Second new starting
03:00    | 0        | 2        | 2     | Complete
```

Notice the total task count goes above `desired_count` during the update. That is the `maximum_percent` setting at work.

### Deployment Configuration

```hcl
resource "aws_ecs_service" "app" {
  name            = "my-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2

  # Deployment behavior
  deployment_minimum_healthy_percent = 100  # Never below desired
  deployment_maximum_percent         = 200  # Can double temporarily

  # Circuit breaker for automatic rollback
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
```

The percentage values are relative to `desired_count`. With `desired_count = 3`:

- `minimum_healthy_percent = 100` means always keep at least 3 tasks running
- `maximum_percent = 200` means you can have up to 6 tasks during deployment

### Choosing a Strategy

| Strategy     | Min % | Max % | Speed  | Risk   | Use Case   |
| ------------ | ----- | ----- | ------ | ------ | ---------- |
| Conservative | 100   | 150   | Slow   | Low    | Production |
| Balanced     | 100   | 200   | Medium | Low    | Most apps  |
| Aggressive   | 50    | 200   | Fast   | Medium | Staging    |

For production, I recommend the balanced strategy. It keeps full capacity throughout the deployment while allowing enough headroom for new tasks to start before old ones drain.

## Deployment with Auto-Scaling

Auto-scaling does not stop during deployments. It continues working, and the interaction is worth understanding:

<Mermaid code={`flowchart LR
    subgraph Deployment
        A[Start: 2 Tasks v1.0]
        B[Rolling: Mix v1.0/v2.0]
        C[End: 2 Tasks v2.0]
    end
    subgraph AutoScaling
        D[CPU Spike]
        E[Scale to 3 Tasks]
    end
    A --> B
    B --> C
    D --> E
    E --> B`} />

The key behaviors during a deployment with active auto-scaling:

- If auto-scaling adds tasks during deployment, new tasks get the latest version
- If auto-scaling removes tasks, ECS prioritizes removing old version tasks
- Scale state is preserved after deployment completes

## GitHub Actions Workflow

Here is a production-ready GitHub Actions workflow that handles the full pipeline:

```yaml
name: Deploy to ECS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/my-app:$IMAGE_TAG .
          docker push $ECR_REGISTRY/my-app:$IMAGE_TAG
          docker tag $ECR_REGISTRY/my-app:$IMAGE_TAG $ECR_REGISTRY/my-app:latest
          docker push $ECR_REGISTRY/my-app:latest

      - name: Update ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: my-app
          image: ${{ steps.login-ecr.outputs.registry }}/my-app:${{ github.sha }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: my-service
          cluster: my-cluster
          wait-for-service-stability: true
```

The `wait-for-service-stability: true` flag is important. Without it, the workflow succeeds as soon as the deployment starts, not when it finishes. You want your CI to fail if the deployment fails.

## Best Practices

### Image Tagging

Use multiple tags for traceability:

```text
Recommended tags:
- Git SHA: my-app:abc123def  (unique, traceable)
- Environment: my-app:prod-latest  (current production)
- Semantic: my-app:v1.2.3  (releases)
```

The Git SHA tag is the most valuable. When something breaks in production, you can trace the exact commit running on each task.

### ECR Lifecycle Policy

Old images pile up fast. Set a lifecycle policy to clean them automatically:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 30 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

### Health Checks

Proper health checks prevent bad deployments from taking down your service:

```hcl
resource "aws_lb_target_group" "app" {
  # ...
  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}
```

Set the health check grace period generously for applications with slow startup times. A NestJS app that takes 30 seconds to boot needs at least 60 seconds of grace period, or ECS will kill it before it finishes starting.

## Troubleshooting

### Deployment Stuck

When a deployment hangs, check these two things first:

```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster my-cluster \
  --tasks $(aws ecs list-tasks --cluster my-cluster --query 'taskArns[0]' --output text) \
  --query 'tasks[0].stoppedReason'

# Check service events
aws ecs describe-services \
  --cluster my-cluster \
  --services my-service \
  --query 'services[0].events[:5]'
```

### Common Issues

| Issue                   | Cause                    | Solution                           |
| ----------------------- | ------------------------ | ---------------------------------- |
| Tasks fail health check | App not ready            | Increase health check grace period |
| Out of memory           | Container needs more RAM | Increase task memory               |
| No IP available         | Subnet full              | Use larger subnet or multiple AZs  |
| Image pull failed       | ECR auth expired         | Refresh ECR token                  |

## Practical Takeaway

The ECR/ECS deployment workflow has a lot of moving parts, but the core loop is simple: authenticate, push image, register task definition, update service. Everything else -- rolling updates, circuit breakers, lifecycle policies -- is safety netting around that core loop.

Enable the circuit breaker from day one. It costs nothing and saves you from burning Fargate money on failing deployments. And always use Git SHA tags for images -- when something breaks at 2 AM, you want to know exactly which commit is running.

## References

- [ECS Deployment Types](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-types.html)
- [ECR Lifecycle Policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)

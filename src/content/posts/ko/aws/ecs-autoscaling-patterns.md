---
title: ECS Autoscaling 패턴
description: Race condition 방지를 위한 마이그레이션 태스크 분리와 ECS 서비스 autoscaling 구현 가이드.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - aws
  - ecs
  - autoscaling
  - infrastructure
category: aws
draft: false
lang: ko
source_lang: en
source_slug: ecs-autoscaling-patterns
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html
    title: Automatically scale your Amazon ECS service
    type: official
---

## 마이그레이션 태스크 분리

### 문제

ECS가 scale out할 때 여러 컨테이너가 동시에 시작돼요. 각각이 데이터베이스 마이그레이션을 실행하면:

```text
Container 1: Running migration...
Container 2: Running migration... (충돌!)
Container 3: Running migration... (충돌!)
```

### 해결 방법

마이그레이션을 별도의 task definition으로 분리해서 서비스 scaling 전에 **한 번만** 실행해요.

```hcl
# 마이그레이션 태스크 - 한 번만 실행
resource "aws_ecs_task_definition" "migration" {
  family = "${var.project}-migration"
  container_definitions = jsonencode([{
    name    = "migration"
    image   = var.image
    command = ["npm", "run", "migration:run"]
  }])
}

# 서비스 태스크 - 여러 인스턴스로 실행
resource "aws_ecs_task_definition" "service" {
  family = "${var.project}-service"
  container_definitions = jsonencode([{
    name    = "api"
    image   = var.image
    command = ["npm", "run", "start:prod"]
  }])
}
```

### 배포 순서

```text
1. 마이그레이션 태스크 실행(단일 인스턴스, 완료 대기)
2. 서비스 task definition 업데이트
3. Autoscaling이 인스턴스 수를 관리하게 맡기기
```

## Target Tracking 정책

### 권장 설정

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
    target_value       = 70  # CPU 목표 퍼센트
    scale_in_cooldown  = 300 # 5분(보수적)
    scale_out_cooldown = 60  # 1분(빠른 대응)

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
    target_value       = 80  # 메모리 목표 퍼센트
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}
```

### 이 값들을 선택한 이유

| 파라미터         | 값    | 이유                             |
| ---------------- | ----- | -------------------------------- |
| CPU 목표         | 70%   | 스파이크를 위한 여유 확보        |
| 메모리 목표      | 80%   | 메모리는 CPU보다 스파이크가 적음 |
| Scale-out 쿨다운 | 60초  | 부하에 빠르게 대응               |
| Scale-in 쿨다운  | 300초 | 플래핑 방지                      |
| 최소 용량        | 1     | 비용 최적화                      |
| 최대 용량        | 4     | 커넥션 제한 내 유지              |

## Connection Pool 계산

최대 용량을 정할 때 중요한 계산이에요:

```text
Max Connections = Max Tasks × Connections per Task
RDS Limit = ~90-100 (db.t4g.medium)

예시:
- 4 tasks × 20 connections = 80 connections
- RDS limit = 90-100
- 여유분 = 10-20 connections ✅
```

항상 최대 용량을 데이터베이스 커넥션 제한과 비교해서 확인하세요.

## WebSocket 고려사항

### Graceful 처리

- 프론트엔드에서 scale 이벤트 중 재연결을 처리해야 해요
- Session affinity 불필요(stateless 설계)
- Scale-in 시 connection draining 필요

### WAF Allowlist

WebSocket 경로를 WAF에 추가하는 걸 잊지 마세요:

```hcl
# Socket.IO 경로 allowlist
byte_match_statement {
  search_string         = "/socket.io"
  positional_constraint = "STARTS_WITH"
  # ...
}
```

## 테스트 체크리스트

프로덕션 배포 전:

- [ ] Scale-out(1 → 2+ tasks) CPU > 70%일 때
- [ ] 최대치까지 scale-out(1 → 4 tasks)
- [ ] 부하 감소 후 scale-in(4 → 1 tasks)
- [ ] Connection pool이 제한 내에 유지되는지
- [ ] Scaling 이벤트 중 5XX 에러 없는지
- [ ] WebSocket 재연결이 작동하는지
- [ ] 마이그레이션이 여러 번 실행되지 않는지

## 핵심 교훈

1. **마이그레이션 분리** - 서비스 컨테이너에서 마이그레이션을 실행하지 마세요
2. **보수적인 scale-in** - 5분 쿨다운으로 플래핑을 방지해요
3. **커넥션 제한 우선** - DB 제한에서 최대 용량을 산출하세요
4. **트래픽이 적을 때 테스트** - rollback 명령어를 준비해두세요
5. **CloudWatch 모니터링** - 최대 용량 시나리오에 알람을 설정하세요

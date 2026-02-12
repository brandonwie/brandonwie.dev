---
title: "ECS Auto-Scaling 심층 분석"
description: "ECS auto-scaling의 알고리즘, 쿨다운, 비용 최적화 — 비례 제어를 이해하면 flapping과 과금 폭탄을 피할 수 있어요."
date: 2025-08-23T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - aws
  - ecs
  - autoscaling
  - fargate
category: aws
draft: false
lang: ko
source_lang: en
source_slug: ecs-autoscaling-deep-dive
source_updated: "2026-01-27"
translation_date: "2026-02-12"
references:
  - url: "https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/"
    title: ECS 모범 사례 가이드
    type: official
  - url: "https://docs.aws.amazon.com/autoscaling/application/userguide/"
    title: Application Auto Scaling 사용자 가이드
    type: official
---

CPU auto-scaling에 `target_value = 70`을 설정하고 "CPU가 70%를 넘으면 컨테이너 하나 추가"라는 의미인 줄 알았어요. 아니었어요. 알고리즘이 한 번에 컨테이너 세 개가 필요하다고 계산했고, 데이터베이스 커넥션 풀이 즉시 고갈됐어요. 이 오해 때문에 프로덕션에서 한 시간을 디버깅에 쓰고 민망한 장애를 겪었어요.

ECS auto-scaling은 온도 조절기가 아니에요. 비례 제어예요. 이 차이가 중요해요.

## 왜 중요한가

고정된 컨테이너 수로 운영하면 트래픽이 적을 때 돈을 낭비하고, 스파이크 때 요청을 처리 못 해요. ECS auto-scaling이 이걸 해결하지만, 제대로 설정하려면 target tracking 알고리즘, 쿨다운 기간, scaling policy와 CloudWatch alarm의 차이, 배포와 스케일링의 상호작용을 이해해야 해요.

잘못 설정하면 flapping(빠른 scale-out/in 반복), 무제한 스케일링으로 인한 비용 폭주, 또는 필요할 때 스케일링되지 않는 무응답 서비스가 돼요.

## 직접 겪은 실수들

전부 실제 프로덕션 사고에서 나온 거예요:

- **Target tracking은 임계값 기반이 아니에요.** "CPU > 70%면 컨테이너 하나 추가"라고 생각했는데, 실제 알고리즘은 메트릭을 목표로 되돌리기 위해 필요한 비례적 task 수를 계산해요. 한 번에 여러 개를 추가할 수 있어요.
- **쿨다운 비대칭이 눈에 안 들어와요.** Scale-in과 scale-out에 같은 쿨다운을 쓰면 flapping이 생겨요. Scale-in은 훨씬 길어야(300초 이상) 해요 -- 용량을 너무 빨리 제거하면 바로 scale-out이 다시 일어나요.
- **Auto-scaling과 CloudWatch alarm은 다른 것이에요.** 둘 다 CPU 임계값을 참조하지만 목적이 완전히 달라요. Alarm은 사람에게 알리고, scaling policy는 자동으로 동작해요. 같은 값으로 설정하면 alarm의 조기 경보 목적이 사라져요.
- **메모리 스케일링을 자주 빠뜨려요.** CPU만으로는 메모리 누수를 감지 못 해요. Node.js 앱이 메모리 95%에서 OOM-kill되는 동안 CPU는 30%에 앉아 있고, 스케일링 이벤트가 안 발생해요.
- **컨텍스트 없는 최대 용량은 위험해요.** `max_capacity = 100`을 "안전한 큰 숫자"로 설정하면, 그 수에 도달하기 훨씬 전에 데이터베이스 커넥션 풀이 고갈되거나 API rate limit에 걸릴 수 있어요.

## 사용하면 좋을 때

로드 밸런서 뒤에서 가변 트래픽을 받는 stateless HTTP 서비스, 개별 서비스마다 부하 패턴이 다른 마이크로서비스 아키텍처, 트래픽 스파이크에서 자동 복구가 필요한 프로덕션 워크로드, 예측 가능한 일/주 트래픽 패턴의 비용 최적화(스케줄 스케일링 병행)에 적합해요.

Persistent connection이 있는 stateful 서비스(WebSocket, gRPC 스트림), 시작이 매우 느린 서비스(5분 이상), `min = max = 1`인 단일 task 서비스, 배치 처리 워크로드, 예측 가능한 비용이 필요한 개발/스테이징 환경에서는 건너뛰세요.

## 컨테이너 오케스트레이션 개념

Auto-scaling 세부 사항에 들어가기 전에, ECS가 컨테이너 생태계에서 어디에 위치하는지 이해하면 도움이 돼요.

### 컨테이너 오케스트레이션이 하는 일

컨테이너 오케스트레이션은 다섯 가지 핵심 책임을 처리해요:

- **Scheduling**: 컨테이너를 어디서 실행할지 결정
- **Scaling**: 수요에 따라 컨테이너 추가/제거
- **Networking**: 컨테이너 간 통신 보장
- **Health Monitoring**: 실패한 컨테이너 재시작
- **Load Balancing**: 트래픽을 고르게 분배

### ECS vs EKS vs Fargate

흔한 혼동: Fargate는 오케스트레이터가 아니에요. 컴퓨팅 엔진이에요.

```text
ORCHESTRATORS:
├── ECS (AWS Native)     <- 더 간단, AWS 통합
└── EKS (Kubernetes)     <- 산업 표준, 이식성

COMPUTE ENGINES:
├── Fargate (Serverless) <- 서버 관리 불필요
└── EC2 (Virtual Machines) <- 완전한 제어
```

이렇게 생각하면 돼요: 오케스트레이터(ECS/EKS)는 무엇을 할지 결정하는 두뇌이고, 컴퓨팅 엔진(Fargate/EC2)은 실제로 일하는 근육이에요. Fargate는 ECS와 EKS 어느 쪽이든 사용할 수 있어요.

## Auto-Scaling 유형

### 수평 스케일링 (권장)

수평 스케일링은 부하 변화에 대응해 컨테이너 인스턴스를 추가하거나 제거해요:

```text
Normal Load:           High Load (Horizontal):
[Container 1 @ 70%]    [Container 1 @ 35%]
                       [Container 2 @ 35%]
```

Stateless 애플리케이션에 적합해요. 스케일링 중 다운타임이 없어요.

### 수직 스케일링 (Auto-Scaling에 비추천)

수직 스케일링은 컨테이너 크기를 변경해요:

```text
Normal:                High Load (Vertical):
[2 CPU, 4GB RAM]  ->    [4 CPU, 8GB RAM]
```

컨테이너 재시작이 필요해서 다운타임이 생겨요. 대신 수평 스케일링을 사용하세요.

## Target Tracking 스케일링 알고리즘

Target tracking은 서비스의 크루즈 컨트롤 같은 거예요. 지정된 값에서 메트릭을 유지하기 위해 비례적으로 task를 추가하거나 제거해요:

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

이게 핵심 통찰이에요: "CPU > 70%면 컨테이너 하나 추가"가 아니에요. 2개 task가 평균 CPU 140%로 돌아가고 목표가 70%면, 알고리즘이 `2 * (140 / 70) = 4` task가 필요하다고 계산해요. 하나가 아니라 두 개를 한꺼번에 추가해요.

## 쿨다운 기간

### 쿨다운이 존재하는 이유

쿨다운 없이는 auto-scaling이 과잉 프로비저닝과 flapping을 만들어요:

**쿨다운 없이 (BAD):**

```text
12:00:00 - CPU 75% -> 컨테이너 추가
12:00:10 - 여전히 75% -> 컨테이너 추가 (새 건 아직 안 준비됨!)
12:00:20 - 여전히 75% -> 컨테이너 추가
12:01:00 - 각각 CPU 20% -> 돈 낭비
```

**쿨다운 있을 때 (GOOD):**

```text
12:00:00 - CPU 75% -> 컨테이너 추가
12:00:10 - 여전히 75% -> 대기 (쿨다운)
12:01:00 - 각각 CPU 40% -> 완벽!
```

### 권장 쿨다운 값

| 쿨다운    | 값    | 이유          |
| --------- | ----- | ------------- |
| Scale-Out | 60초  | 부하에 빠르게 |
| Scale-In  | 300초 | Flapping 방지 |

이 비대칭은 의도적이에요. 필요할 때 빠르게 용량을 추가하되, 제거는 천천히 해야 thrashing을 피할 수 있어요. Scale-in을 60초로 하면 흔한 패턴이 생겨요: scale out, 부하 감소, 너무 빨리 scale in, 부하 다시 스파이크, 또 scale out -- 비싼 진동이에요.

## Auto-Scaling vs CloudWatch Alarm

목적이 다르고 임계값도 달라야 해요:

| 기능      | Auto-Scaling Policy | CloudWatch Alarm    |
| --------- | ------------------- | ------------------- |
| 목적      | 컨테이너 추가/제거  | 알림 전송           |
| CPU 설정  | 70% 목표            | 85% 경고 임계값     |
| 동작      | 즉시 스케일링       | 사람에게 알림       |
| 개입 필요 | 없음                | 조치 필요할 수 있음 |

왜 임계값이 달라야 할까요? 70% 목표는 auto-scaling을 통해 서비스를 최적으로 유지해요. 85% alarm은 auto-scaling이 따라가지 못할 때 발동해서 사람에게 조사하라고 경고해요. 둘 다 70%면 정상적인 스케일링 이벤트마다 알림이 와서 노이즈가 돼요.

## 업계 표준 설정

### 설정값 비교

| 메트릭           | 설정값 | 업계 표준 | 평가             |
| ---------------- | ------ | --------- | ---------------- |
| CPU Target       | 70%    | 65-75%    | 훌륭             |
| Memory Target    | 80%    | 75-85%    | 훌륭             |
| Scale-Out 쿨다운 | 60초   | 60-120초  | 좋음             |
| Scale-In 쿨다운  | 300초  | 300-600초 | 표준             |
| Min Task         | 1      | 1-2       | HA를 위해 2 고려 |
| Max Task         | 4      | 다양      | 애플리케이션별   |

### 대형 기업의 설정

참고로 대규모 서비스에서 일반적으로 사용하는 값이에요:

```text
Netflix:    CPU 60-75%, Scale-Out 60s, Scale-In 300s
Uber:       CPU 65-70%, Scale-Out 30s, Scale-In 600s
Airbnb:     CPU 65%,    Scale-Out 90s, Scale-In 600s
```

패턴이 명확해요: 공격적인 scale-out, 보수적인 scale-in.

## 비용 최적화

### Fargate 가격

Fargate는 vCPU와 메모리 기준으로 초당 과금돼요:

```text
예시: 2 vCPU, 4 GB Memory
- CPU: $0.04048/hour
- Memory: $0.01778/hour
- Total: ~$0.058/hour per task
- Monthly (1 task 24/7): ~$42
```

### 비용 전략

Auto-scaling 비용을 줄이는 네 가지 방법:

1. **Right-sizing**: 실제 사용량을 모니터링하고, CPU가 50% 미만이면 task 크기를 줄이세요.
2. **높은 임계값**: 75% 목표가 65%보다 컨테이너를 적게 실행해요.
3. **스케줄 스케일링**: 트래픽이 줄어드는 야간에 최소 용량을 줄이세요.
4. **Fargate Spot**: 인터럽션을 감당할 수 있는 워크로드에 최대 70% 절약.

## 스케일링 중 모니터링

### 주요 메트릭

세 가지 카테고리를 추적하세요:

**성능:**

- CPU Utilization (목표: 70%)
- Memory Usage (목표: 80%)

**스케일링:**

- Task Count (min-max 범위 안에 있어야 함)
- Scaling Events (빈번한 진동 확인)

**상태:**

- HTTP 5xx Rate (스케일링 중 스파이크는 health check 문제)
- Response Time (P50/P95/P99)

### CloudWatch 대시보드 설정

```bash
# 현재 task 수 확인
aws ecs describe-services \
  --cluster my-cluster \
  --services my-service \
  --query 'services[0].runningCount'

# 스케일링 이력 확인
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/my-cluster/my-service
```

## 흔한 실수

### 1. 너무 낮은 임계값

```hcl
# BAD
target_value = 40.0  # 너무 공격적, 돈 낭비

# GOOD
target_value = 70.0  # 균형 잡힌
```

40% 목표는 컨테이너가 거의 활용되지 않은 채로 유지돼서, 미미한 레이턴시 개선에 비용이 두 배가 돼요.

### 2. Scale-In/Out 쿨다운 동일

```hcl
# BAD
scale_in_cooldown  = 60
scale_out_cooldown = 60

# GOOD
scale_in_cooldown  = 300  # 보수적
scale_out_cooldown = 60   # 반응적
```

### 3. 최대 용량 제한 없음

```hcl
# BAD
max_capacity = 100  # 비용 폭주 가능

# GOOD
max_capacity = 4    # DB 커넥션 제한 기준
```

최대 용량은 다운스트림 제한 기준으로 설정하세요: 데이터베이스 커넥션 풀, API rate limit, 또는 예산 제약.

### 4. CPU만 스케일링 (메모리 없음)

```hcl
# BAD - 메모리 누수에 반응 못함

# GOOD - 양쪽 메트릭 모두
resource "aws_appautoscaling_policy" "cpu" { ... }
resource "aws_appautoscaling_policy" "memory" { ... }
```

메모리 누수가 있는 Node.js 앱은 CPU auto-scaling이 30%에서 가만히 있는 동안 OOM-kill될 수 있어요.

## 트러블슈팅

### Auto-Scaling 동작 안 함

```bash
# IAM 권한 확인
aws iam get-role --role-name ecsAutoscaleRole

# 서비스 한도 확인
aws service-quotas get-service-quota \
  --service-code fargate \
  --quota-code L-3032A538

# 스케일링 활동 검토
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/cluster/service
```

### 빠른 스케일링 (Flapping)

컨테이너가 계속 추가/제거되면 쿨다운을 늘리세요:

```hcl
scale_in_cooldown  = 600  # 10분
scale_out_cooldown = 120  # 2분
```

### 의사 결정 트리

스케일링 문제를 디버깅할 때 이 경로를 따르세요:

```text
High CPU Alert?
├── YES -> Task Count 확인
│   ├── 최대치 -> max_capacity 늘리기
│   └── 최대치 아님 -> IAM 권한 확인
└── NO -> Memory 확인
    ├── 높음 (>80%) -> 메모리 누수 확인
    └── 정상 -> 시스템 정상 동작
```

## 빠른 참조

### 권장 설정

```yaml
Auto-Scaling:
  CPU Target: 70%
  Memory Target: 80%
  Min Tasks: 1-2
  Max Tasks: DB 제한 기준
  Scale-Out Cooldown: 60초
  Scale-In Cooldown: 300초

Alarms (알림):
  CPU Alert: 2분간 85%
  Memory Alert: 2분간 90%
```

### 필수 명령어

```bash
# 현재 task 수
aws ecs describe-services \
  --cluster CLUSTER --services SERVICE \
  --query 'services[0].runningCount'

# 스케일링 이력
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --resource-id service/CLUSTER/SERVICE

# 현재 정책
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs
```

## 실전 정리

ECS auto-scaling은 비례적이지 임계값 기반이 아니라는 걸 이해하면 잘 동작해요. Target value는 트리거가 아니에요 -- 알고리즘이 지속적으로 달성하려는 목표예요.

이 설정으로 시작하세요: CPU target 70%, memory target 80%, scale-out 쿨다운 60초, scale-in 쿨다운 300초. 그다음 실제 트래픽 패턴에 맞춰 조정하세요. 그리고 max capacity는 다운스트림 서비스(데이터베이스, API)가 실제로 감당할 수 있는 값을 기준으로 설정하세요. "안전해 보이는 큰 숫자"가 아니라요.

## 참고 자료

- [ECS 모범 사례 가이드](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/)

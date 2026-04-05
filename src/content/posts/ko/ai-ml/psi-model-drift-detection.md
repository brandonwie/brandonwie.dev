---
title: "모델 드리프트 감지를 위한 PSI(Population Stability Index)"
description: >-
  배포된 분류기의 입력 분포가 학습 데이터에서 벗어나는 것을 정확도가 떨어지기
  전에 감지하는 경량 통계 메트릭을 알아보세요.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-06"
tags:
  - ai-ml
  - mlops
  - drift-detection
  - monitoring
  - statistics
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: psi-model-drift-detection
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: 'https://scholarlycommons.pacific.edu/uop_etds/3617/'
    title: Population Stability Index original paper
    type: authoritative
  - url: 'https://www.listendata.com/2015/05/population-stability-index.html'
    title: PSI explained with examples
    type: tutorial
---

분류 모델을 배포한 후, 들어오는 데이터가 학습 데이터에서 벗어났다는 걸 어떻게 알 수 있을까요? 정확도가 떨어질 때까지 기다리면 이미 피해가 발생한 거예요. 선행 지표가 필요해요 — 예측에 영향을 주기 전에 분포 드리프트를 감지하는 뭔가요.

## 왜 PSI인가

PSI(Population Stability Index)는 원래 Capital One이나 Goldman Sachs 같은 금융 기관에서 신용 평점용으로 개발한 통계 메트릭이에요. 두 개의 확률 분포 — 학습 분포와 프로덕션 분포 — 를 비교해서 얼마나 벌어졌는지를 하나의 숫자로 알려줘요.

공식은 간단해요:

```
PSI = SUM((actual_% - expected_%) * ln(actual_% / expected_%))
```

분류 작업의 각 카테고리에 대해, 프로덕션에서의 요청 비율(actual)과 학습 셋에서의 비율(expected)을 비교해요. 결과는 명확한 임계값에 매핑돼요:

| PSI 값    | 해석                            | 조치                     |
| --------- | ------------------------------- | ------------------------ |
| &lt; 0.1     | 안정 — 분포가 일치함            | 조치 없음                |
| 0.1 - 0.2 | 중간 수준 변화 — 조사 필요      | 면밀히 모니터링          |
| &gt; 0.2     | 유의미한 드리프트 감지          | 재학습 권장              |

## 구현

PSI는 범주형 분포에서 동작하므로 인텐트 분류에 이상적이에요. 모델이 쿼리를 SUMMARIZE, EXTRACT, REASON, SIMPLE_NOTE, SEARCH_ONLY 같은 인텐트로 분류한다면, PSI는 학습과 프로덕션 사이에서 이런 인텐트의 분포를 비교해요.

```python
def compute_psi(expected: dict, actual: dict, epsilon: float = 1e-4) -> float:
    psi = 0.0
    for label in set(list(expected) + list(actual)):
        e = expected.get(label, 0.0) + epsilon
        a = actual.get(label, 0.0) + epsilon
        psi += (a - e) * math.log(a / e)
    return psi
```

양쪽 분포에 더하는 epsilon(1e-4)은 어떤 카테고리의 발생 횟수가 0일 때 `log(0)`을 방지해요. 이건 필수예요 — 학습에 없던 새로운 인텐트 카테고리가 프로덕션에 나타나면 계산이 크래시할 수 있거든요.

### 프로덕션에서 실행하기

PSI를 주간 Celery beat 태스크로 실행하세요. 인텐트별 `guardrails_classification_requests_total` 메트릭으로 Prometheus에서 7일 분류 카운트를 쿼리하고, 학습 시점에 저장된 학습 분포 메타데이터와 비교하세요.

PSI의 장점은 카운터만 필요하다는 거예요 — 모델 추론이 필요 없어요. 라벨의 분포를 비교하는 거지, 예측을 다시 실행하는 게 아니에요. 그래서 어떤 인프라에서든 실행할 만큼 가벼워요.

## PSI가 감지할 수 있는 것과 없는 것

PSI는 **데이터 드리프트**를 감지해요 — 들어오는 데이터의 분포가 변할 때요. 학습 셋에서 SUMMARIZE 쿼리가 40%였는데 프로덕션에서 갑자기 70%가 되면, PSI가 플래그를 올려요.

PSI는 **컨셉 드리프트**를 감지하지 **못해요** — 같은 입력 분포에 대해 올바른 라벨이 바뀔 때요. 사용자가 "요약"을 학습 데이터가 포착한 것과 다른 의미로 쓰기 시작하면, PSI는 안정적인 분포를 보여주는데 정확도는 떨어져요. 컨셉 드리프트에는 지속적으로 업데이트되는 골든 셋에 대한 직접적인 정확도 모니터링이 필요해요.

## PSI를 사용할 때

- 입력 분포가 시간에 따라 변할 수 있는 배포된 분류기
- A/B 테스팅의 가벼운 모니터링 보완책
- 섀도 추론을 실행할 수 없을 때(PSI는 예측이 아닌 카운터만 필요)

## 사용하지 않을 때

- 회귀 모델 — Kolmogorov-Smirnov 테스트나 Wasserstein 거리를 대신 사용하세요
- 실시간 감지 — PSI는 집계된 시간 윈도우(7일, 30일)에서 동작하지, 요청별로 동작하지 않아요
- 컨셉 드리프트가 주요 관심사인 경우 — PSI는 도움이 안 돼요

## 핵심 교훈

PSI는 "내 모델의 입력 분포가 변했나?"라는 질문에 하나의 숫자로 답해줘요. 계산이 싸고, 이해하기 쉽고, 정확도가 떨어지기 전에 데이터 드리프트를 잡아줘요. log(0)을 피하기 위해 epsilon을 추가하고, Prometheus 카운터에서 주간으로 실행하고, PSI > 0.2에 알림을 설정하세요.

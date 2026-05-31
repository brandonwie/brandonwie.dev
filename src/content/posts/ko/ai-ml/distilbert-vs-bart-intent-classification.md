---
title: "Phase A→B 분류기 배포: 제로샷에서 파인튜닝까지"
description: >-
  라벨링된 데이터 없이 첫날부터 동작하는 인텐트 분류기를 배포하고,
  예시가 모이면 도메인 특화 모델로 졸업하는 방법을 알아보세요.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-18"
tags:
  - ai-ml
  - nlp
  - intent-classification
  - distilbert
  - bart
  - model-selection
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: distilbert-vs-bart-intent-classification
source_updated: "2026-04-18"
translation_date: "2026-04-18"
references:
  - url: 'https://huggingface.co/distilbert-base-uncased'
    title: DistilBERT model card
    type: official
  - url: 'https://huggingface.co/facebook/bart-large-mnli'
    title: BART-MNLI zero-shot classification model
    type: official
---

새로운 도메인용 인텐트 분류기를 구축할 때, 첫날에는 라벨링된 데이터가 없어요. 동작하는 분류기를 즉시 배포하면서 동시에 도메인 특화 모델을 향해 나아가려면 어떻게 해야 할까요? 답은 업계가 수렴한 2단계 배포 패턴이에요.

## 콜드 스타트 문제

사용자 쿼리를 인텐트 — SUMMARIZE, EXTRACT, REASON, SEARCH_ONLY — 로 분류해야 하는데 학습 데이터가 없어요. 카테고리당 500개 이상의 예시를 수집하고 라벨링하는 데 몇 주가 걸려요. 그동안 사용자는 지금 당장 이 기능이 필요해요.

이게 전형적인 ML 콜드 스타트예요: 사용자를 서빙하려면 모델이 필요하고, 모델을 학습시키려면 사용자 데이터가 필요해요. 2단계 접근법이 이 닭과 달걀 문제를 해결해요.

## Phase A: BART-MNLI로 제로샷

BART-MNLI (~400MB)로 시작하세요. 학습 데이터가 필요 없는 제로샷 분류 모델이에요. 분류를 자연어 추론(NLI)으로 프레이밍해요: "이 텍스트가 '이것은 요약 요청이다'를 함의하는가?" 이 NLI 프레이밍은 어떤 라벨 셋에서든 동작해요 — 인텐트를 숫자 클래스가 아닌 일반 영어 설명으로 정의하면 돼요.

Phase A는 즉시 배포할 수 있어요. 정확도는 괜찮지만(~85%) 도메인에 특화되지는 않아요. 진짜 가치는 사용자 수정과 피드백을 통해 라벨링된 데이터를 수집하기 시작한다는 거예요. 사용자가 잘못된 분류를 수정할 때마다 무료 학습 예시를 얻게 돼요.

## Phase B: 파인튜닝된 DistilBERT

카테고리당 ~500개 이상의 라벨링된 예시가 모이면(사용자 수정, 골든 셋 큐레이션, 증강을 통해) DistilBERT (~250MB)를 파인튜닝하세요. 추론 속도가 4배 빠르고(~12ms vs ~50ms), 40% 작고, 도메인 특화 정확도가 더 높아요(~95% vs ~85%).

전환 파이프라인은 이렇게 생겼어요:

```text
라벨링된 데이터 수집 (수정, 골든 셋)
  → 증강 (템플릿, 유의어)으로 클래스당 500+ 달성
  → HF Trainer + early stopping으로 DistilBERT 파인튜닝
  → 골든 셋 대비 평가 (accuracy >= 0.90, f1 >= 0.88)
  → 섀도 비교 (두 모델 동시 실행, 메트릭 비교)
  → 수동 프로모션 (MLflow에서 Staging → Production)
```

## 모델 비교

| 차원                | BART-MNLI (Phase A)      | DistilBERT (Phase B) |
| ------------------- | ------------------------ | -------------------- |
| 모델 크기           | ~400MB                   | ~250MB               |
| 추론 속도           | ~50ms/샘플               | ~12ms/샘플           |
| 학습 데이터 필요량  | 0                        | 클래스당 500+        |
| 정확도 (도메인)     | 괜찮음 (~85%)            | 더 좋음 (~95%)       |
| 유연성              | 아무 라벨이나 가능       | 고정된 라벨 셋       |
| 아키텍처            | 12층 encoder-decoder     | 6층 encoder          |

## 왜 이 패턴이 업계 표준인가

이 2단계 접근법은 새로운 게 아니에요. Google이 사용하고(제네릭으로 시작, 데이터 수집, 특화), Spotify가 콘텐츠 태깅에 적용하고(제로샷 → 파인튜닝), 대부분의 기업 ML 팀이 같은 흐름을 따라요. 이 패턴이 동작하는 이유는 배포와 데이터 수집을 분리하기 때문이에요 — 더 나은 모델을 병렬로 구축하면서 즉시 가치를 전달해요.

## 이 패턴을 사용할 때

- 라벨링된 데이터가 아직 존재하지 않는 새로운 분류 작업
- 사용자 수정이 지속적인 라벨링 시그널을 제공하는 제품
- 전환 후 모델 크기가 중요한 리소스 제한 환경(NAS, 엣지)

## 사용하지 않을 때

- 이미 풍부한 라벨링 데이터가 있는 경우 — Phase A를 건너뛰세요
- 카테고리가 자주 변경되는 경우 — 제로샷의 유연성이 파인튜닝보다 영구적인 이점일 수 있어요
- 분류 작업이 NLI 프레이밍으로는 너무 미묘한 경우(예: 미세한 감성 구분)

## 프로덕션 함정: HuggingFace 파이프라인은 자동 truncation을 안 해요

"링크 콘텐츠에서 분류가 멈춘다"는 결정적 버그로 꽤 많은 디버깅 시간을 쓴 뒤에야 이 원인에 도달했어요. BART(1024 토큰 컨텍스트)와 DistilBERT(512 토큰 컨텍스트) 모두 고정된 컨텍스트 윈도우를 가져요. HuggingFace `transformers` 파이프라인은 기본으로 입력을 _자동 truncation 하지 않아요_ — 경고만 로그하고 초과 크기 입력을 그대로 처리하려고 해요. zero-shot-classification의 경우, 이건 N번의 forward pass 각각이 초과 크기 입력에서 돌아간다는 뜻이에요. 20KB 기사(~5000 토큰)면 CPU에서 전체 지연이 30~60초를 넘길 수 있어요. 보통 100 토큰 입력에서 기대하는 ~200ms 대신에요.

해법은 항상 `truncation=True`와 `max_length=<context_window>`를 명시적으로 전달하는 거예요:

```python
# 올바른 방식 — 명시적 truncation
_CLASSIFIER_MAX_TOKENS = 1024  # BART; DistilBERT는 512

result = self._pipeline(
    text,
    candidate_labels=candidate_labels,
    multi_label=multi_label,
    truncation=True,                     # ← 필수
    max_length=_CLASSIFIER_MAX_TOKENS,   # ← 필수
)
```

**왜 제로샷에서 더 나빠지는가.** 제로샷은 후보 라벨당 forward pass를 한 번씩 돌려요. 라벨 5개와 초과 크기 입력이면 속도 저하 페널티를 5배로 내게 돼요. 단일 라벨 분류기(회귀, 이진)는 한 번만 내요.

**왜 RAG나 콘텐츠 추출 파이프라인에서 중요한가.** 분류기 입력이 스크래핑되거나 LLM이 추출한 텍스트(기사, PDF, 웹 콘텐츠)에서 올 때 입력 크기가 변동이 커요 — 수백 토큰부터 수십만 토큰까지. 적대적 크기 입력을 가정하세요. 명시적 truncation은 다중 방어예요.

**왜 인텐트 분류에서 tail은 보통 중요하지 않은가.** 인텐트("요약해줘", "데이터 추출해줘", "그냥 저장해줘")는 보통 문서의 처음 500~1000 토큰에서 결정 가능해요. 분류용으로는 tail 손실이 괜찮아요. PII 스캔과 콘텐츠 요약은 여전히 전체 텍스트를 봐야 해요 — 그건 truncation 되지 않은 입력에서 따로 돌리세요.

**상수는 모델 비특정적으로 이름 붙이세요.** `_BART_CONTEXT_WINDOW`는 DistilBERT(512)로 바꾸는 순간 misleading해져요. `_CLASSIFIER_MAX_TOKENS`로 이름 붙이고, 코멘트로 현재 모델을 문서화하세요. Phase B 전환 시 모든 호출부가 아닌 값 하나만 업데이트하면 돼요.

### 짚고 넘어갈 사실 정정

이 글을 쓰면서 Phase A→B 전환을 "다른 BART 변종으로 바꾸기"라고 무심하게 표현하고 있었다는 걸 알아챘어요. 틀렸어요. DistilBERT는 encoder-only BERT distillation이에요(Sanh et al., 2019). BART는 encoder-decoder seq2seq 모델이에요(Lewis et al., 2019). 서로 다른 모델 계열이에요. MNLI 제로샷 래퍼는 적절한 파인튜닝이 있으면 어느 아키텍처와도 동작하지만, 코드 코멘트에서 둘을 혼용하는 건 피해야 할 정확성 오류예요.

## 핵심 교훈

완벽한 데이터를 기다리며 분류기 배포를 미루지 마세요. 제로샷(BART-MNLI)으로 시작하고, 사용자 상호작용을 통해 데이터를 수집하고, 충분한 예시가 모이면 파인튜닝된 모델(DistilBERT)로 졸업하세요. 2단계 패턴은 첫날부터 배포하고 지속적으로 개선할 수 있게 해줘요.

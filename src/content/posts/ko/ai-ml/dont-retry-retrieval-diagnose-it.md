---
title: 검색 실패는 재시도하지 말고 진단하세요
description: >-
  검색 결과가 부실할 때 우리는 반사적으로 재시도를 떠올려요. 하지만 Wei et al.(2026)은
  out-of-distribution 쿼리에서 재시도가 오히려 오류를 키운다는 걸 보여줍니다. 재시도 대신 실패를
  진단하세요.
date: 2026-05-24T00:00:00.000Z
updated: '2026-05-26'
tags:
  - ai-ml
  - agent-architecture
  - rag
  - failure-routing
  - transferable
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: dont-retry-retrieval-diagnose-it
source_updated: 2026-05-26T00:00:00.000Z
translation_date: '2026-05-26'
---

검색 증강(retrieval-augmented) 시스템이 첫 검색에서 부실한 결과를 내놓으면, 다음 행동은 거의
자동으로 정해져요. 재시도(retry)죠. 쿼리를 다시 던지고, 이전 맥락을 덧붙여서 두 번째 시도가 좀 더
가까운 답을 주길 기대해요. 이 반사 신경은 안전하게 느껴져요. 불안정한 네트워크 호출에 backoff를
거는 것과 같은 본능이니까요. 그런데 Wei et al.(2026) 논문을 읽고 이 기본값이 틀렸다는 걸 알게
됐어요. 단순 재시도는 도움이 안 되는 정도가 아니라, 정작 가장 중요한 쿼리에서는 이미 손에 쥐고 있던
신호(signal)를 적극적으로 파괴해요.

## 문제는 꼬리(tail)에서 생겨요

피해는 out-of-distribution(OOD) 쿼리에서 드러나요. 낯설고, 어색하게 표현되고, 여러 단계를 거쳐야
하는 질문들요. 프로덕션 RAG 시스템이 마주치는 쿼리의 꼬리(tail) 대부분이 여기에 해당해요. 분포
안(in-distribution), 그러니까 retriever가 이미 잘 동작하는 영역에서는 어느 쪽을 고르든 별로 중요하지
않아요. 재시도가 조용히 발목을 잡는 건 바로 OOD에서예요.

흥미로운 지점은 실패 _탐지_가 아니에요. Adaptive-RAG 시스템은 이미 부실한 검색을 탐지해요. 핵심은
실패를 탐지한 다음 행동으로 옮기기까지의 그 틈이에요. 그 틈에서 무엇을 하느냐가 승부를 가르죠.

그 틈을 제대로 다루면 얼마나 이득일까요? OOD 벤치마크(MuSiQue, 2WikiMultiHopQA)에서 typed
routing은 binary gating을 평균 **+9.85 ACC** 앞섰어요. MuSiQue의 +6.1과 2WikiMultiHopQA의
+13.6을 평균한 값이죠. 분포 안에서는 베이스라인이 이미 잘 동작하니까 이득이 **+0.8 ACC**로 줄어요.
OOD 이득이 분포 안 이득의 약 **12배**예요. 이렇게 읽으면 돼요. 실제 쿼리가 어렵고 낯설수록 이
차이가 더 크게 벌어진다고요.

이 글은 제가 논문에서 가져온 것들이에요. 왜 재시도가 함정인지, "재시도 대신 진단"이 실제로 무슨
뜻인지, 제 지식 시스템에 어떻게 적용했는지, 그리고 아직 근거가 부족한 부분은 어디인지요.

## 들어가며 마주친 세 가지 함정

함정부터 짚을게요. 각각이 제가 논문을 잘못 읽고 엉뚱한 결론을 내릴 수도 있었던 지점이거든요.

**1. 재시도는 중립처럼 보이지만 아니에요.** 논문 § 4.4 사례 연구가 기억에 남아요. 어떤 영화의
개봉일을 묻는 질문이 1라운드에서 실패해요. binary-gating 베이스라인은 이전 맥락을 이어 붙여 2라운드
쿼리를 만드는데, 질문과 무관한 "일본 록 밴드"로 표류해요. 3라운드는 그 표류를 더 키우고요. 재시도는
호출 한 번을 낭비한 게 아니라, 사실 정답에 더 가까웠던 1라운드 신호를 덮어써 버린 거예요. 여기서
재시도는 공짜가 아니에요. 마이너스죠.

**2. 신호 출처(signal source)를 오해하기 쉬워요.** 제목은 "hidden-state probing"을 내세워요. 그래서
"typed routing이 동작하려면 신경망 prober가 필요하구나"라고 결론짓기 쉬워요. 하지만 핵심 표를 보면
prober는 binary-gating 베이스라인과 typed-routing 시스템에서 _똑같이_ 고정돼 있어요. 같은 probe, 같은
모델이죠. +9.85의 이득은 탐지 _이후에 무엇을 하느냐_, 즉 routing의 granularity에서 나오지 detector
자체에서 나오는 게 아니에요. 이 구분이 논문에서 가장 재사용 가치가 높은 아이디어인데, 제목이 오히려
그걸 가려 버려요.

**3. taxonomy 크기의 함정.** corrective skill이 많을수록 안전하게 느껴져요. 어휘가 풍부하면 더 많은
경우를 다룰 수 있을 것 같잖아요? 후속 t-SNE는 정반대를 보여줘요. 어휘를 6개쯤 넘겨서 늘리면(논문은
LLM으로 추가 skill을 자동 생성해요) routing이 의존하는 클러스터 구조가 무너져요. router는 자기가
구분하지 못하는 클래스를 분리할 수 없으니까요. 작고 또렷한 게 크고 흐릿한 것보다 나아요.

## 발상의 전환: diagnose → route → apply

말로는 간단하지만 결과는 큰 변화예요. 이걸:

```text
if (failed) retry()
```

이렇게 바꿔요:

```text
diagnose(failure)  → 실패 유형을 분류
route(class)       → 유형별 corrective skill 선택
apply()            → 다시 검색, 다시 probe; 성공하거나 깔끔하게 종료할 때까지 반복
```

먼저 실패 클래스를 진단해요. 쿼리가 너무 광범위한가? 전제들이 뒤엉켜 있나? 표면 형태(surface form)가
어긋났나? 아니면 정말로 환원 불가능한가(irreducible)? 어떻게 다시 써도 안 되는 경우 말이에요.
그다음 _그_ 클래스에 맞춘 corrective skill로 route하고, 적용한 뒤 다시 probe해요. 루프는 성공하거나
깔끔하게 "포기"할 때 빠져나와요. 같은 primitive를 계속 갈아 넣는 대신에요.

Wei는 corrective skill을 네 가지 제시해요. query rewriting, question decomposition, evidence
focusing, 그리고 exit이죠. 저는 이 패턴을 제 지식 시스템에 적용하면서 _구조_, 즉 typed routing은
그대로 가져오되 신호 출처는 바꿨어요. hidden-state prober 대신, 이미 갖고 있던 관찰 가능한 워크플로
텔레메트리로 route했죠. 빈 결과 집합, 반복되는 grep, broad-hit 개수, 오래된 인덱스 수정 시각(mtime),
privacy-gate 거부, tool-error 클래스 같은 것들요. 제 코퍼스는 닫혀 있고 타입이 잘 잡혀 있어서 이런
관찰 신호만으로 충분했어요. probe를 따로 학습시킬 필요가 없었어요.

그렇게 만든 게 7개 행을 가진 routing 규칙 하나예요. 네 개는 논문에서 가져왔고, 세 개는 여러
레이어로 된 검색 코퍼스에 맞춘 고유한 행이에요.

| Wei 2026 skill         | 내 시스템의 routing 행                       | 상태                              |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| query rewriting        | `surface_mismatch` (탐지 전용)              | 대신 인덱스 시점 `aliases:`로 위임 |
| question decomposition | `entangled_request` → 분해                  | 사용 중                           |
| evidence focusing      | `broad_evidence` → 누락 슬롯으로 좁히기     | 사용 중                           |
| exit                   | `irreducible` 종료                          | 사용 중                           |
| (내 코퍼스 고유)       | `tool_layer_mismatch` → 레이어 재라우팅     | 사용 중 — 5개 레이어 검색 표면    |
| (내 코퍼스 고유)       | `stale_or_private_context` (staleness)      | 사용 중 — mtime 인식 인덱스       |
| (내 코퍼스 고유)       | `stale_or_private_context` (privacy)        | 사용 중 — privacy gate            |

살아 있는 규칙은 이후 이 7개를 넘어 더 커졌어요. 다른 논문에서 가져온 reasoning-step 검색,
abstraction 재정렬(re-ranking) 행이 추가됐죠. 위 매핑은 비교를 깔끔하게 두려고 Wei에서 파생된
집합으로만 한정했어요.

## 왜 효과가 있을까요

재시도 함정이 눈에 들어오면 메커니즘은 거의 자명해요. binary gating은 탐지 이후에 쓸 수 있는 수가 딱
하나예요. 다시 가는 것. 그래서 맥락만 더 붙인 채 같은 주사위를 다시 굴릴 수밖에 없고, 그게 표류로
이어져요. typed routing의 강점은 실패 클래스마다 _다른_ corrective action을 준다는 거예요. 그리고
1라운드 신호를 덮어쓰는 대신 보존하죠. 이득이 OOD에 몰리는 이유도 여기 있어요. 단 한 번의 재시도가
회복은커녕 오류를 키우기 가장 쉬운 영역이 바로 OOD니까요.

## 언제 쓰고, 언제 쓰지 말까요

typed routing이 맞는 경우:

- 실패 표면에 **분류 가능한 구조**가 있을 때 — 미리 이름 붙일 수 있는 모드가 셋 이상일 때요.
- 클래스별 corrective action이 **뚜렷하고 범위가 잘 잡혀 있을 때** — 그냥 "더 열심히"가 아니라요.
- 실패 클래스 신호를 **추가 LLM 추론 비용 없이 관찰**할 수 있을 때.
- 실제 실패의 대부분을 **어려운/OOD 케이스가 차지**할 때.

그냥 재시도가 맞는 경우:

- 실패가 **단일하거나 분류 불가능**할 때 — 무작위 노이즈, 일시적 네트워크 오류 같은 거요. backoff를
  곁들인 재시도가 맞는 도구예요.
- 어휘가 **커질 때(corrective skill 6개 초과)**. 분리 가능성의 한계를 넘으면 routing은 추측이 돼요.
  taxonomy 크기의 함정을 다시 만든 셈이죠.
- **실패 비용이 낮고 재시도가 쌀 때.** 진단 오버헤드가 절감분보다 더 비쌀 수 있어요.

## 아직 확신이 안 서는 부분

근거가 어디서 멈추는지 솔직하게 적을게요.

- **모델 간 근거가 얇아요.** 대표 OOD 수치는 Gemma2-9B예요. 논문이 추가 모델을 언급하긴 하지만,
  핵심 수치는 단일 모델이에요.
- **도메인 전이는 입증되지 않았어요.** 저자들도 그렇게 말해요. open-domain QA에서 끌어낸 어휘가 "과학
  문헌이나 다국어 코퍼스로는 일반화되지 않을 수 있다"고요. 코드, 스키마, 정제된 노트처럼 구조화된
  코퍼스라면 추론 시점의 재작성보다 인덱스 시점의 정렬(예: 저자가 선언한 alias)이 더 중요할 수 있어요.
- **관찰 신호만 쓴 ablation이 없어요.** 논문은 동일한 routing 출력 조건에서 순수 관찰 텔레메트리와
  hidden-state prober를 따로 떼어 비교한 적이 없어요. 그래서 "probe가 꼭 필요하진 않을 수도 있다"는
  제 주장은 추론이지 입증은 아니에요. 제가 가장 답을 알고 싶은 열린 질문이기도 하고요.

> "Experiments demonstrate substantial improvements on hard cases, with
> particularly strong OOD gains, **highlighting the generalization benefit of
> structured skill routing over prober gating alone**." — Wei et al. 2026, § 5

## 기억할 한 문장

검색 실패는 더 열심히 하라는 신호가 아니라 진단하라는 신호로 받아들이세요. 어려운 건 탐지가
아니었어요. 실패를 탐지한 다음 행동으로 옮기기까지의 그 틈에서 무엇을 하느냐죠.

## 참고 자료

- **Skill-RAG: Failure-State-Aware Retrieval Augmentation via Hidden-State
  Probing and Skill Routing** — Wei et al. (2026).
  [arxiv.org/abs/2604.15771](https://arxiv.org/abs/2604.15771)
- **Probing-RAG: Self-Probing to Guide Language Models in Selective Document
  Retrieval** — Baek et al. (2024).
  [arxiv.org/abs/2410.13339](https://arxiv.org/abs/2410.13339)

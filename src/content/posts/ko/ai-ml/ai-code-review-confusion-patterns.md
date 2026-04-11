---
title: AI code review가 틀리는 네 가지 패턴
description: >-
  Claude, Copilot, Codex가 PR에서 뭔가를 틀리게 짚는 네 가지 구체적인 방식. 패턴
  이름, 탐지 신호, 그리고 사실관계 충돌을 해결하는 empirical tiebreaker까지
  정리했어요.
date: 2026-04-08T00:00:00.000Z
updated: '2026-04-11'
tags:
  - ai-ml
  - code-review
  - ai-reviewer
  - confusion-patterns
  - copilot
  - claude
  - codex
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: ai-code-review-confusion-patterns
source_updated: 2026-04-11T00:00:00.000Z
translation_date: '2026-04-11'
---

최근에 `/validate-pr-reviews`라는 workflow를 돌리기 시작했어요. Claude, Copilot, Codex가 diff에 남기는 모든 inline comment를 가져와서, 각각을 valid / invalid / controversial / good-to-have로 분류하는 작업이에요. 목적은 signal 쪽에서 진짜 bug는 잡아내면서 false positive를 구조적으로 걸러내는 거예요.

4월 초에 연달아 올라간 PR 두 개에서 failure mode의 이름을 붙일 수 있을 만큼의 분류 자료가 쌓였어요. 이제는 AI code reviewer가 틀리는 방식을 네 가지로 나눠서 가리킬 수 있어요. 각 패턴마다 구체적인 예시, 탐지 신호, 그리고 예방 기법이 있어요. 아직 샘플은 패턴당 하나씩밖에 없어요. 앞으로 더 많은 PR을 validate하면서 catalog도 늘어날 거라고 봐요. 오늘 공유하고 싶은 건 이 관찰의 모양이에요. 실패 유형에 이름을 붙이고 나니 다음 triage가 훨씬 빨라졌거든요.

## 설정

validation workflow는 AI reviewer가 PR에 남긴 모든 comment를 살펴봐요. 그리고 INVALID로 판정된 finding마다 한 가지 질문을 던져요. *왜 이게 틀렸지?* "reviewer가 왜 헷갈렸지?"가 아니라 "이건 어떤 종류의 reasoning failure에 해당하지?"라고 물어요. PR 두 개가 지난 뒤 네 가지 구별되는 class가 드러났어요.

| 패턴                                     | 처음 본 곳    | 트리거                                                              |
| ---------------------------------------- | ------------- | ------------------------------------------------------------------- |
| Cross-File Blindness                     | NestJS PR     | NestJS decorator vs Express typing                                  |
| Intentional Design                       | NestJS PR     | 이미 inline NOTE로 기록된 trade-off                                 |
| Disagreeing Claim                        | Starlette PR  | 두 reviewer가 정반대 주장을 함. tiebreaker는 실험                   |
| Confidently Wrong on Library Internals   | Starlette PR  | source에 반하는 framework 동작을 자신 있게 재보증                  |

이제 각 패턴을 PR 증거와 함께, 그리고 탐지에 대해 배운 점과 함께 살펴볼게요.

## Pattern 1 — Cross-File Blindness

> **한 줄 정의:** reviewer가 함수를 고립된 채로 분석해요. 동작을 결정짓는 관련 파일을 확인하지 않아요.

NestJS PR에서 Copilot이 컨트롤러 parameter `clientTypeHeader?: string`에 배열 normalize가 필요하다고 flag를 걸었어요. 근거는 Express의 raw type signature `string | string[] | undefined`였어요. flag 자체는 Express type과 일관됐지만, 맥락에서는 틀렸어요. NestJS의 `@Headers('key')` decorator는 custom header에 대해 정확히 `string | undefined`를 리턴해요. Express가 중복을 쉼표로 합쳐 normalize해 주기 때문이에요. reviewer는 parameter의 annotation을 보면서도, decorator가 구현된 곳까지 따라가진 않았어요.

**왜 이런 일이 생길까요.** 대부분의 AI reviewer는 single-file 또는 single-diff context window로 동작해요. 현재 파일을 흐르는 타입은 볼 수 있지만, decorator 호출을 따라 dependency 패키지 내부 구현까지 들어가진 못해요. 그래서 "이 decorator가 runtime에서 실제로 뭘 리턴하지?" 하는 질문은 답할 수 없는 질문이 되고, 가장 가까운 도달 가능한 지점의 type signature(보통 raw framework type)가 기본 가정이 돼 버려요.

**탐지 신호.** "framework type이 X라고 말해요"라고 인용하면서, 실제로는 framework decorator가 만들어낸 parameter를 지적하는 모든 flag. 스스로에게 이렇게 물어보세요. *reviewer가 decorator를 찾아봤나, 아니면 parameter에 적힌 타입만 찾아봤나?*

**예방.** flag된 위치에 decorator의 리턴 타입을 명시적으로 알려 주는 보강용 inline NOTE를 달아 주세요. 다음 PR에서 reviewer의 행동이 바뀌진 않겠지만, 같은 패턴이 다시 나타났을 때 triage 시간을 단축해 줘요.

이 case에 대한 기술적인 deep-dive는 별도로 썼어요. Express normalization 동작까지 자세히 알고 싶다면 [NestJS @Headers decorator는 string | undefined를 리턴해요](/posts/nestjs-headers-decorator-typing)를 참고하세요.

## Pattern 2 — Intentional Design

> **한 줄 정의:** 이미 문서화된 trade-off를 reviewer가 문제로 flag해요.

같은 NestJS PR에서, Claude가 auth guard의 mobile header bypass를 security 이슈로 flag했어요. flag된 줄의 두 줄 위에는 이미 inline NOTE가 있었어요. *"알려진 허용 리스크(기존부터 존재) — mobile bypass는 tier model보다 먼저 있었음."* NOTE는 flag된 코드 바로 위, 그것도 평범한 문장으로 써 있었어요.

**왜 이런 일이 생길까요.** AI reviewer는 리스크를 인정하는 inline 문서를 안정적으로 처리하지 못해요. NOTE를 읽고도 마치 없던 것처럼 리스크를 flag해요. 기술적 실패라기보다 철학적 실패예요. reviewer는 "이건 위험해?"를 "팀이 이 리스크를 이미 인지하고 있어?"보다 더 가중치 있게 다뤄요.

**탐지 신호.** flag된 영역 바로 앞뒤에 같은 이슈를 인정하는 NOTE, TODO, comment가 있는지 확인해 보세요. 있으면 이 flag는 이미 있는 문서와 중복돼요.

**예방.** 보이는 것보다 어려워요. "이미 문서화됨"은 신뢰할 만한 skip 사유가 아니에요. AI reviewer가 문서가 있는데도 flag했기 때문이에요. 문서 포맷이 reviewer가 의도적인 수용으로 인식하기엔 충분히 machine-readable하지 않을 수도 있어요. 아직 뾰족한 해법은 없어서 그냥 INVALID로 분류하고 넘어가요.

## Pattern 3 — Disagreeing Claim

> **한 줄 정의:** 두 AI reviewer가 같은 코드에 대해 정반대의 사실적 주장을 해요. 스타일이나 trade-off 차이가 아니에요.

Python PR(crucio 프로젝트, FastAPI / Starlette 스택)에서 Codex가 `main.py`의 `ForwardedHostMiddleware` 등록 순서를 inverted라고 flag했어요. 근거는 이랬어요. *"FastAPI/Starlette에서 `add_middleware()`는 스택처럼 쌓여서 나중에 호출한 게 먼저 실행돼요."* 같은 줄에 대해 Claude-review는 INFO comment로 이렇게 reassurance를 남겼어요. *"`app.add_middleware(ForwardedHostMiddleware)`를 `create_app()`의 첫 호출로 두는 건 맞아요 — Starlette가 index 0에 insert한 뒤 reverse로 적용하니까, 처음 등록된 게 가장 바깥 layer가 돼요."*

이건 스타일이나 trade-off에 대한 의견 차이가 아니에요. Starlette가 실제로 뭘 하는지에 대한 사실적인 disagreement이고, 정답이 분명하게 존재해요.

**Empirical Tiebreaker Protocol.** 두 AI reviewer가 사실적 주장에서 disagree할 때, tiebreaker는 사회적인 게 아니에요. 더 articulate한, 더 장황한, 더 자신 있어 보이는 reviewer 쪽으로 기울면 안 돼요. 6줄짜리 실험을 바로 돌려 보세요.

```python
order = []
def mk(name):
    class M:
        def __init__(self, app): self.app = app
        async def __call__(self, scope, receive, send):
            order.append(name)
            await self.app(scope, receive, send)
    return M
# ... A, B, C를 middleware로 등록한 뒤 TestClient로 앱을 쳐 봐요
# 결과: ['C', 'B', 'A'] — 나중에 추가된 게 먼저 실행돼요. Codex가 맞았어요.
```

실험 자체는 0.2초 걸렸어요. 이 해결은 source 읽기만으로는 불가능했어요. 두 reviewer 모두 Starlette source는 정확히 설명했거든요. 그런데 그중 한 명이 거기서 잘못된 결론을 내렸어요.

**탐지 신호.** 한 reviewer의 finding이 같은 줄의 다른 reviewer의 INFO 또는 LGTM comment와 정면으로 충돌하는 경우를 찾아보세요. 드물지만, 놓치면 치명적이에요. 틀린 쪽 reviewer의 reassurance를 믿고 fix를 ship하면 보통은 구조적으로 망가진 deploy가 돼요. finding만 validate하고 INFO comment는 skim하고 넘어간다면, 이 disagreement를 통째로 놓쳐요.

## Pattern 4 — Confidently Wrong on Library Internals

> **한 줄 정의:** reviewer가 authoritative source에 반하는 library 동작에 대해 긍정적이고 자신 있는 주장을 해요.

이건 Pattern 3 disagreement의 반대편이에요. Starlette middleware 등록에 대한 Claude-review의 full INFO text는 이랬어요.

> "Starlette가 index 0에 insert한 뒤 reverse로 적용하니까, 처음 등록된 게 가장 바깥 layer가 돼요."

앞부분은 맞아요 — Starlette는 실제로 `user_middleware.insert(0, ...)`를 호출하고 나중에 `reversed(middleware)`로 순회해요. 결론이 틀렸어요. "reverse로 적용한다"는 건 *끝에서부터* 순회한다는 뜻이에요. 그러면 index 0에 있는 element(반복된 insert 후엔 *가장 나중에 추가된* middleware)가 가장 바깥쪽 wrapper가 돼요. Claude의 mental model은 "list의 first"를 "first to run"으로 다루면서, reverse iteration 단계를 놓쳤어요.

일반적인 hallucination과 이 패턴을 구별하는 세 가지 신호가 있어요.

1. **긍정적 framing** — "X가 틀렸어요"가 아니라 "X가 맞아요"라고 말해요.
2. **겉보기 self-consistency** — reasoning이 처음 읽으면 그럴듯해요.
3. **구체적인 detail** — 올바른 함수와 primitive(`insert(0, ...)`, `reversed(...)`)를 실제로 언급해요. 그래서 주장이 막연한 것보다 더 믿음직해 보여요.

**왜 일반적인 hallucination보다 나쁠까요.** "잘 모르겠어요"라고 말하는 reviewer는 무시하기 쉬워요. 정확해 보이는 구체적인 detail과 함께 "이게 맞아요"라고 말하는 reviewer는 훨씬 더 second-guess하기 어려워요. Codex가 반대되는 주장으로 같은 코드에 flag를 걸지 않았다면, 이 패턴은 잡히지 못했을 거고 fix는 망가진 상태로 ship됐을 거예요.

**예방.**

- **Library internals는 source 읽기가 아니라 empirical test로 검증하세요.** source 읽기는 "코드가 어떻게 구조화되어 있는지"를 알려 줘요. empirical test는 "실제로 뭘 하는지"를 알려 줘요.
- **자신 있는 긍정적 주장은 더 꼼꼼히 봐야 해요. 덜이 아니라.** reviewer가 "이건 맞아요"라고 말하면 "10줄로 검증할 수 있나?"를 물어보세요. 가능하면 검증하세요. 불가능하면 이 주장이 실제로 load-bearing한지 따져 보고, 그렇다면 검증 코드를 쓰는 게 나을지 결정하세요.
- **"INFO — X가 맞아요" 줄을 load-bearing할 수 있다고 가정하고 읽으세요.** 저는 예전엔 INFO comment를 non-actionable이라는 이유로 skim하고 넘어갔어요. 이제는 library internals를 건드릴 때는 꼼꼼히 읽어요. 진짜 bug를 dismiss하게 만드는 false reassurance가 거기 숨어 있을 수 있거든요.

## Reviewer별 성향

PR 두 개는 firm conclusion을 내리기엔 부족한 데이터지만, 초기 패턴은 적어 둘 만해요.

| Agent   | 가장 자주 나오는 실패 유형                | 강점                                               | 약점                                                                   |
| ------- | ----------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Copilot | Cross-File Blindness                      | 표면 수준의 code quality와 style 체크에 좋아요     | single-file scope로 분석해서 패키지 너머 동작을 놓쳐요                 |
| Claude  | Confidently Wrong on Library Internals    | architectural narrative를 풀어내는 데 강해요       | source에 반하는 framework internals에 자신 있게 reassurance를 줘요    |
| Codex   | (샘플이 너무 적어요)                       | terse하지만 library-internals 주장에 대체로 정확해요 | 아직 샘플이 많지 않아요                                                 |

가장 의외였던 관찰은 articulation과 confidence가 correctness의 proxy가 아니라는 점이에요. Starlette disagreement에서 Claude의 INFO는 articulate하고 상세했고 틀렸어요. Codex의 flag는 terse했고 맞았어요. tiebreaker는 reviewer의 연차나 글솜씨가 아니라 0.2초짜리 실험이었어요.

## 정리

- **count=1이어도 네 가지 실패 유형에 이름을 붙일 가치가 있어요.** 분류의 목적은 통계적 significance가 아니에요. 다음 PR의 triage를 빠르게 하는 거예요. 일단 패턴에 이름이 생기면 실전에서 알아보게 돼요.
- **보강 NOTE는 가장 효과적인 예방법이에요. 단, Pattern 1과 2에 한해서요.** Disagreeing Claim과 Confidently Wrong에는 inline 문서가 얼마나 있든 도움이 안 돼요. empirical check가 필요해요.
- **Empirical Tiebreaker Protocol이 workflow 전체에서 가장 leverage가 높은 기법이에요.** 두 reviewer가 disagree할 때, workflow의 역할은 그 disagreement를 flag하고 실험을 강제하는 거예요. 이 순간이 바로 전체 process가 스스로의 값어치를 하는 지점이에요. confident but wrong한 reassurance 때문에 dismiss될 뻔한 critical bug 하나를 잡아 주거든요.
- **INFO comment가 library internals를 건드릴 땐 꼼꼼히 읽으세요.** Pattern 4가 가장 자연스럽게 자리 잡는 곳이에요.

이 catalog는 계속 늘어날 거예요. 목적은 포괄적인 taxonomy를 만드는 게 아니라, 다음 bug의 triage를 바로 이전보다 더 쉽게 만드는 거예요. PR에 AI code review를 돌리고 있는데 false positive를 분류해 본 적이 없다면, 실패의 모양에 이름을 붙이는 것부터 시작해 보는 걸 권해요.

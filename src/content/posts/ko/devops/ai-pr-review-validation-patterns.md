---
title: AI PR 리뷰 검증 패턴
description: >-
  AI 코드 리뷰어(Claude, Copilot, Codex)가 오탐을 만드는 14가지 패턴과, triage를 빠르게 유지하는 분류 프레임워크
  + 보강 주석 템플릿.
date: 2026-01-23T00:00:00.000Z
updated: '2026-07-31'
tags:
  - devops
  - ai
  - code-review
category: devops
draft: false
lang: ko
source_lang: en
source_slug: ai-pr-review-validation-patterns
source_updated: '2026-07-31'
translation_date: '2026-07-31'
references:
  - url: 'https://docs.github.com/en/rest/pulls/reviews'
    title: REST API endpoints for pull request reviews — GitHub Docs
    type: authoritative
---

## 분류 프레임워크

AI 리뷰 코멘트가 전부 같은 무게를 가지는 건 아니에요. 진짜 버그도 있고, 스타일 선호도 있고, 완전히 틀린 것도 있어요. 단순한 VALID/INVALID 이분법은 얼마 안 가 한계가 왔어요. triage를 빠르게 굴리려면 더 세밀한 등급이 필요했어요.

| 분류                  | 기준                                               | 조치                    |
| --------------------- | -------------------------------------------------- | ----------------------- |
| **VALID BUG**         | 실제 버그, 보안 이슈, 장애 유발                    | 즉시 수정               |
| **VALID IMPROVEMENT** | 올바른 제안, 코드 품질 향상                        | 즉시 수정               |
| **GOOD-TO-HAVE**      | 맞는 지적이지만 우선순위가 낮은 개선               | 쉬우면 수정, 위험하면 skip |
| **CONTROVERSIAL**     | 논쟁의 여지가 있음: 타당하지만 비용 대비 효과 불명   | 건별로 판단             |
| **OPTIONAL**          | 있으면 좋은 수준, 스타일 관련, 긴급하지 않음       | 사용자에게 확인         |
| **INVALID**           | 틀림, context 오해, 해당 안 됨                     | 문서화 + 보강 주석 추가 |

나중에 추가한 GOOD-TO-HAVE와 CONTROVERSIAL 두 등급은 release PR에서 특히 제값을 했어요. feature branch에서는 보통 전부 처리할 수 있어요. 그런데 develop-to-main merge에서 19개 지적을 분류하는 건 성격이 다른 일이라, "맞고 수정할 가치가 있는 것"과 "맞지만 지금 건드릴 가치가 없는 것"을 갈라야 했어요. GOOD-TO-HAVE는 수정이 쉽고 위험이 낮은 개선이에요. CONTROVERSIAL은 AI 지적이 타당하지만 현재 context에서 수정 비용이 이점을 넘는 경우예요. release 중에 27개 test file에 type guard를 추가하라는 지적 같은 거죠.

## AI가 흔히 혼동하는 패턴

### 1. 오래된 Diff / 이미 존재하는 기능

**어떻게 보이나:** 에이전트가 기능이 "없다"고 하지만 현재 코드에 존재해요.

**왜 이런 일이 생기나:** AI가 현재 file 상태가 아닌 PR diff를 review하기 때문이에요. 이전 commit에서 추가된 기능을 놓칠 수 있어요.

**예시:**

```text
에이전트: "CRITICAL: Analytics 서비스 메서드가 Promise.reject('Not implemented')를 반환"
현실: 서비스에 1449줄의 완전한 구현이 있음
```

**예방:** 보강 주석을 추가해요.

```typescript
// NOTE: This service IS FULLY IMPLEMENTED. All 5 analytics calculations
// are complete and production-ready via the consolidated getAnalytics() method.
```

### 2. Request 라이프사이클 오해

**어떻게 보이나:** 에이전트가 필요 없는 곳에 transaction/lock을 제안해요.

**왜 이런 일이 생기나:** AI가 framework별 request 라이프사이클(NestJS, Express)을 이해하지 못하기 때문이에요.

**예시:**

```text
에이전트: "부모 조회와 이동 사이에 race condition — database locking 추가"
현실: NestJS HTTP 요청은 단일 스레드 event loop에서 동기적으로 실행
```

**예방:** 보강 주석을 추가해요.

```typescript
// NOTE: NO RACE CONDITION exists between parent fetch and move operation.
// This entire method executes synchronously within a single HTTP request context.
// Node.js single-threaded event loop guarantees sequential execution.
```

### 3. Webhook 흐름 오해

**어떻게 보이나:** 에이전트가 webhook handler를 transaction으로 감싸라고 제안해요.

**왜 이런 일이 생기나:** AI가 외부 서비스에서 이미 상태를 commit했다는 걸 이해하지 못해요.

**예시:**

```text
에이전트: "softDeleteAllByUserId가 구독 생성과 transaction으로 감싸져 있지 않음"
현실: LemonSqueezy가 이미 구독을 commit함. 우리 코드는 상태를 동기화할 뿐
```

**예방:** 보강 주석을 추가해요.

```typescript
// NOTE: This is intentionally NOT wrapped in a transaction with subscription creation.
// External service already committed; webhook redelivery handles sync failures.
```

### 4. 변수 재할당 인식 실패

**어떻게 보이나:** 에이전트가 destructuring 이후의 할당 흐름을 잘못 읽어요.

**왜 이런 일이 생기나:** AI가 destructuring을 보고 모든 값이 같은 source에서 온다고 가정해요.

**예시:**

```text
에이전트: "retry 후 resyncOccurred가 undefined일 수 있음"
현실: 327번 줄에서 resyncOccurred = true로 명시적 설정 (retryResult에서 온 게 아님)
```

**예방:** 보강 주석을 추가해요.

```typescript
// NOTE: Explicitly set to true (not from retryResult) because 410 recovery IS a resync event.
resyncOccurred = true;
```

### 5. Process 모델 오해

**어떻게 보이나:** 에이전트가 모듈 단위 싱글턴을 thread-unsafe하다고 지적하거나 lock을 추가하라고 제안해요.

**왜 이런 일이 생기나:** AI가 기본적으로 스레드 기반 모델을 가정해요. 그런데 실제 production 환경에서는 프로세스 기반 worker를 쓰는 경우가 많아요. Celery prefork나 gunicorn worker process를 쓰면 각 worker가 자기 메모리 공간을 가져서, 보호할 공유 상태 자체가 없어요.

**예시:**

```text
에이전트: "Global _llm_service is not thread-safe — use threading.Lock"
현실: Celery prefork = 별도 process. 각각 자기만의 global namespace를 가짐
```

Python 프로젝트에서 CodeRabbit이 모듈 단위 변수마다 스레드 안전성 이슈로 지적한 사례예요. Django/Celery 스택에서 prefork worker를 쓰면 각 프로세스가 global namespace의 자기 사본을 갖게 돼요. 스레드 사이에 공유되는 게 없으니 lock을 걸 대상도 없어요.

**예방:** 보강 주석을 추가해요.

```python
# NOTE: Celery prefork model = separate processes, not threads.
# Each worker process gets its own _llm_service singleton. No locking needed.
```

### 6. Pydantic 모델 mutability 가정

**어떻게 보이나:** 에이전트가 Pydantic 모델에 생성 후 속성 할당을 하면 실패하거나 error가 발생한다고 주장해요.

**왜 이런 일이 생기나:** AI가 Pydantic 모델이 기본적으로 immutable이라고 가정해요. 하지만 Pydantic v2 모델은 `model_config = ConfigDict(frozen=True)`를 명시적으로 설정하지 않는 한 mutable이에요. 해당 config 없이는 속성 할당이 정상 동작해요.

**예시:**

```text
에이전트: "GenerateContentConfig assignment after construction won't work"
현실: frozen이 아닌 Pydantic v2 모델 — 속성 할당은 유효
```

Pydantic v2에서 `frozen=True` 없이 쓰고 있다면 생성 후 할당은 완전히 정상이에요. AI가 모델 config를 확인하지 않고 지적하는 거죠.

### 7. Factory pattern default 불일치

**어떻게 보이나:** 에이전트가 constructor의 default parameter 값이 production 설정과 불일치한다고 지적해요.

**왜 이런 일이 생기나:** AI가 constructor signature를 단독으로 비교하고, factory function이 항상 명시적 값을 전달한다는 걸 무시해요. default는 test나 직접 인스턴스 생성을 위한 fallback일 뿐이고 production에서는 실행되지 않아요.

**예시:**

```text
에이전트: "WhisperSTTService default device='cpu' may not match production config"
현실: Factory가 항상 device=settings.WHISPER_DEVICE를 명시적으로 전달
```

constructor에 합리적인 default가 있고 factory가 이를 override하는 구조에서 자주 나타나는 패턴이에요. AI는 default와 config 값 사이의 불일치를 보지만, 실제 호출 경로를 추적하지는 않아요.

### 8. Cross-File 인식 실패

**어떻게 보이나:** 에이전트가 다른 file에 정의된 동작에 대해 질문해요.

**왜 이런 일이 생기나:** AI가 file을 단독으로 review하고 관련 file을 확인하지 않아요.

**예방:** 교차 참조 주석을 추가해요.

```typescript
// NOTE: Related logic in sync-blocks.helper.ts:232 handles resyncRequired
```

## 보강 주석 템플릿

| 패턴                | 템플릿                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| 기능 존재           | `// NOTE: [Feature] IS [implemented/handled] [here/below] - [brief description]`                    |
| Race Condition 없음 | `// NOTE: NO RACE CONDITION - [framework] executes [operation] synchronously within single request` |
| 의도적 설계         | `// NOTE: Intentionally [omitted/designed this way] - [reason]`                                     |
| Cross-File 참조     | `// NOTE: Related logic in [file:line] handles [concern]`                                           |

### 9. Cross-Branch 혼동

**어떻게 보이나:** 에이전트가 코드가 assertion과 모순된다고 주장하면서, PR branch와 일치하지 않는 line 번호를 인용해요.

**왜 이런 일이 생기나:** 미묘한 케이스예요. PR target이 `main`이 아닌 `develop`일 때, AI reviewer가 실제 target branch 대신 `main` branch 코드를 분석하는 경우가 있어요. 이전 PR에서 이미 `develop`에 merge된 변경이 있으면, reviewer는 `main`의 이전 코드를 보고 존재하지 않는 모순을 지적해요.

**예시:**

```text
에이전트: "Lines 796-800 set deletedAt unconditionally — toBeNull() should fail"
현실: 해당 줄은 develop에서 NOTE 주석임. if 블록은 PR #711에서 제거됨
```

PR #712에서 실제로 겪은 사례예요. Claude가 `main` branch 코드를 분석해서 test assertion이 잘못됐다고 지적했어요. 하지만 `develop`에서는 인용한 줄이 이미 주석으로 교체된 상태였어요. 이전 PR에서 production 코드가 바뀌었거든요. assertion은 현재 `develop` 상태 기준으로는 정확했어요.

**예방:** test 위치에 보강 주석을 추가해요.

```typescript
// NOTE: The deletedAt-setting code was removed in PR #711. This test verifies
// the post-removal behavior: Event blocks only get itemStatus=Deleted, no deletedAt.
```

### 10. Large Diff Blindness (GitHub API 406)

**어떻게 보이나:** AI reviewer가 release PR에서 코멘트를 반환하지 않거나 극히 적은 피드백만 줘요.

**왜 이런 일이 생기나:** GitHub API가 PR diff가 20,000줄을 넘으면 HTTP 406을 반환해요. Release PR(develop to main)은 이 제한을 자주 넘어요. diff API endpoint에 의존하는 AI reviewer는 분석할 데이터 자체가 없어서, 빈 review를 만들거나 file 이름만 보고 추측해요.

**우회 방법:** `git diff origin/main..origin/develop`으로 diff를 로컬에서 생성하고 도메인별로 review agent에 나눠서 전달해요. API 제한을 비껴가면서, 각 reviewer가 실제로 읽어낼 수 있는 크기의 chunk를 넘길 수 있어요.

### 11. Release PR에서의 Authorship 범위 지정

**어떻게 보이나:** review 지적이 다른 팀원이 작성한 코드를 지적해요.

**왜 중요한가:** Release PR은 보통 여러 작성자의 squash merge예요. 팀 전체가 쓴 코드를 줄 단위로 다 보면 시간만 태우고, 처리할 수도 없는 noise가 쌓여요. 다른 사람의 구현 결정은 제가 맥락을 모르니까요. 그래서 severity가 CRITICAL이 아닌 이상 제 commit에만 집중해요.

**방법:** 분류 전에 authorship을 확인해요.

```bash
git log origin/main..HEAD -- {file} --format="%h %ae %s"
```

다른 사람이 쓴 코드에 대한 지적은 finding registry에서 N/A로 표시하고, 작성자와 관계없이 CRITICAL만 에스컬레이션해요. PR #710에서는 이 방식으로 15개 고유 지적 중 7개가 분류를 시작하기도 전에 손에서 떨어져 나갔어요.

### 12. 마크다운 포매팅 환각

**어떻게 보이나:** Reviewer가 마크다운 테이블에 포매팅 문제가 있다고 주장해요(예: "앞에 `||`가 와서 빈 첫 번째 열이 생김"). 실제로는 테이블이 완벽하게 유효한데도요.

**왜 이런 일이 생기나:** Copilot이 실제 file 내용을 파싱하지 않고, 흔한 마크다운 문제에 대한 패턴 매칭으로 포매팅 지적을 만들어내는 경우가 있어요. 다른 혼동 패턴이 코드 로직을 잘못 읽는 것과 달리, 이건 순수하게 날조된 거예요. file 어디에도 없는 구문 문제를 reviewer가 지어내는 거죠.

이 패턴이 특히 비용이 큰 이유는 비슷한 file 수에 비례해서 늘어나기 때문이에요. 비슷한 구조의 file이 많은 문서 전용 PR(예: 11개 README)을 review할 때, 환각이 모든 file에서 반복되면서 지적 수가 부풀어 올라요.

**예시:**

```text
에이전트: "이 README의 테이블은 각 행이 `||`로 시작해서 GitHub이 빈 첫 번째 열을 렌더링한다."
현실: 테이블은 표준 `| col | col |` 형식 — 이중 파이프는 어디에도 없음.
```

crucio PR #40에서 실제로 겪은 사례예요. 18개 Copilot 지적 중 12개(67%)가 11개 README file에 걸쳐 이 똑같은 환각이었어요. 테이블 포매팅 문제는 단 하나도 없었어요. 처음에는 각 file을 개별적으로 확인하려 했지만, 두 번째 지적이 동일하다는 걸 확인한 후 나머지를 일괄 기각해서 한 시간 넘게 절약했어요.

**예방:** 문서 PR에서는 지적된 file 하나를 먼저 스팟 체크하세요. 첫 번째 지적이 false positive면, 개별 review 없이 비슷한 지적을 일괄 기각하세요.

### 13. Cross-Skill Name Confusion (Phantom Comparison)

**어떻게 보이나:** Reviewer가 권위 있어 보이는 line 번호와 field 이름을 인용해요. 그런데 실제 file에 `grep -n` 해보면 완전히 다른 내용이 나와요. Reviewer가 제안하는 "누락된 fix"는 review 중인 file을 깨뜨리지만, 이름 root를 공유하는 *다른* skill이나 module에는 맞을 거예요.

**왜 이런 일이 생기나:** 두 skill이 이름 root를 공유하고 둘 다 세션의 skill registry에 있을 때, AI reviewer가 그 schema들을 mental하게 merge해서 PR을 *다른* 쪽 skill의 동작에 대해 review할 수 있어요. 모델이 line-level "finding"을 만들어내는데, 그 내용이 우리 file에는 없지만 conflated된 sibling에는 있는 거예요.

**예시 (3B PR #19, 4월 말):**

Codex가 `/interview`(markdown 전용 Socratic skill, 런타임 의존성 0) import를 살펴봤어요. Codex가 내놓은 지적은 다음과 같았어요.

- "SKILL.md:33의 curl 버전 체크". 33번 줄은 `## Instructions` 헤더였고, 소스 어디에도 curl은 없어요.
- "SKILL.md:93의 MCP 질문". 93번 줄은 code-confirmation 예시였고, 소스 38번 줄에는 "MCP tools 없음"이라고 못 박혀 있어요.
- "summary를 `ooo seed` 산출물로 교체". 그런데 `ooo seed`는 같은 세션 registry에 있는 다른 skill, `/ouroboros:interview`의 산출물이에요.
- "MCP 응답 계약 강화: `meta.session_id`, `meta.is_complete`". 소스에는 MCP 계층 자체가 없어요. 순수한 conversation engine이거든요.

네 finding 전부 `/ouroboros:interview`(Python/MCP/`ooo seed` 생성)에 적용될 내용이었어요. Codex가 이름이 같다는 점과 같은 세션에 둘 다 떠 있다는 점 때문에 두 skill을 섞어서 본 것 같아요. 5개 중 1개(dead filesystem link)만 유효했어요.

**왜 AI reviewer 휴리스틱이 실패하나:**

- Skill registry가 이름이 겹치는 여러 skill을 노출해요(`/interview`와 `/ouroboros:interview`).
- LLM reviewer가 가끔 어느 skill인지 grounding 없이 "the skill"이라고 인용해요.
- *다른* skill이 internally consistent하니까 confidence가 높게 유지돼요. reviewer의 mental model이 깨진 게 아니라, 잘못된 target을 가리키고 있을 뿐이에요.
- output이 specific해 보이지만(line 번호, field 이름) review 중인 file에 대해서는 fabricated예요.

**예방: 교차 확인 규율.** 특정 line, file, API를 인용한 AI review finding이라면 모두 다음을 실행하세요.

```bash
grep -n -i '<claimed-string>' <claimed-file>
sed -n '<claimed-line>p' <claimed-file>
```

grep이 비어 있거나 line이 다른 내용을 보여주면, finding은 hallucinated이거나 phantom version과 비교 중이에요. grep이 확인할 때까지 모든 미검증 주장을 INVALID로 다루세요. finding당 ~5초 추가되고, 그렇지 않으면 30+ 분 낭비할 cross-skill confusion을 잡아요.

**Reviewer 비대칭(같은 PR의 데이터 포인트):** 같은 PR의 3b-forge plugin review는 grounded였어요. 5개 finding 중 4개가 valid였죠. 세션에 skill 이름 충돌이 있을 때는, 실제 repo file 구조 위에서 도는 plugin reviewer가 세션 scope reviewer(Codex)보다 정밀도 높은 output을 내요.

### 14. 병렬 세션이 작업 중인 checkout에서의 Stale Local Read

**어떻게 보이나:** 방금 읽은 function이 commit된 버전과 달라요. `git status` 결과가 연속으로 실행한 두 명령 사이에 달라져요. `--limit 1`로 확인한 CI run은 skip된 것처럼 보이는데, 진짜 run은 목록 한 줄 아래에서 진행 중이에요.

**왜 이런 일이 생기나:** 이 패턴은 나머지 열세 개와 방향이 달라요. 이번엔 stale한 게 AI reviewer가 아니라 저예요. 다른 세션이 같은 working checkout을 공유하며 활발하게 commit하고 있으면, file과 git·CI 상태를 담아둔 in-memory model이 읽은 시점과 다음 주장 사이에 stale해져요. 그러면 HEAD와 더 이상 일치하지 않는 bytes를 놓고 review하거나 보고하게 돼요.

**예시 (codex-hud PR #20):**

제가 읽은 `syncPatchedRuntime` body는 병렬 lane이 수정 중이던 working-tree 상태(reconcile-first)였어요. commit된 버전(`b51e659`)은 이미 reconcile-after-repair로 순서를 바꾼 뒤였죠. 이제는 존재하지도 않는 코드를 막겠다고 불필요한 guard를 추가할 뻔했어요. 같은 PR에서 "Claude review가 skip됐다?!" 경보는 `gh run list --limit 1`이 skip된 중복 `issue_comment` event를 잡은 것이었고, 진짜 run은 목록 한 줄 아래에서 진행 중이었어요.

같은 실패 모드는 반대 방향으로도 작동해요. 이 블로그 repo의 PR #22에서는 bare working-tree read에 깨끗한 코드가 보인다는 이유로 Claude review finding을 오탐으로 기각했어요. 그런데 그 finding은 진짜였어요. 공유 checkout의 다른 세션이 버그를 이미 로컬에서 고쳐둔 상태(`47e90be`)라, reviewer가 분석한 pushed head에는 버그가 그대로 있었거든요. 두 번째 reviewer pass가 이 오판을 잡았어요. stale read에서 나온 과잉 회의(over-skepticism)는 과잉 신뢰만큼 비싸요. multi-session tree에서는 AI finding을 bare working-tree read가 아니라 `git show origin/<branch>:<file>`과 `git log`로 검증하세요.

**예방:** 공유 checkout에서 "done", "남은 것 없음", "이게 그 코드다" 같은 주장을 하기 전에 ground truth를 다시 확인하세요.

```bash
git rev-parse HEAD
git status
git log --oneline
git show origin/<branch>:<file>   # reviewer가 실제로 본 bytes
```

그다음 실제 file을 다시 읽으세요. in-memory model은 절대 믿지 말고요. CI는 `--limit 1`이 아니라 여러 run을 나열해서 확인하세요. 병렬 lane이 같은 file에서 앞서가고 있다면 작업을 중복하지 말고 물러서세요. 한창 구현 중인 세션이 그 변경의 주인이니까요.

## Agent 간 convergence를 severity 신호로 읽기

위 패턴들은 대부분 PR에 코멘트를 다는 bot 하나에서 나왔어요. proactive review는 결이 좀 달라요. 독립적인 slice agent 여러 개가 같은 diff를 다른 누구보다 먼저 읽어요. 이때는 *agent들의 의견이 어디서 모이고 어디서 갈리는지* 자체가 개별 finding에 없는 정보를 담고 있어요.

의견이 모이면 확신이 올라가요. `/v1/sync` 변경을 proactive review했을 때, 역할이 서로 다른 agent 셋(safety, structure, runtime)이 각자 다른 근거로 똑같은 `lastSyncedAt` starvation 결함을 짚었어요. agent 하나가 같은 말을 세 가지 방식으로 반복하는 것과는 무게가 다르죠. 몇 달 묵은 timestamp 버그가 "누군가의 의견"에서 "제일 먼저 고쳐야 할 것"으로 올라선 것도 이 때문이에요.

의견이 갈릴 때도 신호가 있었어요. test assertion 하나를 두고 두 agent가 severity를 HIGH와 LOW로 정반대로 매겼어요. 한쪽은 조용히 통과해버리는 구멍을 봤고, 다른 쪽은 앞선 assertion이 그 구멍을 가리고 있다는 걸 봤어요. 둘 다 맞았고, 갈린 지점이 곧 가림막이 있던 자리였어요. 중간 severity로 평균 내는 것보다 불일치를 그대로 기록해두는 편이 나았어요.

짚고 넘어갈 게 두 가지 있어요. 의견이 모였다는 건 그 지점이 눈에 띈다는 증거지, 그게 참이라는 증거는 아니에요. 그 review에서 결정을 만든 finding은 분류 전에 전부 소스와 다시 대조했고, client의 retry 동작을 두고 어떤 agent가 내놓은 주장은 repo로는 확인할 수 없는 가정으로 드러났어요. 같은 prompt 틀을 받은 agent들은 그 틀의 시야를 그대로 물려받기도 해요. 그래서 prompt가 한 번도 언급하지 않은 주제에서 나온 만장일치 침묵은 가장 약한 증거예요.

## 워크플로

1. issue 코멘트(claude[bot])와 review 스레드(Copilot) 모두 가져오기
2. 위 프레임워크로 각 항목 분류
3. **INVALID인 경우**: 패턴 식별 → 보강 주석 추가 → 문서화
4. **OPTIONAL인 경우**: 사용자에게 확인(수정/건너뛰기/나중에)
5. review 검증을 참조하는 설명적인 메시지로 commit

## 실제 사례

### 사례 1: moba-nestjs PR #629 (claude[bot])

**통계:** 12개 코멘트, 3개 INVALID, 5개 OPTIONAL, 4개 VALID IMPROVEMENT

**주요 INVALID:**

- 기능이 이미 존재(analytics 서비스 완전 구현됨)
- request 라이프사이클 오해(단일 스레드 event loop에서 race condition 없음)
- webhook 흐름 오해(외부 서비스가 이미 commit)

### 사례 2: moba-etl PR #5 (GitHub Copilot)

**통계:** 10개 코멘트, 0개 INVALID, 4개 VALID BUG, 3개 VALID IMPROVEMENT, 1개 ALREADY FIXED, 2개 OPTIONAL

**주요 VALID BUG:**

- json.dumps() encoding — `put_object()`는 str이 아닌 bytes 필요
- Manifest 키 불일치 — 읽기/쓰기에 다른 키 사용
- S3 prefix 정규화 — trailing slash 없는 경로가 잘못된 키 생성

**결과:** 모든 버그 수정, 오탐 없음. 인프라/데이터 코드에서 Copilot review가 매우 정확했어요.

### 사례 3: crucio PR #6 Round 2 (CodeRabbit + Claude Bot)

**통계:** 14개 항목(6 CodeRabbit, 8 Claude Bot), 1 VALID BUG, 2 CONTROVERSIAL→FIX, 3 GTH→FIX, 1 SKIP, 6 INVALID, 1 DUP

세 가지 새로운 혼동 패턴이 동시에 나타난 PR이에요. Python 프로젝트에서 Celery prefork worker, Pydantic v2 모델, factory pattern 기반 서비스 초기화를 쓰는데, 전부 AI reviewer가 일관되게 틀리는 것들이에요.

**주요 VALID BUG:**

- `extract_tags`에 `ValueError` handler 누락. 영구적 실패(잘못된 config, safety filter)를 fast-fail 대신 재시도

**주요 INVALID (새 패턴):**

- Process 모델(#5): Celery prefork = 별도 process, thread 아님
- Pydantic mutability(#6): frozen 아닌 모델은 속성 할당 가능
- Factory default(#7): factory가 명시적 값을 전달하므로 constructor default는 무관
- GitHub Actions format: 쉼표 구분 `"Tool1,Tool2"`는 공식 문서와 일치

**결과:** 6개 수정, 6개 INVALID 근거와 함께 기각. 정확도는 엇갈렸어요. CodeRabbit은 6개 중 4개가 INVALID, Claude Bot은 1 VALID BUG + 2 INVALID였어요.

### 사례 4: moba-nestjs PR #710 Round 1+2 (Copilot + Claude)

**통계:** 19개 raw 지적 → dedup 후 15개 고유. 1 VALID BUG, 2 GTH→FIX, 3 CONTROVERSIAL→SKIP, 1 INVALID, 3 DEFER, 7 N/A(authorship)

GitHub API 406 이슈(#10)를 유발한 release PR이에요. 로컬에서 diff를 생성하고 도메인별로 agent에 나누는 우회 방법은 잘 동작했지만, authorship scoping 문제(#11)가 새로 발생했어요. 지적의 거의 절반이 다른 팀원이 작성한 코드를 지적한 N/A였어요.

**주요 VALID BUG:**

- `moveCrossIntegration`에서 `blockRepo.count()`에 `withDeleted: true` 누락. soft-deleted T block(취소된 반복 인스턴스)이 count되지 않아서 parent가 `moveCrossIntegrationSingle`로 잘못 라우팅

**주요 INVALID:**

- 오래된 Diff(#1): 한국어 README "삭제"는 실제로 이름 변경(git이 rename을 delete+create로 표시)

**주요 SKIP 결정 (CONTROVERSIAL):**

- Sync용 soft-deleted record: WebSocket event가 삭제를 처리하지 `getBlocksByIds`가 아님
- Google API type assertion: `null` conferenceData clearing에 type-safe 대안이 없음
- test의 non-null assertion: 올바른 지적이지만 27개 = release PR 시점에 적절하지 않음

**프로세스 학습:** Claude의 구조화된 review는 finding별로 개별 파싱(STEP 1C)이 필요하고, 하나의 CR-1으로 합치면 안 돼요. Round 1에서 이걸 놓쳤고, Round 2에서 수정했어요.

### 사례 5: moba-nestjs PR #712 Round 1+2 (Claude)

**통계:** Round 1: 8개(5 INVALID, 2 CONTROVERSIAL→FIX, 1 GTH→FIX). Round 2: 2개(1 INVALID, 1 GTH→FIX)

Cross-Branch 혼동(#9)이 처음 나타난 PR이에요. Claude가 PR target(`develop`) 대신 `main` branch 코드를 분석해서, test assertion이 796-800번 줄의 구현과 모순된다고 주장했어요. `develop`에서는 해당 줄이 이미 NOTE 주석이었고, `deletedAt` 설정 코드는 이전 PR(#711)에서 제거된 상태였어요.

**주요 INVALID (새 패턴):**

- Cross-Branch 혼동(#9): Reviewer가 PR target(`develop`) 대신 `main` branch 코드를 분석. `toBeNull()`이 796-800번 줄 구현과 모순된다고 주장했지만, `develop`에서 해당 줄은 NOTE 주석(`deletedAt` 설정 코드는 PR #711에서 제거됨)

**결과:** 양쪽 round에서 3개 수정, 6개 INVALID 기각. 새 패턴도 문서화했어요. Cross-Branch 혼동은 PR target이 `develop`인데도 AI reviewer가 `main` branch context를 기본으로 삼는 경우예요.

### 사례 6: 3b-forge PR #3 Round 1 (4 reviewers — Claude + Copilot + Codex + CodeRabbit)

**통계:** 16개 항목: 9 VALID BUG/IMPROVEMENT, 6 GTH→FIX, 1 CONTROVERSIAL→VALID(user redirect 후). 0 INVALID. 0 DEFER. 18개 thread 해결: 11개 명시적 reply + 7개 CodeRabbit auto-resolve. 16개 atomic fix commit. `f56e066`으로 merge.

**범위:** Wave 3 SSoT flip tooling: `scripts/flip-to-forge.sh`(신규, 322줄), refactor된 `scripts/check-3b-drift.sh`, docs. YAML manifest를 통해 별도 git repo에 destructive `rm`과 `ln -s`를 수행하는 shell script였어요. 고위험, 낮은 test coverage, 좁은 범위라 4-reviewer pass에 적합했어요.

**Cross-reviewer convergence:**

| Finding                                      | Claude | Copilot | Codex | CodeRabbit |
| -------------------------------------------- | ------ | ------- | ----- | ---------- |
| Path-traversal guard 누락                    | ✓      | ✓       | ✓     | —          |
| `stat -f '%HT'` BSD 전용                     | ✓      | ✓       | —     | ✓          |
| Post-flip mode가 local state에만 의존        | ✓      | ✓       | ✓     | —          |
| Rollback 후 `.flip-state.json` 잔존          | ✓      | —       | —     | ✓          |
| Exit-code 2 overload                         | —      | ✓       | —     | —          |

**CONTROVERSIAL은 user redirect로 처리:** R1-16은 `scripts/check-3b-drift.sh:25`에서 exit code 2가 advisory drift와 pre-flight failure를 모두 의미하는 문제였어요. 바로 수정하지 않고 CONTROVERSIAL로 분류한 뒤, code 분리, code 2 의미 축소, reinforcing comment 유지, follow-up issue defer 네 가지 선택지를 제시했어요. 사용자는 code 분리를 선택했고, fix는 VALID 수정 이후 GOOD-TO-HAVE batch 전에 반영했어요.

**스레드 해결에서 배운 점:** Copilot과 Codex 스레드는 GitHub GraphQL `resolveReviewThread` mutation으로 명시적으로 닫아주기 전까지 열린 상태로 남아요. CodeRabbit은 참조 코드가 바뀌면 일부 스레드를 자동으로 닫았고, 5개 중 3개가 답글 없이 해결됐어요. commit이 쌓이면서 line 번호도 이동해요. 그래서 finding과 commit을 매핑할 안정적인 키는 `path:line`이 아니라 GraphQL 스레드 ID였어요. 마무리로는 round summary를 올린 뒤 `@claude review` 트리거 코멘트와 claude[bot]의 구조화된 review를 `minimizeComment(..., classifier: RESOLVED)`로 접었어요. 그러면 PR 대화에는 사람이 읽을 audit trail만 남아요.

**핵심 INVALID count: 0.** 이 PR에서는 3개 이상 agent의 convergence가 valid finding의 완전한 positive predictor였어요. 이유는 범위가 좁아 agent들이 end-to-end로 추론할 수 있었고, script가 destructive operation을 수행해 reviewer들이 보수적으로 판단했으며, 4개의 독립 reviewer가 개별 false positive를 줄였기 때문으로 보여요.

**프로세스 학습:** CONTROVERSIAL 결정은 VALID와 GOOD-TO-HAVE 사이에 gate로 둬야 해요. VALID fix는 먼저 진행하고, CONTROVERSIAL은 사용자에게 깔끔한 결정 지점을 제공하고, low-risk improvement는 그 뒤에 batch 처리하는 흐름이 맞았어요. 세 tier를 하나의 confirm step으로 묶으면 각 decision type에 필요한 latency가 어긋나요.

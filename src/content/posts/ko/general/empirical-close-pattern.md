---
title: 'Empirical Close: skill-side test를 자연스러운 trigger로 미루기'
description: '어떤 verification test는 fixture로 충실히 재현되지 않는 진짜 trigger가 필요해요 — interactive prompt, conversation parsing, AskUserQuestion flow. test를 [~] empirical-close-pending으로 표시하고 다음 자연스러운 trigger를 믿어 verify하는 건 friction-log reopen과 짝지을 때 hygienic이에요.'
date: 2026-04-30T00:00:00.000Z
updated: '2026-05-06'
tags:
  - general
  - process
  - task-management
  - verification
category: general
draft: false
lang: ko
source_lang: en
source_slug: empirical-close-pattern
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

어떤 verification test는 unit-mock할 수 없는 진짜 trigger가 필요해요: interactive prompt, conversation parsing, AskUserQuestion flow. 이런 것들에 세 가지 close-out path가 있어요:

1. **Force staging** — fake trigger를 stage해서 test를 지금 fire. real session state를 오염시키고, staged fixture는 real input shape에서 종종 분기해요.
2. **Defer + leave open** — task folder를 `actives/`에 유지하고, 7d에 stale-warn하게 둠. 위험: 잊혀진 task, dashboard noise.
3. **Empirical close** — test를 `[~] empirical-close-pending`로 표시하고 task를 어쨌든 archive, 다음 자연스러운 trigger가 verify하기를 믿어요. regression 시 friction log를 통해 reopen.

path 3에 대한 explicit 패턴 없이는, mock 불가능한 test가 있는 task가 무한정 반쯤-닫힌 채 앉아 있거나 low-fidelity fixture로 force-stage돼요.

## 세 옵션, 나란히

| Option              | Pros                                           | Cons                                                           |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Force staging now   | close에 test green; explicit verification      | session state 오염; fixture ≠ reality; 복원 비용                |
| Defer + leave open  | artifice 없음                                   | 7d에 stale-warn; dashboard noise; 잊혀진 task 위험              |
| **Empirical close** | artifice 없음 + folder 닫힘 + signal 보존       | 신뢰 필요; reopen 메커니즘 필요                                  |

trigger가 진정으로 natural-only(예: 진짜 대화에서 "next session: do X" — fixture가 충실히 재현 못 함)이고 friction-log reopen 메커니즘이 backup할 때 empirical close가 이겨요. 비용은 trust calibration이고, 이익은 low-fidelity test 없는 task 위생이에요.

## 패턴이 explicit해지기 전에 깨졌던 것들

이름이 없을 때 지저분하게 만들었던 네 가지:

- **"skip"과의 구별.** `[-]` skipped는 decided-not-to-test, `[~]` empirical-close-pending은 deferred-to-natural-exercise. 구별이 없으면 archive가 포기처럼 보여요.
- **reopen 메커니즘이 비명시적이에요.** deferred test의 failure mode와 일치하는 regression을 잡도록 friction log를 wire하지 않으면, empirical close는 "지우고 기도하기"가 돼요.
- **Trust calibration.** path의 첫 instance는 explicit verification이 필요하고, empirical은 design이 검증된 후 후속 iteration에 적용돼요. first-build path에 empirical을 misapply하면 foundation check를 건너뛰어요.
- **Tooling drift.** /wrap과 /archive-task는 원래 `[~]` close state를 지원하지 않았어요 — error를 내거나 blocking으로 다뤘어요. 패턴엔 communicate를 위한 `close_mode: empirical` + `close_notes:` frontmatter가 필요해요.

## 4단계 패턴

1. **task의 `todos.md`에 test annotate:**

   ```markdown
   - [~] **Test N — {name}**: empirical close pending (YYYY-MM-DD). {Why no unit
     coverage}. Will exercise on next natural {trigger}. Reopen via friction log
     if {failure mode} occurs.
   ```

2. **task frontmatter set:**

   ```yaml
   status: completed
   close_mode: empirical
   close_notes: |
     {N/total} done; {M} empirical close pending (Tests X+Y).
     Reopen if {regression signal}.
   ```

3. **`/archive-task`로 정상 archive.** empirical signal을 기다리며 folder를 열어두지 마세요 — 그건 그냥 stale folder예요.

4. **reopen 메커니즘 wire:** archive 후 regression signal이 나타나면 fire하는 friction-log 패턴이나 /wrap 경고 추가.

`wrap-followup-persistence-fix` close-out(2026-04-30)에서 구체적 instance:

```markdown
- [~] **Test 4 — Conversation extraction**: empirical close pending
  (2026-04-30). Skill-side (Step 5.65), no unit coverage. Will exercise on next
  natural /wrap that has a conversation-only follow-up. Reopen via friction log
  if Step 5.65 fails to persist a real candidate.
- [~] **Test 5 — Loss audit**: empirical close pending (2026-04-30). Skill-side
  (Step 9). Pair with Test 4 — first time user chooses "Skip" on a real Step
  5.65 candidate, verify Step 9 lists it under "potentially-lost".
```

frontmatter:

```yaml
status: completed
close_mode: empirical
close_notes: |
  17/19 done; 2 [~] empirical-close pending (Tests 4+5). Reopen via
  friction log if Step 5.65 fails on a real conversation-only follow-up.
```

## 이게 맞는 상황

empirical close 사용처:

- conversation context가 필요한 **skill-side behavior test**(예: wrap의 Step 5.65 conversation extraction은 chat 중 진짜 "next session: do X"가 필요).
- prompt를 인위적으로 force + answer하는 게 real-world UX를 검증하지 않는 **AskUserQuestion flow**.
- side effect를 rollback하는 게 production에서 regression 잡는 것보다 어려운 **side-effect test**.
- **post-merge close** — PR이 merge되고 branch가 사라졌으면 task 완료, 마지막 smoke가 실행됐든 안 됐든(2026-04-30 embed-interview close에서 나온 heuristic).

regression-critical path(payment, auth, data integrity — test를 force), security test(여기선 절대 empirical signal 신뢰 안 함), unit-mock 가능한 test(mock이 있으면 unit test 작성 — empirical close는 mock 불가능한 것에 대한 fallback), path를 처음 만들 때(첫 instance는 explicit validation 필요; design이 검증된 후의 iteration에 empirical 적용)에는 사용 안 해요.

## 실용적인 takeaway

Empirical close는 task hygiene이지 test laziness가 아니에요. test는 여전히 존재해요 — fixture 대신 production에서 실행될 뿐이에요. test를 실행하는 것의 대안은 task의 존재를 잊는 거예요. 모든 empirical close를 friction-log reopen 패턴과 짝지으세요. 없으면 empirical close는 "지우고 기도하기"가 돼요. post-merge variant(PR-merged + branch-gone = task 완료)는 같은 패턴을 test-state 대신 merge-state에 적용한 거예요 — 둘 다 local certainty보다 durable signal을 신뢰해요.

## References

- [The Practical Test Pyramid (Ham Vocke / Martin Fowler)](https://martinfowler.com/articles/practical-test-pyramid.html)
- [feat(wrap): persist follow-ups across sessions — Tests 4+5 deferred](https://github.com/brandonwie/3b/commit/46e23c05)

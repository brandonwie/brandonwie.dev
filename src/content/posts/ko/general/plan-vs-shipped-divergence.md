---
title: Task resume 시점의 Plan-vs-Shipped Divergence 감지
description: 'multi-session task를 resume할 때, task 시작 시 작성된 plan.md가 지금 실제로 ship된 것을 반영하지 않을 수 있어요. 구현은 mid-flight로 진화하고, scope가 shift하고, branch가 merge돼요. 3분짜리 pre-flight check가 obsolete한 작업을 실행하는 시간을 막아줘요.'
date: 2026-04-30T00:00:00.000Z
updated: '2026-05-06'
tags:
  - general
  - process
  - task-resume
  - verify-before-execute
category: general
draft: false
lang: ko
source_lang: en
source_slug: plan-vs-shipped-divergence
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

multi-session task를 resume할 때, task 시작 시 작성된 `plan.md`가 지금 실제로 ship된 것을 반영하지 않을 수 있어요. 구현은 mid-flight로 진화해요: design decision이 revise되고, scope가 shift하고, branch가 merge돼요. pre-flight check 없이 resume하면 plan의 framing을 문자 그대로 실행해요 — obsolete한 test를 돌리고, 은퇴한 결정을 다시 말하고, 이미 merge된 PR을 열어요.

**plan narrative가 아니라 repo state를 신뢰하세요.** 3분짜리 pre-flight가 obsolete한 작업을 실행하는 몇 시간을 막아줘요.

## plan이 조용히 drift하는 이유

plan이 resume를 오해시킬 수 있는 네 가지 방식:

- **Plan narrative가 끈적여요.** plan이 한 번 "Path A/B/C decision pending"이라고 말하면, 그 framing이 triage output, journal Next bullet, ACTIVE-STATUS Priorities로 carry forward돼요. framing이 reality를 지나서 지속돼요. resume 시점에 여러 downstream artifact가 outdated framing을 반복해요 — canonical truth로 잘못 인식하기 쉬워요.
- **Section label이 오해를 일으켜요.** plan §A, §B, §C가 한 design의 COMPONENT(additive)일 수도 있고 ALTERNATIVE(exclusive)일 수도 있어요. 모든 section을 읽지 않으면 reader가 분간할 수 없어요. 2026-04-30 wrap-followup 케이스는 section A-G가 component였는데 (journal + triage에서) A/B/C exclusive option으로 misread됐어요.
- **Branch state가 거짓말해요.** locally-deleted branch는 main의 merge commit을 체크할 때까지 "task가 시작되지 않았다"처럼 보여요. `git branch -a`는 merge되고 auto-delete된 remote-only branch를 표면화하지 않아요.
- **Test가 plan보다 빨리 진화해요.** 구현이 plan의 manual verification list를 obsolete하게 만드는 unit test를 추가했을 수 있어요. plan-driven resume는 manual test를 다시 돌리는데, reality는 같은 의도를 cover하는 unit suite가 있어요.

## 세 옵션, 나란히

| Option                         | Pros                                          | Cons                                                                    |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| Trust plan as-written          | 빠른 resume; 탐색 비용 없음                     | obsolete 작업 실행 위험; missed-divergence에 비용 큼                       |
| Re-spec from scratch           | 보장된 fresh framing                            | plan의 reasoning + decision context 버림                                 |
| **Pre-flight check + reframe** | 3분에 divergence 잡음; plan core 재사용         | 규율 필요; user/agent가 모든 resume에서 실행을 기억해야 함                  |

Pre-flight check는 저렴하고(3분) 레버리지가 커요(missed-divergence에서 시간 절약). Re-spec은 routine evolution에 overkill, trust-as-written은 multi-session task에 실패해요. pre-flight가 plan의 decision context를 버리지 않고 reality에 비춰 reframe해요.

## 실제 "divergence"가 어떻게 보이는지

2026-04-30 구체적 케이스: 2026-04-25의 plan.md는 "Phase 5 blocks on Path A/B/C decision"이라고 말했어요. 5일 후의 reality:

- branch `feat/wrap-followup-persistence`가 더 이상 로컬에 존재하지 않음
- 구현이 commit `46e23c05`로 main에 merge됨
- 디자인이 진화: carry-forward merge(plan §B)가 parallel-wrap concurrency safety를 위해 durable-source-only generator(`scripts/regenerate-active-status.js`)로 REPLACE됨
- "Path A/B/C"가 misread였음 — section A-G가 alternative가 아니라 component였음
- 7개 verification test 중 4개가 이미 20개 generator unit test로 cover됨(모두 green)
- 1개 test(carry-forward)가 testing하던 path가 의도적으로 retire됐기 때문에 DESIGN-OBSOLETE

순진한 resume는 7개 manual test를 모두 실행할 거예요. ~3시간 낭비.

## 3분 pre-flight check

plan.md를 resume에서 ground truth로 다루기 전에, 네 가지 기계적 check를 실행하세요:

1. **Branch state:**

   ```bash
   git branch --show-current
   git branch -a | grep -i {task-slug}
   git log --oneline main..HEAD       # commits ahead of main
   ```

   - branch가 로컬에 없음? → 이미 merge됐을 가능성
   - branch는 있는데 commit이 ahead 없음? → 이미 merge됨 + branch stale

2. **Critical 파일에 대한 commit history:**

   ```bash
   git log --oneline -15 main -- {plan-mentioned-files}
   # e.g., -- '.agents/skills/wrap/SKILL.md'
   ```

   - task를 참조하는 최근 commit → 구현이 land했을 가능성
   - commit 없음 → plan이 여전히 pending

3. **실제 파일 들여다보기:**

   plan.md의 각 `## Critical Files to Modify` entry에 대해, plan에서 설명한 변경이 존재하는지 verify. 파일 콘텐츠가 plan intent와 일치하면 → plan이 구현됨.

4. **해당 영역의 test suite:**

   ```bash
   ls scripts/{task-area}.test.* 2>/dev/null
   node --test scripts/{task-area}.test.js
   ```

   plan을 postdate하는 기존 test suite → 구현이 plan을 지나서 진화하고 자체 verification을 추가함. 새로 작성하기 전에 plan test를 기존 unit에 매핑.

## resume plan 재구성

pre-flight 후, resume plan은 reframe돼요:

| Plan said            | Reality is                      | Action                                            |
| -------------------- | ------------------------------- | ------------------------------------------------- |
| "Decision pending"   | "Decision was made + shipped"   | decision 건너뛰기; shipped state verify           |
| "Implement Phase N"  | "Phase N already merged"        | 건너뛰기; output verify                           |
| "Run 7 manual tests" | "20 unit tests cover 4+ of 7"   | plan test → unit test 매핑; 나머지만 manual       |
| "Open PR"            | "Already direct-merged to main" | PR 단계 건너뛰기; `[-]`로 표시                    |

obsolete plan item을 `[-] superseded`로 표시하고, divergence 증거(commit hash, file location, test name)를 인용하는 rationale을 적으세요.

## 이게 맞는 상황

이 패턴은 >3일 idle 후의 **mid-flight task resume**, 여러 agent/session이 작업을 건드린 **multi-session task**, plan의 verification phase가 실행되기 전에 task가 운영적으로 끝난 **post-merge close-out**, 원래 plan이 reality에 추월당한 **refactor handoff**에 적용돼요.

**same-session resume**(plan ≈ reality by definition), **greenfield work**(아직 ship된 reality가 없어 divergence 없음), **plan-mode-only session**(비교할 구현 없음)에는 적용 안 돼요.

## 실용적인 takeaway

Repo state가 canonical이에요. plan.md는 의도의 historical record이고, shipped state가 reality예요. 충돌 시 repo가 이겨요. divergence는 정상이지 실패가 아니에요 — 구현 진화는 healthy해요. Pre-flight는 저렴하고(3분) missed-divergence는 비싸요(obsolete test 실행 시간). close에서 divergence를 문서화해서 다음 resume가 why를 보게 하세요. empirical close와 짝지으세요 — divergence는 종종 test를 "manual"에서 "unit suite로 cover"나 "design에 의해 obsolete"로 shift시키고, 남은 un-coverable test는 empirical하게 닫아요.

## References

- [GitHub — Planning and tracking with Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [Implementation that diverged from plan.md A-G framing](https://github.com/brandonwie/3b/commit/46e23c05)

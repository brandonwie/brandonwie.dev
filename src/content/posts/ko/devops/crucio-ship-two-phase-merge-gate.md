---
title: 수동 merge gate로서의 두 단계 호출 패턴
description: 'CI/CD automation skill이 "all-in-one" mode(`/skill +flag`)를 지원할 때, all-in-one mode는 default가 아니라 opt-in이어야 해요. 호출을 분리하면 CI green과 되돌릴 수 없는 merge 사이에 의미 있는 일시정지 지점을 보존해요.'
date: 2026-05-05T00:00:00.000Z
updated: '2026-05-06'
tags:
  - devops
  - automation
  - ci-cd
  - deployment
  - gating
category: devops
draft: false
lang: ko
source_lang: en
source_slug: crucio-ship-two-phase-merge-gate
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

`/crucio-ship`은 PR-to-prod ship에 대해 세 개의 논리적 phase를 실행해요. 각 phase는 reversibility 속성이 매우 다른데, 이걸 한 번의 호출에 묶으면 쉬운 부분과 되돌릴 수 없는 부분이 섞여요.

| Phase | Action                                | Reversibility                        |
| ----- | ------------------------------------- | ------------------------------------ |
| 1     | Dispatch + watch CI on the PR branch  | Read-only                            |
| 1.5   | `gh pr merge --merge --delete-branch` | **Irreversible** (without revert PR) |
| 2     | Dispatch deploy + verify chain fires  | **Production-affecting**             |

skill은 `+merge`를 arg로 지원해서 한 번의 invocation으로 세 phase를 모두 실행할 수 있어요. 편하지만 — "operator가 green CI를 보고 merge를 authorize하는 결정을 내리는" 단계가 사라져요. 수동 smoke test가 있는 portfolio prod 환경에서는 그 게이트에 실제 가치가 있어요. skill 자체를 수정할 필요는 없어요 — `+merge` 없이 vs 있이 호출하는 게 게이트예요.

## 의도적으로 두 번 호출하기

패턴은 `+merge`로 한 번 호출하는 대신 두 번 호출하는 거예요:

```text
First invocation:  /crucio-ship       → Phase 1 only (CI dispatch + watch)
                                        → Hard-blocks on red CI
                                        → Reports green/red status
                                        → EXITS

[operator inspects logs, decides to ship]

Second invocation: /crucio-ship +merge → Phase 1 (re-runs — wasteful) +
                                          Phase 1.5 + Phase 2
```

"Phase 1 re-runs" 비용은 실재하지만 cycle은 저렴해요(작은 변경에 대해 ~10min CI run). 더 큰 CI suite에는 skill이 `+from=phase1.5` arg를 키워서 이미 검증된 phase를 건너뛸 수 있겠지만, 지금은 YAGNI예요.

CI 비용이 큰 케이스에는 대안이 있어요: skill을 다시 호출하는 대신, 로드된 skill 콘텐츠를 runbook으로 사용해서 Phase 1.5 + 2를 수동으로 실행하세요. re-CI 비용을 완전히 건너뛰어요. trade-off: skill이 script로 실행할 단계를 손으로 실행하는 거예요. 인터랙티브 세션엔 괜찮지만, unattended automation엔 아니에요.

## 게이트가 가치인 이유

이 패턴이 오버헤드를 정당화하는 세 가지 이유:

- **High-blast-radius automation은 default로 multi-step이어야 해요.** single-shot mode는 explicit flag가 필요해야지 default면 안 돼요. default behavior는 아무도 신경 안 쓸 때 사용되는 것이고, 안전한 경로가 default여야 해요.
- **게이트가 가치예요. skill 코드가 아니라.** skill 자체에 새 코드가 필요하지 않아요. invocation 패턴이 게이트를 제공해요. "skill design"과 "skill use"를 혼동하지 마세요 — 도구를 어떻게 호출하는지가 디자인일 때가 있어요.
- **저렴한 re-run이 split-invocation을 viable하게 만들어요.** Phase 1이 실행당 \$50가 든다면 re-run 페널티가 다른 디자인을 강제할 거예요. 저렴한 CI가 이 패턴을 affordable하게 만들어요.
- **split을 권장 경로로 문서화하세요.** 그러지 않으면 operator가 `+merge`를 먼저 발견하고, 한 번 사용하고, 다시는 돌아가지 않아요.

## 디자인이 잘못한 것들

사용 중에 두 가지가 물었어요:

- **명명이 비대칭이에요.** `/crucio-ship`(no flag)이 "Phase 1만"이고 `/crucio-ship +merge`가 "모든 phase"예요. skill 문서를 읽어도 flag를 생략하는 게 게이트 경로라는 게 명확하지 않아요. 더 명확한 명명은 `/crucio-ship-check` + `/crucio-ship-execute`인데, flag-based 디자인이 이미 ship됐고, deployed skill을 rename하는 비용이 얻는 것보다 커요.
- **skill 재호출 비용이 ~10분 CI re-run이에요.** 작은 변경엔 acceptable, 큰 변경(전체 test suite)엔 아니에요. workaround: 같은 session 안에서 skill 콘텐츠를 runbook으로 사용해 Phase 1.5 + 2를 수동 실행하고 re-CI 비용 건너뛰기.

## 이게 맞는 상황

multi-invocation split을 사용할 때:

- operator가 되돌릴 수 없는 단계(merge, push to main, dispatch deploy)를 의식적으로 authorize해야 하는 production deploy.
- intermediate state(CI green) 자체가 operator가 검사하고 싶은 의미 있는 정보인 multi-phase automation.
- hard-block gate가 있는 skill(red CI = abort) — 게이트가 당신이 온 이유예요. auto-everything으로 우회하지 마세요.

automation이 진짜 low-blast-radius일 때(preview deploy, dev 환경, internal tooling — all-in-one OK), shipping이 unattended/cron-driven일 때(CI bot, Renovate auto-merge — 사람이 기다리지 않으면 게이트는 무의미), 게이트가 그냥 도장 찍기일 때는 split이 필요 없어요. operator의 결정이 늘 "yes, ship"이면 게이트는 연극이에요. pre-merge signal을 개선하거나 auto-shipping을 받아들이세요.

## 실용적인 takeaway

high-stakes automation에는 all-in-one을 opt-in으로 두고 split invocation을 default로 하세요. "CI green"과 "merge merged" 사이의 게이트는 사람 체크를 끼워 넣을 가장 저렴한 곳 중 하나고, 4-round AI-reviewed PR도 되돌릴 수 없는 단계 전에 사람의 "yes, merge now" 한 번에서 이익을 봐요. skill 코드는 바뀔 필요가 없어요 — skill을 어떻게 호출하는지가 디자인이에요.

## References

- [PR #138 — TF.5.7 Google integration token refresh (the ship case)](https://github.com/brandonwie/crucio/pull/138)

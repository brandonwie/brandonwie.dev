---
title: Task를 다시 잡을 때 plan과 실제 shipped 상태가 어긋나는 순간
description: >-
  여러 세션에 걸친 task를 다시 잡으면, 처음 작성한 plan.md가 지금 main에 반영된 모습과 어긋나 있을 때가 많아요. 구현은
  도중에 바뀌고, 범위는 옮겨가고, branch는 어느새 merge돼요. 3분짜리 pre-flight check 하나면 한참 동안
  obsolete된 작업을 붙들고 있는 시간을 막아줘요.
date: 2026-04-30T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-05-10'
---

5일 전에 멈춰뒀던 task를 다시 펼쳤어요. plan.md가 이끄는 대로 따라갔다면 manual test 7개를 처음부터 돌렸을 거예요. 그런데 이미 main에 merge된 commit이 있었고, 그 중 4개는 새로 추가된 unit test가 cover하고 있었고, 1개는 retire된 path를 검증하던 거였어요.

처음 잡은 plan.md는 그때의 의도를 담은 기록일 뿐, 지금 repo에 반영된 모습과는 다를 수 있어요. 구현은 도중에 진화해요. design decision이 바뀌고, 범위가 옮겨가고, branch가 어느새 merge돼요. pre-flight check 없이 곧장 다시 시작하면 plan의 framing을 글자 그대로 따라가게 돼요. obsolete된 test를 돌리고, 이미 끝난 결정을 다시 꺼내고, 진작에 merge된 PR을 또 열려고 해요.

**plan에 적힌 서사가 아니라 repo 상태를 믿으세요.** 3분짜리 pre-flight 한 번이 obsolete된 작업에 몇 시간을 빼앗기는 걸 막아줘요.

## plan이 조용히 어긋나는 이유

plan이 다시 잡을 때 사람을 헷갈리게 만드는 경로는 네 가지예요.

- **plan에 적힌 서사가 끈적하게 남아요.** plan이 한번 "Path A/B/C 결정 보류"라고 적어두면, 그 framing이 triage 결과에도, journal의 Next 항목에도, ACTIVE-STATUS의 Priorities에도 그대로 따라가요. 현실은 이미 지나갔는데 framing만 살아남는 거예요. 다시 잡는 시점이 되면 여러 곳에 같은 옛 framing이 반복돼 있어요. canonical truth로 착각하기 딱 좋아요.
- **section 라벨이 사람을 속여요.** plan §A, §B, §C는 한 design의 구성요소(더해지는 항목)일 수도 있고, 서로 배타적인 대안일 수도 있어요. 모든 section을 끝까지 읽지 않으면 어느 쪽인지 가릴 수가 없어요. 2026-04-30 wrap-followup case가 딱 그랬어요. A부터 G까지가 구성요소였는데, journal과 triage에서 A/B/C 셋 중 하나를 고르는 배타적 옵션으로 잘못 읽혔어요.
- **branch 상태가 거짓말을 해요.** 로컬에서 지워진 branch는 main의 merge commit을 직접 들여다보기 전까지는 "task를 아직 시작 안 한" 모습으로 보여요. `git branch -a`도 merge되고 자동 삭제된 remote-only branch는 보여주지 않고요.
- **test가 plan보다 빨리 진화해요.** 구현 쪽에 unit test가 이미 붙어서 plan의 manual verification 목록을 obsolete하게 만들었을 수 있어요. plan을 그대로 따라가면 manual test를 또 돌리는데, 현실은 같은 의도를 cover하는 unit suite가 자리를 잡은 뒤예요.

## 세 가지 선택지를 나란히 두면

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| plan 그대로 믿고 진행 | 빠르게 다시 시작; 탐색 비용 0 | obsolete된 작업을 실행할 위험; 어긋남을 놓치면 비용 큼 |
| 처음부터 다시 spec | framing이 무조건 신선함 | plan의 reasoning과 결정 맥락을 통째로 버림 |
| **Pre-flight check 후 reframe** | 3분 안에 어긋남을 잡아냄; plan의 핵심을 재사용 | 약간의 규율 필요; 다시 잡을 때마다 챙겨야 함 |

Pre-flight check는 비용은 3분 정도로 작고 효과는 커요. 어긋남을 놓치면 잃는 시간이 훨씬 많아요. 처음부터 다시 spec하는 건 이런 평범한 진화에는 과해요. 그대로 믿고 진행하는 건 multi-session task에서 깨져요. pre-flight는 plan의 결정 맥락을 버리지 않으면서 현실에 비춰 다시 짜는 길이에요.

## 실제로 어긋난 모습은 어땠을까

제 개인 tooling repo(private)에서 2026-04-30에 실제로 있었던 case예요. 2026-04-25의 plan.md는 "Phase 5는 Path A/B/C 결정에 막혀 있다"고 적혀 있었어요. 5일 뒤의 현실은 이랬어요.

- branch `feat/wrap-followup-persistence`는 로컬에서 사라졌음
- 구현은 commit `46e23c05`로 이미 main에 들어갔음
- design이 바뀌었음 — carry-forward merge(plan §B)는 parallel-wrap의 동시성을 지키려고 durable-source-only generator(`scripts/regenerate-active-status.js`)로 갈아탔음
- "Path A/B/C"는 잘못 읽은 거였음 — section A부터 G까지는 대안이 아니라 한 design의 구성요소였음
- verification test 7개 중 4개는 이미 generator unit test 20개가 덮고 있었음(전부 green)
- 1개(carry-forward) test는 검증하던 path 자체를 일부러 retire한 뒤라 design 단계에서 obsolete였음

plan 그대로 다시 시작했다면 manual test 7개를 전부 돌렸을 거예요. 약 3시간을 그냥 흘렸을 자리예요.

## 3분짜리 pre-flight check

plan.md를 다시 잡을 때의 ground truth로 다루기 전에, 기계적인 check 네 가지를 먼저 돌려요.

1. **branch 상태:**

   ```bash
   git branch --show-current
   git branch -a | grep -i {task-slug}
   git log --oneline main..HEAD       # commits ahead of main
   ```

   - 로컬에 branch가 없어요? → 이미 merge됐을 가능성이 커요
   - branch는 있는데 ahead가 없어요? → 이미 merge되고 branch가 stale한 상태예요

2. **핵심 파일의 commit history:**

   ```bash
   git log --oneline -15 main -- {plan-mentioned-files}
   # e.g., -- '.agents/skills/wrap/SKILL.md'
   ```

   - 최근 commit이 task를 언급해요 → 구현이 이미 land한 거예요
   - commit이 없어요 → plan이 아직 살아 있어요

3. **파일을 직접 들여다보기:**

   plan.md의 `## Critical Files to Modify` 항목을 하나씩 짚어가면서, plan이 약속한 변경이 실제 파일에 들어갔는지 직접 확인해요. 파일 내용이 plan의 의도와 맞는다면 → plan은 이미 구현된 거예요.

4. **해당 영역의 test suite:**

   ```bash
   ls scripts/{task-area}.test.* 2>/dev/null
   node --test scripts/{task-area}.test.js
   ```

   plan 이후에 추가된 test suite가 보이면 → 구현이 plan을 지나서 자체 verification까지 갖춘 거예요. 새로 짜기 전에 plan에 적힌 test를 기존 unit으로 매핑해 봐요.

## 다시 잡은 plan을 reframe하기

pre-flight를 끝내고 나면 다시 잡은 plan이 이렇게 reframe돼요.

| plan에서 말한 것 | 실제 모습 | Action |
| --- | --- | --- |
| "결정 보류" | "결정 끝났고 ship됨" | 결정 단계는 건너뛰고, ship된 상태만 verify |
| "Phase N 구현" | "Phase N 이미 merge됨" | 구현은 건너뛰고, output만 verify |
| "manual test 7개 실행" | "unit test 20개가 7개 중 4개 이상 cover함" | plan test → unit test로 매핑하고, 남는 것만 manual로 |
| "PR 열기" | "이미 main에 직접 merge함" | PR 단계 건너뛰고, `[-]`로 표시 |

obsolete된 plan 항목은 `[-] superseded`로 표시하고, 어긋났다는 증거(commit hash, 파일 위치, test 이름)를 짧게 인용해 두면 다음 사람이 why를 읽을 수 있어요.

## 어떤 상황에 쓰면 좋은가

이 패턴은 다음 같은 자리에 잘 맞아요. 사흘 넘게 멈춰뒀다가 다시 잡는 task, 여러 agent나 세션이 번갈아 손댄 task, 운영적으로는 끝났는데 plan의 verification 단계만 남아 있는 close-out, 그리고 처음에 짜둔 plan이 현실에 추월당한 refactor 인수인계예요.

같은 세션에서 그대로 이어가는 자리에는 굳이 필요 없어요. plan과 현실이 같다고 봐도 되니까요. 아직 ship된 게 없는 greenfield 작업이나, 비교할 구현이 없는 plan-mode-only 세션에도 적용할 자리가 없어요.

## 실용적인 takeaway

repo 상태가 canonical이에요. plan.md는 의도의 historical record, ship된 상태가 reality예요. 둘이 충돌하면 repo가 이겨요. 어긋남은 실패가 아니라 보통 일어나는 일이에요. 구현이 진화하는 건 healthy한 신호예요. pre-flight는 3분이면 끝나고, 어긋남을 놓치면 obsolete된 test를 붙들고 몇 시간을 보내요. close 단계에서 어긋남을 짧게 문서화해두면 다음에 다시 잡는 사람이 why를 바로 읽을 수 있어요. empirical close와도 잘 어울려요. 어긋남은 보통 test를 "manual"에서 "unit suite로 cover됨"이나 "design 단계에서 obsolete"로 옮겨놓고, 끝까지 unit으로 cover가 안 되는 것만 empirical하게 닫아요.

## References

- [Git — `git branch`](https://git-scm.com/docs/git-branch) — branch 상태 check에서 쓰는 `-a`, `--show-current` 문서
- [Git — `git log`](https://git-scm.com/docs/git-log) — two-dot range(`main..HEAD`), `--oneline`, path로 history 좁히기

---
title: Wrap Skill Follow-Up 영속화 아키텍처
description: >-
  session-state 대시보드를 매번 오늘 journal 하나만 보고 다시 만들면, 이전 session에서 풀리지 않은
  follow-up이 rebuild할 때마다 조용히 사라져요. 단일 source 탐색 + 대화에서만 언급된 항목과 겹치면 동시에 세 갈래로
  증발해요. 해결책은 4-layer 아키텍처예요.
date: 2026-04-25T00:00:00.000Z
updated: '2026-05-06'
tags:
  - devops
  - claude-code
  - skill-design
  - session-state
category: devops
draft: false
lang: ko
source_lang: en
source_slug: wrap-followup-persistence-architecture
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-10'
---

/wrap을 돌렸는데 어제 적어둔 follow-up 두 개가 ACTIVE-STATUS에서 사라져 있었어요. 어디로 갔는지 추적해 보니까, 같은 항목이 세 가지 다른 경로로 동시에 증발하고 있었어요. session-state 대시보드를 오늘 journal 하나만 보고 다시 그리면, 어제 처리 못 한 항목은 rebuild마다 조용히 빠져요. 여기에 단일 source 탐색과 대화에서만 언급된 항목까지 겹치면 누락 경로가 셋으로 늘어나요. 해결책은 각 누락 모드를 따로 막는 4-layer 아키텍처예요.

## 누락이 일어나는 4가지 모드

1. **전체 덮어쓰기 regeneration** — Priorities 섹션을 오늘 신호에서만 다시 그리면서 어제 풀리지 않은 항목이 같이 빠져요.
2. **단일 source 탐색** — 한 file pattern만 훑어요. project 단위 "Next Session" 섹션(`projects/{p}/todos.md`)이 안 보여요.
3. **대화에서만 언급된 follow-up** — "next session: do X"라고 말은 했지만 journal에 안 적으면 `/clear`에서 같이 죽어요.
4. **태그 없는 항목** — `(project)` prefix가 없으면 downstream으로 라우팅이 안 돼요.

## 디자인이 바뀐 흐름: 2026-04-28 → 2026-04-30

처음 v1.3.0 설계는 이전 ACTIVE-STATUS의 Priorities를 skill 안에서 carry-forward로 합치는 방식이었어요. 2026-04-28에 Step 5.7을 `scripts/regenerate-active-status.js`로 옮겼어요. `.agents/locks/active-status.lock`으로 잠금을 거는 Node 스크립트예요. 이유는 두 가지였어요.

1. **병렬 /wrap 동시성 안전성.** /wrap 두 개가 같은 대시보드를 동시에 건드리면 carry-forward 머지가 변경분을 잃어버릴 수 있어요. 스크립트는 잠금을 먼저 잡고, `ACTIVE-STATUS.md`는 durable-source 전용 출력으로만 다뤄요. 이전 대시보드 상태는 절대 다시 읽지 않아요.
2. **Single source of truth.** Carry-forward는 대시보드의 이전 내용을 암묵적으로 상태로 신뢰했어요. durable-source 전용 방식은 journal과 project todos.md, actives 폴더를 직접 읽어요. 대시보드는 그것들을 비추는 거지, 반대가 아니에요.

Test 1 (carry-forward)은 이 변화로 자연히 폐기됐어요. 남은 머지 로직 — 다중 source 스캔, 해결된 항목 drop, 중복 제거, 태그 도출 — 은 전부 generator의 `collectPriorities` + `collectProjectFollowups` + `withProject` 함수로 옮겼어요. `scripts/regenerate-active-status.test.js`의 unit test 20개로 다 cover돼요. 2026-04-30 마감 시점에 모두 green이었어요.

## 4-layer pipeline

```text
┌─────────────────────────────────────────────────────────────┐
│  Step 5.65 (NEW): Conversation Follow-Up Extraction         │
│   keywords → orphan_followups → batched persistence prompt  │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 5.7 sub-step 1: 4-source merge                        │
│                                                             │
│  prior_priorities (ACTIVE-STATUS)                           │
│    ∪ today_next (journal ### Next, project-tagged)          │
│    ∪ file_followups (canonical fallback chain):             │
│        - projects/{p}/actives/*/todos.md (open checkboxes)  │
│        - projects/{p}/todos.md § ## Next Session            │
│        - projects/{p}/PROGRESS.md § ## Next Session         │
│    − resolved (now [x] or in journal Done)                  │
│    → dedup ≥85% fuzzy → cap 15                              │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 9: Persistence Audit                                  │
│   counts per source + potentially_lost + untagged_warnings  │
└─────────────────────────────────────────────────────────────┘
```

## 핵심 invariant

- **Durable-source 전용, 머지 아님.** ACTIVE-STATUS는 journal과 project 파일에서 바로 다시 그려요. 이전 대시보드 상태는 끌어오지 않아요. 병렬 /wrap 안전성을 위해 잠금으로 보호해요.
- **원래 머지 의도는 durable-source 층에 그대로 살아 있어요.** `prior_priorities ∪ today_signal ∪ file_sources − resolved` 식이에요. fuzzy ≥85% 중복 제거에 무한 증식을 막는 상한을 더했어요.
- **다중 source 누적 스캔** — first-match가 아니라 존재하는 모든 source에서 모아요. 각 source는 정해진 역할이 있어요. task별, project 단위, 그리고 legacy fallback이에요.
- **persistence 프롬프트가 붙은 대화 추출** — 키워드로 발동해요. (`next session`, `follow-up`, `TODO:`, `come back to`, `defer`, EN+KR.) 한 번의 묶음 `AskUserQuestion`으로 합치고, 선택지가 누락분을 journal Next, project todos.md, active task, Skip 중 한 곳으로 보내요.
- **강제 차단이 아니라 부드러운 경고** — 상위 `## Session:` 헤더에서 `(project)` 태그를 자동으로 뽑아내요. 모호하면 경고만 띄워요. /wrap을 막지는 않아요.
- **최종 리포트의 감사 흔적** — Persistence Audit이 source별 카운트와 potentially-lost(Skip 선택분), 태그 누락 경고까지 같이 출력해요. 아무 항목도 조용히 빠지지 않았다는 시각적 확인을 받게 돼요.

## 구현 중에 걸린 문제들

rollout하면서 세 가지에 걸렸어요.

- **pre-commit hook이 머지 commit을 평탄화했어요.** clean fast-forward 경로에 `--no-ff`를 줬을 때 일어났어요. 효과는 외형적이에요. 선형 history vs branch 맥락이 빠졌다는 정도지만, 알고는 있어야 해요.
- **`.me.md` 보호 hook이 수정뿐 아니라 새로 만드는 것까지 막아요.** 우회는 이렇게 했어요. AI가 쓴 task 요약은 그냥 `index.md`로 두고, `.me.md`는 사람이 손으로 쓴 seed doc 전용으로만 남겨요. 관련 글에 더 적어뒀어요.
- **Markdownlint MD041은 frontmatter 직후의 첫 줄을 검사해요.** H1 없이 H2가 먼저 나오면 실패해요. plan file은 frontmatter 다음에 H1을 바로 둬야 해요. 관련 글에 더 적어뒀어요.

## 이런 상황에 맞아요

이 패턴은 매 session마다 다시 그려지는 cross-session 상태 대시보드, 즉 priorities 목록이나 task tracker, follow-up 면 같은 것에 어울려요. journal과 project file, actives 폴더처럼 여러 영속 source에 흩어진 작업을 한데 모아 요약하는 skill에도 맞아요. 대화에서만 언급된 항목이 context clear 너머로 살아남아야 하는 도구도 마찬가지예요. 반대로 덮어쓰기가 의도된 단일 source 상태는 안 맞아요. 최신 snapshot만 비춰야 하는 자동 생성 리포트나, carry-forward가 오히려 현재 상태를 가리는 실시간 대시보드, 한 번 쓰고 버리는 디버그 출력에는 굳이 끼울 필요가 없어요.

## 실용적인 takeaway

Cross-session 상태는 누락 모드마다 따로 방어막이 있을 때만 살아남아요. Durable-source-only로 다시 그리면 덮어쓰기 모드가 죽어요. 다중 source 누적 스캔이 탐색 모드를 죽여요. keyword로 발동하는 conversation 추출과 한 번의 batched prompt가 대화 모드를 죽여요. 자동으로 도출되는 project 태그와 부드러운 경고가 태그 누락 모드를 죽여요. generator + lock 조합은 skill 내부 머지보다 parallel-wrap 동시성 아래에서 안전한데, one-user 도구라도 별도 Node script로 빼낼 가치가 있어요.

## References

- [GitHub Actions — Using workflows](https://docs.github.com/en/actions/using-workflows)
- [feat(wrap): persist follow-ups across sessions](https://github.com/brandonwie/3b/commit/46e23c05)
- [feat(wrap): durable-source ACTIVE-STATUS generator with parsing fixes](https://github.com/brandonwie/3b/commit/28ab7012)

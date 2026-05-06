---
title: Wrap Skill Follow-Up Persistence 아키텍처
description: 'session-state dashboard가 단일 source(오늘의 journal)에서 regenerate되면, 이전 session의 unresolved follow-up이 매 rebuild마다 조용히 사라져요. single-source discovery + conversation-only mention과 합쳐지면 follow-up이 동시에 세 가지 방식으로 사라져요. fix는 4-layer 아키텍처예요.'
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
translation_date: '2026-05-06'
---

session-state dashboard가 단일 source(예: 오늘의 journal)에서 regenerate되면, 이전 session의 unresolved follow-up이 매 rebuild마다 조용히 사라져요. single-source discovery + conversation-only mention과 합쳐지면 follow-up이 동시에 세 가지 방식으로 사라져요. fix는 각 loss mode를 독립적으로 방어하는 4-layer 아키텍처예요.

## 4가지 loss mode

1. **Full-overwrite regeneration** — Priorities section이 오늘의 signal에서만 rebuild되어 어제의 unresolved item을 drop.
2. **Single-source discovery** — 한 file pattern만 scan; project-level "Next Session" section(`projects/{p}/todos.md`)이 invisible.
3. **Conversation-only follow-up** — "next session: do X"가 언급됐지만 절대 journal에 안 들어가서 `/clear`에서 죽음.
4. **Untagged item** — `(project)` prefix가 없는 entry가 downstream으로 라우팅 못 함.

## 디자인 진화: 2026-04-28 → 2026-04-30

원래 v1.3.0 디자인은 prior ACTIVE-STATUS Priorities의 in-skill carry-forward merge였어요. 2026-04-28에 Step 5.7이 `scripts/regenerate-active-status.js` (`.agents/locks/active-status.lock`이 있는 Node generator)로 대체됐어요. 두 가지 이유:

1. **Parallel-wrap concurrency safety.** 두 /wrap session이 같은 dashboard에서 race하면 carry-forward merge가 update를 잃을 수 있어요. generator는 lock을 acquire하고 `ACTIVE-STATUS.md`를 durable-source-only output으로 다뤄요(prior dashboard state를 절대 안 읽음).
2. **Single source of truth.** Carry-forward는 dashboard의 prior content를 implicitly state로 신뢰했어요. durable-source-only는 journal + project todos.md + actives folder를 directly 읽어요. dashboard가 그것들을 reflect하지, 그 반대가 아니에요.

Test 1 (carry-forward)는 이 shift로 design-obsolete가 됐어요. 남은 merge logic(multi-source scan, resolution drop, dedup, tag derivation)은 모두 generator의 `collectPriorities` + `collectProjectFollowups` + `withProject` 함수로 이동했고, `scripts/regenerate-active-status.test.js`의 20개 unit test로 cover돼요(2026-04-30 close 시점에 모두 green).

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

- **Durable-source-only, not merge.** ACTIVE-STATUS는 journal + project file에서 직접 regenerate. prior dashboard state의 carry-forward 없음. parallel-wrap safety를 위해 lock-protected.
- **원래 merge 의도는 durable-source layer에 보존:** `prior_priorities ∪ today_signal ∪ file_sources − resolved`, fuzzy ≥85% dedup + unbounded growth 방지 cap.
- **Multi-source additive scan** — first-match가 아니라 존재하는 모든 source에서 collect. 각 source는 documented purpose가 있어요(per-task vs project-level vs legacy fallback).
- **Conversation extraction with persistence prompt** — keyword-triggered (`next session`, `follow-up`, `TODO:`, `come back to`, `defer`, EN+KR), 한 batched `AskUserQuestion`, option이 orphan을 journal Next / project todos.md / active task / Skip로 라우팅.
- **Soft enforcement, not hard block** — parent `## Session:` header에서 자동으로 `(project)` tag 도출; ambiguous면 warn; 절대 /wrap을 block 안 함.
- **Audit-trail in final report** — Persistence Audit이 source별 count + potentially-lost (Skip choice) + untagged warning을 emit. user가 아무것도 조용히 빠지지 않았다는 시각적 확인을 받아요.

## 구현 중에 깨진 것들

rollout 중에 걸린 세 가지:

- **Pre-commit hook이 merge commit을 flatten했어요** clean fast-forward path에 `--no-ff`가 specified됐을 때. 효과는 cosmetic(linear history vs branch context lost)이지만 알 가치 있음.
- **`.me.md` protection hook이 edit뿐 아니라 creation도 block.** workaround: AI-authored task summary에 plain `index.md` 사용; `.me.md`는 human-authored seed doc에만 예약. related entry 참고.
- **Markdownlint MD041**은 첫 non-frontmatter 줄을 count; H1 전의 H2가 fail. plan file은 frontmatter 직후 H1이 필요. related entry 참고.

## 이게 맞는 상황

이 패턴은 매 session마다 regenerate되는 cross-session state dashboard(priorities list, task tracker, follow-up surface), 여러 persistent surface(journal + project file + actives folder)에 걸쳐 작업을 summarize하는 skill, conversation-only mention이 context clear에서 살아남아야 하는 모든 도구에 맞아요. overwrite가 의도적인 single-source state(최신 snapshot만 reflect해야 하는 generated report), carry-forward가 current state를 가릴 real-time dashboard, throwaway debug output에는 안 맞아요.

## 실용적인 takeaway

Cross-session state는 모든 loss mode에 방어가 있을 때만 살아남아요. Durable-source-only regeneration이 overwrite mode를 죽여요. Multi-source additive scanning이 discovery mode를 죽여요. Keyword-triggered conversation extraction과 single batched prompt가 conversation-only mode를 죽여요. Auto-derived project tag + soft warning이 untagged mode를 죽여요. generator+lock 패턴(in-skill merge 대비)이 parallel-wrap concurrency 아래서 아키텍처를 안전하게 만드는 거예요 — one-user 도구라도 extra Node script의 가치가 있어요.

## References

- [GitHub Actions — Using workflows](https://docs.github.com/en/actions/using-workflows)
- [feat(wrap): persist follow-ups across sessions](https://github.com/brandonwie/3b/commit/46e23c05)
- [feat(wrap): durable-source ACTIVE-STATUS generator with parsing fixes](https://github.com/brandonwie/3b/commit/28ab7012)

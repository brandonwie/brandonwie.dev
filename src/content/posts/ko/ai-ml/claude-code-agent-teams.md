---
title: "Claude Code Agent Teams"
description: >-
  여러 Claude Code 인스턴스를 팀으로 조율하는 실험적 기능의 설정, 패턴, 주의사항을 알아봅니다.
date: 2026-02-09T00:00:00.000Z
updated: 2026-03-18T00:00:00.000Z
tags:
  - ai-ml
  - claude-code
  - agent-teams
  - experimental
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: claude-code-agent-teams
source_updated: "2026-03-18"
translation_date: "2026-03-18"
references:
  - url: "https://code.claude.com/docs/en/agent-teams"
    title: Claude Code 세션 팀 조율하기
    type: official
---

같은 PR에 대해 보안, 성능, test 커버리지 세 가지 독립적인 코드 review를 동시에 돌려야 했어요. 터미널 탭 세 개를 열고 context를 복붙하는 건 Slack으로 인턴 관리하는 느낌이었죠. Agent Teams를 쓰면 하나의 Claude 세션이 리드 역할을 하고, 팀원을 별도 tmux pane에 생성하고, 공유 작업 목록으로 조율할 수 있어요. 아이디어는 매력적이에요. 다만 실행하려면 날카로운 모서리가 어디 있는지 알아야 해요.

이 글에서는 Agent Teams의 동작 방식, subagent나 solo 세션보다 나은 경우, 그리고 몇 주간 매일 사용하면서 겪은 모든 어려움을 다뤄요 -- 내가 모르는 사이에 셋업을 조용히 망가뜨린 것들까지 포함해서요.

## Agent Teams란

Agent Teams는 하나의 세션(리드)이 팀을 만들고, 팀원을 생성하고, 공유 인프라를 통해 작업을 조율하는 실험적 Claude Code 기능이에요. 각 팀원은 자체 context window를 가진 독립적인 Claude 인스턴스로 실행돼요.

조율 프리미티브는 이래요:

- **리드** -- 팀을 만들고, 작업을 할당하고, 결과를 승인하는 메인 세션
- **팀원** -- 각자 자체 pane에서 생성되는 별도의 Claude 인스턴스
- **작업 목록** -- 상태(대기, 진행 중, 완료)와 의존성 추적이 있는 공유 작업 항목
- **메일박스** -- 리드-팀원 쌍에 제한되지 않는, 모든 에이전트 간 직접 메시징

Subagent(`Agent` 도구)와는 달라요. Subagent는 백그라운드에서 실행되고 결과를 반환하는 방식이에요. 팀원은 영속적이고 인터랙티브하며 서로 소통할 수 있어요.

## 언제 Teams를 쓸까

Teams, subagent, solo 세션의 구분이 중요해요. 잘못 고르면 조율 오버헤드에 시간을 낭비하거나 성능을 놓치게 돼요.

| 필요                            | 사용       |
| ------------------------------- | ---------- |
| 빠른 집중 작업, 결과만 중요     | Subagent   |
| 작업자들이 토론하고 협업해야 함 | Agent team |
| 순차 작업, 같은 file 편집       | Solo 세션  |

Teams가 빛나는 경우: 병렬 코드 review, 경쟁적 가설 debugging, cross-layer 조율(frontend + backend + test 동시 진행), 그리고 발견 사항을 공유해야 하는 독립 모듈 개발이에요.

## 언제 Teams를 쓰면 안 될까

모든 병렬 워크로드가 조율 오버헤드를 감수할 만한 건 아니에요.

- **같은 file의 순차 편집.** 팀원이 같은 file을 동시에 안전하게 편집할 수 없어요. Solo 세션을 대신 쓰세요.
- **빠른 일회성 작업.** 솔로로 5분 이내면 팀 셋업이 절약하는 시간보다 더 걸려요. 집중 위임에는 subagent를 쓰세요.
- **세션 지속성이 필요할 때.** in-process 팀원은 중단되면 복구할 수 없어요. 여러 번에 나눠서 할 수 있는 작업이면 인계 문서와 함께 solo 세션을 쓰세요.
- **중첩 조율.** 팀 안에서 팀을 만들 수 없어요. 계층적 위임이 필요하면 여러 solo 세션을 수동으로 조율하세요.

## 설정하기

두 가지 설정이 필요해요. 먼저 실험적 기능 flag를 활성화해요:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

그리고 display 모드를 설정해요. 옵션은 `"in-process"`, `"tmux"`, `"auto"`예요:

```json
{
  "teammateMode": "tmux"
}
```

`"tmux"`와 `"auto"` 모두 `it2` CLI를 통해 iTerm2를 자동 감지하게 되어 있지만, iTerm2 backend는 v2.1.74 기준으로 동작하지 않아요(issue #24301 -- 아래에서 자세히 다뤄요). 실제로 split pane은 tmux 세션 안에서만 작동해요. tmux 없이는 팀원이 에러나 경고 없이 조용히 in-process 모드로 빠져요. **우회 방법:** iTerm2에서 `tmux -CC`(control mode)를 실행하면 tmux backend를 통해 네이티브 iTerm2 pane을 쓸 수 있어요.

## 핵심 패턴

매일 사용하면서 팀을 혼란스럽지 않고 생산적으로 만드는 네 가지 패턴이 나왔어요:

- **Delegate 모드** (Shift+Tab) -- 리드를 조율만 하도록 제한해서 직접 구현하는 걸 막아요. 리드가 작업 관리와 review에 집중하게 해줘요.
- **계획 승인** -- 팀원이 읽기 전용 모드에서 먼저 계획을 세우고, 리드가 검토한 뒤에 구현을 승인해요. 잘못된 요구사항 이해로 인한 헛수고를 방지해요.
- **작업 크기 조정** -- 팀원당 5-6개 작업을 목표로 하세요. 너무 적으면 팀원이 놀고, 너무 많으면 context overflow가 생겨요.
- **품질 hook** -- `TeammateIdle`(팀원이 일찍 멈추지 않고 계속 작업하게 함)과 `TaskCompleted`(조기 완료 선언 방지)가 가드레일 역할을 해요.

## 겪은 어려움들

이 섹션이 이 글이 존재하는 이유예요. 공식 문서는 해피 패스만 다뤄요. 아래 내용은 전부 깨진 세션, 잃어버린 작업, 골치 아픈 debugging을 통해 배운 거예요.

**실험적이고 문서화되지 않은 edge case.** 이 기능은 experimental로 표시되어 있어요. error 복구, 팀원별 context 한도, 작업 의존성 해결 방식은 시행착오로 배웠어요. 문서가 기본은 다루지만 실패 모드는 안 다뤄요.

**in-process 모드에 세션 복구가 없어요.** 팀원이 crash하거나 터미널이 닫히면 그 팀원의 작업이 사라져요. 작업 중간에 20분치 구현 진행을 잃고 나서 발견했어요. checkpoint나 복구 메커니즘이 없어요.

**권한 상속이 전부 아니면 전무예요.** 팀원은 생성 시 리드의 권한 모드를 상속해요. 다른 팀원에게 다른 권한 수준을 줄 수 없어요 -- 읽기 전용 reviewer와 읽기/쓰기 구현자가 별도의 권한 설정이 필요한데 지원되지 않아요.

**team vs subagent vs solo 선택.** 구분이 미묘해요. 초기에는 subagent가 더 적합한 작업(빠른 집중 작업)에 agent teams를 써서 5초면 끝나는 백그라운드 작업에 조율 오버헤드를 낭비했어요.

**Git worktree에서 gitignored symlink가 사라져요.** 팀원이 git worktree에서 작업하면 tracked file만 보여요. Gitignored symlink(`CLAUDE.local.md`, `.claude/settings.local.json`, `.claude/skills`)가 없어서 개인 설정과 지침이 worktree 팀원에게 로드되지 않아요. 중요한 환경 변수는 user-level `~/.claude/settings.local.json`에 넣고, spawn prompt에 context를 미리 포함시켜서 우회했어요.

**iTerm2 `ITermBackend`가 동작하지 않아요(known bug #24301).** 바이너리에 `it2 session split` 지원이 포함된 `ITermBackend`가 있지만, backend 선택 로직이 이걸 활성화하지 않아요. `teammateMode: "auto"`나 `"tmux"`를 설정해도 tmux 세션 안이 아니면 Claude Code가 조용히 `in-process`로 빠져요 -- `it2`가 설치되어 있고, Python API가 활성화되어 있고, 모든 iTerm2 환경 변수가 있어도요. v2.1.74에서 여러 번 test해서 확인했어요. `teammateMode` 설정은 세션 시작 시 스냅샷되기 때문에 세션 중간에 `settings.json`을 바꿔도 효과가 없어요. **우회 방법:** `tmux -CC`(iTerm2 control mode)를 쓰면 tmux backend를 통해 네이티브 iTerm2 pane을 쓸 수 있어요.

**TeamDelete가 참조가 끊긴 tmux pane을 정리하지 않아요.** 에이전트가 종료되면 tmux pane이 새 zsh 셸로 살아 있어요. `TeamDelete`는 팀 메타데이터만 정리하고 pane은 안 건드려요. 참조가 끊긴 각 pane에 `tmux kill-pane -t %<id>`를 수동으로 실행해야 해요. 팀 작업 후 `tmux list-panes -a`로 좀비 셸이 쌓이지 않게 확인하세요.

**동시에 3명 이상 spawn하면 tmux race condition이 생겨요.** 팀원을 동시에 3명 이상 생성하면 tmux `send-keys`에서 "not in a mode" error가 나요. Pane은 만들어지지만 에이전트가 시작되지 않아요. 개별적으로 다시 시도하면 보통 해결돼요. 팀원을 순차적으로(잠깐의 간격을 두고) 생성하면 문제를 아예 피할 수 있어요.

**Settings.json 재구성 부작용.** Claude Code UI에서 설정을 저장하면 `settings.json`을 재구성하면서 `defaultMode` 같은 값을 조용히 바꿀 수 있어요. UI에서 변경한 뒤에는 항상 버전 관리와 diff를 확인하세요 -- 조용한 변경을 잡아낼 수 있어요.

**TeamCreate가 instructions에서 잘못 제거됨.** 이건 특히 교활했어요. 이전 세션에서 `TeamCreate`가 deferred tool이라 도구 목록에 안 보이니까 존재하지 않는다고 결론 내렸어요. 글로벌 CLAUDE.md가 "Agent tool을 대신 사용하라"로 업데이트됐고, 이후 모든 세션에서 split pane teams 대신 백그라운드 subprocess가 사용됐어요. 수정은 간단했어요: deferred tool이 존재하지 않는다고 결론 내리기 전에 항상 `ToolSearch`로 확인하는 거예요. 하지만 피해는 이미 발생한 뒤였어요 -- teams가 작동하고 있다고 생각했지만 실제로는 백그라운드 subagent를 받고 있던 세션들이 여러 번 있었어요.

**Deferred tool 가시성 편향.** TeamCreate를 올바르게 문서화한 뒤에도, Claude는 `team_name` 없이 `Agent` tool을 계속 사용했어요 -- 항상 split pane 없이 in-process로 실행돼요. 근본 원인: `Agent` tool은 항상 기본 도구 목록에 보이지만, `TeamCreate`는 `ToolSearch`로 로드해야 하거든요. Claude는 보이는 도구를 먼저 선택해요. 해결법은 `SessionStart` hook(`session-start-team-preload.py`)으로 세션 시작 시 Claude에게 TeamCreate 사전 로드를 상기시키는 거였어요. advisory 출력에 명시적 3단계 workflow가 포함돼요: `ToolSearch` → `TeamCreate` → `Agent(team_name)`. 핵심: `Agent` without `team_name` = in-process subprocess; `Agent` WITH `team_name` = tmux split pane. 이 차이는 알지 못하면 보이지 않아요.

## 제한 사항 요약

빠른 참조를 위한 전체 제약 조건이에요:

- in-process 팀원에 세션 복구 없음
- 세션당 한 팀, 중첩 팀 불가
- 고정 리드 (리더십 이전 불가)
- 모든 팀원이 생성 시 리드의 권한 모드 상속
- Split pane에 tmux 필요 (iTerm2 ITermBackend가 존재하지만 동작하지 않음 -- #24301)
- tmux 없이는 팀원이 에러 없이 조용히 in-process로 빠짐
- iTerm2 우회 방법: tmux -CC control mode로 tmux backend를 통해 네이티브 pane 사용
- TeamDelete가 참조가 끊긴 tmux pane을 정리하지 않음 (수동 정리 필요)
- 팀원 3명 이상 동시 spawn 시 race condition 발생 (개별 재시도로 해결)
- Worktree에서 gitignored file 누락 (팀원이 개인 설정을 못 읽음)
- Deferred tool(TeamCreate 등)은 ToolSearch로 로드하기 전까지 안 보임

## 예시 prompt

팀 조율 패턴을 보여주는 prompt예요:

```text
Create an agent team to review PR #142. Spawn three
reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

리드가 각 reviewer에게 작업을 할당하고, reviewer들은 각자의 pane에서 독립적으로 작업하고, 발견 사항은 메일박스를 통해 리드에게 전달돼서 종합할 수 있어요.

## 정리

Agent Teams는 실질적인 조율 문제를 해결해요: 공유 상태가 있는 codebase에서의 병렬 작업이에요. 작업 목록과 메일박스 프리미티브는 잘 설계되어 있어요. 거친 모서리는 인프라 쪽에 있어요 -- tmux pane 관리, config parsing, worktree 격리, 그리고 셋업을 조용히 다운그레이드할 수 있는 deferred tool 가시성 문제예요.

가장 중요한 교훈은: 도구가 존재하지 않는다고 결론 내리기 전에 확인하세요. Claude Code의 deferred tool은 검색하기 전까지 안 보여요. 한 세션에서의 잘못된 가정 하나가 설정에 전파되어 며칠간 이후 모든 세션의 품질을 떨어뜨렸어요. 보이는 도구 목록이 아니라 `ToolSearch`로 확인하세요.

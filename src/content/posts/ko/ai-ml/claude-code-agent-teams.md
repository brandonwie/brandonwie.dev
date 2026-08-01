---
title: Claude Code Agent Teams를 실제 작업에 쓰며 배운 점
description: >-
  Agent Teams의 현재 동작과 version별 pane 문제, 작업 소유권, 결과 전달
  실패를 구분해서 정리한 사용 기록이에요.
date: 2026-02-09T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: 2026-07-23
references:
  - url: 'https://code.claude.com/docs/en/agent-teams'
    title: Claude Code Agent Teams 공식 문서
    type: official
---

PR 하나를 보안, 성능, test coverage 세 방향에서 동시에 review해야 했어요.
terminal session을 따로 띄우면 작업은 병렬로 할 수 있지만 task 상태와 발견
사항을 직접 옮겨야 했어요.

Agent Teams는 이 흐름을 제품 기능으로 묶어요. 하나의 Claude Code session이
lead가 되고, 각자 context window를 가진 팀원들이 shared task list와 직접
메시지를 사용해요. 아직 experimental 기능이라 pane 구현보다 오래 유지되는
조율 규칙이 더 중요했어요.

## Agent Teams가 제공하는 것

공식 문서는 Claude Code 2.1.178 기준 동작을 설명해요. 아래에서 이전 version을
다루는 부분은 당시 관찰로 따로 표시했어요.

- 리드가 팀을 조율하고 작업을 배정하며 결과를 승인해요.
- 팀원은 독립된 Claude instance와 context를 사용해요.
- 작업 목록은 pending, in progress, completed 상태와 의존성을 공유해요.
- 메일함으로 리드와 팀원, 팀원끼리 직접 메시지를 주고받아요.

호출자에게 결과 하나만 돌려주는 subagent와 달리 teammate는 서로 메시지를
주고받고 shared task로 조율할 수 있어요.

## 언제 team을 쓸까

| 필요한 것                           | 선택       |
| ----------------------------------- | ---------- |
| 짧고 집중된 작업, 결과만 필요       | Subagent   |
| 작업자끼리 발견 사항을 주고받아야 함 | Agent team |
| 같은 file을 순서대로 편집           | Solo       |

병렬 code review, 서로 다른 가설을 검증하는 debugging, frontend와 backend와
test를 함께 맞추는 작업에 잘 맞아요. 독립된 module을 맡더라도 중간 발견을
공유해야 한다면 team이 유용해요.

다만 background teammate의 작업은 결과가 아니에요. 메시지로 돌아오거나 약속한
artifact에 쓰이기 전에는 lead가 읽을 수 없어요. fan-out 뒤 모든 결과를 바로
모아야 한다면 synchronous worker를 쓰거나 전달 경로를 brief에 명시해요.

## team이 맞지 않는 경우

- 같은 file을 순서대로 고치는 작업은 solo session이 안전해요.
- 혼자 5분 안에 끝나는 일은 team setup 비용이 더 커요.
- 여러 번에 걸쳐 이어갈 작업은 session resumption이 가능한 solo 작업과 handoff
  문서가 나아요.
- team 안에서 다시 team을 만드는 중첩 구조는 지원하지 않아요.

## 설정과 version 차이

실험 기능 flag를 켜요.

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

화면 동작은 release마다 바뀌었어요. 특정 mode가 필요하면 오래된 설정을 그대로
복사하지 말고 설치한 version의 문서를 확인해요. tmux를 선호할 때 사용해 온
설정은 다음과 같아요.

```json
{
  "teammateMode": "tmux"
}
```

공식 문서에 따르면 2.1.178부터 teammate를 만들 때 별도 team setup 단계가
필요하지 않고 session이 끝나면 cleanup도 자동으로 이뤄져요. 아래 iTerm2와
tmux 문제는 각 heading에 적힌 예전 version의 진단 기록이에요. 현재 설정
contract로 사용하면 안 돼요.

## 반복해서 도움이 된 패턴

- Delegate mode(Shift+Tab)로 lead를 조율과 review에 집중시켜요.
- teammate가 read-only로 계획을 먼저 쓰고 lead가 승인한 뒤 구현해요.
- teammate 한 명당 task 5~6개 정도로 나눠요.
- `TeammateIdle`과 `TaskCompleted` hook으로 조기 중단과 완료 오판을 막아요.

## 실제로 만난 실패들

공식 문서가 기본 동작을 설명한다면, 이 부분은 깨진 session에서 확인한 실패
모양을 기록해요.

### 실험 기능의 경계

in-process로 실행한 팀원이 중단되거나 terminal이 닫히면 이어갈 수 없어요.
팀원은 생성할 때 리드의 권한 mode를 그대로 상속해요. 읽기 전용 reviewer와
쓰기가 가능한 implementer에게 서로 다른 권한을 줄 수 없어요.

Git worktree에는 tracked file만 들어와요. `CLAUDE.local.md`,
`.claude/settings.local.json`, `.claude/skills`처럼 gitignore된 symlink는
없어요. 필요한 환경 변수와 지시사항은 user-level 설정이나 spawn prompt로
따로 전달해야 해요.

### iTerm2와 tmux의 예전 동작

2.1.74에서는 테스트한 `ITermBackend` 경로가 활성화되지 않았고 tmux 밖에서는
in-process mode로 fallback됐어요. `tmux -CC`를 쓰면 tmux backend가 iTerm2
split pane을 제공했어요. 최신 release에도 같은 우회가 필요하다고 가정하지
말고 다시 확인해야 해요.

2.1.138 문제를 조사하며 binary string table에서 `S_()`와 `e_()`가 관리하는
flag 두 개를 찾았어요.

- `preferTmuxOverIterm2`: iTerm2 setup prompt에서 "Use tmux instead"를
  고르면 `true`가 돼요.
- `iterm2It2SetupComplete`: `it2 session list` 검증이 성공하면 `true`가
  돼요.

둘 다 `settings.json`에 없고 CLI로 읽거나 쓸 수도 없었어요. 당시 runtime은
`process.env.TMUX`가 있으면 stderr에
`[BackendRegistry] Selected: tmux (running inside tmux session)`을
남겼어요. 그 version을 진단할 때는 문서의 설정값보다 `claude --debug` log가
실제 선택을 보여줬어요.

오래된 build는 team metadata를 지운 뒤에도 tmux pane을 shell로 남기기도
했어요. 현재 문서는 session 종료 시 자동 cleanup을 설명해요. 특정 version에서
pane이 남는다면 `tmux list-panes -a`로 확인하고 그 release의 bug로 보고해요.

teammate를 세 명 이상 동시에 만들 때 tmux `send-keys`의 "not in a mode"
오류도 겪었어요. pane은 생겼지만 agent가 시작되지 않았고, 한 명씩 다시 만들면
대체로 정상 동작했어요.

### 공유 task는 file 소유권을 보장하지 않아요

먼저 끝난 teammate가 다른 teammate의 진행 중 task를 가져간 적이 있어요. 두
agent가 같은 file을 고치게 되면서 충돌 위험이 생겼어요.

공유 작업 목록은 file 수정을 순서대로 보장하지 않아요. 팀원을 만들 때 담당자를
지정하고, `in_progress`이거나 다른 agent가 소유한 작업은 가져가지 못하게
brief에 적어야 해요.

### 보이는 tool만 고르는 편향

예전에는 `TeamCreate`가 기본 tool 목록에 보이지 않는다는 이유로 존재하지 않는
기능이라고 잘못 판단했어요. deferred tool은 `ToolSearch`로 불러오기 전까지
보이지 않았어요. 그 잘못된 결론이 global instruction에 들어가면서 split pane
team 대신 background subagent를 쓰는 session이 이어졌어요.

2.1.138 당시에는 `Agent`에 `team_name`을 주지 않으면 in-process subprocess,
`team_name`을 주면 tmux teammate가 됐어요. 이 역시 version별 기록이에요.
현재 release에서는 공식 문서와 live tool schema를 먼저 확인해야 해요.

### summary field에 결과가 사라질 수 있어요

teammate 응답에는 UI용 짧은 `summary`와 전체 `message`가 따로 있었어요.
brief가 모호하면 teammate가 summary에 "완료"만 적고 message 본문을 비워
실제 deliverable이 오지 않았어요. content message 없이 idle 알림만 온 경우도
완료로 보면 안 돼요.

결과를 메시지로 받아야 한다면 brief에 아래 계약을 넣어요.

```text
Put the full deliverable in the message body.
The summary field is metadata only, max 10 words.
```

fan-out 결과를 바로 읽어야 할 때는 이름 없는 synchronous worker가 더
단순해요. 마지막 메시지가 tool result로 돌아와 summary에 갇히지 않아요.

더 강한 실패도 있었어요. `SendMessage`와 `Write`가 없는 read-only worker는
background report를 보낼 방법 자체가 없었어요. 이런 worker를 background로
띄운다면 Bash로 약속한 경로에 report를 쓰는 file-drop 계약이 필요해요.

## 현재도 전제로 둘 제한

- teammate는 서로 다른 context를 사용하므로 핵심 요구사항을 task마다 적어요.
- shared task만으로 file 중복 소유를 막을 수 없어요.
- background 결과에는 message, synchronous return, file path 중 하나의 전달
  계약이 필요해요.
- worktree에는 개인 gitignored 설정이 없어요.
- permission과 display 동작은 version에 민감하므로 설치한 release와 runtime
  log로 확인해요.

위의 긴 incident는 실패 모양을 알아보는 데는 유용하지만, 오래된 tool 이름과
backend 동작을 오늘의 호환성 약속으로 읽으면 안 돼요.

## 사용 예시

```text
Create an agent team to review PR #142. Spawn three
reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

lead가 task를 배정하고 각 reviewer가 독립적으로 일한 뒤 mailbox로 발견 사항을
보내는 형태예요.

## 남은 원칙

Agent Teams는 독립된 작업자가 서로 발견을 공유해야 하는 복잡한 작업에 맞아요.
결과 하나만 필요하면 subagent가 낫고, 같은 file을 순서대로 고치면 solo
session이 안전해요.

가장 오래 남은 교훈은 소유권과 전달 방식을 명시하는 것이었어요. shared task가
write를 serialize하지 않고 teammate를 띄웠다고 결과가 lead에게 도착하는 것도
아니에요.

공식 동작과 version별 증거도 분리해야 해요. 현재 문서를 기준으로 시작하고,
설정과 다르게 움직일 때 설치한 release의 runtime log를 봐요. 과거 binary
string과 pane 우회는 당시 incident를 설명할 수 있지만 오늘의 contract는
아니에요.

---
title: Multi-Agent 메시지 경쟁에서 HOLD를 안전하게 다루는 법
description: >-
  비동기 agent mailbox에서 명령과 완료 보고가 엇갈릴 때 target state,
  idempotent guard, live evidence로 중복 실행을 막는 방법이에요.
date: 2026-07-22T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - ai-ml
  - agents
  - orchestration
  - concurrency
  - claude-code
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: multi-agent-message-race-hold-discipline
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: 'https://code.claude.com/docs/en/agent-teams'
    title: Claude Code agent teams
    type: official
  - url: >-
      https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
    title: Making retries safe with idempotent APIs
    type: authoritative
---

한 orchestration session에서 명령과 완료 보고가 세 번이나 서로 엇갈렸어요.
HOLD가 도착하기 전에 push가 끝나기도 했고, 이전 완료 메시지가 새 정정 명령보다
늦게 오기도 했어요.

비동기 mailbox는 "명령 전송, 실행, 보고" 전체를 하나의 transaction으로
묶어주지 않아요. 이 상황을 불복종으로 보고 같은 명령을 다시 보내면 commit이
중복되거나 history를 한 번 더 고칠 수 있어요.

## 동작 대신 target state를 명령해요

안전한 지시는 실행할 동작보다 마지막에 참이어야 할 상태를 설명해요.

```text
Target: branch contains the fix folded into the feature commit.
Guard: if that state is already pushed, do not rewrite it again.
Verify: report the current commit hash and remote branch hash.
```

이 형태는 idempotent해요. 같은 명령을 두 번 받은 팀원은 target을 두 번
검증하지만 되돌리기 어려운 변경은 최대 한 번만 실행해요. AWS도 retry 가능한
API를 설명할 때 같은 성질을 강조해요. 요청을 다시 보내도 side effect가 하나 더
생기지 않아야 해요.

## 실행하는 쪽에 stop guard를 둬요

이미 commit하거나 push했는지는 executor만 알아요. HOLD를 보낸 lead는 그
메시지가 변경 작업보다 먼저 도착했다고 가정할 수 없어요.

되돌리기 어려운 명령에는 local precondition을 같이 넣어야 해요.

```typescript
type State = { localHash: string; remoteHash: string; targetHash: string };

function shouldRewrite(state: State): boolean {
  return !(
    state.localHash === state.targetHash &&
    state.remoteHash === state.targetHash
  );
}
```

operation마다 조회 방식은 다르지만 흐름은 같아요. live state를 읽고 target과
비교한 뒤, 이미 일치하면 아무것도 하지 않아요.

## 전달 여부는 state evidence로 확인해요

응답이 없다고 명령이 도착한 것은 아니에요. 제가 겪은 경우에는 amend 요청 뒤에
이전과 같은 commit hash가 보고됐어요. amend를 실행했다면 hash가 반드시
바뀌므로, 그 결과만으로 새 명령이 적용되지 않았다는 걸 알 수 있었어요.

팀원의 표현을 해석하는 것보다 artifact를 target과 비교하는 편이 강해요.
commit hash, file checksum, PR state, test 결과처럼 다시 확인할 수 있는 값을
사용해요.

## 겹치는 작업은 순서를 정해요

Agent Teams의 공유 task list와 직접 메시지는 동시 file 편집을 transaction으로
만들지 않아요. 두 작업이 같은 file이나 history를 건드리면 dependency를
명시해야 해요. 첫 작업이 검증된 상태를 보고한 뒤에만 두 번째 작업을 시작해요.

경쟁했을 수 있는 명령을 다시 보내기 전에는 repository를 재확인해요. 올바른
후속 지시는 새 실행이 아니라 "상태 확인됨, 중지"일 때가 많아요.

## 언제 이 규칙이 필요한가

명령과 완료 보고가 비동기로 오가는 환경에서 사용해요. amend, rebase,
force-push, deploy처럼 되돌리기 어려운 작업일수록 가치가 커요. 호출자가 각
operation이 끝날 때까지 기다리는 동기식 단일 agent loop에는 얻는 게 적어요.

중복 확인은 의도한 안전한 실패 방식이에요. 두 agent가 target이 이미 있다고
확인하면 메시지 하나가 더 들 뿐이지만, 변경을 두 번 실행하면 history를 잃을 수
있어요.

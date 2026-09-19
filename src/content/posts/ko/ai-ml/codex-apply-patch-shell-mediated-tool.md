---
title: 'Codex `apply_patch` 훅: 매처는 걸리는데 페이로드가 달라요'
description: >-
  2026-09-20 정정. Codex 훅은 `apply_patch`를 도구로 보고, `Edit|Write` 매처도
  거기에 닿아요. 재사용한 Claude 훅을 깨뜨리는 건 페이로드예요. 파일 경로 대신
  패치 텍스트가 오고, 한 번의 호출이 여러 파일을 건드려요.
date: 2026-05-01T00:00:00.000Z
updated: '2026-09-20'
tags:
  - ai-ml
  - codex
  - claude-code
  - hooks
  - cross-agent
  - transferable
  - gotcha
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: codex-apply-patch-shell-mediated-tool
source_updated: 2026-09-20T00:00:00.000Z
translation_date: '2026-09-20'
references:
  - url: 'https://developers.openai.com/codex/hooks'
    title: 'Codex hooks: matcher patterns and tool coverage'
    type: official
  - url: 'https://github.com/openai/codex'
    title: Codex CLI repository
    type: official
---

> **정정, 2026-09-20.** 이 글은 2026년 5월에 "Codex `apply_patch`는 직접 도구가
> 아니라 셸 매개 도구예요"라는 제목으로 처음 나갔어요. 중심 주장이 지금의
> Codex에는 틀렸어요. `apply_patch`를 지목한 훅 매처는 절대 걸릴 수 없다고
> 썼는데 실제로는 걸려요. 아래 섹션은 현재 훅 문서와 Codex 0.154.0
> 재검증을 기준으로 다시 썼어요. 원래 추론은 글 끝에 기록으로 남겨뒀어요.
> 어떻게 틀렸는지가 쓸모 있는 부분이니까요.

파일을 편집할 때마다 코드 그래프를 갱신하는 `PostToolUse` 훅을 Claude Code와
Codex 양쪽에서 하나로 쓰고 싶었어요. Claude 쪽은 이미 있었어요. 매처는
`Edit|Write|MultiEdit|NotebookEdit`, 스크립트는 `tool_input.file_path`를 읽는
방식이었죠. 계획은 그걸 그대로 Codex 프로필에 복사하는 거였어요.

5월엔 그 복사본이 Codex에서 절대 실행되지 않을 거라고 결론 냈어요. 틀렸어요.
복사본은 실행돼요. 그러고 나서 있지도 않은 필드를 읽고 아무 일도 하지 않아요.
제가 설명했던 실패보다 더 조용하고, 그래서 알아채기 훨씬 어려운 실패예요.

## Codex 훅이 지금 보는 것

[Codex hooks 문서](https://developers.openai.com/codex/hooks#tool-coverage)는
도구 커버리지 표에 `apply_patch`를 올려두고, `PreToolUse`와 `PostToolUse`를 모두
지원한다고 적어요. 매처는 세 가지로 지목할 수 있어요. `apply_patch`, `Edit`,
`Write`예요. 어느 별칭으로 매칭됐든 훅 입력이 알려주는 도구 이름은 여전히
`apply_patch`예요.

셸 실행은 별도의 행이에요. 셸 명령과 unified exec(`exec_command`)은 둘 다
`Bash`로 매칭돼요.

같은 페이지가 `apply_patch`는 입력을 `tool_input.command`에 담는다고 말해요.
격리된 프로필에서 Codex 0.154.0으로 다시 확인해 봤어요. 매처가 `apply_patch`인
`PreToolUse` 훅이 네이티브 편집에서 실행됐고, 그 편집을 거부했고, 재시도는
통과시켰어요. 페이로드 모양은 이래요.

```json
{
  "tool_name": "apply_patch",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: src/app.ts\n@@ ...\n*** End Patch"
  }
}
```

그러니까 재사용 계획에서 매처 쪽 절반은 괜찮았어요. `Edit|Write`는 문서화된
별칭을 통해 Codex 파일 편집에 닿아요.

## 재사용한 훅이 여전히 깨지는 지점

문제는 스크립트예요. Claude 편집 훅은 `tool_input.file_path`에서 경로 하나를
읽어요. Codex엔 그 필드가 없어요. 제 훅은 빈 경로를 `exit 0`으로 막아두니까
실행되고, 아무것도 못 찾고, 깨끗하게 끝나요. 건너뛰었다는 말은 로그 어디에도
없고요.

다시 써야 하는 이유는 두 가지 차이예요.

- 경로는 패치 텍스트 안에 들어 있고, 세 디렉티브가 그걸 선언해요.
  `*** Update File: <path>`, `*** Add File: <path>`,
  `*** Delete File: <path>`예요.
- 한 번의 호출이 여러 파일을 건드릴 수 있어요. 패치 하나에 디렉티브가 여러 개
  들어갈 수 있으니 훅은 루프를 돌아야 해요.

Codex 쪽 최소 추출기는 이 정도예요.

```bash
#!/usr/bin/env bash
# Reads hook JSON on stdin, prints one affected path per line.
jq -r '.tool_input.command // empty' \
  | grep -E '^\*\*\* (Update|Add|Delete) File: ' \
  | sed -E 's/^\*\*\* (Update|Add|Delete) File: //'
```

프라이버시 필터든 디바운스든 그 뒤에 오는 건 에이전트끼리 공유할 수 있어요.
달라지는 건 경로 추출뿐이에요.

## 나란히 놓고 보기

| 관심사             | Claude Code                            | Codex CLI                                  |
| ------------------ | -------------------------------------- | ------------------------------------------ |
| 매칭할 도구 이름   | `Edit\|Write\|MultiEdit\|NotebookEdit` | `apply_patch` (별칭 `Edit`, `Write`)       |
| 보고되는 도구 이름 | 매칭된 도구 그대로                     | 항상 `apply_patch`                         |
| 파일 경로 출처     | `tool_input.file_path`                 | `tool_input.command`의 디렉티브를 파싱     |
| 호출당 파일 수     | 1                                      | 1~다수                                     |
| 스크립트 재사용    | 직접                                   | 정책은 공유, 경로 리더는 에이전트별        |

아직 확인 안 한 경계가 하나 있어요. `apply_patch`가 아니라 셸 명령으로 하는 파일
쓰기예요. 문서는 그걸 `Bash` 행으로 보내니까, `apply_patch`에 걸어둔 편집 훅은
그걸 못 봐요. 페이로드를 직접 눈으로 보기 전까지는 각각을 별개로 다루는 게
맞아요.

## 어떻게 틀렸나

이 섹션은 2026년 5월의 추론을 그대로 남겨둔 거예요. 결론은 이미 대체됐고요.

Codex 바이너리를 `strings`로 들여다봤는데, `apply_patch`는 지시문 템플릿
안에서만 나왔어요. 모델더러 이렇게 하라고 보여주는 예시로요.

```text
- Use the `apply_patch` tool to edit files
  (NEVER try `applypatch` or `apply-patch`, only `apply_patch`):
  {"command":["apply_patch","*** Begin Patch\\n*** Update File: ..."]}
```

거기서 세 가지를 추론했어요. `apply_patch`는 셸 도구의 첫 인자고, 등록된 도구
이름이었던 적이 없고, 그걸 지목한 매처는 아무것도 매칭하지 못한다고요. 그래서 셸
도구 패밀리를 매칭하고 `command[1]`을 파싱하라고 권했어요.

그 발췌가 보여주는 건 셸 호출 형태예요. 실행 중인 클라이언트가 어떤 도구를
등록하는지, 훅이 어떤 페이로드를 받는지는 보여주지 못해요. 정적 아티팩트를 읽고
런타임 동작을 말한 거죠. 자기 입력을 찍어보는 5분짜리 훅 하나면 어느 쪽이든
진짜 질문에 답이 됐을 거예요.

## 핵심 정리

- `apply_patch`는 훅에 보여요. `PreToolUse`와 `PostToolUse`가 모두 지원하고,
  `Edit`, `Write`도 매처 별칭으로 통해요.
- 재사용한 Claude 훅은 실행된 다음에 실패해요. `tool_input.file_path`를 찾다가
  못 찾고, 에러 없이 끝나요.
- 경로는 패치 텍스트에만 있어요. `Update File`, `Add File`, `Delete File`
  디렉티브에서 뽑아내세요.
- 뽑아낸 경로를 순회하세요. 패치 하나가 여러 파일을 건드릴 수 있으니까요.
- 바이너리 문자열은 런타임 증거가 아니에요. 설계에 들어가기 전에 실제 훅
  페이로드를 찍어보고, 버전이 올라가면 한 번 더 찍어보세요.

## 언제 쓰나

- Claude Code 편집 훅을 Codex로 옮기거나, 그 반대로 옮길 때.
- 매칭은 되는데 아무 효과가 없는 Codex 훅을 디버깅할 때.
- 스크립트 재사용을 확정하기 전에 에이전트 간 훅 설계를 감사할 때.

## 언제 쓰면 안 되나

- 단일 에이전트 훅 설계. 페이로드 차이가 아예 등장하지 않아요.
- 서버 측 도구 설계. 이 글은 CLI 훅 라이프사이클에 관한 것뿐이에요.

## 마무리

"편집 도구"는 에이전트 사이에서 통일된 개념이 아니에요. Claude Code는 파일
경로를 넘겨요. Codex는 패치를 넘겨요. 매처는 양쪽에서 똑같아 보일 수 있지만, 그
아래 스크립트는 받게 될 페이로드에 맞춰 따로 써야 해요.

그래서 지금은 순서를 뒤집어서 해요. 실제 이벤트 하나를 찍어보고, 안에 뭐가 들어
있는지 읽고, 거기에 맞춰 훅을 써요.

## 참고

- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — 스킬 별칭
  레이어에서 에이전트 간 호환성 패턴을 다룬 동반 글.
- `projects/3b/decisions/019-graph-tool-integration.md` § Update — 이 근거로
  Phase 0a 연기를 문서화.
- `tmp/archived-tasks/40-wrap-graph-freshness-gate/round-1-review.md` (그리고
  원래 `proactive-review.md`) — 전체 세션 컨텍스트.

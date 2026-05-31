---
title: 'Codex `apply_patch`는 직접 도구가 아니라 셸 매개 도구예요'
description: >-
  Codex CLI에는 별개의 편집 도구가 없어요. 파일 편집은 `local_shell`을 통해 `apply_patch` 패치 텍스트로 흘러요.
  크로스-에이전트 훅은 도구 이름 매처가 아니라 페이로드 파싱 래퍼가 필요해요.
date: 2026-05-01T00:00:00.000Z
updated: '2026-05-05'
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
source_updated: 2026-05-05T00:00:00.000Z
translation_date: '2026-05-05'
---

PR #43을 시작할 때 계획이 있었어요. 기존 Claude `PostToolUse` 훅
(`graphify-update-debounced.sh`, 매처 `Edit|Write|MultiEdit|NotebookEdit`)을
가져다 Codex 프로필에 복사하면, 두 에이전트 모두에서 per-edit 그래프 갱신을 출시할
수 있을 거라고 봤어요. 훅을 바꿀 필요도 없을 거라 봤어요 — 같은 매처, 같은
스크립트.

그러다 Codex의 도구 인벤토리를 확인했어요. Codex엔 `Edit` 도구가 없어요. `Write`,
`MultiEdit`, `NotebookEdit`도 없어요. 재사용하려던 매처는 모든 Codex 세션에서
아무것도 매칭하지 않을 거고, 훅은 조용히 no-op이 될 거였어요.

수정은 다른 스크립트가 아니었어요. Codex가 편집을 도구로 모델링하지 않는다는 걸
이해하는 거였어요 — 편집은 셸 도구 패밀리를 통해 `apply_patch` 패치 텍스트를
실어 나르는 식으로 흘러요. 그러면 매처가 무엇을 봐야 하는지, 파일 경로가 어디서
오는지, 한 번의 훅 발화가 처리해야 할 파일이 몇 개인지 — 다 달라져요.

## 문제

파일 편집 도구를 타깃하는 크로스-에이전트 훅 설계는 각 에이전트가 통일된 스키마에
맞는 별개 편집 도구를 가졌다고 가정해요. Claude Code엔 `Edit`, `Write`, `MultiEdit`,
`NotebookEdit`가 직접 도구로 있고 페이로드는 `tool_input.file_path`를 갖죠.
Claude `PostToolUse` 매처 목록(`Edit|Write|MultiEdit|NotebookEdit`)을 Codex CLI에서
재사용하면 조용히 실패해요 — Codex는 그런 이름의 도구를 절대 호출하지 않거든요.

## 컨텍스트

3B `wrap-graph-freshness-gate` 작업(PR #43)은 처음에 기존 `graphify-update-debounced.sh`
훅을 Codex 프로필 `hooks.json` 항목으로 설치하면서 Claude 스크립트를 그대로
재사용할 계획이었어요. Phase 0a의 "Claude 스크립트 재사용" 가정은 실제 Codex 도구
인벤토리와 부딪치며 깨졌어요.

## Codex 편집 모델

Codex CLI엔 별개 편집 도구가 없어요. 대신 편집은 셸 도구 패밀리(`local_shell`,
`exec_command`, `shell`, `container.exec`, `Bash`, `Shell`)를 통해 구조화된
`apply_patch` 명령을 실어 나르는 식으로 흘러요:

```json
{
  "tool_name": "local_shell",
  "tool_input": {
    "command": [
      "apply_patch",
      "*** Begin Patch\n*** Update File: path/to/file.ts\n@@ ...\n*** End Patch"
    ]
  }
}
```

패치 텍스트는 영향받는 경로를 선언하는 세 디렉티브를 사용해요:

- `*** Update File: <path>` — 기존 파일 수정
- `*** Add File: <path>` — 새 파일 생성
- `*** Delete File: <path>` — 파일 삭제

`apply_patch` 한 번의 호출이 여러 파일을 건드릴 수 있어요. `apply_patch` 문자열은
`command[]`의 관례적 첫 인자예요 — Codex 바이너리는 `applypatch`와 `apply-patch`
별칭을 자기 instructions 템플릿에서 명시적으로 거부해요.

출처: `/opt/homebrew/bin/codex`에서 `strings | grep apply_patch`로 추출.
관련 바이너리 발췌:

```text
- Use the `apply_patch` tool to edit files
  (NEVER try `applypatch` or `apply-patch`, only `apply_patch`):
  {"command":["apply_patch","*** Begin Patch\\n*** Update File: ..."]}
```

이건 모델용 문서예요 — 바이너리의 instructions 템플릿이 LLM에게 "파일을 이렇게
편집해"라고 말 그대로 알려주는 거죠. 등록된 도구가 아니에요. 에이전트의 도구
라우터는 `apply_patch`를 도구 이름으로 본 적이 없어요.

## 왜 이게 중요한가

편집에서 발화해야 하는 PostToolUse 훅이라면 Codex 매처는 셸 도구 이름을
타깃해야 하고, 훅 스크립트는:

1. `tool_name`이 셸 패밀리에 속하는지 감지.
2. `tool_input.command[1]`을 패치 텍스트로 파싱.
3. `*** Update File: <path>` / `*** Add File:` / `*** Delete File:` 라인에서 파일
   경로 추출.
4. 추출된 경로마다 나머지 정책(프라이버시 게이트, 디바운스 등) 적용.

순진하게 `apply_patch` 매처 항목만 더한 크로스-에이전트 훅은 아무것도 매칭하지
않아요(Codex는 `apply_patch`라는 이름의 도구를 절대 호출하지 않거든요 — 그
문자열은 `local_shell`의 첫 ARG에 불과해요).

## 감지

훅 설계 전에 시스템에서 Codex의 도구 모델을 확인하세요:

```bash
# codex 바이너리 위치 확인
which codex                 # macOS에서는 /opt/homebrew/bin/codex

# 편집 관련 문자열 나열 (셸 패밀리 + apply_patch 문서)
strings /opt/homebrew/bin/codex \
  | grep -E '^(apply_patch|local_shell|shell|exec_command|container\.exec)$' \
  | sort -u

# instructions 템플릿에서 apply_patch 호출 예시 찾기
strings /opt/homebrew/bin/codex \
  | grep -B 1 -A 3 'Begin Patch'
```

결과는 `apply_patch`가 Codex의 도구 라우터에 등록된 도구 이름이 아니라,
바이너리에 문서화된 셸 명령으로 산다는 걸 확인해 줘요. 같은 감지 기법은 셸
매개일 거라 의심하는 어떤 도구에든 통해요 — 바이너리는 그걸 등록된 이름으로
가지고 있거나, 모델용 문서화된 prose로 가지고 있거나 둘 중 하나예요.

## 크로스-에이전트 훅 설계의 함의

기능이 Claude Code + Codex 양쪽에서 per-edit 훅 커버리지를 원할 때:

| 관심사            | Claude Code                            | Codex CLI                                       |
| ----------------- | -------------------------------------- | ----------------------------------------------- |
| 매칭할 도구 이름  | `Edit\|Write\|MultiEdit\|NotebookEdit` | `local_shell\|exec_command\|shell`              |
| 파일 경로 출처    | `tool_input.file_path`                 | `tool_input.command[1]`에서 파싱                |
| 호출당 파일 수    | 1                                      | 1~다수 (한 패치가 여러 파일을 건드릴 수 있음)   |
| 훅 스크립트 재사용| 직접                                   | 패치 텍스트 파싱 래퍼 필요                      |

"Claude 스크립트를 Codex에 그대로 재사용" 가정이 무너져요. Codex 전용 래퍼를
작성해서 `apply_patch` 페이로드를 파싱하거나, per-edit 훅 커버리지가 Claude
전용임을 받아들이고(`/wrap` Step 5.9가 그러듯이) 세션 종료 시점의 추론 게이트로
보충하세요.

## 부딪힌 어려움

- 발견은 직접 도구 재사용을 가정한 "Phase 0a 패리티 우선" 계획에 commit한 뒤에
  드러났어요. 작업 중간 재범위 조정에 ~30분을 잃었지만, 모든 Codex 세션에서
  조용히 no-op이 됐을 훅 출시는 막았어요.
- `instructions_template`은 바이너리 안의 수 메가바이트 문자열이에요.
  `strings | grep`은 통하지만 "apply_patch가 정확히 어디 문서화되어 있는지"는
  `grep -A 20 'apply_patch.*command'` 없이는 명확하지 않아요.
- 편집-유사 작업을 위한 Codex 도구 패밀리는 예상보다 넓어요(`local_shell` +
  `exec_command` + `shell` + `container.exec` + `Bash` + `Shell` 모두 셸 실행
  별칭이에요). 완전한 매처는 그 모두를 열거해야 해요.

## 핵심 포인트

- **Codex `apply_patch`는 셸 명령이지 도구 이름이 아니에요.** `apply_patch`를
  도구 이름으로 타깃하는 직접 도구 훅은 절대 발화하지 않아요.
- **패치 텍스트가 영향받는 경로의 진실의 원천이에요.** `*** Update File:`,
  `*** Add File:`, `*** Delete File:` 디렉티브에 대한 정규식으로 추출하세요.
- **단일 apply_patch가 여러 파일을 건드릴 수 있어요.** 훅 로직이 추출된 모든
  경로를 순회해야 해요.
- **크로스-에이전트 훅 재사용엔 페이로드 파싱 래퍼가 필요해요.** Claude의
  PostToolUse 훅 스크립트가 Codex에서 그대로 동작한다고 가정하지 마세요.
- **per-edit 훅은 정확성이 아니라 최적화예요.** 세션 종료 시점 추론 게이트
  (`/wrap` Step 5.9 같은)는 per-edit 훅 없이도 두 에이전트에서 동작해요. 그저
  per-edit 베이스라인이 없는 에이전트에서 새로고침을 더 자주 권장할 뿐이에요.

## 언제 쓰나

- 여러 에이전트에서 파일 편집에 발화해야 하는 PostToolUse 훅 설계.
- Claude 전용 훅을 Codex 패리티로 마이그레이션.
- 명백한 도구 매치가 있는데 Codex 훅이 편집에서 절대 발화하지 않는 이유 조사.
- "스크립트를 그대로 재사용" 계획에 commit하기 전에 크로스-에이전트 도구 인벤토리
  감사.

## 언제 쓰면 안 되나

- 단일 에이전트 훅 설계(Claude 전용이나 Codex 전용). 하나의 에이전트만 범위에
  있을 땐 셸 매개 세부사항이 중요하지 않아요.
- 서버 측 도구 설계(이건 순전히 CLI 훅 라이프사이클에 관한 거예요).

## 마무리

Phase 0a에서 했던 실수는 "편집 도구"가 에이전트 사이에서 통일된 개념이라고
가정한 거였어요. Claude는 구조화된 페이로드를 가진 등록된 도구로 노출해요. Codex는
모델이 사용하도록 지시받는 문서화된 셸 명령으로 노출해요. 둘 다 동작해요. 둘 다
파일을 편집해요. 하지만 훅 라이프사이클에서 다른 모양을 띠고, 훅은 개념적인
모양이 아니라 실제 모양에 맞춰 설계되어야 해요.

돌이켜보면 더 싼 수정은 — 계획을 쓰기 전에 5분짜리 `strings | grep` 감사였을
거예요. 도구 인벤토리 먼저, 훅 설계 둘째. 이 순서가 제가 가져갈 교훈이에요.

## 참고

- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — 스킬 별칭
  레이어의 동반 크로스-에이전트 호환성 패턴.
- `projects/3b/decisions/019-graph-tool-integration.md` § Update — 이
  근거로 Phase 0a 연기를 문서화.
- `tmp/archived-tasks/40-wrap-graph-freshness-gate/round-1-review.md` (그리고
  원래 `proactive-review.md`) — 전체 세션 컨텍스트.

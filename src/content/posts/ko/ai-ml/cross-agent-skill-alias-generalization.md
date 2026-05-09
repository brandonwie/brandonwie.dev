---
title: 크로스-에이전트 스킬 별칭 일반화
description: >-
  Claude Code, Codex, Gemini가 함께 쓰는 스킬은 한 에이전트의 MCP 도구 별칭을 하드코딩하면 깨져요. 두 단계 패턴 —
  frontmatter에 두 별칭 패밀리를 모두 선언하고, 본문 prose에는 일반 이름만 써요.
date: 2026-05-01T00:00:00.000Z
updated: '2026-05-05'
tags:
  - ai-ml
  - skills
  - mcp
  - cross-agent
  - claude
  - codex
  - gemini
  - transferable
category: ai-ml
draft: false
lang: ko
source_lang: en
source_slug: cross-agent-skill-alias-generalization
source_updated: 2026-05-05T00:00:00.000Z
translation_date: '2026-05-10'
---

3B의 `.agents/skills/` 디렉토리에 출시한 스킬이 Claude Code에서는 멀쩡히
동작하다가 Codex에서는 조용히 no-op이 됐어요. frontmatter에 도구 이름을 정확히
적었거든요. `mcp__plugin_context-mode_context-mode__ctx_batch_execute`로요.
그런데 Codex는 같은 도구를 `mcp__context_mode__ctx_batch_execute`로 등록해
뒀더라고요. 같은 MCP 서버, 다른 별칭 패밀리, 그리고 스킬 본문엔 Claude 형식이
곳곳에 하드코딩되어 있었어요.

Round 1 리뷰가 잡았어요. 수정은 이름을 바꾸는 게 아니었어요. 이름만 바꾸면 내가
안 고른 쪽으로 깨짐이 옮겨갈 뿐이거든요. 진짜 수정은 별칭이 런타임에서
해석된다는 사실을 인정하고, 스킬 본문이 어떤 형식이 켜져 있는지 신경 쓰지 않게
만드는 거였어요.

## 문제

Claude Code, Codex, Gemini CLI 세션을 함께 쓰는 스킬은 에이전트별 MCP 도구
별칭을 하드코딩하면 그 별칭을 등록하지 않은 에이전트에서 깨져요. 오늘의 예시:
context-mode 도구가 Claude의 플러그인 디스커버리에서는
`mcp__plugin_context-mode_context-mode__ctx_batch_execute`로 노출되고, Codex의
새 등록 방식에서는 `mcp__context_mode__ctx_batch_execute`로 노출돼요. 한 형식을
하드코딩한 스킬은 다른 에이전트에서 도구 호출이 조용히 실패해요.

## 컨텍스트

3B의 `.agents/skills/<skill>/SKILL.md` 파일은 세 CLI 모두에서 에이전트별 스킬
디스커버리를 통해 소비돼요(Claude의 native `Skill` 도구, Codex의 `activate_skill`
도구, Gemini의 스킬 레지스트리). 스킬 본문 안의 도구 호출은 스킬이 활성화된
에이전트에서 동작해야 해요.

별칭을 하드코딩하면 이런 일이 일어나요.

- 스킬이 한 에이전트의 플러그인 레이아웃에 묶여요
- 별칭 이름이 바뀌면(MCP 서버가 진화할 때 일어남) 조용히 깨져요
- 스킬 메인테이너가 모든 소비자 에이전트의 디스커버리 컨벤션을 추적해야 해요

깨진 케이스가 조용한 이유는 Claude / Codex / Gemini가 `allowed-tools`의 "모르는
도구"에 에러를 안 내거든요. 그냥 호출을 안 해요. 사용자 입장에선 스킬이 끝까지
돌고, 도구 호출은 일어나지 않고, 출력은 처참하게 틀린 게 아니라 미묘하게 어긋난
모양이 돼요.

## 해결책

해결은 두 단계 별칭 선언이에요. frontmatter는 스킬이 만날 수 있는 모든 별칭을
실어 나르고, prose는 일반적으로 유지하면서 특정 별칭을 절대 이름으로 부르지
않아요.

### Tier 1 — frontmatter `allowed-tools` (공식 별칭 목록)

스킬이 만날 수 있는 모든 별칭 패밀리와, 그 안의 모든 도구 이름을 선언해요.

```yaml
allowed-tools:
  Read, Grep, Glob, Bash,
  mcp__plugin_context-mode_context-mode__ctx_batch_execute,
  mcp__plugin_context-mode_context-mode__ctx_search,
  mcp__plugin_context-mode_context-mode__ctx_execute,
  mcp__plugin_context-mode_context-mode__ctx_execute_file,
  mcp__context_mode__ctx_batch_execute, mcp__context_mode__ctx_search,
  mcp__context_mode__ctx_execute, mcp__context_mode__ctx_execute_file
```

바이너리가 이 목록을 소비해요. 런타임에 등록된 별칭이 에이전트가 호출하는
별칭이에요. 두 형식 모두 목록에 = 두 에이전트 모두 동작.

### Tier 2 — 본문 prose (일반 이름만)

워크플로 본문에서는 도구를 끝부분의 일반 이름으로 부르세요.

```markdown
네 개의 핵심 소스를 병렬로 모으려면 `ctx_batch_execute`를 쓰세요.
```

이렇게는 쓰지 말고요.

```markdown
`mcp__plugin_context-mode_context-mode__ctx_batch_execute`를 쓰세요...
```

일반 prose가 가지는 이점이에요.

- 자연스럽게 읽혀요. 별칭 접두사는 구현 세부사항이거든요
- 런타임이 해석하는 어떤 별칭에서도 동작해요
- 별칭 이름 변경에서 prose churn 없이 살아남아요

### Tier 3 — 별칭 해석 노트

미래의 독자가 prose를 다시 특정 별칭에 묶지 않도록 메커니즘을 설명하는 짧은
노트를 더하세요.

```markdown
**도구 별칭 노트:** 아래 워크플로 텍스트는 일반 context-mode 이름
(`ctx_batch_execute`, `ctx_search`, `ctx_execute`, `ctx_execute_file`)을
사용해요. 바이너리가 이를 등록된 별칭 패밀리로 해석해요. Claude의
`mcp__plugin_context-mode_context-mode__*` 패밀리 또는 Codex의 새
`mcp__context_mode__*` 패밀리로요. 두 형식 모두 frontmatter `allowed-tools`
블록에 선언되어 있고, 런타임이 활성 에이전트에 따라 하나를 골라요. 이 스킬에서
prose를 특정 별칭에 묶지 마세요. 크로스-에이전트니까요.
```

그 노트 단락이 본문에서 공식 별칭이 이름으로 등장하는 유일한 곳이에요. 그 외
모든 자리에선 일반 이름이 정식 참조가 돼요.

## 부딪힌 어려움

- frontmatter 목록이 빠르게 자라요. 4 도구 × 2 패밀리 = 8 항목. 크로스-에이전트
  호환성을 위한 받아들일 만한 비용이에요. 목록은 선언적이고, 각 항목을 prose에도
  나열할 때만 짜증나요.
- 처음 반사는 "prose가 도구를 언급할 때마다 두 별칭을 다 적자"였어요. 이렇게
  하면 모든 prose 언급을 두 배로 만들고 모든 별칭 이름 변경에서 churn을 만들어요.
  일반 prose + frontmatter 목록이 더 잘 확장돼요.
- 스모크 감사 스크립트가 별칭 해석 노트(설계상 두 패밀리 접두사를 다 언급함)를
  위한 명시적 allowlist를 필요로 했어요. "본문에 plugin-prefixed 별칭 없음"이라는
  일반 검사가 노트 단락 때문에 거짓 양성을 만들어서 그 단락을 카브아웃 처리해야
  했어요.

## 핵심 포인트

- **frontmatter는 선언; prose는 설명.** frontmatter `allowed-tools`가 공식 별칭
  목록(바이너리가 소비). 본문 prose는 사람이 읽는 설명(일반 이름 사용).
- **frontmatter에 두 별칭 패밀리** — Claude의
  `mcp__plugin_<server>_<server>__<tool>`와 Codex의 `mcp__<server>__<tool>`.
  런타임이 등록된 쪽을 골라요.
- **본문엔 일반 이름** — `ctx_batch_execute`, 풀 별칭 아님.
- **스킬당 별칭 해석 노트 하나** — 두 패밀리 접두사를 언급하는 유일한 자리. 스모크
  감사가 이 단락을 allowlist에 넣어야 해요.
- **별칭은 이름 바뀌어도; prose는 안 바뀌어요** — 모든 별칭 이름 변경은
  frontmatter만 바뀌는 변경이어야 해요.
- **해석은 바이너리가 해요, 사람이 아니라** — 두 에이전트의 MCP 로더가
  `allowed-tools` 항목을 등록된 도구와 매칭해요. 두 패밀리 다 나열하면 어느
  런타임이 켜져 있든 매칭되는 항목을 골라요.

## 언제 쓰나

- `.agents/skills/`(또는 동등한 크로스-에이전트 스킬 디렉토리)에 있는 모든
  스킬 중 여러 에이전트가 소비하는 것.
- MCP 도구를 호출하는 모든 스킬(Read, Bash, Grep 같은 빌트인만 쓰는 게 아닌).
- 플러그인 마켓플레이스로 공개 출시되는 스킬. 두 에이전트 패밀리를 가정.

## 언제 쓰면 안 되나

- `.claude/` 안에서만 도는 단일 에이전트 스킬. 명료성을 위해 prose를 그
  에이전트의 별칭 패밀리로 유지.
- 빌트인 도구(Read, Bash, Grep, Glob, Edit)만 쓰는 스킬. 별칭 우려 없음.

## 마무리

내면화하는 데 가장 오래 걸린 사고 모델은 이거예요. 별칭은 도구가 아니에요.
별칭은 특정 런타임이 도구를 어떻게 부르는지에 대한 거예요. 스킬 본문이 한
별칭에 묶이면, 스킬은 한 런타임에 묶이고, "크로스-에이전트"는 거짓말이 돼요.

frontmatter가 묶임이 있는 자리예요. 어느 별칭이 등록됐는지 알아야 하는 부분이
바이너리니까요. prose는 사람용이고, 사람은 어떤 도구를 말하는지 이해하는 데
접두사가 필요 없어요. 이 두 관심사를 쪼개는 것이 모든 별칭 이름 변경에서 워크플로
텍스트를 안 건드리고 스킬이 살아남게 만드는 거예요.

## 참고

- `knowledge/general/schema-versioned-helper-json-envelope.md` — 스킬이 헬퍼를
  호출할 때, 헬퍼의 출력도 크로스-에이전트여야 해요.
- `knowledge/devops/stdlib-only-helper-portability.md` — 크로스-에이전트 호환을
  유지하려면 헬퍼가 무엇으로 만들어져야 하는지.
- `knowledge/ai-ml/ai-review-cross-agent-convergence.md` — 세 에이전트가 독립적으로
  같은 발견을 표시하면 거의 100% 신뢰도 신호예요.

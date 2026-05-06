---
title: Codex Skill Mirror 패턴
description: 'repository가 이미 `.agents/skills/`를 canonical skill source로 다루고 있을 때, clean한 Codex 통합은 "그것을 `.codex/skills/`로 교체"나 "전체 폴더를 wholesale 심볼릭링크"가 아니에요. selective adapter가 있는 mirror layer가 canonical source를 보존하면서 Codex가 필요한 걸 줘요.'
date: 2026-04-18T00:00:00.000Z
updated: '2026-05-06'
tags:
  - devops
  - codex
  - claude-code
  - skills
  - interoperability
category: devops
draft: false
lang: ko
source_lang: en
source_slug: codex-skill-mirror-pattern
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

repository가 이미 `.agents/skills/`를 canonical skill source로 다룰 때, clean한 Codex 통합은 "그것을 `.codex/skills/`로 교체"나 "전체 폴더를 wholesale 심볼릭링크"가 아니에요. 두 shortcut 모두 install 후에만 표면화되는 failure mode가 있어요. skill이 작동하는 것처럼 보이지만 조용히 misbehave해요. 안정적인 패턴은 6단계예요:

1. `.agents/skills/`를 canonical skill source로 유지.
2. repo-local `.codex/skills/` mirror 추가.
3. portable skill을 심볼릭링크로 mirror.
4. runtime assumption이 cleanly transfer 안 되는 skill에만 real Codex adapter 작성.
5. repo-local mirror를 한 번에 한 skill씩 `~/.codex/skills/`로 sync.
6. same-name real Codex adapter가 존재하면 Codex config에서 Claude-native `.agents/skills/{name}/SKILL.md`를 disable.

## 직접 심볼릭링크가 충분하지 않은 이유

Claude-native skill은 `AskUserQuestion`, `TodoWrite`, slash-skill chaining, `WebSearch`/`WebFetch` 같은 Claude-specific tool name 같은 — 같은 이름이나 의미로 Codex에 존재하지 않는 runtime feature를 종종 가정해요.

`.agents/skills/`에서 `~/.codex/skills/`로 raw 디렉토리 심볼릭링크는 skill을 discoverable하게 만들지만, **seamless하게 만들진 않아요**. 결과는 hybrid failure mode:

- portable markdown-only skill이 작동하는 것처럼 보임
- high-friction workflow skill이 discoverable하지만 operationally 오해의 소지
- in-place edit하면 Codex-specific fix가 canonical Claude skill에서 drift

## mirror-with-adapter 레이아웃

target runtime이 own하는 **mirror-with-adapter** layer 도입:

```text
.agents/skills/                  # canonical Claude source
  ├── check-symlinks/
  ├── task-starter/
  └── wrap/

.codex/skills/                   # repo-local Codex mirror
  ├── check-symlinks -> ../../.agents/skills/check-symlinks
  ├── task-starter/              # real Codex adapter
  └── wrap/                      # real Codex adapter

~/.codex/skills/                 # global Codex runtime home
  ├── check-symlinks -> 3b/.codex/skills/check-symlinks
  ├── task-starter -> 3b/.codex/skills/task-starter
  └── wrap -> 3b/.codex/skills/wrap
```

### Adapter write 경계

Mirror된 Codex skill 경로가 여전히 `.agents/skills/`로의 심볼릭링크일 때, Codex 경로의 `SKILL.md`를 edit하면 Claude source도 edit해요. 즉 "portable mirror"에서 "real Codex adapter"로의 transition은 명시적인 첫 단계가 있어요:

1. `.codex/skills/{name}`의 mirror된 심볼릭링크 제거 또는 교체
2. 그 경로에 real 디렉토리 생성
3. Codex-owned `SKILL.md`를 거기 작성

git에서 이 마이그레이션은 **old 심볼릭링크 삭제 + 같은 경로 아래 real 파일 추가**로 나타나요. 그게 변경의 정확한 모양이지, mirror가 broken이라는 sign이 아니에요.

### real adapter를 언제 작성할지

원래 skill이 runtime-specific behavior에 의존할 때만 real adapter 생성. 3B rollout의 예시:

- `task-starter`는 `AskUserQuestion`, `EnterPlanMode` / `ExitPlanMode`, inline slash-skill invocation에 Codex-side translation 필요했음.
- `wrap`은 `TodoWrite`, `AskUserQuestion`, nested slash-skill chaining에 translation 필요했음.
- 더 단순한 instruction-driven skill은 직접 심볼릭링크 유지.

### Adapter sync 규율

skill이 real Codex adapter가 되면, intentionally compact 유지:

1. upstream Claude `metadata.version`에 sync.
2. execution semantics를 변경하는 Codex runtime translation만 보존.
3. contract parity 유지에 필요한 decision-critical upstream delta만 port.
4. target runtime이 진짜로 full fork가 필요하지 않으면 full Claude skill body 복사 회피.

### portable plugin으로 escalation

workflow가 reusable domain logic(state model, scorer, prompt asset, provider protocol)을 포함하면, adapter-only mirror가 너무 thin해져요. 추출된 system을 다음으로 promote:

1. runtime-agnostic core package
2. thin runtime/plugin wrapper
3. 추출된 package를 directly import하는 test

이건 cross-agent logic을 reusable 유지하면서 runtime-specific boot step, update flow, downstream pipeline coupling을 wrapper layer 안에 가둬요.

## 이 layering이 작동하는 이유

### Canonical source가 single 유지

Claude-first workflow logic이 `.agents/skills/`에 anchored 유지 — 기존 3B 생태계와 connected repo가 변경할 필요 없음.

### Target runtime이 own compatibility layer를 own

Codex-specific 적응이 `.codex/skills/` 아래 살고, 거기서 tool-specific conditional로 Claude source를 오염시키지 않으면서 진화 가능.

### Discovery와 execution이 깔끔하게 분리

repo-local mirror가 **Codex가 discover할 수 있는 것**을 해결. adapter가 **Codex가 cleanly execute할 수 있는 것**을 해결. 이걸 별개 문제로 다루면 over-duplication과 false seamlessness 둘 다 회피.

Codex는 repo에서 `.agents/skills/`도 directly discover 가능. portable pass-through skill에 유용하지만, `.codex/skills/`에 same-name real adapter가 존재할 때 혼란스러움. 그 경우 `~/.codex/config.toml`의 `[[skills.config]]`로 Claude-native source `SKILL.md`만 disable; `.codex/skills/` adapter는 enabled 유지.

### Global install이 reversible 유지

repo-local skill을 한 번에 하나씩 `~/.codex/skills/`로 link하는 sync script는 global Codex home을 additive 유지. built-in/system skill clobber 회피 + repository-owned tree로 entire global skills 디렉토리 교체 회피.

## 이게 맞는 상황

패턴이 맞는 경우:

- repository가 이미 다른 agent format에 mature한 skill system을 가지고 있을 때.
- source skill tree가 canonical이고 canonical 유지되어야 할 때.
- 일부 skill은 tool-agnostic이지만 몇 high-value workflow는 아닐 때.
- 전체 skill library를 up front rewrite 안 하고 Codex discovery가 native하게 느끼고 싶을 때.

target runtime이 즉시 새 source of truth가 되어야 할 때, 모든 skill이 deeply runtime-specific일 때(mirror가 대부분 wrapper가 됨), 또는 hub repository뿐 아니라 connected external repo 전체에 cross-agent parity가 필요할 때는 안 맞아요.

## 실용적인 takeaway

Discovery compatibility와 execution compatibility는 다른 문제예요. Portable skill을 심볼릭링크로 mirror; runtime mismatch가 진짜인 것에만 adapt. mirror된 skill을 edit하기 **전에** real adapter로 promote, 그렇지 않으면 write가 Claude의 canonical source에 land. adapter는 compact 유지하고 upstream `metadata.version` + decision-critical delta로 sync; full clone 아님. adapter translation이 더 이상 충분하지 않을 때, reusable logic을 portable core package로 split하고 runtime/plugin layer를 thin 유지.

## References

- [OpenAI Codex CLI — official repository](https://github.com/openai/codex)
- [OpenAI Codex Skills](https://developers.openai.com/codex/skills)

---
title: LLM-robust한 skill 전제조건은 산문보다 체크리스트가 나아요
description: >-
  산문 형태로 쓴 복합 전제조건은 컨텍스트 부담이 커지면 조용히 어긋나요. 절 하나당 체크박스 하나로 명시적인 체크리스트로 바꾸면 전제조건이
  LLM 앞에서도 견고해지고, 실제 버그였던 숨은 절들도 드러나요.
date: 2026-04-25T00:00:00.000Z
updated: "2026-08-02"
tags:
  - general
  - skill-authoring
  - claude-code
  - llm-prompts
  - instructions
  - robustness
category: general
draft: false
lang: ko
source_lang: en
source_slug: skill-instruction-checklist-pattern
source_updated: "2026-08-02"
translation_date: '2026-05-10'
---

`/wrap`을 돌리고 나서 6개 블로그 엔트리가 `published_at`은 null인데 `needs_resync`만 true로 떠 있었어요. 이상해서 들여다봤어요. 원인은 코드가 아니라 skill instruction 안에 숨어 있었어요.

[Claude Code skill](https://code.claude.com/docs/en/skills)은 skill을 쓸 때마다 모델이 읽어내는 `SKILL.md` instruction 파일이에요. 결국 매번 LLM이 다시 해석하는 markdown 문서죠. 산문 형태(`If A AND B → do X`)로 쓴 복합 전제조건은 컨텍스트 부담이 커지면 조용히 어긋나요. 컴파일러도 없고, type checker도 없고, 잘못 읽힌 걸 잡아낼 test도 없어요.

증상이 드러난 자리는 한 `/wrap` skill instruction이었어요. 이렇게 쓰여 있었거든요.

> If `blog.published_at` is NOT null AND Level 2 changes were made → set `blog.needs_resync: true`

여러 세션에 걸쳐, 6개 엔트리가 `published_at: null`인데도 `needs_resync: true`로 끝났어요. 텍스트만 보면 전제조건은 명확했고 LLM도 그걸 "알고" 있었지만, 두 절을 하나로 묶어 놓은 형태라서 두 번째 절이 두드러질 때 첫 번째 절을 건너뛰는 일이 생겼어요. 이렇게 어긋남이 쌓였어요.

Claude만의 문제는 아니에요. 묵시적 AND가 들어간 긴 지시문은 사람도 잘못 적용해요. 외과 수술과 항공 분야에 체크리스트가 있는 이유가 정확히 이거예요 — 부하가 걸리면 복합 전제조건은 조용히 떨어져 나가거든요. WHO는 [Surgical Safety Checklist](https://www.who.int/teams/integrated-health-services/patient-safety/research/safe-surgery)가 합병증과 사망률을 30퍼센트 넘게 줄였다고 밝히고 있어요. 체크리스트를 끝까지 돌리는 데 걸리는 시간은 2분이 안 되고요.

Anthropic의 prompting 가이드도 같은 방향을 가리켜요. [명확하고 명시적인 지시](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)를 권하면서, "순서나 완결성이 중요할 때는 numbered list나 bullet point로 순차적인 단계를 제시하라"고 해요. 산문으로 묶인 복합 전제조건이 감추는 게 바로 그 완결성이에요.

## 복합 전제조건을 체크박스로 재구성하기

해결책은 산문으로 묶인 복합 조건을 절 하나당 박스 하나로 **명시적 체크박스 체크리스트**로 바꾸고, 박스 하나라도 비어 있으면 어떻게 동작하는지 한 줄로 못 박는 거예요.

Before (prose):

```text
**Level 3 — Blog resync flag (conditional):**
- If `blog.published_at` is NOT null AND Level 2 changes were made
  → set `blog.needs_resync: true`
```

After (checklist):

```text
**Level 3 — Blog resync flag (conditional):**

Before setting `blog.needs_resync: true`, verify ALL of these:

- [ ] `blog.publishable` is `true`
- [ ] `blog.ready` is `true`
- [ ] `blog.published_at` is NOT null
- [ ] Level 2 (content) changes were made in this session

If ANY box is unchecked, do NOT set the flag — the entry is in a state
where re-sync is meaningless or impossible.
```

체크리스트는 LLM이 각 전제조건을 따로따로 평가하도록 강제해요. "If ANY box is unchecked" 줄이 묵시적 AND를 명시적인 fail-fast로 바꿔주고요. 다시 쓰는 과정에서 새로 드러난 전제조건도 있었어요 — 원래 산문에는 `blog.ready: true`가 빠져 있었거든요. setter가 "당연히" 엔트리가 publishable일 때만 동작한다고 묵시적으로 가정한 거예요. 그런데 그 가정이 조용히 깨져 있었어요.

## 버그가 instruction layer에 살았던 이유

찾기 어렵게 만든 게 세 가지였어요.

- **never-published 엔트리에 `needs_resync: true`를 쓴 코드 경로를 검색해도 아무것도 안 나왔어요.** 코드는 없었어요. 잘못 읽힌 instruction만 있었어요. 그래서 fix는 instruction layer에 들어가야 했어요.
- **숨어 있던 절이 진짜 버그였어요.** 원래 산문이 `blog.ready: true`를 묵시적으로 접어 넣고 있었어요. 다시 쓰면서 그 가정이 명시적으로 끄집어졌고, 처음부터 빠져 있었다는 게 드러났어요.
- **수동 청소로는 재발을 못 막았어요.** 이전 /wrap 세션에서 stale flag 3개를 손으로 지웠어요. 그런데 5일 안에 새 flag 6개가 똑같은 패턴으로 돌아왔어요. 증상만 고치니 버그가 데이터가 아니라 setter에 있다는 게 확인된 거예요.

## 이게 맞는 상황

다음과 같을 때 체크리스트를 써요.

- skill instruction에 복합 조건부 전제조건이 있을 때.
- setter가 잘못 동작했을 때 비용이 큰 상태를 바꿀 때.
- 그 instruction이 실제로 silent misapplication을 일으킨 적이 있을 때.

전제조건이 단일 절(boolean check 하나)일 땐 체크리스트를 건너뛰세요. 산문이면 충분하고, 항목 하나짜리 체크리스트는 의식처럼 보여요. 안내가 스타일에 가까울 때(예: "write in second person", "use Mermaid not ASCII")도 예시가 들어간 산문이 더 잘 읽혀요. 잘못 적용해도 회복이 쉽고 비용이 작을 때(예: 다음 /wrap에 다시 돌릴 draft formatter)도 마찬가지예요.

## 실용적인 takeaway

skill markdown 안에 산문으로 쓴 복합 전제조건은 컨텍스트 부담이 커지면 조용히 어긋나요. 체크박스 체크리스트는 각 절을 따로 평가하도록 강제하기 때문에 LLM 앞에서 견고해요. 체크박스 하나에 전제조건 하나 — 박스 안에 `AND`를 절대 넣지 마세요. "If ANY box is unchecked" 한 줄을 명시적으로 추가하세요. 묵시적인 short-circuit이 깨지는 지점이 거기예요. 잘못 적용했을 때 비용이 큰 상황이라면 체크리스트를 데이터 계층 검증(validator, reconciliation pass, schema constraint)과 짝지어 방어선을 두 겹으로 두세요. 그리고 다시 쓰는 작업을 숨은 절을 끄집어내는 기회로 삼으세요 — 보통 그 숨은 절이 진짜 버그거든요.

## References

- [Claude Code — Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Anthropic — Prompting best practices (Be clear and direct)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices#be-clear-and-direct)
- [WHO — Safe Surgery Saves Lives and the Surgical Safety Checklist](https://www.who.int/teams/integrated-health-services/patient-safety/research/safe-surgery)

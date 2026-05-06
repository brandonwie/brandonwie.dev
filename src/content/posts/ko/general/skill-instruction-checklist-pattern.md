---
title: LLM-robust한 skill precondition은 prose보다 checklist가 나아요
description: 'prose 형태로 쓴 compound precondition은 context 압박 아래서 조용히 misapply돼요. clause 하나당 checkbox 하나로 explicit checkbox checklist로 바꾸면 precondition이 LLM-robust해지고, 실제 버그였던 implicit clause들도 드러나요.'
date: 2026-04-25T00:00:00.000Z
updated: '2026-05-06'
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
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

Claude Code용으로 작성하는 skill은 매 invocation마다 LLM이 해석하는 markdown text예요. prose 형태(`If A AND B → do X`)로 쓴 compound precondition은 context 압박 아래서 조용히 misapply돼요. compiler도 없고, type checker도 없고, misread를 잡을 수 있는 test도 없어요.

이걸 드러낸 증상: 한 `/wrap` skill instruction이 이렇게 쓰여 있었어요

> If `blog.published_at` is NOT null AND Level 2 changes were made → set `blog.needs_resync: true`

여러 session에 걸쳐, 6개 entry가 `published_at: null`인데도 `needs_resync: true`로 끝났어요. precondition은 텍스트에서 명확했고 LLM이 그걸 "알고" 있었지만, compound 형태라서 두 번째 clause가 두드러질 때 첫 번째 clause를 건너뛰게 만들었어요. drift가 쌓였죠.

이건 Claude 특유의 failure mode가 아니에요. implicit conjunction이 들어간 긴 instruction은 사람도 misapply해요. 외과 수술과 항공 분야에 checklist가 존재하는 이유가 정확히 이거예요 — compound precondition이 부하 아래서 조용히 떨어져 나가거든요.

## compound precondition을 checkbox로 재구성하기

해결책은 compound prose를 clause 하나당 box 하나로 **explicit checkbox checklist**로 변환하고, 어떤 box든 unchecked일 때 무슨 일이 일어나는지 명시하는 한 줄을 추가하는 거예요.

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

checklist는 LLM이 각 precondition을 독립적으로 평가하도록 강제해요. "If ANY box is unchecked" 규칙이 implicit-AND를 explicit-fail-fast로 변환하고요. 새로운 precondition이 재작성 중에 표면화됐어요 — `blog.ready: true`가 원래 prose 형태에 빠져 있었던 거예요. setter가 "당연히" entry가 publishable일 때만 fire한다고 implicit하게 가정했었거든요. 그 implicit assumption이 조용히 깨져 있었던 거죠.

## 버그가 instruction layer에 살았던 이유

이걸 찾기 어려웠던 세 가지:

- **never-published entry에 `needs_resync: true`를 쓴 코드 경로를 검색해도 아무것도 안 나왔어요.** 코드는 없었어요. misread된 instruction만 있었죠. fix는 instruction layer에 있어야 했어요.
- **implicit clause가 버그였어요.** 원래 prose 형태가 `blog.ready: true`를 implicit하게 접어 넣고 있었어요. 재작성이 implicit assumption을 명시적으로 끄집어냈고, 그게 처음부터 빠져 있었다는 게 드러났어요.
- **수동 청소가 재발을 막지 못했어요.** 이전 /wrap session이 stale flag 3개를 수동으로 클리어했어요. 5일 안에 6개의 새 flag로 패턴이 돌아왔어요. 증상-만-수리하는 건 버그가 데이터가 아니라 setter에 있다는 걸 확인시켜줘요.

## 이게 맞는 상황

다음 경우에 checklist를 써요:

- skill instruction에 compound conditional precondition이 있을 때.
- setter가 error 비용이 큰 state를 mutate할 때.
- instruction이 실제로 silent misapplication을 만들어낸 적이 있을 때.

precondition이 single-clause(boolean check 하나)일 땐 checklist를 건너뛰세요 — prose면 충분하고, 1-item checklist는 의식 같아 보여요. 안내가 stylistic("write in second person", "use Mermaid not ASCII")일 땐 예시가 들어간 prose가 더 잘 읽히고요. misapplication 비용이 회복 가능하고 저렴할 때(예: 다음 /wrap에 다시 실행되는 draft formatter)도 마찬가지예요.

## 실용적인 takeaway

skill markdown의 compound prose precondition은 context 압박 아래서 조용히 misapply돼요. checkbox checklist는 각 clause를 독립적으로 평가하도록 강제하기 때문에 LLM-robust해요. checkbox 하나당 precondition 하나 — 단일 checkbox 안에 `AND`를 절대 넣지 마세요. "If ANY box is unchecked" 한 줄을 explicit하게 추가하세요. implicit short-circuiting이 실패하는 부분이거든요. misapplication 비용이 비쌀 때는 checklist를 data-layer check(validator, reconciliation pass, schema constraint)와 defense-in-depth로 짝지으세요. 그리고 재작성을 implicit clause를 표면화하는 기회로 쓰세요 — 보통 그게 진짜 버그예요.

## References

- [Claude Code — Slash Commands](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/slash-commands)
- [Anthropic — Prompting Best Practices for Long Instructions](https://www.anthropic.com/research/checklist-prompts)

---
title: 'state-invariant flag drift — reconciliation pass로 복구하기'
description: 'boolean lifecycle flag가 클리어 코드 경로에 절대 도달하지 못하는 entry들에 계속 끼는 현상이 있었어요. 증상만 고치는 fix는 계속 재발했고, 진짜 해결은 setter나 clearer 어느 쪽이 어떻게 set했든 상관없이 flag가 함의하는 invariant를 강제하는 세 번째 workflow를 추가하는 거였어요.'
date: 2026-04-25T00:00:00.000Z
updated: '2026-05-06'
tags:
  - devops
  - sync
  - data-lifecycle
  - state-invariant
  - drift-recovery
  - defense-in-depth
category: devops
draft: false
lang: ko
source_lang: en
source_slug: state-invariant-flag-drift-recovery
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

boolean lifecycle flag (`needs_resync: true`)가 그 flag를 클리어하는 코드 경로에 절대 도달할 수 없는 entry들에 계속 끼고 있었어요. flag는 한 workflow(`/wrap`)가 set하고 다른 workflow(`sync-from-3b.ts`)가 클리어하는데, clearer 쪽에는 setter가 체크하지 않는 precondition(`ready: true`)이 걸려 있었거든요. `ready: false`인 entry들에 flag가 영원히 쌓였어요.

처음 점검했을 때 6개 entry에서 증상이 나타났어요. `git checkout`으로 frontmatter를 수동으로 되돌리니 카운트가 0이 됐죠. 5일 후에 카운트가 12개가 됐어요 — 같은 setter가 더 넓은 범위의 entry에 다시 작동한 거예요. 수동 청소는 증상 처리일 뿐이고, durable fix는 setter와 clearer가 독립적으로 깨뜨릴 수 없는 곳에 살아야 했어요.

## 한쪽만 고치는 fix가 안 먹힌 이유

서로 다른 코드 경로에 있는 두 개의 setter가 같은 stuck state를 만들고 있었어요. 한쪽 경로의 setter만 조여도 다른 경로는 그대로라서 drift가 계속됐죠. clearer의 게이트(`ready: true`)는 sync에 정말 필요한 precondition이라 옳았는데, setter의 contract가 "clearer가 그렇지 않으면 작동을 거부할 거다"라는 사실을 반영하지 않았던 거예요.

이 버그는 구조적이에요. setter와 clearer가 다른 일정으로 진화했고, 둘 사이의 implicit contract("내가 이 flag를 set하면 clearer가 결국 클리어할 것이다")가 clearer가 더 엄격한 게이트를 추가했을 때 조용히 깨졌어요. 어느 한쪽만 패치하는 건 multi-source 버그에 single-source 수리를 하는 격이에요.

## reconciliation pass

durable fix는 flag가 어떻게 set됐든 상관없이 flag가 함의하는 **state invariant**를 강제하는 세 번째 workflow를 두는 거예요. 이건 workflow layer가 아니라 data layer의 defense-in-depth예요.

`needs_resync: true`에 대한 invariant는 이거예요:

> "Re-sync"는 이전 sync가 있었을 때만 의미가 있어요. 따라서 flag는 `published_at`이 non-null임을 함의해요. `published_at`이 null이면 flag는 논리적으로 불가능하고, setter를 참고하지 않고 클리어할 수 있어요.

두 번째 invariant는 "이미 최신 상태" 케이스를 다뤄요:

> 로컬 synced post의 `source_content_hash`가 source의 현재 cleaned-body hash와 일치하면, source는 drift하지 않은 거예요. Re-sync는 no-op이 될 거고요. flag는 클리어할 수 있어요.

두 invariant 모두 source tree를 walk하면서 적용하고 write back하는 `--reconcile` mode에 인코딩돼 있어요. Idempotent하고요. 다시 실행해도 안전해요.

이 pass는 opt-in이에요. 일반 sync 중에 실행되지 않아요 — operator가 시작하는 maintenance지 hot path가 아니거든요. 일반 sync 중에 실행하면 "이거 클리어해도 안전해?"(구조적 질문)와 "지금 sync해야 해?"(편집적 질문)가 섞여요. 둘은 failure mode가 달라요.

## 구현 중에 깨진 것들

첫 번째 draft에서 걸린 세 가지:

- **YAML round-trip serialization이 unquoted string을 손상시켰어요.** 첫 draft는 `stringifyYaml(frontmatter)`로 write back을 했어요. `#`를 포함한 unquoted string(예: `context: PR #103 Round 1...`)이 `#`에서 잘렸어요. YAML이 그걸 comment marker로 취급하거든요. 이 교훈은 `general/yaml-serializer-unquoted-hash-corruption.md`에 따로 정리해뒀어요.
- **frontmatter substring에 surgical regex가 YAML round-trip을 이겼어요.** round-trip을 키 하나만 flip하는 scoped regex로 바꾸니 diff 사이즈가 348줄에서 12줄(파일당 1줄)로 줄었고, body content는 unquoted special character가 있든 없든 byte-identical했어요. 일반 원칙: 필드셋이 고정되고 작으면, point edit이 round-trip의 blast radius를 완전히 피할 수 있어요.
- **`replace_all: true`가 두 개의 거의 동일한 write block 중 하나만 매칭됐어요.** 두 block이 다른 nesting depth — 3 tabs vs 4 tabs —에 있어서 indent-sensitive matching이 한 곳만 잡고 다른 한 곳을 조용히 놓쳤어요. 방어법은 기계적이에요: `replace_all` 후에 항상 grep으로 expected match count를 검증해요.

## 이 접근이 도움 되는 상황

이 패턴이 맞는 경우:

- sync system에 두 state 사이를 toggle하는 metadata field가 있고, toggling logic이 여러 workflow에 분산돼 있을 때.
- clearer의 precondition이 setter보다 엄격해서, 정상 흐름으로는 청소될 수 없는 state가 남을 때.
- 수동 청소가 계속 재발할 때. 재발은 버그가 operator-level이 아니라 system-level이라는 가장 강한 signal이에요.

drift가 single-source라서 setter만 조여서 고칠 수 있다면 — reconcile pass를 추가하는 건 한 곳에 버그가 있는 경우엔 overkill이에요. 또 metadata field가 stuck state에 의미적으로 의존하는 외부 consumer가 있을 때도 안 맞아요. invariant가 정말 invariant인지 인코딩하기 전에 검증하세요.

## 실용적인 takeaway

stuck-state flag는 setter와 clearer가 분기했다는 뜻이에요. 가장 빠른 durable fix는 setter나 clearer 어느 쪽이든 단독으로 패치하는 게 아니라, flag가 함의하는 invariant를 강제하는 세 번째 workflow예요. invariant를 코드에 명시적으로 인코딩해서 미래 workflow 변경이 조용히 깨뜨릴 수 없게 하세요. cleanup workflow는 opt-in으로 표시하세요. data-layer fix를 setter의 instruction-layer fix(prose precondition이 아니라 checklist)와 짝지어서 새로운 drift를 막으세요. reconcile pass는 safety net이고, setter checklist가 1차 방어선이에요.

## References

- [Patterns of Enterprise Application Architecture — state lifecycle discipline](https://martinfowler.com/eaaCatalog/identityField.html)

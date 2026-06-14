---
title: state-invariant flag drift — reconciliation pass로 복구하기
description: >-
  boolean lifecycle flag가 클리어 코드 경로에 절대 도달하지 못하는 entry들에 계속
  끼는 현상이 있었어요. 증상만 고치는 fix는 계속 재발했고, 진짜 해결은 setter나
  clearer 어느 쪽이 어떻게 set했든 상관없이 flag가 함의하는 invariant를 강제하는
  세 번째 workflow를 추가하는 거였어요.
date: 2026-04-25T00:00:00.000Z
updated: '2026-06-07'
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
source_updated: '2026-06-07'
translation_date: '2026-06-14'
---

6개 entry가 `needs_resync: true`로 떠 있는데, 정작 그 flag를 클리어하는 코드 경로에는 절대 도달할 수 없는 상태였어요. 이상해서 들여다봤어요. flag는 한 workflow(`/wrap`)가 set하고 다른 workflow(`sync-from-3b.ts`)가 클리어하는 구조였는데, clearer 쪽에는 setter가 확인하지 않는 precondition(`ready: true`)이 걸려 있었거든요. 그래서 `ready: false`인 entry에는 flag가 영원히 쌓였어요.

처음 점검에서 6개가 잡혔고, `git checkout`으로 frontmatter를 되돌리니 카운트가 0이 됐어요. 그런데 5일 뒤에 다시 보니 12개로 늘어 있었어요. 같은 setter가 이번엔 더 넓은 범위의 entry를 훑고 지나간 거죠. 손으로 치우는 건 증상만 건드리는 일이라, durable fix는 setter와 clearer가 따로 떼어놓고는 깨뜨릴 수 없는 자리에 있어야 했어요.

## 한쪽만 고치면 왜 다시 새는가

서로 다른 코드 경로에 있는 setter 두 개가 똑같은 stuck state를 만들고 있었어요. 한쪽 경로의 setter만 조여도 다른 경로는 그대로라, drift가 절반쯤 계속 흘렀죠. clearer의 게이트(`ready: true`)는 sync에 꼭 필요한 precondition이라 옳았어요. 문제는 setter의 contract가 "그게 아니면 clearer가 작동을 거부한다"는 사실을 담고 있지 않았다는 거예요.

이 버그는 구조에서 나와요. setter와 clearer가 서로 다른 일정으로 자라났고, 둘 사이의 암묵적 약속("내가 이 flag를 set하면 clearer가 언젠가 클리어한다")이 clearer가 더 엄격한 게이트를 붙이는 순간 소리 없이 깨졌어요. 어느 한쪽만 패치하는 건, 여러 곳에서 비롯된 버그를 한 곳에서만 손보는 셈이에요.

## reconciliation pass

오래 버티는 fix는, flag가 어떻게 set됐든 상관없이 flag가 함의하는 **state invariant**를 강제하는 세 번째 workflow예요. workflow 층이 아니라 data 층에 둔 defense-in-depth죠.

`needs_resync: true`가 함의하는 invariant는 이거예요:

> "Re-sync"는 앞선 sync가 있었을 때만 말이 돼요. 그러니 이 flag는 `published_at`이 비어 있지 않다는 뜻을 품어요. `published_at`이 null이면 flag 자체가 논리적으로 불가능하니까, setter를 물어볼 것도 없이 클리어해도 돼요.

두 번째 invariant는 "이미 최신" 상황을 다뤄요:

> 로컬에 동기화된 post의 `source_content_hash`가 source의 지금 본문 hash와 같으면, source는 어긋나지 않은 거예요. 다시 sync해도 아무 일도 안 일어나요. 그러니 flag를 클리어해도 돼요.

두 invariant 모두 `--reconcile` mode 안에 넣어 뒀어요. source tree를 따라 내려가면서 두 조건을 적용하고 다시 파일에 써요. idempotent라서 몇 번을 다시 돌려도 안전하고요.

이 pass는 opt-in이에요. 평소 sync 중에는 돌지 않아요. operator가 직접 시작하는 정비 작업이지 hot path가 아니거든요. 평소 sync에 끼워 넣으면 "이걸 클리어해도 안전한가"(구조의 문제)와 "지금 sync해야 하나"(편집의 문제)가 한데 섞여요. 둘은 어긋나는 방식부터 달라요.

## 만들면서 깨진 것들

첫 draft에서 걸린 세 가지, 그리고 몇 주 뒤 정기 점검에서 드러난 네 번째예요.

- **YAML round-trip serialization이 따옴표 없는 문자열을 망가뜨렸어요.** 첫 draft는 `stringifyYaml(frontmatter)`로 다시 써 내려갔어요. 그랬더니 `#`이 든 따옴표 없는 문자열(예: `context: PR #103 Round 1...`)이 `#`에서 뚝 잘렸어요. YAML이 그 자리를 주석 표시로 읽거든요. 이 교훈은 `general/yaml-serializer-unquoted-hash-corruption.md`에 따로 적어 뒀어요.
- **frontmatter 일부에만 surgical regex를 쓰니 YAML round-trip을 이겼어요.** round-trip을 키 하나만 뒤집는 scoped regex로 바꿨더니 diff가 348줄에서 12줄(파일당 1줄)로 줄었고, 본문은 따옴표 없는 특수문자가 있든 없든 byte 단위로 똑같이 남았어요. 일반 원칙은 이래요. 손댈 필드가 적고 정해져 있으면, 콕 집어 고치는 편이 round-trip이 일으키는 파장을 통째로 피해요.
- **`replace_all: true`가 거의 똑같은 write block 둘 중 하나만 잡았어요.** 두 block이 들여쓰기 깊이가 달랐어요(3 tab vs 4 tab). 들여쓰기에 민감한 매칭이 한 곳만 잡고 다른 한 곳은 조용히 놓친 거죠. 방어는 기계적이에요. `replace_all` 뒤에는 늘 grep으로 잡힌 개수가 맞는지 확인해요.
- **flag를 grep으로 세니 drift가 부풀려졌어요.** knowledge base 전체에 `grep -rl "needs_resync: true"`를 돌리니 파일 5개가 잡혔는데, 그중 4개는 그 flag를 _설명하는_ entry(이 글도 그래요)였어요. 문자열이 frontmatter 필드가 아니라 본문 문장에 걸린 거죠. 진짜로 끼어 있던 건 하나뿐이었어요. 자기 metadata를 스스로 문서로 남기는 knowledge base에서는, 단순 문자열 grep이 살아 있는 필드와 그 필드를 가리키는 문장을 가려내지 못해요. 세기 전에 스캔 범위를 frontmatter block으로 좁히는 것(예: `awk '/^---$/{c++; next} c==1'`)이 해법이에요.

## 이 방법이 잘 맞는 상황

이 패턴이 맞는 경우예요.

- sync system에 두 state 사이를 오가는 metadata 필드가 있고, 그 토글 로직이 여러 workflow에 흩어져 있을 때.
- clearer의 precondition이 setter보다 엄격해서, 정상 흐름으로는 못 치우고 남는 state가 생길 때.
- 손으로 치워도 같은 증상이 자꾸 돌아올 때. 재발은 버그가 operator 수준이 아니라 시스템 수준이라는 가장 강한 신호예요.

drift가 한 곳에서만 비롯돼 setter만 조이면 풀리는 경우엔, reconcile pass를 더하는 게 과해요. 버그가 한 군데 있는데 굳이 그럴 것 없죠. metadata 필드의 stuck state에 의미상 기대고 있는 외부 consumer가 있을 때도 안 맞아요. invariant가 정말 변하지 않는 값인지부터 확인하고 나서 코드에 새기세요.

## 실용적인 takeaway

stuck state flag가 보이면 setter와 clearer가 따로 놀고 있다는 뜻이에요. 가장 빨리 굳는 fix는 setter나 clearer 한쪽만 패치하는 게 아니라, flag가 함의하는 invariant를 강제하는 세 번째 workflow를 두는 거예요. invariant를 코드에 또렷이 새겨 두면, 나중에 workflow를 손봐도 소리 없이 깨질 일이 없어요. cleanup workflow는 opt-in으로 표시하고요. data 층의 fix는 setter 쪽 instruction 층 fix(산문 형태 precondition 말고 checklist)와 짝지어서 새 drift를 막아요. reconcile pass가 안전망이라면, setter checklist는 맨 앞 방어선이에요.

## References

- [Patterns of Enterprise Application Architecture — state lifecycle discipline](https://martinfowler.com/eaaCatalog/identityField.html)

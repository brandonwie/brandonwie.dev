---
title: 'Session-State Dashboard: overwrite 말고 merge하기'
description: >-
  세션을 가로지르는 dashboard를 다시 만드는 두 가지 방법 — overwrite, 그리고
  merge-with-carry-forward — 는 정반대 방향으로 실패해요. 제가 정착한 규칙, 그리고 결국
  dashboard를 git에서 아예 추적하지 않게 된 이유를 정리했어요.
date: 2026-04-25T00:00:00.000Z
updated: '2026-06-07'
tags:
  - general
  - session-state
  - dashboard-design
  - claude-code
category: general
draft: false
lang: ko
source_lang: en
source_slug: session-state-merge-vs-overwrite-pattern
source_updated: '2026-06-07'
translation_date: '2026-06-07'
---

세션을 가로질러 작업을 요약해 주는 dashboard가 하나 있어요 — 뭐가 진행 중이고, 뭐가 아직 열려 있고, 최근에 뭐가 끝났는지요. 세션이 끝날 때마다 스크립트가 이 파일을 다시 생성해요. 그 스크립트를 처음 짤 때 저는 뻔한 방법을 골랐어요: 현재 source를 읽고, 파일을 렌더링하고, overwrite. 끝.

그게 잘 돌아가다가, 어느 세션에서 제가 아직 신경 쓰던 내용을 조용히 지워버렸어요. 알고 보니 이 regeneration 전략이 기능 전체에서 가장 핵심적인(load-bearing) 결정이었고, "그냥 overwrite해"는 dashboard가 실제로 담고 있던 데이터 종류에는 잘못된 기본값이었어요.

## 정반대 방향으로 실패하는 두 전략

이런 derived file을 다시 만드는 방법은 사실 두 가지뿐이고, 둘은 거울처럼 반대로 실패해요.

**Full-overwrite**는 단순한 쪽이에요. 현재 source가 말하는 대로 새 state를 만들고 파일을 교체해요. 함정은 silent state loss예요: 지난 세션엔 true였는데 이번 세션 source엔 없는 게 있으면, 흔적도 없이 사라져요. "아직 열려 있는 것"이 통째로 일인 dashboard에서는 이게 최악의 실패예요 — 열린 항목들이야말로 한 세션의 source에서 매번 깔끔하게 다시 도출되지는 않는 것들이거든요.

**Merge-with-carry-forward**는 다른 쪽이에요. 이전 state를 읽고, 새 데이터를 접어 넣고, 아직 유효한 걸 유지해요. 세션을 가로질러 미해결 state를 보존하지만, dedup과 resolution 단계라는 비용이 들어요. 그 단계를 건너뛰면 dashboard가 오래전에 해결된 stale entry로 서서히 차요. 그러니까 한 전략은 진짜 데이터를 잃고, 다른 전략은 죽은 데이터를 쌓아요. 특정 surface에 잘못된 쪽을 고르는 게 silent-loss 아니면 stale-clutter 증상을 만드는 거예요.

## 제가 정착한 규칙

overwrite한테 한 번 물리고 나서도, 저는 "전부 merge"로 확 넘어가고 싶지는 않았어요 — merge는 더 비싸고 자체 failure mode가 있거든요. 실제로 버틴 규칙은 surface마다, 목적에 따라 정하는 거였어요:

- **기본은 merge** — surface가 _"모든 세션을 가로질러 아직 열려 있는 게 뭐야?"_ 에 답할 때요. priorities 목록, follow-up 트래커, 진행 중 task 뷰 같은 거요. silent loss가 아픈 surface들이에요.
- **기본은 overwrite** — surface가 _"지금 이 순간 source의 state가 뭐야?"_ 에 답할 때요. build status, 마지막 deploy hash, goal-tracker의 현재 진행도 같은 거요. 이런 건 파일시스템의 진실을 반영해야 하고, stale한 row를 들고 가면 오히려 오해를 줘요.

새 surface가 어느 쪽인지 헷갈릴 땐, 네 가지 질문을 통과시켜요:

| 질문                                         | Merge | Overwrite |
| -------------------------------------------- | :---: | :-------: |
| 항목이 조용히 사라지면 사용자가 답답해할까요? |   ✓   |           |
| dashboard가 파일시스템의 진실을 반영해야 하나요? |       |     ✓     |
| "아직 열려 있음"이 세션을 가로질러 의미가 있나요? |   ✓   |           |
| source가 유일한 authority인가요?             |       |     ✓     |

"Merge" 칸에 두 개 이상 들어오면 merge해요. 구현 비용은 작아요 — 이전 state 한 번 읽고, dedup하고, 해결된 거 떨어내면 돼요 — 반면 silent state loss의 사용자 경험 비용은 커요. 이 비대칭이 논거의 전부예요.

이건 TanStack Query가 [structural sharing](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations)로 인코딩한 직관과 같아요: 새 server 데이터가 cached state로 merge될 때, 바뀌지 않은 객체는 통째로 교체되는 대신 자기 identity를 유지해요. 더 넓은 원칙은, 바뀌지 않은 데이터는 regeneration을 살아남아야지 보고 있는 사람 발밑에서 다시 만들어지면 안 된다는 거예요.

## "merge"가 실제로 치르는 비용

"merge"라고 말하긴 쉽고, 과소평가하기도 쉬워요. 진짜 carry-forward merge엔 세 가지가 필요해요:

1. **Resolution detection** — 이제 뭐가 끝났는지 알아내서 떨어내기.
2. **Dedup** — 같은 항목이 여러 source에 나오면 한 번만, 제일 나은 버전으로 남기기.
3. **Cap과 drop 정책** — 안 그러면 carry-forward 항목이 영원히 쌓여요.

Resolution detection이 정말 어려운 부분이고, 시간을 제일 많이 쓴 곳이에요. 항목은 어딘가에 `[x]`로 체크돼서, "Done" 섹션에 나타나서, 아예 삭제돼서, 아니면 — 짜증나는 케이스 — 나중에 다시 쓰인 버전에 암묵적으로 흡수돼서 "해결"될 수 있어요. 저는 이 모든 걸 완벽하게 감지하려는 걸 그만뒀어요. 신호 한두 개를 고르고 문서화하는 걸로 충분해요. dedup 단계가 나머지를 흡수할 만큼 fuzzy하기만 하면요.

cap 정책은 사소해 보였는데 아니었어요. cap이 없으면 carry-forward 목록이 끝없이 자라요. cap이 있으면 _drop 순서_가 중요해지기 시작해요: 오늘의 새 신호는 절대 떨구지 말고, auto-generated 항목은 항상 유지하고, 가장 오래된 carry-forward부터 떨궈요. 순서를 틀리면 cap이 제일 지키고 싶던 걸 버려요.

## 반전: dashboard가 자기 자신을 상대로 merge하게 두지 마세요

여기가 제가 예상 못 한 부분이에요. carry-forward를 구현하는 자연스러운 방법은 regeneration이 _이전 dashboard 파일_을 읽어서 새 데이터를 merge해 넣는 거예요. 그건 dashboard를 상대로 한 read-modify-write이고 — 세션이 하나라도 병렬로 돌 수 있는 순간, lost-update race가 돼요. 두 세션이 같은 base를 읽고, 각자 자기 변경을 merge하고, 마지막에 쓰는 쪽이 이기면서 다른 쪽 업데이트를 조용히 떨어뜨려요. silent-loss 버그 하나를 더 미묘한 걸로 맞바꾼 셈이죠.

해법은 dashboard를 input으로 취급하는 걸 아예 그만두는 거였어요. dashboard가 자기 이전 사본을 상대로 merge하는 대신, 각 섹션을 _durable source에서 생성_해요 — journal, todo 파일, 진짜 source of truth인 프로젝트별 progress 파일들에서요. dashboard는 순수한 projection이 돼요. merge 의미론은 필요한 곳("아직 열림" 섹션이 여러 durable source를 접어 넣는 곳)에선 여전히 적용되지만, merge는 durable input을 상대로 하지 생성된 파일 자체를 상대로 하지 않아요. 그러면 read-modify-write race가 통째로 사라져요. 되읽을 게 없으니까요.

## 마지막 수: 추적을 멈추기

dashboard가 durable source의 100% projection이 되고 나니, 이게 git에서 부채가 됐다는 걸 알아챘어요. regeneration마다 사실상 파일 전체를 다시 쓰니까, 둘 다 세션을 돌린 두 branch나 worktree는 거의 모든 줄에서 충돌해요 — 이점은 0인데 merge conflict 표면만 보장되는 거죠. 파일이 이미 tracked source에 없는 정보를 하나도 안 담고 있으니까요.

처음엔 in-checkout advisory lock으로 덮어보려 했는데, 이 문제엔 안 통해요. lock은 _한 working tree 안에서_ writer를 직렬화하지만, 여기 충돌은 갈라진 _branch history_에서 와요 — 서로의 lock을 절대 못 보는 두 checkout이요. 실제로 고친 건 dashboard를 gitignore하고 필요할 때 다시 생성하는 거였어요: 세션 시작과 세션 끝에요. durable source는 tracked 상태로 남아 SoT로 유지되고, projection은 ephemeral해져요. 순수 regeneration churn으로 천 개가 넘는 커밋이 쌓인 뒤에 이 파일을 untrack했어요.

## merge하지 말아야 할 때

merge는 open-state surface엔 맞는 기본값이지만, 이럴 땐 틀린 도구예요:

- source가 유일한 canonical authority일 때. `git status`는 파일시스템을 반영하는데, stale entry를 거기에 merge해 넣으면 오해만 줘요.
- resolution detection이 정말 불가능할 때 — 항목이 "done"이라는 신호가 어디에도 없어서, carry-forward 항목이 영영 안 떠나요.
- surface가 설계상 호출마다 새 리포트여야 할 때, `git log --oneline -5`처럼요. carry-forward할 게 없어요. snapshot이 핵심이거든요.

## 과거의 나에게 한마디

한 줄 요약: cross-session dashboard라면 **"아직 열린 것"은 merge, "지금 true인 것"은 overwrite**, 그리고 파일 단위가 아니라 surface 단위로 정하세요. 하지만 더 깊은 교훈은 세 실수의 순서예요. overwrite는 데이터를 잃어요. naive merge는 자기 자신과 race해요. 그리고 완전히 derived된 파일은 애초에 version control에 있을 자리가 아니에요. 각 fix가 다음 문제를 드러냈고, 최종 상태 — 모든 섹션을 durable source에서 생성하고, 그 결과물은 추적하지 않기 — 는 제가 도중에 방어하던 어떤 중간 설계보다도 단순해요.

## References

- [Render Optimizations — Structural Sharing (TanStack Query)](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations)
- [feat(wrap): persist follow-ups across sessions](https://github.com/brandonwie/3b/commit/46e23c05)

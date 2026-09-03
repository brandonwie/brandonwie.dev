---
title: 'pre-commit hook race가 내 파일을 남의 커밋에 집어넣은 사건'
description: >-
  한 저장소에 커밋하는 두 세션, 느린 pre-commit hook, 그리고 `fatal: cannot lock ref HEAD`.
  시끄러운 실패는 쉬운 쪽이에요 — 조용한 실패는 내 staged 파일을 다른 세션의 커밋에 그쪽 메시지로 넘겨버려요.
date: 2026-05-14T00:00:00.000Z
updated: "2026-09-03"
tags:
  - devops
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: git-pre-commit-parallel-session-head-race
source_updated: "2026-09-03"
translation_date: "2026-09-03"
---

같은 저장소에서 두 agent 세션이 동시에 작업하고 있었고, 둘 다 거의 같은 순간에 커밋을 시도했어요. 그중 하나가 커밋 도중에 이렇게 죽었어요:

```text
fatal: cannot lock ref 'HEAD': is at <new-sha> but expected <prev-sha>
```

이 에러는 짜증나긴 해도 정직한 편이에요. 적어도 뭔가 잘못됐다고 알려주니까요. 정작 시간을 잡아먹은 쪽은 조용한 실패였어요. 커밋은 "성공"한 것처럼 보이고 워킹 트리도 clean해졌는데, 알고 보니 내 staged 파일이 내가 쓴 적도 없는 메시지를 단 엉뚱한 커밋 안에 들어가 있던 거예요.

## 에러가 말해주는 것

`git commit`은 한순간에 끝나지 않아요. 먼저 HEAD를 읽고(가령 `<prev-sha>`), pre-commit hook을 돌리고, 그 다음에야 새 커밋을 쓰고 ref를 옮겨요. linter나 formatter, codegen이 붙은 무거운 hook이라면 이 과정이 몇 초씩 걸려요. 그 사이에 두 번째 세션이 커밋해 버리면 HEAD가 먼저 `<new-sha>`로 넘어가요. 그러고 나서 내 hook이 끝나고 git이 ref를 옮기려 보면, ref가 커밋을 시작한 자리에 없어요. 그래서 git은 lock을 atomic하게 fast-forward하지 못하고 그냥 중단해 버려요. race는 이게 전부예요. pre-commit hook이 도는 시간이 틈이고, 그 틈에 같이 커밋하는 다른 세션이 경쟁 상대인 거죠.

## 조용한 버전이 더 나빠요

시끄러운 중단은 그래도 멈춰는 줘요. 조용한 실패는 한 단계 아래에서 시작돼요. 제가 `git add`를 잘못 이해하고 있었던 지점이기도 하고요. index는 제 세션이 아니라 저장소에 속해요. 제가 stage한 건 같은 체크아웃에서 도는 다른 모든 세션에 보이고, 그 세션이 커밋해 버릴 수도 있어요. 상대 세션이 뭔가 특별한 걸 할 필요도 없어요. 평범한 `git commit` 하나면 제 staged 파일까지 들고 가서 자기 메시지를 단 자기 커밋에 넣어버려요.

`/wrap` 스타일 스크립트가 staging 영역 전체에 `git add -A`나 `git add <session-dir>/`를 돌리면 이게 통째로 일어나요. 이때는 두 문제가 한꺼번에 터져요. 내 파일이 staged돼 있는데, 다른 세션의 `git add`가 나머지까지 전부 쓸어 담아서 **그쪽** 메시지를 단 **그쪽** 커밋에 넣어버려요. 내가 쓰려던 커밋 메시지는 날아가고, 파일은 로그 엉뚱한 데 가 있는 거죠.

제가 겪었을 때 이렇게 보였어요:

1. `git commit -m "feat: scaffold the new skill"`이 `fatal: cannot lock ref 'HEAD'`로 실패.
2. `git status`는 워킹 트리가 clean — 파일이 _커밋된 것처럼_ 보임.
3. `git ls-files <path>`는 tracked임을 확인.
4. `git log -1 --stat`을 보면 파일이 전혀 무관한 작업 메시지를 단 커밋 — 병렬 세션의 wrap 커밋 — 안에 들어가 있음.

파일 자체는 멀쩡히 들어갔어요. 사라진 건 attribution이랑 커밋 메시지 의도였죠. 이렇게 파일을 쓸어 담은 장본인이 바로 wrap 스타일 자동화에 쓰인 넓은 `git add` glob이에요.

## lint-staged에도 자기만의 race가 있어요

같은 계열의 세 번째 실패가 하나 더 있는데, 이건 git 잘못이 아니에요. lint-staged는 unstaged 변경을 stash해 두고, staged된 것만 formatter에 돌린 다음, stash를 다시 되돌려요. hook이 도는 동안 다른 세션이 같은 파일을 건드리면 이 복원이 실패해요 — 원래 상태로 되돌려 놓고 커밋은 중단돼요.

헷갈리는 지점은 중단 메시지가 마치 내 변경에 문제가 있는 것처럼 보인다는 거예요. 실제로는 아니고요. 다른 세션이 조용해진 다음에 다시 시도하는 게 해결책의 전부예요.

## fix는 "hook을 더 빠르게"가 아니라 구조적

이걸 성능 문제로 보고 hook을 깎고 싶은 유혹이 들어요. 그런다고 race가 일어나는 틈이 줄긴 해도 완전히 닫히진 않아요 — HEAD를 공유하는 한, hook이 도는 동안 다른 커밋이 언제든 그 HEAD를 옮길 수 있거든요. 진짜 해법은 HEAD를 아예 공유하지 않는 거예요. 오래 도는 병렬 세션마다 자기만의 **git worktree**를 하나씩 주면 돼요.

worktree는 자기만의 HEAD, 워킹 트리, index를 가지니까, `git commit`이 race할 공유 가변 state가 없어요. 제가 쓰는 경로 컨벤션은 메인 저장소 아래에 깔끔하게 둬요:

```text
<main-repo>/.worktrees/<branch-slug>/
```

```bash
git -C <main> worktree add <main>/.worktrees/<branch-slug> \
  -b <branch-name> <base-branch>
```

그러면 두 세션이 독립적으로 커밋하고, worktree 브랜치가 다시 merge되면 모두가 결과를 봐요 — 하지만 커밋 자체는 절대 race하지 않아요.

worktree를 쓰기 어려운 상황도 있어요. 이미 세팅해 둔 체크아웃에서 뭐 하나 빠르게 고쳐야 할 때 같은 경우요. 그럴 땐 공유 index를 그대로 둔 채로 쓰는 더 가벼운 선택지도 있어요. `git commit -m ... -- <paths>`는 이름을 적은 path만 커밋하고 나머지 index는 건드리지 않아요. 그래서 공유 index 하나를 놓고도 두 세션이 각자의 커밋을 따로 남길 수 있어요. 대신 pathspec 커밋은 디스크에 있는 index가 아니라 임시 index로 만들어져서, pre-commit hook이 보는 게 평범한 커밋 때와 똑같지는 않아요. 여기에 기대기 전에 자기 hook 기준으로 한 번 확인해 보는 게 좋아요.

## 열려 있는 틈은 hook 시간만이 아니에요

pre-commit race는 길어야 몇 초짜리예요. 그런데 같은 계열에 훨씬 오래 열려 있는 race가 하나 더 있어요. 알아챈 이유는 하나예요. 이런 걸 잡으라고 만들어 둔 delta guard를 직접 돌리고 있었거든요.

guard는 편집을 시작하기 전에 저장소 상태의 baseline을 뜨고, staging 직전에 그 baseline을 다시 확인해요. capture와 verify 사이의 간격은 hook이 도는 시간이 아니에요. 편집에 걸리는 시간 전체라서 몇 분씩 늘어나기도 해요. 같은 저장소에 다른 세션이 파일을 쓰고 있으면 이 틈은 세 가지 방식으로 깨져요.

| 실패              | 다른 세션이 한 일                             |
| ----------------- | --------------------------------------------- |
| 예상 못 한 path   | baseline에 없던 파일을 새로 만듦              |
| HEAD 변경         | 커밋해 버려서 기록해 둔 SHA가 안 맞음         |
| 세션 path conflict | 없음. capture 시점에 내 path가 이미 dirty했음 |

한 세션에서 셋 다 겪었어요. 옆에서 병렬 세션이 파일을 쓰면서 main 브랜치에 커밋하고 있던 상황이었고요.

해결책은 매번 같았어요. override하지 말고 baseline을 새로 뜨는 거예요. override는 저장소가 발밑에서 움직였다는 증거를 무시하라고 도구에 지시하는 셈인데, 그 증거야말로 guard를 만든 이유거든요. 새로 뜨고 나면 guard는 다시 정확해져요.

세 번째 경우엔 비슷한 도구를 직접 만들 때 알아둘 만한 함정이 하나 더 있어요. baseline을 뜨는 시점에 이미 dirty한 path라면 세션이 소유한 path이면서 동시에 섞여 있는 path라고 양쪽 다 선언해 줘야 하고, capture 단계와 verify 단계에 똑같은 목록을 넘겨야 해요. 단계마다 다른 목록을 넘기면 verify가 대조하려던 baseline과 어긋나는데, 진짜 conflict가 난 것처럼 보여요.

## 이미 당했다면

history를 "고치"려 들기 전에 알아둘 만한 것들:

- **공유되는 건 HEAD만이 아니라 index도예요.** 병렬 세션의 mixed
  `git reset`은 내가 staged해 둔 묶음을 조용히 unstage할 수 있어요. 커밋을
  다시 시도하기 전에 `git diff --cached`를 확인하고, 필요하면 명시적 path로
  다시 stage하세요.
- **Unmerged(`UU`) index entry는 모든 커밋을 막아요.** 내 pathspec이 conflict와
  무관해도 `git commit`은 "you have unmerged files"로 실패해요. 병렬 세션의
  stash-pop이나 merge conflict가 해결될 때까지 다른 모든 세션의 커밋을 막을 수
  있어요.
- **`UU` entry는 스스로 사라질 수도 있어요.** 진행 중인 작업을 다른 세션이
  소유하고 있다면, 개입하기 전에 `git ls-files -u <path>`와 워킹 트리의 conflict
  marker를 확인하세요. 내 세션에서 그 conflict를 대신 풀면 상대 세션의 작업을
  덮어쓸 수 있어요.
- **Force-push랑 `--amend`는 여기서 복구 수단이 아니에요.** 커밋은 실제로 일어났어요 — 그냥 잘못된 메시지로요. 병렬 세션의 커밋을 amend하면 _그쪽_ history를 다시 써요. 하지 마세요.
- **파일이 실제로 어디로 갔는지 확인**하려면 `git ls-files <expected-path>`랑 `git log -- <expected-path>`를 쓰세요. 뒤쪽 명령이 그 파일이 어느 커밋에 들어갔는지 보여줘요.
- **깔끔한 재커밋은 없어요.** 파일이 이미 다른 커밋에 tracked돼 있으면, 다시 stage하는 건 no-op이에요(`nothing to commit, working tree clean`). 메시지 비대칭은 이제 history에 영구적이에요. attribution이 중요하면, 가장 깔끔한 보정은 의도한 메시지랑 scope를 달고 파일 변경은 없는 후속 커밋 — 본질적으로 로그에 남기는 메모예요.

## worktree가 답일 때(그리고 아닐 때)

저장소를 공유하는 multi-agent나 multi-window 워크플로를 설계할 때, 누락되거나 잘못 attribute된 커밋을 진단할 때, 다른 세션과 동시에 돌 거라 예상되는 task를 시작할 때 미리 세팅해 두세요. 손이 가장 덜 가는 시점은 작업을 시작하기 전이에요. race가 터진 뒤가 아니라요.

단일 agent로 직렬 작업할 때는 필요 없어요 — 애초에 race가 일어날 틈이 없으니까요 — 그리고 이건 실제 `git push --force` 사고를 설명하는 글도 아니에요. 그쪽은 history를 다시 쓰는 거라, 완전히 다른 종류의 실패예요.

## takeaway

`cannot lock ref 'HEAD'`는 잠깐의 타이밍 문제처럼 보이지만, 사실은 두 커밋 주체가 하나의 HEAD를 공유하고 있다는 신호예요. hook을 빠르게 만드는 건 증상만 건드리는 거고요. worktree는 그 공유 자체를 없애요. race를 실제로 끝내는 방법은 이것뿐이고, 내 작업이 남의 이름으로 조용히 나가버리는 변종까지 같이 끝나요.

같은 이야기가 한 단계 위에서도 똑같이 반복돼요. 저장소 상태를 capture해 뒀다가 나중에 verify하는 도구라면 전부 마찬가지예요. 그 틈은 편집하는 시간만큼 길고, guard가 걸렸을 때 답은 override가 아니라 baseline을 새로 뜨는 거예요.

## References

- [git-worktree — Manage multiple working trees](https://git-scm.com/docs/git-worktree)

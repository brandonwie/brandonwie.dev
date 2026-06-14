---
title: 'pre-commit hook race가 내 파일을 남의 커밋에 집어넣은 사건'
description: >-
  한 저장소에 커밋하는 두 세션, 느린 pre-commit hook, 그리고 `fatal: cannot lock ref HEAD`.
  시끄러운 실패는 쉬운 쪽이에요 — 조용한 실패는 내 staged 파일을 다른 세션의 커밋에 그쪽 메시지로 넘겨버려요.
date: 2026-05-14T00:00:00.000Z
updated: '2026-06-13'
tags:
  - devops
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: git-pre-commit-parallel-session-head-race
source_updated: '2026-06-13'
translation_date: '2026-06-14'
---

같은 저장소에서 두 agent 세션이 동시에 작업하고 있었고, 둘 다 거의 같은 순간에 커밋을 시도했어요. 그중 하나가 커밋 도중에 이렇게 죽었어요:

```text
fatal: cannot lock ref 'HEAD': is at <new-sha> but expected <prev-sha>
```

이 에러는 짜증나긴 해도 정직한 편이에요. 적어도 뭔가 잘못됐다고 알려주니까요. 정작 시간을 잡아먹은 쪽은 조용한 실패였어요. 커밋은 "성공"한 것처럼 보이고 워킹 트리도 clean해졌는데, 알고 보니 내 staged 파일이 내가 쓴 적도 없는 메시지를 단 엉뚱한 커밋 안에 들어가 있던 거예요.

## 에러가 말해주는 것

`git commit`은 한순간에 끝나지 않아요. 먼저 HEAD를 읽고(가령 `<prev-sha>`), pre-commit hook을 돌리고, 그 다음에야 새 커밋을 쓰고 ref를 옮겨요. linter나 formatter, codegen이 붙은 무거운 hook이라면 이 과정이 몇 초씩 걸려요. 그 사이에 두 번째 세션이 커밋해 버리면 HEAD가 먼저 `<new-sha>`로 넘어가요. 그러고 나서 내 hook이 끝나고 git이 ref를 옮기려 보면, ref가 커밋을 시작한 자리에 없어요. 그래서 git은 lock을 atomic하게 fast-forward하지 못하고 그냥 중단해 버려요. race는 이게 전부예요. pre-commit hook이 도는 시간이 틈이고, 그 틈에 같이 커밋하는 다른 세션이 경쟁 상대인 거죠.

## 조용한 버전이 더 나빠요

시끄러운 중단은 그래도 멈춰는 줘요. 진짜 골치 아픈 경우는 병렬 세션이 `/wrap` 스타일 스크립트라서 staging 영역 전체에 `git add -A`나 `git add <session-dir>/`를 돌릴 때예요. 이때는 두 문제가 한꺼번에 터져요. 내 파일이 staged돼 있는데, 다른 세션의 `git add`가 그 파일까지 같이 쓸어 담아서 **그쪽** 메시지를 단 **그쪽** 커밋에 넣어버려요. 내가 쓰려던 커밋 메시지는 날아가고, 파일은 로그 엉뚱한 데 가 있는 거죠.

제가 겪었을 때 이렇게 보였어요:

1. `git commit -m "feat: scaffold the new skill"`이 `fatal: cannot lock ref 'HEAD'`로 실패.
2. `git status`는 워킹 트리가 clean — 파일이 _커밋된 것처럼_ 보임.
3. `git ls-files <path>`는 tracked임을 확인.
4. `git log -1 --stat`을 보면 파일이 전혀 무관한 작업 메시지를 단 커밋 — 병렬 세션의 wrap 커밋 — 안에 들어가 있음.

파일 자체는 멀쩡히 들어갔어요. 사라진 건 attribution이랑 커밋 메시지 의도였죠. 이렇게 파일을 쓸어 담은 장본인이 바로 wrap 스타일 자동화에 쓰인 넓은 `git add` glob이에요.

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

`cannot lock ref 'HEAD'`는 잠깐의 타이밍 문제처럼 보이지만, 사실은 두 커밋 주체가 하나의 HEAD를 공유하고 있다는 신호예요. hook을 빠르게 만드는 건 증상만 건드리는 거고요. worktree는 그 공유 자체를 없애요. race를 실제로 끝내는 방법은 이것뿐이에요. 그리고 더 중요한 건, 내 작업이 조용히 남의 이름으로 나가버리는 그 조용한 변종까지 같이 끝낸다는 점이에요.

## References

- [git-worktree — Manage multiple working trees](https://git-scm.com/docs/git-worktree)

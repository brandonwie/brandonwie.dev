---
title: 'watcher hook 아래서 `git rev-parse HEAD`와 `git log -1`의 divergence'
description: '`gh pr merge` 후 local pull을 했더니, `git rev-parse HEAD`는 올바른 merge commit을 반환하는데 `git log -1`은 방금 merge돼서 사라진 feature branch tip을 몇 초간 렌더링했어요. checkout 도중 graphify watcher rebuild가 fire됐어요. low-level read가 권위 있고, log render는 lag할 수 있어요.'
date: 2026-05-05T00:00:00.000Z
updated: '2026-05-06'
tags:
  - devops
  - git
  - watcher-hooks
  - debugging
  - graphify
category: devops
draft: false
lang: ko
source_lang: en
source_slug: git-rev-parse-vs-log-hook-interception
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

`gh pr merge`가 PR #138을 merge하고 로컬 repo가 `origin/main`에 sync된 후, "내가 어느 commit에 있지?"를 묻는 두 가지 방식이 disagree했어요:

```bash
$ git rev-parse HEAD
234ba9b42169d22162c964d235b28c68be993c8b   # ✓ correct merge commit

$ git rev-parse origin/main
234ba9b42169d22162c964d235b28c68be993c8b   # ✓ matches

$ git log -1 --pretty=format:'%H %s'
0227f2eed0c5b18762ce895a346751571677901c test(integrations): symmetric...
                                          # ✗ this is the FEATURE BRANCH tip
                                          #   that was just merged AWAY from
```

두 명령 모두 같은 셸의 같은 repo에서 몇 초 차이로 실행됐어요. divergence는 몇 초 후 자체 해결됐어요(그리고 `git reset --hard origin/main` 직후엔 즉시 사라졌어요). 원래 관찰은 "이상한 거 봤다"로 무시하기 쉬웠지만, 두 read path 사이의 의미 있는 gap을 표면화시켰어요.

## watcher가 뭘 하고 있었는지

`git checkout main && git pull` 시퀀스 동안 graphify watcher rebuild가 fire됐는데, output stream에서 보였어요:

```text
[graphify] Branch switched - rebuilding knowledge graph (code files)...
  AST extraction: 100/402 files (24%)
  ...
[graphify watch] Rebuild failed: Graph has 5196 nodes - too large for HTML viz.
```

watcher가 어떤 state를 잡고 있었던 게 `git log`의 HEAD read와 interleave된 것 같아요. `git rev-parse HEAD`는 `.git/HEAD`를 직접 읽는 thin wrapper예요 — hook과의 상호작용이 minimal이에요. `git log`는 더 많은 일을 해요(commit 렌더, first-parent 추적, output 포맷팅) — file descriptor나 환경에 대한 hook side-effect에 더 민감할 수 있어요.

이건 가설이지 증명된 게 아니에요. reproducer는 race를 잡을 만큼 짧은 succession으로 graphify watcher + `git log`를 실행해야 하는데, 계측이 어려워요. watcher 자신의 로그("Rebuild failed: Graph has 5196 nodes — too large for HTML viz")는 무관하고, git이나 watcher 어느 쪽도 HEAD-state sync gap에 대한 깔끔한 에러를 안 줘요.

## `rev-parse`를 권위 있는 것으로 다루기

remediation은 기계적이에요: watcher hook이 실행 중일 수 있으면 HEAD-sha 쿼리에 `git rev-parse HEAD`를 권위 있는 것으로 다루세요:

```bash
# Authoritative HEAD check:
git rev-parse HEAD
git rev-parse origin/main

# If divergence with `git log` output, force resync:
git fetch origin main
git reset --hard origin/main
```

HEAD state를 안정적으로 읽어야 하는 automation에는:

```bash
HEAD_SHA=$(git rev-parse HEAD)            # cheap, authoritative
HEAD_SUBJECT=$(git show -s --format=%s "$HEAD_SHA")  # explicit lookup by sha
```

hook이 활성일 때 HEAD-state 쿼리에 `git log -1`을 피하세요 — 명시적 sha와 함께 `git show -s --format=...`을 선호하세요. 두 단계(sha 읽기, subject 조회)가 기계적으로 deterministic이에요. sha를 이미 pin했기 때문에 stale ref의 subject를 가져올 수 없어요.

## 한쪽이 다른 쪽보다 안정적인 이유

비대칭은 각 명령이 얼마나 많은 일을 하는지로 귀결돼요:

- **`git rev-parse`는 file 레벨에서 ref를 읽어요.** commit sha를 얻는 가장 저렴하고 안정적인 방법이에요 — traversal 없음, 렌더 없음, `.git/HEAD`를 여는 것 외엔 hook 상호작용 없음.
- **`git log`는 더 많은 일을 해요.** first-parent chain 따라가기, commit object 로딩, output 포맷팅. hook side-effect가 manifest할 surface가 더 많아요.
- **watcher hook(graphify, Serena, post-checkout)은 셸 컨텍스트에서 실행돼요.** file descriptor, 작업 디렉토리, 환경을 공유해요. side effect가 가능해요.
- **`git reset --hard origin/<branch>`는 안정적인 resync예요.** 권위 있는 state가 `origin/<branch>`이고 로컬이 lag로 보이면, fetch + reset --hard. workflow 중간에 hook을 디버깅하지 마세요.

## 이게 중요한 상황

규율의 가치가 있는 세 가지 컨텍스트:

- hook-triggering 작업(checkout, pull, merge, reset) 직후 HEAD state를 읽는 automation.
- watcher가 설치된 상태에서 "git이 왜 내가 잘못된 commit에 있다고 생각하지?" 디버깅.
- 무엇을 dispatch할지 결정하기 전에 HEAD sha를 알아야 하는 CI pre-flight script.

hook이 설치되지 않은 인터랙티브 사용에는 중요하지 않아요(`git log` OK), graphify/Serena/custom watcher가 없는 repo, watcher가 settle된 후(checkout 후 몇 초) — 두 명령이 일치해요.

## 실용적인 takeaway

long-running git watcher hook이 checkout이나 pull 중에 fire되면, `git rev-parse HEAD`와 `git log -1` 사이에 짧은 divergence가 발생할 수 있어요. low-level read가 이겨요. `rev-parse`로 sha를 먼저 pin한 다음, `git show -s --format=%s "$SHA"`로 subject를 명시적으로 조회하세요. divergence를 봤고 복구해야 한다면, `git fetch origin <branch> && git reset --hard origin/<branch>`가 deterministic 경로예요.

## References

- [git-rev-parse manual](https://git-scm.com/docs/git-rev-parse)
- [git-log manual](https://git-scm.com/docs/git-log)

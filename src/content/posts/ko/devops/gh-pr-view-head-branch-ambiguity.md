---
title: '`gh pr view`의 head-branch 모호성(false negative)'
description: 'PR이 멀쩡히 열려 있고 branch도 정확히 추적되는데, `gh pr view --json number,state`가 "no pull requests found"를 뱉을 수 있어요. 이 빈 결과는 "PR이 없다"가 아니라 "gh의 branch resolution이 못 찾았다"는 뜻이에요.'
date: 2026-05-05T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - github-cli
  - gh
  - pr-management
category: devops
draft: false
lang: ko
source_lang: en
source_slug: gh-pr-view-head-branch-ambiguity
source_updated: "2026-06-14"
translation_date: '2026-05-10'
---

CI/CD pre-flight check에서 `gh pr view`가 "PR이 없다"고 답해서 한참 디버깅한
적이 있어요. PR은 분명 열려 있었고, branch도 정확히 추적되고 있었는데도요.
`gh pr view`(PR 번호 없이)는 현재 branch의 PR을 찾도록 문서화돼 있는데, 조용히
실패하는 경로가 있어요. 그게 "PR이 존재하지 않는다"처럼 보여서, 자동화에 들어가면
진짜 시간을 갉아먹어요. 처음 본 증상은 이거였어요.

```bash
gh pr view --json number,state,title,url --jq '.'
```

반환값이 이렇게 나왔어요.

```text
no pull requests found for branch "..."
```

`gh pr list --head <branch>`로 확인하면 PR이 열려 있는데도요. resolution이
실패하는 이유는 보통 한눈에 보이지 않아요.

- local branch에만 있는 commit이 있을 때. gh는 remote tracker를 기준으로 보거든요.
- PR이 다른 fork나 org에서 열려서, gh가 엉뚱한 remote로 가버릴 때.
- 직전 `git fetch`가 race를 일으켜서 local ref가 어긋난 상태일 때.
- branch를 방금 push해서 gh의 GraphQL 캐시가 아직 안 퍼졌을 때.

겪었던 케이스에선 PR도 존재했고 branch도 `origin/fix/tf57-google-integration-refresh`로
정확히 추적되고 있었는데, `gh pr view`는 빈 값을 돌려줬어요. 후속으로
`gh pr create`를 던졌더니 즉시 `already exists: PR 138`로 실패했죠. PR이 열려
있다는 결정적 증거예요. branch resolution이 그냥 못 찾은 것뿐이었어요.

## 존재 확인엔 explicit-branch 형식을 써요

기본 branch resolution 경로를 우회하는 안정적인 형식이 두 개 있어요.

```bash
# PR 번호로(가장 안정):
gh pr view 138 --json state,mergeable,...

# 명시적인 head branch로(resolution edge case에서도 동작):
gh pr list --head fix/tf57-google-integration-refresh \
           --json number,state,headRefName \
           --jq '.[0]'
```

`gh pr list --head` 형식은 branch name 문자열을 키로 server-side query를 강제해요.
local 상태가 어떻든 invariant라서 흔들리지 않아요. branch name만 알고 있고 PR의
전체 상태가 필요하면, 두 명령을 chain하면 돼요.

```bash
PR_NUM=$(gh pr list --head <branch> --json number --jq '.[0].number')
[ -n "$PR_NUM" ] && gh pr view "$PR_NUM" --json ...
```

## 기본 형식이 script에 안 맞는 이유

`gh pr view`(인자 없이)가 "PR 있어?" 같은 pre-flight check에 안 맞는 이유가
세 가지예요.

- **존재 확인엔 `gh pr view`(인자 없이)를 믿지 마세요.** 존재 여부는
  `gh pr list --head <branch>`로 묻고, 전체 상태는 `gh pr view <number>`로
  가져와요.
- **빈 결과나 에러 출력은 "PR 없음"이 아니에요.** "gh의 branch resolution이
  못 찾았다"는 뜻이에요. 전혀 다른 명제죠.
- **`gh pr create`는 destructive existence check예요.** PR이 이미 있으면 알려주긴
  하지만, 못 찾으면 새로 만들려고 시도해요. script의 "PR 있어?" 단계에서 쓰면
  안 돼요.

## 빨리 알아차리기 어려웠던 이유

진단을 늦춘 게 두 가지 있어요.

- **에러 메시지가 권위 있게 읽혀요.** "no pull requests found for branch X"는
  딱 잘라 말하는 톤이라, "gh가 branch를 잘못 resolve했나?"가 머리에 잘 안
  떠올라요. "gh가 GitHub에 물었고, GitHub이 없다고 했다"라는 mental model이
  잘못 잡혀 있는 거예요. 실제로 gh는 client-side resolution을 돌리고, 그게
  실패할 수 있어요.
- **`gh pr list --head` 없이는 디버깅할 방법이 없어요.** gh의 resolution
  경로를 보여주는 `--verbose` 모드가 따로 없어서, 왜 못 찾았는지가 아니라
  못 찾았다는 사실만 알려줘요.

## 언제 신경 써야 하는지

다음 같은 상황에서 workaround가 필요해요.

- 행동(open vs update vs skip)을 결정하기 전에 PR 존재를 알아야 하는 CI/CD
  pre-flight check
- PR 존재 여부로 분기하는 자동화 skill(예: `/crucio-ship`, `/pr-create`)
- "PR 없음"이 곧 "PR 만들기"로 이어지는 모든 script(destructive check 문제)

interactive 사용에는 큰 문제가 안 돼요. 직접 작업한 branch에서 `gh pr view`를
쓰면 보통은 원하는 동작을 하고, 결과를 눈으로 한 번 확인할 수 있으니까요. PR을
방금 연 세션에서 `git push -u origin <branch>` 직후라면, gh의 resolution이
가장 정확할 시점이에요.

## 정리

자동화에서 "이 branch에 PR 있어?"를 묻고 싶으면 `gh pr list --head <branch>`를
쓰고, 결과 array가 비어 있지 않은지 확인하면 돼요. PR 번호를 손에 쥐었을 때
전체 상태를 가져오는 용도로 `gh pr view <number>`를 아껴두면 좋아요. 기본
`gh pr view`(인자 없이) 형식은 인터랙티브하게 쓰기엔 괜찮지만, 재현하기 어려운
조건에서 false-negative "no PR" 응답을 만들어내요. script와는 잘 맞지 않는
조합이에요.

## References

- [gh pr view manual](https://cli.github.com/manual/gh_pr_view)

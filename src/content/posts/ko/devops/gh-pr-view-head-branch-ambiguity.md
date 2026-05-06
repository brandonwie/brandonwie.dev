---
title: '`gh pr view` Head-Branch 모호성 (False-Negative)'
description: '오픈된 PR이 있는 branch에서 `gh pr view --json number,state`를 실행했는데 PR이 존재하고 branch가 정확히 추적되고 있는데도 "no pull requests found"를 반환할 수 있어요. 빈 결과는 "PR이 존재하지 않는다"가 아니라 "gh의 branch resolution이 못 찾았다"는 뜻이에요.'
date: 2026-05-05T00:00:00.000Z
updated: '2026-05-06'
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
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

`gh pr view`(no PR number)은 현재 branch의 PR을 찾는 것으로 문서화돼 있어요. "PR이 존재하지 않는다"처럼 보이는 방식으로 조용히 실패할 수 있어요 — 그리고 이 failure mode는 CI/CD pre-flight check에 나타나면 디버깅 시간을 한 덩어리 태워요. 원래 증상:

```bash
gh pr view --json number,state,title,url --jq '.'
```

이 반환:

```text
no pull requests found for branch "..."
```

`gh pr list --head <branch>`이 PR이 열려 있다고 보여주는데도. 명확하지 않은 이유로 resolution이 실패할 수 있어요:

- local branch에 gh의 resolution이 사용하는 remote tracker에 없는 commit이 있어요.
- PR이 다른 fork/org에서 열렸고 gh가 다른 remote로 resolve해요.
- 최근 `git fetch` race로 local view of refs가 sync에서 벗어났어요.
- branch가 방금 push됐고 gh의 GraphQL cache가 propagate되지 않았어요.

원래 케이스에서 PR은 존재했고 branch는 정확히 추적됐어요(`origin/fix/tf57-google-integration-refresh`)지만, `gh pr view`가 빈 값을 반환했어요. `gh pr create`로 후속 시도했더니 즉시 `already exists: PR 138`로 실패했어요 — PR이 열려 있다는 결정적 증거. branch resolution이 그냥 못 찾은 거예요.

## existence check엔 explicit-branch 형식 사용

기본 branch-resolution path를 이기는 두 가지 안정적인 형식:

```bash
# By PR number (most reliable):
gh pr view 138 --json state,mergeable,...

# By explicit head branch (works across resolution edge cases):
gh pr list --head fix/tf57-google-integration-refresh \
           --json number,state,headRefName \
           --jq '.[0]'
```

`gh pr list --head` 형식은 gh가 branch name string을 키로 server-side query를 하도록 강제하고, 이건 local-state weirdness 아래서도 invariant예요. PR의 full state가 필요하고 branch name만 있으면 chain하세요:

```bash
PR_NUM=$(gh pr list --head <branch> --json number --jq '.[0].number')
[ -n "$PR_NUM" ] && gh pr view "$PR_NUM" --json ...
```

## 기본 형식이 script에 안전하지 않은 이유

`gh pr view`(no args)가 "PR이 있나?" pre-flight check에 잘못된 도구인 세 가지 속성:

- **existence check에 `gh pr view`(no args)를 신뢰하지 마세요.** existence question에는 `gh pr list --head <branch>`을 쓰고, full state에는 `gh pr view <number>`을 쓰세요.
- **빈/error output ≠ no PR.** "gh의 branch resolution이 못 찾았다"는 의미예요 — 다른 명제예요.
- **`gh pr create`는 destructive existence check예요.** PR이 이미 있다고 알려주긴 하지만, PR이 안 보이면 만들려고도 시도해요. script의 "PR이 있나?" pre-flight에 안전하지 않아요.

## 발견하기 어렵게 만든 것들

진단을 늦춘 두 가지:

- **에러 메시지가 오해의 소지가 있어요.** "no pull requests found for branch X"가 권위 있게 읽혀요. "gh가 내 branch를 잘못 resolve했다"고 즉시 생각하지 않아요. "gh가 GitHub에 물었고, GitHub이 no라고 했다"는 mental model이 잘못된 거예요 — gh가 실패할 수 있는 client-side resolution을 하고 있어요.
- **`gh pr list --head` 없이 디버깅할 방법이 없어요.** gh의 resolution path를 보여주는 `--verbose` mode가 없어서 PR을 왜 못 찾았는지 알 수 없어요 — 못 찾았다는 것만 알 수 있어요.

## 이게 중요한 상황

다음에 workaround를 사용:

- 행동 취하기 전에 PR이 존재하는지 알아야 하는 CI/CD pre-flight check(open vs update vs skip).
- PR existence에 분기하는 automation skill(`/crucio-ship`, `/pr-creator` 같은).
- "no PR found"가 PR 만들기로 이어지는 모든 script(destructive-check 문제).

interactive 사용에는 중요하지 않아요 — 자기 작업에 `gh pr view`를 실행할 때, resolution이 보통 원하는 걸 하고, 결과를 spot-check할 수 있어요. PR-opening session에서 fresh `git push -u origin <branch>` 후엔, gh의 resolution이 정확할 가능성이 가장 높아요.

## 실용적인 takeaway

"이 branch에 PR이 있나?" 묻는 automation엔, `gh pr list --head <branch>`를 쓰고 결과 array가 비어 있지 않은지 확인하세요. number가 있으면 full-state query에 `gh pr view <number>`를 예약하세요. default `gh pr view`(no args) 형식은 interactive하게는 fine이지만 재현하기 어려운 조건에서 false-negative "no PR" 응답을 만들어요 — script에 나쁜 조합이에요.

## References

- [gh pr view manual](https://cli.github.com/manual/gh_pr_view)

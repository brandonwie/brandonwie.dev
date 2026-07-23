---
title: claude-code-action workflow를 설정하며 놓치기 쉬운 것들
description: >-
  Claude Code Action의 SHA 고정, job 권한, issue_comment branch 동작,
  model 선택을 서로 다른 설정 레이어로 나눠 점검한 기록이에요.
date: 2026-07-23T00:00:00.000Z
updated: 2026-07-23T00:00:00.000Z
tags:
  - devops
  - github-actions
  - claude-code
  - ci
  - supply-chain
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-code-action-workflow-setup-gotchas
source_updated: 2026-07-23T00:00:00.000Z
translation_date: 2026-07-23
references:
  - url: 'https://github.com/anthropics/claude-code-action'
    title: Anthropic Claude Code Action
    type: official
  - url: >-
      https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment
    title: GitHub Actions issue_comment event
    type: official
---

Claude Code Action workflow 두 개를 올리다가 서로 관련 없어 보이는 오류 세
가지를 만났어요. action 참조를 찾지 못했고, review가 CI를 읽지 못했으며, 바꾼
설정은 적용되지 않은 것처럼 보였어요.

원인은 각각 다른 레이어에 있었어요. GitHub가 action SHA를 해석하고, job
권한이 API 접근을 결정하며, trigger event가 실행할 workflow revision을
고릅니다.

## 검증한 tag에서 action을 고정해요

짧은 Git SHA는 전체 값의 앞부분일 뿐이에요. 뒤를 추측해서 채우면 원래 commit이
복구되는 게 아니라 대부분 존재하지 않는 object ID가 만들어져요.

release tag가 가리키는 전체 commit을 조회해 그대로 복사해요.

```bash
gh api repos/anthropics/claude-code-action/commits/v1.0.181 -q .sha
```

`v1.0.181`에서 확인한 값은
`44423bdec74b97d67543eb16c110546762c110b2`였어요. tag를 확인한 뒤 변경되지
않는 commit에 고정하면 SHA를 추측하지 않고도 supply-chain 변경을 막을 수
있어요.

## API 접근은 job 권한에 선언해요

action에 `additional_permissions`가 있어도 GitHub token 권한은 workflow의
job 경계에서 먼저 열어야 해요. 이 설정에서는 `actions: read`가 없어서
`github_ci`가 403을 반환했어요.

review 본문은 끝까지 생성돼서 경고를 놓치기 쉬웠어요. 막힌 것은 Actions
실행을 조회하는 기능뿐이었거든요. 결과만 보고 정상이라고 판단하지 말고 action
log에서 도구 권한 경고도 확인해야 해요.

## comment workflow는 default branch 기준으로 돌아요

GitHub 문서에 따르면 `issue_comment`의 `GITHUB_REF`와 `GITHUB_SHA`는 기본
branch를 가리켜요. workflow file도 기본 branch에 있어야 새 comment에서
실행돼요.

따라서 feature branch에서 comment 기반 workflow를 고쳐도 아직 실제 동작은
바뀌지 않아요. 변경을 default branch에 반영한 다음 새 comment event를
만들어야 해요.

## model 선택은 설치된 version으로 확인해요

`claude_args`는 model과 effort를 포함한 CLI argument를 Claude Code에
전달해요. 입력 형식은 유지되지만 정확한 model ID는 달라질 수 있어요. action
tag만 보고 지원 여부를 추정하지 말고 현재 Claude Code release와 실행 log를
확인하는 편이 안전해요.

제가 확인한 version 기준 전체 예시는 다음과 같아요.

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: read
  id-token: write
  actions: read # github_ci MCP server 403s without this
steps:
  - uses: anthropics/claude-code-action@44423bdec74b97d67543eb16c110546762c110b2 # v1.0.181
    with:
      claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
      claude_args: |
        --model claude-opus-4-8
        --effort high
```

## 적용할 때 확인할 순서

YAML과 실제 동작이 다르면 아래 순서로 확인해요.

1. tag가 가리키는 전체 SHA를 조회해요.
2. 필요한 API 권한이 job의 `permissions`에 있는지 봐요.
3. trigger event가 어느 branch의 workflow를 쓰는지 확인해요.
4. 실행 log에서 적용된 model과 effort를 확인해요.

이 순서는 comment 기반 Claude workflow를 추가하거나 올릴 때 특히 유용해요.
다른 event라면 `issue_comment`와 같다고 가정하지 말고 해당 GitHub 문서부터
확인해야 해요.

---
title: claude-code-action Workflow Setup Gotchas
description: >-
  Setting up `anthropics/claude-code-action` workflows (`@claude` assistant +
  `@claude review`) with a specific model/effort and a supply-chain-safe
  version...
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
lang: en
expanded: true
references:
  - url: 'https://github.com/anthropics/claude-code-action'
    title: Anthropic Claude Code Action
    type: official
  - url: >-
      https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment
    title: GitHub Actions issue_comment event
    type: official
source_content_hash: 954442b7c4c5eb74a4326bf35701192eca6b671e25bf1dfeb312d72444241715
---

While upgrading a pair of Claude Code Action workflows, I ran into three
failures that looked unrelated: an action reference that could not resolve, a
review that could not read CI, and a configuration change that appeared to be
ignored. Each came from a different layer of GitHub Actions.

The useful lesson was not a single YAML snippet. It was learning which source of
truth controls each layer: GitHub resolves the action SHA, job permissions
control API access, and the triggering event determines which workflow revision
runs.

## Pin the action from a verified tag

A short Git SHA is only a prefix. Extending it by hand does not recover the
missing bytes; it creates a different, usually nonexistent object ID.

Fetch the full commit for the release tag and copy that exact value:

```bash
gh api repos/anthropics/claude-code-action/commits/v1.0.181 -q .sha
```

For `v1.0.181`, the command returned
`44423bdec74b97d67543eb16c110546762c110b2`. Pinning the immutable commit keeps
the workflow supply-chain-safe without guessing at the SHA.

## Put API access in job permissions

The action accepts `additional_permissions`, but the GitHub token still needs
the corresponding permission at the workflow job boundary. In this setup,
`github_ci` logged a 403 until the job declared `actions: read`.

The review itself could still finish, which made the warning easy to overlook.
The missing permission only removed Claude's ability to inspect Actions runs.
That is why a green-looking review is not enough; read the action log for
degraded-tool warnings.

## Remember where comment workflows run

GitHub documents `issue_comment` with the default branch as both `GITHUB_REF`
and the source of `GITHUB_SHA`. The workflow file must also exist on the default
branch before the event can trigger it.

That means editing a comment-driven workflow on a feature branch does not change
the live behavior yet. Merge or otherwise land the workflow revision on the
default branch, then trigger a new comment event.

## Keep model selection version-aware

`claude_args` passes CLI arguments through to Claude Code, including model and
effort flags. The input surface is stable; exact model identifiers are not.
Check the current Claude Code release and inspect the run log instead of
inferring model support from the action tag.

Here is the complete version-specific example I verified:

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

## Practical takeaway

When a Claude Action workflow behaves differently from its YAML, check the
layers in order:

1. Resolve the pinned tag to its full SHA.
2. Confirm required access under the job's `permissions`.
3. Check the triggering event's branch semantics.
4. Read the run log to confirm the effective model and effort.

This checklist is most useful while adding or upgrading comment-driven Claude
workflows. For another event type, start with that event's GitHub documentation
rather than assuming it follows `issue_comment`.

---
title: GitHub PR Review API - Inline Comments
description: >-
  How to create PR reviews with inline comments using the GitHub API via `gh`
  CLI.
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - devops
  - github
  - api
  - pr-review
category: devops
draft: false
lang: en
references:
  - url: >-
      https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
    title: GitHub REST API - Create a review for a pull request
    type: official
---

I wanted to add self-review inline comments to a PR using the `gh` CLI. The
obvious approach -- using `gh api` with `-f` flags and bracket notation for
arrays -- produced a 422 error. It took me longer than I care to admit to
realize the `-f` flag silently builds objects instead of arrays.

## Why This Matters

Inline PR comments pinned to specific lines of code are far more useful than
wall-of-text PR descriptions. They let reviewers (and your future self)
understand why a particular line was written that way. If you are automating
self-reviews, CI lint annotations, or security findings, you need the GitHub
PR Review API to post them programmatically.

---

## The Difficulties I Ran Into

- **Misleading `-f` flag behavior** -- The `gh api -f` flag supports bracket
  notation for nested objects, so `comments[0][path]` looks correct but
  silently produces `{"comments": {"0": {"path": ...}}}` instead of a JSON
  array. No warning is emitted.
- **Unhelpful 422 error** -- The GitHub API returns "is not an array" but does
  not show what the malformed payload actually looked like. Without manually
  inspecting the serialized JSON, the root cause is invisible.
- **Line number validation** -- Even after fixing the JSON format, comments
  fail silently if the `line` number is not present in the PR diff. You must
  cross-reference the diff output to find valid line numbers.
- **Heredoc quoting subtlety** -- Using unquoted heredoc delimiters causes
  shell expansion of backticks and `$variables` inside the JSON body,
  corrupting code snippets in comment text.

---

## The Broken Approach

```bash
# WRONG - causes HTTP 422 error
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -f "comments[0][path]=file.ts" \
  -f "comments[0][line]=123" \
  -f "comments[0][body]=Comment text"

# Error: "For 'properties/comments', {...} is not an array. (HTTP 422)"
```

The `-f "comments[0][path]=..."` syntax does NOT create a proper JSON array.
It creates `{"comments": {"0": {"path": ...}}}` -- an object with a string
key `"0"`, not an array. GitHub expects `comments` to be an actual JSON array.

---

## The Solution: Heredoc with `--input -`

Use a heredoc to pipe properly formatted JSON directly:

```bash
cat << 'REVIEW_JSON' | gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/utils/calendar.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\nExplanation here..."
    },
    {
      "path": "src/utils/calendar.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\nExplanation here..."
    }
  ]
}
REVIEW_JSON
```

The single-quoted heredoc delimiter (`'REVIEW_JSON'`) prevents shell expansion
of backticks and `$variables` inside the JSON body. This is critical when your
comment text contains code snippets.

---

## Key Reference

### Comment Structure

| Field  | Required | Description                                       |
| ------ | -------- | ------------------------------------------------- |
| `path` | Yes      | File path relative to repo root                   |
| `line` | Yes      | Line number in the NEW version of the file        |
| `side` | Yes      | `"RIGHT"` for new code, `"LEFT"` for deleted code |
| `body` | Yes      | Comment content (supports Markdown)               |

### Line Number Requirements

The `line` must be a line that appears in the PR diff. This is the most common
source of silent failures.

- Lines with `+` prefix (added lines) use `side: "RIGHT"`
- Deleted lines (`-` prefix) use `side: "LEFT"`
- Context lines (no prefix) may or may not be commentable

To find valid line numbers:

```bash
# Get the PR diff to see which lines are actually changed
gh pr diff {PR_NUMBER} -- {file_path}
```

### JSON Escaping

| Character    | Escape As                |
| ------------ | ------------------------ |
| Double quote | `\"`                     |
| Newline      | `\n`                     |
| Backslash    | `\\`                     |
| Tab          | `\t` (avoid, use spaces) |

### Event Types

| Event             | Description                          |
| ----------------- | ------------------------------------ |
| `COMMENT`         | General comment (no approval status) |
| `APPROVE`         | Approve the PR                       |
| `REQUEST_CHANGES` | Request changes before merge         |

---

## Complete Working Example

```bash
PR_NUMBER=644
OWNER=moba-works
REPO=backend-v2

cat << 'REVIEW_JSON' | gh api repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review\n\nKey implementation points explained below.",
  "comments": [
    {
      "path": "src/common/utils/calendar/calendar-normalization.util.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### TZID Normalization\n\n**Why this implementation:**\n\nConverts non-standard TZID to IANA format."
    },
    {
      "path": "src/common/utils/calendar/calendar-normalization.util.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### DST Gap Detection\n\n**Problem:**\n\nDuring DST transition, dayjs adjusts non-existent times."
    }
  ]
}
REVIEW_JSON
```

On success, the API returns the created review object:

```json
{
  "id": 3751032477,
  "html_url": "https://github.com/org/repo/pull/644#pullrequestreview-3751032477",
  "state": "COMMENTED",
  "submitted_at": "2026-02-04T13:19:25Z"
}
```

---

## Why This Works

The heredoc approach bypasses the `gh api -f` flag entirely. You write the
exact JSON payload you want -- with proper arrays, proper escaping, and no
surprises from shell serialization. Single-quoted delimiters prevent shell
expansion, so backticks and dollar signs in your comment body survive intact.

---

## Practical Takeaway

Use the heredoc approach for any `gh api` call that requires arrays in the
request body. The `-f` flag works fine for flat key-value pairs, but it cannot
construct arrays. Keep these gotchas in mind:

- Always verify line numbers against `gh pr diff` before posting
- Always use single-quoted heredoc delimiters when your JSON contains code
- The API rate-limits apply; batch your comments into a single review call

### When to Use

- Automating self-review comments on your own PRs
- CI/CD pipelines that post inline review comments (lint, coverage, security)
- Bulk-commenting on multiple files/lines in a single API call

### When NOT to Use

- **Simple PR descriptions** -- Use the PR body or a single top-level comment
- **Non-diff lines** -- The API only accepts lines present in the diff
- **High-frequency automation** -- GitHub rate-limits API calls; posting on
  every commit will hit limits quickly
- **Draft PRs you will rewrite** -- Inline comments are tied to specific diff
  line numbers and become orphaned when you force-push

### Common Errors

| Error                       | Cause                       | Fix                       |
| --------------------------- | --------------------------- | ------------------------- |
| HTTP 422 "not an array"     | Using `-f comments[0][...]` | Use heredoc JSON          |
| HTTP 422 "line not in diff" | Invalid line number         | Verify line is in PR diff |
| HTTP 404                    | Wrong PR number or repo     | Check PR exists           |
| HTTP 403                    | No write access             | Check permissions         |

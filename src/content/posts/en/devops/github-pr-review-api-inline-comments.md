---
title: GitHub PR Review API - Inline Comments
description: >-
  How to create PR reviews with inline comments using the GitHub API via `gh`
  CLI.
date: 2026-02-04T00:00:00.000Z
updated: "2026-08-02"
tags:
  - devops
  - github
  - api
  - pr-review
category: devops
draft: false
lang: en
expanded: true
source_content_hash: 4012a99e03586a05c548e2e028eba2329c104b501cab8d4bcf497138e2409d54
references:
  - url: >-
      https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
    title: GitHub REST API - Create a review for a pull request
    type: official
---

## The Problem

When using `gh api` with `-f` flag and bracket notation for arrays, the JSON is
malformed:

```bash
# ❌ WRONG - causes HTTP 422 error
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -f "comments[0][path]=file.ts" \
  -f "comments[0][line]=123" \
  -f "comments[0][body]=Comment text"

# Error: "For 'properties/comments', {...} is not an array. (HTTP 422)"
```

The `-f "comments[0][path]=..."` syntax does NOT create a proper JSON array.
GitHub API expects `comments` to be an actual array, not an object with numeric
keys.

---

## Difficulties Encountered

- **Misleading `-f` flag behavior** — The `gh api -f` flag supports bracket
  notation for nested objects, so `comments[0][path]` _looks_ correct but
  silently produces `{"comments": {"0": {"path": ...}}}` instead of a JSON
  array. No warning is emitted.
- **Unhelpful 422 error** — The GitHub API returns "is not an array" but does
  not show what the malformed payload actually looked like, making it hard to
  diagnose without manually inspecting the serialized JSON.
- **Line number validation** — Even after fixing the JSON format, comments fail
  silently if the `line` number is not present in the PR diff. You must
  cross-reference the diff output to find valid line numbers.
- **Heredoc quoting subtlety** — Using unquoted heredoc delimiters causes shell
  expansion of backticks and `$variables` inside the JSON body, corrupting code
  snippets in comment text.

---

## The Solution

Use heredoc with `--input -` to pipe properly formatted JSON:

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
      "body": "### 📌 TZID Normalization\n\nExplanation here..."
    },
    {
      "path": "src/utils/calendar.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### 📌 DST Gap Detection\n\nExplanation here..."
    }
  ]
}
REVIEW_JSON
```

## Key Points

### Comment Structure

| Field  | Required | Description                                       |
| ------ | -------- | ------------------------------------------------- |
| `path` | Yes      | File path relative to repo root                   |
| `line` | Yes      | Line number in the NEW version of the file        |
| `side` | Yes      | `"RIGHT"` for new code, `"LEFT"` for deleted code |
| `body` | Yes      | Comment content (supports Markdown)               |

### Line Number Requirements

**CRITICAL:** The `line` must be a line that appears in the PR diff.

- Use lines with `+` prefix (added lines) → `side: "RIGHT"`
- Context lines (no prefix) may or may not be commentable
- Deleted lines (`-` prefix) → `side: "LEFT"`

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

### Single-Quoted Heredoc

Use `'REVIEW_JSON'` (single quotes) to prevent shell expansion:

```bash
# Single quotes prevent $variable and `backtick` expansion
cat << 'REVIEW_JSON' | gh api ...
{
  "body": "Code: `const x = 1;`"  # Backticks preserved
}
REVIEW_JSON
```

## Event Types

| Event             | Description                          |
| ----------------- | ------------------------------------ |
| `COMMENT`         | General comment (no approval status) |
| `APPROVE`         | Approve the PR                       |
| `REQUEST_CHANGES` | Request changes before merge         |

## Complete Example

```bash
PR_NUMBER=123
OWNER=example-org
REPO=example-repo

cat << 'REVIEW_JSON' | gh api repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/reviews -X POST --input -
{
  "event": "COMMENT",
  "body": "## Self Review 🔍\n\nExplaining the key implementation points of this PR.",
  "comments": [
    {
      "path": "src/lib/calendar/normalize-timezone.ts",
      "line": 244,
      "side": "RIGHT",
      "body": "### 📌 TZID normalization\n\n**Why it is written this way:**\n\nNon-standard TZID values get mapped to IANA identifiers before parsing."
    },
    {
      "path": "src/lib/calendar/normalize-timezone.ts",
      "line": 307,
      "side": "RIGHT",
      "body": "### 📌 DST gap detection\n\n**The problem:**\n\nDuring a DST transition the date library silently shifts times that do not exist."
    }
  ]
}
REVIEW_JSON
```

## Response

On success, the API returns the created review object:

```json
{
  "id": 3751032477,
  "html_url": "https://github.com/example-org/example-repo/pull/123#pullrequestreview-3751032477",
  "state": "COMMENTED",
  "submitted_at": "2026-02-04T13:19:25Z"
}
```

## When to Use

- Automating self-review comments on your own PRs (explaining complex logic)
- CI/CD pipelines that post inline review comments (lint results, test coverage,
  security findings)
- Bulk-commenting on multiple files/lines in a single API call rather than
  clicking through the GitHub UI one by one

---

## When NOT to Use

- **Simple PR descriptions** — If your notes apply to the PR as a whole, use the
  PR body or a single top-level comment instead of inline comments
- **Non-diff lines** — The API only accepts lines present in the diff; do not
  use this for commenting on unchanged code (use a regular issue comment)
- **High-frequency automation** — GitHub rate-limits API calls; posting reviews
  on every commit in a busy repo will hit limits quickly
- **Draft PRs you will rewrite** — Inline comments are tied to specific diff
  line numbers and become orphaned when you force-push new commits

---

## Common Errors

| Error                       | Cause                       | Fix                       |
| --------------------------- | --------------------------- | ------------------------- |
| HTTP 422 "not an array"     | Using `-f comments[0][...]` | Use heredoc JSON          |
| HTTP 422 "line not in diff" | Invalid line number         | Verify line is in PR diff |
| HTTP 404                    | Wrong PR number or repo     | Check PR exists           |
| HTTP 403                    | No write access             | Check permissions         |

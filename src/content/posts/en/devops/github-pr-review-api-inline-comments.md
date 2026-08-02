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
  - url: https://cli.github.com/manual/gh_api
    title: gh api - GitHub CLI manual
    type: official
---

## The Problem

I wanted to post a PR review with several inline comments from the command
line. The obvious-looking approach — `gh api` with a numeric bracket index for
the array — fails:

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

`gh api --verbose` prints the request body, which explains it (gh 2.97.0):

```json
{
  "body": "Review body",
  "comments": {
    "0": {
      "body": "Comment text",
      "line": "123",
      "path": "file.ts"
    }
  },
  "event": "COMMENT"
}
```

A number inside brackets is just another nested object key, so `comments`
becomes an object with a `"0"` key. The API wants an actual JSON array.

---

## Difficulties Encountered

- **Bracket notation looks like array syntax** — `gh api` supports
  `key[subkey]=value` for nested objects, so `comments[0][path]` _looks_ like
  indexing into an array. It is not. No warning is emitted locally; the request
  goes out and GitHub rejects it.
- **Unhelpful 422 error** — The response says "is not an array" but does not
  echo the payload it received, so the mismatch is invisible until you add
  `--verbose` and read the serialized JSON yourself.
- **Line numbers must exist in the diff** — Even with valid JSON, a comment
  aimed at a line that is not part of the PR diff is rejected with another 422
  rather than being placed somewhere approximate. You have to cross-reference
  the diff to pick line numbers.
- **Heredoc quoting subtlety** — With an unquoted heredoc delimiter, the shell
  expands backticks and `$variables` inside the JSON body, which mangles code
  snippets inside comment text.

---

## Two Ways to Send a Real Array

### 1. Empty brackets, not a numeric index

The `gh api` manual documents the array form explicitly: "To pass nested values
as arrays, declare multiple fields with the syntax `key[]=value1`,
`key[]=value2`." Its own example builds an array _of objects_ with
`properties[][property_name]=...`, and the same shape works here. Repeating a
subkey starts a new array element:

```bash
gh api repos/{owner}/{repo}/pulls/{PR}/reviews -X POST \
  -f event="COMMENT" \
  -f body="Review body" \
  -F "comments[][path]=src/lib/calendar/normalize-timezone.ts" \
  -F "comments[][line]=244" \
  -F "comments[][side]=RIGHT" \
  -F "comments[][body]=TZID normalization: non-standard values are mapped to IANA identifiers first." \
  -F "comments[][path]=src/lib/calendar/normalize-timezone.ts" \
  -F "comments[][line]=307" \
  -F "comments[][side]=RIGHT" \
  -F "comments[][body]=DST gap detection: the date library silently shifts times that do not exist."
```

Two details matter here. Use `-F`, not `-f`, for `line` — `-f` sends every
value as a string, so `line` arrives as `"244"` instead of `244`. And the
brackets must be empty: `comments[]`, never `comments[0]`.

I had read past that paragraph in the manual and reached for the index form out
of habit. The 422 was correct; my mental model of the flag was wrong.

### 2. Heredoc with `--input -`

Once comment bodies are multi-paragraph Markdown, the flag list gets long and
hard to read. Piping the JSON directly is the version I keep:

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

Both routes produce the same payload. The heredoc is easier to generate from a
script and easier to eyeball before sending; the flag form is shorter for one
or two short comments. Neither is more "correct" than the other.

## Key Points

### Comment Structure

| Field  | Required | Description                                       |
| ------ | -------- | ------------------------------------------------- |
| `path` | Yes      | File path relative to repo root                   |
| `body` | Yes      | Comment content (supports Markdown)               |
| `line` | No       | Line number in the NEW version of the file        |
| `side` | No       | `"RIGHT"` for new code, `"LEFT"` for deleted code |

Only `path` and `body` are required per comment in the REST reference. `line`
and `side` are optional, and `side` defaults to `"RIGHT"`. In practice you still
want `line` (or the alternative `position` field) — that is what anchors the
comment to a specific spot in the diff. At the top level, `body` is required
when `event` is `COMMENT` or `REQUEST_CHANGES`.

### Line Number Requirements

The `line` must be a line that appears in the PR diff.

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

Omitting `event` entirely creates a PENDING review you can submit later.

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
  "id": 1234567890,
  "html_url": "https://github.com/example-org/example-repo/pull/123#pullrequestreview-1234567890",
  "state": "COMMENTED",
  "submitted_at": "2026-01-15T09:00:00Z"
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

| Error                       | Cause                       | Fix                                    |
| --------------------------- | --------------------------- | -------------------------------------- |
| HTTP 422 "not an array"     | Using `-f comments[0][...]` | Use `comments[][...]` or heredoc JSON  |
| HTTP 422 "line not in diff" | Invalid line number         | Verify line is in PR diff              |
| HTTP 404                    | Wrong PR number or repo     | Check PR exists                        |
| HTTP 403                    | No write access             | Check permissions                      |

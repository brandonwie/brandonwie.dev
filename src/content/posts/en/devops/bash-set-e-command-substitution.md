---
title: Bash set -e and Command Substitution
description: 'When using `set -e` (exit on error), command substitution behaves unexpectedly'
date: 2026-01-26T00:00:00.000Z
updated: '2026-03-22'
tags:
  - devops
  - bash
  - shell-scripting
category: devops
draft: false
lang: en
references:
  - url: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html'
    title: The Set Builtin — Bash Reference Manual
    type: official
source_content_hash: 1fa83f639be79165a2b72592eef9ff3758ee16215ba8bd3273c32e19dfc90946
expanded: true
---

I was writing an `entrypoint.sh` for an Airflow Docker container and added `set -e` at the top for safety — exit immediately if any command fails. Then I wrote careful error handling for the AWS CLI calls, with custom error messages explaining what went wrong and which IAM permissions were needed. None of those error messages ever appeared. The script silently exited before reaching them.

The culprit is an interaction between `set -e` and command substitution that's well-documented but consistently surprising: when a command inside `$(...)` fails, `set -e` terminates the script at that line. Your `if` check on the next line never runs.

## The Problem

```bash
set -e

# This EXITS IMMEDIATELY on failure - custom message never shown
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "Custom error message"  # Never reached!
    exit 1
fi
```

With `set -e` active, if `aws sts get-caller-identity` fails (wrong credentials, no network, missing CLI), the script exits at the assignment line. The variable is never set, the `if` check never runs, and the user sees a generic error from `set -e` instead of your helpful message.

## The Fix

Wrap the command substitution in an `if` statement. The `if` keyword "consumes" the exit status, preventing `set -e` from triggering:

```bash
set -e

# This CAPTURES the failure and allows custom error message
if ! AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null); then
    echo "✗ Failed to get AWS account ID. Check AWS CLI configuration."
    echo "  Required permission: sts:GetCallerIdentity"
    exit 1
fi

# Also check for empty result (command succeeded but returned nothing)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "✗ AWS account ID is empty. Check IAM role/credentials."
    exit 1
fi
```

The `2>/dev/null` suppresses stderr from the AWS CLI, so the user only sees your custom message instead of a raw error dump.

## Why This Works

The behavior comes from how Bash defines "exit on error." Per the Bash manual, `set -e` does NOT trigger when the failing command is part of an `if` condition, a `while`/`until` condition, or part of a `&&`/`||` list. The `if` statement explicitly tells Bash "I'm handling this exit status" — so `set -e` stands down.

| Pattern           | set -e Behavior              | Custom Message |
| ----------------- | ---------------------------- | -------------- |
| `VAR=$(cmd)`      | Exits immediately on failure | Never shown    |
| `if ! VAR=$(cmd)` | Failure captured by if       | Shown          |

Note that the variable assignment still works inside the `if` condition — `AWS_ACCOUNT_ID` gets set to the command's output on success, or remains empty on failure.

## The Two-Check Pattern

The `if ! VAR=$(cmd)` pattern handles command failure (non-zero exit), but there's a second failure mode: the command succeeds (exit 0) but returns empty output. That's why you need two checks:

1. `if ! VAR=$(cmd)` — catches command failure
2. `if [ -z "$VAR" ]` — catches empty output

Both are needed for robust error handling in production scripts.

## When to Use Which

| Scenario                          | Recommended Pattern         |
| --------------------------------- | --------------------------- |
| Quick scripts, no custom errors   | `VAR=$(cmd)` is fine        |
| Production scripts with `set -e`  | Use `if ! VAR=$(cmd)`       |
| Need to distinguish failure types | Use if-pattern + check `-z` |

For throwaway scripts, the plain `VAR=$(cmd)` pattern is fine — `set -e` gives you a reasonable safety net. But for production entrypoint scripts, CI scripts, or anything where users need actionable error messages, always use the if-pattern.

## Takeaway

When combining `set -e` with command substitution, custom error messages after `VAR=$(cmd)` will never execute on failure. Wrap the substitution in `if ! VAR=$(cmd)` to capture the failure and show your own error message. This is especially important in Docker entrypoint scripts and CI pipelines where helpful error output saves debugging time.

## References

- [Bash Reference Manual — The Set Builtin](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html)

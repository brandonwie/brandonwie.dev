---
title: Bash set -e and Command Substitution
description: 'When using `set -e` (exit on error), command substitution behaves unexpectedly'
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
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
source_content_hash: c8c5c88d1d49da888c5b390dd02454791072c9b2c487f9765c17e79b51427b25
---

with custom error messages.

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

With `set -e`, if the command inside `$(...)` fails, the script exits
immediately at that line. Your custom error handling code is never executed.

## The Solution

Use the if-pattern to capture both success and failure:

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

## Why This Works

| Pattern           | set -e Behavior              | Custom Message |
| ----------------- | ---------------------------- | -------------- |
| `VAR=$(cmd)`      | Exits immediately on failure | Never shown    |
| `if ! VAR=$(cmd)` | Failure captured by if       | Shown          |

The `if` statement "consumes" the exit status, preventing `set -e` from
triggering.

## Key Points

- `set -e` exits on any command failure
- Command substitution `$(...)` is a command
- `if` statements prevent `set -e` from triggering on their condition
- Always use if-pattern when you need custom error messages

## When to Use

| Scenario                          | Recommended Pattern         |
| --------------------------------- | --------------------------- |
| Quick scripts, no custom errors   | `VAR=$(cmd)` is fine        |
| Production scripts with `set -e`  | Use `if ! VAR=$(cmd)`       |
| Need to distinguish failure types | Use if-pattern + check `-z` |

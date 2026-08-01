---
title: Bash set -e와 명령어 치환
description: 'set -e(에러 시 종료)를 사용할 때, 명령어 치환이 커스텀 에러 메시지와 함께 예상과 다르게 동작하는 경우.'
date: 2026-01-26T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - bash
  - shell-scripting
category: devops
draft: false
lang: ko
source_lang: en
source_slug: bash-set-e-command-substitution
source_updated: '2026-08-02'
translation_date: '2026-03-04'
references:
  - url: 'https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html#set'
    title: 'POSIX.1-2024 Shell Command Language — the set special built-in (-e)'
    type: official
  - url: 'https://man7.org/linux/man-pages/man1/bash.1.html'
    title: 'bash(1) manual page — set -e (errexit)'
    type: authoritative
  - url: 'https://mywiki.wooledge.org/BashFAQ/105'
    title: "Greg's Wiki, BashFAQ 105 — Why doesn't set -e do what I expected?"
    type: authoritative
---

## 문제

```bash
set -e

# 실패 시 즉시 종료 - 커스텀 메시지가 절대 표시되지 않아요
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "Custom error message"  # 여기에 도달하지 않아요!
    exit 1
fi
```

`set -e`에서는 `$(...)` 안의 명령이 실패하면 스크립트가 그 줄에서 즉시 종료돼요. 커스텀 에러 처리 코드가 실행될 일이 없어요.

## 해결 방법

if 패턴을 사용해서 성공과 실패를 모두 캡처하면 돼요.

```bash
set -e

# 실패를 캡처하고 커스텀 에러 메시지를 표시할 수 있어요
if ! AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null); then
    echo "✗ Failed to get AWS account ID. Check AWS CLI configuration."
    echo "  Required permission: sts:GetCallerIdentity"
    exit 1
fi

# 빈 결과도 확인 (명령은 성공했지만 아무것도 반환하지 않은 경우)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "✗ AWS account ID is empty. Check IAM role/credentials."
    exit 1
fi
```

## 왜 동작하나

| 패턴              | set -e 동작       | 커스텀 메시지 |
| ----------------- | ----------------- | ------------- |
| `VAR=$(cmd)`      | 실패 시 즉시 종료 | 표시 안 됨    |
| `if ! VAR=$(cmd)` | if가 실패를 캡처  | 표시됨        |

`if` 문이 종료 상태를 "소비"해서 `set -e`가 트리거되는 걸 막아요. `bash(1)` man page와 POSIX 모두 같은 예외를 명시해요. `if`나 `elif` 뒤의 test, `while`/`until` 뒤의 list, `&&`/`||` list에서 마지막이 아닌 명령, 그리고 `!`로 반전된 명령에서는 `-e`가 무시돼요.

반대 방향은 헷갈리기 쉬워요. 명령어 치환 자체가 `set -e`를 발동시키는 건 아니에요. POSIX는 word expansion 중에 실행된 command substitution subshell의 실패로는 셸이 종료되지 않는다고 못박고 있고, 실제로 `echo $(false) two`는 여전히 `two`를 출력해요. `VAR=$(cmd)`가 다른 이유는, command name이 없는 simple command는 마지막 command substitution의 종료 상태를 그대로 자기 종료 상태로 갖기 때문이에요. 실패한 명령은 치환이 아니라 assignment 자체이고, 그 상태를 받아주는 곳이 없는 거예요.

## 핵심 포인트

- `set -e`는 모든 명령 실패 시 종료해요
- 명령어 치환 `$(...)`도 명령이에요
- `if` 문은 조건부의 `set -e` 트리거를 방지해요
- 커스텀 에러 메시지가 필요하면 항상 if 패턴을 사용하면 돼요

## 언제 사용하면 좋을까

| 시나리오                            | 추천 패턴              |
| ----------------------------------- | ---------------------- |
| 간단한 스크립트, 커스텀 에러 불필요 | `VAR=$(cmd)`로 충분    |
| `set -e`를 쓰는 프로덕션 스크립트   | `if ! VAR=$(cmd)` 사용 |
| 실패 유형 구분 필요                 | if 패턴 + `-z` 체크    |

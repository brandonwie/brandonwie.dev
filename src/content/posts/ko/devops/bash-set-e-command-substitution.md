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

`set -e`가 켜진 상태에서 `aws sts get-caller-identity`가 실패하면(자격 증명 오류, 네트워크 단절, CLI 미설치) 스크립트는 그 assignment 줄에서 종료돼요. 변수는 설정되지 않고, `if` 체크는 실행되지 않고, 사용자는 준비해 둔 메시지 대신 `set -e`가 내는 일반적인 에러만 보게 돼요.

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

- `set -e`는 명령이 실패하면 종료하지만 예외가 있어요. `if`/`elif` 뒤의 test,
  `while`/`until` 뒤의 list, `&&`/`||` list에서 마지막이 아닌 명령, `!`로 반전된
  명령은 해당하지 않아요
- 종료를 부르는 건 명령어 치환 자체가 아니라 `VAR=$(cmd)`라는 assignment의 종료
  상태예요. `echo $(false) two`는 `set -e` 아래에서도 여전히 `two`를 출력해요
- `if`로 감싸면 그 종료 상태를 `if`가 소비하기 때문에 `set -e`가 발동하지 않아요
- 커스텀 에러 메시지가 필요하면 if 패턴과 `-z` 체크를 같이 쓰면 돼요. 앞의 것은
  명령 실패를, 뒤의 것은 성공했지만 빈 출력이 온 경우를 잡아 줘요

## 언제 사용하면 좋을까

| 시나리오                            | 추천 패턴              |
| ----------------------------------- | ---------------------- |
| 간단한 스크립트, 커스텀 에러 불필요 | `VAR=$(cmd)`로 충분    |
| `set -e`를 쓰는 프로덕션 스크립트   | `if ! VAR=$(cmd)` 사용 |
| 실패 유형 구분 필요                 | if 패턴 + `-z` 체크    |

## 참고 자료

- [POSIX.1-2024 Shell Command Language — `set` special built-in](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html#set)
  — `-e`가 무시되는 경우를 나열하고, word expansion 중 실행된 command
  substitution subshell의 실패로는 셸이 종료되지 않는다고 명시해요.
  `set -e; echo $(false; echo one) two`가 `two`를 출력한다는 예시도 그대로 있어요
- [`bash(1)` manual page — `set -e` (errexit)](https://man7.org/linux/man-pages/man1/bash.1.html)
  — 같은 예외 목록을 bash 쪽 표현으로 정리해 둔 문서예요
- [Greg's Wiki, BashFAQ 105 — Why doesn't `set -e` do what I expected?](https://mywiki.wooledge.org/BashFAQ/105)
  — `set -e`가 직관과 어긋나는 사례들을 모아 둔 글이에요

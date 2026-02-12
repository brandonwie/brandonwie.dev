---
title: "Claude Code 스킬에서 zsh 백틱 평가 문제"
description: "SKILL.md 파일의 백틱 마크다운 포맷이 zsh 명령어 치환 에러를 일으키는 문제와 해결법을 정리했어요."
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-09T00:00:00.000Z
tags:
  - general
  - claude-code
  - zsh
  - debugging
category: general
draft: false
lang: ko
source_lang: en
source_slug: zsh-backtick-eval-in-skills
source_updated: "2026-02-09"
translation_date: "2026-02-12"
references:
  - url: null
    title: Backtick eval error in wrap SKILL.md
    type: experience
  - url: "https://zsh.sourceforge.io/Doc/Release/Expansion.html"
    title: Zsh Command Substitution and Expansion
    type: official
  - url: "https://docs.anthropic.com/en/docs/claude-code/skills"
    title: Claude Code Skills Documentation
    type: official
---

`command not found: fixed` 에러를 보고 20분 동안 멍하니 있었어요. `/wrap` 스킬이 며칠 동안 잘 돌아가다가 갑자기 zsh가 SKILL.md 파일의 마크다운 포맷팅을 명령어라고 불평하기 시작한 거예요. 원인은 백틱이었어요 -- 마크다운에서는 인라인 코드에 쓰이고, zsh에서는 명령어 치환에 쓰이는 같은 문자요.

## 왜 중요한가

Claude Code 스킬은 SKILL.md 파일의 내용을 읽어서 셸 환경을 통해 전달하는 방식으로 로드돼요. 스킬 파일에 백틱으로 감싼 텍스트가 있으면, zsh는 마크다운 포맷팅으로 보지 않아요. 명령어 치환 문법으로 인식하는 거예요. 셸이 백틱을 짝지어서 그 사이의 내용을 실행하려고 시도하고, 실제 코드와는 전혀 관련 없는 에러가 나와요.

특히 까다로운 건 이 에러가 치명적이지 않다는 점이에요. 스킬은 여전히 로드되고, 출력도 대부분 정상이지만, 매번 호출할 때마다 stderr 노이즈가 쌓여서 터미널이 지저분해지고 진짜 문제를 찾기 어려워져요.

## 문제를 일으킨 코드

제 `/wrap` 스킬을 깨뜨린 정확한 마크다운이에요:

```text
entry type: `+` (added), `~` (changed),
   `-` (removed), `!` (fixed)
3. Add entry to `{PATH}/CHANGELOG.md`:
```

그리고 zsh가 내뱉은 에러:

```text
(eval):1: command not found: fixed
(eval):2: command not found: 3.
```

`(eval)` 접두사가 핵심 단서예요. zsh의 `eval` 빌트인이 텍스트를 처리하고 있다는 뜻이지, 일반적인 명령어 실행이 아니에요.

## zsh가 이걸 어떻게 해석하는지

zsh가 무엇을 보는지 단계별로 따라가 볼게요. `!` 앞의 백틱을 만나면 닫는 백틱을 찾기 시작해요. `(fixed)` 앞의 백틱을 찾으면 이제 zsh는 `(changed),\n   `와 주변 텍스트를 포함하는 명령어 치환을 갖게 돼요.

닫는 백틱 뒤의 `(fixed)`는 서브셸 명령어로 해석돼요. zsh가 `fixed`를 프로그램으로 실행하려 하는데 -- 존재하지 않으니 `command not found: fixed`가 나오는 거예요.

그다음 줄의 `3.`도 또 다른 명령어로 처리돼요. 같은 결과예요.

핵심 포인트:

- 마크다운의 백틱 쌍이 zsh에서는 명령어 치환 구분자가 돼요
- 닫는 백틱 뒤의 `(text)`는 서브셸로 해석돼요
- 에러의 `(eval)` 접두사는 항상 zsh의 eval 빌트인이 원인이라는 뜻이에요
- 이 에러들은 치명적이지 않지만 매번 스킬 호출할 때 stderr 노이즈를 만들어요

## 해결 방법

셸에 민감한 문자가 포함된 텍스트에서 백틱 포맷팅을 제거하세요. 일반 텍스트나 다른 포맷팅 방식을 사용하면 돼요:

```text
# Before (breaks)
`!` (fixed)

# After (works)
fixed = !
```

일반 규칙은 이래요: `!`, `$`, `(`, `)` 같은 문자를 백틱으로 감싸면서 뒤에 셸 문법으로 해석될 수 있는 텍스트가 오는 걸 피하세요.

## 실전 정리

Claude Code SKILL.md 파일을 작성하다가 갑자기 `(eval): command not found` 에러가 나오면, 백틱 포맷팅부터 확인하세요. 해결법은 항상 포맷팅을 단순화하는 거예요 -- 셸에 민감한 문자가 포함된 내용에는 인라인 코드 백틱 대신 일반 텍스트를 사용하면 돼요.

이건 SKILL.md 파일에만 해당하는 문제예요. 셸 평가를 통해 처리되기 때문이에요. 브라우저에서 렌더링되는 일반 마크다운 파일에는 영향이 없어요.

---
title: Claude Code PostToolUse Hooks
description: >-
  PostToolUse hook은 도구 실행 완료 후 발생하며, stdin으로 세션 정보, 도구 이름, 입력, 결과, 작업 디렉토리가 포함된
  JSON을 받습니다.
date: 2026-02-09T00:00:00.000Z
updated: 2026-02-25T00:00:00.000Z
tags:
  - devops
  - claude-code
  - hooks
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-code-posttooluse-hooks
source_updated: '2026-03-22'
translation_date: '2026-02-25'
references:
  - url: 'https://docs.anthropic.com/en/docs/claude-code/hooks'
    title: Claude Code Hooks 공식 문서
    type: official
---

Claude Code의 어떤 skill을 실제로 사용하고 있는지 알고 싶었습니다. 감이
아니라 실제 데이터로요. Claude Code의 hook 시스템은 도구 실행 완료 후 임의의
코드를 실행할 수 있게 해줘서, skill 호출을 카운트하고 결과를 JSON 파일에
기록하는 경량 트래커를 만들었습니다.

## 이게 왜 중요한가요

Claude Code는 특정 라이프사이클 이벤트에서 발동하는 사용자 정의 hook을
지원합니다. PostToolUse hook은 도구 실행 완료 후 발동하며, stdin으로 세션 ID,
도구 이름, 입력, 결과, 작업 디렉토리가 포함된 JSON 페이로드를 받습니다. 이를
통해 자동화 가능성이 열립니다: 편집 후 코드 포매팅, 파일 쓰기 후 린터 실행,
사용 패턴 추적 등이 가능해요.

hook 시스템은 강력하지만 실전 패턴에 대한 문서가 부족합니다. stdin 스키마와
matcher 동작을 이해하면 실질적인 생산성 향상을 얻을 수 있습니다.

## PostToolUse Hook 동작 방식

Claude Code가 도구 실행을 마치면 PostToolUse 이벤트를 발생시킵니다. matcher
regex가 `tool_name`과 매칭되는 모든 hook이 실행됩니다. hook은 stdin으로 이
JSON 페이로드를 받습니다:

```json
{
  "session_id": "abc123",
  "tool_name": "Skill",
  "tool_input": { "skill": "wrap", "args": "..." },
  "tool_result": "...",
  "cwd": "/current/dir",
  "hook_event_name": "PostToolUse"
}
```

matcher는 `tool_name`에 대해 테스트되는 regex입니다. `^Skill$`을 사용하면
skill과 command 호출을 처리하는 Skill 도구만 매칭됩니다. 여러 PostToolUse
항목이 설정에 공존할 수 있으며, 매칭되는 항목은 모두 실행됩니다.

hook 명령은 사용자의 shell에서 실행됩니다(macOS에서는 zsh, Linux에서는 bash).
항상 명령 뒤에 `|| true`를 추가해서 hook 실패가 Claude Code 실행을 차단하지
않도록 해야 합니다.

## Skill 사용 추적 구현

제가 사용하는 패턴입니다. `^Skill$` matcher를 가진 PostToolUse hook이 Python
스크립트를 트리거하고, 스크립트가 stdin JSON을 읽어서 `tool_input.skill`에서
skill 이름을 추출한 뒤 persistent JSON 파일에서 카운터를 증가시킵니다.

skill별로 `count`, `first_used`, `last_used` 세 가지 필드를 추적합니다:

```python
# ~/.claude/scripts/track-skill-usage.py
data = json.load(sys.stdin)
skill = data.get("tool_input", {}).get("skill", "")
usage[skill]["count"] += 1
usage[skill]["last_used"] = today
```

`~/.claude/skill-usage.json`에 저장되는 결과 파일은 이렇게 생겼습니다:

```json
{
  "wrap": {
    "count": 5,
    "first_used": "2026-02-09",
    "last_used": "2026-02-09"
  }
}
```

며칠간 평소처럼 사용하면, 이 파일이 실제로 어떤 skill에 의존하고 있는지, 어떤
것은 전혀 쓰지 않는지, 각 skill을 언제 처음 사용했는지 정확히 알려줍니다.
전체 이벤트 로깅의 경량 대안입니다.

## 주의사항

- **Hook은 병합이지 대체가 아닙니다:** Claude Code는 모든 설정 레이어(전역
  `~/.claude/settings.json` + 프로젝트 `settings.local.json`)의 hook을
  **병합**합니다. 같은 matcher + 스크립트가 양쪽에 있으면 도구 호출 한 번에
  **두 번** 실행돼요. 프로젝트 레벨이 전역을 덮어쓸 수 있는 permission과는
  다릅니다. hook은 양쪽 모두 항상 실행됩니다.
- **이중 카운팅 함정:** `^Skill$` → `track-skill-usage.py` hook이 전역과 프로젝트
  설정 양쪽에 있으면 skill 호출마다 카운터가 두 번 증가합니다. 기존 카운트가
  약 2배로 부풀어요. 해결법은 hook을 전역 설정에만 두고 프로젝트
  `settings.local.json`에서는 제거하는 것입니다.
- **실행 권한은 선택사항입니다:** `python3 ~/.claude/scripts/script.py`로 호출하는
  hook 스크립트는 실행 권한이 필요 없어요. shebang은 장식입니다. 다만 일관성과
  직접 실행을 위해 `chmod +x`를 설정해 두는 게 좋습니다.

## 설계 결정

이벤트 로그 대신 카운터 기반 접근 방식을 선택했습니다. skill 호출 횟수에
상관없이 파일 크기가 O(1)로 유지됩니다. 빈도 분석에는 카운트만으로 충분해요.
매 개별 호출의 타임스탬프는 필요 없습니다.

안전 장치를 이중으로 두었습니다. hook 명령의 `|| true`로 shell이 절대 실패를
보고하지 않게 하고, Python 스크립트의 bare `except: pass`로 스크립트 자체가
절대 크래시하지 않게 합니다. hook은 Claude Code를 절대 차단해서는 안 됩니다.
멈추거나 에러를 내는 hook은 전체 워크플로우를 방해합니다.

스크립트는 Python 표준 라이브러리만 사용합니다(json, sys, os). 외부 의존성
설치가 필요 없어요. `~/.claude/scripts/`(실행 위치)와
`global-claude-setup/scripts/`(부트스트랩 저장소)에 모두 존재하므로 여러
머신에서 이식 가능합니다.

## 실전 팁

PostToolUse hook은 Claude Code가 동작을 수행한 후 자동화해야 할 모든 것의
확장 포인트입니다. 패턴은 항상 동일합니다: matcher regex를 정의하고, stdin
JSON을 읽는 스크립트를 작성하고, 작업을 수행하고, 조용히 실패하게 합니다.

skill 사용 추적, 자동 포매팅, 린팅, 알림 등 모든 실행 후 자동화에 활용할 수
있습니다. 핵심 제약은 hook이 빠르고 절대 시끄럽게 실패하면 안 된다는
것입니다. `|| true`를 추가하고 예외를 넓게 처리하세요.

Claude Code 동작 후 매번 수동으로 하는 일이 있다면, 그건 hook으로 만들어야 할
작업입니다.

---
title: Claude Code PostToolUse Hooks
description: >-
  PostToolUse hook은 도구 실행이 끝난 뒤 발동해요. session 정보, 도구 이름, 입력값, 결과, 작업 디렉토리가 들어 있는
  JSON을 stdin으로 받아요.
date: 2026-02-09T00:00:00.000Z
updated: '2026-03-22'
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
translation_date: '2026-05-10'
references:
  - url: 'https://docs.anthropic.com/en/docs/claude-code/hooks'
    title: Claude Code Hooks 공식 문서
    type: official
---

Claude Code에서 어떤 skill을 가장 자주 쓰고 있는지 알고 싶었어요. 청구 때문이 아니라, 어떤 워크플로가 다듬을 가치가 있는지 추리려는 거였어요. Claude Code의 hook 시스템에는 도구 호출이 끝날 때마다 발동하는 PostToolUse 이벤트가 있어요(skill 호출 포함). Python 스크립트 하나 쓰고 hook으로 연결해서, 의존성 없는 가벼운 사용량 트래커를 만들었어요.

## PostToolUse Hook이 동작하는 방식

PostToolUse hook은 도구 실행이 끝난 뒤 발동해요. Claude Code가 hook 스크립트의 stdin으로 JSON 페이로드를 넘겨주는데, 무슨 일이 있었는지 식별할 정보가 다 들어 있어요:

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

`tool_name` 필드가 어떤 도구였는지 알려줘요. skill 호출의 경우 `tool_name`은 `"Skill"`이고, 구체적인 skill 이름은 `tool_input.skill`에 들어 있어요. hook 설정의 matcher는 `tool_name`에 대해 테스트하는 regex예요 — 그래서 `^Skill$`는 skill 호출만 매칭해요. `Read`나 `Write` 같은 다른 도구는 빠져요.

## Skill 사용량 트래커

패턴은 이래요. matcher가 `^Skill$`인 PostToolUse hook이 Python 스크립트를 부르고, 스크립트가 stdin JSON을 읽어서 skill 이름을 뽑아낸 뒤 persistent JSON 파일의 카운터를 1 올려요.

```python
# ~/.claude/scripts/track-skill-usage.py
data = json.load(sys.stdin)
skill = data.get("tool_input", {}).get("skill", "")
usage[skill]["count"] += 1
usage[skill]["last_used"] = today
```

출력 파일(`~/.claude/skill-usage.json`)은 skill별로 count, 첫 사용일, 마지막 사용일을 추적해요:

```json
{
  "wrap": {
    "count": 5,
    "first_used": "2026-02-09",
    "last_used": "2026-02-09"
  }
}
```

카운터 기반이라 skill을 몇 번 호출하든 파일 크기가 O(1)로 유지돼요. 로그 기반이었다면 파일이 끝없이 커졌을 거예요.

## 함정들

미리 알았으면 좋았을 것들이에요:

**Hook은 병합돼요. 덮어쓰지 않아요.** Claude Code는 모든 설정 레이어(전역 `~/.claude/settings.json` + 프로젝트 `settings.local.json`)의 hook을 **병합해요**. 같은 matcher와 스크립트가 양쪽에 다 있으면, 도구 호출 한 번에 **두 번** 발동해요. permission과는 달라요 — permission은 프로젝트 레벨이 전역을 덮어쓸 수 있지만, hook은 양쪽 다 항상 발동해요.

**이중 카운팅 함정.** `^Skill$` → `track-skill-usage.py` hook이 전역과 프로젝트 양쪽에 있으면, skill을 한 번 호출할 때마다 카운터가 2씩 올라가요. 기존에 쌓인 수치도 약 2배로 부풀어 있을 거예요. 해결법은 hook을 전역 설정에만 두고, 프로젝트 `settings.local.json`에서는 빼는 거예요.

**실행 권한은 선택이에요(그래도 줘 두세요).** `python3 ~/.claude/scripts/script.py`로 부르는 hook 스크립트는 실행 권한이 필요 없어요. Python이 파일을 직접 읽으니까요. 이 경우 shebang은 장식이에요. 그래도 일관성 측면에서, 그리고 직접 호출할 일이 생길 수 있으니 `chmod +x`는 줘 두세요.

## 설계 결정

이 구현에서 의도한 선택 몇 가지:

- **로그 말고 카운터** — 빈도 분석에는 O(1) 파일 크기로 충분해요. 호출 하나하나 기록할 필요 없어요.
- **이중 안전장치** — hook 명령에 `|| true`, Python 쪽에 빈 `except: pass`. 두 겹으로 막아서 hook이 Claude를 절대 막지 못하게 해요. 실패하는 hook은 사용자 눈에 안 보여야 해요.
- **무의존성** — Python 표준 라이브러리(`json`, `sys`, `os`)만 써요. pip install도, 가상환경도 필요 없어요.
- **이식성** — 스크립트가 `~/.claude/scripts/`(실행 위치)와 `global-claude-setup/scripts/`(부트스트랩) 양쪽에 있어서, setup만 돌리면 새 머신에서도 바로 써요.

## 핵심 포인트

- matcher는 `tool_name`에 대해 테스트하는 regex — skill 호출만 잡으려면 `^Skill$`
- PostToolUse 항목이 여러 개 있어도 돼요. 매칭되는 건 전부 발동해요
- hook 명령은 사용자 shell에서 실행돼요(macOS면 zsh)
- 항상 `|| true`를 붙여서 hook 실패가 Claude를 막지 않게 하세요
- 병합으로 인한 이중 발동을 피하려면 hook은 한쪽 설정에만 두세요

## 정리

PostToolUse hook은 Claude Code의 도구 실행 라이프사이클에 프로그램으로 끼어들 수 있는 지점이에요. 패턴은 단순해요: `tool_name`에 regex matcher, stdin에서 JSON을 읽는 스크립트, 그리고 실패가 Claude를 막지 못하게 `|| true`. 가장 큰 함정은 hook 병합이에요 — 전역과 프로젝트 hook은 쌓이는 거지, 덮어쓰는 게 아니에요. 이중 카운팅을 피하려면 hook은 한 레이어에만 두세요.

## References

- [Claude Code Hooks 공식 문서](https://docs.anthropic.com/en/docs/claude-code/hooks)

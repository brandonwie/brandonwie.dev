---
title: "Claude Code: 공유 + 개인 AI 설정 패턴"
description: >-
  AI 지시사항을 커밋되는 공유 레이어와 gitignore되는 개인 레이어로 분리해서
  새 개발자는 즉시 AI 지시사항을 사용하고 기존 개발자는 개인 확장을
  유지하는 패턴입니다.
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - devops
  - claude-code
  - ai-config
  - onboarding
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-code-shared-personal-config
source_updated: 2026-02-04T00:00:00.000Z
translation_date: "2026-02-12"
references:
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code 공식 문서
    type: official
---

새 개발자가 팀에 합류해서 백엔드 저장소를 clone했습니다. Claude Code를
실행했는데 프로젝트에 대한 컨텍스트가 전혀 없었어요. 제가 공들여 작성한 AI
지시사항은 개인 지식 베이스에 symlink되어 있었고 전부 gitignore 처리되어
있었습니다. 새 개발자에게는 기본적인 AI 지시사항이 바로 동작하면서도 제 개인
확장은 그대로 유지할 방법이 필요했습니다.

## 이게 왜 중요한가요

AI 코딩 어시스턴트는 프로젝트별 컨텍스트가 있을 때 가장 잘 동작합니다. 코딩
표준, 아키텍처 결정, 선호하는 라이브러리, 배포 패턴 같은 것들이요. 이런
컨텍스트 없이는 Claude Code가 범용적인 답변을 합니다. 문제는 개발자별
커스터마이즈(MCP 서버 설정, 개인 skill 라이브러리, 외부 지식 베이스로의
symlink)가 저장소에 커밋되면 안 된다는 점입니다. 같은 로컬 설정이 없는 다른
개발자에게 문제를 일으킵니다.

해결책은 두 레이어 설정입니다: 커밋되어 모든 개발자에게 견고한 기반을
제공하는 공유 레이어, 그리고 gitignore되어 각 개발자가 팀에 영향 없이 기반을
확장할 수 있는 개인 레이어입니다.

## 아키텍처

분리 구조는 이렇습니다:

```text
Committed (shared)                   Gitignored (personal)
──────────────────                   ─────────────────────
CLAUDE.md          ← source of truth CLAUDE.local.md
AGENTS.md          ← synced copy     .claude/settings.local.json
.claude/prompts/   ← domain context  .claude/skills/
.claude/settings.json                .claude/prompts/*.ko.md
.cursor/rules/index.mdc             .mcp.json
.github/copilot-instructions.md
```

왼쪽은 모두 커밋됩니다. 저장소를 clone한 새 개발자는 전체 프로젝트 컨텍스트가
담긴 CLAUDE.md, 도메인별 지시사항이 있는 프롬프트 파일, 공유 settings.json을
받습니다. 오른쪽은 모두 gitignore됩니다. 개인 확장, 로컬 MCP 설정, 커스텀
skill, 특정 개발자의 머신 설정에 의존하는 모든 콘텐츠입니다.

## 핵심 결정 사항

CLAUDE.md가 단일 진실 소스입니다. 다른 모든 AI 지시사항 파일(AGENTS.md,
Copilot 지시사항, Cursor 규칙)은 `npm run ai:sync`로 이 파일에서 생성됩니다.
이렇게 하면 서로 다른 AI 도구 간의 drift를 방지합니다. 하나의 파일만 편집하면
sync 스크립트가 변경사항을 전파합니다.

공유 설정에서는 MCP 도구 참조가 완화됩니다. 제 개인 설정에는 "문서 조회에
Context7 MCP를 반드시 사용하라"고 되어 있습니다. 공유 설정에는 "Context7 MCP가
설정되어 있으면 문서 조회에 사용하라"고 되어 있어요. MCP 서버를 설정하지 않은
새 개발자가 깨진 지시사항을 보지 않습니다.

개인 전용 콘텐츠는 symlink를 유지합니다. `.claude/skills/` 디렉토리는 제 3B
지식 관리 시스템으로의 symlink입니다. gitignore되어 있어요. 팀에 영향을 주지
않는 개인 확장은 symlink나 `CLAUDE.local.md`에 남겨둡니다.

## Sync 스크립트

`npm run ai:sync`는 CLAUDE.md를 읽어서 세 곳에 씁니다:

- `AGENTS.md` -- Claude Code의 agent 모드용 정확한 복사
- `.github/copilot-instructions.md` -- GitHub Copilot용 정확한 복사
- `.cursor/rules/index.mdc` -- YAML frontmatter가 추가된 Cursor 형식

하나의 소스 파일, 세 개의 소비자, drift 제로입니다.

## Gitignore 패턴

```text
# AI configuration - shared (committed)
# CLAUDE.md, AGENTS.md, .claude/prompts/, .claude/settings.json,
# .cursor/rules/, .github/copilot-instructions.md are tracked

# AI configuration - personal (gitignored)
CLAUDE.local.md
.claude/settings.local.json
.claude/skills
.claude/prompts/*.ko.md
.mcp.json
.claudeignore
```

패턴은 의도적입니다. 특정 개발자의 머신이나 개인 도구를 참조할 수 있는 모든
것은 gitignore됩니다. 프로젝트 자체를 설명하는 모든 것은 커밋됩니다.

## 교차 검증 규율

공유 지시사항을 작성할 때는 다른 개발자에게 동작하지 않을 개인 참조를
주의하세요:

- 하드코딩된 절대 경로 (`/Users/username/...`)
- assignee 필드의 개인 사용자명
- gitignore된 스크립트나 폴더 참조
- "if configured" 가드 없는 MCP 도구 참조

커밋 전에 공유 지시사항에서 사용자명과 홈 디렉토리 경로를 검색해 봅니다.
둘 중 하나라도 나타나면 개인 레이어에 속하는 것입니다.

## 실전 팁

이 패턴은 최소 한 명의 개발자가 개인 커스터마이즈와 함께 AI 코딩 도구를
사용하는 팀 프로젝트에 적용하세요. 공유 레이어는 새 개발자가 AI 어시스턴트를
즉시 활용할 수 있게 합니다. 개인 레이어는 파워 유저가 제약 없이 확장할 수
있게 합니다.

핵심 인사이트는 CLAUDE.md(또는 주요 AI 지시사항 파일이 무엇이든)가 프로젝트를
설명해야지 개발자를 설명하면 안 된다는 점입니다. 개발자별 콘텐츠는
로컬/gitignore 레이어에, 프로젝트별 콘텐츠는 커밋 레이어에 둡니다. 이 두
관심사를 분리하면 온보딩이 수월해집니다.

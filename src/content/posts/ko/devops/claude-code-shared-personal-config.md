---
title: "Claude Code: 공유 + 개인 AI 설정 패턴"
description: >-
  AI 지시사항을 커밋되는 공유 레이어와 gitignore되는 개인 레이어로 분리해서
  새 개발자는 즉시 AI 지시사항을 사용하고 기존 개발자는 개인 확장을
  유지하는 패턴입니다.
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-23T00:00:00.000Z
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
source_updated: "2026-02-23"
translation_date: "2026-02-25"
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

AI 어시스턴트는 처음에 어떤 컨텍스트를 받느냐에 따라 유용함이 달라집니다.
CLAUDE.md가 gitignore되어 로컬 환경에만 존재한다면 새 개발자는 빈 슬레이트로
시작합니다 -- 프로젝트 컨벤션도, 스택 정보도, 팀 코딩 규칙도 없이요.

동시에, AI 설정의 모든 내용이 팀 전체에 속하는 건 아닙니다. 개인 단축키,
로컬 지식 베이스 참조, 본인만 설치한 MCP 서버 -- 이런 것들은 다른 사람에게는
노이즈입니다. 커밋하면 다른 개발자의 경험을 망가뜨리거나, 본인 머신 밖에서는
의미 없는 경로를 노출시킵니다.

해결책은 두 레이어 설정입니다: 저장소를 clone한 누구에게나 동작하는 공유
레이어, 그리고 gitignore되어 개인이 확장할 수 있는 개인 레이어입니다.

## 아키텍처

Claude Code는 `CLAUDE.md`를 먼저 읽고, 존재하면 `CLAUDE.local.md`를 자동으로
이어 붙입니다. 이 동작이 전체 패턴의 기반입니다.

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

왼쪽은 새 개발자에게 필요한 모든 것입니다: 프로젝트 스택, 핵심 규칙, 도메인
프롬프트, AI 도구 설정. 오른쪽은 개인적인 모든 것입니다: 제 3B 지식 베이스
symlink, 한국어 프롬프트, 로컬 MCP 연결.

## 핵심 결정 사항

### CLAUDE.md를 단일 진실 소스로

AGENTS.md나 Cursor 규칙을 직접 관리하지 않습니다. `npm run ai:sync`로
`CLAUDE.md`에서 생성해요. 프로젝트 컨벤션이 바뀔 때 수정할 파일이 하나뿐이고,
세 AI 도구가 자동으로 동기화됩니다.

이 없으면 drift가 생깁니다. CLAUDE.md는 업데이트하고 AGENTS.md는 잊어버리거나,
Cursor 규칙을 직접 편집해서 Claude가 보는 것과 달라지는 식으로요. sync
스크립트가 이런 오류 유형 자체를 없애줍니다.

### 공유 설정에서는 MCP 규칙을 완화

제 개인 설정에는 "라이브러리 문서 조회에 Context7를 반드시 사용하라"고 되어
있습니다. 공유 설정에는 "설정되어 있으면 Context7를 사용하라"라고 써요. 이
조건이 중요합니다 -- 새 개발자는 아직 Context7나 Postgres MCP를 설정하지 않았을
수 있거든요. 공유 설정에 "반드시 사용하라"를 하드코딩하면 그 개발자에게
혼란스러운 오류가 생깁니다.

원칙은 이렇습니다: 공유 설정은 도구가 사용 가능할 때 무엇을 할지 설명하고,
개인 설정은 도구가 있다고 가정합니다.

### 개인 전용 콘텐츠는 symlink 유지

`.claude/skills/`는 제 3B 지식 베이스로의 symlink입니다. gitignore 상태를
유지합니다. 개인 Claude skill, 한국어 프롬프트, 로컬 도구 참조는
`CLAUDE.local.md`나 gitignore된 폴더에 남겨둡니다. 공유 설정을 건드리지 않고
확장합니다.

## Sync 스크립트

소스 파일 하나, 소비자 셋, drift 제로입니다.

`npm run ai:sync`는 `CLAUDE.md`를 읽어서 씁니다:

- `AGENTS.md` -- 정확한 복사본 (Codex 및 OpenAI 호환 도구용)
- `.github/copilot-instructions.md` -- 정확한 복사본 (GitHub Copilot용)
- `.cursor/rules/index.mdc` -- Cursor YAML frontmatter를 앞에 붙인 버전

스크립트는 의도적으로 단순합니다. Cursor frontmatter 추가 외에는 내용을
변환하지 않아요. CLAUDE.md는 세 도구 모두에서 수정 없이 동작하도록 작성합니다.

컨벤션이 바뀔 때 -- 예를 들어 새 커밋 형식 규칙 -- CLAUDE.md를 업데이트하고,
sync를 실행하고, 네 파일을 함께 커밋합니다. 수동 복사 없이, 어떤 파일이
업데이트됐는지 고민할 필요 없이요.

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

공유 섹션의 코멘트 블록이 중요합니다. `.gitignore`를 읽는 누구에게나 이 파일들이
존재하고 의도적으로 커밋되어 있다는 걸 알려줍니다 -- 실수나 잊혀진 항목이
아니라요. gitignore 섹션은 개인 레이어가 어떻게 생겼는지 보여줍니다.

## SoT 디렉토리 패턴

여러 프로젝트 저장소를 한 곳에서 관리할 때, 두 레이어 분리를 유지하기가
어려워집니다. 특정 저장소의 CLAUDE.md에서 진실 소스는 어떤 파일인가요? 어디서
편집하나요?

제 해결책은 3B 지식 베이스 안에 `project-claude/` 디렉토리를 두는 것입니다:

```text
3b/.claude/project-claude/
├── moba-nestjs.md          # Shared SoT → backend-v2/CLAUDE.md (symlink)
├── moba-nestjs.local.md    # Personal SoT → backend-v2/CLAUDE.local.md (symlink)
├── moba-terraform.md       # Combined (personal-only repo)
├── moba-airflow.md         # Combined (personal-only repo)
└── moba-etl.md             # Combined (personal-only repo)
```

`project-claude/`의 각 파일이 실제 진실 소스입니다. 프로젝트 저장소의 파일은
그것을 가리키는 symlink예요. 한 곳에서 편집하면 두 위치 모두 업데이트됩니다.

다른 팀원이 있는 저장소만 분리를 적용합니다. Terraform, Airflow, ETL 저장소는
개인용이라 팀원도 없고 공유/로컬 구분도 필요 없어요. 하나의 통합 파일로
충분합니다.

## 공유 파일 가드 코멘트

symlink는 편집을 편리하게 만들지만, 동시에 공유 파일에 실수로 개인 내용을
쓰기 쉽게 만들기도 합니다. `moba-nestjs.md`를 열어서 규칙을 추가하다가, 그
파일이 팀 전체가 보는 곳에 바로 sync된다는 걸 잊을 수 있어요.

해결책은 모든 공유 SoT 파일 상단에 가드 코멘트를 다는 것입니다:

```html
<!-- SHARED FILE — This file syncs to backend-v2/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in moba-nestjs.local.md → backend-v2/CLAUDE.local.md -->
```

어떤 내용보다 먼저 나오기 때문에 효과가 있습니다. Claude가 파일을 열든 사람이
열든, 제약이 즉시 눈에 들어옵니다. 별도 설정 파일에 묻혀 있는 규칙은 편집자가
이미 그 파일을 열었을 때만 도움이 됩니다. 파일 자체에 있는 코멘트는 의존성이
없습니다.

공유 파일에 3B buffer 경로를 추가하고 나중에 교차 검증 중에야 발견한 경험에서
배웠습니다.

## Symlink 배포 체인

공유 저장소에서 변경사항은 팀이 보기까지 두 단계를 거칩니다:

```text
project-claude/{name}.md (3B SoT)
  ↓ filesystem symlink
{repo}/CLAUDE.md (Claude Code reads this)
  ↓ npm run ai:sync
AGENTS.md + copilot-instructions.md + cursor rules (team sees)
```

symlink는 모든 도구에 투명합니다. 어느 쪽을 편집해도 같은 파일이 수정됩니다.
SoT의 가드 코멘트가 개인 내용이 두 단계 중 어디서든 새어 나오는 걸 막습니다.

이 체인의 의미는 3B에서 편집하고, 프로젝트 저장소에서 sync하고, 팀이 네
파일에서 결과를 본다는 것입니다. 체인의 어느 부분이라도 끊기면 -- 잘못된 파일
편집, sync 생략, 가드 코멘트 누락 -- 패턴이 망가집니다. 체인을 명시적으로
만들어 두면 그런 빈틈을 발견하기 쉬워집니다.

## 레이어 중복 제거 전략

범용 원칙(5W1H, buffer 형식, `.me.md` 규칙, 커뮤니케이션 스타일)이 여러
프로젝트 CLAUDE.md에 반복되면 drift가 생기고 토큰을 낭비합니다. 해결법은 두
단계 승격입니다.

1. **중복 식별** -- 모든 project-claude 파일에서 반복되는 지시사항을 grep으로
   찾습니다(buffer는 7번, 5W1H는 6번, `.me.md`는 4번 중복되어 있었어요).
2. **전역으로 승격** -- 정본을 `~/.claude/CLAUDE.md`로 옮기고 각 프로젝트
   사본은 한 줄 참조로 대체합니다:
   `Universal principles (...) are in ~/.claude/CLAUDE.md.`

Claude Code의 로딩 계층 구조가 `~/.claude/CLAUDE.md`를 모든 세션에서 항상 먼저
로드하기 때문에 이 방식이 동작해요. 프로젝트 파일은 전역 규칙을 다시 쓸
필요 없이 상속받습니다.

**2026-02-23 구조 조정 결과:**

- 8개 범용 원칙을 전역으로 승격(YAML Frontmatter, Cross-Referencing, 5W1H,
  Decision Documentation, Zettelkasten, `.me.md`, Buffer, Communication Style)
- 7개 프로젝트 파일에서 중복 제거(각각 약 25-35% 토큰 절약)
- markdownlint 예시를 약 330줄에서 28줄 빠른 참조 테이블로 압축
- 모든 세션이 동일한 원칙을 적용하면서 로딩하는 줄 수는 줄었습니다

## 교차 검증 규율

공유 지시사항을 커밋하기 전에 모든 프롬프트 파일과 공유 CLAUDE.md에서 개인
참조를 검색합니다. 다른 개발자에게 문제를 일으키는 항목은 생각보다 많습니다:

- 하드코딩된 절대 경로 (`/Users/username/...`)
- assignee 필드의 개인 사용자명
- gitignore된 스크립트나 폴더 참조
- "if configured" 가드 없는 MCP 도구 참조
- buffer 경로 (`~/dev/personal/3b/.claude/buffer.md`)
- 3B 경로를 가리키는 symlink 문서
- 사용자 컨텍스트 섹션 (레벨, 경력, 역할)

마지막 세 항목은 처음엔 몰랐어요. buffer 경로는 개인 설정에서 복사할 때
몰래 따라옵니다. symlink 문서는 설정을 설명하다 보면 공유 파일에 들어갑니다.
사용자 컨텍스트 섹션 -- "시니어 엔지니어를 돕고 있습니다" -- 은 개인 선호이지
프로젝트 컨벤션이 아니에요.

교차 검증에는 5분이 걸리는데, 팀원을 혼란스럽게 했을 누수를 최소 세 번은
잡았습니다.

## 실전 팁

CLAUDE.md는 프로젝트를 설명해야지 개발자를 설명하면 안 됩니다.

프로젝트 컨벤션, 스택 정보, 핵심 규칙, 도메인 프롬프트 -- 이 모든 건 공유
파일에 속합니다. 개인 단축키, 로컬 경로, MCP 가정 -- 이것들은 CLAUDE.local.md에
들어가고, Claude가 자동으로 이어 붙이고, git은 완전히 무시합니다.

Sync 스크립트가 drift를 처리하고, 가드 코멘트가 실수를 처리하고, SoT
디렉토리가 멀티 레포 관리를 처리해요. 이 세 가지가 합쳐져서 새 개발자에게
첫날부터 동작하는 AI 지시사항을 제공하고, 개인 확장을 방해하지 않아요.

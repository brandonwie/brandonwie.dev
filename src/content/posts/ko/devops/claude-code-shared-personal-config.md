---
title: "Claude Code: 공유 + 개인 AI 설정 패턴"
description: >-
  AI 지시사항을 커밋되는 공유 레이어와 gitignore되는 개인 레이어로 분리해서
  새 개발자는 즉시 AI 지시사항을 사용하고 기존 개발자는 개인 확장을
  유지하는 패턴입니다.
date: 2026-02-04T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
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
source_updated: "2026-03-09"
translation_date: "2026-03-10"
references:
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code 공식 문서
    type: official
---

몇 주에 걸쳐 프로젝트에 맞는 Claude Code 지시사항을 튜닝했어요 -- 커스텀
명령, 도메인별 프롬프트, 코딩 컨벤션까지. 그런데 새 개발자가 팀에 합류해서
저장소를 clone하니 AI 지원이 전혀 없었어요. 설정 전체가 gitignore 처리되어
있었거든요. 개인 지식 관리 시스템으로의 symlink가 포함되어 있었기 때문이에요.

해결책은 두 레이어 아키텍처예요: 새 개발자가 clone하자마자 AI가 동작하도록
공유 지시사항을 저장소에 커밋하고, 기존 개발자의 커스텀 설정은 gitignore된
개인 확장으로 유지하는 방식이에요.

## 문제

Claude Code는 프로젝트 루트의 `CLAUDE.md`와 `.claude/`에서 지시사항을 읽어요.
한 개발자의 설정이 개인 경로나 symlink, 외부 시스템을 참조하면 전체를
gitignore하는 게 당연한 선택이에요. 하지만 그러면 다른 모든 개발자가 빈
슬레이트로 시작하게 돼요.

핵심 과제는 공유 레이어(커밋됨, 모두에게 동작)와 개인 레이어(gitignore됨,
개발자별 커스터마이징)로 분리하되 중복이나 drift 없이 유지하는 거예요.

## 아키텍처

분리 구조는 이렇게 생겼어요:

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

공유 파일에는 새 개발자에게 필요한 모든 게 들어가요: 프로젝트 아키텍처, 코딩
컨벤션, 명령어 레퍼런스, 배포 지시사항. 개인 파일에는 개발자별 선호 설정,
프라이빗 도구 설정, 외부 시스템으로의 symlink가 들어가요.

## 핵심 결정 사항

### CLAUDE.md가 단일 진실 소스

모든 AI 지시사항 파일은 `CLAUDE.md`에서 `npm run ai:sync`로 생성돼요. Claude
Code, Cursor, GitHub Copilot 간의 drift를 방지해요. 하나의 파일만 편집하면
세 도구가 동기화 상태를 유지해요.

### 공유 설정에서 MCP 규칙 완화

개인 설정에는 Context7와 Postgres MCP 서버에 "반드시 사용"이라고 되어 있어요.
공유 설정에는 "설정되어 있으면"으로 대체했어요. 새 개발자가 아직 MCP 서버를
설정하지 않았을 수 있으니까요. 지시사항은 여전히 도구가 뭘 하고 언제 쓰는지
설명하지만, 요구사항을 유보해요.

### 개인 전용 콘텐츠는 symlink 유지

`.claude/skills/`는 제 지식 관리 시스템으로의 symlink(gitignore됨)로 남겨요.
팀에 영향 주지 않는 개인 확장은 symlink나 `CLAUDE.local.md`에 유지해요. 기준은
명확해요: 모두에게 도움이 되면 커밋하고, 본인 환경에 특화된 거면 gitignore해요.

## Sync 스크립트

`npm run ai:sync`는 `CLAUDE.md`를 읽어서 세 대상에 써요:

- `AGENTS.md` (정확한 복사본)
- `.github/copilot-instructions.md` (정확한 복사본)
- `.cursor/rules/index.mdc` (Cursor YAML frontmatter + 내용)

`CLAUDE.md`를 편집한 후 스크립트를 실행하면 세 파일이 동기화돼요. 수동 복사도,
어떤 파일을 업데이트해야 하는지 잊을 일도 없어요.

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

새 개발자가 저장소를 clone하면 공유 설정이 바로 제공돼요. 개인 파일은 저장소에
절대 들어가지 않아요.

## SoT 디렉토리 패턴 (project-claude/)

여러 프로젝트에 걸쳐 공유/개인 분리를 관리하는 건 금방 복잡해져요. 해결책은
중앙 진실 소스 디렉토리를 두고 각 프로젝트 저장소에 symlink를 거는 거예요:

```text
3b/.claude/project-claude/
├── moba-nestjs.md          # Shared SoT → backend-v2/CLAUDE.md (symlink)
├── moba-nestjs.local.md    # Personal SoT → backend-v2/CLAUDE.local.md (symlink)
├── moba-nestjs.mcp.json    # MCP SoT → backend-v2/.mcp.json (symlink)
├── moba-terraform.md       # Combined (personal-only repo)
├── moba-terraform.mcp.json # MCP SoT → backend-infra/.mcp.json (symlink)
├── moba-airflow.md         # Combined (personal-only repo)
├── moba-etl.md             # Combined (personal-only repo)
├── crucio.mcp.json         # MCP SoT → crucio/.mcp.json (symlink)
└── ...
```

다른 팀원이 있는 저장소만 공유/로컬 분리를 적용해요. 개인 전용 저장소는 하나의
통합 파일로 충분해요. `.mcp.json`도 같은 패턴을 따라요 -- 지식 베이스가 정본을
보관하고 프로젝트 저장소는 symlink를 받아요. Sentry와 Notion MCP 서버는
`.mcp.json`에서 제거했는데, 설정이 필요 없고 OAuth를 네이티브로 처리하는
Anthropic 호스팅 통합으로 대체했기 때문이에요.

## 공유 파일 가드 코멘트

이 패턴에서 가장 흔한 실수는 공유 파일에 개인 내용을 넣는 거예요. 각 공유
SoT 파일 상단에 HTML 코멘트를 달면 이를 방지할 수 있어요:

```html
<!-- SHARED FILE — This file syncs to {repo}/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in {name}.local.md → {repo}/CLAUDE.local.md -->
```

작성 시점의 가드레일로 작동해요. Claude(또는 사람)가 편집 전에 제약을 바로
확인해요. 별도 파일에 있는 규칙보다 효과적인데, 편집자가 그 규칙을 미리
로드했을 필요가 없기 때문이에요.

## Symlink 배포 체인

공유 저장소에서 배포는 두 단계를 거쳐요:

```text
project-claude/{name}.md (3B SoT)
  ↓ filesystem symlink
{repo}/CLAUDE.md (Claude Code reads this)
  ↓ npm run ai:sync
AGENTS.md + copilot-instructions.md + cursor rules (team sees)
```

SoT의 가드 코멘트가 개인 내용이 두 단계 중 어디서든 새어 나오는 걸 막아요.
symlink는 모든 도구에 투명해서, 어느 쪽을 편집해도 같은 파일이 수정돼요.

## 레이어 중복 제거 전략

여러 프로젝트에 공유 설정을 세팅하고 나니 새로운 문제가 생겼어요: 동일한 범용
원칙(5W1H 문서화, buffer 형식, `.me.md` 규칙, 커뮤니케이션 스타일)이 모든
프로젝트 `CLAUDE.md`에 복사-붙여넣기 되어 있었어요. 시간이 지나면서 drift가
생기고 중복 지시사항으로 토큰을 낭비했어요.

해결책은 두 단계 승격이에요:

1. **중복 식별** -- 모든 project-claude 파일에서 반복되는 지시사항을 grep으로
   찾아요(buffer는 7번, 5W1H는 6번, `.me.md`는 4번 중복되어 있었어요)
2. **전역으로 승격** -- 정본을 `~/.claude/CLAUDE.md`로 옮기고 각 프로젝트
   사본은 한 줄 참조로 대체해요:
   `Universal principles (...) are in ~/.claude/CLAUDE.md.`

Claude Code의 로딩 계층 구조가 `~/.claude/CLAUDE.md`를 모든 세션에서 항상 먼저
로드하기 때문에 이 방식이 동작해요. 프로젝트 파일은 전역 규칙을 다시 쓸
필요 없이 상속받아요.

**2026-02-23 구조 조정 결과:**

- 8개 범용 원칙을 전역으로 승격(YAML Frontmatter, Cross-Referencing, 5W1H,
  Decision Documentation, Zettelkasten, `.me.md`, Buffer, Communication Style)
- 7개 프로젝트 파일에서 중복 제거(각각 약 25-35% 토큰 절약)

**추가 축소 (2026-03-09):**

- markdownlint 빠른 참조 테이블 완전 제거 -- `.markdownlint-cli2.jsonc`와 husky
  pre-commit 훅이 있어서 중복이었어요. 원래 약 330줄에서 28줄로 압축했다가
  (2026-02-23), 도구 기반 백스톱이 충분하다는 게 증명되어 완전히 없앴어요
- Mermaid 섹션을 약 89줄에서 6줄로 압축(동작 규칙만 남기고 예시/테이블/체크리스트
  제거 -- Mermaid 선호를 강제하는 도구가 없으므로)
- 3개 섹션을 `.claude/rules/` 파일로 추출(change-discipline,
  yaml-frontmatter-schema, personal-folder-governance)
- 순수 결과: 전역 `CLAUDE.md` 491줄에서 371줄로 (~24.4% 절약)
- 프로젝트 `CLAUDE.md`: 541 → 478(Tier 1) → 328(Tier 2) = 총 -39.4%
- 항상 로딩되는 컨텍스트 합계: 912줄에서 720줄로 (-21%)
- 모든 세션이 동일한 원칙을 적용하면서 로딩하는 줄 수는 줄었어요

## Settings.local.json 통합

프로젝트별 `settings.local.json` 파일이 다음 중복 제거 대상이었어요. 14개
파일(그 중 8개는 중앙 소스에서의 symlink)이 대부분 같은 bash 명령어 허용
목록을 반복하고 있었어요. 핵심 인사이트는 Claude Code의 권한 우선순위 --
`deny > ask > allow` -- 가 `Bash(*)` catch-all을 안전하게 만든다는 거였어요.

### 이전 (14개 파일, 8개 symlink)

```text
3b/.claude/settings.local.json  ← 소스 파일
  ↑ 8개 프로젝트에서 symlink (brandonwie, crucio, backend-v2 등)
+ 5개 독립 파일 (dev/, personal/, dotfiles/, frontend/, mobile/)
```

대부분의 항목이 전역 `settings.json`과 중복이었어요. 전역 설정이 같은 명령어를
커버하도록 진화했거든요. 모든 파일을 통틀어 고유한 항목은 6개뿐이었어요.

### 이후 (전역 settings.json만)

```text
permissions.allow: ["Bash(*)"]     ← 비파괴적 명령어 전체 catch-all
permissions.deny:  [dangerous]     ← terraform destroy, git push --force, sudo
permissions.ask:   [risky]         ← git push, rm, kill (확인 필요)
defaultMode: "default"             ← Bash(*) catch-all로 사실상 자동 승인
```

정리하면서 8개 symlink와 3개 불필요한 일반 파일을 제거했어요. `outputStyle`,
`enableAllProjectMcpServers`, `prefersReducedMotion` 같은 설정은 전역으로
옮겼어요. 새 프로젝트는 자동으로 전역 설정에서 올바른 권한을 받아요 --
프로젝트별 설정이 필요 없어요.

### Bash(\*)가 안전한 이유

`deny > ask > allow` 우선순위 덕분에 `Bash(*)`는 deny나 ask 패턴에 매칭되지
않는 명령어만 자동 승인해요. `terraform destroy`나 `git push --force` 같은
위험한 명령어는 deny에 있고, `git push`나 `rm` 같은 리스크 있는 명령어는
ask에 있어요. 나머지가 catch-all로 통과해요.

## 프로필별 settings.json

통합이 안 되는 파일이 하나 있어요. `settings.json` 자체예요.
`statusLine.command`가 달라야 하기 때문에 프로필 간 symlink가 안 돼요 -- 업무
프로필은 Claude Code가 statusline 서브프로세스에 환경 변수를 전달하지 않으므로
`CLAUDE_CONFIG_DIR=~/.claude-work`를 포함해야 해요.

아키텍처는 세 개 복사본이에요:

- **지식 베이스 SoT** (`global-claude-setup/settings.json`) -- 정본 레퍼런스
- **개인 프로필** (`~/.claude/settings.json`) -- SoT의 직접 복사본
- **업무 프로필** (`~/.claude-work/settings.json`) -- 2가지 차이가 있는 복사본:
  1. `statusLine.command`에 `CLAUDE_CONFIG_DIR` 접두사 포함
  2. `enabledMcpjsonServers`에 업무 전용 데이터베이스 연결 포함

나머지 설정(env, permissions, hooks, plugins)은 동일해요. 편집할 때는 SoT를
먼저 업데이트하고 두 프로필에 동기화하세요.

**쓰레기 축적에 주의하세요.** 인터랙티브 권한 승인("항상 허용")이 정확한 명령
문자열을 권한 항목으로 저장해요 -- 여러 줄 bash 스크립트, 전체 코드 블록, 인증
토큰까지 포함해서요. 제 업무 프로필은 정리 전에 약 160개 항목(32KB)이
쌓여있었어요. `Bash(*)` catch-all이 인터랙티브 프롬프트가 뜨기 전에 자동
승인해서 이런 축적을 방지해요.

## 교차 검증 규율

공유 지시사항을 만들 때, 다른 개발자에게 동작하지 않을 개인 참조가 없는지 모든
프롬프트 파일을 교차 검증하세요:

- 하드코딩된 절대 경로 (`/Users/username/...`)
- assignee 필드의 개인 사용자명
- gitignore된 스크립트나 폴더 참조
- "if configured" 가드 없는 MCP 도구 참조
- buffer 경로 (`~/dev/personal/3b/.claude/buffer.md`)
- 개인 경로를 가리키는 symlink 문서 (`docs/`)
- 사용자 컨텍스트 섹션 (레벨, 경력, 역할)

이 체크리스트가 가드 코멘트만으로는 놓칠 수 있는 누수를 잡아줘요. AI 설정
파일을 변경하는 모든 PR 전에 검토하세요.

## 결과

새 개발자가 저장소를 clone하면 Claude Code 지시사항이 바로 동작해요. 개인
커스터마이징은 비공개로 유지돼요. sync 스크립트가 AI 도구 간 drift를 방지해요.
그리고 레이어 중복 제거가 공유 원칙을 전역 설정으로 승격시켜서 토큰 사용을
낮게 유지해요.

이 패턴은 프로젝트와 개발자 수에 관계없이 확장돼요. 중앙 SoT 디렉토리가 공유
vs 개인을 한눈에 감사할 수 있게 해주고, 가드 코멘트가 작성 시점에서 실수로
인한 누수를 방지해요.

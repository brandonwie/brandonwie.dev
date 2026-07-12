---
title: "Claude Code: 공유 + 개인 AI 설정 패턴"
description: >-
  AI 지시사항을 커밋되는 공유 레이어와 gitignore되는 개인 레이어로 분리해서
  새 개발자는 즉시 AI 지시사항을 사용하고 기존 개발자는 개인 확장을
  유지하는 패턴입니다.
date: 2026-02-04T00:00:00.000Z
updated: "2026-07-13"
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
source_updated: "2026-07-13"
translation_date: "2026-07-13"
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
공유 지시사항을 저장소에 커밋하고 기존 개발자의 커스텀 설정은 gitignore된
개인 확장으로 유지하는 방식이에요.

## 문제

한 개발자가 개인 지식 관리 시스템으로의 symlink와 함께 Claude Code를 쓰면,
그 지시사항은 저장소를 clone하는 다른 모두에게 보이지 않아요. 전부 gitignore
되어 있으니 다른 개발자는 전부 빈 상태에서 시작해요. 과제는 지시사항을 팀
전체에 동작하는 공유 레이어와 비공개로 남는 개인 레이어로 나누되, 중복이나
drift 없이 유지하는 거예요.

## 아키텍처

분리 구조는 이렇게 생겼어요:

```text
Committed (shared)                   Gitignored (personal)
──────────────────                   ─────────────────────
CLAUDE.md          ← source of truth CLAUDE.local.md
AGENTS.md          ← synced copy     .claude/settings.local.json
GEMINI.md          ← synced copy     .claude/skills/
.claude/prompts/   ← domain context  .claude/prompts/*.ko.md
.claude/settings.json                .mcp.json
.cursor/rules/index.mdc              .gemini/ → .claude/ (symlink)
.github/copilot-instructions.md
```

공유 파일에는 새 개발자에게 필요한 모든 게 들어가요: 프로젝트 아키텍처, 코딩
컨벤션, 명령어 레퍼런스, 배포 지시사항. 개인 파일에는 개발자별 선호 설정,
프라이빗 도구 설정, 외부 시스템으로의 symlink가 들어가요.

## 핵심 결정 사항

### CLAUDE.md가 단일 진실 소스

다른 모든 AI 지시사항 파일은 `CLAUDE.md`에서 `npm run ai:sync`로 생성돼요.
Claude Code, Codex(`AGENTS.md`), Gemini(`GEMINI.md`) 사이의 drift를 막아요.
파일 하나만 편집하면 나머지는 동기화 상태로 남아요.

### 공유 설정에서 MCP 규칙 완화

개인 설정에는 Context7와 Postgres MCP 서버에 "반드시 사용"이라고 되어 있어요.
공유 설정에는 "설정되어 있으면"으로 대체했어요. 새 개발자가 아직 MCP 서버를
설정하지 않았을 수 있으니까요. 지시사항은 여전히 도구가 뭘 하고 언제 쓰는지
설명하지만 요구사항을 유보해요.

### 개인 전용 콘텐츠는 symlink 유지

`.claude/skills/`는 제 지식 관리 시스템으로의 symlink(gitignore됨)로 남겨요.
팀에 영향 주지 않는 개인 확장은 symlink나 `CLAUDE.local.md`에 유지해요. 기준은
명확해요: 모두에게 도움이 되면 커밋하고 본인 환경에 특화된 거면 gitignore해요.

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
├── backend-project.md          # Shared SoT → backend-v2/CLAUDE.md (symlink)
├── backend-project.local.md    # Personal SoT → backend-v2/CLAUDE.local.md (symlink)
├── backend-project.mcp.json    # MCP SoT → backend-v2/.mcp.json (symlink)
├── infra-project.md            # Combined (personal-only repo)
├── infra-project.mcp.json      # MCP SoT → backend-infra/.mcp.json (symlink)
├── orchestration-project.md    # Combined (personal-only repo)
├── etl-project.md              # Combined (personal-only repo)
├── crucio.mcp.json         # MCP SoT → crucio/.mcp.json (symlink)
└── ...
```

다른 팀원이 있는 저장소만 공유/로컬 분리를 적용해요. 개인 전용 저장소는 하나의
통합 파일로 충분해요. `.mcp.json`도 같은 패턴을 따라요 -- 지식 베이스가 정본을
보관하고 프로젝트 저장소는 symlink를 받아요. Sentry와 Notion MCP 서버는
`.mcp.json`에서 제거했는데 설정이 필요 없고 OAuth를 네이티브로 처리하는
Anthropic 호스팅 통합으로 대체했기 때문이에요.

## 공유 파일 가드 코멘트

이 패턴에서 가장 흔한 실수는 공유 파일에 개인 내용을 넣는 거예요. 각 공유
SoT 파일 상단에 HTML 코멘트를 달면 이를 방지할 수 있어요:

```html
<!-- SHARED FILE. This file syncs to {repo}/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in {name}.local.md, then {repo}/CLAUDE.local.md -->
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
symlink는 모든 도구에 투명해서 어느 쪽을 편집해도 같은 파일이 수정돼요.

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
- markdownlint 빠른 참조 테이블 완전 제거(2026-03-09) -- `.markdownlint-cli2.jsonc`와
  husky pre-commit 훅이 있어서 중복이었어요. 원래 약 330줄에서 28줄로
  압축했다가(2026-02-23), 도구 백스톱이 충분하다고 증명되자 아예 없앴어요
- Mermaid 섹션을 약 89줄에서 6줄로 압축(동작 규칙만 남기고 예시/테이블/체크리스트는
  제거 -- Mermaid 선호를 강제하는 도구가 없으니까요)
- 순수 결과: 전역 `CLAUDE.md`가 491줄에서 371줄로 (~24.4% 절약)
- Tier 2(2026-03-09): 3개 섹션을 `.claude/rules/` 파일로 더 추출(change-discipline,
  yaml-frontmatter-schema, personal-folder-governance)
- 프로젝트 `CLAUDE.md`: 541 → 478(Tier 1) → 328(Tier 2) = 총 -39.4% 축소
- 항상 로딩되는 컨텍스트 합계: 912줄에서 720줄로 (-21%)
- best-practices audit에서 나온 rules 파일 총 4개(+ Tier 1의 tag-taxonomy)
- 이제 모든 세션이 같은 원칙을 적용하면서 로딩하는 줄 수는 줄었어요

## Settings.local.json 통합

프로젝트별 `settings.local.json` 파일이 다음 중복 제거 대상이었어요. 14개
파일(그중 8개는 중앙 소스에서 온 symlink)이 대부분 같은 bash 명령어 허용
목록을 반복하고 있었어요. 핵심 변화는 개별 `Bash(...)` 허용 항목 100여 개를
단일 `Bash(*)` catch-all 하나로 바꾼 거예요. Claude Code의 권한
우선순위(`deny > ask > allow`)가 그 catch-all을 안전하게 만들어 주니까요.

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

정리하면서 symlink 8개와 불필요한 일반 파일 3개를 제거했어요. `outputStyle`,
`enableAllProjectMcpServers`, `prefersReducedMotion` 같은 설정은 전역으로
옮겼어요. 3B 저장소는 최소한의 로컬 파일(voice hook만)을 유지하고
frontend/mobile 파일은 다른 팀이 관리하니 그대로 뒀어요. 100% 중복이지만 해는
없어요. 새 프로젝트는 전역 설정에서 올바른 권한을 자동으로 받아요. 프로젝트별
설정이 필요 없어요.

### Bash(\*)가 안전한 이유

`deny > ask > allow` 우선순위 덕분에 `Bash(*)`는 deny나 ask 패턴에 매칭되지
않는 명령어만 자동 승인해요. `terraform destroy`나 `git push --force` 같은
위험한 명령어는 deny에 있고, `git push`나 `rm` 같은 리스크 있는 명령어는
ask에 있어요. 나머지가 catch-all로 통과해요.

## 프로필별 settings.json (정정)

이 글을 처음 쓴 3월에는 `settings.json`이 프로필 간 symlink가 안 되고
아키텍처가 "세 개 복사본"이라고 적었어요. 그건 틀렸어요. 실제 아키텍처는
끝까지 symlink로 연결되어 있고, 프로필별 차이는 별도의 `settings.local.json`
오버라이드 파일에 들어있어서 Claude Code가 공유 base 위에 deep merge해요.
audit 스크립트가 깨진 symlink를 잡아내서 체인을 따라가 복구하면서야 알게
됐어요. 이제 정본 설명은 `.claude/rules/claude-settings-lookup.md`에 있어요.

정정된 토폴로지:

- **지식 베이스 SoT** (`global-claude-setup/settings.json`) -- 정본 소스,
  머신별 플러그인 install 상태가 들어있어서 gitignore 처리됨
- **개인 프로필** (`~/.claude/settings.json`) -- SoT로 향하는 **symlink**
- **업무 프로필** (`~/.claude-work/settings.json`) -- **개인 프로필을 거치는
  symlink 체인**: `~/.claude-work/settings.json → ~/.claude/settings.json →
  SoT`. 별도 복사본이 _아니에요_.
- **업무 오버라이드** (`~/.claude-work/settings.local.json`) -- SoT 디렉토리의
  별도 `settings.local.work.json`로 향하는 symlink. 개인 프로필과 다른 두 키만
  들어있어요: `statusLine.command` (`CLAUDE_CONFIG_DIR=~/.claude-work` 접두사
  포함)와 `enabledMcpjsonServers` (`postgres-aws-aurora-prod` 같은 업무 전용
  데이터베이스 연결 whitelist). Claude Code가 로드 시점에 base `settings.json`
  위에 deep merge해요.

오버라이드가 아닌 모든 설정 -- env, permissions, hooks, plugins -- 은 단일
공유 SoT에서 symlink 체인을 통해 전달돼요. SoT를 편집하면 즉시 두 프로필에
전파돼요. 수동 동기화 단계는 없어요.

쓰레기 축적에 주의하세요. 인터랙티브 권한 승인("항상 허용")이 정확한 명령
문자열을 권한 항목으로 저장해요 -- 여러 줄 bash 스크립트, 전체 코드 블록, 인증
토큰까지 포함해서요. 제 업무 프로필은 정리 전에 약 160개 항목(32KB)이
쌓여있었어요. `Bash(*)` catch-all이 인터랙티브 프롬프트가 뜨기 전에 자동
승인해서 이런 축적을 방지해요.

## 체인 실패 모드

`work → personal → SoT` 체인에는 single-file 실패 모드가 있는데 이걸 알아채는
데 한참 걸렸어요. `~/.claude/settings.json`이 깨지면, 개인 프로필만이 아니라
**두 프로필 모두 체인을 잃어버려요**. 가장 흔한 원인은 Claude Code UI(또는
플러그인의 권한 프롬프트)가 파일을 atomic하게 쓰는 거예요: 임시 파일을 만들고
`rename()`으로 대상 위에 옮기는 방식이요. 그 `rename()`이 symlink inode를 일반
파일로 in-place 교체하면서 SoT를 조용히 끊어버려요.

바로 알아채지는 못해요. 첫 번째 힌트는 보통 "SoT에서 바꾼 설정이 안 보여요"
또는 "활성화한 플러그인이 안 돌아가요" 같은 거예요. 그쯤 되면 두 프로필이 이미
SoT와 어긋나 있을 수 있고, 그 사이에 발생한 사용자 활동 -- UI 권한 토글, 플러그인
활성화 -- 은 깨진 로컬 파일에만 존재하게 돼요.

이걸 감지하려고 `/sync-symlink-rectify`를 실행해요. 이 슬래시 명령에 딸린 audit
스크립트가 개인, 업무, 프로젝트 카테고리에 걸친 55개의 예상 symlink를 모두
walk하면서, symlink가 있어야 할 자리에 일반 파일이 있으면 "REPLACED"로
분류해요. 그 분류가 실패의 명확한 시그니처예요.

복구 전략은 무엇이 drift됐는지에 따라 달라져요. 두 가지 케이스가 있어요.

첫 번째 케이스는 단순해요. 로컬 파일이 엄밀히 stale하고 SoT가 current하면 --
즉, 깨진 윈도우 동안 로컬 파일에 사용자 활동이 없었다면 -- 일방향 복원이
안전해요:

```bash
# 혹시 모르니 로컬 파일 백업
cp ~/.claude/settings.json /tmp/settings.local.backup.$(date +%s)

# 일반 파일 제거하고 SoT로 다시 링크
rm ~/.claude/settings.json
ln -sfn /path/to/sot/settings.json ~/.claude/settings.json

# 두 프로필에서 체인이 정상인지 확인
realpath ~/.claude/settings.json
realpath ~/.claude-work/settings.json
```

두 번째 케이스는 더 어려워요. 로컬 파일이 사용자 의도를 누적했고 -- UI 토글,
"항상 허용" 클릭, 플러그인 활성화 -- _그리고_ 같은 윈도우 동안 SoT도 별도로
편집됐다면, 단순한 복원은 사용자의 변경을 조용히 되돌려버려요. 이때는
**양방향 merge**가 필요해요: 두 JSON을 구조적으로 walk하고, 각 diff를 분류하고,
다시 링크하기 전에 merge해야 해요. 최소한의 walker는 이렇게 생겼어요:

```python
# 다음 형태의 diff를 반환: (path, kind, local_value, sot_value)
# kind는 LOCAL-ONLY | SOT-ONLY | VALUE | LIST
def walk(l, s, path=""):
    if type(l) != type(s): ...
    if isinstance(l, dict):
        for k in set(l) - set(s): yield (f"{path}.{k}", "LOCAL-ONLY", l[k], None)
        for k in set(s) - set(l): yield (f"{path}.{k}", "SOT-ONLY", None, s[k])
        for k in set(l) & set(s):
            yield from walk(l[k], s[k], f"{path}.{k}")
    elif isinstance(l, list):
        if l != s: yield (path, "LIST", len(l), len(s))
    elif l != s:
        yield (path, "VALUE", l, s)
```

diff를 분류했으면 구조적으로 merge할 수 있어요 -- 보통 LOCAL-ONLY 항목은 UI
활동에서 온 것이니 유지하고, SOT-ONLY 항목은 의도적인 설정 편집에서 온 것이니
역시 유지하고, VALUE 충돌은 사람의 결정이 필요해요. merge된 결과는 SoT와 같은
디렉토리에 임시 파일 + `rename()`으로 atomic하게 써야 해요. 그래야 swap 동안
업무 프로필의 symlink가 항상 일관된 파일을 보게 돼요.

이건 일회성 사건 이상의 의미가 있어요. 로컬 파일을 정당하게 수정하는 사용자
활동(권한 "항상 허용" 클릭, UI에서 플러그인 토글)은 로컬 파일이 깨진 윈도우
동안 SoT에서 보이지 않아요. 깨짐을 늦게 감지하면 drift가 의도치 않게
누적될 수 있어요. 저한테 이걸 드러낸 사건은 ~3시간의 drift였는데 거기에는 추적
hook이 SoT에만 존재하고 실행 중인 프로필은 그게 없는 stale한 로컬 파일을 보고
있어서 0 데이터를 수집하던 plugin-on 실험도 포함되어 있었어요.

git rollback은 없어요. SoT `settings.json`은 머신별 플러그인 install 상태가
들어있어서 gitignore 처리되어 있어요. 그 말은, 파괴적인 복구는 항상 수동
백업(예: `cp $SOT /tmp/settings.sot.backup.$(date +%s)`)으로 미리 보호되어야
한다는 뜻이에요. merge가 잘못됐을 때 복구할 수 있게요. `/tmp`는 ephemeral하지만
복구 윈도우 자체에는 충분해요. 더 길게 보관하고 싶으면 `~/`로 옮기세요.

열린 질문이 하나 있어요. 체인을 분리해야 할까요? 현재의 `work → personal → SoT`
토폴로지는 역사적으로 프로필이 하나만 있었고 업무 프로필이 두 번째 모자로
나중에 추가됐기 때문에 존재해요. 대안 -- 두 개의 독립된 symlink
(`{personal,work} → SoT`) -- 는 하나의 UI 깨짐을 두 프로필에 cascade하는 대신
한 프로필에 가둬요. 비용은 `settings.local.json` deep merge 메커니즘이 분리된
체인에서도 동작하는지 재검증해야 한다는 거예요. 아직 그 spike를 안 했지만 다음
큰 settings 재구조화 전에는 할 가치가 있어요.

## 되돌림 루프가 드러나다

그 첫 사건 일주일 후에 같은 증상을 또 만났어요. 일회성 atomic-rename 설명이
전체 이야기라고 가정했는데 아니었어요. symlink를 다시 링크하고 runtime 파일을
편집하기 시작했더니, UI가 약 2분 안에 메모리 속 설정 모델을 일반 파일로 다시
직렬화해서 제 수정을 덮어써버렸어요. UI는 여전히 그 파일을 일반 파일로 여겼고,
깨지기 전의 cached 상태를 들고 있었고, 모델이 따라잡을 때까지 계속 수정을
덮어썼어요.

그게 되돌림 루프예요. UI가 파일 내용의 stale한 스냅샷을 들고 있는 한, symlink를
몇 번 복구해도 소용없어요. 다음 저장 사이클이 drift된 상태를 복원해버려요.

증상 시그니처는 세 가지 신호가 함께 있어야 말이 돼요:

1. `ls -la ~/.claude/settings.json` -- symlink가 아닌 일반 파일
2. `diff ~/.claude/settings.json $SOT` -- 상당한 차이(제 경우 290줄의 누적된
   권한 패턴, 플러그인 설정, `voiceEnabled`,
   `skipDangerousModePermissionPrompt`, `mcpServers`)
3. `stat -f '%Sm' ~/.claude/settings.json` -- runtime 파일을 편집한 뒤 2~3분
   이내에 mtime이 업데이트됨. UI에서 명시적으로 저장하지 않아도.

세 번째가 되돌림 루프를 보통의 깨진 symlink와 구분해 주는 지점이에요. 명시적
저장 때만 mtime이 움직이면 stale 파일이에요. 수동 저장 없이도 움직이면 UI가
능동적으로 제 수정을 덮어쓰고 있는 거예요.

복구는 SoT로 reconcile한 다음 다시 symlink로 걸어요. 앞 섹션의 양방향 merge는
양쪽 모두 보존할 의도가 있을 때 맞는 도구예요. 되돌림 루프의 경우, UI의 "의도"는
제 수정 이전의 stale한 cache일 뿐이에요 -- 그걸 앞으로 merge하면 제거하려던
변경을 다시 들여올 뿐이에요. 더 안전한 레시피는 live 파일의 상태를 SoT에 freeze한
다음 다시 symlink로 거는 거예요:

```bash
SOT=/path/to/3b/.claude/global-claude-setup/settings.json
LIVE=/Users/you/.claude/settings.json

# 1. live 백업 -- 복구 윈도우 동안은 /tmp면 충분
cp "$LIVE" "/tmp/live-settings-backup-$(date +%Y%m%d-%H%M%S).json"

# 2. drift된 live 파일에 의도한 수정을 수술적으로 적용
#    -- Edit/sed/jq 사용. 각 수정 후 JSON 검증
python3 -m json.tool < "$LIVE" > /dev/null || { echo "JSON broke"; exit 1; }

# 3. cleaned live → SoT 복사. 이제 SoT에는 UI가 누적한 모든 줄 + 의도한
#    수정이 전부 들어있음. 잃어버린 게 없고, drift가 SoT로 승격됨.
cp "$LIVE" "$SOT"

# 4. atomic swap: live를 SoT로 가리키는 symlink로 교체
rm "$LIVE" && ln -s "$SOT" "$LIVE"

# 5. 검증
ls -la "$LIVE"                                 # -> SoT 출력
diff "$LIVE" "$SOT" > /dev/null                # symlink 통해서 동일
python3 -m json.tool < "$LIVE" > /dev/null     # 링크 통한 JSON 유효
```

핵심 동작은 3단계예요. 다시 링크하기 _전에_ live를 SoT로 승격하니 아무것도 잃지
않아요. 앞 섹션의 구조적 walk는 모든 diff에 대해 의도를 결정하게 만드는데
양쪽 다 보존할 진짜 의도가 있을 때 맞는 방식이에요. 여기서 UI의 "의도"는 stale한
cache일 뿐이라, live를 SoT에 freeze하고 symlink로 거는 게 UI가 "원한" 걸 따지는
것보다 깔끔해요.

현재 세션에서는 고쳐지지 않아요. 실행 중인 Claude Code 세션은 여전히 수정 전
hook 레지스트리를 메모리에 들고 있어요. SoT에서 제거하거나 수정한 hook은 다음
세션 시작 때만 완전히 효과를 봐요. 관찰 가능한 시그널은 hook이 세션 시작 시
emit하는 로그 라인이에요 -- 제 경우 다음 세션에서 `[AGENT-TEAMS-READY]`가
없다는 게 메모리 레지스트리가 refresh됐다는 확인이었어요.

모니터링 갭도 있어요. 기존의 `symlink-daily-check.sh` SessionStart hook은 다음
세션 경계에서 atomic-rename 케이스를 잡아줘요. 세션 _중에_ 일어나는 되돌림
루프는 못 잡아요. UI의 미래 쓰기 패턴이 delete-then-create-new-regular-file로
바뀌면, 세션 사이에 symlink가 다시 교체될 거고 daily check가 결국은 잡겠지만 --
실시간 체크는 PostToolUse나 Stop hook에 살아야 해요. 아직 안 만들었어요.
되돌림 cadence가 충분히 빠른지가 열린 질문이에요.

gitignore된 SoT는 복구를 관찰 불가능하게 만들어요. SoT `settings.json`은
머신별 플러그인 install 상태를 갖고 있어서 gitignore되어 있어요. 그 말은
reconcile-and-relink 시퀀스 전체가 로컬 작업 트리 안에만 살아있다는 거예요.
`git status`는 아무것도 안 보여줘요. 어떤 PR도 reconciliation을 리뷰하지 않아요.
새로 clone해도 drift된 SoT를 재현할 수 없어요. 실용적 완화책은 보관 정책에
맞춰서 주기적으로 수동 백업(`cp $SOT ~/backup-$(date +%Y%m)/`)하는 거예요 --
"전체 설정 히스토리를 잃는" 결과가 얼마나 나쁜지에 따라 정해야 해요. 제대로 된
수정은 SoT를 un-gitignore하는 건데, 그러면 플러그인 install 상태와 머신별 권한을
저장소에 실어 보내게 되니까 더 나빠져요.

## 선택적 session 프로필 확장 (claude-swap)

위의 symlink 체인은 두 프로필(개인과 업무)을 깔끔하게 다뤄요. 다만 두 계정을
동시에 실행하지는 못해요. 프로필 하나가 한 벌의 credential만 가리키니까요.
이후 단계에서 기존 체인 위에 선택적인 멀티 계정 session 레이어를 얹었어요.
순수하게 덧붙이는 방식이에요. 체인은 그대로 두고 여전히 주된 아키텍처로 남고,
session 레이어는 runtime을 설치하지 않으면 작동하지 않아요.

### Runtime 라이프사이클

wrapper 스크립트 `scripts/cswap-3b.sh <pers|work> [--force-session]`는 지식
베이스에 tracking되지만 runtime이 설치돼 있지 않으면 아무것도 안 해요. 같은
계정 요청은 곧장 source 프로필로 들어가는 fast path를 타요. `--force-session`을
넘기거나 계정을 넘나드는 요청을 하면 upstream claude-swap의 `setup_session()`을
거쳐 격리된 session 프로필을 bootstrap해요. bootstrap과 launch를 나눈 방식이고,
`cswap run`은 절대 쓰지 않아요.

runtime은 upstream [`github.com/realiti4/claude-swap`](https://github.com/realiti4/claude-swap)이고,
commit `3d1c5b4`에 pin되어 있고, `uv` tool로 설치돼요(uv가 관리하는 CPython,
asdf 항목 없음, fork 없음). 설치와 teardown은 runtime 작업이에요. 저장소는
wrapper와 doctor 체크만 실어 보내요.

session 프로필은 `~/.claude-swap-backup/sessions/` 아래의 ephemeral 디렉토리고,
credential은 keychain에만 둬요. 서비스 이름은 해시로 만들어져요
(`Claude Code-credentials-<sha256(NFC(dir))[:8]>`). wrapper가 그 항목을 심고
평문은 unlink해요. claude 2.1.207이 실행 시점에 평문을 절대 마이그레이션하지
않으니까요. wrapper는 source 프로필에서 10개 항목짜리 symlink 세트를 투영해요
(settings, `CLAUDE.md`, skills, commands, agents, plugins, hooks, scripts,
keybindings, settings.local). 이 목록은 `.cswap-3b-links.json` manifest에
기록돼요. 목록이 세 곳(manifest, wrapper의 `LINK_ITEMS`, sync-doctor check 18의
`items` 문자열)에 중복되어 있어서 하나를 고치면 셋 다 고쳐야 해요. 링크 처리는
fail-closed예요. 실패가 나면 session 디렉토리와 keychain 항목을 지워요. history와
projects는 항상 session별이고(`--share-history`는 절대 안 씀), 지식 베이스 표면은
전부 source 프로필로 향하는 정확한 symlink예요. 복사본이 아니에요.

### Credential 모드

계정은 setup-token으로만 등록해요. source 프로필에서 `claude setup-token`을
실행한 다음, `cswap add-token --email <exact>`를 실행하면서 토큰을 보안 prompt에
붙여 넣어요. 이유는 upstream의 한계예요. `cswap add`는 고정된 기본 keychain
서비스만 읽어서 `CLAUDE_CONFIG_DIR` 프로필의 해시된 항목을 잡지 못해요. setup
token은 refresh token 없이 오래 유지돼서 만료되거나 취소되면 session 검증
실패로 드러나요. wrapper의 fail-closed 정리가 session을 없애고, 해결책은 다시
등록하는 거예요.

### 가드레일

sync-doctor check 18(`cswap session links`)이 살아있는 모든 session 프로필을
검증해요. wrapper가 관리하는 manifest가 있어야 하고, `source_profile`은 정확히
`~/.claude`와 `~/.claude-work`로만 허용되고, 소유한 항목은 전부 원본으로 향하는
정확한 symlink여야 해요. 복사본이나 잘못된 대상, 빠진 링크가 있으면 red로 뜨고,
sessions 디렉토리가 아예 없으면 green이에요.

### 현재 상태

runtime만 되돌리는 rollback 드릴로 전부 제거했어요(session들, 해시된 keychain
항목, claude-swap backup keychain 서비스, `~/.claude-swap-backup/`, uv tool까지).
그리고 개인 프로필과 업무 프로필이 전후로 byte 단위까지 동일한지 확인했어요.
다시 켜려면 pin된 commit으로 uv tool을 재설치하고 setup-token으로 계정을 다시
등록하면 돼요. wrapper와 doctor 체크만 실어 보내는 이유는, 주된 두 프로필 체인이
session 레이어의 존재에 절대 의존하지 않게 하려는 거예요.

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

## 결과

새 개발자가 저장소를 clone하면 Claude Code 지시사항이 바로 동작해요. 개인
커스터마이징은 비공개로 남고요. sync 스크립트가 AI 도구 간 drift를 막고,
레이어 중복 제거가 공유 원칙을 전역 설정으로 승격시켜 토큰 사용을 낮게
유지해요. 중앙 SoT 디렉토리 덕분에 공유와 개인을 한눈에 감사할 수 있고, 가드
코멘트가 작성 시점에서 실수로 인한 누수를 막고, 선택적인 session 레이어가 두
프로필 체인을 건드리지 않으면서 그 위에 멀티 계정 격리를 얹어요.

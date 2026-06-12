---
title: Serena MCP — Claude Code 다중 프로필 설정 (cpers/cwork)
description: >-
  Claude Code 이중 프로필 환경(cpers/cwork)과 Codex에 Serena MCP server를 설치하는 전체 절차. 권장
  hook 4개, system-prompt 교체, 그리고 설치 도구가 기본 ~/.claude.json에만 쓰고 프로필별 저장소는 놓치는
  함정까지 다뤄요.
date: 2026-04-29T00:00:00.000Z
updated: '2026-06-13'
tags:
  - devops
  - claude-code
  - mcp
  - serena
  - dual-profile
  - cpers
  - cwork
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: serena-claude-code-multi-profile-setup
source_updated: '2026-06-13'
translation_date: '2026-06-13'
---

`cpers`로 Claude Code를 켰는데 `/mcp` 목록에 Serena가 안 보였어요. `serena setup claude-code`는 분명히 성공 메시지를 찍었는데도 그랬어요. 이중 프로필 환경(`cpers` / `cwork`)에 [Serena](https://oraios.github.io/serena/)를 깔면서 만난 함정과, 그걸 피해서 Claude Code 두 프로필 + Codex까지 한 번에 셋업하는 전체 절차를 정리했어요. 권장 hook 4개와 system-prompt 교체도 같이 다뤄요.

## 기본 설치만으로는 부족한 이유

최근 Claude Code(Opus 4.7 포함)는 내장 도구 설명이 굉장히 길어졌어요(약 16k 토큰, 수정 불가). 게다가 기본 system prompt가 MCP 쪽 심볼 도구보다 `Read` / `Grep`을 먼저 쓰도록 모델을 유도해요. Serena는 이걸 세 가지로 상쇄해요.

1. 언어 서버를 백엔드로 둔 심볼 기반 도구를 제공하는 MCP server(`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `replace_symbol_body` 등).
2. 기본 편향에서 벗어나도록 모델을 밀어주는 동작 hook 4개(`activate`, `remind`, `auto-approve`, `cleanup`).
3. 모델을 다시 심볼 우선 흐름으로 고정하는 system-prompt 교체본(약 7800자).

`serena setup claude-code` CLI는 1번만 처리해요. 2번과 3번은 직접 손봐야 해요. 그리고 이중 프로필 환경(`cpers`는 `CLAUDE_CONFIG_DIR=~/.claude`, `cwork`는 `CLAUDE_CONFIG_DIR=~/.claude-work`)에서는 1번도 프로필마다 다시 돌려야 해요. 설치 도구가 환경 변수를 무시하거든요.

## 마주친 어려움

### 1. 이중 프로필 설치 함정

`serena setup claude-code`는 다음 명령을 감싼 얇은 wrapper예요.

```bash
claude mcp add --scope user serena -- serena start-mcp-server --context=claude-code --project-from-cwd
```

`claude mcp add --scope user`는 `CLAUDE_CONFIG_DIR`이 가리키는 경로가 아니라 무조건 `$HOME/.claude.json`에 써요. 그래서 이중 프로필 환경이면 이렇게 갈라져요.

```text
~/.claude.json              ← 설치 도구가 여기에 씀 (기본 home store)
~/.claude/.claude.json      ← cpers가 읽는 곳 (CLAUDE_CONFIG_DIR=~/.claude)
~/.claude-work/.claude.json ← cwork가 읽는 곳 (CLAUDE_CONFIG_DIR=~/.claude-work)
```

`serena setup claude-code`를 돌린 뒤에도 두 프로필 저장소엔 serena 항목이 그대로 빠져 있어요. `/mcp`에는 다른 서버는 다 보이는데 serena만 없어요. 원래라면 그 고아 항목을 읽었을 plain `claude` 명령은 zshrc 런처 게이트가 막아둔 상태예요. 결국 serena 항목이 어느 프로필도 안 읽는 파일에 덩그러니 남아요.

해결법이에요.

```bash
CLAUDE_CONFIG_DIR=~/.claude      serena setup claude-code
CLAUDE_CONFIG_DIR=~/.claude-work serena setup claude-code
```

환경 변수를 덮어씌워서 설치 도구를 두 번 돌리면 두 프로필 저장소에 항목이 제대로 들어가요. `~/.claude.json`에 남은 고아 항목은 그냥 둬도 돼요. plain `claude`는 어차피 게이트로 막혀 있고, 그 파일에는 손대면 안 되는 다른 상태 키(OAuth, growthbook 플래그 등)가 잔뜩 들어 있거든요.

### 2. `--system-prompt` vs `--append-system-prompt`

Serena 문서 예시는 이렇게 돼 있어요.

```bash
claude --system-prompt="$(serena prompts print-cc-system-prompt-override)"
```

흔한 오해 하나가 `--system-prompt`은 `--print` 모드 전용이라서 대화형 런처에선 `--append-system-prompt`을 써야 한다는 거예요. 틀렸어요. 두 플래그 모두 대화형 Claude Code에서 동작해요(`claude --help`로 확인했어요). 차이는 동작이에요.

| 플래그                   | 동작                                |
| ------------------------ | ----------------------------------- |
| `--system-prompt`        | 기본 system prompt를 통째로 교체   |
| `--append-system-prompt` | 기본 system prompt 뒤에 덧붙임      |

Serena의 교체본은 `"You are Claude Code, Anthropic's official CLI for Claude..."`로 시작하는 약 7800자 문서이고, **교체용**으로 쓰여 있어요. `--append-`를 쓰면 `"You are Claude Code..."` 도입부가 두 번 쌓여서 교체본의 신호가 흐려져요. `--system-prompt`을 써야 해요.

### 3. 심볼릭 링크 atomic-rename 표류

`~/.claude/settings.json`과 `~/.claude-work/settings.json`은 둘 다 `3b/.agents/global-claude-setup/settings.json`(SoT)로 링크돼 있어야 해요. 그런데 Claude Code UI가 부하 상황에서 이 파일을 통째로 다시 쓸 때가 있어요(임시 파일 만든 다음 rename). 그러면 심볼릭 링크 inode가 슬그머니 일반 파일로 바뀌어요. SoT에 새 hook을 넣어도, `/check-symlinks`(또는 `ln -sf {SoT} ~/.claude/settings.json`)로 링크를 복구하기 전까진 프로필 쪽 사본은 옛날 상태로 남아요. `claude-mem` 제거를 두 번이나 실패하게 만든 그 버그 부류와 똑같아요.

### 4. Codex MCP는 별 일 없이 됐어요

`serena setup codex`는 `~/.codex/config.toml`에 쓰는데, 이 파일은 이미 `3b/.agents/global-codex-setup/config.toml`로 링크돼 있어요. 프로필이 하나뿐이라 `cpers`/`cwork` 같은 짝이 없고, 그래서 설치 함정도 없어요. MCP 항목은 그냥 들어가요. hook은 따로 설정해야 하지만요.

## 전체 설치 순서

### Step 1 — Claude 프로필별로 MCP 항목 등록

```bash
# Personal profile
CLAUDE_CONFIG_DIR=~/.claude      serena setup claude-code
# Work profile
CLAUDE_CONFIG_DIR=~/.claude-work serena setup claude-code
```

`~/.claude/.claude.json`과 `~/.claude-work/.claude.json` 둘 다에 다음이 들어 있는지 확인해요.

```json
"serena": {
  "type": "stdio",
  "command": "serena",
  "args": ["start-mcp-server", "--context=claude-code", "--project-from-cwd"],
  "env": {}
}
```

Codex 쪽은 한 방으로 끝나요. `serena setup codex` 한 번 돌리면 `~/.codex/config.toml`에 들어가는데, 이 파일은 이미 3B SoT로 링크돼 있어요.

### Step 2 — Claude SoT settings.json에 hook 4개

`3b/.agents/global-claude-setup/settings.json`(링크된 SoT)을 편집해요.

```json
"SessionStart": [
  { "matcher": "", "hooks": [{ "type": "command", "command": "serena-hooks activate --client=claude-code" }] }
],
"PreToolUse": [
  { "matcher": "",                "hooks": [{ "type": "command", "command": "serena-hooks remind --client=claude-code" }] },
  { "matcher": "mcp__serena__*",  "hooks": [{ "type": "command", "command": "serena-hooks auto-approve --client=claude-code" }] }
],
"Stop": [
  { "matcher": "", "hooks": [{ "type": "command", "command": "serena-hooks cleanup --client=claude-code" }] }
]
```

각 hook의 의미예요(Serena 문서 기준).

| Hook         | 이벤트                        | 효과                                                                                                                  |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| activate     | SessionStart                  | 세션 시작 때 모델에게 프로젝트를 활성화하라고 알려주고 Serena 안내문을 읽혀요.                                        |
| remind       | PreToolUse (`""`)             | 내부적으로 throttle돼요. Read/Grep 같은 비-Serena 도구가 연속으로 불리면 모델을 다시 Serena 도구 쪽으로 밀어줘요.    |
| auto-approve | PreToolUse (`mcp__serena__*`) | Claude Code가 `acceptEdits` 모드일 때 Serena 호출을 자동 승인해요(`replace_symbol_body`, `rename_symbol`까지 포함). |
| cleanup      | Stop                          | 세션이 끝나면 hook의 세션 상태를 정리해요.                                                                            |

### Step 3 — Codex SoT hooks.json에 hook 1개

`3b/.agents/global-codex-setup/hooks.json`을 편집해요.

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "serena-hooks activate --client=codex" }] }
]
```

Codex 문서는 `SessionStart`만 명시적으로 권장해요. Codex의 hook 시스템이 "덜 다듬어졌"고, Codex 자체는 표류가 덜한 편이거든요. `auto-approve`는 적용 대상이 없어요(Codex엔 `acceptEdits` 같은 게 없어요). `remind`/`cleanup`은 문서에 없어서 일단 안 넣고, 나중에 표류가 보이면 그때 추가해요.

### Step 4 — SoT 심볼릭 링크 복구

```bash
# Claude Code의 /check-symlinks skill, 또는 직접:
ln -sf /Users/brandonwie/dev/personal/3b/.agents/global-claude-setup/settings.json /Users/brandonwie/.claude/settings.json
ln -sf /Users/brandonwie/.claude/settings.json /Users/brandonwie/.claude-work/settings.json
```

work 프로필은 personal을 거쳐 체이닝돼요(`setup.sh` 241번 줄 이후 참고). 그래서 SoT 한 번만 고치면 두 프로필에 같이 반영돼요.

### Step 5 — shell 런처에서 system-prompt 교체

`dotfiles/zsh/.zshrc`(또는 `cpers`/`cwork`가 정의된 곳)에 이걸 넣어요.

```zsh
# Lazy cache — shell 세션당 서브프로세스 한 번만 띄움.
function _serena_cc_prompt() {
  if [[ -z "${_SERENA_CC_PROMPT_CACHE-}" ]]; then
    _SERENA_CC_PROMPT_CACHE=$(serena prompts print-cc-system-prompt-override 2>/dev/null)
  fi
  printf '%s' "${_SERENA_CC_PROMPT_CACHE}"
}

function cwork() {
  >&2 printf '[claude] profile=work dir=%s cwd=%s\n' "${HOME}/.claude-work" "$PWD"
  local sp=""
  [[ -n "${SERENA_SESSION_ID-}" ]] && sp="$(_serena_cc_prompt)"
  CLAUDE_CONFIG_DIR=~/.claude-work command claude --system-prompt="$sp" "$@"
}

function cpers() {
  >&2 printf '[claude] profile=personal dir=%s cwd=%s\n' "${HOME}/.claude" "$PWD"
  local sp=""
  [[ -n "${SERENA_SESSION_ID-}" ]] && sp="$(_serena_cc_prompt)"
  CLAUDE_CONFIG_DIR=~/.claude command claude --system-prompt="$sp" "$@"
}
```

이제 안전장치가 두 겹이에요. 기본 `cpers` / `cwork` 세션은
`SERENA_SESSION_ID`가 있을 때만 Serena-first prompt를 받아요. 그래서 MCP
server를 제거한 뒤에도 shell 런처에 남은 prompt override가 모든 세션에 새는
일을 막을 수 있어요. Serena wrapper로 띄운 세션에서 `serena`가 빠졌거나
깨졌다면, `_serena_cc_prompt`가 여전히 빈 문자열을 돌려줘서
`--system-prompt=""`(no-op)이 돼요.

이 guard가 중요한 이유는 config audit이 shell-launcher layer를 놓칠 수 있기
때문이에요. 어떤 점검은 MCP config, hook listener, daemon까지는 확인하지만,
shell 함수가 모든 세션에 Serena-first system prompt를 계속 주입하는지는 보지
못해요. Serena에만 해당하는 이야기는 아니에요. uninstall이나 opt-in migration을
할 때는 launcher prompt override까지 모든 injection point를 같이 훑어야 해요.

### Step 6 — 검증

```bash
# 1. 바이너리 잡히는지
which serena serena-hooks
serena --version
serena-hooks --help | grep -E "activate|remind|cleanup|auto-approve"

# 2. 프로필별 MCP 항목
jq '.mcpServers.serena' ~/.claude/.claude.json
jq '.mcpServers.serena' ~/.claude-work/.claude.json
grep -A 2 '\[mcp_servers.serena\]' ~/.codex/config.toml

# 3. Claude SoT의 hook 개수 (serena-hooks 4개 기대)
jq '[.hooks.SessionStart, .hooks.PreToolUse, .hooks.Stop] | flatten
    | map(select(.hooks[].command | contains("serena-hooks")))
    | length' \
  ~/dev/personal/3b/.agents/global-claude-setup/settings.json

# 4. Codex SoT의 hook 개수 (SessionStart 아래 serena-hooks 1개 기대)
jq '.hooks.SessionStart' \
  ~/dev/personal/3b/.agents/global-codex-setup/hooks.json

# 5. 심볼릭 링크 복구됐는지
ls -la ~/.claude/settings.json ~/.claude-work/settings.json

# 6. 런처가 플래그를 들고 가는지
zsh -c 'source ~/.zshrc; which cpers' | grep system-prompt
```

Claude Code를 재시작하면 `/mcp`가 프로필마다 user MCP 영역 아래에 `serena · ✔ connected`를 보여줘야 해요.

## 다른 방법 대신 이걸 고른 이유

후보가 다섯 개 있었어요. 환경 변수 덮어쓰기 + SoT 경로를 고른 이유는 트레이드오프 표를 보면 분명해요.

| 방법                                              | 장점                                           | 단점                                                                                            |
| ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 프로필별 `~/.claude/.claude.json` 직접 편집       | 가장 직접적                                     | 같은 파일이 그 프로필의 OAuth/상태 저장소이기도 해서, 무관한 키를 망가뜨릴 위험.                |
| `serena setup claude-code` + `CLAUDE_CONFIG_DIR`  | 공식 설치 도구를 그대로 쓰면서 환경만 바꿈    | 설치를 두 번 돌리지만 비용은 거의 없음. **선택.**                                              |
| SoT의 `mcpServers` 블록 직접 편집                  | 단일 출처                                       | `mcpServers`는 SoT `settings.json`이 아니라 프로필별 `~/.claude/.claude.json`에 살아요. 적용 안 됨. |
| repo마다 `claude mcp add --scope project`         | repo 단위                                       | "전역으로 깔겠다"는 의도가 깨져요. repo마다 깔아줘야 함.                                          |
| auto-approve hook 빼기                            | 더 단순                                         | `acceptEdits` 모드에서 파괴적인 Serena 호출까지 묶어서 승인하는 커버리지가 사라져요.            |

선택한 방법(환경 변수 덮어쓰기 + SoT 심볼릭 링크 + shell 런처 주입)은 설치 범위를 전역으로 유지하고, 기존 3B SoT 파이프라인을 그대로 쓰고, Serena를 떼어내도 부드럽게 무력화돼요.

## 다중 프로필 MCP 설치에 가져갈 핵심

- **MCP 항목은 프로필별 `.claude.json`에 살아요.** 공유 SoT `settings.json`이 아니에요. 두 파일은 완전히 달라요. 한쪽은 hook/권한/플러그인이고 다른 쪽은 MCP 서버 + OAuth 상태예요.
- **`claude mcp add --scope user`는 환경 변수 덮어쓰기 없이 그냥 부를 때만 `CLAUDE_CONFIG_DIR`을 무시해요.** 명시적으로 깔아주면 동작해요. `CLAUDE_CONFIG_DIR=~/.claude-work claude mcp add ...`처럼요.
- **Opus 4.7에서는 hook 4개 구성이 선택이 아니라 필수예요.** system-prompt 교체와 remind hook이 없으면 모델이 `find_symbol`/`get_symbols_overview`보다 `Read`/`Grep`을 강하게 선호해요. Serena를 깐 의미가 사라져요.
- **Codex는 더 적게 필요해요.** MCP 항목 하나 + SessionStart hook 하나면 끝이에요. `auto-approve` 짝이 없고, `--system-prompt` 교체도 필요 없어요(Codex는 표류가 덜해요).
- **settings.json이나 `.claude.json`을 바꾼 뒤엔 Claude Code를 꼭 재시작해요.** 진행 중인 세션은 새 MCP 항목이나 새 hook을 안 받아와요.
- **SoT 파일이 얽힌 설치/업그레이드가 끝나면 심볼릭 링크를 다시 확인해요.** atomic-rename 표류(UI가 심볼릭 링크를 일반 파일로 다시 쓰는 그 부류)가 SoT 파이프라인을 조용히 깨요.

## 어떤 상황에 맞는 절차일까

이 절차는 세 가지 상황에 잘 맞아요. Claude Code 이중 프로필 환경에 새 MCP server를 깔 때, `cpers`/`cwork`가 이미 있는 새 머신에 Serena를 올릴 때, 그리고 설치 도구가 성공했다는데 `/mcp`엔 안 보이는 문제를 진단할 때예요. 단일 프로필 Claude Code 환경엔 안 맞아요. `CLAUDE_CONFIG_DIR` 우회가 필요 없어서 `serena setup claude-code` 한 번이면 끝나거든요. repo 단위(project scope) MCP 설치도 다른 메커니즘이라 빠져요. 그쪽은 `.mcp.json`을 직접 편집하는 흐름이에요.

## References

- [Serena docs § Connecting Your MCP Client — Claude Code](https://oraios.github.io/serena/02-usage/030_clients.html#claude-code)
- [Serena docs § Codex (CLI and App)](https://oraios.github.io/serena/02-usage/030_clients.html#codex-cli-and-app)
- [Claude Code CLI reference (--system-prompt / --append-system-prompt)](https://docs.claude.com/en/docs/claude-code/cli-reference)

---
title: 'Serena MCP — Claude Code Multi-Profile 설정 (cpers/cwork)'
description: 'Claude Code dual-profile 설정(cpers/cwork) + Codex에 걸쳐 Serena MCP server를 설치하는 전체 절차. 4개 권장 hook, system-prompt override, 그리고 비명시적인 "installer가 default ~/.claude.json에 쓰고 profile-specific store를 놓치는" 함정 포함.'
date: 2026-04-29T00:00:00.000Z
updated: '2026-05-06'
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
source_updated: 2026-05-06T00:00:00.000Z
translation_date: '2026-05-06'
---

이 글은 Claude Code dual-profile 설정(`cpers` / `cwork`)에 [Serena](https://oraios.github.io/serena/) language-server-backed MCP server를 + Codex와 함께 설치하는 전체 절차예요. 4개 권장 hook과 multi-profile user를 첫 install에서 무는 비명시적인 "installer가 default `~/.claude.json`에 쓰고 profile-specific store를 놓치는" 함정 포함.

## Serena가 default install 이상이 필요한 이유

최근 Claude Code(그리고 Opus 4.7) 업데이트가 매우 긴 built-in tool description(~16k token, unmodifiable)을 추가했고, agent가 MCP-provided symbolic tool보다 `Read` / `Grep`을 선호하도록 bias하는 default system prompt를 ship했어요. Serena는 세 가지 메커니즘으로 이걸 counteract해요:

1. language server로 backed된 symbolic code-intelligence tool(`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `replace_symbol_body` 등)을 제공하는 MCP server.
2. agent를 default bias에서 멀어지게 nudge하는 4개 behavioral hook(`activate`, `remind`, `auto-approve`, `cleanup`).
3. agent를 symbolic-first workflow로 다시 anchor하는 system-prompt override(~7800자).

`serena setup claude-code` CLI는 step 1만 처리해요. step 2와 3은 manual이에요. 그리고 dual-profile 설정에서(`cpers`는 `CLAUDE_CONFIG_DIR=~/.claude`로 Claude 실행, `cwork`는 `CLAUDE_CONFIG_DIR=~/.claude-work`로), installer가 env var를 무시하기 때문에 step 1도 profile당 다시 실행해야 해요.

## 겪었던 어려움들

### 1. Dual-Profile Installer 함정

`serena setup claude-code`은 thin wrapper:

```bash
claude mcp add --scope user serena -- serena start-mcp-server --context=claude-code --project-from-cwd
```

`claude mcp add --scope user`는 `CLAUDE_CONFIG_DIR`이 resolve하는 경로가 아니라 무조건 `$HOME/.claude.json`에 써요. dual-profile 설정에서:

```text
~/.claude.json              ← installer가 여기 씀 (default home store)
~/.claude/.claude.json      ← cpers가 여기 읽음 (CLAUDE_CONFIG_DIR=~/.claude)
~/.claude-work/.claude.json ← cwork가 여기 읽음 (CLAUDE_CONFIG_DIR=~/.claude-work)
```

`serena setup claude-code` 후, 두 profile store 모두 serena entry가 여전히 missing이에요. `/mcp`가 N개 다른 server를 보여주지만 serena는 없어요. plain `claude`(orphan entry를 읽었을 텐데)는 zshrc launcher gate에 의해 disabled. serena MCP entry가 어떤 profile도 안 읽는 파일에 sit해요.

Fix:

```bash
CLAUDE_CONFIG_DIR=~/.claude      serena setup claude-code
CLAUDE_CONFIG_DIR=~/.claude-work serena setup claude-code
```

env override로 installer를 두 번 다시 실행해서, 두 profile-specific store에 entry가 land해요. `~/.claude.json`의 orphan은 그대로 둬도 돼요. plain `claude`는 gate-off됐고 그 파일은 건드리면 안 되는 다른 unrelated state key(OAuth, growthbook flag 등)를 많이 가지고 있어요.

### 2. `--system-prompt` vs `--append-system-prompt`

Serena docs의 example:

```bash
claude --system-prompt="$(serena prompts print-cc-system-prompt-override)"
```

흔한 (잘못된) 가정: `--system-prompt`은 `--print` mode 전용이라서 interactive launcher에 `--append-system-prompt`을 강제. Wrong — 두 flag 모두 interactive Claude Code에서 작동해요(`claude --help`로 검증). 실질적 차이:

| Flag                     | Behavior                                    |
| ------------------------ | ------------------------------------------- |
| `--system-prompt`        | default system prompt를 완전히 REPLACE     |
| `--append-system-prompt` | default system prompt에 APPEND              |

Serena의 override는 ~7800자로 `"You are Claude Code, Anthropic's official CLI for Claude..."`로 시작 — **replacement**로 작성됨. `--append-`를 사용하면 두 개의 `"You are Claude Code..."` preamble이 redundantly stack되어 override의 signal을 dilute해요. `--system-prompt` 사용.

### 3. Symlink Atomic-Rename Drift

`~/.claude/settings.json`과 `~/.claude-work/settings.json` 모두 `3b/.agents/global-claude-setup/settings.json`(SoT)로 symlink되어야 해요. 실제로는 Claude Code의 UI가 부하 아래서 atomic하게 다시 써요(create-temp-then-rename), symlink inode를 regular file로 silently 교체. SoT의 새 hook install 후 profile copy는 symlink가 `/check-symlinks`(또는 `ln -sf {SoT} ~/.claude/settings.json`)로 복원될 때까지 stale 유지. `claude-mem` 제거 시도 #1, #2를 defeat한 같은 bug class.

### 4. Codex MCP는 Out of the Box로 작동

`serena setup codex`는 `~/.codex/config.toml`에 쓰는데, `3b/.agents/global-codex-setup/config.toml`에 symlink돼 있어요. Single profile, `cpers`/`cwork` 아날로그 없음 → installer 함정 없음. MCP entry가 그냥 작동해요. Hook setup은 manual로 남아요.

## 전체 install 시퀀스

### Step 1 — Claude profile당 MCP entry

```bash
# Personal profile
CLAUDE_CONFIG_DIR=~/.claude      serena setup claude-code
# Work profile
CLAUDE_CONFIG_DIR=~/.claude-work serena setup claude-code
```

`~/.claude/.claude.json`과 `~/.claude-work/.claude.json` 모두 다음을 포함하는지 verify:

```json
"serena": {
  "type": "stdio",
  "command": "serena",
  "args": ["start-mcp-server", "--context=claude-code", "--project-from-cwd"],
  "env": {}
}
```

Codex MCP entry는 one-shot: `serena setup codex` (이 setup에서 `~/.codex/config.toml`에 쓰는데 — 이미 3B SoT로 symlinked).

### Step 2 — Claude SoT settings.json에 4개 hook

`3b/.agents/global-claude-setup/settings.json`(symlinked SoT) edit:

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

Hook 의미(Serena docs에서):

| Hook         | Event                         | Effect                                                                                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| activate     | SessionStart                  | session 시작 시 agent에게 project activate를 prompt, Serena instruction 읽기.                                                       |
| remind       | PreToolUse (`""`)             | internally throttled — consecutive non-Serena tool call(Read/Grep/etc.) 후 agent를 Serena tool로 nudge.                             |
| auto-approve | PreToolUse (`mcp__serena__*`) | CC가 `acceptEdits` mode일 때 Serena call을 auto-approve(destructive한 `replace_symbol_body`, `rename_symbol` 같은 것 포함).         |
| cleanup      | Stop                          | session end에 hook session state cleanup.                                                                                            |

### Step 3 — Codex SoT hooks.json에 1개 hook

`3b/.agents/global-codex-setup/hooks.json` edit:

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "serena-hooks activate --client=codex" }] }
]
```

Codex docs는 `SessionStart`만 explicitly 권장 — Codex hook system이 "less refined"이고 Codex가 natively less drift를 보여요. `auto-approve`는 적용 안 함(no `acceptEdits` 아날로그). `remind`/`cleanup`은 docs가 endorse 안 함; drift 표면화하면 나중에 add.

### Step 4 — SoT symlink 복원

```bash
# Claude Code의 /check-symlinks skill, 또는 manually:
ln -sf /Users/brandonwie/dev/personal/3b/.agents/global-claude-setup/settings.json /Users/brandonwie/.claude/settings.json
ln -sf /Users/brandonwie/.claude/settings.json /Users/brandonwie/.claude-work/settings.json
```

Work profile이 personal을 통해 chain(per `setup.sh` line 241+)되어서 single SoT edit이 둘 다에 propagate.

### Step 5 — Shell launcher의 system-prompt override

`dotfiles/zsh/.zshrc`(또는 `cpers`/`cwork` 정의된 곳):

```zsh
# Lazy cache — shell session당 one subprocess.
function _serena_cc_prompt() {
  if [[ -z "${_SERENA_CC_PROMPT_CACHE-}" ]]; then
    _SERENA_CC_PROMPT_CACHE=$(serena prompts print-cc-system-prompt-override 2>/dev/null)
  fi
  printf '%s' "${_SERENA_CC_PROMPT_CACHE}"
}

function cwork() {
  >&2 printf '[claude] profile=work dir=%s cwd=%s\n' "${HOME}/.claude-work" "$PWD"
  CLAUDE_CONFIG_DIR=~/.claude-work command claude --system-prompt="$(_serena_cc_prompt)" "$@"
}

function cpers() {
  >&2 printf '[claude] profile=personal dir=%s cwd=%s\n' "${HOME}/.claude" "$PWD"
  CLAUDE_CONFIG_DIR=~/.claude command claude --system-prompt="$(_serena_cc_prompt)" "$@"
}
```

Graceful degradation: `serena`가 missing/broken이면 `_serena_cc_prompt`가 empty return → `--system-prompt=""`(no-op). serena 설치 안 돼도 launcher 작동.

### Step 6 — 검증

```bash
# 1. Binary reachable
which serena serena-hooks
serena --version
serena-hooks --help | grep -E "activate|remind|cleanup|auto-approve"

# 2. Profile당 MCP entry
jq '.mcpServers.serena' ~/.claude/.claude.json
jq '.mcpServers.serena' ~/.claude-work/.claude.json
grep -A 2 '\[mcp_servers.serena\]' ~/.codex/config.toml

# 3. Claude SoT의 hook count(4개 serena-hooks entry 예상)
jq '[.hooks.SessionStart, .hooks.PreToolUse, .hooks.Stop] | flatten
    | map(select(.hooks[].command | contains("serena-hooks")))
    | length' \
  ~/dev/personal/3b/.agents/global-claude-setup/settings.json

# 4. Codex SoT의 hook count(SessionStart 아래 1개 serena-hooks entry 예상)
jq '.hooks.SessionStart' \
  ~/dev/personal/3b/.agents/global-codex-setup/hooks.json

# 5. Symlink 복원됨
ls -la ~/.claude/settings.json ~/.claude-work/settings.json

# 6. Launcher가 flag 전달
zsh -c 'source ~/.zshrc; which cpers' | grep system-prompt
```

Claude Code 재시작. `/mcp`가 이제 profile당 적절한 user MCP section 아래 `serena · ✔ connected`를 보여줘야 해요.

## 대안들 대신 이 접근을 선택한 이유

5가지 obvious approach와 env-override + SoT path를 chosen 만든 trade-off:

| Approach                                          | Pro                                            | Con                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Profile당 `~/.claude/.claude.json` hand-edit       | 가장 직접적                                      | 그 파일이 그 profile의 OAuth/state store이기도 함 — unrelated key 손상 위험.                                 |
| `serena setup claude-code` + `CLAUDE_CONFIG_DIR`  | upstream installer 사용, env-overridden        | 두 번 installer 호출, 그러나 trivially cheap. **선택됨.**                                                    |
| SoT `mcpServers` block hand-edit                   | Single source                                   | `mcpServers`가 SoT `settings.json`이 아닌 profile당 `~/.claude/.claude.json`에 살아요. 적용 안 됨.            |
| Repo당 `claude mcp add --scope project`           | Repo-scoped                                    | "global" intent를 defeat — repo당 install 기억해야 함.                                                        |
| Auto-approve hook skip                            | 더 단순                                         | `acceptEdits` mode에서 destructive Serena call의 blanket-approval coverage 손실.                              |

선택된 approach(env-override + SoT symlink + shell-launcher injection)는 install을 global 유지, 기존 3B SoT pipeline 활용, Serena uninstall 시 gracefully degrade.

## multi-profile MCP install에 대한 핵심 takeaway

- **MCP entry는 profile-specific `.claude.json` 파일에 살아요**, shared SoT `settings.json`이 아님. 둘은 완전히 다른 파일(하나는 hook/permission/plugin 포함, 다른 하나는 MCP server + OAuth state 포함).
- **`claude mcp add --scope user`는 env override 없이 직접 호출할 때만 `CLAUDE_CONFIG_DIR`을 무시.** env를 explicitly 설정하면 fix: `CLAUDE_CONFIG_DIR=~/.claude-work claude mcp add ...`.
- **Opus 4.7에 4-hook layout이 optional이 아니라 necessary.** system-prompt override + remind hook 없이는 agent가 `find_symbol`/`get_symbols_overview`보다 `Read`와 `Grep`을 강하게 선호 — Serena 설치의 point를 defeat.
- **Codex는 less 필요.** Single MCP entry + 1개 SessionStart hook. `auto-approve` 아날로그 없음. `--system-prompt` override 필요 없음(Codex가 natively less drift).
- **모든 settings.json이나 `.claude.json` 변경 후 Claude Code 재시작.** in-flight session은 새 MCP entry나 새 hook을 안 가져옴.
- **SoT 파일이 관련된 모든 install/upgrade 후 symlink 검증.** atomic-rename drift class(UI가 symlink를 regular file로 다시 씀)가 SoT pipeline을 silently break.

## 이게 맞는 상황

이건 Claude Code dual-profile 설정에 새 MCP server 설치, `cpers`/`cwork`가 이미 존재하는 새 머신을 Serena로 onboarding, installer가 successfully 실행된 후 "MCP server가 register됐는데 `/mcp`가 안 보여줌" 진단의 패턴이에요. Single-profile Claude Code 설정(no `CLAUDE_CONFIG_DIR` indirection — `serena setup claude-code` works as-is)과 per-repo(project-scope) MCP installation(`mcp.json`을 directly edit하는 다른 메커니즘)은 skip.

## References

- [Serena docs § Connecting Your MCP Client — Claude Code](https://oraios.github.io/serena/02-usage/030_clients.html#claude-code)
- [Serena docs § Codex (CLI and App)](https://oraios.github.io/serena/02-usage/030_clients.html#codex-cli-and-app)
- [Claude Code CLI reference (--system-prompt / --append-system-prompt)](https://docs.claude.com/en/docs/claude-code/cli-reference)

---
title: Claude Code Multi-Profile HUD Setup
description: "Running Claude Code with multiple accounts (e.g., personal + work) requires"
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - general
  - claude-code
  - hud
  - multi-account
  - devtools
category: general
draft: false
lang: en
references:
  - url: "https://github.com/anthropics/claude-code"
    title: Claude Code GitHub repository
    type: official
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code documentation
    type: official
---

careful configuration of the HUD plugin to show correct per-account usage stats.

---

## The Problem

When running Claude Code with separate personal and work accounts, the HUD
(heads-up display) plugin shows usage stats from the wrong account. The work
profile displays personal account consumption (or vice versa), making it
impossible to track per-account usage accurately. This happens because Claude
Code does not pass the `CLAUDE_CONFIG_DIR` environment variable to statusline
subprocesses.

---

## Difficulties Encountered

- **Env var not forwarded to subprocesses:** Assumed `CLAUDE_CONFIG_DIR` would
  propagate to the statusline wrapper script, but Claude Code strips it. Only
  discovered after extensive debugging of the wrapper receiving the wrong config
  path.
- **Keychain entries look identical at first glance:** Both profiles create
  keychain entries under similar service names. The suffix hash differentiating
  them is not obvious, leading to confusion about which entry belongs to which
  profile.
- **Duplicate keychain entries cause unpredictable reads:** macOS
  `security find-generic-password` returns the first match, so duplicates
  silently return wrong credentials with no error.
- **HUD binaries are independent per profile:** Initially assumed symlinks would
  work, but each profile's plugin binary must be patched independently.
- **Token sync was a red herring:** Attempted to sync tokens between keychain
  entries, which overwrote valid tokens with stale ones. Claude manages tokens
  natively per profile.

---

## Key Points

- Claude Code supports multiple profiles via `CLAUDE_CONFIG_DIR` env var
- Each profile gets its own keychain entry with a unique suffix (hash of config
  path)
- Claude Code does **not** pass `CLAUDE_CONFIG_DIR` to statusline subprocesses
- The HUD plugin must be patched to read profile-specific env vars

## The Env Var Passthrough Problem

Claude Code runs the statusline command as a subprocess but does not forward
`CLAUDE_CONFIG_DIR`. This means a wrapper script that reads
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` will always default to the personal
profile.

**Solution:** Embed the env var directly in each profile's `settings.json`
statusline command:

```json
// Personal — defaults to ~/.claude, no override needed
"command": "/path/to/statusline-wrapper.sh"

// Work — must explicitly set CLAUDE_CONFIG_DIR
"command": "CLAUDE_CONFIG_DIR=/path/to/.claude-work /path/to/statusline-wrapper.sh"
```

## Profile Architecture

```text
~/.claude/              (personal, default)
├── plugins/cache/claude-hud/   (independent binary, patched)
└── settings.json               (statusline → wrapper)

~/.claude-work/         (work)
├── plugins/cache/claude-hud/   (independent binary, patched)
└── settings.json               (statusline → CLAUDE_CONFIG_DIR=... wrapper)
```

Each profile has its own **independent** HUD binary. These are not symlinked and
must be patched separately.

## Required Patches

The HUD source (`usage-api.ts`) needs patches to read env vars:

| Patch                                            | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `CLAUDE_HUD_KEYCHAIN_SERVICE`                    | Read from profile-specific keychain entry |
| `CLAUDE_HUD_CONFIG_DIR` (homeDir)                | Custom base directory for cache           |
| `CLAUDE_HUD_CONFIG_DIR` (getCachePath)           | Correct cache file path                   |
| `CLAUDE_HUD_CONFIG_DIR` (getKeychainBackoffPath) | Correct backoff path                      |

## Token Management

Claude Code manages OAuth tokens natively:

- Auto-creates profile-specific keychain entries on login
- Auto-refreshes tokens before expiration
- No manual sync needed — syncing between entries is harmful

**When `/login` is needed:** Only after refresh token revocation, new machine
setup, or manual keychain deletion.

## Common Pitfalls

1. **Don't sync tokens between keychain entries** — Claude manages them natively
   per profile
2. **Don't assume env vars pass through** — embed in statusline command
3. **Patch both profiles** — HUD binaries are independent per profile
4. **Reload shell after `.zshrc` changes** — old functions stay in memory
5. **Check for duplicate keychain entries** — causes unpredictable reads

---

## When to Use

- Running Claude Code with separate personal and work Anthropic accounts
- Needing per-account usage tracking in the terminal statusline
- Setting up a new machine with multiple Claude Code profiles
- Debugging HUD showing incorrect usage numbers

## When NOT to Use

- Single-account setups: no need for profile separation or HUD patches
- If you only use the web UI: HUD is a terminal/CLI feature
- If you do not use the HUD plugin at all: the multi-profile env var setup
  (`CLAUDE_CONFIG_DIR`) works without HUD patches
- As a general macOS keychain guide: see the macOS keychain multi-account
  post (coming soon) for keychain-specific knowledge

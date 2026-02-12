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

My work profile's HUD was showing my personal account's usage stats. I was
tracking the wrong numbers for a week before I realized the data was crossed.
The fix took hours of debugging because the failure mode was completely silent
-- no errors, just wrong numbers.

If you run Claude Code with separate personal and work accounts, the HUD
plugin needs explicit configuration to show the right stats for each profile.

## Why This Matters

Claude Code supports multiple profiles via the `CLAUDE_CONFIG_DIR` environment
variable. You can have `~/.claude` for personal and `~/.claude-work` for your
work account. Each profile gets its own OAuth tokens, settings, and plugins.

The problem is that Claude Code does not pass `CLAUDE_CONFIG_DIR` to statusline
subprocesses. The HUD plugin runs as a subprocess, so it always falls back to
the default path (`~/.claude`). Your work profile shows personal account usage.
Your personal profile works fine because it is the default.

This is not a bug in the obvious sense. The HUD shows data. It just shows the
wrong data. That makes it harder to catch than a crash.

## The Difficulties

**The env var was not forwarded to subprocesses.** I assumed
`CLAUDE_CONFIG_DIR` would propagate to the statusline wrapper script, but Claude
Code strips it. I only discovered this after extensive debugging of the wrapper
receiving the wrong config path.

**Keychain entries looked identical at first glance.** Both profiles create
keychain entries under similar service names. The suffix hash differentiating
them is not obvious, leading to confusion about which entry belongs to which
profile.

**Duplicate keychain entries caused unpredictable reads.** macOS
`security find-generic-password` returns the first match. If duplicates exist,
it silently returns wrong credentials with no error.

**HUD binaries are independent per profile.** I initially assumed symlinks
would work, but each profile's plugin binary must be patched independently.
Symlinks mean both profiles share the same binary, which defeats the purpose.

**Token sync was a red herring.** I attempted to sync tokens between keychain
entries, which overwrote valid tokens with stale ones. Claude manages tokens
natively per profile. Manual intervention makes things worse, not better.

## The Solution

Embed the `CLAUDE_CONFIG_DIR` directly in each profile's `settings.json`
statusline command. This bypasses the env var forwarding problem entirely.

```json
// Personal -- defaults to ~/.claude, no override needed
"command": "/path/to/statusline-wrapper.sh"

// Work -- must explicitly set CLAUDE_CONFIG_DIR
"command": "CLAUDE_CONFIG_DIR=/path/to/.claude-work /path/to/statusline-wrapper.sh"
```

The personal profile does not need the override because `~/.claude` is the
default. The work profile needs `CLAUDE_CONFIG_DIR` set inline so the wrapper
script knows which config directory (and therefore which keychain entry) to
read.

## Profile Architecture

```text
~/.claude/              (personal, default)
  plugins/cache/claude-hud/   (independent binary, patched)
  settings.json               (statusline -> wrapper)

~/.claude-work/         (work)
  plugins/cache/claude-hud/   (independent binary, patched)
  settings.json               (statusline -> CLAUDE_CONFIG_DIR=... wrapper)
```

Each profile has its own independent HUD binary. These are not symlinked and
must be patched separately. The binary reads env vars to determine which
keychain entry and cache path to use.

## Required Patches

The HUD source (`usage-api.ts`) needs four patches to read profile-specific
env vars:

| Patch                                            | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `CLAUDE_HUD_KEYCHAIN_SERVICE`                    | Read from profile-specific keychain entry |
| `CLAUDE_HUD_CONFIG_DIR` (homeDir)                | Custom base directory for cache           |
| `CLAUDE_HUD_CONFIG_DIR` (getCachePath)           | Correct cache file path                   |
| `CLAUDE_HUD_CONFIG_DIR` (getKeychainBackoffPath) | Correct backoff path                      |

Each patch checks for an environment variable and falls back to the default if
it is not set. This means the personal profile works without any env vars, and
the work profile works when the env vars are set in the statusline command.

## Token Management

Claude Code manages OAuth tokens natively per profile:

- Auto-creates profile-specific keychain entries on login
- Auto-refreshes tokens before expiration
- No manual sync needed

Syncing tokens between keychain entries is actively harmful. It overwrites valid
tokens with stale ones from another profile, causing authentication failures.

**When `/login` is needed:** Only after a refresh token is revoked, on new
machine setup, or after manual keychain deletion. In normal operation, Claude
handles the token lifecycle automatically.

## Common Pitfalls

These are the mistakes I made (and you should avoid):

1. **Do not sync tokens between keychain entries.** Claude manages them natively
   per profile. Manual sync breaks things.
2. **Do not assume env vars pass through.** Embed `CLAUDE_CONFIG_DIR` in the
   statusline command.
3. **Patch both profiles.** HUD binaries are independent per profile. Patching
   one does not patch the other.
4. **Reload your shell after `.zshrc` changes.** Old functions stay in memory.
   The new config will not take effect until you open a new terminal.
5. **Check for duplicate keychain entries.** Duplicates cause unpredictable
   reads. Use `security find-generic-password -a` to list entries and delete
   duplicates.

## Why This Works

The inline env var approach works because it sidesteps the forwarding problem
entirely. Instead of relying on Claude Code to pass env vars to subprocesses
(which it does not do), you bake the correct value into the command string
itself.

The HUD binary then reads `CLAUDE_CONFIG_DIR` from its environment, resolves
the correct keychain entry and cache path, and displays the right usage stats.
Each profile is fully independent.

## Practical Takeaway

**Use this setup** if you run Claude Code with separate personal and work
Anthropic accounts and want accurate per-account usage tracking in your terminal
statusline.

**Skip it** for single-account setups (no profile separation needed), if you
only use the web UI (HUD is a terminal feature), or if you do not use the HUD
plugin at all. The basic multi-profile setup (`CLAUDE_CONFIG_DIR`) works without
HUD patches -- the patches are only needed for accurate statusline stats.

The key insight: Claude Code's subprocess environment is not what you expect.
When in doubt, embed values directly in command strings rather than relying on
env var inheritance.

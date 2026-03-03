---
title: Claude Code Multi-Profile HUD Setup
description: "Running Claude Code with multiple accounts requires careful HUD configuration to show correct per-account usage stats. Here's how to fix cross-profile data leaks."
date: 2026-02-04T00:00:00.000Z
updated: 2026-03-03T00:00:00.000Z
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
  - url: "https://github.com/jarrodwatts/claude-hud"
    title: Claude HUD plugin repository
    type: official
---

My work profile's HUD was showing personal account usage stats. I tracked the
wrong numbers for a week before realizing the data was crossed. Fixing it took
hours of debugging because the failure mode was completely silent — no errors,
just wrong numbers.

If you run Claude Code with separate personal and work accounts, the HUD plugin
needs explicit configuration to show the right stats for each profile.

## Why It Matters

Claude Code supports multiple profiles through the `CLAUDE_CONFIG_DIR`
environment variable. You can have a personal `~/.claude` and a work
`~/.claude-work`, each with its own OAuth tokens, settings, and plugins.

The problem is that Claude Code does not pass `CLAUDE_CONFIG_DIR` to statusline
subprocesses. The HUD plugin runs as a subprocess, so it always falls back to the
default path (`~/.claude`). The work profile ends up showing personal account
usage. The personal profile works fine since it's the default.

This isn't a bug in the obvious sense — the HUD still shows data. It just shows
the wrong data. That makes it harder to catch than a crash.

## Difficulties Encountered

**The environment variable didn't propagate.** I assumed `CLAUDE_CONFIG_DIR`
would pass through to the statusline wrapper script, but Claude Code strips it.
I only discovered this after extensive debugging of the wrapper receiving the
wrong config path.

**Keychain entries looked identical at first glance.** Both profiles create
keychain entries under similar service names. The suffix hash that differentiates
them isn't obvious, so it was easy to confuse which entry belonged to which
profile.

**Duplicate keychain entries caused unpredictable reads.** macOS
`security find-generic-password` returns the first match. With duplicates, it
silently returns wrong credentials — no error, just the wrong data.

**HUD binaries are independent per profile.** I initially assumed symlinks would
work, but each profile's plugin binary must be patched independently. Symlinking
makes both profiles share the same binary, defeating the purpose.

**Token sync was a red herring.** I tried syncing tokens between keychain
entries, which overwrote valid tokens with stale ones. Claude manages tokens
natively per profile — manual intervention makes things worse.

**Both tokens can expire silently.** The profile-specific keychain entry only
updates on clean session exit (via the `_claude_sync_token` hook). If sessions
are closed uncleanly — terminal kill, crash — the profile entry goes stale while
the default entry stays fresh. When the default also expires, both fallback paths
fail simultaneously and usage shows nothing. No error, just null data.

**The failure cache masks the real cause.** `usage-api.ts` caches API failures
for 15 seconds (`CACHE_FAILURE_TTL_MS`). Reading the cache file shows
`apiUnavailable: true`, which looks like an API outage. The real cause is expired
credentials that prevented the API call entirely. This misdirection cost
significant debugging time.

**Source TypeScript is behind compiled dist JavaScript.** The HUD plugin has two
code paths — `src/` (TypeScript, run by bun) and `dist/` (compiled JS). Plugin
updates install new dist but don't update source. Features like `quotaBar`,
`showSpeed`, `contextValue`, `usageBarEnabled`, and `sevenDayThreshold` only
existed in dist while source still had hardcoded values and missing functions.
Patching must target `src/` files since the wrapper runs `bun src/index.ts`.

**Piped subprocesses have no terminal width.** I attempted auto-wrap at `|`
boundaries, but `process.stderr.columns`, `process.stdout.columns`, and
`$COLUMNS` all return undefined or 0 in the piped statusline subprocess. Claude
Code's statusline renderer controls final line truncation — the HUD cannot detect
or work around this.

**sed `r` with address range inserts on every line.** Using
`sed "/start/,/end/r file"` inserts the file after every line in the range, not
just the last. For precise insertions after a function body, use awk
insert-before on a unique anchor line below the target instead.

**`getOutputSpeed` return type mismatch.** The speed-tracker returns
`number | null` directly, but I wrote code assuming it returns
`{ speed, outputTokens }`. This caused intermittent `undefined is not an object`
TypeErrors — triggered only when speed was non-null, which is rare due to the
2-second measurement window.

## The Solution

Embed `CLAUDE_CONFIG_DIR` directly in each profile's `settings.json` statusline
command. This bypasses the env var passthrough problem entirely.

```json
// Personal — defaults to ~/.claude, no override needed
"command": "/path/to/statusline-wrapper.sh"

// Work — must explicitly set CLAUDE_CONFIG_DIR
"command": "CLAUDE_CONFIG_DIR=/path/to/.claude-work /path/to/statusline-wrapper.sh"
```

The personal profile doesn't need an override since `~/.claude` is the default.
The work profile sets `CLAUDE_CONFIG_DIR` inline so the wrapper script knows
which config directory (and therefore which keychain entry) to read.

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
must be patched separately. The binary reads environment variables to determine
which keychain entry and cache path to use.

## Required Patches

The HUD source (`usage-api.ts`) needs patches to read env vars:

| Patch                                            | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| `CLAUDE_HUD_KEYCHAIN_SERVICE`                    | Read from profile-specific keychain entry |
| `CLAUDE_HUD_CONFIG_DIR` (homeDir)                | Custom base directory for cache           |
| `CLAUDE_HUD_CONFIG_DIR` (getCachePath)           | Correct cache file path                   |
| `CLAUDE_HUD_CONFIG_DIR` (getKeychainBackoffPath) | Correct backoff path                      |

Each patch checks the environment variable and falls back to the default if
unset. The personal profile works without variables, and the work profile works
when the variables are set in the statusline command.

## HUD Configuration

The HUD plugin supports several configuration options worth knowing:

**Layout modes.** Two choices: `"compact"` (single line, truncates on narrow
terminals) and `"expanded"` (multiline with identity, project, environment, and
usage on separate lines). Use `"expanded"` to avoid losing information to
truncation.

**Patch durability.** Plugin updates overwrite source files. Maintain an
`apply-patches.sh` script to reapply patches after updates — as of March 2026,
this covers 22 patches across 14 groups.

**Always show the 7-day usage window.** Set `sevenDayThreshold: 0` in config.
The default (`80`) hides the 7-day window until usage exceeds 80%.

**Output token speed.** Enable `showSpeed` to display output token speed (tok/s)
via the `speed-tracker.ts` module.

**Context display modes.** The `contextValue` option switches context display
between `'percent'` and `'tokens'` in both compact and expanded layouts.

**Expanded layout order.** Customizable via `render/index.ts` template — project
(with model badge) → combined context+usage → activity → environment.

**Speed tracker return type.** `getOutputSpeed()` returns `number | null`
directly, not an object. Check the return type carefully when integrating speed
into custom renderers.

## Token Management

Claude Code manages OAuth tokens natively per profile:

- Auto-creates profile-specific keychain entries on login
- Auto-refreshes tokens before expiration
- No manual sync needed — syncing between entries is harmful

**When `/login` is needed:** After refresh token revocation, new machine setup,
manual keychain deletion, or when both profile-specific and default tokens have
expired. You can diagnose the dual-expiry scenario by checking for
`apiUnavailable: true` in the cache file combined with expired `expiresAt`
timestamps in keychain entries.

## Common Pitfalls

These are the mistakes I made (and you should avoid):

1. **Don't sync tokens between keychain entries.** Claude manages them natively
   per profile. Manual sync breaks things.
2. **Don't assume env vars pass through.** Embed `CLAUDE_CONFIG_DIR` in the
   statusline command.
3. **Patch both profiles.** HUD binaries are independent per profile. Patching
   one doesn't patch the other.
4. **Reload your shell after `.zshrc` changes.** Old functions stay in memory.
   New settings only apply in new terminal sessions.
5. **Check for duplicate keychain entries.** Duplicates cause unpredictable reads.
   List entries with `security find-generic-password -a` and remove duplicates.

## Why This Works

The inline environment variable approach works because it completely bypasses
the passthrough problem. Instead of relying on Claude Code to forward env vars
to subprocesses (which it doesn't), the correct values are embedded in the
command string itself.

The HUD binary reads `CLAUDE_CONFIG_DIR` from its own environment, resolves the
correct keychain entry and cache path, and displays the right usage stats. Each
profile is fully independent.

## Practical Tips

**Use this setup when:** You run Claude Code with separate personal and work
Anthropic accounts and need accurate per-account usage tracking in the terminal
statusline.

**Skip this when:** You have a single account (no profile separation needed),
only use the web UI (HUD is a terminal feature), or don't use the HUD plugin at
all. The basic multi-profile setup (`CLAUDE_CONFIG_DIR`) works without HUD
patches — patches are only needed for accurate statusline stats.

The key insight: Claude Code's subprocess environment may not match your
expectations. When in doubt, embed values directly in the command string rather
than relying on environment variable inheritance.

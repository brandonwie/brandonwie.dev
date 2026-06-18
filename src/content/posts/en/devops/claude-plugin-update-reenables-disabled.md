---
title: 'Why your updater keeps re-enabling the Claude plugins you disabled'
description: 'I kept a couple of plugins deliberately off, ran my updater, and they came back on. The script provably never re-enabled anything — because the re-enable was not the script''s to begin with. Here is the snapshot-and-reassert guard that stopped the toil.'
date: 2026-06-06T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - claude-code
  - transferable
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.anthropic.com/en/docs/claude-code/plugins'
    title: Claude Code plugins
    type: official
source_content_hash: b50f459c3c0ce287568e0cfb090d5d8b44736fc32c82a35b01f77ede27807a26
---

I keep a couple of Claude Code plugins and MCP servers deliberately turned off. I
set `enabledPlugins["x"]: false` (or add the server to `disabledMcpjsonServers`),
go about my day, run my toolchain updater — and find the thing switched back on.
Disable it again. Next update, back on again. After the third round of this I
stopped treating it as a fluke and went looking for whatever kept flipping the
switch.

The frustrating part was that I could look straight at my updater and "prove" it
wasn't the culprit. The proof was wrong, but it took me a while to see why.

## The proof that lied

My updater enumerates `claude plugin list`, filters to the enabled plugins, and
only calls `claude plugin update` on those — the awk filter drops any row marked
`Status: ... disabled`. There is no `claude plugin enable` anywhere in the
script. You can grep it top to bottom and convince yourself it cannot possibly
re-enable anything. I convinced myself, twice.

Two things kept the bug out of focus. First, a no-op update hides it completely:
if every plugin is already on the latest version, the update barely touches
`settings.json`, the disabled set survives untouched, and the logs from that run
look innocent. The bug only fires when a plugin **actually** installs a new
version — so half my test runs "exonerated" the updater. Second, there are
several look-alike vectors that flip disabled→enabled and present identically:

- the `settings.json` atomic-rename symlink trap, where a `claude plugin` write
  swaps the symlink for a regular file;
- `enableAllProjectMcpServers: true` quietly turning on every project
  `.mcp.json` server;
- marketplace reconciliation re-applying enable-defaults.

I chased the wrong one of those for a while before stepping back.

## What was actually happening

`enabledPlugins["x"]: false` is not a hard uninstall. It is cosmetic, reversible
state that lives in `settings.json`. When `claude plugin update <name>` installs
a real new version — or `claude plugin marketplace update` reconciles the catalog
— the Claude CLI rewrites `settings.json` itself, and that rewrite can reset
`enabledPlugins` and `disabledMcpjsonServers` back to their enabled defaults.

That is the whole trick. The re-enable is the CLI's own write, not a command my
script chose to run. My careful enabled-only loop was irrelevant, because the
flip happened as a side effect of the CLI's settings reconciliation. No amount of
auditing the script would ever find it — it wasn't in the script.

## The fix that doesn't care which vector fired

Once I understood the re-enable could come from any of several places, I stopped
trying to fix the specific mechanism and wrapped the whole update in a
snapshot-and-reassert guard:

1. **Before** anything touches Claude, snapshot the disabled set — every
   `enabledPlugins` entry that is `false`, the `disabledMcpjsonServers` list, and
   `enableAllProjectMcpServers` — for each config profile. Dedupe by
   `fs.realpathSync()` so profiles that symlink to the same source-of-truth
   `settings.json` get recorded once.
2. **After** the update and its verify step, re-resolve each profile's
   `settings.json` _fresh_ (the update may have broken a symlink mid-run), then
   re-assert the snapshot — set back to `false` anything that flipped on, re-add
   dropped `disabledMcpjsonServers` entries, restore `enableAllProjectMcpServers`
   if it was explicitly off.

Two details matter for correctness. The write has to be **symlink-safe**: write
to the `realpath` of `settings.json`, in place, so it follows the symlink and
truncates the target instead of doing the `rename(2)` that would replace the link
with a regular file. That rename is itself one of the re-enable vectors — you do
not want your fix to trigger the bug. And the guard should **only re-assert prior
disables**: a plugin the update newly installed was never in the snapshot, so it
stays enabled. The guard restores intent; it does not freeze the plugin set.

In my own setup this lives in a small `preserve-disabled-state.js` with
`--snapshot` / `--restore` modes, called from the updater right after preflight
and right after verify. The shape is what matters, not the filename.

## Why a guard instead of fixing the mechanism

| Option | Pros | Cons |
| --- | --- | --- |
| Snapshot → re-assert guard (chosen) | Mechanism-agnostic; auto-fixes; produces a before→after diff | Writes `settings.json` (needs symlink-safety + backup) |
| Chase the specific CLI mechanism | Targeted | Fragile — Claude-internal behavior shifts across versions, and more than one vector can fire |
| Diagnostic before→after diff only | Non-mutating; proves the behavior | Doesn't fix the toil — you still re-disable by hand |

Chasing one specific Claude-internal behavior is fragile precisely because the
behavior is undocumented and changes across CLI versions, and because several
vectors can produce the same symptom. The guard sidesteps all of that: whatever
turned the plugin back on, the after-pass turns it back off. I kept a non-mutating
diff mode around too, because seeing the before→after is what convinced me the
guard was doing the right thing rather than papering over a different bug.

## When this applies

Reach for it when an updater — `/sync-update-everything`, a cron job, a setup script — runs
`claude plugin update` or `claude plugin marketplace update` and you keep
specific plugins or MCP servers intentionally disabled, and you've watched them
come back on after updates.

Skip it if you never disable anything (there's no intent to preserve), or if you
disable for capability removal rather than a cosmetic hide — in that case
re-asserting `false` only hides the plugin, it doesn't uninstall it, so you want
to remove the entry from `installed_plugins.json` and delete the cache directory
instead.

## The takeaway

If a setting you control keeps reverting, check whether something else owns the
file you're writing to. Here the CLI treated `settings.json` as its own to
reconcile, so the durable fix was never a better disable command — it was
snapshotting my intent and re-asserting it after the tool had taken its turn.

## References

- [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins)

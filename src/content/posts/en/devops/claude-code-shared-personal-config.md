---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: Split AI instructions into committed (shared) and gitignored (personal) layers
date: 2026-02-04T00:00:00.000Z
updated: "2026-08-02"
tags:
  - devops
  - claude-code
  - ai-config
  - onboarding
category: devops
draft: false
lang: en
expanded: true
source_content_hash: dcbe64a1d4804ca000c8bd25992698e9f82f45e4b8b816980e208de3d0ca6037
references:
  - url: "https://code.claude.com/docs/en/memory"
    title: "Claude Code docs — How Claude remembers your project (CLAUDE.md load order)"
    type: official
  - url: "https://code.claude.com/docs/en/permissions"
    title: "Claude Code docs — Configure permissions (deny → ask → allow evaluation order)"
    type: official
  - url: "https://code.claude.com/docs/en/settings"
    title: "Claude Code docs — Settings files and settings precedence"
    type: official
---

I spent weeks tuning Claude Code instructions for my project: custom commands,
domain-specific prompts, coding conventions. Then a new developer joined the
team, cloned the repo, and got zero AI assistance. My entire configuration was
gitignored because it contained personal symlinks to my knowledge management
system.

The fix is a two-layer architecture: shared instructions committed to the repo
so new developers get working AI out of the box, and personal extensions
gitignored so existing developers keep their custom setup.

## The problem

When one developer uses Claude Code with personal symlinks to a knowledge
management system, the instructions are invisible to everyone else who clones
the repo. Everything is gitignored, so every other developer starts with a blank
slate. The challenge is splitting instructions into a shared layer that works for
the whole team and a personal layer that stays private, without duplication or
drift.

## Architecture

The split looks like this:

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

Shared files contain everything a new developer needs: project architecture,
coding conventions, command reference, deployment instructions. Personal files
contain per-developer preferences, private tool configs, and symlinks to
external systems.

## Design decisions

### CLAUDE.md is the single source of truth

All other AI instruction files are generated from `CLAUDE.md` via
`npm run ai:sync`. This prevents drift between Claude Code, Codex (`AGENTS.md`),
and Gemini (`GEMINI.md`). One file to edit, the rest stay in sync.

### MCP rules are softened in shared config

Personal config uses "ALWAYS USE" for Context7 and Postgres MCP. Shared config
uses "If configured" instead, since new developers may not have MCP servers set
up. The instructions still describe what the tools do and when to use them. They
just defer the requirement.

### Symlinks stay for personal-only content

`.claude/skills/` remains a symlink to my knowledge management system
(gitignored). Personal extensions that don't affect the team stay as symlinks or
in `CLAUDE.local.md`. The boundary is clear: if it helps everyone, commit it. If
it's specific to your setup, gitignore it.

## Sync script

`npm run ai:sync` reads `CLAUDE.md` and writes to three targets:

- `AGENTS.md` (exact copy)
- `.github/copilot-instructions.md` (exact copy)
- `.cursor/rules/index.mdc` (Cursor YAML frontmatter + content)

Running the script after editing `CLAUDE.md` keeps them in sync. No manual
copying, no forgetting to update one of them.

## Gitignore pattern

The `.gitignore` makes the boundary explicit:

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

New developers clone the repo and get the shared config immediately. Personal
files never leak into the repository.

## SoT directory pattern (project-claude/)

Managing the shared/personal split across multiple projects gets unwieldy fast.
The solution is a central source-of-truth directory with symlinks to each
project repo:

```text
3b/.claude/project-claude/
├── backend-project.md          # Shared SoT → {backend-repo}/CLAUDE.md (symlink)
├── backend-project.local.md    # Personal SoT → {backend-repo}/CLAUDE.local.md (symlink)
├── backend-project.mcp.json    # MCP SoT → {backend-repo}/.mcp.json (symlink)
├── infra-project.md            # Combined (personal-only repo)
├── infra-project.mcp.json      # MCP SoT → {infra-repo}/.mcp.json (symlink)
├── orchestration-project.md    # Combined (personal-only repo)
├── etl-project.md              # Combined (personal-only repo)
├── crucio.mcp.json             # MCP SoT → crucio/.mcp.json (symlink)
└── ...
```

`{backend-repo}` and `{infra-repo}` stand in for the checkout directory names of
the team repos on disk — the pattern doesn't care what they're called.

Only repos with other team members need the shared/local split. Personal-only
repos use a single combined file. `.mcp.json` follows the same pattern: the
knowledge base holds the canonical version, project repos get symlinks. Sentry
and Notion MCP servers were removed from `.mcp.json` in favor of Anthropic-hosted
integrations that require zero config and handle OAuth natively.

## Guard comments for shared files

The most common mistake with this pattern is accidentally putting personal
content into a shared file. An HTML comment at the top of each shared SoT file
prevents this:

```html
<!-- SHARED FILE. This file syncs to {repo}/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in {name}.local.md, then {repo}/CLAUDE.local.md -->
```

This works as a point-of-authorship guardrail. Claude (or a human) sees the
constraint before editing. It's more effective than rules in a separate file
because it doesn't require the editor to have loaded the rule first.

## Symlink deployment chain

For shared repos, the deployment is two hops:

```text
project-claude/{name}.md (3B SoT)
  ↓ filesystem symlink
{repo}/CLAUDE.md (Claude Code reads this)
  ↓ npm run ai:sync
AGENTS.md + copilot-instructions.md + cursor rules (team sees)
```

Guard comments at the SoT prevent personal content from leaking through both
hops. The symlink is transparent to all tools. Edits to either end modify the
same file.

## Layer deduplication strategy

After setting up shared configs for several projects, a new problem appeared: the
same universal principles (5W1H documentation, buffer format, `.me.md` rules,
communication style) were copy-pasted into every project's `CLAUDE.md`. They
drifted over time and wasted tokens on redundant instructions.

The fix is a two-step promotion:

1. **Identify duplication**: grep across all project-claude files for repeated
   instructions (buffer appeared 7 times, 5W1H appeared 6 times, `.me.md`
   appeared 4 times)
2. **Promote to global**: move the canonical version to `~/.claude/CLAUDE.md`
   and replace each project copy with a 1-line reference:
   `Universal principles (...) are in ~/.claude/CLAUDE.md.`

This works because Claude Code's loading hierarchy guarantees
`~/.claude/CLAUDE.md` loads first in every session. Project files inherit the
global rules without restating them.

**Results from the 2026-02-23 restructuring:**

- 8 universal principles promoted to global (YAML Frontmatter,
  Cross-Referencing, 5W1H, Decision Documentation, Zettelkasten, `.me.md`,
  Buffer, Communication Style)
- 7 project files deduplicated (~25-35% token savings each)
- Markdownlint quick-reference table fully removed (2026-03-09), redundant with
  `.markdownlint-cli2.jsonc` plus a husky pre-commit hook. Originally compressed
  from ~330 to ~28 lines (2026-02-23), then eliminated entirely when the tooling
  backstop proved sufficient
- Mermaid section compressed from ~89 lines to 6 lines (kept the behavioral
  rule, removed examples/tables/checklist since no tooling enforces Mermaid
  preference)
- Net result: global `CLAUDE.md` reduced from 491 → 371 lines (~24.4% savings)
- Tier 2 (2026-03-09): extracted 3 more sections to `.claude/rules/` files
  (change-discipline, yaml-frontmatter-schema, personal-folder-governance)
- Project `CLAUDE.md`: 541 → 478 (Tier 1) → 328 (Tier 2) = -39.4% total reduction
- Combined always-loaded context: 912 → 720 lines (-21%)
- 4 rules files total from the best-practices audit (+ tag-taxonomy from Tier 1)
- Every session now enforces the same principles while loading fewer lines

## Current profile settings architecture (July 2026)

The shared instruction pattern above still uses repository files and generated
projections. Private runtime settings are different. After several symlink
failure modes, I stopped chaining profile `settings.json` files together.

The current layout uses two gitignored authorities and two independent runtime
files:

```text
private authority                 runtime
─────────────────                 ───────
settings.personal.json  ─deploy→  ~/.claude/settings.json
settings.work.json      ─deploy→  ~/.claude-work/settings.json
```

Each runtime is a regular mode-`0600` file. Capture and deployment are explicit
per-profile operations; there is no background or bidirectional sync. Before a
mutation, the workflow verifies trusted parent directories, expected ownership,
valid JSON, and distinct profile identity.

The most important guardrail is a continuously monitored window with no running
Claude process. If a new process appears or the file identity is unclear, the
operation stops. Rollback is a separately approved whole-file update rather
than a best-effort merge.

This does not contradict the shared repository pattern. Team-visible
instructions can still use a repository source of truth and generated copies.
Machine-private runtime settings need a smaller blast radius and stronger
identity checks.

## Historical settings.local.json consolidation

> This section records the March 2026 design that preceded the independent-file
> architecture above. It is history, not the current deployment contract.

Per-project `settings.local.json` files were the next deduplication target. I had
14 files (8 of them symlinks from a central source) that mostly repeated the same
bash command allow-list. The main change was replacing 100+ individual `Bash(...)`
allow entries with a single `Bash(*)` catch-all, because Claude Code's permission
precedence (`deny > ask > allow`) makes that catch-all safe.

### Before (14 files, 8 symlinks)

```text
3b/.claude/settings.local.json  ← source file
  ↑ symlinked from 8 projects (brandonwie, crucio, {backend-repo}, etc.)
+ 5 independent files (dev/, personal/, dotfiles/, frontend/, mobile/)
```

Most entries were redundant with global `settings.json`, which had evolved to
cover the same commands. Only 6 items were truly unique across all files.

### After (global settings.json only)

```text
permissions.allow: ["Bash(*)"]     ← catch-all for all non-destructive commands
permissions.deny:  [dangerous]     ← terraform destroy, git push --force, sudo
permissions.ask:   [risky]         ← git push, rm, kill (prompted)
defaultMode: "default"             ← with Bash(*) catch-all, effectively auto-approved
```

The cleanup removed 8 symlinks and deleted 3 redundant regular files. Settings
like `outputStyle`, `enableAllProjectMcpServers`, and `prefersReducedMotion`
moved to global. The 3B repo keeps a minimal local file (voice hooks only), and
frontend/mobile files stay as-is since other teams manage them, 100% redundant
but harmless. New projects automatically get correct permissions from the global
config, with no per-project setup.

### Why `Bash(*)` is safe

The `deny > ask > allow` precedence means `Bash(*)` only auto-approves commands
that don't match a deny or ask pattern. Dangerous commands like
`terraform destroy` and `git push --force` are in deny. Risky commands like
`git push` and `rm` are in ask. Everything else flows through to the catch-all.

## Historical shared settings chain

> The symlink topology below was retired in July 2026. Do not recreate it from
> this incident record.

When I first wrote this up in March, I claimed `settings.json` couldn't be
symlinked across profiles and described the architecture as "three copies." That
was wrong. The actual architecture _is_ symlinked end-to-end, and per-profile
differences live in a separate `settings.local.json` override file that Claude
Code deep-merges over the shared base. I only discovered this when an audit script
flagged a broken symlink and I had to trace the chain to repair it. The
authoritative description now lives in `.claude/rules/claude-settings-lookup.md`.

The corrected topology:

- **Knowledge base SoT** (`global-claude-setup/settings.json`): the canonical
  source, gitignored because it contains machine-specific plugin install state
- **Personal profile** (`~/.claude/settings.json`): a symlink to the SoT
- **Work profile** (`~/.claude-work/settings.json`): a symlink chained through
  personal, `~/.claude-work/settings.json → ~/.claude/settings.json → SoT`. It
  is not a separate copy.
- **Work overrides** (`~/.claude-work/settings.local.json`): a symlink to a
  separate `settings.local.work.json` in the SoT directory. It contains only the
  two keys that differ from personal: `statusLine.command` (with the
  `CLAUDE_CONFIG_DIR=~/.claude-work` prefix) and `enabledMcpjsonServers` (the
  whitelist for work-specific database connections like `postgres-aws-aurora-prod`).
  Claude Code deep-merges this over the base `settings.json` at load time.

All non-override settings (env, permissions, hooks, plugins) come from the
single shared SoT through the symlink chain. Editing the SoT instantly propagates
to both profiles. There is no manual sync step.

Watch out for junk accumulation. Interactive permission approvals ("Always
allow") store the exact command string as a permission entry, including
multi-line bash scripts, entire code blocks, and auth tokens. My work profile
accumulated ~160 entries (32KB) before cleanup. The `Bash(*)` catch-all prevents
this by auto-approving before the interactive prompt fires.

## Why the shared chain failed

> The recovery commands in this section document an old topology. With the
> current independent regular-file architecture, use the profile-specific
> capture, deploy, and rollback workflow instead of re-linking settings.

The `work → personal → SoT` chain has a single-file failure mode that took me a
while to recognize. If anything breaks `~/.claude/settings.json`, **both profiles
lose the chain at once**, including the personal profile. The most common cause is the Claude
Code UI (or a plugin's permission prompt) writing the file atomically: it creates
a temp file and uses `rename()` to move it over the target. That `rename()`
replaces the symlink inode with a regular file in place, silently orphaning the
SoT.

You don't notice immediately. The first hint is usually "settings I changed in
the SoT aren't showing up" or "a plugin I enabled isn't running." By then, the
two profiles may already have drifted apart from the SoT, and any user activity
in the meantime (UI permission toggles, plugin enables) only exists in the
broken local file.

To detect this, I run `/sync-symlink-rectify`, a slash command whose bundled audit
script walks all 55 expected symlinks across personal, work, and project
categories and reports a "REPLACED" classification when it finds a regular file
where a symlink should be. That classification is the telltale failure signature.

The repair strategy depends on what drifted. There are two cases.

The first case is straightforward. If the local file is strictly stale and the SoT
is current (no user activity hit the local file during the broken window),
a one-way restore is safe:

```bash
# Back up the local file just in case
cp ~/.claude/settings.json /tmp/settings.local.backup.$(date +%s)

# Remove the regular file and re-link to SoT
rm ~/.claude/settings.json
ln -sfn /path/to/sot/settings.json ~/.claude/settings.json

# Verify the chain is intact from both profiles
realpath ~/.claude/settings.json
realpath ~/.claude-work/settings.json
```

The second case is harder. If the local file accumulated user intent (UI
toggles, "Always allow" clicks, plugin enables) and the SoT was separately
edited during the same window, a naive restore would silently reverse the user's
changes. You need a **bidirectional merge**: walk the two JSONs structurally,
classify each diff, and merge before re-linking. A minimal walker looks like this:

```python
# Returns diffs as (path, kind, local_value, sot_value)
# where kind is LOCAL-ONLY | SOT-ONLY | VALUE | LIST
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

Once the diffs are classified, you can merge structurally. Usually LOCAL-ONLY
entries come from UI activity and should be kept, SOT-ONLY entries come from
intentional config edits and should also be kept, and VALUE conflicts need a human
decision. Write the merged result atomically via temp file plus `rename()` in the
same directory as the SoT, so the work profile's symlink sees a consistent file at
all times during the swap.

This matters beyond one-off incidents. User activity that legitimately
modifies the local file (permission "Always allow" clicks, plugin toggles from the
UI) is invisible to the SoT during the window the local file is broken. If you
wait to detect the break, drift accumulates unintentionally. The incident that
surfaced this for me had ~3 hours of drift, including a plugin-on experiment that
was collecting zero data because the tracking hooks only existed in the SoT, but
my running profile was looking at a stale local file that didn't have them.

There is no git rollback. The SoT `settings.json` is gitignored because it contains
machine-specific plugin install state. That means any destructive repair must be
preceded by a manual backup (e.g., `cp $SOT /tmp/settings.sot.backup.$(date +%s)`)
so you can recover if the merge is wrong. `/tmp` is ephemeral but sufficient for
the repair window itself; move to `~/` if you want longer retention.

One open question is whether the chain should be decoupled. The current `work →
personal → SoT` topology exists because historically only one profile existed and
the work profile was added as a second hat on top. The alternative, two independent
symlinks (`{personal,work} → SoT`), would contain a single UI break to one
profile instead of cascading across both. The cost is that the
`settings.local.json` deep-merge mechanism would need re-verification to confirm
it still works with decoupled chains. I haven't done that spike yet, but it's
worth it before the next major settings restructure.

## Historical UI rewrite loop

> This second incident explains why the shared chain was retired. Its symlink
> repair recipe is preserved as evidence, not as current guidance.

A week after that first incident, I hit the same symptom again and assumed the
one-shot atomic-rename explanation was still the whole story. It wasn't. After I
re-linked the symlink and started editing the runtime file, the UI re-serialized
its in-memory settings model back to the regular file within about two minutes
and clobbered the fix. The UI still thought the file was a regular file, still held
cached state from before the break, and kept overwriting corrections until its
model caught up.

That's the revert loop: as long as the UI has a stale snapshot of the file's
contents, it doesn't matter how many times you repair the symlink. The next save
cycle restores the drifted state.

The symptom signature has three signals that only make sense together:

1. `ls -la ~/.claude/settings.json`: regular file, not a symlink
2. `diff ~/.claude/settings.json $SOT`: substantial divergence (in my case,
   290 lines of accumulated permission patterns, plugin configs, `voiceEnabled`,
   `skipDangerousModePermissionPrompt`, `mcpServers`)
3. `stat -f '%Sm' ~/.claude/settings.json`: mtime updates within 2 to 3 minutes of
   any edit to the runtime file, even with no explicit save action in the UI

The third one is what distinguishes a revert loop from a normal broken symlink. If
the mtime only moves when you explicitly save, you have a stale file. If it moves
passively, the UI is actively writing over your edits.

For recovery, reconcile into the SoT, then re-symlink. The bidirectional merge from
the previous section is the right tool when both sides have intent to preserve. In
the revert-loop case, the UI's "intent" is a stale cache from before your edits, so
merging it forward just re-introduces the changes you're trying to remove. A safer
recipe is to freeze the live file's state into the SoT and then re-symlink:

```bash
SOT=/path/to/3b/.claude/global-claude-setup/settings.json
LIVE=/Users/you/.claude/settings.json

# 1. Back up live; /tmp is fine for the repair window
cp "$LIVE" "/tmp/live-settings-backup-$(date +%Y%m%d-%H%M%S).json"

# 2. Apply intended edits surgically to the live (drifted) file
#    use Edit/sed/jq; validate JSON after each edit
python3 -m json.tool < "$LIVE" > /dev/null || { echo "JSON broke"; exit 1; }

# 3. Copy cleaned live → SoT. SoT now holds EVERY line the UI has accumulated
#    plus the intended edits. Nothing is lost; drift is promoted to SoT.
cp "$LIVE" "$SOT"

# 4. Atomic swap: replace live with a symlink to SoT
rm "$LIVE" && ln -s "$SOT" "$LIVE"

# 5. Verify
ls -la "$LIVE"                        # shows -> SoT
diff "$LIVE" "$SOT" > /dev/null       # identical (via symlink)
python3 -m json.tool < "$LIVE" > /dev/null   # JSON valid through link
```

The important step is number 3: promote live to SoT _before_ re-linking, so nothing is
lost. The structural walk from the previous section forces you to decide intent
for every diff, which is correct when both sides have real intent to preserve.
Here the UI's "intent" is a stale cache, so freezing live into the SoT and
symlinking is cleaner than auditing what the UI "wanted."

This doesn't fix the current session. The running Claude Code session
still has the pre-fix hook registry in memory. Hooks removed or modified in the
SoT only take full effect on the next session start. The observable signal is
whatever start-of-session log line your hooks emit. In my case, the absence of
`[AGENT-TEAMS-READY]` at the next session confirmed the in-memory registry had
refreshed.

There is also a monitoring gap. The existing `symlink-daily-check.sh` SessionStart
hook catches the atomic-rename case at the next session boundary. It doesn't catch a
revert loop _during_ a session. If the UI's future write pattern shifts to
delete-then-create-new-regular-file, the symlink would be replaced again between
sessions, and the daily check would catch it eventually, but a real-time check
would need to live in a PostToolUse or Stop hook. I haven't written that yet; the
open question is whether the revert cadence is fast enough to warrant it.

The gitignored SoT makes the repair unobservable. The SoT `settings.json` is
gitignored because it holds machine-specific plugin install state. That means the whole
reconcile-and-relink sequence lives only in my local working tree. `git status`
shows nothing. No PR reviews the reconciliation. A fresh clone would not reproduce
the drifted SoT. The pragmatic mitigation is a periodic manual backup
(`cp $SOT ~/backup-$(date +%Y%m)/`) at whatever retention policy matches how bad a
"lost my entire settings history" outcome would be. The proper fix would be
un-gitignoring the SoT, but that ships plugin-install state and machine-specific
permissions into the repo, which is worse.

## Optional session-profile extension (claude-swap)

The independent personal and work profiles each point at one credential set. A
later stage added an optional multi-account session layer without changing
those primary runtime files. The session layer is inert unless its separate
runtime is installed.

### Runtime lifecycle

A wrapper script, `scripts/cswap-3b.sh <pers|work> [--force-session]`, is tracked
in the knowledge base but does nothing without the runtime installed. A
same-account request takes a direct fast path straight into the source profile.
Passing `--force-session` (or making a cross-account request) bootstraps an
isolated session profile through upstream claude-swap's `setup_session()`, a
bootstrap/launch split, never `cswap run`.

The runtime is upstream [`github.com/realiti4/claude-swap`](https://github.com/realiti4/claude-swap),
pinned at commit `3d1c5b4`, installed as a `uv` tool (uv-managed CPython, no asdf
entry, no fork). Install and teardown are runtime operations; the repo ships only
the wrapper plus a doctor check.

Session profiles are ephemeral directories under `~/.claude-swap-backup/sessions/`
with keychain-only credentials. The service name is hashed
(`Claude Code-credentials-<sha256(NFC(dir))[:8]>`), and the wrapper seeds the
entry and unlinks any plaintext, since claude 2.1.207 never migrates plaintext on
launch. The wrapper projects a 10-item symlink set from the source profile
(settings, `CLAUDE.md`, skills, commands, agents, plugins, hooks, scripts,
keybindings, settings.local) recorded in a `.cswap-3b-links.json` manifest. That
list is duplicated in three places (the manifest, `LINK_ITEMS` in the wrapper,
and the `items` string in sync-doctor check 18), so editing one means updating all
three. Link handling is fail-closed: any failure deletes the session directory and
its keychain entry. History and projects are always per-session (never
`--share-history`), and every knowledge-base surface is an exact source-profile
symlink, never a copy.

### Credential mode

Accounts register via setup-token only. The human runs `claude setup-token` in the
source profile, then `cswap add-token --email <exact>` with the token pasted into
the secure prompt. The reason is a limitation upstream: `cswap add` reads only the
fixed default keychain service and can't capture a `CLAUDE_CONFIG_DIR` profile's
hashed entry. Setup tokens are long-lived with no refresh token, so expiry or
revocation surfaces as a session validation failure. The wrapper's fail-closed
cleanup removes the session, and the remedy is re-registration.

### Guardrail

sync-doctor check 18 (`cswap session links`) validates every live session profile:
a wrapper-managed manifest is required, `source_profile` is allowlisted to exactly
`~/.claude` and `~/.claude-work`, and every owned item must be an exact symlink to
its source. It goes red on copies, wrong targets, or missing links; no sessions
directory at all is green.

### Current state

A runtime-only rollback drill removed everything (sessions, hashed keychain
entries, the `claude-swap` backup keychain service, `~/.claude-swap-backup/`, and
the uv tool) and verified the personal and work profiles were byte-identical
before and after. Reactivating means reinstalling the uv tool at the pinned commit
and re-registering accounts via setup-token. The point of shipping only the
wrapper and the doctor check is that the primary two-profile chain never depends on
the session layer being present.

## Cross-check discipline

When creating shared instructions, cross-check all prompt files for personal
references that won't work for other developers:

- Hardcoded absolute paths (`/Users/username/...`)
- Personal usernames in assignee fields
- References to gitignored scripts or folders
- MCP tool references without "if configured" guard
- Buffer location (`~/dev/personal/3b/.claude/buffer.md`)
- Symlink documentation (`docs/` pointing to personal paths)
- User context sections (level, experience, role)

## The result

New developers clone the repo and get working Claude Code instructions
immediately. Personal customizations stay private. The sync script prevents
drift across AI tools, while layer deduplication avoids loading the same rule in
every project.

The larger lesson is that shared instructions and private runtime settings have
different failure domains. Repository instructions benefit from one auditable
source of truth. Profile settings are safer as independent, identity-checked
runtime files with explicit deployment and rollback.

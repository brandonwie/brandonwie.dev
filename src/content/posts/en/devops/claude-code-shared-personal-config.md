---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: Split AI instructions into committed (shared) and gitignored (personal) layers
date: 2026-02-04T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - claude-code
  - ai-config
  - onboarding
category: devops
draft: false
lang: en
expanded: true
source_content_hash: b6720e075e07ae460ec02213a9d241bd9d2c7d2941edb055fefd4e54de063c56
references:
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code Documentation
    type: official
---

I spent weeks tuning Claude Code instructions for my project — custom commands,
domain-specific prompts, coding conventions. Then a new developer joined the
team, cloned the repo, and got zero AI assistance. My entire configuration was
gitignored because it contained personal symlinks to my knowledge management
system.

The fix is a two-layer architecture: shared instructions committed to the repo
so new developers get working AI out of the box, and personal extensions
gitignored so existing developers keep their custom setup.

## The Problem

Claude Code reads its instructions from `CLAUDE.md` and `.claude/` in the
project root. When one developer's config references personal paths, symlinks,
or external systems, gitignoring the whole thing is the obvious move. But that
means every other developer starts with a blank slate.

The challenge is splitting instructions into a shared layer (committed, works for
everyone) and a personal layer (gitignored, per-developer customizations)
without duplication or drift.

## Architecture

The split looks like this:

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

Shared files contain everything a new developer needs: project architecture,
coding conventions, command reference, deployment instructions. Personal files
contain per-developer preferences, private tool configs, and symlinks to
external systems.

## Key Decisions

### CLAUDE.md Is the Single Source of Truth

All other AI instruction files are generated from `CLAUDE.md` via
`npm run ai:sync`. This prevents drift between Claude Code, Cursor, and GitHub
Copilot. One file to edit, three tools stay in sync.

### MCP Rules Are Softened in Shared Config

Personal config uses "ALWAYS USE" for Context7 and Postgres MCP servers. Shared
config uses "If configured" instead, since new developers may not have MCP
servers set up. The instructions still describe what the tools do and when to
use them — they defer the requirement.

### Symlinks Stay for Personal-Only Content

`.claude/skills/` remains a symlink to my knowledge management system
(gitignored). Personal extensions that don't affect the team stay as symlinks or
in `CLAUDE.local.md`. The boundary is clear: if it helps everyone, commit it. If
it's specific to your setup, gitignore it.

## Sync Script

`npm run ai:sync` reads `CLAUDE.md` and writes to three targets:

- `AGENTS.md` (exact copy)
- `.github/copilot-instructions.md` (exact copy)
- `.cursor/rules/index.mdc` (Cursor YAML frontmatter + content)

Running the script after editing `CLAUDE.md` keeps all three in sync. No manual
copying, no forgetting to update one of them.

## Gitignore Pattern

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

## SoT Directory Pattern (project-claude/)

Managing the shared/personal split across multiple projects gets unwieldy fast.
The solution is a central source-of-truth directory with symlinks to each
project repo:

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

Only repos with other team members need the shared/local split. Personal-only
repos use a single combined file. `.mcp.json` follows the same pattern — the
knowledge base holds the canonical version, project repos get symlinks. Sentry
and Notion MCP servers were removed from `.mcp.json` in favor of
Anthropic-hosted integrations that require zero config and handle OAuth
natively.

## Guard Comments for Shared Files

The most common mistake with this pattern is accidentally putting personal
content into a shared file. An HTML comment at the top of each shared SoT file
prevents this:

```html
<!-- SHARED FILE — This file syncs to {repo}/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in {name}.local.md → {repo}/CLAUDE.local.md -->
```

This works as a point-of-authorship guardrail. Claude (or a human) sees the
constraint before editing. More effective than rules in a separate file because
it doesn't require the editor to have loaded the rule first.

## Symlink Deployment Chain

For shared repos, the deployment is two hops:

```text
project-claude/{name}.md (3B SoT)
  ↓ filesystem symlink
{repo}/CLAUDE.md (Claude Code reads this)
  ↓ npm run ai:sync
AGENTS.md + copilot-instructions.md + cursor rules (team sees)
```

Guard comments at the SoT prevent personal content from leaking through both
hops. The symlink is transparent to all tools — edits to either end modify the
same file.

## Layer Deduplication Strategy

After setting up shared configs for several projects, a new problem appeared:
the same universal principles (5W1H documentation, buffer format, `.me.md`
rules, communication style) were copy-pasted into every project's `CLAUDE.md`.
They drifted over time and wasted tokens on redundant instructions.

The fix is a two-step promotion:

1. **Identify duplication** — grep across all project-claude files for repeated
   instructions (buffer appeared 7 times, 5W1H appeared 6 times, `.me.md`
   appeared 4 times)
2. **Promote to global** — move the canonical version to `~/.claude/CLAUDE.md`
   and replace each project copy with a 1-line reference:
   `Universal principles (...) are in ~/.claude/CLAUDE.md.`

This works because Claude Code's loading hierarchy guarantees
`~/.claude/CLAUDE.md` loads first in every session. Project files inherit global
rules without restating them.

**Results from the 2026-02-23 restructuring:**

- 8 universal principles promoted to global (YAML Frontmatter,
  Cross-Referencing, 5W1H, Decision Documentation, Zettelkasten, `.me.md`,
  Buffer, Communication Style)
- 7 project files deduplicated (~25-35% token savings each)

**Further reductions (2026-03-09):**

- Markdownlint quick-reference table fully removed — redundant with
  `.markdownlint-cli2.jsonc` plus a husky pre-commit hook. Originally compressed
  from ~330 to ~28 lines (2026-02-23), then eliminated entirely when the tooling
  backstop proved sufficient
- Mermaid section compressed from ~89 lines to 6 lines (kept the behavioral
  rule, removed examples/tables/checklist since no tooling enforces Mermaid
  preference)
- 3 more sections extracted to `.claude/rules/` files (change-discipline,
  yaml-frontmatter-schema, personal-folder-governance)
- Net result: global `CLAUDE.md` reduced from 491 to 371 lines (~24.4% savings)
- Project `CLAUDE.md`: 541 to 478 (Tier 1) to 328 (Tier 2) = -39.4% total
- Combined always-loaded context: 912 to 720 lines (-21%)
- Every session now enforces the same principles while loading fewer lines

## Settings.local.json Consolidation

Per-project `settings.local.json` files were the next deduplication target. I
had 14 files (8 of them symlinks from a central source) that mostly repeated
the same bash command allow-list. The key insight was that Claude Code's
permission precedence — `deny > ask > allow` — makes a `Bash(*)` catch-all
safe.

### Before (14 files, 8 symlinks)

```text
3b/.claude/settings.local.json  ← source file
  ↑ symlinked from 8 projects (brandonwie, crucio, backend-v2, etc.)
+ 5 independent files (dev/, personal/, dotfiles/, frontend/, mobile/)
```

Most entries were redundant with global `settings.json`, which had evolved to
cover the same commands. Only 6 items were unique across all files.

### After (global settings.json only)

```text
permissions.allow: ["Bash(*)"]     ← catch-all for all non-destructive commands
permissions.deny:  [dangerous]     ← terraform destroy, git push --force, sudo
permissions.ask:   [risky]         ← git push, rm, kill (prompted)
defaultMode: "default"             ← with Bash(*) catch-all, effectively auto-approved
```

The cleanup removed 8 symlinks and 3 redundant regular files. Settings like
`outputStyle`, `enableAllProjectMcpServers`, and `prefersReducedMotion` moved to
global. New projects automatically get correct permissions from the global
config — no per-project setup needed.

### Why Bash(\*) Is Safe

The `deny > ask > allow` precedence means `Bash(*)` only auto-approves commands
that don't match a deny or ask pattern. Dangerous commands like
`terraform destroy` and `git push --force` are in deny. Risky commands like
`git push` and `rm` are in ask. Everything else flows through to the catch-all.

## Per-Profile settings.json (Corrected)

When I first wrote this post in March, I claimed `settings.json` couldn't be
symlinked across profiles and described the architecture as "three copies." That
was wrong. The actual architecture _is_ symlinked end-to-end, and per-profile
differences live in a separate `settings.local.json` override file that Claude
Code deep-merges over the shared base. I only discovered this when an audit
script flagged a broken symlink and I had to trace the chain to repair it.

The corrected topology:

- **Knowledge base SoT** (`global-claude-setup/settings.json`) — canonical
  source, gitignored because it contains machine-specific plugin install state
- **Personal profile** (`~/.claude/settings.json`) — **symlink** to the SoT
- **Work profile** (`~/.claude-work/settings.json`) — **symlink chained through
  personal**: `~/.claude-work/settings.json → ~/.claude/settings.json → SoT`. It
  is _not_ a separate copy.
- **Work overrides** (`~/.claude-work/settings.local.json`) — symlink to a
  separate `settings.local.work.json` in the SoT directory. Contains only the
  two keys that differ from personal: `statusLine.command` (with the
  `CLAUDE_CONFIG_DIR=~/.claude-work` prefix) and `enabledMcpjsonServers` (the
  whitelist for work-specific database connections). Claude Code deep-merges
  this over the base `settings.json` at load time.

All non-override settings — env, permissions, hooks, plugins — come from the
single shared SoT through the symlink chain. Editing the SoT instantly
propagates to both profiles. There is no manual sync step.

**Watch out for junk accumulation.** Interactive permission approvals ("Always
allow") store the exact command string as a permission entry — including
multi-line bash scripts, entire code blocks, and auth tokens. My work profile
accumulated ~160 entries (32KB) before cleanup. The `Bash(*)` catch-all
prevents this by auto-approving before the interactive prompt fires.

## Chain Failure Mode

The `work → personal → SoT` chain has a single-file failure mode that took me a
while to recognize. If anything breaks `~/.claude/settings.json`, **both
profiles lose the chain at once**, not just personal. The most common cause is
the Claude Code UI (or a plugin's permission prompt) writing the file
atomically: it creates a temp file and uses `rename()` to move it over the
target. That `rename()` replaces the symlink inode with a regular file in
place, silently orphaning the SoT.

You don't notice immediately. The first hint is usually "settings I changed in
the SoT aren't showing up" or "a plugin I enabled isn't running." By then, the
two profiles may already have drifted apart from the SoT, and any user activity
that happened in the meantime — UI permission toggles, plugin enables — only
exists in the broken local file.

**Detection.** I run `/sync-symlink-rectify`, a slash command that walks all 55
expected symlinks across personal, work, and project categories and reports a
"REPLACED" classification when it finds a regular file where a symlink should
be. That classification is the telltale failure signature.

**Repair strategy depends on what drifted.** There are two cases.

The first case is straightforward. If the local file is strictly stale and the
SoT is current — meaning no user activity hit the local file during the broken
window — a one-way restore is safe:

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

The second case is harder. If the local file accumulated user intent — UI
toggles, "Always allow" clicks, plugin enables — _and_ the SoT was separately
edited during the same window, a naive restore would silently reverse the
user's changes. You need a **bidirectional merge**: walk the two JSONs
structurally, classify each diff, and merge before re-linking. A minimal walker
looks like this:

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

Once you have the diffs classified, you can merge structurally — usually
LOCAL-ONLY entries come from UI activity and should be kept, SOT-ONLY entries
come from intentional config edits and should also be kept, and VALUE conflicts
need a human decision. Write the merged result atomically via temp file plus
`rename()` in the same directory as the SoT, so the work profile's symlink sees
a consistent file at all times during the swap.

**Why this matters beyond one-off incidents.** User activity that legitimately
modifies the local file (permission "Always allow" clicks, plugin toggles from
the UI) is invisible to the SoT during the window the local file is broken. If
you wait to detect the break, drift can accumulate unintentionally. The
incident that surfaced this for me had ~3 hours of drift, including a
plugin-on experiment that was collecting zero data because the tracking hooks
only existed in the SoT — but my running profile was looking at a stale local
file that didn't have them.

**No git rollback.** The SoT `settings.json` is gitignored because it contains
machine-specific plugin install state. That means any destructive repair must
be preceded by a manual backup (e.g., `cp $SOT /tmp/settings.sot.backup.$(date
+%s)`) so you can recover if the merge is wrong. `/tmp` is ephemeral but
sufficient for the repair window itself; move to `~/` if you want longer
retention.

**Open question: should the chain be decoupled?** The current `work → personal
→ SoT` topology exists because historically only one profile existed and the
work profile was added as a second hat on top. The alternative — two
independent symlinks (`{personal,work} → SoT`) — would contain a single UI
break to one profile instead of cascading across both. The cost is that the
`settings.local.json` deep-merge mechanism would need re-verification to
confirm it still works with decoupled chains. I haven't done that spike yet,
but it's worth it before the next major settings restructure.

## The Revert Loop Surfaces

A week after the 2026-04-09 incident, I hit the same symptom again and assumed
the one-shot atomic-rename explanation was still the whole story. It wasn't.
After I re-linked the symlink and started editing the runtime file, the UI
re-serialized its in-memory settings model back to the regular file within
about two minutes, clobbering the fix. The UI still thought the file was a
regular file, still held cached state from before the break, and kept
overwriting corrections until its model caught up.

That's the revert loop: as long as the UI has a stale snapshot of the file's
contents, it doesn't matter how many times you repair the symlink — the next
save cycle restores the drifted state.

**The symptom signature has three signals that only make sense together:**

1. `ls -la ~/.claude/settings.json` — regular file, not a symlink
2. `diff ~/.claude/settings.json $SOT` — substantial divergence (in my case,
   290 lines of accumulated permission patterns, plugin configs,
   `voiceEnabled`, `skipDangerousModePermissionPrompt`, `mcpServers`)
3. `stat -f '%Sm' ~/.claude/settings.json` — mtime updates within 2–3 minutes
   of any edit, even with no explicit save action in the UI

The third one is what distinguishes a revert loop from a normal broken
symlink. If the mtime only moves when you explicitly save, you have a stale
file. If it moves passively, the UI is actively writing over your edits.

**Recovery: reconcile → SoT → symlink.** The bidirectional merge from the
previous section is the right tool when both sides have intent to preserve. In
the revert-loop case, the UI's "intent" is a stale cache from before your
edits — merging it forward just re-introduces the changes you're trying to
remove. A safer recipe is to freeze the live file's state into the SoT and
then re-symlink:

```bash
SOT=/path/to/3b/.claude/global-claude-setup/settings.json
LIVE=/Users/you/.claude/settings.json

# 1. Back up live — /tmp is fine for the repair window
cp "$LIVE" "/tmp/live-settings-backup-$(date +%Y%m%d-%H%M%S).json"

# 2. Apply intended edits surgically to the live (drifted) file
#    — use Edit/sed/jq; validate JSON after each edit
python3 -m json.tool < "$LIVE" > /dev/null || { echo "JSON broke"; exit 1; }

# 3. Copy cleaned live → SoT. SoT now holds every line the UI has accumulated
#    plus the intended edits. Nothing is lost; drift is promoted to SoT.
cp "$LIVE" "$SOT"

# 4. Atomic swap: replace live with a symlink to SoT
rm "$LIVE" && ln -s "$SOT" "$LIVE"

# 5. Verify
ls -la "$LIVE"                                 # shows -> SoT
diff "$LIVE" "$SOT" > /dev/null                # identical via symlink
python3 -m json.tool < "$LIVE" > /dev/null     # JSON valid through link
```

The key move is step 3: promote live to SoT _before_ re-linking, so nothing
is lost. Steps 1 and 2 protect against a bad intermediate state; step 5
verifies the chain actually holds after the swap.

**What this doesn't fix on the current session.** The running Claude Code
session still has the pre-fix hook registry in memory. Hooks removed or
modified in the SoT only take full effect on the next session start. The
observable signal is whatever start-of-session log line your hooks emit — in
my case, the absence of `[AGENT-TEAMS-READY]` at the next session was the
confirmation that the in-memory registry had refreshed.

**The monitoring gap.** The existing `symlink-daily-check.sh` SessionStart
hook catches the atomic-rename case at the next session boundary. It doesn't
catch a revert loop _during_ a session. If the UI's future write pattern
shifts to delete-then-create-new-regular-file, the symlink would be replaced
again between sessions, and the daily check would catch it eventually — but a
real-time check would need to live in a PostToolUse or Stop hook. I haven't
written that yet; the open question is whether the revert cadence is fast
enough to warrant it.

**Gitignored SoT, unobservable repair.** The SoT `settings.json` is gitignored
because it holds machine-specific plugin install state. That means the whole
reconcile-and-relink sequence lives only in my local working tree. `git
status` shows nothing. No PR reviews the reconciliation. A fresh clone would
not reproduce the drifted SoT. The pragmatic mitigation is a periodic manual
backup (`cp $SOT ~/backup-$(date +%Y%m)/`) at whatever retention policy
matches how bad a "lost my entire settings history" outcome would be. The
proper fix would be un-gitignoring SoT — but that ships plugin-install state
and machine-specific permissions into the repo, which is worse.

## Cross-Check Discipline

When creating shared instructions, cross-check all prompt files for personal
references that won't work for other developers:

- Hardcoded absolute paths (`/Users/username/...`)
- Personal usernames in assignee fields
- References to gitignored scripts or folders
- MCP tool references without "if configured" guard
- Buffer location (`~/dev/personal/3b/.claude/buffer.md`)
- Symlink documentation (`docs/` pointing to personal paths)
- User context sections (level, experience, role)

This checklist catches the leaks that guard comments alone can miss. Run through
it before every PR that touches AI configuration files.

## The Result

New developers clone the repo and get working Claude Code instructions
immediately. Personal customizations stay private. The sync script prevents
drift across AI tools. And the layer deduplication keeps token usage low by
promoting shared principles to the global config.

The pattern scales to any number of projects and developers. The central SoT
directory makes it easy to audit what's shared vs. personal, and guard comments
prevent accidental leaks at the point of authorship.

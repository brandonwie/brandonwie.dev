---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: Split AI instructions into committed (shared) and gitignored (personal) layers
date: 2026-02-04T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
tags:
  - devops
  - claude-code
  - ai-config
  - onboarding
category: devops
draft: false
lang: en
expanded: true
source_content_hash: 9f3e301fb75260d49c4d294b4e80bc030cc7d8d5752b9ba5190aa06765512cfd
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

## Per-Profile settings.json

One file that resists consolidation is `settings.json` itself. It cannot be
symlinked across profiles because `statusLine.command` must differ — the work
profile embeds `CLAUDE_CONFIG_DIR=~/.claude-work` since Claude Code doesn't
pass environment variables to statusline subprocesses.

The architecture is three copies:

- **Knowledge base SoT** (`global-claude-setup/settings.json`) — the canonical
  reference
- **Personal profile** (`~/.claude/settings.json`) — direct copy of the SoT
- **Work profile** (`~/.claude-work/settings.json`) — copy with 2 differences:
  1. `statusLine.command` has the `CLAUDE_CONFIG_DIR` prefix
  2. `enabledMcpjsonServers` includes work-specific database connections

All other settings (env, permissions, hooks, plugins) are identical. When
editing, update the SoT first, then sync to both profiles.

**Watch out for junk accumulation.** Interactive permission approvals ("Always
allow") store the exact command string as a permission entry — including
multi-line bash scripts, entire code blocks, and auth tokens. My work profile
accumulated ~160 entries (32KB) before cleanup. The `Bash(*)` catch-all
prevents this by auto-approving before the interactive prompt fires.

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

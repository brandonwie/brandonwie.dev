---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: >-
  Split AI instructions into committed (shared) and gitignored (personal)
  layers so new developers get working AI instructions out of the box while
  existing developers keep personal extensions.
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-23T00:00:00.000Z
tags:
  - devops
  - claude-code
  - ai-config
  - onboarding
category: devops
draft: false
lang: en
references:
  - url: "https://docs.anthropic.com/en/docs/claude-code"
    title: Claude Code Documentation
    type: official
---

## The Problem

When one developer uses Claude Code with personal symlinks to a knowledge
management system (3B), the instructions are invisible to other developers who
clone the repo. Everything is gitignored.

## Architecture

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

## Key Decisions

### CLAUDE.md is the single source of truth

All other AI instruction files are generated from it via `npm run ai:sync`. This
prevents drift between Claude Code, Cursor, and GitHub Copilot.

### MCP rules are softened in shared config

Personal config uses "ALWAYS USE" for Context7 and Postgres MCP. Shared config
uses "If configured" since new devs may not have MCP servers set up.

### Symlinks stay for personal-only content

`.claude/skills/` remains a symlink to 3B (gitignored). Personal extensions that
don't affect the team stay as symlinks or in `CLAUDE.local.md`.

## Sync Script

`npm run ai:sync` reads CLAUDE.md and writes to:

- `AGENTS.md` (exact copy)
- `.github/copilot-instructions.md` (exact copy)
- `.cursor/rules/index.mdc` (Cursor YAML frontmatter + content)

## Gitignore Pattern

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

## SoT Directory Pattern (project-claude/)

When managing multiple projects with shared + personal configs, use a central
SoT directory with symlinks to each project repo:

```text
3b/.claude/project-claude/
├── moba-nestjs.md          # Shared SoT → backend-v2/CLAUDE.md (symlink)
├── moba-nestjs.local.md    # Personal SoT → backend-v2/CLAUDE.local.md (symlink)
├── moba-terraform.md       # Combined (personal-only repo)
├── moba-airflow.md         # Combined (personal-only repo)
└── moba-etl.md             # Combined (personal-only repo)
```

Only repos with other team members need the shared/local split. Personal-only
repos can use a single combined file.

## Guard Comments for Shared Files

Add an HTML comment at the top of shared SoT files to prevent accidental
personal content leaks:

```html
<!-- SHARED FILE — This file syncs to {repo}/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in {name}.local.md → {repo}/CLAUDE.local.md -->
```

This works as a point-of-authorship guardrail — Claude (or a human) sees the
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

When universal principles (5W1H, buffer format, `.me.md` rules, communication
style) appear in multiple project CLAUDE.md files, they drift and waste tokens.
The fix is a two-step promotion:

1. **Identify duplication** — grep across all project-claude files for repeated
   instructions (buffer was 7x, 5W1H was 6x, `.me.md` was 4x)
2. **Promote to global** — move the canonical version to `~/.claude/CLAUDE.md`
   and replace each project copy with a 1-line reference:
   `Universal principles (...) are in ~/.claude/CLAUDE.md.`

This works because Claude Code's loading hierarchy guarantees
`~/.claude/CLAUDE.md` is always loaded first, in every session. Project files
inherit the global rules without restating them.

**Results from the 2026-02-23 restructuring:**

- 8 universal principles promoted to global (YAML Frontmatter,
  Cross-Referencing, 5W1H, Decision Documentation, Zettelkasten, `.me.md`,
  Buffer, Communication Style)
- 7 project files deduplicated (~25-35% token savings each)
- Markdownlint examples compressed from ~330 lines to ~28-line quick-reference
  table
- Every session now enforces the same principles while loading fewer lines

## Cross-Check Discipline

When creating shared instructions, cross-check all prompt files for personal
references that won't work for other developers:

- Hardcoded absolute paths (`/Users/username/...`)
- Personal usernames in assignee fields
- References to gitignored scripts or folders
- MCP tool references without "if configured" guard
- Buffer location (`~/dev/personal/3b/.claude/buffer.md`)
- Symlink documentation (`docs/` → 3B paths)
- User context sections (level, experience, role)

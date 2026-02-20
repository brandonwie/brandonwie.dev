---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: Split AI instructions into committed (shared) and gitignored (personal) layers
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-19T00:00:00.000Z
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

A new developer joined the team and cloned our backend repo. They ran Claude
Code and it had zero context about the project. All my carefully crafted AI
instructions were symlinked to a personal knowledge base and gitignored. I
needed a way to give new developers working AI instructions out of the box while
keeping my personal extensions intact.

## Why This Matters

AI assistants are only as useful as the context they start with. If CLAUDE.md
exists only in your local environment and is gitignored, every new developer
gets a blank slate -- no project conventions, no stack information, no rules
about how the team writes code.

At the same time, not everything in your AI config belongs to the team. Personal
shortcuts, references to your local knowledge base, MCP servers only you have
installed -- these are noise for everyone else. Committing them would break the
experience for other developers, or expose paths that mean nothing outside your
machine.

The fix is a two-layer split: a committed shared layer that works for anyone who
clones the repo, and a gitignored personal layer that extends it for you.

## The Architecture

Claude Code reads `CLAUDE.md` first, then automatically appends `CLAUDE.local.md`
if it exists. That behavior is the foundation of the whole pattern.

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

The committed side has everything a new developer needs: project stack, critical
rules, domain prompts, and AI tool configurations. The gitignored side has
everything personal: my 3B knowledge base symlinks, Korean-language prompts,
local MCP connections.

## Key Decisions

### CLAUDE.md as single source of truth

I don't maintain AGENTS.md or Cursor rules by hand. They're generated from
`CLAUDE.md` via `npm run ai:sync`. This means there's one file to update when
the project conventions change, and three AI tools stay in sync automatically.

Without this, I'd drift. Update CLAUDE.md but forget AGENTS.md. Or edit Cursor
rules directly and watch them diverge from what Claude sees. The sync script
eliminates the category of error.

### MCP rules softened in shared config

My personal config says "ALWAYS USE Context7 for library docs." The shared
config says "If configured, use Context7." That conditional is important -- a
new developer may not have Context7 or the Postgres MCP set up yet. Hardcoding
"ALWAYS USE" in the shared config would generate confusing failures for them.

The rule is: shared config describes what to do if tools are available, personal
config assumes they are.

### Symlinks stay for personal-only content

`.claude/skills/` is a symlink to my 3B knowledge base. That stays gitignored.
Personal Claude skills, Korean prompts, and local tool references live in
`CLAUDE.local.md` or gitignored folders. They extend the shared config without
touching it.

## The Sync Script

One source file, three consumers, zero drift.

`npm run ai:sync` reads `CLAUDE.md` and writes:

- `AGENTS.md` -- exact copy (for Codex and other OpenAI-compatible tools)
- `.github/copilot-instructions.md` -- exact copy (for GitHub Copilot)
- `.cursor/rules/index.mdc` -- Cursor YAML frontmatter prepended, then content

The script is simple by design. It doesn't transform the content beyond adding
the Cursor frontmatter. CLAUDE.md is written to work across all three tools
without modification.

When a convention changes -- say, a new commit format rule -- I update CLAUDE.md,
run the sync, and commit all four files together. No manual copy-paste, no
wondering which files got updated.

## The Gitignore Pattern

The `.gitignore` entries make the split explicit and self-documenting:

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

The comment block in the shared section matters. It tells anyone reading
`.gitignore` that these files exist and are intentionally committed -- not
accidents or forgotten entries. The gitignored section tells them what the
personal layer looks like.

## SoT Directory Pattern

When you manage multiple project repos from a central location, the two-layer
split gets harder to maintain. Which file is the source of truth for a given
repo's CLAUDE.md? Where do you edit it?

I solved this with a `project-claude/` directory inside my 3B knowledge base:

```text
3b/.claude/project-claude/
├── moba-nestjs.md          # Shared SoT → backend-v2/CLAUDE.md (symlink)
├── moba-nestjs.local.md    # Personal SoT → backend-v2/CLAUDE.local.md (symlink)
├── moba-terraform.md       # Combined (personal-only repo)
├── moba-airflow.md         # Combined (personal-only repo)
└── moba-etl.md             # Combined (personal-only repo)
```

Each file in `project-claude/` is the real source of truth. The file in the
project repo is a symlink pointing back to it. I edit in one place, both
locations update.

Only repos with other team members get the split. Terraform, Airflow, and ETL
repos are personal -- no teammates, no shared/local distinction needed. One
combined file is fine.

## Guard Comments for Shared Files

Symlinks make editing convenient, but they also make it easy to accidentally
write personal content into a shared file. I'll open `moba-nestjs.md` to add a
rule and forget that it syncs directly to what the whole team sees.

The fix is a guard comment at the top of every shared SoT file:

```html
<!-- SHARED FILE — This file syncs to backend-v2/CLAUDE.md (team-visible).
     DO NOT add personal content (3B paths, buffer, symlink, user profile).
     Personal overrides go in moba-nestjs.local.md → backend-v2/CLAUDE.local.md -->
```

This works because it appears before any content. Whether Claude or a human
opens the file, the constraint is visible immediately. A rule buried in a
separate configuration file only helps if the editor has already loaded that
file. A comment in the file itself has no dependency.

I learned this the hard way after adding a 3B buffer path to a shared file and
only catching it during a cross-check audit.

## Symlink Deployment Chain

For shared repos, changes travel through two hops before the team sees them:

```text
project-claude/{name}.md (3B SoT)
  ↓ filesystem symlink
{repo}/CLAUDE.md (Claude Code reads this)
  ↓ npm run ai:sync
AGENTS.md + copilot-instructions.md + cursor rules (team sees)
```

The symlink is transparent to all tools. Editing either end modifies the same
file. The guard comment at the SoT prevents personal content from leaking
through either hop.

This chain means editing happens in 3B, syncing happens in the project repo, and
the team sees the result in four files. Any gap in that chain -- editing the
wrong file, skipping the sync, missing a guard comment -- breaks the pattern.
Making the chain explicit helps catch those gaps.

## Cross-Check Discipline

Before committing shared instructions, I scan every prompt file and the shared
CLAUDE.md for personal references. The list of things that break for other
developers is longer than it looks:

- Hardcoded absolute paths (`/Users/username/...`)
- Personal usernames in assignee fields
- References to gitignored scripts or folders
- MCP tool references without "if configured" guard
- Buffer location (`~/dev/personal/3b/.claude/buffer.md`)
- Symlink documentation pointing to 3B paths
- User context sections (level, experience, role)

The last three surprised me. Buffer location references sneak in when you copy
from a personal config. Symlink documentation is visible in the shared file if
you describe the setup. User context sections -- "you are helping a senior
engineer" -- are personal preference, not project convention.

The cross-check takes five minutes and has caught at least three leaks that
would have confused teammates.

## Practical Takeaway

CLAUDE.md should describe the project, not the developer.

Project conventions, stack information, critical rules, domain prompts -- all of
that belongs in the shared file. Your personal shortcuts, your local paths, your
MCP assumptions -- those go in CLAUDE.local.md, which Claude appends
automatically and git ignores entirely.

The sync script handles drift. The guard comment handles accidents. The SoT
directory handles multi-repo management. Together they give new developers
working AI instructions from day one, and keep personal extensions out of their
way.

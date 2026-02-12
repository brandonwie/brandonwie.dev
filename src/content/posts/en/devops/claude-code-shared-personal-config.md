---
title: "Claude Code: Shared + Personal AI Config Pattern"
description: Split AI instructions into committed (shared) and gitignored (personal) layers
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
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

AI coding assistants work best with project-specific context: coding standards,
architecture decisions, preferred libraries, deployment patterns. Without this
context, Claude Code gives generic answers. The problem is that developer-
specific customizations (MCP server configs, personal skill libraries, symlinks
to external knowledge bases) should not be committed to the repo. They break for
other developers who do not have the same local setup.

The solution is a two-layer configuration: a shared layer that is committed and
gives every developer a solid baseline, and a personal layer that is gitignored
and lets each developer extend the baseline without affecting the team.

## The Architecture

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

Everything on the left is committed. A new developer who clones the repo gets
CLAUDE.md with full project context, prompt files with domain-specific
instructions, and a shared settings.json. Everything on the right is gitignored.
Personal extensions, local MCP configurations, custom skills, and any content
that depends on a specific developer's machine setup.

## Key Decisions

CLAUDE.md is the single source of truth. All other AI instruction files
(AGENTS.md, Copilot instructions, Cursor rules) are generated from it via
`npm run ai:sync`. This prevents drift between different AI tools. You edit one
file and the sync script propagates the changes.

MCP tool references are softened in the shared config. My personal config says
"ALWAYS USE Context7 MCP for documentation lookups." The shared config says "If
Context7 MCP is configured, use it for documentation lookups." New developers
who have not set up MCP servers will not see broken instructions.

Symlinks stay for personal-only content. My `.claude/skills/` directory is a
symlink to my 3B knowledge management system. It is gitignored. Personal
extensions that do not affect the team live as symlinks or in `CLAUDE.local.md`.

## The Sync Script

`npm run ai:sync` reads CLAUDE.md and writes to three targets:

- `AGENTS.md` -- exact copy for Claude Code's agent mode
- `.github/copilot-instructions.md` -- exact copy for GitHub Copilot
- `.cursor/rules/index.mdc` -- Cursor format with YAML frontmatter prepended

One source file, three consumers, zero drift.

## The Gitignore Pattern

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

The pattern is intentional: everything that could reference a specific
developer's machine or personal tools is gitignored. Everything that describes
the project itself is committed.

## Cross-Check Discipline

When writing shared instructions, watch for personal references that will not
work for other developers:

- Hardcoded absolute paths (`/Users/username/...`)
- Personal usernames in assignee fields
- References to gitignored scripts or folders
- MCP tool references without "if configured" guards

I review shared instructions before committing by searching for my username and
home directory path. If either appears, it belongs in the personal layer.

## Practical Takeaway

Use this pattern any time you have a team project where at least one developer
uses AI coding tools with personal customizations. The shared layer ensures
new developers get value from AI assistants immediately. The personal layer
ensures power users can extend without constraint.

The key insight is that CLAUDE.md (or whatever your primary AI instruction file
is) should describe the project, not the developer. Developer-specific content
goes in the local/gitignored layer. Project-specific content goes in the
committed layer. Keep these two concerns separate and onboarding becomes
painless.

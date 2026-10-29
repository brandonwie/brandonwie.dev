---
tags: [architecture, adr, decisions, index]
created: 2026-06-04
updated: 2026-10-29
status: completed
related:
  - ../README.md
  - ../improvements.md
---

# Architecture Decision Records

> **Historical (SvelteKit era).** This document describes the SvelteKit app as of June 2026. The site moved to a Next.js static export on 2026-09-20, so its file paths, routes and pipeline no longer match the code. Use the project `CLAUDE.md` as the current map, and re-check any item here against the Next.js code before acting on it.

ADRs for the brandonwie.dev renewal. Each records a non-trivial, hard-to-reverse
decision: context, options with pros/cons, the chosen option + reasoning, and
consequences. Numbered sequentially; never renumbered.

| ADR                                           | Title                                                     | Status       |
| --------------------------------------------- | --------------------------------------------------------- | ------------ |
| [0001](./0001-terminal-vs-command-palette.md) | Terminal view vs Cmd+P command palette as primary surface | Accepted (B) |

## Conventions

- Filename: `NNNN-kebab-title.md` (zero-padded, sequential).
- `status` frontmatter: `in-progress` while Proposed → `completed` once decided (record the chosen option in the ADR body's Sign-off).
- A decision that removes backlog items prunes them from [`../improvements.md`](../improvements.md) on sign-off.
- Architecture-level (3B-system) decisions belong in 3B's `projects/3b/decisions/`, not here — this folder is for **this project's** product/architecture calls.

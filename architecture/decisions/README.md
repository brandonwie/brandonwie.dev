---
tags: [architecture, adr, decisions, index]
created: 2026-06-04
updated: 2026-11-12
status: completed
related:
  - ../README.md
  - ../improvements.md
---

# Architecture Decision Records

> ADR-0001 is historical (SvelteKit era, June 2026): its file paths, routes and pipeline no longer match the code. ADR-0002 describes the current site.

ADRs for the brandonwie.dev renewal. Each records a non-trivial, hard-to-reverse
decision: context, options with pros/cons, the chosen option + reasoning, and
consequences. Numbered sequentially; never renumbered.

| ADR                                           | Title                                                     | Status             |
| --------------------------------------------- | --------------------------------------------------------- | ------------------ |
| [0001](./0001-terminal-vs-command-palette.md) | Terminal view vs Cmd+P command palette as primary surface | Superseded by 0002 |
| [0002](./0002-v2-text-first-blog.md)          | V2: text-first blog, one index, two themes, no images     | Accepted (B)       |

## Conventions

- Filename: `NNNN-kebab-title.md` (zero-padded, sequential).
- `status` frontmatter: `in-progress` while Proposed → `completed` once decided (record the chosen option in the ADR body's Sign-off).
- A decision that removes backlog items prunes them from [`../improvements.md`](../improvements.md) on sign-off.
- Architecture-level (3B-system) decisions belong in 3B's `projects/3b/decisions/`, not here — this folder is for **this project's** product/architecture calls.

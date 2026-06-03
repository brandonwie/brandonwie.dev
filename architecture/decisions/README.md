---
tags: [architecture, adr, decisions, index]
created: 2026-06-04
updated: 2026-06-04
status: in-progress
related:
  - ../README.md
  - ../improvements.md
---

# Architecture Decision Records

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

---
title: Cross-Agent Skill Alias Generalization
description: >-
  Skills shared across Claude Code, Codex, and Gemini fail when they hardcode
  one agent's MCP tool alias. Two-tier pattern — declare both alias families
  in frontmatter; use generic names in prose.
date: 2026-05-01T00:00:00.000Z
updated: 2026-05-05T00:00:00.000Z
tags:
  - ai-ml
  - skills
  - mcp
  - cross-agent
  - claude
  - codex
  - gemini
  - transferable
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://modelcontextprotocol.io/specification'
    title: Model Context Protocol Specification
    type: official
source_content_hash: d720af94f9fcc120e9e407ecf3eaf4f2f80f1725f4f94af6deb6dbaedc06490c
---

A skill I shipped under 3B's `.agents/skills/` directory worked fine under
Claude Code and silently no-op'd under Codex. The frontmatter listed the right
tool — `mcp__plugin_context-mode_context-mode__ctx_batch_execute` — but Codex
had registered the same tool as `mcp__context_mode__ctx_batch_execute`. Same
underlying MCP server, different alias family, and the skill body had hardcoded
the Claude form everywhere.

Round 1 review caught it. The fix wasn't a rename — that would just shift the
breakage to whichever agent I didn't pick. The fix was admitting that aliases
are runtime-resolved and stopping the skill body from caring which form is
live.

## The problem

Skills shared across Claude Code, Codex, and Gemini CLI sessions can't hardcode
agent-specific MCP tool aliases without breaking on the agents that don't
register that exact alias. Today's example: context-mode tool exposed as
`mcp__plugin_context-mode_context-mode__ctx_batch_execute` under Claude's plugin
discovery, but `mcp__context_mode__ctx_batch_execute` under Codex's newer
registration. A skill that hardcodes one form silently fails to invoke the tool
on the other agent.

## Context

3B's `.agents/skills/<skill>/SKILL.md` files are consumed by all three CLIs via
per-agent skill discovery (Claude's native `Skill` tool, Codex's
`activate_skill` tool, Gemini's skill registry). Tool invocations from inside a
skill body must work on whichever agent the skill activates under.

Hardcoding aliases:

- Bind the skill to one agent's plugin layout
- Break silently on alias renames (which happen as MCP servers evolve)
- Force the skill maintainer to track every consumer agent's discovery
  conventions

The broken case is silent because Claude / Codex / Gemini don't error on
"unknown tool in `allowed-tools`". They just don't invoke it. From the user's
side, the skill runs to completion, the tool call doesn't happen, and the
output looks subtly off rather than catastrophically wrong.

## The solution

The fix is a two-tier alias declaration. Frontmatter carries every alias the
skill might encounter; prose stays generic and never names a specific alias.

### Tier 1 — Frontmatter `allowed-tools` (formal alias list)

Declare ALL alias families the skill might encounter, plus all tool names within
each:

```yaml
allowed-tools:
  Read, Grep, Glob, Bash,
  mcp__plugin_context-mode_context-mode__ctx_batch_execute,
  mcp__plugin_context-mode_context-mode__ctx_search,
  mcp__plugin_context-mode_context-mode__ctx_execute,
  mcp__plugin_context-mode_context-mode__ctx_execute_file,
  mcp__context_mode__ctx_batch_execute, mcp__context_mode__ctx_search,
  mcp__context_mode__ctx_execute, mcp__context_mode__ctx_execute_file
```

The binary consumes this list. Whichever alias is registered at runtime is the
one the agent invokes. Both forms in the list = both agents work.

### Tier 2 — Body prose (generic names only)

In the workflow body, refer to tools by the trailing generic name:

```markdown
Use `ctx_batch_execute` for parallel gathering of the four core sources.
```

Not:

```markdown
Use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` for ...
```

Generic prose:

- Reads naturally — the alias prefix is implementation detail
- Works for whichever alias the runtime resolves to
- Survives alias renames without prose churn

### Tier 3 — Alias-resolution note

Add a short note explaining the mechanism so future readers don't bind prose
back to a specific alias:

```markdown
**Note on tool aliases:** Workflow text below uses generic context-mode names
(`ctx_batch_execute`, `ctx_search`, `ctx_execute`, `ctx_execute_file`). The
binary resolves these to whichever alias family is registered — Claude's
`mcp__plugin_context-mode_context-mode__*` family or Codex's newer
`mcp__context_mode__*` family. Both forms are declared in the frontmatter
`allowed-tools` block; runtime picks one based on the active agent. Avoid
binding prose to a specific alias in this skill — it's cross-agent.
```

That note paragraph is the only place in the body where the formal aliases
appear by name. Everywhere else, the generic name is the canonical reference.

## Difficulties encountered

- The frontmatter list grows fast — 4 tools × 2 families = 8 entries. Acceptable
  cost for cross-agent compatibility. The list is declarative; it's only
  annoying if you also list each in prose.
- Initial reflex was "list both aliases everywhere prose mentions a tool" — this
  DOUBLES every prose mention and creates churn on every alias rename. Generic
  prose + frontmatter list scales better.
- Smoke-audit script needed an explicit allowlist for the alias-resolution note
  (which DOES mention both family prefixes by design). Generic check "no
  plugin-prefixed alias in body" produced false positives until the note
  paragraph was carved out.

## Key points

- **Frontmatter declares; prose describes.** Frontmatter `allowed-tools` is the
  formal alias list (binary consumes this). Body prose is human-readable
  description (use generic names).
- **Both alias families in frontmatter** — Claude's
  `mcp__plugin_<server>_<server>__<tool>` AND Codex's `mcp__<server>__<tool>`.
  Runtime picks the one that's registered.
- **Generic names in body** — `ctx_batch_execute`, not full alias.
- **One alias-resolution note per skill** that mentions both family prefixes is
  the only place the formal aliases appear in body prose. Smoke audit must
  allowlist this paragraph.
- **Aliases rename; prose shouldn't** — every alias rename should be a
  frontmatter-only change.
- **The binary is the resolver, not you** — both agents' MCP loaders match
  `allowed-tools` entries against registered tools. Listing both families means
  whichever runtime is live picks the matching entry.

## When to use this

- Any skill in `.agents/skills/` (or equivalent cross-agent skill directory)
  consumed by multiple agents.
- Any skill that invokes MCP tools (vs. only built-in tools like Read, Bash,
  Grep).
- Skills shipped to the public via plugin marketplaces — assume both agent
  families.

## When not to use this

- Single-agent skills under `.claude/` only — keep the prose specific to the
  agent's alias family for clarity.
- Skills that only use built-in tools (Read, Bash, Grep, Glob, Edit) — no
  aliasing concern.

## Takeaway

The mental model that took the longest to internalize: the alias is not the
tool. The alias is how a specific runtime addresses the tool. If the skill body
binds to one alias, it binds the skill to one runtime, and "cross-agent" is a
lie.

Frontmatter is where the binding lives because the binary is the part that
needs to know which alias is registered. Prose is for humans, and humans don't
need the prefix to understand which tool you're talking about. Splitting those
two concerns is what makes the skill survive every alias rename without
touching the workflow text.

## See also

- `knowledge/general/schema-versioned-helper-json-envelope.md` — when the skill
  calls a helper, the helper's output should be cross-agent too.
- `knowledge/devops/stdlib-only-helper-portability.md` — what helpers should be
  built with to stay cross-agent compatible.
- `knowledge/ai-ml/ai-review-cross-agent-convergence.md` — three agents
  independently flagging the same finding gives near-100% confidence signal.

---
title: 'Codex `apply_patch` is a Shell-Mediated Tool, Not a Direct Tool'
description: >-
  Codex CLI doesn't have a discrete edit tool. File edits flow through
  `local_shell` carrying `apply_patch` patch text. Cross-agent hooks need a
  payload-parsing wrapper, not a tool-name matcher.
date: 2026-05-01T00:00:00.000Z
updated: 2026-05-05T00:00:00.000Z
tags:
  - ai-ml
  - codex
  - claude-code
  - hooks
  - cross-agent
  - transferable
  - gotcha
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/openai/codex'
    title: Codex CLI repository
    type: official
source_content_hash: d011b9be3a8b0a04b147e2596f7e02d55ba2f667e36b5a1520071914bedefc48
---

I started PR #43 with a plan: take the existing Claude `PostToolUse` hook
(`graphify-update-debounced.sh`, matcher `Edit|Write|MultiEdit|NotebookEdit`),
copy it into Codex's profile, and ship per-edit graph refresh on both agents.
The hook wouldn't even need to change — same matcher, same script.

Then I checked Codex's tool inventory. Codex has no `Edit` tool. No `Write`,
`MultiEdit`, or `NotebookEdit` either. The matcher I'd planned to reuse would
match nothing on every Codex session, and the hook would silently no-op.

The fix wasn't another script. It was understanding that Codex doesn't model
edits as a tool at all — they flow through the shell tool family carrying
`apply_patch` patch text. That changes what the matcher needs to look at,
where the file paths come from, and how many files a single hook firing has to
process.

## The problem

Cross-agent hook design that targets file-edit tools assumes each agent has a
discrete edit tool fitting a uniform schema. Claude Code has `Edit`, `Write`,
`MultiEdit`, `NotebookEdit` as direct tools with `tool_input.file_path`
payloads. Reusing a Claude `PostToolUse` matcher list
(`Edit|Write|MultiEdit|NotebookEdit`) under Codex CLI fails silently — Codex
never calls a tool with that name.

## Context

The 3B `wrap-graph-freshness-gate` task (PR #43) initially planned to install
the existing `graphify-update-debounced.sh` hook under Codex via a Codex profile
`hooks.json` entry, reusing the Claude script unchanged. Phase 0a's "reuse
Claude scripts" assumption broke on contact with the actual Codex tool
inventory.

## The Codex edit model

Codex CLI does NOT have a discrete edit tool. Instead, edits flow through the
shell tool family (`local_shell`, `exec_command`, `shell`, `container.exec`,
`Bash`, `Shell`) carrying a structured `apply_patch` command:

```json
{
  "tool_name": "local_shell",
  "tool_input": {
    "command": [
      "apply_patch",
      "*** Begin Patch\n*** Update File: path/to/file.ts\n@@ ...\n*** End Patch"
    ]
  }
}
```

The patch text uses three directives to declare affected paths:

- `*** Update File: <path>` — modify existing file
- `*** Add File: <path>` — create new file
- `*** Delete File: <path>` — remove file

A single `apply_patch` invocation can touch multiple files. The string
`apply_patch` is the conventional first arg in `command[]` — Codex's binary
explicitly rejects `applypatch` and `apply-patch` aliases in its instructions
template.

Source: extracted from `/opt/homebrew/bin/codex` via
`strings | grep apply_patch`. The relevant binary excerpt:

```text
- Use the `apply_patch` tool to edit files
  (NEVER try `applypatch` or `apply-patch`, only `apply_patch`):
  {"command":["apply_patch","*** Begin Patch\\n*** Update File: ..."]}
```

This is documentation for the model — the binary's instructions template is
literally telling the LLM "edit files this way." It's not a registered tool,
and the agent's tool router never sees `apply_patch` as a tool name.

## Why this matters

For PostToolUse hooks that should fire on edits, the Codex matcher must target
shell-tool names AND the hook script must:

1. Detect `tool_name` in the shell family.
2. Parse `tool_input.command[1]` for the patch text.
3. Extract file paths from `*** Update File: <path>` / `*** Add File:` /
   `*** Delete File:` lines.
4. Apply the rest of its policy (privacy gate, debounce, etc.) per extracted
   path.

A naive cross-agent hook that just adds an `apply_patch` matcher entry will not
match anything (Codex never calls a tool literally named `apply_patch` — that
string is the first ARG to `local_shell`).

## Detection

Confirm Codex's tool model on a system before designing hooks:

```bash
# Locate the codex binary
which codex                 # /opt/homebrew/bin/codex on macOS

# List edit-related strings (shell family + apply_patch documentation)
strings /opt/homebrew/bin/codex \
  | grep -E '^(apply_patch|local_shell|shell|exec_command|container\.exec)$' \
  | sort -u

# Find the apply_patch invocation example in the instructions template
strings /opt/homebrew/bin/codex \
  | grep -B 1 -A 3 'Begin Patch'
```

The result confirms `apply_patch` lives in the binary as a documented shell
command, not as a tool name registered with Codex's tool router. The same
discovery technique works for any tool you suspect of being shell-mediated —
the binary either has it as a registered name or as documented prose for the
model.

## Implications for cross-agent hook design

When a feature wants per-edit hook coverage across Claude Code + Codex:

| Concern            | Claude Code                            | Codex CLI                                         |
| ------------------ | -------------------------------------- | ------------------------------------------------- |
| Tool name to match | `Edit\|Write\|MultiEdit\|NotebookEdit` | `local_shell\|exec_command\|shell`                |
| File path source   | `tool_input.file_path`                 | parse from `tool_input.command[1]`                |
| Files per call     | 1                                      | 1 to many (single patch can touch multiple files) |
| Hook script reuse  | direct                                 | needs patch-text parsing wrapper                  |

The "reuse Claude scripts unchanged for Codex" assumption fails. Either write a
Codex-specific wrapper that parses `apply_patch` payloads, or accept that
per-edit hook coverage is Claude-only (and design the end-of-session reasoning
gate to compensate, as `/wrap` Step 5.9 does).

## Difficulties encountered

- The discovery surfaced after committing to a "Block on parity first" Phase 0a
  plan that assumed direct-tool reuse. Re-scoping mid-task lost ~30 minutes but
  prevented shipping a hook that would silently no-op on every Codex session.
- `instructions_template` is a multi-megabyte string in the binary;
  `strings | grep` works but the "where exactly is apply_patch documented" isn't
  obvious without `grep -A 20 'apply_patch.*command'`.
- Codex's tool family for edit-like operations is wider than expected
  (`local_shell` + `exec_command` + `shell` + `container.exec` + `Bash` +
  `Shell` are all aliases for shell execution). A complete matcher would
  enumerate all of them.

## Key points

- **Codex `apply_patch` is a shell command, not a tool name.** Direct-tool hooks
  targeting `apply_patch` as a tool name will never fire.
- **Patch text is the source of truth for affected paths.** Extract via regex
  against `*** Update File:`, `*** Add File:`, `*** Delete File:` directives.
- **A single apply_patch can touch multiple files.** Hook logic needs to loop
  over all extracted paths.
- **Cross-agent hook reuse needs a payload-parsing wrapper.** Don't assume
  Claude's PostToolUse hook scripts work for Codex unchanged.
- **Per-edit hook is optimization, not correctness.** End-of-session reasoning
  gates (like `/wrap` Step 5.9) work on both agents without per-edit hooks;
  they just recommend refresh more often in agents that lack the per-edit
  baseline.

## When to use this

- Designing PostToolUse hooks intended to fire on file edits across multiple
  agents.
- Migrating a Claude-only hook to Codex parity.
- Investigating why a Codex hook never fires on edits despite an apparent tool
  match.
- Auditing cross-agent tool inventory before committing to a "reuse scripts
  unchanged" plan.

## When not to use this

- Single-agent hook design (Claude-only or Codex-only). The shell-mediation
  detail doesn't matter when only one agent is in scope.
- Server-side tool design (this is purely about CLI hook lifecycle).

## Takeaway

The mistake I made on Phase 0a was assuming "edit tool" was a uniform concept
across agents. Claude exposes it as a registered tool with a structured
payload; Codex exposes it as a documented shell command the model is
instructed to use. Both work. Both edit files. But they take different shapes
in the hook lifecycle, and the hook has to be designed against the actual
shape, not the conceptual one.

The cheaper fix, in retrospect, would have been a 5-minute `strings | grep`
audit before writing the plan. Tool inventory first; hook design second. That
ordering is the lesson I'm taking forward.

## See also

- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — companion
  cross-agent compatibility pattern at the skill-alias layer.
- `projects/3b/decisions/019-graph-tool-integration.md` § Update — documents
  Phase 0a deferral with this rationale.
- `tmp/archived-tasks/40-wrap-graph-freshness-gate/round-1-review.md` (and the
  original `proactive-review.md`) — full session context.

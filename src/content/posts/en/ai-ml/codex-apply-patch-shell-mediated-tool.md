---
title: 'Codex `apply_patch` Hooks: The Matcher Fires, the Payload Differs'
description: >-
  Corrected 2026-09-20. Codex hooks do see `apply_patch` as a tool, and an
  `Edit|Write` matcher reaches it. What still breaks a reused Claude hook is
  the payload: patch text instead of a file path, and many files per call.
date: 2026-05-01T00:00:00.000Z
updated: '2026-09-20'
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
  - url: 'https://developers.openai.com/codex/hooks'
    title: 'Codex hooks: matcher patterns and tool coverage'
    type: official
  - url: 'https://github.com/openai/codex'
    title: Codex CLI repository
    type: official
source_content_hash: 215b5f101d01428c3c51d94f26e82cf8f924ab67c26e9512236fc4b66ca5dfe8
---

> **Correction, 2026-09-20.** This post first shipped in May 2026 under the
> title "Codex `apply_patch` is a Shell-Mediated Tool, Not a Direct Tool". Its
> central claim was wrong for current Codex: I said a hook matcher naming
> `apply_patch` could never fire. It does fire. The sections below are
> rewritten against the current hooks documentation and a re-test on Codex
> 0.154.0. The original reasoning is kept at the end, labeled as history,
> because how I got it wrong is the useful part.

I wanted one `PostToolUse` hook to refresh a code graph after every file edit,
on both Claude Code and Codex. The Claude version already existed, with the
matcher `Edit|Write|MultiEdit|NotebookEdit` and a script that read
`tool_input.file_path`. The plan was to copy it into the Codex profile
unchanged.

In May I concluded that the copy would never fire on Codex. That was wrong. The
copy fires. It then reads a field that is not there and does nothing, which is
a quieter failure than the one I described, and a harder one to notice.

## What Codex hooks see today

The [Codex hooks documentation](https://developers.openai.com/codex/hooks#tool-coverage)
lists `apply_patch` in its tool coverage table with both `PreToolUse` and
`PostToolUse` supported. A matcher can name it three ways: `apply_patch`,
`Edit`, or `Write`. Whichever alias matched, the hook input still reports the
tool name as `apply_patch`.

Shell execution is a separate row. Shell commands and unified exec
(`exec_command`) both match as `Bash`.

The same page says `apply_patch` carries its input in `tool_input.command`. I
re-tested on Codex 0.154.0 in an isolated profile: a `PreToolUse` hook with
the matcher `apply_patch` fired on a native edit, denied it, and then accepted
the retry. The payload has this shape:

```json
{
  "tool_name": "apply_patch",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: src/app.ts\n@@ ...\n*** End Patch"
  }
}
```

So the matcher half of my reuse plan was fine. `Edit|Write` reaches Codex file
edits through the documented aliases.

## Where the reused hook still breaks

The script is the problem. A Claude edit hook reads one path from
`tool_input.file_path`. On Codex that field does not exist. My hook guards an
empty path with `exit 0`, so it runs, finds nothing, and exits clean. Nothing
in the logs says it skipped.

Two differences drive the rewrite:

- The paths live inside the patch text, declared by three directives:
  `*** Update File: <path>`, `*** Add File: <path>`, and
  `*** Delete File: <path>`.
- One call can touch many files. A single patch may carry several directives,
  so the hook has to loop.

A minimal extractor for the Codex side:

```bash
#!/usr/bin/env bash
# Reads hook JSON on stdin, prints one affected path per line.
jq -r '.tool_input.command // empty' \
  | grep -E '^\*\*\* (Update|Add|Delete) File: ' \
  | sed -E 's/^\*\*\* (Update|Add|Delete) File: //'
```

Everything after that point, such as a privacy filter or a debounce, can be
shared between agents. Only the path extraction differs.

## Side by side

| Concern            | Claude Code                            | Codex CLI                                  |
| ------------------ | -------------------------------------- | ------------------------------------------ |
| Tool name to match | `Edit\|Write\|MultiEdit\|NotebookEdit` | `apply_patch` (aliases `Edit`, `Write`)    |
| Reported tool name | the matched tool                       | always `apply_patch`                       |
| File path source   | `tool_input.file_path`                 | parse directives in `tool_input.command`   |
| Files per call     | 1                                      | 1 to many                                  |
| Script reuse       | direct                                 | shared policy, agent-specific path reader  |

One boundary I have not tested: file writes made through a shell command
rather than through `apply_patch`. The documentation routes those through the
`Bash` row, so an edit hook keyed on `apply_patch` will not see them. Treat
each surface as separate until you have watched its payload yourself.

## How I got it wrong

This section preserves the May 2026 reasoning. Its conclusion is superseded.

I inspected the Codex binary with `strings` and found `apply_patch` only
inside the instructions template, as an example the model is told to follow:

```text
- Use the `apply_patch` tool to edit files
  (NEVER try `applypatch` or `apply-patch`, only `apply_patch`):
  {"command":["apply_patch","*** Begin Patch\\n*** Update File: ..."]}
```

From that I inferred three things: that `apply_patch` was the first argument
to a shell tool, that it was never a registered tool name, and that a matcher
naming it would match nothing. I recommended matching the shell tool family
and parsing `command[1]`.

The excerpt shows a shell invocation form. It cannot show which tools the
running client registers, or what payload a hook receives. I read a static
artifact and reported runtime behavior. A five-minute hook that logged its own
input would have answered the real question, in either direction.

## Key points

- `apply_patch` is hook-visible. `PreToolUse` and `PostToolUse` both support
  it, and `Edit` or `Write` work as matcher aliases.
- A reused Claude hook fails after it fires. It looks for
  `tool_input.file_path`, finds nothing, and exits without an error.
- The paths only exist in the patch text. Extract them from the `Update File`,
  `Add File`, and `Delete File` directives.
- Loop over the paths, because one patch can touch several files.
- Binary strings are not runtime evidence. Log a real hook payload before you
  design against it, and log it again after a version bump.

## When to use this

- Porting a Claude Code edit hook to Codex, or the reverse.
- Debugging a Codex hook that matches but has no effect.
- Auditing a cross-agent hook design before committing to script reuse.

## When not to use this

- Single-agent hook design, where the payload difference never comes up.
- Server-side tool design. This is about the CLI hook lifecycle only.

## Takeaway

"Edit tool" is not a uniform concept across agents. Claude Code passes a file
path. Codex passes a patch. The matcher can look identical on both and the
script underneath still has to be written for the payload it will receive.

So I do it in the other order now. Log one real event, read what it actually
contains, and write the hook against that.

## See also

- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md`: the companion
  cross-agent compatibility pattern at the skill-alias layer.
- `projects/3b/decisions/019-graph-tool-integration.md` § Update: documents the
  Phase 0a deferral with this rationale.
- `tmp/archived-tasks/40-wrap-graph-freshness-gate/round-1-review.md` (and the
  original `proactive-review.md`): full session context.

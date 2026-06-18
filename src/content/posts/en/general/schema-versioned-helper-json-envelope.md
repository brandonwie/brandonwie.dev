---
title: Schema-Versioned Helper Output Envelope
description: >-
  A JSON output envelope for cross-agent helper scripts — schema_version,
  status, error, agent, ts. Stable shape, semver-bumpable, error-distinguishing.
date: 2026-05-01T00:00:00.000Z
updated: 2026-05-05T00:00:00.000Z
tags:
  - general
  - json
  - schema
  - helpers
  - cross-agent
  - transferable
category: general
draft: false
lang: en
expanded: true
references:
  - url: 'https://json-schema.org/draft/2020-12/json-schema-core'
    title: JSON Schema Core 2020-12
    type: official
  - url: 'https://semver.org/'
    title: Semantic Versioning 2.0.0
    type: official
source_content_hash: 411a81d89aec84e6b812e5985fb9bd8f496c7122f74da2739f41a669471b7c07
---

The first version of `triage-gather.js` emitted a bare JSON object. Add a field
to the output, and consumers downstream broke silently — they kept reading the
old fields, missed the new one, rendered an incomplete view, and nobody noticed
until a feature relying on the new field shipped wrong. The fix wasn't more
docs. It was an envelope: every helper output gets the same wrapper, and the
wrapper carries the schema version.

This post is about that envelope — what fields it has, why each one earned its
place across two iterations, and what the consumer-side branching looks like.

## The problem

Skills increasingly delegate gather/transform work to small helper scripts
(Node, Python) that emit JSON to stdout for the skill to consume. Without an
explicit envelope, every helper invents its own shape, exit-code-vs-status
convention, and breakage signal. Cross-agent (Claude / Codex / Gemini)
consumption magnifies the cost — each agent's wrapper has to special-case.

## Context

3B's `project-context-loader` skill calls `triage-gather.js` to collect
priorities, active rows, journal Next bullets, etc., then renders them in the
triage view. Earlier iterations had the helper emit a bare object — schema
changes broke the consumer silently. Adding the envelope below prevents that.

## The solution

Standardize on this output shape for any helper invoked from a skill:

```json
{
  "schema_version": "1.0.0",
  "status": "ok | partial | error | tool-missing",
  "error": null,
  "agent": "claude | codex | gemini | unknown",
  "ts": "2026-05-01T...",

  "<helper-specific fields>": "..."
}
```

The envelope wraps any helper-specific payload. The five fixed fields are the
contract; everything inside the helper-specific block is free to change as long
as the schema version reflects it.

### Required envelope fields

| Field            | Type           | Purpose                                                                                                    |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `schema_version` | semver string  | Bumps on shape changes. Consumer skill reads first; aborts if it doesn't recognize the major.              |
| `status`         | enum           | Always-set one-word state. `ok` / `partial` / `error` / `tool-missing` are the standard values.            |
| `error`          | object \| null | When `status != "ok"`, populated with `{ code: string, message: string }`. Null otherwise.                 |
| `agent`          | string         | Helper auto-detects from env (e.g., `CODEX_PROFILE`/`GEMINI_PROFILE` env vars) so the consumer can branch. |
| `ts`             | ISO 8601       | When the helper ran. Useful for staleness checks.                                                          |

### Status semantics

The status enum is the most important field for cross-agent reuse — it tells
the consumer how to react before parsing anything else:

| Status         | When to use                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ok`           | All gather steps succeeded, no skipped sources                                                                                    |
| `partial`      | Some sources unreadable; output has `skipped_sources` array. Skill should still consume but flag.                                 |
| `error`        | Internal failure. Output content is undefined. Consumer should fall back to alternative.                                          |
| `tool-missing` | Helper itself cannot run (e.g., dependency CLI absent). Distinguish from `error` because consumer often has a different fallback. |

### Why semver and not a single integer

Skills that consume the helper care about backwards-compatibility. Bumping the
major tells the consumer "your old fields may not be there"; minor says "new
fields appeared, old ones still work". Single integer collapses these.

In practice, the consumer can pin to a major and accept any minor. That makes
adding new optional fields a non-event for consumers — they only need to
re-test on major bumps. Single-integer schema versions force every consumer to
re-validate on every bump because they can't tell which kind of change it was.

## Implementation sketch

```js
// helper.js
const SCHEMA_VERSION = "1.0.0";

function emit(content, { status = "ok", error = null } = {}) {
  process.stdout.write(
    JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        status,
        error,
        agent: detectAgent(),
        ts: new Date().toISOString(),
        ...content
      },
      null,
      2
    ) + "\n"
  );
  process.exit(status === "error" ? 1 : 0);
}

function detectAgent() {
  if (process.env.CODEX_PROFILE) return "codex";
  if (process.env.GEMINI_PROFILE) return "gemini";
  return "claude";
}
```

The consumer-side branching follows the status enum directly:

```text
Run helper. Parse JSON.
If schema_version major != expected → fall back to manual gather.
If status == "error" → log error.code/error.message; fall back.
If status == "tool-missing" → emit user-facing tool-install hint.
If status == "partial" → consume content; add "Sources skipped" footer.
If status == "ok" → consume content.
```

Note that `tool-missing` and `error` produce different consumer responses. A
crashed helper deserves a fallback. A helper that can't run because the
underlying CLI isn't installed deserves a user-visible install hint. Folding
both into "error" loses that distinction, and the consumer ends up either too
quiet ("just fell back, nothing for the user to do") or too noisy ("install
this!" on every internal crash).

## Difficulties encountered

- Picking the canonical status enum took two iterations. First version had
  `ok | error` only — couldn't represent "ran, but partial". Adding `partial`
  made the consumer-side branch correct. Adding `tool-missing` later
  distinguished "your helper can't run because the underlying CLI isn't
  installed" from "your helper crashed". These are different fallbacks for the
  consumer, so they need different statuses.
- `error` field shape: started as a string; switched to `{ code, message }`
  object so consumer can dispatch on `code` without parsing the message.
- Schema version stored at top of file as a constant. Bumping the constant +
  updating consumer's version-acceptance list is the change ritual. Unit-test
  the helper's emitted JSON against a captured fixture so version bumps stay
  deliberate.

## Key points

- **Always include `schema_version`** — even at 1.0.0. Future-you will thank
  present-you.
- **`status` is always set** — even on the happy path (`"ok"`). Lets consumers
  branch without parsing the rest.
- **Error envelope as object, not string** — consumer dispatches on
  `error.code`, not parsed `message`.
- **Auto-detect agent** — helpers that run cross-agent should embed the detected
  agent in output so consumers can branch on it.
- **Stable JSON ordering** — `null, 2` indent + key order matters for diffing
  and unit-test fixtures. Don't shuffle keys per release.

## When to use this

- Any Node / Python / Go helper invoked from a skill that emits JSON.
- Cross-agent helpers where Claude / Codex / Gemini all consume the output.
- Long-lived helpers where the output shape will evolve.

## When not to use this

- One-off shell pipelines that emit pre-formatted text (the consumer just pipes
  it).
- Helpers where the output is the helper's behavior log, not data (e.g., install
  scripts).

## Takeaway

The envelope isn't impressive. It's five fields wrapped around whatever the
helper actually produces. What matters is that every cross-agent helper has the
same five fields in the same shape, so consumers can write one parser and reuse
it everywhere.

The lesson I keep relearning: the smallest amount of structure between
producers and consumers pays for itself the first time you change something.
Bare JSON is fine when the helper has one consumer that you control. The moment
the consumer count goes above one — three agents, in this case — the cost of
"no envelope" is silent breakage. The envelope is what makes the breakage loud.

## See also

- `knowledge/devops/stdlib-only-helper-portability.md` — what helpers should be
  **built with** to stay cross-agent compatible.
- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — companion
  pattern for the skill side of the equation.

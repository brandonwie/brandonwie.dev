---
title: Codex Skill Mirror Pattern
description: 'When a repository already treats `.agents/skills/` as the canonical skill source, the clean Codex integration is not "replace it with `.codex/skills/`" or "symlink the whole folder wholesale." A mirror layer with selective adapters preserves the canonical source while giving Codex what it needs.'
date: 2026-04-18T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - codex
  - claude-code
  - skills
  - interoperability
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://github.com/openai/codex'
    title: OpenAI Codex CLI — official repository
    type: official
  - url: 'https://developers.openai.com/codex/skills'
    title: OpenAI Codex Skills
    type: official
source_content_hash: 0933c96b3d0d619a465074961063a41516034d120bc3895612b1f94584fc02f9
---

When a repository already treats `.agents/skills/` as the canonical skill source, the clean Codex integration is not "replace it with `.codex/skills/`" or "symlink the whole folder wholesale." Both shortcuts have failure modes that surface only after install, when the skills look like they work but quietly misbehave. The stable pattern is six steps:

1. Keep `.agents/skills/` as the canonical skill source.
2. Add a repo-local `.codex/skills/` mirror.
3. Mirror portable skills as symlinks.
4. Write real Codex adapters only for skills whose runtime assumptions do not transfer cleanly.
5. Sync the repo-local mirror into `~/.codex/skills/` one skill at a time.
6. Disable the Claude-native `.agents/skills/{name}/SKILL.md` in Codex config when a same-name real Codex adapter exists.

## Why direct symlinking is not enough

Claude-native skills often assume runtime features that do not exist in Codex with the same names or semantics, such as `AskUserQuestion`, `TodoWrite`, slash-skill chaining, or Claude-specific tool names like `WebSearch` and `WebFetch`.

A raw directory symlink from `.agents/skills/` into `~/.codex/skills/` makes skills discoverable, but it does **not** make them seamless. The result is a hybrid failure mode:

- portable markdown-only skills appear to work
- high-friction workflow skills are discoverable but operationally misleading
- Codex-specific fixes drift away from the canonical Claude skill if edited in place

## The mirror-with-adapters layout

Introduce a **mirror-with-adapters** layer owned by the target runtime:

```text
.agents/skills/                  # canonical Claude source
  ├── sync-symlink-rectify/
  ├── task-starter/
  └── wrap/

.codex/skills/                   # repo-local Codex mirror
  ├── sync-symlink-rectify -> ../../.agents/skills/sync-symlink-rectify
  ├── task-starter/              # real Codex adapter
  └── wrap/                      # real Codex adapter

~/.codex/skills/                 # global Codex runtime home
  ├── sync-symlink-rectify -> 3b/.codex/skills/sync-symlink-rectify
  ├── task-starter -> 3b/.codex/skills/task-starter
  └── wrap -> 3b/.codex/skills/wrap
```

### The adapter write boundary

When a mirrored Codex skill path is still a symlink into `.agents/skills/`, editing `SKILL.md` at the Codex path edits the Claude source too. That means the transition from "portable mirror" to "real Codex adapter" has an explicit first step:

1. remove or replace the mirrored symlink at `.codex/skills/{name}`
2. create a real directory at that path
3. write the Codex-owned `SKILL.md` there

In git, this migration appears as **delete the old symlink + add real files under the same path**. That is the correct shape of the change, not a sign that the mirror is broken.

### When to write a real adapter

Only create a real adapter when the original skill depends on runtime-specific behavior. Examples from the 3B rollout:

- `task-starter` needed Codex-side translation for `AskUserQuestion`, `EnterPlanMode` / `ExitPlanMode`, and inline slash-skill invocation.
- `wrap` needed translation for `TodoWrite`, `AskUserQuestion`, and nested slash-skill chaining.
- Simpler instruction-driven skills stayed as direct symlinks.

### Adapter sync discipline

Once a skill becomes a real Codex adapter, keep it intentionally compact:

1. Sync against the upstream Claude `metadata.version`.
2. Preserve only the Codex runtime translations that change execution semantics.
3. Port only the decision-critical upstream deltas needed to maintain contract parity.
4. Avoid copying the full Claude skill body unless the target runtime truly needs a full fork.

### Escalation to a portable plugin

When the workflow contains reusable domain logic (state models, scorers, prompt assets, provider protocol), adapter-only mirroring becomes too thin. Promote the extracted system into:

1. a runtime-agnostic core package
2. a thin runtime/plugin wrapper
3. tests that import the extracted package directly

This keeps the cross-agent logic reusable while containing runtime-specific boot steps, update flows, and downstream pipeline coupling inside the wrapper layer.

## Why this layering works

### Canonical source stays single

Claude-first workflow logic remains anchored in `.agents/skills/`, so the existing 3B ecosystem and connected repos do not need to change.

### Target runtime owns its compatibility layer

Codex-specific adaptations live under `.codex/skills/`, where they can evolve without polluting the Claude source with tool-specific conditionals.

### Discovery and execution are separated cleanly

Repo-local mirrors solve **what Codex can discover**. Adapters solve **what Codex can execute cleanly**. Treating those as separate problems avoids both over-duplication and false seamlessness.

Codex can also discover `.agents/skills/` directly from the repository. That is useful for portable pass-through skills but confusing when a real same-name adapter exists under `.codex/skills/`. In that case, disable only the Claude-native source `SKILL.md` in `~/.codex/config.toml` via `[[skills.config]]`; leave the `.codex/skills/` adapter enabled.

### Global install stays reversible

A sync script that links repo-local skills into `~/.codex/skills/` one by one keeps the global Codex home additive. It avoids clobbering built-in/system skills and avoids replacing the entire global skills directory with a repository-owned tree.

## When this fits

The pattern fits when:

- A repository already has a mature skill system in another agent's format.
- The source skill tree is canonical and should remain canonical.
- Some skills are tool-agnostic, but a few high-value workflows are not.
- You want Codex discovery to feel native without rewriting the full skill library up front.

It does not fit when the target runtime should become the new source of truth immediately, when every skill is deeply runtime-specific (so a mirror would mostly become wrappers), or when you need cross-agent parity for connected external repos rather than just the hub repository.

## Practical takeaway

Discovery compatibility and execution compatibility are different problems. Mirror portable skills with symlinks; adapt only the ones with real runtime mismatch. Promote a mirrored skill into a real adapter **before** editing it, or the write lands in Claude's canonical source. Keep adapters compact and synced by upstream `metadata.version` plus decision-critical deltas, not by full clone. When adapter translation stops being enough, split the reusable logic into a portable core package and keep the runtime/plugin layer thin.

## References

- [OpenAI Codex CLI — official repository](https://github.com/openai/codex)
- [OpenAI Codex Skills](https://developers.openai.com/codex/skills)

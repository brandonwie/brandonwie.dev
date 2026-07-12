---
title: Codex Skill Mirror Pattern
description: 'When a repository already treats `.agents/skills/` as the canonical skill source, the clean Codex integration is not "replace it with `.codex/skills/`" or "symlink the whole folder wholesale." A mirror layer with selective adapters preserves the canonical source while giving Codex what it needs.'
date: 2026-04-18T00:00:00.000Z
updated: "2026-07-13"
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
    title: 'OpenAI Codex CLI: official repository'
    type: official
  - url: 'https://developers.openai.com/codex/skills'
    title: OpenAI Codex Skills
    type: official
source_content_hash: 4d086b3e631fb4d2d4fe363bbdde8c3975e6acc4dbbbf11d88281a56e442f1b1
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

A raw directory symlink from `.agents/skills/` into `~/.codex/skills/` makes skills discoverable, but it does not make them run cleanly. The result is a hybrid failure mode:

- portable markdown-only skills appear to work
- high-friction workflow skills are discoverable but operationally misleading
- Codex-specific fixes drift away from the canonical Claude skill if edited in place

## The mirror-with-adapters layout

Introduce a mirror-with-adapters layer owned by the target runtime:

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

In git, this migration appears as a deleted symlink plus real files added under the same path. That is the correct shape of the change, not a sign that the mirror is broken.

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

Three later refinements extend that discipline as the adapters matured.

A real adapter can identify its own runtime from the fact that it was selected, rather than reading it out of the environment. Codex exposes `CODEX_HOME` and `CODEX_PROFILE`, but neither is guaranteed to exist. Treat adapter selection as the runtime provenance signal once explicit arguments and a valid pre-exported agent value are in place. The environment variables are useful hints, not prerequisites the adapter can depend on.

Projection sync runs from the canonical checkout, and a canonical-only guard that rejects a linked worktree is an ownership boundary, not a bug to route around. When the guard fires inside a task worktree, keep the source adapter and the task-branch projection together in one commit, verify parity, and refresh the installed plugin after merge. Bypassing the guard trades a clean ownership rule for silent drift.

Local marketplace source bytes can change without a version bump, which leaves the installed cache pointing at stale content while the version number still matches. Refresh the cache idempotently with `codex plugin add <plugin>@<marketplace> --json`, then compare the cached skill hash against both the marketplace source and the repo adapter before closing out the change.

### Escalation to a portable plugin

When the workflow contains reusable domain logic (state models, scorers, prompt assets, provider protocol), adapter-only mirroring becomes too thin. Promote the extracted system into:

1. a runtime-agnostic core package
2. a thin runtime/plugin wrapper
3. tests that import the extracted package directly

This keeps the cross-agent logic reusable while containing runtime-specific boot steps, update flows, and downstream pipeline coupling inside the wrapper layer.

Bundle the prompt assets with the extracted core so the package stays self-contained rather than reaching back into the original runtime for them. Validate imports and tests inside the runtime-local environment (`uv run` or an equivalent virtualenv) instead of the host interpreter, so the package proves it works on its own terms.

Renaming a portable wrapper touches more than a folder. Align the public identity bundle together: folder name, manifest or distribution name, environment variables, and user-visible state paths all move as one so the outward-facing name stays consistent. Internal module names are a separate decision. Keep them stable unless an API rename earns its own churn, because a wrapper rename does not by itself justify rewriting import paths.

A globally linked adapter can still pin a fixed project execution root when the workflow is tightly coupled to another repository. Global discovery and execution location are separate concerns: the adapter stays visible everywhere while requiring its commands to run from one specific repo.

## Why this layering works

### Canonical source stays single

Claude-first workflow logic remains anchored in `.agents/skills/`, so the existing 3B ecosystem and connected repos do not need to change.

### Target runtime owns its compatibility layer

Codex-specific adaptations live under `.codex/skills/`, where they can evolve without polluting the Claude source with tool-specific conditionals.

### Discovery and execution are separated cleanly

Repo-local mirrors solve what Codex can discover. Adapters solve what Codex can execute cleanly. Treating those as separate problems avoids both over-duplication and the false impression that everything runs cleanly.

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

Discovery compatibility and execution compatibility are different problems. Mirror portable skills with symlinks; adapt only the ones with real runtime mismatch. Promote a mirrored skill into a real adapter before editing it, or the write lands in Claude's canonical source. Keep adapters compact and synced by upstream `metadata.version` plus decision-critical deltas, not by full clone. When adapter translation stops being enough, split the reusable logic into a portable core package and keep the runtime/plugin layer thin.

## References

- [OpenAI Codex CLI: official repository](https://github.com/openai/codex)
- [OpenAI Codex Skills](https://developers.openai.com/codex/skills)

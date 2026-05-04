---
title: '`test -L` vs `realpath` for symlink detection'
description: >-
  A POSIX gotcha. `test -L child/leaf` returns false when a parent is the
  symlink, even when the resolution chain is healthy. Use `realpath` for
  source-of-truth chain validation.
date: 2026-05-01T00:00:00.000Z
updated: 2026-05-05T00:00:00.000Z
tags:
  - devops
  - shell
  - symlinks
  - posix
  - gotcha
  - transferable
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://pubs.opengroup.org/onlinepubs/9699919799/utilities/test.html'
    title: POSIX test(1) — file expressions
    type: official
source_content_hash: f0b203e8bf939e5ead4a265da9f2b22e084fe4e9046fd9c5b44c87e4860a18f9
---

A symlink audit script in my 3B repo almost ran `rm <link> && ln -s` against a
perfectly healthy mount. The check that flagged the "bug" was a single line —
`test -L ~/.claude/skills/<skill>/SKILL.md` — and it returned false. The script
concluded "renameSync trap detected, recovering" and started preparing the
destructive rebuild path. Only a downstream sanity check (file content matched
the SoT) prevented the rm.

POSIX wasn't wrong. The script was wrong about what POSIX promises.

## The problem

`test -L child/leaf` returns false when `child/` is itself a symlink, even when
the resolved chain points at exactly the SoT you expect. Treating that result as
"broken symlink" produces false-positive diagnoses in symlink audit scripts.

The fix is mechanical — swap to `realpath` and string-compare against the
expected target. The reasoning is what matters, because the same trap shows up
in `[ -L X ]` and `ls -la X` too. If you only fix one of them, the bug rotates.

## Context

3B's skill mounts symlink at the directory level:

```text
~/.claude/skills/                       # symlink → 3b/.claude/skills/
~/.claude/skills/<skill>/SKILL.md       # NOT a symlink at the leaf — leaf
                                        # is a regular file inside the SoT
                                        # directory
```

Audit script ran `test -L ~/.claude/skills/<skill>/SKILL.md` expecting "true =
healthy symlink chain". Got false. Concluded "renameSync trap, symlink replaced
by regular file". Wrong diagnosis.

## Why this happens

POSIX `test -L file` walks the path resolving every parent component. By the
time it inspects the leaf, parent symlinks have been followed. The leaf is the
**resolved** entry — usually a regular file, NOT the link that pointed at it. So
`test -L` returns false even though the chain is healthy.

This is correct POSIX behavior — the bug is in the assumption that `test -L`
detects "any symlink in this path's resolution chain". It detects only "this
exact name is a symlink".

## The solution

Use `realpath` (or `readlink -f`) and compare against the expected SoT path:

```sh
RESOLVED=$(realpath ~/.claude/skills/<skill>/SKILL.md)
EXPECTED=/Users/.../3b/.agents/skills/<skill>/SKILL.md
[ "$RESOLVED" = "$EXPECTED" ] && echo "OK" || echo "BROKEN"
```

Python equivalent:

```python
import os
resolved = os.path.realpath(mount)
expected = "/Users/.../3b/.agents/skills/<skill>/SKILL.md"
print("OK" if resolved == expected else "BROKEN")
```

For Node helpers:

```js
const fs = require("fs");
const realPath = fs.realpathSync(mount);
```

Each form does the same thing — resolve the whole chain, then string-compare
against what you expected the chain to land on.

## When to use which

Different questions need different tools. Picking the wrong one is what produced
the false positive in the first place:

| Goal                                          | Tool                           |
| --------------------------------------------- | ------------------------------ |
| "Is THIS exact name a symlink?"               | `test -L path`                 |
| "Does this path RESOLVE to the SoT I expect?" | `realpath` + string compare    |
| "Walk up the path checking each component?"   | iterate + `test -L` per parent |

`test -L` is fine for the narrow question. For symlink audits — anything where
you care about the chain landing in the right place — `realpath` is what you
want.

## Difficulties encountered

- The false-positive masquerades as a real bug. The scripted check produced a
  "renameSync trap detected, recovering" message that almost triggered a
  destructive `rm <link> && ln -s` recovery path. Verifying the audit's recovery
  preconditions (file content matched SoT, parent dir was a symlink) prevented
  the destructive action.
- `ls -la <leaf>` shows the leaf as a regular file (no `l` prefix) when resolved
  through parent symlinks. Reinforces the wrong conclusion if you rely on `ls`
  output for symlink detection.

## Key points

- Symlink resolution in POSIX walks the whole path, not just the leaf.
- `test -L`, `[ -L X ]`, `ls -la X` all describe the leaf's own type after
  parent resolution — not the chain's symlink status.
- `realpath` (BSD + GNU + macOS coreutils) is the portable answer. Compare the
  resolved path against your expected SoT.
- Symlink audit scripts that use `test -L` on leaf paths will produce false
  positives whenever a parent in the chain is the actual symlink. Always use
  `realpath` for SoT chain validation.

## Takeaway

If your audit script's recovery path is destructive, the detection check has to
be the right question, not just a true/false answer. `test -L` answers "is this
exact name a symlink?" — which is rarely what an audit actually wants. The
audit wants "does this path resolve to the place I expect?" That question only
has one tool: resolve the chain, then compare strings.

The bigger lesson, for me, was that POSIX behavior felt counter-intuitive only
because I'd memorized `-L` as "symlink check" rather than "this exact name is a
symlink". Reading the spec carefully would have saved the false positive — and
the near-miss `rm`.

## See also

- POSIX `test(1)` spec — explicitly says `-L` checks "the file" (singular)
- 3B `.agents/skills/check-symlinks/scripts/check-symlinks.sh` — uses `realpath`
  for this reason

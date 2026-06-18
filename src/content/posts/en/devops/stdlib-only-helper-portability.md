---
title: Stdlib-Only Helper Portability
description: >-
  Helpers shipped to multiple agents fail in CI when they assume non-stdlib
  deps. Bind to standard library only — PyYAML, npm packages, and BSD/GNU sed
  flags are the three usual traps.
date: 2026-05-01T00:00:00.000Z
updated: 2026-05-05T00:00:00.000Z
tags:
  - devops
  - portability
  - helpers
  - ci
  - python
  - nodejs
  - transferable
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.python.org/3/library/index.html'
    title: Python Standard Library
    type: official
  - url: 'https://nodejs.org/api/'
    title: Node.js API Documentation
    type: official
  - url: 'https://pubs.opengroup.org/onlinepubs/9699919799/'
    title: POSIX.1-2024
    type: official
source_content_hash: 2c729b3f3bd8a7cf058f24a6568853ee49e1ebd262f51e69a125fad0c14f555b
---

I shipped a helper script to a skill, ran it locally, watched the output, called
it good. The Round 1 PR review came back with three findings — all three from
the same root: the helper assumed a richer environment than the consumer's
machine actually had. PyYAML wasn't in stdlib. The shell pipeline used flags
that diverge between BSD and GNU. The fallback path hardcoded my username.

None of that was malice. All of it was the convenience trap: the author's
machine has the dependency, so the tests pass. CI is the first place the helper
sees a stripped-down environment, and that's where it fails.

## The problem

Helpers shipped with skills (Node, Python, shell) often assume a richer
environment than the consumer's machine actually provides. PyYAML imports fail
in minimal CI containers. `npm install` adds setup friction every agent has to
repeat. `sed -i` differs between BSD (macOS default) and GNU (Linux default) —
same flag, different behavior.

## Context

Helpers cross trust boundaries:

- 3B helpers ship to Claude / Codex / Gemini sessions
- Each agent runs on a different OS or CI image
- Each environment has a different baseline of "what's installed"
- A helper that fails the first time someone clones the repo loses trust

The "first run" experience is the part that matters most for adoption. If a
contributor clones the repo, runs the helper, and sees a `ModuleNotFoundError`
or a silent shell divergence, they bounce. The helper has to work without setup,
or the abstraction is broken.

## The solution

**Bind helpers to standard library only**:

| Language | What's safe                                     | What's NOT safe                                              |
| -------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Python   | `re`, `json`, `os`, `pathlib`, `argparse`       | `yaml` (PyYAML), `requests`, `pydantic`                      |
| Node     | `fs`, `path`, `os`, `url`, `crypto`             | Any `npm install`'d package                                  |
| Shell    | POSIX flags only (`-name`, `-type`, `-l`, `-I`) | `sed -i ''` (BSD) vs `sed -i` (GNU); `xargs -I {}` semantics |

When the helper truly needs a library, prefer:

- Python → write the parsing inline with `re` + manual splits, or invoke
  POSIX-mandated tools (`grep`, `awk`) via the language's standard subprocess
  module.
- Node → fall back to the standard subprocess module for one-off shell calls;
  avoid npm.
- Shell → switch the helper to Node or Python so the portability problem becomes
  "is Node installed" instead of "are these specific flags supported here".

The next three subsections walk through the actual swaps from PR #39's findings.
Each shows a small loss of generality bought against a much larger gain in
portability.

### Example: PyYAML → `re`

Before:

```python
import yaml
fm = yaml.safe_load(parts[1])
version = fm.get("metadata", {}).get("version")
```

After:

```python
import re
fm_text = parts[1]
version_m = re.search(r'version:\s*"([^"]+)"', fm_text)
if not version_m:
    sys.exit(2)
```

Loses generic YAML parsing — gains zero-dependency execution. For helpers that
read 1–2 fields out of frontmatter, this is the right tradeoff. For full
document parsing, switch the helper to a language whose stdlib already covers
the format (Node has JSON; Go has YAML in its tooling stdlib).

### Example: BSD-vs-GNU sed pipeline → Node

Before:

```sh
find ${3B_PATH}/journals -name '*.md' -mtime -3 \
  -exec grep -l '### Next' {} + | \
  xargs -I{} sh -c 'echo "## File: {}"; grep -A8 "### Next" {}'
```

This worked on the author's macOS but produced different output on Linux CI
(xargs `-I` semantics, sed in/out semantics). Fix: rewrite as Node, walking the
directory tree with `fs.readdirSync` and parsing inline.

The shell pipeline lost portability the moment it touched `xargs -I`. Once
that's the case, the cheapest move is usually to leave shell entirely — Node's
stdlib has everything you need for "find files, read them, extract a section,"
and it behaves the same on every platform that has Node.

### Example: hardcoded user path → `$HOME`

Before:

```sh
REPO_ROOT="${REPO_ROOT:-$(git ... || echo /Users/brandonwie/dev/personal/3b)}"
```

After:

```sh
REPO_ROOT="${REPO_ROOT:-$(git ... || echo "$HOME/dev/personal/3b")}"
```

Single character diff (`/Users/brandonwie` → `$HOME`); breaks on every machine
that isn't the author's, vs works on every machine that follows the canonical 3B
path convention. This one is embarrassing because it's so small — but it's also
the kind of thing that ships easily. The fallback path was supposed to be a
last-resort default; the author's machine never hit the fallback, so the
hardcoded value never broke locally.

## Difficulties encountered

- The "convenience trap": author's machine has the dependency, so the helper
  tests pass. CI is the first time the helper sees a stripped-down environment,
  and it fails on import. PR #39 Round 1 review caught this before merge;
  without that review, the helper would have shipped broken for non-author
  users.
- Splitting JSON parsing into `re`-based code feels like backsliding from "use a
  library". For schema-stable single-field reads, it's the right tradeoff. For
  full document parsing, install a stdlib-equivalent alternative or rewrite the
  consumer in a language whose stdlib has it (Node has JSON; Go has YAML in
  tooling; Rust has serde-json stdlib-ish).
- Calls into `grep` / `awk` add a dependency on POSIX utilities being on the
  path. Usually fine, but minimal Alpine images sometimes lack `awk`. Document
  the assumed POSIX baseline.

## Key points

- **Default to stdlib for cross-agent helpers** — `npm install` and
  `pip install` are setup friction every agent repeats.
- **Three frequent traps**: PyYAML (Python's), npm packages (Node's), BSD/GNU
  `sed` divergence (shell's). Each has a stdlib workaround.
- **`$HOME` over hardcoded user paths** — even if you only run on your own
  machine, CI / contributor machines won't have your user.
- **POSIX flags only in shell helpers** — `find -name`, `grep -l`, `wc -l` are
  safe; `sed -i ''` (BSD) and `xargs -I {}` (semantics differ) are not. Test on
  Alpine + macOS + Ubuntu before shipping.
- **Switch language if the stdlib gap is too wide** — if you need YAML parsing
  in Python, write the helper in Node (`js-yaml` is npm but the helper might not
  need YAML at all — see schema-versioned envelope pattern for a Node-friendly
  alternative).

## When to use this

- Any helper that ships with a skill consumed by multiple agents.
- Any script that runs in CI minimal containers.
- Any tooling expected to work on contributor machines without setup.

## When not to use this

- Internal scripts that only run on the author's machine and deliberately use
  machine-specific tooling. Document the assumption.
- Production application code where dependency management is already set up
  (npm, pip, poetry). The portability concern is different there.

## Takeaway

The thing I learned from this review wasn't the specific fixes — those were
mechanical. It was that "works on my machine" is the wrong baseline for
cross-environment helpers. The right baseline is "works on a freshly cloned repo
inside a minimal container." If the helper can't pass that bar, the abstraction
is leaking trust.

The stdlib-only constraint is what makes the bar reachable. Every dependency you
add is a chance for the consumer to be missing it, in a way that surfaces only
on first run — exactly the moment when trust is hardest to recover.

## See also

- `knowledge/general/schema-versioned-helper-json-envelope.md` — what the helper
  should emit; this file covers what it should be built with.
- `knowledge/ai-ml/cross-agent-skill-alias-generalization.md` — the skill side:
  how to declare tool aliases that work across agents.

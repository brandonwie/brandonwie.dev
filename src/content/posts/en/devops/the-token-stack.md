---
title: 'The Token Stack: Four Layers of Code Intelligence Without Re-Scanning'
description: The easy answer to agent context burn is "add memory."
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
expanded: true
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: en
references:
  - url: 'https://github.com/safishamsi/graphify'
    title: graphify repository
    type: official
  - url: 'https://github.com/tirth8205/code-review-graph'
    title: code-review-graph repository
    type: official
  - url: 'https://github.com/mksglu/context-mode'
    title: context-mode repository
    type: official
source_content_hash: ea1d073e3fc02d83c6b569679c5161534b53d25f59668850b1f6a76bf68a6595
---

That answer is usually too vague to help. Agents waste context in different
ways. They reread logs. They dump broad search output. They scan the same
repository shape again. They ask a code graph question with a text search tool.
They open whole files when they only need one symbol. They fetch library docs
from memory instead of current sources.

One memory layer cannot solve all of that cleanly.

3B's tooling stack is deliberately anti-monolithic. It names lanes and assigns
each lane one job.

## Start with the question type

The retrieval rule is simple: choose the lane by the question.

If the question is about durable 3B knowledge, use QMD. It searches the markdown
corpus and respects the information-layer metadata that tells the system what
kind of source it is looking at.

If the question is "where does this live in the repo?", use graphify. It gives a
macro architecture map: communities, central nodes, and structural overview.

If the question is "what breaks if this changed?", use code-review-graph. It is
the change-micro layer: callers, impact radius, review context, tests, and
flows.

If the question is "find or edit this one symbol," use Serena. It is the
symbol-semantic layer, opt-in and scoped to the exact workspace root.

If the question is "what did that command output say?" or "search the fetched
docs/logs from this session," use context-mode. It keeps raw command, web, and
file output out of the chat context and lets the agent query the indexed result.

That routing is more important than the tools themselves. A good tool in the
wrong lane becomes a context leak.

## Graphify owns the macro map

Graphify is for architecture questions.

It is the layer to read when the agent needs the shape of the repo before
touching many files: what the communities are, which nodes are central, and what
subsystems exist. In 3B, the generated graph report is a file-readable artifact.
The agent can consult it without re-running a broad scan.

But graphify is not the right tool for every graph-shaped question. It should
not be used for a narrow file-local edit. It should not answer a precise symbol
refactor. It should not replace the change-impact graph for review work.

It also carries the strongest privacy warning. Code can be handled AST-locally,
but non-code graphify behavior may involve model API upload. That is why the
graph tool rule routes graphify through the information-layer privacy matrix and
staleness checks.

Macro map, privacy gate, freshness gate. That is graphify's lane.

## code-review-graph owns change impact

code-review-graph is the review layer.

It answers questions like: which changed functions matter, what depends on them,
which flows pass through them, and where tests may be missing. That is a
different shape from "show me the repo architecture." It starts from a diff or a
changed file set and expands outward.

This distinction keeps the agent from reading the whole architecture map when it
only needs the blast radius of one patch. It also keeps code review grounded in
current changes rather than in a stale mental model of the system.

It is also a reminder not to overclaim tool state. A role can be real in the
architecture even when a given checkout has not populated its graph yet. Live
stats are evidence only when the current checkout proves them. Until then the
role is a design intention, not a measured fact.

## Serena owns symbol-level work

Serena is intentionally not always on.

It is powerful when the task is symbol-level: find this function, read this
class, perform a refactor, inspect a precise semantic location. But it is keyed
to a workspace root. A main checkout and a `.worktrees/...` checkout are
different roots and must not be treated as the same active workspace.

That is why the rule says to start Serena through an opt-in session wrapper and
verify the current config before trusting it. A symbol tool pointed at the wrong
root is worse than no symbol tool. It returns confident context from the wrong
place.

This is another token lesson: always-on semantic tooling feels convenient until
it silently attaches to the wrong workspace or keeps a daemon alive that the
session did not need.

## context-mode owns output sandboxing

context-mode solves a different waste vector: raw output.

Agents burn enormous context by dumping logs, command output, search results,
HTML, JSON, and file bodies into the conversation, then asking the model to
mentally filter it. context-mode flips that. The command runs in a sandbox, the
raw output is indexed outside the chat context, and the agent prints or searches
only the derived answer.

That makes it the right layer for transient session evidence. It is not the
durable 3B knowledge corpus. It is not a code graph. It is not a symbol editor.
It is the place for "run the analysis there, bring back only what matters."

The guardrail is important: do not use context-mode to auto-index huge raw broad
search dumps. Even a sandbox can become a polluted retrieval store if the agent
feeds it unfiltered corpora. The point is to derive the answer, not to move the
context flood into another database.

## Disabled is not the same as stopped

The cautionary story in this stack is the memory plugin that would not die.

The architecture notes record a removal that took multiple attempts and reclaimed
substantial local data because a supposedly disabled plugin still had worker
behavior. The lesson is not about one plugin. The lesson is that agent tool
surfaces have several layers of truth:

- configuration says what should be enabled;
- plugin registries say what is installed;
- running processes say what is actually alive;
- billing or token logs say what the runtime really consumed.

If those disagree, the runtime wins.

This matters because context tooling is not passive. A daemon that wakes on
session events can burn tokens, write caches, hold stale state, or change what
the agent sees. "Disabled in config" is a hypothesis. Verify the launcher,
registry, process, and output.

## What I would copy

The reusable idea is a lane table, not a shopping list.

For each tool, write down:

- what question it owns;
- what question it must not answer;
- what state it reads;
- whether it is always-on or opt-in;
- what privacy or staleness gate protects it;
- how to verify it is actually running.

That table is what keeps the stack from becoming another monolith. QMD is for
durable knowledge. Graphify is for macro architecture. code-review-graph is for
change impact. Serena is for symbols. context-mode is for transient output.
Context7 fetches current library docs. Markitdown converts binary documents.
Each lane has a job.

The token stack works because it refuses to call all of that "memory." Memory is
only one waste vector. The rest need routing.

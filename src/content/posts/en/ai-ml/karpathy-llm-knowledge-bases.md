---
title: "I Built What Karpathy Described — Before He Described It"
description: >-
  Andrej Karpathy published a pattern for LLM-maintained knowledge bases. I have
  been running one for months. Here is what the comparison revealed.
date: "2026-04-06"
updated: "2026-04-06"
tags:
  - ai-ml
  - knowledge-management
  - claude-code
  - patterns
category: ai-ml
draft: false
lang: en
expanded: true
references:
  - url: "https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f"
    title: "LLM Wiki — Andrej Karpathy"
    type: authoritative
  - url: "https://academy.dair.ai/blog/llm-knowledge-bases-karpathy"
    title: "LLM Knowledge Bases — DAIR.AI"
    type: authoritative
---

When Andrej Karpathy published his "LLM Knowledge Bases" pattern in early April 2026, I had a strange experience reading it. Not "this is new and interesting" but "this is my system, described by someone who has never seen it." The three-layer architecture, the incremental compilation, the index files, the LLM doing all the bookkeeping — I had been running exactly this pattern for months. I call it 3B (Brandon's Binary Brain), and it has been the backbone of how I work across six projects.

This post is not a summary of Karpathy's idea. You can read his gist for that. This is a comparison: what happens when you map an abstract pattern against a system that has been in daily production use, and what the divergences reveal about what actually matters.

## Karpathy's Framework in 30 Seconds

Karpathy describes three layers:

1. **Raw sources** — articles, papers, repos, images. Immutable. The LLM reads from them but never modifies them.
2. **The wiki** — a directory of LLM-generated markdown files. Summaries, entity pages, concept pages, cross-references. The LLM owns this layer entirely.
3. **The schema** — a configuration file (CLAUDE.md, AGENTS.md) that tells the LLM how the wiki is structured and what workflows to follow.

The key insight: the wiki is a **persistent, compounding artifact**. Unlike RAG, which re-derives answers from raw documents on every query, the wiki compiles knowledge once and keeps it current. The LLM handles the bookkeeping that makes humans abandon wikis.

## 3B: The Same Pattern, Different Choices

3B maps cleanly onto Karpathy's three layers, but the implementation choices differ in revealing ways.

| Karpathy's Layer | Karpathy's Implementation | 3B's Implementation |
| ---------------- | ------------------------- | ------------------- |
| Raw sources | `raw/` directory (immutable) | `journals/` (ephemeral, rolled up) |
| Wiki | Entity/concept pages in a wiki directory | `knowledge/` — atomic Zettelkasten entries |
| Schema | Single schema file (CLAUDE.md) | CLAUDE.md + PROJECT-CONFIG + skills + rules |

The first divergence is already visible in the table: **what counts as "raw"?**

## Divergence 1: Ephemeral Journals vs. Immutable Sources

Karpathy treats raw sources as permanent. You clip an article, drop it in `raw/`, and it stays forever. The wiki is derived from it.

In 3B, the raw layer is **session journals** — daily logs of what happened during work sessions. These are explicitly ephemeral. Weekly journals get rolled into monthly summaries. Monthly summaries get rolled into quarterly ones. The daily entries remain forever, but the intermediate rollups are cleaned after aggregation.

Why the difference? Karpathy is researching a topic. His raw sources are external — papers, articles, datasets. They have permanent value as reference material. I am building software across six projects. My raw input is session activity — what I did, what broke, what I learned. The session itself is not the knowledge; the **extracted insight** is the knowledge. The journal is a processing stage, not a source of truth.

This distinction matters: in Karpathy's system, you can always go back to the original article. In 3B, you can always go back to the daily journal, but the weekly/monthly rollups are disposable scaffolding.

## Divergence 2: Wiki Pages vs. Atomic Notes

Karpathy's wiki uses entity and concept pages — potentially long documents that grow as new sources are ingested. An entity page for "transformer architecture" might accumulate content from twenty papers over months.

3B uses Zettelkasten-style atomic notes. One concept per file. Small, focused, reusable. A knowledge entry about "PostgreSQL advisory locks" does not grow into a general PostgreSQL page. It stays narrow. If I learn something about PostgreSQL MVCC, that becomes a separate entry with a `related:` link.

The tradeoff is clear:

- **Wiki pages** are easier to browse. You find the "transformers" page and everything is there.
- **Atomic notes** are easier to link. A single entry can participate in multiple contexts without becoming a grab-bag of loosely related information.

At 200+ knowledge entries, I am glad I chose atomic notes. The entries link to each other through frontmatter `related:` fields, and each one answers a single question. Karpathy's approach might work better for deep research on one topic. The atomic approach works better for cross-project professional knowledge that spans backend, DevOps, security, AI/ML, and frontend.

## Divergence 3: Direct Compilation vs. Session Pipeline

Karpathy's workflow: drop a source into `raw/`, tell the LLM to process it, and the wiki updates.

3B's workflow: work a session → journal captures what happened → `/wrap` extracts knowledge candidates → user approves → entries are created or enriched.

The human-in-the-loop step is deliberate. During a session, I accumulate observations in a buffer file. At session end, `/wrap` analyzes the buffer and conversation history, applies an extraction threshold (does this meet at least 2 of 5 criteria: surprise, recurrence, gotcha, transferability, decision?), and presents candidates for approval.

I tried fully autonomous extraction early on. The problem was noise. The LLM would extract obvious patterns ("use git status to check changes") alongside genuine insights ("PostgreSQL MVCC means INSERT-then-UPDATE leaves raw PII in the WAL"). The threshold gate and human approval eliminated the noise without losing the insights.

## Where We Completely Agree

Despite the divergences, the core mechanics are identical:

**Index files work.** Both systems use `_index.md` files to catalog contents. Karpathy reports this works "surprisingly well at moderate scale (~100 sources, ~hundreds of pages)" and avoids embedding-based RAG. 3B confirms this at 200+ knowledge entries across 11 categories. The LLM reads the index, finds the relevant file, and drills in. No vector database needed.

**LLM-maintained cross-references compound.** Every 3B knowledge entry has `related:` links in frontmatter and `when_used:` tracking that records when and where the knowledge was applied. These links are written and maintained by Claude. Over time, the graph becomes the most valuable part — not any single entry, but the connections between them.

**Health checks are essential.** Karpathy calls it "linting." 3B has `/doc-audit` for broken links and stale references, `validate:dates` for frontmatter consistency, and a frontmatter health check in every `/wrap` session. Without these, entropy wins. Dead links accumulate, entries contradict each other, and the knowledge base degrades silently.

**Outputs should be filed back.** Karpathy: "good answers can be filed back into the wiki as new pages." This is exactly what 3B's enrichment tiers do — when a query produces a new insight, it gets appended to the relevant knowledge entry. Explorations compound.

## The Missing Piece in Karpathy's Pattern

Karpathy's gist describes a system for accumulating and querying knowledge. It does not describe a system for **publishing** knowledge.

3B has a full publication pipeline: knowledge entries are synced to a blog, expanded from reference format to narrative format, translated to Korean, and deployed. The blog is a fourth layer that Karpathy's pattern does not address — knowledge refined into a form that teaches others, not just reminds yourself.

This matters because the act of expanding a terse knowledge entry into a blog post forces deeper understanding. Writing "PostgreSQL advisory locks prevent concurrent batch operations" as a bullet point is one level of understanding. Explaining to a reader when to use advisory locks, how they differ from row-level locks, and what happens when you get it wrong is a deeper level. The blog is not just an output channel; it is a compression test for the knowledge itself.

## What I Stole From Karpathy

Reading the gist surfaced two ideas I had not considered:

1. **Marp slide decks from wiki content.** I have never generated presentations from 3B entries, but the idea is compelling. A knowledge entry about "ECS autoscaling patterns" could become a 10-slide technical presentation with zero manual work.

2. **Synthetic data generation from the knowledge base.** Karpathy mentions this as a future direction: fine-tuning an LLM on your wiki so it "knows" the data in its weights, not just its context window. 3B already has a fine-tuning pipeline (LoRA adapters for a separate project), and the knowledge base could be a training data source.

## Key Takeaway

Karpathy described a general pattern. 3B is a specific instance. The pattern works — not because the architecture is clever, but because the LLM absorbs the maintenance burden that kills every human-maintained knowledge base.

The important choice is not whether to build one, but **what your atomic unit is**. Karpathy chose wiki pages. I chose Zettelkasten notes. Both work. Pick the unit that matches how you think about your domain: pages for deep research on one topic, atomic notes for cross-cutting professional knowledge across many projects.

If you want to start, Karpathy's gist is the right starting point. Paste it into your LLM agent, tell it about your domain, and let the system evolve. The schema will change. The conventions will shift. That is how it is supposed to work. My CLAUDE.md has been rewritten twelve times. The knowledge entries are permanent. The scaffolding is disposable.

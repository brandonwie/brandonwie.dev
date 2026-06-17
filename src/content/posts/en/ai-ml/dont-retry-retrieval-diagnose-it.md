---
title: Don't Retry Retrieval — Diagnose It
description: When retrieval comes back weak, the reflex is to retry. Wei et al. (2026) shows retry compounds errors on out-of-distribution queries — diagnose the failure instead.
date: 2026-05-24T00:00:00.000Z
updated: 2026-05-26T00:00:00.000Z
tags:
  - ai-ml
  - agent-architecture
  - rag
  - failure-routing
  - transferable
category: ai-ml
draft: false
lang: en
references:
  - url: 'https://arxiv.org/abs/2604.15771'
    title: >-
      Skill-RAG: Failure-State-Aware Retrieval Augmentation via Hidden-State
      Probing and Skill Routing
    type: authoritative
  - url: 'https://arxiv.org/abs/2410.13339'
    title: >-
      Probing-RAG: Self-Probing to Guide Language Models in Selective Document
      Retrieval
    type: authoritative
source_content_hash: cc2eb0eb1465d3b7276947a0753d6ae5b632d4ed9cb8c383a4298b2129c0c762
expanded: true
---

When a retrieval-augmented system comes back with a weak first result, the next
move is almost automatic: retry. Re-issue the query, maybe glue the previous
context on, and hope round two lands closer. That reflex feels safe — it's the
same instinct as backoff on a flaky network call. Wei et al. (2026) is the paper
that convinced me it's the wrong default. Naive retry doesn't just fail to help;
on the queries that matter most, it actively destroys the signal you already
had.

## The trouble lives on the tail

The damage shows up on out-of-distribution (OOD) queries — the unfamiliar,
awkwardly phrased, multi-hop questions that make up most of a production RAG
system's tail. In-distribution, where the retriever already works, the choice
barely matters. OOD is where retry quietly burns you.

The interesting part isn't failure _detection_. Adaptive-RAG systems already
detect a weak retrieval. It's the gap between detecting failure and acting on
it. What you do in that gap is the whole game.

How big is the win from getting that gap right? On OOD benchmarks (MuSiQue,
2WikiMultiHopQA), typed routing beats binary gating by **+9.85 ACC** on average
— the mean of MuSiQue's +6.1 and 2WikiMultiHopQA's +13.6. In-domain, where the
baseline already works, the gain shrinks to **+0.8 ACC**. The OOD gain is
roughly **12× the in-domain gain**. Read that as: the harder and stranger your
real queries, the more this matters.

This is what I took from the paper — why retry is a trap, what "diagnose instead
of retry" actually means, how I adopted it in my own knowledge system, and where
the evidence is still thin.

## Three traps on the way in

I'll start with the traps, because each one is a place I could have drawn the
wrong conclusion.

**1. Retry looks neutral, but it isn't.** The paper's § 4.4 case study stuck
with me. A question about a film's release date fails round one. The
binary-gating baseline builds round two by concatenating prior context — and
drifts to "a Japanese rock band," unrelated to the question. Round three
compounds the drift. The retry didn't just waste a call; it overwrote a
round-one signal that was actually closer to correct. Retry isn't free here.
It's negative.

**2. The signal-source misread.** The title sells "hidden-state probing," and
it's easy to walk away thinking you need a neural prober for any of this to
work. But the headline table holds the prober _constant_ across the
binary-gating baseline and the typed-routing system — same probe, same model.
The +9.85 win accrues to _routing granularity_, what you do after detection, not
to the detector itself. That distinction is the most reusable idea in the paper,
and the title almost hides it.

**3. The taxonomy-size trap.** More corrective skills feels safer — surely a
richer vocabulary handles more cases? A follow-up t-SNE shows the opposite. Push
the vocabulary past about six skills (the paper auto-generates extras with an
LLM) and the cluster structure that routing depends on dissolves. The router
can't separate classes it can't tell apart. Small and crisp beats large and
fuzzy.

## The reframe: diagnose → route → apply

The change is small to state and large in consequence. Replace this:

```text
if (failed) retry()
```

with this:

```text
diagnose(failure)  → classify the failure mode
route(class)       → pick a class-specific corrective skill
apply()            → re-retrieve, re-probe; loop until success or clean exit
```

Diagnose the failure class first: is the query too broad? Are the premises
entangled? Are the surface forms misaligned? Or is it truly irreducible — no
amount of rewriting will help? Then route to a corrective skill scoped to _that_
class, apply it, and re-probe. The loop exits on success or on a clean "give up,"
instead of grinding the same primitive.

Wei ships four corrective skills: query rewriting, question decomposition,
evidence focusing, and exit. When I adopted the pattern in my own knowledge
system, I kept the _structure_ — typed routing — but swapped the signal source.
Instead of a hidden-state prober, I route on observable workflow telemetry I
already had: empty result sets, repeated greps, broad-hit counts, stale index
modification times, privacy-gate denials, tool-error classes. My corpus is
closed and well-typed, so those observable signals are enough; I never needed to
train a probe.

That adoption became a single routing rule with seven rows — four lifted from
the paper, three specific to a multi-layer retrieval corpus:

| Wei 2026 skill         | Routing row (my system)                     | Status                                    |
| ---------------------- | ------------------------------------------- | ----------------------------------------- |
| query rewriting        | `surface_mismatch` (detection-only)         | Deferred to index-time `aliases:` instead |
| question decomposition | `entangled_request` → decompose             | Active                                    |
| evidence focusing      | `broad_evidence` → narrow with missing-slot | Active                                    |
| exit                   | `irreducible` exit                          | Active                                    |
| (unique to my corpus)  | `tool_layer_mismatch` → reroute layer       | Active — 5 layered retrieval surfaces     |
| (unique to my corpus)  | `stale_or_private_context` (staleness)      | Active — mtime-aware indexes              |
| (unique to my corpus)  | `stale_or_private_context` (privacy)        | Active — privacy gate                     |

The live rule has since grown past these seven, with extra rows for
reasoning-step retrieval and abstraction re-ranking drawn from other papers. The
mapping above stays scoped to the Wei-derived set so the comparison is clean.

## Why it works

The mechanism is almost obvious once the retry trap is visible. Binary gating
has exactly one move after detection — go again — so it can only re-roll the
same dice with more context attached, which is how it drifts. Typed routing's
advantage is that each failure class gets a _different_ corrective action, and
the round-one signal is preserved instead of overwritten. The gain concentrates
on OOD precisely because that's where the single retry move was most likely to
compound rather than recover.

## When to reach for this — and when not

Use typed routing when:

- The failure surface has **classifiable structure** — three or more modes you
  can name ahead of time.
- Per-class corrective actions are **distinct and well-scoped**, not just "try
  harder."
- Failure-class signals are **observable without extra LLM inference cost**.
- **Hard / OOD cases dominate** your real failure population.

Stick with plain retry when:

- Failures are **monolithic or unclassifiable** — random noise, transient
  network errors. Retry with backoff is the right tool.
- The vocabulary would be **large (>6 corrective skills)**. Past the
  separability ceiling, routing becomes guesswork — you've recreated the
  taxonomy-size trap.
- **Failure cost is low and retry is cheap.** The diagnostic overhead can cost
  more than it saves.

## What I'm still unsure about

I want to be honest about where the evidence stops:

- **Cross-model evidence is thin.** The headline OOD numbers are Gemma2-9B; the
  paper mentions additional models, but the big numbers are single-model.
- **Domain transfer is unproven** — the authors say so. A vocabulary derived
  from open-domain QA "may not generalize to scientific literature or
  multilingual corpora." For a structured corpus (code, schemas, curated notes),
  aligning at index time — author-declared aliases, for instance — may matter
  more than rewriting at inference time.
- **There's no observable-signal-only ablation.** The paper never isolates plain
  observable telemetry against the hidden-state prober at equal routing output.
  So my "you might not need the probe" claim is reasoned, not proven — it's the
  open question I'd most like answered.

> "Experiments demonstrate substantial improvements on hard cases, with
> particularly strong OOD gains, **highlighting the generalization benefit of
> structured skill routing over prober gating alone**." — Wei et al. 2026, § 5

## The one line to keep

Treat retrieval failure as a diagnostic signal, not a trigger to try harder.
Detection was never the hard part — what you do in the gap between detecting
failure and acting on it is.

## References

- **Skill-RAG: Failure-State-Aware Retrieval Augmentation via Hidden-State
  Probing and Skill Routing** — Wei et al. (2026).
  [arxiv.org/abs/2604.15771](https://arxiv.org/abs/2604.15771)
- **Probing-RAG: Self-Probing to Guide Language Models in Selective Document
  Retrieval** — Baek et al. (2024).
  [arxiv.org/abs/2410.13339](https://arxiv.org/abs/2410.13339)

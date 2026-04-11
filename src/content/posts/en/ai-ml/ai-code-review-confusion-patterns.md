---
title: AI Code Review Confusion Patterns
description: >-
  Four distinct ways Claude, Copilot, and Codex get things wrong on PRs — with
  the pattern names, detection signals, and the empirical tiebreaker that
  resolves factual disagreements.
date: 2026-04-08T00:00:00.000Z
updated: 2026-04-11T00:00:00.000Z
tags:
  - ai-ml
  - code-review
  - ai-reviewer
  - confusion-patterns
  - copilot
  - claude
  - codex
category: ai-ml
draft: false
lang: en
expanded: true
source_content_hash: 664b697d0dd2568f3f166d3c69f7415cdeae127ffbbb383c7b488d7302e6302b
references:
  - url: 'https://github.com/brandonwie/crucio/pull/83'
    title: 'crucio PR #83 — Claude vs Codex disagreement on Starlette ordering'
    type: internal
  - url: 'https://github.com/encode/starlette/blob/master/starlette/applications.py'
    title: 'Starlette add_middleware source — authoritative reference'
    type: authoritative
---

Recently I started running a `/validate-pr-reviews` workflow that takes every inline comment Claude, Copilot, and Codex leave on a diff and classifies each as valid, invalid, controversial, or good-to-have. The point is to catch real bugs from the signal side while filtering out false positives with structure.

Two back-to-back PRs in early April produced enough classification material to start naming the failure modes. I can now point at four distinct ways AI code reviewers get things wrong — each with a concrete example, a detection signal, and a prevention technique. These patterns are small (one sample each so far), and I expect the catalog to grow as I validate more PRs. What I want to share today is the shape of the observation, because naming the failure mode made the next triage dramatically faster.

## The setup

The validation workflow looks at every AI reviewer comment on a PR and, for each INVALID finding, asks one question: *why was this wrong?* Not "why was the reviewer confused?" but "what specific class of reasoning failure does this match?" After two PRs, four distinct classes emerged:

| Pattern                                | First seen | Trigger                                                                 |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| Cross-File Blindness                   | NestJS PR  | NestJS decorator vs. Express typing                                     |
| Intentional Design                     | NestJS PR  | Documented trade-off with an inline NOTE                                |
| Disagreeing Claim                      | Starlette PR | Two reviewers give opposite claims; tiebreaker is an experiment       |
| Confidently Wrong on Library Internals | Starlette PR | Articulate reassurance about framework behavior that contradicts source |

What follows is each pattern, with the PR evidence and what I learned about detecting it.

## Pattern 1 — Cross-File Blindness

> **One-line definition:** The reviewer analyzes a function in isolation without checking the related files that shape its behavior.

On a NestJS PR, Copilot flagged a controller parameter `clientTypeHeader?: string` as needing array normalization, citing Express's raw type signature `string | string[] | undefined`. The flag was technically consistent with the Express type, but it was wrong in context: NestJS's `@Headers('key')` decorator returns `string | undefined` for custom headers, precisely because Express normalizes duplicates by joining them with comma-space. The reviewer analyzed the parameter's annotation without following the decorator into its implementation.

**Why it happens.** Most AI reviewers work with a single-file or single-diff context window. They can see the types flowing through the current file but cannot trace a decorator call into its implementation in a dependency package. So "what does this decorator actually return at runtime?" becomes a question they cannot answer, and the type signature at the nearest reachable point (often a raw framework type) becomes the default assumption.

**Detection signal.** Any flag that cites "the framework type says X" for a parameter that is actually produced by a framework decorator. Ask yourself: *did the reviewer look up the decorator, or did they look up the parameter's declared type?*

**Prevention.** Add a reinforcing inline NOTE at the flagged location that explicitly states the decorator's return type. It will not change the reviewer's behavior on the next PR, but it will shortcut future triage when the same pattern reappears.

I wrote the technical deep-dive for this specific case in a separate post — see [NestJS @Headers Decorator Returns string | undefined](/posts/nestjs-headers-decorator-typing) if you want to understand the underlying Express normalization behavior in detail.

## Pattern 2 — Intentional Design

> **One-line definition:** The reviewer flags a known, already-documented trade-off as a problem.

On the same NestJS PR, Claude flagged a mobile header bypass in an auth guard as a security issue. Two lines above the flagged line, an inline NOTE already said: *"known accepted risk (pre-existing) — mobile bypass predates the tier model."* The NOTE was two lines above the flagged code and written in plain English.

**Why it happens.** AI reviewers do not reliably process inline documentation that acknowledges risk. They will read the NOTE and flag the risk anyway, as though the NOTE were not there. This is a philosophical failure more than a technical one — the reviewer weights "is this risky?" over "has the team already acknowledged this risk?"

**Detection signal.** Check whether the flagged region is immediately preceded or followed by a NOTE, TODO, or comment that acknowledges the same issue. If yes, the flag is redundant with existing documentation.

**Prevention.** Harder than it looks. "Already documented" is not a reliable skip reason, because the AI reviewer flagged the code *despite* the documentation. The documentation format may not be machine-readable enough for the reviewer to recognize as a deliberate acknowledgment. I do not have a great fix for this one yet — I just classify it as INVALID and move on.

## Pattern 3 — Disagreeing Claim

> **One-line definition:** Two AI reviewers reviewing the same code give directly opposite factual claims, not opinion differences.

On a Python PR (the `crucio` project, FastAPI / Starlette stack), Codex flagged the `ForwardedHostMiddleware` registration order in `main.py` as inverted, arguing: *"in FastAPI/Starlette, `add_middleware()` stacks so later calls execute earlier"*. On the same lines, Claude-review left an INFO comment that explicitly reassured: *"`app.add_middleware(ForwardedHostMiddleware)` as the first call in `create_app()` is correct — Starlette inserts at index 0 and then applies in reverse, so the first registered becomes the outermost layer."*

These are not opinion differences about style or trade-offs. They are factual disagreements about what Starlette actually does, with a definitive right answer.

**The Empirical Tiebreaker Protocol.** When two AI reviewers disagree on a factual claim, the tiebreaker is not social. Do not defer to whichever reviewer is more articulate, more verbose, or more confident. Run a 6-line experiment immediately:

```python
order = []
def mk(name):
    class M:
        def __init__(self, app): self.app = app
        async def __call__(self, scope, receive, send):
            order.append(name)
            await self.app(scope, receive, send)
    return M
# ... register A, B, C as middleware, then hit the app with a TestClient
# Result: ['C', 'B', 'A'] — last-added runs first. Codex correct.
```

The experiment took 0.2 seconds. The resolution could not have been derived from source inspection alone — both reviewers described the Starlette source correctly, but one of them drew the wrong conclusion from it.

**Detection signal.** Look for cases where one reviewer's finding directly contradicts another reviewer's INFO or LGTM comment on the same lines. This is rare, but catastrophic when missed — shipping a fix based on the wrong reviewer's assurance typically produces a structurally broken deploy. If you only validate FINDINGS and skim INFO comments, you miss the disagreement entirely.

## Pattern 4 — Confidently Wrong on Library Internals

> **One-line definition:** The reviewer issues a confident positive assertion about library behavior that contradicts the authoritative source.

This is the other side of the disagreement in Pattern 3. Claude-review's full INFO text on the Starlette middleware registration was:

> "Starlette inserts at index 0 and then applies in reverse, so the first registered becomes the outermost layer."

The first half is correct — Starlette does call `user_middleware.insert(0, ...)` and later iterates `reversed(middleware)`. The conclusion is wrong. "Applies in reverse" iterates *from the end*, so the element at index 0 (which, after repeated inserts, is the *last-added* middleware) ends up as the outermost wrapper. Claude's mental model treated "first in list" as "first to run" and missed the reverse-iteration step.

Three signals distinguish this from generic hallucination:

1. **Positive framing** — "X is correct" rather than "X is wrong."
2. **Apparent self-consistency** — the reasoning sounds valid on a first read.
3. **Specific details** — names the right functions and primitives (`insert(0, ...)`, `reversed(...)`), which makes the claim feel more credible than vague hand-waving.

**Why this is worse than generic hallucination.** A reviewer who says "I don't know" is easy to ignore. A reviewer who says "this is correct" with specific, accurate-sounding details is *much* harder to second-guess. If Codex had not flagged the same code with the opposite claim, this pattern would have gone uncaught, and the fix would have shipped broken.

**Prevention.**

- **Verify library internals via empirical test, not source reading.** Source reading tells you how the code is structured; an empirical test tells you what it actually does.
- **Confident positive assertions deserve more scrutiny, not less.** When a reviewer says "this is correct," ask: "can I verify this in 10 lines of code?" If yes, verify. If no, ask whether the claim is load-bearing enough to warrant writing the verification.
- **Treat "INFO — X is correct" lines as potentially load-bearing.** I used to skim INFO comments because they are non-actionable. I now read them closely when they touch library internals — they can carry false reassurance that causes real bugs to be dismissed.

## Per-reviewer tendencies

Two PRs is not enough data to draw firm conclusions, but the early pattern is worth noting:

| Agent   | Most common failure mode                | Strength                                            | Weakness                                                                  |
| ------- | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Copilot | Cross-File Blindness                     | Good at surface-level code quality and style checks | Analyzes single-file scope, misses cross-package behavior                 |
| Claude  | Confidently Wrong on Library Internals   | Articulate architectural narrative                  | Confident reassurance on framework internals that contradicts source      |
| Codex   | (too few samples)                        | Terse but often correct on library-internals claims | Small sample size so far                                                  |

The most surprising observation is that articulation and confidence are not proxies for correctness. On the Starlette disagreement, Claude's INFO was articulate, detailed, and wrong; Codex's flag was terse and correct. The tiebreaker was a 0.2-second experiment, not reviewer seniority or prose quality.

## Takeaways

- **Four failure modes are worth naming even at count=1.** The goal of classification is not statistical significance — it is faster triage on the next PR. Once you have a name for the pattern, you recognize it in the wild.
- **Reinforcing NOTEs are the most effective prevention, but only for Patterns 1 and 2.** For Disagreeing Claim and Confidently Wrong, no amount of inline documentation helps — you need an empirical check.
- **The Empirical Tiebreaker Protocol is the highest-leverage technique in the workflow.** When two reviewers disagree, the workflow's job is to flag the disagreement and force an experiment. This is the moment where the whole process pays for itself — it catches the one critical bug that would otherwise have been dismissed via confident but wrong reassurance.
- **Read INFO comments closely when they touch library internals.** They are the natural home for Pattern 4.

I expect this catalog to grow. The point is not to produce a comprehensive taxonomy — it is to make each next bug easier to triage than the last. If you are running AI code review on your PRs and have not started classifying the false positives, naming the shapes of the failures is where I would start.

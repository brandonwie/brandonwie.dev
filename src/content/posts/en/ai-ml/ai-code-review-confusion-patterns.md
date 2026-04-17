---
title: AI Code Review Confusion Patterns
description: >-
  Six distinct ways Claude, Copilot, and Codex get things wrong on PRs — with
  pattern names, detection signals, the empirical tiebreaker that resolves
  factual disagreements, and two temporal failure modes involving stale
  snapshots.
date: 2026-04-08T00:00:00.000Z
updated: 2026-04-18T00:00:00.000Z
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
source_content_hash: 827def9371261895bf62ceb33eda0ef78a12ecb1df602f846e31fad8b6e21891
references:
  - url: 'https://github.com/brandonwie/crucio/pull/83'
    title: 'crucio PR #83 — Claude vs Codex disagreement on Starlette ordering'
    type: internal
  - url: 'https://github.com/encode/starlette/blob/master/starlette/applications.py'
    title: 'Starlette add_middleware source — authoritative reference'
    type: authoritative
---

Recently I started running a `/validate-pr-reviews` workflow that takes every inline comment Claude, Copilot, and Codex leave on a diff and classifies each as valid, invalid, controversial, or good-to-have. The point is to catch real bugs from the signal side while filtering out false positives with structure.

Two back-to-back PRs in early April produced enough classification material to start naming the failure modes. Two more PRs later in the month added a second class of failure — temporal, not semantic. I can now point at six distinct ways AI code reviewers get things wrong, each with a concrete example, a detection signal, and a prevention technique. These patterns are small (one or two samples each so far), and I expect the catalog to grow as I validate more PRs. What I want to share today is the shape of the observation, because naming the failure mode made the next triage dramatically faster.

## The setup

The validation workflow looks at every AI reviewer comment on a PR and, for each INVALID finding, asks one question: *why was this wrong?* Not "why was the reviewer confused?" but "what specific class of reasoning failure does this match?" Six distinct classes have emerged so far:

| Pattern                                | First seen | Trigger                                                                 |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| Cross-File Blindness                   | NestJS PR  | NestJS decorator vs. Express typing                                     |
| Intentional Design                     | NestJS PR  | Documented trade-off with an inline NOTE                                |
| Disagreeing Claim                      | Starlette PR | Two reviewers give opposite claims; tiebreaker is an experiment       |
| Confidently Wrong on Library Internals | Starlette PR | Articulate reassurance about framework behavior that contradicts source |
| Stale Snapshot Review                  | Python PR  | Review indexed against an earlier revision that no longer is HEAD       |
| `isOutdated` Is Not a Correctness Signal | NestJS DTO PR | GitHub marked thread outdated but the underlying concern was still real |

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

## Pattern 5 — Stale Snapshot Review

> **One-line definition:** The reviewer posts a finding against a revision of the PR that is no longer HEAD.

The first four patterns are all _semantic_ misunderstandings — the reviewer processed the code and reached the wrong conclusion. Pattern 5 is _temporal_: the reviewer processed the right code, reached a valid conclusion on that code, and then the code moved before the review posted.

On a Python PR, Copilot inline-commented on a test file flagging a redundant assertion — `assert not any("http" in t for t in tags)` — as brittle to future tags like `"http2"`. The assertion had already been removed a few commits earlier. Copilot's review timestamp was newer than the removing commit, but Copilot's _indexing_ of the PR had happened against an earlier snapshot. Both mirror sites (Ollama and Gemini) were flagged because both had the same pattern at the indexed snapshot.

**Why it happens.** Copilot's review-indexing pass runs 1–5 minutes after the trigger event. During `/validate-pr-reviews` workflows, Round 1 fixes frequently push within that same window. If the fetch timestamp lags HEAD by even a minute, the reviewer reviews the old tree.

**Detection signal.** The flagged line does not appear in current HEAD. A quick `git log --all -S "<exact quoted claim text>"` usually finds the commit where the flagged code was removed, and its timestamp precedes the review post.

**Prevention.**

- **Do not apply a "fix".** There is nothing to fix — the code has moved.
- **Resolve with `Dismissed: Stale Snapshot — removed in {commit}`** and move on.
- **Add a reinforcing NOTE at or near the current code** describing the intentional contract that replaced the removed line. Future Copilot re-indexes may still find an old cache; the NOTE makes current intent machine-readable.
- **If the pattern recurs on the same PR with the same agent,** consider rebasing or force-pushing to a new branch name — some CI+reviewer combinations index against a stale fork ref.

## Pattern 6 — `isOutdated` Is Not a Correctness Signal

> **One-line definition:** GitHub's `isOutdated=true` flag on a review thread means "GitHub couldn't anchor this comment to a current diff line", not "the concern is resolved".

GitHub marks a review thread `isOutdated` when the flagged line is no longer on the current diff — typically because a subsequent commit touched nearby lines. My validate-pr-reviews skill used to auto-skip these threads on that signal, treating the flag as "no longer applicable". It isn't.

On a recent NestJS PR, Copilot raised an empty-string validation concern on a DTO: `""` passing `@IsString()` and hitting a `WHERE IS NOT NULL` partial unique index. The skill auto-skipped the thread because a later commit had reformatted the DTO and GitHub marked the thread outdated. The reformat didn't fix the underlying concern — it just moved the lines. When I looked at the thread manually, the problem was still real, and a Round 2 pass promoted it to a VALID IMPROVEMENT fix.

**Why it happens.** `isOutdated` is a heuristic about anchoring, not about correctness. It fires whenever the line numbers shift, for any reason — autoformatter runs, neighboring edits, stacked-PR rebases. None of these events say anything about whether the original concern is resolved.

**Detection signal.** Any skipped `isOutdated` thread on a PR that ships with a real bug in the same area. Harder to detect in advance — requires a habit of sampling skipped threads, not just trusting the skip.

**Prevention.**

- Treat `isOutdated` as a heuristic, not a correctness signal.
- If the skill auto-skips these threads, it should still log them as `OUTDATED` in the round's Comment Registry so they remain discoverable during a second pass.
- Give the user a manual override to reconsider any outdated thread.

Operationally, `isOutdated` is correlated with cross-PR line shifts (stacked PRs where one commit's reformat triggers the flag on another PR's thread) and with autoformatter runs. Treat these events as "line moved", not "concern resolved".

## Per-reviewer tendencies

Two PRs is not enough data to draw firm conclusions, but the early pattern is worth noting:

| Agent   | Most common failure mode                | Strength                                            | Weakness                                                                  |
| ------- | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Copilot | Cross-File Blindness                     | Good at surface-level code quality and style checks | Analyzes single-file scope, misses cross-package behavior                 |
| Claude  | Confidently Wrong on Library Internals   | Articulate architectural narrative                  | Confident reassurance on framework internals that contradicts source      |
| Codex   | (too few samples)                        | Terse but often correct on library-internals claims | Small sample size so far                                                  |

The most surprising observation is that articulation and confidence are not proxies for correctness. On the Starlette disagreement, Claude's INFO was articulate, detailed, and wrong; Codex's flag was terse and correct. The tiebreaker was a 0.2-second experiment, not reviewer seniority or prose quality.

## Takeaways

- **Six failure modes are worth naming even at count=1.** The goal of classification is not statistical significance — it is faster triage on the next PR. Once you have a name for the pattern, you recognize it in the wild.
- **Reinforcing NOTEs are the most effective prevention, but only for Patterns 1, 2, and 5.** For Disagreeing Claim and Confidently Wrong, no amount of inline documentation helps — you need an empirical check. Stale Snapshot benefits from NOTEs because they help future re-indexes pick up current intent.
- **The Empirical Tiebreaker Protocol is the highest-leverage technique in the workflow.** When two reviewers disagree, the workflow's job is to flag the disagreement and force an experiment. This is the moment where the whole process pays for itself — it catches the one critical bug that would otherwise have been dismissed via confident but wrong reassurance.
- **Read INFO comments closely when they touch library internals.** They are the natural home for Pattern 4.
- **Don't trust tooling heuristics as correctness signals.** `isOutdated` (Pattern 6) feels like it means "concern resolved" but means "comment cannot be anchored to a current diff line". Log skipped threads so you can re-examine them on a second pass.

I expect this catalog to grow. The point is not to produce a comprehensive taxonomy — it is to make each next bug easier to triage than the last. If you are running AI code review on your PRs and have not started classifying the false positives, naming the shapes of the failures is where I would start.

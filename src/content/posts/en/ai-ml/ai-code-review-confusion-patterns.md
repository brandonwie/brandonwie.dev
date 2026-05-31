---
title: AI Code Review Confusion Patterns
description: >-
  Thirteen distinct ways Claude, Copilot, and Codex behave on PRs — ten failure
  modes plus two productive behaviors to amplify, plus an analyst-side error
  class. With detection signals and the empirical tiebreaker that resolves
  factual disagreements.
date: 2026-04-08T00:00:00.000Z
updated: 2026-05-31
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
source_content_hash: 2bf6c179019898b93b54dbb3b915cd3f2f791e9f1bfdb12f1c819668ef22afbd
references:
  - url: 'https://github.com/brandonwie/crucio/pull/83'
    title: 'crucio PR #83 — Claude vs Codex disagreement on Starlette ordering'
    type: internal
  - url: 'https://github.com/encode/starlette/blob/master/starlette/applications.py'
    title: 'Starlette add_middleware source — authoritative reference'
    type: authoritative
---

Recently I started running a `/validate-pr-reviews` workflow that takes every inline comment Claude, Copilot, and Codex leave on a diff and classifies each as valid, invalid, controversial, or good-to-have. The point is to catch real bugs from the signal side while filtering out false positives with structure.

Two back-to-back PRs in early April produced enough classification material to start naming the failure modes. Two more PRs later in the month added a second class of failure — temporal, not semantic. By late April, a multi-round PR (#858) surfaced something different: a *productive* behavior worth amplifying. May added three more failure modes — including the first analyst-side error class — and one PR-body-vs-source-conflation pattern. Mid-May added two more: a cross-reviewer convergence on a phantom formatting bug, and a second productive behavior where the reviewer audits siblings the analyst missed. I can now point at ten failure modes, two productive behaviors, and one analyst-side class, each with a concrete example, a detection signal, and a prevention or amplification technique. These patterns are still small (one to three samples each), and I expect the catalog to grow as I validate more PRs. What I want to share today is the shape of the observation, because naming the failure mode made the next triage dramatically faster.

## The setup

The validation workflow looks at every AI reviewer comment on a PR and, for each INVALID finding, asks one question: *why was this wrong?* Not "why was the reviewer confused?" but "what specific class of reasoning failure does this match?" Ten reviewer-side failure modes have emerged, plus two productive behaviors worth tracking separately, plus one analyst-side class:

| Pattern                                  | Type     | First seen      | Trigger                                                                 |
| ---------------------------------------- | -------- | --------------- | ----------------------------------------------------------------------- |
| Cross-File Blindness                     | failure  | NestJS PR       | NestJS decorator vs. Express typing; entity NOT-NULL/default invariant  |
| Intentional Design                       | failure  | NestJS PR       | Documented trade-off with an inline NOTE                                |
| Disagreeing Claim                        | failure  | Starlette PR    | Two reviewers give opposite claims; tiebreaker is an experiment         |
| Confidently Wrong on Library Internals   | failure  | Starlette PR    | Articulate reassurance about framework behavior that contradicts source |
| Stale Snapshot Review                    | failure  | Python PR       | Review indexed against an earlier revision that no longer is HEAD       |
| `isOutdated` Is Not a Correctness Signal | failure  | NestJS DTO PR   | GitHub marked thread outdated but the underlying concern was still real |
| Cross-Round Twin Detection               | strength | NestJS PR #858  | Bot applies prior-round fix as template, catches same shape on sibling  |
| PR Diff Scope Confusion                  | analyst  | 3B PR #45       | Analyst used local-base diff instead of origin-base diff                |
| Cross-File Mirror Drift                  | failure  | 3B PR #45       | Mirror prose enumerated 4 of 7 canonical rows; reviewer caught          |
| Issue-Comment vs Inline Thread Gap       | failure  | 3B PR #45       | Bot posted findings as one issue-comment summary, not inline threads    |
| PR-Body-Source-Conflation                | failure  | 3B PR #47       | Reviewer treated PR description prose as source-code commentary         |
| Long-Row Formatting Hallucination        | failure  | 3B PR #84       | Two reviewers converge on phantom "missing backticks" on a long row     |
| Sibling-Fix Holdout                      | strength | Frontend PR #2799 | Reviewer catches analyst's missed siblings of a folder-scoped fix     |

What follows is each pattern, with the PR evidence and what I learned about detecting (or amplifying) it.

## Pattern 1 — Cross-File Blindness

> **One-line definition:** The reviewer analyzes a function in isolation without checking the related files that shape its behavior.

On a NestJS PR, Copilot flagged a controller parameter `clientTypeHeader?: string` as needing array normalization, citing Express's raw type signature `string | string[] | undefined`. The flag was technically consistent with the Express type, but it was wrong in context: NestJS's `@Headers('key')` decorator returns `string | undefined` for custom headers, precisely because Express normalizes duplicates by joining them with comma-space. The reviewer analyzed the parameter's annotation without following the decorator into its implementation.

The same pattern showed up again in a different shape on PR #872. Claude traced `fromEntity` into `create()` and argued that a plain all-day block could throw 400 because `dto.detail === undefined` would make `isAllDay` false. The two-file trace was internally consistent, but it missed the entity-level invariant: `hasDetailFields` includes `block.priority`, a NOT-NULL enum column with a default truthy value. A DB-loaded entity always carries that field, `{ ...block }` preserves it, and `detail` is therefore created. The missing context was not another function call; it was the `@Column({ default })` declaration that made the guard's input shape stronger than the local DTO trace suggested.

**Why it happens.** Most AI reviewers work with a single-file or single-diff context window. They can see the types flowing through the current file but cannot trace a decorator call into its implementation in a dependency package. So "what does this decorator actually return at runtime?" becomes a question they cannot answer, and the type signature at the nearest reachable point (often a raw framework type) becomes the default assumption.

**Detection signal.** Any flag that cites "the framework type says X" for a parameter that is actually produced by a framework decorator, or any two-file trace that ignores a NOT-NULL/defaulted entity column. Ask yourself: *did the reviewer look up the decorator, or did it stop at the declared type? Did it check the entity invariant, or only the mapper and DTO?*

**Prevention.** Add a reinforcing inline NOTE at the flagged location that explicitly states the decorator's return type or the NOT-NULL/default invariant. It will not change the reviewer's behavior on the next PR, but it will shortcut future triage when the same pattern reappears.

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

## Pattern 7 — Cross-Round Twin Detection (Strength)

> **One-line definition:** The reviewer applies a fix from an earlier round as a template and catches the same shape in a sibling file or class on the next round.

The first six patterns are all things you want to *suppress*. Pattern 7 is the opposite — a behavior worth deliberately *amplifying*, because it converts one fix into a structural cleanup across a codebase.

Pattern 7 emerged on PR #858 (April 28). Across four rounds, the bot kept applying earlier fixes as templates:

- **R3-1:** bot flagged a per-ref `publishContactUpserted` loop on `SyncAttendeeContactListener`. Fix: bulk emit.
- **R4-1:** bot flagged a per-ref `publishContactUpserted` loop on `AttendeeContactListener` — different class, different `@OnEvent` topic, but the same shape. Fixed identically.
- **F-T-4 (proactive):** bot flagged missing `addBulkWithSentry` on `BlockSearchListener`. Fix landed.
- **R2-1:** bot flagged the same gap on `ContactSearchListener`. Same fix applied.

**Why it works.** The bot reads the PR's diff context — prior commits plus summary comments — when it reviews a new round. When a fix lands in commit N, commit N+1's review prompt includes that fix as input. The bot applies it as a template, looking for the same shape elsewhere in changed files. The PR diff context is acting as semantic memory across rounds.

**How to amplify.**

- **Use the round summary comment to describe the fix shape, not just the file:line.** The bot reads the comment. "Replaced per-ref emit with `publishBulkAsync` + listener `addBulk`" is a template; "Fixed N+1 emit in attendee listener" is not.
- **After fixing one site, deliberately leave nearby twin code for the next cascade.** Let the bot find it. Triggering `@claude review` on every commit gives it the surface to scan.
- **Multi-round validation (R1 → R5+) is what surfaces these.** Single-round PRs miss the twins entirely. Plan for multiple rounds when the change shape is likely to repeat.

**Anti-pattern that suppresses Pattern 7.** Marking R4-1-style findings as `DUPLICATE` of R3-1 by location/file alone. They're not duplicates — they're the same shape on a different surface. Dedup rules in `/validate-pr-reviews` Phase 1.5 should distinguish "exact location match" (real duplicate) from "pattern repeat" (twin detection). Mark as RELATED-NOT-DUP and classify as a new finding.

## Pattern 8 — PR Diff Scope Confusion (analyst-side)

> **One-line definition:** The analyst running `/validate-pr-reviews` misverifies PR scope by using local-base diff instead of origin-base diff.

This pattern is distinct from the rest of the catalog because it's a failure of the analyst (Claude doing the validation), not the reviewer. It's worth aggregating because cross-agent skills may have analysts on multiple sides; the failure mode is symmetric.

On 3B PR #45, Claude (analyst) dismissed a reviewer claim that an archive deletion was unrelated to the PR. The dismissal used `git diff main..HEAD --name-only`, which returned 4 task-starter files only — the archive was filtered out because local `main` already had it. The reviewer was correct: `git log origin/main..HEAD` listed the archive commit. A Round 2 reviewer (claude bot) caught the dismissal mistake and forced a retraction.

**Why it happens.** Local `main` may diverge from `origin/main` if commits were made locally but not pushed. GitHub's PR diff is computed against `origin/{base}`. When the analyst uses `main..HEAD` instead of `origin/main..HEAD`, the local-only commits look like base content, and any PR commit that touches the same files appears narrower than it actually is.

**Prevention.** ALWAYS use `git diff origin/{base}..HEAD --name-only` (after `git fetch origin`) or `gh pr view {N} --json files` for PR scope verification. Document the lesson in the affected round file with explicit retraction when the mistake surfaces.

**Resolution path.** Either (a) push local `{base}` forward to align with the intent (archive belongs on main → push), or (b) acknowledge the commit is in PR scope and update PR description to call it out.

## Pattern 9 — Cross-File Mirror Drift

> **One-line definition:** A prose mirror of a canonical table drifts silently when the canonical table changes but the mirror doesn't.

Skill systems where one file (e.g., `.codex/skills/X/SKILL.md`) is a prose mirror of canonical tables in another file (e.g., `.agents/skills/X/SKILL.md`) suffer this pattern. Manual mirror maintenance drifts silently when the canonical table changes but the mirror prose doesn't. Reviewers reading both files structurally catch the asymmetry; unit tests counting individual properties (e.g., grep for routing rows) miss it because the count alone may match.

On 3B PR #45, the Codex adapter Phase 0.7 contract bullet enumerated only 4 of the 7 routing rows in the canonical table. Round 3 reviewer (claude bot) caught that `fix-broad → full-project` was missing from the adapter. Round 4 surfaced a separate but same-class issue: `output_commitment` comment style diverged between SKILL.md (`| null`) and templates.md (`; null otherwise`).

**Prevention.** Three layers, increasing in cost and reliability:

- (a) Add a back-reference from mirror to canonical: "See `.agents/skills/X/SKILL.md § Phase 0.7` for the authoritative table." This gives reviewers and humans a clear path to compare.
- (b) Long-term: add a smoke parity test that grep-compares the mirror against canonical for row count and key rows.
- (c) Even better: programmatic cross-file consistency check in CI.

**Root cause category.** Manual sync drift. Same class as drift between docstrings and code, or between schema and migration.

## Pattern 10 — Issue-Comment vs Inline Thread Classification Gap

> **One-line definition:** Bots report findings via two distinct GitHub mechanisms; thread-centric classification flow misroutes the issue-comment-summary kind.

AI bots report findings via two distinct GitHub mechanisms: (a) inline review threads tied to specific file:line, (b) issue-comment summaries posted to the PR conversation. `/validate-pr-reviews` Phase 1 fetches both, but the classification flow (Phase 2-3) is thread-centric — designed around per-finding inline threads with thread IDs. Issue-comment summaries with multiple findings inline get treated as a single bag instead of split per-finding.

On 3B PR #45 R4, claude bot Round 4 review posted findings as ONE issue-comment summary with 2 findings (R4-1 ACTIVE-STATUS stale, R4-2 output_commitment style). No inline review threads were created. The skill protocol asks for "per-thread reply + resolve" — there were no threads. The round file captured both findings correctly but GitHub-side replies could only happen via new issue-comment, not thread-resolve mutation.

**Prevention.** Refine `/validate-pr-reviews` Phase 1 to explicitly distinguish "inline thread findings" from "issue-comment findings" and route classification + reply differently. Issue-comment findings need: (a) parse finding list out of comment body, (b) reply via new issue-comment referencing original, (c) optional `minimizeComment` mutation on the original. Same classification rules apply; reply mechanism differs.

**Root cause category.** Skill design assumption. Designed for one mode; bots use both. Symmetric refinement needed.

## Pattern 11 — PR-Body-Source-Conflation

> **One-line definition:** The reviewer reads PR description prose as if it were source-code commentary, then flags claims that exist in the PR body but not in the file.

This is a variant of Cross-File Blindness, but inverted: instead of missing context across source files, the reviewer is OVER-anchored to the PR body text and misattributes it to the source.

**Example claim:** "the comment at line N says 'Mirrors lines 5-15' — but `oauth_client_ids` is lines 6-10, not 5-15."

**Reality:** the file's actual comment at line N says "Mirrors the `oauth_client_ids` map pattern above; consumed by the gated dynamic env block in `containers{}` below." It contains NO line numbers. The reviewer was referencing the PR description, which DID cite "lines 5-10 / 369-377" as prose context for human readers — not as a comment to be checked against source.

**Why it happens.**

- AI reviewers receive both the PR diff AND the PR body in their prompt context. The body's prose mentions line numbers as orientation aids for the human reviewer; the AI matches that prose against the source as if it were a code comment claim.
- Reviewers don't always tag the source of a quoted phrase ("the docstring says X" vs "the PR description says X"). This pattern is most visible when the reviewer's quote uses the article "the" without specifying which artifact contains it.

**How to detect during validation.**

1. The reviewer's quoted text DOES NOT exist in the source file at the flagged line.
2. The quoted text DOES exist in the PR description.
3. The reviewer treats the PR-body prose as authoritative ("the comment says X — but the actual lines don't match").

**Resolution.** DISMISS as INVALID. No reinforcing comment needed in the source — the source comment was already correct. Optionally: add a note to the round file's confusion-pattern log; if the pattern recurs, add a tag in the PR description prose like `(PR-body description; not a code comment)` to disambiguate.

**Mitigation strategies.**

- Avoid using line numbers in PR description prose unless the line numbers are stable AND close to merge. PR descriptions are durable text; line numbers reference an unstable target.
- When PR body NEEDS to cite line ranges (e.g., for cross-file pattern references), add explicit "(in PR description, not source)" framing so the AI reviewer can disambiguate.

## Pattern 12 — Long-Row Formatting Hallucination

> **One-line definition:** Two or more reviewers independently flag a long markdown table row as missing formatting when the formatting is already present.

Patterns 1 through 11 are mostly single-reviewer failures. Pattern 12 is the first one I've seen where two reviewers converge on the same false positive — which is exactly the signal that *normally* indicates a real bug.

On 3B PR #84, both Copilot (`copilot-pull-request-reviewer`) and Claude (`claude[bot]`) flagged the `failure-state-routing.md` row in `_index.md:55` as having unwrapped trigger globs. The row IS backtick-wrapped — verified at the commit hash in the diff — and Copilot's `suggestion` block was a literal byte-for-byte copy of the existing markup. The row in question is roughly 8 globs wide, two to three times the typical 2-3 globs in neighboring rows.

**Why convergence isn't a signal here.** Both Copilot and Claude appear to share a prior that "long table rows often have formatting drift." Their convergence is shared prior, not shared observation. The genuine cross-reviewer convergence pattern (Pattern 7's twin detection) is productive ONLY when each reviewer is reasoning about the actual content — not when both are pattern-matching against table width. The distinction matters because, in a validation workflow, "two reviewers said the same thing" is usually upgrade-to-high-priority territory.

**Diagnostic signature.**

1. 2+ reviewers converge on the same "missing formatting" claim.
2. Inspection of the raw markdown confirms the formatting is present.
3. The flagged row's character count or width is an outlier relative to its neighbors.
4. The reviewer's `suggestion` block (if any) duplicates the existing content byte-for-byte (or near it).

**Prevention.**

- When a `suggestion` block matches the existing content, treat the finding as INVALID immediately. No `git diff` needed — the proposed change is a no-op.
- Add an inline HTML comment NOTE above any deliberately long table row warning future reviewers to verify the raw markdown rather than the rendered width: `<!-- NOTE: row is backtick-wrapped despite length. Verify raw markdown, not rendered width. -->`
- Aggregate the pattern when 2+ INVALID reviews land on the same row in one round.

This one shifted my mental model on convergence — *what kind* of convergence matters more than the count of reviewers.

## Pattern 13 — Sibling-Fix Holdout (Strength)

> **One-line definition:** Productive reviewer behavior — when the analyst applies a fix to files A and B in a folder but skips sibling C, the next round's reviewer reads the folder structurally and flags C as a missed sibling.

Pattern 13 is the second productive behavior in the catalog. Like Pattern 7, it's worth amplifying. Unlike Pattern 7, the blind spot belongs to the analyst (me, doing the validation), not to the reviewer.

On the moba-frontend onboarding-tutorial PR #2799, three independent instances of this pattern surfaced across rounds 10 through 14 of a single session. Same antipattern shape, three different convention fixes:

| Round            | Fixed by analyst                                                                | Missed sibling caught by reviewer                                                 |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| R10-2            | `isUserProfileReady` guard in `CalendarConnectModal` + `CalendarReconnectModal` | `CalendarConnectButton` in same folder → R12-2 (P2 bug, `userId="undefined"`)     |
| R1, R10-1, R10-4 | `const` arrow → `function` declaration across tutorial components + modal/index | 4 calendar-connection components → R13-2..R13-5 (one cross-file review thread)    |
| R12-4            | Relative imports → `@/` alias on `ConnectedCalendarAccount.tsx`                 | Group order left inverted (`@/assets` first instead of canonical last) → R14-1    |

This is the **reviewer-side mirror of Pattern 8 (PR Diff Scope Confusion)**. The analyst's blind spot is "I only touched what the prior reviewer named"; the reviewer's productive behavior is "are there other instances of this pattern in scope that the analyst missed?" Distinct from Pattern 1 (reviewer analyzes in isolation) and Pattern 9 (manual prose drift) — in those, the **reviewer** is the one missing context. Here, the **reviewer** is doing the structural read and catching what the **analyst** missed.

**Prevention (analyst-side).** When applying any folder-scoped convention or fix, audit ALL siblings in the same directory before committing. The reviewer will catch the holdouts next round, but each holdout costs a full round-trip — commit, push, workflow, bot review, validation cycle. Cheaper to sweep the folder once.

**Amplification (reviewer-side).** Reinforce the productive behavior. When the bot flags a convention fix, encourage it to scan the folder for other instances of the same pattern and surface them in ONE cross-file thread. R13 thread B on PR #2799 is a clean example: one comment listed 4 files, one reply covered 4 commits, one resolve closed the loop.

**Why I'm treating this as a strength, not a process gap.** I could read this as "my validation process should never miss siblings" and try to engineer that out. But the round-trip cost is real, and the bot's structural folder read is genuinely cheap. The honest move is to keep my sweep discipline tight while *also* leaving the bot's audit running as a safety net. Patterns 7 and 13 together are the two cases where multi-round PR validation pays for itself by amplifying what the reviewer does well.

## Per-Reviewer Tendencies

Two PRs is not enough data to draw firm conclusions, but the early pattern is worth noting:

| Agent   | Most common failure mode                | Strength                                            | Weakness                                                                  |
| ------- | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Copilot | Cross-File Blindness                     | Good at surface-level code quality and style checks | Analyzes single-file scope, misses cross-package behavior                 |
| Claude  | Confidently Wrong on Library Internals   | Architectural narrative; strong cross-round twin detection; structural sibling audits | Confident reassurance on framework internals that contradicts source      |
| Codex   | (too few samples)                        | Terse but often correct on library-internals claims | Small sample size so far                                                  |

The most surprising observation is that articulation and confidence are not proxies for correctness. On the Starlette disagreement, Claude's INFO was articulate, detailed, and wrong; Codex's flag was terse and correct. The tiebreaker was a 0.2-second experiment, not reviewer seniority or prose quality.

## Takeaways

- **Thirteen patterns are worth naming even at count=1-3 each.** The goal of classification is not statistical significance — it is faster triage on the next PR. Once you have a name for the pattern, you recognize it in the wild.
- **Reinforcing NOTEs are the most effective prevention, but only for Patterns 1, 2, 5, and (partially) 9.** For Disagreeing Claim and Confidently Wrong, no amount of inline documentation helps — you need an empirical check. Stale Snapshot benefits from NOTEs because they help future re-indexes pick up current intent. Cross-File Mirror Drift can use back-references as a halfway fix while a CI consistency check is the real solution.
- **The Empirical Tiebreaker Protocol is the highest-leverage technique in the workflow.** When two reviewers disagree, the workflow's job is to flag the disagreement and force an experiment. This is the moment where the whole process pays for itself — it catches the one critical bug that would otherwise have been dismissed via confident but wrong reassurance.
- **Cross-round twin detection is multi-round PR validation's killer feature.** Single-round PRs miss the second and third twins entirely. The bot needs prior-fix context (commits + summary comment trailer) to apply the pattern. Always use the round summary comment to describe the fix *shape* so the next cascade has it as template input.
- **Read INFO comments closely when they touch library internals.** They are the natural home for Pattern 4.
- **Don't trust tooling heuristics as correctness signals.** `isOutdated` (Pattern 6) feels like it means "concern resolved" but means "comment cannot be anchored to a current diff line." Log skipped threads so you can re-examine them on a second pass.
- **Institutional rules can override AI flags.** AI reviewers correctly flag documented best practices (e.g., `CREATE INDEX CONCURRENTLY` on hot tables) but cannot see institutional rules ("don't touch generated migration files unless inevitable"). When a flag conflicts with such a rule, the rule wins — even when the flag's technical content is correct. Save such rules as durable feedback memories so future validation rounds default-skip the flag instead of re-litigating it.
- **Always verify PR scope against `origin/{base}`, not local `{base}`.** Pattern 8 is the analyst-side mirror of Pattern 5 — the failure mode is the same shape (stale view of HEAD), only the actor differs. The remediation is mechanical: use `git fetch origin` + `git diff origin/{base}..HEAD --name-only` or `gh pr view --json files`.
- **Mirror systems need a parity check.** Pattern 9's prose-table drift is the same class of bug as docstring-vs-code drift. Treat it the same way: a CI check is the only durable defense; back-references are a useful interim.
- **Convergence isn't always signal.** Pattern 12 (Long-Row Formatting Hallucination) showed that two reviewers can converge on a false positive when both share a prior — "long table rows often have formatting drift" — rather than each independently observing the content. The Pattern 7 / Pattern 13 kind of convergence (each reviewer reasoning about actual content) is the productive shape. Distinguish them by checking whether the reviewer's `suggestion` block actually changes anything.
- **Sweep folders before committing convention fixes.** Pattern 13 (Sibling-Fix Holdout) is the second productive cross-round behavior, but it pays for itself only on multi-round PRs. On a single-round PR, missed siblings ship. The discipline is: when fix touches files A and B in a folder, audit the rest of the folder before pushing. The reviewer's structural read is a safety net, not a substitute.

I expect this catalog to grow. The point is not to produce a comprehensive taxonomy — it is to make each next bug easier to triage than the last. If you are running AI code review on your PRs and have not started classifying the false positives, naming the shapes of the failures is where I would start. And when you spot a *productive* behavior like cross-round twin detection or sibling-fix holdout, treat it the same way — name it, find ways to amplify it, and protect it from dedup rules that would otherwise suppress it.

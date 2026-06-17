---
title: 'Session-State Dashboards: Merge, Don''t Overwrite'
description: 'Regenerating a cross-session dashboard two ways — overwrite, or merge-with-carry-forward — fails in opposite directions. Here is the rule I settled on, and why I eventually stopped tracking the dashboard in git at all.'
date: 2026-04-25T00:00:00.000Z
updated: 2026-06-07
tags:
  - general
  - session-state
  - dashboard-design
  - claude-code
category: general
draft: false
lang: en
expanded: true
references:
  - url: >-
      https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
    title: Render Optimizations — Structural Sharing (TanStack Query)
    type: official
  - url: 'https://github.com/brandonwie/3b/commit/46e23c05'
    title: 'feat(wrap): persist follow-ups across sessions'
    type: experience
source_content_hash: 470857247dee307e9f9cd90991b387fb7386846287eb2e74cd57e3403dd7b922
---

I have a dashboard that summarizes work across sessions — what's in progress,
what's still open, what got finished recently. Every time a session ends, a
script regenerates it. The first time I wrote that script, I reached for the
obvious thing: read the current sources, render the file, overwrite it. Done.

That worked until the session where it quietly erased something I still cared
about. The regeneration strategy turned out to be the load-bearing decision in
the whole feature, and "just overwrite it" was the wrong default for the kind of
data the dashboard actually held.

## Two strategies that fail in opposite directions

There are really only two ways to regenerate a derived file like this, and they
fail in mirror-image ways.

**Full-overwrite** is the simple one. You build the new state from whatever the
current source says and replace the file. The trap is silent state loss: if
something was true last session but isn't present in the source this session, it
vanishes with no trace. For a dashboard whose whole job is "what's still open,"
that's the worst possible failure — the open items are exactly the things that
don't always re-derive cleanly from a single session's source.

**Merge-with-carry-forward** is the other one. You read the prior state, fold in
the fresh data, and keep what's still relevant. It preserves unresolved state
across sessions — but it costs you a dedup-and-resolution step, and if you skip
that step, the dashboard slowly fills with stale entries that were resolved long
ago. So one strategy loses real data, the other accumulates dead data. Picking
the wrong one for a given surface is what produces either the silent-loss or the
stale-clutter symptom.

## The rule I landed on

After getting bitten by overwrite, I didn't want to swing to "merge everything"
— merge is more expensive and has its own failure mode. The rule that actually
held up is to decide per surface, by purpose:

- **Default to merge** when the surface answers _"what's still open across all
  sessions?"_ — priorities lists, follow-up trackers, in-progress task views.
  These are the surfaces where silent loss hurts.
- **Default to overwrite** when the surface answers _"what is the current
  source's state right now?"_ — build status, last-deploy hash, a goal-tracker's
  current progress. These _should_ reflect filesystem truth, and carrying
  forward stale rows would actively mislead.

When I'm unsure which bucket a new surface falls into, I run it through four
questions:

| Question                                           | Merge | Overwrite |
| -------------------------------------------------- | :---: | :-------: |
| Will users be frustrated if items vanish silently? |   ✓   |           |
| Should the dashboard reflect filesystem truth?     |       |     ✓     |
| Does "still open" mean something across sessions?  |   ✓   |           |
| Is the source the only authority?                  |       |     ✓     |

If two or more answers land in the "Merge" column, I merge. The implementation
cost is small — one read of prior state, plus dedup and drop-resolved — and the
user-experience cost of silent state loss is high. The asymmetry is the whole
argument.

This is the same instinct TanStack Query encodes with
[structural sharing](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations):
when fresh server data merges into cached state, unchanged objects keep their
identity instead of being replaced wholesale. The broader principle is that
unchanged data should survive a regeneration, not get rebuilt out from under
whoever is looking at it.

## What "merge" actually costs

It's easy to say "merge" and underestimate it. A real carry-forward merge needs
three things:

1. **Resolution detection** — figure out what's now done and drop it.
2. **Dedup** — the same item showing up in multiple sources should appear once,
   keeping the best version.
3. **A cap and a drop policy** — otherwise carried-forward items accumulate
   forever.

Resolution detection is the part that's genuinely hard, and it's where I spent
the most time. An item can be "resolved" by being checked off `[x]` somewhere,
by showing up in a "Done" section, by being deleted outright, or — the annoying
one — by being implicitly subsumed into a later, restated version of itself. I
stopped trying to detect all of those perfectly. Picking one or two signals and
documenting them is enough, as long as the dedup step is fuzzy enough to absorb
the rest.

The cap policy looked trivial and wasn't. Without a cap, the carry-forward list
grows without bound. With a cap, the _drop order_ starts mattering: never drop
today's fresh signal, always keep auto-generated items, and drop the oldest
carry-forward first. Get the order wrong and the cap throws away the thing you
most wanted to keep.

## The twist: don't let the dashboard merge against itself

Here's the part I didn't see coming. The natural way to implement carry-forward
is to have the regeneration read the _previous dashboard file_ and merge the new
data into it. That's a read-modify-write against the dashboard — and the moment
more than one session can run in parallel, it's a lost-update race. Two sessions
read the same base, each merges its own changes, and whoever writes last wins,
silently dropping the other's update. I'd traded one silent-loss bug for a
subtler one.

The fix was to stop treating the dashboard as an input at all. Instead of the
dashboard merging against its own prior copy, each section is _generated from
durable sources_ — the journals, the todo files, the per-project progress files
that are the real source of truth. The dashboard becomes a pure projection.
Merge semantics still apply where they need to (the "what's open" sections fold
several durable sources together), but the merge is over durable inputs, never
over the generated file itself. That removes the read-modify-write race
entirely, because there's nothing to read back.

## The last move: stop tracking it

Once the dashboard was a 100% projection of durable sources, I noticed it had
become a liability in git. Every regeneration rewrites essentially the whole
file, so any two branches or worktrees that both ran a session would conflict on
nearly every line — a guaranteed merge conflict surface with zero benefit, since
the file carries no information that isn't already in the tracked sources.

I tried to paper over this with an in-checkout advisory lock first, and it
doesn't work for this problem. A lock serializes writers _within one working
tree_, but the conflicts here come from divergent _branch histories_ — two
checkouts that never see each other's lock. The only thing that actually fixed
it was to gitignore the dashboard and regenerate it on demand: at session start
and at session end. The durable sources stay tracked and remain the SoT; the
projection is ephemeral. I untracked the file after it had accrued more than a
thousand commits of pure regeneration churn.

## When not to merge

Merge is the right default for open-state surfaces, but it's the wrong tool when:

- The source is the single canonical authority. `git status` reflects the
  filesystem; merging stale entries into a view of it would only mislead.
- Resolution detection is genuinely impossible — there's no signal anywhere that
  an item is "done," so carried-forward items would never leave.
- The surface is meant to be a fresh report per invocation by design, like
  `git log --oneline -5`. There's nothing to carry forward; a snapshot is the
  point.

## What I'd tell past-me

The one-line version: for a cross-session dashboard, **merge "what's still open,"
overwrite "what's true right now,"** and decide per surface rather than per file.
But the deeper lesson is the ordering of the three mistakes. Overwrite loses
data. Naive merge races against itself. And a fully-derived file doesn't belong
in version control at all. Each fix exposed the next problem, and the end state —
generate every section from durable sources, then don't track the result — is
simpler than any of the intermediate designs I was defending along the way.

## References

- [Render Optimizations — Structural Sharing (TanStack Query)](https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations)
- [feat(wrap): persist follow-ups across sessions](https://github.com/brandonwie/3b/commit/46e23c05)

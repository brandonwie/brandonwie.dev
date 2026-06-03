---
tags: [architecture, adr, renewal, decision, terminal, command-palette]
created: 2026-06-04
updated: 2026-06-04
status: completed
related:
  - ../improvements.md
  - ../structure.yaml
  - ../README.md
when_used: Decide before any terminal-coupled renewal work (A11Y-2/3, UX-1/3, ARCH-3/4).
---

# ADR-0001 · Terminal view vs Cmd+P command palette as the primary power-user surface

**Status:** Accepted — Option B (retire terminal → promote Cmd+P palette), 2026-06-04
**Decision owner:** Brandon
**Supersedes:** — · **Backlog ref:** `improvements.md › PROD-2`

## Context

The site ships two power-user surfaces that overlap:

1. **Full terminal mode** — a Claude-Code-style shell offered as an alternate
   home view (`ViewToggle` blog⇄terminal). It is large:

   | Piece                      | LOC      | Role                                                 |
   | -------------------------- | -------- | ---------------------------------------------------- |
   | `Terminal.svelte`          | 324      | orchestrator, global Ctrl+P/K/L, builds virtual FS   |
   | `CommandLine.svelte`       | 332      | hidden-input + block cursor, tab-complete            |
   | `Output.svelte`            | 184      | renders `OutputLine[]` (incl. dead `{@html}` branch) |
   | `FuzzyFinder.svelte`       | 402      | the Cmd+P/Ctrl+K modal palette                       |
   | `filesystem.ts`            | 184      | in-memory virtual FS over posts                      |
   | `fuzzy.ts` / `terminal.ts` | 73 / 103 | Fuse wrapper / terminal state                        |
   | `commands/**`              | 11 files | 18 commands (`ls cd cat grep open whoami …`)         |

2. **Cmd+P command palette** — `FuzzyFinder.svelte` already exists and works,
   but is wired _through_ the terminal subsystem (`fuzzyFinderOpen` store +
   Ctrl+P/K bound in `Terminal.svelte`) and only searches posts.

**Why now:** this fork gates a chunk of the renewal backlog. Investing in
terminal a11y/UX/arch only makes sense if terminal mode stays. The user's prior
signal: terminal view reads as novelty > utility; Cmd+P should be the focus.

## Decision drivers / constraints

- **SSG only** (adapter-static, no server) — both surfaces are client-side; no constraint either way.
- **Brand identity** — the terminal/Claude-Code aesthetic is the site's signature; losing it has real cost.
- **Maintenance** — terminal carries ~1600 LOC + a11y debt that is genuinely hard for a custom shell.
- **Sunk cost is not a keep-reason** — "already built" does not justify keeping.
- **Reversibility** — removing terminal is high-effort to undo (history retains it); decide deliberately.
- **Discoverability** — terminal surfaces bio/help/social via commands; a palette must absorb those or move them to blog UI.

## Options considered

### Option A — Keep full terminal mode as-is (status quo)

- **Pros:** preserves the signature brand interaction; zero migration; differentiator for a dev personal site.
- **Cons:** ongoing upkeep of ~1600 LOC; novelty > utility for most visitors; duplicated nav paths (terminal vs blog); custom-terminal a11y is hard (focus, live-region, keyboard).

### Option B — Retire full terminal; promote Cmd+P palette as primary _(recommended)_

Keep the palette (Cmd+P/Ctrl+K), remove the full-screen terminal view, migrate
useful commands into palette **actions** (navigate, toggle, open links) and move
bio/about into blog UI.

- **Pros:** keeps the genuinely useful affordance (fast nav/search) without a full alternate UI; deletes ~1300+ LOC and its a11y debt; one modal is far easier to make accessible than a shell; matches how people actually browse a blog; the palette already exists.
- **Cons:** loses the strongest brand interaction; migration work (extract palette to global, expand to commands, rehome bio/help); palette must carry discoverability the terminal gave for free.

### Option C — Hybrid: freeze terminal as an opt-in easter-egg, invest only in Cmd+P

Demote terminal to hidden/secondary (e.g., a `terminal` palette action), freeze
its feature work, document Cmd+P as primary.

- **Pros:** keeps brand novelty for those who find it; stops new terminal investment; lowest immediate migration (don't delete, just stop + change default).
- **Cons:** maintenance-by-neglect (dead-ish code can break silently); a still-reachable "unsupported" terminal is an a11y liability; a half-measure — neither committed nor cleanly cut.

## Decision (proposed)

**Adopt Option B — retire the full terminal, promote the Cmd+P palette to the
primary power-user surface — executed as a phased migration**, with **Option C
as the safe first phase / fallback** if a clean cut is not yet desired.

**Reasoning:** The user's signal (terminal = novelty, Cmd+P = focus) points at B.
B is the only option that actually removes the maintenance + a11y debt rather
than deferring it (A) or letting it rot (C). The chief con of B — losing brand
identity — is **mitigable**: the palette and blog keep the terminal _aesthetic_
(JetBrains Mono, the `--color-terminal-*` palette, the command-prompt styling)
without the full shell. Option C's "freeze" is the low-risk on-ramp: do C's
mechanics first (palette global + primary), then complete B (delete terminal)
once the palette demonstrably covers the gaps.

## Consequences

### Backlog items this decision **removes / makes moot** (if B adopted)

- `A11Y-3` — terminal output `aria-live` (terminal gone)
- `UX-1` — terminal path tab-completion (terminal gone)
- `ARCH-3` — pure-function command model (commands largely removed/transformed)
- `SEC-2` — the dead `{@html}` branch in `Output.svelte` disappears with the file (the `SearchPage` + `PostDetail` + `Mermaid` sinks in `SEC-2` still stand)

### Backlog items that **remain** (palette survives and is promoted)

- `A11Y-2` — **FuzzyFinder focus trap** (the palette is a modal — still required, now _more_ important)
- `UX-3` — FuzzyFinder default cap + empty state (palette stays)
- `ARCH-4` — `open()` internal nav → **transforms** into palette-action navigation via `goto`

### New work introduced by Option B

- **Extract `FuzzyFinder` from the terminal subsystem** → mount globally (e.g. `+layout.svelte`), independent of `viewMode`.
- **Expand palette** from post-search-only → a command/action palette (routes, lang/view toggles, social links, search).
- **Rehome terminal content:** `whoami`/`about` ASCII bio → a blog "about" surface; `help` → palette hint UI.
- **Remove** `ViewToggle` + simplify/retire the `viewMode` store and the blog⇄terminal split on `/`.

### Backlog items **independent of this decision** (P1 can proceed regardless)

`SEC-1`, `CONTENT-1`, `SEO-1`, `SEO-2`, `SEO-3`, `I18N-1`, `CI-1`, `A11Y-1`,
`A11Y-4`, `A11Y-5`, `TEST-1`, `DEPS-1`, `DOC-1` — none touch the terminal.
**This is the answer to "what P1 work is terminal-independent": all of the
trust-&-correctness pass except the terminal-coupled a11y items above.**

## Migration sequence (if B)

1. **Phase 0 (Option C mechanics, low risk):** mount `FuzzyFinder` globally; make Cmd+P/Ctrl+K work in blog mode; document palette as primary; freeze terminal feature work.
2. **Phase 1:** expand palette to actions (nav/toggle/links/search); rehome `whoami`/`about`/`help`.
3. **Phase 2:** remove `Terminal.svelte`, `CommandLine.svelte`, `Output.svelte`, `filesystem.ts`, most of `commands/**`, `terminal.ts`; drop `ViewToggle` + `viewMode` split. Update `structure.yaml` (`terminal_cli` → folds into a `command_palette` note).
4. **In parallel (any phase):** the **P1 trust-&-correctness pass** is terminal-independent — proceed without waiting.

## Related

- `../improvements.md` — `PROD-1` (palette/visual mood — decide alongside, since cutting terminal reframes the palette question), `PROD-2` (this decision), and the coupled IDs above.
- `../structure.yaml` — `subsystems.terminal_cli` (what gets removed), `subsystems.blog_ui_components` (`FuzzyFinder`, `ViewToggle`, `viewMode`).

## Sign-off

- **Decision:** ☑ **B** — retire terminal → promote Cmd+P palette. A (keep) and C (freeze) rejected: C preserves maintenance ambiguity; the team wants a clean product call.
- **Decided by:** Brandon · **Date:** 2026-06-04
- **Guard (per decision):** the `SEC-2` `Output.svelte` `{@html}` branch is **not** treated as resolved by this ADR — that sink ships until the terminal code is actually deleted (Phase 2). `SEC-2` stays an active security item until then.
- **Backlog impact applied:** `A11Y-3`, `UX-1`, `ARCH-3` pruned to the _Superseded_ section of `improvements.md` (moot once terminal is removed); `A11Y-2` (palette focus trap) + `UX-3` retained; FuzzyFinder global-extraction is the replacement path (Phase 0).

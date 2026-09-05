# Behavior matrix — AC7

Slice 0 baseline. Every row is an observation of the **SvelteKit** build at
`main` HEAD `34aa7e7`, captured before any Next.js code exists, so a later
candidate has something to be compared against.

AC7 names the full surface: home, lists, post detail, tags, search, command
palette, comments, the 26 study components, `@xyflow` graphs, the deck, keyboard
controls, and responsive states. **Slice 0 does not cover all of it, and does
not claim to.** It captures a declared representative set and inventories the
remainder as `pending` rows, each naming the slice that closes it. AC7 is
claimed _started with its remainder inventoried_, never complete, until every
pending row below is closed.

## Environment

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| Captured        | 2026-08-27                                                                    |
| Site under test | SvelteKit production build of `main` HEAD `34aa7e7`                           |
| Browser         | Google Chrome 152 (Chromium 152), devicePixelRatio 2                          |
| OS              | macOS 15.7.9 (build 24G830)                                                   |
| Runtime         | Node v24.19.0, pnpm 10.32.1                                                   |
| Server          | `node scripts/serve-build.mjs build 4173` — loopback, `resolveStatic()` order |
| Throttling      | none                                                                          |

```bash
pnpm build                                  # SvelteKit production build + Pagefind
node scripts/serve-build.mjs build 4173     # loopback server, resolveStatic order
# responsive rows:
#   http://127.0.0.1:4173/__viewport?w=<W>&h=<H>&u=<route>
#   then inject scripts/capture/force-images.js and scripts/capture/frame-probe.js
# keyboard rows: navigate top-level, force one paint, then send keys
```

Screenshots live in `./screenshots/baseline-34aa7e7/`, named
`<route-slug>@<viewport>.jpg`. **Retention:** kept for the life of the migration
branch and deleted at task archive with the branch. They are evidence for the
cutover decision, not site assets.

## How this environment differs from a real browser, and what was done about it

Four properties of the automation surface were measured, not assumed. Each one
would have produced a false finding if left alone.

| Observed                                            | Evidence                                                                                                                                                   | Consequence                                                  | Handling                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tab is hidden while its window is behind others | `document.visibilityState === "hidden"` on every tab, including a freshly created one; with the window brought to the front the same probe reads `visible` | No paint, so no FCP/LCP and no `requestAnimationFrame`       | Structural rows were captured while hidden and are unaffected; performance capture requires a foreground window and asserts `visible` per run (see `thresholds-results.md`) |
| `resize_window` does not change the viewport        | Requested 1440×900, 1200×672 and 300×500 in turn; `innerWidth`/`innerHeight` stayed `1680×1128` every time                                                 | Responsive states cannot be captured by sizing the window    | Same-origin iframe harness at `/__viewport?w=&h=`; media queries evaluate against the frame box, verified per row                                                           |
| `loading="lazy"` images never fetch                 | `/posts`: 167 images, `lazy: 167`, `loaded: 0`, including cards at the top of the document                                                                 | Screenshots would show empty card grids that no visitor sees | `scripts/capture/force-images.js` flips lazy→eager and awaits decode before the screenshot; the pre-fix captures were discarded                                             |
| Hydration is paint-gated                            | `Cmd+K` did nothing immediately after navigation; after one forced screenshot the same key opened the palette with 23 options                              | Every interaction test would report a dead page              | Protocol: navigate → force one paint → then send keys                                                                                                                       |

The deck follows directly from the third and fourth rows: with no
`requestAnimationFrame`, the GSAP entrance never runs and slide content sits at
`opacity: 0; visibility: hidden` while the text is present in the DOM
(`textContent` length 124 on slide 1). That is the environment, not the site —
with the window foregrounded the deck animates and renders normally, and its
`ArrowRight` interactions measure 48–72 ms.

## Representative set — captured

Structural columns come from `scripts/capture/frame-probe.js`; every row was
captured at 390×844, 820×1180 and 1440×900 and reports the widest deviation
found. `overflow` is `documentElement.scrollWidth > innerWidth`.

| #   | Route                                    | Viewports        | Breakpoints correct                               | Horizontal overflow                    | Images missing `alt` | Controls missing accessible name | Screenshot                                                                                   | Result                   |
| --- | ---------------------------------------- | ---------------- | ------------------------------------------------- | -------------------------------------- | -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | `/`                                      | 390 / 820 / 1440 | yes — `max-640` / `min-768` / `min-768+1024+1280` | none (382 / 812 / 1432)                | 0 of 10              | 0 of 36 focusables               | `home@390x844.jpg`, `home@1440x900.jpg`                                                      | PASS                     |
| 2   | `/posts`                                 | 390 / 820 / 1440 | yes                                               | none (382 / 812 / 1432)                | 0 of 167             | 0 of 199                         | `posts@390x844.jpg`, `posts@1440x900.jpg`                                                    | PASS                     |
| 3   | `/posts/giscus-sveltekit-integration`    | 390 / 820 / 1440 | yes                                               | none                                   | 0 of 1               | 0 of 52                          | `post-en-giscus@390x844.jpg`, `post-en-giscus@1440x900.jpg`                                  | PASS                     |
| 4   | `/ko/posts/giscus-sveltekit-integration` | 390 / 820 / 1440 | yes                                               | none                                   | 0 of 1               | 0 of 52                          | `post-ko-giscus@390x844.jpg`, `post-ko-giscus@1440x900.jpg`                                  | PASS                     |
| 5   | `/ko`                                    | 390 / 820 / 1440 | yes                                               | none                                   | 0 of 10              | 0 of 36                          | `ko-home@390x844.jpg`, `ko-home@1440x900.jpg`                                                | PASS                     |
| 6   | `/tags`                                  | 390 / 820 / 1440 | yes                                               | none                                   | 0                    | 0 of 994                         | `tags@390x844.jpg`, `tags@1440x900.jpg`                                                      | PASS                     |
| 7   | `/search`                                | 390 / 820 / 1440 | yes                                               | none                                   | 0                    | 0 of 20                          | `search@390x844.jpg`, `search@1440x900.jpg`                                                  | PASS                     |
| 8   | `/` + `Cmd+K` (command palette)          | 1680 top-level   | n/a                                               | n/a                                    | n/a                  | 0                                | —                                                                                            | PASS — see keyboard rows |
| 9   | `/study/dsa-ii`                          | 390 / 820 / 1440 | yes                                               | none                                   | 0                    | 0 of 37                          | `study-dsa-ii@390x844.jpg`, `study-dsa-ii@1440x900.jpg`                                      | PASS                     |
| 10  | `/system/3b`                             | 390 / 820 / 1440 | yes                                               | none                                   | 0                    | 0 of 22                          | `system-3b@390x844.jpg`, `system-3b-subsystems@1440x900.jpg`, `system-3b-graph@1440x900.jpg` | PASS                     |
| 11  | `/talks/my-career`                       | 390 / 1440       | yes                                               | none (390 / 1440 exactly — full-bleed) | 0                    | 0 of 18                          | `talks-my-career@390x844.jpg`, `talks-my-career@1440x900.jpg`                                | PASS                     |

### Content facts recorded for parity

These are the numbers a Next.js candidate has to reproduce, not just "it looked
right".

| Route                | Fact                                                      | Baseline value                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/posts`             | Lazy-loaded card images                                   | 167, all `loading="lazy"`                                                                                                                                                        |
| `/posts/giscus-…`    | JSON-LD blocks / `<pre>` blocks / Giscus mount            | 1 / 4 / present                                                                                                                                                                  |
| `/ko/posts/giscus-…` | `<html lang>` / hreflang pair / translated (not fallback) | `ko` / `en`+`ko` absolute URLs / yes, Korean `<h1>` and TOC                                                                                                                      |
| `/tags`              | Tag cloud size                                            | 280 tags across 167 posts, 994 focusable elements                                                                                                                                |
| `/study/dsa-ii`      | Study components instantiated                             | 9 of 26 — `DsaIIStudyPage`, `StudyPageShell`, `StudySeoHead`, `StudyRoadmap`, `Stepper`, `BstTraversalVisualizer`, `BstRemovalVisualizer`, `HashMapVisualizer`, `HeapVisualizer` |
| `/system/3b`         | `@xyflow/svelte` graph, **mounted only after scroll**     | before scroll: 0 flow elements; after: 63 flow elements, 17 `.svelte-flow__node`, 42 edge paths, 3 control buttons                                                               |
| `/talks/my-career`   | Deck                                                      | 20 slides, per-slide steps, URL state `?page=&step=`                                                                                                                             |

The `@xyflow` row is a hydration-boundary contract: the graph is not in the
initial DOM. A Next.js port that renders it eagerly, or never, changes behavior
the comparator cannot see.

## Keyboard flows — captured

Every sequence was sent as a real key event to the top-level page, after one
forced paint.

| #   | Route                            | Sequence        | Expected                                                 | Observed                                                                                                                        | Result                   |
| --- | -------------------------------- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| K1  | `/`                              | `Cmd+K`         | Command palette opens, focus moves into the search field | `[role=dialog]` present, 23 `[role=option]`, `document.activeElement` = `INPUT` with placeholder "Search posts and commands..." | PASS                     |
| K2  | `/` palette                      | `ArrowDown` ×2  | Selection moves to the third option                      | `aria-activedescendant` = `cmdk-option-2`, option index 2, text "◫ Study /study"                                                | PASS                     |
| K3  | `/` palette                      | type `redis`    | Results filter to matching posts                         | 23 → 9 options; "Redis and BullMQ Queue Patterns…" ranked first among posts                                                     | PASS                     |
| K4  | `/` palette                      | `Escape`        | Palette closes, URL unchanged                            | `[role=dialog]` gone, `location.pathname` still `/`                                                                             | PASS (with A11Y-1 below) |
| K5  | `/posts/claude-code-agent-teams` | `Backspace`     | Navigates back to the list                               | `/posts/claude-code-agent-teams` → `/posts`, title "All Posts \| Brandon Wie"                                                   | PASS                     |
| K6  | `/talks/my-career`               | `ArrowRight` ×6 | Advances through steps and slides                        | counter `1 / 20` → `4 / 20`, `step 2/2`, URL carries `?page=&step=`, slide content animated in and legible                      | PASS                     |
| K7  | `/talks/my-career`               | `ArrowLeft`     | Steps backwards                                          | counter returned to the previous position                                                                                       | PASS                     |
| K8  | `/posts/claude-code-agent-teams` | scroll to 50 %  | Reading progress reflects position                       | `[role=progressbar]` `aria-valuenow="57"`, `width: 57.1194%` at `scrollY` 4529 of 9057                                          | PASS                     |

## Accessibility findings

Graded against the rubric in [`./thresholds.md`](./thresholds.md) § Accessibility
rubric.

| id     | Severity | Route               | Finding                                                                                                                                     | Owner / closing slice                                                                               |
| ------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A11Y-1 | serious  | `/` command palette | After `Escape` closes the dialog, focus lands on `BODY` rather than returning to the control that opened it. WCAG 2.1 AA 2.4.3 Focus Order. | Carry into the Slice 3 palette port; fix there rather than patching the Svelte build being replaced |

**Critical findings: 0.** No declared control was unreachable or inoperable by
keyboard, and no interactive element lacked an accessible name.

### One finding that was a probe defect, not a site defect

The first pass reported `/search` as having one control with no accessible name.
Chasing it found `#site-search`, which has no `aria-label` — and an associated
`<label>Search</label>`, which names it correctly. The probe's heuristic did not
consult `element.labels`. The probe was fixed
(`scripts/capture/frame-probe.js`), `/search` re-ran at 0, and the fix can only
lower counts, so the other routes' zeros stand. Recorded because a harness that
is only ever checked when it reports nothing is not checked at all.

## Pending — AC7 rows this slice does not cover

The 26 study components live at `src/lib/components/study/`. Route 9 above
instantiates nine of them; the remaining seventeen are inventoried here.

| Surface                                                                                                                    | Route that exercises it           | Closing slice                                 |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| `ArrayListVisualizer`, `BigOExplorer`, `BinarySearchVisualizer`, `RecursionTrace`, `StackQueueVisualizer`, `DsaIStudyPage` | `/study/dsa-i`                    | Slice 4                                       |
| `AvlTreeVisualizer`, `TwoFourTreeVisualizer`, `IterativeSortVisualizer`, `DivideConquerSortVisualizer`, `DsaIIIStudyPage`  | `/study/dsa-iii`                  | Slice 4                                       |
| `PatternMatchVisualizer`, `GraphTraversalVisualizer`, `MstVisualizer`, `LcsTableVisualizer`, `DsaIVStudyPage`              | `/study/dsa-iv`                   | Slice 4                                       |
| `StudyIndexPage`                                                                                                           | `/study`                          | Slice 4                                       |
| KO study routes                                                                                                            | `/ko/study`, `/ko/study/dsa-i…iv` | Slice 4                                       |
| The other 19 deck slides and the video behavior                                                                            | `/talks/my-career`                | Slice 4                                       |
| `/system` index, `/ko/system`                                                                                              | those routes                      | Slice 4                                       |
| `/ko/system/3b` in a browser: graph mount, controls, screenshots                                                           | `/ko/system/3b`                   | Slice 4 — its data is closed, see note below  |
| `/about`, `/contact`, `/projects`, `/feed`, `/404` and their KO twins                                                      | those routes                      | Slice 3                                       |
| The other 166 EN posts and 166 KO posts                                                                                    | post detail routes                | Slice 3                                       |
| Giscus thread rendering against the live GitHub backend                                                                    | any post detail                   | Slice 3 — needs network and a real discussion |

A pending row is closed by adding a captured row for its surface, not by
deleting it.

`/ko/system/3b` is a partial exception worth stating plainly. The route now
exists and is built, and the part of it C5 is about -- the Korean blog-series
titles merged from the Korean corpus over the English snapshot -- is asserted
per commit by `pnpm migration:c5` (rows `site 16` and `site 16b`, plus the
fixture row `F7` for the untranslated and drafted branches the live corpus
cannot show). What stays pending is the browser behavior this table captures:
the graph's scroll-triggered mount, its controls, and the viewport screenshots.
The row above records that remainder rather than dropping the surface.

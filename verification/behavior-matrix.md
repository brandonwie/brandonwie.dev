# Behavior matrix — AC7

Slice 0 baseline. Every row is an observation of the **SvelteKit** build at
`main` HEAD `34aa7e7`, captured before any Next.js code exists, so a later
candidate has something to be compared against.

AC7 (`plan.md` § Acceptance Criteria) names the full surface: home, lists, post
detail, tags, search, command palette, comments, the 26 study components,
`@xyflow` graphs, the deck, keyboard controls, and responsive states. **Slice 0
does not cover all of it, and does not claim to.** It captures a declared
representative set and inventories the remainder as `pending` rows, each naming
the slice that closes it. AC7 is claimed _started with its remainder
inventoried_, never complete, until every pending row below is closed.

## Capture profile

Identical to the profile fixed in [`./thresholds.md`](./thresholds.md) §
Browser evidence: `build/` served over loopback with `resolveStatic()`
resolution order, no throttling, warm cache, viewports 390×844 / 820×1180 /
1440×900, Chrome and OS version recorded per run block.

Commands:

```bash
pnpm build                                    # SvelteKit production build + Pagefind
node <serve-build> "$PWD/build" 4173          # loopback server, resolveStatic order
```

Screenshots are written to `./screenshots/baseline-34aa7e7/` and named
`<route-slug>@<viewport>.png`. Retention: kept for the life of the migration
branch, deleted at task archive along with the branch — they are evidence for
the cutover decision, not site assets.

## Status

**BLOCKED — not captured.** The browser-evidence capture cannot run in the
session that wrote this file: the Chrome extension reports no connected browser
(`list_connected_browsers` returned an empty list), so screenshots, keyboard
replay, accessibility-tree reads and `PerformanceObserver` injection are all
unavailable. Nothing below is filled with a guess. The route set, the pending
inventory, the profile and the rubric are fixed here first precisely so the
capture session has nothing left to decide.

## Representative set — Slice 0

Each route is captured at all three viewports.

| #   | Route                                    | Why it is in the set                                                                                             | Result       |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `/`                                      | Home; shell, header, nav, theme toggle                                                                           | not captured |
| 2   | `/posts`                                 | Post list; category sidebar (desktop) and pill bar (mobile)                                                      | not captured |
| 3   | `/posts/giscus-sveltekit-integration`    | EN post detail: Markdown, code highlighting, reading progress, table of contents, copy-link, **Giscus comments** | not captured |
| 4   | `/ko/posts/giscus-sveltekit-integration` | KO post detail: the same surface under the locale contract                                                       | not captured |
| 5   | `/ko`                                    | KO shell and language toggle                                                                                     | not captured |
| 6   | `/tags`                                  | Tag surface                                                                                                      | not captured |
| 7   | `/search`                                | Pagefind search                                                                                                  | not captured |
| 8   | `/` + `Cmd/Ctrl+K`                       | Command palette (fuzzy finder), opened by keyboard from home                                                     | not captured |
| 9   | `/study/dsa-ii`                          | One study page: 4 of the 17 interactive visualizers plus the shared study shell                                  | not captured |
| 10  | `/system/3b`                             | `@xyflow/svelte` graph: layout, drill-down, responsive behavior                                                  | not captured |
| 11  | `/talks/my-career`                       | GSAP deck runtime and slide navigation                                                                           | not captured |

### Per-row record required at capture

Baseline commit, build and serve commands, Chrome and OS version, viewport,
route, the **exact** keyboard sequence, expected versus observed behavior,
accessibility findings graded by the `thresholds.md` rubric, screenshot path,
and pass/fail.

## Pending — AC7 rows this slice does not cover

The 26 study components live at `src/lib/components/study/`. Route 9 above
instantiates nine of them: `DsaIIStudyPage`, `StudyPageShell`, `StudySeoHead`,
`StudyRoadmap`, `Stepper`, `BstTraversalVisualizer`, `BstRemovalVisualizer`,
`HashMapVisualizer`, `HeapVisualizer`. The remaining seventeen are inventoried
here.

| Surface                                                                                                                    | Route that exercises it           | Closing slice |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------- |
| `ArrayListVisualizer`, `BigOExplorer`, `BinarySearchVisualizer`, `RecursionTrace`, `StackQueueVisualizer`, `DsaIStudyPage` | `/study/dsa-i`                    | Slice 4       |
| `AvlTreeVisualizer`, `TwoFourTreeVisualizer`, `IterativeSortVisualizer`, `DivideConquerSortVisualizer`, `DsaIIIStudyPage`  | `/study/dsa-iii`                  | Slice 4       |
| `PatternMatchVisualizer`, `GraphTraversalVisualizer`, `MstVisualizer`, `LcsTableVisualizer`, `DsaIVStudyPage`              | `/study/dsa-iv`                   | Slice 4       |
| `StudyIndexPage`                                                                                                           | `/study`                          | Slice 4       |
| KO study routes                                                                                                            | `/ko/study`, `/ko/study/dsa-i…iv` | Slice 4       |
| Remaining deck slides beyond the one captured                                                                              | `/talks/my-career`                | Slice 4       |
| `/system` index, `/ko/system`, `/ko/system/3b`                                                                             | those routes                      | Slice 4       |
| `/about`, `/contact`, `/projects`, `/feed`, `/404` and their KO twins                                                      | those routes                      | Slice 3       |
| The other 166 EN posts and 166 KO posts                                                                                    | post detail routes                | Slice 3       |

A pending row is closed by adding a captured row for its surface, not by
deleting it.

# D3 + D5 Readiness Survey — #51 3B-redesign Phase Closure Plan

**Survey date:** 2026-05-06  
**D2 status:** D2a concrete (in plan review), D2b gated on D2a clean exit  
**Phases remaining:** D3 + D5 + Phase F (8 total actionable; 5 of 8 shipped)

---

## D3: D-Sh5 V1.6 Sunset UX (Reinforcement Signal)

### 1. Concrete Contract

**V1 ship scope (completed 2026-05-05):** read-contract + 6-month calendar gate + promotion criterion. Metric uses existing `post_apply_occurrences` field—no schema change.

**V1.6 implementation (deferred):**
- **Window-recompute scheduler** — per-/wrap compute recurrence-rate over rolling 90-day + full 6-month window (2026-05-05 → 2026-11-05). Ephemeral computation, no caching schema delta.
- **Sunset-prompt UX** — at /wrap on or after 2026-11-05, surface 3-state outcome prompt:
  - **0 disagreements (silence-only + recurrence-rate agree):** proceed as-is; re-present next /wrap
  - **1–2 disagreements:** EXPLICIT HUMAN REVIEW — user picks "keep-as-tracked" OR "delete"
  - **≥3 disagreements across ≥2 sessions:** PROMOTE to co-gating signal via admission-test path (formal § Status Lifecycle amendment in `change-discipline.md` required)
- **Promotion drafter** — if ≥3 disagreements threshold met, generate proposal for universal-tier rule body change (requires separate admission-test review per `change-discipline.md` § line 247).

**Definitions:**
- **Disagreement** = hypothetical verdict where recurrence-rate WOULD flip status but silence-only didn't (or vice versa). Logged inline at /wrap, not persisted to disk.
- **6-month sunset deadline:** 2026-11-05 (V1 ship 2026-05-05 + 6 months). Three-state outcome executes at this hard date.

**Reserved field name:** `recurrence_rates` (top-level `friction-log.json`) for V2+ if cache becomes warranted; current V1 = ephemeral compute only.

---

### 2. Open Decisions

| Decision | Candidates | Recommended Choice | Rationale |
|---|---|---|---|
| UX shape of sunset prompt | (a) inline 3-state menu in /wrap Step 4.8; (b) separate modal after /wrap completion; (c) deferred until agreement count ≥3 (fire only on promotion path) | **(a) inline in Step 4.8** | Consistency with existing pattern presentation flow; user can decide immediately without context switch. Cross-review confirmed inline placement. |

**Decision count:** 1 (UX shape only; contract + gate + promotion drafter all concrete)

---

### 3. Blast Radius

**Files touched:**
- `.agents/skills/wrap/references/friction-analysis.md` — § Reinforcement Signal finalized (read-contract + sunset spec; behavior deferred to V1.6 implementation note)
- **New script (optional):** `scripts/d-sh5-sunset-check.js` — window-recompute + disagreement detection + 3-state outcome generator
- `/wrap` Step 4.6a amendment — during observation-matching, continue existing `post_apply_occurrences` increment logic (no change; already shipping in D1)
- `/wrap` Step 4.8 amendment — new verification logic block: if date ≥ 2026-11-05, invoke `d-sh5-sunset-check.js`; surface 3-state outcome prompt

**Schema changes — friction-log.json:**
- **NO new fields** — reuses existing `post_apply_occurrences` (per-pattern array).
- **NO top-level config additions** — (reserved `recurrence_rates` name only; not implemented in V1).

**Tests needed:**
- **Unit (fixture-based):** 4–5 new test cases in `scripts/friction-log-validator.test.js` or new `scripts/d-sh5-sunset-check.test.js`:
  - disagreement detection (silence-only vs recurrence-rate conflict)
  - 0-disagreements path (no prompt surface)
  - 1–2 disagreements path (human review UI)
  - ≥3 disagreements path (promotion drafter output)
  - date-gate test (pre-2026-11-05 vs post-2026-11-05)
- **Live-data:** /wrap runs with 34 existing patterns; verify no regression on current verification gate (silence-only path untouched)

**Pre-commit hook impact:** No change (metric is read-only; validator already validates `post_apply_occurrences` format)

---

### 4. Dependencies

**D2b strict-mode merge:** YES, required before D3 ships.
- Rationale: D3 reads from `.agents/friction-log.json` using strict-mode validators (D2b gates validator errors). Without D2b, D3 code must handle malformed rows, adding defensive bloat.

**D3 independent tasks:**
- Sunse-prompt UX can be spec'd in parallel with D2b execution (not blocking).
- Script logic can be drafted against D2b's finalized schema.

---

### 5. Calendar Gates

**D3 hard deadline: 2026-11-05** (6-month sunset clause fires on this date).

**Pre-ship requirement:** Nothing MUST ship before 2026-11-05. The gate is **informational at V1 ship** — the 3-state outcome executes at the gate, but the decision (promote or retire) is user-facing (not automatic). V1.6 ships the UX + drafter that handles the 3-state logic; can ship any time before Nov 5.

**Recommended sequencing:** Ship D3 between D2b merge and Nov 5 (ideally within 2 weeks of D2b to keep coupling tight).

---

### 6. Test Scope

**New test count:** 4–5 unit tests + 1 live-data regression test (total ~6–7 tests).

**Fixture vs live-data:**
- **Fixture-based (primary):** Mock pattern sets with known `post_apply_occurrences` increments + status flips; test disagreement detection deterministically.
- **Live-data (regression only):** Run existing 34-pattern friction-log through d-sh5-sunset-check.js; verify no new errors/warnings + confirm silence-only gate still gates (unchanged).

---

### 7. Phase F Closure Criteria

D3 closure verifies:
- ✓ `/wrap` Step 4.8 executes `d-sh5-sunset-check.js` when date ≥ 2026-11-05
- ✓ 3-state outcome prompt surfaces inline with correct options
- ✓ Promotion drafter generates valid admission-test change proposal
- ✓ Recurrence-rate computation matches spec (90-day rolling + 6-month window at gate)
- ✓ All 6–7 unit + regression tests pass
- ✓ No breaking changes to existing silence-only verification gate

---

## D5: D-Sh7 V1.6 Cluster Computation

### 1. Concrete Contract

**V1 ship scope (completed 2026-05-05):** contract documentation + step-block placeholder. Cluster computation deferred to V1.6.

**V1.6 implementation (deferred):**
- **Cluster detection** — compute `cluster_key = (confusion_type, target.type, dirname(target.path) or "N/A")` for all patterns in active log + archive within 60d window. Group by key; surface cluster if count ≥3 across ≥2 distinct sessions.
- **Dismissal-counter persistence** — track cluster dismissals to enable 30%/60d false-positive budget threshold check.
- **Threshold-check execution** — during `/wrap` Step 4.8 verification, compute 60d dismissal rate per cluster; if >30% dismissed-as-coincidence, retire cluster detection (no parameter knobs; delete heuristic if it doesn't earn its surface).
- **Presentation** — class-level audit suggestion: `Cluster: {confusion_type} × {target.type} in {dirname or N/A}. Member count: N over 60d. [Audit now] [Dismiss] [Later]`

**Cluster key 3-axis rationale:**
- Original spec (2-axis): `(confusion_type, dirname(target.path))`. V1 adds `target.type` (3rd axis) to:
  - (i) Disambiguate `target.path == "N/A"` workflow-type rows per D-Sh3 V1
  - (ii) Preserve cross-target-type signal — prevents `stale-instruction` patterns at KFM rows + rule files in same `.agents/rules/` dir from diluting audit boundaries
  - Trade-off: May split clusters the spec intended to surface (e.g., svelte patterns split by target type). Reversible if axis proves over-aggressive; V1.6 dismissal data informs.

---

### 2. Open Decisions

| Decision | Candidates | Recommended Choice | Rationale |
|---|---|---|---|
| Dismissal-counter persistence model | **(a)** per-pattern field `cluster_dismissals: ["YYYY-MM-DD"]` (touches schema); **(b)** top-level config `cluster_dismissal_log: [{cluster_key, dismissed_at}]` (touches schema); **(c)** ephemeral journal parsing — derive from journal `### Done` markers w/ "Cluster dismissed" text in 60d window (no schema change; brittle) | **(b) top-level config `cluster_dismissal_log`** | Centralized, queryable without per-pattern side-effects. Cleaner than (a) because cluster dismissal is coarse-grained (whole cluster, not pattern). Better than (c) because journal parsing is fragile to marker-text drift; config is explicit. |

**Decision count:** 1 (persistence model; cluster detection + threshold logic + presentation all concrete)

---

### 3. Blast Radius

**Files touched:**
- `.agents/skills/wrap/references/friction-analysis.md` — § Cluster Detection finalized (contract + threshold spec + presentation template; computation deferred to V1.6 implementation note)
- **New script (required):** `scripts/d-sh7-cluster.js` — cluster key computation + membership grouping + dismissal-rate check + presentation formatter
- `/wrap` Step 4.6g amendment — invoke cluster detection (currently executes contract docs only; update to call `d-sh7-cluster.js`)
- `/wrap` Step 4.8 amendment — add 60d dismissal-rate check; retire cluster detection if >30% dismissed

**Schema changes — friction-log.json:**
- **New top-level field:** `cluster_dismissal_log: [{cluster_key: string, dismissed_at: YYYY-MM-DD}, ...]` (touches root schema)
- **NO per-pattern field changes** — cluster_dismissals intentionally NOT added to patterns
- **Type:** `cluster_key` is opaque string (serialized tuple for lookup); `dismissed_at` is ISO date

**Tests needed:**
- **Unit (fixture-based):** 8–10 test cases in new `scripts/d-sh7-cluster.test.js`:
  - cluster key computation (3-axis: confusion_type + target.type + dirname)
  - scalar vs array target.type handling
  - N/A fallback for dirname
  - grouping by cluster_key (deduplicate sessions)
  - ≥3 members across ≥2 sessions threshold
  - <3 members (no cluster surface)
  - 60d window boundary (include 60d; exclude 61d)
  - dismissal-rate check (0%, 15%, 30%, 31% — edge cases)
  - retire-cluster path (>30% dismissed)
  - presentation formatter (markdown audit suggestion)
- **Live-data:** Run existing 34-pattern friction-log + archive through d-sh7-cluster.js; count clusters found; verify no errors

**Pre-commit hook impact:** Add `cluster_dismissal_log` validation to `scripts/friction-log-validator.js` (validate dismissal entries: cluster_key format + date format + no duplicates)

---

### 4. Dependencies

**D2b strict-mode merge:** YES, required before D5 ships.
- Rationale: Same as D3 — D5 reads from strict-validated `friction-log.json`. Without D2b, D5 code must handle malformed data.

**D3 ship:** YES, recommended (not strictly blocking, but preferred).
- Rationale: D5 adds dismissal tracking for clusters; cleaner to ship D3's recurrence-rate tracking first. Both touch `/wrap` Step 4.8 verification block; same PR can bundle both (or separate PRs with clear dependency comment).

**D5 independent tasks:** Cluster key computation + grouping logic can be drafted against D2b's finalized schema; dismissal-counter field design + tests can proceed in parallel.

---

### 5. Calendar Gates

**D5 hard deadline:** None (unlike D3's 2026-11-05 gate). Cluster detection is heuristic; no sunsetting required.

**Pre-ship requirement:** Nothing blocks D5 on a calendar gate. Recommended sequencing: Ship after D3 (serial: D2b → D3 → D5) to keep related `/wrap` orchestration changes adjacent in git history.

---

### 6. Test Scope

**New test count:** 8–10 unit tests + 1 live-data regression test (total ~11–12 tests).

**Fixture vs live-data:**
- **Fixture-based (primary):** Mock pattern sets with known cluster keys + session distribution + dismissal counts; test grouping + threshold check + retire logic deterministically.
- **Live-data (regression only):** Run existing 34-pattern friction-log + archive through d-sh7-cluster.js; verify no errors + count clusters found + spot-check a few cluster keys for correctness.

---

### 7. Phase F Closure Criteria

D5 closure verifies:
- ✓ `/wrap` Step 4.6g invokes `d-sh7-cluster.js` and surfaces cluster audit suggestions
- ✓ Cluster key computation matches 3-axis spec (confusion_type + target.type + dirname)
- ✓ ≥3 members across ≥2 sessions threshold enforced
- ✓ `cluster_dismissal_log` field persists dismissals correctly
- ✓ 60d dismissal-rate check executes; >30% threshold retires cluster detection
- ✓ Presentation markdown matches spec format
- ✓ All 11–12 unit + regression tests pass
- ✓ Pre-commit validator accepts `cluster_dismissal_log` entries; rejects malformed

---

## Phase F Closure — All 8 Actionable Phases

**Closure trigger:** All 8 phases merged + verified.

| Phase | Count | Status | PR(s) |
|---|---|---|---|
| A | 1 | ✓ shipped | #61 |
| B | 1 | ✓ shipped | #62 |
| C | 1 | ✓ shipped | #63 |
| D0 | 1 | ✓ shipped | #66 |
| D1 | 1 | ✓ shipped | #67 |
| D2 (D2a+D2b counted as 1) | 1 | ⏳ in plan review | TBD |
| D3 | 1 | ⏳ readiness surveyed | TBD |
| D5 | 1 | ⏳ readiness surveyed | TBD |
| **Total** | **8** | **5/8 shipped** | — |

**Deferred outside #51:** D4 (D-Sh6 V1.6 KFM auto-retire; gated on first 365d KFM row, currently none eligible).

### Phase F Verification Gates

All 8 phases must pass before #51 closure:

1. **Phase A (PR #61):** ✓ merged
2. **Phase B (PR #62):** ✓ merged
3. **Phase C (PR #63):** ✓ merged
4. **Phase D0 (PR #66):** ✓ merged
5. **Phase D1 (PR #67):** ✓ merged
6. **Phase D2a + D2b (TBD):** Validation gates:
   - `node scripts/friction-log-validator.js .agents/friction-log.json --strict` → exit 0
   - `node scripts/friction-log-validator.js .agents/friction-log-archive.json --strict` → exit 0
   - `.husky/pre-commit` block 5 rejects bad entries
   - `npm test` → 248+ tests pass
7. **Phase D3 (TBD):** Verification gates:
   - `/wrap` Step 4.8 triggers sunset prompt on/after 2026-11-05
   - 3-state outcome (0, 1–2, ≥3 disagreements) surfaces correctly
   - Promotion drafter generates valid change proposal
   - 6–7 unit + regression tests pass
8. **Phase D5 (TBD):** Verification gates:
   - `/wrap` Step 4.6g computes clusters; Step 4.8 checks 60d dismissal rate
   - Cluster key (3-axis) matches spec
   - ≥3 members + ≥2 sessions threshold enforced
   - >30% dismissal rate retires cluster detection
   - `cluster_dismissal_log` validates
   - 11–12 unit + regression tests pass

**Closure summary:** Write Phase F closure PR combining D3 + D5 tests + integration checks; merge all 8 phases; close #51.

---

## Sequencing Recommendation (D2b → D3 → D5)

```
D2a (data migration) 
  → [2–3 days review/merge]
D2b (strict-mode flip) 
  → [1 week; D3 design + d-sh5-sunset-check.js draft]
D3 (sunset UX) 
  → [1 week; D5 design + d-sh7-cluster.js draft]
D5 (cluster computation) 
  → [1 week; integration + Phase F closure]
Phase F (closure) 
  → [1 day]
```

**Parallel work allowed:** D3 UX spec + D5 cluster-key logic can draft while D2b is in review (no blocking).

---

## Summary Table (Under 600 words)

| Aspect | D3 | D5 |
|---|---|---|
| **Contract** | Window-recompute + sunset-prompt UX + promotion drafter (recurrence-rate vs silence-only) | Cluster key (3-axis) + dismissal-counter persistence (top-level config) + 30%/60d false-positive budget |
| **Open decisions** | 1 (sunset prompt UX shape) | 1 (dismissal persistence: per-pattern vs top-level vs ephemeral) |
| **Files touched** | friction-analysis.md § Reinforcement Signal; new `d-sh5-sunset-check.js`; /wrap Steps 4.6a + 4.8 amendments | friction-analysis.md § Cluster Detection; new `d-sh7-cluster.js`; /wrap Steps 4.6g + 4.8 amendments |
| **Schema changes** | None (reuses `post_apply_occurrences`) | Top-level `cluster_dismissal_log: [{cluster_key, dismissed_at}]` |
| **Tests** | 6–7 (4–5 unit + 1 regression) | 11–12 (8–10 unit + 1 regression) |
| **Dependencies** | D2b required; D3 independent | D2b required; D3 recommended (same /wrap block) |
| **Calendar gate** | 2026-11-05 (informational; gates 3-state outcome UX, not ship) | None |
| **Phase F gates** | Sunset prompt triggers correctly; disagreement detection; promotion drafter; tests pass | Cluster computation + dismissal tracking; >30% threshold retires; tests pass |

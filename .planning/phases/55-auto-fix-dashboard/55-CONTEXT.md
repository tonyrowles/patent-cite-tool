# Phase 55: Auto-Fix Dashboard - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Additive feature on the existing weekly-digest pipeline

<domain>
## Phase Boundary

Extend `scripts/weekly-digest.mjs` to emit a NEW `<details>` collapsible "Auto-Fix Pipeline" section after the existing SUMMARY, with a markdown table of 7 metrics. The frozen 7-element `SUMMARY_KEYS` contract from `tests/e2e/lib/llm-report.js` is preserved BYTE-FOR-BYTE — auto-fix metrics live in a SEPARATE section, NOT as SUMMARY_KEYS entries. No new npm dependencies.

Three SCs:

1. **DASH-01:** Monday weekly digest contains a `<details>` collapsible "Auto-Fix Pipeline" section with a markdown table of 7 metrics: `auto_fix_attempted`, `verified_merged`, `success_rate`, `cost_per_fix`, `time_to_merge_p50`, `fix_attempts_p50`, `flake_escalation_count`. All metrics NaN/Infinity-guarded (display `n/a` when not computable).
2. **DASH-02:** Vitest assertion `SUMMARY_KEYS.length === 7` passes (already exists; re-verify); frozen 7-key array is byte-unchanged; auto-fix metrics appear in a SEPARATE section.
3. **DASH-03:** `cost_per_fix` uses `combinedMonthlyTotalByTransport` (not raw sum) to avoid double-counting subscription + SDK invocations for the same issue; `time_to_merge` filters to `mergedAt !== null` entries only.

**Out of scope:**
- Extending ledger schema (per-entry `errorClass`, `pr_merged`, `outcome`) — Phase 56 follow-up from Phase 54.
- Backfilling historical ledger entries with the new fields.
- Adding a separate dashboard webpage / HTML output — markdown digest only.
- Real-time metrics — weekly cron only (matches existing digest cadence).
- Removing the dead `MODEL` const from auto-fix.mjs (Phase 56 cleanup-debt from Phase 54).
- Re-running UAT-47-a (Phase 56).

</domain>

<decisions>
## Implementation Decisions

### Data Source: Ledger + GH API Hybrid (D-01 operator decision)

- **D-01:** **Hybrid data source per operator Q1.** Cost metrics from ledger (`tests/e2e/.llm-spend-ledger.json`); PR-dependent metrics (verified_merged, time_to_merge_p50, success_rate) from `gh api search/issues` query for PRs with `label:auto-fix:verified` AND `label:auto-fix:partial-verified`. NaN-guard everywhere — if either source returns no relevant data (zero auto-fix runs yet), metric displays `n/a`.
- **D-02:** **Single GH API call per run** — `gh search prs --label auto-fix:verified --label auto-fix:partial-verified --json number,state,mergedAt,createdAt,labels --limit 100`. Results parsed and aggregated. If `gh` command fails or returns empty: all PR-dependent metrics → `n/a`. Errors are LOGGED (stderr), NOT thrown.

### Metric Definitions (per ROADMAP SC-1)

- **D-03:** **`auto_fix_attempted`** = count of PRs with label `auto-fix:verified` OR `auto-fix:partial-verified` (regardless of merge state). Source: GH API.
- **D-04:** **`verified_merged`** = count of PRs with label `auto-fix:verified` AND `mergedAt !== null`. Source: GH API.
- **D-05:** **`success_rate`** = `verified_merged / auto_fix_attempted` × 100, rounded to 1 decimal. NaN/Infinity-guard: if `auto_fix_attempted === 0` → `n/a` (NOT 0% — distinct semantics).
- **D-06:** **`cost_per_fix`** = `combinedMonthlyTotalByTransport(ledger) / auto_fix_attempted`, USD with 4-decimal display. NaN/Infinity-guard: if `auto_fix_attempted === 0` → `n/a`.
- **D-07:** **`time_to_merge_p50`** = median(mergedAt − createdAt) for merged auto-fix PRs only (filter `mergedAt !== null`). Display as `Xh Ym` (hours+minutes). NaN-guard: if no merged PRs → `n/a`.
- **D-08:** **`fix_attempts_p50`** = median number of auto-fix retries per source issue. Source: count of distinct auto-fix PRs per `<!-- source_issue: N -->` marker in PR body. If no source issue parseable → exclude from p50 calc. NaN-guard: if zero parseable → `n/a`.
- **D-09:** **`flake_escalation_count`** = count of PRs with label `human-review-required` AND `auto-fix:partial-verified` (signals FLAKE-suspected partial that needed manual review). Source: GH API. Default 0 (not `n/a`) when no PRs exist — count semantics tolerate zero.

### Section Placement (D-10 operator decision)

- **D-10:** **Auto-Fix Pipeline section appended AFTER the existing SUMMARY** per operator Q2. Does not disrupt existing cost-line / weekly-issues flow. `<details>` collapsed by default.
- **D-11:** **Section structure:**
  ```markdown
  <details>
  <summary>Auto-Fix Pipeline</summary>

  | Metric | Value |
  | --- | --- |
  | auto_fix_attempted | <N> |
  | verified_merged | <N> |
  | success_rate | <X.X%> or n/a |
  | cost_per_fix | $<X.XXXX> or n/a |
  | time_to_merge_p50 | <Xh Ym> or n/a |
  | fix_attempts_p50 | <X> or n/a |
  | flake_escalation_count | <N> |
  
  </details>
  ```

### SUMMARY_KEYS Preservation (D-12 trust-boundary invariant)

- **D-12:** **`tests/e2e/lib/llm-report.js` `SUMMARY_KEYS` array is BYTE-UNCHANGED.** Phase 55 does NOT modify llm-report.js. Vitest assertion `SUMMARY_KEYS.length === 7` (already exists per llm-report.js line 123+) continues to pass. Verified via `git diff HEAD tests/e2e/lib/llm-report.js` after Phase 55 = 0 changes.
- **D-13:** **Auto-fix metrics live ONLY in the new section** — they are NOT pushed into `SUMMARY_KEYS`. Section is rendered via a NEW helper function `renderAutoFixPipelineSection({ledger, ghPrs})` exported from weekly-digest.mjs.

### Implementation Surface

- **D-14:** **New function `renderAutoFixPipelineSection`** in `scripts/weekly-digest.mjs`. Pure-function: takes `{ledger, ghPrs, now}`, returns the markdown section string. No I/O inside the function (caller does I/O and passes data in).
- **D-15:** **New function `fetchAutoFixPrs({now})`** in `scripts/weekly-digest.mjs`. Wraps the single `gh api` call per D-02. Returns `{prs: [...], fetchedAt: now, error: null | string}`. Errors are RETURNED, not thrown.
- **D-16:** **`runDigest` (line 422) extension:** After existing digest content is rendered, call `fetchAutoFixPrs` + `renderAutoFixPipelineSection` and append the result. If `fetchAutoFixPrs.error !== null`, emit a stderr warning + render the section with all metrics `n/a`.
- **D-17:** **Helper `combinedMonthlyTotalByTransport(ledger)`** — locate the existing function (per SC-3 wording suggests it already exists; planner must verify). If it does, import and use. If not, Phase 55 ADDS it as a new pure helper in scripts/weekly-digest.mjs (NaN-guarded; sums sonnet + opus + subscription transports without double-counting).
- **D-18:** **No `gh` CLI dependency at module load** — `fetchAutoFixPrs` invokes `gh` via `child_process.execSync` at call time only. If `gh` is unavailable (local dev without auth), error is returned and section degrades to `n/a`.

### Vitest Coverage (D-19 operator decision)

- **D-19:** **3 Vitest assertions** per operator Q3:
  1. **EXISTING:** `SUMMARY_KEYS.length === 7` still passes (already pinned in `tests/unit/llm-report.test.js` or equivalent; re-verify).
  2. **NEW:** Auto-Fix Pipeline section appears in digest output: rendered digest contains `<details>\s*<summary>Auto-Fix Pipeline</summary>`.
  3. **NEW:** All 7 metric keys present in the section's markdown table: `auto_fix_attempted`, `verified_merged`, `success_rate`, `cost_per_fix`, `time_to_merge_p50`, `fix_attempts_p50`, `flake_escalation_count` all match `grep` against the rendered output.
- **D-20:** Vitest tests live in `tests/unit/weekly-digest.test.js` (existing file — extended, not created). If no existing test, plan creates `tests/unit/weekly-digest-auto-fix.test.js`.

### Plan Structure & Commits

- **D-21:** **Single plan `55-01-PLAN.md` with 3 sequential tasks** (mirrors Phase 48/52/54 single-plan convention):
  1. DASH-02 verify + new helpers (`renderAutoFixPipelineSection`, `fetchAutoFixPrs`, `combinedMonthlyTotalByTransport` if missing) + Vitest extensions
  2. DASH-01 + DASH-03: wire `runDigest` to call the new helpers; render the section with all 7 metrics + cost_per_fix invariant (combinedMonthlyTotalByTransport) + time_to_merge filter (mergedAt !== null)
  3. Closure: 55-01-SUMMARY + STATE + ROADMAP
- **D-22:** **2 atomic feat(55) commits + 1 chore closure:**
  - (a) `feat(55): DASH-02 — renderAutoFixPipelineSection + fetchAutoFixPrs + Vitest pins (SUMMARY_KEYS unchanged)`
  - (b) `feat(55): DASH-01 + DASH-03 — runDigest wires Auto-Fix Pipeline section (7 metrics, NaN-guarded, cost_per_fix via combinedMonthlyTotalByTransport, time_to_merge filter)`
  - (c) `chore(55): T3 — closure (55-01-SUMMARY + STATE + ROADMAP)`
- **D-23:** Phase 55 commits stay LOCAL (D-25 from Phase 52 — milestone-close batch PR).

### Operator Approval

- **D-24:** No `checkpoint:human-verify` tasks. Phase 55 is fully `autonomous: true`. Single `gh api search prs` call is read-only.

### Plan Review

- **D-25:** **gsd-plan-checker NOT mandatory** for Phase 55. SCs are prescriptive; no STATE blocker citing plan review.

### Claude's Discretion

- Whether `combinedMonthlyTotalByTransport` exists in the codebase — plan inspects and either imports or adds.
- Exact median computation: simple sort + middle element for `time_to_merge_p50` and `fix_attempts_p50` (no fancy quantile library).
- Whether to include a refresh timestamp at top of the Auto-Fix Pipeline section (e.g., "_fetched 2026-06-04T...Z_") — recommend yes for auditability.
- Whether `gh` errors emit a TODO inline (e.g., "n/a — gh auth missing") or just `n/a` — recommend `n/a` only, with a stderr warning at digest run time.

</decisions>

<canonical_refs>
## Canonical References

### Requirements & Roadmap (LOCKED)
- `.planning/REQUIREMENTS.md` §"Auto-Fix Dashboard" — DASH-01..03 verbatim.
- `.planning/ROADMAP.md` §"Phase 55" — 3 SCs.

### Research
- `.planning/research/SUMMARY.md` lines 60-65 — Phase 55 dependency on Phase 54's `model` ledger field.

### Source files
- `scripts/weekly-digest.mjs` — host for new functions (line 422 `runDigest`; line 224 `renderCostLine`; line 249 `renderDigest`).
- `tests/e2e/lib/llm-report.js` line 123 — `SUMMARY_KEYS` frozen 7-key array (BYTE-UNCHANGED per D-12).
- `tests/unit/weekly-digest.test.js` — Vitest harness to extend (verify existence at plan time).
- `tests/e2e/.llm-spend-ledger.json` — cost data source.

### Phase 54 precedent
- Phase 54 D-22..D-25 atomic-commit convention (`feat(54)` per task).
- Phase 54 D-25 LOCAL-only commits decision applies here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/weekly-digest.mjs` already has `runDigest()` (line 422), `renderDigest()` (line 249), `renderCostLine()` (line 224), `validateSummaryKeys()` (line 78).
- `tests/e2e/lib/llm-report.js` `SUMMARY_KEYS` (line 123) — frozen 7-key array (sustained from Phase 38).
- `gh api search/issues` for PR queries — standard pattern, no new dep.
- `child_process.execSync` for invoking `gh` — standard node primitive.

### Established Patterns
- **Pure-function helpers** (Phase 54 D-04 llm-router.js) — `renderAutoFixPipelineSection` follows.
- **Errors returned not thrown for read-only I/O** (Phase 50 evidence-capture pattern) — `fetchAutoFixPrs` follows.
- **NaN/Infinity guards** (Phase 53 PARTIAL_THRESHOLD pattern of explicit fallback values) — D-05..D-09 follow.
- **Vitest pin for frozen invariants** (Phase 50 D11/D12 jobid pins; Phase 53 D-18 PARTIAL_LABEL pin) — D-19 follows.

### Integration Points
- Phase 56 (v4.2) follow-up from Phase 54 — ledger schema extension for `errorClass` + `pr_merged` — will populate the dashboard with real values once it lands.
- Phase 55 commits stay local per Phase 52 batched-push decision.

</code_context>

<specifics>
## Specific Ideas

- **7 metric keys** (verbatim per DASH-01): `auto_fix_attempted`, `verified_merged`, `success_rate`, `cost_per_fix`, `time_to_merge_p50`, `fix_attempts_p50`, `flake_escalation_count`. Order matters for table rendering.
- **`<details>` + `<summary>Auto-Fix Pipeline</summary>`** HTML wrapper for the section.
- **`time_to_merge_p50` format:** `Xh Ym` (e.g., `4h 22m`). For p50 < 1h, display `Xm`.
- **`cost_per_fix` format:** `$X.XXXX` (4-decimal USD, conservative precision).
- **`success_rate` format:** `XX.X%` (1-decimal percentage).
- **`n/a` literal** when any metric is uncomputable (NaN/Infinity/empty source).

</specifics>

<deferred>
## Deferred Ideas

- **Per-model breakdown in the dashboard** (sonnet vs opus rows) — depends on Phase 54's `model` field actually being populated in the ledger via live UATs. Phase 56 candidate.
- **Per-ERROR_CLASS rows** — depends on Phase 56 ledger schema extension.
- **Real-time / on-demand dashboard refresh** — declined; weekly cron only.
- **HTML / web-page dashboard** — declined; markdown digest only.
- **A separate `dashboard-build.mjs` script** — declined; renderAutoFixPipelineSection lives inside weekly-digest.mjs for cohesion.
- **`gh` graphql instead of REST** — declined; REST is simpler and the data we need is exposed via `--json`.

### Reviewed Todos
None — Phase 56 pending-todo includes the ledger schema extension that unblocks richer dashboards.

</deferred>

---

*Phase: 55-auto-fix-dashboard*
*Context gathered: 2026-06-04*

---
phase: 38-v3-1-cleanup-integration-warnings-nyquist-human-uat
plan: 01
subsystem: testing
tags:
  - v3.1
  - integration-fixes
  - tech-debt
  - regression-tests
  - vitest
  - github-actions-yaml
  - DIGEST-04
  - QUAR-01
  - QUAR-03
  - QUAR-04

# Dependency graph
requires:
  - phase: 36-quarantine-corpus-nightly-cron-orchestration
    provides: "quarantine.spec.js + e2e-nightly.yml upload-artifact step; QUARANTINE_REPORT_FILENAME constant export from e2e-report-issue.mjs"
  - phase: 37-weekly-analytics-digest
    provides: "scripts/weekly-digest.mjs validateSummaryKeys + SUMMARY_KEYS import contract; tests/e2e/scripts/e2e-weekly-digest.test.js scaffold; tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js Y1..Y5 grep pattern"
provides:
  - "Single-source-of-truth for QUARANTINE_REPORT_FILENAME (no dual-source rename risk)"
  - "Runtime SUMMARY_KEYS drift detection on real aggregated metric data (DIGEST-04 repair)"
  - "Quarantine-failure artifact uploads gated by id: upload-artifacts + inside-parens clause"
  - "3 vitest regression tests pinning each fixed seam (file-as-text grep pattern)"
  - "v3.1-MILESTONE-AUDIT.md frontmatter: scores.integration 29/29; gaps.integration []; cross-cutting tech_debt 3-fragility-warnings bullet removed"
affects:
  - "Plan 38-02 (Nyquist stamping — consumes the cleaned audit YAML)"
  - "Plan 38-03 (Human-UAT — consumes the cleaned audit YAML)"
  - "Future v3.2 contributors — the regression tests block silent reintroduction of the 3 fragility patterns"

# Tech tracking
tech-stack:
  added: []  # Zero new npm dependencies — v3.1 pre-locked rule honored
  patterns:
    - "File-as-text grep regression test for cross-file constant imports (tests/unit/quarantine-spec-import.test.js)"
    - "Step-window YAML assertion with id-anchored grep (Y6 extends the Y2 pattern)"
    - "SUMMARY_KEYS-shaped aggregator separate from issue-shape aggregator — drift detector validates the former, render consumer reads the latter"

key-files:
  created:
    - "tests/unit/quarantine-spec-import.test.js — INT-FIX-01 regression"
    - ".planning/v3.1-MILESTONE-AUDIT.md — committed for the first time (was untracked before this plan)"
  modified:
    - "tests/e2e/specs/quarantine.spec.js — replace local const with ESM import"
    - "scripts/e2e-report-issue.mjs — update sync-requirement comment (local re-declare removed)"
    - "scripts/weekly-digest.mjs — add aggregateBySummaryKey export; rewire runDigest validateSummaryKeys call site"
    - "tests/e2e/scripts/e2e-weekly-digest.test.js — extend with INT-FIX-02 nested describe (3 it() blocks)"
    - ".github/workflows/e2e-nightly.yml — add id: upload-artifacts + quarantine clause inside always() && (...)"
    - "tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js — append Y6 (INT-FIX-03) it() block"

key-decisions:
  - "Option A locked from RESEARCH Open Question §1: repair the runtime drift guard with a dedicated aggregateBySummaryKey helper (~50 LOC) rather than drop the dead check"
  - "Add id: upload-artifacts to the upload step per RESEARCH Open Question §2 — matches surrounding step convention (id: quarantine/regression/smoke) and stabilizes the YAML grep test"
  - "Place INT-FIX-01 regression test in tests/unit/ (new file) rather than extending tests/unit/e2e-report-issue.test.js — keeps the spec-source-grep concern isolated from the e2e-report-issue.mjs API surface"
  - "Quarantine clause sits INSIDE the always() && (...) parens (Pitfall 3 — operator precedence: && binds tighter than ||); Y6 regression test enforces this via /&&\\s*\\([^)]*steps\\.quarantine\\.outcome == 'failure'[^)]*\\)/ regex"
  - "Task 4 audit edits target ONLY gaps.integration, scores.integration, the cross-cutting tech_debt fragility bullet, and the markdown Integration-warnings section — nyquist + human_verification blocks remain UNTOUCHED (claimed by Plans 38-02 and 38-03 per the phase-decomposition contract)"

patterns-established:
  - "Cross-file constant import contract: when consumer A and producer B share a string literal, the regression test reads A as text and grep-asserts (a) import statement present, (b) no local re-declare. Closes the dual-source class entirely."
  - "Aggregator-pair pattern: when a domain has both a render-side aggregator (issue-shape: findingsCount/breakdown/top3) and a schema-validator-side aggregator (SUMMARY_KEYS-shape), they remain separate functions sharing only the dedup-by-issue-number pre-step. The validator validates the SUMMARY_KEYS-shaped output."
  - "GH Actions if-clause regression test: anchor by id, slice window between - name: header (lastIndexOf back) and next step boundary (next - name: / id:), then both string-contains the clause AND regex-match the parens grouping. Pins both presence and precedence."

requirements-completed:
  - QUAR-01
  - QUAR-03
  - QUAR-04
  - DIGEST-04

# Metrics
duration: 7min
completed: 2026-05-29
---

# Phase 38 Plan 01: v3.1 Integration Fragility Fixes Summary

**Three v3.1 integration fragility warnings resolved as 3 atomic fix commits + 1 audit-doc commit: ESM import for QUARANTINE_REPORT_FILENAME single-sourcing, aggregateBySummaryKey helper repairing the DIGEST-04 self-referential check, and id: upload-artifacts + inside-parens quarantine clause on the e2e-nightly upload-artifact step — each pinned by a vitest regression test.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-29T22:07:53Z
- **Completed:** 2026-05-29T22:14:59Z
- **Tasks:** 4 / 4
- **Files created:** 2 (1 new test + audit YAML first-time commit)
- **Files modified:** 6
- **Test count:** 678 → 684 (+6 new it() blocks across 3 files)

## Accomplishments

- **INT-FIX-01:** `tests/e2e/specs/quarantine.spec.js` now imports `QUARANTINE_REPORT_FILENAME` from `scripts/e2e-report-issue.mjs` (single source of truth). The local re-declare and the dual-source sync comment are gone. A future one-sided rename surfaces as an ESM import error at spec load time instead of producing silent zero filings (QUAR-01 / QUAR-04).
- **INT-FIX-02:** `scripts/weekly-digest.mjs` exports a new `aggregateBySummaryKey({nightlyIssues, quarantineIssues, monthlyTotalCostUsd})` helper that produces a SUMMARY_KEYS-shaped tally from real deduped issue data. `runDigest` now calls `validateSummaryKeys(aggregateBySummaryKey(...))` instead of the self-referential `validateSummaryKeys(Object.fromEntries(SUMMARY_KEYS.map(...)))`. The runtime drift guard now actually detects drift (DIGEST-04).
- **INT-FIX-03:** `.github/workflows/e2e-nightly.yml` upload-artifact step now has `id: upload-artifacts` for grep-test stability and `if: always() && (... || steps.quarantine.outcome == 'failure')` with the quarantine clause INSIDE the parens (Pitfall 3 — operator precedence). Quarantine failures now upload their diagnostic artifacts (QUAR-03 / QUAR-04).
- **Audit update:** `.planning/v3.1-MILESTONE-AUDIT.md` frontmatter: `scores.integration` 27/29 → 29/29; `gaps.integration` 3-entry list → `[]`; cross-cutting `tech_debt` fragility-warnings bullet removed. Markdown body: Integration warnings section heading retitled "— RESOLVED in Phase 38" with each item annotated `✅ RESOLVED (commit <SHA>)` and the regression-test file path. `nyquist:` and `human_verification:` blocks UNTOUCHED.

## Task Commits

Each task committed atomically:

1. **Task 1: INT-FIX-01** — `e24be0c` fix(38-01): INT-FIX-01 — quarantine.spec.js imports QUARANTINE_REPORT_FILENAME (closes silent-zero-filings risk)
2. **Task 2: INT-FIX-02** — `fa8497d` fix(38-01): INT-FIX-02 — validateSummaryKeys guards real aggregated data (repairs DIGEST-04 self-referential check)
3. **Task 3: INT-FIX-03** — `613a56d` fix(38-01): INT-FIX-03 — Upload E2E artifacts step gates on quarantine failure (id: upload-artifacts + inside-parens clause)
4. **Task 4: Audit update** — `3d26dc5` docs(38-01): close gaps.integration in v3.1 audit — all 3 fragility warnings RESOLVED

Each fix follows TDD (RED test → GREEN impl → COMMIT in one shot per the plan's `<action>` structure). Test-only and impl changes were combined per the locked decision "one atomic commit per fix" (matches Phase 37 CR-01 `4cac665` / CR-02 `16dedf3` pattern).

## Files Created/Modified

### Created

- `tests/unit/quarantine-spec-import.test.js` — INT-FIX-01 regression. Reads `tests/e2e/specs/quarantine.spec.js` as text (avoids Playwright runtime); two it() blocks: (a) import statement regex match; (b) no local `const QUARANTINE_REPORT_FILENAME = ...` re-declare.
- `.planning/v3.1-MILESTONE-AUDIT.md` — committed for the first time (was untracked before this plan). Reflects post-fix state for the integration track; other tracks (nyquist, human_verification) preserved for Plans 38-02 and 38-03.

### Modified

- `tests/e2e/specs/quarantine.spec.js` — Added `import { QUARANTINE_REPORT_FILENAME } from '../../../scripts/e2e-report-issue.mjs';`; removed the local const + dual-source sync block comment; updated context comment to reference INT-FIX-01.
- `scripts/e2e-report-issue.mjs` — Updated the comment above the `QUARANTINE_REPORT_FILENAME` export to reference the new import contract (no functional change to the export).
- `scripts/weekly-digest.mjs` — (1) Added `export function aggregateBySummaryKey(...)` (~50 LOC) that maps ERROR_CLASS_SET membership to SUMMARY_KEYS, seeds every key, and treats `total_cost_usd` as metric data. (2) Rewired `runDigest` to compute `monthlyTotalCostUsd` once, pass it to `aggregateBySummaryKey`, then `validateSummaryKeys(summaryByKey)`. (3) Removed the self-referential `summaryTally = Object.fromEntries(SUMMARY_KEYS.map(...))` seed.
- `tests/e2e/scripts/e2e-weekly-digest.test.js` — Extended top-of-file import to include `aggregateBySummaryKey`. Added new describe block `INT-FIX-02: validateSummaryKeys throws against real aggregated data` with 3 it() blocks (helper completeness; synthetic-drift throws naming key; runDigest source-grep wiring assertion).
- `.github/workflows/e2e-nightly.yml` — Added `id: upload-artifacts` (one line); appended `|| steps.quarantine.outcome == 'failure'` INSIDE the existing `always() && (...)` parens.
- `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — Updated header comment to include Y6 description; appended Y6 it() block that anchors by `id: upload-artifacts`, slices the step block back to the `- name:` header, asserts the clause is present AND inside-parens via `/if:\s*always\(\)\s*&&\s*\([^)]*steps\.quarantine\.outcome == 'failure'[^)]*\)/`.

## Audit YAML — Before / After

### `scores.integration`

- **Before:** `27/29   # 27 seams fully wired, 2 partial (QUAR-04, DIGEST-04 — fragility, not breaks)`
- **After:** `29/29   # all seams fully wired; 3 fragility warnings resolved in Phase 38 (INT-FIX-01/02/03)`

### `gaps.integration`

- **Before:** 3-entry list (QUARANTINE_REPORT_FILENAME duplicated; DIGEST-04 self-referential; e2e-nightly.yml artifact upload omits quarantine)
- **After:** `[]       # 3 fragility warnings resolved in Phase 38 Plan 01 (commits e24be0c, fa8497d, 613a56d)`

### `tech_debt[].cross-cutting`

- **Before:** Two bullets — "5 of 6 phases carry draft VALIDATION.md..." AND "3 integration fragility warnings (see gaps.integration above)"
- **After:** One bullet — "5 of 6 phases carry draft VALIDATION.md..." (the fragility-warnings bullet is removed; the nyquist-draft bullet remains for Plan 38-02 to close)

### `nyquist:` and `human_verification:`

- **UNTOUCHED.** Plan 38-02 owns `nyquist:`; Plan 38-03 owns `human_verification:`. Verified by `node -e` post-edit assertion: `compliant_phases: ["36"]`, `partial_phases: ["32","33","34","35","37"]`, and 7 `human_verification` items all preserved.

## Verification Results

All per-plan checks from `<verification>` block executed successfully:

| Check | Command | Result |
| --- | --- | --- |
| All 3 regression tests pass | `npx vitest run tests/unit/quarantine-spec-import.test.js tests/e2e/scripts/e2e-weekly-digest.test.js tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js --reporter=dot` | 33/33 PASS |
| Full test:src suite green | `npm run test:src` | 684/684 PASS (44 files) |
| Lint clean | `npm run lint` | 0 errors (2 pre-existing warnings in `tests/e2e/lib/settings.js` — unrelated to this plan) |
| Audit YAML coherence | Node parse: integration 29/29, gaps empty, no fragility-warnings bullet | AUDIT YAML coherent |
| Commit format pin | `git log --oneline -4 \| grep -cE "^[0-9a-f]+ (fix\|docs)\(38-01\):"` | 4 (matches expected) |

## Decisions Made

- **TDD per task:** Each of Tasks 1-3 followed RED → GREEN → COMMIT atomically. The plan's `<action>` block bakes the test creation into the same task as the impl change — committed together per Phase 37 CR-01/CR-02 convention. (No separate test-only commits — the regression test is part of the fix's contract.)
- **`aggregateBySummaryKey` mapping (Pitfall 2 resolution):** `HARNESS_ERROR` and `passed` SUMMARY_KEYS are NOT incremented from the issue stream — they are synthetic classifications produced by `tests/e2e/lib/report.js`, not GitHub labels. They remain in the seeded tally (so `validateSummaryKeys` passes) but never tally above 0 from issue traversal. `total_cost_usd` is sourced from `monthlyTotalCostUsd` argument, rounded to 6 decimals to match `llm-report.js` convention.
- **`monthlyTotalCostUsd` computation site:** Moved up in `runDigest` so it can feed BOTH `renderCostLine` (existing) AND `aggregateBySummaryKey` (new). Preserved the `fs.existsSync(ledgerPath)` guard (Pitfall 2 — `monthlyTotal` returns 0 for both $0 spend and no-ledger-file, indistinguishable without the existence check).
- **`id: upload-artifacts` placement (INT-FIX-03):** Added directly below `- name: Upload E2E artifacts` (matches surrounding `- name:` then `id:` ordering in other steps). The Y6 test computes the step window by anchoring on `id: upload-artifacts` and slicing BACK to the `- name:` header via `lastIndexOf` so the regex sees the full step including the `if:` line.

## Deviations from Plan

**None — plan executed exactly as written.**

No deviation rules (Rule 1-4) triggered. Every task's action steps were followed precisely:

- No bugs encountered during impl (all GREEN tests passed on first attempt after the spec'd code change).
- No missing critical functionality discovered (the plan's threat model T-38-01-01..03 mitigations were exactly what the impl provided).
- No blocking issues (zero new packages required; all imports resolved on first try).
- No architectural decisions surfaced (the locked decision Option A from RESEARCH §Open Question 1 was already chosen).

The plan's `<acceptance_criteria>` for every task verified PASS on first execution. No re-runs.

## Issues Encountered

**None.** The plan's RESEARCH document accurately captured the existing patterns:

- Pitfall 2 (`aggregateBySummaryKey` HARNESS_ERROR/total_cost_usd handling) was anticipated; the impl seeded both correctly on first try.
- Pitfall 3 (clause inside parens) was anticipated; the Y6 regex pinned it and the YAML edit landed inside parens on first try.
- The Y6 step-window pattern needed `lastIndexOf('- name: Upload E2E artifacts', startIdx)` to slice BACK and capture the `if:` line (which appears BEFORE `id:` in YAML step order). This was a minor mechanical detail not explicitly in RESEARCH but obvious from inspection of the Y2 pattern.

## User Setup Required

None — no external service configuration required. All changes are repo-internal (source code, test code, YAML, audit doc).

## Next Phase Readiness

- **Plan 38-02 (Nyquist stamping)** is unblocked: it reads the `nyquist:` block in `.planning/v3.1-MILESTONE-AUDIT.md` (preserved untouched) and will update it after running `/gsd:validate-phase` against phases 32, 33, 34, 35, 37.
- **Plan 38-03 (Human-UAT)** is unblocked: it reads the `human_verification:` block (preserved untouched) and will append outcome lines.
- **No blockers or concerns.** The integration track is fully closed; the bisectable commit history (3 atomic fixes + 1 doc commit) preserves future rollback granularity.

## Self-Check: PASSED

Verified post-write that all claims are grounded:

- `tests/unit/quarantine-spec-import.test.js` — FOUND
- `.planning/v3.1-MILESTONE-AUDIT.md` — FOUND
- Commit `e24be0c` (INT-FIX-01) — FOUND
- Commit `fa8497d` (INT-FIX-02) — FOUND
- Commit `613a56d` (INT-FIX-03) — FOUND
- Commit `3d26dc5` (audit-update) — FOUND
- `npm run test:src` exit 0 with 684/684 — VERIFIED
- `npm run lint` 0 errors — VERIFIED
- Audit YAML parse coherence — VERIFIED via `node -e` script
- `nyquist:` + `human_verification:` blocks untouched — VERIFIED via post-edit field comparison

---

*Phase: 38-v3-1-cleanup-integration-warnings-nyquist-human-uat*
*Plan: 01*
*Completed: 2026-05-29*

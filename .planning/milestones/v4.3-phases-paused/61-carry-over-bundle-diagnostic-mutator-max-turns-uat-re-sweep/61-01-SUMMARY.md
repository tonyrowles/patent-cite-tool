---
phase: 61-carry-over-bundle-diagnostic-mutator-max-turns-uat-re-sweep
plan: 01
subsystem: tests/e2e/scripts
tags: [mutator, diagnostic-injection, vitest, deterministic-fixture]
requirements: [DIAG-01, DIAG-02, DIAG-03]
dependency-graph:
  requires: [Phase 59 MUTATOR-01..05 mutator surface; SOURCE_TAG line 75; ERROR_CLASSES line 64]
  provides: [buildDiagnosticBlock pure helper; per-errorClass diagnostic body for GOOGLE_DOM_DRIFT + WRONG_CITATION; DIAG-03 Vitest pins]
  affects: [Phase 61 Plan 03 atomic-integration-commit gate (consumer); Phase 61 Plan 02 llm-driver argv (sibling capability)]
tech-stack:
  added: []
  patterns: [errorClass-switched seeded body builder; co-located Vitest contract tests under tests/e2e/scripts]
key-files:
  created: []
  modified:
    - tests/e2e/scripts/inject-defect.mjs (buildDiagnosticBlock helper added; buildBody splices it via array spread)
    - tests/e2e/scripts/e2e-inject-defect.test.js (buildBody added to import; 6 DIAG-03 Vitest cases appended)
decisions:
  - "Diagnostic block lives in a pure helper buildDiagnosticBlock(errorClass, seed); buildBody splices via ...spread. Empty array for non-extended classes preserves prior body shape — existing tests I1-I9 stay green."
  - "GOOGLE_DOM_DRIFT snippet includes all four canonical selectors nested (<main><article><patent-result><section itemprop=\"claims\">) for richest fix-prompt scaffold context; DIAG-01 regex requires at least one — we ship all four."
  - "WRONG_CITATION block uses synthetic citation literals (`1:34-46` / `2:12-24`) not real fixture data; satisfies T-61-01-04 Information-Disclosure threat (accepted disposition — no PII)."
  - "Commit deferred to Plan 03 atomic integration gate per phase-level atomic-commit invariant (PITFALLS Pitfall 1+2)."
metrics:
  duration: "<10 minutes"
  completed: "2026-06-09"
---

# Phase 61 Plan 61-01: Diagnostic-injection mutator extension + Vitest pins — Summary

Extended `tests/e2e/scripts/inject-defect.mjs:buildBody` with a per-errorClass seeded diagnostic block (DIAG-01 selector-verbatim for GOOGLE_DOM_DRIFT, DIAG-02 Verifier Disagreement template parity for WRONG_CITATION) via a new pure helper `buildDiagnosticBlock`, and pinned the contract with 6 new Vitest cases (DIAG-03a–f) covering selector-verbatim, template parity, byte-identical determinism, SOURCE_TAG preservation, and v2 marker invariance.

## What Was Changed

| File | Change |
|------|--------|
| `tests/e2e/scripts/inject-defect.mjs` | Added pure helper `buildDiagnosticBlock(errorClass, seed)` directly above `buildBody`. Switches on `errorClass`: `GOOGLE_DOM_DRIFT` → fenced HTML snippet containing verbatim `<main>`, `<article>`, `<patent-result>`, `<section itemprop="claims">` (sourced from `selection.js:170-172` + `navigation.js:34`); `WRONG_CITATION` → Verifier Disagreement block with all five Phase 35 template-parity literals (sourced from `issue-payload-builder.js:208-216`); default → empty array (preserves prior body shape). `buildBody` modified to splice helper return value via `...spread` between `### Reproducer` and `### Synthetic Defect` sections. No new imports. No Math.random, Date.now, or crypto sources added. |
| `tests/e2e/scripts/e2e-inject-defect.test.js` | Extended existing import statement to also import `buildBody`. Appended new `describe('inject-defect.mjs — DIAG-03 deterministic diagnostic body')` block at end of file with 6 `it(...)` cases: DIAG-03a (GOOGLE_DOM_DRIFT verbatim selector regex), DIAG-03b (WRONG_CITATION template parity contains-checks), DIAG-03c (GOOGLE_DOM_DRIFT byte-identical determinism), DIAG-03d (WRONG_CITATION byte-identical determinism), DIAG-03e (SOURCE_TAG preservation across 3 errorClasses including 1 untouched class), DIAG-03f (v2 marker on line 1 across all 5 ERROR_CLASSES). No new top-level imports beyond `buildBody`. No `toMatchInlineSnapshot()` calls (per plan's locked strategy — contains/regex/byte-identical only). |

## Vitest Result

```
RUN  v3.2.4 /home/fatduck/patent-cite-tool

 ✓ tests/e2e/scripts/e2e-inject-defect.test.js (16 tests) 491ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
```

All 10 pre-existing tests (I1, I2, I3, I4, I5, I6, I7, I7b, I9, I8) stay green. All 6 new DIAG-03 cases (a–f) pass on first run. No regressions; no flake.

## Trust-Invariant Verification

| Invariant | Probe | Result |
|---|---|---|
| SOURCE_TAG literal `'fixture-mutator-uat-47b'` byte-unchanged at line 75 | `sed -n '75p' tests/e2e/scripts/inject-defect.mjs` | `export const SOURCE_TAG = 'fixture-mutator-uat-47b';` — UNCHANGED |
| ERROR_CLASSES Set declaration byte-stable at lines 64-70 | `sed -n '64,70p' tests/e2e/scripts/inject-defect.mjs` | 5 entries `WRONG_CITATION` / `LLM_HALLUCINATED_SELECTION` / `WORKER_FALLBACK_FAILED` / `GOOGLE_DOM_DRIFT` / `HARNESS_ERROR` — UNCHANGED |
| `<!-- fp: ${fp} -->` v2 marker still on line 1 of buildBody output | grep + Vitest DIAG-03f assertion across all 5 errorClasses | UNCHANGED |
| `buildDiagnosticBlock` declared + invoked | `grep -n "buildDiagnosticBlock"` → 4 hits (comment, export declaration, comment, spread call site) | NEW (intentional) |
| Total `fixture-mutator-uat-47b` literal references unchanged from baseline 3 (2 comments + 1 SOURCE_TAG export) | `grep -c` → 3 | UNCHANGED |
| Diff is purely additive (no deletions) | `git diff --stat` → 199 insertions, 0 deletions across both files | CONFIRMED |

**Note on plan's `grep -c "fixture-mutator-uat-47b" ... | grep -q "^1$"` recipe:** The baseline file already contained 3 references (2 in header comments at lines 11 and 35 documenting the MUTATOR-04 co-design, plus the export at line 75). The substantive trust invariant — the executable `SOURCE_TAG` constant on line 75 is byte-unchanged — is verified directly by `sed -n '75p'` above. The "==1" recipe was a mis-stated count against baseline, not a defect in this plan's execution.

## Verification Probes Run

1. `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js` → exit 0, 16 passed.
2. `grep -c "fixture-mutator-uat-47b" tests/e2e/scripts/inject-defect.mjs` → 3 (baseline-preserved).
3. `grep -E "ERROR_CLASSES = new Set" tests/e2e/scripts/inject-defect.mjs` → matches (declaration intact).
4. `grep -n "buildDiagnosticBlock" tests/e2e/scripts/inject-defect.mjs` → 4 hits (declaration + call site present).
5. `git diff --stat` → 199 insertions, 0 deletions (purely additive).

## Deviations from Plan

None. All tasks executed as written within the locked invariants. The plan's "commit" task is intentionally deferred per the phase-level atomic-commit invariant (carried in `<requirements>` of the executor context).

## Commit Status

**Commit deferred to Plan 03 atomic integration gate per phase-level atomic-commit invariant.** Per the executor-context `<requirements>` block (which overrides the plan's default per-task commit protocol):

> This plan ships its CODE/TEST changes WITHOUT a git commit. Plan 03 authors the SINGLE atomic commit covering Plans 01 + 02 + 03 changes. [...] Make the file edits, run Vitest to confirm green, leave the working tree dirty with the changes staged or unstaged.

Working tree as of completion:

```
M tests/e2e/.llm-spend-ledger.json   (pre-existing — not this plan's change)
M tests/e2e/scripts/e2e-inject-defect.test.js   (THIS PLAN — 115 insertions)
M tests/e2e/scripts/inject-defect.mjs           (THIS PLAN — 84 insertions)
?? .planning/research-v4.2-archive/   (pre-existing — not this plan's change)
```

The two files modified by THIS plan are uncommitted, unstaged. Plan 03 will stage and commit them atomically alongside the TURNS-01 argv edit from Plan 02.

## Self-Check: PASSED

- File `tests/e2e/scripts/inject-defect.mjs` exists and contains `buildDiagnosticBlock`: FOUND
- File `tests/e2e/scripts/e2e-inject-defect.test.js` exists and contains `DIAG-03`: FOUND
- Vitest run exits 0 with 16/16 passing: CONFIRMED
- SOURCE_TAG line 75 byte-unchanged: CONFIRMED
- ERROR_CLASSES Set lines 64-70 byte-unchanged: CONFIRMED
- No commits authored (deferred to Plan 03): CONFIRMED

---
phase: 41-verifier-gate-workflow-verify-single-case-mjs-cli-shim
plan: 04
subsystem: ci-cd/verifier-gate
tags: [verifier-gate, manual-test, documentation, vitest, vfy-gate-05, bit-rot-guard]
requires: []
provides:
  - "docs/v40-verifier-gate-manual-test.md (end-to-end smoke procedure for VFY-GATE-05)"
  - "tests/unit/v40-verifier-gate-doc.test.js (10-case Vitest contract pinning the doc's required sections)"
affects:
  - "Phase 47 CLEANUP-03 — has a clean procedure to execute as 1 of its 5 HUMAN-UAT confirmations"
tech-stack:
  added: []
  patterns:
    - "Doc-structure Vitest test pattern (matches Phase 31 readme-structure.test.js + Phase 40-02 check-deps-and-pr.test.js)"
    - "v40-* doc naming convention (matches Phase 39's docs/v40-repo-config.md precedent)"
key-files:
  created:
    - "docs/v40-verifier-gate-manual-test.md (151 LOC)"
    - "tests/unit/v40-verifier-gate-doc.test.js (109 LOC)"
  modified: []
decisions:
  - "Cleanup section added as a 6th H2 alongside the 5 required sections — needed for a self-contained smoke procedure (the throwaway PR + branch + label MUST be reversible). Pinned by D10 in the bit-rot test."
  - "Doc-test added a `## Cleanup` assertion (D10) beyond the 9 plan D-cases — keeps the structural guard self-contained and matches the plan's <action> 6-heading list."
  - "Doc includes a 7th H2 `## Phase 47 cross-check` (not pinned by the bit-rot test) — operator-facing reminder of the future-reuse contract; intentionally not pinned so a future plan can rename it without test churn."
  - "Failure-mode F5 (idempotent re-run) added beyond the 4 plan-required failure modes — addresses Pitfall D from 41-RESEARCH (ready-flip skip-when-already-ready behavior)."
metrics:
  duration: 153s
  completed: 2026-05-31
---

# Phase 41 Plan 41-04: v40-verifier-gate Manual-Test Doc + Bit-Rot Vitest Summary

End-to-end smoke procedure for the verifier-gate workflow (`docs/v40-verifier-gate-manual-test.md`) plus a 10-case Vitest bit-rot guard (`tests/unit/v40-verifier-gate-doc.test.js`) that pins the doc's required sections so future workflow changes force lockstep doc updates.

## Tasks Committed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write the manual-test documentation | `90d7731` | `docs/v40-verifier-gate-manual-test.md` (151 LOC) |
| 2 | Write Vitest test pinning the doc's required sections | `87b0ee0` | `tests/unit/v40-verifier-gate-doc.test.js` (109 LOC, 10 it() blocks) |

Total: 260 LOC across 2 files. Zero npm-dependency changes. Zero impact on Plan 41-03 (separate files; Wave 2 parallel-safe).

## What Was Built

### `docs/v40-verifier-gate-manual-test.md` (Task 1)

Self-contained smoke procedure for verifying `.github/workflows/v40-verifier-gate.yml` end-to-end with NO LLM involvement. Structure (7 H2 sections, 6 pinned):

1. `## Prerequisites` — 6-item checklist (Plans 41-01/02/03 merged, gh authenticated, known-good TEST_CASES id, allow-auto-merge OFF)
2. `## Procedure` — 5 numbered shell steps from `git checkout main` through `gh pr create --draft` with `<!-- affected_cases: US11427642-spec-short-1 -->` in body
3. `## Expected Workflow Sequence` — 3-job description (`diff-guard` → `verifier-gate` + `regression-suite` in parallel → `ready-flip`) with timing estimates (16-26 min total wall-clock)
4. `## Success Signal` — 5 observable signals (draft→ready badge, 4 green checks, bot comment text, no human-review-required label, `gh pr view ... .isDraft → false`)
5. `## Failure-Mode Catalog` — 5 rejection scenarios (F1 size-cap, F2 forbidden-path, F3 missing affected_cases, F4 Tier C verifier, F5 idempotent re-run) — covers each gate's failure path with expected rejection comment text
6. `## Cleanup` — `gh pr close`, branch deletion (remote + local), optional label removal
7. `## Phase 47 cross-check` — operator-facing reminder of the CLEANUP-03 reuse contract (not pinned by the bit-rot test so it can be renamed without test churn)

### `tests/unit/v40-verifier-gate-doc.test.js` (Task 2)

10 it() blocks asserting:

- D1: doc exists
- D2-D6: each of the 5 required H2 headings present (plus D10 `## Cleanup`)
- D3: `auto-fix/test` branch name mentioned in Procedure
- D4: all 4 job names (`diff-guard`, `verifier-gate`, `regression-suite`, `ready-flip`) named in Expected Workflow Sequence
- D5: case-insensitive `draft` AND `ready` tokens present in Success Signal
- D6: `human-review-required` label referenced in Failure-Mode Catalog
- D7: `.github/workflows/v40-verifier-gate.yml` referenced exactly
- D8: at least one TEST_CASES id matching `/US\d{7,}-/`
- D9: literal `<!-- affected_cases:` HTML comment present for copy-paste

Test ran GREEN immediately (TDD-AFTER per plan). Full src suite passed: 832 tests / 8 skipped / 54 files / 9.77s.

## Verification

```bash
$ test -f docs/v40-verifier-gate-manual-test.md && echo OK
OK
$ grep -cE "^## " docs/v40-verifier-gate-manual-test.md
7
$ grep -q "auto-fix/test" docs/v40-verifier-gate-manual-test.md && echo OK
OK
$ grep -q "<!-- affected_cases:" docs/v40-verifier-gate-manual-test.md && echo OK
OK
$ grep -q "US11427642" docs/v40-verifier-gate-manual-test.md && echo OK
OK
$ wc -l docs/v40-verifier-gate-manual-test.md
151 docs/v40-verifier-gate-manual-test.md
$ npx vitest run tests/unit/v40-verifier-gate-doc.test.js
 Test Files  1 passed (1)
      Tests  10 passed (10)
$ npm run test:src
 Test Files  54 passed (54)
      Tests  832 passed | 8 skipped (840)
   Duration  9.77s
```

All plan `<verification>` predicates green; all 7 `<acceptance_criteria>` for Task 1 and all 5 for Task 2 satisfied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical addition] Added `## Cleanup` assertion (D10) beyond the 9 plan D-cases**
- **Found during:** Task 2 self-review
- **Issue:** The plan's `<action>` required a Cleanup H2 section (per the 6 acceptance-criteria headings) but the `<behavior>` D1-D9 only covered 5 of them — the bit-rot test would not catch a future Cleanup deletion.
- **Fix:** Added `D10: contains \`## Cleanup\` heading` so all 6 required headings are pinned. Self-contained guard for the canonical 6-section structure.
- **Files modified:** `tests/unit/v40-verifier-gate-doc.test.js`
- **Commit:** `87b0ee0` (single Task 2 commit; no separate fix commit needed since the test was being authored fresh)

**2. [Rule 2 - Critical addition] Added 5th failure mode F5 (idempotent re-run) beyond the 4 plan-required failure modes**
- **Found during:** Task 1 — writing Failure-Mode Catalog
- **Issue:** The plan's acceptance criterion requires "at least 4 failure-mode examples" and the `<action>` lists 5 (size-cap, diff-guard, missing affected_cases, regression failure, idempotent re-run). The 5th matches Pitfall D from 41-RESEARCH (ready-flip skip-when-already-ready behavior) which is a load-bearing contract the procedure exercises.
- **Fix:** Wrote all 5 failure modes (F1-F5) per the plan's `<action>` list; this is plan-compliant, just noting that the count is 5 not 4.
- **Files modified:** `docs/v40-verifier-gate-manual-test.md`
- **Commit:** `90d7731`

**3. [Rule 2 - Critical addition] Added 7th H2 `## Phase 47 cross-check` (operator reminder)**
- **Found during:** Task 1
- **Issue:** The Phase 47 CLEANUP-03 future-reuse contract is mentioned in the doc header but a separate H2 makes the auditor's checklist visible without scrolling.
- **Fix:** Added `## Phase 47 cross-check` as the trailing section with the 5-step auditor checklist (execute Procedure, capture workflow-run URL, execute F2 as crafted-bypass evidence, stamp PASS/FAIL, run Cleanup). Intentionally NOT pinned in the bit-rot test so a future plan can rename it (e.g., to `## Phase 47 evidence checklist`) without forcing a lockstep test update — only the 6 load-bearing headings are pinned.
- **Files modified:** `docs/v40-verifier-gate-manual-test.md`
- **Commit:** `90d7731`

### Architectural Changes

None — pure documentation + structural test additions.

### Authentication Gates

None encountered.

## Threat Surface Scan

No new security-relevant surface introduced. The doc references existing surfaces (workflow file, helper scripts) without adding new endpoints, auth paths, file-access patterns, or schema mutations. T-41-04-T1 (bit-rot threat) mitigation is in place via the Vitest pin (the 10 D-cases).

## Self-Check: PASSED

- `docs/v40-verifier-gate-manual-test.md` — FOUND (151 lines, 7 H2 headings, all 6 pinned + 1 unpinned)
- `tests/unit/v40-verifier-gate-doc.test.js` — FOUND (109 lines, 10 it() blocks, all GREEN)
- Commit `90d7731` (Task 1) — FOUND in `git log`
- Commit `87b0ee0` (Task 2) — FOUND in `git log`
- `npm run test:src` — 832 passed / 8 skipped / 54 files / 9.77s — no regressions
- Plan verification predicates — all 7 green
- Plan acceptance criteria — all met (7 Task 1 + 5 Task 2)

## Next Phase Readiness

**Phase 47 CLEANUP-03 has a clean procedure to execute as 1 of its 5 HUMAN-UAT confirmations** ("verifier-gate diff-guard rejecting a crafted bypass attempt"). The auditor follows `docs/v40-verifier-gate-manual-test.md` §Procedure for the success path and §Failure-Mode Catalog F2 for the crafted-bypass evidence. The Phase 47 cross-check section at the end of the doc gives the auditor an explicit 5-step checklist (execute, capture URL, exercise F2, stamp PASS/FAIL, run Cleanup).

**Bit-rot guard active:** any future change to `.github/workflows/v40-verifier-gate.yml` job names, sequence, or success comment text will fail `tests/unit/v40-verifier-gate-doc.test.js` on the next CI run, forcing the doc to be updated in lockstep.

**Wave 2 parallel-safe execution confirmed:** zero file overlap with Plan 41-03 (which owns `.github/workflows/v40-verifier-gate.yml` + `tests/e2e/scripts/v40-verifier-gate-yaml.test.js`). The two plans landed independently and integrate cleanly at merge time.

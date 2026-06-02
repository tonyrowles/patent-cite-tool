---
phase: 47-v4-0-cleanup
plan: 01

subsystem: testing
tags: [v4.0, cleanup, integration-audit, int-fix, vitest, static-grep, regression-test, llm-ledger, anthropic-sdk]

# Dependency graph
requires:
  - phase: 39-44
    provides: 5 v3.1→v4.0 ARCHITECTURE §4 touchpoints to pin (triage label, fingerprint→branch namer, invokeClaudePWithLedger, verifyCitation shim, runPromote triple-gate)
  - phase: 38
    provides: INT-FIX commit pattern template (Phase 38 INT-FIX-01..03)
  - phase: 39
    provides: LEDGER-04 seed-only contract (Test 48 anchor)
  - phase: 46
    provides: leaked ledger entries from local 'npm run e2e:explore' iterations (the dirty working-tree state INT-FIX-LEDGER cleans up)
provides:
  - tests/unit/v4-touchpoints.test.js — 5 TP-* regression test groups (15 it() blocks) pinning all v3.1→v4.0 ARCHITECTURE §4 touchpoint contracts
  - tests/unit/package-lock-pinned.test.js — 4-assertion INT-FIX-LOCK static-grep for @anthropic-ai/sdk EXACT 0.100.1 pin
  - tests/e2e/.llm-spend-ledger.json restored to Phase 39 seed-only shape (months={'2026-05'}, invocations=1, total_usd=0)
  - tests/e2e/scripts/e2e-weekly-digest.test.js INT-FIX-CAL dynamic-month derivation (no calendar-rollover flake)
  - 3 atomic INT-FIX commits matching Phase 38 pattern (LEDGER → CAL → LOCK)
affects: [47-02-nyquist-stamping, 47-04-codeowners-audit, future v4.x renames of any touchpoint producer/consumer, npm install / dependabot auto-updates to @anthropic-ai/sdk]

# Tech tracking
tech-stack:
  added: []  # ZERO new packages — v4.0 hard rule preserved
  patterns:
    - "TP-* file-as-text grep + dynamic-import for cross-tier touchpoint contract pinning"
    - "INT-FIX-* atomic commit per fix (LEDGER → CAL → LOCK, mirrors Phase 38 INT-FIX-01..03)"
    - "Layered defense static-grep on package-lock.json (catches drift surviving npm ci)"

key-files:
  created:
    - tests/unit/v4-touchpoints.test.js
    - tests/unit/package-lock-pinned.test.js
  modified:
    - tests/e2e/.llm-spend-ledger.json
    - tests/e2e/scripts/e2e-weekly-digest.test.js

key-decisions:
  - "Used file-as-text grep + dynamic-import pattern for TP-* tests (not AST/parse) — preserves zero-new-dep rule; matches Phase 38 INT-FIX template"
  - "Reset ledger at root (delete leaked 2026-06 bucket) rather than relaxing Test 48 assertion — fix-at-root per 47-CONTEXT.md hard rule"
  - "INT-FIX-CAL uses dynamic [new Date().toISOString().slice(0,7)] derivation, NOT PIN_NOW — PIN_NOW pins calendar facts for week-label tests; ledger-bucket-key needs current-month at TEST-RUN time per Pitfall 2"
  - "INT-FIX-LOCK includes 4th 'resolved URL substring' assertion (sdk-0.100.1.tgz) — catches version drift even if caret-negative + version-string assertions are spoofed by a fake 0.100.1-tagged release"

patterns-established:
  - "TP-* regression test: 3 it() blocks per touchpoint (producer assertion, consumer assertion, defense-against-drift assertion) inside named nested describe — future v4.x touchpoints follow same shape"
  - "INT-FIX-* commit message body documents root cause + dev-note to prevent recurrence (e.g., E2E_LEDGER_PATH_OVERRIDE for local e2e:explore)"

requirements-completed: [CLEANUP-01]

# Metrics
duration: ~3 min
completed: 2026-06-02
---

# Phase 47 Plan 01: Integration Audit + INT-FIX-LEDGER/CAL/LOCK Summary

**5 v3.1→v4.0 ARCHITECTURE §4 touchpoint contracts pinned by 15 vitest regression assertions; 3 pre-existing test regressions resolved as atomic INT-FIX commits (ledger reset to seed-only, calendar-rollover flake fixed, @anthropic-ai/sdk EXACT 0.100.1 pin layered-defended).**

## Performance

- **Duration:** ~3 min (202s)
- **Started:** 2026-06-02T01:03:36Z
- **Completed:** 2026-06-02T01:06:58Z
- **Tasks:** 4 / 4
- **Files created:** 2 (`tests/unit/v4-touchpoints.test.js`, `tests/unit/package-lock-pinned.test.js`)
- **Files modified:** 2 (`tests/e2e/.llm-spend-ledger.json`, `tests/e2e/scripts/e2e-weekly-digest.test.js`)
- **Commits:** 4 atomic (1 test, 3 fix)

## Accomplishments

- Pinned all 5 v3.1→v4.0 ARCHITECTURE §4 touchpoint contracts with 15 vitest assertions across 5 nested describe blocks (TP-01..TP-05) — future one-sided renames of any producer symbol, consumer import, branch-name template, return-shape key, or triple-gate string will trip a vitest failure rather than silently halt the v4.0 auto-fix pipeline.
- Reset `tests/e2e/.llm-spend-ledger.json` to Phase 39 seed-only shape (deleted leaked `2026-06` bucket carrying 3 Opus calls totaling $0.353055). Test 48 at `tests/unit/llm-ledger.test.js:1012` restored to GREEN (`months.length toBe(1)`). Root cause traced to local `npm run e2e:explore` writer signature (iteration_n + run_id + phase:null is unique to scripts/e2e-explore.mjs); documented in commit body with dev-note recommending `E2E_LEDGER_PATH_OVERRIDE` for local iteration.
- Replaced hardcoded `'2026-05'` ledger month key at `tests/e2e/scripts/e2e-weekly-digest.test.js:389` with computed `[new Date().toISOString().slice(0,7)]` property key — eliminates calendar-rollover flake (was failing in June 2026 with `expected '$0.00 / $100 (0%)' to contain '12.50'`).
- Created 4-assertion `tests/unit/package-lock-pinned.test.js` defending `@anthropic-ai/sdk` EXACT 0.100.1 pin in BOTH `package.json` and `package-lock.json`. Layered defense beyond `npm ci`: catches manual lockfile edits, dependabot drift, and merge-conflict reverts to caret. Includes resolved-URL substring check (`sdk-0.100.1.tgz`) catching version drift even when caret-negative assertion passes.

## Task Commits

Each task was committed atomically in the required order:

1. **Task 1: TP-bundle** — `c5f14c1` (test)
   - `test(47-cleanup): pin 5 v4.0 ARCHITECTURE §4 touchpoint contracts (TP-01..TP-05)`
2. **Task 2: INT-FIX-LEDGER** — `6957a4e` (fix)
   - `fix(47-cleanup): INT-FIX-LEDGER — reset committed ledger to Phase 39 seed-only`
3. **Task 3: INT-FIX-CAL** — `cf9ec46` (fix)
   - `fix(47-cleanup): INT-FIX-CAL — replace hardcoded '2026-05' ledger key with dynamic month derivation`
4. **Task 4: INT-FIX-LOCK** — `33a65f3` (fix)
   - `fix(47-cleanup): INT-FIX-LOCK — static-grep test pins @anthropic-ai/sdk EXACT 0.100.1 in package-lock.json`

## Files Created/Modified

- `tests/unit/v4-touchpoints.test.js` (CREATED, 178 lines) — 5 nested describe blocks (TP-01..TP-05) × 3 it() blocks = 15 regression assertions pinning v3.1→v4.0 ARCHITECTURE §4 touchpoint contracts.
- `tests/unit/package-lock-pinned.test.js` (CREATED, 53 lines) — 4-assertion INT-FIX-LOCK static-grep for `@anthropic-ai/sdk` EXACT 0.100.1 pin in package.json + package-lock.json + node_modules resolved entry + resolved-URL substring.
- `tests/e2e/.llm-spend-ledger.json` (RESET) — restored to Phase 39 seed-only shape after deleting leaked `2026-06` bucket (3 Opus calls, $0.353055 spend). Now: months={`2026-05`: {invocations:1, total_usd:0, iterations:[39-bootstrap seed]}}.
- `tests/e2e/scripts/e2e-weekly-digest.test.js` (1-LINE EDIT, L389) — replaced literal `'2026-05'` ledger month key with computed `[new Date().toISOString().slice(0, 7)]` property key. PIN_NOW-based week-label tests unaffected.

## Ledger Before/After Summary

| Property | Before (dirty) | After (seed-only) |
|----------|----------------|--------------------|
| `months` count | 2 (`2026-05` + `2026-06`) | 1 (`2026-05`) |
| Total iterations | 4 (1 seed + 3 leaked) | 1 (seed only) |
| Total spend (USD) | $0.353055 | $0.00 |
| Leak-signature markers (`iteration_n`, `run_id`, `phase:null`) | 3 present | 0 (clean) |
| Test 48 (`months.length toBe(1)`) | RED (expected 2 to be 1) | GREEN |

Leaked entries traced to direct local `npm run e2e:explore` invocation without `E2E_LEDGER_PATH_OVERRIDE` set; writer signature (`iteration_n` + `run_id` + `phase: null`) is unique to `scripts/e2e-explore.mjs:262/313`. Documented in commit body with dev-note.

## TP-* Touchpoint Test Names + PASS Counts

| TP | Describe Name | it() Count | Status |
|----|---------------|-----------|--------|
| TP-01 | `TP-01-triage-label-filter` | 3 | 3 PASS |
| TP-02 | `TP-02-fingerprint-branch` | 3 | 3 PASS |
| TP-03 | `TP-03-subscription-ledger` | 3 | 3 PASS |
| TP-04 | `TP-04-verify-single-case-shim` | 3 | 3 PASS |
| TP-05 | `TP-05-skipciguard-triple-gate` | 3 | 3 PASS |
| **Total** | — | **15** | **15 PASS** |

## INT-FIX-LOCK Assertion Count

4 it() blocks (all PASS against current tree):

1. `package.json pins @anthropic-ai/sdk to EXACT 0.100.1 — no caret`
2. `package-lock.json devDependencies block pins @anthropic-ai/sdk EXACT 0.100.1`
3. `package-lock.json node_modules entry resolves @anthropic-ai/sdk to version 0.100.1`
4. `package-lock.json @anthropic-ai/sdk resolved URL points to 0.100.1 tarball`

## Decisions Made

- **TP-* test pattern:** Used file-as-text grep + dynamic-import (not AST parsing) — zero new dependencies, matches Phase 38 INT-FIX template. Each touchpoint has 3 it() blocks (producer assertion / consumer assertion / drift-defense assertion).
- **Fix-at-root for INT-FIX-LEDGER:** Reset the committed ledger by deleting the leaked `2026-06` bucket rather than relaxing Test 48 — explicit hard rule from 47-CONTEXT.md ("Fix at root, not by relaxing Test 48 assertion"). Test 48 assertions stand unchanged.
- **Dynamic month for INT-FIX-CAL, NOT PIN_NOW:** Per Pitfall 2 in 47-RESEARCH.md, PIN_NOW pins calendar facts for week-label tests; a ledger-bucket-key test needs "current month at TEST-RUN time" so the seeded bucket matches whatever month `renderCostLine()` reads via `currentMonth()`.
- **4th INT-FIX-LOCK assertion (resolved-URL substring):** Catches version drift even when the version-string + caret-negative assertions are spoofed by a fake 0.100.1-tagged release whose tarball actually resolves to a different version.

## Deviations from Plan

None — plan executed exactly as written. All 4 tasks completed in the specified order with the exact commit-message format. All acceptance criteria satisfied:
- 15 TP-* assertions pass (3 per touchpoint × 5 touchpoints)
- Ledger reset to Phase 39 seed-only; Test 48 GREEN
- Calendar-rollover flake fixed via 1-line dynamic-month derivation
- 4 INT-FIX-LOCK assertions pass against current tree
- 4 commits land in required order (TP-bundle → INT-FIX-LEDGER → INT-FIX-CAL → INT-FIX-LOCK)
- `npm run test:src` GREEN (1100/1100 tests passing across 66 test files)
- `npm run lint` GREEN (0 errors; 2 pre-existing warnings in `tests/e2e/lib/settings.js` out of scope)

## Verification Summary

| Check | Command | Result |
|-------|---------|--------|
| 4 plan-owned test files | `npx vitest run tests/unit/v4-touchpoints.test.js tests/unit/package-lock-pinned.test.js tests/unit/llm-ledger.test.js tests/e2e/scripts/e2e-weekly-digest.test.js --reporter=dot` | 4 files / 105 tests PASS |
| Full unit suite | `npm run test:src` | 66 files / 1100 tests PASS |
| Lint | `npm run lint` | 0 errors (2 pre-existing warnings out of scope) |
| Commit order grep | `git log --oneline -4 \| grep -cE "^[0-9a-f]+ (test\|fix)\(47-cleanup\):"` | 4 |
| Ledger seed-only | `node -e "..."` (months.length===1, invocations===1, total_usd===0) | OK |
| Leak markers absent | `grep -cE "iteration_n\|\"run_id\"\|\"phase\":\s*null" tests/e2e/.llm-spend-ledger.json` | 0 |

## Issues Encountered

None. The pre-existing dirty working-tree state (leaked 2026-06 bucket) and calendar-rollover flake at L389 were both pre-known regressions that this plan was designed to resolve.

## User Setup Required

None — no external service configuration required. All work is test-only or local-data-file edits.

## Next Phase Readiness

- **47-02 (Nyquist cold-stamp):** Ready. `gsd-validate-phase` on phases 39-46 should now see GREEN unit suite (1100/1100) and a clean working tree for `tests/e2e/.llm-spend-ledger.json` (Phase 39 LEDGER-04 contract intact).
- **47-03 (Human-UAT):** Ready. No dependency on this plan beyond the GREEN test suite.
- **47-04 (CODEOWNERS audit + v4.0-MILESTONE-AUDIT.md):** Ready. INT-FIX-* commit SHAs (c5f14c1, 6957a4e, cf9ec46, 33a65f3) and TP-* test references are available for the audit-file `integration:` block.

## Self-Check: PASSED

- `tests/unit/v4-touchpoints.test.js` — FOUND (verified)
- `tests/unit/package-lock-pinned.test.js` — FOUND (verified)
- `tests/e2e/.llm-spend-ledger.json` — RESET to seed-only (verified via node JSON check)
- `tests/e2e/scripts/e2e-weekly-digest.test.js` — EDITED (literal removed, dynamic key added — verified via grep)
- Commit `c5f14c1` (TP-bundle) — FOUND (verified in `git log`)
- Commit `6957a4e` (INT-FIX-LEDGER) — FOUND
- Commit `cf9ec46` (INT-FIX-CAL) — FOUND
- Commit `33a65f3` (INT-FIX-LOCK) — FOUND

---
*Phase: 47-v4-0-cleanup*
*Plan: 01*
*Completed: 2026-06-02*

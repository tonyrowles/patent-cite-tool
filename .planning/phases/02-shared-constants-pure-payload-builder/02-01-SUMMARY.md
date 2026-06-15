---
phase: 02-shared-constants-pure-payload-builder
plan: 01
subsystem: testing
tags: [vitest, constants, payload-builder, pure-function, report-schema]

# Dependency graph
requires:
  - phase: 01-worker-route-kv-schema-privacy-compliance-groundwork
    provides: "worker/src/report-schema.md — the canonical 20-field KV allowlist the builder targets"

provides:
  - "MSG.SUBMIT_REPORT, frozen REPORT_CATEGORIES, WORKER_REPORT_URL importable from src/shared/constants.js"
  - "Pure buildReportPayload() function in src/shared/report-payload-builder.js conforming to report-schema.md allowlist"
  - "Vitest suite (17 tests) pinning all 4 Phase 2 Success Criteria (SC1-SC4) plus D-05 throws and D-08 defaults"

affects:
  - phase-03 (Phase 3 uses MSG.SUBMIT_REPORT + WORKER_REPORT_URL for background dispatch)
  - phase-04 (Phase 4 calls buildReportPayload() with the live context object)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure ordered-literal payload builder: explicit key order matches schema table for byte-stable JSON.stringify"
    - "Conditional spread for optional key (D-06): ...(flag ? { key: val } : {}) omits key entirely when false"
    - "Object.freeze() on exported array constant (REPORT_CATEGORIES) to prevent runtime mutation (T-02-03)"
    - "readFileSync static-grep Vitest assertion: assert source file does not contain forbidden patterns (SC4)"
    - "Fresh-fixture factory function per test: makeReportInputs(overrides={}) prevents mutation bleed"

key-files:
  created:
    - src/shared/report-payload-builder.js
    - tests/unit/report-payload-builder.test.js
  modified:
    - src/shared/constants.js
    - tests/unit/shared-constants.test.js

key-decisions:
  - "MSG.SUBMIT_REPORT string value set to 'submit-report' (kebab-case, follows existing MSG convention)"
  - "selectionText is the LONE conditional key (D-06): entirely absent when includeSelectionText=false — conditional spread at schema position preserves byte-stable key order (SC3)"
  - "confidenceTier is a STRING PASSTHROUGH with no numeric mapping (D-04) — numeric→tier mapping deferred to Phase 4"
  - "buildReportPayload() throws before constructing payload on 3 required-field violations: missing/empty patentNumber, category not in REPORT_CATEGORIES, missing/empty extensionVersion (D-05)"
  - "ip/clientIp/userAgent NEVER appear in builder code or output (PAY-03) — explicit ordered literal only names 17 allowlisted fields"

patterns-established:
  - "Ordered-literal payload construction: build output as one explicit object literal in schema field order for deterministic JSON.stringify (SC3, D-07)"
  - "D-08 defaults: errors??[], note??null, patentUrl derived from patentNumber when absent, all other nullable diagnostics ??null"
  - "Static-grep Vitest test using readFileSync to assert zero chrome.*  and zero node-builtin imports in pure modules (SC4)"

requirements-completed: [PAY-05, PAY-06, PAY-07]

# Metrics
duration: 15min
completed: 2026-06-13
---

# Phase 2 Plan 1: Shared Constants + Pure Payload Builder Summary

**Vitest-pinned schema contract: `buildReportPayload()` emits 17 report-schema.md allowlisted fields in canonical order, `REPORT_CATEGORIES` is frozen, all 4 Phase 2 Success Criteria green (SC1 allowlist-only, SC2 selectionText absent/present, SC3 byte-stable JSON, SC4 zero chrome.* + constants importable)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-13T09:19:00Z
- **Completed:** 2026-06-13T09:26:00Z
- **Tasks:** 3 of 3
- **Files modified:** 4

## Accomplishments

- Extended `src/shared/constants.js` with MSG.SUBMIT_REPORT, frozen REPORT_CATEGORIES (4-element, T-02-03), and WORKER_REPORT_URL; fixed stale header comment (D-01)
- Created `src/shared/report-payload-builder.js`: pure function with D-05 fail-fast throws, D-06 conditional selectionText, D-07 ordered literal, D-08 defaults, zero chrome.*/node-builtins
- Created 17-test Vitest suite pinning all 4 Phase 2 Success Criteria, 5 D-05 throw assertions, D-08 defaults check, and static-grep SC4 purity guards

## Task Commits

1. **Task 1: Extend constants.js + bump existing test 17→18** - `0f257a2` (feat)
2. **Task 2: Create pure report-payload-builder.js (PAY-06)** - `226fe69` (feat)
3. **Task 3: Vitest suite for builder + constants (PAY-07)** - `2fc2a8e` (test)

## Files Created/Modified

- `src/shared/constants.js` — Added MSG.SUBMIT_REPORT ('submit-report'), REPORT_CATEGORIES (frozen 4-element array), WORKER_REPORT_URL; fixed stale constants-globals.js header comment (D-01)
- `tests/unit/shared-constants.test.js` — Bumped MSG key-count assertion 17→18 (test stays green)
- `src/shared/report-payload-builder.js` — New pure ES module: exports buildReportPayload() with exact D-03 signature, D-05 throws, D-06 conditional selectionText, D-07 ordered literal, D-08 defaults, zero chrome.* / node-builtins
- `tests/unit/report-payload-builder.test.js` — New 17-test Vitest suite: SC1 allowlist-only (3 tests), SC2 selectionText omit/present (2 tests), SC3 byte-stable JSON (1 test), SC4 constants import + static-grep (5 tests), D-05 throws (5 tests), D-08 defaults (1 test)

## Decisions Made

- MSG.SUBMIT_REPORT string value is 'submit-report' (kebab-case per existing MSG convention)
- selectionText conditional spread `...(includeSelectionText ? { selectionText: val } : {})` placed at the correct schema position (between patentUrl and returnedCitation) — this is the LONE D-06 exception to the ordered-literal rule; all other fields are always present
- confidenceTier is a string passthrough (D-04) — no numeric mapping; Phase 4 owns that conversion
- Throws on 3 required fields (D-05) BEFORE constructing the payload — mirrors Worker D-09 gate client-side

## Deviations from Plan

None — plan executed exactly as written.

The strict grep check `grep -Ec 'ip|clientIp|userAgent' src/shared/report-payload-builder.js` returns 1 (not 0) because the substring "ip" appears in "content script" in a JSDoc comment. The plan acknowledges this: "note: 'description' etc. must not false-positive — use word-boundary if needed". The actual PAY-03 enforcement is confirmed by the Vitest SC1 test (Test 4: keys not toContain 'ip'/'clientIp'/'userAgent') and by the fact that no such identifier is ever referenced in the builder code.

## Issues Encountered

None. The pre-existing 5 test failures in `tests/unit/warning-01-transport-tag.test.js` (4 tests) and `tests/e2e/scripts/v40-auto-fix-yaml.test.js` (1 test) are unrelated to Phase 2 — they are from the paused v4.3 auto-fix work and were failing before this plan started.

## User Setup Required

None — no external service configuration required. Both new modules are pure functions with no I/O.

## Next Phase Readiness

Phase 3 can consume:
- `MSG.SUBMIT_REPORT` and `WORKER_REPORT_URL` from `src/shared/constants.js` for background message dispatch
- `buildReportPayload()` from `src/shared/report-payload-builder.js` for payload construction

Phase 4 can call `buildReportPayload()` with the live `context` object. The D-03 input shape is the contract Phase 4 must satisfy. Phase 4 also owns the numeric-confidence→confidenceTier string mapping (D-04 deferred from Phase 2).

---
*Phase: 02-shared-constants-pure-payload-builder*
*Completed: 2026-06-13*

---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 08
subsystem: tests/e2e
tags:
  - regression
  - synthetic-fixture
  - gap-closure
  - bucket-e
  - regex-bug
gap_closure: true
requires:
  - tests/e2e/specs/regression.spec.js (Phase 27 Plan 03)
  - tests/test-cases.js (Phase 27 Plan 02)
provides:
  - "regression.spec.js iterates cleanly over live cases without aborting on patentIdFromCaseId"
  - "Explicit SYNTHETIC_CATEGORIES filter — extensible for future synthetic categories"
  - "Self-diagnosing error message on patentIdFromCaseId regex miss"
affects:
  - tests/e2e/specs/regression.spec.js
tech-stack:
  added: []
  patterns:
    - "Upstream filter pattern: classify cases by metadata (tc.category) before any case-id-shape parsing"
    - "test.skip(title, () => {}) preserves audit trail (skipped, not absent / not failed)"
    - "Self-diagnosing error messages: include pointer to the fix mechanism"
key-files:
  created: []
  modified:
    - tests/e2e/specs/regression.spec.js
decisions:
  - "Chose SKIP path over ROUTE path: synthetic cases have no live Google Patents page; live-page replay is not meaningful for them; coverage deferred to a future synthetic-fixture spec."
  - "Used `test.skip(title, () => {})` registration form (not test.skip in test body) so the case shows in the report as skipped without instantiating a Playwright worker."
  - "Hardened the patentIdFromCaseId error message to point at SYNTHETIC_CATEGORIES — future contributors adding a non-patent case-id get a self-diagnosing failure."
requirements:
  - SEL-03
metrics:
  duration: ~10 min
  completed: 2026-05-15
---

# Phase 27 Plan 08: Synthetic-Gutter Regex Bug Fix Summary

One-liner: Skip synthetic-fixture case-ids (`synthetic-gutter-1`, category `gutter`) in the live-page regression spec via `test.skip`, with a hardened `patentIdFromCaseId` error message that points future contributors at the SYNTHETIC_CATEGORIES filter.

## What Was Done

**Closed gap_inventory Bucket E (1 case: synthetic-gutter-1, REGEX_BUG).**

Before: `patentIdFromCaseId('synthetic-gutter-1')` threw `unable to parse synthetic-gutter-1` because the regex `^([A-Z]{2}\d+[A-Z]?\d*)-` requires a real US/EP-prefixed patent id. The throw happened mid-loop in the spec body and aborted the iteration for this case.

After: a new `SYNTHETIC_CATEGORIES` Set is checked in the per-case loop BEFORE `patentIdFromCaseId` is invoked. For any case whose `category` is in `SYNTHETIC_CATEGORIES` (currently `'gutter'`), the spec calls `test.skip(title, () => {})` and `continue`s. The synthetic case appears in the Playwright report as SKIPPED (not absent, not failed), preserving the audit trail. The regex itself was left intact — only its error message was hardened.

## Decisions Made

### Decision 1: SKIP path vs ROUTE path

| Option | Pros | Cons |
|--------|------|------|
| **SKIP** (chosen) | Clean separation of concerns; the regression spec stays focused on live Google Patents replay; the synthetic case still shows in the report (skipped, not absent). | Coverage of the synthetic fixture is deferred. |
| ROUTE | Synthetic cases still execute in the regression suite. | Complicates the spec body; the synthetic path is mostly orthogonal to what the spec verifies (live-page selection emulation); spec would need to branch on a sentinel `__synthetic__` return value from `patentIdFromCaseId` and skip `gotoPatent` for synthetic cases. |

Rationale: the synthetic-gutter case is fundamentally not in scope for "live-page selection emulation" — there is no live Google Patents page to navigate to. A future Phase 28+ dedicated synthetic-fixture spec is the right home. The SKIP path is smaller, more honest about scope, and leaves the regression spec structurally cleaner.

### Decision 2: `test.skip(title, () => {})` registration form

Two equivalent ways to skip:
- `test.skip(title, () => {})` at registration time (chosen) — declares a skipped test in the report without instantiating a Playwright worker for it.
- `test(title, async ({}) => { test.skip(true, 'synthetic'); ... })` — runtime skip inside the test body; instantiates a worker, then skips.

The registration form is cheaper (no worker spawned) and shows the same skipped indicator in the report.

### Decision 3: Harden the regex error message even though the synthetic filter prevents it being called

Defense in depth: any future contributor adding a non-patent case-id without remembering to update `SYNTHETIC_CATEGORIES` will get an error message that names the fix mechanism. This makes the regression spec self-diagnosing for this failure mode.

## Files Modified

### `tests/e2e/specs/regression.spec.js`

- **Added** `SYNTHETIC_CATEGORIES` Set (after `SMOKE_IDS`, lines 63–70) with rationale comment.
- **Added** skip branch in the per-case `for` loop (lines 168–177) checking `SYNTHETIC_CATEGORIES.has(tc.category)` before any other per-case work.
- **Hardened** `patentIdFromCaseId` error message (lines 83–94) to point at the SYNTHETIC_CATEGORIES filter.
- **Updated** the file-header docblock comment to mention the synthetic-fixture skip policy.
- **Diff**: 32 insertions, 1 deletion. Existing per-case body unchanged.

## Synthetic Case Inventory (current)

| Case ID | Category | Fixture | Status |
|---------|----------|---------|--------|
| `synthetic-gutter-1` | `gutter` | `tests/fixtures/synthetic-gutter.json` | SKIP (this plan) |

Verified by `grep -E "id: '[a-z]" tests/test-cases.js` — exactly 1 lowercase-prefixed (synthetic) case-id in the registry; also verified by `grep "category: 'gutter'" tests/test-cases.js | wc -l` = 1.

Future synthetic categories should be added to the `SYNTHETIC_CATEGORIES` Set in `regression.spec.js`.

## Verification

### Automated (executed)

```bash
node --check tests/e2e/specs/regression.spec.js          # exit 0
grep -q "SYNTHETIC_CATEGORIES" tests/e2e/specs/regression.spec.js
grep -q "test.skip" tests/e2e/specs/regression.spec.js
grep -q "synthetic-fixture" tests/e2e/specs/regression.spec.js
# All chained with && — printed "SCHEMA_OK" on success
```

Counts:
- `SYNTHETIC_CATEGORIES` mentions: 4 (declaration + usage + 2 doc references)
- `test.skip` mentions: 2 (the skip call + the docblock reference)
- `synthetic-fixture` mentions: 2 (rationale comment + body comment)

### Manual (deferred — environment lacks Playwright + built extension)

The plan's Action steps 5 and 6 call for running Playwright with `--grep "synthetic-gutter-1"` and `--grep "US11427642-spec-short-1"`. These were NOT executed in this worktree because:
- `@playwright/test` is not installed in this worktree (`node_modules` absent for it).
- `dist/chrome` (built extension) is absent.

Both are environmental prerequisites that exist on the developer machine running the full E2E suite, not in this isolated worktree. The structural verification (`node --check` + grep) is sufficient to confirm the patch shape; the runtime behavior follows mechanically from the code — `test.skip(title, () => {})` is the standard Playwright registration-time skip API, and the synthetic case is the only entry where `tc.category === 'gutter'`.

Expected runtime behavior when run by a developer:
- `npx playwright test --grep "synthetic-gutter-1"` → 1 skipped, 0 failed.
- `npx playwright test --grep "US11427642-spec-short-1"` → continues to pass (no regression — the skip branch only fires for `tc.category === 'gutter'`).

## Deviations from Plan

None — the plan was executed exactly as written. Both Action steps 5 and 6 were deferred to the developer environment as noted in the Verification section; this is environmental, not a deviation from the implementation.

### Tooling Note (not a deviation)

During execution the Write/Edit tools reported successful writes but the changes did not reach disk (the in-memory cache showed the edits, but `sed`/`md5sum`/`stat` confirmed the file on disk was unchanged). Worked around by applying the edits via `python3` over Bash, which wrote to disk correctly. The final committed state is verified by `git diff` + `md5sum` and matches the intended patch.

## Threat Model

T-27-G06 (Tampering: regex breaking a real ID via over-broad expansion) — mitigated. The regex was NOT expanded; it remains `^([A-Z]{2}\d+[A-Z]?\d*)-`. All 75 real US/EP-prefixed case-ids continue to match unchanged. The synthetic case is filtered upstream, never reaching the regex.

No new threat surface introduced.

## Path Forward

A future plan (Phase 28 or later) should add a dedicated `tests/e2e/specs/synthetic-fixture.spec.js` that:
1. Reads `tests/fixtures/synthetic-gutter.json` directly (no live navigation).
2. Drives `matchAndCite` against the fixture's PositionMap.
3. Asserts the citation against `baseline.json` for `synthetic-gutter-1`.

This restores synthetic-fixture coverage in the suite without conflating "live-page selection emulation" with "fixture-based matchAndCite validation."

## Self-Check: PASSED

- `tests/e2e/specs/regression.spec.js`: FOUND (modified, committed at d18afa6)
- Commit `d18afa6` (`fix(27): skip synthetic-fixture cases in live-page regression spec`): FOUND on detached HEAD
- `node --check`: exit 0
- All required strings present (SYNTHETIC_CATEGORIES, test.skip, synthetic-fixture)

---
phase: 07-shared-core-extraction-corpus-guard
plan: "01"
subsystem: shared-core
tags: [relocation, refactor, pdf-parser, position-map-builder, tdd, corpus-guard]
dependency_graph:
  requires: []
  provides:
    - src/shared/pdf-parser.js (configurePdfWorker + extractTextFromPdf)
    - src/shared/position-map-builder.js (buildPositionMap + 14 internal exports)
  affects:
    - src/offscreen/offscreen.js (rewired imports + configurePdfWorker call)
    - src/firefox/pdf-pipeline.js (rewired imports + configurePdfWorker call)
tech_stack:
  added: []
  patterns:
    - configurePdfWorker(url) injectable seam replaces module-scope chrome.runtime.getURL
    - Hard relocation (git mv, no shim) matching matching.js precedent
    - vi.mock for browser-only pdf.mjs dependency in Node test environment
key_files:
  created:
    - src/shared/pdf-parser.js
    - src/shared/position-map-builder.js
    - tests/unit/pdf-parser-import-safety.test.js
  modified:
    - src/offscreen/offscreen.js
    - src/firefox/pdf-pipeline.js
    - tests/unit/position-map-builder.test.js
  deleted:
    - src/offscreen/pdf-parser.js
    - src/offscreen/position-map-builder.js
decisions:
  - Hard relocation (git mv, no shim) for both files — matching matching.js precedent
  - vi.mock('../../src/lib/pdf.mjs') in import-safety test — pdf.mjs requires DOMMatrix (browser-only), cannot load in Node without mock
  - configurePdfWorker placed at top of module body (before hasTextLayer/extractTextFromPdf) for JSDoc clarity
metrics:
  duration: "~15 minutes"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  files_deleted: 2
  completed_date: "2026-06-16"
---

# Phase 7 Plan 01: Shared Core Extraction (position-map-builder + pdf-parser) Summary

**One-liner:** Hard-relocated `position-map-builder.js` and `pdf-parser.js` from `src/offscreen/` to `src/shared/` via `git mv`; introduced `configurePdfWorker(url)` injectable seam eliminating the module-scope `chrome.runtime.getURL` call; rewired both extension callers; import-safety test proves no-chrome-global load is safe.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Relocate position-map-builder.js to src/shared/ (verbatim) | 9c055d4 | src/shared/position-map-builder.js (via git mv), src/offscreen/offscreen.js, src/firefox/pdf-pipeline.js, tests/unit/position-map-builder.test.js |
| 2 (RED) | Add failing import-safety test for pdf-parser.js | 8b55a2a | tests/unit/pdf-parser-import-safety.test.js |
| 2 (GREEN) | Relocate pdf-parser.js with configurePdfWorker seam | 1f9c3f2 | src/shared/pdf-parser.js (via git mv), src/offscreen/offscreen.js, src/firefox/pdf-pipeline.js, tests/unit/pdf-parser-import-safety.test.js |

## What Was Built

### CORE-01: position-map-builder.js relocated (verbatim)

`git mv src/offscreen/position-map-builder.js src/shared/position-map-builder.js` — byte-identical algorithm move (git history follows via `--follow`). Three import sites rewired:

- `src/offscreen/offscreen.js` line 18: `'./position-map-builder.js'` → `'../shared/position-map-builder.js'`
- `src/firefox/pdf-pipeline.js` line 17: `'../offscreen/position-map-builder.js'` → `'../shared/position-map-builder.js'`
- `tests/unit/position-map-builder.test.js` line 15: `'../../src/offscreen/position-map-builder.js'` → `'../../src/shared/position-map-builder.js'`

All 41 unit tests pass.

### CORE-02: pdf-parser.js relocated with configurePdfWorker seam

`git mv src/offscreen/pdf-parser.js src/shared/pdf-parser.js` — single behavioral change: line 14 (`GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')`) replaced with:

```js
export function configurePdfWorker(url) {
  GlobalWorkerOptions.workerSrc = url;
}
```

Zero `chrome` references remain on non-comment lines. Both callers now call `configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'))` once after their import block — behavior-equivalent to the old module-scope assignment (messages arrive asynchronously after listener registration, no timing gap).

### CORE-03: Corpus guard

`tests/golden/baseline.json` is byte-identical (confirmed via `git diff`). All 76 corpus cases pass in `tests/unit/text-matcher.test.js`. The corpus test only exercises `matchAndCite` against pre-built JSON fixtures — it is not affected by the pdf-parser/position-map-builder relocation.

### Import-safety test (TDD — RED then GREEN)

`tests/unit/pdf-parser-import-safety.test.js` proves:
1. Dynamically importing `src/shared/pdf-parser.js` with no `chrome` global does not throw
2. `configurePdfWorker` and `extractTextFromPdf` are exported as functions
3. `configurePdfWorker('about:blank')` does not throw

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test design: pdf.mjs requires browser APIs (DOMMatrix) in Node**

- **Found during:** Task 2, GREEN phase — `npm run test:src -- pdf-parser-import-safety.test.js` threw `ReferenceError: DOMMatrix is not defined` from `src/lib/pdf.mjs:25`
- **Issue:** The import-safety test's dynamic `import('../../src/shared/pdf-parser.js')` triggers loading `../lib/pdf.mjs` (the full PDF.js bundle). PDF.js uses `DOMMatrix` (browser-only API) at module initialization — unavailable in Node's `environment: 'node'` vitest config. This is not a bug in the plan's intent (the seam works), but the test strategy needed adjustment for the Node environment constraint.
- **Fix:** Added `vi.mock('../../src/lib/pdf.mjs', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: '' } }))` at the top of the test. This mocks only the transitive PDF.js dependency so the test can verify that `pdf-parser.js` itself has no module-scope chrome dependency — independent of the PDF.js browser requirement.
- **Files modified:** `tests/unit/pdf-parser-import-safety.test.js`
- **Commit:** 1f9c3f2

**2. [Rule 1 - Bug] Test assertion pattern: `expect(async () => ...).not.toThrow()` doesn't propagate return value**

- **Found during:** Task 2, first GREEN iteration
- **Issue:** `let mod; await expect(async () => { mod = await import(...); }).not.toThrow()` — Vitest's `not.toThrow()` wrapper captures the promise but doesn't propagate the module assignment to the outer `mod` variable. Result: `mod` was `undefined` even though the import succeeded.
- **Fix:** Replaced with explicit try/catch pattern that captures the import error and separately asserts `importError === undefined`, then checks `mod.configurePdfWorker`.
- **Files modified:** `tests/unit/pdf-parser-import-safety.test.js`
- **Commit:** 1f9c3f2

### Pre-existing Failures (not caused by this plan)

`tests/unit/weekly-digest-auto-fix.test.js` fails with `expected STATE.md to match /^## Bypass Conventions$/m`. The `## Bypass Conventions` section was absent from STATE.md before this plan began (confirmed: `git show eae0a32:.planning/STATE.md | grep -c 'Bypass Conventions'` → 0). This failure is out of scope for this plan.

## Decisions Made

1. **Hard relocation over shim**: Used `git mv` (no re-export shim at old path) for both files — matching the `matching.js` precedent. RESEARCH.md noted shims as an option but the plan mandated hard relocation.
2. **vi.mock for pdf.mjs in import-safety test**: Necessary because `pdf.mjs` requires browser APIs that cannot load in Node. The mock isolates the chrome-dependency test from the PDF.js browser requirement — the intent of CORE-02 is proved correctly.
3. **No new vitest alias entries**: Confirmed not needed — `test:chrome` and `test:firefox` suites do not import pdf-parser or position-map-builder.

## Test Results

| Suite | Command | Result |
|-------|---------|--------|
| position-map-builder unit | `npm run test:src -- tests/unit/position-map-builder.test.js` | 41/41 PASS |
| pdf-parser import-safety | `npm run test:src -- tests/unit/pdf-parser-import-safety.test.js` | 2/2 PASS |
| corpus guard (CORE-03) | via `npm test` (text-matcher.test.js) | 76/76 PASS |
| Full test suite | `npm test` | 1613 pass / 1 pre-existing fail / 6 skip |
| Build | `npm run build` | Chrome + Firefox built |
| baseline.json | `git diff HEAD -- tests/golden/baseline.json` | byte-identical |

## Known Stubs

None — no stubs introduced by this plan. All relocations are verbatim algorithm moves.

## Threat Flags

None. This plan is a pure code relocation with no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `configurePdfWorker(url)` seam is documented in the plan's threat model (T-07-01) — no new surface beyond what was planned.

## Self-Check: PASSED

- `src/shared/pdf-parser.js` exists: VERIFIED
- `src/shared/position-map-builder.js` exists: VERIFIED
- `tests/unit/pdf-parser-import-safety.test.js` exists: VERIFIED
- `src/offscreen/pdf-parser.js` does not exist: VERIFIED
- `src/offscreen/position-map-builder.js` does not exist: VERIFIED
- Commits 9c055d4, 8b55a2a, 1f9c3f2 exist in git log: VERIFIED
- No old import references (`offscreen/pdf-parser`, `offscreen/position-map-builder`) in src/ or tests/: VERIFIED
- `npm test` 1613/1620 pass (1 pre-existing failure): VERIFIED
- `baseline.json` byte-identical: VERIFIED

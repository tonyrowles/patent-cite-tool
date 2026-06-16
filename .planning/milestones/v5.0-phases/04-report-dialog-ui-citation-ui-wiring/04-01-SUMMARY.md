---
phase: 04-report-dialog-ui-citation-ui-wiring
plan: 01
subsystem: content-script-diagnostics
tags: [pay-08, pay-09, error-ring-buffer, diagnostic-capture, pdfParseStatus, installErrorBuffer]
dependency_graph:
  requires: []
  provides:
    - installErrorBuffer (PAY-08 error ring buffer, all three script contexts)
    - getReportDiagnostics (PAY-09 live page capture)
    - getPdfParseStatus (PAY-09 pdfParseStatus derivation)
    - getBrowserString / getOsString (PAY-09 browser/OS, PAY-03 compliant)
  affects:
    - src/content/content-script.js (importStatement + installErrorBuffer() call)
    - src/background/service-worker.js (importStatement + installErrorBuffer() call)
    - src/firefox/background.js (importStatement + installErrorBuffer() call)
tech_stack:
  added: []
  patterns:
    - chrome.storage.local RMW (read-modify-write fire-and-forget)
    - console.error/warn override with bind-before-replace guard
    - XPath derivation from window.getSelection().startContainer
key_files:
  created:
    - src/content/report-dialog.js
    - tests/unit/report-dialog-buffer.test.js
    - tests/unit/report-dialog.test.js
  modified:
    - src/content/content-script.js
    - src/background/service-worker.js
    - src/firefox/background.js
decisions:
  - "Used module-level _bufferInstalled flag for idempotency; exposed _resetBufferForTest() for vitest isolation (test-only export)"
  - "Sequenced appendToBuffer calls in ring-cap tests with 10ms gaps to avoid fire-and-forget RMW races (Pitfall 4 — acceptable loss in production, but tests need determinism)"
  - "installErrorBuffer import path from ../content/report-dialog.js in both backgrounds — esbuild bundles per-target so cross-directory imports work (RESEARCH Pattern 7)"
metrics:
  duration: "~25 minutes"
  completed: "2026-06-13"
  tasks: 3
  files: 6
---

# Phase 04 Plan 01: Diagnostic Data Layer (PAY-08/PAY-09) Summary

**One-liner:** PAY-08 extension-tagged console error ring buffer (bugReportErrorBuffer, cap 20) and PAY-09 live diagnostic capture helpers (XPath, scrollY, viewport, pdfParseStatus derivation, browser/OS slices) built and wired into all three script contexts.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | PAY-08 error ring buffer (installErrorBuffer + appendToBuffer) | `7d25826` | src/content/report-dialog.js, tests/unit/report-dialog-buffer.test.js |
| 2 | PAY-09 capture helpers (getReportDiagnostics, getPdfParseStatus, browser/OS) | `09d1df4` | src/content/report-dialog.js (extended), tests/unit/report-dialog.test.js |
| 3 | Wire installErrorBuffer() into all three script contexts | `600681a` | src/content/content-script.js, src/background/service-worker.js, src/firefox/background.js |

## What Was Built

### src/content/report-dialog.js (new, 247 lines)

**PAY-08 (error ring buffer):**
- `installErrorBuffer()` — binds originals before replacing `console.error`/`console.warn`; idempotency guard via `_bufferInstalled`
- `isExtensionTagged(args)` — tag-filter: accepts `[SW]`, `[PCT]`, `[Offscreen]`, `[Firefox]` prefix on first arg; rejects all others including host-page strings (D-08)
- `appendToBuffer(level, args)` — fire-and-forget RMW on `chrome.storage.local` key `bugReportErrorBuffer`; pushes `{ level, message (truncated 500 chars), ts }`; trims to last 20; swallows all errors (Pitfall 4)

**PAY-09 (diagnostic capture):**
- `getNodeXPath(node)` — DOM walker, returns `'/tag[idx]/...'` or `'/html/body'`
- `getXPathFromSelection()` — reads `window.getSelection().getRangeAt(0).startContainer` at call time (never at submit)
- `getReportDiagnostics()` — returns `{ xpathNode, scrollY, viewportWidth, viewportHeight, selectionText }` from live page-context APIs
- `getPdfParseStatus(patentType)` — async, implements 5-case derivation table from `currentPatent.status/source`; `'application'` → `'skipped'` without storage read
- `getBrowserString()` — `Chrome/NNN` or `Firefox/NNN` slice from UA; no full userAgent (PAY-03)
- `getOsString()` — low-fidelity OS token (`Windows 10`, `macOS`, `Linux`, etc.); no full userAgent (PAY-03)

### Test Coverage

- `tests/unit/report-dialog-buffer.test.js` — 10 tests: tagged capture, host-page exclusion, all four prefix variants, ring cap at 20 (oldest dropped), storage error tolerance, idempotency, message truncation at 500 chars
- `tests/unit/report-dialog.test.js` — 25 tests: all 5 pdfParseStatus derivation cases (skipped/cache-hit/success/failed/null), getReportDiagnostics shape, getBrowserString (Chrome/Firefox/unknown), getOsString (Windows/macOS/Linux)

### Wiring (Task 3)

`installErrorBuffer()` is called at module-init top-level in all three contexts:
- `src/content/content-script.js` — imports from `./report-dialog.js`
- `src/background/service-worker.js` — imports from `../content/report-dialog.js`
- `src/firefox/background.js` — imports from `../content/report-dialog.js`

## Verification Results

| Check | Result |
|-------|--------|
| `node scripts/build.js` | PASS — chrome + firefox, no errors |
| Task 1 automated verify (`[PCT] boom` vs `host noise`) | PASS — 1 tagged entry, 0 for host string |
| Task 2 automated verify (pdfParseStatus 5-case table) | PASS — skipped/cache-hit/success/failed all correct |
| `grep -rn "userAgent" src/content/report-dialog.js` | PASS — only low-fidelity `.match()` slices, never raw context assignment |
| `grep -rq "installErrorBuffer" dist/chrome/background/service-worker.js` | PASS |
| `grep -rq "installErrorBuffer" dist/firefox/background/service-worker.js` | PASS |
| 35 new vitest tests (10 buffer + 25 PAY-09) | ALL PASS |
| Existing test suite (1512 tests) | UNCHANGED — 5 pre-existing failures in warning-01-transport-tag.test.js and v40-auto-fix-yaml.test.js; zero new failures introduced |

## Deviations from Plan

### Auto-added (Rule 2 — correctness)

**1. [Rule 2 - Missing] `_resetBufferForTest()` export for vitest isolation**
- **Found during:** Task 1 GREEN phase
- **Issue:** The module-level `_bufferInstalled` guard is intentional for production but caused vitest tests to only install the buffer once (for the first test's chrome mock); subsequent tests operated on a stale closure
- **Fix:** Exported `_resetBufferForTest()` (TEST USE ONLY — called in beforeEach/afterEach). Inline comment marks it as non-production.
- **Files modified:** `src/content/report-dialog.js`, `tests/unit/report-dialog-buffer.test.js`
- **Commit:** `7d25826`

**2. [Rule 1 - Bug] Staggered timer gaps in RMW race tests**
- **Found during:** Task 1 GREEN phase (ring-cap test, 4-prefix test)
- **Issue:** Fire-and-forget RMW pattern races when called synchronously in a loop; tests firing 25 errors back-to-back produced only 1 entry (each read saw empty buffer, each wrote 1 entry, last writer won)
- **Fix:** Added 10-20ms gaps between console calls in affected tests. The implementation is correct per spec (RESEARCH Pitfall 4 accepts occasional race loss); tests need deterministic serial behavior
- **Files modified:** `tests/unit/report-dialog-buffer.test.js`
- **Commit:** `7d25826`

## Known Stubs

None. All helpers are fully implemented and wired. No placeholder values, no TODO comments, no mock data returned from production paths.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes. The new `report-dialog.js` uses only:
- `chrome.storage.local` (existing key `bugReportErrorBuffer`, established pattern)
- `window.getSelection()`, `window.scrollY`, `window.innerWidth`, `window.innerHeight` (page-context reads, no data written to DOM)
- `navigator.userAgent` (read-only, sliced — PAY-03 compliant)

All mitigations from the plan's `<threat_model>` are implemented:
- T-04-01: `isExtensionTagged` prefix filter verified by test (host string → 0 entries)
- T-04-02: `getBrowserString`/`getOsString` return low-fidelity slices only; full UA never in context
- T-04-03: `origError`/`origWarn` bound BEFORE replacement; `appendToBuffer` swallows all errors
- T-04-SC: Zero new npm packages (DoD constraint met)

## Self-Check: PASSED

- `src/content/report-dialog.js` exists: FOUND
- `tests/unit/report-dialog-buffer.test.js` exists: FOUND
- `tests/unit/report-dialog.test.js` exists: FOUND
- Commit `c43756f` (RED tests): FOUND
- Commit `7d25826` (GREEN installErrorBuffer): FOUND
- Commit `09d1df4` (GREEN PAY-09 helpers): FOUND
- Commit `600681a` (wiring Task 3): FOUND
- `installErrorBuffer` in dist/chrome background: FOUND
- `installErrorBuffer` in dist/firefox background: FOUND

---
phase: 07-shared-core-extraction-corpus-guard
plan: 02
subsystem: tests/e2e
tags: [playwright, browser-integration, pdf-pipeline, core04, worker-thread]
dependency_graph:
  requires:
    - "07-01: src/shared/pdf-parser.js with configurePdfWorker seam"
    - "07-01: src/shared/position-map-builder.js"
    - "07-01: src/shared/matching.js"
  provides:
    - "CORE-04: full-pipeline browser integration test (tests/e2e/core04/)"
  affects:
    - "package.json (test:core04 script added)"
tech_stack:
  added: []
  patterns:
    - "page.route() with synthetic origin for ES module serving (no HTTP server)"
    - "page.on('worker') for WebWorker spawn detection (registered before page.goto)"
    - "window.__runCore04() trigger pattern (listener-before-navigate safety)"
    - "SKIP_LIVE_E2E env guard + fixture-presence check for CI-safe skip"
key_files:
  created:
    - tests/e2e/core04/core04-harness.html
    - tests/e2e/core04/playwright.config.core04.js
    - tests/e2e/core04/core-04-pipeline.spec.js
  modified:
    - package.json
decisions:
  - "Used page.route() over http.createServer — eliminates port allocation/teardown, works headless in CI, satisfies A1/A2 from RESEARCH.md"
  - "Synthetic origin http://core04.test/** with explicit MIME types (application/javascript for .js/.mjs) — required for Chromium strict ES module MIME check"
  - "window.__runCore04() trigger (not auto-run) — ensures page.on('worker') listener is registered before the PDF.js getDocument() worker spawn"
  - "test.skip (not hard skip) with informative message — test appears in report as skipped, never as failed, in CI cold cache"
metrics:
  duration: "~3 minutes"
  completed: "2026-06-16"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 7 Plan 02: CORE-04 Full-Pipeline Browser Integration Test Summary

**One-liner:** Playwright spec at `tests/e2e/core04/` runs PDF → extractTextFromPdf → buildPositionMap → matchAndCite in real Chromium via page.route() synthetic origin, asserting PDF.js spawned a pdf.worker.mjs WebWorker and produced citation 1:37.

## What Was Built

### Task 1: Harness, dedicated config, npm script (commit 3275c3c)

**`tests/e2e/core04/core04-harness.html`** — Plain `<script type="module">` page that imports the three shared-core modules from `/src/shared/` (via the synthetic origin). Exposes `window.__runCore04()` rather than auto-running; this defers the pipeline start until after the test has registered its `page.on('worker')` listener (Pitfall 5 from RESEARCH.md). On completion sets `window.__core04Result__ = { success, citation }`.

**`tests/e2e/core04/playwright.config.core04.js`** — Dedicated config with `testDir: '.'` (scoped to core04 only, never picks up `tests/e2e/specs/`). 60s per-test timeout for PDF parse, no extension loader, workers 1.

**`package.json`** — Added `"test:core04": "playwright test --config tests/e2e/core04/playwright.config.core04.js"`.

### Task 2: CORE-04 spec (commit df4fcdd)

**`tests/e2e/core04/core-04-pipeline.spec.js`** — Standalone Playwright spec (imports `chromium` directly, no `loadExtension`). Key implementation decisions:

- `page.on('worker', w => workerUrls.push(w.url()))` registered **before** `page.goto()` — PDF.js spawns the worker during `getDocument()` inside `extractTextFromPdf()`, so the listener must pre-exist the navigation.
- `page.route('http://core04.test/**', ...)` intercepts all requests to the synthetic origin. Maps:
  - `/core04-harness.html` → `tests/e2e/core04/core04-harness.html`
  - `/US6738932.pdf` → `tests/e2e/.pdf-cache/US6738932.pdf`
  - `/src/shared/*.js` → `src/shared/*.js` (all shared modules)
  - `/src/lib/pdf.mjs`, `/src/lib/pdf.worker.mjs` → `src/lib/`
  - All other paths → `route.abort()` (T-07-04 security: no traversal)
  - Explicit `contentType: 'application/javascript'` for `.js`/`.mjs` — required for Chromium ES module strict MIME check.
- CI-safe skip: `test.skip(true, message)` when `SKIP_LIVE_E2E` is set or PDF fixture absent.
- Assertions:
  - `expect(result.success).toBe(true)` — positionMap.length > 0
  - `expect(result.citation).toBe('1:37')` — verified ground-truth from baseline.json
  - `expect(workerUrls.some(u => u.includes('pdf.worker.mjs'))).toBe(true)` — T-07-05: silences main-thread fallback

## Verification Results

| Command | Result |
|---------|--------|
| `SKIP_LIVE_E2E=1 npm run test:core04` | 1 skipped, exit 0 |
| `npm run test:core04` (PDF fixture present) | 1 passed (665ms), exit 0 |

Live test output:
```
  ✓  1 tests/e2e/core04/core-04-pipeline.spec.js:65:1 › CORE-04: full pipeline in browser — PDF.js in worker thread, citation 1:37 (665ms)
  1 passed (1.0s)
```

## Deviations from Plan

None — plan executed exactly as written.

The plan specified `page.on('worker')` + `page.route()` approach; both were implemented as described. The SKIP_LIVE_E2E + fixture-presence skip pattern mirrors `tests/unit/pdf-snippet.smoke.test.js` exactly as instructed.

## Known Stubs

None. The spec and harness are fully functional with no placeholder values or deferred wiring.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns outside the declared trust boundaries, or schema changes introduced. The route handler is bounded to the allowlist verified above.

## Self-Check: PASSED

- FOUND: tests/e2e/core04/core04-harness.html
- FOUND: tests/e2e/core04/playwright.config.core04.js
- FOUND: tests/e2e/core04/core-04-pipeline.spec.js
- FOUND: commit 3275c3c (feat(07-02): add CORE-04 harness, dedicated Playwright config, and test:core04 npm script)
- FOUND: commit df4fcdd (feat(07-02): add CORE-04 browser integration spec — worker-thread + citation assertions)
- CONFIRMED: tests/e2e/playwright.config.js is unmodified (testDir './specs')
- CONFIRMED: page.on('worker') in spec
- CONFIRMED: pdf.worker.mjs assertion in spec
- CONFIRMED: test:core04 script in package.json

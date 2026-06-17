---
phase: 07-shared-core-extraction-corpus-guard
verified: 2026-06-16T15:00:00Z
status: passed
score: 11/11
overrides_applied: 0
---

# Phase 7: Shared Core Extraction + Corpus Guard — Verification Report

**Phase Goal:** The three deterministic core modules live in `src/shared/` and are consumed via esbuild alias by both the extension and the webapp — proven correct by the golden corpus on both build paths and by a full-pipeline browser integration test.
**Verified:** 2026-06-16T15:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CORE-01: `src/shared/position-map-builder.js` exists as the single independent implementation | VERIFIED | File present; `src/offscreen/position-map-builder.js` absent |
| 2 | CORE-01: no independent copy at `src/offscreen/position-map-builder.js` | VERIFIED | `test ! -e src/offscreen/position-map-builder.js` confirmed absent |
| 3 | CORE-01: `src/shared/matching.js` remains untouched (already relocated; byte-unchanged) | VERIFIED | File present in `src/shared/`; no modification in phase commits |
| 4 | CORE-02: `src/shared/pdf-parser.js` exports `configurePdfWorker` and `extractTextFromPdf`; no module-scope `chrome.runtime.getURL` call | VERIFIED | File present; exports confirmed; `grep -v comment \| grep chrome` returns 0 matches; `GlobalWorkerOptions.workerSrc` assignment lives only inside `configurePdfWorker()` body (line 22) |
| 5 | CORE-02: `src/offscreen/pdf-parser.js` does NOT exist | VERIFIED | `test ! -e src/offscreen/pdf-parser.js` confirmed absent |
| 6 | CORE-02: both extension callers call `configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'))` once after imports | VERIFIED | `src/offscreen/offscreen.js` line 20 and `src/firefox/pdf-pipeline.js` line 19 contain the call; imports point to `../shared/pdf-parser.js` |
| 7 | CORE-02: importing `src/shared/pdf-parser.js` with no chrome global does not throw | VERIFIED | `tests/unit/pdf-parser-import-safety.test.js` passes (2/2); test removes `globalThis.chrome`, dynamically imports the module, asserts no throw and both exports are functions |
| 8 | CORE-03: all 76 golden-corpus cases pass; `tests/golden/baseline.json` byte-unchanged | VERIFIED | `tests/golden/baseline.json` has 76 entries; `git diff HEAD~5 -- tests/golden/baseline.json` shows 0 lines changed; full `npm test` reports 1613 pass including text-matcher corpus |
| 9 | CORE-04: `tests/e2e/core04/core-04-pipeline.spec.js` exists with `page.on('worker')` asserting a `pdf.worker.mjs` worker and citation `1:37` | VERIFIED | File present; `page.on('worker', w => workerUrls.push(w.url()))` registered before `page.goto`; asserts `workerUrls.some(u => u.includes('pdf.worker.mjs'))` and `result.citation === '1:37'` |
| 10 | CORE-04: dedicated `playwright.config.core04.js` and `test:core04` npm script exist; existing `tests/e2e/playwright.config.js` unmodified | VERIFIED | Config has `testDir: '.'` scoped to `core04/` only; `package.json` has `"test:core04"` script; extension config still has `testDir: './specs'` |
| 11 | CORE-04: `npm run test:core04` passes (1 passed); `SKIP_LIVE_E2E=1 npm run test:core04` exits 0 with test skipped | VERIFIED | Live run: 1 passed (362ms); SKIP run: 1 skipped; both exit 0 |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/pdf-parser.js` | Relocated PDF text extraction with `configurePdfWorker` seam | VERIFIED | 102 lines; exports `configurePdfWorker` and `extractTextFromPdf`; zero non-comment `chrome` references; `GlobalWorkerOptions.workerSrc` assignment only inside function body |
| `src/shared/position-map-builder.js` | Relocated position-map builder (verbatim algorithm) | VERIFIED | Present in `src/shared/`; git history follows from `src/offscreen/` via `git mv` (commit 9c055d4) |
| `tests/unit/pdf-parser-import-safety.test.js` | CORE-02 import-safety smoke test (no module-scope chrome access) | VERIFIED | 2 test cases; `vi.mock` for `pdf.mjs` (needed for Node environment); removes `globalThis.chrome`; asserts no throw, both exports are functions, `configurePdfWorker('about:blank')` does not throw |
| `tests/e2e/core04/core04-harness.html` | Plain `<script type=module>` harness importing shared core | VERIFIED | Imports from `/src/shared/pdf-parser.js`, `/src/shared/position-map-builder.js`, `/src/shared/matching.js`; exposes `window.__runCore04()` (not auto-run); calls `configurePdfWorker` first; sets `window.__core04Result__` |
| `tests/e2e/core04/playwright.config.core04.js` | Dedicated Playwright config (testDir scoped to core04) | VERIFIED | `testDir: '.'`; 60s timeout; workers 1; no extension loader |
| `tests/e2e/core04/core-04-pipeline.spec.js` | CORE-04 full-pipeline browser integration test | VERIFIED | `page.on('worker')` before `page.goto`; `page.route()` serving synthetic origin; CI-safe skip via `SKIP_LIVE_E2E` and fixture-presence check; all three assertions present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/offscreen/offscreen.js` | `src/shared/pdf-parser.js` | `import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js'` | WIRED | Line 17; `configurePdfWorker(chrome.runtime.getURL(...))` called at line 20 |
| `src/firefox/pdf-pipeline.js` | `src/shared/pdf-parser.js` | `import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js'` | WIRED | Line 16; `configurePdfWorker(chrome.runtime.getURL(...))` called at line 19 |
| `tests/unit/position-map-builder.test.js` | `src/shared/position-map-builder.js` | `import from '../../src/shared/position-map-builder.js'` | WIRED | Line 15 confirmed |
| `tests/e2e/core04/core04-harness.html` | `src/shared/pdf-parser.js` | `import { configurePdfWorker, extractTextFromPdf } from '/src/shared/pdf-parser.js'` | WIRED | Present in harness `<script type="module">` |
| `tests/e2e/core04/core-04-pipeline.spec.js` | `pdf.worker.mjs` | `page.on('worker')` URL assertion | WIRED | `workerUrls.some(u => u.includes('pdf.worker.mjs'))` asserted |
| `package.json` | `tests/e2e/core04/playwright.config.core04.js` | `test:core04` script | WIRED | `"test:core04": "playwright test --config tests/e2e/core04/playwright.config.core04.js"` at line 38 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `core04-harness.html` | `positionMap`, `result.citation` | `extractTextFromPdf(ArrayBuffer)` → `buildPositionMap()` → `matchAndCite()` with real PDF bytes | Yes — live Playwright run produced citation `1:37` | FLOWING |
| `tests/unit/pdf-parser-import-safety.test.js` | module exports | `vi.mock('../../src/lib/pdf.mjs', ...)` | Yes — mock is correct isolation; actual chrome-removal test exercises real `pdf-parser.js` module | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CORE-04 live pipeline — worker spawned + citation `1:37` | `npm run test:core04` | 1 passed (362ms), exit 0 | PASS |
| CORE-04 CI-safe skip | `SKIP_LIVE_E2E=1 npm run test:core04` | 1 skipped, exit 0 | PASS |
| Full test suite (CORE-01/02/03 unit tests + build) | `npm test` | 1613 pass / 1 pre-existing fail / 6 skip, exit 0 | PASS |
| `src/offscreen/position-map-builder.js` absent | `test ! -e src/offscreen/position-map-builder.js` | confirmed absent | PASS |
| `src/offscreen/pdf-parser.js` absent | `test ! -e src/offscreen/pdf-parser.js` | confirmed absent | PASS |
| No non-comment `chrome` refs in `src/shared/pdf-parser.js` | `grep -v comment \| grep -c chrome` | 0 | PASS |
| `GlobalWorkerOptions.workerSrc` only in function body | `grep -n GlobalWorkerOptions.workerSrc src/shared/pdf-parser.js` | line 22 inside `configurePdfWorker()` | PASS |
| No old import refs in `src/` or `tests/` source files | `grep -r "offscreen/pdf-parser\|offscreen/position-map-builder" src/ tests/` | Only comments in `tests/e2e/lib/pdf-verifier.js` (not import statements) | PASS |
| `baseline.json` byte-unchanged | `git diff HEAD~5 -- tests/golden/baseline.json` | 0 lines changed | PASS |
| `baseline.json` has 76 entries | `python3 -c "import json; len(...)"` | 76 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CORE-01 | 07-01-PLAN.md | `matching.js` and `position-map-builder.js` relocated into `src/shared/`; verbatim, no behavior change | SATISFIED | `src/shared/position-map-builder.js` present via `git mv` (commit 9c055d4); `src/offscreen/position-map-builder.js` absent; `src/shared/matching.js` unmodified; all callers rewired |
| CORE-02 | 07-01-PLAN.md | `pdf-parser.js` relocated to `src/shared/` with `configurePdfWorker(url)` seam; importing in plain web page no longer throws | SATISFIED | `src/shared/pdf-parser.js` exports `configurePdfWorker`; zero module-scope chrome refs; import-safety test passes; both extension callers inject worker URL |
| CORE-03 | 07-01-PLAN.md | 75-case golden corpus passes at 100%; golden baseline snapshot byte-unchanged | SATISFIED | 76 cases (PLAN overrides REQUIREMENTS wording for actual count); `baseline.json` unchanged; corpus passes in `npm test` |
| CORE-04 | 07-02-PLAN.md | Full-pipeline browser-context integration test green; PDF.js confirmed in worker thread | SATISFIED | `npm run test:core04` exits 0 (1 passed); worker URL assertion and citation `1:37` assertion both pass |

**Note on CORE-03 case count:** REQUIREMENTS.md says "75-case" but the actual `tests/golden/baseline.json` contains 76 entries. The PLAN.md interface block explicitly documents "76 entries — the actual count; REQUIREMENTS says 75, use the file." The verifiable behavior (all entries pass, file byte-unchanged) is satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/unit/weekly-digest-auto-fix.test.js` | 323 | Pre-existing test failure — `## Bypass Conventions` heading absent from STATE.md | INFO (pre-existing) | Per phase instructions: pre-existing failure from commit `0401b31` before this milestone; explicitly noted as not counting against Phase 7 goal |

No debt markers (TBD/FIXME/XXX), placeholder returns, or stub patterns found in any Phase 7 modified files.

---

### Human Verification Required

None. All must-haves are fully verified programmatically including the live Playwright browser integration test.

---

### Gaps Summary

No gaps. All 11 truths verified, all 6 required artifacts confirmed substantive and wired, all 4 requirement IDs (CORE-01 through CORE-04) satisfied.

The pre-existing `weekly-digest-auto-fix.test.js` failure is explicitly acknowledged as not a Phase 7 regression (per phase instructions: caused by commit `0401b31` dropping the `## Bypass Conventions` heading from STATE.md before this milestone began).

---

_Verified: 2026-06-16T15:00:00Z_
_Verifier: Claude (gsd-verifier)_

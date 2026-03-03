---
phase: 08-test-harness-foundation
plan: 02
subsystem: testing
tags: [fixture-corpus, patent-pdf, pdfjs-dist, test-cases, position-map]

# Dependency graph
requires:
  - 08-01 (Vitest infrastructure, buildPositionMap exported for import)
provides:
  - scripts/generate-fixture.js: fetches patent PDFs and produces PositionMap JSON fixtures
  - tests/fixtures/: 15 PositionMap JSON files (492-5867 entries each, all > 50)
  - tests/test-cases.js: 44 test cases across 8 required categories
affects:
  - 08-03-golden-baseline (needs fixtures + test cases to record golden outputs)

# Tech tracking
tech-stack:
  added: [pdfjs-dist@5.5.207]
  patterns:
    - google-patents-page-scraping-for-pdf-url
    - pdfjs-dist-node-legacy-build
    - fixture-from-real-patent-pdfs

key-files:
  created:
    - scripts/generate-fixture.js
    - tests/test-cases.js
    - tests/fixtures/US11427642.json
    - tests/fixtures/US10234567.json
    - tests/fixtures/US10592688.json
    - tests/fixtures/US10987654.json
    - tests/fixtures/US11086978.json
    - tests/fixtures/US4723129.json
    - tests/fixtures/US5440748.json
    - tests/fixtures/US5959167.json
    - tests/fixtures/US6738932.json
    - tests/fixtures/US7346586.json
    - tests/fixtures/US8024718.json
    - tests/fixtures/US9001285.json
    - tests/fixtures/US9688736.json
    - tests/fixtures/US9876543.json
  modified:
    - package.json (added pdfjs-dist devDependency)

key-decisions:
  - "Scrape Google Patents page to find PDF URL — direct URL construction returns HTTP 403 (hash-based path required)"
  - "Use pdfjs-dist legacy Node build instead of src/lib/pdf.mjs — browser PDF.js has DOMMatrix dependency not in Node"
  - "Set GlobalWorkerOptions.workerSrc to file:// URL of pdfjs-dist worker — required in pdfjs-dist v5+"

requirements-completed: [TEST-02, TEST-03]

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 8 Plan 2: Corpus Ingestion Summary

**15-patent fixture corpus generated (15 JSON files, 492-5867 entries each) and a 44-entry test case registry covering all 8 required categories: modern-short(8), modern-long(6), pre2000-short(3), pre2000-long(3), chemical(4), cross-column(7), claims(7), repetitive(6)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T03:47:02Z
- **Completed:** 2026-03-03T03:55:00Z
- **Tasks:** 2
- **Files created:** 17 (1 script, 1 registry, 15 fixture JSONs)

## Accomplishments

- Created `scripts/generate-fixture.js` — scrapes Google Patents page to resolve the actual PDF URL (hash-based path), downloads PDF, extracts text via pdfjs-dist, and runs through `buildPositionMap`; validates entry count (warns and skips if < 50)
- Installed `pdfjs-dist@5.5.207` as devDependency — provides the Node-compatible PDF.js build for the fixture script
- Generated 15 PositionMap JSON fixtures covering modern patents, pre-2000 patents, and chemical patents
- Created `tests/test-cases.js` with 44 `TEST_CASES` entries — every `selectedText` is derived from the actual fixture PositionMap data, ensuring `matchAndCite` can locate each text in its fixture

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fixture generation script** - `b5b32f4` (feat)
2. **Task 2: Generate diverse patent corpus and create test case registry** - `baee7e0` (feat)

## Fixture Corpus Details

| Patent | Entries | Category | Description |
|--------|---------|----------|-------------|
| US11427642 | 1,410 | Modern | Anti-BCMA antibody (2021) |
| US10234567 | 798 | Modern | Location awareness apparatus (2019) |
| US10592688 | 1,915 | Modern | Computing system / medical forms (2020) |
| US10987654 | 644 | Modern | Ceria-zirconia composite oxide (2021) |
| US11086978 | 724 | Modern | Smart card authentication (2021) |
| US6738932 | 777 | Modern | Software identification from dump (2004) |
| US7346586 | 4,784 | Modern | Authentication chip validation (2008) |
| US8024718 | 1,070 | Modern | Address expression optimization (2011) |
| US9001285 | 492 | Modern | Display panel (2015) |
| US9876543 | 992 | Modern | Wireless channel estimation (2018) |
| US5959167 | 1,284 | Pre-2000 | Lignin to gasoline (1999) |
| US5440748 | 586 | Pre-2000 | Computer I/O system (1995) |
| US4723129 | 1,226 | Pre-2000 | Thermal inkjet printer, HP (1988) |
| US10472384 | 5,867 | Chemical | Steroid synthesis process (2019) |
| US9688736 | 611 | Chemical | Glucagon analog with amino acid sequences (2017) |

## Test Case Category Coverage

| Category | Count | Min Required | Status |
|----------|-------|-------------|--------|
| modern-short | 8 | 4 | PASS |
| modern-long | 6 | 4 | PASS |
| pre2000-short | 3 | 3 | PASS |
| pre2000-long | 3 | 3 | PASS |
| chemical | 4 | 3 | PASS |
| cross-column | 7 | 4 | PASS |
| claims | 7 | 3 | PASS |
| repetitive | 6 | 3 | PASS |
| **Total** | **44** | **30** | **PASS** |

## Decisions Made

- **Scrape Google Patents page for PDF URL:** Direct URL construction (e.g., `https://patentimages.storage.googleapis.com/pdfs/US11427642.pdf`) returns HTTP 403. The actual PDF is stored at a hash-based path embedded in the Google Patents HTML page (e.g., `/8a/22/5e/4d90a531903787/US11427642.pdf`). The fixture script scrapes the page HTML with a regex to extract the real URL before downloading.

- **Use pdfjs-dist legacy Node build:** `src/lib/pdf.mjs` (the extension's bundled PDF.js) fails in Node with `DOMMatrix is not defined` — it references browser-only APIs at module scope. `pdfjs-dist/legacy/build/pdf.mjs` is the official Node-compatible build of the same library and works cleanly.

- **Set GlobalWorkerOptions.workerSrc in pdfjs-dist v5+:** pdfjs-dist v5 requires `workerSrc` to be explicitly set (no fallback to empty string). Setting it to the `file://` URL of `pdf.worker.mjs` from the pdfjs-dist package resolves the "Setting up fake worker failed" error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Google Patents PDF URLs return HTTP 403 when constructed directly**
- **Found during:** Task 1 verification
- **Issue:** The plan specified constructing URLs as `https://patentimages.storage.googleapis.com/pdfs/${patentId}.pdf` and an alternate format. Both return HTTP 403 — patentimages.storage.googleapis.com uses hash-based storage paths that cannot be predicted from patent numbers alone.
- **Fix:** Added a page-scraping step: fetch `https://patents.google.com/patent/${patentId}`, extract the actual PDF URL from the HTML using a regex matching `patentimages.storage.googleapis.com/.+.pdf`.
- **Files modified:** `scripts/generate-fixture.js`
- **Commit:** b5b32f4

**2. [Rule 3 - Blocking] pdf-parser.js cannot be imported in Node (DOMMatrix not defined)**
- **Found during:** Task 1 (addressed proactively per plan IMPORTANT note)
- **Issue:** `src/lib/pdf.mjs` (browser PDF.js) calls `DOMMatrix` at module scope, which doesn't exist in Node.js. The plan's IMPORTANT note anticipated this and specified using `pdfjs-dist` as a fallback.
- **Fix:** Used `pdfjs-dist/legacy/build/pdf.mjs` (Node-compatible build) and re-implemented the extraction logic directly in the script — mirrors `extractTextFromPdf` from `pdf-parser.js` but using the pdfjs-dist API.
- **Files modified:** `scripts/generate-fixture.js`, `package.json`
- **Commit:** b5b32f4

**3. [Rule 1 - Bug] pdfjs-dist v5 requires explicit workerSrc (no empty-string fallback)**
- **Found during:** Task 1 verification (first run failed with "Setting up fake worker failed")
- **Issue:** Setting `GlobalWorkerOptions.workerSrc = ''` does not disable the worker in pdfjs-dist v5 — it throws an error. The worker must be set to a valid URL.
- **Fix:** Set `GlobalWorkerOptions.workerSrc` to the `file://` URL of `pdfjs-dist/legacy/build/pdf.worker.mjs`.
- **Files modified:** `scripts/generate-fixture.js`
- **Commit:** b5b32f4 (same commit, discovered during same session)

## Next Phase Readiness

- `tests/fixtures/*.json` — 15 files ready for golden baseline recording in Plan 08-03
- `tests/test-cases.js` — 44 TEST_CASES ready for `matchAndCite` accuracy testing in Plan 08-03
- All selectedText values derived from actual fixture data — `matchAndCite` can locate each test case text
- Fixture generation script supports adding new test cases: `node scripts/generate-fixture.js <patentId>`

---
*Phase: 08-test-harness-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

Checking files exist:
- scripts/generate-fixture.js: FOUND
- tests/test-cases.js: FOUND
- tests/fixtures/US11427642.json: FOUND
- tests/fixtures/US5959167.json: FOUND
- tests/fixtures/US4723129.json: FOUND
- tests/fixtures/US10472384.json: FOUND
- tests/fixtures/US9688736.json: FOUND

Checking commits exist:
- b5b32f4: FOUND (feat - fixture generation script)
- baee7e0: FOUND (feat - corpus + test case registry)

Checking test case counts:
- Total TEST_CASES: 44 (>= 30 required): PASS
- All 8 categories have >= 3 entries: PASS
- All 15 fixtures have >= 50 entries: PASS

---
phase: 08-webapp-core-build
verified: 2026-06-16T15:50:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Enter a real granted patent number (e.g. US10123456B2) and a passage from that patent in a local wrangler dev session (webapp/); submit and confirm the correct Col. X, ll. Y-Z citation appears with the correct green/yellow/red confidence chip"
    expected: "Citation matches the patent text; chip color matches threshold (≥0.95 green, ≥0.80 yellow, else red); named loading stages cycle through the UI visually"
    why_human: "Live DOM rendering, real network round-trip to pct.tonyrowles.com/webapp/pdf, clipboard write, and PDF.js parse — none exercisable without a running browser + wrangler dev + real patent (zero-jsdom DoD)"
  - test: "Enter a published-application number (e.g. US20240001234A1) and submit; confirm the field-error message appears and DevTools Network panel shows zero requests fired"
    expected: "Field error 'Published applications…are not supported yet.' displayed; absolutely no network request in the Network panel"
    why_human: "Requires a real browser Network panel; the guard logic is verified statically but the DOM toggle + zero-network assertion needs live confirmation"
  - test: "Enter two distinct passages for one patent; confirm both citations appear, each with its own confidence chip; use 'Copy all citations' and paste into a text editor to confirm both lines are copied correctly; switch between Short/Long format and confirm citations reformat in-place without a new network request"
    expected: "Two result rows; copy-all yields newline-separated citations; format toggle re-renders from cached startEntry/endEntry without triggering a network request"
    why_human: "Clipboard API, multi-row DOM rendering, and localStorage-persisted re-render are only verifiable in a live browser session"
  - test: "Open DevTools Network tab; enter a patent number and submit; confirm every request to pct.tonyrowles.com shows NO Authorization or Bearer header; confirm PDF fetch goes to /webapp/pdf and not to patentimages.storage.googleapis.com"
    expected: "Network tab: /webapp/pdf?patent=… 200; /cache?patent=… requests; no Authorization header on any request; no patentimages.storage.googleapis.com entry"
    why_human: "Runtime header inspection requires DevTools — static grep guards confirm the source code has no auth headers, but live confirmation is Phase 9 DEPLOY-04"
  - test: "Disconnect from the network (or block pct.tonyrowles.com in DevTools) and submit; confirm error state renders with 'Try again'; click Try again after re-enabling the network and confirm the citation attempt resumes"
    expected: "error-network state shown with retry button; retry button re-runs runCitation with original inputs"
    why_human: "Network-failure-and-retry flow requires a live browser session with controllable network conditions"
---

# Phase 8: Webapp Core Build — Verification Report

**Phase Goal:** The standalone webapp is fully functional in a local browser — patent number entry, cache-first lookup, client-side PDF.js parsing via the shared core, citation display with confidence indicator, batch mode, format toggle, copy-to-clipboard, and published-application rejection at the input layer
**Verified:** 2026-06-16T15:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: User can enter patent number and receive correct column:line citation with confidence indicator using shared thresholds | VERIFIED (code level) | `webapp/js/app.js` implements full pipeline; `normalizePatentInput`, `matchAndCite`, confidence chips at 0.95/0.80 wired; live confirmation → Phase 9 UAT |
| 2 | SC-2: Published-application number immediately shows field error; no network call made | VERIFIED | `handleSubmit` lines 635-638: `isPublishedApplication` fires before any `fetch`; `patentFieldError.hidden = false; return;` confirmed; index.html has `patent-field-error` with correct message text |
| 3 | SC-3: Batch mode — one fetch + one parse + N matchAndCite calls; copy-all works; no re-parse | VERIFIED (code level) | Line 507: `passages.map(p => matchAndCite(p, positionMap, '', ''))` — single positionMap; `copyAllBtn` wired to `handleCopyAll`; 34/34 BATCH-01 unit tests green |
| 4 | SC-4: No Authorization/Bearer header; all PDF fetches via /webapp/pdf | VERIFIED (static) | `grep -iE 'authorization|bearer' webapp/js/app.js` → zero matches; `grep -q 'patentimages'` → zero matches; live DevTools confirmation → Phase 9 UAT |
| 5 | SC-5: `scripts/build.js --webapp-only` produces dist/webapp/ with index.html + app.bundle.js + lib/pdf.mjs + lib/pdf.worker.mjs; wrangler.toml references dist/webapp/ | VERIFIED | Build exits 0 with no PROXY_TOKEN; all four files confirmed present; app.bundle.js = 640,966 bytes (< 2MB); wrangler.toml has `[assets]` + `directory = "../dist/webapp"`, no `[site]`, no functional `main` key |

**Score:** 5/5 truths verified (at code level; live behavior items correctly deferred to Phase 9 UAT)

### Deferred Items

Items not yet met but explicitly addressed in Phase 9 (Deploy + Live UAT + Privacy).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | SC-1 live: real patent → correct citation with KV cache populated | Phase 9 | Phase 9 success criterion 1: "Live UAT proves: a real granted patent → correct citation with KV cache populated" |
| 2 | SC-3 live: batch mode clipboard + no-re-parse confirmed in browser | Phase 9 | Phase 9 DEPLOY-04: "batch mode with multiple passages" |
| 3 | SC-4 live: DevTools network panel zero-Authorization confirmation | Phase 9 | Phase 9 DEPLOY-04: "no Authorization: Bearer token in any webapp network request" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/build.js` | `buildWebapp()` target, PROXY_TOKEN guard bypassed for webapp | VERIFIED | `!webappOnly && !PROXY_TOKEN` guard; `buildWebapp()` function present; commit 1309291 |
| `webapp/index.html` | Full UI-SPEC markup, inline styles, trust signals, module script tag | VERIFIED | 648 lines; H1 "Patent Citation Tool"; results-area aria-live=polite; trust signals; citation-format select; include-patent-number checkbox; app.bundle.js script tag; all form labels present |
| `webapp/wrangler.toml` | Workers Assets config pointing at ../dist/webapp | VERIFIED | `[assets]` present; `directory = "../dist/webapp"`; no `[site]`; comment-only `main` reference (not a functional key) |
| `package.json` | `build:webapp` npm script | VERIFIED | `"build:webapp": "node scripts/build.js --webapp-only"` confirmed |
| `webapp/js/normalizer.js` | Pure functions: normalizePatentInput, isPublishedApplication, formatCitationLong, applyPrefix | VERIFIED | 136 lines; all four functions exported; pure ESM (no DOM, no fetch, no chrome.*); commit f5936d4 |
| `webapp/js/app.js` | Orchestration pipeline + UI state machine (min 250 lines) | VERIFIED | 744 lines; imports from normalizer.js and src/shared/; all pipeline stages present; commit db53f5e |
| `tests/unit/webapp-logic.test.js` | Vitest unit coverage — APP-01, APP-02, FMT-01, BATCH-01 | VERIFIED | 34/34 tests pass; covers all four requirement areas; commit 58b30bf |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/build.js buildWebapp()` | `webapp/js/app.js` | esbuild entryPoint | VERIFIED | `webapp/js/app.js` referenced as esbuild entry; build confirmed |
| `webapp/index.html` | `./app.bundle.js` | `<script type="module" src>` | VERIFIED | `<script type="module" src="./app.bundle.js">` confirmed in index.html |
| `webapp/js/app.js` | `src/shared/pdf-parser.js, position-map-builder.js, matching.js` | ESM imports + `configurePdfWorker('/lib/pdf.worker.mjs')` | VERIFIED | Lines 29-31 confirm all three imports; `configurePdfWorker('/lib/pdf.worker.mjs')` called at line 38 |
| `webapp/js/app.js` | Worker GET /cache, GET /webapp/pdf, POST /cache | fetch with no Authorization header | VERIFIED | `checkCache` fetches `/cache?patent=`; `fetchPdf` fetches `/webapp/pdf?patent=`; `uploadToCache` POSTs `/cache`; zero auth headers |
| `webapp/js/app.js` | `webapp/js/normalizer.js` | import normalizePatentInput, isPublishedApplication, formatCitationLong, applyPrefix | VERIFIED | Lines 22-27 confirm all four function imports |
| `tests/unit/webapp-logic.test.js` | `webapp/js/normalizer.js` | import of three pure functions | VERIFIED | 34/34 tests green |
| `tests/unit/webapp-logic.test.js` (BATCH-01) | `src/shared/matching.js matchAndCite` | N calls over one positionMap fixture | VERIFIED | 6 BATCH-01 tests cover single-parse invariant and mutation check |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `webapp/js/app.js` | `positionMap` | `cached.entries` (cache hit) or `buildPositionMap(pageResults)` (cache miss) | Yes — derives from real Worker API response or real PDF.js parse | WIRED (code path confirmed; live data requires running browser) |
| `webapp/js/app.js` | `lastResults` | `passages.map(p => matchAndCite(p, positionMap, '', ''))` | Yes — real matchAndCite calls over real positionMap | WIRED |
| `webapp/js/app.js` | `citationFormatSelect.value` / `includePrefixCheckbox.checked` | `localStorage.getItem('citation-format')` / `localStorage.getItem('include-patent-number')` | Yes — persisted user preference | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `--webapp-only` build exits 0 with no PROXY_TOKEN | `env -u PROXY_TOKEN node scripts/build.js --webapp-only` | exit 0, "Built webapp in 66ms" | PASS |
| 34 unit tests green | `npx vitest run tests/unit/webapp-logic.test.js` | 34/34 passed in 151ms | PASS |
| dist/webapp/ has 4 required files | `test -f` checks on all four | All present | PASS |
| dist/chrome/ survived webapp build | `test -d dist/chrome` | Present | PASS |
| app.bundle.js < 2MB | `wc -c < dist/webapp/app.bundle.js` | 640,966 bytes | PASS |
| Zero auth headers in app.js | `grep -iE 'authorization|bearer' webapp/js/app.js` | zero matches | PASS |
| Zero patentimages/googleapis | `grep -q 'patentimages' webapp/js/app.js` | zero matches | PASS |
| All 4 named loading strings present | `grep -c "Fetching patent PDF…|Parsing PDF…|..."` | count = 4 | PASS |
| normalizer.js 9-assertion node ESM check | inline node --input-type=module assertions | NORMALIZER_OK | PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes discovered for Phase 8; phase does not declare probe-based verification in PLAN frontmatter. Verification delegated to spot-checks above and unit test suite.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| APP-01 | 08-02 | Patent number normalization (strips commas/spaces/hyphens, uppercases, adds US prefix) | SATISFIED | `normalizePatentInput` in normalizer.js; 7 unit tests green; wired in handleSubmit lines 631-632 |
| APP-02 | 08-02, 08-03 | Published-application rejection before any network call | SATISFIED | `isPublishedApplication` in normalizer.js; 10 unit tests; handleSubmit lines 635-638 returns before fetch |
| APP-03 | 08-03 | PDF fetched exclusively via Worker proxy, no direct USPTO/patentimages fetch | SATISFIED (static) | Zero `patentimages`/`googleapis` in app.js; fetchPdf uses `/webapp/pdf?patent=` only |
| APP-04 | 08-03 | Cache-first: GET /cache before fetch+parse; hit skips parse | SATISFIED (code level) | `checkCache` called first in `runCitation`; cache hit path uses `cached.entries` directly (line 472) |
| APP-05 | 08-03 | Cache miss: fetch PDF, parse via PDF.js, compute citation, upload to cache | SATISFIED (code level) | Full miss path in runCitation: fetchPdf → extractTextFromPdf → buildPositionMap → fire-and-forget uploadToCache |
| APP-06 | 08-03 | Confidence indicator with shared thresholds (≥0.95 green, ≥0.80 yellow, <0.80 red) | SATISFIED (code level) | chipClassFor/chipLabelFor in app.js; thresholds 0.95/0.80 confirmed; chip-green/chip-yellow/chip-red classes |
| APP-07 | 08-03 | No-match message; error state with retry affordance | SATISFIED (code level) | buildNoMatchRow; renderError with retry button wired to `runCitation(lastRun.normalizedId, lastRun.passages)` |
| APP-08 | 08-03 | Named loading stages | SATISFIED | All 4 locked strings present: "Fetching patent PDF…", "Parsing PDF…", "Matching passage…", "Loading from cache…" (grep count = 4) |
| APP-09 | 08-03 | Copy citation to clipboard | SATISFIED (code level) | `navigator.clipboard.writeText` in per-row copy handler; "Copied!" feedback with 2s timeout |
| APP-10 | 08-01 | Trust signals: deterministic, no AI inference, no data stored | SATISFIED | index.html line 637: "Deterministic — no AI inference"; "No data stored" confirmed in HTML |
| FMT-01 | 08-02, 08-03 | Short/long format toggle; long form is new code path | SATISFIED | formatCitationLong (3-branch pure function); format toggle wired to localStorage + _renderResultsFromStore |
| FMT-02 | 08-03 | Patent-number prefix toggle | SATISFIED | applyPrefix wired in formatCitationFor; localStorage key 'include-patent-number'; prefix toggle re-renders in-place |
| BATCH-01 | 08-02, 08-03 | One fetch + one parse + N matchAndCite calls; no re-parse | SATISFIED | Line 507: `passages.map(p => matchAndCite(p, positionMap, '', ''))` — single positionMap; 6 BATCH-01 unit tests including mutation invariant |
| BATCH-02 | 08-03 | Per-batch-row confidence indicator | SATISFIED (code level) | buildResultRow called per result with chipClassFor/chipLabelFor per row |
| BATCH-03 | 08-03 | Copy-all citations at once | SATISFIED (code level) | handleCopyAll joins all non-null citations with '\n'; `copyAllBtn` shown when ≥2 results |

**All 15 Phase 8 requirements: SATISFIED at code/static level. Live browser confirmation: Phase 9 UAT.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| webapp/js/normalizer.js | 47, 59 | `XXXXXXXXX` literal in comment/regex context | Info | Not a debt marker — it is part of the `20XXXXXXXXX` format descriptor in JSDoc and the regex pattern `/^20\d{9}/`. Word-boundary grep confirms zero actual `\bXXX\b` debt markers. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any Phase 8 source file. No stub implementations (no `return null`, `return {}`, `return []` in rendering paths). No hardcoded empty data arrays flowing to render output. Supply-chain guard: zero new npm dependencies added.

### Human Verification Required

These items are NOT gaps. They are live browser behaviors that Phase 8's zero-jsdom autonomous DoD explicitly defers to Phase 9 UAT, per project memory "UI phases defer live tests to UAT" and per the `<deferred_uat>` block in 08-03-PLAN.md.

#### 1. End-to-End Citation Pipeline (Real Patent + Real Browser)

**Test:** Run `wrangler dev` from `webapp/`; open `localhost:8788`; enter a real granted patent (e.g. `US10617174B2`) and a passage from its specification; submit.
**Expected:** Named loading stages cycle visually (Loading from cache… / Fetching patent PDF… / Parsing PDF… / Matching passage…); citation appears in correct `Col. X, ll. Y-Z` or `4:15-22` format; confidence chip is green/yellow/red.
**Why human:** Requires a live browser, real network call to `pct.tonyrowles.com`, and PDF.js parse in worker thread — not testable without a running server and real patent data.

#### 2. Published-Application Rejection (Live DOM + Network Panel)

**Test:** Enter `US20240001234A1` in the patent field; submit; check the field-error message and the Network panel.
**Expected:** "Published applications (e.g. US20240001234A1) are not supported yet." appears; Network panel shows zero new requests.
**Why human:** The guard logic is code-verified; the DOM toggle visibility and zero-network assertion need live DevTools confirmation.

#### 3. Batch Mode + Copy-All + Format Toggle (Live Clipboard)

**Test:** Enter two different passages for one patent; submit; confirm two result rows each with their own chip; click "Copy all citations"; paste and verify both citations are present; switch format between Short and Long; confirm citations reformat in-place.
**Expected:** Two rows; clipboard receives newline-joined citations; format toggle re-renders without a new network request (verify in Network tab — no second request fires on toggle).
**Why human:** `navigator.clipboard.writeText` requires browser user-gesture context; multi-row DOM rendering and in-place re-render require live browser.

#### 4. No-Authorization Header Assertion (DevTools Network Inspector)

**Test:** Open DevTools Network tab; submit for any patent; inspect request headers on all pct.tonyrowles.com requests.
**Expected:** Zero requests carry `Authorization` or `Bearer`; all PDF fetches go to `/webapp/pdf?patent=`; no `patentimages.storage.googleapis.com` entries.
**Why human:** Runtime header inspection requires DevTools; static grep guards confirm the source, but production deployment verification is Phase 9 DEPLOY-04.

#### 5. Error State + Retry (Network Failure)

**Test:** Block `pct.tonyrowles.com` in DevTools; submit; confirm error-network state with "Try again"; restore network; click "Try again"; confirm citation attempt resumes.
**Expected:** Error state rendered with retry button focused; retry re-runs with original inputs.
**Why human:** Network failure simulation requires a live browser with DevTools network throttling.

### Gaps Summary

No gaps found. All must-haves are verified at the code and static-analysis level. The five human-verification items above are live browser behaviors that are correctly scoped to Phase 9 UAT by design — they are not Phase 8 regressions.

The one pre-existing failing test (`tests/unit/weekly-digest-auto-fix.test.js`) was present before this phase (caused by commit `0401b31` dropping a `## Bypass Conventions` heading from STATE.md before this milestone). It is not a Phase 8 regression and does not affect Phase 8 requirements.

---

_Verified: 2026-06-16T15:50:00Z_
_Verifier: Claude (gsd-verifier)_

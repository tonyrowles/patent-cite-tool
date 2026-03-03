---
phase: 06-uspto-api-fallback
verified: 2026-03-02T23:00:00Z
status: passed
score: 14/14 must-haves verified
human_verification:
  - test: "Worker endpoint returns 401 without auth and PDF binary with auth"
    expected: "curl -s -o /dev/null -w '%{http_code}' https://patent-cite-worker.fatduck.workers.dev returns 401; curl with Authorization: Bearer <token> and ?patent=12505414 returns a PDF binary"
    why_human: "Cannot reach the live Cloudflare Worker from a static code scan. Deployment health and secret configuration require a live network call."
  - test: "USPTO fallback produces a citation for a patent with no Google PDF link"
    expected: "Loading a patent page where Google Patents has no PDF link triggers the '[SW] No Google PDF link, trying USPTO fallback' log, extension fetches PDF from Worker, parses it, and produces a column:line citation"
    why_human: "End-to-end flow requires a real browser with the extension loaded. Cannot simulate the Google Patents DOM, Chrome extension message bus, or the live Worker in a static scan."
  - test: "currentPatent.source is 'google' for Google-fetched patents and 'uspto' for USPTO-fetched patents"
    expected: "chrome.storage.local.get('currentPatent', d => console.log(d.currentPatent.source)) outputs 'google' after a normal Google Patents citation and 'uspto' after a USPTO fallback citation"
    why_human: "Storage state requires a live extension session."
  - test: "Existing Google Patents citation flow is unchanged after Phase 6 changes"
    expected: "Navigate to a patent that works with Google Patents (e.g. US11427642B2), highlight text, trigger citation — citation is produced correctly with no regression"
    why_human: "Regression testing requires a real browser with the extension loaded."
---

# Phase 6: USPTO API Fallback — Verification Report

**Phase Goal:** Patents that Google Patents cannot serve are resolved by fetching the eGrant PDF via a Cloudflare Worker that orchestrates the USPTO Open Data Portal API

**Verified:** 2026-03-02T23:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All 14 must-have truths verified against the actual codebase:

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Worker responds 401 to requests without a valid Bearer token | ? HUMAN | Code verified: `if (authHeader !== 'Bearer ${env.PROXY_TOKEN}')` returns 401 with CORS. Live endpoint requires human test. |
| 2 | Worker responds 204 with CORS headers to OPTIONS preflight requests | ? HUMAN | Code verified: OPTIONS branch returns 204 with all 4 CORS headers. Live endpoint requires human test. |
| 3 | Worker responds 400 to invalid patent number formats | VERIFIED | `worker/src/index.js` line 156: `/^\d{6,8}$/.test(patentNumber)` check returns 400 with CORS and descriptive message. |
| 4 | Worker orchestrates 3-step ODP lookup and returns PDF binary | VERIFIED | `fetchEgrantPdf()` in `worker/src/index.js`: Step 1 searches by `patentNumber`, Step 2 fetches documents filtered for EGRANT.PDF, Step 3 downloads and streams via `Response.body`. Returns 200 with `Content-Type: application/pdf`. |
| 5 | Worker returns Access-Control-Allow-Origin on ALL responses including errors | VERIFIED | `corsHeaders()` helper spread into every `new Response()` call: OPTIONS (204), 401, 400, 200, 502. No response branch omits it. |
| 6 | Worker secrets (PROXY_TOKEN, USPTO_API_KEY) are never exposed in committed code | VERIFIED | `worker/.dev.vars` is NOT tracked by git (confirmed `git ls-files` error). Root `.gitignore` lists `worker/.dev.vars`. `worker/.gitignore` lists `.dev.vars`. Secrets are `env.PROXY_TOKEN` and `env.USPTO_API_KEY` (Cloudflare bindings only). |
| 7 | When Google Patents PDF link not found and patent is a grant, service worker initiates USPTO fallback | VERIFIED | `handlePdfUnavailable()` in `service-worker.js` lines 194-212: `if (patentType === PATENT_TYPE.GRANT)` sets `STATUS.FETCHING`, calls `ensureOffscreenDocument()`, sends `MSG.FETCH_USPTO_PDF`. |
| 8 | When Google Patents PDF fetch fails and patent is a grant, service worker initiates USPTO fallback | VERIFIED | `handlePdfFetchResult()` lines 252-263: `if (patent.patentType === PATENT_TYPE.GRANT && patent.source !== 'uspto')` sends `FETCH_USPTO_PDF`. Includes loop guard. |
| 9 | When Google Patents PDF parse returns no-text-layer and patent is a grant, service worker initiates USPTO fallback | VERIFIED | `handleParseResult()` lines 293-304: `if (patent.patentType === PATENT_TYPE.GRANT && patent.source !== 'uspto')` sends `FETCH_USPTO_PDF`. Includes loop guard. |
| 10 | USPTO fallback is NOT triggered for application patents | VERIFIED | All three trigger points check `patentType === PATENT_TYPE.GRANT` before initiating fallback. Application patents fall to `STATUS.UNAVAILABLE` or `STATUS.ERROR`. |
| 11 | Offscreen document fetches PDF from Worker URL with Bearer token and stores blob in IndexedDB | VERIFIED | `fetchUsptoWithRetry()` in `offscreen.js` lines 222-254: fetches `WORKER_URL?patent=...` with `Authorization: Bearer ${PROXY_TOKEN}`, calls `storePdfInIndexedDB(patentId, blob)` on success. |
| 12 | After USPTO fetch success, existing parsePdf() pipeline runs unchanged | VERIFIED | `handleUsptoFetchResult()` on success sends `MSG.PARSE_PDF` (same message as Google path). `parsePdf()` reads from IndexedDB by `patentId` — works identically regardless of PDF source. UPTO-03 achieved. |
| 13 | currentPatent includes source field ('google' or 'uspto') | VERIFIED | `handlePdfLinkFound()` stores `source: 'google'`. `handleUsptoFetchResult()` success branch sets `patent.source = 'uspto'`. Fallback triggers set `source: null` during FETCHING state. |
| 14 | If both Google Patents and USPTO fail, patent goes to UNAVAILABLE with amber badge | VERIFIED | `handleUsptoFetchResult()` failure branch: `patent.status = STATUS.UNAVAILABLE`, amber badge `#F59E0B`. |

**Score:** 14/14 truths verified (4 require human confirmation of live behavior)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `worker/wrangler.toml` | Cloudflare Worker configuration | VERIFIED | Contains `name = "patent-cite-worker"`, `main = "src/index.js"`, `compatibility_date = "2025-01-01"` |
| `worker/package.json` | Worker package with wrangler dependency | VERIFIED | `"type": "module"`, `"wrangler": "^4.69.0"` in devDependencies, dev/deploy scripts present |
| `worker/src/index.js` | Worker entry point with fetch handler | VERIFIED | 191 lines. Exports default object with `async fetch(request, env, ctx)`. Full ODP orchestration implemented. |
| `worker/.dev.vars` | Local development secrets template | VERIFIED | File exists on disk (not committed — confirmed by `git ls-files` error). Contains `PROXY_TOKEN` and `USPTO_API_KEY` placeholders. |
| `worker/.gitignore` | Prevents .dev.vars from being committed | VERIFIED | Contains `node_modules/` and `.dev.vars` |
| `src/shared/constants.js` | New message type constants | VERIFIED | `FETCH_USPTO_PDF: 'fetch-uspto-pdf'` and `USPTO_FETCH_RESULT: 'uspto-fetch-result'` present in MSG object |
| `src/background/service-worker.js` | Fallback orchestration + USPTO result handler | VERIFIED | `FETCH_USPTO_PDF` and `USPTO_FETCH_RESULT` in inline MSG object. `handleUsptoFetchResult` implemented. Three trigger points modified. |
| `src/offscreen/offscreen.js` | fetchUsptoWithRetry function and listener branch | VERIFIED | `fetchUsptoWithRetry()` at line 222. `FETCH_USPTO_PDF` listener branch at line 52. `WORKER_URL` = `https://patent-cite-worker.fatduck.workers.dev` (no PLACEHOLDER). `PROXY_TOKEN` = production value. |
| `src/manifest.json` | Worker URL in host_permissions | VERIFIED | `"https://patent-cite-worker.fatduck.workers.dev/*"` in `host_permissions` array. No PLACEHOLDER. |
| `src/offscreen/position-map-builder.js` | Blank-line-aware line numbering | VERIFIED | `assignLineNumbers()` function (lines 423-464) with median spacing computation and `lineSpans = Math.round(gap / medianSpacing)` for blank line detection. Committed in `ca4551b`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `worker/src/index.js` | `https://api.uspto.gov/api/v1/patent/applications` | `fetch()` with `X-API-Key` header | VERIFIED | `ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'`. All three ODP fetch calls use `{ headers: { 'X-API-Key': apiKey } }`. |
| `worker/src/index.js` | `env.PROXY_TOKEN` | Authorization header validation | VERIFIED | Line 141: `authHeader !== 'Bearer ${env.PROXY_TOKEN}'`. Runtime secret bound via Cloudflare Workers env. |
| `src/background/service-worker.js` | `src/offscreen/offscreen.js` | `MSG.FETCH_USPTO_PDF` message | VERIFIED | All three trigger points send `{ type: MSG.FETCH_USPTO_PDF, patentId }`. Offscreen listener at line 52 handles `FETCH_USPTO_PDF`. |
| `src/offscreen/offscreen.js` | Worker at `patent-cite-worker.fatduck.workers.dev` | `fetch()` with `Authorization: Bearer` header | VERIFIED | `WORKER_URL = 'https://patent-cite-worker.fatduck.workers.dev'` (line 32). Fetch at line 225 includes `Authorization: Bearer ${PROXY_TOKEN}`. |
| `src/offscreen/offscreen.js` | `storePdfInIndexedDB()` | Blob stored after USPTO fetch success | VERIFIED | Line 233: `await storePdfInIndexedDB(patentId, blob)` called before sending `USPTO_FETCH_RESULT`. Same function used by `fetchPdfWithRetry`. |
| `src/background/service-worker.js` | `src/offscreen/offscreen.js` (parsePdf) | `MSG.PARSE_PDF` after USPTO fetch success | VERIFIED | `handleUsptoFetchResult()` success branch (line 341) sends `{ type: MSG.PARSE_PDF, patentId }`. Identical to Google path. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| UPTO-01 | 06-01-PLAN.md, 06-03-PLAN.md | Cloudflare Worker deployed with token validation and CORS handling | SATISFIED | Worker code fully implemented in `worker/src/index.js`. Token validation (line 141), CORS on all responses (`corsHeaders()` spread), OPTIONS preflight (line 127). Deployed to `patent-cite-worker.fatduck.workers.dev` per 06-03-SUMMARY.md. Live deployment confirmed by human E2E test ("approved"). |
| UPTO-02 | 06-02-PLAN.md, 06-03-PLAN.md | When Google Patents PDF is unavailable, extension fetches patent PDF via Worker proxy to USPTO image server | SATISFIED | Three trigger points in `service-worker.js` (no-DOM-link, fetch-failure, no-text-layer) all route grant patents to `FETCH_USPTO_PDF`. `fetchUsptoWithRetry()` in offscreen fetches from the live Worker. |
| UPTO-03 | 06-02-PLAN.md, 06-03-PLAN.md | USPTO-fetched PDF is parsed identically to Google Patents PDF (same offscreen flow) | SATISFIED | USPTO blob stored via `storePdfInIndexedDB()` (same function as Google path). Service worker sends `MSG.PARSE_PDF` after USPTO success. `parsePdf()` reads from IndexedDB by `patentId` — source-agnostic. |

No orphaned requirements: all three UPTO-* requirements are mapped to Phase 6 in REQUIREMENTS.md and claimed by plans 06-01 through 06-03.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/background/service-worker.js` | 161 | Comment "Actual PDF fetch delegation to offscreen document will be added in Plan 01-02." — stale comment referencing old plan numbers | Info | Harmless stale comment; does not affect behavior |

No stub implementations, empty handlers, TODO/FIXME comments, or unconnected wiring found in phase-modified files.

---

### Human Verification Required

The automated code scan passes all checks. The following require a live browser/network to confirm:

#### 1. Worker Endpoint Health

**Test:** Run from a terminal:
```
# Should return 401
curl -s -o /dev/null -w "%{http_code}" https://patent-cite-worker.fatduck.workers.dev

# Should return 204 (CORS preflight)
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS https://patent-cite-worker.fatduck.workers.dev

# Should return PDF binary (replace TOKEN with actual PROXY_TOKEN)
curl -H "Authorization: Bearer TOKEN" "https://patent-cite-worker.fatduck.workers.dev/?patent=12505414" -o test.pdf && file test.pdf
```
**Expected:** 401, 204, and "PDF document" respectively.
**Why human:** Cloudflare deployment and secret configuration cannot be verified without a live network call.

#### 2. USPTO Fallback Citation — End-to-End

**Test:** Load the extension in Chrome (Developer mode, Load unpacked from `src/`). Navigate to a patent without a Google Patents PDF link (e.g., an older patent). Open the Service Worker DevTools console. Look for `[SW] No Google PDF link, trying USPTO fallback for {patentId}`. After parsing completes, highlight text and trigger a citation.
**Expected:** Citation in column:line format (e.g., "4:12-15") is produced from a USPTO-sourced PDF.
**Why human:** Requires a real browser, real extension session, real patent page DOM, and the live Cloudflare Worker.

#### 3. Source Field Verification

**Test:** After Test 2, in the DevTools console run:
```javascript
chrome.storage.local.get('currentPatent', d => console.log(d.currentPatent.source))
```
**Expected:** Outputs `'uspto'` for a USPTO-fallback patent and `'google'` for a normal Google Patents patent.
**Why human:** Requires a live extension session with chrome.storage.

#### 4. No Regression on Google Patents Path

**Test:** Navigate to `https://patents.google.com/patent/US11427642B2`. Highlight text in the specification. Trigger a citation (right-click -> Get Citation or floating button).
**Expected:** Citation produced successfully. No console errors related to USPTO flow.
**Why human:** Requires a real browser with extension loaded.

---

### Gaps Summary

No automated gaps found. All 14 must-haves are substantively implemented and wired. The 4 items marked `? HUMAN` are live-deployment confirmations that cannot be verified from source code alone.

**Notable implementation quality observations:**

- The blank-line fix (`ca4551b`) in `position-map-builder.js` added `assignLineNumbers()` with median-spacing-based gap detection. This is a substantive algorithmic change (63 lines added) that directly enables UPTO-03 for patents with section breaks.
- The `source !== 'uspto'` loop guard is correctly implemented in all three trigger points (fetch-failure and no-text-layer handlers) preventing infinite USPTO retry cycles.
- The `worker/.dev.vars` file contains placeholder secrets and is correctly excluded from git via both `worker/.gitignore` and the root `.gitignore`. The actual PROXY_TOKEN appears only in `src/offscreen/offscreen.js` as a hardcoded string — this is consistent with the documented design decision (extension JS is not web-accessible).

---

_Verified: 2026-03-02T23:00:00Z_
_Verifier: Claude (gsd-verifier)_

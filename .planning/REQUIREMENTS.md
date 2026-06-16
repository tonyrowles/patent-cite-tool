# Requirements: Patent Citation Tool — v6.0 Standalone Citation Webapp

**Defined:** 2026-06-16
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — extended in v6.0 to a standalone web page: enter a patent number + a passage, get the exact column:line citation, no LLM.

## v1 Requirements

Requirements for the v6.0 release. Each maps to exactly one roadmap phase.

### Security Gate

Blocking preconditions — must close before any public URL is announced.

- [x] **SEC-01**: Compromised `PROXY_TOKEN` is rotated via `wrangler secret put`; the old token is invalidated and no token literal remains in committed source (`src/offscreen/offscreen.js`)
- [x] **SEC-02**: The extension build injects `PROXY_TOKEN` from a CI secret at build time (esbuild `define`) instead of from a committed constant
- [x] **SEC-03**: The webapp authenticates to the Worker via an Origin-header check — no `Authorization: Bearer` token appears in any browser-side webapp code
- [x] **SEC-04**: IP rate limiting (the existing `checkIpRateLimit` pattern) is applied to every webapp-accessible Worker route (USPTO proxy, cache GET, cache POST) before those routes are opened
- [x] **SEC-05**: A global daily KV-write guard protects the shared write quota (blocks new writes at a safe threshold below the free-tier 1,000/day limit)

### Shared Core Extraction

- [ ] **CORE-01**: `matching.js` and `position-map-builder.js` are relocated into `src/shared/` and consumed by the extension via the existing esbuild alias pattern — verbatim, no behavior change
- [ ] **CORE-02**: `pdf-parser.js` is relocated into `src/shared/` with its module-scope `chrome.runtime.getURL(...)` replaced by an injectable `configurePdfWorker(url)` seam (extension injects `chrome.runtime.getURL`, webapp injects its asset path) — importing the module in a plain web page no longer throws
- [ ] **CORE-03**: The 75-case golden corpus passes at 100% on the extension build after extraction, with the golden baseline snapshot byte-unchanged
- [ ] **CORE-04**: A full-pipeline browser-context integration test (PDF bytes → `extractTextFromPdf` → `buildPositionMap` → `matchAndCite`) is green, and PDF.js is confirmed running in a worker thread (not the main thread)

### Worker Public Routes

- [x] **WRKR-01**: `GET /webapp/pdf?patent=` public route proxies the USPTO PDF with Origin-header auth + IP rate limit
- [x] **WRKR-02**: `GET /cache?patent=` accepts an Origin header (webapp) OR a Bearer token (extension) and returns the cached position-map JSON
- [x] **WRKR-03**: `POST /cache` accepts webapp uploads tagged with a `source: "webapp"` provenance field, under rate limit
- [x] **WRKR-04**: The Worker rejects published-application numbers (kind code A1/A2/A9) with HTTP 400 before any USPTO fetch

### Webapp Core Flow

- [ ] **APP-01**: User can enter a patent number; the webapp normalizes it (strips commas/spaces/hyphens, uppercases, adds the `US` prefix, accepts it with or without a kind code)
- [ ] **APP-02**: Published-application numbers are rejected at the input stage with a clear "not supported yet" message before any network call
- [ ] **APP-03**: The webapp fetches the patent PDF exclusively via the Worker proxy (no direct `patentimages.storage.googleapis.com` / USPTO fetch — CORS-blocked)
- [ ] **APP-04**: The webapp checks the Worker `/cache` before fetching+parsing; a cache hit skips client-side parsing entirely
- [ ] **APP-05**: On a cache miss, the webapp parses the PDF client-side via PDF.js and computes the citation through the shared `matchAndCite` core
- [ ] **APP-06**: User can enter a passage and receive the column:line citation with a green/yellow/red confidence indicator using the same thresholds as the extension (≥0.95 green, ≥0.80 yellow, <0.80 red)
- [ ] **APP-07**: A no-match shows a helpful message; a network/parse failure shows an error state with a retry affordance
- [ ] **APP-08**: A loading/progress UI shows named stages ("Fetching patent PDF…", "Parsing PDF…", "Matching passage…")
- [ ] **APP-09**: User can copy the citation to the clipboard
- [ ] **APP-10**: The page shows trust signals — "deterministic, no AI inference" and a "no data stored" disclosure

### Citation Format & Prefix

- [ ] **FMT-01**: User can toggle the citation format between shorthand (`4:15-22`) and long form (`Col. 4, ll. 15-22`) — long form is a new code path, a pure transformation of the existing column/line integers
- [ ] **FMT-02**: User can toggle an optional patent-number prefix on the produced citation

### Batch Mode

- [ ] **BATCH-01**: User can enter multiple passages for a single patent and receive all citations at once via one fetch + one parse + N `matchAndCite` calls (no re-parse per passage)
- [ ] **BATCH-02**: Each batch result row shows its own confidence indicator
- [ ] **BATCH-03**: User can copy all batch citations at once

### Deploy & Live UAT

- [ ] **DEPLOY-01**: `scripts/build.js` is extended with a `buildWebapp()` step (and `--webapp-only`) producing `dist/webapp/` (`index.html`, the JS bundle, and the vendored `pdf.mjs` + `pdf.worker.mjs`)
- [ ] **DEPLOY-02**: `webapp/wrangler.toml` configures Cloudflare Workers Assets, and a `deploy:webapp` npm script is added
- [ ] **DEPLOY-03**: The webapp is live and publicly accessible at `cite.tonyrowles.com` via Workers Assets, coexisting with the existing `pct.tonyrowles.com` Worker
- [ ] **DEPLOY-04**: Live UAT proves: a real granted patent → correct citation with KV cache populated; batch mode with multiple passages; a published-application number → rejection (not a wrong citation); a rate-limit 429 after the threshold; and no `Authorization: Bearer` token in any webapp network request

### Privacy Disclosure

- [ ] **PRIV-01**: The hosted privacy policy gains a "Citation Webapp" section disclosing the new surface (no new personal data collected; patent PDFs proxied through the Worker; parsed position maps cached in shared KV)

## v2 Requirements

Deferred to a future release. Tracked but not in the v6.0 roadmap.

### Webapp Enhancements

- **WEBX-01**: Published-application paragraph citations on the webapp (requires a server-side `[XXXX]` paragraph-marker strategy — no two-column PDF scheme exists)
- **WEBX-02**: Determinate download progress bar (requires the Worker to forward `Content-Length` for USPTO PDF responses)
- **WEBX-03**: Shareable result links (`?patent=…&q=…` URL params)
- **WEBX-04**: Cancel button for long in-flight PDF fetches

## Out of Scope

Explicitly excluded for v6.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| React / Vue / any UI framework | Vanilla HTML + JS is sufficient; preserves the zero-new-dependency culture |
| Cloudflare Turnstile / CAPTCHA | IP rate limiting is sufficient abuse protection for v1 |
| File-upload of a local PDF | The Worker-proxy fetch path is the single supported acquisition route |
| Multi-patent batch (different patents in one batch) | Batch is scoped to many passages of ONE patent — one fetch + one parse |
| Citation history / user accounts / saved searches | Stateless single-purpose lookup tool; storage adds complexity with no core value |
| Published-application citations on the webapp (v1) | No two-column PDF column/line scheme; DOM `[XXXX]` markers aren't available server-side — deferred to WEBX-01 |
| Client-side analytics library | Cloudflare dashboard Worker analytics suffice; avoids a new dependency and a privacy surface |
| New npm dependencies | Seventh-consecutive zero-dep milestone target; PDF.js, esbuild, and Wrangler are already vendored/installed |

## Traceability

Which phases cover which requirements. **Populated by the roadmapper.**

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 6 | Verified |
| SEC-02 | Phase 6 | Verified |
| SEC-03 | Phase 6 | Verified |
| SEC-04 | Phase 6 | Verified |
| SEC-05 | Phase 6 | Verified |
| WRKR-01 | Phase 6 | Verified |
| WRKR-02 | Phase 6 | Verified |
| WRKR-03 | Phase 6 | Verified |
| WRKR-04 | Phase 6 | Verified |
| CORE-01 | Phase 7 | Pending |
| CORE-02 | Phase 7 | Pending |
| CORE-03 | Phase 7 | Pending |
| CORE-04 | Phase 7 | Pending |
| APP-01 | Phase 8 | Pending |
| APP-02 | Phase 8 | Pending |
| APP-03 | Phase 8 | Pending |
| APP-04 | Phase 8 | Pending |
| APP-05 | Phase 8 | Pending |
| APP-06 | Phase 8 | Pending |
| APP-07 | Phase 8 | Pending |
| APP-08 | Phase 8 | Pending |
| APP-09 | Phase 8 | Pending |
| APP-10 | Phase 8 | Pending |
| FMT-01 | Phase 8 | Pending |
| FMT-02 | Phase 8 | Pending |
| BATCH-01 | Phase 8 | Pending |
| BATCH-02 | Phase 8 | Pending |
| BATCH-03 | Phase 8 | Pending |
| DEPLOY-01 | Phase 9 | Pending |
| DEPLOY-02 | Phase 9 | Pending |
| DEPLOY-03 | Phase 9 | Pending |
| DEPLOY-04 | Phase 9 | Pending |
| PRIV-01 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 33 total
- Mapped to phases: 33 (roadmapper complete)
- Unmapped: 0 ✓

| Phase | Requirements | Count |
|-------|-------------|-------|
| Phase 6: Security Gate + Worker Auth Split | SEC-01..05, WRKR-01..04 | 9 |
| Phase 7: Shared Core Extraction + Corpus Guard | CORE-01..04 | 4 |
| Phase 8: Webapp Core Build | APP-01..10, FMT-01..02, BATCH-01..03 | 15 |
| Phase 9: Deploy + Live UAT + Privacy | DEPLOY-01..04, PRIV-01 | 5 |

---
*Requirements defined: 2026-06-16*
*Last updated: 2026-06-16 — traceability filled by roadmapper; 33/33 requirements mapped to Phases 6-9*

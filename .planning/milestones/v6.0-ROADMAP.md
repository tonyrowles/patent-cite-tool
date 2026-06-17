# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-01)
- ✅ **v1.1 Silent Mode + Infrastructure** — (shipped)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — (shipped)
- ✅ **v2.0 Firefox Port** — (shipped)
- ✅ **v2.1 CI/CD Pipeline** — (shipped)
- ✅ **v2.2 Matching Robustness** — (shipped)
- ✅ **v2.3 Post-v2.2 Hardening** — (shipped)
- ✅ **v3.0 Autonomous E2E Testing Agent** — Phases 26-31 (shipped 2026-05-20)
- ✅ **v3.1 LLM-Driven Product Improvement Loop** — Phases 32-38 (shipped 2026-05-30)
- ✅ **v4.0 Self-Healing Test Suite** — Phases 39-47 (shipped 2026-06-02)
- ✅ **v4.1 Readiness Gate + Push** — Phases 48-55 (shipped 2026-06-04)
- ✅ **v4.2 Auto-Fix Loop Live** — Phases 56-60 (shipped 2026-06-09)
- ⏸️ **v4.3 Auto-Fix Loop Closure + Capability Expansion** — Phases 61-67 (6/7 shipped; PAUSED 2026-06-12, resumes in v5.1)
- ✅ **v5.0 Bug Report Feature** — Phases 1-5 (shipped 2026-06-15)
- 🚧 **v6.0 Standalone Citation Webapp** — Phases 6-9 (in progress)

> Phase numbering: v5.0 used a reset (Phases 1-5). v6.0 continues from 5 → Phases 6-9 to resume cross-milestone continuity. v4.3 paused phases (61-67) archived at `.planning/milestones/v4.3-phases-paused/`.

## Phases

<details>
<summary>✅ v5.0 Bug Report Feature (Phases 1-5) — SHIPPED 2026-06-15</summary>

- [x] Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork (3/3 plans) — completed 2026-06-13
- [x] Phase 2: Shared Constants + Pure Payload Builder (1/1 plan) — completed 2026-06-13
- [x] Phase 3: Background Submission Handler + Rate Limit + Retry Queue (3/3 plans) — completed 2026-06-13
- [x] Phase 4: Report Dialog UI + Citation-UI Wiring (4/4 plans) — completed 2026-06-13
- [x] Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT (5/5 plans) — completed 2026-06-14

Full detail: `.planning/milestones/v5.0-ROADMAP.md` · Requirements: `.planning/milestones/v5.0-REQUIREMENTS.md`

</details>

> Earlier milestones (v1.0–v4.2) archived under `.planning/milestones/`. v4.3 paused-phase artifacts at `.planning/milestones/v4.3-phases-paused/`.

---

### 🚧 v6.0 Standalone Citation Webapp (In Progress)

**Milestone Goal:** Ship a public web page at `cite.tonyrowles.com` where a user enters a patent number + text passage and receives the exact column:line citation — reusing the extension's deterministic matching core with no LLM. Granted US patents only (v1). Zero new npm dependencies (seventh consecutive milestone).

**Key locked decisions:**
- Shared core uses plain `src/shared/` + esbuild alias (NOT npm workspaces)
- Deployment subdomain: `cite.tonyrowles.com` via Cloudflare Workers Assets
- Webapp auth: Origin-header check only (no embeddable Bearer token in any browser-side code)
- Published applications rejected at BOTH input (webapp) AND Worker level (HTTP 400)
- Zero new npm dependencies

**Forced build order (hard dependency chain):**
```
Phase 6 (security gate + Worker routes) → Phase 7 (shared core extraction)
  → Phase 8 (webapp core build) → Phase 9 (deploy + live UAT)
```

Phase 6 is a blocking precondition: the Worker has no rate limiting on proxy/cache routes, and `PROXY_TOKEN` is already compromised. Neither Phase 7 nor Phase 8 can reach production until Phase 6 is complete. Phase 7 is the foundation every webapp import depends on; Phase 8 cannot be promoted to production until Phase 7 is green. Phase 9 runs last — deploy once, after both Phase 7 and Phase 8 are verified.

---

## Phase Summary

- [x] **Phase 6: Security Gate + Worker Auth Split** - Rotate compromised PROXY_TOKEN, add rate limiting on all webapp-accessible Worker routes, and add public Origin-auth routes for the webapp (no token in browser JS) (completed 2026-06-16)
- [x] **Phase 7: Shared Core Extraction + Corpus Guard** - Extract matching.js, position-map-builder.js, pdf-parser.js into src/shared/ with a configurePdfWorker(url) seam; golden corpus passes 100% on both builds (completed 2026-06-16)
- [x] **Phase 8: Webapp Core Build** - Build the standalone webapp (patent number entry, cache-first pipeline, client-side PDF.js parsing, citation display, batch mode, format toggle, copy-to-clipboard) (3 plans) (completed 2026-06-16)
- [x] **Phase 9: Deploy + Live UAT + Privacy** - Deploy dist/webapp/ to cite.tonyrowles.com via Workers Assets; run live end-to-end UAT; update privacy policy (completed 2026-06-16)

## Phase Details

### Phase 6: Security Gate + Worker Auth Split
**Goal**: The Worker and extension build pipeline are secured before any public webapp URL exists — rotated PROXY_TOKEN, rate-limited public routes, Origin-header auth for webapp callers, and published-application rejection at the Worker level
**Depends on**: Nothing (first phase of this milestone)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, WRKR-01, WRKR-02, WRKR-03, WRKR-04
**Success Criteria** (what must be TRUE):
  1. `wrangler secret put PROXY_TOKEN` is complete with a new value; `grep -r 'PROXY_TOKEN' src/` returns zero literal token strings (only the `define` injection reference)
  2. The extension CI build injects `PROXY_TOKEN` from a GitHub Actions secret via esbuild `define`; no token literal exists in any committed source file
  3. `GET /webapp/pdf?patent=` and `GET /cache?patent=` (Origin-header path) return 200 from `pct.tonyrowles.com` when called with `Origin: https://cite.tonyrowles.com`; both routes return 429 after the per-IP rate-limit threshold is crossed
  4. `POST /cache` and `POST /report` continue to require a valid Bearer PROXY_TOKEN; a request with no token returns 401
  5. A request to any Worker route with a published-application number (kind code A1/A2/A9) returns HTTP 400 before any USPTO fetch
**Plans**: 4 plans
  - [x] 06-01-PLAN.md — Token rotation code: esbuild __PROXY_TOKEN__ define + fail-loud guard, remove 3 literals, .gitignore + CI env wiring (SEC-01 code, SEC-02)
  - [x] 06-02-PLAN.md — Worker per-route auth split: Origin auth + webappCorsHeaders, GET /webapp/pdf, dual-auth GET /cache, POST /cache source:"webapp", webapp rate limit + daily write guard + published-app 400 (SEC-03/04/05, WRKR-01..04)
  - [x] 06-03-PLAN.md — Miniflare security-gate integration tests + SEC-02 build-smoke (WRKR-01..04, SEC-02/04/05)
  - [x] 06-04-PLAN.md — Human verification: GitHub secret + live wrangler secret put rotation + grep gate + auth smoke (SEC-01 live)
**UI hint**: no

### Phase 7: Shared Core Extraction + Corpus Guard
**Goal**: The three deterministic core modules live in `src/shared/` and are consumed via esbuild alias by both the extension and the webapp — proven correct by the golden corpus on both build paths and by a full-pipeline browser integration test
**Depends on**: Phase 6 (PROXY_TOKEN rotation must be complete so extension builds using the new injection pattern are green before the import paths change)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04
**Success Criteria** (what must be TRUE):
  1. `src/shared/` contains `matching.js`, `position-map-builder.js`, and `pdf-parser.js`; `src/offscreen/pdf-parser.js` and `src/offscreen/position-map-builder.js` no longer exist as independent files (or are re-export shims only)
  2. `pdf-parser.js` exports a `configurePdfWorker(url)` function; importing the module in a plain web page (no `chrome` global) does NOT throw — the `chrome.runtime.getURL` call is not at module scope
  3. `npm test` passes at 100% (all four suites: test:src, test:chrome, test:firefox, test:lint); `tests/golden/baseline.json` is byte-identical to the pre-extraction baseline
  4. A full-pipeline browser integration test (PDF bytes → `extractTextFromPdf` → `buildPositionMap` → `matchAndCite`) is green; Chrome DevTools Threads panel confirms PDF.js runs in a worker thread (not main thread) during the test
**Plans**: 2 plans
  - [x] 07-01-PLAN.md — Relocate position-map-builder.js + pdf-parser.js to src/shared/ with configurePdfWorker seam; rewire callers; import-safety test; corpus byte-identical [CORE-01/02/03]
  - [x] 07-02-PLAN.md — CORE-04 full-pipeline browser integration test (Playwright page.on('worker') asserts pdf.worker.mjs; citation 1:37) [CORE-04]
**UI hint**: no

### Phase 8: Webapp Core Build
**Goal**: The standalone webapp is fully functional in a local browser — patent number entry, cache-first lookup, client-side PDF.js parsing via the shared core, citation display with confidence indicator, batch mode, format toggle, copy-to-clipboard, and published-application rejection at the input layer
**Depends on**: Phase 7 (shared core must exist and be proven correct before webapp imports from it); Phase 6 Worker routes must be deployed before end-to-end network integration testing
**Requirements**: APP-01, APP-02, APP-03, APP-04, APP-05, APP-06, APP-07, APP-08, APP-09, APP-10, FMT-01, FMT-02, BATCH-01, BATCH-02, BATCH-03
**Success Criteria** (what must be TRUE):
  1. A user can enter a valid granted patent number (with or without kind code, with commas/spaces) and receive the correct column:line citation for a text passage; the confidence indicator is green/yellow/red using the same thresholds as the extension (≥0.95 / ≥0.80 / <0.80)
  2. Entering a published-application number (A1/A2/A9 kind code or `20XXXXXXXX` format) immediately shows "not supported yet" — no network call is made, no wrong citation is produced
  3. Batch mode accepts multiple passages for one patent; one fetch + one parse + N `matchAndCite` calls produces per-row citations; "copy all" works; no re-parse per passage
  4. Network inspector shows no `Authorization: Bearer` header in any webapp request to `pct.tonyrowles.com`; all PDF fetches go through `GET /webapp/pdf?patent=` (not `patentimages.storage.googleapis.com`)
  5. `scripts/build.js --webapp-only` produces `dist/webapp/` with `index.html`, the JS bundle, `lib/pdf.mjs`, and `lib/pdf.worker.mjs`; `webapp/wrangler.toml` references `dist/webapp/` as the Workers Assets directory
**Plans**: 3 plans
  - [x] 08-01-PLAN.md — Build target + scaffold: scripts/build.js --webapp-only (token-bypass), webapp/index.html (full UI-SPEC + inline styles), wrangler.toml [assets], zero-dep guard [APP-10; success criterion 5]
  - [x] 08-02-PLAN.md — Core pure logic + unit tests: normalizePatentInput, isPublishedApplication, formatCitationLong (cross-column resolved), BATCH-01 single-parse/N-match invariant [APP-01/02, FMT-01, BATCH-01]
  - [x] 08-03-PLAN.md — Orchestration + results UI: cache-first pipeline, confidence chips, copy/copy-all, no-match/error/retry, named-stage loading, format/prefix toggles (localStorage) [APP-03..09, FMT-02, BATCH-02/03]
**UI hint**: yes

### Phase 9: Deploy + Live UAT + Privacy
**Goal**: The webapp is publicly live at `cite.tonyrowles.com`, the privacy policy is updated, and live UAT proves the full citation pipeline — real patent → correct citation → KV cache populated; batch mode; published-application rejection; rate-limit 429; no Authorization header in any network request
**Depends on**: Phase 8 (webapp build must be complete and verified locally); Phase 6 (Worker routes must be deployed to production)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, PRIV-01
**Success Criteria** (what must be TRUE):
  1. `https://cite.tonyrowles.com` is publicly accessible and returns the citation webapp; `npm run deploy:webapp` is the documented deploy command
  2. Live UAT against production: a real granted patent (e.g., US12505414B2) + a text passage returns the correct column:line citation; the KV cache for that patent is populated after the parse (confirmed via `wrangler kv key get --remote`)
  3. Live UAT: batch mode with at least 3 passages for one patent returns 3 distinct citations without re-fetching the PDF
  4. Live UAT: a published-application number shows the "not supported" message (not a wrong citation); a rapid series of requests to the same route returns HTTP 429 from the Worker after the rate limit is crossed
  5. The hosted privacy policy at the stable public URL includes a "Citation Webapp" section disclosing the new surface (no new personal data collected; patent PDFs proxied via Worker; parsed position maps cached in shared KV)
**Plans**: TBD
**UI hint**: no

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Worker Route + KV Schema + Privacy Compliance | v5.0 | 3/3 | Complete | 2026-06-13 |
| 2. Shared Constants + Pure Payload Builder | v5.0 | 1/1 | Complete | 2026-06-13 |
| 3. Background Submission Handler + Rate Limit + Retry Queue | v5.0 | 3/3 | Complete | 2026-06-13 |
| 4. Report Dialog UI + Citation-UI Wiring | v5.0 | 4/4 | Complete | 2026-06-13 |
| 5. Options Page Debug Mode + Popup Fallback + Live UAT | v5.0 | 5/5 | Complete | 2026-06-14 |
| 6. Security Gate + Worker Auth Split | v6.0 | 4/4 | Complete   | 2026-06-16 |
| 7. Shared Core Extraction + Corpus Guard | v6.0 | 2/2 | Complete   | 2026-06-16 |
| 8. Webapp Core Build | v6.0 | 3/3 | Complete   | 2026-06-16 |
| 9. Deploy + Live UAT + Privacy | v6.0 | 0/TBD | Not started | - |

## Backlog

> Phase 999.1 (standalone citation webapp) promoted to v6.0 milestone (Phases 6-9). Backlog cleared.

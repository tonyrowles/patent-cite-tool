# Project Research Summary

**Project:** Patent Citation Tool — v6.0 Standalone Citation Webapp
**Domain:** Client-side PDF.js webapp reusing a deterministic patent-citation matching core; hosted on Cloudflare Workers Assets; talking to the existing pct.tonyrowles.com Worker as a thin USPTO proxy
**Researched:** 2026-06-16
**Confidence:** HIGH (all four research files derived from direct source reads of the production codebase and verified official Cloudflare documentation; no inference-only claims in the blocking gates)

---

## Executive Summary

v6.0 ships a public web page where a user enters a US patent number plus a text passage and receives an exact column:line citation — reusing the extension's deterministic matching core with no LLM inference. The codebase already contains everything needed: PDF.js v5.5.207 vendored in `src/lib/`, three pure-function modules (`matching.js`, `position-map-builder.js`, `pdf-parser.js`) that are trivially portable, and a Cloudflare Worker at `pct.tonyrowles.com` that already proxies USPTO PDFs and maintains a KV cache. The milestone's first task is not building new product — it is fixing two pre-existing security defects that block any public exposure: a compromised `PROXY_TOKEN` committed in plaintext to the repo, and zero rate-limiting on the Worker's USPTO-proxy and KV-cache routes.

The recommended build path is: (1) security gate first (rotate the token, add rate limiting on the Worker, split auth tiers), (2) extract the shared core into `packages/citation-core/` with the golden corpus as the correctness guard — this is the foundation every downstream phase depends on, (3) build the Worker's new public routes for the webapp, (4) build the webapp UI (`webapp/` directory, plain HTML + vanilla JS, esbuild bundle), (5) deploy to `cite.tonyrowles.com` via Cloudflare Workers Assets and run live UAT. Cloudflare Pages is confirmed blocked for `pct.tonyrowles.com` (Cloudflare known-issue: Pages cannot share a custom domain with a routed Worker) — Workers Assets on a new subdomain is the only viable Cloudflare static-hosting path. Zero new npm dependencies are required throughout.

The dominant risks are the two security gates and the shared-core extraction. If the `PROXY_TOKEN` is not rotated before the webapp goes public, any token embedded in public JavaScript is trivially extractable, giving attackers free access to the USPTO proxy and the ability to poison the shared KV cache. The core extraction carries a subtler risk: `pdf-parser.js` has a single `chrome.runtime.getURL` call at **module scope** that throws on import in a plain web page — it must be refactored into an injectable `configurePdfWorker(url)` call. The other two modules are 100% pure and move without modification. The 75-case golden corpus does not exercise the PDF-to-position-map pipeline end-to-end in a browser context, so a full-pipeline integration test is a required definition-of-done criterion for the extraction phase.

---

## Blocking Gates (Must Resolve Before Public Deployment)

These are not phase features — they are preconditions. No public URL should be announced until both are closed.

### Gate 1: PROXY_TOKEN Rotation + Auth Tier Split

**What:** `src/offscreen/offscreen.js:24` contains the token as a plaintext string literal committed to the repo. It is already in distributed extension bundles and must be treated as fully compromised. The webapp cannot embed any token — browser DevTools makes webpage JS trivially readable.

**Fix:**
1. Rotate via `wrangler secret put PROXY_TOKEN` (Worker reads from `env.PROXY_TOKEN` already — no Worker code change for rotation itself).
2. Add new **public, rate-limited Worker routes** for the webapp (`GET /webapp/pdf?patent=` and `GET /cache` with Origin-header auth in place of Bearer token). The extension continues using Bearer token on existing routes.
3. Remove the hardcoded constant from `offscreen.js`; inject new token at build time via esbuild `define` from CI secrets.

**Confidence:** HIGH — PROXY_TOKEN location confirmed at `src/offscreen/offscreen.js:24`; Worker auth pattern confirmed at `worker/src/index.js:524-533`.

### Gate 2: Rate Limiting on Worker Routes Used by Webapp

**What:** The existing Worker has IP-rate-limiting (`checkIpRateLimit`) only on the `/report` route. The USPTO proxy (`GET /?patent=`) and KV cache routes have no rate limiting. Opening these to a public webapp without rate limiting risks KV write-quota exhaustion (1,000 writes/day on Cloudflare free tier) within hours of launch.

**Fix:** Replicate the existing `checkIpRateLimit` pattern on all webapp-accessible routes before opening them:
- USPTO proxy route: max 10 requests/minute/IP
- KV cache GET route: max 60/minute/IP
- KV cache POST route: max 5/minute/IP + global daily write-counter guard (block at 800/day to protect extension quota)

**Confidence:** HIGH — confirmed by direct read of `worker/src/index.js`; `checkIpRateLimit` only on `/report`.

---

## Key Findings

### Recommended Stack

No new npm dependencies are needed. The entire webapp is buildable with existing tools: esbuild `^0.27.3` (extend `scripts/build.js` with a `buildWebapp()` function), pdfjs-dist `5.5.207` (already vendored in `src/lib/`), and Wrangler `^4.69.0` (already used for the Worker). Static hosting uses Cloudflare Workers Assets at a new subdomain, configured with a single `webapp/wrangler.toml` file pointing `[assets] directory = "../dist/webapp"`.

**Core technologies:**
- **pdfjs-dist 5.5.207 (vendored, not new):** Client-side PDF parsing in browser — already in `src/lib/`; same `pdf.mjs` + `pdf.worker.mjs` files copied to `dist/webapp/lib/`
- **esbuild ^0.27.3 (existing):** Build webapp JS bundle — add `buildWebapp()` to `scripts/build.js`; format ESM, single entry `webapp/src/main.js`, external `./lib/pdf.mjs`
- **Cloudflare Workers Assets (infrastructure, not npm):** Static hosting at `cite.tonyrowles.com` — coexists with `pct.tonyrowles.com`; configured via `webapp/wrangler.toml`
- **Cloudflare KV PATENT_CACHE (existing):** Shared position-map cache — webapp hits the same cache as the extension; popular patents will already be warm from extension users

**What does NOT change:** The `pct.tonyrowles.com` Worker URL, `src/shared/matching.js` logic, pdfjs-dist version, Vitest harness.

**What changes:**
- `src/offscreen/pdf-parser.js` → `packages/citation-core/pdf-parser.js`: remove `chrome.runtime.getURL` at module scope; add exported `configurePdfWorker(url)` for callers
- `src/offscreen/position-map-builder.js` → `packages/citation-core/position-map-builder.js`: verbatim move
- `src/shared/matching.js` → `packages/citation-core/matching.js`: verbatim move
- `worker/src/index.js`: new `/webapp/pdf` route (origin-auth, IP rate-limited); `GET /cache` accepts Origin header OR Bearer; rotated PROXY_TOKEN
- `scripts/build.js`: add `buildWebapp()` + `--webapp-only`
- `package.json` (root): workspace configuration for shared package (exact approach TBD — see Gaps)

### Expected Features

**Must have (table stakes):**
- Patent number normalization (strip commas/spaces/hyphens, add US prefix, uppercase, accept with/without kind code)
- Kind-code detection: A1/A2/A9 → "Published applications not supported" message before any network call; enforced at BOTH input and Worker level
- Single passage → citation result with green/yellow/red confidence indicator (≥0.95 green, ≥0.80 yellow, <0.80 red — mirrors extension thresholds exactly)
- Citation format toggle: `4:15-22` shorthand vs `Col. 4, ll. 15-22` long form — **NEW feature, not yet in any surface; webapp is the first to ship it**
- Optional patent number prefix checkbox
- Copy-to-clipboard for single result
- Loading/progress UI with named stage labels ("Fetching patent PDF..." / "Parsing PDF..." / "Matching passage...") — table stakes; PDFs are 5-30 MB
- No-match state with helpful message; network/parse error state with retry
- Batch mode: N passage rows, shared PDF parse, per-row citation results, copy-all (one fetch + one parse + N `matchAndCite` calls — not a new pipeline)
- "Deterministic — no AI inference" trust signal, "no data stored" disclosure

**Should have (competitive differentiators):**
- `source: "webapp"` provenance field in KV cache uploads (for debugging cross-surface cache poisoning)
- "Loaded from cache" status note on fast KV cache hit

**Defer to v1.x (post-launch validation):**
- Determinate download progress bar (requires Worker to forward `Content-Length` — open question; see Gaps)
- Published application paragraph citations (requires DOM TreeWalker on live Google Patents page — impossible from standalone webapp)
- Cancel button for long PDF fetches, shareable links

**Confirmed anti-features (do not build in v1):**
- React / Vue / any UI framework (vanilla HTML + JS is sufficient)
- Cloudflare Turnstile (IP rate limiting is sufficient)
- File upload, multi-patent batch, citation history, user accounts

### Architecture Approach

The architecture is a platform-adapter pattern over a pure core: the deterministic matching core is kept pure — zero browser or extension APIs. Platform-specific adapters (extension offscreen, extension Firefox background, webapp `main.js`) wrap the core with their environment's fetch/storage mechanisms. The webapp is a new adapter, not a fork.

The webapp data flow follows cache-first, parse-on-miss: (1) GET `/cache?patent=` → hit returns position map JSON, skip steps 2-5; (2) miss → GET `/webapp/pdf?patent=` (Worker proxy, origin-auth, no Bearer token); (3) client-side `extractTextFromPdf(arrayBuffer)`; (4) `buildPositionMap(pageResults)`; (5) fire-and-forget `POST /cache` with `source: "webapp"` provenance; (6) `matchAndCite(passage, positionMap)`. Batch mode runs step 6 N times on the shared position map.

**Key architectural constraint:** CORS blocks direct Google Patents PDF fetches from a web page (`patentimages.storage.googleapis.com` does not set `Access-Control-Allow-Origin`). The Worker proxy is not optional — it is the only viable PDF acquisition path for the webapp.

**Major components:**
1. `packages/citation-core/` — shared pure-JS package: `pdf-parser.js` (with `configurePdfWorker(url)` seam), `position-map-builder.js`, `matching.js`
2. `webapp/src/main.js` — webapp orchestration; sets `GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.mjs'`
3. `webapp/src/worker-client.js` — Worker API calls with Origin header auth (no Bearer token)
4. `webapp/src/pdf-fetch.js` — PDF acquisition via Worker proxy only
5. `worker/src/index.js` (modified) — new `/webapp/pdf` route; split `GET /cache` auth; rotated PROXY_TOKEN
6. `webapp/wrangler.toml` (new) — Workers Assets config; `cite.tonyrowles.com` custom domain

### Critical Pitfalls

1. **`pdf-parser.js` module-scope `chrome.runtime.getURL` throws on import in a plain web page** — the line is at module scope (top-level, executed on import). In a plain web page, `chrome` is undefined and the import throws before any function is called. Prevention: refactor into `configurePdfWorker(url)` exported function; do not treat the three files as uniformly portable.

2. **Embedding any token in webapp JS defeats the rotation** — any string literal in public JavaScript is extractable via browser DevTools. Prevention: Origin-header auth + IP rate limit for webapp routes; no `Authorization: Bearer` in any browser-side code.

3. **No rate limiting on public Worker routes = KV write-quota exhaustion at launch** — free-tier 1,000 KV writes/day can be consumed in hours by modest public traffic. Prevention: apply `checkIpRateLimit` pattern to all webapp-accessible routes before announcing any public URL.

4. **The 75-case golden corpus does not exercise the PDF→position-map pipeline in a browser context** — the corpus validates matching logic given fixture-based position maps; it does NOT prove PDF.js parsing in a plain browser `<script type="module">` produces the same position maps as the extension's offscreen-document context. Prevention: full-pipeline integration test is required DoD for the extraction phase.

5. **Published-application rejection must be enforced at BOTH input and Worker level** — `buildPositionMap()` on a published-application PDF produces plausible-looking but wrong column:line citations (published apps use paragraph numbers, not two-column layout). This is worse than an error. Prevention: kind-code check at input stage + HTTP 400 from Worker for A1/A2/A9 numbers.

6. **PDF.js worker URL misconfiguration fails silently** — if `GlobalWorkerOptions.workerSrc` is wrong or empty, PDF.js falls back to main-thread parsing without throwing, freezing the UI for 5-20 seconds on large patents. Prevention: verify worker thread in Chrome DevTools Threads panel; test with a real 10+ MB patent PDF before marking extraction phase done.

---

## Implications for Roadmap

The research is unusually specific about build order because the blocking gates create hard dependency edges. The roadmapper should treat this as a forced sequence, not a negotiable grouping.

### Forced Build Order

```
Gate (security) → Phase 1 (shared core extraction) → Phase 2 (Worker public routes) → Phase 3 (webapp build) → Phase 4 (deploy + live UAT)
```

Phases 2 and 3 can overlap (webapp can be developed against a stubbed Worker), but neither can go to production until both are complete.

---

### Phase 1: Security Gate + Worker Auth Split

**Rationale:** Both blocking gates must be closed before any webapp code calls the production Worker. This delivers no user value — it is a precondition for everything else.

**Delivers:**
- Rotated PROXY_TOKEN deployed via `wrangler secret put` — old token invalidated
- Extension build pipeline updated to inject new token from CI secrets (not committed)
- New Worker routes: `GET /webapp/pdf?patent=` (origin-auth, IP rate-limited), `GET /cache` accepts Origin header OR Bearer
- IP rate limiting on all webapp-accessible routes
- Per-route CORS decisions documented in Worker source

**Avoids:** Pitfalls 1 (token exposure), 2 (rate-limit abuse), 10 (undocumented CORS widening)

**Research flag:** Standard patterns — all route patterns exist in the Worker already. Implementation is additive.

---

### Phase 2: Shared Core Extraction + Corpus Guard

**Rationale:** The webapp imports from `packages/citation-core/`. This package must exist and be proven correct before any webapp feature work begins. It is also a refactor of the extension (moving three files, updating import paths) — isolation here keeps the extension regression surface clean.

**Delivers:**
- `packages/citation-core/` with `pdf-parser.js` (+ `configurePdfWorker(url)` seam), `position-map-builder.js` (verbatim), `matching.js` (verbatim)
- Extension imports updated to shared package path
- Vitest alias configs updated to new package paths
- 75-case golden corpus passes at 100% on BOTH extension build AND shared package in isolation
- Full-pipeline integration test (PDF bytes → `extractTextFromPdf` → `buildPositionMap` → `matchAndCite` in browser context) — new DoD gate, no precedent in repo

**DoD gate:** `npm test` passes identically to pre-extraction; golden baseline snapshot unchanged; full-pipeline browser integration test green; DevTools Threads confirms PDF.js runs in a worker thread during parsing.

**Avoids:** Pitfalls 3 (extraction behavior drift), 4 (PDF.js worker misconfiguration), 6 (large PDF memory/CPU pressure), 7 (matching logic re-implementation drift)

**Research flag:** The `configurePdfWorker()` seam is the only non-trivial code change. The full-pipeline integration test is new infrastructure — plan time for test harness setup. Workspace approach decision must be locked before writing this phase's plan (see Gaps).

---

### Phase 3: Webapp Core Build

**Rationale:** With the shared core available and Worker public routes deployed, the webapp can be built and tested end-to-end.

**Delivers:**
- `webapp/src/index.html`, `webapp/src/main.js`, `webapp/src/worker-client.js`, `webapp/src/pdf-fetch.js`
- `scripts/build.js` extended with `buildWebapp()` + `--webapp-only`
- `dist/webapp/` output: `index.html`, `js/main.js`, `lib/pdf.mjs`, `lib/pdf.worker.mjs`
- `webapp/wrangler.toml` — Workers Assets config
- All v1 features: single citation flow, batch mode, confidence indicator, copy-to-clipboard, citation format toggle (shorthand vs long form — new `formatCitation` code path), patent number prefix, loading/progress UI, no-match state, error state with retry, published-application rejection, trust signals

**DoD gate:** Full end-to-end test with a real patent number → correct citation; batch mode with 3 passages; published application number → rejection message (not wrong citation); network inspector confirms no `Authorization: Bearer` in any webapp request; DevTools Threads confirms PDF.js worker thread.

**Avoids:** Pitfalls 4 (PDF.js worker URL), 5 (CORS/direct Google Patents fetch), 8 (published-application scope creep), 9 (KV cache provenance — `source: "webapp"` in upload payload)

**Research flag:** Standard patterns throughout. The citation format toggle (`Col. 4, ll. 15-22`) is the only genuinely new code — a pure transformation of existing `startEntry`/`endEntry` integers.

---

### Phase 4: Deploy + Live UAT

**Rationale:** Deploy `dist/webapp/` to Cloudflare Workers Assets at `cite.tonyrowles.com` and run live end-to-end verification.

**Delivers:**
- `cite.tonyrowles.com` live and publicly accessible
- `deploy:webapp` npm script in root `package.json`
- Live UAT: real patent → correct citation → KV cache populated; batch mode; published application → rejection; rate-limit 429 after threshold

**Research flag:** Deployment is one `wrangler deploy` command. Exact subdomain confirmation needed before DNS setup (see Gaps).

---

### Phase Ordering Rationale

- Security gate before everything: the PROXY_TOKEN is already compromised; a second artifact (the webapp) must not enter the world while the Worker is unprotected.
- Shared core extraction before webapp: the webapp imports from the shared package; building the webapp before the package exists couples the extraction to the webapp build and obscures the extension regression surface.
- Worker public routes concurrent with or before webapp: the routes don't need to be on production for webapp development (can mock), but must be deployed before the webapp calls production.
- Deploy last: Workers Assets deploy is a single command; do it once after both Phase 2 and Phase 3 are verified.

### Research Flags

**Phases needing attention during planning:**
- **Phase 2 (shared core extraction):** Workspace-vs-plain-directory decision is unresolved — lock before writing phase plans. Full-pipeline integration test is new infrastructure with no precedent in the repo.
- **Phase 4 (deploy):** Exact subdomain and DNS setup steps need confirming against Cloudflare account before the phase begins.

**Standard patterns (no deeper research needed):**
- Phase 1 (security gate): all patterns exist in the Worker already
- Phase 3 (webapp build): all patterns follow the existing extension build; no framework, no new tools

---

## Watch Out For

Cross-document convergence points that are most likely to cause implementation failures:

| Risk | Evidence | Prevention |
|------|----------|------------|
| `pdf-parser.js` module-scope `chrome.runtime.getURL` throws on browser import | STACK Q2, ARCHITECTURE §1, PITFALLS #3 (3 independent confirmations) | `configurePdfWorker(url)` seam; do not treat the three files as uniformly portable |
| Token embedded in webapp JS | STACK Q5, ARCHITECTURE §4, PITFALLS #1 | Origin header + IP rate limit for webapp; no `Authorization: Bearer` in browser-side code |
| No rate limiting on public Worker routes | STACK Q5, PITFALLS #2 | Replicate `checkIpRateLimit` on all webapp-accessible routes before deploying |
| Cloudflare Pages blocked on pct.tonyrowles.com | STACK Q1 | Workers Assets on `cite.tonyrowles.com` (new subdomain) — only viable static-hosting path |
| Direct Google Patents PDF fetch CORS-blocked | STACK Q2, PITFALLS #5 | ALL PDF fetches via Worker proxy; no `patentimages.storage.googleapis.com` in webapp code |
| 75-case corpus does not cover browser-context PDF parsing | ARCHITECTURE §9, PITFALLS #3 | Full-pipeline integration test required as DoD for Phase 2 |
| Published-application wrong citations look plausible | FEATURES scope, PITFALLS #8 | Reject at input (kind-code) AND Worker (HTTP 400); never run `buildPositionMap` on application PDFs |
| Long-form citation format is new, not in any existing surface | FEATURES citation format section | Pure wrapper around existing `startEntry`/`endEntry` integers; no behavior change to existing `formatCitation` |
| KV write provenance lost without `source` field | PITFALLS #9 | `source: "webapp"` on all webapp KV upload payloads |
| PDF.js main-thread fallback is silent | PITFALLS #4 | Verify worker thread in DevTools Threads panel; test with 10+ MB PDF |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All critical facts from direct source reads + official Cloudflare docs; Pages domain conflict from Cloudflare's own known-issues page |
| Features | HIGH | Codebase authoritative for matching core, confidence thresholds, `formatCitation`; loading-state UX conventions at MEDIUM |
| Architecture | HIGH | Derived entirely from direct reading of production source files; no inference-only claims in critical paths |
| Pitfalls | HIGH (1-3, 5-6, 10) / MEDIUM (4, 7-9) | MEDIUM pitfalls are architecture-reasoned from code + PDF.js patterns |

**Overall confidence:** HIGH

### Gaps to Address

| Gap | How to Handle |
|-----|---------------|
| Workspace approach: npm workspaces (`@pct/citation-core`) vs plain `src/shared/` extension with esbuild alias — STACK says no workspaces (symlink complexity); ARCHITECTURE says use workspaces (clean import paths) | Lock before Phase 2 plan. Recommendation: plain `src/shared/` extension (STACK wins — workspaces interact poorly with per-target Vitest alias configs already in place) |
| Exact deployment subdomain — research recommends `cite.tonyrowles.com` but not locked | Confirm with DNS configuration before Phase 4 plan |
| `Content-Length` header forwarding from Worker — determines if determinate progress bar is possible | Defer to v1.x; use named-stage spinner for v1 |
| Privacy policy update for public webapp | Add "Citation Webapp" section before public launch (no new data collected, but disclosure should be explicit) |
| Analytics / traffic visibility | Cloudflare dashboard Worker analytics sufficient for v1; no client-side library needed |

---

## Sources

### Primary (HIGH confidence — direct source reads)

- `src/offscreen/offscreen.js` — PROXY_TOKEN at line 24 (plaintext string literal); Worker URL; fetch call patterns
- `src/offscreen/pdf-parser.js` — `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` at module scope line 14
- `src/offscreen/position-map-builder.js` — 786 lines, zero `chrome.*`, 100% pure
- `src/shared/matching.js` — 729 lines, zero browser APIs, `formatCitation` shorthand only (long-form is new for v6.0)
- `worker/src/index.js` — Bearer auth ALL routes lines 524-533; `checkIpRateLimit` only on `/report`; `corsHeaders()` = `Access-Control-Allow-Origin: *`
- `scripts/build.js` — `buildChrome()` + `buildFirefox()` pattern; `external: ['../lib/pdf.mjs']`
- `package.json` (root) — no `workspaces` field; esbuild `^0.27.3`; pdfjs-dist `^5.5.207`
- `src/lib/` listing — `pdf.mjs` (424 KB), `pdf.worker.mjs` (1.05 MB) at pdfjs-dist 5.5.207
- `src/content/citation-ui.js` — confidence thresholds lines 152-153
- `src/content/patent-info.js` — kind-code detection: A1/A2/A9 = published application
- `.planning/PROJECT.md` — v6.0 scope, constraints, PROXY_TOKEN compromise acknowledged

### Primary (HIGH confidence — official Cloudflare documentation)

- [Cloudflare Pages Known Issues](https://developers.cloudflare.com/pages/platform/known-issues/) — "Custom domains cannot be added if a Worker is already routed on that domain"
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) — multiple Workers on different subdomains confirmed compatible
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — `[assets]` TOML config
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — `wrangler secret put` rotation pattern

### Secondary (MEDIUM confidence — architecture-reasoned)

- CORS behavior of `patentimages.storage.googleapis.com` — no `Access-Control-Allow-Origin` for third-party origins; confirmed by browser CORS model + extension `host_permissions` contrast
- PDF.js `GlobalWorkerOptions.workerSrc = ''` or invalid URL → silent main-thread fallback — consistent with PDF.js v5 documentation and widely documented in GitHub issues
- KV free-tier 1,000 writes/day limit — from prior v5.0 PITFALLS.md research; applicable unchanged

---

*Research completed: 2026-06-16*
*Ready for roadmap: yes*

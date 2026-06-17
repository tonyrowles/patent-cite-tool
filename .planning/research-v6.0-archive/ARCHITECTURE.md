# Architecture Research: v6.0 Standalone Citation Webapp

**Domain:** Standalone web app integrating with an existing cross-browser MV3 extension — shared deterministic core extraction + public-facing client-side PDF processing
**Researched:** 2026-06-16
**Confidence:** HIGH (derived entirely from direct source reading of the production codebase, not inference or search)

---

## System Overview: v6.0 Integration Map

```
┌────────────────────────────────────────────────────────────────────────┐
│  EXISTING EXTENSION (Chrome + Firefox)                                 │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  src/offscreen/offscreen.js (Chrome)                │               │
│  │  src/firefox/background.js  (Firefox)               │               │
│  │    fetchUsptoWithRetry()  → Worker /?patent=        │               │
│  │    checkCache()           → Worker /cache?patent=   │               │
│  │    uploadToCache()        → Worker /cache?patent=   │               │
│  │    extractTextFromPdf()   → @pkg/citation-core      │  [MODIFIED]   │
│  │    buildPositionMap()     → @pkg/citation-core      │  [MODIFIED]   │
│  │    matchAndCite()         → @pkg/citation-core      │  [MODIFIED]   │
│  └─────────────────────────────────────────────────────┘               │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ Bearer PROXY_TOKEN (rotated, now server-side)
                             ↓
┌────────────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE WORKER  pct.tonyrowles.com  (worker/src/index.js)          │
│                                                                        │
│  Routes:                                                               │
│    GET  /?patent={n}           → USPTO eGrant PDF proxy                │
│    GET  /cache?patent={n}&v={v} → KV position-map read (PATENT_CACHE)  │
│    POST /cache?patent={n}&v={v} → KV position-map write (existence ck) │
│    POST /report                 → bug report ingestion (BUG_REPORTS KV)│
│                                                                        │
│  Auth (CURRENT — MUST CHANGE before v6.0 public launch):              │
│    Bearer PROXY_TOKEN hardcoded in src/offscreen/offscreen.js          │
│    Same token guards ALL routes including /report and /cache           │
│    Token is COMPROMISED (committed to source as plaintext)             │
│                                                                        │
│  Auth (v6.0 target — see PROXY_TOKEN Migration section):              │
│    Extension: rotated token injected from env at build time or CI     │
│    Webapp:    origin-check + rate limit (no embeddable secret)         │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ↓                  ↓                  ↓
   ┌─────────────┐   ┌─────────────┐   ┌────────────────┐
   │ PATENT_CACHE│   │ BUG_REPORTS │   │ USPTO eGrant   │
   │ KV namespace│   │ KV namespace│   │ ODP API        │
   │ pos-maps    │   │ reports     │   │ (PDF source)   │
   └─────────────┘   └─────────────┘   └────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  NEW: STANDALONE WEBAPP  tonyrowles.com/patent-cite  (v6.0)           │
│                                                                        │
│  Client-side browser (no backend):                                     │
│    Input: patent number + text passage                                 │
│    Step 1: GET /cache → position map (if cached, skip parsing)         │
│    Step 2: if miss → GET /?patent= (PDF from Worker/USPTO)             │
│    Step 3: if miss → fetch Google Patents PDF URL directly             │
│    Step 4: extractTextFromPdf(arrayBuffer) from @pkg/citation-core    │
│    Step 5: buildPositionMap(pageResults) from @pkg/citation-core      │
│    Step 6: POST /cache (fire-and-forget upload)                        │
│    Step 7: matchAndCite(text, positionMap) from @pkg/citation-core    │
│    Output: column:line citation + confidence indicator                 │
│                                                                        │
│  Batch mode: Steps 7 only (one positionMap, multiple passages)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Shared-Core Extraction: Pure vs Coupled Analysis

This section is derived from direct reading of the three source files.

### `src/offscreen/pdf-parser.js` — Analysis

**The single coupling:** Line 14 is the only browser-API dependency:
```js
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```
This sets PDF.js's Web Worker URL using a Chrome extension API.

**Everything else is pure:** `extractTextFromPdf(arrayBuffer)` takes an `ArrayBuffer` and returns structured page data. No DOM access, no `chrome.*` calls, no IndexedDB. The function calls `getDocument()` and `getPage()` from PDF.js — both platform-agnostic.

**The seam:** Extract the `workerSrc` configuration into an **initializer function** that callers provide:
```js
// In @pkg/citation-core/pdf-parser.js
export function configurePdfWorker(workerSrcUrl) {
  GlobalWorkerOptions.workerSrc = workerSrcUrl;
}
export async function extractTextFromPdf(pdfData) { ... } // unchanged
```
The extension calls `configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'))` at startup. The webapp calls `configurePdfWorker(new URL('./pdf.worker.mjs', import.meta.url).href)` — the PDF.js worker is a static asset served from the webapp origin.

**hasTextLayer():** Pure. Stays in the package as-is.

### `src/offscreen/position-map-builder.js` — Analysis

**Zero coupling.** The entire file — all 786 lines — is pure JavaScript with no `chrome.*`, no DOM, no IndexedDB, no globals. Every export takes plain arrays and numbers, returns plain objects.

Exported functions confirmed pure:
- `isTwoColumnPage(pageItems, pageWidth)` — pure geometry
- `findColumnBoundary(pageItems, pageWidth)` — pure geometry
- `extractPrintedColumnNumbers(items, pageHeight, pageWidth)` — pure text analysis
- `filterGutterLineNumbers(items, boundary, pageWidth)` — pure filter
- `stripCrossBoundaryText(items, boundary)` — pure transform
- `filterHeadersFooters(items, pageHeight)` — pure filter
- `clusterIntoLines(items, yTolerance)` — pure algorithm
- `buildLineEntry(lineItems, pageNum, column, lineNumber)` — pure constructor
- `detectClaimsBoundary(entries)` — pure text search
- `detectWrapHyphens(entries)` — pure analysis
- `extractGutterLineGrid(items, boundary, pageWidth)` — pure math
- `assignLineNumbersByGrid(lines, entries, pageNum, column, grid)` — pure algorithm
- `assignLineNumbers(lines, entries, pageNum, column)` — pure algorithm
- `isLikelySpecPage(items, pageHeight)` — pure text analysis
- `buildPositionMap(pageResults)` — pure orchestrator (entry point)

**Move as-is:** The entire file moves into the shared package without modification.

### `src/shared/matching.js` — Analysis

**Zero coupling.** The entire file is pure JavaScript. Every function takes plain strings or arrays, returns plain objects or primitives.

Exported functions confirmed pure:
- `normalizeText(text)` — pure string transform
- `normalizeOcr(text)` — pure string transform
- `buildConcat(positionMap)` — pure algorithm
- `findAllOccurrences(haystack, needle)` — pure search
- `pickBestByContext(positions, matchLen, concat, contextBefore, contextAfter)` — pure scoring
- `whitespaceStrippedMatch(...)` — pure matching
- `bookendMatch(...)` — pure matching
- `resolveMatch(...)` — pure resolver
- `formatCitation(startEntry, endEntry)` — pure formatter
- `fuzzySubstringMatch(needle, haystack)` — pure algorithm
- `levenshtein(a, b)` — pure algorithm
- `stripGutterNumbers(concat)` — pure transform
- `gutterTolerantMatch(...)` — pure matching
- `matchAndCite(selectedText, positionMap, contextBefore, contextAfter)` — pure entry point

**Move as-is:** The entire file moves into the shared package without modification.

### Package Boundary Definition

**Into the shared package (`packages/citation-core/`):**
- `position-map-builder.js` — verbatim copy
- `matching.js` — verbatim copy
- `pdf-parser.js` — with `configurePdfWorker()` seam added

**Stays extension-only (NOT in shared package):**
- `src/offscreen/offscreen.js` — Chrome extension message listener, IndexedDB, PROXY_TOKEN, `chrome.*` API orchestration. This is the extension adapter layer.
- `src/firefox/background.js` — Firefox adapter layer; same logic as offscreen but in background context.
- `src/shared/constants.js` — Extension message types (MSG.*), extension-specific constants. The webapp does not use chrome.runtime messaging.
- `src/shared/report-payload-builder.js` — Extension-specific diagnostic context, not needed by webapp.
- `src/shared/report-transport.js` — Extension-specific queue, not needed by webapp.

---

## 2. Data Flow: Webapp Citation Path

### Full Pipeline (Cache Miss, No Google Patents PDF)

```
User enters: patent number "US12505414B2" + passage text
    |
[Webapp] Step 1: GET https://pct.tonyrowles.com/cache?patent=US12505414B2&v=v3
                 (no Authorization header — see auth section)
    |
    ├── CACHE HIT:  Response { entries: [...], meta: { totalLines, totalColumns, hasClaimsSection } }
    |               Skip Steps 2-6. Go to Step 7.
    |
    └── CACHE MISS: 404 response
          |
          [Webapp] Step 2: Try Google Patents PDF URL directly
                   fetch("https://patents.google.com/patent/US12505414B2/PDF")
                   (no auth needed — public URL, but subject to Google rate limits)
          |
          ├── GOOGLE FETCH SUCCESS:
          |     arrayBuffer = await response.arrayBuffer()
          |     Go to Step 4.
          |
          └── GOOGLE FETCH FAILURE (CORS block / no link / 4xx):
                [Webapp] Step 3: GET https://pct.tonyrowles.com/?patent=US12505414B2
                         (Worker proxies USPTO eGrant API — auth applies here)
                arrayBuffer = await response.arrayBuffer()
                |
                [Webapp] Step 4: import { extractTextFromPdf } from '@pkg/citation-core'
                         pageResults = await extractTextFromPdf(arrayBuffer)
                         // throws 'NO_TEXT_LAYER' if scanned PDF
                |
                [Webapp] Step 5: import { buildPositionMap } from '@pkg/citation-core'
                         positionMap = buildPositionMap(pageResults)
                         // [ { page, column, lineNumber, text, hasWrapHyphen, section, ... } ]
                |
                [Webapp] Step 6: POST /cache (fire-and-forget, cache miss upload)
                         body: { entries: positionMap.map(strip-bbox), meta, cachedAt, version: 'v3' }
                         // same strip logic as offscreen.js:uploadToCache() — only text,column,lineNumber,
                         // page,section,hasWrapHyphen cached (no x,y,width,height)
    |
[Webapp] Step 7: import { matchAndCite } from '@pkg/citation-core'
         result = matchAndCite(passage, positionMap, contextBefore='', contextAfter='')
         // returns { citation: "4:55-5:10", confidence: 1.0, startEntry, endEntry } or null
    |
Display: "4:55-5:10" with green/yellow/red indicator
         Copy-to-clipboard button
         "No match found" message if null
```

### Batch Mode (Multiple Passages, One Patent)

Steps 1-6 run once (position map obtained). Step 7 runs N times, one per passage. No additional network calls.

### Cache Key Compatibility

The Worker's KV cache key for position maps is:
```js
const key = `${version}:${patentNumber}`;
// e.g. "v3:12505414"
```

Where `patentNumber` is the output of `cleanPatentNumber(raw)`:
```js
function cleanPatentNumber(raw) {
  return raw
    .replace(/^US/i, '')        // strip US prefix
    .replace(/[A-Z]\d*$/i, ''); // strip kind code (B2, A1, etc.)
}
```

And `version` is the `v` query param, defaulting to `'v1'`, currently `'v3'` (from `CACHE_VERSION` const in offscreen.js).

**Cache key the webapp must use:** `v3:12505414` for patent `US12505414B2`. The webapp must apply the same `cleanPatentNumber` normalization before calling the cache endpoint. This normalization logic must be duplicated in the webapp or extracted into the shared package alongside the citation core.

**Cache entry shape (what webapp receives on hit):**
```json
{
  "entries": [
    { "text": "...", "column": 1, "lineNumber": 5, "page": 3, "section": "description", "hasWrapHyphen": false }
  ],
  "meta": {
    "totalLines": 1240,
    "totalColumns": 18,
    "hasClaimsSection": true
  },
  "cachedAt": 1718000000000,
  "version": "v3"
}
```

Note: bounding box fields (`x`, `y`, `width`, `height`) are stripped before caching (per the locked design decision in `uploadToCache()`). `matchAndCite()` does not use bbox fields — only `text`, `column`, `lineNumber`, `hasWrapHyphen`, and `section`. Cache hits are fully usable by the webapp.

**Compatibility verdict:** Existing extension-populated cache entries are directly usable by the webapp. The `entries` array structure satisfies `matchAndCite()`'s positionMap contract with no transformation. The webapp and extension share the same cache namespace; popular patents parsed by extension users will cache-hit for webapp users.

---

## 3. KV Cache Reuse: Check-Before-Parse

The webapp CAN and SHOULD reuse the Worker's `PATENT_CACHE` KV namespace exactly as the extension does. The GET `/cache` route is already implemented (`worker/src/index.js` lines 561-579). The cache hit means the webapp skips Steps 2-6 entirely — no PDF download, no PDF.js parsing (which can take 3-10 seconds for long patents).

**Current auth requirement:** The GET `/cache` route currently requires `Authorization: Bearer ${PROXY_TOKEN}` — the same as every other route. This must change for the webapp (see PROXY_TOKEN Migration section), because the token cannot be embedded in public webpage JavaScript.

**Proposed split:** The Worker needs two auth tiers:
- **Tier A (token-gated):** `/?patent=` (expensive — USPTO API call), `POST /cache` (write), `POST /report` (write). These require the rotated `PROXY_TOKEN` held by the extension.
- **Tier B (public or origin-gated):** `GET /cache` (read-only, no secret exposed, no expensive upstream call). Open to the webapp with origin-header verification or no auth.

Making `GET /cache` public is low risk: it returns cached position maps (no PII, no secrets). The worst case is a scraper reading cached maps, which has no meaningful security impact.

---

## 4. PROXY_TOKEN Migration: Auth Model for Public Webapp

### Current State (Must Not Ship)

```js
// src/offscreen/offscreen.js line 24
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

This token is committed to the repository and used in:
- `fetchUsptoWithRetry()` — `Authorization: Bearer ${PROXY_TOKEN}` (USPTO proxy)
- `checkCache()` — `Authorization: Bearer ${PROXY_TOKEN}` (cache read)
- `uploadToCache()` — `Authorization: Bearer ${PROXY_TOKEN}` (cache write)

It guards ALL three routes. The Worker validates it on every non-OPTIONS request (line 526-533 of `worker/src/index.js`).

### The Core Problem

A public webpage cannot hold a secret. Any token embedded in webpage JavaScript is extractable by the user. The webapp needs access to `GET /cache` (read) and `GET /?patent=` (USPTO proxy) but cannot hold the same token as the extension.

### Proposed Auth Model

**Extension token (rotated):**
- Rotate `PROXY_TOKEN` to a new value, injected at build time from CI secrets (not committed).
- Extension bundles embed the new token. Extension users are trusted consumers (installed from store, not a public attack surface).
- Continues to guard `POST /cache`, `POST /report`, `GET /?patent=` (USPTO proxy).

**Webapp — no token, origin-based auth:**

Option A (recommended): **Origin header verification** in the Worker.

```js
// Worker: separate public routes behind origin check
const ALLOWED_ORIGINS = ['https://tonyrowles.com', 'https://www.tonyrowles.com'];
const origin = request.headers.get('Origin') || '';

if (path === '/cache' && request.method === 'GET') {
  if (ALLOWED_ORIGINS.includes(origin)) {
    // serve cache read — no PROXY_TOKEN needed
    return handleCacheRead(request, env);
  }
  return new Response('Forbidden', { status: 403 });
}
```

Browsers enforce the `Origin` header on cross-origin requests — it cannot be forged from a webpage context. This is not a substitute for server-side secrets but is sufficient for read-only access to non-sensitive cached position maps.

Option B: **Cloudflare Turnstile** (CAPTCHA-like challenge). Adds complexity, hurts UX, overkill for this use case.

Option C: **Per-user API tokens** (login wall). Out of scope for v1 — webapp is public, no accounts.

**For the USPTO proxy (`GET /?patent=`):**

The webapp CANNOT call `GET /?patent=` directly without a token, because the USPTO API key must stay server-side. The proposed flow:
1. Webapp first tries to fetch the PDF directly from Google Patents (free, public).
2. If that fails (CORS, missing link, 404), webapp calls a **new public webapp proxy route** on the Worker:

```
GET /webapp/pdf?patent={n}
```

This route:
- Requires `Origin: https://tonyrowles.com` (no token).
- Rate-limits by IP (using the existing `rl:{ip}` pattern from the bug report handler).
- Calls `fetchEgrantPdf()` internally (reusing existing logic).
- Returns the PDF stream.

This keeps the USPTO API key server-side while allowing public webapp access without an embeddable secret.

**Summary of auth model for v6.0:**

| Route | Extension auth | Webapp auth |
|-------|---------------|-------------|
| `GET /?patent=` | Bearer PROXY_TOKEN (rotated) | Not used (new `/webapp/pdf` route) |
| `GET /webapp/pdf?patent=` | N/A — extension uses existing route | Origin header + IP rate limit |
| `GET /cache?patent=&v=` | Bearer PROXY_TOKEN (rotated) | Origin header (read-only, no secret) |
| `POST /cache?patent=&v=` | Bearer PROXY_TOKEN (rotated) | Not used (webapp uses fire-and-forget) |
| `POST /report` | Bearer PROXY_TOKEN (rotated) | Not used in v1 webapp |

---

## 5. Recommended Project Structure

```
patent-cite-tool/
├── packages/
│   └── citation-core/          # NEW — shared deterministic parsing + matching
│       ├── package.json        # name: "@pct/citation-core", type: "module"
│       ├── index.js            # re-exports: extractTextFromPdf, configurePdfWorker,
│       │                       #             buildPositionMap, matchAndCite, normalizeText
│       ├── pdf-parser.js       # MOVED from src/offscreen/pdf-parser.js
│       │                       #   + configurePdfWorker(workerSrcUrl) seam added
│       ├── position-map-builder.js  # MOVED from src/offscreen/position-map-builder.js
│       └── matching.js         # MOVED from src/shared/matching.js
│
├── src/                        # EXISTING extension source (modified import paths only)
│   ├── offscreen/
│   │   ├── offscreen.js        # MODIFIED: import from @pct/citation-core; PROXY_TOKEN removed
│   │   ├── offscreen.html
│   │   └── (pdf-parser.js, position-map-builder.js → moved to packages/)
│   ├── shared/
│   │   ├── constants.js        # MODIFIED: PROXY_TOKEN removed, added WEBAPP_ORIGIN
│   │   ├── matching.js         # DELETED after moving to packages/ (or re-exported)
│   │   └── ...
│   └── ...
│
├── webapp/                     # NEW — standalone web app
│   ├── index.html              # Patent number input + passage textarea + citation output
│   ├── main.js                 # App orchestration: cache check → parse → match → display
│   ├── worker-client.js        # Worker API calls (cache read, webapp PDF proxy)
│   ├── pdf-fetch.js            # Google Patents direct fetch → Worker fallback
│   └── build/                  # esbuild output (bundled for static hosting)
│
├── worker/                     # EXISTING Cloudflare Worker (modified)
│   ├── src/
│   │   └── index.js            # MODIFIED: new /webapp/pdf route, split auth tiers
│   └── wrangler.toml           # MODIFIED: PROXY_TOKEN rotated (new secret)
│
├── scripts/
│   └── build.js                # MODIFIED: add webapp esbuild entry point
└── package.json                # MODIFIED: add workspaces: ["packages/*", "webapp"]
```

### Structure Rationale

- **`packages/citation-core/`:** Standard npm workspaces pattern. Lets the extension and webapp import identically (`import { matchAndCite } from '@pct/citation-core'`). esbuild resolves workspace packages via `node_modules` symlinks. No publish to npm registry needed.
- **`webapp/`:** Sibling to `src/` rather than inside it — the webapp is a separate product, not an extension page. Prevents confusion with extension build pipeline.
- **`worker/` unchanged:** The Worker is already a separate mini-project with its own `package.json`. Modifications are additive.

---

## 6. Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `packages/citation-core/pdf-parser.js` | PDF.js text extraction from ArrayBuffer | PDF.js (external lib), called by extension offscreen + webapp |
| `packages/citation-core/position-map-builder.js` | Transform page text items → position map | Called by extension offscreen + webapp |
| `packages/citation-core/matching.js` | 5-tier deterministic text → citation | Called by extension offscreen + webapp |
| `src/offscreen/offscreen.js` | Chrome extension adapter: IPC, IndexedDB, PROXY_TOKEN, fetch orchestration | `chrome.*` APIs, Worker (Bearer token), citation-core |
| `src/firefox/background.js` | Firefox extension adapter: same as offscreen.js sans offscreen API | `chrome.*` APIs, Worker (Bearer token), citation-core |
| `webapp/main.js` | Webapp orchestration: input → output pipeline | worker-client.js, pdf-fetch.js, citation-core |
| `webapp/worker-client.js` | Worker API client (cache read, webapp PDF proxy) | Worker at pct.tonyrowles.com (origin-auth, no token) |
| `webapp/pdf-fetch.js` | PDF acquisition: Google Patents direct first, Worker fallback | Google Patents CDN, worker-client.js |
| `worker/src/index.js` | Cloudflare Worker: auth, routing, USPTO proxy, KV cache, bug reports | USPTO ODP API, PATENT_CACHE KV, BUG_REPORTS KV, Discord |

---

## 7. Architectural Patterns

### Pattern 1: Platform Adapter Over Pure Core

**What:** The deterministic core (`pdf-parser.js`, `position-map-builder.js`, `matching.js`) is kept pure — zero browser APIs, zero extension APIs. Platform-specific adapters (extension offscreen, webapp main.js) wrap the core with their environment's fetch/storage/IPC mechanisms.

**When to use:** Any time the same algorithm must run in multiple contexts (extension offscreen, extension background, webpage, Node.js tests). This is why the Vitest test suite already works without mocking PDF.js or chrome.* — `matching.js` was pure from the start.

**Extension adapter pattern (existing, to be preserved):**
```js
// src/offscreen/offscreen.js
import { extractTextFromPdf, buildPositionMap, matchAndCite } from '@pct/citation-core';
// ... chrome.runtime.onMessage, IndexedDB, PROXY_TOKEN fetch, chrome.runtime.sendMessage
```

**Webapp adapter pattern (new):**
```js
// webapp/main.js
import { extractTextFromPdf, buildPositionMap, matchAndCite, configurePdfWorker } from '@pct/citation-core';
configurePdfWorker(new URL('./pdf.worker.mjs', import.meta.url).href);
// ... fetch, DOM manipulation, no chrome.*, no IndexedDB
```

### Pattern 2: Cache-First, Parse-on-Miss

**What:** The Worker's KV cache is checked before any PDF download or parsing. On a cache hit, the position map is returned as JSON and the expensive pipeline (PDF download + PDF.js parsing) is skipped entirely.

**Existing extension implementation:** `handleCheckCache()` in `offscreen.js` — check → hit stores to IndexedDB → miss triggers PDF fetch. The webapp replicates this logic directly in `webapp/main.js` without IndexedDB (no cross-session cache needed for the webapp; browser session state is sufficient).

**Cache hit rate benefit:** Patents parsed by extension users populate the shared KV. Popular patents (frequently cited in prosecution) will nearly always be cache hits for webapp users. The webapp benefits from the extension user base's parsing work.

### Pattern 3: Fire-and-Forget KV Upload

**What:** After client-side parsing, the position map is uploaded to the Worker's KV cache asynchronously with no error propagation. Upload failure silently falls through — the user already has their citation.

**Existing pattern:** `uploadToCache()` in `offscreen.js` swallows all errors. Webapp replicates the same pattern. Same bbox-stripped payload shape (`text, column, lineNumber, page, section, hasWrapHyphen` only).

---

## 8. New vs Modified Components

### New Files

| File | Context | Purpose |
|------|---------|---------|
| `packages/citation-core/package.json` | Build | Workspace package definition |
| `packages/citation-core/index.js` | Shared | Re-export entry point for the shared package |
| `packages/citation-core/pdf-parser.js` | Shared | MOVED from `src/offscreen/pdf-parser.js` + `configurePdfWorker()` seam |
| `packages/citation-core/position-map-builder.js` | Shared | MOVED verbatim from `src/offscreen/position-map-builder.js` |
| `packages/citation-core/matching.js` | Shared | MOVED verbatim from `src/shared/matching.js` |
| `webapp/index.html` | Webapp | Main HTML page: inputs + output area |
| `webapp/main.js` | Webapp | Orchestration: cache check → PDF fetch → parse → match → display |
| `webapp/worker-client.js` | Webapp | Worker API calls without PROXY_TOKEN |
| `webapp/pdf-fetch.js` | Webapp | Google Patents direct + Worker fallback PDF acquisition |

### Modified Files

| File | Change |
|------|--------|
| `src/offscreen/offscreen.js` | Update imports to `@pct/citation-core`; remove `PROXY_TOKEN` const (injected from build env); remove `pdf-parser.js`/`position-map-builder.js` imports |
| `src/shared/matching.js` | Either deleted (after moving to packages/) or replaced with re-export: `export * from '@pct/citation-core/matching.js'` |
| `src/offscreen/pdf-parser.js` | Either deleted or becomes a re-export shim calling `configurePdfWorker(chrome.runtime.getURL(...))` then re-exporting |
| `src/offscreen/position-map-builder.js` | Either deleted or becomes a re-export shim |
| `worker/src/index.js` | Add `GET /webapp/pdf` route (origin-auth, no PROXY_TOKEN); split auth: existing routes keep Bearer token, `/cache` GET and `/webapp/pdf` use origin check; rotate PROXY_TOKEN |
| `worker/wrangler.toml` | PROXY_TOKEN rotated via `wrangler secret put PROXY_TOKEN` (new value, never committed) |
| `scripts/build.js` | Add webapp esbuild entry point (`webapp/main.js` → `webapp/build/bundle.js`) |
| `package.json` (root) | Add `"workspaces": ["packages/*", "webapp"]` |
| `vitest.config.js` (and chrome/firefox variants) | Update alias paths from `src/shared/matching.js` to `@pct/citation-core/matching.js` |

---

## 9. Build Order

The security gate (PROXY_TOKEN rotation) MUST complete before the webapp is publicly deployed. All other work can proceed in the order below.

### Gate: PROXY_TOKEN Rotation (Blocking — Do First)

**Why blocking:** The current token is committed to the repo and must not be embedded in any new public-facing artifact. The webapp JavaScript will be publicly readable. The rotation must happen before any webapp code that calls the Worker is shipped.

**What rotation requires:**
1. Generate a new token value (not committed — stored only in Cloudflare Worker secrets and CI environment secrets).
2. `wrangler secret put PROXY_TOKEN` → deploy updated Worker (the old token immediately stops working).
3. Update the extension build pipeline to inject `PROXY_TOKEN` from CI env rather than hardcoding in source.
4. Add the Worker's origin-auth changes for `/cache` GET and `/webapp/pdf` in the same Worker deploy.

### Phase 1: Shared-Core Extraction (Foundation, Do After Gate)

**What:** Move `pdf-parser.js`, `position-map-builder.js`, `matching.js` into `packages/citation-core/`. Update extension imports. Run full golden corpus (75 cases) to verify zero behavior change.

**Blocking:** Everything else. The webapp imports from `@pct/citation-core` — the package must exist before the webapp can be built.

**Parallelizable within phase:** The three file moves are independent. The `configurePdfWorker()` seam on `pdf-parser.js` is the only non-trivial change.

**Done when:** `npm test` passes identically to pre-extraction. The golden baseline (`tests/golden/baseline.json`) must pass at 100% — this is the correctness guard for the refactor.

### Phase 2: Webapp Core (After Phase 1)

**What:** Build `webapp/` — HTML, `main.js`, `worker-client.js`, `pdf-fetch.js`, esbuild config. This is the new product.

**Parallelizable with:** Phase 3 (Worker changes) can start in parallel because the webapp's Worker client code just calls HTTP endpoints — it doesn't need the Worker to be updated yet for development/testing (can stub).

**Done when:** The webapp loads in a browser, accepts a patent number + passage, fetches a PDF (from Google Patents), parses it with PDF.js, and returns a citation.

### Phase 3: Worker Auth Split (After Gate, Parallel with Phase 2)

**What:** Add `GET /webapp/pdf` route with origin-auth + IP rate limit; make `GET /cache` accept both Bearer token (extension) and origin header (webapp). Deploy to production Worker.

**Critical path:** Must be deployed before the webapp goes to production (webapp needs `/webapp/pdf` and unauth'd cache reads). Can be developed and tested against a staging Worker while Phase 2 is in progress.

**Done when:** Webapp can fetch position maps from cache and fetch PDFs via Worker without any Bearer token.

### Phase 4: Webapp Production Deploy (After Phases 2 + 3)

**What:** Deploy `webapp/build/bundle.js` as a static asset to `tonyrowles.com/patent-cite`. Configure CORS headers on the hosting so the origin-auth in the Worker matches.

**Done when:** End-to-end live test: real patent number → real citation → KV cache populated for subsequent users.

### Dependency Graph

```
PROXY_TOKEN Gate (must complete before any public deployment)
    |
    ├── Phase 1: Shared-core extraction
    |       |
    |       └── Phase 2: Webapp core (webapp/*)
    |                           |
    ├── Phase 3: Worker auth split ──────────┘
    |
    └── Phase 4: Production deploy (requires Phase 2 + Phase 3 complete)
```

---

## 10. Anti-Patterns to Avoid

### Anti-Pattern 1: Forking the Deterministic Core

**What people do:** Copy `matching.js` into `webapp/matching.js` instead of extracting to a shared package. Fast short-term, catastrophic long-term.

**Why it's wrong:** Any algorithm fix or corpus improvement must be applied in two places. The golden baseline only guards the extension copy. Drift is guaranteed over time — the webapp silently diverges from the extension's behavior.

**Do this instead:** Complete the workspace extraction (Phase 1) first, even if it adds a few days. Shared package means one fix, both callers improved.

### Anti-Pattern 2: Embedding PROXY_TOKEN in Webapp JS

**What people do:** Use the same PROXY_TOKEN in the webapp's worker-client.js for simplicity, since it "already works" for the extension.

**Why it's wrong:** Webpage JavaScript is publicly readable. The token protects the USPTO API key and the KV write quota. An exposed token means anyone can POST arbitrary position maps to PATENT_CACHE, submit unlimited bug reports bypassing rate limits, and exhaust the Cloudflare KV write quota.

**Do this instead:** Split the auth model as described above — origin-check for webapp read-only routes, rotate the token and inject it only into the extension build pipeline.

### Anti-Pattern 3: Storing PDFs in the Browser or KV

**What people do:** Cache the raw PDF ArrayBuffer in sessionStorage or localStorage to avoid re-fetching on batch mode.

**Why it's wrong:** Patent PDFs are 5-30 MB. `localStorage` quota is typically 5-10 MB per origin — one patent can fill it. KV storage of raw PDFs is explicitly out of scope per the project's locked decision. Session memory (in-JS variable) is fine for the duration of a session but should not be persisted.

**Do this instead:** Cache only the position map in memory (JS object) for the duration of the batch session. The position map is 10-100 KB. On page reload, let the KV cache hit handle it.

### Anti-Pattern 4: Making GET /cache Require No Auth At All

**What people do:** Remove the PROXY_TOKEN auth from GET /cache globally (including for extension callers) to simplify the auth model.

**Why it's wrong:** While cache reads are low-risk, removing auth entirely exposes the Worker to being used as a public USPTO patent lookup proxy by scraping the cache GET endpoint at volume, running up Cloudflare KV read costs. The origin-check tiers the auth correctly.

**Do this instead:** GET /cache accepts EITHER a valid Bearer PROXY_TOKEN (extension path) OR a valid `Origin: https://tonyrowles.com` header (webapp path). Both work; neither leaves the endpoint fully open.

### Anti-Pattern 5: Skipping the Corpus Guard on Extraction

**What people do:** Move the three files to the shared package, update imports, and ship — trusting that "it's just a move."

**Why it's wrong:** The `configurePdfWorker()` seam in `pdf-parser.js` is a behavior change. Path resolution changes between extension bundle and webapp bundle can affect the PDF.js worker load. Import aliases in Vitest configs reference `src/shared/matching.js` by path — stale after the move. A silent Vitest alias failure means the tests pass against the old source, not the new package.

**Do this instead:** After extraction, run `npm test` in full (all four test suites: `test:src`, `test:chrome`, `test:firefox`, `test:lint`). Verify 75-case golden baseline passes at 100%. Check the Vitest alias configs (`vitest.config.js`, `vitest.config.chrome.js`, `vitest.config.firefox.js`) are updated to point to the new package paths.

---

## 11. Integration Points: Exact File/Function Names

| New Webapp Code | Integrates With | Integration Point |
|----------------|----------------|-------------------|
| `webapp/main.js` | `@pct/citation-core` | `import { configurePdfWorker, extractTextFromPdf, buildPositionMap, matchAndCite }` |
| `webapp/worker-client.js` | `worker/src/index.js` | `GET /cache?patent={n}&v=v3` with `Origin` header; `GET /webapp/pdf?patent={n}` with `Origin` header |
| `webapp/pdf-fetch.js` | Google Patents CDN | `fetch('https://patents.google.com/patent/US{n}/PDF')` — public, no auth |
| `worker/src/index.js` | `webapp/worker-client.js` | New route `GET /webapp/pdf` — origin-auth; modified `GET /cache` — accepts origin OR Bearer |
| Extension `src/offscreen/offscreen.js` | `@pct/citation-core` | Replace: `import { extractTextFromPdf } from './pdf-parser.js'` → `import { extractTextFromPdf } from '@pct/citation-core'` (+ same for buildPositionMap, matchAndCite) |
| Extension `src/offscreen/offscreen.js` | PROXY_TOKEN | Replace hardcoded const with `process.env.PROXY_TOKEN` (injected by esbuild `define` in build.js) |
| `packages/citation-core/pdf-parser.js` | `configurePdfWorker()` seam | Called by extension: `configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'))` |
| `packages/citation-core/pdf-parser.js` | `configurePdfWorker()` seam | Called by webapp: `configurePdfWorker(new URL('./pdf.worker.mjs', import.meta.url).href)` |

---

## Sources

- Direct source reading: `src/offscreen/pdf-parser.js`, `src/offscreen/position-map-builder.js`, `src/offscreen/offscreen.js`, `src/shared/matching.js`, `src/shared/constants.js`, `worker/src/index.js`, `worker/wrangler.toml`, `scripts/build.js`, `package.json`, `.planning/PROJECT.md`
- PROXY_TOKEN: confirmed hardcoded at `src/offscreen/offscreen.js` line 24 — value `4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe`
- Cache key scheme: confirmed from `worker/src/index.js` line 559 — `\`${version}:${patentNumber}\``
- Cache entry shape (bbox stripped): confirmed from `offscreen.js` lines 405-406 — only `text, column, lineNumber, page, section, hasWrapHyphen` written
- Auth model: confirmed from `worker/src/index.js` lines 524-533 — single global Bearer check before route dispatch
- PDF.js worker coupling: confirmed at `src/offscreen/pdf-parser.js` line 14 — only `chrome.runtime.getURL` call
- `position-map-builder.js` purity: confirmed — 786 lines, zero `chrome.*`, zero DOM, zero IndexedDB
- `matching.js` purity: confirmed — 729 lines, zero browser APIs

---

*Architecture research for: v6.0 Standalone Citation Webapp — integration into existing Patent Citation Tool*
*Researched: 2026-06-16*

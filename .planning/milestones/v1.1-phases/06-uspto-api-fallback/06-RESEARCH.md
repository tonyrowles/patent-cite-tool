# Phase 6: USPTO API Fallback - Research

**Researched:** 2026-03-02
**Domain:** Cloudflare Workers API gateway + USPTO ODP API + Chrome MV3 extension integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fallback trigger — three conditions:**
- (1) No Google Patents PDF link found in the DOM
- (2) Google Patents PDF fetch fails after retry
- (3) Google Patents PDF has no OCR/text layer (parse returns `NO_TEXT_LAYER`)
- Service worker orchestrates fallback — receives `PDF_LINK_NOT_FOUND`, `PDF_FETCH_RESULT(failure)`, or `PARSE_RESULT(no-text-layer)` and initiates the USPTO path
- Fallback is transparent to the user — no separate "trying fallback" state or UI indication
- If both Google Patents and USPTO fail, patent goes to UNAVAILABLE status with amber badge (same as current no-PDF-link behavior)

**ODP API flow (Worker orchestrates all 3 steps):**
1. Search: `GET /api/v1/patent/applications/search?q=applicationMetaData.patentNumber:{number}&fields=applicationNumberText` → returns `applicationNumberText`
2. List documents: `GET /api/v1/patent/applications/{appNumber}/documents?documentCodes=EGRANT.PDF` → returns `downloadUrl`
3. Download: `GET {downloadUrl}` → returns PDF binary
- All requests require `X-API-Key` header
- Base URL: `https://api.uspto.gov`

**Worker role: API key gateway:**
- Worker holds the USPTO ODP API key as a Cloudflare secret — extension never sees it
- Extension sends patent number + bearer token to Worker; Worker orchestrates 3-step ODP lookup and returns the PDF
- Extension side: static bearer token hardcoded as a constant in extension JS (not accessible to web pages)
- Worker side: two secrets — (1) `PROXY_TOKEN` for extension auth, (2) `USPTO_API_KEY` for ODP auth
- Worker validates the patent number format before making ODP calls — no arbitrary API proxying

**User-facing feedback:**
- No source indicator in popup — user sees same "Ready" status regardless of PDF source
- Same loading/fetching state during USPTO fallback — no new UI states
- Source field (`google` | `uspto`) stored in `chrome.storage.local` alongside patent data for debugging
- Failure message: "PDF not available" — same as existing behavior

**Deployment setup:**
- Worker code lives in `worker/` subdirectory of this repo (monorepo approach)
- Cloudflare Workers free tier (100K requests/day)
- Default `*.workers.dev` domain — no custom domain or DNS setup
- Worker URL hardcoded as a constant in the extension, same location as bearer token

### Claude's Discretion

- Worker internal implementation (request handling, error handling, ODP response parsing)
- Which message types to add/modify for the fallback flow
- How to integrate the fallback fetch into the existing offscreen document flow
- CORS preflight handling specifics
- Whether Worker streams the PDF or buffers it (PDFs are 1-5 MB via ODP, smaller than image-ppubs)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UPTO-01 | Cloudflare Worker is deployed with token validation and CORS handling | Wrangler deployment workflow, secrets management pattern, CORS OPTIONS handler pattern |
| UPTO-02 | When Google Patents PDF is unavailable, extension fetches patent PDF via Worker proxy to USPTO image server | Service worker integration points identified (`handlePdfUnavailable`, `handlePdfFetchResult`, `handleParseResult`), new message type pattern established, offscreen fetch flow reuse |
| UPTO-03 | USPTO-fetched PDF is parsed identically to Google Patents PDF (same offscreen flow) | Existing `fetchPdfWithRetry` → `storePdfInIndexedDB` → `parsePdf` pipeline is source-agnostic; Worker returns raw PDF binary; extension feeds it to same IndexedDB store |
</phase_requirements>

## Summary

Phase 6 builds two connected pieces: a Cloudflare Worker that acts as an API gateway (holding the USPTO ODP API key server-side), and changes to the extension's service worker and offscreen document to use that gateway as a fallback when Google Patents cannot serve a PDF.

The Worker is vanilla JavaScript deployed with Wrangler to a `*.workers.dev` URL. It holds two secrets (`PROXY_TOKEN` and `USPTO_API_KEY`), validates the incoming patent number, orchestrates the 3-step ODP lookup (search → list documents → download), and streams the PDF binary back to the extension. The extension's offscreen document receives the PDF blob exactly as it does from Google Patents, so the existing parse pipeline (`extractTextFromPdf` → `buildPositionMap`) requires zero modification. The only new code in the extension is: (a) new message types for the USPTO fetch path, (b) modified service worker handlers that initiate the fallback instead of dead-ending, and (c) a `source` field on `currentPatent` in storage.

The API surface, rate limits, and response structures for the USPTO ODP are well-documented by the working reference implementation in `.planning/uspto_api_example_code.md` and confirmed by live testing on 2026-03-02. Cloudflare Workers deployment via Wrangler is mature and well-documented. The primary implementation risks are: (1) CORS preflight handling must be explicit in the Worker, and (2) the offscreen document needs to handle a Worker-sourced fetch path without duplicating its IndexedDB store logic.

**Primary recommendation:** Build the Worker first with local `.dev.vars` secrets, validate the 3-step ODP flow end-to-end against the live API, then wire the extension fallback path to call the deployed Worker.

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| Cloudflare Workers (vanilla JS) | Runtime 2025-01+ | API gateway / serverless function | Zero cold start, free tier 100K req/day, global edge, confirmed `*.workers.dev` domain |
| Wrangler CLI | Latest (v3) | Local dev, secret management, deploy | Official Cloudflare tool; `npx wrangler dev` + `npx wrangler deploy` is the full workflow |
| USPTO ODP API | v1 | Patent data source — 3-step lookup | Only source with real text-layer eGrant PDFs (confirmed by testing) |

### Supporting

| Library/Tool | Version | Purpose | When to Use |
|-------------|---------|---------|-------------|
| `.dev.vars` file | N/A | Local secret values for `wrangler dev` | Development only — never commit; maps same keys as production secrets |
| `wrangler secret put` | CLI cmd | Deploy production secrets | Run once per secret key per environment; value is entered interactively or via stdin |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla Worker JS | Hono or itty-router | Frameworks add convenience but unnecessary for a single-endpoint gateway with minimal routing |
| Streaming PDF response | Buffer entire PDF in Worker memory | Streaming is marginally better for memory but PDFs are 1-5 MB well within Worker's 128 MB limit; either works |

**Installation (Worker subdirectory):**
```bash
cd worker/
npm create cloudflare@latest .  # or manually create wrangler.toml + package.json
```

## Architecture Patterns

### Recommended Project Structure

```
worker/
├── src/
│   └── index.js          # Worker entry point — single fetch handler
├── wrangler.toml          # name, main, compatibility_date
├── .dev.vars              # PROXY_TOKEN=... USPTO_API_KEY=... (git-ignored)
└── package.json           # { "type": "module" }
src/
├── background/
│   └── service-worker.js  # Modified: 3 handlers gain USPTO fallback branches
├── shared/
│   └── constants.js       # Add: FETCH_USPTO_PDF, USPTO_FETCH_RESULT message types
├── offscreen/
│   └── offscreen.js       # Add: fetchUsptoWithRetry() handler + message listener branch
└── manifest.json          # Add: Worker URL to host_permissions
```

### Pattern 1: Cloudflare Worker — Minimal Secret-Gated API Gateway

**What:** Single `fetch` handler validates `Authorization: Bearer {PROXY_TOKEN}` header, validates patent number format, then makes sequential ODP requests and streams the PDF response back.

**When to use:** Any time the Worker receives a `GET /?patent={number}` request from the extension.

```javascript
// worker/src/index.js
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Validate bearer token
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.PROXY_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Validate patent number (digits only, 6-8 chars)
    const url = new URL(request.url);
    const patentNumber = url.searchParams.get('patent') || '';
    if (!/^\d{6,8}$/.test(patentNumber)) {
      return new Response('Bad Request: invalid patent number', { status: 400 });
    }

    try {
      const pdf = await fetchEgrantPdf(patentNumber, env.USPTO_API_KEY);
      return new Response(pdf.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(`USPTO lookup failed: ${err.message}`, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
};
```

**Key insight on CORS:** Chrome extension service workers that call `fetch()` are NOT subject to CORS when the URL is in `host_permissions`. However, the extension's offscreen document **is** subject to CORS (it's a web page context). Since the existing offscreen document does the PDF fetch, the Worker MUST return `Access-Control-Allow-Origin: *` on all responses including errors. Preflight (OPTIONS) must also be handled explicitly.

### Pattern 2: ODP 3-Step Lookup (in Worker)

Based on the verified reference implementation in `.planning/uspto_api_example_code.md`:

```javascript
async function fetchEgrantPdf(patentNumber, apiKey) {
  const BASE = 'https://api.uspto.gov/api/v1/patent/applications';
  const headers = { 'X-API-Key': apiKey };

  // Step 1: Search for application number
  const searchResp = await fetch(
    `${BASE}/search?q=applicationMetaData.patentNumber:${patentNumber}&offset=0&limit=25&fields=applicationNumberText`,
    { headers }
  );
  if (!searchResp.ok) throw new Error(`ODP search failed: ${searchResp.status}`);
  const searchData = await searchResp.json();
  const results = searchData.patentFileWrapperDataBag || searchData.results || [];
  if (results.length === 0) throw new Error(`Patent ${patentNumber} not found in ODP`);
  const appNumber = results[0].applicationNumberText;

  // Step 2: List documents, filter for EGRANT.PDF
  const docsResp = await fetch(
    `${BASE}/${appNumber}/documents?documentCodes=EGRANT.PDF`,
    { headers }
  );
  if (!docsResp.ok) throw new Error(`ODP documents failed: ${docsResp.status}`);
  const docsData = await docsResp.json();
  const docs = docsData.documentBag || docsData.results || [];
  const egrant = docs.find(d => {
    const code = (d.documentCode || '').toUpperCase();
    const desc = (d.documentDescription || '').toUpperCase();
    return code === 'EGRANT.PDF' || desc.includes('ELECTRONIC GRANT') || desc.includes('ISSUE GRANT');
  });
  if (!egrant) throw new Error(`EGRANT.PDF not found for application ${appNumber}`);

  const downloadOpt = egrant.downloadOptionBag?.find(o => o.mimeTypeIdentifier === 'PDF')
    || egrant.downloadOptionBag?.[0];
  if (!downloadOpt?.downloadUrl) throw new Error(`No download URL for EGRANT.PDF`);

  // Step 3: Download PDF — stream body directly back to caller
  const pdfResp = await fetch(downloadOpt.downloadUrl, { headers });
  if (!pdfResp.ok) throw new Error(`PDF download failed: ${pdfResp.status}`);
  return pdfResp; // Return Response to stream body
}
```

### Pattern 3: Extension — Service Worker Fallback Initiation

The three existing handlers that dead-end become fallback launchers. The pattern is identical for all three triggers:

```javascript
// service-worker.js — modified handlePdfUnavailable (trigger 1)
async function handlePdfUnavailable(message) {
  const { patentId, patentType, kindCode } = message;

  // Only grant patents can use USPTO fallback
  if (patentType === PATENT_TYPE.GRANT) {
    await chrome.storage.local.set({
      currentPatent: { patentId, patentType, kindCode, pdfUrl: null,
                       status: STATUS.FETCHING, error: null, source: null },
    });
    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({
      type: MSG.FETCH_USPTO_PDF,
      patentId,
    }).catch(err => console.warn('[SW] FETCH_USPTO_PDF send failed:', err.message));
  } else {
    // Application patents: no USPTO fallback, go UNAVAILABLE
    await chrome.storage.local.set({
      currentPatent: { patentId, patentType, kindCode, pdfUrl: null,
                       status: STATUS.UNAVAILABLE, error: null },
    });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  }
}
```

**Note:** Only granted patents (`PATENT_TYPE.GRANT`) have eGrant PDFs. Application publications do not. The fallback should only activate for grant patents.

### Pattern 4: Extension — Offscreen USPTO Fetch

The offscreen document adds a new message handler that calls the Worker with the bearer token and stores the result in the same IndexedDB slot:

```javascript
// offscreen.js — new handler branch in message listener
} else if (message.type === FETCH_USPTO_PDF) {
  fetchUsptoWithRetry(message.patentId);
}

// New function — mirrors fetchPdfWithRetry but calls Worker
async function fetchUsptoWithRetry(patentId, retries = 1) {
  try {
    const workerUrl = `${WORKER_URL}?patent=${encodeURIComponent(patentId)}`;
    const response = await fetch(workerUrl, {
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` }
    });
    if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
    const blob = await response.blob();
    await storePdfInIndexedDB(patentId, blob);
    chrome.runtime.sendMessage({
      type: USPTO_FETCH_RESULT,
      success: true,
      patentId,
    });
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1000));
      return fetchUsptoWithRetry(patentId, retries - 1);
    }
    chrome.runtime.sendMessage({
      type: USPTO_FETCH_RESULT,
      success: false,
      patentId,
      error: error.message,
    });
  }
}
```

### Anti-Patterns to Avoid

- **Sharing the USPTO API key in extension code:** The entire point is that `USPTO_API_KEY` stays in the Worker. Extension code only has `PROXY_TOKEN`.
- **Triggering fallback for application patents:** `image-ppubs` has no application eGrants; ODP EGRANT.PDF is for granted patents only. Check `patentType === PATENT_TYPE.GRANT` before initiating.
- **Putting `PROXY_TOKEN` in `wrangler.toml`:** Never put secrets in the config file — use `wrangler secret put` or `.dev.vars`.
- **Missing `Access-Control-Allow-Origin` on error responses:** If the Worker returns a 4xx/5xx without the CORS header, the offscreen document will get a CORS error instead of the actual HTTP status, making debugging very hard.
- **Not handling `OPTIONS` before token validation:** Preflight requests don't carry the `Authorization` header. Returning 401 on OPTIONS will prevent the browser from ever making the real request.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker deployment infra | Custom deploy scripts | `wrangler deploy` | Handles bundling, upload, activation atomically |
| Secret rotation | Custom encrypted storage | `wrangler secret put` | Secrets are encrypted at rest in Cloudflare's infrastructure |
| PDF parsing at USPTO source | New parser for ODP PDFs | Existing `extractTextFromPdf` + `buildPositionMap` | ODP eGrant PDFs are text-layer PDFs identical to what the parser already handles |

**Key insight:** The existing offscreen parse pipeline is completely source-agnostic — it reads from IndexedDB by `patentId` key. If the USPTO fetch path stores the blob under the same `patentId` key using the existing `storePdfInIndexedDB()` function, the existing `parsePdf()` function works unchanged. No new parse code required.

## Common Pitfalls

### Pitfall 1: CORS in Offscreen vs. Service Worker
**What goes wrong:** Developer tests fetch from the service worker (no CORS) and it works. Extension ships with fetch in offscreen document, and it fails in production with a CORS error.
**Why it happens:** Service workers in MV3 extensions run in the extension's privileged origin and bypass CORS for URLs in `host_permissions`. Offscreen documents run as web pages in the extension context and are subject to standard browser CORS enforcement.
**How to avoid:** Always add the Worker URL to `manifest.json` `host_permissions`. And always return `Access-Control-Allow-Origin: *` from the Worker on every response (including errors and OPTIONS preflight).
**Warning signs:** Fetch works in the service worker directly but fails when routed through the offscreen document.

### Pitfall 2: Missing CORS on Error Responses
**What goes wrong:** Worker returns `502` or `400` without CORS header. Browser sees a CORS error, not the HTTP error. `fetch()` rejects with "Failed to fetch" rather than a meaningful error code.
**Why it happens:** Developers add CORS headers to the success path but forget error responses.
**How to avoid:** Define a helper that always adds `Access-Control-Allow-Origin: *` to every Response, including error responses.
**Warning signs:** `fetch()` in offscreen document throws `TypeError: Failed to fetch` instead of an HTTP error.

### Pitfall 3: ODP Application Number Format
**What goes wrong:** Application number returned by ODP search (e.g., `18966097`) is used directly in the documents URL. This works, but the format may include leading zeros or slashes in some cases.
**Why it happens:** USPTO application numbers have a complex format history. Recent applications are all-numeric, but older formats used slashes (e.g., `08/123456`).
**How to avoid:** Use the `applicationNumberText` field exactly as returned by the ODP search — do not transform it. The ODP documents endpoint accepts the value as-is from its own search response.
**Warning signs:** 404 errors on the documents endpoint for older patents.

### Pitfall 4: Rate Limit on PDF Downloads
**What goes wrong:** During development/testing, rapid repeated requests hit the 4 req/min PDF download limit. Responses return 429.
**Why it happens:** ODP imposes a strict 4 req/min limit on PDF downloads (separate from the 60 req/min general limit).
**How to avoid:** The Worker does not need rate-limit handling for production (real users trigger at most one download per patent visit). For testing, pace requests manually. Handle 429 from ODP gracefully — return 502 to the extension, which then sets UNAVAILABLE.
**Warning signs:** 429 errors during rapid manual testing.

### Pitfall 5: Patent Number Format Sent to Worker
**What goes wrong:** Extension sends `US12505414B2` (full patent ID with prefix and kind code). Worker passes this to ODP search query `applicationMetaData.patentNumber:US12505414B2` and gets zero results.
**Why it happens:** ODP stores patent numbers as bare digits without `US` prefix or kind code suffix (e.g., `12505414`).
**How to avoid:** The Worker must strip the `US` prefix and kind code suffix from the input before constructing the ODP query. Alternatively, the extension sends only the numeric portion. Validate in Worker with a regex that expects digits only after stripping.
**Warning signs:** ODP search returns 0 results for valid patents.

### Pitfall 6: `reasons` Array in `ensureOffscreenDocument`
**What goes wrong:** Adding new reasons to the offscreen document call fails because the document already exists with the old `reasons` array.
**Why it happens:** Chrome caches the reasons at document creation time. Changing `reasons` in code while a document is open doesn't update it.
**How to avoid:** The existing `reasons: ['BLOBS']` is sufficient for Phase 6 — the USPTO fetch is just another fetch+blob operation. No new reasons are needed. Do NOT change the reasons array unless Phase requirements demand a new API.
**Warning signs:** Offscreen document creation fails with `InvalidStateError` if you try to create with different reasons while one is open.

## Code Examples

Verified patterns from official sources and existing codebase:

### Worker: wrangler.toml (minimal)
```toml
# worker/wrangler.toml
name = "patent-cite-worker"
main = "src/index.js"
compatibility_date = "2025-01-01"
```

### Worker: Set Secrets for Production
```bash
# Run from worker/ directory
npx wrangler secret put PROXY_TOKEN    # Prompts for value interactively
npx wrangler secret put USPTO_API_KEY  # Prompts for value interactively
```

### Worker: Local Dev (.dev.vars — not committed)
```
# worker/.dev.vars
PROXY_TOKEN=dev-token-local
USPTO_API_KEY=your-odp-api-key-here
```

### Worker: Full Deploy Workflow
```bash
cd worker/
npm install               # Install wrangler
npx wrangler dev          # Test locally at http://localhost:8787
npx wrangler deploy       # Deploy to *.workers.dev
npx wrangler secret put PROXY_TOKEN
npx wrangler secret put USPTO_API_KEY
```

### Extension: Constants additions
```javascript
// shared/constants.js additions (also duplicated in service-worker.js inline copy)
const MSG = {
  // ... existing ...
  FETCH_USPTO_PDF: 'fetch-uspto-pdf',
  USPTO_FETCH_RESULT: 'uspto-fetch-result',
};

// Worker configuration (hardcoded constants in offscreen.js)
const WORKER_URL = 'https://patent-cite-worker.YOUR_SUBDOMAIN.workers.dev';
const PROXY_TOKEN = 'your-proxy-token-here';  // Extension JS is not web-accessible
```

### manifest.json: Add host_permissions
```json
"host_permissions": [
  "https://patentimages.storage.googleapis.com/*",
  "https://patent-cite-worker.YOUR_SUBDOMAIN.workers.dev/*"
]
```

### Extension: storage.local currentPatent with source field
```javascript
// Service worker: add source field when initiating USPTO path
await chrome.storage.local.set({
  currentPatent: {
    patentId,
    patentType,
    kindCode,
    pdfUrl: null,
    status: STATUS.FETCHING,
    error: null,
    source: null,  // will be set to 'uspto' on success
  },
});

// On USPTO fetch success, update source
patent.source = 'uspto';
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `image-ppubs.uspto.gov` URL proxy | USPTO ODP API 3-step orchestration | ODP PDFs have real text layers; image-ppubs returns image-only scans |
| CORS proxy (pass-through) | API gateway (orchestrates + key-holds) | Worker now does meaningful work; extension sends only patent number |

**Deprecated/outdated:**
- `image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{number}`: Confirmed image-only PDFs (ProcSet [/PDF /ImageB], zero /Font references) across multiple test patents. Do not use.

## Open Questions

1. **Patent number format validation regex in Worker**
   - What we know: Tested patent US12505414 (8 digits). Modern US utility patents are 6-8 digits. Reissues (RE), design (D), plant (PP) patents use different numbering.
   - What's unclear: Should the Worker accept design/plant/reissue patent numbers? The CONTEXT.md only tested utility patents. ODP query uses `applicationMetaData.patentNumber` which may or may not handle non-utility number formats.
   - Recommendation: Start with `/^\d{6,8}$/` for utility patents only. This aligns with current extension scope (US patent pages). Can be expanded later.

2. **EGRANT.PDF availability for pre-2000 patents**
   - What we know: ODP eGrant PDF confirmed for US12505414 (2025). The fallback is triggered when Google Patents cannot serve the PDF.
   - What's unclear: Pre-2000 patents may not have eGrant PDFs in ODP (those are scanned grants, not electronic). The Worker would correctly return 502 (no EGRANT.PDF found), and the extension would fall through to UNAVAILABLE.
   - Recommendation: This is acceptable behavior — the Worker's error path handles it gracefully. No special handling needed in Phase 6.

3. **Streaming vs buffering the PDF in Worker**
   - What we know: PDFs are 1-5 MB via ODP. Cloudflare Worker has 128 MB memory limit. Streaming (`return pdfResp`) avoids buffering.
   - What's unclear: Whether streaming a response body from one fetch through a Worker to the client works reliably for binary PDFs.
   - Recommendation: Use streaming (return the Response body directly) since Cloudflare docs confirm this is the optimal pattern for pass-through scenarios: "if your Worker only forwards subrequest responses to the client verbatim without reading their body text, then its body handling is already optimal." The Worker does read the body for steps 1 and 2 (JSON), but step 3 can stream directly. This is Claude's discretion.

## Validation Architecture

Note: `workflow.nyquist_validation` is not present in `.planning/config.json` — the key is absent (only `workflow.research`, `workflow.plan_check`, `workflow.verifier` are set). Skipping Validation Architecture section.

## Sources

### Primary (HIGH confidence)
- Cloudflare Workers docs: [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — secret management patterns, `.dev.vars`, `wrangler secret put`
- Cloudflare Workers docs: [Get Started Guide](https://developers.cloudflare.com/workers/get-started/guide/) — wrangler init/dev/deploy workflow
- Cloudflare Workers docs: [CORS Header Proxy Example](https://developers.cloudflare.com/workers/examples/cors-header-proxy/) — CORS OPTIONS preflight pattern
- Cloudflare Workers docs: [Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — `wrangler.toml` required fields (name, main, compatibility_date)
- `.planning/uspto_api_example_code.md` (project file) — working ODP 3-step implementation, verified 2026-03-02
- `.planning/phases/06-uspto-api-fallback/06-CONTEXT.md` (project file) — locked decisions, verified ODP behavior
- `src/background/service-worker.js` (project file) — existing integration points, message handling pattern
- `src/offscreen/offscreen.js` (project file) — existing `fetchPdfWithRetry`, `storePdfInIndexedDB`, `parsePdf` patterns
- `src/manifest.json` (project file) — existing `host_permissions` structure

### Secondary (MEDIUM confidence)
- USPTO ODP docs: [Rate Limits](https://data.uspto.gov/apis/api-rate-limits) — 60 req/min general, 4 req/min PDF (confirmed independently in CONTEXT.md)
- Cloudflare Workers docs: [Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/) — streaming binary pass-through pattern
- Community (verified by official docs): CORS headers required on all responses including errors — confirmed by CORS proxy example pattern

### Tertiary (LOW confidence)
- WebSearch results on Chrome MV3 offscreen document CORS behavior — multiple sources agree offscreen is subject to CORS; verified by Chrome extension architecture docs
- Patent number format (6-8 digits) — inferred from tested examples, not authoritatively documented by USPTO

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Wrangler/Workers docs are authoritative; ODP flow verified by live testing
- Architecture: HIGH — Integration points identified directly from source code; patterns are well-established
- Pitfalls: HIGH — CORS/offscreen pitfall is a known MV3 gotcha; rate limit confirmed; others derived from API behavior
- ODP pre-2000 behavior: LOW — not tested, inferred from general knowledge of USPTO document digitization history

**Research date:** 2026-03-02
**Valid until:** 2026-06-01 (Cloudflare Workers API is stable; USPTO ODP rate limits subject to change)

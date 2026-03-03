# Phase 6: USPTO API Fallback - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning (revised — ODP API replaces image-ppubs)

<domain>
## Phase Boundary

Patents that Google Patents cannot serve are resolved by fetching the eGrant PDF via a Cloudflare Worker that acts as an API gateway to the USPTO Open Data Portal (ODP). The Worker holds the USPTO API key server-side, orchestrates the multi-step ODP lookup, and returns the PDF to the extension. The extension's existing parsing pipeline processes the USPTO-fetched PDF identically to a Google Patents-fetched one.

</domain>

<decisions>
## Implementation Decisions

### Fallback trigger
- Activates on three conditions: (1) no Google Patents PDF link found in the DOM, (2) Google Patents PDF fetch fails after retry, and (3) Google Patents PDF has no OCR/text layer (parse returns `NO_TEXT_LAYER`)
- Service worker orchestrates fallback — receives `PDF_LINK_NOT_FOUND`, `PDF_FETCH_RESULT(failure)`, or `PARSE_RESULT(no-text-layer)` and initiates the USPTO path
- Fallback is transparent to the user — no separate "trying fallback" state or UI indication
- If both Google Patents and USPTO fail, patent goes to UNAVAILABLE status with amber badge (same as current no-PDF-link behavior)

### CRITICAL: Why ODP API, not image-ppubs
- **Tested and confirmed:** USPTO `image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{number}` returns scanned images with NO text layer (ProcSet [/PDF /ImageB], zero /Font references, CCITTFaxDecode images). Tested on US5676977 (1997), US11427642 (2022), and US12505414 (2025) — all image-only.
- **ODP eGrant PDFs have real text layers:** Tested US12505414 via ODP — PDF v1.4, 116 font references, ProcSet includes /Text, created by Adobe InDesign. The existing parser can extract text from these.
- The ODP eGrant PDF is the electronic grant document the applicant receives, not a scanned image.

### USPTO ODP API flow (Worker orchestrates all 3 steps)
1. **Search**: `GET /api/v1/patent/applications/search?q=applicationMetaData.patentNumber:{number}&fields=applicationNumberText` → returns `applicationNumberText`
2. **List documents**: `GET /api/v1/patent/applications/{appNumber}/documents?documentCodes=EGRANT.PDF` → returns `downloadUrl`
3. **Download**: `GET {downloadUrl}` → returns PDF binary
- All requests require `X-API-Key` header
- Base URL: `https://api.uspto.gov`

### Worker role: API key gateway
- Worker holds the USPTO ODP API key as a Cloudflare secret — extension never sees it
- Extension sends patent number + bearer token to Worker; Worker orchestrates the 3-step ODP lookup and returns the PDF
- Extension side: static bearer token hardcoded as a constant (Chrome extension JS not accessible to web pages) — this authenticates the extension to the Worker
- Worker side: two secrets — (1) PROXY_TOKEN for extension auth, (2) USPTO_API_KEY for ODP auth
- Worker validates the patent number format before making ODP calls — no arbitrary API proxying

### User-facing feedback
- No source indicator in popup — user sees same "Ready" status regardless of PDF source
- Same loading/fetching state during USPTO fallback — no new UI states
- Source field (`google` | `uspto`) stored in `chrome.storage.local` alongside patent data for debugging
- Failure message: "PDF not available" — same as existing behavior, consistent regardless of sources tried

### Deployment setup
- Worker code lives in a subdirectory of this repo (e.g., `worker/`) — monorepo approach
- Cloudflare Workers free tier (100K requests/day)
- Default `*.workers.dev` domain — no custom domain or DNS setup
- Worker URL hardcoded as a constant in the extension, same location as bearer token

### Claude's Discretion
- Worker internal implementation (request handling, error handling, ODP response parsing)
- Which message types to add/modify for the fallback flow
- How to integrate the fallback fetch into the existing offscreen document flow
- CORS preflight handling specifics
- Whether Worker streams the PDF or buffers it (PDFs are 1-5 MB via ODP, smaller than image-ppubs)

</decisions>

<specifics>
## Specific Ideas

### Reference implementation
See `.planning/uspto_api_example_code.md` for a working ODP client implementation showing the 3-step lookup pattern (search → list documents → download). Key details:
- `documentCode` matching: look for `EGRANT.PDF` code or description containing `ELECTRONIC GRANT` / `ISSUE GRANT`
- Download URL comes from `downloadOptionBag[].downloadUrl` with `mimeTypeIdentifier: "PDF"`
- API returns results in `patentFileWrapperDataBag` (search) and `documentBag` (documents)

### Verified API behavior (tested 2026-03-02)
- API key header: `X-API-Key`
- Search for US12505414 → application 18966097 (instant, single result)
- Document list with `?documentCodes=EGRANT.PDF` → single result with download URL
- Download URL pattern: `https://api.uspto.gov/api/v1/download/applications/{appNumber}/{docId}/files/{patentNumber}_merged.pdf`
- Rate limit: 60 requests/min general, 4 requests/min for PDF downloads

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `offscreen/offscreen.js:fetchPdfWithRetry()`: Existing PDF fetch with retry — USPTO fetch can follow the same pattern
- `offscreen/pdf-parser.js` + `position-map-builder.js`: Patent-agnostic parsing pipeline — works with any PDF source
- `shared/constants.js` + service worker MSG/STATUS constants: Established message protocol to extend

### Established Patterns
- Message-passing architecture: content script → service worker → offscreen document → service worker → content script
- State management via `chrome.storage.local` (`currentPatent` object with status field)
- Badge indicators: amber for unavailable/informational, red for errors, clear on success
- Offscreen document handles all fetch and parse operations (not service worker)

### Integration Points
- `service-worker.js:handlePdfUnavailable()` — currently sets UNAVAILABLE dead-end; needs to initiate USPTO fallback instead
- `service-worker.js:handlePdfFetchResult()` — on failure, currently sets ERROR; needs to try USPTO before giving up
- `service-worker.js:handleParseResult()` — on `no-text-layer`, currently sets NO_TEXT_LAYER dead-end; needs to initiate USPTO fallback
- `manifest.json:host_permissions` — needs Worker URL added
- `chrome.storage.local:currentPatent` — needs `source` field added

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-uspto-api-fallback*
*Context gathered: 2026-03-02 (revised)*

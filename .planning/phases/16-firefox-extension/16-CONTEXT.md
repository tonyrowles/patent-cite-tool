# Phase 16: Firefox Extension - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

A complete Firefox MV3 extension exists in dist/firefox/ that loads in Firefox and produces citations using a background script instead of an offscreen document. The Firefox manifest already exists (src/manifest.firefox.json, created in Phase 15). The build pipeline already produces a manifest-only scaffold. This phase adds the actual Firefox-specific JS entry points, wires them into the esbuild pipeline, and handles Firefox API differences (no offscreen API, no declarativeContent, IndexedDB degradation).

</domain>

<decisions>
## Implementation Decisions

### Background script architecture
- **Modular imports** — thin `src/firefox/background.js` orchestrator that imports from shared modules and a new `src/firefox/pdf-pipeline.js`
- `pdf-pipeline.js` absorbs offscreen.js logic (PDF fetch, parse, IndexedDB, cache, matching) but uses **direct function calls** instead of Chrome's message-passing pattern
- Firefox background script calls pipeline functions directly (e.g. `await fetchAndParsePdf(patentId)`) — no self-messaging
- Service worker orchestration logic (icon state, storage, message routing from content scripts) lives in `background.js`
- Source files live in `src/firefox/` directory — parallel to `src/background/` (Chrome)

### PDF.js loading
- Same ES import pattern as Chrome's offscreen document — Firefox MV3 background scripts support `type: "module"`
- `import { extractTextFromPdf } from` the offscreen pdf-parser.js (shared parsing logic)

### IndexedDB degradation (FOX-05)
- **Claude's discretion** on implementation approach (try/catch per call vs detect-once-at-startup)
- **Silent degradation** — no user-facing indication when IndexedDB is unavailable
- Server cache still works without IndexedDB — check server cache, use position map in-memory if hit, skip local IndexedDB write
- **Claude's discretion** on in-memory data passing approach (background variable map vs function return values)
- Core guarantee: citations work without cache, just slower on repeat visits

### Icon activation (FOX-03)
- `tabs` permission added to **Firefox manifest only** — Chrome manifest unchanged
- Disable action by default, enable on `tabs.onUpdated` URL match (`patents.google.com/patent/US*`)
- Same context menu creation pattern as Chrome (`chrome.contextMenus.create` in `onInstalled`)
- Skip `declarativeContent` entirely — Firefox doesn't support it

### Cloudflare Worker CORS
- **No Worker changes needed** — Worker already uses `Access-Control-Allow-Origin: *` (wildcard)
- `moz-extension://` origins are already covered by the wildcard
- Bearer token provides the real authentication

### Claude's Discretion
- IndexedDB degradation implementation approach (try/catch vs detect-once)
- In-memory data passing strategy when IndexedDB is unavailable
- How pdf-parser.js and position-map-builder.js are shared between Chrome offscreen and Firefox background (import paths, build config)
- esbuild configuration for Firefox bundles (entry points, output paths, external modules)
- Firefox-specific edge cases discovered during implementation

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key architectural decisions are locked above. The Firefox extension should produce identical citation output to Chrome — same accuracy, same UX flow, same confidence indicators.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/constants.js`: MSG, STATUS, PATENT_TYPE — used by both browsers
- `src/shared/matching.js`: matchAndCite, normalizeText — core matching logic, browser-agnostic
- `src/offscreen/pdf-parser.js`: extractTextFromPdf — PDF.js wrapper, can be imported by Firefox background
- `src/offscreen/position-map-builder.js`: buildPositionMap — position map construction, browser-agnostic
- `src/offscreen/offscreen.js`: Contains all IndexedDB operations, cache check/upload, PDF fetch with retry — logic to be absorbed into Firefox pdf-pipeline.js
- `src/manifest.firefox.json`: Complete Firefox manifest already written (Phase 15) — gecko ID, permissions, background scripts array, content scripts pointing to bundled content.js

### Established Patterns
- Chrome: service-worker.js (ESM) orchestrates, offscreen.js (ESM) does PDF work via message-passing
- Content script: single IIFE bundle (content.js) — same bundle works for both browsers
- Build: esbuild with IIFE for content, ESM for background/offscreen; external pdf.mjs
- Static assets: icons, HTML pages, PDF.js lib copied as-is

### Integration Points
- `scripts/build.js`: buildFirefox() currently copies manifest only — needs esbuild configs for Firefox entry points
- `src/manifest.firefox.json`: Already references `background/service-worker.js` and `content/content.js` — output paths must match
- Firefox content.js: same IIFE bundle as Chrome (no browser-specific content script logic)
- `dist/firefox/lib/pdf.mjs` + `pdf.worker.mjs`: need to be copied to Firefox dist (same as Chrome)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-firefox-extension*
*Context gathered: 2026-03-04*

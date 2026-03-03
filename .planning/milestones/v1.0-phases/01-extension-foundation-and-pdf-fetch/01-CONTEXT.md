# Phase 1: Extension Foundation and PDF Fetch - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A working MV3 Chrome extension skeleton that activates on Google Patents, identifies the patent number from the URL, and fetches the patent PDF via an offscreen document. This phase proves the architecture works -- CSP, CORS, service worker lifecycle, and message passing are all resolved. No citation logic, no PDF parsing, no user-facing UI beyond the extension icon.

</domain>

<decisions>
## Implementation Decisions

### Patent URL Recognition
- Activate only on US patents and published applications (patents.google.com/patent/US...)
- Extract patent number from the URL path segment -- ignore locale suffixes (/en), query parameters, and anchors
- Detect and store patent type at extraction time: granted patent (US...B1/B2) vs published application (US...A1)
- Icon stays inactive on non-patent pages (search results, scholar pages, other patents.google.com URLs)

### PDF Fetch Timing and Strategy
- Eager fetch: start fetching the patent PDF as soon as a patent page is detected (don't wait for user interaction)
- One silent retry on fetch failure, then show error state
- Distinct "PDF unavailable" state for patents that have no fetchable PDF link (separate from fetch errors)

### Error Feedback
- Badge error indicator on the extension icon when PDF fetch fails (red badge or error icon)
- User clicks extension icon to see a brief error message in a small popup
- "PDF unavailable" is a distinct state from "fetch error" -- user understands it's a data limitation, not a bug

### Claude's Discretion
- Extension icon design (active vs inactive appearance)
- Offscreen document lifecycle management (create/destroy vs keep-alive)
- Message passing protocol details between service worker, content script, and offscreen document
- Exact error message wording

</decisions>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches for MV3 extension architecture.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 01-extension-foundation-and-pdf-fetch*
*Context gathered: 2026-02-27*

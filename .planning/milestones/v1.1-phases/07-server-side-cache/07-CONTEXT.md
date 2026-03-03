# Phase 7: Server-side Cache - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Parsed position maps are stored in Cloudflare KV so future users get instant citation results for previously-parsed patents without any PDF download or parse. Cache is read-before-fetch (CACH-01), write-after-parse (CACH-03), with existence check before write (CACH-04). Grants only — applications don't produce position maps.

</domain>

<decisions>
## Implementation Decisions

### Cached data shape
- Strip bounding box fields (x, y, width, height) from cached position maps — only cache: text, column, lineNumber, page, section, hasWrapHyphen
- Include positionMapMeta alongside entries: totalLines, totalColumns, hasClaimsSection
- Store as plain JSON (no compression) — position maps are well under KV's 25 MB value limit
- On cache hit, store the positionMap in local IndexedDB so subsequent citation lookups within the session don't re-hit the Worker

### Cache lifetime
- No TTL — entries persist indefinitely (patent text never changes after grant)
- Recovery plan: manual KV purge via `wrangler kv:key delete` or `wrangler kv:bulk delete` if a parsing bug is discovered
- No skip/force-refresh mechanism in the extension — keep it simple
- Include minimal metadata with each cache write: `cachedAt` timestamp and `version` (cache schema version)

### Cache versioning
- Version prefix in cache key: `v1:12505414`
- Extension sends cache version (e.g., `v=1`) in both read and write requests; Worker uses it as part of the KV key
- Worker is version-agnostic — just prefixes whatever version the client sends
- Older extension hitting a newer cache version = cache miss, falls through to normal PDF fetch+parse flow
- Initial cache version: `v1`

### Patent key format
- Bare digits only — reuse Worker's existing `cleanPatentNumber()` normalization (strips US prefix + kind code)
- All variants (US12505414B2, US12505414, 12505414) map to the same cache key: `v1:12505414`
- Grants only — published applications don't go through the position map pipeline
- Worker-side existence check before write (CACH-04): single round-trip from extension, Worker decides whether to write
- Same bearer token (PROXY_TOKEN) for cache operations as for USPTO PDF fetches — no new secrets

### Claude's Discretion
- Worker route design (query params vs. separate paths for cache read/write)
- Where in the service worker pipeline the cache check is inserted
- How the offscreen document fires the cache upload after parse
- 3-second fallback timeout implementation details (per success criteria)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches within the decisions above.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cleanPatentNumber()` in `worker/src/index.js`: Already normalizes patent IDs to bare digits — reuse for cache key generation
- `corsHeaders()` in `worker/src/index.js`: CORS header helper for all Worker responses
- Bearer token auth pattern in Worker fetch handler: Same auth flow for new cache endpoints
- IndexedDB `openDb()` and store pattern in `offscreen.js`: Reuse for writing cached positionMap to local IndexedDB on cache hit
- `positionMapMeta` structure in `parsePdf()`: Already computes totalLines, totalColumns, hasClaimsSection — cache this alongside entries

### Established Patterns
- Message-passing architecture: content script <-> service worker <-> offscreen document (fire-and-forget via chrome.runtime.sendMessage)
- Service worker uses `chrome.storage.local` for patent state tracking (status field drives the pipeline)
- Offscreen document owns all fetch + parse + IndexedDB operations
- Fallback cascade: Google PDF -> USPTO Worker -> error state (cache check slots in before Google PDF fetch)
- Worker is a single-file JS module with `export default { fetch() }` pattern

### Integration Points
- Worker needs KV namespace binding in `wrangler.toml`
- Worker fetch handler needs new route branches for cache GET and cache POST
- Service worker `handlePdfLinkFound()` is the entry point where cache check should be inserted (before offscreen FETCH_PDF)
- Service worker `handleParseResult()` (on success) is where fire-and-forget cache upload should be triggered
- New message types needed in both service worker and offscreen: cache check + cache upload
- Extension constants (WORKER_URL, PROXY_TOKEN) already in `offscreen.js` — reuse for cache requests

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-server-side-cache*
*Context gathered: 2026-03-02*

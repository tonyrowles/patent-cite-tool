# Phase 7: Server-side Cache - Research

**Researched:** 2026-03-02
**Domain:** Cloudflare Workers KV, Chrome Extension messaging, fetch timeout patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Cached data shape:** Strip bounding box fields (x, y, width, height) from cached position maps — only cache: text, column, lineNumber, page, section, hasWrapHyphen
- **Cached data shape:** Include positionMapMeta alongside entries: totalLines, totalColumns, hasClaimsSection
- **Cached data shape:** Store as plain JSON (no compression) — position maps are well under KV's 25 MB value limit
- **Cache hit behavior:** On cache hit, store the positionMap in local IndexedDB so subsequent citation lookups within the session don't re-hit the Worker
- **Cache lifetime:** No TTL — entries persist indefinitely (patent text never changes after grant)
- **Recovery plan:** Manual KV purge via `wrangler kv:key delete` or `wrangler kv:bulk delete` if a parsing bug is discovered
- **No skip/force-refresh:** No mechanism in the extension — keep it simple
- **Metadata on write:** Include `cachedAt` timestamp and `version` (cache schema version) with each write
- **Version prefix in key:** `v1:12505414` — Extension sends cache version (e.g., `v=1`) in both read and write requests; Worker uses it as part of the KV key
- **Worker is version-agnostic:** Just prefixes whatever version the client sends
- **Older extension + newer cache version = cache miss:** Falls through to normal PDF fetch+parse flow
- **Initial cache version:** `v1`
- **Patent key format:** Bare digits only — reuse Worker's existing `cleanPatentNumber()` normalization
- **All variants map to same key:** US12505414B2, US12505414, 12505414 → `v1:12505414`
- **Grants only:** Published applications don't go through the position map pipeline
- **Worker-side existence check before write (CACH-04):** Single round-trip from extension, Worker decides whether to write
- **Same bearer token (PROXY_TOKEN) for cache operations:** No new secrets

### Claude's Discretion

- Worker route design (query params vs. separate paths for cache read/write)
- Where in the service worker pipeline the cache check is inserted
- How the offscreen document fires the cache upload after parse
- 3-second fallback timeout implementation details (per success criteria)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CACH-01 | Before fetching PDF, service worker checks Cloudflare KV for cached position map | Cloudflare KV `get()` with `type: 'json'` returns null on miss; AbortController + Promise.race provides 3-second fallback |
| CACH-02 | On cache hit, patent resolves to citation-ready state without PDF download or parse | Cache hit → store positionMap directly in IndexedDB (reusing existing `openDb()` pattern) → set STATUS.PARSED |
| CACH-03 | After successful local parse, position map is uploaded to KV (fire-and-forget) | Offscreen sends new message type to service worker; service worker sends to offscreen which calls Worker POST endpoint; no UI impact |
| CACH-04 | Cache write checks for existing key first to avoid unnecessary writes (KV quota protection) | Worker-side: `env.KV.get(key)` null check before `env.KV.put()` — single round-trip from extension, Worker decides |
</phase_requirements>

---

## Summary

Phase 7 adds a Cloudflare KV-backed cache layer between the extension and the PDF fetch+parse pipeline. The extension's service worker checks KV for a pre-parsed position map before initiating any PDF download. On a cache hit, the offscreen document writes the position map directly into IndexedDB and the patent jumps to citation-ready state. On a cache miss (or Worker unreachable), the existing PDF pipeline runs unchanged.

The Worker gains two new route branches: a GET route for cache reads and a POST route for cache writes. The POST route performs the existence check (CACH-04) server-side before writing, protecting the 1,000 writes/day free-tier quota. The position map is stored as plain JSON with a `v1:` prefix in the key, enabling future schema migration by bumping the version string. The extension sends `v=1` as a query parameter; the Worker constructs `v1:{patentNumber}` as the KV key.

The 3-second fallback requirement (Success Criterion 3) is implemented with `AbortController` + `Promise.race` in the offscreen document or service worker, ensuring the extension falls through silently to the PDF pipeline when the Worker is unreachable. The cache upload after parse is fully fire-and-forget: the offscreen document sends a new message type, and the service worker delegates to the offscreen document which POSTs to the Worker without any UI-blocking await.

**Primary recommendation:** Implement Worker routes as separate HTTP methods on the same base path (`GET /?patent=&v=` for read, `POST /cache?patent=&v=` for write), parse the JSON body in the POST handler, use `env.PATENT_CACHE.get(key)` for existence check and `env.PATENT_CACHE.put(key, JSON.stringify(payload))` for write. On the extension side, insert cache check in `handlePdfLinkFound()` with a 3-second `AbortController` timeout before delegating to the existing FETCH_PDF flow.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cloudflare/workers-types` | included with wrangler | TypeScript types for KV binding | Not strictly needed — project uses plain JS |
| wrangler | ^4.69.0 (already in package.json) | KV namespace management, deploy | Already installed, used in Phase 6 |

### No New npm Packages Required

All required functionality is built into:
- Cloudflare Workers runtime: `env.KV_NAMESPACE.get()`, `env.KV_NAMESPACE.put()`
- Web platform: `AbortController`, `fetch`, `JSON.stringify/parse`
- Chrome Extension APIs: `chrome.runtime.sendMessage` (already used)

**Installation:** None needed — wrangler already at `^4.69.0`.

### Supporting (Infrastructure)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `wrangler kv namespace create` | Creates the KV namespace and returns the namespace ID | Once, before first deploy with KV binding |
| `wrangler kv key delete` | Manual key purge for bad cache entries | Recovery plan if parsing bug discovered |
| `wrangler kv bulk delete` | Purge multiple keys | Recovery plan if schema migration needed |

---

## Architecture Patterns

### Recommended File Change Map

```
worker/src/index.js           ← Add KV binding usage, GET/POST cache routes
worker/wrangler.toml          ← Add [[kv_namespaces]] binding block
src/background/service-worker.js  ← Add cache check in handlePdfLinkFound(),
                                     add CACHE_UPLOAD fire-and-forget in handleParseResult()
src/offscreen/offscreen.js    ← Add cache read + IndexedDB write on hit,
                                  add cache upload after successful parse
```

### Pattern 1: KV Namespace Binding in wrangler.toml

**What:** Declare the KV namespace so the Worker's `env` object includes the binding.
**When to use:** Required before any KV access. Must be done once with `wrangler kv namespace create`.

```toml
# Source: https://developers.cloudflare.com/kv/concepts/kv-bindings/
[[kv_namespaces]]
binding = "PATENT_CACHE"
id = "<NAMESPACE_ID_FROM_WRANGLER_CREATE>"
```

Create the namespace with:
```bash
npx wrangler kv namespace create PATENT_CACHE
# Outputs the id value to paste into wrangler.toml
```

### Pattern 2: Worker GET Route — Cache Read

**What:** Read position map from KV by versioned key. Returns JSON on hit, 404 on miss.
**When to use:** New route branch in existing fetch handler, checked before existing patent lookup logic.

```javascript
// Source: https://developers.cloudflare.com/kv/api/read-key-value-pairs/
// In Worker fetch handler, after auth check:

const url = new URL(request.url);
const path = url.pathname;

if (request.method === 'GET' && path === '/cache') {
  const rawPatent = url.searchParams.get('patent') || '';
  const version = url.searchParams.get('v') || 'v1';
  const patentNumber = cleanPatentNumber(rawPatent);

  if (!/^\d{6,8}$/.test(patentNumber)) {
    return new Response('Invalid patent number', {
      status: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  const key = `${version}:${patentNumber}`;
  const cached = await env.PATENT_CACHE.get(key, { type: 'json' });

  if (cached === null) {
    return new Response('Not found', {
      status: 404,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  return new Response(JSON.stringify(cached), {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}
```

### Pattern 3: Worker POST Route — Cache Write with Existence Check (CACH-04)

**What:** Accept position map from extension, check if key exists before writing.
**When to use:** New POST route. Worker-side existence check prevents duplicate writes without double round-trips from the extension.

```javascript
// Source: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
// In Worker fetch handler:

if (request.method === 'POST' && path === '/cache') {
  const rawPatent = url.searchParams.get('patent') || '';
  const version = url.searchParams.get('v') || 'v1';
  const patentNumber = cleanPatentNumber(rawPatent);

  if (!/^\d{6,8}$/.test(patentNumber)) {
    return new Response('Invalid patent number', {
      status: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  const key = `${version}:${patentNumber}`;

  // CACH-04: Existence check before write — protects KV write quota
  const existing = await env.PATENT_CACHE.get(key);
  if (existing !== null) {
    return new Response('Already cached', {
      status: 200,  // not 409 — idempotent from extension's perspective
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  // Parse request body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  await env.PATENT_CACHE.put(key, JSON.stringify(payload));

  return new Response('Cached', {
    status: 201,
    headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
  });
}
```

### Pattern 4: CORS Preflight for POST Route

**What:** Extend existing OPTIONS handler to include POST method and Content-Type header.
**When to use:** Chrome extensions send CORS preflights for POST with `Content-Type: application/json`.

```javascript
// Extend existing OPTIONS handler:
if (request.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
```

### Pattern 5: 3-Second Fallback Timeout (CACH-01 Success Criterion)

**What:** AbortController + Promise.race ensures cache check never blocks the PDF pipeline beyond 3 seconds.
**When to use:** In the offscreen document's cache check function, called from service worker delegated message.

```javascript
// In offscreen.js — cache read with 3-second timeout
async function checkCache(patentId, version = 'v1') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${version}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;  // 404 = cache miss, others = fallthrough
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    // AbortError (timeout) or network error — fall through silently
    return null;
  }
}
```

### Pattern 6: Cache Hit → IndexedDB Write (CACH-02)

**What:** On cache hit, store the position map directly in IndexedDB using the existing `openDb()` pattern, then signal PARSED status to the service worker.
**When to use:** In offscreen document, after successful `checkCache()` returns non-null.

```javascript
// In offscreen.js — cache hit handling
async function handleCacheHit(patentId, cachedData) {
  // Write to IndexedDB using existing openDb() pattern
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pdfs', 'readwrite');
    const store = tx.objectStore('pdfs');
    store.put({
      patentId,
      pdf: null,             // No PDF blob on cache hit
      timestamp: Date.now(),
      positionMap: cachedData.entries,
      positionMapMeta: cachedData.meta,
    });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = (e) => { db.close(); reject(e); };
  });

  chrome.runtime.sendMessage({
    type: CACHE_HIT_RESULT,
    success: true,
    patentId,
    lineCount: cachedData.meta.totalLines,
    columnCount: cachedData.meta.totalColumns,
  });
}
```

### Pattern 7: Fire-and-Forget Cache Upload After Parse (CACH-03)

**What:** After successful local parse, strip bounding box fields and POST to Worker. No await at the UI-visible layer — offscreen sends message without waiting for result.
**When to use:** In service worker `handleParseResult()` on success path.

```javascript
// In service worker — handleParseResult success path, add:
chrome.runtime.sendMessage({
  type: MSG.UPLOAD_TO_CACHE,
  patentId: patent.patentId,
}).catch(() => { /* fire-and-forget */ });
```

```javascript
// In offscreen.js — handle UPLOAD_TO_CACHE
async function uploadToCache(patentId) {
  try {
    const db = await openDb();
    const record = await getFromIndexedDB(db, patentId);
    if (!record?.positionMap || !record?.positionMapMeta) return;

    // Strip bounding box fields per locked decision
    const entries = record.positionMap.map(({ text, column, lineNumber, page, section, hasWrapHyphen }) => ({
      text, column, lineNumber, page, section, hasWrapHyphen,
    }));

    const payload = {
      entries,
      meta: record.positionMapMeta,
      cachedAt: Date.now(),
      version: CACHE_VERSION,  // 'v1'
    };

    const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    // No error handling needed — fire-and-forget per user decision
  } catch {
    // Silently ignore — cache upload failure must never affect user
  }
}
```

### Anti-Patterns to Avoid

- **Awaiting cache upload in the UI path:** The upload must be fire-and-forget. Awaiting it would add visible latency after parse completes.
- **KV read with `type: 'text'` then JSON.parse:** Use `type: 'json'` directly — it's equivalent but more readable.
- **Checking cache in the Worker for the GET and then routing back to the extension as a redirect:** The Worker returns the full JSON payload; the extension doesn't need to make a second request.
- **Using `expirationTtl` for cache entries:** The locked decision is no TTL — omit the options object from `put()` entirely.
- **Storing the full position map including bounding boxes:** This increases payload size without benefit since citation lookup only needs text, column, lineNumber, page, section, hasWrapHyphen.
- **Adding POST route to the existing GET-only CORS preflight:** Must extend the `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` to include POST and Content-Type.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KV existence check | Custom locking/semaphore | `env.KV.get(key)` null check | Worker-side check is sufficient; eventual consistency race condition is acceptable (duplicate writes are idempotent for this use case — same patent, same data) |
| Request timeout | Sleep loop with flag | `AbortController` + `signal` on `fetch()` | Native, cancels the in-flight request cleanly |
| JSON serialization | Custom serializer | `JSON.stringify/JSON.parse` | Position maps are well under 25 MB; no custom encoding needed |
| Route dispatch | Router library | Simple `if/else` on `request.method` and `url.pathname` | Worker is a single small file; matches existing pattern |

**Key insight:** The Worker is already a minimal single-file module with `if/else` routing. Adding two route branches fits the existing pattern without introducing a router library.

---

## Common Pitfalls

### Pitfall 1: CORS Preflight Fails for POST with JSON Body

**What goes wrong:** Browser sends OPTIONS preflight before the POST. If `Access-Control-Allow-Methods` only lists GET, the POST is blocked even though auth is fine.
**Why it happens:** JSON POST triggers a CORS preflight; the existing preflight handler only allows GET.
**How to avoid:** Extend the OPTIONS response to include `POST` in `Access-Control-Allow-Methods` and `Content-Type` in `Access-Control-Allow-Headers`.
**Warning signs:** Network tab shows OPTIONS returning 204 but POST shows CORS error.

### Pitfall 2: KV Write Quota Exhaustion from Duplicate Writes

**What goes wrong:** Every user who parses a patent attempts a write, even if the key already exists. On free tier, 1,000 writes/day is exhausted quickly.
**Why it happens:** Extension sends a write request; Worker skips the existence check.
**How to avoid:** CACH-04 requires the existence check before write. Implement as Worker-side `get()` null check before `put()`. One Worker GET before the PUT costs one read (100K/day free) but saves one write.
**Warning signs:** `wrangler tail` shows 429 errors on PUT operations.

### Pitfall 3: 3-Second Timeout Not Clearing Timer

**What goes wrong:** `setTimeout` fires after `clearTimeout` was supposed to cancel it, causing the `abort()` to cancel a subsequent fetch.
**Why it happens:** `clearTimeout(timeoutId)` is called in the success path but not in all catch paths.
**How to avoid:** Always call `clearTimeout(timeoutId)` in both success and error branches of the try/catch. The code example in Pattern 5 above is structured correctly.
**Warning signs:** Occasional mysterious abort errors on USPTO fetch that follows a successful cache miss.

### Pitfall 4: Cache Hit Bypasses IndexedDB Write, Breaking Citation Lookup

**What goes wrong:** Service worker sets STATUS.PARSED but offscreen document has no positionMap in IndexedDB — citation lookup returns `no-position-map`.
**Why it happens:** Cache hit path writes positionMap to service worker state only, not to IndexedDB.
**How to avoid:** Cache hit MUST write positionMap to IndexedDB (Pattern 6 above) before sending PARSE_RESULT equivalent. The `lookupPosition()` function in offscreen.js reads from IndexedDB exclusively.
**Warning signs:** Cache hit is observed (network shows 200 from Worker), but citation fails with `no-position-map` error.

### Pitfall 5: request.json() Throws on Empty Body

**What goes wrong:** POST handler calls `await request.json()` but receives a request with an empty or malformed body, throwing a SyntaxError that becomes an unhandled 500.
**Why it happens:** `request.json()` throws on parse failure.
**How to avoid:** Wrap `await request.json()` in a try/catch and return 400. Pattern 3 above shows this.
**Warning signs:** Worker returns 500 on cache upload attempts.

### Pitfall 6: KV Namespace ID Missing from wrangler.toml After Deploy

**What goes wrong:** `wrangler deploy` fails with "KV namespace not bound" or Worker has no `env.PATENT_CACHE`.
**Why it happens:** Developer runs `wrangler kv namespace create` but forgets to paste the returned `id` into `wrangler.toml`.
**How to avoid:** The `wrangler kv namespace create` command outputs the exact `[[kv_namespaces]]` block to paste. Run it, then immediately update `wrangler.toml` before any deploy.
**Warning signs:** `wrangler deploy` succeeds but Worker throws `TypeError: Cannot read properties of undefined (reading 'get')` on KV access.

### Pitfall 7: Fire-and-Forget Upload Swallowing Useful Errors During Development

**What goes wrong:** Cache upload silently fails in dev/test because the catch block eats all errors.
**Why it happens:** The production design is fire-and-forget, but during development you want visibility.
**How to avoid:** Add a `console.warn('[Offscreen] Cache upload failed:', err)` in the catch block (acceptable since it never surfaces to the user).
**Warning signs:** Cache never populates in production despite successful parses.

---

## Code Examples

Verified patterns from official sources:

### KV Namespace Create and Bind

```bash
# Source: https://developers.cloudflare.com/kv/get-started/
cd worker/
npx wrangler kv namespace create PATENT_CACHE
# Output includes:
# [[kv_namespaces]]
# binding = "PATENT_CACHE"
# id = "abc123..."
```

```toml
# wrangler.toml — add after existing content
# Source: https://developers.cloudflare.com/kv/concepts/kv-bindings/
[[kv_namespaces]]
binding = "PATENT_CACHE"
id = "abc123..."
```

### KV Get (Cache Read with Type)

```javascript
// Source: https://developers.cloudflare.com/kv/api/read-key-value-pairs/
const value = await env.PATENT_CACHE.get('v1:12505414', { type: 'json' });
// Returns parsed object on hit, null on miss
if (value === null) {
  return new Response('Not found', { status: 404, headers: corsHeaders() });
}
```

### KV Put (Cache Write, No TTL)

```javascript
// Source: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
await env.PATENT_CACHE.put('v1:12505414', JSON.stringify(payload));
// No options = no TTL, persists indefinitely
```

### AbortController Fetch Timeout

```javascript
// Source: https://developer.chrome.com/blog/abortable-fetch (verified pattern)
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 3000);
try {
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${PROXY_TOKEN}` },
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  // process response
} catch (err) {
  clearTimeout(timeoutId);
  // AbortError on timeout, TypeError on network failure — both return null
  return null;
}
```

### Wrangler KV Purge Commands (Recovery Plan)

```bash
# Single key delete — Source: https://developers.cloudflare.com/kv/reference/kv-commands/
npx wrangler kv key delete "v1:12505414" --binding PATENT_CACHE

# Bulk delete from JSON file containing key array
npx wrangler kv bulk delete keys-to-delete.json --binding PATENT_CACHE
```

---

## Cloudflare KV Free Tier Constraints

| Metric | Free Tier Limit | Impact on This Phase |
|--------|----------------|---------------------|
| Reads/day | 100,000 | Each cache check = 1 read. At 100K patents/day this saturates free tier — acceptable for this project's scale |
| Writes/day | 1,000 | CACH-04 existence check essential. Each new patent = 1 read (existence check) + 1 write |
| Max value size | 25 MiB | Position maps are 10-100 KB — well within limit |
| Max key size | 512 bytes | `v1:12505414` is ~14 bytes — well within limit |
| Same-key write rate | 1/second | Not a concern — each patent key is written at most once |
| Storage | 1 GB | No concern for expected usage |

**Source:** https://developers.cloudflare.com/kv/platform/limits/

---

## Worker Route Design Recommendation (Claude's Discretion)

**Recommendation:** Use path-based routing with separate paths for cache operations, distinct from the existing `/?patent=` USPTO proxy route.

- `GET /cache?patent={id}&v={version}` — cache read
- `POST /cache?patent={id}&v={version}` — cache write (body contains position map JSON)

**Rationale:**
- Clean separation from existing USPTO proxy at `/?patent=`
- Easy to read in logs and `wrangler tail` output
- Query params for patent ID and version are consistent with existing GET pattern
- POST body for the position map payload (not in URL — too large for query param)

**Alternative considered:** Route by HTTP method on the same base path. Rejected because GET `/?patent=` is already used for the USPTO proxy — mixing cache reads at the same path adds confusion.

---

## Pipeline Insertion Points (Claude's Discretion)

### Cache Check Location: `handlePdfLinkFound()` in service worker

The cache check slots in at the very beginning of `handlePdfLinkFound()`, before the existing `chrome.runtime.sendMessage({ type: MSG.FETCH_PDF })`:

1. Service worker receives `PDF_LINK_FOUND` message from content script
2. Service worker sends `CHECK_CACHE` message to offscreen document (new message type)
3. Offscreen document calls Worker `/cache` with 3-second timeout
4. **Cache hit:** Offscreen stores positionMap in IndexedDB, sends `CACHE_HIT_RESULT` to service worker → service worker sets STATUS.PARSED (CACH-02 satisfied, CACH-01 satisfied)
5. **Cache miss or timeout:** Offscreen sends `CACHE_MISS` to service worker → service worker continues with existing `FETCH_PDF` delegation (fallthrough to PDF pipeline)

**Why in service worker `handlePdfLinkFound()` not elsewhere:**
- `handlePdfUnavailable()` is too late — the cache check should happen before we even decide which PDF source to use
- Cache check belongs at the "we have a patent ID" moment, which is `PDF_LINK_FOUND`
- Grants only: the existing `patentType === PATENT_TYPE.GRANT` guard in `handlePdfUnavailable` doesn't need to be replicated — the content script only sends `PDF_LINK_FOUND` for grant pages

### Upload Location: `handleParseResult()` in service worker

Fire the upload immediately after the `patent.status = STATUS.PARSED` success path in `handleParseResult()`:

```javascript
// After: await chrome.storage.local.set({ currentPatent: patent });
// Fire-and-forget cache upload — CACH-03
chrome.runtime.sendMessage({
  type: MSG.UPLOAD_TO_CACHE,
  patentId: patent.patentId,
}).catch(() => { /* fire-and-forget */ });
```

---

## Eventual Consistency Implications

KV is eventually consistent — writes take up to 60 seconds to propagate globally.

**Impact on this phase:**
- **CACH-04 race condition:** If two users parse the same patent simultaneously, both may pass the existence check and both write the same key. This is acceptable — the values are identical (same patent, same position map), so the later write is harmless. This matches the use case perfectly.
- **Cache hit after write:** A user who just uploaded may not see their own write if they refresh immediately. Not a concern — the local IndexedDB copy is used for the session.
- **No correctness issue:** Because patent text never changes after grant, any version of the cached position map is valid.

**Source:** https://developers.cloudflare.com/kv/concepts/how-kv-works/

---

## New Message Types Required

The following new constants need to be added to both `service-worker.js` (inline MSG object) and `offscreen.js` (inline const declarations):

| Message Type | Sender | Receiver | Purpose |
|---|---|---|---|
| `CHECK_CACHE` | service-worker | offscreen | Trigger cache read before PDF fetch |
| `CACHE_HIT_RESULT` | offscreen | service-worker | Cache hit confirmed, positionMap ready in IndexedDB |
| `CACHE_MISS` | offscreen | service-worker | Cache miss or timeout, proceed to PDF fetch |
| `UPLOAD_TO_CACHE` | service-worker | offscreen | Trigger fire-and-forget upload after parse |

---

## Open Questions

1. **Grant-only guard in cache check path**
   - What we know: `handlePdfLinkFound()` is called when a PDF link is found, which only happens for grants (the content script sends `PDF_LINK_NOT_FOUND` for applications)
   - What's unclear: Whether the content script ever sends `PDF_LINK_FOUND` for application patents with a Google PDF link
   - Recommendation: Add an explicit `patentType === PATENT_TYPE.GRANT` guard in the cache check path to match the locked decision. Low-cost guard that makes the intent clear.

2. **`pdf: null` in IndexedDB on cache hit**
   - What we know: `lookupPosition()` only reads `record.positionMap` from IndexedDB, not `record.pdf`
   - What's unclear: Whether any other code path relies on `record.pdf` being non-null
   - Recommendation: Check `offscreen.js` for any code that touches `record.pdf` outside of `parsePdf()`. Based on current code review, only `parsePdf()` accesses `record.pdf` — cache hit path is safe to store `pdf: null`.

---

## Sources

### Primary (HIGH confidence)

- https://developers.cloudflare.com/kv/get-started/ — KV setup, namespace create, wrangler.toml binding
- https://developers.cloudflare.com/kv/api/read-key-value-pairs/ — `get()` and `getWithMetadata()` API, null return on miss, type parameter
- https://developers.cloudflare.com/kv/api/write-key-value-pairs/ — `put()` API, parameters, no-TTL behavior
- https://developers.cloudflare.com/kv/platform/limits/ — Free tier limits (100K reads/day, 1K writes/day, 25 MiB value)
- https://developers.cloudflare.com/kv/concepts/how-kv-works/ — Eventual consistency, 60-second propagation
- https://developers.cloudflare.com/kv/reference/kv-commands/ — `wrangler kv key delete`, `wrangler kv bulk delete`
- https://developers.cloudflare.com/workers/runtime-apis/context/ — `ctx.waitUntil()` for fire-and-forget (not used in this design — extension-side fire-and-forget preferred)
- https://developers.cloudflare.com/workers/examples/read-post/ — POST body JSON parsing in Worker

### Secondary (MEDIUM confidence)

- https://developer.chrome.com/blog/abortable-fetch — AbortController + fetch timeout pattern (confirmed working in offscreen document context based on Phase 6 fetch patterns already in use)

### Tertiary (LOW confidence)

- Community guidance on `getWithMetadata` for lightweight existence check — not needed for this phase since the full value is small and the Worker reads it anyway during GET

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — KV API docs verified directly, no new npm packages required
- Architecture: HIGH — Worker routing pattern consistent with existing code, KV API calls straightforward
- Pitfalls: HIGH — Derived from official KV consistency docs, CORS extension pitfalls verified in Phase 6

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (KV API is stable; wrangler commands stable)

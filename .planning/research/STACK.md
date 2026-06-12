# Stack Research — v5.0 Bug Report Feature

**Domain:** In-extension bug-report feature — Cloudflare Worker new `/report` route, KV durable storage of reports, Discord webhook notification, extension-side UI capture + background-script transport, local retry queue, options page Debug Mode
**Researched:** 2026-06-12
**Scope:** NEW work for v5.0 ONLY — existing Worker/KV/extension surfaces verified from direct source reads; nothing re-architected
**Overall confidence:** HIGH (Worker source, manifests, options page, background scripts, and constants all read directly; Discord limits verified from official docs + well-cited secondary; Cloudflare KV and secrets verified from official docs; Chrome storage limits verified from Chrome for Developers)

---

## What Was Verified vs Already Known

The milestone context asserted several facts about the existing codebase. All were confirmed by reading source directly before doing any external research.

| Claim | Verified | Source |
|-------|---------|--------|
| Worker is ES Modules syntax (`export default { async fetch(...) }`) | YES | `worker/src/index.js:120` |
| Route dispatch already uses `if (path === '/cache')` pattern | YES | `worker/src/index.js:157` |
| CORS preflight handled BEFORE auth check | YES | `worker/src/index.js:131-141` |
| `PATENT_CACHE` KV binding in `wrangler.toml` with `id` | YES | `worker/wrangler.toml:5-7` |
| `PROXY_TOKEN` and `USPTO_API_KEY` accessed via `env.*` params | YES | `worker/src/index.js:273, 126` |
| Existing routes: `GET /cache`, `POST /cache`, `GET /?patent=` | YES | `worker/src/index.js` |
| `WORKER_URL = 'https://pct.tonyrowles.com'` in offscreen | YES | `src/offscreen/offscreen.js:23` |
| `PROXY_TOKEN` embedded in extension source (known debt) | YES | `src/offscreen/offscreen.js:24` |
| `https://pct.tonyrowles.com/*` already in `host_permissions` (both manifests) | YES | `src/manifest.json:17`, `src/manifest.firefox.json:17` |
| `chrome.storage.sync` used for options settings | YES | `src/options/options.js:45` |
| `chrome.storage.local` used for `currentPatent` state | YES | `src/background/service-worker.js` throughout |
| Firefox background.js does Worker fetches (via pdf-pipeline) | YES | `src/firefox/background.js:20-21` |
| `compatibility_date = "2025-01-01"` in wrangler.toml | YES | `worker/wrangler.toml:3` |

---

## Q1: Cloudflare Worker — Current State and Adding `/report`

### Syntax Confirmed: ES Modules

`worker/src/index.js` uses `export default { async fetch(request, env, ctx) {} }`. This is the Workers Modules format. No syntax migration needed.

### How to Add the `/report` Route

The Worker dispatches on `path` at line 157. The `/report` POST handler slots in immediately after the `/cache` block and BEFORE the fallthrough USPTO proxy route (which uses `url.searchParams.get('patent')` for `GET /`). The insertion point is critical: if the handler is placed after the fallthrough, POST requests to `/report` will hit the patent-number validator and 400.

```javascript
// worker/src/index.js — insert after the /cache block (~line 253), before USPTO fallthrough

if (path === '/report' && request.method === 'POST') {
  return handleReport(request, env, ctx);
}
```

Auth is automatically shared — the existing bearer check at line 144 runs before route dispatch. `/report` inherits `PROXY_TOKEN` auth with zero additional auth code. This is intentional: the Worker token is already in the extension's offscreen document source, so the report endpoint is protected from arbitrary internet POST spam.

**`handleReport` responsibilities (all in `worker/src/index.js`):**
1. Parse and validate JSON body (same pattern as `/cache` POST at line 215)
2. Compute fingerprint: `crypto.subtle.digest('SHA-256', ...)` over `patentNumber + category + selectionText.slice(0,64)`
3. Dedup check: `env.BUG_REPORTS.get('report:${fingerprint}:*')` via `list({ prefix: \`report:${fingerprint}:\` })` — if any key exists within the last N minutes, return 409 Conflict
4. Write to `BUG_REPORTS`: `await env.BUG_REPORTS.put(key, JSON.stringify(report), { expirationTtl: 7776000 })`
5. POST to Discord webhook: `await fetch(env.DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discordPayload) })`
6. Return 201 or appropriate error — Discord failure should NOT cause a 5xx to the extension (swallow Discord errors, log to console; KV write already succeeded)

**CORS:** The existing `corsHeaders()` helper applies to all responses. `/report` needs `POST` in `Access-Control-Allow-Methods` (already present in the preflight at line 138: `'GET, POST, OPTIONS'`). No CORS change needed.

### `wrangler.toml` Changes

Add a second `[[kv_namespaces]]` block. The `[[double-bracket]]` TOML syntax means "append to array" — repeating the block is the correct pattern per Cloudflare docs.

```toml
name = "patent-cite-worker"
main = "src/index.js"
compatibility_date = "2025-01-01"

[[kv_namespaces]]
binding = "PATENT_CACHE"
id = "6e7af6faa9c340fdb8120036913b00b5"

[[kv_namespaces]]
binding = "BUG_REPORTS"
id = "<output of: npx wrangler kv namespace create 'BUG_REPORTS'>"
```

Create the namespace before editing the file:
```bash
cd worker && npx wrangler kv namespace create "BUG_REPORTS"
# Output: id = "xxxxxxxxxxxx" — paste that id above
```

### Adding the Discord Webhook URL as a Worker Secret

Secrets are set via `wrangler secret put` and appear in `env.*` at runtime. They are never in `wrangler.toml` or any committed file.

```bash
cd worker && npx wrangler secret put DISCORD_WEBHOOK_URL
# Interactive prompt — paste the full webhook URL
```

In the Worker handler: `env.DISCORD_WEBHOOK_URL` is the full Discord webhook URL string at runtime.

For local development, create `worker/.dev.vars` (must be gitignored — verify `.gitignore` covers `worker/.dev.vars`):
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

The extension code NEVER sees the Discord webhook URL. The URL lives exclusively in the Worker deployment. This is the load-bearing security property of the design.

**Confidence: HIGH** — verified against [Cloudflare Workers Secrets docs](https://developers.cloudflare.com/workers/configuration/secrets/).

---

## Q2: KV Schema for Reports

### Key Structure: Fingerprint-First

Use `report:{fingerprint}:{timestamp-ms}` — **fingerprint as prefix, timestamp as suffix**.

**Why fingerprint-first:** KV's primary query API is `list({ prefix })`. Server-side dedup needs `list({ prefix: 'report:${fingerprint}:' })` to find prior reports for the same fingerprint in one call. If keys were `report:{timestamp}:{fingerprint}`, the fingerprint dedup check would require listing the entire namespace, which hits KV list limits on volume and is O(n) expensive.

**Fingerprint construction (Worker-side, never extension-side):**
```javascript
async function computeFingerprint(patentNumber, category, selectionText) {
  const input = `${patentNumber}:${category}:${selectionText.slice(0, 64).toLowerCase().replace(/\s+/g, ' ')}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).slice(0, 5).map(b => b.toString(16).padStart(2, '0')).join('');
  // 10-hex chars = 5 bytes = 1,099,511,627,776 unique values — sufficient for dedup
}
```

`crypto.subtle` is available natively in the Cloudflare Workers runtime (Web Crypto API). No library needed.

**Key example:**
```
report:a3f9b12c4d:1749734400000
```

### Value Structure

```json
{
  "fingerprint": "a3f9b12c4d",
  "timestamp": 1749734400000,
  "category": "inaccurate",
  "note": "Column number is off by one",
  "patentNumber": "12505414",
  "patentUrl": "https://patents.google.com/patent/US12505414",
  "selectedText": "...",
  "returnedCitation": "4:32-4:45",
  "confidenceTier": "green",
  "extensionVersion": "5.0.0",
  "browser": "Chrome/125",
  "os": "Windows 10",
  "xpathNode": "...",
  "scrollY": 1200,
  "viewportWidth": 1920,
  "viewportHeight": 1080,
  "pdfParseStatus": "success",
  "triggerMode": "floating-button",
  "includePatentNumber": false,
  "errorLog": ["...", "..."]
}
```

This reuses the v3.1 `llm-report.json` schema fields (`selected_node_xpath`, `scroll_y`, `viewport_*`) remapped to camelCase for consistency with the extension's existing `chrome.storage.local` shape. Realistic payload: 2–5 KB. KV value max is 25 MB — no constraint applies here.

### TTL Strategy

Use `expirationTtl: 7776000` (90 days = 90 × 86400 seconds) on all `BUG_REPORTS.put()` calls. Rationale: 90 days covers any realistic triage cycle for a solo-maintainer tool. Bug reports are observability data, not authoritative cache — indefinite storage wastes free-tier KV quota (1 GB) for data that's irrelevant after 90 days. Contrast with `PATENT_CACHE` (no TTL, by design — position maps are immutable and benefit all users indefinitely).

```javascript
await env.BUG_REPORTS.put(key, JSON.stringify(report), { expirationTtl: 7776000 });
```

Minimum `expirationTtl` is 60 seconds per Cloudflare docs. 90 days (7,776,000 seconds) is well above that.

**Confidence: HIGH** — [Cloudflare KV Write docs](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) confirm `expirationTtl` minimum 60s and 25 MB value limit.

---

## Q3: Discord Webhook Payload

### Exact Fetch Shape

```javascript
async function postToDiscord(webhookUrl, report, fingerprint) {
  const category = report.category;
  const colorMap = {
    inaccurate: 0xF59E0B,   // amber
    'no-match':  0xEF4444,   // red
    'not-working': 0x8B5CF6, // purple
    other:       0x6B7280,   // gray
  };

  const body = JSON.stringify({
    username: 'Patent Bug Report',
    embeds: [{
      title: `[${category}] US${report.patentNumber}`.slice(0, 256),
      color: colorMap[category] ?? 0x6B7280,
      fields: [
        { name: 'Citation', value: (report.returnedCitation || 'none').slice(0, 100), inline: true },
        { name: 'Confidence', value: report.confidenceTier, inline: true },
        { name: 'Browser', value: `${report.browser} / ${report.os}`.slice(0, 100), inline: true },
        { name: 'Selected Text', value: (report.selectedText || '').slice(0, 500), inline: false },
        { name: 'Note', value: (report.note || '(none)').slice(0, 500), inline: false },
      ],
      footer: { text: `fp:${fingerprint} | v${report.extensionVersion}` },
      timestamp: new Date(report.timestamp).toISOString(),
    }],
  });

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!resp.ok && resp.status !== 429) {
    console.error(`[Worker] Discord webhook failed: ${resp.status}`);
  }
  // Discord 429 rate limit: log and swallow — KV write already succeeded
}
```

**Total character count for this embed:** title (≤80) + 5 field names (≤50) + 5 field values (≤1400 worst case) + footer (≤40) ≈ 1570 chars. Well under the 6000-char total-across-all-embeds limit.

### Hard Limits (All Verified)

| Limit | Value | Notes |
|-------|-------|-------|
| `content` field | 2,000 chars | Not using `content` — using `embeds` instead |
| Embed title | 256 chars | Truncate with `.slice(0, 256)` |
| Embed description | 4,096 chars | Not used in this design |
| Embed field name | 256 chars | All field names well under this |
| Embed field value | 1,024 chars | Truncate `selectedText` and `note` to 500 chars each for margin |
| Embed footer text | 2,048 chars | Fingerprint + version is ~30 chars |
| **Total chars across ALL embeds** | **6,000 chars** | **Binding constraint** — single embed at ~1570 chars is safe |
| Max embeds per message | 10 | Using 1 |
| Max fields per embed | 25 | Using 5 |
| **Rate limit per webhook URL** | **5 requests / 2 seconds** | Applies per webhook endpoint URL |
| Rate limit per minute | 30 requests/min | Well above v5.0 expected volume |

### Rate Limit Reality for v5.0

The client-side rate limit caps users at 5 reports per 10 minutes per install. Even with 50 concurrent users hitting the same webhook, that's at most 250 reports per 10 minutes = ~0.4/second, well under 5/2s. The rate limit is not a practical concern at this scale. If Discord returns 429, the Worker should swallow the error (the report is already in KV) rather than failing the request to the extension.

**Confidence: MEDIUM** — rate limit figures from [birdie0 Discord Webhooks guide](https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html) (well-cited community reference; official Discord docs confirmed field-level limits but the specific webhook sub-limit was in a secondary source).

---

## Q4: Extension-Side Fetch — Content Script vs Background Script

### Answer: Background Script (Service Worker), NOT Content Script

**Content scripts cannot make cross-origin requests even if the domain is in `host_permissions`.** Per [Chrome cross-origin network requests docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests):

> "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions."

The background service worker CAN call `fetch()` to `https://pct.tonyrowles.com/*` because that origin is in `host_permissions` AND the background context runs in the extension origin (not the web page origin that content scripts inherit).

### `host_permissions`: Already Covered — No Manifest Change

Both `src/manifest.json:16-19` and `src/manifest.firefox.json:16-19` already have:
```json
"host_permissions": [
  "https://patentimages.storage.googleapis.com/*",
  "https://pct.tonyrowles.com/*"
]
```

`https://pct.tonyrowles.com/*` covers `POST /report` with no path restriction — no manifest change needed.

### Message-Passing Architecture

The report submission flow follows the exact existing pattern for `MSG.FETCH_USPTO_PDF`:

1. **Content script** (`src/content/citation-ui.js`) collects report payload, sends `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })`.
2. **Background service worker** (`src/background/service-worker.js`) handles `MSG.SUBMIT_REPORT`: checks rate limit from `chrome.storage.local`, calls `fetch('https://pct.tonyrowles.com/report', { method: 'POST', headers: { Authorization: 'Bearer ...', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })`, writes/reads retry queue.
3. **Background → Content** sends `chrome.runtime.sendMessage({ type: MSG.REPORT_RESULT, success: true/false })` back (or `chrome.tabs.sendMessage` if sender tab context is needed).

For **Firefox**: `src/firefox/background.js` already uses the same `chrome.storage.local` and `fetch()` pattern (confirmed by reading lines 146, 166, 176, 198, etc.). The same message handler added to `service-worker.js` needs to be mirrored in `src/firefox/background.js`.

**Offscreen document is NOT needed for report submission.** The offscreen document exists for PDF parsing (which requires a Blob URL and `pdf.worker.mjs`). A plain JSON POST needs no offscreen context. The background service worker (Chrome) and Firefox background.js both can `fetch()` directly.

**Confidence: HIGH** — verified against official Chrome extension network request docs.

---

## Q5: Local Queue / Retry Persistence

### Use `chrome.storage.local`, NOT IndexedDB

**Rationale:**
- IndexedDB already has the `idbAvailable` graceful-degradation flag — it can silently fail in Firefox private browsing. A retry queue that silently discards reports on IDB failure defeats the queue's purpose.
- `chrome.storage.local` is the established extension state pattern: `currentPatent` key is already read/written in 30+ places across `service-worker.js` and `firefox/background.js`. The API is Promise-based with no open/close lifecycle, survives service worker restarts, and has straightforward error handling.
- Report queue entries are small (~3–6 KB each). The 10 MB `chrome.storage.local` quota (Chrome 114+; 5 MB on Chrome ≤113) is not a concern for a queue capped at 5 items.

**Queue storage shape:**
```javascript
// Key: 'reportQueue'
// Value: array of pending report objects
[
  {
    payload: { /* full report payload */ },
    attempts: 1,
    queuedAt: 1749734400000,
    lastAttemptAt: 1749734500000,
  }
]
```

**Retry trigger:** `chrome.runtime.onStartup` and `chrome.runtime.onInstalled` event handlers in both `service-worker.js` and `firefox/background.js`. On each trigger, read `reportQueue`, attempt to submit each item, remove items that succeed or have `attempts >= 3`.

**Quota math:** 5 queued reports × 6 KB each = 30 KB. The 10 MB quota has a 99.97% margin.

**Firefox parity:** `chrome.storage.local` is natively supported in Firefox without polyfill — confirmed by the existing `PROJECT.md` "No webextension-polyfill" key decision.

**Confidence: HIGH** — [Chrome Storage API docs](https://developer.chrome.com/docs/extensions/reference/api/storage) confirm `QUOTA_BYTES = 10,485,760` (10 MB, Chrome 114+; 5 MB pre-Chrome 114).

---

## Q6: Rate Limit Implementation

### Pattern: Sliding-Window Counter in `chrome.storage.local`

No library. Pure JS in the background service worker.

```javascript
// Storage key: 'reportRateLimit'
// Value shape: { timestamps: [number, ...] }

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const RATE_LIMIT_MAX = 5;

async function checkAndRecordRateLimit() {
  const now = Date.now();
  const data = await chrome.storage.local.get('reportRateLimit');
  const timestamps = (data.reportRateLimit?.timestamps ?? [])
    .filter(t => now - t < RATE_LIMIT_WINDOW_MS);  // prune expired entries

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return { allowed: false, remainingMs: RATE_LIMIT_WINDOW_MS - (now - timestamps[0]) };
  }

  timestamps.push(now);
  await chrome.storage.local.set({ reportRateLimit: { timestamps } });
  return { allowed: true };
}
```

This runs atomically in the background SW message handler for `MSG.SUBMIT_REPORT` — the rate check and the fetch happen in sequence in the same async function. No race condition risk because the extension's background context is single-threaded in practice (one message processed at a time per the Chrome extension event model).

**Pattern precedent:** The existing `service-worker.js` already does `chrome.storage.local.get('currentPatent')` / `chrome.storage.local.set({ currentPatent })` pairs in every message handler. The rate limit counter follows identical structure.

**Confidence: HIGH** — this is a pure-JS pattern with no external dependencies, verified against existing codebase patterns.

---

## Q7: What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `axios` | HTTP client library (~40 KB); does nothing `fetch()` doesn't already do; would be the first runtime npm dep in the extension build | `fetch()` — already used at `src/offscreen/offscreen.js:199, 246, 295, 427`; available natively in Workers runtime and extension background contexts |
| `uuid` / `nanoid` | Random ID generation libraries | `crypto.randomUUID()` — available natively in MV3 service workers and Cloudflare Workers runtime; zero bundle cost |
| `discord.js` / any Discord SDK | Server-side bot library with massive dependencies; designed for persistent WebSocket connections, not one-off webhook POSTs | Plain `fetch()` POST to the webhook URL — Discord webhooks are stateless HTTP, no persistent connection needed |
| `node-fetch` / `cross-fetch` | Node.js fetch compatibility shims | `fetch` is native in Cloudflare Workers runtime AND in extension service workers (MV3) — no shim needed |
| `date-fns` / `dayjs` / `moment` | Date formatting | `new Date(timestamp).toISOString()` for Discord `timestamp` field; `Date.now()` for all other timestamps |
| `crypto-js` / `sha.js` / `js-sha256` | SHA-256 for fingerprint computation | `crypto.subtle.digest('SHA-256', ...)` — available natively in Cloudflare Workers runtime (Web Crypto API) |
| `ky` | Fetch wrapper with retry/timeout | Manual retry is 10 lines; adding a library dependency for this violates the zero-new-deps constraint |
| `zod` / `joi` / `ajv` | Schema validation of report payload | A 3-field structural check at the Worker is sufficient (`typeof report.patentNumber === 'string'`); full schema validation is overkill for a solo-maintainer observability payload |
| `p-retry` / `async-retry` / `cockatiel` | Retry logic with backoff | The retry interval is "on next extension load" — not time-based backoff. A simple loop over `reportQueue` on `onStartup` is 10 lines. |
| `webextension-polyfill` | Chrome API compatibility for Firefox | Firefox natively supports `chrome.*` namespace — this is an explicit "Out of Scope" decision in `PROJECT.md` |
| Durable Objects / D1 | More capable Cloudflare persistence options | KV is already deployed and sufficient; adding a new Cloudflare product class breaks the free-tier assumption and introduces Wrangler migration complexity |

---

## Integration Points: Exact Files for New Code

| Component | File | Nature of Change |
|-----------|------|-----------------|
| Worker route + handlers | `worker/src/index.js` | Add `handleReport()` + `computeFingerprint()` + `postToDiscord()` functions; add dispatch at ~line 253 BEFORE USPTO fallthrough |
| Worker KV namespace | `worker/wrangler.toml` | Add second `[[kv_namespaces]]` block for `BUG_REPORTS` |
| Worker Discord secret | CLI only (`wrangler secret put DISCORD_WEBHOOK_URL`) | Never appears in any file |
| Message type constants | `src/shared/constants.js` | Add `SUBMIT_REPORT: 'submit-report'` and `REPORT_RESULT: 'report-result'` to `MSG` object |
| Chrome background handler | `src/background/service-worker.js` | Add `MSG.SUBMIT_REPORT` branch to the `onMessage.addListener` at line 132; add `onStartup` queue-retry handler; add `checkAndRecordRateLimit()` helper |
| Firefox background handler | `src/firefox/background.js` | Mirror the same `SUBMIT_REPORT` handler — Firefox background already does Worker fetches; same storage patterns |
| Citation UI — Report button | `src/content/citation-ui.js` | Report button affordance in Shadow DOM; collect diagnostic payload; `chrome.runtime.sendMessage(MSG.SUBMIT_REPORT, ...)` |
| Options page JS | `src/options/options.js` | Add `debugMode` checkbox handler using `chrome.storage.sync.set({ debugMode: checked })` — same auto-save + showSaved pattern as existing controls |
| Options page HTML | `src/options/options.html` | Add Debug Mode section with checkbox + `<span id="debugModeSaved">` element |
| Popup | `src/popup/popup.html` + popup JS | Secondary "Report a problem" affordance for the "tool didn't load at all" case |

---

## Recommended Stack Summary

### Core Technologies (Zero New Deps — Sixth Consecutive Milestone)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Workers (ES Modules) | existing deployed | New `/report` route handler | Already running; same `export default { fetch }` syntax; zero new infrastructure |
| Cloudflare KV — `BUG_REPORTS` namespace | new namespace, existing service | 90-day durable report storage | Already used for `PATENT_CACHE`; `expirationTtl: 7776000` for auto-expiry; free-tier compatible |
| Discord Webhook HTTP POST | N/A (HTTP only) | Real-time maintainer notification | Stateless HTTP; no SDK; webhook URL stays in Worker secret, never in extension code |
| `wrangler secret put` | existing CLI | Discord webhook URL secret management | Encrypted at rest in Cloudflare; accessed as `env.DISCORD_WEBHOOK_URL` at runtime |
| `crypto.subtle.digest` (Web Crypto) | built-in Workers runtime | Server-side SHA-256 fingerprint | Available natively; no library |
| `chrome.storage.local` | built-in extension API | Rate-limit timestamp ring + retry queue | Already used for `currentPatent`; 10 MB quota; survives SW restarts; works in private browsing |
| `chrome.storage.sync` | built-in extension API | Debug Mode toggle (syncs across devices) | Already used for all options settings in `src/options/options.js` |
| `fetch()` from background service worker | built-in | Report submission POST to Worker | Content scripts cannot cross-origin fetch; background can; `pct.tonyrowles.com/*` already in `host_permissions` |
| `crypto.randomUUID()` | built-in | Client-side report ID for retry queue | Available in MV3 service workers natively |

### What Does NOT Change

| Item | Reason |
|------|--------|
| `wrangler.toml` `compatibility_date` | Stays `2025-01-01` — no new Workers APIs needed |
| `PATENT_CACHE` KV binding | Untouched — separate namespace, no TTL change |
| `PROXY_TOKEN` auth check | `/report` inherits existing bearer auth, no change needed |
| Both manifests `host_permissions` | `pct.tonyrowles.com/*` already covers `/report` endpoint |
| esbuild pipeline structure | No structural change — new source files drop into existing `src/` directories |
| `PROXY_TOKEN` embedding in offscreen.js | Existing known debt; v5.0 does not fix it (that would be a security refactor out of scope) |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `chrome.storage.local` for retry queue | IndexedDB | IDB has `idbAvailable` graceful-degradation flag — silently fails in Firefox private browsing; a retry queue that silently drops reports on IDB failure is broken by design |
| Background service worker for report `fetch()` | Content script fetch | Chrome docs are explicit: "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions." |
| Fingerprint-first KV key `report:{fp}:{ts}` | Timestamp-first `report:{ts}:{fp}` | Dedup check requires `list({ prefix: 'report:{fp}:' })` — only works if fingerprint is the prefix component; timestamp-first forces full namespace scan |
| 90-day KV TTL | Indefinite storage | Reports are transient observability data; indefinite storage wastes free-tier KV quota with no benefit after triage window; contrast with position maps which are immutable and beneficial indefinitely |
| Worker-side Discord POST | Extension-side Discord POST | Webhook URL must NEVER be in extension code — it's extractable from the extension package by any user. Worker keeps it server-side as an encrypted secret. |
| Single embed, field-level truncation | Multi-embed rich layout | 6000-char total-across-all-embeds limit is a hard ceiling; single embed with truncated fields stays safely under 2000 chars and is sufficient for at-a-glance triage |
| `crypto.subtle.digest` for fingerprint | Embedding a SHA-256 library | Web Crypto API is available natively in both Workers runtime and MV3 service workers; adding a library would be the first runtime npm dependency in the Worker |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Worker route insertion point | HIGH | Read `worker/src/index.js` directly; exact line numbers identified |
| `wrangler.toml` KV binding syntax | HIGH | Cloudflare official docs confirmed `[[kv_namespaces]]` repeat syntax |
| Worker secret mechanism | HIGH | Cloudflare official docs for `wrangler secret put` |
| `host_permissions` coverage | HIGH | Both manifests read directly; `pct.tonyrowles.com/*` confirmed |
| Background-vs-content fetch CORS | HIGH | Chrome official extension docs quote confirmed |
| Discord webhook payload format | HIGH | Discord official docs confirmed field list; field character limits from embed docs |
| Discord webhook character limits | MEDIUM | 6000-char total-embeds limit confirmed from secondary source (Discord docs confirmed individual field limits; total-across-embeds limit from [discord-webhook.com](https://discord-webhook.com/en/blog/discord-webhook-embed-limits/)) |
| Discord rate limits | MEDIUM | 5/2sec confirmed from [birdie0 guide](https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html); Discord official rate-limit docs confirmed the header names but the webhook-specific sub-limit was secondary |
| `chrome.storage.local` quota | HIGH | Chrome for Developers API reference confirmed 10 MB (Chrome 114+), 5 MB (≤113) |
| KV TTL minimum and value size limit | HIGH | Cloudflare official KV docs confirmed 60s minimum TTL, 25 MB value limit |

---

## Sources

- `worker/src/index.js` — direct source read; ES Modules syntax, route dispatch, auth, CORS, env bindings confirmed
- `worker/wrangler.toml` — direct source read; `PATENT_CACHE` binding, `compatibility_date` confirmed
- `src/offscreen/offscreen.js:23-24` — direct source read; `WORKER_URL`, `PROXY_TOKEN` constants; existing fetch call patterns
- `src/manifest.json` + `src/manifest.firefox.json` — direct source read; `host_permissions` for `pct.tonyrowles.com/*` confirmed
- `src/options/options.js` — direct source read; `chrome.storage.sync` auto-save pattern for options settings
- `src/background/service-worker.js` — direct source read; `chrome.storage.local` pattern, message dispatch shape
- `src/firefox/background.js` — direct source read; Worker fetch imports (`fetchAndParsePdf`, `fetchUsptoAndParse`), storage pattern
- `src/shared/constants.js` — direct source read; `MSG` object structure
- [Cloudflare Workers Secrets docs](https://developers.cloudflare.com/workers/configuration/secrets/) — `wrangler secret put`; `env.*` access at runtime — HIGH confidence
- [Cloudflare KV Write docs](https://developers.cloudflare.com/kv/api/write-key-value-pairs/) — `expirationTtl` min 60s; 25 MB value limit — HIGH confidence
- [Cloudflare KV Bindings docs](https://developers.cloudflare.com/kv/concepts/kv-bindings/) — multiple `[[kv_namespaces]]` block syntax — HIGH confidence
- [Chrome Storage API docs](https://developer.chrome.com/docs/extensions/reference/api/storage) — `QUOTA_BYTES = 10,485,760` (Chrome 114+, 5 MB pre-114) — HIGH confidence
- [Chrome Cross-Origin Network Requests docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) — "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions" — HIGH confidence
- [Discord Embed Limits](https://discord-webhook.com/en/blog/discord-webhook-embed-limits/) — 6000 total-chars-across-embeds hard limit, per-field limits — MEDIUM confidence
- [birdie0 Discord Webhooks Rate Limits](https://birdie0.github.io/discord-webhooks-guide/other/rate_limits.html) — 5 requests per 2 seconds per webhook; failed requests count toward limit — MEDIUM confidence

---

*Stack research for: v5.0 Bug Report Feature — Cloudflare Worker /report route, KV durable storage, Discord webhook notification, extension-side transport + retry*
*Researched: 2026-06-12*
*Confidence: HIGH overall (all Worker/extension source read directly; external API limits verified from official or well-cited sources)*

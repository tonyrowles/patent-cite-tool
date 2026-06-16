# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 8 new/modified files
**Analogs found:** 7 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `worker/src/index.js` (modify) | route handler | request-response + CRUD | `worker/src/index.js` lines 201–252 (`/cache` POST block) | exact — same file, same dispatch pattern |
| `worker/tests/report-route.test.js` (new) | test | request-response | `worker/tests/test-mode.test.js` | exact — same framework, same Worker under test |
| `worker/vitest.config.js` (modify) | config | — | `worker/vitest.config.js` (existing file) | exact — extend miniflare.bindings |
| `worker/wrangler.toml` (modify) | config | — | `worker/wrangler.toml` lines 5–7 (`PATENT_CACHE` block) | exact — second `[[kv_namespaces]]` block |
| `worker/src/report-schema.md` (new) | documentation | — | none | no analog |
| `src/manifest.firefox.json` (modify) | config | — | `src/manifest.firefox.json` lines 11–14 | exact — same file, adjacent keys |
| `docs/privacy/index.html` (modify) | static doc | — | `docs/privacy/index.html` lines 96–143 (existing h2 sections) | exact — same file, new `<h2>` section following existing pattern |
| `store-assets/store-listing.md` (modify) | static doc | — | `store-assets/store-listing.md` lines 125–135 (Subsection 4) | exact — same file, amend Subsection 4 |

---

## Pattern Assignments

### `worker/src/index.js` — new `handleReport()` route (route handler, request-response + CRUD)

**Analog:** `worker/src/index.js` lines 160–252 (`/cache` POST block)

**Route dispatch pattern** (lines 160, 201, 244–252 — how a new `if (path === ...)` block is structured):

```javascript
// Exact pattern from worker/src/index.js lines 160 and 244–252
// The /report block inserts at line 253 — immediately after this closing brace
if (path === '/cache') {
  // ... route logic ...

  // Method not allowed for /cache path
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain',
    },
  });
}
// <-- INSERT /report block here, before line 254
```

**Auth gate — inherited, zero new code** (lines 144–153):

```javascript
// worker/src/index.js lines 144–153
// /report sits BEHIND this gate automatically — no change needed
const authHeader = request.headers.get('Authorization') || '';
if (authHeader !== `Bearer ${env.PROXY_TOKEN}`) {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain',
    },
  });
}
```

**400 / plain-text error response shape** (lines 219–225):

```javascript
// worker/src/index.js lines 219–225 — the canonical error response shape for this Worker
return new Response('Invalid JSON body', {
  status: 400,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'text/plain',
  },
});
```

**JSON success response shape** (lines 192–198):

```javascript
// worker/src/index.js lines 192–198 — JSON body with CORS + content-type header
return new Response(JSON.stringify(cached), {
  status: 200,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  },
});
```

**X-PCT-Test-Mode suppression pattern** (lines 232–234):

```javascript
// worker/src/index.js lines 232–234
// Extend the same guard to /report to suppress KV write AND Discord POST in CI
if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
  await env.PATENT_CACHE.put(key, JSON.stringify(payload));
}
```

**KV existence-check before write** (lines 203–210):

```javascript
// worker/src/index.js lines 203–210
// Same quota-protection philosophy applies to dedup check in /report
const existing = await env.PATENT_CACHE.get(key);
if (existing !== null) {
  return new Response('Already cached', {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/plain',
    },
  });
}
```

**Method-not-allowed shape** (lines 244–251):

```javascript
// worker/src/index.js lines 244–251
return new Response('Method Not Allowed', {
  status: 405,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'text/plain',
  },
});
```

**CORS preflight** (lines 131–140 — shows what methods/headers the OPTIONS response already allows):

```javascript
// worker/src/index.js lines 131–140
// 'POST' is already in Allow-Methods; 'X-PCT-Test-Mode' already in Allow-Headers
return new Response(null, {
  status: 204,
  headers: {
    ...corsHeaders(),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',
    'Access-Control-Max-Age': '86400',
  },
});
```

**New handler functions to add — patterns from RESEARCH.md (no existing codebase analog):**

The following function bodies have no existing codebase analog. Use the patterns from RESEARCH.md Code Examples directly:

- `computeFingerprint(patentNumber, category, selectionText)` — `crypto.subtle.digest('SHA-256', ...)` pattern (RESEARCH.md lines 306–333)
- `buildKvRecord(body, fingerprint, timestamp)` — field allowlist, PAY-01 (RESEARCH.md lines 507–531)
- `validateReportBody(body)` — required-field guard returning reason string (RESEARCH.md lines 539–553)
- `checkIpRateLimit(env, clientIp)` — `rl:{ip}` KV key with 60s TTL (RESEARCH.md lines 561–573)
- `checkAndHandleDuplication(env, fingerprint, now)` — `list({ prefix })` + 15-min window filter (RESEARCH.md lines 583–609)
- `postToDiscord(webhookUrl, record, fingerprint)` — embed construction with D-07 color map (RESEARCH.md lines 343–372)
- `handleReport(request, env, ctx)` — cheapest-first ordering (RESEARCH.md lines 380–389); `ctx.waitUntil()` fire-and-forget (RESEARCH.md lines 282–296)

---

### `worker/tests/report-route.test.js` (new test file, request-response)

**Analog:** `worker/tests/test-mode.test.js` (entire file, 60 lines)

**Import block** (lines 14–17):

```javascript
// worker/tests/test-mode.test.js lines 14–17 — copy these imports verbatim
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
```

**Test token constant** (line 19):

```javascript
// worker/tests/test-mode.test.js line 19
const TEST_TOKEN = 'test-token'; // must match miniflare.bindings.PROXY_TOKEN
```

**Request factory function pattern** (lines 23–29):

```javascript
// worker/tests/test-mode.test.js lines 23–29
// Adapt makeRequest() → makeReportRequest() with POST + JSON body + /report path
function makeRequest({ withTestMode }) {
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (withTestMode) headers['X-PCT-Test-Mode'] = 'true';
  return new Request(URL_BASE, { method: 'POST', headers, body: BODY });
}
```

**ctx + waitOnExecutionContext pattern** (lines 33–36):

```javascript
// worker/tests/test-mode.test.js lines 33–36
// Required for ctx.waitUntil() to resolve before assertions
const ctx = createExecutionContext();
const response = await worker.fetch(makeRequest({ withTestMode: true }), env, ctx);
await waitOnExecutionContext(ctx);
```

**KV list assertion pattern** (lines 43–44):

```javascript
// worker/tests/test-mode.test.js lines 43–44
// Use env.BUG_REPORTS.list() for /report tests (same API shape)
const listed = await env.PATENT_CACHE.list();
expect(listed.keys).toEqual([]);
// Key name format: listed.keys[0].name → 'v3:11427642' (existing)
// For /report: listed.keys[0].name → 'report:{fp}:{ts}' (new)
```

**Test scenarios required** (from RESEARCH.md Validation Architecture, lines 754–776):
- Valid POST → 201 + KV record + fingerprint in response body
- Duplicate fingerprint within 15 min → 200 + `deduped: true` + `duplicate_count` incremented in KV
- Missing required field (patentNumber) → 400 + reason string
- Invalid category value → 400 + reason string
- Body > 64 KB → 413
- Sixth request from same IP within 60s → 429 + `Retry-After` header
- Discord webhook misconfiguration → still 201 (KV write canonical)
- `X-PCT-Test-Mode: true` → suppresses KV write AND Discord POST

---

### `worker/vitest.config.js` (modify, config)

**Analog:** `worker/vitest.config.js` (entire file, 30 lines)

**Existing miniflare.bindings block** (lines 22–27):

```javascript
// worker/vitest.config.js lines 22–27 — ADD two new entries to this object
miniflare: {
  bindings: {
    PROXY_TOKEN: 'test-token',
    USPTO_API_KEY: 'test-api-key',
    // ADD: BUG_REPORTS KV namespace is wired automatically from wrangler.toml
    // ADD: DISCORD_WEBHOOK_URL so Discord fetch path is testable
    DISCORD_WEBHOOK_URL: 'https://discord.example.com/test-webhook',
  },
},
```

The `BUG_REPORTS` KV namespace is provided automatically by Miniflare once the real namespace ID is in `wrangler.toml` — no explicit binding entry needed. Only `DISCORD_WEBHOOK_URL` requires a manual addition to `miniflare.bindings`.

---

### `worker/wrangler.toml` (modify, config)

**Analog:** `worker/wrangler.toml` lines 5–7 (the existing `PATENT_CACHE` block)

**Existing block to copy** (lines 5–7):

```toml
# worker/wrangler.toml lines 5–7 — duplicate this block, change binding and id
[[kv_namespaces]]
binding = "PATENT_CACHE"
id = "6e7af6faa9c340fdb8120036913b00b5"
```

**New block to append** (append after line 7):

```toml
[[kv_namespaces]]
binding = "BUG_REPORTS"
id = "<ID from: npx wrangler kv namespace create 'BUG_REPORTS'>"
```

The real namespace ID is a manual pre-step (operator runs `wrangler kv namespace create "BUG_REPORTS"` and pastes the output ID). The planner must flag this as a prerequisite task before the TOML edit.

---

### `worker/src/report-schema.md` (new, documentation)

**Analog:** none — no existing documentation-as-schema file in the codebase.

**Content to produce:** Markdown table documenting every allowlisted field from `buildKvRecord()`, with column for field name, type, source (request body or server-computed), whether nullable, and description. Must reference PAY-01, PAY-03, and the KV key format from PAY-02. This file is the Phase 2 handoff artifact — `report-payload-builder.js` consumes it.

---

### `src/manifest.firefox.json` (modify, config)

**Analog:** `src/manifest.firefox.json` lines 11–14 (the field being changed)

**Before** (lines 11–14):

```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": []
}
```

**After** (REQUIREMENTS.md PRIV-01 — authority over PITFALLS.md divergence):

```json
"data_collection_permissions": {
  "required": ["technicalAndInteraction", "websiteActivity"],
  "optional": ["websiteContent"]
}
```

`websiteContent` is `optional` (not `required`) because selection text is user-controlled per-submission via the [Remove selection text] toggle. This is the locked PRIV-01 specification; PITFALLS.md placed it in `required` and is superseded.

---

### `docs/privacy/index.html` (modify, static doc)

**Analog:** `docs/privacy/index.html` lines 124–136 (existing `<h2>` section pattern)

**Existing h2 section structure to copy** (lines 124–136):

```html
<!-- docs/privacy/index.html lines 124–136 — h2 + p + ul structure to copy -->
<h2>Data Sharing</h2>
<p>We do not sell, trade, or transfer any data to third parties. No data is collected that could be shared.</p>

<h2>Permissions Used</h2>
<p>The extension requests the following Chrome permissions, used solely for citation generation:</p>
<ul>
  <li><strong>declarativeContent</strong> — Activates the extension icon only on Google Patents pages, not on all sites</li>
  <li>...</li>
</ul>
```

**Insertion point:** After the closing `</p>` of the "Contact" `<h2>` section at line 142, before the `<footer>` tag at line 144.

**Section heading and required content** (from PRIV-03):

The new section must be titled `<h2>Bug Report Feature</h2>` and must document:
- All fields transmitted (per PAY-01 allowlist)
- 90-day retention period
- Purpose (maintainer triage only)
- Per-submission opt-out for selection text (the [Remove selection text] toggle)
- Destinations: Cloudflare KV (`BUG_REPORTS` namespace) and Discord channel (maintainer-only)
- No IP address stored in report records (PAY-03)
- Voluntary and user-initiated only

The opening paragraph must also update the existing statement on line 94 ("Patent Citation Tool does not collect, store, or transmit any personal data") — it is now false for voluntary bug reports. Add a qualifying clause, e.g., "except as described in the Bug Report Feature section below."

---

### `store-assets/store-listing.md` (modify, static doc)

**Analog:** `store-assets/store-listing.md` lines 125–135 (Subsection 4: Data Use Practices)

**Existing text that must change** (lines 127–129):

```markdown
<!-- store-assets/store-listing.md lines 127–129 — this text is now inaccurate -->
**Data types collected:** Select none / leave all checkboxes unchecked.

The extension does not collect: personally identifiable information, health information,
financial information, authentication information, personal communications, location data,
web history, user activity, or website content.
```

**Required amendments** (from PRIV-04 and Pitfall 7):
- Update "Data types collected" to acknowledge that **Website Content** may be voluntarily submitted via the bug report feature (patent text selection up to ~200 chars, when user does not toggle off)
- Add a carve-out paragraph: for normal citation-only operation, no data is collected; when a user voluntarily submits a bug report, certain diagnostic fields (listed in the privacy policy) are transmitted to first-party infrastructure
- Also amend the description in Section 1 (lines 29–46): add a sentence mentioning the voluntary bug report capability

The `store-listing.md` document structure (heading levels, table format for permission justifications) should remain identical to the existing file — only content within Subsection 4 and one sentence in Section 1 Description changes.

---

## Shared Patterns

### CORS + plain-text error response
**Source:** `worker/src/index.js` lines 148–153, 168–175, 219–225, 244–251
**Apply to:** All error branches in `handleReport()` (401 inherited, 405, 400, 413, 429)

```javascript
// Canonical error shape — used by every error branch in the existing Worker
return new Response('<reason string>', {
  status: <code>,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'text/plain',
  },
});
```

### CORS + JSON success response
**Source:** `worker/src/index.js` lines 192–198
**Apply to:** `handleReport()` success branches (201 new record, 200 deduped)

```javascript
return new Response(JSON.stringify({ ok: true, fingerprint, deduped: false }), {
  status: 201,
  headers: {
    ...corsHeaders(),
    'Content-Type': 'application/json',
  },
});
```

### X-PCT-Test-Mode guard
**Source:** `worker/src/index.js` lines 232–234
**Apply to:** KV write and `ctx.waitUntil(Discord POST)` in `handleReport()`

```javascript
if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
  // KV write + Discord POST go here
}
```

### Worker test harness
**Source:** `worker/tests/test-mode.test.js` lines 14–17, 19, 23–29, 33–36
**Apply to:** `worker/tests/report-route.test.js` — import block, token constant, request factory, ctx pattern

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `worker/src/report-schema.md` | documentation | — | No existing schema-as-doc files in the codebase; content is derived entirely from PAY-01 field allowlist in RESEARCH.md |

---

## Metadata

**Analog search scope:** `worker/src/`, `worker/tests/`, `worker/`, `src/`, `docs/`, `store-assets/`
**Files read:** `worker/src/index.js` (293 lines), `worker/tests/test-mode.test.js` (60 lines), `worker/vitest.config.js` (30 lines), `worker/wrangler.toml` (7 lines), `src/manifest.firefox.json` (76 lines), `docs/privacy/index.html` (150 lines), `store-assets/store-listing.md` (174 lines)
**Pattern extraction date:** 2026-06-12

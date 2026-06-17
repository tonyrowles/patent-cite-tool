# Phase 1: Worker Route + KV Schema + Privacy Compliance Groundwork - Research

**Researched:** 2026-06-12
**Domain:** Cloudflare Worker (ES Modules), Cloudflare KV, Discord Webhooks, Firefox AMO `data_collection_permissions`, Chrome Web Store privacy disclosure
**Confidence:** HIGH (all Worker/extension source files read directly; all CONTEXT.md locked decisions already backed by prior authoritative research; environment tools verified)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Auth posture for /report:** `/report` sits BEHIND the existing Bearer `PROXY_TOKEN` gate (`worker/src/index.js:144`) — insertion point at ~line 253 (before the USPTO proxy fallthrough, per XPORT-01). ROADMAP Success Criterion 1's `curl` gains an `Authorization: Bearer` header.

**D-02 — Duplicate response semantics:** Dedup hit (identical fingerprint within 15 min) returns HTTP 200 with body `{ok: true, fingerprint, deduped: true}`.

**D-03 — Discord notification for duplicates:** Discord notification is fully suppressed for duplicates — `duplicate_count` lives only in the KV record. No Discord thread creation (CAP-DEF-01 rejected).

**D-04 — KV write is canonical; Discord is best-effort:** Write KV first, return 201, then fire the Discord webhook via `ctx.waitUntil()`. A Discord outage never costs a report.

**D-05 — Discord embed design (compact triage card):** Embed fields: patent # (hyperlinked to Google Patents URL), category, confidence tier, user note, extension version, browser/OS, fingerprint. Full diagnostics (xpath, error buffer, settings snapshot, viewport) live in KV only.

**D-06 — Selection text in embed:** Truncated ~200-char quoted snippet when present. When `selectionText` is absent from the payload it is absent from the embed.

**D-07 — Embed color-coded by category:** red = `tool_not_working`, orange = `inaccurate_citation`, yellow = `no_match`, gray = `other`. Title format: `[category] — US{patent#}`.

**D-08 — Unknown fields silently stripped:** Worker copies only allowlisted fields (PAY-01) into the KV record and ignores the rest.

**D-09 — HTTP 400 on invalid required fields:** Required set: patent #, category (must be one of 4 frozen `REPORT_CATEGORIES`), extension version. Returns 400 with reason string.

**D-10 — 64 KB request body cap:** Checked before `JSON.parse`; over-limit returns HTTP 413.

### Claude's Discretion

- Exact embed field ordering, footer content, and timestamp formatting within D-05/D-06/D-07 constraints.
- 401/405 response shapes for `/report` (follow existing route conventions in `worker/src/index.js`).
- Whether the IP rate-limit check (LIMIT-02) runs before or after body parsing/validation — pick the cheapest-first ordering.
- Privacy policy section wording and store-listing draft copy (PRIV-03/PRIV-04 specify required content; phrasing is Claude's).
- Worker test structure (existing pattern: `worker/tests/test-mode.test.js`, `worker/vitest.config.js`).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Discord message-editing for duplicate counts was considered and rejected in D-03, not deferred.)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XPORT-01 | New `POST /report` route in `worker/src/index.js` at ~line 253; validates body schema, computes fingerprint, dedup lookup, writes to KV, posts to Discord; returns `{ok: true, fingerprint, deduped: bool}` | Worker source read; insertion point confirmed at line 253 after `/cache` block, before USPTO fallthrough |
| XPORT-02 | `wrangler.toml` adds new KV namespace binding `BUG_REPORTS` (separate from `PATENT_CACHE`) | `[[kv_namespaces]]` append syntax verified; `wrangler kv namespace create` required before edit |
| XPORT-03 | `npx wrangler secret put DISCORD_WEBHOOK_URL`; Worker accesses via `env.DISCORD_WEBHOOK_URL` only; NEVER in any committed file | `wrangler secret put` pattern confirmed; `.dev.vars` already gitignored |
| XPORT-04 | `worker/.dev.vars` added to `.gitignore` or confirmed already present | VERIFIED: already in both `.gitignore` (line: `worker/.dev.vars`) and `worker/.gitignore` (line: `.dev.vars`) — XPORT-04 is verify-only |
| PAY-01 | KV record schema is an explicit field allowlist (no JSON.stringify blob); documented in `worker/src/report-schema.md` | Schema designed below; D-08 enforces silent strip of unknown fields |
| PAY-02 | KV record key format `report:{fingerprint}:{timestamp}` — fingerprint as prefix; `expirationTtl: 7776000` (90 days) | Fingerprint-first ordering required for `list({ prefix })` dedup; TTL confirmed from Cloudflare docs |
| PAY-03 | KV record has NO `ip`, `clientIp`, `userAgent`, or IP-derived fields | GDPR hard constraint; IP used for rate-limit key `rl:{ip}` only (60s TTL, separate from report records) |
| PAY-04 | Fingerprint algorithm: SHA-256 hex of `${patent#}\|${category}\|${selectionHash}` using `crypto.subtle.digest`; selectionHash is SHA-256 of normalized selection text | `crypto.subtle` is native in Workers runtime; no library needed |
| PRIV-01 | `src/manifest.firefox.json` `data_collection_permissions` updated: `required: ["technicalAndInteraction", "websiteActivity"], optional: ["websiteContent"]` | REQUIREMENTS.md is authority; selection text is user-controlled per-submission (hence `optional`) |
| PRIV-02 | `src/manifest.json` (Chrome) — verified no required CWS manifest changes for data-collection | CWS uses store listing + privacy policy + in-product disclosure; no manifest field equivalent to Firefox |
| PRIV-03 | `docs/privacy/index.html` updated with "Bug Report Feature" section documenting payload field-by-field, 90-day retention, purpose, per-submission opt-out, destinations, no IP stored | Privacy policy HTML read; current "Information We Collect" section asserts zero collection — must be updated |
| PRIV-04 | CWS store-listing draft text amended to mention bug-reporting capability and link updated privacy policy; staged in `store-assets/store-listing.md` | `store-assets/store-listing.md` confirmed as the location; "Data collected: None" statement must be updated |
| PRIV-05 | `web-ext lint` continues to pass with zero AMO-blocking warnings after manifest update | `web-ext` not found in current shell PATH — see Environment Availability; must be run via `npx web-ext lint` |
| LIMIT-01 | Server-side fingerprint dedup via `list({ prefix: 'report:{fingerprint}:' })` over 15-min window; on hit, increment `duplicate_count`; Discord suppressed for duplicates | STACK.md KV list API confirmed; dedup key design uses timestamp suffix to enable prefix-scan |
| LIMIT-02 | Server-side IP-keyed transient rate limit: KV key `rl:{ip}` with 60s TTL and 5-request ceiling; over-ceiling returns HTTP 429; IP never in stored report record | `CF-Connecting-IP` header available in Workers runtime; KV TTL minimum 60s confirmed |
</phase_requirements>

---

## Summary

Phase 1 is entirely server-side and docs-side — no extension build changes. It establishes three blocking gates that prevent any compliant extension release without them: BLOCK-01 (privacy compliance — manifest + privacy policy), BLOCK-02 (webhook URL hygiene — wrangler secret only), and BLOCK-03 (IP-not-in-KV — PAY-03 hard constraint). All three must land together in this phase.

The Worker (`worker/src/index.js`) is 293 lines of ES Modules with a clear route dispatch pattern. The new `POST /report` handler inserts at line 253 — after the `/cache` block, before the USPTO proxy fallthrough — inheriting the existing Bearer auth gate at line 144 with zero additional auth code. The KV namespace `BUG_REPORTS` is separate from `PATENT_CACHE` for quota isolation; the Discord webhook URL lives exclusively as a Worker secret via `wrangler secret put`.

The Firefox manifest (`src/manifest.firefox.json`) currently declares `data_collection_permissions: { required: ["none"], optional: [] }` — a reviewable contradiction once the `/report` route exists. The privacy policy at `docs/privacy/index.html` currently states "no personal data collected" — both must be updated in the same commit as the Worker route. The store listing at `store-assets/store-listing.md` currently certifies "Data collected: None" — this needs an addendum.

Prior research (STACK.md, PITFALLS.md, ARCHITECTURE.md) was conducted by reading source files directly and verified against Cloudflare and Chrome official documentation. All locked decisions in CONTEXT.md are backed by that research. This phase research focuses on confirming what was already established and mapping exact implementation details to each requirement.

**Primary recommendation:** Build in dependency order within the phase — (1) run `wrangler kv namespace create "BUG_REPORTS"` to get the namespace ID, (2) implement `handleReport()` in `worker/src/index.js`, (3) add `BUG_REPORTS` binding to `wrangler.toml`, (4) configure `wrangler secret put DISCORD_WEBHOOK_URL`, (5) update Firefox manifest, (6) update privacy policy, (7) update store listing, (8) write `worker/src/report-schema.md`, (9) extend `worker/tests/` with Vitest tests for the new route.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| POST /report route handler | API / Backend (Cloudflare Worker) | — | Server-side only; no extension build changes this phase |
| KV dedup check (`list({ prefix })`) | API / Backend | — | Worker-side operation against `BUG_REPORTS` KV |
| KV report record write | Database / Storage (KV) | — | `expirationTtl: 7776000`; fingerprint-first key |
| IP rate-limit check (`rl:{ip}` KV key) | API / Backend | — | Transient 60s KV key; IP never stored in report record |
| Discord webhook notification | API / Backend | — | `ctx.waitUntil()` fire-and-forget; URL stays server-side |
| Fingerprint computation (SHA-256) | API / Backend | — | `crypto.subtle.digest` native in Workers; server-side only for Phase 1 |
| Firefox `data_collection_permissions` | CDN / Static (docs) | — | Manifest file change; no runtime behaviour |
| Chrome manifest (no change) | — | — | Verified: no manifest change required for Chrome |
| Privacy policy page update | CDN / Static (docs) | — | `docs/privacy/index.html` static HTML |
| Store listing draft update | CDN / Static (docs) | — | `store-assets/store-listing.md` document update |
| KV schema compliance doc | API / Backend | — | `worker/src/report-schema.md` — PAY-01 artifact |

---

## Standard Stack

### Core

This phase adds zero new packages. All capabilities use existing runtime APIs.

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Cloudflare Workers (ES Modules) | Deployed (wrangler 4.54.0 detected) | New `POST /report` route | Already running; same `export default { fetch }` syntax |
| Cloudflare KV — `BUG_REPORTS` namespace | New namespace, existing service | 90-day durable report storage | Already used for `PATENT_CACHE`; free-tier compatible |
| `crypto.subtle.digest` (Web Crypto API) | Built-in Workers runtime | Server-side SHA-256 fingerprint | Available natively; zero library cost |
| `ctx.waitUntil()` | Built-in ExecutionContext | Fire-and-forget Discord POST | Identical to existing pattern in Worker |
| `fetch()` | Built-in Workers runtime | POST to Discord webhook | Native; no library needed |
| `wrangler secret put` | Wrangler CLI 4.54.0 | Discord webhook URL secret management | Encrypted at rest; accessed as `env.DISCORD_WEBHOOK_URL` |

### Supporting (test infrastructure)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@cloudflare/vitest-pool-workers` | `^0.16.6` (installed) | Worker integration tests with Miniflare | Extend existing `test-mode.test.js` pattern |
| `vitest` | `^4.1.7` (current) | Test runner for Worker tests | `npm test` in `worker/` directory |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.subtle.digest` for fingerprint | SHA-256 npm library | Native Web Crypto is zero-dependency; library would violate zero-new-deps constraint |
| `ctx.waitUntil()` for Discord POST | `await discordFetch()` before returning | `waitUntil()` keeps the 201 response fast; `await` adds Discord RTT to the user-visible response time |
| Separate `rl:{ip}` KV key for rate limit | In-memory counter | KV persists across Worker restarts; in-memory resets on cold start, defeating rate limiting |
| Fingerprint-first KV key (`report:{fp}:{ts}`) | Timestamp-first (`report:{ts}:{fp}`) | Prefix-scan dedup requires fingerprint as the prefix component; timestamp-first forces full namespace scan |

**Installation:** No new packages to install. Worker dependencies are already installed in `worker/node_modules/`.

---

## Package Legitimacy Audit

> This phase installs zero new external packages. The zero-new-deps constraint (sixth consecutive milestone) is maintained.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No package installation occurs in Phase 1.*

---

## Architecture Patterns

### System Architecture Diagram

```
Extension (Phase 3+)                      Phase 1 boundary
   |                                           |
   | fetch POST /report                        |
   | Authorization: Bearer PROXY_TOKEN         |
   v                                           v
┌──────────────────────────────────────────────────────────┐
│  Cloudflare Worker  (worker/src/index.js)                │
│                                                          │
│  1. CORS preflight (OPTIONS) — before auth               │
│  2. Bearer PROXY_TOKEN check (line 144) ────────────────► 401 if invalid
│  3. Route dispatch on url.pathname                       │
│     ├── /cache → existing handler (unchanged)            │
│     ├── /report POST → handleReport()  ◄── NEW          │
│     │     │                                              │
│     │     ├─[body > 64KB]──────────────────────────────► 413
│     │     ├─[parse error]─────────────────────────────► 400
│     │     ├─[invalid fields]──────────────────────────► 400 + reason
│     │     ├─[IP rate limit check via rl:{ip} KV]        │
│     │     │   └─[>5 req/60s]───────────────────────────► 429 + Retry-After
│     │     ├─[fingerprint dedup via list({ prefix })]    │
│     │     │   └─[hit within 15min]──────────────────────► 200 {ok, deduped:true, duplicate_count++}
│     │     ├─[KV write: report:{fp}:{ts}]               │
│     │     ├─[return 201 {ok, fingerprint, deduped:false}]
│     │     └─[ctx.waitUntil(Discord POST)]  ─────────────► Discord channel
│     │           (fire-and-forget; KV write already succeeded)
│     └── /?patent= → USPTO proxy (unchanged)             │
└──────────────────────────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │ Cloudflare KV       │
         │ BUG_REPORTS ns      │
         │                     │
         │ report:{fp}:{ts}    │ ← report records (90-day TTL)
         │   {fingerprint,     │
         │    timestamp,       │
         │    category,        │
         │    patentNumber,    │
         │    ...allowlisted   │
         │    fields,          │
         │    duplicate_count} │
         │                     │
         │ rl:{ip}             │ ← rate-limit key (60s TTL, count only)
         └─────────────────────┘
```

### Recommended Project Structure

```
worker/
├── src/
│   ├── index.js              # Modified — add handleReport(), computeFingerprint(), postToDiscord()
│   └── report-schema.md      # NEW — PAY-01 compliance artifact (field allowlist)
├── tests/
│   ├── test-mode.test.js     # Existing — unchanged
│   └── report-route.test.js  # NEW — Vitest tests for POST /report
├── wrangler.toml             # Modified — add [[kv_namespaces]] for BUG_REPORTS
└── vitest.config.js          # Modified — add BUG_REPORTS binding to miniflare.bindings
```

```
src/
└── manifest.firefox.json     # Modified — data_collection_permissions update
docs/
└── privacy/index.html        # Modified — add Bug Report Feature section
store-assets/
└── store-listing.md          # Modified — amend description + data-use subsection
```

### Pattern 1: Route Insertion (Critical Ordering)

**What:** New `/report` route branch inserted AFTER `/cache` block, BEFORE USPTO proxy fallthrough.

**When to use:** Any new Worker route that must not be caught by the USPTO patent-number validator at line 258.

**Why ordering is load-bearing:** The USPTO fallthrough at line 255 calls `cleanPatentNumber(url.searchParams.get('patent'))` and validates with `/^\d{6,8}$/`. A POST to `/report` with no `?patent=` query param would hit this validator and return 400 with "Invalid patent number" — a confusing error.

```javascript
// Source: worker/src/index.js — insert after line 252 (end of /cache block)

// Report submission route: POST /report
if (path === '/report') {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }
  return handleReport(request, env, ctx);
}

// USPTO proxy route: GET /?patent={number}  ← existing line 255
```

### Pattern 2: KV Key Schema (Fingerprint-First)

**What:** Report records keyed as `report:{fingerprint}:{timestamp_ms}` for prefix-scan dedup.

**When to use:** Any KV operation that needs to find all records sharing a common prefix.

```javascript
// Source: STACK.md — fingerprint-first key rationale + REQUIREMENTS.md PAY-02

// KEY for report record
const key = `report:${fingerprint}:${Date.now()}`;
await env.BUG_REPORTS.put(key, JSON.stringify(record), { expirationTtl: 7776000 });

// DEDUP LOOKUP — finds all records with same fingerprint regardless of timestamp
const existing = await env.BUG_REPORTS.list({ prefix: `report:${fingerprint}:` });
// existing.keys is empty → no prior record; non-empty → dedup hit

// RATE LIMIT KEY — transient, never in report record
const rlKey = `rl:${clientIp}`;
// Written with expirationTtl: 60; value is a count string e.g. "3"
```

### Pattern 3: Fire-and-Forget Discord POST

**What:** Use `ctx.waitUntil()` so the 201 response returns immediately after the KV write.

**When to use:** Any non-critical side-effect that should not block the HTTP response.

```javascript
// Source: ARCHITECTURE.md D-04; pattern identical to existing UPLOAD_TO_CACHE usage

// KV write — await (canonical; must succeed before 201)
await env.BUG_REPORTS.put(key, JSON.stringify(record), { expirationTtl: 7776000 });

// Return 201 immediately
const response = new Response(JSON.stringify({ ok: true, fingerprint, deduped: false }), {
  status: 201,
  headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
});

// Discord POST — fire and forget AFTER response is queued
ctx.waitUntil(postToDiscord(env.DISCORD_WEBHOOK_URL, record, fingerprint));

return response;
```

### Pattern 4: SHA-256 Fingerprint (Native Web Crypto)

**What:** Server-side fingerprint computation with `crypto.subtle.digest` — no library.

**When to use:** Any content-addressed hashing in Cloudflare Workers runtime.

```javascript
// Source: STACK.md Q2 + REQUIREMENTS.md PAY-04

async function computeFingerprint(patentNumber, category, selectionText) {
  // Normalize selection text: collapse whitespace, lowercase, take first 64 chars
  const normalizedSelection = (selectionText || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);

  // Compute selectionHash separately as PAY-04 specifies
  const selectionHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalizedSelection)
  );
  const selectionHash = Array.from(new Uint8Array(selectionHashBuf))
    .slice(0, 4)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Final fingerprint: SHA-256 of "patent|category|selectionHash"
  const input = `${patentNumber}|${category}|${selectionHash}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''); // 16 hex chars = 8 bytes; sufficient uniqueness for dedup
}
```

### Pattern 5: Discord Embed with Color-Coding (D-05/D-06/D-07)

**What:** Compact triage card embed with category-keyed color stripe and truncated selection snippet.

```javascript
// Source: CONTEXT.md D-05, D-06, D-07; character limits from STACK.md Q3

const CATEGORY_COLORS = {
  tool_not_working:  0xEF4444,  // red
  inaccurate_citation: 0xF97316, // orange
  no_match:          0xEAB308,  // yellow
  other:             0x6B7280,  // gray
};

// D-07: title format locked
const title = `[${record.category}] — US${record.patentNumber}`.slice(0, 256);

// D-06: selection snippet (~200 chars, quoted)
const selectionSnippet = record.selectionText
  ? `> ${record.selectionText.slice(0, 200)}${record.selectionText.length > 200 ? '…' : ''}`
  : null;

const embed = {
  title,
  color: CATEGORY_COLORS[record.category] ?? 0x6B7280,
  fields: [
    { name: 'Patent', value: `[US${record.patentNumber}](${record.patentUrl || `https://patents.google.com/patent/US${record.patentNumber}`)})`.slice(0, 1024), inline: true },
    { name: 'Category', value: record.category, inline: true },
    { name: 'Confidence', value: record.confidenceTier || 'n/a', inline: true },
    { name: 'Version / Browser / OS', value: `v${record.extensionVersion} · ${record.browser} · ${record.os}`.slice(0, 1024), inline: false },
    ...(record.note ? [{ name: 'Note', value: record.note.slice(0, 1024), inline: false }] : []),
    ...(selectionSnippet ? [{ name: 'Selection', value: selectionSnippet.slice(0, 1024), inline: false }] : []),
  ],
  footer: { text: `fp:${fingerprint}` },
  timestamp: new Date(record.timestamp).toISOString(),
};
```

### Pattern 6: Cheapest-First Operation Ordering (Claude's Discretion)

**What:** IP rate-limit check runs BEFORE body parsing — cheapest operation first.

**When to use:** Any handler with multiple guard checks — order from cheapest to most expensive.

```
1. Check Content-Length header against 64KB cap (D-10) — zero I/O
2. Check IP rate limit via rl:{ip} KV key — one KV read
3. Parse JSON body — CPU cost
4. Validate required fields — CPU cost
5. Compute fingerprint — async crypto operation
6. Dedup check via list({ prefix }) — one KV list call
7. KV write — one KV write
8. Return 201; ctx.waitUntil(Discord POST)
```

### Anti-Patterns to Avoid

- **IP stored in KV report record:** `CF-Connecting-IP` is GDPR personal data. It goes into `rl:{ip}` only (60s transient key). Never appears in a `report:{fp}:{ts}` value. [VERIFIED: PITFALLS.md Pitfall 1, PAY-03]
- **Discord webhook URL in any committed file:** CRX/XPI files are publicly downloadable. Worker secret only. [VERIFIED: PITFALLS.md Pitfall 2, D-XPORT-03]
- **`JSON.stringify(settings)` blob in KV:** Captures user-typed content (custom prefix text). Use explicit field allowlist per PAY-01. [VERIFIED: PITFALLS.md Pitfall 1]
- **`await discordFetch()` before returning 201:** Blocks the user-visible response on Discord RTT. Use `ctx.waitUntil()`. [VERIFIED: ARCHITECTURE.md Anti-Pattern 3]
- **Single `[[kv_namespaces]]` namespace for both PATENT_CACHE and BUG_REPORTS:** Comingles TTL profiles (cache has no TTL; reports have 90-day TTL) and makes quota monitoring ambiguous. [VERIFIED: ARCHITECTURE.md Anti-Pattern 4]
- **Route inserted AFTER USPTO fallthrough:** `/report` POST with no `?patent=` param returns 400 "Invalid patent number" from the patent validator at line 258. [VERIFIED: worker/src/index.js source read]
- **`data_collection_permissions` updated without privacy policy update in same commit:** A manifest declaring data collection while the privacy policy still says "no personal data collected" is a reviewable AMO contradiction. [VERIFIED: PITFALLS.md Pitfall 3]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | npm SHA-256 library | `crypto.subtle.digest('SHA-256', ...)` — built-in Web Crypto | Native in Workers runtime; zero bundle cost; zero new dep |
| Fire-and-forget async work | Promise chains with error swallowing | `ctx.waitUntil(promise)` — ExecutionContext API | Cloudflare's official mechanism; keeps the Worker alive until promise settles; no extra code |
| KV TTL-based expiry | Manual cleanup cron job | `expirationTtl` parameter on `put()` | Native KV feature; automatic; no Worker resources consumed |
| Rate-limit counter | In-memory object in Worker global scope | KV key `rl:{ip}` with `expirationTtl: 60` | Worker instances are stateless; memory resets on cold start; KV persists across all instances |
| Dedup scan | Full namespace scan + filter | `env.BUG_REPORTS.list({ prefix: 'report:{fp}:' })` | KV list prefix filtering is the designed API; full scan hits list quota and O(n) latency |
| Discord embed truncation | Complex markdown formatter | `.slice(0, N)` at each field | Discord enforces hard character limits per field; simple slice is sufficient and safe |

**Key insight:** Cloudflare Workers runtime provides native APIs (Web Crypto, KV, ExecutionContext) that eliminate the need for helper libraries in every case this phase encounters. The zero-new-deps constraint is not a sacrifice — it is alignment with what the platform offers natively.

---

## Common Pitfalls

### Pitfall 1: Route Insertion Ordering

**What goes wrong:** `/report` handler placed after the USPTO proxy route. POST requests with no `?patent=` query param hit `cleanPatentNumber('')` which returns `''`, failing the `/^\d{6,8}$/` regex. Caller gets HTTP 400 "Invalid patent number" instead of the expected behavior.

**Why it happens:** Developers scanning the file see the large "fallthrough" at line 254 and append new routes below it rather than above.

**How to avoid:** Insert the `/report` branch at line 253 — immediately after the closing `}` of the `/cache` block, before the `const rawPatent = url.searchParams.get('patent') || ''` line.

**Warning signs:** `curl -X POST https://pct.tonyrowles.com/report -H "Authorization: Bearer ..."` returns "Invalid patent number" with HTTP 400.

### Pitfall 2: `data_collection_permissions` Taxonomy Ambiguity

**What goes wrong:** `websiteContent` (selection text) placed in `required` instead of `optional`. AMO reviewers flag this because selection text is user-controlled per-submission via the [Remove selection text] toggle — it is not always transmitted.

**Why it happens:** PITFALLS.md (written before CONTEXT.md finalized) places `websiteContent` in `required`. REQUIREMENTS.md PRIV-01 (the authority) places it in `optional`. Conflicting prior research.

**How to avoid:** REQUIREMENTS.md PRIV-01 is the authority. Use: `required: ["technicalAndInteraction", "websiteActivity"], optional: ["websiteContent"]`.

**Warning signs:** AMO submission rejected with "data collection declaration inconsistent with extension behavior."

### Pitfall 3: Dedup Window — Time-Based vs Prefix-Based

**What goes wrong:** Dedup is implemented by comparing the `timestamp` field in the KV value against `Date.now() - 15*60*1000`. But `list({ prefix })` returns ALL records with that fingerprint prefix, including records older than 15 minutes. If only the first record in the list is checked, a report from 3 months ago satisfies the prefix check but is outside the 15-minute dedup window.

**Why it happens:** The KV key includes the timestamp as a suffix, so the list naturally returns all matching records across their full 90-day TTL.

**How to avoid:** When processing `list({ prefix })` results, filter by the `metadata` timestamp or by parsing the timestamp from the key suffix. Only records within the 15-minute window count as dedup hits. A record from 16 minutes ago should create a NEW record, not be treated as a duplicate.

**Warning signs:** UAT-03 (Phase 5) shows that a 3rd submission 15+ minutes after the first creates a new record, but the dedup logic is incorrectly suppressing it.

### Pitfall 4: Body Size Check — Content-Length vs Actual Body

**What goes wrong:** Checking `request.headers.get('Content-Length')` for the 64KB cap (D-10) is unreliable — clients can omit the header or provide incorrect values. The actual body is not bounded by the header.

**Why it happens:** Content-Length is an advisory header, not enforced by the Workers runtime.

**How to avoid:** Read the body as `arrayBuffer()` and check `byteLength` before `JSON.parse`. Alternatively, use `text()` and check length. Reject if over 65536 bytes (64 KB). Example: `const raw = await request.text(); if (raw.length > 65536) return 413response;`

**Warning signs:** Worker correctly rejects large bodies when Content-Length is set, but accepts them when the header is absent.

### Pitfall 5: `vitest.config.js` Missing `BUG_REPORTS` Binding

**What goes wrong:** New tests for `POST /report` fail with `env.BUG_REPORTS is undefined` because Miniflare only provides KV bindings that are declared in the `miniflare.bindings` or automatically from `wrangler.toml` KV namespace definitions.

**Why it happens:** `wrangler.toml` now has two `[[kv_namespaces]]` blocks, but `vitest.config.js` uses `wrangler: { configPath: './wrangler.toml' }` which should pick up both namespaces automatically via Miniflare. However, the `BUG_REPORTS` namespace needs a real ID in `wrangler.toml` (not a placeholder) for Miniflare to create a virtual binding.

**How to avoid:** After running `wrangler kv namespace create "BUG_REPORTS"` and updating `wrangler.toml` with the real ID, Miniflare will create the in-memory KV namespace automatically. The `vitest.config.js` needs no changes — it already loads from `wrangler.toml`. Add `DISCORD_WEBHOOK_URL` to `miniflare.bindings` in `vitest.config.js` so tests can verify the Discord fetch path without hitting a real webhook.

**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'put')` in Worker tests.

### Pitfall 6: Privacy Policy "No Data Collected" Contradiction

**What goes wrong:** The privacy policy at `docs/privacy/index.html` currently contains the statement: "Patent Citation Tool does not collect, store, or transmit any personal data." Adding the bug-report feature without updating this text creates a legal contradiction — the feature DOES transmit user-selected text and browser information.

**Why it happens:** The privacy policy was written for the original citation-only feature; a new voluntary reporting capability is a new disclosure surface.

**How to avoid:** Update the "Information We Collect" section BEFORE or in the same commit as the Worker route ships. Add a "Bug Report Feature" subsection that explicitly describes: fields collected (per PAY-01 allowlist), 90-day retention, maintainer-only access, no IP storage, per-submission selection text opt-out, Discord and KV as the only downstream destinations.

**Warning signs:** AMO reviewer flags privacy policy as inconsistent with actual data transmission.

### Pitfall 7: `store-listing.md` Data Use Certification

**What goes wrong:** `store-assets/store-listing.md` Section 3, Subsection 4 currently states "Data types collected: Select none / leave all checkboxes unchecked" and "The extension does not collect...website content." After adding voluntary bug reporting, the CWS data-use declarations must be updated. Submitting with stale data-use checkboxes causes CWS review rejection.

**Why it happens:** The store listing is a static document that was accurate for the original feature set but is now stale.

**How to avoid:** Update `store-assets/store-listing.md` to add a note about the voluntary bug report capability and update the data-use declarations to acknowledge that website content (patent selection text) may be voluntarily submitted by users. Keep the "No personal information is collected" language for normal operation; add carve-out for voluntary bug reports.

---

## Code Examples

Verified patterns from direct source reads and prior research:

### KV Field Allowlist (PAY-01 Schema)

```javascript
// Source: REQUIREMENTS.md PAY-01, CONTEXT.md D-08

const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_citation',
  'no_match',
  'tool_not_working',
  'other',
]);

// Allowlisted fields only — unknown fields silently stripped (D-08)
function buildKvRecord(body, fingerprint, timestamp) {
  return {
    fingerprint,
    timestamp,
    category:          body.category,
    patentNumber:      body.patentNumber,
    patentUrl:         body.patentUrl || `https://patents.google.com/patent/US${body.patentNumber}`,
    selectionText:     body.selectionText || null,  // null when user toggled off
    returnedCitation:  body.returnedCitation || null,
    confidenceTier:    body.confidenceTier || null,
    extensionVersion:  body.extensionVersion,
    browser:           body.browser || null,
    os:                body.os || null,
    xpathNode:         body.xpathNode || null,
    scrollY:           body.scrollY || null,
    viewportWidth:     body.viewportWidth || null,
    viewportHeight:    body.viewportHeight || null,
    pdfParseStatus:    body.pdfParseStatus || null,
    triggerMode:       body.triggerMode || null,
    errorLog:          Array.isArray(body.errorLog) ? body.errorLog.slice(0, 20) : [],
    note:              body.note || null,
    duplicate_count:   0,
    // NO: ip, clientIp, userAgent (PAY-03 hard constraint)
  };
}
```

### Validation and 400 Response (D-09)

```javascript
// Source: REQUIREMENTS.md D-09; existing pattern from /cache route at worker/src/index.js:218

function validateReportBody(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (!body.patentNumber || typeof body.patentNumber !== 'string') {
    return 'Missing required field: patentNumber';
  }
  if (!REPORT_CATEGORIES.includes(body.category)) {
    return `Invalid category. Must be one of: ${REPORT_CATEGORIES.join(', ')}`;
  }
  if (!body.extensionVersion || typeof body.extensionVersion !== 'string') {
    return 'Missing required field: extensionVersion';
  }
  return null; // valid
}
```

### IP Rate Limit Check (LIMIT-02)

```javascript
// Source: REQUIREMENTS.md LIMIT-02; PITFALLS.md Pitfall 4

async function checkIpRateLimit(env, clientIp) {
  const key = `rl:${clientIp}`;
  const countStr = await env.BUG_REPORTS.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= 5) {
    return { allowed: false };
  }

  // Increment counter; reset TTL on each request
  await env.BUG_REPORTS.put(key, String(count + 1), { expirationTtl: 60 });
  return { allowed: true };
}
```

### Dedup Check with Time-Window Filter (LIMIT-01)

```javascript
// Source: REQUIREMENTS.md LIMIT-01, PAY-02; CONTEXT.md D-02

const DEDUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

async function checkAndHandleDuplication(env, fingerprint, now) {
  const { keys } = await env.BUG_REPORTS.list({ prefix: `report:${fingerprint}:` });

  // Filter to records within the 15-minute window
  // Key format: report:{fp}:{timestamp_ms}
  const recentKeys = keys.filter(k => {
    const parts = k.name.split(':');
    const ts = parseInt(parts[parts.length - 1], 10);
    return !isNaN(ts) && (now - ts) < DEDUP_WINDOW_MS;
  });

  if (recentKeys.length === 0) {
    return { isDuplicate: false };
  }

  // Increment duplicate_count on the most recent matching record
  const mostRecent = recentKeys[recentKeys.length - 1];
  const existing = await env.BUG_REPORTS.get(mostRecent.name, { type: 'json' });
  if (existing) {
    existing.duplicate_count = (existing.duplicate_count || 1) + 1;
    await env.BUG_REPORTS.put(mostRecent.name, JSON.stringify(existing), {
      expirationTtl: 7776000,
    });
  }

  return { isDuplicate: true, fingerprint };
}
```

### Firefox Manifest Update (PRIV-01)

```json
// Source: REQUIREMENTS.md PRIV-01 (authority); src/manifest.firefox.json:11-14 (current value)
// Before:
"data_collection_permissions": {
  "required": ["none"],
  "optional": []
}

// After (PRIV-01 specification):
"data_collection_permissions": {
  "required": ["technicalAndInteraction", "websiteActivity"],
  "optional": ["websiteContent"]
}
```

### Test Structure Extension

```javascript
// Source: worker/tests/test-mode.test.js pattern; worker/vitest.config.js

// worker/tests/report-route.test.js — new file
import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

const TEST_TOKEN = 'test-token';
const VALID_BODY = JSON.stringify({
  patentNumber: '12505414',
  category: 'no_match',
  extensionVersion: '5.0.0',
  selectionText: 'the device further comprises',
  browser: 'Chrome/125',
  os: 'Windows 10',
});

function makeReportRequest(body = VALID_BODY, overrides = {}) {
  return new Request('https://worker.example.com/report', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json',
      ...overrides.headers,
    },
    body: overrides.body !== undefined ? overrides.body : body,
  });
}

// Required test scenarios:
// - Valid body → 201 + KV write + fingerprint in response
// - Duplicate fingerprint within 15 min → 200 + deduped:true + duplicate_count incremented
// - Missing required field → 400 + reason string
// - Invalid category → 400
// - Body > 64KB → 413
// - 6th request from same IP within 60s → 429 + Retry-After header
// - Discord webhook misconfiguration → still 201 (KV write succeeded, Discord is best-effort)
// - X-PCT-Test-Mode: true → suppresses KV write (existing pattern, extend to /report)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Firefox `data_collection_permissions: ["none"]` | Must declare actual types collected | November 2025 AMO policy | All new Firefox extensions must declare; `["none"]` while transmitting data is a policy violation |
| Worker routes: /cache only | /cache + /report | Phase 1 | New route; existing auth gate inherited automatically |
| CWS store listing: "No data collected" | Must acknowledge voluntary bug reporting | Phase 1 | Data-use declarations in Developer Dashboard must match actual behavior |

**Deprecated/outdated:**
- PITFALLS.md §Pitfall 3 places `websiteContent` in `required`: this was superseded by REQUIREMENTS.md PRIV-01 which places it in `optional` because selection text is user-controlled per-submission. REQUIREMENTS.md is the authority.
- ARCHITECTURE.md uses `REPORT_STORE` as the binding name: CONTEXT.md and REQUIREMENTS.md use `BUG_REPORTS`. Use `BUG_REPORTS` — it is the locked name in all downstream references.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `wrangler kv namespace create "BUG_REPORTS"` must be run by the operator before `wrangler.toml` is edited; the namespace ID is not pre-known | Standard Stack / XPORT-02 | Low risk — planner must include this as a manual pre-step task; operator is aware per STATE.md Blockers |
| A2 | `web-ext` is available via `npx web-ext lint` even though it is not in current shell PATH | Environment Availability | Low risk — `npx` is available (confirmed); `web-ext` is a known dev dependency of the project |
| A3 | The Cloudflare Worker is currently deployed and reachable at `pct.tonyrowles.com` | Environment Availability | Low risk — existing /cache routes are in production use; operator would know if the deployment is down |
| A4 | `DISCORD_WEBHOOK_URL` secret does not yet exist in the Cloudflare Worker deployment (it is new for Phase 1) | XPORT-03 | Low risk — new secret; operator must `wrangler secret put DISCORD_WEBHOOK_URL`; if it already exists from a prior experiment, `wrangler secret put` will overwrite it |
| A5 | Dedup `list({ prefix })` response `keys` array includes key name as `keys[n].name` (not `keys[n].key`) | Code Examples (LIMIT-01) | Low risk — Cloudflare KV list API documented; existing test in test-mode.test.js uses `listed.keys[0].name` confirming the shape |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Five low-risk assumptions remain; all are confirmed by existing codebase patterns or official docs.)

---

## Open Questions

1. **`BUG_REPORTS` namespace ID for `wrangler.toml`**
   - What we know: the namespace must be created via `wrangler kv namespace create "BUG_REPORTS"` before the TOML can be edited with a real ID.
   - What's unclear: whether a preview/local namespace also needs to be created for `wrangler dev` local development (some configurations use `preview_id`).
   - Recommendation: create production namespace only for Phase 1 (UAT is against production per the success criteria); add `preview_id` later only if needed. Wrangler dev uses Miniflare in-memory KV by default.

2. **`X-PCT-Test-Mode` on `/report` route**
   - What we know: the existing `/cache` POST honours `X-PCT-Test-Mode: true` to suppress KV writes during CI. The CONTEXT.md §Reusable Assets suggests extending this pattern to `/report`.
   - What's unclear: whether Phase 1's Vitest tests need to suppress KV writes (Miniflare provides an in-memory KV; writes are isolated to the test process and don't reach production KV).
   - Recommendation: Honour `X-PCT-Test-Mode: true` on `/report` to suppress BOTH the KV write AND the Discord webhook POST (DISCORD_WEBHOOK_URL = test mock in Miniflare). Consistent with the existing pattern and mentioned in CONTEXT.md as a reusable asset to consider.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node` | Worker tests, wrangler CLI | Yes | v24.11.1 | — |
| `wrangler` CLI | XPORT-02 (namespace create), XPORT-03 (secret put), deploy | Yes | 4.54.0 | — |
| `npx wrangler` | Same as above (alias) | Yes | 4.54.0 | — |
| `web-ext` CLI | PRIV-05 (`web-ext lint`) | Not in PATH | — | `npx web-ext lint` — `npx` confirmed available |
| `vitest` (worker) | Worker test suite | Yes | 4.1.7 (via `npm test` in `worker/`) | — |
| `@cloudflare/vitest-pool-workers` | Miniflare KV in tests | Yes | ^0.16.6 installed | — |
| Cloudflare account auth (`CLOUDFLARE_API_TOKEN`) | `wrangler kv namespace create`, `wrangler secret put`, `wrangler deploy` | Not in current shell | — | Operator sets env var or uses `wrangler login` interactively |
| Discord webhook (production) | XPORT-03 (UAT verification) | Unknown — operator-controlled | — | Create via Discord channel settings; any test channel webhook works for Phase 1 validation |

**Missing dependencies with no fallback:**
- Cloudflare account auth — operator must authenticate before running `wrangler kv namespace create` or `wrangler secret put`. Not a blocker for code development; only needed at deploy/configure time.

**Missing dependencies with fallback:**
- `web-ext` — use `npx web-ext lint dist/firefox/` (npx downloads on demand; `web-ext` is a well-established Mozilla tool at npmjs.com/package/web-ext, version 8.x).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 via `@cloudflare/vitest-pool-workers` |
| Config file | `worker/vitest.config.js` (uses `cloudflareTest()` with Miniflare) |
| Quick run command | `cd worker && npm test` |
| Full suite command | `cd worker && npm test` (single test file currently; grows to 2 after Phase 1) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XPORT-01 | Valid POST /report → 201 + KV record + fingerprint | integration | `cd worker && npm test` | No — Wave 0 creates `worker/tests/report-route.test.js` |
| XPORT-01 | POST /report returns `{ok, fingerprint, deduped}` JSON body | integration | `cd worker && npm test` | No — Wave 0 |
| PAY-01 | KV record contains only allowlisted fields (no `ip`, no extra fields) | integration | `cd worker && npm test` | No — Wave 0 |
| PAY-02 | KV key format `report:{fp}:{ts}` with `expirationTtl: 7776000` | integration | `cd worker && npm test` | No — Wave 0 |
| PAY-03 | KV record value has zero `ip` or `clientIp` fields | integration | `cd worker && npm test` | No — Wave 0 |
| PAY-04 | Same inputs → identical fingerprint across two calls | integration | `cd worker && npm test` | No — Wave 0 |
| LIMIT-01 | Second identical submission within 15 min → 200 + deduped:true + duplicate_count:2, no new KV key | integration | `cd worker && npm test` | No — Wave 0 |
| LIMIT-02 | Sixth request from same IP within 60s → 429 + Retry-After header | integration | `cd worker && npm test` | No — Wave 0 |
| XPORT-03 | `grep -r 'discord.com/api/webhooks' .` (excluding .git, node_modules) → 0 results | static-grep | `grep -r 'discord.com/api/webhooks' . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=worker/node_modules` | Yes — passes now; guard this in test |
| XPORT-04 | `worker/.dev.vars` is gitignored | verify-only | `git check-ignore -v worker/.dev.vars` | Yes — already gitignored |
| PRIV-01 | `manifest.firefox.json` declares `required: ["technicalAndInteraction", "websiteActivity"], optional: ["websiteContent"]` | static-grep | `node -e "const m=JSON.parse(require('fs').readFileSync('src/manifest.firefox.json')); console.assert(m.browser_specific_settings.gecko.data_collection_permissions.required.includes('websiteActivity'))"` | No — Wave 0 (manifest updated) |
| PRIV-05 | `web-ext lint dist/firefox/` exits 0 | lint | `npx web-ext lint dist/firefox/` | No — requires Firefox build first |

### Sampling Rate

- **Per task commit:** `cd worker && npm test`
- **Per wave merge:** `cd worker && npm test`
- **Phase gate:** Full suite green + `grep -r 'discord.com/api/webhooks' .` returns 0 results + `git check-ignore -v worker/.dev.vars` confirms gitignored + `web-ext lint` passes (if Firefox build available) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `worker/tests/report-route.test.js` — covers XPORT-01, PAY-01, PAY-02, PAY-03, PAY-04, LIMIT-01, LIMIT-02
- [ ] `worker/vitest.config.js` update — add `DISCORD_WEBHOOK_URL: 'https://discord.example.com/test'` to `miniflare.bindings` so Discord fetch path is testable without real webhook

*(Existing `test-mode.test.js` covers INJ-01; no changes needed there. No framework install needed — vitest already installed.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Existing Bearer `PROXY_TOKEN` gate inherited by `/report`; no new auth code needed |
| V3 Session Management | No | Stateless Worker; no sessions |
| V4 Access Control | Yes | IP rate limit (`rl:{ip}` KV, 5/60s) + fingerprint dedup (15-min window) |
| V5 Input Validation | Yes | Required field validation; body size cap 64KB; category enum enforcement; silent strip of unknown fields |
| V6 Cryptography | Yes | `crypto.subtle.digest('SHA-256', ...)` — native Web Crypto; never hand-rolled |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook URL extraction from extension bundle | Information Disclosure | Worker secret via `wrangler secret put`; URL never in committed file |
| IP address stored in KV (GDPR violation) | Information Disclosure | `CF-Connecting-IP` → transient `rl:{ip}` key only (60s TTL); never in `report:{}` record |
| Report flood / KV write quota exhaustion | Denial of Service | IP rate limit (5/60s) + fingerprint dedup (15-min window) + 64KB body cap |
| Discord `@everyone` injection via selection text | Tampering | Truncation at 200 chars; consider `allowed_mentions: { parse: [] }` in Discord payload |
| Fabricated payload fields from abuse | Tampering | Bearer token gate (PROXY_TOKEN) provides friction; field allowlist prevents unexpected schema injection |
| Discord channel spam from leaked webhook | Denial of Service | Webhook URL stays server-side; grep guard in success criteria; if leaked: rotate webhook, update Worker secret, redeploy |

---

## Sources

### Primary (HIGH confidence)

- `worker/src/index.js` — direct source read; ES Modules syntax, route dispatch, auth gate at line 144, /cache block through line 252, USPTO fallthrough from line 254, insertion point for /report confirmed at line 253
- `worker/wrangler.toml` — direct source read; single `[[kv_namespaces]]` block confirmed; PATENT_CACHE id confirmed
- `worker/vitest.config.js` — direct source read; `cloudflareTest()` plugin, `miniflare.bindings` pattern confirmed
- `worker/tests/test-mode.test.js` — direct source read; test pattern confirmed: `env` from `cloudflare:workers`, `createExecutionContext`, `waitOnExecutionContext`
- `worker/package.json` — direct source read; `npm test` runs `vitest run`; `@cloudflare/vitest-pool-workers` installed
- `src/manifest.firefox.json` — direct source read; `data_collection_permissions: { required: ["none"] }` at lines 11-14 confirmed; `host_permissions` covers `pct.tonyrowles.com/*` confirmed
- `docs/privacy/index.html` — direct source read; current "Information We Collect" section asserts zero collection; "Contact" section ends at line 141; insertion point for Bug Report section confirmed
- `store-assets/store-listing.md` — direct source read; "Data collected: None" certification in Section 3.4 confirmed; bug-report capability not mentioned in description
- `.gitignore` and `worker/.gitignore` — direct source read; `worker/.dev.vars` confirmed gitignored in BOTH files (XPORT-04 verify-only)
- `worker/.dev.vars` — existence confirmed; contains PROXY_TOKEN and USPTO_API_KEY (not DISCORD_WEBHOOK_URL — new secret for Phase 1)
- `.planning/phases/01-worker-route-kv-schema-privacy-compliance-groundwork/01-CONTEXT.md` — locked decisions D-01 through D-10 and Claude's Discretion items
- `.planning/REQUIREMENTS.md` — authority on PRIV-01 taxonomy (takes precedence over PITFALLS.md divergence)

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — verified `[[kv_namespaces]]` TOML append syntax; fingerprint-first key rationale; Discord embed limits; rate limit figures; all backed by direct official source reads during prior research
- `.planning/research/PITFALLS.md` — GDPR hard constraint on IP storage; webhook URL hygiene; AMO manifest requirements; all backed by official source reads during prior research
- `.planning/research/ARCHITECTURE.md` — route insertion ordering rationale; `ctx.waitUntil()` fire-and-forget pattern; KV namespace separation rationale

### Tertiary (LOW confidence)

- Discord `allowed_mentions: { parse: [] }` as `@everyone` injection mitigation — mentioned in PITFALLS.md Pitfall 7; recommended as defense-in-depth in Discord payload construction

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Zero new packages; all runtime APIs verified in prior research against official Cloudflare docs |
| Architecture patterns | HIGH | Worker source read directly; insertion point, auth inheritance, KV key design all verified |
| Fingerprint algorithm | HIGH | `crypto.subtle.digest` confirmed native in Workers runtime; PAY-04 spec is exact |
| Discord embed design | HIGH | D-05/D-06/D-07 locked in CONTEXT.md; character limits from STACK.md research |
| Firefox manifest taxonomy | HIGH | REQUIREMENTS.md PRIV-01 is the authority; cross-referenced with AMO official docs in PITFALLS.md |
| Privacy policy update | HIGH | HTML file read directly; current content confirmed; field-by-field disclosure requirements from PRIV-03 |
| KV dedup time-window filter | MEDIUM | KV list key format (`keys[n].name`) confirmed from existing test; timestamp parsing from key suffix is a derived pattern |
| Discord rate limits | MEDIUM | 5/2s per webhook from secondary source (birdie0 guide); not a practical concern at v5.0 volume |

**Research date:** 2026-06-12
**Valid until:** 2026-07-12 (30 days; Cloudflare KV/Workers APIs are stable; Discord embed limits rarely change)

# Phase 6: Security Gate + Worker Auth Split - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Secure the Worker and extension build pipeline BEFORE any public webapp URL exists. This phase delivers: a rotated `PROXY_TOKEN` injected at build time (no literal in committed source), new public webapp-accessible Worker routes authenticated by an Origin-header check, per-IP rate limiting on every webapp-accessible route, a global daily KV-write guard, and published-application rejection at the Worker level. This is a BLOCKING GATE — no webapp code may reach production until it completes.

In scope: `worker/src/index.js` route/auth restructure, esbuild `define` injection wiring, removal of the token literal from all source files, rate-limit + write-guard helpers, published-application detection.

Out of scope: the webapp itself (Phase 8), shared-core extraction (Phase 7), live deploy/UAT (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Origin-Header Auth & CORS Policy
- Accepted origins for webapp routes: `https://cite.tonyrowles.com` AND `http://localhost:8788` (wrangler dev) — the localhost origin is required for Phase 8/9 local UAT.
- CORS `Access-Control-Allow-Origin` on webapp routes reflects the **specific matched origin** (not `*`). Origin-header auth implies a trusted, named origin; reflecting the exact origin is correct and tightens the policy.
- A missing or empty `Origin` header on a webapp route is **rejected with HTTP 403** — browsers always send `Origin` on cross-origin requests, so its absence signals a non-browser caller.
- Published-application rejection runs **first** (zero-I/O format/kind-code check) before the rate-limit read and before any USPTO fetch, on all patent-accepting routes → HTTP 400.

### Rate Limits & Daily KV-Write Guard
- Per-IP threshold for webapp GET routes (PDF proxy + cache read): **30 requests / 60s** per IP. The existing 5/60s report limit is too tight for batch mode; PDF lookups are legitimately heavier.
- Webapp rate-limit counters reuse the **BUG_REPORTS** KV namespace with a distinct `wrl:` key prefix (mirrors the existing `rl:` pattern — no new binding required).
- Global daily KV-write guard threshold: **900 writes/day** — a safe margin below the free-tier 1,000/day. When crossed, new cache POSTs are blocked with HTTP 503.
- Daily write count is tracked via a counter key `wq:YYYYMMDD` in PATENT_CACHE, incremented on each cache write, with a ~48h TTL.

### Token Rotation Scope & Build Injection
- The token literal is removed from **all three** files that currently contain it: `src/offscreen/offscreen.js`, `src/firefox/pdf-pipeline.js`, `src/shared/report-transport.js`. Leaving any literal would defeat the rotation. (NOTE: the original requirement text named only `offscreen.js` — discovered during scout that the literal is duplicated across all three.)
- Build-time injection uses esbuild `define` to replace a named global **`__PROXY_TOKEN__`**, sourced from `process.env.PROXY_TOKEN` (a CI/GitHub Actions secret).
- Local-dev fallback reads from a git-ignored `.dev.vars`/`.env`. The build **fails loudly** if neither the CI secret nor a local var is present — no silent empty-string token.
- This phase lands all the code. The **actual live `wrangler secret put PROXY_TOKEN` rotation + invalidation of the old token is a human-verification (UAT) item** — it requires the user's Cloudflare authentication and cannot be run autonomously.

### Claude's Discretion
- Exact helper function names, file organization within `worker/src/index.js`, and the route-matching/auth-dispatch refactor shape are at Claude's discretion, guided by the existing `checkIpRateLimit`/`handleReport` conventions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `worker/src/index.js:262 checkIpRateLimit(env, clientIp)` — existing IP rate-limit pattern (max 5/60s, `rl:{ip}` key in BUG_REPORTS, 60s TTL). New `wrl:` webapp limiter mirrors this.
- `worker/src/index.js:35 cleanPatentNumber()` — strips `US` prefix and kind-code suffix (`B1`, `B2`, `A1`, …). Published-app detection must inspect the RAW input BEFORE this strips the kind code.
- `worker/src/index.js:30 corsHeaders()` — currently returns `{ 'Access-Control-Allow-Origin': '*' }`. Webapp routes need an origin-reflecting variant.
- `worker/src/index.js:413` (handleReport) — cheapest-first ordering pattern (size check → rate limit → parse → validate). New routes follow the same ordering, with the zero-I/O published-app check first.

### Established Patterns
- Global Bearer auth at `worker/src/index.js:526` (`authHeader !== Bearer ${env.PROXY_TOKEN}` → 401) currently gates ALL routes. This must be restructured so webapp routes authenticate via Origin instead of Bearer, while `POST /cache`, `POST /report`, and the existing extension paths keep Bearer.
- `X-PCT-Test-Mode: true` header suppresses KV writes across routes (CI E2E hygiene) — new write paths must honor it.
- Route dispatch is a flat `if (path === '/cache')` / `if (path === '/report')` chain after a single `new URL(request.url)` parse.

### Integration Points
- New routes: `GET /webapp/pdf?patent=` (WRKR-01), `GET /cache?patent=` Origin path (WRKR-02), `POST /cache` webapp uploads with `source:"webapp"` (WRKR-03).
- Token literal consumers: `src/offscreen/offscreen.js` (lines 24, 247, 296, 423), `src/firefox/pdf-pipeline.js` (lines 23, 194, 323, 431), `src/shared/report-transport.js` (lines 27, 189). Build config (esbuild) needs a `define` for `__PROXY_TOKEN__`.
- `wrangler.toml` / `.dev.vars` already hold worker secrets; `PROXY_TOKEN` is a Worker secret binding (`env.PROXY_TOKEN`).

</code_context>

<specifics>
## Specific Ideas

- Success criterion is literal: `grep -r 'PROXY_TOKEN' src/` must return zero literal token strings (only the `define`/injection reference) after this phase.
- WRKR-02 dual-auth: `GET /cache` must accept EITHER a valid Origin header (webapp) OR a Bearer token (extension) and return the cached position-map JSON.
- `POST /cache` webapp uploads must be tagged with a `source: "webapp"` provenance field (WRKR-03) for cross-surface cache-poisoning debugging.

</specifics>

<deferred>
## Deferred Ideas

- Reflecting arbitrary subdomains / a configurable origin allowlist via env var — deferred; the fixed two-origin allowlist is sufficient for v6.0.
- Replacing KV-counter rate limiting with Cloudflare's native Rate Limiting rules — out of scope; reuse the existing KV pattern.

</deferred>

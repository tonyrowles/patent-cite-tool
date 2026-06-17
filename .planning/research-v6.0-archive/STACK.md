# Stack Research — v6.0 Standalone Citation Webapp

**Domain:** Client-side PDF.js webapp reusing the extension's deterministic matching core; hosted on Cloudflare; talking to the existing pct.tonyrowles.com Worker.
**Researched:** 2026-06-16
**Scope:** NEW work for v6.0 ONLY — five specific questions from milestone context.
**Overall confidence:** HIGH (all existing sources read directly; Cloudflare docs verified via Context7 + official pages; PDF.js verified via npm package inspection; CORS verified from Worker source; key constraint about Pages+Workers domain conflict confirmed from official Cloudflare known-issues doc).

---

## Pre-Research: Codebase Facts Confirmed by Direct Read

| Claim | Verified | Source |
|-------|---------|--------|
| `PROXY_TOKEN` is hardcoded string in extension source | YES | `src/offscreen/offscreen.js:24` |
| Worker already returns `Access-Control-Allow-Origin: *` | YES | `worker/src/index.js:30` |
| Worker validates `Authorization: Bearer ${env.PROXY_TOKEN}` | YES | `worker/src/index.js:525-526` |
| CORS preflight allows `GET, POST, OPTIONS` + `Authorization, Content-Type` | YES | `worker/src/index.js:517-518` |
| pdf-parser.js sets `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` | YES | `src/offscreen/pdf-parser.js:14` |
| pdf-parser.js imports from `'../lib/pdf.mjs'` (local copy, not npm import) | YES | `src/offscreen/pdf-parser.js:9` |
| `src/lib/` contains `pdf.mjs` (424 KB) and `pdf.worker.mjs` (1.05 MB) | YES | `ls src/lib/` |
| pdfjs-dist version: `5.5.207` | YES | `node_modules/pdfjs-dist/package.json` |
| pdfjs-dist build files available: `pdf.mjs`, `pdf.min.mjs`, `pdf.worker.mjs`, `pdf.worker.min.mjs` | YES | `ls node_modules/pdfjs-dist/build/` |
| `matching.js`, `position-map-builder.js`, `pdf-parser.js` have zero `chrome.*` or DOM dependencies | YES | Direct source reads — pure arithmetic/text processing |
| Worker sits at `pct.tonyrowles.com` (custom domain) | YES | `src/offscreen/offscreen.js:23` |
| Repo has no npm workspaces configured | YES | root `package.json` — no `workspaces` field |
| `worker/` is a separate npm package with its own `package.json` | YES | `worker/package.json` |
| esbuild pipeline bundles `src/` → `dist/chrome/` + `dist/firefox/`; PDF.js is `external` | YES | `scripts/build.js:57,145` — `external: ['../lib/pdf.mjs']` |
| Existing esbuild version: `^0.27.3` | YES | root `package.json` |

---

## Q1: Static Hosting on Cloudflare — Pages vs. Workers Assets vs. Existing Worker

### Critical Constraint: Pages Cannot Share a Custom Domain With a Routed Worker

Cloudflare's own known-issues doc states: **"Custom domains cannot be added if a Worker is already routed on that domain."**

The existing `pct.tonyrowles.com` has a Worker routed on it. Cloudflare Pages cannot be given `pct.tonyrowles.com` as a custom domain while that Worker exists. You also cannot put the webapp at `tonyrowles.com` if it needs to share a subdomain with the Worker.

This eliminates Cloudflare Pages on `pct.tonyrowles.com` entirely.

**Confidence: HIGH** — [Cloudflare Pages known issues](https://developers.cloudflare.com/pages/platform/known-issues/) confirmed.

### Option A: Workers Assets on a New Subdomain (RECOMMENDED)

Deploy a second Cloudflare Worker (asset-only, no JS script) at a new subdomain — e.g., `cite.tonyrowles.com`. Workers Assets is the current Cloudflare offering for serving static files from a Worker.

**How it works:** During `wrangler deploy`, Wrangler uploads the files from your `[assets] directory` to Cloudflare's infrastructure. On request, Cloudflare serves them directly from the edge with full caching. No Worker script is needed for static-only content.

**wrangler.toml for the webapp Worker:**
```toml
name = "patent-cite-webapp"
compatibility_date = "2025-01-01"

[[routes]]
pattern = "cite.tonyrowles.com"
custom_domain = true

[assets]
directory = "./dist/webapp"
not_found_handling = "404-page"
```

**Coexistence with pct.tonyrowles.com:** Confirmed compatible. Cloudflare docs explicitly state: "Custom Domains can stack on top of each other. For example, if you have Worker A attached to `app.example.com` and Worker B attached to `api.example.com`, Worker A can call `fetch()` on `api.example.com` and invoke Worker B." Two Workers on different subdomains of `tonyrowles.com` is the standard pattern.

**Deploy command:** `cd worker-webapp && npx wrangler deploy`

**Confidence: HIGH** — [Cloudflare Workers Static Assets docs](https://developers.cloudflare.com/workers/static-assets/), [Custom Domains docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Option B: Cloudflare Pages (NEW *.pages.dev or different domain)

Pages would work IF hosted on a `*.pages.dev` subdomain or a completely separate domain that has no existing Worker routes. However:
- There's no clean existing separate domain to use for this.
- Pages has its own deployment CLI (`wrangler pages deploy`) and separate project config vs. Workers.
- Pages Functions (equivalent to Workers) would be needed anyway if dynamic routes are added.
- Migrating later from Pages to Workers Assets is a known-supported path.

**Verdict:** Skip Pages. Workers Assets is the current Cloudflare recommendation for full-stack apps and is simpler to configure given the existing Worker infrastructure.

### Option C: Serve Static Assets From The Existing pct.tonyrowles.com Worker

You could add `[assets]` to the existing `worker/wrangler.toml` and add `binding = "ASSETS"` to serve the webapp at `pct.tonyrowles.com/cite/...`. This avoids a new subdomain but:
- Conflates the API proxy (which should be thin and high-availability) with webapp static assets.
- Makes the existing Worker's wrangler.toml significantly more complex.
- The webapp at `pct.tonyrowles.com/cite/` shares the same origin as the API, complicating future security changes (e.g., adding CORS origin restrictions).
- Harder to deploy independently.

**Verdict:** Do not use this option. Keep concerns separate.

### Recommended Approach: Workers Assets at cite.tonyrowles.com

| Criterion | Workers Assets (new subdomain) | Pages | Same Worker |
|-----------|-------------------------------|-------|-------------|
| Coexists with pct.tonyrowles.com | YES (different subdomain) | BLOCKED (domain conflict) | YES |
| Deployment complexity | Low (one `wrangler.toml`) | Medium (separate Pages project) | Low but messy |
| Future dynamic routes | Easy (add `main =`) | Easy (Pages Functions) | Mixed into API Worker |
| Zero new npm deps | YES | YES | YES |
| CDN edge caching | YES | YES | YES |

---

## Q2: Loading PDF.js v5 in a Browser Web Page

### What Changes From the Extension

The extension sets:
```javascript
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```

In a plain web page, `chrome.runtime.getURL` does not exist. The workerSrc must be a plain URL string pointing to `pdf.worker.mjs` served by the webapp.

### Recommended Approach: Copy PDF.js Files to dist/webapp/lib/, Set workerSrc to Absolute URL

The extension already vendors `src/lib/pdf.mjs` and `src/lib/pdf.worker.mjs` (local copies from pdfjs-dist 5.5.207). The webapp build should copy the same files to `dist/webapp/lib/` and set workerSrc to the served path.

**In the webapp's pdf-parser adaptation:**
```javascript
import { getDocument, GlobalWorkerOptions } from './lib/pdf.mjs';
// No chrome.runtime.getURL — set a static path relative to the served origin
GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.mjs';
```

This approach:
- Reuses the already-vendored `src/lib/pdf.mjs` and `src/lib/pdf.worker.mjs` (no new download).
- Consistent with how the extension handles it — same files, different path resolution.
- Works for both local dev (wrangler dev serves `/lib/pdf.worker.mjs`) and production (Workers Assets serves it).
- Version is pinned (5.5.207) — no CDN version drift.

**Alternative (CDN URL):** `GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs'` — works but adds CDN dependency and external network call on every page load. Avoid given the zero-dependency culture.

**Confidence: HIGH** — verified by reading `src/offscreen/pdf-parser.js:14`, inspecting `src/lib/` file listing, and pdfjs-dist npm package structure. CDN pattern from web search (MEDIUM confidence, not used).

### Module Import Pattern

`pdf-parser.js` currently imports from `'../lib/pdf.mjs'` (a relative path to the local vendored copy). A webapp-specific `webapp-pdf-parser.js` will:
1. Import from the webapp's local lib path (e.g., `'./lib/pdf.mjs'` or via the shared package).
2. Set `GlobalWorkerOptions.workerSrc` to the static path (not `chrome.runtime.getURL`).
3. Everything else in `extractTextFromPdf` is pure — no changes needed.

This is the only browser-vs-extension difference in the PDF parsing layer.

### Cross-Origin PDF Fetch: CORS Implications

The webapp fetches PDFs in two ways:

**Path 1: Google Patents PDF URL (patentimages.storage.googleapis.com)**
The extension currently fetches these directly in the offscreen document. In the webapp, a browser `fetch()` to `patentimages.storage.googleapis.com` requires CORS headers from Google's servers. Google Cloud Storage does not enable CORS by default, and `patentimages.storage.googleapis.com` is a public bucket that does appear to allow broad public access (it's publicly readable), but CORS headers for arbitrary origins are not guaranteed.

**Resolution:** Route all PDF fetches through the existing pct.tonyrowles.com Worker, which already acts as a proxy and streams PDFs back with `Access-Control-Allow-Origin: *`. The webapp never fetches from Google's storage directly — it always goes through the Worker.

The existing Worker proxy flow (`GET /?patent={number}`) already handles the 3-step ODP lookup and returns the PDF binary. The webapp uses the same `?patent=` query parameter.

**Path 2: USPTO eGrant API (via Worker) — same flow as extension.**

**CORS from cite.tonyrowles.com to pct.tonyrowles.com:** The Worker already returns `Access-Control-Allow-Origin: *` on all responses (including CORS preflight). The webapp at `cite.tonyrowles.com` is a different origin, so CORS applies — but `*` covers it. No Worker changes needed for CORS.

**Security note:** The `Authorization: Bearer PROXY_TOKEN` header is a CORS "non-simple" header, which triggers a preflight. The Worker's preflight handler already includes `Authorization` in `Access-Control-Allow-Headers`. No change needed.

**Confidence: HIGH** — all verified from Worker source directly.

---

## Q3: Monorepo/Workspace Mechanics for Shared Core Extraction

### What Needs Extracting

Three files in `src/offscreen/` are pure JS with zero `chrome.*`/DOM dependencies and are candidates for extraction into a shared package:
- `src/offscreen/pdf-parser.js` — one `chrome.*` line (`GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)`) that MUST be extracted/abstracted
- `src/offscreen/position-map-builder.js` — 100% pure, no browser APIs
- `src/shared/matching.js` — already in `src/shared/`, 100% pure

### Recommended Approach: Plain `src/shared/` Extension + esbuild `alias` (No npm Workspaces)

**Do not introduce npm workspaces.** Workspaces add complexity (workspace hoisting, symlinks, altered `node_modules` resolution) that interacts poorly with esbuild's external handling and would require changes to how Vitest aliases are configured. The project has six consecutive milestones with zero new npm dependencies; this is not the place to introduce monorepo tooling.

**Instead: move the three files into `src/shared/`, abstract the chrome-specific line.**

1. Move `src/offscreen/position-map-builder.js` → `src/shared/position-map-builder.js` (no changes needed, it's pure).
2. Move `pdf-parser.js` to `src/shared/pdf-parser.js` with the `chrome.runtime.getURL` line removed — instead, accept `workerSrc` as a parameter or via `GlobalWorkerOptions` set externally by the caller.
3. `src/shared/matching.js` is already shared — no move needed.

**Caller pattern for webapp:**
```javascript
// webapp/src/webapp-core.js
import { GlobalWorkerOptions } from './lib/pdf.mjs';
import { extractTextFromPdf } from '../../src/shared/pdf-parser.js';

GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.mjs';  // webapp sets this
```

**Caller pattern for extension (no behavior change):**
```javascript
// src/offscreen/offscreen.js (or new per-target init file)
import { GlobalWorkerOptions } from '../lib/pdf.mjs';
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');  // extension sets this
import { extractTextFromPdf } from '../shared/pdf-parser.js';
```

**esbuild alias for webapp bundle:**
```javascript
// scripts/build-webapp.js
esbuild.build({
  entryPoints: ['webapp/src/main.js'],
  bundle: true,
  format: 'esm',
  outdir: 'dist/webapp',
  external: ['./lib/pdf.mjs'],  // serve as static asset, not bundled
  alias: {
    // If the shared modules need remapping, add here
  }
})
```

**Why not npm workspaces:** The existing build already handles `src/shared/` perfectly. The extension bundles treat `src/shared/` modules via normal esbuild import resolution. The webapp build would do the same. No symlinks, no workspace hoisting complexity, no `package.json` in every package. The zero-dependency culture is preserved.

**Confidence: HIGH** — confirmed by reading `scripts/build.js` (no workspace setup, direct `src/` import resolution), `package.json` (no `workspaces` field), and esbuild documentation on `alias` and `external`.

---

## Q4: Build Pipeline for the Webapp

### Recommended Approach: Add a New esbuild Config in `scripts/build.js`

The existing `scripts/build.js` already has `buildChrome()` and `buildFirefox()` functions. Add `buildWebapp()` as a third target, following the same pattern.

**Key differences from extension build:**

| Aspect | Extension | Webapp |
|--------|-----------|--------|
| Format | IIFE (content scripts) + ESM (background) | ESM (single bundle, no extension APIs) |
| Output | `dist/chrome/` and `dist/firefox/` | `dist/webapp/` |
| External | `'../lib/pdf.mjs'` (served from `dist/*/lib/`) | `'./lib/pdf.mjs'` (served from `dist/webapp/lib/`) |
| HTML | Extension popup/options HTML | Plain `index.html` (static asset, not bundled by esbuild) |
| chrome.* APIs | Used throughout | NOT present — pure web APIs only |
| Entry point | Multiple (content, background, offscreen, popup, options) | Single entry: `webapp/src/main.js` |

**What the webapp esbuild config looks like:**
```javascript
function buildWebapp() {
  return esbuild.build({
    entryPoints: ['webapp/src/main.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/webapp/js',
    external: ['../lib/pdf.mjs'],  // served separately from dist/webapp/lib/
    // No minification — consistent with extension build (store review legibility)
  });
}
```

**Static assets copy for webapp:**
```javascript
function copyWebappStaticAssets() {
  fs.mkdirSync('dist/webapp', { recursive: true });
  fs.cpSync('src/lib', 'dist/webapp/lib', { recursive: true });  // pdf.mjs + pdf.worker.mjs
  fs.copyFileSync('webapp/src/index.html', 'dist/webapp/index.html');
}
```

**npm script:**
```json
"build:webapp": "node scripts/build.js --webapp-only",
"build": "node scripts/build.js"  // extend to also build webapp
```

**CLI arg pattern:** Add `--webapp-only` arg alongside existing `--chrome-only` / `--firefox-only`.

**Workers Assets wrangler.toml** (separate from `worker/wrangler.toml`):
```toml
# webapp/wrangler.toml
name = "patent-cite-webapp"
compatibility_date = "2025-01-01"

[[routes]]
pattern = "cite.tonyrowles.com"
custom_domain = true

[assets]
directory = "../dist/webapp"
not_found_handling = "404-page"
```

**Vitest:** The shared core is already unit-tested via Vitest. No new test infrastructure needed — `position-map-builder.js` and `matching.js` tests continue to work after moving files; only `vitest.config.chrome.js` / `vitest.config.firefox.js` alias paths need to point to the new shared locations.

**Confidence: HIGH** — derived directly from reading `scripts/build.js` structure and confirmed esbuild supports this pattern.

---

## Q5: PROXY_TOKEN — Server-Side Migration (Blocking Security Gate)

### Current State (Critical Vulnerability)

`src/offscreen/offscreen.js:24`:
```javascript
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

This 64-hex-char string is committed in plaintext to the git repo and bundled into the distributed extension package. Anyone who downloads the Chrome or Firefox extension can extract it in under 30 seconds with a text editor. The token is already compromised — it must be rotated before any public webapp exposure.

### The Core Problem: The Webapp Cannot Carry Any Token

The extension is a trusted installed application — even if the token is extractable, it requires deliberate effort and affects a download that users choose to install. A public webpage is a different threat model: the JavaScript source is trivially visible to anyone via browser DevTools. Any token embedded in the webapp JS will be scraped.

Therefore the webapp must access the Worker API endpoints WITHOUT a bearer token, OR with a different authentication mechanism that is safe to embed in public JS.

### Recommended Architecture: Two-Tier Authentication After Token Rotation

**Step 1 (Blocking): Rotate the PROXY_TOKEN.**
```bash
cd worker && npx wrangler secret put PROXY_TOKEN
# Enter a new random 64-hex token at the prompt
# (openssl rand -hex 32 to generate)
```

Remove the hardcoded constant from `src/offscreen/offscreen.js` and replace with a build-time environment variable injected by esbuild's `--define` flag, OR use a different token for the extension vs. webapp.

**Step 2: Add a separate token for the webapp-vs-Worker channel.**

The cleanest approach that preserves the zero-dependency culture and requires no new infrastructure:

**Option A — IP-rate-limited public endpoints (no token for webapp):**
Add new Worker routes for the webapp (`GET /api/patent?id=...` for PDF proxy, `GET /api/cache?patent=...`) that do NOT require a bearer token but are protected by Cloudflare's built-in IP rate limiting. The Worker applies its own rate limit (e.g., 10 requests/minute/IP via KV counter, same pattern as the `/report` IP rate limit already implemented). This is the simplest path with zero new npm deps.

The existing `PROXY_TOKEN`-gated endpoints remain for the extension. The new public endpoints are rate-limited at the Worker level. The USPTO API key stays server-side (never exposed). The KV cache hit path is the common case for popular patents — actual USPTO API calls are rare.

```javascript
// New Worker route: GET /api/patent?id=US12505414B2
// No bearer token required; IP rate limited; proxies to USPTO or returns KV cache
if (path === '/api/patent') {
  return handlePublicPatentFetch(request, env, ctx);
}
```

**Option B — HMAC-signed tokens with short TTL (webapp gets a session token):**
The webapp page fetches a short-lived HMAC token from a `/token` endpoint (public, rate-limited), then uses that token for subsequent API calls within a TTL window (e.g., 5 minutes). This is more complex and requires state management in the webapp.

**Verdict: Use Option A** (public rate-limited endpoints for webapp). Rationale:
- The Worker's KV-backed IP rate limiter is already built and tested for `/report`.
- The webapp's use case is inherently rate-limited by user behavior (one patent per flow).
- No new token management complexity in the webapp JS.
- The PROXY_TOKEN continues protecting the extension endpoints unchanged.
- Zero new npm deps.

**What NOT to do:**
- Do NOT embed the new PROXY_TOKEN in the webapp JS. This defeats the rotation.
- Do NOT use client-side session tokens or JWTs stored in localStorage. Adds complexity for no benefit vs. IP rate limiting.
- Do NOT add Cloudflare Turnstile. Adds a UI widget, a `<script>` tag from Cloudflare's CDN, and a new external dependency for a use case (patent citation) that is not a bot-abuse target.

**Confidence: HIGH** — Worker source read directly; rate-limiting pattern already exists in `/report` handler; Cloudflare secret rotation via `wrangler secret put` verified from official docs.

---

## Recommended Stack Summary

### Core Technologies (Zero New npm Dependencies)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| pdfjs-dist (vendored, not new) | 5.5.207 | Client-side PDF parsing in browser | Already vendored in `src/lib/`; same files copied to `dist/webapp/lib/` |
| esbuild (existing) | ^0.27.3 | Build webapp JS bundle | Already in pipeline; add `buildWebapp()` function to `scripts/build.js` |
| Cloudflare Workers Assets | N/A (Cloudflare infra) | Static hosting at cite.tonyrowles.com | Current Cloudflare static hosting model; coexists with pct.tonyrowles.com |
| Wrangler (existing) | ^4.69.0 (worker/) | Deploy webapp Worker | Already used for the API Worker; add webapp wrangler.toml |
| Cloudflare KV PATENT_CACHE (existing) | N/A | Shared position map cache | Already deployed; webapp uses same cache via Worker API |

### What Does NOT Change

| Item | Reason |
|------|--------|
| pct.tonyrowles.com Worker | Stays as-is; webapp calls it via new public rate-limited endpoints |
| `src/shared/matching.js` | Already shared; no move needed |
| pdfjs-dist version | 5.5.207 stays pinned; no upgrade |
| esbuild pipeline structure | Extend `scripts/build.js`; no new build tool |
| Vitest harness | Shared core tests continue to pass after file moves |
| wrangler.toml (worker/) | Unchanged; webapp gets its own wrangler.toml |

### What Changes

| Item | Change |
|------|--------|
| `src/offscreen/pdf-parser.js` | Move to `src/shared/pdf-parser.js`; remove `chrome.runtime.getURL` line; caller sets `GlobalWorkerOptions.workerSrc` |
| `src/offscreen/position-map-builder.js` | Move to `src/shared/position-map-builder.js`; no code changes |
| `src/offscreen/offscreen.js` | Update imports to `../shared/pdf-parser.js`, `../shared/position-map-builder.js`; keep `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` in offscreen |
| `src/firefox/background.js` | Update imports similarly |
| `PROXY_TOKEN` in offscreen.js | REMOVE hardcoded value; rotate via `wrangler secret put` |
| `worker/src/index.js` | Add public rate-limited endpoints (`/api/patent`, `/api/cache`) for webapp |
| `webapp/wrangler.toml` (new) | Workers Assets config for cite.tonyrowles.com |
| `webapp/src/main.js` (new) | Webapp entry point; sets `GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.mjs'` |
| `scripts/build.js` | Add `buildWebapp()` function + `--webapp-only` CLI arg |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Workers Assets at cite.tonyrowles.com | Cloudflare Pages | Pages cannot share domain with existing Worker at pct.tonyrowles.com (Cloudflare known limitation); separate subdomain required anyway |
| Workers Assets at cite.tonyrowles.com | Static assets on existing Worker | Conflates thin API proxy with webapp delivery; harder to deploy independently; same-origin issues for future security tightening |
| Plain `src/shared/` extension + esbuild alias | npm workspaces | Workspaces add symlink complexity and alter esbuild module resolution; six consecutive milestones zero new deps — not the place to introduce monorepo tooling |
| `buildWebapp()` in existing `scripts/build.js` | Separate build script | Existing script already handles multi-target (chrome, firefox); webapp is a third target; consistent pattern |
| Vendored `pdf.worker.mjs` static asset (served from dist/webapp/lib/) | CDN URL for workerSrc | CDN adds external dependency + version drift risk; vendored copy already exists in `src/lib/` |
| Public rate-limited Worker endpoints (no token in webapp) | Embed new token in webapp JS | Any token in public JS is immediately extractable; IP rate limiting sufficient for low-volume citation use case |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React / Vue / any UI framework | No interactive state machine needed; static HTML + vanilla JS for patent number input + result display; adding a framework = adding build complexity + runtime deps | Vanilla HTML/CSS/JS |
| Vite | Replaces esbuild — adds config files, different plugin ecosystem, alters external/alias handling; breaks consistency with existing pipeline | Extend existing `scripts/build.js` |
| npm workspaces | Symlinks + hoisting complexity interact badly with esbuild's external handling; disrupts per-target Vitest alias configs | Plain `src/shared/` directory, relative imports |
| Cloudflare Turnstile | Adds `<script>` CDN dependency, widget UI, backend verify call; citation webapp is not a bot-abuse target | IP rate limiting at Worker |
| Any new runtime npm dep | Six consecutive milestones zero new deps; all required functionality (PDF parsing, matching, HTTP fetch, DOM manipulation) is already available or native | Existing tools |
| `node-fetch` / `cross-fetch` | Shims not needed; `fetch` is native in all modern browsers and Cloudflare Workers runtime | Native `fetch` |
| Durable Objects / D1 | Heavier Cloudflare primitives; KV already deployed and sufficient for this use case | Existing PATENT_CACHE KV |

---

## Version Compatibility

| Package | Version | Compatibility Note |
|---------|---------|-------------------|
| pdfjs-dist | 5.5.207 | Already in devDependencies; `pdf.mjs` + `pdf.worker.mjs` in `src/lib/` (same files reused for webapp) |
| esbuild | ^0.27.3 | Supports `external`, `alias`, `define` — all needed for webapp build |
| wrangler | ^4.69.0 (worker/) | `[assets]` section + `[[routes]]` + `custom_domain = true` all supported in Wrangler v4 |

---

## Integration Points: Exact Files and New Artifacts

| Component | File | Nature of Change |
|-----------|------|-----------------|
| Shared PDF parser | `src/shared/pdf-parser.js` (new location) | Move from `src/offscreen/`; remove chrome.runtime.getURL line |
| Shared position map builder | `src/shared/position-map-builder.js` (new location) | Move from `src/offscreen/`; no code changes |
| Extension offscreen | `src/offscreen/offscreen.js` | Update import paths; keep `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` locally |
| Firefox background | `src/firefox/background.js` | Update import paths for moved shared modules |
| Token rotation | `worker/src/index.js` + `wrangler secret put` | Remove env.PROXY_TOKEN from extension source; rotate via CLI |
| Public Worker endpoints | `worker/src/index.js` | Add `/api/patent` + `/api/cache` routes (public, IP rate-limited) |
| Build script | `scripts/build.js` | Add `buildWebapp()` function + `--webapp-only` CLI arg |
| Webapp entry | `webapp/src/main.js` (new file) | Sets workerSrc, wires UI → shared matching pipeline |
| Webapp HTML | `webapp/src/index.html` (new file) | Patent number + passage form, result display |
| Webapp Workers config | `webapp/wrangler.toml` (new file) | Workers Assets config, cite.tonyrowles.com custom domain |
| Deploy npm script | root `package.json` | Add `"deploy:webapp": "cd webapp && npx wrangler deploy"` |

---

## Sources

- `src/offscreen/offscreen.js` — direct read; PROXY_TOKEN location, WORKER_URL, fetch call patterns, PROXY_TOKEN compromised status
- `src/offscreen/pdf-parser.js` — direct read; GlobalWorkerOptions.workerSrc pattern, chrome.runtime.getURL dependency
- `src/offscreen/position-map-builder.js` — direct read; 100% pure, zero browser API dependencies
- `src/shared/matching.js` — direct read; 100% pure, zero browser API dependencies
- `worker/src/index.js` — direct read; corsHeaders() = `Access-Control-Allow-Origin: *`, auth header validation, IP rate limit pattern for /report, preflight handling
- `worker/wrangler.toml` — direct read; compatibility_date, KV bindings
- `scripts/build.js` — direct read; esbuild config patterns, `external: ['../lib/pdf.mjs']`, multi-target pattern
- `package.json` — direct read; no workspaces, esbuild ^0.27.3, pdfjs-dist ^5.5.207
- `worker/package.json` — direct read; wrangler ^4.69.0
- `src/lib/` listing — direct check; pdf.mjs (424 KB), pdf.worker.mjs (1.05 MB) at pdfjs-dist 5.5.207
- `node_modules/pdfjs-dist/build/` listing — direct check; pdf.mjs, pdf.min.mjs, pdf.worker.mjs, pdf.worker.min.mjs available
- [Cloudflare Pages Known Issues](https://developers.cloudflare.com/pages/platform/known-issues/) — "Custom domains cannot be added if a Worker is already routed on that domain" — HIGH confidence
- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) — multiple Workers on different subdomains confirmed compatible — HIGH confidence
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — ASSETS binding, `[assets]` TOML config, `not_found_handling` options — HIGH confidence (Context7 + official docs)
- [Cloudflare Workers Static Assets Binding](https://developers.cloudflare.com/workers/static-assets/binding/) — `run_worker_first`, ASSETS.fetch() pattern — HIGH confidence
- [Cloudflare Workers Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — `[[routes]]` + `custom_domain = true` TOML syntax — HIGH confidence (Context7)
- [PDF.js GitHub wiki: Setup in website](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website) — workerSrc must point to pdf.worker.mjs — MEDIUM confidence (content partial)
- [PDF.js Discussion #19520](https://github.com/mozilla/pdf.js/discussions/19520) — esbuild/Vite workerSrc pattern using import.meta.url or absolute path — MEDIUM confidence
- [PDF.js Discussion #17622](https://github.com/mozilla/pdf.js/discussions/17622) — ES module import patterns for pdfjs-dist v4+ — MEDIUM confidence
- [Cloudflare Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — `wrangler secret put` rotation pattern — HIGH confidence

---

*Stack research for: v6.0 Standalone Citation Webapp — client-side PDF.js, Workers Assets hosting, shared core extraction, PROXY_TOKEN rotation*
*Researched: 2026-06-16*
*Confidence: HIGH overall (all critical facts from direct source reads + official Cloudflare docs; PDF.js workerSrc verified from package inspection + wiki + discussion; CORS verified from Worker source)*

# Phase 8: Webapp Core Build - Research

**Researched:** 2026-06-16
**Domain:** Vanilla HTML/JS webapp, esbuild pipeline extension, Workers Static Assets
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**UX Model:**
- Single-first UI: page opens with one patent field + one passage textarea. "Add another passage" affordance (always visible below last row) reveals additional rows. Batch is progressive, not a separate tab.
- Single and batch share ONE code path: one fetch + one parse + N `matchAndCite` calls (BATCH-01).
- Visual style: reuse extension aesthetic (popup.html / options.html fonts, colors, spacing) on a centered single-column card. Inline `<style>`. No new design system.
- Default citation format: shorthand `4:15-22`; FMT-01 long-form toggle and FMT-02 prefix toggle persist via localStorage.

**Confidence and Results:**
- Confidence chip: green ≥0.95, yellow ≥0.80, red <0.80. Same thresholds as extension. Reuse shared logic.
- Each batch result row shows its own confidence chip (BATCH-02). "Copy all" (BATCH-03); single has per-citation copy (APP-09).

**Loading / Errors / Trust:**
- Named-stage loading line: "Fetching patent PDF…" → "Parsing PDF…" → "Matching passage…"
- No-match: helpful message. Network/parse failure: error state with retry.
- Published-application numbers (A1/A2/A9 kind code OR `20XXXXXXXX` format) rejected at input BEFORE any network call (APP-02).
- Trust signals ("deterministic, no AI inference" and "no data stored") in compact footer/options strip.

**Networking (locked):**
- All PDF fetches via Worker `GET /webapp/pdf?patent=` (Origin auth). NEVER direct patentimages/USPTO.
- NO `Authorization: Bearer` header in any webapp request. Origin-header auth only.
- Cache-first: `GET /cache?patent=` before fetch+parse. Cache hit skips client-side parsing.
- Webapp cache uploads tagged `source:"webapp"` by the Worker (Phase 6 WRKR-03).

### Claude's Discretion
- Exact DOM structure, component breakdown, CSS specifics, file layout under `webapp/`.
- The `configurePdfWorker` injection value for the webapp (bundled lib/pdf.worker.mjs asset path).

### Deferred Ideas (OUT OF SCOPE)
- Production deployment to `cite.tonyrowles.com`, live UAT against production, privacy-policy update (Phase 9).
- Any AI/LLM assistance.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APP-01 | Patent number normalization (strip commas/spaces/hyphens, uppercase, add US prefix, with/without kind code) | `cleanPatentNumber` in worker/src/index.js is the reference; no shared normalization exists — new `normalizePatentInput` function needed in webapp/js |
| APP-02 | Published-application rejection at input before any network call | `isPublishedApplication` in worker/src/index.js is the canonical reference; must be replicated client-side |
| APP-03 | PDF fetch exclusively via Worker proxy | Worker route `GET /webapp/pdf?patent=` exists. Origin auth — browser sends automatically from `cite.tonyrowles.com` or `localhost:8788` |
| APP-04 | Cache-first: Worker `/cache` before fetch+parse; hit skips parsing | Worker route `GET /cache?patent=&v=v5`. Response shape: `{ entries: [...], meta: { totalLines, totalColumns, hasClaimsSection } }` |
| APP-05 | Cache-miss: client-side PDF.js parse + matchAndCite via shared core | `extractTextFromPdf` + `buildPositionMap` + `matchAndCite` — Phase 7 verified the full pipeline works in plain web context |
| APP-06 | Citation display with confidence chip (same thresholds as extension) | `matchAndCite` returns `{ citation, confidence, startEntry, endEntry }`. `formatCitation` produces shorthand. Long-form is a NEW pure transform of column/line ints |
| APP-07 | No-match + error states with retry | UI-SPEC components 8 + 9 fully specified; retry re-runs same inputs |
| APP-08 | Named-stage loading UI | UI-SPEC component 5; 4 stage strings locked in UI-SPEC |
| APP-09 | Copy citation to clipboard | `navigator.clipboard.writeText()`. No external library needed |
| APP-10 | Trust signals in footer | UI-SPEC component 11; exact copy locked |
| FMT-01 | Format toggle shorthand/long-form; persist via localStorage | Long-form = pure transform: `Col. ${col}, ll. ${startLine}-${endLine}`. `formatCitation` in matching.js produces shorthand only — new `formatCitationLong` function needed |
| FMT-02 | Patent-number prefix toggle; persist via localStorage | Prepend normalized patent ID to citation string. Re-render on toggle change (no re-fetch) |
| BATCH-01 | Multi-passage: one fetch + one parse + N matchAndCite | `positionMap` is a plain array — fully reusable across N `matchAndCite` calls. No re-parse needed |
| BATCH-02 | Per-row confidence chip in batch | Each `matchAndCite` call returns its own confidence; render chip per result row |
| BATCH-03 | "Copy all" copies all batch citations newline-separated | `navigator.clipboard.writeText(citations.join('\n'))`. Format/prefix settings apply to each line |
</phase_requirements>

---

## Summary

Phase 8 builds the standalone citation webapp as a pure HTML/JS artifact — no framework, no new dependencies. The implementation reuses three already-extracted Phase 7 shared modules (`pdf-parser.js`, `position-map-builder.js`, `matching.js`) and mirrors the architecture of `offscreen.js` but without any Chrome extension APIs.

The three non-trivial engineering concerns are: (1) extending `scripts/build.js` with a `--webapp-only` target that skips the `PROXY_TOKEN` guard (the webapp must NOT carry a token), cleans only `dist/webapp/` instead of the whole `dist/`, and marks `../lib/pdf.mjs` as external so the 3MB PDF.js library is not bundled; (2) the webapp orchestration pipeline — normalize input → published-app guard → `GET /cache` → on miss fetch + parse → `matchAndCite` × N passages → POST /cache — wired as a state machine with 10 named UI states from the UI-SPEC; and (3) the long-form citation transform (`Col. 4, ll. 15-22`) which is a new pure function not present in `matching.js` (which only produces shorthand).

The design contract is fully locked in `08-UI-SPEC.md` with exact hex values, typography, spacing tokens, component specs, copywriting, and accessibility requirements extracted from the existing extension source. The `webapp/wrangler.toml` for Workers Assets is a 5-line TOML file using the `[assets]` block with `directory = "../dist/webapp"`.

**Primary recommendation:** Implement the webapp as three files under `webapp/`: `index.html` (markup + inline `<style>`), `js/app.js` (orchestration + UI state machine), and `js/normalizer.js` (patent input normalization + published-app guard). The esbuild entry point is `webapp/js/app.js`; `../lib/pdf.mjs` is external; no `__PROXY_TOKEN__` define.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Patent input normalization + published-app guard | Browser / Client | — | Pure string transform on user input; must fire before any network call (APP-02) |
| PDF fetch | Browser / Client → Worker API | — | Browser calls `GET /webapp/pdf?patent=`; Worker proxies to USPTO. CORS-blocked if direct |
| Cache lookup (GET /cache) | Browser / Client → Worker API | — | Browser calls `GET /cache?patent=&v=v5`; Worker reads KV |
| PDF parsing (PDF.js) | Browser / Client | — | Client-side, runs in PDF.js worker thread. Phase 7 CORE-04 confirmed this works |
| Position map building | Browser / Client | — | `buildPositionMap` runs in main thread after `extractTextFromPdf` |
| Text matching + citation | Browser / Client | — | `matchAndCite` is a pure function, no I/O |
| Cache upload (POST /cache) | Browser / Client → Worker API | — | Browser posts position map; Worker injects `source:"webapp"` and writes KV |
| Citation formatting (short/long/prefix) | Browser / Client | — | Pure transform of column/line integers from matchAndCite result |
| localStorage persistence (format/prefix) | Browser / Client | — | `localStorage.getItem`/`setItem` — no server involvement |
| Static asset serving | CDN / Static (Workers Assets) | — | `dist/webapp/` served via Cloudflare Workers Assets on `cite.tonyrowles.com` (Phase 9) |

---

## Standard Stack

### Core (all already installed in the project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | 0.27.3 (installed) | Bundle `webapp/js/app.js` + shared core modules into a single ESM file for `dist/webapp/` | Already used for Chrome + Firefox targets; project convention |
| pdfjs-dist | 5.5.207 (installed) | Client-side PDF parsing in browser | Already vendored to `src/lib/pdf.mjs` + `src/lib/pdf.worker.mjs` |
| vitest | ^3.0.0 (installed) | Unit testing of pure-logic webapp modules (normalization, format transform, published-app guard) | Project's existing test runner |
| wrangler | 4.54.0 (global) | `wrangler dev` for local serving on localhost:8788; `webapp/wrangler.toml` config | Already used for Worker deployment |

[VERIFIED: npm registry] — all four packages confirmed via `npm view` and project `package.json`.

### No New Packages

This phase installs zero new dependencies. The "seventh consecutive zero-dep milestone target" is a hard project constraint from `REQUIREMENTS.md` Out-of-Scope table. [VERIFIED: REQUIREMENTS.md]

---

## Package Legitimacy Audit

> Phase 8 installs NO new packages. All tooling (esbuild, vitest, pdfjs-dist, wrangler) was installed in prior phases.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| esbuild | npm | 5+ yrs | 50M+/wk | github.com/evanw/esbuild | N/A (pre-existing) | Approved — already installed |
| pdfjs-dist | npm | 10+ yrs | 2M+/wk | github.com/mozilla/pdf.js | N/A (pre-existing) | Approved — already vendored |
| vitest | npm | 3+ yrs | 30M+/wk | github.com/vitest-dev/vitest | N/A (pre-existing) | Approved — already installed |
| wrangler | npm | 4+ yrs | 2M+/wk | github.com/cloudflare/workers-sdk | N/A (pre-existing) | Approved — already installed globally |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User Input
    │
    ▼
[Patent Input Field]
    │  normalize (strip commas/spaces/hyphens, uppercase, US prefix)
    │  published-app guard (A1/A2/A9 or 20XXXXXXXXX → reject, show field-error, stop)
    │
    ▼
[Submit Handler]
    │  set state = loading-fetch OR loading-cache
    │
    ├──► GET /cache?patent={normalized}&v=v5  (Origin header auto-sent by browser)
    │        │
    │        ├── 200 OK: { entries, meta }
    │        │       │
    │        │       ▼
    │        │   set state = loading-match
    │        │   positionMap = cachedData.entries  (skip parse entirely — APP-04)
    │        │
    │        └── 404 Not Found (cache miss)
    │                │
    │                ▼
    │            GET /webapp/pdf?patent={normalized}  (Origin header auto-sent)
    │                │  state = loading-fetch → loading-parse after response
    │                │
    │                ▼
    │            extractTextFromPdf(arrayBuffer)   [runs PDF.js in worker thread]
    │                │  state = loading-parse → loading-match after parse
    │                │
    │                ▼
    │            buildPositionMap(pageResults)     [main thread]
    │                │
    │                ▼
    │            POST /cache  body={entries, meta, version:"v5"}  [fire-and-forget]
    │
    ▼
[matchAndCite × N passages]  (N = number of passage rows; same positionMap every call)
    │
    ▼
[Format results]
    │  shorthand: formatCitation(start, end) from matching.js  → "4:15-22"
    │  long-form:  formatCitationLong(start, end)  NEW  → "Col. 4, ll. 15-22"
    │  prefix:     if checked, prepend normalized patent ID
    │
    ▼
[Render result rows]  (state = success-single | success-batch | no-match)
    │  each row: citation text + confidence chip + copy button
    │  batch: also "Copy all" button below rows
    │
    ▼
[navigator.clipboard.writeText()]  on copy button click
    │
[localStorage]  reads on page load; writes on format/prefix toggle change
                re-renders displayed citations immediately (no re-fetch)
```

### Recommended Project Structure

```
webapp/
├── index.html          # Markup + inline <style> (entire UI-SPEC in one file)
├── js/
│   ├── app.js          # Entry point: orchestration, state machine, DOM manipulation
│   └── normalizer.js   # normalizePatentInput(), isPublishedApplication(), formatCitationLong()
└── wrangler.toml       # Workers Assets config (points at ../dist/webapp)

dist/webapp/            # esbuild output (generated — not committed)
├── index.html          # Copied verbatim from webapp/index.html
├── app.bundle.js       # esbuild output of webapp/js/app.js (bundles shared core)
└── lib/
    ├── pdf.mjs         # Copied from src/lib/pdf.mjs
    └── pdf.worker.mjs  # Copied from src/lib/pdf.worker.mjs

tests/unit/
└── webapp-logic.test.js  # New: tests for normalizePatentInput, isPublishedApplication, formatCitationLong
```

**Key layout decisions:**
- `webapp/` is a sibling of `worker/` and `src/` at repo root. `webapp/wrangler.toml` references `../dist/webapp` as the assets directory.
- `app.js` imports from `../../src/shared/matching.js`, `../../src/shared/pdf-parser.js`, `../../src/shared/position-map-builder.js`. These resolve correctly because esbuild bundles them at build time.
- `lib/pdf.mjs` is marked `external` in esbuild config (same pattern as Chrome/Firefox targets). The webapp imports it as a sibling at runtime from `./lib/pdf.mjs`.

### Pattern 1: esbuild --webapp-only Target

**What:** A new `buildWebapp()` function in `scripts/build.js` producing `dist/webapp/`.

**Key differences from Chrome/Firefox targets:**
1. `PROXY_TOKEN` guard must be skipped (no token in webapp). The `main()` function must detect `--webapp-only` BEFORE the `if (!PROXY_TOKEN)` exit.
2. `dist/webapp/` is cleaned individually (not the whole `dist/`). When `--webapp-only` is passed, `fs.rmSync('dist/webapp', ...)` not `fs.rmSync('dist', ...)`.
3. No `define: { '__PROXY_TOKEN__': ... }` in the esbuild config for the webapp bundle.
4. `external: ['./lib/pdf.mjs']` (path relative to `dist/webapp/`, where the bundle lands).
5. `index.html` is copied from `webapp/index.html` to `dist/webapp/index.html`.
6. `src/lib/` is copied to `dist/webapp/lib/`.

```javascript
// Source: scripts/build.js addition — [VERIFIED: codebase inspection]

const webappOnly = args.includes('--webapp-only');

// Webapp needs no PROXY_TOKEN — move token guard inside the non-webapp branches
// or guard with: if (!webappOnly && !PROXY_TOKEN) { process.exit(1); }

async function buildWebapp() {
  const start = Date.now();

  // Clean only dist/webapp (not the whole dist/ — other targets may coexist)
  fs.rmSync('dist/webapp', { recursive: true, force: true });
  fs.mkdirSync('dist/webapp/lib', { recursive: true });

  // Bundle app.js + shared core into a single ESM file
  await esbuild.build({
    entryPoints: ['webapp/js/app.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: 'dist/webapp/app.bundle.js',
    // CRITICAL: do NOT include __PROXY_TOKEN__ define — webapp has no token
    external: ['./lib/pdf.mjs'],  // resolved relative to outfile location
  });

  // Copy static assets
  fs.copyFileSync('webapp/index.html', 'dist/webapp/index.html');
  fs.cpSync('src/lib', 'dist/webapp/lib', { recursive: true });  // pdf.mjs + pdf.worker.mjs

  console.log(`Built webapp in ${Date.now() - start}ms`);
}
```

### Pattern 2: configurePdfWorker Path for Webapp

**What:** The webapp must call `configurePdfWorker(url)` with the correct path to `pdf.worker.mjs` in `dist/webapp/lib/`.

**The correct path:** `'/lib/pdf.worker.mjs'` (absolute path from the domain root). This works for both:
- `wrangler dev` on `http://localhost:8788/` — served at `http://localhost:8788/lib/pdf.worker.mjs`
- Production `https://cite.tonyrowles.com/lib/pdf.worker.mjs`

**Alternative:** `new URL('./lib/pdf.worker.mjs', import.meta.url).href` if the bundle is loaded as a module. Simpler to use the absolute path.

```javascript
// Source: based on pdf-parser.js comment and offscreen.js pattern — [VERIFIED: codebase]
import { configurePdfWorker, extractTextFromPdf } from '../../src/shared/pdf-parser.js';
import { buildPositionMap } from '../../src/shared/position-map-builder.js';
import { matchAndCite } from '../../src/shared/matching.js';

// Called once at app init, before any user action
configurePdfWorker('/lib/pdf.worker.mjs');
```

### Pattern 3: GET /cache Response Shape

The Worker `GET /cache` returns one of:
- **200 OK** (cache hit): `{ entries: [...], meta: { totalLines, totalColumns, hasClaimsSection }, cachedAt, version }` where `entries` is an array of `{ text, column, lineNumber, page, section, hasWrapHyphen }` — the stripped position map (no bounding boxes). This is directly usable as `positionMap` for `matchAndCite`.
- **404 Not Found** (cache miss): plain text `"Not found"`.
- **400 Bad Request**: published-application number or invalid format.
- **429 Too Many Requests**: rate limit hit.
- **403 Forbidden**: Origin not in allowlist (would only happen in dev if Origin doesn't match).

[VERIFIED: worker/src/index.js — lines 782-806]

### Pattern 4: Long-Form Citation Transform (FMT-01)

The existing `formatCitation(startEntry, endEntry)` in `matching.js` produces shorthand only (`4:15-22`). Long-form is a NEW function. The column/line integers come from `startEntry.column`, `startEntry.lineNumber`, `endEntry.column`, `endEntry.lineNumber` in the `matchAndCite` result.

```javascript
// Source: new function for webapp/js/normalizer.js — [VERIFIED: matching.js formatCitation]
export function formatCitationLong(startEntry, endEntry) {
  const { column: sc, lineNumber: sl } = startEntry;
  const { column: ec, lineNumber: el } = endEntry;

  if (sc === ec && sl === el) {
    return `Col. ${sc}, l. ${sl}`;
  } else if (sc === ec) {
    return `Col. ${sc}, ll. ${sl}-${el}`;
  } else {
    return `Col. ${sc}, l. ${sl} – Col. ${ec}, l. ${el}`;
  }
}
```

**Note:** The patent citation convention for multi-column spans uses "– Col. X, l. Y" not a combined range. The UI-SPEC example `Col. 4, ll. 15-22` covers the same-column case. Cross-column format is not specified in the UI-SPEC; the above pattern follows common patent-citation practice. [ASSUMED — multi-column long-form format not explicitly specified in requirements; same-column format is confirmed]

### Pattern 5: Patent Input Normalization (APP-01)

The Worker has `cleanPatentNumber` (strips US prefix and kind code to bare digits). The webapp needs a richer function that normalizes for display AND produces the Worker-ready form.

```javascript
// Source: based on worker/src/index.js cleanPatentNumber + APP-01 spec — [VERIFIED: codebase]
export function normalizePatentInput(raw) {
  // Strip formatting: commas, spaces, hyphens → e.g. "US 10,123,456 B2" → "US10123456B2"
  let normalized = raw.replace(/[\s,\-]/g, '').toUpperCase();
  // Add US prefix if absent
  if (!normalized.startsWith('US')) normalized = 'US' + normalized;
  return normalized;  // e.g. "US10123456B2" (with kind code preserved for display)
}

// The Worker-ready form for URL params:
export function toWorkerParam(normalized) {
  // Worker's cleanPatentNumber strips US prefix and kind code to bare digits
  return normalized;  // pass normalized form — Worker handles cleaning server-side
}
```

**Important:** Pass the full normalized form (e.g. `US10123456B2`) to the Worker. The Worker's `cleanPatentNumber` strips to bare digits internally. Do NOT pre-strip on the client side — the Worker's `isPublishedApplication` check on `rawPatent` needs the kind code present.

### Pattern 6: isPublishedApplication (Client-Side, APP-02)

The Worker already has `isPublishedApplication(raw)`. The webapp must replicate this logic client-side for input rejection before any network call.

```javascript
// Source: worker/src/index.js isPublishedApplication — [VERIFIED: codebase]
export function isPublishedApplication(raw) {
  if (/[Aa][129]$/.test(raw)) return true;       // kind codes A1, A2, A9
  const stripped = raw.replace(/^US/i, '');
  return /^20\d{9}/.test(stripped);              // 11-digit 20XXXXXXXXX format
}
```

Call this AFTER normalization (on the normalized form, not the raw input), before any fetch.

### Pattern 7: POST /cache Upload (Webapp)

```javascript
// Source: offscreen.js uploadToCache() — adapted for webapp — [VERIFIED: codebase]
async function uploadToCache(patentId, positionMap) {
  const entries = positionMap.map(({ text, column, lineNumber, page, section, hasWrapHyphen }) => ({
    text, column, lineNumber, page, section, hasWrapHyphen,
  }));
  const meta = {
    totalLines: positionMap.length,
    totalColumns: positionMap.length > 0 ? positionMap[positionMap.length - 1].column : 0,
    hasClaimsSection: positionMap.some(e => e.section === 'claims'),
  };
  const payload = { entries, meta, cachedAt: Date.now(), version: 'v5' };

  try {
    await fetch(`https://pct.tonyrowles.com/cache?patent=${encodeURIComponent(patentId)}&v=v5`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // NO Authorization header — Origin auth only (SEC-03)
      body: JSON.stringify(payload),
    });
  } catch (_) {
    // Fire-and-forget: never affect UX on failure
  }
}
```

**Key difference from offscreen.js:** No `Authorization: Bearer` header. The browser sends the `Origin` header automatically. The Worker injects `source:"webapp"` server-side (WRKR-03). [VERIFIED: worker/src/index.js lines 857-859]

### Pattern 8: wrangler.toml for Workers Assets

**What:** A minimal wrangler.toml for Phase 8 local dev (`wrangler dev`). Phase 9 adds custom domain routing.

```toml
# Source: Cloudflare Workers docs [assets] section — [CITED: developers.cloudflare.com/workers/static-assets/binding/]
name = "patent-cite-webapp"
compatibility_date = "2026-06-16"

[assets]
directory = "../dist/webapp"
```

**Notes:**
- No `main` key — pure static asset serving, no Worker script needed.
- `wrangler dev` from `webapp/` directory serves on `localhost:8788` by default.
- `localhost:8788` is already in the Worker's `ALLOWED_ORIGINS` allowlist. [VERIFIED: worker/src/index.js line 259]
- Workers Sites (`[site]`) is deprecated in wrangler v4. Use `[assets]` only. [CITED: search results — Workers Sites deprecated]

### Anti-Patterns to Avoid

- **Including `__PROXY_TOKEN__` in the webapp bundle:** The build pipeline currently checks `if (!PROXY_TOKEN) { process.exit(1) }` before any build. `--webapp-only` must skip this guard — the webapp intentionally has no token. Failure to skip it means CI/CD with no `PROXY_TOKEN` env var would abort the webapp build.
- **Using `fs.rmSync('dist', ...)` for `--webapp-only`:** This would delete the chrome and firefox builds if they ran first. Clean only `dist/webapp/`.
- **Passing `external: ['../lib/pdf.mjs']` (Chrome-style path) for webapp:** The webapp bundle lands at `dist/webapp/app.bundle.js`, so the correct external path is `'./lib/pdf.mjs'` (sibling `lib/` directory). Wrong path = esbuild tries to bundle the 3MB PDF.js library.
- **Re-running fetch+parse per passage (BATCH-01 violation):** The `positionMap` is a plain JavaScript array. After one fetch+parse, call `matchAndCite(passages[i], positionMap, '', '')` in a loop. No re-fetch, no re-parse.
- **Adding `Authorization: Bearer` to webapp fetch calls:** The Worker `GET /webapp/pdf` route explicitly rejects non-Origin auth (`if (!auth || auth.method !== 'origin')`). A Bearer header from the webapp would hit the 403 path.
- **Building the webapp bundle as IIFE:** The extension content script uses IIFE format. The webapp uses ESM (`format: 'esm'`). ESM is correct for a `<script type="module">` tag in `index.html`.
- **Direct `patentimages.storage.googleapis.com` fetch:** CORS-blocked in browsers. All PDF fetches must go through the Worker. [VERIFIED: CONTEXT.md + REQUIREMENTS.md APP-03]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF parsing in browser | Custom binary parser | `extractTextFromPdf` (already in `src/shared/pdf-parser.js`) | Phase 7 extracted this; it handles text layer detection, PDF.js worker threading, positioned text extraction |
| Text matching to column/line | Fuzzy text search | `matchAndCite` (already in `src/shared/matching.js`) | 5-tier matching cascade (exact, whitespace-stripped, bookend, fuzzy, gutter-tolerant); 75-case golden corpus tested |
| Position map building | Manual two-column PDF analysis | `buildPositionMap` (already in `src/shared/position-map-builder.js`) | Handles two-column detection, gutter line markers, claims boundary, wrap hyphens |
| KV cache lookup | Store results in memory only | Worker `GET /cache` (already deployed in Phase 6) | Cross-session, cross-device persistence; already rate-limited and secured |
| Origin authentication | Custom auth mechanism | Browser `Origin` header (automatic) | Worker already validates `ALLOWED_ORIGINS`; webapp sends zero auth code |
| Copy to clipboard | `document.execCommand('copy')` (deprecated) | `navigator.clipboard.writeText()` | Modern async API; works in all targeted browsers (Chrome 66+, Firefox 63+, Safari 13.1+) |

**Key insight:** The webapp's entire PDF-processing logic is already written and tested. Phase 8 is orchestration + UI wiring, not algorithm development.

---

## Common Pitfalls

### Pitfall 1: PROXY_TOKEN Guard Blocks Webapp Build

**What goes wrong:** `scripts/build.js` calls `if (!PROXY_TOKEN) { process.exit(1) }` unconditionally before checking the target flag. `--webapp-only` runs inside `main()` but the guard fires before `main()` even starts.

**Why it happens:** The token guard was added globally (SEC-02) for extension builds. The webapp deliberately has no token.

**How to avoid:** Parse `--webapp-only` from `args` BEFORE the token guard at lines 58-63. If `webappOnly` is true, skip the guard entirely. Then inside `main()`, skip `buildTestExports` (which does need a token for the extension matching bundles) when `webappOnly`.

**Warning signs:** `ERROR: PROXY_TOKEN environment variable is not set.` in a `--webapp-only` build.

### Pitfall 2: External Path Mismatch for pdf.mjs

**What goes wrong:** The Chrome/Firefox targets use `external: ['../lib/pdf.mjs']` because their bundle lands in `dist/chrome/offscreen/` or `dist/firefox/background/`, making `../lib/pdf.mjs` the correct relative path. The webapp bundle lands in `dist/webapp/app.bundle.js` (at the root of `dist/webapp/`), so the correct path is `external: ['./lib/pdf.mjs']`.

**Why it happens:** Copy-pasting the Chrome esbuild config.

**How to avoid:** The `external` array strings are matched against the import paths in source. `pdf-parser.js` imports `'../lib/pdf.mjs'`. With `outbase` set appropriately, esbuild maps the source `../lib/pdf.mjs` import to a runtime path. Verify the emitted bundle does NOT contain pdf.mjs source inline (bundle size should be ~50KB, not ~3.5MB).

**Warning signs:** `dist/webapp/app.bundle.js` is >2MB.

### Pitfall 3: dist/ Cleanup Deletes Extension Builds

**What goes wrong:** The current `main()` unconditionally calls `fs.rmSync('dist', { recursive: true, force: true })` for any non-watch build. Adding `--webapp-only` support without updating this logic means running `--webapp-only` after `--chrome-only` would delete `dist/chrome/`.

**How to avoid:** Add `if (webappOnly) { fs.rmSync('dist/webapp', ...) } else { fs.rmSync('dist', ...) }` before the target dispatch.

### Pitfall 4: positionMap from Cache Hit Missing Bounding Box Fields

**What goes wrong:** `matchAndCite` uses `startEntry.column`, `startEntry.lineNumber`, `endEntry.column`, `endEntry.lineNumber` for citation output — these ARE in the cached entries. But bounding box fields (`x`, `y`, `width`, `height`) are stripped before KV upload (offscreen.js line 413). The webapp does NOT need bounding boxes (it only displays citations, not PDF overlays), so this is fine — but any code that tries to use `startEntry.x` etc. from a cache hit will get `undefined`.

**How to avoid:** Only read `column`, `lineNumber`, `page`, `section`, `hasWrapHyphen`, `text` from positionMap entries.

### Pitfall 5: re-render citations on toggle change requires storing raw results

**What goes wrong:** When the user toggles FMT-01 (short/long) or FMT-02 (prefix), displayed citations must update immediately without a re-fetch. If the rendered result only stored the formatted string (not `startEntry`/`endEntry`), re-formatting is impossible.

**How to avoid:** After each `matchAndCite` call, store `{ startEntry, endEntry, confidence, passage }` in an in-memory results array. The render function reads the current format/prefix settings and calls `formatCitation` or `formatCitationLong` on each stored result. Toggle event handlers re-render from stored results.

### Pitfall 6: Cache Version Mismatch

**What goes wrong:** The extension uses `CACHE_VERSION = 'v5'`. If the webapp uses a different version string (or omits `&v=...`), it would get cache misses on patents already cached by the extension, and upload under a different KV key.

**How to avoid:** Hardcode `v5` in the webapp for both `GET /cache?patent=...&v=v5` and `POST /cache?patent=...&v=v5`. [VERIFIED: offscreen.js line 35]

### Pitfall 7: Workers Sites vs Workers Assets Confusion

**What goes wrong:** `[site]` directive in wrangler.toml is the old Workers Sites API (deprecated in wrangler v4). Using it would trigger a deprecation warning/error.

**How to avoid:** Use `[assets]` block exclusively. No `[site]` key. [CITED: search results — Workers Sites deprecated in wrangler v4]

---

## Code Examples

### Webapp Orchestration Pipeline (app.js)

```javascript
// Source: mirrors offscreen.js handleCheckCache + parsePdf + lookupPosition — [VERIFIED: codebase]
const WORKER_URL = 'https://pct.tonyrowles.com';
const CACHE_VERSION = 'v5';

async function runCitation(normalizedPatentId, passages) {
  // Stage 1: Cache check
  setStage('loading-cache', 'Loading from cache…');
  const cached = await checkCache(normalizedPatentId);

  let positionMap;
  if (cached) {
    positionMap = cached.entries;  // shape: [{ text, column, lineNumber, page, section, hasWrapHyphen }]
  } else {
    // Stage 2: Fetch PDF
    setStage('loading-fetch', 'Fetching patent PDF…');
    const pdfBytes = await fetchPdf(normalizedPatentId);

    // Stage 3: Parse
    setStage('loading-parse', 'Parsing PDF…');
    const pageResults = await extractTextFromPdf(pdfBytes);
    positionMap = buildPositionMap(pageResults);

    // Fire-and-forget cache upload
    uploadToCache(normalizedPatentId, positionMap);
  }

  // Stage 4: Match (N passages, same positionMap)
  setStage('loading-match', 'Matching passage…');
  const results = passages.map(p => matchAndCite(p, positionMap, '', ''));
  renderResults(results, normalizedPatentId);
}

async function fetchPdf(patentId) {
  const res = await fetch(
    `${WORKER_URL}/webapp/pdf?patent=${encodeURIComponent(patentId)}`
    // NO Authorization header — Origin sent automatically
  );
  if (!res.ok) throw new Error(`fetch-failed:${res.status}`);
  return await res.arrayBuffer();
}

async function checkCache(patentId) {
  const res = await fetch(
    `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`
  );
  if (!res.ok) return null;  // 404 = miss
  return await res.json();  // { entries, meta, ... }
}
```

### Long-Form Citation Format (FMT-01)

```javascript
// Source: new function; formatCitation in matching.js is the shorthand reference — [VERIFIED: matching.js]
export function formatCitationLong(startEntry, endEntry) {
  const { column: sc, lineNumber: sl } = startEntry;
  const { column: ec, lineNumber: el } = endEntry;
  if (sc === ec && sl === el) return `Col. ${sc}, l. ${sl}`;
  if (sc === ec) return `Col. ${sc}, ll. ${sl}-${el}`;
  return `Col. ${sc}, l. ${sl} – Col. ${ec}, l. ${el}`;  // en-dash for cross-column
}
```

### localStorage Persistence (FMT-01, FMT-02)

```javascript
// Source: Web platform standard — [ASSUMED]
function loadPrefs() {
  return {
    format: localStorage.getItem('citation-format') || 'short',       // 'short' | 'long'
    prefix: localStorage.getItem('include-patent-number') === 'true', // boolean
  };
}

function savePrefs(prefs) {
  localStorage.setItem('citation-format', prefs.format);
  localStorage.setItem('include-patent-number', String(prefs.prefix));
}
```

### Copy to Clipboard

```javascript
// Source: MDN Clipboard API — [ASSUMED]
async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workers Sites (`[site]` in wrangler.toml) | Workers Assets (`[assets]` block) | wrangler v4 | `[site]` is deprecated; use `[assets]` in all new wrangler.toml files |
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | ~2018 (async Clipboard API) | `execCommand` deprecated; async API is the standard |
| Extension-only offscreen.js for PDF parsing | `src/shared/` modules (Phase 7) | Phase 7 | `configurePdfWorker(url)` seam allows webapp to use the same pipeline without `chrome.*` globals |

**Deprecated/outdated:**
- Workers Sites: replaced by Workers Assets in wrangler v4. Any `[site]` directive in a new wrangler.toml will trigger a deprecation warning.
- `pdf-parser.js` module-scope `chrome.runtime.getURL(...)`: fixed in Phase 7 with `configurePdfWorker(url)` seam. Phase 8 code must call `configurePdfWorker('/lib/pdf.worker.mjs')` once at startup. [VERIFIED: src/shared/pdf-parser.js]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Multi-column long-form format is `Col. X, l. Y – Col. Z, l. W` (en-dash) | Code Examples (FMT-01) | Minor: incorrect separator in cross-column citations; same-column format `Col. X, ll. Y-Z` is unambiguous per UI-SPEC |
| A2 | `navigator.clipboard.writeText()` is available without feature detection in targeted browsers | Don't Hand-Roll | Low: all modern browsers support it; a HTTPS context (Workers Assets on cite.tonyrowles.com) is required — localhost:8788 is HTTP but Clipboard API works on localhost regardless |
| A3 | localStorage is available in the webapp context | Code Examples (localStorage) | Negligible: localStorage is universally available in top-level web pages |

**If this table is empty:** All other claims in this research were verified or cited from codebase inspection or official documentation.

---

## Open Questions (RESOLVED — cross-column long-form locked in 08-02; wrangler-dev HTTPS needs no action)

1. **Cross-column long-form format spec**
   - What we know: same-column long-form is `Col. 4, ll. 15-22` (UI-SPEC example, FMT-01). The `formatCitation` shorthand for cross-column is `4:15-22:3` style.
   - What's unclear: exact long-form separator for cross-column spans is not specified anywhere in REQUIREMENTS, CONTEXT, or UI-SPEC.
   - Recommendation: use `Col. X, l. Y – Col. Z, l. W` (en-dash, common in patent drafting practice); treat as A1 assumption; the planner can include a checkpoint or defer to the executor's judgment.

2. **`wrangler dev` local HTTPS**
   - What we know: `wrangler dev` serves on `http://localhost:8788` by default. The Clipboard API works on localhost in all browsers regardless of HTTP/HTTPS.
   - What's unclear: whether the PDF.js `SharedArrayBuffer` optimization requires HTTPS headers (`COOP`/`COEP`). In practice, PDF.js falls back gracefully without `SharedArrayBuffer`.
   - Recommendation: no action needed for Phase 8 local UAT; Phase 9 production deploy is HTTPS by definition.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | scripts/build.js | ✓ | v24.11.1 | — |
| esbuild (local) | scripts/build.js --webapp-only | ✓ | 0.27.3 | — |
| wrangler (global) | webapp/wrangler.toml + wrangler dev | ✓ | 4.54.0 | — |
| pdfjs-dist (src/lib/) | pdf.mjs + pdf.worker.mjs asset copy | ✓ | 5.5.207 | — |
| vitest | npm run test:src | ✓ | ^3.0.0 | — |
| Worker (`pct.tonyrowles.com`) | GET /webapp/pdf, GET /cache, POST /cache | Assumed ✓ (Phase 6 deployed) | — | Local dev can mock fetch in unit tests |

**Missing dependencies with no fallback:** none

**Missing dependencies with fallback:**
- Production Worker is assumed deployed from Phase 6. Unit tests mock `fetch` — no live Worker needed for the test suite.

---

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is included because the additional_context explicitly requested a test strategy.

The project's zero-dep constraint and `nyquist_validation: false` config mean there is NO jsdom and NO live-browser test framework for this phase. The project memory note confirms: "UI phases unit-test pure logic + static guards, live Shadow-DOM/focus/page behavior → Phase 5 UAT-05; verifier `human_needed` is expected, not a gap."

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 |
| Config file | vitest.config.js (root) — environment: 'node' |
| Quick run command | `vitest run tests/unit/webapp-logic.test.js` |
| Full suite command | `npm run test:src` (all tests/unit/\*.test.js) |

### What Is Unit-Testable Now (Pure Logic)

| REQ ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| APP-01 | `normalizePatentInput('US 10,123,456 B2')` → `'US10123456B2'`; bare digits get `US` prefix | unit | `vitest run tests/unit/webapp-logic.test.js` |
| APP-02 | `isPublishedApplication('US20210123456A1')` → true; `isPublishedApplication('US10123456B2')` → false | unit | same |
| APP-02 | `isPublishedApplication('20210123456')` → true; `isPublishedApplication('10123456')` → false | unit | same |
| FMT-01 | `formatCitationLong({column:4, lineNumber:15}, {column:4, lineNumber:22})` → `'Col. 4, ll. 15-22'` | unit | same |
| FMT-01 | `formatCitationLong({column:4, lineNumber:15}, {column:4, lineNumber:15})` → `'Col. 4, l. 15'` | unit | same |
| BATCH-01 | `matchAndCite` called N times on same positionMap without mutation (positionMap is read-only across calls) | unit | same (use existing test data) |

### What Requires Live UAT (Phase 9)

| REQ ID | Behavior | Reason deferred |
|--------|----------|-----------------|
| APP-03 | Zero `Authorization: Bearer` headers in DevTools network panel | Requires live browser network inspector |
| APP-04 | Cache hit skips PDF.js parse; loading line shows "Loading from cache…" | Requires live Worker + cached patent |
| APP-05 | PDF bytes → position map → citation in browser | Requires live Worker + real PDF; CORE-04 covered the PDF pipeline but not the webapp UI wiring |
| APP-06 | Confidence chip color correct | Requires DOM rendering |
| APP-07 | Retry button re-runs lookup | Requires DOM interaction |
| APP-08 | Named-stage transitions visible | Requires DOM + async timing |
| APP-09 | `navigator.clipboard.writeText` succeeds | Requires browser security context |
| APP-10 | Trust footer visible | Requires rendered page |
| BATCH-01 | One fetch, one parse, N results visible | Requires live network + DOM |
| BATCH-02 | Each row has its own chip | Requires DOM |
| BATCH-03 | "Copy all" copies newline-separated citations | Requires browser clipboard |
| FMT-02 | Prefix toggle updates citation in-place | Requires DOM |

### Wave 0 Gaps

- [ ] `tests/unit/webapp-logic.test.js` — covers APP-01, APP-02, FMT-01 (new file, new functions)
- [ ] No new test infrastructure needed — existing vitest.config.js covers it

---

## Project Constraints (from CLAUDE.md)

| Directive | Application to Phase 8 |
|-----------|------------------------|
| After every AskUserQuestion call, verify tool result contains user's actual selection | No AskUserQuestion calls expected in this phase |
| ZERO new npm dependencies | Confirmed: all tooling (esbuild, vitest, pdfjs-dist, wrangler) pre-installed |
| No `Authorization: Bearer` in any webapp request | Enforced in `fetchPdf()` and `uploadToCache()` — no auth header |
| Published-app rejection at input before any network call | `isPublishedApplication()` called synchronously on submit, before any `fetch()` |

---

## Sources

### Primary (HIGH confidence)
- `src/offscreen/offscreen.js` — orchestration pipeline reference (cache-first, fetch, parse, match, upload)
- `src/shared/matching.js` — `matchAndCite`, `formatCitation`, confidence thresholds
- `src/shared/pdf-parser.js` — `configurePdfWorker(url)` seam, `extractTextFromPdf`
- `src/shared/position-map-builder.js` — `buildPositionMap`, PositionMap entry shape
- `worker/src/index.js` — `cleanPatentNumber`, `isPublishedApplication`, GET /cache response logic, POST /cache WRKR-03 behavior, `ALLOWED_ORIGINS`
- `scripts/build.js` — esbuild pipeline pattern, `external` convention, PROXY_TOKEN guard location
- `.planning/phases/08-webapp-core-build/08-UI-SPEC.md` — complete design contract
- `.planning/phases/08-webapp-core-build/08-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- [Cloudflare Workers Static Assets — `[assets]` configuration](https://developers.cloudflare.com/workers/static-assets/binding/) — `[assets]` block TOML syntax confirmed; `[site]` deprecation confirmed
- [Cloudflare Workers docs — wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) — wrangler v4 `[assets]` vs deprecated `[site]`

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages are already installed in the project; versions confirmed
- Architecture: HIGH — orchestration mirrored from offscreen.js; Worker API shapes verified from worker/src/index.js
- Build pipeline: HIGH — scripts/build.js read in full; exact pitfalls documented
- Workers Assets wrangler.toml: MEDIUM — official docs confirmed `[assets]` + `directory` syntax; simple enough that no ambiguity
- Long-form citation format: MEDIUM — same-column confirmed by UI-SPEC example; cross-column format is ASSUMED

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable domain — no fast-moving dependencies; only risk is Cloudflare Workers Assets API changes, which are unlikely in 30 days)

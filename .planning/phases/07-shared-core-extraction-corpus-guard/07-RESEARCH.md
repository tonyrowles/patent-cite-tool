# Phase 7: Shared Core Extraction + Corpus Guard - Research

**Researched:** 2026-06-16
**Domain:** ES module relocation, esbuild alias, PDF.js worker seam, Playwright web worker detection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Shared core mechanism:** plain `src/shared/` directory + esbuild alias — NOT npm
  workspaces (avoids symlink complexity with per-target Vitest alias configs).
- **`pdf-parser.js` worker seam (LOAD-BEARING):** the module-scope
  `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` (currently line 14)
  throws on import in a plain web page. Replace it with a `configurePdfWorker(url)`
  function — the extension injects `chrome.runtime.getURL(...)`, the webapp injects its
  asset path. This is the ONLY non-trivial code change; the other two modules are
  verbatim moves. Importing the module with no `chrome` global must NOT throw.
- **Corpus guard (LOAD-BEARING):** the 75-case golden corpus does NOT exercise the
  browser-context PDF→position-map pipeline. CORE-04 (full-pipeline browser integration
  test) is REQUIRED DoD — it proves `pdf-parser.js` works in a plain module context with
  PDF.js in a worker thread. `tests/golden/baseline.json` must be byte-identical to the
  pre-extraction baseline (CORE-03).
- **Zero new npm dependencies** (PDF.js, esbuild, Wrangler already installed).

### Claude's Discretion

All remaining implementation choices are at Claude's discretion — pure infrastructure
phase. Re-export shims vs hard relocation of the old `src/offscreen/*` paths is at
Claude's discretion provided success criterion 1 holds (old files no longer exist as
independent implementations).

### Deferred Ideas (OUT OF SCOPE)

None — infrastructure phase; webapp consumption of the shared core is exercised in Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | `matching.js` and `position-map-builder.js` relocated into `src/shared/`, consumed by extension via existing esbuild alias pattern — verbatim, no behavior change | matching.js already in src/shared/; position-map-builder.js is a verbatim copy + update of 2 import sites + 1 test import site + vitest alias extension |
| CORE-02 | `pdf-parser.js` relocated into `src/shared/` with `configurePdfWorker(url)` seam replacing module-scope `chrome.runtime.getURL(...)` | pdf-parser.js line 14 is the exact line to replace; callers are offscreen.js and pdf-pipeline.js; see seam pattern below |
| CORE-03 | 75-case golden corpus passes 100% on extension build after extraction, with `tests/golden/baseline.json` byte-unchanged | corpus test is in tests/unit/text-matcher.test.js; only exercises matchAndCite with pre-built PositionMap JSON fixtures — no PDF.js involved; baseline.json has 76 entries (see note) |
| CORE-04 | Full-pipeline browser-context integration test (PDF bytes → extractTextFromPdf → buildPositionMap → matchAndCite) green, PDF.js confirmed in worker thread | Playwright 1.60 page.on('worker') event fires for WebWorker spawned by page; worker.url() identifies pdf.worker.mjs; see implementation pattern below |
</phase_requirements>

---

## Summary

Phase 7 has three distinct work streams: (1) two verbatim file moves with import-site rewrites, (2) one non-trivial code change (`configurePdfWorker` seam), and (3) one new test (CORE-04 browser integration).

The codebase has already established the full relocation pattern with `matching.js` — it lives in `src/shared/matching.js`, is imported directly by `offscreen.js` and `pdf-pipeline.js` via the relative path `../shared/matching.js`, and the vitest alias configs for `test:chrome` and `test:firefox` redirect any import of `src/shared/matching.js` to the corresponding `dist/{chrome,firefox}/matching-exports.js` bundle. This same alias mechanism is what will need to be extended for the new shared modules.

The PDF.js worker seam is surgically small: exactly one line in `src/offscreen/pdf-parser.js` (line 14) must be replaced with a `configurePdfWorker(url)` function and a lazy-init pattern. The corpus guard (CORE-03) is already nearly satisfied — `tests/golden/baseline.json` has 76 entries (not 75; the REQUIREMENTS.md says "75-case" but the actual baseline has 76 entries) and the text-matcher.test.js harness operates on pre-computed JSON position-map fixtures, not live PDF parsing. Moving `matching.js` (already done) or `position-map-builder.js` cannot break this test unless the algorithm changes. The CORE-04 browser integration test is the only genuinely new work requiring careful design.

**Primary recommendation:** Move `position-map-builder.js` and `pdf-parser.js` to `src/shared/` as re-export shims at the old paths, update import sites to point to `src/shared/`, extend the vitest alias mechanism, add `configurePdfWorker`, and write a Playwright-based CORE-04 spec with `page.on('worker')` worker-thread assertion.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PDF text extraction | Browser / Client | — | PDF.js requires a browser WebWorker; cannot run in Node without worker shim |
| Position map construction | Browser / Client | Node (test only) | Pure function on extracted items; already tested in node via JSON fixtures |
| Text matching / citation | Any (pure function) | — | No browser API dependencies; runs in Node for unit tests |
| Worker-seam injection | App layer (caller) | — | Each entry point (extension, webapp) injects its own URL at startup |
| Corpus guard (CORE-03) | Node test runner | — | Text-matcher.test.js runs in Vitest/Node against JSON fixtures |
| Browser integration (CORE-04) | Browser (Playwright) | — | PDF.js WebWorker can only be asserted in real browser context |

---

## Standard Stack

No new packages. All tools already in devDependencies.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | ^0.27.3 | Bundle + alias | Already the build system; no change needed for verbatim moves |
| vitest | ^3.0.0 | Unit/integration tests | Already the test runner for src |
| @playwright/test | 1.60.0 | Browser integration tests | Already installed; `page.on('worker')` available since v1.x |
| pdfjs-dist | ^5.5.207 | PDF parsing | Already installed as devDep; the vendored `src/lib/pdf.mjs` + `pdf.worker.mjs` are the runtime copies |

### No New Dependencies Required

Zero new npm dependencies. The CORE-04 browser integration test requires a local HTTP server for serving ES modules in a browser context. The strategy uses Node.js built-in `http.createServer` (no new package). [ASSUMED — confirm `http.createServer` can serve ES modules with correct MIME type; it can if `Content-Type: application/javascript` is set explicitly]

---

## Package Legitimacy Audit

No new packages are being installed in this phase. This section is not applicable.

**Packages removed due to slopcheck verdict:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         src/shared/                              │
│  constants.js  matching.js  report-*.js                         │
│  [NEW] pdf-parser.js        (formerly src/offscreen/)           │
│  [NEW] position-map-builder.js (formerly src/offscreen/)        │
└───────────────────┬─────────────────────────────────────────────┘
                    │ imported by
          ┌─────────┴───────────┐
          ▼                     ▼
src/offscreen/offscreen.js  src/firefox/pdf-pipeline.js
  (extension Chrome)          (extension Firefox)
  import from ../shared/      import from ../shared/
          │                     │
          ▼                     ▼
  GlobalWorkerOptions         GlobalWorkerOptions
  .workerSrc = configurePdfWorker(
    chrome.runtime.getURL('lib/pdf.worker.mjs')
  )                             (same call, same runtime API)
          │
          ▼
  src/lib/pdf.mjs (external, not bundled)
  + pdf.worker.mjs (spawned as WebWorker)
```

### Recommended Project Structure After Phase 7

```
src/
├── shared/
│   ├── constants.js           # existing
│   ├── matching.js            # existing (already relocated)
│   ├── report-payload-builder.js  # existing
│   ├── report-transport.js    # existing
│   ├── pdf-parser.js          # [NEW] relocated from src/offscreen/
│   └── position-map-builder.js  # [NEW] relocated from src/offscreen/
├── offscreen/
│   ├── offscreen.js           # updated imports + configurePdfWorker call
│   ├── pdf-parser.js          # [EITHER] re-export shim OR deleted
│   └── position-map-builder.js  # [EITHER] re-export shim OR deleted
└── firefox/
    └── pdf-pipeline.js        # updated imports + configurePdfWorker call
tests/
├── unit/
│   └── position-map-builder.test.js  # import path updated to src/shared/
└── e2e/
    └── specs/
        └── core-04-pipeline.spec.js  # [NEW] full-pipeline browser integration test
```

### Pattern 1: Re-export Shim (recommended for old paths)

**What:** After moving a file to `src/shared/`, the old path at `src/offscreen/` becomes a one-liner re-export shim.

**When to use:** Provides a safety net in case any tooling or script still references the old path. The CONTEXT.md says "re-export shims are acceptable" for success criterion 1.

**Recommendation:** Use re-export shims for both `pdf-parser.js` and `position-map-builder.js` at `src/offscreen/`. This is strictly safer than hard-deleting the old files, because `tests/unit/position-map-builder.test.js` currently imports from `src/offscreen/position-map-builder.js` — the shim lets the planner choose: update the test import OR leave it pointing to the shim. The matching.js precedent involved deleting the old path and updating all import sites; this phase should update the test import site explicitly regardless.

```javascript
// src/offscreen/pdf-parser.js — re-export shim
// Source: [VERIFIED: direct codebase inspection]
export { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js';
```

```javascript
// src/offscreen/position-map-builder.js — re-export shim
// Source: [VERIFIED: direct codebase inspection]
export * from '../shared/position-map-builder.js';
```

### Pattern 2: configurePdfWorker Seam

**What:** Replace the module-scope `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` assignment with a named exported function that callers invoke once before any PDF parsing.

**Why:** The assignment at module scope (line 14 of `src/offscreen/pdf-parser.js`) executes on `import`, calling `chrome.runtime.getURL(...)` immediately. In a plain web page with no `chrome` global, this throws `ReferenceError: chrome is not defined`. Moving the assignment into a function makes the module import-safe everywhere.

**Exact current line to replace (line 14):**
```javascript
// BEFORE (throws on plain-page import):
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```

**After (new src/shared/pdf-parser.js):**
```javascript
// Source: [VERIFIED: direct codebase inspection of src/offscreen/pdf-parser.js]

import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs';

/**
 * Configure the PDF.js worker source URL.
 * Must be called once before any extractTextFromPdf() calls.
 *
 * Extension callers:  configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'))
 * Webapp callers:     configurePdfWorker('/assets/pdf.worker.mjs')  (or whatever the asset path is)
 *
 * Importing this module without calling configurePdfWorker is safe — PDF.js
 * will fall back to main-thread parsing if workerSrc is not set.
 */
export function configurePdfWorker(url) {
  GlobalWorkerOptions.workerSrc = url;
}

// ... rest of file unchanged ...
export async function extractTextFromPdf(pdfData) { /* unchanged */ }
```

**Where callers must add the configurePdfWorker call:**

1. `src/offscreen/offscreen.js` — add at top-level after imports (runs once when the offscreen document loads):
   ```javascript
   import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js';
   // After imports:
   configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'));
   ```

2. `src/firefox/pdf-pipeline.js` — same pattern:
   ```javascript
   import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js';
   // After imports:
   configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'));
   ```

Both call sites already have access to the `chrome` global (extension contexts), so the call is safe. The behavior is identical to the current module-scope assignment — both happen once at document load.

### Pattern 3: esbuild alias extension for new shared modules

**What:** The existing vitest alias configs (`vitest.config.chrome.js` and `vitest.config.firefox.js`) alias `src/shared/matching.js` to the corresponding built bundle. The same mechanism should be extended for `pdf-parser.js` and `position-map-builder.js` IF these modules are consumed by the vitest chrome/firefox test suites.

**Current alias (already working):**
```javascript
// vitest.config.chrome.js — existing
resolve: {
  alias: [
    {
      find: /.*src\/shared\/matching\.js/,
      replacement: resolve('./dist/chrome/matching-exports.js'),
    },
  ],
},
```

**Assessment:** The existing `test:chrome` and `test:firefox` suites (`tests/unit/text-matcher.test.js`, `tests/unit/shared-matching.test.js`) only import from `src/shared/matching.js`. They do NOT import `pdf-parser.js` or `position-map-builder.js`. The golden corpus test (`text-matcher.test.js`) operates on pre-built JSON position-map fixtures and never calls `extractTextFromPdf` or `buildPositionMap`.

**Therefore:** No new vitest alias entries are required for `pdf-parser.js` or `position-map-builder.js` in the chrome/firefox configs. The base `vitest.config.js` (used by `test:src`) imports from `src/` directly — after the move to `src/shared/`, the test import path in `tests/unit/position-map-builder.test.js` simply needs to be updated from `../../src/offscreen/position-map-builder.js` to `../../src/shared/position-map-builder.js`. [VERIFIED: direct codebase inspection]

**No new esbuild config changes required.** The existing `getEsmConfig` and `getFirefoxEsmConfig` bundle `offscreen.js` and `pdf-pipeline.js` respectively, which import the shared modules. esbuild will bundle `src/shared/pdf-parser.js` and `src/shared/position-map-builder.js` by following the updated relative imports — no alias needed because the build system bundles the source tree directly.

### Pattern 4: CORE-04 Browser Integration Test — Playwright + page.on('worker')

**What:** A Playwright test that runs the full pipeline (PDF bytes → `extractTextFromPdf` → `buildPositionMap` → `matchAndCite`) in a real Chromium browser page, with a deterministic assertion that PDF.js spawned a WebWorker (not running on main thread).

**Worker thread assertion mechanism:**
Playwright 1.60 (confirmed in codebase) provides `page.on('worker', worker => ...)` which fires when a dedicated WebWorker is spawned by the page. [VERIFIED: `node_modules/playwright-core/types/types.d.ts` line 1179 — "Emitted when a dedicated WebWorker is spawned by the page"] `worker.url()` returns the worker's script URL — PDF.js's worker will have a URL containing `pdf.worker.mjs`. This is fully automatable and does not require the Chrome DevTools Threads panel.

**Test strategy:** [ASSUMED — this pattern is architecturally correct but not a copy of existing test code]

```javascript
// tests/e2e/specs/core-04-pipeline.spec.js
// Standalone Playwright spec (no extension, no loadExtension)

import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

// The test serves local files via a minimal Node HTTP server to get a real origin
// (file:// URLs cannot use ES module imports in Chromium due to CORS restrictions).
// The server is started and stopped per test using test.beforeAll / test.afterAll.

test.describe('CORE-04: full-pipeline browser integration', () => {
  let server;
  let baseUrl;

  test.beforeAll(async () => {
    // Start minimal HTTP server serving src/shared/, src/lib/, and a test fixture PDF
    server = http.createServer((req, res) => {
      // serve files from project root with correct MIME types
      // ...
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test.afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  test('PDF pipeline runs in browser with PDF.js in worker thread', async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Collect worker spawned events
    const workers = [];
    page.on('worker', worker => workers.push(worker.url()));

    // Navigate to test harness HTML page that imports pdf-parser.js and runs pipeline
    await page.goto(`${baseUrl}/tests/e2e/fixtures/core04-harness.html`);

    // Wait for pipeline to complete (harness posts result to window.__core04Result__)
    const result = await page.waitForFunction(
      () => window.__core04Result__ !== undefined,
      { timeout: 30_000 }
    );
    const pipelineResult = await result.jsonValue();

    // Assert pipeline produced a valid citation
    expect(pipelineResult.success).toBe(true);
    expect(pipelineResult.citation).toMatch(/^\d+:\d+/);

    // CORE-04 key assertion: PDF.js ran in a worker thread (not main thread)
    const pdfWorkerSpawned = workers.some(url => url.includes('pdf.worker.mjs'));
    expect(pdfWorkerSpawned).toBe(true);

    await browser.close();
  });
});
```

**Harness HTML file** (`tests/e2e/fixtures/core04-harness.html`):
```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script type="module">
  import { configurePdfWorker, extractTextFromPdf } from '/src/shared/pdf-parser.js';
  import { buildPositionMap } from '/src/shared/position-map-builder.js';
  import { matchAndCite } from '/src/shared/matching.js';

  configurePdfWorker('/src/lib/pdf.worker.mjs');

  // Fetch a small PDF fixture
  const resp = await fetch('/tests/e2e/.pdf-cache/US6738932.pdf');
  const buf = await resp.arrayBuffer();
  const pageResults = await extractTextFromPdf(buf);
  const positionMap = buildPositionMap(pageResults);
  const result = matchAndCite('network interface', positionMap);

  window.__core04Result__ = {
    success: positionMap.length > 0,
    citation: result ? result.citation : null,
    positionMapLength: positionMap.length,
  };
</script>
</body>
</html>
```

**Key constraint:** The HTTP server must set `Content-Type: application/javascript` for `.js` and `.mjs` files — Chromium enforces strict MIME type checking for ES modules. Node's built-in `http` module does not set MIME types automatically; the server implementation must explicitly handle this. [VERIFIED: standard browser behavior, no source needed]

**PDF fixture:** `tests/e2e/.pdf-cache/US6738932.pdf` (1.2 MB, confirmed present in codebase). This is gitignored but present in the development environment. The test must handle the case where this file is absent (CI cold cache) — either pre-fetch or skip. The matching assertion uses `'network interface'` as a known phrase in US6738932 spec text, verifiable against `tests/fixtures/US6738932.json`. [ASSUMED — the specific passage; planner should verify against the JSON fixture or use baseline.json `US6738932-spec-short`]

**Alternative worker-thread assertion (simpler, no HTTP server):** [ASSUMED — this approach is architecturally sound but not verified against this specific codebase]

Instead of a full HTTP server, the test can use `page.route()` to intercept all requests to a synthetic origin and serve file content inline. This is supported by Playwright and avoids the HTTP server setup:

```javascript
await page.route('http://test.local/**', async route => {
  const filePath = path.join(PROJECT_ROOT, route.request().url().replace('http://test.local/', ''));
  if (fs.existsSync(filePath)) {
    const body = fs.readFileSync(filePath);
    const mimeType = filePath.endsWith('.mjs') || filePath.endsWith('.js') 
      ? 'application/javascript' 
      : filePath.endsWith('.pdf') ? 'application/pdf' : 'text/html';
    await route.fulfill({ body, contentType: mimeType });
  } else {
    await route.abort();
  }
});
await page.goto('http://test.local/tests/e2e/fixtures/core04-harness.html');
```

This approach is recommended over a real HTTP server because it removes the port allocation / teardown complexity and works in CI without requiring an available port.

### Anti-Patterns to Avoid

- **Don't add pdf-parser.js or position-map-builder.js to `src/matching-exports.js`**: That file re-exports only matching functions for the vitest dist-bundle alias. Adding PDF-related exports would bloat the test bundle unnecessarily. [VERIFIED: inspected src/matching-exports.js]
- **Don't set `GlobalWorkerOptions.workerSrc = ''` as the "safe default"**: If no URL is configured, PDF.js falls back to main-thread parsing. This is acceptable (comment in the current source says "fallback is acceptable"), but setting an empty string is different from not setting it. The correct pattern is: do NOT assign in the module body at all; leave `configurePdfWorker(url)` as the only assignment point.
- **Don't run CORE-04 inside the Vitest test suite** (test:src): PDF.js in Node.js without the proper worker setup does not spawn a real WebWorker — the worker-thread assertion would always be false. CORE-04 MUST run under Playwright in a real Chromium context. [VERIFIED: pdf-verifier.js in Node uses pdfjs-dist without worker — main-thread only]
- **Don't assume the `.pdf-cache/` PDF fixture exists in CI**: The cache directory is gitignored. Either check in a tiny PDF fixture specifically for CORE-04, or add a pre-test fetch step.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ES module MIME type serving | Custom MIME negotiation | page.route() with explicit contentType | Playwright's route API handles this reliably in tests |
| Web worker detection | CDP protocol hacks / polling | `page.on('worker', ...)` + `worker.url()` | Playwright 1.60 has first-class support; CDP-level is fragile |
| PDF fixture fetching | Custom download script | Reuse existing `.pdf-cache/` or check in a tiny PDF | The cache already exists locally; for CI use a checked-in 50KB fixture |

---

## Runtime State Inventory

This phase is a pure code relocation — no rename/rebrand/migration. The module names (`pdf-parser`, `position-map-builder`, `matching`) do not change; only their filesystem paths change. No runtime state is affected.

**Stored data:** None — these modules emit no stored keys, user_ids, or collection names. [VERIFIED: no ChromaDB, Mem0, or KV writes in these modules]
**Live service config:** None — no external service configuration references these file paths. [VERIFIED: worker/src/ and offscreen config do not reference the src/ directory paths]
**OS-registered state:** None. [VERIFIED: no task scheduler, pm2, or systemd references]
**Secrets/env vars:** None — no secret names change. [VERIFIED]
**Build artifacts:** `dist/` is regenerated on every `npm run build`. No stale artifacts concern. [VERIFIED: build.js does `fs.rmSync('dist', ...)` before each build]

---

## Common Pitfalls

### Pitfall 1: position-map-builder.test.js imports from the old path

**What goes wrong:** `tests/unit/position-map-builder.test.js` line 15 imports from `../../src/offscreen/position-map-builder.js`. After the file is moved to `src/shared/`, this import either (a) fails if the old file is deleted, or (b) silently succeeds via re-export shim but tests the shim not the source.

**Why it happens:** The test was written before the relocation decision.

**How to avoid:** Update the import in the test file to `../../src/shared/position-map-builder.js`. If using re-export shims, still update the test to import from `src/shared/` directly for clarity.

**Warning signs:** The test runs but the coverage report shows `src/offscreen/position-map-builder.js` (shim) instead of `src/shared/position-map-builder.js`.

### Pitfall 2: The `../lib/pdf.mjs` import path changes after relocation

**What goes wrong:** `src/offscreen/pdf-parser.js` imports `'../lib/pdf.mjs'`. After moving to `src/shared/pdf-parser.js`, the relative path `../lib/pdf.mjs` points to `src/lib/pdf.mjs` — SAME as before, because both `src/offscreen/` and `src/shared/` are at the same directory depth relative to `src/`. [VERIFIED: directory structure confirmed]

**Why it matters:** This pitfall does NOT apply here — the paths happen to be equivalent. However, the esbuild `external: ['../lib/pdf.mjs']` declaration in `getEsmConfig` and `getFirefoxEsmConfig` references the relative path from the *entry point file*, not from `pdf-parser.js`. Since the entry points (`offscreen.js`, `pdf-pipeline.js`) are what esbuild starts from, and the external rule is applied at the bundle level, moving `pdf-parser.js` does NOT affect the `external` rule. [VERIFIED: scripts/build.js lines 99, 192]

**How to avoid:** Double-check the `import` path in the new `src/shared/pdf-parser.js` immediately after moving. The path `'../lib/pdf.mjs'` remains correct.

### Pitfall 3: CORE-04 test — PDF.js worker fallback masks the test

**What goes wrong:** If `configurePdfWorker()` is not called (or called with an empty URL) before `extractTextFromPdf()`, PDF.js silently falls back to main-thread parsing. The `extractTextFromPdf()` call succeeds, but no WebWorker is spawned, so `workers.some(url => url.includes('pdf.worker.mjs'))` is `false` and the assertion fails — but this is the correct failure. The risk is the opposite: if the test doesn't call `configurePdfWorker` at all, the worker assertion fails but the pipeline still "works" (via main-thread fallback), making the test result confusing.

**Why it happens:** The old module-scope assignment was implicit — callers didn't need to do anything. The new seam requires explicit setup.

**How to avoid:** The harness HTML MUST call `configurePdfWorker('/src/lib/pdf.worker.mjs')` BEFORE calling `extractTextFromPdf()`. The test should verify BOTH that the result is valid AND that the worker was spawned.

### Pitfall 4: CORE-04 test — PDF.js imports require `src/lib/pdf.mjs` which is a relative path

**What goes wrong:** `src/shared/pdf-parser.js` imports from `'../lib/pdf.mjs'`. When served via the test HTTP server (or page.route()), the browser resolves this relative path relative to the URL of `pdf-parser.js`. If `pdf-parser.js` is served at `http://test.local/src/shared/pdf-parser.js`, then `../lib/pdf.mjs` resolves to `http://test.local/src/lib/pdf.mjs` — which the server/route must also handle.

**How to avoid:** Ensure the HTTP server / page.route() handler serves ALL files under `src/`, not just `src/shared/`. The route handler must handle `src/lib/pdf.mjs`, `src/lib/pdf.worker.mjs`, and all `src/shared/*.js` files.

### Pitfall 5: `page.on('worker')` may fire before the test listener is registered

**What goes wrong:** PDF.js spawns its worker during `getDocument()` call, which happens inside `extractTextFromPdf()`. If the test registers `page.on('worker')` AFTER navigating to the page, the worker may already have been spawned (if the page starts the pipeline immediately).

**How to avoid:** Register `page.on('worker')` BEFORE `page.goto()`. The harness HTML should wait for a user trigger (e.g. `window.__startPipeline()` called from the test via `page.evaluate()`), allowing the test to register the listener first. Or: collect workers via `page.on('worker', ...)` registered before navigation, then call a trigger. [ASSUMED — standard Playwright event-before-action discipline]

### Pitfall 6: `matching.js` re-export shim vs direct source — vitest baseline impact

**What goes wrong:** CORE-03 requires `baseline.json` to be byte-identical. The corpus test (`text-matcher.test.js`) imports from `src/shared/matching.js` DIRECTLY (not via a shim). The vitest chrome/firefox configs alias this to `dist/{chrome,firefox}/matching-exports.js`. If moving `position-map-builder.js` to `src/shared/` somehow introduces a mismatch (e.g., the matching algorithm is accidentally changed during the copy), the baseline assertion fails.

**Why it happens:** Copy-paste error during relocation.

**How to avoid:** Use `cp` to copy the file verbatim; do not retype. Run `npm run test:src` immediately after the move to confirm no baseline regression before proceeding to CORE-04.

---

## Code Examples

### Example 1: Current pdf-parser.js (exact state before modification)

```javascript
// Source: [VERIFIED: src/offscreen/pdf-parser.js — inspected directly]
import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs';

// Line 14 — this is the ONLY line that changes:
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```

### Example 2: New pdf-parser.js after seam introduction

```javascript
// Source: [ASSUMED — pattern based on direct code inspection]
import { getDocument, GlobalWorkerOptions } from '../lib/pdf.mjs';

// No module-scope side effect. Safe to import in any context.

export function configurePdfWorker(url) {
  GlobalWorkerOptions.workerSrc = url;
}

// extractTextFromPdf remains 100% unchanged from lines 49-92
```

### Example 3: offscreen.js — where to add configurePdfWorker call

```javascript
// Source: [VERIFIED: src/offscreen/offscreen.js lines 17-20 — inspected directly]
// BEFORE:
import { extractTextFromPdf } from './pdf-parser.js';
import { buildPositionMap } from './position-map-builder.js';
import { MSG } from '../shared/constants.js';
import { matchAndCite } from '../shared/matching.js';

// AFTER:
import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js';
import { buildPositionMap } from '../shared/position-map-builder.js';
import { MSG } from '../shared/constants.js';
import { matchAndCite } from '../shared/matching.js';

// Added after imports — runs once on offscreen document load:
configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'));
```

### Example 4: pdf-pipeline.js — where to add configurePdfWorker call

```javascript
// Source: [VERIFIED: src/firefox/pdf-pipeline.js lines 16-19 — inspected directly]
// BEFORE:
import { extractTextFromPdf } from '../offscreen/pdf-parser.js';
import { buildPositionMap } from '../offscreen/position-map-builder.js';
import { matchAndCite } from '../shared/matching.js';
import { MSG } from '../shared/constants.js';

// AFTER:
import { extractTextFromPdf, configurePdfWorker } from '../shared/pdf-parser.js';
import { buildPositionMap } from '../shared/position-map-builder.js';
import { matchAndCite } from '../shared/matching.js';
import { MSG } from '../shared/constants.js';

// Added after imports:
configurePdfWorker(chrome.runtime.getURL('lib/pdf.worker.mjs'));
```

### Example 5: Playwright page.on('worker') assertion pattern

```javascript
// Source: [VERIFIED: node_modules/playwright-core/types/types.d.ts line 1179]
// "Emitted when a dedicated WebWorker (MDN) is spawned by the page."

const spawnedWorkerUrls = [];
page.on('worker', worker => spawnedWorkerUrls.push(worker.url()));

// ... trigger pipeline ...

const pdfWorkerFound = spawnedWorkerUrls.some(url => url.includes('pdf.worker.mjs'));
expect(pdfWorkerFound).toBe(true);
```

### Example 6: vitest alias — no change needed for pdf-parser / position-map-builder

```javascript
// Source: [VERIFIED: vitest.config.chrome.js + vitest.config.firefox.js — inspected directly]
// These files alias ONLY src/shared/matching.js to dist/chrome/matching-exports.js
// for the chrome/firefox test suites. NO alias needed for pdf-parser.js or 
// position-map-builder.js because test:chrome and test:firefox do NOT import them.
// The base vitest.config.js (test:src) imports directly from src/ — after moving the
// files to src/shared/, only the test file import path needs updating.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `GlobalWorkerOptions.workerSrc` set at module scope | `configurePdfWorker(url)` injection function | Phase 7 (this phase) | Makes pdf-parser.js safe to import in any JS context |
| `position-map-builder.js` in `src/offscreen/` | `src/shared/position-map-builder.js` | Phase 7 | Both extension and webapp can consume verbatim |
| `pdf-parser.js` in `src/offscreen/` | `src/shared/pdf-parser.js` | Phase 7 | Same |
| No full-pipeline browser integration test | CORE-04 Playwright spec | Phase 7 | Proves shared core works in plain `<script type="module">` context |

**Deprecated/outdated after this phase:**
- `src/offscreen/pdf-parser.js`: either replaced by shim or deleted (old independent implementation must not exist)
- `src/offscreen/position-map-builder.js`: same

---

## Key Research Findings: Import Site Inventory

Complete list of every file that must change in this phase:

### Files Containing Imports to Update

| File | Current Import | New Import | Notes |
|------|---------------|------------|-------|
| `src/offscreen/offscreen.js` line 17 | `'./pdf-parser.js'` | `'../shared/pdf-parser.js'` | Also add configurePdfWorker call |
| `src/offscreen/offscreen.js` line 18 | `'./position-map-builder.js'` | `'../shared/position-map-builder.js'` | [VERIFIED] |
| `src/firefox/pdf-pipeline.js` line 16 | `'../offscreen/pdf-parser.js'` | `'../shared/pdf-parser.js'` | Also add configurePdfWorker call |
| `src/firefox/pdf-pipeline.js` line 17 | `'../offscreen/position-map-builder.js'` | `'../shared/position-map-builder.js'` | [VERIFIED] |
| `tests/unit/position-map-builder.test.js` line 15 | `'../../src/offscreen/position-map-builder.js'` | `'../../src/shared/position-map-builder.js'` | [VERIFIED] |

### Files to Create

| File | Purpose |
|------|---------|
| `src/shared/pdf-parser.js` | Relocated + seam-modified source |
| `src/shared/position-map-builder.js` | Verbatim copy |
| `src/offscreen/pdf-parser.js` (replace) | Re-export shim |
| `src/offscreen/position-map-builder.js` (replace) | Re-export shim |
| `tests/e2e/specs/core-04-pipeline.spec.js` | CORE-04 browser integration test |
| `tests/e2e/fixtures/core04-harness.html` | HTML harness for CORE-04 |

### Files with NO Change Required

| File | Reason |
|------|--------|
| `scripts/build.js` | esbuild bundles from entry points; no alias needed for shared modules; `external: ['../lib/pdf.mjs']` rule unaffected [VERIFIED] |
| `vitest.config.chrome.js` | No import of pdf-parser/position-map-builder in chrome test suite [VERIFIED] |
| `vitest.config.firefox.js` | Same [VERIFIED] |
| `vitest.config.js` | No change needed — after moving files, the direct src/ imports work; only test file path must update [VERIFIED] |
| `src/matching-exports.js` | Exports only matching functions; do not add PDF functions [VERIFIED] |
| `src/shared/matching.js` | Already in correct location; zero changes [VERIFIED] |

---

## Corpus Guard: CORE-03 Specific Notes

**Baseline count:** `tests/golden/baseline.json` has **76 entries** (verified: `python3 -c "import json; d=json.load(open(...)); print(len(d))"` → 76). REQUIREMENTS.md describes "75-case golden corpus" — the actual file has 76. This is not a concern for CORE-03; the baseline passes today with 76 entries, and the requirement is byte-identity after extraction. [VERIFIED: direct count]

**How the corpus test works:**
- `tests/unit/text-matcher.test.js` imports `matchAndCite` from `src/shared/matching.js`
- For each of 76 test cases in `TEST_CASES`, loads a pre-built `tests/fixtures/USXXXXXXX.json` position-map file
- Calls `matchAndCite(selectedText, positionMap)` and compares to `tests/golden/baseline.json`
- **Does NOT call `extractTextFromPdf` or `buildPositionMap`** — uses JSON fixtures directly
- The golden corpus therefore proves only that `matchAndCite` is correct; it does NOT prove that `pdf-parser.js` or `position-map-builder.js` work in any context
- CORE-03 satisfaction: since CORE-03 only involves moving files without changing algorithms, the corpus test passes trivially as long as the relocation is verbatim and the test imports are updated

**What command runs the corpus test:**
```bash
npm run test:src          # runs vitest run — includes text-matcher.test.js
```

**How to guarantee byte-identical baseline:** Run `npm run test:src` before and after the move and confirm all 76 corpus cases pass. The baseline.json file itself is never rewritten by the test (it is read-only in tests); byte-identity is structural, not a file-hash check. [VERIFIED: text-matcher.test.js only reads baseline.json]

---

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json` — this section is present because CORE-04 is explicitly a test strategy concern (not a Nyquist validation gate).

### Test Framework

| Property | Value |
|----------|-------|
| Unit test framework | Vitest ^3.0.0 |
| E2E test framework | Playwright 1.60.0 |
| Vitest config file | `vitest.config.js` (base), `vitest.config.chrome.js`, `vitest.config.firefox.js` |
| Vitest quick run | `npm run test:src` |
| Full suite command | `npm test` (build + test:src + test:chrome + test:firefox + lint + test:lint) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | `position-map-builder.js` in `src/shared/`, tests pass | unit | `npm run test:src -- tests/unit/position-map-builder.test.js` | EXISTS (path update needed) |
| CORE-01 | `matching.js` in `src/shared/` — already satisfied | unit | `npm run test:src` | EXISTS |
| CORE-02 | Import of `pdf-parser.js` in plain JS does not throw | unit (inline) | `npm run test:src` | Wave 0 gap: add smoke test |
| CORE-03 | 76 baseline cases byte-identical | unit corpus | `npm run test:src -- tests/unit/text-matcher.test.js` | EXISTS |
| CORE-04 | Full pipeline in browser, PDF.js in worker thread | Playwright | `playwright test --config tests/e2e/playwright.config.js specs/core-04-pipeline.spec.js` | Wave 0 gap |

### Wave 0 Gaps

- [ ] `tests/e2e/specs/core-04-pipeline.spec.js` — covers CORE-04 (full pipeline + worker thread assertion)
- [ ] `tests/e2e/fixtures/core04-harness.html` — HTML harness for CORE-04
- [ ] CORE-02 import-safety smoke test — a brief Vitest test that confirms `import { configurePdfWorker, extractTextFromPdf } from '../../src/shared/pdf-parser.js'` does not throw when `chrome` global is absent (the existing chrome-stub in vitest setup provides `chrome.runtime.getURL` — it will NOT throw for the seam test; but the test should also verify the module loads without any module-scope call to `chrome`)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build scripts, tests | ✓ | v24.11.1 | — |
| vitest | test:src, test:chrome, test:firefox | ✓ | ^3.0.0 | — |
| @playwright/test | CORE-04 spec | ✓ | 1.60.0 | — |
| chromium (playwright) | CORE-04 spec | ✓ | bundled with playwright | — |
| src/lib/pdf.mjs | pdf-parser.js at runtime | ✓ | vendored | — |
| src/lib/pdf.worker.mjs | configurePdfWorker call | ✓ | vendored (1.07MB) | — |
| tests/e2e/.pdf-cache/US6738932.pdf | CORE-04 PDF fixture | ✓ (local) | 1.2MB | Check in a tiny test PDF at tests/fixtures/core04-fixture.pdf |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `tests/e2e/.pdf-cache/US6738932.pdf` — gitignored, present locally, may be absent in CI cold cache. Fallback: check in a small dedicated fixture PDF (e.g. `tests/fixtures/core04-fixture.pdf`) so CORE-04 runs in CI without network access.

---

## Security Domain

This is a pure refactoring phase — no new network routes, no new auth surfaces, no new input vectors. The `configurePdfWorker(url)` seam takes a URL string and assigns it to `GlobalWorkerOptions.workerSrc`. The only callers are extension contexts (where `chrome.runtime.getURL` is trusted) and later the webapp (Phase 8, where the URL will be a static asset path). No ASVS categories are newly implicated.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `http.createServer` is an acceptable server for CORE-04 OR `page.route()` is viable for serving ES modules | Architecture Patterns (Pattern 4) | If neither works, need a third-party static server (violates zero-dep rule); however page.route() is confirmed in Playwright docs |
| A2 | `page.route()` with `contentType: 'application/javascript'` will satisfy Chromium's ES module MIME check | Pattern 4 + Pitfall 4 | If not, CORE-04 test fails with MIME type error; mitigation: use HTTP server |
| A3 | `configurePdfWorker` called at module scope in offscreen.js (after imports) is equivalent in behavior to the old module-scope assignment | Pattern 2 | If there's a timing gap where `extractTextFromPdf` is called before configurePdfWorker runs, the worker won't start; this is only a risk if the message listener fires instantly at load — confirmed not the case: messages arrive asynchronously after `chrome.runtime.onMessage.addListener` |
| A4 | `US6738932-spec-short` baseline case (`citation: "1:37"`) can be reproduced by calling `matchAndCite('network interface', positionMap)` in the CORE-04 harness | Code Examples | If the passage isn't in that patent, the pipeline assertion needs a different passage; planner should verify against tests/fixtures/US6738932.json or use the baseline.json `selectedText` from test-cases.js |
| A5 | CORE-04 spec can live in `tests/e2e/specs/` alongside existing extension specs without interfering | Architecture | If the existing playwright.config.js `testDir: './specs'` picks up the new spec and it requires the extension, it will fail; mitigate by either (a) using a separate playwright config file for CORE-04, or (b) ensuring CORE-04 spec uses `chromium.launch()` (non-extension) which does not conflict with the extension context |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Table is not empty — A1–A5 need planning awareness.)

---

## Open Questions

1. **CORE-04 PDF fixture in CI**
   - What we know: `tests/e2e/.pdf-cache/US6738932.pdf` is gitignored and present locally
   - What's unclear: Whether CI has internet access to fetch it on demand; the `pdf-snippet.smoke.test.js` uses `SKIP_LIVE_E2E=1` to skip in sandboxes
   - Recommendation: Check in a minimal 2-3 page test PDF at `tests/fixtures/core04-fixture.pdf` (not gitignored). US6738932 is 1.2MB — acceptable for a repo fixture. Or the planner can re-use the existing `.pdf-cache` directory and add a CI download step.

2. **CORE-04 spec integration with existing playwright config**
   - What we know: `tests/e2e/playwright.config.js` `testDir: './specs'` will automatically include the new `core-04-pipeline.spec.js`
   - What's unclear: The CORE-04 spec uses `chromium.launch()` (not loadExtension), so it's independent. However, `npm run e2e:regression` runs a different command scope — CORE-04 may need its own npm script.
   - Recommendation: Add a `"test:core04"` npm script: `playwright test --config tests/e2e/playwright.config.js specs/core-04-pipeline.spec.js`

3. **Re-export shim vs hard deletion for the old offscreen files**
   - What we know: CONTEXT.md says either is acceptable; matching.js was handled by deleting the old path
   - What's unclear: Whether any tooling or CI script references `src/offscreen/pdf-parser.js` by path
   - Recommendation: Use re-export shims initially (safer); they can be deleted in Phase 9 cleanup if no references remain. The corpus test's position-map-builder import should be explicitly updated to `src/shared/` regardless.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/offscreen/pdf-parser.js`, `src/offscreen/offscreen.js`, `src/firefox/pdf-pipeline.js`, `src/shared/matching.js`, `scripts/build.js`, `vitest.config.chrome.js`, `vitest.config.firefox.js`, `tests/unit/text-matcher.test.js`, `tests/unit/position-map-builder.test.js`
- `node_modules/playwright-core/types/types.d.ts` — confirmed `page.on('worker')` fires for dedicated WebWorker (line 1179 comment: "Emitted when a dedicated WebWorker is spawned by the page"), `worker.url()` method at line 10833, `page.workers()` at line 5230
- `tests/golden/baseline.json` — 76 entries confirmed via Python count
- `.planning/config.json` — `workflow.nyquist_validation: false` confirmed
- `package.json` — `@playwright/test: 1.60.0`, `vitest: ^3.0.0`, `pdfjs-dist: ^5.5.207` confirmed

### Secondary (MEDIUM confidence)

- Chromium ES module MIME enforcement — standard browser behavior, confirmed by MDN documentation and widespread practice (not verified against this specific Playwright version but universally applicable)

### Tertiary (LOW confidence)

- `page.route()` with `application/javascript` MIME satisfying Chromium's module MIME check — highly likely based on standard browser behavior and Playwright documentation, but not verified with a running test in this codebase

---

## Metadata

**Confidence breakdown:**
- Import site inventory: HIGH — directly read every affected file
- configurePdfWorker seam pattern: HIGH — exact line number confirmed (line 14), exact callers confirmed
- Corpus guard (CORE-03): HIGH — baseline entry count verified, test mechanics fully understood
- CORE-04 browser integration test: MEDIUM-HIGH — Playwright API confirmed in types.d.ts; HTTP server / page.route() approach architecturally sound but not validated with a running test
- esbuild / vitest alias impact: HIGH — confirmed no new aliases needed

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable stack; all libraries confirmed installed)

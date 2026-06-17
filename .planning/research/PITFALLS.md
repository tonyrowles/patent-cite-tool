# Domain Pitfalls

**Domain:** v6.0 Standalone Citation Webapp — adding a public client-side PDF.js webapp on tonyrowles.com to an existing cross-browser extension + Cloudflare Worker system, extracting a shared deterministic core
**Researched:** 2026-06-16
**Confidence:** HIGH for Pitfalls 1–3, 5–6, 10 (direct code reads + verified architecture); MEDIUM for Pitfalls 4, 7–9 (architecture-reasoned from observed code + PDF.js documentation patterns)

> **Scope note:** Every pitfall here is specific to adding THIS webapp to THIS codebase. Generic web-app advice is excluded. The Worker source, pdf-parser.js, matching.js, position-map-builder.js, offscreen.js, and wrangler.toml were all read directly before writing this document.

---

## Critical Pitfalls

### Pitfall 1 (BLOCKING GATE): PROXY_TOKEN is already in the published extension bundle — the webapp must never embed it client-side

**What goes wrong:**

`src/offscreen/offscreen.js` line 24 contains the token as a plain string literal:

```
const PROXY_TOKEN = '4509b9943f831fb140eb0c3a7304f23cc6f72e41b5e5f8c800a42e94f09cadbe';
```

This string ships in the Chrome and Firefox extension bundles. Anyone who has downloaded those bundles — from the Chrome Web Store, from Firefox AMO, or from the GitHub Releases artifacts — already has the token. It must be treated as fully compromised regardless of whether it has been visibly abused.

The webapp scenario makes this catastrophically worse: if the webapp JavaScript embeds the same token (or any replacement token) as a literal string, it is instantly extractable from browser DevTools > Sources, `view-source:`, `curl`, or the Cloudflare Worker's own CORS-exposed response. Unlike the extension bundle which requires deliberate extraction, a plain web page's JavaScript is trivially readable.

The Worker uses this token as the sole authentication mechanism for ALL routes: the USPTO PDF proxy (`GET /?patent=`), the KV position-map cache (`GET /cache`, `POST /cache`), and the bug-report route (`POST /report`). A stolen replacement token gives an attacker:
- Free unlimited USPTO PDF proxy access (Cloudflare Worker request quota exhaustion)
- Ability to poison the shared KV position-map cache with corrupt data that causes wrong citations for all extension users
- Ability to spam the `/report` Discord webhook endpoint

**Why it happens:**

The token was designed for an extension context where the bundle is slightly obscured and the user base is trusted professionals. The extension model — where secrets live in the bundle — is a recognized extension-architecture tradeoff that's acceptable for browser extensions. It is categorically NOT acceptable for public web page JavaScript. Teams routinely port extension code to web pages without re-evaluating the trust model, carrying the secret along.

**How to avoid:**

The fix requires two coordinated changes before any webapp code touches the network:

1. **Rotate the token.** Generate a new secret via `openssl rand -hex 32` or similar. Update it in the Cloudflare Worker via `wrangler secret put PROXY_TOKEN`. The Worker already reads it from `env.PROXY_TOKEN` (confirmed in worker/src/index.js line 526) — no Worker code change required. Deploy the Worker with the new secret.

2. **Move the token server-side for webapp requests.** The webapp must NOT send `Authorization: Bearer <token>` from the browser. Instead, the Cloudflare Worker must distinguish webapp requests from extension requests and apply different auth:
   - **Option A (recommended):** The webapp calls a new Worker route (e.g., `GET /webapp/cache` or `GET /proxy`) with NO auth token. The Worker enforces rate limiting (IP-based, `CF-Connecting-IP`) instead of token auth for the public route, and calls the upstream USPTO API internally with its own API key. The Bearer token gate is retained for extension-only routes.
   - **Option B:** A separate Cloudflare Worker or Pages Function sits in front of tonyrowles.com and proxies to `pct.tonyrowles.com` with the token injected server-side. The webapp calls `https://tonyrowles.com/api/cite` (or similar) — the token never reaches the browser.

3. **Verify the old token is dead.** After rotation, the extension needs to ship with the new token before the old one is invalidated (or simultaneous rotation with a brief overlap window). The extension currently hardcodes the token; in v6.0 this also needs addressing (move to a build-time injected environment variable or continue hardcoding the new token knowing it's still obscured).

**Warning signs:**
- Any webapp JS file that contains `Authorization: Bearer` with a literal token string
- A PR that passes `PROXY_TOKEN` as a build-time variable to a frontend Vite/esbuild config (it will appear in the built bundle)
- DevTools network inspector showing the webapp sending an `Authorization` header directly to `pct.tonyrowles.com`
- Worker routes that return data to the webapp without any per-request rate limiting

**Phase to address:** Phase 1 (BLOCKING — must be complete before any public webapp code can call the Worker). No other work should proceed until token rotation is done and the webapp's access path is auth-redesigned.

---

### Pitfall 2 (BLOCKING GATE): Public Worker exposure without per-request rate limiting creates KV write-quota abuse and USPTO proxy abuse

**What goes wrong:**

The existing Worker has exactly one protection on the USPTO proxy and KV cache routes: the Bearer token. Once the webapp goes public without a token (Pitfall 1 mandates this), those routes are reachable by anyone who knows the URL. The current rate limiting (5 req/60s IP-keyed in `checkIpRateLimit`) exists ONLY on the `/report` route — not on `GET /?patent=` (USPTO proxy) or `GET /cache` + `POST /cache` (KV cache).

Confirmed by reading worker/src/index.js: after the Bearer check passes, route dispatch goes directly to KV or USPTO — no rate limiting anywhere on the proxy or cache paths.

Cloudflare free-tier hard limits (from previous research, confirmed still applicable):
- Worker requests: 100,000/day
- KV reads: 100,000/day
- KV writes: 1,000/day

The 1,000 KV writes/day limit is the critical constraint. Every time a user parses a patent PDF that isn't already in the KV cache, the webapp will call `POST /cache` to store the position map. With a public user base (even modest traffic of a few hundred users/day), this quota fills within hours, breaking the cache upload for all extension users too.

The USPTO proxy route (`GET /?patent=`) has no quota on the Worker side, but the USPTO API itself may throttle requests without the API key being rate-limited. More critically, 100K Worker requests/day sounds large but can be consumed by a simple crawler that iterates patent numbers.

**Why it happens:**

Teams add a "public webapp reusing the existing Worker" and assume the Worker's Bearer token was the only protection needed. They rotate the token as Pitfall 1 requires, create an unauthenticated public route, and don't realize that rate limiting was NOT on the existing routes.

**How to avoid:**

Before opening any webapp route, add IP-keyed rate limiting on the Worker for all routes the webapp will call. The pattern already exists in `checkIpRateLimit()` — replicate it:

- **USPTO proxy route:** max 10 requests/minute/IP (a user looking up 10 patents per minute is unusually active; 60/hour is more than enough for a legitimate session)
- **KV cache GET route:** max 60/minute/IP (reads are cheap but should not be unbounded)
- **KV cache POST route:** max 5/minute/IP (position map uploads are expensive; this is also the critical quota-protect gate). Add a secondary global counter — if total KV writes today exceed 800 (checked from a KV meta key), return 503 to the webapp's upload path to protect the extension's upload quota

Additionally, consider separate KV namespaces: one for extension-only writes, one for webapp-contributed position maps. Cloudflare KV quota is per-account, not per-namespace, so this doesn't solve the quota problem — but it gives visibility into which surface is consuming writes.

**Warning signs:**
- KV writes exhausted before end of day (visible in Cloudflare dashboard analytics)
- Worker invocations spike after webapp goes public
- The `/cache` POST route returns 201 for webapp requests with no rate check

**Phase to address:** Phase 1 (same phase as Pitfall 1 — both are blocking security gates before any public exposure).

---

### Pitfall 3: Shared-core extraction accidentally changes matching behavior by introducing import indirection or module scope changes

**What goes wrong:**

The shared core (`src/shared/matching.js`, `src/offscreen/pdf-parser.js`, `src/offscreen/position-map-builder.js`) currently runs in two contexts with subtle differences:

- **Chrome:** offscreen document (`offscreen.js`) — ES module, runs with `chrome.runtime.getURL()` available, PDF.js worker URL resolved via `chrome.runtime.getURL('lib/pdf.worker.mjs')`
- **Firefox:** background script — same shared modules, but `chrome.runtime.getURL()` resolves differently

The extraction step creates a third context: the webapp (plain browser page, no `chrome.*` APIs). If the extraction is done naively — copying files into a `packages/core/` directory without changing them — `pdf-parser.js` will crash at the line:

```js
GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs');
```

This line is at module scope (top-level, executed on import), not inside a function. In a plain web page, `chrome` is undefined. The import itself throws before any function is called.

The matching functions (`matching.js`) and position map builder (`position-map-builder.js`) are zero-dependency pure functions — they have no `chrome.*` references and extract cleanly. But `pdf-parser.js` has a module-scope side effect that is context-specific. The extraction plan must NOT treat these three files as uniformly portable.

A second, subtler risk: the 75-case golden corpus (`tests/test-cases.js`, `tests/golden/baseline.json`) runs the matching logic through Vitest with fixture-based position maps — it does NOT run the PDF parsing pipeline. If the extraction refactors the way `buildConcat`, `normalizeText`, or `matchAndCite` receive their inputs (e.g., by wrapping them in a class, changing parameter order, or adding default parameters), the existing Vitest tests can still pass while the webapp's code path diverges. The 75-case corpus proves correctness of the matching algorithm given a position map — it does NOT prove that the PDF parsing pipeline produces the same position maps when run in a plain web page context.

**Why it happens:**

Developers see three files that look like pure logic and move them wholesale into a shared package. They run `npm test` and see 206/206 passing and declare the extraction done. The corpus does not exercise the PDF → position map pipeline end-to-end with the exact PDF.js API surface exposed by a plain browser `<script type="module">` context.

**How to avoid:**

1. **Extract in two separate steps:**
   - Step A: Extract `matching.js` and `position-map-builder.js` (pure, no `chrome.*`) into the shared package. Run the full 75-case corpus on both the extension build AND the shared package. Both must pass identically.
   - Step B: Create a new `pdf-parser-web.js` (or make the `chrome.runtime.getURL` call conditional) for the webapp context. Do NOT modify `pdf-parser.js` in a way that changes its behavior in the extension context.

2. **The workerSrc line must be injectable, not module-scope.** Refactor `pdf-parser.js` so that `GlobalWorkerOptions.workerSrc` is set inside `extractTextFromPdf()` or via an explicit `configurePdfWorker(url)` initialization call, not at module load time. Both the extension (using `chrome.runtime.getURL(...)`) and the webapp (using a CDN URL or bundled URL) can call this initializer with the appropriate URL.

3. **Add an end-to-end integration test for the webapp path:** parse one real patent PDF fixture through the full pipeline (PDF bytes → `extractTextFromPdf` → `buildPositionMap` → `matchAndCite`) in the webapp context. This test must produce the same position map structure as the extension path. Without this test, the 75-case corpus only proves the matching half.

4. **Vitest alias config pattern (already used):** the existing `per-target vitest alias configs` redirect `src/shared` imports to `dist/` bundles. Use the same pattern for the webapp package: run the corpus against the package's dist output, not its source.

**Warning signs:**
- The extraction PR modifies `matching.js` in any way (even formatting) without a full 75-case baseline re-run pinned against the ORIGINAL baseline snapshot
- `pdf-parser.js` retains `chrome.runtime.getURL` at module scope without a conditional guard
- The webapp parses a test PDF and the position map has a different number of entries than the extension's parse of the same PDF
- Any PR that changes the function signatures in `matching.js` (parameter names, defaults, order) without corresponding Vitest test updates

**Phase to address:** Phase 1 (core extraction). The extraction is the foundational phase — all other phases build on it. The golden corpus must be pinned and validated on BOTH surfaces before any webapp-specific code is written.

---

### Pitfall 4: PDF.js worker URL configuration fails silently in the webapp, falling back to main-thread parsing

**What goes wrong:**

`pdf-parser.js` sets `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')`. In a plain web page, there is no `chrome.runtime.getURL` — the webapp must configure the worker URL differently.

PDF.js v5 (which this project uses, pinned at `pdfjs-dist@5.5.207`) supports four worker initialization modes:
1. `GlobalWorkerOptions.workerSrc = '<url>'` — loads the worker from a URL
2. `GlobalWorkerOptions.workerSrc` pointing to a CDN URL (e.g., `unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.mjs`)
3. Bundler-injected URL via `new URL('./pdf.worker.mjs', import.meta.url)` in Vite/esbuild
4. Setting `workerSrc = ''` or omitting it — falls back to fake-worker (main-thread parsing)

Mode 4 (the fallback) silently works but runs the worker on the main thread, blocking the UI during parsing. A 5-30 MB patent PDF takes 2-10 seconds to parse. On the main thread, the page freezes for this duration — no progress indicator, no abort, the browser may show a "page unresponsive" warning.

The silent fallback is the trap: PDF.js does not throw when it falls back to main-thread. The parsing still works. The webapp appears to function correctly in testing. The freeze only surfaces on real 5-30 MB PDFs in a production environment, and only when the worker URL is wrong. Teams test with small PDFs and miss this.

**Why it happens:**

When porting `pdf-parser.js` to the webapp, the developer replaces `chrome.runtime.getURL('lib/pdf.worker.mjs')` with something that looks like it should work (a relative path, a mistyped CDN URL, an incorrect `import.meta.url` construction) and doesn't verify the worker loaded as a separate thread.

**How to avoid:**

1. **Verify the worker loaded as a separate thread** during development: Chrome DevTools > Sources > Threads panel should show a `pdf.worker.mjs` thread when parsing is active. If only the main thread is running, the fallback is in effect.

2. **For the webapp, use the `new URL` pattern with esbuild/a bundler OR an explicit CDN pin:**
   ```js
   // esbuild with --bundle treats new URL(..., import.meta.url) as an asset reference
   GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
   // OR explicit CDN (version-pinned to match the installed package):
   GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.mjs';
   ```

3. **No-zero-dep tension:** this project has a strong zero-new-npm-dependency culture. Using `pdfjs-dist` is not a new dependency (it's already installed). The worker URL configuration is a build/deployment concern, not a library dependency. CDN URL option avoids any bundler change.

4. **Add a startup assertion** in the webapp's PDF parsing initialization: if `GlobalWorkerOptions.workerSrc` is empty or undefined after initialization, throw or warn visibly. Do not silently allow main-thread fallback in production.

**Warning signs:**
- Chrome DevTools network tab shows `pdf.worker.mjs` returning a 404 during PDF parsing
- Chrome DevTools threads panel only shows the main thread during parsing (no worker thread)
- The UI freezes for several seconds during patent PDF parsing in the webapp
- `GlobalWorkerOptions.workerSrc` is set to a relative path like `'./pdf.worker.mjs'` in a file where `import.meta.url` is not available

**Phase to address:** Phase 2 (webapp PDF parsing integration). Must be verified with a real 10+ MB patent PDF, not a small test fixture.

---

### Pitfall 5: Google Patents PDF URLs are blocked by CORS in a plain web page — the Worker proxy path is mandatory

**What goes wrong:**

In the extension, `fetchPdfWithRetry()` in `offscreen.js` calls `fetch(pdfUrl)` where `pdfUrl` is a Google Patents storage URL like `https://patentimages.storage.googleapis.com/...`. This works because extension offscreen documents and background scripts are not subject to CORS — they make cross-origin requests freely using `host_permissions`.

In a plain web page on `tonyrowles.com`, the same `fetch(pdfUrl)` call will fail with:

```
Access to fetch at 'https://patentimages.storage.googleapis.com/...' from origin
'https://tonyrowles.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin'
header is present on the requested resource.
```

Confirmed by checking: Google Patents storage (`patentimages.storage.googleapis.com`) does not send CORS headers permitting third-party origins. The response is opaque. `fetch()` with `mode: 'no-cors'` returns an opaque response whose body cannot be read — the PDF bytes are inaccessible.

This means the webapp's primary PDF source (the Google Patents link that the extension reads from the DOM) is unavailable. The webapp has no equivalent of the Google Patents DOM context to read the link from — it operates from a standalone page. The webapp flow must go through the Worker proxy exclusively:

**webapp PDF flow:** user enters patent number → webapp calls Worker USPTO proxy (`GET /?patent=US...`) → Worker fetches from USPTO ODP → streams PDF to webapp → webapp parses with PDF.js

There is NO direct Google Patents PDF path for the webapp. The Worker is not optional.

**Why it happens:**

Developers familiar with the extension's unconstrained fetch model assume the same URLs work in a web page. The extension context is uniquely privileged — it's easy to forget that `host_permissions` is what grants that privilege, and web pages don't have the equivalent.

**How to avoid:**

1. **Document and enforce the single path:** the webapp only ever fetches PDFs from the Worker proxy. There is no fallback to direct Google Patents URL fetching. Remove any code that attempts `fetch(googlePatentsPdfUrl)` from the webapp context.

2. **The Worker already supports this path** for granted patents via `fetchEgrantPdf()` in worker/src/index.js. The webapp flow is the same as the extension's USPTO fallback path. The existing Worker code is sufficient — no new Worker routes are needed for PDF fetching (only auth changes from Pitfall 1 apply).

3. **Published applications are out of scope for v1** — this is correctly documented in PROJECT.md. The webapp's published-application limitation is NOT a workaround for CORS — it's a genuine architectural constraint: the extension's published-application citation uses a DOM TreeWalker on `patents.google.com`, which the webapp cannot replicate. Attempting to add published-application support to the webapp without this DOM context is a scope-creep trap (see Pitfall 8).

**Warning signs:**
- The webapp's fetch code includes a condition that tries `patentimages.storage.googleapis.com` URLs
- Network tab shows CORS errors for Google Patents storage URLs from the webapp origin
- The webapp attempts to use `mode: 'no-cors'` for PDF fetching (opaque response — PDF bytes unreadable)
- Any PR that adds `https://patentimages.storage.googleapis.com/*` to any CORS allow-list on the Worker

**Phase to address:** Phase 2 (webapp network integration). The PDF fetch path must go through the Worker from the first line of webapp network code.

---

### Pitfall 6: Large PDF memory and CPU pressure on the main thread — no offscreen isolation in the webapp

**What goes wrong:**

In the Chrome extension, PDF.js runs in an offscreen document — a separate renderer process (technically: a hidden, non-visible document context) that is isolated from the page UI thread. In Firefox, it runs in the background script context. In both cases, the parsing is NOT on the main UI thread; it cannot freeze the user interface.

In the webapp, PDF.js runs in the browser main thread (or a web worker if properly configured — see Pitfall 4). Patent PDFs are 5-30 MB. Parsing a 30 MB patent PDF with PDF.js requires:
- Reading the ArrayBuffer into memory (30 MB)
- PDF.js internal parsing structures (roughly 2-3x the PDF size during peak)
- Text content extraction per page (adding another buffer)
- Total peak memory: ~100-200 MB for a large patent

On mobile or low-memory devices, this triggers GC pressure, jank, or an OOM tab kill. On all devices, if the PDF.js worker is not running in a separate thread (Pitfall 4), the entire UI freezes during parsing.

Additionally, the current `extractTextFromPdf()` in `pdf-parser.js` does a full sequential page-by-page extraction:
```js
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const textContent = await page.getTextContent();
  ...
}
```

A 100-page patent runs through 100 sequential async page fetches + text extractions. In the extension's offscreen document, the user doesn't see any UI freeze. In the webapp, even with a worker thread, the long total parse time (5-20 seconds for large patents) needs explicit UX feedback — progress bar, cancel button, or at minimum a spinner. Without this, users will assume the page is broken and reload.

**Why it happens:**

The extension architecture naturally solves this via offscreen isolation. When the code is ported to the webapp, the isolation evaporates but the parsing logic is unchanged. Testing with small PDFs (the golden corpus fixtures are test-sized, not 30 MB) misses the production case.

**How to avoid:**

1. **Web Worker isolation is mandatory, not optional.** Pitfall 4's prevention (correct `workerSrc`) is a prerequisite. Validate with a real large patent PDF (e.g., US6324676 — the OCR-heavy patent already in the golden corpus) to confirm parsing does not block the UI.

2. **Progress feedback for long parses.** Expose a `onProgress` callback or event from the PDF parsing layer. PDF.js provides `loadingTask.onProgress` for the overall load and per-page callbacks. A simple page counter ("Parsing page 23 of 87...") is sufficient. The alternative — showing a spinner with no progress — causes users to abandon the tab on large patents.

3. **Size gate with user warning.** If the PDF exceeds a threshold (e.g., 25 MB), warn the user before fetching: "This patent's PDF is large (30 MB) and may take 10-20 seconds to parse." A size check from the Worker's HTTP response headers (`Content-Length`) before the ArrayBuffer is read allows an early warning.

4. **Explicit memory cleanup.** The existing `pdf-parser.js` calls `pdf.destroy()` at the end of `extractTextFromPdf()` — this releases PDF.js's internal memory. Ensure this is retained in the webapp path and that the ArrayBuffer itself is not held in module scope after parsing.

**Warning signs:**
- The webapp stalls silently for 10+ seconds on a large patent with no UI feedback
- Browser memory usage spike to 200+ MB during parsing
- The tab crashes on mobile devices for large patents
- `pdf.destroy()` is missing from the webapp's parsing code path

**Phase to address:** Phase 2 (webapp PDF parsing). Large-PDF testing must be a DoD criterion for this phase.

---

### Pitfall 7: Scope-creep — inadvertently re-implementing matching logic in the webapp instead of importing the extracted core

**What goes wrong:**

The webapp needs to run `matchAndCite()` on the position map produced by PDF parsing. If the shared-core extraction (Pitfall 3) is not completed first, the webapp developer will face a choice: wait for the extraction, or copy `matching.js` into the webapp. The copy path is extremely tempting — it's one file, clearly pure, no dependencies.

Once copied, the webapp has its own copy of `matchAndCite()`. Within the same milestone, someone fixes a bug in the extension's `matching.js`. The webapp's copy is not updated. The golden corpus still passes on the extension build. But the webapp silently has stale matching logic, and the divergence is invisible until a specific case fails differently on the two surfaces.

This is the matching-logic drift failure mode. It's distinct from Pitfall 3 (which is about the extraction process itself) — this is about the ongoing maintenance trap that follows if the extraction is done wrong.

A related variant: the webapp implements its own citation formatting (`"4:5-20"`) rather than calling `formatCitation()` from `matching.js`. The formats diverge when someone adds configurable citation format options in a later milestone. The webapp user gets a different format than the extension user for the same patent passage.

**Why it happens:**

Shared package extraction adds setup overhead (workspace configuration, package.json entries, import path changes). Under time pressure, a copy feels faster. The copy "works" immediately. The divergence is invisible until regression.

**How to avoid:**

1. **The shared package must be a hard prerequisite, not a soft dependency.** Phase ordering must enforce: core extraction phase completes and both the extension AND webapp tests pass against the SAME package before any webapp-specific matching code is written. The roadmap phase gating should make it impossible to skip.

2. **ESLint rule or import guard:** add an ESLint rule to the webapp build that forbids importing from `../../src/shared/matching.js` (the extension source path) — the webapp must import from the shared package only. This prevents accidental direct-path imports that bypass the package boundary.

3. **Canary test:** add a test that runs the same text selection through both the extension's `matchAndCite` (via the Vitest harness) and the webapp's imported `matchAndCite` against the same position map fixture, and asserts identical output. This test fails immediately if the two diverge.

4. **`formatCitation` is part of the shared contract.** Ensure it's exported from the shared package and used by the webapp's citation display code. Do not reimplement it.

**Warning signs:**
- The webapp imports from a relative path into `src/shared/` instead of from a package path
- A webapp test fixture's `matchAndCite` output differs from the extension's baseline for the same input
- The webapp's citation format string differs from the extension's for the same `startEntry`/`endEntry` values
- Any PR that adds `matching.js` or `formatCitation` as inline functions in webapp-specific files

**Phase to address:** Phase 1 (core extraction) and Phase 3 (webapp core integration). Phase 1 creates the shared package; Phase 3 validates that the webapp uses it exclusively.

---

### Pitfall 8: Published-application scope creep — no PDF column/line scheme means silent wrong citations, not clean errors

**What goes wrong:**

The extension handles published applications (US application numbers, typically `20XXXXXXXXX`) via DOM-based citation: the content script's TreeWalker scans the Google Patents page DOM for `[0042]`-style paragraph markers. This path never fetches a PDF. The offscreen/background PDF parsing path is only triggered for granted patents.

The webapp has no access to the Google Patents DOM. When a user enters a published application number (e.g., `US20210123456A1`), the webapp will:
1. Call the Worker USPTO proxy with the publication number
2. The Worker's `fetchEgrantPdf()` looks for `EGRANT.PDF` in the USPTO ODP document list
3. Published applications do NOT have `EGRANT.PDF` — only issued grants have it
4. The ODP search succeeds (finding the application record) but `documentBag.find(doc => code === 'EGRANT.PDF' || ...)` returns `undefined`
5. Worker throws: `"EGRANT.PDF not found in file wrapper for application {appNumber}"`

This is actually the correct behavior — the Worker errors out. But the risk is that someone "fixes" this by attempting to use the published application PDF (which does exist in ODP under a different document code, e.g., `WIPP.PDF`). Published application PDFs do NOT use the two-column column:line scheme. They use single-column text with paragraph numbers in the margin. Running `buildPositionMap()` on a published application PDF produces either empty results (no two-column pages detected) or garbage column/line numbers that look plausible but are wrong.

The scope-creep trap: the webapp "works" for published applications if you just change the document code lookup in the Worker — but the position map it generates is meaningless for citation purposes, and the match will produce wrong column:line numbers that look like real citations. This is worse than an error.

**Why it happens:**

A user enters a published application number. The webapp returns an error. The developer sees the error and thinks "I should handle this case." They look at the Worker code and see that published application PDFs exist in ODP. They modify the Worker to fetch the application PDF. The PDF.js parsing runs. `buildPositionMap` returns some entries. `matchAndCite` finds a match. The citation looks like `3:47-51`. The developer ships it. The citation is wrong.

**How to avoid:**

1. **Detect application numbers at the input stage** and show a clear, explicit "Not supported" message: "Published applications are not supported in this tool. For paragraph citations, use the browser extension on patents.google.com."

2. **Validate in the Worker too:** if the patent number format matches a publication number pattern (`/^US\d{11}A[12]$/i` or similar), return HTTP 400 with `"Published applications are not supported. Granted patents only."` before any ODP lookup. This is defense-in-depth — if the webapp validation fails, the Worker rejects it.

3. **Do NOT attempt to parse published application PDFs** for column:line citations, even if the PDF exists. The `buildPositionMap()` function's `isTwoColumnPage` + `extractPrintedColumnNumbers` heuristics are tuned for granted-patent PDFs. They will either return empty results or produce plausible-looking but incorrect column/line assignments.

4. **Lock this decision in Phase 2** as a design constraint, not a "nice to have." The v6.0 milestone explicitly scopes to granted patents only. Any PR that modifies the Worker document-code lookup to handle application numbers should be rejected at review.

**Warning signs:**
- A PR that adds `WIPP.PDF` or `APP.PDF` (or similar application PDF document codes) to the Worker's `fetchEgrantPdf()` find conditions
- The webapp accepts an `A1` or `A2` kind-code number without a "not supported" message
- A test that passes a published application fixture through `buildPositionMap()` and accepts any non-empty result as correct

**Phase to address:** Phase 2 (webapp input validation) and Worker guard. Input validation must be in Phase 2; Worker-side guard should be added in Phase 1 alongside the auth redesign.

---

### Pitfall 9: KV cache poisoning from the webapp — webapp-parsed position maps are stored alongside extension-parsed maps with no provenance tracking

**What goes wrong:**

The existing Worker `POST /cache` route stores position maps submitted by extension users. The existence-check write-protection (`if (existing !== null) return "Already cached"`) means the FIRST writer wins for any given patent+version key.

When the webapp goes public, it also calls `POST /cache` after parsing a patent PDF. The webapp runs PDF.js v5.5.207 in a plain browser context; the extension runs the same version in an offscreen document context. In practice, the two should produce identical position maps for the same PDF — but there is a subtle difference: the webapp's PDF.js worker runs in a true Web Worker thread, while the extension's runs in the offscreen document's worker URL context.

If there is ANY difference in how PDF.js resolves font data, text extraction ordering, or item boundary splitting between these two contexts (possible in edge cases with complex fonts or Type3 fonts), the first webapp user to parse a patent could store a subtly wrong position map that all subsequent extension users receive from cache, without any indication of the source.

Currently, the KV record format (confirmed in offscreen.js `uploadToCache()`) stores:
```json
{ "entries": [...], "meta": {...}, "cachedAt": <ms>, "version": "v3" }
```

There is no `source` field (webapp vs extension), no client version, no PDF.js version. When a citation goes wrong, there is no way to determine whether the KV-cached position map came from a webapp parse or an extension parse.

**Why it happens:**

The shared Worker was designed for a single client (the extension). Adding a second client (the webapp) to write to the same KV namespace creates an implicit assumption that both clients produce identical output. This is probably true for 99.9% of patents — but the first-writer-wins cache means any divergent case is silently locked in.

**How to avoid:**

1. **Add provenance to the KV cache schema.** When the webapp uploads a position map, include `"source": "webapp"` and `"pdfjsVersion": "5.5.207"`. When the extension uploads, include `"source": "extension-chrome"` or `"source": "extension-firefox"`. This field is informational — it doesn't change cache behavior but enables debugging.

2. **Consider bumping `CACHE_VERSION`** from `v3` to `v4` when the webapp goes live. This ensures fresh parses by both the extension and webapp, avoiding any pre-webapp cache entries being mixed with webapp-contributed entries. The downside: invalidates all existing cached position maps, requiring fresh parses. For a niche tool, this is acceptable.

3. **Run the 75-case golden corpus against webapp-context parsing.** The corpus validates that the position maps produced by the webapp path match the expected citations. If any case fails, the webapp must not upload its position map to the shared KV cache.

**Warning signs:**
- A position-map cache entry for a patent that has incorrect citations on the extension but not when parsed fresh
- KV entries without a `source` field (pre-provenance entries become ambiguous)
- A newly-public patent starts returning wrong citations for extension users after a webapp user parses it

**Phase to address:** Phase 2 (webapp cache integration) — add `source` field to the upload payload in the same phase that the webapp cache upload is implemented.

---

### Pitfall 10: The Worker's CORS `Access-Control-Allow-Origin: *` exposes the cache-read endpoint to any origin — OK for the webapp but document the deliberate decision

**What goes wrong:**

The Worker's `corsHeaders()` function returns `{ 'Access-Control-Allow-Origin': '*' }`. This is applied to ALL routes, including `GET /cache` which returns parsed position maps. Combined with removing the Bearer token requirement for webapp requests (Pitfall 1's fix), the KV cache becomes readable by ANY website — not just the webapp.

This is not a critical security issue for this specific data (position maps are not sensitive — they're derived from public patent documents), but it represents an unintentional widening of access that should be deliberate, not accidental. Additionally, if a future route is added that IS sensitive (e.g., bug report contents), applying `Access-Control-Allow-Origin: *` to it would be a security bug.

**Why it happens:**

`corsHeaders()` was written as a one-liner helper applied uniformly to all responses. When the webapp requires CORS access to the cache route, developers confirm that `*` already works and don't audit whether `*` is appropriate for all routes.

**How to avoid:**

1. **Differentiate CORS headers by route sensitivity.** The `GET /cache` and webapp proxy routes: `Access-Control-Allow-Origin: *` is appropriate (public data). The `/report` route: restrict to the extension origin (`chrome-extension://...` or `moz-extension://...`) since the webapp should not call the bug-report route. Future sensitive routes should default to restrictive CORS.

2. **Document the deliberate decision** in a comment in `corsHeaders()` or adjacent to the route dispatch. The decision is correct for public data routes — documenting it prevents future developers from "fixing" it unnecessarily or from accidentally applying it to sensitive routes.

3. **No action needed for v6.0** beyond the documentation — the current `*` behavior is correct for the routes the webapp uses. This pitfall is a flag for the Worker design phase to explicitly acknowledge, not a blocking change.

**Warning signs:**
- A future PR adds a route with sensitive data and applies `corsHeaders()` without reconsidering the `*` origin
- The `/report` route (which handles bug reports with potential PII fields) becomes callable from arbitrary origins

**Phase to address:** Phase 1 (Worker security redesign). Address in the same phase as Pitfall 1 and Pitfall 2 — document the CORS decision per-route during the auth redesign.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Copying `matching.js` into webapp instead of extracting a shared package | Faster to start webapp | Matching logic diverges silently across surfaces; 75-case corpus only validates extension | Never — the shared package IS the milestone's core value |
| Keeping `PROXY_TOKEN` hardcoded in extension after rotating | No extension update needed for v6.0 launch | Next rotation requires another extension release cycle; token will again be in the bundle | Acceptable only if v5.1 adds a rotation mechanism; must be tracked as debt |
| Skipping provenance (`source` field) in KV cache uploads | Simpler KV schema | Impossible to debug cross-surface cache poisoning | Never — provenance costs 1 field and enables months of future debugging |
| Using CDN URL for pdf.worker.mjs without version-pinning | Simpler build config | CDN version could drift from installed `pdfjs-dist` version; parsing differences | Never — always pin to exact version matching `pdfjs-dist@5.5.207` |
| No progress feedback on large PDF parse | Simpler UI | Users abandon the page on 5-30 MB PDFs, assuming it's broken | Never for production; acceptable in Phase 2 dev/testing only |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Worker USPTO proxy from webapp | Sending `Authorization: Bearer <token>` from browser JS | Route through server-side proxy (Cloudflare Pages Function or new Worker route) that injects the token |
| KV cache writes from webapp | No rate limiting on `POST /cache` | Add IP-keyed rate limit (max 5 uploads/min/IP) before opening the webapp route |
| Google Patents PDF URL | Fetching `patentimages.storage.googleapis.com` directly from webapp | Always go through Worker proxy — direct fetch is CORS-blocked |
| PDF.js worker in webapp | Setting `workerSrc` at module scope without testing thread separation | Verify Worker thread in DevTools; use `new URL(..., import.meta.url)` or version-pinned CDN URL |
| KV cache schema | No `source` field on webapp uploads | Include `"source": "webapp"` in all webapp-contributed cache entries |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| PDF.js main-thread fallback | UI freeze 5-20s on large patents; no error, no warning | Verify worker thread in DevTools; add startup assertion | Always, on every parse — silent from the first line of code |
| Full 100-page sequential page parse | 10-20s total parse time with no user feedback | Progress callback; page-count aware spinner | Immediately on patents > 50 pages without feedback |
| PDF ArrayBuffer not released after parse | Memory growth with successive patent parses in one session | Call `pdf.destroy()`; nullify ArrayBuffer reference after parse | After ~5-10 large patent parses in a single session |
| KV write quota exhaustion | Cache uploads silently fail; position maps re-parsed on every request | Global KV write counter guard in Worker; separate namespaces | At >800 unique patent parses/day from public traffic |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding `PROXY_TOKEN` (old or new) in webapp JS | Full Worker access for any attacker; KV poisoning; USPTO quota exhaustion | Server-side proxy pattern; token never in browser JS |
| No rate limiting on webapp-accessible Worker routes | KV write quota exhaustion in hours; Worker request quota abuse | Per-IP rate limits on all routes before webapp goes public |
| `Access-Control-Allow-Origin: *` on future sensitive routes | Arbitrary sites can read/write sensitive Worker data | Document per-route CORS decisions; restrict sensitive routes |
| Caching published-application position maps as if they were granted-patent maps | Wrong column:line citations that look plausible | Detect publication number at input; reject at Worker level |

---

## "Looks Done But Isn't" Checklist

- [ ] **PROXY_TOKEN rotation:** token rotated in Cloudflare Worker secrets AND extension updated with new token AND old token confirmed invalid
- [ ] **Webapp auth path:** confirm via network inspector that NO `Authorization` header appears in webapp requests to the Worker
- [ ] **PDF.js worker thread:** confirm via DevTools Threads panel that a worker thread appears during patent PDF parsing (not main-thread only)
- [ ] **75-case corpus on both surfaces:** corpus run against both extension build AND webapp build after core extraction; both must show 100% pass
- [ ] **Large PDF test:** test with a real 10+ MB patent PDF in the webapp; confirm no UI freeze, confirm parsing completes correctly
- [ ] **Published application rejection:** test with a `US20210XXXXXAN` number; webapp must show "Not supported" message, NOT a wrong citation
- [ ] **KV rate limit:** confirm `POST /cache` from the webapp returns 429 after 5+ rapid requests from the same IP
- [ ] **Position map provenance:** confirm KV entries from webapp include `"source": "webapp"` field

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| PROXY_TOKEN leaked in webapp JS | HIGH | Rotate immediately (`wrangler secret put`); ship extension patch with new token; audit Worker logs for anomalous requests during exposure window |
| Matching logic drift after copy | HIGH | Run 75-case corpus on both surfaces; identify diverging cases; eliminate the copy; re-extract as shared package |
| KV write quota exhausted | MEDIUM | Add global write-counter guard to Worker (next deploy); quota resets at 00:00 UTC — no permanent damage |
| PDF.js main-thread fallback shipped | MEDIUM | Deploy webapp update with correct `workerSrc`; no data migration needed |
| Published-application wrong citations in production | HIGH | Immediately add input validation to block A1/A2 kind codes; audit KV for any cached position maps from publication PDFs and delete them; ship correction before users file wrong citations in legal documents |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1: PROXY_TOKEN exposure | Phase 1 (BLOCKING GATE) | Network inspector confirms no `Authorization: Bearer` in webapp requests; Wrangler confirms new secret deployed |
| 2: Public Worker without rate limiting | Phase 1 (BLOCKING GATE) | Load test confirms 429 after rate limit threshold; KV write counter guard deployed |
| 3: Shared-core extraction behavior drift | Phase 1 (core extraction) | 75-case corpus passes identically on extension AND webapp package; baseline snapshot unchanged |
| 4: PDF.js worker URL misconfiguration | Phase 2 (webapp PDF parsing) | DevTools Threads panel shows worker thread during parse; no UI freeze on 10+ MB PDF |
| 5: CORS blocking Google Patents URLs | Phase 2 (webapp network) | All PDF fetches route through Worker proxy; no `patentimages.storage.googleapis.com` in network log |
| 6: Large PDF memory/CPU pressure | Phase 2 (webapp PDF parsing) | Progress UI visible during large-PDF parse; `pdf.destroy()` called; tab stable after 5 parses |
| 7: Matching logic re-implementation / drift | Phase 1 + Phase 3 | ESLint guard on import paths; canary test compares outputs across surfaces |
| 8: Published-application scope creep | Phase 2 (input validation) | Entering A1/A2 number shows "Not supported"; Worker returns 400 for publication numbers |
| 9: KV cache poisoning from webapp | Phase 2 (cache integration) | `source` field present in webapp KV writes; corpus validates webapp-parsed maps |
| 10: CORS `*` undocumented | Phase 1 (Worker redesign) | Code comment documents per-route CORS intent; `/report` restricted to extension origins |

---

## Sources

- Direct code read: `src/offscreen/offscreen.js` line 24 — PROXY_TOKEN literal string confirmed; all Worker calls use `Authorization: Bearer ${PROXY_TOKEN}`
- Direct code read: `src/offscreen/pdf-parser.js` line 14 — `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` at module scope; `chrome` would be undefined in a web page
- Direct code read: `worker/src/index.js` lines 510-678 — Bearer auth applied to all routes; `checkIpRateLimit` only on `/report`; USPTO proxy and cache routes have no IP rate limiting; `corsHeaders()` returns `{ 'Access-Control-Allow-Origin': '*' }` applied uniformly
- Direct code read: `worker/wrangler.toml` — no Cloudflare Rate Limiting binding; `PATENT_CACHE` and `BUG_REPORTS` KV namespaces confirmed; no `PROXY_TOKEN` or secrets in file (correctly configured via Wrangler secrets)
- Direct code read: `src/shared/matching.js` — pure functions, zero `chrome.*` references; confirmed portable to web page context
- Direct code read: `src/offscreen/position-map-builder.js` — pure functions, zero `chrome.*` references; confirmed portable to web page context
- Direct code read: `src/shared/constants.js` — `WORKER_REPORT_URL` and MSG constants; no `chrome.*` dependencies at module scope
- Direct code read: `.planning/PROJECT.md` — "Granted US patents only for v1; published applications show a clear 'not supported yet' message"; PROXY_TOKEN compromise acknowledged; "Client-side compute (PDF.js in the browser)"
- Direct code read: `.planning/ROADMAP.md` backlog item 999.1 — open risks confirmed: "PROXY_TOKEN must be rotated before public exposure"; published-application handling deferred
- `package.json` grep: `pdfjs-dist@5.5.207` (exact version confirmed); already a dependency, no new library needed for webapp
- Architecture-reasoned: CORS behavior of `patentimages.storage.googleapis.com` — confirmed by browser CORS model; extension offscreen docs are not subject to CORS restrictions, plain web pages are; extension uses `host_permissions` not CORS
- Architecture-reasoned: PDF.js `GlobalWorkerOptions.workerSrc = ''` or invalid URL causes silent main-thread fallback — consistent with PDF.js v5 documentation behavior and widely documented in PDF.js GitHub issues
- Architecture-reasoned: KV free-tier 1,000 writes/day limit from previous research (v5.0 PITFALLS.md); applicable unchanged to v6.0 scenario

---

*Pitfalls for: v6.0 Standalone Citation Webapp — adding a public client-side-PDF.js webapp to an existing cross-browser extension + Cloudflare Worker system*
*Researched: 2026-06-16*
*Confidence: HIGH on Pitfalls 1–3, 5–6, 10 (direct code reads); MEDIUM on Pitfalls 4, 7–9 (architecture-reasoned from code + PDF.js patterns)*

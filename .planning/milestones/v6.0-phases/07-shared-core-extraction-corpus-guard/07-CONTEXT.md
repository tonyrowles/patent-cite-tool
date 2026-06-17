# Phase 7: Shared Core Extraction + Corpus Guard - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped; choices pre-locked in STATE.md)

<domain>
## Phase Boundary

Relocate the three deterministic core modules into `src/shared/` so both the
extension and the (future) standalone webapp consume them via the existing esbuild
alias pattern. The extraction must be behavior-preserving: the 75-case golden corpus
must pass byte-identically on the extension build path, and a new full-pipeline
browser-context integration test (PDF bytes → `extractTextFromPdf` → `buildPositionMap`
→ `matchAndCite`) must prove the modules work in a plain `<script type="module">`
context with PDF.js running in a worker thread.

In scope: moving `matching.js`, `position-map-builder.js`, `pdf-parser.js` to
`src/shared/`; adding the `configurePdfWorker(url)` injectable seam to `pdf-parser.js`;
updating esbuild + vitest alias config for both targets; the CORE-04 browser integration
test. Out of scope: any webapp UI/page (Phase 8), deploy (Phase 9).

</domain>

<decisions>
## Implementation Decisions

### Locked (from STATE.md — Key Locked Decisions v6.0)
- **Shared core mechanism:** plain `src/shared/` directory + esbuild alias — NOT npm
  workspaces (avoids symlink complexity with per-target Vitest alias configs).
- **`pdf-parser.js` worker seam (LOAD-BEARING):** the module-scope
  `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(...)` (currently ~line 14)
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
phase. Use the locked decisions above, the existing esbuild alias/build conventions
(`scripts/build.js`), the existing offscreen/firefox import sites, the golden-corpus test
harness, and the project's vitest config layout to guide decisions. Re-export shims vs
hard relocation of the old `src/offscreen/*` paths is at Claude's discretion provided
success criterion 1 holds (old files no longer exist as independent implementations).

</decisions>

<code_context>
## Existing Code Insights

Codebase context (current import sites for `matching.js`, `position-map-builder.js`,
`pdf-parser.js`; the existing esbuild alias pattern in `scripts/build.js`; the golden
corpus harness under `tests/golden/`; per-target vitest configs
`vitest.config.chrome.js` / `vitest.config.firefox.js`) will be gathered during
plan-phase research and pattern-mapping.

</code_context>

<specifics>
## Specific Ideas

- Success criterion is literal: `src/shared/` contains `matching.js`,
  `position-map-builder.js`, `pdf-parser.js`; `src/offscreen/pdf-parser.js` and
  `src/offscreen/position-map-builder.js` no longer exist as independent files (re-export
  shims are acceptable).
- CORE-04 must confirm via Chrome DevTools Threads panel that PDF.js runs in a worker
  thread (not main thread) during the test.
- `npm test` must pass 100% across test:src, test:chrome, test:firefox, test:lint.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase; webapp consumption of the shared core is exercised in Phase 8.

</deferred>

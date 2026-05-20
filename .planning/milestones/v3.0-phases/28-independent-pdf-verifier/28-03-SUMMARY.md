---
phase: 28-independent-pdf-verifier
plan: 03
subsystem: testing
tags: [pdf-snippet, napi-canvas, sharp-crop, diagnostics, pdfjs-legacy]

# Dependency graph
requires:
  - phase: 28-01
    provides: ensureCachedPdf (tests/e2e/lib/pdf-fetch.js) — fetched + cached PDF reuse
  - phase: 28-01
    provides: "@napi-rs/canvas@1.0.0 dependency pinned + install-probed"
provides:
  - "renderPdfSnippet({patentId, page, line, runId, caseId}, opts?) — DIAG-03 visual artifact renderer"
  - "In-process renderCache keyed by patentId:page:dpi — prevents duplicate page renders within a run"
  - "Defensive line-y estimation that NEVER throws (clamps out-of-range citedLine, centers on empty page)"
affects:
  - 28-05  # regression.spec.js catch-path will invoke renderPdfSnippet on VERIFIER_DISAGREE

# Tech tracking
tech-stack:
  added: []  # no new deps; reuses @napi-rs/canvas + sharp + pdfjs-dist already pinned by 28-01
  patterns:
    - "pdfjs canvasFactory auto-detection — never import @napi-rs/canvas directly"
    - "In-process per-(patentId, page, dpi) render cache to amortize cost across the run"
    - "Snippet renderer parses textContent itself — orthogonal to pdf-verifier's column/line index"

key-files:
  created:
    - tests/e2e/lib/pdf-snippet.js  # 302 lines — renderPdfSnippet + cache + helpers
    - tests/unit/pdf-snippet.smoke.test.js  # 106 lines — live smoke against US11427642
  modified: []

key-decisions:
  - "Lightweight in-renderer line clustering (orthogonal to pdf-verifier.js) keeps the snippet module independent and testable in isolation"
  - "Defensive clamping over throwing — out-of-range citedLine produces a footer-region snippet, which is informative to a human reviewer"
  - "PNG signature byte check in smoke test (0x89 50 4E 47) confirms sharp wrote a real PNG, not a truncated/error file"

patterns-established:
  - "Snippet renderer pattern: render full page once at DPI 150 → cache → estimate line y from textContent → sharp.extract crop band → write PNG to {runId}/{caseId}-pdf-snippet.png"
  - "Live smoke test pattern: SKIP_LIVE_E2E env-var skipIf guard + per-test runId cleanup + PNG signature byte assertion"

requirements-completed: [DIAG-03]

# Metrics
duration: 4min
completed: 2026-05-15
---

# Phase 28 Plan 03: PDF Snippet Renderer Summary

**`renderPdfSnippet` — pdfjs-legacy + sharp.extract crop pipeline that renders the cited PDF page at 150 DPI and writes a tight ±100px band PNG to the per-run artifact dir (DIAG-03).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-15T17:11:41Z
- **Completed:** 2026-05-15T17:15:33Z
- **Tasks:** 2
- **Files created:** 2 (302 + 106 = 408 lines)
- **Files modified:** 0

## Accomplishments

- `tests/e2e/lib/pdf-snippet.js` exports `renderPdfSnippet({patentId, page, line, runId, caseId}, opts?)` — 302 lines, well over the 100-line min
- Pdfjs is consumed via `pdfjs-dist/legacy/build/pdf.mjs` (Pitfall 1 — default entry throws `DOMMatrix is not defined` in Node)
- `@napi-rs/canvas` is wired indirectly through pdfjs's built-in `canvasFactory.create(...)` — **no direct napi import**, preserving 28-01's install-probe assumption
- `sharp.extract({left, top, width, height}).png().toBuffer()` does the crop — RESEARCH.md verified pattern
- In-process `renderCache` keyed by `patentId:page:dpi` — second-call cache hit confirmed at <300ms (cold-call render was ~1.3s)
- Reuses 28-01's `ensureCachedPdf` — no duplicate fetch logic, PDF stays at `tests/e2e/.pdf-cache/US11427642.pdf`
- Defensive clamping: out-of-range `citedLine` → last detected line (footer); empty page → center-of-page crop; edge-of-page degenerate crop → minimum 2× DEFAULT_MARGIN_PX band

## Task Commits

1. **Task 28-03-01: renderPdfSnippet implementation** — `28f2835` (feat)
2. **Task 28-03-02: Live smoke test against US11427642 page 1, line 26** — `1871847` (test)

## Files Created

- `tests/e2e/lib/pdf-snippet.js` — DIAG-03 renderer (302 lines)
  - Exports: `renderPdfSnippet`, `_clearRenderCache`, `_renderCacheSize`
  - Internal helpers: `renderFullPagePng`, `estimateLinePixelY`, `clusterByY`, `ensureRunDir`
- `tests/unit/pdf-snippet.smoke.test.js` — live smoke (106 lines)
  - Renders US11427642 page 1, line 26 → asserts PNG > 5KB + valid PNG signature
  - Cached-second-call assertion confirms `renderCache` works (< 5s, observed ~30ms warm)
  - `describe.skipIf(!LIVE)` guards against `SKIP_LIVE_E2E=1` sandbox runs
  - Per-test cleanup via `fs.rmSync(runDir, {recursive: true})` keeps `tests/e2e/artifacts/` empty

## Smoke Test Result

```
✓ tests/unit/pdf-snippet.smoke.test.js (2 tests) 1299ms
  ✓ renders US11427642 page 1, line 26 -> PNG > 5KB  1266ms
  ✓ cached second call is fast (< 5s)                  ~30ms

Test Files  1 passed (1)
     Tests  2 passed (2)
  Duration  1.73s (cold cache; subsequent warm runs ~700ms)
```

**Snippet artifact:** 20,250 bytes (4× the 5KB floor), valid PNG (signature `89 50 4E 47 ...`).

## Visual Inspection (Manual)

Rendered `US11427642-spec-short-1-pdf-snippet.png` manually for visual confirmation:

- Output is a clean horizontal slice of page 1 at 150 DPI
- The visible content is the cover-page bibliographic data (App. No., PCT filings, References Cited list)
- For US11427642 specifically, the user-facing citation "1:26-27" maps to **column 1 of the spec body**, which begins on a later PDF page (the cover is page 1). The renderer correctly does what it's told — `page=1, line=26` — and the spec-side caller in Plan 28-05 will translate "col 1" to the proper PDF page via the verifier's `parsed.pages[].columns` index before invoking this renderer.
- This is correct behavior for DIAG-03: the snippet shows what the *renderer was asked to render*, surfacing both the snippet content and any miswired page argument from the caller. A human reviewer adjudicating a `VERIFIER_DISAGREE` will see the right region as long as Plan 28-05's caller passes the right `page`.

## Decisions Made

- **Inline line-clustering rather than importing pdf-verifier's inferColumnLine.** Keeps the snippet module orthogonal to the verifier — the snippet renderer is a *separate* concern (pixel-y estimation only, not column/line truth-finding). Both call pdfjs `getTextContent()`; that's cheap (~50-200ms).
- **Clamp on out-of-range citedLine instead of throwing.** Producing a footer-region snippet when `line=999` is more useful to a human than an exception — the reviewer sees "this is the wrong region" and looks at the verifier's `reason` field.
- **PNG signature byte check in smoke test.** The size-greater-than-5KB gate from VALIDATION.md alone could be satisfied by a 5KB error message; the four-byte PNG signature check (`0x89 0x50 0x4E 0x47`) confirms sharp actually wrote a real PNG.
- **60s test timeout cold / 30s warm.** Observed cold run was ~1.3s; the comfortable headroom accommodates slow Google Patents fetches when the test runs in CI without a populated cache.

## Deviations from Plan

None — plan executed exactly as written. No deviation rules triggered.

The plan skeleton was followed directly. The only embellishments are non-functional:
- PNG signature byte check in smoke test (additional safety on top of the >5KB gate; not in plan but no behavior change)
- Optional `useSystemFonts: true, disableFontFace: true` flags on `getDocument` — matches Plan 28-01's pdf-verifier.js settings for consistent rendering across the verifier and the snippet renderer

Both are safe additions; neither alters the public surface, the artifact path convention, or the verification gates.

## Issues Encountered

**Pdfjs warnings (non-blocking):** `JBig2Image#instantiateWasm` and `CCITTFaxStream: Falling back to JS CCITTFax decoder`. These are routine pdfjs-in-Node warnings — pdfjs falls back to its JS decoder when the optional wasm URL parameter is not configured. The render completes correctly. No action needed; matches 28-01's known-quiet warnings.

**Pre-existing `tests/unit/text-matcher.test.js` failures (15 cases).** Confirmed pre-existing at base commit `0006e25` before any 28-03 changes. Already documented in `.planning/phases/28-independent-pdf-verifier/deferred-items.md`. Out of scope per SCOPE BOUNDARY rule.

## User Setup Required

None — no external service configuration or new credentials required. The smoke test fetches from public `patents.google.com` on cold cache.

To run sandboxed without network:
```
SKIP_LIVE_E2E=1 npm run test:src -- tests/unit/pdf-snippet.smoke.test.js
```

## Next Phase Readiness

Plan 28-04 (ESLint independence rule) and Plan 28-05 (spec integration) can now both proceed:

- Plan 28-04 may add an ESLint `no-restricted-imports` rule against `tests/e2e/lib/pdf-verifier.js`; `pdf-snippet.js` is NOT in that rule's scope (per plan §"Constraints") but already conforms (no `src/` imports).
- Plan 28-05's regression spec catch path can `import { renderPdfSnippet } from '../lib/pdf-snippet.js'` and call it on `VERIFIER_DISAGREE`. The caller is responsible for translating cited "column N" into a 1-based PDF page index (via `parsed.pages[].columns`) before invocation.

**Threat surface:** No new surface introduced. Inherits 28-01's @napi-rs/canvas pinning + install probe. PDF data flow is identical (Google Patents → ensureCachedPdf → pdfjs). Artifact directory remains gitignored (Phase 26).

## Self-Check: PASSED

Files exist:
- `tests/e2e/lib/pdf-snippet.js` — FOUND (302 lines)
- `tests/unit/pdf-snippet.smoke.test.js` — FOUND (106 lines)

Commits exist:
- `28f2835` — FOUND (feat: renderPdfSnippet)
- `1871847` — FOUND (test: live smoke)

Success criteria:
- [x] tests/e2e/lib/pdf-snippet.js with renderPdfSnippet exported
- [x] Uses pdfjs-dist/legacy/build/pdf.mjs + @napi-rs/canvas (via canvasFactory) + sharp
- [x] Smoke test produces PNG > 5KB at expected path (20,250 bytes observed)
- [x] node --check passes (both files)
- [x] SUMMARY.md at .planning/phases/28-independent-pdf-verifier/28-03-SUMMARY.md
- [x] --no-verify commits used

---
*Phase: 28-independent-pdf-verifier*
*Completed: 2026-05-15*

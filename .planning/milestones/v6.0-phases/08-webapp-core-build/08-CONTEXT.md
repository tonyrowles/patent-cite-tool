# Phase 8: Webapp Core Build - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the standalone webapp so it is fully functional in a LOCAL browser: patent-number
entry + normalization, cache-first lookup via the Worker, client-side PDF.js parsing
through the shared core (Phase 7), citation display with a confidence indicator, batch
mode, format toggle, copy-to-clipboard, and published-application rejection at the input
layer. Plus `scripts/build.js --webapp-only` producing `dist/webapp/` and a
`webapp/wrangler.toml` pointing at it as the Workers Assets directory.

In scope: the `webapp/` source (HTML/JS/CSS), its esbuild `--webapp-only` build target,
the webapp's consumption of `src/shared/` (matchAndCite, buildPositionMap,
extractTextFromPdf + configurePdfWorker with the webapp asset path), and all client-side
UX. Out of scope: production DEPLOY + live UAT + privacy policy (Phase 9). The Worker
routes themselves already exist (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### UX Model (user-selected)
- **Mode model:** Single-first. The page opens with ONE patent field + ONE passage input.
  A subtle "add another passage" affordance reveals additional passage rows → batch mode.
  Batch is secondary/progressive, not a separate tab. Internally, single and batch share
  ONE code path: one fetch + one parse + N `matchAndCite` calls (BATCH-01).
- **Visual style:** Reuse the existing extension aesthetic (same fonts, colors, spacing as
  `src/popup/popup.html` / `src/options/options.html`) on a centered single-column card.
  No new design system. Styles may be inline/`<style>` consistent with the extension's
  approach.
- **Default citation format:** Shorthand `4:15-22` on first load; the FMT-01 toggle to long
  form (`Col. 4, ll. 15-22`) and the FMT-02 optional patent-number prefix remain available
  and should persist the user's choice (localStorage) across the session.

### Confidence & Results
- Confidence indicator: colored chip + label per result row — green ≥0.95, yellow ≥0.80,
  red <0.80 (SAME thresholds as the extension; reuse the shared logic, do not re-derive).
- Each batch result row shows its OWN confidence chip (BATCH-02). "Copy all" copies all
  batch citations at once (BATCH-03); single results have a per-citation copy button (APP-09).

### Loading / Errors / Trust
- Loading UI: named-stage inline status line — "Fetching patent PDF…" → "Parsing PDF…" →
  "Matching passage…" (APP-08).
- No-match → helpful message; network/parse failure → error state with a retry affordance
  (APP-07).
- Published-application numbers (A1/A2/A9 kind code OR `20XXXXXXXX` format) are rejected at
  the INPUT stage with a clear "not supported yet" message BEFORE any network call (APP-02).
- Trust signals — "deterministic, no AI inference" and a "no data stored" disclosure (APP-10)
  — plus the format/prefix toggles live in a compact footer/options strip; the citation
  display stays the visual primary.

### Networking (locked — v6.0 STATE decisions)
- All PDF fetches go through the Worker `GET /webapp/pdf?patent=` (Origin-authed) — NEVER
  `patentimages.storage.googleapis.com` / direct USPTO (CORS-blocked) (APP-03).
- NO `Authorization: Bearer` header in any webapp request — Origin-header auth only (SEC-03
  from Phase 6). Cache-first: check Worker `GET /cache?patent=` before fetch+parse; a cache
  hit skips client-side parsing entirely (APP-04). Webapp cache uploads are tagged
  `source:"webapp"` by the Worker (Phase 6 WRKR-03).

### Claude's Discretion
- Exact DOM structure, component breakdown, CSS specifics, and file layout under `webapp/`
  are at Claude's discretion, guided by the extension popup/options conventions and the
  UI-SPEC produced next. The `configurePdfWorker` injection value for the webapp (its
  bundled `lib/pdf.worker.mjs` asset path) is at Claude's discretion per the Phase 7 seam.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/matching.js` (`matchAndCite`), `src/shared/position-map-builder.js`
  (`buildPositionMap`), `src/shared/pdf-parser.js` (`extractTextFromPdf` +
  `configurePdfWorker(url)`) — the deterministic core, now webapp-consumable (Phase 7).
- `src/popup/popup.html` + `src/popup/popup.js` and `src/options/options.html` — the brand
  aesthetic + confidence-indicator rendering reference (thresholds 0.95/0.80).
- `scripts/build.js` — esbuild pipeline; add a `--webapp-only` target producing `dist/webapp/`
  (index.html + JS bundle + `lib/pdf.mjs` + `lib/pdf.worker.mjs`).
- Worker routes from Phase 6: `GET /webapp/pdf`, `GET /cache` (Origin path), `POST /cache`.

### Established Patterns
- Confidence thresholds and citation shorthand formatting already exist in the extension —
  reuse, don't reinvent. Long-form (`Col. X, ll. A-B`) is a NEW pure transformation of the
  existing column/line integers (FMT-01).
- esbuild `define` / asset-copy conventions in `scripts/build.js` (the `--chrome-only` /
  `--firefox-only` targets are the analog for `--webapp-only`).

### Integration Points
- `webapp/wrangler.toml` references `dist/webapp/` as the Workers Assets directory (deploy
  wiring used in Phase 9). The Origin allowlist already includes `http://localhost:8788`
  (Phase 6) for local `wrangler dev` UAT.

</code_context>

<specifics>
## Specific Ideas

- Success criterion is literal: `scripts/build.js --webapp-only` produces `dist/webapp/`
  with `index.html`, the JS bundle, `lib/pdf.mjs`, `lib/pdf.worker.mjs`; `webapp/wrangler.toml`
  references `dist/webapp/`.
- Network inspector must show zero `Authorization: Bearer` headers and all PDF fetches via
  `GET /webapp/pdf?patent=`.
- Long-form format is a pure transformation of column/line integers; shorthand is the default.

</specifics>

<deferred>
## Deferred Ideas

- Production deployment to `cite.tonyrowles.com`, live UAT against production, and the
  privacy-policy update — all Phase 9.
- Any AI/LLM assistance — explicitly out of scope (the tool is deterministic; this is a
  trust signal, APP-10).

</deferred>

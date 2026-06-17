---
phase: 08-webapp-core-build
plan: "01"
subsystem: webapp-build
tags: [build-pipeline, esbuild, html-scaffold, workers-assets, supply-chain]
dependency_graph:
  requires: []
  provides:
    - scripts/build.js --webapp-only target
    - webapp/index.html (full UI-SPEC HTML shell)
    - webapp/wrangler.toml (Workers Assets config)
    - package.json build:webapp script
  affects:
    - dist/webapp/ (generated; index.html + app.bundle.js + lib/)
    - plans 08-02 and 08-03 wire against element ids in index.html
tech_stack:
  added: []
  patterns:
    - esbuild ESM target for browser (no define block, ./lib/pdf.mjs external)
    - Workers Assets wrangler.toml ([assets] directory, no main key)
    - Inline <style> webapp matching extension aesthetic
key_files:
  created:
    - webapp/index.html
    - webapp/wrangler.toml
    - webapp/js/app.js (placeholder — overwritten in 08-03)
  modified:
    - scripts/build.js
    - package.json
decisions:
  - "PROXY_TOKEN guard conditioned on `!webappOnly` — webapp intentionally carries no secret (SEC-03/T-08-01)"
  - "dist/webapp cleanup scoped to rmSync('dist/webapp') not rmSync('dist') — preserves sibling extension builds (Pitfall 3)"
  - "esbuild external path is './lib/pdf.mjs' not '../lib/pdf.mjs' — bundle lands at dist/webapp/ root not in a subdir (Pitfall 2)"
  - "wrangler.toml uses [assets] with no main key — pure static asset serving, [site] deprecated in wrangler v4 (Pitfall 7)"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-16"
  tasks_completed: 3
  files_modified: 5
---

# Phase 08 Plan 01: --webapp-only Build Target + index.html Scaffold + wrangler.toml Summary

## One-Liner

esbuild --webapp-only target bypassing PROXY_TOKEN guard, full UI-SPEC index.html with inline styles, and Workers Assets wrangler.toml pointing at dist/webapp/.

## What Was Built

### Task 1: --webapp-only build target (scripts/build.js + package.json + webapp/js/app.js)

Extended `scripts/build.js` with a `buildWebapp()` async function and `--webapp-only` CLI flag:

- `webappOnly` flag parsed alongside `chromeOnly`/`firefoxOnly` at top of file
- PROXY_TOKEN guard changed from unconditional to `if (!webappOnly && !PROXY_TOKEN)` — webapp intentionally has no token (SEC-03, T-08-01)
- `buildWebapp()`: cleans only `dist/webapp/` (not `dist/`), creates `dist/webapp/lib/`, runs esbuild with `format:'esm'`, `platform:'browser'`, `outfile:'dist/webapp/app.bundle.js'`, `external:['./lib/pdf.mjs']`, NO define block
- `main()` guards `fs.rmSync('dist')` so it only runs when NOT webapp-only; adds `webappOnly` dispatch that skips `buildTestExports` (those need a token)
- `package.json` gains `"build:webapp": "node scripts/build.js --webapp-only"`
- Minimal `webapp/js/app.js` placeholder for build isolation (overwritten in plan 08-03)

### Task 2: webapp/index.html + webapp/wrangler.toml

Full `webapp/index.html` implementing the UI-SPEC Page Structure exactly:

- Inline `<style>` block with all hex/spacing/typography tokens extracted verbatim from `options.html` and `popup.html`
- Page structure: `<main class="container">` (max-width 540px), `<header>` with H1 + tagline, `.card` with border-radius 10px and exact box-shadow
- Inside card: patent-input section (label + monospace input + role=alert field-error), passages section (one initial row + add-passage affordance), submit `<button id="cite-btn">`, empty `<section id="results-area" aria-live="polite" aria-atomic="false">`, options strip (citation-format select + include-patent-number checkbox)
- Footer with trust signals: "Deterministic — no AI inference" · "No data stored" · Privacy Policy link (APP-10)
- All form controls have `<label for>` matching id; `.sr-only` helper; status chip color classes matching popup.html lines 23-27
- `<script type="module" src="./app.bundle.js"></script>` at end of body
- 648 lines (well above 200 minimum)

`webapp/wrangler.toml`:
```toml
name = "patent-cite-webapp"
compatibility_date = "2026-06-16"

[assets]
directory = "../dist/webapp"
```
No `main` key, no `[site]` (deprecated in wrangler v4).

### Task 3: Supply-chain guard (T-08-SC)

Automated verification confirmed: `NO_NEW_DEPS_OK` — zero new entries under `dependencies` or `devDependencies` in `package.json`. `package-lock.json` diff is zero lines. Phase 8 continues the project's seventh consecutive zero-new-dependency milestone.

## Verification Results

| Check | Result |
|-------|--------|
| `node scripts/build.js --webapp-only` exits 0 with no PROXY_TOKEN | PASS |
| dist/webapp/index.html exists | PASS |
| dist/webapp/app.bundle.js exists | PASS |
| dist/webapp/lib/pdf.mjs exists | PASS |
| dist/webapp/lib/pdf.worker.mjs exists | PASS |
| app.bundle.js < 2MB (placeholder = 0 bytes, pdf.mjs external confirmed) | PASS |
| dist/chrome/ survives webapp build (Pitfall 3) | PASS |
| build:webapp in package.json | PASS |
| index.html results-area + aria-live | PASS |
| Trust signals in footer (APP-10) | PASS |
| citation-format select + include-patent-number checkbox | PASS |
| wrangler.toml [assets] + directory="../dist/webapp" | PASS |
| No [site] in wrangler.toml | PASS |
| NO_NEW_DEPS_OK (T-08-SC) | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

`webapp/js/app.js` contains only a comment placeholder (`// app entry — implemented in 08-03`). This is intentional per plan instructions — plan 08-03 overwrites this file with the full orchestration/UI state machine. The stub does not prevent this plan's goal (dist/webapp/ scaffold) from being achieved.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model covers. The `__PROXY_TOKEN__` define is confirmed absent from `buildWebapp()` (T-08-01 mitigated).

## Self-Check: PASSED

Files created/modified:
- `scripts/build.js` — FOUND
- `package.json` — FOUND
- `webapp/js/app.js` — FOUND
- `webapp/index.html` — FOUND (648 lines)
- `webapp/wrangler.toml` — FOUND

Commits:
- `1309291` — FOUND (feat(08-01): add --webapp-only build target)
- `c398305` — FOUND (feat(08-01): author webapp/index.html + wrangler.toml)

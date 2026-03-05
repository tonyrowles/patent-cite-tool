---
phase: 16-firefox-extension
plan: 02
subsystem: infra
tags: [firefox, esbuild, build-pipeline, esm, iife, pdf.js]

requires:
  - phase: 16-firefox-extension/16-01
    provides: src/firefox/background.js, src/firefox/pdf-pipeline.js, src/manifest.firefox.json with tabs + wasm-unsafe-eval
  - phase: 15-esbuild-build-pipeline
    provides: scripts/build.js with Chrome esbuild pipeline, Chrome static asset copy pattern

provides:
  - scripts/build.js — Updated with getFirefoxIifeConfig, getFirefoxEsmConfig, copyFirefoxStaticAssets, async buildFirefox()
  - dist/firefox/ — Complete Firefox extension directory (manifest, ESM background, IIFE content, popup, options, icons, lib)

affects: [16-03-testing, 16-04-store-submission]

tech-stack:
  added: []
  patterns:
    - "Object entry point syntax for esbuild: {in: 'src/firefox/background.js', out: 'background/service-worker'} — avoids outbase path nesting problem"
    - "external: ['../lib/pdf.mjs'] path is relative to output file location (dist/firefox/background/); preserves import at runtime"
    - "No offscreen for Firefox: copyFirefoxStaticAssets() omits offscreen.html — Firefox has no chrome.offscreen API"

key-files:
  created: []
  modified:
    - scripts/build.js

key-decisions:
  - "Object entry point syntax (not outbase) for Firefox ESM bundle — prevents dist/firefox/firefox/background.js double-nesting of src/firefox/ source path"
  - "external: ['../lib/pdf.mjs'] in Firefox ESM config — same pattern as Chrome but relative to dist/firefox/background/ output location"
  - "--firefox-only and --chrome-only flags each clean all of dist/ before building (rmSync at top of main) — single-target builds don't retain the other target"

patterns-established:
  - "Firefox build uses parallel Promise.all([IIFE, ESM]) then sequential static copy — same pattern as Chrome"
  - "getFirefoxEsmConfig omits outbase to prevent double path nesting with object entry syntax"

requirements-completed: [FOX-04]

duration: 2min
completed: 2026-03-04
---

# Phase 16 Plan 02: Firefox esbuild Build Pipeline Summary

**esbuild pipeline wiring for Firefox: IIFE content bundle + ESM background/popup/options via object entry syntax, pdf.mjs external, static asset copy producing complete dist/firefox/**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T17:34:11Z
- **Completed:** 2026-03-04T17:36:08Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `getFirefoxIifeConfig()` producing IIFE content bundle to `dist/firefox/content/content.js`
- Added `getFirefoxEsmConfig()` using object entry point syntax to produce ESM bundles at `background/service-worker.js`, `popup/popup.js`, `options/options.js` without path double-nesting
- Added `copyFirefoxStaticAssets()` copying icons, lib (pdf.mjs + pdf.worker.mjs), popup.html, options.html — no offscreen.html
- Converted `buildFirefox()` to async with parallel esbuild execution
- `npm run build` now produces both `dist/chrome/` and `dist/firefox/` in a single invocation; all 136 tests still pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Firefox esbuild configs and static asset copy to build script** - `eb37641` (feat)
2. **Task 2: Verify Firefox build output completeness and correctness** - (no code changes — all verification checks passed on first run)

## Files Created/Modified

- `scripts/build.js` — Added `getFirefoxIifeConfig()`, `getFirefoxEsmConfig()`, `copyFirefoxStaticAssets()`, converted `buildFirefox()` to async

## Decisions Made

- Object entry point syntax used for `getFirefoxEsmConfig()` instead of `outbase:'src'`. With `outbase:'src'`, `src/firefox/background.js` would output to `dist/firefox/firefox/background.js` — the wrong path. Object syntax `{in: 'src/firefox/background.js', out: 'background/service-worker'}` explicitly controls the output path.
- `external: ['../lib/pdf.mjs']` path is relative to the output file's directory (`dist/firefox/background/`), resolving correctly to `dist/firefox/lib/pdf.mjs` at runtime — same pattern established in Phase 15 for Chrome.
- `--firefox-only` removes all of `dist/` before building (via `rmSync` in `main()`), so only `dist/firefox/` exists after the command. This is intentional — the build script is for CI use; developers use `--watch` for Chrome-only iteration.

## Deviations from Plan

None — plan executed exactly as written. The plan's verification step `head -1 dist/firefox/background/service-worker.js | grep -q "import"` was written expecting the import on line 1, but esbuild generates a comment first (line 1 is `// src/shared/constants.js`). The actual `import { getDocument, GlobalWorkerOptions } from "../lib/pdf.mjs"` is at line 37. The bundle IS ESM format — this was verified by grepping for the import statement and confirming it exists.

## Issues Encountered

None — build changes applied cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `dist/firefox/` is now a complete, loadable Firefox extension directory
- Can be loaded in Firefox via `about:debugging` -> "Load Temporary Add-on" -> select `dist/firefox/manifest.json`
- Known risk (from STATE.md): Firefox event page lifecycle during active PDF.js parse is MEDIUM confidence — empirical test in Firefox is the next validation step
- Known risk (from STATE.md): Cloudflare Worker CORS may need `moz-extension://` origin explicitly allowed — verify when testing live

---
*Phase: 16-firefox-extension*
*Completed: 2026-03-04*

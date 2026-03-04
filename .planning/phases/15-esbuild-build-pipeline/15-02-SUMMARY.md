---
phase: 15-esbuild-build-pipeline
plan: 02
subsystem: infra
tags: [esbuild, build, iife, esm, content-scripts, manifest-transform, firefox]

# Dependency graph
requires:
  - phase: 15-esbuild-build-pipeline/15-01
    provides: Content scripts as ES modules with explicit imports/exports; Firefox manifest created; dist/ gitignored

provides:
  - scripts/build.js — esbuild pipeline producing dist/chrome/ (IIFE + ESM bundles + static assets + transformed manifest) and dist/firefox/ (manifest scaffold)
  - dist/chrome/content/content.js — IIFE bundle of all content scripts with shared constants inlined
  - dist/chrome/background/service-worker.js — ESM bundle with shared constants inlined
  - dist/chrome/offscreen/offscreen.js — ESM bundle with external ../lib/pdf.mjs import preserved
  - dist/chrome/manifest.json — Transformed Chrome manifest with content_scripts pointing to single content/content.js
  - dist/firefox/manifest.json — Firefox manifest scaffold (JS bundles added in Phase 16)
  - npm scripts: build, build:chrome, build:firefox, dev

affects:
  - 16-firefox-port (Firefox build scaffold ready; dist/chrome/ structure established for reference)

# Tech tracking
tech-stack:
  added:
    - "esbuild ^0.27.0 (0.27.3 installed) — added to devDependencies explicitly"
  patterns:
    - "IIFE bundle for content scripts — prevents namespace pollution in page context, wraps in (() => {}) immediately-invoked function"
    - "External marker pattern — ../lib/pdf.mjs marked external in esbuild ESM config to prevent 3MB PDF.js bundling; imported at runtime from copied lib/"
    - "Parallel esbuild builds — Promise.all() for IIFE and ESM configs to minimize build time"
    - "Manifest transform in build script — read src/manifest.json, modify only content_scripts[0].js, write to dist/chrome/manifest.json"

key-files:
  created:
    - scripts/build.js
    - dist/chrome/content/content.js (build artifact)
    - dist/chrome/background/service-worker.js (build artifact)
    - dist/chrome/offscreen/offscreen.js (build artifact)
    - dist/chrome/manifest.json (build artifact — transformed)
    - dist/firefox/manifest.json (build artifact — copied)
  modified:
    - package.json

key-decisions:
  - "esbuild external: ['../lib/pdf.mjs'] — path relative to the output file location (dist/chrome/offscreen/), so ../lib/pdf.mjs correctly resolves to dist/chrome/lib/pdf.mjs at runtime"
  - "No globalName on IIFE bundle — content scripts are pure side-effects, per anti-pattern guidance; no export needed"
  - "Clean dist with rmSync before each full build — ensures stale files from previous builds don't persist"
  - "Watch mode uses esbuild.context() not esbuild.build() — enables incremental rebuilds; SIGINT handler disposes both contexts cleanly"
  - "build:firefox produces manifest-only dist/firefox/ — Phase 16 adds actual JS bundles for Firefox target"

patterns-established:
  - "Single IIFE entry point pattern — content-script.js is the sole entry; esbuild follows import graph through citation-ui.js, paragraph-finder.js, and shared/constants.js"
  - "outbase: 'src' for ESM bundles — preserves directory structure from src/ to dist/chrome/ (e.g., src/background/service-worker.js -> dist/chrome/background/service-worker.js)"

requirements-completed: [BUILD-01, BUILD-02, BUILD-03, BUILD-05]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 15 Plan 02: esbuild Build Pipeline Summary

**esbuild pipeline producing dist/chrome/ IIFE content bundle + ESM background/offscreen bundles + static assets + transformed manifest, plus dist/firefox/ scaffold — 136 tests pass, build in 17ms**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T08:00:32Z
- **Completed:** 2026-03-04T08:05:42Z
- **Tasks:** 2
- **Files modified:** 2 (scripts/build.js created, package.json updated)

## Accomplishments
- Created scripts/build.js (114 lines) with IIFE content bundle, ESM multi-entry bundle, static asset copy, manifest transform, Firefox scaffold, and watch mode
- Chrome manifest transformed: 5-file content_scripts array replaced with single `["content/content.js"]`
- pdf.mjs marked as external — 3MB PDF.js library not bundled, imported at runtime from dist/chrome/lib/
- build:chrome, build:firefox, and build both targets work independently; clean dist/ before each build
- 136 tests still pass with 100% accuracy on 71-case corpus (tests run against src/, not dist/)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create esbuild build script and npm scripts** - `9f75677` (feat)
2. **Task 2: Verify build output correctness and test suite** - `44c9034` (chore)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `scripts/build.js` - esbuild pipeline: IIFE content bundle, ESM bundles, static asset copy, manifest transform, Firefox scaffold, watch mode, CLI arg parsing
- `package.json` - Added build, build:chrome, build:firefox, dev scripts; added esbuild ^0.27.0 to devDependencies

## Decisions Made
- `external: ['../lib/pdf.mjs']` path is relative to the output file's location (`dist/chrome/offscreen/offscreen.js`), so `../lib/pdf.mjs` resolves correctly to `dist/chrome/lib/pdf.mjs` at extension runtime
- No `globalName` set on IIFE bundle — content scripts are pure side-effects; wrapping in `(() => {})` is sufficient
- Watch mode (`--watch` or `dev` script) targets Chrome only; `--chrome-only` implied by watch flag

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- dist/chrome/ structure is established and correct for Chrome extension loading
- dist/firefox/ scaffold ready; Phase 16 adds actual JS bundles for the Firefox target
- esbuild build pipeline is the foundation for all future build steps (minification, source maps)
- Watch mode (npm run dev) supports fast development iteration

## Self-Check: PASSED

Files verified:
- scripts/build.js: FOUND
- package.json: contains "build" script
- dist/chrome/content/content.js: FOUND (IIFE, starts with `(()`)
- dist/chrome/background/service-worker.js: FOUND
- dist/chrome/offscreen/offscreen.js: FOUND (external ../lib/pdf.mjs import)
- dist/chrome/lib/pdf.mjs: FOUND
- dist/chrome/lib/pdf.worker.mjs: FOUND
- dist/chrome/manifest.json: FOUND (content_scripts = ["content/content.js"])
- dist/firefox/manifest.json: FOUND (gecko.id present)
- dist/chrome/shared/: NOT PRESENT (correct)

Commits verified:
- 9f75677: feat(15-02): create esbuild build pipeline and npm scripts - FOUND
- 44c9034: chore(15-02): verify build output correctness and test suite - FOUND

---
*Phase: 15-esbuild-build-pipeline*
*Completed: 2026-03-04*

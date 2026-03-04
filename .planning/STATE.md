---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Firefox Port
status: completed
last_updated: "2026-03-04T23:57:04.117Z"
last_activity: "2026-03-04 — Phase 16-03 complete (Firefox human UAT: icon activation, citation generation, IndexedDB degradation all verified)"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 14 — Shared Code Extraction (ready to plan)

## Current Position

Phase: 16 of 17 (Firefox Extension)
Plan: 03 complete — Firefox human verification (all FOX requirements confirmed in real browser)
Status: Phase 16 COMPLETE — all 3 plans done, ready for Phase 17
Last activity: 2026-03-04 — Phase 16-03 complete (Firefox human UAT: icon activation, citation generation, IndexedDB degradation all verified)

Progress: [██████████] 100% (v2.0 Phase 16 complete — all FOX requirements satisfied)

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | TBD | — |
| Phase 14-shared-code-extraction P01 | 4 | 2 tasks | 7 files |
| Phase 14-shared-code-extraction P02 | 6 | 2 tasks | 5 files |
| Phase 15-esbuild-build-pipeline P01 | 2 | 2 tasks | 7 files |
| Phase 15-esbuild-build-pipeline P02 | 5 | 2 tasks | 2 files |
| Phase 15-esbuild-build-pipeline P03 | 10 | 2 tasks | 2 files |
| Phase 16-firefox-extension P01 | 4 | 2 tasks | 3 files |
| Phase 16-firefox-extension P02 | 2min | 2 tasks | 1 files |
| Phase 16-firefox-extension P03 | 5min | 2 tasks | 0 files |

## Accumulated Context

### Decisions

All v1.0–v1.2 decisions archived in PROJECT.md Key Decisions table.

- [v2.0 scope]: webextension-polyfill excluded — Firefox natively supports chrome.* API
- [v2.0 scope]: Two separate manifests (Chrome + Firefox) — differences too numerous for patch approach
- [v2.0 scope]: Build-time minification deferred — keep source readable for extension store review
- [Phase 14-shared-code-extraction]: MSG has 17 keys (13 original + 4 cache) — plan spec listed 16 but service-worker.js is canonical
- [Phase 14-shared-code-extraction]: Classic script wrapper pattern: content/constants-globals.js duplicates constants as globals for content scripts until Phase 15 esbuild
- [Phase 14-shared-code-extraction]: Golden baseline updated for repetitive-text corpus tests: shared/matching.js defaults to last occurrence when no context (old text-matcher.js used first-occurrence indexOf)
- [Phase 14-shared-code-extraction]: offscreen.js imports only matchAndCite from shared/matching.js (normalizeText not needed as separate import; matchAndCite handles it internally)
- [Phase 15-esbuild-build-pipeline]: Wrapper files (constants-globals.js, text-matcher.js) deleted — Phase 14 transitional files no longer needed with ES module imports
- [Phase 15-esbuild-build-pipeline]: Firefox manifest uses scripts array (not service_worker key) for background; omits offscreen and declarativeContent permissions; content scripts point to bundled content.js
- [Phase 15-esbuild-build-pipeline P02]: external: ['../lib/pdf.mjs'] path is relative to output file location (dist/chrome/offscreen/); resolves correctly to dist/chrome/lib/pdf.mjs at runtime
- [Phase 15-esbuild-build-pipeline P02]: No globalName on IIFE bundle — content scripts are pure side-effects; (() => {}) wrapper sufficient
- [Phase 15-esbuild-build-pipeline P02]: build:firefox produces manifest-only dist/firefox/ scaffold — Phase 16 adds actual JS bundles
- [Phase 15-esbuild-build-pipeline]: BUILD-04 satisfied by human UAT — user loaded dist/chrome/ in Chrome, generated citations on real Google Patents pages, confirmed functionally identical to src/ version
- [Phase 16-firefox-extension]: Firefox background uses tabs.onUpdated URL matching for icon activation — declarativeContent not supported in Firefox
- [Phase 16-firefox-extension]: IndexedDB degradation uses detect-once idbAvailable flag — on first InvalidStateError/UnknownError all IDB ops silently skipped, positionMapCache Map used as fallback
- [Phase 16-firefox-extension]: Firefox manifest.firefox.json: tabs permission + wasm-unsafe-eval CSP added for PDF.js WebAssembly support
- [Phase 16-firefox-extension]: Object entry point syntax (not outbase) for Firefox ESM bundle prevents dist/firefox/firefox/background.js path double-nesting
- [Phase 16-firefox-extension]: external: ['../lib/pdf.mjs'] in Firefox ESM config — relative to dist/firefox/background/ output location, resolves to dist/firefox/lib/pdf.mjs at runtime
- [Phase 16-firefox-extension]: Firefox extension human UAT passed — user confirmed all FOX requirements (FOX-01 through FOX-05) satisfied in real Firefox browser: load without errors, icon activation, column:line citations matching Chrome output, wasm-unsafe-eval CSP for PDF.js, IndexedDB degradation to in-memory Map

### Pending Todos

None.

### Blockers/Concerns

- [Phase 16 risk RESOLVED]: Firefox event page lifecycle — human UAT confirmed PDF.js parses successfully with no lifecycle interruption
- [Phase 16 risk RESOLVED]: PDF.js WASM + Firefox CSP — wasm-unsafe-eval added to manifest.firefox.json content_security_policy in Plan 01
- [Phase 16 risk RESOLVED]: Cloudflare Worker CORS — human UAT confirmed citation generation works, no CORS errors encountered with moz-extension:// origin

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix off-by-2 error in patent column line number calculation | 2026-03-03 | f5b86dd | [1-fix-off-by-2-error-in-patent-column-line](./quick/1-fix-off-by-2-error-in-patent-column-line/) |

## Session Continuity

Last activity: 2026-03-04 — Phase 16 Plan 03 complete (Firefox human verification: all FOX requirements confirmed in real browser)
Status: Phase 16 COMPLETE — Firefox MV3 extension fully built and verified
Next: Phase 17 (release / store submission packaging)

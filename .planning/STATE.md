---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Firefox Port
status: planning
last_updated: "2026-03-04T08:06:00Z"
last_activity: 2026-03-04 — Phase 15 Plan 02 complete (esbuild build pipeline)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 5
  completed_plans: 4
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 14 — Shared Code Extraction (ready to plan)

## Current Position

Phase: 15 of 17 (esbuild Build Pipeline)
Plan: 02 complete — Phase 15 complete
Status: In progress
Last activity: 2026-03-04 — Phase 15-02 complete (esbuild build pipeline, npm scripts, dist/ outputs)

Progress: [██░░░░░░░░] 25% (v2.0 milestone)

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

### Pending Todos

None.

### Blockers/Concerns

- [Phase 16 risk]: Firefox event page lifecycle during active PDF.js parse is MEDIUM confidence — empirical test needed during implementation
- [Phase 16 risk]: PDF.js WASM + Firefox CSP may require wasm-unsafe-eval in manifest.firefox.json — test in Phase 16
- [Phase 16 risk]: Cloudflare Worker CORS may need moz-extension:// origin explicitly allowed — verify in Phase 16

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix off-by-2 error in patent column line number calculation | 2026-03-03 | f5b86dd | [1-fix-off-by-2-error-in-patent-column-line](./quick/1-fix-off-by-2-error-in-patent-column-line/) |

## Session Continuity

Last activity: 2026-03-04 — Phase 15 Plan 02 complete (esbuild build pipeline)
Status: Phase 15 complete — ready for Phase 16 Firefox Port
Next: `/gsd:plan-phase 16` (Firefox Port)

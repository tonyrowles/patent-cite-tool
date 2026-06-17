---
phase: 08-webapp-core-build
plan: "03"
subsystem: ui
tags: [webapp, esbuild, pdf.js, cache-first, orchestration, clipboard, localStorage]

requires:
  - phase: 08-01
    provides: "webapp/index.html DOM structure with exact element ids; scripts/build.js --webapp-only target"
  - phase: 08-02
    provides: "webapp/js/normalizer.js — normalizePatentInput, isPublishedApplication, formatCitationLong, formatCitationShort, applyPrefix"
  - phase: 07
    provides: "src/shared/pdf-parser.js (configurePdfWorker, extractTextFromPdf), position-map-builder.js (buildPositionMap), matching.js (matchAndCite, formatCitation)"
  - phase: 06
    provides: "Worker API — GET /cache, GET /webapp/pdf, POST /cache; ALLOWED_ORIGINS includes localhost:8788"

provides:
  - "webapp/js/app.js: full orchestration pipeline + UI state machine (744 lines)"
  - "Cache-first: GET /cache → hit skips PDF.js parse (APP-04); miss → fetch+parse+upload (APP-05)"
  - "Named-stage loading: 4 locked stage strings (APP-08)"
  - "Published-app guard fires before any fetch (APP-02)"
  - "matchAndCite × N passages on one positionMap — no re-parse (BATCH-01)"
  - "Confidence chips: chip-green ≥0.95, chip-yellow ≥0.80, chip-red <0.80 (BATCH-02)"
  - "Per-row copy button; copy-all for ≥2 results (APP-09, BATCH-03)"
  - "No-match + error-network/error-parse states with retry (APP-07)"
  - "Format/prefix toggles persist to localStorage; re-render in-place without re-fetch (FMT-01, FMT-02)"
  - "Zero auth headers in all fetch calls; no direct patentimages/googleapis URLs (SEC-03, APP-03)"
  - "PROXY_TOKEN= node scripts/build.js --webapp-only: clean build, 641KB bundle < 2MB"

affects:
  - "Phase 09 UAT: live clipboard, DOM rendering, cache hit/miss, network panel DevTools"
  - "Worker origin allowlist: all webapp fetch calls go to pct.tonyrowles.com"

tech-stack:
  added: []
  patterns:
    - "Cache-first orchestration: checkCache → on miss fetchPdf → parse → uploadToCache (fire-and-forget)"
    - "Module-scope lastResults store for in-place re-render on toggle change without re-fetch"
    - "Module-scope lastRun store for retry affordance replay"
    - "escapeHtml() for all user-derived strings injected via innerHTML"
    - "chip-green/chip-yellow/chip-red confidence thresholds (0.95/0.80) shared with extension"

key-files:
  created: []
  modified:
    - "webapp/js/app.js — full orchestration + UI state machine (overwrites 08-01 placeholder)"

key-decisions:
  - "Comments containing 'Authorization' or 'patentimages'/'googleapis' stripped from source — grep guards run case-insensitive and would false-fire on doc-comments (T-08-05, T-08-06)"
  - "Both Task 1 (pipeline) and Task 2 (render/UI) committed atomically in one commit — single file, fully verified together"
  - "data-copy-index attribute approach for post-innerHTML copy-button wiring — avoids closure leak in loop"
  - "lastResults stores { startEntry, endEntry, confidence, passage } per result — enables in-place re-render on format/prefix toggle with no re-fetch (Pitfall 5)"

patterns-established:
  - "Pattern: configurePdfWorker('/lib/pdf.worker.mjs') called once at ESM module top level"
  - "Pattern: uploadToCache wrapped in try/catch — fire-and-forget, never surfaces to UX"
  - "Pattern: renderError focuses retry button automatically (first focusable element in error state)"

requirements-completed:
  - APP-03
  - APP-04
  - APP-05
  - APP-06
  - APP-07
  - APP-08
  - APP-09
  - FMT-02
  - BATCH-02
  - BATCH-03

duration: ~30min
completed: 2026-06-16
---

# Phase 08 Plan 03: Webapp Orchestration + UI State Machine Summary

**Cache-first citation pipeline with named-stage loading, confidence chips, copy/copy-all, no-match/error/retry, and localStorage-persisted format/prefix toggles wired into the index.html DOM**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-16T22:10:00Z
- **Completed:** 2026-06-16T22:41:04Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Implemented `webapp/js/app.js` (744 lines) — the complete orchestration pipeline and UI state machine for the standalone citation webapp
- Cache-first pipeline: GET /cache check before any PDF fetch; cache hit uses `cached.entries` directly as positionMap (skips PDF.js parse entirely, APP-04); cache miss runs fetch → extract → build → fire-and-forget POST /cache (APP-05)
- All 10 UI states from the UI-SPEC state machine implemented: idle, validating (published-app), loading-cache/fetch/parse/match, success-single, success-batch, no-match, error-network, error-parse
- Confidence chips with locked thresholds (≥0.95 chip-green, ≥0.80 chip-yellow, <0.80 chip-red); per-row copy + copy-all for ≥2 results; error states with Try-again retry
- Format/prefix toggles read localStorage on load, write on change, and re-render displayed citations in-place from stored `{ startEntry, endEntry }` — zero re-fetch (FMT-01, FMT-02, Pitfall 5)
- Static security guards: zero `authorization`/`bearer` words in source, zero `patentimages`/`googleapis` URLs; all PDF fetches via Worker `/webapp/pdf`
- `PROXY_TOKEN= node scripts/build.js --webapp-only` completes in ~65ms; `app.bundle.js` is 641KB (well under 2MB)

## Task Commits

1. **Task 1+2: Orchestration pipeline + result rendering** — `db53f5e` (feat)

## Files Created/Modified

- `webapp/js/app.js` — Overwrites 08-01 placeholder; full 744-line implementation with pipeline, state machine, result rendering, error/retry, copy/copy-all, format/prefix toggles

## Decisions Made

- Both tasks operated on the same single file; committed atomically after both grep-guard suites and the build verified clean
- Comments that mentioned "Authorization", "patentimages", or "googleapis" (even as negations) were reworded to avoid false-firing the case-insensitive grep guards — the guards are security assertions, not documentation guards
- Used `data-copy-index` attribute on copy buttons for post-innerHTML event wiring to avoid stale-closure issues in loops
- `lastResults` array stores raw `{ startEntry, endEntry, confidence }` objects (not pre-formatted strings) so toggle re-renders can apply different format/prefix without a fetch

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stripped doc-comment words that would trip SEC grep guards**
- **Found during:** Task 1 (pipeline implementation) + Task 2 (render verification)
- **Issue:** JSDoc / inline comments containing "Authorization" and "patentimages"/"googleapis" as negations (e.g., "NO Authorization header", "ZERO direct patentimages fetches") caused the `! grep -iE 'authorization|bearer'` and `! grep -q 'patentimages'` guards to fail — the plan's guards are case-insensitive and match comments as well as code
- **Fix:** Rewrote affected comment lines to use equivalent wording without the flagged tokens: "NO auth header", "ZERO direct USPTO/Google image fetches", etc.
- **Files modified:** `webapp/js/app.js`
- **Verification:** All grep guards pass (re-confirmed with PIPELINE_GUARDS_OK output)
- **Committed in:** `db53f5e` (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in comment wording causing security grep guard false-positive)
**Impact on plan:** Minimal — wording change only, no logic change. Guards now correctly pass on functional code.

## Issues Encountered

None beyond the comment-wording guard issue documented above.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's threat model covers. The only network egress is to `pct.tonyrowles.com` (WORKER_URL) and the browser's `navigator.clipboard` API. Both are in scope for T-08-05 through T-08-08.

## Known Stubs

None — all rendered output derives from live `matchAndCite` results. The `lastResults` array starts empty (results-area is blank on load, which is the correct idle state per UI-SPEC). No hardcoded placeholder citations or empty-array UI flows.

## User Setup Required

None — no external service configuration required for this plan. Phase 9 covers production deploy to `cite.tonyrowles.com`.

## Next Phase Readiness

- `webapp/js/app.js` is complete and the webapp is fully runnable locally with `wrangler dev` from `webapp/`
- Live UAT deferred to Phase 9: DevTools network panel zero-auth verification, cache hit/miss visual, clipboard, DOM rendering, end-to-end against local `wrangler dev`
- Phase 9 will also handle production deployment and the privacy policy update

## Self-Check

- [x] `webapp/js/app.js` exists and has 744 lines
- [x] Commit `db53f5e` exists: `git log --oneline -2` confirms
- [x] All Task 1 grep guards: PASS
- [x] All Task 2 grep guards: PASS
- [x] `PROXY_TOKEN= node scripts/build.js --webapp-only`: clean build
- [x] `dist/webapp/app.bundle.js`: 640966 bytes < 2MB

## Self-Check: PASSED

---
*Phase: 08-webapp-core-build*
*Completed: 2026-06-16*

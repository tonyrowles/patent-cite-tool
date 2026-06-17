---
phase: 05-options-page-debug-mode-popup-fallback-live-uat
plan: 01
subsystem: ui
tags: [chrome-extension, options-page, content-script, shadow-dom, debug-mode]

# Dependency graph
requires:
  - phase: 04-report-dialog-ui-citation-ui-wiring
    provides: TRIG-04 guard in citation-ui.js; reportOutcome object shape; Report button DOM pattern
provides:
  - debugMode checkbox in options.html/options.js (DBG-01)
  - debugMode live-read in content-script.js via onChanged + cachedSettings (DBG-02)
  - Relaxed TRIG-04 guard in citation-ui.js with isGreenDebug plain-icon path (D-05)
affects: [05-02, 05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "debugMode threading: passed by value in reportOutcome object (no circular import)"
    - "isGreenDebug branch: textContent and inline styles conditioned on green-debug state"
    - "onChanged live-read: one line per key in sync branch (cachedSettings.key = changes.key.newValue)"

key-files:
  created: []
  modified:
    - src/options/options.html
    - src/options/options.js
    - src/content/content-script.js
    - src/content/citation-ui.js

key-decisions:
  - "debugMode threaded via reportOutcome object (not imported) to avoid circular dependency between citation-ui.js and content-script.js (RESEARCH Pattern 3)"
  - "TRIG-04 guard relaxed with OR-condition preserving literal substring 'confidenceTier !== green' for existing Vitest pin"
  - "isGreenDebug variable isolates green-debug styling: plain icon + transparent base on green, amber nudge on non-green"
  - "showReportDialog caller in citation-ui.js left unchanged (shadow, reportOutcome, rect, reportBtn) — plan 05-02 owns the mountContext refactor"

patterns-established:
  - "Per-key onChanged pattern: one if-guard per setting key in the sync area block"
  - "reportOutcome object as debugMode transport: category + confidenceTier + debugMode — avoids cross-module import for a boolean flag"

requirements-completed: [DBG-01, DBG-02]

# Metrics
duration: 15min
completed: 2026-06-13
---

# Phase 5 Plan 01: Debug Mode Options Checkbox + Live Content-Script Guard Summary

**debugMode checkbox in options page (chrome.storage.sync) with live per-citation guard relaxation in citation-ui.js showing a plain icon on green outcomes (no amber nudge)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-13T23:33:00Z
- **Completed:** 2026-06-13T23:48:49Z
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- DBG-01: options page debugMode checkbox follows includePatentNumber verbatim — storage.sync default false, auto-save on change, "Saved" feedback via showSaved
- DBG-02: content-script reads debugMode live via onChanged → cachedSettings; threaded into reportOutcome at both showCitationPopup call sites; toggling mid-session affects next citation with no reload
- D-05: citation-ui.js relaxed TRIG-04 guard shows plain icon ⚑ on green-debug (no amber background/color); amber nudge preserved for all non-green outcomes; aria-label retained on both paths
- TRIG-04 invariant preserved: literal substring `confidenceTier !== 'green'` kept in guard for Vitest pin; all 25 report-trigger-mapping tests pass; 158 total tests pass

## Task Commits

1. **Task 1: DBG-01 options checkbox (HTML + auto-save)** - `f53c205` (feat)
2. **Task 2: DBG-02 live-read + D-05 plain-icon green path** - `b6e9d67` (feat)

**Plan metadata:** _(added in final commit)_

## Files Created/Modified

- `src/options/options.html` - Added debugMode .setting-group after includePatentNumber; label "Debug Mode — always show Report button"; DBG-01 description text verbatim
- `src/options/options.js` - Added debugMode: false to sync.get defaults; debugModeCheckbox load + auto-save block following patentNumCheckbox pattern verbatim
- `src/content/content-script.js` - Added debugMode: false to DEFAULT_SETTINGS; added onChanged live-read line; added debugMode: cachedSettings.debugMode to both showCitationPopup reportOutcome objects
- `src/content/citation-ui.js` - Relaxed TRIG-04 guard to || reportOutcome.debugMode; added isGreenDebug variable; conditioned textContent and amber inline styles on !isGreenDebug

## Decisions Made

- The plan note said "Do NOT change the showReportDialog call signature in this plan beyond what already exists; the mountContext refactor lands in plan 05-02." The existing `showReportDialog(shadow, reportOutcome, rect, reportBtn)` call was left as-is in the click handler — fully compliant with plan scope.
- isGreenDebug computed as `reportOutcome.confidenceTier === 'green'` (not `=== 'green' && reportOutcome.debugMode`) because by the time this block is reached, debugMode must be true if confidenceTier is green (the outer guard already gates entry).

## Deviations from Plan

None — plan executed exactly as written. The amber inline styles were applied in `!isGreenDebug` branch exactly as specified in 05-PATTERNS.md and 05-UI-SPEC.md.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 05-02 can now refactor `showReportDialog` to accept a `mountContext` object (mode: 'shadow' | 'page') — the citation-ui.js caller still passes the legacy `shadow` parameter, which 05-02 will update
- Plan 05-03 adds the `#report` section to options.html and the hash-routing + page-mode dialog init to options.js
- Plan 05-04 adds the popup "Report a problem" link (CAP-05)
- debugMode is fully live end-to-end: toggle in options → next citation reflects the change with no extension reload

---
*Phase: 05-options-page-debug-mode-popup-fallback-live-uat*
*Completed: 2026-06-13*

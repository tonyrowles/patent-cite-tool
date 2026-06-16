---
phase: 04-report-dialog-ui-citation-ui-wiring
plan: "03"
subsystem: ui
tags: [shadow-dom, citation-ui, content-script, report-button, trig-04, cap-03]

requires:
  - phase: 04-02
    provides: showReportDialog(shadow, reportOutcome, selectionRect, triggerEl) exported from report-dialog.js

provides:
  - Report button (cite-report-btn) injected into .cite-row adjacent to Copy button for non-green outcomes
  - Report button injected into error popup for failure/no-match/tool-not-working outcomes
  - showCitationPopup extended with optional trailing reportOutcome param (default null)
  - showErrorPopup extended with optional trailing reportOutcome param (default null)
  - mapConfidenceTier(confidence) helper in content-script.js
  - mapOutcomeToReportCategory(errorCode, confidence) helper in content-script.js
  - reportOutcome threaded at all 7 trigger sites in content-script.js
  - TRIG-04 green-hidden invariant enforced: button not appended on green outcomes
  - cite-report-btn CSS using only UI-SPEC tokens (nudge amber tint, hover, focus outline)

affects:
  - 04-04 (phase 04 plan 04 — any remaining wiring or test plan)
  - 05 (phase 5 debug mode will relax TRIG-04 invariant)

tech-stack:
  added: []
  patterns:
    - "Optional trailing param extension: new reportOutcome = null appended to showCitationPopup/showErrorPopup; all existing sites compatible"
    - "Non-green guard pattern: if (reportOutcome && reportOutcome.confidenceTier !== 'green') for TRIG-04"
    - "Outcome mapping pure functions: mapConfidenceTier + mapOutcomeToReportCategory in content-script.js"
    - "Trigger wiring: reportOutcome object computed at call site and passed as trailing param"

key-files:
  created: []
  modified:
    - src/content/citation-ui.js
    - src/content/content-script.js

key-decisions:
  - "TRIG-04 implementation: button simply not appended (not display:none) when confidenceTier === 'green' or reportOutcome is null — clean DOM, no hidden elements"
  - "All non-green outcomes use nudge label '⚑ Report a problem' (D-06 — every failure/yellow/error is shown with nudge text, consistent with UI-SPEC nudge state table)"
  - "Error popup report button appended as a child of popup div (not inside a .cite-row — error popups have no cite-row); button layout uses flex on error popup"
  - "Transient 'PDF is still being analyzed' passes null reportOutcome — no button (not a failure, just waiting)"
  - "Grant CITATION_RESULT no-position-map and other errors both map to tool_not_working per RESEARCH trigger-site map"

patterns-established:
  - "Pattern: pass undefined for matchedText when extending showCitationPopup with reportOutcome to avoid positional arg shift"
  - "Pattern: mapOutcomeToReportCategory(null, confidence) for success paths; mapOutcomeToReportCategory(message.error, null) for error paths"

requirements-completed: [CAP-03, TRIG-01, TRIG-02, TRIG-03, TRIG-04]

duration: 18min
completed: 2026-06-13
---

# Phase 4 Plan 03: Report Button + Trigger Wiring Summary

**cite-report-btn injected into .cite-row and error popups with amber nudge label; outcome-to-category mapping via mapConfidenceTier + mapOutcomeToReportCategory wires all 7 trigger sites; TRIG-04 green-hidden invariant enforced by non-appending guard**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-13T14:20:00Z
- **Completed:** 2026-06-13T14:38:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `showCitationPopup` and `showErrorPopup` signatures with optional trailing `reportOutcome = null` param; all existing call sites stay compatible
- Injected `cite-report-btn` into `.cite-row` (citation popup) and directly into error popup `div` for non-green outcomes; clicking calls `showReportDialog(shadow, reportOutcome, rect, reportBtn)`
- Added `mapConfidenceTier` and `mapOutcomeToReportCategory` pure helpers to `content-script.js`; threaded `reportOutcome` at all 7 trigger sites per the RESEARCH trigger-site map
- TRIG-04 invariant: button is simply not appended when `confidenceTier === 'green'` or `reportOutcome` is null
- XPORT-06 invariant preserved: no `fetch(WORKER_REPORT_URL` in any `src/content/` file

## Task Commits

1. **Task 1: Report button in .cite-row + CSS + extended signatures** - `e15d093` (feat)
2. **Task 2: Outcome mapping + trigger wiring at all content-script.js call sites** - `6b44a1a` (feat)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/src/content/citation-ui.js` - Added `import { showReportDialog }`, extended both signatures with `reportOutcome = null`, injected `cite-report-btn` in citation row and error popup, added `.cite-report-btn` CSS (nudge amber tint, hover, focus outline)
- `/home/fatduck/patent-cite-tool/src/content/content-script.js` - Added `mapConfidenceTier` + `mapOutcomeToReportCategory` helpers; wired `reportOutcome` at all 7 trigger sites (app success, app null, grant PDF status, grant CITATION_RESULT success, no-match, no-position-map, other error)

## Decisions Made

- **D-06 nudge label for all non-green**: Per UI-SPEC the nudge state applies to "failure / yellow / Worker-error" — since ALL non-green outcomes use the nudge label, `reportBtn.textContent = '⚑ Report a problem'` unconditionally (no icon-only variant needed in actual usage; the guard `confidenceTier !== 'green'` is already the condition for non-appending).
- **Error popup button placement**: Appended as a child of the popup `div` directly (error popups have no `.cite-row`). The `cite-report-btn` CSS includes `min-height: 24px` for touch target.
- **Transient state gets null**: `'PDF is still being analyzed, please wait...'` passes `null` reportOutcome so no button appears — this is a waiting state, not a failure.

## Deviations from Plan

None — plan executed exactly as written. The UI-SPEC specifies that non-green outcomes always show the nudge label (all failure/yellow/error states), so a single code path handles both citation and error popups without a mode branch.

## Issues Encountered

None. Build, static checks, and XPORT-06 guard all pass. Pre-existing 5 test failures in `warning-01-transport-tag.test.js` and `v40-auto-fix-yaml.test.js` are unrelated v4.x infrastructure tests that were failing before this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The Report button is now end-to-end wired: non-green outcomes surface the button; clicking opens `showReportDialog` from Plan 02
- `mapConfidenceTier` and `mapOutcomeToReportCategory` are available in `content-script.js` for any future trigger sites
- TRIG-04 invariant holds and is greppable: `confidenceTier !== 'green'` guard in `citation-ui.js`
- Phase 5 Debug Mode (DBG-01/02) will relax TRIG-04 to always show the button — the current guard in `citation-ui.js` is the insertion point

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. `showReportDialog` is called from within the extension's own shadow DOM; no host-page data crosses the button→dialog boundary. T-04-11 (button DOM injection) and T-04-12 (green-hidden bypass) mitigations verified: `textContent` only (no innerHTML), `confidenceTier !== 'green'` guard gates `appendChild`.

## Self-Check: PASSED

- `src/content/citation-ui.js` modified: FOUND
- `src/content/content-script.js` modified: FOUND
- Task 1 commit `e15d093`: FOUND
- Task 2 commit `6b44a1a`: FOUND
- `cite-report-btn` in citation-ui.js: FOUND
- `showReportDialog` import in citation-ui.js: FOUND
- `mapConfidenceTier` in content-script.js: FOUND
- `mapOutcomeToReportCategory` in content-script.js: FOUND
- `confidenceTier !== 'green'` guard: FOUND
- XPORT-06: no fetch in src/content/: PASS
- Build: PASS

---
*Phase: 04-report-dialog-ui-citation-ui-wiring*
*Completed: 2026-06-13*

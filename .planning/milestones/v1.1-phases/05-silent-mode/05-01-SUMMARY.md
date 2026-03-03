---
phase: 05-silent-mode
plan: 01
subsystem: ui
tags: [chrome-extension, clipboard, content-script, silent-mode]

# Dependency graph
requires:
  - phase: 04-citation-output
    provides: applyPatentPrefix, showCitationPopup, showErrorPopup, generateCitation, handleCitationResult
  - phase: 03-text-matching
    provides: findParagraphCitation (paragraph citation for applications)
  - phase: 02-pdf-parsing
    provides: chrome.storage.local currentPatent with parsed PositionMap
provides:
  - Silent trigger mode option in popup triggerMode dropdown
  - preSilentCitation() for mouseup pre-computation of citations
  - Document-level copy event handler intercepting Ctrl+C to append citations
  - lastCitationResult state with fingerprint validation for stale citation prevention
  - handleCitationResult silent branch storing result instead of showing popup
affects: [05-02-silent-mode-toasts, future-silent-mode-plans]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-compute async citation on mouseup, read synchronously in copy event handler"
    - "Fingerprint validation (first 40 chars + length) prevents stale citation from wrong selection"
    - "One-shot result consumption (lastCitationResult = null after use)"
    - "Silent mode bypasses citationInProgress guard since it has no loading UI"

key-files:
  created: []
  modified:
    - src/popup/popup.html
    - src/content/content-script.js

key-decisions:
  - "Fingerprint uses selectedText.substring(0,40) + ':' + selectedText.length for stale detection (validated in research)"
  - "Silent mode sets citationInProgress = false before return in handleCitationResult to avoid blocking non-silent modes"
  - "Copy event handler returns early (no-op) on pending/plain states rather than failing loudly"
  - "event.preventDefault() required for clipboardData.setData() -- without it browser silently ignores custom data"

patterns-established:
  - "Silent mode pre-computation pattern: mouseup triggers async work, copy handler reads result synchronously"
  - "Type-discriminated result object: { type: 'plain' | 'pending' | 'success' | 'failure', ... }"

requirements-completed: [SLNT-01, SLNT-02, SLNT-03, SLNT-04, SLNT-05]

# Metrics
duration: 1min
completed: 2026-03-02
---

# Phase 5 Plan 01: Silent Mode Core Clipboard Interception Summary

**Silent Ctrl+C mode with pre-computed citations appended via clipboard interception, handling grants (service worker roundtrip), applications (DOM), and all fallback states**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-02T18:27:15Z
- **Completed:** 2026-03-02T18:28:53Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added "Silent (Ctrl+C)" option to the trigger mode dropdown in popup.html
- Implemented `preSilentCitation()` that pre-computes citations on mouseup for both patent types (applications via DOM, grants via service worker)
- Added document-level copy event handler that appends pre-computed citation to clipboard text via `clipboardData.setData()` + `event.preventDefault()`
- Updated `handleCitationResult()` with silent mode branch that stores `lastCitationResult` instead of showing popup
- Added fingerprint validation to prevent stale citations from a prior selection being applied to a new one

## Task Commits

Each task was committed atomically:

1. **Task 1: Add silent trigger mode option and implement clipboard interception** - `7b03e0f` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `src/popup/popup.html` - Added `<option value="silent">Silent (Ctrl+C)</option>` to triggerMode select
- `src/content/content-script.js` - Added lastCitationResult/lastSelectionFingerprint state, preSilentCitation(), copy event listener, silent branch in handleCitationResult(), silent case in handleSelection(), citationInProgress guard bypass for silent mode

## Decisions Made
- Fingerprint uses `selectedText.substring(0, 40) + ':' + selectedText.length` -- validated in research as sufficient for common patent selection patterns without over-engineering
- Silent mode branch in `handleCitationResult()` sets `citationInProgress = false` and returns early, preserving the popup flow intact for non-silent modes
- Copy handler is a no-op on `pending` state (citation not ready yet) -- allows plain copy with no interference rather than blocking the user
- `event.preventDefault()` is called only on `success` with confidence >= 0.80; all failure paths allow default browser copy behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Silent mode core data flow is complete: mouseup -> preSilentCitation -> lastCitationResult -> copy handler -> clipboard
- Plan 02 will add toast feedback (showSuccessToast, showFailureToast) at the marked TODO comments in the copy handler
- The `rect` stored in lastCitationResult is already threaded through for toast positioning in Plan 02

---
*Phase: 05-silent-mode*
*Completed: 2026-03-02*

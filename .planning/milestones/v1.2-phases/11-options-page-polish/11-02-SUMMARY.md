---
phase: 11-options-page-polish
plan: 02
subsystem: ui
tags: [chrome-extension, popup, chrome-runtime, options-page]

# Dependency graph
requires:
  - phase: 11-options-page-polish (plan 01)
    provides: Options page (src/options/options.html + options.js) with all three settings, auto-save, chrome.runtime.openOptionsPage() as navigation target

provides:
  - Simplified popup (src/popup/popup.html + popup.js) with patent status display only — settings controls removed
  - Settings link at popup bottom that calls chrome.runtime.openOptionsPage()
  - Complete settings migration: options page is now the sole settings interface

affects: [12-privacy-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "chrome.runtime.openOptionsPage() for cross-navigation from popup to options tab (focuses existing tab, no duplicate)"
    - "e.preventDefault() on href='#' links to prevent scroll/navigation side effects before Chrome API call"

key-files:
  created: []
  modified:
    - src/popup/popup.html
    - src/popup/popup.js

key-decisions:
  - "Settings link styled as small (11px) muted (#6b7280) underlined text — unobtrusive since popup's primary purpose is status display"
  - "settingsLink wrapped in null check (if settingsLink) — defensive pattern consistent with existing popup.js style"
  - "e.preventDefault() added to click handler — prevents href='#' from causing any scroll or hash navigation before openOptionsPage() fires"

patterns-established:
  - "Popup-to-options navigation: getElementById('settingsLink') click handler with preventDefault + chrome.runtime.openOptionsPage()"

requirements-completed: [OPTS-02]

# Metrics
duration: 1min
completed: 2026-03-03
---

# Phase 11 Plan 02: Popup Simplification Summary

**Popup stripped to status-only display with a muted Settings link that opens the options page via chrome.runtime.openOptionsPage(), completing the settings migration from popup to options page**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-03T21:24:01Z
- **Completed:** 2026-03-03T21:25:00Z
- **Tasks:** 1 (Task 2 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Removed settings section (hr separator, div#settings with h2, all three setting controls: triggerMode select, displayMode select, includePatentNumber checkbox) from popup.html
- Removed settings CSS rules (.setting-group, .setting-label, .setting-select) from popup.html
- Added centered "Settings" text link (id=settingsLink) below the content div in popup.html
- Removed all settings load/save code (chrome.storage.sync.get and all addEventListener handlers) from popup.js — no more sync storage calls in popup
- Added openOptionsPage handler for settingsLink click in popup.js — e.preventDefault() + chrome.runtime.openOptionsPage()
- All status display logic (DOMContentLoaded wrapper, storage.local.get, patent status switch with all case branches) preserved completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove settings from popup and add options page link** - `61994dc` (feat)

## Files Created/Modified

- `src/popup/popup.html` - Settings section removed, settings CSS rules removed, Settings text link added below content div
- `src/popup/popup.js` - All chrome.storage.sync code removed, openOptionsPage click handler added for settingsLink

## Decisions Made

- Settings link styled as small (11px) muted (#6b7280) underlined text link — unobtrusive placement at bottom since patent status is the popup's primary purpose
- Null check on settingsLink before addEventListener — matches defensive style already used in popup.js (e.g., patentNumCheckbox conditionals)
- e.preventDefault() in click handler — prevents href="#" from causing scroll or hash navigation artifacts before the Chrome API call fires

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Settings migration complete: options page (Plan 11-01) is the sole settings interface; popup (Plan 11-02) navigates there via openOptionsPage
- Phase 11 complete — both plans finished
- Phase 12 (privacy policy hosting) needed to replace placeholder href="#" on privacyLink anchor in options.html
- Manual Chrome verification still pending (Task 2 checkpoint): reload extension, verify no settings in popup, verify Settings link opens options tab, verify options page auto-save still works

## Self-Check: PASSED

- FOUND: src/popup/popup.html
- FOUND: src/popup/popup.js
- FOUND: .planning/phases/11-options-page-polish/11-02-SUMMARY.md
- FOUND: commit 61994dc (feat(11-02): simplify popup to status-only display with settings link)
- FOUND: commit f897f4e (docs(11-02): complete popup simplification plan)

---
*Phase: 11-options-page-polish*
*Completed: 2026-03-03*

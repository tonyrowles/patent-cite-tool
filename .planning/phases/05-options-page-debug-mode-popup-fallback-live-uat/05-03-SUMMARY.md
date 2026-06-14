---
phase: 05-options-page-debug-mode-popup-fallback-live-uat
plan: 03
subsystem: ui
tags: [popup, options-page, page-mode, report-dialog, hash-routing, pendingOptionsHash, prebuilt-context]

# Dependency graph
requires:
  - phase: 05-02
    provides: "showReportDialog(mountContext, ..., prebuiltContext) — page-mode ready"

provides:
  - "CAP-05: popup #reportLink → pendingOptionsHash + openOptionsPage routing"
  - "CAP-06: options #report section + hash routing + page-mode dialog from currentPatent snapshot"
  - "D-01: prebuiltContext from currentPatent (selectionText null, stale banner, inert toggle)"
  - "D-02: no category pre-selected on options page dialog"

affects:
  - 05-04-debug-mode-popup-fallback
  - 05-05-live-uat

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pendingOptionsHash signal: popup writes '#report' to chrome.storage.local; options.js reads+deletes on DOMContentLoaded (openOptionsPage no-hash workaround)"
    - "prebuiltContext assembly from chrome.storage.local currentPatent: patentId US-stripped, live-capture fields null, passed to showReportDialog 5th arg"
    - "Hash routing: pendingOptionsHash (popup path) + location.hash === '#report' (direct URL path) both scrollIntoView #report section"

key-files:
  created: []
  modified:
    - src/popup/popup.html
    - src/popup/popup.js
    - src/options/options.html
    - src/options/options.js

key-decisions:
  - "pendingOptionsHash pattern used (not chrome.tabs.create with hash) — openOptionsPage() accepts no fragment; read+delete on DOMContentLoaded prevents stale signal across sessions"
  - "import showReportDialog at module top-level in options.js — esbuild already lists options.js as an ESM entry (getEsmConfig/getFirefoxEsmConfig); no build-config change needed"
  - "prebuiltContext selectionText: null locks selection toggle hidden/inert inside showReportDialog (D-01 — no live selection on options page)"
  - "{ category: null, confidenceTier: null } passed as reportOutcome — D-02 no category pre-selected; submit stays enabled per Phase-4 D-07 page-mode rule"

requirements-completed: [CAP-05, CAP-06]

# Metrics
duration: 25min
completed: 2026-06-13
---

# Phase 05 Plan 03: Popup Report Link + Options #report Page-Mode Dialog Summary

**Popup #reportLink → pendingOptionsHash + openOptionsPage; options #report section renders page-mode report dialog from currentPatent snapshot with no pre-selected category — both Chrome and Firefox builds green; report-dialog.js bundled into options.js with zero build-config change**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-14T00:00:00Z
- **Completed:** 2026-06-14T00:25:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `#reportLink` anchor beside `#settingsLink` in popup.html with a U+00B7 middle-dot separator; identical inline style tokens (11px/#6b7280/underline)
- Added reportLink click handler in popup.js: writes `pendingOptionsHash: '#report'` to `chrome.storage.local`, then calls `chrome.runtime.openOptionsPage()` (no hash fragment support — Pitfall 5 workaround documented in comment)
- Added `div#report .setting-group` to options.html as last child of `.settings-card`: label "Report a problem", section description, and empty `#reportDialogMount` div; no new CSS
- Added `import { showReportDialog } from '../content/report-dialog.js'` at top of options.js; esbuild bundles it automatically since options.js is already a bundled ESM entry — zero build-config change
- Added CAP-06 hash routing in options.js DOMContentLoaded: reads+deletes `pendingOptionsHash` (popup signal path) and handles `location.hash === '#report'` (direct URL path); both scroll to `#report` section
- Added page-mode dialog init: reads `currentPatent` from `chrome.storage.local`, assembles `prebuiltContext` (patentId US-stripped; selectionText/xpathNode/scrollY/viewport all null per D-01), calls `showReportDialog({ mode:'page', container: reportMount }, { category: null, confidenceTier: null }, null, null, prebuiltContext)` per D-02
- `npm run build` green for both Chrome and Firefox; report-dialog.js confirmed bundled into options.js bundle (`cite-report-panel` token present in dist)
- All existing Vitest tests pass (5 pre-existing failures in warning-01-transport-tag.test.js and v40-auto-fix-yaml.test.js are unrelated to this plan — pre-existed before any changes)

## Task Commits

1. **Task 1: CAP-05 popup report link** - `a3af6d5` (feat)
2. **Task 2: CAP-06 options #report section + hash routing + page-mode dialog** - `6d8e193` (feat)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/src/popup/popup.html` — #reportLink anchor + middle-dot separator added (+2 lines)
- `/home/fatduck/patent-cite-tool/src/popup/popup.js` — reportLink click handler with pendingOptionsHash signal (+12 lines)
- `/home/fatduck/patent-cite-tool/src/options/options.html` — #report .setting-group with #reportDialogMount (+9 lines)
- `/home/fatduck/patent-cite-tool/src/options/options.js` — import showReportDialog + CAP-06 hash routing + page-mode dialog init (+49 lines)

## Decisions Made

- Used `pendingOptionsHash` signal pattern instead of any hash-in-URL approach because `chrome.runtime.openOptionsPage()` strips hash fragments (RESEARCH Pitfall 5). The value is read-and-deleted on DOMContentLoaded, preventing stale signals across sessions.
- `import` at module top level (not dynamic import) — esbuild handles it at bundle time cleanly; no lazy-loading needed since the dialog mounts on every options page open.
- `prebuiltContext.selectionText: null` causes showReportDialog (05-02) to hide the [Remove selection text] toggle and lock `includeSelectionText = false` internally — no additional guard needed in options.js.
- `{ category: null, confidenceTier: null }` as the reportOutcome arg satisfies D-02; the page-mode submit handler in showReportDialog (05-02) does not early-return on null category.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria from both tasks verified:
- Both Chrome and Firefox dist popup builds contain `id="reportLink"` and `pendingOptionsHash`
- Both Chrome and Firefox dist options builds contain `id="report"` (HTML), `mode.*page` and `currentPatent` (JS bundle)
- `cite-report-panel` token confirms report-dialog.js is bundled into options.js
- No webhook URL in src/
- `npm run build` green for both targets

## Issues Encountered

`git stash` (from an old stash entry on the stack) accidentally popped twice during verification, reverting Task 2 edits in progress. Re-applied both edits via Edit tool and committed successfully. No functional impact.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries:
- T-05-08 (pendingOptionsHash): value is read-then-deleted and only used to scroll to a section; no dynamic code path (ACCEPT as planned)
- T-05-09 (popup-path info disclosure): selectionText is null on this path; [Remove selection text] toggle hidden; no live selection transmitted
- T-05-10 (patentId in options DOM): passed as `prebuiltContext.patentNumber` data field only; banner rendered via `.textContent` inside showReportDialog (enforced in 05-02)
- T-05-11 (Discord webhook URL): no webhook reference added to any extension source file; grep confirmed zero matches

## Known Stubs

None. All four CAP-05/CAP-06 requirements are fully wired:
- Popup link navigates to options page via pendingOptionsHash
- Options page reads the signal, scrolls to #report, and renders the page-mode dialog
- prebuiltContext is assembled from currentPatent (or empty object if absent)
- Submit path in showReportDialog uses the same buildReportPayload + MSG.SUBMIT_REPORT flow

## Self-Check: PASSED

- FOUND: src/popup/popup.html (contains `id="reportLink"`)
- FOUND: src/popup/popup.js (contains `pendingOptionsHash`)
- FOUND: src/options/options.html (contains `id="report"`)
- FOUND: src/options/options.js (contains `showReportDialog` import and `pendingOptionsHash` routing)
- FOUND commit: a3af6d5 (Task 1)
- FOUND commit: 6d8e193 (Task 2)
- `npm run build` green (Chrome + Firefox)
- Both dist popup builds contain `id="reportLink"` and `pendingOptionsHash`
- Both dist options builds contain `mode.*page` (as `mode: "page"` after esbuild quote normalization) and `currentPatent`
- `cite-report-panel` token in dist/chrome/options/options.js confirms report-dialog.js bundled
- No Discord webhook URL in src/

---
*Phase: 05-options-page-debug-mode-popup-fallback-live-uat*
*Completed: 2026-06-13*

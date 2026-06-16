---
phase: 05-options-page-debug-mode-popup-fallback-live-uat
plan: 02
subsystem: ui
tags: [shadow-dom, report-dialog, focus-trap, discriminated-union, page-mode, prebuilt-context]

# Dependency graph
requires:
  - phase: 04-report-dialog-ui-citation-ui-wiring
    provides: "showReportDialog(shadow, ...) + installFocusTrap + Phase-4 shadow-mode dialog"

provides:
  - "showReportDialog(mountContext, ...) discriminated union — shadow and page modes from single function"
  - "installFocusTrapPage — document.activeElement variant for page DOM"
  - "prebuiltContext injection path — options page supplies context without extractPatentInfo"
  - "stale-context banner (.textContent only, T-05-04 XSS guard)"
  - "selection-toggle hidden/locked when selectionText is null (page mode)"
  - "inline confirmation <p> for success/queued/rate-limited in page mode"
  - "both citation-ui.js callers updated to { mode:'shadow', root:shadow }"

affects:
  - 05-03-options-page-dialog-wiring
  - 05-04-debug-mode-popup-fallback

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated-union mountContext: { mode:'shadow', root:ShadowRoot } | { mode:'page', container:HTMLElement } threads mount target through entire dialog lifecycle"
    - "prebuiltContext injection: caller (options.js) supplies patent context; submit handler bypasses extractPatentInfo when non-null"
    - "Mode-aware teardown: dismissDialog conditionally restores focus (shadow only); clickOutsideHandler checks host.contains vs container.contains"
    - "installFocusTrapPage mirrors installFocusTrap body with document.activeElement substitution"

key-files:
  created: []
  modified:
    - src/content/report-dialog.js
    - src/content/citation-ui.js

key-decisions:
  - "let context + let errors declared before if/else branch (no var) — clean block-scoped prebuiltContext path"
  - "Stale banner appended to panel before radio group using panel.appendChild (not panel.prepend) to keep it inside the panel element and above radios"
  - "Selection toggle hidden (not removed) when hasSelection is false — CSS display:none preserves DOM for potential re-show"
  - "Rate-limited in page mode keeps panel open with inline error (btnRow.insertAdjacentElement); success/queued removes panel and appends confirmation paragraph to container"
  - "selectionRect && mountContext.mode === 'shadow' double-guard on positioning block prevents null.style crash (Pitfall 1)"

patterns-established:
  - "Pattern: getCitationHost ban — report-dialog.js must never call getCitationHost( (static Vitest guard in report-trigger-mapping.test.js:208-211)"
  - "Pattern: installFocusTrapPage — identical to installFocusTrap except document.activeElement and document.addEventListener"

requirements-completed: [CAP-06]

# Metrics
duration: 30min
completed: 2026-06-13
---

# Phase 05 Plan 02: showReportDialog mountContext Refactor Summary

**showReportDialog refactored to discriminated-union mountContext with prebuiltContext injection, installFocusTrapPage, page-mode stale banner, inline confirmation, and both citation-ui.js callers updated — shadow path byte-behavior-identical**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-13T16:51:00Z
- **Completed:** 2026-06-13T16:57:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Refactored `showReportDialog` signature to `(mountContext, reportOutcome, selectionRect, triggerEl, prebuiltContext = null)` where mountContext is `{ mode:'shadow', root:ShadowRoot } | { mode:'page', container:HTMLElement }`
- Added `installFocusTrapPage(panelEl, onEscape)` using `document.activeElement` instead of `shadowRoot.activeElement` (Pitfall 2 resolution)
- Page-mode prebuiltContext injection path: submit handler branches on `prebuiltContext` non-null to bypass `extractPatentInfo()` (Pitfall 3 / T-05-07)
- Stale-context banner `cite-report-stale-banner` set via `.textContent` only (T-05-04 XSS guard)
- Selection toggle hidden and `includeSelectionText` locked false when `effectiveSelectionText` is null
- Inline `<p>` confirmations for success/queued/rate-limited in page mode (no showSuccessToast/showFailureToast — UI-SPEC §4g)
- Both citation-ui.js callers updated to `{ mode:'shadow', root:shadow }` — shadow path unchanged
- All 83 existing Vitest suites pass; `npm run build` green for both targets

## Task Commits

Both tasks landed in a single atomic commit (interleaved changes in the same two files):

1. **Task 1 + Task 2: Thread mountContext + page-mode behavior** - `121a213` (feat)

**Plan metadata:** (will be added in final commit)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/src/content/report-dialog.js` — showReportDialog refactored with mountContext discriminated union, mountTarget resolution, mode-aware positioning/dismiss/click-outside, installFocusTrapPage, prebuiltContext branch in submit handler, stale banner, selection toggle hide, inline page-mode confirmations (+282 lines, -76 lines)
- `/home/fatduck/patent-cite-tool/src/content/citation-ui.js` — both showReportDialog callers updated to pass `{ mode:'shadow', root:shadow }` (showCitationPopup line 189, showErrorPopup line 315)

## Decisions Made

- Used `let context; let errors;` declared before if/else branch (not `var`) to avoid leaking hoisted declarations from the prebuiltContext path into the shadow path.
- Stale banner inserted via `panel.appendChild` (not `panel.prepend`) so it appears first within the panel element before the radio group, which itself is `panel.appendChild(radioGroup)` next.
- Rate-limited page-mode response keeps the panel open and inserts an error paragraph above btnRow (`btnRow.insertAdjacentElement('beforebegin', rateErrEl)`); success and queued dismiss the panel first then append confirmation to the container.
- Selection toggle visibility determined from `effectiveSelectionText` (diagnostics.selectionText in shadow mode, prebuiltContext.selectionText in page mode) — guards both modes at the same code site.
- Null category allowed through to `buildReportPayload` in page mode (D-02); shadow mode keeps the existing defensive early-return on null category.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria from both tasks verified:
- `getCitationHost(` grep count = 0 in report-dialog.js
- Both citation-ui.js callers contain `mode: 'shadow'`
- `installFocusTrapPage` exported and uses `document.activeElement`
- Stale banner uses `.textContent` (no `.innerHTML`)
- All 83 Vitest tests pass unchanged

## Issues Encountered

None.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced by this plan. The stale-context banner reads from prebuiltContext.patentNumber (sourced from chrome.storage.local currentPatent.patentId) and sets it via .textContent — T-05-04 mitigation applied as required. No new surfaces beyond what is already in the plan's threat model.

## Known Stubs

None. The page-mode dialog is fully wired: prebuiltContext injection, stale banner, inline confirmations, and focus trap all implemented. The options.js consumer (plan 05-03) will supply the prebuiltContext from chrome.storage.local.

## Next Phase Readiness

- `showReportDialog` ready for import by `src/options/options.js` in plan 05-03
- esbuild ESM entry for options.js already present (scripts/build.js getEsmConfig); importing report-dialog.js will bundle cleanly
- `installFocusTrapPage` exported and available for any additional page-mode consumers
- Shadow path not regressed; Phase-4 in-citation dialog behavior identical

## Self-Check: PASSED

- FOUND: src/content/report-dialog.js
- FOUND: src/content/citation-ui.js
- FOUND commit: 121a213
- All 83 Vitest tests pass
- `npm run build` green (Chrome + Firefox)
- `grep -c "getCitationHost(" src/content/report-dialog.js` = 0

---
*Phase: 05-options-page-debug-mode-popup-fallback-live-uat*
*Completed: 2026-06-13*

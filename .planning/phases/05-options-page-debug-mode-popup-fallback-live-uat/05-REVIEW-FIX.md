---
phase: 05-options-page-debug-mode-popup-fallback-live-uat
fixed_at: 2026-06-13T17:46:00Z
review_path: .planning/phases/05-options-page-debug-mode-popup-fallback-live-uat/05-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-06-13T17:46:00Z
**Source review:** .planning/phases/05-options-page-debug-mode-popup-fallback-live-uat/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (3 Critical + 4 Warning; 2 Info skipped per instructions)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Storage callback overwrites `includeSelectionText = false` lock

**Files modified:** `src/content/report-dialog.js`
**Commit:** `6cbf6d9`
**Applied fix:** Wrapped the `includeSelectionText = !saved` and `selectionRow.style.display` lines inside the `.then()` callback behind `if (hasSelection)`. When `hasSelection` is false the lock stays at `false` and the toggle stays hidden; `submitBtn.disabled = false` still runs unconditionally in both branches so submit is unblocked in all cases.

---

### CR-02: Page-mode submit crashes with empty `patentNumber` or null category

**Files modified:** `src/content/report-dialog.js`, `src/options/options.js`
**Commit:** `f52cfa3`
**Applied fix:**
- `options.js`: Changed `data.currentPatent || {}` to a proper guard: if `!patent || !patent.patentId`, render a placeholder paragraph ("Visit a US patent on Google Patents...") in `reportMount` and return early, preventing `buildReportPayload` from ever seeing an empty `patentNumber`.
- `report-dialog.js`: Replaced the shadow-only `if (!selectedCategory && mountContext.mode === 'shadow') return;` guard with a universal `if (!selectedCategory)` block that renders an inline `.cite-report-category-hint` validation message ("Please select a problem category.") and returns early — in both modes. Updated the misleading comment that said "Submit is valid with null category".

---

### CR-03: Stale `pendingOptionsHash` when options tab already open

**Files modified:** `src/options/options.js`
**Commit:** `1483a28`
**Applied fix:** Extracted the page-mode dialog init into an idempotent `initPageModeDialog()` function guarded by a `dialogMounted` flag (checked synchronously before the async storage read, and re-checked after the async gap). Added a `chrome.storage.onChanged` listener inside `DOMContentLoaded` that fires when `pendingOptionsHash` changes to `'#report'` on an already-open page: it consumes the key, scrolls to `#report`, and calls `initPageModeDialog()` (which is a no-op if the dialog was already mounted by the DOMContentLoaded path). WR-04 was incorporated here: both `chrome.storage.local.remove('pendingOptionsHash')` calls (the DOMContentLoaded path and the onChanged path) now use a callback form `remove(key, () => { /* fire-and-forget */ })`.

---

### WR-01: Green-debug Report button inherits amber CSS class styles

**Files modified:** `src/content/citation-ui.js`
**Commit:** `c2ef112`
**Applied fix:** Added an `if (isGreenDebug) { ... } else { ... }` branch. The `isGreenDebug` branch explicitly sets `background: 'transparent'`, `color: '#6b7280'`, `fontWeight: '400'`, `padding: '2px 4px'` — overriding the amber values from the base `.cite-report-btn` CSS class. The `else` branch retains the existing amber inline styles for genuine failure/non-green outcomes. All tokens asserted by the static-grep test (`isGreenDebug`, `'⚑'`, `setAttribute('aria-label'`) remain present.

---

### WR-02: "Page address" shows extension URL in page mode

**Files modified:** `src/content/report-dialog.js`
**Commit:** `c8e82e3`
**Applied fix:** Replaced the unconditional `window.location.href` with a ternary: in page mode, display `https://patents.google.com/patent/US${prebuiltContext.patentNumber}` (or `'(no prior patent)'` when `patentNumber` is empty); in shadow mode, keep `window.location.href` (the Google Patents URL). The "What's included" preview now shows the same URL the payload actually sends.

---

### WR-03: Page-mode click-outside discards partial report

**Files modified:** `src/content/report-dialog.js`
**Commit:** `7f02e40`
**Applied fix:** Wrapped `document.addEventListener('mousedown', clickOutsideHandler)` inside `if (mountContext.mode === 'shadow')` in the `setTimeout` callback. In page mode the listener is never installed. `dismissDialog()` still calls `document.removeEventListener` (a safe no-op if the listener was never added). Escape (via `installFocusTrapPage`) and Cancel remain the dismiss paths in page mode.

---

### WR-04: No error handler on `remove('pendingOptionsHash')`

**Files modified:** `src/options/options.js`
**Commit:** `1483a28` (incorporated into CR-03 commit)
**Applied fix:** Both `chrome.storage.local.remove('pendingOptionsHash')` call-sites (DOMContentLoaded path and onChanged path) now use the callback form with an empty callback body, consistent with the fire-and-forget error-handling pattern used elsewhere in the codebase.

---

## Skipped Issues

None — all 7 in-scope findings were successfully fixed.

---

_Fixed: 2026-06-13T17:46:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

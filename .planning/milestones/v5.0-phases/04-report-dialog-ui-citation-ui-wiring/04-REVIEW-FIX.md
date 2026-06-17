---
phase: 04-report-dialog-ui-citation-ui-wiring
fixed_at: 2026-06-13T15:00:00Z
review_path: .planning/phases/04-report-dialog-ui-citation-ui-wiring/04-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-06-13T15:00:00Z
**Source review:** .planning/phases/04-report-dialog-ui-citation-ui-wiring/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04)
- Fixed: 7
- Skipped: 0
- IN-01 and IN-02: excluded per instruction (Info tier)

## Fixed Issues

### CR-01: Firefox ring buffer is dead — `[BG]` prefix not in `EXTENSION_PREFIXES`

**Files modified:** `src/content/report-dialog.js`, `src/firefox/background.js`
**Commit:** `29e61f0`
**Applied fix:** Added `'[BG]'` to `EXTENSION_PREFIXES` array in `report-dialog.js` (line 30). Updated the comment in `firefox/background.js:29` from "Captures [Firefox]-prefixed" to "Captures [BG]-prefixed" to accurately describe what the buffer now captures from the Firefox background context.

---

### CR-02: Stale citation-popup `mousedown` handler destroys host while Report dialog is open

**Files modified:** `src/content/citation-ui.js`, `src/content/report-dialog.js`
**Commit:** `a56903a`
**Applied fix:** Added a module-level `_popupClickOutsideHandler` variable in `citation-ui.js` and a new `cancelPopupClickOutside()` export. Changed the `showCitationPopup` `setTimeout` block to store the handler in `_popupClickOutsideHandler` and clear it on natural dismiss. Imported `cancelPopupClickOutside` in `report-dialog.js` and called it as the first statement in `showReportDialog()` before the dialog becomes live, so an outside click while the Report dialog is open cannot reach `dismissCitationUI()`.

---

### CR-03: Privacy race — `includeSelectionText` defaults `true` before storage resolves

**Files modified:** `src/content/report-dialog.js`
**Commit:** `6058ace`
**Applied fix:** Set `submitBtn.disabled = true` immediately after button creation. Set `submitBtn.disabled = false` in both the `.then()` branch (preference loaded successfully) and the `.catch()` branch (storage error — fall back to include) of the `chrome.storage.local.get('reportDialogRemoveSelectionText')` promise. The Submit button is non-interactive until the checkbox reflects the user's saved preference.

---

### WR-01: `getPdfParseStatus` cache-hit branch unreachable for main PDF-found path

**Files modified:** `src/background/service-worker.js`, `src/firefox/background.js`
**Commit:** `3f993e6`
**Applied fix:** Added `patent.source = null;` immediately after `patent.status = STATUS.PARSED;` in `handleCacheHitResult()` in `service-worker.js` (line ~402), and in the cache-hit block of `handlePdfLinkFound()` in `firefox/background.js` (line ~186). Both paths previously left `source: 'google'` from initial storage, making `getPdfParseStatus`'s `source === null` guard unreachable.

---

### WR-02: `getOsString` Windows 11 branch is unreachable; Windows 10 mis-detected

**Files modified:** `src/content/report-dialog.js`, `tests/unit/report-dialog-diagnostics.test.js`, `tests/unit/report-dialog.test.js`
**Commits:** `0b3c6d5`, `3eb9b40`
**Applied fix:** Replaced the two-branch Windows check (`'Windows NT 10'` then dead `'Windows NT 11'`) with a single `'Windows NT 10.0'` check returning `'Windows 10/11'`. Both Win10 and Win11 report `Windows NT 10.0` in the UA; the old code incorrectly returned `'Windows 10'` for all Windows users. Updated the matching test expectation in both `report-dialog-diagnostics.test.js` and `report-dialog.test.js` (the second file was discovered as a new failure and fixed in a follow-up commit).

---

### WR-03: Bare `extractPatentInfo` reference throws `ReferenceError` in isolated module context

**Files modified:** `src/content/report-dialog.js`
**Commit:** `a51a161`
**Applied fix:** Changed `extractPatentInfo ? extractPatentInfo() : null` to `typeof extractPatentInfo === 'function' ? extractPatentInfo() : null` at the field-list build site (previously line 711, now line 718 after prior edits). Now consistent with the submit handler's guard already present at line 954.

---

### WR-04: Generic catch-all error message misleads when submit fails due to missing patent number

**Files modified:** `src/content/report-dialog.js`
**Commit:** `47a91d3`
**Applied fix:** Changed the `catch` block toast from `'Too many reports in a short period — please wait a few minutes'` to `'Report could not be sent — please try again'`. The rate-limit string is now exclusively used in the `result?.rateLimited` branch inside the `try` block, which is the only context where it is factually correct.

---

## Post-Fix Verification

- `npm run build`: green (Chrome + Firefox bundles, no errors)
- `npm test`: `2 failed | 86 passed (88)` test files — exactly the 5 pre-existing failures in `tests/unit/warning-01-transport-tag.test.js` and `tests/e2e/scripts/v40-auto-fix-yaml.test.js`. No new failures introduced.

---

_Fixed: 2026-06-13T15:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

---
phase: 04-report-dialog-ui-citation-ui-wiring
reviewed: 2026-06-13T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/content/report-dialog.js
  - src/content/citation-ui.js
  - src/content/content-script.js
  - src/background/service-worker.js
  - src/firefox/background.js
findings:
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 4 implements the Shadow DOM report dialog, Report button wiring into citation popups, outcome→category trigger mapping, and the PAY-08 error ring buffer. XSS hygiene is solid — all page-derived and user-supplied strings use `textContent` without exception. The TRIG-04 green-tier guard is correctly wired at every call site. Focus-trap logic, dismiss ordering (panel removed before toast), and ring-buffer recursion protection are all implemented correctly.

Three critical defects are present:

1. Firefox background logs under the `[BG]` prefix, which is not in `EXTENSION_PREFIXES`. Every Firefox background `console.warn`/`error` is silently dropped by the ring buffer — the PAY-08 diagnostic buffer is effectively non-functional on Firefox.
2. The stale `mousedown` handler installed by the citation popup continues listening after the Report dialog opens, and it calls `dismissCitationUI()` (which destroys the entire host) rather than the dialog's own `dismissDialog()`. A click outside while the dialog is open tears down the host from under the live dialog shadow reference.
3. A privacy race: `includeSelectionText` defaults to `true` (include) and is overwritten only after the `chrome.storage.local.get` promise resolves. If the user previously saved "Remove selection text = true" and submits the form before storage resolves, selection text is included in the payload in violation of their stored preference.

---

## Critical Issues

### CR-01: Firefox ring buffer is dead — `[BG]` prefix not in `EXTENSION_PREFIXES`

**File:** `src/firefox/background.js:110,316` / `src/content/report-dialog.js:30`

**Issue:** `installErrorBuffer` filters on `EXTENSION_PREFIXES = ['[SW]', '[PCT]', '[Offscreen]', '[Firefox]']`. The Firefox background script tags every `console.warn` and `console.error` call with `[BG]` (e.g. `'[BG] Lookup failed:'`, `'[BG] Context menu send failed:'`). `isExtensionTagged` returns false for `[BG]`, so `appendToBuffer` is never called. The PAY-08 ring buffer captures zero Firefox background errors — the entire diagnostic is silent on Firefox.

The file comment at `firefox/background.js:29` says "Captures [Firefox]-prefixed" but the actual log tag used throughout the file is `[BG]`.

**Fix:** Either add `'[BG]'` to `EXTENSION_PREFIXES` in `report-dialog.js`:
```js
const EXTENSION_PREFIXES = ['[SW]', '[PCT]', '[Offscreen]', '[Firefox]', '[BG]'];
```
Or (preferred, avoids tag proliferation) change all `console.warn('[BG] ...')` calls in `firefox/background.js` to use `[Firefox]`:
```js
// firefox/background.js:110
}).catch(err => console.warn('[Firefox] Context menu send failed:', err.message));

// firefox/background.js:316
console.warn('[Firefox] Lookup failed:', error.message);
```

---

### CR-02: Stale citation-popup `mousedown` handler destroys host while Report dialog is open

**File:** `src/content/citation-ui.js:244-251` / `src/content/report-dialog.js:898-907`

**Issue:** `showCitationPopup` installs an anonymous `mousedown` handler on `document` (after a 100 ms delay) that calls `dismissCitationUI()` when the click target is outside `citationHost`. This handler is never removed when the Report dialog opens. When the user clicks outside the host while the Report dialog is active, the popup's handler fires `dismissCitationUI()`, which removes `citationHost` from the DOM and nulls both module-level variables in `citation-ui.js`.

The `shadow` reference captured in `showReportDialog`'s closure is now a detached shadow root. Subsequent operations (`dismissDialog` → `showSuccessToast` or `showFailureToast`) call `getCitationHost()`, which creates a new, repositioned host — the toast appears but the dismiss-cleanup of `removeTrap` and `document.removeEventListener(clickOutsideHandler)` operate on the old detached shadow and stale handler. In practice this means the report dialog's own click-outside handler remains on `document` indefinitely (memory leak + phantom dismiss calls on future interactions).

**Fix:** `showReportDialog` must remove or neutralise the popup's stale click-outside handler before the dialog goes live. The cleanest approach is to expose a cancellation mechanism from `citation-ui.js`. One pattern:

```js
// citation-ui.js: return a cancel handle from showCitationPopup
let _popupClickOutsideHandler = null;
export function cancelPopupClickOutside() {
  if (_popupClickOutsideHandler) {
    document.removeEventListener('mousedown', _popupClickOutsideHandler);
    _popupClickOutsideHandler = null;
  }
}
// inside showCitationPopup:
setTimeout(() => {
  _popupClickOutsideHandler = function handler(e) { ... };
  document.addEventListener('mousedown', _popupClickOutsideHandler);
}, 100);
```

Then call `cancelPopupClickOutside()` at the top of `showReportDialog`.

---

### CR-03: Privacy race — `includeSelectionText` defaults `true` before storage resolves

**File:** `src/content/report-dialog.js:575,810-817`

**Issue:** `includeSelectionText` is initialised to `true` at line 575 (meaning selection text will be included). The saved user preference is loaded asynchronously via `chrome.storage.local.get('reportDialogRemoveSelectionText')` (line 810). If the user had previously set "Remove selection text = true" and submits the form (clicks "Submit report") before the storage promise resolves — which is plausible on slow storage or immediately after the dialog opens — `includeSelectionText` is still `true` and the payload includes `selectionText` in violation of their stored preference.

The same race means `selectionToggle.checked` will initially be unchecked (false), so the "What's included" panel also briefly shows the selection text row when the user's preference is to hide it.

**Fix:** Disable the Submit button until storage resolves, then re-enable it:

```js
submitBtn.disabled = true; // hold until preference loaded

chrome.storage.local.get('reportDialogRemoveSelectionText').then((stored) => {
  const saved = stored.reportDialogRemoveSelectionText === true;
  selectionToggle.checked = saved;
  includeSelectionText = !saved;
  selectionRow.style.display = saved ? 'none' : '';
  submitBtn.disabled = false; // now safe to submit
}).catch(() => {
  submitBtn.disabled = false; // default: include selection text
});
```

---

## Warnings

### WR-01: `getPdfParseStatus` cache-hit branch unreachable for main PDF-found path

**File:** `src/content/report-dialog.js:210` / `src/background/service-worker.js:396-410` / `src/firefox/background.js:180-193`

**Issue:** `getPdfParseStatus` returns `'cache-hit'` only when `patent.status === 'parsed' && patent.source === null`. When a cache hit occurs via the `PDF_LINK_FOUND` path (Google PDF present), the storage record was initialised with `source: 'google'` (service-worker.js:195, firefox/background.js:170) and neither `handleCacheHitResult` (service-worker.js:396-410) nor the Firefox equivalent (firefox/background.js:180-193) resets `source` to `null`. So `patent.source` remains `'google'` after a cache hit on that path, and `getPdfParseStatus` returns `'success'` rather than `'cache-hit'`.

Only the `PDF_LINK_NOT_FOUND` path (which initialises `source: null`) correctly reaches the `'cache-hit'` branch. This makes the `pdfParseStatus` diagnostic field inaccurate for the common case.

**Fix:** In both `handleCacheHitResult` (service-worker.js) and the Firefox `handlePdfLinkFound` cache-hit block (firefox/background.js), set `patent.source = null` before writing to storage:

```js
patent.status = STATUS.PARSED;
patent.source = null;   // ← add this
patent.lineCount = message.lineCount;
// ...
```

---

### WR-02: `getOsString` Windows 11 branch is unreachable; Windows 10 mis-detected

**File:** `src/content/report-dialog.js:242-243`

**Issue:** Line 242 matches `'Windows NT 10'` (a 14-character prefix). Line 243's `ua.includes('Windows NT 10.0')` is dead code because `'Windows NT 10.0'` contains `'Windows NT 10'` as a strict substring — line 242 always matches first and returns `'Windows 10'`. Additionally `'Windows NT 11'` is not a real UA string; Windows 11 reports `'Windows NT 10.0'` in its user agent. Consequently all Windows 11 users are misidentified as `'Windows 10'`.

**Fix:**
```js
export function getOsString() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows NT 10.0')) {
    // Both Windows 10 and 11 use "Windows NT 10.0"; no reliable UA distinction
    return 'Windows 10/11';
  }
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('macOS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return null;
}
```

---

### WR-03: Bare `extractPatentInfo` reference at line 711 throws `ReferenceError` in isolated module context

**File:** `src/content/report-dialog.js:711`

**Issue:** Line 711 uses `extractPatentInfo ? extractPatentInfo() : null`. In the esbuild IIFE bundle this resolves to the content-script local function. However in any isolated ES module context (unit tests importing `report-dialog.js` directly, storybook, etc.) `extractPatentInfo` is an undeclared identifier and the bare reference throws `ReferenceError` before the ternary short-circuits. By contrast the submit handler at line 940 correctly uses `typeof extractPatentInfo === 'function'`.

**Fix:** Apply the `typeof` guard consistently:
```js
// line 711
const patentInfo = typeof extractPatentInfo === 'function' ? extractPatentInfo() : null;
```

---

### WR-04: Generic catch-all error message misleads when submit fails due to missing patent number

**File:** `src/content/report-dialog.js:1003-1010`

**Issue:** If `extractPatentInfo()` returns null at submit time (navigation away from patent page between dialog open and submit), `patentNumber` is empty string `''`, and `buildReportPayload` throws `'context.patentNumber is required and must not be empty'`. The catch block at line 1003 shows the user `'Too many reports in a short period — please wait a few minutes'` — a rate-limit message that is factually wrong for this failure mode. The user is told to wait when the real problem is they navigated away from the patent page.

**Fix:** Distinguish builder validation errors from network/rate-limit errors:
```js
} catch (err) {
  dismissDialog();
  const msg = err?.message?.includes('patentNumber')
    ? 'Could not determine patent — please try again on a patent page'
    : 'Report could not be sent — please try again';
  showFailureToast(msg, selectionRect);
}
```

---

## Info

### IN-01: `getBrowserString` returns full `Chrome/X.Y.Z.W` version but PAY-03 requires low-fidelity

**File:** `src/content/report-dialog.js:226-232`

**Issue:** `getBrowserString` matches `Chrome\/[\d.]+` which returns e.g. `Chrome/125.0.6422.112` — a four-part version string. The function doc says "low-fidelity" and gives examples `'Chrome/125'`, `'Firefox/127'`. The full patch version is technically more than low-fidelity and slightly violates the spirit of PAY-03 (no full UA). In practice the 4-part version is not a privacy fingerprinting risk compared to the full UA, but it is inconsistent with the documented contract.

**Fix:** Trim to major version only:
```js
export function getBrowserString() {
  const ua = navigator.userAgent;
  const m = ua.match(/Chrome\/(\d+)/) ?? ua.match(/Firefox\/(\d+)/);
  return m ? m[0].replace(/\.\d+.*/, '') : null;
  // e.g. 'Chrome/125' not 'Chrome/125.0.6422.112'
}
```

---

### IN-02: Submit button z-order puts "Submit" before "Cancel" in tab order but right-to-left visually

**File:** `src/content/report-dialog.js:848-852`

**Issue:** `submitBtn` is appended before `cancelBtn` in the DOM (lines 850-851) inside a `flex-end` row. This makes the visual render order `[Submit] [Cancel]` (left to right), but most HIG conventions for confirmation dialogs place Cancel on the left and the primary action (Submit) on the right. Tab order also reaches Submit first. This is an a11y convention mismatch that may confuse keyboard users expecting Cancel to be the first/left button.

**Fix:** Append `cancelBtn` first so it appears on the left visually and in tab order:
```js
btnRow.appendChild(cancelBtn);
btnRow.appendChild(submitBtn);
```

---

_Reviewed: 2026-06-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

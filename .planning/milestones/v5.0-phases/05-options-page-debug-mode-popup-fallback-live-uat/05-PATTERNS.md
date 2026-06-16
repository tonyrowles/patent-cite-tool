# Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 8 source files + 2 UAT artifact files
**Analogs found:** 8 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/content/report-dialog.js` | utility/renderer | request-response | itself (existing `showReportDialog` + `installFocusTrap`) | self-refactor |
| `src/content/content-script.js` | controller | event-driven | itself (existing `onChanged` pattern lines 204-210) | self-extension |
| `src/content/citation-ui.js` | component | event-driven | itself (existing TRIG-04 guard line 170) | self-extension |
| `src/options/options.html` | config | — | `src/options/options.html` lines 214-224 (`includePatentNumber` group) | exact |
| `src/options/options.js` | controller | request-response | itself (existing `patentNumCheckbox` block lines 73-79) | self-extension |
| `src/popup/popup.html` | component | — | itself (`#settingsLink` div line 37-39) | self-extension |
| `src/popup/popup.js` | controller | request-response | itself (`settingsLink` handler lines 95-100) | self-extension |
| `05-UAT-RUNBOOK.md` (new) | utility/doc | batch | `tests/unit/report-trigger-mapping.test.js` static-grep pattern | partial-match |
| `05-UAT-RESULTS.md` (new) | utility/doc | batch | `tests/unit/report-trigger-mapping.test.js` assertion table layout | partial-match |
| New unit tests (node-env) | test | transform | `tests/unit/report-trigger-mapping.test.js` + `tests/unit/report-payload-builder.test.js` | role-match |

---

## Pattern Assignments

### `src/content/report-dialog.js` (utility/renderer, request-response)

**Analog:** itself — existing `showReportDialog` (line 567) and `installFocusTrap` (line 469).

**Current signature** (line 567):
```javascript
export function showReportDialog(shadow, reportOutcome, selectionRect, triggerEl) {
```

**Refactored signature** (D-08):
```javascript
export function showReportDialog(mountContext, reportOutcome, selectionRect, triggerEl)
// mountContext: { mode: 'shadow', root: ShadowRoot } | { mode: 'page', container: HTMLElement }
```

**Imports pattern** (lines 18-20):
```javascript
import { MSG } from '../shared/constants.js';
import { buildReportPayload } from '../shared/report-payload-builder.js';
import { showSuccessToast, showFailureToast, cancelPopupClickOutside } from './citation-ui.js';
```

**Mount pattern — shadow mode** (lines 587-589, 871):
```javascript
const styleEl = document.createElement('style');
styleEl.textContent = getReportDialogCSS();
shadow.appendChild(styleEl);
// ... build panel ...
shadow.appendChild(panel);
```
**Mount pattern — page mode** (Phase 5 addition): replace `shadow` with `mountContext.container`:
```javascript
mountContext.container.appendChild(styleEl);
// ... build panel ...
mountContext.container.appendChild(panel);
```

**Positioning guard** (lines 874-893) — the ENTIRE block must be guarded:
```javascript
const citationHost = shadow.host;
if (citationHost && selectionRect) {
  // ... absolute positioning ...
  citationHost.style.top = `${top}px`;
  citationHost.style.left = `${left}px`;
```
**Phase 5 guard** (wrap line 875 condition):
```javascript
if (selectionRect && mountContext.mode === 'shadow') {
  const citationHost = mountContext.root.host;
  // ... same absolute positioning block ...
}
// Page mode: no-op — panel is in document flow
```

**Dismiss pattern — shadow mode** (lines 899-908):
```javascript
function dismissDialog() {
  removeTrap();
  document.removeEventListener('mousedown', clickOutsideHandler);
  panel.remove();
  styleEl.remove();
  if (triggerEl && typeof triggerEl.focus === 'function') {
    triggerEl.focus();
  }
}
```
**Dismiss pattern — page mode** (Phase 5 variant): same body; drop `triggerEl.focus()` (no trigger in page mode per D-02).

**Click-outside handler — shadow mode** (lines 912-916):
```javascript
function clickOutsideHandler(e) {
  if (!citationHost || !citationHost.contains(e.target)) {
    dismissDialog();
  }
}
```
**Click-outside handler — page mode** (Phase 5 variant):
```javascript
function clickOutsideHandler(e) {
  if (!mountContext.container.contains(e.target)) {
    dismissDialog();
  }
}
```
100ms delay (line 919) is preserved in both modes.

**Focus trap — shadow mode** (`installFocusTrap`, lines 469-523):
```javascript
export function installFocusTrap(shadowRoot, panelEl, onEscape) {
  // ... FOCUSABLE selector, getFocusable(), handleKeydown() ...
  const active = shadowRoot.activeElement;  // LINE 499 — shadow-only
  // ...
  shadowRoot.addEventListener('keydown', handleKeydown);
  return () => shadowRoot.removeEventListener('keydown', handleKeydown);
}
```
**Focus trap — page mode** (`installFocusTrapPage`, Phase 5 addition):
Identical logic EXCEPT:
- Replace `shadowRoot.activeElement` with `document.activeElement`
- Replace `shadowRoot.addEventListener/removeEventListener` with `document.addEventListener/removeEventListener`
- `panelEl.contains(document.activeElement)` for boundary check

**extractPatentInfo guard** (lines 1042-1044 — existing pattern to extend):
```javascript
if (typeof extractPatentInfo === 'undefined') {
  // no-op fallback for isolated module loading (tests, etc.)
}
```
**Phase 5 extension (D-08 / Pitfall 3):** The submit handler at line 954 currently calls `extractPatentInfo()`. For page mode, a `prebuiltContext` parameter is injected by the caller (options.js). The submit handler must branch:
```javascript
// Line 954 area:
const patentInfoNow = (prebuiltContext)
  ? null
  : (typeof extractPatentInfo === 'function' ? extractPatentInfo() : null);
```
And build the `context` object from `prebuiltContext` when present.

**Submit handler pattern** (lines 934-1030): unchanged in structure; only the context-assembly branch above differs. `buildReportPayload`, `MSG.SUBMIT_REPORT`, `sendMessage` pattern all stay identical.

**Stale-context banner** (page-mode only, D-01 — new insertion before radioGroup):
```javascript
if (mountContext.mode === 'page') {
  const staleBanner = document.createElement('div');
  staleBanner.className = 'cite-report-stale-banner';
  // D-01: .textContent (never .innerHTML) — currentPatent.patentId is untrusted
  staleBanner.textContent = `Context from your most recent citation: US${context.patentNumber || '(none)'}`;
  panel.prepend(staleBanner);
}
```

**Selection toggle hidden when no selectionText** (D-01 — add after toggle build):
```javascript
const hasSelection = !!context.selectionText;
if (!hasSelection) {
  selectionToggleLabel.style.display = 'none';
  includeSelectionText = false;
}
```

**Inline confirmation (page-mode submit success)** — replaces toast calls when `mountContext.mode === 'page'`:
```javascript
// Instead of showSuccessToast / showFailureToast:
const confirmEl = document.createElement('p');
confirmEl.style.cssText = 'font-size:13px; color:#059669; padding:12px 0;';
confirmEl.textContent = 'Report sent — thank you.';
mountContext.container.appendChild(confirmEl);
```

---

### `src/content/content-script.js` (controller, event-driven)

**Analog:** itself — existing `DEFAULT_SETTINGS` (line 185), `chrome.storage.sync.get` (line 199), and `onChanged` listener (lines 204-210).

**DEFAULT_SETTINGS pattern** (lines 185-189):
```javascript
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
};
```
**DBG-02 addition** — append `debugMode: false`:
```javascript
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
  debugMode: false,   // DBG-01/02: default off; TRIG-04 holds until toggled
};
```

**onChanged live-read pattern** (lines 204-209):
```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.triggerMode) cachedSettings.triggerMode = changes.triggerMode.newValue;
    if (changes.displayMode) cachedSettings.displayMode = changes.displayMode.newValue;
    if (changes.includePatentNumber) cachedSettings.includePatentNumber = changes.includePatentNumber.newValue;
  }
});
```
**DBG-02 addition** — add one line inside the `if (area === 'sync')` block:
```javascript
if (changes.debugMode) cachedSettings.debugMode = changes.debugMode.newValue;
```

**showCitationPopup call site pattern** (lines 491-501, first call site):
```javascript
showCitationPopup(
  prefixedCitation,
  rect || currentSelectionRect,
  result.confidence,
  cachedSettings.displayMode,
  undefined,
  {
    category: mapOutcomeToReportCategory(null, result.confidence),
    confidenceTier: mapConfidenceTier(result.confidence),
  }
);
```
**DBG-02 addition** — thread `debugMode` into the `reportOutcome` object (avoids circular import — RESEARCH Pattern 3):
```javascript
  {
    category: mapOutcomeToReportCategory(null, result.confidence),
    confidenceTier: mapConfidenceTier(result.confidence),
    debugMode: cachedSettings.debugMode,   // DBG-02: read from cachedSettings at call time
  }
```
Apply the same addition to the second call site at lines 594-604.

---

### `src/content/citation-ui.js` (component, event-driven)

**Analog:** itself — existing TRIG-04 guard (lines 170-182).

**TRIG-04 guard pattern** (lines 170-182):
```javascript
// Report button (CAP-03 / TRIG-04): injected only when outcome is non-green
if (reportOutcome && reportOutcome.confidenceTier !== 'green') {
  const reportBtn = document.createElement('button');
  reportBtn.className = 'cite-report-btn';
  reportBtn.title = 'Report a problem';
  reportBtn.setAttribute('aria-label', 'Report a problem with this citation');
  // D-06: all non-green outcomes show the nudge label (failure/yellow/error)
  reportBtn.textContent = '⚑ Report a problem';
  reportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReportDialog(shadow, reportOutcome, rect, reportBtn);
  });
  row.appendChild(reportBtn);
}
```

**DBG-02 update** (D-05 locked: plain icon on green-debug, no amber):
```javascript
if (reportOutcome && (reportOutcome.confidenceTier !== 'green' || reportOutcome.debugMode)) {
  const reportBtn = document.createElement('button');
  reportBtn.className = 'cite-report-btn';
  reportBtn.title = 'Report a problem';
  reportBtn.setAttribute('aria-label', 'Report a problem with this citation');
  const isGreenDebug = reportOutcome.confidenceTier === 'green';
  // D-05: plain icon on green debug; nudge text + amber only on non-green outcomes
  reportBtn.textContent = isGreenDebug ? '⚑' : '⚑ Report a problem';
  if (!isGreenDebug) {
    reportBtn.style.background = 'rgba(245, 158, 11, 0.08)';
    reportBtn.style.color = '#92400e';
    reportBtn.style.fontSize = '13px';
    reportBtn.style.fontWeight = '500';
    reportBtn.style.padding = '2px 6px';
    reportBtn.style.borderRadius = '4px';
  }
  reportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReportDialog({ mode: 'shadow', root: shadow }, reportOutcome, rect, reportBtn);
  });
  row.appendChild(reportBtn);
}
```

**showReportDialog caller update** (line 179): the existing call must update to pass `mountContext`:
```javascript
// Before (line 179):
showReportDialog(shadow, reportOutcome, rect, reportBtn);
// After:
showReportDialog({ mode: 'shadow', root: shadow }, reportOutcome, rect, reportBtn);
```
There is a second call site in `showErrorPopup` around line 304 — same update applies.

---

### `src/options/options.html` (config)

**Analog:** itself — existing `includePatentNumber` `.setting-group` (lines 214-224).

**includePatentNumber group pattern** (lines 214-224) — copy verbatim:
```html
<!-- Include Patent Number -->
<div class="setting-group">
  <div class="setting-label">
    <span class="saved-feedback" id="patentNumSaved">Saved</span>
  </div>
  <div class="checkbox-row">
    <input type="checkbox" id="includePatentNumber">
    <label for="includePatentNumber">Include patent number</label>
  </div>
  <p class="setting-description" style="margin-top: 8px;">Prefix the citation with the patent number (e.g., "US10123456: Col. 5, ll. 12–14").</p>
</div>
```

**DBG-01 addition** — append after `includePatentNumber` group (before `</div>` that closes `.settings-card`):
```html
<!-- Debug Mode (DBG-01) -->
<div class="setting-group">
  <div class="setting-label">
    <span class="saved-feedback" id="debugModeSaved">Saved</span>
  </div>
  <div class="checkbox-row">
    <input type="checkbox" id="debugMode">
    <label for="debugMode">Debug Mode — always show Report button</label>
  </div>
  <p class="setting-description" style="margin-top: 8px;">
    Surfaces the Report button on every citation, including successful ones.
    Useful for catching confidently-wrong citations the tool didn't flag.
  </p>
</div>
```

**CAP-06 addition** — append after `debugMode` group (last `.setting-group`):
```html
<!-- Report a problem (CAP-06) -->
<div id="report" class="setting-group">
  <div class="setting-label">
    <label>Report a problem</label>
  </div>
  <p class="setting-description">
    Submit a bug report about a citation failure. Context from your most recent citation will be included automatically.
  </p>
  <div id="reportDialogMount"></div>
</div>
```

---

### `src/options/options.js` (controller, request-response)

**Analog:** itself — existing `patentNumCheckbox` block (lines 19, 23, 52-53, 73-79).

**Load pattern** (lines 44-57):
```javascript
chrome.storage.sync.get({
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
}, (settings) => {
  triggerSelect.value = settings.triggerMode;
  displaySelect.value = settings.displayMode;
  if (patentNumCheckbox) {
    patentNumCheckbox.checked = settings.includePatentNumber;
  }
  updateSilentHelp(settings.triggerMode);
});
```
**DBG-01 extension** — add `debugMode: false` to defaults and a load line:
```javascript
chrome.storage.sync.get({
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
  debugMode: false,             // DBG-01 addition
}, (settings) => {
  // ... existing lines ...
  if (debugModeCheckbox) debugModeCheckbox.checked = settings.debugMode;
});
```

**Auto-save listener pattern** (lines 73-79):
```javascript
if (patentNumCheckbox) {
  patentNumCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked }, () => {
      showSaved(patentNumSaved);
    });
  });
}
```
**DBG-01 listener** (copy verbatim, next block):
```javascript
const debugModeCheckbox = document.getElementById('debugMode');
const debugModeSaved = document.getElementById('debugModeSaved');
if (debugModeCheckbox) {
  debugModeCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ debugMode: debugModeCheckbox.checked }, () => {
      showSaved(debugModeSaved);
    });
  });
}
```

**CAP-06 hash routing + dialog init** (add at end of `DOMContentLoaded`, after existing listeners):
```javascript
// Hash routing — pendingOptionsHash from popup.js (CAP-05) + direct URL hash
chrome.storage.local.get('pendingOptionsHash', (data) => {
  if (data.pendingOptionsHash === '#report') {
    chrome.storage.local.remove('pendingOptionsHash');
    const reportSection = document.getElementById('report');
    if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
  }
});
if (location.hash === '#report') {
  const reportSection = document.getElementById('report');
  if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
}

// Page-mode dialog initialization (CAP-06 / D-07 / D-08)
const reportMount = document.getElementById('reportDialogMount');
if (reportMount) {
  chrome.storage.local.get('currentPatent', (data) => {
    const patent = data.currentPatent || {};
    const prebuiltContext = {
      patentNumber: (patent.patentId || '').replace(/^US/, ''),
      selectionText: null,          // D-01: no live selection on options page
      returnedCitation: null,
      confidenceTier: patent.confidenceTier || null,
      extensionVersion: chrome.runtime.getManifest().version,
      xpathNode: null,
      scrollY: null,
      viewportWidth: null,
      viewportHeight: null,
      pdfParseStatus: null,
    };
    showReportDialog(
      { mode: 'page', container: reportMount },
      { category: null, confidenceTier: null },   // D-02: no category pre-selected
      null,                                        // no selectionRect — page mode, document flow
      null                                         // no triggerEl
    );
  });
}
```

**Import addition** — options.js must import `showReportDialog` from the bundled or ES-module path. Since options.html loads `options.js` as a `<script>` (not via esbuild bundle), the executor must decide whether to bundle or use a dynamic import. Copy the `esbuild` entry-point pattern from the existing build config for guidance; `report-dialog.js` is currently only in the content-script bundle.

---

### `src/popup/popup.html` (component)

**Analog:** itself — existing `settingsLink` div (lines 37-39).

**settingsLink pattern** (lines 37-39):
```html
<div style="margin-top: 12px; text-align: center;">
  <a id="settingsLink" href="#" style="font-size: 11px; color: #6b7280; text-decoration: underline; cursor: pointer;">Settings</a>
</div>
```

**CAP-05 update** — replace the div to add the sibling link:
```html
<div style="margin-top: 12px; text-align: center;">
  <a id="settingsLink" href="#" style="font-size: 11px; color: #6b7280; text-decoration: underline; cursor: pointer;">Settings</a>
  <span style="font-size: 11px; color: #6b7280; margin: 0 6px;">·</span>
  <a id="reportLink" href="#" style="font-size: 11px; color: #6b7280; text-decoration: underline; cursor: pointer;">Report a problem</a>
</div>
```

---

### `src/popup/popup.js` (controller, request-response)

**Analog:** itself — existing `settingsLink` handler (lines 95-100).

**settingsLink pattern** (lines 95-100):
```javascript
const settingsLink = document.getElementById('settingsLink');
if (settingsLink) {
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}
```

**CAP-05 addition** — add after the `settingsLink` block (copy structure verbatim):
```javascript
const reportLink = document.getElementById('reportLink');
if (reportLink) {
  reportLink.addEventListener('click', (e) => {
    e.preventDefault();
    // chrome.runtime.openOptionsPage() accepts no hash/fragment parameter.
    // Signal the options page via chrome.storage.local (pendingOptionsHash pattern).
    chrome.storage.local.set({ pendingOptionsHash: '#report' }, () => {
      chrome.runtime.openOptionsPage();
    });
  });
}
```

---

### New UAT artifacts (`05-UAT-RUNBOOK.md` + `05-UAT-RESULTS.md`)

**Analog:** `tests/unit/report-trigger-mapping.test.js` — the static-grep assertion table layout (lines 207-232); `tests/unit/report-payload-builder.test.js` — the SCHEMA_ALLOWLIST and sub-step assertion pattern (lines 39-57).

**Runbook structure pattern** (from RESEARCH.md UAT automation split):
- Numbered step list per UAT-0N
- Each step labelled SCRIPTABLE or OPERATOR
- SCRIPTABLE steps include the exact bash command
- OPERATOR steps include the exact action and what to record

**Results table pattern** (from `report-trigger-mapping.test.js` describe/it layout):
```
| UAT | Step | Mode | Command/Action | Status | Evidence |
|-----|------|------|----------------|--------|---------|
```
Claude pre-fills all SCRIPTABLE rows with the command and leaves Status/Evidence blank. Operator fills MANUAL rows.

**Wrangler commands** (RESEARCH.md — verified against wrangler 4.54.0):
```bash
# List keys with fingerprint prefix
wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:"

# Get a specific record
wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>"

# Assert no ip field (PAY-01 check)
wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>" | \
  node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
    console.assert(!('ip' in r),'ip field present — PAY-03 violation'); \
    console.assert(r.fingerprint,'fingerprint missing'); \
    console.log('PAY-01 check: PASS');"
```

**Privacy grep commands** (UAT-04 — fully automatable):
```bash
# No webhook URL in repo
grep -r 'discord.com/api/webhooks' /home/fatduck/patent-cite-tool --exclude-dir=.git

# No fetch(WORKER_REPORT_URL in content scripts
grep -r 'fetch.*WORKER_REPORT_URL' /home/fatduck/patent-cite-tool/src/content/

# web-ext lint (package.json:31)
npm run test:lint

# Privacy policy URL accessible
curl -s -o /dev/null -w "%{http_code}" https://tonyrowles.github.io/patent-cite-tool/privacy
```

---

### New unit tests (node-env, `tests/unit/`)

**Analog:** `tests/unit/report-trigger-mapping.test.js` (IIFE-fallback pattern) + `tests/unit/report-payload-builder.test.js` (static-grep assertions).

**Test file structure pattern** (lines 1-35 of `report-trigger-mapping.test.js`):
```javascript
// tests/unit/<name>.test.js
//
// Coverage:
//   <requirement IDs and what is tested>
//
// Static-grep pattern mirrors report-trigger-mapping.test.js

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Static-grep assertion pattern** (lines 207-232 of `report-trigger-mapping.test.js`):
```javascript
describe('<guard name>', () => {
  it('<source file> contains/does NOT contain "<token>"', () => {
    const filePath = path.resolve(__dirname, '../../src/content/<file>.js');
    const src = readFileSync(filePath, 'utf8');
    expect(src).toContain('<token>');        // or .not.toContain
  });
});
```

**New tests to write** (per RESEARCH.md + CONTEXT.md):
1. `debugMode` default `false` in `DEFAULT_SETTINGS` — static-grep on `content-script.js`
2. `debugMode` in `onChanged` branch — static-grep on `content-script.js`
3. TRIG-04 guard now has `|| reportOutcome.debugMode` — static-grep on `citation-ui.js`
4. No amber nudge on green-debug path (static-grep: `isGreenDebug` token present in `citation-ui.js`)
5. `pendingOptionsHash` pattern: static-grep on `popup.js` (`pendingOptionsHash`) + `options.js` (`pendingOptionsHash`)
6. `showReportDialog` now accepts `mountContext` — static-grep `mode.*shadow\|mode.*page` in `report-dialog.js`

---

## Shared Patterns

### chrome.storage.sync auto-save
**Source:** `src/options/options.js` lines 73-79 (patentNumCheckbox block)
**Apply to:** `src/options/options.js` DBG-01 debugMode checkbox block
```javascript
if (patentNumCheckbox) {
  patentNumCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked }, () => {
      showSaved(patentNumSaved);
    });
  });
}
```

### showSaved feedback
**Source:** `src/options/options.js` lines 28-35
**Apply to:** DBG-01 `debugModeSaved` span
```javascript
function showSaved(el) {
  if (!el) return;
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
  }, 1500);
}
```

### openOptionsPage click handler
**Source:** `src/popup/popup.js` lines 95-100
**Apply to:** CAP-05 `reportLink` handler
```javascript
const settingsLink = document.getElementById('settingsLink');
if (settingsLink) {
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}
```

### onChanged live-read per key
**Source:** `src/content/content-script.js` lines 204-210
**Apply to:** DBG-02 `debugMode` line in the same block
```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.triggerMode) cachedSettings.triggerMode = changes.triggerMode.newValue;
    if (changes.displayMode) cachedSettings.displayMode = changes.displayMode.newValue;
    if (changes.includePatentNumber) cachedSettings.includePatentNumber = changes.includePatentNumber.newValue;
  }
});
```

### DOM XSS guard (.textContent)
**Source:** `src/content/report-dialog.js` line 708 (existing `makeFieldRow` pattern)
**Apply to:** stale-context banner (`cite-report-stale-banner`) in page-mode `showReportDialog`; `currentPatent.patentId` is untrusted data from extension storage.

### FOCUSABLE selector and focus-trap structure
**Source:** `src/content/report-dialog.js` lines 469-523 (`installFocusTrap`)
**Apply to:** `installFocusTrapPage` — copy the entire function body; change only `shadowRoot.activeElement` → `document.activeElement` and `shadowRoot.addEventListener/removeEventListener` → `document.addEventListener/removeEventListener`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `05-UAT-RUNBOOK.md` (UAT execution doc) | doc | batch | No existing UAT runbook; `04-HUMAN-UAT.md` is the nearest precedent but covers deferred items only, not a full scriptable/manual split runbook |
| `05-UAT-RESULTS.md` (evidence file) | doc | batch | No existing results-capture pattern in this project; structure derived from RESEARCH.md UAT automation split table |

---

## Critical Anti-Patterns (cite in plan must_haves)

These anti-patterns have existing test guards or architectural invariants that MUST NOT be violated:

| Anti-pattern | Guard | Consequence if violated |
|---|---|---|
| `getCitationHost(` called from `report-dialog.js` | `tests/unit/report-trigger-mapping.test.js:208-211` — asserts `.not.toContain('getCitationHost(')` | Existing Vitest test fails on CI |
| `shadowRoot.activeElement` in page-mode focus trap | RESEARCH Pitfall 2 | Tab key broken; no crash |
| `extractPatentInfo()` called without fallback check | `report-dialog.js:1042-1044` (existing guard) | Options page dialog submits blank `patentNumber` |
| `innerHTML` on stale-context banner | Security — RESEARCH Security Domain row 2 | XSS via `currentPatent.patentId` |
| `confidenceTier !== 'green'` token removed from `citation-ui.js` | `tests/unit/report-trigger-mapping.test.js:227-231` — asserts `.toContain("confidenceTier !== 'green'")` | Existing Vitest test fails on CI |
| Amber nudge on green-debug button | D-05 LOCKED | Design contract violation |
| `showSuccessToast`/`showFailureToast` called in page mode | RESEARCH Pattern 1 / UI-SPEC §4g | Toast requires `rect` from citation UI — crashes with `null` |

---

## Metadata

**Analog search scope:** `src/content/`, `src/options/`, `src/popup/`, `tests/unit/`
**Files scanned:** 9 source files + 4 test files
**Pattern extraction date:** 2026-06-13

# Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT - Research

**Researched:** 2026-06-13
**Domain:** Chrome/Firefox extension secondary UI surfaces + automated live UAT evidence collection
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Popup/options-initiated report captures last `currentPatent` snapshot from `chrome.storage.local`; live-capture-only fields absent on popup path; "What's included" preview must say e.g. "Context from your most recent citation: US…"; `[Remove selection text]` toggle inert/hidden when no selection text.
- **D-02:** Options-page dialog at `#report` pre-selects NO category; Submit stays enabled (category optional per Phase 4 D-07).
- **D-03:** Live UAT against PRODUCTION Worker `https://pct.tonyrowles.com/report`; real Discord + KV; NOT `X-PCT-Test-Mode`; test notes carry "v5.0 UAT-0N smoke".
- **D-04:** Maximum automation — Claude scripts `web-ext lint`, `wrangler kv key get/list`, build, grep guards, records evidence; operator does only irreducible browser steps (live submit, Chrome SW stop/restart). Claude cannot drive a real browser.
- **D-05:** Debug-Mode Report button on green uses plain icon (CAP-03 glyph), no amber nudge.
- **D-06:** DBG-02 live-read via `content-script.js` `onChanged` → `cachedSettings` pattern (lines 199-208); add `debugMode` to `DEFAULT_SETTINGS`.
- **D-07:** 'page' mode reuses Phase-4 anchored-panel card look, mounted inline at options `#report`; no Shadow DOM, no backdrop.
- **D-08:** Refactor `showReportDialog` to thread a mount-context/mode; shared form/payload/submit logic single-source; only mount + focus-trap root + dismiss differ.

### Claude's Discretion
- DBG-01 checkbox: follow `includePatentNumber` pattern verbatim.
- CAP-05 popup link: follow `settingsLink` → `openOptionsPage()` pattern; navigate to `#report` anchor.
- `options.js` hash routing on `DOMContentLoaded`.
- 'page'-mode focus-trap/dismiss differences and no-selection preview rendering.
- Test-record cleanup mechanics after UAT.

### Deferred Ideas (OUT OF SCOPE)
- v5.1 items (INGEST-DEF, AFIX-DEF, DBG-DEF, CAP-DEF, PAY-DEF, TRIG-DEF).
- Discord thread auto-creation / slash-command interactivity.
- Auto-promotion of KV reports to GitHub Issues.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DBG-01 | Options page `debugMode` checkbox, default false, `chrome.storage.sync`, label "Debug Mode — always show Report button" | §DBG-01 pattern, options.js:44-79 verbatim model |
| DBG-02 | When `debugMode === true`, TRIG-04 invariant relaxes — Report button shows on ALL outcomes; live-read on each citation, no reload | §DBG-02 live-read wiring, content-script.js:199-210 pattern |
| CAP-05 | Toolbar popup gains "Report a problem" link → `openOptionsPage()` → `#report` anchor | §CAP-05 popup pattern, popup.js:95-100 model |
| CAP-06 | Options `#report` section: full dialog inline (page DOM, not Shadow DOM), same payload-builder + MSG.SUBMIT_REPORT flow; hash routing | §CAP-06 showReportDialog page-mode refactor |
| UAT-01 | Live end-to-end submission → Discord fires, KV record matches PAY-01, no `ip`, fingerprint matches | §UAT automation split: wrangler kv key get + Discord manual check |
| UAT-02 | Client-side rate-limit boundary: 6th sub within 10 min blocked; 7th after 10 min succeeds | §UAT-02: partially automated (wrangler shows no KV write); 6th submit is operator manual |
| UAT-03 | Server-side dedup: 2 identical submissions within 15 min → 1 KV record with `duplicate_count: 2`; 3rd after 15 min → new record | §UAT-03: wrangler kv key get scriptable; second submit is operator manual |
| UAT-04 | Privacy audit: manifest declarations match payload fields; web-ext lint clean; privacy policy accessible | §UAT-04: fully automatable |
| UAT-05 | Cross-browser: Chrome SW stop/restart with queued report → retry on next load; Firefox event page parity | §UAT-05: SW stop/restart is operator-only; KV verification is scripted |
| UAT-06 | [Remove selection text] toggle: selectionText absent from KV and Discord embed; sticky across re-opens | §UAT-06: wrangler kv key get scriptable; toggle interaction is operator manual |
</phase_requirements>

---

## Summary

Phase 5 is the milestone-closing phase: three small UI additions (DBG-01/02 debug toggle, CAP-05 popup link, CAP-06 options dialog) followed by live UAT evidence collection. No new backend, no new payload logic — everything reuses infrastructure from Phases 1-4.

The primary engineering decision is the `showReportDialog` page-mode refactor (D-08). The function currently takes `shadow: ShadowRoot` as its first parameter and uses `shadowRoot.activeElement` in `installFocusTrap`. For 'page' mode the mount target is a plain `<div>` in the options page DOM, the focus trap must query `document.activeElement`, and dismiss removes the panel from the container div rather than from a shadow root. The cleanest approach is a `mountContext` discriminated union passed as the first parameter; shared form/payload/submit logic is untouched.

The UAT automation surface is well-defined: `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` and `wrangler kv key get` work in this environment (verified: wrangler 4.54.0, namespace returns `[]` cleanly against production). The planner should structure the UAT runbook as a results file that Claude fills programmatically for every scriptable step and leaves blanks only for the four irreducible operator actions documented below.

Zero new npm dependencies. `nyquist_validation` is disabled in `.planning/config.json` — the Validation Architecture section is omitted per config.

**Primary recommendation:** Structure the phase as two waves: Wave A (code — DBG-01/02 + CAP-05/06 + page-mode refactor + unit tests) then Wave B (UAT runbook generation + operator execution + automated evidence recording).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| debugMode toggle persistence | Options page (chrome.storage.sync write) | Content script (sync read via onChanged) | Settings live in sync storage; content script is the consumer |
| DBG-02 live visibility update | Content script (cachedSettings check at popup render time) | — | citation-ui.js injects button at showCitationPopup/showErrorPopup call time; the guard reads cachedSettings.debugMode |
| CAP-05 popup link | Toolbar popup (popup.js + popup.html) | Options page (receives the hash navigation) | Popup triggers; options page is destination |
| CAP-06 page-mode dialog mount | Options page (options.js DOMContentLoaded + report section div) | report-dialog.js (shared rendering logic) | Options page owns the mount point; report-dialog.js owns the form logic |
| Popup-path payload context | Options page (reads chrome.storage.local `currentPatent`) | report-dialog.js (consumes context param) | Dialog logic cannot access live selection on options page; currentPatent is the only available context |
| UAT KV verification | CLI (wrangler) | — | No browser needed for KV record inspection |
| UAT Discord verification | Operator (manual Discord channel check) | — | No API access to read Discord messages programmatically |
| UAT browser submission | Operator (live browser) | — | Irreducible — Claude cannot drive a browser |

---

## Standard Stack

### Core (no new packages — zero-dep DoD)
| Component | Version/Source | Purpose |
|-----------|---------------|---------|
| `chrome.storage.sync` | Extension built-in | Persist `debugMode` setting |
| `chrome.storage.local` | Extension built-in | Source `currentPatent` on popup path |
| `chrome.runtime.openOptionsPage()` | Extension built-in | CAP-05: popup → options page |
| `wrangler` | 4.54.0 (installed, verified) | UAT KV verification |
| `web-ext lint` | via `npm run test:lint` | UAT-04 AMO compliance check |

### Package Legitimacy Audit
> No external packages are installed in this phase. DoD explicitly states zero new npm dependencies. This section is intentionally empty.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | No new packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Options Page (DOMContentLoaded)
  └─ reads location.hash === '#report'
  └─ scrollIntoView + focus #report section
  └─ reads chrome.storage.local `currentPatent` [D-01]
  └─ calls showReportDialog({ mode: 'page', container: div#report }, context, null, null)
         │
         ├─ buildReportPayload(context, category, note, settings, errors, includeSelectionText)
         └─ chrome.runtime.sendMessage(MSG.SUBMIT_REPORT) → Phase 3 background → Worker

Toolbar Popup (click "Report a problem")
  └─ chrome.runtime.openOptionsPage()   [opens options tab]
  └─ [options page receives window.location.hash = '#report' from URL]

Content Script (each citation render)
  └─ cachedSettings.debugMode check [live via onChanged]
  └─ showCitationPopup(... reportOutcome={confidenceTier: 'green'} | null) [D-05/D-06]
         └─ if debugMode=true AND tier==='green': inject plain icon button (no nudge) [D-05]
```

### Recommended Project Structure (changes only)

```
src/
├── content/
│   ├── report-dialog.js     # refactor: add mountContext param; split installFocusTrap
│   └── content-script.js    # add debugMode to DEFAULT_SETTINGS + onChanged + guard
├── options/
│   ├── options.html          # add debugMode checkbox + #report section div
│   └── options.js            # add debugMode auto-save + hash routing + page-mode dialog init
└── popup/
    ├── popup.html            # add "Report a problem" link beside settingsLink
    └── popup.js              # add click handler → openOptionsPage() + '#report' strategy

.planning/phases/05-.../
├── 05-UAT-RUNBOOK.md         # operator step-by-step with automation slots
└── 05-UAT-RESULTS.md         # Claude fills automatable cells; operator fills manual cells
```

### Pattern 1: showReportDialog page-mode refactor (D-07/D-08)

**What:** Thread a `mountContext` discriminated union as the first parameter. Shadow mode: `{ mode: 'shadow', root: ShadowRoot }`. Page mode: `{ mode: 'page', container: HTMLElement }`. The rendering, payload assembly, and submit logic are completely identical. Only three things differ by mode:

1. **Mount:** shadow mode appends `styleEl` + `panel` to `shadowRoot`; page mode appends to `container` (the `#report` div).
2. **Focus trap:** shadow mode uses `shadowRoot.activeElement` (current `installFocusTrap` is correct as-is for shadow); page mode needs a variant that uses `document.activeElement`.
3. **Dismiss:** shadow mode removes `styleEl` + `panel` from shadow root; page mode removes from `container` (no-op for `styleEl` if inline `<style>` is in page DOM — use a `<style>` scoped to `.cite-report-panel` prefix or inject into container).

**Current signature** (`report-dialog.js:567`):
```javascript
export function showReportDialog(shadow, reportOutcome, selectionRect, triggerEl)
// shadow: ShadowRoot
```

**Refactored signature:**
```javascript
export function showReportDialog(mountContext, reportOutcome, selectionRect, triggerEl)
// mountContext: { mode: 'shadow', root: ShadowRoot } | { mode: 'page', container: HTMLElement }
```

**Callers to update:**
- `citation-ui.js:179` — `showReportDialog(shadow, reportOutcome, rect, reportBtn)` → `showReportDialog({ mode: 'shadow', root: shadow }, reportOutcome, rect, reportBtn)` [VERIFIED: `report-dialog.js:567`, `citation-ui.js:179`]
- `citation-ui.js:304` — same update in `showErrorPopup`
- `options.js` — new call `showReportDialog({ mode: 'page', container: reportSectionEl }, context, null, null)`

**Focus trap for page mode:**
```javascript
// Page-mode variant — uses document.activeElement instead of shadowRoot.activeElement
export function installFocusTrapPage(panelEl, onEscape) {
  // identical FOCUSABLE selector, getFocusable(), handleKeydown() logic
  // except: const active = document.activeElement; (not shadowRoot.activeElement)
  document.addEventListener('keydown', handleKeydown);
  // ...
  return () => document.removeEventListener('keydown', handleKeydown);
}
```

**Click-outside for page mode:**  
The current shadow-mode click-outside checks `citationHost.contains(e.target)` using the shadow host retargeting. In page mode, check `container.contains(e.target)` directly on `document` mousedown.

**Dismiss for page mode:**
```javascript
function dismissDialog() {
  removeTrap();
  document.removeEventListener('mousedown', clickOutsideHandler);
  panel.remove();
  styleEl.remove(); // styleEl is in container (page DOM), remove it too
  if (triggerEl?.focus) triggerEl.focus(); // focus restore
}
```

**[Remove selection text] toggle on popup/options path (D-01):**  
When `context.selectionText === null` (no live selection), the toggle should be hidden (not just inert) and `includeSelectionText` locked to `false`. Check this early in the dialog build:
```javascript
const hasSelection = !!context.selectionText;
if (!hasSelection) {
  selectionToggleLabel.style.display = 'none';
  includeSelectionText = false;
}
```

**"Context from your most recent citation" preview (D-01):**  
Add a banner `<div>` at the top of the panel in page/popup mode:
```javascript
if (mountContext.mode === 'page') {
  const staleBanner = document.createElement('div');
  staleBanner.className = 'cite-report-stale-banner';
  staleBanner.textContent = `Context from your most recent citation: US${context.patentNumber || '(none)'}`;
  panel.prepend(staleBanner);
}
```

### Pattern 2: DBG-01 options checkbox (follow includePatentNumber verbatim)

**`options.html`** — add inside `.settings-card`, after the Include Patent Number group:
```html
<!-- Debug Mode -->
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

**`options.js`** — extend the `chrome.storage.sync.get` defaults and add listener:
```javascript
// In storage.sync.get defaults object (line ~45):
{ triggerMode: 'floating-button', displayMode: 'default', includePatentNumber: false, debugMode: false }

// Load:
const debugModeCheckbox = document.getElementById('debugMode');
if (debugModeCheckbox) debugModeCheckbox.checked = settings.debugMode;

// Save listener (after patentNumCheckbox block):
const debugModeSaved = document.getElementById('debugModeSaved');
if (debugModeCheckbox) {
  debugModeCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ debugMode: debugModeCheckbox.checked }, () => {
      showSaved(debugModeSaved);
    });
  });
}
```

### Pattern 3: DBG-02 live-read wiring (content-script.js)

**`DEFAULT_SETTINGS`** (`content-script.js:185-189`): add `debugMode: false`
```javascript
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
  debugMode: false,  // DBG-02: default off; TRIG-04 holds
};
```

**`onChanged` listener** (`content-script.js:204-210`): add one line
```javascript
if (changes.debugMode) cachedSettings.debugMode = changes.debugMode.newValue;
```

**`showCitationPopup` call sites** (two sites, `content-script.js:491-501` and `content-script.js:594-604`): The `reportOutcome` passed to `showCitationPopup` is currently:
```javascript
{ category: mapOutcomeToReportCategory(null, result.confidence), confidenceTier: mapConfidenceTier(result.confidence) }
```
For green outcomes, `category` is `null` and `confidenceTier` is `'green'`. Currently `citation-ui.js:170` guards with `reportOutcome.confidenceTier !== 'green'` — which hides the button on green.

**DBG-02 change in `citation-ui.js`:** The guard at line 170 must become:
```javascript
if (reportOutcome && (reportOutcome.confidenceTier !== 'green' || cachedDebugMode)) {
  // D-05: plain icon on green; D-06: nudge text only on non-green
  const isGreenDebug = reportOutcome.confidenceTier === 'green';
  reportBtn.textContent = isGreenDebug ? '⚑' : '⚑ Report a problem';
  reportBtn.title = 'Report a problem';
  // ...
}
```

**Critical:** `citation-ui.js` is bundled as a module alongside `content-script.js` by esbuild. The simplest approach to pass `debugMode` state is to thread it through the `showCitationPopup` call signature (add a `debugMode` boolean parameter) rather than importing `cachedSettings` from `content-script.js` (would create a circular import risk). Both call sites already have access to `cachedSettings.debugMode` and can pass it:
```javascript
// content-script.js call:
showCitationPopup(prefixedCitation, rect, result.confidence, cachedSettings.displayMode, undefined,
  { category: ..., confidenceTier: ..., debugMode: cachedSettings.debugMode }
)
```
Then `citation-ui.js` reads `reportOutcome.debugMode` rather than needing a separate param.

**[ASSUMED]** — this is the most idiomatic approach given esbuild IIFE bundling; the alternative (module-level export from content-script) requires explicit re-export.

### Pattern 4: CAP-05 popup "Report a problem" link

**`popup.html`** — add adjacent to the existing `settingsLink`:
```html
<div style="margin-top: 12px; text-align: center;">
  <a id="settingsLink" href="#" style="font-size: 11px; color: #6b7280; text-decoration: underline; cursor: pointer;">Settings</a>
  <span style="font-size: 11px; color: #6b7280; margin: 0 6px;">·</span>
  <a id="reportLink" href="#" style="font-size: 11px; color: #6b7280; text-decoration: underline; cursor: pointer;">Report a problem</a>
</div>
```

**`popup.js`** — the `openOptionsPage()` API does NOT support a hash fragment parameter; it opens the registered `options_ui.page` URL with no anchor control. [ASSUMED: based on documented Chrome extension API behavior — `openOptionsPage()` opens the registered options page URL as-is; no hash parameter exists in the MV2/MV3 API.] The workaround: write `'#report'` to `chrome.storage.local` before calling `openOptionsPage()`; `options.js` reads it on `DOMContentLoaded`:
```javascript
// popup.js
const reportLink = document.getElementById('reportLink');
if (reportLink) {
  reportLink.addEventListener('click', (e) => {
    e.preventDefault();
    // Signal options page to scroll to #report on next load
    chrome.storage.local.set({ pendingOptionsHash: '#report' }, () => {
      chrome.runtime.openOptionsPage();
    });
  });
}
```
```javascript
// options.js DOMContentLoaded:
chrome.storage.local.get('pendingOptionsHash', (data) => {
  if (data.pendingOptionsHash === '#report') {
    chrome.storage.local.remove('pendingOptionsHash');
    // Scroll and focus
    const reportSection = document.getElementById('report');
    if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
  }
});
// Also handle direct URL hash (e.g., from keyboard shortcut or bookmark):
if (location.hash === '#report') {
  const reportSection = document.getElementById('report');
  if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
}
```

> **Note on `openOptionsPage()` + hash:** `chrome.runtime.openOptionsPage()` with `open_in_tab: true` opens a new tab at the `options_ui.page` URL (e.g., `chrome-extension://<id>/src/options/options.html`). The URL contains no hash fragment. The `pendingOptionsHash` signaling pattern is the standard community workaround. [ASSUMED — confirm with a quick manual test during Wave B or treat as low-risk given simplicity.]

### Pattern 5: CAP-06 options page `#report` section

**`options.html`** — add a new section inside `.settings-card` (or after it) with `id="report"`:
```html
<!-- Report a problem -->
<div id="report" class="setting-group">
  <div class="setting-label">
    <label>Report a problem</label>
  </div>
  <p class="setting-description">Submit a bug report about a citation failure you encountered.</p>
  <div id="reportDialogMount"></div>
</div>
```

**`options.js`** — in `DOMContentLoaded`, after loading settings, initialize the page-mode dialog:
```javascript
const reportMount = document.getElementById('reportDialogMount');
if (reportMount) {
  // Lazy: show a "Load report form" button that calls showReportDialog on click,
  // OR initialize the form immediately.
  // Phase 5 D-07: reuse the anchored-panel card look inline → initialize immediately.
  chrome.storage.local.get('currentPatent', async (data) => {
    const patent = data.currentPatent || {};
    const context = {
      patentNumber: (patent.patentId || '').replace(/^US/, ''),
      selectionText: null,          // D-01: no live selection
      returnedCitation: null,
      confidenceTier: patent.confidenceTier || null,
      extensionVersion: chrome.runtime.getManifest().version,
      browser: getBrowserString(),  // imported from report-dialog.js
      os: getOsString(),            // imported from report-dialog.js
      xpathNode: null,
      scrollY: null,
      viewportWidth: null,
      viewportHeight: null,
      pdfParseStatus: null,
    };
    showReportDialog(
      { mode: 'page', container: reportMount },
      { category: null, confidenceTier: null },  // D-02: no category pre-selected
      null,  // no selectionRect — page-mode positioning is static
      null
    );
  });
}
```

**[ASSUMED]** — The exact approach to passing `context` into `showReportDialog` for the page-mode path requires the dialog refactor (D-08) to accept a context override parameter or to read from storage itself. The submit handler at `report-dialog.js:934-998` currently assembles context inline via `extractPatentInfo()` (which relies on the Google Patents DOM). On the options page there is no patent DOM. The refactor must allow the caller to inject a pre-built `context` object. This is the most significant design change in the refactor.

### Anti-Patterns to Avoid
- **Duplicating the form/payload logic:** D-08 explicitly forbids a separate renderer for page mode. The form HTML construction, `buildReportPayload`, `MSG.SUBMIT_REPORT` routing, and toast mapping must remain in `showReportDialog` as a single function.
- **Calling `getCitationHost()` from `report-dialog.js`:** Current Vitest guard (`report-trigger-mapping.test.js:208-213`) asserts this never happens. Page-mode mount must NOT call `getCitationHost`. Use the `container` parameter.
- **Importing `cachedSettings` from `content-script.js`** into `citation-ui.js`: creates a circular dependency in the esbuild IIFE bundle. Thread `debugMode` through the `reportOutcome` object instead.
- **Reading `shadowRoot.activeElement` in page-mode focus trap:** `shadowRoot.activeElement` is `null` outside a shadow root; must use `document.activeElement` in page-mode `installFocusTrap` variant.
- **Positioning the panel with `rect` in page mode:** `selectionRect` is `null` on the options page. The positioning block at `report-dialog.js:875-893` must guard `if (selectionRect)`. In page mode, no absolute positioning is applied — the panel sits inline in the container's flow.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KV record verification | Custom fetch against Worker | `wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 <key>` | wrangler 4.54.0 installed and authenticated; returns JSON directly |
| KV key listing | Pagination logic | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:"` | Built-in prefix filter; returns array |
| AMO lint | Manual manifest review | `npm run test:lint` (wraps `npx web-ext lint --source-dir dist/firefox`) | Existing CI gate; already tested |
| Focus trap | Custom Tab intercept | `installFocusTrap` (shadow mode) / `installFocusTrapPage` (page mode) | The existing function handles Tab/Shift+Tab cycling correctly; only the active-element query differs |
| Payload schema verification | Manual JSON inspection | `wrangler kv key get ... | node -e "..."` piped assertion | Enables scriptable schema checks |
| Storage sync auto-save | Custom debounce | Existing `showSaved` + `addEventListener('change', ...)` pattern | Already present for all three existing settings; debugMode is a 4th checkbox in the same flow |

---

## Runtime State Inventory

> Step 2.6 applies — this phase does NOT rename any symbols, strings, or identifiers. It adds a new key (`debugMode`) to `chrome.storage.sync`. No rename inventory is needed.

**Runtime state added (not migrated):**
- `chrome.storage.sync` key `debugMode` — new key, default `false`; no migration needed; old installs simply read the default from `DEFAULT_SETTINGS` until they visit the options page.
- `chrome.storage.local` key `pendingOptionsHash` — transient signaling key (set by popup, read-and-deleted by options page on next load); no persistence concern.

**Nothing to migrate. Storage additions are additive and backwards-compatible.**

---

## UAT Automation Split (D-04)

This is the most critical planning output. Each UAT item is broken into scriptable and manual sub-steps.

### UAT-01: Live end-to-end submission

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| Build dist | SCRIPTABLE | `npm run build` |
| Load extension in Chrome | OPERATOR | Chrome > Manage Extensions > Load unpacked `dist/chrome/` |
| Navigate to a Google Patents page | OPERATOR | Real Google Patents URL |
| Trigger no-match or yellow outcome | OPERATOR | Select text that produces a failure or yellow confidence |
| Click Report button, fill note "v5.0 UAT-01 smoke", click Submit | OPERATOR | Live browser interaction |
| Capture fingerprint from submit response (or read from Discord embed footer) | OPERATOR | Read `fp:XXXXXXXXXXXXXXXX` from Discord embed footer field |
| Verify KV record written | SCRIPTABLE | `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:" \| node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const keys=JSON.parse(d); console.assert(keys.length>=1,'no KV record found');"` |
| Retrieve KV record and assert PAY-01 schema | SCRIPTABLE | `wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>"` → pipe to node assertion: no `ip`/`clientIp`/`userAgent` field; `fingerprint` present; `duplicate_count === 0` |
| Assert fingerprint in KV key matches Discord embed footer | SCRIPTABLE | string comparison between `fp:` in embed and KV key prefix |
| Verify Discord webhook embed fired | OPERATOR | Check Discord channel for embed |
| Record PASS/FAIL | SCRIPTABLE | Write to `05-UAT-RESULTS.md` |

**Irreducible operator steps:** Load extension, trigger citation outcome, submit form, read Discord.

### UAT-02: Client-side rate-limit boundary

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| Submit 5 reports in succession | OPERATOR | 5 clicks; each needs a live citation UI open |
| Attempt 6th submit | OPERATOR | Should see LIMIT-03 toast; note that KV must NOT contain a new record for this attempt |
| Assert no KV record for blocked attempt | SCRIPTABLE | `wrangler kv key list --namespace-id=... \| grep <expected_fp>` should return the count from the first 5 only |
| Wait 10 min, submit 7th | OPERATOR | Confirm window pruning |
| Assert 7th succeeds (new KV record) | SCRIPTABLE | `wrangler kv key list --prefix "report:<fp7>:"` returns 1 record |

**Irreducible operator steps:** All 7 browser submissions; reading the toast text.

**Note:** Rate-limit enforcement is fully in `chrome.storage.local` (`bugReportRateLimitWindow`). Claude can script pre-seeding the array to simulate 5 prior submissions — but this is a test-only hack that bypasses the browser interaction. D-04 says operator does irreducible browser steps. Recommend operator does all 6-7 submissions.

### UAT-03: Server-side dedup

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| First live submit | OPERATOR | Note fingerprint from Discord embed |
| Second identical submit (same patent, same category, no note change that affects selectionHash) | OPERATOR | Within 15 min; same patent, same category, same selection text |
| Assert KV has exactly 1 record for this fingerprint | SCRIPTABLE | `wrangler kv key list --namespace-id=... --prefix "report:<fp>:"` → assert `keys.length === 1` |
| Get record and assert `duplicate_count === 2` | SCRIPTABLE | `wrangler kv key get ...` → parse JSON → `assert(record.duplicate_count === 2)` |
| Wait 15+ min, third submit | OPERATOR | Confirm new record created |
| Assert 2 KV records for same fingerprint after 15 min | SCRIPTABLE | `wrangler kv key list ... --prefix "report:<fp>:"` → assert `keys.length === 2` |
| Assert second record has `duplicate_count === 0` | SCRIPTABLE | Get newest KV record |

**Irreducible operator steps:** 3 browser submissions, waiting 15 min.

### UAT-04: Privacy compliance audit (highest automation density)

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| Build | SCRIPTABLE | `npm run build` |
| web-ext lint | SCRIPTABLE | `npm run test:lint` → assert exit code 0 |
| Grep: no webhook URL in repo | SCRIPTABLE | `grep -r 'discord.com/api/webhooks' . --exclude-dir=.git` → assert 0 results |
| Grep: no `ip`/`clientIp`/`userAgent` in KV writes | SCRIPTABLE | `grep -n "ip.*KV\|clientIp\|userAgent.*record" worker/src/index.js` → assert 0 results (or grep `buildKvRecord` body for these keys) |
| PAY-01 cross-check: manifest `data_collection_permissions` vs schema fields | SCRIPTABLE | `node -e "const m=require('./src/manifest.firefox.json'); console.log(JSON.stringify(m.data_collection_permissions))"` → manual review against report-schema.md |
| Privacy policy URL accessible | SCRIPTABLE | `curl -s -o /dev/null -w "%{http_code}" https://tonyrowles.github.io/patent-cite-tool/privacy` → assert 200 |
| Assert no `fetch(WORKER_REPORT_URL` in `src/content/` | SCRIPTABLE | `grep -r "fetch.*WORKER_REPORT_URL" src/content/` → assert 0 results |

**Irreducible operator steps:** None for UAT-04. Fully automatable.

### UAT-05: Cross-browser parity + SW stop/restart

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| Build Firefox dist | SCRIPTABLE | `npm run build:firefox` (or `npm run build`) |
| Load Firefox extension (web-ext run or manual) | OPERATOR | Firefox > about:debugging |
| Submit report in Firefox (same flow as UAT-01) | OPERATOR | Live submission |
| Verify KV record created | SCRIPTABLE | `wrangler kv key list --prefix "report:<fp>:"` |
| Open Chrome, install extension | OPERATOR | Chrome > Manage Extensions |
| Submit report via citation UI | OPERATOR | |
| With report QUEUED but not yet submitted (simulate): stop Chrome SW | OPERATOR | chrome://extensions > Details > Service worker > Terminate |
| Restart SW (or close/reopen browser) | OPERATOR | SW restarts on next extension event |
| Assert queued report was retried and KV record exists | SCRIPTABLE | `wrangler kv key list --prefix "report:<fp>:" → assert 1 record` |

**Irreducible operator steps:** All browser interactions + SW stop/restart.

**Implementation note:** To create a genuinely queued-but-not-submitted report for the SW test, the operator should submit while the network is offline (or use DevTools to simulate offline mode) to force the report into `chrome.storage.local.bugReportQueue`. Then stop the SW, come online, and restart the SW. Claude can verify the result via wrangler.

### UAT-06: [Remove selection text] toggle

| Sub-step | Mode | Command / Action |
|----------|------|-----------------|
| Open dialog, expand "What's included", toggle ON | OPERATOR | |
| Submit report | OPERATOR | Note fingerprint |
| Get KV record | SCRIPTABLE | `wrangler kv key get ... <key>` |
| Assert `selectionText` field is `null` (not absent — PAY-01 schema has nullable selectionText) | SCRIPTABLE | `node -e "const r=JSON.parse(process.argv[1]); console.assert(r.selectionText === null)" '<json>'` |
| Verify Discord embed has no selection text quoted block | OPERATOR | Check Discord channel embed |
| Re-open dialog in same session | OPERATOR | Should see toggle still ON |
| Assert toggle state persisted | OPERATOR | Visual check |

**Irreducible operator steps:** Toggle interaction, Discord embed check, sticky check.

---

### UAT Automation Summary

| UAT | Fully Automatable Steps | Irreducible Manual Steps |
|-----|------------------------|--------------------------|
| UAT-01 | Build, KV record exists, schema/no-ip assert, fp match | Load ext, trigger outcome, submit, read Discord |
| UAT-02 | KV record count after blocked 6th, 7th success KV | 7 browser submissions, toast observation |
| UAT-03 | KV record count=1 after dup, `duplicate_count=2`, 2nd record after 15min | 3 browser submissions, 15min wait |
| UAT-04 | web-ext lint, grep guards, privacy URL 200, XPORT-06 grep | None — fully scriptable |
| UAT-05 | KV record after FF submit, KV record after SW restart retry | All browser interactions + SW stop/restart |
| UAT-06 | KV `selectionText===null` assert | Toggle interaction, Discord embed check, sticky visual |

**Claude produces:** A `05-UAT-RUNBOOK.md` with numbered steps and `05-UAT-RESULTS.md` with a table. Claude pre-fills all SCRIPTABLE rows programmatically. Operator fills MANUAL rows with timestamps and pass/fail. Claude then runs the scriptable verifications and records evidence.

---

## Common Pitfalls

### Pitfall 1: `selectionRect` null in page mode
**What goes wrong:** `showReportDialog` at line 875 does `citationHost.style.top = ...` which crashes if `citationHost` is null (options page has no shadow host).
**Why it happens:** The positioning block assumes `shadow.host` exists (shadow mode only).
**How to avoid:** Guard the entire positioning block with `if (selectionRect && mountContext.mode === 'shadow')`. In page mode, positioning is static — the panel is in the container's document flow.
**Warning signs:** `TypeError: Cannot set properties of null` on `citationHost.style`.

### Pitfall 2: `shadowRoot.activeElement` returns null in page mode
**What goes wrong:** `installFocusTrap` at line 499 reads `const active = shadowRoot.activeElement` — returns `null` when called outside a shadow root.
**Why it happens:** Shadow DOM API; `shadowRoot.activeElement` is only meaningful inside a closed root.
**How to avoid:** Create `installFocusTrapPage(panelEl, onEscape)` that uses `document.activeElement` with `panelEl.contains(document.activeElement)` for boundary check. [VERIFIED: `report-dialog.js:469-522`]
**Warning signs:** Tab key doesn't cycle focus; no crash, just broken keyboard navigation.

### Pitfall 3: `extractPatentInfo()` unavailable in options page context
**What goes wrong:** The submit handler at `report-dialog.js:954` calls `extractPatentInfo()` — a function defined in `content-script.js`'s IIFE scope. On the options page, the bundle is not the content-script bundle — `extractPatentInfo` is undefined.
**Why it happens:** `report-dialog.js` currently relies on `extractPatentInfo` being in scope via esbuild bundling alongside `content-script.js`. The options page loads its own `options.js`.
**How to avoid:** The refactor (D-08) must accept a pre-built `context` object passed from the caller (options.js reads `currentPatent` and builds context externally). The submit handler uses the injected context rather than calling `extractPatentInfo()`.
**Warning signs:** The dialog submits with blank `patentNumber` on the options page.

### Pitfall 4: Click-outside handler fires on same click that opens dialog
**What goes wrong:** In page mode, if the "Load report form" trigger button (or the section itself) is inside the document, the `mousedown` listener installed 100ms after mount (report-dialog.js:918) can still catch the click that scrolled to the section.
**Why it happens:** 100ms delay exists in shadow mode to avoid exactly this. In page mode, verify the delay is sufficient for the navigation/scroll event sequence.
**How to avoid:** Keep the 100ms delay in page mode. The click-outside check uses `container.contains(e.target)` so clicks inside the report section div are never treated as outside clicks.

### Pitfall 5: `openOptionsPage()` does not pass URL fragment
**What goes wrong:** CAP-05 — clicking "Report a problem" in the popup opens the options page but the `#report` anchor is not in the URL because `openOptionsPage()` has no parameter for it.
**Why it happens:** The Chrome extension API `chrome.runtime.openOptionsPage()` takes no arguments. [ASSUMED]
**How to avoid:** Use `pendingOptionsHash` signaling via `chrome.storage.local` (Pattern 4 above). Options page checks on `DOMContentLoaded`.
**Warning signs:** Options page opens but doesn't scroll to the Report section.

### Pitfall 6: `wrangler kv key list` with wrong syntax (verified)
**What goes wrong:** `wrangler kv list --binding=BUG_REPORTS --prefix ...` fails (tested: "Unknown arguments: binding, prefix, list").
**Why it happens:** Wrangler 4.x changed the CLI structure.
**How to avoid:** Use `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` with a `--prefix` sub-option. [VERIFIED: wrangler 4.54.0 — `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` returns `[]` successfully]
**Warning signs:** wrangler exits with "Unknown arguments" error.

### Pitfall 7: Dedup fingerprint depends on selectionText — popup path sends null
**What goes wrong:** `computeFingerprint(patentNumber, category, selectionText)` with `selectionText = null` hashes the string `"null"` or empty string — which is still a valid dedup input.
**Why it happens:** The popup path has no live selection; `D-01` says live-capture fields are absent.
**How to avoid:** This is by design. The Worker's `computeFingerprint` already handles null/missing selectionText (it computes SHA-256 of the normalized selection text which for null results in a hash of empty string). UAT-03 should use the popup path to test dedup — same patent, same category, null selectionText — should still dedup correctly.
**Warning signs:** None — this is expected behavior, just confirm it during UAT-03.

---

## Code Examples

Verified patterns from the actual codebase:

### Current showReportDialog call site (citation-ui.js:179)
```javascript
// [VERIFIED: citation-ui.js:177-181]
reportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showReportDialog(shadow, reportOutcome, rect, reportBtn);
});
```
Phase 5 update:
```javascript
showReportDialog({ mode: 'shadow', root: shadow }, reportOutcome, rect, reportBtn);
```

### Current TRIG-04 guard (citation-ui.js:170)
```javascript
// [VERIFIED: citation-ui.js:170-183]
if (reportOutcome && reportOutcome.confidenceTier !== 'green') {
  // ... inject button with nudge text
}
```
DBG-02 update:
```javascript
if (reportOutcome && (reportOutcome.confidenceTier !== 'green' || reportOutcome.debugMode)) {
  const isGreenDebug = reportOutcome.confidenceTier === 'green';
  reportBtn.textContent = isGreenDebug ? '⚑' : '⚑ Report a problem'; // D-05: plain icon on green
  // ...
}
```

### DEFAULT_SETTINGS extension (content-script.js:185-189)
```javascript
// [VERIFIED: content-script.js:185-189 — add debugMode]
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
  debugMode: false,   // DBG-01/02 addition
};
```

### wrangler KV commands (verified against wrangler 4.54.0)
```bash
# List keys for a fingerprint prefix
wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105 --prefix "report:<fp>:"

# Get a specific KV record
wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>"

# Pipe to node to check no ip field
wrangler kv key get --namespace-id=cefe2733c0074fe2a28a49ff536de105 "report:<fp>:<ts>" | \
  node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
    console.assert(!('ip' in r), 'ip field present — PAY-03 violation'); \
    console.assert(r.fingerprint, 'fingerprint missing'); \
    console.log('PAY-01 check: PASS');"
```

### npm test:lint command (verified from package.json:31)
```bash
npm run test:lint
# expands to: npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'
# Must exit 0. Run after `npm run build` (which builds dist/firefox/).
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wrangler kv list --binding | wrangler kv key list --namespace-id | wrangler 4.x | UAT runbook must use namespace-id |
| `openOptionsPage()` + URL hash | `openOptionsPage()` + storage signaling | Always been this way | Requires pendingOptionsHash pattern |
| showReportDialog(shadow, ...) | showReportDialog(mountContext, ...) | Phase 5 | Both callers in citation-ui.js need updating |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chrome.runtime.openOptionsPage()` does not support a hash/anchor parameter | Pattern 4, Pitfall 5 | If it does support it, the pendingOptionsHash signaling pattern is unnecessary; simpler to just call openOptionsPage() with no workaround — but the current approach still works even if unneeded |
| A2 | Threading `debugMode` through the `reportOutcome` object (rather than as a separate import) is the idiomatic approach given esbuild IIFE bundling | Pattern 3 | If esbuild handles module-level cross-file state correctly, could use a getter export from content-script instead; would need verification against the build setup |
| A3 | The popup path builds the `context` object in `options.js` from `currentPatent` before calling `showReportDialog` (rather than having the dialog read storage itself) | Pattern 5, Pitfall 3 | If dialog reads storage itself, the refactor is simpler but risks the dialog being called before storage resolves; caller-built context is safer |

**If this table is empty:** All other claims were verified against the actual codebase (file:line citations) or against the wrangler CLI (tested live).

---

## Open Questions (RESOLVED)

1. **`openOptionsPage()` + hash anchor (A1)**
   - What we know: The Chrome extension API `openOptionsPage()` takes no parameters.
   - What's unclear: Whether Firefox's implementation differs; whether `options_ui.open_in_tab: true` means the page URL can be opened directly with `chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#report') })` as an alternative.
   - Recommendation: The `pendingOptionsHash` signaling approach is safe and confirmed-idiomatic. Alternatively, on the popup path, use `chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') + '#report' })` — this works because `open_in_tab: true` means the options page is a regular tab. The `location.hash` in `DOMContentLoaded` would then work without storage signaling. This is likely the cleaner approach for CAP-05.

2. **`showReportDialog` context injection shape**
   - What we know: The submit handler at `report-dialog.js:954-976` currently calls `extractPatentInfo()` to get `patentNumber` and `patentType`, then calls `getPdfParseStatus(patentType)` and reads the error buffer. These are closure-calls on the Google Patents DOM.
   - What's unclear: Whether `getPdfParseStatus` can be re-read on the options page (it reads `currentPatent` from storage — yes it can). But `extractPatentInfo()` is DOM-dependent.
   - Recommendation: For page mode, the refactor should accept a pre-built `context` object as an additional parameter to `showReportDialog`. The shadow-mode callers pass `null` or omit it (dialog builds context itself via extractPatentInfo). Page-mode callers pass the context built from `currentPatent`. This is a clean additive change.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| wrangler CLI | UAT-01/03/05/06 KV verification | Yes | 4.54.0 | — |
| wrangler authentication | KV read commands | Yes | Verified: `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` returns `[]` | — |
| `npm run build` | All UAT | Assumed present | — | `npm run build:chrome && npm run build:firefox` |
| `npm run test:lint` | UAT-04 | Present (package.json:31) | — | `npx web-ext lint --source-dir dist/firefox` |
| Chrome browser | UAT-01/02/03/05/06 | Operator's machine | — | — |
| Firefox browser | UAT-04/05 | Operator's machine | — | — |
| Production Worker | All UAT | Live (pct.tonyrowles.com) | — | — |
| Discord channel access | UAT-01/06 manual check | Operator | — | — |

**Missing dependencies with no fallback:** None — all dependencies present or operator-provided.

---

## Validation Architecture

> `nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is omitted per config.

---

## Security Domain

> `security_enforcement` is not explicitly set in `.planning/config.json`; treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not applicable to options page UI additions |
| V3 Session Management | No | Extension settings page, no sessions |
| V4 Access Control | No | No new access-controlled endpoints |
| V5 Input Validation | Yes (note field) | 256-char `maxLength` attribute already in dialog; `textContent` assignment (not `innerHTML`) already enforced per T-04-06 in report-dialog.js |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Note field XSS in page DOM | Tampering | `textContent` assignment (not `innerHTML`) in all `makeFieldRow` calls; already enforced at `report-dialog.js:708` — must be maintained in page-mode mount where content goes to page DOM instead of shadow DOM |
| `currentPatent.patentId` injection in banner | Tampering | Set banner via `.textContent`, never `.innerHTML` |
| `pendingOptionsHash` storage poisoning | Tampering | Value is read then deleted; only used to scroll to a section by ID — no dynamic code execution; negligible risk |
| Webhook URL exposure | Information Disclosure | XPORT-03 constraint — already enforced by grep guard in UAT-04; no new surfaces added in Phase 5 |

---

## Sources

### Primary (HIGH confidence)
- `src/content/report-dialog.js` — full read; `showReportDialog:567`, `installFocusTrap:469-522`, `getReportDiagnostics:181`, positioning block `875-893`
- `src/content/citation-ui.js` — `getCitationHost:43-59`, `showCitationPopup:129-270`, TRIG-04 guard `170-183`, `showErrorPopup:279-325`
- `src/content/content-script.js` — `DEFAULT_SETTINGS:185-189`, `onChanged:204-210`, `showCitationPopup` call sites `491-501`, `594-604`
- `src/options/options.js` — full read; auto-save pattern `44-80`
- `src/options/options.html` — `includePatentNumber` checkbox structure `214-225`
- `src/popup/popup.html` — `settingsLink:38`
- `src/popup/popup.js` — `openOptionsPage:95-100`
- `worker/src/report-schema.md` — PAY-01 allowlist, KV key format
- `worker/src/index.js` — `checkAndHandleDuplication:277-303`, KV write `461-467`, dedup response `449-458`
- `worker/wrangler.toml` — BUG_REPORTS namespace-id `cefe2733c0074fe2a28a49ff536de105` (line 10)
- `tests/unit/report-trigger-mapping.test.js` — TRIG-04 guard token test `227-232`; getCitationHost ban `207-213`
- `.planning/config.json` — `nyquist_validation: false`
- Wrangler 4.54.0 CLI — tested live: `wrangler kv key list --namespace-id=cefe2733c0074fe2a28a49ff536de105` returns `[]` with exit 0
- `package.json:31` — `test:lint` script

### Secondary (MEDIUM confidence)
- Phase 4 CONTEXT.md — D-01 through D-08, canonical refs, existing unit test patterns
- Phase 1 CONTEXT.md — dedup mechanics, KV key format `report:{fp}:{ts}`

### Tertiary / Assumed
- A1: `openOptionsPage()` no-hash-parameter behavior (assumed from Chrome extension API documentation knowledge; verify with `chrome.tabs.create` alternative)
- A2: esbuild IIFE bundling behavior with cross-module state (assumed)
- A3: context injection pattern for page-mode (design recommendation, not verified against existing code)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all tooling verified in environment
- Architecture (showReportDialog refactor): HIGH — full source code read; exact line citations
- DBG-01/02 wiring: HIGH — verbatim pattern exists in options.js:44-80 and content-script.js:199-210
- UAT automation split: HIGH — wrangler commands verified live; irreducible manual steps clearly bounded
- CAP-05 openOptionsPage anchor: MEDIUM — `pendingOptionsHash` is the known workaround; `chrome.tabs.create` alternative may be cleaner
- Pitfalls: HIGH — derived from actual source code reading, not speculation

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (30 days; stable extension APIs)

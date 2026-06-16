# Phase 4: Report Dialog UI + Citation-UI Wiring - Research

**Researched:** 2026-06-13
**Domain:** Browser Extension Content Script UI — Shadow DOM anchored panel, console interception, DOM diagnostic capture, citation-outcome wiring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Anchored panel near citation pill (viewport-clamped like `cite-popup`), NOT a centered modal. Focus-trap + Escape + click-outside + focus-restore within anchored Shadow DOM panel.
- **D-02:** Reuse existing citation-pill aesthetic — rounded corners, soft shadow, green/yellow toast/pill styling and font stack from `citation-ui.js`.
- **D-03:** Friendly human-readable field labels in the "What's included" panel. The selection-text row is what the [Remove selection text] toggle hides.
- **D-04:** Panel starts collapsed; user expands to inspect field list and reach the toggle.
- **D-05:** Button surfaces with category pre-selected; dialog opens only on click (no auto-open).
- **D-06:** Icon-only flag/megaphone glyph with `title="Report a problem"`; gentle text-label or soft highlight nudge on failure/yellow/Worker-error; hidden entirely on green (TRIG-04).
- **D-07:** Note stays optional for all categories (256-char + live counter). Submit never gated on note.
- **D-08:** Error ring buffer captures extension-tagged console.error/warn only (`[SW]`, `[PCT]`, `[Offscreen]`, `[Firefox]` prefixes).

### Claude's Discretion

- Exact `selected_node_xpath` / `scroll_y` / `viewport_width` / `viewport_height` capture technique.
- `pdfParseStatus` sourcing from existing pipeline state.
- console.error/warn interception approach for PAY-08 (monkeypatch vs explicit helper) and storage-write strategy.
- Exact trigger-detection wiring in `content-script.js` and outcome→category mapping.
- Focus-trap mechanics, DOM structure, CSS class names, note character-counter visual treatment.

### Deferred Ideas (OUT OF SCOPE)

- Debug Mode "always show Report button" on green successes — Phase 5 (DBG-01/02).
- Toolbar-popup "Report a problem" link + options-page `#report` inline dialog — Phase 5 (CAP-05/06).
- Live cross-browser UAT — Phase 5 (UAT-01..06).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | New `src/content/report-dialog.js` — Shadow DOM dialog inside existing closed-shadow host; 4-category radio, 256-char optional note with live counter, Submit + Cancel, inline disclosure | Dialog architecture, Shadow DOM mounting in existing host, note counter pattern |
| CAP-02 | Expandable "What's included" panel + [Remove selection text] toggle, sticky via `reportDialogRemoveSelectionText` key | Toggle pattern, `chrome.storage.local` sticky state, collapsible section |
| CAP-03 | Report button adjacent to Copy button in citation popup; icon-only; category auto-select based on outcome | Button injection into `.cite-row`, outcome→category mapping |
| CAP-04 | Dialog UX: Submit-close, Cancel/Escape/click-outside dismiss, focus-trap within panel, ARIA, focus-restore | Focus-trap in closed Shadow DOM, Escape key interception, click-outside boundary |
| TRIG-01 | Button auto-surfaces on no-match / failure — "No match found" or "Tool not working" | content-script.js outcome sites mapped in this research |
| TRIG-02 | Button auto-surfaces on Tier-5 / 0.85-cap yellow outcome — "Inaccurate citation" | confidence ≤ 0.94 AND ≥ 0.80 in medium band; Tier 5 outputs exactly 0.85 |
| TRIG-03 | Button auto-surfaces on Worker-fallback error — "Tool not working" | showErrorPopup sites for status-based errors |
| TRIG-04 | Button NOT shown on green (confidence ≥ 0.95) | TRIG-04 invariant, Phase 5 relaxes via Debug Mode |
| PAY-08 | Error ring buffer: last 20 console.error/warn with extension prefix tags, `bugReportErrorBuffer` key | Tag filter pattern, ring-overwrite strategy, storage write |
| PAY-09 | DOM/PDF diagnostics: `selected_node_xpath`, `scroll_y`, `viewport_width/height`, `pdfParseStatus` | Net-new helpers, XPath-from-selection technique, pdfParseStatus derivation from `currentPatent` |
</phase_requirements>

---

## Summary

Phase 4 is a pure **content-script UI addition**. It introduces `src/content/report-dialog.js` — a Shadow DOM anchored panel that mounts inside the already-existing closed-shadow host from `citation-ui.js:getCitationHost()` — and wires the Report button into the `.cite-row` element next to the existing Copy button. The dialog consumes Phase 2's `buildReportPayload` and sends to Phase 3's `MSG.SUBMIT_REPORT` handler; it owns none of the transport logic.

The research confirms: (1) there are **no existing** `selected_node_xpath`, scroll, viewport, or `pdfParseStatus` capture utilities — all four PAY-09 helpers are net-new; (2) the correct `pdfParseStatus` value is **derivable from the `currentPatent` object already in `chrome.storage.local`** without any new state tracking; (3) the console.error/warn ring buffer should use a **thin explicit wrapper** rather than a monkeypatch, because the content script currently has zero `console.error` calls (clean slate) and the `[SW]`/`[Offscreen]`/`[Firefox]` tag convention already provides a reliable filter; (4) focus-trap in a closed Shadow DOM is achievable with a manual `querySelectorAll` + `keydown` handler confined to the shadow root — no external library needed.

**Primary recommendation:** Implement `report-dialog.js` as a self-contained module that exports `showReportDialog(params)` and a `mountErrorBuffer()` initializer. The dialog renders an anchored `<div>` (not a `<dialog>` element, for Shadow DOM compatibility), appended directly to the existing `citationShadow`. All focus-trap, dismiss, and toggle logic lives inside this module. The `showCitationPopup`/`showErrorPopup` call sites in `content-script.js` are extended with a minimal `outcome` object `{ category, confidenceTier }` — not a signature refactor.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Report dialog rendering | Browser / Content Script (Shadow DOM) | — | Must run in page context to access DOM selection, scrollY, viewport; already isolated via existing shadow host |
| Outcome→category mapping | Browser / Content Script | — | Category depends on the citation result already available in the content script at the `showCitationPopup`/`showErrorPopup` call sites |
| Payload construction | Shared module (`report-payload-builder.js`) | — | Pure function, Phase 2 deliverable; content script calls it with live context |
| Payload transmission | Background SW / Firefox event page | Content Script (sends via `sendMessage`) | XPORT-06 constraint: content scripts must not POST cross-origin; Phase 3 deliverable |
| Toast rendering after submit | Browser / Content Script (Shadow DOM) | — | Phase 3 D-06: background owns logic, caller renders all toasts; reuse `showSuccessToast`/`showFailureToast` |
| Error ring buffer capture | Browser / Content Script + Background | chrome.storage.local | PAY-08: capture in both script contexts where errors occur; ring stored in local storage |
| PAY-09 diagnostic capture | Browser / Content Script | — | `window.scrollY`, `window.innerWidth/Height`, `window.getSelection()` are page-context APIs |

---

## Standard Stack

### Core (no new packages — zero-dependency constraint)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native DOM APIs | browser built-in | Shadow DOM, querySelectorAll, keydown events | Already used in `citation-ui.js`; no dependency needed |
| `chrome.storage.local` | MV3 built-in | Sticky toggle state (`reportDialogRemoveSelectionText`), ring buffer (`bugReportErrorBuffer`) | Established pattern in `content-script.js` and `service-worker.js` |
| `chrome.runtime.getManifest()` | MV3 built-in | Extension version for `context.extensionVersion` | Pattern at `options.js:13` [VERIFIED: repo grep] |
| `buildReportPayload` | Phase 2 deliverable | Pure payload construction | Existing at `src/shared/report-payload-builder.js` [VERIFIED: repo] |
| `MSG.SUBMIT_REPORT` | Phase 2 deliverable | Message type constant | `src/shared/constants.js:26` [VERIFIED: repo] |

### No New npm Packages

The DoD explicitly requires "zero new npm dependencies." No focus-trap library, no dialog polyfill. All functionality implemented with native browser APIs.

**Package Legitimacy Audit:** N/A — zero new packages this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
User text selection on Google Patents
        ↓
[content-script.js] handleSelection()
        ↓
generateCitation() → offscreen matchAndCite() → CITATION_RESULT
        ↓
outcome determined: { success, confidence, error }
        ↓
[content-script.js] (new) mapOutcomeToReport(outcome)
     → { category: 'inaccurate_citation'|'no_match'|'tool_not_working', confidenceTier: 'green'|'yellow'|'red' }
        ↓
showCitationPopup(citation, rect, confidence, displayMode, { reportOutcome }) ← extended call
showErrorPopup(errorMessage, rect, { reportOutcome })                         ← extended call
        ↓
[report-dialog.js] mountReportButton(shadow, reportOutcome)  ← injected into .cite-row
        ↓
User clicks Report button
        ↓
[report-dialog.js] showReportDialog(shadow, reportOutcome, selectionRect)
        ↓                          ↓
PAY-09 capture:               chrome.storage.local.get('reportDialogRemoveSelectionText')
getXPathFromSelection()            + chrome.storage.local.get('bugReportErrorBuffer')
window.scrollY
window.innerWidth/Height
pdfParseStatus from currentPatent
        ↓
buildReportPayload({ context, category, note, settings, errors, includeSelectionText })
        ↓
chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })
        ↓
{ ok, queued, fingerprint, rateLimited, dropped } ← Phase 3 background result
        ↓
showSuccessToast / showFailureToast (existing citation-ui.js functions)
```

### Recommended Project Structure

```
src/content/
├── content-script.js     (modified — outcome object passed to UI functions)
├── citation-ui.js        (modified — mountReportButton, Report button in .cite-row)
├── report-dialog.js      (NEW — the dialog module)
└── paragraph-finder.js   (unchanged)

src/shared/
├── constants.js          (unchanged from Phase 2)
├── report-payload-builder.js  (unchanged from Phase 2)
└── report-transport.js   (unchanged from Phase 3)
```

### Pattern 1: Anchored Panel Mount in Existing Shadow Host

The report dialog does **NOT** call `getCitationHost()` to create a new host — it receives the `shadow` reference from `showCitationPopup`/`showErrorPopup` and appends to the same existing shadow root. This is crucial: `getCitationHost()` clears all existing content on each call (`while (citationShadow.firstChild) { citationShadow.removeChild(...) }`). The Report button and dialog must be appended within the lifecycle of a single `getCitationHost()` call. [VERIFIED: repo, `citation-ui.js:26-42`]

```javascript
// In report-dialog.js — called from showCitationPopup after popup is built
// Source: repo citation-ui.js:26-42 pattern
export function mountReportButton(shadow, reportOutcome) {
  // shadow is the already-open closed shadow root from getCitationHost()
  // reportOutcome: { category: string|null, confidenceTier: string }
  // Do NOT call getCitationHost() — shadow is already open and populated

  const btn = document.createElement('button');
  btn.className = 'cite-report-btn';
  btn.title = 'Report a problem';
  btn.setAttribute('aria-label', 'Report a problem with this citation');
  // TRIG-04: hide entirely on green
  if (reportOutcome.confidenceTier === 'green') {
    btn.style.display = 'none';
    return; // or just don't append
  }
  // D-06 nudge text on failure/yellow
  const isFailure = reportOutcome.confidenceTier !== 'green';
  btn.textContent = isFailure ? '⚑ Report a problem' : '⚑';
  // Append into the .cite-row (adjacent to copy button)
  const row = shadow.querySelector('.cite-row');
  if (row) row.appendChild(btn);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReportDialog(shadow, reportOutcome);
  });
}
```

### Pattern 2: Focus Trap in Closed Shadow DOM

jsdom's `document.activeElement` does not pierce shadow roots, so the focus trap must be implemented using `keydown` on the shadow root's `host` element, querying focusable elements from the shadow root directly. [ASSUMED — based on DOM spec + browser extension Shadow DOM behavior; no Context7 library to verify against, no official Chrome extension docs page covering this exact intersection]

```javascript
// Source: MDN DOM focus management pattern applied to Shadow DOM context [ASSUMED]
function installFocusTrap(shadowRoot, dialogEl, onEscape) {
  const focusableSelectors = [
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'a[href]',
  ].join(', ');

  function getFocusable() {
    return Array.from(dialogEl.querySelectorAll(focusableSelectors));
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = shadowRoot.activeElement; // shadow-scoped activeElement
    if (e.shiftKey) {
      if (active === first) { e.preventDefault(); last.focus(); }
    } else {
      if (active === last) { e.preventDefault(); first.focus(); }
    }
  }

  shadowRoot.addEventListener('keydown', handleKeydown);
  // Focus the first interactive element on open
  const focusable = getFocusable();
  if (focusable.length > 0) setTimeout(() => focusable[0].focus(), 0);

  return () => shadowRoot.removeEventListener('keydown', handleKeydown);
}
```

**Key pitfall:** `shadowRoot.addEventListener('keydown', ...)` works correctly because the shadow root is an `EventTarget`; keyboard events from child elements bubble up to it. However, `document.activeElement` from outside the shadow root returns the host element, not the focused element inside — always use `shadowRoot.activeElement` for focus queries within the trap. [ASSUMED — Shadow DOM spec behavior; confirmed by MDN spec but not tested in this repo's browser context]

### Pattern 3: PAY-09 XPath Capture from Selection

No XPath utility exists in the codebase. The standard technique for content scripts on Polymer-heavy pages is walking `parentNode` and counting same-tag siblings. [ASSUMED — canonical web technique; not verified via Context7 for this specific Google Patents Polymer context]

```javascript
// Source: canonical DOM XPath-from-node pattern [ASSUMED]
// Called at report-submit time (not at selection time), using window.getSelection()
function getXPathFromSelection() {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return getNodeXPath(node);
  } catch { return null; }
}

function getNodeXPath(node) {
  if (!node || node === document.body) return '/html/body';
  const parts = [];
  while (node && node !== document.documentElement) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentNode;
      continue;
    }
    const tag = node.tagName.toLowerCase();
    let idx = 1;
    let sib = node.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName.toLowerCase() === tag) idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${tag}[${idx}]`);
    node = node.parentNode;
  }
  return '/' + parts.join('/');
}
```

**Google Patents / Polymer note:** Patents pages use Polymer custom elements (`<patent-text>`, `<description-paragraph>`, etc.) as shadow hosts. The XPath produced will include these custom element tag names. This is acceptable for diagnostic purposes — a Polymer host tag in the XPath is still meaningful triage context (identifies the DOM region) and doesn't cause the capture to fail. The value is diagnostic-only; it need not be a round-trippable locator. [ASSUMED — Polymer DOM structure inferred from E2E test HTML snapshots in `tests/e2e/artifacts/phase27-final/`]

### Pattern 4: pdfParseStatus Derivation from `currentPatent`

`pdfParseStatus` is NOT a new field on `currentPatent`. It is **derived** at report-submit time by reading `chrome.storage.local` for `currentPatent` and mapping the existing `{ status, source, patentType }` fields. [VERIFIED: repo — `content-script.js` already reads `currentPatent` at `lines 459-468` using `chrome.storage.local.get('currentPatent')`]

| Condition | `pdfParseStatus` value |
|-----------|----------------------|
| `patentType === 'application'` | `'skipped'` (DOM-based citation, no PDF) |
| `patent.status === 'parsed'` AND prior `CACHE_HIT_RESULT` (source stays null in `handleCacheHitResult`) | `'cache-hit'` |
| `patent.status === 'parsed'` AND source is `'google'` or `'uspto'` | `'success'` |
| `patent.status === 'error'` OR `'no-text-layer'` OR `'unavailable'` | `'failed'` |
| `patent === null` OR `patent.status === 'fetching'` / `'parsing'` | `null` (PDF not yet ready at report time) |

**Identifying the cache-hit path:** `handleCacheHitResult` in `service-worker.js` sets `patent.status = STATUS.PARSED` but never sets `patent.source` (source was set to `null` in `handlePdfLinkFound` or `handlePdfUnavailable` before the cache check). So `status === 'parsed' && source === null` is the cache-hit signal. [VERIFIED: repo, `service-worker.js:391-406`]

```javascript
// Source: repo service-worker.js:391-406 and content-script.js:459-468 pattern [VERIFIED]
async function getPdfParseStatus(patentType) {
  if (patentType === 'application') return 'skipped';
  try {
    const data = await chrome.storage.local.get('currentPatent');
    const patent = data.currentPatent;
    if (!patent) return null;
    if (patent.status === 'parsed' && patent.source === null) return 'cache-hit';
    if (patent.status === 'parsed') return 'success';
    if (['error', 'no-text-layer', 'unavailable'].includes(patent.status)) return 'failed';
    return null; // fetching/parsing — not yet determined
  } catch { return null; }
}
```

### Pattern 5: PAY-08 Error Ring Buffer — Explicit Tag-Filter Wrapper

**Approach: explicit wrapper function, NOT a global monkeypatch of `console.error`.**

Rationale:
1. The content script currently has zero `console.error` calls (`grep -n "console\.error" src/content/content-script.js` = no results). A wrapper is only needed where extension-tagged errors actually occur.
2. Extension-tagged errors in the relevant files all use prefix patterns: `[SW]`, `[Offscreen]`, `[Firefox]`. [VERIFIED: repo grep]
3. Content-script errors should use a new `[PCT]` prefix (matching D-08's description of "e.g. [SW]/[PCT] prefixes").
4. A monkeypatch of `console.error` in the content script risks intercepting host-page errors if the prefix check has a bug — the explicit wrapper is safer and easier to test.

```javascript
// In report-dialog.js or a shared helper — called once during content-script initialization
// Source: pattern derived from D-08 decision + repo console tag convention [VERIFIED: repo + ASSUMED: approach]
const ERROR_BUFFER_KEY = 'bugReportErrorBuffer';
const BUFFER_MAX = 20;
const EXTENSION_PREFIXES = ['[SW]', '[PCT]', '[Offscreen]', '[Firefox]'];

// Install ring-buffer wrapper in content script context
export function installErrorBuffer() {
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  function isExtensionTagged(args) {
    const first = args[0];
    if (typeof first !== 'string') return false;
    return EXTENSION_PREFIXES.some(p => first.startsWith(p));
  }

  async function appendToBuffer(level, args) {
    try {
      const entry = {
        level,
        message: args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').substring(0, 500),
        ts: Date.now(),
      };
      const stored = await chrome.storage.local.get(ERROR_BUFFER_KEY);
      const buf = Array.isArray(stored[ERROR_BUFFER_KEY]) ? stored[ERROR_BUFFER_KEY] : [];
      buf.push(entry);
      const trimmed = buf.length > BUFFER_MAX ? buf.slice(buf.length - BUFFER_MAX) : buf;
      await chrome.storage.local.set({ [ERROR_BUFFER_KEY]: trimmed });
    } catch { /* never throw from error handler */ }
  }

  console.error = function(...args) {
    origError(...args);
    if (isExtensionTagged(args)) appendToBuffer('error', args);
  };
  console.warn = function(...args) {
    origWarn(...args);
    if (isExtensionTagged(args)) appendToBuffer('warn', args);
  };
}
```

**Background script installation:** The same `installErrorBuffer()` (or an identical copy) is called at the top of `service-worker.js` and `firefox/background.js` to capture `[SW]` and `[Firefox]`-prefixed errors. The `chrome.storage.local` write is the same key, so the ring buffer pools errors from both contexts. [ASSUMED — storage write ordering not guaranteed across contexts, but last-writer-wins is acceptable for a diagnostic ring buffer]

**Recursion guard:** The `origError.bind(console)` call is safe because the override does NOT call `console.error` inside the error path (only `origError`). The `catch` block swallows, preventing infinite recursion. [ASSUMED]

### Pattern 6: Outcome → Category Mapping and Trigger Wiring

**Approach: pass a minimal `reportOutcome` object through the existing function signatures using a new optional final parameter.** This avoids refactoring the existing signature-compatible call sites.

```javascript
// Extended signatures — new final optional param, default null = no Report button
// Source: repo content-script.js:111, citation-ui.js:111 [VERIFIED]
export function showCitationPopup(citation, rect, confidence, displayMode, matchedText, reportOutcome = null)
export function showErrorPopup(errorMessage, rect, reportOutcome = null)
```

**content-script.js trigger sites** (complete map, derived from code analysis):

| Line | Call Site | Outcome → Category | confidenceTier |
|------|-----------|-------------------|----------------|
| `452` | App patent → `findParagraphCitation` success | `showCitationPopup(...)` | `confidence ≥ 0.95` → `'green'`; `confidence ≥ 0.80` → `'yellow'` (→ "inaccurate_citation"); else `'red'` (TRIG-02) |
| `454` | App patent → `findParagraphCitation` null | `showErrorPopup('Paragraph not found in application', ...)` | `'red'` → "no_match" (TRIG-01) |
| `469` | Grant patent → status ≠ 'parsed' | `showErrorPopup(statusMsg, ...)` where statusMsg is 'PDF analysis failed'/'PDF not available' | `'red'` → "tool_not_working" (TRIG-03) |
| `536` | Grant patent → `CITATION_RESULT` success | `showCitationPopup(prefixedCitation, rect, message.confidence, ...)` | Same confidence bands as line 452 |
| `543-548` | Grant patent → `CITATION_RESULT` no-match | `showErrorPopup('Text not found in patent specification', ...)` | `'red'` → "no_match" (TRIG-01) |
| `543-548` | Grant patent → `CITATION_RESULT` no-position-map | `showErrorPopup('PDF has not been analyzed yet', ...)` | `'red'` → "tool_not_working" (TRIG-03) |
| `543-548` | Grant patent → `CITATION_RESULT` other error ('lookup-failed') | `showErrorPopup('Citation lookup failed', ...)` | `'red'` → "tool_not_working" (TRIG-03) |
| `438` | Not on a patent page | `showErrorPopup('Not on a patent page', ...)` | No report button (out of scope — not a patent citation failure) |

**Confidence → tier mapping** (Phase 4 deliverable per Phase 2 D-04):

```javascript
// Source: citation-ui.js:124 for the HIGH/MEDIUM/LOW thresholds [VERIFIED: repo]
// Phase 2 D-04: confidenceTier is a STRING passthrough; Phase 4 owns the numeric→tier mapping
function mapConfidenceTier(confidence) {
  if (confidence >= 0.95) return 'green';   // high — TRIG-04: hide Report button
  if (confidence >= 0.80) return 'yellow';  // medium — TRIG-02: "Inaccurate citation"
  return 'red';                              // low — TRIG-01/02: "No match found" or "Inaccurate citation"
}
```

**Category selection logic:**

```javascript
function mapOutcomeToReportCategory(errorCode, confidence) {
  // error outcomes
  if (errorCode === 'no-match') return 'no_match';
  if (errorCode === 'no-position-map') return 'tool_not_working';
  if (errorCode === 'lookup-failed') return 'tool_not_working';
  if (errorCode === 'pdf-not-available') return 'tool_not_working';
  // paragraph not found in application patent
  if (errorCode === 'paragraph-not-found') return 'no_match';
  // success path with yellow/red confidence
  if (confidence !== null && confidence < 0.95) return 'inaccurate_citation';
  return null; // green success — no Report button
}
```

### Pattern 7: esbuild IIFE Import Constraints

`src/content/content-script.js` is the esbuild IIFE entry point (`scripts/build.js:34`). `report-dialog.js` must be imported from `content-script.js` (or from `citation-ui.js` which is already imported by `content-script.js`). Since esbuild bundles the entire IIFE tree, `report-dialog.js` imports from `../shared/constants.js` and `../shared/report-payload-builder.js` work correctly — esbuild resolves them into the IIFE bundle. [VERIFIED: repo `scripts/build.js:33-41`]

The `chrome.*` APIs used in `report-dialog.js` (storage.local, runtime.sendMessage, runtime.getManifest) are globals injected by the extension runtime — not imported. No special bundling treatment needed.

### Anti-Patterns to Avoid

- **Calling `getCitationHost()` from `report-dialog.js`:** `getCitationHost()` clears the shadow root on every call. The Report button and dialog must mount within the same shadow DOM lifecycle as the popup they accompany. Always receive `shadow` as a parameter, never call `getCitationHost()` from the dialog module.
- **Using `<dialog>` element for the panel:** The `<dialog>` element's `showModal()` method and `::backdrop` CSS pseudo-element do not work reliably inside Shadow DOM across all browser versions. Use a styled `<div role="dialog">` instead. [ASSUMED — browser compatibility concern; `<dialog>` in Shadow DOM is an evolving area]
- **Intercepting `document.addEventListener('mousedown', ...)` for click-outside from inside the shadow:** The existing pattern in `citation-ui.js:224-230` uses `document.addEventListener('mousedown', handler)` and checks `citationHost.contains(e.target)`. Since Shadow DOM retargets events to the host, this pattern works correctly — events inside the shadow appear as targeting `citationHost`. The same pattern works for the dialog's click-outside handler. [VERIFIED: repo `citation-ui.js:224-231` + CONTEXT.md note about retargeting at content-script.js:181-182]
- **Monkeypatching console before `origError.bind()`:** Always bind before replacing. Not binding first means `origError()` calls the (already replaced) `console.error` → infinite recursion.
- **Writing to `bugReportErrorBuffer` on every console call synchronously:** The `chrome.storage.local.set` is async. Use fire-and-forget (`appendToBuffer(...).catch(() => {})`); never await it from the synchronous `console.error` override.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payload schema validation | Custom validator | `buildReportPayload()` Phase 2 module | Already throws on missing patentNumber/category/extensionVersion; all 17 fields handled |
| Report transmission | Direct fetch in content script | `MSG.SUBMIT_REPORT` → Phase 3 background handler | XPORT-06: content scripts cannot cross-origin POST; Phase 3 has rate-limit + queue + retry |
| Toast rendering | New toast element in report-dialog.js | Existing `showSuccessToast`/`showFailureToast` from `citation-ui.js` | QUEUE-04 specifies reusing the existing yellow/green confidence toast pattern |
| Storage key for ring buffer | Any key other than `bugReportErrorBuffer` | `chrome.storage.local` key `bugReportErrorBuffer` | PAY-08: specific key required; `buildReportPayload` reads `errors` param which the caller populates from this key |
| Browser/OS detection | Full UA parser | Minimal `navigator.userAgent` slice | Schema only needs low-fidelity string; `browser-schema.md` field is `browser: string|null`; keep it simple |

**Key insight:** The content script must be seen as a thin rendering and capture layer. All stateful operations (queue, rate-limit, retry, storage of transport metadata) live in Phase 3 modules. The content script only: (1) captures live page context, (2) renders the dialog, (3) sends `MSG.SUBMIT_REPORT`, (4) renders the result toast.

---

## Common Pitfalls

### Pitfall 1: Report Button Disappears on Close/Re-open
**What goes wrong:** `getCitationHost()` is called again to show the dialog or a toast, clearing the shadow root. The Report button (mounted inside that same shadow root) is wiped.
**Why it happens:** `citation-ui.js:27-32` — `getCitationHost()` always calls `while (citationShadow.firstChild) { citationShadow.removeChild(...) }` before returning. [VERIFIED: repo `citation-ui.js:27-32`]
**How to avoid:** The dialog must be mounted in the SAME `getCitationHost()` call that builds the popup. Once the dialog is open, do NOT call any function that internally calls `getCitationHost()` — including `showSuccessToast` and `showFailureToast`. Instead, implement a dedicated post-submit close + toast sequence: (1) dismiss the dialog panel within the shadow root (remove only the dialog element, not the whole host), then (2) call `showSuccessToast`/`showFailureToast` which re-enters `getCitationHost()` cleanly.
**Warning signs:** Report button or dialog vanishes immediately on click; toast appears but dialog never closes.

### Pitfall 2: Escape Key Not Trapped — Google Patents Steals Focus
**What goes wrong:** Keydown events intended for the dialog are intercepted by Google Patents' Polymer key bindings (e.g., keyboard shortcuts for the patent page itself).
**Why it happens:** Content scripts share keydown event bubbling with the host page; `stopPropagation()` on the shadow root does NOT prevent host-page handlers registered at `document` level.
**How to avoid:** Call `e.stopPropagation()` in the shadow root's keydown handler for Escape AND Tab. For Escape specifically, also call `e.preventDefault()` to suppress any built-in browser actions. Register the keydown handler on `shadowRoot` (not `dialogEl`), since `shadowRoot` is the target for events bubbling out of the closed shadow. [ASSUMED — event propagation across shadow boundary; verified pattern mirrors citation-ui.js line 171 `e.stopPropagation()`]
**Warning signs:** Escape dismisses a Google Patents modal instead of the report dialog; Tab focus escapes into the host page.

### Pitfall 3: `window.getSelection()` Returns Stale Selection at Dialog Submit Time
**What goes wrong:** When the user clicks the Report button, the browser clears the text selection. By the time they fill out the form and click Submit, `window.getSelection()` returns an empty selection.
**Why it happens:** Text selection is a live object; clicking any element typically deselects text (browser default behavior).
**How to avoid:** Capture the XPath and selection text at **Report button click time** (when the selection is still likely present from the triggering interaction), not at Submit time. Store captured values in closure variables on the dialog instance. The `selected_node_xpath` and `selectionText` are captured when `showReportDialog` is called, not when `buildReportPayload` is called.
**Warning signs:** `xpathNode` is always null in submitted payloads; `selectionText` in "What's included" preview is always empty.

### Pitfall 4: `chrome.storage.local.set` for Ring Buffer Races
**What goes wrong:** Two concurrent `console.error` calls both read the ring buffer, each sees 19 entries, both write 20 entries — net result: 20 entries, but one error is lost.
**Why it happens:** `chrome.storage.local.get` + modify + `set` is a three-step operation across the microtask queue; two overlapping calls can interleave.
**How to avoid:** The ring buffer fire-and-forget pattern tolerates occasional loss — it is a diagnostic aid, not an audit log. The design priority is: never throw, never block. A simple `appendToBuffer` with `await` internally (using a module-level promise chain for serialization) prevents most races without complexity. However, given the MV3 SW termination model, a pure serial chain in the background is sufficient; the content script context has lower event concurrency. Accept occasional entry loss as an acceptable tradeoff for simplicity.
**Warning signs:** Ring buffer sometimes has fewer than expected entries after rapid-fire errors; specific errors are missing.

### Pitfall 5: Focus Not Restored on Escape/Cancel Dismiss
**What goes wrong:** After the dialog closes, the user's keyboard focus is on `document.body` or lost entirely, requiring a mouse click to re-engage.
**Why it happens:** Closing the dialog removes focused elements; browsers may move focus to body.
**How to avoid:** Before opening the dialog, save the element that triggered opening (`btn` reference) as `triggerElement`. On any dismiss path (Escape, Cancel, click-outside, Submit-close), call `triggerElement.focus()` after the dialog is removed from the DOM. [VERIFIED: CAP-04 requirement; pattern is standard a11y practice]
**Warning signs:** CAP-04 Success Criterion 3 fails in verification — "focus restored to trigger element on close."

### Pitfall 6: pdfParseStatus = 'cache-hit' — source === null Ambiguity
**What goes wrong:** `source === null` can mean the patent was fetched but the source wasn't set (intermediate state) OR it was a cache hit. Using this signal incorrectly tags a partially-initialized patent as 'cache-hit'.
**Why it happens:** `handlePdfUnavailable` sets `source: null` initially before cache check. `handleCacheHitResult` also leaves source null. [VERIFIED: repo `service-worker.js:225, 397-406`]
**How to avoid:** Only use `source === null && status === 'parsed'` for cache-hit detection. The `status === 'parsed'` condition eliminates the partial-initialization case (which has `status: 'fetching'` or `'parsing'`). [VERIFIED: repo logic]

### Pitfall 7: 256-Char Counter Counts Bytes vs Characters
**What goes wrong:** Users with multi-byte characters (emoji, CJK) see the counter exceed 256 before the UI limit is enforced, because the counter counts `String.length` (UTF-16 code units) differently than the Worker's byte limit check.
**Why it happens:** The PAY-01 schema says `note: string | null` with the Worker accepting it; the UI limit of 256 chars is a UX cap, not a byte limit. The Worker doesn't validate note length.
**How to avoid:** Count `note.length` (code units, like JavaScript string length) for the counter and enforce the 256-unit limit on the `input` event. Document in code that this is a character-unit limit, not a byte limit. For the purposes of this tool's triage use case, 256 code units is acceptable without full UTF-8 byte counting. [ASSUMED]

---

## Code Examples

### Dialog Skeleton (CAP-01 / D-01 / D-02)

```javascript
// Source: repo citation-ui.js:417-497 CSS aesthetic patterns [VERIFIED]
function getReportDialogCSS() {
  return `
    .cite-report-panel {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.14);
      padding: 12px 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      min-width: 220px;
      max-width: 320px;
      position: relative;
    }
    /* Radio group, note textarea, counter, What's-included collapsible — 
       all use the same font/color stack from getCitationPopupCSS() */
  `;
}

// report-dialog.js public API
export function showReportDialog(shadow, reportOutcome, selectionRect) {
  // 1. Capture diagnostic context IMMEDIATELY (selection may deselect on click)
  const xpathNode = getXPathFromSelection();
  const scrollY = window.scrollY;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const selectionText = window.getSelection()?.toString() ?? null;

  // 2. Build panel and inject styles
  const style = document.createElement('style');
  style.textContent = getReportDialogCSS();
  shadow.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'cite-report-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Report a citation problem');
  panel.style.pointerEvents = 'auto';
  // ... build radio, note, submit, cancel, what's-included ...
  shadow.appendChild(panel);
  // 3. Install focus trap
  const removeTrap = installFocusTrap(shadow, panel, () => dismissDialog());
  // 4. Click-outside handler (same pattern as citation-ui.js:224-231)
  // 5. On submit: buildReportPayload + sendMessage + toast
}
```

### Report Button in cite-row (CAP-03)

```javascript
// Source: repo citation-ui.js:128-148 cite-row construction [VERIFIED]
// In showCitationPopup, after copyBtn is appended to row:
if (reportOutcome) {
  const reportBtn = document.createElement('button');
  reportBtn.className = 'cite-report-btn';
  reportBtn.title = 'Report a problem';
  reportBtn.setAttribute('aria-label', 'Report a problem with this citation');
  const showNudge = reportOutcome.confidenceTier !== 'green';
  reportBtn.textContent = showNudge ? '⚑ Report a problem' : '⚑';
  if (reportOutcome.confidenceTier === 'green') {
    // TRIG-04: hide entirely on green
    return; // don't append
  }
  reportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReportDialog(shadow, reportOutcome, rect);
  });
  row.appendChild(reportBtn);
}
```

### Sticky Toggle Restore (CAP-02)

```javascript
// Source: repo chrome.storage.sync.get pattern from options.js:45-57 [VERIFIED]; adapted for .local
async function loadStickyToggle() {
  const stored = await chrome.storage.local.get('reportDialogRemoveSelectionText');
  return stored.reportDialogRemoveSelectionText === true;
}
async function saveStickyToggle(value) {
  await chrome.storage.local.set({ reportDialogRemoveSelectionText: value });
}
```

### Submit Handler

```javascript
// Source: Phase 2 buildReportPayload + Phase 3 MSG.SUBMIT_REPORT contract [VERIFIED: repo]
async function handleSubmit({ category, note, includeSelectionText, capturedContext }) {
  const patentInfo = extractPatentInfo(); // reuse existing function from content-script.js
  const patent = (await chrome.storage.local.get('currentPatent')).currentPatent;
  const pdfParseStatus = await getPdfParseStatus(patentInfo?.patentType);
  const errors = (await chrome.storage.local.get('bugReportErrorBuffer')).bugReportErrorBuffer ?? [];
  const settings = { triggerMode: cachedSettings.triggerMode };

  const context = {
    patentNumber: patentInfo?.patentId?.replace(/^US/, '') ?? '',
    selectionText: capturedContext.selectionText,
    returnedCitation: capturedContext.returnedCitation ?? null,
    confidenceTier: capturedContext.confidenceTier,
    extensionVersion: chrome.runtime.getManifest().version,
    browser: getBrowserString(),  // minimal navigator.userAgent slice
    os: getOsString(),
    xpathNode: capturedContext.xpathNode,
    scrollY: capturedContext.scrollY,
    viewportWidth: capturedContext.viewportWidth,
    viewportHeight: capturedContext.viewportHeight,
    pdfParseStatus,
  };

  const payload = buildReportPayload({ context, category, note, settings, errors, includeSelectionText });
  const result = await chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload });

  dismissDialog();
  if (result?.ok) {
    showSuccessToast('Report sent — thank you', selectionRect);
  } else if (result?.queued) {
    showSuccessToast('Report saved — will retry when online', selectionRect);
  } else if (result?.rateLimited) {
    showFailureToast('Too many reports in a short period — please wait a few minutes', selectionRect);
  }
  // dropped: silent per Phase 3 D-07
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 4 |
|--------------|------------------|---------------------|
| Monkeypatch `console` globally | Tag-filtered explicit wrapper (D-08) | Only log entries starting with `[SW]`, `[PCT]`, `[Offscreen]`, `[Firefox]` captured |
| `<dialog>` element for modals | Styled `<div role="dialog">` with manual trap | Avoids Shadow DOM compat issues with `showModal()` and `::backdrop` |
| `document.activeElement` for focus tracking | `shadowRoot.activeElement` | Correct focus tracking inside closed shadow root |
| Auto-open dialog on failure | Button surfaces, dialog opens on click only (D-05) | User-initiated interaction; CWS/AMO submission compliance |

---

## Trigger-Detection Wiring: Complete Site Map

All sites in `content-script.js` that call `showCitationPopup` or `showErrorPopup` and their Phase 4 outcome mapping:

```
generateCitation() — line 433
  App patent path:
    result (line 451-454):
      success: showCitationPopup(citation, rect, confidence, displayMode)
               → reportOutcome: mapConfidenceTier(confidence)
               → category: confidence < 0.95 ? 'inaccurate_citation' : null (green, TRIG-04)
      failure: showErrorPopup('Paragraph not found in application', rect)
               → reportOutcome: { category: 'no_match', confidenceTier: 'red' }

    status ≠ 'parsed' (line 469):
      showErrorPopup(statusMsg, rect)
      statusMsg variants:
        'PDF is still being analyzed...' → no Report button (transient state, not a failure yet)
        'PDF analysis failed'            → { category: 'tool_not_working', confidenceTier: 'red' }
        'PDF not available'              → { category: 'tool_not_working', confidenceTier: 'red' }

handleCitationResult() — line 509
  Non-silent mode:
    success (line 536): showCitationPopup(citation, rect, confidence, displayMode)
               → same as app patent success path above
    error 'no-match' (line 543-544):
               showErrorPopup('Text not found in patent specification', rect)
               → { category: 'no_match', confidenceTier: 'red' }
    error 'no-position-map' (line 545-546):
               showErrorPopup('PDF has not been analyzed yet', rect)
               → { category: 'tool_not_working', confidenceTier: 'red' }
    error other (line 547):
               showErrorPopup('Citation lookup failed', rect)
               → { category: 'tool_not_working', confidenceTier: 'red' }
```

**Note on TRIG-03 specifics:** "Worker-fallback error" in TRIG-03 refers to when the USPTO Worker proxy returns 5xx or times out. This surfaces to the content script as `patent.status === 'error'` or `'unavailable'` (set by `handleUsptoFetchResult` when both sources fail), which then shows as `showErrorPopup('PDF analysis failed'/'PDF not available')` — correctly mapped to `'tool_not_working'`. There is no direct "Worker 5xx" signal in the content script; it arrives indirectly via the `currentPatent.status` field. [VERIFIED: repo `service-worker.js:357-385`, `content-script.js:462-469`]

---

## Environment Availability

Phase 4 is entirely in-extension content script code with no external tooling dependencies beyond the build system already in use.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `npm run build` (esbuild) | Bundle report-dialog.js into IIFE | Already in use | Same as current | — |
| `vitest run` | Unit tests | Already in use | Same as current | — |
| `chrome.storage.local` | Ring buffer + sticky toggle | Extension runtime | MV3 | — |
| `window.getSelection()` | PAY-09 XPath capture | Browser built-in | Universal | Return null if unavailable |
| `window.scrollY`, `window.innerWidth/Height` | PAY-09 viewport capture | Browser built-in | Universal | Return null |

No external dependencies added. No new environment setup required.

---

## Validation Architecture

> `nyquist_validation: false` in `.planning/config.json` — Validation Architecture section SKIPPED per config.

---

## Security Domain

> Phase 4 is content-script UI + in-extension storage only; all external data flows through Phase 3 background handler. Key security notes:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes — note field | 256-char limit enforced in `<textarea maxlength="256">` AND in `buildReportPayload` (builder truncates/defaults) |
| V4 Access Control | No — no auth surface in content script | — |
| V2 Authentication | No — `MSG.SUBMIT_REPORT` flows to background which adds the PROXY_TOKEN | — |
| V6 Cryptography | No — no crypto in Phase 4 | — |

**Content script data boundary:** The `bugReportErrorBuffer` ring buffer captures only extension-tagged console messages (tag prefix filter). The `xpathNode` captures the user's selected DOM node XPath — this is user-generated page data intentionally included per PAY-09. The `selectionText` is controlled by the `includeSelectionText` toggle per CAP-02/PAY-06 D-06.

**PAY-03 re-check:** `report-dialog.js` MUST NOT add `ip`, `clientIp`, or `userAgent` to the context object. The `browser` and `os` fields use low-fidelity navigator slices. [VERIFIED: report-schema.md PAY-03 constraint]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Focus-trap via `shadowRoot.activeElement` + `shadowRoot.addEventListener('keydown')` works correctly in Chrome/Firefox content scripts with closed shadow roots | Architecture Patterns (Pattern 2) | Focus may escape to host page; needs UAT verification (Phase 5 UAT-05) |
| A2 | `<div role="dialog">` with manual focus trap is preferred over `<dialog>` element in Shadow DOM | Anti-Patterns | `<dialog>` may work fine in modern Chrome/Firefox; using `<div>` is conservative |
| A3 | `source === null && status === 'parsed'` correctly identifies cache-hit path; no other code path produces this combination | Architecture Patterns (Pattern 4) | Incorrect pdfParseStatus='cache-hit' when it should be 'success'; low impact (diagnostic field) |
| A4 | Explicit tag-filter wrapper (not monkeypatch) for console.error/warn is sufficient to avoid recursion and page-origin contamination | Architecture Patterns (Pattern 5) | If recursion occurs with the bind approach, the extension could crash; easy to verify in testing |
| A5 | XPath from `window.getSelection().getRangeAt(0).startContainer.parentNode` via `getNodeXPath` produces useful diagnostic output on Google Patents Polymer DOM | Architecture Patterns (Pattern 3) | XPath may be long/unreadable; still valid as a diagnostic string, just less useful for triage |
| A6 | Capturing XPath at Report button click time (not at Submit time) captures the user's original selection node even if selection clears | Common Pitfalls (Pitfall 3) | If selection clears before click fires, xpathNode would still be null; acceptable fallback |
| A7 | `appendToBuffer` fire-and-forget race condition produces occasional entry loss but never corrupts the buffer | Common Pitfalls (Pitfall 4) | Rare corruption of the buffer array if set() clobbers; low severity |

---

## Open Questions (RESOLVED)

1. **`[PCT]` vs `[CS]` prefix for content-script errors**
   - What we know: D-08 says "e.g. [SW]/[PCT] prefixes" — PCT likely stands for "Patent Citation Tool"
   - What's unclear: No `[PCT]` prefix currently exists in any source file; the content script has zero `console.error` calls
   - Recommendation: Use `[PCT]` as the content-script tag (matches D-08 reference); add at any new `console.error`/`console.warn` calls added to `content-script.js` or `report-dialog.js`

2. **Browser/OS minimal string format**
   - What we know: Schema field `browser: string|null`, example value `"Chrome/125"` from `report-schema.md`; example `os: "Windows 10"`
   - What's unclear: Exact parsing approach from `navigator.userAgent` for both Chrome and Firefox
   - Recommendation: `navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]` for Chrome; `navigator.userAgent.match(/Firefox\/[\d.]+/)?.[0]` for Firefox; `navigator.platform` or a simple UA platform token for OS. These are low-fidelity by design (PAY-03 forbids full userAgent)

3. **What's included preview rendering**
   - What we know: D-03 says friendly labels; D-04 says collapsed by default; the toggle hides "selection text" row
   - What's unclear: Whether the preview should show the actual live values (computed at open time) or placeholders
   - Recommendation: Show live values computed at dialog-open time (not at submit time) — makes the privacy preview meaningful; the `xpathNode` can be shortened with `...` if long

---

## Sources

### Primary (HIGH confidence)
- `src/content/citation-ui.js` — all patterns for Shadow DOM mounting, popup styling CSS, viewport clamping, existing toast functions
- `src/content/content-script.js` — all `showCitationPopup`/`showErrorPopup` call sites, `currentPatent` storage read pattern, `extractPatentInfo()` function
- `src/shared/report-payload-builder.js` — `buildReportPayload` signature, `context` field definitions
- `src/shared/constants.js` — `MSG.SUBMIT_REPORT`, `REPORT_CATEGORIES`
- `src/background/service-worker.js` — `currentPatent` shape (`status`, `source`), `handleCacheHitResult` (source=null on cache hit), `MSG.SUBMIT_REPORT` handler return contract
- `worker/src/report-schema.md` — field allowlist, PAY-03 forbidden fields
- `.planning/phases/02-shared-constants-pure-payload-builder/02-CONTEXT.md` — Phase 2 decisions D-03/D-04/D-06/D-07/D-08
- `.planning/phases/03-background-submission-handler-rate-limit-retry-queue/03-CONTEXT.md` — Phase 3 D-06 (background owns logic, caller renders toasts), D-08 return shape
- `scripts/build.js` — esbuild IIFE entry point, import resolution for content scripts
- `tests/unit/report-payload-builder.test.js` — vitest patterns, `makeReportInputs` factory pattern for tests

### Secondary (MEDIUM confidence)
- `src/shared/matching.js:637-729` — `matchAndCite` Tier 5 outputs exactly confidence `0.85`, falls in yellow band (≥ 0.80)
- `tests/unit/report-transport-chrome.test.js` — stateful `chrome.storage.local` mock pattern (for Phase 4 test authoring)
- `tests/e2e/lib/extension-loader.js` — Shadow DOM closed→open shim (production code uses `mode:'closed'`; E2E tests patch it to `mode:'open'`)

### Tertiary (LOW confidence — tagged [ASSUMED])
- Focus-trap behavior in closed Shadow DOM (A1): `shadowRoot.activeElement` and `shadowRoot.addEventListener` — inferred from Shadow DOM spec; needs runtime verification
- `<div role="dialog">` preference over `<dialog>` element in Shadow DOM (A2): conservative approach; modern browsers may handle `<dialog>` fine
- Event propagation from Shadow DOM to host-page keydown handlers (Pitfall 2): inferred from DOM event model; needs browser testing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all patterns from existing codebase
- Architecture (trigger wiring, popup mounting, pdfParseStatus): HIGH — derived from verified repo code
- PAY-09 XPath / focus-trap / console interception: MEDIUM-LOW (marked ASSUMED) — standard web techniques applied to closed Shadow DOM context; needs runtime validation
- Pitfalls: HIGH — most derived from direct code reading; focus-trap pitfalls ASSUMED

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (stable — no fast-moving dependencies)

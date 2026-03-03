# Phase 5: Silent Mode - Research

**Researched:** 2026-03-02
**Domain:** Chrome Extension clipboard interception / content script UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Clipboard format**
- Space-only separator between selected text and citation (no period, no comma)
- Raw append — no wrapping, no parentheses, no quotes
- Format: `selected text 4:12-15`
- With patent prefix enabled: `selected text '123 Pat., 4:12-15`
- Multi-line selections: citation appended at end of last line, internal line breaks preserved

**Success feedback**
- Brief toast near the selection showing the citation that was appended
- Auto-dismiss after 2 seconds
- Minimal pill style — small, unobtrusive, just shows the citation text (e.g., "4:12-15")

**Failure feedback**
- Specific reason per failure type:
  - No match: "No match — plain text copied"
  - Low confidence: "Low confidence — plain text copied"
  - PDF not analyzed: "PDF not analyzed — plain text copied"
- Toast appears near the selection (same position as success toast)
- Auto-dismiss after 4 seconds (matches existing error popup timing)
- Prominent style — larger than success pill, with explanation text
- Confidence threshold: below 0.80 = plain text + failure toast

**Mode switching**
- "Silent" is a 4th option in the existing trigger mode dropdown (replaces other modes, mutually exclusive)
- When PDF isn't analyzed or user is on non-patent page: Ctrl+C works normally with no toast, no interference
- No visual indicator on extension icon when silent mode is active
- No onboarding hint when switching to silent mode — dropdown label is self-explanatory

### Claude's Discretion

- Exact toast pill dimensions and styling
- Copy event interception approach (document `copy` event listener vs other patterns)
- Toast animation (fade in/out, slide, or instant)
- How to handle rapid successive Ctrl+C presses (debounce strategy)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SLNT-01 | User can enable "silent" trigger mode in popup settings | Add `<option value="silent">` to popup.html dropdown; add `'silent'` to `DEFAULT_SETTINGS.triggerMode` valid values in content-script.js |
| SLNT-02 | When silent mode active, Ctrl+C on highlighted patent text copies text with citation appended (format: `"text 4:12-15"`) | Copy event interception via `document.addEventListener('copy', ...)` + synchronous `clipboardData.setData()`; pre-compute citation on mouseup and store in `lastCitationResult` |
| SLNT-03 | When silent mode active, patent prefix setting applies to silent citations | Reuse existing `applyPatentPrefix()` function; apply during pre-computation on mouseup |
| SLNT-04 | When silent mode active and published application text is highlighted, Ctrl+C appends paragraph citation | Reuse existing `findParagraphCitation()` function; call during mouseup pre-computation for application patent type |
| SLNT-05 | When match confidence low or no match found, clipboard contains plain text only and toast explains why | In copy handler: check `lastCitationResult.confidence < 0.80` or `lastCitationResult === null`; allow default copy (no `preventDefault`); show failure toast |
</phase_requirements>

---

## Summary

Silent mode intercepts the browser's native `copy` event in the content script, appends a pre-computed citation to the clipboard text, and shows a transient toast notification. The architecture has two phases: (1) **mouseup**: pre-compute citation synchronously and store in a content-script variable; (2) **copy event**: read from that variable synchronously, call `event.clipboardData.setData('text/plain', appendedText)`, call `event.preventDefault()`, and show toast.

This pattern is necessary because the copy event handler must be **synchronous** — the Clipboard Events API spec requires that `clipboardData.setData()` be called synchronously within the handler. Asynchronous operations (like calling the service worker, IndexedDB, or `navigator.clipboard.writeText()`) cannot be initiated and awaited inside a copy handler. Therefore, citation lookup happens on mouseup (which has async headroom), and the copy handler reads the already-resolved result.

The existing codebase provides all the building blocks: `generateCitation()` already routes by patent type, `findParagraphCitation()` handles applications DOM-based lookup, `applyPatentPrefix()` handles prefix formatting, and `getCitationHost()` provides the Shadow DOM host for toast injection. Phase 5 adds a copy event listener, a pre-computation step on mouseup for the `'silent'` case, and two new toast UI functions (success pill, failure pill). No new permissions, no offscreen document changes, no service worker changes are required.

**Primary recommendation:** Intercept the `document` `copy` event in content-script.js. Pre-compute citation on mouseup when triggerMode is `'silent'`. Store result in `lastCitationResult`. Read synchronously in copy handler.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Clipboard Events API (browser built-in) | W3C Living Standard | Intercept copy, set custom clipboard data via `clipboardData.setData()` | The only synchronous mechanism for modifying clipboard content during a user-initiated copy; no library needed |
| `navigator.clipboard.writeText()` | Chrome 66+ | Async clipboard write (NOT used in copy handler; available as fallback elsewhere) | Already used in citation-ui.js for the Copy button — consistent approach |
| Shadow DOM (browser built-in) | Chrome 53+ | Isolated toast UI rendering | Established pattern in this codebase (getCitationHost); prevents CSS conflicts with Google Patents Polymer |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chrome.storage.sync` | MV3 built-in | Read `triggerMode` setting | Already used; `cachedSettings` already populated on init |
| `chrome.storage.local` | MV3 built-in | Read `currentPatent` status for pre-computation gating | Already used in `generateCitation()`; same pattern applies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `clipboardData.setData()` in copy handler | `navigator.clipboard.writeText()` in copy handler | `writeText()` is async — cannot be awaited in a synchronous copy handler; spec only supports `setData()` synchronously. Do NOT use `writeText()` inside the copy handler. |
| Pre-compute on mouseup | Pre-compute on copy event | Copy event fires on right-click copy and keyboard Ctrl+C; mouseup fires earlier giving async headroom for the service-worker roundtrip. Both are valid, but mouseup (on selection) keeps the async work outside the copy handler. |
| Document-level copy listener | Element-scoped copy listener | Document-level listener catches all copies regardless of where focus lands. Element-scoped misses copies triggered from keyboard when selection spans multiple elements. Use document-level. |

**Installation:** No additional packages needed. All APIs are browser built-ins or Chrome extension APIs already declared.

---

## Architecture Patterns

### Recommended Project Structure

No new files required. All changes land in existing files:

```
src/
├── content/
│   ├── content-script.js   # Add: lastCitationResult variable, copy event listener,
│   │                       #      silent case in handleSelection(), pre-compute helper
│   └── citation-ui.js      # Add: showSuccessToast(citation, rect), showFailureToast(reason, rect)
├── popup/
│   └── popup.html          # Add: <option value="silent"> in triggerMode <select>
└── shared/
    └── constants.js        # No changes needed
```

### Pattern 1: Pre-Compute on Mouseup (Silent Mode Path)

**What:** When `cachedSettings.triggerMode === 'silent'`, the mouseup handler pre-computes the citation asynchronously and stores the result in `lastCitationResult`. The copy handler reads this synchronously.

**When to use:** Always when silent mode is active and text is selected.

**Example:**

```javascript
// Source: W3C Clipboard API spec + MDN copy event docs

// Module-level state (add alongside citationInProgress, currentSelectionRect)
let lastCitationResult = null;   // { citation, confidence, rect } | null | 'plain-only'
let lastSelectionText = null;    // fingerprint for copy-handler validation

// In handleSelection() switch:
case 'silent':
  preSilentCitation(text, rect);
  break;

async function preSilentCitation(selectedText, rect) {
  lastCitationResult = null;
  lastSelectionText = selectedText.substring(0, 40) + selectedText.length;

  const patentInfo = extractPatentInfo();
  if (!patentInfo) {
    lastCitationResult = { type: 'plain', reason: null }; // no-op, no toast on non-patent
    return;
  }
  const { patentId, patentType } = patentInfo;

  if (patentType === PATENT_TYPE.APPLICATION) {
    const selection = window.getSelection();
    const result = findParagraphCitation(selection);
    if (result) {
      const citation = applyPatentPrefix(result.citation, patentId, patentType);
      lastCitationResult = { type: 'success', citation, confidence: result.confidence, rect };
    } else {
      lastCitationResult = { type: 'failure', reason: 'No match — plain text copied', rect };
    }
    return;
  }

  // Grant patent — check storage
  const data = await chrome.storage.local.get('currentPatent');
  const patent = data.currentPatent;
  if (!patent || patent.status !== 'parsed') {
    lastCitationResult = { type: 'failure', reason: 'PDF not analyzed — plain text copied', rect };
    return;
  }

  // Send lookup to service worker; result arrives via CITATION_RESULT message
  lastCitationResult = { type: 'pending', rect };
  const context = getSelectionContext();
  chrome.runtime.sendMessage({
    type: MSG.LOOKUP_POSITION,
    selectedText,
    patentId,
    contextBefore: context.contextBefore || '',
    contextAfter: context.contextAfter || '',
  });
  // CITATION_RESULT listener updates lastCitationResult when result arrives
}
```

### Pattern 2: Copy Event Handler (Synchronous Clipboard Write)

**What:** Intercepts the `copy` event at document level. Reads `lastCitationResult` synchronously. If a valid citation is ready, appends it to the selected text via `clipboardData.setData()` and prevents default. If not ready or confidence low, allows default copy and shows failure toast.

**When to use:** When `cachedSettings.triggerMode === 'silent'` and `lastCitationResult` is populated.

**Example:**

```javascript
// Source: MDN Element: copy event (https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event)
// Source: W3C Clipboard API spec (https://www.w3.org/TR/clipboard-apis/)

document.addEventListener('copy', (event) => {
  if (cachedSettings.triggerMode !== 'silent') return; // passthrough for other modes

  const selection = window.getSelection();
  const selectedText = selection?.toString() ?? '';
  if (!selectedText) return; // empty selection — let default proceed

  const result = lastCitationResult;

  if (!result || result.type === 'pending') {
    // Citation not ready yet — allow plain copy, no toast
    return;
  }

  if (result.type === 'plain') {
    // Non-patent page or no interference desired — passthrough
    return;
  }

  if (result.type === 'failure') {
    // Low confidence or no match — allow default copy, show failure toast
    showFailureToast(result.reason, result.rect);
    return; // NO preventDefault — user gets plain text naturally
  }

  if (result.type === 'success') {
    // Append citation to clipboard
    const appendedText = selectedText + ' ' + result.citation;
    event.clipboardData.setData('text/plain', appendedText);
    event.preventDefault(); // REQUIRED to override default clipboard content
    showSuccessToast(result.citation, result.rect);
    lastCitationResult = null; // consume — one-shot
    return;
  }
});
```

**Critical:** `event.preventDefault()` MUST be called to make `clipboardData.setData()` take effect. Without it, the browser ignores the custom data and copies the raw selection. Source: W3C Clipboard API spec section 4.3.

### Pattern 3: CITATION_RESULT Handler Update for Silent Mode

**What:** When a grant patent lookup completes asynchronously (via service worker → offscreen → back), the existing `CITATION_RESULT` message handler needs a branch for when the result should update `lastCitationResult` rather than show a popup.

**Example:**

```javascript
// In chrome.runtime.onMessage listener, extend handleCitationResult():
function handleCitationResult(message) {
  // Silent mode: store result for copy handler to consume
  if (cachedSettings.triggerMode === 'silent') {
    const rect = currentSelectionRect || { top: 100, bottom: 130, left: 100, right: 200 };
    if (message.success && message.confidence >= 0.80) {
      const patentInfo = extractPatentInfo();
      const citation = applyPatentPrefix(message.citation, patentInfo?.patentId, patentInfo?.patentType);
      lastCitationResult = { type: 'success', citation, confidence: message.confidence, rect };
    } else if (message.success && message.confidence < 0.80) {
      lastCitationResult = { type: 'failure', reason: 'Low confidence — plain text copied', rect };
    } else {
      const reason = message.error === 'no-match'
        ? 'No match — plain text copied'
        : 'PDF not analyzed — plain text copied';
      lastCitationResult = { type: 'failure', reason, rect };
    }
    citationInProgress = false;
    return; // Don't show popup
  }

  // Existing popup behavior for other modes...
  citationInProgress = false;
  // ... (existing code unchanged)
}
```

### Pattern 4: Toast UI Functions (citation-ui.js additions)

**What:** Two new functions added to `citation-ui.js`, following the same Shadow DOM host pattern. Success toast is a compact pill; failure toast is a more prominent pill with reason text.

**Example:**

```javascript
// Reuses getCitationHost() — same pattern as showLoadingIndicator()

function showSuccessToast(citation, rect) {
  const { host, shadow } = getCitationHost();
  const style = document.createElement('style');
  style.textContent = getSuccessToastCSS();
  shadow.appendChild(style);

  const pill = document.createElement('div');
  pill.className = 'cite-toast-success';
  pill.textContent = citation;

  // Position near bottom of selection
  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + 28 > window.innerHeight) top = rect.top - 34;
  if (left + 120 > window.innerWidth) left = window.innerWidth - 124;
  if (left < 4) left = 4;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';
  shadow.appendChild(pill);

  setTimeout(() => dismissCitationUI(), 2000); // auto-dismiss
}

function showFailureToast(reason, rect) {
  const { host, shadow } = getCitationHost();
  const style = document.createElement('style');
  style.textContent = getFailureToastCSS();
  shadow.appendChild(style);

  const pill = document.createElement('div');
  pill.className = 'cite-toast-failure';
  pill.textContent = reason;

  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + 36 > window.innerHeight) top = rect.top - 42;
  if (left + 220 > window.innerWidth) left = window.innerWidth - 224;
  if (left < 4) left = 4;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';
  shadow.appendChild(pill);

  setTimeout(() => dismissCitationUI(), 4000); // auto-dismiss
}
```

### Anti-Patterns to Avoid

- **Calling `navigator.clipboard.writeText()` inside the copy handler:** It is async and cannot be awaited synchronously. The spec requires `clipboardData.setData()` for copy event modification. Only `setData()` works here.
- **Calling async service worker message inside copy handler:** The copy event is synchronous — you cannot `await chrome.runtime.sendMessage()` and get a result before the handler returns. Pre-compute on mouseup instead.
- **Forgetting `event.preventDefault()`:** Without it, `clipboardData.setData()` is silently ignored and the browser uses the raw selection text. This is the single most common bug in copy interception.
- **Showing toast for non-patent pages or when PDF status is unavailable/pending:** When `lastCitationResult` type is `'plain'` or `'pending'`, pass through silently — no toast, no interference. Users expect Ctrl+C to work normally on non-patent content.
- **Re-entrant copy events:** The copy event handler should guard against `citationInProgress` if needed (though the pre-computation pattern avoids most re-entrancy issues since the handler is synchronous).
- **Using `clipboardData.setData()` with format other than `'text/plain'`:** For multi-line text with preserved line breaks, use `'text/plain'` — the browser preserves `\n` characters correctly. Do not use `'text/html'` unless HTML is intentionally being placed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard write in copy handler | Custom document.execCommand workaround | `event.clipboardData.setData('text/plain', text)` | The spec-compliant, synchronous, permission-free method for modifying clipboard during copy event |
| Toast positioning | Custom coordinate math library | Reuse the `rect`-based positioning already in citation-ui.js | Same viewport-clamping logic already proven to work on Google Patents |
| Shadow DOM for toast | New DOM injection | `getCitationHost()` — already exists in citation-ui.js | One host per page; prevents stacking and CSS leakage |
| Patent type detection | Re-parsing URL in copy handler | `extractPatentInfo()` already in content-script.js | Cached from init; no re-parsing needed |
| Prefix application | Custom string formatting | `applyPatentPrefix()` already in content-script.js | Handles the `'NNN Pat.,` format correctly with kind code |

**Key insight:** The clipboard interception domain in extensions is small: one event, one method (`setData`), one requirement (`preventDefault`). The complexity is entirely in the async coordination between mouseup and copy — solved by storing pre-computed state in a content-script variable.

---

## Common Pitfalls

### Pitfall 1: Race Between Mouseup and Ctrl+C

**What goes wrong:** User selects text slowly, immediately presses Ctrl+C before the grant patent service worker lookup (`LOOKUP_POSITION` → `CITATION_RESULT`) completes. `lastCitationResult` is still `{ type: 'pending' }` when the copy handler fires.

**Why it happens:** The async service worker roundtrip (content script → SW → offscreen → SW → content script) takes ~50-200ms. Ctrl+C can fire during that window.

**How to avoid:** When `lastCitationResult.type === 'pending'`, the copy handler should **allow default copy** (no `preventDefault`, no `setData`) and **not show a toast**. Silent mode must never block a copy operation. The user gets plain text — acceptable UX for this edge case.

**Warning signs:** Ctrl+C sometimes produces empty clipboard or stale citation text from a previous selection.

### Pitfall 2: `lastCitationResult` Fingerprint Mismatch

**What goes wrong:** User selects text A, starts pre-computation; before CITATION_RESULT returns, user selects text B and pre-computes again. When copy fires for B, `lastCitationResult` might contain the result for A (if the A result arrived after the B result pre-computed, or if B lookup is still pending).

**Why it happens:** Two async lookups in flight simultaneously. The CITATION_RESULT message doesn't carry which selection it answers.

**How to avoid:** Store a selection "fingerprint" alongside `lastCitationResult` (e.g., first 40 chars + total length of the selected text). In the copy handler, compare current `window.getSelection().toString()` fingerprint to `lastCitationResult.fingerprint` before trusting the result. If mismatch: treat as pending/plain. STATE.md flags this as a pattern needing validation.

**Warning signs:** Citation from a previous selection appears when copying different text.

### Pitfall 3: Copy Event Fires Twice (Event Propagation)

**What goes wrong:** Document-level and element-level copy listeners both fire, leading to double toast or double `setData` calls.

**Why it happens:** `copy` bubbles up the DOM. If any other listener calls `stopPropagation()` or if the extension adds multiple listeners.

**How to avoid:** Register only one copy listener (at `document` level). Guard with `if (cachedSettings.triggerMode !== 'silent') return;` as first line. Do not add element-scoped listeners.

**Warning signs:** Two toasts appear simultaneously; clipboard content doubled.

### Pitfall 4: Toast Rendering Conflicts with `citationInProgress` Flag

**What goes wrong:** In silent mode, `citationInProgress` may interfere with `handleSelection()` routing if not handled carefully. In existing code, `citationInProgress = true` blocks re-entry into `generateCitation()`. In silent mode, the copy handler fires independently of `citationInProgress`.

**Why it happens:** Silent mode bypasses the popup/button flow; the `citationInProgress` flag was designed for the async popup flow (loading indicator → popup).

**How to avoid:** Silent mode pre-computation (`preSilentCitation`) should NOT set `citationInProgress = true` (or if it does, must clear it regardless of outcome). The copy event handler is independent of this flag. Keep the two flows separate.

**Warning signs:** Silent mode stops working after the first citation because `citationInProgress` is stuck `true`.

### Pitfall 5: `dismissCitationUI()` Collides with Toast

**What goes wrong:** A mousedown elsewhere on the page triggers the auto-dismiss handler set by existing `showCitationPopup()`, prematurely dismissing the silent toast.

**Why it happens:** `showCitationPopup()` sets a `mousedown` listener that calls `dismissCitationUI()`. Silent mode toasts auto-dismiss via `setTimeout` and do not add a `mousedown` listener. If a popup was previously shown, its dismiss listener might still be active.

**How to avoid:** Silent mode toasts should use only `setTimeout`-based dismiss (no mousedown listener). Ensure `dismissCitationUI()` is called before showing a new toast (which `getCitationHost()` already does by clearing the shadow). Do not carry mousedown listener state between toast renders.

**Warning signs:** Toasts disappear immediately on any click.

### Pitfall 6: Multi-Line Selection Clipboard Formatting

**What goes wrong:** `selectedText + ' ' + citation` concatenates with a trailing newline or unexpected whitespace when the selection spans multiple lines.

**Why it happens:** `window.getSelection().toString()` preserves line breaks as `\n`. The citation ends up on a new line or with extra spacing.

**How to avoid:** In the copy handler, do not strip or normalize `selectedText` before appending — preserve the user's selection exactly. The space separator goes between the last character of `selectedText` and the citation. `text/plain` clipboard format preserves `\n` correctly. Test with selections spanning paragraphs.

**Warning signs:** Citation appears on its own line instead of appended to the last line of selected text.

---

## Code Examples

Verified patterns from official sources:

### Copy Event Interception (W3C Spec Pattern)

```javascript
// Source: MDN Element: copy event (https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event)
// Source: W3C Clipboard API (https://www.w3.org/TR/clipboard-apis/ section 4.3)

document.addEventListener('copy', (event) => {
  const selection = document.getSelection();
  // setData + preventDefault = custom clipboard content
  event.clipboardData.setData('text/plain', selection.toString().toUpperCase());
  event.preventDefault();
});
```

### Silent Mode: Full Clipboard Append Pattern

```javascript
// Pattern: pre-compute on mouseup (async), consume in copy handler (sync)
// Source: W3C Clipboard API spec — setData must be called synchronously in copy handler

// 1. On mouseup (when triggerMode === 'silent'):
async function preSilentCitation(selectedText, rect) {
  lastCitationResult = null;
  // ... async lookup (grant: service worker, application: DOM) ...
  lastCitationResult = { type: 'success', citation: '4:12-15', rect };
}

// 2. In copy handler:
document.addEventListener('copy', (event) => {
  if (cachedSettings.triggerMode !== 'silent') return;
  const result = lastCitationResult;
  if (!result || result.type !== 'success') return; // passthrough

  const selected = window.getSelection()?.toString() ?? '';
  if (!selected) return;

  event.clipboardData.setData('text/plain', selected + ' ' + result.citation);
  event.preventDefault();  // REQUIRED
  showSuccessToast(result.citation, result.rect);
  lastCitationResult = null; // consume
});
```

### Popup.html: Adding Silent Option

```html
<!-- Source: existing popup.html structure, line 53 -->
<select id="triggerMode" class="setting-select">
  <option value="floating-button">Floating button</option>
  <option value="auto">Auto on selection</option>
  <option value="context-menu">Right-click menu</option>
  <option value="silent">Silent (Ctrl+C)</option>  <!-- ADD THIS -->
</select>
```

### Offscreen Document Reasons Update (Service Worker)

```javascript
// Source: chrome.offscreen API reference (https://developer.chrome.com/docs/extensions/reference/api/offscreen)
// Multiple reasons are supported per the API type definition: reasons: [Reason][]
// STATE.md notes this should be updated for clarity, though CLIPBOARD applies to
// clipboard operations FROM the offscreen document (not needed for content-script copy event)

creatingOffscreen = chrome.offscreen.createDocument({
  url: 'offscreen/offscreen.html',
  reasons: ['BLOBS'],  // CLIPBOARD reason only needed if offscreen doc writes clipboard
  justification: 'Fetch and store patent PDF for citation processing',
});
// Note: Silent mode clipboard write happens via copy event in content script, NOT offscreen.
// The CLIPBOARD reason is NOT required for Phase 5. reasons: ['BLOBS'] is correct.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `document.execCommand('copy')` | `clipboardData.setData()` in copy handler | Chrome 41+ | execCommand deprecated in Chrome 117 for programmatic use; still works but discouraged |
| `document.execCommand('copy')` for async writes | `navigator.clipboard.writeText()` for async writes | Chrome 66+ | writeText is the modern async API for programmatic clipboard writes (not applicable inside copy handlers) |
| Single offscreen reason | Multiple offscreen reasons array | Chrome 116+ (offscreen API) | `reasons` is typed as array; multiple reasons are declaratively supported per API spec |

**Deprecated/outdated:**
- `document.execCommand('copy')`: Works but deprecated. The project already avoids this (citation-ui.js uses `navigator.clipboard.writeText()` with textarea fallback). Silent mode should use `clipboardData.setData()` — not execCommand.

---

## Open Questions

1. **`lastCitationResult` fingerprint matching strategy**
   - What we know: STATE.md flags "first 40 chars + length" as the intended fingerprint. This is documented as needing validation.
   - What's unclear: Whether this fingerprint is robust enough to avoid false matches when the user selects overlapping subsets of the same patent text.
   - Recommendation: Implement fingerprint validation in Phase 5 plan as a verification step. Test with rapid successive selections. If fingerprint matches but result feels stale, adding a timestamp check (e.g., result older than 3 seconds) would be a safe fallback.

2. **Pending result UX when grant citation lookup is slow**
   - What we know: Async lookup (grant patent, first visit) may take 50-300ms. If user presses Ctrl+C during this window, they get plain text with no indication.
   - What's unclear: Whether a "thinking..." indication makes sense in silent mode (contradicts "silent").
   - Recommendation: No toast for pending state. Let the first Ctrl+C be plain text; by the next selection the result will be ready. This is consistent with the "no interference on non-patent or unready state" decision.

3. **`citationInProgress` flag interaction with silent pre-computation**
   - What we know: Current code uses `citationInProgress` to block re-entry. Silent mode pre-computation doesn't show a loading UI and doesn't need the flag.
   - What's unclear: Whether `preSilentCitation()` should set `citationInProgress` at all (it shouldn't), or whether the existing mouseup handler guard (`if (citationInProgress) return;`) would accidentally block silent mode.
   - Recommendation: In the mouseup handler, the `citationInProgress` guard should be bypassed for silent mode, OR `preSilentCitation` should be structured to not conflict with this flag. Plan should explicitly address this guard.

---

## Sources

### Primary (HIGH confidence)
- [MDN: Interact with the clipboard (WebExtensions)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard) — `clipboardWrite` permission behavior, `navigator.clipboard.writeText()` in content scripts, transient activation rules
- [MDN: Element: copy event](https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event) — copy event pattern, `clipboardData.setData()`, `preventDefault()` requirement, code examples
- [W3C Clipboard API and Events Specification](https://www.w3.org/TR/clipboard-apis/) — authoritative: `preventDefault()` mandatory for `setData()` to take effect; async APIs not applicable inside copy handlers
- [Chrome offscreen API reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — `reasons` is typed as array, multiple reasons supported; `CLIPBOARD` reason defined

### Secondary (MEDIUM confidence)
- [Chrome Developers Blog: Offscreen Documents in MV3](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) — CLIPBOARD reason used for offscreen-initiated clipboard writes; confirms pattern with single reason in example
- [MDN: ClipboardEvent.clipboardData](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData) — DataTransfer object interface for copy event manipulation

### Tertiary (LOW confidence — flagged for validation)
- WebSearch community discussions re: "only single reason supported" for offscreen documents — **contradicted by official API spec**; the spec types reasons as an array and the reference doc lists 16 valid reasons. Ignore this claim.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — copy event interception is a well-specified web platform API; verified against W3C spec and MDN
- Architecture: HIGH — pre-compute on mouseup + synchronous read in copy handler is the only viable pattern given the sync constraint; confirmed by spec
- Pitfalls: HIGH — race condition, fingerprint mismatch, and `preventDefault` requirement all verified against spec and existing codebase structure; flag interaction is HIGH because it's visible in the source code

**Research date:** 2026-03-02
**Valid until:** 2026-09-01 (Chrome extension APIs and Clipboard Events spec are stable; unlikely to change)

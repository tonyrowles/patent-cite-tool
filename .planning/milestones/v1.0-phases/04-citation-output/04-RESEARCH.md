# Phase 4: Citation Output - Research

**Researched:** 2026-03-01
**Domain:** Chrome Extension MV3 - Clipboard API, Shadow DOM UI, chrome.storage.sync
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Copy trigger & flow:**
- Citation appears in a small floating panel near the highlighted text (not auto-copied)
- User clicks a copy button inside the panel to copy to clipboard
- Panel dismisses when user clicks outside it
- New text selection replaces the current panel with a new citation seamlessly

**Citation format:**
- Default format is compact shorthand: `4:5-20` for granted patents, `[0045]` for published applications
- Cross-column spans use the format `4:55-5:10`
- Optional setting to prefix with short patent number (last 3 digits): `'456 Pat., 4:5-20`
- Format toggle (include patent number or not) lives in the extension popup settings page
- No formal/verbose format (e.g., "col. 4, ll. 5-20") — compact only

**Toast / copy confirmation:**
- No separate toast notification — the floating panel itself updates inline
- Copy button changes to checkmark + "Copied!" text after successful copy
- Panel styling is minimal and subtle — muted colors, blends with the page, doesn't draw attention from patent text
- Citation text in the panel is read-only (not selectable/editable)

**Error & edge cases:**
- If no match is found for highlighted text, panel shows a clear "no match" message
- Low-confidence match warning: Claude's discretion on how to surface it in the panel
- Clipboard API failure fallback: Claude's discretion on graceful degradation
- PDF not yet parsed when user highlights: Claude's discretion on first-use experience

### Claude's Discretion
- Floating panel positioning relative to selection (above vs below, space-aware)
- Post-copy panel behavior (auto-dismiss after brief delay vs stay until click outside)
- Low-confidence visual indicator style
- Clipboard API fallback approach
- First-use experience when PDF hasn't been parsed yet
- Exact panel dimensions, colors, typography

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUT-01 | Citation is copied to clipboard with a single click | Clipboard API via `navigator.clipboard.writeText()` in content script with `clipboardWrite` permission in manifest |
| OUT-02 | A toast notification confirms the citation was copied | Inline panel state change (button → checkmark + "Copied!") instead of toast; panel already exists in `citation-ui.js` |
| MATCH-02 | Extension displays a confidence indicator when match quality is uncertain | Confidence dot already exists in `citation-ui.js`; needs surfacing of low-confidence state as user-visible indicator |
</phase_requirements>

---

## Summary

Phase 4 is primarily a **completion and polish phase**, not a new-feature phase. The core UI infrastructure — Shadow DOM floating panel, copy button, clipboard call, inline "Copied!" feedback, and confidence dot — already exists in `src/content/citation-ui.js` from Phase 3 scaffolding. The panel is already positioned near the selection, dismisses on outside click, and the copy button already calls `navigator.clipboard.writeText()`.

Three concrete gaps remain. First, `clipboardWrite` permission is missing from `manifest.json` — without it, `navigator.clipboard.writeText()` requires a transient activation gesture and may fail silently in certain contexts. Adding it makes the permission explicit and removes the gesture requirement. Second, the citation format user decision introduced a new **patent number prefix setting** (`'456 Pat., 4:5-20`) that does not exist anywhere in the codebase — it needs a new `chrome.storage.sync` setting key, a popup toggle, and format logic in `formatCitation()`. Third, `showCitationPopup()` currently receives `matchedText` only in advanced display mode; the low-confidence indicator (colored dot) already exists but the `MATCH-02` requirement needs verification that it surfaces correctly in the default (non-advanced) display mode.

**Primary recommendation:** One focused plan covering (1) `clipboardWrite` permission, (2) patent number prefix setting + format logic, (3) first-use experience polish, and (4) end-to-end manual verification across the full workflow.

---

## Standard Stack

### Core (already in project — no new dependencies)

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| `navigator.clipboard.writeText()` | Web API (built-in) | Write citation text to clipboard | Async Clipboard API; works in content scripts on HTTPS pages |
| `chrome.storage.sync` | MV3 built-in | Persist user settings across devices | Extension-native; already used for `triggerMode` and `displayMode` settings |
| Shadow DOM | Web API (built-in) | CSS-isolated UI panel | Already established in `citation-ui.js`; prevents Google Patents Polymer conflicts |

### Supporting (no new installs needed)

| Library/API | Purpose | When to Use |
|-------------|---------|-------------|
| `chrome.permissions` API | Optional clipboard permission check | Not needed; `clipboardWrite` in manifest is sufficient |
| `document.execCommand('copy')` | Fallback for clipboard failure | Deprecated; use only as last resort in catch block |

**Installation:** No new packages required. All APIs are browser-native or MV3 built-in.

---

## Architecture Patterns

### Recommended File Structure (changes only)

```
src/
├── manifest.json            # Add "clipboardWrite" to permissions array
├── content/
│   └── citation-ui.js       # Update showCitationPopup: button state, read-only text, first-use
├── popup/
│   ├── popup.html           # Add "Include patent number" toggle control
│   └── popup.js             # Read/write new includePatentNumber setting
└── shared/
    └── constants.js         # No change needed; settings keys documented here
```

### Pattern 1: clipboardWrite Permission (manifest)

**What:** Declare `clipboardWrite` in `manifest.json` permissions array.

**Why critical:** Without this permission, `navigator.clipboard.writeText()` in a content script requires transient user activation on every call. The copy button is a user gesture so it may work without it, but the permission is the correct way to declare clipboard intent to Chrome, is required per best-practice MV3 guidance, and avoids edge-case failures when the gesture is consumed by other event handlers.

**Source:** MDN Web Extensions Docs - "Interact with the clipboard" (MEDIUM confidence — MDN + Chrome docs corroborate; tested pattern)

```json
// src/manifest.json — permissions array
{
  "permissions": [
    "declarativeContent",
    "offscreen",
    "activeTab",
    "storage",
    "contextMenus",
    "clipboardWrite"
  ]
}
```

**User-visible impact:** Chrome will show "Modify data you copy and paste" in the install permissions dialog. This is expected and appropriate.

### Pattern 2: Patent Number Prefix Setting

**What:** New `chrome.storage.sync` key `includePatentNumber` (boolean, default `false`). Toggle in popup settings. Format logic in `formatCitation()` and `formatAppCitation()`.

**Format spec from CONTEXT.md:**
- Granted patent with prefix: `'456 Pat., 4:5-20` (last 3 digits of patent number, tick mark, "Pat.,")
- Application with prefix: `'456 App., [0045]`
- Without prefix (default): `4:5-20` / `[0045]` (existing behavior — no change)

**Where to extract last 3 digits:** `patentId` is available in `content-script.js` via `extractPatentInfo()`. It's in the form `US11427642B2`. The last 3 digits before the kind code: extract the numeric portion, take last 3 digits.

```javascript
// Example: "US11427642B2" → last 3 digits of numeric run → "642"
function getShortPatentNumber(patentId) {
  const numericMatch = patentId.match(/US(\d+)/);
  if (!numericMatch) return null;
  const digits = numericMatch[1];
  return digits.slice(-3); // "642"
}
```

**Citation format integration:** `formatCitation()` in `text-matcher.js` and the mirror in `offscreen.js` currently take only `startEntry` and `endEntry`. To add the patent number prefix, the function needs a third optional parameter OR the content-script caller can prepend the prefix after receiving the citation string. The simpler approach (recommended): prepend in the content script, after receiving the citation result, before calling `showCitationPopup()`. This avoids touching the offscreen/text-matcher matching logic.

```javascript
// In content-script.js: handleCitationResult()
function applyPatentPrefix(citation, patentId, settings) {
  if (!settings.includePatentNumber || !patentId) return citation;
  const short = getShortPatentNumber(patentId);
  if (!short) return citation;
  return `'${short} Pat., ${citation}`;
}

// For applications: in generateCitation() after findParagraphCitation()
function applyAppPrefix(citation, patentId, settings) {
  if (!settings.includePatentNumber || !patentId) return citation;
  const short = getShortPatentNumber(patentId);
  if (!short) return citation;
  return `'${short} App., ${citation}`;
}
```

**Settings storage pattern (consistent with existing code):**

```javascript
// popup.js: load and save
chrome.storage.sync.get({
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,  // new key
}, (settings) => {
  patentNumCheckbox.checked = settings.includePatentNumber;
});

patentNumCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked });
});

// content-script.js: cache and react to changes
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,  // new key
};
// Storage listener already in place — just add includePatentNumber to the changed handler
```

### Pattern 3: Copy Button State (already partially implemented)

**What:** Copy button transitions: "Copy" → checkmark + "Copied!" on success, "Failed" on clipboard error.

**Current state:** Already implemented in `citation-ui.js` lines 153-163. The button shows "Copied!" for 1500ms then resets.

**Decision from CONTEXT.md:** Button should change to checkmark + "Copied!" — current implementation shows "Copied!" only (no checkmark). Minor update needed: prepend a checkmark character `✓` to "Copied!".

**Recommended approach:**
```javascript
copyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  navigator.clipboard.writeText(citation).then(() => {
    copyBtn.textContent = '✓ Copied!';
    copyBtn.style.color = '#059669'; // green confirmation
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.style.color = '';
    }, 1500);
  }).catch(() => {
    // Fallback: execCommand (deprecated but works in content scripts)
    try {
      const el = document.createElement('textarea');
      el.value = citation;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch (_) {
      copyBtn.textContent = 'Failed';
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = ''; }, 1500);
    }
  });
});
```

**Important:** The fallback `execCommand` approach works in content scripts but NOT in service workers or offscreen documents. Since the copy button is in the content script Shadow DOM, this is valid.

### Pattern 4: Read-Only Citation Text

**Decision from CONTEXT.md:** Citation text in the panel is read-only (not selectable/editable).

**Current state:** The citation text is in a `<span>` with class `cite-text`. It is inherently non-editable but IS selectable by default.

**Implementation:** Add `user-select: none` to `.cite-text` CSS rule in `getCitationPopupCSS()`:

```css
.cite-text {
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #111;
  flex: 1;
  word-break: break-word;
  user-select: none;       /* add this */
  -webkit-user-select: none; /* add this for older Chrome */
  pointer-events: none;    /* add this to prevent text cursor */
}
```

### Pattern 5: First-Use Experience (Claude's Discretion)

**Scenario:** User highlights text on a granted patent but PDF has not yet been parsed (status is `fetching` or `parsing`).

**Current state:** `content-script.js` lines 291-298 already check patent status and shows an error popup ("PDF is still being analyzed, please wait..." / "PDF analysis failed" / "PDF not available"). This uses `showErrorPopup()` which auto-dismisses after 4 seconds.

**Recommendation:** Keep the existing error popup for the `error` and `unavailable` states. For `fetching`/`parsing` states, upgrade to a more informative state: show the error popup with a slightly different message that implies the user should wait and try again ("Analyzing patent PDF, try again in a moment"). The message is already appropriate — no structural change needed, just review the copy.

**Alternative considered:** Show a loading indicator that auto-resolves when parsing completes (via storage listener). Rejected as over-engineered for v1 — the status states are transient (parsing takes ~2-5 seconds) and the user can simply re-highlight.

### Pattern 6: Low-Confidence Warning (MATCH-02)

**Current state:** `showCitationPopup()` already renders a colored dot indicator (`cite-confidence cite-conf-medium` or `cite-conf-low`) when `confidence < 0.95`. The dot appears in the default display mode. MATCH-02 is satisfied by the existing implementation.

**Verification needed:** Confirm that the confidence value from the offscreen `CITATION_RESULT` message is being passed through to `showCitationPopup()`. Check `handleCitationResult()` in content-script.js line 342 — it passes `message.confidence`. This chain is complete.

**No code change needed for MATCH-02** unless testing reveals the confidence dot is not appearing. The existing implementation covers the requirement.

### Anti-Patterns to Avoid

- **Auto-copy on selection:** User decision locked this out. Do not implement.
- **Separate toast element:** User decision says inline panel update only. Do not create a separate positioned element for copy confirmation.
- **Making citation text editable/selectable:** Read-only is a locked decision.
- **Full patent number prefix:** Only last 3 digits (`'456`). Do not use full number.
- **Formal verbose format:** "col. 4, ll. 5-20" is explicitly excluded. Compact only.
- **Touching offscreen.js / text-matcher.js for format changes:** Keep format prefix logic in content-script.js to avoid duplication complexity.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard write | Custom textarea/execCommand hack as primary | `navigator.clipboard.writeText()` as primary | Async Clipboard API is the standard; available in content scripts on HTTPS |
| Settings persistence | sessionStorage, IndexedDB, or custom sync | `chrome.storage.sync` | Already established pattern in project; syncs across devices |
| CSS isolation | Inline styles on every element | Shadow DOM (already in place) | Already built; prevents Google Patents Polymer conflicts |

**Key insight:** The hard work is already done. Phase 4 is primarily wiring together existing components and adding one new setting key.

---

## Common Pitfalls

### Pitfall 1: Missing clipboardWrite Permission
**What goes wrong:** `navigator.clipboard.writeText()` may fail silently or with a `NotAllowedError` in some contexts if `clipboardWrite` is not declared.
**Why it happens:** MV3 content scripts on Google Patents (HTTPS) typically have the user gesture from the button click, so it often works without the permission — but not reliably across all Chrome versions.
**How to avoid:** Add `"clipboardWrite"` to manifest.json permissions before testing.
**Warning signs:** Copy button shows "Failed" intermittently; works sometimes but not others.

### Pitfall 2: Settings Key Mismatch
**What goes wrong:** `content-script.js` caches settings on init with `DEFAULT_SETTINGS`; if the new `includePatentNumber` key is not in `DEFAULT_SETTINGS`, the setting won't be loaded or reacted to.
**Why it happens:** The storage listener only handles keys that were in the original `changes` object; if the key was never in `DEFAULT_SETTINGS`, `chrome.storage.sync.get(DEFAULT_SETTINGS, ...)` never fetches it.
**How to avoid:** Add `includePatentNumber: false` to `DEFAULT_SETTINGS` in `content-script.js` AND to the `chrome.storage.sync.get` call in `popup.js`.
**Warning signs:** Setting toggle in popup has no effect on citation output.

### Pitfall 3: Storage Listener Missing New Key
**What goes wrong:** `chrome.storage.onChanged` listener in `content-script.js` currently handles `triggerMode` and `displayMode`. If `includePatentNumber` is not added to the listener, live setting changes from the popup won't propagate to the content script during the same page session.
**Why it happens:** The listener checks for specific keys by name.
**How to avoid:** Add `if (changes.includePatentNumber) cachedSettings.includePatentNumber = changes.includePatentNumber.newValue;` to the onChanged handler.

### Pitfall 4: Patent ID Unavailable When Formatting Prefix
**What goes wrong:** The prefix requires extracting `patentId` from the URL. If called from `handleCitationResult()`, `patentId` must be re-extracted because the message doesn't include it.
**Why it happens:** `CITATION_RESULT` messages from offscreen only contain `citation`, `confidence`, `success`, `error`, `startEntry`, `endEntry`. They don't carry `patentId`.
**How to avoid:** Call `extractPatentInfo()` again in `handleCitationResult()` (it reads from `window.location.pathname` — always available) or cache it at module level.

### Pitfall 5: Popup Settings Page Load Ordering
**What goes wrong:** If `popup.html` tries to query a DOM element before `DOMContentLoaded`, the element may not exist.
**Why it happens:** Standard DOM timing issue.
**How to avoid:** Already handled — `popup.js` uses `DOMContentLoaded` listener. Just follow the same pattern for the new checkbox element.

### Pitfall 6: execCommand Fallback in Shadow DOM
**What goes wrong:** The `document.execCommand('copy')` fallback creates a `textarea` and appends to `document.body`. This works because the fallback element is in the main document, not the Shadow DOM. However, it briefly adds an element to the page.
**Why it happens:** `execCommand` requires a focused, selected element in the main document context.
**How to avoid:** The approach described (append to `document.body`, select, execute, remove) is correct. Wrap in try/catch. Keep the element hidden (`el.style.position = 'fixed'; el.style.opacity = '0'; el.style.pointerEvents = 'none';`).

---

## Code Examples

### clipboardWrite Permission Addition
```json
// Source: Chrome Extensions Reference - Permissions List
// https://developer.chrome.com/docs/extensions/reference/permissions-list
{
  "permissions": [
    "declarativeContent",
    "offscreen",
    "activeTab",
    "storage",
    "contextMenus",
    "clipboardWrite"
  ]
}
```

### Patent Number Extraction
```javascript
// Extract last 3 digits from patent ID (e.g., "US11427642B2" → "642")
// Source: derived from existing extractPatentInfo() in content-script.js
function getShortPatentNumber(patentId) {
  if (!patentId) return null;
  const numericMatch = patentId.match(/US(\d+)/);
  if (!numericMatch) return null;
  const digits = numericMatch[1];
  return digits.slice(-3);
}
```

### includePatentNumber Setting (popup.js addition)
```javascript
// Add to existing chrome.storage.sync.get in popup.js
chrome.storage.sync.get({
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,   // new
}, (settings) => {
  triggerSelect.value = settings.triggerMode;
  displaySelect.value = settings.displayMode;
  patentNumCheckbox.checked = settings.includePatentNumber;   // new
});

patentNumCheckbox.addEventListener('change', () => {
  chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked });
});
```

### Copy Button with Checkmark Feedback
```javascript
// Update to existing copyBtn listener in citation-ui.js
copyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  navigator.clipboard.writeText(citation).then(() => {
    copyBtn.textContent = '✓ Copied!';
    copyBtn.style.color = '#059669';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.style.color = '';
    }, 1500);
  }).catch(() => {
    // execCommand fallback
    try {
      const el = document.createElement('textarea');
      el.value = citation;
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      copyBtn.textContent = '✓ Copied!';
      copyBtn.style.color = '#059669';
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = ''; }, 1500);
    } catch (_) {
      copyBtn.textContent = 'Failed';
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = ''; }, 1500);
    }
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | Chrome 66+ | Async, permission-based; no DOM hack needed |
| Separate toast element | Inline panel state update | Design decision | Simpler, less intrusive |
| `localStorage` for settings | `chrome.storage.sync` | MV3 best practice | Syncs across devices, survives extension reload |

**Deprecated/outdated:**
- `document.execCommand('copy')`: Deprecated web platform API; still works as fallback in content scripts but not preferred. Only use in `.catch()` handler.
- `chrome.clipboard` API: Platform Apps only (not MV3 extensions). Irrelevant here.

---

## What Phase 4 Actually Is: An Inventory

Based on code review, here is the **exact gap analysis** between existing code and phase requirements:

### Already Done (from Phase 3 scaffolding)
- Shadow DOM floating panel: `citation-ui.js` — `showCitationPopup()`, `showFloatingButton()`, `showErrorPopup()`, `showLoadingIndicator()`, `dismissCitationUI()`
- Copy button with `navigator.clipboard.writeText()`: lines 153-163 in `citation-ui.js`
- "Copied!" inline feedback (button text change): lines 156-159 in `citation-ui.js`
- Panel positioning near selection (above/below, clamped to viewport): lines 166-179 in `citation-ui.js`
- Click-outside dismiss: lines 186-193 in `citation-ui.js`
- Low-confidence dot indicator (MATCH-02): lines 130-134 in `citation-ui.js`
- First-use experience for `fetching`/`parsing`/`error`/`unavailable`: lines 291-298 in `content-script.js`
- Settings load + live update listener: lines 150-161 in `content-script.js`

### Not Yet Done (Phase 4 work)
1. **`clipboardWrite` in manifest** — missing, must add
2. **`includePatentNumber` setting** — does not exist anywhere; needs popup toggle, storage key, format logic
3. **`'456 Pat.` format** — `formatCitation()` doesn't support prefix; format prefix logic needed in content-script.js
4. **Application prefix format** — `formatAppCitation()` doesn't support prefix; same pattern needed
5. **Checkmark in copy button** — current shows "Copied!" not "✓ Copied!"
6. **`user-select: none` on citation text** — not in CSS currently
7. **`execCommand` fallback in catch** — current catch just shows "Failed"; no fallback attempt
8. **End-to-end workflow verification** — full test: highlight → Cite button → panel → copy → ✓ Copied!

---

## Open Questions

1. **Does `clipboardWrite` trigger a new install permission prompt for existing users?**
   - What we know: New permission additions to an installed extension require user re-approval in Chrome before the extension can be updated.
   - What's unclear: Whether `clipboardWrite` causes Chrome to disable the extension pending re-approval, or whether it's silently granted.
   - Recommendation: Check Chrome's "optional_permissions" pattern if the team worries about update friction. For v1 (no existing users), this is not a concern — add it to `permissions` directly.

2. **Should the patent number setting use a checkbox or a toggle?**
   - What we know: The popup currently uses `<select>` dropdowns for other settings.
   - What's unclear: User preference for UI consistency vs. toggle ergonomics.
   - Recommendation (Claude's discretion): Use a checkbox (`<input type="checkbox">`) for simplicity — it's a binary on/off, distinct from the multi-option dropdowns.

3. **Should "no match" and "PDF not parsed" show with a click-outside-dismiss or auto-dismiss?**
   - What we know: `showErrorPopup()` auto-dismisses after 4 seconds. `showCitationPopup()` click-outside dismisses.
   - What's unclear: Which is better for the "no match" error state specifically.
   - Recommendation (Claude's discretion): Keep auto-dismiss (4 seconds) for error states — they are transient and don't require user action. Keep click-outside-dismiss for the citation popup — it contains actionable content.

---

## Sources

### Primary (HIGH confidence)
- Code review of `src/content/citation-ui.js` — complete inventory of existing UI implementation
- Code review of `src/content/content-script.js` — settings handling, citation flow, error states
- Code review of `src/manifest.json` — confirmed `clipboardWrite` absent from permissions
- Code review of `src/popup/popup.js` and `popup.html` — confirmed no `includePatentNumber` setting exists
- MDN Web Extensions - "Interact with the clipboard" (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard) — clipboard permission requirements

### Secondary (MEDIUM confidence)
- Chrome Extensions Reference - Permissions List (https://developer.chrome.com/docs/extensions/reference/permissions-list) — `clipboardWrite` permission description and user-visible warning

### Tertiary (LOW confidence)
- Web search results on `clipboardWrite` + MV3 content scripts — corroborates that the permission removes the transient-activation requirement; not independently verified against a live extension test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all APIs are already in use or well-documented browser/MV3 APIs
- Architecture: HIGH — gap analysis is based on direct code inspection; all gaps are confirmed by absence in source files
- Pitfalls: MEDIUM — clipboard behavior is verified by MDN and Chrome docs; `execCommand` fallback behavior in Shadow DOM content scripts is inferred from platform docs, not live-tested

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable domain — Chrome MV3 Clipboard API and `chrome.storage.sync` are not fast-moving)

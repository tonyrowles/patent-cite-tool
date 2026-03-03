# Phase 11: Options Page Polish - Research

**Researched:** 2026-03-03
**Domain:** Chrome Extension Options Page (MV3), chrome.storage.sync, chrome.runtime APIs
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Save interaction:** Auto-save on change (same behavior as current popup) with inline "Saved" confirmation feedback. No explicit save button — settings persist immediately via chrome.storage.sync. No "Reset to defaults" option.
- **Silent mode helper text:** Brief helper text when Silent (Ctrl+C) mode is selected (e.g., "Select text, then Ctrl+C to copy with citation appended").
- **Popup after migration:** Popup retains patent status display. Settings section removed entirely. Settings link added that opens options page via chrome.runtime.openOptionsPage().
- **Options page layout:** Simple vertical list — all settings in a single column, one after another. Each setting has a brief description line below the control. Title/header at top, settings below, footer at bottom.
- **Version and privacy placement:** Footer at bottom — "v{version} · Privacy Policy". Version pulled dynamically via chrome.runtime.getManifest().version. Privacy policy link as placeholder URL until Phase 12.
- **New files:** src/options/options.html, src/options/options.js
- **Manifest:** needs options_ui entry with page: "options/options.html" and open_in_tab: true

### Claude's Discretion

- Save feedback style (inline text near setting vs toast banner vs other approach)
- Settings link style in popup (text link at bottom vs gear icon vs other)
- Popup width/height after settings removal
- Options page content width and centering
- Header style (name + icon vs text-only vs other)
- Visual styling and color palette (informed by Phase 10's slate/amber/blue icon palette)
- Exact typography, spacing, and visual polish

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OPTS-01 | Options page accessible via right-click extension menu (options_ui manifest entry) | manifest options_ui with open_in_tab: true triggers right-click "Options" menu item automatically |
| OPTS-02 | Settings moved from popup to options page (trigger mode, display mode, patent prefix) | chrome.storage.sync.get() with defaults pattern already established in popup.js — replicate in options.js |
| OPTS-03 | "Saved" confirmation feedback after settings changes | Auto-save on change with inline feedback; no save button needed |
| OPTS-04 | Privacy policy link and extension version displayed in options page | chrome.runtime.getManifest().version for version; placeholder href for privacy policy |
</phase_requirements>

---

## Summary

Phase 11 migrates the three settings from the popup into a dedicated options page (`src/options/options.html` + `src/options/options.js`), adds the page to the manifest under `options_ui`, and simplifies the popup to a status-only display with a link to open options. The technical surface is narrow and well-understood: Chrome's `options_ui` manifest field, `chrome.storage.sync` (already used), and `chrome.runtime.openOptionsPage()`.

The auto-save-on-change pattern is already implemented in `popup.js` — options.js replicates it directly. The only new visual element is an inline "Saved" feedback indicator, which can be implemented as a brief text confirmation appearing near the changed setting. The existing project pattern of inline CSS (no external stylesheets) must be followed.

The project's established color palette from Phase 10 is: vibrant blue `#2563eb` (primary/active icon), warm amber `#d97706` / `#f59e0b` (accent), slate gray `#64748b` (inactive), with dark detail color `#1e3a8a`. Options page visual design should draw from this palette.

**Primary recommendation:** Implement options.html as a full-page document with max-width centering (~480px), auto-save with a small "Saved" checkmark/text that fades in then fades out after ~2 seconds, and a footer div at the bottom with version + privacy policy link.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chrome.storage.sync | MV3 built-in | Persist settings across devices | Cross-device sync; already used in popup.js |
| chrome.runtime.getManifest() | MV3 built-in | Read version string from manifest | Official API for extension metadata |
| chrome.runtime.openOptionsPage() | MV3 built-in | Open options page from popup | Standard MV3 pattern for popup-to-options navigation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Inline CSS | N/A | Styling options page | Project convention — no external stylesheets anywhere |
| System font stack | N/A | Typography | Project convention — already defined in popup.html |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auto-save on change | Explicit Save button | User decided auto-save; simpler UX, no save button needed |
| open_in_tab: true | open_in_tab: false (embedded) | User decided open_in_tab: true for full page in new tab |
| Inline CSS | External stylesheet | Project convention is inline CSS; no build step in this extension |

**Installation:** No packages needed — pure Chrome extension APIs.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── options/
│   ├── options.html      # New — options page UI
│   └── options.js        # New — settings load/save/feedback logic
├── popup/
│   ├── popup.html        # Modified — remove settings section, add link
│   └── popup.js          # Modified — remove settings handlers, add openOptionsPage
└── manifest.json         # Modified — add options_ui entry
```

### Pattern 1: Manifest options_ui Declaration

**What:** Declaring `options_ui` in manifest.json causes Chrome to automatically add an "Options" item to the right-click extension menu.
**When to use:** Always when providing settings; `open_in_tab: true` opens the page in a new tab rather than embedding in chrome://extensions.

```json
// Add to manifest.json
"options_ui": {
  "page": "options/options.html",
  "open_in_tab": true
}
```

**Confidence:** HIGH — verified with official Chrome extension docs.

### Pattern 2: Auto-Save with Inline Feedback

**What:** Listen for `change` events on each setting control; immediately call `chrome.storage.sync.set()`; show brief inline feedback text that disappears after a timeout.
**When to use:** When no explicit save button is desired (user decision).

```javascript
// options.js — auto-save pattern (mirrors existing popup.js)
function saveAndConfirm(key, value, feedbackEl) {
  chrome.storage.sync.set({ [key]: value }, () => {
    feedbackEl.textContent = 'Saved';
    feedbackEl.style.opacity = '1';
    setTimeout(() => { feedbackEl.style.opacity = '0'; }, 1500);
  });
}

triggerSelect.addEventListener('change', () => {
  saveAndConfirm('triggerMode', triggerSelect.value, triggerFeedback);
});
```

**Confidence:** HIGH — chrome.storage.sync.set callback is well-documented; CSS opacity fade is standard DOM manipulation.

### Pattern 3: Settings Load with Defaults (from popup.js)

**What:** `chrome.storage.sync.get()` with a defaults object populates all values at once; the defaults object defines which keys to retrieve and their fallback values.
**When to use:** On DOMContentLoaded in options.js — same pattern as popup.js.

```javascript
// Exact pattern from popup.js — replicate in options.js
chrome.storage.sync.get({
  triggerMode: 'floating-button',
  displayMode: 'default',
  includePatentNumber: false,
}, (settings) => {
  triggerSelect.value = settings.triggerMode;
  displaySelect.value = settings.displayMode;
  patentNumCheckbox.checked = settings.includePatentNumber;
});
```

**Confidence:** HIGH — directly copied from existing popup.js which is proven working.

### Pattern 4: Open Options Page from Popup

**What:** `chrome.runtime.openOptionsPage()` is the standard way to open the options page from a popup. It focuses an already-open options tab if one exists rather than opening duplicates.

```javascript
// popup.js — add settings link handler
document.getElementById('settingsLink').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
```

**Confidence:** HIGH — official Chrome API; documented behavior is to focus existing options tab rather than open duplicates.

### Pattern 5: Version from Manifest

**What:** `chrome.runtime.getManifest().version` returns the version string declared in manifest.json.

```javascript
// options.js footer
const { version } = chrome.runtime.getManifest();
document.getElementById('version').textContent = `v${version}`;
```

**Confidence:** HIGH — standard Chrome API, synchronous call.

### Pattern 6: Silent Mode Conditional Helper Text

**What:** When trigger mode changes, show/hide helper text explaining Silent mode workflow based on the selected value.

```javascript
triggerSelect.addEventListener('change', () => {
  saveAndConfirm('triggerMode', triggerSelect.value, triggerFeedback);
  silentHelp.style.display = triggerSelect.value === 'silent' ? 'block' : 'none';
});
```

**Confidence:** HIGH — standard DOM manipulation.

### Anti-Patterns to Avoid

- **External stylesheets:** Project convention is inline CSS in `<style>` blocks. Do not create options.css.
- **Separate save button with form submission:** User decided auto-save; no `<form>` with submit needed.
- **open_in_tab: false (embedded):** User decision is open_in_tab: true. Embedded options have Tabs API restrictions and different UX.
- **chrome.runtime.getURL('options.html'):** Not needed since chrome.runtime.openOptionsPage() is the standard path.
- **chrome.storage.local for settings:** Settings must use chrome.storage.sync (as in popup.js) for cross-device persistence.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Opening options from popup | window.open or tabs.create | chrome.runtime.openOptionsPage() | Handles focus-existing-tab, MV3 service worker context, and declarative behavior correctly |
| Getting version string | Hardcoded string | chrome.runtime.getManifest().version | Single source of truth; updates automatically when manifest version changes |
| Manifest options_ui right-click | Custom context menu entry | options_ui manifest field | Chrome handles "Options" menu item automatically when options_ui is declared |

**Key insight:** Chrome's options_ui system handles the right-click menu entry automatically — no contextMenus API code is needed. Simply declaring options_ui in the manifest is sufficient for OPTS-01.

---

## Common Pitfalls

### Pitfall 1: Missing options_ui in manifest causes no right-click Options item

**What goes wrong:** Adding the options page HTML/JS files without the manifest entry means the right-click menu never shows "Options". OPTS-01 requires the manifest entry, not just the file.
**Why it happens:** Developers build the page first and forget the manifest wiring.
**How to avoid:** Add the `options_ui` field to manifest.json as the first task.
**Warning signs:** Right-clicking the extension icon shows no "Options" item in the context menu.

### Pitfall 2: chrome.storage.local vs chrome.storage.sync confusion

**What goes wrong:** Options page accidentally reads/writes `chrome.storage.local` (which popup.js uses for patent status) instead of `chrome.storage.sync` (which popup.js uses for settings). Settings won't persist across devices and may be cleared.
**Why it happens:** Both storage APIs have identical call signatures; easy to use wrong one.
**How to avoid:** Copy the exact `chrome.storage.sync.get()` call from popup.js with the same defaults object. Never use `storage.local` for user preferences.
**Warning signs:** Settings revert after Chrome restart or on a different device.

### Pitfall 3: Popup height collapses after removing settings section

**What goes wrong:** After removing the settings section from popup.html, the popup height may collapse to just the status div, which can look too small or jarring.
**Why it happens:** Popup height is determined by content; no settings means less content.
**How to avoid:** After settings removal, adjust popup min-height or add appropriate bottom padding. Also update the width (currently 280px) if appropriate now that content is simpler.
**Warning signs:** Popup looks too cramped or too small after settings removal.

### Pitfall 4: Saved feedback element missing from HTML

**What goes wrong:** options.js references feedback elements by ID that don't exist in options.html, causing silent null reference errors and no feedback displayed.
**Why it happens:** HTML and JS written separately without cross-referencing IDs.
**How to avoid:** Define feedback element IDs in options.html first; reference same IDs in options.js. One feedback span per setting group, initially hidden (opacity: 0 or display: none).
**Warning signs:** No "Saved" text appears after changing a setting.

### Pitfall 5: Silent mode helper text not shown on initial load

**What goes wrong:** If the saved triggerMode is 'silent' when the page loads, the helper text should be visible. If visibility is only toggled on `change` events, initial state is wrong.
**Why it happens:** Conditional display logic only in event handler, not in initial load callback.
**How to avoid:** In the `chrome.storage.sync.get()` callback, after setting control values, also set helper text visibility based on the loaded value.
**Warning signs:** User saves 'silent', reloads options page, helper text is invisible even though silent is selected.

---

## Code Examples

Verified patterns from existing codebase and official sources:

### options.html structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* System font stack — project convention */
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      margin: 0;
      padding: 32px 16px;
      background: #f9fafb;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      background: white;
      border-radius: 10px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    /* ... more styles inline ... */
  </style>
</head>
<body>
  <div class="container">
    <header> <!-- Extension name + optional icon --> </header>
    <main>   <!-- Settings groups -->               </main>
    <footer> <!-- v{version} · Privacy Policy -->   </footer>
  </div>
  <script src="options.js"></script>
</body>
</html>
```

### options.js skeleton

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Set version in footer
  const { version } = chrome.runtime.getManifest();
  document.getElementById('version').textContent = `v${version}`;

  // Get controls
  const triggerSelect = document.getElementById('triggerMode');
  const displaySelect = document.getElementById('displayMode');
  const patentNumCheckbox = document.getElementById('includePatentNumber');
  const silentHelp = document.getElementById('silentHelp');

  // Per-setting feedback spans
  const triggerFeedback = document.getElementById('triggerFeedback');
  const displayFeedback = document.getElementById('displayFeedback');
  const patentNumFeedback = document.getElementById('patentNumFeedback');

  function showSaved(el) {
    el.textContent = 'Saved';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  // Load settings with same defaults as popup.js
  chrome.storage.sync.get({
    triggerMode: 'floating-button',
    displayMode: 'default',
    includePatentNumber: false,
  }, (settings) => {
    triggerSelect.value = settings.triggerMode;
    displaySelect.value = settings.displayMode;
    patentNumCheckbox.checked = settings.includePatentNumber;
    // Show silent help if already selected
    silentHelp.style.display = settings.triggerMode === 'silent' ? 'block' : 'none';
  });

  // Auto-save on change
  triggerSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ triggerMode: triggerSelect.value }, () => showSaved(triggerFeedback));
    silentHelp.style.display = triggerSelect.value === 'silent' ? 'block' : 'none';
  });
  displaySelect.addEventListener('change', () => {
    chrome.storage.sync.set({ displayMode: displaySelect.value }, () => showSaved(displayFeedback));
  });
  patentNumCheckbox.addEventListener('change', () => {
    chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked }, () => showSaved(patentNumFeedback));
  });
});
```

### popup.js settings link addition

```javascript
// Add after DOMContentLoaded, near end of popup.js
document.getElementById('settingsLink').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
```

### manifest.json options_ui addition

```json
"options_ui": {
  "page": "options/options.html",
  "open_in_tab": true
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `options_page` (string) in manifest | `options_ui` (object) with `page` + `open_in_tab` | MV2 → MV3 era | options_ui is the current MV3 standard; options_page still works but is legacy |
| `window.open(chrome.runtime.getURL('options.html'))` | `chrome.runtime.openOptionsPage()` | MV2 era | openOptionsPage() focuses existing tab rather than opening duplicate |

**Deprecated/outdated:**
- `options_page` string key: Works but is the older MV2-era approach. Use `options_ui` object instead.

---

## Open Questions

1. **Privacy policy placeholder URL**
   - What we know: Phase 12 will provide the real hosted URL; Phase 11 uses a placeholder.
   - What's unclear: Which placeholder URL to use (empty href, `#`, or a comment in code).
   - Recommendation: Use `href="#"` with `target="_blank"` and add a TODO comment in the HTML noting Phase 12 will replace it. Alternatively, use a real-looking but nonexistent URL like `https://example.com/privacy` so the link is obviously a placeholder. Either is fine — planner can decide.

2. **Popup settings link appearance**
   - What we know: User delegated this to Claude's discretion.
   - What's unclear: Exact visual treatment (gear icon, text link, button).
   - Recommendation: A small text link at the bottom of the popup, styled with the muted `#6b7280` color and underline, reading "Settings". Minimal and unobtrusive — the popup's primary purpose is status display.

---

## Sources

### Primary (HIGH confidence)

- Official Chrome extension docs (developer.chrome.com/docs/extensions/develop/ui/options-page) — options_ui manifest fields, open_in_tab behavior
- Official Chrome API reference (developer.chrome.com/docs/extensions/reference/api/runtime) — openOptionsPage(), getManifest()
- `src/popup/popup.js` (existing codebase) — chrome.storage.sync.get() with defaults pattern, auto-save on change pattern
- `src/manifest.json` (existing codebase) — current manifest structure for options_ui insertion point

### Secondary (MEDIUM confidence)

- Chrome extension options_ui field descriptions verified via WebFetch of official docs

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Chrome extension built-in APIs, no third-party libraries
- Architecture: HIGH — options_ui is well-documented; storage patterns are directly copied from existing working popup.js
- Pitfalls: HIGH — most pitfalls are based on the existing codebase and well-known Chrome extension behavior

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (stable Chrome extension API, low churn)

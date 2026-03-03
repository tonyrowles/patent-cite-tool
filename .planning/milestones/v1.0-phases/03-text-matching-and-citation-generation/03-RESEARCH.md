# Phase 3: Text Matching and Citation Generation - Research

**Researched:** 2026-02-28
**Domain:** Text selection detection, fuzzy string matching, citation formatting, Chrome extension UI injection
**Confidence:** MEDIUM-HIGH

## Summary

This phase connects user interaction (text selection on Google Patents) to the PositionMap built in Phase 2, producing formatted patent citations. There are two distinct paths: (1) granted patents, which require fuzzy matching between Google Patents HTML text and PDF-extracted text in the PositionMap to produce column:line citations, and (2) published applications, which skip PDF entirely and extract paragraph numbers directly from the Google Patents HTML DOM.

The phase introduces three trigger mechanisms (floating button, auto-on-selection, context menu), a settings system using `chrome.storage.sync`, and a citation display popup injected via Shadow DOM for CSS isolation. The fuzzy matching problem is specific: HTML text from Google Patents diverges from PDF OCR text in predictable ways (smart quotes, dashes, ligatures, whitespace normalization), so a custom normalization + sliding window approach is more appropriate than a general-purpose fuzzy search library like Fuse.js.

The content script (`content-script.js`) will be significantly expanded. It currently only extracts patent info and finds the PDF link. Phase 3 adds: selection listeners, floating button UI, popup display, trigger mode switching, and message passing to request citation lookups from the service worker (which has access to the PositionMap via IndexedDB through the offscreen document).

**Primary recommendation:** Use a normalization-then-exact-match approach for text matching: normalize both HTML selection text and PDF PositionMap text (collapse whitespace, replace smart quotes/dashes/ligatures with ASCII equivalents), then search for the normalized selection within a sliding window of concatenated PositionMap lines. Fall back to Levenshtein-based scoring only if exact normalized match fails. Inject UI via Shadow DOM to prevent CSS interference with Google Patents page styles.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Build all 3 trigger mechanisms, configurable via extension settings:
  - **Floating button** (default) -- small button appears near the selection, one click generates citation
  - **Auto on selection** -- citation generates immediately when text is highlighted
  - **Right-click context menu** -- "Get Citation" option in Chrome context menu
- Settings UI needed in extension popup or options page to select active trigger
- **Default mode:** Small popup near the selection showing citation text + copy button (citation only)
- **Advanced mode** (settings toggle): Popup also shows matched text preview and confidence indicator
- **Silent mode** (settings toggle): Ctrl+C automatically appends citation to clipboard alongside copied text -- no popup appears
- Low-confidence indicator: Claude's discretion on UX pattern
- No match found: Clear error message in popup (e.g., "Text not found in patent specification")
- Always attempt match regardless of selection length -- rely on confidence indicator for ambiguous short selections
- Match text in both description AND claims sections (same col:line format for both)
- Single line citation: `4:15`
- Same-column range: `4:15-20`
- Cross-column range: `4:55-5:10`
- Claims and description use identical col:line format (no prefix distinction)
- Published application paragraph format: `[0045]` (with pilcrow prefix in display)
- Published application paragraph range: `[0045]-[0047]` (with pilcrow prefix in display)
- **Detection:** Patent number format as primary signal (US2024/0123456 = application), PDF layout as confirmation/fallback
- **No PDF fetch for applications:** Work entirely from HTML DOM -- paragraph numbers are already structured in the page
- **Paragraph source:** Extract paragraph markers from Google Patents HTML, not from PDF
- Fuzzy matching must handle: smart quotes, dashes, ligatures, whitespace differences
- Matching pipeline only needed for granted patents (applications use HTML-only path)

### Claude's Discretion
- Low-confidence warning UX design (color, wording, placement)
- Fuzzy matching algorithm choice and confidence thresholds
- Floating button visual design and positioning logic
- Settings page layout and organization
- How silent mode appends citation to clipboard content

### Deferred Ideas (OUT OF SCOPE)
- Configurable citation format (col. 4, ll. 5-20 vs column 4, lines 5-20) -- already tracked as UX-01 in v2 requirements
- Keyboard shortcut for citation -- already tracked as UX-02 in v2 requirements
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CITE-01 | User can highlight text in the specification on Google Patents and receive a column:line citation (e.g., 4:5-20) | Text selection via `mouseup` + `window.getSelection()` in content script. Selected text normalized and sent to service worker, which looks up PositionMap entries from IndexedDB (via offscreen document). Start/end lines identified, formatted as `col:startLine-endLine`. |
| CITE-02 | Citation correctly identifies the column number within the two-column patent specification | PositionMap already stores document-wide column numbers (Phase 2). Matching returns the column of the first matched line entry. No additional column detection needed. |
| CITE-03 | Citation correctly identifies the start and end line numbers within the column | Start line = first PositionMap entry containing matched text. End line = last PositionMap entry containing matched text. Both within the same column for same-column ranges. Line numbers come directly from the PositionMap `lineNumber` field. |
| CITE-04 | When highlighted text spans a column boundary, a range citation is produced (e.g., 4:55-5:10) | Matching may return entries spanning multiple columns. Citation formatter checks if start and end entries have different `column` values and produces cross-column format `startCol:startLine-endCol:endLine`. |
| PAPP-01 | User can highlight text in a published application on Google Patents and receive a paragraph citation (e.g., [0045]) | Published application path skips PDF entirely. Content script detects application patent type (already available from `extractPatentInfo()`). Paragraph numbers extracted from Google Patents DOM using selector `'.description .notranslate'` elements, which contain bracketed paragraph markers like `[0045]`. |
| PAPP-02 | When highlighted text spans multiple paragraphs, a range citation is produced (e.g., [0045]-[0047]) | Selection range start/end mapped to nearest paragraph marker elements in the DOM. If different paragraphs, format as `[startPara]-[endPara]`. |
| MATCH-01 | Extension performs fuzzy matching between Google Patents HTML text and PDF OCR text to locate the highlighted passage | Normalization pipeline: collapse whitespace, replace curly quotes with straight, em/en dashes with hyphens, normalize ligatures (fi, fl, ff). After normalization, use sliding window search over concatenated PositionMap lines. Confidence score based on match quality (exact normalized match = HIGH, edit distance needed = computed ratio). |
| MATCH-02 | Extension displays a confidence indicator when match quality is uncertain (low-confidence warning) | Confidence threshold: exact normalized match >= 0.95 similarity = no warning. 0.80-0.95 = yellow warning "Match may be approximate". < 0.80 = red warning "Low confidence match". Display in advanced mode popup; in default mode, show a small colored dot indicator. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Selection API | Web API | Detect user text selection | `window.getSelection()` is the standard DOM API for text selection. Available in content scripts. |
| Chrome contextMenus API | MV3 | Right-click "Get Citation" menu item | Built-in Chrome extension API. `contexts: ["selection"]` shows item only when text is selected. |
| chrome.storage.sync | MV3 | Persist user settings (trigger mode, display mode) | Syncs settings across user's Chrome instances. Built-in, no library needed. |
| Shadow DOM | Web API | CSS-isolated UI injection for floating button and popup | `attachShadow({ mode: 'closed' })` prevents Google Patents CSS from affecting extension UI and vice versa. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none -- no external dependencies) | - | All matching and UI is custom code | The fuzzy matching problem is narrow enough (known divergence patterns between HTML and PDF text) that a general-purpose library adds weight without benefit. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom normalization + sliding window | Fuse.js | Fuse.js is designed for search-in-list fuzzy matching (typo tolerance), not substring location within a document. It wouldn't return position information (which PositionMap line the match is on). Overkill and wrong tool. |
| Custom normalization + sliding window | fuzzball.js (fuzzywuzzy port) | `partial_ratio` could work for similarity scoring, but at 4-15KB bundle size it's unnecessary when our normalization handles the known divergences. Worth considering only if custom matching proves insufficient. |
| Shadow DOM | iframe injection | Stronger isolation but heavier, harder to position near selection, and blocked by some CSP policies. Shadow DOM is lighter and sufficient. |
| chrome.storage.sync | chrome.storage.local | local doesn't sync across devices. For user preferences, sync is better UX. |

**Installation:**
No npm install needed. All functionality uses web platform APIs and Chrome extension APIs. No external dependencies for this phase.

## Architecture Patterns

### Recommended Project Structure
```
src/
  content/
    content-script.js     # Expanded: selection detection, triggers, UI injection
    citation-ui.js        # Shadow DOM popup and floating button components
    text-matcher.js       # Normalization + matching (runs in content script context)
    paragraph-finder.js   # Published application DOM paragraph extraction
  background/
    service-worker.js     # Expanded: context menu registration, citation lookup orchestration
  offscreen/
    offscreen.js          # Expanded: new LOOKUP_POSITION message handler
  shared/
    constants.js          # New message types, settings keys
  popup/
    popup.html            # Expanded: settings controls (trigger mode, display mode)
    popup.js              # Expanded: settings read/write
```

### Pattern 1: Selection Detection with Debounce
**What:** Listen for `mouseup` events on the document, check if text is selected, then trigger citation flow based on active trigger mode.
**When to use:** Always -- this is the entry point for all citation generation.
**Example:**
```javascript
// content-script.js
let selectionTimeout = null;

document.addEventListener('mouseup', (event) => {
  // Debounce rapid selections
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) return;

    // Get selection bounding rect for UI positioning
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    handleSelection(selectedText, rect, event);
  }, 200); // 200ms debounce
});

function handleSelection(text, rect, event) {
  // Read trigger mode from settings
  chrome.storage.sync.get({ triggerMode: 'floating-button' }, (settings) => {
    switch (settings.triggerMode) {
      case 'auto':
        generateCitation(text);
        break;
      case 'floating-button':
        showFloatingButton(rect);
        break;
      case 'context-menu':
        // Context menu is handled by service worker, nothing here
        break;
    }
  });
}
```

### Pattern 2: Shadow DOM UI Injection
**What:** Inject extension UI (floating button, citation popup) into the page using Shadow DOM for CSS isolation.
**When to use:** Any time extension renders visible UI on the Google Patents page.
**Example:**
```javascript
// citation-ui.js
function createShadowHost() {
  const host = document.createElement('div');
  host.id = 'patent-cite-host';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.body.appendChild(host);
  return { host, shadow };
}

function showCitationPopup(citation, rect, confidence) {
  const { host, shadow } = createShadowHost();

  // Position near selection
  host.style.top = `${rect.bottom + 8}px`;
  host.style.left = `${rect.left}px`;

  const style = document.createElement('style');
  style.textContent = `
    .cite-popup { /* isolated styles */ }
    .cite-text { font-family: monospace; font-weight: bold; }
    .copy-btn { cursor: pointer; }
    .confidence-low { color: #dc2626; }
    .confidence-medium { color: #d97706; }
  `;
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'cite-popup';
  popup.innerHTML = `
    <span class="cite-text">${citation}</span>
    <button class="copy-btn" title="Copy">Copy</button>
  `;
  shadow.appendChild(popup);
}
```

### Pattern 3: Text Normalization Pipeline
**What:** Normalize both HTML selection text and PDF PositionMap text to a common form before comparison, handling known divergences.
**When to use:** Before any text comparison between HTML-sourced text and PDF-sourced text.
**Example:**
```javascript
// text-matcher.js
function normalizeText(text) {
  return text
    // Unicode normalization (decompose then recompose)
    .normalize('NFC')
    // Smart/curly quotes to straight quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // double quotes
    // Dashes to hyphen-minus
    .replace(/[\u2013\u2014\u2015]/g, '-')          // en-dash, em-dash, horizontal bar
    // Ligatures to individual characters
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    // Collapse whitespace (spaces, tabs, newlines -> single space)
    .replace(/\s+/g, ' ')
    .trim();
}
```

### Pattern 4: Sliding Window Match Over PositionMap
**What:** Concatenate PositionMap line texts (handling wrap hyphens) and search for the normalized selection text within the concatenated string, then map match position back to PositionMap entries.
**When to use:** For granted patent matching -- the core matching algorithm.
**Example:**
```javascript
// text-matcher.js
function findInPositionMap(normalizedSelection, positionMap) {
  // Build concatenated text with line boundary tracking
  const segments = []; // { startIdx, endIdx, entryIndex }
  let concat = '';

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    const startIdx = concat.length;
    let lineText = normalizeText(entry.text);

    // Handle wrap hyphens: remove trailing hyphen and don't add space before next line
    if (entry.hasWrapHyphen) {
      lineText = lineText.slice(0, -1); // Remove trailing hyphen
      concat += lineText;
    } else {
      if (concat.length > 0) concat += ' ';
      concat += lineText;
    }

    segments.push({ startIdx, endIdx: concat.length, entryIndex: i });
  }

  // Search for selection in concatenated text
  const matchIdx = concat.indexOf(normalizedSelection);
  if (matchIdx === -1) return null;

  const matchEnd = matchIdx + normalizedSelection.length;

  // Map match boundaries back to PositionMap entries
  const startEntry = segments.find(s => s.startIdx <= matchIdx && s.endIdx > matchIdx);
  const endEntry = segments.find(s => s.startIdx < matchEnd && s.endIdx >= matchEnd);

  if (!startEntry || !endEntry) return null;

  return {
    startEntry: positionMap[startEntry.entryIndex],
    endEntry: positionMap[endEntry.entryIndex],
    confidence: 1.0, // Exact normalized match
  };
}
```

### Pattern 5: Citation Formatting
**What:** Format matched PositionMap entries into citation strings per the locked decision format.
**When to use:** After successful match, to produce the final citation.
**Example:**
```javascript
// text-matcher.js
function formatCitation(startEntry, endEntry) {
  const startCol = startEntry.column;
  const startLine = startEntry.lineNumber;
  const endCol = endEntry.column;
  const endLine = endEntry.lineNumber;

  if (startCol === endCol && startLine === endLine) {
    // Single line: "4:15"
    return `${startCol}:${startLine}`;
  } else if (startCol === endCol) {
    // Same column range: "4:15-20"
    return `${startCol}:${startLine}-${endLine}`;
  } else {
    // Cross-column range: "4:55-5:10"
    return `${startCol}:${startLine}-${endCol}:${endLine}`;
  }
}

function formatAppCitation(startPara, endPara) {
  if (startPara === endPara) {
    return `\u00B6 [${startPara}]`;  // Pilcrow: "¶ [0045]"
  }
  return `\u00B6 [${startPara}]-[${endPara}]`;  // "¶ [0045]-[0047]"
}
```

### Pattern 6: Published Application Paragraph Extraction from DOM
**What:** Extract paragraph numbers from Google Patents HTML for published applications, bypassing PDF entirely.
**When to use:** When `patentType === 'application'`.
**Example:**
```javascript
// paragraph-finder.js
function findParagraphForSelection(selection) {
  const range = selection.getRangeAt(0);
  const descriptionEl = document.querySelector('.description.style-scope.patent-text');
  if (!descriptionEl) return null;

  // Find all paragraph number markers in the description
  // Google Patents uses elements with class 'notranslate' containing [XXXX] markers
  const allText = descriptionEl.querySelectorAll('.notranslate');

  // Walk through text nodes to find which paragraph contains the selection
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;

  // Find nearest preceding paragraph number for start and end
  const startPara = findNearestParagraph(startContainer, descriptionEl);
  const endPara = findNearestParagraph(endContainer, descriptionEl);

  return { startPara, endPara };
}

function findNearestParagraph(node, descriptionEl) {
  // Walk backwards through DOM to find nearest [XXXX] pattern
  const walker = document.createTreeWalker(
    descriptionEl, NodeFilter.SHOW_TEXT, null
  );

  let lastParagraphNum = null;
  let current;
  while ((current = walker.nextNode())) {
    const paraMatch = current.textContent.match(/\[(\d{4})\]/);
    if (paraMatch) {
      lastParagraphNum = paraMatch[1];
    }
    if (current === node || current.contains?.(node)) {
      break;
    }
  }
  return lastParagraphNum;
}
```

### Pattern 7: Context Menu Integration
**What:** Register a context menu item in the service worker that appears on text selection.
**When to use:** When context menu trigger mode is enabled.
**Example:**
```javascript
// service-worker.js
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'get-patent-citation',
    title: 'Get Citation',
    contexts: ['selection'],
    documentUrlPatterns: ['https://patents.google.com/patent/US*'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'get-patent-citation') {
    chrome.tabs.sendMessage(tab.id, {
      type: MSG.GENERATE_CITATION,
      selectedText: info.selectionText,
    });
  }
});
```

### Anti-Patterns to Avoid
- **Injecting CSS without Shadow DOM:** Google Patents uses Polymer web components with complex CSS. Injecting extension styles directly into the page WILL cause visual conflicts. Always use Shadow DOM.
- **Fuzzy-first matching:** Do NOT jump to edit-distance matching as the primary strategy. The divergences between HTML and PDF text are systematic (quotes, dashes, ligatures), not random typos. Normalize first, then exact match. Only use fuzzy scoring as a fallback.
- **Storing PositionMap in content script variables:** Content scripts are destroyed and recreated on SPA navigation. Store PositionMap in IndexedDB (already done by Phase 2) and retrieve it via message passing through the service worker.
- **Building paragraph map from PDF for applications:** Published applications have paragraph numbers in the HTML DOM already. Fetching and parsing the PDF for applications is wasteful and slower. Use the HTML-only path.
- **Using `document.execCommand('copy')` for clipboard:** Deprecated. Use `navigator.clipboard.writeText()` instead, which is available in content scripts on HTTPS pages (Google Patents is HTTPS).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context menu on selection | Custom right-click handler | `chrome.contextMenus` API with `contexts: ['selection']` | Native integration looks correct, handles all edge cases (iframes, cross-origin), and `selectionText` is provided automatically |
| CSS isolation for injected UI | `!important` everywhere, or unique class prefixes | Shadow DOM (`attachShadow`) | Complete encapsulation. No amount of `!important` can prevent all CSS conflicts with Polymer-based Google Patents |
| Settings persistence | localStorage in content script | `chrome.storage.sync` | Survives extension updates, syncs across devices, accessible from all extension contexts (content script, service worker, popup) |
| Clipboard write | `document.execCommand('copy')` | `navigator.clipboard.writeText()` | execCommand is deprecated and unreliable. Clipboard API is the modern standard, async, and works in content scripts on secure origins |

**Key insight:** This phase is mostly about plumbing (selection events, message passing, DOM manipulation) and a narrow matching problem (known divergences between two representations of the same text). No external libraries are needed.

## Common Pitfalls

### Pitfall 1: Google Patents SPA Navigation Destroys Content Script State
**What goes wrong:** User navigates to a new patent within Google Patents (SPA navigation). Content script state (event listeners, injected UI elements, cached PositionMap) is stale or lost.
**Why it happens:** Google Patents is a single-page application. The URL changes but the page doesn't fully reload. Content scripts may or may not be re-injected depending on the navigation type.
**How to avoid:** Listen for URL changes via `MutationObserver` on the document title or use `chrome.webNavigation.onHistoryStateUpdated` in the service worker to detect SPA navigation and re-initialize the content script. Clean up injected UI elements before re-initialization.
**Warning signs:** Citation works on first patent visited but fails or shows stale results after navigating to another patent.

### Pitfall 2: Selection Across Shadow DOM Boundaries
**What goes wrong:** `window.getSelection()` may not return text from inside Shadow DOM elements. Google Patents uses Polymer (which uses Shadow DOM internally).
**Why it happens:** Shadow DOM encapsulation can prevent selection from crossing shadow boundaries.
**How to avoid:** In practice, Chrome's selection API works across open Shadow DOM boundaries. Google Patents uses Polymer's `shady-dom` polyfill on most elements, which means selections work normally. Test with real Google Patents pages to verify. If selection fails, fall back to `info.selectionText` from the context menu API (which Chrome resolves correctly even across shadow boundaries).
**Warning signs:** `window.getSelection().toString()` returns empty string even when text visually appears selected.

### Pitfall 3: PositionMap Retrieval Timing
**What goes wrong:** User selects text before the PDF has been fetched and parsed. Citation lookup fails because PositionMap doesn't exist yet.
**Why it happens:** PDF fetch + parse is async and can take several seconds. User may select text immediately.
**How to avoid:** Check patent status before attempting citation. If status is not `PARSED`, show appropriate message ("PDF is still being analyzed, please wait..."). Store status in `chrome.storage.local` (already done by Phase 2). Content script reads status before attempting match.
**Warning signs:** "Text not found" errors that resolve if the user waits and tries again.

### Pitfall 4: Floating Button Positioning Off-Screen
**What goes wrong:** Floating button appears outside the viewport when selection is near the edge of the screen.
**Why it happens:** Positioning is calculated from selection `getBoundingClientRect()` without viewport boundary checks.
**How to avoid:** Clamp button position to viewport bounds. Check `rect.bottom + buttonHeight < window.innerHeight` (if not, position above selection). Check `rect.left + buttonWidth < window.innerWidth` (if not, shift left).
**Warning signs:** Button is invisible or partially clipped at screen edges.

### Pitfall 5: Wrap Hyphen Handling During Concatenation
**What goes wrong:** Text search fails because PDF line break produces "semi-\nconductor" while HTML has "semiconductor" -- the normalized concatenation still has a gap.
**Why it happens:** Concatenation logic adds a space between lines but doesn't handle the wrap hyphen join correctly.
**How to avoid:** When a PositionMap entry has `hasWrapHyphen: true`, strip the trailing hyphen and concatenate the next line directly (no space). This reconstructs "semiconductor" from "semi-" + "conductor".
**Warning signs:** Match works for text within a single line but fails for multi-line passages that contain hyphenated words.

### Pitfall 6: Published Application Paragraph Number Format Variation
**What goes wrong:** Extension can't find paragraph numbers because the DOM structure varies.
**Why it happens:** Google Patents has evolved its HTML structure over time. Paragraph markers may appear as `[0001]` in text content, or as data attributes, or within specific sub-elements.
**How to avoid:** Use multiple selector strategies. Primary: look for text matching `\[\d{4}\]` pattern within `.description .notranslate` elements. Fallback: scan all text nodes in the description section for the bracket pattern. Test against multiple recent applications.
**Warning signs:** Paragraph citations work for some applications but return null for others.

### Pitfall 7: Clipboard API Permissions in Content Script
**What goes wrong:** `navigator.clipboard.writeText()` throws a `NotAllowedError`.
**Why it happens:** Clipboard API requires user activation (recent click/keypress) or the `clipboard-write` permission. In a content script, the user activation context may not propagate correctly.
**How to avoid:** Ensure clipboard write happens within a user gesture handler (click on copy button, or within the mouseup event chain). If permissions fail, fall back to the `document.execCommand('copy')` legacy method as a safety net. May need `"clipboardWrite"` permission in manifest.
**Warning signs:** Copy works when triggered by button click but fails in auto mode.

### Pitfall 8: Message Passing Channel Lifetime
**What goes wrong:** `chrome.runtime.sendMessage` callback never fires -- the "Receiving end does not exist" error.
**Why it happens:** Service worker has gone dormant (MV3 lifecycle). Or: the offscreen document was closed and needs to be re-created.
**How to avoid:** Always call `ensureOffscreenDocument()` before sending messages to the offscreen document. Handle the `chrome.runtime.lastError` in message callbacks. The existing pattern in service-worker.js already handles this for PDF fetch; extend it for citation lookup.
**Warning signs:** Citation works immediately after page load but fails after the extension has been idle for 30+ seconds.

## Code Examples

### Complete Text Matching Flow (Granted Patent)
```javascript
// text-matcher.js - core matching function
function normalizeText(text) {
  return text
    .normalize('NFC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchAndCite(selectedText, positionMap) {
  const normalized = normalizeText(selectedText);

  // Build concatenated PositionMap text with entry boundary tracking
  let concat = '';
  const boundaries = []; // { charStart, charEnd, entryIdx }

  for (let i = 0; i < positionMap.length; i++) {
    const entry = positionMap[i];
    let lineText = normalizeText(entry.text);

    if (entry.hasWrapHyphen) {
      lineText = lineText.replace(/-$/, '');
    }

    const charStart = concat.length;
    if (concat.length > 0 && !positionMap[i - 1]?.hasWrapHyphen) {
      concat += ' ';
    }
    const adjustedStart = concat.length;
    concat += lineText;

    boundaries.push({
      charStart: adjustedStart,
      charEnd: concat.length,
      entryIdx: i,
    });
  }

  // Exact normalized match
  const idx = concat.indexOf(normalized);
  if (idx !== -1) {
    return resolveMatch(idx, idx + normalized.length, boundaries, positionMap, 1.0);
  }

  // Fuzzy fallback: find best substring match using sliding window
  const fuzzyResult = fuzzySubstringMatch(normalized, concat);
  if (fuzzyResult && fuzzyResult.similarity >= 0.80) {
    return resolveMatch(
      fuzzyResult.start, fuzzyResult.end,
      boundaries, positionMap, fuzzyResult.similarity
    );
  }

  return null; // No match found
}

function resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) {
  const startBoundary = boundaries.find(b => b.charStart <= matchStart && b.charEnd > matchStart);
  const endBoundary = boundaries.find(b => b.charStart < matchEnd && b.charEnd >= matchEnd);

  if (!startBoundary || !endBoundary) return null;

  const startEntry = positionMap[startBoundary.entryIdx];
  const endEntry = positionMap[endBoundary.entryIdx];

  return {
    citation: formatCitation(startEntry, endEntry),
    startEntry,
    endEntry,
    confidence,
  };
}
```

### Fuzzy Substring Match (Fallback)
```javascript
// text-matcher.js - Levenshtein-based sliding window
// Source: Algorithm based on standard edit distance with sliding window
function fuzzySubstringMatch(needle, haystack, maxDistance = null) {
  const n = needle.length;
  if (n === 0) return null;
  if (!maxDistance) maxDistance = Math.floor(n * 0.2); // Allow 20% edits

  let bestSimilarity = 0;
  let bestStart = -1;
  let bestEnd = -1;

  // Sliding window: check substrings of similar length to needle
  const windowMin = Math.max(1, n - maxDistance);
  const windowMax = n + maxDistance;

  for (let windowSize = windowMin; windowSize <= windowMax; windowSize++) {
    for (let start = 0; start <= haystack.length - windowSize; start++) {
      const candidate = haystack.substring(start, start + windowSize);
      const distance = levenshtein(needle, candidate);
      const similarity = 1 - distance / Math.max(n, windowSize);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestStart = start;
        bestEnd = start + windowSize;
      }
    }
  }

  if (bestSimilarity >= 0.80) {
    return { start: bestStart, end: bestEnd, similarity: bestSimilarity };
  }
  return null;
}

// Standard Levenshtein distance (O(n*m) but needle is typically short)
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
```

### Settings System
```javascript
// Default settings
const DEFAULT_SETTINGS = {
  triggerMode: 'floating-button',  // 'floating-button' | 'auto' | 'context-menu'
  displayMode: 'default',          // 'default' | 'advanced' | 'silent'
};

// Read settings (content script or popup)
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

// Save settings (popup)
async function saveSettings(settings) {
  return chrome.storage.sync.set(settings);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `document.execCommand('copy')` | `navigator.clipboard.writeText()` | ~2020 | Async, promise-based, works in content scripts on secure origins. execCommand is deprecated. |
| Direct DOM style injection | Shadow DOM (`attachShadow`) | ~2018 widely supported | Complete CSS isolation. No class name conflicts with host page. |
| `chrome.extension.onRequest` | `chrome.runtime.onMessage` | MV3 | Old API removed in MV3. Use `chrome.runtime.sendMessage` / `onMessage`. |
| Background page (persistent) | Service worker (ephemeral) | MV3 | Service worker goes dormant. Cannot hold state in variables -- use chrome.storage. |

**Deprecated/outdated:**
- `document.execCommand('copy')`: Deprecated but still functional as fallback.
- `chrome.extension.onRequest/sendRequest`: Removed in MV3.
- CSS `::selection` pseudo-element for detecting selection: Cannot detect -- only styles selection highlight.

## Open Questions

1. **Google Patents DOM structure stability**
   - What we know: Google Patents uses Polymer web components. Description text appears within `.description.style-scope.patent-text` containers. Paragraph numbers in applications appear within `.notranslate` elements.
   - What's unclear: Google Patents is a live website that can change its DOM structure at any time. Selectors may break without notice.
   - Recommendation: Use resilient selector strategies with fallbacks. Log warnings when primary selectors fail but fallback succeeds. Accept this is an inherent risk of building on top of a third-party website. MEDIUM confidence.

2. **Shadow DOM selection compatibility on Google Patents**
   - What we know: Google Patents uses Polymer/shady-dom. Chrome's `window.getSelection()` generally works across open shadow DOM.
   - What's unclear: Whether there are specific elements on Google Patents where selection does not propagate correctly.
   - Recommendation: Test with real Google Patents pages during implementation. Have the context menu `info.selectionText` as a reliable fallback. MEDIUM confidence.

3. **Fuzzy matching performance on large selections**
   - What we know: The Levenshtein sliding window approach is O(n*m*w) where n=needle length, m=haystack window count, w=window sizes. For a typical patent (5000-20000 PositionMap characters) and typical selection (50-500 characters), this is fast.
   - What's unclear: Whether very large selections (entire paragraphs) against large patents cause noticeable lag.
   - Recommendation: Only use fuzzy fallback when exact normalized match fails. For selections > 500 characters, consider a faster approach (e.g., hash-based n-gram matching). LOW confidence on performance bounds.

4. **Silent mode clipboard interception**
   - What we know: The user wants Ctrl+C to automatically append the citation to the clipboard content.
   - What's unclear: Whether intercepting the `copy` event and modifying clipboard content is reliable across all scenarios. The `clipboardData` API in the `copy` event handler allows setting custom data.
   - Recommendation: Listen for `copy` event, generate citation synchronously (must already be cached), append to selected text. If citation is not ready, let the normal copy proceed without modification. Needs careful testing. MEDIUM confidence.

## Sources

### Primary (HIGH confidence)
- [Chrome contextMenus API](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) - Context menu creation with selection context, MV3 pattern
- [MDN window.getSelection()](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection) - Selection API for text detection
- [Chrome chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - storage.sync for settings persistence
- [MDN Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow) - CSS-isolated UI injection

### Secondary (MEDIUM confidence)
- [Google Patent Scraper selectors](https://github.com/CreepMania/Google-Patent-Scraper) - DOM selectors for Google Patents: `.description.style-scope.patent-text`, `.claims.style-scope.patent-text`, `.notranslate.style-scope.patent-text`
- [SelectON extension](https://github.com/emvaized/selecton-extension) - Reference implementation for floating button on text selection in Chrome extension
- [Fuse.js](https://www.fusejs.io/) and [fuzzball.js](https://github.com/nol13/fuzzball.js) - Evaluated and rejected for this use case (wrong tool for substring location)

### Tertiary (LOW confidence)
- Google Patents DOM structure details are based on scraper analysis and may be outdated. Google Patents can change its HTML structure without notice. Needs validation during implementation.
- Fuzzy matching performance bounds are estimated, not benchmarked. May need optimization if real-world PositionMaps are larger than expected.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all Chrome extension APIs and Web APIs are well-documented and stable
- Architecture: MEDIUM-HIGH - message passing pattern established in Phases 1-2; new additions follow same patterns
- Text matching: MEDIUM - normalization approach is sound for known divergences; fuzzy fallback needs validation with real data
- UI injection (Shadow DOM): HIGH - well-established pattern for Chrome extensions
- Published application path: MEDIUM - DOM selectors need validation against live Google Patents pages
- Pitfalls: HIGH - documented from real Chrome extension development experience

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable domain; Chrome extension APIs are mature; Google Patents DOM may change)

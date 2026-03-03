# Phase 5: Silent Mode - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can copy patent text with Ctrl+C and get the citation appended to the clipboard automatically — no popup, no button click. When silent mode is active, the extension intercepts copy events on patent pages and appends a column:line (grants) or paragraph (applications) citation to the clipboard text. When citation cannot be generated (low confidence, no match), the clipboard gets plain text only and a toast explains why.

</domain>

<decisions>
## Implementation Decisions

### Clipboard format
- Space-only separator between selected text and citation (no period, no comma)
- Raw append — no wrapping, no parentheses, no quotes
- Format: `selected text 4:12-15`
- With patent prefix enabled: `selected text '123 Pat., 4:12-15`
- Multi-line selections: citation appended at end of last line, internal line breaks preserved

### Success feedback
- Brief toast near the selection showing the citation that was appended
- Auto-dismiss after 2 seconds
- Minimal pill style — small, unobtrusive, just shows the citation text (e.g., "4:12-15")

### Failure feedback
- Specific reason per failure type:
  - No match: "No match — plain text copied"
  - Low confidence: "Low confidence — plain text copied"
  - PDF not analyzed: "PDF not analyzed — plain text copied"
- Toast appears near the selection (same position as success toast)
- Auto-dismiss after 4 seconds (matches existing error popup timing)
- Prominent style — larger than success pill, with explanation text
- Confidence threshold: below 0.80 = plain text + failure toast

### Mode switching
- "Silent" is a 4th option in the existing trigger mode dropdown (replaces other modes, mutually exclusive)
- When PDF isn't analyzed or user is on non-patent page: Ctrl+C works normally with no toast, no interference
- No visual indicator on extension icon when silent mode is active
- No onboarding hint when switching to silent mode — dropdown label is self-explanatory

### Claude's Discretion
- Exact toast pill dimensions and styling
- Copy event interception approach (document `copy` event listener vs other patterns)
- Toast animation (fade in/out, slide, or instant)
- How to handle rapid successive Ctrl+C presses (debounce strategy)

</decisions>

<specifics>
## Specific Ideas

- Success toast should be a small pill showing just the citation — minimal, like a confirmation chip
- Failure toast should be more prominent with the specific reason text — draws attention to the problem
- The existing Shadow DOM host pattern in citation-ui.js should be reused for toast rendering

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateCitation()` (content-script.js:295): Already handles both grant (PositionMap) and application (paragraph) citation paths — silent mode can call this directly
- `applyPatentPrefix()` (content-script.js:278): Patent number prefix logic already implemented — reuse for silent clipboard formatting
- `getSelectionContext()` (content-script.js:219): Surrounding context extraction for disambiguation — needed for silent mode too
- Shadow DOM host pattern (citation-ui.js:26): getCitationHost() creates isolated UI elements — reuse for toast notifications
- `extractPatentInfo()` (content-script.js:21): Patent type detection (grant vs application) — determines citation format

### Established Patterns
- Settings stored in `chrome.storage.sync`, loaded on init with `DEFAULT_SETTINGS` fallback, live-updated via `onChanged` listener
- Trigger mode routing via switch statement in `handleSelection()` (content-script.js:197)
- `citationInProgress` flag prevents re-entrant citation generation
- Shadow DOM for all UI to avoid CSS conflicts with Google Patents Polymer components

### Integration Points
- Trigger mode dropdown in popup.html:53 — add "Silent (Ctrl+C)" option
- `DEFAULT_SETTINGS.triggerMode` in content-script.js:141 — add 'silent' to valid values
- `handleSelection()` switch in content-script.js:197 — add 'silent' case (no-op, since silent uses copy event not mouseup)
- `clipboardWrite` permission already in manifest.json:14 — no permission changes needed
- Service worker message handling unchanged — silent mode only adds content-script behavior

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-silent-mode*
*Context gathered: 2026-03-02*

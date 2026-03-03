# Phase 3: Text Matching and Citation Generation - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

When a user highlights text on Google Patents, locate that text in the PositionMap (granted patents) or HTML DOM (published applications) and return a correctly formatted citation. Three trigger mechanisms with settings. Clipboard output and toast notification are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Selection trigger & interaction mode
- Build all 3 trigger mechanisms, configurable via extension settings:
  - **Floating button** (default) — small button appears near the selection, one click generates citation
  - **Auto on selection** — citation generates immediately when text is highlighted
  - **Right-click context menu** — "Get Citation" option in Chrome context menu
- Settings UI needed in extension popup or options page to select active trigger

### Citation result display
- **Default mode:** Small popup near the selection showing citation text + copy button (citation only)
- **Advanced mode** (settings toggle): Popup also shows matched text preview and confidence indicator
- **Silent mode** (settings toggle): Ctrl+C automatically appends citation to clipboard alongside copied text — no popup appears

### Match confidence & errors
- Low-confidence indicator: Claude's discretion on UX pattern
- No match found: Clear error message in popup (e.g., "Text not found in patent specification")
- Always attempt match regardless of selection length — rely on confidence indicator for ambiguous short selections
- Match text in both description AND claims sections (same col:line format for both)

### Citation format — Granted patents
- Single line: `4:15`
- Same-column range: `4:15-20`
- Cross-column range: `4:55-5:10`
- Claims and description use identical col:line format (no prefix distinction)

### Citation format — Published applications
- Paragraph format: `¶ [0045]`
- Paragraph range: `¶ [0045]-[0047]`

### Published application handling
- **Detection:** Patent number format as primary signal (US2024/0123456 = application), PDF layout as confirmation/fallback
- **No PDF fetch for applications:** Work entirely from HTML DOM — paragraph numbers are already structured in the page
- **Paragraph source:** Extract paragraph markers from Google Patents HTML, not from PDF

### Fuzzy matching
- Must handle common HTML-to-PDF divergences: smart quotes, dashes, ligatures, whitespace differences
- Matching pipeline only needed for granted patents (applications use HTML-only path)

### Claude's Discretion
- Low-confidence warning UX design (color, wording, placement)
- Fuzzy matching algorithm choice and confidence thresholds
- Floating button visual design and positioning logic
- Settings page layout and organization
- How silent mode appends citation to clipboard content

</decisions>

<specifics>
## Specific Ideas

- Default trigger is floating button — least intrusive while still discoverable
- Silent mode concept: when user does Ctrl+C on highlighted text, the extension intercepts and appends the citation to the clipboard content (e.g., "copied text (4:15-20)")
- Published applications should feel instant since no PDF fetch/parse is needed — just DOM lookup
- Citation format follows standard patent practice: compact col:line notation

</specifics>

<deferred>
## Deferred Ideas

- Configurable citation format (col. 4, ll. 5-20 vs column 4, lines 5-20) — already tracked as UX-01 in v2 requirements
- Keyboard shortcut for citation — already tracked as UX-02 in v2 requirements

</deferred>

---

*Phase: 03-text-matching-and-citation-generation*
*Context gathered: 2026-02-28*

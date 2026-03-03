# Phase 4: Citation Output - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the end-to-end user workflow: when a user highlights text on Google Patents, show the generated citation in a floating panel near the selection, let them copy it to clipboard with one click, and confirm the copy visually. No popup navigation, no leaving the page. Settings for citation format live in the extension popup.

</domain>

<decisions>
## Implementation Decisions

### Copy trigger & flow
- Citation appears in a small floating panel near the highlighted text (not auto-copied)
- User clicks a copy button inside the panel to copy to clipboard
- Panel dismisses when user clicks outside it
- New text selection replaces the current panel with a new citation seamlessly

### Citation format
- Default format is compact shorthand: `4:5-20` for granted patents, `[0045]` for published applications
- Cross-column spans use the format `4:55-5:10`
- Optional setting to prefix with short patent number (last 3 digits): `'456 Pat., 4:5-20`
- Format toggle (include patent number or not) lives in the extension popup settings page
- No formal/verbose format (e.g., "col. 4, ll. 5-20") — compact only

### Toast / copy confirmation
- No separate toast notification — the floating panel itself updates inline
- Copy button changes to checkmark + "Copied!" text after successful copy
- Panel styling is minimal and subtle — muted colors, blends with the page, doesn't draw attention from patent text
- Citation text in the panel is read-only (not selectable/editable)

### Error & edge cases
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

</decisions>

<specifics>
## Specific Ideas

- Short patent number format uses last 3 digits with tick mark: `'456 Pat., 4:5-20` — this is a common patent prosecution shorthand
- The workflow must feel zero-friction: highlight → see citation → click copy → done
- Panel should feel unobtrusive — patent professionals are reading dense text and don't want visual noise

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-citation-output*
*Context gathered: 2026-03-01*

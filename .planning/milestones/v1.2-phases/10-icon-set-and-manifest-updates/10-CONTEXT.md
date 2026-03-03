# Phase 10: Icon Set and Manifest Updates - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-quality extension icons at all required sizes (16, 32, 48, 128px) with a three-state toolbar icon system (gray → partial → full color) that communicates parse readiness. Includes source SVG, generation script via sharp, and manifest updates. No UI changes beyond the icon — options page and store listing are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All visual design decisions are delegated to Claude. The user wants a professional, functional result without specifying exact aesthetics. Claude has full flexibility on:

**Icon artwork:**
- Icon concept/motif (document, brackets, column reference, or hybrid)
- Primary color for the full-color active state
- Visual style and level of detail (balancing 16px readability with 128px store presence)
- No specific reference icons or inspirations to match

**Three-state color scheme:**
- How "partial color" (patent detected, not yet parsed) is rendered — desaturated, outlined, badge overlay, or other approach
- Whether gray state is pure grayscale or slightly tinted
- Whether state transitions use icon swap only or include badge text during loading
- How published applications are handled (instant full-color vs brief partial state)

**Constraints Claude must respect:**
- All three states must be clearly distinguishable at 16px in the Chrome toolbar
- Gray must read as "inactive/disabled", partial must read as "working on it", full must read as "ready"
- Error badges (existing red/amber via setBadgeText) must remain functional and not conflict with the state system

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User explicitly chose "you decide" on all visual design questions, indicating trust in Claude's judgment for professional output.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/icons/` — Current placeholder PNGs (solid-color squares, 16/48/128px). Will be replaced entirely.
- Service worker badge system — `chrome.action.setBadgeText()` and `setBadgeBackgroundColor()` already used for error states (red `#EF4444`) and unavailable states (amber `#F59E0B`). New icon states must coexist with these.

### Established Patterns
- Two-state manifest structure: `action.default_icon` (inactive set shown by default) and `icons` (active set used by Chrome Web Store and extension management page)
- `declarativeContent` rules enable the action only on `patents.google.com/patent/US*` pages — this handles the gray→active transition already
- No `chrome.action.setIcon()` calls exist yet — the partial/full state distinction will require adding these to the service worker message handlers
- Status constants in service worker: `IDLE`, `FETCHING`, `READY`, `PARSING`, `PARSED`, `NO_TEXT_LAYER`, `ERROR`, `UNAVAILABLE` — the icon state map should be: IDLE→gray, FETCHING/PARSING→partial, PARSED→full, ERROR/UNAVAILABLE→partial+badge

### Integration Points
- `handlePdfLinkFound()` — transition gray→partial (patent detected, starting fetch)
- `handleParseResult()` (success) — transition partial→full (parsed, ready to cite)
- `handleCacheHitResult()` — transition gray→full (cache hit, instantly ready)
- Missing 32px icons need adding to manifest `action.default_icon` and `icons` sections
- Generation script goes in `scripts/generate-icons.mjs` (consistent with existing `scripts/` pattern)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-icon-set-and-manifest-updates*
*Context gathered: 2026-03-03*

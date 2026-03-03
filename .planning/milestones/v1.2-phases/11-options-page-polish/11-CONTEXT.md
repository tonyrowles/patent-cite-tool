# Phase 11: Options Page Polish - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Dedicated options page accessible via right-click extension menu with all settings migrated from popup. Popup simplified to status display with settings link. Clear save feedback on options page. Version number and privacy policy link displayed. No new settings or features — reorganization of existing controls only.

</domain>

<decisions>
## Implementation Decisions

### Save interaction
- Auto-save on change (same behavior as current popup) with inline "Saved" confirmation feedback
- No explicit save button — settings persist immediately via chrome.storage.sync
- No "Reset to defaults" option — only 3 settings, keep it minimal
- Brief helper text when Silent (Ctrl+C) mode is selected, explaining the workflow (e.g., "Select text, then Ctrl+C to copy with citation appended")

### Popup after migration
- Popup retains patent status display (ready/fetching/error states)
- Settings section removed from popup entirely
- Settings link added to popup that opens the options page
- Link opens via chrome.runtime.openOptionsPage() — standard Chrome extension behavior

### Options page layout
- Simple vertical list — all settings in a single column, one after another
- Each setting has a brief description line below the control explaining what it does
- Title/header at top, settings below, footer at bottom

### Version and privacy placement
- Footer position at bottom of page — "v{version} · Privacy Policy"
- Version number pulled dynamically via chrome.runtime.getManifest().version
- Privacy policy link as placeholder URL until Phase 12 provides the real hosted URL

### Claude's Discretion
- Save feedback style (inline text near setting vs toast banner vs other approach)
- Settings link style in popup (text link at bottom vs gear icon vs other)
- Popup width/height after settings removal
- Options page content width and centering
- Header style (name + icon vs text-only vs other)
- Visual styling and color palette (informed by Phase 10's slate/amber/blue icon palette)
- Exact typography, spacing, and visual polish

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User delegated all visual design choices to Claude, consistent with Phase 10's approach.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/popup/popup.html` — Current popup with inline CSS and settings controls. Settings HTML/JS to be removed; status display retained.
- `src/popup/popup.js` — Settings load/save logic using chrome.storage.sync with defaults (triggerMode: 'floating-button', displayMode: 'default', includePatentNumber: false). Pattern to replicate in options.js.
- `src/icons/icon-active-*.png` — Extension icons at 16/32/48/128px for potential use in options page header.

### Established Patterns
- Inline CSS (no external stylesheets anywhere in project) — options page will likely follow this pattern
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- chrome.storage.sync for settings, chrome.storage.local for runtime state
- Settings defaults defined inline in `chrome.storage.sync.get()` call — same pattern for options page
- Color palette from Phase 10: slate gray (#64748b), warm amber (#d97706), vibrant blue (#2563eb)

### Integration Points
- `src/manifest.json` — needs `options_ui` entry with `page: "options/options.html"` and `open_in_tab: true`
- `src/popup/popup.html` — remove settings section, add settings link
- `src/popup/popup.js` — remove settings load/save handlers, add openOptionsPage handler
- New files: `src/options/options.html`, `src/options/options.js`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-options-page-polish*
*Context gathered: 2026-03-03*

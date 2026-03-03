# Phase 12: Store Listing and Submission - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Submit the extension to the Chrome Web Store with all required assets: a hosted privacy policy, at least one 1280x800 screenshot, a 440x280 promotional tile, complete store listing text, and a fully completed Developer Dashboard privacy section. No code feature changes — this phase is about packaging and submission.

</domain>

<decisions>
## Implementation Decisions

### Privacy policy hosting
- Host on GitHub Pages at `tonyrowles.github.io/patent-cite-tool/privacy`
- Create a `docs/` directory in the repo root with the privacy policy HTML page
- Enable GitHub Pages from the `docs/` folder on `main` branch
- Update the placeholder `href="#"` in `src/options/options.html:232` to the real GitHub Pages URL
- Privacy policy content: no personal data collected, no analytics, no user accounts, no tracking
- Mention Cloudflare KV (pct.tonyrowles.com) as first-party infrastructure for patent position map caching
- Mention chrome.storage.sync for user preference sync (trigger mode, display mode, patent prefix)
- All data stays within first-party infrastructure (tonyrowles controls pct.tonyrowles.com)

### Screenshot and promotional tile
- Manual capture approach — take screenshot in Chrome at exactly 1280x800 window size
- Use a real patent page showing a citation overlay that looks clean and representative — Claude picks the patent
- Store assets in `store-assets/` directory at repo root (separate from extension source)
- Promotional tile (440x280): Claude has full design discretion on approach

### Store listing copy
- Claude has full discretion on tone, title, summary, and description
- Claude optimizes for Chrome Web Store search visibility
- Claude decides on accuracy claims based on audit results and Chrome Web Store policy
- Claude writes description based on the full feature set
- Current manifest: name "Patent Citation Tool", description "Get accurate citation references from Google Patents"

### Dashboard privacy section
- Single purpose: core citation purpose only — "Generate column/line citation references from highlighted text on Google Patents pages" — caching is implementation detail
- Permission justifications: Claude drafts all based on actual code usage, user reviews before submission
- Remote code certification: No remote JavaScript — all JS bundled in extension, remote calls are data-only (JSON position maps), pdf.worker.mjs is local
- Data use: Certify minimal data practices — no personal data collected, no data sold, settings synced via Chrome's built-in storage.sync only

### Claude's Discretion
- Privacy policy page styling and layout
- Screenshot patent selection (pick best real example)
- Promotional tile design (icon + name vs mini screenshot vs other)
- Store listing title (keep "Patent Citation Tool" vs more descriptive variant)
- Store listing tone and feature highlights
- Accuracy claims inclusion/exclusion
- Permission justification wording
- Data use checkbox selections based on actual extension behavior

</decisions>

<specifics>
## Specific Ideas

- Privacy policy URL pattern: `tonyrowles.github.io/patent-cite-tool/privacy`
- GitHub repo: `tonyrowles/patent-cite-tool`
- Existing placeholder to update: `src/options/options.html:232` — `<a id="privacyLink" href="#" target="_blank">`
- TODO comment at `src/options/options.html:231` to remove
- Manifest permissions to justify: declarativeContent, offscreen, activeTab, storage, contextMenus, clipboardWrite
- Host permissions to justify: `https://patentimages.storage.googleapis.com/*`, `https://pct.tonyrowles.com/*`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/icons/icon-active-128.png` — High-res extension icon for store listing and promotional tile
- `src/options/options.html` — Contains the privacy policy placeholder link to update
- `src/manifest.json` — Source of truth for permissions, description, and version

### Established Patterns
- Inline CSS throughout project (no external stylesheets) — privacy policy page could follow this or use standalone HTML
- GitHub Pages deployment from `docs/` folder is a standard pattern for this repo host

### Integration Points
- `src/options/options.html:231-232` — Replace placeholder href and remove TODO comment
- `docs/` directory — New directory for GitHub Pages content (privacy policy)
- `store-assets/` directory — New directory for Chrome Web Store submission assets
- Chrome Developer Dashboard — Manual submission with prepared assets and text

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-store-listing-and-submission*
*Context gathered: 2026-03-03*

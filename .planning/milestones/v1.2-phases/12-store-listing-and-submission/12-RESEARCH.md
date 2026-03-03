# Phase 12: Store Listing and Submission - Research

**Researched:** 2026-03-03
**Domain:** Chrome Web Store submission, GitHub Pages hosting, asset creation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Privacy policy hosting**
- Host on GitHub Pages at `tonyrowles.github.io/patent-cite-tool/privacy`
- Create a `docs/` directory in the repo root with the privacy policy HTML page
- Enable GitHub Pages from the `docs/` folder on `main` branch
- Update the placeholder `href="#"` in `src/options/options.html:232` to the real GitHub Pages URL
- Privacy policy content: no personal data collected, no analytics, no user accounts, no tracking
- Mention Cloudflare KV (pct.tonyrowles.com) as first-party infrastructure for patent position map caching
- Mention chrome.storage.sync for user preference sync (trigger mode, display mode, patent prefix)
- All data stays within first-party infrastructure (tonyrowles controls pct.tonyrowles.com)

**Screenshot and promotional tile**
- Manual capture approach — take screenshot in Chrome at exactly 1280x800 window size
- Use a real patent page showing a citation overlay that looks clean and representative — Claude picks the patent
- Store assets in `store-assets/` directory at repo root (separate from extension source)
- Promotional tile (440x280): Claude has full design discretion on approach

**Store listing copy**
- Claude has full discretion on tone, title, summary, and description
- Claude optimizes for Chrome Web Store search visibility
- Claude decides on accuracy claims based on audit results and Chrome Web Store policy
- Claude writes description based on the full feature set
- Current manifest: name "Patent Citation Tool", description "Get accurate citation references from Google Patents"

**Dashboard privacy section**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STOR-01 | Privacy policy written and hosted at a stable public URL | GitHub Pages from `docs/` folder on `main` branch; URL `tonyrowles.github.io/patent-cite-tool/privacy`; straightforward static HTML deploy |
| STOR-02 | At least one 1280x800 screenshot showing citation in context on a real patent page | Chrome DevTools device mode resize to exact 1280x800; manual capture; save PNG to `store-assets/` |
| STOR-03 | 440x280 promotional tile for Chrome Web Store search | PNG or JPEG; full-bleed design; no padding; saturation recommended; can be generated with Canvas/Canva/code |
| STOR-04 | Store listing text — title (≤45 chars), summary (≤132 chars), description | Confirmed limits; description plain text, no HTML; keyword-stuffing prohibited |
| STOR-05 | Developer Dashboard privacy section complete (all four subsections) | Four confirmed subsections: single purpose, permission justifications, remote code, data use checkboxes |
</phase_requirements>

---

## Summary

Phase 12 is entirely non-code work: create assets, write copy, configure a hosted page, and submit through the Chrome Web Store Developer Dashboard. There are no npm packages to install and no source code changes except a one-line `href` update in `options.html`. The work divides cleanly into five deliverables that map 1-to-1 with the STOR requirements.

The technical complexity is low. GitHub Pages from a `docs/` folder is a five-minute setup in repo Settings. The privacy policy is a single HTML file. The screenshot requires Chrome DevTools resize to 1280x800. The promotional tile can be created with code (Canvas API, Node canvas, or even a simple SVG-to-PNG script) since the 128px source icon is already available. The store listing text and permission justifications are writing tasks with clear, researched guidelines.

The primary risk is sequencing: the privacy policy URL must be live before the Dashboard can link to it, and the extension ZIP must be ready (from the `src/` directory) before upload. Review time is typically 1–7 days after submission; the phase ends at "pending review" status, not at approval.

**Primary recommendation:** Proceed in dependency order: (1) create `docs/privacy.html` and enable GitHub Pages, (2) update `options.html` href once URL is confirmed live, (3) capture screenshot, (4) create promotional tile, (5) draft all store listing text and permission justifications, (6) package and submit.

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| Chrome Developer Dashboard | N/A | Extension submission portal | The only submission path for Chrome Web Store |
| GitHub Pages | N/A | Privacy policy hosting | Decided; zero-cost, stable URL, deploys from `docs/` folder |
| Chrome DevTools Device Mode | N/A | Resize browser to exact 1280x800 for screenshot | Built into Chrome; no additional tooling required |
| `src/` directory as ZIP | N/A | Extension package | Chrome Web Store requires a ZIP of the extension root |

### Supporting

| Tool | Purpose | When to Use |
|---|---|---|
| Node.js `canvas` or browser Canvas | Promotional tile generation (440x280) | If generating tile programmatically from icon + text |
| Canva / Figma (manual) | Promotional tile design | If manually designing in a graphics tool |
| ImageMagick / sharp | PNG resizing or format conversion | If screenshots or tile need pixel-perfect sizing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| GitHub Pages `docs/` | Cloudflare Pages, Vercel | User decided GitHub Pages; simpler, same repo |
| Manual screenshot | Playwright/Puppeteer headless screenshot | Automated approach harder to get exact visual quality; manual is faster for one-time task |
| Code-generated tile | Canva template | Either works; code-generated is reproducible and version-controlled |

---

## Architecture Patterns

### Recommended Project Structure

New directories created in this phase:

```
/
├── docs/
│   └── privacy.html          # Privacy policy page (GitHub Pages source)
├── store-assets/
│   ├── screenshot-1280x800.png    # Chrome Web Store screenshot
│   └── promo-tile-440x280.png     # Promotional tile
└── src/
    └── options/
        └── options.html      # MODIFY line 232: update href="#" to real URL
```

### Pattern 1: GitHub Pages from docs/ folder

**What:** Push a `docs/` directory to the `main` branch. In GitHub repo Settings > Pages > Build and deployment > Source: "Deploy from a branch" > Branch: `main` > Folder: `/docs`. Pages deploys automatically on every push to main.

**URL pattern:** `https://tonyrowles.github.io/patent-cite-tool/privacy` maps to `docs/privacy.html` in the repo.

**Propagation:** First-time setup takes up to 10 minutes for GitHub to provision. Subsequent content updates propagate within 1-3 minutes. No DNS changes required for the github.io subdomain — it is available immediately once Pages is enabled.

**Critical step:** After enabling Pages, verify the URL returns HTTP 200 before using it in the extension or the Developer Dashboard. A broken privacy policy link will cause submission rejection.

### Pattern 2: Chrome Web Store ZIP Package

**What:** The extension package is a ZIP of the `src/` directory contents. The `manifest.json` must be at the root of the ZIP (not inside a subfolder).

**What to exclude from the ZIP:**
- `node_modules/` (not in `src/`)
- `.git/`, `.gitignore`
- Test files, scripts, planning docs (all outside `src/`)
- Any `key` field in `manifest.json` (Chrome Store rejects ZIPs with a `key` field — the current manifest has none, so this is already clear)

**Correct ZIP command:**
```bash
cd /path/to/patent-cite-tool/src
zip -r ../store-assets/patent-cite-tool.zip .
```

This produces a ZIP where `manifest.json` is at root level.

### Pattern 3: Developer Dashboard Privacy Tab — Four Subsections

**Subsection 1 — State the Extension's Purpose (Single Purpose)**
Text field. Enter a clear, narrow description of what the extension does. The user decision is: "Generate column/line citation references from highlighted text on Google Patents pages."

**Subsection 2 — List and Justify Permissions**
The dashboard shows each permission from `manifest.json` with a text field for justification. Permissions to justify:

| Permission | What It Does | Justification Approach |
|---|---|---|
| `declarativeContent` | Activate toolbar icon only on patent pages | "Enables the toolbar action to activate only when the user is on a Google Patents page, without requiring host permissions to read page content" |
| `offscreen` | Run PDF.js in a DOM context from service worker | "Creates a hidden offscreen document to run PDF.js (which requires DOM APIs) for extracting text position maps from patent PDFs" |
| `activeTab` | Access current tab's URL | "Reads the current tab URL to extract the patent number for PDF fetching, triggered only by user context menu action" |
| `storage` | chrome.storage.sync for user preferences | "Persists user settings (trigger mode, display mode, patent number prefix) across browser sessions using Chrome's built-in sync storage" |
| `contextMenus` | Right-click menu entry | "Adds a context menu item so users can invoke citation generation by right-clicking highlighted text" |
| `clipboardWrite` | Copy citation to clipboard | "Writes the generated citation string to the clipboard when the user triggers citation generation" |
| host: `patentimages.storage.googleapis.com/*` | Fetch patent PDFs | "Downloads patent PDF files from Google Patents' CDN to extract text position data for citation generation" |
| host: `pct.tonyrowles.com/*` | Fetch cached position maps | "Fetches pre-computed patent text position maps from first-party Cloudflare KV infrastructure, reducing PDF download time" |

**Subsection 3 — Declare Remote Code**
Checkbox: "No, I am not using remote code." All JavaScript is bundled in the extension. Remote HTTP calls return data (JSON position maps), not executable code. `pdf.worker.mjs` is a local file in `src/lib/` declared in `web_accessible_resources`.

**Subsection 4 — Certify Data Use Practices**
Two groups of checkboxes:
- **Group 1 (data types collected):** Select none or the minimal applicable categories. Based on extension behavior: no personally identifiable information, no health, no financial, no authentication, no location, no web history, no user activity beyond the extension itself, no website content stored externally. Only `chrome.storage.sync` preference data (trigger mode, display mode, patent prefix string) — this is user-controlled settings, not personal data.
- **Group 2 (certification statements):** Check the statements certifying you do not sell data, do not use for advertising, and comply with limited use policies.

### Pattern 4: Store Listing Text

**Character limits (confirmed from official docs):**
- Title: The dashboard enforces a limit (the REQUIREMENTS.md says ≤45 chars — treat as the project constraint; official docs confirm the title must be concise)
- Summary: ≤132 characters — confirmed in official docs; appears on homepage and search results
- Description: Plain text, no HTML; no stated limit but keyword stuffing is prohibited; structure as overview paragraph + bullet list

**SEO guidance:**
- Summary is the primary discovery hook — pack in the core value prop
- Avoid keyword spam: no repetition of the same keyword more than 5 times
- Do not include anonymous user testimonials
- Category: "Productivity" or "Developer Tools" are the relevant categories for a patent tool

**Sample title options (under 45 chars):**
- "Patent Citation Tool" (20 chars) — exact current name, clear
- "Patent Citation Tool for Google Patents" (39 chars) — adds context
- "Patent Citation Generator — Google Patents" (43 chars) — action-oriented

**Sample summary (≤132 chars):**
"Instantly generate column/line citations from highlighted text on Google Patents pages. No PDF downloads or manual counting required."
(131 chars — fits)

### Anti-Patterns to Avoid

- **Submitting before privacy policy is live:** The Dashboard requires a working URL for the privacy policy. Submit the policy page, wait for GitHub Pages to provision, verify 200 OK, then fill in the Dashboard field.
- **Including node_modules or .git in ZIP:** Will bloat the package unnecessarily; Chrome validates the ZIP.
- **Claiming "100% accuracy" in description:** Chrome Web Store policy prohibits misleading claims. Use qualified language based on actual audit results (e.g., "high-accuracy" or cite the measured match rate).
- **Key field in manifest.json:** Chrome rejects ZIPs with a `key` field. The current manifest has no `key` field — confirm before packaging.
- **Leaving TODO comment in options.html:** The TODO comment at line 231 must be removed when updating the href. Shipping TODO comments in production is poor practice.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Privacy policy content | Custom legal language from scratch | Follow the structure: what data is collected (none/minimal), what third-party services are used (Cloudflare KV, chrome.storage.sync), how to contact for questions | Chrome extension privacy policies have a well-understood minimal structure; legal complexity is low because the extension collects no personal data |
| Screenshot exact dimensions | Custom screenshot tooling | Chrome DevTools Device Mode (Toggle device toolbar → set 1280x800 → screenshot) | Built into every Chrome install; zero setup |
| Promotional tile from scratch | Complex graphics pipeline | Node.js Canvas or sharp compositing the existing 128px icon | The source icon already exists; tile is icon + name + background |

---

## Common Pitfalls

### Pitfall 1: Privacy Policy URL Not Live at Submission Time

**What goes wrong:** Developer fills in privacy policy URL in the Dashboard before GitHub Pages has provisioned the domain. Chrome's review process may check the URL and find a 404.

**Why it happens:** GitHub Pages takes a few minutes (up to 10 minutes on first enable) to provision and serve the docs/ folder.

**How to avoid:** Enable GitHub Pages in repo settings first, push the `docs/privacy.html` file, then wait and verify the URL returns HTTP 200 before entering it in the Dashboard or updating the `options.html` href.

**Warning signs:** Visiting `tonyrowles.github.io/patent-cite-tool/privacy` returns "404 There isn't a GitHub Pages site here" — means provisioning isn't complete yet.

### Pitfall 2: Screenshot Not at Exactly 1280x800

**What goes wrong:** The uploaded screenshot is rejected or displayed distorted because it's a non-standard dimension.

**Why it happens:** Chrome browser window outer chrome (title bar, address bar, bookmarks) is not the same as the viewport. Setting window size to 1280x800 gives a smaller viewport.

**How to avoid:** Use Chrome DevTools Device Mode with "Responsive" preset and manually type width=1280, height=800 in the dimension fields. This sets the *viewport* to exactly 1280x800. Then use DevTools "Capture screenshot" or a screenshot extension that captures the viewport, not the full browser window.

**Warning signs:** Screenshot file has dimensions other than exactly 1280x800 pixels when inspected in an image viewer.

### Pitfall 3: Wrong ZIP Structure (Nested Directory)

**What goes wrong:** The ZIP file contains a `src/` subdirectory with `manifest.json` inside, instead of `manifest.json` at the root. Chrome Web Store shows a validation error: "We could not read your manifest file."

**Why it happens:** Running `zip -r package.zip src/` from the project root creates `src/manifest.json` inside the ZIP.

**How to avoid:** Always `cd` into the `src/` directory first, then run `zip -r ../store-assets/patent-cite-tool.zip .` so that `manifest.json` is at the ZIP root.

### Pitfall 4: options.html Deployed with href="#"

**What goes wrong:** Extension is submitted with the `privacyLink` href still pointing to `#`. The privacy policy link in the options page doesn't work for users. Could also be flagged during review.

**Why it happens:** The code change is easy to forget since it's a one-line HTML edit, not a feature.

**How to avoid:** Update `src/options/options.html:232` (href) and remove the TODO comment at line 231 as a committed change before packaging the ZIP.

### Pitfall 5: Review Delay Due to Sensitive Permissions

**What goes wrong:** Extensions using `offscreen`, `declarativeContent`, and host permissions for external URLs sometimes trigger extended review. Review can take 7+ days for first submissions.

**Why it happens:** Google's review system flags extensions requesting host permissions for external domains. First-time submissions always get deeper review.

**How to avoid:** Write thorough, specific permission justifications (not boilerplate). Name the exact API used for each permission. This is the primary lever developers control to speed up review.

---

## Code Examples

### Create ZIP from src/ directory

```bash
# From project root: /home/fatduck/patent-cite-tool/
cd src
zip -r ../store-assets/patent-cite-tool-v0.1.0.zip .
cd ..
# Verify manifest.json is at root of ZIP
unzip -l store-assets/patent-cite-tool-v0.1.0.zip | grep manifest
# Expected: manifest.json (not src/manifest.json)
```

### Minimal privacy policy HTML structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Patent Citation Tool</title>
  <style>
    /* Minimal, clean styles matching the extension's design language */
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           font-size: 15px; line-height: 1.6; color: #1e293b;
           max-width: 680px; margin: 48px auto; padding: 0 24px; }
    h1 { font-size: 24px; font-weight: 700; color: #1e3a8a; margin-bottom: 8px; }
    h2 { font-size: 18px; font-weight: 600; color: #0f172a; margin: 32px 0 8px; }
    p, li { color: #334155; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Patent Citation Tool</strong> — Last updated: [date]</p>
  <h2>Data Collected</h2>
  <p>This extension does not collect, store, or transmit any personal data.</p>
  <h2>Services Used</h2>
  <p><strong>Cloudflare KV (pct.tonyrowles.com)</strong>: The extension fetches pre-computed
  patent text position maps from this first-party infrastructure. No user data is transmitted;
  only patent document identifiers are sent as part of URL requests.</p>
  <p><strong>chrome.storage.sync</strong>: Three user preferences (trigger mode, display mode,
  patent number prefix) are synced across your Chrome sessions using Chrome's built-in storage.
  This data is controlled by Chrome's sync infrastructure and is not accessible to us.</p>
  <!-- ... additional sections ... -->
</body>
</html>
```

### Update options.html — the one-line code change

**File:** `src/options/options.html`

```html
<!-- BEFORE (lines 231-232): -->
<!-- TODO: Phase 12 will provide the real privacy policy URL -->
<a id="privacyLink" href="#" target="_blank">Privacy Policy</a>

<!-- AFTER (remove TODO comment, update href): -->
<a id="privacyLink" href="https://tonyrowles.github.io/patent-cite-tool/privacy" target="_blank">Privacy Policy</a>
```

### Configure GitHub Pages (via GitHub UI, not code)

Steps in `https://github.com/tonyrowles/patent-cite-tool/settings/pages`:
1. Build and deployment > Source: "Deploy from a branch"
2. Branch: `main`, Folder: `/docs`
3. Click Save
4. Wait for provisioning (yellow spinner → green checkmark)
5. URL shown: `https://tonyrowles.github.io/patent-cite-tool/`

The privacy page will be at: `https://tonyrowles.github.io/patent-cite-tool/privacy` (maps to `docs/privacy.html` or `docs/privacy/index.html`).

Note: GitHub Pages maps `docs/privacy.html` to the URL path `/privacy` (no `.html` extension) only when using Jekyll or if the server is configured to strip extensions. To guarantee the URL `tonyrowles.github.io/patent-cite-tool/privacy` works without `.html`, create `docs/privacy/index.html` instead of `docs/privacy.html`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Chrome Web Store allowed Manifest V2 | MV3 required for new submissions | 2024 | Extensions must use service workers, no background pages; already compliant |
| Privacy disclosure optional | Privacy tab in Dashboard required for all submissions | 2021 | Must complete all four privacy subsections before submission goes through |
| No registration fee | $5 one-time fee required | 2020 | One-time payment; likely already paid if developer account exists |

**Deprecated/outdated:**
- Background pages (MV2): Patent Citation Tool already uses a service worker — fully compliant, no action needed.
- Manifest `key` field in submitted ZIPs: Must not be present. Current manifest has no `key` field — already clean.

---

## Open Questions

1. **Does the GitHub repo `tonyrowles/patent-cite-tool` exist and is it public?**
   - What we know: The CONTEXT.md specifies this repo and URL pattern
   - What's unclear: Whether the repo is already public and whether a developer account has been registered
   - Recommendation: The planner should include a task to verify developer account status ($5 fee) and repo visibility before submitting

2. **Exact data use checkbox options in the Developer Dashboard**
   - What we know: Two groups of checkboxes — one for data types collected, one for certification statements. Data types include: personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity, website content
   - What's unclear: The exact checkbox label wording and whether there is a "none collected" option
   - Recommendation: Plan a task where Claude drafts the intended checkbox selections and user confirms in the actual Dashboard UI. Based on extension behavior, all data type checkboxes should be unchecked (no personal data collected) or the "none" option if available

3. **Screenshot patent selection**
   - What we know: Must show a real citation overlay on a Google Patents page at 1280x800
   - What's unclear: Which patent will display the cleanest, most representative citation
   - Recommendation: Claude should select a well-known US utility patent with clear column/line structure. A patent from a recent, readable technology domain (electronics, software method) will look cleaner than a chemical or biological patent with complex claim language

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is not set in `.planning/config.json`; this phase contains no automated test requirements. All success criteria are manually verified (URL live, screenshot dimensions, Dashboard fields complete, submission confirmed pending).

---

## Sources

### Primary (HIGH confidence)
- [developer.chrome.com/docs/webstore/publish](https://developer.chrome.com/docs/webstore/publish) — Submission process, ZIP requirements, dashboard sections
- [developer.chrome.com/docs/webstore/images](https://developer.chrome.com/docs/webstore/images) — Screenshot (1280x800 or 640x400), promotional tile (440x280) dimensions, format requirements
- [developer.chrome.com/docs/webstore/cws-dashboard-privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — Four privacy subsections: single purpose, permission justifications, remote code, data use
- [developer.chrome.com/docs/webstore/best-listing](https://developer.chrome.com/docs/webstore/best-listing) — Summary ≤132 chars, description best practices, keyword guidance
- [developer.chrome.com/docs/webstore/program-policies/listing-requirements/](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) — No keyword spam, no anonymous testimonials, accurate metadata required
- [developer.chrome.com/docs/webstore/program-policies/privacy](https://developer.chrome.com/docs/webstore/program-policies/privacy) — Privacy policy must comprehensively disclose data collection
- [docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) — docs/ folder setup from main branch
- [developer.chrome.com/docs/extensions/reference/api/declarativeContent](https://developer.chrome.com/docs/extensions/reference/api/declarativeContent) — Permission purpose for justification
- [developer.chrome.com/docs/extensions/reference/api/offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — Permission purpose for justification

### Secondary (MEDIUM confidence)
- [developer.chrome.com/docs/webstore/register](https://developer.chrome.com/docs/webstore/register) — $5 one-time developer account fee, confirmed by multiple sources
- [developer.chrome.com/docs/webstore/review-process](https://developer.chrome.com/docs/webstore/review-process) — Review timeline 1–7 days typical, 3 weeks triggers support contact
- [developer.chrome.com/docs/webstore/program-policies/user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — Limited use requirements, data disclosure requirements

### Tertiary (LOW confidence)
- Community reports: Review typically 2–7 days for first submissions; host permission use can extend review — unverified but consistent across multiple developer accounts
- Data use checkbox specific label text (not extractable from official docs page without Dashboard access) — must be confirmed in the actual Dashboard UI

---

## Metadata

**Confidence breakdown:**
- Chrome Web Store submission process: HIGH — verified from official docs
- Image dimensions (screenshots, tile): HIGH — verified from official images doc
- Privacy tab four subsections: HIGH — verified from cws-dashboard-privacy page
- GitHub Pages docs/ setup: HIGH — verified from official GitHub Docs
- Character limits (summary 132, title ≤45): HIGH for summary (official); MEDIUM for title 45-char limit (from REQUIREMENTS.md, standard knowledge; official docs don't state it explicitly)
- Permission justification content: MEDIUM — drafted from API docs; exact wording is Claude's discretion
- Data use checkbox exact options: LOW — structure confirmed, individual label text requires Dashboard access to verify
- Review time estimates: MEDIUM — consistent across multiple community reports and official guidance

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (stable — Chrome Web Store policies change infrequently; check if major policy announcement occurs)

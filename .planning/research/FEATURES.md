# Feature Research

**Domain:** Patent citation Chrome extension for Google Patents
**Researched:** 2026-03-02 (updated for v1.2 milestone: store polish + accuracy hardening)
**Confidence:** MEDIUM (niche domain; no direct competitor does exactly what this tool does; features derived from adjacent tools, patent prosecution workflows, and domain knowledge. Store listing requirements: HIGH confidence from official Chrome developer docs.)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Highlight-to-cite for granted patents (col:line) | Core value proposition. Without this the extension is pointless. Patent attorneys cite granted patents by column and line every day. | HIGH | Requires PDF text-layer parsing, two-column layout detection, line counting, and fuzzy text matching between Google Patents HTML and PDF OCR text. This is the hardest feature and the entire reason the tool exists. |
| Highlight-to-cite for published applications (paragraph) | Published applications use paragraph numbers (e.g., [0045]) instead of col:line. Attorneys work with both document types constantly. | MEDIUM | Paragraph numbers are embedded in the HTML on Google Patents. Much simpler than col:line -- can parse directly from the DOM without PDF processing. |
| One-click copy to clipboard | Citation is useless if you can't instantly paste it into a Word document or office action response. Every productivity extension copies to clipboard. | LOW | Standard Clipboard API. Toast notification confirming copy. |
| Works on Google Patents pages | Google Patents is the de facto free patent reading tool. Extension must activate on patents.google.com and correctly identify the patent/application being viewed. | LOW | Content script URL matching. Parse patent number from URL path. |
| Accurate citation output | These citations go into legal filings submitted to the USPTO and federal courts. Wrong column/line numbers undermine attorney credibility and can cause real legal problems. | HIGH | Confidence indicator when match quality is uncertain. Best-effort fuzzy matching with explicit warnings when confidence is low. |
| Range citations spanning columns | Highlighted text frequently spans column boundaries (e.g., "col. 4, ll. 55-67 to col. 5, ll. 1-10"). Single-column citations are insufficient for real prosecution work. | HIGH | Must detect column breaks within selections and produce multi-column range format. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not expected (nothing like this exists), but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Local browser cache for parsed patents | Avoids re-parsing the same patent PDF every time. Patent attorneys revisit the same references repeatedly during prosecution. Makes subsequent citations instant. | MEDIUM | IndexedDB. Store the column/line map keyed by patent number. Cache invalidation is simple -- granted patents don't change. Already built in v1.0. |
| **Silent clipboard mode (v1.1)** | Power users who live in keyboard-and-clipboard workflows don't want a UI popup interrupting them. Ctrl+C appends the citation to the copied text silently. Zero UI for the happy path. | MEDIUM | See v1.1 section below. Depends on copy event interception via content script. |
| **USPTO eGrant PDF fallback (v1.1)** | ~2-5% of Google Patents pages lack a PDF link, or the PDF lacks a text layer. The USPTO's image-ppubs.uspto.gov provides the authoritative PDF for every granted patent. A Cloudflare Worker proxies the request to hide any rate-limiting or CORS concerns. | MEDIUM-HIGH | See v1.1 section below. Requires Workers proxy. URL pattern is known: `https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{patentNumber}`. |
| **Server-side shared cache (v1.1)** | When one user parses US 10,123,456, all subsequent users benefit from pre-parsed data returned instantly from a Cloudflare KV store. Popular patents effectively never need re-parsing. | MEDIUM | See v1.1 section below. Cloudflare Workers KV. Value is the serialized column/line map JSON, not the raw PDF. |
| Confidence indicator on citations | When fuzzy matching between HTML text and PDF OCR text produces uncertain results, show a visual indicator. Attorneys need to know when to double-check manually. | MEDIUM | Score the text match quality. Display green/yellow/red indicator. Yellow/red = "verify in PDF before filing." Already built in v1.0. |
| Configurable citation format | Different firms and practitioners have preferences: "col. 4, ll. 5-20" vs "4:5-20" vs "column 4, lines 5-20". Let users pick their format. | LOW | Template string with user preferences stored in chrome.storage.sync. Already partially built (prefix option in v1.0). |
| Keyboard shortcut for citation | Power users (attorneys drafting responses) want to highlight, hit a hotkey, and keep typing. Context menu and popup are too slow for high-volume citation work. | LOW | Chrome extension commands API. Default shortcut (e.g., Ctrl+Shift+C) with user override. |
| Support for patent families (same spec, different numbers) | Continuation patents share specification text. Cache can be reused across family members. | LOW | Map patent family relationships via metadata on Google Patents page. Reuse cached column/line maps. |
| Batch citation mode | When drafting an office action response, attorneys often need 5-15 citations from the same patent. A mode that queues multiple highlights and exports them all at once saves significant time. | MEDIUM | Accumulate citations in extension popup. "Copy all" button. Clear list after paste. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Client-side OCR | "What if the PDF has no text layer?" | Massively increases extension size (Tesseract.js is 2-10MB+), slow, inaccurate on patent two-column layouts, and changes the product from "lightweight extension" to "heavy processing tool." Only ~2-5% of modern US patents lack text layers. | Detect missing text layer and show a clear message. Fall back to USPTO eGrant API (built in v1.1). |
| Full citation management/organization | "Let me save and organize all my citations" | Turns a single-purpose tool into a half-baked reference manager. Competes with existing tools (Zotero, EndNote, firm DMS). Massive scope creep. | Copy citation to clipboard. Let users paste into whatever system they already use. The tool's job ends at the clipboard. |
| AI-powered patent summarization | Every patent Chrome extension is adding AI chat. Readpatents Pro Tools charges $20/mo for this. | Completely different product category. Requires LLM API costs, rate limiting, prompt engineering. Distracts from the core value of precise citation generation. | Stay focused. If users want AI summaries, they'll use Petapator or Readpatents. Our tool does one thing perfectly. |
| Non-US patent support (v1) | "I work with EP and JP patents too" | Completely different document formats, column/line conventions, and data sources. Multiplies complexity 3-5x for a feature that can be added later. | Explicitly scope v1 to US granted patents and US published applications. Add international support in v2 if demand warrants. |
| Full patent number in citation output | "Include the patent number in the citation" | The attorney already knows which patent they're citing. Adding the number to every citation creates noise when they need to paste 10 citations from the same patent. Format should match what goes inside parenthetical citations in legal briefs. | Default to col:line only. Optional setting to prepend patent number if users want it. Already built as opt-in in v1.0. |
| Mobile/tablet support | "I read patents on my iPad" | Chrome extensions don't run on mobile browsers. Building a separate mobile app is an entirely different project. | Chrome desktop extension only. This matches the actual workflow -- attorneys draft responses on desktop. |
| Inline PDF viewer/annotator | "Show me the PDF column layout" | Turns the extension into a PDF viewer. Google Patents already shows the PDF. Major scope creep. | Link to the specific PDF page on Google Patents when confidence is low, so the user can visually verify. |
| Always-on copy interception | "Intercept every Ctrl+C on the page" | If the copy listener is always active, non-patent-text copies (e.g., copying a URL, an email address, a claim number) get appended with a citation. Users will immediately notice and feel the extension is broken or hostile. | Silent mode must only intercept copies made while a valid text selection exists AND the extension has successfully computed a citation. Gate on citation availability, not on every copy event. |
| Store raw PDFs in KV | "Cache the PDF in Cloudflare so we don't hit USPTO repeatedly" | KV max value is 25 MiB. Patent PDFs are 5-30 MB compressed and up to 100+ MB uncompressed. PDF blobs belong in R2, not KV. Also: parsing happens client-side; what we share is the already-parsed data structure. | Store the JSON column/line map in KV (typically under 100 KB), not the PDF. Client still fetches the PDF once, parses it, then uploads the map to KV for other users. |

---

## v1.1 Milestone: New Features Detail

### Feature 1: Silent Clipboard Mode

**What it does:** When the user presses Ctrl+C (or uses any copy action) while text is selected on a Google Patents page AND the extension has already computed a citation for that selection, the clipboard receives `{selected text}\n{citation}` instead of just the selected text. No popup appears. If confidence is low or no match was found, a small toast appears to alert the user.

**Expected behavior:**
- User selects text, extension computes citation in background (same as today's auto mode)
- User presses Ctrl+C
- Clipboard contains selected text + newline + citation string (e.g., `"the electrode layer comprises..." \n5:45-52`)
- No UI opens, no interruption
- If citation confidence is low (yellow) or failed (red): a small, auto-dismissing toast appears (2-3 seconds) explaining the issue — "Citation uncertain (yellow confidence) — verify before filing" or "No match found — copied text only"
- If patent data not yet loaded: clipboard gets text only, toast says "Patent not yet parsed"

**Mechanism (HIGH confidence — verified with MDN):**
- Content script registers `document.addEventListener('copy', handler)` in the page context
- Handler reads `window.getSelection().toString()` to get selected text
- Handler checks if a pending citation result exists for that selection (stored in a module-level variable by the existing citation pipeline)
- If citation available: calls `event.clipboardData.setData('text/plain', selectedText + '\n' + citation)` then `event.preventDefault()`
- The `clipboardWrite` permission in manifest.json enables this without requiring transient activation
- This works on HTTPS pages only (Google Patents is HTTPS, so no issue)

**Key edge cases:**
- User selects text, citation is computing, user copies before result arrives: copy text only, toast "Citation not ready — still parsing"
- User selects text in a non-patent area (claim section, title): copy text only, no citation appended
- User selects across page regions where no match is possible: copy text only, toast if the UI would have shown red
- Extension disabled or patent not supported: copy listener must be a no-op; it cannot throw or intercept
- User has silent mode OFF (default: floating-button or auto mode): copy listener must NOT intercept. Gate the entire behavior on triggerMode === 'silent'

**UX principle:** Silent mode must truly be silent on success. Toasts should only appear on failure/uncertainty. If the toast fires too often, users will disable the feature or uninstall.

**Complexity:** MEDIUM. The copy event interception is well-understood. The hard part is coordinating state between the citation pipeline (which runs asynchronously) and the copy listener (which fires synchronously on user action). A module-level `pendingCitation` object keyed by selected text solves this.

**Dependency on existing code:** The citation pipeline already computes results and returns confidence levels. Silent mode is a new trigger path that reads those results instead of showing them in the Shadow DOM UI.

---

### Feature 2: USPTO eGrant PDF Fallback via Cloudflare Workers

**What it does:** When Google Patents doesn't provide a PDF download link (or the PDF has no text layer), the extension fetches the patent PDF from USPTO's public image server via a Cloudflare Worker proxy. The Worker acts as a passthrough that adds appropriate headers and hides any future API key or rate-limit concerns from the extension.

**Why a proxy is needed:**
- Direct fetches from the extension to `image-ppubs.uspto.gov` may face CORS restrictions (patent PDFs are served with varying CORS policies; the extension can bypass most via manifest host_permissions, but a Worker provides a stable abstraction)
- USPTO rate limits: 10,000 requests/day per IP. The Worker's Cloudflare IP pool provides rotation and a place to add rate-limit handling without extension code changes
- If USPTO ever requires an API key, the Worker holds it as a secret (via `wrangler secret put`); the extension never sees it
- Future: the Worker can serve from KV cache before hitting USPTO at all

**USPTO PDF URL pattern (MEDIUM confidence — corroborated by official USPTO QRG document):**
```
https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/{patentNumber}
```
- 7-digit utility patents: zero-padded to 7 digits (e.g., `0987654`)
- 8-digit utility patents: as-is (e.g., `10123456`)
- Design patents: `D` prefix + 6 digits (e.g., `D987654`)
- Plant patents: `PP` prefix + 5 digits (e.g., `PP12345`)

**Worker responsibilities:**
1. Accept request: `GET /pdf/{patentNumber}`
2. Validate patent number format (prevent abuse)
3. Construct USPTO URL and proxy the response
4. Return PDF bytes to extension (which already handles PDF parsing via offscreen document)
5. Later: check KV for cached column/line map before fetching PDF at all

**Complexity:** MEDIUM-HIGH. The Worker itself is simple (15-30 lines of JavaScript). The complexity is in:
- Deployment and wrangler configuration
- Integrating the fallback into the existing service-worker.js fetch flow without breaking the Google Patents PDF path
- Handling the "no text layer" condition explicitly so users get useful error messages

**Dependency on existing code:** The offscreen document PDF fetching code already handles arbitrary PDF URLs. The fallback just supplies a different URL source. Service-worker.js needs a new code path: if Google Patents PDF link missing, call Worker, get USPTO PDF URL, proceed with existing parse flow.

---

### Feature 3: Server-Side Shared Cache (Cloudflare Workers KV)

**What it does:** When a user's extension parses a patent (building the column/line map), it uploads the resulting JSON to a Cloudflare Worker endpoint. Subsequent users who navigate to the same patent get the pre-parsed map from KV instead of re-parsing the PDF. This makes citations near-instant for any patent that has been seen before.

**Why KV (not R2, not D1):**
- KV is optimized for high-read, low-write workloads with low-latency global reads (typically <10ms for hot keys). Parsed patent data is read many times (every user who views that patent) and written once (first parse). This is the exact KV use case.
- R2 is for large blobs. The parsed column/line map JSON is typically under 100 KB. It belongs in KV.
- D1 (SQLite) adds query complexity with no benefit for a simple key-value lookup by patent number.

**Data stored in KV:**
- Key: patent number string (e.g., `"US10123456B2"`)
- Value: JSON-serialized column/line map (same structure already produced by the offscreen document parser)
- TTL: none needed. Granted patents are immutable. The column/line map for a granted patent will never change.
- Metadata: parse timestamp, extension version that produced the data (for future cache busting if the parser changes)

**KV limits (HIGH confidence — verified with official Cloudflare docs):**
- Max value size: 25 MiB (column/line map JSON is <<1 MiB; no issue)
- Free tier: 100,000 reads/day, 1,000 writes/day, 1 GB total storage
- Write frequency limit: 1 write/second to the same key (not a concern; each key is written once ever)
- Key size: 512 bytes max (patent number strings are well under this)

**Free tier sustainability estimate:** Assuming 500 active users, each viewing 5 unique patents/day = 2,500 reads/day. Writes are even rarer (only first parse of each patent). Free tier is sufficient for early adoption; paid tier ($5/mo) handles ~10M reads/month at scale.

**Worker endpoints needed:**
- `GET /cache/{patentNumber}` — return cached map (200 with JSON) or 404
- `POST /cache/{patentNumber}` — store parsed map (with simple auth token to prevent arbitrary writes)

**Complexity:** MEDIUM. KV read/write is simple. The complexity is in:
- Designing the Worker with two endpoints and minimal auth
- Integrating the cache check into service-worker.js without blocking the fast path (local IndexedDB)
- Schema versioning: if the column/line map format changes in a future extension version, old cached data may be incompatible. Store a `schemaVersion` field in the KV value.

**Dependency on existing code:** The parsed column/line map is already a well-defined JS object produced by the offscreen document. The Worker just stores and returns this. Local IndexedDB caching already exists as the first-check layer. Shared KV is the second layer.

---

## v1.2 Milestone: Store Polish + Accuracy Hardening

### Group 1: Extension Icon Set

**What it does:** Replaces the current icon set with a properly designed professional icon at all required sizes.

**Current state:** The extension already has active/inactive icon variants at 16/48/128px. The manifest action uses inactive icons for the toolbar; the general icons section uses active icons. The 32px size is missing from the manifest icon declaration (it is an optional but recommended size for some display contexts in Chrome).

**Required icon sizes (HIGH confidence — Chrome for Developers official docs):**

| Size | Purpose | Mandatory? |
|------|---------|------------|
| 16px | Toolbar action icon (default and small display) | YES — in manifest `action.default_icon` |
| 32px | Windows OS display, some DPI scaling contexts | RECOMMENDED — include in manifest `icons` |
| 48px | Extensions management page (chrome://extensions) | YES — in manifest `icons` |
| 128px | Chrome Web Store listing, installation dialog | YES — both `icons` and `action.default_icon` (for store banner) |

**Store promotional images (HIGH confidence — developer.chrome.com/docs/webstore/images):**

| Asset | Size | Mandatory? | Notes |
|-------|------|-----------|-------|
| Small promotional tile | 440x280 | YES (affects search ranking) | "Extensions lacking a small promotional image display lower in search results." Keep design clean, saturated colors, minimal text. Works at half size. |
| Marquee promotional image | 1400x560 | NO | Used when featured by Google. Nice to have but not a blocker. |

**Store icon (for the store listing itself):**
- 128x128 PNG with transparent padding (96x96 artwork + 16px transparent padding per side per store guidelines)
- Must "work well on both light and dark backgrounds"
- Simple and recognizable at all sizes; no screenshots or fine UI details

**Design principles:**
- Front-facing, minimal perspective
- No large drop shadows or edge frames
- Recognizable at 16x16 pixels (where it will appear in the toolbar for most users)
- Consistent visual language between active and inactive states (inactive = muted/grayed)

**Complexity:** LOW. This is graphic design work, not code. However, the active/inactive distinction requires two icon sets (or two color-scheme variants).

**Dependency on existing code:** Manifest already references all icon files correctly. New PNG files just need to match the existing paths. Adding 32px requires adding the key to the manifest `icons` object.

---

### Group 2: Options Page UX Polish

**What it does:** Cleans up the options page to meet professional standards before public store release.

**Current state:** Options page exists (popup.html + popup.js handle settings). The UI allows configuring trigger mode, patent prefix setting. Needs visual polish before a professional audience sees it.

**Table stakes for options pages in Chrome extensions (MEDIUM confidence — multiple UX sources, Chrome extension design guides):**

| Element | Requirement | Notes |
|---------|------------|-------|
| Settings persistence | chrome.storage.sync (not just localStorage) | sync means settings follow user across devices — expected by professionals |
| Clear section labels | Group related settings under descriptive headings | Users should immediately understand what each setting does |
| Save feedback | Confirm when settings are saved (toast or status text) | "Saved" indicator prevents doubt about whether click registered |
| Consistent visual style | Matches extension icon/color palette | 86% of users decide within minutes whether to keep an extension; visual consistency signals quality |
| Link to privacy policy | Required for store listing; users expect it in options | Must be clickable link to actual policy URL |
| Extension version display | Users reporting bugs need to know their version | Display from chrome.runtime.getManifest().version |
| Help/feedback link | Professional tools always have a support path | Simple email or GitHub issues link |

**Anti-features to avoid in options UX:**
- Don't make options page look like a popup that opened in a tab (common mistake — options page should have more width and a different layout register)
- Don't auto-apply settings without clear Save button (confusing for non-obvious settings like trigger mode)
- Don't hide help text — professionals new to the tool need to understand trigger modes on first view

**Complexity:** LOW. Primarily CSS, minor JS changes. No architecture changes.

**Dependency on existing code:** popup.html/popup.js already exist with settings persistence. Polish is additive.

---

### Group 3: Chrome Web Store Listing Package

**What it is:** The complete set of assets and metadata needed to publish to the Chrome Web Store. This is a one-time creation task before first public listing submission.

**Mandatory elements (HIGH confidence — official Chrome Web Store policy docs):**

| Element | Requirement | Rejection risk if missing |
|---------|------------|--------------------------|
| Extension description | Non-blank, accurate, in-depth overview. Recommended format: overview paragraph + feature bullet list. Max: store enforced. Summary: ≤132 characters. | YES — blank description causes rejection |
| Extension icon | 128x128 PNG (covered in Group 1) | YES |
| Screenshots | Minimum 1, maximum 5. Sizes: 1280x800 or 640x400. Square corners, no padding. Must show actual extension behavior, not mockups or stock photos. | YES — missing screenshots causes rejection |
| Small promotional tile | 440x280 (covered in Group 1) | NO rejection risk, but lowers search ranking |
| Privacy policy URL | Required if any user data is handled. This extension: clipboard text is processed locally; Cloudflare Worker receives patent numbers (not personal data). Still best practice to have a policy. | Required if extension handles personal/sensitive data — patent numbers from URLs are borderline; include policy to be safe |
| Category | Select most appropriate: "Productivity" is correct for this tool | Not a rejection risk but affects discoverability |
| Developer contact | Email or support URL | Required for publisher account; not in listing itself |

**Description content guidance (HIGH confidence — developer.chrome.com/docs/webstore/best-listing):**
- Lead with the core value in the first sentence (the summary ≤132 chars that appears in search results)
- Follow with a feature list: 4-6 bullets covering the key capabilities
- Use keywords naturally — not spammy repetition (keyword spam causes suspension)
- Do not mention competitors by name
- Keep it accurate and current — the listing must match current behavior
- Avoid generic praise ("powerful", "easy to use") without specifics

**Screenshot guidance:**
- Show real citation being generated from highlighted text
- Cover both use cases: granted patent (col:line) and published application (paragraph)
- Show the confidence indicator in action (green for good match)
- Consider one screenshot showing options page (demonstrates configurability)
- Optional: screenshot of silent mode workflow (Ctrl+C + toast)
- Recommended: include call-out annotations explaining what's happening (arrows/labels are permitted)

**Privacy policy requirements (MEDIUM confidence — Chrome Web Store policy docs + standard practice):**
What this extension collects and how:
- Patent numbers from URL path (read-only, not stored server-side beyond KV cache lookup)
- Selected text from Google Patents pages (processed locally in-browser only; never transmitted)
- Cloudflare Worker receives: patent number as URL parameter (not personal data)
- chrome.storage.sync: user preferences (trigger mode, prefix setting) — stored by Google per their sync policy
The privacy policy must accurately describe all of this. A simple single-page policy at a stable URL (GitHub Pages or Cloudflare Pages) is sufficient.

**Complexity:** MEDIUM for screenshots (requires careful staging on real patents). LOW for description text and privacy policy. Icon work covered in Group 1.

**Timing:** Chrome Web Store review takes 2-7 days for new submissions. Plan accordingly. No "fast track" mechanism exists.

---

### Group 4: Automated Citation Test Harness

**What it is:** A Node.js test suite that runs matchAndCite() against a curated set of known-good (patent, selection text, expected citation) triples, measures pass rate and confidence distribution, and generates a summary report.

**Why this approach and not browser/Playwright end-to-end tests:**
- End-to-end browser tests (Puppeteer/Playwright with MV3 extension loaded) require headed Chromium, persistent browser context, and page navigation to Google Patents. They are slow (30-60s per test case) and flaky (network dependency, Google Patents DOM changes).
- The matching algorithm (matchAndCite, fuzzySubstringMatch, levenshtein, whitespaceStrippedMatch) is pure functions operating on string data. These can be extracted and tested in Node.js without a browser.
- The PDF parsing pipeline (offscreen document + PDF.js) is harder to test in Node.js because it depends on the Chrome offscreen API. The practical approach: save parsed position maps (JSON) as fixtures, test the matching layer against those fixtures.

**Test harness design — golden dataset pattern (MEDIUM confidence — well-established in document processing testing; multiple sources):**

```
tests/
  fixtures/
    US10123456B2/
      position-map.json     # saved output of PDF parser for this patent
      test-cases.json       # array of { selection, expectedCitation, expectedConfidence }
    US7654321B1/
      position-map.json
      test-cases.json
    US20190123456A1/        # published application — paragraph citations
      dom-snapshot.html     # saved DOM state for paragraph finder
      test-cases.json
  harness/
    run-tests.mjs           # entry point
    test-matcher.mjs        # imports matchAndCite from src/content/text-matcher.js
    test-paragraph.mjs      # imports paragraphFinder logic
    report.mjs              # generates summary stats
```

**test-cases.json schema:**
```json
[
  {
    "id": "spec-long-selection-span-column",
    "description": "Long selection spanning column 4-5 boundary",
    "selectionText": "the electrode layer comprises...",
    "expectedCitation": "4:55-5:10",
    "expectedConfidenceMin": 0.90,
    "tags": ["spec", "cross-column", "long"]
  }
]
```

**Accuracy metrics that matter for this domain (HIGH confidence — standard for document matching):**

| Metric | Definition | Target | Why It Matters |
|--------|-----------|--------|----------------|
| Citation match rate | % of test cases producing any citation (not red/fail) | >95% | Basic functionality coverage across patent types |
| Exact citation accuracy | % of citations matching expected exactly | >90% | Citations go into legal filings — wrong = professional error |
| Off-by-one tolerance | % correct within 1 line | Track separately | Reveals systematic line-counting bugs vs. total misses |
| Confidence calibration | When confidence is green (≥0.90), is the citation correct? | >99% | Green must mean "safe to file" — this is the most critical metric |
| Yellow false positive rate | % of yellow-confidence citations that are actually wrong | <20% | Yellow = "verify this" — if yellow citations are usually wrong, it's a useful signal |
| Failure mode distribution | Categorize failures: no-match, wrong-column, off-by-N-lines, punctuation divergence | -- | Informs which algorithm path to fix |

**Precision/recall framing** (MEDIUM confidence — adapted from standard IR metrics):
- Precision: of all citations the extension reports as green-confidence, what fraction are actually correct?
- Recall: of all test cases, what fraction does the extension successfully cite at any confidence?
- F1 is less relevant here because precision (especially at green) matters far more than recall for a legal filing tool.

**Test case sampling strategy — breadth matters:**
Cover known variation axes to catch systematic failures:

| Axis | Variants to Include |
|------|-------------------|
| Patent era | Pre-2000 (older OCR quality), 2000-2010, 2010-present |
| Selection length | Short (5-20 words), medium (20-80 words), long (80+ words) |
| Document section | Specification body, claims, abstract, brief description of drawings |
| Column boundary | Within column, spanning boundary, near top/bottom of column |
| Text character type | Plain text, hyphenated words, numbers/formulae, ligatures (fi, fl) |
| Fuzzy match tier | Exact match, whitespace-stripped, punctuation-agnostic, bookend, Levenshtein |
| Application type | Granted utility patent, published application (paragraph citations) |

Recommended minimum: 30-50 test cases across these axes. At that scale, the harness runs in under a second.

**How to create test cases (the laborious but necessary part):**
1. Navigate to a test patent on Google Patents
2. Select text in the specification
3. Note the citation the extension produces (col:line)
4. Verify in the actual PDF: is that column and line correct?
5. If correct, save as a golden test case; if wrong, save as a failing test case to fix
6. Export the position map JSON from IndexedDB for that patent (via DevTools) and save as fixture

**Complexity:** MEDIUM. Writing the harness runner is LOW complexity. The laborious part is creating the golden test cases (manual verification in PDFs) and saving the position map fixtures. Plan for 2-3 hours of manual work across 30-50 test cases.

**Dependency on existing code:** The matching functions in content/text-matcher.js must be importable as ES modules from Node.js. Current architecture uses classic script globals. Two options:
- Option A: Refactor text-matcher.js to export functions (requires addressing the "dual-context constants" tech debt flagged in PROJECT.md). Medium complexity, improves overall code quality.
- Option B: Copy the functions into a separate test-only module with ESM exports (avoids touching content scripts but creates maintenance burden). Low complexity, creates tech debt.

Recommendation: Option A. The v1.2 milestone is the right time to address the dual-context constants tech debt. Build step (Rollup/esbuild) solves both the testing problem and the duplicated-functions problem noted in PROJECT.md.

---

### Group 5: Accuracy Audit and Algorithm Fixes

**What it is:** A systematic manual audit across a broad patent sample, followed by targeted algorithm improvements based on what the audit reveals.

**Audit dimensions — patent sampling plan:**

| Category | Examples | Failure hypothesis |
|----------|---------|-------------------|
| Short specifications (< 20 columns) | Early utility patents, design patents | Column numbering logic may mis-count |
| Long specifications (> 100 columns) | Complex semiconductor/biotech patents | Line number overflow, performance |
| Claims section selections | Independent/dependent claims | Claims section detection may fail on some formats |
| Abstract selections | Very short, at document start | Position map boundaries near doc start |
| Old patents (pre-1990) | Poor OCR quality, different formatting | Ligature/character substitution errors |
| Patents with special characters | Chemical formulas, mathematical notation | Normalization may over-strip |
| Patents with extreme line density | 70+ lines per column | Y-coordinate clustering tolerance too tight |
| Published applications | [XXXX] paragraph markers | DOM-based; check on various app types |

**Known algorithm weaknesses from PROJECT.md (to specifically test and fix):**

| Weakness | Root cause | Fix approach |
|----------|-----------|-------------|
| Long selections (>500 chars) fail when texts genuinely diverge | Bookend matching uses first/last 50 chars, but HTML and PDF text can diverge at different points in long passages | Sliding window bookend: try multiple anchor points within the first/last 150 chars |
| Levenshtein sliding window is slow on large haystrings | O(nm) per window position | Limit haystack to relevant section (identify approximate region first, then do Levenshtein within ±20 lines of that region) |
| Dual-context constants module causes bugs | Same file used as classic script and ES module | Build step (Rollup/esbuild) that produces two output formats |
| Duplicated matching functions (content + offscreen) | Offscreen ES module cannot share classic script globals | Resolved by build step |

**Accuracy improvement algorithm options (MEDIUM confidence — from fuzzy matching literature and PDF parsing research):**

| Improvement | When to apply | Expected impact |
|-------------|--------------|----------------|
| Expand bookend window from 50 to 100 chars | Long selection failures | Reduces long-selection miss rate |
| Sliding bookend (try multiple anchor points) | Long selection failures where divergence point varies | Catches cases where first 50 chars are also divergent |
| Normalize ligatures more aggressively (fi→fi, fl→fl, ff→ff, ffi→ffi, ffl→ffl, plus Unicode ligature variants) | Old patent OCR | Reduces substitution-error misses |
| Pre-filter haystack to approximate region before Levenshtein | Performance on long specs | Makes fuzzy match usable on >80 char selections |
| Improve bimodal column detection threshold | Mis-classified cover/figure pages counted as spec | Reduces column number offset errors |
| Tighten line-grouping Y-tolerance on high-density patents | Off-by-one errors on dense specs | Improves line accuracy on modern patents |

**How to prioritize fixes:** Run the automated test harness after each fix. Accept a fix only if it improves pass rate without regressing other test cases. Reject changes that trade one failure mode for another.

**Complexity:** MEDIUM-HIGH for algorithm fixes. The audit itself is LOW complexity (systematic but manual). Each algorithm fix requires understanding the existing code path deeply. Estimate 1-2 days of audit, 2-4 days of algorithm iteration.

**Dependency on existing code:** All algorithm work is in content/text-matcher.js and offscreen/pdf-parser.js. The test harness (Group 4) must be in place before systematic algorithm improvement is possible — otherwise you are fixing blind.

---

## Feature Dependencies

```
[PDF Text Layer Parsing] (v1.0)
    |
    +--requires--> [Column/Line Map Generation] (v1.0)
    |                   |
    |                   +--requires--> [Highlight-to-Cite (Granted Patents)] (v1.0)
    |                   |                   |
    |                   |                   +--enhances--> [Range Citations] (v1.0)
    |                   |
    |                   +--produces--> [Local IndexedDB Cache] (v1.0)
    |                   |                   |
    |                   |                   +--enhances--> [Server-Side KV Cache] (v1.1)
    |                   |
    |                   +--drives--> [Silent Mode toast logic] (v1.1)
    |
    +--independent--> [Highlight-to-Cite (Published Applications)] (v1.0)
                          (parses paragraph numbers from HTML DOM, no PDF needed)

[USPTO eGrant PDF Fallback] (v1.1)
    |
    +--feeds-into--> [PDF Text Layer Parsing] (replaces Google Patents PDF source)
    |
    +--feeds-into--> [Server-Side KV Cache] (Worker checks KV before fetching USPTO PDF)

[Silent Clipboard Mode] (v1.1)
    |
    +--requires--> [Citation pipeline result] (existing -- citation already computed)
    +--requires--> [Copy event interception] (new content script listener)
    +--requires--> [Confidence level signal] (existing -- already produced by fuzzy matcher)
    +--conflicts--> [Floating-button mode] (mutually exclusive trigger modes)
    +--conflicts--> [Auto mode] (mutually exclusive trigger modes)

[Clipboard Copy] --required-by--> [All citation features]

[Fuzzy Text Matching] --required-by--> [Highlight-to-Cite (Granted Patents)]
                      --produces--> [Confidence Indicator]
                      --feeds--> [Silent Mode toast threshold]

[Configurable Citation Format] --enhances--> [All citation output]

[Keyboard Shortcut] --enhances--> [All citation features]

[Batch Citation Mode] --requires--> [Any citation feature working]

--- v1.2 additions ---

[Extension Icon Set] (v1.2)
    |
    +--required-by--> [Chrome Web Store Listing] (store listing requires 128px icon)
    +--required-by--> [Options Page Polish] (visual consistency requires finalized icon)

[Options Page Polish] (v1.2)
    +--independent--> [Chrome Web Store Listing] (listing doesn't require polish, but polish supports quality signal)
    +--requires--> [Extension Icon Set] (visual consistency)

[Chrome Web Store Listing] (v1.2)
    |
    +--requires--> [Extension Icon Set] (icon required for listing approval)
    +--requires--> [Privacy Policy URL] (required for extensions handling user data)
    +--requires--> [Screenshots] (missing screenshots = rejection)

[Automated Test Harness] (v1.2)
    |
    +--requires--> [Build Step / ESM refactor] (text-matcher.js must be importable in Node.js)
    +--required-by--> [Accuracy Audit + Algorithm Fixes] (fixes must be validated by harness)

[Accuracy Audit + Algorithm Fixes] (v1.2)
    +--requires--> [Automated Test Harness] (can't safely fix without regression testing)
    +--improves--> [All citation features] (better matching benefits all patent types)
```

### Dependency Notes

- **Test harness requires ESM refactoring of text-matcher.js:** The matching functions are currently loaded as classic scripts with global scope. Node.js test runner needs ESM imports. This is the same tech debt (dual-context constants module) flagged in PROJECT.md. A Rollup/esbuild build step resolves both.
- **Store listing requires finalized icons:** Do not submit to store with placeholder icons — once listed, changing icons requires another review cycle. Get icon design right first.
- **Algorithm fixes require the test harness to exist first:** Fixing blind (without a regression test suite) risks breaking working cases while fixing failing ones. Harness before fixes is a hard dependency.
- **Accuracy audit and algorithm fixes are iterative:** Not a single pass. Run harness, fix top failure mode, re-run harness, fix next failure mode. Budget 3-4 iterations.
- **Silent mode requires the citation pipeline to have already run:** The copy event fires synchronously; the citation must already be computed and stored in a module-level variable before the user presses Ctrl+C. In practice, citations compute in 50-500ms after selection; the user typically copies seconds later. Edge case: immediate copy before pipeline completes must fall back to text-only copy.
- **Server-side KV cache depends on the column/line map schema being stable:** Before deploying the Worker, freeze the serialization format and add a `schemaVersion` field. Backwards-incompatible parser changes require KV cache invalidation.
- **Published application citations are independent of PDF parsing:** Paragraph numbers are in the Google Patents HTML. This shipped in v1.0 and is unaffected by v1.2 changes.

## MVP Definition

### Already Shipped (v1.0)

- [x] **Highlight-to-cite for granted patents (col:line)**
- [x] **Highlight-to-cite for published applications (paragraph)**
- [x] **One-click clipboard copy with toast notification**
- [x] **Range citations spanning columns**
- [x] **Confidence indicator (green/yellow/red)**
- [x] **Local browser cache (IndexedDB)**
- [x] **Configurable trigger mode (floating-button, auto, context menu)**
- [x] **Optional patent number prefix**

### Already Shipped (v1.1)

- [x] **Silent clipboard mode** — Zero-UI citation append on Ctrl+C for power users. Toast only on failure/uncertainty. Mutually exclusive with floating-button and auto modes.
- [x] **USPTO eGrant PDF fallback via Cloudflare Worker** — Unblocks the ~2-5% of patents where Google Patents PDF link is absent or broken. Worker proxies `image-ppubs.uspto.gov`. Secrets held server-side.
- [x] **Server-side shared KV cache** — Parsed column/line maps stored in Cloudflare KV. First user parses; all subsequent users get instant results. Free tier (100K reads/day) sufficient for early user base.

### v1.2 Milestone (Current — Store Polish + Accuracy Hardening)

- [ ] **Extension icon set** — Professional icon at 16/32/48/128px in active and inactive variants. Required for store submission. LOW complexity (design work, not code).
- [ ] **Options page UX polish** — Settings persistence, clear labels, save feedback, privacy policy link, version display. LOW complexity.
- [ ] **Chrome Web Store listing package** — Description, 1-5 screenshots, small promotional tile (440x280), privacy policy URL, category selection. MEDIUM complexity (screenshot staging is laborious).
- [ ] **Automated citation test harness** — Node.js runner, 30-50 golden test cases, accuracy metrics report. Requires ESM refactor of text-matcher.js. MEDIUM complexity.
- [ ] **Manual accuracy audit** — Systematic testing across patent types, eras, sections. 2-3 hours manual work. LOW/MEDIUM complexity (time-consuming, not technically hard).
- [ ] **Algorithm improvements** — Based on audit findings. Address bookend window size, ligature normalization, haystack pre-filtering. MEDIUM-HIGH complexity, depends on test harness.

### Add After Validation (v1.x)

- [ ] **Configurable citation format** -- Add when users request specific format variations. Start with one sensible default.
- [ ] **Keyboard shortcut** -- Add when power users report the popup workflow is too slow.
- [ ] **Batch citation mode** -- Add when users report needing multiple citations from the same patent in rapid succession.
- [ ] **Patent family cache reuse** -- Add when the caching layer is stable and family metadata parsing is understood.

### Future Consideration (v2+)

- [ ] **Non-US patent support** -- Different document formats, different citation conventions. Only pursue if significant demand.
- [ ] **Integration with patent drafting tools** -- ClaimMaster, PatentOptimizer integration would require partnership discussions and API work.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Extension icon set | HIGH (store gating) | LOW | P1 (v1.2) |
| Store listing package | HIGH (store gating) | MEDIUM | P1 (v1.2) |
| Automated test harness | HIGH (quality gating) | MEDIUM | P1 (v1.2) |
| Options page polish | MEDIUM | LOW | P1 (v1.2) |
| Manual accuracy audit | HIGH (legal filing accuracy) | LOW/MEDIUM | P1 (v1.2) |
| Algorithm improvements | HIGH (legal filing accuracy) | MEDIUM-HIGH | P1 (v1.2) — depends on harness |
| Configurable citation format | MEDIUM | LOW | P2 |
| Keyboard shortcut | MEDIUM | LOW | P2 |
| Batch citation mode | MEDIUM | MEDIUM | P2 |
| Patent family cache reuse | LOW | LOW | P3 |
| Non-US patents | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

No tool does exactly what this extension does. The competitive landscape is adjacent tools that solve related problems.

| Feature | Readpatents Pro Tools | Petapator | ClaimMaster | Patlytics | Our Approach |
|---------|----------------------|-----------|-------------|-----------|--------------|
| Column:line citation from text selection | No | No | Finds spec support for claim terms (Word plugin, not browser) | Scroll-to-citation in their platform (not browser extension) | Core feature. Highlight on Google Patents, get citation. |
| Paragraph citation (pub apps) | No | No | Paragraph-level in Word | N/A | Core feature. Parse from DOM. |
| Silent/background clipboard workflow | No | No | No | No | v1.1 differentiator. Ctrl+C appends citation silently. |
| Fallback data source when primary fails | No | No | No | N/A | v1.1 feature. USPTO eGrant via Worker proxy. |
| Cross-user shared cache | No | No | No | N/A | v1.1 feature. Cloudflare KV. |
| Store listing quality | N/A | N/A | N/A | N/A | v1.2 focus. Professional icon, screenshots, description. |
| Accuracy test coverage | N/A | N/A | N/A | N/A | v1.2 focus. Golden dataset, automated harness. |
| AI patent chat/summary | Yes ($20/mo) | Yes (LLM-powered) | No | Yes | Explicitly NOT building this. |
| Global Dossier integration | Yes | No | No | N/A | Not building. Out of scope. |
| Keyword highlighting | Yes | No | Yes (in Word) | N/A | Not building. Out of scope. |
| Claim charting | No | No | Yes | Yes | Not building. Different product. |
| Office action response tools | No | No | Yes | Yes | Not building. Different product. |
| Price | $20/mo | Free (limited) | $500-1500/yr | Enterprise | Free or very low cost. Single-purpose tool. |
| Platform | Chrome extension | Chrome extension | Word plugin | Web platform | Chrome extension |

**Key insight:** No existing tool generates column:line citations from text selections on Google Patents. The closest capability is Patlytics' "Scroll to Citation" which works in reverse (given a citation, scroll to it) and only within their proprietary platform. ClaimMaster finds specification support for claim terms but operates in Word, not the browser, and produces paragraph-level references rather than precise column:line citations.

This is a genuine gap in the market. Patent attorneys currently do this manually: open PDF, find the text, count the column and line numbers, type the citation. Every patent attorney does this dozens of times per week.

## Sources

- [Creating a great listing page - Chrome for Developers](https://developer.chrome.com/docs/webstore/best-listing) — Title, description, summary requirements; screenshot content guidance; promotional image guidance (HIGH confidence)
- [Supplying Images - Chrome for Developers](https://developer.chrome.com/docs/webstore/images) — Exact pixel dimensions for icons (128x128), promotional tiles (440x280, 1400x560), screenshots (1280x800 or 640x400) (HIGH confidence)
- [Listing Requirements - Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) — Mandatory fields, rejection criteria, keyword spam prohibition (HIGH confidence)
- [Complete your listing information - Chrome for Developers](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) — Dashboard field requirements, category selection (HIGH confidence)
- [Configure extension icons - Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) — Icon size requirements for manifest v3 (16, 32, 48, 128px), action vs general icons (HIGH confidence)
- [Manifest Icons - Chrome Extensions Reference](https://developer.chrome.com/docs/extensions/reference/manifest/icons) — Manifest icon declaration syntax (HIGH confidence)
- [Updated Privacy Policy requirements - Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — Privacy policy requirements when handling user data (HIGH confidence)
- [Privacy Policies - Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/privacy) — When privacy policy is required, what it must cover (HIGH confidence)
- [Chrome Web Store review timeline - codegenes.net](https://www.codegenes.net/blog/google-chrome-extension-review-time-process/) — 2-7 day average review time for new submissions (MEDIUM confidence — developer reports, not official)
- [5 UX Tips for Designing a Chrome Extension - Medium/DesignIQ](https://medium.com/iq-design/5-ux-tips-for-designing-a-chrome-extension-5b1d42ee796f) — Options page layout principles (MEDIUM confidence)
- [F1 Score as balanced accuracy metric - Springer Nature 2025](https://link.springer.com/article/10.1186/s40537-025-01313-4) — F1 score vs accuracy vs precision/recall for evaluation (MEDIUM confidence — peer reviewed 2025)
- [Golden Datasets for AI Evaluation - The Foundation](https://medium.com/@federicomoreno613/golden-datasets-the-foundation-of-reliable-ai-evaluation-486ce97ce89d) — Golden test set design: input/output pairs, metadata, annotation guidelines (MEDIUM confidence)
- [Text Harness Design Patterns - Microsoft Learn](https://learn.microsoft.com/en-us/archive/msdn-magazine/2005/august/test-run-test-harness-design-patterns) — Lightweight data-driven harness design, flat file test case storage (MEDIUM confidence)
- [Playwright Chrome Extension Testing - BrowserStack](https://www.browserstack.com/guide/playwright-chrome-extension) — Why E2E browser tests for extensions are complex (headed Chromium only, persistent context required) (MEDIUM confidence)
- [Testing Chrome Extensions with Puppeteer - Chrome for Developers](https://developer.chrome.com/docs/extensions/mv3/tut_puppeteer-testing/) — Official MV3 testing tutorial, service worker suspension considerations (HIGH confidence)
- [Solving direct text extraction from PDFs - Sensible Blog](https://www.sensible.so/blog/solving-direct-text-extraction-from-pdfs) — Common failure modes in PDF text extraction: whitespace divergence, line over/under-splitting (MEDIUM confidence)
- [MDN: Element copy event](https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event) — copy event interception, clipboardData.setData, preventDefault behavior (HIGH confidence)
- [MDN: Interact with the clipboard (WebExtensions)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard) — clipboardWrite permission, content script clipboard access (HIGH confidence)
- [Cloudflare KV Limits](https://developers.cloudflare.com/kv/platform/limits/) — max value 25 MiB, 100K reads/day free tier, 1K writes/day free tier, 1 write/sec per key (HIGH confidence)
- [Pro Tools for Google Patents by Readpatents - Chrome Web Store](https://chromewebstore.google.com/detail/pro-tools-for-google-pate/fihfgahhogpkacefgklikaceebipmdjk)
- [Petapator](https://petapator.com/)
- [ClaimMaster - Finding Text Citations](https://www.patentclaimmaster.com/blog/tutorial-finding-text-citations/)
- [Patlytics - 2026 Guide to Modern Office Action Workflows](https://www.patlytics.ai/blog/2026-guide-modern-office-action-patent-prosecution)

---
*Feature research for: Patent citation Chrome extension — v1.2 milestone (store polish, accuracy hardening)*
*Researched: 2026-03-02*

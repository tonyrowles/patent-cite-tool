# Pitfalls Research

**Domain:** Chrome extension store submission + accuracy testing + algorithm improvement (v1.2 milestone)
**Researched:** 2026-03-02
**Confidence:** HIGH (Chrome Web Store policies verified against official docs) / HIGH (algorithm/testing pitfalls verified against existing code)

---

## Critical Pitfalls

### Pitfall 1: Missing Privacy Policy Blocks Submission (Purple Lithium Violation)

**What goes wrong:**
The extension is submitted to the Chrome Web Store without a publicly accessible privacy policy URL entered in the Developer Dashboard privacy section. The submission is rejected with a "Purple Lithium" policy violation. This happens even though the extension stores only parsed patent position maps (no PII) and syncs only user preferences (trigger mode, display mode, patent number prefix).

**Why it happens:**
The privacy policy requirement triggers on the presence of `host_permissions` and data transmission, not just PII. This extension sends position map data to the Cloudflare Worker KV cache — that's "transmitting" data under Google's definition even though the payload is derived from public documents. The existing popup.js uses `chrome.storage.sync` for settings, which syncs across devices and therefore qualifies as data transmission. Developers building privacy-preserving tools incorrectly assume "no PII = no privacy policy required."

**How to avoid:**
Write a brief, accurate privacy policy (a single page is sufficient) and host it at a public stable URL (a GitHub Pages page, a Cloudflare Pages URL, or a dedicated domain path). The policy must state: (1) what data is stored locally (IndexedDB: parsed patent text position maps; chrome.storage.sync: user preferences), (2) what is transmitted to your server (parsed position map JSON sent to Cloudflare Worker for shared KV cache), (3) that no personal data, browsing history, or user identity is collected or transmitted. Link this URL in the Developer Dashboard privacy policy field before first submission.

**Warning signs:**
- Extension has `host_permissions` pointing to an external domain (pct.tonyrowles.com) — automatic flag for reviewer scrutiny
- Extension uses `chrome.storage.sync` — syncs data cross-device, qualifies as transmission
- The Developer Dashboard privacy section shows an empty privacy policy URL field
- No privacy policy link exists anywhere reachable before submission

**Phase to address:**
Store Listing Assets phase — before submission is attempted. The privacy policy URL must exist before the Developer Dashboard form can be completed.

---

### Pitfall 2: Data Disclosure Form Incomplete — Extension Suspended After 30 Days

**What goes wrong:**
The extension passes initial review but is suspended 30 days later because the Data Use Disclosure form in the Developer Dashboard was not fully completed. Google requires explicit certification for each data type the extension handles. Missing or mismatched entries cause automated suspension without warning.

**Why it happens:**
The Data Use Disclosure form is separate from the privacy policy URL field and requires affirmative checkboxes for each data category. Developers fill in the privacy policy URL, consider themselves done, and never complete the disclosure form. The review team does not always catch this at initial review — suspension comes later via automated enforcement.

**How to avoid:**
In the Developer Dashboard privacy section, complete all four required elements: (1) single purpose description (one sentence: "generates column:line citations from highlighted text on Google Patents"), (2) permission justifications for each permission in the manifest — `declarativeContent`, `offscreen`, `activeTab`, `storage`, `contextMenus`, `clipboardWrite`, and the two host permissions; (3) certify that no remote code is executed (MV3 prohibits it); (4) complete the data collection checkboxes — for this extension: local storage yes (IndexedDB and chrome.storage.sync), transmission to server yes (position map to KV cache), no personal data, no PII, no sensitive categories.

**Warning signs:**
- Developer Dashboard shows orange or yellow warning badges in the privacy section
- Any checkbox field in the Data Use Disclosure section left blank
- Permission justification fields left empty or containing placeholder text
- Submission confirmation does not mention privacy review completion

**Phase to address:**
Store Listing Assets phase — as part of preparing the Developer Dashboard entry before first submission.

---

### Pitfall 3: Icon Set Missing Required 32px Size (Windows Degradation)

**What goes wrong:**
The extension ships with 16px, 48px, and 128px icons (both active and inactive variants). Windows users see blurry or incorrectly scaled toolbar icons because 32px is not provided. On high-DPI Windows displays, Chrome scales the 16px icon up to 32px, producing a pixelated icon in the toolbar. The store listing looks unprofessional.

**Why it happens:**
The Chrome Web Store technically requires only 128px for the store listing. The 32px size is documented as "Windows computers often require this size" but is not enforced at submission. The manifest currently declares only `16`, `48`, and `128` in both the `action.default_icon` and `icons` sections. The 32px gap is invisible on macOS/Linux during development but visible to a significant portion of users on Windows.

**How to avoid:**
Add 32px variants for both active and inactive states alongside the existing sizes. The manifest `icons` and `action.default_icon` blocks should declare 16, 32, 48, and 128 sizes. Source artwork at 128px and scale down — do not scale up from 16px or 48px. PNG format required; SVG is not supported in any Chrome extension icon context.

**Warning signs:**
- Manifest declares only 16, 48, 128 — no 32 entry
- Icons directory has no 32px files
- Testing done only on macOS or Linux, never on a Windows machine
- Icons have file sizes that suggest they are resized rather than redrawn (e.g., the existing 79-byte 16px files suggest placeholder/generated icons rather than real artwork)

**Phase to address:**
Icon Set phase — produce the full 16/32/48/128 set for both states in one pass. Do not add 32px as a later patch; get the complete set right the first time.

---

### Pitfall 4: Screenshot and Promotional Image Sizing Mismatches Cause Store Listing Rejection

**What goes wrong:**
Screenshots uploaded to the Developer Dashboard are cropped or fail upload validation because they don't match required dimensions. The small promotional image (440x280) is omitted, causing the listing to rank lower in search results. Screenshots showing the extension popup in isolation convey nothing about how the tool works in context.

**Why it happens:**
The Chrome Web Store image requirements are specific: screenshots must be exactly 1280x800 or 640x400 (no other sizes), the promotional image must be exactly 440x280. Extensions rank lower in store search if the promotional image is missing. Developers who have never submitted before assume "any screenshot works." Screenshots of a 280px-wide popup without the underlying Google Patents page provide no context for evaluating the extension.

**How to avoid:**
Produce screenshots at exactly 1280x800 showing the full Google Patents page with a patent open, text selected, and the citation result visible. Capture both the floating button mode and the silent mode toast. Produce the 440x280 promotional image (even minimal text treatment on a solid background is acceptable). Do not include rounded corners, device frames, or padding on screenshots — the store displays them with its own container. Test image upload in the dashboard before the submission attempt.

**Warning signs:**
- Screenshots taken from browser dev tools at arbitrary zoom levels — pixel dimensions will not be exactly 1280x800
- Promotional image field left blank in the Developer Dashboard
- Screenshots show the popup in isolation with a blank background
- Image upload in the dashboard returns a dimension error

**Phase to address:**
Store Listing Assets phase — plan 1280x800 captures while the extension is running with real patent data, not after the patent page is closed.

---

### Pitfall 5: Test Fixtures That Don't Reflect Real Patent Diversity (False Accuracy Signal)

**What goes wrong:**
The automated test harness is built with 3-5 "friendly" patents — patents the developer already knows work correctly. The test suite passes 100%, creating confidence that the algorithm is reliable. The manual audit then discovers failure modes on older patents, chemical patents with subscript formulas, patents with unusually narrow columns, or patents where the claims section detection fails. The green test suite was measuring coverage of known-working cases, not real accuracy.

**Why it happens:**
It is natural to reach for patents already open in your browser to populate test fixtures. These are selection-biased toward patents that already work. The algorithm has several known weak points (fuzzy matching on long selections, bookend matching when prefix/suffix text repeats elsewhere in the specification, claims section detection via text markers) that will only surface with adversarial or unusual inputs. Testing happy paths produces false confidence.

**How to avoid:**
Build the test corpus with deliberate diversity: (1) at least two patents from before 2000, when PDF text layers and typesetting differ markedly from modern patents; (2) at least two chemical or biotech patents with subscript characters, Greek letters, and formula text; (3) at least one patent with a claims section containing dependent claims that produce complex column boundaries; (4) at least one patent where the specification is longer than 100 columns; (5) at least one patent where the selected text spans a column boundary; (6) at least one patent where the selected text appears more than once in the specification (disambiguation test). Include known-failing cases as expected-fail fixtures rather than excluding them.

**Warning signs:**
- All test patents are from the same technology domain
- All test patents are from the same decade
- No test case attempts to select text that spans a column boundary
- No test case includes selection from the claims section specifically
- Test suite was assembled by searching for patents the developer knows are working

**Phase to address:**
Test Harness phase — specify corpus diversity requirements before collecting fixtures, not after. Write the diversity checklist before selecting any patents.

---

### Pitfall 6: Algorithm Fix Breaks Existing Working Cases (Regression Without Harness)

**What goes wrong:**
A parsing fix for an edge case (say, correcting claims section detection for patents that use "What is claimed:" instead of "What I claim:") inadvertently changes the column number assignment for the entire specification because the claims boundary offset shifts. Tests that previously expected `4:15` now produce `4:16`. The regression is not caught because there was no baseline fixture for the affected patent, and the algorithm change is shipped.

**Why it happens:**
The position-map-builder.js algorithm has several interdependencies: two-column page detection feeds column boundary detection, which feeds line grouping, which feeds column number assignment, which feeds claims section tagging. A fix to any stage can silently propagate errors downstream. Without frozen expected outputs for a diverse patent corpus, there is no way to detect that a fix caused a regression until an attorney reports a wrong citation in a filing.

**How to avoid:**
Before making any algorithm change, run the full test harness and record all outputs as the baseline. Make the change. Run the harness again. Diff all outputs. Any citation that changed must be manually verified against the actual PDF to confirm the change is an improvement and not a regression. The harness must store expected outputs as frozen strings, not computed on the fly. Do not accept a test run as "passing" unless all previously-passing cases still pass. If a fix causes a previously-passing case to change output, that change must be consciously approved as correct, not silently accepted.

**Warning signs:**
- Algorithm changes made without running the test harness first
- Test expected outputs generated by running the current code (not verified against actual PDFs)
- Test harness recomputes expected values rather than comparing against stored golden outputs
- Algorithm changes made and tests updated in the same commit without manual PDF verification of the changed outputs

**Phase to address:**
Test Harness phase — establish frozen golden outputs before the Algorithm Fix phase begins. The harness must exist and be running before any algorithm changes are made.

---

### Pitfall 7: Overfitting Algorithm Fix to Specific Patent, Breaking General Case

**What goes wrong:**
The audit finds that a specific patent (say, US7,654,321) produces wrong column numbers because of an unusual header format. The algorithm is modified to handle that header. The fix works for US7,654,321 but makes a previously-correct assumption fragile — column number parsing now special-cases a pattern that happens to collide with normal content on other patents, producing wrong numbers for a class of patents that previously worked correctly.

**Why it happens:**
Patent PDFs are generated by many different typesetters and USPTO workflows across different eras. The position-map-builder.js uses heuristics (bimodal x-coordinate threshold of 0.3, column gap minimum of 5pt, line clustering tolerance of 3pt) that were calibrated on a small sample. When a fix is narrowly targeted at one failing patent, it is easy to create a condition that is too specific and collides with the general case elsewhere.

**How to avoid:**
Before accepting any algorithm fix as final, run it against the full golden test corpus. If the fix improves accuracy for the failing patent but changes outputs for any previously-passing patent, treat that as a regression requiring investigation. Fixes should be parameterized where possible (e.g., adjusting a threshold rather than adding a special-case branch). When special-casing is unavoidable, add explicit comments documenting which patent class the special case handles and why it cannot be generalized.

**Warning signs:**
- Fix is written as `if (patentId === 'US7654321B2')` or equivalent identifier-based branching
- Fix changes a global constant (like the 0.3 bimodal ratio threshold) without testing against all patents in the corpus
- Fix adds a new regex pattern based on a single observed example without verifying the pattern does not match other content
- The audit sample was small (fewer than 20 patents) and the fix was developed against only the failing subset

**Phase to address:**
Algorithm Fix phase — only after the test harness is established with a diverse corpus.

---

### Pitfall 8: Bookend Match False Positive on Repetitive Patent Prose

**What goes wrong:**
The bookend matching algorithm finds a match that starts correctly but ends at the wrong location because the 50-character suffix appears multiple times in the specification. For patents with highly repetitive claim language ("wherein the device comprises" appears 30 times), the suffix search finds the first occurrence rather than the occurrence that corresponds to the correct span. This produces a citation that points to the right column but the wrong line range.

**Why it happens:**
The bookend match in text-matcher.js searches for suffix text starting from `prefixIdx + BOOKEND_LEN` with no constraint on the actual span length other than `span <= maxSpan` (where `maxSpan = selStripped.length * 2`). If the same 50-character suffix phrase appears at multiple positions within the maxSpan range, the first found is used. Claims sections are particularly prone to this because dependent claim language is designed to be structurally repetitive.

**How to avoid:**
When testing with the harness, include at least three patents with highly repetitive claim language. Add a test case where the selected text is a dependent claim phrase that appears verbatim in at least two other claims. Verify the citation points to the expected line. If bookend false positives are found, the fix is to require the word overlap between the matched span and the actual selection to exceed a threshold (word-level scoring rather than just span length validation). The existing disambiguator in the offscreen text matcher uses word overlap scoring — that logic should be consulted.

**Warning signs:**
- Selected text is from a claims section with dependent claims
- The selection is a short phrase that appears more than once in the specification
- Confidence is returned as 0.92 (bookend confidence level) but the citation does not match the expected location
- No test cases in the harness cover selections from highly repetitive claims text

**Phase to address:**
Test Harness phase (to detect), Algorithm Fix phase (to resolve if detected).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Duplicated matching functions (content + offscreen) | Avoids build step; each context gets what it needs | Bug fixes must be applied in two places; functions can diverge silently | Acceptable until a discrepancy bug appears; a build step with shared module eliminates this |
| Dual-context constants module (classic script + ES module from same file) | Single source of truth for constants | Caused bugs in v1.0; non-obvious dual-import mechanism | Acceptable as-is for v1.2; revisit if adding constants triggers another bug |
| Popup contains settings UI (not a dedicated options page) | Zero additional HTML file | Options are buried in popup; users do not discover them by right-clicking "Options"; limited vertical space for future settings | Acceptable for v1.2 scope; options page migration needed when settings count exceeds ~5 |
| Test corpus generated from PDFs fetched at test time | No static PDF files to commit to repo | Test outcomes change if Google Patents or USPTO changes the PDF | Freeze position maps as test fixtures rather than raw PDFs; raw PDFs are 5-30 MB and change |
| Icons generated programmatically at small sizes | Fast to produce | Real artwork reads as professional in store listing; generated icons read as unfinished | Unacceptable for store submission — invest in real icon design |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Chrome Web Store Developer Dashboard | Filling privacy policy URL, considering submission ready | Complete all four subsections: single purpose, permission justifications, remote code declaration, data use checkboxes — before submitting |
| chrome.storage.sync for settings | Assuming sync storage contains expected defaults on first run | Always use `chrome.storage.sync.get({ triggerMode: 'floating-button', displayMode: 'default', includePatentNumber: false }, ...)` with a defaults object — popup.js already does this correctly |
| Cloudflare Worker URL in extension package | Assuming reviewers won't notice or test external calls | The Worker URL (pct.tonyrowles.com) is visible in the extension package; reviewers may test it; ensure it behaves correctly and has no open SSRF vulnerabilities during review period |
| Icon sizes between manifest `icons` and `action.default_icon` | Keeping both sections in sync manually | These are separate declarations; `icons` is for extension management page and store; `action.default_icon` is for the toolbar; both need 16, 32, 48, 128 entries with correct paths |
| chrome.storage.sync vs chrome.storage.local for settings | Mixing which settings go to which store | Settings that should roam with user (trigger mode, display mode, patent number prefix) belong in sync; cached patent data belongs in local (or IndexedDB). Popup.js already uses sync for settings — do not move them to local |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fuzzy Levenshtein match on selections > 100 chars | UI hangs for 2-3 seconds when user highlights a long passage | The code already guards: `if (n === 0 || n > 100) return null` in fuzzySubstringMatch — maintain this guard in any refactor | Any refactor that increases the needle size limit or removes the guard |
| Test harness fetching live PDFs for each test run | Test suite takes 30-60 seconds to run; flaky on network errors | Store frozen position maps (not raw PDFs) as JSON fixtures; run matching against frozen data | First time a test is added that fetches from Google Patents at runtime |
| Levenshtein dp array allocation inside hot loop | Memory allocation in innermost loop causes GC pauses on long patent specs | Current implementation allocates `Array.from({ length: m + 1 }, ...)` — acceptable for n<=100; do not remove the n>100 guard | If guard is removed and n becomes 200+, GC pauses become noticeable |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Store listing description containing inaccurate capability claims | Reviewer rejects for misleading description; "Red Nickel" violation | Write description precisely: "generates column:line citations from selected text on Google Patents for granted US patents"; do not imply it works on non-US patents or non-Google-Patents pages |
| Privacy policy that claims no data transmission when KV cache is active | Misrepresentation violation; suspension if discovered | Privacy policy must explicitly mention the Cloudflare Workers KV cache: "parsed patent structure data (position maps, not personal data) is transmitted to a shared cache server to benefit future users" |
| Reviewer testing the extension on a non-US patent page and finding it non-functional | "Yellow Magnesium" broken functionality violation | The `manifest.json` `content_scripts.matches` already restricts to `https://patents.google.com/patent/US*`; ensure the popup also explains this scope clearly |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Silent (Ctrl+C)" option name without explanation | Users who select silent mode do not understand why clicking the floating button no longer appears; they think the extension is broken | Add a brief description below the trigger mode selector when "silent" is selected, e.g., "Highlight text and press Ctrl+C — citation is appended automatically" |
| Settings in popup disappear when popup closes | Users change trigger mode but cannot verify the change persisted | Add a subtle confirmation ("Saved") that appears briefly after each setting change; popup.js currently has no save feedback |
| Status message "PDF analyzed for US1234567B2 — 47 columns, 1,203 lines mapped" | Patent professionals understand this; non-professionals (paralegals) may not know what "columns" means in context | Acceptable for this audience; patent attorneys know the two-column spec format well |
| Options discoverable only via popup — no right-click "Options" path | Power users expect right-click "Options" to open a settings page; popup-only settings are non-standard | Add `options_page` or `options_ui` entry to manifest pointing to the popup or a dedicated options page; even pointing to the popup HTML is sufficient to make right-click "Options" work |

---

## "Looks Done But Isn't" Checklist

- [ ] **Privacy policy:** URL exists and is accessible without login — verify by opening it in a private browsing window before submitting
- [ ] **Developer Dashboard privacy section:** All four subsections complete (single purpose, permission justifications, remote code declaration, data use checkboxes) — not just the privacy policy URL field
- [ ] **32px icons:** Both active and inactive 32px variants exist and are declared in the manifest `icons` and `action.default_icon` sections
- [ ] **Promotional image:** 440x280px image uploaded in Developer Dashboard — absence causes lower store ranking even if submission succeeds
- [ ] **Screenshots:** At least one screenshot shows the full Google Patents page with a patent open and a citation visible, not just the popup in isolation
- [ ] **Test corpus diversity:** Corpus includes pre-2000 patents, chemical patents, cross-column selections, and repeated-phrase selections — not just modern software patents
- [ ] **Golden outputs frozen:** Test harness compares against stored expected strings, not against outputs computed by the current code at test time
- [ ] **Baseline recorded before algorithm changes:** Full harness run with all outputs recorded before any algorithm fix begins
- [ ] **Options discoverability:** Right-clicking the extension icon and selecting "Options" reaches a settings surface (requires `options_page` or `options_ui` in manifest)
- [ ] **Store description accuracy:** Description does not claim capabilities for patent types or pages not covered by `content_scripts.matches`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Rejected for missing privacy policy | LOW | Write privacy policy, host it, add URL to dashboard, resubmit — 3-7 day review cycle |
| Rejected for incomplete data disclosure form | LOW | Complete dashboard privacy section checkboxes, resubmit — same review cycle |
| Rejected for broken functionality (reviewer tested wrong page) | LOW-MEDIUM | Add prominent "US patents only" language to description and popup; resubmit with support ticket explaining scope |
| Algorithm fix causes citation regression discovered post-release | HIGH | Roll back the fix in a new extension version; submit update (1-7 day review cycle); notify any known users via store listing update notes |
| Bookend false positive found post-release affecting claims citations | MEDIUM | Add word-overlap scoring to bookend match; freeze the failing case as a new golden test; ship fix version |
| Store screenshots rejected for wrong dimensions | LOW | Retake at exact 1280x800; re-upload via dashboard; no full resubmission required for asset-only changes |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing privacy policy | Store Listing Assets | Privacy policy URL opens without login before submission |
| Incomplete data disclosure form | Store Listing Assets | All four developer dashboard privacy subsections show complete status |
| Missing 32px icons | Icon Set | Manifest declares 16/32/48/128 for both action and general icons; files exist at all paths |
| Screenshot/promo image sizing | Store Listing Assets | Upload succeeds in dashboard without dimension errors; promotional image field shows uploaded image |
| Test fixtures not representing real diversity | Test Harness | Corpus checklist (pre-2000, chemical, cross-column, repetitive claims) verified before harness is called complete |
| Algorithm fix causing regression | Algorithm Fix | Zero previously-passing test cases change output without manual PDF verification of the new output |
| Bookend false positive on repetitive claims | Test Harness (detect) / Algorithm Fix (resolve) | At least two test cases cover dependent claim selections with repetitive language |
| Options not right-click discoverable | Options Page UX | `options_page` or `options_ui` declared in manifest; right-click "Options" navigates to a settings surface |

---

## Sources

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) — Permission requirements, single purpose, misleading content (verified 2026-03-02)
- [Chrome Web Store Troubleshooting / Violation Codes](https://developer.chrome.com/docs/webstore/troubleshooting) — Blue Argon, Yellow Magnesium, Purple Lithium, Purple Potassium, Yellow Zinc violation categories
- [Chrome Web Store User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) — Privacy policy trigger conditions, what "handling data" means for local-only extensions
- [Chrome Web Store Dashboard Privacy Fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) — Four required fields: single purpose, permission justifications, remote code, data use checkboxes
- [Chrome Web Store Images](https://developer.chrome.com/docs/webstore/images) — Screenshot dimensions (1280x800 or 640x400), promotional image (440x280), 128px store icon
- [Chrome Extension Configure Icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) — 16/32/48/128 sizes; 32px required for Windows; SVG not supported
- Chrome Web Store first-person submission account ("TraceMind Blog") — Privacy policy required even for local-only extensions; reviewer onboarding gap caused initial rejection
- Project source code audit: src/manifest.json, src/popup/popup.js, src/content/text-matcher.js, src/offscreen/position-map-builder.js — Identified missing 32px icons, settings-in-popup pattern, bookend match vulnerability

---
*Pitfalls research for: Chrome extension store submission, accuracy testing, and algorithm improvement*
*Researched: 2026-03-02*
*Milestone: v1.2 Store Polish + Accuracy Hardening*

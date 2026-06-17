# Feature Research

**Domain:** Standalone single-purpose legal-lookup web form (patent citation tool webapp)
**Researched:** 2026-06-16
**Confidence:** HIGH (codebase authoritative for matching core, existing formats, confidence thresholds); MEDIUM for web-form UX conventions (general pattern knowledge, no single patent-tool reference)

---

## Scope Boundary Confirmation (v1 = v6.0 Milestone)

The following decisions are LOCKED from ROADMAP.md backlog entry (Phase 999.1) and
PROJECT.md (Current Milestone: v6.0). Included here to give the roadmapper a single
source of truth for what is IN vs OUT.

| Decision | v1 Status |
|----------|-----------|
| Granted US patents only | IN — published apps show "not supported yet" message |
| Core single-passage citation flow | IN |
| Batch mode (N passages, one patent, shared parse) | IN |
| Copy-to-clipboard | IN |
| Citation format toggle (shorthand vs long form) | IN — first surface to ship this (not yet in extension) |
| Optional patent number prefix | IN — mirrors extension `includePatentNumber` setting |
| Client-side PDF.js parsing | IN |
| Reuse existing Cloudflare Worker (pct.tonyrowles.com) as thin USPTO proxy | IN |
| Citation history / saved sessions | DEFERRED — out of v1 |
| User accounts / authentication | DEFERRED — out of v1 |
| Shareable links | DEFERRED — out of v1 |
| Published application paragraph citations | DEFERRED — "not supported yet" message only |
| Non-US patents | OUT OF SCOPE (project-wide) |
| OCR on patents without text layers | OUT OF SCOPE (project-wide) |
| File upload (user-supplied PDF) | OUT OF SCOPE for v1 |
| Multi-patent batch (N patents x M passages) | OUT OF SCOPE for v1 |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features a professional-facing free lookup tool must have. Missing any of these makes the
product feel broken or untrustworthy for use in legal filings.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Patent number input with format flexibility | Users copy patent numbers from many sources in many formats; refusing all but one frustrates them on the first keystroke | LOW | Normalize on input: strip spaces/commas/hyphens, uppercase, accept with or without "US" prefix, with or without kind code. Pure function, no network call. |
| Input validation with clear error messaging | Legal professionals need to know WHY a number was rejected, not just that it failed | LOW | Three rejection states: unrecognizable format, recognized as published application, recognized as non-US. Each has its own message. |
| Published application rejection message | v1 scope limit must surface gracefully before any fetch attempt | LOW | Shown after kind-code detection, before network call. "Published applications (US20XXXXXXX) are not yet supported — this tool handles granted patents only." |
| Passage textarea | Core input for what the user wants cited | LOW | Standard `<textarea>`. No enforced character limit; the matching algorithm handles long passages via bookend matching at >500 chars. Placeholder shows a realistic patent excerpt. |
| Submit / Cite button with disabled state | Obvious trigger; must not allow double-submit | LOW | Disable during fetch/parse; re-enable after result or error. |
| Citation result display | The output the user came for | LOW | Display citation string prominently. Default format is `4:15-22` shorthand (same as extension default). |
| Confidence indicator (green/yellow/red) | Extension trains users to expect this; legal context requires honest confidence communication | LOW | Mirror extension thresholds exactly (from citation-ui.js lines 152-153): >= 0.95 = green (no label); >= 0.80 = yellow ("Approximate match"); < 0.80 = red ("Low confidence — verify manually"). |
| Copy-to-clipboard | Every citation tool in the legal space provides this; absence is conspicuous | LOW | Navigator Clipboard API with textarea execCommand fallback. Visual "Copied!" confirmation for 1.5s. Mirror citation-ui.js lines 233-262 pattern. |
| No-match state | User needs feedback when the passage is not found | LOW | Distinct from low-confidence: "No match found — try a shorter or more exact excerpt from the specification." Not a confidence indicator state — no confidence to show. |
| Network / parse error state | Infrastructure can fail; user must know it is not their input | LOW | "Could not load patent PDF — check your connection and try again." Distinct wording from no-match. |
| Loading / progress indicator | PDFs are 5-30MB; without a loading state users assume the page is broken and reload | MEDIUM | At minimum two named stages: "Fetching patent PDF..." and "Parsing PDF...". See Loading UX Detail section below. |

### Differentiators (Competitive Advantage)

Features that distinguish this from manually counting lines on a printed PDF, which is
the only real alternative today for users without the extension.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Batch mode: N passages, one patent | Patent prosecution often requires citing multiple passages from the same patent; doing them one at a time wastes the PDF parse cost | MEDIUM | Parse PDF once, run matchAndCite N times. Per-row confidence indicator. Copy-all. See Batch Mode UX Detail section. |
| Copy-all for batch results | Attorneys paste citations into Word or filing documents; one-click copy-all for all batch rows saves repeated manual steps | LOW | Join all citations as one-per-line text block. Appears after at least one result is populated. |
| Citation format toggle (shorthand vs long form) | Different prosecutors and examiners expect different formats; the extension already plans to offer this choice | LOW | Toggle between `4:15-22` (default) and `Col. 4, ll. 15-22`. Updates both displayed citation and clipboard content. This is a NEW feature in v6.0 — not yet in the extension. |
| Optional patent number prefix | Some citation styles include the patent number in the citation string | LOW | Checkbox "Include patent number prefix" → `'321 Pat., 4:15-22`. Mirrors extension `includePatentNumber` / `applyPatentPrefix`. |
| Deterministic, no-LLM positioning statement | Patent attorneys are skeptical of AI tools for filings that go to the USPTO; a clear "no AI inference" statement is a trust signal | LOW | One sentence near the result or in an accessible "How it works" summary: "Citations are deterministic position lookups — no AI, same result every time." |
| Shared KV cache benefit (implicit) | Returning users and any user who queries a previously-parsed patent get near-instant results from the existing cache | LOW (implicit) | No UI needed; the Worker already implements check-before-fetch. Optionally surface "Loaded from cache" in a subtle status note. |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Citation history / saved sessions | Users want to retrieve past lookups | Requires localStorage state or server-side auth; creates privacy questions and support burden; not validated as needed for v1 | Explicitly deferred. Copy button is the v1 sharing/saving mechanism. |
| Shareable links (URL-encoded patent + passage) | Easy to share a citation with a colleague | Long passage text makes URLs ugly and brittle; deep-linking forces a fresh fetch/parse on every load; deferred by explicit locked decision | Defer to v2. For v1 the copy button is the sharing mechanism. |
| User accounts | Persistent settings, history | Zero value in v1 with no history feature; increases attack surface | Defer indefinitely. The extension has no auth and users do not expect it. |
| File upload (user-supplied PDF) | Power users want to cite patents not on Google Patents | Requires storage/security design; scope-creep; the tool's value is the USPTO-sourced authoritative PDF | Not in scope. Patent number input remains the only entry point. |
| Real-time / as-you-type matching | Feels fast and modern | PDF parse takes 2-30s; streaming partial results is misleading for a deterministic tool; increases Worker load for abandoned queries | Single explicit submit with loading indicator. |
| Published application paragraph citations | Users ask about US20XXXXXXX numbers | No PDF column/line scheme for applications; the extension uses DOM TreeWalker on Google Patents' live page, which does not exist server-side; significant new code path | "Not supported yet" message with link to Google Patents to look up the application there. Defer to v1.x if demand is validated post-launch. |
| Dark mode | Common feature request | Design cost for a single-purpose tool; increases CSS complexity | Skip for v1. System `prefers-color-scheme` passively if CSS is simple; do not design two full themes. |
| Multi-patent batch (N patents x M passages) | "Compare across two patents" | Doubles fetch+parse work; scope-creep; the single-patent batch is the right MVP scope | Single-patent batch is v1. Multi-patent batch is v2+. |
| CAPTCHA | Prevent abuse | Severe friction on a free tool with no sensitive data; the Worker's existing rate-limit pattern is sufficient | Rate-limit at the Worker level if abuse materializes post-launch. |

---

## Input UX Detail: Patent Number Formats

### Accepted Input Formats (all normalize before fetch)

The normalization step is a pure function with no network dependency, allowing real-time
inline validation as the user types or on form submit.

| User input | Normalized form | Notes |
|------------|-----------------|-------|
| `US7654321B2` | `US7654321B2` | Canonical granted patent with kind code |
| `US7,654,321` | `US7654321` | Comma-separated format common on USPTO printed covers |
| `US 7,654,321` | `US7654321` | With space |
| `7654321B2` | `US7654321B2` | No US prefix — add it |
| `7654321` | `US7654321` | Bare number, no kind code |
| `us7654321b2` | `US7654321B2` | Lowercase — uppercase |
| `US 7654321 B2` | `US7654321B2` | Spaces before kind code |

Algorithm: strip spaces and commas, uppercase, add "US" prefix if missing, validate
remaining chars match `US\d+[A-Z0-9]*`.

### Kind-Code Detection (mirrors patent-info.js exactly)

From `src/content/patent-info.js` lines 36-40:
- A1, A2, A9 = published application → show rejection message, no fetch
- Everything else (B1, B2, B1, H1, E1, no kind code) = granted patent → proceed

### Rejection States (shown before any network call)

| Input pattern | Detection | Message shown |
|---------------|-----------|---------------|
| `US20210012345A1` (or A2/A9) | A1/A2/A9 kind code | "Published applications (US20XXXXXXX) are not yet supported. This tool handles granted patents only, e.g. US7654321B2." |
| `EP1234567` / `WO2020123456` | Non-US prefix | "Only US patents are supported." |
| Unrecognizable (free text, random string) | No patent number pattern | "Enter a US patent number, e.g. US7654321B2." |
| Valid format, number resolves to 404 from USPTO | Worker returns 404 post-submit | "Patent not found — check the number and try again." (post-submit error, not pre-submit) |

### Implementation Note

The normalization and kind-code detection is a single pure function shareable between
the webapp and any future extension input field. No `chrome.*` deps. Testable with
Vitest. The logic is essentially the same as `patent-info.js` refactored for a text
input rather than a URL path.

---

## Result Presentation Detail

### Single Citation Result

```
Citation
┌───────────────────────────────────────┐
│  4:15-22                   [●] [Copy] │
│  Approximate match (88%)              │
└───────────────────────────────────────┘

Format:  ○ 4:15-22 (shorthand)
         ● Col. 4, ll. 15-22 (long form)

[ ] Include patent number prefix
```

**Confidence dot color rules** (from citation-ui.js lines 152-153):
- Green dot, no label: confidence >= 0.95
- Amber/yellow dot + "Approximate match (NN%)": confidence >= 0.80 and < 0.95
- Red dot + "Low confidence — verify manually": confidence < 0.80

**No-match state:** Replace citation area content with "No match found" in neutral
styling. No confidence indicator is shown (there is no match to score confidence on).
Include suggestion: "Try a shorter or more exact excerpt from the specification."

**Network/parse error state:** "Could not load patent PDF. Check your connection and
try again." Distinct wording from no-match. Include a Retry button.

**Format toggle behavior:** Changing the format toggle updates the citation string
in-place and updates the clipboard content for the next Copy click. No re-fetch
or re-match needed — formatCitation is a pure function on the same startEntry/endEntry.

**The format toggle is a new feature for v6.0** — the extension's `formatCitation`
function in matching.js currently produces only the `4:15-22` shorthand. A second
code path produces `Col. 4, ll. 15-22`. Both are pure transformations of the same
column/line integers from startEntry and endEntry.

---

## Batch Mode UX Detail

### Entry Layout

Recommended pattern: single patent number input at the top, N passage rows below,
"Cite All" button, results fill in-place per row.

```
Patent number: [US7654321B2                    ]

#  | Passage (paste text)               | Citation    | Conf.
───┼────────────────────────────────────┼─────────────┼──────
1  | [                                 ]|             |
2  | [                                 ]|             |
3  | [                                 ]|             |
   [+ Add passage]

[Cite All]   [Copy all]
```

- Patent number input is shared; user enters it once at the top.
- "Cite All" is disabled until at least one passage row has text.
- "Copy all" appears only after at least one result has been populated.
- "Add passage" appends a new empty row. Start with 3 rows visible.
- Maximum row count for v1: no hard limit in the matching logic, but cap the UI at 20
  rows to prevent runaway DOM size (users with more passages can do two batches).

### Execution Flow for Batch

```
[Cite All tap]
  → Validate patent number
  → Fetch PDF via Worker (one network call)
  → Parse PDF → buildPositionMap (one parse, result shared in memory)
  → For each non-empty passage row:
       matchAndCite(passage, positionMap) → citation + confidence
       Fill in Citation + Conf. cells in that row
  → Enable "Copy all" button
```

The position-map reuse across all passages is the key performance win. This is already
how the extension handles a page session. The position map fits in memory (10-100KB
after stripping bounding boxes, per PROJECT.md Out of Scope list). Do NOT re-parse
for each passage.

### Per-Row Result

Each row shows:
- Citation string (filled after Cite All)
- Confidence dot (green/yellow/red with same thresholds as single-citation)
- Per-row Copy button (copies just that row's citation)

### Copy-All Behavior

One-citation-per-line default for v1 (simplest for pasting into Word or filing drafts).
No format choice needed for copy-all — use whatever the format toggle is currently set to.
Example output (three rows):

```
4:15-22
7:3-9
12:44-50
```

---

## Loading / Progress UX Detail

### The Problem

PDFs are 5-30MB (per PROJECT.md context). On typical broadband: download alone is 1-6s;
PDF.js parse of a complex patent adds 1-5s more. Total 2-10s is common; large chemical
patents on slow connections can hit 30s. Without visible progress, users assume the tool
is broken and reload.

### Required Pattern (Table Stakes)

At minimum, show two named stages:

```
Stage 1: [spinner] Fetching patent PDF...
Stage 2: [spinner] Parsing PDF — this may take a few seconds...
Stage 3: [spinner] Matching passage...   (near-instant; show briefly)
```

The submit/Cite All button must be disabled for the full duration of all three stages
to prevent double-submit.

If the Worker can forward a `Content-Length` response header, Stage 1 can show a
determinate progress bar (bytes received / total). Without it, an indeterminate spinner
is acceptable and expected.

### Key Rules

- Name the stages — "Fetching PDF" vs "Parsing" — so users understand why it takes time
  (not a bug or a frozen page).
- For batch mode, show shared progress once at the patent level, not N times per row:
  "Parsing US7654321B2 — this may take a few seconds."
- On KV cache hit, the fetch returns in <1s. Still show the stage labels briefly
  so the UI does not appear to skip steps. A 300ms minimum display time per stage
  prevents the appearance of a broken transition.
- Cancel button is a v2 feature. In v1, the user can reload to abort.

---

## Feature Dependencies

```
Patent number normalization + kind-code detection
    └──required by──> Single citation flow (must validate before fetch)
    └──required by──> Batch mode (same validation at Cite All time)
    └──required by──> Published app rejection message (fires before any fetch)

PDF fetch (via existing Cloudflare Worker at pct.tonyrowles.com)
    └──required by──> Single citation flow
    └──required by──> Batch mode (shared, one fetch)

PDF.js parse → buildPositionMap (from src/offscreen/position-map-builder.js)
    └──required by──> Single citation flow
    └──required by──> Batch mode (shared across all passage rows)

matchAndCite (from src/shared/matching.js)
    └──required by──> Single citation flow
    └──required by──> Batch mode (called N times on shared map)

Confidence thresholds (green/yellow/red)
    └──required by──> Single citation result display
    └──required by──> Batch mode per-row confidence column

formatCitation (from src/shared/matching.js) + second code path for long form
    └──required by──> Single citation result display
    └──required by──> Citation format toggle
    └──enhances──> Copy-to-clipboard (copies formatted string)
    └──enhances──> Batch copy-all (uses same toggle state)

applyPatentPrefix logic (from content-script.js applyPatentPrefix)
    └──enhances──> Single citation display (when prefix checkbox is checked)
    └──enhances──> Batch copy-all
```

### Dependency Notes

- **Shared core extraction is a prerequisite for everything.** The first phase of v6.0
  (per PROJECT.md and ROADMAP.md) extracts `src/shared/matching.js`,
  `src/offscreen/position-map-builder.js`, and `src/offscreen/pdf-parser.js` into a
  workspace package consumed by both the extension and the webapp. All webapp feature
  work depends on this extraction being done first.

- **PROXY_TOKEN rotation is a blocking security gate** before any public deployment.
  The hardcoded token in `src/offscreen/offscreen.js` must be rotated and moved
  server-side before the webapp URL is published, because the webapp exposes the
  Worker URL publicly. Noted in PROJECT.md and ROADMAP.md.

- **Batch mode requires single-citation flow to work first.** Batch is the same
  pipeline applied N times. Build and validate single-passage before adding batch row UI.

- **Citation format toggle is stateless.** No storage needed in v1 (resets on page
  reload). Toggle state lives in a JS variable or `<select>`. Persistent format
  preference is a v2 feature.

- **Published app rejection message has no dependencies** — it fires purely from
  kind-code detection on the user's input, before any network call.

---

## MVP Definition

### Launch With (v1 = v6.0)

- [x] Shared core extraction (`src/shared/matching.js`, `position-map-builder.js`,
  `pdf-parser.js` → workspace package) — prerequisite for all other items
- [x] PROXY_TOKEN rotation to server-side — blocking security gate before public deploy
- [x] Patent number input with normalization (strip commas/spaces, add US prefix, uppercase)
- [x] Kind-code detection → "not supported" message for A1/A2/A9 (applications), no fetch
- [x] PDF fetch via existing Cloudflare Worker — no Worker changes needed for basic proxy
- [x] Client-side PDF.js parse → position map build
- [x] Single passage → citation result with green/yellow/red confidence indicator
- [x] Copy-to-clipboard for single result
- [x] Citation format toggle (4:15-22 shorthand vs Col. 4, ll. 15-22 long form)
- [x] Optional patent number prefix checkbox
- [x] Loading/progress UI with named stage labels (Fetching PDF / Parsing / Matching)
- [x] No-match state with helpful message
- [x] Network/parse error state with retry option
- [x] Batch mode: N passage rows, shared PDF parse, per-row results, copy-all
- [x] "No account needed, no data stored" disclosure (trust signal for legal professionals)
- [x] "Deterministic — no AI inference" positioning note

### Add After Validation (v1.x)

- [ ] Determinate download progress bar if Worker forwards `Content-Length`
- [ ] "Loaded from cache" status note on fast KV cache hits
- [ ] Published application paragraph citations — if user demand is validated post-launch
- [ ] Shareable links — URL-encoded patent + passage (v2 only if passage length is manageable)
- [ ] Cancel button for long PDF fetches

### Future Consideration (v2+)

- [ ] Citation history (localStorage only, no server, no auth) — if repeat-lookup patterns emerge
- [ ] Multi-patent batch (N patents x M passages)
- [ ] Patent family cache reuse (continuation patents share specification text)
- [ ] User accounts — only if citation history requires cross-device sync

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared core extraction + PROXY_TOKEN rotation | HIGH (prerequisite / security) | MEDIUM | P1 |
| Patent number normalization + kind-code validation | HIGH | LOW | P1 |
| Published app rejection message | HIGH | LOW | P1 |
| Single citation flow (fetch + parse + match) | HIGH | MEDIUM | P1 |
| Confidence indicator (green/yellow/red) | HIGH | LOW | P1 |
| Copy-to-clipboard | HIGH | LOW | P1 |
| Loading/progress UI with stage labels | HIGH | LOW | P1 |
| No-match and error states | HIGH | LOW | P1 |
| Citation format toggle | MEDIUM | LOW | P1 |
| Patent number prefix option | MEDIUM | LOW | P1 |
| Batch mode (N passages, shared parse, per-row results) | HIGH | MEDIUM | P1 |
| Batch copy-all | MEDIUM | LOW | P1 |
| "Deterministic / no AI" trust signal | MEDIUM | LOW | P1 |
| Shareable links | LOW | MEDIUM | P3 |
| Citation history | LOW | MEDIUM | P3 |
| Published app paragraph citations | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v6.0)
- P2: Should have, add when possible (v6.x)
- P3: Nice to have, defer to v2+

---

## Existing Core Dependency Map (Extension → Webapp)

The webapp reuses these three pure modules with zero `chrome.*` or DOM dependencies
(confirmed in PROJECT.md v6.0 goal section). The extraction into a shared workspace
package is the first phase of the milestone.

| Module | What it does | Webapp usage |
|--------|--------------|--------------|
| `src/shared/matching.js` (`matchAndCite`, `formatCitation`) | Text matching tiers 0-5 + citation string formatting | Direct import in webapp citation handler; `formatCitation` needs a second long-form code path |
| `src/offscreen/position-map-builder.js` | PDF.js text items → column/line position map | Run client-side in browser (main thread or Web Worker) after PDF fetch |
| `src/offscreen/pdf-parser.js` | Fetch PDF bytes → PDF.js parse → raw text items | Run client-side; PDF bytes sourced from the existing Worker proxy |

### Citation Format Inventory (from codebase)

`formatCitation` in `matching.js` lines 382-395 currently produces only the shorthand:
- Single-line: `4:15`
- Same-column range: `4:15-22`
- Cross-column range: `4:55-5:10`

The `displayMode` setting in the extension controls how much info appears in the popup
(default = citation only; advanced = with confidence detail) — this is NOT the citation
string format itself.

The long-form alternative (`Col. 4, ll. 15-22`) is listed as a "Future" requirement in
PROJECT.md and is not yet implemented anywhere in the extension. **The webapp is the
first surface to ship the format toggle.** The implementation is a new code path in
`formatCitation` (or a wrapper) — low complexity since it is a pure transformation of
the same column/line integers.

The `includePatentNumber` option produces `'321 Pat., ` prefix (last 3 digits of patent
number + Pat./App.) via `applyPatentPrefix` in content-script.js. This logic is
webapp-portable as a pure function.

---

## Sources

- `src/content/citation-ui.js` — confidence thresholds (lines 152-153), popup structure, copy-to-clipboard pattern (HIGH confidence — authoritative codebase)
- `src/content/patent-info.js` — kind-code detection (A1/A2/A9 = application) (HIGH confidence — authoritative codebase)
- `src/shared/matching.js` — `formatCitation` function, confidence return values (HIGH confidence — authoritative codebase)
- `src/content/content-script.js` — `applyPatentPrefix`, `getShortPatentNumber`, patent-type routing (HIGH confidence — authoritative codebase)
- `src/options/options.html` — existing settings: `displayMode`, `includePatentNumber`, display mode options (HIGH confidence — authoritative codebase)
- `.planning/PROJECT.md` — v6.0 scope, constraints, out-of-scope items, PROXY_TOKEN warning, PDF size range (5-30MB) (HIGH confidence — project definition)
- `.planning/ROADMAP.md` — backlog decisions for Phase 999.1, locked decisions from 2026-06-15 discussion (HIGH confidence — project definition)
- Web form UX conventions for async-heavy single-purpose tools (loading states, batch entry patterns, copy-all) (MEDIUM confidence — general pattern knowledge, not patent-specific)

---

*Feature research for: standalone patent citation web form (v6.0 milestone)*
*Researched: 2026-06-16*

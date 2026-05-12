# Phase 23: Column Inference for Headerless PDFs — Research

**Researched:** 2026-05-12
**Domain:** PDF text extraction + structural inference for US patent PDFs (pdfjs-dist) — accuracy hardening
**Confidence:** HIGH

## Summary

This is a **retroactive documentation phase**. All target work (column inference fallback, structural validation replacing the magic-200 cap, and the `CACHE_VERSION` bump to `v3`) was already merged to `main` between commits `e51ba1b` (2026-04-12) and `17e7876` (2026-04-12) under the quick-task workflow `260412-fde` and a follow-up fix. The plan for Phase 23 should ratify the existing implementation against the success criteria, fill any test/coverage gaps, and produce a phase summary — not redesign the algorithm.

Two complementary changes were shipped:

1. **`extractPrintedColumnNumbers` + `buildPositionMap` (primary pass)** — Replaced the permissive `right > 999` cap with two structural validators: (a) the left header column must be **odd** (patent specs always print odd-even pairs 1,2 then 3,4 then 5,6…), and (b) columns must be **sequentially valid across pages** (page N+1's left column must equal page N's right column + 1). This catches the US10203551 case where PDF.js extracts "203" from the patent number "10203551" as a standalone header item.

2. **`isLikelySpecPage` + fallback pass in `buildPositionMap`** — When the primary pass produces zero entries (because the PDF renders column numbers as graphics rather than text, as in US10203551), a second pass infers sequential column numbers from page order, filtered to pages that pass `isLikelySpecPage` (rejects cover pages, figure sheets, and abstract continuations by header text and body density).

**Primary recommendation:** Treat Phase 23 as documentation + verification. Plan tasks should: (1) add a US10203551 integration fixture + golden case to prove the trigger case ships green, (2) write a phase summary documenting the structural validators, (3) verify the 75-case baseline is still green, (4) confirm `CACHE_VERSION = 'v3'` is present in both `src/offscreen/offscreen.js` and `src/firefox/pdf-pipeline.js`, and (5) update the milestone STATE/ROADMAP.

## User Constraints

CONTEXT.md does not yet exist for Phase 23 at the time of this research. The phase will likely be planned without a discuss-phase pass. Constraints derived directly from REQUIREMENTS.md and the phase goal:

### Locked Decisions (from REQUIREMENTS.md and Phase 23 success criteria)

- **Retroactive milestone:** v2.3 documents work already merged. Per REQUIREMENTS.md: "All v2.3 requirements correspond to work that has already been merged to `main`." [VERIFIED: REQUIREMENTS.md lines 1–5]
- **Upper bound ≤200, but derived structurally — not as an arbitrary cap.** Success criterion #2 specifically rejects "an arbitrary 999 cap." [VERIFIED: ROADMAP.md line 99]
- **Cache key:** `CACHE_VERSION = 'v3'` — must be present at both client read AND client write sites. [VERIFIED: src/offscreen/offscreen.js:28, src/firefox/pdf-pipeline.js:26]
- **Zero regressions:** All 75 existing golden baseline cases must continue to pass. [VERIFIED: tests/golden/baseline.json has 75 keys]
- **Out of scope:** Any net-new matching/parsing capability beyond what is already on `main`. [VERIFIED: REQUIREMENTS.md "Out of Scope" line 35]

### Claude's Discretion

- Whether to add an integration fixture for US10203551 (a real PDF parse-through test) or rely on the existing unit tests that simulate its header-text shape.
- Whether to commit the actual US10203551 PDF to `tests/fixtures/` (it would be large) or to commit a derived `tests/fixtures/US10203551.json` PositionMap produced by `scripts/generate-fixture.js`.
- Whether to formalize the "≤200" upper bound that REQUIREMENTS.md mentions as a comment, a constant, or both — the current code already enforces it implicitly via the sequential-validation check.

### Deferred Ideas (OUT OF SCOPE)

- Configurable citation format (`4:5-20` vs `col. 4, ll. 5-20`). [VERIFIED: REQUIREMENTS.md "Future Requirements" line 27]
- Keyboard shortcut for citation. [VERIFIED: REQUIREMENTS.md line 28]
- Batch citation mode. [VERIFIED: REQUIREMENTS.md line 29]
- Patent family cache reuse. [VERIFIED: REQUIREMENTS.md line 30]
- New matching/parsing capabilities beyond what is on `main`. [VERIFIED: REQUIREMENTS.md "Out of Scope" line 35]

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCY-04 | Citation tool produces correct column numbers for patents whose PDFs lack printed column headers (US10203551-class) — inferred from structural cues, validated against ≤200, not arbitrary 999 cap. | Implemented in `src/offscreen/position-map-builder.js` via (1) odd-left + sequential validators in `extractPrintedColumnNumbers`/`buildPositionMap`, and (2) the headerless fallback pass calling `isLikelySpecPage` + sequential inference. Commits `001b572`, `de3c4f9`. |
| ACCY-05 | Position map cache invalidates when column-extraction logic changes — `CACHE_VERSION` bumped (v2 → v3) so users on prior versions re-parse. | Verified at `src/offscreen/offscreen.js:28` and `src/firefox/pdf-pipeline.js:26`. The version flows into both GET (line 271 / 192) and POST (line 397 / 427) of `/cache?patent=...&v=v3`. Commit `17e7876`. The cache key on the Cloudflare Worker is `${version}:${patentNumber}` (worker/src/index.js:178), so any version change creates a fresh keyspace. |

## Project Constraints (from CLAUDE.md)

CLAUDE.md contains a single non-code directive about user-question handling (it is targeted at interactive workflows like `/gsd-discuss-phase`):

- **Answer verification after every AskUserQuestion call:** Verify the tool result contains the user's actual selection. If empty/generic, fall back to a numbered plain-text list. Do not fabricate or default to "(Recommended)" on the user's behalf.

This directive does not constrain the research/plan/execute pipeline directly, but the planner should ensure that any AskUserQuestion calls inside `/gsd-plan-phase` or `/gsd-discuss-phase` respect this verification protocol.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfjs-dist | ^5.5.207 | PDF text extraction with x/y positioned items | Already in use across the project (`src/lib/pdf.mjs`); no alternative is being considered. [VERIFIED: package.json:24] |
| vitest | ^3.0.0 | Test runner for unit + integration | Already in use; 30 tests in `tests/unit/position-map-builder.test.js` all pass on `main`. [VERIFIED: `npx vitest run tests/unit/position-map-builder.test.js`] |
| esbuild | ^0.27.3 | Build pipeline (chrome + firefox dists) | Already in use; column-inference change is pure source edit, no build change needed. [VERIFIED: package.json:23] |

### Supporting

| Module | Path | Purpose |
|--------|------|---------|
| `extractPrintedColumnNumbers` | `src/offscreen/position-map-builder.js:140` | Per-page extraction of printed column numbers from header zone (`y >= pageHeight - 90`). Returns `{left, right}` or `null`. |
| `extractGutterLineGrid` | `src/offscreen/position-map-builder.js:481` | Builds physical y-to-line-number grid from gutter markers; orthogonal to column inference. |
| `findColumnBoundary` | `src/offscreen/position-map-builder.js:70` | Dynamic gutter detection (picks the zero-density gap nearest page center). |
| `isTwoColumnPage` | `src/offscreen/position-map-builder.js:36` | Layout-first detection via bimodal x-coordinate distribution (left/right item count ratio > 0.3). |
| `isLikelySpecPage` | `src/offscreen/position-map-builder.js:666` | NEW (commit `de3c4f9`). Header-text heuristics to skip cover/figure/abstract pages when falling back to inferred numbering. |
| `processPageColumns` | `src/offscreen/position-map-builder.js:695` | NEW (commit `de3c4f9`). Extracted from `buildPositionMap` so both primary and fallback passes share the column-processing logic. |
| `buildPositionMap` | `src/offscreen/position-map-builder.js:730` | Two-pass entry point: primary uses `extractPrintedColumnNumbers` + sequential validation; fallback uses page order + `isLikelySpecPage`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sequential cross-page validation | Hardcoded cap (`right > 200`) | Cap is brittle (no patent has 200+ cols today, but the bound is structural — not magic-numeric). Sequential validation is self-tightening: a "203" on page 1 cannot pass because page 1's expected left is 1, not 203. **The shipped implementation actually relies on sequential validation; ≤200 is satisfied as a derived consequence, not enforced.** This is the resolution to success criterion #2 "≤200 derived from layout, not arbitrary cap." [VERIFIED: src/offscreen/position-map-builder.js:744; SUMMARY.md] |
| `isLikelySpecPage` header heuristics | OCR/font-metrics on rendered column numbers | OCR would catch graphical column numbers but adds dependency weight and latency. Header heuristics ship for free and cover the US10203551 case. |
| Fallback pass only on empty-primary | Fallback pass per-page (mixed mode) | Per-page mixing risks numbering drift if the primary pass succeeds on some pages and the fallback on others. The shipped contract is "all primary or all fallback" — simpler invariant. [VERIFIED: src/offscreen/position-map-builder.js:754 — `if (entries.length === 0)`] |

**No installation needed.** All dependencies are already in `package.json`.

**Version verification:**
```bash
npx vitest run tests/unit/position-map-builder.test.js
# Confirmed 2026-05-12 at 09:24 UTC:
# Test Files  1 passed (1)
# Tests       30 passed (30)
```

## Architecture Patterns

### Two-Pass Column Inference (the shipped pattern)

```javascript
// src/offscreen/position-map-builder.js:730
export function buildPositionMap(pageResults) {
  const entries = [];

  // --- PRIMARY PASS: use printed column numbers with sequential validation ---
  let expectedLeftCol = 1; // spec always starts at col 1
  for (const pageResult of pageResults) {
    const { items, pageWidth, pageHeight } = pageResult;
    if (!isTwoColumnPage(items, pageWidth)) continue;

    const colNums = extractPrintedColumnNumbers(items, pageHeight, pageWidth);
    if (!colNums) continue;

    // Sequential validation: columns must proceed in order (1,2 → 3,4 → 5,6).
    // Rejects patent-number fragments like "203" from US10203551.
    if (colNums.left !== expectedLeftCol) continue;
    expectedLeftCol = colNums.right + 1;

    processPageColumns(pageResult, colNums, entries);
  }

  // --- FALLBACK PASS: infer column numbers from page order ---
  if (entries.length === 0) {
    let inferredLeft = 1;
    for (const pageResult of pageResults) {
      const { items, pageWidth, pageHeight } = pageResult;
      if (!isTwoColumnPage(items, pageWidth)) continue;
      if (!isLikelySpecPage(items, pageHeight)) continue;

      const colNums = { left: inferredLeft, right: inferredLeft + 1 };
      inferredLeft += 2;

      processPageColumns(pageResult, colNums, entries);
    }
  }

  // ... claims + wrap-hyphen detection unchanged
  return entries;
}
```

**Pattern essence:** Two independent passes share the same column-processing helper. Each pass is a complete, deterministic algorithm. The fallback only runs when the primary produces no entries — preventing mixed-mode numbering drift.

### Structural Validation Replaces Numeric Cap

The previous code had `if (left < 1 || right > 999) return null;` — a magic cap. The shipped code uses three structural checks (`src/offscreen/position-map-builder.js:181–185`):

```javascript
// Sanity check: right should be left + 1 (consecutive columns)
if (right !== left + 1) return null;

// Sanity check: left column must be odd (patent spec pages always have
// odd-even pairs: 1,2 then 3,4 then 5,6 etc.)
if (left < 1 || left % 2 !== 1) return null;
```

Combined with the cross-page sequential check in `buildPositionMap`, no impossible column (like 203 on page 1) can survive — because page 1's expected left is 1, the cross-page check rejects everything else. The "≤200" bound emerges naturally: the longest real US patent has ~120 columns, so a value like 203 fails the sequential test long before it could reach an artificial cap.

### Anti-Patterns to Avoid

- **Hand-rolling another magic cap.** The whole point of the structural-validation rewrite (`001b572`) was to remove the cap. Adding a new one (e.g., `if (column > 200) reject`) would reintroduce the brittleness. The phase plan should not propose this. The ≤200 mentioned in REQUIREMENTS.md is descriptive (a derived upper bound), not prescriptive.
- **Re-using the cached "v2" position maps.** A cache hit at the previous version would serve a known-bad position map. `CACHE_VERSION = 'v3'` is the contract for invalidation; reverting it would break ACCY-05.
- **Per-page mixing of primary and fallback.** If page 5 uses printed numbers and page 6 uses inferred numbers, sequence integrity is lost. The shipped contract is all-or-nothing on the document level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache versioning | Custom cache-key hashing of algorithm version | `CACHE_VERSION` constant bumped per algorithm change | The KV cache key is `${version}:${patentNumber}` (worker/src/index.js:178). A new constant value creates a fresh keyspace — equivalent to a flush, but per-version. |
| Spec-page classification | Custom OCR or rendered-image inspection | `isLikelySpecPage` (already implemented) header heuristics: rejects "United States Patent" (cover), "Sheet X of Y" (figure), "Page N" (abstract continuation), and sparse pages (<80 body items). | Header text is already extracted by PDF.js; OCR would add latency and a new dep. |
| Column boundary detection | Hardcoded page-mid x | `findColumnBoundary` (dynamic gap-detection) | Already battle-tested; some patents have non-centered gutters. |

## Runtime State Inventory

> Not strictly a rename phase, but `CACHE_VERSION` is a stored-state migration vector. Documenting per phase 23's cache-invalidation requirement.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Cloudflare KV namespace `PATENT_CACHE`. Keys: `v2:{patent}` (stale, pre-fix) and `v3:{patent}` (current). Old `v2:*` entries remain in KV indefinitely but are unreachable from the extension once `CACHE_VERSION='v3'` ships. | **No action** — the version bump is the migration. Old keys will eventually expire if KV has TTL, otherwise they are harmless orphans. Optional: a one-time `wrangler kv:key delete` sweep, but this is not required by ACCY-05. |
| Live service config | None. Cloudflare Worker `worker/src/index.js` reads any `v=*` query param; no allowlist of versions. | None. |
| OS-registered state | None — pure source change. | None. |
| Secrets/env vars | `PROXY_TOKEN` in `src/offscreen/offscreen.js:25` and `src/firefox/pdf-pipeline.js`. Unchanged. | None. |
| Build artifacts | `dist/` outputs from `npm run build`. After `CACHE_VERSION` bump, a rebuild is required so the bundled offscreen.js carries `v3`. CI handles this automatically; local dev needs `npm run build`. | Verify CI built the latest manifest version (`2.3.0` per `src/manifest.json:4`) and that the Firefox manifest matches (currently `2.2.0` at `src/manifest.firefox.json:4` — **mismatch, may need Phase 24 follow-up**, not Phase 23). |
| Client-side IndexedDB | Each user has `pdfs` object store keyed by `patentId`. Records contain `positionMap` arrays. On `CACHE_VERSION` change, the **client-side** IDB is NOT auto-invalidated — but the KV cache miss forces a re-parse, and the new parse overwrites the IDB entry. Stale IDB entries from before the user upgraded the extension may still serve bad data on a single user session until the next PDF visit. | None — acceptable behavior; the parse on next visit overwrites. |

**Nothing found in category:** Live service config, OS state, secrets, code-side env vars — confirmed by grep + inspection.

## Common Pitfalls

### Pitfall 1: Forgetting to bump `CACHE_VERSION` in BOTH client files

**What goes wrong:** The Chrome extension reads `v3` but the Firefox extension still reads `v2`, so Firefox users serve stale maps.

**Why it happens:** `CACHE_VERSION` is duplicated at `src/offscreen/offscreen.js:28` and `src/firefox/pdf-pipeline.js:26` — there is no shared constant import. The Firefox pipeline was extracted from offscreen.js during the v2.0 Firefox port (Phase 14), and the duplication has persisted.

**How to avoid:** Grep for `CACHE_VERSION` before merging any algorithm change. Better: refactor to import from `src/shared/constants.js`. This may belong in a follow-up phase but is **out of scope for Phase 23** per REQUIREMENTS.md "no new features."

**Warning signs:** `grep -rn "CACHE_VERSION" src/` returns more than two hits OR the two hits show different version strings. [VERIFIED: 2026-05-12, both hits show `'v3'`]

### Pitfall 2: Adding the "magic 200" cap back

**What goes wrong:** Reintroducing `if (column > 200) return null` re-creates the exact brittleness the v2.3 work fixed. The original bug was that 999 was too loose; tightening to 200 is structurally the same bug at a different threshold.

**Why it happens:** REQUIREMENTS.md says "≤200" — easy to misread as a code constant.

**How to avoid:** Read the SUMMARY.md (`260412-fde-SUMMARY.md`) explanation: "Replaced the arbitrary max-column-number cap with two structural validations." The ≤200 is a derived consequence (no real patent has that many columns, so the sequential check will always reject impossible values long before they reach 200).

**Warning signs:** A PR diff that adds a numeric constant > 100 to position-map-builder.js, especially in the form `right > N`.

### Pitfall 3: Adding US10203551 fixture without re-recording the golden baseline

**What goes wrong:** Adding a new entry to `TEST_CASES` (`tests/test-cases.js`) without running `npm run update-golden` leaves the new case unmapped in `tests/golden/baseline.json`. `accuracy-report` will then mark it as a regression on every run.

**Why it happens:** The golden flow is two-step: edit the registry, then re-record. Easy to do only step 1.

**How to avoid:** Run `npm run update-golden -- --confirm` after every TEST_CASES edit. Verify `tests/golden/baseline.json` length increased by 1.

**Warning signs:** Diff includes a new case in `tests/test-cases.js` but no change to `tests/golden/baseline.json`.

### Pitfall 4: US10203551 PDF size in fixture commits

**What goes wrong:** The US10203551 PDF is multi-megabyte. Committing it bloats the repo. Other fixtures in `tests/fixtures/` are JSON PositionMap files (~tens of KB), not PDFs.

**Why it happens:** The natural reflex for an "integration test for a real PDF" is to commit the PDF.

**How to avoid:** Follow the existing fixture pattern — commit a `tests/fixtures/US10203551.json` produced by `scripts/generate-fixture.js`. The PDF can stay in `/tmp/` for one-time generation. [VERIFIED: all 22 existing fixtures are `.json`, none are `.pdf` — see `ls tests/fixtures/`]

**Warning signs:** A binary file > 100KB appears in the diff under `tests/fixtures/`.

### Pitfall 5: The Firefox manifest version is `2.2.0` but Chrome manifest is `2.3.0`

**What goes wrong:** Mismatched browser versions can cause user confusion or release-tag mismatches. Not blocking for Phase 23, but the planner should flag this so it surfaces in Phase 24 or Phase 25 if not before.

**Why it happens:** Commit `4e7a164` bumped only `src/manifest.json` (Chrome MV3) but not `src/manifest.firefox.json`. [VERIFIED: 2026-05-12 — `src/manifest.json:4` is `"2.3.0"`, `src/manifest.firefox.json:4` is `"2.2.0"`]

**How to avoid:** Phase plan should either (a) bump Firefox manifest as part of Phase 23 documentation pass, or (b) explicitly defer to Phase 24/25 with a note.

## Code Examples

### Verified Patterns from Source

#### Detecting two-column spec pages without printed column numbers
```javascript
// Source: src/offscreen/position-map-builder.js:666
export function isLikelySpecPage(items, pageHeight) {
  const headerThreshold = pageHeight - 90;
  const headerText = items
    .filter(it => it.y >= headerThreshold)
    .map(it => it.text)
    .join(' ');

  // Cover page
  if (headerText.includes('United States Patent')) return false;
  // Figure / drawing pages
  if (/Sheet\s+\d+\s+of\s+\d+/i.test(headerText)) return false;
  // Abstract continuation pages
  if (/\bPage\s+\d+\b/i.test(headerText)) return false;

  // Spec pages have dense body text
  const bodyItems = items.filter(it => it.y > 40 && it.y < headerThreshold);
  if (bodyItems.length < 80) return false;

  return true;
}
```

#### Structural validators in `extractPrintedColumnNumbers`
```javascript
// Source: src/offscreen/position-map-builder.js:180–187
  // Sanity check: right should be left + 1 (consecutive columns)
  if (right !== left + 1) return null;

  // Sanity check: left column must be odd (patent spec pages always have
  // odd-even pairs: 1,2 then 3,4 then 5,6 etc.)
  if (left < 1 || left % 2 !== 1) return null;

  return { left, right };
```

#### Cache key construction (client side)
```javascript
// Source: src/offscreen/offscreen.js:271
const url = `${WORKER_URL}/cache?patent=${encodeURIComponent(patentId)}&v=${CACHE_VERSION}`;
```

#### Cache key construction (worker side)
```javascript
// Source: worker/src/index.js:178
const key = `${version}:${patentNumber}`;
```

#### Debug script for diagnosing a real PDF
```javascript
// Source: scripts/debug-pdf.mjs (already exists; useful for generating US10203551 fixture)
// Usage: node scripts/debug-pdf.mjs /tmp/US10203551.pdf
import { extractPrintedColumnNumbers, buildPositionMap, isTwoColumnPage }
  from '../src/offscreen/position-map-builder.js';
// ... iterates pages, dumps header zone items, runs full buildPositionMap pipeline.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `right > 999` magic cap | Odd-left + sequential-cross-page validation | 2026-04-12, commit `001b572` | Catches patent-number substring contamination (203 from "10203551") without an arbitrary numeric cap. |
| Single-pass: skip pages with no printed col numbers | Two-pass: fallback infers from page order + `isLikelySpecPage` | 2026-04-12, commit `de3c4f9` | Supports PDFs where col numbers are rendered as graphics (US10203551 class). |
| `CACHE_VERSION = 'v2'` (and earlier `'v1'`) | `CACHE_VERSION = 'v3'` | 2026-04-12, commit `17e7876` | Invalidates pre-fix KV cache entries; all users re-parse with corrected logic. |

**Deprecated/outdated:**
- The "tighten cap from 999 → 200" approach (commit `e51ba1b`) was superseded one commit later by structural validation (`001b572`). The code today has neither cap — only the structural checks remain. The PLAN.md for the quick task (`260412-fde-PLAN.md`) describes the intermediate cap-tightening approach and is **historically informative but not current**.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 [VERIFIED: package.json:25] |
| Config file | `vitest.config.js` (root); `vitest.config.chrome.js` and `vitest.config.firefox.js` (variants) [VERIFIED: ls -la] |
| Quick run command | `npx vitest run tests/unit/position-map-builder.test.js` |
| Full suite command | `npm run test:src` (then `npm test` includes build + chrome + firefox + lint) [VERIFIED: package.json:6–12] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCY-04 | Reject patent-number substring "203" on first spec page | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "spurious column 203"` | YES — `tests/unit/position-map-builder.test.js:336` |
| ACCY-04 | Reject page that breaks sequential pattern (1,2 → 203,204) | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "sequential pattern"` | YES — `tests/unit/position-map-builder.test.js:323` |
| ACCY-04 | Odd-left validator rejects 4,5 | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "left column is even"` | YES — `tests/unit/position-map-builder.test.js:233` |
| ACCY-04 | `isLikelySpecPage` correctly classifies spec, cover, figure, abstract, sparse pages | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "isLikelySpecPage"` | YES — 5 cases at `tests/unit/position-map-builder.test.js:351–386` |
| ACCY-04 | Fallback inference produces sequential cols when headers have no numbers | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "infers sequential columns"` | YES — `tests/unit/position-map-builder.test.js:428` |
| ACCY-04 | Fallback skips cover and figure pages | unit | `npx vitest run tests/unit/position-map-builder.test.js -t "skips cover and figure"` | YES — `tests/unit/position-map-builder.test.js:438` |
| ACCY-04 | US10203551 integration: real or generated fixture produces sensible columns (≤120) | integration | NOT YET — would need `tests/fixtures/US10203551.json` + a test case in `tests/test-cases.js` | NO — **Wave 0 gap** (see below) |
| ACCY-05 | `CACHE_VERSION` is `'v3'` at both client sites | static-grep | `grep -c "const CACHE_VERSION = 'v3'" src/offscreen/offscreen.js src/firefox/pdf-pipeline.js` — expect 2 | YES (no automated assertion, but the constant exists; could be added as a unit test) |
| Regression | All 75 golden baseline cases still pass | accuracy report | `npm run accuracy-report` | YES — `scripts/accuracy-report.js` + `tests/golden/baseline.json` (75 keys) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/position-map-builder.test.js` (< 1 second; currently 14 ms for 30 tests)
- **Per wave merge:** `npm run test:src` (full vitest suite — covers position-map, matching, classifier, offscreen-matcher)
- **Phase gate:** `npm test` (full suite including build + Chrome + Firefox configs + web-ext lint) and `npm run accuracy-report` showing zero regressions vs 75-case baseline.

### Wave 0 Gaps

- [ ] **(Optional but recommended)** `tests/fixtures/US10203551.json` — Generate from a real US10203551 PDF using `scripts/generate-fixture.js` and `scripts/debug-pdf.mjs`. The current unit tests simulate the header-text shape but do not parse a real PDF end-to-end. Phase 23 success criterion #1 says "running the test suite against US10203551." If no fixture exists, this criterion is satisfied only by the **synthetic** unit test at `tests/unit/position-map-builder.test.js:336`, which is **functionally equivalent but not literally "US10203551."** The planner should decide whether to commit a real fixture.
- [ ] **(Optional)** A static-grep unit test asserting `CACHE_VERSION === 'v3'` at both client files, to prevent future skew. Could live in `tests/unit/shared-constants.test.js` or a new `tests/unit/cache-version.test.js`.
- [ ] **No framework install needed** — vitest is already installed and configured.

## Security Domain

Phase 23 is a pure accuracy/parser change with no new attack surface. No user input flows are introduced, no new network endpoints, no new authentication paths.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — `PROXY_TOKEN` flow unchanged |
| V3 Session Management | no | N/A — extension is stateless across loads |
| V4 Access Control | no | N/A |
| V5 Input Validation | no (no change) | PDF input is already validated by PDF.js; no new inputs introduced. |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for the patent-parsing stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed PDF triggers infinite loop in column-detection | Denial of Service | `extractTextFromPdf` already bounds work to `pdf.numPages`. The new fallback pass adds O(pages) more work but no unbounded loops. Reviewed at `src/offscreen/position-map-builder.js:754–765`. |
| Stale cache serves wrong column numbers (user-visible bug, not security) | Tampering (integrity) | `CACHE_VERSION` bump (the actual ACCY-05 mitigation). |
| Patent-number substring contamination → impossible column 203 | Tampering (integrity) | Odd-left + sequential validators in `extractPrintedColumnNumbers` and `buildPositionMap`. |

No new threat patterns introduced. Existing mitigations are sufficient.

## Sources

### Primary (HIGH confidence)

- `src/offscreen/position-map-builder.js` — Full file read; lines 36–780. Confirmed algorithm shape.
- `src/offscreen/offscreen.js:28, 271, 397` — CACHE_VERSION='v3' verified at all three call sites (definition, GET URL, POST URL).
- `src/firefox/pdf-pipeline.js:26, 192, 424, 427` — Same `CACHE_VERSION='v3'` mirrored in the Firefox pipeline.
- `worker/src/index.js:159–192` — Cache key construction `${version}:${patentNumber}`; confirms version-keyed namespace.
- `tests/unit/position-map-builder.test.js` — 30 tests; ran on 2026-05-12 09:24 UTC, all pass.
- `tests/golden/baseline.json` — Exactly 75 keys (`jq 'length'` = 75).
- `tests/test-cases.js` — TEST_CASES registry; 75 entries; no US10203551 entry.
- `scripts/debug-pdf.mjs`, `scripts/update-golden.js`, `scripts/accuracy-report.js` — Diagnostic and golden-update tooling already in place.
- Git history: commits `e51ba1b`, `001b572`, `db2edde`, `de3c4f9`, `17e7876`, `4e7a164` — full commit messages confirm the v2.3 work landed pre-roadmap.
- `.planning/quick/260412-fde-fix-spurious-results-reporting-impossibl/260412-fde-SUMMARY.md` — Authoritative record of the structural-validation approach.
- `.planning/REQUIREMENTS.md` — v2.3 scope and out-of-scope items.
- `.planning/ROADMAP.md` lines 93–103 — Phase 23 success criteria.

### Secondary (MEDIUM confidence)

- None needed. All claims verified against source files in this repo.

### Tertiary (LOW confidence)

- None. The phase is retroactive documentation of code already on `main`; no external libraries are being introduced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No real US patent has > ~120 columns, so the sequential-validation check is sufficient on its own (no explicit `> 200` cap needed). | Architecture Patterns; Common Pitfalls #2 | Low. Even if a future patent has 150+ columns, the sequential check accepts it as long as the page-to-page progression is intact. The "≤200 derived bound" cited in REQUIREMENTS.md is descriptive, not a hard limit in code. |
| A2 | `CACHE_VERSION='v3'` is sufficient to invalidate the Cloudflare KV cache for all users — i.e., the Worker really uses the version as part of the key, not just for logging. | Project Constraints; Phase Requirements ACCY-05 | None. **Verified at worker/src/index.js:178** — `const key = \`${version}:${patentNumber}\``. Promoting this from ASSUMED to VERIFIED. |
| A3 | The "75 cases" cited in the phase description matches the actual baseline count. | Project Constraints | None. Verified at 75 via `jq 'length' tests/golden/baseline.json`. Promoting to VERIFIED. |
| A4 | Phase 23 does not need to commit a real US10203551 PDF fixture; the existing simulated unit tests are accepted as proof of success criterion #1. | Wave 0 Gaps | Medium. If the planner / user interprets criterion #1 strictly ("running the test suite against US10203551"), an integration fixture is required. The planner should decide this in plan-check. |

## Open Questions (RESOLVED)

1. **Should Phase 23 add an integration fixture for US10203551?** — **RESOLVED in Plan 03 (objective lines 71–72): include the fixture.** Plan 03 generates `tests/fixtures/US10203551.json`, adds a TEST_CASES entry, and regenerates `tests/golden/baseline.json` (75 → 76). Success criterion #5 is interpreted as "the 75 pre-existing cases continue to pass; the new case is additive evidence for criterion #1."
   - What we knew: The bug is reproduced by the unit tests at `tests/unit/position-map-builder.test.js:336` (spurious col 203 rejected) and `:428` (fallback pass produces sequential cols). The synthetic fixtures in `tests/fixtures/` are JSON PositionMaps, not PDFs.
   - What was unclear: Whether success criterion #1 ("running the test suite against US10203551") is satisfied by the synthetic equivalent or requires a real PDF parse-through.

2. **Should the Firefox manifest version be bumped to 2.3.0 as part of Phase 23?** — **RESOLVED in Plan 02 Task 2 (objective lines 50–51): bump here.** Plan 02 bumps `src/manifest.firefox.json:4` from `"2.2.0"` to `"2.3.0"` to match Chrome. Phase 24 can then focus purely on AMO lint cleanup.
   - What we knew: `src/manifest.json:4` is `"2.3.0"`; `src/manifest.firefox.json:4` is `"2.2.0"`. The mismatch happened at commit `4e7a164`.
   - What was unclear: Whether this is a Phase 23 follow-up or a Phase 24 (Firefox AMO cleanup) concern.

3. **Should `CACHE_VERSION` be moved to `src/shared/constants.js`?** — **RESOLVED in Plan 02 (objective line 52): deferred.** Out of scope per REQUIREMENTS.md "no new features." Plan 02's new `tests/unit/cache-version.test.js` mitigates the duplication-drift risk without refactoring. Reconsider in a future cleanup phase.
   - What we knew: Duplicated at two sites. Both currently show `'v3'`. Pitfall #1 in this research.
   - What was unclear: Whether REQUIREMENTS.md's "no new features" rule excludes a constant refactor.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, tests, scripts | YES | (system-dependent; CI uses Node 20) | — |
| npm | Dep install | YES | bundled with Node | — |
| Vitest | Unit + integration tests | YES (devDep installed) | ^3.0.0 | — |
| esbuild | Build pipeline | YES (devDep installed) | ^0.27.3 | — |
| pdfjs-dist | PDF parsing | YES (devDep installed; main worker bundled at src/lib/pdf.worker.mjs) | ^5.5.207 | — |
| US10203551 PDF | Optional integration fixture | NOT IN REPO | — | Use synthetic unit-test simulation (already in place) OR fetch from USPTO via `worker/`. |
| web-ext (Firefox lint) | `npm run test:lint` | Used via npx at test-time | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** US10203551 PDF — synthetic unit-test fixture covers the same code paths.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all dependencies already installed, all files inspected, tests verified passing.
- Architecture: HIGH — full file read of `position-map-builder.js`, all three key commits inspected via `git show`.
- Pitfalls: HIGH — pitfalls #1, #2, and #5 are verified facts (grepped CACHE_VERSION, read manifest files, read SUMMARY.md). Pitfalls #3 and #4 are pattern-knowledge from inspecting the existing fixtures and update-golden flow.
- Validation: HIGH — `npx vitest` actually executed and 30/30 tests pass.

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days; this is a stable, frozen-source phase — the work is already merged. The only risk to validity is someone modifying `position-map-builder.js` between now and plan execution.)

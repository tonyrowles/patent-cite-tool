# Phase 9: Accuracy Audit and Algorithm Fixes - Research

**Researched:** 2026-03-02
**Domain:** Patent citation matching accuracy — audit methodology, failure mode classification, algorithm fix patterns
**Confidence:** HIGH (all findings grounded in direct codebase inspection and test execution)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Audit Methodology**
- Expand the fixture corpus first for systematic coverage, targeting prosecution-relevant patent types (utility specs with dense technical language, claims with dependent chains, continuation families)
- Follow with a quick live spot-check on 10-15 real patents via Google Patents to catch HTML/PDF divergences fixtures can't simulate
- Every failure discovered becomes both: (1) a new test case in the corpus, and (2) an entry in a structured audit report with patent number, selected text, expected vs actual, failure category, and proposed root cause

**Failure Prioritization**
- Prioritize by frequency in real patent prosecution work — the patterns encountered most often in office action responses and amendments come first
- Specification body text and claims citations are equally important — both are used regularly in prosecution
- Fix total mismatches and no-match cases first; address systematic off-by-one patterns if time remains after higher-impact fixes

**Accuracy Reporting**
- No hard accuracy target — improve what we can without blocking store submission on a percentage
- Report both overall before/after accuracy AND per-category breakdown (modern, pre-2000, chemical, claims, cross-column, repetitive) so strengths/weaknesses are visible
- Keep existing accuracy summary in `npx vitest run` output; add a separate detailed report script (`npm run accuracy-report` or similar) for per-category analysis

**Fix Approach**
- Let the failure patterns dictate the fix approach per-pattern — some may need minimal patches, others may need new matching strategies; Claude decides based on what the audit reveals
- When a fix risks regressions: fix it and expand test cases to prove safety; update golden baseline with justification rather than skipping the fix
- Document all baseline changes (old vs new citation + brief reason) so they can be batch-reviewed rather than individually verified against PDFs

### Claude's Discretion
- Commit granularity — group related fixes or keep them separate based on the nature of each fix, as long as commit messages reference the failure mode addressed
- Confidence threshold adjustments — assess whether thresholds need tuning as part of algorithm fixes
- Detailed report script implementation approach
- Fixture expansion patent selection (within prosecution-relevant types)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCY-01 | Manual accuracy audit across broad patent sampling identifies failure patterns | Audit methodology section; structured audit report format; fixture expansion approach; live spot-check process |
| ACCY-02 | Algorithm fixes for highest-impact failure modes found during audit | Known failure mode analysis (US11086978 root cause); text-matcher.js and position-map-builder.js fix surfaces; normalizeText hyphen expansion pattern |
| ACCY-03 | All algorithm fixes validated against regression harness (no existing passing cases broken) | Vitest test infrastructure; golden baseline mechanics; update-golden.js workflow; off-by-one classifier integration |
</phase_requirements>

---

## Summary

Phase 9 operates on a stable, well-instrumented foundation: 44 test cases with a frozen golden baseline at 97.7% exact accuracy, a multi-strategy matching pipeline in `text-matcher.js`, and a complete test infrastructure using Vitest. The phase has a single known failure (`US11086978-spec-short`, confidence 0, no match) and zero regressions to recover — the work is purely additive improvement.

The known failure traces directly to a position-map-builder defect: `filterGutterLineNumbers` failed to strip the gutter line number "25" for one line on page 10 of US11086978, causing it to be concatenated into the column 1 text. The resulting garbled entry reads `"actions, borne by consumers, merchants and financial insti- 25 nected to a computer..."` — which means the selected text `"...financial insti- tutions."` finds no alpha-equivalent in the fixture's concat because `"insti"` is followed by `"25nected"` instead of `"tutions"`. This is a fixture data quality failure, not a text-matcher algorithm failure. The fix lives in `position-map-builder.js` (better gutter filtering or column boundary precision) with a fixture regeneration step.

Beyond the known failure, the audit process must expand the corpus to identify additional failure modes. The two most likely undiscovered failure categories are: (1) wrap-hyphen text where the user copies HTML text including the hyphen and space (e.g., `"trans- actions"`) while the concat has de-hyphenated `"transactions"` — the current whitespace-stripped match handles this when no other divergence is present, but may fail when combined with gutter number contamination; and (2) patents with unusual PDF structure (e.g., continuation patents, design patents with spec, reissue patents) that may produce fixture data with column-assignment errors. The fix-validate cycle is well-supported: run Vitest, inspect off-by-one warnings, update golden with justification.

**Primary recommendation:** Fix the known gutter-number contamination root cause in `position-map-builder.js`, regenerate the affected fixture, then systematically expand the corpus to 55-65 cases covering prosecution-typical patent types before beginning the live spot-check.

---

## Standard Stack

### Core (already installed, no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner, corpus execution, accuracy metrics | Already integrated; all test infrastructure uses it |
| pdfjs-dist | ^5.5.207 | PDF text extraction for new fixtures | Already used in generate-fixture.js |
| Node.js built-ins | v24.11.1 | File I/O for scripts (readFileSync, writeFileSync) | Zero-dep; generate-fixture.js, update-golden.js pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | Phase is pure JS/node script work | No new library needed; accuracy-report script uses same Node.js built-ins |

**Installation:** No new packages. Phase 9 uses only existing dependencies.

---

## Architecture Patterns

### Existing Project Structure (Phase 9 extends these)

```
src/
├── content/
│   └── text-matcher.js         # ALGORITHM FIXES go here (matchAndCite, whitespaceStrippedMatch, etc.)
└── offscreen/
    └── position-map-builder.js  # FIXTURE-QUALITY FIXES go here (filterGutterLineNumbers, etc.)

tests/
├── fixtures/                    # NEW FIXTURE JSON files added here
├── golden/
│   └── baseline.json            # Updated via update-golden.js after fixes
├── helpers/
│   └── classify-result.js       # Used in audit report and accuracy-report script
├── test-cases.js                # NEW TEST CASES registered here
└── unit/
    └── text-matcher.test.js     # Existing corpus tests — must stay green

scripts/
├── generate-fixture.js          # Used to expand corpus (existing)
├── update-golden.js             # Used after fixes (existing)
└── accuracy-report.js           # NEW script: per-category breakdown (to be created)
```

### Pattern 1: Audit Report Entry Format

Each discovered failure gets a structured entry. The locked decision says every failure becomes a corpus entry AND an audit report entry. The report format should mirror the off-by-one classifier's categories plus root cause.

**Recommended audit report format (JSON or Markdown table):**

```javascript
// Each entry in the audit report:
{
  id: "US11086978-spec-short",      // test case ID
  patentNumber: "US11086978",
  selectedText: "billions of dollars...",
  expected: null,                    // golden citation (null = no match expected)
  actual: null,                      // what the algorithm returns
  tier: "no-match",                  // exact | systematic | boundary | mismatch | no-match
  failureCategory: "gutter-contamination",  // categorize by root cause
  rootCause: "filterGutterLineNumbers missed '25' at line 25 column boundary",
  proposedFix: "Adjust filterGutterLineNumbers x-proximity threshold or boundary detection"
}
```

### Pattern 2: Fix-Validate-Update Cycle

The mandatory cycle for every algorithm change:

```
1. Write new test case in tests/test-cases.js (exercises the failure mode)
2. Confirm test fails against current algorithm (reproduces the failure)
3. Fix algorithm in text-matcher.js or position-map-builder.js
4. Run: npx vitest run
   - All 44 existing golden cases must pass (no regressions)
   - New case must pass
5. If golden baseline needs updating (fix changes a previously-passing citation):
   - Document old → new citation + brief reason in commit message
   - Run: npm run update-golden
6. Commit with message referencing the failure mode: "fix(matcher): handle gutter-contaminated wrap-hyphen text"
```

### Pattern 3: Accuracy Report Script

The `npm run accuracy-report` script should be a standalone Node.js ESM module in `scripts/`. It mirrors the accuracy metrics already in `text-matcher.test.js` but adds per-category breakdown.

```javascript
// scripts/accuracy-report.js — pattern
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEST_CASES, CATEGORIES } from '../tests/test-cases.js';
import { matchAndCite } from '../src/content/text-matcher.js';
import { classifyResult } from '../tests/helpers/classify-result.js';

// For each test case: load fixture, run matchAndCite, compare to golden, classify
// Group results by category
// Print per-category table + overall summary
```

The script should load `tests/golden/baseline.json` as the reference and print before/after if a `--baseline` flag is provided pointing to a saved pre-fix snapshot.

### Pattern 4: Fixture Expansion Workflow

```bash
# Add one patent
node scripts/generate-fixture.js US10XXXXXX

# Add multiple patents (batch)
node scripts/generate-fixture.js --batch patents.txt

# Then add selectedText entries to tests/test-cases.js manually
# (selectedText must be derived from the fixture's PositionMap text fields)
# Then run update-golden.js to capture baseline for new cases
npm run update-golden
```

### Anti-Patterns to Avoid

- **Skipping regression check:** Never update golden without first confirming `npx vitest run` passes for all 44 existing cases.
- **Fixture-derived selectedText divergence:** Never create a test case with selectedText that doesn't appear in the fixture PositionMap — the selected text must come from HTML which may include hyphens, spaces, or characters the PDF doesn't have. The `selectedText` in test-cases.js is HTML-derived; fixtures are PDF-derived.
- **Fixing in generate-fixture.js only:** A fixture regeneration fixes the stored JSON but does NOT fix the runtime extension behavior. Fixes to `position-map-builder.js` fix both.
- **Assuming golden = correct:** The golden baseline records what the algorithm produces, not what a human verified. Some golden entries may themselves be wrong (e.g., the US11086978-spec-short null/null — correct because the algorithm currently fails, but the correct citation should be 1:24-26). Verify against actual PDF when updating.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audit report aggregation | Custom accumulator | Extend the existing `results` array pattern from `text-matcher.test.js` | The pattern already groups by tier; just add category grouping |
| Per-category stats | New stats library | Reuse `classifyResult` from `tests/helpers/classify-result.js` | Already handles exact/systematic/boundary/mismatch |
| Fixture generation | Custom PDF scraper | `scripts/generate-fixture.js` already handles this end-to-end | Handles hash-based PDF URLs, pdfjs-dist Node build, position-map building |
| Golden update | Manual JSON editing | `npm run update-golden` | Prevents typos, runs entire corpus consistently |
| Fuzzy string matching | Custom Levenshtein | `fuzzySubstringMatch` in text-matcher.js already exists | 20% tolerance window already implemented |

**Key insight:** Everything needed for Phase 9 already exists in the codebase. No new libraries. All new work is: add test cases, diagnose failures, fix algorithms, run tests, update golden.

---

## Common Pitfalls

### Pitfall 1: Confusing Fixture Quality vs Algorithm Quality

**What goes wrong:** A failure in a test case is diagnosed as an algorithm bug when it's actually a fixture data quality bug (or vice versa).

**Why it happens:** The fixture is PDF-derived, the selectedText is HTML-derived. When a fixture entry has garbled text (e.g., gutter number embedded), no algorithm fix can compensate — the data is structurally wrong.

**How to avoid:** For each failure, inspect the fixture entry near the expected match location. Look for: embedded numbers (gutter line markers), merged column text, missing entries, duplicate entries.

**Warning signs:** The match fails completely (no-match) rather than being off by a few lines. The fixture entry has unusually wide width (spanning both columns). Alpha-only comparison also fails.

**Current example:** `US11086978-spec-short` fails because entry at col 1, line 25 has width 448pt (spans both columns) and contains embedded text from column 2.

### Pitfall 2: Wrap-Hyphen + Additional Divergence Compound Failure

**What goes wrong:** Text with a wrap hyphen (`"trans- actions"`) fails even though whitespaceStrippedMatch handles it — because a second divergence (e.g., embedded gutter number between hyphenated segments) makes the stripped form non-matching.

**Why it happens:** `whitespaceStrippedMatch` strips whitespace but not hyphens. `selStripped` = `"trans-actions"`, `concatStripped` = `"transactions"` — these differ due to the `-`. The punctuation-agnostic branch strips both to `"transact..."`, but if gutter contamination also affects the surrounding text, the alpha match also fails.

**How to avoid:** Expand `normalizeText` to strip word-wrap hyphens (hyphens followed by a space) from the selected text before matching. The heuristic: if a hyphen is followed by a space and then a lowercase letter, it's a wrap hyphen in the HTML-copied text and should be removed.

**Code insight:**
```javascript
// In normalizeText, add after existing transforms:
// Strip word-wrap hyphens: "trans- actions" → "transact ions" (then whitespace collapse handles the rest)
.replace(/- (?=[a-z])/g, '')  // "insti- tutions" → "stitutions" (still needs work)
// Better: strip hyphen+space entirely, let the next transform collapse whitespace
```

Note: The correct fix is more nuanced — "insti-\n tutions" becomes "insti- tutions" in HTML. After normalizeText collapses whitespace, it's "insti- tutions". The hyphen is a real character. The fix should strip `"- "` (hyphen-space) before a lowercase letter from the input, not from the concat.

### Pitfall 3: Gutter Line Number Contamination in Fixtures

**What goes wrong:** `filterGutterLineNumbers` misses a gutter number because the column boundary was computed slightly off for that page, placing the gutter number's x-coordinate outside the filter zone.

**Why it happens:** `filterGutterLineNumbers` uses `Math.abs(item.x - boundary) <= 40` and `Math.abs(item.x - pageMid) <= 40`. If the column boundary for a page is far from center (e.g., patent with uneven column widths), the gutter numbers near true center may be 40+ points from the computed boundary and also 40+ from pageMid.

**How to avoid:** Widen the gutter detection zone OR add a third anchor (e.g., right-column left margin). Alternatively, detect gutter numbers post-column-split: a number-only item in the left column's rightmost 20% is likely a gutter marker.

**Warning signs:** Fixture entry has text like `"...word 25 otherword..."` or `"...word 60 continuedword..."` where the number is a multiple of 5 between 5-65. Entry width spans nearly the full page width.

### Pitfall 4: selectedText Derived From Wrong Source

**What goes wrong:** New test cases are created with selectedText that matches the PDF (fixture) exactly rather than how it appears in Google Patents HTML — so the test passes trivially but doesn't test the real user scenario.

**Why it happens:** When exploring fixtures to create test cases, it's tempting to copy text directly from the fixture JSON. But users copy from the Google Patents HTML page which has different whitespace, hyphenation, and sometimes character normalization.

**How to avoid:** For new test cases, copy the selectedText from Google Patents in a browser (or derive it from actual live spot-check text). For fixture-derived tests, ensure the selectedText includes realistic HTML artifacts (wrap hyphens with spaces, collapsed whitespace sequences).

### Pitfall 5: Baseline Update Without Documentation

**What goes wrong:** `npm run update-golden` is run after a fix, silently updating citations for multiple test cases. Reviewers can't tell which changes were intentional vs regressions.

**Why it happens:** update-golden.js overwrites the entire baseline in one operation. Every changed citation appears as a git diff but with no context.

**How to avoid:** Before running update-golden, document the expected changes in the commit message: "US11086978-spec-short: null → 1:24-26 (fix: gutter contamination resolved)". After running, verify the diff matches expectations exactly.

---

## Code Examples

### Inspecting a Known Failure

```javascript
// Run directly to diagnose why a test case fails
// node --input-type=module << 'EOF'
import { matchAndCite, normalizeText } from './src/content/text-matcher.js';
import { readFileSync } from 'fs';

const fixture = JSON.parse(readFileSync('./tests/fixtures/US11086978.json', 'utf-8'));
const selectedText = 'billions of dollars of yearly damages from fraudulent trans- actions...';

// Step 1: Check normalized form
const norm = normalizeText(selectedText);
console.log('Normalized:', norm);

// Step 2: Build concat manually to inspect what the algorithm sees
let concat = '';
for (let i = 0; i < fixture.length; i++) {
  const entry = fixture[i];
  let lineText = normalizeText(entry.text);
  const prev = fixture[i-1];
  const prevIsWrapHyphen = prev && prev.column === entry.column && /^[a-z]/.test(lineText) && (
    prev.hasWrapHyphen || concat.endsWith('-') || /[-\u00AD\u2010\u2011\u2012]\s*$/.test(prev.text)
  );
  if (prevIsWrapHyphen) { concat = concat.replace(/-$/, ''); }
  else if (concat.length > 0) { concat += ' '; }
  concat += lineText;
}

// Step 3: Compare stripped forms
const stripped = norm.replace(/\s/g, '');
const concatStripped = concat.replace(/\s/g, '');
console.log('Stripped match:', concatStripped.includes(stripped));

// Step 4: Compare alpha-only forms
const alpha = stripped.replace(/[^a-zA-Z0-9]/g, '');
const concatAlpha = concatStripped.replace(/[^a-zA-Z0-9]/g, '');
console.log('Alpha match:', concatAlpha.includes(alpha));
// 'EOF'
```

### Adding a New Test Case (after fixture generated)

```javascript
// In tests/test-cases.js, add to TEST_CASES array:
{
  id: 'USXXXXXXX-category',
  patentFile: './tests/fixtures/USXXXXXXX.json',
  selectedText: 'text as copied from Google Patents HTML page',
  category: 'modern-short',  // one of the 8 categories in CATEGORIES
},
```

### Running the Full Accuracy Check

```bash
# Quick: run all 44 (or more) cases, see accuracy metrics
npx vitest run

# After algorithm fix: see if new/changed cases are captured
npm run update-golden
# (requires reviewing the git diff to confirm only intended changes)
```

### Fix Pattern: normalizeText for Wrap-Hyphen in HTML-Copied Text

```javascript
// Source: direct analysis of US11086978 failure
// In src/content/text-matcher.js, normalizeText():
// Add this line AFTER whitespace collapse, BEFORE the return:
// Strip HTML-copy wrap hyphens: "insti- tutions" → "institutions"
// Pattern: hyphen + optional space + lowercase letter
.replace(/- ([a-z])/g, '$1')  // "trans- a" → "transa" (then already in word)
// NOTE: This must only run when the hyphen is clearly a wrap hyphen
// (followed by space then lowercase) — not "well-known" or "non-obvious"
```

**Critical caveat:** `"- "` is also valid in hyphenated compound words. The heuristic only applies when a hyphen is followed by a space and then a continuation character (lowercase letter starting a syllable). Distinguish: `"well- known"` (incorrect HTML artifact) vs `"well-known"` (real hyphen, no space). The space after the hyphen is the key discriminator.

### Accuracy Report Script Skeleton

```javascript
// scripts/accuracy-report.js
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEST_CASES, CATEGORIES } from '../tests/test-cases.js';
import { matchAndCite } from '../src/content/text-matcher.js';
import { classifyResult } from '../tests/helpers/classify-result.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const GOLDEN = JSON.parse(readFileSync(resolve(ROOT, 'tests/golden/baseline.json'), 'utf-8'));

const byCat = {};
for (const cat of Object.keys(CATEGORIES)) {
  byCat[cat] = { total: 0, exact: 0, systematic: 0, boundary: 0, mismatch: 0, noMatch: 0 };
}

for (const tc of TEST_CASES) {
  const fixture = JSON.parse(readFileSync(resolve(ROOT, tc.patentFile.replace(/^\.\//, '')), 'utf-8'));
  const result = matchAndCite(tc.selectedText, fixture);
  const golden = GOLDEN[tc.id];
  const classification = classifyResult(golden?.citation ?? null, result?.citation ?? null);
  const cat = byCat[tc.category];
  cat.total++;
  cat[classification.tier === 'no-match' ? 'noMatch' : classification.tier]++;
}

// Print per-category breakdown
// ...
```

---

## Known Failure Mode Analysis (Current State)

### KF-1: US11086978-spec-short (the only current golden no-match)

**Root cause:** Fixture data quality — `position-map-builder.js` gutter line number filter missed the number `"25"` on page 10, column 1. The "25" became embedded in the left column's line 25 entry, producing:

```
Entry col 1, line 25: "actions, borne by consumers, merchants and financial insti- 25 nected to a computer from being hijacked by a malicious"
Entry col 1, line 26: "tutions."
```

Instead of:
```
Entry col 1, line 25: "actions, borne by consumers, merchants and financial insti-"
Entry col 1, line 26: "tutions."  (after wrap-hyphen join: "institutions")
```

**Why the filter missed it:** The entry width is 448pt, spanning nearly the full page width. This suggests two columns were merged — the column boundary detection placed the "25" on the same side as column 1, and it was too far from both `boundary` and `pageMid` to pass the 40-point proximity filter, OR the "25" item's x-coordinate was slightly inside the column 1 region after boundary detection.

**Fix surfaces:**
1. `position-map-builder.js: filterGutterLineNumbers` — widen zone or add right-column-anchor detection
2. `position-map-builder.js: buildPositionMap` — post-split scan for single-digit-multiple-of-5 items in wrong column
3. `text-matcher.js: normalizeText` — strip embedded `" NN "` (space-number-space) patterns that look like gutter markers in the matched text (defensive, not primary fix)
4. Regenerate `tests/fixtures/US11086978.json` after fixing position-map-builder

**Expected citation after fix:** The text "billions of dollars of yearly damages from fraudulent trans- actions, borne by consumers, merchants and financial insti- tutions." should match col 1, lines 24-26. Expected citation: `1:24-26`.

---

## Audit Expansion Guidance

### Prosecution-Relevant Patent Types (Prioritized for Corpus Expansion)

Based on locked decision to target "prosecution-relevant patent types":

1. **Utility specs with dense technical language** — software, biotech, chemical process patents. Already covered by US11427642 (antibody), US9688736 (glucagon). Expand with: continuation applications (share spec text with parent, different claims), mechanical patents (different PDF formatting era).

2. **Claims with dependent chains** — Multi-dependent claims ("A method of claim 1, further comprising..."). Currently only 1-2 claim selections per patent. Adding a dependent claim selection tests the repetitive-term matching under claim numbering.

3. **Continuation families** — Same spec text, different patent numbers. Tests that the fixture generation and matching work for re-issued and continuation patents where the PDF may have different formatting metadata.

4. **Pre-2000 patents with different PDF quality** — Older patents scanned and OCR'd may have more character-level noise. US4723129 (1988) and US5440748 (1995) are covered. Expand with 1970s-1980s patents if prosecution work covers them.

### Categories Currently Under-Represented (Based on Test Case Audit)

| Category | Current Count | Target | Gap |
|----------|--------------|--------|-----|
| modern-short | ~10 | 12-15 | +2-5 |
| modern-long | ~8 | 10-12 | +2-4 |
| pre2000-short | 2 | 4-6 | +2-4 |
| pre2000-long | 2 | 4-6 | +2-4 |
| chemical | 4 | 6-8 | +2-4 |
| cross-column | 6 | 8-10 | +2-4 |
| claims | 8 | 10-12 | +2-4 |
| repetitive | 6 | 8-10 | +2-4 |

**Target:** Expand from 44 to 55-65 cases before the live spot-check, then add spot-check failures as additional cases.

### Live Spot-Check Protocol (10-15 Patents)

The locked decision calls for a quick live spot-check via Google Patents to catch HTML/PDF divergences fixtures can't simulate. Recommended approach:

1. Open 10-15 real patent pages in Chrome with the extension active
2. Select text of varying length (1-2 lines, paragraph, claim) from each
3. Record: patent number, selected text, citation returned, tier (correct/wrong/no-match)
4. For each failure: generate fixture if one doesn't exist, add test case, add audit report entry

The spot-check is specifically for finding **HTML-specific divergences** not captured by fixtures — dynamic text reflow on Google Patents, different character encoding in HTML vs PDF, section-specific formatting (abstract, description, claims in Google Patents HTML may differ).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.js` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` (same — no separate suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCY-01 | Audit identifies failure patterns with frequency | manual + script | `node scripts/accuracy-report.js` | ❌ Wave 0 |
| ACCY-02 | Algorithm fixes for highest-impact failures exist | unit | `npx vitest run` | ✅ (in text-matcher.test.js) |
| ACCY-03 | No previously-passing golden cases broken | unit | `npx vitest run` | ✅ (golden comparison already in test suite) |

### Sampling Rate
- **Per task commit:** `npx vitest run` — must pass all golden cases
- **Per wave merge:** `npx vitest run` — full suite green
- **Phase gate:** Full suite green + accuracy-report.js shows measurable improvement over pre-fix baseline

### Wave 0 Gaps

- [ ] `scripts/accuracy-report.js` — covers ACCY-01 (per-category breakdown script; new file)
- [ ] New fixture files for corpus expansion — covers ACCY-01/ACCY-02 breadth
- [ ] New entries in `tests/test-cases.js` for audit-discovered failures — covers ACCY-01/ACCY-02
- [ ] Updated `tests/golden/baseline.json` entries for new cases — covers ACCY-03

*(No new test framework needed — Vitest already installed and configured)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No corpus | 44-case golden baseline | Phase 8 | Can validate all fixes without regression |
| No off-by-one distinction | exact/systematic/boundary/mismatch classification | Phase 8 | Fixes can target specific tier |
| No accuracy metrics | Printed accuracy summary on every `vitest run` | Phase 8 | Immediate feedback on each change |
| Manual fixture creation | `scripts/generate-fixture.js` (automated) | Phase 8 | Corpus expansion is low-friction |

---

## Open Questions

1. **Gutter line number filter precision**
   - What we know: `filterGutterLineNumbers` uses `boundary ± 40pt` and `pageMid ± 40pt` zones
   - What's unclear: Whether widening the zone risks filtering legitimate content (e.g., line numbers in claims that happen to be multiples of 5)
   - Recommendation: Test with boundary ± 60pt first; inspect the problematic US11086978 page 10 to see where "25" was positioned

2. **normalizeText wrap-hyphen strip: false positive risk**
   - What we know: `"- "` before lowercase in HTML-copied text is almost always a wrap hyphen
   - What's unclear: Are there legal/technical terms in patents written as "e.g.,- the" or "vs.- something" that would be incorrectly stripped?
   - Recommendation: Implement as opt-in in `normalizeText` with a clear comment; the test corpus will reveal false positives

3. **Continuation patent fixture quality**
   - What we know: Continuation patents share spec text with parent applications
   - What's unclear: Whether Google Patents serves continuation PDFs with different formatting that would produce column-boundary or line-number errors in the fixture generator
   - Recommendation: Include at least 1 continuation patent in the corpus expansion to test this

4. **Accuracy report script: compare to saved pre-fix snapshot**
   - What we know: The user wants before/after metrics visible
   - What's unclear: Whether saving a pre-fix snapshot of the baseline is sufficient, or if live re-runs against the old algorithm are needed
   - Recommendation: Save `tests/golden/pre-fix-baseline.json` before any fix, then accuracy-report.js compares current algorithm vs that snapshot

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `src/content/text-matcher.js`, `src/offscreen/position-map-builder.js`, `tests/test-cases.js`, `tests/unit/text-matcher.test.js`, `tests/helpers/classify-result.js`, `tests/golden/baseline.json`, `scripts/generate-fixture.js`, `scripts/update-golden.js`
- Live test execution — `npx vitest run` output (2026-03-02): 44 cases, 43 exact, 1 no-match, 97.7% exact accuracy
- Direct failure analysis — Node.js execution tracing the US11086978-spec-short failure to `filterGutterLineNumbers` fixture contamination

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 8 decisions and accumulated context
- `.planning/REQUIREMENTS.md` — ACCY-01, ACCY-02, ACCY-03 definitions
- `.planning/phases/09-accuracy-audit-and-algorithm-fixes/09-CONTEXT.md` — User decisions

### Tertiary (LOW confidence)
- None — all findings verified against actual code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies directly verified in package.json and running test suite
- Architecture: HIGH — all patterns verified against existing codebase; no assumptions
- Pitfalls: HIGH — root cause of known failure traced through actual code execution; other pitfalls derived from direct code reading
- Fix recommendations: MEDIUM — gutter filter fix direction is clear, exact implementation must be validated against the actual page 10 data

**Research date:** 2026-03-02
**Valid until:** 2026-06-02 (stable domain — no external library changes affect this)

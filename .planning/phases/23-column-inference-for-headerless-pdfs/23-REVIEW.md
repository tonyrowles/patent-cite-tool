---
phase: 23-column-inference-for-headerless-pdfs
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - scripts/accuracy-report.js
  - scripts/update-golden.js
  - src/manifest.firefox.json
  - tests/fixtures/US10203551.json
  - tests/golden/baseline.json
  - tests/test-cases.js
  - tests/unit/cache-version.test.js
  - tests/unit/position-map-builder.test.js
findings:
  critical: 0
  warning: 0
  info: 5
  total: 5
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 23 ships test-only and data-only changes that harden the column-inference
path added to `src/offscreen/position-map-builder.js`. The behavioural changes
under test (structural validators, sequential cross-page invariant, fallback
column inference, `isLikelySpecPage`) all exist in the unmodified source file
and match the assertions, so the new tests provide real coverage rather than
testing-the-test.

Scope-specific verifications that passed:

- The cache-version guard correctly anchors both clients
  (`src/offscreen/offscreen.js:28` and `src/firefox/pdf-pipeline.js:26`) on
  `'v3'`; the regex tolerates whitespace around `=` and is anchored with the
  `^...;` multiline pattern, which is appropriate.
- `src/manifest.firefox.json` version `2.3.0` matches `src/manifest.json`
  `2.3.0` — no skew between Chrome and Firefox manifests.
- The `US10203551.json` fixture (556 entries, pages 8-12, columns 1-10,
  sections `description`/`claims` only) parses as valid JSON, has integer
  `page`/`column`/`lineNumber` fields on every entry, and a non-null `section`
  on every entry. Notably, no entry has column 203 — confirming that the
  structural validator+fallback path produced the intended sequential
  columns when the fixture was generated.
- `tests/golden/baseline.json` parses, contains 76 entries (matches
  `TEST_CASES.length === 76`), and includes the new `US10203551-spec-short`
  entry with citation `1:21-23` confidence `0.94`.
- Both scripts repoint from the removed `src/content/text-matcher.js` to
  `src/shared/matching.js`, which exists and exports `matchAndCite`.
- All exported function names referenced by `position-map-builder.test.js`
  (`extractGutterLineGrid`, `assignLineNumbersByGrid`, `assignLineNumbers`,
  `clusterIntoLines`, `buildLineEntry`, `extractPrintedColumnNumbers`,
  `isLikelySpecPage`, `buildPositionMap`) are present and exported in
  `src/offscreen/position-map-builder.js`.
- Test files rely on Vitest globals (`describe`, `it`, `expect`,
  `beforeAll`) without import; `vitest.config.js` sets `globals: true`, so
  this is correct.

No critical bugs, security issues, or warnings were found. The five
info-level findings below are quality nits in the diagnostic script and
clarity issues in test naming — none affect correctness of the shipped
guards or fixtures.

## Info

### IN-01: Misleading test name in `extractPrintedColumnNumbers` suite

**File:** `tests/unit/position-map-builder.test.js:251-257`
**Issue:** The test is named
`'returns null when single number inferred as left gives even left'`
but the assertion is the opposite: it expects the function to **succeed**
and return `{left: 203, right: 204}`. Single right value `204` infers
left = `203`, which is **odd** (passes the validator), so the test does
not exercise the "even left" path that its name advertises. Reading the
name in isolation gives a wrong mental model of the validator's behavior.
**Fix:** Rename to something like
`'accepts single right number whose inferred left is odd (e.g. 204 → 203,204)'`,
or add a sibling test that uses `'205'` (single right → left = `204` → even
→ returns `null`) so the name and assertion line up.

### IN-02: Dead/unused accumulators in `--compare` block

**File:** `scripts/accuracy-report.js:238-250`
**Issue:** `preTotal` and `preExact` are incremented inside the loop but
their final values are never read — the percentage printed on line 264
uses the hardcoded `preFixExactCount = preFixTotal - 1` instead (per the
comment on line 256: "Known: 43/44 exact"). This is leftover scaffolding
from an earlier comparison strategy. Now that the test registry has grown
to 76 cases, the hardcoded `- 1` is also no longer accurate as a generic
pre-fix accuracy metric, but that is a deliberate "compare against the
canonical 43/44 snapshot" decision documented inline.
**Fix:** Either remove the dead loop entirely:
```js
// remove lines 238-250 (the preTotal/preExact accumulator)
```
or repurpose them to drive the displayed percentage:
```js
const preFixAccPct = ((preExact / preTotal) * 100).toFixed(1);
```
Pick one. The current state where both exist and only the hardcoded one is
displayed is confusing to future readers.

### IN-03: Unused `currentAccPct`

**File:** `scripts/accuracy-report.js:258`
**Issue:** `const currentAccPct = pct(overallExact, overallTotal);` is
computed but never referenced. The same percentage is recomputed inline at
line 264 (`((overallExact / overallTotal) * 100).toFixed(1)`).
**Fix:** Either remove the assignment, or use it in the log line:
```js
console.log(`  Overall:  ${preFixAccPct}% -> ${currentAccPct} (delta ${deltaStr})`);
```
(Note: `pct()` already returns a string with `%` suffix, so the format
would shift slightly — pick one representation.)

### IN-04: String/number coercion in delta-sign check

**File:** `scripts/accuracy-report.js:261-262`
**Issue:** `delta` is assigned the result of `.toFixed(1)`, which returns a
**string**. The next line does `delta >= 0 ? \`+${delta}%\` : \`${delta}%\``
— this works because `>=` coerces the string to a number, but it is fragile
and reads ambiguously. A reader scanning the code might assume `delta` is a
number, and a future edit (e.g. prepending a unit) could silently break the
comparison.
**Fix:** Keep numeric and string forms separate:
```js
const deltaNum = (overallExact / overallTotal) * 100 - parseFloat(preFixAccPct);
const deltaStr = (deltaNum >= 0 ? '+' : '') + deltaNum.toFixed(1) + '%';
```

### IN-05: Misleading usage comment block in `update-golden.js`

**File:** `scripts/update-golden.js:8-15`
**Issue:** The usage docblock lists the same command twice with conflicting
explanations:
```
 *   npm run update-golden          # exits with error (safety check)
 *   npm run update-golden          # see package.json — passes --confirm automatically
```
Both lines show the identical invocation but claim opposite behavior. The
truth is encoded below (line 27: `--confirm` must be present, and the
package.json script supplies it), but the docblock as written is
self-contradictory and will confuse anyone diffing the doc against the
behavior.
**Fix:** Replace with the actual two commands:
```js
 * Usage:
 *   node scripts/update-golden.js          # exits with error (safety check)
 *   npm run update-golden                  # package.json passes --confirm
```
This keeps the safety-check guidance while making clear which invocation
triggers each path.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

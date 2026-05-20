---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 01
subsystem: testing
tags: [e2e, selection, treewalker, range-api, normalizer, vitest, playwright, sel-01]

# Dependency graph
requires:
  - phase: 26-playwright-harness-scaffolding
    provides: "tests/e2e/lib/selection.js stub + Playwright extension-loader + addInitScript shims; the Phase 26 throwing stub at SEL-01 is the file this plan replaces."
provides:
  - "tests/e2e/lib/selection.js — selectText({page, uniqueSubstring, requireExact?}) primitive used by every downstream Phase 27 spec (regression, smoke, silent) and consumed by Phase 28's verifier."
  - "tests/e2e/lib/selection.js — normalize + normalizeDeep canonicalizers for PDF↔HTML divergence, exported at module scope for unit testability."
  - "tests/unit/selection-text.test.js — 13 Wave 0 regression tests for the load-bearing whitespace + hyphen normalizer."
affects: [27-02, 27-03, 27-04, 27-05, 28, 29, 30]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TreeWalker + Range API for multi-node DOM selection inside page.evaluate (Playwright browser world)"
    - "Module-scope export + page.evaluate duplication for browser-world functions that also need Node-world unit tests"
    - "Two-pass normalize-then-deep-normalize fallback with explicit deep-to-basic offset mapping"
    - "Failure-class err.code constants (DOM_DRIFT, SELECTION_FAILED) — pre-allocated for Phase 28 RPT-02 reuse"

key-files:
  created:
    - "tests/unit/selection-text.test.js — 13 vitest cases covering basic/deep normalizer behavior + cross-divergence canonical form"
  modified:
    - "tests/e2e/lib/selection.js — full replacement of Phase 26 throwing stub with the production selectText + exported normalize/normalizeDeep"

key-decisions:
  - "Lookbehind-constrained deep regex: (?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z]) — eliminates over-collapse of standalone words ('a proliferation-inducing') and digit-suffix hyphens ('TRDL-1')."
  - "Deep-to-basic offset mapping IS implemented in selectText's TreeWalker fallback (not basic-only) — preserves correct text-node offsets when deep-normalize is used to locate the needle. Avoids the cross-divergence test-case fallout the plan flagged as a Plan 03 follow-up."
  - "Module-scope export PLUS in-page duplication for normalize/normalizeDeep — required because page.evaluate runs in browser world and cannot capture Node-world closures, yet vitest needs to import them in Node world."

patterns-established:
  - "Pattern 1 — TreeWalker over text nodes with a parallel 'normalized cursor' map: enables multi-node Range construction from a whitespace-collapsed substring lookup."
  - "Pattern 2 — Dispatch mouseup on document, not on the citation host: the content-script's host-guard at line 182 lets document-targeted events through, mirroring real-mouse selection on the body."
  - "Pattern 3 — Errors thrown with err.code populated, err.detail = full page.evaluate result object: gives Phase 28 verifier full diagnostic context without parsing the message string."

requirements-completed: [SEL-01]

# Metrics
duration: 8min
completed: 2026-05-14
---

# Phase 27 Plan 01: Selection Emulation Primitive Summary

**TreeWalker + Range API selectText primitive with whitespace+hyphen normalizer (basic + deep passes), exported module-scope for unit testability, 13 vitest regression tests covering all three PDF↔HTML divergence classes.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-14T19:33:06-07:00
- **Completed:** 2026-05-14T19:41:14-07:00
- **Tasks:** 2 (both auto + TDD)
- **Files modified:** 2 (1 created, 1 fully replaced)
- **Vitest count:** 216 → 229 (13 new tests added; full suite green)

## Accomplishments

- Replaced the Phase 26 throwing stub at `tests/e2e/lib/selection.js` with the SEL-01 production primitive (`selectText({page, uniqueSubstring, requireExact?})`) that runs the TreeWalker + Range API algorithm inside a single `page.evaluate`, dispatches one bubbling `mouseup` on `document`, and waits 250ms past the content-script's 200ms debounce.
- Exported `normalize` and `normalizeDeep` at module scope (duplicated inside the `page.evaluate` body for browser-world execution) so the load-bearing PDF↔HTML divergence canonicalizer is regression-protected by `tests/unit/selection-text.test.js` independently of the Playwright suite.
- Implemented the deep-to-basic offset mapping inside `selectText`'s TreeWalker fallback path. The plan flagged this as optional ("if too complex on a first pass, fall back to basic-only"); shipping it now means the cross-divergence `US11427642-spec-long` case will not need a Plan 03 retrofit.
- Added 13 vitest cases across three describe blocks: basic normalize (7), deep normalize (4), cross-divergence canonical form (2). The first run caught two over-collapse bugs in the deep regex; the lookbehind-constrained refinement passes all 13.

## Final Exported API

```js
// tests/e2e/lib/selection.js

/** @param {string} s @returns {string} */
export function normalize(s)

/** @param {string} s @returns {string} */
export function normalizeDeep(s)

/**
 * @param {{
 *   page: import('@playwright/test').Page,
 *   uniqueSubstring: string,
 *   requireExact?: boolean,
 * }} args
 * @returns {Promise<{
 *   ok: true,
 *   containerSelector: 'section[itemprop="description"]' | 'section[itemprop="claims"]' | 'main' | 'body',
 *   rectTop: number,
 *   rectLeft: number,
 *   usedDeep: boolean,
 * }>}
 * @throws {Error} err.code = 'DOM_DRIFT' | 'SELECTION_FAILED'; err.detail = full result object
 */
export async function selectText({ page, uniqueSubstring, requireExact = true } = {})
```

## Final Regex Patterns Shipped

```js
// normalize — covers whitespace + spaces-around-hyphen + spaces-before-punct
s.replace(/\s+/g, ' ')              // \s+ → ' '
 .replace(/\s*-\s*/g, '-')           // " - " → "-"
 .replace(/\s+([,;:])/g, '$1')      // " ;" → ";"
 .trim()                             // strip leading/trailing whitespace

// normalizeDeep — also fixes PDF line-wrap hyphenation
normalize(s).replace(
  /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
  '$1$2',
)
// Lookbehind: first letter must be word-internal (not "a" / "an").
// Trailing -[a-z]: hyphen must join another word fragment (not "-1" / "-2").
// Together: "prolif eration-inducing" → "proliferation-inducing"
//           "a proliferation-inducing" → unchanged
//           "and TRDL-1" → unchanged
```

## Deep-to-Basic Offset Mapping

**Implemented (not deferred).** When the basic-normalize haystack search returns -1 but deep-normalize finds the needle, `selectText` builds a `strippedSpacePositions` Set by re-running the deep regex against the basic-normalized haystack (with `exec()` in a loop, advancing `lastIndex = m.index + 1` to detect non-overlapping matches). It then walks `basicIdx` and `deepIdx` in lockstep: positions in `strippedSpacePositions` advance `basicIdx` only; all other positions advance both. This gives a precise `basicStart`/`basicEnd` pair that the TreeWalker's existing basic-only offset bookkeeping consumes without modification.

**Cross-divergence cases that benefit:** `US11427642-spec-long` (the headline test case). Any other test case in `tests/test-cases.js` whose `selectedText` exhibits the PDF line-wrap pattern (`<letters>" "<letters>4+-letter-fragment>`) is now machine-resolvable.

**Known gap, documented in unit tests:** The `US11086978-spec-short` needle (`"fraudulent trans- actions"` vs HTML `"fraudulent transactions"`) is NOT covered by the current `normalizeDeep` regex — the hyphen is followed by a space then a 7-letter word, but the regex pattern requires the hyphen at the END of the second group, not in the middle of a split-word fragment that follows. This is documented as a known limitation in `tests/unit/selection-text.test.js` "cross-divergence canonical form" → second `it()` case (an explicit `not.toBe` assertion plus stable basic-normalize equivalents). Plan 03's audit can decide whether to widen the regex (option A) or to edit the test-case `selectedText` (option B).

## Vitest Case Distribution

`tests/unit/selection-text.test.js` ships **13 it() cases** across three describe blocks:

| Block | Cases | Covers |
|-------|------:|--------|
| basic normalize | 7 | Whitespace collapse, tab/newline handling, leading/trailing trim, spaces-around-hyphens, spaces-before-punctuation, clean-string roundtrip, idempotency. |
| deep normalize | 4 | PDF line-wrap fix, idempotency, anti-tests (short words, digit-suffix hyphens). |
| cross-divergence canonical form | 2 | Full `US11427642-spec-long` needle equivalence; `US11086978` trans-actions gap documentation. |

**Coverage by divergence class** (per `27-RESEARCH.md "PDF↔HTML Text Divergence"`):
- **Class 1 (PDF line-wrap hyphenation):** 3 cases (`prolif eration-inducing`, `prolif eration` idempotency, full US11427642-spec-long).
- **Class 2 (PDF space-around-punct):** 2 cases (`TNFSF13 ;` → `TNFSF13;`, full US11427642-spec-long).
- **Class 3 (PDF dehyphenated-with-space):** 2 cases (`TALL - 2` → `TALL-2`, full US11427642-spec-long).
- **Anti-tests (must NOT collapse):** 3 cases (`a quick fox`, `the the the`, `TALL-2 and TRDL-1`).
- **Idempotency / control:** 3 cases (clean roundtrip, normalize×2, normalizeDeep×2).

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-agent worktree convention):

1. **Task 27-01-01: selectText implementation** — `8380dca` (feat) — Replaces Phase 26 stub with full TreeWalker + Range + dispatched mouseup primitive; exports normalize + normalizeDeep at module scope; implements deep-to-basic offset mapping.
2. **Task 27-01-02: selection-text normalizer vitest** — `ddd564d` (test) — Adds 13 unit tests; TDD red phase exposed two over-collapse bugs in the deep regex; refined to lookbehind-constrained pattern in the same commit per the plan's "iterate until all assertions pass" directive.

_Note: Task 27-01-02 is a single combined `test() + fix()` commit because the plan explicitly directs iteration of the regex during test development (step 4 of the task action block: "Iterate until all 8+ assertions pass"). Splitting into a separate refactor commit would have been theatre._

## Files Created/Modified

- **`tests/e2e/lib/selection.js`** (modified, full replacement) — 418 insertions / 9 deletions. Implements selectText + exports normalize + normalizeDeep. The page.evaluate body contains the TreeWalker walk, deep-to-basic offset mapper, Range construction, round-trip verification, and mouseup dispatch.
- **`tests/unit/selection-text.test.js`** (created) — 13 vitest cases across 3 describe blocks.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Deep-to-basic offset mapping implemented, not deferred. | The plan's `<output>` requested clear disposition. Implementing it now is ~30 lines and removes the only known Plan-03 follow-up the plan called out. |
| Lookbehind regex `(?<=[a-zA-Z])` chosen over a simpler `[a-z]+ [a-z]{4,}-` pattern. | The lookbehind constraint is cheaper to read and reason about than enumerating valid prefixes; modern V8 (Chromium 120+) and Node 18+ both support lookbehind without performance cost. |
| Combined test + regex-fix in a single commit for Task 27-01-02. | The plan explicitly directs iteration during the same task action block; this is anticipated work, not a deviation. |
| Documented the US11086978 trans-actions gap as a `not.toBe` test assertion rather than masking it. | Explicit gap documentation in vitest is more discoverable than a code comment; Plan 03 audit can choose the fix path. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Refined deep-normalize regex to eliminate two over-collapse cases**

- **Found during:** Task 27-01-02 (TDD red phase)
- **Issue:** The plan's suggested regex `([a-z]) ([a-z]{4,}-)/gi` was too permissive:
  - `normalizeDeep('TALL-2 and TRDL-1')` produced `'TALL-2 andTRDL-1'` (collapsed the space in "and TRDL")
  - `normalizeDeep('a proliferation-inducing')` (HTML form) produced `'aproliferation-inducing'`, breaking equivalence with the PDF form that processes to the same result through a different code path
- **Fix:** Tightened to `(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g`. Lookbehind requires the first letter to be word-internal (not a standalone word like "a" or "an"); trailing `-[a-z]` requires the hyphen to join another lowercase-word fragment (not a digit suffix like "-1" or "-2").
- **Files modified:** `tests/e2e/lib/selection.js` (both the module-scope export and the in-page-evaluate duplicate, plus the deep-to-basic offset-mapping regex inside `selectText` to keep dropped-character positions consistent)
- **Verification:** All 13 vitest cases pass; full suite 229/229 green; `node --check` passes.
- **Committed in:** `ddd564d` (Task 27-01-02 commit — same commit as the test additions, per plan-directed iteration)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug found via TDD red phase, fix anticipated by plan).
**Impact on plan:** Net positive — the refined regex is strictly more correct than the plan's draft, and the cross-divergence test case (the headline US11427642-spec-long needle) now passes deterministically. No scope creep.

## Issues Encountered

None beyond the TDD-anticipated regex iteration documented above.

## Threat Flags

None. This plan ships only test-side code (no production changes, no new dependencies) and inherits Phase 26's `@playwright/test@1.60.0` pin and the existing `vitest@^3.0.0` dev dependency. No new network endpoints, file access patterns, or trust boundary changes.

## Next Phase Readiness

- `selectText` is ready for Plan 27-02 (regression spec) and Plan 27-03 (silent-mode spec) to consume — both will call `await selectText({ page, uniqueSubstring: tc.selectedText })` per `27-RESEARCH.md` Pattern 2.
- The `normalize` / `normalizeDeep` exports are also ready for any downstream code that needs PDF↔HTML text canonicalization (e.g., Phase 28 verifier's "search for selected text near cited column:line" step may want to use the same canonical form).
- One documented gap (`US11086978` trans-actions hyphen-then-space) deferred to Plan 03 audit per the plan's permission to either widen the regex or edit the test-case selectedText. Recorded as an explicit `not.toBe` assertion in `tests/unit/selection-text.test.js` so it shows up if anyone tries to "fix" the regex in a way that masks the gap.

## Self-Check: PASSED

- `tests/e2e/lib/selection.js` — FOUND (modified)
- `tests/unit/selection-text.test.js` — FOUND (created)
- Commit `8380dca` (feat) — FOUND
- Commit `ddd564d` (test) — FOUND
- `node --check tests/e2e/lib/selection.js` — exit 0
- `npm run test:src` — 229/229 passing
- `npm run test:src -- tests/unit/selection-text.test.js` — 13/13 passing
- Phase 26 stub message removed — verified absent
- All 12 grep acceptance checks for Task 27-01-01 — PASS
- All 8 acceptance checks for Task 27-01-02 — PASS

---
*Phase: 27-selection-emulation-76-case-deterministic-suite*
*Plan: 01*
*Completed: 2026-05-14*

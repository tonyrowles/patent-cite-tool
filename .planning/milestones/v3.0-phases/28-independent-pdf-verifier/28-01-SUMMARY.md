---
phase: 28-independent-pdf-verifier
plan: 01
subsystem: testing
tags: [pdfjs, pdf-verifier, tier-matcher, vitest, calibration-prep, @napi-rs/canvas]

requires:
  - phase: 27-regression-harness
    provides: TIMEOUT_PILL_DEFERRED_IDS (10 cases awaiting verifier adjudication)
provides:
  - tests/e2e/lib/pdf-verifier.js (verifyCitation, runMatcher, parsePdf, inferColumnLine, parseCitation)
  - tests/e2e/lib/pdf-fetch.js (ensureCachedPdf — Google Patents PDF scrape + cache)
  - 15 vitest unit tests covering 4-tier matcher (A exact / B ws-norm / C ±2 fuzzy / D fail), cross-column citations, signed offsets, page-id-ambiguity edge cases
  - @napi-rs/canvas@1.0.0 dev dep (exact-pinned, prebuilt N-API binary, no native cairo/pango)
  - .gitignore entry for tests/e2e/.pdf-cache/
affects: [28-02 (report.js consumes Verdict shape), 28-03 (pdf-snippet.js shares pdfjs init), 28-04 (ESLint rule scopes to pdf-verifier.js), 28-05 (calibration uses verifyCitation against 65 cases)]

tech-stack:
  added: ["@napi-rs/canvas@1.0.0"]
  patterns:
    - "verifyCitation pure-function pipeline (fetch → cache → parse → match → verdict)"
    - "Tiered matcher with first-hit-wins exit (Tier A → B → C → D)"
    - "Module-scope parsedCache Map to amortize parsePdf across multiple test cases on the same patent"
    - "Independence by construction: zero src/ imports, fresh column/line inference body"

key-files:
  created:
    - tests/e2e/lib/pdf-verifier.js (614 lines — verifier core)
    - tests/e2e/lib/pdf-fetch.js (95 lines — Google Patents PDF fetch + cache)
    - tests/unit/pdf-verifier.test.js (257 lines — 15 vitest cases)
    - .planning/phases/28-independent-pdf-verifier/deferred-items.md
  modified:
    - package.json (added @napi-rs/canvas@1.0.0 exact)
    - package-lock.json (lockfile sync)
    - .gitignore (added tests/e2e/.pdf-cache/)

key-decisions:
  - "Pin @napi-rs/canvas exactly to 1.0.0 (no caret) per Phase 26 precedent for new dev deps"
  - "Use pdfjs-dist/legacy/build/pdf.mjs (Node-friendly entry) — avoids DOMMatrix-not-defined error"
  - "Static (not dynamic) pdfjs import — matches plan's <verification> grep contract, ~50ms first-call cost acceptable"
  - "Tier C signed-offset algorithm uses tightest left-anchor of the sliding window, not first-fit (corrects intuitive offset interpretation)"
  - "Empty cited window → Tier D with self-diagnosing reason mentioning 'empty' or 'ambiguous' — distinguishes page-id failure from genuine no-match"

patterns-established:
  - "Pattern: verifier modules in tests/e2e/lib/ ESM-only, exported pure functions for unit testability"
  - "Pattern: PDF cache directory under tests/e2e/.pdf-cache/{patentId}.pdf, gitignored"
  - "Pattern: Fresh-body algorithm mirror — same heuristics as src/offscreen/position-map-builder.js, different variable names + loop styles (per RESEARCH.md Pattern 4 anti-copy-paste)"

requirements-completed: [VFY-01, VFY-03]

duration: 28min
completed: 2026-05-15
---

# Phase 28 Plan 01: Independent PDF Verifier Core Summary

**Independent PDF re-parser + 4-tier substring matcher (A exact → B ws-norm → C ±2-line fuzzy → D fail) using pdfjs-dist/legacy/build/pdf.mjs, zero src/ imports, 15 vitest cases green.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-05-15T16:38:00Z
- **Completed:** 2026-05-15T17:06:35Z
- **Tasks:** 3 (all auto, 2 TDD)
- **Files modified:** 6 (4 created, 2 amended)

## Accomplishments

- `verifyCitation({patentId, selectedText, observedCitation})` public entry returns a structured Verdict — the oracle module Phase 28-05 calibration will consume against the 65 currently-passing cases
- 4-tier substring matcher exits at first hit, returns `tier_used: 'A'|'B'|'C'|'D'` plus `match_offset_lines` (signed integer; null on Tier D) and `cited_text_window`
- Fresh column/line inference body — header/footer drop (top-90pt / bottom-40pt), bimodal x-histogram for column boundary, gutter-number filter (5/10/.../65), y-cluster ±3pt — mirroring `src/offscreen/position-map-builder.js` heuristics WITHOUT copy-paste or shared code path
- `parseCitation` handles 4 forms verified against tests/golden/baseline.json: `"1:26"` / `"1:26-27"` / `"1:67-2:3"` / `"79:81-80:3"`
- `ensureCachedPdf` scrapes the Google Patents HTML page for the `patentimages.storage.googleapis.com/...pdf` href, fetches with content-type + 5KB size sanity checks, persists to `tests/e2e/.pdf-cache/{id}.pdf`
- 15 vitest unit tests covering normal verdicts (Tiers A/B/C/D), cross-column citation linesFor handling, negative + positive Tier-C offsets, empty-window Tier-D self-diagnosis, whitespace-with-newline Tier-B — all green; no live PDF fetch required

## Task Commits

1. **Task 28-01-01: Install @napi-rs/canvas + .gitignore .pdf-cache** — `1ec7a11` (chore)
2. **Task 28-01-02 RED: failing tests for 4-tier matcher** — `67e427d` (test)
2. **Task 28-01-02 GREEN: pdf-verifier core + pdf-fetch** — `e85fc1e` (feat)
3. **Task 28-01-03: cross-column + offset-direction edge cases (tests 9-13)** — `47f9f9f` (test)
4. **Refactor: switch to static pdfjs legacy import** — `76f4147` (refactor — satisfies <verification> step 3 grep gate)

## Files Created/Modified

- `tests/e2e/lib/pdf-verifier.js` (NEW, 614 lines) — verifyCitation, runMatcher, parsePdf, inferColumnLine, parseCitation, plus _clearParsedCache / _parsedCacheSize test hooks
- `tests/e2e/lib/pdf-fetch.js` (NEW, 95 lines) — ensureCachedPdf with Google Patents scrape, content-type + size sanity, cache path resolution
- `tests/unit/pdf-verifier.test.js` (NEW, 257 lines) — 15 vitest cases across 3 describe blocks
- `package.json` (MODIFIED) — devDependencies."@napi-rs/canvas": "1.0.0" (no caret)
- `package-lock.json` (MODIFIED) — lockfile sync
- `.gitignore` (MODIFIED) — appended tests/e2e/.pdf-cache/
- `.planning/phases/28-independent-pdf-verifier/deferred-items.md` (NEW) — logs out-of-scope pre-existing text-matcher.test.js failures

## Tier Coverage Matrix

| Tier | Normal case | Edge case |
|------|-------------|-----------|
| A — exact substring | Test 1 (line 26, plasma cells) | — |
| B — whitespace-normalized | Test 2 (double-space line) | Test 13 (double-space + \n) |
| C — ±2 line fuzzy | Test 3 (offset +2), Test 10 (offset +2 explicit) | Test 9 (offset -1) |
| D — fail | Test 4 (3 lines off), Test 5 (absent text) | Test 12 (empty window → self-diagnosing reason) |
| parseCitation | Test 6a (single), 6b (range), 6c (cross-col 79:81-80:3), 6d (cross-col 1:67-2:3) | — |
| Cross-column | Test 11 (79:81-80:3 spans column boundary) | — |
| inferColumnLine | Test 7 (bimodal x distribution, 50 items, twoColumn:true) | — |
| | | |
| **Total** | **15 / 15 green** | |

## Verification Gate Results

All 5 acceptance gates from PLAN.md `<verification>`:

1. `npm run test:src -- tests/unit/pdf-verifier.test.js` → **15 passed** (target: ≥13)
2. `grep -E "from ['\"][^'\"]*src/" tests/e2e/lib/pdf-verifier.js tests/e2e/lib/pdf-fetch.js` → **0 matches** (no src/ imports — VFY-02 independence)
3. `grep -c "from 'pdfjs-dist/legacy/build/pdf.mjs'" tests/e2e/lib/pdf-verifier.js` → **1 match** (Pitfall 1 — legacy build for Node)
4. `grep '"@napi-rs/canvas"' package.json` → `"1.0.0"` (no `^` or `~`)
5. `grep 'tests/e2e/.pdf-cache/' .gitignore` → match (cache dir gitignored)

Plus install-time gate from Task 28-01-01:
- `node -e "import('@napi-rs/canvas').then(m=>{...console.log('LOAD_OK')})"` → `LOAD_OK` (Pitfall 6 — prebuilt binary verified)

## Decisions Made

- **Pinned `@napi-rs/canvas` at 1.0.0 exact** — `npm view @napi-rs/canvas version` reported 1.0.0 as stable at plan-execute time; pinned exactly per Phase 26 precedent. The package ships prebuilt N-API binaries for linux-x64, so the load probe passed without any `apt-get install libcairo2-dev` step.
- **Tier-C signed offset uses tightest left-anchor** — A naive sliding window would report `offset=0` for a needle that lives at line 28 when the cited line is 26 (because the window starting at line 26 + appending lines 27, 28 *does* contain the needle). Fixed by re-anchoring forward until the latest starting line that still yields a match, so the anchor represents where the needle truly begins.
- **Empty cited window → Tier D with diagnostic reason** — Distinguishes "page identification was wrong" from "text genuinely not there." Test 12 asserts the `reason` field contains `empty` or `ambig` so report consumers can fingerprint this failure mode.
- **Cross-column linesFor partitioning** — For `79:81-80:3`, the helper takes col 79 from line 81 to ∞, col 80 from line 1 to 3, joined in display order — supports the baseline.json `1:67-2:3` shape too.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Tier-C signed offset reported 0 instead of +2 for needle 2 lines below cited line**
- **Found during:** Task 28-01-02 GREEN — Test 3 failed asserting `match_offset_lines === 2`
- **Issue:** First-fit sliding-window join at the initial anchor counted the cited line as the match anchor because the joined text contained the needle, even though the needle's words first APPEAR two lines later
- **Fix:** Rewrote `findSignedOffset` to scan forward for the **latest** start anchor that still produces a match; that anchor's `lineNumber - range.startLine` gives the true signed offset
- **Files modified:** `tests/e2e/lib/pdf-verifier.js`
- **Verification:** Tests 3, 9, 10 all assert correct signed offsets (-1, +2, +2)
- **Committed in:** `e85fc1e` (Task 2 GREEN commit; bug surfaced and fixed during RED→GREEN cycle)

**2. [Rule 3 — Blocking] Plan's `<verification>` step 3 grep contract required static import**
- **Found during:** Final verification after Task 28-01-03
- **Issue:** Initial implementation used `await import(PDFJS_LEGACY)` (dynamic import via const) for unit-test perf — saves ~50ms on synthetic-data test runs. But the plan's check `grep -q "from 'pdfjs-dist/legacy/build/pdf.mjs'"` returned 0 matches, failing the contract
- **Fix:** Switched to top-level `import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'`. pdfjs only does meaningful init on `getDocument` call; the import alone is ~50ms one-time cost, negligible
- **Files modified:** `tests/e2e/lib/pdf-verifier.js`
- **Verification:** `grep -c "from 'pdfjs-dist/legacy/build/pdf.mjs'"` → 1; all 15 tests still green
- **Committed in:** `76f4147` (post-Task-3 refactor commit)

---

**Total deviations:** 2 auto-fixed (1 bug surfaced by RED test, 1 blocking grep contract).
**Impact on plan:** Both fixes essential for correctness. The Tier-C offset bug would have produced wrong diagnostics in calibration; the import-style fix unblocks the plan's <verification> gate. No scope creep.

## Issues Encountered

- **Pre-existing `tests/unit/text-matcher.test.js` failures (15 cases):** Verified by `git stash` round-trip — these failures exist on base commit `3ef1916` independently of Phase 28 work. Out-of-scope for Plan 28-01 per execute-plan SCOPE BOUNDARY rules; logged to `.planning/phases/28-independent-pdf-verifier/deferred-items.md` for Phase 28-05 calibration triage (the verifier's diagnostic output may reveal whether these are stale baselines or matcher regressions).
- **Synthetic two-column test required ≥50 items** to clear the production density threshold (`total < 30 → single-column`). Initial 20-item synthetic failed; bumped to 25/side. This preserved the production safety check while making the test runnable.

## User Setup Required

None — no external service configuration required. The PDF cache directory is created on first `ensureCachedPdf` call; no manual setup steps.

## Next Phase Readiness

- **Plan 28-02 (report.js + error-codes.js):** Ready — Verdict shape from this plan is the upstream input. The 8-string error class taxonomy can be derived from `verifier_verdict.status` ('disagree' → `VERIFIER_DISAGREE`) plus citation comparison.
- **Plan 28-03 (pdf-snippet.js):** Ready — `@napi-rs/canvas` is installed and load-probed; pdfjs `getDocument` works via the same legacy import path. snippet renderer can share the parsedCache pattern.
- **Plan 28-04 (ESLint no-restricted-imports):** Ready — `tests/e2e/lib/pdf-verifier.js` already has zero src/ imports and a banner comment documenting the contract. The lint rule's job is to prevent regression, not to fix anything today.
- **Plan 28-05 (calibration):** Pending. Recommended first action: live-smoke `verifyCitation({patentId:'US11427642', selectedText:'plasma cells and plasmablasts', observedCitation:'1:26-27'})` to confirm the end-to-end pipeline before running against all 65 cases.

## Self-Check: PASSED

- [x] tests/e2e/lib/pdf-verifier.js exists (614 lines, ≥200)
- [x] tests/e2e/lib/pdf-fetch.js exists (95 lines, ≥40)
- [x] tests/unit/pdf-verifier.test.js exists (257 lines, ≥80; 15 cases ≥13)
- [x] @napi-rs/canvas exact-pinned in package.json devDependencies
- [x] tests/e2e/.pdf-cache/ in .gitignore
- [x] Zero `from .../src/` imports in verifier files
- [x] `from 'pdfjs-dist/legacy/build/pdf.mjs'` present in pdf-verifier.js
- [x] All 5 task commits present in git log: 1ec7a11, 67e427d, e85fc1e, 47f9f9f, 76f4147

---
*Phase: 28-independent-pdf-verifier*
*Completed: 2026-05-15*

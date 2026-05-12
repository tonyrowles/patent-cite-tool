---
phase: 23-column-inference-for-headerless-pdfs
verified: 2026-05-12T11:10:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 23: Column Inference for Headerless PDFs — Verification Report

**Phase Goal:** The citation tool produces correct column numbers for granted patents whose PDFs omit printed column headers, with cache invalidation ensuring all users re-parse with the new logic.

**Verified:** 2026-05-12T11:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

This phase is a **retroactive ratification** of work that shipped to `main` between commits `001b572` (structural validation), `de3c4f9` (fallback inference), `17e7876` (CACHE_VERSION bump), and `4e7a164` (Chrome manifest bump). All four commits are present in git history. Phase 23 added (a) named guard tests pinning the invariants, (b) a static-grep cache-version guard test, (c) the Firefox manifest version alignment (2.2.0 → 2.3.0), and (d) a real-PDF integration fixture for the trigger case US10203551.

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running the test suite against US10203551 returns correct column numbers — no more column 203 | VERIFIED | `tests/fixtures/US10203551.json` (556 entries) has columns 1–10 only; `npm run accuracy-report` shows `US10203551-spec-short` citation `1:21-23` confidence 0.94 (modern-short category, 100% pass). Synthetic unit tests at `tests/unit/position-map-builder.test.js:336` (rejects spurious column 203) and new G4 guard (line 505) also pass. |
| 2 | Column numbers fall within structurally-validated upper bound (≤200), not arbitrary cap | VERIFIED | (a) `grep -nE "right > (100\|150\|200\|250\|300\|999)\|column > (100\|150\|200\|250\|300)" src/offscreen/position-map-builder.js` exits 1 with no matches — no numeric cap in source. (b) `Math.max` over all 76 baseline citations = column 134, well under 200. (c) US10203551 fixture max column = 10 (the actual patent has 10 columns). The ≤200 bound emerges from the sequential cross-page validator at line 744, not a coded constant. |
| 3 | When PDF has no printed column headers, columns are inferred from structural cues | VERIFIED | Two-pass design intact: primary pass at `position-map-builder.js:734` uses `expectedLeftCol` sequential validator; fallback pass at line 754 gated by `if (entries.length === 0)` calls `isLikelySpecPage` (line 666) to filter cover/figure/abstract pages by header text + body density (≥80 items). Unit tests "infers sequential columns" (line 428) and "skips cover and figure" (line 438) pass. The US10203551 fixture (headerless PDF) produced 556 entries with sequential columns 1–10 via this fallback path. |
| 4 | CACHE_VERSION bumped v2 → v3 so prior caches re-parse | VERIFIED | `src/offscreen/offscreen.js:28` and `src/firefox/pdf-pipeline.js:26` both declare `const CACHE_VERSION = 'v3';`. Wired into both GET URLs (offscreen.js:271, pdf-pipeline.js:192) and POST URLs (offscreen.js:397, pdf-pipeline.js:427). Worker constructs KV key as `${version}:${patentNumber}` (worker/src/index.js:178) — version change creates fresh keyspace. New static-grep guard at `tests/unit/cache-version.test.js` (4 tests, all pass) ensures drift fails CI. |
| 5 | All 75 existing golden baseline cases continue to pass (zero regressions) | VERIFIED (with documented retroactive interpretation) | `npm run accuracy-report` shows 76/76 exact, 100.0% across all 10 categories, 0 failures. Per phase context (orchestrator-approved): 74/75 pre-existing citations are byte-identical; 1 case `US6324676-cross-col` shifted soft boundary `1:66-2:2` → `1:67-2:2` (current value verified). The test framework treats boundary off-by-one as informational, not pass/fail. `npm test` exits 0 end-to-end (build + test:src + test:chrome + test:firefox + test:lint). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/offscreen/position-map-builder.js` | Two-pass column inference with structural validators (already on main; verified unmodified) | VERIFIED | All 6 structural-invariant greps match at expected line numbers (181, 185, 666, 695, 734, 744, 745, 754). `git diff --quiet` shows file is unmodified by Phase 23. Wired into `scripts/generate-fixture.js:220` via dynamic import. |
| `tests/unit/position-map-builder.test.js` | 30 existing tests + 4 new Phase 23 guard tests; min 460 lines | VERIFIED | 520 lines (60 lines over min); `Phase 23 structural-validator guards` describe block at line 473 with G1/G2/G3/G4 tests; `npx vitest run tests/unit/position-map-builder.test.js` reports `34 passed (34)`. |
| `tests/unit/cache-version.test.js` | Static-grep guard, min 30 lines | VERIFIED | 63 lines, exists, 4 tests pass. Reads both client files via `fs.readFileSync` and asserts (a) literal present in both, (b) identical, (c) exactly 'v3'. |
| `src/manifest.firefox.json` | Version "2.3.0" matching Chrome | VERIFIED | Line 4: `"version": "2.3.0"`. Matches `src/manifest.json:4` ("2.3.0"). `npm run test:lint` (web-ext lint) reports 0 errors, 0 warnings, 0 notices. |
| `tests/fixtures/US10203551.json` | Real-PDF position map, ≥50 entries, every column ≤200 | VERIFIED | 167,161 bytes (167 KB, well under 5 MB cap); 556 entries; minCol=1, maxCol=10; unique columns sequential 1,2,3,4,5,6,7,8,9,10. No PDF artifacts committed under tests/fixtures/ (Pitfall #4 satisfied). |
| `tests/test-cases.js` | TEST_CASES count 75 → 76 with `US10203551-spec-short` entry | VERIFIED | `TEST_CASES.length === 76` (programmatic check via dynamic import); `US10203551-spec-short` entry at line 584 referencing `./tests/fixtures/US10203551.json` (modern-short category). |
| `tests/golden/baseline.json` | 76 keys total including US10203551 citation | VERIFIED | `jq 'length'` returns 76; `has("US10203551-spec-short")` returns true; citation `"1:21-23"` confidence 0.94. Max column across all 76 entries = 134 (≤200). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `buildPositionMap` primary pass | `extractPrintedColumnNumbers` | called per page; result gated by sequential check (`colNums.left === expectedLeftCol`) | WIRED | Pattern `if (colNums.left !== expectedLeftCol) continue;` confirmed at line 744; advancement `expectedLeftCol = colNums.right + 1;` at line 745. |
| `buildPositionMap` fallback pass | `isLikelySpecPage` | only entered when `entries.length === 0` | WIRED | Gate `if (entries.length === 0)` confirmed at line 754. Fallback pass uses `isLikelySpecPage` (line 666) to filter pages. |
| Client extension (offscreen.js / pdf-pipeline.js) | Cloudflare Worker KV cache key | `/cache?patent=...&v=${CACHE_VERSION}` → worker builds `${version}:${patentNumber}` | WIRED | All 4 client URLs (GET+POST in both files) interpolate `&v=${CACHE_VERSION}`; worker key construction confirmed at `worker/src/index.js:178`. |
| `tests/unit/cache-version.test.js` | `src/offscreen/offscreen.js` + `src/firefox/pdf-pipeline.js` | `fs.readFileSync` + regex match `^const\s+CACHE_VERSION\s*=\s*'(v\d+)'\s*;` | WIRED | Test imports `readFileSync` and runs 4 assertions. All pass on current state ('v3' === 'v3'). |
| `scripts/generate-fixture.js` | `buildPositionMap` | dynamic import at line 220 | WIRED | `const { buildPositionMap } = await import('../src/offscreen/position-map-builder.js');` confirmed at line 220 of generate-fixture.js. This is how `tests/fixtures/US10203551.json` was produced. |
| `tests/test-cases.js US10203551 entry` | `tests/fixtures/US10203551.json` | `patentFile` field | WIRED | Line 585: `patentFile: './tests/fixtures/US10203551.json',`. File exists, JSON is valid, fixture is consumed by matchAndCite during accuracy-report. |

### Data-Flow Trace (Level 4)

Phase 23 is test/data-only — the production code path (`position-map-builder.js`) is verified unmodified. The data-flow path was traced via the live `npm run accuracy-report` execution:

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `tests/golden/baseline.json` | 76 citation entries | `scripts/update-golden.js` → `matchAndCite(positionMap, selectedText)` on each TEST_CASES entry | YES — 76/76 exact citations with non-null `citation` and `confidence` values | FLOWING |
| `tests/fixtures/US10203551.json` | 556 position-map entries (column/lineNumber/text/section) | `scripts/generate-fixture.js` (real PDF fetch) → `buildPositionMap` | YES — non-empty, sequential columns 1–10, real description+claims text | FLOWING |
| `accuracy-report` output | 76 case results | matchAndCite called per TEST_CASES entry | YES — 76/76 exact, 0 failures, per-category 100% | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 23 unit guards execute and pass | `npx vitest run tests/unit/position-map-builder.test.js` | `Tests 34 passed (34)` | PASS |
| Cache-version guard runs and passes | `npx vitest run tests/unit/cache-version.test.js` | `Tests 4 passed (4)` | PASS |
| Full src test suite green | `npm run test:src` (implicit via `npm test`) | exit 0 | PASS |
| Full repo test pipeline green | `npm test` (build + test:src + test:chrome + test:firefox + test:lint) | exit 0 | PASS |
| Accuracy report on 76 cases | `npm run accuracy-report` | 76/76 exact 100.0%, 0 failures | PASS |
| Firefox manifest is valid JSON at 2.3.0 | `node -e "JSON.parse(...)"` + `grep '"version": "2.3.0"'` | exits 0, prints `"version": "2.3.0",` | PASS |
| US10203551 fixture columns sequential and bounded | `node -e '...max/min(column)'` | minCol=1, maxCol=10, unique cols 1..10 | PASS |
| No PDF committed under tests/fixtures/ | `find tests/fixtures/ -name '*.pdf'` | empty output | PASS |
| `position-map-builder.js` unmodified | `git diff --quiet src/offscreen/position-map-builder.js` | exit 0 | PASS |
| No numeric column cap in source | `grep -nE "right > (100\|150\|200\|250\|300\|999)" src/offscreen/position-map-builder.js` | no matches (exit 1) | PASS |
| CACHE_VERSION='v3' at both sites | `grep -nE "^const CACHE_VERSION = 'v3';" src/offscreen/offscreen.js src/firefox/pdf-pipeline.js` | 2 matches, lines 28 and 26 | PASS |
| Pre-phase v2.3 commits present | `git log --oneline --all | grep -E "001b572\|de3c4f9\|17e7876\|4e7a164"` | all 4 commits found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ACCY-04 | 23-01, 23-03 | Citation tool produces correct column numbers for headerless PDFs (US10203551-class), inferred from structural cues, validated against ≤200 (derived, not arbitrary cap) | SATISFIED | Algorithm invariants pinned by 6 grep assertions + 4 new guard tests (G1-G4). US10203551 real-PDF fixture produces sequential 1–10. Baseline max column across all 76 cases = 134. No numeric cap in source. |
| ACCY-05 | 23-02, 23-03 | Position-map cache invalidates when extraction logic changes (CACHE_VERSION v2 → v3) | SATISFIED | CACHE_VERSION='v3' present at both client sites (lines 28 / 26). Wired into 4 URL constructions and 2 POST bodies. Worker KV key uses version. Static-grep guard test (4 assertions, all pass) ensures CI catches future drift. |

REQUIREMENTS.md maps Phase 23 → {ACCY-04, ACCY-05}. Both requirements are declared in plan frontmatters (ACCY-04 in 23-01 and 23-03; ACCY-05 in 23-02 and 23-03) and verified satisfied. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/unit/cache-version.test.js | — | — | — | Clean: no TODO/FIXME/HACK/PLACEHOLDER. |
| tests/unit/position-map-builder.test.js | — | — | — | Clean: no TODO/FIXME/HACK/PLACEHOLDER. |
| src/manifest.firefox.json | — | — | — | Clean: no anti-patterns. |
| tests/fixtures/US10203551.json | — | — | — | Generated artifact, no anti-patterns. |
| tests/test-cases.js | — | — | — | Clean. |
| tests/golden/baseline.json | — | — | — | Clean. |

The 23-REVIEW.md report identified 5 INFO-level findings (none CRITICAL or WARNING) — quality nits in `scripts/accuracy-report.js`, `scripts/update-golden.js`, and a misleading test name in `position-map-builder.test.js`. These do not affect correctness of the shipped guards or fixtures and do not block phase sign-off.

### Human Verification Required

None. All success criteria are verifiable programmatically and have been verified:
- Criteria #1, #2, #3 verified via unit-test invariants + real-PDF fixture sanity (max column ≤200, sequential 1–10).
- Criterion #4 verified via grep on source + 4-assertion guard test + worker key construction.
- Criterion #5 verified via `npm run accuracy-report` showing 76/76 exact + the orchestrator-approved interpretation of the 1 boundary-shifted citation as informational.

The 23-03 plan's `checkpoint:human-verify` (Task 4) was already exercised by the user per orchestrator checkpoint (per the prompt's context: "The user explicitly approved accepting the regenerated baseline as-is via orchestrator checkpoint").

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are satisfied. All 2 requirements (ACCY-04, ACCY-05) are satisfied. The phase is a clean retroactive ratification: structural validators and CACHE_VERSION bump shipped pre-phase, and Phase 23 added durable guards (unit tests + static-grep test + integration fixture) plus aligned the Firefox manifest version. No code-side production changes were necessary or made.

The single soft drift (`US6324676-cross-col` boundary shift from `1:66-2:2` to `1:67-2:2`) is documented in 23-03-SUMMARY's "Baseline Regeneration Drift" section, accepted by user via orchestrator checkpoint, and treated by the test framework as informational rather than pass/fail. The accuracy-report shows 76/76 exact with 0 failures, confirming criterion #5 is met under the documented interpretation.

---

_Verified: 2026-05-12T11:10:00Z_
_Verifier: Claude (gsd-verifier)_

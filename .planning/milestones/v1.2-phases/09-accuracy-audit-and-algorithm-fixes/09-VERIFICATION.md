---
phase: 09-accuracy-audit-and-algorithm-fixes
verified: 2026-03-03T20:15:00Z
status: gaps_found
score: 10/11 must-haves verified
gaps:
  - truth: "A live spot-check of 10-15 real patents via Google Patents has been performed with the extension active, and every failure discovered is captured as a new test case with fixture and accuracy-report entry"
    status: failed
    reason: "Task 3 (live spot-check) was explicitly skipped at user request. The ACCY-01 requirement and CONTEXT.md locked decision both mandate this step. No live spot-check was performed; no HTML/PDF divergence coverage from live patent pages exists."
    artifacts:
      - path: "tests/fixtures/"
        issue: "No spot-check fixture files exist (IDs like US*-spotcheck-* are absent from test-cases.js and the fixture directory has no such files)"
      - path: "tests/test-cases.js"
        issue: "No spot-check test cases added — all 71 entries are fixture-derived, none from live Google Patents HTML selection"
    missing:
      - "Live Chrome session spot-check of 10-15 real patents on patents.google.com with the extension active"
      - "New test cases (id pattern: USXXXXXXX-spotcheck-{category}) for each failure discovered during spot-check"
      - "Fixture files generated from any patents exhibiting HTML/PDF divergences not already in the corpus"
      - "Documentation of spot-check results: patents tested, pass rate, divergences found"
human_verification:
  - test: "Load the extension in Chrome and open 10-15 real patent pages on patents.google.com. Select text of varying length (short spec, long spec, one full claim) from each patent. Trigger the citation tool and verify the citation output is correct."
    expected: "Extension returns accurate citations for all selections. Any failures produce a test case with the exact HTML-copied selectedText as ACCY-01 requires."
    why_human: "Requires a live Chrome browser session with the extension installed. Cannot be verified programmatically — the divergences between HTML rendering and PDF text items are only observable in the live browser environment."
---

# Phase 9: Accuracy Audit and Algorithm Fixes — Verification Report

**Phase Goal:** The highest-impact citation failure modes are identified, fixed, and proven not to regress any previously-passing test case
**Verified:** 2026-03-03T20:15:00Z
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pre-fix baseline snapshot exists at tests/golden/pre-fix-baseline.json recording Phase 8 state before any algorithm change | VERIFIED | File exists, 44 entries, 43/44 exact (97.7%) — matches Phase 8 documented accuracy |
| 2 | `npm run accuracy-report` prints per-category accuracy breakdown for all 8 categories (modern-short, modern-long, pre2000-short, pre2000-long, chemical, cross-column, claims, repetitive) | VERIFIED | Script runs without error; all 8 categories present with Total/Exact/Syst/Bound/Mis/NoMatch/Accuracy columns |
| 3 | Fixture corpus expanded from 44 to at least 55 cases covering prosecution-relevant patent types | VERIFIED | 71 test cases in TEST_CASES (71 grep matches for "id:"); 6 new fixture JSON files for US4317036, US5371234, US5850559, US6324676, US7509250, US8352400 confirmed present |
| 4 | A live spot-check of 10-15 real patents via Google Patents has been performed with the extension active, and every failure discovered is captured as a new test case | FAILED | Task 3 skipped at user request; no spot-check test cases (id pattern *-spotcheck-*) exist anywhere in the corpus; CONTEXT.md locked decision mandating this step was not executed |
| 5 | Every discovered failure has a corresponding test case in tests/test-cases.js AND is documented in the accuracy-report output | VERIFIED (partial) | All fixture-discovered failures are in test-cases.js and accuracy-report. Cannot verify for live failures since spot-check was skipped. |
| 6 | The US11086978-spec-short no-match failure is fixed — returns a valid citation | VERIFIED | baseline.json shows "citation": "1:24-26", confidence 1.0 for US11086978-spec-short; was null in pre-fix-baseline.json |
| 7 | All previously-passing golden test cases still pass after every algorithm change (zero regressions) | VERIFIED | `npx vitest run` output: 91/91 passed; `npm run accuracy-report -- --compare` shows "Regressions: (none)" |
| 8 | `npm run accuracy-report -- --compare` shows measurable improvement over the pre-fix baseline | VERIFIED | Output: "Overall: 97.7% -> 100.0% (delta +2.3%)"; Improvements: US11086978-spec-short |
| 9 | Each algorithm fix is described in a commit message referencing the failure mode | VERIFIED | Commits 2e216e5 ("strip cross-boundary gutter contamination... gutter number '25' embedded...") and 44a3fe7 ("strip HTML line-wrap hyphen artifacts... wrap-hyphen normalization") both explicitly reference their failure modes |
| 10 | All baseline changes are documented (old vs new citation + reason) | VERIFIED | 2e216e5 commit message: "US11086978-spec-short: null -> 1:24-26"; "US11427642: spec-short-1 1:25-27 -> 1:26-27"; 44a3fe7: "US11086978-spec-short: confidence 0.96 -> 1.0" |
| 11 | `filterGutterLineNumbers` / gutter detection improved to catch previously-missed contamination | VERIFIED | `stripCrossBoundaryText()` added to position-map-builder.js (lines 258-279); called before `filterGutterLineNumbers` in `buildPositionMap()`; regex strips `\s+\b(5|10|...65)\b\s+.*$` from items crossing column boundary by >20pt |

**Score:** 10/11 truths verified (1 failed — live spot-check not performed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/accuracy-report.js` | Per-category accuracy breakdown script with before/after comparison | VERIFIED | 11,589 bytes; imports TEST_CASES, CATEGORIES, matchAndCite, classifyResult; reads baseline.json; --compare reads pre-fix-baseline.json; all 8 categories rendered |
| `tests/golden/pre-fix-baseline.json` | Frozen copy of Phase 8 baseline for before/after comparison | VERIFIED | 44 entries, 43 non-null (97.7%), 1 null (US11086978-spec-short) — matches documented Phase 8 state exactly |
| `tests/test-cases.js` | Expanded test case registry with 55+ entries | VERIFIED | 71 entries (grep count confirmed); all 8 categories populated |
| `package.json` | accuracy-report npm script entry | VERIFIED | Line 9: `"accuracy-report": "node scripts/accuracy-report.js"` |
| `src/offscreen/position-map-builder.js` | Improved gutter filtering with stripCrossBoundaryText | VERIFIED | `stripCrossBoundaryText` exported at line 258; called in buildPositionMap pipeline at line 564 before filterGutterLineNumbers |
| `src/content/text-matcher.js` | Wrap-hyphen normalization in matchAndCite | VERIFIED | Line 216: `normalized = normalized.replace(/- ([a-z])/g, '$1')` applied only to selected text, not PDF concat |
| `tests/fixtures/US11086978.json` | Regenerated fixture without gutter contamination | VERIFIED | File present; baseline shows US11086978-spec-short now returns 1:24-26 (was null) |
| `tests/golden/baseline.json` | Updated golden with 71 entries reflecting algorithm improvements | VERIFIED | 71 citation entries; US11086978-spec-short: "citation": "1:24-26", confidence 1.0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| scripts/accuracy-report.js | tests/test-cases.js | imports TEST_CASES and CATEGORIES | WIRED | `const { TEST_CASES, CATEGORIES } = await import('../tests/test-cases.js')` — line 28; both used throughout |
| scripts/accuracy-report.js | tests/golden/baseline.json | readFileSync reads for comparison | WIRED | `readFileSync(baselinePath, 'utf-8')` at line 41; baseline object used in loop line 93 |
| scripts/accuracy-report.js | tests/helpers/classify-result.js | imports classifyResult | WIRED | `const { classifyResult } = await import('../tests/helpers/classify-result.js')` — line 30; called at lines 103, 248, 288 |
| scripts/accuracy-report.js | src/content/text-matcher.js | imports matchAndCite | WIRED | `const { matchAndCite } = await import('../src/content/text-matcher.js')` — line 29; called at line 91 |
| src/offscreen/position-map-builder.js | tests/fixtures/US11086978.json | fixture regenerated after fix | WIRED | Fixture file present and clean; baseline confirms US11086978-spec-short now returns citation 1:24-26 |
| src/content/text-matcher.js | tests/unit/text-matcher.test.js | all algorithm changes validated by corpus test | WIRED | 91/91 vitest tests pass post-fix |
| tests/golden/baseline.json | scripts/update-golden.js | baseline updated after each fix cycle | WIRED | baseline.json reflects post-fix state (71 entries, US11086978-spec-short = 1:24-26) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ACCY-01 | 09-01-PLAN | Manual accuracy audit across broad patent sampling identifies failure patterns | PARTIAL | Fixture-based audit complete (71 cases, all 8 categories, accuracy-report script). Live spot-check on 10-15 real patents (CONTEXT.md locked decision) was skipped — HTML/PDF divergence coverage from live pages is absent |
| ACCY-02 | 09-02-PLAN | Algorithm fixes for highest-impact failure modes found during audit | VERIFIED | stripCrossBoundaryText() fixes gutter contamination; wrap-hyphen normalization in matchAndCite(); US11086978-spec-short fixed null -> 1:24-26; accuracy +2.3% |
| ACCY-03 | 09-02-PLAN | All algorithm fixes validated against regression harness (no existing passing cases broken) | VERIFIED | 91/91 vitest tests pass; accuracy-report --compare shows "Regressions: (none)"; all 3 spot-checked fixtures (US11427642, US5440748, US6738932) show no regressions |

**Orphaned requirements check:** REQUIREMENTS.md maps ACCY-01, ACCY-02, ACCY-03 to Phase 9. All three are claimed by plan frontmatter. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TODO/FIXME/HACK/placeholder patterns found in any modified files. No empty implementations, stub handlers, or console.log-only logic detected in the phase 9 deliverables.

### Human Verification Required

#### 1. Live Spot-Check via Google Patents

**Test:** Load the built extension in Chrome (`chrome://extensions` → Load unpacked → project root). Open 10-15 patent pages on `patents.google.com`. For each patent, select text from the specification body (short and long) and from claims. Trigger the citation tool and record the result. For any wrong or no-match citation, add a new test case with the exact HTML-copied `selectedText` and run `npm run update-golden`.

**Expected:** Extension returns accurate citations matching ground truth. At minimum, all patents in the existing 71-case fixture corpus should produce correct citations when tested live. Any failures discovered in patents not in the corpus become new test cases.

**Why human:** Requires a live Chrome browser session with the extension installed and active. The HTML rendering of patent pages (Google Patents in Chrome) can differ from the PDF text layer in ways that fixtures cannot simulate — whitespace artifacts, character encoding differences, rendering-dependent line-break hyphens. This is explicitly called out in CONTEXT.md as a locked decision: "Follow with a quick live spot-check on 10-15 real patents via Google Patents to catch HTML/PDF divergences fixtures can't simulate."

---

### Gaps Summary

One gap blocks full ACCY-01 satisfaction: the live spot-check of 10-15 real patents on Google Patents was skipped at user request (Task 3 of Plan 09-01). The CONTEXT.md locked decision explicitly mandates this step to "catch HTML/PDF divergences fixtures can't simulate." The consequence is that the accuracy audit covers only fixture-derived test cases — it does not validate that the extension behaves correctly against live HTML rendering in Chrome.

The fixture-based corpus and algorithm fixes are excellent and fully verified. The gap is narrow: the accuracy claim (100.0% on 71 cases) is valid for the fixture corpus but has not been stress-tested against live HTML divergences that only appear in a real browser session. This is a human-action gap, not a code gap — no algorithm change is needed, only the manual spot-check execution documented in 09-01-PLAN.md Task 3.

ACCY-02 and ACCY-03 are fully satisfied. ACCY-01 is partially satisfied (fixture audit complete, live validation absent).

---

_Verified: 2026-03-03T20:15:00Z_
_Verifier: Claude (gsd-verifier)_

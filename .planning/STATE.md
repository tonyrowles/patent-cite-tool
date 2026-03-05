---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Matching Robustness
status: completed
last_updated: "2026-03-05T17:55:41.598Z"
last_activity: "2026-03-05 — Completed 21-01: gutterTolerantMatch Tier 5 fallback wired into matchAndCite"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 4
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 22 — Validation and Golden Baseline (complete); v2.2 Matching Robustness milestone complete

## Current Position

Phase: 22 — Validation and Golden Baseline
Plan: 01 complete (Phase 22 complete; v2.2 milestone complete)
Status: Active — Phase 22 complete; VALID-01 and VALID-02 satisfied; 75/75 baseline cases, full CI green
Last activity: 2026-03-05 — Completed 22-01: 75-entry golden baseline, synthetic gutter fixture, full CI green (461/461 tests)

```
v2.2 Progress: [██████████] 100% (4/4 plans complete)
```

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | 10 | ~2 days |
| v2.1 CI/CD Pipeline | 2 | 2 | 2 days |
| v2.2 Matching Robustness | 3 | TBD | in progress |
| Phase 21-gutter-tolerant-matching P01 | 4min | 2 tasks | 3 files |
| Phase 22-validation-and-golden-baseline P01 | 4min | 2 tasks | 5 files |

## Accumulated Context

### Decisions

All v1.0–v2.1 decisions archived in PROJECT.md Key Decisions table.

**v2.2 decisions:**
- normalizeOcr applies prose-safe pairs only (rn→m, cl→d) — 1/l/I and 0/O excluded globally due to identifier collision risk
- normalizeOcr placed as Tier 0b preprocessing (not a cascade tier) — all four existing tiers benefit without modification
- gutterTolerantMatch placed as Tier 5 last-resort fallback — minimizes false positives on legitimate patent numbers
- Space-anchored strip pattern `/ (5|10|...|65) /g` — only space-isolated standalone multiples of 5 stripped
- Confidence capped at 0.85 for Tier 5 gutter-tolerant matches — forces yellow UI, appropriate uncertainty for legal filings
- buildConcat extracted as shared helper before gutterTolerantMatch implemented — avoids duplicating wrap-hyphen detection logic
- Golden baseline updated only after manual citation verification against printed patent — additions only, no modifications to existing 71 entries
- [Phase 20-ocr-normalization-and-concat-refactor]: normalizeOcr applied symmetrically to both selectedText and concat so OCR transformation is net-zero for clean text and corrective for OCR-corrupted PDF text
- [Phase 20-ocr-normalization-and-concat-refactor]: buildConcat returns {concat, boundaries, changedRanges} — changedRanges tracks OCR-affected ranges for future tiers, buildConcat is single source of truth replacing inline loop
- [Phase 20-ocr-normalization-and-concat-refactor]: OCR penalty condition is selChanged only (not changedRanges overlap) — real patent text contains rn/cl/li in common English so changedRanges is almost always non-empty; selChanged is the correct necessity test
- [Phase 21-gutter-tolerant-matching]: Space-anchored survive-mask strip for gutterNumbers -- char-by-char boundary check avoids stripping from patent numbers and chemical quantities
- [Phase 21-gutter-tolerant-matching]: strippedToOrig rebuilt after double-space collapse: walk preCollapse skipping extra spaces, keeps first surviving space per adjacent pair
- [Phase 21-gutter-tolerant-matching]: Tier 5 confidence flat 0.85, NOT wrapped in applyPenaltyIfNeeded -- gutter-strip uncertainty already signals enough for legal filing caution
- [Phase 22-validation-and-golden-baseline]: s->S OCR gap documented as comment only (not TEST_CASES entry) — deferred per VALID-01, OCR-03 covers bounded substitution if needed
- [Phase 22-validation-and-golden-baseline]: Baseline entries appended via Edit tool not npm run update-golden — preserves 71 existing entries exactly, verified by git diff additions-only
- [Phase 22-validation-and-golden-baseline]: matching-exports.js fixed to export normalizeOcr, buildConcat, stripGutterNumbers — missing since phase 20/21, caused 30 chrome/firefox dist test failures

### Pending Todos

- [RESOLVED] US6324676 OCR failure modes confirmed: prose-safe normalizeOcr (rn→m, cl→d) is sufficient for VALID-01; s->S gap documented as comment in test-cases.js; OCR-03 covers bounded substitution if future phase requires it

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Fix CI: commit package-lock.json (currently gitignored but required by npm ci) | 2026-03-05 | a47dbb8 | [2-fix-ci-commit-package-lock-json-currentl](./quick/2-fix-ci-commit-package-lock-json-currentl/) |

## Session Continuity

Last activity: 2026-03-05 - Completed 22-01: 4 validated test cases added to golden baseline (75 total), synthetic gutter fixture, spot-check expanded to 8 cases, matching-exports.js fixed; 461/461 tests pass
Status: Phase 22 complete — VALID-01, VALID-02 satisfied; v2.2 Matching Robustness milestone complete
Next: v2.2 milestone complete — all MATCH-01/02/03 + VALID-01/02 requirements satisfied

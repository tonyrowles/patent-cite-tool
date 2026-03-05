---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Matching Robustness
status: executing
last_updated: "2026-03-05T08:18:08.791Z"
last_activity: "2026-03-05 — Completed 20-01: normalizeOcr and buildConcat extracted"
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-04)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Current focus:** Phase 20 — OCR Normalization and Concat Refactor

## Current Position

Phase: 20 — OCR Normalization and Concat Refactor
Plan: 02 complete (Phase 20 complete)
Status: Active — Phase 20 complete, ready for Phase 21
Last activity: 2026-03-05 — Completed 20-02: OCR selection normalization and penalty logic in matchAndCite

```
v2.2 Progress: [██████████] 100% (2/2 plans in Phase 20)
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

### Pending Todos

- Verify gutter strip anchor handles concat edge cases (numbers at string start/end)
- Confirm US6324676 OCR failure modes — determine if prose-safe normalizeOcr subset is sufficient or if bounded 1/l/I substitutions needed

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Fix CI: commit package-lock.json (currently gitignored but required by npm ci) | 2026-03-05 | a47dbb8 | [2-fix-ci-commit-package-lock-json-currentl](./quick/2-fix-ci-commit-package-lock-json-currentl/) |

## Session Continuity

Last activity: 2026-03-05 - Completed 20-02: OCR normalization wired into matchAndCite cascade with selChanged-based penalty; 157 tests pass
Status: Phase 20 complete — MATCH-02 and MATCH-03 both satisfied; 71/71 baseline cases preserved
Next: Phase 21 — gutterTolerantMatch using shared buildConcat helper

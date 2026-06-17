---
phase: 11-triage-layer
plan: "01"
subsystem: triage-classifier
tags: [classifier, vitest, heuristic, kv-records, corpus-check]
dependency_graph:
  requires: []
  provides:
    - scripts/report-classifier.mjs (classifyReport, 8 RULE_* constants, CLASSIFICATIONS, corpus Sets, thresholds)
    - tests/unit/report-classifier.test.js (17 green Vitest pins, one per rule + D-01 + user_error guard)
  affects: []
tech_stack:
  added: []
  patterns:
    - Pure ESM module with createRequire for JSON corpus (no CLI guard)
    - First-match-wins rule engine over KV-record fields
    - Env-configurable thresholds (parseInt ?? default pattern from review-reports.mjs)
    - Corpus Sets loaded at module load via pure file reads (createRequire + static import)
    - kvRecord() factory: buildReportPayload() + explicit server-side field spread (Pitfall 1 mitigation)
key_files:
  created:
    - scripts/report-classifier.mjs
    - tests/unit/report-classifier.test.js
  modified: []
decisions:
  - "RULE_DUPLICATE added between RULE_QUARANTINE_HIT and RULE_NO_MATCH_NOISE to ensure 0 < dups < threshold classifies as duplicate, never noise"
  - "id.split('-')[0] used for corpus key extraction (simpler than regex, correct for all known key formats)"
  - "mkResult helper isolates rationale string from user-controlled fields (T-11-01 mitigation)"
  - "Object.freeze applied to CLASSIFICATIONS array to match frozen enum pattern from constants.js"
metrics:
  duration: "~4 min (257s)"
  completed: "2026-06-17"
  tasks: 2
  files: 2
---

# Phase 11 Plan 01: Pure Heuristic Classifier with Named Rules Summary

**One-liner:** Pure first-match-wins heuristic classifier over KV-record fields emitting {real_bug, noise, duplicate, infrastructure, ambiguous} with golden/quarantine corpus cross-check via module-load file reads.

## What Was Built

`scripts/report-classifier.mjs` — a zero-I/O ESM module exporting:
- `classifyReport(record, opts)` — 8-rule first-match-wins engine; returns `{ classification, ruleName, rationale, inGoldenCorpus, inQuarantineCorpus }`
- 8 named rule constants: `RULE_INFRASTRUCTURE`, `RULE_PDF_ERROR`, `RULE_REAL_BUG_GREEN`, `RULE_REAL_BUG_DUPS`, `RULE_QUARANTINE_HIT`, `RULE_DUPLICATE`, `RULE_NO_MATCH_NOISE`, `RULE_AMBIGUOUS`
- `CLASSIFICATIONS` frozen array (6 values; `user_error` reserved, never heuristically emitted in v1)
- `GOLDEN_PATENTS` and `QUARANTINE_PATENTS` Sets loaded at module load from `tests/golden/baseline.json` and `tests/e2e/test-cases-quarantine.js`
- `DUP_THRESHOLD=3`, `POST_FIX_SUPPRESS_DAYS=30`, `MAX_FIXES_PER_RUN=5` (all env-configurable)

`tests/unit/report-classifier.test.js` — 17 green Vitest tests:
- One `describe` per named rule (8 total) with `it` assertions on both `classification` and `ruleName`
- Priority-order proof: `tool_not_working` + `duplicate_count:99` → infrastructure (not real_bug)
- RULE_DUPLICATE reachability: `duplicate_count:1` → duplicate; boundary `duplicate_count:3` → real_bug
- D-01 guard: golden patent + green + inaccurate_citation → real_bug AND `inGoldenCorpus:true`
- user_error guard: no fixture yields `user_error` (LTRI-01 deferral documented)
- All records use `kvRecord()` factory: `buildReportPayload()` + explicit server-side spread (Pitfall 1 mitigation)

## Requirements Satisfied

| Req | Description | Status |
|-----|-------------|--------|
| TRI-01 | classifyReport returns CLASSIFICATIONS enum value using heuristic field checks only | DONE |
| TRI-02 | Every named rule pinned by Vitest test fed real buildReportPayload() output | DONE (17 tests) |
| TRI-03 | green+inaccurate_citation, duplicate_count>=3, quarantine → real_bug | DONE |
| TRI-04 | GOLDEN_PATENTS and QUARANTINE_PATENTS loaded at module load; reported on every result | DONE |
| TRI-05 | tool_not_working and pdfParseStatus:error → infrastructure | DONE |

Additional invariants proven:
- `duplicate` reachability: sub-threshold repeats classified as `duplicate`, never `noise` (REQUIREMENTS.md L107)
- D-01: golden membership reported but never blocks classification
- D-03: quarantine membership is a positive real_bug signal
- MAX_FIXES_PER_RUN defaults to 5 (REQUIREMENTS.md L12 / COST-02)

## Deviations from Plan

None — plan executed exactly as written.

The plan specified both corpora loading approaches (`createRequire` for JSON + `static import` for quarantine JS). Both were implemented as specified. The `id.split('-')[0]` extraction (from PATTERNS.md) was used in preference to the regex from RESEARCH.md, as the split is simpler and correct for all known key formats.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. The classifier is a pure module — no I/O beyond deterministic corpus reads at module load.

T-11-01 mitigation confirmed: `mkResult` helper builds rationale strings from fixed literals + bounded computed values (`dups` number, `dupThreshold` number) only — no user-controlled field interpolation.

T-11-02 mitigation confirmed: `grep -E "execSync|execFileSync|wrangler|child_process" scripts/report-classifier.mjs` returns nothing.

## Known Stubs

None. The classifier is fully functional: all 8 rules emit correct classifications, corpus Sets are populated from real files (GOLDEN_PATENTS.size=23, QUARANTINE_PATENTS.size=1).

## Self-Check

Files exist:
- scripts/report-classifier.mjs: FOUND
- tests/unit/report-classifier.test.js: FOUND

Commits exist:
- 3b0f69f (feat): FOUND
- 3bc590c (test): FOUND

## Self-Check: PASSED

---
phase: 59-fixture-mutator-4-uat-re-sweep
plan: 00
subsystem: phase-orchestration
tags: [phase-59, baseline, wave-0, fixture-mutator, 4-uat-re-sweep]
requires: []
provides:
  - PHASE_59_BASELINE_anchor
  - locked_source_coordinates_for_phase_59
affects: []
tech_stack_added: []
tech_stack_patterns: []
key_files_created:
  - .planning/phases/59-fixture-mutator-4-uat-re-sweep/59-00-BASELINE.md
key_files_modified: []
decisions:
  - "PHASE_59_BASELINE = b59512fb5f131539cac5d516a49b2a2ef8fbda10 captured as Wave-0 anchor"
  - "RESEARCH Q1 RESOLVED via Plan 59-03 — phase argv expansion on auto-fix-promote.mjs"
  - "Scope deliberately NOT expanded to auto-fix.mjs (line 174 PHASE='42-auto-fix' remains hardcoded)"
metrics:
  duration: "single-task inspection (~minutes)"
  completed: 2026-06-05
disposition: PROCEED — Wave 1 (59-01) + Wave 2 (59-03) cleared
---

# Phase 59 Plan 00: Wave-0 Baseline Capture Summary

**One-liner:** Wave 0 read-only baseline anchoring nine load-bearing source coordinates and resolving RESEARCH Q1 via Plan 59-03 — no source modifications, single artifact emitted.

## Outcome

`PROCEED` — every coordinate verified verbatim against the source tree at
`PHASE_59_BASELINE = b59512fb5f131539cac5d516a49b2a2ef8fbda10`. No drift detected.
Wave 1 (plan 59-01: mutator + suppression) and Wave 2 (plan 59-03: phase argv
expansion) are cleared to proceed.

## Verified Coordinates

| Coordinate | File | Line(s) | Status |
|---|---|---|---|
| `export function fingerprint(caseId, errorClass, topOfStackHash)` body | `scripts/e2e-report-issue.mjs` | 78-81 | ✓ verbatim |
| `READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion'` | `scripts/quarantine-append.mjs` | 29 | ✓ verbatim |
| `STABLE_RUNS_THRESHOLD = 3` | `scripts/quarantine-append.mjs` | 30 | ✓ verbatim |
| Label-add conditional (`if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null)`) | `scripts/quarantine-append.mjs` | 218-223 | ✓ verbatim |
| `FORBIDDEN_PATHS = Object.freeze([...])` — 8 frozen regexes | `scripts/check-diff-guard.mjs` | 49-58 | ✓ verbatim (count = 8) |
| Fingerprint parser regex `/<!-- fp: ([0-9a-f]{12}) -->/m` | `scripts/auto-fix.mjs` | 231 | ✓ verbatim |
| `const PHASE = '42-auto-fix'` | `scripts/auto-fix.mjs` | 174 | ✓ verbatim |
| Outcome-entry `phase: '58-promote'` (PROMOTE-03 failure path) | `scripts/auto-fix-promote.mjs` | 502 | ✓ verbatim |
| Outcome-entry `phase: '58-promote'` (PROMOTE-02 success path) | `scripts/auto-fix-promote.mjs` | 522 | ✓ verbatim |

`.planning/...` paths confirmed NOT in `FORBIDDEN_PATHS` bank — Plan 59-01 mutator may
safely write `56-MUTATOR-CLEANUP.md` to the phase directory.

## RESEARCH Q1 Resolution

**Question:** Does `scripts/auto-fix.mjs` Step 7 ledger write emit a `phase` field?

**Answer:** YES — `phase: PHASE` where the module-level `const PHASE = '42-auto-fix'`
(line 174) is the source of truth. All `safeAppendLedger`/`appendLedgerEntry` call
sites in auto-fix.mjs read this single const (no per-call override).
`scripts/auto-fix-promote.mjs` separately hardcodes `phase: '58-promote'` at two
outcome-entry sites (lines 502 + 522).

**Resolution: RESOLVED via Plan 59-03.** Per CONTEXT.md Decision C, Phase 59 expands
scope to thread `--phase <value>` argv through `auto-fix-promote.mjs` (mirroring
Phase 58's `--fingerprint` / `--error-class` / `--model` plumbing pattern). Default
fallback preserves `'58-promote'` byte-equivalent on non-UAT runs. UAT runs invoke
`gh workflow run v40-auto-promote.yml -f PHASE_TAG=56-uat` so origin/main outcome
ledger entries carry `phase: '56-uat'` (per REQUIREMENTS.md SWEEP-05 literal wording
— "filterable production analysis (Pitfall 10)"). Scope deliberately NOT expanded to
`auto-fix.mjs` because `a-b-winner.mjs:isAttributable` and the SWEEP-05 goal both key
off the OUTCOME entry (`auto-fix-promoted` source), NOT the upstream `auto-fix-api`
source.

## Decisions Made

1. **PHASE_59_BASELINE sha captured as Wave-0 anchor** —
   `b59512fb5f131539cac5d516a49b2a2ef8fbda10`. Plans 59-01 + 59-02 + 59-03 MUST
   verify byte-equality against this sha for any of the nine locked coordinates
   before edits.
2. **RESEARCH Q1 RESOLVED via Plan 59-03** — `--phase` argv plumbing on
   `auto-fix-promote.mjs` (not `auto-fix.mjs`) is the cheapest correct path to honor
   SWEEP-05's filterable-production-analysis literal wording.
3. **Scope deliberately NOT expanded to `auto-fix.mjs`** — line 174 `PHASE =
   '42-auto-fix'` remains hardcoded; the upstream `auto-fix-api` ledger entry is
   NOT the filterable consumer entry for SWEEP-05's production-analysis goal.

## Deviations from Plan

None — plan 59-00 executed exactly as written. No source files modified
(inspection-only). Working tree at end of plan shows only the new
`59-00-BASELINE.md` as expected.

## Wave 1 + Wave 2 Disposition

**PROCEED.** All four hard-pinned coordinates in RESEARCH (§1 fingerprint export, §4
quarantine-append conditional, §5 FORBIDDEN_PATHS bank, auto-fix.mjs fingerprint
parser regex at line 231) match the source tree byte-for-byte at PHASE_59_BASELINE.
Plan 59-01 (mutator + MUTATOR-04 suppression) and Plan 59-03 (phase argv expansion)
are cleared to begin.

Plan 59-02 (live UAT runbook) remains gated by the upstream push of Phases 56-58 to
origin/main per CONTEXT.md "Hard Dependency" — that gate is unrelated to Wave-0
baseline coordinates and is handled at plan 59-02 entry.

## Self-Check: PASSED

- BASELINE.md exists at `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-00-BASELINE.md` — ✓
- All six required grep anchors present in BASELINE.md
  (PHASE_59_BASELINE, fingerprint, FORBIDDEN_PATHS, RESEARCH Q1,
  "RESOLVED via Plan 59-03", "58-promote") — ✓
- PHASE_59_BASELINE sha captured (40-hex git sha) — ✓
- Source-file modifications: NONE — ✓
- Working tree clean apart from new BASELINE + SUMMARY under `.planning/phases/59-*/` — ✓

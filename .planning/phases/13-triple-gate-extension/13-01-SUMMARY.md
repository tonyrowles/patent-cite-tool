---
phase: 13-triple-gate-extension
plan: "01"
subsystem: auto-fix-promote / trust-gate
tags: [trust-gate, assertTripleGate, GATE-05, report-fix-candidate, v6.1]
dependency_graph:
  requires:
    - "Phase 12: fix generation pipeline (v61-report-fix.yml, auto-fix:verified label flow)"
  provides:
    - "assertTripleGate Leg 3 OR widening (triage OR report-fix-candidate)"
    - "parseSourceIssue PREFERRED path wired via v61 PR body marker"
  affects:
    - "scripts/auto-fix-promote.mjs"
    - ".github/workflows/v61-report-fix.yml"
    - "tests/unit/auto-fix-promote-gate.test.js"
    - "tests/unit/v61-report-fix-yaml.test.js"
tech_stack:
  added: []
  patterns:
    - "De Morgan flat OR for trust gate widening — !(A || B) = !A && !B"
    - "PROMOTE-04 verbatim body pin — same-commit invariant preserved"
    - "HTML comment marker in PR body feeds parseSourceIssue PREFERRED regex path"
key_files:
  modified:
    - scripts/auto-fix-promote.mjs
    - tests/unit/auto-fix-promote-gate.test.js
    - .github/workflows/v61-report-fix.yml
    - tests/unit/v61-report-fix-yaml.test.js
decisions:
  - "D-02: Flat OR accepted — no source-aware branching in Leg 3; report-fix-candidate carries equivalent trust to triage within the GATE-04 human-merge invariant"
  - "D-04: HTML comment marker added to v61 PR body; parseSourceIssue parser left unmodified (PREFERRED regex path fires)"
  - "Commit decomposition: gate-body+pin+T7 in one commit (success criterion #2); marker+assertion in a separate commit"
metrics:
  duration: "3m"
  completed: "2026-06-18"
  tasks: 2
  files_changed: 4
---

# Phase 13 Plan 01: Triple-Gate Extension Summary

**One-liner:** assertTripleGate Leg 3 widened to flat OR (triage OR report-fix-candidate) with PROMOTE-04 pin updated atomically, and v61-report-fix.yml PR body wired to parseSourceIssue PREFERRED regex path via HTML comment marker.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Widen assertTripleGate Leg 3 + update PROMOTE-04 pin + add T7 (ONE commit) | 5f3fd60 | scripts/auto-fix-promote.mjs, tests/unit/auto-fix-promote-gate.test.js |
| 2 | Add source_issue marker to v61 PR body + YAML-contract assertion (separate commit) | 1c50f14 | .github/workflows/v61-report-fix.yml, tests/unit/v61-report-fix-yaml.test.js |

## What Was Built

### Task 1: assertTripleGate Leg 3 OR widening (commit 5f3fd60)

`scripts/auto-fix-promote.mjs` Leg 3 (lines 125-128) rewritten to accept `sourceIssueLabels` containing `'triage'` OR `'report-fix-candidate'` via De Morgan flat OR:

```
if (!Array.isArray(sourceIssueLabels) || (!sourceIssueLabels.includes('triage') && !sourceIssueLabels.includes('report-fix-candidate'))) {
  throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage' or 'report-fix-candidate'");
}
```

The function body stays at exactly 15 lines so the PROMOTE-04 `slice(startIdx, startIdx+15)` constant is unchanged.

`tests/unit/auto-fix-promote-gate.test.js` EXPECTED_BODY array positions 10-12 updated byte-for-byte to match the new Leg-3 body. New T7 test case added inside `describe('assertTripleGate (Phase 44)')` asserting that `sourceIssueLabels: ['report-fix-candidate']` does NOT throw.

Trust-boundary tests preserved:
- T3 (`sourceIssueLabels:['bug']`) still throws — substring regex `/missing 'triage'/` matches the extended message
- T4 (`sourceIssueLabels:['triage','WRONG_CITATION']`) still passes — legacy path preserved
- T5 (`prLabels:['auto-fix:partial-verified']`) still throws — Leg 1, unrelated to Leg 3
- `_skipCiGuard:true` non-comment grep-count stays exactly 1

### Task 2: v61 PR body marker + YAML assertion (commit 1c50f14)

`.github/workflows/v61-report-fix.yml` `create-pull-request` body block gained a new line immediately after `**Source Issue:** #${{ github.event.issue.number }}`:

```yaml
<!-- source_issue: ${{ github.event.issue.number }} -->
```

This feeds `parseSourceIssue`'s PREFERRED regex path (`/<!--\s*source_issue:\s*(\d+)\s*-->/` at `:270`) without any parser modification. The existing prose line is retained.

`tests/unit/v61-report-fix-yaml.test.js` gained a new D-04 (Phase 13) assertion pinning the marker presence via `toContain('<!-- source_issue:')` and `toContain('${{ github.event.issue.number }}')`.

## Test Results

### Pre-commit verification (both tasks)
```
npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/unit/v61-report-fix-yaml.test.js
  auto-fix-promote-gate.test.js: 41 tests passed (was 40 — +T7)
  v61-report-fix-yaml.test.js:   36 tests passed (was 35 — +D-04 marker assertion)
  Total: 77 passed
```

### Full npm test gate
```
test:src:     98 test files, 1767 passed | 5 skipped (1772)
test:chrome:  3 test files,  158 passed
test:firefox: 3 test files,  156 passed
lint:         0 errors, 1 pre-existing warning
test:lint:    0 errors, 0 warnings
Exit: 0
```

## Trust-Invariant Spot Checks

| Check | Result |
|-------|--------|
| assertPartialGate Leg 3 still requires only 'triage' | PASS — unchanged at line 172 |
| v40-auto-promote.yml trigger YAML untouched | PASS — no diff |
| parseSourceIssue at :270 unmodified | PASS — body unchanged |
| _skipCiGuard:true non-comment count == 1 | PASS — test green |
| PROMOTE-04 EXPECTED_BODY pin green | PASS — test green |
| T3 substring regex survives extended message | PASS — test green |
| T4 legacy triage path still passes | PASS — test green |
| T5 partial-verified still rejected | PASS — test green |

## Deviations from Plan

None — plan executed exactly as written. All four edit sites matched the RESEARCH-verified line numbers exactly.

## Threat Flags

No new threat surface beyond what is modeled in the plan's STRIDE register.

- T-13-01 (mitigate): OR widening only ADDS `report-fix-candidate`; T4 + T7 + retained T5 pin the boundary.
- T-13-04 (mitigate): PROMOTE-04 pin updated in the SAME commit as the body change (5f3fd60); unenforced window is zero.

## Self-Check: PASSED

- [x] scripts/auto-fix-promote.mjs: contains `includes('report-fix-candidate')` in Leg 3
- [x] tests/unit/auto-fix-promote-gate.test.js: EXPECTED_BODY updated + T7 added
- [x] .github/workflows/v61-report-fix.yml: contains `<!-- source_issue:` marker
- [x] tests/unit/v61-report-fix-yaml.test.js: D-04 marker assertion added
- [x] Commit 5f3fd60 exists (gate body + pin + T7 — one commit)
- [x] Commit 1c50f14 exists (marker + YAML assertion — separate commit)
- [x] Full vitest suite green (77/77 in affected files; 1767+158+156 across full suite)
- [x] npm test exits 0

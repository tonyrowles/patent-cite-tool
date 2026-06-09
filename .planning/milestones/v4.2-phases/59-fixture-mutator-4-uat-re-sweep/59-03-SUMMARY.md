---
phase: 59-fixture-mutator-4-uat-re-sweep
plan: 03
subsystem: auto-fix-loop / auto-promote
tags: [phase-59, sweep-05, phase-argv-expansion, decision-c, parallel-wave-2]
requires: [59-00]
provides: [SWEEP-05]
affects:
  - scripts/auto-fix-promote.mjs
  - .github/workflows/v40-auto-promote.yml
  - tests/unit/auto-fix-promote-gate.test.js
  - tests/e2e/scripts/v40-auto-promote-yaml.test.js
tech-stack:
  added: []
  patterns:
    - "argv plumbing (Phase 58 verbatim mirror) — single flag added to KNOWN_FLAGS + parseArgv switch case + validation regex + return field"
    - "GitHub Actions workflow_dispatch trigger variant + dual-path env expression (`inputs.X || vars.X || ''`)"
    - "Bash array conditional argv-append pattern (mirrors PHASE-58 WR-01)"
    - "Comment-stripped grep regression guards (planning-side and Vitest both)"
key-files:
  created:
    - .planning/phases/59-fixture-mutator-4-uat-re-sweep/59-03-SUMMARY.md
  modified:
    - scripts/auto-fix-promote.mjs
    - tests/unit/auto-fix-promote-gate.test.js
    - .github/workflows/v40-auto-promote.yml
    - tests/e2e/scripts/v40-auto-promote-yaml.test.js
decisions:
  - "Decision C precedent locked: scope expansion to thread --phase argv end-to-end so live ledger entries on origin/main can carry `phase: '56-uat'` per REQUIREMENTS.md SWEEP-05 literal wording"
  - "Default fallback `args.phase || '58-promote'` preserves Phase 58 byte-equivalent shape on non-UAT runs (zero-impact on normal pull_request trigger path)"
  - "Dual-path env expression `${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}` so legacy SWEEP runbook support (repo variable) + workflow_dispatch input both work"
metrics:
  duration_minutes: 5
  completed_iso: 2026-06-06T04:39Z
  files_modified: 4
  tests_added: 8
  tests_passing: 76
---

# Phase 59 Plan 03: SWEEP-05 Phase Argv Expansion (Decision C) Summary

Threaded a `--phase <value>` argv flag through `scripts/auto-fix-promote.mjs`
end-to-end (script + workflow + both Vitest contracts) in a single atomic
commit, mirroring Phase 58's `--fingerprint` / `--error-class` / `--model`
plumbing pattern verbatim. Default fallback `args.phase || '58-promote'`
preserves Phase 58 byte-equivalent entry shape on non-UAT runs; UAT runs
invoke via `gh workflow run v40-auto-promote.yml -f PHASE_TAG=56-uat` to
land `phase: '56-uat'` on the live ledger entries.

## Commit

`df22e6812429f1cd5ce096baf3381b5c09adf9a3` —
`feat(59): SWEEP-05 phase argv expansion (Decision C) — auto-fix-promote --phase + workflow_dispatch PHASE_TAG`

Single atomic commit across four files (4 files changed, 236 insertions, 6
deletions). Per-task commit cadence (single-task plan; Phase 58 Plan 02
precedent).

## Script Diff Summary (`scripts/auto-fix-promote.mjs`)

| # | Section | Edit |
|---|---|---|
| 1 | KNOWN_FLAGS set | Insert `'--phase',` between `'--model'` and `'--passing-cases'` with a Phase 59 Decision C rationale comment |
| 2 | parseArgv local-var block | Add `let phase = null;` after `let model = null;` |
| 3 | parseArgv switch | Add `case '--phase': phase = takeValue(argv, i, tok); i++; break;` after `case '--model':` |
| 4 | parseArgv validation | Add `if (phase !== null && !/^[a-zA-Z0-9_-]+$/.test(phase)) { ...exit 2 }` (T-59-11 mitigation) |
| 5 | parseArgv return shape | Add `phase,` field after `model,` |
| 6 | PROMOTE-03 failure entry | Replace `phase: '58-promote',` with `phase: args.phase || '58-promote',` + Decision C comment |
| 7 | PROMOTE-02 success entry | Identical edit; both entry sites use the same fallback chain |

The 5 parseArgv-side edits and 2 entry-site edits ship in a single commit;
KNOWN_FLAGS + return-shape additions sandwich the switch + validation
additions so the surface stays internally consistent on intermediate diffs.

## Workflow Diff Summary (`.github/workflows/v40-auto-promote.yml`)

| # | Section | Edit |
|---|---|---|
| 1 | Trigger block | Add `workflow_dispatch:` block AFTER the existing `pull_request: types: [closed]` block; inputs.PHASE_TAG with description, required: false, default: '', type: string |
| 2 | Job-level if-filter | Wrap existing filter in `github.event_name == 'workflow_dispatch' || ( ... )`; pull_request branch preserved byte-equivalent inside the parenthesized fallback |
| 3 | Triple-gate step env | Add `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}` (dual-path expression) after the existing `MODEL:` line |
| 4 | Triple-gate step run | Add `if [ -n "$PHASE_TAG" ]; then ARGS+=(--phase "$PHASE_TAG"); fi` AFTER the existing `--passing-cases` conditional-append (mirrors PHASE-58 WR-01) |

YAML parsability verified: `python3 -c "import yaml; yaml.safe_load(...)"`
returns triggers `['pull_request', 'workflow_dispatch']`.

## Vitest Contract Additions

**`tests/unit/auto-fix-promote-gate.test.js`:**

- Phase 59 SWEEP-05 — --phase argv (Decision C) describe block:
  - PHASE-59-P1: `parseArgv([..., '--phase', '56-uat'])` returns `phase: '56-uat'`
  - PHASE-59-P2: `parseArgv([...REQUIRED])` (no flag) returns `phase: null` AND
    `readPromoteSource()` contains the literal `phase: args.phase || '58-promote'`
  - PHASE-59-P3: `parseArgv([..., '--phase', '56 uat; echo bad'])` exits 2 with
    stderr matching `malformed --phase`; uses the process.exit-throws-sentinel
    pattern (Phase 58 PA4/PA5 idiom)
- Phase 59 SWEEP-05 — phase entry-shape structural pins describe block:
  - PHASE-59-O1: comment-stripped source contains `phase: args.phase || '58-promote'` at LEAST TWICE
  - PHASE-59-O2: comment-stripped source contains ZERO bare `phase: '58-promote',` matches
- Phase 58 O1 regex updated from `phase:\s*'58-promote'` to
  `phase:\s*args\.phase \|\| '58-promote'` (planned drift; the bare-literal
  default `'58-promote'` is still pinned via PHASE-59-O1's fallback chain
  regex)

**`tests/e2e/scripts/v40-auto-promote-yaml.test.js`:**

- v40-auto-promote.yml Phase 59 contract — SWEEP-05 phase argv expansion (Decision C):
  - PHASE-59-Y1: workflow_dispatch trigger + inputs.PHASE_TAG declaration with
    required: false, default: '', type: string (4 sub-assertions)
  - PHASE-59-Y2: job-level if-filter contains `github.event_name == 'workflow_dispatch'`
    AND preserves byte-equivalent pull_request branch (4 sub-assertions)
  - PHASE-59-Y3: dual-path env expression present AND `if [ -n "$PHASE_TAG" ]`
    conditional present AND `ARGS+=(--phase "$PHASE_TAG")` AND no
    unconditional-emit shape (4 sub-assertions; mirrors PHASE-58-Y11 WR-01 pattern)

## Vitest Pass Count

`CI=true npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js`
exits 0:

- tests/unit/auto-fix-promote-gate.test.js: **40 tests passed** (was 35; +5: P1/P2/P3/O1/O2)
- tests/e2e/scripts/v40-auto-promote-yaml.test.js: **36 tests passed** (was 33; +3: Y1/Y2/Y3)
- **76 tests total, all green**

PHASE-58-Y1..Y11 verbose-output occurrence count: 12 (11 unique tests +
1 duplicate from describe + it header concat). All Phase 58 contracts
preserved.

## Invariant Verification

| Invariant | Pre-edit | Post-edit | Status |
|---|---|---|---|
| `assertTripleGate` body sha256 | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f` | **byte-unchanged** |
| `_skipCiGuard:\s*true` non-comment count | 1 | 1 | **preserved** |
| IMPORTS POLICY forbidden imports | 0 | 0 | **preserved** |
| bare `phase: '58-promote',` non-comment count | 2 | 0 | **both replaced** |
| `phase: args.phase \|\| '58-promote'` count | 0 | 2 | **both sites updated** |
| Out-of-scope files (`.github/workflows/v40-auto-fix.yml`, `tests/e2e/lib/llm-ledger.js`, `scripts/auto-fix.mjs`) diff vs PHASE_59_BASELINE | n/a | empty | **clean** |

## Deviations from Plan

**Updated Phase 58 O1 regex** (planned by `PHASE-59-P2`/`O1` design but not
explicitly enumerated as an edit in the plan's <action> block): The Phase 58
O1 success-block assertion contains `expect(block).toMatch(/phase:\s*'58-promote'/)`
which matches the bare literal `phase: '58-promote'`. Plan 59-03's entry-site
edit replaces that bare literal with `phase: args.phase || '58-promote'`,
which causes the original regex to fail.

The fix mirrors the existing comment style in O1 ("model is args.model with
a default fallback — must NOT be a bare literal") and updates the regex to
`/phase:\s*args\.phase \|\| '58-promote'/` — pinning the new shape, with the
bare-literal `'58-promote'` default still asserted via the PHASE-59-O1
structural pin (which counts `args.phase || '58-promote'` occurrences ≥ 2).

This is not a Rule 1-4 deviation — it is a planned mechanical consequence
of the entry-site edit ("the model: args.model precedent" comment in the
plan's interfaces block was the design hint; O2 had no `phase:` assertion
to update). Documented here for traceability.

## Operator Runbook Pointer (Plan 59-02 SWEEP-03/04)

UAT invocation:
```
gh workflow run v40-auto-promote.yml -f PHASE_TAG=56-uat
```

SWEEP-06 cleanup:
```
gh variable delete PHASE_TAG    # only if vars.PHASE_TAG was used
```

The dual-path env expression supports BOTH `gh workflow run -f PHASE_TAG=...`
(workflow_dispatch input) AND `gh variable set PHASE_TAG --body 56-uat`
(repo variable); SWEEP-03/04 in plan 59-02 chooses one (see plan 59-02
revision-mode update for the chosen pattern).

## Decision C Log Pointer

`.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-CONTEXT.md` —
"Phase 59 Scope Adjustment (Decision Log)" §"Decision C (2026-06-05, phase
argv expansion — triggered by checker context_compliance / scope_reduction
BLOCKER finding)".

## Self-Check: PASSED

- FOUND: scripts/auto-fix-promote.mjs (modified, df22e68)
- FOUND: tests/unit/auto-fix-promote-gate.test.js (modified, df22e68)
- FOUND: .github/workflows/v40-auto-promote.yml (modified, df22e68)
- FOUND: tests/e2e/scripts/v40-auto-promote-yaml.test.js (modified, df22e68)
- FOUND: commit df22e68 (full sha df22e6812429f1cd5ce096baf3381b5c09adf9a3) in git log
- FOUND: assertTripleGate sha256 matches baseline `5311c1d5...`
- FOUND: `--phase` flag in KNOWN_FLAGS, switch case, validation, return shape
- FOUND: `phase: args.phase || '58-promote'` at both entry sites
- FOUND: `workflow_dispatch` + `PHASE_TAG` + `ARGS+=(--phase "$PHASE_TAG")` in workflow
- FOUND: PHASE-59-P1, P2, P3, O1, O2 in unit tests
- FOUND: PHASE-59-Y1, Y2, Y3 in YAML contract tests
- FOUND: 76/76 Vitest tests green
- FOUND: PHASE-58-Y1..Y11 preserved byte-equivalent
- FOUND: out-of-scope files (`v40-auto-fix.yml`, `llm-ledger.js`, `auto-fix.mjs`) diff vs PHASE_59_BASELINE empty

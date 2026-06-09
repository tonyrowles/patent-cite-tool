---
phase: 59-fixture-mutator-4-uat-re-sweep
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - tests/e2e/scripts/inject-defect.mjs
  - tests/e2e/scripts/e2e-inject-defect.test.js
  - scripts/quarantine-append.mjs
  - tests/e2e/scripts/e2e-quarantine-append.test.js
  - scripts/auto-fix-promote.mjs
  - tests/unit/auto-fix-promote-gate.test.js
  - .github/workflows/v40-auto-promote.yml
  - tests/e2e/scripts/v40-auto-promote-yaml.test.js
iteration: 2
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 59: Code Review Report (Re-Review Iteration 2)

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Iteration:** 2 (re-review after REVIEW-FIX iter 2)
**Status:** clean

## Summary

Re-review of the 6 in-scope findings (CR-01, CR-02, WR-01..WR-04) from
`59-REVIEW.iter2.md` against the source on `main` HEAD. All six fix commits
(`04902c0`, `370cfd5`, `9509b50`, `4222268`, `5155282`, `646a24b`) are present
in the linear history immediately following the original REVIEW commit
(`0a22db2`). Every finding is resolved in source AND pinned by a new
regression test. The full Phase 59 verification gate
(`CI=true npx vitest run tests/e2e/scripts/ tests/unit/auto-fix-promote-gate.test.js`)
re-runs at **99 passing tests across the 4 review-scoped files** (38
v40-auto-promote-yaml + 40 auto-fix-promote-gate + 11 e2e-quarantine-append
+ 10 e2e-inject-defect).

The three INFO findings (IN-01, IN-02, IN-03) were deferred per the
`critical_warning` review scope. IN-03 is effectively resolved as a side
effect of the CR-02 fix (the new I7b regression pin directly exercises the
dirty-tree branch IN-03 flagged).

No new BLOCKER/WARNING surfaces in the re-scan. The load-bearing
constraints stipulated by the prompt are all honored:

- `tests/e2e/lib/llm-ledger.js` — byte-unchanged since the REVIEW commit
- `scripts/auto-fix.mjs` — byte-unchanged since the REVIEW commit
- `.github/workflows/v40-auto-fix.yml` — byte-unchanged since the REVIEW commit
- `scripts/auto-fix-promote.mjs` — byte-unchanged since the REVIEW commit
  (assertTripleGate body untouched; non-comment `_skipCiGuard: true` count
  remains exactly 1 at line 511)

## Finding Resolution Verification

### CR-01: workflow_dispatch trigger is non-functional — RESOLVED in `04902c0`

**Verification:** `.github/workflows/v40-auto-promote.yml` now declares
required `workflow_dispatch.inputs.pr_number` (string) and `merged` (string,
default `'true'`) at lines 63-78. Every PR-dependent step (parse, Triple-gate
env, Build PR body env, cpr@v8 branch/title/commit-message, Close source
issue, Regression issue) uses the fallback expression
`${{ github.event.pull_request.number || github.event.inputs.pr_number }}`
(lines 147, 169, 319, 383, 414, 418, 420, 435, 469).

An early `Reject empty PR_NUMBER` step (lines 138-152) hard-fails with a
`::error::` annotation BEFORE any `gh` call when PR_NUMBER ends up empty —
defense-in-depth against trigger-schema bypass.

The PHASE-59-Y1 widening and the new PHASE-59-Y4 regression test
(`tests/e2e/scripts/v40-auto-promote-yaml.test.js:384-398`) pin (a) the
`pr_number` input shape (`required: true`, `type: string`), (b) the `merged`
input shape (`required: true`), (c) the PR_NUMBER fallback expression, and
(d) the early hard-fail step's presence. All assertions pass in the
verification gate run.

### CR-02: inject-defect.mjs creates GitHub issue BEFORE FORBIDDEN_PATHS gate — RESOLVED in `370cfd5`

**Verification:** `tests/e2e/scripts/inject-defect.mjs:436-474` now sequences
`parseArgs → computeFingerprint → collisionCheckOrAbort →
verifyWorkingTreeClean → createIssue → emitCleanupEvidence`. `verifyWorking
TreeClean` runs at line 458 strictly BEFORE `createIssue` at line 460 — the
ordering REVIEW.md flagged as defeating both T-59-03 and T-59-05 is corrected.
The CR-02 docblock at lines 440-456 explains the reorder and the defeated-
gate scenario it fixes.

The new I7b regression pin
(`tests/e2e/scripts/e2e-inject-defect.test.js:239-259`) pre-stages a
violating `junk.txt` file in the hermetic tmp git repo and asserts (a) the
script exits 1 (dirty-tree exit code) AND (b) the mock-gh transcript
contains NO `issue create` line. This directly exercises the dirty-tree
branch the pre-REVIEW-FIX ordering silently let through. Both invariants
pass.

### WR-01: vars.PHASE_TAG fallback creates silent ledger-corruption foot-gun — RESOLVED in `9509b50`

**Verification:** `.github/workflows/v40-auto-promote.yml:339` is now the
single-source expression `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || '' }}`.
The literal `vars.PHASE_TAG` no longer appears anywhere in the YAML file
(verified via `grep -n vars.PHASE_TAG` returns no matches). The lines
328-338 docblock explains why the legacy fallback was dropped.

PHASE-59-Y3 (`tests/e2e/scripts/v40-auto-promote-yaml.test.js:368`) asserts
the new single-source shape. The new PHASE-59-Y5 regression guard
(`tests/e2e/scripts/v40-auto-promote-yaml.test.js:409-411`) asserts
`expect(yaml).not.toContain('vars.PHASE_TAG')` — any future commit re-adding
the foot-gun trips this assertion. Both pass.

### WR-02: inject-defect.mjs parseArgs silently ignores unknown flags — RESOLVED in `4222268`

**Verification:** `tests/e2e/scripts/inject-defect.mjs:99-105` declares
`KNOWN_FLAGS` Set holding `'--seed', '--error-class', '--phase-dir', '--help',
'-h'`. The `parseArgs` loop terminates at lines 171-183 with
`else if (!KNOWN_FLAGS.has(argv[i]))` emitting `[inject-defect] unknown
flag: <tok>` to stderr and exiting 2. The pattern mirrors
`scripts/auto-fix-promote.mjs`'s established KNOWN_FLAGS reject style.

The new I9 regression test
(`tests/e2e/scripts/e2e-inject-defect.test.js:267-288`) spawns the script
with `--bogus-flag value` and asserts (a) exit status 2, (b) stderr matches
`/unknown flag/i`, (c) the mock-gh transcript contains neither
`issue create` nor `issue list` (proves the reject fires inside parseArgs
BEFORE any side effect). All three pass.

### WR-03: collisionCheckOrAbort + createIssue is racy under concurrent invocation — RESOLVED in `5155282`

**Verification:** Per the REVIEW-FIX's documentation-only acceptance pattern,
`tests/e2e/scripts/inject-defect.mjs` is updated at lines 18-30 (T-59-02
threat-model entry reworded "MITIGATED" → "PARTIALLY MITIGATED" with an
explicit CAVEAT block naming the TOCTOU race, the operator-driven
mitigation, and the SWEEP-06 post-hoc detection mechanism) AND at lines
219-236 (collisionCheckOrAbort JSDoc expanded with a "TOCTOU RACE NOTE"
describing the race window, the runbook context, and the rejected stricter
mitigation with rationale).

No behavioural change. The documentation now honestly reflects the
documented limitation — accepted as deliberate design trade-off per WR-03's
fix-as-documentation pattern. The diff is purely comment edits and trivially
safe; no test changes are required.

### WR-04: quarantine-append.mjs MUTATOR-04 suppression uses broad startsWith() — RESOLVED in `646a24b`

**Verification:** `scripts/quarantine-append.mjs:238-239` replaces the
`.startsWith('fixture-mutator-uat-47b')` with the anchored regex
`/^fixture-mutator-uat-47b-iter-\d+$/.test(finalEntry.source_triage_finding_id)`.
The lines 219-237 docblock explains the equals-vs-startsWith rationale and
cross-references the G9-c regression pin.

The new G9-c regression test
(`tests/e2e/scripts/e2e-quarantine-append.test.js:295-327`) sets up an entry
with `source_triage_finding_id: 'fixture-mutator-uat-47b-extension-2026-iter-1'`
(a future Phase 6X extension shape that would have falsely matched the
pre-REVIEW-FIX `.startsWith` discriminator) at `stable_runs: 2`, runs the
script, and asserts the mock-gh transcript contains
`issue edit \d+ --add-label quarantine:ready-for-promotion`. The label IS
applied because the anchored regex correctly rejects this entry as a NOT-
mutator value — proving the equals-vs-startsWith tightening is load-
bearing. Passes.

## INFO Deferral Status

- **IN-01** (createIssue returns unused `url` field): Deferred per
  `critical_warning` scope. Cosmetic. Source state unchanged
  (`tests/e2e/scripts/inject-defect.mjs:328`).
- **IN-02** (workflow_dispatch concurrency-group collapse): Deferred per
  `critical_warning` scope. Operationally tolerable; the A4 pin pins the
  current shape (`.github/workflows/v40-auto-promote.yml:84`). A widening to
  include `github.run_id` would require an A4 amendment.
- **IN-03** (I7 does not exercise dirty-tree branch): EFFECTIVELY RESOLVED
  as a side effect of CR-02 (`370cfd5`). The new I7b test
  (`tests/e2e/scripts/e2e-inject-defect.test.js:239-259`) directly
  exercises the dirty-tree branch IN-03 flagged.

## Load-Bearing Constraint Audit

Per the prompt's "deliberately leaves byte-unchanged" list, verified via
`git diff 0a22db2..HEAD -- <path>`:

| File | Diff post-REVIEW | Status |
|------|------------------|--------|
| `tests/e2e/lib/llm-ledger.js` | empty | UNCHANGED |
| `scripts/auto-fix.mjs` | empty | UNCHANGED |
| `.github/workflows/v40-auto-fix.yml` | empty | UNCHANGED |
| `scripts/auto-fix-promote.mjs` | empty | UNCHANGED (assertTripleGate body byte-equivalent; non-comment `_skipCiGuard: true` count = 1) |

All four prompt-pinned files are byte-identical to their REVIEW.iter2 state.

## Verification Gate Result

```
CI=true npx vitest run \
  tests/e2e/scripts/e2e-inject-defect.test.js \
  tests/e2e/scripts/e2e-quarantine-append.test.js \
  tests/e2e/scripts/v40-auto-promote-yaml.test.js \
  tests/unit/auto-fix-promote-gate.test.js
```

Result: **4 test files passed, 99 tests passed, 0 failures** (Duration 4.90s).
Re-review concluded clean.

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2_

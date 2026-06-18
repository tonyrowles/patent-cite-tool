---
phase: 12-fix-generation-regression-gate
plan: "04"
subsystem: fix-generation / workflow / CI
tags: [feat, security, tdd, gate-enforcement, cost-04-deviation, human-confirmed]
dependency_graph:
  requires:
    - 12-01 (fix-primitives.js — parseFencedDiff/changedPathsFromDiff)
    - 12-02 (REPORT_FIX_SCAFFOLD real prompt body)
    - 12-03 (scripts/report-fix.mjs dispatcher — overfit signal, kv-record-file CLI)
  provides:
    - .github/workflows/v61-report-fix.yml (issues:labeled CI orchestration)
    - tests/unit/v61-report-fix-yaml.test.js (35 YAML-contract pins)
    - tests/e2e/scripts/v40-verifier-gate-yaml.test.js (GATE-04 cross-workflow invariant extended)
  affects:
    - GATE-04 permanent invariant (now covers v61-report-fix.yml)
    - Draft PR auto-fix/<fp-short> (v40-verifier-gate.yml fires automatically via branch prefix)
tech_stack:
  added: []
  patterns:
    - issues:labeled trigger gated on report-fix-candidate label (scope-gate pattern from v40-verifier-gate.yml)
    - wrangler kv get --remote + working-directory:worker (Pitfall 3 / wrangler-local-default mitigation)
    - 3-iteration regression-driven loop (GATE-01/D-04/COST-03)
    - COST-04 two-commit-split with ledger-branch deviation (ledger-snapshots/report-fix-* NOT main)
    - peter-evans/create-pull-request@v8 draft:true (GATE-02)
    - FIX-04/D-03 overfit signal → human-review-required label wiring
    - GATE-04 cross-workflow no-auto-merge static-grep invariant (extended to v61-report-fix.yml)
    - comment-paraphrase discipline (auto-merge tokens never spelled literally in YAML comments)
key_files:
  created:
    - .github/workflows/v61-report-fix.yml
    - tests/unit/v61-report-fix-yaml.test.js
  modified:
    - tests/e2e/scripts/v40-verifier-gate-yaml.test.js
decisions:
  - "COST-04 DEVIATION (Critical Fork #1): ledger pushed to ledger-snapshots/report-fix-${FP_SHORT} (NOT main) — ruleset 17086676 blocks github-actions[bot] direct-to-main pushes; established v40-cost-ledger-snapshot.yml pattern reused; human confirmed 'Accept ledger-branch' at Task 3 checkpoint"
  - "COST-04 ordering invariant preserved: ledger commit step (line 262) precedes create-pull-request@v8 step (line 283) in YAML; pinned by COST-04 ordering test using step uses: directive search (not comment text) to avoid false match on header comment"
  - "GATE-04 cross-workflow invariant extended in v40-verifier-gate-yaml.test.js (milestone-level guard) plus per-file pins in v61-report-fix-yaml.test.js (Task 1) — both coverage layers present per CONTEXT.md mandate"
  - "auto-fix:verified never appears in v61-report-fix.yml — the verified label is the verifier-gate's exclusive grant; overfit PR body comment paraphrases this instead of spelling the label literally"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-18T04:12:44Z"
  tasks: 3
  files_created: 2
  files_modified: 1
---

# Phase 12 Plan 04: v61-report-fix.yml Workflow + GATE-04 Invariant Extension Summary

CI orchestration workflow (issues:labeled trigger) that converts a promoted BUG_REPORTS KV record into a ledger-committed draft fix PR via a 3-iteration regression-driven loop, with COST-04 two-commit-split deviation to ledger-snapshots branch (human-confirmed) and GATE-04 cross-workflow no-auto-merge invariant extended to cover the new workflow.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing contract tests for v61-report-fix.yml | 2fa46a5 | tests/unit/v61-report-fix-yaml.test.js (new, 258 lines, 35 tests) |
| 1 (GREEN) | Implement v61-report-fix.yml + fix contract tests | b1dd699 | .github/workflows/v61-report-fix.yml (new, 352 lines); tests/unit/v61-report-fix-yaml.test.js (updated COST-04 ordering pin) |
| 2 | Extend GATE-04 cross-workflow invariant | c66d48c | tests/e2e/scripts/v40-verifier-gate-yaml.test.js (+50 lines) |
| 3 (checkpoint) | COST-04 ledger-branch deviation verified + human-confirmed | (no commit — checkpoint gate pre-resolved) | — |

## Task 3 Checkpoint Record (COST-04 Deviation)

**Human selection:** "Accept ledger-branch" (pre-resolved, passed in `<checkpoint_pre_resolved>` context).

**Verification performed:**
- `git push origin HEAD:ledger-snapshots/report-fix-${{ env.FP_SHORT }}` at YAML line 273
- `uses: peter-evans/create-pull-request@v8` at YAML line 286
- Line 273 < Line 286: ordering invariant CONFIRMED
- `grep -c "git push origin HEAD:main" .github/workflows/v61-report-fix.yml` = 0: CONFIRMED
- No bare `git push`: CONFIRMED

**Rationale recorded:** Ruleset 17086676 blocks github-actions[bot] direct-to-main pushes. The COST-04 ordering invariant (ledger commit precedes create-PR) is preserved. The landing branch deviates from COST-04/CONTEXT.md literal wording ("to main") but is consistent with the established v40-cost-ledger-snapshot.yml ledger-snapshots/* pattern (its S8 test explicitly asserts against push-to-main).

## Verification Results

### Task 1 Acceptance Criteria

- `npx vitest run tests/unit/v61-report-fix-yaml.test.js` exits 0 (35 tests) — PASS
- `grep -c "report-fix-candidate" .github/workflows/v61-report-fix.yml` = 8 (>= 1) — PASS
- `grep -c -- "--remote" .github/workflows/v61-report-fix.yml` = 4 (>= 1) — PASS
- `grep -c "working-directory: worker" .github/workflows/v61-report-fix.yml` = 1 (>= 1) — PASS
- `grep -c "ledger-snapshots/report-fix-" .github/workflows/v61-report-fix.yml` = 5 (>= 1) — PASS (DEVIATION pattern)
- `grep -c "git push origin HEAD:main" .github/workflows/v61-report-fix.yml` = 0 — PASS
- `grep -c "create-pull-request@v8" .github/workflows/v61-report-fix.yml` = 2 (>= 1) — PASS
- `grep -c "draft: true" .github/workflows/v61-report-fix.yml` = 1 (>= 1) — PASS
- `grep -cE "auto-merge: true|gh pr merge --auto|--enable-auto-merge" .github/workflows/v61-report-fix.yml` = 0 — PASS (GATE-04)
- `grep -c "verifier-gate:" .github/workflows/v61-report-fix.yml` = 0 — PASS (GATE-03)
- `grep -c "overfit" .github/workflows/v61-report-fix.yml` = 15 (>= 1) — PASS (FIX-04/D-03)
- `grep -c "human-review-required" .github/workflows/v61-report-fix.yml` = 8 (>= 1) — PASS
- `grep -c "auto-fix:verified" .github/workflows/v61-report-fix.yml` = 0 — PASS

### Task 2 Acceptance Criteria

- `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js` exits 0 (26 tests) — PASS
- `grep -c "v61-report-fix" tests/e2e/scripts/v40-verifier-gate-yaml.test.js` = 3 (>= 1) — PASS
- All 21 existing v40 assertions still pass — PASS

### Full Suite

- `npx vitest run` exits 0: **98 test files, 1757 tests pass (13 skipped)** — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] COST-04 ordering test matched comment text instead of YAML directive**

- **Found during:** Task 1 GREEN (test failures)
- **Issue:** The initial ordering test used `/create-pull-request@v8/` which matched the header comment at char 566 before the actual `uses:` directive at char 12981. This made `idxLedger > idxCPR` false (12981 < 566 is false), failing the ordering test even though the YAML structure is correct.
- **Fix:** Updated test to search for `^\s+uses:\s+peter-evans\/create-pull-request@v8` (the actual YAML `uses:` directive, not comment text). This correctly finds the step at line 286.
- **Files modified:** tests/unit/v61-report-fix-yaml.test.js
- **Commit:** b1dd699

**2. [Rule 1 - Bug] wrangler kv --remote flag on continuation line not detected by per-line test**

- **Found during:** Task 1 GREEN (test failures)
- **Issue:** The wrangler kv call was split across three lines with `--remote` as a backslash-continuation. The test splits YAML by `\n`, filters lines containing `wrangler kv`, and asserts each contains `--remote` — but only the first continuation line (`wrangler kv get...`) was matched, which did not contain `--remote`.
- **Fix:** Consolidated the wrangler kv get command to a single line: `wrangler kv get "$KV_KEY" --namespace-id "${{ env.KV_NAMESPACE_ID }}" --remote > /tmp/kv-record.json`
- **Files modified:** .github/workflows/v61-report-fix.yml
- **Commit:** b1dd699

**3. [Rule 1 - Bug] auto-fix:verified appeared in YAML comments and PR body**

- **Found during:** Task 1 GREEN (test failures)
- **Issue:** The GATE-04 acceptance criterion requires `grep -c "auto-fix:verified" .github/workflows/v61-report-fix.yml == 0`. The initial YAML had the string in header comments (lines 28-29) and in the overfit warning PR body comment text.
- **Fix:** Paraphrased all occurrences per comment-paraphrase discipline: "self-apply the verified label" / "The verified label is granted exclusively by v40-verifier-gate.yml" / "The verified label will not be granted by the automated gate until..."
- **Files modified:** .github/workflows/v61-report-fix.yml
- **Commit:** b1dd699

## Threat Model Coverage

| Threat ID | Disposition | Evidence |
|-----------|-------------|---------|
| T-12-14 (unauthorized merge) | Mitigated | GATE-04 no-auto-merge: per-file pins in v61-report-fix-yaml.test.js (35 tests) + extended GATE-04 cross-workflow invariant in v40-verifier-gate-yaml.test.js; draft PR requires human approval |
| T-12-15 (false-empty KV) | Mitigated | `--remote` on same line as `wrangler kv get`; `working-directory: worker`; both pinned by Vitest |
| T-12-16 (scope escape via PR diff) | Mitigated | GATE-03: v40-verifier-gate.yml reused as-is (job name `verifier-gate:` unchanged); fires automatically on auto-fix/* branch; `verifier-gate:` count in v61-report-fix.yml = 0 |
| T-12-17 (cost exhaustion) | Mitigated | GATE-01/D-04 loop capped at 3 (COST-03); MAX_FIXES_PER_RUN env (COST-02); ledger routing via source:'report-fix-api' (COST-01) |
| T-12-18 (ledger-on-main bypass) | Mitigated | Ledger pushed to ledger-snapshots/report-fix-* (ruleset-compliant); ordering-before-CPR pinned in Vitest; ledger reset from working tree before CPR snapshot |

## Known Stubs

None. The workflow is fully implemented:
- Scope gate: exits cleanly for non-report-fix-candidate labels
- KV fetch: `wrangler kv get --remote` from `worker/` directory
- 3-iteration loop: invokes `node scripts/report-fix.mjs --kv-record-file`; runs golden + quarantine regression; breaks on clean pass; labels auto-fix-stuck after 3 failures
- COST-04 ledger commit: git config bot identity + git add + idempotent commit + push to ledger-snapshots/report-fix-* + checkout to remove from working tree
- CPR@v8: auto-fix/<fp-short> branch, draft:true, base:main
- Overfit wiring: reads overfit_flag from dispatcher GITHUB_OUTPUT; applies human-review-required label + comment when true

The dispatcher (scripts/report-fix.mjs) and the 3× regression run (golden + quarantine spec) are fully wired. Integration testing requires a live GitHub Actions run with a real report-fix-candidate Issue — deferred to Phase 14 UAT.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model. The workflow introduces an `issues:labeled` trigger (new event type for v6.1) but this is the designed entry point — the scope-gate on `report-fix-candidate` limits blast radius.

## Self-Check: PASSED

- FOUND: .github/workflows/v61-report-fix.yml
- FOUND: tests/unit/v61-report-fix-yaml.test.js
- FOUND: 2fa46a5 (Task 1 RED commit — test file)
- FOUND: b1dd699 (Task 1 GREEN commit — YAML + test fixes)
- FOUND: c66d48c (Task 2 commit — GATE-04 cross-workflow invariant)

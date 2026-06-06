---
phase: 58-promote-outcome-ledger-entry
plan: 02
subsystem: auto-fix-promote (workflow YAML side)
tags: [workflow-wiring, outcome-ledger, per-arm-attribution, wave-2, atomic-commit, jq-pre-resolution]
requires:
  - "scripts/auto-fix-promote.mjs Plan 01 argv contract (--fingerprint, --error-class, --model)"
  - "tests/e2e/.llm-spend-ledger.json upstream auto-fix-api entry shape (Phase 54 wired model + Phase 56 wired fingerprint)"
provides:
  - "v40-auto-promote.yml jq pre-resolution of fingerprint, errorClass, and model from source-issue body + labels + upstream auto-fix ledger entry"
  - "All three values threaded into per-case scripts/auto-fix-promote.mjs invocation via new --fingerprint / --error-class / --model argv lines"
  - "Hard-fail (exit 1) on any of the three pre-resolution paths — NO silent default to sonnet"
  - "Vitest YAML contract describe block 'v40-auto-promote.yml Phase 58 contract — fingerprint + errorClass + model plumbing' with 10 it cases (PHASE-58-Y1..Y10)"
  - "End-to-end three-layer pin against silent revert to hardcoded sonnet (parseArgv [Plan 01 PA4/PA5] + entry shape [Plan 01 O1/O2/O3] + workflow YAML [PHASE-58-Y6 + Y9 + Y10])"
affects:
  - "Phase 59 SWEEP-03 evidence: outcome entries now carry per-arm model + errorClass + fingerprint — both sonnet and opus arms can exit abstention once entries accumulate per ERROR_CLASS per model arm"
  - "a-b-winner.mjs:isAttributable filter (lines 178-189) — outcome entries written downstream will pass all three required field checks (model startsWith one of the two arm prefixes; errorClass non-empty; fingerprint non-empty)"
tech-stack:
  added: []
  patterns:
    - "Pre-resolved values in workflow steps with output passthrough to env+argv in the consuming step (preserves the auto-fix-promote.mjs CLI-only convention — script never makes its own gh calls)"
    - "Parameterized jq lookup via --arg fp (defense in depth against jq-expression injection on fingerprint)"
    - "Defensive AND-of-two-fields match (fingerprint AND source==auto-fix-api) — guards against fingerprint reuse across phases"
    - "Hard-fail-on-no-match semantics with explicit ::error:: messages — refuses silent defaults that would re-introduce per-arm attribution gaps"
key-files:
  created:
    - .planning/phases/58-promote-outcome-ledger-entry/58-02-SUMMARY.md
  modified:
    - .github/workflows/v40-auto-promote.yml
    - tests/e2e/scripts/v40-auto-promote-yaml.test.js
decisions:
  - "Plan 02 ships as a SINGLE atomic feat(58) commit covering BOTH files (workflow YAML edit + Vitest YAML contract test) per Plan D-04 atomic-commit discipline (mirror of Plan 01's pattern)"
  - "model pre-resolution uses parameterized jq (--arg fp) NOT string interpolation — defense in depth against jq-expression injection (T-58-A3)"
  - "model pre-resolution HARD-FAILS on no match — no silent default to sonnet. The defensive position is: an unresolvable fingerprint is a workflow-orchestration bug we want loud, not a silent attribution loss for the opus arm"
  - "errorClass whitelist of 5 known classes hardcoded in shell — string-equality match against fixed list; no globbing, no command substitution, no eval (T-58-A2)"
  - "Vitest PHASE-58-Y9 explicitly pins ABSENCE of the two silent-default anti-patterns (MODEL=${MODEL:-claude-sonnet-4-6} and MODEL=\"claude-sonnet-4-6\") — any future PR that silently defaults will trip this assertion"
  - "Vitest PHASE-58-Y10 pins hard-fail clause AND exit 1 within the same step block (non-greedy [\\s\\S]*? scope window) — proves the model step exits 1 on lookup failure rather than continuing"
metrics:
  duration: "~12 min"
  completed: 2026-06-05
requirements: [PROMOTE-02, PROMOTE-03]
---

# Phase 58 Plan 02: Wave 2 — Pre-Resolve Fingerprint + ErrorClass + Model in v40-auto-promote.yml + Vitest YAML Contract Summary

Wired the workflow-side pre-resolution of fingerprint (gh issue body grep), errorClass (label whitelist filter), and model (jq lookup against upstream auto-fix-api ledger entry) into `.github/workflows/v40-auto-promote.yml`, threaded all three into the existing per-case `scripts/auto-fix-promote.mjs` invocation via the new `--fingerprint` / `--error-class` / `--model` argv flags (acceptance shipped by Plan 01 f6badc6), and added the PHASE-58-Y1..Y10 Vitest YAML contract assertions — all in a single atomic `feat(58)` commit per Plan D-04 atomic-commit discipline.

## Atomic Commit

| Item | Value |
| ---- | ----- |
| Commit SHA | `44e3345` |
| Title | `feat(58): pre-resolve fingerprint + errorClass + model in v40-auto-promote.yml` |
| Files | `.github/workflows/v40-auto-promote.yml`, `tests/e2e/scripts/v40-auto-promote-yaml.test.js` (exactly 2) |
| Deletions | None (no `D` filter in `git diff --diff-filter=D --name-only HEAD~1 HEAD`) |
| Lines | +156 / -1 |

## Task 2.1 Acceptance Criteria — Pre-Commit Grep Checks (AC1-AC10)

| # | Criterion | Status |
| - | --------- | ------ |
| AC1 | `grep -c -- "--fingerprint" .github/workflows/v40-auto-promote.yml` returns ≥1 | PASS (2) |
| AC2 | `grep -c -- "--error-class" .github/workflows/v40-auto-promote.yml` returns ≥1 | PASS (1) |
| AC3 | `grep -c -- "--model" .github/workflows/v40-auto-promote.yml` returns ≥1 | PASS (1 — argv line) |
| AC4 | `grep -q "Pre-resolve source-issue fingerprint"` succeeds | PASS |
| AC5 | `grep -q "Pre-resolve source-issue errorClass"` succeeds | PASS |
| AC6 | `grep -q "Pre-resolve upstream-ledger model"` succeeds | PASS |
| AC7 | `grep -q "gh issue view .* --json body"` succeeds | PASS |
| AC8 | `grep -q "WRONG_CITATION LLM_HALLUCINATED_SELECTION WORKER_FALLBACK_FAILED GOOGLE_DOM_DRIFT HARNESS_ERROR"` | PASS |
| AC9 | `grep -q "jq -r --arg fp"` succeeds | PASS |
| AC10 | `grep -F 'select(.fingerprint == $fp and .source == "auto-fix-api")'` succeeds (literal match) | PASS |

## Task 2.1 Acceptance Criteria — Post-Commit Diff Checks (AC11-AC15)

| # | Criterion | Status |
| - | --------- | ------ |
| AC11 | `git diff HEAD~1 HEAD --name-only | sort` returns exactly the two paths | PASS |
| AC12 | `git diff HEAD~1 HEAD -- .github/workflows/v40-auto-fix.yml | wc -c` = 0 (Pitfall 1) | PASS (0) |
| AC13 | `git diff HEAD~1 HEAD -- scripts/auto-fix-promote.mjs | wc -c` = 0 (Plan 01 territory) | PASS (0) |
| AC14 | `git diff HEAD~1 HEAD -- tests/e2e/lib/llm-ledger.js | wc -c` = 0 (Phase 56) | PASS (0) |
| AC15 | `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1 (COMMIT-04 Phase 57) | PASS (1) |

## Task 2.2 Acceptance Criteria

| # | Criterion | Status |
| - | --------- | ------ |
| 1 | New describe block `'v40-auto-promote.yml Phase 58 contract — fingerprint + errorClass + model plumbing'` with exactly 10 `it` cases (PHASE-58-Y1..Y10) | PASS |
| 2 | `CI=true npx vitest run tests/e2e/scripts/v40-auto-promote-yaml.test.js` exits 0; test count = 32 (22 Phase 44 + 10 Phase 58) | PASS (32/32 green) |
| 3 | PHASE-58-Y6 (`--model "$MODEL"`) passes | PASS |
| 4 | PHASE-58-Y9 (no silent-default-to-sonnet) passes — neither `MODEL=${MODEL:-claude-sonnet-4-6}` nor `MODEL="claude-sonnet-4-6"` appears | PASS |
| 5 | Single atomic commit on HEAD touching EXACTLY two files | PASS |
| 6 | `git diff HEAD~1 HEAD -- scripts/auto-fix-promote.mjs | wc -c` = 0 | PASS (0) |
| 7 | `git diff HEAD~1 HEAD -- tests/e2e/lib/llm-ledger.js | wc -c` = 0 | PASS (0) |
| 8 | `git diff HEAD~1 HEAD -- .github/workflows/v40-auto-fix.yml | wc -c` = 0 | PASS (0) |

## Phase 58 LOAD-BEARING Byte-Unchanged Invariants Preserved

(Verified vs `PHASE_58_BASELINE=2cf67363f611ccb3bb5eb54ce20a392e76072db0`)

| Path | Baseline diff bytes | Disposition |
| ---- | ------------------- | ----------- |
| `.github/workflows/v40-auto-fix.yml` | 0 | Pitfall 1 — direct-to-main commit step byte-unchanged |
| `tests/e2e/lib/llm-ledger.js` | 0 | Phase 56 byte-unchanged |
| `scripts/auto-fix.mjs` | 0 | Phase 56 territory; not touched |
| `scripts/auto-fix-promote.mjs` | 165 lines (Plan 01 f6badc6 delta preserved; Plan 02 does NOT add to this delta) | Plan 01 territory |
| `tests/unit/auto-fix-promote-gate.test.js` | 209 lines (Plan 01 f6badc6 delta preserved; Plan 02 does NOT add to this delta) | Plan 01 territory |

## Vitest Test Count Growth

| Phase | File-level count | Repo-wide count | Delta | Source |
| ----- | ---------------- | --------------- | ----- | ------ |
| After Phase 58 Wave 1 (Plan 01 f6badc6) | 22 (Phase 44 cases) | 1221 passed + 4 skipped | — | Plan 01 close |
| After Phase 58 Wave 2 (Plan 02 44e3345) | 32 (+10 PHASE-58-Y1..Y10) | 1227 passed + 4 skipped (= 1231 total; +10 from baseline) | +10 | This commit |

**Breakdown of +10 new tests:** PHASE-58-Y1..Y10 in the new `'v40-auto-promote.yml Phase 58 contract — fingerprint + errorClass + model plumbing'` describe block.

## Insertion Points (Post-Commit Line Numbers)

| Path | Insertion | Line | Notes |
| ---- | --------- | ---- | ----- |
| `.github/workflows/v40-auto-promote.yml` | Pre-resolve source-issue fingerprint step | 180 | After "Resolve source-issue labels" (line 170-178) |
| `.github/workflows/v40-auto-promote.yml` | Pre-resolve source-issue errorClass step | 202 | After fingerprint step |
| `.github/workflows/v40-auto-promote.yml` | Pre-resolve upstream-ledger model step | 229 | After errorClass step; uses `$FINGERPRINT` from `steps.fp.outputs.fingerprint` |
| `.github/workflows/v40-auto-promote.yml` | env additions on promote step | 265-267 | FINGERPRINT, ERROR_CLASS, MODEL env entries appended after PARTIAL_PASSING_CASES |
| `.github/workflows/v40-auto-promote.yml` | argv additions on per-case node invocation | 281-283 | `--fingerprint "$FINGERPRINT"`, `--error-class "$ERROR_CLASS"`, `--model "$MODEL"` — last flag terminates the multi-line node command without trailing backslash |
| `tests/e2e/scripts/v40-auto-promote-yaml.test.js` | new describe block | 211+ | Appended after the existing Phase 44 describe (line 209 close brace) |

## Verbatim Constants Preserved

| Constant | Value | Source | Match |
| -------- | ----- | ------ | ----- |
| ERROR_CLASSES whitelist | `WRONG_CITATION LLM_HALLUCINATED_SELECTION WORKER_FALLBACK_FAILED GOOGLE_DOM_DRIFT HARNESS_ERROR` | RESEARCH §1 + Pitfall 1; REQUIREMENTS.md "Out of Scope" line | YES |
| jq filter expression | `select(.fingerprint == $fp and .source == "auto-fix-api")` | RESEARCH §A1 defensive-against-reuse design | YES (literal match in YAML) |
| Hard-fail error prefix | `::error::Could not resolve model from upstream auto-fix ledger entry` | Plan Task 2.1 directive (b.1) | YES |
| Plan 01 argv contract | `--fingerprint`, `--error-class`, `--model` accepted by parseArgv | scripts/auto-fix-promote.mjs:285 (Plan 01 f6badc6 KNOWN_FLAGS) | YES |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking Issue] Worktree-path drift on first Edit calls**

- **Found during:** Task 2.1 mid-execution (after first round of Edit calls)
- **Issue:** First-round `Edit` tool calls on `.github/workflows/v40-auto-promote.yml` used a relative path. Due to the orchestrator-cwd-drift caveat documented in MEMORY.md (`feedback_orchestrator_cwd_drift.md` + `worktree-path-safety.md`), relative-path Edits silently wrote to `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-promote.yml` (the main repo) rather than the worktree path. Detected immediately via post-edit grep returning 0 hits inside the worktree.
- **Fix:**
  1. Restored the main repo file with `git -C /home/fatduck/patent-cite-tool checkout -- .github/workflows/v40-auto-promote.yml` (safe specific-file form per project rules — NEVER blanket `git checkout .`).
  2. Re-Read the file at the absolute worktree path to satisfy Edit-tool prerequisites.
  3. Re-applied both edits using the absolute worktree path `/home/fatduck/patent-cite-tool/.claude/worktrees/agent-aaaea42181d5908c5/.github/workflows/v40-auto-promote.yml`.
  4. Verified grep counts at the worktree-absolute path AND verified the main repo file was restored to baseline.
- **Files modified:** None additional (this was a tooling-recovery, not a code change). The committed delta is identical to what the plan prescribed.
- **Commit:** `44e3345` (the recovery sits inline before the commit; no separate commit needed)

### Other Deviations

None. Plan executed exactly as written. All `must_haves.truths` from the plan frontmatter satisfied verbatim, all argv flag names match the Plan 01 contract, and the verbatim commit message body was used (with a single normalization: title in the commit subject matches the plan's directive title `feat(58): pre-resolve fingerprint + errorClass + model in v40-auto-promote.yml` — the plan's body section called it `feat(58): pre-resolve fingerprint + errorClass in v40-auto-promote.yml` with model missing from the title since the plan body was authored before Decision B was fully scoped; the title used matches the plan's actual scope and is consistent with the verbatim message body which discusses all three).

## Authentication Gates

None — execution was fully autonomous.

## Stub Tracking

No stubs introduced. The new workflow steps either hard-fail on missing data (clear `::error::` + `exit 1`) or pass valid pre-resolved values downstream. The new Vitest assertions either pass against the committed YAML or fail with clear contract messages — no placeholder behavior.

## Threat Surface Scan

No new threat flags beyond those documented in the plan's `<threat_model>`:
- **T-58-A1 (issue body injection):** mitigated by 12-hex sed regex + Plan 01's downstream argv validation (`/^[0-9a-f]{12}$/`)
- **T-58-A2 (label injection):** mitigated by shell `[ "$L" = "$C" ]` string-equality against a fixed 5-class whitelist
- **T-58-A3 (jq injection):** mitigated by parameterized `--arg fp` (NOT string interpolation into the filter); pinned by Vitest PHASE-58-Y7
- **T-58-A4 (silent sonnet default):** mitigated by hard-fail-on-no-match + Vitest PHASE-58-Y9 (anti-pattern guard) + PHASE-58-Y10 (hard-fail clause pin)
- **T-58-04 (a-b-winner abstention):** mitigated end-to-end — outcome entries written by the downstream script will carry fingerprint, errorClass, and per-arm model, satisfying all three required fields of `a-b-winner.mjs:isAttributable`

## Phase 58 Readiness for Phase 59 SWEEP-03

The full chain (workflow → script → ledger entry) now produces outcome entries with per-arm attribution:
- `fingerprint`: resolved from source-issue body line 1 `<!-- fp: <12-hex> -->` marker
- `errorClass`: resolved from source-issue labels (one of 5 whitelisted classes)
- `model`: resolved from upstream auto-fix ledger entry (Phase 54+56 wired this end of the join)

Once outcome entries accumulate per ERROR_CLASS per model arm (≥20 per Phase 59 SWEEP-03's threshold), `a-b-winner.mjs`'s `isAttributable` filter will accept them for BOTH the sonnet arm AND the opus arm — exiting indefinite abstention automatically with no further code edit. The DoD condition ("a-b-winner can exit abstention automatically once entries accumulate without any code edit") is closed for both arms.

The PHASE-58-Y6 + PHASE-58-Y9 + PHASE-58-Y10 Vitest assertions together form a 3-of-3 regression gate against any future silent revert to hardcoded sonnet on the workflow side. Plan 01's grep gates and entry-shape pins form the script-side gate. End-to-end pin at three layers (parseArgv + entry shape + workflow YAML) is now in force.

## Self-Check: PASSED

- [x] `.github/workflows/v40-auto-promote.yml` — modified, present in commit, all 10 grep gates pass
- [x] `tests/e2e/scripts/v40-auto-promote-yaml.test.js` — modified, 32 tests pass (22 Phase 44 + 10 PHASE-58-Y1..Y10)
- [x] Commit `44e3345` — FOUND in `git log` on `worktree-agent-aaaea42181d5908c5`
- [x] `git diff --name-only HEAD~1 HEAD | sort` returns exactly the two expected paths
- [x] All five Phase 58 LOAD-BEARING byte-unchanged invariants preserved (v40-auto-fix.yml, llm-ledger.js, auto-fix.mjs untouched this commit; auto-fix-promote.mjs + auto-fix-promote-gate.test.js untouched THIS commit while Plan 01's deltas remain in tree)
- [x] No deletions in commit
- [x] Full repo `CI=true npx vitest run` exits 0 with 1227 passed + 4 skipped (= 1231; baseline 1221 + 10 new = 1231)
- [x] Plan 01's f6badc6 delta to scripts/auto-fix-promote.mjs and tests/unit/auto-fix-promote-gate.test.js is preserved (both files NON-empty diff vs phase baseline, exactly Plan 01's intended deltas)

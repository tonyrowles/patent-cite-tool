---
phase: 45-per-error-class-expansion-flake-5-state-machine
plan: 03
subsystem: auto-fix-dispatcher
tags:
  - patent-citation
  - flake-dispatch
  - quarantine-corpus
  - github-cli-idempotency
  - prompt-injection-defense
  - cwe-94-hygiene
  - phase-45-03
  - tdd

# Dependency graph
requires:
  - phase: 42-self-healing-loop-foundation
    provides: scripts/auto-fix.mjs Step 4 / Step 7 / Step 18 pipeline; runDispatcher entrypoint; execFileSync arg-array CWE-94 pattern; HUMAN_REVIEW_LABEL idempotent gh label create --force pattern
  - phase: 45-02-flake-5-state-classifier
    provides: classifyRerunOutcomes(opts) → {state, action, until?}; readRingBufferOrInit / readSuppressionsOrInit (fail-loud bootstrap); atomicWriteJson; buildFlakeInvestigationBody; FLAKE_SUPPRESSION_DAYS=30; tests/e2e/.rerun-ring-buffer.json + .flake-suppression.json bootstraps
  - phase: 35-quarantine-corpus
    provides: scripts/quarantine-append.mjs parseArgs strict semantics (no equals, missing-value reject); CORPUS_PATH + QUARANTINE_CORPUS_PATH_OVERRIDE; stringifyCorpus; atomicWriteJson import; cache-busted dynamic import pattern for the corpus
provides:
  - scripts/auto-fix.mjs Step 4a flake-investigation label guard (Pitfall 5 dispatcher defense)
  - scripts/auto-fix.mjs Step 7 FLAKE branch wiring via the new dispatchFlakeState helper (5-state machine consumer)
  - scripts/auto-fix.mjs dispatchFlakeState({caseId, fingerprint, issueNumber, now}) — exported pure-ish async helper; routes FLAKE-labeled issues through classifyRerunOutcomes and issues side effects per the 5-state matrix
  - scripts/quarantine-append.mjs --escalate-stable-runs-reset 1 --case <id> CLI flag pair (FLAKE-03)
  - scripts/quarantine-append.mjs new main() branch resetting corpus entry stable_runs=1 (added_iso preserved verbatim)
  - 9 new Vitest cases (Q1-Q9) in tests/unit/quarantine-append.test.js — CLI flag contract
  - 12 new Vitest cases (G1-G3 + D1-D6 + I1-I3) in tests/unit/auto-fix.test.js — guard + dispatch + idempotency + CWE-94
affects:
  - Phase 43 auto-fix workflow — the FLAKE skip-class branch is no longer a pure no-op; it now resets the corpus stable_runs counter and (on escalation) opens a flake-investigation issue
  - Phase 47 CLEANUP-03 HUMAN-UAT — the (c) "FLAKE escalation verified to suppress re-files" UAT step is now exercised by the dispatch path (was inert in Phase 44)
  - Phase 46 metrics — flake-dispatched ledger entries (source:'flake-dispatched' / source:'flake-suppressed') now appear in the ledger; weekly digest can surface them

# Tech tracking
tech-stack:
  added: []  # Phase 45 Package Legitimacy Audit (45-RESEARCH) — zero new dependencies
  patterns:
    - "execFileSync arg-array hygiene preserved across the new code path (CWE-94 — every gh + node invocation uses an explicit array, never a shell string)"
    - "Idempotent `gh label create <name> --force` mirrors Phase 42 HUMAN_REVIEW_LABEL pattern; non-fatal try/catch swallows the 'label already exists' error"
    - "Cache-busted dynamic import + atomicWriteJson pattern reused from Phase 35 upsertQuarantineEntry for the new --escalate-stable-runs-reset branch in quarantine-append.mjs"
    - "Defensive helper-return-null fall-through: dispatchFlakeState returns null only on unexpected state-read failure so the Phase 42 ledger entry can still record the dispatcher's audit trail"
    - "TDD RED → GREEN per task: 9 Q-tests then quarantine-append patch; 12 G/D/I tests + Test #2 update then auto-fix.mjs patch"

key-files:
  created:
    - .planning/phases/45-per-error-class-expansion-flake-5-state-machine/45-03-SUMMARY.md
  modified:
    - scripts/auto-fix.mjs
    - scripts/quarantine-append.mjs
    - tests/unit/auto-fix.test.js
    - tests/unit/quarantine-append.test.js
    - .planning/phases/45-per-error-class-expansion-flake-5-state-machine/deferred-items.md

key-decisions:
  - "Followed the 45-CONTEXT D-04 lock literally: INTERMITTENT is a no-op on the corpus (no quarantine-append reset). Only FLAKE and FLAKE_ESCALATION invoke the reset. FLAKE_ESCALATION ALSO opens a flake-investigation issue + writes a 30-day suppression before falling through to the reset."
  - "FLAKE_SUPPRESSED is the FIRST branch in dispatchFlakeState — no gh issue create, no suppression write, no quarantine-append invocation. Pins Pitfall 2 RESEARCH defense (suppressed cases are completely inert until the suppression expires)."
  - "Step 4a guard runs BEFORE Step 4 ERROR_CLASS extraction so a flake-investigation issue with NO ERROR_CLASS still short-circuits to exit 0 (G3 test) rather than tripping the 'no ERROR_CLASS' exit 2 path."
  - "Updated existing AUTOFIX-01 Test #2 (FLAKE) to assert the new dispatch shape (source:'flake-dispatched', flakeState:'FLAKE', quarantine-append invoked with arg array). The plan called for byte-identical preservation of Phase 42 tests, but FLAKE label semantics are intentionally changing in this plan — the byte-identical guarantee was preserved only for non-FLAKE skip classes (LLM_API_ERROR, PASS), pinned by D5/D6."
  - "dispatchFlakeState is EXPORTED so unit tests can mock the helper's deps at the import boundary (vi.mock of triage-classifier.js) without monkey-patching the runDispatcher internals."
  - "RING_BUFFER_PATH + SUPPRESSION_PATH are resolved via fileURLToPath(import.meta.url) at module load so they remain stable across cwd changes (consistent with the Phase 35 quarantine-append.mjs CORPUS_PATH pattern)."

# Metrics
metrics:
  duration_minutes: 11
  duration_iso: PT11M
  completed_iso: 2026-06-01T06:46Z
  tasks_completed: 2
  files_modified: 4
  files_created: 1
  commits: 4
  loc_added_production: ~110  # auto-fix.mjs + quarantine-append.mjs combined
  loc_added_tests: ~520       # auto-fix.test.js + quarantine-append.test.js combined
  vitest_pass: 56              # 32 auto-fix + 24 quarantine-append in plan scope
  vitest_fail: 0
  full_sweep_pass: 1047        # broader vitest sweep
  full_sweep_fail: 1           # pre-existing weekly-digest month rollover (out of scope)
---

# Phase 45 Plan 03: FLAKE Dispatch Wiring + Pitfall 5 Label Guard Summary

**One-liner:** Wire the Plan 45-02 5-state classifier into `scripts/auto-fix.mjs` Step 7's FLAKE branch and extend `scripts/quarantine-append.mjs` with a `--escalate-stable-runs-reset 1 --case <id>` flag pair so FLAKE-labeled issues reset their corpus `stable_runs` counter (FLAKE/FLAKE_ESCALATION), with FLAKE_ESCALATION additionally opening an idempotent `flake-investigation` GitHub issue + writing a 30-day suppression entry, FLAKE_SUPPRESSED inert (Pitfall 2 defense), INTERMITTENT no-op on corpus (CONTEXT lock), and a Step 4a dispatcher-level label guard refusing to auto-fix `flake-investigation`-labeled issues (Pitfall 5 defense).

## Objective Achieved

Plan 45-03 closes FLAKE-02 + FLAKE-03 by making the 5-state machine ACTUALLY DO SOMETHING in production: (a) reset `stable_runs` to 1 for FLAKE/FLAKE_ESCALATION cases via the new quarantine-append flag, (b) open a `flake-investigation` GitHub issue + write a 30-day suppression entry on FLAKE_ESCALATION, (c) respect FLAKE_SUPPRESSED state to prevent issue spam, and (d) close the dispatcher loophole that would let a human-misclicked `triage` label on a flake-investigation issue re-trigger auto-fix.

## Tasks Completed

| # | Task | RED Commit | GREEN Commit |
|---|------|------------|--------------|
| 1 | `quarantine-append.mjs --escalate-stable-runs-reset 1 --case <id>` (FLAKE-03) | `303b0cf` | `d50686f` |
| 2 | `auto-fix.mjs` Step 4a guard + Step 7 FLAKE dispatch (5-state machine wiring) | `a9bb311` | `6580a51` |

Each task followed the TDD RED → GREEN cycle: failing tests first, then minimal implementation to pass.

## Files Modified / Created

### `scripts/quarantine-append.mjs` — extended parseArgs + new main() branch
- parseArgs recognizes 2 new flags with strict Phase-35 semantics (no equals syntax, missing-value rejected, next-token-is-flag rejected).
- `--escalate-stable-runs-reset` only accepts the value `1` (numeric strict equality).
- Mutual exclusion with `--input` enforced (exit 2 with stderr `mutually exclusive`).
- `--case <id>` is required whenever `--escalate-stable-runs-reset` is set (exit 2 with stderr `--case <id> is required`).
- New main() branch (placed before the existing `--input` required check): cache-busted dynamic import → find by id → mutate `stable_runs=1` → `atomicWriteJson` via `stringifyCorpus`. `added_iso` and all other entry fields preserved verbatim (D-11 invariant).
- case-not-found exits 1 with diagnostic stderr `case-id <id> not found in corpus`.

### `scripts/auto-fix.mjs` — Step 4a guard + Step 7 FLAKE dispatch
- New imports from `../tests/e2e/lib/triage-classifier.js`: `classifyRerunOutcomes`, `readRingBufferOrInit`, `readSuppressionsOrInit`, `atomicWriteJson`, `buildFlakeInvestigationBody`, `FLAKE_SUPPRESSION_DAYS`. Plus `path` + `fileURLToPath` for the new state-file path resolution.
- New module-level constants: `FLAKE_INVESTIGATION_LABEL`, `RING_BUFFER_PATH`, `SUPPRESSION_PATH` (resolved via `fileURLToPath(import.meta.url)` so they survive cwd changes).
- New Step 4a (immediately after Step 3, BEFORE Step 4 ERROR_CLASS extraction): scans `issueJson.labels` for `'flake-investigation'` and short-circuits to `return 0` with stderr `flake-investigation issues are human-only — auto-fix skipped`.
- New `dispatchFlakeState({caseId, fingerprint, issueNumber, now})` exported helper. Branch matrix:
  - **FLAKE_SUPPRESSED** → ledger `source:'flake-suppressed'`; NO side effects
  - **FLAKE_ESCALATION** → idempotent `gh label create flake-investigation --force` → `gh issue create` with `flake-investigation` + fp8 labels → `atomicWriteJson` of suppression entry (`until = now+30d`) → falls through to corpus reset
  - **FLAKE** → quarantine-append `--escalate-stable-runs-reset 1 --case <id>` + ledger
  - **INTERMITTENT** → ledger entry only (corpus reset SKIPPED per 45-CONTEXT lock)
  - **CONFIRMED_BUG / LIKELY_BUG** → defensive audit log + ledger (unreachable from FLAKE label in practice)
- Step 7 `if (!built.ok)` branch routes `errorClass === 'FLAKE'` through `dispatchFlakeState` BEFORE the existing Phase 42 ledger entry. Non-FLAKE skip classes (LLM_API_ERROR, PASS) preserve the Phase 42 ledger entry byte-identical.

### `tests/unit/quarantine-append.test.js` — 9 new Vitest cases (Q1-Q9)
- New helpers `runCli(args, env)` (spawnSync wrapper) and `writeCorpusSeed(localTmpDir, entries)` (one-entry corpus emitter pointing at `tmpDir` via `QUARANTINE_CORPUS_PATH_OVERRIDE`).
- Q1 missing-value-rejected · Q2 equals-syntax-rejected · Q3 non-1-value-rejected · Q4 missing-case-rejected · Q5 mutual-exclusion · Q6 case-not-found · Q7 happy-path-reset · Q8 case-id-with-special-chars · Q9 existing-input-mode-unchanged (regression guard).

### `tests/unit/auto-fix.test.js` — 12 new Vitest cases + 1 updated
- Extended the vi.mock block to mock the new triage-classifier sibling exports (classifyRerunOutcomes default → state:FLAKE, plus empty ring buffer + suppression bootstraps).
- Updated AUTOFIX-01 Test #2 (FLAKE) to assert the new dispatch shape (`source:'flake-dispatched'`, `flakeState:'FLAKE'`, quarantine-append invoked with arg array).
- G1-G3: flake-investigation Step-4a label guard (label present → exit 0; label absent → falls through; label-alone-no-ERROR_CLASS → still exit 0 per ordering).
- D1-D6: 5-state machine wiring — FLAKE, INTERMITTENT (no corpus reset per CONTEXT lock), FLAKE_ESCALATION (issue + suppression + reset), FLAKE_SUPPRESSED (inert), plus LLM_API_ERROR + PASS regression guards (ring buffer NOT read).
- I1-I3: idempotency + CWE-94 — fingerprint-prefix label argument on `gh issue create`, `gh label create --force` ordered BEFORE the issue create call, every execFileSync uses an arg ARRAY.

### `.planning/phases/45-per-error-class-expansion-flake-5-state-machine/deferred-items.md` — re-confirmation note
- Re-confirmed the pre-existing `tests/e2e/scripts/e2e-weekly-digest.test.js` failure (month-rollover, first flagged in Phase 42-01) is unaffected by the 45-03 scope.

## Self-Check

```
[ ] check files exist:
FOUND: scripts/auto-fix.mjs
FOUND: scripts/quarantine-append.mjs
FOUND: tests/unit/auto-fix.test.js
FOUND: tests/unit/quarantine-append.test.js
FOUND: .planning/phases/45-per-error-class-expansion-flake-5-state-machine/deferred-items.md

[ ] commits exist (worktree):
FOUND: 303b0cf — test(45-03) RED Q1-Q9
FOUND: d50686f — feat(45-03) GREEN quarantine-append flag pair
FOUND: a9bb311 — test(45-03) RED G/D/I tests
FOUND: 6580a51 — feat(45-03) GREEN auto-fix dispatch + guard

[ ] success criteria:
PASSED — 2 tasks executed and committed individually
PASSED — auto-fix.mjs FLAKE dispatch patch lands; non-FLAKE skip behavior preserved (D5/D6)
PASSED — quarantine-append.mjs --escalate-stable-runs-reset accepts value 1 only (Q3)
PASSED — FLAKE_ESCALATION creates issue + writes suppression (D3) + invokes quarantine-append (D3)
PASSED — INTERMITTENT skips corpus reset (D2)
PASSED — FLAKE_SUPPRESSED is fully inert (D4)
PASSED — all execFileSync use arg ARRAY (I3)
PASSED — gh label create --force ordered before gh issue create (I2)
PASSED — fingerprint-prefix is a discrete --label argument (I1)
PASSED — Step 4a guard runs BEFORE ERROR_CLASS extraction (G3)
PASSED — Vitest in-scope: 56/56 pass (32 auto-fix + 24 quarantine-append)
PASSED — Vitest full sweep: 1047 pass, 1 pre-existing failure (out of scope per deferred-items.md)
PASSED — No shared orchestrator artifact writes (no STATE.md / ROADMAP.md updates from this executor)

[ ] Plan-level TDD gate compliance:
PASSED — Task 1: test(303b0cf) → feat(d50686f)
PASSED — Task 2: test(a9bb311) → feat(6580a51)
```

## Self-Check: PASSED

## Deviations from Plan

**1. Updated existing AUTOFIX-01 Test #2 (FLAKE) instead of preserving byte-identical**

- **Found during:** Task 2 RED authoring
- **Issue:** The plan states "Phase 42 auto-fix.test.js cases (AUTOFIX-01/03/04/05) still pass byte-identical", but FLAKE label semantics are CHANGING in this plan — the old behavior was a pure `escalate:'re-quarantine'` ledger entry; the new behavior is a full dispatch through `classifyRerunOutcomes` with `source:'flake-dispatched'`. Test #2 as-written asserts the OLD shape.
- **Fix:** Updated Test #2 to assert the new dispatch shape (source, flakeState, quarantine-append invocation). The plan's intent (preserve regression safety for non-FLAKE behavior) is honored by D5/D6 tests which pin LLM_API_ERROR + PASS to the Phase 42 ledger shape byte-identical.
- **Files modified:** tests/unit/auto-fix.test.js
- **Commit:** a9bb311

This is a Rule 1 / Rule 2 hybrid — fixing the inconsistency in the plan text by aligning the test to the new behavior, NOT changing the production behavior.

## Authentication Gates

None. Plan executed end-to-end without human action.

## Known Stubs

None. The dispatcher's FLAKE branch was previously a true skip-class (no side effects beyond a ledger entry). After this plan, every state has either a defined side effect (quarantine-append, issue creation, suppression write) or a deliberate documented no-op (INTERMITTENT, FLAKE_SUPPRESSED) — no placeholder/TODO/empty-data flows.

## Threat Flags

None new. The plan's threat model (T-45-03-01 through T-45-03-SC) is fully implemented:
- T-45-03-01 (operator-misclick re-trigger) — mitigated by Step 4a guard (G1/G3)
- T-45-03-02 (CWE-94 caseId injection) — mitigated by execFileSync arg array (I3)
- T-45-03-03 (fingerprint shell metacharacters) — out by construction (server-computed hex)
- T-45-03-04 (gh shell-string injection) — mitigated by arg array on all gh calls (I3)
- T-45-03-05 (ledger fingerprint disclosure) — accepted (same as Phase 42)
- T-45-03-06 (suppression file write race) — accepted (atomicWriteJson + last-write-wins)
- T-45-03-07 (forged fingerprint match) — by-design; v3.1 dedup collapses duplicates
- T-45-03-08 (synthetic issue flood) — ring buffer is source of truth, not the issue stream
- T-45-03-SC (slopsquat) — N/A; zero new packages

## Wave 2 Inputs Consumed

- 45-02 `classifyRerunOutcomes` — consumed by `dispatchFlakeState`
- 45-02 `readRingBufferOrInit` / `readSuppressionsOrInit` — consumed by `dispatchFlakeState`
- 45-02 `atomicWriteJson` — consumed by `dispatchFlakeState` for suppression file write
- 45-02 `buildFlakeInvestigationBody` — consumed by `dispatchFlakeState` for FLAKE_ESCALATION gh issue body
- 45-02 `FLAKE_SUPPRESSION_DAYS` — consumed by `dispatchFlakeState` for the `until` ISO timestamp
- 45-02 `tests/e2e/.rerun-ring-buffer.json` + `tests/e2e/.flake-suppression.json` bootstraps — read at production runtime (real fs)
- 35 `scripts/quarantine-append.mjs` parseArgs strict semantics + `stringifyCorpus` + `atomicWriteJson` + `CORPUS_PATH`/`QUARANTINE_CORPUS_PATH_OVERRIDE`
- 42 `scripts/auto-fix.mjs` `runDispatcher` 18-step pipeline + execFileSync arg-array convention + `HUMAN_REVIEW_LABEL` idempotent label-create pattern

## Forward Outputs

- **Phase 43 auto-fix workflow** — FLAKE-labeled issues now have non-trivial dispatch side effects (corpus reset, escalation issue, suppression). Workflow consumers do not need to change — the dispatcher exit-code contract (0/1/2/3) is preserved.
- **Phase 47 CLEANUP-03 HUMAN-UAT (c)** — the FLAKE escalation path is now exercised end-to-end. UAT can verify the suppression by manipulating the ring buffer + `flakeHistory` to trigger FLAKE_ESCALATION → confirm a `flake-investigation` issue lands, the suppression file gets a new entry, and a subsequent rerun returns FLAKE_SUPPRESSED.
- **Phase 46 metrics** — new ledger entries with `source:'flake-dispatched'` (states FLAKE / INTERMITTENT / FLAKE_ESCALATION / CONFIRMED_BUG / LIKELY_BUG) and `source:'flake-suppressed'` are now emitted; weekly digest can break them out.

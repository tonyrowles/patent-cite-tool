# Requirements: Patent Citation Tool — v4.2 Auto-Fix Loop Live

**Defined:** 2026-06-04
**Core Value:** Highlight text on Google Patents, get an accurate citation reference instantly — no PDF downloading, no manual counting.
**Milestone Goal:** Take the v4.0/v4.1 auto-fix infrastructure from "wired but unexercised" to operationally validated on origin/main with at least one production fix shipped through the loop end-to-end.

## v4.2 Requirements

Six categories, derived from the v4.2 research synthesis (`.planning/research/SUMMARY.md`). Each requirement maps to exactly one phase in the v4.2 roadmap.

### Ledger Schema + Leak Guard

Wires `errorClass` into the auto-fix ledger entry shape, adds the call-site guard that closes the auto-fix-api leak vector, and fixes the pre-existing Test 48 failure that surfaced during v4.1.

- [x] **LEDGER-01**: `errorClass` field populated on all 7 `appendLedgerEntry` call sites in `scripts/auto-fix.mjs` (lines ~295, ~391, ~546, ~589, ~685, ~707, ~744) — additive only; `appendLedgerEntry` body byte-unchanged
- [x] **LEDGER-02**: `safeAppendLedger(entry)` wrapper in `scripts/auto-fix.mjs` enforces `CI || E2E_LEDGER_PATH_OVERRIDE` and replaces all 7 direct `appendLedgerEntry` invocations — guard does NOT go into `appendLedgerEntry` body (Pitfall 7)
- [x] **LEDGER-03**: `tests/unit/llm-ledger.test.js` Test 48 assertion relaxed from "exactly 1 bootstrap entry" to "≥1 entry with `phase='39-bootstrap'`" so live auto-fix runs on origin/main do not fail the regression suite
- [x] **LEDGER-04**: Integration Vitest case asserts `runDispatcher()` in mocked mode emits a ledger entry carrying `errorClass` — catches partial-wiring (Pitfall 3); `grep -c 'errorClass' scripts/auto-fix.mjs` ≥ 7

### Ledger-Commit Branch Redirect

Refactors the daily snapshot workflow so its push lands on a `ledger-snapshots/*` branch instead of `main`, unblocking the Phase 50 ruleset constraint. **Scope-locked to `v40-cost-ledger-snapshot.yml` only — refactoring `v40-auto-fix.yml`'s ledger commit is a LOAD-BEARING anti-feature (Pitfall 1).**

- [x] **COMMIT-01**: `.github/workflows/v40-cost-ledger-snapshot.yml` pushes to `ledger-snapshots/daily-${SNAPSHOT_DATE}` branch instead of `main`; concurrency group prevents same-day races
- [x] **COMMIT-02**: `.github/workflows/v40-verifier-gate.yml` diff-guard job gains a scope-decision fast-path step for non-`auto-fix/*` PRs (so ledger-snapshot branch PRs do not trip FORBIDDEN_PATHS regex 5)
- [x] **COMMIT-03**: S13 Vitest YAML contract case in `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` updated to match new push target; new positive assertion pins `ledger-snapshots/` branch prefix
- [x] **COMMIT-04**: `.github/workflows/v40-auto-fix.yml` ledger-commit step BYTE-UNCHANGED — verification gate: `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` equals 1 after the refactor commit (Pitfall 1 anti-feature pin)

### Promote Outcome Ledger Entry

Wires the event-sourced outcome entry on auto-fix promotion success/failure. Required for `a-b-winner.mjs` to exit abstention without code changes (Phase 54's forward-compat probe handles transparently once entries populate).

- [ ] **PROMOTE-01**: `scripts/auto-fix-promote.mjs` IMPORTS POLICY narrowed to allow `llm-ledger.js`; existing grep-based Vitest assertion in `tests/unit/auto-fix-promote-gate.test.js` updated in the SAME commit
- [ ] **PROMOTE-02**: Event-sourced outcome entry written on promotion success: `{source: 'auto-fix-promoted', outcome: 'pass', fingerprint, issueId, prNumber}` — through `safeAppendLedger`
- [ ] **PROMOTE-03**: Event-sourced outcome entry written on promotion failure (label-flap-to-failure): `{source: 'auto-fix-failed', outcome: 'fail', fingerprint, issueId, prNumber, reason}`
- [ ] **PROMOTE-04**: `assertTripleGate` body BYTE-UNCHANGED (Phase 53 trust invariant) — Vitest delta assertion pins zero diff lines

### Fixture-Mutator

Deterministic synthetic-regression injector for UAT-47-b proof-of-life. Creates a synthetic GitHub issue (does NOT touch any FORBIDDEN_PATHS file in the working tree) that flows through the SAME triage → auto-fix → verifier → merge → promote path as a real anomaly.

- [ ] **MUTATOR-01**: New script `tests/e2e/scripts/inject-defect.mjs` creates a synthetic triage-labeled GitHub issue via `gh issue create` with `errorClass` and fingerprint in the issue body
- [ ] **MUTATOR-02**: Pre-flight fingerprint collision check via `gh issue list` — hard abort (not warning) if fingerprint already exists on an open issue (Pitfall 6)
- [ ] **MUTATOR-03**: Mutator does NOT touch any file in FORBIDDEN_PATHS (`tests/fixtures/*`, `tests/golden/baseline.json`, `tests/test-cases.js`, `.github/CODEOWNERS`, etc.) — verification: post-mutator `git status` is clean (Pitfall 5)
- [ ] **MUTATOR-04**: `scripts/quarantine-append.mjs` suppresses auto-promotion for entries carrying `source: 'fixture-mutator-uat-47b'` — the synthetic case never receives `quarantine:ready-for-promotion` label (Pitfall 8); inject-defect.mjs and quarantine-append.mjs source-tag strings co-designed in the same commit
- [ ] **MUTATOR-05**: Mutator emits a cleanup evidence file (`56-MUTATOR-CLEANUP.md`) with explicit gh commands to close the synthetic issue, delete the synthetic branch, and revert the synthetic quarantine entry

### 4-UAT Re-Sweep Against Origin/Main

Live operational tests against origin/main once the four enabling repairs (LEDGER + COMMIT + PROMOTE + MUTATOR) land. Sequenced per D-13 cost discipline: cheap smoke tests first, paid full-loop UAT last.

- [ ] **SWEEP-01**: UAT-47-e (~3 min, $0) — diff-guard rejection re-test on auto-fix:partial-verified label flow; PR closed + branch deleted after evidence capture
- [ ] **SWEEP-02**: UAT-47-d (~5 min) — ledger snapshot post-refactor commits to `ledger-snapshots/daily-*` branch; daily cron's first run after merge produces a ledger-snapshot PR (not a direct main push)
- [ ] **SWEEP-03**: UAT-47-a (~$0.50–$2, ~10 min) — full end-to-end auto-fix loop on either a real triage-labeled issue OR the fixture-mutator synthetic; produces merged PR with verifier-gate evidence + ledger entry carrying `errorClass` + `outcome: 'pass'` — **primary DoD evidence**
- [ ] **SWEEP-04**: UAT-47-b — fixture-mutator drives synthetic defect through full loop; deps-update-gate smoke test confirms `v40-deps-update.yml`'s `pull_request:` trigger fires (Phase 51.1 fix confirm)
- [ ] **SWEEP-05**: `56-UAT-EVIDENCE.md` produced with PASS/FAIL evidence per UAT (JSON snapshots from `gh api` + `gh run`); all UAT ledger entries carry `phase: '56-uat'` for filterable production analysis (Pitfall 10)
- [ ] **SWEEP-06**: Post-UAT cleanup completed — test branches deleted, test PRs closed, synthetic issues closed, synthetic quarantine entries reverted (Pitfall 11)

### Carry-Along Cleanup

Self-contained, low-risk items deferred from prior phases. Bundled to prevent further deferral.

- [ ] **CLEAN-01**: Dead `MODEL` const removed from `scripts/auto-fix.mjs` (Phase 54 carry-along; 2-line deletion; `built.model` from `buildFixPrompt` is the live consumer)
- [ ] **CLEAN-02**: `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` V2 update completed — Phase 51.1's unfinished test rewrite; `npm test` shows zero pre-existing failures in this file after the commit

## Future Requirements

Acknowledged but deferred beyond v4.2.

### Observability

- **OBS-FUT-01**: `fix_abandoned` outcome state (e.g., draft PR closed without merge) — monitoring enhancement; not needed for DoD
- **OBS-FUT-02**: A/B winner routing-table update — only after abstention ends with sufficient data (≥20 entries per ERROR_CLASS per model arm)
- **OBS-FUT-03**: Fork-based UAT environment (operator deferred per Phase 51 D-01)

### Pipeline Coverage

- **PIPE-FUT-01**: Extending ERROR_CLASS coverage beyond the 5 existing scaffolds (WRONG_CITATION, LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR)
- **PIPE-FUT-02**: Cross-repo auto-fix (currently single-repo) — would require credential model rethink

## Out of Scope

Explicitly excluded. Anti-features carried forward from v4.0/v4.1 with the warning that violating them collapses load-bearing trust invariants.

| Feature | Reason |
|---------|--------|
| Auto-merging auto-fix PRs | Phase 53 D-18 — human-gated merge is the trust boundary for citation-accuracy code (legal-filing core value) |
| Direct-to-main auto-promote | `v40-auto-promote.yml` MUST open a SEPARATE follow-up PR; reconstructs human-gate invariant |
| Widening `assertTripleGate` | Phase 53 byte-unchanged invariant; `assertPartialGate` is a sibling entry point, NOT a body modification |
| Re-adding bypass_actors to ruleset 17086676 | Phase 50 D-08; `current_user_can_bypass=never`; break-glass §7 runbook is the only path |
| Refactoring `v40-auto-fix.yml`'s ledger commit to branch redirect | LOAD-BEARING (Pitfall 1) — the direct-to-main commit specifically keeps ledger entries OUT of the auto-fix PR diff (FORBIDDEN_PATHS regex 5); branch redirect causes permanent diff-guard rejection |
| Adding the leak guard to `appendLedgerEntry` body | LOAD-BEARING (Pitfall 7) — breaks all 33 existing Vitest ledger tests that use tmp paths without CI=true |
| `MODEL_ROUTES` table changes during v4.2 | Frozen for A/B experiment duration; Phase 54 winner-determination cannot happen until abstention ends |
| New npm dependencies | Zero-new-deps target — fourth consecutive milestone if held; supply-chain hardening is the load-bearing constraint |
| Fixture-mutator touching working-tree fixtures | Mutating `tests/fixtures/*` or `tests/golden/baseline.json` means no auto-fix LLM can propose a fix that passes diff-guard (FORBIDDEN_PATHS); mutator works at the issue-creation layer only |
| Operator manual intervention during UAT-47-a | The DoD evidence value is in OBSERVING the loop work UNATTENDED; only legitimate human action is merging the `auto-fix:verified` PR |

## Traceability

Populated by the v4.2 roadmapper (2026-06-04).

| Requirement | Phase | Status |
|-------------|-------|--------|
| LEDGER-01 | 56 | Complete |
| LEDGER-02 | 56 | Complete |
| LEDGER-03 | 56 | Complete |
| LEDGER-04 | 56 | Complete |
| COMMIT-01 | 57 | Complete |
| COMMIT-02 | 57 | Complete |
| COMMIT-03 | 57 | Complete |
| COMMIT-04 | 57 | Complete |
| PROMOTE-01 | 58 | Pending |
| PROMOTE-02 | 58 | Pending |
| PROMOTE-03 | 58 | Pending |
| PROMOTE-04 | 58 | Pending |
| MUTATOR-01 | 59 | Pending |
| MUTATOR-02 | 59 | Pending |
| MUTATOR-03 | 59 | Pending |
| MUTATOR-04 | 59 | Pending |
| MUTATOR-05 | 59 | Pending |
| SWEEP-01 | 59 | Pending |
| SWEEP-02 | 59 | Pending |
| SWEEP-03 | 59 | Pending |
| SWEEP-04 | 59 | Pending |
| SWEEP-05 | 59 | Pending |
| SWEEP-06 | 59 | Pending |
| CLEAN-01 | 60 | Pending |
| CLEAN-02 | 60 | Pending |

**Coverage:**
- v4.2 requirements: 25 total
- Mapped to phases: 25 (Phase 56: 4, Phase 57: 4, Phase 58: 4, Phase 59: 11, Phase 60: 2)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-04*
*Traceability populated: 2026-06-04*

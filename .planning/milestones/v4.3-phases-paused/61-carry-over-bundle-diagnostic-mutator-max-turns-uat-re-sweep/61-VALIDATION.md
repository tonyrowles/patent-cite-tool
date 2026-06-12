---
phase: 61
slug: carry-over-bundle-diagnostic-mutator-max-turns-uat-re-sweep
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^3.0.0 (Node 22 ESM) |
| **Config file** | `vitest.config.js` (fileParallelism: false; setupFiles: ./tests/setup/chrome-stub.js) |
| **Quick run command** | `npx vitest run tests/unit/llm-driver.test.js tests/e2e/scripts/e2e-inject-defect.test.js` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10s quick / ~40s full |

---

## Sampling Rate

- **After every task commit:** Run quick command above
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 40s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-01-01 | 01 | 1 | DIAG-01 | — | mutator emits GOOGLE_DOM_DRIFT body containing verbatim selector from selection.js/navigation.js | unit | `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js -t "GOOGLE_DOM_DRIFT verbatim selector"` | ✅ | ⬜ pending |
| 61-01-02 | 01 | 1 | DIAG-02 | — | mutator emits WRONG_CITATION body containing verbatim Verifier Disagreement headers | unit | `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js -t "WRONG_CITATION template parity"` | ✅ | ⬜ pending |
| 61-01-03 | 01 | 1 | DIAG-03 | — | byte-identical output for same seed+errorClass; SOURCE_TAG literal preserved | unit | `npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js -t "determinism"` | ✅ | ⬜ pending |
| 61-02-01 | 02 | 1 | TURNS-01 | — | argv contains `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` | unit | `npx vitest run tests/unit/llm-driver.test.js -t "Test 23"` | ✅ | ⬜ pending |
| 61-02-02 | 02 | 1 | TURNS-02 | — | argv array excludes Edit/Bash/Write/WebFetch/--allowed-tools/--allowedTools literally | unit | `npx vitest run tests/unit/llm-driver.test.js -t "tool palette exclusion"` | ✅ | ⬜ pending |
| 61-02-03 | 02 | 1 | TURNS-03 | — | fixture ledger mean per-call < $0.30 | unit | `npx vitest run tests/unit/llm-driver-cost-bound.test.js` | ❌ W0 | ⬜ pending |
| 61-03-01 | 03 | 1 | BUDG-01 | — | STATE.md ## Budget table present with $15/$30/$5/$0.30 values | grep | `grep -c "Milestone soft cap.*\$15" .planning/STATE.md` (=1) | ✅ | ⬜ pending |
| 61-04-01 | 04 | 2 | UAT-01 | — | SWEEP-03 live PASS evidence captured | manual+gh | see Manual-Only below | ❌ W0 | ⬜ pending |
| 61-04-02 | 04 | 2 | UAT-02 | — | SWEEP-04 live PASS evidence captured | manual+gh | see Manual-Only below | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/llm-driver-cost-bound.test.js` — new file; TURNS-03 fixture ledger + mean-per-call assertion
- [ ] `tests/fixtures/ledger-cost-bound.jsonl` — new 5-entry fixture with usd field set such that mean ∈ [$0.20, $0.29]
- [ ] `.planning/sweep-03-04-pass-evidence.yaml` — new sentinel emitted at end of UAT-01/02 capture (consumed by Phase 68 precondition)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SWEEP-03 (UAT-47-a) live PASS | UAT-01 | Requires gh CLI auth + live auto-fix loop hit on origin/main; cannot be safely automated as part of phase plan execution | 1. After atomic commit lands on origin/main: `node tests/e2e/scripts/inject-defect.mjs --errorClass GOOGLE_DOM_DRIFT --seed 47a-live`. 2. Watch issue via `gh issue list --label auto-fix:candidate`. 3. After v40-auto-fix.yml runs + verifier-gate PASSES + PR merges + promote runs: verify outcome ledger entry with `gh api repos/$OWNER/$REPO/contents/ledger-snapshots/daily-$(date -u +%F)` shows `errorClass: 'GOOGLE_DOM_DRIFT' + outcome: 'pass' + source: 'auto-fix-promoted' + transport: 'sdk'\|'subscription'`. 4. Append `uat_01: PASS` row to `.planning/sweep-03-04-pass-evidence.yaml`. |
| SWEEP-04 (UAT-47-b) live PASS | UAT-02 | Same as above + requires fixture-mutator full-loop observation | 1. Repeat above with `--errorClass WRONG_CITATION --seed 47b-live`. 2. After full loop: `git log -p quarantine-spec.json` shows the synthetic entry filtered (MUTATOR-04 `&& !isFixtureMutator` filter at `quarantine-append.mjs:239` did its job). 3. Append `uat_02: PASS` row to evidence sentinel. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (cost-bound fixture, sentinel file)
- [ ] No watch-mode flags (Vitest fileParallelism: false enforced via vitest.config.js)
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter (after PLAN.md gates verified)

**Approval:** pending

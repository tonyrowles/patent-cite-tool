---
phase: 57
slug: ledger-commit-branch-redirect
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 (resolved from `^3.0.0`) |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~150ms quick / ~90s full |

---

## Sampling Rate

- **After every task commit:** `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`
- **After every plan wave:** `CI=true npx vitest run tests/e2e/scripts/`
- **Before `/gsd:verify-work`:** `npm test` green modulo documented pre-existing failures in `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (Phase 51.1 unfinished test update; Phase 60 CLEAN-02 will fix).
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | COMMIT-01 | T-57-01 (`[skip ci]` bypass; CWE-94 input-validation) | Push targets `ledger-snapshots/daily-${SNAPSHOT_DATE}` only; SNAPSHOT_DATE is deterministic ISO from `currentIsoDay()` (no user input) | source assertion | `grep -E 'git push origin HEAD:ledger-snapshots/daily-' .github/workflows/v40-cost-ledger-snapshot.yml` returns 1 line | ✅ | ⬜ pending |
| 57-01-02 | 01 | 1 | COMMIT-02 | T-57-02 (FORBIDDEN_PATHS rejection of ledger-snapshot PRs) | Scope decision step added to diff-guard job using verbatim `if [[ "${{ github.head_ref }}" == auto-fix/* ]]` condition | source assertion | `grep -c 'Scope decision (auto-fix/\* PRs only' .github/workflows/v40-verifier-gate.yml` ≥ 4 (was 3; new diff-guard step makes 4) | ✅ | ⬜ pending |
| 57-01-03 | 01 | 1 | COMMIT-04 | T-57-03 (LOAD-BEARING Pitfall 1) | `v40-auto-fix.yml` ledger-commit step byte-unchanged | source assertion | `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` = 1 AND `git diff <Phase-57-baseline> -- .github/workflows/v40-auto-fix.yml` empty | ✅ | ⬜ pending |
| 57-02-01 | 02 | 1 | COMMIT-03 | T-57-04 (broken S13 contract) | S8 body rewrite (positive assertion on `ledger-snapshots/`); S13 ceiling raised from `<=4` to `<=6` diff lines | unit (Vitest) | `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js -t 'S8'` AND `-t 'S13'` exits 0 | ✅ | ⬜ pending |
| 57-02-02 | 02 | 1 | COMMIT-02, COMMIT-04 | T-57-02 + T-57-03 | New `Phase 57 invariants` describe block in the S13 test file pins diff-guard scope-decision presence + `v40-auto-fix.yml` push-count = 1 | unit (Vitest) | `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js -t 'Phase 57'` exits 0 | ❌ W0 (new test block) | ⬜ pending |
| 57-VG-01 | verify | gate | All 4 COMMIT-* | T-57-01..04 | Full file (no -t filter) all green; `v40-verifier-gate.yml` and `v40-auto-fix.yml` baselines confirmed | regression | `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` exits 0 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **Pre-flight baseline snapshot** — capture `git rev-parse HEAD` BEFORE Wave 1 begins; this is the Phase 57 baseline against which `v40-auto-fix.yml` byte-unchanged is verified (gate 57-01-03).
- [ ] **Confirm `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` baseline** — `CI=true npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` exits 0 (18 tests pass at ~127ms per research §Test Framework). Establishes the regression baseline for the S8 + S13 rewrites.

*Both confirmations done once; unblocks Wave 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First post-merge cron run produces a commit on `ledger-snapshots/daily-*` branch (not on `main`) | COMMIT-01 (ROADMAP success criterion 1) | Requires merging Phase 57 to origin/main AND waiting for the next scheduled cron tick OR triggering via `gh workflow run`. Cannot run from PR-only state. | After merge: `gh workflow run v40-cost-ledger-snapshot.yml`; wait for completion; `git fetch --all && git ls-remote --heads origin 'ledger-snapshots/*'` shows ≥1 branch. Capture evidence as 57-UAT-EVIDENCE.md. |
| A ledger-snapshot PR head-ref gets SUCCESS verdict from all 4 verifier-gate jobs (diff-guard included) | COMMIT-02 (ROADMAP success criterion 2) | Requires opening a PR from `ledger-snapshots/daily-*` to `main`. Phase 59 UAT-47-d covers this as the primary DoD evidence. | Phase 59 UAT-47-d runbook; this phase only locks the YAML invariants needed for that UAT to pass. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (pre-flight baseline + S13 file baseline)
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

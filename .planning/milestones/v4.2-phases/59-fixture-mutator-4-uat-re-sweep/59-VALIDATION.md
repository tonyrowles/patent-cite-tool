---
phase: 59
slug: fixture-mutator-4-uat-re-sweep
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
---

# Phase 59 — Validation Strategy

> Per-phase validation contract. Phase 59 is two work streams with different validation surfaces.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Work stream A — mutator code)** | Vitest 3.2.4 |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `CI=true npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js tests/e2e/scripts/e2e-quarantine-append.test.js` |
| **Full suite command** | `npm test` |
| **Validation surface (Work stream B — live UATs)** | `gh api` + `gh run` evidence capture; not Vitest |
| **Evidence file** | `.planning/phases/59-fixture-mutator-4-uat-re-sweep/56-UAT-EVIDENCE.md` (file name per REQUIREMENTS.md SWEEP-05 convention) |

---

## Sampling Rate

- **After every Work stream A task commit:** Quick run command
- **After every Work stream B UAT:** Append PASS/FAIL + JSON snapshots to evidence file
- **Before `/gsd:verify-work`:** `npm test` green for Work stream A; evidence file populated for Work stream B
- **Max feedback latency:** Work stream A < 90s; Work stream B varies by UAT (~3 min to ~10 min)

---

## Per-Task Verification Map

### Work stream A — Fixture-Mutator (deterministic; can execute now)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-W0-01 | 00 | 0 | (baseline) | — | Capture PHASE_59_BASELINE; verify e2e-report-issue.mjs fingerprint export is at lines 78-81 (RESEARCH locked); confirm quarantine-append.mjs label point at line 218-223 | inspection | `git rev-parse HEAD` + grep verification | ✅ | ⬜ pending |
| 59-A-01 | 01 | 1 | MUTATOR-01 | T-59-01 (fingerprint mismatch) | inject-defect.mjs imports `fingerprint` from `scripts/e2e-report-issue.mjs` (byte-identical reuse) | source assertion + unit | `grep -E "import.*fingerprint.*from.*e2e-report-issue" tests/e2e/scripts/inject-defect.mjs` returns ≥1 line + Vitest mock-gh test passes | ❌ W0 (new file) | ⬜ pending |
| 59-A-02 | 01 | 1 | MUTATOR-02 | T-59-02 (fingerprint collision; Pitfall 6) | Pre-flight `gh issue list` collision check; hard abort on existing match | unit (Vitest with mocked gh) | `CI=true npx vitest run tests/e2e/scripts/e2e-inject-defect.test.js -t 'collision'` exits 0 | ❌ W0 (new file) | ⬜ pending |
| 59-A-03 | 01 | 1 | MUTATOR-03 | T-59-03 (FORBIDDEN_PATHS mutation; Pitfall 5) | `git status --porcelain` empty post-execution (except 56-MUTATOR-CLEANUP.md allow-pattern) | shell + Vitest | Vitest test runs script, then asserts `git status --porcelain` matches the cleanup-file-only allow pattern | ❌ W0 (new file) | ⬜ pending |
| 59-A-04 | 01 | 1 | MUTATOR-04 | T-59-04 (auto-promotion of synthetic; Pitfall 8) | `scripts/quarantine-append.mjs` conditional at lines 218-223 short-circuits label application when `entry.source_triage_finding_id` starts with `'fixture-mutator-uat-47b'` (per RESEARCH zero-schema-change recommendation); co-designed with inject-defect.mjs in SAME commit | unit (Vitest) | New Vitest test pins both: (a) inject-defect.mjs emits the `run_id: 'fixture-mutator-uat-47b'` in synthetic triage report; (b) quarantine-append.mjs short-circuits at the conditional | ❌ W0 (new test block) | ⬜ pending |
| 59-A-05 | 01 | 1 | MUTATOR-05 | T-59-05 (orphaned synthetic state) | `56-MUTATOR-CLEANUP.md` produced with explicit gh commands to close + delete + revert | source assertion + integration | `test -f .planning/phases/59-fixture-mutator-4-uat-re-sweep/56-MUTATOR-CLEANUP.md` AND grep for required commands | ❌ W0 (new artifact) | ⬜ pending |
| 59-A-VG | verify | gate | All 5 MUTATOR-* | T-59-01..05 | All Work stream A tests green; no FORBIDDEN_PATHS mutation by either inject-defect.mjs or quarantine-append.mjs change | regression | `CI=true npx vitest run tests/e2e/scripts/` exits 0 + `git diff <baseline> -- tests/fixtures tests/golden tests/test-cases.js .github/CODEOWNERS` empty | ✅ | ⬜ pending |

### Work stream B — Live UATs (blocked until PR #18 merges to origin/main)

| Task ID | Plan | Wave | Requirement | Status | Type | Verification |
|---------|------|------|-------------|--------|------|--------------|
| 59-B-PRE | 02 | 0 | (prereq) | ⛔ BLOCKED | external | PR #18 merged to origin/main AND repo setting "Allow GitHub Actions to create and approve pull requests" ENABLED (RESEARCH §Pitfall 4 finding) |
| 59-B-01 | 02 | 1 | SWEEP-01 (UAT-47-e) | runbook ready | manual+gh | `gh pr create` test PR touching FORBIDDEN_PATHS file; observe diff-guard rejection; `gh pr close --delete-branch`; capture as 56-UAT-EVIDENCE.md row |
| 59-B-02 | 02 | 1 | SWEEP-02 (UAT-47-d) | runbook ready | manual+gh | `gh workflow run v40-cost-ledger-snapshot.yml`; wait; `git fetch && git ls-remote --heads origin 'ledger-snapshots/*'`; capture branch name |
| 59-B-03 | 02 | 2 | SWEEP-03 (UAT-47-a) | runbook ready | manual+gh + ~$0.50-2 | Use mutator from Work stream A to inject synthetic triage-labeled issue; observe full loop; await `auto-fix:verified` PR; merge; observe outcome ledger entry on subsequent commit; capture |
| 59-B-04 | 02 | 2 | SWEEP-04 (UAT-47-b) | runbook ready | manual+gh | Same as SWEEP-03 but with different seed; capture |
| 59-B-05 | 02 | 3 | SWEEP-05 | runbook ready | composition | `56-UAT-EVIDENCE.md` consolidates all 4 UAT rows + JSON snapshots from `gh api` + `gh run view` |
| 59-B-06 | 02 | 3 | SWEEP-06 | runbook ready | gh CLI | `tests/e2e/scripts/uat-cleanup.mjs` closes test PRs, deletes branches, reverts synthetic quarantine entries |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⛔ blocked-by-external-dependency*

---

## Wave 0 Requirements

**Work stream A:**
- [ ] `PHASE_59_BASELINE = git rev-parse HEAD` captured before Work stream A begins
- [ ] Verify `tests/e2e/lib/issue-payload-builder.js` fingerprint export at expected location (RESEARCH §1)
- [ ] Verify `scripts/quarantine-append.mjs` line 218-223 conditional location (RESEARCH §4)
- [ ] Verify FORBIDDEN_PATHS bank at `scripts/check-diff-guard.mjs:49-58` (RESEARCH §5)

**Work stream B prerequisites (must hold before any UAT executes):**
- [ ] PR #18 merged to origin/main (CODEOWNERS approval friction documented in `docs/v40-repo-config.md` §3 — break-glass §7 procedure may be required)
- [ ] Repo setting "Allow GitHub Actions to create and approve pull requests" ENABLED (RESEARCH §Pitfall 4)
- [ ] `gh auth status` shows logged-in operator (UATs invoke gh CLI)

---

## Manual-Only Verifications

Work stream B is entirely manual-with-runbook. Each SWEEP-* runbook lives in `.planning/phases/59-fixture-mutator-4-uat-re-sweep/59-02-PLAN.md` Task body. Evidence is captured as JSON snapshots into `56-UAT-EVIDENCE.md` per UAT.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Each of UAT-47-e / UAT-47-d / UAT-47-a / UAT-47-b PASS evidence captured | SWEEP-01..04 | Live CI runs; cannot mock; cost-discipline gate at SWEEP-01 → SWEEP-02 → SWEEP-03 (paid) → SWEEP-04 | Runbook tasks in 59-02-PLAN.md |
| Post-UAT cleanup confirmed | SWEEP-06 | Verifying remote state requires gh CLI against live repo | `tests/e2e/scripts/uat-cleanup.mjs` |

---

## Validation Sign-Off

- [ ] All Work stream A tasks have automated verify
- [ ] Sampling continuity in Work stream A: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s for Work stream A
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] Work stream B runbook is operator-dispatchable (no autonomous execution required)

**Approval:** pending

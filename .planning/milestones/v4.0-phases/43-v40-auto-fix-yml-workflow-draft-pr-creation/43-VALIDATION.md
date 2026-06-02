---
phase: 43
slug: v40-auto-fix-yml-workflow-draft-pr-creation
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 43 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 43-CONTEXT.md + 43-01-SUMMARY.md + 43-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + YAML grep) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.2s for the 2 phase-43 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the script/workflow just modified.
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `v40-auto-fix-yaml.test.js` green (catches workflow drift on triage-label trigger, ANTHROPIC_API_KEY fail-fast, two-commit split, draft-PR mode, affected_cases comment).
- **Max feedback latency:** ~45s for full suite; ~0.2s for the 2 phase-43 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 43-01-01..N | 01 (v40-auto-fix.yml workflow + build-auto-fix-pr-body.mjs PR-body builder + ledger self-commit + draft PR + affected_cases comment) | 1 | AUTOFIX-02 | unit + YAML grep | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js tests/e2e/scripts/v40-auto-fix-yaml.test.js` | ✅ green (7/7 + 22/22) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/build-auto-fix-pr-body.test.js` — 7 cases (B1-B6 + 1) covering PR body builder pure-function + CLI shim
- [x] `tests/e2e/scripts/v40-auto-fix-yaml.test.js` — 22 cases (A1-A12 + L1-L2 + X1-X8) pinning the workflow YAML primitives: triage-label trigger, ANTHROPIC_API_KEY fail-fast, two-commit split (impl-commit then ledger-commit), peter-evans@v8 draft PR, affected_cases HTML comment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live end-to-end auto-fix flow against a real triage-labeled issue (issue → workflow trigger → SDK call → draft PR opened with affected_cases comment) — **UAT-47-a (inherits UAT-43-a)** | AUTOFIX-02 (live workflow run) | Workflow does not exist on origin yet (per CONTEXT.md "DEFERRED requires-push" lock). Phase 43 owns the workflow YAML + tests; live execution OWNED BY Plan 47-03 runbook UAT-47-a (which inherits Phase 42's deferred demo on issue #3 `US11427642-spec-short-1`, fingerprint `139f821b3bb1`, branch `auto-fix/3-139f821b`). COVERED-MANUAL per Pitfall 6. | Post-push by operator: label a triage-eligible issue, observe (a) workflow trigger, (b) ANTHROPIC_API_KEY presence check, (c) draft PR opened on `auto-fix/<n>-<fp8>` branch, (d) two commits (impl + ledger self-commit), (e) `<!-- affected_cases: ... -->` HTML comment present in PR body. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 29/29 tests green across 2 phase-43 test files; live UAT-47-a (inheriting UAT-43-a) pre-classified COVERED-MANUAL (owned by Plan 47-03 runbook).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 43-01 (AUTOFIX-02 PR body builder) | `tests/unit/build-auto-fix-pr-body.test.js` | 7/7 | ✅ green |
| 43-01 (AUTOFIX-02 workflow YAML contract) | `tests/e2e/scripts/v40-auto-fix-yaml.test.js` | 22/22 | ✅ green |

**Total:** 29/29 tests pass across 2 files. Combined runtime: 0.22s.

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live end-to-end auto-fix demo (UAT-47-a — inheriting UAT-43-a) | COVERED-MANUAL | Workflow only fires on origin; Phase 42 ROADMAP explicitly notes "demo deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a)"; OWNED BY Plan 47-03 UAT-47-a runbook. Pitfall 6 applied. |

### Compliance Check

- [x] AUTOFIX-02 (the sole Phase 43 requirement) maps to green automated rows
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 43-VERIFICATION.md
- [x] Both referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 2 files exits 0; 29/29 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 43 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

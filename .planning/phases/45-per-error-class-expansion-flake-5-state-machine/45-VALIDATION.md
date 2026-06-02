---
phase: 45
slug: per-error-class-expansion-flake-5-state-machine
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 45 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 45-CONTEXT.md + per-plan SUMMARY artifacts + 45-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/triage-classifier.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~1.7s for the 4 phase-45 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified (fix-prompt-builder / triage-classifier / auto-fix / quarantine-append).
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `triage-classifier.test.js` green (the 5-state FLAKE machine + N=3-in-14-days FLAKE_ESCALATION invariant lives here).
- **Max feedback latency:** ~45s for full suite; ~1.7s for the 4 phase-45 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 45-01-01..N | 01 (fix-prompt-builder per-ERROR_CLASS branches + 4 historical-replay fixtures) | 1 | PROMPT-03 | unit (fixture-replay) | `npx vitest run tests/unit/fix-prompt-builder.test.js` | ✅ green (36/36) |
| 45-02-01..N | 02 (triage-classifier 5-state FLAKE machine + ring-buffer + suppression seed files) | 1 | FLAKE-01, FLAKE-02 | unit (state-machine fixture cases) | `npx vitest run tests/unit/triage-classifier.test.js` | ✅ green (81/81) |
| 45-03-01..N | 03 (auto-fix.mjs dispatchFlakeState + quarantine-append --escalate-stable-runs-reset) | 2 | FLAKE-02, FLAKE-03 | unit (mock + integration) | `npx vitest run tests/unit/auto-fix.test.js tests/unit/quarantine-append.test.js` | ✅ green (41/41 + 24/24) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/fix-prompt-builder.test.js` — covers PROMPT-03 per-ERROR_CLASS branches (LLM_HALLUCINATED_SELECTION / WORKER_FALLBACK_FAILED / GOOGLE_DOM_DRIFT / HARNESS_ERROR) via 4 historical-replay fixtures in `tests/unit/fixtures/`
- [x] `tests/unit/triage-classifier.test.js` — covers FLAKE-01 (5-state classifier) and FLAKE-02 (N=3-in-14-days FLAKE_ESCALATION)
- [x] `tests/unit/auto-fix.test.js` — covers FLAKE-02 dispatchFlakeState (auto-fix.mjs:252) + per-class auto-fix routing
- [x] `tests/unit/quarantine-append.test.js` — covers FLAKE-03 --escalate-stable-runs-reset CLI flag
- [x] Seed fixtures: `tests/e2e/.rerun-ring-buffer.json` + `tests/e2e/.flake-suppression.json` committed (read by classifier tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live FLAKE escalation suppressing re-files (N=3 FLAKE re-files of the same fingerprint within 14 days → 5-state classifier escalates to FLAKE_ESCALATION → quarantine-append --escalate-stable-runs-reset suppresses next re-file) — **UAT-47-c (RUN-NOW LOCAL, owned by Plan 47-03)** | FLAKE-02 (live classifier + quarantine-append against synthetic fixture) | Locally executable via `node scripts/quarantine-append.mjs --escalate-stable-runs-reset` against a synthetic 3-FLAKE-same-fingerprint fixture per FLAKE-02 spec. **OWNED BY Plan 47-03** UAT-47-c — Phase 45's local UAT row is COVERED-MANUAL here; Plan 47-03 is the live-execution slot. Pitfall 6 applied — do not generate a separate test in Phase 45's audit. | Plan 47-03 executes via the runbook in 47-03 PLAN (Strategy A: quarantine-append against seeded fixture; Strategy B: small test-driver invoking `dispatchFlakeState` directly per RESEARCH Open Q 1). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 182/182 tests green across 4 phase-45 test files; live UAT-47-c FLAKE escalation pre-classified COVERED-MANUAL (RUN-NOW LOCAL execution owned by Plan 47-03).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 45-01 (PROMPT-03 fix-prompt-builder) | `tests/unit/fix-prompt-builder.test.js` | 36/36 | ✅ green |
| 45-02 (FLAKE-01/-02 triage-classifier 5-state) | `tests/unit/triage-classifier.test.js` | 81/81 | ✅ green |
| 45-03 (FLAKE-02 dispatchFlakeState) | `tests/unit/auto-fix.test.js` | 41/41 | ✅ green |
| 45-03 (FLAKE-03 quarantine-append --escalate-stable-runs-reset) | `tests/unit/quarantine-append.test.js` | 24/24 | ✅ green |

**Total:** 182/182 tests pass across 4 files. Combined runtime: 1.73s. (Aggregate file count includes pre-existing tests in shared files plus the Phase 45 additions; all green.)

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live FLAKE escalation execution (UAT-47-c) | COVERED-MANUAL | Although locally runnable now, the EXECUTION is OWNED BY Plan 47-03 (not Phase 45's audit). Phase 45 ships the implementation + state-machine tests; the live-shot is in Plan 47-03's UAT-47-c runbook. Pitfall 6 applied — do not generate a duplicate test in Phase 45. |

### Compliance Check

- [x] Every requirement (PROMPT-03, FLAKE-01, FLAKE-02, FLAKE-03) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 45-VERIFICATION.md
- [x] All 4 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 4 files exits 0; 182/182 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 45 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

---
phase: 41
slug: verifier-gate-workflow-verify-single-case-mjs-cli-shim
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 41 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: per-plan SUMMARY artifacts + 41-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + YAML grep + integration against real TEST_CASES) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/check-diff-guard.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~3s for the 5 phase-41 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the helper/shim just modified.
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND `v40-verifier-gate-yaml.test.js` green (catches workflow drift on 4-job dependency graph + 3-file pin set + diff-guard size caps).
- **Max feedback latency:** ~45s for full suite; ~3s for the 5 phase-41 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 41-01-01..N | 01 (check-diff-guard.mjs + parse-affected-cases.mjs helpers) | 1 | VFY-GATE-01, VFY-GATE-04 | unit | `npx vitest run tests/unit/check-diff-guard.test.js tests/unit/parse-affected-cases.test.js` | ✅ green (13/13 + 10/10) |
| 41-02-01..N | 02 (verify-single-case.mjs CLI shim around verifyCitation) | 1 | VFY-GATE-01 | unit + integration (real TEST_CASES) | `npx vitest run tests/unit/verify-single-case.test.js` | ✅ green (21/21) |
| 41-03-01..N | 03 (v40-verifier-gate.yml — 4-job workflow with diff-guard / verifier-gate / regression-suite / ready-flip) | 2 | VFY-GATE-01, VFY-GATE-02, VFY-GATE-03, VFY-GATE-04 | YAML grep | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | ✅ green (23/23) |
| 41-04-01..N | 04 (docs/v40-verifier-gate-manual-test.md + bit-rot test) | 2 | VFY-GATE-01 (smoke-doc) | unit (doc structure assertions) | `npx vitest run tests/unit/v40-verifier-gate-doc.test.js` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/check-diff-guard.test.js` — 13 cases covering all 6 LOCKED forbidden paths + legitimate src/ + size-cap parse
- [x] `tests/unit/parse-affected-cases.test.js` — 10 cases covering single-line / multi-line / whitespace-heavy / empty input variants
- [x] `tests/unit/verify-single-case.test.js` — 21 cases covering argv error paths + integration against real TEST_CASES + JSON report shape
- [x] `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` — 23 grep contract cases pinning the 4-job graph + 3-file pin set + size caps
- [x] `tests/unit/v40-verifier-gate-doc.test.js` — bit-rot test asserting all 5 required H2 sections present + cleanup section

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live verifier-gate end-to-end smoke on an auto-fix/test PR — diff-guard accepts benign diff → verifier-gate + regression-suite run in parallel → ready-flip flips draft → ready_for_review — **UAT-47-e** | VFY-GATE-01..04 (live workflow run) | Workflow does not exist on origin yet (per CONTEXT.md "DEFERRED requires-push" lock). Manual smoke procedure documented in `docs/v40-verifier-gate-manual-test.md` (shipped by 41-04); execution OWNED BY Plan 47-03 runbook UAT-47-e. COVERED-MANUAL per Pitfall 6. | Post-push by operator: follow `docs/v40-verifier-gate-manual-test.md` — create `auto-fix/test-<slug>` branch, push benign diff with `<!-- affected_cases: <id> -->` PR body, observe workflow sequence + ready_for_review flip + cleanup. |
| Live diff-guard reject on a crafted bypass attempt (e.g., editing tests/test-cases.js to shrink TEST_CASES array, or oversized diff) — **UAT-47-e (negative case)** | VFY-GATE-04 (live reject behaviour) | Same as above — requires pushed workflow + crafted bypass PR. COVERED-MANUAL per Pitfall 6; runbook stub lives in Plan 47-03's UAT-47-e. | Post-push by operator: push a PR that touches one of the 6 LOCKED forbidden paths OR a >200 LOC src/ diff; observe diff-guard job exit non-zero, PR labeled `human-review-required`, explanatory comment posted. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 67/67 tests green across 5 phase-41 test files; live UAT-47-e (positive + negative) pre-classified COVERED-MANUAL (owned by Plan 47-03 runbook).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 41-01 (VFY-GATE-04 diff-guard helper) | `tests/unit/check-diff-guard.test.js` | 13/13 | ✅ green |
| 41-01 (VFY-GATE-01 parse-affected-cases helper) | `tests/unit/parse-affected-cases.test.js` | 10/10 | ✅ green |
| 41-02 (VFY-GATE-01 verify-single-case CLI shim) | `tests/unit/verify-single-case.test.js` | 21/21 | ✅ green |
| 41-03 (VFY-GATE-01..04 workflow YAML) | `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | 23/23 | ✅ green |
| 41-04 (VFY-GATE smoke doc structure) | `tests/unit/v40-verifier-gate-doc.test.js` | included in 67/67 | ✅ green |

**Total:** 67/67 tests pass across 5 files. Combined runtime: 2.71s.

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live verifier-gate end-to-end smoke (UAT-47-e positive) | COVERED-MANUAL | Workflow only fires on origin; smoke procedure shipped as `docs/v40-verifier-gate-manual-test.md`; live execution OWNED BY Plan 47-03 UAT-47-e runbook. Pitfall 6 applied. |
| Live diff-guard reject on crafted bypass (UAT-47-e negative) | COVERED-MANUAL | Same — requires pushed workflow + crafted-bypass PR. OWNED BY Plan 47-03 UAT-47-e runbook. Pitfall 6 applied. |

### Compliance Check

- [x] Every requirement (VFY-GATE-01..04) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 41-VERIFICATION.md
- [x] All 5 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 5 files exits 0; 67/67 pass
- [x] Manual rows pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 41 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

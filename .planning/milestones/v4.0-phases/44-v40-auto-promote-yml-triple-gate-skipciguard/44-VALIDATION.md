---
phase: 44
slug: v40-auto-promote-yml-triple-gate-skipciguard
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 44 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 44-CONTEXT.md + 44-01-SUMMARY.md + 44-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + YAML grep) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.4s for the 2 phase-44 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the script/workflow just modified — `auto-fix-promote-gate.test.js` is the load-bearing triple-gate invariant; re-pinned by Plan 47-01 TP-05.
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND both phase-44 tests green (catches drift on triple-gate behaviour OR workflow YAML primitives).
- **Max feedback latency:** ~45s for full suite; ~0.4s for the 2 phase-44 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 44-01-01..N | 01 (auto-fix-promote.mjs orchestrator + triple-gate `_skipCiGuard:true`) | 1 | PROMOTE-01, PROMOTE-02, PROMOTE-04 | unit (behavioural — refuses when any gate missing) | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` | ✅ green (8/8) |
| 44-01-01..N | 01 (v40-auto-promote.yml workflow YAML — peter-evans@v8 + verified-label trigger) | 1 | PROMOTE-01, PROMOTE-03 | YAML grep | `npx vitest run tests/e2e/scripts/v40-auto-promote-yaml.test.js` | ✅ green (22/22) |
| 44-01-01..N | 01 (build-auto-fix-pr-body.mjs verified-promote-body extension) | 1 | PROMOTE-04 | unit (exercised in Phase 43's `build-auto-fix-pr-body.test.js`) | `npx vitest run tests/unit/build-auto-fix-pr-body.test.js` | ✅ green (covered by Phase 43's 7/7) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/auto-fix-promote-gate.test.js` — 8 behavioural cases asserting `runPromote({_skipCiGuard:true})` refuses when ANY of the 3 gates (`auto-fix:verified` label / `pull_request.merged === true` / source-issue `triage` label) is missing
- [x] `tests/e2e/scripts/v40-auto-promote-yaml.test.js` — 22 YAML grep cases pinning the v40-auto-promote.yml workflow primitives (trigger filter, peter-evans@v8 SHA, gate-check step ordering)
- [x] `tests/unit/build-auto-fix-pr-body.test.js` — extension cases for the verified-promote body branch (shared with Phase 43; Phase 43's 7/7 covers the cross-phase function)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live merge → auto-promote flow on origin (auto-fix/* PR labeled `auto-fix:verified` → merged → workflow opens promote-from-quarantine PR with `_skipCiGuard:true`) — embedded in **UAT-47-a** end-to-end | PROMOTE-01..04 (live workflow run) | Workflow does not exist on origin yet (per CONTEXT.md "DEFERRED requires-push" lock). Live merge→promote flow is embedded inside the UAT-47-a end-to-end auto-fix demo (not a separate UAT-47 slot). COVERED-MANUAL per Pitfall 6 — runbook stub lives in Plan 47-03's UAT-47-a. | Post-push by operator (as part of UAT-47-a end-to-end): merge a verified auto-fix/* PR; observe v40-auto-promote.yml triggers, asserts triple-gate (label + merged + triage source), opens promote-from-quarantine PR with `_skipCiGuard:true` enabled. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 30/30 phase-44 tests green; load-bearing triple-gate invariant re-pinned by Plan 47-01 TP-05 also green; live merge→promote flow pre-classified COVERED-MANUAL (embedded in UAT-47-a).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 44-01 (PROMOTE-01/02/04 triple-gate behavioural) | `tests/unit/auto-fix-promote-gate.test.js` | 8/8 | ✅ green |
| 44-01 (PROMOTE-01/03 workflow YAML) | `tests/e2e/scripts/v40-auto-promote-yaml.test.js` | 22/22 | ✅ green |

**Total:** 30/30 tests pass across 2 files. Combined runtime: 0.40s.

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live merge → auto-promote flow (embedded in UAT-47-a end-to-end) | COVERED-MANUAL | Workflow only fires on origin; embedded in UAT-47-a end-to-end auto-fix demo (Phase 42 + Phase 43 + Phase 44 share the live demo). OWNED BY Plan 47-03 UAT-47-a runbook. Pitfall 6 applied. |

### Compliance Check

- [x] Every requirement (PROMOTE-01..04) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 44-VERIFICATION.md
- [x] Both referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 2 files exits 0; 30/30 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 44 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

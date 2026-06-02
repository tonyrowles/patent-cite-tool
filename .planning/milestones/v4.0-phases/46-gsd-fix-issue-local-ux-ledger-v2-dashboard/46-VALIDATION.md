---
phase: 46
slug: gsd-fix-issue-local-ux-ledger-v2-dashboard
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 46 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 46-CONTEXT.md + per-plan SUMMARY artifacts + 46-VERIFICATION.md.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + YAML grep) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/build-ledger-dashboard.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.3s for the 3 phase-46 files / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the script just modified (`auto-fix.test.js` for subscription transport routing changes; `build-ledger-dashboard.test.js` for dashboard generator changes).
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND privacy-audit doc structure unchanged.
- **Max feedback latency:** ~45s for full suite; ~0.3s for the 3 phase-46 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 46-01-01..N | 01 (npm run fix-issue + subscription transport routing + --push/--no-push truth table) | 1 | AUTOFIX-06 (local UX) | unit (driver mock + CLI flag matrix) | `npx vitest run tests/unit/auto-fix.test.js` | ✅ green (41/41) |
| 46-02-01..N | 02 (build-ledger-dashboard.mjs + docs/v40-ledger-dashboard.md + privacy-audit doc + dashboard step in v40-cost-ledger-snapshot.yml) | 1 | AUTOFIX-06 (dashboard) | unit + YAML grep | `npx vitest run tests/unit/build-ledger-dashboard.test.js tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | ✅ green (11/11 + 18/18) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/auto-fix.test.js` — covers AUTOFIX-06 local UX (subscription transport routing, --push truth table, npm run fix-issue scripts entry)
- [x] `tests/unit/build-ledger-dashboard.test.js` — covers the deterministic dashboard generator (byte-stable across two calls with same ledger input)
- [x] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` — covers the dashboard-regen step added to v40-cost-ledger-snapshot.yml in Plan 46-02
- [x] `docs/v40-ledger-privacy-audit.md` — ships the privacy audit (no PII in committed ledger; verified by structure test in `build-ledger-dashboard.test.js`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ledger-snapshot daily commit on origin (02:00 UTC cron commits updated ledger + regenerates dashboard markdown via the workflow step) — **UAT-47-d** | AUTOFIX-06 (live workflow run + dashboard regen) | Workflow only fires on origin (cron + commit + push); not falsifiable from local files. COVERED-MANUAL per Pitfall 6 — runbook stub lives in Plan 47-03's UAT-47-d. | Post-push by operator: wait for 02:00 UTC cron OR `gh workflow run v40-cost-ledger-snapshot.yml`; observe (a) new commit on main from `github-actions[bot]` with `[skip ci]`, (b) updated `tests/e2e/.llm-spend-ledger.json`, (c) regenerated `docs/v40-ledger-dashboard.md` reflecting the new data. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 70/70 tests green across 3 phase-46 test files (`tests/unit/auto-fix.test.js`, `tests/unit/build-ledger-dashboard.test.js`, `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`); live UAT-47-d pre-classified COVERED-MANUAL (owned by Plan 47-03 runbook).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 46-01 (AUTOFIX-06 local UX) | `tests/unit/auto-fix.test.js` | 41/41 | ✅ green |
| 46-02 (AUTOFIX-06 dashboard generator) | `tests/unit/build-ledger-dashboard.test.js` | 11/11 | ✅ green |
| 46-02 (AUTOFIX-06 snapshot workflow dashboard step) | `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | 18/18 | ✅ green |

**Total:** 70/70 tests pass across 3 files. Combined runtime: 0.32s.

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live ledger-snapshot daily commit on origin (UAT-47-d) | COVERED-MANUAL | Workflow only fires on origin per CONTEXT.md "DEFERRED requires-push" lock; OWNED BY Plan 47-03 UAT-47-d runbook. Pitfall 6 applied. |

### Compliance Check

- [x] AUTOFIX-06 (the sole Phase 46 requirement) maps to green automated rows
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 46-VERIFICATION.md
- [x] All 3 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 3 files exits 0; 70/70 pass
- [x] Manual row pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 46 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

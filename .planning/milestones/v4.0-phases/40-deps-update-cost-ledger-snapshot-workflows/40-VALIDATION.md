---
phase: 40
slug: deps-update-cost-ledger-snapshot-workflows
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
audited: 2026-06-01
audit_method: cold-stamp (State B) reconstruct from PLAN + SUMMARY + VERIFICATION inputs
---

# Phase 40 — Validation Strategy

> Cold-stamped by Phase 47 Plan 02 (State B reconstruct). Source: 40-CONTEXT.md + 40-RESEARCH.md + per-plan SUMMARY artifacts.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (unit + YAML grep) |
| **Config file** | `vitest.config.js` (existing) |
| **Quick run command** | `npx vitest run tests/unit/check-deps-and-pr.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~0.5s quick (4 phase-40 files) / ~45s full suite |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the workflow YAML just edited (e.g., `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js`).
- **After every plan wave:** `npm run test:src` + `npm run lint`.
- **Before `/gsd:verify-work`:** Full suite green AND all 4 YAML-grep tests green (catches `[skip ci]` removal, cron drift, peter-evans@v8 pin drift, `verifierDeps.pdfjs-dist` ↔ `pdf-verifier.js` import alignment).
- **Max feedback latency:** ~45s for full suite; ~0.5s for the 4 phase-40 files.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 40-01-01..N | 01 (cost-ledger-snapshot workflow + [skip ci] commit) | 1 | DEPS-01 (snapshot deliverable) | YAML grep (Vitest) | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | ✅ green (18/18) |
| 40-02-01..N | 02 (check-deps-and-pr.mjs CLI + WATCHLIST + NEVER_AUTO_BUMP + security/minor partition) | 1 | DEPS-01, DEPS-03 | unit (spawnSync, frozen-tuple guards) | `npx vitest run tests/unit/check-deps-and-pr.test.js` | ✅ green (28/28) |
| 40-03-01..N | 03 (v40-deps-update.yml workflow + 2× peter-evans@v8 + deps-update-gate job) | 2 | DEPS-01, DEPS-02, DEPS-03 | YAML grep (Vitest) | `npx vitest run tests/e2e/scripts/v40-deps-update-yaml.test.js` | ✅ green (19/19) |
| 40-04-01..N | 04 (verifierDeps.pdfjs-dist exact pin + pdfjs-frame-shift pre-flight workflow + createRequire env override) | 2 | DEPS-04 | YAML grep + unit | `npx vitest run tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js tests/unit/check-deps-and-pr.test.js` | ✅ green (15/15 + 28/28) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` — pins cron, `[skip ci]`, git add path, idempotent guard, no `E2E_LEDGER_PATH_OVERRIDE`
- [x] `tests/unit/check-deps-and-pr.test.js` — covers DEPS-01 (frozen WATCHLIST), DEPS-03 (security/minor partition), 40-03 back-port emit() skipped_count/skipped_packages
- [x] `tests/e2e/scripts/v40-deps-update-yaml.test.js` — covers cron + peter-evans@v8 SHA pin + 2-step partition + deps-update-gate job
- [x] `tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js` — 15 P1-P15 assertions on the pre-flight workflow

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live dep-PR pre-flight gate blocks on regression (`v40-deps-update.yml` dispatched on origin → opens 1 grouped minor PR + N security PRs; `deps-update-gate` job runs nightly suite) — **UAT-47-b** | DEPS-02 (live workflow run) | Requires pushed v4.0 workflows on origin/main; workflow does not exist on GitHub Actions yet (per CONTEXT.md "DEFERRED requires-push" lock). COVERED-MANUAL per Pitfall 6 — runbook stub lives in Plan 47-03's `47-UAT-DEFERRED.md`. | Post-push by operator: `gh workflow run v40-deps-update.yml` and observe (a) grouped minor PR opens as DRAFT, (b) `deps-update-gate` job runs `npm run test:src`, (c) PR body lists skipped_packages including `@anthropic-ai/sdk`. |
| Live cost-ledger-snapshot daily 02:00 UTC commit on origin — **UAT-47-d-sibling** | DEPS-01 (snapshot deliverable, live cron) | Requires pushed workflow; cron only fires on origin. COVERED-MANUAL per Pitfall 6 (overlaps with UAT-47-d ledger snapshot row owned by Plan 47-03 runbook). | Post-push by operator: wait for 02:00 UTC OR `gh workflow run v40-cost-ledger-snapshot.yml`; observe new commit on main from `github-actions[bot]` with `[skip ci]` and current ledger JSON. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01 — cold-stamp State B reconstruct; 80/80 tests green across 4 phase-40 test files; live UAT-47-b + UAT-47-d-sibling pre-classified COVERED-MANUAL (owned by Plan 47-03 runbook).

---

## Validation Audit 2026-06-01

**Auditor:** Phase 47 Plan 02 cold-stamp (State B reconstruct).
**Stance:** FORCE — assume each gap uncovered until a passing behavioral test proves the requirement.

### Per-Task Map — Audit Results

| Task ID | Test File | Test Count | Result |
|---------|-----------|-----------:|--------|
| 40-01 (DEPS-01 cost-ledger-snapshot YAML) | `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | 18/18 | ✅ green |
| 40-02 (DEPS-01/-03 check-deps-and-pr unit) | `tests/unit/check-deps-and-pr.test.js` | 28/28 | ✅ green |
| 40-03 (DEPS-01/-02/-03 v40-deps-update YAML) | `tests/e2e/scripts/v40-deps-update-yaml.test.js` | 19/19 | ✅ green |
| 40-04 (DEPS-04 pdfjs frame-shift YAML) | `tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js` | 15/15 | ✅ green |

**Total:** 80/80 tests pass across 4 files. Combined runtime: 0.51s.

### Manual-Only Rows — Pre-Classified COVERED-MANUAL

| Row | Disposition | Why |
|-----|-------------|-----|
| Live dep-PR pre-flight gate run (UAT-47-b) | COVERED-MANUAL | Workflow does not yet exist on origin per CONTEXT.md "DEFERRED requires-push" lock; runbook stub OWNED BY Plan 47-03. Pitfall 6 applied. |
| Live cost-ledger-snapshot daily cron (UAT-47-d sibling) | COVERED-MANUAL | Same as above — origin-side workflow only; OWNED BY Plan 47-03 runbook (overlaps UAT-47-d ledger snapshot). |

### Compliance Check

- [x] Every requirement (DEPS-01..04) maps to a green automated row
- [x] No gap demands an additional test file — implementation is RED→GREEN closed per 40-VERIFICATION.md
- [x] All 4 referenced test files exist on disk (verified via `test -f` 2026-06-01)
- [x] Vitest run over the 4 files exits 0; 80/80 pass
- [x] Manual rows pre-classified per Pitfall 6 — no escalation needed
- [x] Frontmatter stamped `nyquist_compliant: true`

**Result:** GAPS FILLED. Phase 40 validation map is compliant. No BLOCKER, no WARNING, no ESCALATE.

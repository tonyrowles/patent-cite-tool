---
phase: 33
slug: re-run-validator
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-25
audited: 2026-05-29
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 33-RESEARCH.md §"Validation Architecture" + CONTEXT.md decisions D-01..D-16.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (already installed at root via `vitest run` script) + ESLint 10.x (already installed) |
| **Config file** | `vitest.config.chrome.js` (existing) + `eslint.config.js` (extended in D-16) |
| **Quick run command** | `npx vitest run tests/unit/rerun-validator.test.js` (single file; path corrected 2026-05-29 audit) |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~6-10s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified (e.g., `npx vitest run tests/unit/rerun-validator.test.js` after touching `rerun-validator.js`)
- **After every plan wave:** Run `npm run test:src` (Vitest full src/lib suite) plus `npm run lint` (ESLint independence guard)
- **Before `/gsd:verify-work`:** Full suite must be green AND `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` produces a valid `rerun-report.json` (the smoke run from RERUN-01 success criterion 1)
- **Max feedback latency:** ~30 seconds (test:src + lint)

---

## Per-Task Verification Map

> Task IDs use `{phase}-{plan}-{task}` convention. Plan IDs (01..N) will be finalized by the planner. This table enumerates the expected verification per requirement; planner refines as plans materialize.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-XX | 01 (schema lock — D-13/D-15 fixture re-stamp + split-list validator) | 1 | RERUN-03 (schema side) | — | Schema-guard throws clear error on missing keys (Pitfall 1 mitigation); schema_version=1 and 4 capture keys present on every iteration | unit + schema round-trip | `npx vitest run tests/unit/llm-report.test.js tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` | ✅ | ✅ green |
| 33-02-XX | 02 (rerun-validator pure-function module) | 2 | RERUN-01, RERUN-02 | T-33-02-01 | Pure-function module; no src/ imports; computeVerdict `>= 2` inclusive; atomicWriteJson + EXDEV fallback inlined | unit (CONFIRMED 3/3, CONFIRMED 2/3 edge, FLAKE 0/3+1/3, NOT_REPLAYABLE, schema_version, EXDEV, spy.callCount) | `npx vitest run tests/unit/rerun-validator.test.js` | ✅ | ✅ green |
| 33-03-XX | 03 (e2e-explore D-14 capture + call-site threading) | 2 | RERUN-03 (capture side) | T-33-03-01 | 4 new fields populated on selectText success path; null on 5 pre-browser/catch failure paths (per-site verifier proves no site missed) | static analysis script + npm test:src regression | `node scripts/_verify-phase33-callsites.mjs` | ✅ | ✅ green |
| 33-04-XX | 04 (CLI runner — scripts/e2e-rerun-validator.mjs) | 3 | RERUN-01 (success crit 1) | T-33-04-01..04 | `--input` rejects equals syntax (exit 2) and missing trailing value (exit 2); missing file exits 1; writes `rerun-report.json` to artifacts/{runId}/ | integration (spawnSync) | `npx vitest run tests/e2e/scripts/e2e-rerun-validator.test.js` | ✅ | ✅ green |
| 33-05-XX | 05 (ESLint guard — RERUN-04 independence claim) | 3 | RERUN-04 | T-33-05-01..02 | Importing from `src/` in rerun-validator.js emits ESLint error with RERUN-04 message; try/finally + process.once('exit') restore the file | integration (spawnSync `npm run lint` + violation injection) | `npm run lint && npx vitest run tests/e2e/scripts/e2e-lint-rerun-guard.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Path corrections applied during 2026-05-29 audit (see Validation Audit section below):**
> Pre-audit rows 44/45 predicted `tests/e2e/lib/rerun-validator.test.js` and `tests/e2e/lib/llm-report.test.js`. Actual implementation placed unit tests in `tests/unit/` (vitest convention). Rows above reflect actual paths. Plan IDs were also re-aligned to match as-shipped Plans 01–05 (the draft row listing "Plan 06 ESLint guard" was a pre-planning placeholder; ESLint guard is Plan 33-05).

---

## Wave 0 Requirements

- [x] `tests/unit/rerun-validator.test.js` — actual path; 15 tests covering CONFIRMED, FLAKE, edge-2/3, NOT_REPLAYABLE, schema_version, EXDEV, spy.callCount cases (RERUN-01, RERUN-02). *Draft predicted `tests/e2e/lib/rerun-validator.test.js`; corrected to `tests/unit/` (vitest convention).*
- [x] `tests/unit/llm-report.test.js` extended — Tests 12d–12i cover `REQUIRED_NULLABLE_FIELDS` validation behavior (RERUN-03). *Draft predicted `tests/e2e/lib/llm-report.test.js`; corrected to `tests/unit/`.*
- [x] `tests/e2e/scripts/e2e-rerun-validator.test.js` — 5 spawnSync tests for CLI exit codes, WR-07 stderr-absence, UAT fixture smoke (RERUN-01)
- [x] `tests/e2e/scripts/e2e-lint-rerun-guard.test.js` — 2 tests proving ESLint rule fires on src/ injection and restores file via try/finally (RERUN-04)
- [x] No `npm install` needed — vitest, eslint, pdfjs-dist all already present (verified in research)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run e2e:rerun-validator` end-to-end smoke against the committed Phase 32 UAT fixture | RERUN-01 (success criterion 1) | Verifies CLI + filesystem + atomic-write path; UAT fixture has zero replay-eligible iterations so the smoke proves NOT_REPLAYABLE handling end-to-end | `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` → check `tests/e2e/artifacts/2026-05-25T05-22-53Z/rerun-report.json` exists with `summary.not_replayable_count: 10` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (actual: ~1s for the 5 Phase 33 files; ~30s for full `test:src && lint`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** GREEN — stamped 2026-05-29 (see Validation Audit section below).

---

## Validation Audit 2026-05-29

**Auditor:** gsd-nyquist-auditor (Opus 4.7)
**Audit type:** Retroactive map-correction for as-shipped phase (VERIFICATION.md status: passed, score 32/32 from 2026-05-26).
**Scope:** Reconcile predicted test paths in the Per-Task Verification Map against actual implementation paths; stamp `nyquist_compliant: true`.

### Path Drift Reconciliation

| Row | Pre-audit predicted path | Actual implementation path | Resolution |
|-----|-------------------------|---------------------------|------------|
| 33-02-XX | `tests/e2e/lib/rerun-validator.test.js` | `tests/unit/rerun-validator.test.js` | Updated row to actual path. Vitest convention (per Plan 33-02 `files_modified` frontmatter and Plan 33-02 SUMMARY) places unit tests under `tests/unit/`. |
| 33-01-XX | `tests/e2e/lib/llm-report.test.js` | `tests/unit/llm-report.test.js` | Updated row to actual path. Same vitest convention. |
| 33-03-XX | predicted `vitest run scripts/e2e-explore.test.js` (a unit/integration test file that was never built) | `node scripts/_verify-phase33-callsites.mjs` (static analysis script) + `npm run test:src` regression | As-shipped strategy is a per-call-site static verifier (Plan 33-03 Task 3) rather than a unit/integration test of the capture block. Captured paths run only inside a live Playwright browser, so the verifier proves D-14 threading without launching the browser. |
| 33-05-XX (formerly drafted as 33-06-XX "Plan 06") | `npm run lint && vitest run tests/e2e/scripts/e2e-lint-rerun-guard.test.js` | Same command; plan number is 05, not 06 (the draft was written before plan IDs were finalized) | Updated plan number; command unchanged. |

### Test Execution Verification

Command run on 2026-05-29 (worktree `/home/fatduck/patent-cite-tool`, branch `main`):

```
npx vitest run tests/unit/rerun-validator.test.js tests/unit/llm-report.test.js \
  tests/e2e/scripts/e2e-rerun-validator.test.js tests/e2e/scripts/e2e-lint-rerun-guard.test.js \
  tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js --reporter=dot
```

Result: **Test Files 5 passed (5), Tests 54 passed (54), Duration 994ms**. All five Phase 33 test files green; zero failures.

### Manual-Only Row Status

The single Manual-Only verification row (`npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` live smoke) is COVERED-MANUAL per RESEARCH Pitfall 4 + VERIFICATION.md row 7 ("UAT fixture smoke: 10 NOT_REPLAYABLE, summary.not_replayable_count: 10 — VERIFIED"). Already executed at verification time; no automation gap.

### Metrics

| Metric | Value |
|--------|-------|
| Per-Task Map rows | 5 (all green) |
| Manual-Only rows | 1 (covered-manual, pre-classified) |
| Test files audited | 5 |
| Total tests passing in audited files | 54 |
| Path drift corrections applied | 2 (rows 33-01-XX, 33-02-XX) |
| Plan ID corrections applied | 1 (row 33-05-XX, formerly drafted 33-06-XX) |
| Test type re-classifications | 1 (row 33-03-XX: predicted unit/integration → actual static analysis + regression suite) |
| Gaps escalated | 0 |
| Implementation modifications | 0 (audit is map-correction only; implementation files read-only per audit protocol) |

### Outcome

`nyquist_compliant: true` stamped. Phase 33 validation map is now consistent with as-shipped artifacts. All 4 RERUN requirements (RERUN-01..04) verified by VERIFICATION.md (32/32 must-haves on 2026-05-26) and re-confirmed via vitest execution on 2026-05-29.

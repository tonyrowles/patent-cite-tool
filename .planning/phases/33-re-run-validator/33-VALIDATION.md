---
phase: 33
slug: re-run-validator
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
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
| **Quick run command** | `vitest run tests/e2e/lib/rerun-validator.test.js` (single file) |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~6-10s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified (e.g., `vitest run tests/e2e/lib/rerun-validator.test.js` after touching `rerun-validator.js`)
- **After every plan wave:** Run `npm run test:src` (Vitest full src/lib suite) plus `npm run lint` (ESLint independence guard)
- **Before `/gsd:verify-work`:** Full suite must be green AND `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` produces a valid `rerun-report.json` (the smoke run from RERUN-01 success criterion 1)
- **Max feedback latency:** ~30 seconds (test:src + lint)

---

## Per-Task Verification Map

> Task IDs use `{phase}-{plan}-{task}` convention. Plan IDs (01..N) will be finalized by the planner. This table enumerates the expected verification per requirement; planner refines as plans materialize.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-XX | 01 (fixture migration) | 1 | RERUN-03 (prep) | — | N/A | unit (existing schema test still passes after migration) | `vitest run tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` | ❌ W0 | ⬜ pending |
| 33-02-XX | 02 (llm-report schema extension) | 1 | RERUN-03 | — | Schema-guard throws clear error on missing keys (Pitfall 1 mitigation) | unit | `vitest run tests/e2e/lib/llm-report.test.js` (new tests for required-nullable fields) | ❌ W0 | ⬜ pending |
| 33-03-XX | 03 (rerun-validator module) | 2 | RERUN-01, RERUN-02 | — | Pure-function module; no src/ imports | unit (CONFIRMED, FLAKE, edge 2/3, NOT_REPLAYABLE, schema_version) | `vitest run tests/e2e/lib/rerun-validator.test.js` | ❌ W0 | ⬜ pending |
| 33-04-XX | 04 (CLI runner) | 3 | RERUN-01 (success crit 1) | — | `--input` rejects missing/invalid paths with exit 1; writes `rerun-report.json` to artifacts/{runId}/ | integration (spawnSync) | `vitest run tests/e2e/scripts/e2e-rerun-validator.test.js` | ❌ W0 | ⬜ pending |
| 33-05-XX | 05 (e2e-explore capture) | 3 | RERUN-03 (capture side) | — | 4 new fields populated on selectText success path; null on pre-browser failure paths (6 call sites) | unit/integration (mock page object exercising all 6 paths) | `vitest run scripts/e2e-explore.test.js` (existing test file extended or new) | ❌ W0 | ⬜ pending |
| 33-06-XX | 06 (ESLint guard) | 4 | RERUN-04 | — | Importing from `src/` in rerun-validator emits a lint error | lint guard (existing pattern from `e2e-explore-ci-guard.test.js` style) | `npm run lint && vitest run tests/e2e/scripts/e2e-lint-rerun-guard.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e/lib/rerun-validator.test.js` — stub file with imports for CONFIRMED, FLAKE, edge-2/3, NOT_REPLAYABLE, schema_version cases (RERUN-01, RERUN-02)
- [ ] `tests/e2e/lib/llm-report.test.js` extended (or new) — stub assertions for `REQUIRED_NULLABLE_FIELDS` validation behavior (RERUN-03)
- [ ] `tests/e2e/scripts/e2e-rerun-validator.test.js` — stub spawnSync test for CLI exit codes and output file presence (RERUN-01)
- [ ] `tests/e2e/scripts/e2e-lint-rerun-guard.test.js` — stub for ESLint rule verification (RERUN-04)
- [ ] No `npm install` needed — vitest, eslint, pdfjs-dist all already present (verified in research)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run e2e:rerun-validator` end-to-end smoke against the committed Phase 32 UAT fixture | RERUN-01 (success criterion 1) | Verifies CLI + filesystem + atomic-write path; UAT fixture has zero replay-eligible iterations so the smoke proves NOT_REPLAYABLE handling end-to-end | `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` → check `tests/e2e/artifacts/2026-05-25T05-22-53Z/rerun-report.json` exists with `summary.not_replayable_count: 10` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

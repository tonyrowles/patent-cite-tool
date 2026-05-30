---
phase: 34
slug: hybrid-triage-classifier
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-27
audited: 2026-05-29
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 34-RESEARCH.md §"Validation Architecture" + CONTEXT.md decisions D-01..D-16.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (existing) + ESLint 10.x (existing) |
| **Config file** | `vitest.config.chrome.js` + `eslint.config.js` (extended in D-07) |
| **Quick run command** | `vitest run tests/unit/triage-classifier.test.js` |
| **Full suite command** | `npm run test:src && npm run lint` |
| **Estimated runtime** | ~10-15s quick / ~30-45s full |

---

## Sampling Rate

- **After every task commit:** Run the quick test for the file just modified
- **After every plan wave:** Run `npm run test:src` + `npm run lint` + `node scripts/_verify-phase33-callsites.mjs`
- **Before `/gsd:verify-work`:** Full suite green AND `npm run e2e:triage-classifier -- --input <fixture-llm-report>` produces a valid triage-report.json that the schema-guard test verifies
- **Max feedback latency:** ~45 seconds (full test:src + lint)

---

## Per-Task Verification Map

> Plan IDs (01..N) finalized by planner. Table enumerates expected verifications per requirement.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 34-01-XX | 01 (invokeClaudePWithLedger wrapper) | 1 | TRIAGE-04 (partial) | T-34-04 (CI invocation), T-34-cost | Wrapper refuses CI=true; pre-flight cap check; auto-ledger-append | unit | `vitest run tests/unit/llm-driver.test.js` | ✅ green |
| 34-02-XX | 02 (triage-classifier module core: heuristics + VERIFIER_STRONG_AGREEMENT + severity + schema) | 2 | TRIAGE-01, TRIAGE-02, TRIAGE-05 | Pitfall 2 (Tier C masking) | Heuristic-only for 6 classes; Tier C escalates; named constant; schema fields present | unit | `vitest run tests/unit/triage-classifier.test.js` | ✅ green |
| 34-03-XX | 03 (cluster pre-filter + LLM second-pass + wrapPatentData) | 2 | TRIAGE-03, TRIAGE-06 | Pitfall 3 (cluster saturation), Pitfall 4 (prompt injection) | N≥5 → 1 grouped call; `<patent_data>` wrap; closer rejection | unit | `vitest run tests/unit/triage-classifier.test.js` | ✅ green |
| 34-04-XX | 04 (CLI runner + spawnSync tests + npm script + CI guard) | 3 | TRIAGE-04 (full) | T-34-04 | --input flag rejection patterns; UAT fixture smoke; CI=true exits non-zero | integration | `vitest run tests/e2e/scripts/e2e-triage-classifier.test.js && vitest run tests/e2e/scripts/e2e-triage-ci-guard.test.js` | ✅ green |
| 34-05-XX | 05 (ESLint per-file independence guard) | 3 | TRIAGE-04 (defense-in-depth) | T-34-07 | invokeClaudeP named import restricted in triage code | lint guard | `npm run lint && vitest run tests/e2e/scripts/e2e-lint-triage-guard.test.js` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/llm-driver.test.js` — extended (or new) with invokeClaudePWithLedger wrapper tests (CI gate, pre-flight cap, ledger append)
- [x] `tests/unit/triage-classifier.test.js` — stub file with imports for all heuristic/cluster/prompt-injection cases
- [x] `tests/e2e/scripts/e2e-triage-classifier.test.js` — stub spawnSync tests
- [x] `tests/e2e/scripts/e2e-triage-ci-guard.test.js` — stub CI-guard spawnSync test
- [x] `tests/e2e/scripts/e2e-lint-triage-guard.test.js` — stub for ESLint rule verification
- [x] Fixtures (synthetic): a small llm-report+rerun-report pair with mixed classifications covering all 6 heuristic paths + Tier C escalation + N≥5 cluster

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run e2e:triage-classifier` end-to-end smoke against the committed Phase 32 UAT fixture | TRIAGE-05 | Verifies CLI + filesystem + schema-write path on real-shape input; UAT fixture has 10 iterations (mostly HARNESS_ERROR + LLM_API_ERROR) so the smoke proves the heuristic paths end-to-end with zero LLM calls | `npm run e2e:triage-classifier -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` → check sibling `triage-report.json` exists with `heuristic_count: 10`, `llm_pass_count: 0`, `cluster_pass_count: 0` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-05-29 retroactive audit)

---

## Validation Audit 2026-05-29

**Auditor:** Claude (Opus 4.7 1M, gsd-nyquist-auditor mode)
**Phase status:** SHIPPED — 34-VERIFICATION.md `status: passed` 2026-05-27T11:10:00Z (score 6/6)
**Audit type:** retroactive map-stamping (State A → State B)

### Test Execution Results

Command: `npx vitest run tests/unit/llm-driver.test.js tests/unit/triage-classifier.test.js tests/e2e/scripts/e2e-triage-classifier.test.js tests/e2e/scripts/e2e-triage-ci-guard.test.js tests/e2e/scripts/e2e-lint-triage-guard.test.js --reporter=dot`

| File | Tests | Status |
|------|-------|--------|
| `tests/unit/llm-driver.test.js` | included in 92-test aggregate | green |
| `tests/unit/triage-classifier.test.js` | included in 92-test aggregate | green |
| `tests/e2e/scripts/e2e-triage-classifier.test.js` | included in 92-test aggregate | green |
| `tests/e2e/scripts/e2e-triage-ci-guard.test.js` | included in 92-test aggregate | green |
| `tests/e2e/scripts/e2e-lint-triage-guard.test.js` | included in 92-test aggregate | green |
| **Aggregate** | **92 passed / 92** | **green** |

Duration: 985ms (well under the 45s feedback-latency budget).

### Per-Task Map → Requirements Coverage

| Task | Requirement(s) | Automated Command | Result |
|------|----------------|-------------------|--------|
| 34-01 | TRIAGE-04 (wrapper layer) | `vitest run tests/unit/llm-driver.test.js` | green |
| 34-02 | TRIAGE-01, TRIAGE-02, TRIAGE-05 | `vitest run tests/unit/triage-classifier.test.js` | green |
| 34-03 | TRIAGE-03, TRIAGE-06 | `vitest run tests/unit/triage-classifier.test.js` | green |
| 34-04 | TRIAGE-04 (script layer) | `vitest run tests/e2e/scripts/e2e-triage-classifier.test.js && vitest run tests/e2e/scripts/e2e-triage-ci-guard.test.js` | green |
| 34-05 | TRIAGE-04 (ESLint layer) | `npm run lint && vitest run tests/e2e/scripts/e2e-lint-triage-guard.test.js` | green |

All 6 TRIAGE requirements (TRIAGE-01..06) covered by automated verification across the 5-file aggregate. Three-layer CI defense fully verified (Plan 01 wrapper, Plan 04 script, Plan 05 ESLint).

### Manual-Only Coverage (PRE-CLASSIFIED COVERED-MANUAL per RESEARCH Pitfall 4)

| Behavior | Requirement | Status |
|----------|-------------|--------|
| `npm run e2e:triage-classifier` live smoke against UAT fixture (Phase 32) | TRIAGE-05 (end-to-end CLI + filesystem + schema write path) | COVERED-MANUAL (documented in Manual-Only table above; no escalation per Pitfall 4) |

### Compliance

- All 5 Per-Task Map rows now ✅ green
- Wave 0 requirements all satisfied (test files + fixtures exist and run green)
- All Validation Sign-Off boxes checked
- `nyquist_compliant: true` stamped
- Zero new dependencies introduced
- Zero implementation files modified during audit

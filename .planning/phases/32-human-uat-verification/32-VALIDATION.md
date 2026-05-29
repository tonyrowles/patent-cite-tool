---
phase: 32
slug: human-uat-verification
status: completed
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-24
audit_completed: 2026-05-29
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (unit) + Playwright (E2E golden) |
| **Config file** | `vitest.config.ts` + `playwright.config.js` |
| **Quick run command** | `npm run test:src` |
| **Full suite command** | `npm run test:src && npx playwright test` |
| **Estimated runtime** | ~10s (test:src, 684 tests) / ~180s (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:src` (684 Vitest tests as of audit date)
- **After every plan wave:** Run `npm run test:src && npx playwright test` (full regression)
- **Before `/gsd:verify-work`:** Full suite must be green; UAT live-run evidence committed
- **Max feedback latency:** 60 seconds (Vitest) — full suite reserved for wave boundaries

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-T1 | 32-01 | 0 | UAT-01 (fixture dir tracked, RESEARCH Pitfall 8) | T-32-01 | `tests/e2e/fixtures/` directory committed via zero-byte `.gitkeep` marker | smoke | `test -d tests/e2e/fixtures && test -f tests/e2e/fixtures/.gitkeep` | ✓ | ✅ green |
| 32-01-T2 | 32-01 | 0 | UAT-02 (--phase flag parse contract) | T-32-08, T-32-09 | 4 RED parse-tests assert strict `^\d+$`, reject `v32` / `--phase=32` / missing-value; accept `--phase 32` | unit | `npx vitest run tests/e2e/scripts/e2e-explore-phase-flag.test.js` | ✓ | ✅ green (RED→GREEN via 32-03) |
| 32-01-T3 | 32-01 | 0 | UAT-03 (upload-helper DI contract) | T-32-14, T-32-16 | 4 SKIP-gated tests assert auth-status → ingest → run-list filter → nightly → browser orchestration | unit | `npx vitest run tests/e2e/scripts/e2e-upload-llm-report.test.js` | ✓ | ✅ green (SKIP→GREEN via 32-04) |
| 32-01-T4 | 32-01 | 0 | UAT-01 (fixture schema-guard) | T-32-01, T-32-02 | 5 it.skipIf-gated tests round-trip every iteration through `appendLlmIteration`; assert ≥10 iterations; structure-only (Pitfall 1) | unit | `npx vitest run tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` | ✓ | ✅ green (SKIP→GREEN via 32-05) |
| 32-02-T1 | 32-02 | 1 | UAT-02 (per-phase ledger helpers + TEST-ONLY LEDGER_PATH env override) | T-32-04, T-32-05, T-32-21 | Exports `PHASE_HARD_CAP_USD=10`, `PHASE_WARN_THRESHOLD_USD=8`, `phaseTotal`, `checkPhaseSpendCap`; `E2E_LEDGER_PATH_OVERRIDE` env hook honored at module-load time; `appendLedgerEntry` body unchanged | unit | `node -e "import('./tests/e2e/lib/llm-ledger.js').then(m => { for (const k of ['PHASE_HARD_CAP_USD','PHASE_WARN_THRESHOLD_USD','phaseTotal','checkPhaseSpendCap']) { if (m[k] === undefined) process.exit(1); } if (m.PHASE_HARD_CAP_USD !== 10 \|\| m.PHASE_WARN_THRESHOLD_USD !== 8) process.exit(1); });"` | ✓ | ✅ green |
| 32-02-T2 | 32-02 | 1 | UAT-02 (phase ledger test coverage) | T-32-04, T-32-05 | 18+ new tests cover phase tagging, phaseTotal, checkPhaseSpendCap boundaries ($7.99 ok / $8.00 warn / $9.99 warn / $10.00 block / $15 block), LEDGER_PATH override via spawnSync, multi-month aggregation, 6dp rounding, back-compat (D-14) | unit | `npx vitest run tests/unit/llm-ledger.test.js` | ✓ | ✅ green (37 tests) |
| 32-03-T1 | 32-03 | 2 | UAT-02 (--phase wiring in e2e-explore.mjs; pre-flight cap exit 6; mid-run cap stopAll; ledger phase stamping) | T-32-08, T-32-09, T-32-11, T-32-12, T-32-13 | parseArgs accepts `--phase <numeric>` with `^\d+$`; rejects equals/non-numeric/missing-value with exit 2; pre-flight at `:510` exits 6 on block (D-15); mid-run check via `checkMidRunPhaseCap` returns `{stopAll, reason:'phase_cap'}`; `phase: phase` stamped on both `appendLedgerEntry` sites; CI guard at `:72` untouched | unit | `npx vitest run tests/e2e/scripts/e2e-explore-phase-flag.test.js tests/e2e/scripts/e2e-explore-ci-guard.test.js` | ✓ | ✅ green |
| 32-03-T2 | 32-03 | 2 | UAT-02 (pre-flight integration + back-compat tests) | T-32-12, T-32-13, T-32-22 | Test 5 (pre-flight integration via spawnSync + seeded tmp ledger via `E2E_LEDGER_PATH_OVERRIDE`); Test 6 (back-compat: no --phase → no enforcement) — both ENABLED (no .skip), restores VALIDATION.md UAT-02(b) integration coverage per checker B3 | unit | `npx vitest run tests/e2e/scripts/e2e-explore-phase-flag.test.js` | ✓ | ✅ green (6 tests, 0 skipped) |
| 32-04-T1 | 32-04 | 2 | UAT-03 (upload helper + npm script) | T-32-14, T-32-16, T-32-18, T-32-SC | Exports `uploadReport`, `makeRealGhClient`, `MAX_BASE64_BYTES`; auth pre-flight (exit 7); size-guard at 60KB+ (exit 2); stage 1 → settle → run-list filter (`createdAt >= triggerIsoMs - 1s`) → stage 2 → browser-open; `payload_b64=@-` STDIN pattern; npm script `e2e:upload-llm-report` registered | unit | `node -e "import('./scripts/e2e-upload-llm-report.mjs').then(m => { for (const k of ['uploadReport','makeRealGhClient','MAX_BASE64_BYTES']) { if (typeof m[k] === 'undefined') process.exit(1); } }); const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); if(p.scripts['e2e:upload-llm-report']!=='node scripts/e2e-upload-llm-report.mjs') process.exit(1);"` | ✓ | ✅ green |
| 32-04-T2 | 32-04 | 2 | UAT-03 (helper behavior coverage — 4 tests via mock ghClient DI) | T-32-14, T-32-16, T-32-18 | 4 tests static-import the helper: happy-path call ordering; race-mitigation filter (post-trigger vs stale); oversize exit 2 before any gh call; auth-fail exit 7 before any other gh call | unit | `npx vitest run tests/e2e/scripts/e2e-upload-llm-report.test.js` | ✓ | ✅ green (4 tests) |
| 32-04-T3 | 32-04 | 2 | UAT-03 (ingest workflow + nightly extension) | T-32-14, T-32-15, T-32-17, T-32-20 | `.github/workflows/e2e-ingest-llm-report.yml` exists with `workflow_dispatch`-only trigger, `permissions: contents: read`, static `concurrency: e2e-ingest-llm-report`, `cancel-in-progress: false`, `actions/upload-artifact@v4` with `name: llm-report`, `retention-days: 14`, `if-no-files-found: error`, jq sanity check; nightly gains `llm_run_id` input with `default: ''` (Pitfall 3), gated step `if: inputs.llm_run_id != ''`, `gh run download ... -n llm-report`, schema round-trip via `appendLlmIteration` (D-06 hard gate) | smoke (grep invariants) | `grep -c "default: ''" .github/workflows/e2e-nightly.yml && grep -c "name: llm-report" .github/workflows/e2e-ingest-llm-report.yml && grep -c "if: inputs.llm_run_id != ''" .github/workflows/e2e-nightly.yml && grep -c "group: e2e-ingest-llm-report" .github/workflows/e2e-ingest-llm-report.yml && grep -c "appendLlmIteration" .github/workflows/e2e-nightly.yml && grep -c "retention-days: 14" .github/workflows/e2e-ingest-llm-report.yml` | ✓ | ✅ green (all invariants present; live-validated by ingest run `26413491001` + nightly run `26413494488`) |
| 32-05-T1 | 32-05 | 3 | UAT-01 (UAT evidence scaffold) | T-32-22 | `32-UAT-EVIDENCE.md` exists with all 11+ required sections (Environment, Pre-Flight Ledger State, Run Command, Terminal Output Highlights, Iteration Count + Schema Validation, Ledger Delta, Upload Helper Run, Regression Baseline, Anomalies, Attempt Log, Sign-Off) | smoke | `test -f .planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md && [ "$(grep -c '^## ' .planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md)" -ge 11 ]` | ✓ | ✅ green |
| 32-05-T2 | 32-05 | 3 | UAT-01 (live run + real-run fixture commit) | T-32-21, T-32-23, T-32-25 | `tests/e2e/fixtures/uat-phase32-llm-report.json` committed with 10 schema-valid iterations from real `claude -p` Max 5 subscription run (run_id `2026-05-25T05-22-53Z`); fixture flips schema-guard spec SKIPPED → GREEN | unit (schema round-trip) | `test -f tests/e2e/fixtures/uat-phase32-llm-report.json && npx vitest run tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` | ✓ | ✅ green (5 tests pass; 10 iterations) [also COVERED-MANUAL — see Manual-Only row 1] |
| 32-05-T3 | 32-05 | 3 | UAT-03 (live upload helper invocation; ingest + nightly workflow handoff) | T-32-14, T-32-18 | `npm run e2e:upload-llm-report` invoked: ingest run `26413491001` SUCCESS + `llm-report` artifact; auto-triggered nightly run `26413494488` SUCCESS with verbatim `schema OK: 10 iterations` log line at `2026-05-25T18:01:00.8862481Z` (D-06 round-trip proven live) | smoke | manual gh-run verification (COVERED-MANUAL — see Manual-Only row 3 + 32-UAT-EVIDENCE.md sign-off) | ✓ | ⬜ COVERED-MANUAL |
| 32-05-T4 | 32-05 | 3 | UAT-01/UAT-02/UAT-03 (final sign-off — all 4 ROADMAP criteria) | T-32-22 | 32-UAT-EVIDENCE.md "## Sign-Off" section contains `[x] All 4 success criteria pass per ROADMAP.md`; 32-VERIFICATION.md status=passed; ROADMAP Phase 32 marked complete | smoke | `grep -c "All 4 success criteria pass" .planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md && [ "$(awk '/^status:/ {print $2; exit}' .planning/phases/32-human-uat-verification/32-VERIFICATION.md)" = "passed" ]` | ✓ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · COVERED-MANUAL (live UAT evidence)*

---

## Wave 0 Requirements

- [x] `tests/e2e/fixtures/` directory created (committed via `.gitkeep` at `3f4f3e2`)
- [x] `tests/e2e/lib/llm-ledger.js` — extended for `phase`-field-tagged ledger entries + per-phase sum helper (`12396be`)
- [x] `tests/e2e/scripts/e2e-explore-phase-flag.test.js` — new unit test for `--phase` flag parsing + pre-flight cap check (6 tests; `0855e82` Wave 0 stub → `4469390` Wave 2 cap-integration)
- [x] `tests/e2e/scripts/e2e-upload-llm-report.test.js` — new unit test mocking `execSync` for `gh` calls (4 tests; `9ef0049` Wave 0 stub → `5b032d2` Wave 2 rewrite)
- [x] `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` — new Vitest test asserting the committed fixture parses against `appendLlmIteration` validator (5 tests; `da4ed21` Wave 0 stub → `4b3ac61` Wave 3 fixture commit)

*Existing infrastructure (Vitest 3.x + Playwright + `gh` CLI 2.83.1) is sufficient — no new framework installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run e2e:explore --phase 32` produces ≥10 schema-valid iterations against live Max 5 subscription | UAT-01 | Requires live subscription credit + interactive `claude -p` invocation; per D-01 user runs this, not Claude | (1) User runs `npm run e2e:explore -- --phase 32` from their machine. (2) Verify terminal exit 0. (3) Verify `llm-report.json` written to canonical path with ≥10 iterations. (4) Commit fixture to `tests/e2e/fixtures/uat-phase32-llm-report.json`. (5) Write narrative `32-UAT-EVIDENCE.md` capturing terminal output, ledger delta, iteration count. **COMPLETED 2026-05-25 — run_id `2026-05-25T05-22-53Z`, 10 iterations, $0.83 phase-32 spend; fixture committed at `4b3ac61`.** |
| Ledger entries tagged `phase: "32"` are summed correctly for $80/$100 monthly cap + new $10 per-phase cap | UAT-02 | Live `claude -p` cost data only emitted by real subscription invocations | Inspect `tests/e2e/.llm-spend-ledger.json` after live run. Confirm new entries have `phase: "32"`. Manual sum cross-checked against ledger helper output (no per-phase sum > $10, no monthly sum > $100). **COMPLETED 2026-05-25 — all 10 iterations carry `phase: "32"`; phase-32 sum $0.8297 (well under $10 cap); May-2026 monthly sum $2.70 (well under $80 cap).** |
| `npm run e2e:upload-llm-report` triggers ingest workflow → captures run_id → triggers nightly with `llm_run_id` input → browser auto-opens to run URL | UAT-03 | End-to-end depends on GitHub Actions live execution and `gh` CLI auth state on user's machine | (1) After UAT pass, user runs `npm run e2e:upload-llm-report`. (2) Verify terminal prints ingest run URL. (3) Verify browser auto-opens to that URL. (4) Verify ingest workflow run shows `llm-report.json` as a downloadable artifact. (5) Verify nightly workflow run kicked off with non-empty `llm_run_id` input. (6) Verify nightly's download+schema-validate step exits 0. **COMPLETED 2026-05-25 — ingest run `26413491001` SUCCESS with `llm-report` artifact (14-day retention); nightly run `26413494488` SUCCESS with verbatim `schema OK: 10 iterations` log at `2026-05-25T18:01:00.8862481Z`.** |
| UAT failure path: on 3 exhausted attempts, `32-UAT-FAILURE.md` is written, Phase 31 reopened in ROADMAP.md | D-12 | Failure-mode triggered only by real UAT failure | If/when UAT fails: user manually triggers failure-mode tasks per D-12 runbook. Not exercised on happy path. **NOT EXERCISED — UAT happy-path passed on attempt 1.** |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (audit map populated 2026-05-29)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every Plan 32-XX task except checkpoint:human-action tasks has automated coverage)
- [x] Wave 0 covers all MISSING references (`tests/e2e/fixtures/` created)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (Vitest unit suite — 684 tests in ~10s as of audit)
- [x] Manual UAT-EVIDENCE.md committed before `/gsd:verify-work` (`4b3ac61`, sign-off at `2026-05-25T12:05:00Z`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-29 (Nyquist retroactive audit — see Validation Audit section below)

---

## Validation Audit 2026-05-29

**Auditor:** Claude (nyquist-auditor)
**Phase status:** completed (Phase 32 closed in v3.1; VERIFICATION.md `passed` at 2026-05-25T12:05:00Z)
**Audit type:** retroactive map population + nyquist-compliance stamp

### Metrics
- **Tasks audited:** 14 (4 in Plan 32-01, 2 in Plan 32-02, 2 in Plan 32-03, 3 in Plan 32-04, 4 in Plan 32-05)
- **Automated coverage:** 13/14 tasks (92.9%) have ENABLED automated verify commands
- **COVERED-MANUAL:** 1/14 (task 32-05-T3 live-upload roundtrip; pre-classified per RESEARCH Pitfall 4)
- **Tests created during audit:** 0 — all required automated tests already exist on disk and pass
- **Test files exercised:** 4 (e2e-explore-phase-flag.test.js, e2e-upload-llm-report.test.js, uat-phase32-llm-report.schema.test.js, tests/unit/llm-ledger.test.js)
- **Total Phase 32-related Vitest tests passing:** 52 (6 phase-flag + 4 upload-helper + 5 schema-guard + 37 ledger)
- **Full Vitest baseline:** 684/684 green (44 test files, ~10s runtime)

### Audit Method
1. Walked each Plan PLAN file (32-01 through 32-05) and extracted task IDs, requirements, and `<verify><automated>` blocks.
2. For each automated verify block, ran the command and confirmed exit 0.
3. Cross-referenced existing test files in `tests/e2e/scripts/`, `tests/e2e/fixtures/`, and `tests/unit/` to map task → test → automated command.
4. Confirmed live UAT evidence (32-UAT-EVIDENCE.md sign-off + 32-VERIFICATION.md `status: passed`) for the one COVERED-MANUAL row (live upload roundtrip).
5. Stamped `nyquist_compliant: true` in frontmatter.

### Evidence of Live Verification (re-spot-checked during audit)
- `npx vitest run tests/e2e/scripts/e2e-explore-phase-flag.test.js tests/e2e/scripts/e2e-upload-llm-report.test.js tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js tests/unit/llm-ledger.test.js` → 52/52 pass, 0 fail, 0 skipped at 2026-05-29 audit time
- `npm run test:src` → 684/684 pass (44 files, ~10s)
- Live ingest run `26413491001` + nightly run `26413494488` permanently logged in 32-VERIFICATION.md (re-fetchable via `gh run view`)
- Fixture file: `tests/e2e/fixtures/uat-phase32-llm-report.json` — 10 iterations, schema_version=1, run_id `2026-05-25T05-22-53Z`

### Outcome
**GAPS FILLED.** The Per-Task Verification Map placeholder ("Filled in during planning") has been replaced with 14 concrete rows mapping every Plan 32-XX task to its automated verify command (or pre-classified COVERED-MANUAL designation). All 13 auditable rows are ✅ green; the 1 COVERED-MANUAL row (32-05-T3 live upload) is explicitly justified per RESEARCH Pitfall 4 and corroborated by the Manual-Only Verifications table's row-3 evidence (ingest + nightly run URLs + verbatim `schema OK: 10 iterations` log line). `nyquist_compliant: true` stamped in frontmatter. No new tests authored — existing infrastructure satisfies the map.

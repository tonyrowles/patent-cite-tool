---
phase: 33-re-run-validator
verified: 2026-05-26T19:55:00Z
status: passed
score: 32/32
overrides_applied: 0
---

# Phase 33: Re-run Validator — Verification Report

**Phase Goal:** Every LLM-flagged anomaly in `llm-report.json` can be deterministically replayed 3 times via the verifier-only path to produce a `rerun-report.json` verdict, and the `llm-report.json` iteration schema carries scroll/viewport state required for accurate replay.

**Verified:** 2026-05-26T19:55:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Validator replays each WRONG_CITATION / VERIFIER_DISAGREE iteration exactly 3 times | VERIFIED | `runValidator` loop: `for (let i = 0; i < 3; i++)` per eligible iter; 15 unit tests covering callCount===3*N and callCount===0 for ineligible |
| 2 | Ineligible classifications produce NOT_REPLAYABLE with zero verifyCitation calls | VERIFIED | `isEligibleForReplay` gates on `WRONG_CITATION\|VERIFIER_DISAGREE` only; ineligible path pushes entry without calling verifyCitation |
| 3 | CONFIRMED at 2/3 (inclusive >= 2 threshold) | VERIFIED | `confirmedCount >= 2 ? 'CONFIRMED' : 'FLAKE'` at line 62 of rerun-validator.js; "verdict CONFIRMED at exactly 2/3" unit test passes |
| 4 | FLAKE at 0/3 and 1/3 | VERIFIED | computeVerdict unit tests for 0/3 and 1/3 pass |
| 5 | rerun-report.json top-level shape matches D-09 | VERIFIED | `emptyRerunReport` returns schema_version, source_llm_report, run_id, started_iso, finished_iso, summary, replays[] |
| 6 | Per-replay entry shape matches D-10 | VERIFIED | iteration_n, original_verdict_status, runs[], confirmed_count, total_runs, verdict; reason only on NOT_REPLAYABLE |
| 7 | UAT fixture smoke: 10 NOT_REPLAYABLE, summary.not_replayable_count: 10 | VERIFIED | `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` exits 0; rerun-report.json shows schema_version:1, not_replayable_count:10, replays.length:10 |
| 8 | llm-report.json iteration schema carries scroll_y, viewport_width, viewport_height, selected_node_xpath | VERIFIED | REQUIRED_NULLABLE_FIELDS in llm-report.js; all 6 appendLlmIteration call sites carry all 4 keys; _verify-phase33-callsites.mjs exits 0 |
| 9 | D-14 capture block between selectText and getCitation in e2e-explore.mjs | VERIFIED | `// --- D-14 Phase 33 capture block (RERUN-03) ---` at line 433; scroll_y, vp, selected_node_xpath declared and threaded |
| 10 | XPath capture degrades to null on rangeCount===0 (no throw) | VERIFIED | `if (!sel \|\| sel.rangeCount === 0) return null;` at line 455 of e2e-explore.mjs |
| 11 | WR-02 fix: viewport_width/height resolved as null-safe variables | VERIFIED | `const viewport_width = vp?.width ?? null;` at line 451; no crash on null viewport |
| 12 | ESLint no-restricted-imports block for rerun-validator.js (RERUN-04) | VERIFIED | `files: ['tests/e2e/lib/rerun-validator.js']` block at lines 82-100 of eslint.config.js; separate from pdf-verifier.js block |
| 13 | rerun-validator.js has zero src/ imports | VERIFIED | `grep -c "from.*src/" tests/e2e/lib/rerun-validator.js` = 0 |
| 14 | No _clearParsedCache import (D-07) | VERIFIED | `grep -c "_clearParsedCache" tests/e2e/lib/rerun-validator.js` = 0 |
| 15 | No tier_used branching in verdict logic (D-04) | VERIFIED | computeVerdict uses only confirmed_count >= 2; tier_used appears only in per-run object copy and doc comments |
| 16 | atomicWriteJson inlined with EXDEV fallback (D-12) | VERIFIED | Lines 111-126 of rerun-validator.js; `grep -c "EXDEV" rerun-validator.js` = 3 |
| 17 | WR-01 fix: verifyCitation throw in replay produces NOT_REPLAYABLE, loop continues | VERIFIED | try/catch wraps each verifyCitation call at lines 193-208; new unit test in rerun-validator.test.js |
| 18 | WR-03 fix: emptyReport() stamps schema_version: 1 | VERIFIED | `schema_version: LLM_REPORT_SCHEMA_VERSION` as first key of emptyReport() at line 185 of llm-report.js |
| 19 | CLI --input flag: equals syntax rejected exit 2 | VERIFIED | `[e2e-rerun-validator] equals syntax not supported for --input` in parseArgs |
| 20 | CLI --input flag: missing value rejected exit 2 | VERIFIED | `[e2e-rerun-validator] missing value for --input` in parseArgs |
| 21 | CLI --input missing file exits 1 | VERIFIED | `fs.existsSync` guard in main(); exits 1 with `input not found: ...` |
| 22 | CLI defaults to newest artifacts/*/llm-report.json by mtime | VERIFIED | `newestLlmReportPath` function using mtimeMs; `grep -c "mtimeMs" e2e-rerun-validator.mjs` = 1 |
| 23 | isMain guard prevents auto-execution on import | VERIFIED | `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])` at lines 194-196 |
| 24 | npm run e2e:rerun-validator registered in package.json | VERIFIED | `"e2e:rerun-validator": "node scripts/e2e-rerun-validator.mjs"` present |
| 25 | REQUIRED_NONNULL_FIELDS / REQUIRED_NULLABLE_FIELDS split in llm-report.js (D-13) | VERIFIED | Two declarations at lines 55 and 66-71; two `for (const f of REQUIRED_` loops at lines 249 and 254 |
| 26 | UAT fixture schema_version: 1 and 4 null-valued keys on every iteration | VERIFIED | `jq` confirmed: schema_version=1, all 10 iterations have all 4 keys as null |
| 27 | appendLlmIteration throws on missing nullable keys (not just null values) | VERIFIED | `!(f in (iteration ?? {}))` check with "(null permitted)" error suffix |
| 28 | appendLlmIteration still rejects null on non-null fields (existing strictness) | VERIFIED | `=== undefined \|\| === null` check preserved for REQUIRED_NONNULL_FIELDS |
| 29 | All existing tests pass (no regressions) | VERIFIED | `npm run test:src` = 471 passed, 28 test files |
| 30 | lint exits 0 (no new errors) | VERIFIED | exit code 0; 2 pre-existing warnings on settings.js (not Phase 33) |
| 31 | _verify-phase33-callsites.mjs exits 0 | VERIFIED | "OK: all 6 call sites contain all 4 keys" |
| 32 | Schema test has schema_version and 4-keys presence assertions (D-15) | VERIFIED | `grep -c "schema_version: 1 at top level"` = 2; `grep -c "every iteration has 4 capture-state keys present"` = 1 |

**Score:** 32/32 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/rerun-validator.js` | Pure-function validator: runValidator, computeVerdict, isEligibleForReplay, emptyRerunReport, atomicWriteJson | VERIFIED | 253 lines; all 5 exports confirmed; no src/ imports; EXDEV fallback inlined |
| `tests/unit/rerun-validator.test.js` | 13+ unit tests for all verdict paths | VERIFIED | 591 lines; 15 `it(` calls covering CONFIRMED 3/3, CONFIRMED 2/3, FLAKE 1/3, FLAKE 0/3, NOT_REPLAYABLE, EXDEV, schema, spy counts, WR-01 throw test |
| `scripts/e2e-rerun-validator.mjs` | CLI shim: parseArgs, newest-by-mtime default, wires real deps | VERIFIED | 205 lines (>= 80 minimum); isMain guard present; imports runValidator from rerun-validator.js |
| `tests/e2e/scripts/e2e-rerun-validator.test.js` | spawnSync integration tests covering exit codes, UAT smoke | VERIFIED | 151 lines (>= 100 minimum); 3 spawnSync calls; UAT fixture smoke present |
| `package.json` | New e2e:rerun-validator script | VERIFIED | `"e2e:rerun-validator": "node scripts/e2e-rerun-validator.mjs"` |
| `eslint.config.js` | Per-file no-restricted-imports block for rerun-validator.js | VERIFIED | `files: ['tests/e2e/lib/rerun-validator.js']` block at lines 82-100 |
| `tests/e2e/scripts/e2e-lint-rerun-guard.test.js` | Lint-guard smoke test with try/finally restore | VERIFIED | try/finally + process.once('exit') restore; RERUN-04 assertion present |
| `scripts/e2e-explore.mjs` | D-14 capture block + 6 call sites with 4 new keys | VERIFIED | Capture block at line 433; 5 null-path sites + 1 real-value site; _verify script confirms all 6 |
| `tests/e2e/lib/llm-report.js` | REQUIRED_NONNULL_FIELDS / REQUIRED_NULLABLE_FIELDS split + schema_version in emptyReport | VERIFIED | Split at lines 55 and 66-71; emptyReport stamps schema_version: LLM_REPORT_SCHEMA_VERSION |
| `tests/e2e/fixtures/uat-phase32-llm-report.json` | schema_version: 1 + 4 null-valued capture keys on every iteration | VERIFIED | Node check confirms all 10 iterations have all 4 keys as null; top-level schema_version = 1 |
| `scripts/_migrate-uat-fixture.mjs` | One-shot migration script (idempotent) | VERIFIED | Committed with WR-04 documentation hardening; idempotency guard present |
| `scripts/_verify-phase33-callsites.mjs` | Static analysis script exits 0 | VERIFIED | `node scripts/_verify-phase33-callsites.mjs` = "OK: all 6 call sites contain all 4 keys" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/e2e/lib/rerun-validator.js` | `tests/e2e/lib/pdf-verifier.js` | `import { verifyCitation as realVerifyCitation } from './pdf-verifier.js'` | WIRED | grep confirms import present; sole project import |
| `tests/unit/rerun-validator.test.js` | `tests/e2e/lib/rerun-validator.js` | `import { runValidator, computeVerdict, ... } from '../e2e/lib/rerun-validator.js'` | WIRED | grep confirms 1 occurrence |
| `scripts/e2e-rerun-validator.mjs` | `tests/e2e/lib/rerun-validator.js` | `import { runValidator, atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js'` | WIRED | grep confirms 1 occurrence |
| `tests/e2e/scripts/e2e-rerun-validator.test.js` | `scripts/e2e-rerun-validator.mjs` | `spawnSync('node', [SCRIPT_PATH, ...args])` | WIRED | 3 spawnSync calls confirmed |
| `package.json` | `scripts/e2e-rerun-validator.mjs` | `"e2e:rerun-validator": "node scripts/e2e-rerun-validator.mjs"` | WIRED | grep confirms entry |
| `eslint.config.js` | `tests/e2e/lib/rerun-validator.js` | `files: ['tests/e2e/lib/rerun-validator.js']` | WIRED | Per-file block confirmed present |
| `scripts/e2e-explore.mjs` | `tests/e2e/lib/llm-report.js` | All 6 appendLlmIteration calls carry the 4 new keys | WIRED | _verify-phase33-callsites.mjs exits 0 |

---

### Requirements Coverage

| Requirement | Description | Source Plans | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| RERUN-01 | Re-run validator deterministically replays each LLM-flagged anomaly 3 times via verifier-only path (no browser) | 33-02 (core validator), 33-04 (CLI) | SATISFIED | runValidator 3-replay loop; CLI wires real verifyCitation; unit tests spy.callCount === 3*N; no browser dependency |
| RERUN-02 | rerun-report.json with {confirmed_count, total_runs, verdict}; 2/3+ → CONFIRMED, 0-1/3 → FLAKE | 33-02 | SATISFIED | computeVerdict uses `>= 2` threshold; D-09/D-10 shapes confirmed in output; UAT smoke produces valid rerun-report.json with 10 NOT_REPLAYABLE entries |
| RERUN-03 | llm-report.json iteration schema extended with scroll_y, viewport_width, viewport_height, selected_node_xpath | 33-01 (schema), 33-03 (capture) | SATISFIED | REQUIRED_NULLABLE_FIELDS in llm-report.js; D-14 capture block in e2e-explore.mjs; all 6 call sites carry all 4 keys; UAT fixture re-stamped with null values |
| RERUN-04 | ESLint no-restricted-imports src/ guard extended to rerun-validator module | 33-05 | SATISFIED | Per-file block `files: ['tests/e2e/lib/rerun-validator.js']` in eslint.config.js with RERUN-04 message; lint-guard smoke test proves rule fires on violation |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npm run test:src` | 471 passed, 28 test files | PASS |
| Lint exits 0 | `npm run lint` | exit code 0 (2 pre-existing warnings on settings.js, 0 errors) | PASS |
| Call-site verifier | `node scripts/_verify-phase33-callsites.mjs` | "OK: all 6 call sites contain all 4 keys" | PASS |
| UAT fixture end-to-end | `npm run e2e:rerun-validator -- --input tests/e2e/fixtures/uat-phase32-llm-report.json` | schema_version:1, not_replayable_count:10, replays:10 | PASS |
| No _clearParsedCache | `grep -c "_clearParsedCache" tests/e2e/lib/rerun-validator.js` | 0 | PASS |
| Inclusive threshold | `grep -E "confirmedCount >= 2" tests/e2e/lib/rerun-validator.js` | matches line 62 | PASS |
| Per-file ESLint block | `grep -c "files: ['tests/e2e/lib/rerun-validator.js']" eslint.config.js` | 1 | PASS |
| schema_version in llm-report.js | `grep -c "schema_version" tests/e2e/lib/llm-report.js` | 2 | PASS |
| No src/ imports in rerun-validator | `grep -c "from.*src/" tests/e2e/lib/rerun-validator.js` | 0 | PASS |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No `TBD`, `FIXME`, or `XXX` markers found in Phase 33 files. No stubs, no orphaned artifacts, no empty implementations.

---

### Human Verification Required

None. All must-haves are verifiable programmatically.

---

## Gaps Summary

No gaps. All 32 must-haves verified. All 4 requirements (RERUN-01 through RERUN-04) are satisfied by codebase evidence.

**Review findings note:** 4 Warning findings from the code review (WR-01..WR-04) were all addressed before verification:
- WR-01: try/catch wrapping per-replay verifyCitation calls — confirmed in rerun-validator.js lines 193-208
- WR-02: null-safe viewport capture via `vp?.width ?? null` — confirmed in e2e-explore.mjs line 451
- WR-03: schema_version: 1 stamped in emptyReport() — confirmed in llm-report.js line 185
- WR-04: _migrate-uat-fixture.mjs header documentation hardened — confirmed

6 Info findings (IN-01..IN-06) were deferred, none block phase completion.

---

_Verified: 2026-05-26T19:55:00Z_
_Verifier: Claude (gsd-verifier)_

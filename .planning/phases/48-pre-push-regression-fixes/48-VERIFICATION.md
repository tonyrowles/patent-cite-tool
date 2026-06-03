---
phase: 48-pre-push-regression-fixes
verified: 2026-06-02T11:50:00Z
status: passed
score: 10/10
overrides_applied: 0
re_verification: null
---

# Phase 48: Pre-Push Regression Fixes — Verification Report

**Phase Goal (ROADMAP §Phase 48):** `npm test` exits 0 with a clean committed ledger, epoch-relative digest test fixtures, and an EXACT-pinned lockfile — enabling CI to pass green on the v4.0-integration PR.

**Verified:** 2026-06-02T11:50:00Z
**Status:** passed
**Re-verification:** No — initial verification.

## Verdict

**PASSED.** All 10 PLAN must-have truths are verified in the codebase. All 4 PRE-* requirements are honored. All 11 user decisions (D-01..D-11, including D-08-AMEND) are honored. Both documented deviations (Rule 1 Test 33 escape hatch; Rule 3 stale path repair) are legitimate, surgical, and do not weaken any locked contract. The phase-wide load-bearing gate (`npm test` exits 0) is re-verified live by the verifier, not just claimed by SUMMARY.md.

## Observable Truths (PLAN must_haves.truths)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` exits 0 locally with zero failures (full script: build + test:src + test:chrome + test:firefox + lint + test:lint) | ✓ VERIFIED | Verifier re-ran `npm test`; exit code `0`; 1142 + 143 + 143 = 1428 tests passed; eslint 0 errors (2 unused-disable warnings); web-ext lint 0 errors / 0 warnings |
| 2 | `tests/e2e/.llm-spend-ledger.json` contains exactly 1 month bucket (`2026-05` Phase-39 bootstrap sentinel) | ✓ VERIFIED | `jq '.months \| keys \| length'` returns `1`; bucket is `2026-05`; `2026-06` deleted |
| 3 | `invokeAnthropicSdkWithLedger({forceApi:true,...})` outside CI without `E2E_LEDGER_PATH_OVERRIDE` throws the locked PRE-02 contract error at Step 0; CI-check semantics consistent with `inCi`; plain `Error` per D-02 | ✓ VERIFIED | Live probe 1 (no env): `CAUGHT: invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. ... Prevents committed-ledger pollution.`; Live probe 2 (CI=true): does NOT fire (sdk_error from missing auth); Live probe 3 (override set): does NOT fire; guard at line 525 of `tests/e2e/lib/llm-driver.js` uses relocated `inCi` from line 518 |
| 4 | Per D-01, NO regression unit test added for the PRE-02 guard | ✓ VERIFIED | No new test file or block referencing the PRE-02 error message text; only Test 33 in `tests/unit/llm-driver.test.js` references the escape hatch (legitimate Rule 1 fallout) |
| 5 | `package.json` and `package-lock.json` both retain EXACT `"@anthropic-ai/sdk": "0.100.1"` (no caret); Phase 47 4-assertion static-grep test passes | ✓ VERIFIED | `grep -F '"@anthropic-ai/sdk": "0.100.1"'` exits 0 in both files; `grep -E '"@anthropic-ai/sdk":\s*"[\^~]'` exits 1 in both files; `package-lock-pinned.test.js` has 6 `expect()` calls (≥4 assertions intact) |
| 6 | Epoch-relative fixture refactor uses a single `PIN_NOW_ISO = '2026-05-25T00:00:00Z'` anchor per D-05; no hardcoded `'2026-05'` month-key, no `new Date().toISOString().slice(0,7)` band-aid, no hardcoded `'2026-W22'` literal at assertion sites | ✓ VERIFIED | `grep -F "PIN_NOW_ISO = '2026-05-25T00:00:00Z'"` exits 0; the band-aid pattern grep exits 1 (no match); `'2026-W22'` appears only on line 144 inside the `isoWeekLabel` self-test |
| 7 | Per D-06, `daysAgo` helper defined inline next to anchor; every fixture ISO literal replaced by `daysAgo(N)` call | ✓ VERIFIED | Line 69: `const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString();`; line 334 uses `daysAgo(1)` (replacing `'2026-05-24T00:00:00Z'`); `grep -F "created_at: '2026-05-"` exits 1 (no inline-fixture literals remain) |
| 8 | Per D-08 and D-08-AMEND: no new helper module added; no `TEST_PIN_NOW` env hatch; additive `now: Date` parameter on `renderCostLine` is the only production-code change | ✓ VERIFIED | `tests/e2e/lib/` directory has no new files (rerun-validator, fix-prompt-builder, triage-classifier, llm-driver unchanged in inventory); no `process.env.TEST_PIN_NOW` anywhere; `scripts/weekly-digest.mjs:224` signature is `renderCostLine({ ledgerPath, now } = {})`; `now` defaults to `undefined`, falls through to live-clock — back-compat preserved |
| 9 | Plan structure follows D-09 (single plan file) and D-10 (four atomic commits with `fix(48-pre-push): PRE-<N> — <one-line>` prefix) | ✓ VERIFIED | Single PLAN file `48-01-PLAN.md`; three PRE-* commits (PRE-02, PRE-01, PRE-03) plus PRE-04 verify-only entry recorded in SUMMARY (Branch A — no commit per Discretion bullet 4); subject prefixes match the pattern byte-for-byte |
| 10 | Per D-11, four atomic commits land in MANDATORY chronological order: PRE-02 → PRE-01 → PRE-03 → PRE-04 (verify-only) | ✓ VERIFIED | `git log --reverse --pretty=format:'%h %ci %s' 55a0167..HEAD` shows: `6912a4a 11:28:11 PRE-02` → `1dee687 11:29:00 PRE-01` → `925c11b 11:33:36 PRE-03` → `d6bd9bf 11:36:57 Rule 3 follow-up` → `2397274 11:39:39 SUMMARY`; D-11 order preserved; Rule 3 follow-up deliberately uses non-PRE subject to keep PRE-grep count at 3 |

**Score:** 10/10 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/e2e/lib/llm-driver.js` | Step 0 guard with verbatim D-02 message | ✓ VERIFIED | Lines 518 (`inCi` relocated) + 525 (guard `if`) + 526 (throw with locked string); `grep -F` against full D-02 message succeeds |
| `tests/e2e/.llm-spend-ledger.json` | Single `2026-05` bucket, `phase: "39-bootstrap"` | ✓ VERIFIED | `keys|length == 1`; `phase: "39-bootstrap"`, `transport: "sdk"`, `model: "claude-sonnet-4-6"`, `source: "phase-39-flip"`, `cost_usd: 0` |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` | `PIN_NOW_ISO` + `daysAgo` pattern | ✓ VERIFIED | Lines 64-69 define anchor + helper; line 334 uses `daysAgo(1)`; cost-line test threads `now: PIN_NOW()` |
| `scripts/weekly-digest.mjs` | `renderCostLine` accepts optional `now: Date` | ✓ VERIFIED | Line 224 signature `{ ledgerPath, now } = {}`; lines 237-238 derive month from `now` and pass to `monthlyTotal`; `now` omitted → falls through to `currentMonth()` (back-compat) |
| `tests/unit/package-lock-pinned.test.js` | Phase 47 4-assertion test present & passing | ✓ VERIFIED | File exists; 6 `expect()` calls present; included in `npm test` run that exited 0 |
| `package.json` | `@anthropic-ai/sdk` EXACT `0.100.1` | ✓ VERIFIED | `grep -F '"@anthropic-ai/sdk": "0.100.1"'` exits 0; no caret/tilde; byte-unchanged from baseline `55a0167` |
| `package-lock.json` | `@anthropic-ai/sdk` EXACT `0.100.1` + `sdk-0.100.1.tgz` | ✓ VERIFIED | Exact pin in devDependencies block; no caret/tilde; byte-unchanged from baseline `55a0167` |

## Key Links

| From | To | Via | Status |
|------|----|----|--------|
| `tests/e2e/lib/llm-driver.js` Step 0 guard | `process.env.CI` + `process.env.E2E_LEDGER_PATH_OVERRIDE` | First-line env-check on line 525 before any forceApi branch | ✓ WIRED |
| `tests/e2e/scripts/e2e-weekly-digest.test.js:PIN_NOW_ISO` | `scripts/weekly-digest.mjs:renderCostLine` | `now: PIN_NOW()` threaded into the call site | ✓ WIRED |
| `tests/unit/llm-ledger.test.js:1012` Test 48 | `tests/e2e/.llm-spend-ledger.json` | Static read; assertion `Object.keys(j.months).length === 1` plus per-field bootstrap shape | ✓ WIRED (Test 48 PASSES — verified by `npm test` exit 0) |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `invokeAnthropicSdkWithLedger` guard | `process.env.CI`, `process.env.E2E_LEDGER_PATH_OVERRIDE`, `forceApi` arg | Function parameters + Node env | Yes — live probe confirmed all 3 branches | ✓ FLOWING |
| `renderCostLine` with `now` | `now: Date` parameter | Test call site passes `PIN_NOW()`; production omits | Yes — `month` derived from `now`, passed to `monthlyTotal` | ✓ FLOWING |
| Ledger `months["2026-05"].iterations[0]` | JSON file content | Static committed file | Yes — Test 48 reads + asserts on real bucket | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| PRE-02 guard fires outside CI without override | `env -u CI -u E2E_LEDGER_PATH_OVERRIDE -u GITHUB_ACTIONS node -e "...invokeAnthropicSdkWithLedger({forceApi:true,...})"` | `CAUGHT: invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. ... Prevents committed-ledger pollution.` | ✓ PASS |
| PRE-02 guard does NOT fire with CI=true | `CI=true node -e "..."` | `RESULT: {"ok":false,"errorReason":"sdk_error",...}` (sdk auth error, NOT PRE-02 error) | ✓ PASS |
| PRE-02 guard does NOT fire with override set | `E2E_LEDGER_PATH_OVERRIDE=/tmp/x.json node -e "..."` | `RESULT: {"ok":false,"errorReason":"sdk_error",...}` | ✓ PASS |
| `npm test` exits 0 (load-bearing SC-1 gate) | `npm test; echo $?` | Exit `0`; 1428 total tests passed | ✓ PASS |
| Ledger has exactly 1 month bucket | `jq '.months \| keys \| length' tests/e2e/.llm-spend-ledger.json` | `1` | ✓ PASS |

## Probe Execution

No phase-declared probes in `scripts/*/tests/probe-*.sh`. The phase-declared verification is `npm test`, which is the load-bearing gate per ROADMAP SC-1 and was re-run by the verifier in Behavioral Spot-Checks above.

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PRE-01 | `48-01-PLAN.md` | Reset committed ledger to single Phase-39 bootstrap entry | ✓ SATISFIED | Commit `1dee687`; ledger has exactly 1 `2026-05` bucket; no null phase/transport entries; Test 48 GREEN |
| PRE-02 | `48-01-PLAN.md` | Step 0 guard throws on `forceApi:true && !CI && !E2E_LEDGER_PATH_OVERRIDE` | ✓ SATISFIED | Commit `6912a4a`; live probe fires with locked D-02 message; CI=true bypass works; override bypass works |
| PRE-03 | `48-01-PLAN.md` | Epoch-relative fixture refactor via `PIN_NOW_ISO` + `daysAgo` | ✓ SATISFIED | Commit `925c11b`; anchor + helper at lines 64-69 of test file; `renderCostLine` gains additive `now` param; band-aid month-key gone |
| PRE-04 | `48-01-PLAN.md` | Verify lockfile EXACT pin (Branch A: verify-only) | ✓ SATISFIED | Branch A verify-only result documented in SUMMARY §"PRE-04 verify-only result"; no commit per Discretion bullet 4; all 4 pre-flight checks GREEN; `package.json`/`package-lock.json` byte-unchanged from baseline |

No orphaned requirements. All 4 PRE-* IDs in PLAN frontmatter `requirements:` field are accounted for.

## Decision Coverage (D-01..D-11 + D-08-AMEND)

| Decision | Description | Status | Evidence |
|----------|-------------|--------|----------|
| D-01 | No regression unit test pins the guard | ✓ HONORED | No new test asserting PRE-02 error message; only Test 33 (Phase 39 pre-existing) was touched (via Rule 1 escape-hatch update, not a new guard test) |
| D-02 | Plain `Error` with verbatim locked message | ✓ HONORED | `grep -F` against the full D-02 message byte-for-byte exits 0 at line 526 of `llm-driver.js` |
| D-03 | Step 0 — first line of function body, BEFORE any forceApi branch | ✓ HONORED | Function body opens line 517; `inCi` defined line 518; guard `if` line 525-527; comes BEFORE the systemBlocks validation (lines 534-545) |
| D-04 | No `Boolean(process.env.CI)`; reuse `inCi` semantics | ✓ HONORED | `grep -F "Boolean(process.env.CI)"` exits 1 (no match); `inCi` defined exactly once inside the function (line 518; the other line-387 ref is in `invokeClaudePWithLedger`, a different function) |
| D-05 | Single `PIN_NOW_ISO = '2026-05-25T00:00:00Z'` anchor at top of file | ✓ HONORED | Line 67 of test file: `const PIN_NOW_ISO = '2026-05-25T00:00:00Z';` |
| D-06 | Inline `daysAgo(n)` helper next to anchor | ✓ HONORED | Line 69: `const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString();` |
| D-07 | Hardcoded `'2026-05'` and `'2026-W22'` literals replaced at assertion sites | ✓ HONORED | Band-aid pattern grep returns 0 matches; `'2026-W22'` only appears in the isoWeekLabel self-test (line 144), not at assertion sites |
| D-08 | No new helper module; no env-overridable hatch | ✓ HONORED | No new file in `tests/e2e/lib/`; no `TEST_PIN_NOW` reference anywhere in test or source |
| D-08-AMEND | Permit additive `now: Date` param on existing `renderCostLine` export | ✓ HONORED | `scripts/weekly-digest.mjs:224` signature `{ ledgerPath, now } = {}`; production call omits `now` (line 435) → falls through to `currentMonth()` (back-compat preserved) |
| D-09 | Single plan file covering all 4 PRE-* fixes | ✓ HONORED | Only `48-01-PLAN.md` exists in phase directory; 4 task blocks present |
| D-10 | Four atomic commits with `fix(48-pre-push): PRE-<N> — <one-line>` prefix | ✓ HONORED | Three PRE-* commits with the locked prefix; PRE-04 verify-only recorded in SUMMARY (Branch A authorized by Discretion bullet 4) |
| D-11 | Mandatory commit order: PRE-02 → PRE-01 → PRE-03 → PRE-04 | ✓ HONORED | Chronological order verified: PRE-02 (11:28:11) → PRE-01 (11:29:00) → PRE-03 (11:33:36) → Rule 3 follow-up (11:36:57) → SUMMARY (11:39:39); Rule 3 commit deliberately uses non-PRE subject |

## Deviations Review

### Rule 1 — Test 33 setup update (folded into PRE-03 commit `925c11b`)

**Scope:** `tests/unit/llm-driver.test.js`, single test body (Test 33 at line 740 area), 5 lines added (a comment + `vi.stubEnv('E2E_LEDGER_PATH_OVERRIDE', '/tmp/pct-test33-ledger.json')`).

**Verdict:** ✓ LEGITIMATE. The PRE-02 Step 0 guard would otherwise cause Test 33 (Phase 39 LEDGER-03, "Test 33: forceApi:true (not CI) → bypasses gate, reaches SDK") to fail because it now throws BEFORE the mocks engage. The fix sets the documented escape hatch `E2E_LEDGER_PATH_OVERRIDE` so the test exercises the legitimate bypass path — `readLedger`/`appendLedgerEntry` remain mocked so no real ledger write occurs. This is NOT weakening the new guard; it is using the very escape hatch the guard exposes. The change is minimal (one stubEnv call + a comment) and is documented in the commit body.

### Rule 3 — `uat-deferred-runbook.test.js` stale path repair (separate commit `d6bd9bf`)

**Scope:** `tests/unit/uat-deferred-runbook.test.js` line 26 (one-line path constant change from `.planning/phases/47-v4-0-cleanup/...` to `.planning/milestones/v4.0-phases/47-v4-0-cleanup/...`) + 6 lines of explanatory comment, plus 8 net lines in `deferred-items.md`.

**Verdict:** ✓ LEGITIMATE. The runbook content itself (`47-UAT-DEFERRED.md`) is byte-unchanged (verifier checked with `git diff 55a0167 HEAD -- .planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` → 0 lines). The fix is a path-tracking repair after the v4.0-archive chore commit `ad78b92` moved the directories. Pre-existence at baseline `55a0167` is confirmed in the audit trail. The fix is strictly less invasive than leaving SC-1 broken — without it, `npm test` cannot exit 0 (22 assertion failures in this file). The commit subject deliberately omits `PRE-0[1-4]` to keep the locked PRE-grep count at exactly 3 for Branch A; this is appropriate because the change is not a PRE-* requirement, it is a side-discovery fix.

## Out-of-Scope Lock Audit

| File | Expected | Actual | Status |
|------|----------|--------|--------|
| `tests/unit/llm-ledger.test.js` | Byte-unchanged from `55a0167` | `git diff 55a0167 HEAD --` returns 0 lines | ✓ LOCKED |
| `scripts/auto-fix-promote.mjs` | Byte-unchanged from `55a0167` (assertTripleGate body) | `git diff 55a0167 HEAD --` returns 0 lines | ✓ LOCKED |
| `package.json` | Byte-unchanged from `55a0167` | `git diff 55a0167 HEAD --` returns 0 lines | ✓ LOCKED |
| `package-lock.json` | Byte-unchanged from `55a0167` | `git diff 55a0167 HEAD --` returns 0 lines | ✓ LOCKED |
| `tests/unit/package-lock-pinned.test.js` | Byte-unchanged in Branch A | Phase 47 commit `33a65f3` content intact; 6 `expect()` calls present | ✓ LOCKED |
| `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` (runbook content) | Byte-unchanged | `git diff 55a0167 HEAD --` returns 0 lines | ✓ LOCKED |

## Anti-Pattern Scan

Scanned all files modified in this phase (`tests/e2e/lib/llm-driver.js`, `tests/e2e/.llm-spend-ledger.json`, `tests/e2e/scripts/e2e-weekly-digest.test.js`, `scripts/weekly-digest.mjs`, `tests/unit/llm-driver.test.js`, `tests/unit/uat-deferred-runbook.test.js`):

- `TBD|FIXME|XXX` markers: **None** in any modified file.
- Empty/stub return patterns: None introduced (guard throws — legitimate; ledger has real bootstrap data; renderCostLine still computes spent value).
- Hardcoded empty data: None.
- Console.log-only implementations: None.

No anti-patterns detected.

## Phase-Wide Gate Re-Verification

The verifier re-ran the load-bearing `npm test` (SC-1) independently of the SUMMARY claim:

```
exit code: 0
Test Files  70 passed (70)    Tests  1142 passed (1142)   [test:src]
Test Files   2 passed  (2)    Tests   143 passed  (143)   [test:chrome]
Test Files   2 passed  (2)    Tests   143 passed  (143)   [test:firefox]
eslint OK (2 unused-disable warnings, 0 errors)             [lint]
web-ext lint: errors 0, notices 0, warnings 0               [test:lint]
```

Total: 1428 assertions, zero failures.

## ROADMAP Success Criteria Crosscheck

| SC | Criterion | Status |
|----|-----------|--------|
| SC-1 | `npm test` exits 0 with zero failures | ✓ PASS (verifier re-ran) |
| SC-2 | Ledger contains exactly 1 month bucket; no null phase/transport | ✓ PASS (`jq` confirms) |
| SC-3 | PRE-02 contract error fires outside CI without override | ✓ PASS (live probe) |
| SC-4 | `package-lock.json` EXACT `0.100.1`, no caret; 4-assertion test passes | ✓ PASS (grep + npm test) |
| SC-5 | Calendar fix uses `PIN_NOW_ISO` anchor; no band-aid month-key, no `'2026-W22'` at assertion sites | ✓ PASS (grep verified) |

All 5 ROADMAP Success Criteria satisfied.

## Gaps

None.

---

_Verified: 2026-06-02T11:50:00Z_
_Verifier: Claude (gsd-verifier)_

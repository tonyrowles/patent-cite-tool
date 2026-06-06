---
phase: 48-pre-push-regression-fixes
plan: 01
subsystem: e2e-test-suite
tags: [ledger-leak, calendar-determinism, lockfile-pin, regression-fixes]
requires:
  - tests/e2e/.llm-spend-ledger.json (committed Phase-39 bootstrap state)
  - tests/unit/package-lock-pinned.test.js (Phase 47 INT-FIX-LOCK 4-assertion static-grep)
  - scripts/weekly-digest.mjs renderCostLine export
provides:
  - structural defense against committed-ledger pollution from local forceApi:true SDK calls
  - epoch-relative deterministic fixture pattern for e2e-weekly-digest.test.js
  - additive `now: Date` parameter on renderCostLine (back-compat preserved)
affects:
  - Test 48 (tests/unit/llm-ledger.test.js:1012) — now GREEN
  - All e2e-weekly-digest assertions — calendar-rollover proof via PIN_NOW_ISO anchor
tech-stack:
  added: []
  patterns:
    - "epoch-relative fixture derivation (PIN_NOW_ISO + daysAgo helper)"
    - "Step 0 leak guards at first line of function body"
key-files:
  created:
    - .planning/phases/48-pre-push-regression-fixes/deferred-items.md
  modified:
    - tests/e2e/lib/llm-driver.js (PRE-02 Step 0 guard)
    - tests/e2e/.llm-spend-ledger.json (PRE-01 reset to single bootstrap)
    - tests/e2e/scripts/e2e-weekly-digest.test.js (PRE-03 anchor refactor)
    - scripts/weekly-digest.mjs (PRE-03 additive `now` param on renderCostLine)
    - tests/unit/llm-driver.test.js (Rule 1 — Test 33 setup for PRE-02 escape hatch)
    - tests/unit/uat-deferred-runbook.test.js (Rule 3 — stale path repair for SC-1)
decisions:
  - "Test 33 (Phase 39 LEDGER-03): set E2E_LEDGER_PATH_OVERRIDE in the test to exercise PRE-02's legitimate escape hatch rather than weakening the new guard"
  - "uat-deferred-runbook.test.js stale-path repaired inline as Rule 3 SC-1 blocker fix; runbook content byte-unchanged"
  - "PRE-04 verify-only — all four pre-flight checks GREEN; no commit per Discretion bullet 4"
metrics:
  duration: ~12 minutes
  completed_date: 2026-06-02
---

# Phase 48 Plan 01: Pre-Push Regression Fixes Summary

Four surgical fixes in mandatory D-11 order restore `npm test` to exit 0 locally so the v4.0-integration PR (Phase 49) can pass CI green. The structural PRE-02 guard at the head of `invokeAnthropicSdkWithLedger` is the load-bearing fix — closes the only known committed-ledger leak vector. PRE-01 reset, PRE-03 epoch refactor, PRE-04 verify-only round out the four PRE-* requirements.

## PRE-02 — Step 0 guard in `invokeAnthropicSdkWithLedger`

**Commit:** `6912a4a` — `fix(48-pre-push): PRE-02 — block forceApi:true ledger writes outside CI without E2E_LEDGER_PATH_OVERRIDE`

**Files changed:** `tests/e2e/lib/llm-driver.js` (+11 lines / -2 lines)

Relocated the existing `const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'` definition from line 538 to the first line of the function body, then inserted the PRE-02 Step 0 guard BEFORE the existing systemBlocks validation:

```js
if (forceApi === true && !inCi && !process.env.E2E_LEDGER_PATH_OVERRIDE) {
  throw new Error('invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. Set E2E_LEDGER_PATH_OVERRIDE=<tmpfile> to redirect ledger writes, or run inside CI. Prevents committed-ledger pollution.');
}
```

The error message is locked verbatim per D-02 — byte-for-byte match verified by `grep -F`. CI-check semantics consistent with existing line-538 logic (D-04 — no `Boolean(process.env.CI)`).

**Verification — live throw probes:**

| Env | Expected | Actual |
|-----|----------|--------|
| `-u CI -u E2E_LEDGER_PATH_OVERRIDE -u GITHUB_ACTIONS`, `forceApi:true` | guard fires; PRE-02 error string | PASS — `CAUGHT: invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI without E2E_LEDGER_PATH_OVERRIDE. ... Prevents committed-ledger pollution.` |
| `CI=true`, `forceApi:true` | guard does NOT fire (other errors OK) | PASS — `{"ok":false,"errorReason":"sdk_error","errorMessage":"Could not resolve authentication method..."}` |
| `E2E_LEDGER_PATH_OVERRIDE=/tmp/test.json`, `forceApi:true` | guard does NOT fire | PASS — `{"ok":false,"errorReason":"sdk_error",...}` |

**Verification — automated grep checks:**
- `grep -F "invokeAnthropicSdkWithLedger: forceApi:true blocked outside CI"` → PASS
- `grep -F "Prevents committed-ledger pollution."` → PASS
- `grep -F "Boolean(process.env.CI)"` → not found (PASS — D-04 lock)
- `grep -nE "if\s*\(\s*forceApi\s*===\s*true\s*&&\s*!\s*inCi\s*&&\s*!\s*process\.env\.E2E_LEDGER_PATH_OVERRIDE"` → PASS (line 525)
- Within `invokeAnthropicSdkWithLedger`: exactly one `inCi` definition (the relocated line at function-body line 1)

Per D-01, no regression unit test is pinned for the guard — the surgical commit is the guard alone. Test 48 catches downstream pollution; the contract-error message text is self-documenting.

## PRE-01 — Reset committed ledger to Phase-39 single-bootstrap entry

**Commit:** `1dee687` — `fix(48-pre-push): PRE-01 — reset committed ledger to Phase-39 single-bootstrap entry`

**Files changed:** `tests/e2e/.llm-spend-ledger.json` (+1 / -49)

Removed the entire `2026-06` month bucket (4 leaked `claude-opus-4-7[1m]` entries with `phase: null, transport: null` from a local executor run that bypassed `E2E_LEDGER_PATH_OVERRIDE`, totalling $0.451461). Preserved the Phase-39 bootstrap entry at iso `2026-05-31T16:03:31.594Z` byte-for-byte to maintain audit-trail continuity with the original Phase 39 seed commit.

**Final state:** exactly one month bucket, one iteration, all Test 48 schema-plus-state assertions GREEN.

**Verification:**
```
$ jq '.months | keys | length' tests/e2e/.llm-spend-ledger.json
1
$ jq -r '.months["2026-05"].iterations[0].phase' tests/e2e/.llm-spend-ledger.json
39-bootstrap
$ jq -r '.months["2026-05"].iterations[0].transport' tests/e2e/.llm-spend-ledger.json
sdk
$ jq '[.months[].iterations[] | select(.phase == null or .transport == null)] | length' tests/e2e/.llm-spend-ledger.json
0
$ npx vitest run tests/unit/llm-ledger.test.js
✓ tests/unit/llm-ledger.test.js (61 tests) 141ms
  Test Files  1 passed (1)  Tests  61 passed (61)
```

Combined jq `-e` from the plan's `<verify><automated>` block returned `true`.

## PRE-03 — Epoch-relative fixture refactor in `e2e-weekly-digest.test.js`

**Commit:** `925c11b` — `fix(48-pre-push): PRE-03 — anchor digest test to PIN_NOW_ISO with daysAgo derivation`

**Files changed:** `tests/e2e/scripts/e2e-weekly-digest.test.js`, `scripts/weekly-digest.mjs`, plus `tests/unit/llm-driver.test.js` (Rule 1 fallout — see below) and `.planning/phases/48-pre-push-regression-fixes/deferred-items.md`.

**Part A — anchor and helper (D-05/D-06/D-08):**

```js
const PIN_NOW_ISO = '2026-05-25T00:00:00Z';
const PIN_NOW = () => new Date(PIN_NOW_ISO);
const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString();
```

The factory form of `PIN_NOW` is retained (Discretion bullet 3) — safer default for callers that may construct fresh `Date` instances.

**Part B — additive `now` param on `renderCostLine` (D-08-AMEND):**

```js
export function renderCostLine({ ledgerPath, now } = {}) {
  // ... fs.existsSync check unchanged ...
  const month = now ? now.toISOString().slice(0, 7) : undefined;
  const spent = monthlyTotal(readLedger(effectivePath), month);
  // ...
}
```

The production call site at line 435 omits `now`, preserving live-clock behavior — no behavior change in production. Only the test at line 393 threads `now: PIN_NOW()` so the lookup hits the seeded bucket deterministically.

**Part C — assertion-site and fixture literal replacements:**

| Location | Before | After |
|----------|--------|-------|
| Test "five aggregations present" weekLabel | `'2026-W22'` | `isoWeekLabel(PIN_NOW())` |
| Test "≤50 lines" weekLabel | `'2026-W22'` | `isoWeekLabel(PIN_NOW())` |
| CR-02 fixture issue 999 `created_at` | `'2026-05-24T00:00:00Z'` | `daysAgo(1)` |
| Cost-line test ledger month-key | `[new Date().toISOString().slice(0, 7)]` (Phase 47 band-aid) | `[PIN_NOW_ISO.slice(0, 7)]` |
| Cost-line test renderCostLine call | `({ ledgerPath: tmpLedger })` | `({ ledgerPath: tmpLedger, now: PIN_NOW() })` |

The isoWeekLabel self-tests at lines 130/134/137-139 are LEFT UNTOUCHED — they assert hardcoded calendar facts that would be destroyed by refactoring to `daysAgo()`.

**Verification — automated grep checks:**
- `grep -F "PIN_NOW_ISO = '2026-05-25T00:00:00Z'"` → PASS
- `grep -nF "daysAgo"` → 3 lines (anchor comment, definition, call site)
- `grep -nE "renderCostLine\(\{[^}]*now"` → PASS (line 224)
- `grep -nE "^\s*\[new Date\(\)\.toISOString\(\)\.slice\(0, *7\)\]"` → 0 matches (band-aid gone)
- `grep -nF "'2026-W22'"` → 1 match, inside the isoWeekLabel self-test only
- `grep -nF "created_at: '2026-05-"` → 0 matches (replaced by `daysAgo(1)`)
- `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` → 25 / 25 PASS

### PRE-03 Rule 1 fallout — Test 33 in `tests/unit/llm-driver.test.js`

PRE-02's Step 0 guard (committed in `6912a4a`) caused Phase 39 LEDGER-03 Test 33 to fail. The test exercises `forceApi:true` outside CI, mocking `readLedger`/`appendLedgerEntry` — but PRE-02 throws BEFORE the mocks engage.

**[Rule 1 - Bug]** fix applied inline in the PRE-03 commit: added `vi.stubEnv('E2E_LEDGER_PATH_OVERRIDE', '/tmp/pct-test33-ledger.json')` to Test 33 so it uses the documented escape hatch. No real ledger write occurs because `readLedger`/`appendLedgerEntry` remain mocked.

```
$ npx vitest run tests/unit/llm-driver.test.js
✓ tests/unit/llm-driver.test.js (44 tests) 76ms
  Tests  44 passed (44)
```

This is documented in the commit body of `925c11b`.

## PRE-04 verify-only result

**Branch A path:** all four pre-flight checks GREEN at execution time — no commit, no file change. Result recorded here per Discretion bullet 4 in CONTEXT.md.

| # | Check | Result |
|---|-------|--------|
| 1 | `tests/unit/package-lock-pinned.test.js` exists; `git log --oneline -- ...` shows Phase 47 commit `33a65f3` | PASS |
| 2 | `grep -F '"@anthropic-ai/sdk": "0.100.1"' package.json` exits 0; `grep -E '"@anthropic-ai/sdk":\s*"[\^~]' package.json` exits 1 | PASS — exact pin, no caret/tilde |
| 3 | `grep -F '"@anthropic-ai/sdk": "0.100.1"' package-lock.json` exits 0; `grep -F 'sdk-0.100.1.tgz' package-lock.json` exits 0 | PASS — exact pin + resolved-URL substring |
| 4 | `npx vitest run tests/unit/package-lock-pinned.test.js` exits 0 with 4 / 4 passing | PASS |

**No code commit created for PRE-04 — Branch A as authorized.**

## Rule 3 follow-up — uat-deferred-runbook.test.js stale path repair

**Commit:** `d6bd9bf` — `fix(48-pre-push): repair stale test-path reference blocking SC-1`

**Files changed:** `tests/unit/uat-deferred-runbook.test.js` (+8 / -1), `.planning/phases/48-pre-push-regression-fixes/deferred-items.md` (+5 / -8)

Found during PRE-04 phase-wide `npm test` gate. The chore commit `ad78b92 chore: archive v4.0 phase directories` moved Phase 47 directories to `.planning/milestones/v4.0-phases/` but did not update the static-grep test at `tests/unit/uat-deferred-runbook.test.js:26`. `readFileSync` returned `''` and all 22 assertions failed.

Pre-existence verified at the leak-snapshot baseline `55a0167` (Phase 48 starting point):
```
$ git show 55a0167:.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md
fatal: path '.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md' does not exist in '55a0167'
```

**[Rule 3 - Blocking]** fix applied: one-line path update to track the archive. Runbook content byte-unchanged. Without this fix, SC-1 (`npm test` exit 0) cannot be satisfied regardless of how clean PRE-01/02/03/04 are. The subject deliberately does NOT use `PRE-0[1-4]` to keep the locked subject grep count at exactly 3 PRE-* commits (Branch A expected count). Full audit trail in `deferred-items.md`.

```
$ npx vitest run tests/unit/uat-deferred-runbook.test.js
✓ tests/unit/uat-deferred-runbook.test.js (22 tests) 3ms
  Tests  22 passed (22)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 33 (Phase 39 LEDGER-03) — PRE-02 fallout in tests/unit/llm-driver.test.js**
- **Found during:** PRE-03 broader-test smoke check after PRE-02 landed
- **Issue:** Test 33 called `invokeAnthropicSdkWithLedger({forceApi:true,...})` outside CI without setting `E2E_LEDGER_PATH_OVERRIDE`, expecting it to bypass the gate (Phase 39 contract). PRE-02's Step 0 guard correctly throws first.
- **Fix:** Added `vi.stubEnv('E2E_LEDGER_PATH_OVERRIDE', '/tmp/pct-test33-ledger.json')` to Test 33 to use the documented escape hatch. `readLedger`/`appendLedgerEntry` remain mocked so no real ledger write occurs.
- **Files modified:** `tests/unit/llm-driver.test.js` (single test body)
- **Commit:** `925c11b` (folded into PRE-03 to keep commit count within D-10 max)

**2. [Rule 3 - Blocking] tests/unit/uat-deferred-runbook.test.js stale path reference**
- **Found during:** PRE-04 phase-wide `npm test` gate
- **Issue:** Test reads `.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` but the v4.0-archive chore commit `ad78b92` moved the file under `.planning/milestones/v4.0-phases/`. Pre-existing at baseline `55a0167` — not caused by Phase 48. 22 assertion failures block SC-1.
- **Fix:** One-line path update; runbook content byte-unchanged. Inline comment documents the [Rule 3] deviation.
- **Files modified:** `tests/unit/uat-deferred-runbook.test.js` (line 26 path constant + above-comment)
- **Commit:** `d6bd9bf`

### Non-deviations (planned scope)

PRE-01, PRE-02, PRE-03 executed exactly per plan. PRE-04 Branch A verify-only as authorized.

## Phase-wide Gate — `npm test`

**Final exit code:** `0` (zero failures)

```
> npm run build && npm run test:src && npm run test:chrome && npm run test:firefox && npm run lint && npm run test:lint

  [build] OK
  [test:src]  Test Files  70 passed (70)   Tests  1142 passed (1142)
  [test:chrome] Test Files  2 passed (2)   Tests  143 passed (143)
  [test:firefox] Test Files  2 passed (2)  Tests  143 passed (143)
  [lint]  eslint OK (2 unused-disable warnings, not errors)
  [test:lint] web-ext lint  errors 0  notices 0  warnings 0
```

**Total assertions:** 1428 across all test suites — zero failures, zero errors. Phase 48 SC-1 satisfied.

## D-11 commit-order verification

```
$ git log --oneline -4
d6bd9bf fix(48-pre-push): repair stale test-path reference blocking SC-1
925c11b fix(48-pre-push): PRE-03 — anchor digest test to PIN_NOW_ISO with daysAgo derivation
1dee687 fix(48-pre-push): PRE-01 — reset committed ledger to Phase-39 single-bootstrap entry
6912a4a fix(48-pre-push): PRE-02 — block forceApi:true ledger writes outside CI without E2E_LEDGER_PATH_OVERRIDE
```

Locked D-11 sequence preserved: PRE-02 → PRE-01 → PRE-03 → (PRE-04 verify-only, no commit) → Rule 3 follow-up.

Locked subject grep — `^fix\(48-pre-push\): PRE-0[1-4] —` returns exactly **3** PRE-* commits (Branch A expected count).

## Audit checks (paranoia gate)

| Check | Result |
|-------|--------|
| `tests/unit/llm-ledger.test.js` byte-unchanged from `55a0167` | PASS |
| `scripts/auto-fix-promote.mjs` byte-unchanged from `55a0167` (assertTripleGate locked) | PASS |
| `package.json` byte-unchanged from `55a0167` (sdk pin) | PASS |
| `package-lock.json` byte-unchanged from `55a0167` (sdk pin + tgz substring) | PASS |
| All files modified are within plan `files_modified` OR documented as Rule 1/3 auto-fixes | PASS |

## Success Criteria Crosscheck

1. `npm test` exits 0 with zero failures — **PASS**
2. `tests/e2e/.llm-spend-ledger.json` exactly 1 month bucket; no null phase/transport — **PASS**
3. PRE-02 contract error fires outside CI without override — **PASS** (live probe)
4. `package-lock.json` retains EXACT `0.100.1` no caret; 4-assertion test passes — **PASS**
5. Calendar fix uses `PIN_NOW_ISO = '2026-05-25T00:00:00Z'` anchor; no band-aid month-key — **PASS**
6. Three PRE-* atomic commits in D-11 order — **PASS** (Branch A; plus 1 Rule 3 follow-up commit)
7. Locked invariants byte-unchanged — **PASS**
8. PRE-04 verification recorded — **PASS** (this document, Branch A path)

## Self-Check: PASSED

Files verified present:
- `.planning/phases/48-pre-push-regression-fixes/48-01-SUMMARY.md` (this file)
- `.planning/phases/48-pre-push-regression-fixes/deferred-items.md`

Commits verified in `git log --all`:
- `6912a4a` PRE-02
- `1dee687` PRE-01
- `925c11b` PRE-03
- `d6bd9bf` SC-1 Rule 3 repair

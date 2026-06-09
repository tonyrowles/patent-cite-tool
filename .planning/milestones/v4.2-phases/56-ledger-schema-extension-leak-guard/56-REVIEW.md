---
phase: 56-ledger-schema-extension-leak-guard
reviewed: 2026-06-04T15:30:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/auto-fix.mjs
  - tests/unit/auto-fix.test.js
  - tests/unit/llm-ledger.test.js
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 56: Code Review Report (iteration 2 re-review)

**Reviewed:** 2026-06-04T15:30:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** clean

## Summary

All six in-scope findings from `56-REVIEW.iter2.md` (2 BLOCKER + 4 WARNING; the 3 INFO findings IN-01/IN-02/IN-03 were deferred per `--fix` default scope and explicitly excluded from this re-review per the orchestrator brief) are resolved in commits `4bb47cc..0b126a1` on `main`. No new BLOCKER or WARNING-class defects surfaced during the re-scan. Both Vitest suites pass under the two empirically load-bearing environments:

- `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` → 103/103 pass.
- `CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js` → 42/42 pass (the original CR-01 symptom: pre-fix produced "18 failed | 24 passed").

Load-bearing invariants verified unchanged from base `1b9f615`:
- `tests/e2e/lib/llm-ledger.js` and `.github/workflows/v40-auto-fix.yml` are byte-identical to base (`git diff 1b9f615 -- ...` returns empty).
- `safeAppendLedger` remains module-internal (no `export` keyword).
- The module-level `MODEL` constant is untouched (Phase 60 owns CLEAN-01 per orchestrator brief).
- No `outcome` / `pr_merged` ledger fields added (Phase 58 territory).

## Finding-by-finding verification

### CR-01 — file-level CI snapshot so safeAppendLedger passes locally — RESOLVED

**Commit:** `4bb47cc`
**Files:** `tests/unit/auto-fix.test.js`

Verified at `tests/unit/auto-fix.test.js:250-258`:
```js
let __savedCI;
beforeAll(() => { __savedCI = process.env.CI; process.env.CI = 'true'; });
afterAll(() => {
  if (__savedCI === undefined) delete process.env.CI;
  else process.env.CI = __savedCI;
});
```

Snapshot-and-restore semantics are correct. Empirical check: `CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js` now reports 42/42 pass (pre-fix: 18 failed | 24 passed). The LEDGER-04 test at the bottom of the file still has its own `try/finally { delete process.env.CI; }`; because LEDGER-04 is the LAST describe block in the file (last `describe` at line 1317; file ends at 1342) and vitest is configured `fileParallelism: false` (`vitest.config.js`) with no `it.concurrent` calls in the file, no subsequent test sees the deleted env — and `afterAll` restores the pre-file value from `__savedCI`. CR-01 fully resolved.

### CR-02 — align safeAppendLedger CI guard with canonical form — RESOLVED

**Commit:** `d78bea2`
**Files:** `scripts/auto-fix.mjs`

Verified at `scripts/auto-fix.mjs:155-170`:
```js
const inCi =
  process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const hasOverride =
  typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
  process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
if (!inCi && !hasOverride) { throw new Error(...); }
```

Strict-equality CI check (`=== 'true'`) matches the canonical form at `tests/e2e/lib/llm-driver.js:387,518` and `tests/e2e/lib/llm-ledger.js:86`. `GITHUB_ACTIONS=true` is now accepted as a CI signal. The override is type-checked + trim-and-length checked (mirrors the `llm-ledger.js:74-98` WR-05 IIFE), so a whitespace-only override no longer accidentally opts in. The three originally-broken cases (`CI=false`, `CI=0`, whitespace-only override) are all now refused; `GITHUB_ACTIONS=true` is now accepted. CR-02 fully resolved.

### WR-01 — E2E_LEDGER_PATH_OVERRIDE runtime-opt-in misleading in JSDoc — RESOLVED

**Commit:** `381d08f`
**Files:** `scripts/auto-fix.mjs` (JSDoc only)

Verified at `scripts/auto-fix.mjs:102-116` — the JSDoc now contains an `IMPORTANT — runtime-opt-in caveat` block that explicitly states `E2E_LEDGER_PATH_OVERRIDE` is checked at CALL time but `LEDGER_PATH` is resolved at MODULE LOAD time by the WR-05 IIFE in `tests/e2e/lib/llm-ledger.js:74-98`. The caveat names the workaround (set the env BEFORE the Node process imports `auto-fix.mjs` or any transitive import of `llm-ledger.js`) and explains why the existing `tests/unit/auto-fix.test.js` suite escapes the trap (`vi.mock` stubs BOTH `appendLedgerEntry` AND `LEDGER_PATH`). Documentation-only fix is acceptable for a non-existent integration test surface; the trap is now discoverable by any future integration-test author. WR-01 fully resolved.

### WR-02 — dispatchFlakeState side effects ordered before terminal safeAppendLedger — RESOLVED

**Commit:** `fc88e36`
**Files:** `scripts/auto-fix.mjs`

Verified at `scripts/auto-fix.mjs:377-396` — the helper now pre-flights the CI/override guard at the TOP of `dispatchFlakeState`, BEFORE any of the four side effects can fire (`gh label create`, `gh issue create`, `atomicWriteJson(SUPPRESSION_PATH, ...)`, `execFileSync('node', ['scripts/quarantine-append.mjs', ...])`). The predicate is byte-identical to CR-02's `safeAppendLedger` predicate (same `inCi` + `hasOverride` shape) so the two cannot diverge. The throw message references the CI / override env vars explicitly so the failure mode is self-explanatory at the call site. WR-02 fully resolved.

WR-02 epilogue (`runDispatcher` Step 6 ordering) confirmed safe by the fix doc and re-verified at `scripts/auto-fix.mjs:671-696`: the `safeAppendLedger` call lands BEFORE the `gh issue comment` so a throw aborts before any external side effect — no pre-flight needed there.

### WR-03 — stale line-number references in errorClass annotation comments — RESOLVED

**Commit:** `12ca473`
**Files:** `scripts/auto-fix.mjs`, `tests/unit/auto-fix.test.js`

Verified by `grep -n "line 495\|line 707" scripts/auto-fix.mjs tests/unit/auto-fix.test.js` — returns ZERO matches (was 6+ pre-fix). All five `// LEDGER-01 — in scope from Step 4 (line 495)` comments are replaced with the symbol-anchored form `// LEDGER-01 — errorClass from extractErrorClass(issueJson.labels) in Step 4` (visible at scripts/auto-fix.mjs:682, 729, 826, 849, 887). The two stale `line 707` references in the test file are rewritten as `Step 12 (diff-guard violation) call site` and `at the Step 12 call site` (`tests/unit/auto-fix.test.js:1296, 1326`). Symbol-anchoring survives unrelated line shifts; the future-drift vector noted in REVIEW.iter2 is closed. WR-03 fully resolved.

### WR-04 — dispatchFlakeState hardcoded errorClass: null — RESOLVED

**Commit:** `0b126a1`
**Files:** `scripts/auto-fix.mjs`

Verified at:
- `scripts/auto-fix.mjs:376` — signature: `dispatchFlakeState({ ..., errorClass = null, now = ... })` adds the new param with a defensive `null` default.
- `scripts/auto-fix.mjs:429` — FLAKE_SUPPRESSED branch: `errorClass: errorClass ?? null,   // LEDGER-01 — threaded from runDispatcher per WR-04`.
- `scripts/auto-fix.mjs:526` — flake-dispatched summary: `errorClass: errorClass ?? null,   // LEDGER-01 — threaded from runDispatcher per WR-04`.
- `scripts/auto-fix.mjs:711-713` — caller threads it: `errorClass,  // Phase 56 WR-04 — thread errorClass so the FLAKE_SUPPRESSED / and flake-dispatched ledger rows carry 'FLAKE' instead of / a hardcoded null ...`.

`grep -n "errorClass: null" scripts/auto-fix.mjs` returns ZERO matches in the dispatchFlakeState body. The `errorClass ?? null` fallback preserves the original behavior when an unexpected caller fails to pass the value, but the live call path now threads `'FLAKE'` end-to-end. WR-04 fully resolved.

## Out-of-scope findings (informational, not flagged)

Per the orchestrator brief:
- **IN-02 / CLEAN-01** — the module-level `MODEL` constant remains in place. Phase 60 owns this cleanup.
- **outcome / pr_merged** ledger field absence is Phase 58 scope, not flagged here.

The 3 INFO findings from `56-REVIEW.iter2.md` (IN-01 Test 48 cardinality strengthening, IN-02 MODEL-constant lifetime, IN-03 LEDGER-04 parameterization) were deferred by the fixer per default `--fix` scope (BLOCKER + WARNING only). They are NOT re-flagged here — the brief explicitly drops them.

## Re-scan: no new BLOCKER / WARNING surfaces

I re-scanned the three in-scope files for:
- Hardcoded secrets / API keys / tokens — none found.
- `eval`, `innerHTML`, `exec`, `shell_exec`, `system` outside the audited `execFileSync` array-arg pattern — none found.
- Empty catch blocks — none found (every catch logs to stderr or comments why it is swallowed, e.g., idempotent label-create).
- `==` / `!=` loose-equality on identity-sensitive values — none found; strict equality used throughout.
- Debug artifacts (`console.log`, `debugger`, raw TODO/FIXME/XXX/HACK) — none found.
- Null/undefined dereference of `process.env.*` values — guarded by `typeof === 'string'` checks where it matters.
- New shadowing in `dispatchFlakeState` from the `__wr02_` prefix vars — checked: those names are unique within the helper body and do not collide with caller scope.
- `errorClass ?? null` v.s. `errorClass || null` — the fixer correctly used `??` so the falsy string `''` would round-trip rather than silently becoming `null`; in practice `extractErrorClass` only returns a member of `RECOGNIZED_LABELS` or the sentinel `'AMBIGUOUS'` / `null`, so the distinction is moot today but the choice is forward-correct.

No new defects.

---

_Reviewed: 2026-06-04T15:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2 (re-review of fixes applied for `56-REVIEW.iter2.md`)_

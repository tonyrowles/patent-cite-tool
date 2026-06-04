---
phase: 56-ledger-schema-extension-leak-guard
reviewed: 2026-06-04T15:15:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/auto-fix.mjs
  - tests/unit/auto-fix.test.js
  - tests/unit/llm-ledger.test.js
status: findings_present
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
---

# Phase 56: Code Review Report

**Reviewed:** 2026-06-04T15:15:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** findings_present

## Summary

Phase 56 adds a `safeAppendLedger` wrapper in `scripts/auto-fix.mjs` that guards the 7 direct `appendLedgerEntry` call sites against local-shell leakage into the committed ledger, wires `errorClass` onto each of those 7 entries, adds a single integration test (LEDGER-04) that exercises the diff-guard call site under `process.env.CI='true'`, and relaxes Test 48 cardinality in `tests/unit/llm-ledger.test.js` to accept ≥1 bootstrap entry rather than exactly one.

The wiring is functionally consistent and the new LEDGER-04 test passes locally. However, the leak guard introduces TWO correctness regressions that are demonstrable by running the existing test suite outside CI, plus several smaller defects in the guard's predicate logic, comments, and ordering of side effects. Findings below.

## Critical Issues

### CR-01: `safeAppendLedger` breaks 18 pre-existing auto-fix tests when `CI` is unset

**File:** `scripts/auto-fix.mjs:127-140`, `tests/unit/auto-fix.test.js` (entire file)
**Issue:** The new wrapper throws when neither `process.env.CI` nor `process.env.E2E_LEDGER_PATH_OVERRIDE` is set. Only ONE test in `tests/unit/auto-fix.test.js` (the new LEDGER-04 test at line 1277) sets `process.env.CI = 'true'` before invoking `runDispatcher`. Every other test that reaches a `safeAppendLedger` path (Tests 2/3/4/7/8/9/10/12, G2, D1-D6, I1-I3, 46.9, etc.) relies on `CI` being set externally by the test runner.

Empirical evidence (reviewer ran this locally):

```
$ CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js
Test Files  1 failed (1)
     Tests  18 failed | 24 passed (42)
```

Each failure surfaces `safeAppendLedger refused: cannot write to /tmp/test-ledger.json outside CI...` Vitest does not implicitly set `CI=true`, and `package.json:28` defines `test:src` as bare `vitest run` — no `cross-env CI=true` wrapper. Any developer running `npm test` (or `npm run test:src`) on a workstation without `CI` already exported in their shell will hit 18 test failures. CI passes only because GitHub Actions sets `CI=true` automatically.

This violates the load-bearing claim in the wrapper's own docstring (lines 114-119): *"The mocked appendLedgerEntry is called transparently from inside this un-mocked wrapper body, so the wrapper's process.env.CI check executes in tests while the mocked appendLedgerEntry still records calls for assertion."* That works ONLY when CI=true is already set; otherwise the guard throws before reaching the mocked sink.

**Fix:** Set `process.env.CI = 'true'` at module load in `tests/unit/auto-fix.test.js` (with a `beforeAll`/`afterAll` snapshot+restore) so every test in the file passes the guard, then explicitly toggle it off inside any test that needs to exercise the refusal path. Alternatively, gate `safeAppendLedger` on `process.env.NODE_ENV !== 'test'` OR `process.env.CI` OR `process.env.E2E_LEDGER_PATH_OVERRIDE` so Vitest's auto-set `NODE_ENV=test` provides a third escape hatch. Either change must include a sanity test that `CI= GITHUB_ACTIONS= E2E_LEDGER_PATH_OVERRIDE= npx vitest run tests/unit/auto-fix.test.js` passes.

```js
// tests/unit/auto-fix.test.js — add near top of file
let __savedCI;
beforeAll(() => { __savedCI = process.env.CI; process.env.CI = 'true'; });
afterAll(() => {
  if (__savedCI === undefined) delete process.env.CI;
  else process.env.CI = __savedCI;
});
```

### CR-02: `safeAppendLedger` predicate accepts `CI=false`/`CI=0`/`CI=anything` — divergent from the rest of the codebase

**File:** `scripts/auto-fix.mjs:128`
**Issue:** The guard uses `!process.env.CI` (truthy/falsy on the string). In JavaScript, the strings `'false'`, `'0'`, `'no'`, and any other non-empty value are all truthy, so the guard PASSES when `CI=false` or `CI=0`. Compare with `tests/e2e/lib/llm-driver.js:387,518` and `tests/e2e/lib/llm-ledger.js:86` which all use the canonical strict form `process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'`.

Consequences:
- A developer who has `export CI=false` in their shell (e.g., a common pattern for opting OUT of CI-tagged behavior elsewhere) will pass this guard and leak entries to the committed ledger — the exact failure mode this wrapper was added to prevent.
- The guard also does NOT accept `GITHUB_ACTIONS=true` as a CI signal, despite the rest of the codebase treating it as equivalent. A CI runner that sets only `GITHUB_ACTIONS` (or any of the other CI-flavor envs that the driver accepts) would be refused.

**Fix:** Align the predicate with the rest of the codebase:

```js
function safeAppendLedger(entry) {
  const inCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const hasOverride =
    typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
    process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
  if (!inCi && !hasOverride) {
    throw new Error(/* ... */);
  }
  appendLedgerEntry(LEDGER_PATH, entry);
}
```

The same trim-and-length check that `llm-ledger.js:74-98` uses for `E2E_LEDGER_PATH_OVERRIDE` should also be mirrored here; the current `!process.env.E2E_LEDGER_PATH_OVERRIDE` accepts a single-space string `' '` as opt-in.

## Warnings

### WR-01: `E2E_LEDGER_PATH_OVERRIDE` opt-in does NOT actually redirect the write target

**File:** `scripts/auto-fix.mjs:127-140`
**Issue:** `safeAppendLedger` checks `process.env.E2E_LEDGER_PATH_OVERRIDE` at CALL time, but then writes to `LEDGER_PATH`, which was resolved at MODULE LOAD time by the IIFE in `tests/e2e/lib/llm-ledger.js:74-98`. If a test process imports `auto-fix.mjs` first and then sets `E2E_LEDGER_PATH_OVERRIDE`, the guard passes but the write lands on the canonical `tests/e2e/.llm-spend-ledger.json` (the committed file). This silently defeats the "integration-test escape hatch" claim in the docstring (line 99-101).

The risk is contained today because the auto-fix.test.js suite uses `vi.mock` to substitute both `appendLedgerEntry` AND `LEDGER_PATH`, so the wrapper's `LEDGER_PATH` is `'/tmp/test-ledger.json'` (the mock constant) — not the real path. But the docstring promises a runtime opt-in that does not exist outside the mocked path, and any future integration test that imports the real module while setting the env at runtime will hit this trap.

**Fix:** Either (a) document explicitly that `E2E_LEDGER_PATH_OVERRIDE` must be set BEFORE the module loads or the override is a no-op, or (b) have `safeAppendLedger` resolve the path at call time via the same IIFE logic, or (c) refuse if `process.env.E2E_LEDGER_PATH_OVERRIDE` resolves to a different path than `LEDGER_PATH`. Option (c) catches the most-likely misuse:

```js
if (hasOverride) {
  const expected = path.resolve(process.env.E2E_LEDGER_PATH_OVERRIDE.trim());
  if (expected !== LEDGER_PATH) {
    throw new Error(
      `E2E_LEDGER_PATH_OVERRIDE was set AFTER module load — ` +
      `LEDGER_PATH still points at ${LEDGER_PATH}, not ${expected}. ` +
      `Set E2E_LEDGER_PATH_OVERRIDE before importing auto-fix.mjs.`,
    );
  }
}
```

### WR-02: `dispatchFlakeState` performs side effects BEFORE `safeAppendLedger` can fail

**File:** `scripts/auto-fix.mjs:370-433` (FLAKE_ESCALATION + FLAKE branches) leading into the trailing `safeAppendLedger` at line 444
**Issue:** When `decision.state === 'FLAKE_ESCALATION'` (or FLAKE), the helper does the following BEFORE writing the summary ledger entry:
1. `execFileSync('gh', ['label', 'create', ...])` (line 374) — creates a GitHub label
2. `execFileSync('gh', ['issue', 'create', ...])` (line 387) — opens a public issue
3. `atomicWriteJson(SUPPRESSION_PATH, ...)` (line 409) — writes a suppression entry to disk
4. `execFileSync('node', ['scripts/quarantine-append.mjs', ...])` (line 419) — mutates the quarantine corpus

THEN it calls `safeAppendLedger` (line 444). If the wrapper throws (e.g., a developer running `--force-api` locally without `CI=true` to test the FLAKE branch), all four side effects have already landed but the ledger entry is missing. Auditability is broken: an external GitHub issue exists, a suppression is on disk, and the corpus is reset, but the ledger has no record. Re-running will re-issue the side effects (no idempotency guarantee on the issue-create) because the suppression check is also corrupted.

**Fix:** Either pre-flight the guard check at the top of `dispatchFlakeState` so the helper bails BEFORE producing side effects, or wrap the four side-effect blocks in the same `inCi || hasOverride` gate that `safeAppendLedger` uses. Pre-flight is the minimal fix:

```js
export async function dispatchFlakeState({ ... }) {
  // Pre-flight the leak guard so we don't issue gh/quarantine side effects
  // and then fail to record the ledger entry.
  if (!process.env.CI && !process.env.E2E_LEDGER_PATH_OVERRIDE) {
    throw new Error('dispatchFlakeState refused outside CI/override — same gate as safeAppendLedger');
  }
  // ...
}
```

Same concern applies to `runDispatcher` Step 6 (line 600: ls-remote idempotency ledger write follows a `gh issue comment` at line 615 — but the order is reversed here: ledger first, then comment, so the leak is one-sided). Verify the order at every call site.

### WR-03: Stale line-number references in 6 of the 7 `errorClass` annotation comments

**File:** `scripts/auto-fix.mjs:610, 654, 751, 774, 812` (and the LEDGER-04 test comment in `tests/unit/auto-fix.test.js:1257`)
**Issue:** Every wired errorClass site carries the comment `// LEDGER-01 — in scope from Step 4 (line 495)`. Line 495 in the current file is the `VALID_TRANSPORTS` allow-list check (Step 1b), NOT the `extractErrorClass` call. The actual extraction is at line 549. The LEDGER-04 test comment at `tests/unit/auto-fix.test.js:1257` references *"line 707 call site (Step 12 — diff-guard violation)"* but line 707 in `scripts/auto-fix.mjs` is `phase: PHASE,` inside the SDK-error ledger write at Step 10. The actual diff-guard violation `safeAppendLedger` is at line 764.

These stale references will mislead future maintainers grep'ing for the comment landmark. They are also brittle — any line addition above them flips them further off.

**Fix:** Either (a) update each comment to the correct current line number, (b) drop the line number and reference the step name only (e.g., `// LEDGER-01 — errorClass in scope from Step 4 ERROR_CLASS extraction`), or (c) anchor the comment on a named symbol (`// LEDGER-01 — errorClass from extractErrorClass(issueJson.labels)`).

### WR-04: `dispatchFlakeState` ledger entries hardcode `errorClass: null` even when caller has it in scope

**File:** `scripts/auto-fix.mjs:357, 454`
**Issue:** Both flake-dispatched and flake-suppressed ledger entries set `errorClass: null` with the comment `LEDGER-01 — dispatchFlakeState body has no errorClass in scope`. But `runDispatcher` already extracted `errorClass` at line 549 BEFORE calling `dispatchFlakeState` at line 633. The caller could thread it through:

```js
const exitCode = await dispatchFlakeState({
  caseId,
  fingerprint,
  issueNumber: issue,
  transport,
  errorClass,   // ← currently dropped on the floor
});
```

This matters for downstream consumers (dashboards, audit queries) that filter by `errorClass`. A FLAKE-labeled run currently shows up as `errorClass: null` even though we know it was `FLAKE`. The Phase 47 WARNING-01 fix (threading `transport` through to fix the forensic mis-tagging) is exactly the same pattern and is now repeated by-omission for `errorClass`.

If the intent is to leave this for Phase 58/60, document it; otherwise wire it.

**Fix:** Add `errorClass` to the `dispatchFlakeState` signature default and pass it from the caller. Update both ledger entries to `errorClass: errorClass ?? null`.

## Info

### IN-01: Test 48 (`llm-ledger.test.js`) cardinality relaxation hides bootstrap-entry-count contract regressions

**File:** `tests/unit/llm-ledger.test.js:1010-1024`
**Issue:** The pre-Phase-56 assertion was *"exactly 1 bootstrap entry, exactly 1 month bucket, invocations=1, total_usd=0"*. Post-Phase-56 it is *"≥1 entry with phase='39-bootstrap'"* with no upper bound and no month-count constraint. The relaxation accepts a state where the bootstrap entry has been duplicated (e.g., by a re-run of `phase-39-flip`) — that is an unrelated regression Test 48 used to catch.

The relaxation also drops the assertion that `bucket.invocations === 1` and `bucket.total_usd === 0` (post-relax it only checks `boot.cost_usd === 0` on the bootstrap entry, not the bucket aggregate). A bucket aggregate that drifts (e.g., a $0 entry that incorrectly bumped `total_usd`) would now pass.

**Fix:** Strengthen the post-relax assertion to lock the bootstrap entry's stability while allowing additional entries:

```js
const bootstraps = allIterations.filter((e) => e?.phase === '39-bootstrap');
expect(bootstraps.length).toBe(1);  // bootstrap is unique even when ledger has live entries
// ... existing per-entry shape checks ...
```

Or assert that ALL `phase === '39-bootstrap'` entries have the locked shape (in case the live entries somehow re-use the phase tag).

### IN-02: Dead module-level `MODEL` constant is referenced from 7 ledger sites — Phase 60 cleanup will need to update each

**File:** `scripts/auto-fix.mjs:157, 347, 444, 600, 644, 741, 764, 802, 878`
**Issue:** Per Phase 56 scope discipline this is NOT flagged as a defect (Phase 60 owns CLEAN-01). Informational note for the Phase 60 reviewer: `MODEL = 'claude-sonnet-4-6'` is used as a literal value at every `safeAppendLedger` call site AND at the PR-body hint (line 878). When Phase 60 removes the module-level constant in favor of either `built.model` (the real resolved model) or the SDK result's `modelId`, every one of these references must be updated to avoid a silent `MODEL is not defined` crash at runtime. Consider replacing `model: MODEL` with `model: built?.model ?? MODEL_FALLBACK` as a transitional step.

### IN-03: LEDGER-04 test does not assert `errorClass` is wired at the OTHER 6 ledger call sites

**File:** `tests/unit/auto-fix.test.js:1276-1300`
**Issue:** The new test only exercises the diff-guard violation site (line 764 in the source — the comment says line 707 which is stale per WR-03). The other 6 sites (FLAKE_SUPPRESSED dispatch line 347, FLAKE dispatch line 444, branchExisted line 600, skip-class line 644, malformed-diff line 741, apply-check-failed line 802) are wired but unverified by tests. A future refactor that drops `errorClass` from any one of those sites would not be caught.

**Fix:** Parametrize the LEDGER-04 test over the 7 call-site fixtures, or add one targeted assertion per site. Minimal addition: re-use the existing tests that already reach each call site (e.g., Test 8 reaches apply-check-failed, Test 12 reaches branchExisted, Tests 9/10 reach malformed-diff, Tests 3/4 reach skip-class) — add a single `expect(entries.some((e) => e.errorClass === <expected>)).toBe(true)` to each.

---

_Reviewed: 2026-06-04T15:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

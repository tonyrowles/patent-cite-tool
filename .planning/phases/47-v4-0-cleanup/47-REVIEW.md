---
phase: 47
reviewed_at: 2026-06-01T18:50:00Z
depth: standard
status: findings
counts:
  critical: 0
  warning: 1
  info: 4
files_reviewed:
  - tests/unit/v4-touchpoints.test.js
  - tests/unit/package-lock-pinned.test.js
  - tests/unit/uat-deferred-runbook.test.js
  - tests/unit/codeowners-pinned.test.js
  - tests/e2e/scripts/e2e-weekly-digest.test.js
  - tests/e2e/.llm-spend-ledger.json
---

# Phase 47 Code Review

**Reviewed:** 2026-06-01T18:50:00Z
**Depth:** standard
**Files Reviewed:** 6 (4 new test files, 1 single-line test edit, 1 data-reset JSON)
**Status:** findings (1 warning, 4 info — no blockers)
**Verification:** All 4 new test files run green locally (50 tests pass, 448ms wall-clock).

## Files Reviewed

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `tests/unit/v4-touchpoints.test.js` | NEW | 178 | Pin the 5 ARCHITECTURE §4 touchpoints (15 it() blocks) |
| `tests/unit/package-lock-pinned.test.js` | NEW | 53 | INT-FIX-LOCK exact-pin grep (4 it() blocks) |
| `tests/unit/uat-deferred-runbook.test.js` | NEW | 81 | Pin 47-UAT-DEFERRED.md stub structure (22 assertions) |
| `tests/unit/codeowners-pinned.test.js` | NEW | 111 | CODEOWNERS 5-path order + last-matching-rule guard (9 PASS) |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` | 1-line edit (L389) | — | INT-FIX-CAL — replace `'2026-05'` with dynamic month key |
| `tests/e2e/.llm-spend-ledger.json` | DATA RESET | 22 | INT-FIX-LEDGER — reset to Phase 39 seed-only |

## Verification Against Source

All touchpoint claims cross-checked against current tree:

- **TP-01** producer `tests/e2e/lib/issue-payload-builder.js:261` — `const labels = [category, 'e2e-nightly', 'triage'];` ✓ matches test regex
- **TP-01** consumer `.github/workflows/v40-auto-fix.yml:45,62` — `types: [labeled]` + `if: github.event.label.name == 'triage'` ✓
- **TP-02** producer `scripts/e2e-report-issue.mjs:78` — `export function fingerprint(caseId, errorClass, topOfStackHash)` ✓
- **TP-02** consumer `scripts/auto-fix.mjs:454-455` — `const fp8 = fingerprint.slice(0, 8); const branchName = \`auto-fix/${issue}-${fp8}\`;` ✓ matches both regexes
- **TP-03** consumer `scripts/auto-fix.mjs:617` — `if (transport === 'subscription') { sdkResult = await invokeClaudePWithLedger({...});}` ✓
- **TP-04** consumer `scripts/verify-single-case.mjs:39` — `import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';` ✓
- **TP-05** consumer `scripts/auto-fix-promote.mjs:74,69,78,248` — `merged !== true` + `'auto-fix:verified'` + `'triage'` + `_skipCiGuard: true` ✓
- **INT-FIX-LOCK** `package-lock.json:9,19-21` — `"@anthropic-ai/sdk": "0.100.1"` + `"node_modules/@anthropic-ai/sdk": { "version": "0.100.1", "resolved": ".../sdk-0.100.1.tgz" }` ✓
- **INT-FIX-CAL** `scripts/weekly-digest.mjs` → `monthlyTotal` → `currentMonth()` defined at `tests/e2e/lib/llm-ledger.js:161-163` as `new Date().toISOString().slice(0, 7)` — fix at L389 uses identical derivation; **no UTC/local timezone mismatch** ✓
- **INT-FIX-LEDGER** JSON parses; single `2026-05` bucket; one iteration; `cost_usd: 0`, `tokens_in/out: 0`; `model: claude-sonnet-4-6`; no PII; no API keys; no leaked spend pattern ✓
- **CODEOWNERS** 5 paths in expected canonical order (`/src/`, `/tests/`, `/.github/workflows/`, `/tests/golden/`, `/tests/e2e/test-cases-quarantine.js`) all `@tonyrowles` ✓

## Findings

### WARNING — WR-01: `codeowners-pinned.test.js` reads file at module-load time, making the "file exists" test unreachable on file-deletion

**File:** `tests/unit/codeowners-pinned.test.js:70`
**Description:**
```js
const src = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
```
runs at module collection time, BEFORE any `describe`/`it` block executes. The very next test (`it('CODEOWNERS file exists ...')`, L77-79) is the intended "missing file" guard — but if `.github/CODEOWNERS` is ever deleted, vitest's collection phase will throw `ENOENT` and the whole test file fails to load with an unhelpful stack trace from line 70 rather than the intended `expect(...).toBe(true)` failure pointing at the deletion.

The `uat-deferred-runbook.test.js` companion handles this correctly at L58-60 with `fs.existsSync(...) ? fs.readFileSync(...) : ''`. The codeowners test should follow the same pattern.

**Suggested fix:** Move the read inside a `beforeAll()` block (or use the same `existsSync ? read : ''` guard) so the file-exists test runs first and produces a clear failure message on deletion:
```js
let src = '';
let rules = [];
beforeAll(() => {
  if (fs.existsSync(CODEOWNERS_PATH)) {
    src = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    rules = src.split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => line.trim());
  }
});
```
(Severity: WARNING rather than BLOCKER because the failure mode is loud — the test file won't silently pass — but the diagnostic UX degrades.)

---

### INFO — IN-01: `uat-deferred-runbook.test.js` reads file at module-load time but ALSO has the existence guard inside `describe` — minor inconsistency

**File:** `tests/unit/uat-deferred-runbook.test.js:58-60`
**Description:** This test uses the `fs.existsSync(...) ? fs.readFileSync(...) : ''` pattern, which is the safer counterpart to WR-01 — but the read still happens at module-load time (top of the `describe` body) rather than inside `beforeAll`. Functionally fine because the existence check is in-place; the surrounding `expect(window, '...').not.toBeNull()` (L71) would catch a missing window. Just an observation that the two new test files use two different patterns for the same problem — pick one for consistency.

**Suggested fix:** Either adopt the same `beforeAll(...)` shape recommended in WR-01 for both files, or document the chosen pattern in a one-line comment near each module-level read. No functional change required.

---

### INFO — IN-02: TP-05 regex permissively matches both `merged === true` AND `merged !== true`

**File:** `tests/unit/v4-touchpoints.test.js:165`
**Description:**
```js
expect(src).toMatch(/(merged\s*===?\s*true|merged\s*!==?\s*true)/);
```
The current source at `scripts/auto-fix-promote.mjs:74` uses `if (merged !== true)` (a negative guard). The regex matches both equality and inequality so the test passes either way — this is **intentional** per the inline comment ("merged === true or merged !== true negative check"), and it correctly preserves the contract that "some explicit boolean check on `merged` exists." But it does mean a future refactor that mistakenly checks `merged === false` would also slip through (`merged === false` would NOT match — that's safe — but `merged !=  true` with whitespace would). The current shape is acceptable; flagging as INFO so future readers know the regex is deliberately loose.

**Suggested fix:** None required. If the contract should be tightened, add a positive assertion that `merged` is checked as a boolean (e.g., a behavioural test that imports `assertTripleGate` and asserts it rejects `merged: false`, `merged: 'true'`, and `merged: undefined`). The existing `tests/unit/auto-fix-promote-gate.test.js` likely already covers this — the touchpoint test merely pins the static-grep contract.

---

### INFO — IN-03: TP-02 fingerprint call uses `''` for `topOfStackHash` — could test the null branch explicitly

**File:** `tests/unit/v4-touchpoints.test.js:67`
**Description:**
```js
const fp = mod.fingerprint('test-case', 'WRONG_CITATION', '');
```
The function signature at `scripts/e2e-report-issue.mjs:78` is `fingerprint(caseId, errorClass, topOfStackHash)` where the third arg is documented `string|null` and the body uses `topOfStackHash || ''`. The test passes `''` directly, which exercises the no-op branch of `||` and is functionally the same as `null`. The 12-hex contract is correctly asserted. Adding a second call with `null` would strengthen the contract test slightly (catches a future refactor that breaks null-tolerance).

**Suggested fix:** Optional — add one extra `expect(mod.fingerprint('test-case', 'WRONG_CITATION', null)).toMatch(/^[0-9a-f]{12}$/);` to lock the documented null-tolerance. Not required for v4.0 close.

---

### INFO — IN-04: `package-lock-pinned.test.js` test 2 comment says "devDependencies block" but the grep is anchored to nothing — it matches anywhere

**File:** `tests/unit/package-lock-pinned.test.js:35-39`
**Description:** The test description says `"devDependencies block pins ..."` and the comment block describes targeting the `packages.""."devDependencies"` section. However, the regex `/"@anthropic-ai\/sdk":\s*"0\.100\.1"/` is unscoped — it matches both the `packages.""."devDependencies"` block at L9 AND the `node_modules/@anthropic-ai/sdk` resolution block at L19-21. That's actually fine for the contract being pinned (any occurrence of the exact pin string passes), but the description is misleading. Test 3 at L41-44 explicitly scopes to `"node_modules/@anthropic-ai/sdk":\s*\{[^}]*"version":\s*"0\.100\.1"`, which is the targeted assertion.

**Suggested fix:** Rename test 2 from `"package-lock.json devDependencies block pins ..."` to `"package-lock.json contains "@anthropic-ai/sdk": "0.100.1" somewhere (no caret)"`. Cosmetic only.

---

## Out-of-Scope Observations (not findings)

- **Security audit of ledger reset:** The reset JSON contains only one seed entry from Phase 39 bootstrap (`model: claude-sonnet-4-6`, `cost_usd: 0`, `tokens_in/out: 0`, `source: phase-39-flip`). No real API key fragments, no PII, no leaked spend pattern. Matches the Phase 39 LEDGER-04 seed-only contract. **PASS — no leak risk.**
- **INT-FIX-CAL UTC timezone:** Both the test fix (L389) and production `currentMonth()` (`tests/e2e/lib/llm-ledger.js:161-163`) use `new Date().toISOString().slice(0, 7)`. ISO 8601 strings are always UTC, so the test month-key always matches production at test-run time. **No off-by-one timezone bug.**
- **CODEOWNERS order:** All 5 paths confirmed in canonical last-matching-rule order. The `/tests/golden/` and `/tests/e2e/test-cases-quarantine.js` lines correctly appear AFTER the broader `/tests/` line.
- **No hardcoded secrets:** Grep for `API_KEY|password|secret|token` in the 4 new test files turns up zero matches (the touchpoint test references `_skipCiGuard` as a parameter name, which is the intended invariant under test).
- **No `console.log` / `debugger` / `eval()` / `innerHTML` / dangerous patterns** in any new test file.
- **Empty catch blocks:** None.
- **Test isolation:** No mutable global state introduced. Dynamic imports are pure-function reads; vitest's per-file isolation handles caching correctly.

## Summary

Phase 47 cleanup work is **fit to ship**. The 4 new test files correctly pin the 5 ARCHITECTURE §4 touchpoint contracts, the @anthropic-ai/sdk exact pin, the 47-UAT-DEFERRED.md stub structure, and the CODEOWNERS 5-path order. All assertions cross-checked against current source files — every claim the tests make matches the producer/consumer code at the line numbers cited in 47-RESEARCH.md. The INT-FIX-CAL one-line edit at `e2e-weekly-digest.test.js:389` correctly uses the same UTC-month derivation as production `currentMonth()`, eliminating the calendar-rollover flake without introducing a new timezone bug. The INT-FIX-LEDGER reset returns the committed ledger to Phase 39 seed-only shape with zero spend leakage and no PII.

**The one WARNING (WR-01) is a robustness UX issue, not a correctness defect** — the codeowners test will fail loudly if `.github/CODEOWNERS` is deleted, just with a less helpful stack trace than intended. Resolve it in a follow-up commit if convenient; not a v4.0 blocker.

The 4 INFO items are observations / consistency nudges — none affect correctness or the v4.0 milestone.

**Verdict: APPROVE for v4.0 close.** Phase 47 cleanup is complete and the test contracts will catch the regressions they're designed to catch. Recommend addressing WR-01 in v4.1 hardening if not patched before close.

---

_Reviewed: 2026-06-01T18:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

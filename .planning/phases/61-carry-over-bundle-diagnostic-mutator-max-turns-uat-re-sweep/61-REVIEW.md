---
phase: 61-carry-over-bundle-diagnostic-mutator-max-turns-uat-re-sweep
reviewed: 2026-06-09T17:05:00Z
commit: ca148052b2bbbfcbddf014768f194028cde71041
depth: standard
files_reviewed: 6
files_reviewed_list:
  - tests/e2e/lib/llm-driver.js
  - tests/e2e/scripts/inject-defect.mjs
  - tests/e2e/scripts/e2e-inject-defect.test.js
  - tests/unit/llm-driver.test.js
  - tests/unit/llm-driver-cost-bound.test.js
  - tests/fixtures/ledger-cost-bound.jsonl
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-06-09T17:05:00Z
**Commit:** ca14805 — `feat(61): atomic carry-over bundle — DIAG + TURNS + BUDG`
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found (2 Warning, 3 Info — no Critical)

## Summary

Adversarial review of the Phase 61 atomic carry-over bundle. The commit ships exactly the 6 expected files (no scope creep, no FORBIDDEN_PATHS hits, no `.llm-spend-ledger.json` runtime drift). All 65 tests across the 3 touched test files pass (`npx vitest run tests/unit/llm-driver.test.js tests/unit/llm-driver-cost-bound.test.js tests/e2e/scripts/e2e-inject-defect.test.js` exits 0). All eight enumerated concerns from the review context were verified:

1. **Determinism** — `buildDiagnosticBlock` is pure. No `Math.random` / `Date.now` / `crypto.randomBytes` / `Object.entries` / `Set` iteration. Both branches return string-literal arrays interpolating only the deterministic `seed` argument. Same-seed → byte-identical, confirmed by tests DIAG-03c and DIAG-03d.
2. **Tool-palette exclusion completeness** — Test 23 asserts the exact 6 forbidden literals (`'Edit'`, `'Bash'`, `'Write'`, `'WebFetch'`, `'--allowed-tools'`, `'--allowedTools'`) via `.not.toContain` on the spawned argv array. Verified by direct `Array.prototype.includes` simulation: all six return `false` against the new argv.
3. **SDK transport byte-stability** — `git show` extraction of `invokeAnthropicSdkWithLedger` function body (via `awk '/^export async function invokeAnthropicSdkWithLedger/,/^}/'`) yields identical SHA256 `bc9c12791db09f6e4ec055760f42ee936d3d169865b1cfaa8335a28dd6222707` pre-and-post commit. Only the header doc comment and `invokeClaudeP` argv literal changed.
4. **Cost-bound fixture validity** — Fixture computes mean $0.24 (sum $1.20 / 5 entries) which correctly clears `< $0.30` and `> $0.20`. Schema field `cost_usd` matches `appendLedgerEntry` schema (lines 228/400/426/451 of `llm-ledger.js`).
5. **Selector vocabulary correctness** — DOM snippet contains all four of `patent-result`, `section itemprop="claims"`, `main`, `article` literally; matches `selection.js:170-172` + `navigation.js:34`.
6. **Verifier Disagreement template parity** — All five required literals (`### Verifier Disagreement`, `Expected citation`, `Observed citation`, `Verifier tier:`, `Rerun verdict:`) present; mirrors `issue-payload-builder.js:208-216` shape.
7. **Threat T-31-4 mitigation** — `ANTHROPIC_API_KEY: ''` blanking at `llm-driver.js:118` byte-unchanged.
8. **Atomic-commit hygiene** — `git show --stat ca14805` lists exactly the 6 expected paths (5 mod + 1 new + 1 new). No FORBIDDEN_PATHS files (`scripts/auto-fix.mjs`, `scripts/auto-fix-promote.mjs`, `tests/e2e/lib/llm-ledger.js`, `tests/e2e/lib/fix-prompt-builder.js`, `scripts/quarantine-append.mjs`) in the commit; `.llm-spend-ledger.json` runtime drift correctly excluded.

Trust invariants verified post-commit:
- `grep -c "git push origin main" .github/workflows/v40-auto-fix.yml` == 1 ✓
- `grep -c "fixture-mutator-uat-47b" tests/e2e/scripts/inject-defect.mjs` == 1 ✓
- `grep -c "ERROR_CLASSES = new Set" tests/e2e/scripts/inject-defect.mjs` == 1 (rg returns 3 hits, but `new Set(` literal occurs once — the other two are doc comments) ✓
- `grep -c "&& !isFixtureMutator" scripts/quarantine-append.mjs` == 1 ✓
- `grep -c "ANTHROPIC_API_KEY: ''" tests/e2e/lib/llm-driver.js` == 2 (one in spawn env, one in doc-comment) ✓

The findings below are quality-tier issues that should be tracked but do not block this commit.

## Warnings

### WR-01: Fixture `source` tag misrepresents real subscription-transport ledger writes

**File:** `tests/fixtures/ledger-cost-bound.jsonl:1-5` (+ `tests/unit/llm-driver-cost-bound.test.js:49-53`)

**Issue:**
The fixture pairs `transport: "subscription"` with `source: "auto-fix-api"` on every entry, and the test asserts this pair as "forensic-ledger schema integrity." In actual production code, the subscription-transport path from `scripts/auto-fix.mjs:780-786` writes:

```javascript
sdkResult = await invokeClaudePWithLedger({
  systemPrompt,
  userPrompt,
  phase: PHASE_46,
  source: SOURCE_FIX_ISSUE,  // === 'fix-issue-cli'  (auto-fix.mjs:204)
});
```

Then `invokeClaudePWithLedger` (llm-driver.js:440-449) passes that `source` through verbatim. So a real `transport: 'subscription'` entry emitted by `auto-fix.mjs` will carry `source: 'fix-issue-cli'`, NOT `source: 'auto-fix-api'`. The pair `(transport: 'subscription', source: 'auto-fix-api')` is in fact ONLY emitted by the SDK error-handler at `invokeAnthropicSdkWithLedger` (lines 607-619) — and that path tags `transport: 'sdk'`, not subscription.

So no production code path writes the schema combination the fixture pins, and the comment "subscription transport is the only path affected by the --max-turns argv update" is technically true, but its forensic-ledger fingerprint per the existing code is `(transport: 'subscription', source: 'fix-issue-cli')`. The test will not catch a real regression where someone changes `SOURCE_FIX_ISSUE`.

**Fix:**
Update the fixture and the assertion to match the actual subscription-transport `source` tag emitted by `auto-fix.mjs`:

```diff
-{"iso":"2026-06-09T10:00:00Z","cost_usd":0.15,"transport":"subscription","source":"auto-fix-api","issueId":"101","model":"claude-sonnet-4-6"}
+{"iso":"2026-06-09T10:00:00Z","cost_usd":0.15,"transport":"subscription","source":"fix-issue-cli","issueId":"101","model":"claude-sonnet-4-6"}
```

(and corresponding test assertion: `expect(e.source).toBe('fix-issue-cli');`). Alternatively, drop the `source` assertion entirely and only pin `transport: 'subscription'` plus `cost_usd` bounds — the schema-integrity claim is overreach when the real per-path source mapping is more nuanced than a single tag.

### WR-02: Module-load-time `readFileSync` in test file silently throws on missing fixture

**File:** `tests/unit/llm-driver-cost-bound.test.js:26-30`

**Issue:**
The fixture is loaded at module-top-level scope BEFORE any `describe`/`it` block:

```javascript
const fixturePath = resolve(__dirname, '..', 'fixtures', 'ledger-cost-bound.jsonl');
const raw = readFileSync(fixturePath, 'utf8');
const entries = raw.trim().split('\n').map((line) => JSON.parse(line));
```

If the fixture file is deleted, renamed, or its content stops being valid JSONL, Vitest reports this as a test-file load failure (cryptic stack trace from `node:fs` ENOENT or `JSON.parse: Unexpected token`), NOT a clean test failure. This shifts the diagnostic burden from "this test caught a regression" to "this test file crashed during collection." Operators debugging a fixture drift have to read the Vitest spawn trace rather than seeing the assertion that fired.

This same anti-pattern is called out in MEMORY.md's "auto-fix.mjs ledger leak vector" context — module-load-time side effects are surprisingly easy to miss when wiring up a follow-on test.

**Fix:**
Move fixture loading inside a `beforeAll` (or the first `it`) so a missing/corrupt fixture surfaces as a clean test failure:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, '..', 'fixtures', 'ledger-cost-bound.jsonl');

let entries;
beforeAll(() => {
  const raw = readFileSync(fixturePath, 'utf8');
  entries = raw.trim().split('\n').map((line) => JSON.parse(line));
});
```

Or wrap in try/catch with an explicit `expect.fail('fixture missing: ...')` to keep the error message intentional. Low priority — the current shape works in CI today, but the failure mode of fixture deletion is worse than necessary.

## Info

### IN-01: `DIAG-03e` SOURCE_TAG preservation test does not iterate all five ERROR_CLASSES

**File:** `tests/e2e/scripts/e2e-inject-defect.test.js:402-417`

**Issue:**
The MUTATOR-04 SOURCE_TAG-preservation test loops over only three classes:
```javascript
for (const errorClass of [
  'GOOGLE_DOM_DRIFT',
  'WRONG_CITATION',
  'WORKER_FALLBACK_FAILED',
]) {
```
`LLM_HALLUCINATED_SELECTION` and `HARNESS_ERROR` are not covered — both are in the `ERROR_CLASSES` Set at `inject-defect.mjs:64-70`. The neighbouring DIAG-03f test (v2 marker invariant) DOES iterate all five, so the omission appears unintentional. The CONTEXT.md and RESEARCH.md both call for "across all errorClasses" — three of five is a partial implementation of that intent.

**Fix:**
Either expand the array to all five, or import `Array.from(ERROR_CLASSES)` and iterate it dynamically. Dynamic iteration is preferable because it self-extends if a future v4.3 capability adds a new class:

```javascript
for (const errorClass of ERROR_CLASSES) {
  const body = buildBody({ fp: 'cccccccccccc', caseId: 'tc', seed: 'sx', errorClass });
  expect(body).toContain('fixture-mutator-uat-47b');
}
```

### IN-02: WRONG_CITATION fixture citations are not template variables — drift detection blind to template parameterization

**File:** `tests/e2e/scripts/inject-defect.mjs:333-334`

**Issue:**
The WRONG_CITATION mutator body hard-codes:
```javascript
'Expected citation (golden): `1:34-46`',
'Observed citation: `2:12-24`',
```
These are literals. Real `issue-payload-builder.js:211-212` is template-interpolated:
```javascript
`Expected citation (golden): \`${safeGolden ?? 'n/a'}\``,
`Observed citation: \`${safeCitation}\``,
```
This means a future template parity break that changes the surrounding glyphs (e.g., switching from backtick to underscore code spans) would silently pass DIAG-03b because the test only contains-asserts on the literal headers, not the formatting around the cite values. The seed-hint that's spliced into GOOGLE_DOM_DRIFT (`seed-hint: ${seed}`) does parameterize on seed; the WRONG_CITATION block does not exercise seed for the cite values, only for the inner reason string.

**Fix:**
Either (a) parameterize the cite literals on the seed for stronger determinism coverage, or (b) update DIAG-03b assertions to use a regex that confirms the backtick-fenced code-span shape exists (e.g., `expect(body).toMatch(/Expected citation \(golden\): `[^`]+`/)`). Low priority — the current shape covers the load-bearing template parity headers, which is the verifier-gate's actual hook.

### IN-03: `buildDiagnosticBlock` exported without being used externally

**File:** `tests/e2e/scripts/inject-defect.mjs:299`

**Issue:**
The new helper is declared `export function buildDiagnosticBlock(errorClass, seed)`. No other file in the repo imports it (verified by `grep -rn "buildDiagnosticBlock" tests/ scripts/`). Only `buildBody` calls it. The export is dead surface — minor maintainability cost (more API to keep stable) for zero current benefit.

**Fix:**
Drop the `export` keyword unless the test file directly imports `buildDiagnosticBlock` (the test file imports `buildBody` and exercises the helper transitively, which is the better pattern). Defer to the project's convention — some codebases prefer "export all named functions for testability." If you keep the export, add a one-line comment explaining the reasoning so a future reviewer doesn't ESLint-rule it as unused.

---

## Cross-Concern Verification Notes

### Concern 1: Determinism (verified clean)
- `buildDiagnosticBlock` has zero non-deterministic primitives. Array literal returned in both branches; template strings interpolate only `seed`.
- DIAG-03c and DIAG-03d byte-identical-across-two-calls assertions are the load-bearing pin.

### Concern 2: Tool-palette exclusion (verified complete)
- All 6 forbidden literals checked: `Edit`, `Bash`, `Write`, `WebFetch`, `--allowed-tools`, `--allowedTools`.
- `Array.prototype.includes` semantics (exact element equality, NOT substring): the `'Read,Glob,Grep'` argv element is a single string and does not match `'Edit'` etc.

### Concern 3: SDK transport byte-stability (verified clean)
- `invokeAnthropicSdkWithLedger` function body SHA256 byte-identical pre/post (`bc9c12791db0...`).
- Only `invokeClaudeP` argv literal and surrounding doc comment changed.

### Concern 4: Cost-bound fixture validity (verified clean)
- Mean cost_usd = 0.24 (sum 1.20 / 5). Passes `< 0.30` and `> 0.20`.
- Schema field name `cost_usd` matches `appendLedgerEntry` / `phaseTotal` reader at `llm-ledger.js:228`.
- (See WR-01 above for `source` tag concern — schema field is correct; tag value is unrealistic.)

### Concern 5: Selector vocabulary (verified clean)
- DOM snippet contains all four canonical selectors verbatim: `main`, `article`, `patent-result`, `section itemprop="claims"`.
- DIAG-03a asserts at least one matches; current snippet maxes out at all four.

### Concern 6: Verifier Disagreement template parity (verified clean)
- All 5 required literals present: `### Verifier Disagreement`, `Expected citation`, `Observed citation`, `Verifier tier:`, `Rerun verdict:`.
- (See IN-02 above for the template-glyph concern — header parity is preserved.)

### Concern 7: T-31-4 mitigation (verified clean)
- `ANTHROPIC_API_KEY: ''` blanking at `llm-driver.js:118` byte-unchanged.
- Doc comment at line 79-80 also preserves the rationale.

### Concern 8: Atomic-commit hygiene (verified clean)
- 6 files, 298 insertions, 5 deletions.
- No FORBIDDEN_PATHS file touched (`auto-fix.mjs`, `auto-fix-promote.mjs`, `llm-ledger.js`, `fix-prompt-builder.js`, `quarantine-append.mjs`).
- `tests/e2e/.llm-spend-ledger.json` runtime drift correctly excluded.

---

_Reviewed: 2026-06-09T17:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

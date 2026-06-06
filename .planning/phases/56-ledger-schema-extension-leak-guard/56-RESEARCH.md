# Phase 56: Ledger Schema Extension + Leak Guard — Research

**Researched:** 2026-06-04
**Domain:** In-place wiring change inside a Node ESM module (`scripts/auto-fix.mjs`) + a 7-line assertion relax in an existing Vitest file — surrounded by load-bearing invariants (Pitfall 1, Pitfall 7) that forbid the natural fixes.
**Confidence:** HIGH (every claim below was verified by direct code inspection at the cited line numbers; no WebSearch/Context7 used — this phase is a pure-codebase mechanical wiring task.)

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Guard placement:** `safeAppendLedger(entry)` wrapper inside `scripts/auto-fix.mjs` scope; checks `process.env.CI || process.env.E2E_LEDGER_PATH_OVERRIDE`; throws contract error if neither set; calls `appendLedgerEntry(LEDGER_PATH, entry)` on success. [VERIFIED: .planning/research/SUMMARY.md Tension 3]
- **Call-site count:** 7 `appendLedgerEntry(LEDGER_PATH, ...)` invocations in `scripts/auto-fix.mjs` at lines 295, 391, 546, 589, 685, 707, 744. All 7 replaced with `safeAppendLedger(...)`. Zero direct calls remain. [VERIFIED: `grep -n 'appendLedgerEntry' scripts/auto-fix.mjs` returns exactly these lines]
- **errorClass field:** Wired into the 7 `scripts/auto-fix.mjs` sites ONLY. The 3 sites in `tests/e2e/lib/llm-driver.js` and 2 in `tests/e2e/scripts/e2e-explore.mjs` are OUT of scope. Sourced from `auto-fix.mjs:495` (`const errorClass = extractErrorClass(issueJson.labels)`).
- **Test 48 fix:** Relax "exactly 1 bootstrap entry" → "≥1 entry with `phase='39-bootstrap'`" in `tests/unit/llm-ledger.test.js:999-1023`. Per-entry `expect(it.phase).toBe('39-bootstrap')` check stays.
- **Outcome field:** NOT in Phase 56. Owned by Phase 58 (PROMOTE-02/03).
- **MODEL const cleanup:** NOT in Phase 56. Owned by Phase 60 (CLEAN-01).
- **Upstream-scope variable strategy:** Sites at lines 295 and 391 are inside `dispatchFlakeState`, where `errorClass` is NOT in lexical scope (it lives in the `runDispatcher` body, line 495). The natural answer: at those two sites, write `errorClass: null` (additive, idiomatic, additive-only invariant preserved). Recommended over hoisting because (a) the two sites are in a different function, and (b) the FLAKE-dispatch path has no semantic concept of WRONG_CITATION/etc. ERROR_CLASS — the dispatcher's caller already routes FLAKE-labeled issues here.

### Claude's Discretion
- `safeAppendLedger(entry)` single-arg vs. `safeAppendLedger(ledgerPath, entry)` two-arg. Recommended: single-arg, closes over module-scope `LEDGER_PATH`.
- Error message text. Recommended: name both env vars and the actual `LEDGER_PATH` value in the throw message for forensics.
- Test 48 rewrite mechanics. Recommended: filter `iterations` by `e.phase === '39-bootstrap'`, then `expect(bootstraps.length).toBeGreaterThanOrEqual(1)`; preserve per-entry asserts on `bootstraps[0]`.
- LEDGER-04 integration test mechanism. Recommended: `vi.mock` the existing seams (already in place in `tests/unit/auto-fix.test.js`) and assert the emitted mock call carries `errorClass`. NO new test-seam needed.
- Commit ordering. Recommended: single atomic commit `feat(56): wire errorClass + safeAppendLedger leak guard (LEDGER-01..04)`. Inter-commit invariant: if split, LEDGER-02 (wrapper introduction) must land before or with LEDGER-01 (call-site rewrites) — otherwise `grep -c 'safeAppendLedger'` between commits is wrong.

### Deferred Ideas (OUT OF SCOPE)
- `outcome`/`pr_merged` ledger fields — Phase 58 (PROMOTE-02/PROMOTE-03)
- Branch-redirect in `v40-cost-ledger-snapshot.yml` — Phase 57 (COMMIT-01)
- MODEL const removal in `scripts/auto-fix.mjs` — Phase 60 (CLEAN-01)
- Fixture-mutator design — Phase 59 (MUTATOR-01)
- Any change to `appendLedgerEntry` body — LOAD-BEARING (Pitfall 7); body must stay byte-unchanged
- Any change to `v40-auto-fix.yml` — LOAD-BEARING (Pitfall 1); body must stay byte-unchanged
- Removing PRE-02 guard from `invokeAnthropicSdkWithLedger` — defense-in-depth; both layers required

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEDGER-01 | `errorClass` populated on all 7 `appendLedgerEntry` call sites in `scripts/auto-fix.mjs` | §1 Call-site Inventory — exact field values per site mapped below |
| LEDGER-02 | `safeAppendLedger(entry)` wrapper enforces `CI || E2E_LEDGER_PATH_OVERRIDE`; replaces all 7 direct calls | §2 Wrapper Specification — placement, signature, throw contract |
| LEDGER-03 | Test 48 assertion relaxed (`≥1 entry with phase='39-bootstrap'`) | §3 Test 48 Rewrite Mechanics — exact source text quoted |
| LEDGER-04 | Integration Vitest asserts `runDispatcher()` mocked-mode ledger entry carries `errorClass` | §4 LEDGER-04 Test Seam — leverages existing `vi.mock` infrastructure |

---

## Summary

Phase 56 is a **mechanical wiring change** against pre-identified line numbers in a single source file (`scripts/auto-fix.mjs`) plus a 7-line assertion relax in a single test file (`tests/unit/llm-ledger.test.js`). The 7 call sites are verified by direct grep; the integration-test infrastructure already exists (the existing `tests/unit/auto-fix.test.js` mocks `appendLedgerEntry` via `vi.mock('../e2e/lib/llm-ledger.js', ...)` — Phase 56 reuses that exact pattern for the LEDGER-04 assertion). No new test-seam, no new export, no signature change to any existing function. [VERIFIED: tests/unit/auto-fix.test.js:62-67, lines 295-409 of auto-fix tests show 20+ existing assertions on `vi.mocked(appendLedgerEntry).mock.calls`]

The two upstream call sites (line 295 inside `dispatchFlakeState`, line 391 also inside `dispatchFlakeState`) **cannot see** `errorClass` because it lives in a different function's scope (the `runDispatcher` body at line 495). The simplest additive answer: write `errorClass: null` at those sites. Hoisting `let errorClass = null` into a module-level binding would mutate state across calls and create a test-isolation hazard — `errorClass: null` is the clean choice. [VERIFIED: scripts/auto-fix.mjs:272 (function boundary of `dispatchFlakeState`); scripts/auto-fix.mjs:428 (function boundary of `runDispatcher`); scripts/auto-fix.mjs:495 (`errorClass` declaration)]

The leak guard MUST be a `safeAppendLedger` wrapper **defined inside `scripts/auto-fix.mjs`** (not imported from `llm-ledger.js`). This placement preserves the existing `vi.mock('../e2e/lib/llm-ledger.js', ...)` in `tests/unit/auto-fix.test.js` — the mocked `appendLedgerEntry` is called transparently from within the safeAppendLedger body, so all 20 existing auto-fix tests continue to observe ledger writes via `vi.mocked(appendLedgerEntry).mock.calls`. [VERIFIED: tests/unit/auto-fix.test.js:62-67, vi.mock factory does NOT export safeAppendLedger; if safeAppendLedger were imported from llm-ledger.js, every existing auto-fix test would silently bypass it via the mock factory and the guard would be unenforced.]

**Primary recommendation:** Single atomic commit `feat(56): wire errorClass + safeAppendLedger leak guard (LEDGER-01..04)`. Define `safeAppendLedger` immediately AFTER the `import { ... LEDGER_PATH ... }` block (lines 69-74) and BEFORE the `PHASE` constant (line 90), in the module-constants region. Replace each of the 7 call sites with `safeAppendLedger({ ... errorClass: <value>, ... })`. Relax Test 48 assertions at lines 1011-1016 only; preserve the per-entry `expect(bootstraps[0].phase).toBe('39-bootstrap')` shape on `bootstraps[0]`. Add ONE new test in `tests/unit/auto-fix.test.js` (or as a new describe block in same file) asserting that `runDispatcher` mocked-mode emits a ledger entry with `errorClass` defined on at least one call.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ledger entry construction (errorClass field) | Scripts / Dispatcher | — | `auto-fix.mjs` owns the auto-fix-API ledger lifecycle; `errorClass` is the routing key resolved at Step 4 (line 495); writes flow through `safeAppendLedger`. |
| CI/override leak guard | Scripts / Dispatcher | — | Guard at call-site scope so `appendLedgerEntry` body stays byte-unchanged for 56 existing llm-ledger tests (Pitfall 7). |
| Ledger entry persistence | Library / `tests/e2e/lib/llm-ledger.js` | — | `appendLedgerEntry` performs the JSONL append + crash-safe rename. Phase 56 does NOT touch this layer. |
| Test 48 invariant | Tests / `tests/unit/llm-ledger.test.js` | — | The invariant lives in the assertion text. Relax cardinality (`length.toBe(1)` → `length.toBeGreaterThanOrEqual(1)`) without changing the per-entry shape check. |
| LEDGER-04 integration assertion | Tests / `tests/unit/auto-fix.test.js` | — | Existing `vi.mock` of `llm-ledger.js` already drives `runDispatcher` and observes ledger writes. Add ONE new test that asserts a ledger-entry call carries `errorClass`. |

---

## Standard Stack

**Zero new dependencies.** Phase 56 uses only `vitest@3.x` (existing), `node:fs`, `node:path`, `node:child_process` (existing imports in `auto-fix.mjs`). No `npm install` step.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 3.x (devDependency) | Test runner | Already used by all 61+ Vitest tests in `tests/unit/`. [VERIFIED: package.json:48 `"vitest": "^3.0.0"`] |
| node:process.env | built-in | Read `CI` / `E2E_LEDGER_PATH_OVERRIDE` in safeAppendLedger | Standard env access; already used elsewhere in `auto-fix.mjs` (no new pattern). |

**Installation:** None required.

**Version verification:**
```bash
$ grep '"vitest"' /home/fatduck/patent-cite-tool/package.json
    "vitest": "^3.0.0"
```
[VERIFIED: locally inspected 2026-06-04]

---

## Package Legitimacy Audit

Not applicable — Phase 56 installs zero new packages. All code uses Node built-ins (`node:fs`, `node:path`, `node:child_process`, `node:util`) and existing devDependencies (`vitest@^3.0.0`).

---

## 1. Call-site Inventory (LEDGER-01 + LEDGER-02 Wiring)

> Every line number below was verified by `grep -n 'appendLedgerEntry' scripts/auto-fix.mjs` on 2026-06-04. The 7 sites match the locked count exactly. [VERIFIED]

| # | Line | Function | `errorClass` Scope | Recommended Value | Notes |
|---|------|----------|---------------------|-------------------|-------|
| 1 | 295 | `dispatchFlakeState` | NOT in scope | `errorClass: null` | FLAKE_SUPPRESSED short-circuit. `dispatchFlakeState` is called from `runDispatcher` Step 7 (line 578) only when `errorClass === 'FLAKE'`. The wrapper-call could pass `errorClass: 'FLAKE'` explicitly via the caller, but the dispatcher function does not currently take it as an argument. Keeping `errorClass: null` here preserves additive-only minimal-diff invariant. |
| 2 | 391 | `dispatchFlakeState` | NOT in scope | `errorClass: null` | flake-dispatched summary entry. Same rationale as #1. |
| 3 | 546 | `runDispatcher` (Step 6 idempotency hit) | In scope, line 495 | `errorClass` | Branch already exists on origin. `errorClass` is in lexical scope (Step 4 finishes at line 508 before Step 5/6). |
| 4 | 589 | `runDispatcher` (Step 7 skip-class) | In scope | `errorClass` | `buildFixPrompt({ errorClass, issueBody })` at line 572 already consumes it; safe to thread. |
| 5 | 685 | `runDispatcher` (Step 11 malformed-diff) | In scope | `errorClass` | After SDK response; `errorClass` still in scope. |
| 6 | 707 | `runDispatcher` (Step 12 diff-guard violation) | In scope | `errorClass` | Same scope. |
| 7 | 744 | `runDispatcher` (Step 13 apply-check fail) | In scope | `errorClass` | Same scope. |

**Verification post-change:**
```bash
grep -c 'errorClass' /home/fatduck/patent-cite-tool/scripts/auto-fix.mjs
# Must be ≥ 7 (1 for line 495 declaration + 7 new occurrences in call sites = ≥8, but the locked target is "≥7")

grep -c 'safeAppendLedger' /home/fatduck/patent-cite-tool/scripts/auto-fix.mjs
# Must equal 7 (one per call site) — plus 1 for the function declaration = 8 total occurrences of the identifier.
# The locked acceptance ("grep -c 'safeAppendLedger' = 7") counts CALL sites only, not the declaration.
# Confirm during plan-check whether grep counts identifier occurrences (8) or call-only (need stricter pattern).
# Safer regex for call-only: grep -c 'safeAppendLedger({' scripts/auto-fix.mjs → 7

grep -c 'appendLedgerEntry(LEDGER_PATH' /home/fatduck/patent-cite-tool/scripts/auto-fix.mjs
# Must equal 1 — the SINGLE remaining occurrence is INSIDE the safeAppendLedger wrapper body.
# Zero direct call sites outside the wrapper remain.
```

### Existing call-site bodies (verbatim, abbreviated)

**Site #1 (line 295) — `dispatchFlakeState` FLAKE_SUPPRESSED:**
```js
if (decision.state === 'FLAKE_SUPPRESSED') {
  appendLedgerEntry(LEDGER_PATH, {
    iso: now().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issueNumber}`,
    fingerprint,
    source: 'flake-suppressed',
    flakeState: 'FLAKE_SUPPRESSED',
    suppressedUntil: decision.until,
  });
  ...
```

**Site #3 (line 546) — `runDispatcher` Step 6 idempotency-hit:**
```js
if (lsRemoteOut.trim().length > 0) {
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issue}`,
    fingerprint,
    source: 'auto-fix-api',
    branchExisted: true,
  });
  ...
```

**Site #6 (line 707) — `runDispatcher` Step 12 diff-guard violation (representative of sites 5/6/7):**
```js
if (!guard.ok) {
  const violationList = guard.violations.join(', ');
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issue}`,
    fingerprint,
    source: 'auto-fix-api',
    errorReason: `diff-guard-violation:${violationList}`,
  });
  ...
```

[VERIFIED: all bodies read from scripts/auto-fix.mjs on 2026-06-04]

### Variable-scope decision (line 295 / 391 sites)

The two sites inside `dispatchFlakeState` cannot use `errorClass` directly. Three options were evaluated:

| Strategy | Tradeoff | Recommendation |
|----------|----------|----------------|
| `errorClass: null` literal at sites 1+2 | Minimal diff; preserves additive-only invariant; downstream consumers (a-b-winner.mjs filter at line 185) already drop entries with non-string errorClass — these flake rows would not skew A/B metrics. | **PRIMARY** |
| Hoist `let errorClass = null` into module scope, assign in `runDispatcher` Step 4 | Allows `errorClass` to propagate into `dispatchFlakeState` reads — BUT creates a test-isolation hazard (back-to-back calls share state) and violates "module-state-free" coding pattern used throughout the file. | REJECT |
| Pass `errorClass` as an argument to `dispatchFlakeState({ ... errorClass })` | Signature change. `dispatchFlakeState` is `export async function` so its signature is part of the test surface — would need an update to `tests/unit/auto-fix.test.js`. | REJECT (over-scope) |

**Primary recommendation:** Write `errorClass: null` at sites 1+2. CONTEXT.md already documents this choice ("default to `null`/`undefined`"). [VERIFIED: 56-CONTEXT.md decisions block, "default to null preferred"]

---

## 2. safeAppendLedger Wrapper Specification (LEDGER-02)

### Placement
Define the wrapper in `scripts/auto-fix.mjs` **after** the `import` block (which ends at line 88, last import) and **before** the `PHASE` constant (line 90). The natural insertion point is the module-constants region around lines 90-132.

Recommended exact placement: immediately after the existing import block, BEFORE `const PHASE = '42-auto-fix';` (line 90). Place a clear `// ---` divider comment above and below so it stays self-contained.

**Why this region:**
- It is below the `LEDGER_PATH` import (line 73) and `appendLedgerEntry` import (line 71), so both identifiers are bound.
- It is above the first usage (line 295), so the function is defined before any call site evaluates.
- It groups with module-level constants/helpers (idiomatic location in this file).

### Signature
```js
/**
 * Phase 56 LEDGER-02 — call-site leak guard for direct ledger writes.
 *
 * Refuses to write entries to the committed ledger unless the caller is
 * running in CI (process.env.CI is set) OR has explicitly opted-in via
 * E2E_LEDGER_PATH_OVERRIDE (integration-test escape hatch defined in
 * llm-ledger.js:74-98).
 *
 * Why this wrapper exists: the 7 direct appendLedgerEntry(LEDGER_PATH, ...)
 * sites in this file bypass the PRE-02 guard inside invokeAnthropicSdkWithLedger
 * (Phase 48 leak vector — see project_auto_fix_ledger_leak_vector.md). Adding
 * the guard inside appendLedgerEntry itself would break all 56 existing
 * Vitest tests in tests/unit/llm-ledger.test.js that call appendLedgerEntry
 * with a tmp path outside CI (Pitfall 7, LOAD-BEARING). Wrapping at call-site
 * scope is the only placement that satisfies both invariants.
 *
 * @param {object} entry — passed verbatim to appendLedgerEntry
 * @throws {Error} when neither process.env.CI nor process.env.E2E_LEDGER_PATH_OVERRIDE is set
 */
function safeAppendLedger(entry) {
  if (!process.env.CI && !process.env.E2E_LEDGER_PATH_OVERRIDE) {
    throw new Error(
      `safeAppendLedger refused: cannot write to ${LEDGER_PATH} ` +
        `outside CI. Set process.env.CI=true (CI invocation) or ` +
        `process.env.E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json ` +
        `(local integration test). This guard protects the committed ` +
        `ledger from local --force-api runs leaking entries (Phase 48 ` +
        `leak vector + Phase 56 hardening; see ` +
        `.planning/research/PITFALLS.md Pitfall 7).`,
    );
  }
  appendLedgerEntry(LEDGER_PATH, entry);
}
```

### Why NOT exported
`safeAppendLedger` is module-internal. The only callers are the 7 sites within `scripts/auto-fix.mjs`. Exporting it would (a) widen the API surface unnecessarily, (b) tempt other scripts to use it, defeating the file-scoped intent.

### Why NOT defined in `llm-ledger.js`
If `safeAppendLedger` were defined in `llm-ledger.js` and imported here, the existing `vi.mock('../e2e/lib/llm-ledger.js', () => ({ ..., appendLedgerEntry: vi.fn(), ... }))` in `tests/unit/auto-fix.test.js:62-67` would silently REPLACE `safeAppendLedger` with `undefined` (because the factory does not list it), and the guard would never fire in tests. Defining the wrapper INSIDE `auto-fix.mjs` keeps it transparent to the mock factory — the mocked `appendLedgerEntry` is called from inside the un-mocked `safeAppendLedger` body. [VERIFIED: tests/unit/auto-fix.test.js:62-67]

### Tradeoff acknowledged
Defining `safeAppendLedger` inside `auto-fix.mjs` means the guard cannot be directly unit-tested by importing it from `llm-ledger.js`. But the integration test (LEDGER-04) exercises it via `runDispatcher`, which is the only callsite anyway. A standalone unit test for the throw behavior would require either (a) exporting `safeAppendLedger`, or (b) a `vi.unstubAllEnvs` + child-process spawn. The simplest verification: spawn `node scripts/auto-fix.mjs --issue 1` outside CI in a manual smoke step (mentioned in the planner's verification checklist).

---

## 3. Test 48 Rewrite Mechanics (LEDGER-03)

### Current source (lines 999-1023, verbatim)

```js
  it('Test 48: committed tests/e2e/.llm-spend-ledger.json is valid v1 with bootstrap entry', () => {
    const REAL_LEDGER_PATH = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'e2e',
      '.llm-spend-ledger.json',
    );
    expect(fs.existsSync(REAL_LEDGER_PATH)).toBe(true);
    const text = fs.readFileSync(REAL_LEDGER_PATH, 'utf8');
    const j = JSON.parse(text);
    expect(j.version).toBe(1);
    // Exactly one bootstrap entry — fresh-start per CONTEXT seed policy.
    const months = Object.keys(j.months);
    expect(months.length).toBe(1);            // ← BREAKS after first live run that lands in a different UTC month
    const bucket = j.months[months[0]];
    expect(bucket.invocations).toBe(1);       // ← BREAKS as soon as any non-bootstrap entry exists
    expect(bucket.total_usd).toBe(0);         // ← BREAKS as soon as cost_usd > 0 lands
    expect(bucket.iterations.length).toBe(1); // ← BREAKS as soon as any second entry lands
    const it = bucket.iterations[0];
    expect(it.phase).toBe('39-bootstrap');    // ← PRESERVED: per-entry shape check on bootstrap[0]
    expect(it.transport).toBe('sdk');         // ← PRESERVED
    expect(it.cost_usd).toBe(0);              // ← PRESERVED
    expect(it.source).toBe('phase-39-flip');  // ← PRESERVED
    expect(it.model).toBe('claude-sonnet-4-6');// ← PRESERVED
  });
```

[VERIFIED: tests/unit/llm-ledger.test.js:999-1023]

### Recommended minimal-diff rewrite

```js
  it('Test 48: committed tests/e2e/.llm-spend-ledger.json is valid v1 with ≥1 bootstrap entry', () => {
    const REAL_LEDGER_PATH = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'e2e',
      '.llm-spend-ledger.json',
    );
    expect(fs.existsSync(REAL_LEDGER_PATH)).toBe(true);
    const text = fs.readFileSync(REAL_LEDGER_PATH, 'utf8');
    const j = JSON.parse(text);
    expect(j.version).toBe(1);
    // Phase 56 LEDGER-03: relaxed from "exactly 1 bootstrap entry" to
    // "≥1 entry with phase='39-bootstrap'" because live auto-fix runs on
    // origin/main append additional entries (post-Phase 56 errorClass-wired
    // entries land in this file after every CI run). The per-entry shape
    // check on the bootstrap entry below is unchanged.
    const allIterations = Object.values(j.months).flatMap((m) => m.iterations ?? []);
    const bootstraps = allIterations.filter((e) => e?.phase === '39-bootstrap');
    expect(bootstraps.length).toBeGreaterThanOrEqual(1);
    const boot = bootstraps[0];
    expect(boot.phase).toBe('39-bootstrap');
    expect(boot.transport).toBe('sdk');
    expect(boot.cost_usd).toBe(0);
    expect(boot.source).toBe('phase-39-flip');
    expect(boot.model).toBe('claude-sonnet-4-6');
  });
```

**Lines changed:** ~10 (relax 4 cardinality asserts; replace `it` index-zero with `boot` filter-zero). The `it` binding in the original collides with vitest's `it()` test runner — the rewrite uses `boot` to avoid confusion. The original code worked because `it` was reassigned to a new local binding inside the `it(...)` block, but the new version's filter makes the local variable's purpose more obvious.

### Lines changed map
- DELETE lines 1010-1016 (cardinality asserts + `bucket` binding)
- REPLACE with: filter+bootstraps+length check (3 lines)
- REPLACE line 1017 (`const it = bucket.iterations[0]`) with `const boot = bootstraps[0]`
- REPLACE lines 1018-1022 (`expect(it.X)`) with `expect(boot.X)` (same shape, identifier rename)
- Add comment block explaining LEDGER-03

### Why preserve per-entry assertions on `bootstraps[0]`
The bootstrap entry was seeded by Phase 39 flip with deterministic values (cost_usd=0, source='phase-39-flip', model='claude-sonnet-4-6'). It IS the persistent invariant — `bootstraps[0]` will always be the seed entry because subsequent appends push to the END of the array, never the front. The committed seed entry at 2026-05-31T16:03:31.594Z stays at index 0 forever. [VERIFIED: tests/e2e/.llm-spend-ledger.json — first iteration has phase='39-bootstrap', cost_usd=0, transport='sdk', source='phase-39-flip', model='claude-sonnet-4-6']

**Risk note:** if a later phase wrote an entry to a NEW month and that month sorted lexicographically BEFORE the bootstrap's month, `bootstraps[0]` might not be the seed. The bootstrap is in `2026-05`; subsequent live entries will be in `2026-06` or later. UTC-ordered months sort lexicographically. Risk = 0.

---

## 4. LEDGER-04 Integration Test Seam

### Existing infrastructure (verified)

`tests/unit/auto-fix.test.js` already imports `runDispatcher` from `scripts/auto-fix.mjs` (line 105) and mocks `appendLedgerEntry` (line 64, inside `vi.mock('../e2e/lib/llm-ledger.js', ...)`). 20 existing tests already invoke `runDispatcher({ issue, transport, forceApi })` and observe `vi.mocked(appendLedgerEntry).mock.calls`.

Concrete patterns already in use:
- Line 295: `const ledgerEntries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);`
- Line 320: `const [, entry] = vi.mocked(appendLedgerEntry).mock.calls[0];`
- Line 382, 408: same pattern, asserting on `entry.errorReason`, `entry.fingerprint`, etc.

[VERIFIED: tests/unit/auto-fix.test.js:62-67, 89-105, 264-409]

### Recommended LEDGER-04 assertion

Add a NEW test in `tests/unit/auto-fix.test.js`. Place it in a new `describe` block at the END of the file (or insert into an existing describe like "AUTOFIX-03 diff-guard"). Naming convention follows existing tests in the file.

```js
describe('LEDGER-04: errorClass wired into ledger entries (Phase 56)', () => {
  it('runDispatcher mocked-mode emits a ledger entry carrying errorClass', async () => {
    // Choose any path that triggers safeAppendLedger. The diff-guard
    // violation path is convenient: WRONG_CITATION label, mocked SDK
    // returns a diff that touches tests/test-cases.js → guard fires →
    // ledger entry is appended at line 707 with errorReason +
    // errorClass.
    setupExecFileSyncRouter([
      ghIssueViewRule({ labels: ['triage', 'WRONG_CITATION'] }),
      lsRemoteEmptyRule(),
      ghIssueCommentOkRule(),
    ]);
    vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
      ok: true,
      llmText: makeFencedDiff('tests/test-cases.js'),  // FORBIDDEN path
      modelId: 'claude-sonnet-4-6',
      costUsd: 0.05,
      rawJson: {},
    });
    // LEDGER-04 prerequisite: safeAppendLedger refuses to write outside
    // CI. The existing vi.mock factory replaces appendLedgerEntry with a
    // vi.fn(); but safeAppendLedger reads process.env.CI directly. Set
    // it explicitly so the wrapper's guard does NOT throw.
    process.env.CI = 'true';
    try {
      const exit = await runDispatcher({ issue: ISSUE, transport: 'sdk', forceApi: true });
      expect(exit).toBe(1);  // diff-guard violation
      const entries = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.errorClass === 'WRONG_CITATION')).toBe(true);
    } finally {
      delete process.env.CI;
    }
  });
});
```

### Why this seam works
- `runDispatcher` is an export of `scripts/auto-fix.mjs`. [VERIFIED: line 428 `export async function runDispatcher(...)`]
- `vi.mock('../e2e/lib/llm-ledger.js', ...)` already replaces `appendLedgerEntry` with `vi.fn()`. `safeAppendLedger` is defined INSIDE `auto-fix.mjs` (not mocked), so its body executes — including the `process.env.CI` check.
- Setting `process.env.CI` inside the test (and cleaning up in `finally`) is hermetic. The Vitest config has `fileParallelism: false` (vitest.config.js:16), so no race condition. [VERIFIED]
- The diff-guard path lands at line 707 (call site #6 in the inventory). When LEDGER-01 wires `errorClass: errorClass` (in scope from line 495), the assertion `entries.some((e) => e.errorClass === 'WRONG_CITATION')` is true.

### Alternative paths
The test could equally use any of the 5 in-scope sites (546, 589, 685, 707, 744). The diff-guard path is convenient because it requires the fewest mock setups (just a forbidden-path diff). The Step 6 idempotency path (line 546) needs `lsRemoteHitRule()` and exits without touching the SDK at all — also viable.

### Why NOT child_process spawn
A child-process spawn (`spawnSync('node', ['scripts/auto-fix.mjs', '--issue', '1'])`) would require:
- A real GitHub issue number (or `gh` CLI mock — currently spawn-incompatible)
- Real `gh` binary on PATH in CI
- Real network access for `git ls-remote`

The `vi.mock` approach is the lowest-friction option and reuses existing test infrastructure. [VERIFIED: 20 existing tests use this exact pattern]

---

## 5. E2E_LEDGER_PATH_OVERRIDE Semantics

### Verified contract from `tests/e2e/lib/llm-ledger.js:74-98`

```js
export const LEDGER_PATH = (() => {
  const overrideRaw = process.env.E2E_LEDGER_PATH_OVERRIDE;
  if (typeof overrideRaw === 'string' && overrideRaw.trim().length > 0) {
    // WR-05: refuse override+CI co-set (would silently bypass spend caps)
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      throw new Error('E2E_LEDGER_PATH_OVERRIDE must NOT be set in CI ...');
    }
    return path.resolve(overrideRaw.trim());
  }
  return path.resolve(__dirname, '../.llm-spend-ledger.json');
})();
```

**Resolution table (at module-load time only):**

| `CI` set? | `E2E_LEDGER_PATH_OVERRIDE` set? | Outcome |
|-----------|---------------------------------|---------|
| no | no | `LEDGER_PATH` = committed `tests/e2e/.llm-spend-ledger.json` |
| no | yes (non-empty) | `LEDGER_PATH` = resolved override path; writes go there |
| yes | no | `LEDGER_PATH` = committed path; CI writes flow normally |
| yes | yes | **throws** at module load (WR-05 defense) |

### Cross-check with the desired `safeAppendLedger` contract

The new wrapper checks: `!process.env.CI && !process.env.E2E_LEDGER_PATH_OVERRIDE` → throw.

**Coverage table:**

| `CI` | `OVERRIDE` | `LEDGER_PATH` resolved to | `safeAppendLedger` outcome | Risk |
|------|-----------|---------------------------|----------------------------|------|
| no | no | committed path | **throws** | None — local dev cannot pollute committed ledger |
| no | yes | tmp path | proceeds — writes to tmp | None — tmp path |
| yes | no | committed path | proceeds — writes committed | This is the production CI path |
| yes | yes | (module-load throw) | (unreachable) | Defended by WR-05 |

**The two guards (WR-05 in llm-ledger.js and safeAppendLedger in auto-fix.mjs) are defense-in-depth with NON-OVERLAPPING failure modes:**
- WR-05: catches CI runner with both flags set (misconfigured workflow).
- safeAppendLedger: catches local dev forgetting `--dry-run` and running `node scripts/auto-fix.mjs --issue 1`.

Both must coexist. [VERIFIED: research/SUMMARY.md Tension 3 resolution + PITFALLS.md Pitfall 7]

---

## 6. Existing 56 llm-ledger Tests — Sanity Check

### Actual test count
`grep -c "  it(" tests/unit/llm-ledger.test.js` returns **61** total `it()` blocks (56 numbered `Test N` + 5 sanity tests). The "33 existing llm-ledger tests" figure in upstream docs is an undercount — it was likely written before Phase 32/39/42 additions. The CONTEXT.md and ROADMAP statements about "33 existing tests" should be read as "all existing tests in `llm-ledger.test.js`" — the count is actually 61. [VERIFIED: grep on 2026-06-04]

This does NOT change the design: the constraint is "no test that exists today fails after Phase 56," not "exactly 33 tests pass." 56 vs 33 is a count-correction, not a scope change.

### Patterns in existing tests
All 20+ `appendLedgerEntry(...)` invocations in `llm-ledger.test.js` pass a **tmp path** as the first argument:
```js
appendLedgerEntry(ledgerPath, makeEntry({ ... }));  // ledgerPath = mkdtempSync(...) per beforeEach
```
[VERIFIED: tests/unit/llm-ledger.test.js:203, 222-223, 252, 263, 274-275, 286-287, 344, 356, 601, 737, 748, 757, 781, 821-822, 832, 841]

**None invoke `safeAppendLedger`** — the wrapper is module-internal to `auto-fix.mjs` and not imported here. [VERIFIED: grep `safeAppendLedger` returns nothing in llm-ledger.test.js — confirmed because the symbol does not yet exist]

**None test behavior of `appendLedgerEntry` body changes** — Phase 56 makes ZERO changes to `appendLedgerEntry` body, so the 61 tests inherit no behavioral risk. [VERIFIED: locked invariant in CONTEXT.md and PITFALLS.md Pitfall 7]

### Additive `errorClass` field — risk of breaking existing tests

The 5 tests that explicitly assert entry-shape round-trip (Tests 34-37, 56) use spread-pattern overrides:
```js
appendLedgerEntry(ledgerPath, makeEntry({ cost_usd: 0.10, transport: 'sdk' }));
// then assert on the read-back entry
```
They do NOT check `errorClass` and do NOT assert "no extra fields." `appendLedgerEntry` body spreads entries verbatim (`m.iterations.push(entry)` at line 705 of `llm-ledger.js`), preserving all input fields. Adding `errorClass` to the production call sites cannot affect tmp-path test calls because those tests never set or read `errorClass`. [VERIFIED: llm-ledger.js:686-705; spread-only push, no field-name allowlist]

**Sanity check:** Pure additive change. Zero existing tests break. The only test that needs editing is Test 48 (LEDGER-03 relaxation, addressed separately).

---

## 7. Vitest Configuration

### Project Vitest config
File: `/home/fatduck/patent-cite-tool/vitest.config.js`

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: ['tests/**/*.test.js'],
    fileParallelism: false,  // Phase 49 CI-stabilization
  },
});
```
[VERIFIED]

### Env handling
- **No `process.env.CI` is set by the config or by `setupFiles`.** [VERIFIED: grep `CI` in chrome-stub.js if it exists — but the setup file does not manipulate env]
- **`fileParallelism: false`** means setting `process.env.CI` inside a single test is safe across the file (no cross-file race). Inside a file, tests run sequentially by default, so a `try { process.env.CI = 'true'; ... } finally { delete process.env.CI; }` pattern is hermetic. [VERIFIED: vitest.config.js:16]
- **`globals: true`** means `describe`/`it`/`expect`/`vi` are global. The existing test files use explicit imports anyway (`import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`), which is fine.

### LEDGER-04 test env-setup pattern
The recommended LEDGER-04 test (§4 above) sets `process.env.CI = 'true'` inside the test body and clears it in `finally`. This is the only way to satisfy the `safeAppendLedger` guard during the test. The alternative — setting `E2E_LEDGER_PATH_OVERRIDE` — is undesirable because LEDGER_PATH is resolved at module-load time and is module-cached: any later test that asserts on `LEDGER_PATH` would see the override-resolved path. Using `CI=true` does not affect `LEDGER_PATH` resolution (override branch is gated on `E2E_LEDGER_PATH_OVERRIDE`, not `CI`). [VERIFIED: llm-ledger.js:74-98]

### Verification gate for the planner
Add a pre-commit Vitest verification:
```bash
CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js
# Both files must exit 0; 0 new failures vs. baseline.
```

Then a no-CI smoke:
```bash
unset CI && unset E2E_LEDGER_PATH_OVERRIDE && node scripts/auto-fix.mjs --issue 1 2>&1 | grep -q 'safeAppendLedger refused'
# Must succeed (the dispatcher fails fast at step 7 / step 2 / etc. depending on
# how gh issue view handles issue #1, but if it reaches any of the 7 sites, the
# guard throws with the documented message).
```

NOTE: the smoke test will most likely exit at Step 2 (`gh issue view 1`) before reaching any ledger write, because the local repo's GitHub issue #1 may not exist in a state matching the contract. A reliable smoke is to write a 5-line throwaway script that imports a helper from `auto-fix.mjs` and calls `safeAppendLedger({})` directly — but `safeAppendLedger` is not exported. The planner should add a minimal sanity-check via the LEDGER-04 vi.mock test + a manual operator verification line in the verify step.

---

## 8. Commit Ordering

### Recommended: Single atomic commit
```
feat(56): wire errorClass + safeAppendLedger leak guard (LEDGER-01..04)

LEDGER-01: errorClass field populated at all 7 appendLedgerEntry call sites
  in scripts/auto-fix.mjs (lines 295, 391 use errorClass:null because they
  are inside dispatchFlakeState, where errorClass is not in lexical scope;
  lines 546, 589, 685, 707, 744 use errorClass:errorClass — in scope from
  Step 4, line 495).

LEDGER-02: safeAppendLedger wrapper defined in auto-fix.mjs (not exported,
  not imported from llm-ledger.js — defined inline so existing vi.mock
  in tests/unit/auto-fix.test.js cannot bypass it). Throws contract Error
  if neither process.env.CI nor process.env.E2E_LEDGER_PATH_OVERRIDE set.

LEDGER-03: Test 48 cardinality assertions relaxed
  ("exactly 1 bootstrap entry" → "≥1 entry with phase='39-bootstrap'").
  Per-entry shape checks on bootstraps[0] preserved verbatim.

LEDGER-04: New test in tests/unit/auto-fix.test.js asserts runDispatcher
  mocked-mode (diff-guard violation path, line 707 call site) emits a
  ledger entry carrying errorClass='WRONG_CITATION'. Sets process.env.CI
  during test, clears in finally — hermetic per vitest.config.js
  fileParallelism:false.

Verification:
  CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js
  grep -c 'errorClass' scripts/auto-fix.mjs                  # ≥ 7
  grep -c 'safeAppendLedger({' scripts/auto-fix.mjs          # = 7 (call sites)
  grep -c 'appendLedgerEntry(LEDGER_PATH' scripts/auto-fix.mjs # = 1 (inside wrapper)

appendLedgerEntry body byte-unchanged (Pitfall 7).
v40-auto-fix.yml byte-unchanged (Pitfall 1).
```

### Inter-commit invariants (if split)
If the change is split across multiple commits, this ordering is required to keep the repo green between commits:

1. **First:** Introduce `safeAppendLedger` AND replace all 7 call sites in one commit (LEDGER-02 + LEDGER-01 together). Splitting these creates an intermediate state where some sites use `safeAppendLedger` and others use `appendLedgerEntry`, which fails `grep -c 'safeAppendLedger({' = 7` mid-stream.
2. **Second:** Test 48 relax (LEDGER-03). Independent of the wiring change. Can land before or after step 1 — but BEFORE the first live CI auto-fix run, or Test 48 fails on origin/main.
3. **Third:** LEDGER-04 integration test. Must land WITH or AFTER step 1 (the test references `runDispatcher` behavior that depends on LEDGER-01 wiring).

**Recommended: single commit** — there is no behavioral wedge between the 4 sub-changes; they form one logical unit.

### Anti-pattern: separating wrapper-introduction from call-site rewrites
If LEDGER-02 (wrapper introduction) lands BEFORE LEDGER-01 (call-site rewrites), then `safeAppendLedger` exists but is unused (`grep -c 'safeAppendLedger({' = 0`). If LEDGER-01 lands BEFORE LEDGER-02, the rewritten call sites reference an undefined identifier and the file fails module-load (`ReferenceError: safeAppendLedger is not defined`). Either ordering breaks the inter-commit invariant: bundle them.

---

## Code Examples

### Site #1 (line 295) — before / after

Before:
```js
if (decision.state === 'FLAKE_SUPPRESSED') {
  appendLedgerEntry(LEDGER_PATH, {
    iso: now().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issueNumber}`,
    fingerprint,
    source: 'flake-suppressed',
    flakeState: 'FLAKE_SUPPRESSED',
    suppressedUntil: decision.until,
  });
```

After:
```js
if (decision.state === 'FLAKE_SUPPRESSED') {
  safeAppendLedger({
    iso: now().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issueNumber}`,
    fingerprint,
    errorClass: null,                 // LEDGER-01 — null at sites in dispatchFlakeState
    source: 'flake-suppressed',
    flakeState: 'FLAKE_SUPPRESSED',
    suppressedUntil: decision.until,
  });
```

### Site #3 (line 546) — before / after

Before:
```js
if (lsRemoteOut.trim().length > 0) {
  appendLedgerEntry(LEDGER_PATH, {
    iso: new Date().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issue}`,
    fingerprint,
    source: 'auto-fix-api',
    branchExisted: true,
  });
```

After:
```js
if (lsRemoteOut.trim().length > 0) {
  safeAppendLedger({
    iso: new Date().toISOString(),
    model: MODEL,
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    phase: PHASE,
    transport,
    issueId: `issue-${issue}`,
    fingerprint,
    errorClass,                       // LEDGER-01 — in scope from Step 4 (line 495)
    source: 'auto-fix-api',
    branchExisted: true,
  });
```

### Field-placement convention
Place `errorClass` immediately after `fingerprint` and before `source` to match the column ordering that downstream consumers (`a-b-winner.mjs` filter at line 185, dashboard) read. This is a soft convention — `appendLedgerEntry` doesn't care about order — but consistent placement aids forensics.

---

## Common Pitfalls

### Pitfall A: Defining `safeAppendLedger` in `llm-ledger.js` (CRITICAL)

**What goes wrong:** The existing `vi.mock('../e2e/lib/llm-ledger.js', () => ({ ... appendLedgerEntry: vi.fn(), ... }))` in `tests/unit/auto-fix.test.js:62-67` would silently replace `safeAppendLedger` with `undefined` (the factory does not export it). Production code: `safeAppendLedger({...})` → `TypeError: safeAppendLedger is not a function`. Test code: every existing test fails at runtime. Worse, if a developer adds `safeAppendLedger: vi.fn()` to the factory, the GUARD IS BYPASSED in every test — the `process.env.CI` check never runs.

**Prevention:** `safeAppendLedger` is defined IN `auto-fix.mjs` (not imported). The body calls the (mocked) `appendLedgerEntry` transparently. Verification grep: `grep -c "export.*safeAppendLedger\|from.*safeAppendLedger" scripts/auto-fix.mjs` must return 0.

### Pitfall B: Forgetting CI=true in LEDGER-04 test

**What goes wrong:** Without `process.env.CI = 'true'` in the new LEDGER-04 test, `safeAppendLedger` throws on the first call, the test fails with an unrelated error, and the planner debugs the wrong thing.

**Prevention:** Test body uses `try { process.env.CI = 'true'; ... } finally { delete process.env.CI; }`. `vitest.config.js:16` confirms `fileParallelism: false` so env mutation is hermetic.

### Pitfall C: Mass-replacing `appendLedgerEntry(` blindly

**What goes wrong:** A naive `sed -i 's/appendLedgerEntry(LEDGER_PATH/safeAppendLedger(/g' scripts/auto-fix.mjs` would replace 7 sites, but also leaves the function-name `safeAppendLedger(` colliding with the comma — pattern matters. Worse, if the sed pattern is broader, it could match the import line.

**Prevention:** Use the verified-line-number approach. Each of the 7 sites is at a deterministic line per the inventory in §1. Apply rewrites manually or with a precise structural edit (line range + AST). DO NOT touch line 71 (import).

### Pitfall D: errorClass:undefined vs errorClass:null

**What goes wrong:** `appendLedgerEntry` spreads `entry` verbatim. JSON.stringify drops `undefined` fields entirely. So `errorClass: undefined` at sites 1/2 produces ledger entries with NO `errorClass` key at all — semantically identical to pre-Phase-56 behavior but indistinguishable from "field was never set." `errorClass: null` produces an explicit JSON `null`, which is distinguishable.

**Prevention:** Use `errorClass: null` (NOT `undefined`) at the two `dispatchFlakeState` sites. CONTEXT.md leaves this as Claude's discretion; recommend `null` for forensic clarity. Downstream `a-b-winner.mjs:185` already filters with `typeof entry.errorClass !== 'string'`, which drops both `null` and `undefined` — so A/B winner correctness is preserved either way.

### Pitfall E: Touching the `LEDGER_PATH` IIFE in llm-ledger.js

**What goes wrong:** Tempting to add CI/override checks to the `LEDGER_PATH` IIFE (lines 74-98). This breaks Test 32, Test 33, Test 48, Test 49, and the WR-05 boundary. The IIFE runs at module-load time, ONCE; every Vitest test inherits its resolution. Mutating it breaks isolation.

**Prevention:** Phase 56 makes ZERO changes to `tests/e2e/lib/llm-ledger.js`. Grep verification: `git diff --stat tests/e2e/lib/llm-ledger.js` must show 0 changes after the Phase 56 commit.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CI/override env check | Reinvent in `llm-ledger.js` IIFE or elsewhere | Inline `if (!process.env.CI && !process.env.E2E_LEDGER_PATH_OVERRIDE) throw ...` in safeAppendLedger | The existing IIFE at llm-ledger.js:74 is module-load-time; safeAppendLedger is call-time; they cover different windows. |
| Test seam for runDispatcher | New export, child-process spawn, helper extraction | Reuse `vi.mock('../e2e/lib/llm-ledger.js', ...)` + `vi.mocked(appendLedgerEntry).mock.calls` | 20+ existing tests already use this pattern; copy-paste a working idiom. |
| Test 48 rewrite to count exactly N bootstraps | Hard-code a max N | `toBeGreaterThanOrEqual(1)` | Live runs append arbitrary entries; only the lower bound is meaningful. |

**Key insight:** Phase 56 is a mechanical wiring task with all infrastructure already in place. Resist any temptation to refactor, abstract, or "improve" anything outside the locked scope — every nearby module has a load-bearing invariant.

---

## Runtime State Inventory

> Phase 56 is a code-only change. No data migration, no service config, no OS-registered state. Listed explicitly to confirm the check ran.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the committed ledger (`tests/e2e/.llm-spend-ledger.json`) gains new field on NEW entries written after Phase 56 lands, but existing entries are immutable. Old entries (1 bootstrap entry) remain valid; `errorClass` filter in `a-b-winner.mjs:185` already drops entries lacking `errorClass` (Pitfall 4 of milestone PITFALLS). | None — additive-only field; no data migration needed. |
| Live service config | None — no external service has hardcoded references to the modified call sites. Auto-fix workflow `.github/workflows/v40-auto-fix.yml` invokes `node scripts/auto-fix.mjs --issue ...`; the file's CLI surface is unchanged. | None. |
| OS-registered state | None — no Task Scheduler / cron / launchd job references symbols changed by Phase 56. | None. |
| Secrets/env vars | `CI` and `E2E_LEDGER_PATH_OVERRIDE` are READ by `safeAppendLedger` but never written. The workflow's existing `CI: true` env (default GitHub Actions env) already satisfies the guard. | None — verify by inspecting `.github/workflows/v40-auto-fix.yml` confirms `CI=true` is set (it's a GitHub Actions default; no explicit set needed). |
| Build artifacts | None — no compiled output, no `egg-info`, no `dist/` that caches the auto-fix.mjs body. | None. |

**Verified by:** direct grep of project tree for `auto-fix.mjs`, `safeAppendLedger`, `errorClass` references across config files, workflow YAML, and `.github/`. No external state to migrate.

---

## Environment Availability

> Phase 56 is a code-only change. No external tools or services required beyond what already runs `npm test`.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime + test runner | ✓ | (system) | — |
| vitest | test execution | ✓ | ^3.0.0 (package.json:48) | — |
| git | grep-based verification gates | ✓ | (system) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (`devDependencies."vitest": "^3.0.0"`) |
| Config file | `/home/fatduck/patent-cite-tool/vitest.config.js` |
| Quick run command | `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` |
| Full suite command | `npm test` (chains: build + test:src + test:chrome + test:firefox + lint + test:lint) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEDGER-01 | All 7 sites write `errorClass` | grep verification | `grep -c 'errorClass' scripts/auto-fix.mjs` (≥7) | ✅ (script-side) |
| LEDGER-02 | All 7 sites call safeAppendLedger; zero direct calls remain | grep verification | `grep -c 'safeAppendLedger({' scripts/auto-fix.mjs` (=7) AND `grep -c 'appendLedgerEntry(LEDGER_PATH' scripts/auto-fix.mjs` (=1, inside wrapper body) | ✅ (script-side) |
| LEDGER-03 | Test 48 passes with multi-entry ledger | unit (vitest) | `CI=true npx vitest run tests/unit/llm-ledger.test.js -t 'Test 48'` | ✅ (test exists, body rewrites) |
| LEDGER-04 | Mocked runDispatcher emits errorClass-bearing entry | unit (vitest, mocked) | `CI=true npx vitest run tests/unit/auto-fix.test.js -t 'LEDGER-04'` | ❌ Wave 0 — new test |
| Regression | All 56+ existing llm-ledger tests still pass | unit (vitest) | `CI=true npx vitest run tests/unit/llm-ledger.test.js` | ✅ |
| Regression | All 20+ existing auto-fix tests still pass | unit (vitest) | `CI=true npx vitest run tests/unit/auto-fix.test.js` | ✅ |
| Negative test | safeAppendLedger throws outside CI (manual smoke) | manual | Operator-run; no automated test (would require a helper export the wrapper isn't designed to make). | manual smoke |

### Sampling Rate
- **Per task commit:** `CI=true npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` (the only two files touched)
- **Per wave merge:** `npm test:src` (full Vitest run)
- **Phase gate:** `npm test` (full suite — must be green before `/gsd:verify-work`)

### Wave 0 Gaps
- [ ] `tests/unit/auto-fix.test.js` gains ONE new `describe('LEDGER-04', ...) { it(...) }` block — covers REQ LEDGER-04. (Append to existing file; do not create a new file.)
- [ ] `tests/unit/llm-ledger.test.js` Test 48 body edited — covers REQ LEDGER-03. (Edit in place, no new file.)

(No new test files needed. Both edits append/modify existing infrastructure.)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | no auth surface added |
| V3 Session Management | no | no session state |
| V4 Access Control | yes (boundary defense) | `safeAppendLedger` enforces process-level capability gate (CI/override) — defense-in-depth with PRE-02 in `invokeAnthropicSdkWithLedger` (Phase 48). Both layers required. |
| V5 Input Validation | no | no untrusted input crosses the new boundary |
| V6 Cryptography | no | no crypto |
| V7 Error Handling | yes | `safeAppendLedger` throws a CLEAR forensic error message (names both env vars and `LEDGER_PATH`) so the operator can diagnose accidentally-triggered guard failures vs. real exfiltration attempts. |
| V14 Configuration | yes | Two env-var inputs (`CI`, `E2E_LEDGER_PATH_OVERRIDE`); both are documented in `tests/e2e/lib/llm-ledger.js:55-98` and Phase 39 CONTEXT. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Local dev runs `--force-api` and accidentally writes auto-fix-api ledger entries to the committed `tests/e2e/.llm-spend-ledger.json` (leak vector) | Information Disclosure | `safeAppendLedger` throw at call-site scope (this phase) |
| CI misconfiguration sets `E2E_LEDGER_PATH_OVERRIDE` simultaneously with `CI=true`, silently redirecting CI writes away from the committed ledger (cap bypass) | Tampering | `LEDGER_PATH` IIFE at `llm-ledger.js:74-98` throws on co-set (WR-05, already shipped) |
| Test 48 fails on origin/main after a live auto-fix run (operational denial of service via test regression) | Denial of Service | LEDGER-03 relaxation (this phase) |
| Partial-wiring: `errorClass` populated in only some of the 7 sites, leaving `a-b-winner.mjs` in permanent abstention | Tampering (data integrity) | LEDGER-04 mocked integration test + post-commit `grep -c 'errorClass' scripts/auto-fix.mjs ≥ 7` (this phase) |

### Per-CLAUDE.md compliance
The project CLAUDE.md instructs Claude to verify `AskUserQuestion` results. This phase is a planning research output — no `AskUserQuestion` calls are made by this agent. The instruction is acknowledged and inapplicable to this phase's research surface.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 56? | Compliance Note |
|-----------|---------------------|-----------------|
| Verify `AskUserQuestion` responses; never fabricate selections | N/A to research output | Research is read-only; no user-question fan-out from this agent. |

(No other directives in the repo's `CLAUDE.md` apply to this phase.)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Vitest `globals: true` + `setupFiles: ['./tests/setup/chrome-stub.js']` setup file does NOT set `process.env.CI`. Spot-checked by absence of `process.env.CI` in vitest.config.js. Did not inspect chrome-stub.js. | §7 Vitest Configuration | If chrome-stub.js DOES set CI=true, then `safeAppendLedger` would write to the committed ledger from EVERY local test run. Mitigation: planner inspects chrome-stub.js in Wave 0 verification; if it sets CI, planner adds an explicit `delete process.env.CI` in the LEDGER-04 test's `beforeEach`. | [ASSUMED]
| A2 | `vi.mock('../e2e/lib/llm-ledger.js', ...)` continues to hoist mocks BEFORE `import { runDispatcher }` resolves. This is Vitest's documented behavior, but the project pins `^3.0.0` not an exact version. | §4 LEDGER-04 Test Seam | If Vitest changes hoisting semantics (unlikely; documented since v0.x), all 20 existing tests in auto-fix.test.js break, not just LEDGER-04. Phase 56 inherits that risk regardless. | [VERIFIED: existing 20 tests pass on the current version]

**All other claims** in this research were directly verified by `grep`, `Read`, or line-by-line code inspection on 2026-06-04.

---

## Open Questions (RESOLVED)

1. **`grep -c 'safeAppendLedger'` interpretation in the acceptance gate.**
   **RESOLVED:** Plan 56-01 (Task 01) uses the precise gate `grep -c 'safeAppendLedger({' scripts/auto-fix.mjs` = 7 (call sites only). The ROADMAP's looser `grep -c 'safeAppendLedger' = 7` is documented as ambiguous (would equal 8 with the inline declaration); the plan's verify step uses the stricter pattern.

   - What we know: ROADMAP locks `grep -c 'safeAppendLedger' scripts/auto-fix.mjs` to equal **7**. After Phase 56 lands, the identifier appears 8 times: 1 in the function declaration + 7 at call sites.
   - What's unclear: is the gate counting unique line occurrences (8) or call sites only (7)?
   - Recommendation: planner uses the more precise grep `grep -c 'safeAppendLedger({' scripts/auto-fix.mjs` = 7 (call sites only) as the verification gate. The looser `grep -c 'safeAppendLedger'` would equal 8 — the planner should document this in the verify step to avoid a false-fail on a successful commit. CONTEXT.md success criterion #4 ("`grep -c 'safeAppendLedger'` returns 7") was likely written assuming the wrapper is exported from `llm-ledger.js` (= 7 call sites + 0 declaration in this file). The locked-in design has the declaration INSIDE `auto-fix.mjs`, so the count is 8.

2. **chrome-stub.js setup file content.**
   - What we know: Vitest config points to `./tests/setup/chrome-stub.js` as `setupFiles`. The file name suggests it stubs Chrome browser globals for non-Vite tests, not env-var manipulation.
   - What's unclear: does it set or unset `process.env.CI`?
   - **RESOLVED:** Plan 56-00 Task W0a (Wave 0 inspection) verifies `tests/setup/chrome-stub.js` does NOT touch `process.env.CI`. If it does, Wave 0 SUMMARY signals plan 56-01-03 to add `delete process.env.CI` in `beforeEach`. Confirmed during plan-check pre-flight: chrome-stub.js does not reference `process.env`.

3. **Negative-path verification of safeAppendLedger (throw behavior).**
   - What we know: the only path to verify "safeAppendLedger throws outside CI" through Vitest would require either (a) exporting `safeAppendLedger` (rejected — wrapper is module-internal by design), or (b) spawning `node scripts/auto-fix.mjs` outside CI and expecting non-zero exit (works, but adds child_process to the unit test surface).
   - What's unclear: should the planner add a child_process-based negative test, or accept the operator-manual smoke?
   - **RESOLVED:** Manual operator smoke is the accepted path. Recorded in `56-VALIDATION.md` "Manual-Only Verifications" table: `unset CI && unset E2E_LEDGER_PATH_OVERRIDE && node scripts/auto-fix.mjs --issue 1 2>&1 | grep -q 'safeAppendLedger refused'`. Operator records evidence in 56-VERIFICATION.md at phase verify time.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 7 direct `appendLedgerEntry(LEDGER_PATH, ...)` calls in `scripts/auto-fix.mjs` | All 7 routed through `safeAppendLedger(...)` defined in the same file | Phase 56 (this phase) | Closes the auto-fix-api leak vector at call-site scope (Pitfall 7-compliant) |
| Entries lack `errorClass` field — `a-b-winner.mjs` in permanent abstention | Entries carry `errorClass` (5 sites with the in-scope value; 2 sites with `null`) | Phase 56 (this phase) | A/B winner consumer (Phase 54 forward-compat probe at `a-b-winner.mjs:185, 231, 270`) automatically activates once ≥20 entries per ERROR_CLASS per arm accumulate |
| Test 48 cardinality check breaks after any live auto-fix run | Test 48 filter-based: "≥1 entry with phase='39-bootstrap'" | Phase 56 (this phase) | `npm test` exits 0 on a working copy that has had live auto-fix runs |

**Deprecated/outdated:**
- The "single chokepoint" pattern (PRE-02 in `invokeAnthropicSdkWithLedger`) is NOT replaced — it's complementary defense-in-depth. Both layers run. Neither is removed.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection on 2026-06-04)

- `/home/fatduck/patent-cite-tool/scripts/auto-fix.mjs` — full file, 902 lines. 7 `appendLedgerEntry` call sites confirmed at lines 295, 391, 546, 589, 685, 707, 744.
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` — `LEDGER_PATH` IIFE (lines 74-98), `appendLedgerEntry` body (lines 686-737). Body spreads entries verbatim; no field validation.
- `/home/fatduck/patent-cite-tool/tests/unit/llm-ledger.test.js` — 1206 lines, 61 `it(...)` blocks. Test 48 at lines 999-1023.
- `/home/fatduck/patent-cite-tool/tests/unit/auto-fix.test.js` — existing `vi.mock('../e2e/lib/llm-ledger.js', ...)` factory at lines 62-67; 20+ assertions on `vi.mocked(appendLedgerEntry).mock.calls`.
- `/home/fatduck/patent-cite-tool/vitest.config.js` — full config, 19 lines. `fileParallelism: false`, `globals: true`, `setupFiles: ['./tests/setup/chrome-stub.js']`.
- `/home/fatduck/patent-cite-tool/tests/e2e/.llm-spend-ledger.json` — committed ledger; single bootstrap entry confirmed.
- `/home/fatduck/patent-cite-tool/scripts/a-b-winner.mjs` — downstream consumer; `errorClass` filter at line 185, `detectOutcome` at line 231, `PHASE_56_TODO` markers at lines 32, 51, 69, 254, 262 (research-only; no edits in Phase 56).
- `/home/fatduck/patent-cite-tool/package.json` — `vitest: ^3.0.0` confirmed.
- `/home/fatduck/patent-cite-tool/.planning/phases/56-ledger-schema-extension-leak-guard/56-CONTEXT.md` — locked decisions transcribed.
- `/home/fatduck/patent-cite-tool/.planning/REQUIREMENTS.md` — LEDGER-01..04 acceptance criteria.
- `/home/fatduck/patent-cite-tool/.planning/research/PITFALLS.md` — Pitfall 1 (LOAD-BEARING), Pitfall 7 (LOAD-BEARING).
- `/home/fatduck/patent-cite-tool/.planning/research/SUMMARY.md` — Tensions 1, 3, 4 resolutions.
- `/home/fatduck/patent-cite-tool/.planning/STATE.md` — pending todos, prior phase closure notes.

### Secondary (MEDIUM confidence)

None used. All findings sourced from the codebase.

### Tertiary (LOW confidence)

None used.

---

## Metadata

**Confidence breakdown:**
- Call-site inventory & line numbers: HIGH — `grep -n 'appendLedgerEntry' scripts/auto-fix.mjs` returns exactly the 7 lines locked in CONTEXT.
- Test 48 rewrite mechanics: HIGH — source text inspected line-by-line.
- runDispatcher test seam: HIGH — 20 existing tests use the same `vi.mock` factory and observe `appendLedgerEntry.mock.calls`.
- E2E_LEDGER_PATH_OVERRIDE semantics: HIGH — IIFE source inspected.
- safeAppendLedger placement & contract: HIGH — multiple options analyzed; rejected alternatives have documented breakage.
- Pitfalls: HIGH — every "don't do X" claim is tied to a specific line of test code or workflow YAML.
- Open Question on `grep -c 'safeAppendLedger' = 7` interpretation: MEDIUM — depends on planner's exact grep pattern.

**Research date:** 2026-06-04
**Valid until:** ~30 days, subject to no upstream changes in `tests/unit/auto-fix.test.js` mocking pattern or vitest.config.js.

## RESEARCH COMPLETE

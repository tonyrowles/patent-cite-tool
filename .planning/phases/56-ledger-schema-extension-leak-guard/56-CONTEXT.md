# Phase 56: Ledger Schema Extension + Leak Guard - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — smart discuss skipped)

<domain>
## Phase Boundary

Every `auto-fix.mjs` call site writes `errorClass` into the ledger entry; a `safeAppendLedger` wrapper enforces the CI/override guard at call-site scope; `npm test` exits 0 on a working copy that has had live auto-fix runs.

Requirements covered: LEDGER-01, LEDGER-02, LEDGER-03, LEDGER-04.

Scope-locked anti-features (from research/PITFALLS.md + REQUIREMENTS.md "Out of Scope"):
- Guard must NOT go into `appendLedgerEntry` body (Pitfall 7, LOAD-BEARING — breaks 33 existing llm-ledger tests)
- `v40-auto-fix.yml` ledger-commit step is NOT in scope (Pitfall 1, LOAD-BEARING — Phase 57 territory; this phase only touches `scripts/auto-fix.mjs` + `tests/unit/llm-ledger.test.js`)
- `appendLedgerEntry` body byte-unchanged
- Zero new npm dependencies

</domain>

<decisions>
## Implementation Decisions

### Pre-Locked by Research Synthesis (.planning/research/SUMMARY.md)

- **Guard placement:** `safeAppendLedger(entry)` wrapper inside `scripts/auto-fix.mjs` scope; checks `process.env.CI || process.env.E2E_LEDGER_PATH_OVERRIDE`; throws contract error if neither set; calls `appendLedgerEntry(LEDGER_PATH, entry)` on success (Tension 3 resolution).
- **Call-site count:** 7 `appendLedgerEntry(LEDGER_PATH, ...)` invocations in `scripts/auto-fix.mjs` at lines ~295, ~391, ~546, ~589, ~685, ~707, ~744 (Tension 4 resolution; verified by codebase scout). All 7 replaced with `safeAppendLedger(...)` — zero direct calls remain in `scripts/auto-fix.mjs`.
- **errorClass field:** Wired into the 7 `scripts/auto-fix.mjs` sites ONLY. Sites in `tests/e2e/lib/llm-driver.js` (3) and `tests/e2e/scripts/e2e-explore.mjs` (2) are explicitly OUT of scope (transport/exploratory layers — no ERROR_CLASS concept). `errorClass` is sourced from `auto-fix.mjs` Step 7's `errorClass` variable (line 495: `const errorClass = extractErrorClass(issueJson.labels)`).
- **Test 48 fix:** Assertion relaxed from "exactly 1 bootstrap entry" to "≥1 entry with `phase='39-bootstrap'`" in `tests/unit/llm-ledger.test.js`. Live auto-fix runs may append additional `phase='39-bootstrap'` entries; the regression must not fail.
- **Outcome field:** Phase 56 does NOT write `outcome` entries. That belongs to Phase 58 (PROMOTE-02 / PROMOTE-03 / auto-fix-promote.mjs). Phase 56 wires `errorClass` only.
- **MODEL const cleanup:** NOT in Phase 56 scope. Moved to Phase 60 (CLEAN-01) per v4.2 ROADMAP.
- **Pre-flight call sites without `errorClass` in scope:** The line 295 site (early Step 1 bootstrap before `extractErrorClass` runs) and line 391 site (post-dispatch fork) need `errorClass` resolved from whichever scope is live — line 295 is BEFORE Step 7 so `errorClass` is not yet known; document this and either default to `null`/`undefined` (additive) or hoist a single `let errorClass = null` declaration above and assign at Step 7 (preferred — simpler, additive, idiomatic).

### Claude's Discretion (during plan-phase)

Implementation details left to planner:
- Wrapper signature shape (`safeAppendLedger(entry)` vs. `safeAppendLedger(ledgerPath, entry)`; recommended: single-arg `safeAppendLedger(entry)` that closes over `LEDGER_PATH` — matches REQUIREMENTS.md LEDGER-02 wording)
- Error message text and class (recommended: throw `Error` with clear "safeAppendLedger refused: ..." message naming both env vars and the actual `LEDGER_PATH` value)
- Test 48 assertion rewrite mechanics (`expect(bootstraps.length).toBeGreaterThanOrEqual(1)` + filter on `e.phase === '39-bootstrap'`; preserves the existing `expect(it.phase).toBe('39-bootstrap')` per-entry check)
- LEDGER-04 integration test mechanism — either (a) invoke an exported helper or (b) `vi.mock` + drive a function that emits a ledger entry. Recommendation: export the minimal slice needed (likely the dispatcher's appendLedger call or a small helper) without altering production code signatures; if a clean test-seam doesn't exist, use a `child_process` spawn with mocked env. Planner picks the lowest-friction approach that does not soften the auto-fix.mjs trust boundary.
- Commit ordering: recommended single atomic commit `feat(56): wire errorClass + safeAppendLedger leak guard (LEDGER-01..04)` if mechanically feasible; if split, LEDGER-02 (wrapper introduction) MUST land before or with LEDGER-01 (call-site rewrites) to keep the repo green between commits.
- Variable scope strategy for `errorClass` at the early line ~295 / ~391 call sites (default to `null`, or hoist `let errorClass = null`).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `appendLedgerEntry(ledgerPath, entry)` — `tests/e2e/lib/llm-ledger.js:686`; append-only JSONL; takes arbitrary entry shape (spread-pattern compatible — additive `errorClass` field requires zero changes to the function body).
- `E2E_LEDGER_PATH_OVERRIDE` mechanism — already implemented in `llm-ledger.js` with built-in CI/GITHUB_ACTIONS guard that errors out if both `CI` and `E2E_LEDGER_PATH_OVERRIDE` are set together (lines 75-90). The safeAppendLedger wrapper layers on top: at call sites, require *one or the other* to be set so local non-CI invocations cannot silently mutate the committed ledger.
- `extractErrorClass(issueJson.labels)` — `scripts/auto-fix.mjs:495` resolves the per-issue ERROR_CLASS used as the routing key.
- Existing Phase 48 `invokeAnthropicSdkWithLedger` PRE-02 guard — protects SDK-path writes; complementary to (not redundant with) the new auto-fix.mjs call-site guard. Both must coexist.

### Established Patterns
- All ledger writes flow through `appendLedgerEntry(LEDGER_PATH, { ... })`; entry shape is open (spread pattern); adding `errorClass: <string|null>` is a pure additive change.
- Vitest tests in `tests/unit/` pass tmp paths directly to `appendLedgerEntry` and rely on the path argument to redirect writes — the safeAppendLedger wrapper does NOT touch this contract (it operates one layer above).
- Conventional commits: `feat(NN): ...` for new behavior, `fix(NN): ...` for bug fixes, `chore(NN): closure` for phase closure (per v4.1 phase histories).

### Integration Points
- `scripts/auto-fix.mjs:71` import statement (`appendLedgerEntry` already imported; no new import needed unless tests require additional symbols).
- `scripts/auto-fix.mjs:495` — `errorClass` variable resolved in Step 7. Call sites at lines ~546, ~589, ~685, ~707, ~744 are downstream and can read `errorClass` directly. Sites at lines ~295 (Step 1 bootstrap) and ~391 (post-dispatch) are upstream — pick the `null` default or hoist strategy noted above.
- `tests/unit/llm-ledger.test.js:999-1018` — Test 48; assertion at line 1018 (`expect(it.phase).toBe('39-bootstrap')`) is per-entry and stays; the "exactly 1" cardinality assertion (immediately before line 999/1018 in the same `it()` block) is what relaxes.
- `scripts/a-b-winner.mjs` — DOWNSTREAM CONSUMER of `errorClass` in ledger entries; no code changes here in Phase 56 (forward-compat probe already present per Phase 54 close).

</code_context>

<specifics>
## Specific Ideas

No specific design references beyond the locked invariants. Implementation is a mechanical wiring change against pre-identified line numbers, gated by 3 hard verification commands:
- `grep -c 'errorClass' scripts/auto-fix.mjs` ≥ 7
- `grep -c 'safeAppendLedger' scripts/auto-fix.mjs` = 7 (with zero direct `appendLedgerEntry(LEDGER_PATH, ...)` remaining)
- `npm test` exits 0 (covers Test 48 relaxation AND the 33 existing llm-ledger tests staying green AND the new LEDGER-04 integration test)

</specifics>

<deferred>
## Deferred Ideas

- `outcome` / `pr_merged` field wiring — owned by Phase 58 (PROMOTE-02, PROMOTE-03)
- MODEL const cleanup in `scripts/auto-fix.mjs` — owned by Phase 60 (CLEAN-01)
- Ledger-snapshot branch-redirect in `v40-cost-ledger-snapshot.yml` — owned by Phase 57 (COMMIT-01)
- Removing leak-guard from `tests/e2e/lib/llm-driver.js` PRE-02 path — explicitly NOT removed (defense-in-depth; both layers required)

</deferred>

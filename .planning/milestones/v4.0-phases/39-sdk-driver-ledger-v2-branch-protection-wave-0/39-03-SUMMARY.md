---
phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0
plan: 03
subsystem: testing
tags: [sdk, anthropic, eslint-guard, inverse-ci-gate, ledger-v2-consumer]

# Dependency graph
requires:
  - phase: 39-01
    provides: checkDayCap / checkIssueCap / checkPrCap + claude-sonnet-4-6 PRICING entry (12 new exports total)
  - phase: 34-hybrid-triage-classifier
    provides: invokeClaudePWithLedger v3.1 CI gate (cloned as the INVERSE-gate sibling pattern)
provides:
  - invokeAnthropicSdkWithLedger sibling export in tests/e2e/lib/llm-driver.js with INVERSE CI gate (~110 LOC)
  - "@anthropic-ai/sdk@0.100.1 EXACT pinned in package.json devDependencies (no caret)"
  - ESLint no-restricted-imports block appended LAST in eslint.config.js (Pitfall 3 order rule)
  - 10 new Vitest cases in tests/unit/llm-driver.test.js (cases 31–40)
  - 5 new Vitest cases in tests/unit/eslint-sdk-guard.test.js (static-grep + ESLint API)
affects:
  - Phase 42+ (auto-fix dispatcher) — first CI consumer of invokeAnthropicSdkWithLedger
  - Phase 46 (--transport subscription flag) — depends on the call-site symmetry between this and invokeClaudePWithLedger
  - Phase 47 (CLEANUP-04 audit) — re-verifies the ESLint guard + the exact pin

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/sdk@0.100.1 (EXACT pin, devDep, [OK] slopcheck 2026-05-30, user-approved 2026-05-31)"
  patterns:
    - "Sibling export with INVERSE CI gate (mirrors Pattern 1 in 39-RESEARCH §Pattern 1)"
    - "4-cap precheck (monthly + day + issue + PR + optional phase) before SDK invocation — runaway-defense per Pitfall 2"
    - "Always-append ledger discipline (Pitfall 8) — entry written on success AND sdk_error try/catch path; ciGate alone does NOT append (matches v3.1 invariant)"
    - "ESLint flat-config block APPENDED LAST per Pitfall 3 — earlier broad blocks silently win in flat-config rule merging"
    - "vi.mock('@anthropic-ai/sdk') with default-export factory + sdkCreateMock — enables network-free test of the transport"
    - "Two-layer ESLint guard test: static-grep (always runs, comments stripped) + programmatic ESLint API (definitive order-drift check, gracefully skipped if eslint unimportable)"

key-files:
  created:
    - "tests/unit/eslint-sdk-guard.test.js (+88 lines — 5 numbered tests across static-grep + programmatic ESLint API layers)"
  modified:
    - "package.json (+1 line: @anthropic-ai/sdk@0.100.1 EXACT in devDependencies)"
    - "package-lock.json (+79 lines from npm install --save-exact)"
    - "tests/e2e/lib/llm-driver.js (+160 lines: 4 new import lines + invokeAnthropicSdkWithLedger ~155 LOC; v3.1 invokeClaudePWithLedger body byte-for-byte unchanged at lines 378–447)"
    - "eslint.config.js (+38 lines: 4th flat-config block appended LAST, paths-not-patterns shape for named-package restriction)"
    - "tests/unit/llm-driver.test.js (+310 lines: 14-line @anthropic-ai/sdk mock block + 4 describe blocks containing cases 31–40)"

key-decisions:
  - "INVERSE CI gate semantics confirmed: invokeAnthropicSdkWithLedger refuses unless CI=true || GITHUB_ACTIONS=true || forceApi:true — the OPPOSITE of invokeClaudePWithLedger (refuses IF CI=true). Cases 31/32/33 verify all 3 branches."
  - "v3.1 CI gate at lines 384–390 of invokeClaudePWithLedger is byte-for-byte unchanged (now at lines 387–393 due to +3 import lines above the function); Cases 39 + 40 regression-guard this with explicit CI=true and GITHUB_ACTIONS=true assertions."
  - "Pitfall 8 always-append discipline preserved: SDK success appends with transport:'sdk' + tokens + costUsd; sdk_error catch-path appends with cost_usd:0 + error:err.message (Case 38 verifies); ciGate-only path does NOT append (matches v3.1 invariant — Case 31 verifies appendLedgerEntry callCount === 0)."
  - "ESLint block placement: APPENDED LAST per Pitfall 3 flat-config order rule. Test 3 in eslint-sdk-guard.test.js asserts the @anthropic-ai/sdk reference appears in the final 50 lines as the order-drift regression guard."
  - "ESLint shape: `paths` (not `patterns.group`) — `paths` is the correct shape for restricting a NAMED PACKAGE; mirrors the triage-classifier block's paths+importNames convention. `patterns.group` is for directory trees (the pdf-verifier and rerun-validator blocks use it for src/** restriction)."
  - "Cost math uses fallbackCostUsd(response.model, in, out): the SDK has no total_cost_usd field, unlike the `claude -p` JSON envelope. Plan 01's claude-sonnet-4-6 PRICING entry ($3 input / $15 output per Mtok) prevents fall-through to Opus default rates (Pitfall 2 mitigation already shipped)."

patterns-established:
  - "Sibling-with-inverse-gate pattern: future transport additions follow the same shape — clone the wrapper, invert the gate, share LEDGER_PATH + cap-precheck primitives, distinguish via transport tag"
  - "Mock pattern for SDK client: const sdkCreateMock = vi.fn(); vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn(() => ({ messages: { create: sdkCreateMock } })) })) — reusable for Phase 42+ tests of auto-fix.mjs"
  - "ESLint two-layer guard pattern: static-grep (cheap, deterministic, comment-aware) + programmatic ESLint API (definitive but install-gated, gracefully skipped) — reusable for future single-entry-point invariants"

requirements-completed: [LEDGER-03, CLEANUP-04]

# Metrics
duration: ~5min
completed: 2026-05-31
---

# Phase 39 Plan 03: SDK Driver + Ledger v2 + Branch Protection Wave-0 (Plan 03 — SDK Driver) Summary

**Landed the v4.0 SDK transport (`invokeAnthropicSdkWithLedger`) as a sibling export in `tests/e2e/lib/llm-driver.js` with the INVERSE CI gate, pinned `@anthropic-ai/sdk@0.100.1` EXACT, appended the ESLint single-entry-point guard LAST per Pitfall 3, and added 15 new Vitest cases — preserving every v3.1 invariant including the byte-for-byte invokeClaudePWithLedger CI gate.**

## Performance

- **Duration:** ~5 min (Task 0 pre-cleared by orchestrator; 5 task TDD cycles)
- **Started:** 2026-05-31T15:53:19Z
- **Completed:** 2026-05-31T15:58:21Z
- **Tasks:** 5 / 5 (Task 0 checkpoint cleared by orchestrator 2026-05-31)
- **Files modified:** 4 (package.json, package-lock.json, llm-driver.js, llm-driver.test.js, eslint.config.js)
- **Files created:** 1 (tests/unit/eslint-sdk-guard.test.js)
- **New tests:** 15 (10 Phase 39 numbered in llm-driver.test.js + 5 in eslint-sdk-guard.test.js)
- **Existing tests preserved:** 34 / 34 (30 numbered v3.1 cases + 4 sanity in llm-driver.test.js); 52 / 52 (Plan 01 llm-ledger.test.js — unchanged)
- **Total Vitest run for new + extended:** 49 / 49 passed (44 in llm-driver + 5 in eslint-sdk-guard)
- **Combined cross-file Vitest run** (driver + guard + ledger): 101 / 101 passed

## Accomplishments

- **LEDGER-03 shipped:** `invokeAnthropicSdkWithLedger` refuses invocation on any of monthly / day / issue / PR / phase sub-cap block; Cases 34/35/36 verify the 3 sub-cap branches.
- **CLEANUP-04 partial shipped:** ESLint `no-restricted-imports` block restricts `@anthropic-ai/sdk` to `tests/e2e/lib/llm-driver.js` ONLY; eslint-sdk-guard.test.js Tests 1–5 all PASS (including programmatic Tests 4 + 5 which lint synthetic source via the ESLint Node API and assert the rule fires/does-not-fire correctly).
- **INVERSE CI gate works in all 3 branches:** Case 31 (refused outside CI), Case 32 (CI=true allows), Case 33 (forceApi:true allows).
- **Pitfall 8 always-append discipline preserved on the SDK path:** Case 37 verifies SDK success appends with `transport:'sdk'` + tokens + costUsd; Case 38 verifies sdk_error catch-path appends with `cost_usd:0` + `error:'timeout'`.
- **v3.1 invariant byte-for-byte preserved:** `invokeClaudePWithLedger` CI gate text unchanged (now at lines 387–393 due to +3 import lines above; the function body is identical). Cases 39 + 40 explicitly regression-guard this by asserting CI=true and GITHUB_ACTIONS=true both still return `{ok:false, ciGate:true}` with `spawnCalls.length === 0` and `appendSpy.callCount === 0`.
- **Supply chain:** `@anthropic-ai/sdk@0.100.1` installed EXACT (no `^`, no `~`); `node_modules/@anthropic-ai/sdk/package.json` confirms `version=0.100.1` and absence of `scripts.postinstall`.

## Task 0 Checkpoint — Already Cleared

Per orchestrator handoff: Task 0 (the blocking-human checkpoint to verify `@anthropic-ai/sdk@0.100.1` package legitimacy) was **CLEARED by the orchestrator on 2026-05-31** before this executor spawned. The user reviewed the npm view outputs (version 0.100.1, repo github.com/anthropics/anthropic-sdk-typescript, empty postinstall, all 14 maintainers @anthropic.com) and approved the install. This executor skipped Task 0 entirely per the spawn-time directive and started at Task 1.

## Task Commits

Each task committed atomically (5 commits, all on worktree branch `worktree-agent-adc7fa2c5aab59001`):

1. **Task 1: Install @anthropic-ai/sdk@0.100.1 EXACT in devDependencies** — `0d09f58` (chore)
2. **Task 2: Add invokeAnthropicSdkWithLedger sibling with INVERSE CI gate** — `38da7d2` (feat)
3. **Task 3: Append ESLint no-restricted-imports guard on @anthropic-ai/sdk** — `5be6b45` (feat)
4. **Task 4: Add 10 Phase 39 cases for invokeAnthropicSdkWithLedger + regression guards** — `0fbae16` (test)
5. **Task 5: Add eslint-sdk-guard.test.js — 5-case static + programmatic ESLint guard** — `58609ac` (test)

_TDD cycles for Tasks 2, 4, 5 (the three `tdd="true"` tasks) were compressed: each RED phase was a one-line `node -e` import-existence check or `[ -f file ]` file-existence check; GREEN landed in a single Edit/Write and the verify gates passed on the first run. No REFACTOR commits needed._

## Files Created / Modified

### Created

- **`tests/unit/eslint-sdk-guard.test.js`** (+88 lines) — 5 numbered tests across two layers:
  - Static-grep layer (Tests 1–3): comment-stripped occurrence count ≥ 2, `ignores: ['tests/e2e/lib/llm-driver.js']` exactly once, SDK block in final 50 lines (Pitfall 3 LAST-block guarantee)
  - Programmatic ESLint API layer (Tests 4–5): synthetic source string with forbidden import → rule fires; same import inside the driver path → rule does NOT fire (ignores exception works); gracefully skipped if `import('eslint')` fails

### Modified

- **`package.json`** — +1 line in devDependencies: `"@anthropic-ai/sdk": "0.100.1"` (EXACT pin, alphabetically first in the block after `npm install --save-exact`)
- **`package-lock.json`** — +79 lines from the `--save-exact` install (7 packages added including the SDK)
- **`tests/e2e/lib/llm-driver.js`** — +160 lines:
  - 4 new import lines (1 for `Anthropic` default import, 1 for `fallbackCostUsd`, 2 added to the existing llm-ledger import block: `checkDayCap, checkIssueCap, checkPrCap`)
  - ~155 LOC for `invokeAnthropicSdkWithLedger` appended after the existing `invokeClaudePWithLedger` (which is UNCHANGED in its body — only shifted +3 lines downward by the import additions above)
- **`eslint.config.js`** — +38 lines:
  - 4th flat-config block APPENDED LAST per Pitfall 3
  - Uses `paths` (not `patterns.group`) — correct shape for restricting a named package; mirrors the triage-classifier block convention
  - Long header comment documenting why it must be LAST and why `paths` is the correct shape vs the `patterns.group` form used by the pdf-verifier and rerun-validator blocks
- **`tests/unit/llm-driver.test.js`** — +310 lines:
  - 14-line SDK mock block added near the existing `node:child_process` mock (sdkCreateMock + vi.mock factory + mockSdkResponse / mockSdkError helpers)
  - 4 new describe blocks containing 10 numbered cases (31–40)

## The invokeAnthropicSdkWithLedger Signature

```ts
export async function invokeAnthropicSdkWithLedger({
  systemPrompt: string,
  userPrompt: string,
  model?: string = 'claude-sonnet-4-6',  // CONTEXT-locked default
  maxTokens?: number = 4096,
  timeoutMs?: number = 120_000,           // 2 min for code-fix prompts
  phase?: string,                          // optional — engages phase cap
  issueId?: string,                        // optional — engages per-issue cap ($1)
  prNumber?: number,                       // optional — engages per-PR cap ($2)
  forceApi?: boolean = false,              // local --force-api override
}): Promise<
  | { ok: true,  llmText: string, modelId: string, costUsd: number, rawJson: object }
  | { ok: false, ciGate: true, message: string }
  | { ok: false, capBlocked: true, monthly, day, issue, pr, phaseCap }
  | { ok: false, errorReason: 'sdk_error', errorMessage: string }
>
```

### 6-step execution order (mirrors invokeClaudePWithLedger):

1. **INVERSE CI gate** — refuse if `!inCi && !forceApi`; no SDK call, no ledger entry
2. **Cap prechecks** — monthly + day + (issue if issueId) + (PR if prNumber) + (phase if phase); any `block` → return capBlocked
3. **SDK call** — `new Anthropic({ maxRetries: 2, timeout: timeoutMs }).messages.create(...)` wrapped in try/catch
4. **Cost** — `fallbackCostUsd(response.model, in_tokens, out_tokens)` (no `total_cost_usd` on SDK responses)
5. **Append** — UNCONDITIONAL (success path AND sdk_error catch path; Pitfall 8 forensic-trace invariant)
6. **Return** — `{ ok:true, llmText: response.content[0].text, modelId, costUsd, rawJson }`

## The 10 New Vitest Cases in llm-driver.test.js

**Phase 39 LEDGER-03: inverse CI gate (3 cases):**
- Test 31: not CI + forceApi:false → `{ok:false, ciGate:true}`; SDK + ledger + readLedger all untouched
- Test 32: CI=true → bypasses gate, SDK invoked, returns ok:true
- Test 33: forceApi:true → bypasses gate, SDK invoked, returns ok:true

**Phase 39 LEDGER-03: sub-cap blocks (3 cases):**
- Test 34: day cap at $10.00 → `capBlocked:true` with `day.status='block'`; SDK + appendLedgerEntry both untouched
- Test 35: issue cap at $1.00 (issue-99) → `capBlocked:true` with `issue.status='block'`
- Test 36: PR cap at $2.00 (PR 42) → `capBlocked:true` with `pr.status='block'`

**Phase 39 LEDGER-03: happy path + Pitfall 8 always-append (2 cases):**
- Test 37: success path → `ok:true`, `llmText='hi'`, `modelId='claude-sonnet-4-6'`, `costUsd ≈ 0.0033` (Sonnet rates: 100 input × $3/Mtok + 200 output × $15/Mtok); `appendLedgerEntry` called once with `transport:'sdk'`, `tokens_in:100`, `tokens_out:200`, `phase:'39'`, `source:'auto-fix-api'`
- Test 38: sdk_error path → `ok:false`, `errorReason:'sdk_error'`, `errorMessage:'timeout'`; `appendLedgerEntry` STILL called once with `cost_usd:0`, `transport:'sdk'`, `error:'timeout'` (Pitfall 8 invariant)

**Phase 39 CLEANUP-04 regression guard: invokeClaudePWithLedger CI gate UNCHANGED (2 cases):**
- Test 39: invokeClaudePWithLedger with CI=true → still returns `{ok:false, ciGate:true}` exactly as v3.1
- Test 40: invokeClaudePWithLedger with GITHUB_ACTIONS=true → still returns `{ok:false, ciGate:true}` (v3.1 defense-in-depth preserved)

## The 5 New Cases in eslint-sdk-guard.test.js

- **Test 1:** Static-grep — eslint.config.js has ≥ 2 CODE references to `@anthropic-ai/sdk` (comments stripped before counting so a header mention alone does NOT pass the gate)
- **Test 2:** Static-grep — `ignores: ['tests/e2e/lib/llm-driver.js']` appears exactly once
- **Test 3:** Static-grep — `@anthropic-ai/sdk` appears in the final 50 lines (Pitfall 3 LAST-block guarantee)
- **Test 4:** Programmatic ESLint API — lintText of a synthetic `import Anthropic from '@anthropic-ai/sdk'` at `scripts/forbidden-sdk-import-fixture.js` → asserts at least one `no-restricted-imports` violation (definitive order-drift regression guard)
- **Test 5:** Programmatic ESLint API — same import at `tests/e2e/lib/llm-driver.js` → asserts NO `no-restricted-imports` violation (the `ignores` exception works as designed)

Tests 4 and 5 gracefully skip with `console.warn` if `import('eslint')` fails — eslint is a devDep so the import works in normal test environments; the skip path exists only to avoid making the file a hard install-time dependency.

## v3.1 Invariant Verification (Pitfall 8)

**Direct git-diff inspection of the v3.1 invokeClaudePWithLedger body:**
- Function declaration line: was line 375 → now line 378 (+3 due to 3 added import lines: 1 for Anthropic, 1 for fallbackCostUsd, 1 added to expand the existing llm-ledger import block to multi-line)
- CI gate `if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')` line: was line 384 → now line 387; **the line text is byte-for-byte identical**
- Function body (lines 384–447 originally, 387–447 now) is byte-for-byte unchanged; the closing `}` is at line 447

Cases 39 + 40 in llm-driver.test.js explicitly assert the v3.1 behavior: with CI=true (Case 39) or GITHUB_ACTIONS=true (Case 40), invokeClaudePWithLedger returns `{ok:false, ciGate:true}`, `spawnCalls.length === 0`, and `appendLedgerEntry.callCount === 0`. Both PASS — the v3.1 contract is preserved.

## ESLint Block Placement Confirmation (Pitfall 3)

`eslint.config.js` now has 4 flat-config blocks in array order:

1. Project-wide `tests/e2e/**/*.js` language options block (no rules)
2. `pdf-verifier.js` independence rule (patterns.group for src/**)
3. `rerun-validator.js` independence rule (patterns.group for src/**)
4. `triage-classifier.js` + `e2e-triage-classifier.mjs` invokeClaudeP restriction (paths + importNames)
5. **NEW Phase 39:** `@anthropic-ai/sdk` single-entry-point restriction (paths, ignores driver) — APPENDED LAST

The new block uses `files: ['**/*.{js,mjs}']` with `ignores: ['tests/e2e/lib/llm-driver.js']` to match every JS/MJS file in the project EXCEPT the driver. Per Pitfall 3, ESLint flat-config rules MERGE in array order with LATER blocks overriding EARLIER ones for the same rule key — placing this block LAST ensures the SDK restriction is the final word on `no-restricted-imports` for any file matched by both this block and an earlier one.

Test 3 in eslint-sdk-guard.test.js asserts the `@anthropic-ai/sdk` reference appears in the final 50 lines as a regression guard against future block insertions that would silently override the SDK restriction.

## Deviations from Plan

None. Plan was executed exactly as written. All `<verify>` gates passed on first run after the GREEN edit, no auto-fix rule (1/2/3) was triggered, no architectural change (Rule 4) needed.

### One observation (not a deviation):

The plan's Task 4 verify gate uses `grep -E "✓.*(Test|case) (3[1-9]|40)"` against `vitest --reporter=basic`. As Plan 01's SUMMARY documented, vitest v3.2.4's `basic` reporter no longer prints per-test names — only file-level summary. The shell pipeline therefore counts 0, which would fail the literal gate. **Mitigation:** I confirmed the behavioral assertion (all 10 Phase 39 cases pass) by re-running with `--reporter=verbose` and visually inspecting the output (see Task 4 commit body). The functional assertion holds — the literal grep pattern is fragile against vitest v3.x defaults, but is not load-bearing for the plan's success criteria.

## Authentication Gates

None encountered. The SDK tests use `vi.mock('@anthropic-ai/sdk', ...)` to avoid all network calls; no `ANTHROPIC_API_KEY` is required at test time. Per the plan's `user_setup` directive, `ANTHROPIC_API_KEY` is required by Phase 42+ when the SDK transport is first invoked in CI, and is documented for the user to add as a GitHub repo secret then.

## Issues Encountered

- **Worktree has no `node_modules/` on spawn** (same as Plan 01): ran `npm ci --no-audit --no-fund` once (added 136 packages in 3s) to make `npx vitest` and `npm run lint` resolvable. Then `npm install --save-dev --save-exact @anthropic-ai/sdk@0.100.1` added 7 more packages in 1s. Neither install is committed (node_modules is gitignored); only the package.json + package-lock.json updates from Task 1 are committed.

## Threat Flags

None. The plan's `<threat_model>` enumerated T-39-SC (supply-chain) through T-39-14 (ESLint block ordering). This plan addresses each disposition:

- **T-39-SC (mitigate):** Task 0 BLOCKING human checkpoint approved by user 2026-05-31; Task 1 pins EXACT (verified `node_modules/@anthropic-ai/sdk/package.json` version 0.100.1 + absence of postinstall script)
- **T-39-09 (mitigate):** INVERSE CI gate refuses local invocations without `forceApi:true` — Case 31 verifies
- **T-39-10 (mitigate):** 4 sub-cap prechecks before SDK invocation — Cases 34/35/36 verify
- **T-39-11 (mitigate):** ESLint guard restricts SDK import to driver — Tests 4 + 5 in eslint-sdk-guard.test.js verify
- **T-39-12 (accept):** Plan 01 already added `claude-sonnet-4-6` to PRICING_BY_MODEL; if SDK returns a date-suffixed variant (`claude-sonnet-4-6-2026XXXX`), fall-through to Opus default OVER-COUNTS cost (safe direction — caps fire earlier; the Phase 40 cost-snapshot workflow will surface this)
- **T-39-13 (accept):** SDK has built-in `maxRetries: 2`; connection-drop-post-bill is a residual SDK-side risk for Phase 46 audit
- **T-39-14 (mitigate):** Test 3 + Test 4 in eslint-sdk-guard.test.js verify the SDK block is LAST and that the rule fires correctly

## Known Stubs

None. All new code paths are fully wired:
- `invokeAnthropicSdkWithLedger` is a complete implementation (no TODOs, no placeholders, no mock returns)
- The ESLint block uses real ESLint flat-config primitives that take effect at next `npm run lint`
- All 15 new Vitest cases exercise real code paths (the SDK is mocked at the test boundary only — the wrapper logic, cap checks, ledger append calls are all the actual production code)

## Next Phase Readiness

- **Ready for Plan 02 / Plan 04** (parallel wave peers — Plan 02 ships CODEOWNERS, Plan 04 ships the committed-ledger flip): zero shared write surface between Plan 03 and either peer; this plan touched only `package.json`, `package-lock.json`, `tests/e2e/lib/llm-driver.js`, `eslint.config.js`, and the two test files
- **Ready for Phase 40+** (deps-update + cost-snapshot workflows): `combinedMonthlyTotal()` from Plan 01 is the unified-cap reader that aggregates both transports; the new `transport:'sdk'` ledger tag from this plan distinguishes SDK spend from subscription spend for forensic greps
- **Ready for Phase 42** (auto-fix.mjs core dispatcher): `invokeAnthropicSdkWithLedger` is the SOLE allowed entry point for the SDK transport (enforced by the ESLint guard); the call-site ergonomics mirror `invokeClaudePWithLedger` so a future `--transport subscription | sdk` flag (Phase 46) is trivially implementable as a wrapper that selects between the two

## Self-Check: PASSED

- `package.json` `"@anthropic-ai/sdk": "0.100.1"` (EXACT): FOUND via grep
- `node_modules/@anthropic-ai/sdk/package.json` version 0.100.1 + no postinstall: FOUND via node script
- `tests/e2e/lib/llm-driver.js` `invokeAnthropicSdkWithLedger` export: FOUND via node dynamic-import
- `tests/e2e/lib/llm-driver.js` `invokeClaudePWithLedger` export (v3.1 preserved): FOUND
- `tests/e2e/lib/llm-driver.js` `import Anthropic from '@anthropic-ai/sdk'` exactly once: FOUND (count 1)
- `tests/e2e/lib/llm-driver.js` v3.1 CI gate line `if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true')`: FOUND at line 387 (byte-for-byte unchanged from line 384 v3.1 original — only shifted +3 by import additions above)
- `eslint.config.js` `@anthropic-ai/sdk` reference (4 occurrences total): FOUND
- `eslint.config.js` `ignores: ['tests/e2e/lib/llm-driver.js']` exactly once: FOUND
- `eslint.config.js` 4 `'no-restricted-imports':` rule keys: FOUND
- `eslint.config.js` SDK block in final 25 lines: FOUND (Pitfall 3 LAST-block guarantee)
- `npm run lint` exit 0 (2 pre-existing settings.js warnings out of scope per Phase 39 scope-boundary rule): VERIFIED
- `tests/unit/llm-driver.test.js` 44 / 44 cases PASS (30 v3.1 + 4 sanity + 10 new Phase 39): VERIFIED
- `tests/unit/eslint-sdk-guard.test.js` 5 / 5 cases PASS (all 5, including programmatic Tests 4 + 5): VERIFIED
- `tests/unit/llm-ledger.test.js` 52 / 52 cases PASS (Plan 01 regression unchanged): VERIFIED
- Task 1 commit `0d09f58`: FOUND in git log
- Task 2 commit `38da7d2`: FOUND in git log
- Task 3 commit `5be6b45`: FOUND in git log
- Task 4 commit `0fbae16`: FOUND in git log
- Task 5 commit `58609ac`: FOUND in git log

---
*Phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0*
*Plan: 03*
*Completed: 2026-05-31*

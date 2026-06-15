# Phase 67: Prompt-Iter Loop (Shape A — Capture-and-Surface, In-Process) — Research

**Researched:** 2026-06-09
**Domain:** in-process iteration wrapper around an existing dispatcher Step (Node.js ESM, Vitest test surface, additive-only ledger semantics)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hint composition:**
- `apply-check-failed` hint source: first 500 chars of `git apply --check` stderr (mirrors existing `stderrSnip` shape currently captured as ledger `errorMessage` at the apply-check failure site). Reuses existing snippet without expanding the capture surface.
- `malformed-diff:*` hint source: `parseFencedDiff` `reason` string verbatim (already in the ledger row as `errorReason: 'malformed-diff:<reason>'`).
- **Splice location in systemPrompt:** appended at the end of the scaffold-produced systemPrompt under a `<prior_attempt_feedback>` section header. `buildScaffoldSystemPrompt` is NOT modified — the splice happens in `buildFixPrompt` AFTER the scaffold returns.
- **Format:** plain text inside the `<prior_attempt_feedback>` block — no JSON envelope (keeps cache_control intact; the prefix of systemPrompt remains byte-identical for round 0 so cache hits are preserved).
- **Round 0 (no hint):** when `rewriteHint` is unset/empty, `buildFixPrompt` returns the byte-identical systemPrompt as today (preserves `Object.freeze` byte-stability sha256 pin against Phase 45 baseline).

**Per-fingerprint accumulator:**
- Tracking medium: in-memory `Map<fingerprint, {round, cumCostUsd}>` instantiated INSIDE `runDispatcher` scope (NOT module-level — keeps purity of the test harness intact). Process-local; each `auto-fix.mjs` invocation handles one issue.
- Persistence: NONE — ledger-replay rejected. Each process invocation gets `ITER_MAX_ROUNDS = 2` retries fresh.
- Cap enforcement point: after the ledger write for attempt N succeeds, check cumulative spend against `PROMPT_ITER_COST_CAP_USD = 0.50` BEFORE issuing attempt N+1.
- Cap exhaustion behavior: graceful return 0 with `errorReason: 'prompt-iter-budget-cap'` ledger row (mirrors A/B winner abstention pattern in Phase 54/66).

**Ledger schema placement:**
- `iter_round` field: top-level additive integer (0..`ITER_MAX_ROUNDS`). Value `null`/absent for rows from non-iter call sites and pre-Phase-67 rows.
- Numbering: 0 for the first attempt, increments to 1 then 2 on iter retries.
- Sites that write `iter_round`: every `safeAppendLedger` call inside the new iter wrapper at Step 10 (success + parse-error + apply-check-error + diff-guard rejection + the new budget-cap row). Pre-existing FLAKE/skip-class/dry-run rows at Step 7/8 do NOT write `iter_round`.
- `appendLedgerEntry` body BYTE-UNCHANGED — the field is passed in by call sites; no validation added to the helper body.

**Triggering conditions:**
- Iteration triggers ONLY on `apply-check-failed` (Step 13) and `malformed-diff:*` (Step 11) outcomes.
- NEVER on `sdk_error` (fast-fail, cost discipline).
- NEVER on `diff-guard-violation` (Step 12) — policy violations not solvable by re-prompting.
- NEVER on `capBlocked` / `ciGate` — environmental refusals.

**FORBIDDEN_PATHS extension (NON-NEGOTIABLE):**
- `scripts/check-diff-guard.mjs` FORBIDDEN_PATHS regex bank extended to include exact-path matchers for `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js`.
- Ships in the SAME atomic commit as the iter loop wrapper (no partial states).
- Anchors: `^tests/e2e/lib/fix-prompt-builder\.js$` and `^tests/e2e/lib/llm-router\.js$`.

**Testing scope:**
- New Vitest file: `tests/unit/auto-fix-prompt-iter.test.js` (NOT appended to existing files).
- Existing test files preserved: `tests/unit/auto-fix.test.js` baseline unchanged (only additive mock cases if needed); `tests/unit/fix-prompt-builder.test.js` gets new tests for `rewriteHint` parameter (existing tests preserved — `rewriteHint` is optional, omitting it must produce byte-identical output to today).

### Claude's Discretion

- Exact naming of internal helpers (e.g., `composeRewriteHint`, `extractHintFromOutcome`) — pick names consistent with existing module conventions.
- Exact wording of the `<prior_attempt_feedback>` section header inside systemPrompt — pick language consistent with the existing scaffold structure.
- Test fixture counts and exact Vitest case ordering — at Claude's discretion as long as `T_PROMPT_ITER_BUDGET_01` exists and the cap-enforcement contract is pinned.

### Deferred Ideas (OUT OF SCOPE)

- **Shape B (full automation):** rejected outright as Anti-Feature per v4.3 ROADMAP D-09. Defense-in-depth FORBIDDEN_PATHS extension is the contract.
- **Cross-process iter-round persistence (ledger replay):** considered and rejected — process-local in-memory accumulator is sufficient.
- **Per-scaffold rewriteHint tuning** (different hint shape for each ERROR_CLASS): out of scope; round-0 byte-identity is what makes cache hit-rate hold.
- **Telemetry dashboard for iter_round distribution:** out of scope for Phase 67; weekly-digest extension is a Phase 68+ concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PITER-01 | `buildFixPrompt` accepts optional `rewriteHint` parameter that splices into systemPrompt via `buildScaffoldSystemPrompt`; PROMPT_SCAFFOLDS `Object.freeze` and 5-existing-scaffold byte-stability sha256 preserved | Verified: `buildScaffoldSystemPrompt` at line 117 is a pure helper returning a string; `buildFixPrompt` at line 534 is where the splice belongs; the post-scaffold append preserves the seven byte-stability pins in `tests/unit/fix-prompt-builder-byte-stability.test.js` because those pins assert against `PROMPT_SCAFFOLDS[className]()` (the thunk), not against `buildFixPrompt({...}).systemPrompt`. See Pattern 1. |
| PITER-02 | `runDispatcher` Step 10 wraps LLM dispatch in iteration loop that re-invokes `buildFixPrompt` with hint composed from previous attempt's failure mode | Verified: Step 10 occupies lines 770-820 inclusive (LLM dispatch + sdkResult-error branch); Step 11 (parseFencedDiff) is lines 822-841; Step 13 (git apply --check) is lines 877-903. See Pattern 2. |
| PITER-03 | New constants `ITER_MAX_ROUNDS = 2` and `PROMPT_ITER_COST_CAP_USD = 0.50` (per fingerprint, cumulative); new additive ledger field `iter_round` (integer 0..ITER_MAX_ROUNDS) — `appendLedgerEntry` body BYTE-UNCHANGED | Verified: `appendLedgerEntry` at `tests/e2e/lib/llm-ledger.js:686` does `m.iterations.push(entry)` verbatim — additive keys flow through with zero helper-body change. See Pattern 3. |
| PITER-04 | Iteration triggers ONLY on `apply-check-failed` and `malformed-diff:*` — NEVER on `sdk_error` (fast-fail); test fixture pins fast-fail on `sdk_error` | Verified: Step 10 sdkResult error branch at lines 797-820 already returns 1/2/3 fast — the iter loop wraps only Step 10 success → Step 11 → Step 12 → Step 13. `sdk_error` exits BEFORE the loop reentry point. See Pattern 4. |
| PITER-05 | FORBIDDEN_PATHS regex bank extended to include `tests/e2e/lib/fix-prompt-builder.js` AND `tests/e2e/lib/llm-router.js` | Verified: `FORBIDDEN_PATHS` is an `Object.freeze`'d array of literal RegExp at `scripts/check-diff-guard.mjs:49-58`; the existing 8-entry test at `tests/unit/check-diff-guard.test.js:34-40` requires updating the count from 8 to 10. See Pattern 5. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

**Source: `/home/fatduck/patent-cite-tool/CLAUDE.md`**

- **Answer verification after every AskUserQuestion:** If the tool result doesn't contain the user's actual selection, fall back to a plain numbered list and ask the user to type their choice. Do NOT pick "(Recommended)" on their behalf or fabricate answers.

  *Phase 67 relevance:* No anticipated AskUserQuestion usage during implementation (the phase is autonomous with locked CONTEXT.md decisions). Constraint applies only if a discuss/plan-checker loop spawns interactive prompts.

## Summary

Phase 67 adds a small (≤ 50 lines) in-process iteration loop wrapping `runDispatcher`'s Step 10 LLM dispatch, plus an optional `rewriteHint` parameter on `buildFixPrompt` that appends a `<prior_attempt_feedback>` block AFTER the scaffold returns. Every locked CONTEXT.md decision is verified against the source: `buildScaffoldSystemPrompt` returns a string (line 117), `buildFixPrompt` returns it on the ok-true path (line 553), and the byte-stability pins live on `PROMPT_SCAFFOLDS[k]()` (the thunk, not on `buildFixPrompt(...)`) — so post-scaffold splicing preserves the seven sha256 pins by construction.

Three architectural risks were investigated and resolved by inspection of current source:

1. **Cap interaction with subscription transport:** subscription's `invokeClaudeP` already sets `--max-budget-usd 0.50` per CLI invocation. A single Phase 61 subscription call has been observed at $0.16–$0.20 (real ledger data, 2026-06-07/08). Two retry rounds at the same magnitude tally $0.48–$0.60, straddling the new `PROMPT_ITER_COST_CAP_USD = 0.50` cap. ConsequencE: on subscription transport the iter budget will commonly exhaust at round 1 or round 2, exactly as designed — the budget-cap ledger row will fire often. SDK transport with sonnet pricing is far cheaper and will routinely complete 2 retries within budget.
2. **`ITER_MAX_ROUNDS = 2` vs `--max-turns 5`:** the two limits operate on orthogonal axes — `--max-turns 5` is the agentic-loop ceiling INSIDE one subscription CLI call (Read/Glob/Grep tool budget); `ITER_MAX_ROUNDS = 2` is the dispatcher-level rewrite ceiling between independent SDK calls. They do NOT compound. The locked value 2 is correct.
3. **Ledger schema additivity:** `appendLedgerEntry` (line 686) does `m.iterations.push(entry)` — entries pass through verbatim, so `iter_round` is purely additive and the helper body stays byte-unchanged.

**Primary recommendation:** ship the wrapper as a `while (round <= ITER_MAX_ROUNDS && cumCost < PROMPT_ITER_COST_CAP_USD)` loop containing the existing Steps 10 → 11 → 12 → 13 with one early-return per trigger outcome (success → break; `apply-check-failed` → continue with hint; `malformed-diff:*` → continue with hint; `diff-guard-violation` → return 1; `sdk_error` → return 1; capBlocked/ciGate → return 2/3). Ship FORBIDDEN_PATHS extension in the SAME commit (non-negotiable).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compose `rewriteHint` from prior outcome | Dispatcher (`scripts/auto-fix.mjs`) | — | Hint material (stderrSnip, parsed.reason) is dispatcher-local state from Step 11/13; never crosses module boundary |
| Splice `<prior_attempt_feedback>` into systemPrompt | Pure helper (`tests/e2e/lib/fix-prompt-builder.js:buildFixPrompt`) | — | The append is a pure string concatenation on the return value of `buildScaffoldSystemPrompt`; preserves D-04 purity invariant (no I/O) |
| Track per-fingerprint round + cumCost | Dispatcher (`runDispatcher` scope) | — | Map literal inside the function body; process-local lifetime; never module-level (would break test purity) |
| Cap enforcement | Dispatcher (post-write check) | — | Reads cumulative spend from in-memory Map; mirrors existing `countFixAttempts` pattern at Step 5 |
| Persistence of `iter_round` | Ledger pass-through (`safeAppendLedger` → `appendLedgerEntry`) | — | Additive object key; no helper body change |
| FORBIDDEN_PATHS regex bank | Pure helper (`scripts/check-diff-guard.mjs`) | — | Extending the literal `Object.freeze([...])` array — same shape as 8 pre-existing entries |
| Round-0 byte-identity guarantee | Pure helper (`buildFixPrompt`) | — | When `rewriteHint` is unset/empty, the function returns the same string as today; preserved by an early-skip branch around the append |

## Standard Stack

### Core (existing — Phase 67 introduces ZERO new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | `^3.0.0` caret pin | Unit test framework | All 1,500+ existing project tests; preferred over Jest per project convention [VERIFIED: `package.json` workspace pattern] |
| `@anthropic-ai/sdk` | `0.100.1` EXACT pin (NOT bumped in v4.3) | SDK transport (existing) | Phase 67 does NOT change SDK integration — only re-invokes via existing `invokeAnthropicSdkWithLedger` [CITED: REQUIREMENTS.md Out-of-Scope row] |
| Node.js `node:crypto` | (stdlib) | sha256 byte-stability pins in `tests/unit/fix-prompt-builder-byte-stability.test.js` | Already used by the existing 7-pin test [VERIFIED: file:17 `import { createHash } from 'node:crypto'`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:child_process` `execFileSync` | (stdlib) | Mocked in `tests/unit/auto-fix.test.js:53-55` | Existing mock pattern; new test file reuses |
| Vitest `vi.mock` + `vi.mocked` | `^3.0.0` | Mock `llm-driver.js` + `llm-ledger.js` (already mocked in baseline) | New `tests/unit/auto-fix-prompt-iter.test.js` reuses the same mock surface |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory `Map<fingerprint, ...>` | Ledger-replay (read iterations, sum by fingerprint) | REJECTED in CONTEXT.md — would couple iter state to ledger schema and re-read disk per loop iteration; CONTEXT.md picks in-memory for test purity |
| Splice hint INSIDE `buildScaffoldSystemPrompt` | Splice in `buildFixPrompt` AFTER scaffold returns | REJECTED in CONTEXT.md — modifying `buildScaffoldSystemPrompt` would invalidate the 7-scaffold byte-stability sha256 pins at `tests/unit/fix-prompt-builder-byte-stability.test.js:23-31` |
| `ITER_MAX_ROUNDS = 1` | `ITER_MAX_ROUNDS = 2` | LOCKED at 2 in CONTEXT.md / ROADMAP success criterion 5; research confirms 2 is feasible on SDK transport where sonnet calls are cheap (≤$0.05 typical); on subscription, the $0.50 budget cap will end the loop naturally at 1-2 rounds |

**Installation:** No new packages — fifth-consecutive-milestone zero-dep target preserved.

**Version verification:** Not applicable — Phase 67 adds no new packages.

## Package Legitimacy Audit

**Not applicable — Phase 67 installs zero new packages.** The phase reuses Vitest, `node:crypto`, and the existing `@anthropic-ai/sdk@0.100.1` pin. The fifth-consecutive-milestone zero-new-dependency target is preserved by design.

## Architecture Patterns

### System Architecture Diagram

```
┌─ runDispatcher (scripts/auto-fix.mjs:563) ─────────────────────────┐
│                                                                     │
│  Steps 1-9 (UNCHANGED): argv → gh issue view → fingerprint →       │
│   labels → fix_attempts cap → idempotency → buildFixPrompt →       │
│   dry-run → systemBlocks                                            │
│                                                                     │
│  NEW: const iterState = new Map();   ← in-memory accumulator       │
│       iterState.set(fingerprint, { round: 0, cumCost: 0 });        │
│                                                                     │
│  ┌─ ITER LOOP (NEW wrapper, wraps Steps 10-13) ──────────────────┐ │
│  │                                                                │ │
│  │  round 0 → buildFixPrompt({...})            ← byte-identical  │ │
│  │  round N → buildFixPrompt({..., rewriteHint}) ← prior outcome │ │
│  │                                                                │ │
│  │  Step 10: invokeAnthropicSdkWithLedger / invokeClaudePWithLedger│ │
│  │           ├─ sdkResult.ok === false                            │ │
│  │           │  ├─ ciGate     → return 2 (fast-fail; NOT iter)   │ │
│  │           │  ├─ capBlocked → return 3 (fast-fail; NOT iter)   │ │
│  │           │  ├─ contract-error → return 2 (fast-fail; NOT iter)│ │
│  │           │  └─ sdk_error  → return 1 (fast-fail; NOT iter)   │ │
│  │           │                                                    │ │
│  │  cumCost += sdkResult.costUsd ?? 0                            │ │
│  │                                                                │ │
│  │  Step 11: parseFencedDiff                                     │ │
│  │           └─ !parsed.ok → safeAppendLedger({..., iter_round, │ │
│  │              errorReason:'malformed-diff:<reason>'})          │ │
│  │              hint = parsed.reason   ← ITER TRIGGER #1         │ │
│  │              if round+1 > MAX || cumCost > CAP → write       │ │
│  │                budget-cap row, return 0                       │ │
│  │              else round++, continue loop                      │ │
│  │                                                                │ │
│  │  Step 12: checkDiffGuard                                      │ │
│  │           └─ !guard.ok → safeAppendLedger({..., iter_round,  │ │
│  │              errorReason:'diff-guard-violation:...'})         │ │
│  │              return 1 (fast-fail; NOT iter)                  │ │
│  │                                                                │ │
│  │  Step 13: git apply --check                                  │ │
│  │           └─ throws → safeAppendLedger({..., iter_round,     │ │
│  │              errorReason:'apply-check-failed',                │ │
│  │              errorMessage:stderrSnip})                        │ │
│  │              hint = stderrSnip       ← ITER TRIGGER #2        │ │
│  │              if round+1 > MAX || cumCost > CAP → write       │ │
│  │                budget-cap row, return 0                       │ │
│  │              else round++, continue loop                      │ │
│  │                                                                │ │
│  │  Step 13 success → break out of loop                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  Steps 14-18 (UNCHANGED): git apply → checkout -b → commit →       │
│   push → PR-create hint                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additive — no new directories)

```
scripts/
├── auto-fix.mjs          # MODIFIED: Step 10 wrap + iter loop + 2 new const
└── check-diff-guard.mjs  # MODIFIED: FORBIDDEN_PATHS array +2 entries

tests/e2e/lib/
└── fix-prompt-builder.js # MODIFIED: buildFixPrompt({rewriteHint}) param

tests/unit/
├── auto-fix-prompt-iter.test.js     # NEW: T_PROMPT_ITER_BUDGET_01 + companions
├── auto-fix.test.js                 # UNCHANGED (additive mock cases only if needed)
├── check-diff-guard.test.js         # MODIFIED: count 8→10 + 2 new F-tests
├── fix-prompt-builder.test.js       # MODIFIED: +rewriteHint tests; existing tests stay green
└── fix-prompt-builder-byte-stability.test.js  # UNCHANGED (pins survive by construction)
```

### Pattern 1: `rewriteHint` splice in `buildFixPrompt` (PITER-01)

**What:** Append a `<prior_attempt_feedback>` block AFTER the scaffold string returns. Skip the append on round 0 (preserves byte-stability sha256 pins).

**When to use:** Only inside `buildFixPrompt` (line 534), only on the `ok:true` path (line 553), only when `rewriteHint` is a non-empty string.

**Why this preserves the 7-scaffold byte-stability sha256 pins:** the pins at `tests/unit/fix-prompt-builder-byte-stability.test.js:23-46` hash the output of `PROMPT_SCAFFOLDS[className]()` — i.e., the thunk return value, which is itself `buildScaffoldSystemPrompt({...})`. They do NOT hash `buildFixPrompt({errorClass, issueBody}).systemPrompt`. Since the post-scaffold append happens AFTER the thunk returns, the thunk's bytes are unchanged.

**Why round-0 still preserves the cache_control hit-rate:** `cache_control: { type: 'ephemeral', ttl: '1h' }` at `auto-fix.mjs:766` is set on the `systemBlocks[0].text` value. Anthropic's prompt-cache match key is the literal string of that text up to a cache breakpoint. Round 0 produces the same string as today, so the cache hit holds.

**Example:**

```javascript
// Source: locked design from CONTEXT.md + existing buildFixPrompt at line 534-562

export function buildFixPrompt({ errorClass, issueBody, rewriteHint } = {}) {
  // 1. Skip-class short-circuit (UNCHANGED).
  if (errorClass in SKIP_CLASS_ESCALATIONS) {
    return { ok: false, escalate: SKIP_CLASS_ESCALATIONS[errorClass] };
  }

  // 2. Supported class — look up the SYSTEM scaffold (UNCHANGED).
  const scaffold = PROMPT_SCAFFOLDS[errorClass];
  if (typeof scaffold !== 'function') {
    return { ok: false, escalate: `unsupported-class:${String(errorClass)}` };
  }

  // 3. Build the envelope (UNCHANGED).
  const safeBody = typeof issueBody === 'string' ? issueBody : '';
  const userPrompt = `${ENVELOPE_OPEN}\n${safeBody}\n${ENVELOPE_CLOSE}`;
  let systemPrompt = scaffold();

  // 4. NEW Phase 67 PITER-01: append <prior_attempt_feedback> when rewriteHint
  //    is a non-empty string. Round-0 (no hint) produces byte-identical output
  //    to pre-Phase-67 — preserves the 7 byte-stability sha256 pins at
  //    tests/unit/fix-prompt-builder-byte-stability.test.js because those pins
  //    hash PROMPT_SCAFFOLDS[className]() (the thunk), NOT this return value.
  if (typeof rewriteHint === 'string' && rewriteHint.length > 0) {
    systemPrompt = systemPrompt + [
      '',
      '',
      '## Prior attempt feedback',
      '',
      '<prior_attempt_feedback>',
      rewriteHint,
      '</prior_attempt_feedback>',
    ].join('\n');
  }

  return { ok: true, systemPrompt, userPrompt, model: routeModel(errorClass) };
}
```

### Pattern 2: Iteration loop wrapping Step 10..13 (PITER-02)

**What:** A `while` loop body containing the existing Step 10 dispatch + Step 11 parse + Step 12 diff-guard + Step 13 git apply --check. The loop exits on success (break), on a non-trigger error (return), or on cap exhaustion (graceful return 0 after writing budget-cap row).

**When to use:** Only inside `runDispatcher`. Loop entry condition is `round <= ITER_MAX_ROUNDS && cumCost < PROMPT_ITER_COST_CAP_USD`.

**Why an in-memory `Map`:** the dispatcher handles ONE issue per process invocation, so the map's lifetime exactly matches one fingerprint's iteration budget. Using a `Map` (vs. plain variables) preserves the existing `fingerprint` scoping pattern and reads naturally for the cap-check.

**Example:**

```javascript
// Source: synthesized from locked CONTEXT.md decisions + existing Steps 10-13 at lines 770-903

// New constants near the existing FIX_ATTEMPT_CAP / HUMAN_REVIEW_LABEL block (~line 206)
const ITER_MAX_ROUNDS = 2;
const PROMPT_ITER_COST_CAP_USD = 0.50;

// Inside runDispatcher, AFTER Step 9 systemBlocks build, BEFORE Step 10
const iterState = new Map();
iterState.set(fingerprint, { round: 0, cumCost: 0 });
let rewriteHint;  // undefined on round 0 (byte-identical output)

while (true) {
  const state = iterState.get(fingerprint);

  // Re-build prompt with current hint (round 0: rewriteHint undefined; round N: hint set)
  const built = buildFixPrompt({ errorClass, issueBody, rewriteHint });
  // (already verified ok:true earlier in Step 7; supported-class check holds)
  const { systemPrompt, userPrompt } = built;
  const systemBlocks = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
  ];

  // ─── Step 10 — LLM dispatch (UNCHANGED branch logic) ────────────────────
  let sdkResult;
  if (transport === 'subscription') {
    sdkResult = await invokeClaudePWithLedger({ systemPrompt, userPrompt, phase: PHASE_46, source: SOURCE_FIX_ISSUE });
  } else {
    sdkResult = await invokeAnthropicSdkWithLedger({ systemBlocks, userPrompt, model: built.model, phase: PHASE, issueId: `issue-${issue}`, forceApi });
  }

  if (!sdkResult.ok) {
    // sdk_error / ciGate / capBlocked / contract-error — FAST-FAIL, no iter retry
    if (sdkResult.ciGate) { /* stderr + return 2 (UNCHANGED) */ }
    if (sdkResult.capBlocked) { /* stderr + return 3 (UNCHANGED) */ }
    if (sdkResult.errorReason === 'contract-error') { /* return 2 */ }
    /* stderr + return 1 (UNCHANGED) */
  }

  // Accumulate cumulative spend
  state.cumCost += sdkResult.costUsd ?? 0;

  // ─── Step 11 — parseFencedDiff ──────────────────────────────────────────
  const parsed = parseFencedDiff(sdkResult.llmText);
  if (!parsed.ok) {
    safeAppendLedger({
      iso: new Date().toISOString(), model: 'claude-sonnet-4-6',
      cost_usd: 0, tokens_in: 0, tokens_out: 0,
      phase: PHASE, transport, issueId: `issue-${issue}`,
      fingerprint, errorClass, source: 'auto-fix-api',
      errorReason: `malformed-diff:${parsed.reason}`,
      iter_round: state.round,   // ← NEW additive field
    });

    // ITER TRIGGER #1: malformed-diff
    if (state.round + 1 > ITER_MAX_ROUNDS || state.cumCost >= PROMPT_ITER_COST_CAP_USD) {
      safeAppendLedger({
        iso: new Date().toISOString(), model: 'claude-sonnet-4-6',
        cost_usd: 0, tokens_in: 0, tokens_out: 0,
        phase: PHASE, transport, issueId: `issue-${issue}`,
        fingerprint, errorClass, source: 'auto-fix-api',
        errorReason: 'prompt-iter-budget-cap',
        iter_round: state.round,
      });
      return 0;  // graceful abstention
    }

    state.round += 1;
    rewriteHint = parsed.reason;  // verbatim per CONTEXT.md
    continue;  // re-enter loop with new hint
  }

  // ─── Step 12 — diff-guard (UNCHANGED; fast-fail, NOT iter trigger) ──────
  const changedPaths = changedPathsFromDiff(parsed.diff);
  const guard = checkDiffGuard(changedPaths);
  if (!guard.ok) {
    /* safeAppendLedger with iter_round + diff-guard-violation; gh issue comment; return 1 (UNCHANGED, plus iter_round field) */
  }

  // ─── Step 13 — git apply --check ────────────────────────────────────────
  try {
    execFileSync('git', ['apply', '--check'], { input: parsed.diff, stdio: ['pipe','pipe','pipe'], encoding: 'utf8' });
    break;  // SUCCESS — exit loop, proceed to Step 14
  } catch (err) {
    const stderrSnip = String(err.stderr ?? err.message ?? '').slice(0, 500);
    safeAppendLedger({
      iso: new Date().toISOString(), model: 'claude-sonnet-4-6',
      cost_usd: 0, tokens_in: 0, tokens_out: 0,
      phase: PHASE, transport, issueId: `issue-${issue}`,
      fingerprint, errorClass, source: 'auto-fix-api',
      errorReason: 'apply-check-failed', errorMessage: stderrSnip,
      iter_round: state.round,   // ← NEW additive field
    });

    // ITER TRIGGER #2: apply-check-failed
    if (state.round + 1 > ITER_MAX_ROUNDS || state.cumCost >= PROMPT_ITER_COST_CAP_USD) {
      safeAppendLedger({
        iso: new Date().toISOString(), model: 'claude-sonnet-4-6',
        cost_usd: 0, tokens_in: 0, tokens_out: 0,
        phase: PHASE, transport, issueId: `issue-${issue}`,
        fingerprint, errorClass, source: 'auto-fix-api',
        errorReason: 'prompt-iter-budget-cap',
        iter_round: state.round,
      });
      return 0;  // graceful abstention
    }

    state.round += 1;
    rewriteHint = stderrSnip;  // first 500 chars of stderr per CONTEXT.md
    continue;
  }
}

// ─── Steps 14-18 (UNCHANGED): git apply, checkout, commit, push, PR-hint ──
```

### Pattern 3: `iter_round` flows through as additive entry key (PITER-03)

**What:** Add `iter_round: state.round` to every `safeAppendLedger` entry literal inside the iter wrapper. No helper-body changes.

**Why this preserves `appendLedgerEntry` body byte-unchanged:** `tests/e2e/lib/llm-ledger.js:705` does `m.iterations.push(entry)` — the entry is stored verbatim. The LEDX-03 invariant from Phase 62 (33 pre-existing Vitest tests stay green) holds because Phase 67 changes only the call-site object literals.

**Why this preserves the local `safeAppendLedger` in `auto-fix.mjs`:** the wrapper at `auto-fix.mjs:143` does `appendLedgerEntry(LEDGER_PATH, entry)` — it forwards `entry` verbatim. New keys flow through with zero wrapper changes.

### Pattern 4: Trigger gating (PITER-04)

**What:** Iter loop continues ONLY when:
- `parseFencedDiff` returns `{ok:false, reason}` (malformed-diff:*)
- `git apply --check` throws (apply-check-failed)

Iter loop fast-fails (returns immediately, no retry) when:
- `sdkResult.errorReason === 'sdk_error'` (or any other non-ok shape)
- `sdkResult.ciGate === true` (return 2)
- `sdkResult.capBlocked === true` (return 3)
- `sdkResult.errorReason === 'contract-error'` (return 2)
- `checkDiffGuard` returns `{ok:false}` (diff-guard-violation — policy, not solvable by re-prompting)

**Why this gating shape:** matches CONTEXT.md exactly. The sdk_error fast-fail preserves cost discipline (multiple sdk_errors compound real spend; re-prompting won't fix an API outage). The diff-guard fast-fail preserves the trust boundary (a re-prompt could just re-emit the same forbidden-path diff; better to fail closed and escalate).

### Pattern 5: FORBIDDEN_PATHS regex bank extension (PITER-05)

**What:** Add two literal regex entries to the `Object.freeze`'d array at `scripts/check-diff-guard.mjs:49-58`. Update the count assertion at `tests/unit/check-diff-guard.test.js:36` from `toHaveLength(8)` to `toHaveLength(10)`. Add two new F-tests (F15, F16) following the F1..F7 + F13..F14 pattern.

**Why this matches the established Phase 41 / Phase 45-02 pattern exactly:** the bank is a flat array of literal RegExp constants — no factory, no helper, just `Object.freeze([...])`. The new entries plug in identically.

**Example:**

```javascript
// Source: synthesized from check-diff-guard.mjs:49-58 existing pattern

export const FORBIDDEN_PATHS = Object.freeze([
  /^tests\/test-cases\.js$/,
  /^tests\/golden\/baseline\.json$/,
  /^tests\/e2e\/test-cases-quarantine\.js$/,
  /^\.github\/workflows\/v40-[^/]*\.yml$/,
  /^tests\/e2e\/\.llm-spend-ledger\.json$/,
  /^\.github\/CODEOWNERS$/,
  /^tests\/e2e\/\.rerun-ring-buffer\.json$/,       // Phase 45-02 — FLAKE-01 state
  /^tests\/e2e\/\.flake-suppression\.json$/,       // Phase 45-02 — FLAKE-02 state
  /^tests\/e2e\/lib\/fix-prompt-builder\.js$/,     // NEW Phase 67 PITER-05
  /^tests\/e2e\/lib\/llm-router\.js$/,             // NEW Phase 67 PITER-05
]);
```

```javascript
// Source: synthesized from tests/unit/check-diff-guard.test.js existing F1..F14 pattern

it('exports exactly 10 regex patterns (8 prior + 2 Phase 67 extensions)', () => {
  expect(Array.isArray(FORBIDDEN_PATHS)).toBe(true);
  expect(FORBIDDEN_PATHS).toHaveLength(10);
  for (const re of FORBIDDEN_PATHS) {
    expect(re).toBeInstanceOf(RegExp);
  }
});

it('F15: rejects tests/e2e/lib/fix-prompt-builder.js (Phase 67 PITER-05)', () => {
  const result = checkDiffGuard(['tests/e2e/lib/fix-prompt-builder.js']);
  expect(result.ok).toBe(false);
  expect(result.violations).toContain('tests/e2e/lib/fix-prompt-builder.js');
});

it('F16: rejects tests/e2e/lib/llm-router.js (Phase 67 PITER-05)', () => {
  const result = checkDiffGuard(['tests/e2e/lib/llm-router.js']);
  expect(result.ok).toBe(false);
  expect(result.violations).toContain('tests/e2e/lib/llm-router.js');
});
```

### Anti-Patterns to Avoid

- **Modifying `buildScaffoldSystemPrompt` to take `rewriteHint`:** would propagate through `PROMPT_SCAFFOLDS[k]()` and invalidate the 7-scaffold byte-stability sha256 pins at `tests/unit/fix-prompt-builder-byte-stability.test.js:23-31`. CONTEXT.md explicitly forbids this — the splice MUST happen in `buildFixPrompt` AFTER the scaffold thunk returns.
- **Module-level `Map<fingerprint, ...>` accumulator:** breaks Vitest test purity (state leaks across tests in the same process). Use `const iterState = new Map()` INSIDE `runDispatcher`.
- **Ledger-replay for round count:** rejected in CONTEXT.md. Each process invocation gets fresh budget. Re-reading the ledger per loop iteration would also slow the loop and couple it to schema changes.
- **Spreading `iter_round` into the entry via `{ ...entry, iter_round }`:** unnecessary indirection. The existing `safeAppendLedger` calls already use object-literal entries; just add the key inline.
- **Adding validation for `iter_round` to `appendLedgerEntry`:** would break the LEDX-03 invariant (33 pre-existing Vitest tests). All validation stays at the call site / wrapper layer (Phase 62 architecture).
- **Re-invoking `routeModel` per round to "try a different model":** out of scope. Phase 67 is capture-and-surface, NOT model-switching. `built.model` (line 561) is computed once per round from `routeModel(errorClass)` — deterministic.
- **Bumping `--max-turns` above 5:** explicitly forbidden in REQUIREMENTS.md Out-of-Scope. Phase 67 is orthogonal to `--max-turns`; do not touch.
- **Using `--no-verify` / `--no-gpg-sign` to bypass hooks during commits:** Phase 67 ships via the standard atomic-commit pattern; never skip hooks per CLAUDE.md project posture.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost accumulation across calls | Custom token-counting math | `sdkResult.costUsd` (already on the return shape per `llm-driver.js:236, 461`) | Already computed by `parseClaudeResponse` and `invokeAnthropicSdkWithLedger`; trustworthy and provenance-tagged |
| Stderr truncation | Custom byte-counter | `String(err.stderr ?? err.message ?? '').slice(0, 500)` — the EXISTING pattern at `auto-fix.mjs:885` | Reuses the proven snippet shape; CONTEXT.md explicitly says "mirrors existing `stderrSnip` shape" |
| Fingerprint extraction | Custom regex | `extractFingerprint` (already exported, `auto-fix.mjs:238`) | Already in Step 3; iter loop reuses the same `fingerprint` variable (computed ONCE per process per CONTEXT.md) |
| Cap-check classification | Custom monthly/day/issue/pr math | Existing `checkSpendCap` / `checkDayCap` / `checkIssueCap` / `checkPrCap` (orthogonal — already run inside SDK invocation) | PROMPT_ITER cap is a NEW sub-cap that layers ABOVE the existing 4 sub-caps; do not reimplement the existing ones |
| Ledger writes | Custom append logic | `safeAppendLedger` (local wrapper at `auto-fix.mjs:143`) | Already CI-guarded + transport-validated + subscription-whitelisted; preserves the Phase 60.1 hotfix invariant |
| FORBIDDEN_PATHS check | Custom path matcher | `checkDiffGuard` (`scripts/check-diff-guard.mjs:66`) | Single source of truth; new entries propagate to BOTH the dispatcher AND the verifier-gate workflow CLI shim |
| Object.freeze enforcement | Custom mutation guard | Vitest `Object.isFrozen` + strict-mode TypeError pattern (`tests/unit/fix-prompt-builder.test.js:103-104, 344-352`) | The existing Phase 45 mutation-guard test already enforces this — Phase 67 doesn't need a new one |
| Sha256 pins | Custom hash | `createHash('sha256')` from `node:crypto` (already in `tests/unit/fix-prompt-builder-byte-stability.test.js:18`) | Stdlib, no new dep; existing pattern |

**Key insight:** Phase 67's surface area is small (≤ 100 lines total) precisely because EVERY component it needs already exists. The phase is plumbing: an `if (rewriteHint)` append; a `while` loop; two regex entries; one ledger field. Hand-rolling any of these would introduce bugs that the existing battle-tested helpers have already exhausted.

## Runtime State Inventory

Phase 67 is NOT a rename/refactor/migration — it is a feature-addition phase. The Runtime State Inventory does not apply.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no string rename, no datastore key changes | None |
| Live service config | None — no external service config touched | None |
| OS-registered state | None — no scheduled tasks / cron / launchd touched | None |
| Secrets / env vars | None — no secret rename | None |
| Build artifacts | None — no installed-package rename | None |

**Nothing found in any category. Verified by:** (1) phase scope is additive code-only (one new ledger field, one new param, one wrapper, two new regex entries); (2) no string rename in any locked decision; (3) no datastore writes outside the existing ledger JSON file.

## Common Pitfalls

### Pitfall 1: Byte-stability sha256 pin breaks because the splice landed in `buildScaffoldSystemPrompt`

**What goes wrong:** A well-intentioned refactor moves the `rewriteHint` splice INTO `buildScaffoldSystemPrompt` (e.g., by passing the hint through as a third param). The 7 sha256 pins at `tests/unit/fix-prompt-builder-byte-stability.test.js:23-31` flip RED on the next Vitest run.

**Why it happens:** the natural reading of "splice rewriteHint into systemPrompt" suggests modifying the scaffold builder. CONTEXT.md is explicit: the splice MUST be in `buildFixPrompt` AFTER the scaffold returns.

**How to avoid:** keep `buildScaffoldSystemPrompt`'s signature byte-unchanged. Add `rewriteHint` ONLY to `buildFixPrompt`'s param list. Append AFTER `const systemPrompt = scaffold();` (line 553).

**Warning signs:** any diff that modifies `buildScaffoldSystemPrompt`'s body, signature, or the seven `<CLASS>_SYSTEM` constant initializations at lines 410-450.

### Pitfall 2: Round-0 output drifts from baseline because of unconditional appended whitespace

**What goes wrong:** Even when `rewriteHint` is empty, the code unconditionally appends `'\n\n## Prior attempt feedback\n\n<prior_attempt_feedback>\n\n</prior_attempt_feedback>'`. The byte-stability test FAILS because the systemPrompt now ends with new bytes that the original Phase 45 baseline didn't have.

**Why it happens:** developer forgets the early-skip branch around the append.

**How to avoid:** wrap the append in `if (typeof rewriteHint === 'string' && rewriteHint.length > 0)`. Confirm with a Vitest fixture: `buildFixPrompt({errorClass:'WRONG_CITATION', issueBody:'x'}).systemPrompt === PROMPT_SCAFFOLDS.WRONG_CITATION()` MUST hold.

**Warning signs:** byte-stability pins flip RED; cache_control miss rate spikes in Phase 68 weekly digest.

### Pitfall 3: Cap interaction with `--max-budget-usd 0.50` (subscription transport)

**What goes wrong:** The subscription CLI already enforces `--max-budget-usd 0.50` per call (set in `tests/e2e/lib/llm-driver.js:113`). Real ledger data 2026-06-07/08 shows subscription calls land at $0.16–$0.20 each. After round 0 + round 1, cumCost is $0.32–$0.40 — under the $0.50 dispatcher cap. After round 0 + round 1 + round 2, cumCost is $0.48–$0.60 — STRADDLING the cap. The iter loop will OFTEN exhaust at round 1 → cap → budget-cap row (no round 2 attempted). This is correct behavior per CONTEXT.md, but easy to misread as a bug.

**Why it happens:** the two caps look identical ($0.50) but operate at different layers. The CLI cap is PER-INVOCATION; the dispatcher cap is CUMULATIVE.

**How to avoid:** document this explicitly in the iter wrapper inline comment. Verify the Vitest pin `T_PROMPT_ITER_BUDGET_01` uses synthetic cost values that EXERCISE the cap (e.g., `costUsd: 0.25` per call → round 2 triggers cap).

**Warning signs:** Phase 68 final tally shows zero `iter_round: 2` rows for subscription transport — that is EXPECTED, not a bug. SDK transport should show `iter_round: 2` rows at the usual ratio.

### Pitfall 4: Pre-loop `built` becomes stale after round 0

**What goes wrong:** Step 7's `built = buildFixPrompt({...})` happens BEFORE the loop. If you keep using that pre-loop `built` inside the loop body, round 1's hint is ignored — the SDK gets called with the round-0 systemPrompt every iteration.

**Why it happens:** copy-paste from Step 7 into the loop body, forgetting to re-invoke `buildFixPrompt`.

**How to avoid:** the loop body MUST start with a fresh `buildFixPrompt({errorClass, issueBody, rewriteHint})` call. Step 7's `built` is consumed only for skip-class / dry-run / supported-class checks; it is NOT used inside the loop.

**Warning signs:** integration test where round 1 produces the same systemPrompt as round 0; ledger entries have iter_round increments but no actual prompt change.

### Pitfall 5: Successive iter rounds bypass Step 9's systemBlocks rebuild

**What goes wrong:** Step 9 builds `systemBlocks` ONCE before Step 10. If the loop body skips rebuilding systemBlocks per round, the SDK gets `cache_control` set on the round-0 systemPrompt while the round-N hint changes the prompt.

**Why it happens:** Step 9 currently lives BEFORE Step 10 (line 762-768). Naive wrap leaves Step 9 outside the loop.

**How to avoid:** rebuild `systemBlocks` inside the loop body, after the per-round `buildFixPrompt` call. Round 0 produces byte-identical systemBlocks (cache hit holds); round N gets the hint-augmented systemBlocks.

**Warning signs:** SDK call telemetry shows cache_misses on round 0 (unexpected) or round-N hint isn't reaching the model.

### Pitfall 6: FORBIDDEN_PATHS regex anchor is too broad

**What goes wrong:** Using `tests/e2e/lib/fix-prompt-builder\.js` (no anchors) would also match `subdir/tests/e2e/lib/fix-prompt-builder.js.bak` or `tests/e2e/lib/fix-prompt-builder.js.orig`.

**Why it happens:** copy-paste from a less-strict pattern; missing `^` and `$`.

**How to avoid:** use exact anchors `^tests\/e2e\/lib\/fix-prompt-builder\.js$` and `^tests\/e2e\/lib\/llm-router\.js$`. Mirrors the existing 8 entries.

**Warning signs:** F12-style legitimate-path test fails because the new entry matches a path it shouldn't.

### Pitfall 7: `iter_round` written to FLAKE/skip-class/dry-run ledger rows

**What goes wrong:** the new `iter_round` field is appended to ledger rows that PRE-DATE the iter loop (Step 7 skip-class write at line 728-740, Step 6 idempotency write at line 681-697). Downstream A/B analytics treats them as round-0 attempts that succeeded immediately — distorts sample math.

**Why it happens:** developer adds `iter_round` defensively to every `safeAppendLedger` site "just in case."

**How to avoid:** ONLY the 4-5 ledger writes INSIDE the iter loop body get `iter_round`. The pre-loop writes (Step 6 idempotency, Step 7 skip-class, Step 7 FLAKE dispatcher) stay UNCHANGED. Verify by greppable diff: `git diff -- scripts/auto-fix.mjs | grep '+.*iter_round' | wc -l` should equal exactly 4 or 5 (success, malformed-diff, apply-check, optional diff-guard, budget-cap).

**Warning signs:** ledger rows with `iter_round: 0` AND `escalate: 're-quarantine'` simultaneously — that's a category error.

### Pitfall 8: Local `safeAppendLedger` wrapper vs Phase 62 shared helper confusion

**What goes wrong:** developer assumes the auto-fix dispatcher should switch to the Phase 62 shared `tests/e2e/lib/safe-append-ledger.js` and refactors as part of Phase 67.

**Why it happens:** Phase 62 created a shared helper. Reasonable to think it should be universal.

**How to avoid:** `scripts/auto-fix.mjs` INTENTIONALLY keeps its OWN local wrapper at lines 143-181. This is documented at `tests/e2e/lib/safe-append-ledger.js:17-20` ("scripts/auto-fix.mjs intentionally still uses its own local wrapper... so the Phase 60.1 L1+L2 source-grep pins... remain green by construction"). Phase 67 changes ONLY entry literals; it does NOT touch the local `safeAppendLedger` body OR migrate to the shared helper.

**Warning signs:** any diff that imports from `../e2e/lib/safe-append-ledger.js` into `scripts/auto-fix.mjs`, or that modifies the local wrapper body.

### Pitfall 9: Forgetting to ship FORBIDDEN_PATHS in the same atomic commit

**What goes wrong:** the iter loop wrapper lands in commit A; the FORBIDDEN_PATHS extension lands in commit B (later). Between A and B, the trust boundary is open — an auto-fix PR could land a diff editing `fix-prompt-builder.js` and pass diff-guard.

**Why it happens:** seems natural to ship "feature" and "guard" in separate commits.

**How to avoid:** CONTEXT.md says the FORBIDDEN_PATHS extension is NON-NEGOTIABLE and "ships in the SAME atomic commit as the iter loop wrapper." Plan accordingly — single commit covering both.

**Warning signs:** PR with commits split across "feat(67): iter loop" and "feat(67): forbidden paths" — squash before merge OR reorder to a single commit.

## Code Examples

Verified patterns from existing source.

### Example A: `safeAppendLedger` call literal with iter_round added

```javascript
// Source: synthesized from scripts/auto-fix.mjs:886-900 existing apply-check-failed shape
safeAppendLedger({
  iso: new Date().toISOString(),
  model: 'claude-sonnet-4-6',
  cost_usd: 0,
  tokens_in: 0,
  tokens_out: 0,
  phase: PHASE,
  transport,
  issueId: `issue-${issue}`,
  fingerprint,
  errorClass,
  source: 'auto-fix-api',
  errorReason: 'apply-check-failed',
  errorMessage: stderrSnip,
  iter_round: state.round,   // NEW Phase 67 PITER-03 additive field
});
```

### Example B: Mock surface reuse in new test file

```javascript
// Source: synthesized from tests/unit/auto-fix.test.js:53-105 existing mock pattern

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks — IDENTICAL to tests/unit/auto-fix.test.js:53-80
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));
vi.mock('../e2e/lib/llm-driver.js', () => ({
  invokeAnthropicSdkWithLedger: vi.fn(),
  invokeClaudePWithLedger: vi.fn(),
}));
vi.mock('../e2e/lib/llm-ledger.js', () => ({
  readLedger: vi.fn(() => ({ version: 1, months: {} })),
  appendLedgerEntry: vi.fn(),
  countFixAttempts: vi.fn(() => 0),
  LEDGER_PATH: '/tmp/test-ledger.json',
}));
vi.mock('../e2e/lib/triage-classifier.js', () => ({
  classifyRerunOutcomes: vi.fn(() => ({ state: 'FLAKE', action: 're-quarantine' })),
  readRingBufferOrInit: vi.fn(() => ({ version: 1, cases: {} })),
  readSuppressionsOrInit: vi.fn(() => ({ version: 1, suppressions: {} })),
  atomicWriteJson: vi.fn(),
  buildFlakeInvestigationBody: vi.fn(() => '## Flake investigation body\n'),
  FLAKE_SUPPRESSION_DAYS: 30,
}));

import { execFileSync } from 'node:child_process';
import { invokeAnthropicSdkWithLedger } from '../e2e/lib/llm-driver.js';
import { appendLedgerEntry } from '../e2e/lib/llm-ledger.js';
import { runDispatcher } from '../../scripts/auto-fix.mjs';

beforeEach(() => {
  process.env.CI = 'true';   // satisfies safeAppendLedger CI gate
  vi.resetAllMocks();
});
```

### Example C: T_PROMPT_ITER_BUDGET_01 test outline

```javascript
// Source: synthesized for Phase 67 — single mandatory test per CONTEXT.md

it('T_PROMPT_ITER_BUDGET_01: after ITER_MAX_ROUNDS retries, next iter call returns 0 with budget-cap row', async () => {
  // Pre-arrange: gh issue view returns a WRONG_CITATION issue with synthetic body
  setupExecFileSyncRouter([
    { match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'view',
      respond: () => ghIssueViewJson({ labels: ['triage','WRONG_CITATION'] }) },
    { match: (cmd, args) => cmd === 'git' && args[0] === 'apply' && args[1] === '--check',
      respond: () => { const e = new Error('exec failed'); e.stderr = 'simulated apply-check failure'; throw e; }},
  ]);

  // SDK returns a malformed-but-fencedish diff that passes parseFencedDiff but fails git apply --check
  // costUsd 0.20 per call → round 0+1 = 0.40 (under cap); round 0+1+2 = 0.60 (over cap)
  vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
    ok: true,
    llmText: '===DIFF_START===\ndiff --git a/src/foo.js b/src/foo.js\n--- a/src/foo.js\n+++ b/src/foo.js\n@@\n+broken\n===DIFF_END===',
    costUsd: 0.20,
    modelId: 'claude-sonnet-4-6',
    rawJson: {},
  });

  const exitCode = await runDispatcher({ issue: 3, transport: 'sdk', forceApi: true });

  // Assertions
  expect(exitCode).toBe(0);   // graceful abstention
  const ledgerCalls = vi.mocked(appendLedgerEntry).mock.calls.map(([, e]) => e);

  // Ledger should contain: round-0 apply-check-failed + round-1 apply-check-failed + budget-cap row
  // (NOTE: round-2 attempt may or may not fire depending on cumCost ordering; the cap row MUST fire)
  expect(ledgerCalls.some(e => e.iter_round === 0 && e.errorReason === 'apply-check-failed')).toBe(true);
  expect(ledgerCalls.some(e => e.errorReason === 'prompt-iter-budget-cap')).toBe(true);

  // SDK invocation count matches the budget-bounded retry count
  expect(invokeAnthropicSdkWithLedger.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(invokeAnthropicSdkWithLedger.mock.calls.length).toBeLessThanOrEqual(ITER_MAX_ROUNDS + 1);
});
```

### Example D: fast-fail on sdk_error (PITER-04 pin)

```javascript
// Source: synthesized — required Vitest fixture per CONTEXT.md "test fixture pins fast-fail on sdk_error"

it('T_PROMPT_ITER_SDK_ERROR_FAST_FAIL: sdk_error returns 1 immediately; no iter retry', async () => {
  setupExecFileSyncRouter([
    { match: (cmd, args) => cmd === 'gh' && args[0] === 'issue' && args[1] === 'view',
      respond: () => ghIssueViewJson({ labels: ['triage','WRONG_CITATION'] }) },
  ]);

  vi.mocked(invokeAnthropicSdkWithLedger).mockResolvedValue({
    ok: false,
    errorReason: 'sdk_error',
    errorMessage: 'simulated API outage',
  });

  const exitCode = await runDispatcher({ issue: 3, transport: 'sdk', forceApi: true });

  expect(exitCode).toBe(1);
  expect(invokeAnthropicSdkWithLedger).toHaveBeenCalledTimes(1);   // EXACTLY 1, no iter retry
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single LLM call per dispatcher invocation (Phase 42-Phase 60) | In-process iter loop with up to ITER_MAX_ROUNDS retries (Phase 67) | Phase 67 (this phase) | Increases fix-rate on apply-check-failed; bounded by $0.50 per-fingerprint cap |
| `--max-turns 1` subscription CLI (Phase 60.1 baseline) | `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` (Phase 61 TURNS-01) | Phase 61 (already shipped on origin/main) | Substrate for Phase 67 — the subscription transport can now actually use multi-turn reasoning that Phase 67 then iterates on |
| `safeAppendLedger` unique to `auto-fix.mjs` (Phase 56) | Shared helper at `tests/e2e/lib/safe-append-ledger.js` for 4 other sites + LOCAL wrapper stays in `auto-fix.mjs` (Phase 62 LEDX-01) | Phase 62 (already shipped) | Phase 67 uses the LOCAL wrapper, NOT the shared helper — intentional per Phase 62 LEDX-01 design |
| `appendLedgerEntry({errorClass})` field added (Phase 56 LEDGER-01) | Same shape + Phase 58 outcome additive fields (Phase 58 PROMOTE-04) + Phase 67 `iter_round` (this phase) | Phase 67 (this phase) | Additive-only — `appendLedgerEntry` body byte-unchanged across all three additions |

**Deprecated / outdated:** None. Phase 67 is purely additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Real-world subscription cost per call is $0.16–$0.20 (extrapolated from 2026-06-07 / 2026-06-08 ledger entries; 4 data points) | Summary, Pitfall 3 | If subscription calls are typically cheaper, iter rounds 1+2 will more often complete successfully (fine — design accommodates this). If typically more expensive, iter loop will hit cap at round 1 routinely (still correct behavior — graceful abstention is the design). |
| A2 | `sdkResult.costUsd` is the canonical per-call cost on both transport return shapes | Pattern 2, Pitfall 3 | Verified by grep in `tests/e2e/lib/llm-driver.js:236, 461` — both `invokeAnthropicSdkWithLedger` and `invokeClaudePWithLedger` return `costUsd`. LOW risk. |
| A3 | The 7 sha256 byte-stability pins at `tests/unit/fix-prompt-builder-byte-stability.test.js:23-46` hash `PROMPT_SCAFFOLDS[k]()` and NOT `buildFixPrompt(...).systemPrompt` | Pattern 1, Pitfall 1 | Verified by source read — pins call `PROMPT_SCAFFOLDS[className]()` on line 40. LOW risk; CONFIRMED. |

**All other claims** in this RESEARCH.md are tagged with explicit source line references or sit inside `<user_constraints>` (verbatim from CONTEXT.md).

## Open Questions (RESOLVED)

1. **Should round-1 hint augmentation include the round-0 failure as well, accumulating across rounds?**
   - What we know: CONTEXT.md says hint composition is "first 500 chars of stderr" or "`parseFencedDiff.reason` verbatim" — singular, from the immediately-prior attempt.
   - What's unclear: when round 1 fails for a different reason than round 0 (e.g., round 0 was malformed-diff, round 1 was apply-check), does round 2's hint replace round 1's, or accumulate?
   - **RESOLVED:** replace, not accumulate. The CONTEXT.md text says "previous attempt's failure mode" (singular). Accumulating would also bloat the prompt and dilute the signal. Default to replacement; if Phase 68 weekly digest shows iter_round 2 has lower fix-rate than iter_round 1, revisit in v4.4.

2. **`iter_round` field name vs `iterRound` (snake_case vs camelCase)?**
   - What we know: existing ledger fields are a mix (`cost_usd`, `tokens_in`, `errorClass`, `errorReason`, `issueId`).
   - What's unclear: which convention is canonical for new fields.
   - **RESOLVED:** follow CONTEXT.md verbatim — `iter_round` (snake_case). Mirrors `cost_usd` / `tokens_in` / `is_error` / `fault_injection_status` (the dominant snake_case shape for ledger and producer-emitted fields). The camelCase fields are JS-side (`costUsd`, `errorReason`, `issueId`) and stay JS-side.

3. **Does `T_PROMPT_ITER_BUDGET_01` need to assert exact ledger-row order (round 0 first, round 1 second, budget-cap third) or just presence?**
   - What we know: ROADMAP success criterion 5 says "after 2 iter-rewrites per fingerprint, next call returns abstention."
   - What's unclear: whether the order assertion is required or whether `.toContain` shape is sufficient.
   - **RESOLVED:** assert ORDER. The downstream A/B analytics treats ledger order as the iteration sequence; out-of-order writes would distort the analysis. Pin the order explicitly.

## Environment Availability

Phase 67 has no external tool dependencies beyond Vitest (already installed) and `node:crypto` (stdlib). The phase modifies pure-function JS files plus the dispatcher script — no external services, no databases, no scheduled jobs.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | Unit tests (existing + new file) | ✓ | `^3.0.0` caret pin (verified in `package.json` per project convention) | — |
| `node:crypto` | sha256 byte-stability pin (existing test) | ✓ | (stdlib; Node ≥ 18) | — |
| `@anthropic-ai/sdk` | SDK transport (existing) | ✓ | `0.100.1` EXACT pin (UNCHANGED in v4.3) | — |
| `claude` CLI v2.1.169 | Subscription transport (existing) | ✓ (per Phase 61 already shipped) | 2.1.169 | — |
| `git` | apply --check (existing Step 13) | ✓ | (system) | — |
| `gh` CLI | issue view (existing Step 2) | ✓ | (system) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.0.0` (existing) |
| Config file | `vitest.config.*` (existing — Phase 67 does not touch) |
| Quick run command | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js tests/unit/fix-prompt-builder.test.js tests/unit/fix-prompt-builder-byte-stability.test.js tests/unit/check-diff-guard.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PITER-01 | `buildFixPrompt({rewriteHint})` appends `<prior_attempt_feedback>` block; round-0 (empty rewriteHint) is byte-identical to today | unit | `npx vitest run tests/unit/fix-prompt-builder.test.js -t 'rewriteHint'` | ❌ Wave 0 (new tests added to existing file) |
| PITER-01 | 7 scaffold byte-stability sha256 pins still pass | unit | `npx vitest run tests/unit/fix-prompt-builder-byte-stability.test.js` | ✅ existing |
| PITER-01 | `PROMPT_SCAFFOLDS` is still `Object.frozen` (existing mutation guard) | unit | `npx vitest run tests/unit/fix-prompt-builder.test.js -t 'mutation attempt'` | ✅ existing |
| PITER-02 | `runDispatcher` Step 10 iterates on malformed-diff outcome with hint composed from `parseFencedDiff.reason` | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'malformed-diff'` | ❌ Wave 0 |
| PITER-02 | `runDispatcher` Step 10 iterates on apply-check-failed with hint composed from stderr (first 500 chars) | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'apply-check'` | ❌ Wave 0 |
| PITER-03 | New constants `ITER_MAX_ROUNDS === 2` and `PROMPT_ITER_COST_CAP_USD === 0.50` are exported / accessible | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'constants'` | ❌ Wave 0 |
| PITER-03 | Ledger rows inside iter loop carry `iter_round: 0..2` integer; pre-loop rows do not | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'iter_round field'` | ❌ Wave 0 |
| PITER-03 | `appendLedgerEntry` 33 pre-existing Vitest tests stay GREEN | unit | `npx vitest run tests/unit/llm-ledger.test.js` | ✅ existing |
| PITER-04 | `T_PROMPT_ITER_BUDGET_01` — after ITER_MAX_ROUNDS retries, returns 0 with budget-cap ledger row | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'T_PROMPT_ITER_BUDGET_01'` | ❌ Wave 0 |
| PITER-04 | sdk_error fast-fails (returns 1) with EXACTLY 1 SDK invocation (no retry) | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'sdk_error fast-fail'` | ❌ Wave 0 |
| PITER-04 | diff-guard-violation fast-fails (returns 1) with EXACTLY 1 SDK invocation (no retry) | unit | `npx vitest run tests/unit/auto-fix-prompt-iter.test.js -t 'diff-guard fast-fail'` | ❌ Wave 0 |
| PITER-05 | `FORBIDDEN_PATHS.length === 10` (was 8) | unit | `npx vitest run tests/unit/check-diff-guard.test.js -t 'exports exactly 10'` | ❌ Wave 0 (update existing F-test) |
| PITER-05 | `checkDiffGuard(['tests/e2e/lib/fix-prompt-builder.js'])` returns `{ok:false}` | unit | `npx vitest run tests/unit/check-diff-guard.test.js -t 'F15'` | ❌ Wave 0 |
| PITER-05 | `checkDiffGuard(['tests/e2e/lib/llm-router.js'])` returns `{ok:false}` | unit | `npx vitest run tests/unit/check-diff-guard.test.js -t 'F16'` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/auto-fix-prompt-iter.test.js tests/unit/fix-prompt-builder.test.js tests/unit/fix-prompt-builder-byte-stability.test.js tests/unit/check-diff-guard.test.js` (the 4-file fast-feedback batch; runs in ≤ 5 seconds based on existing baselines)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green BEFORE `/gsd:verify-work`; specifically the byte-stability test MUST pass on every commit (it is the canonical regression-detector for PITER-01)

### Wave 0 Gaps

- [ ] `tests/unit/auto-fix-prompt-iter.test.js` — NEW file; houses `T_PROMPT_ITER_BUDGET_01` + companion tests (PITER-02, PITER-03, PITER-04). Reuses the mock surface from `tests/unit/auto-fix.test.js:53-105`.
- [ ] `tests/unit/fix-prompt-builder.test.js` — additive cases ONLY (existing 30+ tests stay green): test that `buildFixPrompt({rewriteHint:''})` returns byte-identical systemPrompt to `buildFixPrompt({})`; test that `buildFixPrompt({rewriteHint:'simulated stderr'})` ends with the `<prior_attempt_feedback>` block.
- [ ] `tests/unit/check-diff-guard.test.js` — update F-bank length assertion (line 36, count 8 → 10); add F15 + F16 tests for the two new entries.
- [ ] Framework install: none needed — Vitest already pinned at `^3.0.0`.

## Security Domain

`security_enforcement` is not present in `.planning/config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface (Phase 67 is internal dispatcher logic; no user-facing auth) |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes (PITER-05) | FORBIDDEN_PATHS regex bank extension is an access-control hardening — defense-in-depth that even a future Shape B prompt-iter PR cannot edit `fix-prompt-builder.js` or `llm-router.js` |
| V5 Input Validation | yes | `rewriteHint` parameter MUST be validated (`typeof rewriteHint === 'string' && rewriteHint.length > 0`); stderr capture already bounded to 500 chars at `auto-fix.mjs:885`; `parseFencedDiff.reason` already constrained to known string set ('non-string-llm-text', 'no-fences', 'unbalanced-fences', 'multiple-diff-blocks', 'fence-regex-mismatch') |
| V6 Cryptography | yes | sha256 byte-stability pins use `node:crypto` `createHash` — stdlib, never hand-rolled |

### Known Threat Patterns for Node.js Auto-Fix Dispatcher Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious diff editing prompt builder | Tampering | FORBIDDEN_PATHS extension to `fix-prompt-builder.js` + `llm-router.js` (PITER-05) — defense-in-depth pinned in same commit as the iter loop |
| Prompt injection via stderr capture | Tampering | stderr is captured from `git apply --check`, a trusted local subprocess; first 500 chars only; the LLM treats hint as untrusted input by virtue of the existing `<issue_body_untrusted>` envelope discipline. NEW `<prior_attempt_feedback>` block sits OUTSIDE the envelope — model is informed it's machine-generated feedback, not a user instruction. |
| Cost-explosion via iter loop spinning | Denial of Service | `ITER_MAX_ROUNDS = 2` ceiling + `PROMPT_ITER_COST_CAP_USD = 0.50` cumulative cap + existing per-issue $1 cap + per-PR $2 cap + day $10 + monthly $100. Five layered defenses. |
| Cache_control byte-drift | Tampering (cost discipline) | Round-0 byte-identity preserved by early-skip branch; existing 7 sha256 byte-stability pins continue to detect drift |
| Object.freeze bypass | Tampering | Existing strict-mode mutation guard at `tests/unit/fix-prompt-builder.test.js:344-352`; Phase 67 does NOT touch the frozen object structure |
| Ledger schema validation bypass | Tampering | `iter_round` is purely additive — `appendLedgerEntry` body remains byte-unchanged; the Phase 62 wrapper's transport validation (`VALID_TRANSPORTS` Set) continues to gate other ledger writes |
| `--admin` bypass on auto-fix PR | Repudiation | Phase 62 BYPASS-01/02/03 already shipped — Phase 67's iter loop has NO new bypass surface; existing audit-bypass-merges flow covers |

## Sources

### Primary (HIGH confidence)

- `scripts/auto-fix.mjs` (lines 1-1045) — VERIFIED: dispatcher source of truth; Step 10 at 770-820, Step 11 at 822-841, Step 12 at 843-875, Step 13 at 877-903; safeAppendLedger local wrapper at 143-181; fingerprint extraction at 238/602
- `tests/e2e/lib/fix-prompt-builder.js` (lines 1-562) — VERIFIED: `buildScaffoldSystemPrompt` at line 117 is pure string-returning helper; `buildFixPrompt` at line 534; `PROMPT_SCAFFOLDS` Object.freeze at line 483; the 7 scaffold thunks at 483-491
- `tests/e2e/lib/llm-ledger.js` (line 686) — VERIFIED: `appendLedgerEntry` body does `m.iterations.push(entry)` verbatim — additive keys flow through unchanged
- `tests/e2e/lib/llm-driver.js` (lines 80-115, 510-590) — VERIFIED: subscription CLI args include `--max-budget-usd 0.50`; SDK and subscription both return `costUsd`
- `tests/e2e/lib/llm-router.js` (lines 1-109) — VERIFIED: pure module, zero imports, `MODEL_ROUTES` Object.freeze; PITER-05 protects this file from auto-fix PR edits
- `tests/e2e/lib/safe-append-ledger.js` (lines 1-145) — VERIFIED Phase 62 LEDX-01 shared helper; documents that `auto-fix.mjs` keeps its OWN local wrapper (lines 17-20)
- `scripts/check-diff-guard.mjs` (lines 1-106) — VERIFIED: `FORBIDDEN_PATHS` is `Object.freeze`'d literal RegExp array; checker function at 66-79; CLI shim at 85-103
- `tests/unit/check-diff-guard.test.js` (lines 32-159) — VERIFIED: 8-entry assertion at line 36; F-test pattern F1..F14
- `tests/unit/fix-prompt-builder-byte-stability.test.js` (lines 23-47) — VERIFIED: 7 sha256 pins; hashing pattern `sha256hex(PROMPT_SCAFFOLDS[className]())` confirms pins target the SCAFFOLD thunk return value, NOT `buildFixPrompt(...)`
- `tests/unit/fix-prompt-builder.test.js` (lines 1-705) — VERIFIED: Object.freeze + mutation-guard tests at 103-104, 344-352; AB-02 model-field tests at 514-585
- `tests/unit/auto-fix.test.js` (lines 1-1395) — VERIFIED: hoisted-mock pattern at 53-80; setup pattern at 138-150; per-test mockResolvedValue pattern at 305+
- `tests/e2e/.llm-spend-ledger.json` — VERIFIED: real cost-per-call data for Phase 61 subscription transport ($0.16–$0.20 range, 2026-06-07/08 entries)
- `.planning/phases/67-prompt-iter-loop-shape-a-capture-and-surface-in-process/67-CONTEXT.md` — locked user decisions (verbatim in `<user_constraints>`)
- `.planning/REQUIREMENTS.md` — PITER-01..05 + Out-of-Scope rows confirming `--max-turns` ceiling and Shape B rejection
- `.planning/STATE.md` (Budget table at lines 36-48 + Phase 67 blocker at lines 136-137) — confirmed cap layering and `PROMPT_ITER_COST_CAP_USD` placement
- `.planning/ROADMAP.md` (Phase 67 success criteria at 113-124) — confirms ITER_MAX_ROUNDS = 2 + PROMPT_ITER_COST_CAP_USD = 0.50 + non-negotiable FORBIDDEN_PATHS extension

### Secondary (MEDIUM confidence)

- v4.3 carry-over notes in `.planning/STATE.md` Pending Todos — confirmed Phase 67 substrate requirement (Phase 61 LIVE on origin/main per `759cd78`)

### Tertiary (LOW confidence)

None — Phase 67 is a small-surface in-process change against an extensively-source-read codebase. Every claim is sourced to a line number.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Phase 67 adds zero packages; every helper used already exists and was source-read
- Architecture: HIGH — Step 10..13 boundaries verified by line-by-line source read; iter wrapper shape matches CONTEXT.md exactly
- Pitfalls: HIGH — pitfalls 1-9 are derived from concrete source artifacts (line numbers cited inline); the byte-stability sha256 risk is the highest-impact concern and is concretely de-risked by the pin's target (`PROMPT_SCAFFOLDS[k]()`, not `buildFixPrompt(...)`)

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days — stable codebase with no external dependencies changing)

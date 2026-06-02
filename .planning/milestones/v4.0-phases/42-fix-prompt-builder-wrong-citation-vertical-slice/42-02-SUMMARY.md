---
phase: 42-fix-prompt-builder-wrong-citation-vertical-slice
plan: 02
subsystem: auto-fix-loop
tags: [auto-fix-dispatcher, sdk-call, diff-guard, ls-remote-idempotency, fix-attempts-cap, cache-control, dry-run, no-push, pitfall-6, tdd]
requires:
  - tests/e2e/lib/fix-prompt-builder.js (Plan 42-01 — buildFixPrompt + PROMPT_SCAFFOLDS + ENVELOPE_OPEN/CLOSE + DIFF_FENCE_START/END)
  - tests/e2e/lib/llm-driver.js (Phase 39 — invokeAnthropicSdkWithLedger; EXTENDED in this plan for cache_control)
  - tests/e2e/lib/llm-ledger.js (Phase 39 + Plan 42-01 — readLedger / appendLedgerEntry / countFixAttempts / LEDGER_PATH)
  - scripts/check-diff-guard.mjs (Phase 41-01 — checkDiffGuard + FORBIDDEN_PATHS, frozen single source of truth)
  - tests/e2e/lib/error-codes.js (Phase 28 — ERROR_CLASSES closed taxonomy)
provides:
  - scripts/auto-fix.mjs (NEW — 600 LOC; 18-step dispatcher implementing AUTOFIX-01/03/04/05 + --dry-run + --no-push + Pitfall 6 cache_control consumer; exports `runDispatcher` named export for unit testing)
  - tests/e2e/lib/llm-driver.js::invokeAnthropicSdkWithLedger (EXTENDED — optional `systemBlocks` array-form parameter for cache_control; contract guard if neither systemBlocks nor systemPrompt supplied)
affects:
  - Plan 42-03 (manual demo): can now invoke `node scripts/auto-fix.mjs --issue 3 --force-api --no-push` against the live demo target (fingerprint 139f821b3bb1, branch auto-fix/3-139f821b)
  - Phase 43 (v40-auto-fix.yml workflow): lifts this dispatcher into an issues.labeled('triage') trigger; concurrency group will be the cross-dev defense (CONTEXT Q3 accept boundary)
  - Phase 45: will add 4 more keys to PROMPT_SCAFFOLDS without changing the dispatcher (only the routing table grows)
tech-stack:
  added: []
  patterns:
    - "Dual-purpose ESM script — named `runDispatcher` export + thin `if (import.meta.url === ...)` CLI shim (mirrors scripts/verify-single-case.mjs from Phase 41-02)"
    - "Programmable execFileSync router in Vitest — match by (cmd, args) tuple, respond per rule; lets every test compose its own fake gh/git call sequence without subprocess overhead"
    - "Single-source-of-truth import for diff-guard regex bank — `import { checkDiffGuard } from './check-diff-guard.mjs'` (NO inline FORBIDDEN_PATHS duplication; grep -cE '^const FORBIDDEN_PATHS =' returns 0)"
    - "Pitfall 6 driver extension — optional `systemBlocks` array-form parameter takes precedence over `systemPrompt` string form; back-compat preserved (Phase 39 / 40 / 41 callers see no shape change)"
    - "CWE-94 hygiene — execFileSync(cmd, [arg, ...]) with explicit arg arrays everywhere; issue-body content as discrete --body arg, never concatenated into a command line"
key-files:
  created:
    - scripts/auto-fix.mjs
    - tests/unit/auto-fix.test.js
    - tests/unit/llm-driver-sdk-cache-control.test.js
  modified:
    - tests/e2e/lib/llm-driver.js (+33/-2 — systemBlocks param + JSDoc update + array/string dispatch at `system:` field + contract guard for missing system field)
decisions:
  - "Dispatcher recognizes ERROR_CLASSES (closed RPT-02 taxonomy) PLUS the literal 'PASS' label. PASS is a status, not an error class, so it lives outside the canonical set — but Plan 42-02 and 42-CONTEXT both treat PASS as a routable skip class (escalate:'close-as-pass'). Documented inline at RECOGNIZED_LABELS in auto-fix.mjs."
  - "parseFencedDiff uses three-stage detection (count starts; count ends; balance check; multi-block reject) before the body-extraction regex. Surfaces precise reasons ('no-fences', 'unbalanced-fences', 'multiple-diff-blocks') to the ledger entry's errorReason, not a generic 'malformed-diff'."
  - "Driver contract guard (`!systemPrompt && !systemBlocks → ok:false errorReason:contract-error`) lives BEFORE the inverse-CI gate so unit tests without CI=true see the unambiguous contract failure, not a `ciGate:true` masquerade. This is the structural fix Vitest case 3 in llm-driver-sdk-cache-control.test.js pins."
  - "Per-fingerprint fix_attempts counter (not global) — countFixAttempts already filters by fingerprint internally; the dispatcher passes the extracted 12-hex fingerprint per invocation. Test 16 in auto-fix.test.js asserts the (ledger, fingerprint) call site uses the extracted fingerprint, not a literal."
  - "The CLI shim parses argv via Node's built-in parseArgs (project convention from Phase 41 scripts); the named `runDispatcher` export is the unit-tested surface. Subprocess testing is intentionally avoided — too slow for the ~14-case matrix."
metrics:
  duration_minutes: 14
  completed_date: 2026-05-31
  task_count: 2
  commit_count: 2
  files_created: 3
  files_modified: 1
---

# Phase 42 Plan 02: auto-fix.mjs Dispatcher + Pitfall 6 cache_control Driver Extension — Summary

Ships the Phase 42 CLI dispatcher that wires together Plan 42-01's
fix-prompt-builder + countFixAttempts helper, Phase 41-01's diff-guard, and
Phase 39's SDK driver into a single `node scripts/auto-fix.mjs --issue <n>`
command. Also extends the SDK driver with an optional array-form `systemBlocks`
parameter so the WRONG_CITATION SYSTEM block can carry cache_control through to
the Anthropic SDK (Pitfall 6 fix).

## Goal

Close the manual demo seam for the Phase 42 vertical slice. Plan 42-03 can now
invoke the dispatcher end-to-end against issue #3 to produce a draft PR
demonstrating the full auto-fix loop.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `9918fc5` | `test(42-02): RED — auto-fix dispatcher routing/idempotency/diff-guard/cap + cache-control driver extension` |
| 2 | `f6b2d13` | `feat(42-02): auto-fix.mjs dispatcher + invokeAnthropicSdkWithLedger systemBlocks extension` |

TDD gate sequence: `test(...)` (RED) → `feat(...)` (GREEN). RED commit
touches only the 2 new test files (`git diff 9918fc5^ 9918fc5 --name-only`).
GREEN commit touches the new dispatcher script + the driver extension.

## Line Counts

| File | Status | LOC |
|------|--------|-----|
| `scripts/auto-fix.mjs`                                | NEW    | 600 (435 non-comment) |
| `tests/e2e/lib/llm-driver.js`                         | EXTEND | +33/-2 |
| `tests/unit/auto-fix.test.js`                         | NEW    | 630 |
| `tests/unit/llm-driver-sdk-cache-control.test.js`     | NEW    | 111 |

## Requirements Satisfied

| Req | Coverage |
|-----|----------|
| AUTOFIX-01 | Dispatcher routes WRONG_CITATION through full SDK path; FLAKE/LLM_API_ERROR/PASS short-circuit with zero-cost ledger entries carrying the locked escalate strings; missing or multiple ERROR_CLASS labels exit 2. Pinned by Vitest cases 1-6 (`AUTOFIX-01: ERROR_CLASS routing` describe block). |
| AUTOFIX-03 | Dispatcher imports `checkDiffGuard` from `scripts/check-diff-guard.mjs` (single source of truth — grep verified `^const FORBIDDEN_PATHS =` returns 0 inline duplicates). `git apply --check` runs BEFORE `git apply`; rejection posts a gh issue comment naming the violated paths and exits 1. Pinned by Vitest cases 7-11 (`AUTOFIX-03: diff-guard + git apply --check`). |
| AUTOFIX-04 | `git ls-remote --heads origin auto-fix/<n>-<fp8>` runs BEFORE any SDK invocation; existing branch → branchExisted ledger entry + "already attempted" comment + exit 0. Saves cost on label-flap. Pinned by Vitest cases 12-13 (`AUTOFIX-04: git ls-remote idempotency`). |
| AUTOFIX-05 | `countFixAttempts(ledger, fingerprint) >= 3` → idempotent `gh label create human-review-required --force` + `gh issue edit --add-label human-review-required` + exit 3. Per-fingerprint counter (not global). Pinned by Vitest cases 14-16 (`AUTOFIX-05: fix_attempts cap at 3`). |

## Pitfall 6 — cache_control actually wired (regression-guarded)

The Anthropic SDK silently drops `cache_control` when the `system` field is
supplied as a string. The array-form `system: [{type:'text', text,
cache_control:{type:'ephemeral', ttl:'1h'}}]` is the only shape that engages
prompt caching (~30% cache-read savings on repeated invocations).

Plan 42-02's structural fix has two pieces:

1. **Driver extension** (`tests/e2e/lib/llm-driver.js`): `invokeAnthropicSdkWithLedger`
   now accepts an optional `systemBlocks` array parameter. When supplied, the
   request body's `system` field is the array form. String-form `systemPrompt`
   callers (Phase 39 / 40 / 41) see no behavioral change — the dispatch is
   `system: hasSystemBlocks ? systemBlocks : systemPrompt`.

2. **Dispatcher consumer** (`scripts/auto-fix.mjs`): builds `systemBlocks: [{type:
   'text', text: systemPrompt, cache_control: {type:'ephemeral', ttl:'1h'}}]`
   before calling the driver. `grep -c "ttl: '1h'\|ttl:'1h'" scripts/auto-fix.mjs`
   returns 2 (one in code + one in JSDoc).

The regression guard is `tests/unit/llm-driver-sdk-cache-control.test.js` case 2:
captures the SDK request body and asserts `Array.isArray(body.system) === true`.
If a future refactor reverts the dispatch to `system: systemPrompt`, this test
fails closed.

A defensive contract guard also lands in this plan: if NEITHER `systemBlocks`
NOR `systemPrompt` is supplied, the driver returns `{ok:false, errorReason:
'contract-error', errorMessage: ...}` BEFORE the inverse-CI gate. Case 3 pins
this.

## 18-step dispatcher sequence

Every step in 42-RESEARCH §System Architecture Diagram is traceable to a
Vitest case:

| Step | Behavior | Vitest case |
|------|----------|-------------|
| 1 | argv guard (--issue required, transport=sdk only in Phase 42) | 19 |
| 2 | `gh issue view <n> --json body,labels,title,number,assignees` | (every happy-path test) |
| 3 | extractFingerprint from body (`<!-- fp: 12hex -->`); exit 2 on miss | 20 |
| 4 | extractErrorClass (RECOGNIZED_LABELS ∪ {PASS}); exit 2 on none/multi | 5, 6 |
| 5 | AUTOFIX-05 cap check via countFixAttempts | 14, 15, 16 |
| 6 | AUTOFIX-04 `git ls-remote --heads origin <branch>` idempotency | 12, 13 |
| 7 | buildFixPrompt — skip-class short-circuit with zero-cost ledger | 2, 3, 4 |
| 8 | --dry-run short-circuit (prompt to stdout; no SDK / ledger / apply) | 17 |
| 9 | build systemBlocks with cache_control ttl:'1h' (Pitfall 6 wiring) | (cache-control test 2 verifies the resulting body shape) |
| 10 | invokeAnthropicSdkWithLedger with phase=42-auto-fix, issueId=issue-N | 1, 11, 13, 15, 16, 18 |
| 11 | parseFencedDiff (exactly 1 fenced block) | 9, 10 |
| 12 | checkDiffGuard via Phase 41-01 import | 7 |
| 13 | `git apply --check` (stdin) | 8 |
| 14 | `git apply` (stdin) | 11, 13, 15, 16, 18 |
| 15 | `git checkout -b auto-fix/<n>-<fp8>` | 11 |
| 16 | `git commit -am "Fix #N: ERROR_CLASS"` | 11, 18 |
| 17 | `git push -u origin <branch>` UNLESS --no-push | 11, 18 |
| 18 | print suggested `gh pr create` command for manual Plan 42-03 demo | (visible in stdout — Plan 42-03 will exercise) |

## CONTEXT decisions honored

| Q | Lock | Implementation |
|---|------|----------------|
| Q1 | `--no-push` flag | Implemented; commit lands locally, push skipped, stdout prints `git push -u origin <branch>` hint. Test 18 pins the behavior. |
| Q2 | Skip-class ledger entries (zero-cost) | FLAKE/LLM_API_ERROR/PASS each write `{phase:'42-auto-fix', cost_usd:0, escalate:'...'}` ledger entries for weekly-digest analytics. Tests 2, 3, 4 pin. |
| Q3 | Two-dev concurrent dispatch | ACCEPTED as local-only for Phase 42 (`git ls-remote` covers the obvious case; concurrent invocations from two devs are accepted risk). Phase 43's workflow concurrency group (`v40-auto-fix-${{ event.issue.number }}` with `cancel-in-progress: false`) is the real defense. |
| Q4 | Pitfall 6 cache_control extension | Driver extended with optional `systemBlocks`; dispatcher builds the array form with `cache_control: {type:'ephemeral', ttl:'1h'}` on the SYSTEM block. Cache-control test 2 is the regression guard. |

## Verification

| Check | Result |
|-------|--------|
| RED gate (`test(42-02): RED`) precedes GREEN gate (`feat(42-02):`) | YES — `9918fc5` then `f6b2d13` |
| All new Vitest cases pass | YES — 23/23 (20 auto-fix + 3 cache-control) |
| `npx vitest run` (full suite) | 915/916 pass; 1 pre-existing calendar-rollover flake in `e2e-weekly-digest.test.js` (deferred from Plan 42-01); no new regressions |
| `npm run lint` | 0 errors; 2 pre-existing warnings in `tests/e2e/lib/settings.js` (unrelated, noted in Plan 42-01 SUMMARY) |
| `grep -c "checkDiffGuard\|FORBIDDEN_PATHS" scripts/auto-fix.mjs` | 3 (≥1 required) |
| `grep -cE "^const FORBIDDEN_PATHS\s*=" scripts/auto-fix.mjs` | 0 (no inline duplication) |
| `grep -c "phase: '42-auto-fix'\|phase: PHASE" scripts/auto-fix.mjs` | 6 (≥3 required) |
| `grep -c "auto-fix/" scripts/auto-fix.mjs` | 2 (≥1 required — branch name format) |
| `grep -c "claude-sonnet-4-6" scripts/auto-fix.mjs` | 1 (≥1 required) |
| `grep -c "ttl: '1h'\|ttl:'1h'" scripts/auto-fix.mjs` | 2 (≥1 required — Pitfall 6) |
| `grep -c "systemBlocks" tests/e2e/lib/llm-driver.js` | 9 (≥2 required) |
| `node scripts/auto-fix.mjs --dry-run --issue 999` (smoke) | exits 2 (missing fingerprint per the dummy gh JSON path; proves dispatcher is runnable end-to-end at least to the gh call) |
| Phase 39 SDK driver tests (back-compat for string-form callers) | PASS — Tests 31-40 in `tests/unit/llm-driver.test.js` all green; the new `system: hasSystemBlocks ? systemBlocks : systemPrompt` dispatch preserves the string-form path |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `extractErrorClass` initially refused PASS labels (PASS not in ERROR_CLASSES)**

- **Found during:** Task 2 GREEN — Vitest case 4 (`PASS → no SDK; ledger escalate:'close-as-pass'; exit 0`) failed: dispatcher returned exit 2 instead of exit 0.
- **Issue:** `tests/e2e/lib/error-codes.js` ERROR_CLASSES is the closed RPT-02 taxonomy (FLAKE, LLM_API_ERROR, WRONG_CITATION, ...) — but PASS is a status, not an error class, so it is NOT a member. My initial `extractErrorClass` filtered against ERROR_CLASS_SET only, so a PASS-labeled issue had no recognized class → exit 2. But Plan 42-02's spec AND 42-CONTEXT.md treat PASS as a routable skip class (buildFixPrompt's SKIP_CLASS_ESCALATIONS maps PASS → 'close-as-pass'); requirement AUTOFIX-01 explicitly lists PASS short-circuit as a required behavior (line 164 of 42-02-PLAN.md).
- **Fix:** Renamed the dispatcher's allow-list set from `ERROR_CLASS_SET` to `RECOGNIZED_LABELS = new Set([...ERROR_CLASSES, 'PASS'])`. Documented inline that PASS lives outside the canonical taxonomy but is recognized for skip-class routing. Updated `extractErrorClass` and the error message accordingly.
- **Files modified:** `scripts/auto-fix.mjs` (in the same Task 2 GREEN commit `f6b2d13`).
- **Verification:** Vitest case 4 now passes; tests 5 (no ERROR_CLASS label) and 6 (multi labels) still pass — the contract for valid/invalid label counts is unchanged.

### Deferred (out of scope per executor SCOPE BOUNDARY)

**1. e2e-weekly-digest.test.js calendar-rollover flake (still pre-existing)**

The same pre-existing failure carried over from Plan 42-01's deferred-items.md:
the test seeds a hardcoded `2026-05` ledger month + asserts `$12.50` is rendered,
but `renderCostLine()` reads `currentMonth()` which is now `2026-06` (post
calendar rollover). Not caused by this plan; documented in
`.planning/phases/42-fix-prompt-builder-wrong-citation-vertical-slice/deferred-items.md`.

## Plan 42-03 Consumer Contract

Plan 42-03's manual demo can now invoke:

```bash
# Dry-run (no API cost; verify the prompt + envelope)
node scripts/auto-fix.mjs --issue 3 --force-api --dry-run

# Local stage (real SDK call; branch staged but not pushed)
node scripts/auto-fix.mjs --issue 3 --force-api --no-push

# Full demo (real SDK call; branch pushed; suggested gh pr create printed)
node scripts/auto-fix.mjs --issue 3 --force-api
```

Live demo target (verified at research time):
- Issue: #3
- Fingerprint: `139f821b3bb1` → fp8 = `139f821b`
- Branch: `auto-fix/3-139f821b`
- Case ID: `US11427642-spec-short-1`

Cost projection for the demo (per 42-RESEARCH): ~$0.05-$0.15 for one Sonnet 4.6
call on a small WRONG_CITATION fix (5k input + 1k output tokens). The
cache_control wiring (Pitfall 6 fix in this plan) means subsequent calls on the
same SYSTEM prompt benefit from ~30% cache-read savings.

## Known Stubs

NONE — `scripts/auto-fix.mjs` is the production dispatcher. Phase 43 will lift
the same `runDispatcher` named export into a GitHub workflow (`v40-auto-fix.yml`)
triggered by `issues.labeled('triage')`; no shape change to the named export
is anticipated.

## Threat Flags

No new security-relevant surface beyond what the threat register in 42-02-PLAN.md
already covers (T-42-05 through T-42-10 — all mitigated by the structural
patterns shipped in this plan).

## TDD Gate Compliance

| Gate | Commit | Verified |
|------|--------|----------|
| RED  | `9918fc5` (`test(42-02): RED — ...`) | YES — `npx vitest run tests/unit/auto-fix.test.js tests/unit/llm-driver-sdk-cache-control.test.js` exit non-zero (module-not-found on auto-fix + array-form assertion fail); `git diff 9918fc5^ 9918fc5 --name-only` returns only the 2 new test files |
| GREEN | `f6b2d13` (`feat(42-02): ...`) | YES — Vitest exit zero on the 2 targeted test files (23/23 pass); full `vitest run` 915/916 with 1 pre-existing flake (no new regressions) |
| REFACTOR | — | Not needed; GREEN implementation is the final shape. The RECOGNIZED_LABELS allow-list (vs ERROR_CLASS_SET) is the only mid-GREEN deviation, documented above. |

## Self-Check: PASSED

Files verified to exist:
- FOUND: `scripts/auto-fix.mjs`
- FOUND: `tests/unit/auto-fix.test.js`
- FOUND: `tests/unit/llm-driver-sdk-cache-control.test.js`
- FOUND: `tests/e2e/lib/llm-driver.js`
- FOUND: `.planning/phases/42-fix-prompt-builder-wrong-citation-vertical-slice/42-02-SUMMARY.md`

Commits verified in `git log`:
- FOUND: `9918fc5` (RED gate)
- FOUND: `f6b2d13` (GREEN gate)

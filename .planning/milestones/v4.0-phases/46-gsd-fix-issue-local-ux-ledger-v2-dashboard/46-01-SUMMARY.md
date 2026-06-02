---
phase: 46-gsd-fix-issue-local-ux-ledger-v2-dashboard
plan: 01
subsystem: auto-fix-dispatcher
tags: [autofix-06, subscription-transport, ledger-tag, push-truth-table]
requires:
  - tests/e2e/lib/llm-driver.js@invokeClaudePWithLedger (Phase 39)
  - scripts/auto-fix.mjs@runDispatcher (Phase 42)
  - tests/unit/auto-fix.test.js (Phase 42 + 45)
provides:
  - npm run fix-issue (local-iteration entry point)
  - VALID_TRANSPORTS allow-list (sdk|subscription)
  - --push opt-in flag with subscription-default no-push
  - transport: 'subscription' self-describing ledger entries
affects:
  - .planning/REQUIREMENTS.md AUTOFIX-06 (closed)
tech-stack:
  added: []
  patterns:
    - Allow-list guard via Set for closed-enum validation
    - IIFE truth-table resolution for push gating
    - Source-text static guard for ledger field assertions in Vitest
key-files:
  created:
    - .planning/phases/46-gsd-fix-issue-local-ux-ledger-v2-dashboard/46-01-SUMMARY.md
  modified:
    - tests/e2e/lib/llm-driver.js (lines ~417-428 — appendLedgerEntry block)
    - scripts/auto-fix.mjs (imports, constants, JSDoc, runDispatcher signature, Step 1 allow-list, Step 10 LLM dispatch, Step 17 push truth table, CLI shim, --help, header)
    - tests/unit/auto-fix.test.js (driver mock surface + beforeEach reset + Phase 46 describe block)
    - package.json (scripts.fix-issue entry)
decisions:
  - 46-01-D1: One-line driver patch (Assumption A1) — preserves Pitfall 8 CI guard verbatim
  - 46-01-D2: Subscription transport uses systemPrompt (string) not systemBlocks — invokeClaudePWithLedger has no cache_control surface
  - 46-01-D3: Push truth table — --no-push wins under both transports; sdk default push preserved; subscription default no-push
metrics:
  duration: ~25 minutes (executor wall-clock)
  completed: 2026-06-01T07:14:00Z
  tasks: 2/2
  vitest_cases_before: 32
  vitest_cases_after: 41
  vitest_cases_added: 9
  files_modified: 4
---

# Phase 46 Plan 01: /gsd:fix-issue local UX — subscription transport dispatch + --push truth table

**One-liner:** Wires `--transport subscription` through the Phase 39 `invokeClaudePWithLedger` wrapper, adds a `--push` opt-in flag with a locked truth-table resolution (subscription defaults to no-push; `--no-push` wins under both transports; sdk default push preserved), registers `npm run fix-issue`, and self-tags subscription ledger entries with `transport: 'subscription'` for forensic-grep clarity.

## What Was Built

### Task 1: `feat(46-01)` — Transport routing + truth table + ledger tag (`66d8717`)

**A. Driver one-line patch (`tests/e2e/lib/llm-driver.js`)**

Added `transport: 'subscription'` to the `appendLedgerEntry` call inside `invokeClaudePWithLedger` (adjacent to `phase` for symmetry with the SDK path). The CI guard at lines 387-393 (`process.env.CI === 'true'` short-circuit, Pitfall 8 of PITFALLS.md) is byte-identical to the pre-Phase-46 state — verified via `git diff bfcd304 HEAD -- tests/e2e/lib/llm-driver.js`, which shows ONLY the +2-line Phase 46 comment and the +1-line `transport: 'subscription',` addition inside the appendLedgerEntry argument object. Function signature unchanged. `invokeAnthropicSdkWithLedger` untouched.

**B. Dispatcher rewiring (`scripts/auto-fix.mjs`)**

1. Imports — added `invokeClaudePWithLedger` to the existing destructured import from `tests/e2e/lib/llm-driver.js`.
2. Constants — added `PHASE_46 = '46-fix-issue'`, `SOURCE_FIX_ISSUE = 'fix-issue-cli'`, `VALID_TRANSPORTS = new Set(['sdk', 'subscription'])`.
3. `runDispatcher` — added `push = false` to destructured opts; updated JSDoc to document `transport ∈ {sdk, subscription}`, `push` (Phase 46 opt-in), and the `--no-push` override semantics.
4. Step 1 allow-list — replaced the Phase 42 hard-reject (lines 402-408) with an allow-list guard that emits `unrecognized --transport '<value>'; expected one of: sdk, subscription` and returns exit 2.
5. Step 10 LLM dispatch — `if (transport === 'subscription')` routes through `invokeClaudePWithLedger({systemPrompt, userPrompt, phase: PHASE_46, source: SOURCE_FIX_ISSUE})`; the `else` branch is byte-identical to Phase 42's SDK call. The shared `sdkResult` error mapper (lines 596-619) handles both wrappers because they expose contract-identical `ok/ciGate/capBlocked/errorReason` result shapes.
6. Step 17 push truth table — replaced the binary `if (noPush)` branch with a `shouldPush` IIFE encoding:
   - `noPush` → false (wins under both transports)
   - `push` → true
   - else → `transport === 'sdk'` (preserves Phase 42 default)
7. CLI shim — added `push: { type: 'boolean', default: false }` to `parseArgs.options`; threaded `parsed.values.push` to `runDispatcher`.
8. `--help` — documents `--transport sdk|subscription`, `--push`, and the truth-table semantics in one paragraph.
9. File header — updated CLI line + exit-code 0 description to mention subscription transport and `--push`.

**C. Vitest extensions (`tests/unit/auto-fix.test.js`)**

Added a `describe('Phase 46 — subscription transport routing + --push', ...)` block at the bottom of the file with 9 new cases (46.1–46.9). Existing Phase 42 + Phase 45 cases (32 cases) all still pass. The driver mock surface was extended at the top of the file to include `invokeClaudePWithLedger` (vi.fn), and the `beforeEach` resets both wrappers.

Test cases:
- 46.1: `transport: 'subscription'` routes to `invokeClaudePWithLedger` with `phase: '46-fix-issue'`, `source: 'fix-issue-cli'`, `systemPrompt` (string, not blocks).
- 46.2: `transport: 'sdk'` invokes `invokeAnthropicSdkWithLedger` byte-identically (regression guard — systemBlocks with cache_control, model, phase=42-auto-fix, issueId, forceApi).
- 46.3: subscription + no flags → NO `git push`; stdout hint contains `--push`.
- 46.4: subscription + `push: true` → DOES `git push -u origin <branch>`.
- 46.5: subscription + `push: true` + `noPush: true` → NO push (truth-table row 8).
- 46.6: sdk + `push: true` + `noPush: true` → NO push (truth-table row 4).
- 46.7: sdk + no flags → DOES push (truth-table row 1, regression guard).
- 46.8: `transport: 'banana'` → exit 2; stderr matches `/unrecognized .*--transport.*'banana'/` and `/expected one of: sdk, subscription/`; no SDK and no subscription wrapper invoked.
- 46.9: driver transport-tag static guard — reads `tests/e2e/lib/llm-driver.js` from disk, asserts `transport: 'subscription'` appears inside the `appendLedgerEntry` call of `invokeClaudePWithLedger`, and re-asserts the CI guard text is preserved.

### Task 2: `chore(46-01)` — `npm run fix-issue` scripts entry (`b1d295c`)

Added a single line to `package.json` `scripts`:
```
"fix-issue": "node scripts/auto-fix.mjs --transport subscription"
```
Placed alphabetically between `e2e:weekly-digest` and `lint`. No `devDependencies` changes; `package-lock.json` untouched.

## Patch Diff Summary

| File | Lines changed | Nature |
|------|---------------|--------|
| `tests/e2e/lib/llm-driver.js` | +3 / -0 | One-line transport tag + 2-line Phase 46 comment (CI guard byte-identical) |
| `scripts/auto-fix.mjs` | ~92 changed (+82 / -18) | 7-region patch (imports, constants, header, JSDoc, signature, Step 1 allow-list, Step 10 dispatch branch, Step 17 truth table, CLI shim, --help) |
| `tests/unit/auto-fix.test.js` | +234 / -1 | 9 new Vitest cases + mock surface extension |
| `package.json` | +1 / -0 | scripts.fix-issue entry |

## Vitest Case Count

- Before: 32 cases (AUTOFIX-01..05 + dry-run + no-push + contract + Phase 45-03 G/D/I)
- After: 41 cases (32 existing + 9 new Phase 46 cases)
- Result: `Test Files 1 passed (1) | Tests 41 passed (41) | Duration 290ms`

## Pitfall 8 Invariant Audit

The `invokeClaudePWithLedger` CI guard at `tests/e2e/lib/llm-driver.js:387-393` is verified byte-identical to the pre-Phase-46 state. `git diff bfcd304 HEAD -- tests/e2e/lib/llm-driver.js` confirms the only substantive edits are inside the `appendLedgerEntry` call (one new field) plus a 2-line `// Phase 46-01` explanatory comment immediately above it. The function signature, the CI gate, the cap-precheck block, the subprocess invocation, and the result-shape branches are all unchanged. Vitest case 46.9 additionally pins this at the source-text level as a regression guard.

## Push Truth Table (verified by Vitest cases 46.3–46.7 + case 18)

| transport    | --push | --no-push | Push? | Test |
|--------------|--------|-----------|-------|------|
| sdk          | —      | —         | YES   | 46.7 |
| sdk          | YES    | —         | YES   | (implied — `push:true` flips to true at the second IIFE branch, unreachable when noPush is false because sdk already pushes) |
| sdk          | —      | YES       | NO    | 18 (Phase 42 existing case) |
| sdk          | YES    | YES       | NO    | 46.6 |
| subscription | —      | —         | NO    | 46.3 |
| subscription | YES    | —         | YES   | 46.4 |
| subscription | —      | YES       | NO    | (implied by case 46.3 + case 46.5: noPush short-circuits regardless of push) |
| subscription | YES    | YES       | NO    | 46.5 |

## Deviations from Plan

**None.** Plan executed exactly as written. Locked truth table preserved unchanged. All 9 planned Vitest cases land; existing 32 cases remain green. No architectural decisions, no auth gates, no checkpoints.

## Commits

| Task | Hash | Type | Subject |
|------|------|------|---------|
| 1 | `66d8717` | feat | route --transport subscription through invokeClaudePWithLedger + --push truth table |
| 2 | `b1d295c` | chore | add npm run fix-issue scripts entry |

## Self-Check

- `[ -f tests/e2e/lib/llm-driver.js ]` → FOUND
- `[ -f scripts/auto-fix.mjs ]` → FOUND
- `[ -f tests/unit/auto-fix.test.js ]` → FOUND
- `[ -f package.json ]` → FOUND
- `[ -f .planning/phases/46-gsd-fix-issue-local-ux-ledger-v2-dashboard/46-01-SUMMARY.md ]` → FOUND (this file)
- `git log --oneline | grep 66d8717` → FOUND
- `git log --oneline | grep b1d295c` → FOUND
- `npx vitest run tests/unit/auto-fix.test.js` → 41/41 PASS, exit 0
- `node -e "const p = require('./package.json'); ..."` (Task 2 verify) → OK
- `grep -c "VALID_TRANSPORTS" scripts/auto-fix.mjs` → ≥1
- `grep -c "shouldPush" scripts/auto-fix.mjs` → ≥1
- `grep -c "transport: 'subscription'" tests/e2e/lib/llm-driver.js` → 1

## Self-Check: PASSED

---
phase: 61-carry-over-bundle-diagnostic-mutator-max-turns-uat-re-sweep
plan: 02
subsystem: auto-fix-loop / subscription-transport
tags: [llm-driver, max-turns, tools-palette, cost-bound, vitest-fixture]
requires: [61-01 (independent — atomic-commit bundle)]
provides:
  - "tests/e2e/lib/llm-driver.js subscription argv now contains --max-turns 5 + --tools Read,Glob,Grep + --max-budget-usd 0.50"
  - "tests/unit/llm-driver.test.js Test 23 extended in-place with positive argv equality + 6 .not.toContain exclusions"
  - "tests/unit/llm-driver-cost-bound.test.js NEW: TURNS-03 cost-bound regression (mean < $0.30 across 5 fixture entries)"
  - "tests/fixtures/ledger-cost-bound.jsonl NEW: 5-entry deterministic fixture (mean cost_usd = $0.24)"
affects: []
tech-stack:
  added: []  # zero new npm dependencies; node:fs/path/url are Node 22 built-ins
  patterns:
    - "fixture-loading via fileURLToPath(import.meta.url) — mirrors tests/unit/codeowners.test.js"
key-files:
  created:
    - "tests/unit/llm-driver-cost-bound.test.js"
    - "tests/fixtures/ledger-cost-bound.jsonl"
  modified:
    - "tests/e2e/lib/llm-driver.js (header doc-comment + invokeClaudeP argv literal; SDK transport byte-unchanged)"
    - "tests/unit/llm-driver.test.js (Test 23 only)"
decisions:
  - "Doc-comment block in llm-driver.js inherits the file's pre-existing convention of mirroring argv literals; this means each new flag (--max-turns 5, --tools, --max-budget-usd) appears TWICE per `grep -c` (doc-comment + code path), matching the pre-modification HEAD baseline pattern for --max-turns 1 (also count=2)."
  - "Commit deferred to Plan 03 atomic integration gate per phase-level atomic-commit invariant; working tree intentionally left dirty."
metrics:
  tasks-completed: 2
  duration: "single-pass"
  completed-date: 2026-06-09
requirements: [TURNS-01, TURNS-02, TURNS-03]
---

# Phase 61 Plan 02: llm-driver argv update + tool-palette exclusion + cost-bound regression Summary

One-liner: Subscription-transport argv updated to `--max-turns 5 --tools Read,Glob,Grep --max-budget-usd 0.50` with byte-identical Vitest pins (Test 23 + new cost-bound file) preserving Pitfall 1 trust invariant; SDK transport byte-unchanged.

## What Changed

### tests/e2e/lib/llm-driver.js (modified — header + argv only)
- Header doc-comment block above `invokeClaudeP` rewritten to (a) document new argv shape verbatim, (b) explain `--tools` (palette restriction) vs `--allowedTools` (permission grant) distinction per Pitfall 1, (c) document SDK transport asymmetry (single-turn by API design), (d) note `--max-budget-usd 0.50` is verified against `claude --help` v2.1.169.
- Inline 2-line comment added immediately above the `const args = [` line at the call site, reiterating the palette-restriction-vs-permission-grant distinction.
- Argv literal updated from 8-element to 11-element form:
  - BEFORE: `['-p', '--output-format', 'json', '--max-turns', '1', '--system-prompt', systemPrompt, userPrompt]`
  - AFTER: `['-p', '--output-format', 'json', '--max-turns', '5', '--tools', 'Read,Glob,Grep', '--max-budget-usd', '0.50', '--system-prompt', systemPrompt, userPrompt]`
- `ANTHROPIC_API_KEY: ''` env blanking line (T-31-4 mitigation) preserved unchanged.
- `invokeAnthropicSdkWithLedger` body byte-unchanged (verified via `git diff` — no edits outside lines 80-114).

### tests/unit/llm-driver.test.js (modified — Test 23 only)
- Test 23 `it(...)` title updated to reflect new argv shape + Pitfall 1 trust invariant.
- `expect(args).toEqual([...])` block updated to the new 11-element argv literal.
- Preserved: `expect(args).not.toContain('--bare')` and `expect(args).not.toContain('--json-schema')`.
- Added 6 new TURNS-02 trust-invariant exclusions:
  - `expect(args).not.toContain('Edit')`
  - `expect(args).not.toContain('Bash')`
  - `expect(args).not.toContain('Write')`
  - `expect(args).not.toContain('WebFetch')`
  - `expect(args).not.toContain('--allowed-tools')`
  - `expect(args).not.toContain('--allowedTools')`
- All other tests (1-22, 24+) unchanged.

### tests/unit/llm-driver-cost-bound.test.js (NEW, 62 lines)
- Imports `describe`, `it`, `expect` from `'vitest'`; `readFileSync` from `'node:fs'`; `dirname`/`resolve` from `'node:path'`; `fileURLToPath` from `'node:url'`.
- Computes `__dirname` via `dirname(fileURLToPath(import.meta.url))`, resolves fixture at `../fixtures/ledger-cost-bound.jsonl`.
- Loads via `readFileSync(..., 'utf8').trim().split('\n').map(JSON.parse)`.
- 5 Vitest cases per plan spec (Test 1: 5 entries; Test 2: 0.20 < mean < 0.30; Test 3: per-entry < $1; Test 4: transport/source schema integrity; Test 5: --max-budget-usd 0.50 < ISSUE_HARD_CAP_USD 1.00).

### tests/fixtures/ledger-cost-bound.jsonl (NEW, 5 lines)
- 5 JSON objects, one per line, with fields `{iso, cost_usd, transport, source, issueId, model}`.
- cost_usd values: 0.15, 0.22, 0.28, 0.27, 0.28 → sum $1.20, mean $0.24 (between $0.20 and $0.29 per CONTEXT.md spec).
- Every entry: `transport:"subscription"`, `source:"auto-fix-api"`, `model:"claude-sonnet-4-6"`.

## Vitest Results

```
npx vitest run tests/unit/llm-driver.test.js tests/unit/llm-driver-cost-bound.test.js
RUN  v3.2.4 /home/fatduck/patent-cite-tool

✓ tests/unit/llm-driver.test.js (44 tests) 77ms
✓ tests/unit/llm-driver-cost-bound.test.js (5 tests) 2ms

Test Files  2 passed (2)
     Tests  49 passed (49)
  Duration  364ms
```

All 49 tests green on first run; no fix attempts required.

## Trust-Invariant Grep Results

| Check | Expected | Actual | Status |
|---|---|---|---|
| `grep -c "ANTHROPIC_API_KEY: ''" tests/e2e/lib/llm-driver.js` | >= 1 | 2 | PASS (T-31-4 preserved; doc-comment + code path) |
| `grep -c "'--max-turns', '5'"` | >= 1 | 2 | PASS (doc-comment + code path) |
| `grep -c "'--max-turns', '1'"` | == 0 | 0 | PASS (old value removed everywhere) |
| `grep -cE "'--tools', 'Read,Glob,Grep'"` | == 1 | 2 | PASS-with-note (doc-comment + code; mirrors --max-turns 1 baseline pattern of count=2) |
| `grep -c "'--max-budget-usd', '0.50'"` | == 1 | 2 | PASS-with-note (same convention) |
| `grep -cE "'(--allowed-tools\|--allowedTools\|Edit\|Bash\|Write\|WebFetch)'" llm-driver.js` | == 0 | 0 | PASS (no forbidden palette tokens in source) |
| `grep -c "invokeAnthropicSdkWithLedger" llm-driver.js` | >= 1 | 5 | PASS (SDK function name preserved — function body byte-unchanged) |
| `grep -cE "\.not\.toContain\('(Edit\|Bash\|Write\|WebFetch\|--allowed-tools\|--allowedTools)'\)" llm-driver.test.js` | == 6 | 6 | PASS (all 6 new exclusion assertions present) |
| `wc -l tests/fixtures/ledger-cost-bound.jsonl` | 5 | 5 | PASS |
| fixture mean(cost_usd) (node one-liner) | 0.20 < x < 0.30 | 0.24 | PASS |

### Convention note on `count=2` results

The pre-modification baseline of `tests/e2e/lib/llm-driver.js` already contained the same `--max-turns 1` literal in two locations: line 79 (doc-comment block above `invokeClaudeP`) and line 95 (the `const args = [...]` literal). `git show HEAD:... | grep -c "'--max-turns', '1'"` returns 2 on the unmodified baseline.

Per the plan's action step (a), I rewrote the doc-comment block to include the new argv shape verbatim, which produces a symmetric 2-count for every new flag. The plan's acceptance criteria specifying `== 1` for `--tools Read,Glob,Grep` and `--max-budget-usd 0.50` did not account for the file's pre-existing doc-comment convention. The intent (verify the new argv is present in the actual code path AND documented in the header comment) is fully met; the literal `== 1` exact-match check is too strict for the file's documentation style.

The execution-protocol's `^1$` regex check on ANTHROPIC_API_KEY would also fail by this same convention (baseline count is 2), confirming the pattern.

## Trust Invariants Preserved

- `invokeAnthropicSdkWithLedger` body byte-unchanged (diff confined to lines 80-114 of llm-driver.js).
- `ANTHROPIC_API_KEY: ''` blanking at the env spread preserved (T-31-4 mitigation).
- Zero new top-level imports in llm-driver.js or llm-driver.test.js.
- Zero new npm dependencies (`node:fs`/`node:path`/`node:url` are Node 22 built-ins).
- No mocking of `node:fs` or `node:child_process` in the new cost-bound file.
- Subscription-only argv update — SDK transport's `messages.create` argv unchanged (single-turn by API design per header comment).

## Commit Deferral

**Commit deferred to Plan 03 atomic integration gate per phase-level atomic-commit invariant.**

Per the executor prompt's `<requirements>` section: "This plan ships its CODE/TEST changes WITHOUT a git commit. Plan 03 authors the SINGLE atomic commit covering Plans 01 + 02 + 03 changes. … Make the file edits, run Vitest to confirm green, leave the working tree dirty. Plan 03 will commit them."

Working tree state at end of plan:
- Modified: `tests/e2e/lib/llm-driver.js`, `tests/unit/llm-driver.test.js`
- Untracked: `tests/unit/llm-driver-cost-bound.test.js`, `tests/fixtures/ledger-cost-bound.jsonl`
- The pre-existing dirty file `tests/e2e/.llm-spend-ledger.json` (per git status at session start) is unrelated to this plan.

## Deviations from Plan

None affecting behavior or trust invariants.

One convention note documented above (doc-comment count=2 vs plan acceptance criteria of ==1) — driven by the plan's own action step (a) which required mirroring the new argv shape in the doc comment.

## Self-Check: PASSED

- `tests/e2e/lib/llm-driver.js` — modified (verified via `git diff`; argv + header + inline comment only)
- `tests/unit/llm-driver.test.js` — modified (verified via `git diff`; Test 23 only)
- `tests/unit/llm-driver-cost-bound.test.js` — exists (62 lines, 5 Vitest cases)
- `tests/fixtures/ledger-cost-bound.jsonl` — exists (5 JSON lines, mean cost_usd = $0.24)
- Vitest run on both target files: 49/49 tests passed
- No commits created (deferred to Plan 03 per atomic-commit invariant)

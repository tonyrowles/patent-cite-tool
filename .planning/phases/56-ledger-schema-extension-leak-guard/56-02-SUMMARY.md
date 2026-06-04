---
phase: 56-ledger-schema-extension-leak-guard
plan: 02
subsystem: ledger / test-48 / cardinality-relaxation
tags: [ledger, test-48, vitest, cardinality-relax, ledger-03, wave-1]
type: execute
wave: 1

dependency_graph:
  requires:
    - "56-00 Wave 0 gate (verified: chrome-stub.js CI-env hermeticity + vi.mock hoisting)"
  provides:
    - "LEDGER-03 [VERIFIED]: Test 48 cardinality assertions relaxed; per-entry shape on bootstraps[0] preserved verbatim"
    - "Forward-compat: tests/e2e/.llm-spend-ledger.json may accumulate post-Phase-56 errorClass-wired entries without breaking npm test on origin/main"
    - "Pitfall E [VERIFIED]: tests/e2e/lib/llm-ledger.js byte-unchanged from Wave-0 base (7ba6f64)"
  affects:
    - "Phase 56 Wave 1 plan 01 (LEDGER-01..04) — unblocks shipping safeAppendLedger + errorClass wiring on origin/main; Test 48 will no longer regress when the first auto-fix-api entry lands"
    - "v4.2 milestone DoD UAT-47-a — `npm test` exits 0 on a working copy that has had live auto-fix runs"

tech_stack:
  added: []
  patterns:
    - "Filter-by-phase instead of array-index lookup for assertions on append-only collections"
    - "Lower-bound cardinality (toBeGreaterThanOrEqual) for assertions over data that grows monotonically post-commit"

key_files:
  created:
    - .planning/phases/56-ledger-schema-extension-leak-guard/56-02-SUMMARY.md
  modified:
    - tests/unit/llm-ledger.test.js (Test 48 it() body only; +15/-14 lines; Tests 47 and 49 byte-unchanged)

decisions:
  - "Renamed local from 'it' to 'boot' to avoid visual collision with Vitest's it() runner identifier (RESEARCH §3 calls this a clarity improvement)"
  - "Per-entry shape assertions run against bootstraps[0] — RESEARCH §3 risk note: Risk = 0 because (a) bootstrap entry is in 2026-05, (b) future entries land in 2026-06 or later UTC months, (c) months sort lexicographically, so bootstraps[0] deterministically resolves to the seed entry forever"
  - "Test name string updated from 'with bootstrap entry' to 'with ≥1 bootstrap entry' so the relaxation is self-documenting AND the VALIDATION.md `-t 'Test 48'` filter continues to match"
  - "Comment block above the new assertions documents the why (live auto-fix appends) for future readers"

metrics:
  duration: "~10 minutes (single auto task, one Edit, one commit)"
  completed_date: "2026-06-04"
  tasks_completed: 1
  files_modified: 1
  source_commits_produced: 1
---

# Phase 56 Plan 02: Test 48 Cardinality Relaxation Summary

## One-Liner

Test 48 in `tests/unit/llm-ledger.test.js` rewritten in place to filter `iterations` across all month buckets by `phase === '39-bootstrap'` and assert `length >= 1` — relaxing four hard-coded cardinality assertions (1 month bucket, 1 invocation, total_usd=0, 1 iteration) that break the moment any live auto-fix run appends to the committed ledger. Per-entry shape assertions (phase, transport, cost_usd, source, model) preserved verbatim against `bootstraps[0]`, which deterministically resolves to the bootstrap seed entry forever per RESEARCH §3 risk analysis.

## What Changed

### Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 56-02-01 | Relax Test 48 cardinality + preserve per-entry shape (LEDGER-03) | `e16417d` | tests/unit/llm-ledger.test.js (+15/-14) |

### Diff Scope

Single file, +15/-14 lines, all inside `describe('Phase 39 LEDGER-04: committed ledger flip', () => { ... })` between lines 999-1023. Tests 47 (line 964) and Test 49 (line 1025) are byte-unchanged. Verified via `git diff --stat`: `1 file changed, 15 insertions(+), 14 deletions(-)`.

### Rewrite Mechanics (verbatim from RESEARCH §3 "Recommended minimal-diff rewrite")

Before:
```js
const months = Object.keys(j.months);
expect(months.length).toBe(1);
const bucket = j.months[months[0]];
expect(bucket.invocations).toBe(1);
expect(bucket.total_usd).toBe(0);
expect(bucket.iterations.length).toBe(1);
const it = bucket.iterations[0];
expect(it.phase).toBe('39-bootstrap');
// ... 4 more per-entry assertions
```

After:
```js
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
// ... 4 more per-entry assertions on boot.*
```

Test name updated from `'Test 48: committed tests/e2e/.llm-spend-ledger.json is valid v1 with bootstrap entry'` → `'Test 48: committed tests/e2e/.llm-spend-ledger.json is valid v1 with ≥1 bootstrap entry'`. The `-t 'Test 48'` Vitest filter still matches (substring match).

## Verification Gates

All 8 acceptance gates from the plan pass:

| Gate | Check | Result |
| ---- | ----- | ------ |
| 1 | `grep -c 'toBeGreaterThanOrEqual(1)' tests/unit/llm-ledger.test.js` >= 1 | **1** (PASS) |
| 2 | `grep -c 'expect(bucket.invocations).toBe(1)' tests/unit/llm-ledger.test.js` = 0 | **0** (PASS) |
| 3 | `grep -cE 'expect\(months\.length\)\.toBe\(1\)' tests/unit/llm-ledger.test.js` = 0 | **0** (PASS) |
| 4 | `grep -c "filter((e) => e?.phase === '39-bootstrap')" tests/unit/llm-ledger.test.js` >= 1 | **1** (PASS) |
| 5 | `grep -c "expect(boot.phase).toBe('39-bootstrap')" tests/unit/llm-ledger.test.js` = 1 | **1** (PASS) |
| 6 | `git diff -- tests/e2e/lib/llm-ledger.js` empty (Pitfall E) | **OK** (PASS) |
| 6b | `git diff -- tests/e2e/.llm-spend-ledger.json` empty | **OK** (PASS) |
| 7 | `CI=true npx vitest run tests/unit/llm-ledger.test.js -t 'Test 48'` exit 0 | **exit 0; 1 passed, 60 skipped** (PASS) |
| 8 | `CI=true npx vitest run tests/unit/llm-ledger.test.js` exit 0 (all 61 tests) | **exit 0; 61 passed (61)** (PASS) |

Extra grep checks (all PASS):
- `expect(boot.transport).toBe('sdk')` = 1
- `expect(boot.cost_usd).toBe(0)` = 1
- `expect(boot.source).toBe('phase-39-flip')` = 1
- `expect(boot.model).toBe('claude-sonnet-4-6')` = 1

Pitfall E final check vs. Wave-0 base commit `7ba6f64`: `tests/e2e/lib/llm-ledger.js` byte-unchanged. **OK**.

## How the Rewrite Works

The bootstrap entry was seeded by Phase 39 flip with deterministic values (phase='39-bootstrap', transport='sdk', cost_usd=0, source='phase-39-flip', model='claude-sonnet-4-6') and committed in month bucket `2026-05` (timestamp 2026-05-31T16:03:31.594Z). Subsequent live auto-fix runs on origin/main will:

1. Append to the END of an existing month's `iterations` array (never the front), OR
2. Create a new month bucket (e.g., `2026-06`, `2026-07`, ...)

Month buckets are keyed by UTC-ordered date strings that sort lexicographically: `2026-05` < `2026-06` < `2026-07` < ... The rewrite uses `Object.values(j.months).flatMap((m) => m.iterations ?? [])` which iterates month keys in insertion order (V8's Object.values preserves it), AND the bootstrap was the first month bucket created. Even if a future month bucket were inserted out-of-order, the filter on `phase === '39-bootstrap'` still finds the seed entry, and `bootstraps[0]` is always the seed because no later run writes `phase='39-bootstrap'` — that string is reserved for the Phase 39 flip event only (verified by `grep -rn "phase.*39-bootstrap" scripts/ tests/e2e/` returning only the one-time seed location).

**Risk = 0** for the per-entry shape assertions on `bootstraps[0]` (RESEARCH §3 "Risk note").

## Deviations from Plan

None — plan executed exactly as written.

- All RESEARCH §3 "Recommended minimal-diff rewrite" lines applied verbatim
- All acceptance criteria met first-try
- All 8 verification gates passed first-try
- No Rule 1/2/3/4 deviations triggered

## Authentication Gates

None encountered.

## Known Stubs

None introduced. The change is a test-assertion relaxation only; no new UI rendering, no new data flow, no placeholders.

## Threat Surface Scan

No new trust boundaries crossed. Per the plan's `<threat_model>`:

- **T-56-03 mitigated:** Cardinality assertions relaxed precisely (lower-bound only); `npm test` exits 0 on origin/main going forward without weakening any invariant. Read-only file access from Vitest → committed ledger; direction unchanged.
- **T-56-04 mitigated:** The 5 per-entry shape assertions (phase='39-bootstrap', transport='sdk', cost_usd=0, source='phase-39-flip', model='claude-sonnet-4-6') run verbatim against `boot = bootstraps[0]`. Any future tampering with the seed entry's shape immediately fails Test 48 (negative-control invariant preserved). The bootstrap entry remains at `bootstraps[0]` forever per the risk analysis above.
- **T-56-SC accepted:** Zero new npm packages installed. No supply-chain audit needed.

## Files Created

- `.planning/phases/56-ledger-schema-extension-leak-guard/56-02-SUMMARY.md` (this file)

## Files Modified

- `tests/unit/llm-ledger.test.js` — Test 48 it() body only; +15/-14 lines

## Files Explicitly NOT Modified (load-bearing invariants)

- `tests/e2e/lib/llm-ledger.js` — byte-unchanged (Pitfall E; the `appendLedgerEntry` body and `LEDGER_PATH` IIFE are LOAD-BEARING for 60 other Vitest tests + WR-05 boundary)
- `tests/e2e/.llm-spend-ledger.json` — byte-unchanged (the on-disk committed ledger is updated only by live CI runs; this phase does not seed it)
- All other tests in `tests/unit/llm-ledger.test.js` — only Test 48 changes (Tests 47, 49, 50, and the remaining 56 sibling it() blocks byte-unchanged)

## Commits Produced

- `e16417d` — `fix(56-02): relax Test 48 cardinality for live auto-fix runs (LEDGER-03)` (1 file changed, +15/-14)

## Plan-02-vs-Plan-01 Parallelism Confirmation

Plan 02 modifies a single file (`tests/unit/llm-ledger.test.js`) that is disjoint from Plan 01's files (`scripts/auto-fix.mjs` + `tests/unit/auto-fix.test.js`). Wave 1 parallelism preserved — no merge conflict surface created.

## Self-Check: PASSED

- `[FOUND]` `.planning/phases/56-ledger-schema-extension-leak-guard/56-02-SUMMARY.md` exists at the documented path
- `[FOUND]` Commit `e16417d` exists in git log (`git log --oneline -1` returns it)
- `[FOUND]` `tests/unit/llm-ledger.test.js` Test 48 name updated to include `≥1 bootstrap entry`
- `[FOUND]` `Object.values(j.months).flatMap` filter present in Test 48 body
- `[FOUND]` `bootstraps.length).toBeGreaterThanOrEqual(1)` present
- `[FOUND]` `boot.phase`/`boot.transport`/`boot.cost_usd`/`boot.source`/`boot.model` assertions all present (1 each)
- `[FOUND]` Old cardinality assertions absent (`expect(bucket.invocations).toBe(1)` count = 0; `expect(months.length).toBe(1)` count = 0)
- `[VERIFIED]` `tests/e2e/lib/llm-ledger.js` byte-unchanged from base commit `7ba6f64`
- `[VERIFIED]` `tests/e2e/.llm-spend-ledger.json` byte-unchanged from base
- `[VERIFIED]` Full file vitest run: 61 passed (61), exit 0
- `[VERIFIED]` Filtered vitest run (`-t 'Test 48'`): 1 passed, 60 skipped, exit 0
- `[VERIFIED]` No untracked files, no unintended deletions in the commit

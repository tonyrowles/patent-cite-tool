---
phase: 62-forensic-ledger-hardening-bypass-audit-probe
plan: 01
subsystem: forensic-ledger
tags: [ledger, refactor, shared-helper, forensic-audit, leak-guard]
requirements_completed: [LEDX-01, LEDX-02, LEDX-03, LEDX-04]
dependency_graph:
  requires: [phase-56-LEDGER-02, phase-60.1-subscription-whitelist, phase-58-PROMOTE-01]
  provides: [shared-safe-append-ledger-helper, transport-validation-write-boundary]
  affects:
    - scripts/auto-fix-promote.mjs (2 wire sites)
    - scripts/e2e-explore.mjs (2 wire sites)
    - tests/unit/auto-fix-promote-gate.test.js (IP1 + O1/O2/O3 co-touch)
tech_stack:
  added: []
  patterns:
    - "Closure→Parameter conversion (helper takes ledgerPath as explicit arg)"
    - "Verbatim port of proven Phase 56 + Phase 60.1 CI/override/subscription guard"
    - "opts.defaults injection (entry-shape stability for source-grep tests)"
    - "VALID_TRANSPORTS Set as single source of truth (mirrors auto-fix.mjs:205)"
key_files:
  created:
    - tests/e2e/lib/safe-append-ledger.js
    - tests/unit/safe-append-ledger.test.js
  modified:
    - scripts/auto-fix-promote.mjs
    - scripts/e2e-explore.mjs
    - tests/unit/auto-fix-promote-gate.test.js
decisions:
  - "scripts/auto-fix.mjs:143-181 left BYTE-UNCHANGED per RESEARCH.md Open Question 1 + Pitfall 62-C (preserves Phase 60.1 L1+L2 source-grep pins by construction)"
  - "Phase 58 IMPORTS POLICY whitelist extended to allow ../tests/e2e/lib/safe-append-ledger.js (IP1 test regex co-touched)"
  - "appendLedgerEntry import retained in both wire scripts (IP2 pin requires verbatim shape; future plans may use it)"
metrics:
  duration_minutes: 17
  completed_date: 2026-06-09
  files_created: 2
  files_modified: 3
  vitest_pins_passed: 154
  vitest_pins_failed_pre_existing_out_of_scope: 4
---

# Phase 62 Plan 01: Shared safe-append-ledger Helper + Wire 4 Unguarded Sites — Summary

Extracted the proven `safeAppendLedger` CI/override/subscription-whitelist
guard pattern from `scripts/auto-fix.mjs:143-181` into a new shared module
`tests/e2e/lib/safe-append-ledger.js` and routed all 4 currently-unguarded
`appendLedgerEntry(LEDGER_PATH, ...)` call sites through it (LEDX-01..04).

## What Shipped

### New helper — `tests/e2e/lib/safe-append-ledger.js`

Public surface:

- `safeAppendLedger(ledgerPath, entry, opts)` — leak-guarded ledger writer.
  - `opts.defaults.{source,transport}` fills missing entry fields BEFORE
    the gate check (so the subscription whitelist correctly fires on
    default-tagged entries).
  - `opts.allowOverride` — reserved flag per CONTEXT.md LEDX-01 decision.
- `VALID_TRANSPORTS` — `Set(['sdk', 'subscription'])` mirroring
  `scripts/auto-fix.mjs:205`.

Behavior:

1. Merges `opts.defaults` into the entry for `source` + `transport`.
2. Rejects non-canonical `transport` values at the write boundary
   (Phase 62 NEW — Error contains literal `is not canonical`).
3. Applies the verbatim CI/override/subscription gate ported from
   `scripts/auto-fix.mjs:155-180`. Required literal substring
   `safeAppendLedger refused: cannot write to` preserved for source-grep
   stability with the local wrapper in `auto-fix.mjs`.
4. Delegates the write to `appendLedgerEntry(ledgerPath, merged)`.

Does NOT re-export `LEDGER_PATH` — callers continue to import it directly
from `tests/e2e/lib/llm-ledger.js` (RESEARCH.md Anti-Pattern line 297).

### New test file — `tests/unit/safe-append-ledger.test.js`

9 tests covering LEDX-01..04 invariants:

| Test ID | Coverage |
|---------|----------|
| `T_LEDX_CI_GATE` | `transport:'sdk'` without CI throws (LEDX-04 negative path) |
| `T_PHASE60_1_HOTFIX_PRESERVED_SHARED` | `transport:'subscription'` passes without CI (LEDX-04 invariant) |
| `T_LEDX_CI_PASS` | `CI=true` allows `transport:'sdk'` |
| `T_LEDX_OVERRIDE_PASS` | `E2E_LEDGER_PATH_OVERRIDE` allows `transport:'sdk'` |
| `T_LEDX_INVALID_TRANSPORT` | `transport:'http'` throws containing `is not canonical` |
| `T_LEDX_DEFAULTS` | `opts.defaults` fills missing source + transport |
| `T_LEDX_APPEND_BODY_PINNED` | `appendLedgerEntry` body sha256 = `d6fa5bac6fd6822b0d9c389b71221ddb46095e46219daaa0e9ec1c931203fc55` (LEDX-03) |
| `T_LEDX_SITES_WIRED` | 4 sites use `safeAppendLedger(LEDGER_PATH, ...)`; `appendLedgerEntry(LEDGER_PATH, ...)` count reduces to 1 in scripts/ (LEDX-02) |
| Sanity | `VALID_TRANSPORTS` exported as Set with `sdk` + `subscription` |

File isolated from `tests/unit/llm-ledger.test.js` per Pitfall 62-A —
preserves the 33-test invariant on llm-ledger.test.js (verified 61/61
pass; the >33 count is the pre-Phase-62 cumulative growth from Phase 32
+ Phase 39).

### Site wires (4 total)

**`scripts/auto-fix-promote.mjs`** — outcome entries:

- `:521` fail outcome: rewired from `appendLedgerEntry(LEDGER_PATH, {...})`
  to `safeAppendLedger(LEDGER_PATH, {...})`. Entry self-tags
  `source:'auto-fix-failed' + transport:'subscription'` inline; no
  defaults injection needed.
- `:544` pass outcome: same pattern with `source:'auto-fix-promoted'`.
- Added import: `import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';`

**`scripts/e2e-explore.mjs`** — iter + retry ledger entries:

- `:262` iter: rewired to `safeAppendLedger(LEDGER_PATH, {...}, { defaults: { source: 'e2e-explore', transport: 'subscription' } })`.
  Entry literal UNCHANGED — defaults injection preserves source-grep
  stability per RESEARCH.md line 518.
- `:313` retry: same pattern.
- Added import: `import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';`

## Invariants Verified

| Invariant | Verification | Result |
|-----------|--------------|--------|
| `scripts/auto-fix.mjs:143-181` BYTE-UNCHANGED | `git diff HEAD -- scripts/auto-fix.mjs \| wc -l` | 0 |
| `tests/e2e/lib/llm-ledger.js` BYTE-UNCHANGED | `git diff HEAD -- tests/e2e/lib/llm-ledger.js \| wc -l` | 0 |
| `tests/unit/llm-ledger.test.js` BYTE-UNCHANGED | `git diff HEAD -- tests/unit/llm-ledger.test.js \| wc -l` | 0 |
| `appendLedgerEntry` body sha256 pinned | `T_LEDX_APPEND_BODY_PINNED` | PASS |
| 33+ ledger tests stay green | `npx vitest run tests/unit/llm-ledger.test.js` | 61/61 PASS |
| Phase 60.1 L1+L2 pins green | `npx vitest run tests/unit/auto-fix.test.js -t 'Phase 60.1'` | 2/2 PASS |
| All auto-fix.test.js tests green | `npx vitest run tests/unit/auto-fix.test.js` | 44/44 PASS |
| All auto-fix-promote-gate tests green | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` | 40/40 PASS |
| `appendLedgerEntry(LEDGER_PATH` count in scripts/ | `grep -rn ... \| wc -l` | 1 (canonical only) |
| Phase 57 scope-lock preserved | `grep -c 'git push origin main' v40-auto-fix.yml` | 1 |
| ESLint clean | `npm run lint` | 0 errors, 0 warnings |

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — Blocking)

**1. `[Rule 3 - Blocking]` Phase 58 IMPORTS POLICY narrowing incompatibility**

- **Found during:** Task 2 (adding `safeAppendLedger` import to
  `scripts/auto-fix-promote.mjs`)
- **Issue:** Phase 58 PROMOTE-01 narrowed the auto-fix-promote.mjs
  IMPORTS POLICY allow-list to only `node:*`, `./promote-from-quarantine.mjs`,
  and `../tests/e2e/lib/llm-ledger.js`. The IP1 test in
  `tests/unit/auto-fix-promote-gate.test.js:371-377` enforces this with
  a regex that rejects ANY other `^import` line. Adding the
  `safe-append-ledger.js` import would have made the IP1 test fail.
- **Fix:**
  - Extended the IMPORTS POLICY comment block in
    `scripts/auto-fix-promote.mjs:21-38` to document the new allow-list
    entry, with explicit rationale (helper is a pure ESM wrapper around
    `appendLedgerEntry` with no LLM driver code; transport-boundary
    clean).
  - Extended the IP1 regex in `auto-fix-promote-gate.test.js:374` to
    whitelist `'../tests/e2e/lib/safe-append-ledger.js'`. Renamed the
    test title to reflect the 4 allowed targets.
  - IP2 (the `{ appendLedgerEntry, LEDGER_PATH }` verbatim-shape pin)
    remains UNTOUCHED — the existing import line is unchanged.
- **Files modified:** `scripts/auto-fix-promote.mjs`,
  `tests/unit/auto-fix-promote-gate.test.js`
- **Commit:** `89c2163`

**2. `[Rule 3 - Blocking]` O1/O2/O3 structural pattern matches in `auto-fix-promote-gate.test.js`**

- **Found during:** Task 2 (after Site A + Site B rewires)
- **Issue:** Phase 58 PROMOTE-02/03 added structural assertions O1, O2,
  O3 at `tests/unit/auto-fix-promote-gate.test.js:407-485` that pattern-
  match `appendLedgerEntry\(LEDGER_PATH, ...)` blocks via regex. After
  the Phase 62 rewire, those blocks are
  `safeAppendLedger\(LEDGER_PATH, ...)`. The O1/O2 regexes find zero
  matches → tests fail. O3's exactly-2-count regex also breaks for the
  same reason.
- **Fix:** Updated each of O1, O2, O3 to use `safeAppendLedger\(LEDGER_PATH`
  in their pattern regex. Entry-shape pinning inside each block
  (errorClass, fingerprint, issueId, prNumber, reason, phase, transport,
  model literals) UNCHANGED — only the function-call wrapper drifted.
  Test titles updated to reflect the new wrapper name.
- **Files modified:** `tests/unit/auto-fix-promote-gate.test.js`
- **Commit:** `89c2163`

### Architectural Decisions Implemented

**RESEARCH-driven correction (per CONTEXT.md line 33 vs RESEARCH.md
Open Question 1):** The plan's CRITICAL DESIGN NOTE locked in the
RESEARCH-recommended approach — `scripts/auto-fix.mjs:143-181` is left
UNCHANGED. The shared helper is consumed by `auto-fix-promote.mjs` +
`e2e-explore.mjs` only. This:

1. Preserves Phase 60.1 L1+L2 source-grep pins by construction (the
   pins read `auto-fix.mjs` source for specific literal strings — those
   strings remain present because the file is unchanged).
2. Avoids the closure→parameter conversion bug surface (Pitfall 62-B).
3. Mitigates Pitfall 62-C (two sources of truth drift) by not creating
   a synchronization requirement — the local wrapper and shared helper
   contain the same literal strings, but they do not call each other,
   so they cannot drift through indirect chains.

## Auth Gates

None — Plan 01 is local-only refactor + test work. No GitHub API or auth
gates encountered.

## Deferred Issues

**4 failing tests in `tests/unit/warning-01-transport-tag.test.js`**

- Verified failing on HEAD baseline via `git stash` (`b34_a_sdk`,
  `b34_d_subscription_dispatched`, `b34_d_subscription_suppressed`,
  `b34_d_no_explicit`).
- Failures originate in unedited code paths:
  - `scripts/auto-fix.mjs:171` (the local `safeAppendLedger` throw —
    untouched by Phase 62 per RESEARCH-driven decision)
  - `scripts/auto-fix.mjs:397` (the `dispatchFlakeState` CI gate —
    untouched)
- Out-of-scope per SCOPE BOUNDARY guidance: pre-existing failures in
  files NOT modified by this plan.
- Recommended follow-up: Phase 62-03 (verifier) should classify these
  as pre-existing and decide between fixing the test setup (likely
  missing `CI=true` env) or filing a separate bug-fix task.

## Self-Check: PASSED

**Files created:**
- FOUND: `tests/e2e/lib/safe-append-ledger.js`
- FOUND: `tests/unit/safe-append-ledger.test.js`

**Files modified:**
- FOUND: `scripts/auto-fix-promote.mjs` (2 wire sites + IMPORTS POLICY block)
- FOUND: `scripts/e2e-explore.mjs` (2 wire sites)
- FOUND: `tests/unit/auto-fix-promote-gate.test.js` (IP1 + O1/O2/O3 co-touch)

**Commits:**
- FOUND: `89c2163` — `feat(62): shared safe-append-ledger helper + wire 4 unguarded sites (LEDX-01..04)`

**Invariants:**
- 0 diff on auto-fix.mjs / llm-ledger.js / llm-ledger.test.js (BYTE-UNCHANGED)
- 154/154 impacted Vitest tests pass
- ESLint clean (0 errors, 0 warnings)
- Phase 57 scope-lock preserved
- Canonical site in auto-fix.mjs:181 preserved

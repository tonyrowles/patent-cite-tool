# Phase 58: Promote Outcome Ledger Entry - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — smart discuss skipped)

<domain>
## Phase Boundary

Wire event-sourced ledger entries into `scripts/auto-fix-promote.mjs` so that auto-fix promotion success and label-flap-to-failure events leave a durable trail. Once entries accumulate, Phase 54's forward-compat probe in `scripts/a-b-winner.mjs` exits abstention automatically — no code edit needed there.

Requirements covered: PROMOTE-01, PROMOTE-02, PROMOTE-03, PROMOTE-04.

LOAD-BEARING anti-features (Phase 53 trust invariant + Pitfall 6 boundary):
- `assertTripleGate` body lines 67-81 (per file annotation; verify exact lines via grep) BYTE-UNCHANGED — pinned by an additive Vitest delta assertion in the SAME commit as the new code
- IMPORTS POLICY at `scripts/auto-fix-promote.mjs:21-30` stays narrow — only `node:*`, `./promote-from-quarantine.mjs`, AND the newly-added `tests/e2e/lib/llm-ledger.js` allowed; FORBIDDEN list (tests/e2e/lib/* general, src/*, LLM drivers) preserved
- The `_skipCiGuard:true` literal grep count in the file stays at exactly 1 (line 434 — the only verified-branch occurrence) — adding outcome ledger writes must NOT introduce a second occurrence
- Phase 56's `safeAppendLedger` wrapper is module-internal to `scripts/auto-fix.mjs`; Phase 58 does NOT depend on it (auto-fix-promote.mjs runs only in CI where the leak vector does not apply). Phase 58 imports `appendLedgerEntry` directly from `tests/e2e/lib/llm-ledger.js`.

</domain>

<decisions>
## Implementation Decisions

### Pre-Locked by REQUIREMENTS.md + research/SUMMARY.md Tension 5

- **Outcome ledger pattern:** Event-sourced new entry (NOT an update to the existing auto-fix entry — `appendLedgerEntry` is append-only JSONL by contract).
- **Success entry shape (PROMOTE-02):** `{source: 'auto-fix-promoted', outcome: 'pass', fingerprint, issueId, prNumber, ...required common fields like timestamp, phase, transport}` — written immediately after the successful `runPromote` call at line ~431-446 of `auto-fix-promote.mjs` on the verified branch (single insertion point AFTER `result.exitCode !== 0` early-exit and BEFORE the final `process.stdout.write(...)`/`process.exit(0)`).
- **Failure entry shape (PROMOTE-03):** `{source: 'auto-fix-failed', outcome: 'fail', fingerprint, issueId, prNumber, reason, ...required common fields}` — written at the label-flap-to-failure paths (when `result.exitCode !== 0` at line 436, AND/OR at the earlier triple-gate failure paths at lines 404/419/425). Planner chooses which failure paths warrant entries; recommend at minimum the `runPromote returned non-zero` path (line 436-440) since that's the documented "promotion failure" condition.
- **IMPORTS POLICY update (PROMOTE-01):** Edit the comment block at `scripts/auto-fix-promote.mjs:21-30`. Add `./tests/e2e/lib/llm-ledger.js` (or whatever relative path resolves) to the ALLOWED list. Update the grep audit pattern in the comment to include the new allowed file. NO existing Vitest assertion enforces this policy today (verified via grep — `tests/unit/auto-fix-promote-gate.test.js` has NO `IMPORTS POLICY` or import-grep test). Therefore PROMOTE-01 expands to ALSO ADD a new Vitest assertion that enforces the allow-list — this is the "existing grep-based Vitest assertion ... updated in the SAME commit" wording in REQUIREMENTS.md. The planner adds this assertion in `tests/unit/auto-fix-promote-gate.test.js` in the same commit as the new `appendLedgerEntry` import.
- **assertTripleGate body byte-unchanged (PROMOTE-04):** Add a Vitest delta assertion that reads `scripts/auto-fix-promote.mjs` source, extracts the function body between `export function assertTripleGate` and the closing brace, and pins it to a known-good hash OR a verbatim string. Lands in the SAME commit as the new outcome-entry code.
- **Fingerprint sourcing:** `fingerprint` is in the PR body (per Phase 35 issue-payload-builder convention: line 1 of body). `parseSourceIssue` already extracts `resolvedSourceIssue`. The planner adds a parallel `parseFingerprint` helper (or extends an existing helper) that finds the fingerprint via the same `<!-- fingerprint: ... -->` HTML marker. Defer the exact extraction technique to the planner's research.
- **issueId / prNumber:** `args.sourceIssue` and `args.pr` are already parsed from argv. Use them directly.
- **`reason` field on failure entry:** Use the exact error message captured at the failure point (e.g., `'runPromote exitCode=' + result.exitCode` or the gate-failure message).
- **Atomic commit:** Single `feat(58): wire promote outcome ledger entries (PROMOTE-01..04)` if mechanically feasible. If split, PROMOTE-04's assertTripleGate-byte-pin MUST land in the same commit as the new code (defense against accidental body drift during the edit).

### Claude's Discretion (during plan-phase)

- Which failure paths get a ledger entry — minimally the `runPromote` non-zero exit at line 436; optionally the triple-gate failure paths at 404/419/425 (these are pre-promotion, so semantically distinct from a "promotion failed mid-flow" — planner picks the cleanest semantic).
- Whether the assertTripleGate body-pin uses a hash (compact, less informative on failure) or a verbatim string (verbose, clear delta when it fails). Recommend verbatim string — the function body is small (lines 67-81 ~15 lines) and the failure message is more diagnosable.
- Whether to also add a Vitest assertion that pins `_skipCiGuard:\\s*true` grep count = 1 (recommended — it's the load-bearing trust invariant from Phase 53 close).
- Whether `parseFingerprint` becomes an exported helper or stays inline at the call site (defer to planner's read of the surrounding code).
- Exact `appendLedgerEntry` import path — recommend `import { appendLedgerEntry } from '../tests/e2e/lib/llm-ledger.js'` (from `scripts/` to `tests/e2e/lib/`). Planner confirms the path resolves at runtime AND that the IMPORTS POLICY comment's grep audit pattern continues to pass.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix-promote.mjs:54-58` — current import block: `fs`, `path`, `fileURLToPath`, `runPromote`. Phase 58 adds `appendLedgerEntry`.
- `scripts/auto-fix-promote.mjs:431-446` — the verified-branch success path. PROMOTE-02 entry goes between lines 446 and 446 (after `process.stdout.write` and before `process.exit(0)`, OR before `process.stdout.write` — both are valid; recommend before `process.stdout.write` so the entry-write happens before the success log).
- `scripts/auto-fix-promote.mjs:436-440` — the `runPromote returned exitCode !== 0` failure path. PROMOTE-03 entry goes between line 439 (the `process.stderr.write`) and line 440 (the `process.exit(1)`).
- `scripts/auto-fix-promote.mjs:89-` — `assertTripleGate` body. Body bytes pinned by Phase 53 close-note (already validated against Phase 53 baseline). Phase 58 adds a Vitest assertion that re-pins this against the Phase 58 baseline.
- `scripts/auto-fix-promote.mjs:21-30` — IMPORTS POLICY comment block. ALLOWED list narrowed; grep audit pattern updated to include `tests/e2e/lib/llm-ledger.js`.
- `tests/e2e/lib/llm-ledger.js:686` — `appendLedgerEntry(ledgerPath, entry)`. Append-only; entry shape is open (spread-pattern). Phase 56 left this function body byte-unchanged.
- `tests/unit/auto-fix-promote-gate.test.js` — existing Vitest file for promote-gate behaviour. Phase 58 ADDs (a) the IMPORTS POLICY assertion (new — there is no existing grep-based imports test), (b) the assertTripleGate body-pin, (c) tests for the new outcome ledger writes (mocked `appendLedgerEntry`).
- `scripts/auto-fix.mjs` (Phase 56) — pattern reference for `safeAppendLedger` wrapper. Phase 58 deliberately does NOT mirror this guard (auto-fix-promote.mjs runs only in CI; the leak vector is CI-only-safe).

### Established Patterns
- `appendLedgerEntry(LEDGER_PATH, { ... })` — universal call shape. The new outcome entries spread the standard required fields (timestamp, phase, transport — confirm with planner research) and add the event-specific fields.
- Conventional commits: `feat(58): ...` for new behavior.
- LEDGER_PATH resolution lives in `tests/e2e/lib/llm-ledger.js:74-98` IIFE — Phase 58 does NOT need to compute it; just import and call.

### Integration Points
- `scripts/a-b-winner.mjs` is the downstream consumer (Phase 54 close-note: forward-compat `detectOutcome()` already probes `entry.outcome === 'pass'|'fail'`). Phase 58 entries unblock A/B winner abstention exit once ≥20 entries per ERROR_CLASS per model arm accumulate.
- Phase 56's `errorClass` ledger field (LEDGER-01..04) is already wired in auto-fix.mjs. Phase 58 entries DO NOT need to write `errorClass` themselves — that's already on the upstream auto-fix entry that this promotion is a response to. (Planner verifies whether a-b-winner.mjs requires errorClass on the outcome entry too, or just on the upstream auto-fix entry; recommend research-time check.)

</code_context>

<specifics>
## Specific Ideas

Pre-flight grep confirms:
- `scripts/auto-fix-promote.mjs:58` is the current last import line (`import { runPromote } from './promote-from-quarantine.mjs'`).
- `scripts/auto-fix-promote.mjs:434` has the unique `_skipCiGuard:\s*true` literal — grep count = 1 is the trust invariant.
- `tests/unit/auto-fix-promote-gate.test.js` has 42 lines as inspected; current imports are only `vitest` (line 42). No existing IMPORTS POLICY enforcement test exists in the repo — Phase 58 ADDS this.

</specifics>

<deferred>
## Deferred Ideas

- A/B winner code changes — explicitly NOT in scope; the forward-compat probe handles outcome entries transparently once they exist.
- `fix_abandoned` outcome state (draft PR closed without merge) — owned by future milestone (OBS-FUT-01).
- Removing the Phase 56 `safeAppendLedger` wrapper from auto-fix.mjs — defense-in-depth; both layers stay.

</deferred>

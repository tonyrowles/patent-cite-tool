# Phase 62: Forensic Ledger Hardening + Bypass-Audit Probe - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Auto-generated (pure-infrastructure phase per smart-discuss heuristic — success criteria all technical; no user-facing behavior; requirements precisely specified)

<domain>
## Phase Boundary

Shared `tests/e2e/lib/safe-append-ledger.js` helper closes all 4 currently-unguarded ledger-write sites:
- `scripts/auto-fix-promote.mjs:521` (outcome:'fail' on promote failure)
- `scripts/auto-fix-promote.mjs:544` (outcome:'pass' on promote success)
- `scripts/e2e-explore.mjs:262` (iteration ledger entry — currently MISSING source/transport)
- `scripts/e2e-explore.mjs:313` (retry ledger entry — currently MISSING source/transport)

AND new `scripts/audit-bypass-merges.mjs` surfaces sole-maintainer `--admin` bypasses that pollute A/B winner outcome data — without touching `appendLedgerEntry` body (additive-only invariant preserves 33 pre-existing Vitest tests per Pitfall 3).

Requirements covered: LEDX-01, LEDX-02, LEDX-03, LEDX-04, BYPASS-01, BYPASS-02, BYPASS-03.

</domain>

<decisions>
## Implementation Decisions

### Shared Helper Extraction (LEDX-01)

- New file: `tests/e2e/lib/safe-append-ledger.js`
- Extracted from the existing `safeAppendLedger` pattern in `scripts/auto-fix.mjs:143-181` (preserves the CI/override/subscription-only write semantics from Phase 56 + Phase 60.1 hotfix)
- Helper signature: `safeAppendLedger(ledgerPath, entry, { allowOverride = false } = {})`
- Defaults `source` and `transport` if caller omits — required for the 2 e2e-explore.mjs sites that currently don't pass these fields
- Rejects non-canonical `transport` values (must be one of `'sdk'` or `'subscription'`)
- Phase 60.1 subscription-transport whitelist preserved (entries with `transport: 'subscription'` pass through the CI guard)
- IMPORTANT: `scripts/auto-fix.mjs:safeAppendLedger` (the local wrapper) continues to exist; it CALLS the new shared helper. Refactor: turn the local function into a thin pass-through. This preserves the 50+ existing auto-fix.mjs tests.

### Site Wiring (LEDX-02)

- `scripts/auto-fix-promote.mjs:521` + `:544` — currently use direct `appendLedgerEntry` with inline source + transport. Replace with `safeAppendLedger` (same fields).
- `scripts/e2e-explore.mjs:262` + `:313` — currently use direct `appendLedgerEntry` WITHOUT source + transport. Replace with `safeAppendLedger`; caller may either:
  - Pass `source: 'e2e-explore'` + `transport: 'subscription'` explicitly (preferred)
  - Or omit; helper applies defaults (`source: 'e2e-explore'` + `transport: 'subscription'` — both site contexts are subscription-transport invokeClaudeP paths)
- After wiring: `appendLedgerEntry` body is BYTE-UNCHANGED (LEDX-03 invariant preserved; 33 Vitest tests stay green).

### Auxiliary Leak Vector Note (PRE-02 / project memory)

From project memory: `scripts/auto-fix.mjs` writes ledger entries via a path PRE-02's `invokeAnthropicSdkWithLedger` guard does not cover. New leaks may carry `source: 'auto-fix-api'`. **Phase 62 scope explicitly INCLUDES auditing all `appendLedgerEntry` direct call sites** in `scripts/auto-fix.mjs` — any not yet routed through `safeAppendLedger` MUST be wired here. Use `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` to enumerate.

### Bypass-Audit Probe (BYPASS-01)

- New file: `scripts/audit-bypass-merges.mjs`
- Queries `gh api repos/$OWNER/$REPO/actions/runs?event=pull_request` for `verifier-gate` workflow runs
- For each merged auto-fix PR (filter by branch prefix `auto-fix/`), checks: did `verifier-gate` complete AFTER the PR was merged? If yes → bypass (workflow was bypassed via `--admin` merge).
- Output CSV: `pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag`
- Consumed by Phase 66's `a-b-winner.mjs --admin-bypass` filter (cross-phase contract)
- Auth: assumes `gh` CLI is authenticated; reads `gh auth status` to verify before any API calls
- Idempotent: pure read, no state mutations

### Weekly Digest Bypass Metric (BYPASS-02)

- Edit `.github/workflows/e2e-weekly-digest.yml` to add a new SUMMARY_KEYS row `bypass_count` (additive-only — SUMMARY_KEYS frozen-array invariant preserved)
- Source: count of `bypass_detected=true` rows in last 7 days of `scripts/audit-bypass-merges.mjs` CSV output
- Surface: Auto-Fix Pipeline section of weekly digest gains `Bypasses: N` line

### Bypass Conventions Runbook (BYPASS-03 — VERIFY-ONLY)

- `.planning/STATE.md ## Bypass Conventions` section is ALREADY present (verified at line 47 as of 2026-06-09 — landed during v4.3 milestone setup)
- Phase 62 task: grep-verify presence; no edit needed in happy path
- If drift removes the section, restore from Phase 61 commit `ca14805~N` history

### Trust-Invariant Non-Mutations (verify after every Phase 62 commit)

- `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` body BYTE-UNCHANGED (Phase 56 additive-only invariant) — verify via sha256 pin
- `assertTripleGate` body byte-equivalent to Phase 53 baseline
- ESLint `no-restricted-imports` `@anthropic-ai/sdk` single-entry-point preserved
- Phase 60.1 subscription-transport whitelist preserved (Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED` from Phase 60.1)
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` == 1 (Phase 57 scope-lock)
- 33 pre-existing Vitest ledger tests in `tests/unit/llm-ledger.test.js` STAY GREEN
- 50+ existing `tests/unit/auto-fix.test.js` tests STAY GREEN

### Atomic-Commit Strategy

Two logical commits acceptable:
1. `feat(62): shared safe-append-ledger helper + wire 4 unguarded sites (LEDX-01..04)` — helper + 4 site rewires
2. `feat(62): audit-bypass-merges probe + weekly digest bypass metric (BYPASS-01..03)` — new script + workflow edit

OR a single combined commit. Plan-phase decides.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix.mjs:safeAppendLedger` (lines 143-181) — proven CI/override/subscription guard pattern. Extract this verbatim into the shared lib; turn the local function into a thin wrapper.
- `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` — the canonical writer. BYTE-UNCHANGED through Phase 62.
- `scripts/auto-fix-promote.mjs:521,544` — already pass source + transport inline. Wiring is mechanical.
- `scripts/e2e-explore.mjs:262,313` — pass source + transport defaults via helper (subscription transport context).

### Established Patterns
- ESM imports; Node 22 built-ins only; zero new npm deps target (fifth consecutive milestone if held).
- Vitest test files at `tests/unit/*.test.js`; fileParallelism: false; setupFiles `./tests/setup/chrome-stub.js`.
- `gh` CLI subprocess pattern via `child_process.execSync` (see Phase 57 ledger-snapshot scripts).

### Integration Points
- Phase 66 (A/B winner exit) reads `scripts/audit-bypass-merges.mjs` CSV via `--admin-bypass` filter
- Phase 57 weekly-digest workflow consumes new bypass_count metric

</code_context>

<specifics>
## Specific Ideas

- The helper signature should match the existing `safeAppendLedger` call shape so the auto-fix.mjs local wrapper becomes a 1-line pass-through: `safeAppendLedger(entry) → safeAppendLedger(LEDGER_PATH, entry, { allowOverride: false })`.
- The helper's CI guard uses `process.env.CI`, `process.env.GSD_LEDGER_OVERRIDE`, and `entry.transport === 'subscription'` (Phase 60.1 whitelist) — port verbatim.
- New Vitest file `tests/unit/safe-append-ledger.test.js`:
  - Test 1: CI=undefined + no override + `transport: 'sdk'` → THROWS
  - Test 2: CI=undefined + no override + `transport: 'subscription'` → WRITES (Phase 60.1 hotfix)
  - Test 3: CI=true → WRITES
  - Test 4: GSD_LEDGER_OVERRIDE=1 → WRITES
  - Test 5: non-canonical transport (e.g., `'http'`) → THROWS
  - Test 6: missing source defaults to caller-context default
- `scripts/audit-bypass-merges.mjs` CLI:
  - `--since-iso 2026-06-01T00:00:00Z` (default: 7 days ago)
  - `--output csv|json` (default: csv)
  - `--repo owner/name` (default: derive from `gh repo view --json nameWithOwner`)

</specifics>

<deferred>
## Deferred Ideas

- Reader-side validation in `a-b-winner.mjs` to filter pre-v4.3 orphan entries — handled in Phase 66 via `--since-iso` filter
- ARCHITECTURE's top-of-function validation in `appendLedgerEntry` body — REJECTED per PITFALLS Pitfall 3 (would break 33 tests). Wrapper-layer validation per LEDX-01 is the canonical approach.

</deferred>

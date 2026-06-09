# Phase 66: A/B Winner Exit + 3-way Transport Stratification - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Mode:** Auto-generated (pure-infrastructure phase — single file scope)

<domain>
## Phase Boundary

Drive `scripts/a-b-winner.mjs` out of abstention mode by extending `computePerClassPerArm` to stratify by **(class, arm, transport)** 3-way (NEW v4.3 finding — corrects Phase 54 D-19 oversight); add `--since-iso` and `--admin-bypass` argv filters; raise `TIE_THRESHOLD` 0.05 → 0.10; remove `PHASE_56_TODO` comments.

Requirements covered: ABWIN-01, ABWIN-02, ABWIN-03, ABWIN-04.

</domain>

<decisions>
## Implementation Decisions

### ABWIN-01: 3-way (class, arm, transport) stratification

Current `computePerClassPerArm` (a-b-winner.mjs:252) groups by `(class, arm)` 2D. Extend to 3D `(class, arm, transport)`:

```js
// New shape: perClass[errorClass][arm][transport] = { n, passes, passRate }
// where transport ∈ {'sdk', 'subscription'}
```

Cross-transport contamination concern (Pitfall 4): SDK `client.messages.create({maxRetries: 2})` retries on 5xx → 1 ledger entry per logical attempt; subscription `claude -p` has no in-CLI retry → 1 entry per actual API call. Mixing inflates SDK apparent success vs subscription.

Resolution: declare winner ONLY when both transports agree OR with explicit transport disclosure in markdown table output.

### ABWIN-02: --since-iso filter + TIE_THRESHOLD bump

- Add `--since-iso <iso8601>` argv flag (default: 30 days ago).
- Filter ledger entries by `entry.iso >= since-iso` BEFORE `isAttributable`.
- Raise `const TIE_THRESHOLD = 0.05` → `0.10` (PITFALLS noise-floor reasoning inline-documented).
- Validate `--since-iso` matches RFC-3339 (mirror Phase 62's WR-02 fix pattern in `audit-bypass-merges.mjs`).

### ABWIN-03: --admin-bypass filter

- Add `--admin-bypass <csv-path>` argv flag pointing to Phase 62's `audit-bypass-merges.mjs` CSV output.
- Parse CSV (header: `pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag`).
- For each row where `bypass_detected === 'true'`, build a filter set of `prNumber`s.
- Filter ledger entries: exclude any entry where `entry.prNumber` is in the bypass set.
- Default behavior (flag omitted): no filtering (backward-compatible).

### ABWIN-04: Remove PHASE_56_TODO + zero-sample sanity check

- Remove all `PHASE_56_TODO` comments (a-b-winner.mjs:69, 254, 262).
- Add sanity-check pre-emit: refuse to declare a winner when ONE arm has zero samples for a given (class, transport) cell. Emit `abstain — insufficient samples in <arm> arm for (<class>, <transport>)`.

### Trust-Invariant Non-Mutations

- `assertTripleGate` body byte-equivalent to Phase 53 baseline
- `appendLedgerEntry` body byte-unchanged (Phase 56 invariant)
- `isAttributable` body byte-unchanged (Phase 54 D-19 — filter pre-conditions unchanged)
- `N_PER_ARM_REQUIRED = 20` unchanged (ABWIN-DEF-01 deferred to v4.4)
- Phase 60.1 subscription-transport whitelist preserved (entries still pass through)
- ESLint clean

### File scope

Files modified:
- `scripts/a-b-winner.mjs` (single file — all 4 requirements land here)
- `tests/unit/a-b-winner.test.js` (extend with 3-way stratification, --since-iso, --admin-bypass, TIE_THRESHOLD bump, zero-sample sanity test cases)

Files NOT modified:
- `tests/e2e/lib/llm-ledger.js:appendLedgerEntry` (Phase 56 invariant)
- `scripts/auto-fix-promote.mjs:assertTripleGate` (Phase 53 invariant)

### Commit strategy

ONE commit: `feat(66): A/B winner 3-way transport stratification + filters + TIE_THRESHOLD bump (ABWIN-01..04)`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/a-b-winner.mjs:isAttributable` (L178) — filter logic; do not modify body.
- `scripts/a-b-winner.mjs:computePerClassPerArm` (L252) — extension point for 3-way stratification.
- `scripts/a-b-winner.mjs:decideWinner` (L290) — extension point for zero-sample sanity check.
- `scripts/audit-bypass-merges.mjs` (Phase 62) — CSV producer for ABWIN-03.

### Established Patterns
- Pure functions; explicit argv parsing pattern from `audit-bypass-merges.mjs`.
- Frozen constants for thresholds; Object.freeze for output structures.

### Integration Points
- Phase 62 `audit-bypass-merges.mjs` CSV → ABWIN-03 input.
- Phase 67 (next, deferred to next session) extends `buildFixPrompt` with `rewriteHint` — orthogonal to this phase.

</code_context>

<specifics>
## Specific Ideas

- `--since-iso` default: 30 days ago (formatted as `new Date(Date.now() - 30*24*3600*1000).toISOString()`).
- TIE_THRESHOLD bump: rationale comment must reference Phase 66 PITFALLS noise-floor: "0.05 was too tight given the (class, arm, transport) 3-way fan-out reduces per-cell sample size".
- Markdown output table: include transport column. Per-cell rows: `| errorClass | transport | sonnet n/passRate | opus n/passRate | winner |`.
- Zero-sample sanity test: feed a ledger fixture with all samples on sonnet and zero on opus for a specific (class, transport) — assert output contains `abstain` + reasoning.

</specifics>

<deferred>
## Deferred Ideas

- ABWIN-DEF-01: `N_PER_ARM_REQUIRED` value tuning — defer to v4.4 after a week of live ledger baseline post-v4.3-ship.

</deferred>

---
phase: 59-fixture-mutator-4-uat-re-sweep
plan: 00
wave: 0
captured_iso: 2026-06-05
type: baseline
status: complete
PHASE_59_BASELINE: b59512fb5f131539cac5d516a49b2a2ef8fbda10
disposition: PROCEED — Wave 1 (59-01) and Wave 2 (59-03) cleared; downstream plans MUST verify byte-equality against this anchor before edits.
---

# Phase 59 Baseline — Locked Source Coordinates

**Purpose:** Anchor commit for the four load-bearing source coordinates that downstream
Phase 59 plans (59-01 mutator + suppression, 59-02 live UAT runbook, 59-03 phase argv
expansion) depend on. Mirrors the Phase 58-00 baseline pattern.

**Read-only inspection.** No source files were modified by Wave 0. The deliverable is
this single markdown file plus the per-task SUMMARY.

---

## 1. PHASE_59_BASELINE

```
PHASE_59_BASELINE = b59512fb5f131539cac5d516a49b2a2ef8fbda10
```

Captured at Wave-0 start (after the worktree branch + base check confirmed alignment
with the orchestrator-supplied anchor `b59512fb5f131539cac5d516a49b2a2ef8fbda10`).

Plans 59-01 and 59-02 MUST verify byte-equality of the four coordinates below against
this sha before editing. If `git diff $PHASE_59_BASELINE HEAD -- <file>` shows a hunk
overlapping any of these coordinates, the dependent plan is REQUIRED to halt and
re-baseline before proceeding.

---

## 2. Fingerprint Contract — `scripts/e2e-report-issue.mjs:78-81`

**Verbatim source (lines 78-81):**

```javascript
export function fingerprint(caseId, errorClass, topOfStackHash) {
  const input = `${caseId}|${errorClass}|${topOfStackHash || ''}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}
```

**Formula:** 12-hex sha256 prefix of `"${caseId}|${errorClass}|${topOfStackHash || ''}"`.

**Cross-reference confirmation (v2 short-form marker):** the parser in
`scripts/auto-fix.mjs:231` reads the fingerprint via the regex
`/<!-- fp: ([0-9a-f]{12}) -->/m` (verified verbatim — see §5 below). The mutator
(plan 59-01) MUST emit the `<!-- fp: <12-hex> -->` marker on line 1 of the issue body
so this regex matches.

**T-59-01 mitigation note:** Plan 59-01's `tests/e2e/scripts/inject-defect.mjs` MUST
import this `fingerprint` function by name from `scripts/e2e-report-issue.mjs`.
**Re-implementation of the formula is a T-59-01 (Tampering) violation** — even a
byte-identical re-implementation drifts the dedup contract if a future Phase ever
amends the formula (since two implementations would need to be kept in sync).

---

## 3. Quarantine-Append Label-Add Coordinates — `scripts/quarantine-append.mjs:218-223`

**Supporting constants (lines 29-30):**

```javascript
const READY_FOR_PROMOTION_LABEL = 'quarantine:ready-for-promotion';
const STABLE_RUNS_THRESHOLD = 3;
```

**Verbatim conditional (lines 218-223):**

```javascript
  // 5. D-12: label-add when threshold reached.
  let addedLabel = false;
  if (finalEntry.stable_runs >= STABLE_RUNS_THRESHOLD && ghClient && triageIssueNumber != null) {
    ghClient.addLabel(triageIssueNumber, READY_FOR_PROMOTION_LABEL);
    addedLabel = true;
  }
```

**Plan 59-01 Task 4 edit point (preview of the smallest-diff change):** add a single
`&& !isFixtureMutator` predicate to the `if` head, where `isFixtureMutator` derives
from `finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b')`. This
freezes the surrounding bytes (the four lines above and the `return { action, entry: finalEntry, addedLabel };` line at 225) so that the Vitest contract test in plan 59-01 can pin the conditional shape.

---

## 4. FORBIDDEN_PATHS Bank — `scripts/check-diff-guard.mjs:49-58`

**Verbatim (all 8 frozen entries):**

```javascript
export const FORBIDDEN_PATHS = Object.freeze([
  /^tests\/test-cases\.js$/,
  /^tests\/golden\/baseline\.json$/,
  /^tests\/e2e\/test-cases-quarantine\.js$/,
  /^\.github\/workflows\/v40-[^/]*\.yml$/,
  /^tests\/e2e\/\.llm-spend-ledger\.json$/,
  /^\.github\/CODEOWNERS$/,
  /^tests\/e2e\/\.rerun-ring-buffer\.json$/,    // Phase 45-02 — FLAKE-01 ring buffer state
  /^tests\/e2e\/\.flake-suppression\.json$/,    // Phase 45-02 — FLAKE-02 suppression state
]);
```

**Count:** 8 entries (matches RESEARCH §FORBIDDEN_PATHS Confirmation, lines 607-651).

**Confirmation `.planning/...` is NOT in the bank:** No regex matches a path under
`.planning/`. Plan 59-01's mutator may safely write `56-MUTATOR-CLEANUP.md` to the
phase directory `.planning/phases/59-fixture-mutator-4-uat-re-sweep/` without
tripping the diff-guard. The MUTATOR-03 verification gate (`git status` clean after
mutator run) remains the operative invariant.

---

## 5. RESEARCH Q1 Resolution — RESOLVED via Plan 59-03

**Original RESEARCH Q1 (line 1378-1381 of 59-RESEARCH.md):** does `scripts/auto-fix.mjs`
Step 7 ledger write emit a `phase` field?

**Verbatim evidence — `scripts/auto-fix.mjs:174` (PHASE const declaration):**

```javascript
const PHASE = '42-auto-fix';
```

**Verbatim evidence — representative call site in `scripts/auto-fix.mjs:419-425`
(FLAKE_SUPPRESSED ledger entry; same shape as the Step 7 dispatcher entry):**

```javascript
    safeAppendLedger({
      iso: now().toISOString(),
      model: MODEL,
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: PHASE,
      transport,
      issueId: `issue-${issueNumber}`,
```

Every `safeAppendLedger`/`appendLedgerEntry` call site in `auto-fix.mjs` reads the
`phase` field off this single module-level `const PHASE` (no per-call override). Today
the value is hardcoded to `'42-auto-fix'`.

**Verbatim evidence — `scripts/auto-fix-promote.mjs:502` (PROMOTE-03 failure-path
outcome entry):**

```javascript
      // PHASE 58 PROMOTE-03 — outcome entry on promote failure (line 440 path only — see RESEARCH §8)
      appendLedgerEntry(LEDGER_PATH, {
        iso: new Date().toISOString(),
        model: args.model || 'claude-sonnet-4-6',
        cost_usd: 0,
        tokens_in: 0,
        tokens_out: 0,
        phase: '58-promote',
        transport: 'subscription',
        issueId: `issue-${resolvedSourceIssue}`,
        prNumber: args.pr,
        fingerprint: args.fingerprint,
        errorClass: args.errorClass,
        source: 'auto-fix-failed',
        outcome: 'fail',
```

**Verbatim evidence — `scripts/auto-fix-promote.mjs:522` (PROMOTE-02 success-path
outcome entry):**

```javascript
    // PHASE 58 PROMOTE-02 — outcome entry on promote success
    appendLedgerEntry(LEDGER_PATH, {
      iso: new Date().toISOString(),
      model: args.model || 'claude-sonnet-4-6',
      cost_usd: 0,
      tokens_in: 0,
      tokens_out: 0,
      phase: '58-promote',
      transport: 'subscription',
      issueId: `issue-${resolvedSourceIssue}`,
      prNumber: args.pr,
      fingerprint: args.fingerprint,
      errorClass: args.errorClass,
      source: 'auto-fix-promoted',
      outcome: 'pass',
```

Both outcome-entry sites currently hardcode `phase: '58-promote'`. There is no argv,
no env-var read, and no parameterization between the bare string literal and the
ledger write.

### Resolution: RESOLVED via Plan 59-03 (Decision C)

Per CONTEXT.md "Phase 59 Scope Adjustment Decision C" (2026-06-05), Phase 59 expands
scope to honor REQUIREMENTS.md SWEEP-05 literal wording — **"all UAT ledger entries
carry `phase: '56-uat'` for filterable production analysis (Pitfall 10)"**. The
expansion mirrors Phase 58's `--fingerprint` / `--error-class` / `--model` plumbing
pattern verbatim.

**Plan 59-03 (Wave 2; parallel with 59-02) threads a `--phase <value>` argv flag
through `scripts/auto-fix-promote.mjs`:**

- Default fallback: `args.phase || '58-promote'` (preserves the current hardcoded
  literal at lines 502 + 522 byte-equivalent on all non-UAT runs).
- UAT invocation: `--phase 56-uat` causes the outcome entries committed to
  origin/main to carry `phase: '56-uat'`, filterable via standard jq queries
  WITHOUT requiring evidence-file wrappers.
- Workflow plumbing (`.github/workflows/v40-auto-promote.yml`): adds a
  `workflow_dispatch.inputs.PHASE_TAG` input (default `''`) threaded through a
  dual-path env expression
  `PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}` and a
  conditional argv append `if [ -n "$PHASE_TAG" ]; then ARGS+=(--phase "$PHASE_TAG"); fi`.
- SWEEP-03 + SWEEP-04 operator runbooks (plan 59-02) trigger the workflow via
  `gh workflow run v40-auto-promote.yml -f PHASE_TAG=56-uat` (mutator-driven
  full-loop runs go through the normal trigger).

**Scope deliberately NOT expanded:** Plan 59-03 does NOT modify `scripts/auto-fix.mjs`.
The auto-fix.mjs `source: 'auto-fix-api'` entry is UPSTREAM of the auto-fix-promote.mjs
`source: 'auto-fix-promoted'` outcome entry. `a-b-winner.mjs:isAttributable` and the
SWEEP-05 filterable-production-analysis goal both key off the OUTCOME entry (the
`auto-fix-promoted` source), NOT the upstream `auto-fix-api` source. Phase 59 accepts
that the upstream `auto-fix-api` entry carries `phase: '42-auto-fix'` (because
auto-fix.mjs has no `--phase` flag); the FILTERABLE consumer entry is the
auto-fix-promote.mjs outcome entry, which is what SWEEP-05 demonstrates.

### Effect on REQUIREMENTS.md

SWEEP-05 wording stays verbatim. REQUIREMENTS.md gets a clarifying note added AFTER
the revision: `phase: '56-uat'` is now LIVE on auto-fix-promote.mjs outcome ledger
entries on origin/main (not on auto-fix-api entries) when invoked via Plan 59-03's
workflow PHASE_TAG plumbing.

---

## Coordinate Summary Table

| Coordinate | File | Line(s) | Verified |
|---|---|---|---|
| Fingerprint export (`function fingerprint`) | `scripts/e2e-report-issue.mjs` | 78-81 | ✓ |
| `READY_FOR_PROMOTION_LABEL` constant | `scripts/quarantine-append.mjs` | 29 | ✓ |
| `STABLE_RUNS_THRESHOLD` constant | `scripts/quarantine-append.mjs` | 30 | ✓ |
| Label-add conditional (`if (finalEntry.stable_runs ≥ ...)`) | `scripts/quarantine-append.mjs` | 218-223 | ✓ |
| `FORBIDDEN_PATHS` Object.freeze bank (8 entries) | `scripts/check-diff-guard.mjs` | 49-58 | ✓ |
| Fingerprint parser regex (`/<!-- fp: ([0-9a-f]{12}) -->/m`) | `scripts/auto-fix.mjs` | 231 | ✓ |
| `PHASE = '42-auto-fix'` const | `scripts/auto-fix.mjs` | 174 | ✓ |
| Outcome-entry `phase: '58-promote'` (PROMOTE-03 failure path) | `scripts/auto-fix-promote.mjs` | 502 | ✓ |
| Outcome-entry `phase: '58-promote'` (PROMOTE-02 success path) | `scripts/auto-fix-promote.mjs` | 522 | ✓ |

All nine coordinates verified verbatim against the source tree at PHASE_59_BASELINE
sha. No drift detected. Wave 1 (59-01 mutator) and Wave 2 (59-03 phase argv
expansion) are cleared to proceed against this anchor.

---

BASELINE COMPLETE — PHASE_59_BASELINE = b59512fb5f131539cac5d516a49b2a2ef8fbda10; downstream plans MUST verify byte-equality against this anchor.

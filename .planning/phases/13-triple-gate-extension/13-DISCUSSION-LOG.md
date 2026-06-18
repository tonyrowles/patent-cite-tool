# Phase 13: Triple-Gate Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 13-triple-gate-extension
**Areas discussed:** Promote trigger mode, Leg 3 acceptance semantics, Source-issue resolution failure mode, Issue-close + dedup interaction

---

## Promote trigger mode

| Option | Description | Selected |
|--------|-------------|----------|
| Stay workflow_dispatch-only | Operator dispatches auto-promote after merge; trigger YAML untouched; matches milestone's paused-automation posture | ✓ |
| Re-enable auto-fire on close | Restore `pull_request: types:[closed]` so merge auto-fires; re-introduces paused auto-firing | |
| Label-guarded auto-fire | Restore closed trigger but `if:` gate on merged + auto-fix:verified; automatic but scoped | |

**User's choice:** Stay workflow_dispatch-only
**Notes:** "Fires after merge" (success criterion #1) is satisfied by operator dispatch. Phase 14 UAT runs the live dispatch chain. → D-01.

---

## Leg 3 acceptance semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Flat OR, either label passes | Leg 3 passes if sourceIssueLabels includes 'triage' OR 'report-fix-candidate'; new label already vetted by Phase 11 | ✓ |
| OR, but require label present | Same OR plus explicit known-label assertion; no real behavioral difference | |

**User's choice:** Flat OR, either label passes
**Notes:** Preserves legacy triage path bit-for-bit; the OR only adds an accepted label. → D-02.

---

## Source-issue resolution failure mode

Two sub-questions discussed — (a) how to make the source issue resolvable, (b) what to do on failure.

### (a) Resolution gap fix

| Option | Description | Selected |
|--------|-------------|----------|
| Add comment marker to PR body | Emit `<!-- source_issue: N -->` from v61-report-fix.yml; reuse parseSourceIssue PREFERRED path unchanged; no trust-critical parser change | ✓ |
| Extend parseSourceIssue regex | Match `**Source Issue:** #N` prose; widens trust-critical parser surface | |
| Both (marker + prose fallback) | Belt-and-suspenders; most surface touched, arguably redundant | |

**User's choice:** Add comment marker to PR body → D-04.

### (b) Failure mode when unresolvable

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-fail, no promote (current) | Throw TRIPLE_GATE_FAILED; corpus never mutated on unverifiable signal; operator re-dispatches | ✓ |
| Skip gracefully, log only | Swallow error, exit 0 without promoting; weakens fail-loud posture | |

**User's choice:** Hard-fail, no promote (current) → D-03.

**Notes:** Discovery during scout — the Phase-12 report-fix PR body emits only `**Source Issue:** #N` prose (no HTML comment) and a commit message without `Fix #N`, so parseSourceIssue would throw for a v6.1 PR today. The marker fix (D-04) closes that gap via the already-tested path.

---

## Issue-close + dedup interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Inherit existing close behavior | auto-promote closes report-fix-candidate issue as it closes triage issues; the close feeds Phase 11 post-fix suppression; the two systems already interlock | ✓ |
| Close only after follow-up merges | Defer close until golden-corpus PR merges; diverges from triage path; new close-timing logic | |
| Keep issue open, label instead | Apply 'promoted' label, manual close; BREAKS suppression (keys off closedAt) | |

**User's choice:** Inherit existing close behavior
**Notes:** No new work — auto-promote's `gh issue close` (v40-auto-promote.yml:439) is exactly the signal Phase 11 post-fix suppression keys off (gh-client.mjs:157-196). → D-05.

---

## Claude's Discretion

- YAML-test file/home and exact marker wording for the new `<!-- source_issue -->` assertion (provided parseSourceIssue's regex matches).
- Whether PROMOTE-04 pin's `slice(startIdx, startIdx+15)` line-count constant changes when Leg 3 grows; the `EXPECTED_BODY` array and slice count must stay consistent.
- Commit decomposition, subject to the gate-body edit + PROMOTE-04 pin landing in the SAME commit (success criterion #2).

## Deferred Ideas

- Re-enabling `pull_request:closed` auto-fire for auto-promote (label-guarded or otherwise) — out of scope per D-01; a future automation-phase decision.

# Phase 12: Fix Generation + Regression Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 12-fix-generation-regression-gate
**Areas discussed:** Dispatcher architecture, Overfit guard behavior, Regression-gate ↔ iteration loop, Branch-collision idempotency, Primitive reuse, Iteration-failure trigger, Label vocabulary

---

## Dispatcher architecture (FIX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse plumbing, fresh entry | Extract auto-fix.mjs plumbing to shared helper, fresh report-domain entry | |
| Build fresh report-fix.mjs | Clean standalone dispatcher, copy only small primitives | ✓ |
| Extend auto-fix.mjs in place | Add a report mode to the existing 58KB dispatcher | |

**User's choice:** Build fresh report-fix.mjs
**Notes:** Combined with the follow-up on primitives (below) → fresh entry point, but the
invariant-pinned primitives are extracted to a shared module rather than copied. → D-01/D-02.

---

## Overfit / hardcoded-result guard (FIX-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-flag: open, block verified | Open draft PR, withhold auto-fix:verified, body note + human-review label | ✓ |
| Hard-reject: no PR | Abort before any PR; label Issue, surface diff in artifact | |
| Reject as failed iteration | Feed overfit hit back into the 3-iteration loop | |

**User's choice:** Soft-flag: open, block verified
**Notes:** Resolves the REQUIREMENTS "rejected" vs success-criterion-#3 "flagged" wording —
"rejected" means rejected from the auto-verified fast path, not "no PR." → D-03.

---

## Regression gate ↔ iteration loop (GATE-01, COST-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-PR run drives the loop | In-workflow npm test+quarantine = iteration driver; verifier-gate = independent on-PR confirmation | ✓ |
| Verifier-gate only | Skip in-workflow run; always open PR, verifier-gate is sole gate | |
| Both, pre-PR informational | Run tests pre-PR only to annotate, never block | |

**User's choice:** Pre-PR run drives the loop
**Notes:** The two regression runs are intentional, not redundant — in-workflow run bounds
spend / self-corrects; reused v40-verifier-gate.yml binds the required-status check. → D-04.

---

## Branch-collision idempotency (FIX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub-authoritative, reuse | Query existing auto-fix/<fp-short> PR/branch first; skip or force-push reuse | ✓ |
| Skip if any PR exists | No-op if any PR (open/closed) references the fingerprint | |
| Always new suffix | Fresh branch suffix per run, accept duplicate PRs | |

**User's choice:** GitHub-authoritative, reuse
**Notes:** Mirrors Phase 11 D-04/D-05 GitHub-authoritative idempotency. → D-06.

---

## Primitive reuse (follow-up to dispatcher)

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to shared, import both | Lift ledger-split + diff-fence + git-apply into a shared module both dispatchers import | ✓ |
| Copy primitives into report-fix.mjs | Duplicate proven snippets verbatim, leave auto-fix.mjs untouched | |
| Re-derive fresh | Write ledger-split + diff parsing from scratch | |

**User's choice:** Extract to shared, import both
**Notes:** Avoids re-deriving the Vitest-pinned two-commit-split invariant; retarget the
existing COST-04 / diff-fence pins to the shared module. → D-02.

---

## Iteration-failure trigger (COST-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Any failure re-prompts | diff-guard / git-apply / regression all consume an iteration | |
| Only regressions re-prompt | Regressions drive re-prompt; diff-guard/git-apply = hard abort | ✓ |
| Separate caps | Distinct retry budgets for guard failures vs regressions | |

**User's choice:** Only regressions re-prompt
**Notes:** Forbidden-path / unappliable diffs abort to auto-fix-stuck immediately; the
3-iteration budget is reserved for semantically-wrong-but-valid fixes. → D-05.

---

## Label vocabulary (FIX-04, COST-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing labels | human-review-required (overfit, on PR) + auto-fix-stuck (exhaustion, on Issue) | ✓ |
| New dedicated overfit label | Add auto-fix:overfit-review for filterability | |
| Mirror both to Issue + PR | Apply every state label to both surfaces | |

**User's choice:** Reuse existing labels
**Notes:** No new label vocabulary; verifier-gate already ensures human-review-required
exists. → D-07.

---

## Claude's Discretion

- Fresh dispatcher filename/location (`scripts/report-fix.mjs` assumed) and shared-primitives
  module name/home (`tests/e2e/lib/` assumed).
- `<report_data>` envelope field ordering + which KV diagnostic fields beyond the
  FIX-03-named ones reach the LLM (prompt BODY is research-phase work).
- New env-var names following the `MAX_FIXES_PER_RUN` / `duplicate_count` convention.
- In-workflow step ordering, provided the COST-04 two-commit-split + `wrangler --remote`
  invariants hold.

## Deferred Ideas

None introduced during discussion. Milestone-level deferrals (Phase 13 GATE-05, Phase 14
digest + UAT, cron triggers, LLM triage for ambiguous reports) noted in CONTEXT.md.

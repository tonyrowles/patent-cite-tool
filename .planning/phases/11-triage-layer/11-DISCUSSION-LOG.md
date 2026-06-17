# Phase 11: Triage Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 11-triage-layer
**Areas discussed:** Golden-corpus conflict policy, Idempotency source of truth, Post-fix suppression, Reuse vs rebuild issue-filer, Triage artifact

---

## Golden-corpus conflict policy (TRI-03 ↔ TRI-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Promote anyway, note it | Golden presence does NOT block promotion (golden proves one selection only); apply normal signals, record "in golden (different selection)" for the fix-phase | ✓ |
| Downgrade to ambiguous | Treat golden + real-bug-signal collision as needing a human look; classify `ambiguous`, no auto-promote | |
| Trust golden → user_error | Assume golden is authoritative and the user mis-selected; classify `user_error`, do not promote | |

**User's choice:** Promote anyway, note it
**Notes:** Golden corpus proves correctness for one specific test selection only; a user can report a real failure on a different passage of a golden patent. Promoted Issue records that the existing golden case must be protected by the Phase 12 fix.

---

## Idempotency source of truth (ING-03, ING-04)

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Issue authoritative | Issue (via `<!-- kv-key -->` pointer) is the real dedup; find/create Issue FIRST, then write KV status; self-healing on partial failure | ✓ |
| KV status authoritative | Skip records whose `_review.status` marks them handled; no GitHub query per run | |
| Both must agree | Require KV status AND matching Issue; log a conflict on disagreement | |

**User's choice:** GitHub Issue authoritative

### Status-field coexistence follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing vocabulary | Map onto existing states: promoted → `triaged`, skipped → `wontfix`; one shared `_review.status` field, digest unchanged | ✓ |
| Separate ingest sub-key | Write automated results to `_review.ingest`; keep `_review.status` for humans | |
| Extend the enum | Add explicit `promoted`/`skipped` states to `review-reports.mjs` REVIEW_STATES + digest | |

**User's choice:** Reuse existing vocabulary
**Notes:** Keeps the shared `review-reports.mjs` digest coherent; manual-promote (PROMO-02) bypasses the status check so a `wontfix` record can still be force-promoted.

---

## Post-fix suppression (TRI-06)

### Detection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Query merged fix PRs/issues | Query GitHub for a merged `auto-fix/*` PR / closed `report-fix-candidate` Issue referencing the patentNumber | ✓ |
| Persisted fixed-patents ledger | Maintain a committed `fixed-patents.json` | |
| Git log of src/shared | Scan `git log` of `src/shared/` commits for the patentNumber | |

**User's choice:** Query merged fix PRs/issues — consistent with the GitHub-authoritative dedup choice.

### Window length

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days, env-configurable | Suppress only if a fix merged in the last 30 days; later reports are fresh signals | ✓ |
| 90 days, env-configurable | Align with 90-day KV TTL; broader suppression | |
| Indefinite (once fixed) | Always suppress a patent's reports after any fix merges | |

**User's choice:** 30 days, env-configurable
**Notes:** Covers deploy/propagation lag where stale re-reports cluster; a report a month+ after a fix may be a genuinely different bug and is allowed to promote.

---

## Reuse vs rebuild issue-filer (PROMO-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extract plumbing, fresh body | Lift gh-client plumbing into a shared helper both filers import; write a new report-domain classifier + body builder | ✓ |
| Fully fresh module | Self-contained gh shell-out + body; zero coupling to E2E code | |
| Add --source report branch | Extend the 806-line `e2e-report-issue.mjs` with a `--source report` branch | |

**User's choice:** Extract plumbing, fresh body
**Notes:** Reusable: `createIssueWithLabels`, hidden-comment dedup find, `--paginate` listing, shell-escaping. Not reusable: E2E-case-specific fingerprint helpers + body builders. Dedup marker retargets to `<!-- kv-key: report:{fp}:{ts} -->`.

---

## Triage artifact (TRI-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Workflow run artifact | Per-run `triage-report.json` via `actions/upload-artifact`; durability via Issues + KV status; no `main` push | ✓ |
| Dedicated git branch | Commit each run to a `triage-reports/<date>` branch (mirrors `ledger-snapshots/*`) | |
| Both: artifact + branch | Upload AND push to branch | |

**User's choice:** Workflow run artifact
**Notes:** Committing to `main` would violate STATE.md's "two-commit ledger split is the ONLY permitted direct push to `main`" invariant. Local CLI runs write to a gitignored path + stdout.

---

## Claude's Discretion

- Exact subcommand/flag surface beyond locked `list` + `promote <fp> <ts>`.
- Shared-helper module name/location for the extracted gh plumbing.
- Triage-rationale string format + named heuristic rule identifiers (TRI-02).
- Env-var names for the suppression window and any new thresholds.

## Deferred Ideas

None — discussion stayed within phase scope. (Milestone-level deferrals: LLM triage for ambiguous reports, nightly cron, auto-quarantine of ungoldened promoted patents, Worker-route fixes — all out of v6.1/Phase-11 scope.)

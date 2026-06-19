# ADR-001: Report-fix LLM runs locally via Claude Code subscription

- **Status:** Accepted
- **Date:** 2026-06-19
- **Phase context:** 14 (End-to-End UAT + Digest), evolving Phase 12 (FIX/GATE/COST)
- **Supersedes (in part):** the as-built COST-01 wording ("all spend via `invokeAnthropicSdkWithLedger`, `source:'report-fix-api'`, `transport:'sdk'`")

## Context

Phase 12 built report-fix to run the fix LLM **in CI** (`v61-report-fix.yml`) via the
Anthropic API (`invokeAnthropicSdkWithLedger`, needs `ANTHROPIC_API_KEY` +
`CLOUDFLARE_*` secrets). The operator wants to avoid API billing and instead use
the existing Claude Code **Max subscription** (the `claude -p` / `invokeClaudePWithLedger`
transport built in v3.1/v4.0 and still present).

Hard constraint: the subscription transport is, by design, **mutually exclusive
with CI** — `invokeClaudePWithLedger` refuses when `CI`/`GITHUB_ACTIONS` is set, and
GitHub's hosted runners cannot reach the operator's Claude Code auth. So the
subscription LLM step **must run locally**, not on a GitHub runner.

## Decision

The report-fix LLM call runs **locally** on an operator machine (WSL) via the
subscription transport. Concretely:

- `report-fix.mjs` gains a transport switch (`resolveTransport`): `subscription`
  (local, default outside CI) vs `sdk` (CI). The chosen transport is threaded into
  every ledger entry, so COST caps/audit still unify across both transports via
  `combinedMonthlyTotalByTransport`. **The monthly cap (UAT-03) is unchanged.**
- `scripts/fix-report-local.mjs` + `npm run fix-report -- <issue#> [--push]` is the
  local orchestrator: KV fetch (`wrangler --remote`) → `runReportFix` (subscription)
  → `git apply` → golden-corpus gate → revert/retry → draft PR (with the
  `<!-- source_issue: N -->` marker). It **applies** the diff before gating (the CI
  job only ran `git apply --check`).
- `v40-verifier-gate.yml` still gates the resulting `auto-fix/<fp>` PR in CI (no LLM);
  the GATE-04 human-merge invariant is unchanged.
- `ANTHROPIC_API_KEY` is no longer required. The CI `v61-report-fix.yml` is disabled
  for now; a notify-only neuter is deferred (see Consequences).

## Consequences

**Positive:** no API billing (uses the subscription); a smaller CI secret surface;
`claude -p` can take more turns than the single-turn SDK path. The ledger/cap model
already supports `transport:'subscription'`, so this is a clean extension, not a
rewrite.

**Negative / trade-offs:**
- Loses "label it and walk away" automation — a human runs each fix locally. v6.1 is
  already operator-dispatched + human-merge-gated, so this is a small step.
- COST-01's literal "transport:'sdk'" wording no longer holds; this ADR records the
  deviation. The cap/audit invariant it protects is preserved.
- **Deferred:** neutering the CI `v61-report-fix.yml` LLM path is a reviewed change —
  it invalidates GATE-05 workflow-contract assertions in
  `tests/unit/v61-report-fix-yaml.test.js`. Tracked as follow-up; the workflow is
  disabled in the meantime.

**Operational tuning (for `claude -p` single-shot diff generation):** `tools:''`
(no tools), `maxTurns:1–2`, `maxBudgetUsd:'3.00'`, `timeoutMs:300000`; `git apply`
needs `--recount` + a force-appended trailing newline. See memory
`project_v61_report_fix_subscription_local`.

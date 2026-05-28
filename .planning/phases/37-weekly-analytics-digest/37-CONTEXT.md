# Phase 37: Weekly Analytics Digest - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 37 ships the weekly analytics digest: a Monday-07:00-UTC GitHub Actions cron that reads the prior week's LLM-triage issues (filtered by `e2e-nightly` + `e2e-quarantine` labels via the `gh` API), aggregates them into a ≤50-line markdown summary (findings count, classification breakdown table, top-3 failure categories, quarantine growth, cost vs cap), publishes it (GitHub Discussion if enabled, else an `e2e-digest`-labeled Issue fallback — selected by a single config flag), and commits it to `reports/weekly-digest-YYYY-WNN.md` in the same run. `SUMMARY_KEYS` is exported from `lib/llm-report.js` as the single source of truth for the summary contract.

**PHASE-START GATE (verified 2026-05-28):** `gh api repos/tonyrowles/patent-cite-tool --jq .has_discussions` returned `false`. GitHub Discussions is NOT enabled. Therefore the `e2e-digest`-labeled Issue fallback is the ACTIVE publish path. The `gh api graphql createDiscussion` path is still implemented (DIGEST-03 "both paths") but dormant until Discussions are turned on.

**In scope:** `SUMMARY_KEYS` export + missing-key validation; `scripts/weekly-digest.mjs` CLI + `npm run e2e:weekly-digest`; the aggregation logic; both publish branches (discussion + issue) behind `DIGEST_PUBLISH_MODE`; `.github/workflows/e2e-weekly-digest.yml` (Monday cron, contents+discussions write, e2e-digest label-ensure, commit-in-run); Vitest mock-gh tests.

**Out of scope:**
- Roadmap-candidate auto-generation from top categories (ROADMAP-01/02 — deferred per REQUIREMENTS.md)
- Real-time alerting (ALERT-01 — deferred)
- Enabling GitHub Discussions on the repo (org/admin action, not code)

</domain>

<decisions>
## Implementation Decisions

### SUMMARY_KEYS + Digest Aggregation
- **D-01:** Export `SUMMARY_KEYS = Object.freeze(['passed','wrong_citation','verifier_disagree','llm_hallucinated_selection','llm_api_error','harness_error','total_cost_usd'])` from `tests/e2e/lib/llm-report.js` (verified against the committed fixture's `summary` shape). Ideally `initLlmReport`/`finalizeLlmReport` build the summary object from this single source so the contract has one definition.
- **D-02:** `weekly-digest.mjs` validates ALL `SUMMARY_KEYS` are present at startup (against whatever summary structure it consumes); throws a descriptive error NAMING the missing key — NOT a silent zero (DIGEST-04). Vitest covers the throw path.
- **D-03:** Aggregation reads OPEN GitHub issues filtered by `e2e-nightly` + `e2e-quarantine` labels via `gh api` (issues are the persistence layer, DIGEST-01). Aggregates: findings count, classification breakdown table, top-3 failure categories, quarantine growth, cost vs cap.
- **D-04:** Output ≤50 lines total, aggregated only — NO per-iteration list. A line-count guard in the script asserts the rendered markdown ≤50 lines (DIGEST-04).

### Publish Path (Discussions vs Issue fallback)
- **D-05:** ACTIVE path is the `e2e-digest`-labeled Issue fallback (Discussions disabled, verified). The `gh api graphql createDiscussion` path is implemented but dormant.
- **D-06:** Single config flag `DIGEST_PUBLISH_MODE` env var (DIGEST-03): `auto` (default — probes `gh api repos/{repo} --jq .has_discussions`, picks discussion if true else issue), `discussion` (force), `issue` (force). The workflow sets it explicitly to `issue` for now.
- **D-07:** `e2e-digest` label self-bootstrapped in `e2e-weekly-digest.yml` via `gh label create e2e-digest --color <hex> --force` (mirrors the e2e-quarantine label-ensure step from Phase 36).
- **D-08:** The `gh api graphql` createDiscussion mutation (repo+category lookup → createDiscussion) is fully implemented behind the `discussion` branch. Vitest mock-gh tests cover BOTH branches so the dormant path is verified.

### Workflow + Committed Markdown
- **D-09:** `.github/workflows/e2e-weekly-digest.yml` — `schedule: cron '0 7 * * 1'` (Monday 07:00 UTC) + `workflow_dispatch` (manual testing). Permissions `contents: write` + `discussions: write` (DIGEST-02).
- **D-10:** Committed markdown path `reports/weekly-digest-YYYY-WNN.md` where `YYYY-WNN` is ISO year + ISO week number (e.g. `2026-W22`). Script computes ISO week deterministically.
- **D-11:** The workflow commits `reports/weekly-digest-*.md` in the same run via `contents: write` (git add + commit + push). Idempotent — overwrites the file if that week's digest already exists.
- **D-12:** Time window = prior 7 days (ISO week boundary). `quarantine growth` = count of `e2e-quarantine` issues opened in the window. `cost vs cap` = ledger `monthlyTotal` vs `HARD_CAP_USD` (100).

### Module Shape + Tests
- **D-13:** `scripts/weekly-digest.mjs` — CLI reusing the `gh` shellout pattern with injectable `ghClient` + `now` deps for unit-test isolation (Phase 33-36 injected-deps pattern). `npm run e2e:weekly-digest` script. `isMain` guard (WR-02 pattern).
- **D-14:** `tests/e2e/scripts/e2e-weekly-digest.test.js` mock-gh: fixture issue set → asserts (a) markdown has all 5 aggregations, (b) ≤50 lines, (c) missing-SUMMARY_KEY throw, (d) BOTH publish branches dispatched correctly per `DIGEST_PUBLISH_MODE`.
- **D-15:** cost-vs-cap reads the spend ledger via `llm-ledger.js::monthlyTotal` vs `HARD_CAP_USD` (100). Renders `$X.XX / $100 (Y%)`. If the ledger is absent (CI has no local ledger), render `cost data unavailable` gracefully — NOT a throw (the ledger is a local-only artifact).
- **D-16:** top-3 failure categories derived from `category`/errorClass labels on the filtered issues (the labels Phase 34/35 stamp). Tally by errorClass, sort desc, top 3, ties broken alphabetically for determinism.

### Claude's Discretion
- `e2e-digest` label color hex — planner picks (distinct from triage/e2e-nightly/e2e-quarantine).
- Exact markdown table formatting for the classification breakdown — planner picks; must stay within the ≤50-line budget.
- Whether the ISO-week computation uses a tiny inline helper or a date library — recommend inline (zero-new-dep lock); Node Date math suffices.
- The `gh` GraphQL category-id resolution approach for the dormant discussion path — planner picks; recommend querying `repository.discussionCategories` and matching by name.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` §"Phase 37: Weekly Analytics Digest"
- `.planning/REQUIREMENTS.md` §DIGEST (DIGEST-01..04)
- `.planning/research/SUMMARY.md` §"Phase 6" (weekly digest)
- `tests/e2e/lib/llm-report.js` — `SUMMARY_KEYS` export added here (D-01); existing `initLlmReport`/`finalizeLlmReport`/summary shape
- `tests/e2e/lib/llm-ledger.js` — `monthlyTotal`, `HARD_CAP_USD` (100) for cost-vs-cap (D-15)
- `scripts/e2e-report-issue.mjs` — `gh` shellout + label patterns; the issue-fallback publish reuses the `gh issue create --label` idiom
- `.github/workflows/e2e-nightly.yml` — analog for the new weekly workflow (label-ensure step, cron syntax, permissions, commit-in-run)
- `scripts/run-triage-pipeline.mjs` / `scripts/quarantine-append.mjs` — CLI shim + injected-deps analogs for weekly-digest.mjs

### Pre-locked decisions honored
- GitHub Discussion via `gh api graphql createDiscussion`; Issue with `e2e-digest` label fallback if Discussions disabled — VERIFIED disabled, fallback active (v3.1 pre-lock + STATE Phase 37 blocker note)
- Digest ≤50 lines, aggregated (DIGEST-04)
- `SUMMARY_KEYS` exported, validated (throws on missing, no silent zero)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/llm-report.js` — `SUMMARY_KEYS` export site (D-01); summary shape reference
- `tests/e2e/lib/llm-ledger.js::monthlyTotal` + `HARD_CAP_USD` — cost-vs-cap (D-15)
- `scripts/e2e-report-issue.mjs` — `gh` shellout, `makeRealGhClient`, label idioms, sanitizeCaseId
- `.github/workflows/e2e-nightly.yml` — cron + permissions + label-ensure + commit-in-run analog
- CLI shim + injected-deps pattern (rerun-validator/triage-classifier/quarantine-append/run-triage-pipeline)
- mock-gh + tmpDir Vitest pattern (Phase 33-36)

### Established Patterns
- Injected-deps pure-ish modules for unit-test isolation
- `gh` shellout via execSync/spawnSync with mock-gh in tests
- Label self-bootstrap (`gh label create --force`) in workflows
- ISO-date / run-id helpers computed inline (zero-new-dep lock)
- Graceful degradation when a local-only artifact (ledger) is absent in CI

### Integration Points
- `weekly-digest.mjs` ↔ `gh api` (read issues by label) + `gh issue create`/`gh api graphql` (publish)
- `weekly-digest.mjs` ↔ `llm-report.js::SUMMARY_KEYS` (validation) + `llm-ledger.js` (cost)
- `e2e-weekly-digest.yml` ↔ `weekly-digest.mjs` + `reports/weekly-digest-*.md` commit
- `e2e-weekly-digest.yml` ↔ `gh label create e2e-digest`

</code_context>

<specifics>
## Specific Ideas

- The user accepts D-05's issue-fallback-active determination (Discussions verified off).
- The user accepts D-06's `DIGEST_PUBLISH_MODE` single env-var flag.
- The user accepts D-08's full implementation + test of the dormant discussion path.
- The user accepts D-10's ISO-week filename + D-11's commit-in-same-run.
- The user accepts D-15's graceful "cost data unavailable" when the ledger is absent in CI (not a throw).

</specifics>

<deferred>
## Deferred Ideas

- **Roadmap-candidate auto-generation from top failure categories** (ROADMAP-01/02) — deferred per REQUIREMENTS.md "Future".
- **Real-time alerting (Slack/PagerDuty)** (ALERT-01) — deferred; weekly cadence is correct for v3.1.
- **Enabling GitHub Discussions on the repo** — admin/org action, not code; once enabled, flip `DIGEST_PUBLISH_MODE` to `auto`/`discussion`.

</deferred>

---

*Phase: 37-weekly-analytics-digest*
*Context gathered: 2026-05-28*

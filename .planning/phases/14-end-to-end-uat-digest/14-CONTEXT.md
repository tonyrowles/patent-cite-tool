# Phase 14: End-to-End UAT + Digest - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The milestone-closing phase for v6.1. Two deliverables:

1. **DGST-01 (code):** Extend the existing Monday weekly digest (`scripts/weekly-digest.mjs`)
   with a **`BUG_REPORTS` section** — report volume, classification breakdown, and
   promotion/PR/merged/stuck counts — so the maintainer sees v6.1 auto-fix funnel health
   alongside the existing E2E + Auto-Fix Pipeline metrics.

2. **UAT-01..03 (live validation):** Prove the whole v6.1 pipeline works end-to-end against
   production — a seeded `BUG_REPORTS` record is triaged → promoted → LLM produces a fix →
   regression gate passes → maintainer merges → auto-promote closes the Issue, with ledger
   entries recorded (UAT-01); the manual-promote escape hatch is exercised live (UAT-02);
   and post-milestone the 75-case golden corpus passes 100% with the monthly ledger cap
   confirmed enforced (UAT-03).

**Split of who does what (D-08):** the EXECUTOR ships DGST-01 + its unit tests and authors a
single consolidated **`14-HUMAN-UAT.md`** runbook; the live merge-to-`main` chain is the
human operator's (real LLM spend + permanent human-merge gate cannot be automated in-session).

**Locked upstream (not re-litigated — see prior CONTEXT files):**
- Fix surface is `src/shared/` matching core only; human merge gate is a permanent invariant.
- `workflow_dispatch`-only across triage / fix / auto-promote (no cron auto-fire, no
  `pull_request:closed` restored — Phase 13 D-01).
- "Fires after merge" = operator dispatch of `v40-auto-promote.yml` (Phase 13 D-01).
- `wrangler --remote` is mandatory for any production KV read (memory:
  [[project_wrangler_kv_needs_remote_flag]]).
- All LLM spend routes through `safeAppendLedger` / `invokeAnthropicSdkWithLedger`
  (`source:'report-fix-api'` / `'report-triage'`); monthly soft/hard cap enforced pre-call.

**Not in scope (deferred / never):**
- KV-sourced report volume in the digest (rejected — see D-01 / Deferred).
- Re-enabling autonomous exploration or cron-driven triage/fix (v2: AUTO-01, LTRI-01).
- Any change to `runPromote` / `promote-from-quarantine.mjs` internals (DO NOT MODIFY).
- New digest metrics beyond DGST-01's named four (volume / classification / promotion-funnel).

</domain>

<decisions>
## Implementation Decisions

### DGST-01 data source (DGST-01)
- **D-01:** **GitHub-derived only — no Cloudflare/wrangler creds in the digest workflow.**
  The Monday `e2e-weekly-digest.yml` cron runs with **only `GITHUB_TOKEN`**; the BUG_REPORTS
  section sources all numbers from `gh` (issues + PRs + labels), reusing the exact pattern the
  existing Auto-Fix Pipeline section already uses (`fetchAutoFixPrs` via `gh search prs`,
  `listOpenIssuesByLabel` via `gh api`). **No new secret surface, no `wrangler` dependency in
  the cron.**
- **D-02:** **Accept the promoted-funnel limitation explicitly.** GitHub only sees reports that
  were *promoted* to `report-fix-candidate` Issues — raw intake volume and the
  noise/user_error/duplicate/ambiguous breakdown that never became an Issue are **not**
  visible to a GitHub-only source. The section therefore measures the **promoted auto-fix
  funnel**, not raw report intake. Label the section/rows honestly so a reader does not mistake
  "promoted reports" for "total reports received." (Raw-intake volume is the rejected KV path —
  see Deferred.)
- **D-03:** **Metric set, GitHub-derived:** report volume = count of `report-fix-candidate`
  Issues (open + closed in window); classification/funnel = promoted Issues, open
  `auto-fix/<fp-short>` PRs, merged fix PRs, `auto-fix-stuck`-labeled Issues, and
  `human-review-required` (overfit) PRs. Exact label set + window (mirror the existing
  section's "last 7 days" / monthly framing) at planner discretion, but every count must map
  to a label/state actually observable via `gh`.

### DGST-01 section shape & failure mode (DGST-01)
- **D-04:** **Mirror `renderAutoFixPipelineSection` exactly.** A new pure-function
  `renderBugReportsSection(...)` emitting a `<details><summary>Bug Reports</summary>` collapsible
  with **locked-order metric rows**, assembled in `runDigest` **after `renderDigest` returns**
  (so the ≤50-line budget at `weekly-digest.mjs:290` is preserved) and **before the file
  write**. Same injected-deps seam as `fetchAutoFixPrs` for Vitest determinism.
- **D-05:** **Degrade to `n/a`, do NOT hard-throw.** A `gh` fetch failure for the bug-report
  data follows the Auto-Fix section's contract: errors RETURNED (not thrown), a single
  `process.stderr.write` warning in `runDigest`, and the section degrades to `n/a` rows while
  the rest of the digest still ships. (Distinct from the *main* digest's silent-zero refusal,
  which hard-throws — that stays as-is for the core findings count.)

### Live-UAT stimulus & guardrails (UAT-01, UAT-02)
- **D-06:** **Seed a synthetic broken-patent report through the real `POST /report` path.**
  The live UAT stimulus is a deliberately-citation-failing report for a **throwaway/test
  patent**, submitted via the genuine production intake path (as a real user would), then
  driven through the whole chain. Controlled, repeatable, and unmistakably a test record.
  **The runbook MUST include a documented revert plan** for the `main` + golden-corpus
  mutation the live merge produces, and a **spend-confirmation step** (check monthly ledger
  headroom before the LLM call).
- **D-07:** **This is a one-time UAT fixture, NOT a revival of the retired synthetic machinery.**
  The v6.1 milestone retired the v4.3 fixture-mutator / synthetic-issue *injection
  architecture* (an autonomous cron fabricating GitHub Issues as the operating signal). A
  single manual seed of one real KV report purely to validate the pipeline end-to-end is a
  **test fixture**, not a reintroduction of that architecture — the inbound signal model
  remains "human bug reports only." Call this distinction out in the runbook so it does not
  read as contradicting the retirement decision ([[project_v43_paused_for_bug_report]]).
- **D-08:** **UAT-02 (manual-promote) exercises `ingest-reports.mjs promote <fp> <ts>` live**
  on a report that triage would NOT auto-promote (e.g. an `ambiguous`/below-threshold seed),
  proving the escape hatch forces it through the full pipeline. Whether UAT-02 reuses the
  UAT-01 seed or uses a second seed is a runbook detail (planner/operator discretion), as long
  as it demonstrably bypasses the auto-promote status filter.

### Phase deliverable boundary (DGST-01 + UAT-01..03)
- **D-09:** **Executor ships code + ONE consolidated `14-HUMAN-UAT.md`.** The runbook folds
  UAT-01/02/03 **and the 5 deferred live-CI behaviors from `12-HUMAN-UAT.md`** into a single
  operator-dispatchable document (so the milestone has one place to run the live chain). UAT-03's
  **corpus-clean (`npm test` → golden 100%)** and **ledger-cap-enforced** checks run **in-session
  where they don't need live GitHub Actions** (the static/local half); the live merge-driven half
  stays in the runbook. Matches how Phases 5 and 12 closed.

### Claude's Discretion
- The new section's exact function name (`renderBugReportsSection` assumed), the precise
  locked row order/labels, and the `gh` query shape — provided D-01 (GitHub-only), D-04
  (post-`renderDigest`, `<details>`, injected-deps seam), and D-05 (degrade-to-`n/a`) hold.
- Whether the section reuses the already-fetched `fetchAutoFixPrs` PR set (those PRs carry the
  `<!-- source_issue: N -->` marker + `auto-fix:*` labels) or issues an additional `gh` query
  for `report-fix-candidate` Issues — either is fine if it stays GitHub-only and single-source
  for any shared number.
- Runbook structure, the exact throwaway patent chosen for the seed, and whether UAT-01/UAT-02
  share one seed — as long as D-06's revert-plan + spend-confirmation guardrails are present.
- Which UAT-03 sub-checks run in-session vs. land in the runbook (the local `npm test` +
  ledger-cap assertion can run now; anything needing a live Actions run / merge cannot).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 14: End-to-End UAT + Digest" — goal + the milestone "Key
  locked decisions" block + the hard dependency chain (Phase 14 is the terminal node).
- `.planning/REQUIREMENTS.md` — **DGST-01** (line 74), **UAT-01..03** (lines 78-80); the v2
  deferred reqs (PDFCTX/LTRI/AUTO, lines 84-95) are explicitly NOT this phase.
- `.planning/PROJECT.md` — milestone goal + the "Retire the autonomous machinery" constraint
  (informs D-07's synthetic-fixture distinction).

### DGST-01 edit site (the code deliverable)
- `scripts/weekly-digest.mjs` — `runDigest` orchestrator (the BUG_REPORTS section is assembled
  here, after `renderDigest` at the step-6.5 site, ~lines 470-500); `renderAutoFixPipelineSection`
  (lines 576-711) is the **structural template to mirror** (D-04); `fetchAutoFixPrs`
  (lines 759-781) is the **injected-deps / errors-returned template** (D-05); the ≤50-line
  budget guard lives in `renderDigest` at line 290 (the new section must stay OUTSIDE it).
- `.github/workflows/e2e-weekly-digest.yml` — the Monday cron (`schedule: 0 7 * * 1` +
  `workflow_dispatch`); runs with **only `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`** — the
  fact that anchors D-01 (no CF creds available here).
- `tests/e2e/scripts/e2e-weekly-digest.test.js` + `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js`
  — existing digest unit + YAML-contract tests; the new section's tests follow this style.

### Pipeline under test (for the UAT runbook)
- `scripts/ingest-reports.mjs` — triage entry point; `promote <fp> <ts>` subcommand is the
  UAT-02 escape hatch (D-08); reads KV via `review-reports.mjs` (`wrangler --remote`).
- `scripts/review-reports.mjs` — production KV I/O helper (`--remote` mandatory) — used to
  seed/inspect the UAT record.
- `.github/workflows/v61-report-fix.yml` — the report-fix workflow (KV fetch → LLM → draft PR
  on `auto-fix/<fp-short>`; emits `<!-- source_issue: N -->` marker per Phase 13 D-04).
- `.github/workflows/v40-verifier-gate.yml` — required-status gate on `auto-fix/*` PRs
  (ruleset 17086676; job name `verifier-gate:` unchanged).
- `.github/workflows/v40-auto-promote.yml` — post-merge promote (operator-dispatched per
  Phase 13 D-01); `assertTripleGate` Leg 3 now OR-accepts `report-fix-candidate` (GATE-05).
- `scripts/auto-fix-promote.mjs` — `assertTripleGate` (trust-critical; do not modify here).

### Regression corpus + ledger (UAT-03)
- `tests/test-cases.js` + `tests/golden/baseline.json` — the 75/76-case golden corpus
  (`npm test` → 100% is the UAT-03 corpus-clean check).
- `tests/e2e/lib/llm-ledger.js` — `monthlyTotal`, `HARD_CAP_USD`, `LEDGER_PATH`,
  `combinedMonthlyTotalByTransport` (the cap-enforcement assertion for UAT-03).

### Deferred live behaviors to fold in (D-09)
- `.planning/phases/12-fix-generation-regression-gate/12-HUMAN-UAT.md` — the 5 pending
  live-CI behaviors (Issue-label→draft-PR, overfit soft-flag, 3-iteration exhaustion,
  D-06 idempotency, verifier-gate binding) consolidated into `14-HUMAN-UAT.md`.

### Prior phase context
- `.planning/phases/13-triple-gate-extension/13-CONTEXT.md` — auto-promote wiring + operator
  dispatch model (D-01..D-05) the live UAT exercises.
- `.planning/phases/12-fix-generation-regression-gate/12-CONTEXT.md` — fix-flow shape
  (dispatcher, draft PR, ledger split, overfit soft-flag) the UAT validates.
- `.planning/phases/11-triage-layer/11-CONTEXT.md` — triage + promote + post-fix suppression
  the UAT-01/02 stimulus flows through.

### Memory (background — verify before relying)
- [[project_wrangler_kv_needs_remote_flag]] — `--remote` mandatory for the UAT seed/inspect KV reads.
- [[project_v43_paused_for_bug_report]] — the retirement context behind D-07's fixture distinction.
- [[project_webapp_deploy_gotchas]] — `wrangler` runs from `worker/`.
- [[project_milestone_vs_store_tag_collision]] — judge "merged?" by diffing `origin/main`, not local main (relevant to UAT-01's merge verification).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `renderAutoFixPipelineSection` (`weekly-digest.mjs:576`) — the exact `<details>` +
  locked-row + NaN-guard template the BUG_REPORTS section mirrors (D-04).
- `fetchAutoFixPrs` (`weekly-digest.mjs:759`) — already fetches `auto-fix:*`-labeled PRs with
  `number,state,mergedAt,createdAt,labels,body` via `gh search prs`; its PR set + the
  `<!-- source_issue: N -->` marker may directly feed the new section's PR/merged counts.
- `makeRealGhClient.listOpenIssuesByLabel` (`weekly-digest.mjs:306`) — `gh api` issue fetch by
  label (the template for a `report-fix-candidate` issue query, if added).
- `ingest-reports.mjs promote` — the UAT-02 manual-promote escape hatch, already built.

### Established Patterns
- **Section appended outside the ≤50-line budget** — both the Auto-Fix and (now) BUG_REPORTS
  sections are concatenated in `runDigest` after `renderDigest` returns; the budget guard only
  governs the core body.
- **Errors-returned-not-thrown for optional sections** (D-15 contract from Phase 55) — the
  fetch helper returns `{..., error}`; `runDigest` emits ONE stderr warning and degrades the
  section to `n/a` (D-05). The *main* digest hard-throws on gh failure (silent-zero refusal) —
  that asymmetry is intentional and preserved.
- **Injected-deps seam for Vitest determinism** — production omits the `execFn`/`ghClient` arg;
  tests pass a fake. The new section follows suit.
- **GitHub-authoritative funnel** — promotion/merge state is read from labels + merge state,
  never reconstructed from KV (consistent with D-01 and the existing auto-fix section).

### Integration Points
- New `renderBugReportsSection` ← `gh`-fetched issues/PRs (GitHub-only, D-01) → appended to
  `finalMd` in `runDigest` before the file write + publish.
- UAT stimulus: seeded `POST /report` → `BUG_REPORTS` KV → `ingest-reports.mjs` →
  `report-fix-candidate` Issue → `v61-report-fix.yml` → draft PR → `v40-verifier-gate.yml` →
  human merge → operator-dispatched `v40-auto-promote.yml` → Issue close + ledger entries.

</code_context>

<specifics>
## Specific Ideas

- The BUG_REPORTS section measures the **promoted funnel**, not raw intake — this is a
  deliberate, named limitation of the GitHub-only source (D-02), not a gap to fix. Raw-intake
  volume would require CF creds in the cron (rejected).
- The live UAT seed must traverse the **real `POST /report` intake path** (not a direct KV
  write) so it proves the genuine end-to-end chain, and must be visibly a **throwaway/test
  patent** with a revert plan for the golden mutation (D-06).
- `14-HUMAN-UAT.md` is the single consolidated runbook for the whole milestone's live
  validation (folds Phase-12's 5 deferred behaviors) — one operator-dispatchable document
  (D-09), mirroring the `47-UAT-DEFERRED.md` / `12-HUMAN-UAT.md` precedent.
- UAT-03 splits: the **local** half (`npm test` golden 100% + ledger-cap assertion) can run
  in-session; the **live** half (cap enforced across real Actions invocations) lands in the
  runbook.

</specifics>

<deferred>
## Deferred Ideas

- **KV-sourced raw-intake report volume + full classification breakdown in the digest** —
  rejected for this phase (D-01) because it requires adding Cloudflare creds to the Monday
  cron and a `wrangler --remote` dependency. Could be revisited if a future digest gains CF
  access; would give true intake volume + noise/duplicate/ambiguous breakdown the GitHub-only
  source cannot see.
- **Hybrid GitHub + KV digest source** — considered and rejected (most moving parts + new
  secret surface) for the same reason.
- v2 deferred milestone reqs (not introduced here): PDF-context in fix prompts (PDFCTX-01),
  LLM triage of `ambiguous` reports (LTRI-01), nightly-cron ingestion (AUTO-01), auto-quarantine
  of promoted-but-un-goldenized reports (AUTO-02).

None of the above are folded into Phase 14.

</deferred>

---

*Phase: 14-end-to-end-uat-digest*
*Context gathered: 2026-06-18*

# Phase 11: Triage Layer - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the report-intake + triage layer: a single maintainer command
(`scripts/ingest-reports.mjs`, run **`workflow_dispatch`-only**) that reads the
production `BUG_REPORTS` KV namespace via `wrangler --remote`, **heuristically**
(no LLM) classifies each report into one of
`{real_bug, noise, duplicate, user_error, infrastructure, ambiguous}`, auto-
or manually-promotes real bugs into `report-fix-candidate` GitHub Issues,
writes a `_review.status` marker back to KV for idempotency, and emits a durable
per-run triage-report JSON artifact.

Delivers requirements **ING-01..04, TRI-01..07, PROMO-01..04** (15 reqs).

**Not in scope (later phases):**
- LLM fix generation, `REPORT_FIX_SCAFFOLD` prompt body, `v61-report-fix.yml`,
  diff-guard, regression gate, draft PR (Phase 12 — FIX/GATE/COST).
- `assertTripleGate` Leg-3 extension + auto-promote wiring (Phase 13 — GATE-05).
- Weekly-digest `BUG_REPORTS` section + live end-to-end UAT (Phase 14 — DGST/UAT).
- Any change to the `src/shared/` matching core (that is Phase 12's fix surface).

</domain>

<decisions>
## Implementation Decisions

These five decisions were resolved in discussion. The structural choices below
(categories, auto-promote signals, command shape, `workflow_dispatch`-only,
`wrangler --remote`, manual-promote escape hatch) are **already locked** by
REQUIREMENTS.md / STATE.md and are not re-litigated here.

### Golden-corpus conflict policy (TRI-03 ↔ TRI-04)
- **D-01:** **Golden-corpus presence does NOT block promotion.** A golden case
  proves correctness for one *specific test selection* only; a user reporting
  `inaccurate_citation` on a golden patent almost always highlighted a different
  passage. Apply the normal auto-promote signals regardless of golden membership.
- **D-02:** When a promoted report's patent IS in the golden corpus, record
  `"patent in golden corpus — protect the existing golden case"` in the triage
  rationale and carry that note into the GitHub Issue body, so the Phase 12 fix
  step knows the new fix must not regress the existing golden selection.
- **D-03:** (Unchanged from TRI-03) Quarantine-corpus membership remains a
  positive auto-promote signal — no conflict to resolve there.

### Idempotency source of truth (ING-03, ING-04)
- **D-04:** **The GitHub Issue is the authoritative dedup signal.** Dedup by
  querying GitHub for an existing `report-fix-candidate` Issue carrying this
  report's `<!-- kv-key: report:{fp}:{ts} -->` pointer (the durable downstream
  artifact). The KV `_review.status` write-back is a fast-path / audit marker,
  not the source of truth.
- **D-05:** **Ordering: find-or-create the Issue FIRST, then write the KV
  `_review.status`.** On partial failure (Issue created but KV write fails), the
  next run re-finds the Issue by its `kv-key` marker, skips re-creation, and
  re-attempts the KV write — self-healing, no duplicate Issues.
- **D-06:** **Reuse the existing `review-reports.mjs` status vocabulary**
  (`open|reviewed|triaged|resolved|wontfix`) rather than extending the enum or
  adding a sub-key. Map automated outcomes: promoted → **`triaged`**, skipped
  (noise / user_error / infrastructure) → **`wontfix`**. ING-04's "every
  processed record gets a status" is satisfied with this shared `_review.status`
  field; the current digest renders it unchanged. (Note: ingest and human edits
  write the same field — manual promote (PROMO-02) bypasses the status check so
  a `wontfix` record can still be force-promoted.)

### Post-fix suppression (TRI-06)
- **D-07:** **Detect "already fixed" by querying GitHub** for a merged
  `auto-fix/*` PR or a closed `report-fix-candidate` Issue whose body references
  the report's `patentNumber`. Consistent with the GitHub-authoritative dedup
  (D-04); no new persisted ledger to maintain.
- **D-08:** **Suppression window = 30 days, env-configurable** (same pattern as
  `duplicate_count` threshold / `MAX_FIXES_PER_RUN`). Suppress only if a fix for
  this patent merged within the last 30 days; a report arriving later is treated
  as a *fresh* signal (it may be a genuinely different bug on the same patent)
  and is allowed to promote.

### Issue-filer reuse vs rebuild (PROMO-01)
- **D-09:** **Extract the reusable GitHub plumbing into a shared helper; write a
  fresh report-domain classifier + Issue-body builder.** Lift the gh-client
  plumbing from `scripts/e2e-report-issue.mjs` — `createIssueWithLabels`, the
  hidden-comment dedup find (`findMatchingIssue` pattern, retargeted from
  `<!-- fingerprint: -->` to `<!-- kv-key: report:{fp}:{ts} -->`), `--paginate`
  issue listing, and the label shell-escaping — into a shared module both filers
  import. Do NOT reuse the E2E-case-specific fingerprint helpers or body
  builders (`buildIssueBody`/`buildIssueTitle`) — reports already carry a
  fingerprint and need a report-shaped body.
- **D-10:** The Issue body is a **human-readable summary, not a raw KV dump**
  (PROMO-01): patent number, category, confidenceTier, returnedCitation, the
  classification + rationale, golden/quarantine membership note (D-02), the
  `note` (if present), and the `<!-- kv-key -->` pointer. Omit `selectionText`
  if absent from the KV record (privacy — opted-out reports never re-fetch).

### Triage-report artifact (TRI-07)
- **D-11:** **Persist the per-run triage-report JSON as a `workflow_dispatch`
  run artifact** (`actions/upload-artifact`, ~90-day retention). Local CLI runs
  write to a gitignored path + stdout. **No commit to `main`** — STATE.md locks
  "the two-commit ledger split is the ONLY permitted direct push to `main`," so
  committing a triage report to main would violate that invariant.
- **D-12:** Durability of the audit trail is provided by the combination of
  GitHub Issues (permanent, for promoted reports) + KV `_review.status`
  (for all processed reports). The JSON artifact is the per-run audit snapshot,
  one entry per processed report (fingerprint, classification, rationale,
  promotion decision, `promotion_source: 'auto' | 'manual'`).

### Claude's Discretion
- Exact `ingest-reports.mjs` subcommand/flag surface beyond the locked
  `list` (default) + `promote <fp> <ts>` shape, and the precise shared-helper
  module name/location for the extracted gh plumbing (D-09).
- Whether the extracted gh helper lives under `scripts/` or `tests/e2e/lib/`,
  as long as both filers can import it and the purity/guard tests stay green.
- Exact triage-rationale string format and the named heuristic rule identifiers
  (TRI-02 requires each rule be named + Vitest-pinned — naming is at discretion).
- Env-var names for the suppression window (D-08) and any new thresholds,
  following the existing `duplicate_count` / `MAX_FIXES_PER_RUN` convention.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 11: Triage Layer" — goal, depends-on (Phase 10),
  5 success criteria, the 15 requirement IDs
- `.planning/REQUIREMENTS.md` — ING-01..04, TRI-01..07, PROMO-01..04 (+ the
  "Scope decisions" block: heuristic-only triage, dup≥3 default, workflow_dispatch-only)
- `.planning/STATE.md` — "Key Locked Decisions (v6.1)" + "Permanent Invariants"
  + "Bypass Conventions" (human-gate invariant, two-commit ledger split = ONLY
  permitted push to `main`, `wrangler --remote` mandatory)

### Reuse targets (read before writing new code)
- `scripts/review-reports.mjs` — **ING-02 reuse target.** Exported pure fns:
  `getNamespaceId`, `parseSince`, `reviewStatus`, `filterReports`, `sortReports`,
  `formatDigest`, `parseArgs`. KV I/O (`loadReports`, `writeStatus`, `wrangler`,
  `listReportKeys`, `getRecord`) is currently **module-private** — ingestion must
  reuse it (export it or refactor into a shared module), not reimplement the
  wrangler shell-out. `REVIEW_STATES = open|reviewed|triaged|resolved|wontfix`.
  `_review = { status, at }` write-back shape preserves original TTL/expiration.
- `scripts/e2e-report-issue.mjs` — **D-09 gh-plumbing source.** Reusable:
  `createIssueWithLabels`, `findMatchingIssue` (hidden-comment dedup),
  `--paginate` listing, `makeRealGhClient`, label shell-escaping. NOT reusable:
  `fingerprint`, `topOfStackHash*`, `buildIssueBody`, `buildIssueTitle`,
  `filterCasesForFiling` (all E2E-case-specific).
- `src/shared/report-payload-builder.js` — **TRI-02 input shape.** `buildReportPayload`
  output fields: `category`, `patentNumber`, `patentUrl`, `selectionText`? (absent
  when opted out), `returnedCitation`, `confidenceTier` (string `green|yellow|red`),
  `pdfParseStatus`, `errorLog`, `note`, + diagnostics. NOTE: `duplicate_count` is
  added server-side by the Worker on dedup, NOT by the builder — it is present on
  the KV record but not in `buildReportPayload` output.
- `src/shared/constants.js` — `REPORT_CATEGORIES = [inaccurate_citation, no_match,
  tool_not_working, other]` (frozen); `WORKER_REPORT_URL`.

### Corpus cross-check (TRI-04)
- `tests/test-cases.js` + `tests/golden/baseline.json` — golden corpus (75/76 cases)
- `tests/e2e/test-cases-quarantine.js` — quarantine corpus

### v6.1 milestone research (context / pitfalls)
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`
  (pipeline shape), `.planning/research/PITFALLS.md` (ledger leak, bypass-merge,
  wrangler-local-default landmines)

### Prior phase context
- `.planning/phases/10-retirement-scaffolding/10-CONTEXT.md` — what was retired;
  `REPORT_FIX_SCAFFOLD` stub location (`tests/e2e/lib/fix-prompt-builder.js`)

### Memory (background — verify before relying)
- `project_wrangler_kv_needs_remote_flag` — wrangler v4 `kv key get/list` reads
  LOCAL miniflare by default; `--remote` mandatory or reads false-empty `[]`
- `project_webapp_deploy_gotchas` — `wrangler` runs from `worker/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/review-reports.mjs`: KV read/filter/sort/status-write plumbing already
  exists and is the mandated ING-02 base. Pure fns are exported; I/O fns need to
  be made importable (export or extract to shared module).
- `scripts/e2e-report-issue.mjs`: gh-client plumbing (D-09) — extract the
  GitHub-side functions into a shared helper, retarget the dedup marker to
  `<!-- kv-key: report:{fp}:{ts} -->`.
- `src/shared/report-payload-builder.js`: defines the real report shape — TRI-02
  Vitest tests MUST feed `buildReportPayload()` output, not fabricated objects.

### Established Patterns
- **`wrangler --remote` mandatory** on every `kv key list/get/put` (run from
  `worker/`) — enforced by a triage-layer Vitest grep assertion (STATE.md invariant).
- **Env-configurable thresholds** (`duplicate_count` dup-threshold,
  `MAX_FIXES_PER_RUN`) — follow for the 30-day suppression window (D-08).
- **Hidden-HTML-comment dedup marker** in Issue bodies (v3.1 `findMatchingIssue`).
- **Per-run audit artifacts uploaded to the Actions run** (v3.1 `triage-report.json`
  precedent under `tests/e2e/artifacts/`).
- **`workflow_dispatch`-only** trigger for triage/ingestion (PROMO-04) — no cron.

### Integration Points
- Reads: production `BUG_REPORTS` KV (via `worker/wrangler.toml` namespace id).
- Writes: KV `_review.status` per record; GitHub Issues labeled
  `report-fix-candidate`; the per-run triage-report artifact.
- Downstream: Phase 12's `v61-report-fix.yml` triggers on the
  `report-fix-candidate`-labeled Issues this phase creates — the Issue body
  format + label convention is a **load-bearing contract** for Phase 12
  (STATE.md). Keep it stable.

</code_context>

<specifics>
## Specific Ideas

- TRI-02 is a hard constraint: every named heuristic rule must be pinned by a
  Vitest test that uses **real `buildReportPayload()` output** as input. Build the
  classifier as pure functions over the KV-record shape so tests are trivial.
- Idempotency must be proven by an actual second-run test (success criterion #3):
  re-running on the same report set creates no duplicate Issues.
- The Issue body is for humans (success criterion #2) — readable summary, not a
  JSON dump; `selectionText` omitted when the user opted out (privacy carry-over
  from v5.0).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Adjacent items already deferred by
the milestone (not introduced here): LLM triage for `ambiguous` reports (v2
LTRI-01), nightly cron trigger (v2 AUTO-01), auto-append promoted-but-ungoldened
patents to quarantine (v2 AUTO-02), and Worker-route bug fixes
(`tool_not_working` → classified `infrastructure`, deferred to v6.2).

</deferred>

---

*Phase: 11-triage-layer*
*Context gathered: 2026-06-17*

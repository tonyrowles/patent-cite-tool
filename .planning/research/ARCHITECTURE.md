# Architecture Research

**Domain:** LLM triage-and-quarantine feedback loop layered on top of a Playwright E2E testing infrastructure
**Researched:** 2026-05-22
**Confidence:** HIGH — all components are directly inspected from the existing codebase; no external research required

---

## Standard Architecture

### System Overview

```
LOCAL DEVELOPER MACHINE (subscription-budget gated)
┌──────────────────────────────────────────────────────────────────┐
│  scripts/e2e-explore.mjs                                          │
│    claude -p (Max 5 subscription, 10-step runOneIteration loop)  │
│         │                                                         │
│         ▼                                                         │
│  tests/e2e/artifacts/{run_id}/llm-report.json  ←── written here  │
└────────────────────────┬─────────────────────────────────────────┘
                         │  committed to branch OR uploaded as
                         │  GitHub Actions artifact
                         ▼
GITHUB ACTIONS NIGHTLY CRON (e2e-nightly.yml)
┌──────────────────────────────────────────────────────────────────┐
│  (existing) smoke → regression.spec.js → fault-injection.spec.js │
│                                                                   │
│  (new v3.1 steps, sequential, after regression)                  │
│                                                                   │
│  [1] lib/rerun-validator                                          │
│       reads llm-report.json iterations where classification =     │
│       VERIFIER_DISAGREE or WRONG_CITATION                         │
│       runs verifyCitation() deterministically (no Playwright)    │
│       writes rerun-report.json (reproducibility verdict per case) │
│         │                                                         │
│  [2] lib/triage-classifier                                        │
│       reads rerun-report.json + llm-report.json row              │
│       applies rule-based heuristics first (most cases decided)   │
│       sends ambiguous remainder to claude -p second-pass          │
│       writes triage-report.json (classification + confidence)    │
│         │                                                         │
│  [3] lib/issue-payload-builder                                    │
│       reads triage-report.json (actionable cases only)           │
│       assembles rich issue body (reproducer + verifier + snippet) │
│         │                                                         │
│  [4] scripts/e2e-report-issue.mjs (extended) OR new filer        │
│       dedup fingerprint → create/comment GitHub issue            │
│         │                                                         │
│  [5] tests/e2e/quarantine.spec.js corpus append script           │
│       adds confirmed anomalies to test-cases-quarantine.js       │
│         │                                                         │
│  [6] quarantine.spec.js (non-gating Playwright project)          │
│       runs the quarantine corpus; uploads separate report         │
│                                                                   │
│  WEEKLY DIGEST JOB (separate cron, reads GitHub issue labels)    │
│  ─────────────────────────────────────────────────────────────── │
│  reads: open issues with e2e-nightly label via gh api            │
│  computes: counts by errorClass label, quarantine growth metric  │
│  writes: new GitHub Issue (type: analytics-digest) OR Discussion │
└──────────────────────────────────────────────────────────────────┘

PERSISTENCE LAYER (artifact uploads + test-cases-quarantine.js)
┌──────────────────────────────────────────────────────────────────┐
│  tests/e2e/artifacts/{run_id}/                                    │
│    report.json          (deterministic regression)               │
│    llm-report.json      (exploratory mode; local-only origin)    │
│    rerun-report.json    (new; reproducibility verdicts)          │
│    triage-report.json   (new; triage classifications)            │
│    *.png / *.html       (screenshots + DOM snapshots)            │
│                                                                   │
│  tests/e2e/test-cases-quarantine.js   (promoted anomaly corpus)  │
│  tests/golden/baseline.json           (existing, no change)      │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Communicates With |
|-----------|--------|----------------|-------------------|
| `scripts/e2e-explore.mjs` | EXISTING | LLM exploratory runner (local-only); writes llm-report.json | `lib/llm-driver.js`, `lib/llm-report.js`, `lib/llm-ledger.js`, `lib/pdf-verifier.js` |
| `tests/e2e/lib/llm-report.js` | EXISTING | Append-only writer for llm-report.json iterations | Called by e2e-explore.mjs only |
| `tests/e2e/lib/pdf-verifier.js` | EXISTING | Independent PDF re-parse oracle; produces Verdict objects | Called by regression.spec.js AND rerun-validator |
| `tests/e2e/lib/report.js` | EXISTING | Append-only writer for regression report.json | Called by regression.spec.js |
| `scripts/e2e-report-issue.mjs` | EXISTING (EXTEND) | Fingerprint-based dedup GitHub issue filer | gh CLI, reads report.json |
| `tests/e2e/lib/rerun-validator.js` | NEW | Deterministic replay of each LLM-flagged anomaly via verifyCitation(); confirms reproducibility | `lib/pdf-verifier.js` (calls verifyCitation), reads llm-report.json, writes rerun-report.json |
| `tests/e2e/lib/triage-classifier.js` | NEW | Pure data in/out classifier: takes one iteration row → classification object; heuristic-first then LLM second-pass for ambiguous | reads rerun-report.json rows, calls `lib/llm-driver.js` invokeClaudeP for ambiguous pass |
| `tests/e2e/lib/issue-payload-builder.js` | NEW | Assembles rich issue body: reproducer seed, verifier disagreement detail, LLM rationale, golden diff | reads triage-report.json + llm-report.json, calls `lib/pdf-snippet.js` for PDF crops |
| `scripts/quarantine-append.mjs` | NEW | Idempotent script to insert confirmed anomalies into test-cases-quarantine.js | reads triage-report.json, writes/appends tests/e2e/test-cases-quarantine.js |
| `tests/e2e/specs/quarantine.spec.js` | NEW | Playwright spec for the quarantine corpus; non-gating; separate Playwright project; writes quarantine-report.json | reads test-cases-quarantine.js, uses existing lib/ primitives |
| `tests/e2e/test-cases-quarantine.js` | NEW | Tiered corpus of anomalies not yet promoted to golden | written by quarantine-append.mjs, read by quarantine.spec.js |
| `scripts/weekly-digest.mjs` | NEW | Reads open GitHub issues by label; computes counts by errorClass tag; files a digest issue | gh CLI (gh api /issues), reads no local files |

---

## Data Flow: llm-report.json Ingestion

The critical design question is how `llm-report.json` (produced locally) reaches the nightly CI cron.

**Recommended pattern: GitHub Actions artifact upload, consumed by a separate triggered workflow run.**

Rationale:

1. Committing llm-report.json to a branch creates repo clutter, merge conflicts between developer runs, and encodes ephemeral test data in git history. It also requires write permissions that the nightly workflow should not have for arbitrary branches.

2. S3/external storage adds infrastructure dependencies the project explicitly avoids (Cloudflare KV is sufficient for the extension; test reporting should not need a separate storage service).

3. The cleanest pattern matching the existing CI model: the developer runs `npm run e2e:explore`, then explicitly uploads the resulting `tests/e2e/artifacts/{run_id}/llm-report.json` as a named artifact via `gh run upload-artifact` (or a helper script). The nightly workflow, when triggered manually with a `llm_run_id` input, downloads that artifact and runs the triage pipeline against it.

**Concrete flow:**

```
[local]
npm run e2e:explore
  → tests/e2e/artifacts/{run_id}/llm-report.json

gh workflow run e2e-nightly.yml \
  -f llm_run_id={run_id}
  [or: developer manually uploads artifact, then triggers]

[CI - e2e-nightly.yml, new inputs block]
  inputs:
    llm_run_id: (optional) artifact run_id containing llm-report.json

Step: Download llm-report.json artifact
  if: inputs.llm_run_id is set
  uses: actions/download-artifact@v4
  with:
    run-id: ${{ inputs.llm_run_id }}
    name: llm-exploratory-{run_id}
    path: tests/e2e/artifacts/{run_id}/

Step: Run rerun-validator
  if: llm-report.json present
  node scripts/run-triage-pipeline.mjs
    → rerun-report.json
    → triage-report.json
    → calls quarantine-append.mjs
    → calls e2e-report-issue.mjs (extended)

Step: Run quarantine spec (non-gating)
  npx playwright test --project quarantine

Step: Upload all artifacts (always)
```

The nightly regression continues to run unconditionally. The triage pipeline runs only when `llm_run_id` is provided. This keeps the nightly cron's existing behavior unmodified and avoids coupling the triage pipeline to a schedule that cannot guarantee an llm-report.json is present.

**Alternative considered and rejected: always run triage on the previous night's committed report.** This would require committing llm-report.json on a `data/llm-reports` branch. The commit-based approach loses the per-run_id artifact directory structure, complicates the path resolution in all lib/ readers, and adds a git push step inside CI. The artifact-download pattern is already established by `upload-artifact@v4` in e2e-nightly.yml.

---

## Component Design Decisions

### lib/rerun-validator — Placement and Runner Mode

**Decision: lib/ callable module, NOT a Playwright spec.**

Rationale: The rerun-validator's job is to call `verifyCitation({ patentId, selectedText, observedCitation })` deterministically — the exact same function already imported by regression.spec.js. That function is Playwright-free (it uses pdfjs-dist directly via `lib/pdf-fetch.js`). Wrapping it in a Playwright spec would add 2-3 seconds of browser launch overhead per iteration, introduce unnecessary `test()` scaffolding, and create a third Playwright "project" just for a PDF-parsing oracle.

The validator runs as a Node script or is called from the triage pipeline orchestrator (`scripts/run-triage-pipeline.mjs`). It:
1. Reads `llm-report.json`.
2. Filters iterations where `classification` is `VERIFIER_DISAGREE` or `WRONG_CITATION` (anomalies worth re-validating).
3. Calls `verifyCitation()` once per filtered iteration.
4. Writes `rerun-report.json` with a `reproducible: boolean` + full new Verdict per iteration.

Shape of one `rerun-report.json` entry:
```json
{
  "iteration_n": 3,
  "patent_id": "US11427642",
  "selected_text": "plasma cells and plasmablasts",
  "observed_citation": "63:1-4",
  "original_classification": "VERIFIER_DISAGREE",
  "rerun_verdict": { "status": "disagree", "tier_used": "C", "reason": "..." },
  "reproducible": true
}
```

Only reproducible anomalies pass to triage-classifier. Non-reproducible ones are logged but not triaged (they are one-off transients, not actionable bugs).

### lib/triage-classifier — Pure Data Module with Inline Heuristics

**Decision: Pure data in/out module. Heuristic→LLM fall-through decision lives inside the module, not in the orchestrator.**

Rationale: The classifier is a function that takes a single iteration row (from llm-report.json) plus the rerun verdict and returns a `ClassificationResult` object. Keeping the heuristic→LLM decision inside the module ensures the fall-through logic is unit-testable without mocking any workflow orchestrator state.

The module has no intermediate on-disk state. The orchestrator calls it once per anomaly and collects results into `triage-report.json`. If a LLM second-pass is needed, the module calls `invokeClaudeP` directly (same function used by e2e-explore.mjs).

Heuristic rules (decide without LLM):
- `LLM_HALLUCINATED_SELECTION` with `reproducible: true` → `TRIAGE: confirmed_hallucination` (the LLM consistently picks text not in the spec — LLM prompt bug, not extension bug)
- `WRONG_CITATION` with rerun `tier_used: A` (exact match) and citation differs from golden → `TRIAGE: confirmed_extension_bug`
- `WRONG_CITATION` with rerun `status: fail` (Tier D) → `TRIAGE: unverifiable` (PDF fetch may have failed; file with low confidence)
- `VERIFIER_DISAGREE` with `reproducible: true` AND rerun `tier_used: C` (fuzzy, ±10 lines) → `TRIAGE: verifier_calibration_issue` (verifier line-counting vs extension's gutter-number offset — known systematic gap, documented in pdf-verifier.js line 48)
- Anything remaining → send to LLM second-pass

LLM second-pass prompt structure: provide the iteration row, verifier detail, and ask for one of the following triage labels: `confirmed_extension_bug`, `confirmed_hallucination`, `verifier_calibration_issue`, `unverifiable`, `investigate`. The LLM response schema must include `triage_label` and `confidence` (high/medium/low) and `rationale` (one sentence).

The cost of second-pass LLM calls is charged to the existing `llm-ledger.js` (same file, same monthly cap). The monthly cap covers both exploratory iterations and triage second-passes.

### lib/issue-payload-builder — Seam with e2e-report-issue.mjs

**Decision: New `lib/issue-payload-builder.js` module for rich body assembly; extend `scripts/e2e-report-issue.mjs` as the filer (do NOT rewrite to octokit).**

Rationale: `e2e-report-issue.mjs` already has working fingerprint dedup, `findMatchingIssue`, `isRecentlyUpdated`, and the `makeRealGhClient` gh CLI wrapper. All 8+ unit tests for it pass. Rewriting to octokit would duplicate all of that. The seam is clean: `buildIssueBody()` currently lives in `e2e-report-issue.mjs` and builds a modest body. In v3.1, it should delegate to `lib/issue-payload-builder.js` for LLM-sourced anomaly issues while keeping its current body format for deterministic regression failures.

The seam:
- `e2e-report-issue.mjs` gets a new `--source triage` flag.
- When `--source triage`, it reads `triage-report.json` instead of `report.json` and calls `lib/issue-payload-builder.buildTriageIssueBody(caseEntry)` for the body.
- When `--source regression` (default), it uses the existing `buildIssueBody()` unchanged.

The `lib/issue-payload-builder.js` module is responsible for:
- Assembling the reproducer command: `npm run e2e:explore -- --patent US11427642`
- Embedding the selected text seed verbatim
- Formatting verifier disagreement detail (expected tier, actual tier, cited_text_window from Verdict)
- Rendering a PDF snippet path (calling `renderPdfSnippet` from `lib/pdf-snippet.js`)
- Including LLM triage rationale + confidence from triage-report.json
- Including golden citation diff: `baseline.json[caseId].citation` vs `observed_citation` (when the case-id matches a golden entry)

Golden citation diff: `baseline.json` already contains the authoritative citation per case-id. For LLM-discovered anomalies, the case-id is the LLM-generated `caseId` field (e.g. `US11427642-cross-col-llm-3`). These will not exist in `baseline.json`, so the diff is "no prior golden" rather than a regression diff. That is expected and should be surfaced clearly in the issue body.

### Quarantine Corpus — File, Project, and Promotion Path

**Decision: Separate file (`test-cases-quarantine.js`), separate Playwright project (`quarantine`), separate npm script (`npm run e2e:quarantine`). Promotion via PR script.**

File structure:
```
tests/
  test-cases.js              (existing 76-case golden corpus — unchanged)
  test-cases-quarantine.js   (new — LLM-confirmed anomalies)
  e2e/
    specs/
      regression.spec.js     (existing — reads test-cases.js)
      quarantine.spec.js     (new — reads test-cases-quarantine.js)
    playwright.config.js     (add 'quarantine' project pointing at quarantine.spec.js)
```

The quarantine Playwright project must be configured with `retries: 0` (flake-ineligible — these are known problem cases) and must NOT be referenced by the `--grep` in the existing regression step. The nightly workflow runs quarantine separately after the regression step, with `continue-on-error: true` and its own artifact upload.

CI display pattern: two separate `continue-on-error: true` steps means the CI matrix shows "regression: pass/fail" and "quarantine: pass/fail" independently. The quarantine step failing is informational, not gating. The summary comment or issue body for the quarantine run reports "X cases in quarantine, Y still failing" rather than blocking the PR.

Promotion to golden: a `scripts/promote-from-quarantine.mjs` script that takes a case-id argument, copies the entry from `test-cases-quarantine.js` to `test-cases.js`, updates `tests/golden/baseline.json` with the observed citation (treating the observed value as the new golden), and removes the entry from `test-cases-quarantine.js`. This is a human-triggered PR action, not automated. Automation ends at "confirm the anomaly is reproducible and consistent" — the human decides whether a quarantine case represents a correct extension behavior or a bug to fix before promotion.

### Weekly Digest — State Source and Output

**Decision: Read state from GitHub Issues API (open issues with `e2e-nightly` label), grouped by errorClass label; write to a new GitHub Issue tagged `e2e-digest`.**

Rationale: The existing issues are the canonical state — they are created by the auto-filer with fingerprint dedup and accumulate comments on recurrence. Scanning for open issues is sufficient for "what's currently broken." The alternative (scanning report.json files from artifact downloads) requires iterating over many artifact archives with the gh CLI, which is slow and brittle (artifacts expire in 14 days).

The weekly digest does NOT need a new persistence layer. The issues themselves are the persistence. The digest reads:
- Count of open `e2e-nightly` issues per `errorClass` label (add `errorClass` as an issue label in the filer — currently it's only in the body)
- Count of entries in `test-cases-quarantine.js` (requires checking out the repo in the weekly cron)
- Recent trend: issues opened in last 7 days vs closed in last 7 days

Output: a new GitHub Issue with label `e2e-digest` and title `[e2e-digest] Weekly summary YYYY-WW`. The issue body is a markdown table of counts. The filer uses the existing `makeRealGhClient` pattern (gh CLI). The week number in the title provides natural dedup if the cron runs twice in one week.

Alternative considered: posting to GitHub Discussions. Requires the Discussions feature to be enabled on the repo and a different API surface. GitHub Issues are simpler, already used for nightly failures, and can be referenced from PRs. Rejected in favor of issues.

### State Persistence — Historical Citations

**Decision: No new persistence layer. Use `tests/golden/baseline.json` for golden diffs and artifact-uploaded report files for historical snapshots.**

The `tests/golden/baseline.json` already contains `{ citation, confidence }` per case-id for all 76 golden cases. For LLM-discovered anomalies:
- The observed citation from the LLM run (stored in `llm-report.json` iterations) is compared against `baseline.json[caseId]` if the case-id matches a golden entry.
- For new LLM-generated case-ids (not in baseline), the diff is "no prior golden" and that's a meaningful signal in itself (the LLM found a citation for text the golden corpus doesn't cover).

Nightly reports (`report.json`) are uploaded as GitHub Actions artifacts with 14-day retention. The weekly digest does not need to read them directly — it aggregates from open issues instead. If historical trend analysis beyond 14 days is needed in a future milestone, a `data/nightly-summaries.jsonl` commit-based append pattern is the minimal extension (one line per run, summary counts only, no per-case detail). That is out of scope for v3.1.

---

## Recommended Project Structure (v3.1 additions)

```
tests/
  test-cases.js                        (existing — unchanged)
  test-cases-quarantine.js             (NEW — quarantine corpus)
  golden/
    baseline.json                      (existing — unchanged)
  e2e/
    specs/
      regression.spec.js               (existing — unchanged)
      fault-injection.spec.js          (existing — unchanged)
      quarantine.spec.js               (NEW — non-gating quarantine runner)
    lib/
      pdf-verifier.js                  (existing — called by rerun-validator)
      llm-driver.js                    (existing — called by triage-classifier)
      llm-report.js                    (existing — read by rerun-validator)
      report.js                        (existing — unchanged)
      rerun-validator.js               (NEW — reproducibility confirmation)
      triage-classifier.js             (NEW — heuristic + LLM second-pass)
      issue-payload-builder.js         (NEW — rich body assembly)
      [existing: error-codes, artifacts, run-id, ...]
    playwright.config.js               (MODIFIED — add quarantine project)
    artifacts/
      {run_id}/
        llm-report.json                (existing schema, local-origin)
        rerun-report.json              (NEW — rerun-validator output)
        triage-report.json             (NEW — triage-classifier output)

scripts/
  e2e-explore.mjs                      (existing — unchanged)
  e2e-report-issue.mjs                 (MODIFIED — add --source triage flag)
  quarantine-append.mjs                (NEW — append confirmed anomalies to corpus)
  promote-from-quarantine.mjs          (NEW — human-triggered promotion to golden)
  weekly-digest.mjs                    (NEW — reads GitHub issues, files digest)
  run-triage-pipeline.mjs              (NEW — orchestrator: rerun → triage → issue → quarantine)

.github/workflows/
  e2e-nightly.yml                      (MODIFIED — add triage pipeline steps + llm_run_id input)
  e2e-weekly-digest.yml                (NEW — weekly cron for digest job)
```

---

## New vs Modified Components Table

| Component | v3.1 Status | Change Description |
|-----------|-------------|-------------------|
| `tests/e2e/lib/rerun-validator.js` | NEW | Deterministic re-validation of LLM-flagged anomalies via verifyCitation |
| `tests/e2e/lib/triage-classifier.js` | NEW | Heuristic-first + LLM second-pass classification; pure data in/out |
| `tests/e2e/lib/issue-payload-builder.js` | NEW | Rich GitHub issue body assembler (reproducer, verifier detail, LLM rationale, golden diff) |
| `tests/e2e/specs/quarantine.spec.js` | NEW | Non-gating Playwright spec for quarantine corpus |
| `tests/e2e/test-cases-quarantine.js` | NEW | Quarantine case corpus (separate from golden test-cases.js) |
| `scripts/quarantine-append.mjs` | NEW | Idempotent script to add confirmed anomalies to quarantine corpus |
| `scripts/promote-from-quarantine.mjs` | NEW | Human-triggered promotion from quarantine to golden |
| `scripts/weekly-digest.mjs` | NEW | Weekly GitHub issue analytics digest filer |
| `scripts/run-triage-pipeline.mjs` | NEW | Orchestrator: chains rerun → triage → issue → quarantine |
| `scripts/e2e-report-issue.mjs` | MODIFIED | Add `--source triage` flag; delegate body to issue-payload-builder for LLM anomalies; add errorClass as GitHub label |
| `.github/workflows/e2e-nightly.yml` | MODIFIED | Add `llm_run_id` workflow_dispatch input; add artifact download step; add triage pipeline step; add quarantine spec step; add weekly digest workflow |
| `tests/e2e/playwright.config.js` | MODIFIED | Add `quarantine` Playwright project |
| `tests/e2e/lib/pdf-verifier.js` | UNCHANGED | Called as-is by rerun-validator |
| `tests/e2e/lib/llm-driver.js` | UNCHANGED | Called as-is by triage-classifier for LLM second-pass |
| `tests/e2e/lib/llm-report.js` | UNCHANGED | Read as-is by rerun-validator |
| `tests/e2e/lib/report.js` | UNCHANGED | |
| `tests/golden/baseline.json` | UNCHANGED | Referenced for golden diffs; modified only by promote-from-quarantine.mjs |
| `tests/test-cases.js` | UNCHANGED | Modified only by promote-from-quarantine.mjs |

---

## Data Flow Diagram (Text)

```
[LOCAL] npm run e2e:explore
    │
    ├── lib/llm-driver.js (invokeClaudeP, validateLlmSelection)
    ├── lib/llm-hallucination.js (selectionInSpec)
    ├── lib/pdf-verifier.js (verifyCitation)
    ├── lib/llm-ledger.js (spend tracking)
    └── lib/llm-report.js (appendLlmIteration)
           │
           ▼
  artifacts/{run_id}/llm-report.json

[DEVELOPER] gh workflow run e2e-nightly.yml -f llm_run_id={run_id}
  [CI downloads artifact: llm-report.json]

[CI] scripts/run-triage-pipeline.mjs
    │
    ├── [STEP 1] lib/rerun-validator.js
    │    reads:  llm-report.json (VERIFIER_DISAGREE + WRONG_CITATION iterations)
    │    calls:  lib/pdf-verifier.js verifyCitation (verifier-only, no Playwright)
    │    writes: artifacts/{run_id}/rerun-report.json
    │
    ├── [STEP 2] lib/triage-classifier.js
    │    reads:  llm-report.json (iteration metadata)
    │            rerun-report.json (reproducibility verdicts)
    │    calls:  lib/llm-driver.js invokeClaudeP (ambiguous cases only)
    │    uses:   lib/llm-ledger.js (charge second-pass cost to monthly cap)
    │    writes: artifacts/{run_id}/triage-report.json
    │
    ├── [STEP 3] lib/issue-payload-builder.js (called from step 4)
    │    reads:  triage-report.json, llm-report.json
    │            tests/golden/baseline.json (for citation diff)
    │    calls:  lib/pdf-snippet.js renderPdfSnippet (for PNG crops)
    │    output: rich issue body string (not written to disk; passed to filer)
    │
    ├── [STEP 4] scripts/e2e-report-issue.mjs --source triage
    │    reads:  triage-report.json (actionable cases: confirmed_extension_bug, investigate)
    │    calls:  lib/issue-payload-builder.buildTriageIssueBody()
    │    calls:  gh CLI (create/comment issues with fingerprint dedup)
    │    labels: adds errorClass as GitHub label on created issues
    │
    └── [STEP 5] scripts/quarantine-append.mjs
         reads:  triage-report.json (confirmed_extension_bug + investigate cases)
         writes: tests/e2e/test-cases-quarantine.js (idempotent upsert by caseId)

[CI] npx playwright test --project quarantine
    reads:  tests/e2e/test-cases-quarantine.js
    uses:   existing lib/pdf-verifier.js, lib/artifacts.js, lib/report.js
    writes: artifacts/{run_id}/quarantine-report.json
    uploads: as separate artifact (non-gating, continue-on-error: true)

[WEEKLY CRON] scripts/weekly-digest.mjs
    reads:  gh api /repos/{repo}/issues?labels=e2e-nightly (open issues)
            checkout tests/e2e/test-cases-quarantine.js (line count)
    writes: gh issue create --label e2e-digest (new issue per week)
```

---

## Build Order (Dependency-Justified)

The dependency graph determines sequencing. Components can only be built after their inputs exist.

**Phase 1 — Foundations (no inter-v3.1 dependencies)**
- `tests/e2e/lib/rerun-validator.js`
  - Depends only on existing `lib/pdf-verifier.js` and `lib/llm-report.js`
  - Must exist before triage-classifier can consume its output
  - Unit-testable immediately with mock llm-report.json fixtures

**Phase 2 — Classifier (depends on rerun-validator output schema)**
- `tests/e2e/lib/triage-classifier.js`
  - Consumes rerun-report.json schema (defined in Phase 1)
  - Calls `lib/llm-driver.js` (existing) for second-pass — no new dependency
  - Must exist before issue-payload-builder and quarantine-append

**Phase 3 — Payload + Corpus (depends on triage output schema)**
- `tests/e2e/lib/issue-payload-builder.js`
  - Consumes triage-report.json schema (defined in Phase 2)
  - References `lib/pdf-snippet.js` (existing) and `baseline.json` (existing)
- `scripts/quarantine-append.mjs`
  - Consumes triage-report.json schema (defined in Phase 2)
  - Writes `test-cases-quarantine.js` (can create empty file to unblock Phase 4)

**Phase 4 — CI wiring + quarantine spec (depends on quarantine corpus)**
- `tests/e2e/test-cases-quarantine.js` (file created by quarantine-append.mjs — Phase 3)
- `tests/e2e/specs/quarantine.spec.js`
  - Reads test-cases-quarantine.js (Phase 3)
  - Uses existing lib/ primitives unchanged
- `tests/e2e/playwright.config.js` modification (add quarantine project)
- `scripts/e2e-report-issue.mjs` modification (add --source triage, delegate to issue-payload-builder)
- `scripts/run-triage-pipeline.mjs` (orchestrator, chains all Phase 1-3 components)

**Phase 5 — Workflow extension (depends on all Phase 1-4 components being testable)**
- `.github/workflows/e2e-nightly.yml` additions (llm_run_id input, triage steps, quarantine step)
- Requires run-triage-pipeline.mjs to exist and pass a dry-run test before wiring into CI

**Phase 6 — Weekly digest (no dependency on Phase 1-5 output; depends only on existing GitHub issues existing)**
- `scripts/weekly-digest.mjs`
  - Reads GitHub Issues API — no local file dependencies from Phases 1-5
  - Can be built and tested independently of the triage pipeline
  - `.github/workflows/e2e-weekly-digest.yml` (separate weekly cron)

**Dependency-justified total ordering:**

```
1. rerun-validator.js          (consumes only existing pdf-verifier + llm-report.js)
2. triage-classifier.js        (consumes rerun-report.json schema from step 1)
3. issue-payload-builder.js    (consumes triage-report.json schema from step 2)
4. quarantine-append.mjs       (consumes triage-report.json schema from step 2)
5. test-cases-quarantine.js    (created by step 4; needed by step 6)
6. quarantine.spec.js          (reads step 5; uses existing lib/)
7. playwright.config.js mod    (enables quarantine project from step 6)
8. e2e-report-issue.mjs mod    (delegates to step 3; adds errorClass labeling)
9. run-triage-pipeline.mjs     (orchestrates steps 1-4, 8)
10. e2e-nightly.yml additions  (wires step 9 into CI)
11. promote-from-quarantine.mjs (utility; no blocking dependency)
12. weekly-digest.mjs          (independent of steps 1-10; parallel track)
13. e2e-weekly-digest.yml      (wires step 12)
```

Steps 11 and 12/13 are on independent tracks and can be built in parallel with steps 8-10 once the quarantine corpus file exists (step 5).

---

## Architectural Patterns

### Pattern 1: Pure-Data Library Module with Orchestrator Script

**What:** All new `lib/` modules (rerun-validator, triage-classifier, issue-payload-builder) are pure-function Node.js modules with no side effects in their exported functions except file reads/writes explicitly passed as parameters. The orchestrator (`scripts/run-triage-pipeline.mjs`) sequences them and handles error recovery.

**When to use:** Whenever a component needs to be unit-tested with mock data in vitest without spinning up Playwright or making network calls. All three new lib/ components fit this pattern.

**Trade-offs:** The orchestrator script becomes the seam where error handling and retry logic lives. This is acceptable because the orchestrator is CI-only (not unit-tested at the same depth) and its failure modes are CI step failures (visible, not silent).

### Pattern 2: Verifier-Only Replay (No Browser)

**What:** rerun-validator.js calls `verifyCitation()` directly without loading the extension or Playwright. The verifier uses `pdfjs-dist` directly in Node — no browser context required.

**When to use:** Any time the question is "does the cited text exist in the PDF at this location?" not "does the extension produce the right citation?" The rerun-validator is answering the first question.

**Trade-offs:** The verifier has a known ±10-line calibration gap vs the extension's gutter-printed line numbering (documented in pdf-verifier.js line 48). The heuristic rule in triage-classifier explicitly handles `VERIFIER_DISAGREE` cases where the re-run verdict is Tier C — these are classified as `verifier_calibration_issue` rather than `confirmed_extension_bug`, preserving the distinction.

### Pattern 3: Closed-Enum Extension for Triage Labels

**What:** The triage-report.json uses a new closed set of triage labels (`confirmed_extension_bug`, `confirmed_hallucination`, `verifier_calibration_issue`, `unverifiable`, `investigate`) analogous to how ERROR_CLASSES is a closed enum in error-codes.js.

**When to use:** Anywhere that downstream consumers (quarantine-append, issue-payload-builder, weekly-digest) need to branch on the triage result. Closed enums make it safe to assert exhaustiveness in those consumers.

**Trade-offs:** Adding a new triage label requires updating all consumers. This is the same trade-off accepted for ERROR_CLASSES in Phase 28 — the closed-enum guarantee is worth the maintenance discipline.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running Playwright in the Rerun Validator

**What people might do:** Run `quarantine.spec.js` as the rerun-validator (load the extension, drive the page, check the citation).

**Why it's wrong:** The question at re-run time is "is this anomaly reproducible deterministically?" not "does the extension still produce the same wrong citation?" The verifyCitation oracle answers reproducibility without a browser. Introducing Playwright adds 30+ seconds per case (browser launch + Google Patents navigation + CAPTCHA risk) to what is already a slow pipeline. The deterministic regression suite already answers "does the extension produce the right citation."

**Do this instead:** rerun-validator.js calls `verifyCitation()` directly. Playwright tests remain confined to regression.spec.js and quarantine.spec.js, which run against the live extension.

### Anti-Pattern 2: Committing llm-report.json to git

**What people might do:** Add a `git commit -m "chore: update llm-report.json"` step in CI or in the local explore script.

**Why it's wrong:** The llm-report.json is a per-run artifact with a run-scoped run_id in its path. Committing it conflates ephemeral test runs with permanent project history, creates merge conflicts on concurrent runs, and leaks cost information (total_cost_usd per iteration) into git history. The llm-ledger.js is already gitignored for this reason.

**Do this instead:** Upload as a GitHub Actions artifact with the gh CLI or an `upload-artifact` step. Pass the run_id as a workflow_dispatch input to the nightly pipeline.

### Anti-Pattern 3: Entangling Triage Cost with the Exploratory Monthly Cap

**What people might do:** Maintain a separate spend cap for triage second-pass LLM calls, distinct from the llm-ledger monthly cap.

**Why it's wrong:** Two caps mean two code paths for cap enforcement, two ledger files, two WARN_THRESHOLD checks. The total developer cost is the sum of both pools, but visibility is split.

**Do this instead:** All `invokeClaudeP` calls — whether from e2e-explore.mjs (exploratory) or triage-classifier.js (second-pass) — record their cost in the same `llm-ledger.js` under the same monthly key. The second-pass calls should be infrequent (only ambiguous cases bypass heuristics) and the $100 hard cap protects against runaway spending from either source.

### Anti-Pattern 4: Blocking CI on Quarantine Failures

**What people might do:** Remove `continue-on-error: true` from the quarantine spec step so a failing quarantine case blocks merging.

**Why it's wrong:** Quarantine cases are known-failing by definition — they are confirmed anomalies awaiting either extension fix or promotion to golden. Making them gating would mean every PR fails until every quarantine case is resolved, which defeats the purpose of the tiered corpus.

**Do this instead:** Quarantine spec always runs with `continue-on-error: true`. The quarantine result is reported in the weekly digest and tracked via GitHub issues with the `e2e-nightly` label. Promotion to golden (after an extension fix) is the graduation mechanism, not blocking CI.

---

## Integration Points with Existing v3.0 Modules

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| GitHub Issues API | gh CLI via `execSync` in `e2e-report-issue.mjs` (existing); extended with errorClass label | New: add label creation for errorClass values in `Ensure labels exist` step |
| GitHub Actions Artifacts | `upload-artifact@v4` / `download-artifact@v4` | llm-report.json transit from local to CI |
| claude -p (Max 5) | `invokeClaudeP` from `lib/llm-driver.js` | Reused by triage-classifier second-pass; same spend cap enforcement |
| pdfjs-dist | Node-side direct import in `lib/pdf-verifier.js` | Reused by rerun-validator; no new dependency |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `rerun-validator.js` ↔ `lib/pdf-verifier.js` | Direct function call: `verifyCitation({patentId, selectedText, observedCitation})` | Returns Verdict `{status, tier_used, reason, cited_text_window}` — existing schema, unchanged |
| `rerun-validator.js` ↔ `lib/llm-report.js` | Read-only: imports `llmReportPathFor`, parses file directly | Does NOT write to llm-report.json; only reads |
| `triage-classifier.js` ↔ `lib/llm-driver.js` | Direct function call: `invokeClaudeP({systemPrompt, userPrompt})` then `parseClaudeResponse` | Reuses existing API contract unchanged |
| `triage-classifier.js` ↔ `lib/llm-ledger.js` | Direct function call: `appendLedgerEntry` after every invokeClaudeP call | Same monthly cap applies |
| `issue-payload-builder.js` ↔ `lib/pdf-snippet.js` | Direct function call: `renderPdfSnippet({patentId, page, line, runId, caseId})` | Returns PNG path; existing API unchanged |
| `e2e-report-issue.mjs` ↔ `lib/issue-payload-builder.js` | New import; called in `--source triage` branch only | Existing `buildIssueBody()` function remains for regression source |
| `quarantine.spec.js` ↔ `tests/e2e/lib/*` | Same imports as regression.spec.js | Specifically: `extension-loader`, `navigation`, `selection`, `observation`, `pdf-verifier`, `report`, `artifacts` |
| `scripts/run-triage-pipeline.mjs` ↔ all new lib/ | Orchestrator: sequential calls with error trapping per step | Exits 0 always (same philosophy as e2e-nightly.yml — the issue IS the signal) |

---

## Sources

- Direct code inspection: `tests/e2e/lib/pdf-verifier.js`, `lib/llm-driver.js`, `lib/llm-report.js`, `lib/error-codes.js`, `lib/report.js`
- Direct code inspection: `scripts/e2e-report-issue.mjs`, `scripts/e2e-explore.mjs`
- Direct code inspection: `.github/workflows/e2e-nightly.yml`, `tests/e2e/specs/regression.spec.js`
- `.planning/PROJECT.md` — v3.1 milestone target features
- Confidence: HIGH — all architectural decisions derived from reading existing code contracts, not from external research or training-time knowledge

---

*Architecture research for: v3.1 LLM-Driven Product Improvement Loop (patent-cite-tool)*
*Researched: 2026-05-22*

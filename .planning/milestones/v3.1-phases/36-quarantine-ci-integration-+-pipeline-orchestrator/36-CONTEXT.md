# Phase 36: Quarantine CI Integration + Pipeline Orchestrator - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 36 wires the Phase 33–35 data layer into the nightly CI cron. It ships a quarantine Playwright spec that runs the `TEST_CASES_QUARANTINE` corpus as a non-gating suite, a `scripts/run-triage-pipeline.mjs` orchestrator that chains the four existing CLIs (rerun-validator → triage-classifier → issue-file → quarantine-append), and the `e2e-nightly.yml` wiring that runs both ONLY when an `llm_run_id` workflow_dispatch input is provided. Quarantine failures file GitHub issues with a distinct `e2e-quarantine` label. The timeout budget arithmetic is documented in a YAML comment.

**In scope:** `tests/e2e/specs/quarantine.spec.js`; `npm run e2e:quarantine` script (with `--retries=0 --pass-with-no-tests`); `scripts/run-triage-pipeline.mjs` + `npm run e2e:triage-pipeline` + its integration test; `e2e-nightly.yml` changes (triage-pipeline step, quarantine-spec step with `continue-on-error: true`, `e2e-quarantine` label-ensure step, quarantine-failure issue-filer step, timeout-budget comment, per-step timeout-minutes for quarantine); `--source quarantine` branch in `scripts/e2e-report-issue.mjs`.

**Out of scope (Phase 37+):**
- Weekly analytics digest reading the nightly-filed issues — Phase 37
- Auto-promotion of stable quarantine entries — deferred (QUAR-AUTO-01)
- Auto-close of stale quarantine entries — deferred (QUAR-AUTO-02)
- Live LLM triage in CI via API billing — explicitly out of scope (subscription-local only)

</domain>

<decisions>
## Implementation Decisions

### quarantine.spec.js + retries:0 Execution (QUAR-03)
- **D-01:** `tests/e2e/specs/quarantine.spec.js` iterates `TEST_CASES_QUARANTINE` imported from `tests/e2e/test-cases-quarantine.js` (Phase 35 deliverable). Structure mirrors `tests/e2e/specs/regression.spec.js` — one Playwright test per corpus entry. Empty corpus → 0 tests.
- **D-02:** `retries: 0` enforced via the CLI flag `--retries=0` on the npm script, OVERRIDING the config's `retries: process.env.CI ? 1 : 0`. No separate playwright config, no `projects[]` restructure.
- **D-03:** npm script: `"e2e:quarantine": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/quarantine.spec.js --retries=0 --pass-with-no-tests"`. The `--pass-with-no-tests` flag makes the initial empty corpus exit 0 with 0 tests (SC-1).
- **D-04:** Build dependency `npm run build:chrome` prefixes the script — the quarantine spec drives the extension exactly like regression.

### run-triage-pipeline.mjs Orchestrator (ORCH-01)
- **D-05:** `scripts/run-triage-pipeline.mjs` chains the 4 stages by `spawnSync`-ing each existing CLI in sequence with `cwd: PROJECT_ROOT` (Pitfall 6):
  1. `node scripts/e2e-rerun-validator.mjs --input <llm-report>`
  2. `node scripts/e2e-triage-classifier.mjs --input <llm-report>`
  3. `node scripts/e2e-report-issue.mjs --source triage --triage-report <triage-report>`
  4. `node scripts/quarantine-append.mjs --input <triage-report>` (per CONFIRMED finding)
- **D-06:** Exit philosophy: EXITS 0 ALWAYS (nightly cron philosophy, ORCH-01). Each stage failure is logged to stdout + captured in a pipeline summary; never aborts the chain or returns non-zero. A hard-failed stage is skipped; downstream stages detect the missing output file and no-op gracefully.
- **D-07:** Input: `--llm-report <path>` flag (the downloaded artifact). Run dir resolved via `path.dirname(llmReport)`; intermediate outputs (`rerun-report.json`, `triage-report.json`) land in that same `artifacts/{runId}/` dir, feeding the next stage.
- **D-08:** CI behavior: the triage stage's LLM second-pass (Phase 34 `invokeClaudePWithLedger`) hits the `CI=true` gate and returns `{ciGate: true}` for ambiguous findings — they stay heuristic-only/unresolved. This is CORRECT per TRIAGE-04 (subscription-local only). The pipeline logs "LLM second-pass skipped in CI" and continues; heuristic-resolved findings still flow to issue-file + quarantine-append.

### e2e-nightly.yml Wiring (ORCH-02, QUAR-04)
- **D-09:** Both the triage-pipeline step AND the quarantine-spec step are gated on `if: inputs.llm_run_id != ''` — the same condition the existing download+validate step uses (line 108). Without `llm_run_id`, both skip; existing regression behavior is byte-identical (SC-3).
- **D-10:** Quarantine spec step has `continue-on-error: true` (mirrors the existing regression step at line 191) — a quarantine failure never fails the job (QUAR-04 non-gating).
- **D-11:** Quarantine failure → issue with `e2e-quarantine` label: a post-quarantine step (gated on the quarantine step's outcome / parsing the quarantine report) invokes `scripts/e2e-report-issue.mjs --source quarantine`, which reuses the existing per-case report path but stamps `e2e-quarantine` instead of `e2e-nightly` (SC-4). Reuses fingerprint dedup.
- **D-12:** Step ordering after the existing regression steps: (1) download+validate llm-report [exists], (2) ensure `e2e-quarantine` label, (3) run-triage-pipeline.mjs, (4) quarantine spec with continue-on-error, (5) quarantine-failure issue filer. Steps 2–5 gated on `llm_run_id`.

### Label, Timeout Budget, Edge Cases (ORCH-03, SC-4, SC-5)
- **D-13:** `e2e-quarantine` label is self-bootstrapped via an "Ensure e2e-quarantine label exists" step in `e2e-nightly.yml` (mirrors the existing "Ensure e2e-nightly label exists" step at line 97), gated on `llm_run_id != ''`. `gh label create e2e-quarantine --color <hex> --force`. No manual prereq.
- **D-14:** Timeout budget (ORCH-03, SC-5): YAML comment documents the arithmetic — `existing job cap = 30 min; regression ≈ N_daily × 90s; quarantine adds N_quarantine × ~90s/case + ~60s build`. With the current empty corpus (N=0) headroom is full. Projected ceiling: at ~20 quarantine cases, 20×90s = 30 min would exceed the job cap. Mitigation: the quarantine spec step gets its OWN `timeout-minutes` (recommended 15) so it cannot starve the job, AND the comment flags the >20-case ceiling as a future concern (daily --grep rotation if it grows).
- **D-15:** `--source quarantine` branch in `scripts/e2e-report-issue.mjs`: reuses the existing per-case report path (Playwright JSON reporter output) but stamps the `e2e-quarantine` label instead of `e2e-nightly`. Reuses fingerprint dedup. Vitest mock-gh test asserts the `e2e-quarantine` label arg (SC-4). Note CR-01 from Phase 35 — the `--source quarantine` path MUST also apply `sanitizeCaseId` before any shell interpolation (the Phase 35 fix established this guard; quarantine reuses the same hardened path).
- **D-16:** `run-triage-pipeline.mjs` npm script: `"e2e:triage-pipeline": "node scripts/run-triage-pipeline.mjs"`. Vitest spawnSync integration test runs the pipeline against a fixture `llm-report.json` with one CONFIRMED finding (mock-gh for the issue-file stage), asserts: exit 0, `rerun-report.json` + `triage-report.json` written, mock issue filed, 1 quarantine entry appended (SC-2). Uses tmpDir artifacts root + `QUARANTINE_CORPUS_PATH_OVERRIDE` for isolation (Phase 35 pattern).

### Claude's Discretion
- Exact `e2e-quarantine` label color hex — planner picks (recommend a distinct color from `triage`/`e2e-nightly`).
- Exact per-step `timeout-minutes` for the quarantine spec (recommend 15; planner may tune given the empty corpus).
- Whether `run-triage-pipeline.mjs` writes a `pipeline-summary.json` artifact or just logs to stdout — recommend a small summary object logged + optionally written to the run dir for forensics.
- The precise mechanism for detecting quarantine spec failure in the YAML (parse the Playwright JSON report vs. step `outcome`) — planner picks; recommend parsing the report so the issue filer has per-case detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 36: Quarantine CI Integration + Pipeline Orchestrator"
- `.planning/REQUIREMENTS.md` §QUAR (QUAR-03, QUAR-04), §ORCH (ORCH-01, ORCH-02, ORCH-03)
- `.planning/research/SUMMARY.md` §"Phase 5" (quarantine CI + orchestrator)
- `.planning/research/PITFALLS.md` (concurrency, timeout, CI-leak pitfalls)

### Existing code that Phase 36 extends or depends on
- `.github/workflows/e2e-nightly.yml` — the nightly cron. EXTENDED with steps per D-09..D-14. Existing structure: timeout-minutes 30 (line 50), llm_run_id input (line 27), download+validate step gated on `inputs.llm_run_id != ''` (line 108), regression step with continue-on-error (line 191), "Ensure e2e-nightly label exists" step (line 97).
- `tests/e2e/specs/regression.spec.js` — STRUCTURE ANALOG for quarantine.spec.js (one test per corpus entry).
- `tests/e2e/playwright.config.js` — `retries: process.env.CI ? 1 : 0` (line 21). D-02 overrides via CLI flag.
- `tests/e2e/test-cases-quarantine.js` (Phase 35) — `TEST_CASES_QUARANTINE` corpus the spec iterates.
- `scripts/e2e-rerun-validator.mjs` (Phase 33), `scripts/e2e-triage-classifier.mjs` (Phase 34), `scripts/e2e-report-issue.mjs` (Phase 35 `--source triage`), `scripts/quarantine-append.mjs` (Phase 35) — the 4 CLIs the pipeline chains.
- `scripts/e2e-report-issue.mjs` — `--source` family (regression/triage); D-15 adds `quarantine`. Reuse `sanitizeCaseId` (Phase 35 CR-01 fix), fingerprint dedup.
- `package.json` — add `e2e:quarantine` + `e2e:triage-pipeline` scripts; extend `lint` to cover `scripts/run-triage-pipeline.mjs`.

### Pre-locked decisions to honor
- Quarantine spec runs INSIDE `e2e-nightly.yml` (not a separate workflow) — concurrency-collision avoidance (v3.1 pre-lock)
- Timeout budget calculated + documented BEFORE adding quarantine steps (STATE.md Phase 36 blocker note)
- LLM triage NEVER runs API-billed in CI (subscription-local only); heuristic path is fine in CI
- `--source quarantine` reuses the Phase 35 hardened report path (sanitizeCaseId guard from CR-01)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/e2e-nightly.yml` — existing label-ensure step (line 97), download+validate gating (line 108), continue-on-error pattern (line 191), llm_run_id input + digit-validation (lines 27, 118–121)
- `tests/e2e/specs/regression.spec.js` — per-corpus-entry test structure; imports TEST_CASES, drives the extension
- `tests/e2e/playwright.config.js` — single-project config; `--retries=0` CLI override avoids forking it
- The 4 Phase 33–35 CLIs — each has its own arg parsing, CI gates, atomic writes; the pipeline composes them via spawnSync
- `scripts/e2e-report-issue.mjs::sanitizeCaseId` + fingerprint + `--source` dispatch — D-15 extends with `quarantine`
- Phase 35's `QUARANTINE_CORPUS_PATH_OVERRIDE` env var + tmpDir-clone test pattern — reused for the pipeline integration test

### Established Patterns
- **CLI shim via spawnSync with cwd: PROJECT_ROOT** — Phase 35 promote-from-quarantine pattern (Pitfall 6)
- **Nightly step gated on `inputs.llm_run_id != ''`** — existing download step; new steps follow
- **continue-on-error: true for non-gating suites** — existing regression step
- **Label self-bootstrap via gh label create --force** — existing e2e-nightly label step; Phase 35 added triage labels
- **--source family in e2e-report-issue.mjs** — regression (Phase 29), triage (Phase 35), quarantine (Phase 36 D-15)
- **spawnSync integration test with mock-gh + tmpDir** — Phase 35 quarantine-append + promote tests

### Integration Points
- `quarantine.spec.js` ↔ `tests/e2e/test-cases-quarantine.js` (reads TEST_CASES_QUARANTINE)
- `run-triage-pipeline.mjs` ↔ the 4 CLIs (spawnSync chain)
- `e2e-nightly.yml` ↔ run-triage-pipeline.mjs + quarantine spec + e2e-report-issue.mjs --source quarantine
- `e2e-report-issue.mjs --source quarantine` ↔ `gh issue create --label e2e-quarantine`
- `package.json` ↔ new scripts (e2e:quarantine, e2e:triage-pipeline)

</code_context>

<specifics>
## Specific Ideas

- The user accepts D-02's `--retries=0` CLI override (no config fork).
- The user accepts D-03's `--pass-with-no-tests` flag for empty-corpus exit 0.
- The user accepts D-06's "exit 0 always" pipeline philosophy.
- The user accepts D-08's "LLM second-pass skipped in CI, heuristic path continues" behavior.
- The user accepts D-09's gating both new steps on `llm_run_id != ''`.
- The user accepts D-13's self-bootstrapping `e2e-quarantine` label step.
- The user accepts D-14's per-step `timeout-minutes` for quarantine + the documented >20-case ceiling concern.
- The user accepts D-15's `--source quarantine` branch reusing the Phase 35 sanitizeCaseId-hardened path.

</specifics>

<deferred>
## Deferred Ideas

- **Weekly digest reading nightly-filed issues** — Phase 37.
- **Daily --grep rotation for quarantine corpus once it exceeds ~20 cases** — flagged in D-14 as a future concern; not implemented while the corpus is empty/small.
- **Auto-promotion / auto-close of quarantine entries** — QUAR-AUTO-01/02, deferred per REQUIREMENTS.md.
- **Live LLM triage in CI via API billing** — explicitly out of scope (subscription-local only).
- **pipeline-summary.json artifact upload to GitHub Actions** — optional forensics; planner may include a minimal local write but artifact-upload wiring is not required by any SC.

</deferred>

---

*Phase: 36-quarantine-ci-integration-+-pipeline-orchestrator*
*Context gathered: 2026-05-28*

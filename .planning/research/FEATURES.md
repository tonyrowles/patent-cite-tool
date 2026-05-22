# Feature Research

**Domain:** LLM-augmented CI test pipeline / feedback loop for browser extension
**Researched:** 2026-05-22
**Confidence:** HIGH (existing v3.0 codebase read directly; OSS patterns verified via web sources)

---

## Scope Note

This document covers the six new v3.1 features only. Existing v3.0 infrastructure
(pdf-verifier, llm-driver, report.js, llm-report.js, error-codes.js, fingerprint
scheme in e2e-report-issue.mjs) is treated as stable building blocks — dependencies
are noted per feature but their internals are not re-researched.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any mature LLM-augmented test pipeline must have. Missing these means
the loop is not closed and the entire v3.1 rationale collapses.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Re-run validator (reproducibility gate) | Without it, every LLM anomaly triggers an issue — false-positive rate makes triage meaningless | MEDIUM | Verifier-only path (no Playwright, no extension load); reuses pdf-verifier + selection hash |
| Hybrid triage classifier | Pure LLM classification burns subscription budget on every finding; rule coverage is high for the closed 8-class taxonomy | MEDIUM | Rule layer handles PASS, WRONG_CITATION (verifier tier A/B), LLM_HALLUCINATED_SELECTION; LLM second-pass only for VERIFIER_DISAGREE ambiguous cases |
| Auto-issue filer with rich payload | The v3.0 e2e-report-issue.mjs already auto-files; without rich payload the filed issue is useless for triage | LOW-MEDIUM | Extends existing fingerprint dedup; adds verifier detail, LLM rationale, golden diff |
| Tiered corpus promotion (quarantine bucket) | Without quarantine, confirmed anomalies have nowhere to land short of golden — golden corpus must stay high-trust | MEDIUM | Separate test-cases-quarantine.js; non-gating CI job; human PR-promotes to golden |
| Local + CI runtime split | LLM subscription cannot run in CI (cost, auth); but triage/validator/quarantine must run nightly to close the loop | LOW | CI-guard already implemented in e2e-explore-ci-guard.test.js; gap is the handoff pattern for llm-report.json |
| Weekly analytics digest | Quarantine growth without visibility = silent debt accumulation; digest drives roadmap | LOW | JSON-to-markdown transform; GitHub Actions cron; email or Slack optional |

### Differentiators (Competitive Advantage)

Features that go beyond the bare minimum and make v3.1 distinctly useful. These are
all explicitly planned for v3.1 (not speculative).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seed + reproducer in issue body | Most auto-filed CI issues are not reproducible from the issue alone; patent ID + selection hash + run command makes every issue self-contained | LOW | Seed is already in report.json caseEntry; reproducer is `npm run e2e:explore -- --patent US11427642 --seed <hash>` |
| Verifier disagreement tier + PDF snippet | Context-free issues don't distinguish Tier A exact-match failure from Tier C ±10-line fuzzy; snippet image proves the real text position | LOW | pdf-snippet.js (Phase 28 DIAG-03) already renders ±100px band PNG; wire into issue template |
| LLM rationale + confidence in issue body | Triage cost drops when the LLM explains WHY it classified a finding — "cross-column boundary on wrap-hyphen" tells the dev exactly where to look | LOW | Already available in llm-report.json iterations[].rationale field |
| Diff vs last known-good golden citation | When WRONG_CITATION fires, the diff (observed 4:35 vs golden 4:37) is more actionable than the raw strings alone | LOW | golden baseline is test-cases.js; diff is a one-liner at issue-file time |
| Non-gating quarantine CI job | Quarantine suite runs every nightly cron but does not block the build — gives visibility without red CI | LOW | Playwright project filter or separate npm script; report published as artifact |
| Quarantine growth trend in digest | Not just "N quarantined" but "+3 this week, -1 promoted" tells whether the corpus is converging or diverging | LOW | Computable from quarantine file git history or from weekly snapshot comparison |

### Anti-Features (Commonly Added, Unnecessary for This Scope)

| Feature | Why Requested | Why Problematic for v3.1 | Alternative |
|---------|---------------|--------------------------|-------------|
| Run LLM triage in GitHub Actions CI | "Automate everything" instinct; would make the pipeline fully headless | Auth: Anthropic subscription auth is local-session-bound, not API-key-based; CI would require a pay-per-token key, breaking the $100 cap model. CI guard in e2e-explore-ci-guard.test.js deliberately prevents this | Keep LLM local-only; consume llm-report.json in CI via committed artifact or workflow_run passthrough |
| Real-time Slack/PagerDuty alert per finding | Seems urgent; every new quarantine entry feels like a prod alert | LLM exploratory findings are NOT production failures — they are hypotheses. Alerting on every one trains engineers to ignore alerts. The nightly cron + digest is the right cadence | Weekly digest + label-based GitHub notification for P0 issues only |
| Automatic golden promotion (no human PR) | Reduces friction | Destroys the trust invariant of the golden corpus. Quarantine → golden must have a human review step, otherwise a transient LLM anomaly could poison the 76-case baseline | Human PR with quarantine suite green for N consecutive runs as the promote signal |
| Multi-pass LLM chain-of-thought triage | Higher accuracy via step-by-step reasoning | For a closed 8-class taxonomy with structured verifier output, chain-of-thought adds latency and cost without accuracy gain. Single-pass with a structured output schema is sufficient | Single-pass LLM prompt with `--output-format json` and severity + category + rationale fields |
| Embedding-based deduplication | Semantic dedup of "similar" findings | The existing fingerprint scheme (Phase 29) already deduplicates by patent ID + selection hash + error class. Embeddings add a dependency (vector store or embedding API) for marginal benefit | Keep deterministic fingerprint dedup; rely on error_class taxonomy for category-level grouping |
| Persistent test result database (SQL/Postgres) | Analytics on long-running history | Out of scope for a single-developer tool with <100 findings/week. JSON files in artifacts/ + git history provide sufficient queryable state for the weekly digest | JSON report files + simple jq/Node scripts for digest computation |
| Flakiness scoring / retry-based detection | Standard CI flake management | The re-run validator already distinguishes flake from real bug deterministically (verifier-only replay). Retry-count-based scoring is for non-deterministic UIs; the verifier path here is deterministic | Deterministic re-run: if verifier finds text at cited position on replay → confirmed real; if not → flake |

---

## Feature Details Per v3.1 Feature

### 1. Re-run Validator

**What mature CI does:** The industry standard (Playwright, WPT, Atlassian's internal tooling) uses a 10-run sample to classify flakes: 0/10 = CI environment issue, 1-3/10 = genuine flake, 4+/10 = real bug. For a patent citation tool, the verifier path is deterministic: the PDF text is static, the selection hash is fixed, the verifier either finds the text or doesn't.

**Table stakes behavior:** Re-run the verifier-only path (not the full Playwright extension load) for each LLM-flagged anomaly. The verifier (`pdf-verifier.js` via `verifyCitation()`) is pure Node, no browser, no network after the first PDF fetch. Replay 3 times is the right ceiling — more is diminishing returns for a deterministic system; 1 is insufficient to rule out node process-level issues (module cache cold vs warm, PDF fetch timeout). If 2 of 3 replays confirm the anomaly → promoted to triage. If 0-1 of 3 confirm → FLAKE classification, no issue filed.

**v3.0 dependency:** `pdf-verifier.js` (verifyCitation), `pdf-fetch.js` (ensureCachedPdf), `llm-report.json` iterations (patent_id + selected_text + observed_citation fields). The selection hash from `llm-report.json` is the seed for deterministic replay.

**Complexity:** MEDIUM. New script (e.g., `scripts/rerun-validator.mjs`); reads llm-report.json for VERIFIER_DISAGREE and WRONG_CITATION iterations; calls verifyCitation 3× per iteration; writes updated replay_verdict field back to the iteration or a separate rerun-report.json.

---

### 2. Hybrid Triage Classifier

**What mature CI does:** Rule-based first, LLM second for ambiguous cases. This exact pattern is validated in production: healthcare triage systems, Linux event classifiers, and email triage all use it. The critical finding from research: LLMs score well on obvious categorizations but poorly on borderline cases (68% vs 82% for embedding-based approaches). For the closed 8-class taxonomy in error-codes.js, most cases are non-ambiguous.

**Rule coverage for the existing taxonomy:**
- `LLM_HALLUCINATED_SELECTION` → always confirmed by hallucination guard (no ambiguity)
- `LLM_API_ERROR` → always confirmed by parseClaudeResponse (no ambiguity)
- `HARNESS_ERROR` → always confirmed by harness exception (no ambiguity)
- `PASS` after re-run validator confirms → close, no issue
- `WRONG_CITATION` after re-run validator confirms (verifier finds text at different position, Tier A/B match) → HIGH confidence, rule-only classification sufficient
- `VERIFIER_DISAGREE` after re-run confirms → ambiguous (verifier finds text but at different position than extension reported; root cause unknown) → LLM second pass appropriate

**LLM prompt schema (single-pass, structured output):**
```json
{
  "severity": "P0|P1|P2|P3",
  "category": "WRONG_CITATION|VERIFIER_DISAGREE|GOOGLE_DOM_DRIFT|USPTO_API_DRIFT|UI_BROKEN|...",
  "root_cause_hypothesis": "string (one sentence)",
  "confidence": 0.0-1.0,
  "rationale": "string (2-3 sentences)"
}
```

Input to LLM: verifier verdict (tier, expected_citation, observed_citation, pdf_snippet path), iteration context (patent_id, category hint, selected_text), re-run validator result (confirmed N/3 times).

**Prompt style:** Single-pass `--output-format json` with inline schema description. Validated by existing buildPickerPrompt pattern in llm-driver.js. Do NOT use chain-of-thought (adds latency, no accuracy gain for closed taxonomy).

**v3.0 dependency:** `llm-driver.js` (invokeClaudeP, parseClaudeResponse, validateLlmSelection pattern), `llm-report.js` (appendLlmIteration with new triage_result field), `error-codes.js` (ERROR_CLASSES as the valid category enum).

**Complexity:** MEDIUM. New triage prompt builder; new validation function for triage output schema; extends llm-report.js iteration schema.

---

### 3. Rich-Context Auto-Issue Filer

**What good auto-filed issues look like (OSS evidence):** Playwright's own test failure issues include: test title + file:line, screenshot attachment, trace.zip link, expected vs received values. Vitest issues for browser-mode include: browser console output, DOM snapshot. The best auto-filed issues are self-contained reproducers.

**Template structure (extending Phase 29 e2e-report-issue.mjs):**

```markdown
## Bug: [ERROR_CLASS] — [patent_id] [case_id]

**Reproducer:** `npm run e2e:explore -- --patent US11427642 --seed abc123`
**Run ID:** `2026-05-22T03-00-00Z`
**Fingerprint:** `sha256:...` (dedup key — closes duplicate if already open)

### What Happened
- **Observed citation:** `4:35` (extension output)
- **Expected (golden):** `4:37`
- **Verifier tier:** Tier B (whitespace-normalized match)
- **Confirmed by re-run:** 2/3 replays reproduced

### PDF Evidence
![PDF snippet at cited position](artifacts/2026-05-22T03-00-00Z/US11427642-snippet.png)

### Verifier Detail
```
selectedText: "the thermal resistance..."
expected_text_at_4:37: "the thermal resistance..."  ← verifier finds it here
observed_text_at_4:35: "the thermal resistance..."  ← extension reported this
```

### LLM Triage
- **Severity:** P1
- **Root cause hypothesis:** Off-by-2 line count on OCR-normalized patent
- **Confidence:** 0.87
- **Rationale:** ...

### Diff vs Golden
```diff
- 4:37  (golden baseline test-cases.js line 142)
+ 4:35  (observed this run)
```
```

**v3.0 dependencies:** `e2e-report-issue.mjs` (Phase 29 fingerprint + gh CLI issue creation), `pdf-snippet.js` (DIAG-03 PNG generation), `llm-report.js` (rationale/confidence fields), `report.js` (verifier_verdict, citation fields).

**Complexity:** LOW-MEDIUM. Template extension to existing issue filer; no new infrastructure needed.

---

### 4. Tiered Corpus Promotion

**What OSS does (WPT, Selenium, Playwright):**

- **WPT/wptrunner:** Uses `.ini` metadata files with `expected: FAIL` or `disabled` status per test per platform. The `wpt update-expectations` command regenerates metadata from run results. Quarantine = `disabled` in metadata. Promotion = removing `disabled` flag after enough green runs. No special quarantine file — metadata IS the quarantine system.

- **Playwright:** `@flaky` tag + `--grep-invert @flaky` excludes from gating job; separate non-blocking job runs flaky tests for visibility. Promotion = remove `@flaky` tag when failure rate drops below threshold.

- **Vitest/Jest convention:** Separate `*.quarantine.test.js` files or a `__quarantine__` directory; CI runs them in a non-required job that publishes results without blocking the build.

**Recommended pattern for this codebase:**

```
tests/
  test-cases.js          ← golden (gating, 76 cases, 100% pass required)
  test-cases-quarantine.js  ← NEW: quarantine bucket (non-gating)
```

- Auto-add: confirmed finding (re-run 2/3, triage complete) → `appendQuarantineCase()` writes to test-cases-quarantine.js
- CI job: `npm run e2e:quarantine` runs the quarantine spec as a separate Playwright project; publishes quarantine-report.json as artifact; does NOT block main CI green
- Promotion: human opens PR that moves entry from test-cases-quarantine.js → test-cases.js; requires quarantine spec green on that entry for 3 consecutive nightly runs (tracked via quarantine-report.json history)

**Complexity:** MEDIUM. New test-cases-quarantine.js format (mirrors test-cases.js schema); new quarantine.spec.js Playwright spec; new npm script; CI workflow change to add non-gating job.

---

### 5. Local + CI Runtime Split

**The handoff problem:** `e2e:explore` runs locally and writes `llm-report.json` to `tests/e2e/artifacts/{runId}/`. The nightly CI cron needs to consume that file for triage/validator/quarantine without re-running the LLM.

**Three viable patterns (assessed against this codebase's constraints):**

1. **Committed artifact on a data branch** (`artifacts/` branch or `tests/e2e/artifacts-committed/` tracked folder): Developer runs `e2e:explore`, then `git add tests/e2e/artifacts-committed/llm-report.json && git commit`. The nightly CI cron runs on latest commit of `main`/`artifacts` branch and ingests the committed file. **Pro:** Simple, auditable, no extra auth. **Con:** Binary/JSON churn in main branch; artifact grows unbounded unless rotated. **Verdict: preferred for this codebase given single-developer scale.**

2. **GitHub Actions `workflow_run` trigger + artifact passthrough**: A local-triggered workflow run uploads llm-report.json as a GitHub Actions artifact; the nightly cron uses `workflow_run` event and `actions/download-artifact@v4` with `run-id`. **Pro:** No repo churn. **Con:** Requires a GitHub Actions runner to trigger the upload workflow (not pure local dev); cross-workflow download requires `actions:read` token; cron cannot reference "latest local run" without additional plumbing. **Verdict: over-engineered for single developer.**

3. **Committed to a dedicated non-main branch** (`llm-reports` branch): `e2e:explore` post-hook commits llm-report.json to the `llm-reports` branch. Nightly cron checks out that branch, reads the file, then processes. **Pro:** Main branch stays clean. **Con:** Two-branch coordination adds cognitive overhead. **Verdict: reasonable but unnecessary complexity over option 1.**

**Recommended:** Pattern 1 (committed artifact) with a `.gitignore` exemption for `tests/e2e/artifacts-committed/` and a `npm run e2e:commit-report` helper that copies the latest llm-report.json to the committed path and stages it. The nightly cron reads from the committed path.

**v3.0 dependency:** `run-id.js` (resolveRunId), `llm-report.js` (llmReportPathFor), `e2e-explore-ci-guard.test.js` (CI guard already prevents accidental `e2e:explore` in CI).

**Complexity:** LOW. Script + .gitignore change + CI workflow YAML edit.

---

### 6. Weekly Analytics Digest

**Format conventions from engineering practice:**

Leading indicators (predict future problems): quarantine growth rate, LLM hallucination rate (LLM_HALLUCINATED_SELECTION count / total iterations), VERIFIER_DISAGREE rate (agreement-gap trend).

Lagging indicators (confirm past outcomes): total findings filed this week, issues closed, quarantine entries promoted to golden, cost spend vs cap.

**Digest structure:**

```markdown
## Patent Citation Tool — Weekly Test Digest (2026-05-19 → 2026-05-25)

### Findings This Week
- LLM exploratory runs: 3 (87 iterations)
- New anomalies confirmed: 4
- Issues filed: 4 (2 P1, 2 P2)
- Issues resolved: 1

### Classification Breakdown
| Class | This Week | Trend |
|-------|-----------|-------|
| PASS | 71 | → |
| WRONG_CITATION | 8 | ↑ +3 |
| VERIFIER_DISAGREE | 4 | → |
| LLM_HALLUCINATED_SELECTION | 3 | ↓ -1 |
| LLM_API_ERROR | 1 | → |

### Quarantine Status
- Total quarantined: 7 (+4 this week)
- Ready for promotion: 0
- Promoted to golden: 0

### Cost
- LLM spend this week: $2.14 / $100 monthly cap (2%)
- Remaining budget: $97.86

### Action Items
- [ ] WRONG_CITATION spike: 3 new cases in OCR-heavy patents → investigate Tier 5 regression
- [ ] 2× P1 issues open > 7 days → review
```

**Implementation:** GitHub Actions weekly cron (`schedule: - cron: '0 9 * * 1'`); reads llm-report.json + quarantine-report.json + open GitHub issues via `gh issue list`; generates markdown; posts as GitHub issue with `type: digest` label or commits to `docs/digests/`.

**Complexity:** LOW. Node script + weekly cron job + `gh` CLI calls (already used in e2e-report-issue.mjs pattern).

---

## Feature Dependencies

```
llm-report.json (v3.0 Phase 31)
    └──feeds──> Re-run validator
                    └──confirms──> Hybrid triage classifier
                                       └──produces──> Rich-context issue filer
                                       └──produces──> Corpus promotion (quarantine append)

Corpus promotion (quarantine bucket)
    └──feeds──> Weekly analytics digest (quarantine growth metric)

Rich-context issue filer
    └──feeds──> Weekly analytics digest (findings count, issue status)

Local + CI runtime split
    └──enables──> ALL of the above to run in nightly CI cron
```

### Dependency Notes

- **Re-run validator requires llm-report.json:** The validator reads `iterations[]` with `patent_id`, `selected_text`, `observed_citation` fields written by Phase 31's llm-driver.js.
- **Hybrid triage requires re-run validator output:** The rule layer needs the `replay_verdict` (confirmed N/3) to decide whether to invoke the LLM second pass; classifying before re-run would misclassify flakes as real bugs.
- **Issue filer requires triage output:** The rich payload (severity, confidence, rationale) comes from the triage classifier. Filing before triage produces an incomplete issue.
- **Corpus promotion requires confirmed + triaged finding:** Auto-adding an unconfirmed anomaly to quarantine would pollute the corpus with flakes.
- **Local + CI split is an enabler, not a consumer:** It does not depend on other v3.1 features; it must be implemented first (or alongside re-run validator) so the nightly cron can ingest llm-report.json.
- **Weekly digest depends on all other features:** It aggregates outputs from triage, issue filer, and quarantine. Can be stubbed with partial data early; full digest requires all other features complete.

---

## MVP Definition

### Launch With (v3.1 Phase 32+)

These must all ship together — the loop is not closed without all of them:

- [ ] Re-run validator — without it, issue filing has unacceptable false-positive rate
- [ ] Hybrid triage classifier — without it, every confirmed finding costs a full LLM call
- [ ] Rich-context issue filer (extending Phase 29) — without it, filed issues are not actionable
- [ ] Tiered corpus promotion — without it, confirmed findings have nowhere to land
- [ ] Local + CI runtime split handoff — without it, the loop only runs locally, never in nightly cron

### Add After Core Loop Validates (v3.1 later phases)

- [ ] Weekly analytics digest — valuable once there are 2-3 weeks of quarantine data; add after first confirmed findings are in quarantine

### Future Consideration (v3.2+)

- [ ] Quarantine promotion automation (N-consecutive-green run detection) — reduce human friction once promotion volume justifies it
- [ ] GitHub Discussions / Slack digest output — once team grows beyond solo developer
- [ ] Configurable severity routing (P0 → immediate Slack, P1/P2 → weekly digest) — once alert fatigue becomes a concern

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Local + CI runtime split (handoff) | HIGH — prerequisite for everything | LOW | P1 |
| Re-run validator | HIGH — false-positive prevention | MEDIUM | P1 |
| Hybrid triage classifier | HIGH — cost control | MEDIUM | P1 |
| Rich-context issue filer | HIGH — actionability | LOW-MEDIUM | P1 |
| Tiered corpus promotion | HIGH — corpus integrity | MEDIUM | P1 |
| Weekly analytics digest | MEDIUM — visibility | LOW | P2 |

**Priority key:**
- P1: Must have for loop closure (v3.1 core)
- P2: Should have, add in final v3.1 phase
- P3: Nice to have, future consideration

---

## OSS Prior Art

| Pattern | OSS Example | What We Adopt |
|---------|-------------|---------------|
| Deterministic replay N times to confirm flake | WPT `--disable-intermittent` after N inconsistent runs; Playwright `retries: 2` in CI | 3-replay verifier-only confirm gate before triage |
| Non-gating quarantine job | Playwright `@flaky` tag + grep-invert; WPT `disabled` metadata | Separate `test-cases-quarantine.js` + non-gating CI project |
| Hybrid rule + LLM classifier | Healthcare triage RAG systems; Atlassian flaky test classifier | Rule layer handles 6/8 error classes; LLM only for VERIFIER_DISAGREE |
| Structured JSON output as pipeline glue | `claude -p --output-format json --json-schema` (Context7/claude-code docs) | Triage output schema: {severity, category, confidence, rationale} |
| Cross-workflow artifact passthrough | GitHub Actions `workflow_run` + `actions/download-artifact@v4`; dawidd6 action | Committed artifact on main branch (simpler for single-dev) |
| Auto-issue with reproducer + artifact | Playwright HTML reporter + `actions/upload-artifact`; Allure report CI pattern | Extend e2e-report-issue.mjs with reproducer command + PDF snippet attach |
| Weekly engineering digest | CI metrics digest (2-tier: leading indicators for devs, lagging for roadmap) | Markdown issue with `digest` label; weekly GitHub Actions cron |

---

## Sources

- WPT expectation metadata system: https://web-platform-tests.org/tools/wptrunner/docs/expectation.html
- Flaky test triage replay pattern (10-run sample, 4+/10 = real bug): https://stevekinney.com/courses/self-testing-ai-agents/flaky-test-triage
- Flaky test quarantine process (detection, isolation, tracking, fix-or-retire): https://www.minware.com/guide/best-practices/flaky-test-quarantine
- Atlassian flaky test management at scale: https://www.atlassian.com/blog/atlassian-engineering/taming-test-flakiness-how-we-built-a-scalable-tool-to-detect-and-manage-flaky-tests
- Hybrid LLM + rule-based classifier pattern: https://medium.com/@ceciliabonucchi/bridging-intelligence-the-next-evolution-in-ai-with-hybrid-llm-and-rule-based-systems-db0d89998c6d
- Structured CLI output as pipeline glue (`--output-format json` + schema): https://stevekinney.com/courses/self-testing-ai-agents/structured-cli-output-as-pipeline-glue
- Cross-workflow artifact passing (workflow_run + download-artifact v4): https://medium.com/@michamarszaek/cross-workflow-artifact-passing-in-github-actions-7f20acbb1b70
- GitHub Actions artifact download cross-workflow (dawidd6 action, run-id pattern): https://github.com/dawidd6/action-download-artifact
- LLM classification accuracy on borderline cases (68% vs 82%): https://adamwiggins.com/posts/triage-embedding-classifier/
- Playwright flaky test retry standard (`retries: CI ? 2 : 0`, ceiling of 2): https://stevekinney.com/courses/self-testing-ai-agents/flaky-test-triage
- Engineering leading vs lagging indicators (two-tier dashboard): https://medium.com/human-code-engine/transforming-engineering-team-performance-the-art-of-leading-and-lagging-indicators-6b0d2ce46dd6

---
*Feature research for: LLM-augmented CI feedback loop — Patent Citation Tool v3.1*
*Researched: 2026-05-22*

# Roadmap: Patent Citation Tool

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-02)
- ✅ **v1.1 Silent Mode + Infrastructure** — Phases 5-7 (shipped 2026-03-03)
- ✅ **v1.2 Store Polish + Accuracy Hardening** — Phases 8-13 (shipped 2026-03-03)
- ✅ **v2.0 Firefox Port** — Phases 14-17 (shipped 2026-03-05)
- ✅ **v2.1 CI/CD Pipeline** — Phases 18-19 (shipped 2026-03-05)
- ✅ **v2.2 Matching Robustness** — Phases 20-22 (shipped 2026-03-05)
- ✅ **v2.3 Post-v2.2 Hardening** — Phases 23-25 (shipped 2026-05-12)
- 🚧 **v3.0 Autonomous E2E Testing Agent** — Phases 26-31 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-02</summary>

- [x] **Phase 1: Extension Foundation and PDF Fetch** (2/2 plans) — completed 2026-02-28
- [x] **Phase 2: PDF Parsing Pipeline** (2/2 plans) — completed 2026-03-01
- [x] **Phase 3: Text Matching and Citation Generation** (3/3 plans) — completed 2026-03-01
- [x] **Phase 4: Citation Output** (1/1 plan) — completed 2026-03-02

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Silent Mode + Infrastructure (Phases 5-7) — SHIPPED 2026-03-03</summary>

- [x] **Phase 5: Silent Mode** (2/2 plans) — completed 2026-03-02
- [x] **Phase 6: USPTO API Fallback** (3/3 plans) — completed 2026-03-02
- [x] **Phase 7: Server-side Cache** (3/3 plans) — completed 2026-03-03

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Store Polish + Accuracy Hardening (Phases 8-13) — SHIPPED 2026-03-03</summary>

- [x] **Phase 8: Test Harness Foundation** (3/3 plans) — completed 2026-03-03
- [x] **Phase 9: Accuracy Audit and Algorithm Fixes** (2/2 plans) — completed 2026-03-03
- [x] **Phase 10: Icon Set and Manifest Updates** (2/2 plans) — completed 2026-03-03
- [x] **Phase 11: Options Page Polish** (2/2 plans) — completed 2026-03-03
- [x] **Phase 12: Store Listing and Submission** (2/2 plans) — completed 2026-03-03
- [x] **Phase 13: Offscreen Wrap-Hyphen Fix** (1/1 plan) — completed 2026-03-03

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 Firefox Port (Phases 14-17) — SHIPPED 2026-03-05</summary>

- [x] **Phase 14: Shared Code Extraction** (2/2 plans) — completed 2026-03-04
- [x] **Phase 15: esbuild Build Pipeline** (3/3 plans) — completed 2026-03-04
- [x] **Phase 16: Firefox Extension** (3/3 plans) — completed 2026-03-04
- [x] **Phase 17: Cross-Browser Validation** (2/2 plans) — completed 2026-03-05

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

<details>
<summary>✅ v2.1 CI/CD Pipeline (Phases 18-19) — SHIPPED 2026-03-05</summary>

- [x] **Phase 18: Core CI Workflow** (1/1 plan) — completed 2026-03-05
- [x] **Phase 19: CI Hardening** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.1-ROADMAP.md`

</details>

<details>
<summary>✅ v2.2 Matching Robustness (Phases 20-22) — SHIPPED 2026-03-05</summary>

- [x] **Phase 20: OCR Normalization and Concat Refactor** (2/2 plans) — completed 2026-03-05
- [x] **Phase 21: Gutter-Tolerant Matching** (1/1 plan) — completed 2026-03-05
- [x] **Phase 22: Validation and Golden Baseline** (1/1 plan) — completed 2026-03-05

Full details: `.planning/milestones/v2.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.3 Post-v2.2 Hardening (Phases 23-25) — SHIPPED 2026-05-12</summary>

- [x] **Phase 23: Column Inference for Headerless PDFs** (3/3 plans) — completed 2026-05-12
- [x] **Phase 24: Firefox AMO Validation Cleanup** (1/1 plan) — completed 2026-05-12
- [x] **Phase 25: Automatic Release Workflow** (1/1 plan) — completed 2026-05-12

Full details: `.planning/milestones/v2.3-ROADMAP.md`

</details>

### 🚧 v3.0 Autonomous E2E Testing Agent (Phases 26-31) — ACTIVE

- [x] **Phase 26: Playwright Harness Scaffolding** — Build the Playwright + Chromium foundation: load unpacked Chrome extension, shadow-pierce, clipboard shim, service-worker readiness, and `data-testid` UI hooks (completed 2026-05-14)
- [x] **Phase 27: Selection Emulation + 76-Case Deterministic Suite** — Programmatic selection that triggers the extension; replay all 76 golden patents end-to-end; capture screenshot + DOM artifacts on failure (completed 2026-05-15)
- [x] **Phase 28: Independent PDF Verifier** — Second code path that re-parses each PDF and confirms the cited text lives near the cited column:line; structured JSON report + failure taxonomy; PDF page snippet artifacts (completed 2026-05-15)
- [x] **Phase 29: CI Nightly Cron + Auto-Issue Filing** — GitHub Actions nightly cron (rotating 30-patent sample, full 76 on Sundays); fingerprint-based idempotent auto-issue filing on failure (completed 2026-05-17)
- [ ] **Phase 30: Worker Fault-Injection** — Cloudflare Worker `X-PCT-Test-Mode` header skips KV writes; fault-injection E2E forces Google PDF failure and verifies USPTO fallback produces an accurate citation
- [ ] **Phase 31: LLM Exploratory Mode + Docs** — `npm run e2e:explore` drives Claude Code headless against fresh patent selections with local spend ledger ($80 warn / $100 hard-stop, CI-blocked); structured exploration report + `tests/e2e/README.md`

## Phase Details

### Phase 26: Playwright Harness Scaffolding
**Goal**: A reliable Playwright + Chromium foundation that loads the unpacked extension, pierces the citation UI's closed Shadow DOM, observes the clipboard in headless, and exposes reusable selection/observation primitives for every subsequent phase
**Depends on**: Phase 17 (Firefox Cross-Browser Validation, transitively for the `dist/chrome/` build artifact); no v3.0 phase dependencies
**Requirements**: HARN-01, HARN-02, HARN-03, HARN-04, HARN-05, HOOK-01
**Success Criteria** (what must be TRUE):
  1. Running `npm run e2e:smoke` against a freshly-built `dist/chrome/` launches a Chromium instance with the extension loaded, navigates to one known Google Patents page, and the smoke spec passes — confirming `launchPersistentContext` + `channel: 'chromium'` + service-worker readiness all work in headless on Ubuntu CI
  2. A Playwright test can read the extension's citation UI from its closed-mode Shadow DOM via the `addInitScript`-installed `attachShadow` override, with no source change to the shipped extension other than adding `data-testid` attributes
  3. A Playwright test can observe the silent-mode clipboard payload in headless Chromium (via the `__lastCopiedText__` copy-event shim), so silent-mode citations are testable end-to-end without `xvfb-run`
  4. The `tests/e2e/lib/` library exports framework-agnostic primitives (extension load, navigation, selection, citation observation, artifact capture) that both Playwright specs and the Phase 31 LLM runner import; spec files contain no inline harness logic
**Plans**: TBD
**UI hint**: yes

### Phase 27: Selection Emulation + 76-Case Deterministic Suite
**Goal**: Deterministic regression coverage — every one of the 76 golden patents drives the extension through a real selection and the observed citation matches the golden baseline, with diagnostics captured on any failure
**Depends on**: Phase 26 (harness primitives — extension loader, Shadow DOM piercing, clipboard shim)
**Requirements**: SEL-01, SEL-02, SEL-03, SEL-04, DIAG-01, DIAG-02
**Success Criteria** (what must be TRUE):
  1. Running the deterministic E2E suite against all 76 golden patents produces a green pass for every case, matching the citations in `tests/golden/baseline.json` — confirming the selection + observation primitives are reliable at corpus scale
  2. Programmatic `selectText({containerSelector, charStart, charEnd})` calls reliably trigger the extension's existing `mouseup` listener (via Range API + dispatched `mouseup` with debounce-respecting wait), and `getCitation()` returns a structured `{citation, confidence, mode}` from either Shadow DOM or clipboard
  3. Each test case starts with cleared cookies, IndexedDB, and `chrome.storage` — running the suite in shuffled order produces identical results to sequential order, proving inter-case isolation
  4. Any failed assertion writes a full-page screenshot to `tests/e2e/artifacts/{run-id}/{case-id}-screenshot.png` and a DOM snapshot (including Shadow DOM contents) to `tests/e2e/artifacts/{run-id}/{case-id}-dom.html`, so a developer can triage the failure from artifacts alone without local repro
**Plans**: 9 plans (5 + 4 gap-closure)
- [x] 27-01-PLAN.md — selectText helper (TreeWalker + Range API + dispatched mouseup) + normalizer unit tests
- [x] 27-02-PLAN.md — settings helper (setTriggerMode via SW) + getCitation observation + artifacts wiring
- [x] 27-03-PLAN.md — 76-case regression spec with pre-flight DOM-drift smoke and per-test diagnostics
- [x] 27-04-PLAN.md — @smoke tagging + silent-mode end-to-end spec + npm scripts (e2e:smoke, e2e:regression, e2e:silent)
- [x] 27-05-PLAN.md — Run all three suites and verify DIAG-01/DIAG-02 artifact wiring
- [x] 27-06-PLAN.md — Gap closure: recalibrate baseline.json for 22 WRONG_CITATION cases (Bucket A)
- [x] 27-07-PLAN.md — Gap closure: regenerate HTML-form selectedText for 3 SELECTION/DOM_DRIFT cases (Buckets C+D)
- [x] 27-08-PLAN.md — Gap closure: skip synthetic-fixture cases in regression spec (Bucket E)
- [x] 27-09-PLAN.md — Gap closure: triage 7 TIMEOUT_PILL cases; data-fix or defer to Phase 28 (Bucket B)
**UI hint**: yes

### Phase 28: Independent PDF Verifier
**Goal**: A second, deliberately-independent code path that re-parses every cited PDF and confirms the selected text actually appears near the cited column:line — providing an oracle that catches citation bugs the golden baseline cannot
**Depends on**: Phase 27 (needs the deterministic 76-case suite to integrate verifier verdicts into; verifier calibration uses the golden corpus as ground truth)
**Requirements**: VFY-01, VFY-02, VFY-03, DIAG-03, RPT-01, RPT-02
**Success Criteria** (what must be TRUE):
  1. The deterministic suite emits a verifier verdict for every passing case, and the verifier's tiered matcher (exact → whitespace-normalized → ±N-line fuzzy) produces a >95% Tier-A/B/C pass rate against the 76-case corpus — confirming calibration is correct (neither too strict nor too loose)
  2. An ESLint `no-restricted-imports` rule prevents `tests/e2e/lib/pdf-verifier.ts` from importing any file under `src/` (including `src/shared/matching.js`), with `npm run lint` failing on violation — enforcing the verifier-independence claim at build time
  3. Every test run produces `tests/e2e/artifacts/{run-id}/report.json` listing every case with `{status, errorClass, links to artifacts}`, where `errorClass` is one of the fixed taxonomy values (`EXTENSION_NOT_LOADED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION`, `UI_BROKEN`, `VERIFIER_DISAGREE`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `FLAKE`)
  4. On a verifier disagreement, the harness renders the PDF page region corresponding to the cited column:line via pdfjs+canvas+sharp and writes the cropped PNG to `tests/e2e/artifacts/{run-id}/{case-id}-pdf-snippet.png` — so a human reviewing the issue can see what the verifier expected vs what the extension cited
**Plans**: 5 plans (3 waves)
- [x] 28-01-PLAN.md (Wave 1) — Verifier core: @napi-rs/canvas install, pdf-verifier.js (parsePdf, inferColumnLine, runMatcher), pdf-fetch.js, Vitest unit tests (VFY-01, VFY-03)
- [x] 28-02-PLAN.md (Wave 1) — Report writer + 8-string taxonomy: report.js (appendCase, writeReport, reportPathFor), error-codes.js extended to all 8 RPT-02 strings (RPT-01, RPT-02)
- [x] 28-03-PLAN.md (Wave 2, depends on 28-01) — PDF snippet renderer: pdf-snippet.js (renderPdfSnippet) using pdfjs legacy + auto-detected @napi-rs/canvas + sharp crop (DIAG-03)
- [x] 28-04-PLAN.md (Wave 2, depends on 28-01) — ESLint install + eslint.config.js with no-restricted-imports rule scoped to pdf-verifier.js, `npm run lint` chained into `npm test` (VFY-02)
- [x] 28-05-PLAN.md (Wave 3, depends on 28-01..04) — Calibration script (≥95% Tier A/B/C gate), regression.spec.js verifier wiring, Phase 27 TIMEOUT_PILL_DEFERRED adjudication (VFY-01, VFY-03, DIAG-03, RPT-01, RPT-02)

### Phase 29: CI Nightly Cron + Auto-Issue Filing
**Goal**: An operationalized E2E pipeline — GitHub Actions runs the deterministic + verifier suite nightly, detects upstream drift before spamming issues, and idempotently files (or comments on) a single GitHub issue per distinct failure root cause
**Depends on**: Phase 27 (deterministic suite) + Phase 28 (verifier verdicts + report schema)
**Requirements**: CRON-01, CRON-02, CRON-03, CRON-04, CRON-05
**Success Criteria** (what must be TRUE):
  1. Pushing a tag with a deliberately-broken citation triggers the nightly cron (or its `workflow_dispatch` equivalent) and produces a GitHub issue (or comment on an existing one) within 10 minutes containing the failing patent ID, the error class, and a link to the uploaded artifact bundle
  2. Two consecutive nightly runs that fail with the same `{caseId, errorClass, top-of-stack-hash}` fingerprint produce ONE issue with two comments — not two separate issues — confirming fingerprint-based deduplication works
  3. The nightly cron runs a rotating 30-patent sample Mon–Sat and the full 76 on Sunday, completing within the workflow's 30-minute timeout on `ubuntu-latest` with Playwright Chromium installed via `channel: 'chromium'` (no `xvfb-run` required)
  4. When a pre-flight smoke probe detects Google Patents DOM drift, the cron emits ONE meta-issue ("Google Patents drift suspected") and skips the 76-patent suite — preventing a 76-issue storm on a platform-side change
**Plans**: 4 plans
- [x] 29-01-PLAN.md — scripts/select-cron-cases.mjs (rotation algorithm + 8 Vitest unit tests for determinism, Sunday/weekday branching, modulus wrap-around) — CRON-02
- [x] 29-02-PLAN.md — scripts/e2e-report-issue.mjs (fingerprint dedup issue filer + fixtures + 15+ Vitest tests for fingerprint, dedup, FLAKE filter, body template, sanitization) — CRON-04, CRON-05
- [x] 29-03-PLAN.md — .github/workflows/e2e-nightly.yml (cron + workflow_dispatch + Playwright cache + smoke gate + artifact upload) + playwright.config.js CI retries — CRON-01, CRON-03
- [x] 29-04-PLAN.md — Label setup + workflow_dispatch smoke run + human verification checkpoint — CRON-01, CRON-03, CRON-04, CRON-05

### Phase 30: Worker Fault-Injection
**Goal**: Coverage for the USPTO/Cloudflare Worker fallback path — both the test-mode contract (CI does not pollute the production KV cache) and the production fallback path (when Google PDF fetch fails, the extension still produces an accurate citation via USPTO)
**Depends on**: Phase 26 (harness for the route-abort test) + Phase 28 (verifier confirms the fallback path's citation is actually correct, not just present)
**Requirements**: INJ-01, INJ-02
**Success Criteria** (what must be TRUE):
  1. A request to the Cloudflare Worker with `X-PCT-Test-Mode: true` returns the same response body as a normal request but does NOT write to the shared KV cache — confirmed by an integration test that calls the Worker with the header set and asserts no KV write occurred
  2. A fault-injection E2E spec uses `page.route('https://patentimages.storage.googleapis.com/**', route => route.abort())` to force the Google PDF path to fail, then asserts the extension's citation matches the golden baseline AND the verifier independently confirms the cited text — proving the USPTO/Worker fallback path is wired correctly end-to-end
  3. The fault-injection spec runs as part of the nightly cron and counts in the `report.json` summary, so a future Worker regression (auth break, USPTO API change, KV quota exhaustion) surfaces as a tracked failure rather than a silent production outage
**Plans**: 3 plans (3 waves)
- [x] 30-01-PLAN.md (Wave 1) — Worker X-PCT-Test-Mode guard + vitest-pool-workers integration test (INJ-01)
- [x] 30-02-PLAN.md (Wave 2, depends on 30-01) — Fault-injection E2E spec with route-abort + dual canaries + verifier gate (INJ-02)
- [ ] 30-03-PLAN.md (Wave 3, depends on 30-01, 30-02) — WORKER_FALLBACK_FAILED taxonomy entry + nightly cron wiring (INJ-02)

### Phase 31: LLM Exploratory Mode + Docs
**Goal**: Local-dev-only exploratory testing — `npm run e2e:explore` autonomously picks patents and unusual selections via headless `claude -p`, verifies them via the Phase 28 verifier, classifies plugin-vs-LLM failures distinctly, and enforces a hard $100/month spend cap before any LLM invocation
**Depends on**: Phase 26 (harness primitives), Phase 27 (selection + observation), Phase 28 (verifier + report schema + failure taxonomy), Phase 29 (CI guard pattern), Phase 30 (Worker test-mode header for cache-friendly exploration)
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, LLM-05, LLM-06, LLM-07, LLM-08, DOC-01
**Success Criteria** (what must be TRUE):
  1. Running `npm run e2e:explore` locally autonomously picks a fresh patent + selection via `claude -p --output-format json` (against the Max 5 subscription headless-API credit pool, no `ANTHROPIC_API_KEY` required), drives the harness, verifies the citation via the independent PDF verifier, and writes a structured `tests/e2e/artifacts/{run-id}/llm-report.json` log of every iteration that is sufficient to deterministically reproduce any failure
  2. The runner refuses to start when cumulative monthly LLM spend recorded in `tests/e2e/.llm-spend-ledger.json` is ≥ $100 (hard block, checked BEFORE each invocation, not after) and emits a warning when ≥ $80 — verified by simulating a ledger pre-populated to each threshold
  3. The runner refuses to execute when `process.env.CI` is truthy and exits with a clear "exploratory mode is local-only" error — verified by running it in a job where `CI=true` is set, so nightly cron never accidentally consumes the LLM credit pool
  4. Before triggering the plugin, the runner validates that the LLM-chosen text actually appears in the patent's specification (via `document.body.innerText.includes(...)`); when validation fails, the iteration is classified as `LLM_HALLUCINATED_SELECTION` (NOT `WRONG_CITATION`) — so plugin issues and LLM issues are diagnosed distinctly in the report
  5. `tests/e2e/README.md` documents how to run the deterministic suite + the exploratory mode locally, lists the `data-testid` test-hook contract, explains how to add new test cases, and explains how the LLM spend ledger works (including how to reset it for a new month) — sufficient for a new contributor to run both modes without asking for help
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Extension Foundation and PDF Fetch | v1.0 | 2/2 | Complete | 2026-02-28 |
| 2. PDF Parsing Pipeline | v1.0 | 2/2 | Complete | 2026-03-01 |
| 3. Text Matching and Citation Generation | v1.0 | 3/3 | Complete | 2026-03-01 |
| 4. Citation Output | v1.0 | 1/1 | Complete | 2026-03-02 |
| 5. Silent Mode | v1.1 | 2/2 | Complete | 2026-03-02 |
| 6. USPTO API Fallback | v1.1 | 3/3 | Complete | 2026-03-02 |
| 7. Server-side Cache | v1.1 | 3/3 | Complete | 2026-03-03 |
| 8. Test Harness Foundation | v1.2 | 3/3 | Complete | 2026-03-03 |
| 9. Accuracy Audit and Algorithm Fixes | v1.2 | 2/2 | Complete | 2026-03-03 |
| 10. Icon Set and Manifest Updates | v1.2 | 2/2 | Complete | 2026-03-03 |
| 11. Options Page Polish | v1.2 | 2/2 | Complete | 2026-03-03 |
| 12. Store Listing and Submission | v1.2 | 2/2 | Complete | 2026-03-03 |
| 13. Offscreen Wrap-Hyphen Fix | v1.2 | 1/1 | Complete | 2026-03-03 |
| 14. Shared Code Extraction | v2.0 | 2/2 | Complete | 2026-03-04 |
| 15. esbuild Build Pipeline | v2.0 | 3/3 | Complete | 2026-03-04 |
| 16. Firefox Extension | v2.0 | 3/3 | Complete | 2026-03-04 |
| 17. Cross-Browser Validation | v2.0 | 2/2 | Complete | 2026-03-05 |
| 18. Core CI Workflow | v2.1 | 1/1 | Complete | 2026-03-05 |
| 19. CI Hardening | v2.1 | 1/1 | Complete | 2026-03-05 |
| 20. OCR Normalization and Concat Refactor | v2.2 | 2/2 | Complete | 2026-03-05 |
| 21. Gutter-Tolerant Matching | v2.2 | 1/1 | Complete | 2026-03-05 |
| 22. Validation and Golden Baseline | v2.2 | 1/1 | Complete | 2026-03-05 |
| 23. Column Inference for Headerless PDFs | v2.3 | 3/3 | Complete    | 2026-05-12 |
| 24. Firefox AMO Validation Cleanup | v2.3 | 1/1 | Complete    | 2026-05-12 |
| 25. Automatic Release Workflow | v2.3 | 1/1 | Complete    | 2026-05-12 |
| 26. Playwright Harness Scaffolding | v3.0 | 3/3 | Complete    | 2026-05-14 |
| 27. Selection Emulation + 76-Case Deterministic Suite | v3.0 | 10/9 | Complete    | 2026-05-15 |
| 28. Independent PDF Verifier | v3.0 | 5/5 | Complete    | 2026-05-15 |
| 29. CI Nightly Cron + Auto-Issue Filing | v3.0 | 4/4 | Complete    | 2026-05-17 |
| 30. Worker Fault-Injection | v3.0 | 3/4 | In Progress|  |
| 31. LLM Exploratory Mode + Docs | v3.0 | 0/0 | Not started | - |

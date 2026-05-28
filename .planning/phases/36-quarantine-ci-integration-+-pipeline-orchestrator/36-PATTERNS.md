# Phase 36: Quarantine CI Integration + Pipeline Orchestrator - Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 7 (5 new, 2 modified) + 1 config (package.json)
**Analogs found:** 7 / 7 (every file has an exact or strong in-repo analog — this phase composes existing code)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/e2e/specs/quarantine.spec.js` (NEW) | test (Playwright spec) | event-driven (per-corpus-entry test gen) | `tests/e2e/specs/regression.spec.js` | exact (D-01: "mirrors regression.spec.js") |
| `scripts/run-triage-pipeline.mjs` (NEW) | orchestrator/CLI | batch (spawnSync stage chain) | `scripts/quarantine-append.mjs` (spawnSync+cwd, isMain, exit codes) + `scripts/e2e-rerun-validator.mjs` (dirname-sibling output) | role-match (composed from 2) |
| `scripts/e2e-report-issue.mjs` (MODIFIED) | service/CLI | request-response (gh issue file) | itself — extend `--source` family + parameterize `NIGHTLY_LABEL` | exact (self, line 43/566/470) |
| `.github/workflows/e2e-nightly.yml` (MODIFIED) | config (CI) | event-driven | itself — existing label-ensure (97), gated download (108), continue-on-error regression (191) | exact (self) |
| `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` (NEW) | test (vitest spawnSync integration) | batch | `tests/e2e/scripts/e2e-quarantine-append.test.js` | exact (D-16: "Phase 35 pattern") |
| `tests/unit/e2e-report-issue.test.js` (MODIFIED) | test (vitest unit) | request-response | itself — `processReport() — end-to-end dispatch with mocked gh` block (line 293) | exact (self) |
| YAML-assertion test (NEW; e.g. `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js`) | test (vitest grep-on-text) | transform | `tests/e2e/scripts/e2e-lint-triage-guard.test.js` (reads file as text, asserts presence) | role-match |
| `package.json` (MODIFIED) | config | — | itself — `e2e:regression` (line 10), `lint` (line 17) | exact (self) |

---

## Pattern Assignments

### `tests/e2e/specs/quarantine.spec.js` (test, event-driven per-entry)

**Analog:** `tests/e2e/specs/regression.spec.js` (exact — D-01 mandates mirroring it)

**Imports pattern** (regression.spec.js lines 26-46) — copy verbatim, swap the corpus import:
```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { TEST_CASES_QUARANTINE } from '../../test-cases-quarantine.js'; // ← was: TEST_CASES from '../../test-cases.js'
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';
import { selectText } from '../lib/selection.js';
import { getCitation } from '../lib/observation.js';
import { setTriggerMode } from '../lib/settings.js';
import { captureScreenshot, captureDomSnapshot } from '../lib/artifacts.js';
import { resolveRunId } from '../lib/run-id.js';
import { appendCase, reportPathFor } from '../lib/report.js';
import { WRONG_CITATION, NO_CITATION_PRODUCED } from '../lib/error-codes.js';
```

**Module-level setup** (regression.spec.js lines 48-51) — copy verbatim:
```javascript
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const RUN_ID = resolveRunId();
const REPORT_PATH = reportPathFor(RUN_ID);
```

**Per-entry test generation** (regression.spec.js lines 269-321, 430-455) — the load-bearing loop. Copy the `for...of` + per-case `loadExtension → setTriggerMode → gotoPatent → selectText → getCitation`, the `try/catch` errorClass classification (lines 403-417), and the `finally { appendCase(...); cleanup(); throttle }` block (lines 430-454):
```javascript
for (const tc of TEST_CASES_QUARANTINE) {
  test(tc.id, async () => {
    const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
    const patentId = patentIdFromCaseId(tc.id);   // reuse helper (lines 162-172) — quarantine ids share US<digits>-... shape (RESEARCH Pattern 2)
    let observed = null; let caseStatus = 'failed'; let errorClass = null;
    const artifacts = { screenshot: null, dom: null, pdf_snippet: null };
    try {
      await setTriggerMode(context, 'auto');
      await gotoPatent(page, patentId);
      await selectText({ page, uniqueSubstring: tc.selectedText });
      observed = await getCitation(page, { mode: 'auto' });
      // NOTE: quarantine entries are EXPECTED to fail (RESEARCH Pattern 2). Planner decides
      // whether to keep a baseline assertion or just record observed. Either way the spec is
      // non-gating (continue-on-error in YAML) and MUST appendCase so the issue filer has detail.
      caseStatus = 'passed';
    } catch (e) {
      caseStatus = 'failed';
      errorClass = (observed && observed.citation) ? WRONG_CITATION : NO_CITATION_PRODUCED;
      try { artifacts.screenshot = await captureScreenshot(page, RUN_ID, tc.id); } catch {}
      try { artifacts.dom = await captureDomSnapshot(page, RUN_ID, tc.id); } catch {}
      throw e;
    } finally {
      try { appendCase(REPORT_PATH, { id: tc.id, status: caseStatus, errorClass,
        citation: observed ? observed.citation : null, verifier_verdict: null, artifacts }); } catch {}
      await cleanup();
    }
  });
}
```

**Key differences from regression.spec.js (RESEARCH Pattern 2):**
- Empty corpus (`TEST_CASES_QUARANTINE = []`, confirmed at `tests/e2e/test-cases-quarantine.js:5`) → the `for` loop registers 0 tests → `--pass-with-no-tests` (in the npm script) makes Playwright exit 0 (SC-1).
- Quarantine entries originate from real failures, so they are EXPECTED to fail — do NOT inherit regression's hard `expect(...).toBe(baseline[...])`. The spec is non-gating; its job is to emit `report.json` for the issue filer. Planner picks whether to assert or just observe.
- DROP the regression-only machinery: `SMOKE_IDS`, `SYNTHETIC_CATEGORIES`, `TIMEOUT_PILL_DEFERRED_IDS`, the `verifyCitation`/`renderPdfSnippet` verifier soft-check, the `baseline.json` import, and the `beforeAll` DOM-drift pre-flight (optional — planner may keep a lightweight version). These are not in Phase 36 scope.
- The `report.json` lands at `tests/e2e/artifacts/{RUN_ID}/report.json` via `reportPathFor(RUN_ID)` — this is EXACTLY the path `e2e-report-issue.mjs --source quarantine` reads (see Pattern for that file). Do not invent a new report path.

---

### `scripts/run-triage-pipeline.mjs` (orchestrator/CLI, batch spawnSync chain)

**Analogs:** `scripts/quarantine-append.mjs` (CLI scaffold: PROJECT_ROOT resolve, parseArgs, isMain guard, exit codes) + `scripts/e2e-rerun-validator.mjs` (dirname-sibling output path D-11). This is the ONE genuinely new file; it composes the 4 existing CLIs.

**Imports + PROJECT_ROOT** (copy from quarantine-append.mjs lines 8-27; orchestrator needs only built-ins + spawnSync):
```javascript
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
const FIXTURES_ROOT  = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT]; // WR-05 bound on --llm-report
```

**parseArgs pattern** (copy the strict-positional parser from quarantine-append.mjs lines 36-70 / triage-classifier lines 58-98) — change `--input` to `--llm-report`, keep the `equals syntax not supported` (exit 2) + `missing value` (exit 2) + `next.startsWith('--')` (WR-04) guards verbatim. The orchestrator's own bad-flag exit is 2; but per D-06 the *pipeline run itself* exits 0 always.

**WR-05 path-bound on `--llm-report`** (copy quarantine-append.mjs lines 182-193 verbatim) — the downloaded artifact path must reside under `tests/e2e/artifacts/` or `tests/e2e/fixtures/`.

**Run-dir resolution (D-07)** — copy the `path.dirname(input)` sibling pattern from e2e-rerun-validator.mjs line 166:
```javascript
const runDir = path.dirname(resolvedLlmReportPath);
const rerunReport  = path.join(runDir, 'rerun-report.json');
const triageReport = path.join(runDir, 'triage-report.json');
```

**Core pattern — spawnSync stage chain with cwd:PROJECT_ROOT, exit-0-always (D-05/D-06)** — this is the load-bearing new code. Pattern source is RESEARCH.md Pattern 1 (composed from quarantine-append's spawnSync usage + rerun-validator's sibling output):
```javascript
function runStage(label, scriptRel, args) {
  const r = spawnSync('node', [path.join(PROJECT_ROOT, scriptRel), ...args], {
    cwd: PROJECT_ROOT,            // Pitfall 6 — pin cwd so each CLI's sibling-discovery resolves
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = r.status === 0;
  process.stdout.write(`[run-triage-pipeline] ${label}: ${ok ? 'ok' : 'FAILED (status=' + r.status + ')'}\n`);
  if (r.stdout) process.stdout.write(r.stdout);
  if (!ok && r.stderr) process.stdout.write('[stderr] ' + r.stderr);
  return ok;
}

runStage('rerun-validator',   'scripts/e2e-rerun-validator.mjs',   ['--input', resolvedLlmReportPath]);
runStage('triage-classifier', 'scripts/e2e-triage-classifier.mjs', ['--input', resolvedLlmReportPath]); // exit 1 in CI BY DESIGN (D-08)
runStage('issue-file',        'scripts/e2e-report-issue.mjs',      ['--source', 'triage', '--triage-report', triageReport]);
runStage('quarantine-append', 'scripts/quarantine-append.mjs',     ['--input', triageReport]);

process.exit(0); // D-06 — ALWAYS 0. The filed issue is the signal, not a red X.
```

**CRITICAL — triage-classifier CI gate (D-08, RESEARCH Pitfall 3):** Stage 2 (`e2e-triage-classifier.mjs`) exits **1** when `CI=true || GITHUB_ACTIONS=true` — see the gate at `scripts/e2e-triage-classifier.mjs:154-160`. This is CORRECT (subscription-local only). The orchestrator MUST treat this exit-1 as a normal logged failure, never an error, and continue. Do NOT add `env: { CI: '' }` to the YAML step (anti-pattern). In CI, `triage-report.json` is never written, so stages 3-4 find no input and no-op gracefully (e2e-report-issue.mjs `mainTriage` exits 1 on missing triage-report at line 639-642; quarantine-append exits 1 on missing input at line 195) — both handled by `runStage` logging.

**isMain guard** — copy verbatim from quarantine-append.mjs lines 304-313 (the WR-02 `fileURLToPath + path.resolve` Windows-safe form):
```javascript
const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) { main().catch((e) => { process.stdout.write('[run-triage-pipeline] uncaught: ' + e.message + '\n'); process.exit(0); }); } // NOTE: exit 0 even on uncaught — D-06
```
**Discretion (CONTEXT + RESEARCH OQ2):** Optionally write a `pipeline-summary.json` to `runDir` via `atomicWriteJson` (import from `tests/e2e/lib/rerun-validator.js` as the other scripts do) for forensics. Always log the summary object to stdout. Do NOT wire GitHub Actions artifact upload.

---

### `scripts/e2e-report-issue.mjs` (service/CLI, MODIFIED — add `--source quarantine`)

**Analog:** itself — the existing `--source` dispatch family. D-15: reuse `processReport` per-case path, parameterize the hardcoded `NIGHTLY_LABEL`.

**Change 1 — accept `quarantine` in `parseSourceArgs`** (lines 566-618). The validator currently rejects anything but `regression`/`triage` at line 584:
```javascript
// CURRENT (line 584):
if (next !== 'regression' && next !== 'triage') {
// CHANGE TO:
if (next !== 'regression' && next !== 'triage' && next !== 'quarantine') {
```

**Change 2 — parameterize the label** (line 43 + `makeRealGhClient` lines 470-546). Currently `const NIGHTLY_LABEL = 'e2e-nightly'` is a module constant baked into `listOpenNightlyIssues` (line 475) and `createIssue` (line 490). Make it a parameter (RESEARCH Pattern 3 / State-of-the-art):
```javascript
// Source: lines 470-495 (existing) — thread label through.
export function makeRealGhClient(repo, label = NIGHTLY_LABEL) {
  return {
    listOpenNightlyIssues() {
      const raw = execSync(`gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`, ...);
      ...
    },
    createIssue(title, body) {
      const escapedTitle = title.replaceAll('"', '\\"');
      const out = execSync(`gh issue create --title "${escapedTitle}" --label ${label} --body-file -`, { input: body, ... });
      ...
    },
    // createIssueWithLabels / listOpenWithSearch / addLabel / commentIssue unchanged
  };
}
```

**Change 3 — CLI dispatch** (lines 679-760). Add a `quarantine` branch that mirrors the existing `regression` default block (lines 699-759) but constructs `makeRealGhClient(repo, 'e2e-quarantine')`. The quarantine `report.json` lives at the SAME `tests/e2e/artifacts/{runId}/report.json` path the default branch already reads (lines 742-749) — reuse that whole block, only the gh client's label differs:
```javascript
const gh = source === 'quarantine'
  ? makeRealGhClient(repo, 'e2e-quarantine')
  : makeRealGhClient(repo);
// ... then for source 'regression' OR 'quarantine': read artifacts/{runId}/report.json, processReport(report, { ghClient: gh, runId, repo });
```

**Security — inherited for free (D-15 / Phase 35 CR-01):** `processReport` already calls `sanitizeCaseId` at line 435 before any shell interpolation. The quarantine branch routes through `processReport`, so it inherits the CASE_ID_RE allow-list guard (line 48/130) with NO new sanitization code. Do NOT write a parallel filing path that skips it. `createIssue` already escapes `"` in the title (line 488). Label is a hardcoded literal `'e2e-quarantine'` (no user-input interpolation) → no escaping needed.

**Discretion (RESEARCH Pattern 3 decision point):** `buildIssueTitle` (line 205) and `buildIssueBody` (line 228) hardcode `[e2e-nightly]` / "E2E nightly failure" strings. SC-4 only asserts the **`e2e-quarantine` label arg**, so leaving the title is acceptable (recommend keeping title machinery shared, swap only the label, to minimize surface).

---

### `.github/workflows/e2e-nightly.yml` (config CI, MODIFIED — append 4 gated steps)

**Analog:** itself. Append AFTER the existing fault-injection issue-filer (after line 234, before the Upload step at line 235). All 4 steps gated `if: inputs.llm_run_id != ''` (the SAME expression the download step uses at line 108 — do NOT invent a new gating expression, RESEARCH Pitfall 5).

**Label-ensure step** — copy the "Ensure e2e-nightly label exists" step (lines 97-105) verbatim, swap the label name + color (6-char hex, NO `#` prefix per line 104 comment). Recommended color `d93f0b` (distinct from e2e-nightly's `0075ca`), gated on `llm_run_id`:
```yaml
- name: Ensure e2e-quarantine label exists
  if: inputs.llm_run_id != ''
  run: |
    gh label create "e2e-quarantine" --color "d93f0b" \
      --description "Auto-filed by nightly quarantine suite" --force 2>/dev/null || true
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}   # mirrors download step env (line 117)
```

**Triage-pipeline step** — new; gated. Points at the downloaded artifact from the existing download step (line 126 writes to `downloaded-llm-report/llm-report.json`):
```yaml
- name: Run triage pipeline
  if: inputs.llm_run_id != ''
  run: node scripts/run-triage-pipeline.mjs --llm-report downloaded-llm-report/llm-report.json
  # Exits 0 always (D-06). triage-classifier CI gate fires → LLM 2nd-pass skipped (D-08). Do NOT add env: CI:''.
```
NOTE: `downloaded-llm-report/` is the workflow CWD root, NOT under `tests/e2e/artifacts/`. The orchestrator's WR-05 bound (ALLOWED_INPUT_ROOTS = artifacts/fixtures) will REJECT this path. **Planner must resolve:** either relax the orchestrator's WR-05 to also allow the download dir, OR have the YAML step move/symlink the report under `tests/e2e/artifacts/{runId}/` first. Flag — see "Open Items".

**Quarantine spec step** — copy `continue-on-error: true` from the regression step (line 191) and add its own `timeout-minutes` (D-14):
```yaml
- name: Run quarantine spec (non-gating)
  id: quarantine
  if: inputs.llm_run_id != ''
  continue-on-error: true     # mirrors regression (line 191) — QUAR-04 non-gating
  timeout-minutes: 15         # D-14 — quarantine can't starve the 30-min job cap (line 50)
  run: npm run e2e:quarantine
```

**Quarantine-failure issue filer** — gated on the quarantine step's outcome (mirrors the regression issue-filer gating at line 202 `steps.regression.outcome == 'failure'`):
```yaml
- name: File quarantine issues on failure
  if: inputs.llm_run_id != '' && steps.quarantine.outcome == 'failure'
  run: node scripts/e2e-report-issue.mjs --source quarantine
```

**Timeout budget comment (ORCH-03, SC-5)** — add a YAML comment block documenting the arithmetic (RESEARCH Pattern 4 has the full text). Must mention: job cap = 30 min (line 50); quarantine adds N×~90s/case (per-test timeout in `tests/e2e/playwright.config.js:17`); CURRENT N=0 → 0 added minutes; CEILING at ~20 cases (20×90s = 30 min); per-step `timeout-minutes:15` mitigation; >20-case → daily `--grep` rotation (deferred). The YAML grep test asserts a `TIMEOUT BUDGET` token exists.

**Anti-patterns (RESEARCH):** Do NOT create a separate `e2e-quarantine.yml` (same concurrency group `e2e-nightly` at line 40 → mutex collision, Pitfall 1). Do NOT fork `playwright.config.js`. Do NOT add `env: CI:''` to the triage step.

---

### `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` (test, vitest spawnSync integration)

**Analog:** `tests/e2e/scripts/e2e-quarantine-append.test.js` (exact — D-16: reuse the Phase 35 harness verbatim).

**Harness scaffold** (copy lines 17-94 verbatim, change SCRIPT_PATH):
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/run-triage-pipeline.mjs'); // ← changed
const FIXTURE_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const ARTIFACTS_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
```

**beforeEach fixture copy + mock-gh + corpus override** (copy lines 39-76 verbatim) — creates `artifacts/test-<rand>/`, copies the 3 Phase 35 fixtures, writes a mock-gh bash shim that logs `$@` to a transcript and returns `[]` for `issue list` (so create fires) + a URL for `issue create`, and a fresh empty corpus at `corpusOverridePath`. For the pipeline test the input is `llm-report.json` (so the `--llm-report` flag points there; the chain writes `rerun-report.json` + `triage-report.json` siblings).

**Spawn helper — CRITICAL env difference (RESEARCH OQ1 / Assumption A4):** Copy `spawnAppend` (lines 82-94) BUT for the full-chain test add `CI: '', GITHUB_ACTIONS: ''` to the env so the triage-classifier CI gate does NOT fire (otherwise stages 3-4 no-op and the assertions fail):
```javascript
function spawnPipeline(args, extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, PATH: mockGhDir + ':' + process.env.PATH,
      GITHUB_REPOSITORY: 'test/test', QUARANTINE_CORPUS_PATH_OVERRIDE: corpusOverridePath,
      CI: '', GITHUB_ACTIONS: '', ...extraEnv },        // ← full-chain test sets CI='' (D-16)
    encoding: 'utf8', timeout: 30000 });                // higher timeout — chains 4 node spawns
}
```

**Test ORCH-01 full-chain (D-16, SC-2):** `spawnPipeline(['--llm-report', path.join(runDir, 'llm-report.json')])`; assert: `r.status === 0`; `rerun-report.json` + `triage-report.json` exist in `runDir`; mock-gh transcript contains `issue create`; the override corpus file now has ≥1 entry (re-import or regex-count `TEST_CASES_QUARANTINE`).

**Test D-08 CI-gated no-op (separate test):** same setup but `extraEnv = { CI: 'true' }`; assert `r.status === 0`, `rerun-report.json` written, stdout contains the triage stage's `FAILED` log (or "skipped in CI"), corpus unchanged.

**Test ORCH-01 exit-0-on-stage-failure:** feed a malformed/missing sibling so a stage exits non-zero; assert pipeline still `status === 0`.

---

### `tests/unit/e2e-report-issue.test.js` (test, vitest unit, MODIFIED)

**Analog:** itself — the `processReport() — end-to-end dispatch with mocked gh` block (lines 293-374). Add a `--source quarantine` label-assertion test (SC-4).

**Two viable approaches (planner picks):**
1. **Unit (pure-function) approach** — like the existing `processReport` tests (lines 341-356): inject a mock `ghClient` whose `createIssue` records the call, call `makeRealGhClient` replacement OR drive `processReport` with a label-aware mock. Since `processReport` calls `ghClient.createIssue(title, body)` (line 458, no label arg — the label is baked into the gh client), the SC-4 assertion is best done by testing `makeRealGhClient(repo, 'e2e-quarantine')` produces a client whose `createIssue` interpolates `--label e2e-quarantine`. This requires mocking `execSync` (the existing unit file does NOT currently mock execSync — it only tests pure functions + injected ghClient).
2. **spawnSync + mock-gh approach (RECOMMENDED for SC-4)** — mirror `e2e-quarantine-append.test.js`: spawn `e2e-report-issue.mjs --source quarantine` with mock-gh on PATH and a fixture `report.json` under `artifacts/{runId}/`, then assert the mock-gh transcript contains `--label e2e-quarantine` (NOT `e2e-nightly`). This exercises the real label-threading through `makeRealGhClient`. The mock-gh shim is the lines 53-66 pattern.

**Mock ghClient shape** (lines 312-317, for the pure-function approach):
```javascript
const ghCalls = [];
const ghClient = {
  listOpenNightlyIssues: () => [],
  createIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 999 }; },
  commentIssue: (number, body) => { ghCalls.push({ op: 'comment', number, body }); },
};
```

**CR-01 reuse assertion (RESEARCH Validation §3):** add a quarantine case with a shell-metachar id (e.g. `'US123;rm -rf /'`) and assert it is skipped (mirrors the existing "skips invalid case IDs" test at lines 358-373) — proves `sanitizeCaseId` is live on the quarantine path.

---

### `package.json` (config, MODIFIED)

**Analog:** itself — `e2e:regression` (line 10) for the new spec script; `lint` (line 17) for the extension.

**Add 2 scripts** (after line 16, mirroring `e2e:regression` line 10 + `build:chrome` prefix per D-04):
```jsonc
"e2e:quarantine": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/quarantine.spec.js --retries=0 --pass-with-no-tests",
"e2e:triage-pipeline": "node scripts/run-triage-pipeline.mjs"
```
Both `--retries=0` and `--pass-with-no-tests` are VERIFIED in `@playwright/test@1.60.0` (RESEARCH §Standard Stack). `--retries=0` overrides config's `retries: process.env.CI ? 1 : 0` (`tests/e2e/playwright.config.js:21`) without forking the config (D-02).

**Extend lint** (line 17 — append `scripts/run-triage-pipeline.mjs` to the eslint file list, D-16 done-criterion):
```jsonc
"lint": "eslint tests/e2e/lib/ scripts/e2e-triage-classifier.mjs scripts/e2e-rerun-validator.mjs scripts/e2e-report-issue.mjs scripts/quarantine-append.mjs scripts/promote-from-quarantine.mjs scripts/update-golden.js scripts/run-triage-pipeline.mjs"
```

---

## Shared Patterns

### Strict CLI arg parsing (exit-2 on bad flags)
**Source:** `scripts/quarantine-append.mjs:36-70` (and identical in `e2e-triage-classifier.mjs:58-98`, `e2e-rerun-validator.mjs:47-86`)
**Apply to:** `run-triage-pipeline.mjs` (`--llm-report`)
**Idioms:** `--flag=value` → exit 2 ("equals syntax not supported"); bare `--flag` with no value → exit 2 ("missing value"); `next.startsWith('--')` (WR-04 — reject a flag-as-value); `--help/-h` → usage + exit 0.

### WR-05 path-bound on file inputs
**Source:** `scripts/quarantine-append.mjs:182-193` (verbatim across triage-classifier:181-190, e2e-report-issue:628-637)
**Apply to:** `run-triage-pipeline.mjs` (`--llm-report`)
```javascript
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT];
const insideAllowedRoot = ALLOWED_INPUT_ROOTS.some(
  (root) => resolved === root || resolved.startsWith(root + path.sep));
if (!insideAllowedRoot) { process.stderr.write('... must reside under ...'); process.exit(1); }
```
**Note:** this guard is the source of the download-dir-path conflict flagged in Open Items.

### spawnSync with cwd: PROJECT_ROOT (Pitfall 6)
**Source:** `tests/e2e/scripts/e2e-quarantine-append.test.js:82-94` (test side) — production stage-runner is new in `run-triage-pipeline.mjs`
**Apply to:** `run-triage-pipeline.mjs` stage chain + both new vitest spawnSync tests
**Why:** pinning `cwd: PROJECT_ROOT` ensures each chained CLI's `path.dirname(input)` sibling-discovery resolves against the repo, not the spawner's CWD.

### isMain guard (WR-02 Windows-safe)
**Source:** `scripts/quarantine-append.mjs:304-306` (identical in all 3 CLIs)
**Apply to:** `run-triage-pipeline.mjs`
```javascript
const isMain = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
```

### mock-gh bash shim + QUARANTINE_CORPUS_PATH_OVERRIDE + tmpDir isolation
**Source:** `tests/e2e/scripts/e2e-quarantine-append.test.js:39-94`
**Apply to:** `e2e-run-triage-pipeline.test.js`; optionally the `--source quarantine` label test
**Pieces:** (1) mock-gh writes `$@` to a transcript and answers `issue list/create/edit`; (2) `QUARANTINE_CORPUS_PATH_OVERRIDE` → tmpDir corpus so the committed file is never mutated; (3) fixtures copied into `artifacts/{runId}/` for WR-05; (4) `afterEach` rmSync cleanup of both `runDir` and `mockGhDir`.

### Phase 35 fixtures (integration-test inputs)
**Source:** `tests/e2e/fixtures/phase35-{triage,llm,rerun}-report.json` (VERIFIED present)
**Shape (VERIFIED):** triage has 3 findings — iter1 WRONG_CITATION/high, iter2 HARNESS_ERROR/low, iter3 WRONG_CITATION/critical → `filterFindingsForFiling` admits **2 CONFIRMED** (iter1, iter3), rejects iter2 (HARNESS_ERROR, Pitfall 8). LLM iterations: iter1=US11427642-spec-short-1, iter2=US11427642-claims-1 (LLM_RESPONSE_PARSE_ERROR), iter3=US11427642-cross-col.
**Apply to:** `e2e-run-triage-pipeline.test.js` happy-path. NOTE the mismatch with D-16's "1 CONFIRMED finding" — see Open Items.

### Label self-bootstrap via `gh label create --force`
**Source:** `.github/workflows/e2e-nightly.yml:97-105`
**Apply to:** the new "Ensure e2e-quarantine label exists" step. 6-char hex color, NO `#` prefix; `|| true` so a `--force` rejection is non-fatal; `env: GH_TOKEN`.

### `if: inputs.llm_run_id != ''` gating + `continue-on-error: true`
**Source:** download step `e2e-nightly.yml:108`; regression step `:191`/`:202`
**Apply to:** all 4 new YAML steps (gating); quarantine spec step (continue-on-error). Reuse the EXACT gating expression — Pitfall 5 (the existing `llm_run_id` input already has `default: ''` at line 31).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every Phase 36 file has an exact or strong in-repo analog. `run-triage-pipeline.mjs` is the only genuinely-new file, but its scaffold (parseArgs, WR-05, isMain) is copied from the existing CLIs and its stage-chain spawnSync is RESEARCH Pattern 1 composed from existing usage. |

---

## Open Items for Planner (load-bearing — must resolve in plans)

1. **WR-05 vs. download-dir path conflict (HIGH).** The YAML triage step runs `--llm-report downloaded-llm-report/llm-report.json`, but the orchestrator's WR-05 bound (copied from quarantine-append) only allows `tests/e2e/artifacts/` + `tests/e2e/fixtures/`. As written, the orchestrator will exit 1 on the real CI path. Resolve by either (a) adding the download dir to `ALLOWED_INPUT_ROOTS`, or (b) having the YAML step relocate the artifact under `tests/e2e/artifacts/{runId}/` before invoking the orchestrator. The Phase 35 CLIs the orchestrator spawns ALSO enforce WR-05 internally, so the report must land under an allowed root regardless.

2. **Fixture mismatch: D-16 says "1 CONFIRMED finding" but `phase35-triage-report.json` has 2 CONFIRMED (VERIFIED).** The integration test must either (a) assert against the actual 2-CONFIRMED reality (2 issues, 2 corpus entries), or (b) the plan adds a new single-finding fixture. Recommend (a) — reuse the existing fixtures, adjust the assertion counts.

3. **`appendCase` schema for non-existent patentFile (LOW).** Quarantine corpus entries carry `patentFile: './tests/fixtures/<patent>.json'` (quarantine-append.mjs:258). The quarantine spec mirrors regression which navigates a LIVE patent via `patentIdFromCaseId`. RESEARCH Pattern 2 notes the `US<digits>-...` id shape makes `patentIdFromCaseId` reuse work for real-patent cases. Planner confirms the empty-corpus case (N=0) needs none of this; flag only if seeding non-live cases later.

4. **Discretion items (CONTEXT §Claude's Discretion):** label color hex (recommend `d93f0b`), quarantine `timeout-minutes` (recommend 15), `pipeline-summary.json` write (recommend log + optional local write, no artifact upload), failure-detection mechanism (recommend `steps.quarantine.outcome == 'failure'` — simplest; `processReport` already iterates report.json so no extra parse needed). Per CLAUDE.md, if the planner surfaces these via AskUserQuestion, verify the captured selection before proceeding.

## Metadata

**Analog search scope:** `scripts/`, `tests/e2e/specs/`, `tests/e2e/scripts/`, `tests/e2e/lib/`, `tests/unit/`, `.github/workflows/`, `package.json`, `tests/e2e/fixtures/`
**Files scanned/read in full:** 11 (regression.spec.js, e2e-report-issue.mjs, test-cases-quarantine.js, e2e-rerun-validator.mjs, e2e-quarantine-append.test.js, e2e-nightly.yml, package.json, quarantine-append.mjs, e2e-triage-classifier.mjs, report.js, e2e-report-issue.test.js)
**Project skills:** none found (`.claude/skills/`, `.agents/skills/` absent)
**Pattern extraction date:** 2026-05-27

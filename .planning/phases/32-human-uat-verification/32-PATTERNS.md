# Phase 32: HUMAN-UAT Verification - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 11 (4 modified, 7 new)
**Analogs found:** 10 / 11 (the human narrative `32-UAT-EVIDENCE.md` is hand-written and has no algorithmic analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/e2e-explore.mjs` (modified) | CLI orchestrator | request-response (per-iteration loop) | self (existing structure) — extend in place | exact |
| `tests/e2e/lib/llm-ledger.js` (modified) | utility (append-only persistent store) | file-I/O / read-modify-write | self (existing structure) — extend `monthlyTotal`/`checkSpendCap` symmetry | exact |
| `.github/workflows/e2e-nightly.yml` (modified) | workflow (cron + dispatch) | event-driven (CI step gating) | self — same file; mirror `force_full_suite` input shape and `if: steps.smoke.outcome` gating | exact |
| `package.json` (modified) | config (npm scripts) | n/a | self — `"e2e:explore"` entry pattern | exact |
| `scripts/e2e-upload-llm-report.mjs` (new) | CLI orchestrator (gh shell-out) | request-response (sequential gh calls) | `scripts/e2e-report-issue.mjs` | role-match (both: `execSync('gh ...')` orchestration; pure-function helpers + CLI shim + DI-mock-friendly client) |
| `.github/workflows/e2e-ingest-llm-report.yml` (new) | workflow (manual dispatch only) | event-driven (one-shot artifact upload) | `.github/workflows/e2e-nightly.yml` | role-match (workflow_dispatch + permissions + concurrency + actions/upload-artifact@v4) |
| `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (new) | test (CLI integration) | request-response (spawnSync) | `tests/e2e/scripts/e2e-explore-ci-guard.test.js` | exact (same script, same `spawnSync` pattern, same env-injection style) |
| `tests/e2e/scripts/e2e-upload-llm-report.test.js` (new) | test (unit with mock) | request-response (mocked `gh` via DI) | `tests/unit/e2e-report-issue.test.js` `processReport()` block | exact (ghClient injection — `listOpenNightlyIssues` / `createIssue` / `commentIssue` mock pattern is the precedent for mocking gh shell-out) |
| `tests/e2e/fixtures/uat-phase32-llm-report.json` (new) | fixture data | file-I/O (read-only test data) | `tests/unit/fixtures/sample-llm-report.json` | role-match (same schema target — both validated by `appendLlmIteration`'s REQUIRED_ENTRY_FIELDS) |
| `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` (new) | test (schema guard) | file-I/O (round-trip validate) | `tests/unit/llm-report.test.js` Test 13 (lines 304–316) | exact (fixture-roundtrip via `appendLlmIteration`) |
| `.planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md` (new) | docs (manual narrative) | n/a — human-written | none (no algorithmic analog) | no-analog |

---

## Pattern Assignments

### `scripts/e2e-explore.mjs` (modified — CLI orchestrator)

**Analog:** itself (in-file patterns) — Phase 32 is additive, extending existing scaffolding.

**Existing arg-parser pattern to extend** (`scripts/e2e-explore.mjs:81–107`):
```javascript
function parseArgs(argv) {
  let iterations = 5;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--iterations' && argv[i + 1]) {
      iterations = parseInt(argv[i + 1], 10);
      if (Number.isNaN(iterations) || iterations < 1) {
        process.stderr.write(`[e2e-explore] invalid --iterations value: ${argv[i + 1]}\n`);
        process.exit(2);
      }
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(/* help block */);
      process.exit(0);
    }
  }
  return { iterations };
}
```
Extend by adding a third `else if (argv[i] === '--phase' && argv[i + 1])` branch with strict `^\d+$` validation. Update returned shape to `{ iterations, phase }`. **Reject equals-syntax** (`--phase=32`) per RESEARCH Pitfall 2.

**Existing pre-flight cap pattern to mirror** (`scripts/e2e-explore.mjs:399–409`):
```javascript
// Initial cap check — bail early if already blocked at startup.
const initialLedger = readLedger(LEDGER_PATH);
const initialCap = checkSpendCap(initialLedger);
if (initialCap.status === 'block') {
  process.stderr.write(`[e2e-explore] ${initialCap.message}\n`);
  process.exit(4);
}
if (initialCap.status === 'warn') {
  process.stderr.write(`[e2e-explore] ${initialCap.message}\n`);
}
```
**Apply identically** for `checkPhaseSpendCap(initialLedger, phase)` immediately after the existing block. Use new exit code `6` for phase-cap-at-startup (extends documented codes at lines 30–36).

**Existing mid-run cap + stopAll pattern to mirror** (`scripts/e2e-explore.mjs:130–141`):
```javascript
const capLedger = readLedger(LEDGER_PATH);
const capCheck = checkSpendCap(capLedger);
if (capCheck.status === 'block') {
  process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
  return { stopAll: true };
}
if (capCheck.status === 'warn') {
  process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
}
```
For Phase 32, the mid-run phase check fires **after** `appendLedgerEntry` (lines 191–196 first call; lines 225–232 retry call), not before invocation. The `stopAll: true` return is already plumbed through `main()`'s loop break at line 428 — **no main-loop change needed**.

**Existing `appendLedgerEntry` call shape to extend** (`scripts/e2e-explore.mjs:191–196`):
```javascript
appendLedgerEntry(LEDGER_PATH, {
  iso, model: modelId, cost_usd: costUsd,
  tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
  tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
  iteration_n: iterationN, run_id: runId,
});
```
Add one new field: `phase` (from closure over `runOneIteration`'s args). Apply identically to the retry append at lines 225–232 (which already adds `retry: true`). Pass `phase` into `runOneIteration` at line 427.

**Exit-code documentation pattern** (`scripts/e2e-explore.mjs:29–35`):
```javascript
// Exit codes:
//   0 — run completed (zero or more iterations; not all need to PASS)
//   1 — CI guard fired (LLM-07: exploratory mode is local-only)
//   2 — bad --iterations argument
//   3 — claude CLI not found on PATH
//   4 — monthly spend cap reached at STARTUP (LLM-06 hard block at $100)
//   5 — fatal/unexpected error in main()
```
Add `6 — phase spend cap reached at STARTUP or mid-run` (also `2` reused for bad `--phase` value per the existing `--iterations` convention).

---

### `tests/e2e/lib/llm-ledger.js` (modified — utility, file-I/O)

**Analog:** itself — extend `monthlyTotal` and `checkSpendCap` by mirror-symmetry.

**Existing `monthlyTotal` pattern to mirror** (`tests/e2e/lib/llm-ledger.js:97–99`):
```javascript
export function monthlyTotal(ledger, month = currentMonth()) {
  return ledger?.months?.[month]?.total_usd ?? 0;
}
```
**New `phaseTotal(ledger, phase)`** iterates *all* months (phases span calendars) and sums per-iteration `cost_usd` where `it.phase === phase`. Round to 6dp matching the established convention. See RESEARCH Pattern 2 for the exact body.

**Existing `checkSpendCap` pattern to mirror** (`tests/e2e/lib/llm-ledger.js:111–139`):
```javascript
export function checkSpendCap(ledger, month = currentMonth()) {
  const total = monthlyTotal(ledger, month);
  if (total >= HARD_CAP_USD) {
    return {
      status: 'block',
      monthly_total_usd: total,
      month,
      message: `Monthly LLM spend $${total.toFixed(2)} >= $${HARD_CAP_USD}. ...`,
    };
  }
  if (total >= WARN_THRESHOLD_USD) {
    return { status: 'warn', monthly_total_usd: total, month, message: '⚠ ...' };
  }
  return { status: 'ok', monthly_total_usd: total, month, message: '' };
}
```
**New `checkPhaseSpendCap(ledger, phase)`** mirrors this exactly with `PHASE_HARD_CAP_USD = 10` / `PHASE_WARN_THRESHOLD_USD = 8` constants added after line 64. Return shape: `{ status, phase_total_usd, phase, message }` (note `phase_total_usd` and `phase` instead of `monthly_total_usd` and `month`).

**Existing constant-export pattern to mirror** (`tests/e2e/lib/llm-ledger.js:55–64`):
```javascript
export const HARD_CAP_USD = 100;
export const WARN_THRESHOLD_USD = 80;
```
Add immediately after: `export const PHASE_HARD_CAP_USD = 10;` and `export const PHASE_WARN_THRESHOLD_USD = 8;`.

**Existing JSDoc pattern for entry shape** (`tests/e2e/lib/llm-ledger.js:151–161`):
```javascript
/**
 * @param {string} ledgerPath
 * @param {{
 *   iso: string,
 *   model: string,
 *   cost_usd: number,
 *   tokens_in?: number,
 *   tokens_out?: number,
 *   iteration_n: number,
 *   run_id: string,
 * }} entry
 */
```
Add `phase?: string|null,` to the type. **No runtime change to `appendLedgerEntry` body** — it already calls `m.iterations.push(entry)` at line 181, so the new optional field rides through. This is a JSDoc-only edit on the function itself.

---

### `.github/workflows/e2e-nightly.yml` (modified — workflow)

**Analog:** itself — Phase 32 mirrors the existing `force_full_suite` input pattern and the `if: steps.smoke.outcome` gating discipline.

**Existing `workflow_dispatch.inputs` pattern to extend** (`.github/workflows/e2e-nightly.yml:21–26`):
```yaml
  workflow_dispatch:
    inputs:
      force_full_suite:
        description: 'Run all 66 live cases (override day-of-week rotation)'
        type: boolean
        default: false
```
Add a sibling input:
```yaml
      llm_run_id:
        description: 'Ingest workflow run_id containing llm-report artifact (Phase 32)'
        type: string
        required: false
        default: ''
```
**Critical:** `default: ''` (empty string, NOT `null`). RESEARCH Pitfall 3 documents that cron triggers leave inputs absent which evaluates to `null` in `if:` expressions — explicit `''` default avoids the YAML quirk.

**Existing step-gating pattern to mirror** (`.github/workflows/e2e-nightly.yml:111–113`):
```yaml
      - name: File meta-issue on smoke failure
        if: steps.smoke.outcome == 'failure'
        run: node scripts/e2e-report-issue.mjs --meta-drift
```
And the string-comparison precedent (`.github/workflows/e2e-nightly.yml:119`):
```yaml
          if [ "${{ inputs.force_full_suite }}" = "true" ]; then
```
The new step uses `if: inputs.llm_run_id != ''` — single-step gating mirrors the existing `if: steps.smoke.outcome == 'success'` discipline (lines 117, 133, 145, 153, 170).

**Existing `gh`-using step pattern with `GH_TOKEN`** (`.github/workflows/e2e-nightly.yml:111–113` + env block lines 43–46):
```yaml
    env:
      PLAYWRIGHT_RUN_ID: ${{ github.run_id }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      GITHUB_REPOSITORY: ${{ github.repository }}
```
Job-level env already provides `GITHUB_TOKEN`; the new download+validate step needs `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` if explicitly invoking `gh run download` (RESEARCH Example 4 line 676).

**Step insertion position:** After "Ensure e2e-nightly label exists" (line 97), BEFORE "Pre-flight smoke" (line 99). Position rationale per RESEARCH Insertion Map: schema-validity is a hard gate; placing it pre-smoke makes a malformed downloaded report fail fast before consuming smoke/regression budget. No `continue-on-error: true` on this step — D-03/D-06 make schema a hard gate.

**Schema-validate node -e block** (from RESEARCH Example 4 / Pattern 3): round-trip iterations through `appendLlmIteration` against a temp file. The validator throws on missing REQUIRED_ENTRY_FIELDS — exit non-zero propagates through `node -e` naturally.

---

### `.github/workflows/e2e-ingest-llm-report.yml` (new — workflow)

**Analog:** `.github/workflows/e2e-nightly.yml` (workflow header and concurrency conventions) + `.github/workflows/ci.yml` (artifact-upload pattern).

**`workflow_dispatch` header pattern from e2e-nightly.yml:18–37:**
```yaml
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      force_full_suite:
        description: '...'
        type: boolean
        default: false

concurrency:
  group: e2e-nightly
  cancel-in-progress: false

permissions:
  contents: read
  issues: write
```
**For ingest workflow:**
- NO `schedule:` block (manual dispatch only)
- `permissions:` reduced to `contents: read` ONLY (no issues filing; no actions write — the workflow is the artifact producer, not the triggerer)
- `concurrency.group: e2e-ingest-llm-report` (static, mirroring the nightly rationale at lines 28–33) and `cancel-in-progress: false`
- `inputs.payload_b64` is `type: string, required: true` (no default) — the helper always provides it

**Artifact upload pattern from e2e-nightly.yml:178–187:**
```yaml
      - name: Upload E2E artifacts
        if: always() && (steps.smoke.outcome == 'failure' || ...)
        uses: actions/upload-artifact@v4
        with:
          name: e2e-nightly-${{ github.run_id }}
          path: tests/e2e/artifacts/
          retention-days: 14
          if-no-files-found: warn
```
**For ingest workflow:** name is fixed `llm-report` (no run-id suffix — the consumer downloads by name via `gh run download <run_id> -n llm-report`), `retention-days: 14` (matches established convention), `if-no-files-found: error` (not `warn` — if the base64 decode produced nothing, that's a hard failure, not a missing-artifact case).

**`jobs.<job>.runs-on` + `timeout-minutes` pattern from e2e-nightly.yml:40–42:**
```yaml
jobs:
  e2e-nightly:
    runs-on: ubuntu-latest
    timeout-minutes: 30
```
For ingest: `runs-on: ubuntu-latest`, `timeout-minutes: 5` (small budget — single decode + upload).

**Skeleton from RESEARCH lines 390–422** is the canonical full file shape — copy literally.

---

### `scripts/e2e-upload-llm-report.mjs` (new — CLI orchestrator)

**Analog:** `scripts/e2e-report-issue.mjs` — the canonical `execSync('gh ...')` orchestration script in this repo. Same import set, same CLI-shim-at-bottom discipline.

**Imports pattern** (`scripts/e2e-report-issue.mjs:19–23`):
```javascript
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
```
For upload helper: drop `createHash`, add the path-resolution imports from e2e-explore.mjs (`resolveRunId`, `llmReportPathFor`). See RESEARCH lines 434–439 for the exact set.

**`execSync('gh ...')` invocation with stdin pattern** (`scripts/e2e-report-issue.mjs:294–298`):
```javascript
const escapedTitle = title.replaceAll('"', '\\"');
const out = execSync(
  `gh issue create --title "${escapedTitle}" --label ${NIGHTLY_LABEL} --body-file -`,
  { input: body, encoding: 'utf8' }
);
```
**For upload helper Stage 1:** `gh workflow run e2e-ingest-llm-report.yml -f payload_b64=@-` with `{ input: b64String, encoding: 'utf8' }`. The `@-` reads the value from stdin — same stdin pattern as `--body-file -`. This is critical to avoid shell-escaping a ~30KB base64 string on the command line (E2BIG risk).

**`execSync('gh ...')` invocation with JSON parse pattern** (`scripts/e2e-report-issue.mjs:280–285`):
```javascript
try {
  const raw = execSync(
    `gh api repos/${repo}/issues --method GET -f labels=${NIGHTLY_LABEL} -f state=open --paginate`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
} catch (err) {
  console.warn('[e2e-report-issue] listOpenNightlyIssues failed:', err.message);
  return [];
}
```
**For upload helper run-id capture:** `gh run list --workflow=e2e-ingest-llm-report.yml --limit 5 --json databaseId,createdAt` (RESEARCH Pattern 1). Wrap in try/catch with actionable error message.

**CLI shim discipline pattern** (`scripts/e2e-report-issue.mjs:316–389`):
```javascript
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // env reads, validation, dispatch
  process.exit(0);
}
```
**For upload helper:** `main()` function called at file bottom (mirrors e2e-explore.mjs:439 — `main().catch(err => { ... process.exit(5); });`). Same exit-code-with-context discipline. The helper has its own exit codes (1=no report, 2=oversize payload, 3=run_id not found — RESEARCH lines 447, 457, 478).

**Dependency-injection pattern for testability** (`scripts/e2e-report-issue.mjs:232`):
```javascript
export function processReport(report, { ghClient, runId, repo }) {
```
**For upload helper:** Export a pure function (e.g., `uploadReport({ readReport, execSync, ... }) ` or a `ghClient` object) so unit tests can inject mocked `execSync` and `readFile`. The CLI shim wires the real `execSync` and `fs.readFileSync`. **This is the testability contract** that makes `tests/e2e/scripts/e2e-upload-llm-report.test.js` clean.

**Pre-flight auth check pattern (NEW for Phase 32 per RESEARCH Pitfall 7):**
```javascript
// Mirrors the spawnSync-with-status-check at scripts/e2e-explore.mjs:110–120 (checkClaudeCli).
try {
  execSync('gh auth status', { stdio: 'ignore' });
} catch {
  process.stderr.write('[e2e-upload] gh not authenticated. Run `gh auth login`.\n');
  process.exit(7);  // new exit code distinct from gh-call failures
}
```
This is the `checkClaudeCli`-shaped guard, adapted for gh.

**Browser-open via gh CLI pattern** — RESEARCH Don't-Hand-Roll table line 331 mandates `gh run view <id> --web` instead of OS-detection + shell-out to `open`/`xdg-open`/`start`. Same `execSync` shape.

---

### `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (new — unit/integration test)

**Analog:** `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — same script under test, same `spawnSync` integration style.

**Test file structure pattern** (`tests/e2e/scripts/e2e-explore-ci-guard.test.js:17–24`):
```javascript
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-explore.mjs');
```
**Copy verbatim** — same script-under-test, same path-resolution depth.

**`spawnSync` invocation pattern** (`tests/e2e/scripts/e2e-explore-ci-guard.test.js:27–34`):
```javascript
it('Test 1: CI=true → exits 1 with "exploratory mode is local-only" in stderr', () => {
  const r = spawnSync('node', [SCRIPT_PATH, '--iterations', '1'], {
    env: { CI: 'true', PATH: process.env.PATH },
    encoding: 'utf8',
    timeout: 5000,
  });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('exploratory mode is local-only');
});
```
**For phase-flag tests:** Invoke with `--phase 32`, `--phase v32` (rejected), `--phase=32` (rejected per Pitfall 2), `--phase` with no value (rejected). The CI guard at e2e-explore.mjs:72 will fire FIRST if `CI` is set — so tests must explicitly pass `CI: '', GITHUB_ACTIONS: ''` and assert on the `--phase`-specific exit/stderr (mirror Test 3 at lines 46–62 which already shows how to override CI).

**Defense-in-depth env wiping pattern** (`tests/e2e/scripts/e2e-explore-ci-guard.test.js:51–55`):
```javascript
const r = spawnSync('node', [SCRIPT_PATH, '--iterations', '1'], {
  env: { ...process.env, CI: '', GITHUB_ACTIONS: '' },
  encoding: 'utf8',
  timeout: 3000,
});
```
**For tests that need parse-args validation to fire (not CI guard, not claude check):** Use this pattern + assert that the script exits with code `2` (bad arg) and stderr contains the new phase-validation message. If `claude` is installed locally the script may proceed past `checkClaudeCli`; otherwise it exits with code `3` — tests must scope assertions to `--phase`-specific stderr substrings.

---

### `tests/e2e/scripts/e2e-upload-llm-report.test.js` (new — unit test with DI mock)

**Analog:** `tests/unit/e2e-report-issue.test.js` — the `processReport()` block (lines 282–363) is the canonical mock-ghClient injection pattern in this repo.

**Test file imports + fixture-load pattern** (`tests/unit/e2e-report-issue.test.js:17–35`):
```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprint, sanitizeCaseId, /* ... pure-fn exports ... */
  processReport,
} from '../../scripts/e2e-report-issue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_FIXTURE = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/sample-report.json'), 'utf8'));
```
**For upload helper test:** Import the pure orchestration function from `scripts/e2e-upload-llm-report.mjs`. Fixture is the new `tests/e2e/fixtures/uat-phase32-llm-report.json` (or a small synthetic minimal report inline — preferred for unit tests to avoid coupling to the real fixture).

**Mock-ghClient DI pattern** (`tests/unit/e2e-report-issue.test.js:300–308`):
```javascript
const ghCalls = [];
const ghClient = {
  listOpenNightlyIssues: () => openIssues,
  createIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 999 }; },
  commentIssue: (number, body) => { ghCalls.push({ op: 'comment', number, body }); },
  filerMetaIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 998 }; },
};

processReport(REPORT_FIXTURE, { ghClient, runId: 'run-test-29-02', repo: 'owner/repo' });
```
**For upload helper test:** Inject a mock `execSync` (or a `ghClient` wrapper) that:
1. Records all `gh` invocations (command + stdin) in a `ghCalls` array
2. Returns canned JSON for `gh run list --json databaseId,createdAt` (one entry with `createdAt` past the trigger time, one stale entry that must be filtered out — exercises the race-mitigation filter)
3. Returns canned `nameWithOwner` for `gh repo view`
Assertions then verify:
- Stage 1 trigger uses `-f payload_b64=@-` (stdin path, not arg) — check `input` parameter
- Run-id capture filter rejects the stale entry (RESEARCH Pattern 1)
- Stage 2 trigger uses the captured run-id
- `gh run view <id> --web` is the last call (browser open per D-07)
- Oversize payload (mock report > 60KB base64) exits with code 2 BEFORE any `gh` call

**Call-collection assertion pattern** (`tests/unit/e2e-report-issue.test.js:310–315`):
```javascript
const comments = ghCalls.filter(c => c.op === 'comment');
const creates = ghCalls.filter(c => c.op === 'create');
expect(comments.length).toBe(1);
expect(creates.length).toBe(1);
expect(comments[0].number).toBe(101);
```
**For upload helper:** filter `ghCalls` by stage (`'workflow-run-ingest'`, `'run-list'`, `'workflow-run-nightly'`, `'run-view-web'`) and assert ordering + arguments. Number of `gh` calls in the happy path should be exactly 5 (auth-status, ingest-trigger, run-list, nightly-trigger, repo-view, run-view-web) — bound test brittleness by checking key calls, not exhaustive ordering.

---

### `tests/e2e/fixtures/uat-phase32-llm-report.json` (new — fixture)

**Analog:** `tests/unit/fixtures/sample-llm-report.json` — same schema, same validator (`appendLlmIteration` at `tests/e2e/lib/llm-report.js:197`).

**Schema contract (REQUIRED_ENTRY_FIELDS)** at `tests/e2e/lib/llm-report.js:55`:
```javascript
const REQUIRED_ENTRY_FIELDS = ['iteration_n', 'iso', 'classification'];
```
Each iteration in the committed fixture MUST have these three fields non-null. Any additional fields (`llm_selection`, `hallucination_check`, `citation`, etc.) are not validated by the writer but are produced by `runOneIteration` (see `scripts/e2e-explore.mjs:200–209` for the LLM_API_ERROR shape, lines 336–350 for the PASS shape).

**Top-level shape** mandated by `emptyReport()` at `tests/e2e/lib/llm-report.js:133–143`:
```javascript
{
  run_id: meta?.run_id,
  started_iso: now,
  finished_iso: now,
  iterations_total: meta?.iterations_total ?? 0,
  summary: emptySummary(),
  iterations: [],
}
```
And `emptySummary()` at lines 84–93:
```javascript
{
  passed: 0,
  wrong_citation: 0,
  verifier_disagree: 0,
  llm_hallucinated_selection: 0,
  llm_api_error: 0,
  harness_error: 0,
  total_cost_usd: 0,
}
```
**The fixture file is produced by running the real `npm run e2e:explore -- --phase 32` per D-01, then copied verbatim from `tests/e2e/artifacts/<runId>/llm-report.json` to the fixture path per D-02.** No hand-editing — the writer guarantees shape correctness.

**Directory must be created** — `tests/e2e/fixtures/` does not exist yet (verified). The plan must include `mkdir -p tests/e2e/fixtures/` OR commit a `.gitkeep` first (RESEARCH Pitfall 8).

---

### `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` (new — schema-guard test)

**Analog:** `tests/unit/llm-report.test.js` Test 13 (lines 304–316) — the canonical fixture-roundtrip pattern.

**Fixture-roundtrip pattern** (`tests/unit/llm-report.test.js:304–316`):
```javascript
describe('tests/unit/fixtures/sample-llm-report.json — fixture consistency', () => {
  it('Test 13: fixture parses and totals are consistent (0.19 + 0.18 + 0.08 = 0.45)', () => {
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    expect(fixture.iterations).toHaveLength(3);
    expect(fixture.summary.total_cost_usd).toBe(0.45);
    expect(fixture.summary.passed).toBe(1);
    /* ...summary key assertions... */
  });
});
```
**For Phase 32 schema test:** the fixture is REAL (≥10 iterations from live UAT), so the test cannot assert specific counts — only assert structural invariants:
- `fixture.iterations.length >= 10` (D-10 pass bar)
- Every iteration has `iteration_n`, `iso`, `classification` non-null (mirror REQUIRED_ENTRY_FIELDS)
- Summary key sum equals `iterations.length` MINUS unclassified entries (closed-enum guard at `tests/e2e/lib/llm-report.js:100–109` means unknown classifications don't increment any counter, but for the live UAT we expect 100% of iterations to be in the closed enum)

**Round-trip via `appendLlmIteration` (Pattern 3 in RESEARCH lines 285–313):**
```javascript
import { appendLlmIteration } from '../../e2e/lib/llm-report.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function validateReportSchema(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'uat-schema-'));
  const tmpReport = join(dir, 'tmp-report.json');
  writeFileSync(tmpReport, JSON.stringify({
    run_id: report.run_id, started_iso: report.started_iso,
    finished_iso: report.finished_iso, iterations_total: 0,
    summary: report.summary, iterations: []
  }));
  try {
    for (const it of report.iterations) {
      appendLlmIteration(tmpReport, it);  // throws on schema violation
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```
**Critical comment per RESEARCH Pitfall 1:** Test file must explicitly note "Semantic correctness is Phase 33's gate; this test validates structure only." so future readers don't expect verdict-distribution assertions.

**tmpDir hermeticity pattern** (`tests/unit/llm-report.test.js:47–61`):
```javascript
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-llm-report-test-'));
  /* ... */
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```
Use this pattern for the temp validation file so the test doesn't pollute the repo's `tests/e2e/artifacts/` tree.

---

### `package.json` (modified — config)

**Existing e2e:* script pattern** (`package.json:10–13`):
```json
"e2e:regression": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js",
"e2e:silent": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/silent.spec.js",
"e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js --grep @smoke",
"e2e:explore": "node scripts/e2e-explore.mjs",
```
Add immediately after line 13: `"e2e:upload-llm-report": "node scripts/e2e-upload-llm-report.mjs",` — mirrors the `e2e:explore` shape (direct `node` invocation, no build step prerequisite — the helper is read-only against the existing artifact).

---

## Shared Patterns

### Atomic write (tmp + rename)
**Source:** `tests/e2e/lib/llm-ledger.js:191–193` AND `tests/e2e/lib/llm-report.js:69–73`
**Apply to:** Any new code path that persists state to disk in Phase 32. Note: Phase 32 itself does NOT add new persistent-state files — both new fixtures are read-only test data, and the ledger writer is unchanged. The pattern is documented here for completeness in case the planner adds a checkpoint mechanism.

```javascript
function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, destPath);
}
```

### CLI error-exit discipline (`process.stderr.write` + `process.exit(N)`)
**Source:** `scripts/e2e-explore.mjs:73–77, 87–88, 113–117, 136–137, 403–408`
**Apply to:** All new error paths in `scripts/e2e-upload-llm-report.mjs` and the new `--phase` validation in `scripts/e2e-explore.mjs`.

```javascript
process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
process.exit(4);
```
**Convention:** prefix every stderr line with `[<script-name>]` for grep-ability; exit codes documented in a top-of-file comment block (mirror `scripts/e2e-explore.mjs:29–35`).

### gh CLI shell-out with stdin payload (avoid command-line oversize)
**Source:** `scripts/e2e-report-issue.mjs:294–298` and `:303–306`
**Apply to:** `scripts/e2e-upload-llm-report.mjs` Stage 1 (`-f payload_b64=@-` reads from stdin).

```javascript
execSync(`gh issue comment ${number} --body-file -`, {
  input: body,
  encoding: 'utf8',
});
```

### Pure-function exports + CLI shim at file bottom
**Source:** `scripts/e2e-report-issue.mjs` (entire file structure — pure exports lines 41–270; real client lines 276–312; CLI shim lines 316–389)
**Apply to:** `scripts/e2e-upload-llm-report.mjs` MUST export the orchestration logic as a pure function consuming an injectable `gh` client, so `tests/e2e/scripts/e2e-upload-llm-report.test.js` can mock it.

```javascript
// Pure orchestration — testable
export function uploadReport({ reportPath, ghClient, readFile, now }) { ... }

// Real client at bottom
function makeRealGhClient() { return { ... }; }

// CLI shim
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  uploadReport({ reportPath: llmReportPathFor(resolveRunId()),
                 ghClient: makeRealGhClient(),
                 readFile: fs.readFileSync,
                 now: Date.now });
}
```

### Vitest tmpDir-per-test hermeticity
**Source:** `tests/unit/llm-report.test.js:47–61` AND `tests/unit/llm-ledger.test.js:49–55`
**Apply to:** Any new test that touches the filesystem (the new schema-validate roundtrip test uses tmpDir for the throwaway report file).

```javascript
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-llm-report-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

### Workflow concurrency group + permissions minimization
**Source:** `.github/workflows/e2e-nightly.yml:28–37`
**Apply to:** `.github/workflows/e2e-ingest-llm-report.yml` — static concurrency group, `cancel-in-progress: false`, minimum-needed permissions (`contents: read` only, no `issues: write`).

```yaml
concurrency:
  group: e2e-ingest-llm-report
  cancel-in-progress: false
permissions:
  contents: read
```

### `actions/upload-artifact@v4` with 14-day retention
**Source:** `.github/workflows/e2e-nightly.yml:178–187` and `.github/workflows/ci.yml:73–87`
**Apply to:** `.github/workflows/e2e-ingest-llm-report.yml`

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: llm-report
    path: ingest-out/llm-report.json
    retention-days: 14
    if-no-files-found: error  # NOT warn — empty decode is a hard failure
```

### Schema-only validation via `appendLlmIteration` round-trip
**Source:** `tests/e2e/lib/llm-report.js:197` (the validator) + `tests/e2e/lib/llm-report.js:55` (REQUIRED_ENTRY_FIELDS)
**Apply to:** Both `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` AND the new gated step in `.github/workflows/e2e-nightly.yml` — same validator, same round-trip-against-tmpfile shape (Pattern 3 in RESEARCH).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md` | docs (manual narrative) | n/a | Human-written terminal-log + ledger-delta + iteration-count + anomalies narrative. The closest analog is the previous phases' `XX-CONTEXT.md` / `XX-RESEARCH.md` markdown style, but the content is fundamentally a hand-written one-shot artifact, not a templated structured document. Planner should propose section layout per D-02 + Claude's-discretion clause in CONTEXT.md. |

---

## Metadata

**Analog search scope:**
- `scripts/` (all 17 files glanced; deep-read: `e2e-explore.mjs`, `e2e-report-issue.mjs`)
- `tests/e2e/lib/` (deep-read: `llm-ledger.js`, `llm-report.js`)
- `tests/e2e/scripts/` (deep-read: `e2e-explore-ci-guard.test.js` — only file in dir)
- `tests/unit/` (23 files; deep-read: `e2e-report-issue.test.js`, `llm-report.test.js`, `llm-ledger.test.js`)
- `.github/workflows/` (deep-read: `e2e-nightly.yml`, `ci.yml`; `release.yml` skimmed — no Phase 32 relevance)
- `tests/unit/fixtures/` (listed; `sample-llm-report.json` is the schema analog for the new UAT fixture)
- `package.json` (full)
- `CLAUDE.md` (full — operationally relevant to plan-phase agents, not to shipped code; noted in RESEARCH lines 61–63)

**Files scanned:** ~30 (deep-read: 10; listed/skimmed: ~20)

**Pattern extraction date:** 2026-05-24

**Key insight:** Every analog Phase 32 needs is in-repo. The work is structural (add a CLI flag, add a JSDoc field, add two YAML files, add three test files, add one orchestration script) — not algorithmic. The dominant pattern source is **mirror-symmetry with `monthlyTotal`/`checkSpendCap`** (for the new phase-cap helpers) and **DI-mock-execSync from `e2e-report-issue.mjs` + `e2e-report-issue.test.js`** (for the new upload helper + its unit test). The pattern reuse density is HIGH — planner can quote analog file:line refs directly into each plan's action section.

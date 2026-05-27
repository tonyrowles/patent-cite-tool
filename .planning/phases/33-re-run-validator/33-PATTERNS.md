# Phase 33: Re-run Validator — Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 11 (4 new modules/scripts, 3 new tests, 1 new synthetic fixture, 3 modified files)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/e2e/lib/rerun-validator.js` (NEW) | service (pure-data lib) | batch / transform | `tests/e2e/lib/llm-report.js` + `tests/e2e/lib/llm-ledger.js` | exact (role + data flow + atomic-write pattern) |
| `scripts/e2e-rerun-validator.mjs` (NEW) | controller (CLI shim) | request-response (CLI argv → file out) | `scripts/e2e-upload-llm-report.mjs` | exact (pure-orchestrator + injected-deps shape) |
| `tests/unit/rerun-validator.test.js` (NEW) | test (unit) | request-response | `tests/unit/llm-report.test.js` | exact (vitest + tmpDir + per-test fixtures) |
| `tests/e2e/scripts/e2e-rerun-validator.test.js` (NEW) | test (integration / spawnSync CLI) | request-response | `tests/e2e/scripts/e2e-explore-phase-flag.test.js` | exact (spawnSync + flag-validation contract) |
| `tests/e2e/fixtures/rerun-validator-fixtures.{js,json}` (NEW, synthetic) | test fixture | data | `tests/unit/fixtures/sample-llm-report.json` (referenced from `llm-report.test.js` line 45) | role-match (handcrafted synthetic vs UAT-real) |
| `tests/e2e/lib/llm-report.js` (MODIFY — D-13) | service (pure-data lib) | append-only writer | self (extend existing `REQUIRED_ENTRY_FIELDS` + `appendLlmIteration`) | self — extension point |
| `scripts/e2e-explore.mjs` (MODIFY — D-14) | controller (CLI driver) | request-response | self (thread 4 new keys through 6 existing `appendLlmIteration` call sites) | self — extension point |
| `eslint.config.js` (MODIFY — D-16) | config | static (lint-time) | self (clone the `pdf-verifier.js` `files:` block) | self — extension point |
| `tests/e2e/fixtures/uat-phase32-llm-report.json` (MODIFY — D-15) | data fixture | static (read by tests) | self (in-place re-stamp: add 4 keys + `schema_version: 1`) | self — extension point |
| `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` (MODIFY — D-15) | test (schema-guard) | request-response | self (extend round-trip + add presence assertions) | self — extension point |
| `tests/unit/llm-report.test.js` (MODIFY — D-13 coverage) | test (unit) | request-response | self (extend Test 12 + add null-permitted case) | self — extension point |

---

## Pattern Assignments

### `tests/e2e/lib/rerun-validator.js` (service, batch/transform — NEW)

**Primary analog:** `tests/e2e/lib/llm-report.js`
**Secondary analog:** `tests/e2e/lib/llm-ledger.js` (second exemplar of EXDEV-fallback atomic-write)

**Imports pattern** (from `tests/e2e/lib/llm-report.js` lines 35-40):

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

Plus the project-local dep — the ONLY external function `rerun-validator.js` calls:

```javascript
// new file's only project import — independence-claim boundary stops here
import { verifyCitation } from './pdf-verifier.js';
```

**Atomic-write pattern** (verbatim copy from `tests/e2e/lib/llm-report.js` lines 76-91 — D-12 inline reuse):

```javascript
/**
 * Crash-safe write (WR-04). Plain fs.writeFileSync truncates the destination
 * before writing... [keep the docblock; it explains EXDEV / WR-06 history]
 */
function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-device rename — direct write fallback (loses atomicity but
      // unblocks the append).
      fs.writeFileSync(destPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}
```

**Verdict-computation pattern** (research RESEARCH.md §Code Examples + D-03 + D-10):

```javascript
// 2/3+ threshold is INCLUSIVE per success criterion 1.
function computeVerdict(originalStatus, runs) {
  const confirmedCount = runs.filter((r) => r.status === originalStatus).length;
  const totalRuns = runs.length;  // always 3 for eligible iterations
  let verdict;
  if (confirmedCount >= 2) verdict = 'CONFIRMED';
  else verdict = 'FLAKE';  // 0 or 1
  return { confirmed_count: confirmedCount, total_runs: totalRuns, verdict };
}
```

**Eligibility-filter pattern** (D-01/D-02 — pure-function classification check):

```javascript
const REPLAY_ELIGIBLE_CLASSIFICATIONS = new Set(['WRONG_CITATION', 'VERIFIER_DISAGREE']);

function isEligibleForReplay(iter) {
  return REPLAY_ELIGIBLE_CLASSIFICATIONS.has(iter.classification);
}
```

**verifyCitation call signature** (from `tests/e2e/lib/pdf-verifier.js` lines 826-830 — the ONLY surface the validator wraps):

```javascript
/**
 * @param {{patentId:string, selectedText:string, observedCitation:string}} args
 * @returns {Promise<Verdict>}
 */
export async function verifyCitation({ patentId, selectedText, observedCitation }) {
```

Per D-07, do NOT import `_clearParsedCache`. Cache hit is correct + ~60× faster.

**Top-level report shape** (D-09 — mirror the `emptyReport()` shape from `llm-report.js` lines 151-161):

```javascript
function emptyRerunReport({ sourceLlmReport, runId }) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    source_llm_report: sourceLlmReport,
    run_id: runId,
    started_iso: now,
    finished_iso: now,
    summary: { confirmed_count: 0, flake_count: 0, not_replayable_count: 0 },
    replays: [],
  };
}
```

**Per-replay entry shape** (D-10):

```javascript
{
  iteration_n: 7,
  original_verdict_status: 'pass',
  runs: [
    { status: 'pass', tier_used: 'A', reason: 'exact match' },
    { status: 'pass', tier_used: 'A', reason: 'exact match' },
    { status: 'pass', tier_used: 'A', reason: 'exact match' },
  ],
  confirmed_count: 3,
  total_runs: 3,
  verdict: 'CONFIRMED',
  // 'reason' field set ONLY when verdict === 'NOT_REPLAYABLE'
}
```

**Newest-file-by-mtime pattern** (RESEARCH.md §Code Examples — for the validator's `resolveInputPath` helper IF the planner co-locates it in the lib rather than the CLI shim):

```javascript
// Derived from tests/e2e/lib/llm-report.js line 40 (ARTIFACTS_ROOT) + Node fs.statSync docs
function newestLlmReportPath(artifactsRoot) {
  if (!fs.existsSync(artifactsRoot)) {
    throw new Error(`No artifacts dir at ${artifactsRoot}; run e2e:explore first`);
  }
  const runDirs = fs.readdirSync(artifactsRoot)
    .map((name) => path.join(artifactsRoot, name))
    .filter((p) => fs.statSync(p).isDirectory());
  let best = null;
  for (const dir of runDirs) {
    const candidate = path.join(dir, 'llm-report.json');
    if (!fs.existsSync(candidate)) continue;
    const mtime = fs.statSync(candidate).mtimeMs;
    if (best === null || mtime > best.mtime) best = { path: candidate, mtime };
  }
  if (!best) throw new Error(`No llm-report.json found under ${artifactsRoot}`);
  return best.path;
}
```

**Output-path resolution** (D-11):

```javascript
// rerun-report.json lives in the SAME run dir as the source llm-report.json.
const outputPath = path.join(path.dirname(inputLlmReportPath), 'rerun-report.json');
```

---

### `scripts/e2e-rerun-validator.mjs` (controller, request-response — NEW)

**Primary analog:** `scripts/e2e-upload-llm-report.mjs` (canonical pure-orchestrator + injected-deps shape)
**Secondary analog:** `scripts/e2e-explore.mjs` (CLI parseArgs idiom — for `--input <path>`)

**Header pattern** (from `scripts/e2e-upload-llm-report.mjs` lines 1-70 — shebang + design refs + exit-code legend):

```javascript
#!/usr/bin/env node
// scripts/e2e-rerun-validator.mjs
//
// Phase 33 (RERUN-01/RERUN-02) — CLI entrypoint for the rerun-validator.
// ...
// Exit codes:
//   0 — success (rerun-report.json written)
//   1 — input llm-report.json missing or unreadable
//   2 — bad --input value (equals syntax / missing value / non-string)
```

**Imports + project-root resolution** (from `scripts/e2e-upload-llm-report.mjs` lines 72-77):

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidator, /* ...other entry points... */ } from '../tests/e2e/lib/rerun-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Strict-regex arg-parsing pattern** (from `scripts/e2e-explore.mjs` lines 83-147 — clone the shape for `--input <path>`):

```javascript
function parseArgs(argv) {
  let inputPath = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--input=')) {
      // Pitfall: equals syntax not supported; reject explicitly. Mirrors
      // e2e-explore.mjs --phase rejection (line 104-111).
      process.stderr.write(
        '[e2e-rerun-validator] equals syntax not supported for --input; use `--input <value>`\n'
      );
      process.exit(2);
    } else if (argv[i] === '--input') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[e2e-rerun-validator] missing value for --input\n');
        process.exit(2);
      }
      inputPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      // ... usage text ...
      process.exit(0);
    }
  }
  return { inputPath };
}
```

**Pure-orchestrator + injected-deps shape** (from `scripts/e2e-upload-llm-report.mjs` lines 141-150 — clone for the validator's `runValidator()` signature so unit tests can inject mocks):

```javascript
// Source: scripts/e2e-upload-llm-report.mjs lines 141-150
export async function uploadReport({
  reportPath,
  ghClient,    // injected mock in tests
  readFile,    // injected mock in tests
  now,         // injected mock in tests
  sleep,
  stdout,
  stderr,
  exit,
}) { /* ... */ }
```

For `rerun-validator.js`'s `runValidator()`, the planner should mirror this with:

```javascript
export async function runValidator({
  inputLlmReportPath,
  verifyCitation,   // injected — defaults to the real fn from pdf-verifier.js
  readFile,
  writeReport,      // wraps atomicWriteJson — injectable for the EXDEV unit test
  now,
  stdout,
  stderr,
}) { /* ... */ }
```

**isMain guard** (from `scripts/e2e-upload-llm-report.mjs` lines 407-415 — WR-02 fix: works on Windows + paths with spaces):

```javascript
// WR-02 (Phase 32 review): normalize via fileURLToPath + path.resolve so the
// comparison works on Windows (file:///C:/... vs C:\\...) and on POSIX paths
// containing spaces (no URL-encoding on either side).
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  await runValidator({
    inputLlmReportPath: resolvedInputPath,
    verifyCitation: realVerifyCitation,
    readFile: (p) => fs.readFileSync(p),
    writeReport: (p, content) => atomicWriteJson(p, content),
    now: () => Date.now(),
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}
```

**`--input` default-resolution pattern** (D-06 — defaults to newest `tests/e2e/artifacts/*/llm-report.json` by mtime; resolve absolute or repo-relative paths):

```javascript
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');

const { inputPath: rawInput } = parseArgs(process.argv);
const resolvedInputPath = rawInput
  ? path.resolve(process.cwd(), rawInput)
  : newestLlmReportPath(ARTIFACTS_ROOT);
if (!fs.existsSync(resolvedInputPath)) {
  process.stderr.write(`[e2e-rerun-validator] input not found: ${resolvedInputPath}\n`);
  process.exit(1);
}
```

---

### `tests/unit/rerun-validator.test.js` (test, unit — NEW)

**Primary analog:** `tests/unit/llm-report.test.js` (lines 31-62 — imports + beforeEach/afterEach + makeIteration helper)

**Imports + tmpDir lifecycle** (from `tests/unit/llm-report.test.js` lines 31-61):

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runValidator,
  computeVerdict,
  isEligibleForReplay,
  // ...other surface...
} from '../e2e/lib/rerun-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tmpDir;
let reportPath;
let outputPath;
const RUN_ID = '2026-05-25T10-00-00Z';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-rerun-validator-test-'));
  const runDir = path.join(tmpDir, RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  reportPath = path.join(runDir, 'llm-report.json');
  outputPath = path.join(runDir, 'rerun-report.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

**`makeIteration` helper pattern** (from `tests/unit/llm-report.test.js` lines 63-90 — clone with rerun-specific defaults for synthetic CONFIRMED / FLAKE fixtures):

```javascript
function makeIteration(overrides = {}) {
  return {
    iteration_n: 1,
    iso: '2026-05-25T10:00:30.000Z',
    llm_selection: {
      caseId: 'US11427642-llm-001',
      patentId: 'US11427642',
      selectedText: 'an antigen-binding protein',
      category: 'modern-short',
      rationale: 'cross-column boundary',
    },
    hallucination_check: { passed: true, method: 'wsNorm' },
    citation: '1:34-46',
    verifier_verdict: {
      status: 'pass',
      tier_used: 'A',
      reason: 'exact match',
    },
    classification: 'WRONG_CITATION',  // replay-eligible per D-01
    cost_usd: 0.19,
    duration_ms: 28350,
    artifacts: [],
    llm_raw_response: '{"caseId":"..."}',
    // D-13 schema fields (re-stamped null where the planner doesn't care)
    scroll_y: 0,
    viewport_width: 1280,
    viewport_height: 720,
    selected_node_xpath: '/html/body[1]/div[1]',
    ...overrides,
  };
}
```

**Mocked-verifyCitation pattern** (the validator must accept verifyCitation as an injected dep — see CLI section above):

```javascript
// 3/3 CONFIRMED: all replays return the original status
const mockVerifyConfirmed = async () => ({ status: 'pass', tier_used: 'A', reason: '...' });

// FLAKE: returns a DIFFERENT status on every call (0/3 match)
const mockVerifyFlake = async () => ({ status: 'fail', tier_used: 'A', reason: 'mismatch' });

// Edge case 2/3: succeeds twice, fails once
let n = 0;
const mockVerifyEdge = async () => {
  n++;
  return n === 2
    ? { status: 'fail', tier_used: 'A', reason: 'flake' }
    : { status: 'pass', tier_used: 'A', reason: 'ok' };
};
```

**Required test cases** (from RESEARCH.md §Validation Architecture, Phase Requirements → Test Map):

```
- "replays each eligible iteration 3 times" (spy.callCount === 3 × N_eligible)
- "skips ineligible classifications" (spy not called for HARNESS_ERROR / LLM_API_ERROR / PASS / LLM_HALLUCINATED_SELECTION)
- "rerun-report.json schema" (assert D-09 top-level + D-10 per-replay shape)
- "verdict CONFIRMED at 3/3"
- "verdict CONFIRMED at exactly 2/3" (RESEARCH.md anti-pattern: >= not >)
- "verdict FLAKE at 1/3 and 0/3"
- "atomic write" (assert file exists + valid JSON after run)
- "EXDEV fallback" (mock fs.renameSync to throw {code:'EXDEV'}; assert direct-write fallback fired)
- "NOT_REPLAYABLE" (D-02 — reason field names the gating classification)
- "schema_version: 1" (D-09 — regression test for the schema version field)
```

**EXDEV fallback test pattern** (mock `fs.renameSync` to throw with code `'EXDEV'`):

```javascript
// Inject a writeReport that uses a stubbed atomicWriteJson which mocks renameSync.
// Verify the direct-write branch fired AND the temp file was cleaned up.
// Mirrors the pattern in tests/unit/llm-report.test.js Test 10 (atomic guarantee)
// but exercises the EXDEV code path specifically.
```

---

### `tests/e2e/scripts/e2e-rerun-validator.test.js` (test, integration spawnSync CLI — NEW)

**Primary analog:** `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (the closest match — same `--<flag> <value>` validation contract pattern)
**Secondary analog:** `tests/e2e/scripts/e2e-explore-ci-guard.test.js` (simpler spawnSync template — lines 17-23)

**SCRIPT_PATH + spawnSync wrapper** (from `tests/e2e/scripts/e2e-explore-phase-flag.test.js` lines 42-67):

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-rerun-validator.mjs');

function spawnValidator(args, env = {}) {
  // 3000ms timeout matches the e2e-explore-phase-flag pattern — keeps
  // spawnSync below vitest's default 5000ms timer (avoids "Test timed out"
  // races when the script reaches a blocking path post-parseArgs).
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 3000,
  });
}
```

**Negative-flag-validation test pattern** (clone from `tests/e2e/scripts/e2e-explore-phase-flag.test.js` lines 69-118):

```javascript
describe('--input flag (Phase 33)', () => {
  it('rejects --input= (equals syntax) with exit 2 and stderr signaling equals syntax unsupported', () => {
    const r = spawnValidator(['--input=/tmp/foo.json']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });

  it('rejects --input with no value (trailing flag) with exit 2 and stderr signaling missing value', () => {
    const r = spawnValidator(['--input']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });

  it('exits 1 when --input file does not exist (with stderr naming the missing path)', () => {
    const r = spawnValidator(['--input', '/tmp/does-not-exist-' + Date.now() + '.json']);
    expect(r.status).toBe(1);
    expect(r.stderr || '').toMatch(/not found|missing|no.*llm-report/i);
  });
});
```

**stderr-absence assertion pattern** (from `tests/e2e/scripts/e2e-explore-phase-flag.test.js` lines 113-117 — WR-07 Phase 32 review fix: strengthens "accepted" tests against future regressions):

```javascript
// Strengthen with stderr-absence: a future regression that rejected the valid
// input with a DIFFERENT exit code would still pass `status !== 2`. Asserting
// stderr does NOT contain the rejection signatures proves the value was
// ACCEPTED, not silently rerouted.
const stderrText = r.stderr || '';
expect(stderrText).not.toMatch(/equals syntax not supported for --input/i);
expect(stderrText).not.toMatch(/missing value for --input/i);
```

**End-to-end smoke test pattern** (from `tests/e2e/scripts/e2e-explore-phase-flag.test.js` lines 132-209 — beforeEach/afterEach tmpDir + seeded artifact + spawnSync end-to-end assertion):

```javascript
// "UAT fixture smoke" test — spawn the real script against the committed
// UAT fixture, assert it produces 10 NOT_REPLAYABLE entries (Pitfall 6).
describe('Phase 33 end-to-end smoke', () => {
  let tmpDir;
  let inputPath;
  let outputPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-rerun-e2e-'));
    // Copy the UAT fixture into the tmp run dir (validator writes rerun-report.json
    // next to the input — D-11). Using a tmp copy keeps the real artifacts dir clean.
    const fixtureSrc = path.resolve(__dirname, '../../e2e/fixtures/uat-phase32-llm-report.json');
    inputPath = path.join(tmpDir, 'llm-report.json');
    outputPath = path.join(tmpDir, 'rerun-report.json');
    fs.copyFileSync(fixtureSrc, inputPath);
  });

  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('UAT fixture smoke — 10 NOT_REPLAYABLE entries (D-02 + Pitfall 6)', () => {
    const r = spawnValidator(['--input', inputPath]);
    expect(r.status).toBe(0);
    const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(out.schema_version).toBe(1);
    expect(out.replays).toHaveLength(10);
    for (const replay of out.replays) {
      expect(replay.verdict).toBe('NOT_REPLAYABLE');
      expect(replay.total_runs).toBe(0);
      expect(typeof replay.reason).toBe('string');
    }
    expect(out.summary.not_replayable_count).toBe(10);
    expect(out.summary.confirmed_count).toBe(0);
    expect(out.summary.flake_count).toBe(0);
  });
});
```

---

### `tests/e2e/lib/llm-report.js` (service, append-only writer — MODIFY for D-13)

**Self-extension point:** lines 54-56 + 215-220

**Current** (`tests/e2e/lib/llm-report.js` lines 54-55):

```javascript
/** Required fields on every iteration entry. */
const REQUIRED_ENTRY_FIELDS = ['iteration_n', 'iso', 'classification'];
```

**D-13 — option (a) split-list extension** (per RESEARCH.md §Code Examples and Pitfall 3 recommendation):

```javascript
/** Required fields on every iteration entry — NON-NULL (existing strictness preserved). */
const REQUIRED_NONNULL_FIELDS = ['iteration_n', 'iso', 'classification'];

/**
 * Required fields on every iteration entry — KEY must be present, NULL value
 * permitted. Phase 33 D-13: scroll_y / viewport_width / viewport_height /
 * selected_node_xpath are captured between Step 8 (selectText) and Step 9
 * (getCitation) in e2e-explore.mjs; pre-browser failure paths (LLM_API_ERROR
 * before browser launch, HARNESS_ERROR during selectText, etc.) pass null.
 * The schema-guard requires the KEYS to be present so silent omissions on
 * future call sites are caught at write time (Pitfall 1).
 */
const REQUIRED_NULLABLE_FIELDS = [
  'scroll_y',
  'viewport_width',
  'viewport_height',
  'selected_node_xpath',
];
```

**Current validation** (`tests/e2e/lib/llm-report.js` lines 215-220):

```javascript
export function appendLlmIteration(reportPath, iteration) {
  for (const f of REQUIRED_ENTRY_FIELDS) {
    if (iteration?.[f] === undefined || iteration[f] === null) {
      throw new Error(`appendLlmIteration: missing required field '${f}'`);
    }
  }
```

**D-13 extension** (preserve the existing non-null check for the original 3 fields; add a key-presence-only check for the 4 new ones):

```javascript
export function appendLlmIteration(reportPath, iteration) {
  for (const f of REQUIRED_NONNULL_FIELDS) {
    if (iteration?.[f] === undefined || iteration[f] === null) {
      throw new Error(`appendLlmIteration: missing required field '${f}'`);
    }
  }
  for (const f of REQUIRED_NULLABLE_FIELDS) {
    if (!(f in (iteration ?? {}))) {
      throw new Error(`appendLlmIteration: missing required field '${f}' (null permitted)`);
    }
  }
  // ... rest unchanged
}
```

---

### `scripts/e2e-explore.mjs` (controller, CLI driver — MODIFY for D-14)

**Self-extension point:** Step 8/9 boundary at lines 411-414; the 6 existing `appendLlmIteration` call sites at lines 283, 337, 364, 390, 430, 457.

**Capture block** (insert between line 411 `await selectText(...)` and line 414 `const obs = await getCitation(...)` — Claude's discretion XPath shape from RESEARCH.md):

```javascript
// --- D-14 Phase 33 capture block (RERUN-03) -----------------------------
// Captures scroll/viewport/xpath state at the moment of selection so a
// future Playwright-driven full-replay mode can navigate to the same
// observation context. The verifier-only rerun in Phase 33 does NOT
// consume these fields — they ship in the schema only.
const scroll_y = await extInstance.page.evaluate(() => window.scrollY);
const vp = extInstance.page.viewportSize();  // { width, height }
const selected_node_xpath = await extInstance.page.evaluate(() => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  // Text nodes → walk up to the nearest element parent.
  if (node.nodeType === 3) node = node.parentNode;
  const parts = [];
  while (node && node.nodeType === 1 && node.nodeName !== 'HTML') {
    let idx = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.nodeName === node.nodeName) idx += 1;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${node.nodeName.toLowerCase()}[${idx}]`);
    node = node.parentNode;
  }
  return parts.length ? '/html/' + parts.join('/') : null;
});
// --- end capture --------------------------------------------------------
```

**6 call sites that MUST receive the 4 new keys** (RESEARCH.md anti-pattern: "Adding the 4 new keys to ONLY the post-selectText success path"):

| Line | Path | What to pass |
|------|------|--------------|
| 283 | `if (!parsed.ok)` — `LLM_API_ERROR` (pre-browser) | all 4 `null` |
| 337 | retry-failure — `LLM_API_ERROR` (pre-browser) | all 4 `null` |
| 364 | off-corpus patentId — `LLM_API_ERROR` (pre-browser) | all 4 `null` |
| 390 | hallucination guard failed — `LLM_HALLUCINATED_SELECTION` (pre-browser) | all 4 `null` |
| 430 | success path — `PASS` / `WRONG_CITATION` / `VERIFIER_DISAGREE` | real captured values |
| 457 | catch block — `HARNESS_ERROR` / `LLM_API_ERROR` (selection may or may not have succeeded) | all 4 `null` (capture is post-selectText, so any throw before selectText means null; thread the captured values via a higher-scope `let` if the planner wants populated values when selectText succeeded but a later step threw) |

**Success-path append pattern** (success-path call site at line 430 — example of the spread):

```javascript
appendLlmIteration(reportPath, {
  iteration_n: iterationN, iso,
  llm_selection: sel,
  hallucination_check: {
    passed: true,
    method: hallucinationCheck.method,
    needleIndex: hallucinationCheck.needleIndex,
  },
  citation, verifier_verdict: verifierVerdict,
  classification, cost_usd: totalCostUsdForReport,
  duration_ms: Date.now() - tStart,
  artifacts: [],
  llm_raw_response: rawSnippet,
  model: modelId,
  // D-14 Phase 33 — captured values (RERUN-03)
  scroll_y,
  viewport_width: vp.width,
  viewport_height: vp.height,
  selected_node_xpath,
});
```

**Pre-browser failure-path append pattern** (all other 5 call sites — explicit `null` literals):

```javascript
appendLlmIteration(reportPath, {
  // ... existing fields ...
  // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
  scroll_y: null,
  viewport_width: null,
  viewport_height: null,
  selected_node_xpath: null,
});
```

---

### `eslint.config.js` (config — MODIFY for D-16)

**Self-extension point:** Clone the existing `pdf-verifier.js` block at lines 50-71. D-16 specifies a separate `files:` block (NOT a glob group) to preserve the per-file audit story.

**Existing block to clone** (`eslint.config.js` lines 50-71):

```javascript
{
  files: ['tests/e2e/lib/pdf-verifier.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/src/**',
            '../../../src/**',
            '../../src/**',
            '../src/**',
            '/src/**',
          ],
          message:
            'pdf-verifier.js must not import from src/ — VFY-02 independence claim. ' +
            'Use a fresh implementation; mirror production logic conceptually, do not reuse it. ' +
            'See .planning/phases/28-independent-pdf-verifier/28-RESEARCH.md §"Pattern 4".',
        },
      ],
    }],
  },
},
```

**New block to ADD (after the pdf-verifier block, before the closing `]`):**

```javascript
{
  files: ['tests/e2e/lib/rerun-validator.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/src/**',
            '../../../src/**',
            '../../src/**',
            '../src/**',
            '/src/**',
          ],
          message:
            'rerun-validator.js must not import from src/ — RERUN-04 independence claim. ' +
            'Use a fresh implementation; mirror production logic conceptually, do not reuse it. ' +
            'See .planning/phases/33-re-run-validator/33-RESEARCH.md §"Pattern 3".',
        },
      ],
    }],
  },
},
```

---

### `tests/e2e/fixtures/uat-phase32-llm-report.json` (data fixture — MODIFY for D-15)

**Self-extension point:** Re-stamp in place — each iteration gains 4 new keys with `null` values; top-level gains `schema_version: 1`.

**Current top-level structure** (lines 1-15):

```json
{
  "run_id": "2026-05-25T05-22-53Z",
  "started_iso": "2026-05-25T05:22:53.262Z",
  "finished_iso": "2026-05-25T05:26:45.054Z",
  "iterations_total": 10,
  "summary": { ... },
  "iterations": [ ... ]
}
```

**D-15 — re-stamped top-level**:

```json
{
  "schema_version": 1,
  "run_id": "2026-05-25T05-22-53Z",
  "started_iso": "2026-05-25T05:22:53.262Z",
  "finished_iso": "2026-05-25T05:26:45.054Z",
  ...
}
```

**Per-iteration re-stamp pattern** (insert 4 keys with `null` values into every entry in `iterations[]`):

```json
{
  "iteration_n": 1,
  "iso": "2026-05-25T05:22:53.263Z",
  "llm_selection": null,
  ...existing fields...
  "model": "claude-opus-4-7[1m]",
  "scroll_y": null,
  "viewport_width": null,
  "viewport_height": null,
  "selected_node_xpath": null
}
```

**One-shot migration script** (RESEARCH.md anti-pattern: "Do NOT use cat / heredoc"; use a Node script — invoked once, NOT committed long-term):

```javascript
// scripts/_migrate-uat-fixture.mjs (one-shot; remove after the commit)
import fs from 'node:fs';
const p = 'tests/e2e/fixtures/uat-phase32-llm-report.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.schema_version = 1;
for (const it of j.iterations) {
  if (!('scroll_y' in it)) it.scroll_y = null;
  if (!('viewport_width' in it)) it.viewport_width = null;
  if (!('viewport_height' in it)) it.viewport_height = null;
  if (!('selected_node_xpath' in it)) it.selected_node_xpath = null;
}
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
```

**Ordering constraint** (RESEARCH.md Pitfall 4): the fixture re-stamp (D-15) must land BEFORE (or in the same atomic commit as) the `REQUIRED_ENTRY_FIELDS` extension (D-13), otherwise the schema test fails CI in the intermediate state.

---

### `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` (test, schema-guard — MODIFY for D-15)

**Self-extension point:** lines 64-85 — add new presence assertions in the existing `describe` block.

**Existing test to extend** (lines 65-72 — the existence + iteration-count tests stay as-is):

```javascript
it.skipIf(!fs.existsSync(FIXTURE))('fixture exists at tests/e2e/fixtures/uat-phase32-llm-report.json', () => {
  expect(fs.existsSync(FIXTURE)).toBe(true);
});

it.skipIf(!fs.existsSync(FIXTURE))('fixture has >=10 iterations (D-10 pass bar)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  expect(Array.isArray(fixture.iterations)).toBe(true);
  expect(fixture.iterations.length).toBeGreaterThanOrEqual(10);
});
```

**Round-trip test that auto-updates with the implementation** (lines 75-84 — unchanged; the round-trip through `appendLlmIteration` automatically gains the 4-key check after D-13 ships):

```javascript
it.skipIf(!fs.existsSync(FIXTURE))('every iteration passes appendLlmIteration schema guard (REQUIRED_ENTRY_FIELDS)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const iter of fixture.iterations) {
    expect(() => appendLlmIteration(tmpReportPath, iter)).not.toThrow();
  }
});
```

**New assertions to add** (D-15 explicit presence checks for the 4 new keys + the schema_version field):

```javascript
it.skipIf(!fs.existsSync(FIXTURE))('schema_version: 1 at top level (D-15 Phase 33)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  expect(fixture.schema_version).toBe(1);
});

it.skipIf(!fs.existsSync(FIXTURE))('every iteration has 4 capture-state keys present (RERUN-03)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const iter of fixture.iterations) {
    expect(iter).toHaveProperty('scroll_y');
    expect(iter).toHaveProperty('viewport_width');
    expect(iter).toHaveProperty('viewport_height');
    expect(iter).toHaveProperty('selected_node_xpath');
  }
});
```

---

### `tests/unit/llm-report.test.js` (test, unit — MODIFY for D-13 coverage)

**Self-extension point:** Test 12 (lines 279-301) — extend with 4 new missing-key cases AND a new "null permitted on the 4 new keys" case.

**Existing Test 12 pattern** (lines 279-285):

```javascript
it('Test 12a: rejects entries missing iteration_n', () => {
  expect(() => appendLlmIteration(reportPath, {
    iso: '2026-05-18T10:00:30.000Z',
    classification: 'PASS',
    cost_usd: 0.19,
  })).toThrow(/iteration_n/);
});
```

**New cases to add** (D-13 extension coverage — mirror Test 12 shape for each of the 4 new keys):

```javascript
it('Test 12d: rejects entries missing scroll_y (RERUN-03 schema extension)', () => {
  // Note: the makeIteration helper at line 63 must also be updated to include
  // the 4 new keys with default values so the OTHER tests still pass.
  const baseValid = makeIteration({ classification: 'PASS' });
  delete baseValid.scroll_y;
  expect(() => appendLlmIteration(reportPath, baseValid)).toThrow(/scroll_y/);
});

// ...12e, 12f, 12g for viewport_width / viewport_height / selected_node_xpath

it('Test 12h: permits null on the 4 capture fields (D-13 null-allowed semantics)', () => {
  // Pre-browser failure paths in e2e-explore.mjs supply null for all 4 keys.
  // The schema-guard MUST require KEY presence but ALLOW null VALUE.
  initLlmReport(reportPath, { run_id: RUN_ID, iterations_total: 1 });
  expect(() => appendLlmIteration(reportPath, makeIteration({
    classification: 'LLM_API_ERROR',
    scroll_y: null,
    viewport_width: null,
    viewport_height: null,
    selected_node_xpath: null,
  }))).not.toThrow();
});

it('Test 12i: still rejects null on the original 3 non-null fields (D-13 preserves strictness)', () => {
  // Option (a) split-list: iteration_n / iso / classification retain
  // "undefined or null forbidden" semantics.
  expect(() => appendLlmIteration(reportPath, makeIteration({
    classification: null,
  }))).toThrow(/classification/);
});
```

**Required update to `makeIteration` helper** (lines 63-90) — add the 4 new keys to the default object so Tests 1-11 still produce valid iterations:

```javascript
function makeIteration(overrides = {}) {
  return {
    // ... existing fields ...
    llm_raw_response: '{"caseId":"..."}',
    // D-13 Phase 33 — capture-state defaults (real values; tests can override with null)
    scroll_y: 0,
    viewport_width: 1280,
    viewport_height: 720,
    selected_node_xpath: '/html/body[1]/div[1]',
    ...overrides,
  };
}
```

---

## Shared Patterns

### Atomic JSON Write (EXDEV-fallback)

**Source:** `tests/e2e/lib/llm-report.js` lines 76-91 (canonical) + `tests/e2e/lib/llm-ledger.js` lines 341-355 (second exemplar)
**Apply to:** `tests/e2e/lib/rerun-validator.js` (D-12 — inline copy, NOT extracted to a shared util per CONTEXT.md)

```javascript
function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.writeFileSync(destPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}
```

### Strict-regex CLI flag validation

**Source:** `scripts/e2e-explore.mjs` lines 83-147 (parseArgs idiom)
**Apply to:** `scripts/e2e-rerun-validator.mjs` (D-06 — `--input <path>`)

Key principles preserved:
- Reject `--input=value` (equals syntax) with explicit message
- Reject missing trailing value with explicit message
- Exit code 2 for arg-parse failures (mirrors e2e-explore.mjs)
- `--help` / `-h` print usage and exit 0
- Hand-rolled parseArgs (no yargs/commander — zero-new-deps mandate)

### Pure-orchestrator + injected-deps shape

**Source:** `scripts/e2e-upload-llm-report.mjs` lines 141-432 (canonical pattern)
**Apply to:** `scripts/e2e-rerun-validator.mjs` + `tests/e2e/lib/rerun-validator.js`

The CLI shim wires real deps (`fs.readFileSync`, real `verifyCitation`, `process.stdout/stderr/exit`); the orchestrator accepts them as parameters so unit tests inject mocks. The CLI body should be a `main()` that does:
1. parseArgs
2. resolve input path (default = newest by mtime)
3. wire real deps + call `runValidator()`
4. on error, `process.exit(code)` per documented exit-code table

### vitest schema-guard via round-trip

**Source:** `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` lines 75-84
**Apply to:** Extension of the same file (D-15) + the new presence-only assertions

The round-trip through `appendLlmIteration` auto-extends with the implementation — when D-13 lands, the test that "every iteration passes appendLlmIteration schema guard" automatically requires the 4 new keys. No separate assertion list to maintain.

### spawnSync hermetic CLI test

**Source:** `tests/e2e/scripts/e2e-explore-phase-flag.test.js` lines 42-67 (wrapper) + lines 69-118 (negative cases)
**Apply to:** `tests/e2e/scripts/e2e-rerun-validator.test.js`

Key principles:
- Use `timeout: 3000` (below vitest's default 5000ms — avoids "Test timed out" race when the script reaches a blocking path)
- `expect(r.status).toBe(N)` for explicit exit codes
- `expect(r.stderr || '').toMatch(/.../i)` for error-message assertions
- For "accepted" tests, ALSO assert stderr does NOT contain rejection signatures (WR-07 stderr-absence pattern)

### Per-file ESLint `no-restricted-imports` block

**Source:** `eslint.config.js` lines 50-71 (the pdf-verifier.js block)
**Apply to:** `eslint.config.js` new block for `tests/e2e/lib/rerun-validator.js` (D-16)

Per D-16 explicit choice — clone the EXACT block shape (NOT a glob like `{pdf-verifier,rerun-validator}.js`). The independence-claim audit story is per-file.

---

## No Analog Found

All 11 files have direct or self-extension analogs in the codebase. No "no analog" entries.

The synthetic CONFIRMED / FLAKE / edge-2/3 test fixtures (handcrafted JSON) have no real-data analog (Pitfall 6: the committed UAT fixture has zero replay-eligible iterations), but the FIXTURE SHAPE is the existing `llm-report.json` shape extended with D-13's 4 keys. The planner constructs these inline in the test file via the `makeIteration({ classification: 'WRONG_CITATION', verifier_verdict: {...} })` helper rather than committing a separate fixture file (matches the `makeIteration` pattern at `tests/unit/llm-report.test.js` lines 63-90).

---

## Cross-Cutting Pitfall Notes (from RESEARCH.md, applied at planner time)

- **Pitfall 3 (Critical, Implementation):** the appendLlmIteration extension MUST permit null on the 4 new keys (option a split-list); the planner's tests must cover both halves (missing key → throws; null value on new key → does NOT throw).
- **Pitfall 4 (Ordering):** D-15 (fixture re-stamp) must land BEFORE D-13 (REQUIRED_ENTRY_FIELDS extension) or in the same atomic commit. Otherwise the schema test fails CI mid-PR.
- **Pitfall 6 (Test Fixture):** synthetic fixtures required for CONFIRMED/FLAKE/edge-2/3 paths; the committed UAT fixture only exercises NOT_REPLAYABLE (10/10 NOT_REPLAYABLE entries).
- **RESEARCH.md anti-pattern (Critical):** ALL 6 `appendLlmIteration` call sites in `e2e-explore.mjs` must include the 4 new keys — null on the 5 pre-browser failure paths, real values on the 1 post-selectText success path. The plan-checker grep gate (`grep -c 'scroll_y\|viewport_width\|viewport_height\|selected_node_xpath' scripts/e2e-explore.mjs` ≥ 24 occurrences = 4 × 6) is the structural enforcement.
- **RESEARCH.md anti-pattern (Verdict thresholds):** `confirmed_count >= 2`, NOT `> 2`. The edge-case "exactly 2/3" test (success criterion 2) would fail under the wrong inequality.

---

## Metadata

**Analog search scope:**
- `tests/e2e/lib/` (pure-data libs: pdf-verifier.js, llm-report.js, llm-ledger.js)
- `scripts/` (CLI shims: e2e-explore.mjs, e2e-upload-llm-report.mjs)
- `tests/e2e/scripts/` (spawnSync CLI tests: e2e-explore-phase-flag.test.js, e2e-explore-ci-guard.test.js)
- `tests/unit/` (vitest unit tests: llm-report.test.js)
- `tests/e2e/fixtures/` (committed fixtures + schema tests)
- `eslint.config.js` (per-file rule blocks)

**Files scanned:** 11 (all read fully; none re-read)
**Pattern extraction date:** 2026-05-25

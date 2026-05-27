# Phase 35: Rich Issue Filer + Quarantine Corpus — Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 11 (5 created + 1 extended + 1 extended-pre-req + 5 test files)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/update-golden.js` (EXTEND: add `--case` flag) | script/CLI | batch transform | self — existing `--confirm` flag handling (lines 27-31, 40-65) | self-extension |
| `tests/e2e/lib/issue-payload-builder.js` (NEW) | lib (pure-fn) | pure transform | `tests/e2e/lib/triage-classifier.js` (pure-fn lib shape, no I/O) + `scripts/e2e-report-issue.mjs::buildIssueBody` (issue body builder) | exact (composite) |
| `scripts/e2e-report-issue.mjs` (EXTEND: `--source triage`, `topOfStackHashFromTriage`, dual-search) | script/CLI | request-response (gh CLI) | self — existing `fingerprint()`, `topOfStackHashFromCase()`, `findMatchingIssue()`, `buildIssueBody()` | self-extension |
| `tests/e2e/test-cases-quarantine.js` (NEW) | data (corpus) | static | `tests/test-cases.js` (TEST_CASES export shape) | exact |
| `scripts/quarantine-append.mjs` (NEW) | script/CLI | read-modify-write (JS module) | `scripts/e2e-triage-classifier.mjs` (CLI shim + parseArgs + WR-05 path bounding) + `scripts/update-golden.js` lines 33-34 (dynamic-import-of-ES-module pattern) | role-match + composite |
| `scripts/promote-from-quarantine.mjs` (NEW) | script/CLI | spawnSync + read-modify-write | `scripts/e2e-rerun-validator.mjs` (CLI shim) + `scripts/e2e-triage-classifier.mjs` (CI guard, sanitize) + `scripts/update-golden.js` (dynamic-import) | role-match + composite |
| `tests/unit/issue-payload-builder.test.js` (NEW) | test (unit) | pure-fn assertions | `tests/unit/e2e-report-issue.test.js` (pure-fn export coverage) | exact |
| `tests/unit/test-cases-quarantine-schema.test.js` (NEW) | test (unit/schema-guard) | static-grep guard | `tests/unit/cache-version.test.js` (schema-drift static guard) | exact |
| `tests/unit/quarantine-append.test.js` (NEW) | test (unit) | tmpDir read-modify-write | `tests/e2e/scripts/e2e-rerun-validator.test.js` lines 76-103 (tmpDir + mkdtempSync + copyFileSync) | role-match |
| `tests/unit/promote-from-quarantine.test.js` (NEW) | test (unit) | tmpDir + mock spawnSync | `tests/e2e/scripts/e2e-rerun-validator.test.js` (tmpDir + spawnSync pattern) | role-match |
| `tests/e2e/scripts/e2e-report-issue-triage.test.js` (NEW) | test (CLI integration) | spawnSync CLI | `tests/e2e/scripts/e2e-rerun-validator.test.js` (spawnSync, 3000ms timeout, WR-07 stderr-absence) | exact |

## Pattern Assignments

### `scripts/update-golden.js` (script/CLI, batch transform) — EXTEND with `--case <id>` flag

**Analog:** self — existing `--confirm` flag handling (lines 26-31) and TEST_CASES iteration (lines 40-65).

**Existing flag-parse pattern** (lines 26-31, the analog for `--case` parsing):
```javascript
// Safety check: require --confirm flag so this is never run accidentally.
if (!process.argv.includes('--confirm')) {
  console.error('This will overwrite the golden baseline. Run with --confirm to proceed.');
  console.error('Usage: npm run update-golden -- --confirm');
  process.exit(1);
}
```
**Apply:** Add a parallel `--case <id>` parse. Use the strict positional-arg pattern from `scripts/e2e-triage-classifier.mjs` lines 58-98 (reject `--case=<value>` equals-syntax with exit 2; reject missing trailing value with exit 2). Validate the id via `sanitizeCaseId` regex (mirror `e2e-report-issue.mjs::CASE_ID_RE` at line 35) BEFORE filtering.

**Existing TEST_CASES iteration** (lines 40-65, the analog for the filter):
```javascript
const baseline = {};
let count = 0;

for (const testCase of TEST_CASES) {
  const { id, patentFile, selectedText } = testCase;
  // … resolve fixture, call matchAndCite, write baseline[id] …
}

const outputPath = resolve(ROOT, 'tests/golden/baseline.json');
writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
```
**Apply (per-case extension):** Read the existing `tests/golden/baseline.json` first. When `--case <id>` is present, filter `TEST_CASES` to the single entry, compute its new `{citation, confidence}`, OVERWRITE only that key in the in-memory baseline, write the whole object back. When `--case` is absent, behavior is unchanged (regenerate all). Mirror Pitfall 5 mitigation: when `--case` is supplied but resolves to no entry, exit 1 with a clear error — never silently regenerate everything.

**Test pattern (NEW Vitest test):** mirror `tests/unit/cache-version.test.js` static-import shape; assert per-case path updates ONLY the named key (other keys byte-identical to the pre-run baseline).

---

### `tests/e2e/lib/issue-payload-builder.js` (lib, pure transform) — NEW

**Analog:** `tests/e2e/lib/triage-classifier.js` (pure-fn lib shape) + `scripts/e2e-report-issue.mjs::buildIssueBody` (issue body builder).

**Imports pattern** (from `tests/e2e/lib/triage-classifier.js` lines 27-28):
```javascript
import fs from 'node:fs';
import path from 'node:path';
```
**Apply:** Builder is PURE — D-04 forbids `fs`/`path`/`child_process`. Only import `node:crypto` if computing a fingerprint internally; per D-04 the CLI computes the fingerprint and passes it in. Recommended imports:
```javascript
import { createHash } from 'node:crypto'; // only if builder computes the fp itself; otherwise omit
```

**Core builder pattern** (analog: `scripts/e2e-report-issue.mjs::buildIssueBody` lines 152-184) — adapt the table+code-fence approach to 5 markdown-header sections:
```javascript
// CURRENT pattern in buildIssueBody (Phase 29):
return [
  `## E2E nightly failure: ${id}`,
  '',
  '| Field | Value |',
  '|-------|-------|',
  `| Patent | \`${id}\` |`,
  `| Error class | \`${cls}\` |`,
  // …
  '```',
  reason,
  '```',
  '',
  `<!-- fingerprint: ${fp} -->`,  // <-- LAST line in v1; Phase 35 D-02 moves to LINE 1
].join('\n');
```
**Apply (D-02 + D-03):**
- LINE 1 is `<!-- fp: ${fp} -->` (D-02). NEVER prepend anything — the CLI must not add a wrapper.
- Sections in fixed order: Reproducer → Verifier Disagreement → LLM Rationale → Golden Diff.
- Each section truncated independently via a single `truncate(text, budget)` helper. Budgets: rationale ≤ 800, each verifier window ≤ 600, golden diff ≤ 400.
- Wrap LLM-derived text (`triageFinding.rationale`, `verifier_verdict.reason`) in fenced code blocks — mirror Phase 29 T-29-02-2 (lines 159-160, 178-180).

**Truncation suffix pattern (NEW):**
```javascript
const TRUNCATION_SUFFIX = '\n…[truncated, full content in artifacts]';
function truncate(text, budget) {
  if (typeof text !== 'string') return '';
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}
```

**Labels pattern** (D-04):
```javascript
const labels = [triageFinding.category, 'e2e-nightly', 'triage'];
```
Use `e2e-report-issue.mjs::NIGHTLY_LABEL = 'e2e-nightly'` constant (line 30) — re-export or duplicate the literal.

**Pitfall to avoid:** Builder must NOT do I/O. Mirror `triage-classifier.js`'s "no browser imports, no src/ imports" comment (line 9). The CLI assembles all inputs; the builder is purely synchronous string composition.

---

### `scripts/e2e-report-issue.mjs` (script/CLI, request-response) — EXTEND with `--source triage`

**Analog:** self — existing `fingerprint()` (line 49), `topOfStackHashFromCase()` (line 65), `findMatchingIssue()` (line 210), `processReport()` (line 232), `makeRealGhClient()` (line 276).

**Existing fingerprint helper** (lines 49-52 — reuse verbatim; the 3rd arg path is already in place):
```javascript
export function fingerprint(caseId, errorClass, topOfStackHash) {
  const input = `${caseId}|${errorClass}|${topOfStackHash || ''}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}
```
**Apply:** No change to `fingerprint()`. New call sites compute both `fpV1 = fingerprint(id, cls, '')` (matches existing v1) AND `fpV2 = fingerprint(id, cls, topOfStackHashFromTriage(...))`.

**Pattern for new `topOfStackHashFromTriage`** (analog: `topOfStackHashFromCase` lines 65-73):
```javascript
// CURRENT:
export function topOfStackHashFromCase(caseEntry) {
  const reason = caseEntry?.verifier_verdict?.reason;
  if (!reason || typeof reason !== 'string') return null;
  return createHash('sha256')
    .update(reason.slice(0, 200))
    .digest('hex')
    .substring(0, 12);
}
```
**Apply (D-08):**
```javascript
export function topOfStackHashFromTriage(finding, rerunEntry, iteration) {
  const input = JSON.stringify({
    rationale_first_30_chars: (finding.rationale ?? '').slice(0, 30),
    verifier_status: rerunEntry?.original_verdict_status ?? null,
    classification: iteration.classification ?? null,
  });
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}
```
Place this function adjacent to `topOfStackHashFromCase` (lines 65-73) per D-08 "kept close to existing".

**Existing dedup search** (lines 210-214):
```javascript
export function findMatchingIssue(issues, fp) {
  if (!Array.isArray(issues) || !fp) return null;
  const marker = `<!-- fingerprint: ${fp} -->`;
  return issues.find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
}
```
**Apply (D-07 dual-search):**
1. The `marker` constant must support BOTH the legacy v1 format `<!-- fingerprint: ${fp} -->` AND the new D-02 v2 format `<!-- fp: ${fp} -->`. Either change the marker to check both formats, OR keep a v1 dedicated marker for v1-fingerprinted bodies and use `<!-- fp: -->` for v2-fingerprinted bodies. Pitfall 3 — execute BOTH searches; never short-circuit.
2. Add a new wrapper `findMatchingIssueDual(ghClient, fpV1, fpV2)` that runs `ghClient.listOpenWithSearch(<v1 marker>)` AND `ghClient.listOpenWithSearch(<v2 marker>)`, concatenates results, and returns the first match using EITHER marker.

**Existing `makeRealGhClient`** (lines 276-312 — extend with two new methods):
```javascript
// CURRENT createIssue (lines 291-301) — single-label only:
createIssue(title, body) {
  const escapedTitle = title.replaceAll('"', '\\"');
  const out = execSync(
    `gh issue create --title "${escapedTitle}" --label ${NIGHTLY_LABEL} --body-file -`,
    { input: body, encoding: 'utf8' }
  );
  const m = out.match(/\/issues\/(\d+)/);
  return { number: m ? parseInt(m[1], 10) : null };
}
```
**Apply (D-06 multi-label + D-07 search method):**
```javascript
createIssueWithLabels(title, body, labels) {
  // labels is array of strings; gh accepts repeated --label flags
  const labelArgs = labels.map(l => `--label "${l.replaceAll('"', '\\"')}"`).join(' ');
  const escapedTitle = title.replaceAll('"', '\\"');
  const out = execSync(
    `gh issue create --title "${escapedTitle}" ${labelArgs} --body-file -`,
    { input: body, encoding: 'utf8' }
  );
  const m = out.match(/\/issues\/(\d+)/);
  return { number: m ? parseInt(m[1], 10) : null };
},
listOpenWithSearch(query) {
  try {
    const escaped = query.replaceAll("'", "'\\''");
    const raw = execSync(
      `gh issue list --search '${escaped}' --state open --json number,title,body,updatedAt --limit 30`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[e2e-report-issue] listOpenWithSearch failed:', err.message);
    return [];
  }
},
addLabel(issueNumber, label) {
  // D-12: gh issue edit no-ops if label already present (idempotent)
  execSync(`gh issue edit ${issueNumber} --add-label "${label.replaceAll('"', '\\"')}"`, { encoding: 'utf8' });
},
```

**Pattern for `--source` flag parsing** (analog: existing CLI entrypoint at lines 318-368, plus `e2e-triage-classifier.mjs` strict parseArgs lines 58-98):
```javascript
// Existing CLI uses ad-hoc process.argv.includes('--meta-drift'); for --source <regression|triage>
// reuse the strict parseArgs pattern from e2e-triage-classifier.mjs to reject equals-syntax.
```

**Existing CONFIRMED filter pattern** (`filterCasesForFiling` lines 104-119) — analog for new triage filter:
```javascript
// CURRENT (regression-source filter):
export function filterCasesForFiling(cases) {
  if (!Array.isArray(cases)) return [];
  return cases.filter(c => {
    if (c.status === 'skipped') return false;
    if (c.errorClass === 'FLAKE') return false;
    if (c.status === 'passed' && !c.errorClass) return false;
    if (c.status === 'failed' && c.errorClass) return true;
    if (c.status === 'failed') return true;
    return false;
  });
}
```
**Apply (D-05 + Pitfall 8 refinement):** Add a parallel `filterFindingsForFiling(findings, rerunByIter, llmByIter)` exported pure function:
```javascript
export function filterFindingsForFiling(findings, rerunByIter, llmByIter) {
  if (!Array.isArray(findings)) return [];
  return findings.filter(f => {
    const rerun = rerunByIter.get(f.iteration_n);
    const iter = llmByIter.get(f.iteration_n);
    if (!iter) return false;
    const isConfirmed = ['critical', 'high'].includes(f.severity)
                      || rerun?.verdict === 'CONFIRMED';
    const isHarnessNoise = f.category === 'HARNESS_ERROR'
                         || (f.path_taken ?? '').endsWith('_parse_error');
    return isConfirmed && !isHarnessNoise;
  });
}
```

---

### `tests/e2e/test-cases-quarantine.js` (data corpus, static) — NEW

**Analog:** `tests/test-cases.js` lines 37-46 (TEST_CASES entry shape).

**Existing entry shape** (lines 41-46):
```javascript
export const TEST_CASES = [
  {
    id: 'US11427642-spec-short-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts. …',
    category: 'modern-short',
  },
  // …
];
```
**Apply:** Initial commit is empty array — schema-guard test passes vacuously until first append:
```javascript
// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit.
export const TEST_CASES_QUARANTINE = [];
```
After first append (D-10 — first 4 keys IDENTICAL to TEST_CASES + 3 quarantine-only):
```javascript
{
  id: 'US11427642-claims-1',
  patentFile: './tests/fixtures/US11427642.json',
  selectedText: '…',
  category: 'claims',
  stable_runs: 1,
  source_triage_finding_id: '20260527T120000Z-iter-3',
  added_iso: '2026-05-27T12:00:00.000Z',
},
```

**Pitfall 4 mitigation:** Stringification key order is FIXED: `id, patentFile, selectedText, category, stable_runs, source_triage_finding_id, added_iso`. Implemented in `quarantine-append.mjs::formatEntry()` — see next section.

---

### `scripts/quarantine-append.mjs` (script/CLI, read-modify-write) — NEW

**Analog:** `scripts/e2e-triage-classifier.mjs` (CLI shim + parseArgs + CI guard + WR-05 path bounding) + `scripts/update-golden.js` lines 33-34 (dynamic-import).

**Imports pattern** (mirror `e2e-triage-classifier.mjs` lines 24-32):
```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACTS_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');
const FIXTURES_ROOT = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const CORPUS_PATH = path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js');
const ALLOWED_INPUT_ROOTS = [ARTIFACTS_ROOT, FIXTURES_ROOT];
```

**parseArgs pattern** (analog: `e2e-triage-classifier.mjs` lines 58-98):
```javascript
function parseArgs(argv) {
  let inputPath = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--input=')) {
      process.stderr.write('[quarantine-append] equals syntax not supported for --input; use `--input <value>`\n');
      process.exit(2);
    } else if (argv[i] === '--input') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[quarantine-append] missing value for --input\n');
        process.exit(2);
      }
      inputPath = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      // … usage …
      process.exit(0);
    }
  }
  return { inputPath };
}
```
Apply VERBATIM — only swap the script name in error messages.

**WR-05 path-bounding pattern** (analog: `e2e-triage-classifier.mjs` lines 181-190):
```javascript
const insideAllowedRoot = ALLOWED_INPUT_ROOTS.some(
  (root) => resolvedInputPath === root || resolvedInputPath.startsWith(root + path.sep),
);
if (!insideAllowedRoot) {
  process.stderr.write(
    '[quarantine-append] --input must reside under tests/e2e/artifacts/ or ' +
      'tests/e2e/fixtures/; got: ' + resolvedInputPath + '\n',
  );
  process.exit(1);
}
```
**Apply VERBATIM** — security control identical to Phase 34.

**Sibling auto-discovery pattern** (analog: `e2e-triage-classifier.mjs` lines 208-220 for `rerun-report.json`):
```javascript
// Discover triage-report.json (the input), llm-report.json, rerun-report.json
// all in the same artifacts/{runId}/ dir.
const triageReportPath = resolvedInputPath; // when --input points to triage-report.json
const llmReportPath = path.join(path.dirname(resolvedInputPath), 'llm-report.json');
const rerunReportPath = path.join(path.dirname(resolvedInputPath), 'rerun-report.json');
if (!fs.existsSync(llmReportPath)) { /* exit 1 */ }
if (!fs.existsSync(rerunReportPath)) { /* exit 1 */ }
```

**Dynamic-import-of-ES-module pattern** (analog: `scripts/update-golden.js` lines 33-34):
```javascript
// CURRENT in update-golden.js:
const { TEST_CASES } = await import('../tests/test-cases.js');
const { matchAndCite } = await import('../src/shared/matching.js');
```
**Apply (cache-busted re-import for the same-process re-read):**
```javascript
const url = `${pathToFileURL(CORPUS_PATH).href}?t=${Date.now()}`;
const { TEST_CASES_QUARANTINE } = await import(url);
```
Cache-bust query string is necessary if the script ever upserts twice in one process (e.g., tests). Direct import (no query) is sufficient if upsert is one-shot per process.

**Upsert pattern (NEW — D-11):**
```javascript
const existing = TEST_CASES_QUARANTINE.find(e => e.id === newEntry.id);
let action;
if (existing) {
  existing.stable_runs += 1;
  // added_iso NOT mutated — preserves first-observation timestamp (D-11)
  action = 'upserted';
} else {
  TEST_CASES_QUARANTINE.push({
    id: newEntry.id,
    patentFile: newEntry.patentFile,
    selectedText: newEntry.selectedText,
    category: newEntry.category,
    stable_runs: 1,
    source_triage_finding_id: newEntry.source_triage_finding_id,
    added_iso: new Date().toISOString(),
  });
  action = 'inserted';
}
atomicWriteJson(CORPUS_PATH, stringifyCorpus(TEST_CASES_QUARANTINE));
```

**Deterministic stringifier (NEW — Pitfall 4 mitigation):**
```javascript
// Pitfall 4: explicit key order prevents non-deterministic git diffs.
function formatEntry(entry) {
  const lines = [
    `    id: ${JSON.stringify(entry.id)}`,
    `    patentFile: ${JSON.stringify(entry.patentFile)}`,
    `    selectedText: ${JSON.stringify(entry.selectedText)}`,
    `    category: ${JSON.stringify(entry.category)}`,
    `    stable_runs: ${entry.stable_runs}`,
    `    source_triage_finding_id: ${JSON.stringify(entry.source_triage_finding_id)}`,
    `    added_iso: ${JSON.stringify(entry.added_iso)}`,
  ];
  return `  {\n${lines.join(',\n')},\n  }`;
}
function stringifyCorpus(entries) {
  if (entries.length === 0) {
    return '// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit.\nexport const TEST_CASES_QUARANTINE = [];\n';
  }
  return '// AUTO-MANAGED by scripts/quarantine-append.mjs — do not hand-edit.\n' +
         `export const TEST_CASES_QUARANTINE = [\n${entries.map(formatEntry).join(',\n')},\n];\n`;
}
```

**stable_runs ≥ 3 label-add pattern (D-12):**
```javascript
if (existing && existing.stable_runs >= 3 && triageIssueNumber) {
  ghClient.addLabel(triageIssueNumber, 'quarantine:ready-for-promotion');
}
```
Reuses `ghClient.addLabel` extension from `e2e-report-issue.mjs`.

**Atomic write pattern** (analog: `tests/e2e/lib/rerun-validator.js` lines 111-126 — already imported):
```javascript
export function atomicWriteJson(destPath, content) {
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
**Apply:** Import directly from `tests/e2e/lib/rerun-validator.js` (D-16 — no fourth inline copy; reuse the existing export).

**isMain guard** (analog: `e2e-triage-classifier.mjs` lines 252-261):
```javascript
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    process.stderr.write('[quarantine-append] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}
```

---

### `scripts/promote-from-quarantine.mjs` (script/CLI, spawnSync + read-modify-write) — NEW

**Analog:** `scripts/e2e-rerun-validator.mjs` (CLI shim shape) + `scripts/e2e-triage-classifier.mjs` (CI guard, sanitize) + `scripts/update-golden.js` lines 33-34 (dynamic-import).

**Imports pattern** (mirror `e2e-rerun-validator.mjs` lines 21-29):
```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';
import { sanitizeCaseId } from './e2e-report-issue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const GOLDEN_CORPUS_PATH = path.resolve(PROJECT_ROOT, 'tests/test-cases.js');
const QUARANTINE_CORPUS_PATH = path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js');
const UPDATE_GOLDEN_SCRIPT = path.resolve(PROJECT_ROOT, 'scripts/update-golden.js');
```

**CI guard pattern** (analog: `e2e-triage-classifier.mjs` lines 154-160 — D-13 human-gated):
```javascript
if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  process.stderr.write(
    '[promote-from-quarantine] promotion is local-only; refusing to run in CI\n',
  );
  process.exit(1);
}
```
**Apply VERBATIM** — D-13 mandates no CI invocation.

**parseArgs pattern** (analog: `e2e-triage-classifier.mjs` parseArgs lines 58-98 — adapt to `--id` + `--confirm`):
```javascript
function parseArgs(argv) {
  let id = null;
  let confirm = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--id=')) {
      process.stderr.write('[promote-from-quarantine] equals syntax not supported for --id; use `--id <value>`\n');
      process.exit(2);
    } else if (argv[i] === '--id') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[promote-from-quarantine] missing value for --id\n');
        process.exit(2);
      }
      id = next;
      i++;
    } else if (argv[i] === '--confirm') {
      confirm = true;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      // … usage …
      process.exit(0);
    }
  }
  if (!id) {
    process.stderr.write('[promote-from-quarantine] --id required\n');
    process.exit(2);
  }
  return { id, confirm };
}
```

**sanitize id pattern** (analog: `e2e-report-issue.mjs::sanitizeCaseId` line 83-93 — reuse via import):
```javascript
let safeId;
try {
  safeId = sanitizeCaseId(id);  // reuse via `import { sanitizeCaseId } from './e2e-report-issue.mjs'`
} catch (err) {
  process.stderr.write('[promote-from-quarantine] invalid --id: ' + err.message + '\n');
  process.exit(1);
}
```

**Dry-run pattern (NEW — D-13 without --confirm):** mirror the discretion-recommended 4-row table:
```javascript
if (!confirm) {
  process.stdout.write([
    '=== Dry-run promotion plan for ' + safeId + ' ===',
    `Source quarantine:        ${QUARANTINE_CORPUS_PATH}`,
    `  id:                     ${entry.id}`,
    `  selectedText (preview): ${entry.selectedText.slice(0, 60)}${entry.selectedText.length > 60 ? '…' : ''}`,
    `  stable_runs:            ${entry.stable_runs}`,
    `Target golden corpus:     ${GOLDEN_CORPUS_PATH}`,
    `  append at index:        ${TEST_CASES.length}`,
    `Golden baseline file:     tests/golden/baseline.json`,
    `Will invoke:              node scripts/update-golden.js --case ${safeId} --confirm`,
    '',
    'Re-run with --confirm to apply.',
  ].join('\n') + '\n');
  process.exit(0);
}
```

**Promotion flow pattern (NEW — D-14 5-step):**
```javascript
try {
  // Step 2: strip 3 quarantine-only metadata keys
  const promoted = {
    id: entry.id,
    patentFile: entry.patentFile,
    selectedText: entry.selectedText,
    category: entry.category,
  };
  // Step 3: append to tests/test-cases.js
  // Open Question 2: regex-insert before the closing '];' line to preserve
  // hand-written comments + section dividers. Implement appendToGoldenCorpus
  // as a pure helper that takes the file content + promoted entry and returns
  // updated content. Test it on a fixture copy.
  appendToGoldenCorpus(GOLDEN_CORPUS_PATH, promoted);
  // Step 4: remove from quarantine
  const remaining = TEST_CASES_QUARANTINE.filter(e => e.id !== safeId);
  atomicWriteJson(QUARANTINE_CORPUS_PATH, stringifyCorpus(remaining));
  // Step 5: regenerate golden baseline for THIS case ONLY
  const result = spawnSync('node', [UPDATE_GOLDEN_SCRIPT, '--case', safeId, '--confirm'], {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,  // CRITICAL: Pitfall 6 — bind to PROJECT_ROOT, not test tmpDir
  });
  if (result.status !== 0) {
    throw new Error(`update-golden.js exited ${result.status}: ${result.stderr}`);
  }
  process.stdout.write(`[promote-from-quarantine] promoted ${safeId} successfully\n`);
} catch (err) {
  process.stderr.write(`[promote-from-quarantine] FAILED: ${err.message}\n`);
  process.stderr.write('[promote-from-quarantine] Inspect partial state via `git status`; revert with `git checkout tests/`\n');
  process.exit(1);
}
```

**Duplicate-id refusal** (D-15 test asserts):
```javascript
if (TEST_CASES.find(e => e.id === safeId)) {
  process.stderr.write(`[promote-from-quarantine] entry ${safeId} already in golden corpus — refusing to duplicate\n`);
  process.exit(1);
}
```

---

### `tests/unit/issue-payload-builder.test.js` (test, unit) — NEW

**Analog:** `tests/unit/e2e-report-issue.test.js` lines 1-80 (pure-fn export coverage pattern).

**Imports pattern** (lines 17-31):
```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIssuePayload,
  // export internal truncate + fingerprintComment for direct testing
} from '../../tests/e2e/lib/issue-payload-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

**Determinism test pattern** (analog: `e2e-report-issue.test.js` lines 42-46):
```javascript
it('is deterministic — same inputs produce same output', () => {
  const a = buildIssuePayload(fixtureInputs);
  const b = buildIssuePayload(fixtureInputs);
  expect(a.body).toBe(b.body);
  expect(a.title).toBe(b.title);
  expect(a.labels).toEqual(b.labels);
});
```

**Line-1 fingerprint test (Pitfall 1):**
```javascript
it('body line 1 is the fingerprint HTML comment (D-02)', () => {
  const { body } = buildIssuePayload({ ...fixtureInputs, fingerprint: 'abc123def456' });
  expect(body.split('\n')[0]).toMatch(/^<!-- fp: [a-f0-9]{12} -->$/);
});
```

**Per-section budget tests (D-03):**
```javascript
it('LLM rationale exceeding 800 chars is truncated with suffix', () => {
  const huge = 'X'.repeat(10000);
  const { body } = buildIssuePayload({ ...fixtureInputs, triageFinding: { ...base, rationale: huge } });
  // Extract LLM Rationale section and assert its length ≤ 800
  const section = extractSection(body, 'LLM Rationale');
  expect(section.length).toBeLessThanOrEqual(800);
  expect(section).toContain('…[truncated, full content in artifacts]');
});

it('worst-case 10K-char inputs produce body ≤ 50,000 chars (Pitfall 2)', () => {
  const huge = 'X'.repeat(10000);
  const { body } = buildIssuePayload({ /* all sections maxed */ });
  expect(body.length).toBeLessThanOrEqual(50000);
});
```

---

### `tests/unit/test-cases-quarantine-schema.test.js` (test, schema-guard) — NEW

**Analog:** `tests/unit/cache-version.test.js` (entire file — static-grep schema-drift guard).

**Imports pattern** (lines 18-27):
```javascript
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { TEST_CASES } from '../../tests/test-cases.js';
import { TEST_CASES_QUARANTINE } from '../../tests/e2e/test-cases-quarantine.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');
```

**Schema-assert pattern** (analog: `cache-version.test.js` lines 41-62 — adapt to key-set comparison):
```javascript
const CANONICAL_KEYS = ['id', 'patentFile', 'selectedText', 'category'];
const QUARANTINE_ONLY_KEYS = ['stable_runs', 'source_triage_finding_id', 'added_iso'];

describe('test-cases-quarantine.js schema (Phase 35 QUAR-01)', () => {
  it('canonical 4 keys are present in TEST_CASES sample entry', () => {
    const goldenKeys = new Set(Object.keys(TEST_CASES[0]));
    for (const k of CANONICAL_KEYS) expect(goldenKeys.has(k)).toBe(true);
  });

  it('every quarantine entry has exactly 4 canonical + 3 quarantine-only keys', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      const keys = new Set(Object.keys(entry));
      for (const k of CANONICAL_KEYS) expect(keys.has(k)).toBe(true);
      for (const k of QUARANTINE_ONLY_KEYS) expect(keys.has(k)).toBe(true);
      expect(keys.size).toBe(CANONICAL_KEYS.length + QUARANTINE_ONLY_KEYS.length);
    }
  });

  it('id matches the patent case-id regex', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(entry.id).toMatch(/^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$/);
    }
  });

  it('stable_runs is a positive integer', () => {
    for (const entry of TEST_CASES_QUARANTINE) {
      expect(Number.isInteger(entry.stable_runs)).toBe(true);
      expect(entry.stable_runs).toBeGreaterThanOrEqual(1);
    }
  });
});
```

---

### `tests/unit/quarantine-append.test.js` (test, unit + tmpDir) — NEW

**Analog:** `tests/e2e/scripts/e2e-rerun-validator.test.js` lines 76-103 (tmpDir + mkdtempSync + copyFileSync pattern).

**tmpDir setup pattern** (lines 76-90):
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir;
let corpusPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-quar-append-'));
  corpusPath = path.join(tmpDir, 'test-cases-quarantine.js');
  fs.writeFileSync(corpusPath, '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [];\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

**Idempotency test (D-11):**
```javascript
it('upsert twice with same id → 1 entry, stable_runs === 2, added_iso unchanged', async () => {
  const entry = { id: 'US123-claims-1', patentFile: './x.json', selectedText: 't', category: 'claims', source_triage_finding_id: 'f1' };
  const a = await upsertQuarantineEntry(entry, { corpusPath });
  const b = await upsertQuarantineEntry(entry, { corpusPath });
  // Re-import the corpus
  const url = `${pathToFileURL(corpusPath).href}?t=${Date.now()}`;
  const { TEST_CASES_QUARANTINE } = await import(url);
  expect(TEST_CASES_QUARANTINE.length).toBe(1);
  expect(TEST_CASES_QUARANTINE[0].stable_runs).toBe(2);
  expect(TEST_CASES_QUARANTINE[0].added_iso).toBe(a.entry.added_iso);
});
```

**Mock ghClient for label-add test (D-12):**
```javascript
it('addLabel called with quarantine:ready-for-promotion when stable_runs >= 3', async () => {
  const labelCalls = [];
  const mockGh = { addLabel: (n, l) => labelCalls.push({ n, l }) };
  // Pre-populate with stable_runs === 2 entry
  // Run upsert + verify mockGh.addLabel was called once with the right label
  expect(labelCalls).toEqual([{ n: 42, l: 'quarantine:ready-for-promotion' }]);
});
```

**formatEntry determinism test (Pitfall 4):**
```javascript
it('formatEntry produces byte-identical output for equivalent objects with different key order', () => {
  const a = { id: 'x', patentFile: 'p', selectedText: 's', category: 'c', stable_runs: 1, source_triage_finding_id: 'f', added_iso: 'iso' };
  const b = { added_iso: 'iso', source_triage_finding_id: 'f', stable_runs: 1, category: 'c', selectedText: 's', patentFile: 'p', id: 'x' };
  expect(formatEntry(a)).toBe(formatEntry(b));
});
```

---

### `tests/unit/promote-from-quarantine.test.js` (test, unit + tmpDir + mock spawnSync) — NEW

**Analog:** `tests/e2e/scripts/e2e-rerun-validator.test.js` (tmpDir + spawnSync invocation pattern; here the spawnSync is the SUBJECT, so we either run the real CLI with `cwd: tmpDir` OR import the exported `runPromote` pure-fn and inject a mock spawnSync).

**tmpDir clone pattern (D-15):**
```javascript
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-promote-'));
  // Clone both corpora into tmpDir so committed files stay clean (D-15)
  fs.cpSync(path.resolve(PROJECT_ROOT, 'tests/test-cases.js'), path.join(tmpDir, 'test-cases.js'));
  fs.cpSync(path.resolve(PROJECT_ROOT, 'tests/e2e/test-cases-quarantine.js'), path.join(tmpDir, 'test-cases-quarantine.js'));
});
```

**Mock spawnSync injection (Pitfall 6 mitigation):**
```javascript
it('--confirm: invokes spawnSync with correct args + moves entry between corpora', async () => {
  const spawnCalls = [];
  const mockSpawn = (cmd, args) => { spawnCalls.push({ cmd, args }); return { status: 0, stderr: '' }; };
  await runPromote({
    id: 'US123-claims-1',
    confirm: true,
    goldenPath: path.join(tmpDir, 'test-cases.js'),
    quarantinePath: path.join(tmpDir, 'test-cases-quarantine.js'),
    spawn: mockSpawn,  // injected mock
  });
  expect(spawnCalls).toEqual([{ cmd: 'node', args: ['scripts/update-golden.js', '--case', 'US123-claims-1', '--confirm'] }]);
  // Verify entry moved
  const golden = await import(/* cache-bust */); expect(golden.TEST_CASES.find(e => e.id === 'US123-claims-1')).toBeDefined();
  const quar   = await import(/* cache-bust */); expect(quar.TEST_CASES_QUARANTINE.find(e => e.id === 'US123-claims-1')).toBeUndefined();
});
```

**Dry-run test (D-13):**
```javascript
it('without --confirm: prints plan + exits 0 + corpora UNCHANGED', async () => {
  const beforeGolden = fs.readFileSync(path.join(tmpDir, 'test-cases.js'), 'utf8');
  const beforeQuar   = fs.readFileSync(path.join(tmpDir, 'test-cases-quarantine.js'), 'utf8');
  const { exitCode, stdout } = await runPromote({ id: 'US123-claims-1', confirm: false, /* paths */ });
  expect(exitCode).toBe(0);
  expect(stdout).toContain('Dry-run promotion plan');
  expect(fs.readFileSync(path.join(tmpDir, 'test-cases.js'), 'utf8')).toBe(beforeGolden);
  expect(fs.readFileSync(path.join(tmpDir, 'test-cases-quarantine.js'), 'utf8')).toBe(beforeQuar);
});
```

**Duplicate-id refusal test (D-15):**
```javascript
it('refuses to promote an id already in golden corpus', async () => {
  // Pre-populate test-cases-quarantine.js with id 'US11427642-spec-short-1' which IS in test-cases.js
  const r = await runPromote({ id: 'US11427642-spec-short-1', confirm: true, /* paths */ });
  expect(r.exitCode).toBe(1);
  expect(r.stderr).toMatch(/already in golden corpus/);
});
```

---

### `tests/e2e/scripts/e2e-report-issue-triage.test.js` (test, CLI integration) — NEW

**Analog:** `tests/e2e/scripts/e2e-rerun-validator.test.js` (entire file — spawnSync, 3000ms timeout, WR-07 stderr-absence pattern).

**Imports + spawn helper** (lines 22-44):
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/e2e-report-issue.mjs');

function spawnReporter(args, env = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 3000,
  });
}
```

**--source flag validation test (mirror lines 50-69):**
```javascript
describe('--source flag (Phase 35 ISSUE-02)', () => {
  it('rejects --source= (equals syntax) with exit 2', () => {
    const r = spawnReporter(['--source=triage']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/equals/i);
  });
  it('rejects --source with no value (trailing flag) with exit 2', () => {
    const r = spawnReporter(['--source']);
    expect(r.status).toBe(2);
    expect(r.stderr || '').toMatch(/missing value/i);
  });
});
```

**WR-07 stderr-absence pattern (lines 76-103) — adapt for --source triage:**
```javascript
describe('Phase 35 valid --source triage (WR-07 stderr-absence)', () => {
  let tmpDir, triagePath;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-issue-triage-'));
    // Copy a fixture triage-report.json + sibling llm-report.json + rerun-report.json
    // …
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('accepts --source triage without emitting rejection signatures', () => {
    const r = spawnReporter(['--source', 'triage', '--triage-report', triagePath], {
      GH_BIN_OVERRIDE: '/bin/echo',  // mock-gh
      GITHUB_REPOSITORY: 'test/test',
    });
    const stderr = r.stderr || '';
    expect(stderr).not.toMatch(/equals syntax not supported/i);
    expect(stderr).not.toMatch(/missing value/i);
  });
});
```

---

## Shared Patterns

### atomicWriteJson (EXDEV-safe)
**Source:** `tests/e2e/lib/rerun-validator.js` lines 111-126
**Apply to:** `scripts/quarantine-append.mjs`, `scripts/promote-from-quarantine.mjs`
**Import path:** `import { atomicWriteJson } from '../tests/e2e/lib/rerun-validator.js';`
**Rationale:** D-16 forbids new inline copies — reuse the existing export. EXDEV fallback already in place.
```javascript
export function atomicWriteJson(destPath, content) {
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

### sanitizeCaseId (case-id validation)
**Source:** `scripts/e2e-report-issue.mjs` lines 32-93 (CASE_ID_RE + sanitizeCaseId)
**Apply to:** `scripts/promote-from-quarantine.mjs` (input id), `scripts/update-golden.js` (new `--case` flag), `scripts/quarantine-append.mjs` (entry.id at upsert time)
**Import:** `import { sanitizeCaseId } from './e2e-report-issue.mjs';` (relative to scripts/) OR duplicate the const + function (3 lines).
```javascript
const CASE_ID_RE = /^[A-Z]{2,}\d+[A-Z]?\d*-[a-z0-9-]+$|^PRE-FLIGHT-[A-Z-]+$/;
export function sanitizeCaseId(id) {
  if (typeof id !== 'string') throw new Error(`sanitizeCaseId: expected string, got ${typeof id}`);
  if (!CASE_ID_RE.test(id)) throw new Error(`sanitizeCaseId: id "${id}" failed validation regex ${CASE_ID_RE}`);
  return id;
}
```

### Strict parseArgs (--flag <value>, equals-syntax rejected, --help → exit 0)
**Source:** `scripts/e2e-triage-classifier.mjs` lines 58-98, `scripts/e2e-rerun-validator.mjs` lines 47-86
**Apply to:** `scripts/quarantine-append.mjs` (`--input`), `scripts/promote-from-quarantine.mjs` (`--id`, `--confirm`), `scripts/update-golden.js` extension (`--case`)
**Exit codes:** 0 = help; 2 = bad flag value (equals syntax / missing value); 1 = runtime failure.

### isMain guard (WR-02 fix for Windows compat)
**Source:** `scripts/e2e-triage-classifier.mjs` lines 252-261
**Apply to:** `scripts/quarantine-append.mjs`, `scripts/promote-from-quarantine.mjs`
```javascript
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    process.stderr.write('[<script-name>] uncaught error: ' + e.message + '\n');
    process.exit(1);
  });
}
```

### CI guard (refuse to run in CI for human-gated scripts)
**Source:** `scripts/e2e-triage-classifier.mjs` lines 154-160
**Apply to:** `scripts/promote-from-quarantine.mjs` (D-13 mandates local-only)
**Do NOT apply to:** `scripts/quarantine-append.mjs` (Phase 36 will invoke it from CI orchestrator)
```javascript
if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  process.stderr.write('[promote-from-quarantine] promotion is local-only; refusing to run in CI\n');
  process.exit(1);
}
```

### WR-05 path-bounding (input path safety)
**Source:** `scripts/e2e-triage-classifier.mjs` lines 181-190
**Apply to:** `scripts/quarantine-append.mjs` (`--input` must be under tests/e2e/artifacts/ or tests/e2e/fixtures/)

### Fenced code block wrapping of LLM-derived text (markdown injection defense)
**Source:** `scripts/e2e-report-issue.mjs` lines 159-160, 178-180 (T-29-02-2)
**Apply to:** `tests/e2e/lib/issue-payload-builder.js` for `triageFinding.rationale` AND `verifier_verdict.reason`
```javascript
// In the body string:
'```',
reason,  // or rationale, after truncate()
'```',
```

### Dynamic-import-of-ES-module (read-modify-write JS corpus)
**Source:** `scripts/update-golden.js` lines 33-34
**Apply to:** `scripts/quarantine-append.mjs`, `scripts/promote-from-quarantine.mjs`
```javascript
// Simple (one-shot):
const { TEST_CASES_QUARANTINE } = await import('../tests/e2e/test-cases-quarantine.js');
// Cache-busted (re-read after write, e.g., in tests):
const url = `${pathToFileURL(CORPUS_PATH).href}?t=${Date.now()}`;
const { TEST_CASES_QUARANTINE } = await import(url);
```

### tmpDir test isolation (mkdtempSync + cpSync + afterEach rmSync)
**Source:** `tests/e2e/scripts/e2e-rerun-validator.test.js` lines 76-90, 113-120
**Apply to:** `tests/unit/quarantine-append.test.js`, `tests/unit/promote-from-quarantine.test.js`, `tests/e2e/scripts/e2e-report-issue-triage.test.js`
```javascript
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-<scope>-'));
  fs.cpSync(srcPath, path.join(tmpDir, 'file.js'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

### WR-07 stderr-absence assertion (positive-case CLI test)
**Source:** `tests/e2e/scripts/e2e-rerun-validator.test.js` lines 92-102
**Apply to:** `tests/e2e/scripts/e2e-report-issue-triage.test.js`
```javascript
// Stronger than `status !== 2`: asserts the flag value was ACCEPTED, not silently rerouted.
expect(stderrText).not.toMatch(/equals syntax not supported for --<flag>/i);
expect(stderrText).not.toMatch(/missing value for --<flag>/i);
```

### gh CLI label-create one-shot (Plan-0 setup task)
**Source:** None in repo — Phase 29 created `e2e-nightly` manually outside any committed script (per RESEARCH Pitfall 7).
**Apply to:** Plan 00 setup wave — pre-flight `gh label create` for both new labels:
```bash
gh label create triage --color 6F42C1 \
  --description "Filed by --source triage path (Phase 35)" --force
gh label create quarantine:ready-for-promotion --color FFA500 \
  --description "Quarantine entry stable across ≥3 nightly runs — eligible for human promotion to golden corpus" --force
```
`--force` makes both commands idempotent. Document as Plan-0 step.

---

## No Analog Found

All 11 files have at least a role-match analog. No purely-novel patterns required.

---

## Notes for the Planner

1. **Plan ordering (per RESEARCH primary recommendation):** (1) `update-golden.js --case` extension FIRST (it's a prerequisite for `promote-from-quarantine.mjs`); (2) `issue-payload-builder.js` (pure, isolated); (3) `e2e-report-issue.mjs` `--source triage` extension + dual-search; (4) `test-cases-quarantine.js` seed + schema-guard; (5) `quarantine-append.mjs`; (6) `promote-from-quarantine.mjs`. Tests can be co-developed with each.
2. **Plan-0 prerequisite:** GitHub label creation (`gh label create triage` + `gh label create quarantine:ready-for-promotion`) — see Shared Patterns §"gh CLI label-create one-shot". Document as a HUMAN step at phase start.
3. **Cross-script reuse:** `sanitizeCaseId` is reused by 3 new/extended scripts. The cleanest path is to export it from `scripts/e2e-report-issue.mjs` (it already is — line 83) and import via relative path. No need to extract to a shared util.
4. **`atomicWriteJson` reuse:** D-16 explicitly forbids a 4th inline copy. Import from `tests/e2e/lib/rerun-validator.js` (already exported at line 111).
5. **Open Question 2 (regex-insert into `tests/test-cases.js`):** Implement `appendToGoldenCorpus` as a pure helper (file content string + entry → updated content string) so it's testable in isolation. Match `];\n` at end via regex; insert `,\n  <new entry>\n` before it. Add a Vitest test against a fixture copy of `test-cases.js` asserting (a) original entries unchanged, (b) new entry present at end, (c) section-divider comments untouched.
6. **Pitfall 6 (spawnSync CWD):** `promote-from-quarantine.mjs` MUST pass `cwd: PROJECT_ROOT` to spawnSync. Tests inject a mock spawnSync (preferred over actually running `update-golden.js` from a tmpDir clone).
7. **Pitfall 8 (HARNESS_ERROR filter):** The CONFIRMED predicate must explicitly exclude `category === 'HARNESS_ERROR'` AND `path_taken.endsWith('_parse_error')`. Pin via dedicated Vitest test.

## Metadata

**Analog search scope:** `scripts/`, `tests/e2e/lib/`, `tests/e2e/scripts/`, `tests/unit/`, `tests/test-cases.js`
**Files inspected (read for pattern extraction):**
- `scripts/e2e-report-issue.mjs` (lines 1-390 — entire file)
- `scripts/e2e-triage-classifier.mjs` (lines 1-263 — entire file)
- `scripts/e2e-rerun-validator.mjs` (lines 1-206 — entire file)
- `scripts/update-golden.js` (lines 1-70 — entire file)
- `tests/e2e/lib/triage-classifier.js` (lines 1-100)
- `tests/e2e/lib/rerun-validator.js` (lines 90-240)
- `tests/test-cases.js` (lines 1-60)
- `tests/unit/cache-version.test.js` (lines 1-80)
- `tests/unit/e2e-report-issue.test.js` (lines 1-150)
- `tests/e2e/scripts/e2e-rerun-validator.test.js` (lines 1-120)

**Pattern extraction date:** 2026-05-27

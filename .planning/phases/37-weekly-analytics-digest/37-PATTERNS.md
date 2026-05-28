# Phase 37: Weekly Analytics Digest - Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 5 (1 edit, 4 new)
**Analogs found:** 4 exact/role-match / 5 (1 net-new step with no analog — documented idiom)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/e2e/lib/llm-report.js` (EDIT — add `SUMMARY_KEYS`) | lib/contract | transform | self (`emptySummary()` lines 117-127, `classificationToSummaryKey()` 134-144) | exact (extract-from-existing) |
| `scripts/weekly-digest.mjs` (NEW) | script/CLI | request-response (gh read → aggregate → publish) | `scripts/quarantine-append.mjs` + `scripts/run-triage-pipeline.mjs` (shim) + `scripts/e2e-report-issue.mjs` (gh shellout) | role-match (composite) |
| `.github/workflows/e2e-weekly-digest.yml` (NEW) | config/workflow | event-driven (cron) + batch | `.github/workflows/e2e-nightly.yml` (cron/permissions/label-ensure) | role-match; commit-in-run step = NO ANALOG (see below) |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` (NEW) | test | request-response (mock-gh) | `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` (mock-gh+tmpDir) + `e2e-nightly-quarantine-yaml.test.js` (YAML-grep) | exact |
| `tests/e2e/fixtures/phase37-digest-issues.json` (NEW) | test fixture | — | `tests/e2e/fixtures/phase36-pipeline-llm-report.json` (shape only) | role-match |

## Pattern Assignments

### `tests/e2e/lib/llm-report.js` (lib/contract, transform) — EDIT

**Analog:** self (the contract is currently implicit in two functions).

**SUMMARY_KEYS is NET-NEW** — grep across `tests/e2e/` and `scripts/` returns ZERO existing references. The seven keys live ONLY inside `emptySummary()` and the switch in `classificationToSummaryKey()`. D-01's "single source of truth" = extract a frozen array and rebuild `emptySummary()` FROM it.

**Current `emptySummary()`** (lines 117-127) — the seven keys to extract:
```javascript
function emptySummary() {
  return {
    passed: 0,
    wrong_citation: 0,
    verifier_disagree: 0,
    llm_hallucinated_selection: 0,
    llm_api_error: 0,
    harness_error: 0,
    total_cost_usd: 0,
  };
}
```

**Target shape (D-01):** export the frozen array, then build `emptySummary()` from it so there is exactly one definition:
```javascript
export const SUMMARY_KEYS = Object.freeze([
  'passed', 'wrong_citation', 'verifier_disagree',
  'llm_hallucinated_selection', 'llm_api_error', 'harness_error',
  'total_cost_usd',
]);

function emptySummary() {
  return Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]));
}
```
Order MUST match the existing object literal (passed → total_cost_usd) so no downstream consumer's key ordering shifts. `classificationToSummaryKey()` (lines 134-144) stays as-is — it maps classification → key string and is the existing closed-enum guard; the extracted array must contain every value that switch can return PLUS `total_cost_usd`.

---

### `scripts/weekly-digest.mjs` (script/CLI, request-response) — NEW

Composite: copy the **module skeleton + injected-deps** from `quarantine-append.mjs`, the **isMain guard** from `run-triage-pipeline.mjs`, and the **gh shellout client** from `e2e-report-issue.mjs`.

**Imports + module-header pattern** — copy from `scripts/quarantine-append.mjs` lines 1-30:
```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { SUMMARY_KEYS } from '../tests/e2e/lib/llm-report.js';        // D-01 single source
import { readLedger, monthlyTotal, HARD_CAP_USD, LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js'; // D-15

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
```
Note the existing convention: `__dirname`/`PROJECT_ROOT` resolved at top; TEST-ONLY env overrides resolved with a guard comment ("never set in CI"). Mirror this for any override path.

**Injected-deps signature (D-13)** — copy from `quarantine-append.mjs` lines 119-123:
```javascript
export async function runDigest(opts = {}) {
  const ghClient = opts.ghClient ?? makeRealGhClient(repo);
  const now = opts.now ?? (() => new Date());
  const publishMode = opts.publishMode ?? process.env.DIGEST_PUBLISH_MODE ?? 'auto';
  // ... pure logic uses now() — never new Date() inline ...
}
```
The `now` injection is what makes the ISO-week + 7-day-window deterministic in tests (test pins `now: () => new Date('2026-05-25T00:00:00Z')`).

**gh issue read by label (D-03)** — copy the `makeRealGhClient` shape from `scripts/e2e-report-issue.mjs` lines 477-491:
```javascript
const raw = execSync(
  `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);
const parsed = JSON.parse(raw);
return Array.isArray(parsed) ? parsed : [];
```
Call ONCE per label (`e2e-nightly`, `e2e-quarantine`), then merge + dedup by `issue.number` (Pitfall 6). Each issue object carries `labels: [{name,...}]` and `created_at` (ISO-8601). Top-3 (D-16) tallies the `category` label name (first element of the `[category,'e2e-nightly','triage']` ordered array — see e2e-report-issue.mjs:504, marked [ASSUMED A2] in RESEARCH; planner confirms against a real filed issue).

**Issue-fallback publish (D-05, ACTIVE path)** — copy from `e2e-report-issue.mjs` lines 492-502:
```javascript
const escapedTitle = title.replaceAll('"', '\\"');               // shell-escape title (T-29-02-1)
const out = execSync(
  `gh issue create --title "${escapedTitle}" --label e2e-digest --body-file -`,
  { input: body, encoding: 'utf8' }                              // --body-file - = body via stdin, never interpolated
);
```

**Discussion publish (D-08, DORMANT path)** — NO repo analog; use the GraphQL idiom from RESEARCH §"Code Examples" lines 360-378 (two-step: resolve `repository.id`+`discussionCategories` by name, then `createDiscussion` mutation). Pass dynamic values via `-F`/`-f` variable bindings (`$r/$c/$t/$b`), NEVER string-concatenated into the query (security: GraphQL injection). [ASSUMED A3]: confirm `-F b=@-` stdin flag via `gh api --help` during planning.

**Cost-vs-cap (D-15)** — `monthlyTotal(ledger, month)` takes a ledger OBJECT (llm-ledger.js:157), and `readLedger()` swallows file-absence returning an empty ledger → `monthlyTotal` returns 0 indistinguishably from a real $0 month (Pitfall 2). Therefore:
```javascript
if (!fs.existsSync(LEDGER_PATH)) {
  costLine = 'cost data unavailable';            // D-15 graceful — NOT a throw
} else {
  const spent = monthlyTotal(readLedger());      // readLedger() FIRST, then monthlyTotal
  costLine = `$${spent.toFixed(2)} / $${HARD_CAP_USD} (${Math.round(spent / HARD_CAP_USD * 100)}%)`;
}
```
Do NOT set `E2E_LEDGER_PATH_OVERRIDE` anywhere — llm-ledger.js:85 THROWS if it is set under `CI`/`GITHUB_ACTIONS`.

**SUMMARY_KEYS validation (D-02)** — throw NAMING the missing key, never silent-zero:
```javascript
for (const k of SUMMARY_KEYS) {
  if (!(k in summary)) throw new Error(`weekly-digest: summary missing required SUMMARY_KEY '${k}'`);
}
```

**Markdown render + ≤50-line guard (D-04)** — build a line array, join, assert length:
```javascript
const lines = [ /* fixed key order — deterministic diffs */ ];
const md = lines.join('\n');
if (md.split('\n').length > 50) throw new Error(`weekly-digest: rendered ${md.split('\n').length} lines (>50)`);
```

**isMain guard (D-13 / WR-02)** — copy EXACTLY from `run-triage-pipeline.mjs` lines 220-230:
```javascript
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) { runDigest().catch((e) => { process.stderr.write(e.message + '\n'); process.exit(1); }); }
```

---

### `.github/workflows/e2e-weekly-digest.yml` (config/workflow, cron) — NEW

**Analog:** `.github/workflows/e2e-nightly.yml` for everything EXCEPT the commit-in-run step.

**Header + trigger (D-09)** — adapt from e2e-nightly.yml lines 16-40:
```yaml
name: E2E Weekly Digest
on:
  schedule:
    - cron: '0 7 * * 1'          # Monday 07:00 UTC (D-09)
  workflow_dispatch: {}
concurrency:
  group: e2e-weekly-digest
  cancel-in-progress: false
```

**Permissions (D-09 + SECURITY GAP — see below):**
```yaml
permissions:
  contents: write       # D-09 — commit-in-run
  discussions: write    # D-09 — dormant discussion path
  issues: write         # << MUST ADD — active issue-fallback create needs it
```

**Label self-bootstrap (D-07)** — copy the step from e2e-nightly.yml lines 97-105, swapping name/color:
```yaml
- name: Ensure e2e-digest label exists
  run: |
    gh label create "e2e-digest" \
      --color "<HEX>" \
      --description "Weekly analytics digest" \
      --force 2>/dev/null || true
  # 6-char hex, NO '#' prefix (gh CLI requirement). Color discretion: distinct
  # from 0075ca (e2e-nightly) and d93f0b (e2e-quarantine) — e.g. 5319e7.
```

**env-var hop for any workflow input (CWE-94)** — follow e2e-nightly.yml lines 110-124. Even though this workflow has fewer inputs, set `DIGEST_PUBLISH_MODE: issue` and `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in the step `env:` block; never interpolate `${{ inputs.* }}` directly into `run:`.

**Commit-in-run step (D-11) — NO REPO ANALOG.** No existing workflow does git add+commit+push (`actions/checkout@v4` is used everywhere but only for read). Use the GitHub-standard idiom documented in RESEARCH Pitfall 3 (lines 328-337):
```yaml
- name: Commit weekly digest
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add reports/weekly-digest-*.md
    git diff --cached --quiet || git commit -m "docs(weekly-digest): ${{ env.WEEK_LABEL }} [skip ci]"
    git push
```
`actions/checkout@v4` default `persist-credentials: true` lets `GITHUB_TOKEN` push under `contents: write` (no PAT). `git diff --cached --quiet || git commit` = idempotent no-op when unchanged (D-11). `[skip ci]` prevents the bot push from re-triggering `ci.yml`.

---

### `tests/e2e/scripts/e2e-weekly-digest.test.js` (test, mock-gh) — NEW

**Analog:** `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` (mock-gh + tmpDir) and `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` (YAML-grep).

**mock-gh bash shim** — copy from `e2e-run-triage-pipeline.test.js` lines 71-89, extending the `case` to branch on the gh subcommand AND the `api` target:
```javascript
const mockGhBody = [
  '#!/usr/bin/env bash',
  'echo "$@" >> "' + transcriptPath + '"',          // transcript = branch-dispatch assertions
  'case "$1" in',
  '  api)',
  '    case "$2" in',
  '      graphql) echo \'{"data":{"repository":{"id":"R_1","discussionCategories":{"nodes":[{"id":"C_1","name":"General"}]},"createDiscussion":{"discussion":{"url":"https://github.com/test/test/discussions/1"}}}}}\' ;;',
  '      repos/*/issues) cat "' + fixturePath + '" ;;',   // return fixture issue array
  '      repos/*) echo "false" ;;',                       // has_discussions probe (auto mode)
  '    esac ;;',
  '  issue) [ "$2" = create ] && echo "https://github.com/test/test/issues/1" ;;',
  '  label) echo "label" ;;',
  '  --version) echo "gh version 2.83.1 (mock)" ;;',
  'esac',
].join('\n') + '\n';
fs.writeFileSync(mockGhPath, mockGhBody, { mode: 0o755 });
```
Branch on `$2` content (the shim distinguishes `repos/{repo}/issues` from `repos/{repo}` from `graphql`) — RESEARCH §Validation lines 479. Put on `PATH` via `mockGhDir + ':' + process.env.PATH` (spawn helper, e2e-run-triage-pipeline.test.js lines 108-114). tmpDir via `fs.mkdtempSync(path.join(os.tmpdir(), 'pct-digest-mockgh-'))`; cleanup in `afterEach` with `fs.rmSync(dir, { recursive: true, force: true })`.

**Test isolation env (D-08/D-14):** spawn with `GITHUB_REPOSITORY: 'test/test'`, and for "both publish branches" run twice with `DIGEST_PUBLISH_MODE: 'issue'` then `'discussion'`, asserting the transcript contains `issue create` resp. `graphql ... createDiscussion`. Pin `now: () => new Date('2026-05-25T00:00:00Z')` (only available if the test imports `runDigest` directly rather than spawning; for the deterministic-window/ISO-week assertions, prefer the direct `import { runDigest } from '...weekly-digest.mjs'` path so `now` is injectable).

**SUMMARY_KEYS export test:** `import { SUMMARY_KEYS } from '../lib/llm-report.js'` → assert `Object.isFrozen(SUMMARY_KEYS)`, `.length === 7`, and that `emptySummary()`'s keys deep-equal `SUMMARY_KEYS` (single-source proof, D-14).

**YAML-grep block** — copy the harness from `e2e-nightly-quarantine-yaml.test.js` lines 20-48: `fs.readFileSync(YAML_PATH, 'utf8')` in `beforeAll`, then `expect(yaml).toContain(...)` / `yaml.split(expr).length - 1` count assertions. Targets for Phase 37: `cron: '0 7 * * 1'`, `contents: write`, `discussions: write`, `issues: write`, `gh label create "e2e-digest"`, `git push`, `[skip ci]`. Resolve path via `path.resolve(__dirname, '../../..', '.github/workflows/e2e-weekly-digest.yml')`.

---

### `tests/e2e/fixtures/phase37-digest-issues.json` (test fixture) — NEW

No exact analog (existing fixtures are llm-report shapes). Model on a real `gh api issues` payload: a JSON array where each element has `number`, `title`, `created_at` (ISO-8601), and `labels: [{name}]`. Include: a mix of `e2e-nightly`/`e2e-quarantine` labels, varied `category` labels (for top-3 tally + alphabetical-tie test, D-16), varied `created_at` (in/out of the 7-day window pinned at `2026-05-25`), and ≥1 dual-labeled issue (dedup test, Pitfall 6).

## Shared Patterns

### gh shellout client (injected `ghClient`)
**Source:** `scripts/e2e-report-issue.mjs` lines 477-517 (`makeRealGhClient`)
**Apply to:** `weekly-digest.mjs` (read + publish). Always `execSync` with `{ encoding: 'utf8' }`, body via `--body-file -`/`input:` stdin, title via `.replaceAll('"','\\"')`, GraphQL dynamic values via `-F`/`-f` bindings.

### Injected-deps + isMain CLI shim
**Source:** `scripts/quarantine-append.mjs` lines 119-123 (`now`/`ghClient` opts) + `scripts/run-triage-pipeline.mjs` lines 220-230 (WR-02 isMain)
**Apply to:** `weekly-digest.mjs`. `const now = opts.now ?? (() => new Date())`; never call `new Date()` inline in pure logic.

### mock-gh bash shim + tmpDir
**Source:** `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` lines 71-114
**Apply to:** `e2e-weekly-digest.test.js`. Transcript-logging shim on `PATH`, branch on `$1`/`$2`, tmpDir mkdtemp + afterEach rmSync.

### Label self-bootstrap
**Source:** `.github/workflows/e2e-nightly.yml` lines 97-105
**Apply to:** `e2e-weekly-digest.yml`. `gh label create --color <6hex-no-#> --force 2>/dev/null || true`.

### Lint allowlist (Pitfall 5 — CONFIRMED)
**Source:** `package.json` line 19 — the `lint` script enumerates each script file EXPLICITLY (currently ends at `run-triage-pipeline.mjs`; `weekly-digest.mjs` is NOT present).
**Apply to:** Adding `scripts/weekly-digest.mjs` requires appending it to the `lint` script's file list, or it ships un-linted. Also add `"e2e:weekly-digest": "node scripts/weekly-digest.mjs"` to scripts.

## No Analog Found

| File / Step | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| commit-in-run step in `e2e-weekly-digest.yml` | workflow step | batch (git push) | No existing workflow does git add+commit+push (checkout is read-only everywhere) | GitHub-standard idiom in RESEARCH Pitfall 3 (lines 328-337) |
| GraphQL `createDiscussion` block in `weekly-digest.mjs` | gh shellout | request-response | Dormant path; no repo code calls `gh api graphql` | RESEARCH §Code Examples lines 360-378; verified only via mock-gh test (D-08) |

## Flagged Issues for Planner

1. **SECURITY — `issues: write` permission gap (CONFIRMED from RESEARCH §Security line 494-498).** D-09 locked ONLY `contents: write` + `discussions: write`. But the ACTIVE publish path is `gh issue create` (D-05), which REQUIRES `issues: write` or it fails with 403. The planner MUST add `issues: write` to the workflow `permissions:` block. D-09 omitted it because the requirement text framed the dormant discussion path as primary.

2. **`SUMMARY_KEYS` is net-new (CONFIRMED, A1).** Zero existing references across `tests/e2e/` and `scripts/`. The contract lives implicitly in `emptySummary()` (llm-report.js:117-127). Extract → frozen array → rebuild `emptySummary()` from it (single-source, D-01).

3. **Ledger 0-vs-absent (Pitfall 2).** `monthlyTotal(ledger, month)` takes a ledger object (llm-ledger.js:157) and `readLedger()` returns an empty ledger on file-absence → 0 indistinguishable from real $0. Must `fs.existsSync(LEDGER_PATH)` BEFORE reading to render `cost data unavailable` (D-15). Do NOT set `E2E_LEDGER_PATH_OVERRIDE` (throws in CI, llm-ledger.js:85).

4. **Lint allowlist (Pitfall 5, CONFIRMED).** package.json:19 enumerates linted scripts explicitly; new `weekly-digest.mjs` must be appended or it ships un-linted.

5. **Top-3 category source [ASSUMED A2].** Category/errorClass derives from the issue label `name` (first of `[category,'e2e-nightly','triage']`, e2e-report-issue.mjs:504). Planner should confirm against a real filed issue's labels.

## Metadata

**Analog search scope:** `scripts/`, `tests/e2e/scripts/`, `tests/e2e/lib/`, `.github/workflows/`, `tests/e2e/fixtures/`, `package.json`
**Files scanned:** 7 analogs read (llm-report.js, quarantine-append.mjs, run-triage-pipeline.mjs, e2e-report-issue.mjs, llm-ledger.js, e2e-nightly.yml, e2e-run-triage-pipeline.test.js, e2e-nightly-quarantine-yaml.test.js)
**Pattern extraction date:** 2026-05-28

# Phase 11: Triage Layer - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/ingest-reports.mjs` | CLI entry-point (controller) | request-response + CRUD | `scripts/review-reports.mjs` | exact |
| `scripts/report-classifier.mjs` | utility (pure heuristic) | transform | `scripts/review-reports.mjs` pure-fn block (lines 37–132) | role-match |
| `scripts/gh-client.mjs` | service (gh I/O) | request-response | `scripts/e2e-report-issue.mjs` `makeRealGhClient` (lines 478–554) | exact |
| `scripts/review-reports.mjs` (MODIFIED) | utility (I/O export) | CRUD | self | exact |
| `scripts/e2e-report-issue.mjs` (MODIFIED) | CLI | request-response | self | exact |
| `tests/unit/report-classifier.test.js` | test | transform | `tests/unit/review-reports.test.js` + `tests/unit/report-payload-builder.test.js` | role-match |
| `tests/unit/ingest-reports.test.js` | test | request-response | `tests/unit/e2e-report-issue.test.js` | role-match |
| `tests/unit/gh-client.test.js` | test | request-response | `tests/unit/e2e-report-issue.test.js` | exact |
| `tests/unit/ingest-reports-wrangler-guard.test.js` | test (static-grep) | — | `tests/unit/eslint-sdk-guard.test.js` | exact |
| `tests/unit/v61-ingest-reports-yaml.test.js` | test (static-grep) | — | `tests/unit/eslint-sdk-guard.test.js` | exact |
| `.github/workflows/v61-ingest-reports.yml` | config (CI) | event-driven | `.github/workflows/e2e-ingest-llm-report.yml` | role-match |

---

## Pattern Assignments

---

### `scripts/ingest-reports.mjs` (CLI entry-point, request-response + CRUD)

**Analog:** `scripts/review-reports.mjs`

**Imports pattern** (lines 26–34 of analog):
```javascript
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Plus imports from peer scripts:
import {
  getNamespaceId, filterReports, sortReports, reviewStatus,
  loadReports, writeStatus,
} from './review-reports.mjs';
import { classifyReport, RULE_NAMES } from './report-classifier.mjs';
import { makeKvReportGhClient } from './gh-client.mjs';
```

**CLI guard / main-only execution pattern** (lines 231–238 of analog — the exact guard to copy):
```javascript
// scripts/review-reports.mjs lines 231-238
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}
```
`ingest-reports.mjs` MUST use this identical pattern (not the `import.meta.url === \`file://${process.argv[1]}\`` form used in `e2e-report-issue.mjs` line 688 — use `fileURLToPath` for consistency with `review-reports.mjs`).

**parseArgs pattern** (lines 111–132 of analog):
```javascript
// scripts/review-reports.mjs lines 111-132
export function parseArgs(argv) {
  const out = { command: 'list', positionals: [], filters: {}, json: false, help: false, namespaceId: null };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) out.command = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    switch (a) {
      case '-h': case '--help': out.help = true; break;
      case '--json': out.json = true; break;
      // ... flags
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
        out.positionals.push(a);
    }
  }
  return out;
}
```
`ingest-reports.mjs` must parse: `list` (default), `promote <fp> <ts>` subcommand, plus optional flags: `--namespace-id`, `--json`, `--dry-run`, `--force` (for promote bypass of status check, per D-06), `--max-fixes <n>`, `-h/--help`.

**KV load + filter pattern** (lines 192–218 of analog — `main()` body):
```javascript
// scripts/review-reports.mjs lines 192-228 (main body)
const nsId = args.namespaceId || getNamespaceId(readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8'));
const filtered = filterReports(loadReports(nsId), args.filters);
```
For `ingest-reports.mjs`, the default filter is `{ status: 'open' }`. The `promote` subcommand fetches a single record by `getRecord(nsId, \`report:${fp}:${ts}\`)` and bypasses the `status === 'open'` filter entirely (D-06 manual promote bypass).

**`WORKER_DIR` derivation** (lines 32–33 of analog — copy verbatim):
```javascript
// scripts/review-reports.mjs lines 32-33
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = join(HERE, '..', 'worker');
```
`ingest-reports.mjs` does NOT need this — it delegates all KV I/O to exported functions from `review-reports.mjs`, which already have `WORKER_DIR` computed from their own `import.meta.url`. Never copy the `wrangler()` helper into `ingest-reports.mjs`.

**D-05 ordering for promotion** (per RESEARCH.md Pattern, enforced sequence):
```javascript
// In ingest-reports.mjs promote() function — order is load-bearing
async function promoteRecord(nsId, fp, ts, promotionSource, ghClient, artifactEntries) {
  const key = `report:${fp}:${ts}`;
  const record = getRecord(nsId, key);                          // 1. fetch record
  const kvKey = `report:${record.fingerprint}:${record.timestamp}`;  // canonical key
  const existing = await ghClient.findExistingIssueByKvKey(kvKey);  // 2. GitHub FIRST (D-05)
  if (existing) {
    // Issue already exists — skip creation, attempt KV write (self-heal path)
    writeStatus(nsId, fp, ts, 'triaged');                       // 3. KV write (re-attempt)
    return { /* artifact entry, promotion_decision: 'skip-dedup' */ };
  }
  const title = buildReportIssueTitle(record);
  const body = buildReportIssueBody(record, { classification, kvKey, goldenPatents, quarantinePatents });
  const issue = ghClient.createIssueWithLabels(title, body, ['report-fix-candidate']); // 4. create
  writeStatus(nsId, fp, ts, 'triaged');                         // 5. KV write AFTER issue (D-05)
  return { /* artifact entry with github_issue_number */ };
}
```

**Triage-report artifact write** (adapted from D-11):
```javascript
// Local CLI: write to .triage-reports/ (gitignored)
import { mkdirSync, writeFileSync } from 'node:fs';
const TRIAGE_REPORTS_DIR = join(HERE, '..', '.triage-reports');
mkdirSync(TRIAGE_REPORTS_DIR, { recursive: true });
const outPath = join(TRIAGE_REPORTS_DIR, `triage-report-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(artifactEntries, null, 2));
// CI: write to fixed path for actions/upload-artifact
// if (process.env.CI) outPath = join(HERE, '..', '.triage-reports', 'triage-report.json');
```

---

### `scripts/report-classifier.mjs` (pure utility, transform)

**Analog:** `scripts/review-reports.mjs` pure exported function block (lines 37–132)

**Module structure — pure, zero I/O, named rule exports:**
```javascript
// scripts/review-reports.mjs lines 37-38 (pattern: comment block divides pure from I/O)
// ───────────────────────── pure helpers (exported for tests) ─────────────────────────

// Adapt for report-classifier.mjs:
export const RULE_INFRASTRUCTURE  = 'RULE_INFRASTRUCTURE';
export const RULE_PDF_ERROR        = 'RULE_PDF_ERROR';
export const RULE_REAL_BUG_GREEN   = 'RULE_REAL_BUG_GREEN';
export const RULE_REAL_BUG_DUPS    = 'RULE_REAL_BUG_DUPS';
export const RULE_QUARANTINE_HIT   = 'RULE_QUARANTINE_HIT';
export const RULE_DUPLICATE        = 'RULE_DUPLICATE';
export const RULE_NO_MATCH_NOISE   = 'RULE_NO_MATCH_NOISE';
export const RULE_AMBIGUOUS        = 'RULE_AMBIGUOUS';

// NOTE: v1 heuristics EMIT {real_bug, noise, duplicate, infrastructure, ambiguous}.
// `user_error` stays in the enum but is reserved for the PROMO-02 manual-promote
// path and v2 LTRI-01 (REQUIREMENTS.md L90 defers heuristic/LLM user_error to v2).
// classifyReport NEVER returns 'user_error' from a heuristic rule in v1.
export const CLASSIFICATIONS = ['real_bug', 'noise', 'duplicate', 'user_error', 'infrastructure', 'ambiguous'];
```

**`classifyReport` signature** (RESEARCH.md Pattern 3):
```javascript
// Zero I/O — pure function over KV-record fields.
// goldenPatents and quarantinePatents are Sets of patent number strings.
export function classifyReport(record, { goldenPatents = new Set(), quarantinePatents = new Set(), dupThreshold = 3 } = {}) {
  const { category, confidenceTier, pdfParseStatus, errorLog, duplicate_count, patentNumber } = record;
  const dups = duplicate_count ?? 0;

  // Rules applied in PRIORITY ORDER (first match wins):
  if (category === 'tool_not_working')
    return result('infrastructure', RULE_INFRASTRUCTURE, 'category:tool_not_working — Worker route failure, not a matching-core bug');
  if (pdfParseStatus === 'error')
    return result('infrastructure', RULE_PDF_ERROR, 'pdfParseStatus:error — PDF parse failure, not a citation mismatch');
  if (category === 'inaccurate_citation' && confidenceTier === 'green')
    return result('real_bug', RULE_REAL_BUG_GREEN, 'confidenceTier:green + category:inaccurate_citation — high-confidence real bug signal');
  if (dups >= dupThreshold)
    return result('real_bug', RULE_REAL_BUG_DUPS, `duplicate_count:${dups} >= threshold:${dupThreshold} — high-frequency report`);
  if (quarantinePatents.has(patentNumber))
    return result('real_bug', RULE_QUARANTINE_HIT, 'patent in quarantine corpus — known problematic selection');
  // Sub-threshold repeat (0 < dups < dupThreshold) — tracked as duplicate, NEVER noise
  // (REQUIREMENTS.md L107: high duplicate_count is a real-bug signal, not weaker).
  // MUST come AFTER RULE_REAL_BUG_DUPS so an at/above-threshold dup auto-promotes first.
  if (dups > 0)
    return result('duplicate', RULE_DUPLICATE, `duplicate_count:${dups} below threshold:${dupThreshold} — tracked repeat report, not yet auto-promote`);
  if (category === 'no_match' && !(errorLog?.length))
    return result('noise', RULE_NO_MATCH_NOISE, 'category:no_match with no errorLog — likely no PDF available');
  return result('ambiguous', RULE_AMBIGUOUS, 'no heuristic rule matched — requires manual review');
}

function result(classification, ruleName, rationale) {
  return { classification, ruleName, rationale };
}
```

**Corpus loading** (pure file reads at module load — RESEARCH.md Pattern, Corpus Cross-Check):
```javascript
// Load once at module load time (pure; no I/O after initialization)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// tests/golden/baseline.json — 76 keys like 'US11427642-spec-short-1'
const baseline = require(join(HERE, '..', 'tests/golden/baseline.json'));
export const GOLDEN_PATENTS = new Set(
  Object.keys(baseline).map(id => id.split('-')[0]).filter(Boolean)
);

// tests/e2e/test-cases-quarantine.js — exports TEST_CASES_QUARANTINE
// (2 cases; case id format matches golden pattern: 'US{number}-...')
import { TEST_CASES_QUARANTINE } from '../tests/e2e/test-cases-quarantine.js';
export const QUARANTINE_PATENTS = new Set(
  TEST_CASES_QUARANTINE.map(c => c.id.split('-')[0]).filter(Boolean)
);
```

Note: `id.split('-')[0]` is the safe extraction for `US11427642-spec-short-1` → `US11427642`. The RESEARCH.md A1 assumption used a regex; the split approach is simpler and correct for all known baseline key formats (verified: baseline key format is `US{number}-{suffix}`).

**Env-configurable thresholds** (following `MAX_FIXES_PER_RUN` convention):
```javascript
// scripts/review-reports.mjs uses TTL_90_DAYS = 7776000 as a module constant.
// ingest-reports.mjs + report-classifier.mjs follow the same convention:
export const DUP_THRESHOLD = parseInt(process.env.DUP_THRESHOLD ?? '3', 10);
export const POST_FIX_SUPPRESS_DAYS = parseInt(process.env.POST_FIX_SUPPRESS_DAYS ?? '30', 10);
// COST-02 / REQUIREMENTS.md L12 + L68: per-run analysis cap default is 5 (NOT 10).
export const MAX_FIXES_PER_RUN = parseInt(process.env.MAX_FIXES_PER_RUN ?? '5', 10);
```

---

### `scripts/gh-client.mjs` (service, request-response)

**Analog:** `scripts/e2e-report-issue.mjs` `makeRealGhClient` (lines 478–554)

**Functions to LIFT verbatim from analog** (lines 506–553):
```javascript
// scripts/e2e-report-issue.mjs lines 507-517 — createIssueWithLabels (lift verbatim)
createIssueWithLabels(title, body, labels) {
  const escapedTitle = title.replaceAll('"', '\\"');
  const labelArgs = labels
    .map(l => `--label "${l.replaceAll('"', '\\"')}"`)
    .join(' ');
  const out = execSync(
    `gh issue create --title "${escapedTitle}" ${labelArgs} --body-file -`,
    { input: body, encoding: 'utf8' }
  );
  const m = out.match(/\/issues\/(\d+)/);
  return { number: m ? parseInt(m[1], 10) : null };
},
```

```javascript
// scripts/e2e-report-issue.mjs lines 522-535 — listOpenWithSearch (lift verbatim; rename private)
listWithSearch(query, state = 'open') {
  try {
    const escaped = query.replaceAll("'", "'\\''");
    const raw = execSync(
      `gh issue list --search '${escaped}' --state ${state} --json number,title,body,state --limit 30`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[gh-client] listWithSearch failed:', err.message);
    return [];
  }
},
```

```javascript
// scripts/e2e-report-issue.mjs lines 537-541 — addLabel (lift verbatim)
addLabel(issueNumber, label) {
  execSync(
    `gh issue edit ${issueNumber} --add-label "${label.replaceAll('"', '\\"')}"`,
    { encoding: 'utf8' }
  );
},
```

**New `findExistingIssueByKvKey` function** (not in analog — Phase 11 new, based on `findMatchingIssue` at lines 294–298):
```javascript
// Retargets the hidden-comment dedup marker from:
//   <!-- fingerprint: ${fp} -->   (legacy e2e-report-issue.mjs pattern, lines 266-267)
// to:
//   <!-- kv-key: report:{fp}:{ts} -->   (Phase 11 new convention, D-04)
//
// Uses two separate gh calls for --state open and --state closed (RESEARCH.md
// Open Question 1 recommendation — avoid --state all + --label quirks).
findExistingIssueByKvKey(kvKey) {
  const marker = `<!-- kv-key: ${kvKey} -->`;
  const open   = this.listWithSearch(kvKey, 'open');
  const closed = this.listWithSearch(kvKey, 'closed');
  const all = [...open, ...closed];
  return all.find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
},
```

**Pure date-cutoff helper** (NEW — TRI-06 correctness core, exported standalone so it is unit-testable with injected `now` and no live gh):
```javascript
// Returns true iff isoTimestamp is within `suppressDays` of `now`.
// An OLD entry (older than suppressDays) → false → NOT suppressed (fresh signal, D-08).
export function isWithinCutoff(isoTimestamp, suppressDays, now = Date.now()) {
  if (!isoTimestamp) return false;
  const cutoffMs = now - suppressDays * 86400000;
  return Date.parse(isoTimestamp) >= cutoffMs;
}
```

**Post-fix suppression queries** (new in Phase 11, pattern from `listOpenWithSearch` in analog — both date checks delegate to `isWithinCutoff`):
```javascript
// gh pr list + gh issue list for isPostFixSuppressed() — both in gh-client.mjs
isPostFixSuppressed(patentNumber, suppressDays = POST_FIX_SUPPRESS_DAYS) {
  const escaped = patentNumber.replaceAll("'", "'\\''");  // same escape as listOpenWithSearch

  // Query 1: merged auto-fix/* PRs referencing patentNumber
  try {
    const raw = execSync(
      `gh pr list --state merged --search '${escaped} in:body' ` +
      `--json number,mergedAt,headRefName --limit 20`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const prs = JSON.parse(raw);
    const hit = (Array.isArray(prs) ? prs : []).find(
      pr => pr.headRefName?.startsWith('auto-fix/') && isWithinCutoff(pr.mergedAt, suppressDays)
    );
    if (hit) return true;
  } catch { /* transient gh failure → not suppressed */ }

  // Query 2: closed report-fix-candidate Issues for patentNumber
  try {
    const raw = execSync(
      `gh issue list --label report-fix-candidate --state closed ` +
      `--search '${escaped} in:body' --json number,closedAt --limit 20`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const issues = JSON.parse(raw);
    return (Array.isArray(issues) ? issues : []).some(i => isWithinCutoff(i.closedAt, suppressDays));
  } catch { return false; }
},
```

**Module export shape** (factory function, matching analog `makeRealGhClient` at line 478):
```javascript
import { execSync } from 'node:child_process';

export function isWithinCutoff(isoTimestamp, suppressDays, now = Date.now()) { ... }

export function makeKvReportGhClient(repo) {
  return {
    findExistingIssueByKvKey(kvKey)  { ... },
    createIssueWithLabels(title, body, labels) { ... },
    isPostFixSuppressed(patentNumber, suppressDays) { ... },
    listWithSearch(query, state)  { ... },   // private helper
  };
}
```

**CLI guard: NONE.** `gh-client.mjs` is a pure library module — no `if (isMain)` block. The analog `e2e-report-issue.mjs` lines 688–806 show the CLI block is separate from `makeRealGhClient`.

---

### `scripts/review-reports.mjs` (MODIFIED — additive export of I/O fns)

**Analog:** self

**What changes:** Add `export` keyword to four currently module-private functions (lines 148–179) and export `REVIEW_STATES` constant (line 34). Zero behavior change.

**Functions to export** (current lines in the file — add `export` keyword only):

```javascript
// scripts/review-reports.mjs line 148 — currently: function listReportKeys(nsId)
export function listReportKeys(nsId) {
  const keys = parseWranglerJson(wrangler(['kv', 'key', 'list', '--remote', `--namespace-id=${nsId}`]), '[');
  return keys.filter((k) => k.name.startsWith('report:'));
}

// scripts/review-reports.mjs line 152 — currently: function getRecord(nsId, name)
export function getRecord(nsId, name) {
  return parseWranglerJson(wrangler(['kv', 'key', 'get', '--remote', `--namespace-id=${nsId}`, name]), '{');
}

// scripts/review-reports.mjs line 157 — currently: function loadReports(nsId)
export function loadReports(nsId) { ... }

// scripts/review-reports.mjs line 165 — currently: function writeStatus(nsId, fp, ts, state)
export function writeStatus(nsId, fp, ts, state) { ... }

// scripts/review-reports.mjs line 34 — currently: const REVIEW_STATES = [...]
export const REVIEW_STATES = ['open', 'reviewed', 'triaged', 'resolved', 'wontfix'];
```

**TTL-preserving write-back pattern** (lines 165–179 — critical for ING-04, copy as-is):
```javascript
// scripts/review-reports.mjs lines 165-179
function writeStatus(nsId, fp, ts, state) {
  const key = `report:${fp}:${ts}`;
  const keyMeta = listReportKeys(nsId).find((k) => k.name === key);
  if (!keyMeta) throw new Error(`Record not found: ${key}`);
  const rec = getRecord(nsId, key);
  rec._review = { status: state, at: new Date().toISOString() };
  const tmp = join(mkdtempSync(join(tmpdir(), 'pct-report-')), 'value.json');
  writeFileSync(tmp, JSON.stringify(rec));
  const ttlArgs = keyMeta.expiration
    ? [`--expiration=${keyMeta.expiration}`]            // preserve original 90-day expiry
    : [`--ttl=${TTL_90_DAYS}`];
  wrangler(['kv', 'key', 'put', '--remote', `--namespace-id=${nsId}`, key, '--path', tmp, ...ttlArgs]);
  return rec;
}
```

**`_review` write-back shape** (`{ status, at }` — D-06):
The write-back sets `rec._review = { status: state, at: new Date().toISOString() }`. Phase 11 maps: promoted → `'triaged'`, skipped → `'wontfix'`. The weekly-digest script reads `_review.status` via `reviewStatus(record)` (line 56–58 of `review-reports.mjs`) — no digest changes required for this mapping.

---

### `scripts/e2e-report-issue.mjs` (MODIFIED — import from extracted gh-client.mjs)

**Analog:** self

**What changes:** After `gh-client.mjs` is extracted, `e2e-report-issue.mjs` replaces its inline `makeRealGhClient` body with an import from `./gh-client.mjs`. The exported API surface of `e2e-report-issue.mjs` does NOT change. The existing `tests/unit/e2e-report-issue.test.js` imports `makeRealGhClient` from `e2e-report-issue.mjs` — this import must still work (re-export `makeRealGhClient` from `e2e-report-issue.mjs` after moving it).

**Re-export pattern:**
```javascript
// scripts/e2e-report-issue.mjs — after extraction
export { makeRealGhClient } from './gh-client.mjs';
// OR keep a thin wrapper that adds the NIGHTLY_LABEL default:
export function makeRealGhClient(repo, label = NIGHTLY_LABEL) {
  return makeKvReportGhClient(repo, label);  // delegates to gh-client.mjs
}
```

---

### `tests/unit/report-classifier.test.js` (test, transform)

**Analog:** `tests/unit/review-reports.test.js` (structure) + `tests/unit/report-payload-builder.test.js` (buildReportPayload pattern)

**Import pattern** (from `review-reports.test.js` lines 1–16):
```javascript
// tests/unit/review-reports.test.js lines 7-16
import { describe, it, expect } from 'vitest';
import {
  getNamespaceId, parseSince, reviewStatus, filterReports, sortReports, formatDigest, parseArgs,
} from '../../scripts/review-reports.mjs';
```

Adapt for `report-classifier.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import {
  classifyReport,
  RULE_INFRASTRUCTURE, RULE_PDF_ERROR, RULE_REAL_BUG_GREEN,
  RULE_REAL_BUG_DUPS, RULE_QUARANTINE_HIT, RULE_DUPLICATE,
  RULE_NO_MATCH_NOISE, RULE_AMBIGUOUS,
  GOLDEN_PATENTS, QUARANTINE_PATENTS,
} from '../../scripts/report-classifier.mjs';
```

**Test fixture factory pattern** (from `review-reports.test.js` lines 29–32):
```javascript
// tests/unit/review-reports.test.js lines 29-32
const rec = (over = {}) => ({
  fingerprint: 'aaaaaaaaaaaaaaaa', timestamp: NOW, category: 'no_match',
  patentNumber: '10617174B1', duplicate_count: 0, note: '', ...over,
});
```

Adapt for `report-classifier.test.js` — CRITICAL: include server-side fields (`duplicate_count`, `fingerprint`, `timestamp`) in the spread, not just `buildReportPayload()` output (RESEARCH.md Pitfall 1):
```javascript
// Base context for buildReportPayload
const BASE_CONTEXT = {
  patentNumber: 'US11427642',
  confidenceTier: 'green',
  returnedCitation: '2:15',
  extensionVersion: '5.0.0',
  pdfParseStatus: 'ok',
};

// Factory: build a full KV record (builder output + server-side fields)
const kvRecord = (overContext = {}, overRecord = {}) => {
  const payload = buildReportPayload({
    context: { ...BASE_CONTEXT, ...overContext },
    category: overContext.category ?? 'inaccurate_citation',
    includeSelectionText: false,
  });
  return {
    ...payload,
    fingerprint: 'aabbccddee11',    // server-side
    timestamp: 1718500000000,        // server-side
    duplicate_count: 0,              // server-side
    ...overRecord,
  };
};
```

**Named-rule test pattern** (TRI-02 — one `it` per rule, including RULE_DUPLICATE):
```javascript
describe('RULE_REAL_BUG_GREEN', () => {
  it('inaccurate_citation + green → real_bug', () => {
    const record = kvRecord({ confidenceTier: 'green' }, { category: 'inaccurate_citation' });
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_GREEN);
  });
});

describe('RULE_DUPLICATE', () => {
  it('sub-threshold duplicate_count (1) + no stronger signal → duplicate', () => {
    const record = kvRecord({ category: 'other', confidenceTier: 'yellow' }, { category: 'other', duplicate_count: 1, patentNumber: 'ZZZ-not-quarantine' });
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('duplicate');
    expect(result.ruleName).toBe(RULE_DUPLICATE);
  });
  it('boundary: duplicate_count >= threshold (3) → real_bug (RULE_REAL_BUG_DUPS wins)', () => {
    const record = kvRecord({ category: 'other', confidenceTier: 'yellow' }, { category: 'other', duplicate_count: 3, patentNumber: 'ZZZ-not-quarantine' });
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_DUPS);
  });
});
```

---

### `tests/unit/ingest-reports.test.js` (test, request-response + CRUD)

**Analog:** `tests/unit/e2e-report-issue.test.js` (mock injection pattern, lines 1–45)

**Mock gh-client injection pattern** (from `e2e-report-issue.test.js` — `ghClient` DI; note the `suppressed` param exposing the true-return branch):
```javascript
// tests/unit/e2e-report-issue.test.js lines 24-44 (import pattern)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// For ingest-reports.test.js — test the pure parseArgs + artifact shape:
import { parseArgs, buildReportIssueTitle, buildReportIssueBody } from '../../scripts/ingest-reports.mjs';

// Mock gh client — `suppressed` provides the isPostFixSuppressed true-return branch
const makeMockGhClient = ({ existingIssue = null, createdNumber = 42, suppressed = false } = {}) => ({
  findExistingIssueByKvKey: vi.fn().mockReturnValue(existingIssue),
  createIssueWithLabels: vi.fn().mockReturnValue({ number: createdNumber }),
  isPostFixSuppressed: vi.fn().mockReturnValue(suppressed),
});
```

**Idempotency test pattern** (ING-03 — second-run dedup):
```javascript
it('ING-03: second run on same report creates no duplicate issue', () => {
  const existingIssue = { number: 42, body: '<!-- kv-key: report:aabb:1718500000 -->' };
  const ghClient = makeMockGhClient({ existingIssue });
  // Call promote() with same fp+ts twice
  // Second call should skip createIssueWithLabels
  expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();
  expect(ghClient.findExistingIssueByKvKey).toHaveBeenCalledWith('report:aabb:1718500000');
});
```

**Post-fix suppression integration test** (TRI-06 / D-07/D-08 — mandatory, true-return branch):
```javascript
it('TRI-06: a suppressed real_bug is NOT promoted and is recorded suppressed_by_post_fix', () => {
  const ghClient = makeMockGhClient({ suppressed: true });  // true-return branch
  // Drive the list-processing path (or processReport-style helper) for a real_bug record.
  // Assert: createIssueWithLabels NOT called; artifact entry suppressed_by_post_fix === true
  // (promotion_decision 'skip-suppressed'); _review.status written 'wontfix'/skipped.
  expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();
});
```

---

### `tests/unit/gh-client.test.js` (test, request-response)

**Analog:** `tests/unit/e2e-report-issue.test.js` pure-function tests for `findMatchingIssue` and `makeRealGhClient`

**Import pattern:**
```javascript
import { describe, it, expect } from 'vitest';
import { makeKvReportGhClient, isWithinCutoff } from '../../scripts/gh-client.mjs';
```

**`findExistingIssueByKvKey` marker test (adapt marker):**
```javascript
it('findExistingIssueByKvKey: finds issue containing <!-- kv-key: ... --> marker', () => {
  const kvKey = 'report:aabbcc:1718500000';
  const issues = [
    { number: 1, body: `some text <!-- kv-key: ${kvKey} --> more text`, state: 'open' },
    { number: 2, body: 'unrelated issue', state: 'open' },
  ];
  const marker = `<!-- kv-key: ${kvKey} -->`;
  const found = issues.find(i => i.body.includes(marker));
  expect(found?.number).toBe(1);
});
```

**Mandatory date-cutoff test** (TRI-06 — old does NOT suppress, recent DOES; injected `now`):
```javascript
describe('isWithinCutoff (TRI-06 post-fix suppression window, D-08)', () => {
  const NOW = Date.parse('2026-06-17T00:00:00Z');
  it('an entry OLDER than suppressDays (30) does NOT suppress', () => {
    const old = new Date(NOW - 40 * 86400000).toISOString();
    expect(isWithinCutoff(old, 30, NOW)).toBe(false);
  });
  it('a RECENT entry (within suppressDays) DOES suppress', () => {
    const recent = new Date(NOW - 5 * 86400000).toISOString();
    expect(isWithinCutoff(recent, 30, NOW)).toBe(true);
  });
  it('a null/empty timestamp returns false', () => {
    expect(isWithinCutoff(null, 30, NOW)).toBe(false);
  });
});
```

---

### `tests/unit/ingest-reports-wrangler-guard.test.js` (static-grep test)

**Analog:** `tests/unit/eslint-sdk-guard.test.js` (exact structure to copy)

**Exact pattern from analog** (lines 17–32 of `eslint-sdk-guard.test.js`):
```javascript
// tests/unit/eslint-sdk-guard.test.js lines 17-32
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ESLINT_CONFIG_PATH = path.join(REPO_ROOT, 'eslint.config.js');
```

Adapt for `ingest-reports-wrangler-guard.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const REVIEW_SRC  = fs.readFileSync(path.join(REPO_ROOT, 'scripts/review-reports.mjs'), 'utf8');
const INGEST_SRC  = fs.readFileSync(path.join(REPO_ROOT, 'scripts/ingest-reports.mjs'), 'utf8');
const GHCLIENT_SRC = fs.readFileSync(path.join(REPO_ROOT, 'scripts/gh-client.mjs'), 'utf8');

describe('wrangler --remote guard (STATE.md invariant)', () => {
  it('review-reports.mjs: all wrangler kv key calls include --remote', () => {
    const kvCalls = REVIEW_SRC.match(/\['kv', 'key',[^\]]+\]/g) ?? [];
    expect(kvCalls.length).toBeGreaterThan(0);
    for (const call of kvCalls) {
      expect(call).toContain('--remote');
    }
  });

  it('ingest-reports.mjs: no inline wrangler kv calls without --remote', () => {
    const wranglerCalls = INGEST_SRC.match(/wrangler.*kv/g) ?? [];
    for (const call of wranglerCalls) {
      expect(call).toContain('--remote');
    }
    expect(INGEST_SRC).toMatch(/from ['"]\.\/review-reports\.mjs['"]/);
  });

  it('ingest-reports.mjs: CLI guard uses fileURLToPath pattern', () => {
    expect(INGEST_SRC).toMatch(/fileURLToPath\(import\.meta\.url\)/);
    expect(INGEST_SRC).toMatch(/process\.argv\[1\]/);
  });
});
```

---

### `tests/unit/v61-ingest-reports-yaml.test.js` (static-grep test)

**Analog:** `tests/unit/eslint-sdk-guard.test.js` (same readFileSync + grep pattern)

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(REPO_ROOT, '.github/workflows/v61-ingest-reports.yml');

describe('v61-ingest-reports.yml static guards (PROMO-04, COST-02)', () => {
  it('workflow file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('PROMO-04: trigger is workflow_dispatch only (no schedule/push/pull_request)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/workflow_dispatch/);
    expect(text).not.toMatch(/^\s+schedule:/m);
    expect(text).not.toMatch(/^\s+push:/m);
    expect(text).not.toMatch(/^\s+pull_request:/m);
  });

  it('TRI-07: includes actions/upload-artifact step', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/actions\/upload-artifact/);
    expect(text).toMatch(/triage-report/);
  });

  it('artifact retention-days is set', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/retention-days/);
  });

  it('COST-02: max_fixes input default is 5 (not 10)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/default:\s*'5'/);
    expect(text).not.toMatch(/default:\s*'10'/);
  });
});
```

---

### `.github/workflows/v61-ingest-reports.yml` (config, event-driven)

**Analog:** `.github/workflows/e2e-ingest-llm-report.yml` (closest `workflow_dispatch`-only analog)

**Trigger + permissions pattern** (lines 19–35 of analog):
```yaml
# .github/workflows/e2e-ingest-llm-report.yml lines 19-35
name: E2E Ingest LLM Report
on:
  workflow_dispatch:
    inputs:
      payload_b64:
        description: '...'
        required: true
        type: string

permissions:
  contents: read

concurrency:
  group: e2e-ingest-llm-report
  cancel-in-progress: false
```

Adapt for `v61-ingest-reports.yml`:
```yaml
name: v6.1 Ingest Bug Reports

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no Issues created, no KV writes)'
        required: false
        type: boolean
        default: false
      max_fixes:
        description: 'Max auto-promotions per run (default: 5)'
        required: false
        type: string
        default: '5'   # COST-02 / REQUIREMENTS.md L12+L68: per-run cap default is 5, NOT 10

permissions:
  contents: read
  issues: write    # LOAD-BEARING: gh issue create 403s without this
                   # (same note as e2e-weekly-digest.yml line 35)

concurrency:
  group: v61-ingest-reports
  cancel-in-progress: false
```

**Job shape** (from `e2e-ingest-llm-report.yml` lines 36–66, adapted):
```yaml
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      GITHUB_REPOSITORY: ${{ github.repository }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      DRY_RUN: ${{ inputs.dry_run }}
      MAX_FIXES_PER_RUN: ${{ inputs.max_fixes }}

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run ingest-reports
        run: node scripts/ingest-reports.mjs
      - name: Upload triage report
        if: always()    # upload even on partial failure (D-11)
        uses: actions/upload-artifact@v4
        with:
          name: triage-report-${{ github.run_id }}
          path: .triage-reports/triage-report.json
          retention-days: 90
          if-no-files-found: error
```

Note: `issues: write` is load-bearing (same pattern documented in `e2e-weekly-digest.yml` line 35) — `gh issue create` 403s without it. The `max_fixes` input default is `'5'` (COST-02) — never `'10'`.

---

## Shared Patterns

### CLI guard (`if (process.argv[1] === fileURLToPath(import.meta.url))`)

**Source:** `scripts/review-reports.mjs` lines 231–238
**Apply to:** `scripts/ingest-reports.mjs`
**Do NOT apply to:** `scripts/gh-client.mjs` (pure library) or `scripts/report-classifier.mjs` (pure library)

```javascript
// Copy verbatim from scripts/review-reports.mjs lines 231-238
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}
```

### Hidden-comment dedup marker

**Source:** `scripts/e2e-report-issue.mjs` lines 265–266 (the `<!-- fingerprint: ${fp} -->` pattern)
**Apply to:** `scripts/gh-client.mjs` `findExistingIssueByKvKey()` + Issue body builder in `ingest-reports.mjs`
**Phase 11 marker (new):** `<!-- kv-key: report:{fp}:{ts} -->` — constructed from `record.fingerprint` and `record.timestamp` (NOT `_fp` or `_ts` decorator fields; see RESEARCH.md Pitfall 2)

```javascript
// In issue body builder (ingest-reports.mjs):
const kvKey = `report:${record.fingerprint}:${record.timestamp}`;
// Marker at END of body (same position as analog lines 265-266):
`<!-- kv-key: ${kvKey} -->`,
```

### Shell-escaping for gh CLI args

**Source:** `scripts/e2e-report-issue.mjs` lines 508–511 (label escaping) and lines 523–524 (query escaping)
**Apply to:** `scripts/gh-client.mjs` all gh CLI call sites

```javascript
// Label args:
const labelArgs = labels.map(l => `--label "${l.replaceAll('"', '\\"')}"`).join(' ');
// Query string:
const escaped = query.replaceAll("'", "'\\''");
// Title (lines 508-509):
const escapedTitle = title.replaceAll('"', '\\"');
```

### `--body-file -` stdin body pattern

**Source:** `scripts/e2e-report-issue.mjs` lines 513–515 (`gh issue create ... --body-file -`)
**Apply to:** `scripts/gh-client.mjs` `createIssueWithLabels()`

```javascript
// Avoids all body shell-quoting issues; body passed via execSync stdin:
const out = execSync(
  `gh issue create --title "${escapedTitle}" ${labelArgs} --body-file -`,
  { input: body, encoding: 'utf8' }
);
```

### `wrangler --remote` mandatory

**Source:** `scripts/review-reports.mjs` lines 149, 153, 177 (every `wrangler()` args array includes `'--remote'`)
**Apply to:** All KV operations in triage layer — but these are ALL delegated to exported functions from `review-reports.mjs`, so the invariant is inherited automatically. The static-grep test in `tests/unit/ingest-reports-wrangler-guard.test.js` verifies this at the file level.

### Static-grep test structure

**Source:** `tests/unit/eslint-sdk-guard.test.js` lines 17–32 (readFileSync + describe/it/expect)
**Apply to:** `tests/unit/ingest-reports-wrangler-guard.test.js` and `tests/unit/v61-ingest-reports-yaml.test.js`

```javascript
// Exact boilerplate from eslint-sdk-guard.test.js lines 17-24:
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
// Then: readFileSync + grep assertions
```

### `buildReportPayload()` test input construction

**Source:** `tests/unit/report-payload-builder.test.js` lines 25–57 (SCHEMA_ALLOWLIST, fresh-fixture pattern)
**Apply to:** `tests/unit/report-classifier.test.js`

CRITICAL rule: every classifier test MUST spread `buildReportPayload()` output with server-side fields:
```javascript
const record = {
  ...buildReportPayload({ context, category, includeSelectionText: false }),
  duplicate_count: 0,     // server-side — NOT in buildReportPayload output
  fingerprint: 'abc123',  // server-side
  timestamp: Date.now(),  // server-side
};
```

### `actions/upload-artifact@v4` pattern

**Source:** `.github/workflows/e2e-ingest-llm-report.yml` lines 60–66
**Apply to:** `.github/workflows/v61-ingest-reports.yml`

```yaml
# Copy from e2e-ingest-llm-report.yml lines 60-66; change name + path + retention-days:
- name: Upload triage report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: triage-report-${{ github.run_id }}
    path: .triage-reports/triage-report.json
    retention-days: 90
    if-no-files-found: error
```

### `issues: write` permission

**Source:** `.github/workflows/e2e-weekly-digest.yml` lines 33–36 (documented rationale)
**Apply to:** `.github/workflows/v61-ingest-reports.yml`

The comment in `e2e-weekly-digest.yml` line 35 is the authoritative explanation: `gh issue create 403s without issues: write`. Copy this comment into `v61-ingest-reports.yml`.

---

## No Analog Found

All files in scope have close analogs. No entries in this table.

---

## Critical Anti-Patterns (Do Not Copy)

| Anti-Pattern | Source in Analog | Why to Avoid |
|---|---|---|
| `import.meta.url === \`file://${process.argv[1]}\`` guard | `e2e-report-issue.mjs` line 688 | Use `fileURLToPath` form from `review-reports.mjs` line 231 for consistency |
| `<!-- fingerprint: ${fp} -->` dedup marker | `e2e-report-issue.mjs` line 266 | Phase 11 uses `<!-- kv-key: report:{fp}:{ts} -->` (D-04) |
| `runTriage()` from `scripts/e2e-triage-classifier.mjs` | RESEARCH.md State of the Art | Built for E2E Playwright iterations, NOT KV report records |
| `record._fp` or `record._ts` in the kv-key | `review-reports.mjs` line 161 (decorator fields) | Use `record.fingerprint` + `record.timestamp` (canonical; RESEARCH.md Pitfall 2) |
| `buildReportPayload()` output alone as classifier input | `report-payload-builder.js` | Missing `duplicate_count` (server-side); RULE_REAL_BUG_DUPS fires on `undefined` (RESEARCH.md Pitfall 1) |
| Reimplementing `wrangler()` helper in `ingest-reports.mjs` | `review-reports.mjs` lines 136–139 | Loses WORKER_DIR, maxBuffer, banner-stripping, --remote (RESEARCH.md Pitfall 3) |
| `MAX_FIXES_PER_RUN ?? '10'` or workflow `max_fixes` default `'10'` | (drafting error) | COST-02 / REQUIREMENTS.md L12+L68 lock the per-run cap default at **5** — use `?? '5'` and `default: '5'` |

---

## Metadata

**Analog search scope:** `scripts/`, `tests/unit/`, `.github/workflows/`
**Files scanned:** 8 source files + 2 workflow YAMLs + 1 test fixture
**Pattern extraction date:** 2026-06-17
**Revised:** 2026-06-17 — MAX_FIXES default corrected 10→5 (COST-02); RULE_DUPLICATE added (TRI-01 reachability); isWithinCutoff date helper extracted (TRI-06); user_error documented as manual-only
</content>

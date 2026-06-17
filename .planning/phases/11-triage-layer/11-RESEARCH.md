# Phase 11: Triage Layer - Research

**Researched:** 2026-06-17
**Domain:** KV report ingestion, heuristic classifier, GitHub Issue promotion, idempotency, triage artifact
**Confidence:** HIGH — all findings sourced directly from production code, committed planning docs, and prior milestone research

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Golden-corpus presence does NOT block promotion. Apply the normal auto-promote signals regardless of golden membership.
**D-02:** When a promoted report's patent IS in the golden corpus, record `"patent in golden corpus — protect the existing golden case"` in the triage rationale and carry that note into the GitHub Issue body.
**D-03:** Quarantine-corpus membership remains a positive auto-promote signal.
**D-04:** The GitHub Issue is the authoritative dedup signal. Dedup by querying GitHub for an existing `report-fix-candidate` Issue carrying `<!-- kv-key: report:{fp}:{ts} -->`.
**D-05:** Ordering: find-or-create the Issue FIRST, then write the KV `_review.status`. Self-healing on partial failure: next run re-finds the Issue by `kv-key` marker, skips re-creation, re-attempts KV write.
**D-06:** Reuse existing `review-reports.mjs` status vocabulary (`open|reviewed|triaged|resolved|wontfix`). Map: promoted → `triaged`, skipped → `wontfix`. Manual promote (PROMO-02) bypasses the status check so a `wontfix` record can still be force-promoted.
**D-07:** Detect "already fixed" by querying GitHub for a merged `auto-fix/*` PR or closed `report-fix-candidate` Issue whose body references the `patentNumber`. No new persisted ledger.
**D-08:** Suppression window = 30 days, env-configurable. Suppress only if a fix for this patent merged within the last 30 days.
**D-09:** Extract the reusable GitHub plumbing into a shared helper; write fresh report-domain classifier + Issue-body builder. Lift `createIssueWithLabels`, `findMatchingIssue` (hidden-comment dedup, retargeted to `<!-- kv-key: -->` marker), `--paginate` listing, `makeRealGhClient`, label shell-escaping from `e2e-report-issue.mjs`. Do NOT reuse `fingerprint`, `topOfStackHash*`, `buildIssueBody`, `buildIssueTitle`, `filterCasesForFiling`.
**D-10:** Issue body is a human-readable summary (patent number, category, confidenceTier, returnedCitation, classification + rationale, golden/quarantine note, `note` if present, `<!-- kv-key -->` pointer). Omit `selectionText` if absent (privacy).
**D-11:** Persist per-run triage-report JSON as a `workflow_dispatch` run artifact (`actions/upload-artifact`, ~90-day retention). Local CLI runs write to a gitignored path + stdout. No commit to `main`.
**D-12:** Durability: GitHub Issues (permanent, promoted reports) + KV `_review.status` (all processed reports). JSON artifact is the per-run audit snapshot.

### Claude's Discretion

- Exact `ingest-reports.mjs` subcommand/flag surface beyond `list` (default) + `promote <fp> <ts>`.
- Precise shared-helper module name/location for the extracted gh plumbing (D-09) — `scripts/` or `tests/e2e/lib/`, as long as both filers can import it and purity/guard tests stay green.
- Exact triage-rationale string format and named heuristic rule identifiers (TRI-02 requires each rule be named + Vitest-pinned — naming is at discretion).
- Env-var names for the suppression window (D-08) and any new thresholds, following `duplicate_count` / `MAX_FIXES_PER_RUN` convention.

### Deferred Ideas (OUT OF SCOPE)

LLM triage for `ambiguous` reports (v2 LTRI-01), nightly cron trigger (v2 AUTO-01), auto-append promoted-but-ungoldened patents to quarantine (v2 AUTO-02), Worker-route bug fixes (`tool_not_working` deferred to v6.2), all Phase 12+ scope (FIX generation, GATE, COST, DGST, UAT).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | Single command reads `BUG_REPORTS` KV via `wrangler --remote`, emits structured list | `review-reports.mjs` KV plumbing; `wrangler --remote` mandatory pattern confirmed |
| ING-02 | Ingestion reuses `review-reports.mjs` pure functions rather than reimplementing wrangler shell-out | All 7 pure fns exported; I/O fns (`loadReports`, `writeStatus`, `listReportKeys`, `getRecord`, `wrangler`) need export or extraction — see §I/O Importability below |
| ING-03 | Re-running is idempotent — already-promoted reports never re-promoted | D-04/D-05 GitHub Issue dedup via `<!-- kv-key -->` marker; find-or-create pattern |
| ING-04 | Writes `_review.status` marker back to each processed KV record | `writeStatus()` in `review-reports.mjs` is the reuse target; TTL-preserving write pattern documented |
| TRI-01 | Classifies into `{real_bug, noise, duplicate, user_error, infrastructure, ambiguous}` using heuristic rules only | Named-rule classifier pattern; KV field inventory confirmed |
| TRI-02 | Each named rule pinned by a Vitest test using real `buildReportPayload()` output | `buildReportPayload()` output shape documented; test input construction pattern clear |
| TRI-03 | Auto-promote signals: `confidenceTier:"green"` + `inaccurate_citation`, OR `duplicate_count >= 3`, OR patent in quarantine corpus | All three signals confirmed; `duplicate_count` is a KV record field (not in builder output) |
| TRI-04 | Cross-checks patent against golden + quarantine corpora (pure file reads) | `tests/golden/baseline.json` (76 keys), `tests/e2e/test-cases-quarantine.js` (2 cases, `TEST_CASES_QUARANTINE` export) — pure JSON/JS reads, no I/O |
| TRI-05 | `tool_not_working` / `pdfParseStatus:"error"` classified as `infrastructure`, excluded from promotion | Clear field mapping; `pdfParseStatus` is a KV field; `REPORT_CATEGORIES` is frozen |
| TRI-06 | Skips reports already resolved by a fix merged for same `patentNumber` within suppression window | D-07/D-08: `gh pr list --state merged --search "patentNumber in:body"` + date filter; `gh issue list --label report-fix-candidate --state closed` approach confirmed |
| TRI-07 | Emits durable triage-report JSON artifact | D-11: `actions/upload-artifact@v4` for CI runs, gitignored local path for CLI; artifact shape: `{fingerprint, classification, rationale, promotion_decision, promotion_source}` |
| PROMO-01 | Promoted report becomes GitHub Issue with `<!-- kv-key -->` pointer and human-readable summary, labeled `report-fix-candidate` | D-09/D-10; `createIssueWithLabels` extraction from `e2e-report-issue.mjs` confirmed |
| PROMO-02 | Maintainer can manually promote any report via `ingest-reports.mjs promote <fp> <ts>` | D-06 bypass of status check; same downstream path as auto-promote |
| PROMO-03 | Manual promotion uses exact same downstream path as auto-promotion, recorded with `promotion_source: 'manual'` | Single promotion function; `promotion_source` field in triage artifact |
| PROMO-04 | Entry point is `workflow_dispatch`-only | Confirmed; no cron; pattern from `e2e-ingest-llm-report.yml` and `e2e-weekly-digest.yml` |
</phase_requirements>

---

## Summary

Phase 11 builds `scripts/ingest-reports.mjs` — a maintainer-triggered script that reads the production `BUG_REPORTS` KV namespace, heuristically classifies each report, promotes real bugs to `report-fix-candidate` GitHub Issues, writes `_review.status` back for idempotency, and emits a per-run triage JSON artifact. The phase has no LLM calls, no workflow YAML changes beyond a new `v61-ingest-reports.yml` `workflow_dispatch` entry-point, and no changes to `src/shared/`.

The key insight from code analysis: the I/O functions in `review-reports.mjs` (`loadReports`, `writeStatus`, `listReportKeys`, `getRecord`, `wrangler`) are currently module-private. The cleanest path to ING-02 compliance is to **export them directly from `review-reports.mjs`** — the file already guards I/O behind the `if (process.argv[1] === import.meta.url)` check, so exporting the I/O functions does not break the existing CLI invocation or the seven pure-function exports already tested in `tests/unit/review-reports.test.js`.

The gh-plumbing extraction (D-09) targets `scripts/` as the shared helper location (both `scripts/ingest-reports.mjs` and `scripts/e2e-report-issue.mjs` can import from there without the purity/path restrictions that apply to `tests/e2e/lib/`).

**Primary recommendation:** Export the I/O functions from `review-reports.mjs` addtively (no behavior change), extract a `scripts/gh-client.mjs` helper from `e2e-report-issue.mjs`, build `ingest-reports.mjs` as a pure consumer of both, and structure the heuristic classifier as a pure module (`scripts/report-classifier.mjs`) that `ingest-reports.mjs` imports — making every rule independently testable.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| KV record reading | Maintainer CLI (Node.js script) | — | `wrangler --remote` shell-out from `worker/` dir; same pattern as `review-reports.mjs` |
| Heuristic classification | Node.js pure module | — | No I/O, no LLM; deterministic over KV field values |
| Golden/quarantine cross-check | Node.js pure module | — | Pure file reads at module load; `tests/golden/baseline.json` + `test-cases-quarantine.js` |
| GitHub Issue creation (dedup) | Node.js I/O module (gh CLI) | — | `gh issue list --search` + `gh issue create`; shell-escaping required |
| KV `_review.status` write-back | Node.js I/O (wrangler CLI) | — | Same `writeStatus()` pattern from `review-reports.mjs` |
| Post-fix suppression check | Node.js I/O module (gh CLI) | — | `gh pr list --state merged` + `gh issue list --state closed` query |
| Triage artifact emission | Node.js (fs.writeFileSync) | GitHub Actions upload-artifact | Local: gitignored path; CI: `actions/upload-artifact@v4` |
| `workflow_dispatch` entry-point | GitHub Actions (new workflow) | — | PROMO-04; `workflow_dispatch:` only, no cron |

---

## Standard Stack

### Core (No New External Packages)

This phase is zero-new-dependency. All tools used are already present in the project.

| Library/Tool | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| `node:child_process` (`execFileSync`) | Node.js built-in | wrangler shell-out, gh CLI calls | Same pattern as `review-reports.mjs` |
| `node:fs` | Node.js built-in | Corpus file reads, artifact write, wrangler.toml read | Zero-dep philosophy |
| `node:path` | Node.js built-in | Path resolution | Standard |
| `wrangler` CLI | Already installed (worker/) | `kv key list/get/put --remote` | Required for KV access; `--remote` mandatory |
| `gh` CLI | Pre-installed in GitHub Actions | Issue creation, dedup search, PR search | Existing pattern in `e2e-report-issue.mjs` |
| `vitest` | Already in devDependencies | Unit tests for named classifier rules | Existing test framework |

**No new npm packages are required.** The "Package Legitimacy Audit" section is not applicable.

### Vitest (confirmed)

```bash
# Quick run:
npm run test:src

# Full suite (required before any PR):
npm test
```

---

## Architecture Patterns

### System Architecture Diagram

```
  workflow_dispatch trigger
        │
        ▼
  v61-ingest-reports.yml (new)
        │
        ▼
  scripts/ingest-reports.mjs
        │
        ├─── getNamespaceId() [from review-reports.mjs: pure fn]
        │    loadReports()    [from review-reports.mjs: I/O fn — NEW export]
        │
        ▼
  For each report with _review.status === 'open':
        │
        ├─── classifyReport() [scripts/report-classifier.mjs: pure]
        │         │
        │         ├── check RULE_INFRASTRUCTURE → category:infrastructure
        │         ├── check RULE_PDF_ERROR → category:infrastructure
        │         ├── check RULE_REAL_BUG_GREEN → real_bug
        │         ├── check RULE_REAL_BUG_DUPS → real_bug
        │         ├── check RULE_QUARANTINE_HIT → real_bug
        │         ├── check RULE_NO_MATCH_NOISE → noise
        │         └── catch-all → ambiguous
        │
        ├─── isPostFixSuppressed() [gh CLI: merged auto-fix/* PR OR closed report-fix-candidate for patentNumber]
        │
        ├─── IF real_bug AND NOT suppressed:
        │         findMatchingIssue() [gh-client.mjs: search by <!-- kv-key --> marker]
        │         │
        │         ├── Issue found? → skip (idempotent)
        │         └── Issue NOT found? → createIssueWithLabels('report-fix-candidate')
        │                    ↓
        │              writeStatus(nsId, fp, ts, 'triaged') [review-reports.mjs I/O]
        │
        ├─── IF noise/user_error/infrastructure:
        │         writeStatus(nsId, fp, ts, 'wontfix')
        │
        └─── Append entry to triage-report artifact
                  {fingerprint, classification, rationale, promotion_decision, promotion_source}

  promote subcommand:
        │
        ▼
  scripts/ingest-reports.mjs promote <fp> <ts>
        │
        ├── Fetch record [loadReports + filter OR getRecord]
        ├── findMatchingIssue by kv-key → skip if exists
        ├── createIssueWithLabels('report-fix-candidate') [same path as auto]
        ├── writeStatus(nsId, fp, ts, 'triaged')
        └── Artifact entry: promotion_source: 'manual'

  CI: upload triage-report.json as actions/upload-artifact
  CLI: write to .triage-reports/ (gitignored) + stdout
```

### Recommended Project Structure

```
scripts/
├── ingest-reports.mjs        # NEW: CLI entry-point + workflow dispatch target
├── report-classifier.mjs     # NEW: pure heuristic rules (no I/O)
├── gh-client.mjs             # NEW: shared gh plumbing (extracted from e2e-report-issue.mjs)
├── review-reports.mjs        # MODIFIED: export I/O fns (additive; no behavior change)
.github/workflows/
└── v61-ingest-reports.yml    # NEW: workflow_dispatch-only trigger
tests/unit/
├── report-classifier.test.js # NEW: named-rule tests with buildReportPayload() input
├── ingest-reports.test.js    # NEW: ingest-reports.mjs pure logic tests (arg parsing, artifact shape)
└── gh-client.test.js         # NEW: gh-client.mjs pure fn tests (findMatchingIssue, createIssueWithLabels)
.triage-reports/              # NEW: gitignored local artifact dir
```

### Pattern 1: Exporting I/O Functions from `review-reports.mjs` (ING-02)

**What:** Add `export` keyword to the four currently module-private I/O functions.

**Why safe:** The file already guards CLI execution with:
```javascript
// Source: scripts/review-reports.mjs line 231-238 [VERIFIED: codebase]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(process.argv.slice(2)); } catch (err) { ... }
}
```
Exporting the functions does not cause them to execute on `import`. The existing `review-reports.test.js` imports 7 pure fns today — adding I/O fn exports does not break those tests.

**Functions to export (additive):**
```javascript
// Add 'export' to these four currently private functions in review-reports.mjs
export function listReportKeys(nsId) { ... }
export function getRecord(nsId, name) { ... }
export function loadReports(nsId) { ... }
export function writeStatus(nsId, fp, ts, state) { ... }
// Also export the REVIEW_STATES constant (already referenced by test via import)
export const REVIEW_STATES = ['open', 'reviewed', 'triaged', 'resolved', 'wontfix'];
```

**TTL-preserving write-back shape** (critical for ING-04):
```javascript
// Source: scripts/review-reports.mjs lines 166-178 [VERIFIED: codebase]
// writeStatus reads the key's expiration from listReportKeys(), then uses:
//   keyMeta.expiration ? --expiration=${keyMeta.expiration} : --ttl=${TTL_90_DAYS}
// This preserves the original 90-day expiry. ingest-reports.mjs MUST call
// writeStatus() (not reimplement KV write) to inherit this behavior.
```

**REVIEW_STATES vocabulary** (D-06):
```javascript
// Confirmed values: ['open', 'reviewed', 'triaged', 'resolved', 'wontfix']
// Mapping for Phase 11:
//   promoted (auto or manual) → 'triaged'
//   skipped (noise / user_error / infrastructure) → 'wontfix'
// The status check in ingest-reports.mjs filters to status === 'open' by default;
// manual promote (PROMO-02) bypasses this check so 'wontfix' records can be force-promoted.
```

### Pattern 2: Shared gh-Client Extraction (D-09)

**Location:** `scripts/gh-client.mjs` (not `tests/e2e/lib/` — no purity/D-04 restrictions apply to scripts/).

**Functions to lift from `e2e-report-issue.mjs`:**

```javascript
// Source: scripts/e2e-report-issue.mjs lines 478-554 [VERIFIED: codebase]

// LIFT THESE (shared gh plumbing):
export function makeRealGhClient(repo, label) { ... }
// Specifically these methods within makeRealGhClient:
//   createIssueWithLabels(title, body, labels)  — multi-label create, shell-escapes labels
//   listOpenWithSearch(query)                   — gh issue list --search, shell-escapes query
//   addLabel(issueNumber, label)                — idempotent label-add
//   commentIssue(number, body)                  — --body-file - pattern

// RETARGET the dedup marker from:
//   <!-- fingerprint: ${fp} -->  (Phase 29/35 legacy)
// to:
//   <!-- kv-key: report:{fp}:{ts} -->  (Phase 11 new convention)

// findMatchingIssue stays in gh-client.mjs but with the new marker:
export function findMatchingIssueByKvKey(issues, kvKey) {
  const marker = `<!-- kv-key: ${kvKey} -->`;
  return issues.find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
}
```

**Functions NOT to lift (E2E-case-specific, stays in `e2e-report-issue.mjs`):**
- `fingerprint()` — uses `caseId|errorClass|topOfStackHash`; reports use KV fingerprint directly
- `topOfStackHashFromCase()`, `topOfStackHashFromTriage()` — E2E iteration concepts
- `buildIssueBody()`, `buildIssueTitle()` — E2E-case-shaped output
- `filterCasesForFiling()`, `filterFindingsForFiling()`, `processReport()`, `processTriageReport()` — E2E case processing

**Keeping `e2e-report-issue.mjs` green:** After extraction, `e2e-report-issue.mjs` imports from `./gh-client.mjs` (or `../scripts/gh-client.mjs` depending on location). The existing `tests/unit/e2e-report-issue.test.js` tests pure functions only; none of the lifted functions are tested via their `e2e-report-issue.mjs` import path in those tests — they test the caller side with mock clients.

### Pattern 3: Named Heuristic Rules with Vitest Pinning (TRI-01, TRI-02)

**Classifier module:** `scripts/report-classifier.mjs` — pure, zero I/O, importable by tests.

**Input shape** (from `buildReportPayload()` output + server-side additions):
```javascript
// Source: src/shared/report-payload-builder.js [VERIFIED: codebase]
// Fields from buildReportPayload():
//   category, patentNumber, patentUrl, selectionText? (absent if opted out),
//   returnedCitation, confidenceTier, extensionVersion, browser, os, xpathNode,
//   scrollY, viewportWidth, viewportHeight, pdfParseStatus, triggerMode, errorLog, note
//
// Fields added server-side by Worker (present on KV record, NOT in builder output):
//   duplicate_count, fingerprint, timestamp
//
// Classifier Vitest tests MUST include duplicate_count in the synthetic record;
// buildReportPayload() output alone is NOT the full KV record shape.
```

**Named rule skeleton:**
```javascript
// Source: design derived from REQUIREMENTS.md + CONTEXT.md [ASSUMED structure; names are discretionary]
export const RULE_INFRASTRUCTURE = 'RULE_INFRASTRUCTURE';
export const RULE_PDF_ERROR = 'RULE_PDF_ERROR';
export const RULE_REAL_BUG_GREEN = 'RULE_REAL_BUG_GREEN';
export const RULE_REAL_BUG_DUPS = 'RULE_REAL_BUG_DUPS';
export const RULE_QUARANTINE_HIT = 'RULE_QUARANTINE_HIT';
export const RULE_NO_MATCH_NOISE = 'RULE_NO_MATCH_NOISE';
export const RULE_AMBIGUOUS = 'RULE_AMBIGUOUS';

export function classifyReport(record, { goldenPatents, quarantinePatents, dupThreshold = 3 } = {}) {
  const { category, confidenceTier, returnedCitation, pdfParseStatus, errorLog, duplicate_count, patentNumber } = record;
  // Rules applied in priority order (first match wins):
  // RULE_INFRASTRUCTURE: category === 'tool_not_working'
  // RULE_PDF_ERROR: pdfParseStatus === 'error' (classified infrastructure, not matching-core fix)
  // RULE_REAL_BUG_GREEN: category === 'inaccurate_citation' && confidenceTier === 'green'
  // RULE_REAL_BUG_DUPS: (duplicate_count ?? 0) >= dupThreshold
  // RULE_QUARANTINE_HIT: quarantinePatents.has(patentNumber)
  // RULE_NO_MATCH_NOISE: category === 'no_match' && !errorLog?.length
  // RULE_AMBIGUOUS: catch-all
  return { classification, rationale, ruleName, inGoldenCorpus, inQuarantineCorpus };
}
```

**Vitest test construction pattern** (TRI-02):
```javascript
// Tests MUST use buildReportPayload() output + server-side fields:
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import { classifyReport, RULE_REAL_BUG_GREEN } from '../../scripts/report-classifier.mjs';

it('RULE_REAL_BUG_GREEN: green + inaccurate_citation → real_bug', () => {
  const base = buildReportPayload({
    context: { patentNumber: 'US11427642', confidenceTier: 'green',
                returnedCitation: '2:15', extensionVersion: '5.0.0',
                selectionText: 'example text', pdfParseStatus: 'ok' },
    category: 'inaccurate_citation',
    includeSelectionText: true,
  });
  const record = { ...base, duplicate_count: 0 };  // add server-side field
  const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
  expect(result.classification).toBe('real_bug');
  expect(result.ruleName).toBe(RULE_REAL_BUG_GREEN);
});
```

### Pattern 4: GitHub Issue Body Shape (D-10, PROMO-01)

The Issue body is the load-bearing Phase 12 contract. Phase 12's `v61-report-fix.yml` parses the `<!-- kv-key: -->` pointer from this body to fetch the full KV record. The body format must be stable.

```markdown
## Bug report: {patentNumber} ({category})

| Field | Value |
|-------|-------|
| Patent | `{patentNumber}` |
| Category | `{category}` |
| Confidence tier | `{confidenceTier}` |
| Returned citation | `{returnedCitation ?? '(none)'}` |
| Classification | `{classification}` |

**Triage rationale:** {rationale}

{IF patent in golden corpus: > **Note:** Patent is in the golden corpus — protect the existing golden case.}
{IF patent in quarantine corpus: > **Note:** Patent is in the quarantine corpus.}
{IF note present: **User note:** {note}}

<!-- kv-key: report:{fp}:{ts} -->
```

**Privacy:** `selectionText` is OMITTED from the Issue body entirely when absent from the KV record. Never re-fetch it. This matches D-10 and the v5.0 privacy choice.

### Pattern 5: Post-Fix Suppression (D-07, D-08, TRI-06)

Two gh queries are needed; both must be called before promoting a report for a given `patentNumber`:

```javascript
// Query 1: merged auto-fix/* PRs referencing patentNumber in body
// Source: gh CLI pattern from scripts/e2e-report-issue.mjs --paginate [VERIFIED: codebase]
const mergedPRs = execSync(
  `gh pr list --state merged --search "${escapedPatentNum} in:body" ` +
  `--json number,mergedAt,headRefName --limit 20`,
  { encoding: 'utf8' }
);
// Filter: headRefName starts with 'auto-fix/' AND mergedAt within suppressionWindowDays

// Query 2: closed report-fix-candidate Issues for patentNumber
const closedIssues = execSync(
  `gh issue list --label report-fix-candidate --state closed ` +
  `--search "${escapedPatentNum} in:body" --json number,closedAt,body --limit 20`,
  { encoding: 'utf8' }
);
// Filter: closedAt within suppressionWindowDays (D-08)
```

**Env-configurable window** (following `MAX_FIXES_PER_RUN` convention):
```javascript
const POST_FIX_SUPPRESS_DAYS = parseInt(process.env.POST_FIX_SUPPRESS_DAYS ?? '30', 10);
```

**Shell-escaping:** `patentNumber` should be validated as alphanumeric (it comes from the KV record which was validated by the Worker) before interpolation. Use the same `replaceAll("'", "'\\''")` escape pattern from `listOpenWithSearch`.

### Pattern 6: `actions/upload-artifact` for Triage Report (D-11)

```yaml
# Source: .github/workflows/e2e-ingest-llm-report.yml [VERIFIED: codebase]
- name: Upload triage report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: triage-report-${{ github.run_id }}
    path: .triage-reports/triage-report.json
    retention-days: 90
    if-no-files-found: error
```

Local CLI runs: write to `.triage-reports/triage-report-{timestamp}.json` (gitignored path). The `.triage-reports/` directory should be added to `.gitignore`.

**Artifact entry shape:**
```json
{
  "fingerprint": "abc123def456",
  "kv_key": "report:abc123def456:1718500000000",
  "patent_number": "US11427642",
  "category": "inaccurate_citation",
  "classification": "real_bug",
  "rule_name": "RULE_REAL_BUG_GREEN",
  "rationale": "confidenceTier:green + category:inaccurate_citation — high-confidence real bug signal",
  "in_golden_corpus": false,
  "in_quarantine_corpus": true,
  "promotion_decision": "auto",
  "promotion_source": "auto",
  "github_issue_number": 142,
  "suppressed_by_post_fix": false,
  "kv_status_written": "triaged",
  "processed_at": "2026-06-17T20:00:00.000Z"
}
```

### Pattern 7: `wrangler --remote` Grep Assertion (STATE.md invariant)

The STATE.md permanent invariant table states: "`wrangler kv` always uses `--remote` | Grep assertion in triage layer Vitest tests"

**Structure of the Vitest grep assertion** (mirrors `eslint-sdk-guard.test.js` pattern):
```javascript
// tests/unit/ingest-reports-wrangler-guard.test.js
import fs from 'node:fs';
import path from 'node:path';

const INGEST_SRC = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../scripts/ingest-reports.mjs'), 'utf8'
);
const REVIEW_SRC = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../scripts/review-reports.mjs'), 'utf8'
);

it('ingest-reports.mjs never calls wrangler kv without --remote', () => {
  // Every wrangler kv invocation must include --remote
  const wranglerCalls = INGEST_SRC.match(/wrangler.*kv/g) ?? [];
  expect(wranglerCalls.length).toBeGreaterThan(0); // at least one wrangler kv call exists
  for (const call of wranglerCalls) {
    expect(call).toContain('--remote');
  }
});

it('review-reports.mjs wrangler kv calls always include --remote', () => {
  // Verify the reuse target enforces --remote (regression guard)
  const kvCalls = REVIEW_SRC.match(/\['kv', 'key',.*\]/g) ?? [];
  for (const call of kvCalls) {
    expect(call).toContain('--remote');
  }
});
```

**Note:** Because `ingest-reports.mjs` delegates KV I/O to exported functions from `review-reports.mjs`, the grep may need to cover the shared functions rather than ingest-reports.mjs directly. The assertion should verify that ALL `wrangler kv key list/get/put` invocations in the triage-layer codebase (both files) include `--remote`. Use `readFileSync` on both files.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| KV list/get/put | New wrangler shell-out | `listReportKeys`, `getRecord`, `writeStatus` exported from `review-reports.mjs` | Already handles `--remote`, JSON parsing, WORKER_DIR, banner stripping, TTL preservation |
| GitHub Issue dedup | Custom marker scheme | `findMatchingIssueByKvKey()` in `gh-client.mjs` | Hidden HTML comment pattern; already shell-escape-safe via `listOpenWithSearch` |
| GitHub Issue create | Direct `execSync('gh issue create ...')` | `createIssueWithLabels()` in `gh-client.mjs` | Label shell-escaping; `--body-file -` pattern for large bodies |
| KV namespace ID | Parsing wrangler.toml manually | `getNamespaceId(wranglerToml)` from `review-reports.mjs` | Already handles the two-namespace `wrangler.toml` (PATENT_CACHE + BUG_REPORTS) |
| TTL-preserving KV write | `kv key put --ttl=7776000` (unconditional) | `writeStatus()` from `review-reports.mjs` | Reads existing expiration from `listReportKeys()`, falls back to TTL only when expiration absent |
| Report field access | Treating `duplicate_count` as a builder output field | Add it manually to test inputs | `duplicate_count` is server-side only; `buildReportPayload()` does NOT include it |

**Key insight:** The most dangerous "looks easy" anti-pattern is reimplementing the `wrangler` shell-out. The existing `review-reports.mjs` implementation handles five specific edge cases: the WORKER_DIR working directory, `maxBuffer: 64MB`, the wrangler JSON-banner stripping (`parseWranglerJson`), the `--remote` flag, and the TTL-vs-expiration choice. Any reimplementation risks missing one of these.

---

## Runtime State Inventory

This is not a rename/refactor/migration phase. Section SKIPPED — no runtime state audit required.

---

## Common Pitfalls

### Pitfall 1: `duplicate_count` Not in `buildReportPayload()` Output

**What goes wrong:** A Vitest test for `RULE_REAL_BUG_DUPS` uses `buildReportPayload()` output directly as the classifier input without adding `duplicate_count`. The rule always fires at `duplicate_count === undefined`, which coerces to `0 >= 3` → false. Tests pass vacuously; the rule never fires in production either.

**Why it happens:** `buildReportPayload()` documentation clearly says "server-computed fields excluded." But in TRI-02 tests it is easy to pass the builder output directly and forget the server-side addition.

**How to avoid:** Always spread the builder output with the server-side fields explicitly:
```javascript
const record = { ...buildReportPayload({...}), duplicate_count: 5, fingerprint: 'abc', timestamp: Date.now() };
```

**Warning signs:** `RULE_REAL_BUG_DUPS` test passes with `duplicate_count: 3` in the expected output but the classifier is receiving `undefined`.

---

### Pitfall 2: Dedup Marker Targeting Wrong Field

**What goes wrong:** The hidden comment uses `<!-- kv-key: report:{fp}:{ts} -->` where `fp` is the short fingerprint and `ts` is the timestamp. If either value is taken from the wrong source (e.g., `_fp` vs `fingerprint`), the marker changes between runs and dedup fails — creating duplicate Issues.

**Why it happens:** The KV record has both `fingerprint` (the authoritative field) and `_fp` (the decorator added by `loadReports()` from the key name). Both should be equal, but defensive code must use the canonical `fingerprint` field from the record body.

**How to avoid:** Construct the `kv-key` as:
```javascript
const kvKey = `report:${record.fingerprint}:${record.timestamp}`;
// NOT: record._fp (decorator) or record._ts (decorator)
```

---

### Pitfall 3: wrangler Shell-Out from Wrong Directory

**What goes wrong:** `execFileSync('npx', ['wrangler', 'kv', ...])` succeeds locally but 403s in CI because the working directory is not `worker/` — wrangler cannot find `wrangler.toml` and auth context.

**Why it happens:** The `WORKER_DIR` constant in `review-reports.mjs` is computed from `__dirname` of that file (`scripts/../worker`). When ingest-reports.mjs calls the exported I/O functions, `WORKER_DIR` is still computed from `review-reports.mjs`'s own location — so this is safe BY DEFAULT. But if anyone copies the `wrangler()` helper into `ingest-reports.mjs` directly, they must also copy the `WORKER_DIR` derivation.

**How to avoid:** Use the exported I/O functions from `review-reports.mjs` exclusively — never copy the `wrangler()` function. The `WORKER_DIR` is internal to `review-reports.mjs` and correct for all exported functions.

---

### Pitfall 4: Post-Fix Suppression Race with Newly Created Issues

**What goes wrong:** The suppression check queries for closed `report-fix-candidate` Issues. But during the same run, the issue-creation step may have just created an Issue that is now open, not closed. A report for the same patent on the second iteration of the same run could be suppressed against an open (not merged) Issue.

**Why it happens:** The suppression check queries for **closed** Issues (indicating a fix was actually merged) and **merged** PRs. An open Issue should not trigger suppression.

**How to avoid:** The suppression filter must be:
- Merged `auto-fix/*` PRs (not just open ones)
- Closed `report-fix-candidate` Issues (not just labeled ones)

Both queries are already correctly scoped. Within a single run, newly created Issues are open, not closed, so they do not trigger suppression. This is correct by construction.

---

### Pitfall 5: `writeStatus` Called Before Issue Creation (D-05 Violation)

**What goes wrong:** The KV `_review.status` is written to `triaged` before the GitHub Issue is confirmed created. If Issue creation fails (gh CLI transient error), the record is marked `triaged` but no Issue exists. On the next run, the record is skipped because its status is not `open`. The report is permanently suppressed without a corresponding Issue.

**Why it happens:** Inverting D-05 — writing KV first instead of GitHub Issue first.

**How to avoid:** Strictly follow D-05 ordering:
1. `findMatchingIssueByKvKey()` — check GitHub first
2. If not found: `createIssueWithLabels()` — create the Issue
3. Only on Issue creation success: `writeStatus(nsId, fp, ts, 'triaged')`

Self-healing: if (2) succeeds but (3) fails, the next run finds the Issue in (1), skips creation, and retries (3).

---

### Pitfall 6: Manual Promote Skipping the `_review.status` Bypass

**What goes wrong:** The `promote` subcommand checks the KV record's `_review.status` and refuses to promote a `wontfix` record. D-06 specifies that manual promote bypasses the status check.

**How to avoid:** The `promote` subcommand must skip the `status === 'open'` filter entirely and operate on any record regardless of current status. It should still respect the D-04/D-05 ordering (GitHub Issue dedup first).

---

### Pitfall 7: `selectionText` Privacy Leak in Issue Body

**What goes wrong:** The Issue body builder includes `selectionText` even when it is absent from the KV record (perhaps pulling it from `patentUrl` or setting it to a placeholder string).

**Why it happens:** D-10 says omit `selectionText` if absent. A developer might add `selectionText: record.selectionText ?? '(not provided)'` which exposes that the user opted out.

**How to avoid:** Use a conditional presence check:
```javascript
// Correct: field entirely absent when null/undefined
const body = [
  ...coreFields,
  record.selectionText != null ? `**Selected text:** ${record.selectionText}` : null,
  ...rest
].filter(Boolean).join('\n');
```

---

## Code Examples

### KV Load with Reused Pure Fns and I/O Fns

```javascript
// Source: pattern derived from scripts/review-reports.mjs [VERIFIED: codebase]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getNamespaceId,
  filterReports,
  sortReports,
  reviewStatus,
  loadReports,
  writeStatus,
} from './review-reports.mjs';

const WORKER_DIR = join(new URL('.', import.meta.url).pathname, '..', 'worker');
const toml = readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8');
const nsId = getNamespaceId(toml);

// Load only open reports
const allReports = loadReports(nsId);
const pending = filterReports(allReports, { status: 'open' });
const sorted = sortReports(pending);  // newest first
```

### Finding Existing Issue by kv-key Marker (D-04)

```javascript
// Source: pattern derived from e2e-report-issue.mjs listOpenWithSearch [VERIFIED: codebase]
// In scripts/gh-client.mjs

export function makeKvReportGhClient(repo) {
  return {
    findExistingIssueByKvKey(kvKey) {
      // Search open AND closed issues (dedup must cover both states)
      const escaped = kvKey.replaceAll("'", "'\\''");
      const marker = `<!-- kv-key: ${kvKey} -->`;
      try {
        const raw = execSync(
          `gh issue list --search '${escaped}' --state all --label report-fix-candidate ` +
          `--json number,title,body,state --limit 20`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        const issues = JSON.parse(raw);
        return (Array.isArray(issues) ? issues : [])
          .find(i => typeof i.body === 'string' && i.body.includes(marker)) || null;
      } catch {
        return null;
      }
    },
    createIssueWithLabels(title, body, labels) {
      // Source: e2e-report-issue.mjs lines 507-517 [VERIFIED: codebase]
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
  };
}
```

### Corpus Cross-Check (TRI-04)

```javascript
// Source: tests/golden/baseline.json structure [VERIFIED: codebase]
// tests/e2e/test-cases-quarantine.js — exports TEST_CASES_QUARANTINE array
import baseline from '../../tests/golden/baseline.json' assert { type: 'json' };
import { TEST_CASES_QUARANTINE } from '../../tests/e2e/test-cases-quarantine.js';

// Golden patents: keys of baseline.json are case IDs like 'US11427642-spec-short-1'
// Extract just the patent numbers:
const goldenPatents = new Set(
  Object.keys(baseline).map(id => id.match(/^([A-Z]{2}\d+[A-Z]?\d*)/)?.[1]).filter(Boolean)
);
// quarantine patents:
const quarantinePatents = new Set(
  TEST_CASES_QUARANTINE.map(c => c.id.match(/^([A-Z]{2}\d+[A-Z]?\d*)/)?.[1]).filter(Boolean)
);
```

**Note on golden patent ID extraction:** The baseline keys are like `US11427642-spec-short-1`. The patent number is the prefix before the first `-` group that is not alphanumeric (i.e., the `US` + digits part). [ASSUMED] A regex like `/^([A-Z]{2}\d+[A-Z]?\d*)/` extracts it but needs validation against the actual baseline keys at plan time.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synthetic `issues: labeled` trigger on `v40-auto-fix.yml` | `workflow_dispatch` only (Phase 10 retirement) | 2026-06-17 | Ingest workflow must be `workflow_dispatch:` only |
| v3.1 `triage-classifier.js` (`runTriage()` over E2E iterations) | New pure KV-report classifier (`classifyReport()` over KV fields) | Phase 11 (new) | Must NOT reuse `runTriage()`; different input shape |
| `<!-- fingerprint: {fp} -->` dedup marker | `<!-- kv-key: report:{fp}:{ts} -->` dedup marker | Phase 11 (new) | Different marker; old E2E issues not affected |
| `auto-fix-api` ledger source | No new ledger entries in Phase 11 | — | Phase 11 is heuristic-only; zero LLM calls |
| wrangler v4 local-default | Always `--remote` | v6.0 memory note | False-empty `[]` without `--remote` |

**Deprecated/outdated:**
- `runTriage()` from `scripts/e2e-triage-classifier.mjs`: built for E2E Playwright iteration results; `iter.classification` and `verifier_verdict` fields do not exist in KV report records. DO NOT reuse.
- `topOfStackHashFromCase()`, `topOfStackHashFromTriage()`: E2E concepts; KV reports have a pre-computed `fingerprint` from the Worker.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Golden patent ID extraction regex `/^([A-Z]{2}\d+[A-Z]?\d*)/` correctly extracts US patent numbers from baseline.json keys | Code Examples (Corpus Cross-Check) | Low: easy to verify at plan time by inspecting baseline.json keys; fix is a one-line regex adjustment |
| A2 | `gh issue list --state all` with `--label report-fix-candidate` returns both open and closed issues matching the search | Code Examples (findExistingIssueByKvKey) | Medium: `--state all` behavior with `--label` filter may differ from `--state open`; verify with `gh issue list --help`; fallback: two separate calls |
| A3 | `scripts/` is an acceptable location for `gh-client.mjs` shared helper without triggering any purity guards or ESLint rules that currently apply only to `tests/e2e/lib/` | Architecture Patterns (Pattern 2) | Low: `scripts/` files are not subject to the D-04 purity ESLint block (which covers `tests/e2e/lib/fix-prompt-builder.js` specifically); verify in `eslint.config.js` at plan time |
| A4 | The `--body-file -` pattern for `gh issue create` works with `execSync({ input: body })` passing stdin | Code Examples | Low: confirmed pattern in `e2e-report-issue.mjs` lines 497-500; only risk is `--body-file` flag support in the installed `gh` version |

**If this table is otherwise empty:** All other claims in this research were verified from production code or committed planning docs.

---

## Open Questions

1. **GitHub `--state all` + `--label` dedup reliability**
   - What we know: `listOpenWithSearch()` in `e2e-report-issue.mjs` uses `--state open`. The D-04 dedup requirement searches for issues in any state (an old closed issue from a previous run must also block re-creation).
   - What's unclear: Whether `gh issue list --state all --label report-fix-candidate --search "..."` is more reliable than two separate calls (`--state open` + `--state closed`).
   - Recommendation: Use two separate calls in the gh-client helper to avoid any gh CLI quirk with `--state all + --label`. Merge and dedup the arrays in memory.

2. **`export function` additions to `review-reports.mjs` — test count impact**
   - What we know: `tests/unit/review-reports.test.js` already imports 7 pure functions; no I/O functions are tested there.
   - What's unclear: Whether any test asserts a specific export count or uses `Object.keys(module)` to enumerate exports (a drift guard).
   - Recommendation: At plan time, grep `review-reports.test.js` for any enumeration assertions. None were found in the code read, so this is likely safe.

3. **Artifact path for local CLI runs (gitignore)**
   - What we know: D-11 says local CLI writes to gitignored path + stdout. The `.triage-reports/` directory does not yet exist.
   - What's unclear: Whether `.triage-reports/` should be created by the script or pre-created with a `.gitkeep`.
   - Recommendation: Have the script create the directory with `fs.mkdirSync('.triage-reports', { recursive: true })` at runtime; add `.triage-reports/` to `.gitignore`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts | ✓ | v24.11.1 | — |
| `wrangler` CLI | ING-01, ING-04 | ✓ (in `worker/`) | Installed (wrangler v4) | — |
| `gh` CLI | PROMO-01, TRI-06 | Must verify in CI | — | CI secret `GH_TOKEN` + gh preinstalled on GitHub-hosted runners |
| `vitest` | TRI-02 test pinning | ✓ (devDependencies) | Per package.json | — |
| `tests/golden/baseline.json` | TRI-04 | ✓ | 76 keys | — |
| `tests/e2e/test-cases-quarantine.js` | TRI-04 | ✓ | 2 cases | — |
| `actions/upload-artifact@v4` | TRI-07 (CI) | ✓ (used in `ci.yml`, `e2e-ingest-llm-report.yml`) | v4 | — |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:**
- `gh` CLI in local runs: If `gh` is not installed locally, `promote` and `list` (with GitHub queries) will fail. The pure `list` (no Issue queries) can still work via wrangler-only. Document in script help text.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already installed) |
| Config file | `vitest.config.js` (root) |
| Quick run command | `npm run test:src` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-01 | Reads KV via `--remote`, emits structured list | integration (wrangler shell-out mocked) | `npm run test:src` | ❌ Wave 0: `tests/unit/ingest-reports.test.js` |
| ING-02 | Reuses `review-reports.mjs` pure fns | unit | `npm run test:src` | ❌ Wave 0 |
| ING-03 | Idempotent second run (no duplicate Issues) | unit (mock gh client) | `npm run test:src` | ❌ Wave 0 |
| ING-04 | `_review.status` write-back | unit (mock wrangler) | `npm run test:src` | ❌ Wave 0 |
| TRI-01 | Classification into 6-class enum | unit | `npm run test:src` | ❌ Wave 0: `tests/unit/report-classifier.test.js` |
| TRI-02 | Each named rule pinned by Vitest test with real `buildReportPayload()` input | unit | `npm run test:src` | ❌ Wave 0 |
| TRI-03 | Auto-promote signals fire correctly | unit | `npm run test:src` | ❌ Wave 0 (part of TRI-01/02) |
| TRI-04 | Patent cross-check against golden + quarantine corpora | unit | `npm run test:src` | ❌ Wave 0 (golden/quarantine data files exist) |
| TRI-05 | `tool_not_working` / pdf error → infrastructure (not promoted) | unit | `npm run test:src` | ❌ Wave 0 |
| TRI-06 | Post-fix suppression (merged PR check) | unit (mock gh client) | `npm run test:src` | ❌ Wave 0 |
| TRI-07 | Triage artifact JSON emitted with correct shape | unit | `npm run test:src` | ❌ Wave 0 |
| PROMO-01 | Issue body has `<!-- kv-key -->` pointer, human-readable | unit | `npm run test:src` | ❌ Wave 0 |
| PROMO-02 | `promote` subcommand bypasses status filter | unit | `npm run test:src` | ❌ Wave 0 |
| PROMO-03 | Manual promote records `promotion_source: 'manual'` | unit | `npm run test:src` | ❌ Wave 0 |
| PROMO-04 | `workflow_dispatch:` only in YAML (no cron) | static grep | `npm run test:src` | ❌ Wave 0: `tests/unit/v61-ingest-reports-yaml.test.js` |
| STATE.md `wrangler --remote` | All wrangler kv calls in triage layer include `--remote` | static grep | `npm run test:src` | ❌ Wave 0: `tests/unit/ingest-reports-wrangler-guard.test.js` |

### Sampling Rate

- **Per task commit:** `npm run test:src` (Vitest unit suite only; fast)
- **Per wave merge:** `npm test` (full suite: build + vitest + lint + web-ext lint)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/report-classifier.test.js` — covers TRI-01, TRI-02, TRI-03, TRI-04, TRI-05
- [ ] `tests/unit/ingest-reports.test.js` — covers ING-01/02/03/04, PROMO-02/03
- [ ] `tests/unit/gh-client.test.js` — covers PROMO-01, TRI-06, ING-03 dedup logic
- [ ] `tests/unit/ingest-reports-wrangler-guard.test.js` — covers STATE.md `wrangler --remote` invariant
- [ ] `tests/unit/v61-ingest-reports-yaml.test.js` — covers PROMO-04 (`workflow_dispatch:` only)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | KV access via wrangler CLI auth (already established); no new auth surface |
| V3 Session Management | No | Stateless CLI script |
| V4 Access Control | No | No user-facing routes; maintainer-only tool |
| V5 Input Validation | Yes | `note`, `selectionText`, `errorLog` from KV must NOT be shell-interpolated; `patentNumber` must be validated before gh CLI interpolation |
| V6 Cryptography | No | No new crypto; fingerprint comes from KV record (pre-computed by Worker) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via `note` or `selectionText` in gh CLI args | Tampering | Use `--body-file -` with stdin for Issue body (never interpolate user fields into shell strings); `execFileSync` for any shell-out where user data must be passed as args |
| Shell injection via `patentNumber` in gh search query | Tampering | Validate `patentNumber` matches alphanumeric pattern before use in queries; use `replaceAll("'", "'\\''")` escape for single-quoted shell context |
| `selectionText` leaked in triage artifact or Issue body | Information disclosure | Issue body: omit `selectionText` if absent (D-10); Artifact: include only `fingerprint`, `category`, `classification`, `rationale` — NOT `selectionText`, `xpathNode`, `note` |
| `selectionText`/`note` logged to GitHub Actions stdout | Information disclosure | Redact user-controlled fields from any `console.log` output; log only `fingerprint`, `category`, `patentNumber`, `classification` |

**Phase 11 is NOT a prompt-injection attack surface** (no LLM calls). Prompt-injection defense (FIX-03, `<report_data>` envelope) is Phase 12 scope only.

---

## Sources

### Primary (HIGH confidence — directly verified from production code)

- `scripts/review-reports.mjs` — Full source read; all exported pure fns confirmed; I/O fns confirmed as module-private; `WORKER_DIR`, `wrangler()`, `listReportKeys()`, `getRecord()`, `loadReports()`, `writeStatus()` implementations verified; TTL-preserving write pattern confirmed; `REVIEW_STATES` vocabulary confirmed
- `scripts/e2e-report-issue.mjs` — Full source read; `makeRealGhClient()` implementation verified; `createIssueWithLabels()`, `listOpenWithSearch()`, `findMatchingIssue()`, `addLabel()` patterns confirmed; `--paginate` and `--body-file -` patterns verified; E2E-specific functions identified and excluded from lifting
- `src/shared/report-payload-builder.js` — Full source read; exact output field set confirmed; `duplicate_count` confirmed absent from builder output; `selectionText` conditional-key behavior confirmed; `buildReportPayload()` input/output shape documented
- `src/shared/constants.js` — `REPORT_CATEGORIES` frozen array confirmed: `['inaccurate_citation', 'no_match', 'tool_not_working', 'other']`
- `tests/golden/baseline.json` — 76 keys confirmed; key format `US{number}-{suffix}` confirmed
- `tests/e2e/test-cases-quarantine.js` — 2 cases confirmed; `TEST_CASES_QUARANTINE` export confirmed; case id format matches golden pattern
- `tests/e2e/lib/fix-prompt-builder.js` — `REPORT_FIX_SCAFFOLD` stub location confirmed; stub is a bare string export; purity invariant and ESLint guard confirmed; PROMPT_SCAFFOLDS registry has exactly 7 keys (confirmed for Phase 13 sha256 pin context)
- `.planning/phases/11-triage-layer/11-CONTEXT.md` — All 12 decisions verified
- `.planning/REQUIREMENTS.md` — All 15 Phase 11 requirements (ING-01..04, TRI-01..07, PROMO-01..04) verified
- `.planning/STATE.md` — Permanent invariants table confirmed; `wrangler --remote` grep assertion listed
- `.planning/ROADMAP.md` — Phase 11 success criteria (5) confirmed
- `.planning/research/PITFALLS.md` — All 8 pitfalls read; Pitfall 1 (triage false-positive), Pitfall 8 (duplicate/feedback-loop) are Phase 11-primary
- `.planning/research/ARCHITECTURE.md` — Data flow diagram read; Stage 2 (Triage) confirmed; Issue body shape from §Stage 3 used
- `tests/unit/review-reports.test.js` — Existing test coverage of pure fns confirmed; I/O fns not tested there
- `tests/unit/e2e-report-issue.test.js` — Existing test coverage of e2e-report-issue.mjs confirmed; tests pure fns only
- `vitest.config.js` — `environment: 'node'`, `include: tests/**/*.test.js'`, `fileParallelism: false` confirmed
- `package.json` scripts — `test:src` = `vitest run`, `test` = full suite (build + test:src + test:chrome + test:firefox + lint + test:lint) confirmed
- `.github/workflows/e2e-ingest-llm-report.yml` — `actions/upload-artifact@v4` pattern with `retention-days: 14` confirmed; Phase 11 uses `retention-days: 90`
- `scripts/auto-fix-promote.mjs` — `assertTripleGate()` reads `sourceIssueLabels.includes('triage')`; Leg 3 currently hard-wired to `triage` label only (Phase 13 will extend to accept `report-fix-candidate`)
- `worker/wrangler.toml` — `BUG_REPORTS` namespace ID `cefe2733c0074fe2a28a49ff536de105` confirmed
- `tests/unit/eslint-sdk-guard.test.js` — Static grep test pattern (readFileSync + grep source) confirmed as the model for `wrangler --remote` assertion

### Secondary (MEDIUM confidence — derived from patterns, planning docs)

- Post-fix suppression `gh pr list` + `gh issue list` query shape: derived from existing `gh` CLI usage in `e2e-report-issue.mjs` and `scripts/audit-bypass-merges.mjs` (`--paginate` pattern, `--json` fields); specific flags for `--state merged` and `--search in:body` are `[ASSUMED]` syntax based on gh CLI documentation conventions
- `actions/upload-artifact@v4` `retention-days: 90` for triage report: D-11 says "~90-day retention"; the exact field is confirmed in `e2e-ingest-llm-report.yml` (uses 14 days); 90 days is the default documented for `actions/upload-artifact@v4`

---

## Metadata

**Confidence breakdown:**
- KV I/O reuse mechanics: HIGH — production code verified line-by-line
- gh plumbing extraction: HIGH — production code verified; dedup mechanics clear
- Classifier structure/rule names: MEDIUM — design derived from REQUIREMENTS.md + CONTEXT.md + PITFALLS.md; names are Claude's discretion
- Vitest pinning pattern: HIGH — existing test files confirm the pattern
- Post-fix suppression gh query syntax: MEDIUM — gh CLI pattern confirmed from existing usage; exact `--search in:body` flag is standard gh CLI but not tested in this codebase

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable domain; no external API changes expected)

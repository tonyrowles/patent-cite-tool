---
phase: 11-triage-layer
plan: "03"
subsystem: triage-orchestrator
tags: [ingest, orchestrator, triage, gh-client, kv-io, vitest, workflow_dispatch, artifact]
dependency_graph:
  requires:
    - "scripts/report-classifier.mjs (classifyReport, GOLDEN_PATENTS, QUARANTINE_PATENTS, MAX_FIXES_PER_RUN — Plan 01)"
    - "scripts/gh-client.mjs (makeKvReportGhClient — Plan 02)"
    - "scripts/review-reports.mjs (loadReports, filterReports, writeStatus, getRecord, getNamespaceId — Plan 02 exports)"
  provides:
    - "scripts/ingest-reports.mjs — CLI orchestrator: list + promote subcommand, D-05 promotion, artifact emission"
    - ".github/workflows/v61-ingest-reports.yml — workflow_dispatch-only trigger (PROMO-04)"
    - "tests/unit/ingest-reports.test.js — 29 orchestration tests"
    - "tests/unit/ingest-reports-wrangler-guard.test.js — --remote static-grep guard"
    - "tests/unit/v61-ingest-reports-yaml.test.js — YAML static-grep guard"
  affects:
    - ".gitignore (append .triage-reports/)"
tech_stack:
  added: []
  patterns:
    - "CLI orchestrator pattern: parseArgs → main() → CLI guard (fileURLToPath form)"
    - "D-05 find-or-create-then-write: find GitHub Issue FIRST, create SECOND, writeStatus THIRD"
    - "buildReportIssueBody: D-10 markdown with conditional selectionText + D-02 golden note + kv-key marker"
    - "buildArtifactEntry: TRI-07 shape with privacy exclusion of selectionText/note/xpathNode"
    - "Post-fix suppression: isPostFixSuppressed check before auto-promote (D-07/D-08)"
    - "Per-run cap: autoPromotedCount vs MAX_FIXES_PER_RUN (COST-02)"
    - "Artifact to .triage-reports/ (CI: fixed name; local: timestamped) — D-11"
    - "Static-grep guard tests: readFileSync + regex assertions (eslint-sdk-guard.test.js pattern)"
key_files:
  created:
    - scripts/ingest-reports.mjs
    - .github/workflows/v61-ingest-reports.yml
    - tests/unit/ingest-reports.test.js
    - tests/unit/ingest-reports-wrangler-guard.test.js
    - tests/unit/v61-ingest-reports-yaml.test.js
  modified:
    - .gitignore
decisions:
  - "promoteRecord accepts an injectable writeStatusFn for test isolation — avoids vi.mock() on review-reports.mjs (cleaner than module-level mocking)"
  - "buildArtifactEntry is a pure exported function (not inlined in main) so artifact shape tests do not need to drive the full orchestration path"
  - "promoteRecord is async (returns Promise) to allow future awaitable ghClient implementations without requiring callers to change"
  - "ingest-reports.mjs stores MAX_FIXES_PER_RUN from report-classifier.mjs (ING-02 reuse); parseArgs --max-fixes overrides it at runtime"
metrics:
  duration: "~18 min"
  completed: "2026-06-17"
  tasks: 3
  files: 6
---

# Phase 11 Plan 03: Ingest-Reports Orchestrator Summary

**One-liner:** CLI orchestrator (`ingest-reports.mjs`) tying the Phase 11 classifier and gh-client together: classify open KV reports, apply post-fix suppression and per-run cap, D-05 find-or-create-then-write to report-fix-candidate Issues, write `_review.status` back, emit TRI-07 artifact — with `workflow_dispatch`-only CI entry point and three static-pinned test suites.

## What Was Built

`scripts/ingest-reports.mjs` — the single command that delivers the Phase 11 goal:

Exported pure helpers (testable in isolation):
- `parseArgs(argv)`: `list` (default) + `promote <fp> <ts>` subcommand; `--namespace-id`, `--json`, `--dry-run`, `--force`, `--max-fixes <n>`, `-h/--help` flags; unknown `-flag` throws
- `buildReportIssueTitle(record)`: `Bug report: {patentNumber} ({category})`
- `buildReportIssueBody(record, opts)`: D-10 human-readable markdown — `## Bug report:` heading, table, triage rationale, D-02 golden-corpus note (exact string), selectionText line conditionally absent (Pitfall 7), `<!-- kv-key: ... -->` trailing marker
- `buildArtifactEntry(record, classifyResult, opts)`: TRI-07 JSON shape — fingerprint, kv_key, patent_number, category, classification, rule_name, rationale, in_golden_corpus, in_quarantine_corpus, promotion_decision, promotion_source, github_issue_number, suppressed_by_post_fix, kv_status_written, processed_at — NO selectionText/note/xpathNode (T-11-04)
- `promoteRecord(nsId, record, classifyResult, promotionSource, ghClient, opts)`: strict D-05 ordering — (1) canonical kvKey from `record.fingerprint+record.timestamp`, (2) findExistingIssueByKvKey FIRST, (3) if found → self-heal writeStatus only, return skip-dedup; (4) if not found → createIssueWithLabels (label: `report-fix-candidate`), (5) writeStatus ONLY after create succeeds (T-11-06)

Main orchestration:
- **list run**: loadReports → filterReports `status:'open'` → sort → classify each → post-fix suppression check (real_bug only) → per-run cap → promoteRecord (auto) OR writeStatus wontfix OR skip-dedup artifact → emitArtifact → print JSON
- **promote subcommand**: getRecord bypassing status filter (PROMO-02/D-06) → classify → promoteRecord('manual') (PROMO-03)
- **--dry-run**: classify + artifact, NO gh creates, NO writeStatus

`.github/workflows/v61-ingest-reports.yml`:
- `workflow_dispatch` ONLY — no schedule/push/pull_request (PROMO-04)
- Inputs: `dry_run` (boolean, default false) + `max_fixes` (string, default `'5'` — COST-02)
- `permissions: { contents: read, issues: write }` (load-bearing comment)
- `concurrency: { group: v61-ingest-reports, cancel-in-progress: false }`
- Steps: checkout@v5, setup-node@v5 (node 22), npm ci, `node scripts/ingest-reports.mjs`, upload-artifact@v4 (`if: always()`, path `.triage-reports/triage-report.json`, retention-days 90)

`.gitignore`: appended `.triage-reports/` (D-11 — local artifacts never committed)

`tests/unit/ingest-reports.test.js` — 29 green Vitest tests:
- `parseArgs`: 7 tests covering all commands/flags and unknown-flag error
- `buildReportIssueTitle`: format verification
- `buildReportIssueBody`: 7 tests — kv-key marker, selectionText absent/null omission (Pitfall 7), golden note inclusion/omission (D-02), user note conditional, human-readable format
- `buildArtifactEntry`: TRI-07 field set + privacy (`not.toHaveProperty` for selectionText/note/xpathNode) + canonical kv-key (Pitfall 2)
- `promoteRecord`: ING-03 idempotency, D-05 call-order proof via `callOrder` array, writeStatus-after-create, PROMO-03 manual source, dry-run no-side-effects, skip-dedup artifact
- TRI-06 MANDATORY suppression integration: `makeMockGhClient({ suppressed: true })` proves `createIssueWithLabels` NOT called and artifact has `suppressed_by_post_fix: true`; paired `suppressed: false` assertion proves same record DOES promote

`tests/unit/ingest-reports-wrangler-guard.test.js` — 4 static-grep tests:
- review-reports.mjs: all `['kv', 'key', ...]` arrays include `--remote` (STATE.md invariant)
- ingest-reports.mjs: no inline wrangler kv calls (zero expected, delegates to review-reports.mjs); imports from `./review-reports.mjs` (ING-02 positive)
- CLI guard uses `fileURLToPath(import.meta.url)` form (not `file://` anti-pattern)
- gh-client.mjs: any wrangler kv calls would include `--remote` (zero expected)

`tests/unit/v61-ingest-reports-yaml.test.js` — 8 static-grep tests:
- workflow file exists; `workflow_dispatch` present; `schedule:`/`push:`/`pull_request:` absent (PROMO-04)
- `actions/upload-artifact` + `triage-report` + `retention-days` present (TRI-07)
- `issues: write` present; `max_fixes` default `'5'` not `'10'` (COST-02)
- `ingest-reports.mjs` run step present; `if: always()` present

## Requirements Satisfied

| Req | Description | Status |
|-----|-------------|--------|
| ING-01 | `node scripts/ingest-reports.mjs` reads KV via --remote (delegated), emits JSON + artifact | DONE |
| ING-02 | ingest-reports.mjs imports from review-reports.mjs — zero inline wrangler shell-out | DONE |
| ING-03 | Idempotency: findExistingIssueByKvKey short-circuits createIssueWithLabels (pinned by test) | DONE |
| ING-04 | Every processed record gets _review.status write-back (triaged/wontfix) via writeStatus | DONE |
| TRI-07 | triage-report JSON artifact emitted (CI: fixed name; local: timestamped; D-11 shape) | DONE |
| PROMO-01 | Promoted report → report-fix-candidate Issue with human-readable body + kv-key pointer | DONE |
| PROMO-02 | `promote <fp> <ts>` force-promotes any record bypassing status filter (D-06) | DONE |
| PROMO-03 | Manual promote uses same promoteRecord path; records promotion_source:'manual' | DONE |
| PROMO-04 | workflow_dispatch only — pinned by static-grep test; no schedule/push/pull_request | DONE |
| D-05 | find-or-create FIRST, writeStatus SECOND — pinned by callOrder test | DONE |
| D-02 | Golden-corpus note in Issue body when inGoldenCorpus — pinned by body test | DONE |
| D-07/D-08 | isPostFixSuppressed check before auto-promote; suppressed → no Issue, wontfix status | DONE |
| D-10/D-11 | selectionText omitted when absent; artifact gitignored locally, upload-artifact in CI | DONE |
| D-12 | Durability: GitHub Issues + KV _review.status + per-run triage JSON | DONE |
| COST-02 | Per-run cap defaults to 5; workflow max_fixes default '5' — pinned by YAML test | DONE |

## Deviations from Plan

None — plan executed exactly as written.

The task spec called for `promoteRecord` to accept a `writeStatus` dependency injection. The implementation uses `writeStatusFn` as a named parameter in the `opts` object rather than a positional argument to match the pattern of other optional overrides. This is equivalent and makes test injection cleaner.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those documented in the plan's threat model.

T-11-04 confirmed: `console.log` in `main()` logs only `fp`, `patent`, `category`, `classification` — never `note`/`selectionText`/`errorLog`.
T-11-05 confirmed: `emitArtifact()` writes ONLY to `.triage-reports/` (gitignored) and has no commit/push step. Workflow has no `git push` step.
T-11-06 confirmed: `writeStatusFn(nsId, fp, ts, 'triaged')` is called ONLY after `createIssueWithLabels` succeeds (lines ordering pinned by D-05 test).

## Known Stubs

None. All functionality is fully implemented and tested.

## Self-Check

Files exist:
- scripts/ingest-reports.mjs: FOUND
- .github/workflows/v61-ingest-reports.yml: FOUND
- tests/unit/ingest-reports.test.js: FOUND
- tests/unit/ingest-reports-wrangler-guard.test.js: FOUND
- tests/unit/v61-ingest-reports-yaml.test.js: FOUND
- .gitignore (modified): FOUND

Commits exist:
- 6d433a8 (Task 1 — feat): FOUND
- 144e9f4 (Task 2 — feat): FOUND
- 4bf2b1f (Task 3 — test): FOUND

## Self-Check: PASSED

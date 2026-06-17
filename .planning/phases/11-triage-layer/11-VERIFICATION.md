---
phase: 11-triage-layer
verified: 2026-06-17T14:00:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
human_verification: []
---

# Phase 11: Triage Layer Verification Report

**Phase Goal:** A maintainer can run one command to read, classify, and promote real bug reports from the `BUG_REPORTS` KV channel into candidate GitHub Issues — with every heuristic decision pinned by a Vitest test and the full classifier idempotent on re-run.
**Verified:** 2026-06-17T14:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `node scripts/ingest-reports.mjs` reads BUG_REPORTS KV with --remote, prints structured JSON, emits triage-report artifact | VERIFIED | `ingest-reports.mjs` imports `loadReports/filterReports` from `review-reports.mjs` (which carries `--remote` on all KV calls); `emitArtifact()` writes to `.triage-reports/`; `process.stdout.write(JSON.stringify(artifactEntries...))` at L472. All wrangler guard test confirms delegation. |
| SC-2 | Auto-promote signals (green+inaccurate, dups>=3, quarantine) → report-fix-candidate Issue with `<!-- kv-key -->` pointer and human-readable body | VERIFIED | `classifyReport()` rules 3/4/5 cover all three signals. `buildReportIssueBody()` produces `## Bug report:` markdown + table + `<!-- kv-key: ${kvKey} -->` trailing marker. Label `report-fix-candidate` wired in `promoteRecord` L296. |
| SC-3 | Second run on same report set does NOT create duplicate Issues — `_review.status` write-back makes re-runs safe | VERIFIED | `findExistingIssueByKvKey` called first in D-05 ordering; if found, skips `createIssueWithLabels` (idempotency test passes: `not.toHaveBeenCalled()`). KV status still written for self-heal. |
| SC-4 | `node scripts/ingest-reports.mjs promote <fp> <ts>` manually promotes any report; triage artifact records `promotion_source: 'manual'` | VERIFIED | `promote` subcommand fetches record bypassing status filter (L340), calls `promoteRecord(..., 'manual', ...)`. PROMO-03 test asserts `entry.promotion_source === 'manual'`. |
| SC-5 | `tool_not_working`/`pdfParseStatus:error` → infrastructure, no Issue created | VERIFIED | Rules 1/2 in `classifyReport()`. `main()` writes `wontfix` for `infrastructure` (L427-438), never calls `createIssueWithLabels`. Infrastructure Vitest tests green. |

### Must-Have Truths (PLAN Frontmatter — all 3 plans)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TRI-01: classifyReport() returns CLASSIFICATIONS enum value using heuristic field checks only | VERIFIED | 8-rule first-match engine in `report-classifier.mjs:87-151`. No I/O, no LLM. `user_error` documented as heuristically unreachable (comment at L29-32). 17 tests pass. |
| 2 | TRI-02: every named rule has a dedicated Vitest test using real buildReportPayload() output | VERIFIED | `report-classifier.test.js` — 8 describe blocks (one per rule). kvRecord() factory calls `buildReportPayload()` then spreads server-side fields. `grep -c "buildReportPayload"` ≥ 2. All 17 tests pass. |
| 3 | TRI-03: green+inaccurate OR dups>=threshold OR quarantine → real_bug | VERIFIED | Rules 3, 4, 5 in classifier. 3 separate test describe blocks confirm each signal. |
| 4 | TRI-04: GOLDEN_PATENTS and QUARANTINE_PATENTS Sets loaded at module load | VERIFIED | `createRequire` for baseline.json (23 patents), static import for quarantine (1 patent). Runtime check: `OK 23 1`. |
| 5 | TRI-05: tool_not_working/pdfParseStatus:error → infrastructure | VERIFIED | Rules 1/2 with priority-order proof tests (tool_not_working with duplicate_count:99 → infrastructure). |
| 6 | TRI-06: isPostFixSuppressed() with mandatory isWithinCutoff Vitest pin | VERIFIED | `isWithinCutoff` exported from gh-client.mjs. 7 isWithinCutoff tests (old entry→false, recent→true, null→false, boundary). `isPostFixSuppressed` calls both PR and Issue gh searches. |
| 7 | TRI-07: triage-report JSON artifact with one entry per report | VERIFIED | `buildArtifactEntry()` produces TRI-07 shape (15 fields). `emitArtifact()` in `finally` block (WR-04 fix). CI → fixed name; local → timestamped. YAML test confirms upload-artifact present. |
| 8 | ING-01: `node scripts/ingest-reports.mjs` reads KV and emits JSON | VERIFIED | `loadReports(nsId)` delegated. `process.stdout.write(JSON.stringify...)` at L472. |
| 9 | ING-02: ingest-reports.mjs imports from review-reports.mjs — no inline wrangler shell-out | VERIFIED | `grep -cE "execSync|execFileSync|wrangler\\(" scripts/ingest-reports.mjs` = 0 (only prose references in comments). Wrangler guard test asserts ING-02 delegation positive. |
| 10 | ING-03: second run creates no duplicate Issue | VERIFIED | D-05 idempotency test: `findExistingIssueByKvKey` returns existing → `createIssueWithLabels.not.toHaveBeenCalled()`. |
| 11 | ING-04: every processed record gets _review.status write-back | VERIFIED | promoteRecord writes `triaged` after create; suppressed → `wontfix`; noise/infrastructure → `wontfix`. D-05 ordering test confirms write occurs after create. |
| 12 | PROMO-01: promoted report → report-fix-candidate Issue with kv-key pointer and human-readable body | VERIFIED | `buildReportIssueBody()` — `## Bug report:` heading, markdown table, `<!-- kv-key: ${kvKey} -->` marker. Label: `['report-fix-candidate']`. |
| 13 | PROMO-02: `promote <fp> <ts>` bypasses status==open filter | VERIFIED | `args.command === 'promote'` branch calls `getRecord(nsId, 'report:${fp}:${ts}')` directly, not filtered by `filterReports`. |
| 14 | PROMO-03: manual promote uses same promoteRecord path; artifact records promotion_source:'manual' | VERIFIED | `promoteRecord(..., 'manual', ...)` wired at L351. PROMO-03 test asserts `entry.promotion_source === 'manual'`. |
| 15 | PROMO-04: workflow_dispatch-only trigger | VERIFIED | v61-ingest-reports.yml has only `workflow_dispatch:`. YAML guard test asserts no `schedule:`/`push:`/`pull_request:`. |
| 16 | Idempotency / no-duplicate-Issues criterion (full classifier) | VERIFIED | D-05 find-before-create ordering enforced and tested via `callOrder` array. `findExistingIssueByKvKey` called twice (open + closed). |

**Score:** 16/16 truths verified

---

### Code Review Fix Verification (CR-01, CR-02, CR-03)

The code review identified 3 critical issues and 6 warnings. All were fixed in `fix(11):` commits. Direct evidence of the 3 critical fixes:

**CR-01 — Dedup-marker neutralisation (fix commit 6378473):**
- `scripts/ingest-reports.mjs:159`: `const safe = (s) => String(s).replaceAll('<!--', '< !--');`
- Applied to `returnedCitation`, `selectionText`, and `note` before interpolation into Issue body
- A forged `<!-- kv-key: victimKey -->` in `note` becomes `< !-- kv-key: victimKey -->` — cannot match `body.includes(marker)` check
- Pinned by test: `CR-01: forged <!-- kv-key: --> in note is neutralised — cannot poison dedup` (passes)

**CR-02 — DRY_RUN env var honored (fix commit 64903b8):**
- `scripts/ingest-reports.mjs:321`: `args.dryRun = args.dryRun || process.env.DRY_RUN === 'true';`
- Workflow sets `DRY_RUN: ${{ inputs.dry_run }}` (env section line 46)
- When maintainer selects "Dry run" in GitHub UI, `inputs.dry_run = true` → env `DRY_RUN = "true"` → script reads `=== 'true'` → dry-run activated
- Pinned by test: `CR-02: DRY_RUN env var activates dry-run mode` (passes)

**CR-03 — Async main awaited (fix commit b9a895c):**
- `scripts/ingest-reports.mjs:494-498`:
  ```js
  if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main(process.argv.slice(2)).catch((err) => {
      console.error(`✖ ${err.message}`);
      process.exit(1);
    });
  }
  ```
- Async failures now surface as non-zero exit. Artifact emitted in `finally` block (L466-469, WR-04 co-fix).

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/report-classifier.mjs` | Pure heuristic classifier + corpus Sets + named rule constants | VERIFIED | 151 lines, exports classifyReport + 8 RULE_* + CLASSIFICATIONS + corpus Sets + 3 thresholds |
| `tests/unit/report-classifier.test.js` | One named test per rule using buildReportPayload() | VERIFIED | 344 lines, 17 tests, all pass |
| `scripts/gh-client.mjs` | makeKvReportGhClient factory + isWithinCutoff | VERIFIED | 209 lines, factory with 5 methods + exported isWithinCutoff |
| `scripts/review-reports.mjs` | Additive export of KV I/O + REVIEW_STATES | VERIFIED | 5 symbols exported: listReportKeys, getRecord, loadReports, writeStatus, REVIEW_STATES |
| `tests/unit/gh-client.test.js` | Marker-matching, date-cutoff, factory shape | VERIFIED | 257 lines, 19 tests, all pass |
| `scripts/ingest-reports.mjs` | CLI orchestrator: list + promote, D-05 promotion, body builder, artifact | VERIFIED | 499 lines, imports from review-reports.mjs + report-classifier.mjs + gh-client.mjs, no inline wrangler |
| `.github/workflows/v61-ingest-reports.yml` | workflow_dispatch-only + upload-artifact | VERIFIED | workflow_dispatch only, max_fixes default '5', upload-artifact with if:always(), retention-days:90 |
| `tests/unit/ingest-reports.test.js` | Orchestration tests: parseArgs, body shape, idempotency, suppress, artifact | VERIFIED | 489 lines, 29 tests, all pass |
| `tests/unit/ingest-reports-wrangler-guard.test.js` | Static-grep: --remote invariant, ING-02 delegation | VERIFIED | 4 tests, all pass |
| `tests/unit/v61-ingest-reports-yaml.test.js` | Static-grep: workflow_dispatch-only, upload-artifact, COST-02 | VERIFIED | 8 tests, all pass |
| `.gitignore` (modified) | `.triage-reports/` appended | VERIFIED | `grep -q ".triage-reports/" .gitignore` → OK |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/unit/report-classifier.test.js` | `src/shared/report-payload-builder.js` | `import buildReportPayload` | VERIFIED | kvRecord() factory calls `buildReportPayload()` — Pitfall 1 mitigated |
| `scripts/report-classifier.mjs` | `tests/golden/baseline.json` + `tests/e2e/test-cases-quarantine.js` | `createRequire` + static import | VERIFIED | GOLDEN_PATENTS.size=23, QUARANTINE_PATENTS.size=1 confirmed by runtime check |
| `scripts/e2e-report-issue.mjs` | `scripts/gh-client.mjs` | `import + re-export makeRealGhClient` | VERIFIED | `makeRealGhClient` importable from e2e-report-issue.mjs — runtime check passes |
| `scripts/ingest-reports.mjs` | `scripts/review-reports.mjs` | `import loadReports/filterReports/writeStatus/getNamespaceId` | VERIFIED | `grep "from './review-reports.mjs'"` present; no inline wrangler kv |
| `scripts/ingest-reports.mjs` | `scripts/report-classifier.mjs` | `import classifyReport + GOLDEN_PATENTS/QUARANTINE_PATENTS` | VERIFIED | L39-45 confirmed |
| `scripts/ingest-reports.mjs` | `scripts/gh-client.mjs` | `import makeKvReportGhClient` | VERIFIED | L47 confirmed |
| `.github/workflows/v61-ingest-reports.yml` | `scripts/ingest-reports.mjs` | `node scripts/ingest-reports.mjs` run step | VERIFIED | L61 in workflow YAML |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/ingest-reports.mjs` | `allReports` / `openReports` | `loadReports(nsId)` → delegated to `review-reports.mjs` → `wrangler kv key list --remote` + per-key `wrangler kv key get --remote` | Yes — live KV reads via wrangler --remote | FLOWING |
| `scripts/ingest-reports.mjs` | `artifactEntries[]` | `buildArtifactEntry()` fed from `classifyReport()` results | Yes — populated in loop over real KV records | FLOWING |
| `scripts/gh-client.mjs` | Issue dedup | `listWithSearch(kvKey, 'open')` + `listWithSearch(kvKey, 'closed')` → `gh issue list --search` | Yes — live gh CLI calls | FLOWING (mocked in unit tests appropriately) |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Module import + corpus loading | `node -e "import('./scripts/report-classifier.mjs').then(m => { ... })"` | `OK 23 1` (golden=23, quarantine=1) | PASS |
| Classifier correctness (3 rules) | `node -e "import('./scripts/report-classifier.mjs').then(m => { ... })"` | green+inaccurate→real_bug, tool_not_working→infrastructure, dups:1→duplicate, MAX_FIXES_PER_RUN===5 | PASS |
| ingest-reports.mjs import | `node -e "import('./scripts/ingest-reports.mjs').then(m => { ... })"` | parseArgs works, body contains kv-key marker + golden note, omits Selected text | PASS |
| Full test suite | `npm run test:src` | 95 test files, 1671 passed, 5 skipped, 0 failed | PASS |

---

### Probe Execution

No probes declared or applicable for this phase (not a migration/tooling phase with probe scripts).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ING-01 | 11-03 | Single command reads KV and emits structured list | SATISFIED | `loadReports` + `process.stdout.write(JSON.stringify(...))` |
| ING-02 | 11-02, 11-03 | Reuses review-reports.mjs KV I/O, no reimplementation | SATISFIED | Import delegation confirmed, wrangler guard test passes |
| ING-03 | 11-02, 11-03 | Re-running is idempotent — no re-promotion | SATISFIED | D-05 idempotency test: `createIssueWithLabels.not.toHaveBeenCalled()` when issue exists |
| ING-04 | 11-02, 11-03 | _review.status written per processed record | SATISFIED | `writeStatus` called for triaged/wontfix outcomes; D-05 ordering test |
| TRI-01 | 11-01 | classifyReport returns CLASSIFICATIONS enum value, heuristic only | SATISFIED | 8-rule engine, no LLM, user_error documented as unreachable |
| TRI-02 | 11-01 | Every named rule pinned by Vitest test using real buildReportPayload() | SATISFIED | 8 describe blocks, kvRecord() factory, 17 tests |
| TRI-03 | 11-01 | Auto-promote signals: green+inaccurate, dups>=3, quarantine | SATISFIED | Rules 3/4/5 in classifier, 3 test describe blocks |
| TRI-04 | 11-01 | Golden + quarantine corpora loaded via pure file reads | SATISFIED | createRequire + static import, runtime sizes confirmed |
| TRI-05 | 11-01 | tool_not_working / pdfParseStatus:error → infrastructure | SATISFIED | Rules 1/2, priority order tested |
| TRI-06 | 11-02, 11-03 | Post-fix suppression with mandatory isWithinCutoff Vitest pin | SATISFIED | 7 isWithinCutoff tests, suppression integration test with `suppressed:true` mock |
| TRI-07 | 11-03 | Per-run triage-report JSON artifact with one entry per report | SATISFIED | buildArtifactEntry 15-field shape, emitArtifact in finally, YAML upload-artifact |
| PROMO-01 | 11-02, 11-03 | Promoted → report-fix-candidate Issue with kv-key pointer + human-readable body | SATISFIED | buildReportIssueBody produces markdown, label wired, marker present |
| PROMO-02 | 11-03 | `promote <fp> <ts>` force-promotes any record bypassing status filter | SATISFIED | `promote` subcommand fetches by canonical key, no filterReports call |
| PROMO-03 | 11-03 | Manual promote same path, promotion_source:'manual' | SATISFIED | PROMO-03 test passes |
| PROMO-04 | 11-03 | workflow_dispatch-only entry point | SATISFIED | YAML + static-grep guard test passes |

All 15 phase-11 requirements (ING-01..04, TRI-01..07, PROMO-01..04) satisfied.

**Orphaned requirements check:** No IDs mapped to Phase 11 in REQUIREMENTS.md that are absent from plan frontmatter. The traceability table lists all 15 as "Phase 11 / Pending" (pending = not yet marked complete in the requirements file; all confirmed delivered).

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TBD/FIXME/XXX markers in any phase-11 file. No stubs or placeholder returns. No unreachable dead code. No `execSync`/`execFileSync` in `ingest-reports.mjs` (beyond comment prose). `report-classifier.mjs` is clean of all I/O beyond corpus reads.

The `reviewStatus` import at `ingest-reports.mjs:36` is unused (IN-02 from code review — info-level). Not a blocker; the import has no behavioral impact.

---

### Human Verification Required

None. All observable truths are mechanically verifiable via tests and static analysis.

The command `node scripts/ingest-reports.mjs` requires live KV access (Cloudflare `--remote`) and a real GitHub token to exercise the full promotion path in production. This is explicitly deferred to Phase 14 UAT (UAT-01/UAT-02). The unit and static-grep test coverage is sufficient for phase completion.

---

### Gaps Summary

No gaps found. All 16 must-have truths verified, all 15 requirements satisfied, all artifacts exist and are substantive and wired, all 3 critical code-review fixes confirmed present in source.

---

_Verified: 2026-06-17T14:00:00Z_
_Verifier: Claude (gsd-verifier)_

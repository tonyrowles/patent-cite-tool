---
phase: 37-weekly-analytics-digest
plan: "02"
subsystem: weekly-digest
tags: [digest, aggregation, gh-shellout, iso-week, mock-gh, vitest]
dependency_graph:
  requires: [37-01]
  provides: [weekly-digest-script, digest-test-suite, digest-fixture]
  affects: [package.json, tests/e2e/README.md]
tech_stack:
  added: []
  patterns:
    - injected-deps CLI (ghClient, now, publishMode, repo, ledgerPath)
    - gh shellout (execSync) with mock-gh bash shim in tests
    - ISO-week Thursday-shift algorithm (zero-dep inline)
    - fs.existsSync-first ledger guard (graceful absent)
    - fixed-order line-array markdown render (≤50-line guard)
    - GraphQL two-step createDiscussion (dormant, fully tested)
key_files:
  created:
    - scripts/weekly-digest.mjs
    - tests/e2e/fixtures/phase37-digest-issues.json
    - tests/e2e/scripts/e2e-weekly-digest.test.js
  modified:
    - package.json
    - tests/e2e/README.md
decisions:
  - "Issue fallback (ACTIVE) via gh issue create --label e2e-digest --body-file - (D-05)"
  - "GraphQL createDiscussion DORMANT but fully implemented + tested (D-08)"
  - "DISCUSSION_CATEGORY = 'General' constant (Open Question 1 resolution)"
  - "Test assertion fix: Math.round(12.5/100*100) = 13% not 12%"
metrics:
  duration_seconds: 292
  completed: "2026-05-28"
  tasks_completed: 3
  files_created_or_modified: 5
---

# Phase 37 Plan 02: Weekly Digest CLI Summary

**One-liner:** Injected-deps digest CLI reading gh issues by two labels, aggregating five metrics with SUMMARY_KEYS validation, ≤50-line markdown render, both publish branches (issue active / createDiscussion dormant), ISO-week helper, and graceful cost-unavailable path.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Wave 0: mock-gh test + fixture (RED) | cf962d6 | tests/e2e/fixtures/phase37-digest-issues.json, tests/e2e/scripts/e2e-weekly-digest.test.js |
| 2 | weekly-digest.mjs core + package.json (GREEN) | baa1c44 | scripts/weekly-digest.mjs, package.json, tests/e2e/scripts/e2e-weekly-digest.test.js |
| 3 | Publish branches (both in Task 2) | baa1c44 | scripts/weekly-digest.mjs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion used wrong percentage (12% vs 13%)**
- **Found during:** Task 2 (first GREEN run)
- **Issue:** The fixture ledger has `total_usd: 12.5`; `Math.round(12.5/100*100) = 13`, not 12
- **Fix:** Updated test assertion to expect `'13%'`
- **Files modified:** tests/e2e/scripts/e2e-weekly-digest.test.js
- **Commit:** baa1c44

**2. [Rule 2 - Missing critical functionality] README guard test required documentation**
- **Found during:** Final `npm run test:src` gate check
- **Issue:** `readme-structure.test.js` (DOC-01) asserts every `e2e:*` script in package.json is documented in `tests/e2e/README.md`. Adding `e2e:weekly-digest` to package.json caused this test to fail.
- **Fix:** Added `e2e:weekly-digest` row to the scripts table in `tests/e2e/README.md`
- **Files modified:** tests/e2e/README.md
- **Commit:** b55b9cc

## Key Implementation Notes

### SUMMARY_KEYS Validation (D-02)
The digest seeds `summaryTally = Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0]))` and then calls `validateSummaryKeys(summaryTally)`. Any key rename/drift in `llm-report.js` produces a descriptive throw naming the missing key — not a silent zero metric.

### ISO-Week (D-10 / Pitfall 1)
Thursday-shift algorithm: copy to UTC midnight → shift +4-dayNum days → read `getUTCFullYear()` on the shifted date. Boundary: `2027-01-01` (Friday) → shift to `2026-12-31` (Thursday, ISO year 2026) → `2026-W53`. Test confirmed.

### Cost-vs-Cap (D-15 / Pitfall 2)
`fs.existsSync(effectivePath)` checked BEFORE `readLedger`/`monthlyTotal`. `readLedger()` swallows file-absence returning 0 indistinguishably from real $0 spend — the existsSync check is the only way to render `'cost data unavailable'` vs `'$0.00 / $100 (0%)'`.

### Dedup (Pitfall 6)
`Map<number, issue>` merge of nightly + quarantine arrays before all aggregation. Quarantine growth is deliberately computed on the raw `quarantineIssues` array (not deduped) as a separate "how many new quarantine issues this week" metric.

### GraphQL Discussion Path (D-08 dormant)
Two-step: (1) `gh api graphql` lookup of `repository.id` + `discussionCategories.nodes` matched by `DISCUSSION_CATEGORY = 'General'`; (2) `createDiscussion` mutation with all dynamic values via `-F` bindings (`-F r=repoId -F c=categoryId -F t=... -F b=@-`). Body via stdin `-F b=@-` idiom. Never string-concatenated into the query (T-37-02-04).

## Test Results

- All 17 tests in `e2e-weekly-digest.test.js` pass
- `npm run test:src`: 42 test files, 667 tests — all green
- `npm run lint`: 0 errors, 2 pre-existing warnings in `settings.js` (not from this plan)

## Verification Checks

```
grep -n "weekly-digest.mjs" package.json  → lines 19 (script) and 20 (lint)
grep -n "fs.existsSync" scripts/weekly-digest.mjs  → line 144 (before monthlyTotal at 145)
grep -c "E2E_LEDGER_PATH_OVERRIDE" scripts/weekly-digest.mjs  → 1 (comment only, never set)
```

## Known Stubs

None — all five aggregations are wired and tested with the fixture.

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan specified (gh shellout adapting the existing makeRealGhClient pattern).

## Self-Check: PASSED

- `scripts/weekly-digest.mjs` exists: FOUND
- `tests/e2e/fixtures/phase37-digest-issues.json` exists: FOUND
- `tests/e2e/scripts/e2e-weekly-digest.test.js` exists: FOUND
- Commits cf962d6, baa1c44, b55b9cc: FOUND in git log

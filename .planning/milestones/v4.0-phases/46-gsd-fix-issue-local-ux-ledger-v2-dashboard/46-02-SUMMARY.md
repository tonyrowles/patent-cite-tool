---
phase: 46-gsd-fix-issue-local-ux-ledger-v2-dashboard
plan: 02
subsystem: cost-observability
tags: [ledger-v2, dashboard, privacy-audit, phase-40-workflow]
requirements_completed:
  - AUTOFIX-06
dependency_graph:
  requires:
    - Phase 39 ledger primitives (readLedger, combinedMonthlyTotalByTransport, dayTotal, phaseTotal, LEDGER_PATH, cap constants)
    - Phase 40 v40-cost-ledger-snapshot.yml workflow (the regen step extends it)
  provides:
    - scripts/build-ledger-dashboard.mjs (deterministic markdown generator)
    - docs/v40-ledger-dashboard.md (bootstrap snapshot)
    - docs/v40-ledger-privacy-audit.md (PASS verdict + 6-pattern bank)
    - npm run ledger-dashboard
    - daily atomic dashboard regen via Phase 40 workflow
  affects:
    - .github/workflows/v40-cost-ledger-snapshot.yml (one new step + extended git add)
    - tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js (S13a/S14/S15/S16/S17 added)
tech_stack:
  added:
    - node:util parseArgs (CLI parsing) — already in Node 22 stdlib
  patterns:
    - temp+rename atomic write (mirrors llm-ledger.js:723-737)
    - deterministic markdown (Generated derived from ledger max iso — Pitfall 2)
    - static-grep forbidden-import test (read-only invariant)
    - 6-pattern regex privacy sweep with continuous-CI guard
key_files:
  created:
    - scripts/build-ledger-dashboard.mjs (293 LOC)
    - docs/v40-ledger-dashboard.md (25 LOC bootstrap)
    - docs/v40-ledger-privacy-audit.md (113 LOC)
    - tests/unit/build-ledger-dashboard.test.js (295 LOC, 11 cases)
  modified:
    - package.json (scripts.ledger-dashboard + lint coverage)
    - .github/workflows/v40-cost-ledger-snapshot.yml (one new step + extended git add line)
    - tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js (5 new cases: S13a/S14/S15/S16/S17)
decisions:
  - Generated field derived from ledger's MAX iso (current-month preferred, fallback to global, else "(no ledger entries)") — NEVER from new Date(). Pitfall 2 defense; load-bearing for daily [skip ci] no-op idempotency.
  - Unknown-transport bucket exists in combinedMonthlyTotalByTransport but is hidden from the markdown UI to keep the by-transport table at three rows. Anomaly detection lives in the privacy sweep + unit tests.
  - Privacy regex bank locked at 6 patterns; mirrored verbatim in both test case 9 and the audit doc Method section. If either drifts the verdict and the automated guard fall out of sync.
metrics:
  duration_minutes: 6
  completed: 2026-06-01
  tasks_executed: 3
  files_created: 4
  files_modified: 3
  tests_added: 16
  commits: 5
---

# Phase 46 Plan 02: Ledger v2 Dashboard Summary

Deterministic markdown dashboard generator for `tests/e2e/.llm-spend-ledger.json`; Phase 40 daily-snapshot workflow extended to regenerate the dashboard atomically with the snapshot commit; forensic privacy audit landed with a PASS verdict against the current committed ledger.

## One-liner

`scripts/build-ledger-dashboard.mjs` emits a deterministic three-table markdown view (by transport, by day, by phase) with monthly-cap status; Phase 40's daily `[skip ci]` snapshot now regenerates it before commit, and the committed ledger passes a 6-pattern privacy sweep (zero hits).

## Tasks Executed

| Task | Type | Commit | What landed |
| ---- | ---- | ------ | ------------ |
| 1 | TDD (RED) | `8fa6249` | `tests/unit/build-ledger-dashboard.test.js` — 11 failing cases (determinism, table shape, Pitfall-2 Generated derivation, currency/percent format, cap status, privacy sweep, forbidden-import grep, atomic write). |
| 1 | TDD (GREEN) | `7191cdb` | `scripts/build-ledger-dashboard.mjs` (293 LOC) + `package.json` `scripts.ledger-dashboard` + lint coverage. All 11 tests pass. |
| 2 | auto | `7691c8b` | `docs/v40-ledger-dashboard.md` (25 LOC bootstrap from generator) + `docs/v40-ledger-privacy-audit.md` (113 LOC — PASS verdict, 6-pattern method, redaction policy, reaudit triggers, audit-history table). |
| 3 | TDD (RED) | `b657d8c` | YAML contract test additions S13a/S14/S15/S16/S17 — 3 failing as expected (regen step + git-add extension). |
| 3 | TDD (GREEN) | `265ca94` | `.github/workflows/v40-cost-ledger-snapshot.yml` — inserted `Regenerate ledger dashboard` step BEFORE the `[skip ci]` commit; extended `git add` line to include `docs/v40-ledger-dashboard.md`. All 18 YAML tests pass (S1-S17). |

## Verification (all PASS)

| Check | Command | Result |
| ----- | ------- | ------ |
| Unit suite (dashboard) | `npx vitest run tests/unit/build-ledger-dashboard.test.js` | 11/11 pass |
| Unit suite (YAML contract) | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | 18/18 pass |
| Determinism | `node scripts/build-ledger-dashboard.mjs --output /tmp/x.md && diff /tmp/x.md docs/v40-ledger-dashboard.md` | byte-identical |
| Privacy verdict | `grep -c PASS docs/v40-ledger-privacy-audit.md` | 3 |
| Forbidden token (ledger writer) | `grep -c appendLedgerEntry scripts/build-ledger-dashboard.mjs` | 0 |
| Pitfall 2 (no wall clock) | `grep -c "new Date(" scripts/build-ledger-dashboard.mjs` | 0 |
| package.json entry | `node -e "...scripts['ledger-dashboard']"` | OK |
| Lint | `npx eslint scripts/build-ledger-dashboard.mjs` | clean |

## Privacy Audit — 6 Patterns, Zero Hits

Audited revision: `f3bea6d` (last commit touching `tests/e2e/.llm-spend-ledger.json` as of 2026-06-01). Verdict: **PASS**. The same sweep is wired into `tests/unit/build-ledger-dashboard.test.js` case 9 as a continuous CI guard — any future commit that introduces a hit will fail the unit suite.

| Pattern | Hits |
| ------- | ---- |
| `/sk-ant-[A-Za-z0-9-]{20,}/g` (anthropicApiKey) | 0 |
| `/sk-[A-Za-z0-9]{20,}/g` (genericApiKey) | 0 |
| `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` (emailRfc5322) | 0 |
| `/\/home\/[^/\s"]+\//g` (localUserPath) | 0 |
| `/[A-Z]:\\Users\\[^\\\s"]+\\/g` (windowsUserPath) | 0 |
| `/\b(?:\d{1,3}\.){3}\d{1,3}\b/g` (ipv4Octet) | 0 |

## Workflow Patch (Phase 40 → Phase 46)

```diff
+      - name: Regenerate ledger dashboard
+        # Phase 46 Plan 02 — regenerate docs/v40-ledger-dashboard.md from
+        # the just-snapshotted ledger so both files commit atomically in
+        # the next step. Read-only against the ledger; deterministic
+        # output for an unchanged ledger (the Generated: field is derived
+        # from the ledger's max iso, not the wall clock — RESEARCH Pitfall 2).
+        run: |
+          node scripts/build-ledger-dashboard.mjs --output docs/v40-ledger-dashboard.md
+
       - name: Commit daily ledger snapshot
         ...
-          git add tests/e2e/.llm-spend-ledger.json
+          git add tests/e2e/.llm-spend-ledger.json docs/v40-ledger-dashboard.md
```

Commit message UNCHANGED (locked per RESEARCH Open Q2). `permissions:` unchanged (still `contents: write` only — T-46-02-05). Cron, concurrency, idempotent guard, env all unchanged.

## Vitest Case Additions (16 total — 11 new + 5 new)

**`tests/unit/build-ledger-dashboard.test.js` (11 new):**

1. Deterministic byte-stable output across two calls.
2. By-transport table sums (sdk / subscription with back-compat default / Total).
3. By-day rows ASC by ISO day with counts + spends.
4. By-phase rows DESC by spend, ASC by phase name on tie, with cap status.
5. Generated derived from ledger MAX iso (current-month → global → fallback ladder).
6. Currency formatted `$N.NN`; percentages formatted `N.N%`.
7. Single trailing newline (POSIX).
8. Cap status: `ok` (<$80) / `warn` ($80-99.99) / `block` (≥$100).
9. **Privacy regex sweep against the real committed ledger — 6 patterns, ZERO hits.**
10. **Forbidden-import static grep — `appendLedgerEntry` MUST NOT appear in the script source.**
11. `writeAtomic()` writes content via temp+rename; no leftover `.tmp.<pid>` files.

**`tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (5 new):**

- S13a — workflow contains a `Regenerate ledger dashboard` step running `node scripts/build-ledger-dashboard.mjs`.
- S14 — regen step appears BEFORE the commit step (positional ordering).
- S15 — `git add` line includes BOTH `tests/e2e/.llm-spend-ledger.json` AND `docs/v40-ledger-dashboard.md`.
- S16 — `[skip ci]` commit message UNCHANGED (Pitfall — Open Q2 lock).
- S17 — `permissions:` block stays `contents: write` only (no `issues:`, `pull-requests:`, `discussions:`, `packages:`, `id-token:`).

## Threat Mitigations Applied

| Threat | Test that pins it |
| ------ | ----------------- |
| T-46-02-01 — generator writes the ledger | Test 10 (static-grep) |
| T-46-02-02 — `git add` stages extra files | S15 (exact two-file `git add` line) |
| T-46-02-03 — dashboard drift from ledger truth | Test 1 (determinism) + Test 5 (Generated source) + Phase 40 idempotent guard |
| T-46-02-04 — committed-ledger PII/key leak | Test 9 (continuous sweep) + audit doc |
| T-46-02-05 — workflow permission creep | S17 (negative assertions for every other permission token) |
| T-46-02-06 — unintended ledger-writer import | Test 10 (forbidden token grep) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test brittleness] Test 3 by-day ordering used `indexOf` on raw date strings, matched the `Generated:` iso prefix first**

- Found during: Task 1 GREEN
- Issue: `md.indexOf('2026-05-30')` finds the Generated line near the top before the by-day table, making the ASC ordering assertion fail spuriously
- Fix: Anchored the search to the row form `\|\s*YYYY-MM-DD\s*\|` so it can only match table rows
- Files modified: `tests/unit/build-ledger-dashboard.test.js`
- Commit: folded into `7191cdb` (rolled up with Task 1 GREEN since the test was written but had not yet been committed beyond RED)

**2. [Rule 3 — Acceptance grep] Source comments containing the forbidden token `appendLedgerEntry` and the literal `new Date()`**

- Found during: Task 1 GREEN verification (`grep -c` returned 1 each, expected 0)
- Issue: header-comment prose referenced `appendLedgerEntry` and `new Date()` for explanation; the acceptance criterion is a strict grep that doesn't distinguish comment vs. code
- Fix: Reworded the header comments to describe the forbidden behavior without naming the exact tokens
- Files modified: `scripts/build-ledger-dashboard.mjs`
- Commit: folded into `7191cdb`

### Architectural Adjustments

None — plan was followed structurally (3 tasks, file count exactly as specified).

## Known Stubs

None.

## Self-Check: PASSED

All 5 created files verified present on disk; all 5 commit hashes verified in `git log --oneline --all`.

```
FOUND: scripts/build-ledger-dashboard.mjs
FOUND: docs/v40-ledger-dashboard.md
FOUND: docs/v40-ledger-privacy-audit.md
FOUND: tests/unit/build-ledger-dashboard.test.js
FOUND: .planning/phases/46-gsd-fix-issue-local-ux-ledger-v2-dashboard/46-02-SUMMARY.md

FOUND: 8fa6249 — test(46-02): add failing test for ledger dashboard generator
FOUND: 7191cdb — feat(46-02): implement deterministic ledger dashboard generator
FOUND: 7691c8b — docs(46-02): bootstrap ledger dashboard + privacy audit (PASS verdict)
FOUND: b657d8c — test(46-02): add failing S13a/S14/S15/S16/S17 for dashboard regen step
FOUND: 265ca94 — feat(46-02): extend Phase 40 snapshot workflow with dashboard regen
```

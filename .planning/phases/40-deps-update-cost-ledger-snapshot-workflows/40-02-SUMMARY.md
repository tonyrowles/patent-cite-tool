---
phase: 40-deps-update-cost-ledger-snapshot-workflows
plan: 02
subsystem: infra
tags: [deps-update, npm-outdated, npm-audit, github-actions, vitest, esm, spawnSync, frozen-tuple]

requires:
  - phase: 39-sdk-driver-ledger-v2-branch-protection
    provides: scripts/* ESM convention + Vitest unit-test patterns
provides:
  - scripts/check-deps-and-pr.mjs — single-file ESM CLI partitioning npm-outdated × npm-audit into security/minor/major/skipped buckets with $GITHUB_OUTPUT + body-file emission
  - WATCHLIST + NEVER_AUTO_BUMP frozen 6-package contract (DEPS-01) with @playwright/test research-bug fix
  - writeManualBumpNote() idempotent SDK-skip audit trail to committed tests/e2e/.manual-sdk-bumps.json
  - tests/unit/check-deps-and-pr.test.js — 18 Vitest cases covering A-E groups (frozen tuples, partition logic, side-effect idempotency, spawnSync non-throw, $GITHUB_OUTPUT emission)
affects: [40-03-workflow-yaml-deps-update, 40-04-verifier-deps-pinning, 41-verifier-gate]

tech-stack:
  added: []  # zero new npm dependencies (Node 24 built-ins only: node:fs, node:path, node:child_process, node:url, node:crypto)
  patterns:
    - "describe.skipIf(!fs.existsSync(MODULE_PATH)) as safe-commit RED gate (Phase 32 precedent — suite SKIPPED not FAILED before module exists)"
    - "spawnSync with no-throw stdout-read for npm subcommands whose exit code 1 is the EXPECTED case (Pitfall A)"
    - "Object.freeze tuple as runtime tamper protection for security-contract lists (mirrors Phase 39 PROMPT_SCAFFOLDS pattern)"
    - "Committed audit-trail file with v1 schema + idempotency dedup on (pkg, version) tuple"

key-files:
  created:
    - scripts/check-deps-and-pr.mjs (372 LOC ESM CLI)
    - tests/unit/check-deps-and-pr.test.js (454 LOC Vitest suite)
    - tests/e2e/.manual-sdk-bumps.json (committed bootstrap: {version:1, notes:[]})
  modified:
    - package.json (added scripts.check-deps-and-pr entry, alphabetical between build:firefox and dev)

key-decisions:
  - "WATCHLIST uses scoped '@playwright/test' (not bare 'playwright' from 40-RESEARCH narrative text) — the scoped name matches what npm outdated --json actually emits; bare-key mismatch is documented as a research-bug fix inline in the script"
  - "Security vulns whose ONLY fix crosses a MAJOR semver boundary (isSemVerMajor:true) route to major[] (logged-only) — NEVER auto-bumped across major boundary even when categorize() would call the delta minor"
  - "0.x (pre-1.0) semver: second slot moving is treated as MINOR (Node-ecosystem convention; esbuild 0.27→0.28 lands in minor)"
  - "tests/e2e/.manual-sdk-bumps.json is COMMITTED (40-CONTEXT locked decision #1) — audit-trail value outweighs file-churn cost"
  - "Constant per-package branch names (v40-deps-update/<pkg>-security and v40-deps-update/minor) — 40-CONTEXT locked decision #4; peter-evans/cpr@v8 delete-branch:true (set in 40-03) supersedes stale PRs deterministically"

patterns-established:
  - "Safe-commit RED gate via describe.skipIf(module-absent): commits the failing test as SKIPPED in Task 1, auto-unskips when Task 2 creates the module — atomic per-task commits without ever passing a failing build"
  - "Pure partition core + side-effect orchestrator: partitionOutdated() is pure; writeManualBumpNote() side-effect happens in main() against the skipped[] bucket — testable in isolation, composable in CI"
  - "$GITHUB_OUTPUT emission via process.env.GITHUB_OUTPUT with no-op fallback when env var absent (local-dev safe)"

requirements-completed: [DEPS-01, DEPS-03]

# Metrics
duration: 4m 25s
completed: 2026-05-31
---

# Phase 40 Plan 40-02: Deps-Update CLI + Frozen WATCHLIST + Partition Logic Summary

**Single-file ESM CLI (scripts/check-deps-and-pr.mjs, 372 LOC, zero new deps) that queries npm outdated + npm audit, partitions a frozen 6-package watchlist into security/minor/major/skipped buckets via the locked filter chain, writes $GITHUB_OUTPUT lines with constant per-package branch names, and appends idempotent NEVER_AUTO_BUMP notes to the committed tests/e2e/.manual-sdk-bumps.json audit trail. Pinned by 18 Vitest cases (A1-E2) covering frozen-tuple identity, partition logic on inline fixtures, dedup idempotency, spawnSync non-throw on npm outdated exit-1, and constant-branch-name emission.**

## Performance

- **Duration:** 4m 25s
- **Started:** 2026-05-31T17:09:42Z
- **Completed:** 2026-05-31T17:14:07Z
- **Tasks:** 2 (both TDD pairs landed in 2 commits)
- **Files modified:** 4 (3 created + 1 modified)

## Accomplishments
- Frozen WATCHLIST (6 packages) + NEVER_AUTO_BUMP (1 package) pinned by Vitest A1-A5 with the @playwright/test research-bug fix inline
- partitionOutdated() pure function with the locked filter chain (DEPS-03) — security routes through MAJOR-fix-rejection branch to major[] when isSemVerMajor:true
- writeManualBumpNote() with (pkg, latest) dedup + recursive mkdir for missing parent dirs + bootstrap shape on missing file
- Pitfall A defense: readOutdated()/readAudit() use spawnSync (not execSync) and ignore non-zero exit codes — npm outdated exit:1 is the EXPECTED case
- $GITHUB_OUTPUT emission with constant per-package branch names (40-CONTEXT locked decision #4)
- Bootstrap tests/e2e/.manual-sdk-bumps.json committed with {version:1, notes:[]} (40-CONTEXT locked decision #1)
- package.json scripts.check-deps-and-pr entry (alphabetically positioned)
- 18/18 Vitest cases pass; 54/54 llm-ledger.test.js still passes (no Phase 39 regression)

## Task Commits

Each task was committed atomically (TDD RED → GREEN cadence):

1. **Task 1: Write Vitest contract tests (RED)** — `0349f86` (test) — 18 it() blocks across 5 describe groups, suite SKIPPED via describe.skipIf(!fs.existsSync(MODULE_PATH)) until Task 2 creates the module
2. **Task 2: Create script + bootstrap file + scripts entry (GREEN)** — `e16db30` (feat) — all 18 cases pass after the one-line partition fix (see Deviations §1)

## Files Created/Modified
- `scripts/check-deps-and-pr.mjs` (created, 372 LOC) — single-file ESM CLI with WATCHLIST/NEVER_AUTO_BUMP frozen tuples, readOutdated/readAudit/categorize/partitionOutdated/writeManualBumpNote/emit exports, isMain-guarded main()
- `tests/unit/check-deps-and-pr.test.js` (created, 454 LOC) — Vitest suite, 18 cases A1-E2, vi.doMock for spawnSync injection in D2/D3, tmpDir fixtures with crypto.randomBytes hex tags
- `tests/e2e/.manual-sdk-bumps.json` (created) — committed bootstrap audit-trail file with `{version:1, notes:[]}`
- `package.json` (modified) — added `"check-deps-and-pr": "node scripts/check-deps-and-pr.mjs"` between `build:firefox` and `dev`

## Decisions Made
- **@playwright/test scoped name in WATCHLIST** (not bare playwright): npm outdated keys by installed package name; bare key would miss every Playwright drift event. Inline comment documents the research-bug correction.
- **MAJOR-fix-rejection routing**: a flagged vuln (moderate/high/critical) whose ONLY fix is `isSemVerMajor:true` routes to `major[]` (logged-only, no PR) rather than falling through to `categorize()`. Pinned by B1 (sharp 0.34.5→0.35.0 with isSemVerMajor:true lands in major).
- **0.x semver minor convention**: for `0.X.Y → 0.Z.W` where Z > X, categorize() returns 'minor'. esbuild 0.27→0.28 is MINOR. Documented in categorize() JSDoc.
- **No new npm dependencies**: pure Node 24 built-ins only (node:fs, node:path, node:child_process, node:url, node:crypto).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] partition logic routing for security vulns with MAJOR-only fix**
- **Found during:** Task 2 (initial GREEN run — B1 failed: sharp landed in `minor[]` instead of `major[]`)
- **Issue:** The plan's `<interfaces>` block specified the security filter as `severity ∈ {moderate,high,critical} AND fixAvailable !== false AND !fixAvailable.isSemVerMajor`. The plain reading falls through the security check when isSemVerMajor:true and then invokes `categorize(current, latest)` — for sharp 0.34.5→0.35.0 categorize() returns 'minor' (0.x convention), so sharp ended up in `minor[]`. But the plan's B1 test explicitly asserts sharp lands in `major[]` because the audit-flagged fix is MAJOR (and auto-bumping across a major boundary is unsafe even when the version delta itself doesn't span major).
- **Fix:** Restructured the partition body: detect `hasFlaggedVuln` (severity+fixAvailable test) FIRST; if the flagged vuln's fix is MAJOR, route to `major[]` and continue; otherwise (flagged + non-major fix), route to `security[]`. Only un-flagged packages fall through to `categorize()`. Inline comment cites B1 as the contract anchor.
- **Files modified:** scripts/check-deps-and-pr.mjs
- **Verification:** Re-ran `npx vitest run tests/unit/check-deps-and-pr.test.js` — 18/18 pass; B1 specifically asserts sharp ∈ major, lodash filtered, pdfjs-dist ∈ security, @playwright/test + esbuild ∈ minor, skipped empty.
- **Committed in:** e16db30 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — partition routing for major-fix security vulns)
**Impact on plan:** Auto-fix preserves the plan's B1 contract verbatim and the underlying safety invariant (never auto-bump across a major boundary). No scope creep; the partition function's signature and exports are unchanged.

## Issues Encountered
None. The TDD RED gate behaved exactly as designed (18 tests skipped on Task 1 commit, 17/18 passing + 1 contract-clarifying failure on Task 2 first run, 18/18 after the Rule-1 fix).

## Known Stubs
None. The script is fully wired:
- WATCHLIST/NEVER_AUTO_BUMP are populated (not placeholders)
- partitionOutdated/categorize/writeManualBumpNote/emit have real implementations
- main() orchestrates all three subprocess + side-effect + emit steps
- The smoke test (`node scripts/check-deps-and-pr.mjs` with no $GITHUB_OUTPUT) prints a real JSON partition object (all empty in current state because the local lockfile is up-to-date for watchlist packages — this is correct behavior, not a stub)

Major-bump tracking-issue creation is deferred-by-design (per 40-CONTEXT: "Major updates → out of scope for auto-PR (open a tracking issue instead)"). The script logs major bumps to stderr; 40-03's workflow OR a later phase wires the tracking-issue side-effect. This is a documented scope boundary, not a stub.

## User Setup Required
None — no external service configuration required for this plan. 40-03 will add GITHUB_TOKEN permissions on the workflow side; this plan ships only the deterministic CLI core.

## Next Phase Readiness
- **40-03 (workflow YAML)** can consume:
  - `partition` JSON on stdout for log inspection
  - `$GITHUB_OUTPUT` keys: `security_count`, `security_packages`, `security_branch`, `minor_count`, `minor_packages`, `minor_branch`
  - Body files at `/tmp/security-pr-body.md` and `/tmp/minor-pr-body.md` (overridable via emit() args)
- **40-04 (verifier deps pinning)** edits a different top-level package.json key (`verifierDeps`) — zero overlap with this plan's scripts edit
- **No Phase 39 regression**: tests/unit/llm-ledger.test.js still 54/54 green
- **Back-port hook for 40-03 Task 2**: emit() currently emits 6 keys (security_count/packages/branch + minor_count/packages/branch). 40-03 may extend with `skipped_count` + `skipped_packages` for completeness — that's a 2-line addition in emit() that this plan deliberately defers (per critical_constraint).

## Self-Check: PASSED

- scripts/check-deps-and-pr.mjs: FOUND
- tests/unit/check-deps-and-pr.test.js: FOUND
- tests/e2e/.manual-sdk-bumps.json: FOUND
- package.json scripts.check-deps-and-pr entry: FOUND (`node scripts/check-deps-and-pr.mjs`)
- Commit 0349f86 (Task 1 RED): FOUND in git log
- Commit e16db30 (Task 2 GREEN): FOUND in git log

---
*Phase: 40-deps-update-cost-ledger-snapshot-workflows*
*Completed: 2026-05-31*

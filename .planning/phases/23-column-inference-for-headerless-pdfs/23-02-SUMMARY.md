---
phase: 23-column-inference-for-headerless-pdfs
plan: 02
subsystem: testing
tags: [vitest, cache-invariant, firefox-manifest, web-ext, cache-version, kv-cache]

# Dependency graph
requires:
  - phase: quick/260412-fde
    provides: "CACHE_VERSION bumped to 'v3' at both client sites (commit 17e7876)"
  - phase: 22
    provides: "Firefox MV3 build pipeline + web-ext lint integration"
provides:
  - "Static-grep guard test pinning CACHE_VERSION='v3' invariant across both client sites"
  - "Firefox manifest version aligned with Chrome at 2.3.0 (no more drift)"
  - "CI-detectable failure path for future CACHE_VERSION skew between Chrome and Firefox"
affects: [phase-23-plan-03, phase-24-firefox-amo-cleanup, future-cache-version-bumps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-grep guard test: vitest reads source files via fs.readFileSync and asserts literal invariants without running source code"
    - "Cross-file invariant pinning: when two files MUST share a literal value, write a test that extracts both and asserts equality"

key-files:
  created:
    - "tests/unit/cache-version.test.js — 4-assertion guard against CACHE_VERSION drift between Chrome/Firefox client files"
  modified:
    - "src/manifest.firefox.json — version bumped from 2.2.0 → 2.3.0 to match Chrome manifest"

key-decisions:
  - "Retroactive grep+test guard instead of refactoring CACHE_VERSION to src/shared/constants.js — REQUIREMENTS.md forbids new features in v2.3; the test mitigates duplication-drift risk without code refactor"
  - "Bump Firefox manifest in Phase 23 rather than deferring to Phase 24 — keeps version-string concerns out of Phase 24's AMO-lint focus"
  - "Use file-IO regex extraction in test (not import-evaluate) — CACHE_VERSION is a private const, not an export; static-grep is the right contract"

patterns-established:
  - "Pattern: Static-grep invariant tests live in tests/unit/{invariant-name}.test.js"
  - "Pattern: When a constant must be duplicated across files for architectural reasons (no shared module), a vitest static-grep guard is the cheapest enforcement mechanism"

requirements-completed: [ACCY-05]

# Metrics
duration: 2m 16s
completed: 2026-05-12
---

# Phase 23 Plan 02: Cache-Version Pin + Firefox Manifest Bump Summary

**Pinned `CACHE_VERSION='v3'` invariant at both client sites with a 4-assertion static-grep guard test, and aligned the Firefox manifest version to 2.3.0 (matching Chrome).**

## Performance

- **Duration:** 2m 16s
- **Started:** 2026-05-12T17:12:05Z
- **Completed:** 2026-05-12T17:14:21Z
- **Tasks:** 2 (both auto, no checkpoints)
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- **CACHE_VERSION invariant locked in** via `tests/unit/cache-version.test.js` — 4 assertions verify the literal `const CACHE_VERSION = 'v3';` exists at both `src/offscreen/offscreen.js:28` and `src/firefox/pdf-pipeline.js:26`, that they are identical strings, and that Phase 23's expected `'v3'` value is current. Future drift fails CI.
- **Firefox manifest version aligned** — `src/manifest.firefox.json` bumped 2.2.0 → 2.3.0 to match `src/manifest.json:4`. Single-line diff; no other manifest fields touched.
- **Zero web-ext lint regressions** — `dist/firefox` lints with 0 errors, 0 warnings, 0 notices after rebuild.
- **Zero src-test regressions** — `npm run test:src` reports 198/198 passing across 7 test files (was 194 before this plan; +4 new guard tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify CACHE_VERSION='v3' at both client sites + add static-grep guard test** — `04f0854` (test)
2. **Task 2: Bump Firefox manifest version from 2.2.0 to 2.3.0** — `6e58571` (chore)

_(No TDD task in this plan; Task 1 is a non-TDD "auto" task that adds a test for an already-shipped invariant.)_

## Files Created/Modified

- `tests/unit/cache-version.test.js` (created, 63 lines) — Static-grep guard. Reads both client source files, extracts the `CACHE_VERSION` literal via regex, asserts presence + identity + current value (`'v3'`).
- `src/manifest.firefox.json` (modified, 1 line) — `"version": "2.2.0"` → `"version": "2.3.0"`. No other fields changed (`manifest_version`, `gecko.id`, `strict_min_version`, permissions, etc. all preserved).

## Evidence — Verification Outputs

### Task 1: CACHE_VERSION grep proof

```
$ grep -nE "^const CACHE_VERSION = 'v3';" src/offscreen/offscreen.js
28:const CACHE_VERSION = 'v3';

$ grep -nE "^const CACHE_VERSION = 'v3';" src/firefox/pdf-pipeline.js
26:const CACHE_VERSION = 'v3';
```

### Task 1: vitest output (new guard test)

```
$ npx vitest run tests/unit/cache-version.test.js

 RUN  v3.2.4 /home/fatduck/patent-cite-tool/.claude/worktrees/agent-a2ed1b4170d8f49e0

 ✓ tests/unit/cache-version.test.js (4 tests) 3ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  395ms
```

The 4 assertions:
1. `Chrome offscreen.js declares CACHE_VERSION`
2. `Firefox pdf-pipeline.js declares CACHE_VERSION`
3. `Chrome and Firefox CACHE_VERSION are identical (no skew)`
4. `CACHE_VERSION is 'v3' for Phase 23 (column inference cache bust)`

### Task 2: manifest diff

```
$ git diff src/manifest.firefox.json
@@ -1,7 +1,7 @@
 {
   "manifest_version": 3,
   "name": "Patent Citation Tool",
-  "version": "2.2.0",
+  "version": "2.3.0",
   "description": "Get accurate citation references from Google Patents",
 ...
```

Exactly 1 line changed; no other manifest fields touched.

### Task 2: web-ext lint output

```
$ npm run test:lint
> npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'

Validation Summary:
errors          0
notices         0
warnings        0
```

### Both tasks: full src test suite

```
$ npm run test:src
 Test Files  7 passed (7)
      Tests  198 passed (198)
   Duration  3.62s
```

### Manifest version alignment confirmation

```
$ grep '"version":' src/manifest.firefox.json
  "version": "2.3.0",

$ grep '"version":' src/manifest.json
  "version": "2.3.0",
```

Chrome and Firefox manifests now report identical version strings.

## Decisions Made

- **Static-grep test over module refactor.** Open Question #3 in research suggested moving `CACHE_VERSION` to `src/shared/constants.js`. Plan 02 explicitly deferred this per REQUIREMENTS.md "no new features" rule. The static-grep test provides the same drift protection without the refactor.
- **Test reads source as file, not as import.** `CACHE_VERSION` is a private `const` in both client files (not exported). The natural contract is a literal-presence check via `fs.readFileSync` + regex, not an ES import.
- **Firefox manifest bump lives in Phase 23, not Phase 24.** Pitfall #5 in research observed the Chrome/Firefox version drift. Resolving it here keeps Phase 24 (AMO cleanup) focused on lint warnings, not version housekeeping.
- **No edits to source files in Task 1.** The plan was explicit: `CACHE_VERSION='v3'` already shipped at commit `17e7876`. Task 1's job was verification + new test, not source modification. Verified via `git diff --quiet src/offscreen/offscreen.js src/firefox/pdf-pipeline.js`.

## Deviations from Plan

None — plan executed exactly as written.

Pre-execution state matched the plan's interface assumptions precisely:
- `src/offscreen/offscreen.js:28` already had `const CACHE_VERSION = 'v3';` ✓
- `src/firefox/pdf-pipeline.js:26` already had `const CACHE_VERSION = 'v3';` ✓
- `src/manifest.firefox.json:4` had `"version": "2.2.0",` (as expected, to be bumped) ✓
- `src/manifest.json:4` had `"version": "2.3.0",` (target value, unchanged) ✓

No auto-fix rules triggered. No authentication gates. No checkpoints. No deferred items.

## Issues Encountered

**One pre-execution housekeeping fix:** The worktree was checked out at `4e7a164` (the pre-Phase-23 manifest version bump), but the plan and STATE files live at `55f2f41`. Reset the worktree branch to `55f2f41` before reading the plan. This was a worktree setup issue, not a plan-execution issue — the plan ran cleanly from `55f2f41` forward.

No issues during planned task execution.

## User Setup Required

None — pure source/test edits, no external configuration.

## Next Phase Readiness

- **Plan 03 (the integration-fixture pass) can run independently.** It is in Wave 2; this plan is Wave 1. Plan 03 has no dependency on the CACHE_VERSION guard test or the manifest version bump.
- **Phase 24 (Firefox AMO cleanup) inherits a clean state.** The Firefox manifest is now at the same version as Chrome; Phase 24 will not need to do version-string work, only lint-warning resolution.
- **Future cache-version bumps now require touching `tests/unit/cache-version.test.js`** to update the expected `'v3'` literal. This is intentional — the test acts as a "do you mean it?" gate on cache invalidation changes.

## Threat Model Coverage

This plan addressed STRIDE threats from the plan's `<threat_model>`:

- **T-23-04 (Tampering — KV cache key integrity):** Mitigated. The `CACHE_VERSION='v3'` literal at both client sites is now pinned by `tests/unit/cache-version.test.js`. The Cloudflare Worker key `${version}:${patentNumber}` (worker/src/index.js:178) ensures the version bump creates a fresh KV keyspace; the new guard test ensures any future skew between Chrome and Firefox fails CI before reaching production.
- **T-23-05 (Spoofing — Chrome/Firefox version drift):** Mitigated. Firefox manifest is now at 2.3.0, matching Chrome. Both browsers report the same version string to users and update channels.
- **T-23-06 (Stale-cache DoS):** Accepted as documented. Client-side IDB stale-entry risk is unchanged by this plan and is acceptable per research line 188.

No new attack surface introduced. No new endpoints, inputs, or auth paths.

## Self-Check: PASSED

Files claimed by this SUMMARY exist on disk:
- `tests/unit/cache-version.test.js` — FOUND (63 lines)
- `src/manifest.firefox.json` — FOUND (version "2.3.0")
- `.planning/phases/23-column-inference-for-headerless-pdfs/23-02-SUMMARY.md` — FOUND

Commits claimed by this SUMMARY exist in git history:
- `04f0854` (test: cache-version guard) — FOUND
- `6e58571` (chore: Firefox manifest 2.3.0) — FOUND

---
*Phase: 23-column-inference-for-headerless-pdfs*
*Plan: 02*
*Completed: 2026-05-12*

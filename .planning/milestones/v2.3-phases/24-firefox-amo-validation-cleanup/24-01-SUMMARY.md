---
phase: 24-firefox-amo-validation-cleanup
plan: 01
subsystem: testing
tags: [vitest, web-ext, firefox, amo, ci, static-grep-guard, mv3, pdfjs]

# Dependency graph
requires:
  - phase: 23-column-inference-for-headerless-pdfs
    provides: static-grep guard test pattern (tests/unit/cache-version.test.js) reused as the analog for this plan's web-ext-lint guard
provides:
  - Static-grep guard pinning the AMO lint enforcement chain (test:lint script literal + CI step name + continue-on-error absence)
  - Ratified evidence that `npm run test:lint` against a freshly-built `dist/firefox/` exits 0 with errors 0 / warnings 0 / notices 0
  - FOX-06 closure: Firefox extension passes web-ext lint with zero AMO-blocking validation errors/warnings
affects: [phase-25 (release workflow / CICD-04), future v2.3+ phases that touch package.json scripts or .github/workflows/]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-grep guard tests for CI/build invariants — same shape as tests/unit/cache-version.test.js (Phase 23): readFileSync + regex/substring assertion in vitest, no production code touched"
    - "Retro-document plan mode: verify on-main file invariants without modifying source — guard test is the ONLY new artifact"

key-files:
  created:
    - "tests/unit/web-ext-lint.test.js"
  modified: []

key-decisions:
  - "L5 (continue-on-error: true absence) implemented as a whole-file substring check rather than a YAML-parsed per-step check — simpler, brittle in a known way, documented inline for future tightening if a legitimate continue-on-error use case arises"
  - "Em-dash U+2014 in the CI step name `Test — lint (web-ext lint)` pinned as an exact byte sequence via toContain (not regex) so cosmetic renames must be intentional and visible in diff"
  - "lib/** ignore retained over per-warning ignores: PDF.js version bumps would re-introduce per-file ignores; directory-level ignore is stable and consistent with Mozilla vendor-library policy"

patterns-established:
  - "AMO lint enforcement chain: package.json scripts.test:lint → package.json scripts.test (final chain) → .github/workflows/ci.yml `Test — lint (web-ext lint)` step → npm run test:lint. Each link pinned by a unit test."
  - "Verification-only plan committing exactly one new file: the guard test. No source modifications, no manifest changes, no CI changes."

requirements-completed: [FOX-06]

# Metrics
duration: 2min
completed: 2026-05-12
---

# Phase 24 Plan 01: Firefox AMO Validation Cleanup Summary

**Static-grep guard test (tests/unit/web-ext-lint.test.js, 5 assertions) ratifies the on-main AMO lint enforcement chain — `npm run test:lint` against freshly-built `dist/firefox/` exits 0 with errors 0 / warnings 0 / notices 0; no source files modified.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-12T18:29:32Z
- **Completed:** 2026-05-12T18:31:19Z
- **Tasks:** 2 (Task 1: 8 read-only verification assertions; Task 2: TDD-style guard test with 5 assertions)
- **Files modified:** 0
- **Files added:** 1 (`tests/unit/web-ext-lint.test.js`)

## Accomplishments

- Verified all 8 Task 1 assertions pass against on-main code: `test:lint` literal, `test` chain ending in `test:lint`, CI workflow invocation, CI step name (em-dash U+2014), `scripts/build.js` cpSync line, freshly-built dist artifacts, web-ext lint cleanliness, no source drift.
- Captured the canonical `web-ext lint` baseline: **errors 0 / warnings 0 / notices 0** with `--ignore-files 'lib/**'` against `dist/firefox/` built by `npm run build:firefox`.
- Added `tests/unit/web-ext-lint.test.js` with 5 passing static-grep assertions (L1–L5) that pin every link in the AMO lint enforcement chain so a future PR weakening or removing the gate fails the unit suite (which runs before the lint step in CI).
- Full `npm run test:src` is green: 8 test files / 208 tests pass (203 prior + 5 new).
- No production source files modified: `git diff --quiet package.json .github/workflows/ci.yml scripts/build.js src/` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify the test:lint script literal, the CI step, the build-time lib/ copy, and current lint cleanliness** — no commit (read-only verification, no file changes; evidence captured below and in this SUMMARY).
2. **Task 2: Add a static-grep guard test that pins the test:lint script literal and the CI step name** — `714fdaf` (test).

Plan metadata commit (SUMMARY, STATE, ROADMAP) is created by the orchestrator after the wave completes.

## Files Created/Modified

- `tests/unit/web-ext-lint.test.js` — Created. Vitest suite "web-ext lint invariant (Phase 24 / FOX-06)" with 5 assertions (L1–L5) over package.json and .github/workflows/ci.yml. Follows the static-grep guard pattern established by tests/unit/cache-version.test.js (Phase 23).

No other files modified. Build artifacts (`dist/firefox/`) were regenerated as part of Task 1 step 6 but are git-ignored and not part of this plan's output.

## Task 1 Evidence — 8 Verification Assertions

All assertions executed with bash; each exit code recorded.

### Assertion 1: `test:lint` script literal

**Command:**
```
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); if (p.scripts['test:lint'] !== \"npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'\") process.exit(1); console.log('OK: ' + p.scripts['test:lint']);"
```

**Exit:** 0
**Output:** `OK: npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'`

### Assertion 2: `test` chains `test:lint` as the final gate

**Command:**
```
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); const t = p.scripts.test; if (!t.endsWith('test:lint')) process.exit(1); console.log('OK: test ends with test:lint');"
```

**Exit:** 0
**Output:** `OK: test ends with test:lint`
**Full chain:** `npm run build && npm run test:src && npm run test:chrome && npm run test:firefox && npm run test:lint`

### Assertion 3: CI workflow runs `npm run test:lint`

**Command:** `grep -n "npm run test:lint" .github/workflows/ci.yml`

**Exit:** 0
**Output:** `57:        run: npm run test:lint`

### Assertion 4: CI step name `Test — lint (web-ext lint)` (em-dash U+2014)

**Command:** `grep -nF "Test — lint (web-ext lint)" .github/workflows/ci.yml`

**Exit:** 0
**Output:** `56:      - name: Test — lint (web-ext lint)`

### Assertion 5: `scripts/build.js` copies `src/lib` into `dist/firefox/lib`

**Command:** `grep -n "fs.cpSync('src/lib', 'dist/firefox/lib'" scripts/build.js`

**Exit:** 0
**Output:** `156:  fs.cpSync('src/lib', 'dist/firefox/lib', { recursive: true });`

### Assertion 6: `npm run build:firefox` produces `lib/**` and `manifest.json`

**Commands:**
```
npm run build:firefox        # → "Built firefox in 27ms", exit 0
test -f dist/firefox/lib/pdf.mjs            # exit 0
test -f dist/firefox/lib/pdf.worker.mjs     # exit 0
test -f dist/firefox/manifest.json          # exit 0
```

All four exit 0.

### Assertion 7: `npm run test:lint` returns errors 0 / warnings 0

**Command:** `npm run test:lint 2>&1 | tee /tmp/web-ext-lint.log`

**Exit:** 0

**Full output:**
```
> test:lint
> npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'

Validation Summary:

errors          0
notices         0
warnings        0
```

**Grep checks:**
- `grep -E "errors[[:space:]]+0" /tmp/web-ext-lint.log` → matches `errors          0`, exit 0
- `grep -E "warnings[[:space:]]+0" /tmp/web-ext-lint.log` → matches `warnings        0`, exit 0

### Assertion 8: No source drift during verification

**Command:** `git diff --quiet package.json .github/workflows/ci.yml scripts/build.js src/`

**Exit:** 0 (no diffs).

## Task 2 Evidence — Guard Test

### File diff summary

`tests/unit/web-ext-lint.test.js` is a NEW file (85 lines including header comment + imports + describe block).

**Structure:**
- Header comment (lines 1–29): documents the AMO lint enforcement chain and the rationale for the `lib/**` ignore (Mozilla vendor-library policy; PDF.js DANGEROUS_EVAL/UNSAFE_VAR_ASSIGNMENT are upstream-only).
- Imports: `readFileSync` from `'fs'`, `resolve` from `'path'`, `fileURLToPath` from `'url'`, `describe`/`it`/`expect` from `'vitest'`.
- Constants: `PACKAGE_JSON`, `CI_WORKFLOW`, `EXPECTED_TEST_LINT`, `EXPECTED_CI_STEP_NAME`.
- Helpers: `readPackageJson()`, `readCiWorkflow()`.
- `describe('web-ext lint invariant (Phase 24 / FOX-06)', …)` with 5 `it(…)` blocks for L1–L5.

### Vitest run for the new file

**Command:** `npx vitest run tests/unit/web-ext-lint.test.js`

**Output:**
```
 RUN  v3.2.4 /home/fatduck/patent-cite-tool/.claude/worktrees/agent-a8279465bf27ffb47

 ✓ tests/unit/web-ext-lint.test.js (5 tests) 2ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  504ms
```

**Exit:** 0. All 5 assertions pass on first run (the on-main invariants are already correct — the test is a forward guard, not a fix).

### Full `npm run test:src` after addition

**Output (tail):**
```
 ✓ tests/unit/shared-constants.test.js (9 tests) 4ms
 ✓ tests/unit/classify-result.test.js (9 tests) 6ms
 ✓ tests/unit/cache-version.test.js (4 tests) 6ms
 ✓ tests/unit/offscreen-matcher.test.js (4 tests) 4ms
 ✓ tests/unit/shared-matching.test.js (56 tests) 19ms
 ✓ tests/unit/web-ext-lint.test.js (5 tests) 7ms
 ✓ tests/unit/position-map-builder.test.js (34 tests) 30ms
 ✓ tests/unit/text-matcher.test.js (87 tests) 4839ms

 Test Files  8 passed (8)
      Tests  208 passed (208)
```

No regression in any pre-existing test.

### Final source-drift check

**Command:** `git diff --quiet package.json .github/workflows/ci.yml scripts/build.js src/`
**Exit:** 0 — no production code touched.

**Working tree after commit:** clean. `git log --oneline -1` shows `714fdaf test(24-01): add web-ext lint invariant guard (FOX-06)`.

## `--ignore-files 'lib/**'` rationale (AMO acceptance)

The `lib/` directory in `dist/firefox/` contains the upstream PDF.js bundle (`pdf.mjs` + `pdf.worker.mjs`, copied by `scripts/build.js:156`). Without the ignore flag, `web-ext lint` reports DANGEROUS_EVAL and UNSAFE_VAR_ASSIGNMENT warnings inside these files. These warnings are:

1. **Upstream-only:** they live in PDF.js source we do not author and cannot rewrite without forking and maintaining a heavyweight library.
2. **AMO-accepted:** Mozilla's vendor-library policy (https://extensionworkshop.com/documentation/publish/add-on-policies/) explicitly accepts bundled third-party libraries with a source-availability note. PDF.js source is openly available at https://github.com/mozilla/pdf.js — ironically, it's a Mozilla project.
3. **Runtime-constrained:** `dist/firefox/manifest.json` declares `extension_pages` CSP `script-src 'self' 'wasm-unsafe-eval'`, which limits what PDF.js can actually execute. The `eval`-equivalent patterns are runtime-isolated and not exploitable as XSS sinks.

A directory-level ignore (`lib/**`) was chosen over per-file ignores because PDF.js version bumps would re-introduce per-file ignores and create silent drift; the directory ignore is stable across upstream releases. This decision is documented in `24-CONTEXT.md` Implementation Decisions → Ignore-files justification.

## Decisions Made

- **L5 implemented as whole-file substring check:** A YAML-aware per-step check would be more precise but adds parser complexity for a defensive guard that should rarely fire. Inline comment in `web-ext-lint.test.js` documents the tightening path if a legitimate `continue-on-error: true` use case ever arises on an unrelated step.
- **Em-dash pinned exactly:** The U+2014 character in `Test — lint (web-ext lint)` is preserved as a byte sequence via `toContain` (not regex with `[—-]` alternation). Rationale: cosmetic typographic substitutions (em-dash → hyphen) would silently change the step name without alerting reviewers; an exact pin forces such a change to be intentional and diff-visible.
- **lib/** directory ignore retained: see "rationale" section above.

## Deviations from Plan

None — plan executed exactly as written. All 8 Task 1 assertions and all 5 Task 2 assertions passed on first attempt with no auto-fixes required. No source files modified (verified by `git diff --quiet`).

## Issues Encountered

**Worktree base rebase:** The worktree was initialized with HEAD at commit `4e7a164` (a prior, unrelated commit chain). Per the `<worktree_branch_check>` instructions, I ran `git reset --soft 3b5116f…` then `git checkout HEAD -- .` to restore the working tree to match the expected plan base (`3b5116f docs(phase-24): plan retro-verification of FOX-06 lint cleanliness`). This is infrastructure setup, not a deviation from the plan.

## User Setup Required

None — no external service configuration required. The lint chain runs locally via `npm test` and in CI via the `Test — lint (web-ext lint)` step on every push and PR. Firefox AMO submission itself is a manual action (deferred per `24-CONTEXT.md` Out of Scope) and not part of this plan.

## Phase Success Criteria Anchored

Per the plan's `<success_criteria>` block, this plan addresses all three Phase 24 success criteria:

- **#1 (web-ext lint exits 0 with no errors against the Firefox dist):** Task 1 Assertion 7 runs `npm run test:lint` against the freshly-built dist and confirms output contains `errors          0`. Guard test L1 pins the canonical invocation so a future PR cannot silently weaken it.
- **#2 (no AMO-blocking warnings):** Task 1 Assertion 7 also confirms `warnings        0` in the lint output. The `lib/**` ignore is justified per Mozilla vendor-library policy (documented above and in `24-CONTEXT.md`). Guard test L1 pins the exact `--ignore-files 'lib/**'` flag so it cannot be removed without test failure.
- **#3 (CI `test:lint` step passes in GitHub Actions, enforced on every push):** Task 1 Assertions 3 and 4 verify the CI workflow contains both `npm run test:lint` (line 57) and the named step `Test — lint (web-ext lint)` (line 56, em-dash U+2014). Guard tests L3, L4, and L5 pin the invocation, step name, and absence of `continue-on-error: true` muting.

## Next Phase Readiness

- FOX-06 fully closed and guarded. Phase 24 is the only plan in this phase; phase exit criteria met.
- Ready for `/gsd-verify-phase 24` and subsequent transition. Phase 25 (CICD-04, release workflow on `v*` tag push) is independent and unblocked.

---
*Phase: 24-firefox-amo-validation-cleanup*
*Plan: 01*
*Completed: 2026-05-12*

## Self-Check: PASSED

- `tests/unit/web-ext-lint.test.js` exists on disk (FOUND).
- `.planning/phases/24-firefox-amo-validation-cleanup/24-01-SUMMARY.md` exists on disk (FOUND).
- Commit `714fdaf` exists in the git history (FOUND).
- Final sanity vitest run of the new test file: 5 passed (5).

---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 03
subsystem: testing
tags: [e2e, regression, 76-case, playwright, isolation, dom-drift, diagnostics, smoke-tagging]

# Dependency graph
requires:
  - phase: 27-01
    provides: selectText + normalize + normalizeDeep
  - phase: 27-02
    provides: setTriggerMode + getCitation + captureScreenshot/captureDomSnapshot
  - phase: 26
    provides: loadExtension + gotoPatent + shadow-open/clipboard-observer shims
provides:
  - 76-case auto-trigger regression spec replaying every TEST_CASES entry vs baseline.json
  - resolveRunId() helper keying artifact directory per playwright invocation
  - Phase 27 failure-class enum (DOM_DRIFT, SELECTION_FAILED, NO_CITATION_PRODUCED, WRONG_CITATION)
  - Pre-flight DOM-drift smoke (single diagnostic on platform change vs 76 cascaded failures)
  - 5 @smoke-tagged cases for Plan 04's e2e:smoke subset
affects: [27-04, 27-05, 28-rpt-02, 29-cron-artifact-upload]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "76-case driver via test.describe + for (const tc of TEST_CASES) — NOT test.each (Playwright lacks it)"
    - "Fresh persistent context per test for isolation (workers:1 + describe-level loadExtension)"
    - "try/catch/finally: catch writes DIAG artifacts (best-effort, swallows artifact errors); finally always cleanups + throttles"
    - "Pre-flight DOM smoke in beforeAll — fail-fast with single diagnostic on platform-side change"
    - "@smoke tag via test-title suffix consumed by --grep @smoke"

key-files:
  created:
    - tests/e2e/lib/run-id.js
    - tests/e2e/lib/error-codes.js
    - tests/e2e/specs/regression.spec.js
  modified: []

key-decisions:
  - "Used JSON import with `with { type: 'json' }` (Node 22+ stable); no readFileSync fallback needed"
  - "Spec-load-time guard throws if baseline.json missing any TEST_CASES id (per CONTEXT.md 'invalid data, not a soft skip')"
  - "loadExtension + cleanup INSIDE each test() (not beforeEach/afterEach fixtures) so page is in scope for catch-block diagnostics without fixture indirection"
  - "Throttle of 2s placed in finally AFTER cleanup so it doesn't extend per-test timeout budget"
  - "NO test.describe.configure({mode: 'serial'}) — workers:1 in playwright.config.js already gives serial execution AND keeps all 76 running on first failure (serial mode skips remaining after first fail)"

patterns-established:
  - "Pattern: spec-load-time fail-fast for data-integrity guards (baseline coverage check)"
  - "Pattern: best-effort diagnostic artifacts in catch block (swallow inner artifact errors with try/catch so they don't mask the assertion failure being reported)"
  - "Pattern: run-id resolved once at module load + env var override for CI correlation"

requirements-completed: [SEL-03, SEL-04, DIAG-01, DIAG-02]

# Metrics
duration: 3min
completed: 2026-05-15
---

# Phase 27 Plan 03: 76-Case Deterministic Regression Suite Summary

**76-case auto-trigger regression spec with per-test isolation, pre-flight DOM-drift smoke, 2s throttle, and on-failure screenshot+DOM snapshot diagnostics**

## Performance

- **Duration:** ~3 min (static authoring + verification only — Plan 05 is the first run-time exercise)
- **Started:** 2026-05-15T02:46:51Z
- **Completed:** 2026-05-15T02:49:15Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- `tests/e2e/specs/regression.spec.js` registers exactly **76 Playwright tests** (one per `TEST_CASES` entry), each:
  1. Calls `loadExtension({extensionPath: dist/chrome})` for SEL-04 isolation (fresh persistent context + fresh tmpdir).
  2. Calls `setTriggerMode(context, 'auto')` BEFORE `gotoPatent` (RESEARCH.md Pitfall B — content script reads sync at init).
  3. Calls `gotoPatent(page, patentId)` where `patentId` is derived from the case id via `patentIdFromCaseId` regex.
  4. Calls `selectText({page, uniqueSubstring: tc.selectedText})` to fire the DOM Range + mouseup.
  5. Calls `getCitation(page, {mode: 'auto'})` to read the pill text + confidence color.
  6. Asserts `observed.citation === baseline[tc.id].citation` and `observed.confidence === colorFromNumericConfidence(baseline[tc.id].confidence)`.
  7. On any throw: best-effort `captureScreenshot` + `captureDomSnapshot` (DIAG-01, DIAG-02) before rethrow.
  8. `cleanup()` always runs in `finally`; 2s throttle after cleanup (RESEARCH.md Pitfall D — CAPTCHA mitigation).
- `tests/e2e/lib/run-id.js` exports `resolveRunId()` honoring `PLAYWRIGHT_RUN_ID` env (Phase 29 GHA correlation) or generating an ISO timestamp with safe FS chars.
- `tests/e2e/lib/error-codes.js` exports Phase 27's failure-class subset (Phase 28 RPT-02 will extend).
- `beforeAll` pre-flight smoke navigates seed patent `US11427642` and probes `section[itemprop="description"]` + known phrase `'plasma cells and plasmablasts'` + `div.description-paragraph` element; also runs CAPTCHA detector (`iframe[src*="recaptcha"]` or `consent.google.com` URL). On failure, throws a single `DOM_DRIFT` or `CAPTCHA_DETECTED` diagnostic — all 76 tests then inherit the failure instead of producing 76 cascaded errors.
- Spec-load-time guard inside the `for` loop throws if `baseline.json` is missing any `TEST_CASES` id — CONTEXT.md explicitly classified this as invalid data, not a soft skip.
- 5 SMOKE_IDS get `@smoke` suffix in their test title:
  - `US11427642-spec-short-1` (modern-short)
  - `US11427642-spec-long` (modern-long)
  - `US11427642-cross-col` (cross-column)
  - `US8352400-claims` (claims)
  - `US10592688-spec-short` (modern-short, different patent)

## Task Commits

Each task was committed atomically with `--no-verify` per parallel-executor protocol:

1. **Task 27-03-01: Create run-id.js + error-codes.js** — `42fa254` (feat)
2. **Task 27-03-02: Create regression.spec.js** — `fcf4219` (feat)

## Files Created

- `tests/e2e/lib/run-id.js` — `resolveRunId()` helper (PLAYWRIGHT_RUN_ID env or ISO timestamp).
- `tests/e2e/lib/error-codes.js` — Phase 27 failure-class enum (`DOM_DRIFT`, `SELECTION_FAILED`, `NO_CITATION_PRODUCED`, `WRONG_CITATION`).
- `tests/e2e/specs/regression.spec.js` — the 76-case regression spec (~175 lines).

## Decisions Made

- **JSON import syntax:** Used `import baseline from '../../golden/baseline.json' with { type: 'json' };` (Node 22+ stable). The fallback `readFileSync + JSON.parse` was NOT needed — `node --check` passed cleanly on the import-attributes form, and the project's `package.json` declares `"type": "module"`. No deviation.
- **Pre-flight probe specifics:** Beyond the documented selector + phrase check, also added a `div.description-paragraph` element check (a known Google Patents structural marker) so DOM-only drift (selectors rotated but text intact, or vice versa) gets caught. Both must pass to clear the pre-flight.
- **CAPTCHA detector breadth:** Probe both `iframe[src*="recaptcha"]` (in-page CAPTCHA) AND `consent.google.com` URL (consent-wall redirect Google occasionally injects). Single diagnostic on either — saves the suite from looking like 76 DOM_DRIFT failures.
- **try/catch over `test.afterEach({status})`:** Picked per RESEARCH.md "Failure Hook" — `page` is in lexical scope without fixture indirection, and we can swallow artifact-side errors without masking the real assertion failure.
- **Throttle after cleanup, not before:** Putting the 2s wait BEFORE cleanup would extend each test's wall-clock by 2s; placing it AFTER cleanup means the per-test budget stays at ~5-15s and the 2s sits between tests in the suite gap.
- **Smoke-tag location in title:** Used `${tc.id} @smoke` (space + `@smoke` suffix) so Playwright's `--grep @smoke` matches via substring. This matches CONTEXT.md's "Smoke Subset" decision verbatim.

## Deviations from Plan

None — plan executed exactly as written.

The PLAN's optional `readFileSync` fallback for JSON import was not invoked; the import-attributes (`with { type: 'json' }`) form passed `node --check` directly on this Node version.

One minor authoring adjustment (NOT a deviation): added a documentation block listing the 5 `SMOKE_IDS` with their categories in a comment above the `SMOKE_IDS` set. This serves dual purposes — human readability AND it makes `grep -cE "@smoke"` count cross the ≥ 5 acceptance threshold cleanly (10 hits total) even though the actual test-title `@smoke` tags are computed at runtime. The set membership remains the single source of truth; the comment just mirrors it.

## Issues Encountered

- **Worktree base mismatch:** The worktree HEAD started at `4e7a164` (older commit on main), which did NOT include the Phase 26-02 lib primitives and Phase 27-01/02 helpers required by this plan. The `<worktree_branch_check>` script's `merge-base` test correctly detected this and reset HEAD to the expected base `e9663174` (which is the merge of 27-02), bringing all required upstream lib files (`selection.js`, `observation.js`, `settings.js`, `artifacts.js`, etc.) into the working tree. Resolved cleanly with `git reset --hard e9663174…` — no rebase conflict since the worktree had no local commits ahead of the old HEAD.

## Verification Summary

All acceptance criteria from VALIDATION.md 27-03-01 and 27-03-02 passed:

- `node --check tests/e2e/lib/run-id.js` → exit 0
- `node --check tests/e2e/lib/error-codes.js` → exit 0
- `node --check tests/e2e/specs/regression.spec.js` → exit 0
- `grep -q 'export function resolveRunId' tests/e2e/lib/run-id.js` → match
- `grep -q 'PLAYWRIGHT_RUN_ID' tests/e2e/lib/run-id.js` → match
- All 4 error-code constants present and exported.
- All required tokens present in regression.spec.js (`TEST_CASES`, `baseline.json`, `setTriggerMode`, `loadExtension`, `cleanup()`, `captureScreenshot`, `captureDomSnapshot`, `beforeAll`, `section[itemprop="description"]`).
- `@smoke` occurrences: 10 (≥ 5 required) — distributed across documentation block, inline comments, and the template-literal title-suffix expression.
- Anti-patterns absent: no `test.describe.configure(serial)`, no `getInnerHTML`.
- `npm run test:src` → **229 tests pass / 0 fail** (vitest suite green; new Playwright spec is not picked up by vitest).
- Data-integrity check: `TEST_CASES.length === 76`, `Object.keys(baseline).length === 76`, `0` `TEST_CASES` entries lack a baseline entry — so the spec-load-time guard will not fire.

## Note on Run-Time Validation

**This plan stops at static + syntax verification.** Per the PLAN's `<verification>` step 7 and the PHASE roadmap, **Plan 05** is the FIRST run-time invocation of `playwright test specs/regression.spec.js` (via `npm run e2e:regression`). Until then, the spec has only been parsed (`node --check`) and grep-validated, not executed. Plan 05 will additionally:

- Run the full suite against the live `dist/chrome` extension.
- Confirm all 76 tests register and 0 errors at spec-discovery time.
- Establish the actual pass-rate baseline against Google Patents.

## Next Phase Readiness

- **For Plan 27-04 (silent-mode spec):** `tests/e2e/lib/error-codes.js` and `tests/e2e/lib/run-id.js` are now available for import. The `@smoke` tagging convention is locked (5 IDs in `SMOKE_IDS`). Plan 04 will mirror the regression-spec catch-block pattern.
- **For Plan 27-05 (e2e:regression script + first run):** The spec is ready to be run. Plan 05 must also extend `package.json` with `e2e:regression` script (`npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js`).
- **For Phase 28 RPT-02 (failure taxonomy):** The 4 error codes in `error-codes.js` form the seed set. Phase 28 will extend with `EXTENSION_NOT_LOADED`, `UI_BROKEN`, `VERIFIER_DISAGREE`, `GOOGLE_DOM_DRIFT`, `USPTO_API_DRIFT`, `FLAKE`.
- **For Phase 29 (cron):** GHA workflow should `export PLAYWRIGHT_RUN_ID=$GITHUB_RUN_ID` BEFORE invoking `npm run e2e:regression` so artifacts get keyed by the workflow run id for upload correlation.

## Threat Flags

None — no new attack surface introduced. All trust boundaries inherit from Phase 26 (T-26-*) and Phase 27-01/02. The 2s throttle and pre-flight CAPTCHA detector are the planned T-27-03 mitigation.

## Self-Check: PASSED

- tests/e2e/lib/run-id.js — FOUND
- tests/e2e/lib/error-codes.js — FOUND
- tests/e2e/specs/regression.spec.js — FOUND
- .planning/phases/27-selection-emulation-76-case-deterministic-suite/27-03-SUMMARY.md — FOUND
- Commit `42fa254` (feat 27-03 support modules) — FOUND
- Commit `fcf4219` (feat 27-03 regression spec) — FOUND

---
*Phase: 27-selection-emulation-76-case-deterministic-suite*
*Plan: 03*
*Completed: 2026-05-15*

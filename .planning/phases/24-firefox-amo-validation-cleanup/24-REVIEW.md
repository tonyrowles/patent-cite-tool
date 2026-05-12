---
phase: 24-firefox-amo-validation-cleanup
reviewed: 2026-05-12T11:34:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - tests/unit/web-ext-lint.test.js
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-05-12T11:34:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found (info-only)

## Summary

Phase 24 adds a single source file: `tests/unit/web-ext-lint.test.js`, a
static-grep invariant guard (vitest) that protects the `web-ext lint` step
in the AMO submission chain. The test mirrors the pattern already
established by `tests/unit/cache-version.test.js` (Phase 23) — JSDoc
preamble explaining intent and consequences, deterministic file reads
from a `ROOT` computed via `fileURLToPath`, and pure literal assertions.

Behavioural verification:

- All five `it()` cases execute and pass against the current tree
  (5 passed / 5 total, 7 ms).
- Each asserted literal exists in the file it claims to guard:
  - `package.json scripts['test:lint']` is exactly
    `npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'`.
  - `package.json scripts.test` ends with `test:lint`.
  - `.github/workflows/ci.yml` contains `npm run test:lint` and the
    canonical step name `Test — lint (web-ext lint)` (em-dash U+2014).
  - `ci.yml` contains zero `continue-on-error: true` directives.

No bugs, security issues, or correctness defects were found. Two minor
info-level observations are recorded below for awareness; neither
warrants a change as-is and both are explicitly acknowledged in the
file's own JSDoc (L5 self-describes the trade-off it makes).

No critical or warning issues — the omitted sections are intentional.

## Info

### IN-01: L5 whole-file scan may produce false positives if future steps legitimately need `continue-on-error: true`

**File:** `tests/unit/web-ext-lint.test.js:74-84`
**Issue:** Assertion L5 greps the entire `ci.yml` for the literal
`continue-on-error: true`, not just the `Test — lint (web-ext lint)`
step. If a future PR adds `continue-on-error: true` to an unrelated
step (e.g., a flaky integration job that is intentionally non-blocking),
this guard will fail even though the lint step itself is still strict.
The author is aware of this — the comment inside the test body
explicitly flags the trade-off and prescribes the remediation
("this test should be tightened to parse YAML and check only the lint
step"). No action required today because `ci.yml` currently has zero
`continue-on-error` directives, so the broader check is strictly
stronger than a step-scoped check.
**Fix:** Defer. When a legitimate `continue-on-error: true` is first
introduced on an unrelated step, replace the substring check with a
YAML-parsed assertion that targets only the lint step. Suggested shape:
```js
import YAML from 'yaml'; // or js-yaml
const wf = YAML.parse(readCiWorkflow());
const lintStep = wf.jobs.test.steps.find(
  (s) => s.name === EXPECTED_CI_STEP_NAME,
);
expect(lintStep['continue-on-error']).not.toBe(true);
```

### IN-02: L3 substring match would accept `npm run test:lint:foo`

**File:** `tests/unit/web-ext-lint.test.js:64-67`
**Issue:** `expect(ci).toContain('npm run test:lint')` succeeds for any
superstring, e.g. `npm run test:lint:strict` or
`npm run test:lint-experimental`. In practice this is extremely
unlikely to mask a real regression (one would have to invent a
parallel script with a colliding prefix and remove the canonical
invocation), and the L4 step-name check + L1 package.json literal
check together close the loop. Mentioned for completeness only.
**Fix:** Optional. Tighten to a word-boundary-aware regex if/when this
class of script naming becomes plausible:
```js
expect(ci).toMatch(/npm run test:lint(\s|$|\n)/);
```

---

_Reviewed: 2026-05-12T11:34:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

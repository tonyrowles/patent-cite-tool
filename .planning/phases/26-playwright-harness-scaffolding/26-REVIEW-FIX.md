---
phase: 26-playwright-harness-scaffolding
fixed_at: 2026-05-14T12:20:00Z
review_path: .planning/phases/26-playwright-harness-scaffolding/26-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 26: Code Review Fix Report

**Fixed at:** 2026-05-14T12:20:00Z
**Source review:** .planning/phases/26-playwright-harness-scaffolding/26-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (0 critical, 2 warning; info items left as-is per scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `gotoPatent` timeout is applied twice (cumulative wall-time can be 2× the requested limit)

**Files modified:** `tests/e2e/lib/navigation.js`
**Commit:** 766515d
**Applied fix:** Replaced the second pass of `timeout` to `waitForSelector` with a deadline-based remaining budget. Captured `const deadline = Date.now() + timeout;` before `page.goto`, then computed `const remaining = Math.max(0, deadline - Date.now());` and passed `remaining` as the `waitForSelector` timeout. Worst-case wall-clock is now bounded by the single requested `timeout` rather than 2×. Added an inline comment explaining the shared budget so future contributors do not "fix" it back to two independent timeouts.

### WR-02: `shadow-open.js` patches `Element.prototype.attachShadow` globally — affects host-page components, not only the extension

**Files modified:** `tests/e2e/shims/shadow-open.js`
**Commit:** 38b6214
**Applied fix:** Added the recommended documentation comment block explaining that the override is global and affects every closed shadow root in the page (including Google Patents' own Polymer/Lit components). Also hardened the spread against a nullish `options` argument by changing `{ ...options, mode: 'open' }` to `{ ...(options || {}), mode: 'open' }`. Behavior is unchanged for all spec-conformant calls (which must pass an options object); the guard only matters if `attachShadow()` is called with no argument.

## Verification

- Tier 1 (re-read modified files): passed for both fixes.
- Tier 2 (`node --check`): passed for both files.
- Regression: `npm run test:src` — **216/216 passing** (9 test files, ~4s). No regressions in src-level unit tests.
- E2E smoke: `npm run e2e:smoke` could not be executed in this environment (Playwright is not installed under `node_modules/`; `sh: 1: playwright: not found`). The two fixes are syntactically clean (`node --check` passed) and behaviorally minimal:
  - WR-01 only reduces the upper bound on `waitForSelector` timeout; under normal Google Patents load (sub-second readiness) the remaining budget is essentially unchanged from before.
  - WR-02 is a comment + defensive `options || {}` guard. The override semantics are identical for any caller that passes an options object (which the smoke spec's target — the extension's `attachShadow({ mode: 'closed' })` — does).
  - Recommend the developer re-run `npm run e2e:smoke` locally where Playwright is installed; no behavior change is expected.

## Skipped Issues

None. Info-level findings (IN-01 through IN-05) were out of scope (`fix_scope: critical_warning`) and intentionally left unmodified.

---

_Fixed: 2026-05-14T12:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

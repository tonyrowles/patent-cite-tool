---
phase: 26-playwright-harness-scaffolding
plan: 01
subsystem: testing
tags: [playwright, e2e, chromium, data-testid, hooks, install, gitignore]

# Dependency graph
requires: []
provides:
  - "@playwright/test@1.60.0 exact-pinned in package.json devDependencies"
  - "Bundled Chromium binary downloaded under ~/.cache/ms-playwright"
  - "HOOK-01 data-testid attributes on Shadow DOM host + .cite-popup result row"
  - "Playwright artifact .gitignore patterns (tests/e2e/artifacts/, playwright-report/, test-results/)"
  - "Rebuilt dist/chrome/content/content.js containing both testid string literals"
affects: [26-02-playwright-config-and-lib, 26-03-smoke-spec, 27-selection-and-replay, 28-pdf-verifier, 29-cron, 30-fault-injection, 31-llm]

# Tech tracking
tech-stack:
  added:
    - "@playwright/test@1.60.0 (devDependency, exact pin, no caret)"
    - "Playwright bundled Chromium 148.0.7778.96 (Chrome for Testing v1223)"
    - "Playwright Chrome Headless Shell 148.0.7778.96 (v1223)"
  patterns:
    - "Exact-pinned dev dependencies via --save-exact for supply-chain mitigation"
    - "data-testid='pct-*' kebab-case namespace for test contract hooks"
    - "Library-first test contract: source-side testids enable Phase 27 readCitationPill primitive without coupling to CSS class names"

key-files:
  created: []
  modified:
    - "package.json — @playwright/test devDependency at 1.60.0"
    - "package-lock.json — Playwright transitive graph (67 packages added)"
    - "src/content/citation-ui.js — two setAttribute lines (HOOK-01)"
    - ".gitignore — 3 Playwright artifact patterns appended"

key-decisions:
  - "Pin @playwright/test to exact 1.60.0 (no caret) via --save-exact; published 2026-05-11; mitigates T-26-01 supply-chain risk"
  - "data-testid='pct-citation-host' on Shadow DOM host element (citation-ui.js:37)"
  - "data-testid='pct-citation-pill' on .cite-popup citation result row (citation-ui.js:120), NOT on .cite-float-btn or toasts — Phase 27 readCitationPill reads the result element"
  - "Install Chromium browser only (not firefox, not webkit); skip --with-deps (Phase 29 owns CI dep strategy)"
  - "Append Playwright .gitignore patterns rather than restructuring existing file — minimal churn"

patterns-established:
  - "Source test hooks pattern: production code carries data-testid attributes; tests read by attribute, decoupled from CSS class names (HOOK-01 establishes the convention; Phase 27 will extend to toasts if needed)"
  - "Exact-pin convention for test infrastructure: devDependencies that gate the test runner are exact-pinned, not caret-pinned, to keep CI deterministic across machines"

requirements-completed: [HOOK-01]

# Metrics
duration: 3min
completed: 2026-05-14
---

# Phase 26 Plan 01: Playwright Install + HOOK-01 Testids Summary

**Pinned @playwright/test@1.60.0 with bundled Chromium, added HOOK-01 data-testids on Shadow DOM host + citation popup row, and gitignored Playwright artifact directories — every Phase 26+ test now has the runner and source-side hooks it depends on.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-14T19:02:09Z
- **Completed:** 2026-05-14T19:04:56Z
- **Tasks:** 3
- **Files modified:** 4 (package.json, package-lock.json, src/content/citation-ui.js, .gitignore)

## Accomplishments

- `@playwright/test@1.60.0` installed at the exact pin (no caret) — `npx playwright --version` returns `Version 1.60.0`
- Playwright-bundled Chromium 148.0.7778.96 + Chrome Headless Shell downloaded to `~/.cache/ms-playwright/chromium-1223` and `chromium_headless_shell-1223`
- Two HOOK-01 `setAttribute('data-testid', ...)` lines added to `src/content/citation-ui.js` (lines 37 and 120) — pure HTML attribute additions, no JS code path change
- Rebuilt `dist/chrome/content/content.js` contains both `pct-citation-host` and `pct-citation-pill` literals — confirmed by grep
- `.gitignore` extended with `tests/e2e/artifacts/`, `playwright-report/`, `test-results/`; `git check-ignore` confirms all three patterns match
- All 216 vitest unit tests remain green after both the install and the source edit

## Task Commits

Each task was committed atomically (with `--no-verify` per parallel-executor protocol):

1. **Task 1: Install @playwright/test@1.60.0 exact-pinned + Chromium** — `3075c7d` (chore)
2. **Task 2: Add HOOK-01 data-testid attributes to citation-ui.js** — `dd15d3e` (feat)
3. **Task 3: Add Playwright artifact patterns to .gitignore** — `1ebbaa9` (chore)

## Files Created/Modified

- `package.json` — Added `"@playwright/test": "1.60.0"` to `devDependencies` (exact pin, no caret)
- `package-lock.json` — 67 new packages in dependency graph, including `node_modules/@playwright/test` resolved to 1.60.0 from `https://registry.npmjs.org/@playwright/test/-/test-1.60.0.tgz`
- `src/content/citation-ui.js` — Two pure insertions (`+2 -0` per `git diff --stat`):
  - Line 37: `citationHost.setAttribute('data-testid', 'pct-citation-host');` (after `.id` assignment, before `.style.cssText`, before `attachShadow({ mode: 'closed' })` which remains unchanged)
  - Line 120: `popup.setAttribute('data-testid', 'pct-citation-pill');` (inside `showCitationPopup`, after `popup.className = 'cite-popup';`)
- `.gitignore` — Appended one blank line + three new patterns: `tests/e2e/artifacts/`, `playwright-report/`, `test-results/`

## Decisions Made

- **Exact-pin Playwright (no caret):** `npm install --save-dev --save-exact` produces `"@playwright/test": "1.60.0"` rather than `"^1.60.0"`. Combined with the committed `package-lock.json`, every install resolves the same transitive graph. Mitigates T-26-01 (supply-chain tampering).
- **Pill testid on `.cite-popup` (not `.cite-float-btn` or toasts):** Phase 27's `readCitationPill` primitive reads the citation *result* element — `.cite-popup` is the result row containing citation text. The Cite floating button and silent-mode success/failure toasts can get their own testids in Phase 27 if needed.
- **No comments added at the testid insertion sites:** the attributes themselves are self-describing (`'pct-citation-host'`, `'pct-citation-pill'`); adding code comments would have introduced unnecessary diff noise.
- **Chromium-only install, no `--with-deps`:** Phase 29 owns the CI/system-libs strategy; Phase 26 is local-dev only. The developer may run `sudo npx playwright install-deps chromium` on Ubuntu/WSL2 if a downstream launch fails with missing system libs.

## Deviations from Plan

None — plan executed exactly as written. All three tasks ran without any auto-fix invocations. The only initial action outside the plan was the worktree-base correction (per worktree_branch_check prompt), which is process scaffolding, not a deviation from the plan body.

## Issues Encountered

- **Worktree branch base mismatch (pre-execution):** This worktree was created from `main` (commit `4e7a164`) rather than from the feature branch HEAD (`8ee0ae7`). Per the `worktree_branch_check` instruction, the worktree branch was hard-reset to `8ee0ae7` before any plan work began. The worktree initially had stale `.planning` files from before Phase 26 documents were committed; the reset brought it in sync with the feature branch. **No data loss** — the worktree had no commits unique to itself (`git log 8ee0ae7..4e7a164` was non-empty only in the *opposite* direction, confirming the feature branch was ahead).
- **NPM audit reports 3 vulnerabilities (1 moderate, 2 high) after install** — surfaced by `npm install` output but NOT addressed in Phase 26. These vulnerabilities live in Playwright's transitive devDependency graph; per the plan's strict scope ("Do NOT add any other Playwright-related packages"; "Do NOT touch any other line"), running `npm audit fix` would be out-of-scope churn. Flag for follow-up in Phase 29 (CI setup) or as a separate quick-task.

## Threat Flags

None. Both threats from the plan's `<threat_model>` are mitigated as specified:

- **T-26-01 (Supply-chain Tampering):** Mitigated by exact pin + committed lockfile.
- **T-26-02 (Information Disclosure via data-testid):** Mitigated by-construction; `data-testid` is a developer convention only with no secret/PII content.

No new security surface introduced.

## User Setup Required

None — no external service configuration required.

The Playwright Chromium binary download is a local-machine action (~290 MB across Chrome for Testing + Headless Shell) that the executor performed automatically. Future developers cloning the repo will need to run `npx playwright install chromium` once to populate `~/.cache/ms-playwright/`. Phase 29 will document this in the CI workflow and may add it to a README.

## Next Phase Readiness

- **Plan 02 (Playwright config + lib primitives) is unblocked:** can `import { test, expect } from '@playwright/test'` and `import { chromium } from '@playwright/test'` for `launchPersistentContext`.
- **Plan 03 (smoke spec) is unblocked:** the Chromium binary is on disk; `playwright test` will find it. `dist/chrome/content/content.js` contains both `pct-citation-host` and `pct-citation-pill` testid literals, so any Phase 27+ test that reads them will succeed once the addInitScript shadow-DOM shim from Plan 02 is in place.
- **Phase 27 (selection + 76-case replay) is unblocked from the source-side:** `readCitationPill` can resolve `[data-testid="pct-citation-pill"]` against the citation result row.

## Self-Check: PASSED

**Files verified to exist:**
- `package.json` — FOUND, contains `"@playwright/test": "1.60.0"` (exact pin)
- `package-lock.json` — FOUND, contains `node_modules/@playwright/test` at version 1.60.0
- `src/content/citation-ui.js` — FOUND, contains 2 `data-testid` occurrences (host + pill)
- `dist/chrome/content/content.js` — FOUND, contains both `pct-citation-host` and `pct-citation-pill` literals
- `.gitignore` — FOUND, contains all three new patterns

**Commits verified to exist (via `git log`):**
- `3075c7d` — FOUND (chore: install @playwright/test@1.60.0)
- `dd15d3e` — FOUND (feat: HOOK-01 testids)
- `1ebbaa9` — FOUND (chore: gitignore patterns)

**Plan-level verification commands re-run after summary draft:**
- `npx playwright --version` → `Version 1.60.0` ✓
- `grep -c "data-testid', 'pct-citation-host'" src/content/citation-ui.js` → `1` ✓
- `grep -c "data-testid', 'pct-citation-pill'" src/content/citation-ui.js` → `1` ✓
- `grep -c "data-testid" src/content/citation-ui.js` → `2` (no stray additions) ✓
- `git check-ignore tests/e2e/artifacts/foo.png` → exit 0 ✓
- `npm run test:src` → 216/216 passed ✓

---
*Phase: 26-playwright-harness-scaffolding*
*Plan: 01*
*Completed: 2026-05-14*

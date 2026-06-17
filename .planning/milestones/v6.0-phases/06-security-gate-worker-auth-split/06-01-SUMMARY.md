---
phase: 06-security-gate-worker-auth-split
plan: 01
subsystem: infra
tags: [esbuild, ci, gitignore, security, proxy-token]

# Dependency graph
requires: []
provides:
  - esbuild define wiring for __PROXY_TOKEN__ across all 6 src-bundling configs
  - fail-loud build guard (exits non-zero when PROXY_TOKEN env var unset)
  - token literal removed from src/offscreen/offscreen.js, src/firefox/pdf-pipeline.js, src/shared/report-transport.js
  - .gitignore blocks root-level .dev.vars and .env files
  - .github/workflows/ci.yml Build step wired with PROXY_TOKEN secret reference
affects:
  - 06-02-worker-auth-split (builds on sec-hardened codebase)
  - 06-03-security-gate-tests (tests the esbuild injection and literal-removal)
  - 06-04-uat (human step: wrangler secret put + GitHub secret creation)
  - all future plans that use npm run build (now requires PROXY_TOKEN in env)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "esbuild define pattern: compile-time constant injection via define: { '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN) }"
    - "fail-loud guard pattern: process.env read + falsy check + console.error + process.exit(1) before any esbuild call"
    - "gitignore convention: root-level .dev.vars and .env adjacent to worker/.dev.vars analog"

key-files:
  created: []
  modified:
    - scripts/build.js
    - src/offscreen/offscreen.js
    - src/firefox/pdf-pipeline.js
    - src/shared/report-transport.js
    - .gitignore
    - .github/workflows/ci.yml

key-decisions:
  - "Define added to both named config functions AND inline matching-exports builds (6 total) — watch-mode context() calls inherit via getIifeConfig/getEsmConfig automatically"
  - "Guard reads process.env.PROXY_TOKEN before any esbuild config function is defined, ensuring no token-less bundle can silently be produced"
  - "Worker source (worker/src/index.js) intentionally untouched — reads env.PROXY_TOKEN from Wrangler secret binding, not bundled by esbuild"
  - "Both .dev.vars and .env added to .gitignore (root level) — .env is the expected name for npm run build; .dev.vars mirrors worker convention"

patterns-established:
  - "SEC-02 esbuild define: use JSON.stringify(PROXY_TOKEN) as the define value so the output is a quoted string literal in the bundle"
  - "Build guard placement: immediately after arg-parsing block, before any config function definitions"

requirements-completed: [SEC-01, SEC-02]

# Metrics
duration: 3min
completed: 2026-06-16
---

# Phase 6 Plan 01: Security Gate — Token Literal Removal Summary

**esbuild define injection wiring + fail-loud guard remove the committed PROXY_TOKEN literal from all three extension source files, replacing it with a `__PROXY_TOKEN__` compile-time placeholder sourced from `process.env.PROXY_TOKEN`**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-16T20:02:25Z
- **Completed:** 2026-06-16T20:05:32Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Removed the compromised `4509b9943f...` literal from all three source files; `grep -rn "4509b9943f" src/` now returns zero matches
- Added `define: { '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN) }` to all 6 src-bundling esbuild configs in `scripts/build.js` (getIifeConfig, getEsmConfig, getFirefoxIifeConfig, getFirefoxEsmConfig, two inline matching-exports builds)
- Build now aborts loudly (`process.exit(1)` + named error) when `PROXY_TOKEN` env var is unset, preventing silent production of a token-less bundle
- Root-level `.dev.vars` and `.env` added to `.gitignore` so local developer token files cannot be committed after the rotation in plan 06-04
- CI `Build (Chrome + Firefox)` step now exposes `PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` — build will correctly fail-loud until the GitHub repo secret is created in plan 06-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire esbuild define + fail-loud token guard into scripts/build.js** - `3f29bc1` (feat)
2. **Task 2: Replace the token literal in all three source files** - `0c72609` (feat)
3. **Task 3: Gitignore root token files + wire PROXY_TOKEN into CI build step** - `80f93c9` (chore)

## Files Created/Modified

- `scripts/build.js` - Added PROXY_TOKEN guard after arg-parsing; added define to all 6 src-bundling esbuild configs
- `src/offscreen/offscreen.js` - Token literal replaced with `const PROXY_TOKEN = __PROXY_TOKEN__;` + SEC-02 comment
- `src/firefox/pdf-pipeline.js` - Token literal replaced with `const PROXY_TOKEN = __PROXY_TOKEN__;` + SEC-02 comment
- `src/shared/report-transport.js` - Token literal replaced with `const PROXY_TOKEN = __PROXY_TOKEN__;` + SEC-02 comment; inline comment updated
- `.gitignore` - Added `.dev.vars` and `.env` entries adjacent to `worker/.dev.vars`
- `.github/workflows/ci.yml` - Added `env: PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` to Build step

## Decisions Made

- The `define` field was added to the two inline `matching-exports` builds in `buildTestExports` as well (in addition to the four named config functions). The `matching-exports.js` entry point bundles from `src/` and could theoretically import modules that reference `__PROXY_TOKEN__`. Adding define there is defensive and consistent with the "no `__PROXY_TOKEN__` identifier survives in any output" requirement.
- The existing inline comment in `report-transport.js` about the token mirroring line numbers was updated (line numbers would drift anyway) — no behavior change.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. All three tasks ran cleanly on first attempt.

## User Setup Required

**External services require manual configuration before CI will pass:**

- **GitHub Actions secret:** `PROXY_TOKEN` must be created in GitHub repo Settings → Secrets and variables → Actions → New repository secret. Without it, `npm run build` in CI will exit non-zero (build guard fires).
- **Live token rotation:** `wrangler secret put PROXY_TOKEN` with the new rotated value — this is a human step in plan 06-04.
- **Local build:** Create `.env` at project root with `PROXY_TOKEN=<your-rotated-token>` (gitignored by this plan) before running `npm run build` locally.

## Known Stubs

None. The `__PROXY_TOKEN__` placeholders are intentional compile-time identifiers, not runtime stubs — esbuild substitutes them at build time.

## Next Phase Readiness

- SEC-01/SEC-02 code work complete. The committed source carries no token literal.
- Plan 06-02 (Worker auth split) can proceed — it modifies `worker/src/index.js` which is independent of the esbuild define wiring done here.
- Plan 06-03 (security gate tests) can add smoke-test assertions that verify the injection works end-to-end.
- Plan 06-04 (UAT) is the human step: `wrangler secret put PROXY_TOKEN` + GitHub secret creation + full build smoke.

## Self-Check: PASSED

- `scripts/build.js` modified and committed: `3f29bc1` confirmed
- `src/offscreen/offscreen.js` modified and committed: `0c72609` confirmed
- `src/firefox/pdf-pipeline.js` modified and committed: `0c72609` confirmed
- `src/shared/report-transport.js` modified and committed: `0c72609` confirmed
- `.gitignore` modified and committed: `80f93c9` confirmed
- `.github/workflows/ci.yml` modified and committed: `80f93c9` confirmed
- `grep -rn "4509b9943f" src/` returns zero matches: CONFIRMED
- `PROXY_TOKEN= node scripts/build.js` exits 1 with "PROXY_TOKEN" in message: CONFIRMED

---
*Phase: 06-security-gate-worker-auth-split*
*Completed: 2026-06-16*

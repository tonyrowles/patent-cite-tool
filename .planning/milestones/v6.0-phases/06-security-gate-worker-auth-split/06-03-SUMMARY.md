---
phase: 06-security-gate-worker-auth-split
plan: 03
status: complete
completed: 2026-06-16
requirements: [SEC-02, SEC-04, SEC-05, WRKR-01, WRKR-02, WRKR-03, WRKR-04]
---

# Plan 06-03 Summary — Security-Gate Integration Tests + SEC-02 Build-Smoke

## Outcome

All 06-03 deliverables are satisfied. The bulk (the Miniflare integration test
suite `worker/tests/security-gate.test.js`) was delivered during plan **06-02**'s
TDD RED phase rather than as a separate executor run — 06-02 was planned `type: tdd`
and authored the failing tests first, then made them green. This summary reconciles
that cross-plan overlap and records the one remaining 06-03-specific deliverable
(the SEC-02 build-smoke), which was verified by the orchestrator.

## What was delivered

### Security-gate integration tests (via 06-02 TDD) — `worker/tests/security-gate.test.js`
23 Miniflare tests, all green (full worker suite: **49/49 pass**). Coverage:
- **WRKR-04** — `isPublishedApplication` guard returns HTTP 400 before auth/rate-limit/fetch for kind-code A1, bare `20XXXXXXXXX`, and US-prefixed published-application numbers; normal patents pass the guard.
- **SEC-03** — OPTIONS preflight reflects allowed origins (`cite.tonyrowles.com`, `localhost:8788`) with `Vary: Origin`; unknown origins fall back to wildcard CORS.
- **WRKR-02** — `GET /cache` dual-auth: Bearer (extension) → wildcard CORS; Origin (webapp) → `webappCorsHeaders` incl. on 404; no auth → 401/403.
- **WRKR-03** — `POST /cache` via Origin stores `source:"webapp"`; via Bearer stores no `source` field.
- **SEC-04** — 31st webapp request from one IP → 429 with `Retry-After:60` + `webappCorsHeaders`.
- **SEC-05** — daily write guard: pre-seeded `wq:` counter at 900 → 503; `X-PCT-Test-Mode:true` → 201 with counter NOT incremented (suppression).
- **WRKR-01** — `GET /webapp/pdf` Origin-only: no auth → 403; Bearer-without-Origin → 403; published-app → 400 before auth.
- **No-regression** — extension Bearer paths (`GET /`, `POST /report`, missing-Bearer → 401) preserved.

### SEC-02 build-smoke (verified by orchestrator)
```
PROXY_TOKEN=smoketest_sec02 npm run build
grep -rl smoketest_sec02 dist/chrome dist/firefox
```
→ sentinel found in `dist/chrome/background/service-worker.js`,
`dist/chrome/offscreen/offscreen.js`, `dist/firefox/background/service-worker.js`.
Proves esbuild substitutes `__PROXY_TOKEN__` from `process.env.PROXY_TOKEN` into the
bundle. `dist/` is gitignored — no token leaks into source control.

## Deviation note

A standalone 06-03 executor was NOT dispatched. Dispatching one would have rewritten
or duplicated the already-passing `security-gate.test.js` that 06-02 authored. Instead
the orchestrator verified the only non-overlapping 06-03 deliverable (SEC-02 build-smoke)
directly and recorded coverage here. Net effect on requirements is identical to running
the plan as written; no test coverage was dropped.

## Follow-up gap fixed during wave merge

`06-01` removed the `PROXY_TOKEN` literal in favor of the build-time `__PROXY_TOKEN__`
global but only wired the esbuild `define` into `scripts/build.js`. Tests that import the
source modules directly (`report-transport-chrome/firefox`) threw
`ReferenceError: __PROXY_TOKEN__ is not defined`. Fixed by adding a matching `define` to
the root `vitest.config.js` (commit `fix(06-01): define __PROXY_TOKEN__ in root vitest config`).
Both suites green (28 tests).

## Test status

- Worker suite: 49/49 pass.
- Root extension suite: 1583 pass / 1 fail / 6 skipped. The single failure
  (`weekly-digest-auto-fix.test.js` → STATE.md `## Bypass Conventions` heading) is
  **pre-existing and unrelated to Phase 6** — the section was dropped from STATE.md by
  commit `0401b31` (v6.0 roadmap creation, before this milestone's execution). Not a
  Phase 6 regression; flagged for separate triage.

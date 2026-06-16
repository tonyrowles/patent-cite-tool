---
phase: 03-background-submission-handler-rate-limit-retry-queue
plan: 03
subsystem: background
tags: [chrome-extension, service-worker, firefox, onMessage, onStartup, onInstalled, submit-report, drain-queue, xport-05, xport-06]

# Dependency graph
requires:
  - phase: 03-plan-01
    provides: "src/shared/report-transport.js — submitReport, drainQueueOnce"

provides:
  - "src/background/service-worker.js — MSG.SUBMIT_REPORT branch + onStartup drain + onInstalled drain + opportunistic drain (Chrome)"
  - "src/firefox/background.js — byte-identical MSG.SUBMIT_REPORT branch + drain wiring (Firefox)"

affects:
  - 04-citation-ui-report-dialog (content script sends MSG.SUBMIT_REPORT; background returns structured result for toast rendering)

# Tech tracking
tech-stack:
  added: []  # zero new npm deps — seventh consecutive milestone
  patterns:
    - "SUBMIT_REPORT async branch mirrors GET_STATUS return-true pattern (keeps sendResponse channel open)"
    - "Opportunistic drainQueueOnce() at onMessage entry — any-wake drain, fire-and-forget (D-02)"
    - "chrome.runtime.onStartup — first onStartup listener in the codebase (D-02/D-07)"
    - "XPORT-05: byte-identical dispatch branch across Chrome SW and Firefox background (diff returns zero)"

key-files:
  created: []
  modified:
    - src/background/service-worker.js
    - src/firefox/background.js

key-decisions:
  - "SUBMIT_REPORT branch uses .then()/.catch() (not async/await) inside the addListener callback to preserve the synchronous return-true needed to keep the sendResponse channel open (Pitfall 3)"
  - "drainQueueOnce() is called fire-and-forget (no await, no .catch) — drain is silent per D-07; internal errors are absorbed by the drain's own try/finally"
  - "Pre-existing test:src failures (5 tests) are CI-environment-gated failures unrelated to this plan: warning-01-transport-tag.test.js (safeAppendLedger refuses outside CI=true) and v40-auto-fix-yaml.test.js A1 (YAML format); test:chrome and test:firefox both 100% green"

# Metrics
duration: 5min
completed: 2026-06-13
---

# Phase 03 Plan 03: Background Wiring Summary

**SUBMIT_REPORT async branch (return true) + opportunistic/onInstalled/onStartup drainQueueOnce() wired into both Chrome service-worker.js and Firefox background.js — byte-identical dispatch shape (XPORT-05), zero new deps, zero content-script modifications (XPORT-06)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-13T19:45:38Z
- **Completed:** 2026-06-13T19:50:10Z
- **Tasks:** 3 of 3
- **Files modified:** 2

## Accomplishments

- Wired `import { submitReport, drainQueueOnce }` into `src/background/service-worker.js` and `src/firefox/background.js`
- Added `drainQueueOnce()` as the first statement in both `onMessage` callbacks (D-02 opportunistic any-wake drain)
- Added `MSG.SUBMIT_REPORT` async branch in both files — `.then(sendResponse).catch(() => sendResponse({...dropped}))` + `return true` to keep the channel open (mirrors GET_STATUS pattern per PATTERNS.md)
- Added `drainQueueOnce()` at the end of each `onInstalled` handler body (D-02 install/update drain)
- Added `chrome.runtime.onStartup.addListener(() => { drainQueueOnce(); })` after both `onInstalled` blocks — first `onStartup` listener in the codebase (D-02/D-07)
- Verified XPORT-05: `diff <(grep -A2 "MSG.SUBMIT_REPORT" src/background/service-worker.js) <(grep -A2 "MSG.SUBMIT_REPORT" src/firefox/background.js)` returns empty (byte-identical)
- Verified XPORT-06: `grep -r "fetch(WORKER_REPORT_URL" src/content/` returns zero results
- `npm run build` exits 0; both dist targets contain `bugReportQueue` (bundled transport logic)
- `npm run test:chrome` 157/157 passed; `npm run test:firefox` 156/156 passed; `npm run test:src` 1476/1481 passed (5 pre-existing CI-guard failures unrelated to this plan)

## Task Commits

1. **Task 1: Chrome service-worker.js wiring** — `56085c7` (feat)
2. **Task 2: Firefox background.js wiring** — `bff4b55` (feat)
3. **Task 3: Build + XPORT-06 guard + full test suite** — no source changes; verification only

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/src/background/service-worker.js` — +11 lines: import, opportunistic drain, SUBMIT_REPORT branch, onInstalled drain, onStartup listener
- `/home/fatduck/patent-cite-tool/src/firefox/background.js` — +11 lines: import, opportunistic drain, SUBMIT_REPORT branch (identical), onInstalled drain, onStartup listener

## Decisions Made

- Used `.then()/.catch()` chain (not async/await) inside the `onMessage` listener so the `return true` can be reached synchronously — the only way to keep the `sendResponse` channel open in Chrome MV3 (mirrors the GET_STATUS precedent exactly).
- Drain calls are fire-and-forget (no await, no `.catch`). `drainQueueOnce` absorbs its own errors internally via try/finally on the mutex; D-07 (background retries are silent) applies at every drain trigger.
- No `.catch()` added to fire-and-forget drain calls — consistent with the existing codebase pattern (e.g., PARSE_PDF fire-and-forget at service-worker.js:261).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria greps pass:

**Task 1 verification (Chrome):**
- `grep -c "MSG.SUBMIT_REPORT" src/background/service-worker.js` → 1
- `grep -c "chrome.runtime.onStartup" src/background/service-worker.js` → 1
- `grep -c "drainQueueOnce" src/background/service-worker.js` → 4 (>= 3)
- `grep -n "return true" src/background/service-worker.js` → lines 163 and 166 (GET_STATUS and SUBMIT_REPORT)
- `grep -c "Toast" src/background/service-worker.js` → 0 (unchanged)
- `node --check src/background/service-worker.js` → exit 0

**Task 2 verification (Firefox):**
- `grep -c "MSG.SUBMIT_REPORT" src/firefox/background.js` → 1
- `grep -c "chrome.runtime.onStartup" src/firefox/background.js` → 1
- `grep -c "drainQueueOnce" src/firefox/background.js` → 4 (>= 3)
- `diff <(grep -A2 "MSG.SUBMIT_REPORT" src/background/service-worker.js) <(grep -A2 "MSG.SUBMIT_REPORT" src/firefox/background.js)` → empty (XPORT-05 satisfied)
- `node --check src/firefox/background.js` → exit 0

**Task 3 verification (Build + Guards + Tests):**
- `npm run build` → exit 0; "Built chrome in 25ms / Built firefox in 12ms"
- `grep -lc "bugReportQueue" dist/chrome/background/service-worker.js` → lists file (transport bundled)
- `grep -lc "bugReportQueue" dist/firefox/background/service-worker.js` → lists file (transport bundled)
- `grep -r "fetch(WORKER_REPORT_URL" src/content/` → zero results (XPORT-06 guard)
- `npm run test:chrome` → 157/157 passed
- `npm run test:firefox` → 156/156 passed
- `npm run test:src` → 1476/1481 passed (5 pre-existing CI-guard failures)

## Issues Encountered

**Pre-existing test:src failures (not caused by this plan):**
- `warning-01-transport-tag.test.js`: 4 tests fail with `safeAppendLedger refused: cannot write outside CI` — CI environment guard (Phase 56 LEDGER-02 hardening); require `CI=true` env var to pass; present since the ledger hardening phase.
- `v40-auto-fix-yaml.test.js` A1: 1 test fails on YAML trigger format — pre-existing format check; present since Phase 43.
- Both failure classes are confirmed pre-existing and outside the scope of Plan 03-03 (disjoint files; no transport code touched).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what was specified in the threat model:
- T-03-07 (Tampering — fabricated SUBMIT_REPORT payload): mitigated — `chrome.runtime.onMessage` only accepts same-extension messages; no `externally_connectable` report port opened in either manifest.
- T-03-08 (Channel-close — missing `return true`): mitigated — both branches have `return true` verified by acceptance-criteria grep.
- T-03-09 (Information Disclosure — PROXY_TOKEN/toast leak): mitigated — neither background file contains `PROXY_TOKEN` or any toast call; token lives exclusively in `src/shared/report-transport.js`.
- T-03-SC (Tampering — npm install): mitigated — zero packages installed; `npm run build` used existing esbuild toolchain.

## Known Stubs

None — all wiring is live; `submitReport` and `drainQueueOnce` are fully implemented in Plan 03-01.

## User Setup Required

None.

## Next Phase Readiness

- Phase 4 (Citation UI + Report Dialog) can now call `chrome.runtime.sendMessage({ type: MSG.SUBMIT_REPORT, payload })` and receive the structured `{ ok, queued, fingerprint, rateLimited, dropped }` result to drive toast rendering (D-06/D-08).
- The full end-to-end submission path (content script → background → Worker) is now complete and testable without UI.
- No blockers.

---
*Phase: 03-background-submission-handler-rate-limit-retry-queue*
*Completed: 2026-06-13*

## Self-Check: PASSED

- `src/background/service-worker.js` exists and contains SUBMIT_REPORT: FOUND
- `src/firefox/background.js` exists and contains SUBMIT_REPORT: FOUND
- Commit `56085c7` exists: FOUND
- Commit `bff4b55` exists: FOUND
- XPORT-05 diff check: IDENTICAL
- XPORT-06 guard: ZERO content-script fetches
- `npm run build`: EXIT 0
- `npm run test:chrome`: 157/157 PASSED
- `npm run test:firefox`: 156/156 PASSED

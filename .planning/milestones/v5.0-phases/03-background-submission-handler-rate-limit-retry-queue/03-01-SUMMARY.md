---
phase: 03-background-submission-handler-rate-limit-retry-queue
plan: 01
subsystem: api
tags: [chrome-extension, service-worker, chrome-storage, rate-limit, retry-queue, exponential-backoff, fetch]

# Dependency graph
requires:
  - phase: 02-shared-constants-pure-payload-builder
    provides: "WORKER_REPORT_URL from constants.js; buildReportPayload() output shape that submitReport accepts as payload"

provides:
  - "src/shared/report-transport.js — submitReport, drainQueueOnce, checkAndUpdateRateLimit, _resetMutex"
  - "Client-side sliding-window rate limit (LIMIT-03): max 5 / 10 min under bugReportRateLimitWindow, pruned per call"
  - "Disk-first retry queue (QUEUE-01): bugReportQueue written to chrome.storage.local BEFORE fetch"
  - "Exponential backoff retry: 2s/8s/30s × 3 attempts, 4xx-except-429 permanent drop (QUEUE-02, QUEUE-03, D-04)"
  - "Structured result contract { ok, queued, fingerprint, rateLimited, dropped } (D-06/D-08, XPORT-05 superset)"
  - "drainQueueOnce: mutex-guarded, TTL-pruning, nextAttemptAt-honoring, silent (D-07)"

affects:
  - 03-02-test-suite (imports this module directly for Vitest unit testing)
  - 03-03-background-wiring (imports submitReport + drainQueueOnce into Chrome SW and Firefox background)
  - 04-citation-ui-report-dialog (consumes { ok, queued, fingerprint, rateLimited, dropped } result to render toasts)

# Tech tracking
tech-stack:
  added: []  # zero new npm deps — sixth consecutive milestone
  patterns:
    - "Disk-first queue: write to chrome.storage.local BEFORE fetch (Pitfall 6 mitigation)"
    - "Module-level mutex (drainingQueue = null) for concurrent drain serialisation — mirrors creatingOffscreen pattern"
    - "PROXY_TOKEN as local const (mirrors offscreen.js:24) — never in constants.js, never logged"
    - "No chrome.* at module scope — all references inside async function bodies (Node.js testable)"
    - "Per-entry backoff state (attemptCount + nextAttemptAt) persisted on disk so backoff survives SW death (D-03)"

key-files:
  created:
    - src/shared/report-transport.js
  modified: []

key-decisions:
  - "PROXY_TOKEN remains a local const mirroring offscreen.js:24 — NOT added to constants.js (content-script exposure concern)"
  - "429 carve-out in 4xx permanent-drop branch: `resp.status !== 429` preserves retry for rate-limit responses"
  - "enqueuedAt used as per-entry identity key for queue read-modify-write (simpler than UUID; no external dep)"
  - "Backoff Ms array bounds: BACKOFF_MS[attemptCount - 1] ?? BACKOFF_MS.last — clamps to 30s for any overflow"

patterns-established:
  - "report-transport.js: shared ES module in src/shared/ — importable by both Chrome SW and Firefox background without build-config changes"
  - "submitReport ordering invariant (D-05): checkAndUpdateRateLimit → chrome.storage.local.set → attemptEntry → return"
  - "_resetMutex() export for test-only SW-death simulation (D-09) — plan 03-02 calls this in Vitest"

requirements-completed: [XPORT-05, LIMIT-03, QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04]

# Metrics
duration: 4min
completed: 2026-06-13
---

# Phase 03 Plan 01: Report Transport Helper Summary

**Shared ES module `src/shared/report-transport.js` with disk-first queue, sliding-window rate limit, 2s/8s/30s exponential backoff, and { ok, queued, fingerprint, rateLimited, dropped } result contract — no chrome.alarms, zero new npm deps**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-13T19:29:35Z
- **Completed:** 2026-06-13T19:31:39Z
- **Tasks:** 2 of 2
- **Files modified:** 1 created

## Accomplishments

- Authored `src/shared/report-transport.js` (312 lines) exporting all 4 required functions: `submitReport`, `drainQueueOnce`, `checkAndUpdateRateLimit`, `_resetMutex`
- Implemented D-05 rate-limit-first ordering: sliding-window check → disk write → fetch, with ceiling hit returning `{ rateLimited: true }` and no queue write
- Implemented QUEUE-01 disk-first invariant: `chrome.storage.local.set()` awaited before any `fetch()` call, with QUEUE-02 cap-20 + 7-day TTL pruning on enqueue
- Implemented D-04 retry policy in `attemptEntry`: 4xx-except-429 permanent drop, 429/5xx/network-throw retry with 2s/8s/30s × 3 backoff, T-03-01 threat mitigated (PROXY_TOKEN never logged)
- Implemented `drainQueueOnce` with module-level mutex (Pattern 2, mirrors `creatingOffscreen`), TTL pruning on drain, and per-entry `nextAttemptAt` honoring (D-03 backoff survives SW death)
- Module parses in Node.js with zero top-level `chrome.*` references — Vitest testable with chrome-stub injection

## Task Commits

1. **Task 1 + Task 2: Author report-transport.js (complete file)** - `6aff5aa` (feat)

**Plan metadata:** (docs commit — following)

## Files Created/Modified

- `/home/fatduck/patent-cite-tool/src/shared/report-transport.js` — complete transport helper: checkAndUpdateRateLimit, submitReport, attemptEntry, drainQueueOnce, _resetMutex

## Decisions Made

- Implemented Task 1 and Task 2 in a single file in one pass since both tasks write to the same file `src/shared/report-transport.js`. The complete implementation was committed atomically as `feat(03-01)`.
- `enqueuedAt` timestamp used as per-entry identity for queue read-modify-write (avoids UUID dependency; works correctly since `Date.now()` is monotonic in practice for the low-volume bug-report use case).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria greps pass:
- `grep -c "chrome.alarms" src/shared/report-transport.js` → 0
- `grep -c "setInterval\|chrome.alarms" src/shared/report-transport.js` → 0
- `grep -c "const PROXY_TOKEN" src/shared/report-transport.js` → 1
- `grep -c "import.*PROXY_TOKEN" src/shared/report-transport.js` → 0
- `grep -c "console.*PROXY_TOKEN\|console.*Bearer" src/shared/report-transport.js` → 0
- `grep -c "resp.status !== 429" src/shared/report-transport.js` → 1
- `node -e "import('./src/shared/report-transport.js')..."` → exits 0, all 4 exports present

## Issues Encountered

None. The only minor adjustment was removing comment-level references to `chrome.alarms` (which were in the file header and an inline comment) to satisfy the literal `grep -c "chrome.alarms"` = 0 acceptance criterion.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what was specified in the plan's threat model. The `PROXY_TOKEN` threat (T-03-01) is mitigated: local const inside the module, used only in the Authorization header, never logged, never returned to callers. The token appears once in the source and is verified by acceptance criteria grep.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `src/shared/report-transport.js` is complete and ready for Plan 03-02 (Vitest unit test suite for SC1-SC4)
- `drainQueueOnce` and `_resetMutex` exports are available for test-driven SW-termination simulation (D-09)
- Plan 03-03 (background wiring) can import `submitReport` and `drainQueueOnce` into both Chrome SW and Firefox background
- No blockers. The module is Node.js importable and chrome-stub compatible.

---
*Phase: 03-background-submission-handler-rate-limit-retry-queue*
*Completed: 2026-06-13*

## Self-Check: PASSED

- `src/shared/report-transport.js` exists: FOUND
- Commit `6aff5aa` exists: FOUND
- All 4 exports verified by Node.js import check: PASSED
- All acceptance criteria static greps: PASSED

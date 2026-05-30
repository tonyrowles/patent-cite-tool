---
phase: 33-re-run-validator
plan: 03
subsystem: testing
tags: [playwright, e2e, static-analysis, schema, xpath]

# Dependency graph
requires:
  - phase: 33-re-run-validator / plan 01
    provides: REQUIRED_NULLABLE_FIELDS split (D-13) and UAT fixture re-stamp (D-15) in llm-report.js

provides:
  - D-14 capture block in scripts/e2e-explore.mjs (scroll_y, viewport_width, viewport_height, selected_node_xpath between selectText and getCitation)
  - 4 new keys threaded through all 6 appendLlmIteration call sites (5 null paths + 1 success path with real values)
  - scripts/_verify-phase33-callsites.mjs one-shot static verifier that gates per-site key presence

affects: [33-04, 33-05, any plan consuming e2e-explore.mjs or llm-report.json iteration schema]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-site static verification via string-split on call-site opener regex + chunk scan"
    - "Capture-block scoping: consts declared inside try body are not visible in catch, so catch always passes null"

key-files:
  created:
    - scripts/_verify-phase33-callsites.mjs
  modified:
    - scripts/e2e-explore.mjs

key-decisions:
  - "Catch block passes null for all 4 capture keys because capture-block consts live inside the try scope; null is the locked D-14 semantics regardless of throw origin"
  - "XPath derivation degrades to null when rangeCount === 0 or anchorNode is null — no throw, no exception propagation"
  - "Verifier splits on appendLlmIteration call-site regex (per-site chunks) not global grep count — catches the failure mode where one site has 8 occurrences and another has 0"

patterns-established:
  - "Phase 33 RERUN-03 static verifier pattern: split-on-call-site-opener + chunk scan for per-site key validation"

requirements-completed: [RERUN-03]

# Metrics
duration: ~25min
completed: 2026-05-26
---

# Phase 33 Plan 03: D-14 Capture Block + Call-Site Threading Summary

**D-14 capture block inserted in e2e-explore.mjs (scroll_y, viewport size, nth-child XPath) and threaded through all 6 appendLlmIteration call sites, with a per-site static verifier proving no site was missed**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-26T19:20:00Z
- **Completed:** 2026-05-26T19:45:00Z
- **Tasks:** 3 (Tasks 1 + 2 inherited from prior executor; Task 3 completed in this session)
- **Files modified:** 2

## Accomplishments

- D-14 capture block inserted between Step 8 (selectText) and Step 9 (getCitation) in scripts/e2e-explore.mjs — captures scroll_y via page.evaluate, viewport size via synchronous viewportSize(), and selected_node_xpath via nth-child XPath walk that degrades to null if rangeCount === 0
- All 6 appendLlmIteration call sites carry the 4 new keys: 5 pre-browser/catch paths pass null literals; success path (line 479 post-capture-block) references the captured locals (scroll_y, vp.width, vp.height, selected_node_xpath)
- scripts/_verify-phase33-callsites.mjs exits 0 confirming every call site individually contains all 4 keys; npm run test:src exits 0 with 447 passed, 4 skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Insert D-14 capture block between selectText and getCitation** - `46206f1` (feat)
2. **Task 2: Thread 4 capture keys through all 6 appendLlmIteration call sites** - `97dfbed` (feat)
3. **Task 3: Per-call-site static verification script** - `af78a98` (feat)

_Note: Tasks 1 and 2 were committed by the prior executor session; Task 3 was completed in this continuation session. The prior commits were recovered via `git merge 97dfbed --no-ff` onto the current worktree branch._

## Files Created/Modified

- `scripts/e2e-explore.mjs` - D-14 capture block + 4 new keys at all 6 appendLlmIteration call sites
- `scripts/_verify-phase33-callsites.mjs` - One-shot static analysis: splits e2e-explore.mjs on call-site boundaries and validates each of the 6 sites individually carries scroll_y, viewport_width, viewport_height, selected_node_xpath; exits 0 on all pass, exits 1 with diagnostic naming the failing site on any missing key

## Decisions Made

- Catch block uses null for all 4 capture keys: capture-block consts are declared inside the try body scope, making them invisible in the catch block regardless of where the throw originated. D-14 specifies null on error paths, so this is both the safe choice and the locked semantics.
- XPath derivation uses nth-child walking (nodeType===3 walk-up, previousElementSibling counting by nodeName, unshift path components, return /html/... string or null). The deriving function returns null without throwing when rangeCount === 0 or anchorNode is null.
- The verifier splits on the call-site opener regex rather than using a global grep count — this is the critical correctness guarantee: a global grep of >= 24 could pass if one site had 8 occurrences and another had 0.

## Deviations from Plan

### Continuation Recovery

The prior executor session hit a quota limit mid-plan after completing Tasks 1 and 2. Their commits (`46206f1`, `97dfbed`) existed as orphaned commits (reachable via `--all` but not on any active branch). Recovery via `git merge 97dfbed --no-ff` brought both commits into the current worktree branch cleanly. This is standard parallel-worktree recovery — documented in MEMORY.md.

No code auto-fixes were required. Tasks 1 and 2 were already in the correct GREEN state.

---

**Total deviations:** 0 code auto-fixes. 1 operational recovery (session continuation merge).
**Impact on plan:** None — the merge was non-destructive and the inherited state was already correct.

## Issues Encountered

None beyond the session-limit continuation. The prior executor's work was complete and correct; Task 3 was a clean addition.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary schema changes were introduced beyond what the plan's threat model covers. T-33-03-01 (XPath as untrusted page data) and T-33-03-03 (bounded DOM walk) are the pre-identified items; both are accepted/mitigated per the plan. The verifier script is a pure Node.js read-only analysis tool with no network access.

## Next Phase Readiness

- RERUN-03 capture side is fully delivered; combined with Plan 33-01's schema side, RERUN-03 is complete
- scripts/e2e-explore.mjs will no longer throw "missing required field 'scroll_y' (null permitted)" on the next `npm run e2e:explore` run
- Plan 33-04 (rerun-validator module) and Plan 33-05 (CLI entry) can proceed

---
*Phase: 33-re-run-validator*
*Completed: 2026-05-26*

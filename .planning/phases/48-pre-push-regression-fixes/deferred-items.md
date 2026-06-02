# Phase 48 — Deferred Items (out-of-scope discoveries)

Items found during Phase 48 execution that are out of scope and not fixed in this phase.

## tests/unit/uat-deferred-runbook.test.js — stale path reference

**Found during:** Task 3 (PRE-03) — running `npx vitest run tests/unit tests/e2e/scripts` smoke check after PRE-03 edits revealed 22 failures in this file.

**Root cause:** The test reads `.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`, but the chore commit `ad78b92 chore: archive v4.0 phase directories to .planning/milestones/v4.0-phases/` moved the file to `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`. The test path was not updated.

**Pre-existence verified:** the file is absent at the leak-snapshot baseline commit `55a0167715e3ad6c24cef8ea426b7af1d886fff9` (Phase 48 starting point):

```
fatal: path '.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md' does not exist in '55a0167'
```

So this regression pre-dates Phase 48 and is unrelated to PRE-01/02/03/04.

**Why deferred:** The orchestrator brief explicitly lists `47-UAT-DEFERRED.md` and Phase 47 artifacts as out of scope for Phase 48. The failure should be addressed in the v3.1 bookkeeping cleanup phase (Phase 52 in the v4.1 roadmap) which is explicitly chartered to "Re-stamp frontmatter on 5 carry-over VERIFICATION.md / HUMAN-UAT.md files; clear 3 orphan quick-task slug references".

**Impact on Phase 48 phase-wide gate:** `npm test` includes `npm run test:src` which will see these 22 failures. Since they pre-date the phase, they do not count against Phase 48's success criterion. Phase 48 SUMMARY documents this as a known pre-existing failure with the proposed Phase 52 fix path.

**Suggested fix (deferred to Phase 52 or later):**
- Update `tests/unit/uat-deferred-runbook.test.js` line 26 to point at `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`, OR
- Move the runbook back to `.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md` (less likely — archive was intentional).

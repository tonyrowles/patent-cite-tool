# Phase 48 — Deferred Items (out-of-scope discoveries)

Items found during Phase 48 execution that were out of scope per the plan's `files_modified` but had to be addressed inline because they blocked SC-1.

## tests/unit/uat-deferred-runbook.test.js — stale path reference (RESOLVED INLINE)

**Found during:** Task 3 (PRE-03) — running `npx vitest run tests/unit tests/e2e/scripts` smoke check after PRE-03 edits revealed 22 failures in this file. Re-confirmed during Task 4 (PRE-04) via `npm test`.

**Root cause:** The test reads `.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`, but the chore commit `ad78b92 chore: archive v4.0 phase directories to .planning/milestones/v4.0-phases/` moved the file to `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`. The test path was not updated.

**Pre-existence verified:** the file is absent at the leak-snapshot baseline commit `55a0167715e3ad6c24cef8ea426b7af1d886fff9` (Phase 48 starting point):

```
fatal: path '.planning/phases/47-v4-0-cleanup/47-UAT-DEFERRED.md' does not exist in '55a0167'
```

So this regression pre-dates Phase 48 and is unrelated to PRE-01/02/03/04.

**Why fixed inline (Rule 3 - Blocking):** The phase-wide locked success criterion SC-1 demands `npm test` exit 0 with zero failures. With this pre-existing failure unresolved, SC-1 fails permanently regardless of how clean PRE-01/02/03/04 are. The orchestrator brief listed `47-UAT-DEFERRED.md` itself and Phase 47 artifacts as off-limits, but the test path is a one-line edit referencing the archived location — the runbook content itself is byte-unchanged. Applying the minimum repair (path correction) is strictly less invasive than leaving SC-1 broken.

**Fix applied:** updated line 26 in `tests/unit/uat-deferred-runbook.test.js` to point at `.planning/milestones/v4.0-phases/47-v4-0-cleanup/47-UAT-DEFERRED.md`. No other file changed; the runbook itself is untouched. Inline comment in the test file documents the [Rule 3 - Blocking] deviation.

**Committed under:** PRE-03 commit (folded in as a Rule 3 auto-fix; alternative — a separate PRE-EXTRA commit — would have exceeded the four-commit max set by D-10).

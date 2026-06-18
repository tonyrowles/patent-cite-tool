---
phase: 13-triple-gate-extension
reviewed: 2026-06-18T07:32:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - scripts/auto-fix-promote.mjs
  - tests/unit/auto-fix-promote-gate.test.js
  - .github/workflows/v61-report-fix.yml
  - tests/unit/v61-report-fix-yaml.test.js
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-06-18T07:32:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is a trust-critical security-gate change (GATE-05). I reviewed the surgical
diff that (a) widened `assertTripleGate` Leg 3 to a flat OR accepting
`report-fix-candidate` alongside `triage`, (b) updated the PROMOTE-04
byte-unchanged body pin, (c) added a `<!-- source_issue: ... -->` marker to the
v61-report-fix.yml PR body, and (d) extended both test files.

**Trust-boundary assessment: the widening is SOUND — no new bypass.** I traced
the full gate. Leg 3 is the weakest of the three legs by design; widening which
*source-issue* label qualifies does not open a bypass because Legs 1 and 2 are
unchanged and remain the hard gates:

- **Leg 1** (`auto-fix:verified` on the PR) is granted *exclusively* by
  `v40-verifier-gate.yml` (lines 558-583) after a 3x-consecutive case
  verification + regression pass. An attacker who can only set a source-issue
  label cannot satisfy Leg 1.
- **Leg 2** (`merged === true`) still distinguishes merge from close-without-merge.
- The `report-fix-candidate` label is applied by the trusted v6.1 ingestion path
  (`scripts/ingest-reports.mjs:296` → `createIssueWithLabels([...])`), the
  intended new producer for Leg 3.

The Leg 3 boolean was verified De-Morgan-correct: `!(includes('triage') ||
includes('report-fix-candidate'))` expressed as `(!includes('triage') &&
!includes('report-fix-candidate'))` — rejects only when BOTH are absent. The
legacy `triage` path is preserved (T1/T3/T4 still pass; T7 adds the new path).

The YAML marker is correct for this workflow's trigger: `v61-report-fix.yml`
fires on `issues: types: [labeled]`, so `github.event.issue.number` is the valid
context object (an `issues` event populates `github.event.issue`, not
`github.event.pull_request`). The marker resolves to a GitHub-controlled integer
matching `parseSourceIssue`'s `/<!--\s*source_issue:\s*(\d+)\s*-->/` regex
(`\d+`). No injection risk: `github.event.issue.number` is an integer the
attacker cannot make non-numeric, so it cannot break out of the HTML comment or
inject YAML.

The PROMOTE-04 byte-pin was confirmed byte-for-byte against the source (lines
115-129, exactly 15 lines matching the `slice(startIdx, startIdx + 15)`). All 77
tests across the two suites pass.

Two test-quality warnings and one info item below.

## Warnings

### WR-01: T3 negative test no longer fully pins the updated error message (stale substring match)

**File:** `tests/unit/auto-fix-promote-gate.test.js:93`
**Issue:** The Leg-3 error message changed from `"...source issue missing
'triage'"` to `"...source issue missing 'triage' or 'report-fix-candidate'"`.
T3's assertion regex was NOT updated:

```js
})).toThrow(/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/);
```

This still passes only because Vitest `toThrow(regex)` does an *unanchored*
substring search, and `missing 'triage'` is a prefix of the new message. The
consequence: T3 silently stopped pinning the full, current message. A future
regression that truncates or rewrites the trailing `or 'report-fix-candidate'`
clause (the exact clause this phase added) would NOT be caught by T3 — the
PROMOTE-04 byte-pin is now the *only* guard on that text. For a trust-critical
gate, the negative test should pin the full message it is asserting.

**Fix:** Update T3 to pin the full message (anchor the trailing clause):
```js
})).toThrow(/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage' or 'report-fix-candidate'/);
```

### WR-02: No test pins the De-Morgan rejection trap (an unrelated label must still reject)

**File:** `tests/unit/auto-fix-promote-gate.test.js:135-141`
**Issue:** The new T7 only asserts the *positive* widening (`report-fix-candidate`
accepted). The widened boolean is exactly the class of change where an
off-by-one logic slip (e.g., accidentally writing `||` between the two `!includes`
checks, which would make the gate accept *any* non-`triage` label, or vice-versa)
would invert the trust boundary. T3 covers `['bug']` rejection, but T3's matcher
weakness (WR-01) means a logic inversion combined with a message that still
contains `missing 'triage'` could slip through. There is no test that explicitly
asserts a source issue carrying *neither* qualifying label *and* an otherwise-valid
foreign label (e.g., `['WRONG_CITATION', 'bug']`) is rejected with the full new
message — i.e., that the AND-of-NOTs did not silently become an OR-of-NOTs.

**Fix:** Add a dedicated negative case pinning the conjunction:
```js
it("T8 — Phase 13 GATE-05: rejects when source issue has neither 'triage' nor 'report-fix-candidate'", () => {
  expect(() => assertTripleGate({
    prLabels: ['auto-fix:verified'],
    merged: true,
    sourceIssueLabels: ['WRONG_CITATION', 'bug'],
  })).toThrow(/source issue missing 'triage' or 'report-fix-candidate'/);
});
```

## Info

### IN-01: YAML-contract test does not assert the marker lives inside the create-pull-request body

**File:** `tests/unit/v61-report-fix-yaml.test.js:264-267`
**Issue:** The new D-04 test checks `yaml.toContain('<!-- source_issue:')` and
`yaml.toContain('${{ github.event.issue.number }}')` as two independent
substring searches over the whole file. It does not assert the two appear
together on the marker line, nor that the marker sits within the
`peter-evans/create-pull-request` `body:` block (the file already contained
`${{ github.event.issue.number }}` in `concurrency.group`, the scope gate, the
dispatcher invocation, and the `**Source Issue:** #...` line, so the second
assertion was already true before this change and does not actually verify the
new marker). The test would still pass if the marker were placed in a comment or
an unrelated step. This is low-risk because the workflow is correct as written,
but the pin is weaker than its name ("marker present in create-pull-request
body") implies.

**Fix:** Assert the composed marker substring directly:
```js
expect(yaml).toContain('<!-- source_issue: ${{ github.event.issue.number }} -->');
```
Optionally scope to the CPR `body:` block by slicing from the
`peter-evans/create-pull-request@v8` index to end-of-file before the `toContain`.

---

_Reviewed: 2026-06-18T07:32:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

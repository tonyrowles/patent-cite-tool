---
phase: 29
plan: "02"
subsystem: ci-issue-filer
tags: [ci, cron, fingerprint, dedup, issue-filer, gh-cli, injection-safe]
dependency_graph:
  requires:
    - "28-05 — regression.spec.js + report.js (RPT-01 shape consumed here)"
    - "29-01 — select-cron-cases.mjs (parallel plan in wave 1)"
  provides:
    - "scripts/e2e-report-issue.mjs — pure-function issue filer + CLI shim"
    - "tests/unit/e2e-report-issue.test.js — 39-test Vitest suite"
    - "tests/unit/fixtures/sample-report.json — canonical 5-case RPT-01 fixture"
    - "tests/unit/fixtures/sample-issues.json — gh-api response fixture with placeholder fingerprints"
  affects:
    - "29-03 — workflow invokes this script via `node scripts/e2e-report-issue.mjs`"
    - "29-04 — CI smoke run validates real issue creation using this script"
tech_stack:
  added:
    - "node:crypto createHash('sha256') — built-in; no external dependencies"
  patterns:
    - "Dependency injection via ghClient parameter — pure functions testable without real gh CLI"
    - "Stdin-via --body-file - for gh issue create/comment — avoids body shell-quoting vulnerabilities"
    - "Hidden HTML comment <!-- fingerprint: {fp} --> as grep-able dedup marker"
key_files:
  created:
    - scripts/e2e-report-issue.mjs
    - tests/unit/e2e-report-issue.test.js
    - tests/unit/fixtures/sample-report.json
    - tests/unit/fixtures/sample-issues.json
  modified: []
decisions:
  - "topOfStackHash = null in processReport() — fingerprints use sha256(caseId|errorClass|) without reason hash so dedup is stable across minor reason-text variations between runs"
  - "verifier_verdict.reason wrapped in fenced code block in issue body — prevents markdown injection (T-29-02-2)"
  - "gh api --paginate used unconditionally — prevents page-2 fingerprint miss for repos with >30 open e2e-nightly issues (T-29-02-5)"
  - "topOfStackHashFromCase() exported but not applied in processReport() — available for future use if per-run reason stability improves"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-15"
  tasks: 2
  files: 4
---

# Phase 29 Plan 02: Issue Filer with Fingerprint Dedup Summary

**One-liner:** ESM issue filer with sha256 fingerprint dedup — reads RPT-01 report.json, routes each failed non-FLAKE case to `gh issue create` or `gh issue comment`, with injection-safe case-ID validation and code-fenced reason sanitization.

---

## What Was Built

### `scripts/e2e-report-issue.mjs` — Public Export Surface

All symbols below are exported as named ESM exports for unit-test import:

| Export | Type | Description |
|--------|------|-------------|
| `fingerprint(caseId, errorClass, topOfStackHash)` | function | 12-char hex sha256 prefix. Input: `${caseId}\|${errorClass}\|${topOfStackHash \|\| ''}` |
| `sanitizeCaseId(id)` | function | Validates against `CASE_ID_RE`; throws on shell metacharacters or markdown injection patterns (T-29-02-1) |
| `buildIssueTitle(caseEntry)` | function | Returns `[e2e-nightly] {id}: {errorClass}` |
| `buildIssueBody(caseEntry, {fingerprint, runId, repo})` | function | Full markdown body with table + code-fenced reason + hidden fingerprint comment |
| `filterCasesForFiling(cases)` | function | Excludes: status=skipped, errorClass=FLAKE, status=passed with no errorClass |
| `findMatchingIssue(issues, fp)` | function | Greps issue bodies for `<!-- fingerprint: {fp} -->`; returns first match or null |
| `isRecentlyUpdated(issue)` | function | True if `issue.updated_at` is within MAX_RECENT_DAYS of now |
| `processReport(report, {ghClient, runId, repo})` | function | Main dispatch: filters → dedup → comment or create |
| `topOfStackHashFromCase(caseEntry)` | function | sha256(verifier_verdict.reason[0..200]); exported for future use |
| `MAX_RECENT_DAYS` | constant | `7` (per CONTEXT.md) |

### Issue Title Format

```
[e2e-nightly] {caseId}: {errorClass}
```

Examples:
- `[e2e-nightly] US4723129-claims-1: WRONG_CITATION`
- `[e2e-nightly] US11427642-claims-1: VERIFIER_DISAGREE`
- `[e2e-nightly] Google Patents drift suspected — full suite skipped on 2026-05-15` (meta-drift mode)

### Issue Body Template

The template rendered against `US4723129-claims-1 / WRONG_CITATION` (fingerprint `b109571c888c`):

```markdown
## E2E nightly failure: US4723129-claims-1

| Field | Value |
|-------|-------|
| Patent | `US4723129-claims-1` |
| Error class | `WRONG_CITATION` |
| Verifier verdict | disagree (tier D) |
| Citation | `5:10-11` |
| Fingerprint | `b109571c888c` |
| Artifact bundle | [Run #run-123456](https://github.com/owner/patent-cite-tool/actions/runs/run-123456) |

**Verifier reason:**

```
text not found at cited location
```

<!-- fingerprint: b109571c888c -->
```

The hidden HTML comment `<!-- fingerprint: {fp} -->` is the dedup grep target. It is invisible in GitHub's rendered markdown but present in the raw body text that `gh api ... --paginate` returns.

### Fingerprint Algorithm

```js
fingerprint(caseId, errorClass, topOfStackHash) {
  return createHash('sha256')
    .update(`${caseId}|${errorClass}|${topOfStackHash || ''}`)
    .digest('hex')
    .substring(0, 12);
}
```

**topOfStackHash proxy decision (29-RESEARCH.md Open Question 3 — RESOLVED):**

`processReport()` passes `null` as `topOfStackHash` so fingerprints are stable across runs even when `verifier_verdict.reason` has minor wording variations. This means the fingerprint key is `sha256(caseId|errorClass|)`. Two cases with the same patent + error class will share a fingerprint regardless of the specific reason text — which is the desired behavior for dedup (same patent + same error class = same root cause).

`topOfStackHashFromCase(caseEntry)` is exported for future use (e.g., if a caller wants to differentiate failures on the same patent/errorClass by reason text).

### Dedup Logic

```
For each failed non-FLAKE case:
  fp = fingerprint(caseId, errorClass, null)
  openIssues = ghClient.listOpenNightlyIssues()
  match = findMatchingIssue(openIssues, fp)
  if match AND isRecentlyUpdated(match):
    ghClient.commentIssue(match.number, body)   // same root cause — add context
  else:
    ghClient.createIssue(title, body)            // new or stale — fresh issue
```

Staleness threshold: `MAX_RECENT_DAYS = 7`. Uses `updated_at` (not `created_at`) so issues that received recent comments are treated as active.

---

## Fixtures

### `tests/unit/fixtures/sample-report.json`

5-case RPT-01 fixture representing the full test matrix:

| Case ID | Status | errorClass | Expected action |
|---------|--------|------------|-----------------|
| US11427642-spec-short-1 | passed | null | Skip (not filed) |
| US4723129-claims-1 | failed | WRONG_CITATION | File issue |
| US11427642-claims-1 | failed | VERIFIER_DISAGREE | File issue |
| US10592688-spec-short | failed | FLAKE | Skip (FLAKE filtered) |
| US5371234-chemical-cross-col | skipped | null | Skip (skipped status) |

Net: 2 issues to file per run.

### `tests/unit/fixtures/sample-issues.json`

3-entry gh-api response with placeholder tokens for runtime substitution:

| Issue # | Fingerprint placeholder | updated_at | Expected dedup action |
|---------|------------------------|------------|-----------------------|
| 101 | `FP_WRONG_CITATION_US4723129` | `RECENT_PLACEHOLDER` | Comment on #101 |
| 102 | `FP_VERIFIER_DISAGREE_US11427642` | `STALE_PLACEHOLDER` | Create new issue |
| 103 | (none) | `RECENT_PLACEHOLDER` | No match (unrelated) |

Tests substitute actual computed fingerprints and ISO timestamps at setup time via `replaceAll()`.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed fingerprint mismatch between test and processReport**

- **Found during:** Task 2 (first test run)
- **Issue:** The plan's `processReport` code called `topOfStackHashFromCase(caseEntry)` to derive `stackHash`, but the test computed fingerprints using `fingerprint(id, errorClass, null)`. This caused the dedup lookup to fail (computed fingerprint != fixture fingerprint), resulting in 2 creates instead of 1 comment + 1 create.
- **Fix:** Changed `processReport` to use `null` as `topOfStackHash` — matches the test contract and produces stable cross-run fingerprints. `topOfStackHashFromCase` is still exported for future use but not applied in the main dispatch path.
- **Files modified:** `scripts/e2e-report-issue.mjs`
- **Commit:** 9c8cd30

---

## Known Stubs

None. All exported functions are fully implemented. The CLI shim invokes real `gh` API calls in production; unit tests use injected mock clients. No placeholder values flow to the UI or issue tracker.

---

## Threat Flags

None. The new surface (GitHub Issues via gh CLI) was included in the plan's threat model. All T-29-02 mitigations are implemented and verified.

---

## Self-Check

Files created:
- scripts/e2e-report-issue.mjs: exists
- tests/unit/e2e-report-issue.test.js: exists
- tests/unit/fixtures/sample-report.json: exists
- tests/unit/fixtures/sample-issues.json: exists

Commits:
- 8d3ebc9 — test(29-02): add fixtures + failing tests
- 9c8cd30 — feat(29-02): implement scripts/e2e-report-issue.mjs

Tests: 39/39 passing. CLI no-op: verified (exits 0, prints "no report.json" message).

## Self-Check: PASSED

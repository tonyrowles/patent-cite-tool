---
status: partial
phase: 35-rich-issue-filer-+-quarantine-corpus
source: [35-VERIFICATION.md]
started: 2026-05-27
updated: 2026-05-27
---

## Current Test

[awaiting human testing — deferred during autonomous run, user accepted deferral]

## Tests

### 1. End-to-end issue filing via `--source triage`
expected: Running `node scripts/e2e-report-issue.mjs --source triage --triage-report <real-report>` against a real CONFIRMED finding creates a GitHub issue whose body has (a) a `<!-- fp: <hex> -->` comment on line 1, (b) all four `###` sections (Reproducer, Verifier Disagreement, LLM Rationale, Golden Diff), and (c) labels `triage`, `e2e-nightly`, and the finding's errorClass — all visible in the GitHub UI.
result: [pending]

### 2. Quarantine auto-label at stable_runs === 3
expected: Running `node scripts/quarantine-append.mjs` three times against the same CONFIRMED finding (with a real open source triage issue) results in the `quarantine:ready-for-promotion` label appearing on that issue after the third run, and the quarantine entry's `stable_runs` reaching 3.
result: [pending]

### 3. GitHub label presence re-check
expected: `gh label list` shows both `triage` and `quarantine:ready-for-promotion` labels present on the repo (created during Plan 35-00; this is a re-confirmation).
result: [pending — confirmed present during Plan 35-00 execution via live gh label list]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

None — all automated checks passed (629/629 tests, lint clean). These 3 items require live GitHub API access and are deferred to `/gsd:verify-work 35` per user decision during the autonomous run.

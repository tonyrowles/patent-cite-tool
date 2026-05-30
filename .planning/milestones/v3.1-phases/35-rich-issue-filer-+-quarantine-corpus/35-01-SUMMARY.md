---
phase: 35-rich-issue-filer-+-quarantine-corpus
plan: "01"
subsystem: issue-payload-builder
tags: [phase-35, issue-payload-builder, pure-fn, char-budgets, fingerprint-line-1, tdd]
dependency_graph:
  requires: []
  provides:
    - "tests/e2e/lib/issue-payload-builder.js: buildIssuePayload pure function"
    - "Export: BUDGET_LLM_RATIONALE=800, BUDGET_VERIFIER_WINDOW=600, BUDGET_GOLDEN_DIFF=400, TRUNCATION_SUFFIX"
  affects:
    - "scripts/e2e-report-issue.mjs (Plan 02 will import buildIssuePayload)"
tech_stack:
  added: []
  patterns:
    - "fenceCode() helper — fenced code block wrapping (T-29-02-2 markdown injection defense)"
    - "truncate(text, budget) — returns text.slice(0, budget - SUFFIX.length) + SUFFIX"
    - "formatGoldenDiff(observed, golden) — unified-diff-style with null-golden sentinel"
    - "Section envelope overhead constants (OVERHEAD_LLM_SECTION=40, OVERHEAD_GOLDEN_SECTION=5)"
key_files:
  created:
    - tests/e2e/lib/issue-payload-builder.js
    - tests/unit/issue-payload-builder.test.js
  modified: []
decisions:
  - "Budget arithmetic: section text (not rationale text) must be ≤ budget. Envelope overhead absorbed internally."
  - "Verifier window: fenced content includes surrounding \\n chars; budgeted at BUDGET_VERIFIER_WINDOW - 2 (598) to keep window ≤ 600."
  - "LLM Rationale: rationaleTextBudget = 800 - 40 = 760 to ensure section text (fence + confidence line envelope ~28 chars, conservatively 40) fits."
  - "Golden Diff: diffTextBudget = 400 - 5 = 395 to ensure section text (\\n\\n prefix ~3-5 chars) fits."
metrics:
  duration: "~6 minutes"
  completed: "2026-05-27T23:34:00Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 35 Plan 01: issue-payload-builder Pure Function Summary

**One-liner:** Pure `buildIssuePayload()` with line-1 fingerprint comment, 4 markdown sections, and per-section char-budget enforcement (D-01..D-04, ISSUE-01, ISSUE-04).

## What Was Built

`tests/e2e/lib/issue-payload-builder.js` — a side-effect-free ES module that assembles GitHub issue payloads from triage + LLM iteration + rerun replay + golden citation inputs.

`tests/unit/issue-payload-builder.test.js` — 15 Vitest tests (14 plan + 1 bonus null-undefined variant) covering all ISSUE-01 and ISSUE-04 requirements.

## Confirmation: Line-1 Fingerprint Placement (D-02, Pitfall 1 Closed)

Tests 2 and 3 pin the fingerprint placement:
- Test 2: `body.split('\n')[0]` matches `/^<!-- fp: [a-f0-9]{12} -->$/`
- Test 3: `body.indexOf('<!-- fp: ')` is exactly `0` (no leading bytes)

The builder assembles body as `['<!-- fp: ${fingerprint} -->', '', ...sections].join('\n')` — the fingerprint comment is structurally first, not appended. This closes Pitfall 1 (overflow displacement of the dedup marker past the 65,536-char GitHub limit).

## Confirmation: Per-Section Budgets Enforced Inside Builder (D-03, ISSUE-04)

Budget enforcement is handled entirely within `buildIssuePayload()`. The CLI caller has no budget responsibility.

| Section | Budget | How enforced |
|---------|--------|-------------|
| LLM Rationale section text | ≤ 800 chars | `truncate(rationale, 800 - 40)` → 760 chars for rationale; 40-char overhead for `\n\n```\n...\n```\nconfidence: X.XX\n` envelope |
| Verifier window (fenced) | ≤ 600 chars | `truncate(reason, 600 - 2)` → 598 chars for reason; 2-char overhead for surrounding `\n` inside fence (`\n{reason}\n`) |
| Golden Diff section text | ≤ 400 chars | `truncate(diff, 400 - 5)` → 395 chars for diff content; 5-char overhead for `\n\n` prefix |

Pitfall 2 (worst-case body ≤ 50K): verified by Test 8. With all inputs at 10K chars, body stays well under 50,000 chars (≈ 2,600 chars given tight per-section truncation).

## Confirmation: Markdown Injection Defense (T-29-02-2)

Both `triageFinding.rationale` AND `iteration.verifier_verdict.reason` are wrapped in fenced code blocks via `fenceCode(text)` helper before inclusion in the body. Test 10 pins this:
- Injects `## EVIL_HEADER\nshould not render` as rationale
- Finds all ` ``` ` fence positions via `body.matchAll(/```/g)`
- Asserts the `## EVIL_HEADER` substring index falls between an opening and closing fence pair

## Budget Arithmetic Edge Cases

### LLM Rationale section text measurement

The test `extractSection(body, 'LLM Rationale')` returns everything between the `### LLM Rationale` header and the next `### ` header. That substring includes:
```
\n\n```\n{rationale_text}\n```\nconfidence: {conf}\n
```
Overhead = `"\n\n```\n"` (6) + `"\n```\nconfidence: 0.85\n"` (22) = 28 chars typical; 40 chars conservative (handles longer confidence values). Rationale budget = `800 - 40 = 760` chars.

### Verifier window measurement

The test locates the first ``` fence pair in the Verifier Disagreement section and measures:
```js
const windowText = section.slice(fenceStart + 3, fenceEnd); // = \n{reason}\n
```
This includes the `\n` immediately after the opening ``` and before the closing ```. So `windowText.length = reason.length + 2`. Budget reason at `600 - 2 = 598` to ensure `windowText.length ≤ 600`.

### Golden Diff section text measurement

The Golden Diff is the last section. `extractSection` returns everything from after `### Golden Diff` to end of body = `\n\n{diff_content}` (3 chars overhead, 5 conservatively). Budget diff at `400 - 5 = 395`.

## Deviations from Plan

### None (all by auto-fix)

The implementation followed the plan exactly. One iteration was required:
- **[Rule 1 - Bug] Initial verifier window off-by-2**: First run of Test 6 showed `602 > 600` because the fenced content measurement includes surrounding `\n` chars. Fixed by budgeting at `BUDGET_VERIFIER_WINDOW - 2` rather than `BUDGET_VERIFIER_WINDOW`.

## Self-Check

- `tests/e2e/lib/issue-payload-builder.js`: FOUND
- `tests/unit/issue-payload-builder.test.js`: FOUND
- Commit `05219e2` (RED test): confirmed in git log
- Commit `ce28177` (GREEN impl): confirmed in git log
- All 15 tests pass: CONFIRMED
- `npm run test:src`: 26 test files, 454 tests pass
- `npm run lint`: 0 errors (2 pre-existing warnings in settings.js, unrelated)

## Self-Check: PASSED

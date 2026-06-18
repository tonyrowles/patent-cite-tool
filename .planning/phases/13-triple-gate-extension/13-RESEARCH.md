# Phase 13: Triple-Gate Extension — Research

**Researched:** 2026-06-17
**Domain:** assertTripleGate Leg-3 OR widening + Vitest body pin + YAML PR-body marker
**Confidence:** HIGH (all claims verified against live code)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Keep `v40-auto-promote.yml` `workflow_dispatch`-only — do NOT restore `pull_request:closed`.
- **D-02:** Flat OR — Leg 3 passes if `sourceIssueLabels` includes `'triage'` OR `'report-fix-candidate'`. No source-aware branching.
- **D-03:** Hard-fail, no promote. Gate throws `TRIPLE_GATE_FAILED` on unresolvable source issue. No graceful-skip path.
- **D-04:** Emit `<!-- source_issue: ${{ github.event.issue.number }} -->` in the v61-report-fix.yml PR body. Reuse `parseSourceIssue` unchanged.
- **D-05:** Inherit existing close behavior. Phase 13 adds nothing to the `gh issue close` / post-fix suppression interlock.

### Claude's Discretion

- Exact test file/home for new `<!-- source_issue -->` marker assertion (extend `tests/unit/v61-report-fix-yaml.test.js`).
- Whether the PROMOTE-04 pin's 15-line slice constant changes (research verdict: it does NOT change — see below).
- Commit decomposition, as long as gate-body edit and PROMOTE-04 pin update land in the **same commit**.

### Deferred Ideas (OUT OF SCOPE)

- Re-enabling `pull_request:closed` auto-fire for auto-promote.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-05 | `assertTripleGate` Leg 3 extended to accept `report-fix-candidate` alongside legacy label; post-merge auto-promote cycle fires for v6.1-sourced fix PRs; `assertTripleGate` body change updates its Vitest pin | Edit sites, EXPECTED_BODY replacement, marker insertion, and new test case all verified below |
</phase_requirements>

---

## Summary

Phase 13 delivers three coordinated edits: (1) Leg-3 OR widening in `assertTripleGate`, (2) the PROMOTE-04 `EXPECTED_BODY` pin update in the same commit, and (3) a `<!-- source_issue: N -->` marker added to the `v61-report-fix.yml` PR body so `parseSourceIssue` can resolve the source issue without modification.

All CONTEXT.md claims about line numbers and code structure have been verified against live code. Every line number cited is exact. The 15-line slice constant does NOT change — the OR widening stays within 15 lines. The T3 test stays green after the edit because its regex assertion is a substring match that still holds against any reasonable error message update. The `_skipCiGuard:true` count invariant is unperturbed by Leg-3 edits.

**Primary recommendation:** Execute the three edits atomically in two commits: (a) YAML PR body marker (standalone commit), (b) Leg-3 OR widening + PROMOTE-04 EXPECTED_BODY + new T7 test (single atomic commit, the body+pin invariant).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leg-3 OR widening | Script (auto-fix-promote.mjs) | — | Pure function, no I/O, Vitest-pinned |
| Body pin update | Test (auto-fix-promote-gate.test.js) | — | Verbatim string guard, must co-commit with body change |
| Source-issue marker | Workflow (v61-report-fix.yml) | — | PR body is built in the workflow, not in script |
| New marker assertion | Test (v61-report-fix-yaml.test.js) | — | Follows established YAML-contract test pattern |

---

## Edit Site 1: `assertTripleGate` Leg 3 (VERIFIED)

**File:** `scripts/auto-fix-promote.mjs`
**CONTEXT claim:** `~line 115`
**Actual function start:** line 115 (confirmed: `grep -n "export function assertTripleGate"` → `115:export function assertTripleGate`)

### Current Leg-3 code (lines 125-129, VERIFIED exact)

```javascript
  // Leg 3 — source-issue carries triage (Phase 34 triage-classifier verdict).
  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {
    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'");
  }
}
```

These are lines 125-129 of the file (0-indexed slice positions 10-14 within the 15-line EXPECTED_BODY window).

### Proposed OR-widened Leg-3 code

```javascript
  // Leg 3 — source-issue carries triage or report-fix-candidate.
  if (!Array.isArray(sourceIssueLabels) || (!sourceIssueLabels.includes('triage') && !sourceIssueLabels.includes('report-fix-candidate'))) {
    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage' or 'report-fix-candidate'");
  }
}
```

**De Morgan application:** `!(A || B)` = `!A && !B`. Exactly one if-condition line (longer but still 1 line). Line count of the function body: **unchanged at 15**.

**Error message change:** The error message extending from `"missing 'triage'"` to `"missing 'triage' or 'report-fix-candidate'"` is recommended for accuracy. The T3 test assertion regex `/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/` is a **substring match** — it still passes against the longer message (verified with Node). T3 stays green regardless of whether the message is updated.

**CRITICAL:** The comment on line 125 references "Phase 34 triage-classifier verdict" — this should be updated to reflect both labels are now accepted.

---

## Edit Site 2: PROMOTE-04 Body Pin (VERIFIED)

**File:** `tests/unit/auto-fix-promote-gate.test.js`
**CONTEXT claim:** `~line 512`
**Actual describe block start:** line 512 (confirmed: `describe('assertTripleGate body byte-unchanged (Phase 58 PROMOTE-04)'`)

### Pin mechanics (VERIFIED)

The test uses `findIndex((l) => l.startsWith('export function assertTripleGate'))` as a dynamic anchor, then `slice(startIdx, startIdx + 15)`. The `startIdx` (0-based in the split array) is **114** (line 115 in the file). The slice constant **15** does NOT change.

### Current EXPECTED_BODY (lines 520-536, VERIFIED matches live code exactly)

```javascript
const EXPECTED_BODY = [
  'export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {',
  '  // Leg 1 — auto-fix:verified label on the merged PR.',
  "  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {",
  '    throw new Error("TRIPLE_GATE_FAILED: prLabels — missing \'auto-fix:verified\'");',
  '  }',
  '  // Leg 2 — merged === true (the GitHub close webhook also fires for',
  '  // close-without-merge; this leg is what distinguishes them).',
  '  if (merged !== true) {',
  "    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');",
  '  }',
  '  // Leg 3 — source-issue carries triage (Phase 34 triage-classifier verdict).',
  "  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {",
  '    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing \'triage\'");',
  '  }',
  '}',
].join('\n');
```

Array indices 10-12 (0-indexed) must update to match the new Leg-3 code:

```javascript
  '  // Leg 3 — source-issue carries triage or report-fix-candidate.',
  "  if (!Array.isArray(sourceIssueLabels) || (!sourceIssueLabels.includes('triage') && !sourceIssueLabels.includes('report-fix-candidate'))) {",
  '    throw new Error("TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing \'triage\' or \'report-fix-candidate\'");',
```

Array indices 0-9 and 13-14 are **UNCHANGED**.

**Drift verdict:** 15-line slice constant stays at 15. Only the EXPECTED_BODY string at positions 10-12 changes.

---

## Edit Site 3: `v61-report-fix.yml` PR Body Marker (VERIFIED)

**File:** `.github/workflows/v61-report-fix.yml`
**CONTEXT claim:** `~line 293` for the `body: |` block
**Actual line:** 293 (confirmed: `grep -n "body: |"` → `293:          body: |`)

### Current body block (lines 293-308, VERIFIED)

```yaml
          body: |
            ## Auto-Fix Report

            **Source Issue:** #${{ github.event.issue.number }}
            **KV Key:** `${{ env.KV_KEY }}`
            **Fingerprint:** `${{ env.FP_SHORT }}`

            This PR was generated by `v61-report-fix.yml` from a human bug report
            promoted to `report-fix-candidate` by the Phase 11 triage layer.

            Ledger entry committed to `ledger-snapshots/report-fix-${{ env.FP_SHORT }}`
            (COST-04 — spend is auditable; source: `report-fix-api`).

            ---
            *Review required before merge (GATE-04 human-merge invariant).*
          commit-message: "fix: auto-fix citation regression for report ${{ env.FP_SHORT }}"
```

### Proposed insertion

Add the HTML comment marker on a new line immediately after `**Source Issue:**`:

```yaml
          body: |
            ## Auto-Fix Report

            **Source Issue:** #${{ github.event.issue.number }}
            <!-- source_issue: ${{ github.event.issue.number }} -->
            **KV Key:** `${{ env.KV_KEY }}`
            ...
```

### Context variable: VERIFIED

`github.event.issue.number` is the correct expression. The workflow trigger is `issues: types: [labeled]` (line 45-46). The variable appears at lines 55, 121, 193, 203, 229, and 296 — it is the sole issue number reference throughout the file. D-04 in CONTEXT cites this variable correctly.

### `parseSourceIssue` would THROW without the marker (VERIFIED)

The current PR body has `**Source Issue:** #N` (human prose) and `commit-message: "fix: auto-fix citation regression for report ..."` (no `Fix #N` pattern). Verified with Node:
- `body.match(/<!--\s*source_issue:\s*(\d+)\s*-->/)` → null
- `commitMessage.match(/\b(?:Fix|Fixes)\s+#(\d+)\b/)` → null
- Result: throws `TRIPLE_GATE_FAILED: cannot identify source issue`

After inserting the marker, the PREFERRED parse path fires and returns the issue number as an integer. `parseSourceIssue` is unchanged (D-04).

---

## Edit Site 4: New Marker Assertion in `v61-report-fix-yaml.test.js` (VERIFIED)

**File:** `tests/unit/v61-report-fix-yaml.test.js`
**Current last test:** line 260 (`});` closing the describe block)
**Assertion to add:** inside `describe('v61-report-fix.yml static guards (Plan 12-04)'`

No existing assertion pins `source_issue` (verified: grep finds zero hits). The new assertion follows the established `toContain` pattern:

```javascript
it('D-04 (Phase 13): <!-- source_issue: N --> marker present in create-pull-request body (parseSourceIssue PREFERRED path)', () => {
  expect(yaml).toContain('<!-- source_issue:');
  expect(yaml).toContain('${{ github.event.issue.number }}');
});
```

This is intentionally written as two `toContain` calls rather than one regex, following the idiom at line 69 (the existing `report-fix-candidate` check). Both tokens must be present; the workflow already has many `${{ github.event.issue.number }}` occurrences so the second check is not strictly necessary but is explicit.

---

## New Test Case: T7 (assertTripleGate with `report-fix-candidate`)

Add inside `describe('assertTripleGate (Phase 44)', ...)` after T6 (line 130):

```javascript
it("T7 — Phase 13: accepts when sourceIssueLabels includes 'report-fix-candidate' (Leg 3 OR widening)", () => {
  expect(() => assertTripleGate({
    prLabels: ['auto-fix:verified'],
    merged: true,
    sourceIssueLabels: ['report-fix-candidate'],
  })).not.toThrow();
});
```

**Existing cases that stay green after OR widening (all verified):**
- T1 — prLabels missing `auto-fix:verified` → throws (Leg 1, unaffected by Leg-3 change)
- T2 — merged !== true → throws (Leg 2, unaffected)
- T3 — sourceIssueLabels: `['bug']` → throws with regex `/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/`. After widening, still throws AND T3's regex is a substring match against the new message (verified: `"missing 'triage' or 'report-fix-candidate'"` matches the regex). **T3 STAYS GREEN.**
- T4 — sourceIssueLabels: `['triage', 'WRONG_CITATION']` → does not throw (legacy path preserved)
- T5 — PARTIAL-04: prLabels: `['auto-fix:partial-verified']` → throws (Leg 1 check, unrelated to Leg 3)
- T6 — PARTIAL-04 co-presence: prLabels includes both labels → does not throw

---

## `_skipCiGuard:true` Invariant (VERIFIED)

**Test location:** `tests/unit/auto-fix-promote-gate.test.js` line 553 (`describe('_skipCiGuard:true non-comment grep-count invariant...`)

**Live code occurrence:** line 528 of `scripts/auto-fix-promote.mjs` (`_skipCiGuard: true,`). The test description says "line 434-ish" but CONTEXT.md's "434-ish" is stale — actual location is 528. The test asserts `count === 1` (not a line-number check), so this discrepancy has no functional impact.

**Phase 13 impact:** The Leg-3 edit at lines 125-128 touches only if-condition, comment, and throw text. No new occurrence of `_skipCiGuard:true` is introduced. Count remains 1. **Invariant unperturbed.**

---

## D-05 Interlock: Existing `gh issue close` (DO NOT MODIFY — VERIFIED)

**`v40-auto-promote.yml` line 439** (CONTEXT claim: 439 — EXACT):
```yaml
          gh issue close "$SOURCE_ISSUE" \
            --reason completed \
            --comment "Fixed in PR #$AUTO_FIX_PR (auto-promote PR $AUTO_PROMOTE_URL)"
```

The step is gated by `if: steps.cpr.outputs.pull-request-url != ''` (line 432). This close is what Phase 11's post-fix suppression (`isPostFixSuppressed` in `scripts/gh-client.mjs`) keys off. Phase 13 adds nothing here.

**`scripts/gh-client.mjs` lines 157-196** (CONTEXT range — docstring starts 155, function starts 169, closes ~207 — range is approximate but valid):
```
Query 2: closed report-fix-candidate Issues referencing patentNumber
```
This is the suppression check that will detect a closed `report-fix-candidate` issue after Phase 13 enables the promote cycle. No changes needed.

---

## `assertPartialGate` — Unchanged (VERIFIED)

`assertPartialGate` Leg 3 at line 172 still requires `'triage'` only. Phase 13 does NOT modify `assertPartialGate`. The partial path is a separate entry point and its Leg 3 semantics are intentionally narrower (partial PRs can only originate from `triage` issues in the current design).

---

## Test Commands

| Purpose | Command |
|---------|---------|
| Quick: affected unit tests only | `npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/unit/v61-report-fix-yaml.test.js tests/e2e/scripts/v40-auto-promote-yaml.test.js` |
| Full unit suite | `npm run test:src` |
| Full test + build + lint | `npm test` |
| web-ext lint (separate, MUST run after manifest changes) | `npm run test:lint` |

**Current baseline:** 112 passed, 1 skipped (A1 — `pull_request:closed` trigger skipped by design per D-01) across all three affected test files.

**Phase 13 acceptance command:** `npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/unit/v61-report-fix-yaml.test.js` must pass with:
- PROMOTE-04 green (EXPECTED_BODY matches updated Leg 3)
- T3 still green (substring regex survives error message update)
- T4 still green (legacy triage path preserved)
- T5 still green (`partial-verified` still rejected)
- T7 green (new `report-fix-candidate` accepts case)
- new marker assertion green

---

## YAML-Contract Test Idiom (for new assertion)

From `tests/unit/v61-report-fix-yaml.test.js`, assertions use `expect(yaml).toContain(literal)` for fixed strings and `expect(yaml).toMatch(/regex/)` for flexible patterns. The `yaml` variable is loaded once at module scope via `fs.readFileSync(YAML_PATH, 'utf8')` with a `try/catch` for RED-state tolerance. New assertions go inside the existing `describe(...)` block before its closing `});`.

From `tests/e2e/scripts/v40-auto-promote-yaml.test.js`, the `yaml` variable uses `beforeAll(() => { yaml = fs.readFileSync(...) })` without a try/catch (throws on ENOENT — RED state intended). New Phase 13 assertions to this file should follow the same `it(...)` + `expect(yaml).toContain(...)` idiom.

---

## CONTEXT.md Line Number Accuracy Audit

| Claim | Actual | Verdict |
|-------|--------|---------|
| `auto-fix-promote.mjs:115` (assertTripleGate) | Line 115 | EXACT |
| `auto-fix-promote.mjs:270` (parseSourceIssue) | Line 270 | EXACT |
| `auto-fix-promote-gate.test.js:512` (PROMOTE-04 describe) | Line 512 | EXACT |
| `v61-report-fix.yml:293` (body: block) | Line 293 | EXACT |
| `v40-auto-promote.yml:439` (gh issue close) | Line 439 | EXACT |
| `gh-client.mjs:157-196` (isPostFixSuppressed) | Function: 169-207, docstring: 155 | APPROXIMATE — functionally correct range |
| `_skipCiGuard:true` at "line 434-ish" | Actual line 528 | STALE description, test checks count not line; no impact |

**CONTEXT.md is reliable.** All functional line numbers are exact. The two "approximate" entries are in non-critical descriptions, not edit sites.

---

## Common Pitfalls

### Pitfall 1: Forgetting the EXPECTED_BODY is a JOIN
The EXPECTED_BODY is an array joined with `'\n'`. The comparison is against the source file's `split(/\r?\n/)` + `slice` + `join('\n')`. When updating the array, use the exact same string literals (single-quote vs double-quote mixing preserved). The current array uses a mix of template-literal-style single-quoted JS strings and double-quoted strings — match exactly.

### Pitfall 2: Committing the YAML marker without the Leg-3 change
The YAML body marker (D-04) enables `parseSourceIssue` to find the source issue. But if Leg 3 still requires only `'triage'`, the promote gate would still reject a `report-fix-candidate` issue. These two changes must BOTH exist for GATE-05 to function. D-04 can commit first (it is harmless alone — parseSourceIssue succeeds but Leg 3 still gates), but success criterion #2 requires the body+pin in one commit.

### Pitfall 3: Modifying assertPartialGate Leg 3
`assertPartialGate` (line 172) has its own `!sourceIssueLabels.includes('triage')` check. Do NOT touch it — the partial path is intentionally narrow. Only `assertTripleGate` Leg 3 (line 126) changes.

### Pitfall 4: The T3 error message concern is a false alarm
T3 uses `/TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'/` which is a regex substring match. The new message `"...missing 'triage' or 'report-fix-candidate'"` contains the old text as a prefix. T3 passes. No need to update T3.

### Pitfall 5: Checking `wrangler kv` commands
Phase 13 adds no wrangler commands. The YAML marker is added to the `create-pull-request` body block, which has no KV interaction. No `--remote` concern.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 13 is code/config-only changes (script edit, test update, YAML body edit). No new external tools, services, or CLIs required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.js` |
| Quick run | `npx vitest run tests/unit/auto-fix-promote-gate.test.js tests/unit/v61-report-fix-yaml.test.js` |
| Full unit suite | `npm run test:src` |
| Full phase gate | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-05 | assertTripleGate accepts `report-fix-candidate` in sourceIssueLabels | unit | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` — T7 | Wave 0 gap |
| GATE-05 | assertTripleGate body pin updated | unit | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` — PROMOTE-04 | Exists (update) |
| GATE-05 | Legacy triage path still passes | unit | T4 in above | Exists |
| GATE-05 | `<!-- source_issue: -->` marker in v61 PR body | unit | `npx vitest run tests/unit/v61-report-fix-yaml.test.js` — new marker test | Wave 0 gap |
| GATE-05 | parseSourceIssue unmodified | unit | M1-M4 in auto-fix-promote-gate.test.js | Exists |

### Wave 0 Gaps
- [ ] T7 test case inside `describe('assertTripleGate (Phase 44)')` — covers `report-fix-candidate` accepts
- [ ] New marker assertion inside `describe('v61-report-fix.yml static guards')` — covers D-04 marker presence

---

## Security Domain

No new attack surface introduced. The Leg-3 OR widening does not relax the trust model — `report-fix-candidate` is applied by Phase 11 heuristics (green-tier / dup>=3 / quarantine corpus hit) under exactly the same vetting as `triage`. D-03 preserves hard-fail behavior: missing source issue still throws `TRIPLE_GATE_FAILED`. No new external inputs, no new shell invocations, no new network paths.

---

## Sources

### Primary (HIGH confidence — all verified against live code)
- `scripts/auto-fix-promote.mjs` lines 115-129 — assertTripleGate body, Leg 3 exact condition
- `tests/unit/auto-fix-promote-gate.test.js` lines 512-561 — PROMOTE-04 describe, EXPECTED_BODY, _skipCiGuard pin
- `tests/unit/v61-report-fix-yaml.test.js` — full file, assertion idiom
- `tests/e2e/scripts/v40-auto-promote-yaml.test.js` — assertion idiom
- `.github/workflows/v61-report-fix.yml` lines 293-308 — body: block exact content
- `.github/workflows/v40-auto-promote.yml` lines 432-441 — gh issue close
- `scripts/gh-client.mjs` lines 155-207 — isPostFixSuppressed

### Verification runs
- `npx vitest run tests/unit/auto-fix-promote-gate.test.js` → 40 passed
- `npx vitest run tests/unit/v61-report-fix-yaml.test.js` → 35 passed
- `npx vitest run tests/e2e/scripts/v40-auto-promote-yaml.test.js` → 37 passed, 1 skipped

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `assertPartialGate` Leg 3 also requires `'triage'` — no change needed | Edit Site 1 | Minimal: partial gate is a separate entry point |

**All other claims in this research were verified against live source code. No assumed claims affect the three edit sites.**

---

## Metadata

**Confidence breakdown:**
- Edit sites and line numbers: HIGH — confirmed with Node and grep
- 15-line slice count: HIGH — verified computationally
- T3 regex behavior: HIGH — verified with Node
- New test idiom: HIGH — matches existing file patterns
- D-05 interlock (no change needed): HIGH — verified against both files

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable code — no fast-moving dependencies)

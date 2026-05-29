---
phase: 38-v3-1-cleanup-integration-warnings-nyquist-human-uat
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - tests/e2e/specs/quarantine.spec.js
  - tests/unit/quarantine-spec-import.test.js
  - scripts/weekly-digest.mjs
  - scripts/e2e-report-issue.mjs
  - tests/e2e/scripts/e2e-weekly-digest.test.js
  - .github/workflows/e2e-nightly.yml
  - tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 38: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 7
**Status:** clean (no critical/warning findings — 3 info-level observations)

## Summary

Phase 38 closes three integration-fragility warnings (INT-FIX-01/02/03) with surgical, well-scoped edits. The bar for this cleanup phase — "did these 3 fixes close their respective fragility warnings cleanly, without introducing new fragility?" — is met.

All three invariants from the phase context hold under direct inspection:

1. **INT-FIX-01 (single source of truth for QUARANTINE_REPORT_FILENAME)** — `quarantine.spec.js:46` imports the constant from `scripts/e2e-report-issue.mjs`; no local `const QUARANTINE_REPORT_FILENAME = ...` re-declaration exists in the spec. The export at `scripts/e2e-report-issue.mjs:51` is intact. The regression test (`tests/unit/quarantine-spec-import.test.js`) asserts both the import shape and the absence of re-declaration, and would FAIL pre-fix.

2. **INT-FIX-02 (real-data SUMMARY_KEYS drift detector)** — `scripts/weekly-digest.mjs:171-214` defines and exports `aggregateBySummaryKey`. `runDigest` at line 449-454 now calls `validateSummaryKeys(summaryByKey)` against tally data computed from real `nightlyIssues`/`quarantineIssues`. The pre-fix self-referential `Object.fromEntries(SUMMARY_KEYS.map(...))` seed inside `runDigest` is gone (the seed only appears INSIDE `aggregateBySummaryKey` for zeroing the tally, which is correct because validateSummaryKeys checks `k in obj`, not value). The mapping in the switch (`WRONG_CITATION` → `wrong_citation`, etc.) is symmetric with `tests/e2e/lib/llm-report.js:142-152` `classificationToSummaryKey`. The regression test at `tests/e2e/scripts/e2e-weekly-digest.test.js:178-222` (the new `INT-FIX-02` describe) covers (a) all SUMMARY_KEYS present + finite, (b) deleting a key causes a named throw, (c) the runDigest source no longer contains the self-referential seed pattern.

3. **INT-FIX-03 (artifact upload on quarantine failure)** — `.github/workflows/e2e-nightly.yml:303-311` adds `id: upload-artifacts` and the quarantine clause sits **inside** the `always() && (...)` parens. The actual line is `if: always() && (steps.smoke.outcome == 'failure' || steps.regression.outcome == 'failure' || steps.fault_injection.outcome == 'failure' || steps.quarantine.outcome == 'failure')` — operator precedence is correct (no `... ) || steps.quarantine ...` form). The Y6 regression test at `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js:112-142` grep-asserts both `id: upload-artifacts` and the inside-parens clause.

Additional verifications:

- **Zero new npm dependencies** — no `import`s in any reviewed file reach beyond pre-existing internal modules + `node:` builtins. The new test files use existing `vitest`/`node:fs`/`node:path` only.
- **Step-skip safety on INT-FIX-03** — when `inputs.llm_run_id` is empty, the quarantine step is gated out (line 282); a skipped step's `outcome` is `'skipped'` (not `'failure'`), so the new clause cannot spuriously trigger uploads on routine cron runs that don't ingest an llm_run_id.
- **`makeRealGhClient.listOpenIssuesByLabel`** (lines 308-336) still preserves Phase 37 CR-02 behavior (throws on non-zero exit, JSON parse failure, or non-array payload) — unchanged by Phase 38.
- **Headline scope claim is honest** — `scripts/e2e-report-issue.mjs` diff is comment-only (the line-51 export line and lines 46-50 + 57-58 surrounding comments). The runtime behavior of the issue filer is untouched, as claimed.

The TDD contract from the plan (each regression test fails pre-fix and passes post-fix) is structurally sound:

- `quarantine-spec-import.test.js` would fail pre-fix because the spec carried a local `const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json'` (the second regex match would fire).
- `e2e-weekly-digest.test.js` INT-FIX-02 block — the third `it` (grep on the runDigest source) would fail pre-fix because the source still contained `const summaryTally = Object.fromEntries(SUMMARY_KEYS.map(...))`.
- `e2e-nightly-quarantine-yaml.test.js` Y6 — would fail pre-fix on both `expect(startIdx).toBeGreaterThan(-1)` (no `id: upload-artifacts` existed) and the inside-parens regex.

## Info

### IN-01: Y6 inside-parens regex uses non-greedy paren-class — would mismatch on nested parens

**File:** `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js:139-141`
**Issue:** The regex `/if:\s*always\(\)\s*&&\s*\([^)]*steps\.quarantine\.outcome == 'failure'[^)]*\)/` uses `[^)]*` to scan inside the outer parens. If a future workflow edit ever introduces a nested parenthesized expression (e.g. `if: always() && (foo || (bar == 'failure') || steps.quarantine.outcome == 'failure')`), the regex would stop at the first `)` and fail to match — even though the YAML is structurally correct. This is a latent test fragility, not a Phase 38 code bug.
**Fix (defensive, optional):** Replace the inside-parens pattern with one that tolerates one level of nesting, e.g. `/if:\s*always\(\)\s*&&\s*\((?:[^()]|\([^)]*\))*steps\.quarantine\.outcome == 'failure'(?:[^()]|\([^)]*\))*\)/`. Or document the invariant in a comment: "if you add nested parens to this expression, update this regex."

### IN-02: Spec import-redeclaration guard regex only anchors on column-zero `const`

**File:** `tests/unit/quarantine-spec-import.test.js:39`
**Issue:** `expect(src).not.toMatch(/^const\s+QUARANTINE_REPORT_FILENAME\s*=/m)` anchors with `^` (multiline). An indented re-declaration (`  const QUARANTINE_REPORT_FILENAME = ...`) would slip past. In practice JavaScript would throw `SyntaxError: Identifier 'QUARANTINE_REPORT_FILENAME' has already been declared` at parse time for any same-scope re-declaration of an imported binding, so the spec couldn't run anyway. The guard is belt-and-suspenders, but the anchor is tighter than the invariant it protects.
**Fix (optional):** Drop the `^` anchor — `/(?:^|\s)const\s+QUARANTINE_REPORT_FILENAME\s*=/m` would catch any-indentation re-declarations too.

### IN-03: `aggregateBySummaryKey` silently drops issues whose category is not in the switch

**File:** `scripts/weekly-digest.mjs:191-202`
**Issue:** The switch covers only the 4 ERROR_CLASSES that map to SUMMARY_KEYS (`WRONG_CITATION`, `VERIFIER_DISAGREE`, `LLM_HALLUCINATED_SELECTION`, `LLM_API_ERROR`). Issues classified as e.g. `UI_BROKEN`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `NO_CITATION_PRODUCED`, `FLAKE` fall into `default: key = null` and are not counted. This is intentional (the block comment at lines 152-159 documents the rule) AND consistent with `classificationToSummaryKey` in `tests/e2e/lib/llm-report.js:142-152` (only 6 classifications map; everything else returns null). The function's purpose is solely to feed `validateSummaryKeys`, not to surface a counts dashboard — `aggregate()` (not this function) drives the rendered digest. If a future requirement says "every ERROR_CLASS must show in the digest's SUMMARY_KEYS-shaped tally", a new key would need to be added to both `SUMMARY_KEYS` (in `llm-report.js`) and this switch. The current asymmetry between ERROR_CLASSES (11 entries) and SUMMARY_KEYS (7 entries, of which only 4 are derivable from issue labels) is structural, not a Phase 38 regression.
**Fix:** None required. Optionally, the documentation could note "this is a deliberate subset; see `tests/e2e/lib/llm-report.js` SUMMARY_KEYS for the full contract".

## Out of Scope (noted but intentionally not flagged)

- **Phase 37 deferred findings (WR-01..06 + IN-01..04)** — explicitly deferred per commit `7d04130`; the phase context block instructs reviewers to not pull them forward. Not flagged.
- **`scripts/e2e-report-issue.mjs` Phase 35/36 origins** — file header references pre-Phase-38 phases; Phase 38 only added/edited comments. Not flagged as documentation drift.
- **The `test.afterAll` finalize block in `quarantine.spec.js:167-176`** uses a dynamic `await import('node:fs')` rather than the top-of-file `node:fs` import idiom. This is pre-existing Phase 36 code unchanged by Phase 38. Not flagged.
- **`spawnSync` cwd vs `__dirname`-derived `PROJECT_ROOT` interaction** in `e2e-weekly-digest.test.js:464-488` — the child script computes `reports/` relative to its own location, not the spawned `cwd`. The assertion `expect(wrote).toEqual([])` still passes because the script exits before reaching `mkdirSync(reportsDir)`. This is pre-existing Phase 37 CR-02 test scaffolding, unchanged by Phase 38. Not flagged.
- **`Object.fromEntries(SUMMARY_KEYS.map(...))` inside `aggregateBySummaryKey`** — looks superficially similar to the removed pre-fix pattern but is correct here: it seeds the tally with zeros so all keys are own-properties before increments, which is what makes `validateSummaryKeys`'s `k in obj` check meaningful for real-data drift detection. The pre-fix anti-pattern was using the same construct as the input to `validateSummaryKeys` directly inside `runDigest`. Distinct, intentional re-use.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

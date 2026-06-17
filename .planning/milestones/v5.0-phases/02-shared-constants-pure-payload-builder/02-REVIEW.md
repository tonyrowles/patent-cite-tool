---
phase: 02-shared-constants-pure-payload-builder
reviewed: 2026-06-13T09:35:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/shared/constants.js
  - src/shared/report-payload-builder.js
  - tests/unit/report-payload-builder.test.js
  - tests/unit/shared-constants.test.js
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-06-13T09:35:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 02 delivers a narrow pure-function surface: three constants added to `constants.js` and a new `report-payload-builder.js` with a 17-test Vitest suite. The core correctness and security invariants (PAY-03 forbidden fields absent, D-05 throws, D-06 conditional key, D-07 key order, D-08 defaults, SC3 byte-stability) all hold. No critical bugs or security vulnerabilities were found. Three warnings surface a real correctness gap (missing `fingerprint` assertion), a mutation-aliasing risk on the returned `errorLog`, and a deviance from the plan's builder import spec. Three info items cover minor gaps in test completeness and a naming collision.

---

## Structural Findings (fallow)

No structural pre-pass was provided for this phase.

---

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Test 4 does NOT assert `fingerprint` absence — one of three server-computed fields goes unchecked

**File:** `tests/unit/report-payload-builder.test.js:123-133`
**Issue:** Test 4 is labelled "server-computed / PAY-03 fields never present" and asserts absence of `timestamp` and `duplicate_count`, plus the three PAY-03 PII fields. But it omits the most security-sensitive server-computed field: `fingerprint`. The plan explicitly lists `fingerprint` as one of the three fields the builder "MUST NOT send" (02-01-PLAN.md interfaces section, D-07). If a future edit accidentally includes it, this test will not catch the regression. The builder currently never sets `fingerprint`, so there is no live defect today — but the guard is incomplete, making the SC1 pin weaker than intended.

```js
// Current Test 4 — fingerprint is never asserted absent:
expect(keys).not.toContain('timestamp');
expect(keys).not.toContain('duplicate_count');
// Missing:
expect(keys).not.toContain('fingerprint');
```

**Fix:** Add `expect(keys).not.toContain('fingerprint');` after line 128.

---

### WR-02: `errorLog` returned by reference — caller mutation silently alters the payload object

**File:** `src/shared/report-payload-builder.js:57`
**Issue:** The builder assigns `const errorLog = errors ?? [];` and then sets `errorLog` on the returned payload object. This passes the caller's array directly into the payload without a shallow copy. If the caller mutates the array after `buildReportPayload()` returns (e.g. the ring-buffer flushes between construction and send), the payload object's `errorLog` is silently altered. This violates the "same inputs → byte-identical object" purity guarantee stated in the D-07 invariant header: the payload is no longer immutable after creation. Concretely, two callers holding the same `errors` reference can observe different `errorLog` values in each other's payload objects.

The SC3 test (Test 1) does not catch this because it uses `errors: []` — an empty array that cannot be further mutated to produce divergent output.

```js
// Current (line 57) — live reference:
const errorLog = errors ?? [];

// Fix — shallow copy to freeze the snapshot at call time:
const errorLog = errors != null ? [...errors] : [];
```

**Fix:** Replace line 57 with `const errorLog = errors != null ? [...errors] : [];`. This also aligns with the SC3 description ("same inputs → byte-identical") since the payload now captures the array state at construction time rather than tracking future mutations.

---

### WR-03: Builder imports only `REPORT_CATEGORIES` — plan mandates `import { REPORT_CATEGORIES, WORKER_REPORT_URL }` from constants

**File:** `src/shared/report-payload-builder.js:9`
**Issue:** The Task 2 action in `02-01-PLAN.md` (line 172) instructs: "Import `{ REPORT_CATEGORIES, WORKER_REPORT_URL }` from `'./constants.js'`". The implemented builder imports only `REPORT_CATEGORIES`. `WORKER_REPORT_URL` is not used internally by the builder (Phase 3 owns the transport), so this deviance does not cause a runtime bug. However, the plan rationale is architectural: co-locating the URL import in the module that defines the payload establishes a single file where Phase 3 readers find both the payload contract and the target URL. The omission is a deliberate-looking but undocumented deviation from the plan; the summary (`02-01-SUMMARY.md`) does not record it as a deviation.

The `key_links` section of the plan only mandates `import { REPORT_CATEGORIES }`, which is ambiguous against the Task 2 prose. Regardless, if Phase 3 blindly imports `WORKER_REPORT_URL` from this module rather than directly from `constants.js`, the import will fail.

**Fix:** Either import `WORKER_REPORT_URL` alongside `REPORT_CATEGORIES` in `report-payload-builder.js` (and re-export it, making it the Phase 3 integration point), or explicitly document this deviation in `02-01-SUMMARY.md` under "Deviations from Plan" so Phase 3 implementors know to import from `constants.js` directly.

---

## Info

### IN-01: Test 4 (`shared-constants.test.js`) does not import or assert the three new PAY-05 exports

**File:** `tests/unit/shared-constants.test.js:1-44`
**Issue:** `shared-constants.test.js` was modified only to bump the MSG key count from 17 to 18. It does not import `REPORT_CATEGORIES` or `WORKER_REPORT_URL` and provides no assertions on their values, freeze status, or element order. The plan (Task 1 acceptance criteria) places all PAY-05 assertions in the new `report-payload-builder.test.js`, which is correct and sufficient for coverage. This is not a test gap per the plan. However, it leaves `shared-constants.test.js` as an incomplete picture of the constants module's API surface: a reader of that file alone cannot see what the module exports beyond MSG/STATUS/PATENT_TYPE.

**Fix:** No mandatory action — the assertions exist in `report-payload-builder.test.js` (Tests 7-9). Optionally, add import and smoke-assert lines to `shared-constants.test.js` for `REPORT_CATEGORIES` and `WORKER_REPORT_URL` to make that file a self-contained constants module test.

---

### IN-02: Duplicate test label "Test 12" in `report-payload-builder.test.js`

**File:** `tests/unit/report-payload-builder.test.js:201,208`
**Issue:** Two `it()` blocks carry the label "Test 12" — one for missing `patentNumber` and one labeled "Test 12b" for empty-string `patentNumber`. The header comment block at the top of the file (lines 9-24) only lists "Test 12" once, so the index is internally inconsistent. This causes no runtime failure (Vitest identifies tests by their full description string, not a numbering scheme) but makes the coverage index misleading.

**Fix:** Renumber the comment block at the top to reflect the actual 17 tests: rename `Test 12` (empty string case) to `Test 12b` in the comment index, and do the same for the `Test 14b` (empty extensionVersion) case which has the same pattern.

---

### IN-03: `confidenceTier` not covered in Test 15 D-08 defaults assertion

**File:** `tests/unit/report-payload-builder.test.js:238-261`
**Issue:** Test 15 asserts D-08 defaults for `errorLog`, `note`, `patentUrl`, `returnedCitation`, `browser`, `os`, `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight`, `pdfParseStatus`, and `triggerMode` — but omits `confidenceTier`. D-08 requires "all nullable diagnostics → null when absent", and `confidenceTier` is one of them (it is absent in the minimal-input fixture). The builder correctly returns `null` for it (verified), but the test does not pin this. A future refactor removing the `?? null` on `confidenceTier` would go undetected.

**Fix:** Add `expect(payload.confidenceTier).toBe(null);` after line 258 in Test 15.

---

_Reviewed: 2026-06-13T09:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/offscreen/position-map-builder.js
  - tests/unit/position-map-builder.test.js
autonomous: true
must_haves:
  truths:
    - "Patent US10203551 does not produce spurious column number 203"
    - "Column numbers exceeding 200 are rejected as invalid"
    - "Legitimate column numbers (1-200) continue to work correctly"
  artifacts:
    - path: "src/offscreen/position-map-builder.js"
      provides: "Tightened column number range validation"
      contains: "right > 200"
    - path: "tests/unit/position-map-builder.test.js"
      provides: "Tests for extractPrintedColumnNumbers"
      contains: "extractPrintedColumnNumbers"
  key_links:
    - from: "extractPrintedColumnNumbers"
      to: "column number sanity check"
      via: "range validation at line 184"
      pattern: "right > 200"
---

<objective>
Fix spurious results reporting impossible page/column numbers (e.g., 203) for patents whose patent number contains 3-digit substrings that match the column number regex.

Purpose: Patent US10203551 has "203" extracted by PDF.js as a standalone text item from the header area. The current column number regex `/^\d{1,3}$/` and the permissive range check `right > 999` incorrectly accept 203 as a valid column number.

Output: Tightened validation that rejects column numbers above 200, with regression tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/offscreen/position-map-builder.js
@tests/unit/position-map-builder.test.js
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add tests for extractPrintedColumnNumbers and fix range validation</name>
  <files>tests/unit/position-map-builder.test.js, src/offscreen/position-map-builder.js</files>
  <behavior>
    - Test: extractPrintedColumnNumbers returns valid column pair for normal pages (left=1, right=2)
    - Test: extractPrintedColumnNumbers returns null when header contains number 203 (simulating US10203551 patent number substring)
    - Test: extractPrintedColumnNumbers returns null when column numbers exceed 200
    - Test: extractPrintedColumnNumbers returns valid pair for high but legitimate columns (e.g., left=99, right=100)
    - Test: extractPrintedColumnNumbers returns null when no header numbers found
    - Test: extractPrintedColumnNumbers returns null when left/right are not consecutive
  </behavior>
  <action>
    1. Add `extractPrintedColumnNumbers` to the import statement in `tests/unit/position-map-builder.test.js`.

    2. Add a new `describe('extractPrintedColumnNumbers', ...)` test block with these tests:
       - Helper function `makeHeaderItem(text, x, y)` that creates `{ text, x, y, width: 10, height: 10 }` with default y in header zone (use pageHeight - 50 to be above headerThreshold of pageHeight - 90).
       - Use pageHeight=792 (US letter), pageWidth=612 throughout.
       - Test "returns column pair for normal spec page": items with "1" at x=50 and "2" at x=500, both at y=750. Expect `{ left: 1, right: 2 }`.
       - Test "returns null for patent-number substring like 203": items with "203" at x=50 and "204" at x=500, y=750. Expect `null` (both exceed 200).
       - Test "returns null when single large number in header (US10203551 scenario)": single item "203" at x=50, y=750. Expect `null`.
       - Test "accepts high but legitimate columns (99, 100)": items "99" at x=50 and "100" at x=500, y=750. Expect `{ left: 99, right: 100 }`.
       - Test "returns null when columns are not consecutive": items "5" at x=50 and "8" at x=500, y=750. Expect `null`.
       - Test "returns null when no numbers in header": items with text "Abstract" at y=750. Expect `null`.

    3. Run tests -- they should FAIL for the "203" tests (RED phase).

    4. In `src/offscreen/position-map-builder.js`, line 184, change:
       ```
       if (left < 1 || right > 999) return null;
       ```
       to:
       ```
       if (left < 1 || right > 200) return null;
       ```
       Also update the comment on line 144 from "standalone numbers (1-999)" to "standalone numbers (1-200)".

    5. Run tests again -- all should PASS (GREEN phase).

    Why 200 and not 100: The longest US patents can have 100+ columns (e.g., some pharmaceutical patents). 200 provides comfortable headroom while still rejecting patent number substrings like 203, 551, etc. The key insight is that no patent has ever had 200+ columns.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/position-map-builder.test.js</automated>
  </verify>
  <done>
    - extractPrintedColumnNumbers rejects column numbers > 200
    - All new tests pass
    - All existing tests continue to pass
    - The US10203551 scenario (number "203" in header) returns null instead of being accepted as a column number
  </done>
</task>

</tasks>

<verification>
```bash
# All unit tests pass
npx vitest run tests/unit/position-map-builder.test.js

# Full test suite passes
npm run test:src
```
</verification>

<success_criteria>
- extractPrintedColumnNumbers rejects any column number > 200
- Regression test explicitly covers the US10203551 scenario
- All 461+ existing tests continue to pass
</success_criteria>

<output>
After completion, create `.planning/quick/260412-fde-fix-spurious-results-reporting-impossibl/260412-fde-SUMMARY.md`
</output>

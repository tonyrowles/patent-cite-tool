---
status: complete
phase: 04-citation-output
source: [04-01-SUMMARY.md]
started: 2026-03-02T06:45:00Z
updated: 2026-03-02T07:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Copy button feedback
expected: On a granted patent page, highlight text, click Cite, then click the Copy button in the citation panel. Button text changes to "✓ Copied!" in green, then resets back to "Copy" after ~1.5 seconds.
result: pass

### 2. Clipboard contains citation
expected: After clicking Copy, paste (Ctrl+V) into any text field. The pasted text matches the citation shown in the panel (e.g., "4:5-20").
result: pass

### 3. Citation text is not selectable
expected: Try to click and drag to select the citation text in the panel. The cursor should not change to a text cursor, and no text selection occurs. The only way to get the text is via the Copy button.
result: pass

### 4. Patent number prefix toggle exists
expected: Open the extension popup, go to Settings. A checkbox labeled "Include patent number prefix" is visible below the display mode setting. It is unchecked by default.
result: pass

### 5. Grant patent prefix format
expected: Enable "Include patent number prefix" in popup settings. On a granted patent (e.g., US11427642B2), highlight text and Cite. The citation shows a prefix like "'642 Pat., 4:5-20" — last 3 digits of patent number with tick mark and "Pat." label.
result: pass

### 6. Application patent prefix format
expected: With prefix enabled, navigate to a published application (e.g., US20210012345A1). Highlight paragraph text and Cite. Citation shows prefix like "'345 App., [0045]" — last 3 digits with "App." label.
result: pass

### 7. Disabling prefix removes it
expected: Uncheck "Include patent number prefix" in popup settings. Highlight new text and Cite. The citation appears without any prefix (e.g., just "4:5-20" or "[0045]").
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

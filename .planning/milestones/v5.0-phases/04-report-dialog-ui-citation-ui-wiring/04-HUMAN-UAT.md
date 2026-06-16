---
status: partial
phase: 04-report-dialog-ui-citation-ui-wiring
source: [04-VERIFICATION.md]
started: 2026-06-13
updated: 2026-06-13
---

## Current Test

[awaiting human testing — live extension on a real Google Patents page]

## Tests

### 1. Focus trap live behavior (SC3 / CAP-04)
expected: With the report dialog open, Tab/Shift+Tab cycles focus only within the dialog (uses shadowRoot.activeElement); Google Patents' own key bindings do not steal focus; on close, focus returns to the Report button trigger.
result: [pending — deferred to Phase 5 UAT-05]

### 2. Click-outside + Escape + Cancel dismiss (SC3 / CAP-04)
expected: Escape, the Cancel button, and a click outside the dialog all dismiss it with no submission; the CR-02 fix (cancelPopupClickOutside) means the stale citation-popup outside-click handler no longer tears out the host while the dialog is open. No leaked document listeners.
result: [pending — deferred to Phase 5 UAT-05]

### 3. Sticky [Remove selection text] toggle persistence (SC2 / CAP-02 / UAT-06)
expected: Toggling [Remove selection text] ON, submitting, then re-opening the dialog within the same install shows the toggle still ON (chrome.storage.local key reportDialogRemoveSelectionText). With it ON, selectionText is absent from both the preview and the transmitted payload. CR-03 fix: Submit is disabled until the sticky pref loads, so the preference is never bypassed by a fast submit.
result: [pending — deferred to Phase 5 UAT-05]

### 4. Auto-surface trigger behavior on a live page (SC1 / TRIG-01..04)
expected: On a real Google Patents page — no-match → Report button present, "No match found" pre-selected; yellow-confidence (Tier 5 / 0.85) → present, "Inaccurate citation" pre-selected; Worker-fallback error → present, "Tool not working" pre-selected; green high-confidence success → Report button NOT present.
result: [pending — deferred to Phase 5 UAT-05]

### 5. Live payload field values (SC4 / PAY-08 / PAY-09)
expected: A real submission's payload contains populated selected_node_xpath, scroll_y, viewport_width, viewport_height, and pdfParseStatus from live page state, plus the bugReportErrorBuffer ring buffer (last ≤20 extension-tagged entries) when non-empty. No ip/clientIp/full userAgent present.
result: [pending — deferred to Phase 5 UAT-05]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

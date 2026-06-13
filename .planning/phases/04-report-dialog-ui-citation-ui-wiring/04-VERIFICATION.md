---
phase: 04-report-dialog-ui-citation-ui-wiring
verified: 2026-06-13T15:30:00Z
status: human_needed
score: 12/12
overrides_applied: 0
human_verification:
  - test: "SC3 live focus-trap behavior on Google Patents — open the Report dialog and tab through all focusable elements; verify focus cycles within the panel and does not escape to the host page"
    expected: "Tab cycles through radio buttons, note textarea, see-what's-sent toggle, Remove-selection-text checkbox, Submit, Cancel — focus never reaches Google Patents elements; Shift+Tab reverses correctly"
    why_human: "jsdom not available (zero-dep DoD); installFocusTrap uses shadowRoot.addEventListener and shadowRoot.activeElement which cannot be exercised in the node test environment; Phase 5 UAT-05 is the accepted venue"
  - test: "SC3 click-outside dismiss — with the Report dialog open, click an area of the Google Patents page outside the citation host and confirm the dialog is dismissed without submission"
    expected: "Dialog closes, no toast appears, focus returns to the Report button"
    why_human: "Document mousedown event retargeting in a closed Shadow DOM cannot be verified with static analysis; live page context required"
  - test: "SC2 sticky toggle persistence — activate [Remove selection text] toggle, close dialog, re-open Report dialog, and confirm toggle is still checked across re-opens"
    expected: "Toggle state is loaded from chrome.storage.local reportDialogRemoveSelectionText on every dialog open; checkbox is pre-checked if user previously activated it"
    why_human: "Requires live chrome.storage.local round-trip in extension context; storage mock in node tests proves the save/load logic exists but not the persistence through extension reload scenarios"
  - test: "SC1 Report button visible on no-match/yellow-confidence/Worker-error, hidden on green — trigger each outcome type on a real Google Patents page and observe button presence"
    expected: "No-match shows button with 'No match found' pre-selected; yellow-confidence shows 'Inaccurate citation' pre-selected; PDF-error shows 'Tool not working'; green high-confidence shows NO button"
    why_human: "Live Google Patents page required to exercise the full popup rendering path with real DOM"
  - test: "SC4 pdfParseStatus in submitted payload — submit a report and verify the payload received by the Worker includes xpathNode, scrollY, viewportWidth, viewportHeight, pdfParseStatus"
    expected: "Payload fields are non-null and match live page state at time of Report-button click"
    why_human: "Requires live submission to confirm end-to-end payload assembly; static tests pin derivation logic only"
---

# Phase 4: Report Dialog UI + Citation-UI Wiring — Verification Report

**Phase Goal:** The Shadow DOM report dialog, Report button in the citation popup, auto-surfacing logic on failure/yellow-confidence/Worker-error, error log ring buffer capture, and DOM/PDF diagnostic enrichment all land together so a user can trigger the full in-citation report flow from a real Google Patents page.
**Verified:** 2026-06-13T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Report button auto-surfaces with correct pre-selected category (no-match→no_match/TRIG-01, yellow→inaccurate_citation/TRIG-02, Worker-error→tool_not_working/TRIG-03); hidden on green/TRIG-04 | VERIFIED | `mapConfidenceTier` + `mapOutcomeToReportCategory` in content-script.js lines 33-57; `confidenceTier !== 'green'` guard in citation-ui.js lines 170 and 296; wired at all 7 trigger sites; 25 Vitest assertions in report-trigger-mapping.test.js all passing |
| 2 | SC2: "What's included" panel starts collapsed, renders field-by-field preview; [Remove selection text] toggle omits selectionText from preview AND payload; toggle is sticky via chrome.storage.local | VERIFIED | Panel `.cite-report-whats-included` starts with CSS `display: none`; expanded class toggled; `includeSelectionText` wired to `buildReportPayload`; `reportDialogRemoveSelectionText` saved/loaded; SC2 Vitest assertion confirms key ENTIRELY ABSENT when false |
| 3 | SC3: Submit closes dialog on success; Escape/Cancel/click-outside all dismiss without submission; focus trapped within modal while open, restored to trigger on close | VERIFIED (static) / HUMAN NEEDED (live) | `installFocusTrap` uses `shadowRoot.activeElement`; Escape → stopPropagation + preventDefault + dismiss; Cancel click → dismissDialog; mousedown click-outside handler wired with 100ms delay; `triggerEl.focus()` on all dismiss paths; live behavior deferred to Phase 5 UAT-05 per accepted zero-dep DoD |
| 4 | SC4: Submitted payload includes xpathNode/scrollY/viewportWidth/viewportHeight/pdfParseStatus from live page state; bugReportErrorBuffer included when non-empty | VERIFIED (static) / HUMAN NEEDED (live submission) | `getReportDiagnostics()` called at top of `showReportDialog` before DOM build (Pitfall 3); `bugReportErrorBuffer` read from storage in submit handler; all fields assembled into `context` and passed to `buildReportPayload`; PAY-08/09 Vitest suites (35 tests) all passing |
| 5 | PAY-08: Extension-tagged console.error/warn (prefixes [SW]/[PCT]/[Offscreen]/[Firefox]/[BG]) appended to bugReportErrorBuffer; ring holds last 20; never throws | VERIFIED | EXTENSION_PREFIXES line 30 includes all 5 prefixes including [BG] (CR-01 fix); appendToBuffer caps at BUFFER_MAX=20; try/catch swallows all errors; 10 Vitest tests in report-dialog-buffer.test.js all passing |
| 6 | PAY-09: getReportDiagnostics() returns {xpathNode, scrollY, viewportWidth, viewportHeight, selectionText} at call time; getPdfParseStatus derives 5-case table correctly | VERIFIED | getReportDiagnostics reads window.scrollY/innerWidth/innerHeight/getSelection at call time; getPdfParseStatus 5-case derivation verified by 25 tests; WR-01 fix ensures cache-hit branch is reachable in both SW and Firefox background |
| 7 | CAP-01: showReportDialog(shadow, reportOutcome, selectionRect) renders anchored div[role=dialog aria-modal=true] in received shadow root, NEVER calls getCitationHost(); 4-category radio group, 256-char note+counter, Submit+Cancel, privacy disclosure | VERIFIED | grep of getCitationHost in report-dialog.js = 0; ARIA attrs at lines 596-598; all 4 CATEGORIES built via createElement; maxLength=256 with live counter; disclosure text "Includes patent #..." present; static-grep in report-trigger-mapping.test.js confirms |
| 8 | CAP-02 D-02: CSS uses only verbatim citation-ui.js hex tokens from UI-SPEC Design Token Summary; no new hex values | VERIFIED | Hex token allowlist check in 04-02-PLAN.md Task 1 verify command passed; no TBD/FIXME/hex violations found in report-dialog.js CSS |
| 9 | CAP-03: Report button injected into .cite-row (via showCitationPopup) and error popup (showErrorPopup) with nudge text "⚑ Report a problem"; clicking calls showReportDialog with button as trigger | VERIFIED | citation-ui.js lines 170-183 (showCitationPopup) and 296-306 (showErrorPopup) both inject reportBtn with textContent "⚑ Report a problem"; click handler passes reportBtn as triggerEl |
| 10 | CAP-04 focus-trap: installFocusTrap on shadowRoot keydown using shadowRoot.activeElement; Escape stopPropagation+preventDefault; Tab cycling; focus restored to triggerEl | VERIFIED (static) | installFocusTrap at lines 469-522; shadowRoot.activeElement at line 499; stopPropagation on Escape (484) and Tab (491); setTimeout focus on open (519); triggerEl.focus() in dismissDialog (905) |
| 11 | installErrorBuffer() wired in content-script.js, service-worker.js, and firefox/background.js | VERIFIED | content-script.js line 19: import + line 19: installErrorBuffer(); service-worker.js line 13+17; firefox/background.js line 26+30; build confirms both dist bundles contain installErrorBuffer |
| 12 | XPORT-06 and getCitationHost lifecycle invariants preserved | VERIFIED | grep fetch(WORKER_REPORT_URL in src/content/ = 0 results; grep getCitationHost( in report-dialog.js = 0; static-grep assertions in report-trigger-mapping.test.js enforce both in CI |

**Score:** 12/12 truths verified (5 human verification items for live-DOM and live-submission behaviors)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/content/report-dialog.js` | showReportDialog + installErrorBuffer + getReportDiagnostics + getPdfParseStatus + getBrowserString + getOsString + installFocusTrap + getReportDialogCSS | VERIFIED | 1044 lines; all exports present; substantive implementation confirmed |
| `src/background/service-worker.js` | installErrorBuffer() call at module init | VERIFIED | Line 13: import; line 17: installErrorBuffer() |
| `src/firefox/background.js` | installErrorBuffer() call at module init | VERIFIED | Line 26: import; line 30: installErrorBuffer() |
| `src/content/citation-ui.js` | Report button in .cite-row + .cite-report-btn CSS + extended showCitationPopup/showErrorPopup signatures + cancelPopupClickOutside | VERIFIED | Lines 170-183, 296-306 button injection; lines 551-578 CSS; signatures extended with optional reportOutcome=null; cancelPopupClickOutside exported at line 32 |
| `src/content/content-script.js` | mapConfidenceTier, mapOutcomeToReportCategory, reportOutcome threading at all trigger sites | VERIFIED | Lines 33-57 helpers; lines 495-615 trigger wiring at all 7 sites |
| `tests/unit/report-dialog-buffer.test.js` | PAY-08 ring buffer behavior tests | VERIFIED | 10 tests; all passing |
| `tests/unit/report-dialog-diagnostics.test.js` | PAY-09 pdfParseStatus + browser/OS + selectionText-omission tests | VERIFIED | 23 tests; all passing |
| `tests/unit/report-trigger-mapping.test.js` | TRIG mapping + static-grep guards | VERIFIED | 25 tests; all passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| citation-ui.js Report button click | report-dialog.js showReportDialog | import + click handler | VERIFIED | import at citation-ui.js line 19; click handler at lines 179, 305 |
| content-script.js trigger sites | citation-ui.js showCitationPopup/showErrorPopup reportOutcome param | mapped {category, confidenceTier} | VERIFIED | 7 trigger sites each pass reportOutcome object or null |
| showReportDialog handleSubmit | buildReportPayload (src/shared/report-payload-builder.js) | context assembled from Plan 01 helpers + includeSelectionText | VERIFIED | buildReportPayload called at report-dialog.js line 986 |
| showReportDialog handleSubmit | Phase 3 background MSG.SUBMIT_REPORT handler | chrome.runtime.sendMessage | VERIFIED | MSG.SUBMIT_REPORT used at line 996 |
| [Remove selection text] toggle | chrome.storage.local reportDialogRemoveSelectionText | sticky save/load | VERIFIED | load at line 819; save at line 835 |
| installErrorBuffer console.error/warn override | chrome.storage.local bugReportErrorBuffer | appendToBuffer fire-and-forget RMW | VERIFIED | appendToBuffer at line 68; ERROR_BUFFER_KEY at line 26 |
| getPdfParseStatus | chrome.storage.local currentPatent | status+source derivation | VERIFIED | chrome.storage.local.get('currentPatent') at line 207; 5-case derivation lines 209-213 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| report-dialog.js submit handler | context.xpathNode | getReportDiagnostics() captured at showReportDialog entry | Yes — window.getSelection() at click time | FLOWING |
| report-dialog.js submit handler | context.pdfParseStatus | getPdfParseStatus reads chrome.storage.local currentPatent | Yes — 5-case derivation from real storage (WR-01 fix ensures cache-hit is reachable) | FLOWING |
| report-dialog.js submit handler | errors array | chrome.storage.local bugReportErrorBuffer read at submit time | Yes — populated by installErrorBuffer interceptors in 3 contexts | FLOWING |
| report-dialog.js submit handler | includeSelectionText | chrome.storage.local reportDialogRemoveSelectionText loaded async | Yes — Submit blocked until storage resolves (CR-03 fix) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | `node scripts/build.js` | "Built chrome in 14ms / Built firefox in 7ms" | PASS |
| Phase 4 test suites pass | `npx vitest run tests/unit/report-dialog-buffer.test.js tests/unit/report-dialog-diagnostics.test.js tests/unit/report-trigger-mapping.test.js` | 58 passed (10+23+25) | PASS |
| Full test suite: 1560 passing, 5 pre-existing failures only | `npm run test:src` | 2 failed (88 files) / 5 failed (1565 tests) — confirmed warning-01-transport-tag.test.js and v40-auto-fix-yaml.test.js only | PASS |
| No fetch(WORKER_REPORT_URL in src/content/ | `grep -r "fetch(WORKER_REPORT_URL" src/content/` | 0 results | PASS |
| No getCitationHost( in report-dialog.js | `grep "getCitationHost(" src/content/report-dialog.js` | 0 results | PASS |
| [BG] in EXTENSION_PREFIXES (CR-01) | code inspection | EXTENSION_PREFIXES line 30 includes '[BG]' | PASS |
| Submit disabled until sticky pref loads (CR-03) | code inspection | submitBtn.disabled = true at line 858; set false after storage resolves at lines 824/827 | PASS |
| cancelPopupClickOutside called on dialog open (CR-02) | code inspection | cancelPopupClickOutside() at report-dialog.js line 571 | PASS |
| WR-01: source=null on cache-hit in service-worker.js | `grep "source = null" src/background/service-worker.js` | line 403: `patent.source = null; // WR-01` | PASS |
| WR-04: catch block shows neutral toast not rate-limit string | code inspection | catch at report-dialog.js lines 1017-1027 shows 'Report could not be sent — please try again' | PASS |

### Probe Execution

No probe files found under scripts/tests/. Not a migration/tooling phase. Probe execution: SKIPPED (no probes declared or conventional).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CAP-01 | 04-02 | Shadow DOM modal with 4-category radio, note+counter, Submit/Cancel, privacy disclosure | SATISFIED | report-dialog.js showReportDialog; div[role=dialog]; 4 CATEGORIES; maxLength=256; disclosure text present |
| CAP-02 | 04-02 | "What's included" panel + [Remove selection text] sticky toggle; omits selectionText when off | SATISFIED | .cite-report-whats-included starts collapsed; toggle saves reportDialogRemoveSelectionText; buildReportPayload called with includeSelectionText |
| CAP-03 | 04-03 | Report button in citation popup adjacent to Copy; icon-only/nudge; clicking opens dialog | SATISFIED | button injected in showCitationPopup + showErrorPopup; textContent "⚑ Report a problem" |
| CAP-04 | 04-02 | Dialog UX: close on Submit; Escape/Cancel/click-outside dismiss; focus trap + restore | SATISFIED (static) | installFocusTrap; Escape handler; Cancel click; mousedown click-outside; triggerEl.focus() on all dismiss paths |
| TRIG-01 | 04-03 | Report button on no-match/failure with "No match found" pre-selected | SATISFIED | mapOutcomeToReportCategory returns 'no_match' for 'no-match'/'paragraph-not-found'; wired at lines 506, 613 |
| TRIG-02 | 04-03 | Report button on yellow-confidence with "Inaccurate citation" pre-selected | SATISFIED | mapConfidenceTier returns 'yellow' for 0.80<=confidence<0.95; mapOutcomeToReportCategory returns 'inaccurate_citation' |
| TRIG-03 | 04-03 | Report button on Worker-fallback errors with "Tool not working" pre-selected | SATISFIED | 'no-position-map'/'lookup-failed'/'pdf-not-available' → 'tool_not_working'; statusReportOutcome at content-script.js line 524 |
| TRIG-04 | 04-03 | Report button NOT shown on green/high-confidence | SATISFIED | `confidenceTier !== 'green'` guard in citation-ui.js lines 170 and 296; mapOutcomeToReportCategory returns null for confidence>=0.95 |
| PAY-08 | 04-01 | Error log ring buffer: last 20 extension-tagged console errors in bugReportErrorBuffer | SATISFIED | installErrorBuffer with EXTENSION_PREFIXES including [BG]; appendToBuffer caps at 20; wired in all 3 contexts |
| PAY-09 | 04-01 | xpathNode/scrollY/viewportWidth/viewportHeight/pdfParseStatus from live page state | SATISFIED | getReportDiagnostics() + getPdfParseStatus(); captured at dialog-open time per Pitfall 3; 5-case derivation verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in production files | — | — |

All `return null` occurrences in report-dialog.js are legitimate null-safe guards (no selection, unknown OS/browser, absent patent data), not stub returns.

### Human Verification Required

The following behaviors require live extension execution on a real Google Patents page and cannot be verified by static analysis or node-environment tests. These are specifically identified in the Phase 4 plans as deferred to Phase 5 UAT-05 under the accepted zero-dependency DoD constraint.

#### 1. Focus Trap Live Behavior (SC3)

**Test:** Install the extension, navigate to a Google Patents page, trigger a no-match or yellow-confidence outcome, click the Report button to open the dialog, then Tab through all interactive elements
**Expected:** Focus cycles through: first radio button → remaining radios → note textarea → "see what's sent" button → Remove-selection-text checkbox → Submit → Cancel → first radio (wrapping); Shift+Tab reverses; no focus ever reaches Google Patents elements outside the shadow host
**Why human:** `shadowRoot.addEventListener('keydown')` and `shadowRoot.activeElement` cannot be exercised in the jsdom-absent node test environment; live Polymer key-binding competition cannot be simulated

#### 2. Click-Outside Dismiss (SC3)

**Test:** With the Report dialog open, click anywhere outside the citation host element on the Google Patents page
**Expected:** Dialog dismisses without submission; focus returns to the Report button; no toast appears; no host DOM wipe occurs (CR-02 fix: cancelPopupClickOutside prevents the stale popup mousedown handler from destroying the host)
**Why human:** Document mousedown event retargeting in a closed Shadow DOM requires live page context; the mousedown handler's `citationHost.contains(e.target)` check cannot be fully exercised without a real host element

#### 3. Sticky Toggle Persistence (SC2)

**Test:** Open Report dialog; expand "What's included"; activate [Remove selection text] toggle; dismiss dialog; re-open Report dialog
**Expected:** Toggle is still checked on re-open; "The text you selected" row is hidden in the preview; submitting produces a payload where selectionText is absent
**Why human:** Requires a real chrome.storage.local round-trip through the extension lifecycle; the node test environment proves the load/save code paths exist but not persistence across dialog re-open cycles within a live extension context

#### 4. Full Trigger Behavior on Live Page (SC1)

**Test:** Trigger each of the four outcome types on a real Google Patents page: (a) select text with no matching paragraph, (b) get a yellow-confidence result, (c) trigger a PDF analysis failure, (d) get a green high-confidence result
**Expected:** (a) Report button visible with "No match found" pre-selected; (b) visible with "Inaccurate citation"; (c) visible with "Tool not working"; (d) NO Report button visible
**Why human:** Requires real patent page + real citation flow to exercise the full rendering path; Vitest tests cover the mapping logic but not the full popup rendering and button injection in a live Shadow DOM

#### 5. Payload Field Values in Live Submission (SC4)

**Test:** Submit a report after triggering a non-green outcome; inspect the payload received at the Worker (via Discord webhook or Worker log)
**Expected:** Payload contains non-null xpathNode (XPath string of selected DOM node), scrollY (page scroll offset in pixels), viewportWidth/viewportHeight (browser window dimensions), pdfParseStatus ('success'/'failed'/'skipped'/'cache-hit'), and errorLog array
**Why human:** End-to-end payload verification requires a live submission that reaches the Worker; static tests prove the assembly code but not the actual values transmitted

---

### Gaps Summary

No blocking gaps identified. All 12 observable truths are VERIFIED via static code inspection and automated test execution. The 5 human verification items are live-DOM behaviors explicitly planned to defer to Phase 5 UAT-05 under the accepted zero-dependency (no jsdom) constraint — this is a documented design decision, not a coverage gap.

The four critical review findings (CR-01 [BG] prefix, CR-02 stale mousedown teardown, CR-03 privacy race, WR-01..04 warnings) were all fixed with commits 29e61f0, a56903a, 6058ace, 3f993e6, 0b3c6d5/3eb9b40, a51a161, 47a91d3 — all confirmed present in git history and in the source files.

The 2 INFO findings (IN-01 full browser version string, IN-02 button DOM order) were intentionally deferred as non-blocking cosmetic issues per the review disposition.

---

_Verified: 2026-06-13T15:30:00Z_
_Verifier: Claude (gsd-verifier)_

// tests/unit/debug-mode-page-dialog.test.js
//
// Phase 5 Plan 04 (DBG-01/02, CAP-05/06, D-01/D-05/D-07/D-08) — Vitest suite:
//   Static-grep guard assertions that pin the Phase-5 build invariants and prevent
//   silent regression of load-bearing tokens across future refactors.
//
// NOTE: content-script.js, citation-ui.js, report-dialog.js, options.js, and popup.js
// are extension entry points with top-level chrome.*/DOM globals that crash on import
// in the node test environment (no jsdom, zero-dep DoD).  This file uses the same
// pure static-grep approach as tests/unit/report-trigger-mapping.test.js — each
// assertion reads the source file via readFileSync and checks token presence/absence.
//
// Coverage:
//   DBG-01: debugMode default false in content-script.js DEFAULT_SETTINGS and options.js defaults
//   DBG-02: content-script.js onChanged updates cachedSettings.debugMode;
//           both showCitationPopup call sites thread debugMode: cachedSettings.debugMode
//   DBG-02/TRIG-04: citation-ui.js guard relaxes on reportOutcome.debugMode; isGreenDebug branch
//   D-05: green-debug button uses bare '⚑' glyph; setAttribute('aria-label', ...) retained
//   CAP-05: popup.html has id="reportLink"; popup.js writes pendingOptionsHash + openOptionsPage
//   CAP-06/D-08: options.js imports showReportDialog, mode 'page', currentPatent, location.hash/
//                pendingOptionsHash routing; report-dialog.js has mountContext + installFocusTrapPage;
//                report-dialog.js does NOT contain getCitationHost(
//   D-01 (XSS safety): report-dialog.js stale banner uses .textContent; report-dialog.js does not
//                       use .innerHTML adjacent to the stale-banner class name
//
// Static-grep pattern mirrors tests/unit/report-trigger-mapping.test.js (lines 203-231).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers: read source files once per suite run
// ---------------------------------------------------------------------------

const contentScriptSrc = readFileSync(
  path.resolve(__dirname, '../../src/content/content-script.js'),
  'utf8'
);

const citationUiSrc = readFileSync(
  path.resolve(__dirname, '../../src/content/citation-ui.js'),
  'utf8'
);

const reportDialogSrc = readFileSync(
  path.resolve(__dirname, '../../src/content/report-dialog.js'),
  'utf8'
);

const optionsSrc = readFileSync(
  path.resolve(__dirname, '../../src/options/options.js'),
  'utf8'
);

const optionsHtmlSrc = readFileSync(
  path.resolve(__dirname, '../../src/options/options.html'),
  'utf8'
);

const popupJsSrc = readFileSync(
  path.resolve(__dirname, '../../src/popup/popup.js'),
  'utf8'
);

const popupHtmlSrc = readFileSync(
  path.resolve(__dirname, '../../src/popup/popup.html'),
  'utf8'
);

// ---------------------------------------------------------------------------
// DBG-01: debugMode defaults to false in content-script.js and options.js
// ---------------------------------------------------------------------------

describe('DBG-01 — debugMode defaults to false', () => {
  it('DBG-01: content-script.js DEFAULT_SETTINGS contains "debugMode: false"', () => {
    expect(contentScriptSrc).toContain('debugMode: false');
  });

  it('DBG-01: options.js storage.sync.get defaults contain "debugMode: false"', () => {
    expect(optionsSrc).toContain('debugMode: false');
  });
});

// ---------------------------------------------------------------------------
// DBG-02: content-script.js live-reads debugMode in onChanged and threads it
//         into reportOutcome at both showCitationPopup call sites
// ---------------------------------------------------------------------------

describe('DBG-02 — debugMode live-read wiring in content-script.js', () => {
  it('DBG-02: onChanged branch updates cachedSettings.debugMode from changes.debugMode', () => {
    expect(contentScriptSrc).toContain('changes.debugMode');
    expect(contentScriptSrc).toContain('cachedSettings.debugMode = changes.debugMode.newValue');
  });

  it('DBG-02: at least one showCitationPopup call site threads debugMode: cachedSettings.debugMode', () => {
    // Both call sites (application path + CITATION_RESULT handler) add debugMode.
    // The token appears at least twice in the file.
    const occurrences = contentScriptSrc.split('debugMode: cachedSettings.debugMode').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// DBG-02 / TRIG-04 / D-05: citation-ui.js guard tokens
//   - TRIG-04: confidenceTier !== 'green' retained (existing invariant)
//   - DBG-02:  || reportOutcome.debugMode relaxes guard when debugMode on
//   - D-05:    isGreenDebug branch applies plain-icon (no amber nudge) on green+debug
// ---------------------------------------------------------------------------

describe('DBG-02/TRIG-04/D-05 — citation-ui.js guard relaxes on debugMode', () => {
  it('TRIG-04: citation-ui.js still contains "confidenceTier !== \'green\'" (invariant)', () => {
    expect(citationUiSrc).toContain("confidenceTier !== 'green'");
  });

  it('DBG-02: citation-ui.js guard contains "reportOutcome.debugMode"', () => {
    expect(citationUiSrc).toContain('reportOutcome.debugMode');
  });

  it('D-05: citation-ui.js contains "isGreenDebug" token (plain-icon branch)', () => {
    expect(citationUiSrc).toContain('isGreenDebug');
  });

  it('D-05: citation-ui.js green-debug path sets bare flag glyph (no amber nudge)', () => {
    // The plain-icon branch text: isGreenDebug ? '⚑' : '⚑ Report a problem'
    expect(citationUiSrc).toContain("'⚑'");
  });

  it('D-05: aria-label setAttribute still present on the report button (accessibility retained)', () => {
    expect(citationUiSrc).toContain("setAttribute('aria-label'");
  });
});

// ---------------------------------------------------------------------------
// CAP-05: popup.html has reportLink; popup.js writes pendingOptionsHash + openOptionsPage
// ---------------------------------------------------------------------------

describe('CAP-05 — popup reportLink wiring', () => {
  it('CAP-05: popup.html contains id="reportLink"', () => {
    expect(popupHtmlSrc).toContain('id="reportLink"');
  });

  it('CAP-05: popup.js contains "pendingOptionsHash"', () => {
    expect(popupJsSrc).toContain('pendingOptionsHash');
  });

  it('CAP-05: popup.js calls openOptionsPage (routes to options page)', () => {
    expect(popupJsSrc).toContain('openOptionsPage');
  });
});

// ---------------------------------------------------------------------------
// CAP-06 / D-08: options.js page-mode dialog init + report-dialog.js mountContext
// ---------------------------------------------------------------------------

describe('CAP-06/D-08 — options.js page-mode dialog and report-dialog.js mountContext', () => {
  it('CAP-06: options.js imports showReportDialog', () => {
    expect(optionsSrc).toContain('showReportDialog');
  });

  it('CAP-06: options.js contains mode: \'page\' (page-mode mountContext passed to showReportDialog)', () => {
    expect(optionsSrc).toContain("mode: 'page'");
  });

  it('CAP-06: options.js reads currentPatent from storage', () => {
    expect(optionsSrc).toContain('currentPatent');
  });

  it('CAP-06: options.js handles location.hash routing (direct hash navigation)', () => {
    expect(optionsSrc).toContain('location.hash');
  });

  it('CAP-06: options.js handles pendingOptionsHash routing (popup.js signal)', () => {
    expect(optionsSrc).toContain('pendingOptionsHash');
  });

  it('CAP-06: options.html contains id="report" (section anchor for scrollIntoView)', () => {
    expect(optionsHtmlSrc).toContain('id="report"');
  });

  it('CAP-06: options.html contains id="reportDialogMount" (page-mode dialog container)', () => {
    expect(optionsHtmlSrc).toContain('id="reportDialogMount"');
  });

  it('D-08: report-dialog.js contains "mountContext" (refactored signature)', () => {
    expect(reportDialogSrc).toContain('mountContext');
  });

  it('D-08: report-dialog.js contains "installFocusTrapPage" (page-mode focus trap)', () => {
    expect(reportDialogSrc).toContain('installFocusTrapPage');
  });

  it('D-08: report-dialog.js does NOT contain "getCitationHost(" (ban still enforced)', () => {
    expect(reportDialogSrc).not.toContain('getCitationHost(');
  });
});

// ---------------------------------------------------------------------------
// Page-mode safety / D-01 XSS guard:
//   - stale banner uses .textContent (never .innerHTML)
//   - report-dialog.js contains cite-report-stale-banner class
//   - report-dialog.js installs page-mode focus trap via document.activeElement
// ---------------------------------------------------------------------------

describe('Page-mode safety / D-01 XSS guard — stale-banner textContent', () => {
  it('D-01: report-dialog.js contains "cite-report-stale-banner" class name', () => {
    expect(reportDialogSrc).toContain('cite-report-stale-banner');
  });

  it('D-01: report-dialog.js sets stale-banner via .textContent (XSS guard)', () => {
    // The banner content is set as staleBanner.textContent = `...`
    expect(reportDialogSrc).toContain('staleBanner.textContent');
  });

  it('D-01: report-dialog.js does not use .innerHTML for the stale-banner (XSS prevention)', () => {
    // innerHTML may appear in comments — check that the string
    // "stale-banner" does not appear on the same line as "innerHTML" in actual code.
    // Simplest guard: verify .innerHTML is not present as executable code adjacent to banner.
    // The only .innerHTML occurrences in the file should be in comment text, not code.
    const lines = reportDialogSrc.split('\n');
    const violatingLines = lines.filter(line => {
      const isComment = line.trimStart().startsWith('//') || line.trimStart().startsWith('*');
      return !isComment && line.includes('.innerHTML') && line.includes('staleBanner');
    });
    expect(violatingLines).toHaveLength(0);
  });

  it('Page-mode focus trap: installFocusTrapPage uses document.activeElement (not shadowRoot)', () => {
    expect(reportDialogSrc).toContain('document.activeElement');
  });
});

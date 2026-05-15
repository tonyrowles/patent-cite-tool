// tests/e2e/lib/observation.js
//
// readCitationPill(page) — reads the data-testid="pct-citation-pill" element
//   inside the citation Shadow DOM. The shadow-open shim makes the closed
//   root readable via host.shadowRoot in Playwright's evaluation context.
//
// readClipboardShim(page) — reads window.__lastCopiedText__ (populated by
//   the clipboard-observer shim on every 'copy' event).
//
// getCitation(page, {mode, timeout}) — Phase 27 SEL-02 higher-level wrapper.
//   Returns the structured citation observation:
//     { citation: string, confidence: 'green'|'yellow'|'red', mode: 'auto'|'silent' }
//
//   In 'auto' mode: reads the pill at [data-testid="pct-citation-pill"] and
//   maps the inner .cite-confidence class (or its absence) to a color per
//   the production rules in src/content/citation-ui.js:123-148:
//     - no .cite-confidence dot (confidence ≥ 0.95)        → 'green'
//     - .cite-confidence.cite-conf-medium (0.80 ≤ x < 0.95) → 'yellow'
//     - .cite-confidence.cite-conf-low    (x < 0.80)        → 'red'
//
//   In 'silent' mode: polls window.__lastCopiedText__ (populated by the
//   Phase 26 clipboard-observer shim) and parses the trailing citation
//   token. Confidence is inferred from the in-shadow toast presence:
//   success toast → 'green'; failure toast → 'red'; neither → 'yellow'.
//
//   REQUIREMENTS.md SEL-02 text says `mode: 'sync'|'async'`; the shipped
//   contract uses `mode: 'auto'|'silent'` per CONTEXT.md (user-locked
//   trigger-mode names). The rename is intentional.

const PILL_SELECTOR = '[data-testid="pct-citation-pill"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<string>} the pill's trimmed textContent
 */
export async function readCitationPill(page, { timeout = 5_000 } = {}) {
  const handle = await page.waitForSelector(
    '[data-testid="pct-citation-pill"]',
    { state: 'attached', timeout },
  );
  return await handle.evaluate((el) => (el.textContent || '').trim());
}

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>} the most recent copy-event payload, or ''
 */
export async function readClipboardShim(page) {
  return await page.evaluate(() => window.__lastCopiedText__ || '');
}

/**
 * Higher-level citation observer that dispatches to the right reader for
 * the active trigger mode and returns the structured SEL-02 shape.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ mode?: 'auto'|'silent', timeout?: number }} [opts]
 * @returns {Promise<{ citation: string, confidence: 'green'|'yellow'|'red', mode: 'auto'|'silent' }>}
 */
export async function getCitation(page, { mode = 'auto', timeout = 30_000 } = {}) {
  if (mode === 'silent') {
    return await readSilentCitation(page, { timeout });
  }
  if (mode !== 'auto') {
    throw new Error(`getCitation: invalid mode "${mode}" — expected 'auto' or 'silent'`);
  }
  return await readAutoCitation(page, { timeout });
}

async function readAutoCitation(page, { timeout }) {
  await page.waitForSelector(PILL_SELECTOR, { state: 'attached', timeout });
  const result = await page.evaluate((sel) => {
    // `document.querySelector` does NOT pierce shadow boundaries. The
    // citation pill lives inside the extension's host shadow root
    // (opened for tests via the post-build patch in
    // tests/e2e/lib/extension-loader.js). Look in that shadow root
    // directly.
    function findPill() {
      const direct = document.querySelector(sel);
      if (direct) return direct;
      const host = document.getElementById('patent-cite-host');
      if (host && host.shadowRoot) {
        const inShadow = host.shadowRoot.querySelector(sel);
        if (inShadow) return inShadow;
      }
      return null;
    }
    const pill = findPill();
    if (!pill) return { citation: '', confidence: 'red' };
    const textEl = pill.querySelector('.cite-text');
    const text = textEl ? (textEl.textContent || '').trim() : '';
    const dot = pill.querySelector('.cite-confidence');
    let confidence;
    if (!dot) {
      confidence = 'green';                 // ≥0.95: dot not appended (citation-ui.js:143)
    } else if (dot.classList.contains('cite-conf-medium')) {
      confidence = 'yellow';                // 0.80 ≤ x < 0.95
    } else if (dot.classList.contains('cite-conf-low')) {
      confidence = 'red';                   // x < 0.80
    } else {
      confidence = 'green';                 // cite-conf-high (rarely rendered)
    }
    return { citation: text, confidence };
  }, PILL_SELECTOR);
  return { citation: result.citation, confidence: result.confidence, mode: 'auto' };
}

async function readSilentCitation(page, { timeout = 3_000 } = {}) {
  // Try the clipboard-observer shim first; if it captures only the selection
  // text (no citation suffix), fall back to navigator.clipboard.readText()
  // which reads the SYSTEM clipboard (populated by the extension's
  // event.clipboardData.setData() + event.preventDefault() in
  // src/content/content-script.js:297-348).
  //
  // Why the fallback exists: Chrome content scripts run in an ISOLATED
  // world. The 'copy' event's `event.clipboardData` is wrapped per-world,
  // so setData called from the extension's isolated world does NOT populate
  // the main-world DataTransfer the capture-phase shim reads. The system
  // clipboard IS populated though, because the browser uses the isolated
  // world's clipboardData when preventDefault was called there.
  //
  // CITATION_RE matches "N:N", "N:N-N", "N:N-N:N", or "[N]" at end of string,
  // optionally preceded by a patent prefix like "'427642B2 Pat., ".
  const CITATION_RE = /(\d+:\d+(?:-\d+(?::\d+)?)?|\[\d+\])\s*$/;
  const deadline = Date.now() + timeout;

  const readShim = () =>
    page.evaluate(() => window.__lastCopiedText__ || '');
  const readSystemClipboard = () =>
    page
      .evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch (e) {
          return '__CLIPBOARD_ERROR__:' + (e && e.message ? e.message : String(e));
        }
      })
      .catch(() => '');

  const readConfidence = () =>
    page.evaluate(() => {
      const host = document.getElementById('patent-cite-host');
      if (!host || !host.shadowRoot) return 'red';
      const success = host.shadowRoot.querySelector('.cite-toast-success');
      const failure = host.shadowRoot.querySelector('.cite-toast-failure');
      return success ? 'green' : failure ? 'red' : 'yellow';
    });

  while (Date.now() < deadline) {
    const shimText = await readShim();
    let citation = '';
    let raw = shimText;
    if (shimText) {
      const m = shimText.match(CITATION_RE);
      if (m) citation = m[1];
    }
    if (!citation) {
      // Shim didn't see a citation suffix — fall back to system clipboard.
      const sysText = await readSystemClipboard();
      if (sysText && !sysText.startsWith('__CLIPBOARD_ERROR__')) {
        const m2 = sysText.match(CITATION_RE);
        if (m2) {
          citation = m2[1];
          raw = sysText;
        }
      }
    }
    if (citation) {
      const confidence = await readConfidence();
      return { citation, confidence, mode: 'silent', raw };
    }
    if (raw && Date.now() + 100 < deadline) {
      // We have SOME clipboard data but no citation token yet — keep
      // polling in case the extension hasn't written its append yet.
      await page.waitForTimeout(100);
      continue;
    }
    await page.waitForTimeout(100);
  }
  return { citation: '', confidence: 'red', mode: 'silent' };
}

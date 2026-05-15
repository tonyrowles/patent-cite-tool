// tests/e2e/specs/regression.spec.js
//
// Phase 27 Plan 03 — deterministic 76-case regression spec.
//
// One Playwright test per entry in tests/test-cases.js TEST_CASES. Each test:
//   1. loadExtension() — fresh persistent context + fresh tmpdir → SEL-04 isolation
//   2. setTriggerMode(context, 'auto') — extension default is 'floating-button';
//      must explicitly switch BEFORE gotoPatent (RESEARCH.md Pitfall B)
//   3. gotoPatent(page, patentId) — derive patentId from caseId
//   4. selectText({page, uniqueSubstring: tc.selectedText}) — fires mouseup
//   5. getCitation(page, {mode: 'auto'}) — reads pill, maps confidence class
//   6. expect(observed.citation).toBe(baseline[caseId].citation)
//   7. expect(observed.confidence).toBe(colorFromNumericConfidence(baseline[caseId].confidence))
//   8. On throw: captureScreenshot + captureDomSnapshot, then rethrow (DIAG-01, DIAG-02)
//   9. cleanup() in finally — always closes context + removes tmpdir
//
// A beforeAll pre-flight on the seed patent (US11427642) guards against
// Google Patents DOM drift — on failure, throws once and all per-case tests
// fail-fast (single diagnostic, not 76).
//
// 2-second throttle between cases mitigates CAPTCHA risk on Google Patents
// (RESEARCH.md Pitfall D).
//
// SEL-03, SEL-04, DIAG-01, DIAG-02.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { TEST_CASES } from '../../test-cases.js';
import baseline from '../../golden/baseline.json' with { type: 'json' };
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';
import { selectText } from '../lib/selection.js';
import { getCitation } from '../lib/observation.js';
import { setTriggerMode } from '../lib/settings.js';
import { captureScreenshot, captureDomSnapshot } from '../lib/artifacts.js';
import { resolveRunId } from '../lib/run-id.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const RUN_ID = resolveRunId();

// 2-second throttle between cases — RESEARCH.md Pitfall D.
const THROTTLE_MS = 2_000;

// SMOKE_IDS are tagged with @smoke in the test title — Plan 04 also adds
// @smoke to one spec to give npm run e2e:smoke a 5-case Phase-27 subset.
//
// The 5 @smoke-tagged cases (one per category cluster, none OCR/edge-heavy):
//   - US11427642-spec-short-1   @smoke   (modern-short)
//   - US11427642-spec-long      @smoke   (modern-long)
//   - US11427642-cross-col      @smoke   (cross-column)
//   - US8352400-claims          @smoke   (claims)
//   - US10592688-spec-short     @smoke   (modern-short, different patent)
const SMOKE_IDS = new Set([
  'US11427642-spec-short-1',
  'US11427642-spec-long',
  'US11427642-cross-col',
  'US8352400-claims',
  'US10592688-spec-short',
]);

/**
 * 'US11427642-spec-short-1' → 'US11427642'
 * @param {string} caseId
 * @returns {string}
 */
function patentIdFromCaseId(caseId) {
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  if (!m) throw new Error(`patentIdFromCaseId: unable to parse ${caseId}`);
  return m[1];
}

/**
 * baseline.json stores a numeric confidence (e.g. 0.98). The pill maps it to
 * a CSS class, which observation.js maps to a color. Mirror the production
 * thresholds (citation-ui.js:124, 143).
 * @param {number} numeric
 * @returns {'green'|'yellow'|'red'}
 */
function colorFromNumericConfidence(numeric) {
  if (numeric >= 0.95) return 'green';
  if (numeric >= 0.80) return 'yellow';
  return 'red';
}

test.describe('Phase 27 regression — 76 cases, auto-trigger', () => {
  // -----------------------------------------------------------------------
  // Pre-flight DOM-drift smoke (RESEARCH.md Pattern 3). One pass on seed
  // patent; on drift, throw once and let all per-case tests inherit the
  // failure rather than producing 76 individual failures.
  // -----------------------------------------------------------------------
  test.beforeAll(async () => {
    const { page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
    try {
      await gotoPatent(page, 'US11427642');
      const probe = await page.evaluate(() => {
        const desc = document.querySelector('section[itemprop="description"]');
        if (!desc) return { ok: false, reason: 'description section missing' };
        const text = desc.textContent || '';
        const hasKnownPhrase = text.includes('plasma cells and plasmablasts');
        const hasParagraphs = !!desc.querySelector('div.description-paragraph');
        return {
          ok: hasKnownPhrase && hasParagraphs,
          reason: !hasKnownPhrase
            ? 'known phrase missing'
            : !hasParagraphs
            ? 'description-paragraph divs missing'
            : '',
        };
      });
      // CAPTCHA detector (RESEARCH.md Pitfall D).
      const isCaptcha = await page.evaluate(() => {
        return (
          !!document.querySelector('iframe[src*="recaptcha"]') ||
          window.location.href.includes('consent.google.com')
        );
      });
      if (isCaptcha) {
        try { await captureScreenshot(page, RUN_ID, 'PRE-FLIGHT-CAPTCHA'); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, 'PRE-FLIGHT-CAPTCHA'); } catch {}
        throw new Error('CAPTCHA_DETECTED: Google Patents pre-flight got a CAPTCHA — aborting suite');
      }
      if (!probe.ok) {
        try { await captureScreenshot(page, RUN_ID, 'PRE-FLIGHT-DOM-DRIFT'); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, 'PRE-FLIGHT-DOM-DRIFT'); } catch {}
        throw new Error(`DOM_DRIFT: Google Patents pre-flight failed — ${probe.reason}`);
      }
    } finally {
      await cleanup();
    }
  });

  // -----------------------------------------------------------------------
  // Per-case tests. Generate one test() per TEST_CASES entry. Tag SMOKE_IDS
  // with @smoke so Plan 04's npm run e2e:smoke picks them up via --grep.
  // -----------------------------------------------------------------------
  for (const tc of TEST_CASES) {
    const expected = baseline[tc.id];
    if (!expected) {
      throw new Error(`regression.spec: baseline.json missing entry for ${tc.id}`);
    }
    const title = SMOKE_IDS.has(tc.id) ? `${tc.id} @smoke` : tc.id;
    test(title, async () => {
      const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
      const patentId = patentIdFromCaseId(tc.id);
      try {
        // 1. Override trigger mode to 'auto' BEFORE navigation
        //    (RESEARCH.md Pitfall B — content script reads sync at init).
        await setTriggerMode(context, 'auto');
        // 2. Navigate
        await gotoPatent(page, patentId);
        // 3. Selection
        await selectText({ page, uniqueSubstring: tc.selectedText });
        // 4. Read pill
        const observed = await getCitation(page, { mode: 'auto' });
        // 5. Assert citation
        expect(observed.citation).toBe(expected.citation);
        // 6. Assert color-mapped confidence
        expect(observed.confidence).toBe(colorFromNumericConfidence(expected.confidence));
      } catch (e) {
        // Diagnostics on failure (DIAG-01, DIAG-02). Best-effort — never let
        // an artifact failure mask the underlying assertion failure.
        try { await captureScreenshot(page, RUN_ID, tc.id); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, tc.id); } catch {}
        throw e;
      } finally {
        await cleanup();
        // Throttle to reduce CAPTCHA risk on Google Patents
        // (RESEARCH.md Pitfall D). Total added: ~2.5 min across 76 cases.
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    });
  }
});

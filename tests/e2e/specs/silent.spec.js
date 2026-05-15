// tests/e2e/specs/silent.spec.js
//
// Phase 27 Plan 04 — silent-mode end-to-end smoke.
//
// Proves HARN-04 closes the loop in headless Chromium without xvfb-run:
//   1. setTriggerMode(context, 'silent')
//   2. gotoPatent
//   3. selectText (fires mouseup → handleSelection → 'silent' case → preSilentCitation)
//   4. page.keyboard.press('Control+C') → 'copy' event → content-script sets clipboard
//      → Phase 26 clipboard-observer shim captures → window.__lastCopiedText__
//   5. getCitation(page, {mode: 'silent'}) polls __lastCopiedText__ + parses citation token
//   6. assert against baseline.json (citation only; silent-mode confidence is best-effort)
//
// Two cases cover the breadth: short single-node selection + cross-column
// multi-node selection. Both on US11427642 — the same patent the regression
// suite's smoke subset uses, keeping the silent spec fast (~10s).
//
// SEL-02 (silent reader path), HARN-04 (clipboard observation in headless),
// DIAG-01/DIAG-02 wired to per-test catch blocks.
//
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
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
const SEED_PATENT = 'US11427642';

const RUN_ID = resolveRunId();

const SILENT_CASES = [
  {
    id: 'US11427642-silent-spec-short',
    baselineId: 'US11427642-spec-short-1',
    selectedText:
      'receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the',
  },
  {
    id: 'US11427642-silent-cross-col',
    baselineId: 'US11427642-cross-col',
    selectedText:
      'the CH2 and CH3 domains of classical antibodies. These UniAbs lack the first domain of the constant region (CHI ) which is present in the genome, but is spliced out during',
  },
];

test.describe('Phase 27 silent-mode end-to-end (US11427642)', () => {
  for (const tc of SILENT_CASES) {
    const expected = baseline[tc.baselineId];
    if (!expected) {
      throw new Error(`silent.spec: baseline.json missing entry for ${tc.baselineId}`);
    }
    test(tc.id, async () => {
      const { context, page, cleanup } = await loadExtension({
        extensionPath: EXTENSION_PATH,
      });
      try {
        await setTriggerMode(context, 'silent');
        await gotoPatent(page, SEED_PATENT);
        await selectText({ page, uniqueSubstring: tc.selectedText });
        // Trigger the silent-mode copy event. The content script's bubble-phase
        // copy listener (src/content/content-script.js:297-342) writes the
        // citation into the clipboard; the Phase 26 clipboard-observer shim's
        // capture-phase listener reads it into window.__lastCopiedText__.
        await page.keyboard.press('Control+C');
        const observed = await getCitation(page, { mode: 'silent' });
        // Assert citation only — silent-mode confidence inference is
        // best-effort (toast-based, may not be reliable). Plan 02 SUMMARY
        // documented this constraint.
        expect(observed.citation).toBe(expected.citation);
        expect(observed.mode).toBe('silent');
      } catch (e) {
        try { await captureScreenshot(page, RUN_ID, tc.id); } catch {}
        try { await captureDomSnapshot(page, RUN_ID, tc.id); } catch {}
        throw e;
      } finally {
        await cleanup();
      }
    });
  }
});

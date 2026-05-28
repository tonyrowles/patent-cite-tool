// tests/e2e/specs/quarantine.spec.js
//
// Phase 36 Plan 01 — non-gating quarantine corpus spec. D-01.
//
// One Playwright test per entry in tests/e2e/test-cases-quarantine.js
// TEST_CASES_QUARANTINE. Mirrors regression.spec.js but with quarantine-
// specific differences:
//
//   - NO golden assertion (quarantine entries originate from REAL failures
//     and are EXPECTED to fail; the spec is non-gating). getCitation returning
//     without throwing sets caseStatus='passed'; a throw sets caseStatus='failed'
//     and classifies errorClass.
//   - NO verifier soft-check (verifyCitation, renderPdfSnippet, VERIFIER_DISAGREE
//     out of scope for Phase 36). verifier_verdict is always null.
//   - NO SMOKE_IDS / SYNTHETIC_CATEGORIES / TIMEOUT_PILL sets — quarantine has
//     no smoke subset and no deferred-case taxonomy.
//   - NO beforeAll DOM-drift pre-flight — corpus is non-gating and may contain
//     non-seed patents; a seed-patent pre-flight is not meaningful here.
//   - QUAR-03: with the empty corpus (TEST_CASES_QUARANTINE = []), the loop
//     registers 0 tests; --pass-with-no-tests in the npm script exits 0.
//
// appendCase(REPORT_PATH, ...) MUST run in finally so the downstream issue
// filer (--source quarantine, Plan 36-03/36-04) has per-case detail.
//
// 2-second throttle between cases for forward-safety when entries are added
// (mitigates CAPTCHA risk on Google Patents — RESEARCH.md Pitfall D).
//
// D-01, QUAR-03.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import { TEST_CASES_QUARANTINE } from '../../test-cases-quarantine.js';
import { loadExtension } from '../lib/extension-loader.js';
import { gotoPatent } from '../lib/navigation.js';
import { selectText } from '../lib/selection.js';
import { getCitation } from '../lib/observation.js';
import { setTriggerMode } from '../lib/settings.js';
import { captureScreenshot, captureDomSnapshot } from '../lib/artifacts.js';
import { resolveRunId } from '../lib/run-id.js';
import { appendCase, reportPathFor } from '../lib/report.js';
import {
  WRONG_CITATION,
  NO_CITATION_PRODUCED,
} from '../lib/error-codes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const RUN_ID = resolveRunId();
// Phase 36 CR-01: write to a quarantine-scoped report file, NOT the shared
// report.json. The regression + fault-injection specs key report.json off the
// same PLAYWRIGHT_RUN_ID, so all three specs land in the same run dir. Sharing
// report.json would let the `--source quarantine` filer (e2e-report-issue.mjs)
// re-file every regression/fault-injection failure under the e2e-quarantine
// label. Namespacing to quarantine-report.json keeps the suites isolated; the
// quarantine filer reads this distinct file (must stay in sync with the
// QUARANTINE_REPORT_FILENAME constant in scripts/e2e-report-issue.mjs).
const QUARANTINE_REPORT_FILENAME = 'quarantine-report.json';
const REPORT_PATH = reportPathFor(RUN_ID, QUARANTINE_REPORT_FILENAME);

// 2-second throttle between cases — RESEARCH.md Pitfall D (forward-safety).
const THROTTLE_MS = 2_000;

/**
 * 'US11427642-spec-short-1' → 'US11427642'
 *
 * Quarantine ids share the US<digits>-... shape (RESEARCH Pattern 2).
 * Copied verbatim from regression.spec.js.
 *
 * @param {string} caseId
 * @returns {string}
 */
function patentIdFromCaseId(caseId) {
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  if (!m) {
    throw new Error(
      `patentIdFromCaseId: unable to parse ${caseId} — non-patent case-ids ` +
      `must be valid US<digits>-... format for the quarantine corpus`
    );
  }
  return m[1];
}

test.describe('Phase 36 quarantine corpus — non-gating', () => {
  // -----------------------------------------------------------------------
  // Per-case tests. Generate one test() per TEST_CASES_QUARANTINE entry.
  // With the empty corpus the loop registers 0 tests — QUAR-03 / SC-1 path;
  // the npm script's --pass-with-no-tests exits 0 in that case.
  // -----------------------------------------------------------------------
  for (const tc of TEST_CASES_QUARANTINE) {
    test(tc.id, async () => {
      const { context, page, cleanup } = await loadExtension({ extensionPath: EXTENSION_PATH });
      const patentId = patentIdFromCaseId(tc.id);
      const t0 = Date.now();
      let observed = null;
      let caseStatus = 'failed';
      let errorClass = null;
      const artifacts = { screenshot: null, dom: null, pdf_snippet: null };

      try {
        // 1. Override trigger mode to 'auto' BEFORE navigation
        //    (RESEARCH.md Pitfall B — content script reads sync at init).
        await setTriggerMode(context, 'auto');
        // 2. Navigate
        await gotoPatent(page, patentId);
        // 3. Selection
        await selectText({ page, uniqueSubstring: tc.selectedText });
        // 4. Read pill
        observed = await getCitation(page, { mode: 'auto' });

        // Reached here → extension produced a citation without throwing.
        // Non-gating: do NOT assert against a golden corpus (quarantine
        // entries are EXPECTED to fail; this path means the extension is
        // currently producing something — record it for triage).
        caseStatus = 'passed';
      } catch (e) {
        // Test failed — extension threw or getCitation timed out.
        caseStatus = 'failed';
        // Classify into the RPT-02 taxonomy based on what we have:
        if (observed && observed.citation) {
          errorClass = WRONG_CITATION;
        } else {
          errorClass = NO_CITATION_PRODUCED;
        }
        // Diagnostics — capture screenshot + DOM snapshot for triage.
        try {
          artifacts.screenshot = await captureScreenshot(
            page,
            RUN_ID,
            tc.id
          );
        } catch {}
        try {
          artifacts.dom = await captureDomSnapshot(page, RUN_ID, tc.id);
        } catch {}
        throw e;
      } finally {
        // ALWAYS append a CaseEntry to report.json (passed OR failed) so
        // the downstream issue filer (--source quarantine) has per-case detail.
        try {
          appendCase(REPORT_PATH, {
            id: tc.id,
            status: caseStatus,
            errorClass,
            citation: observed ? observed.citation : null,
            verifier_verdict: null,
            artifacts,
            duration_ms: Date.now() - t0,
          });
        } catch (reportErr) {
          // eslint-disable-next-line no-console
          console.error(
            `appendCase failed for ${tc.id}: ${reportErr.message}`
          );
        }
        await cleanup();
        // Throttle to reduce CAPTCHA risk on Google Patents
        // (RESEARCH.md Pitfall D). Forward-safety for when entries are added.
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    });
  }

  // Finalize report.json: ensure the final timestamp lands AFTER all per-case
  // writes (no-op if 0 tests ran — the report will not exist yet and the
  // try/catch handles that gracefully).
  test.afterAll(async () => {
    const fs = await import('node:fs');
    try {
      const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
      report.ended = new Date().toISOString();
      fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    } catch {
      // No report present (0 tests ran) — nothing to finalize.
    }
  });
});

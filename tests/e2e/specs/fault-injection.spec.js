// tests/e2e/specs/fault-injection.spec.js
//
// Phase 30 Plan 02 — INJ-02 fault-injection E2E spec.
//
// Aborts the Google Patents PDF asset fetch and asserts the extension's
// USPTO/Cloudflare Worker fallback path produces an accurate citation.
//
// Two-gate pass criteria:
//   1. observed.citation === baseline['US11427642-spec-short-1'].citation ('1:26-27')
//   2. verifyCitation(...) returns status: 'pass' (Tier A/B/C)
//
// Two-canary safety net (30-RESEARCH.md Risk A1):
//   Playwright's page.route operates at the CDP level for the page's
//   browsing context. Chrome extension offscreen documents run in
//   isolated contexts that MAY OR MAY NOT be reached by page.route. If
//   either route handler never fires, the test silently passes for the
//   wrong reason. The canary assertions below fail FAST with a clear
//   diagnosis instead of leaving the test green-but-meaningless.
//
// retries: 0 — not FLAKE-eligible (30-CONTEXT.md locked decision).
// A flaky Worker fallback is a real defect.

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
import { verifyCitation } from '../lib/pdf-verifier.js';
import { appendCase, reportPathFor } from '../lib/report.js';
import { installWorkerTestModeRoute } from '../lib/worker-test-mode-route.js';

// WORKER_FALLBACK_FAILED is added to error-codes.js by Plan 30-03.
// Local fallback keeps this spec loadable if 30-03 hasn't landed yet.
import * as errorCodes from '../lib/error-codes.js';
const WORKER_FALLBACK_FAILED =
  errorCodes.WORKER_FALLBACK_FAILED ?? 'WORKER_FALLBACK_FAILED';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../../dist/chrome');
const RUN_ID = resolveRunId();
const REPORT_PATH = reportPathFor(RUN_ID);

const CASE_ID = 'US11427642-spec-short-1';
const PATENT_ID = 'US11427642';
const SELECTED_TEXT =
  'receptor exclusively expressed on plasma cells and plasmablasts. ' +
  'BCMA is a receptor for two ligands in the';
test.describe('Phase 30 fault-injection — Worker/USPTO fallback path', () => {
  // retries:0 overrides playwright.config.js retries:1 in CI — locked
  // decision per 30-CONTEXT.md (not FLAKE-eligible).
  test.describe.configure({ retries: 0 });

  test(`${CASE_ID} @fault-injection`, async () => {
    const { context, page, cleanup } = await loadExtension({
      extensionPath: EXTENSION_PATH,
    });

    let abortCount = 0;
    let observed = null;
    let verifierVerdict = null;
    let caseStatus = 'failed';
    let errorClass = null;
    const artifacts = { screenshot: null, dom: null, pdf_snippet: null };
    const t0 = Date.now();

    try {
      // 1. Abort Google PDF asset — forces extension through USPTO fallback.
      //    Canary: increment abortCount on every interception so we can
      //    assert the route actually fired (30-RESEARCH.md Risk A1).
      await page.route('https://patentimages.storage.googleapis.com/**', async (route) => {
        abortCount += 1;
        await route.abort();
      });

      // 2. Inject X-PCT-Test-Mode: true on all Worker calls so KV stays
      //    clean (Plan 30-01's guard wraps the put() in the Worker).
      //    Uses context.route (BrowserContext level) to reach the extension's
      //    offscreen document context — resolves Risk A1 (Plan 30-02 canary).
      //    Helper is synchronous; returns { getCallCount } for the second canary.
      const workerRoute = installWorkerTestModeRoute(context);

      // 3. Trigger-mode override BEFORE navigation (regression.spec.js Pitfall B).
      await setTriggerMode(context, 'auto');

      // 4. Navigate and run the selection.
      await gotoPatent(page, PATENT_ID);
      await selectText({ page, uniqueSubstring: SELECTED_TEXT });

      // 5. Read citation pill (extension produces it via the fallback path).
      observed = await getCitation(page, { mode: 'auto' });

      // 6. Run independent verifier (VFY-01 oracle).
      try {
        verifierVerdict = await verifyCitation({
          patentId: PATENT_ID,
          selectedText: SELECTED_TEXT,
          observedCitation: observed.citation,
        });
      } catch (verifyErr) {
        verifierVerdict = {
          status: 'disagree',
          tier_used: 'D',
          reason: `VERIFIER_INFRA_FAIL: ${verifyErr.message}`,
          cited_text_window: '',
          match_offset_lines: null,
        };
      }

      // 7. CANARY ASSERTIONS — run BEFORE pass-gates so a routing failure
      //    points at Risk A1, not a citation mismatch. (See Pitfall 5.)
      //
      //    DO NOT remove these canaries to "fix" a failing test. If either
      //    canary fires zero, that means the route handler did not reach the
      //    extension's offscreen document context — escalate per 30-RESEARCH.md
      //    Risk A1 (Plan 30-04 switched to context.route to address this).
      expect(
        abortCount,
        'page.route did not intercept https://patentimages.storage.googleapis.com/** — ' +
          'fault-injection never fired. Likely cause: Playwright CDP routing does not reach ' +
          'the extension offscreen document context. See 30-RESEARCH.md Risk A1.',
      ).toBeGreaterThan(0);

      expect(
        workerRoute.getCallCount(),
        'context.route did not intercept https://pct.tonyrowles.com/** — Worker fallback was ' +
          'not exercised OR cache-bypass nonce did not reach the extension offscreen context. ' +
          'See 30-RESEARCH.md Risk A1 + Plan 30-04.',
      ).toBeGreaterThan(0);

      // Log canary counts for SUMMARY.md evidence.
      // eslint-disable-next-line no-console
      console.log(
        `[fault-injection canaries] abortCount=${abortCount} workerRouteCallCount=${workerRoute.getCallCount()}`,
      );

      // 8. PASS GATES — both required per 30-CONTEXT.md.
      expect(observed.citation).toBe(baseline[CASE_ID].citation); // '1:26-27'
      expect(verifierVerdict.status).toBe('pass');

      caseStatus = 'passed';
    } catch (e) {
      caseStatus = 'failed';
      errorClass = WORKER_FALLBACK_FAILED;
      try {
        artifacts.screenshot = await captureScreenshot(page, RUN_ID, CASE_ID);
      } catch {}
      try {
        artifacts.dom = await captureDomSnapshot(page, RUN_ID, CASE_ID);
      } catch {}
      throw e;
    } finally {
      try {
        appendCase(REPORT_PATH, {
          id: CASE_ID,
          status: caseStatus,
          errorClass,
          citation: observed ? observed.citation : null,
          verifier_verdict: verifierVerdict,
          artifacts,
          duration_ms: Date.now() - t0,
        });
      } catch (reportErr) {
        // eslint-disable-next-line no-console
        console.error(`appendCase failed for ${CASE_ID}: ${reportErr.message}`);
      }
      await cleanup();
    }
  });
});

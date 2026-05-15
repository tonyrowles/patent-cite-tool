#!/usr/bin/env node
/**
 * capture-observed-citations.mjs
 *
 * Phase 27 Plan 06 — one-shot recorder that drives the LIVE extension against
 * a HARDCODED allowlist of 22 case-ids (gap_inventory Bucket A: WRONG_CITATION
 * cases where baseline.json drifted off the current extension output by 1-2
 * lines). For each case-id, the script:
 *
 *   1. Spins up a fresh persistent context with the unpacked extension via
 *      tests/e2e/lib/extension-loader.js (same primitive the regression spec
 *      uses) so the captured output exactly mirrors regression.spec.js.
 *   2. Switches trigger mode to 'auto' (chrome.storage.sync) before navigating.
 *   3. Navigates to https://patents.google.com/patent/{patentId}/en and waits
 *      for the description + claims containers to populate.
 *   4. Calls selectText with the test-case's selectedText needle — the same
 *      TreeWalker + dispatched-mouseup + 280ms re-apply loop the regression
 *      spec uses.
 *   5. Calls getCitation({mode: 'auto', timeout: 10_000}) and records the
 *      observed citation + confidence COLOR.
 *   6. Cleans up the context, sleeps THROTTLE_MS (2s), and moves to the next
 *      case-id.
 *
 * After all 22 cases complete, the script emits to stdout:
 *   - // PATCH (apply via Task 2):       — JSON map {caseId: {citation, confidence}}
 *   - // ERRORS:                          — JSON list of failures (caseId + error)
 *   - // AUDIT TRAIL:                     — per-case OLD → NEW mapping, suitable
 *                                            for the commit message body
 *
 * Confidence color → numeric conversion (preserves regression-spec semantics
 * via colorFromNumericConfidence in regression.spec.js):
 *   green  → 0.98   (representative of >= 0.95 bucket)
 *   yellow → 0.90   (representative of [0.80, 0.95))
 *   red    → 0.70   (representative of < 0.80)
 *
 * SAFETY (T-27-G01):
 *   - The 22 case-ids are HARDCODED at the top of this file. The size assert
 *     `TARGET_CASE_IDS.size === 22` aborts the script if the list is edited
 *     without updating the counter.
 *   - The script writes the patch to STDOUT ONLY. Task 2 applies it to
 *     baseline.json after validation.
 *   - The CASE_IDS_OVERRIDE env var permits a re-run of a subset (e.g. for
 *     failed cases) but cannot expand beyond TARGET_CASE_IDS.
 *
 * USAGE:
 *   npm run build:chrome      # ensure dist/chrome/ is current
 *   node scripts/capture-observed-citations.mjs > /tmp/baseline-recapture.txt
 *
 *   # Re-run a subset only (cases that errored on first pass):
 *   CASE_IDS_OVERRIDE=US4317036-claims,US5440748-spec-long \
 *     node scripts/capture-observed-citations.mjs >> /tmp/baseline-recapture.txt
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TEST_CASES } from '../tests/test-cases.js';
import baseline from '../tests/golden/baseline.json' with { type: 'json' };
import { loadExtension } from '../tests/e2e/lib/extension-loader.js';
import { gotoPatent } from '../tests/e2e/lib/navigation.js';
import { selectText } from '../tests/e2e/lib/selection.js';
import { getCitation } from '../tests/e2e/lib/observation.js';
import { setTriggerMode } from '../tests/e2e/lib/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../dist/chrome');

// 2-second throttle between cases — matches regression.spec.js THROTTLE_MS
// (RESEARCH.md Pitfall D — Google Patents CAPTCHA risk).
const THROTTLE_MS = 2_000;

// Per-case observation timeout. regression.spec.js default is 30s; we use 10s
// here because the capture script is exploratory — if the extension can't
// produce a citation in 10s the case will be flagged in the ERRORS section
// for follow-up. Real assertion runs continue to use 30s.
const OBSERVATION_TIMEOUT_MS = 10_000;

// Confidence color → numeric. Matches the midpoint of each bucket per the
// regression spec's colorFromNumericConfidence thresholds:
//   green:  >= 0.95          → 0.98
//   yellow: [0.80, 0.95)     → 0.90
//   red:    < 0.80           → 0.70
const COLOR_TO_NUMERIC = Object.freeze({
  green: 0.98,
  yellow: 0.90,
  red: 0.70,
});

// =============================================================================
// HARDCODED ALLOWLIST (T-27-G01). DO NOT EDIT WITHOUT UPDATING THE 22 ASSERT.
// Source: 27-05-SUMMARY.md WRONG_CITATION cluster (gap_inventory Bucket A).
// =============================================================================
const TARGET_CASE_IDS = new Set([
  'US4317036-claims',
  'US4317036-spec-long',
  'US4317036-spec-short',
  'US4723129-cross-col',
  'US4723129-spec-long',
  'US4723129-spec-short',
  'US5371234-spec-short',
  'US5440748-cross-col',
  'US5440748-spec-long',
  'US5440748-spec-short',
  'US6324676-claims',
  'US6324676-cross-col',
  'US6324676-spec-long',
  'US6324676-spec-short',
  'US6738932-cross-col',
  'US6738932-spec-long',
  'US6738932-spec-short',
  'US7346586-cross-col',
  'US7509250-cross-col',
  'US7509250-spec-long',
  'US8352400-cross-col',
  'US8352400-spec-short',
]);

if (TARGET_CASE_IDS.size !== 22) {
  throw new Error(
    `TARGET_CASE_IDS size assert failed: expected 22, got ${TARGET_CASE_IDS.size}`,
  );
}

// Optional re-run subset via env var. Cannot expand beyond TARGET_CASE_IDS.
const OVERRIDE = process.env.CASE_IDS_OVERRIDE
  ? new Set(process.env.CASE_IDS_OVERRIDE.split(',').map((s) => s.trim()))
  : TARGET_CASE_IDS;
for (const id of OVERRIDE) {
  if (!TARGET_CASE_IDS.has(id)) {
    throw new Error(
      `CASE_IDS_OVERRIDE contains "${id}" which is not in TARGET_CASE_IDS (allowlist).`,
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * 'US4317036-claims' → 'US4317036'.
 * Matches regression.spec.js patentIdFromCaseId. All 22 targets are US patents.
 */
function patentIdFromCaseId(caseId) {
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  if (!m) throw new Error(`patentIdFromCaseId: unable to parse "${caseId}"`);
  return m[1];
}

function log(...args) {
  // All progress logs go to STDERR so STDOUT stays parseable JSON-ish.
  process.stderr.write(args.join(' ') + '\n');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  // Pre-flight: dist/chrome must exist + carry a manifest.
  if (!fs.existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(
      `Extension build not found at ${EXTENSION_PATH}/manifest.json — run \`npm run build:chrome\` first.`,
    );
  }

  // Build a caseId -> TEST_CASES entry lookup once.
  const TC_BY_ID = new Map();
  for (const tc of TEST_CASES) TC_BY_ID.set(tc.id, tc);

  // Validate every target id exists in TEST_CASES.
  for (const id of OVERRIDE) {
    if (!TC_BY_ID.has(id)) {
      throw new Error(`target caseId "${id}" not present in TEST_CASES`);
    }
  }

  // Iterate TEST_CASES order so we naturally cluster by patent (loadExtension
  // is unique-tmpdir-per-case but Google Patents may serve the same patent
  // back-to-back faster from its edge cache).
  const results = []; // { caseId, citation, confidence_color }
  const errors = [];  // { caseId, error, code }

  let n = 0;
  for (const tc of TEST_CASES) {
    if (!OVERRIDE.has(tc.id)) continue;
    n++;
    const patentId = patentIdFromCaseId(tc.id);
    log(`[${n}/${OVERRIDE.size}] ${tc.id} (${patentId}) — starting`);

    let cleanup = null;
    try {
      const ext = await loadExtension({ extensionPath: EXTENSION_PATH });
      cleanup = ext.cleanup;
      await setTriggerMode(ext.context, 'auto');
      await gotoPatent(ext.page, patentId);
      await selectText({ page: ext.page, uniqueSubstring: tc.selectedText });
      const observed = await getCitation(ext.page, {
        mode: 'auto',
        timeout: OBSERVATION_TIMEOUT_MS,
      });
      if (!observed.citation) {
        throw Object.assign(new Error('empty citation from pill'), {
          code: 'NO_CITATION_PRODUCED',
        });
      }
      results.push({
        caseId: tc.id,
        citation: observed.citation,
        confidence_color: observed.confidence,
      });
      log(
        `[${n}/${OVERRIDE.size}] ${tc.id} → "${observed.citation}" (${observed.confidence})`,
      );
    } catch (e) {
      errors.push({
        caseId: tc.id,
        error: e && e.message ? e.message : String(e),
        code: (e && e.code) || 'UNKNOWN',
      });
      log(`[${n}/${OVERRIDE.size}] ${tc.id} FAILED: ${e?.message || e}`);
    } finally {
      if (cleanup) {
        try { await cleanup(); } catch (_) { /* swallow */ }
      }
      // Throttle between cases — mirrors regression.spec.js.
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  // ---------------------------------------------------------------------------
  // Build the patch object. Each entry: {citation, confidence: numeric}.
  // ---------------------------------------------------------------------------
  const patch = {};
  for (const r of results) {
    const numeric = COLOR_TO_NUMERIC[r.confidence_color];
    if (typeof numeric !== 'number') {
      // Shouldn't happen — getCitation only returns the three colors — but
      // guard anyway so Task 2's validator catches anything unexpected.
      errors.push({
        caseId: r.caseId,
        error: `unknown confidence color "${r.confidence_color}" — cannot map to numeric`,
        code: 'BAD_CONFIDENCE_COLOR',
      });
      continue;
    }
    patch[r.caseId] = {
      citation: r.citation,
      confidence: numeric,
    };
  }

  // ---------------------------------------------------------------------------
  // Build audit trail: per-case OLD → NEW. Pull OLD from baseline.json.
  // ---------------------------------------------------------------------------
  const auditLines = [];
  for (const caseId of [...OVERRIDE].sort()) {
    const oldEntry = baseline[caseId];
    const newEntry = patch[caseId];
    const oldStr = oldEntry
      ? `${oldEntry.citation},${oldEntry.confidence}`
      : '(absent)';
    const newStr = newEntry
      ? `${newEntry.citation},${newEntry.confidence}`
      : '(not captured)';
    auditLines.push(`${caseId}: OLD ${oldStr} → NEW ${newStr}`);
  }

  // ---------------------------------------------------------------------------
  // Emit STDOUT contract (Task 2 reads this).
  // ---------------------------------------------------------------------------
  process.stdout.write('// PATCH (apply via Task 2):\n');
  process.stdout.write(JSON.stringify(patch, null, 2));
  process.stdout.write('\n');
  process.stdout.write('// ERRORS:\n');
  process.stdout.write(JSON.stringify(errors, null, 2));
  process.stdout.write('\n');
  process.stdout.write('// AUDIT TRAIL:\n');
  for (const line of auditLines) {
    process.stdout.write(line + '\n');
  }

  // Final progress summary to STDERR.
  log(
    `\nDone. Captured ${results.length}/${OVERRIDE.size} cases. ` +
      `Errors: ${errors.length}.`,
  );
}

// Run main() only when invoked directly (so `node -e "import(...)"` can
// dry-import without launching Playwright). `process.argv[1]` is undefined
// when Node is invoked via `-e`, so we require an actual script path.
const argv1 = process.argv[1];
const isDirectInvocation =
  !!argv1 &&
  (import.meta.url === `file://${argv1}` ||
    import.meta.url.endsWith('/' + path.basename(argv1)));

if (isDirectInvocation) {
  main().catch((e) => {
    process.stderr.write(`FATAL: ${e && e.stack ? e.stack : e}\n`);
    process.exit(1);
  });
}

#!/usr/bin/env node
// scripts/verify-calibrate.mjs
//
// Phase 28 Plan 28-05 — Verifier calibration gate (VFY-03).
//
// Runs the independent PDF verifier (tests/e2e/lib/pdf-verifier.js) against
// the 65 currently-passing live regression cases (76 total minus the 1
// synthetic and the 10 Phase 27 TIMEOUT_PILL deferrals) and reports per-tier
// pass/fail counts plus an overall Tier A/B/C pass rate.
//
// Gate: ≥95% Tier A/B/C (RESEARCH.md Pitfall 2; CONTEXT.md locked).
// Exit 0 if gate met; exit 1 otherwise (with Tier D failures listed).
//
// Why a standalone script vs a unit test: this is a slow end-to-end run
// (cold-cache: 65 PDFs × ~3-5s = ~3-5 min; warm-cache: a few seconds total).
// Treating it as a unit test would either bloat `npm run test:src` or be
// silently skipped. As a script, it can be invoked deliberately by the
// planner before promoting the verifier to oracle status.
//
// Throttle: 2 seconds between cases (RESEARCH.md Pitfall 5 / Phase 27
// precedent) to avoid Google Patents anti-abuse on the cold-cache run.
// Warm-cache runs skip the HTTP fetch entirely so the throttle is mostly
// inert.

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TEST_CASES } from '../tests/test-cases.js';
import baseline from '../tests/golden/baseline.json' with { type: 'json' };
import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = path.resolve(__dirname, '../tests/e2e/artifacts');

// Duplicated from tests/e2e/specs/regression.spec.js L98-L113. The spec file
// is a Playwright spec — we cannot import it cleanly from a plain node
// script without dragging in @playwright/test. Single source of truth lives
// in the spec; this duplication is documented in 28-05-SUMMARY.md.
// KEEP IN SYNC.
const TIMEOUT_PILL_DEFERRED_IDS = new Set([
  'US11427642-claims-1',
  'US11427642-repetitive',
  'US4723129-claims',
  'US5371234-chemical-cross-col',
  'US5371234-claims',
  'US7346586-claims-repetitive',
  'US8352400-claims',
  'US5440748-claims',
  'US5440748-repetitive',
  'US4723129-claims-repetitive',
]);

const SYNTHETIC_CATEGORIES = new Set(['gutter']);
const THROTTLE_MS = 2_000;
const GATE_PERCENT = 95;

function patentIdFromCaseId(caseId) {
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  if (!m) throw new Error(`Cannot derive patentId from ${caseId}`);
  return m[1];
}

function pct(n, total) {
  if (total === 0) return '0.0';
  return ((n / total) * 100).toFixed(1);
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace('Z', 'Z');
}

async function main() {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');

  const live = TEST_CASES.filter(
    (tc) =>
      !SYNTHETIC_CATEGORIES.has(tc.category) &&
      !TIMEOUT_PILL_DEFERRED_IDS.has(tc.id) &&
      baseline[tc.id]
  );

  console.error(
    `Calibrating verifier against ${live.length} live cases (skipping ` +
      `${TEST_CASES.length - live.length} synthetic/deferred/no-baseline)...`
  );

  const t0 = performance.now();
  const tierCounts = { A: 0, B: 0, C: 0, D: 0 };
  const failures = [];
  const perCase = [];

  for (let i = 0; i < live.length; i++) {
    const tc = live[i];
    const expected = baseline[tc.id].citation;
    const patentId = patentIdFromCaseId(tc.id);
    let verdict;
    try {
      verdict = await verifyCitation({
        patentId,
        selectedText: tc.selectedText,
        observedCitation: expected,
      });
      tierCounts[verdict.tier_used]++;
      if (verdict.tier_used === 'D') {
        failures.push({
          id: tc.id,
          citation: expected,
          reason: verdict.reason,
        });
      }
      console.error(
        `  [${verdict.tier_used}] (${i + 1}/${live.length}) ${tc.id} → ${verdict.status}`
      );
    } catch (e) {
      verdict = {
        status: 'disagree',
        tier_used: 'D',
        reason: `EXCEPTION: ${e.message}`,
        cited_text_window: '',
        match_offset_lines: null,
      };
      tierCounts.D++;
      failures.push({
        id: tc.id,
        citation: expected,
        reason: verdict.reason,
      });
      console.error(`  [E] (${i + 1}/${live.length}) ${tc.id} → ${e.message}`);
    }
    perCase.push({
      id: tc.id,
      citation: expected,
      tier_used: verdict.tier_used,
      status: verdict.status,
      reason: verdict.reason,
      match_offset_lines: verdict.match_offset_lines ?? null,
    });
    // Throttle (Pitfall 5): cheap on warm cache, mitigates rate-limit cold.
    if (i < live.length - 1) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  const total = live.length;
  const abc = tierCounts.A + tierCounts.B + tierCounts.C;
  const passPct = (abc / total) * 100;
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);

  console.log('\n=== Verifier Calibration Report ===');
  console.log(`Total cases:        ${total}`);
  console.log(`Tier A (exact):     ${tierCounts.A} (${pct(tierCounts.A, total)}%)`);
  console.log(`Tier B (wsnorm):    ${tierCounts.B} (${pct(tierCounts.B, total)}%)`);
  console.log(`Tier C (±2 line):   ${tierCounts.C} (${pct(tierCounts.C, total)}%)`);
  console.log(`Tier D (FAIL):      ${tierCounts.D} (${pct(tierCounts.D, total)}%)`);
  console.log('-'.repeat(40));
  console.log(`Pass rate (A+B+C):  ${abc}/${total} = ${passPct.toFixed(1)}%`);
  console.log(`Gate:               ≥${GATE_PERCENT}%`);
  console.log(`Elapsed:            ${elapsed}s`);

  if (failures.length) {
    console.log('\nTier D failures:');
    for (const f of failures) {
      console.log(`  - ${f.id} (${f.citation}): ${f.reason}`);
    }
  }

  if (wantJson) {
    const outDir = path.join(ARTIFACTS_ROOT, `calibrate-${timestamp()}`);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'calibration.json');
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          total,
          tierCounts,
          passPct,
          gatePct: GATE_PERCENT,
          gateMet: passPct >= GATE_PERCENT,
          elapsedSeconds: parseFloat(elapsed),
          failures,
          cases: perCase,
        },
        null,
        2
      )
    );
    console.log(`\nJSON report written: ${outPath}`);
  }

  if (passPct < GATE_PERCENT) {
    console.error(
      `\nFAIL: pass rate ${passPct.toFixed(1)}% < ${GATE_PERCENT}% gate`
    );
    process.exit(1);
  }
  console.log('\nPASS: calibration gate met.');
}

main().catch((e) => {
  console.error('Calibration script crashed:', e);
  process.exit(2);
});

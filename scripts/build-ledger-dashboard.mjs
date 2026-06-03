// scripts/build-ledger-dashboard.mjs
//
// Phase 46 Plan 02 (AUTOFIX-06) — deterministic markdown dashboard generator
// for tests/e2e/.llm-spend-ledger.json.
//
// Reads the committed ledger; emits docs/v40-ledger-dashboard.md (or any
// --output path) with three tables:
//
//   - By Transport (current month) — sdk / subscription split + share
//   - By Day (current month, UTC)  — invocations + spend per UTC day, ASC
//   - By Phase (cross-month)       — DESC spend, per-phase cap status
//
// Determinism requirements (RESEARCH Pattern 5 — load-bearing for daily
// [skip ci] commits to stay no-op when the ledger is unchanged):
//   1. Output is byte-stable for an unchanged ledger.
//   2. `Generated:` field is derived from the ledger's MAX `iso` (current
//      month preferred; falls back to global max; "(no ledger entries)" when
//      empty). NEVER uses the wall clock — Pitfall 2 would cause noisy
//      timestamp-only commits.
//   3. Numeric formatting is fixed-precision: `$N.NN` for USD, `N.N%` for
//      shares.
//   4. Row ordering is total ordered (by ISO day ASC; by spend DESC then
//      phase ASC for ties).
//   5. Single trailing newline (POSIX convention).
//   6. The script is READ-ONLY against the ledger — it MUST NOT import the
//      ledger writer function from tests/e2e/lib/llm-ledger.js. Tests/unit/
//      build-ledger-dashboard.test.js case 10 statically greps this file
//      for the forbidden token; the test fails if the import sneaks in.
//
// Atomic write: writeAtomic() mirrors tests/e2e/lib/llm-ledger.js:723-737 —
// temp+rename with EXDEV fallback. Prevents partial files from landing at
// the destination on crash.
//
// CLI:
//   node scripts/build-ledger-dashboard.mjs --output docs/v40-ledger-dashboard.md
//   node scripts/build-ledger-dashboard.mjs --help

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  readLedger,
  currentMonth,
  dayTotal,
  phaseTotal,
  combinedMonthlyTotalByTransport,
  HARD_CAP_USD,
  WARN_THRESHOLD_USD,
  PHASE_HARD_CAP_USD,
  PHASE_WARN_THRESHOLD_USD,
  LEDGER_PATH,
} from '../tests/e2e/lib/llm-ledger.js';
// NOTE: monthlyTotal / currentIsoDay are intentionally NOT imported — the
// dashboard derives totals via combinedMonthlyTotalByTransport.combined and
// derives day labels from iso prefixes (deterministic regardless of wall
// clock).

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatUsd(n) {
  return '$' + Number(n).toFixed(2);
}

function formatPct(n) {
  return Number(n).toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

/**
 * Collect the MAX iso string from a list of entries. Returns null if none.
 */
function maxIso(entries) {
  let max = null;
  for (const e of entries) {
    if (e && typeof e.iso === 'string') {
      if (max === null || e.iso > max) max = e.iso;
    }
  }
  return max;
}

/**
 * Collect ALL iterations across every month bucket (single flat array). Used
 * for the by-phase table and the Generated-fallback ladder.
 */
function allIterations(ledger) {
  const out = [];
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return out;
  for (const bucket of Object.values(months)) {
    const its = bucket?.iterations;
    if (Array.isArray(its)) {
      for (const it of its) out.push(it);
    }
  }
  return out;
}

/**
 * Pure builder — returns the complete markdown string for the dashboard.
 * Takes a ledger object (the parsed JSON) and an optional `month` override
 * (default: currentMonth()). All wall-clock dependencies live in the caller;
 * once `month` is fixed, the output is a pure function of the ledger.
 *
 * @param {object} ledger
 * @param {{ month?: string }} [opts]
 * @returns {string} markdown
 */
export function buildDashboardMarkdown(ledger, { month = currentMonth() } = {}) {
  const lines = [];

  // --- Header ---
  lines.push('# v4.0 LLM Spend Ledger Dashboard');
  lines.push('');

  // Generated line — current-month MAX iso, else global MAX iso, else fallback.
  const monthBucket = ledger?.months?.[month];
  const monthIts = Array.isArray(monthBucket?.iterations) ? monthBucket.iterations : [];
  let generated = maxIso(monthIts);
  if (!generated) {
    generated = maxIso(allIterations(ledger));
  }
  lines.push(
    '**Generated:** ' + (generated === null ? '(no ledger entries)' : generated),
  );
  lines.push('**Source:** tests/e2e/.llm-spend-ledger.json');

  // --- Month header (total + caps + status) ---
  const breakdown = combinedMonthlyTotalByTransport(ledger, month);
  const monthTotal = breakdown.combined;
  let status = 'ok';
  if (monthTotal >= HARD_CAP_USD) status = 'block';
  else if (monthTotal >= WARN_THRESHOLD_USD) status = 'warn';
  lines.push(
    '**Month:** ' + month +
    '  |  **Total:** ' + formatUsd(monthTotal) +
    '  |  **Warn @ ' + formatUsd(WARN_THRESHOLD_USD) + '**' +
    '  |  **Hard cap @ ' + formatUsd(HARD_CAP_USD) + '**' +
    '  |  Status: ' + status,
  );
  lines.push('');

  // --- By Transport (current month) ---
  lines.push('## By Transport (current month)');
  lines.push('');
  lines.push('| Transport | Spend (USD) | Share |');
  lines.push('| --------- | ----------- | ----- |');
  const sdk = breakdown.by_transport.sdk;
  const sub = breakdown.by_transport.subscription;
  // (Unknown bucket exists but is normally zero; intentionally hidden from
  // the markdown UI to keep the table at three rows. The privacy audit + the
  // unit tests cover anomaly detection.)
  const txTotal = +(sdk + sub).toFixed(6);
  const shareSdk = txTotal > 0 ? (sdk / txTotal) * 100 : 0;
  const shareSub = txTotal > 0 ? (sub / txTotal) * 100 : 0;
  lines.push('| sdk | ' + formatUsd(sdk) + ' | ' + formatPct(shareSdk) + ' |');
  lines.push('| subscription | ' + formatUsd(sub) + ' | ' + formatPct(shareSub) + ' |');
  lines.push('| **Total** | **' + formatUsd(txTotal) + '** | **' + formatPct(txTotal > 0 ? 100 : 0) + '** |');
  lines.push('');

  // --- By Day (current month, UTC) ---
  lines.push('## By Day (current month, UTC)');
  lines.push('');
  lines.push('| Day | Invocations | Spend (USD) |');
  lines.push('| --- | ----------- | ----------- |');
  // Group current-month entries by iso-day.
  const dayCounts = new Map(); // isoDay -> count
  for (const it of monthIts) {
    if (it && typeof it.iso === 'string') {
      const d = it.iso.slice(0, 10);
      dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
    }
  }
  const days = Array.from(dayCounts.keys()).sort(); // ASC
  for (const d of days) {
    const spend = dayTotal(ledger, d);
    lines.push('| ' + d + ' | ' + dayCounts.get(d) + ' | ' + formatUsd(spend) + ' |');
  }
  if (days.length === 0) {
    lines.push('| (no entries this month) | 0 | ' + formatUsd(0) + ' |');
  }
  lines.push('');

  // --- By Phase (cross-month) ---
  lines.push('## By Phase (cross-month)');
  lines.push('');
  lines.push('| Phase | Spend (USD) | Per-Phase Cap | Status |');
  lines.push('| ----- | ----------- | ------------- | ------ |');
  // Collect unique phase values across ALL months.
  const phases = new Set();
  for (const it of allIterations(ledger)) {
    if (it && typeof it.phase === 'string' && it.phase.length > 0) {
      phases.add(it.phase);
    }
  }
  const phaseRows = Array.from(phases).map((p) => ({
    phase: p,
    spend: phaseTotal(ledger, p),
  }));
  // DESC by spend; ties broken ASC by phase name.
  phaseRows.sort((a, b) => {
    if (b.spend !== a.spend) return b.spend - a.spend;
    return a.phase < b.phase ? -1 : a.phase > b.phase ? 1 : 0;
  });
  for (const row of phaseRows) {
    let s = 'ok';
    if (row.spend >= PHASE_HARD_CAP_USD) s = 'block';
    else if (row.spend >= PHASE_WARN_THRESHOLD_USD) s = 'warn (>=$8)';
    lines.push(
      '| ' + row.phase + ' | ' + formatUsd(row.spend) +
      ' | ' + formatUsd(PHASE_HARD_CAP_USD) + ' | ' + s + ' |',
    );
  }
  if (phaseRows.length === 0) {
    lines.push('| (no phases recorded) | ' + formatUsd(0) + ' | ' + formatUsd(PHASE_HARD_CAP_USD) + ' | ok |');
  }

  // Single trailing newline.
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Atomic writer (temp+rename, EXDEV fallback)
// ---------------------------------------------------------------------------

/**
 * Write `content` to `outPath` via the temp+rename pattern. On EXDEV, fall
 * back to a direct write (cross-filesystem case — the partial-file window
 * returns but the alternative is a hard throw).
 *
 * Mirrors tests/e2e/lib/llm-ledger.js:723-737 verbatim modulo the content
 * being a markdown string rather than a JSON-serialized ledger.
 */
export function writeAtomic(outPath, content) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = outPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, outPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      fs.writeFileSync(outPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CLI shim
// ---------------------------------------------------------------------------

const USAGE = `Usage: node scripts/build-ledger-dashboard.mjs [--output <path>] [--help]

Generates docs/v40-ledger-dashboard.md (or the path specified via --output)
from the committed tests/e2e/.llm-spend-ledger.json.

Options:
  --output <path>   Output markdown path (default: docs/v40-ledger-dashboard.md)
  --help            Print this message and exit 0

This script is read-only against the ledger. Phase 46 Plan 02 (AUTOFIX-06).`;

const invokedAsCli = (
  // Resolve realpath for both sides so a symlinked entry (npm bin shim) still matches.
  import.meta.url === 'file://' + process.argv[1] ||
  import.meta.url === 'file://' + fs.realpathSync(process.argv[1] || '/')
);
if (invokedAsCli) {
  const { values } = parseArgs({
    options: {
      output: { type: 'string', default: 'docs/v40-ledger-dashboard.md' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(USAGE + '\n');
    process.exit(0);
  }
  const ledger = readLedger(LEDGER_PATH);
  const md = buildDashboardMarkdown(ledger);
  const outPath = path.resolve(values.output);
  writeAtomic(outPath, md);
  process.stdout.write('[build-ledger-dashboard] wrote ' + outPath + '\n');
}

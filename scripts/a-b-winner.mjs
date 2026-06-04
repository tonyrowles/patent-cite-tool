#!/usr/bin/env node
// scripts/a-b-winner.mjs
//
// Phase 54 Plan 01 (AB-04) — operator-triggered A/B winner-declaration CLI.
//
// PURPOSE
// -------
// Reads the LLM spend ledger (default: tests/e2e/.llm-spend-ledger.json),
// groups entries per ERROR_CLASS per model arm (sonnet vs opus), and
// computes whether either arm has a winning pass-rate advantage for any
// ERROR_CLASS — but ONLY once each arm of each class has accumulated at
// least N_PER_ARM_REQUIRED samples.
//
// LOCKED DESIGN PARAMETERS
// ------------------------
//   - N_PER_ARM_REQUIRED = 20   (D-16 operator decision — single source of
//                                tuning at the top of this file)
//   - Winner threshold:  pass-rate delta < 0.05 → 'tie';
//                        otherwise the higher-rate arm wins (D-18)
//   - Output:  `NO_WINNER_YET\n` (trailing newline, stdout, exit 0) when
//              sample threshold unmet (D-17);  markdown table otherwise (D-18).
//   - Imports: node:fs ONLY — pure CLI script (D-21).
//   - Default ledger: tests/e2e/.llm-spend-ledger.json (D-15).
//
// ABSTENTION MODE (D-20 — current Phase 54 behavior)
// ---------------------------------------------------
// The committed ledger schema (verified at plan time — see ledger sample in
// 54-01-PLAN.md <interfaces>) currently includes:
//   { iso, model, cost_usd, tokens_in, tokens_out, phase, transport, source }
//
// It does NOT include:
//   - `errorClass` field   (would be needed to group entries per class)
//   - any outcome field    (would be needed to compute pass-rates)
//
// Both fields are required for actionable winner-declaration. Until a future
// phase (Phase 56 backlog) backfills both:
//
//   1. The D-19 filter drops every entry that lacks BOTH model AND errorClass.
//      Today's ledger has model but no errorClass on any entry, so the filter
//      yields the empty set → `NO_WINNER_YET`.
//
//   2. Even if errorClass were populated, the absence of an outcome field
//      makes pass-rates uncomputable. computePerClassPerArm() probes each
//      filtered entry for any of {outcome:'pass'|'fail', success:bool,
//      passed:bool, pr_merged:bool} and sets outcomeUnavailable=true if none
//      are present → main flow emits `NO_WINNER_YET`.
//
// This is intentional: emitting a fake or stale winner declaration would
// bias future routing-table edits. Per the D-20 LOCKED decision, abstention
// is the correct behavior for v4.1 — STATE.md carries the Phase 56 follow-up
// todo to extend the ledger schema with `errorClass` (sourced from
// auto-fix.mjs's Step 7 errorClass var) and a `pr_merged` outcome field
// (sourced from auto-fix-promote.mjs's verified-promotion event). When that
// lands, this script automatically exits abstention without code changes.
//
// CLI
// ---
//   node scripts/a-b-winner.mjs [--ledger <path>]
//
//   --ledger <path>   Override the default ledger location. Useful for testing
//                     against synthetic fixtures. Default:
//                     tests/e2e/.llm-spend-ledger.json
//
// Exit codes
//   0   Always — including NO_WINNER_YET (operational-decision tool; an
//       absent winner is NOT an error condition).
//   1   Ledger read/parse error (caller-friendly stderr message).
//
// PHASE_56_TODO: when the ledger schema gains errorClass + an outcome field,
// remove the outcomeUnavailable abstention branch in computePerClassPerArm
// and replace the synthetic forward-compat test fixtures with real-data
// regression tests.

import { readFileSync } from 'node:fs';

// ===========================================================================
// LOCKED CONSTANTS (D-16, D-17, D-18)
// ===========================================================================

/**
 * Minimum number of fix attempts per ERROR_CLASS per model arm before a
 * winner can be declared. Below this threshold for ANY class on EITHER arm,
 * the script emits `NO_WINNER_YET`. D-16 operator decision; tunable at this
 * single location.
 */
const N_PER_ARM_REQUIRED = 20;

/**
 * Pass-rate delta below which arms are declared `tie` (i.e. inconclusive
 * for ranking purposes). D-18 operator decision.
 */
const TIE_THRESHOLD = 0.05;

/**
 * Default ledger path relative to the repository root. CLI may override
 * via --ledger.
 */
const DEFAULT_LEDGER_PATH = 'tests/e2e/.llm-spend-ledger.json';

/**
 * Literal output strings — pinned by Vitest tests + the verify block in
 * 54-01-PLAN.md.
 */
const NO_WINNER_YET = 'NO_WINNER_YET';

// ===========================================================================
// Pure helpers (exported for Vitest direct-import testing)
// ===========================================================================

/**
 * Parse process argv for --ledger <path>. Hand-rolled rather than yargs/
 * commander/minimist per Phase 54 zero-deps constraint (REQUIREMENTS.md
 * "Out of Scope: New npm dependencies for any v4.1 feature").
 *
 * @param {string[]} argv  typically process.argv (full array including
 *   node + script path). The function scans argv[2..] for --ledger.
 * @returns {{ledgerPath: string}}
 */
export function parseArgs(argv) {
  let ledgerPath = DEFAULT_LEDGER_PATH;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ledger' && i + 1 < argv.length) {
      ledgerPath = argv[i + 1];
      i++;
    }
  }
  return { ledgerPath };
}

/**
 * Read + parse the ledger JSON. Flattens months[*].iterations[*] into a
 * single entry array. On read/parse failure, throws an Error with a clear
 * message — caller writes to stderr and exits 1.
 *
 * @param {string} ledgerPath  filesystem path to the ledger JSON file
 * @returns {object[]} flat array of ledger entry objects
 */
export function readLedgerEntries(ledgerPath) {
  let raw;
  try {
    raw = readFileSync(ledgerPath, 'utf8');
  } catch (err) {
    throw new Error(`failed to read ledger at ${ledgerPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to parse ledger JSON at ${ledgerPath}: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`ledger at ${ledgerPath} is not a JSON object`);
  }
  const months = (parsed && typeof parsed === 'object' && parsed.months) || {};
  const entries = [];
  for (const monthKey of Object.keys(months)) {
    const month = months[monthKey];
    const iterations = (month && Array.isArray(month.iterations)) ? month.iterations : [];
    for (const e of iterations) {
      if (e && typeof e === 'object') entries.push(e);
    }
  }
  return entries;
}

/**
 * Attribution test — does an entry have enough metadata to be A/B-attributed
 * to a specific model arm + ERROR_CLASS?
 *
 * D-19 filter: drop entries lacking model OR errorClass. The SDK currently
 * writes model strings like `claude-opus-4-7[1m]` (with a `[1m]` context-
 * window suffix); we accept either bare or suffixed variants via startsWith
 * for forward-compat.
 *
 * @param {object} entry
 * @returns {boolean}
 */
function isAttributable(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const m = entry.model;
  if (typeof m !== 'string') return false;
  if (!m.startsWith('claude-sonnet-4-6') && !m.startsWith('claude-opus-4-7')) {
    return false;
  }
  if (typeof entry.errorClass !== 'string' || entry.errorClass.length === 0) {
    return false;
  }
  return true;
}

/**
 * D-19 filter — drop ledger entries that pre-date Phase 54 wiring (entries
 * lacking model or errorClass). Returns a fresh array of attributable
 * entries only.
 *
 * @param {object[]} entries
 * @returns {object[]}
 */
export function filterAttributableEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(isAttributable);
}

/**
 * Classify a ledger entry's model field into the comparison arm:
 *   'opus'   — entry.model startsWith 'claude-opus'
 *   'sonnet' — otherwise (default; isAttributable already ruled out
 *              non-recognized models)
 *
 * @param {object} entry
 * @returns {'sonnet' | 'opus'}
 */
function entryArm(entry) {
  return entry.model.startsWith('claude-opus') ? 'opus' : 'sonnet';
}

/**
 * Detect an outcome field on a single entry. D-20: ledger schema is
 * currently missing this — when none is found across the entire filtered
 * set, the caller flips to abstention mode.
 *
 * Accepted field shapes (priority order):
 *   1. entry.outcome === 'pass'  / 'fail'
 *   2. entry.success === true    / false
 *   3. entry.passed === true     / false
 *   4. entry.pr_merged === true  / false
 *
 * @param {object} entry
 * @returns {boolean|null} true=pass, false=fail, null=field absent
 */
function detectOutcome(entry) {
  if (entry.outcome === 'pass') return true;
  if (entry.outcome === 'fail') return false;
  if (typeof entry.success === 'boolean') return entry.success;
  if (typeof entry.passed === 'boolean') return entry.passed;
  if (typeof entry.pr_merged === 'boolean') return entry.pr_merged;
  return null;
}

/**
 * Group filtered entries by ERROR_CLASS, then by arm. Accumulates sample
 * count `n` and pass count per (class, arm) cell.
 *
 * D-20 abstention probe: at the top, scan all filtered entries for ANY
 * outcome field. If none are present anywhere, return {outcomeUnavailable:
 * true} and the caller emits NO_WINNER_YET. This is the v4.1 abstention
 * behavior locked in by the ledger schema gap.
 *
 * @param {object[]} filtered  output of filterAttributableEntries
 * @returns {{outcomeUnavailable: true} | {outcomeUnavailable: false, perClass: object}}
 */
export function computePerClassPerArm(filtered) {
  if (!Array.isArray(filtered) || filtered.length === 0) {
    // PHASE_56_TODO: with a populated ledger this branch becomes vestigial;
    // empty input naturally yields empty perClass and NO_WINNER_YET upstream.
    return { outcomeUnavailable: true, perClass: {} };
  }

  // D-20 outcome probe — does ANY filtered entry carry an outcome field?
  const anyHasOutcome = filtered.some((e) => detectOutcome(e) !== null);
  if (!anyHasOutcome) {
    // PHASE_56_TODO: ledger schema must be extended with an outcome /
    // pr_merged field before this branch becomes unreachable. See
    // STATE.md Pending Todos.
    return { outcomeUnavailable: true, perClass: {} };
  }

  const perClass = {};
  for (const e of filtered) {
    const cls = e.errorClass;
    const arm = entryArm(e);
    if (!perClass[cls]) {
      perClass[cls] = {
        sonnet: { n: 0, pass: 0 },
        opus: { n: 0, pass: 0 },
      };
    }
    perClass[cls][arm].n += 1;
    const outcome = detectOutcome(e);
    if (outcome === true) perClass[cls][arm].pass += 1;
    // outcome === null entries are still counted in n but contribute 0
    // to pass count — the operator gets a conservative pass-rate floor.
  }
  return { outcomeUnavailable: false, perClass };
}

/**
 * Given per-class stats, determine if either arm of any class is below the
 * sample threshold. Returns true when ANY (class, arm) cell has
 * n < N_PER_ARM_REQUIRED.
 *
 * @param {object} perClass  result of computePerClassPerArm().perClass
 * @returns {boolean}
 */
export function anyClassInsufficient(perClass) {
  for (const cls of Object.keys(perClass)) {
    const cell = perClass[cls];
    if (cell.sonnet.n < N_PER_ARM_REQUIRED) return true;
    if (cell.opus.n < N_PER_ARM_REQUIRED) return true;
  }
  return false;
}

/**
 * Declare a per-class winner. Returns 'sonnet' | 'opus' | 'tie'.
 *
 * @param {{sonnet: {n, pass}, opus: {n, pass}}} cell
 * @returns {'sonnet'|'opus'|'tie'}
 */
export function declareWinner(cell) {
  const sonnetRate = cell.sonnet.n > 0 ? cell.sonnet.pass / cell.sonnet.n : 0;
  const opusRate = cell.opus.n > 0 ? cell.opus.pass / cell.opus.n : 0;
  const delta = Math.abs(sonnetRate - opusRate);
  if (delta < TIE_THRESHOLD) return 'tie';
  return sonnetRate > opusRate ? 'sonnet' : 'opus';
}

/**
 * Format the winner-eligible per-class results as a markdown table per D-18.
 * Sort: alphabetical by ERROR_CLASS. Pass-rates: 2 decimal places.
 *
 * Output shape:
 *   | ERROR_CLASS | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |
 *   | --- | --- | --- | --- | --- | --- |
 *   | <CLASS> | <rate> | <n> | <rate> | <n> | <winner> |
 *
 * Trailing newline after the last row.
 *
 * @param {object} perClass
 * @returns {string}
 */
export function formatMarkdownTable(perClass) {
  const header =
    '| ERROR_CLASS | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |';
  const sep = '| --- | --- | --- | --- | --- | --- |';
  const lines = [header, sep];
  const classes = Object.keys(perClass).sort();
  for (const cls of classes) {
    const cell = perClass[cls];
    const sRate = cell.sonnet.n > 0 ? (cell.sonnet.pass / cell.sonnet.n).toFixed(2) : '0.00';
    const oRate = cell.opus.n > 0 ? (cell.opus.pass / cell.opus.n).toFixed(2) : '0.00';
    const winner = declareWinner(cell);
    lines.push(
      `| ${cls} | ${sRate} | ${cell.sonnet.n} | ${oRate} | ${cell.opus.n} | ${winner} |`,
    );
  }
  return lines.join('\n') + '\n';
}

// ===========================================================================
// Main flow (only runs when invoked directly, not when imported by tests)
// ===========================================================================

/**
 * Main flow:
 *   1. parseArgs        → resolve ledger path
 *   2. readLedgerEntries → flat array (may throw on I/O error)
 *   3. filterAttributable → drop pre-Phase-54 entries (D-19)
 *   4. If empty after filter: emit NO_WINNER_YET, exit 0
 *   5. computePerClassPerArm → group + outcome probe (D-20)
 *   6. If outcomeUnavailable: emit NO_WINNER_YET, exit 0  ← Phase 54 default
 *   7. If anyClassInsufficient: emit NO_WINNER_YET, exit 0
 *   8. formatMarkdownTable → emit, exit 0
 *
 * @param {string[]} argv  process.argv-style array
 * @returns {{stdout: string, exitCode: number}}
 */
export function main(argv) {
  const { ledgerPath } = parseArgs(argv);
  let entries;
  try {
    entries = readLedgerEntries(ledgerPath);
  } catch (err) {
    return { stdout: '', exitCode: 1, stderr: `${err.message}\n` };
  }
  const filtered = filterAttributableEntries(entries);
  if (filtered.length === 0) {
    return { stdout: `${NO_WINNER_YET}\n`, exitCode: 0 };
  }
  const { outcomeUnavailable, perClass } = computePerClassPerArm(filtered);
  if (outcomeUnavailable) {
    // PHASE_54 ABSTENTION MODE — see top-of-file commentary.
    return { stdout: `${NO_WINNER_YET}\n`, exitCode: 0 };
  }
  if (anyClassInsufficient(perClass)) {
    return { stdout: `${NO_WINNER_YET}\n`, exitCode: 0 };
  }
  return { stdout: formatMarkdownTable(perClass), exitCode: 0 };
}

// CLI shim — only runs when this file is invoked directly. Tests import the
// pure helpers above and never reach this branch.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = main(process.argv);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

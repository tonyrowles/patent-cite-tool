#!/usr/bin/env node
// scripts/a-b-winner.mjs
//
// Phase 54 Plan 01 (AB-04) — operator-triggered A/B winner-declaration CLI.
// Phase 66 Plan 01 (ABWIN-01..04) — extended to (class, arm, transport) 3-way
// stratification + --since-iso filter + --admin-bypass filter + TIE_THRESHOLD
// bump (0.05 → 0.10) + zero-sample sanity check.
//
// PURPOSE
// -------
// Reads the LLM spend ledger (default: tests/e2e/.llm-spend-ledger.json),
// groups entries per ERROR_CLASS per model arm (sonnet vs opus) per transport
// (sdk vs subscription vs unknown), and computes whether either arm has a
// winning pass-rate advantage for any (class, transport) tuple — but ONLY
// once each arm has accumulated at least N_PER_ARM_REQUIRED samples for
// that tuple.
//
// LOCKED DESIGN PARAMETERS
// ------------------------
//   - N_PER_ARM_REQUIRED = 20   (Phase 54 D-16 operator decision; Phase 66
//                                ABWIN-DEF-01 defers tuning to v4.4)
//   - Winner threshold:  pass-rate delta < TIE_THRESHOLD → 'tie';
//                        otherwise the higher-rate arm wins.
//   - TIE_THRESHOLD = 0.10      (Phase 66 ABWIN-02 — raised from 0.05; see
//                                inline rationale below at the constant)
//   - Output:  `NO_WINNER_YET\n` (trailing newline, stdout, exit 0) when
//              sample threshold unmet (D-17);  markdown table otherwise (D-18).
//   - Imports: node:fs ONLY — pure CLI script (D-21).
//   - Default ledger: tests/e2e/.llm-spend-ledger.json (D-15).
//
// PHASE 66 ABSTENTION PATH (narrowed from Phase 54 D-20)
// ------------------------------------------------------
// The Phase 54 schema gap (no outcome field anywhere in the ledger) drove a
// blanket abstention. Phase 56 added an outcome path and Phase 60.1 added a
// transport whitelist; Phase 66 widens grouping to 3-way (class, arm,
// transport). The abstention path is now narrowed to genuine zero-sample
// cases:
//
//   1. The D-19 filter (isAttributable, byte-unchanged) drops entries
//      missing model OR errorClass.
//   2. computePerClassPerArm probes for ANY outcome field across the filtered
//      set. If none → outcomeUnavailable=true → NO_WINNER_YET. Entries
//      without `transport` bucket into the 'unknown' transport sub-key
//      (forward-compat with pre-Phase-56 entries that the --since-iso filter
//      may not have caught).
//   3. formatMarkdownTable emits per (class, transport) rows. When a
//      (class, transport, arm) cell has n=0, it emits an inline `abstain —
//      insufficient samples in <arm> arm for (<class>, <transport>)` line
//      instead of a markdown row for that tuple.
//
// CLI
// ---
//   node scripts/a-b-winner.mjs [--ledger <path>]
//                               [--since-iso <iso8601>]
//                               [--admin-bypass <csv-path>]
//
//   --ledger <path>            Override the default ledger location. Useful
//                              for testing against synthetic fixtures.
//                              Default: tests/e2e/.llm-spend-ledger.json
//
//   --since-iso <iso8601>      RFC-3339 timestamp (YYYY-MM-DDTHH:MM:SSZ).
//                              Drops ledger entries whose `iso` is older.
//                              Default: 30 days ago.  Pre-v4.3 entries lack
//                              `transport`; this filter is the canonical way
//                              to exclude them so they don't pollute 3-way
//                              math. Invalid format → exit 1.
//
//   --admin-bypass <csv-path>  Path to Phase 62 audit-bypass-merges.mjs CSV.
//                              Ledger entries whose `prNumber` matches a row
//                              with bypass_detected=true are dropped (the
//                              `--admin` merge bypassed the verifier gate, so
//                              its `outcome:'pass'` is forensically untrusted).
//                              When omitted: no filtering (back-compat).
//
// Exit codes
//   0   Always — including NO_WINNER_YET (operational-decision tool; an
//       absent winner is NOT an error condition).
//   1   Ledger read/parse error, malformed --since-iso, or --admin-bypass
//       read error (caller-friendly stderr message).

import { readFileSync } from 'node:fs';

// ===========================================================================
// LOCKED CONSTANTS (Phase 54 D-16..D-21 + Phase 66 ABWIN-02)
// ===========================================================================

/**
 * Minimum number of fix attempts per ERROR_CLASS per model arm per transport
 * before a winner can be declared. Below this threshold for ANY (class,
 * arm, transport) cell, the script emits `NO_WINNER_YET`. D-16 operator
 * decision; tunable at this single location. Phase 66 ABWIN-DEF-01 explicitly
 * defers re-tuning to v4.4 (after a week of live ledger baseline).
 */
const N_PER_ARM_REQUIRED = 20;

/**
 * Pass-rate delta below which arms are declared `tie` (i.e. inconclusive for
 * ranking purposes).
 *
 * Raised from 0.05 → 0.10 in Phase 66 (ABWIN-02). The (class, arm, transport)
 * 3-way fan-out reduces per-cell sample size, so the tighter 0.05 noise floor
 * would over-declare winners. See PITFALLS noise-floor reasoning ("0.05 was
 * too tight given (class, arm, transport) 3-way fan-out reduces per-cell
 * sample size").
 */
const TIE_THRESHOLD = 0.10;

/**
 * Default ledger path relative to the repository root. CLI may override
 * via --ledger.
 */
const DEFAULT_LEDGER_PATH = 'tests/e2e/.llm-spend-ledger.json';

/**
 * Default number of days back for --since-iso filtering. Single source of
 * truth so tests can re-derive the default value.
 */
const DEFAULT_SINCE_DAYS = 30;

/**
 * WR-02 mirror — strict RFC-3339 shape so --since-iso flows into downstream
 * filters without ambiguity. Mirrors the Phase 62 audit-bypass-merges.mjs
 * pattern verbatim.
 */
const SINCE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Locked Phase 62 CSV header — see scripts/audit-bypass-merges.mjs:CSV_HEADER.
 * The --admin-bypass filter validates this prefix defensively before parsing.
 */
const ADMIN_BYPASS_CSV_HEADER =
  'pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag';

/**
 * Stable transport iteration order for table emission. 'unknown' bucket
 * catches entries without a `transport` field (forward-compat with
 * pre-Phase-56 entries the --since-iso default may not have caught).
 */
const TRANSPORT_ORDER = ['sdk', 'subscription', 'unknown'];

/**
 * Literal output strings — pinned by Vitest tests + the verify block in
 * the plan.
 */
const NO_WINNER_YET = 'NO_WINNER_YET';

// ===========================================================================
// Pure helpers (exported for Vitest direct-import testing)
// ===========================================================================

/**
 * Parse process argv for --ledger, --since-iso, --admin-bypass. Hand-rolled
 * rather than yargs/commander/minimist per zero-deps constraint.
 *
 * @param {string[]} argv  typically process.argv (full array including
 *   node + script path). The function scans argv[2..].
 * @returns {{ledgerPath: string, sinceIso: string, adminBypassPath: string|null}}
 * @throws {Error} when --since-iso value does not match SINCE_ISO_RE
 */
export function parseArgs(argv) {
  let ledgerPath = DEFAULT_LEDGER_PATH;
  let sinceIso = new Date(Date.now() - DEFAULT_SINCE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  let adminBypassPath = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ledger' && i + 1 < argv.length) {
      ledgerPath = argv[i + 1];
      i++;
    } else if (argv[i] === '--since-iso' && i + 1 < argv.length) {
      const v = argv[i + 1];
      if (typeof v !== 'string' || !SINCE_ISO_RE.test(v)) {
        throw new Error(
          `a-b-winner: invalid --since-iso '${v}' (must be RFC-3339 like 2026-06-09T00:00:00Z)`,
        );
      }
      sinceIso = v;
      i++;
    } else if (argv[i] === '--admin-bypass' && i + 1 < argv.length) {
      adminBypassPath = argv[i + 1];
      i++;
    }
    // Unknown flags: ignored (forward-compat, matches Phase 62 pattern).
  }
  return { ledgerPath, sinceIso, adminBypassPath };
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
 * Phase 66 ABWIN-02 — drop entries whose `iso` is strictly older than the
 * `sinceIso` cutoff. Entries lacking `iso` are dropped (forward-compat —
 * they can't be ranged-filtered).
 *
 * String comparison on RFC-3339 ISO-8601 timestamps yields chronological
 * order — same trick as the Phase 54 lexicographic ordering elsewhere.
 *
 * @param {object[]} entries
 * @param {string} sinceIso
 * @returns {object[]}
 */
export function filterBySinceIso(entries, sinceIso) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e) => e && typeof e.iso === 'string' && e.iso >= sinceIso,
  );
}

/**
 * Phase 66 ABWIN-03 — parse the Phase 62 audit-bypass-merges.mjs CSV output
 * into a Set of prNumbers where bypass_detected === 'true' literal string.
 *
 * Defensive: header mismatch logs to stderr and returns an empty set (does
 * NOT throw — the upstream operator pipeline must surface CSV producer bugs
 * separately from A/B math). Non-numeric pr_number cells are silently
 * skipped.
 *
 * @param {string} csvText
 * @returns {Set<number>}
 */
export function parseAdminBypassCsv(csvText) {
  const out = new Set();
  if (typeof csvText !== 'string' || csvText.length === 0) return out;
  const lines = csvText.split('\n');
  if (lines.length === 0) return out;
  const header = lines[0];
  if (!header.startsWith(ADMIN_BYPASS_CSV_HEADER)) {
    process.stderr.write(
      `a-b-winner: --admin-bypass CSV header mismatch (got '${header}', expected '${ADMIN_BYPASS_CSV_HEADER}'); returning empty bypass set\n`,
    );
    return out;
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length === 0) continue;
    const cells = line.split(',');
    if (cells.length < 4) continue;
    const prNumber = Number.parseInt(cells[0], 10);
    if (Number.isNaN(prNumber)) continue;
    if (cells[3] === 'true') out.add(prNumber);
  }
  return out;
}

/**
 * Phase 66 ABWIN-03 — load + parse the --admin-bypass CSV file. When path
 * is null/undefined returns empty Set (back-compat). Wraps read errors in
 * an Error so main() can stderr + exit 1.
 *
 * @param {string|null|undefined} adminBypassPath
 * @returns {Set<number>}
 */
export function loadAdminBypassSet(adminBypassPath) {
  if (adminBypassPath == null) return new Set();
  let csvText;
  try {
    csvText = readFileSync(adminBypassPath, 'utf8');
  } catch (err) {
    throw new Error(
      `a-b-winner: failed to read --admin-bypass CSV at ${adminBypassPath}: ${err.message}`,
    );
  }
  return parseAdminBypassCsv(csvText);
}

/**
 * Phase 66 ABWIN-03 — drop ledger entries whose `prNumber` matches the
 * bypass set. When bypassSet is empty: returns entries unchanged
 * (back-compat). Entries lacking `prNumber` are kept (they aren't auto-fix
 * PR-attributable so they couldn't have been bypassed).
 *
 * @param {object[]} entries
 * @param {Set<number>} bypassSet
 * @returns {object[]}
 */
export function filterByAdminBypass(entries, bypassSet) {
  if (!Array.isArray(entries)) return [];
  if (!bypassSet || bypassSet.size === 0) return entries;
  return entries.filter(
    (e) => !e || typeof e.prNumber !== 'number' || !bypassSet.has(e.prNumber),
  );
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
 * Phase 66 ABWIN-01 — classify a ledger entry's transport field into the
 * comparison bucket. Pre-v4.3 entries lack `transport` → 'unknown' bucket
 * (forward-compat with --since-iso edge cases).
 *
 * @param {object} entry
 * @returns {'sdk' | 'subscription' | 'unknown'}
 */
function entryTransport(entry) {
  return entry.transport === 'sdk' || entry.transport === 'subscription'
    ? entry.transport
    : 'unknown';
}

/**
 * Detect an outcome field on a single entry. Phase 54 D-20 abstention probe
 * unchanged from the original.
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
 * Phase 66 ABWIN-01 — group filtered entries by ERROR_CLASS, then by arm,
 * then by transport. Accumulates sample count `n` and pass count per
 * (class, arm, transport) cell.
 *
 * Output shape:
 *   perClass[errorClass][arm][transport] = { n, pass }
 *
 * where arm ∈ {'sonnet', 'opus'} and transport ∈ {'sdk', 'subscription', 'unknown'}.
 *
 * D-20 abstention probe preserved: empty input → outcomeUnavailable=true;
 * no entry with detectable outcome → outcomeUnavailable=true.
 *
 * @param {object[]} filtered  output of filterAttributableEntries
 * @returns {{outcomeUnavailable: true} | {outcomeUnavailable: false, perClass: object}}
 */
export function computePerClassPerArm(filtered) {
  if (!Array.isArray(filtered) || filtered.length === 0) {
    return { outcomeUnavailable: true, perClass: {} };
  }

  // D-20 outcome probe — does ANY filtered entry carry an outcome field?
  const anyHasOutcome = filtered.some((e) => detectOutcome(e) !== null);
  if (!anyHasOutcome) {
    return { outcomeUnavailable: true, perClass: {} };
  }

  const perClass = {};
  for (const e of filtered) {
    const cls = e.errorClass;
    const arm = entryArm(e);
    const tp = entryTransport(e);
    if (!perClass[cls]) {
      perClass[cls] = {
        sonnet: {},
        opus: {},
      };
    }
    if (!perClass[cls][arm][tp]) {
      perClass[cls][arm][tp] = { n: 0, pass: 0 };
    }
    perClass[cls][arm][tp].n += 1;
    const outcome = detectOutcome(e);
    if (outcome === true) perClass[cls][arm][tp].pass += 1;
    // outcome === null entries are still counted in n but contribute 0
    // to pass count — the operator gets a conservative pass-rate floor.
  }
  return { outcomeUnavailable: false, perClass };
}

/**
 * Walk every (class, transport) tuple. For each, require BOTH
 * `cell.sonnet[transport].n >= N_PER_ARM_REQUIRED` AND
 * `cell.opus[transport].n >= N_PER_ARM_REQUIRED`. Returns true if ANY
 * (class, transport) tuple has an arm under threshold.
 *
 * (Phase 66 ABWIN-01: extended from 2D to 3-way semantics.)
 *
 * @param {object} perClass  result of computePerClassPerArm().perClass
 * @returns {boolean}
 */
export function anyClassInsufficient(perClass) {
  for (const cls of Object.keys(perClass)) {
    const cell = perClass[cls];
    // Collect all transport keys observed on either arm.
    const transports = new Set([
      ...Object.keys(cell.sonnet || {}),
      ...Object.keys(cell.opus || {}),
    ]);
    for (const tp of transports) {
      const sN = cell.sonnet?.[tp]?.n ?? 0;
      const oN = cell.opus?.[tp]?.n ?? 0;
      if (sN < N_PER_ARM_REQUIRED) return true;
      if (oN < N_PER_ARM_REQUIRED) return true;
    }
  }
  return false;
}

/**
 * Legacy Phase 54 export — declares a per-class winner from a 2D
 * `{sonnet, opus}` cell. Preserved for back-compat with Phase 54 Test 6
 * which exercises this signature directly.
 *
 * Returns 'sonnet' | 'opus' | 'tie'.
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
 * Phase 66 ABWIN-04 — declare a winner for a (class, transport) tuple.
 * Adds a zero-sample sanity check: if EITHER arm has n=0 (or the bucket is
 * undefined entirely), returns 'abstain-zero-sample' rather than a winner.
 *
 * @param {object} perClass
 * @param {string} errorClass
 * @param {string} transport
 * @returns {'sonnet'|'opus'|'tie'|'abstain-zero-sample'}
 */
export function declareWinnerForTuple(perClass, errorClass, transport) {
  const cls = perClass[errorClass];
  if (!cls) return 'abstain-zero-sample';
  const sCell = cls.sonnet?.[transport];
  const oCell = cls.opus?.[transport];
  const sN = sCell?.n ?? 0;
  const oN = oCell?.n ?? 0;
  if (sN === 0 || oN === 0) return 'abstain-zero-sample';
  const sonnetRate = sCell.pass / sN;
  const opusRate = oCell.pass / oN;
  const delta = Math.abs(sonnetRate - opusRate);
  if (delta < TIE_THRESHOLD) return 'tie';
  return sonnetRate > opusRate ? 'sonnet' : 'opus';
}

/**
 * Phase 66 ABWIN-01 — format the winner-eligible per-class results as a
 * markdown table stratified by (errorClass, transport). Sort: alphabetical
 * by ERROR_CLASS, then by stable TRANSPORT_ORDER. Pass-rates: 2 decimal
 * places.
 *
 * Output shape:
 *   | ERROR_CLASS | transport | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |
 *   | --- | --- | --- | --- | --- | --- | --- |
 *   | <CLASS> | <transport> | <rate> | <n> | <rate> | <n> | <winner> |
 *
 * When a (class, transport, arm) cell has n=0 (one arm empty for that
 * tuple), emits a literal `abstain — insufficient samples in <arm> arm
 * for (<class>, <transport>)` line in place of the markdown row for that
 * tuple. Other tuples render normally.
 *
 * Trailing newline preserved.
 *
 * @param {object} perClass
 * @returns {string}
 */
export function formatMarkdownTable(perClass) {
  const header =
    '| ERROR_CLASS | transport | sonnet pass_rate | sonnet n | opus pass_rate | opus n | winner |';
  const sep = '| --- | --- | --- | --- | --- | --- | --- |';
  const lines = [header, sep];
  const classes = Object.keys(perClass).sort();
  for (const cls of classes) {
    const cell = perClass[cls];
    for (const tp of TRANSPORT_ORDER) {
      const sCell = cell.sonnet?.[tp];
      const oCell = cell.opus?.[tp];
      const sN = sCell?.n ?? 0;
      const oN = oCell?.n ?? 0;
      // Skip tuples where neither arm observed any samples — irrelevant.
      if (sN === 0 && oN === 0) continue;
      const winner = declareWinnerForTuple(perClass, cls, tp);
      if (winner === 'abstain-zero-sample') {
        // When BOTH are zero we already skipped above; here exactly one is
        // zero. If sonnet is zero, sonnet is the empty arm; else opus. (If
        // both were zero we wouldn't be in this branch — see continue above.)
        const emptyArm = sN === 0 ? 'sonnet' : 'opus';
        lines.push(`abstain — insufficient samples in ${emptyArm} arm for (${cls}, ${tp})`);
        continue;
      }
      const sRate = (sCell.pass / sN).toFixed(2);
      const oRate = (oCell.pass / oN).toFixed(2);
      lines.push(
        `| ${cls} | ${tp} | ${sRate} | ${sN} | ${oRate} | ${oN} | ${winner} |`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

// ===========================================================================
// Main flow (only runs when invoked directly, not when imported by tests)
// ===========================================================================

/**
 * Main flow:
 *   1. parseArgs        → resolve ledger path, sinceIso, adminBypassPath
 *   2. readLedgerEntries → flat array (may throw on I/O error)
 *   3. filterBySinceIso → Phase 66 ABWIN-02 cutoff
 *   4. loadAdminBypassSet → Phase 66 ABWIN-03 CSV parse (may throw on I/O)
 *   5. filterByAdminBypass → drop bypass-tainted prNumbers
 *   6. filterAttributableEntries → drop pre-Phase-54 entries (D-19)
 *   7. If empty after filter: emit NO_WINNER_YET, exit 0
 *   8. computePerClassPerArm → group + outcome probe (D-20)
 *   9. If outcomeUnavailable: emit NO_WINNER_YET, exit 0
 *  10. If anyClassInsufficient: emit NO_WINNER_YET, exit 0
 *  11. formatMarkdownTable → emit, exit 0
 *
 * @param {string[]} argv  process.argv-style array
 * @returns {{stdout: string, exitCode: number, stderr?: string}}
 */
export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return { stdout: '', exitCode: 1, stderr: `${err.message}\n` };
  }
  const { ledgerPath, sinceIso, adminBypassPath } = parsed;
  let entries;
  try {
    entries = readLedgerEntries(ledgerPath);
  } catch (err) {
    return { stdout: '', exitCode: 1, stderr: `${err.message}\n` };
  }
  entries = filterBySinceIso(entries, sinceIso);
  let bypassSet;
  try {
    bypassSet = loadAdminBypassSet(adminBypassPath);
  } catch (err) {
    return { stdout: '', exitCode: 1, stderr: `${err.message}\n` };
  }
  entries = filterByAdminBypass(entries, bypassSet);
  const filtered = filterAttributableEntries(entries);
  if (filtered.length === 0) {
    return { stdout: `${NO_WINNER_YET}\n`, exitCode: 0 };
  }
  const { outcomeUnavailable, perClass } = computePerClassPerArm(filtered);
  if (outcomeUnavailable) {
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

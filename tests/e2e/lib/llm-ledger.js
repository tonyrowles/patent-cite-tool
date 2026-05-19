// tests/e2e/lib/llm-ledger.js
//
// Phase 31 (LLM-05 + LLM-06) — append-only spend ledger for the LLM
// exploratory runner.
//
// Public surface:
//   LEDGER_PATH                       absolute path to the default ledger file
//   HARD_CAP_USD = 100                refuse-to-invoke threshold
//   WARN_THRESHOLD_USD = 80           print-warning threshold
//   currentMonth()                    "YYYY-MM" for now
//   readLedger(ledgerPath?)           {version:1, months:{}} on missing/corrupt
//   monthlyTotal(ledger, month?)      number; 0 when month absent
//   checkSpendCap(ledger, month?)     { status, monthly_total_usd, month, message }
//   appendLedgerEntry(ledgerPath, entry)
//
// Design notes:
//   - Pattern mirrors tests/e2e/lib/report.js (Phase 28) — single-process
//     read-modify-write with no file locking. The runner is intended to be
//     run sequentially by a single developer; concurrent runs are documented
//     in README as unsupported (RESEARCH.md Pitfall 5).
//   - The hard cap is checked BEFORE invoking `claude -p` (precheckSpendCap
//     in scripts/e2e-explore.mjs). After-the-fact bookkeeping happens in
//     appendLedgerEntry.
//   - The ledger file MUST be gitignored — see .gitignore. Committing it
//     would publicly leak the developer's monthly spend pattern.
//   - Floating-point arithmetic on dollar amounts is rounded to 6 decimal
//     places via `+(x).toFixed(6)` to prevent drift across many small
//     additions (e.g. 0.1 + 0.2 → 0.30000000000000004).
//   - Imports `llm-pricing.js` so future callers can fallback-compute cost
//     when `total_cost_usd` is missing; this module itself trusts the cost
//     field on the entry passed in (canonical path per RESEARCH.md Pitfall 6).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// llm-pricing is imported and re-exported so the file relationship is
// explicit at the module graph level and callers can chain via llm-ledger
// without taking a second import. See RESEARCH.md Pitfall 6 — total_cost_usd
// is the canonical path; PRICING_BY_MODEL is fallback-only.
import { PRICING_BY_MODEL } from './llm-pricing.js';
export { PRICING_BY_MODEL };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the default per-repo ledger file. The file lives one
 * directory up from this module (in tests/e2e/) so it sits beside the
 * artifacts/ dir but is NOT inside it — keeps the ledger surviving
 * artifacts cleanup between runs.
 * @type {string}
 */
export const LEDGER_PATH = path.resolve(__dirname, '../.llm-spend-ledger.json');

/**
 * Hard cap: monthly spend >= this triggers status:'block' (refuse to
 * invoke claude -p). The CONTEXT.md decision locks this at $100.
 */
export const HARD_CAP_USD = 100;

/**
 * Warning threshold: monthly spend >= this prints a warning but allows
 * invocation. Locked at $80 per CONTEXT.md.
 */
export const WARN_THRESHOLD_USD = 80;

/**
 * @returns {string} the current month as "YYYY-MM" (UTC; ISO 8601 prefix)
 */
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Read the ledger file. Returns the empty-ledger shape on any failure
 * (missing file, invalid JSON, EACCES). Callers SHOULD NOT distinguish
 * between these cases — they all reduce to "no spend recorded yet".
 *
 * @param {string} [ledgerPath=LEDGER_PATH]
 * @returns {{version: number, months: Record<string, {invocations: number, total_usd: number, last_invocation_iso: string|null, iterations: object[]}>}}
 */
export function readLedger(ledgerPath = LEDGER_PATH) {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    return { version: 1, months: {} };
  }
}

/**
 * Total cost recorded for `month` in the given ledger. Returns 0 when
 * the month has no entry yet.
 *
 * @param {object} ledger
 * @param {string} [month=currentMonth()]
 * @returns {number}
 */
export function monthlyTotal(ledger, month = currentMonth()) {
  return ledger?.months?.[month]?.total_usd ?? 0;
}

/**
 * Classify the ledger's current month against the warn/block thresholds.
 *
 * @param {object} ledger
 * @param {string} [month=currentMonth()]
 * @returns {{ status: 'ok'|'warn'|'block', monthly_total_usd: number, month: string, message: string }}
 *   status === 'block'   ⇒ caller MUST NOT invoke claude -p
 *   status === 'warn'    ⇒ approaching cap; print message and continue
 *   status === 'ok'      ⇒ silent pass; message is empty string
 */
export function checkSpendCap(ledger, month = currentMonth()) {
  const total = monthlyTotal(ledger, month);
  if (total >= HARD_CAP_USD) {
    return {
      status: 'block',
      monthly_total_usd: total,
      month,
      message:
        `Monthly LLM spend $${total.toFixed(2)} >= $${HARD_CAP_USD}. ` +
        `Refusing to invoke claude -p. Reset ledger or wait until next month.`,
    };
  }
  if (total >= WARN_THRESHOLD_USD) {
    return {
      status: 'warn',
      monthly_total_usd: total,
      month,
      message:
        `⚠ Monthly spend $${total.toFixed(2)} >= $${WARN_THRESHOLD_USD} ` +
        `— approaching $${HARD_CAP_USD} cap`,
    };
  }
  return {
    status: 'ok',
    monthly_total_usd: total,
    month,
    message: '',
  };
}

/**
 * Append a single iteration entry to the ledger. Reads the current ledger
 * (or initializes an empty one), creates the current-month bucket if
 * absent, increments invocations and total_usd, updates last_invocation_iso,
 * pushes the entry onto iterations[], and writes the whole file back.
 *
 * The write is "atomic enough" for single-process use: a full JSON file
 * is written each time, so a crash mid-write leaves either the prior
 * good state or a (rare) corrupt file that readLedger() treats as empty.
 *
 * @param {string} ledgerPath
 * @param {{
 *   iso: string,
 *   model: string,
 *   cost_usd: number,
 *   tokens_in?: number,
 *   tokens_out?: number,
 *   iteration_n: number,
 *   run_id: string,
 * }} entry
 */
export function appendLedgerEntry(ledgerPath, entry) {
  const ledger = readLedger(ledgerPath);
  const month = currentMonth();

  if (!ledger.months[month]) {
    ledger.months[month] = {
      invocations: 0,
      total_usd: 0,
      last_invocation_iso: null,
      iterations: [],
    };
  }

  const m = ledger.months[month];
  m.invocations += 1;
  const incrementUsd = Number.isFinite(entry?.cost_usd) ? entry.cost_usd : 0;
  // Round to 6dp to avoid float drift (0.1 + 0.2 → 0.30000000000000004).
  m.total_usd = +(m.total_usd + incrementUsd).toFixed(6);
  m.last_invocation_iso = new Date().toISOString();
  m.iterations.push(entry);

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}

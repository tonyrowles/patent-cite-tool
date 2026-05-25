// tests/e2e/lib/llm-ledger.js
//
// Phase 31 (LLM-05 + LLM-06) — append-only spend ledger for the LLM
// exploratory runner.
// Phase 32 (UAT-02) — per-phase spend accounting helpers (D-13/D-14/D-15/D-16).
//
// Public surface:
//   LEDGER_PATH                            absolute path to the default ledger file
//                                          (TEST-ONLY env override via E2E_LEDGER_PATH_OVERRIDE)
//   HARD_CAP_USD = 100                     refuse-to-invoke threshold (monthly)
//   WARN_THRESHOLD_USD = 80                print-warning threshold (monthly)
//   PHASE_HARD_CAP_USD = 10                refuse-to-invoke threshold (per-phase, D-13)
//   PHASE_WARN_THRESHOLD_USD = 8           print-warning threshold (per-phase, D-13)
//   currentMonth()                         "YYYY-MM" for now
//   readLedger(ledgerPath?)                {version:1, months:{}} on missing/corrupt
//   monthlyTotal(ledger, month?)           number; 0 when month absent
//   checkSpendCap(ledger, month?)          { status, monthly_total_usd, month, message }
//   phaseTotal(ledger, phase)              cross-month sum of cost_usd for entries with .phase===phase
//   checkPhaseSpendCap(ledger, phase)      { status, phase_total_usd, phase, message }
//   appendLedgerEntry(ledgerPath, entry)   entry may carry an optional `phase` field (D-14 back-compat)
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
 *
 * TEST-ONLY: set `E2E_LEDGER_PATH_OVERRIDE=<absolute-or-relative-path>` to
 * redirect this constant at module-load time. Used exclusively by integration
 * tests (Plan 32-03 Test 5) that need to seed a throwaway ledger without
 * polluting the real per-repo file. DO NOT set this env var in production,
 * cron, or CI release contexts — Phase 32 D-15 pre-flight gate is the public
 * safety mechanism; this override exists solely so the gate itself can be
 * exercised by a real spawnSync integration test rather than only by
 * unit-test mocks.
 *
 * Resolution rule:
 *   - When process.env.E2E_LEDGER_PATH_OVERRIDE is set AND non-empty
 *     (after .trim()), LEDGER_PATH = path.resolve(<trimmed value>)
 *   - Otherwise LEDGER_PATH falls back to the canonical per-repo location.
 *
 * @type {string}
 */
export const LEDGER_PATH = (() => {
  const overrideRaw = process.env.E2E_LEDGER_PATH_OVERRIDE;
  if (typeof overrideRaw === 'string' && overrideRaw.trim().length > 0) {
    // WR-05 (Phase 32 review): defense-in-depth runtime CI guard. The
    // E2E_LEDGER_PATH_OVERRIDE escape hatch is documented above as test-
    // only, but a misconfigured CI step (or a future contributor who
    // copy-pastes the integration-test env block) could quietly redirect
    // the ledger and bypass the spend caps. Throw loudly in CI so the
    // CI step fails the run rather than silently shipping with caps
    // disabled. The CI guard at scripts/e2e-explore.mjs:74 already
    // refuses to invoke claude in CI, but this is a separate failure
    // mode (any module-load on a CI runner with both flags set).
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      throw new Error(
        'E2E_LEDGER_PATH_OVERRIDE must NOT be set in CI ' +
          '(detected process.env.CI or process.env.GITHUB_ACTIONS). ' +
          'This override is integration-test-only; setting it on a CI ' +
          'runner would bypass Phase 32 spend caps. Unset it in the ' +
          'workflow env block.',
      );
    }
    return path.resolve(overrideRaw.trim());
  }
  return path.resolve(__dirname, '../.llm-spend-ledger.json');
})();

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
 * Per-phase hard cap (D-13): if the cumulative spend tagged with a given
 * phase value reaches this dollar amount, callers MUST NOT invoke `claude -p`
 * for that phase any further. Applied on top of the global monthly cap —
 * either cap triggering is a refusal.
 */
export const PHASE_HARD_CAP_USD = 10;

/**
 * Per-phase warn threshold (D-13): cumulative phase spend at-or-above this
 * value triggers a printed warning, but does not block further invocations
 * until PHASE_HARD_CAP_USD is reached.
 */
export const PHASE_WARN_THRESHOLD_USD = 8;

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
 * Cross-month sum of `cost_usd` for entries tagged with `phase`. A phase
 * (e.g., "32") can span multiple calendar months, so this helper iterates
 * every month bucket rather than only the current month. Entries that lack
 * a phase field or whose phase value differs are ignored.
 *
 * Entries with non-finite cost_usd (NaN, undefined, null, Infinity) are
 * excluded from the sum — mirrors the defensive pattern at appendLedgerEntry.
 *
 * The result is rounded to 6 decimal places to avoid float drift across many
 * small additions, matching the established convention in monthlyTotal /
 * appendLedgerEntry.
 *
 * @param {object} ledger
 * @param {string} phase  e.g., "32"
 * @returns {number}
 */
export function phaseTotal(ledger, phase) {
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let sum = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && it.phase === phase && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);
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
 * Classify the ledger's cumulative phase spend against the per-phase
 * warn/block thresholds (D-13). Mirrors checkSpendCap exactly in shape
 * except that the return object uses `phase_total_usd` / `phase` keys
 * (NOT `monthly_total_usd` / `month`) so callers cannot accidentally
 * mix the two views.
 *
 * @param {object} ledger
 * @param {string} phase  e.g., "32"
 * @returns {{ status: 'ok'|'warn'|'block', phase_total_usd: number, phase: string, message: string }}
 *   status === 'block'   ⇒ caller MUST NOT invoke claude -p for this phase
 *   status === 'warn'    ⇒ approaching per-phase cap; print message and continue
 *   status === 'ok'      ⇒ silent pass; message is empty string
 */
export function checkPhaseSpendCap(ledger, phase) {
  const total = phaseTotal(ledger, phase);
  if (total >= PHASE_HARD_CAP_USD) {
    return {
      status: 'block',
      phase_total_usd: total,
      phase,
      message:
        `Phase ${phase} LLM spend $${total.toFixed(2)} >= $${PHASE_HARD_CAP_USD.toFixed(2)}. ` +
        `Refusing to invoke claude -p. Reset phase entries in ledger or end the phase.`,
    };
  }
  if (total >= PHASE_WARN_THRESHOLD_USD) {
    return {
      status: 'warn',
      phase_total_usd: total,
      phase,
      message:
        `⚠ Phase ${phase} spend $${total.toFixed(2)} >= $${PHASE_WARN_THRESHOLD_USD.toFixed(2)} ` +
        `— approaching $${PHASE_HARD_CAP_USD.toFixed(2)} cap`,
    };
  }
  return {
    status: 'ok',
    phase_total_usd: total,
    phase,
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
 *   phase?: string|null,
 * }} entry
 *   Phase 32 (D-14) backward compatibility: the optional `phase` field is
 *   spread through to iterations[] verbatim — the function body is unchanged.
 *   Legacy callers that omit `phase` continue to produce valid entries; new
 *   callers may set `phase: '32'` (etc.) to feed phaseTotal / checkPhaseSpendCap.
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
  // Crash-safe write (WR-04). fs.writeFileSync truncates first, then writes —
  // a crash, OOM, SIGKILL, or full-disk between truncate and write would
  // leave a partial/corrupt ledger that readLedger() treats as empty,
  // silently zeroing the developer's monthly spend and bypassing the $100
  // cap on the next run. The temp-write + rename pattern is atomic on the
  // same filesystem (POSIX rename(2) / Windows MoveFileEx) and eliminates
  // the truncate-and-die window.
  const tmpPath = `${ledgerPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmpPath, ledgerPath);
}

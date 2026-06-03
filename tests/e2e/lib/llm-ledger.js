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
//   countFixAttempts(ledger, fingerprint)  count of Phase 42 auto-fix iterations for a given fingerprint
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
 * Phase 39 (LEDGER-03) — per-day hard cap. Cumulative spend on a single UTC
 * day at-or-above this threshold triggers `status: 'block'` from checkDayCap
 * and callers MUST refuse further invocations until the next UTC day.
 *
 * BINARY sub-cap (NO warn threshold) per 39-CONTEXT.md lock: sub-caps are
 * a single-bit refusal, not a warn/block ramp. The monthly cap retains the
 * warn ramp; sub-caps are runaway-defense (Pitfall 2 — single-typo cron
 * fan-out → 288×/day) so any partial soft state would defeat the purpose.
 *
 * Value $10 LOCKED by 39-CONTEXT.md ("Implementation Decisions — Cap
 * thresholds: Sub-caps: per-day $10, per-issue $1, per-PR $2").
 */
export const DAY_HARD_CAP_USD = 10;

/**
 * Phase 39 (LEDGER-03) — per-issue hard cap. Cumulative spend tagged with
 * a single `issueId` at-or-above this threshold triggers `status: 'block'`
 * from checkIssueCap. Mirrors DAY_HARD_CAP_USD discipline (binary sub-cap,
 * no warn ramp). Value $1 LOCKED by 39-CONTEXT.md.
 */
export const ISSUE_HARD_CAP_USD = 1;

/**
 * Phase 39 (LEDGER-03) — per-PR hard cap. Cumulative spend tagged with a
 * single `prNumber` at-or-above this threshold triggers `status: 'block'`
 * from checkPrCap. Mirrors DAY_HARD_CAP_USD discipline (binary sub-cap, no
 * warn ramp). Value $2 LOCKED by 39-CONTEXT.md.
 */
export const PR_HARD_CAP_USD = 2;

/**
 * @returns {string} the current month as "YYYY-MM" (UTC; ISO 8601 prefix)
 */
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Phase 39 (LEDGER-03) — current UTC day in YYYY-MM-DD form. Mirrors
 * currentMonth() for the per-day sub-cap helpers (dayTotal / checkDayCap).
 *
 * @returns {string} "YYYY-MM-DD" (UTC; ISO 8601 date prefix)
 */
export function currentIsoDay() {
  return new Date().toISOString().slice(0, 10);
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
 * Phase 42 AUTOFIX-05 — count of Phase 42 auto-fix iterations recorded against
 * a specific issue fingerprint. Sibling of phaseTotal; same defensive-filter
 * shape, same cross-month iteration, but returns a COUNT rather than a cost
 * sum.
 *
 * Predicate: an iteration entry is counted iff
 *   it.phase === '42-auto-fix'   AND   it.fingerprint === fingerprint
 *
 * Plan 42-02's scripts/auto-fix.mjs dispatcher uses this to cap auto-fix
 * retries at 3 per fingerprint before adding the `human-review-required`
 * label and refusing further auto-fix on that fingerprint (per 42-CONTEXT.md
 * AUTOFIX-05 / fix_attempts decision).
 *
 * Defensive returns (mirror phaseTotal's null-guard pattern):
 *   - null / undefined ledger                  → 0
 *   - missing or non-object ledger.months      → 0
 *   - non-string fingerprint                   → 0
 *   - empty-string fingerprint                 → 0
 *
 * The non-string / empty-string fingerprint guard matters: pre-Phase-42
 * ledger entries do NOT carry a `fingerprint` field at all. If the caller
 * passed undefined and we did NOT guard, `entry.fingerprint === undefined`
 * would be TRUE for every legacy entry — silently counting every Phase 31/32/34
 * call as an auto-fix attempt and triggering the human-review escalation on
 * the first real auto-fix.
 *
 * @param {object} ledger
 * @param {string} fingerprint  e.g. 'deadbeef1234' (first 12 hex of v3.1 fp)
 * @returns {number}  count of matching iterations across all month buckets
 */
export function countFixAttempts(ledger, fingerprint) {
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) return 0;
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let n = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && it.phase === '42-auto-fix' && it.fingerprint === fingerprint) {
        n += 1;
      }
    }
  }
  return n;
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

// ---------------------------------------------------------------------------
// Phase 39 (LEDGER-02 / LEDGER-03) — ledger-v2 helpers (additive, pure)
// ---------------------------------------------------------------------------

/**
 * Phase 39 (LEDGER-03) — sum of cost_usd for all iterations[] entries (across
 * EVERY month bucket) whose `iso` field starts with the requested UTC day.
 *
 * Defensive filtering mirrors phaseTotal: ignores non-finite cost_usd values
 * (NaN, undefined, null, Infinity); ignores entries where iso is not a string.
 * Iterates every month bucket because a single UTC day MAY span two month
 * buckets when the day is at a month boundary (e.g. 2026-05-31 vs 2026-06-01)
 * — but more importantly because `appendLedgerEntry` always routes to
 * `currentMonth()` from the writer's local clock, so reading by iso prefix is
 * the source-of-truth filter.
 *
 * Returns 0 for missing/empty ledgers (mirrors phaseTotal). Result is rounded
 * to 6 decimal places to avoid float drift.
 *
 * @param {object} ledger
 * @param {string} [isoDay=currentIsoDay()]  e.g. "2026-05-30"
 * @returns {number}
 */
export function dayTotal(ledger, isoDay = currentIsoDay()) {
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let sum = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && typeof it.iso === 'string' && it.iso.startsWith(isoDay)
          && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);
}

/**
 * Phase 39 (LEDGER-03) — sum of cost_usd for iterations[] entries tagged with
 * the requested `issueId`. Mirrors phaseTotal exactly in shape and defensive
 * filtering; the only difference is the filter predicate (`it.issueId ===
 * issueId` vs `it.phase === phase`).
 *
 * @param {object} ledger
 * @param {string} issueId  e.g. "issue-123"
 * @returns {number}
 */
export function issueTotal(ledger, issueId) {
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let sum = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && it.issueId === issueId && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);
}

/**
 * Phase 39 (LEDGER-03) — sum of cost_usd for iterations[] entries tagged with
 * the requested `prNumber`. Mirrors issueTotal exactly; filter is strict ===
 * so numeric IDs match without string coercion.
 *
 * @param {object} ledger
 * @param {number} prNumber  e.g. 456
 * @returns {number}
 */
export function prTotal(ledger, prNumber) {
  const months = ledger?.months;
  if (!months || typeof months !== 'object') return 0;
  let sum = 0;
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations;
    if (!Array.isArray(iterations)) continue;
    for (const it of iterations) {
      if (it && it.prNumber === prNumber && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);
}

/**
 * Phase 39 (LEDGER-03) — classify the ledger's per-day spend against the
 * BINARY day cap. Returns `status: 'block'` when total >= DAY_HARD_CAP_USD
 * ($10), otherwise `status: 'ok'`. NO warn state (per 39-CONTEXT lock — sub-
 * caps are binary refusals, not warn/block ramps).
 *
 * Return-shape uses distinct keys (`day_total_usd` / `iso_day`) NOT
 * `monthly_total_usd` / `month` so callers cannot accidentally mix the two
 * views — mirrors the discipline established by checkPhaseSpendCap's
 * `phase_total_usd` / `phase` key choice.
 *
 * @param {object} ledger
 * @param {string} [isoDay=currentIsoDay()]
 * @returns {{ status: 'ok'|'block', day_total_usd: number, iso_day: string, message: string }}
 */
export function checkDayCap(ledger, isoDay = currentIsoDay()) {
  const total = dayTotal(ledger, isoDay);
  if (total >= DAY_HARD_CAP_USD) {
    return {
      status: 'block',
      day_total_usd: total,
      iso_day: isoDay,
      message:
        `Day ${isoDay} LLM spend $${total.toFixed(2)} >= $${DAY_HARD_CAP_USD.toFixed(2)}. ` +
        `Refusing further invocations until next UTC day.`,
    };
  }
  return {
    status: 'ok',
    day_total_usd: total,
    iso_day: isoDay,
    message: '',
  };
}

/**
 * Phase 39 (LEDGER-03) — classify the ledger's per-issue spend against the
 * BINARY issue cap. Mirrors checkDayCap shape; uses `issue_total_usd` and
 * `issue_id` keys.
 *
 * @param {object} ledger
 * @param {string} issueId
 * @returns {{ status: 'ok'|'block', issue_total_usd: number, issue_id: string, message: string }}
 */
export function checkIssueCap(ledger, issueId) {
  const total = issueTotal(ledger, issueId);
  if (total >= ISSUE_HARD_CAP_USD) {
    return {
      status: 'block',
      issue_total_usd: total,
      issue_id: issueId,
      message:
        `Issue ${issueId} LLM spend $${total.toFixed(2)} >= $${ISSUE_HARD_CAP_USD.toFixed(2)}. ` +
        `Refusing further invocations for this issue.`,
    };
  }
  return {
    status: 'ok',
    issue_total_usd: total,
    issue_id: issueId,
    message: '',
  };
}

/**
 * Phase 39 (LEDGER-03) — classify the ledger's per-PR spend against the
 * BINARY PR cap. Mirrors checkDayCap shape; uses `pr_total_usd` and
 * `pr_number` keys.
 *
 * @param {object} ledger
 * @param {number} prNumber
 * @returns {{ status: 'ok'|'block', pr_total_usd: number, pr_number: number, message: string }}
 */
export function checkPrCap(ledger, prNumber) {
  const total = prTotal(ledger, prNumber);
  if (total >= PR_HARD_CAP_USD) {
    return {
      status: 'block',
      pr_total_usd: total,
      pr_number: prNumber,
      message:
        `PR #${prNumber} LLM spend $${total.toFixed(2)} >= $${PR_HARD_CAP_USD.toFixed(2)}. ` +
        `Refusing further invocations for this PR.`,
    };
  }
  return {
    status: 'ok',
    pr_total_usd: total,
    pr_number: prNumber,
    message: '',
  };
}

/**
 * Phase 39 (LEDGER-02) — combined cross-transport monthly total. Since the
 * single committed LEDGER_PATH is shared by BOTH transports (subscription
 * and sdk — Phase 39 design constraint per 39-CONTEXT.md), the bucket's
 * `total_usd` already reflects the combined sum and this helper is presently
 * identical to monthlyTotal().
 *
 * The wrapper exists to (a) signal cap-check intent to readers ("this is the
 * unified-cap reader") and (b) reserve a hook for future per-transport
 * breakdown if the schema ever splits.
 *
 * @param {object} ledger
 * @param {string} [month=currentMonth()]
 * @returns {number}
 */
export function combinedMonthlyTotal(ledger, month = currentMonth()) {
  return monthlyTotal(ledger, month);
}

/**
 * Phase 39 (LEDGER-02) — combined monthly total with per-transport breakdown.
 * Walks iterations[] and partitions cost_usd by entry.transport, returning
 * the original combined total alongside the breakdown for forensic audit.
 *
 * Transport classification (per 39-RESEARCH.md A8 — back-compat default):
 *   - `'sdk'`           → bucket `sdk`
 *   - `'subscription'`  → bucket `subscription`
 *   - absent / missing  → bucket `subscription` (pre-Phase-39 entries were
 *                          all subscription transport; back-compat default)
 *   - any other string  → bucket `unknown` (audit-visible without corrupting
 *                          the combined sum)
 *
 * Returns 0/empty breakdown for missing months. Each per-transport sum is
 * rounded to 6 decimal places (matches the float-drift discipline in
 * monthlyTotal / appendLedgerEntry / phaseTotal).
 *
 * @param {object} ledger
 * @param {string} [month=currentMonth()]
 * @returns {{ combined: number, by_transport: { subscription: number, sdk: number, unknown: number } }}
 */
export function combinedMonthlyTotalByTransport(ledger, month = currentMonth()) {
  const bucket = ledger?.months?.[month];
  const out = {
    combined: bucket?.total_usd ?? 0,
    by_transport: { subscription: 0, sdk: 0, unknown: 0 },
  };
  const iterations = Array.isArray(bucket?.iterations) ? bucket.iterations : [];
  for (const it of iterations) {
    if (!it || !Number.isFinite(it.cost_usd)) continue;
    let key;
    if (it.transport === 'sdk') {
      key = 'sdk';
    } else if (it.transport === 'subscription' || it.transport === undefined || it.transport === null) {
      // Back-compat default per A8: pre-Phase-39 entries without `transport`
      // are subscription. Explicit 'subscription' also maps here.
      key = 'subscription';
    } else {
      key = 'unknown';
    }
    out.by_transport[key] += it.cost_usd;
  }
  for (const k of Object.keys(out.by_transport)) {
    out.by_transport[k] = +out.by_transport[k].toFixed(6);
  }
  return out;
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
 * Entry shape: only `iso`, `model`, and `cost_usd` are required. The
 * function spreads the entry into iterations[] verbatim, so any additional
 * fields the caller provides are preserved on disk.
 *
 * @param {string} ledgerPath
 * @param {{
 *   iso: string,
 *   model: string,
 *   cost_usd: number,
 *   tokens_in?: number,
 *   tokens_out?: number,
 *   iteration_n?: number,
 *   run_id?: string,
 *   phase?: string|null,
 *   source?: string|null,
 * }} entry
 *   Phase 31/32 callers (the picker-prompt invocation loop in
 *   scripts/e2e-explore.mjs) set `iteration_n` and `run_id` so that ledger
 *   entries can be linked back to a specific iteration within a specific
 *   exploration run for forensic reconciliation.
 *   Phase 34 callers (invokeClaudePWithLedger in llm-driver.js) DO NOT pass
 *   `iteration_n` / `run_id` — triage LLM calls are aggregated per cluster
 *   (or per ambiguous Tier-C finding) and don't have a single owning
 *   iteration in the Phase 31 sense; instead they set `source: 'triage'`
 *   so audit-time greps can still partition ledger entries by call site.
 *   Phase 32 (D-14) backward compatibility: the optional `phase` field is
 *   spread through to iterations[] verbatim — legacy callers that omit
 *   `phase` continue to produce valid entries; new callers may set
 *   `phase: '32'` / `'34'` / etc. to feed phaseTotal / checkPhaseSpendCap.
 *
 *   Phase 39 (LEDGER-01) additive optional fields — NO function-body change
 *   required because the `m.iterations.push(entry)` call at the bottom of
 *   this function already spreads the entry verbatim. Documented here so
 *   readers don't have to grep callers to discover the shape:
 *
 *     transport?:               'subscription' | 'sdk'
 *       Distinguishes the two cost-bearing transports added in v4.0.
 *       Absent entries default to 'subscription' in
 *       combinedMonthlyTotalByTransport (back-compat per 39-RESEARCH.md A8).
 *
 *     issueId?:                 string
 *       e.g. 'issue-123' — fed to issueTotal / checkIssueCap for the
 *       per-issue $1 sub-cap (LEDGER-03).
 *
 *     prNumber?:                number
 *       e.g. 456 — fed to prTotal / checkPrCap for the per-PR $2 sub-cap
 *       (LEDGER-03). Strict-=== matching, no string coercion.
 *
 *     cache_creation_tokens?:   number
 *     cache_read_tokens?:       number
 *       SDK-path-only token-usage breakdowns from the Anthropic SDK response
 *       (subscription / claude -p path doesn't expose these distinctly).
 *
 *     error?:                   string
 *       Free-form short error message recorded by invokeAnthropicSdkWithLedger
 *       when the SDK call throws — truncated to ~200 chars by the caller.
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
  //
  // WR-06 (Phase 32 review): fs.renameSync raises EXDEV when the temp file
  // and the destination live on different filesystems — e.g. tmpfs vs the
  // repo's regular FS, or a bind-mounted Docker dev environment. Catch
  // EXDEV and fall back to a direct fs.writeFileSync on the destination
  // (losing the atomic guarantee, but the alternative is the call throwing
  // and the developer hitting a hard failure on any iteration). The temp
  // file is cleaned up best-effort either way.
  const tmpPath = `${ledgerPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2));
  try {
    fs.renameSync(tmpPath, ledgerPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-device rename — fall back to direct write. Lose atomicity but
      // gain the ability to complete the append. The corrupt-on-crash window
      // returns here; caller (single-process developer use) accepts that.
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}

// tests/e2e/lib/safe-append-ledger.js
//
// Phase 62 LEDX-01 — shared safe-append-ledger helper.
//
// Public surface:
//   safeAppendLedger(ledgerPath, entry, opts?)   leak-guarded ledger append
//   VALID_TRANSPORTS                              Set of canonical transport tags
//
// Why this exists:
//   Before Phase 62, the CI/override/subscription-whitelist guard around
//   appendLedgerEntry lived ONLY in scripts/auto-fix.mjs:safeAppendLedger
//   (lines 143-181). Four other call sites wrote the ledger directly:
//     scripts/auto-fix-promote.mjs:521,544 (outcome entries)
//     scripts/e2e-explore.mjs:262,313       (iter + retry entries)
//   Those sites bypassed the Phase 56 LEDGER-02 leak protection. This file
//   ports the proven guard pattern into a shared module the four sites
//   consume. scripts/auto-fix.mjs intentionally still uses its own local
//   wrapper (RESEARCH.md Open Question 1 / Pitfall 62-C) so the Phase 60.1
//   L1+L2 source-grep pins at tests/unit/auto-fix.test.js:1370-1394 remain
//   green by construction.
//
// Design notes:
//   - ledgerPath is an explicit parameter (NOT closure-captured) so callers
//     in different scripts can share this helper while continuing to import
//     LEDGER_PATH from llm-ledger.js (preserves the module-load-time IIFE
//     semantics of LEDGER_PATH; RESEARCH.md Anti-Pattern line 297).
//   - Does NOT re-export LEDGER_PATH — callers continue to import it
//     directly from tests/e2e/lib/llm-ledger.js (existing pattern at
//     auto-fix.mjs:71, auto-fix-promote.mjs:67, e2e-explore.mjs:43).
//   - VALID_TRANSPORTS mirrors the Set in scripts/auto-fix.mjs:205.
//   - Phase 62 NEW: rejects non-canonical `transport` values at the write
//     boundary (Test 5 T_LEDX_INVALID_TRANSPORT). Pre-Phase-39 entries that
//     omit transport entirely are still accepted (transport === undefined).
//   - opts.defaults lets callers wire defaults without mutating the entry
//     literal (preserves source-grep stability of caller entry shapes).
//   - opts.allowOverride (Phase 62 WR-03 fix) is the explicit per-call
//     escape hatch for local `transport: 'sdk'` runs that legitimately need
//     to write the ledger. Setting `allowOverride: true` bypasses the CI
//     gate the same way E2E_LEDGER_PATH_OVERRIDE does, but does NOT bypass
//     transport validation: a non-canonical transport still throws.
//     Intended for the narrow case where a developer running
//     `--transport sdk --force-api` locally wants a real ledger write
//     without exporting the env var. The v3.1/v4.0 subscription-local path
//     remains covered by isSubscriptionLocal and does not require this flag.

import { appendLedgerEntry } from './llm-ledger.js';

/**
 * Set of canonical transport tags. Mirrors scripts/auto-fix.mjs:205 so the
 * shared helper and the auto-fix.mjs local wrapper share the same source of
 * truth at the literal-Set level.
 *
 * @type {Set<string>}
 */
export const VALID_TRANSPORTS = new Set(['sdk', 'subscription']);

/**
 * safeAppendLedger — shared leak-guarded ledger writer (Phase 62 LEDX-01).
 *
 * Refuses to append unless one of:
 *   - process.env.CI === 'true' or GITHUB_ACTIONS === 'true' (CI run)
 *   - process.env.E2E_LEDGER_PATH_OVERRIDE is set (env-var escape hatch)
 *   - opts.allowOverride === true (per-call escape hatch — WR-03 fix)
 *   - merged.transport === 'subscription' (Phase 60.1 whitelist —
 *     preserves the v3.1/v4.0 free-iteration flow)
 *
 * Applies defaults from opts.defaults for missing source/transport BEFORE
 * the gate check (so a caller that omits transport but provides a
 * `defaults.transport: 'subscription'` correctly hits the subscription
 * whitelist branch).
 *
 * @param {string} ledgerPath — typically LEDGER_PATH from llm-ledger.js
 * @param {object} entry — passed to appendLedgerEntry after default-fill
 * @param {object} [opts]
 * @param {object} [opts.defaults] — { source?, transport? } applied if entry omits
 * @param {boolean} [opts.allowOverride=false] — WR-03 fix: per-call escape
 *   hatch that bypasses the CI gate for legitimate local sdk-transport
 *   writes. Does NOT bypass transport validation.
 * @throws {Error} on CI gate failure OR non-canonical transport
 */
export function safeAppendLedger(ledgerPath, entry, opts = {}) {
  const { defaults = {}, allowOverride = false } = opts;
  const merged = {
    ...entry,
    source: entry?.source ?? defaults.source,
    transport: entry?.transport ?? defaults.transport,
  };

  // Phase 62 NEW: transport validation. Reject non-canonical values
  // (anything outside VALID_TRANSPORTS) at the write boundary. `undefined`
  // is still accepted (pre-Phase-39 back-compat).
  if (
    merged.transport !== undefined &&
    !VALID_TRANSPORTS.has(merged.transport)
  ) {
    throw new Error(
      `safeAppendLedger refused: transport '${merged.transport}' is not canonical. ` +
        `Expected one of: ${[...VALID_TRANSPORTS].join(', ')}. ` +
        `Pre-v4.3 entries may omit transport; new sites must self-tag.`,
    );
  }

  // Phase 56 CR-02 (REVIEW.md): align the CI predicate with the canonical
  // form used by tests/e2e/lib/llm-driver.js:387,518 and the
  // tests/e2e/lib/llm-ledger.js:86 LEDGER_PATH IIFE. A bare !process.env.CI
  // truthy check accepts the strings 'false', '0', 'no', etc. as truthy,
  // so a developer who has `export CI=false` in their shell to opt OUT of
  // CI-tagged behavior elsewhere would PASS this guard and leak entries to
  // the committed ledger. The strict form also recognizes GITHUB_ACTIONS
  // as a CI signal (a CI runner that exports only GITHUB_ACTIONS was
  // previously refused). The trim-and-length check on the override mirrors
  // llm-ledger.js:74-98 so a stray whitespace-only override does not
  // accidentally opt in.
  const inCi =
    process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const hasOverride =
    typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
    process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
  // Phase 60.1 (hotfix): the documented v3.1/v4.0 subscription-local path
  // (`npm run fix-issue -- --transport subscription`) writes auxiliary
  // forensic entries from runDispatcher BEFORE invokeClaudePWithLedger
  // writes the cost-bearing entry. Those forensic writes self-tag
  // `transport: 'subscription'` (see runDispatcher resolvedTransport at
  // ~line 762). The Phase 56 leak vector that motivated this guard is
  // local `--force-api` runs that self-tag `transport: 'sdk'`; whitelisting
  // subscription-tagged entries restores the v3.1/v4.0 free-iteration flow
  // while leaving the SDK-path leak protection intact.
  const isSubscriptionLocal = merged && merged.transport === 'subscription';
  // WR-03 fix: opts.allowOverride is the per-call escape hatch. Symmetric
  // with hasOverride (env-var escape hatch) — both bypass the CI gate but
  // NEITHER bypasses transport validation (already enforced above).
  if (!inCi && !hasOverride && !isSubscriptionLocal && !allowOverride) {
    throw new Error(
      `safeAppendLedger refused: cannot write to ${ledgerPath} ` +
        `outside CI. Set process.env.CI=true (CI invocation), ` +
        `process.env.E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json ` +
        `(local integration test), or pass opts.allowOverride=true ` +
        `(local sdk-transport ledger write). This guard protects the ` +
        `committed ledger from local --force-api runs leaking entries ` +
        `(Phase 48 leak vector + Phase 56 LEDGER-02 hardening + Phase 62 LEDX-01; ` +
        `see .planning/research/PITFALLS.md Pitfall 7).`,
    );
  }
  appendLedgerEntry(ledgerPath, merged);
}

// tests/unit/safe-append-ledger.test.js
//
// Phase 62 LEDX-01..04 — covers the shared safeAppendLedger helper.
//
// Why a new file (not appended to llm-ledger.test.js):
//   Per Pitfall 62-A — keeping the new helper's tests in a separate file
//   preserves the 33-test invariant on llm-ledger.test.js (any growth there
//   would obscure whether appendLedgerEntry stayed BYTE-UNCHANGED).
//
// Test IDs:
//   T_LEDX_CI_GATE                       — sdk transport without CI throws
//   T_PHASE60_1_HOTFIX_PRESERVED_SHARED  — subscription whitelist (LEDX-04 invariant)
//   T_LEDX_CI_PASS                       — CI=true allows sdk transport
//   T_LEDX_OVERRIDE_PASS                 — E2E_LEDGER_PATH_OVERRIDE allows sdk
//   T_LEDX_INVALID_TRANSPORT             — non-canonical transport throws
//   T_LEDX_DEFAULTS                      — opts.defaults fills missing fields
//   T_LEDX_APPEND_BODY_PINNED            — appendLedgerEntry body sha256 pinned (LEDX-03)
//   T_LEDX_SITES_WIRED                   — 4 sites consume safeAppendLedger (LEDX-02)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  safeAppendLedger,
  VALID_TRANSPORTS,
} from '../e2e/lib/safe-append-ledger.js';
import { readLedger, currentMonth } from '../e2e/lib/llm-ledger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

let tmpDir;
let tmpLedger;
const SNAPSHOT = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-safe-append-ledger-'));
  tmpLedger = path.join(tmpDir, '.llm-spend-ledger.json');
  SNAPSHOT.CI = process.env.CI;
  SNAPSHOT.GITHUB_ACTIONS = process.env.GITHUB_ACTIONS;
  SNAPSHOT.E2E_LEDGER_PATH_OVERRIDE = process.env.E2E_LEDGER_PATH_OVERRIDE;
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  delete process.env.E2E_LEDGER_PATH_OVERRIDE;
});

afterEach(() => {
  // Restore snapshotted env (do not blindly overwrite — preserve missing-keys
  // distinction so test pollution does not leak into sibling describe blocks).
  for (const k of ['CI', 'GITHUB_ACTIONS', 'E2E_LEDGER_PATH_OVERRIDE']) {
    if (SNAPSHOT[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = SNAPSHOT[k];
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides = {}) {
  return {
    iso: '2026-06-09T12:00:00.000Z',
    model: 'claude-sonnet-4-6',
    cost_usd: 0,
    tokens_in: 0,
    tokens_out: 0,
    iteration_n: 1,
    run_id: 'test-run',
    ...overrides,
  };
}

describe('tests/e2e/lib/safe-append-ledger.js — Phase 62 LEDX-01..04', () => {
  it('T_LEDX_CI_GATE — sdk transport without CI throws', () => {
    expect(() =>
      safeAppendLedger(tmpLedger, makeEntry({ transport: 'sdk', source: 'X' })),
    ).toThrow(/safeAppendLedger refused: cannot write/);
    // Verify the throw came BEFORE any file write happened.
    expect(fs.existsSync(tmpLedger)).toBe(false);
  });

  it('T_PHASE60_1_HOTFIX_PRESERVED_SHARED — subscription transport passes without CI (LEDX-04)', () => {
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'subscription', source: 'X' }),
      ),
    ).not.toThrow();
    expect(fs.existsSync(tmpLedger)).toBe(true);
    const ledger = readLedger(tmpLedger);
    const m = currentMonth();
    expect(ledger.months[m].iterations).toHaveLength(1);
    expect(ledger.months[m].iterations[0]).toMatchObject({
      transport: 'subscription',
      source: 'X',
    });
  });

  it('T_LEDX_CI_PASS — CI=true allows sdk transport', () => {
    process.env.CI = 'true';
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'sdk', source: 'auto-fix-api' }),
      ),
    ).not.toThrow();
    const ledger = readLedger(tmpLedger);
    expect(ledger.months[currentMonth()].iterations).toHaveLength(1);
  });

  it('T_LEDX_OVERRIDE_PASS — E2E_LEDGER_PATH_OVERRIDE allows sdk transport', () => {
    process.env.E2E_LEDGER_PATH_OVERRIDE = tmpLedger;
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'sdk', source: 'auto-fix-api' }),
      ),
    ).not.toThrow();
    const ledger = readLedger(tmpLedger);
    expect(ledger.months[currentMonth()].iterations).toHaveLength(1);
  });

  it('T_LEDX_ALLOW_OVERRIDE_PASS — opts.allowOverride=true allows sdk transport (WR-03 fix)', () => {
    // No CI; no env-var override; sdk transport. Without allowOverride this
    // would throw (covered by T_LEDX_CI_GATE). With allowOverride=true it
    // writes successfully — mirroring E2E_LEDGER_PATH_OVERRIDE behavior at
    // the per-call granularity. Transport validation is still enforced.
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'sdk', source: 'auto-fix-api' }),
        { allowOverride: true },
      ),
    ).not.toThrow();
    const ledger = readLedger(tmpLedger);
    expect(ledger.months[currentMonth()].iterations).toHaveLength(1);
    expect(ledger.months[currentMonth()].iterations[0]).toMatchObject({
      transport: 'sdk',
      source: 'auto-fix-api',
    });
  });

  it('T_LEDX_ALLOW_OVERRIDE_TRANSPORT_STILL_VALIDATED — allowOverride does NOT bypass transport check (WR-03 fix)', () => {
    // allowOverride bypasses ONLY the CI gate. A non-canonical transport
    // still throws — this is the explicit guarantee in the JSDoc.
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'http', source: 'X' }),
        { allowOverride: true },
      ),
    ).toThrow(/transport 'http' is not canonical/);
    expect(fs.existsSync(tmpLedger)).toBe(false);
  });

  it('T_LEDX_INVALID_TRANSPORT — non-canonical transport throws', () => {
    process.env.CI = 'true';
    expect(() =>
      safeAppendLedger(
        tmpLedger,
        makeEntry({ transport: 'http', source: 'X' }),
      ),
    ).toThrow(/transport 'http' is not canonical/);
    // Verify the throw came BEFORE any file write happened.
    expect(fs.existsSync(tmpLedger)).toBe(false);
  });

  it('T_LEDX_DEFAULTS — opts.defaults fills missing source/transport', () => {
    process.env.CI = 'true';
    // Entry MISSING source + transport. Defaults supply both.
    const entry = makeEntry();
    delete entry.source;
    delete entry.transport;
    expect(() =>
      safeAppendLedger(tmpLedger, entry, {
        defaults: { source: 'e2e-explore', transport: 'subscription' },
      }),
    ).not.toThrow();
    const ledger = readLedger(tmpLedger);
    const written = ledger.months[currentMonth()].iterations[0];
    expect(written.source).toBe('e2e-explore');
    expect(written.transport).toBe('subscription');
  });

  it('T_LEDX_APPEND_BODY_PINNED — appendLedgerEntry body sha256 unchanged (LEDX-03)', () => {
    const src = fs.readFileSync(
      path.resolve(REPO_ROOT, 'tests/e2e/lib/llm-ledger.js'),
      'utf8',
    );
    const m = src.match(/export function appendLedgerEntry[\s\S]*?^}/m);
    expect(m).not.toBeNull();
    const hash = crypto.createHash('sha256').update(m[0]).digest('hex');
    // LEDX-03 baseline computed Phase 62 plan-01 — fails on any edit to appendLedgerEntry body
    expect(hash).toBe(
      'd6fa5bac6fd6822b0d9c389b71221ddb46095e46219daaa0e9ec1c931203fc55',
    );
  });

  it('T_LEDX_SITES_WIRED — 4 leak sites route through safeAppendLedger (LEDX-02)', () => {
    // After Phase 62 LEDX-02, the only direct appendLedgerEntry(LEDGER_PATH, ...)
    // call in scripts/ is the canonical one inside scripts/auto-fix.mjs:181
    // (the local wrapper which intentionally still exists per RESEARCH.md
    // Open Question 1). The 4 previously-unguarded sites now route through
    // safeAppendLedger.
    const promoteSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'scripts/auto-fix-promote.mjs'),
      'utf8',
    );
    const exploreSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'scripts/e2e-explore.mjs'),
      'utf8',
    );
    const autoFixSrc = fs.readFileSync(
      path.resolve(REPO_ROOT, 'scripts/auto-fix.mjs'),
      'utf8',
    );

    function countOccurrences(haystack, needle) {
      let count = 0;
      let idx = 0;
      while ((idx = haystack.indexOf(needle, idx)) !== -1) {
        count += 1;
        idx += needle.length;
      }
      return count;
    }

    // Both wire sites in promote.mjs use safeAppendLedger(LEDGER_PATH, ...)
    expect(countOccurrences(promoteSrc, 'safeAppendLedger(LEDGER_PATH')).toBeGreaterThanOrEqual(2);
    // Both wire sites in e2e-explore.mjs use safeAppendLedger(LEDGER_PATH, ...)
    expect(countOccurrences(exploreSrc, 'safeAppendLedger(LEDGER_PATH')).toBeGreaterThanOrEqual(2);
    // The auto-fix.mjs local wrapper still has its single canonical
    // appendLedgerEntry(LEDGER_PATH, entry) at line 181 — UNCHANGED.
    expect(countOccurrences(autoFixSrc, 'appendLedgerEntry(LEDGER_PATH')).toBe(1);

    // Combined invariant: scripts/ total appendLedgerEntry(LEDGER_PATH, ...)
    // calls reduces from 5 (baseline) to 1 (canonical only).
    const totalDirect =
      countOccurrences(promoteSrc, 'appendLedgerEntry(LEDGER_PATH') +
      countOccurrences(exploreSrc, 'appendLedgerEntry(LEDGER_PATH') +
      countOccurrences(autoFixSrc, 'appendLedgerEntry(LEDGER_PATH');
    expect(totalDirect).toBe(1);

    // And the new helper imports are present in both wire scripts.
    expect(promoteSrc).toMatch(
      /import\s*\{[^}]*safeAppendLedger[^}]*\}\s*from\s*['"]\.\.\/tests\/e2e\/lib\/safe-append-ledger\.js['"]/,
    );
    expect(exploreSrc).toMatch(
      /import\s*\{[^}]*safeAppendLedger[^}]*\}\s*from\s*['"]\.\.\/tests\/e2e\/lib\/safe-append-ledger\.js['"]/,
    );
  });

  it('Sanity: VALID_TRANSPORTS exported as a Set containing sdk + subscription', () => {
    expect(VALID_TRANSPORTS).toBeInstanceOf(Set);
    expect(VALID_TRANSPORTS.has('sdk')).toBe(true);
    expect(VALID_TRANSPORTS.has('subscription')).toBe(true);
    expect(VALID_TRANSPORTS.size).toBe(2);
  });
});

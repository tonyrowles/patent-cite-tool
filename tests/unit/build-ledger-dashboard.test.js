// tests/unit/build-ledger-dashboard.test.js
//
// Phase 46 Plan 02 (AUTOFIX-06) — Vitest coverage for the deterministic
// ledger dashboard generator at scripts/build-ledger-dashboard.mjs.
//
// 11 cases:
//   1  deterministic output (byte-stable across two calls)
//   2  table shape — by transport (sdk / subscription / Total with %)
//   3  table shape — by day (ASC by ISO day)
//   4  table shape — by phase (DESC by spend, ASC by phase name tiebreak)
//   5  Generated derived from ledger max iso (NEVER new Date())
//   6  currency + percent formatting ($N.NN, N.N%)
//   7  trailing newline (exactly one \n at EOF)
//   8  cap status header (ok / warn / block thresholds)
//   9  privacy regex sweep — current committed ledger scores ZERO hits across 6 patterns
//   10 forbidden import — scripts/build-ledger-dashboard.mjs MUST NOT import appendLedgerEntry
//   11 atomic write — temp+rename pattern; no partial file on failure
//
// Convention follows tests/unit/auto-fix.test.js (Vitest + describe/it/expect).
//
// The fixture ledgers in cases 1-8 are built inline so each test owns its own
// minimal data; the privacy sweep (case 9) reads the REAL committed ledger.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  buildDashboardMarkdown,
  writeAtomic,
} from '../../scripts/build-ledger-dashboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/build-ledger-dashboard.mjs');
const COMMITTED_LEDGER = path.resolve(PROJECT_ROOT, 'tests/e2e/.llm-spend-ledger.json');

// Locked 6-pattern privacy regex bank (from 46-RESEARCH.md / 46-02-PLAN.md
// <interfaces> block). Used by case 9 (forensic sweep against committed ledger)
// AND by docs/v40-ledger-privacy-audit.md (which records the human-readable
// verdict). Mirroring the same bank in both places is intentional — if either
// drifts, the audit doc and the automated guard fall out of sync.
const PRIVACY_PATTERNS = [
  { name: 'anthropicApiKey', regex: /sk-ant-[A-Za-z0-9-]{20,}/g },
  { name: 'genericApiKey', regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'emailRfc5322', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { name: 'localUserPath', regex: /\/home\/[^/\s"]+\//g },
  { name: 'windowsUserPath', regex: /[A-Z]:\\Users\\[^\\\s"]+\\/g },
  { name: 'ipv4Octet', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
];

// Helper — build a ledger bucket from a list of iteration entries. Computes
// total_usd, invocations, last_invocation_iso from the entries (mirrors what
// appendLedgerEntry would do over many calls).
function bucket(entries) {
  const total = entries.reduce(
    (acc, e) => acc + (Number.isFinite(e.cost_usd) ? e.cost_usd : 0),
    0,
  );
  const isos = entries.map((e) => e.iso).filter((s) => typeof s === 'string');
  const lastIso = isos.length ? isos.reduce((a, b) => (a > b ? a : b)) : null;
  return {
    invocations: entries.length,
    total_usd: +total.toFixed(6),
    last_invocation_iso: lastIso,
    iterations: entries,
  };
}

describe('build-ledger-dashboard', () => {
  describe('determinism', () => {
    it('1 — buildDashboardMarkdown returns byte-identical output across two calls', () => {
      const ledger = {
        version: 1,
        months: {
          '2026-05': bucket([
            { iso: '2026-05-30T10:00:00.000Z', model: 'sonnet', cost_usd: 0.10, phase: '46', transport: 'sdk' },
            { iso: '2026-05-30T11:00:00.000Z', model: 'sonnet', cost_usd: 0.20, phase: '46', transport: 'subscription' },
          ]),
        },
      };
      const a = buildDashboardMarkdown(ledger, { month: '2026-05' });
      const b = buildDashboardMarkdown(ledger, { month: '2026-05' });
      expect(a).toBe(b);
    });
  });

  describe('markdown shape', () => {
    it('2 — By Transport table sums sdk=$1.00, subscription=$0.75, Total=$1.75 with correct shares', () => {
      const ledger = {
        version: 1,
        months: {
          '2026-05': bucket([
            { iso: '2026-05-30T10:00:00.000Z', model: 'm', cost_usd: 1.00, phase: '46', transport: 'sdk' },
            { iso: '2026-05-30T11:00:00.000Z', model: 'm', cost_usd: 0.50, phase: '46', transport: 'subscription' },
            { iso: '2026-05-30T12:00:00.000Z', model: 'm', cost_usd: 0.25, phase: '46' /* no transport -> subscription */ },
          ]),
        },
      };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      expect(md).toContain('## By Transport (current month)');
      // sdk row: $1.00 / share 57.1%
      expect(md).toMatch(/\|\s*sdk\s*\|\s*\$1\.00\s*\|\s*57\.1%/);
      // subscription row: $0.75 / share 42.9%
      expect(md).toMatch(/\|\s*subscription\s*\|\s*\$0\.75\s*\|\s*42\.9%/);
      // Total row: $1.75 / 100%
      expect(md).toMatch(/\|\s*\*\*Total\*\*\s*\|\s*\*\*\$1\.75\*\*\s*\|\s*\*\*100\.0%\*\*/);
    });

    it('3 — By Day rows are ASC by ISO day and reflect counts + spends', () => {
      const ledger = {
        version: 1,
        months: {
          '2026-05': bucket([
            { iso: '2026-05-30T08:00:00.000Z', model: 'm', cost_usd: 0.10, phase: '46', transport: 'sdk' },
            { iso: '2026-05-29T08:00:00.000Z', model: 'm', cost_usd: 0.20, phase: '46', transport: 'sdk' },
            { iso: '2026-05-30T09:00:00.000Z', model: 'm', cost_usd: 0.05, phase: '46', transport: 'sdk' },
          ]),
        },
      };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      // Anchor on the row form `| YYYY-MM-DD |` to avoid matching the
      // Generated: iso prefix earlier in the document.
      const idx29 = md.search(/\|\s*2026-05-29\s*\|/);
      const idx30 = md.search(/\|\s*2026-05-30\s*\|/);
      expect(idx29).toBeGreaterThan(-1);
      expect(idx30).toBeGreaterThan(-1);
      expect(idx29).toBeLessThan(idx30);
      // day 29: 1 invocation, $0.20
      expect(md).toMatch(/\|\s*2026-05-29\s*\|\s*1\s*\|\s*\$0\.20/);
      // day 30: 2 invocations, $0.15
      expect(md).toMatch(/\|\s*2026-05-30\s*\|\s*2\s*\|\s*\$0\.15/);
    });

    it('4 — By Phase rows: DESC by spend; ties broken ASC by phase name; cap status per row', () => {
      const ledger = {
        version: 1,
        months: {
          '2026-05': bucket([
            // phase A: $9.00 — warn (>= $8)
            { iso: '2026-05-30T10:00:00.000Z', model: 'm', cost_usd: 9.00, phase: 'A', transport: 'sdk' },
            // phase B: $11.00 — block (>= $10)
            { iso: '2026-05-30T11:00:00.000Z', model: 'm', cost_usd: 11.00, phase: 'B', transport: 'sdk' },
            // phase C: $1.00 — ok
            { iso: '2026-05-30T12:00:00.000Z', model: 'm', cost_usd: 1.00, phase: 'C', transport: 'sdk' },
            // phase D: $1.00 — ok (ties with C; D should sort AFTER C alphabetically)
            { iso: '2026-05-30T13:00:00.000Z', model: 'm', cost_usd: 1.00, phase: 'D', transport: 'sdk' },
          ]),
        },
      };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      // Order must be: B ($11, block), A ($9, warn), C ($1, ok), D ($1, ok).
      const idxB = md.indexOf('| B |');
      const idxA = md.indexOf('| A |');
      const idxC = md.indexOf('| C |');
      const idxD = md.indexOf('| D |');
      expect(idxB).toBeGreaterThan(-1);
      expect(idxA).toBeGreaterThan(idxB);
      expect(idxC).toBeGreaterThan(idxA);
      expect(idxD).toBeGreaterThan(idxC);
      // Status column checks
      expect(md).toMatch(/\|\s*B\s*\|\s*\$11\.00\s*\|\s*\$10\.00\s*\|\s*block\s*\|/);
      expect(md).toMatch(/\|\s*A\s*\|\s*\$9\.00\s*\|\s*\$10\.00\s*\|\s*warn/);
      expect(md).toMatch(/\|\s*C\s*\|\s*\$1\.00\s*\|\s*\$10\.00\s*\|\s*ok\s*\|/);
    });

    it('5 — Generated line derives from ledger MAX iso (current-month preferred, then global, else "no ledger entries")', () => {
      // (a) current-month preferred
      const ledger = {
        version: 1,
        months: {
          '2026-04': bucket([
            { iso: '2026-04-01T00:00:00.000Z', model: 'm', cost_usd: 0.01, phase: '46', transport: 'sdk' },
          ]),
          '2026-05': bucket([
            { iso: '2026-05-15T08:00:00.000Z', model: 'm', cost_usd: 0.10, phase: '46', transport: 'sdk' },
            { iso: '2026-05-30T08:00:00.000Z', model: 'm', cost_usd: 0.10, phase: '46', transport: 'sdk' },
          ]),
        },
      };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      expect(md).toContain('**Generated:** 2026-05-30T08:00:00.000Z');

      // (b) current-month empty → global max iso
      const ledgerB = {
        version: 1,
        months: {
          '2026-04': bucket([
            { iso: '2026-04-05T00:00:00.000Z', model: 'm', cost_usd: 0.01, phase: '46', transport: 'sdk' },
          ]),
        },
      };
      const mdB = buildDashboardMarkdown(ledgerB, { month: '2026-05' });
      expect(mdB).toContain('**Generated:** 2026-04-05T00:00:00.000Z');

      // (c) empty ledger
      const mdC = buildDashboardMarkdown({ version: 1, months: {} }, { month: '2026-05' });
      expect(mdC).toContain('**Generated:** (no ledger entries)');
    });

    it('6 — currency formatted $N.NN; percentages formatted N.N%', () => {
      const ledger = {
        version: 1,
        months: {
          '2026-05': bucket([
            { iso: '2026-05-30T08:00:00.000Z', model: 'm', cost_usd: 0.333, phase: '46', transport: 'sdk' },
            { iso: '2026-05-30T09:00:00.000Z', model: 'm', cost_usd: 0.667, phase: '46', transport: 'subscription' },
          ]),
        },
      };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      // All currency strings have exactly two decimals
      const currencyMatches = md.match(/\$\d+\.\d+/g) || [];
      expect(currencyMatches.length).toBeGreaterThan(0);
      for (const c of currencyMatches) {
        expect(c).toMatch(/^\$\d+\.\d{2}$/);
      }
      // All percent strings have exactly one decimal
      const pctMatches = md.match(/\d+\.\d+%/g) || [];
      expect(pctMatches.length).toBeGreaterThan(0);
      for (const p of pctMatches) {
        expect(p).toMatch(/^\d+\.\d{1}%$/);
      }
    });

    it('7 — output ends with exactly one trailing newline', () => {
      const ledger = { version: 1, months: {} };
      const md = buildDashboardMarkdown(ledger, { month: '2026-05' });
      expect(md.endsWith('\n')).toBe(true);
      expect(md.endsWith('\n\n')).toBe(false);
    });

    it('8 — cap status: <$80 → ok; $80-$99.99 → warn; >=$100 → block', () => {
      const mk = (totalDollars) => ({
        version: 1,
        months: {
          '2026-05': bucket([
            { iso: '2026-05-30T08:00:00.000Z', model: 'm', cost_usd: totalDollars, phase: '46', transport: 'sdk' },
          ]),
        },
      });
      const ok = buildDashboardMarkdown(mk(50), { month: '2026-05' });
      const warn = buildDashboardMarkdown(mk(85), { month: '2026-05' });
      const block = buildDashboardMarkdown(mk(120), { month: '2026-05' });
      expect(ok).toMatch(/Status:\s*ok/);
      expect(warn).toMatch(/Status:\s*warn/);
      expect(block).toMatch(/Status:\s*block/);
    });
  });

  describe('privacy regex sweep', () => {
    it('9 — current committed ledger scores ZERO hits across all 6 patterns', () => {
      const content = fs.readFileSync(COMMITTED_LEDGER, 'utf8');
      const findings = {};
      for (const p of PRIVACY_PATTERNS) {
        const hits = content.match(p.regex) || [];
        findings[p.name] = hits.length;
      }
      // All 6 must be zero. If any pattern hits, the test will report which
      // and the audit doc's PASS verdict needs to flip.
      expect(findings).toEqual({
        anthropicApiKey: 0,
        genericApiKey: 0,
        emailRfc5322: 0,
        localUserPath: 0,
        windowsUserPath: 0,
        ipv4Octet: 0,
      });
    });
  });

  describe('forbidden imports', () => {
    it('10 — scripts/build-ledger-dashboard.mjs does NOT import appendLedgerEntry (read-only invariant)', () => {
      const src = fs.readFileSync(SCRIPT_PATH, 'utf8');
      expect(src.includes('appendLedgerEntry')).toBe(false);
    });
  });

  describe('atomic write', () => {
    it('11 — writeAtomic(path, content) writes content; uses temp+rename so partial files are not visible', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-dash-'));
      const outPath = path.join(tmpDir, 'dash.md');
      writeAtomic(outPath, 'hello dashboard\n');
      const got = fs.readFileSync(outPath, 'utf8');
      expect(got).toBe('hello dashboard\n');
      // No leftover .tmp.<pid> files in the dir
      const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
      expect(leftovers).toEqual([]);
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

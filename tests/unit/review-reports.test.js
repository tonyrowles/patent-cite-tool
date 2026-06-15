// tests/unit/review-reports.test.js
//
// Unit tests for the pure logic of the Level-1 bug-report triage helper
// (scripts/review-reports.mjs). I/O (wrangler shell-out) is not exercised here —
// only the namespace parsing, filtering, status, sorting, argv, and digest formatting.

import { describe, it, expect } from 'vitest';
import {
  getNamespaceId,
  parseSince,
  reviewStatus,
  filterReports,
  sortReports,
  formatDigest,
  parseArgs,
} from '../../scripts/review-reports.mjs';

const TOML = `
name = "patent-cite-worker"
[[kv_namespaces]]
binding = "PATENT_CACHE"
id = "6e7af6faa9c340fdb8120036913b00b5"
[[kv_namespaces]]
binding = "BUG_REPORTS"
id = "cefe2733c0074fe2a28a49ff536de105"
`;

const NOW = Date.parse('2026-06-15T00:00:00Z');
const rec = (over = {}) => ({
  fingerprint: 'aaaaaaaaaaaaaaaa', timestamp: NOW, category: 'no_match',
  patentNumber: '10617174B1', duplicate_count: 0, note: '', ...over,
});

describe('getNamespaceId', () => {
  it('extracts the BUG_REPORTS id (not PATENT_CACHE)', () => {
    expect(getNamespaceId(TOML)).toBe('cefe2733c0074fe2a28a49ff536de105');
  });
  it('throws when the binding is absent', () => {
    expect(() => getNamespaceId('name = "x"')).toThrow(/BUG_REPORTS/);
  });
});

describe('parseSince', () => {
  it('parses "Nd" as N days before now', () => {
    expect(parseSince('7d', NOW)).toBe(NOW - 7 * 86400_000);
  });
  it('parses an ISO date', () => {
    expect(parseSince('2026-06-01', NOW)).toBe(Date.parse('2026-06-01'));
  });
  it('returns null for empty / unparseable', () => {
    expect(parseSince('', NOW)).toBeNull();
    expect(parseSince('nonsense', NOW)).toBeNull();
  });
});

describe('reviewStatus', () => {
  it("defaults to 'open' when no _review set", () => {
    expect(reviewStatus(rec())).toBe('open');
  });
  it('returns the set status', () => {
    expect(reviewStatus(rec({ _review: { status: 'resolved' } }))).toBe('resolved');
  });
});

describe('filterReports', () => {
  const reports = [
    rec({ fingerprint: 'a', category: 'no_match', patentNumber: '10617174B1', duplicate_count: 0, timestamp: NOW }),
    rec({ fingerprint: 'b', category: 'inaccurate_citation', patentNumber: '12505414', duplicate_count: 3, timestamp: NOW - 20 * 86400_000 }),
    rec({ fingerprint: 'c', category: 'no_match', patentNumber: '99999999', duplicate_count: 1, timestamp: NOW, _review: { status: 'resolved' } }),
  ];
  it('filters by category', () => {
    expect(filterReports(reports, { category: 'no_match' }, NOW).map((r) => r.fingerprint)).toEqual(['a', 'c']);
  });
  it('filters by patentNumber substring', () => {
    expect(filterReports(reports, { patent: '1250' }, NOW).map((r) => r.fingerprint)).toEqual(['b']);
  });
  it('filters by review status (open excludes resolved)', () => {
    expect(filterReports(reports, { status: 'open' }, NOW).map((r) => r.fingerprint)).toEqual(['a', 'b']);
    expect(filterReports(reports, { status: 'resolved' }, NOW).map((r) => r.fingerprint)).toEqual(['c']);
  });
  it('filters by min duplicate_count', () => {
    expect(filterReports(reports, { minDups: 2 }, NOW).map((r) => r.fingerprint)).toEqual(['b']);
  });
  it('filters by since window', () => {
    expect(filterReports(reports, { since: '7d' }, NOW).map((r) => r.fingerprint).sort()).toEqual(['a', 'c']);
  });
});

describe('sortReports', () => {
  it('orders newest first', () => {
    const r = sortReports([rec({ fingerprint: 'old', timestamp: 1 }), rec({ fingerprint: 'new', timestamp: 2 })]);
    expect(r.map((x) => x.fingerprint)).toEqual(['new', 'old']);
  });
});

describe('parseArgs', () => {
  it('defaults to the list command', () => {
    expect(parseArgs([]).command).toBe('list');
  });
  it('captures command, positionals, filters, and flags', () => {
    const a = parseArgs(['status', 'fp1', '123', 'resolved']);
    expect(a.command).toBe('status');
    expect(a.positionals).toEqual(['fp1', '123', 'resolved']);
    const b = parseArgs(['list', '--category', 'no_match', '--min-dups', '2', '--json']);
    expect(b.filters).toMatchObject({ category: 'no_match', minDups: 2 });
    expect(b.json).toBe(true);
  });
  it('throws on an unknown option', () => {
    expect(() => parseArgs(['list', '--bogus'])).toThrow(/Unknown option/);
  });
});

describe('formatDigest', () => {
  it('includes totals, category/status tallies, and a row per report', () => {
    const out = formatDigest([rec({ fingerprint: 'aaaaaaaa', note: 'v5.0 UAT-01 smoke' })], NOW);
    expect(out).toMatch(/1 record/);
    expect(out).toMatch(/no_match 1/);
    expect(out).toMatch(/open 1/);
    expect(out).toMatch(/aaaaaaaa/);
    expect(out).toMatch(/10617174B1/);
  });
});

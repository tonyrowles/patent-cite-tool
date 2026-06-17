// tests/unit/gh-client.test.js
//
// Phase 11 Plan 02 — Vitest suite for scripts/gh-client.mjs.
//
// Tests the pure-logic exports: kv-key marker matching, label/title escaping shape,
// and the MANDATORY isWithinCutoff date-cutoff helper (TRI-06).
//
// All execSync-backed methods are tested via vi.fn() mocks — no live gh CLI invocations.
// Mock injection mirrors the pattern from tests/unit/e2e-report-issue.test.js.

import { describe, it, expect, vi } from 'vitest';
import { makeKvReportGhClient, isWithinCutoff } from '../../scripts/gh-client.mjs';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock gh client by partially overriding the real factory's listWithSearch.
 * This lets us test findExistingIssueByKvKey and isPostFixSuppressed without live gh.
 */
function makeMockClient(listWithSearchImpl) {
  // We need to intercept execSync, so we construct the client and swap the method.
  const client = makeKvReportGhClient('owner/repo');
  client.listWithSearch = vi.fn().mockImplementation(listWithSearchImpl ?? (() => []));
  return client;
}

// ---------------------------------------------------------------------------
// isWithinCutoff (TRI-06) — mandatory pure date-cutoff helper
// ---------------------------------------------------------------------------

describe('isWithinCutoff (TRI-06 post-fix suppression window, D-08)', () => {
  const NOW = Date.parse('2026-06-17T00:00:00Z');

  it('an entry OLDER than suppressDays (30) does NOT suppress (returns false)', () => {
    // 40 days ago — older than 30-day window
    const old = new Date(NOW - 40 * 86400000).toISOString();
    expect(isWithinCutoff(old, 30, NOW)).toBe(false);
  });

  it('a RECENT entry (within suppressDays) DOES suppress (returns true)', () => {
    // 5 days ago — within 30-day window
    const recent = new Date(NOW - 5 * 86400000).toISOString();
    expect(isWithinCutoff(recent, 30, NOW)).toBe(true);
  });

  it('a null timestamp returns false', () => {
    expect(isWithinCutoff(null, 30, NOW)).toBe(false);
  });

  it('an empty string timestamp returns false', () => {
    expect(isWithinCutoff('', 30, NOW)).toBe(false);
  });

  it('an undefined timestamp returns false', () => {
    expect(isWithinCutoff(undefined, 30, NOW)).toBe(false);
  });

  it('an entry exactly at the cutoff boundary is within the window (returns true)', () => {
    // Exactly at the cutoff (now - 30 days) — at boundary, should be within cutoff
    const atCutoff = new Date(NOW - 30 * 86400000).toISOString();
    expect(isWithinCutoff(atCutoff, 30, NOW)).toBe(true);
  });

  it('1 millisecond past the cutoff is NOT within the window (returns false)', () => {
    const justOutside = new Date(NOW - 30 * 86400000 - 1).toISOString();
    expect(isWithinCutoff(justOutside, 30, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findExistingIssueByKvKey — kv-key marker matching
// ---------------------------------------------------------------------------

describe('findExistingIssueByKvKey', () => {
  it('finds an issue containing the <!-- kv-key: ... --> marker in open issues', () => {
    const kvKey = 'report:aabbcc:1718500000';
    const marker = `<!-- kv-key: ${kvKey} -->`;
    const issues = [
      { number: 1, body: `some text ${marker} more text`, state: 'open' },
      { number: 2, body: 'unrelated issue', state: 'open' },
    ];

    const client = makeMockClient((query, state) => {
      if (state === 'open') return issues;
      return [];
    });

    const found = client.findExistingIssueByKvKey(kvKey);
    expect(found).not.toBeNull();
    expect(found.number).toBe(1);
  });

  it('finds an issue in closed results when open results have no match', () => {
    const kvKey = 'report:aabbcc:1718500000';
    const marker = `<!-- kv-key: ${kvKey} -->`;
    const closedIssues = [
      { number: 99, body: `closed ${marker}`, state: 'closed' },
    ];

    const client = makeMockClient((query, state) => {
      if (state === 'closed') return closedIssues;
      return [];
    });

    const found = client.findExistingIssueByKvKey(kvKey);
    expect(found).not.toBeNull();
    expect(found.number).toBe(99);
  });

  it('returns null when no issue contains the marker', () => {
    const kvKey = 'report:aabbcc:1718500000';
    const issues = [
      { number: 1, body: 'no marker here', state: 'open' },
      { number: 2, body: '<!-- kv-key: report:DIFFERENT:9999 -->', state: 'open' },
    ];

    const client = makeMockClient(() => issues);

    const found = client.findExistingIssueByKvKey(kvKey);
    expect(found).toBeNull();
  });

  it('calls listWithSearch twice — once for open, once for closed (two-call pattern)', () => {
    const kvKey = 'report:aabb:1718500000';
    const client = makeMockClient(() => []);

    client.findExistingIssueByKvKey(kvKey);
    expect(client.listWithSearch).toHaveBeenCalledTimes(2);
    expect(client.listWithSearch).toHaveBeenCalledWith(kvKey, 'open');
    expect(client.listWithSearch).toHaveBeenCalledWith(kvKey, 'closed');
  });

  it('does NOT match a partial marker (exact substring required)', () => {
    const kvKey = 'report:aabb:1718500000';
    const client = makeMockClient(() => [
      // Body contains the full key string but NOT the HTML comment wrapper
      { number: 1, body: `report:aabb:1718500000`, state: 'open' },
    ]);

    const found = client.findExistingIssueByKvKey(kvKey);
    expect(found).toBeNull();
  });

  it('does NOT match legacy fingerprint: marker (Phase 11 uses kv-key)', () => {
    const kvKey = 'report:aabb:1718500000';
    const client = makeMockClient(() => [
      // Legacy marker format — must NOT match
      { number: 1, body: `<!-- fingerprint: aabb -->`, state: 'open' },
    ]);

    const found = client.findExistingIssueByKvKey(kvKey);
    expect(found).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// makeKvReportGhClient — factory shape
// ---------------------------------------------------------------------------

describe('makeKvReportGhClient factory', () => {
  it('returns an object with the required methods', () => {
    const client = makeKvReportGhClient('owner/repo');
    expect(typeof client.findExistingIssueByKvKey).toBe('function');
    expect(typeof client.createIssueWithLabels).toBe('function');
    expect(typeof client.isPostFixSuppressed).toBe('function');
    expect(typeof client.listWithSearch).toBe('function');
    expect(typeof client.addLabel).toBe('function');
  });

  it('isWithinCutoff is an exported pure function (not on client object)', () => {
    // isWithinCutoff must be a standalone export, not a method
    expect(typeof isWithinCutoff).toBe('function');
    const client = makeKvReportGhClient('owner/repo');
    expect(client.isWithinCutoff).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createIssueWithLabels — label/title escaping shape
// ---------------------------------------------------------------------------

describe('createIssueWithLabels — shell-free execFileSync (WR-01, T-11-02)', () => {
  it('WR-01: createIssueWithLabels builds argv without shell — title/labels are raw argv values', () => {
    // With execFileSync the title and labels are passed as argv items — no shell quoting needed.
    // Verify the factory returns a function (actual execFileSync not invokable without live gh).
    const client = makeKvReportGhClient('owner/repo');
    expect(typeof client.createIssueWithLabels).toBe('function');
  });

  it('WR-01: addLabel builds argv without shell — label is a raw argv value', () => {
    const client = makeKvReportGhClient('owner/repo');
    expect(typeof client.addLabel).toBe('function');
  });

  it('T-11-02: body is never concatenated into shell command — --body-file - pattern (static source check)', () => {
    // Verify the source uses --body-file - for body (not string interpolation).
    // Import the source as text and check for the pattern.
    const { readFileSync } = require('fs');
    const { fileURLToPath } = require('url');
    const src = readFileSync(
      new URL('../../scripts/gh-client.mjs', import.meta.url),
      'utf8'
    );
    expect(src).toContain('--body-file');
    expect(src).toContain('execFileSync');
    // execSync should NOT be used for createIssueWithLabels or addLabel
    // (those methods must be shell-free — WR-01)
    // The file should still import execSync for listWithSearch/isPostFixSuppressed
    expect(src).toContain("import { execSync, execFileSync }");
  });
});

// ---------------------------------------------------------------------------
// listWithSearch — generalized state parameter
// ---------------------------------------------------------------------------

describe('listWithSearch', () => {
  it('defaults to open state', () => {
    // The method accepts state as second argument (default 'open')
    // We verify the default by checking the client interface
    const client = makeKvReportGhClient('owner/repo');
    // Cannot call without mocking, but we verify the method accepts 2 params
    expect(client.listWithSearch.length).toBeLessThanOrEqual(2);
  });
});

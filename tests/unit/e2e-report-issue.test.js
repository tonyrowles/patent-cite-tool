// tests/unit/e2e-report-issue.test.js
//
// Phase 29 Plan 02 — Vitest suite for scripts/e2e-report-issue.mjs.
//
// Tests pure-function exports (no real gh CLI invocations). Uses dependency
// injection via processReport's ghClient parameter to intercept all gh calls.
//
// Coverage:
//   - fingerprint(): determinism, length, collision-resistance, null handling
//   - sanitizeCaseId(): valid passthrough, shell metachar rejection, markdown injection rejection
//   - filterCasesForFiling(): excludes passed/skipped/FLAKE; includes failed non-FLAKE
//   - buildIssueTitle() / buildIssueBody(): format, required sections, fingerprint comment, sanitization
//   - isRecentlyUpdated(): staleness window, MAX_RECENT_DAYS constant
//   - findMatchingIssue(): fingerprint grep, null on miss
//   - processReport(): end-to-end dispatch — 1 comment + 1 create for fixture; zero issues when no failures

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprint,
  sanitizeCaseId,
  buildIssueBody,
  buildIssueTitle,
  filterCasesForFiling,
  findMatchingIssue,
  isRecentlyUpdated,
  processReport,
  MAX_RECENT_DAYS,
} from '../../scripts/e2e-report-issue.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_FIXTURE = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/sample-report.json'), 'utf8'));
const ISSUES_FIXTURE_RAW = readFileSync(path.join(__dirname, 'fixtures/sample-issues.json'), 'utf8');

// ---------------------------------------------------------------------------
// fingerprint()
// ---------------------------------------------------------------------------

describe('fingerprint()', () => {
  it('is deterministic — same inputs produce same output', () => {
    const a = fingerprint('US11427642-claims-1', 'VERIFIER_DISAGREE', null);
    const b = fingerprint('US11427642-claims-1', 'VERIFIER_DISAGREE', null);
    expect(a).toBe(b);
  });

  it('is 12 hex chars', () => {
    const fp = fingerprint('US11427642-claims-1', 'VERIFIER_DISAGREE', null);
    expect(fp).toMatch(/^[a-f0-9]{12}$/);
  });

  it('different errorClass produces different fingerprint', () => {
    const a = fingerprint('US11427642-claims-1', 'WRONG_CITATION', null);
    const b = fingerprint('US11427642-claims-1', 'VERIFIER_DISAGREE', null);
    expect(a).not.toBe(b);
  });

  it('null topOfStackHash treated as empty string', () => {
    const a = fingerprint('X', 'Y', null);
    const b = fingerprint('X', 'Y', '');
    expect(a).toBe(b);
  });

  it('different caseId produces different fingerprint', () => {
    const a = fingerprint('US11427642-claims-1', 'WRONG_CITATION', null);
    const b = fingerprint('US4723129-claims-1', 'WRONG_CITATION', null);
    expect(a).not.toBe(b);
  });

  it('different topOfStackHash produces different fingerprint', () => {
    const a = fingerprint('US11427642-claims-1', 'WRONG_CITATION', 'abc');
    const b = fingerprint('US11427642-claims-1', 'WRONG_CITATION', 'def');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// sanitizeCaseId()
// ---------------------------------------------------------------------------

describe('sanitizeCaseId()', () => {
  it('passes valid alphanumeric IDs', () => {
    expect(sanitizeCaseId('US11427642-claims-1')).toBe('US11427642-claims-1');
  });

  it('passes valid spec-short IDs', () => {
    expect(sanitizeCaseId('US4723129-claims-1')).toBe('US4723129-claims-1');
  });

  it('rejects IDs with shell metacharacters', () => {
    expect(() => sanitizeCaseId('US123;rm -rf')).toThrow();
    expect(() => sanitizeCaseId('US123$(whoami)')).toThrow();
    expect(() => sanitizeCaseId('US123`echo`')).toThrow();
    expect(() => sanitizeCaseId('US123\nINJECTED')).toThrow();
  });

  it('rejects IDs with markdown injection chars', () => {
    expect(() => sanitizeCaseId('US123<script>')).toThrow();
    expect(() => sanitizeCaseId('US123]]')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => sanitizeCaseId('')).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => sanitizeCaseId(null)).toThrow();
    expect(() => sanitizeCaseId(42)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// filterCasesForFiling()
// ---------------------------------------------------------------------------

describe('filterCasesForFiling()', () => {
  it('excludes passed cases', () => {
    const filtered = filterCasesForFiling(REPORT_FIXTURE.cases);
    expect(filtered.find(c => c.id === 'US11427642-spec-short-1')).toBeUndefined();
  });

  it('excludes skipped cases', () => {
    const filtered = filterCasesForFiling(REPORT_FIXTURE.cases);
    expect(filtered.find(c => c.id === 'US5371234-chemical-cross-col')).toBeUndefined();
  });

  it('excludes FLAKE errorClass cases', () => {
    const filtered = filterCasesForFiling(REPORT_FIXTURE.cases);
    expect(filtered.find(c => c.id === 'US10592688-spec-short')).toBeUndefined();
  });

  it('includes failed WRONG_CITATION and VERIFIER_DISAGREE cases', () => {
    const filtered = filterCasesForFiling(REPORT_FIXTURE.cases);
    expect(filtered.length).toBe(2);
    expect(filtered.map(c => c.id).sort()).toEqual(['US11427642-claims-1', 'US4723129-claims-1']);
  });

  it('returns empty array when given empty cases', () => {
    expect(filterCasesForFiling([])).toEqual([]);
  });

  it('returns empty array when given null/undefined', () => {
    expect(filterCasesForFiling(null)).toEqual([]);
    expect(filterCasesForFiling(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildIssueTitle() / buildIssueBody()
// ---------------------------------------------------------------------------

describe('buildIssueTitle() / buildIssueBody()', () => {
  it('title follows [e2e-nightly] {caseId}: {errorClass} format', () => {
    const failingCase = REPORT_FIXTURE.cases.find(c => c.id === 'US4723129-claims-1');
    const title = buildIssueTitle(failingCase);
    expect(title).toBe('[e2e-nightly] US4723129-claims-1: WRONG_CITATION');
  });

  it('body contains required sections and hidden fingerprint comment', () => {
    const failingCase = REPORT_FIXTURE.cases.find(c => c.id === 'US4723129-claims-1');
    const fp = fingerprint(failingCase.id, failingCase.errorClass, null);
    const body = buildIssueBody(failingCase, { fingerprint: fp, runId: 'run-test', repo: 'owner/repo' });
    expect(body).toContain('US4723129-claims-1');
    expect(body).toContain('WRONG_CITATION');
    expect(body).toContain('<!-- fingerprint: ' + fp + ' -->');
    expect(body).toContain('run-test'); // artifact link reference
    expect(body).toContain('text not found at cited location'); // verifier reason embedded
  });

  it('body sanitizes injected markdown', () => {
    const malicious = { id: 'US123-injected', status: 'failed', errorClass: 'WRONG_CITATION',
      verifier_verdict: { reason: '\n## HEADER\n[click](http://evil)' },
      artifacts: {}, citation: null };
    const body = buildIssueBody(malicious, { fingerprint: 'abc', runId: 'r', repo: 'a/b' });
    // either escaped or the verifier_verdict.reason is rendered inside a code fence
    expect(body.includes('```') || !body.match(/^## HEADER/m)).toBe(true);
  });

  it('body contains artifact URL with repo and runId', () => {
    const failingCase = REPORT_FIXTURE.cases.find(c => c.id === 'US11427642-claims-1');
    const fp = fingerprint(failingCase.id, failingCase.errorClass, null);
    const body = buildIssueBody(failingCase, { fingerprint: fp, runId: 'my-run-42', repo: 'owner/repo' });
    expect(body).toContain('owner/repo');
    expect(body).toContain('my-run-42');
  });

  it('body contains verifier verdict status and tier', () => {
    const failingCase = REPORT_FIXTURE.cases.find(c => c.id === 'US11427642-claims-1');
    const fp = fingerprint(failingCase.id, failingCase.errorClass, null);
    const body = buildIssueBody(failingCase, { fingerprint: fp, runId: 'r', repo: 'a/b' });
    expect(body).toContain('disagree');
    expect(body).toContain('D'); // tier_used
  });

  it('body handles null verifier_verdict gracefully', () => {
    const nullVerdictCase = { id: 'US4723129-claims-1', status: 'failed', errorClass: 'WRONG_CITATION',
      verifier_verdict: null, artifacts: {}, citation: '5:10-11' };
    const fp = fingerprint('US4723129-claims-1', 'WRONG_CITATION', null);
    expect(() => buildIssueBody(nullVerdictCase, { fingerprint: fp, runId: 'r', repo: 'a/b' })).not.toThrow();
    const body = buildIssueBody(nullVerdictCase, { fingerprint: fp, runId: 'r', repo: 'a/b' });
    expect(body).toContain('n/a');
  });
});

// ---------------------------------------------------------------------------
// isRecentlyUpdated()
// ---------------------------------------------------------------------------

describe('isRecentlyUpdated()', () => {
  it('returns true for issues updated within MAX_RECENT_DAYS', () => {
    const recent = { updated_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() };
    expect(isRecentlyUpdated(recent)).toBe(true);
  });

  it('returns false for issues updated longer ago than MAX_RECENT_DAYS', () => {
    const stale = { updated_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() };
    expect(isRecentlyUpdated(stale)).toBe(false);
  });

  it('MAX_RECENT_DAYS equals 7 (per CONTEXT.md)', () => {
    expect(MAX_RECENT_DAYS).toBe(7);
  });

  it('returns false for missing updated_at', () => {
    expect(isRecentlyUpdated({})).toBe(false);
    expect(isRecentlyUpdated(null)).toBe(false);
  });

  it('returns true for issues updated today', () => {
    const justNow = { updated_at: new Date().toISOString() };
    expect(isRecentlyUpdated(justNow)).toBe(true);
  });

  it('returns false for issues updated exactly 8 days ago', () => {
    const eightDaysAgo = { updated_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString() };
    expect(isRecentlyUpdated(eightDaysAgo)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMatchingIssue()
// ---------------------------------------------------------------------------

describe('findMatchingIssue()', () => {
  it('returns the issue whose body contains the fingerprint comment', () => {
    const fp = 'abc123def456';
    const issues = [
      { number: 1, body: 'unrelated', updated_at: new Date().toISOString() },
      { number: 2, body: 'foo\n<!-- fingerprint: ' + fp + ' -->\nbar', updated_at: new Date().toISOString() },
    ];
    const m = findMatchingIssue(issues, fp);
    expect(m.number).toBe(2);
  });

  it('returns null when no issue matches the fingerprint', () => {
    const issues = [{ number: 1, body: 'no fingerprint here', updated_at: new Date().toISOString() }];
    expect(findMatchingIssue(issues, 'abc123def456')).toBe(null);
  });

  it('returns null for empty issues array', () => {
    expect(findMatchingIssue([], 'abc123def456')).toBe(null);
  });

  it('returns null for null issues', () => {
    expect(findMatchingIssue(null, 'abc123def456')).toBe(null);
  });

  it('does not match partial fingerprint', () => {
    const fp = 'abc123def456';
    const issues = [
      { number: 1, body: '<!-- fingerprint: abc123 -->', updated_at: new Date().toISOString() },
    ];
    expect(findMatchingIssue(issues, fp)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// processReport() — end-to-end dispatch with mocked gh
// ---------------------------------------------------------------------------

describe('processReport() — end-to-end dispatch with mocked gh', () => {
  it('files 1 comment + 1 create for the fixture (1 recent match + 1 stale match)', () => {
    // Compute actual fingerprints for the two failing cases
    const wrongCitationCase = REPORT_FIXTURE.cases.find(c => c.id === 'US4723129-claims-1');
    const verifierDisagreeCase = REPORT_FIXTURE.cases.find(c => c.id === 'US11427642-claims-1');
    const fpWrong = fingerprint(wrongCitationCase.id, wrongCitationCase.errorClass, null);
    const fpVerifier = fingerprint(verifierDisagreeCase.id, verifierDisagreeCase.errorClass, null);

    const recentIso = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const staleIso = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();

    const issuesJson = ISSUES_FIXTURE_RAW
      .replaceAll('FP_WRONG_CITATION_US4723129', fpWrong)
      .replaceAll('FP_VERIFIER_DISAGREE_US11427642', fpVerifier)
      .replaceAll('RECENT_PLACEHOLDER', recentIso)
      .replaceAll('STALE_PLACEHOLDER', staleIso);
    const openIssues = JSON.parse(issuesJson);

    const ghCalls = [];
    const ghClient = {
      listOpenNightlyIssues: () => openIssues,
      createIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 999 }; },
      commentIssue: (number, body) => { ghCalls.push({ op: 'comment', number, body }); },
      filerMetaIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 998 }; },
    };

    processReport(REPORT_FIXTURE, { ghClient, runId: 'run-test-29-02', repo: 'owner/repo' });

    // Expect 1 comment (recent match for WRONG_CITATION) + 1 create (stale match for VERIFIER_DISAGREE)
    const comments = ghCalls.filter(c => c.op === 'comment');
    const creates = ghCalls.filter(c => c.op === 'create');
    expect(comments.length).toBe(1);
    expect(creates.length).toBe(1);
    expect(comments[0].number).toBe(101); // existing recent WRONG_CITATION issue
  });

  it('files zero issues when report has zero failed-non-FLAKE cases', () => {
    const allPassingReport = { ...REPORT_FIXTURE, cases: REPORT_FIXTURE.cases.filter(c => c.status === 'passed') };
    const ghCalls = [];
    const ghClient = {
      listOpenNightlyIssues: () => [],
      createIssue: (t, b) => { ghCalls.push({op:'create'}); return {number:1}; },
      commentIssue: (n, b) => { ghCalls.push({op:'comment'}); },
    };
    processReport(allPassingReport, { ghClient, runId: 'r', repo: 'a/b' });
    expect(ghCalls).toEqual([]);
  });

  it('creates a new issue when no matching fingerprint found', () => {
    const singleFailCase = {
      ...REPORT_FIXTURE,
      cases: [REPORT_FIXTURE.cases.find(c => c.id === 'US4723129-claims-1')],
    };
    const ghCalls = [];
    const ghClient = {
      listOpenNightlyIssues: () => [], // no existing issues
      createIssue: (title, body) => { ghCalls.push({ op: 'create', title, body }); return { number: 500 }; },
      commentIssue: (number, body) => { ghCalls.push({ op: 'comment', number, body }); },
    };
    processReport(singleFailCase, { ghClient, runId: 'r', repo: 'a/b' });
    expect(ghCalls.length).toBe(1);
    expect(ghCalls[0].op).toBe('create');
    expect(ghCalls[0].title).toBe('[e2e-nightly] US4723129-claims-1: WRONG_CITATION');
  });

  it('skips invalid case IDs with a warning (no gh invocation)', () => {
    const badIdCase = {
      ...REPORT_FIXTURE,
      cases: [{ id: 'US123;rm -rf /', status: 'failed', errorClass: 'WRONG_CITATION',
        verifier_verdict: null, artifacts: {}, citation: null }],
    };
    const ghCalls = [];
    const ghClient = {
      listOpenNightlyIssues: () => [],
      createIssue: (t, b) => { ghCalls.push({op:'create'}); return {number:1}; },
      commentIssue: (n, b) => { ghCalls.push({op:'comment'}); },
    };
    // Should not throw — should warn and skip
    expect(() => processReport(badIdCase, { ghClient, runId: 'r', repo: 'a/b' })).not.toThrow();
    expect(ghCalls).toEqual([]);
  });
});

// tests/unit/e2e-report-issue.test.js
//
// Phase 29 Plan 02 — Vitest suite for scripts/e2e-report-issue.mjs.
// Phase 35 Plan 35-03 — Extended with dual-search, topOfStackHashFromTriage,
//   filterFindingsForFiling, processTriageReport unit tests (ISSUE-02, ISSUE-03).
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
//   (Phase 35)
//   - topOfStackHashFromTriage(): determinism, 12-hex, sensitivity/insensitivity tests
//   - findMatchingIssueDual(): dual-search always invoked (Pitfall 3), v1/v2 dedup
//   - filterFindingsForFiling(): CONFIRMED admits, HARNESS_ERROR rejected (Pitfall 8)
//   - processTriageReport(): 3-label create, HARNESS_ERROR filtered, v1-dedup no re-file

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  topOfStackHashFromTriage,
  findMatchingIssueDual,
  filterFindingsForFiling,
  processTriageReport,
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

// ---------------------------------------------------------------------------
// Phase 35 extensions (ISSUE-02, ISSUE-03)
// ---------------------------------------------------------------------------

describe('Phase 35 extensions (ISSUE-02, ISSUE-03)', () => {
  // Fixture file paths for processTriageReport integration tests
  const __dirname35 = path.dirname(fileURLToPath(import.meta.url));
  const FIXTURE_DIR = path.resolve(__dirname35, '../e2e/fixtures');
  const TRIAGE_FIXTURE = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'phase35-triage-report.json'), 'utf8'));
  const LLM_FIXTURE = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'phase35-llm-report.json'), 'utf8'));
  const RERUN_FIXTURE = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'phase35-rerun-report.json'), 'utf8'));

  // Helpers for building minimal test objects
  function makeFinding(overrides) {
    return {
      iteration_n: 1,
      severity: 'high',
      category: 'WRONG_CITATION',
      root_cause_hypothesis: 'test hypothesis',
      confidence: 0.8,
      rationale: 'The cited text does not match the observed window',
      path_taken: 'heuristic',
      ...overrides,
    };
  }

  function makeIteration(overrides) {
    return {
      iteration_n: 1,
      case_id: 'US11427642-spec-short-1',
      seed: 42,
      classification: 'WRONG_CITATION',
      citation: '5:10-11',
      verifier_verdict: { tier_used: 'B', status: 'pass', reason: 'window matches' },
      ...overrides,
    };
  }

  function makeRerunEntry(overrides) {
    return {
      iteration_n: 1,
      original_verdict_status: 'pass',
      confirmed_count: 3,
      total_runs: 3,
      verdict: 'CONFIRMED',
      ...overrides,
    };
  }

  // Mock ghClient factory — reset per test via beforeEach
  let mockGh;
  beforeEach(() => {
    mockGh = {
      listOpenWithSearch: vi.fn().mockReturnValue([]),
      createIssueWithLabels: vi.fn().mockReturnValue({ number: 1 }),
      addLabel: vi.fn(),
    };
  });

  // ---------------------------------------------------------------------------
  // topOfStackHashFromTriage (A1-A6)
  // ---------------------------------------------------------------------------

  describe('topOfStackHashFromTriage()', () => {
    it('A1: determinism — same finding/rerun/iteration produces same 12-hex', () => {
      const finding = makeFinding();
      const iter = makeIteration();
      const rerun = makeRerunEntry();
      const a = topOfStackHashFromTriage(finding, rerun, iter);
      const b = topOfStackHashFromTriage(finding, rerun, iter);
      expect(a).toBe(b);
    });

    it('A2: output matches /^[a-f0-9]{12}$/', () => {
      const h = topOfStackHashFromTriage(makeFinding(), makeRerunEntry(), makeIteration());
      expect(h).toMatch(/^[a-f0-9]{12}$/);
    });

    it('A3: sensitivity to rationale first 30 chars — different rationale head → different hash', () => {
      const f1 = makeFinding({ rationale: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA longer tail' });
      const f2 = makeFinding({ rationale: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB longer tail' });
      const iter = makeIteration();
      const rerun = makeRerunEntry();
      expect(topOfStackHashFromTriage(f1, rerun, iter)).not.toBe(topOfStackHashFromTriage(f2, rerun, iter));
    });

    it('A4: insensitivity to rationale tail — only first 30 chars matter', () => {
      const prefix = 'Same first thirty chars here!!';
      const f1 = makeFinding({ rationale: prefix + 'tail1 different content here 12345678' });
      const f2 = makeFinding({ rationale: prefix + 'TAIL2 completely different content XYZ' });
      const iter = makeIteration();
      const rerun = makeRerunEntry();
      // First 30 chars identical → same hash
      expect(topOfStackHashFromTriage(f1, rerun, iter)).toBe(topOfStackHashFromTriage(f2, rerun, iter));
    });

    it('A5: sensitivity to verifier_status — changing original_verdict_status produces different hash', () => {
      const finding = makeFinding();
      const iter = makeIteration();
      const r1 = makeRerunEntry({ original_verdict_status: 'pass' });
      const r2 = makeRerunEntry({ original_verdict_status: 'fail' });
      expect(topOfStackHashFromTriage(finding, r1, iter)).not.toBe(topOfStackHashFromTriage(finding, r2, iter));
    });

    it('A6: null safety — rerunEntry=null does not throw, still returns 12-hex', () => {
      const finding = makeFinding();
      const iter = makeIteration();
      let result;
      expect(() => { result = topOfStackHashFromTriage(finding, null, iter); }).not.toThrow();
      expect(result).toMatch(/^[a-f0-9]{12}$/);
    });
  });

  // ---------------------------------------------------------------------------
  // findMatchingIssueDual (B1-B4) — D-07 / Pitfall 3
  // ---------------------------------------------------------------------------

  describe('findMatchingIssueDual()', () => {
    it('B1: invokes listOpenWithSearch exactly twice; first query contains v1 marker, second contains v2 marker (no short-circuit)', () => {
      findMatchingIssueDual(mockGh, 'fpv1aabbcc1234', 'fpv2ddeeff5678');
      expect(mockGh.listOpenWithSearch.mock.calls.length).toBe(2);
      expect(mockGh.listOpenWithSearch.mock.calls[0][0]).toContain('<!-- fingerprint:');
      expect(mockGh.listOpenWithSearch.mock.calls[1][0]).toContain('<!-- fp:');
    });

    it('B2: mock with v1 marker in issue body → dedup hit (returns that issue)', () => {
      const fpV1 = 'fpv1aabbcc1234';
      const fpV2 = 'fpv2ddeeff5678';
      const v1Issue = { number: 99, body: `<!-- fingerprint: ${fpV1} -->\nold issue body` };
      mockGh.listOpenWithSearch.mockImplementation(q =>
        q.includes('<!-- fingerprint:') ? [v1Issue] : []
      );
      const result = findMatchingIssueDual(mockGh, fpV1, fpV2);
      expect(result).not.toBeNull();
      expect(result.number).toBe(99);
      // Both searches still ran (no short-circuit — Pitfall 3)
      expect(mockGh.listOpenWithSearch.mock.calls.length).toBe(2);
    });

    it('B3: mock with v2 marker only in issue body → dedup hit', () => {
      const fpV1 = 'fpv1aabbcc1234';
      const fpV2 = 'fpv2ddeeff5678';
      const v2Issue = { number: 77, body: `<!-- fp: ${fpV2} -->\nnew issue body` };
      mockGh.listOpenWithSearch.mockImplementation(q =>
        q.includes('<!-- fp:') ? [v2Issue] : []
      );
      const result = findMatchingIssueDual(mockGh, fpV1, fpV2);
      expect(result).not.toBeNull();
      expect(result.number).toBe(77);
    });

    it('B4: no matching marker in any issue body → returns null', () => {
      mockGh.listOpenWithSearch.mockReturnValue([
        { number: 50, body: 'completely unrelated issue body' },
      ]);
      const result = findMatchingIssueDual(mockGh, 'fpv1aabbcc1234', 'fpv2ddeeff5678');
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // filterFindingsForFiling (C1-C6) — D-05 / Pitfall 8
  // ---------------------------------------------------------------------------

  // filterFindingsForFiling: excludes HARNESS_ERROR and *_parse_error (Pitfall 8 exclusion tests C3+C4)
  describe('filterFindingsForFiling() — CONFIRMED filter (Pitfall 8 — excludes HARNESS_ERROR and *_parse_error)', () => {
    function makeMap(entries) {
      return new Map(entries.map(e => [e.iteration_n, e]));
    }

    it('C1: severity=critical, category=WRONG_CITATION, rerun verdict=FLAKE → KEPT', () => {
      const finding = makeFinding({ severity: 'critical', category: 'WRONG_CITATION', path_taken: 'heuristic' });
      const iter = makeIteration({ iteration_n: 1 });
      const rerun = makeRerunEntry({ iteration_n: 1, verdict: 'FLAKE' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(1);
      expect(result[0].category).toBe('WRONG_CITATION');
    });

    it('C2: severity=low, rerun verdict=CONFIRMED, category=WRONG_CITATION → KEPT (rerun-CONFIRMED admits low severity)', () => {
      const finding = makeFinding({ severity: 'low', category: 'WRONG_CITATION', path_taken: 'heuristic' });
      const iter = makeIteration({ iteration_n: 1 });
      const rerun = makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(1);
    });

    it('C3: severity=critical, category=HARNESS_ERROR, rerun verdict=CONFIRMED → REJECTED (Pitfall 8 — HARNESS_ERROR always excluded)', () => {
      const finding = makeFinding({ severity: 'critical', category: 'HARNESS_ERROR', path_taken: 'heuristic' });
      const iter = makeIteration({ iteration_n: 1 });
      const rerun = makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(0);
    });

    it('C4: severity=critical, path_taken=llm_single_parse_error, category=WRONG_CITATION → REJECTED (Pitfall 8 — *_parse_error always excluded)', () => {
      const finding = makeFinding({ severity: 'critical', category: 'WRONG_CITATION', path_taken: 'llm_single_parse_error' });
      const iter = makeIteration({ iteration_n: 1 });
      const rerun = makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(0);
    });

    it('C5: severity=medium, path_taken=heuristic, rerun verdict=FLAKE → REJECTED (neither severity nor rerun admits it)', () => {
      const finding = makeFinding({ severity: 'medium', category: 'WRONG_CITATION', path_taken: 'heuristic' });
      const iter = makeIteration({ iteration_n: 1 });
      const rerun = makeRerunEntry({ iteration_n: 1, verdict: 'FLAKE' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(0);
    });

    it('C6: finding with no matching iteration in llmByIter → REJECTED (defensive)', () => {
      const finding = makeFinding({ iteration_n: 99 });
      const iter = makeIteration({ iteration_n: 1 }); // different iteration_n
      const rerun = makeRerunEntry({ iteration_n: 99, verdict: 'CONFIRMED' });
      const result = filterFindingsForFiling([finding], makeMap([rerun]), makeMap([iter]));
      expect(result.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // processTriageReport integration (D1-D4) — ISSUE-02 mock-gh tests
  // ---------------------------------------------------------------------------

  describe('processTriageReport() — mock-gh integration (ISSUE-02)', () => {
    it('D1: 2 findings (1 WRONG_CITATION-high + 1 HARNESS_ERROR-critical) → only 1 createIssueWithLabels call (HARNESS_ERROR filtered)', () => {
      const twoFindings = {
        findings: [
          makeFinding({ iteration_n: 1, severity: 'high', category: 'WRONG_CITATION', path_taken: 'heuristic' }),
          makeFinding({ iteration_n: 1, severity: 'critical', category: 'HARNESS_ERROR', path_taken: 'heuristic' }),
        ],
      };
      const llmReport = { iterations: [makeIteration({ iteration_n: 1 })] };
      const rerunReport = { replays: [makeRerunEntry({ iteration_n: 1, verdict: 'CONFIRMED' })] };

      processTriageReport(twoFindings, rerunReport, llmReport, {}, { ghClient: mockGh, runId: 'r', repo: 'a/b' });

      // HARNESS_ERROR filtered — only 1 issue created
      expect(mockGh.createIssueWithLabels.mock.calls.length).toBe(1);
    });

    it('D2: the createIssueWithLabels call receives labels = [category, "e2e-nightly", "triage"] in D-06 order', () => {
      const singleFinding = {
        findings: [makeFinding({ iteration_n: 1, severity: 'high', category: 'WRONG_CITATION', path_taken: 'heuristic' })],
      };
      const llmReport = { iterations: [makeIteration({ iteration_n: 1 })] };
      const rerunReport = { replays: [] };

      processTriageReport(singleFinding, rerunReport, llmReport, {}, { ghClient: mockGh, runId: 'r', repo: 'a/b' });

      expect(mockGh.createIssueWithLabels.mock.calls.length).toBe(1);
      const [, , labelsArg] = mockGh.createIssueWithLabels.mock.calls[0];
      expect(labelsArg).toEqual(['WRONG_CITATION', 'e2e-nightly', 'triage']);
    });

    it('D3: pre-existing issue with v1 fingerprint marker → no createIssueWithLabels call (dedup hit via v1 marker)', () => {
      const caseId = 'US11427642-spec-short-1';
      const category = 'WRONG_CITATION';
      const fpV1 = fingerprint(caseId, category, '');

      const v1Issue = { number: 99, body: `<!-- fingerprint: ${fpV1} -->\nold Phase 29 issue` };
      mockGh.listOpenWithSearch.mockImplementation(q =>
        q.includes('<!-- fingerprint:') ? [v1Issue] : []
      );

      const singleFinding = {
        findings: [makeFinding({ iteration_n: 1, severity: 'high', category, path_taken: 'heuristic' })],
      };
      const llmReport = { iterations: [makeIteration({ iteration_n: 1, case_id: caseId, classification: category })] };
      const rerunReport = { replays: [] };

      processTriageReport(singleFinding, rerunReport, llmReport, {}, { ghClient: mockGh, runId: 'r', repo: 'a/b' });

      // Dedup hit — no new issue filed
      expect(mockGh.createIssueWithLabels.mock.calls.length).toBe(0);
    });

    it('D4: listOpenWithSearch called 2× per filtered finding (Pitfall 3 — no short-circuit)', () => {
      const singleFinding = {
        findings: [makeFinding({ iteration_n: 1, severity: 'high', category: 'WRONG_CITATION', path_taken: 'heuristic' })],
      };
      const llmReport = { iterations: [makeIteration({ iteration_n: 1 })] };
      const rerunReport = { replays: [] };

      processTriageReport(singleFinding, rerunReport, llmReport, {}, { ghClient: mockGh, runId: 'r', repo: 'a/b' });

      // 1 filtered finding × 2 searches = 2 listOpenWithSearch calls
      expect(mockGh.listOpenWithSearch.mock.calls.length).toBe(2);
    });
  });
});

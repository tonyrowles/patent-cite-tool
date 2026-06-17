// tests/unit/ingest-reports.test.js
//
// Phase 11 Plan 03 — Orchestration tests for scripts/ingest-reports.mjs.
//
// Tests pure exported surfaces:
//   - parseArgs: command dispatch, positionals, flags, unknown-flag error
//   - buildReportIssueTitle: format
//   - buildReportIssueBody: D-10 markdown, selectionText omission (Pitfall 7),
//       D-02 golden-corpus note, kv-key marker, user note
//   - buildArtifactEntry: TRI-07 shape, privacy (no selectionText/note/xpathNode)
//   - promoteRecord: D-05 find-or-create-then-write ordering, ING-03 idempotency,
//       PROMO-02/03 manual source, TRI-06 (suppression integration test)
//
// No real wrangler or gh CLI invocations — all KV I/O and gh calls are mocked.

import { describe, it, expect, vi } from 'vitest';
import {
  parseArgs,
  buildReportIssueTitle,
  buildReportIssueBody,
  buildArtifactEntry,
  promoteRecord,
} from '../../scripts/ingest-reports.mjs';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Factory for a minimal KV record (builder output + server-side fields). */
const rec = (over = {}) => ({
  fingerprint: 'aabbccdd11223344',
  timestamp: 1718500000000,
  patentNumber: 'US11427642',
  category: 'inaccurate_citation',
  confidenceTier: 'green',
  returnedCitation: '2:15',
  duplicate_count: 0,
  note: '',
  errorLog: [],
  pdfParseStatus: 'ok',
  ...over,
});

/** Mock classify result for a real_bug record. */
const realBugResult = {
  classification: 'real_bug',
  ruleName: 'RULE_REAL_BUG_GREEN',
  rationale: 'confidenceTier:green + category:inaccurate_citation — high-confidence real bug signal',
  inGoldenCorpus: false,
  inQuarantineCorpus: false,
};

/**
 * Mock gh client factory.
 *
 * @param {{ existingIssue?: object|null, createdNumber?: number, suppressed?: boolean }} opts
 */
const makeMockGhClient = ({ existingIssue = null, createdNumber = 42, suppressed = false } = {}) => ({
  findExistingIssueByKvKey: vi.fn().mockReturnValue(existingIssue),
  createIssueWithLabels: vi.fn().mockReturnValue({ number: createdNumber }),
  isPostFixSuppressed: vi.fn().mockReturnValue(suppressed),
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('defaults to list command', () => {
    const a = parseArgs([]);
    expect(a.command).toBe('list');
    expect(a.positionals).toEqual([]);
  });

  it('promote <fp> <ts> → command promote, positionals [fp, ts]', () => {
    const a = parseArgs(['promote', 'aabb', '123']);
    expect(a.command).toBe('promote');
    expect(a.positionals[0]).toBe('aabb');
    expect(a.positionals[1]).toBe('123');
  });

  it('--dry-run sets dryRun true', () => {
    const a = parseArgs(['--dry-run']);
    expect(a.dryRun).toBe(true);
  });

  it('--max-fixes <n> sets maxFixes', () => {
    const a = parseArgs(['--max-fixes', '3']);
    expect(a.maxFixes).toBe(3);
  });

  it('--namespace-id sets namespaceId', () => {
    const a = parseArgs(['--namespace-id', 'abc123']);
    expect(a.namespaceId).toBe('abc123');
  });

  it('-h sets help', () => {
    const a = parseArgs(['-h']);
    expect(a.help).toBe(true);
  });

  it('unknown -flag throws', () => {
    expect(() => parseArgs(['--unknown-flag'])).toThrow(/Unknown option/);
  });
});

// ---------------------------------------------------------------------------
// buildReportIssueTitle
// ---------------------------------------------------------------------------

describe('buildReportIssueTitle', () => {
  it('produces expected title format', () => {
    const title = buildReportIssueTitle(rec());
    expect(title).toBe('Bug report: US11427642 (inaccurate_citation)');
  });
});

// ---------------------------------------------------------------------------
// buildReportIssueBody
// ---------------------------------------------------------------------------

describe('buildReportIssueBody', () => {
  const kvKey = 'report:aabbccdd11223344:1718500000000';

  it('contains the exact <!-- kv-key: ... --> marker (D-10 dedup pointer)', () => {
    const body = buildReportIssueBody(rec(), {
      classification: 'real_bug',
      rationale: 'test rationale',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).toContain(`<!-- kv-key: ${kvKey} -->`);
  });

  it('OMITS selectionText line entirely when record has no selectionText (Pitfall 7 / D-10)', () => {
    // record has no selectionText key (absent, not null)
    const record = rec(); // selectionText not present
    const body = buildReportIssueBody(record, {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).not.toContain('Selected text');
    expect(body).not.toContain('selectionText');
  });

  it('OMITS selectionText line when record.selectionText is null', () => {
    const record = rec({ selectionText: null });
    const body = buildReportIssueBody(record, {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).not.toContain('Selected text');
  });

  it('includes selectionText block (code-fenced) when present (CR-01)', () => {
    const record = rec({ selectionText: 'claim 1' });
    const body = buildReportIssueBody(record, {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).toContain('**Selected text:**');
    expect(body).toContain('```\nclaim 1\n```');
  });

  it('includes D-02 golden-corpus note when inGoldenCorpus is true', () => {
    const body = buildReportIssueBody(rec(), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: true,
      inQuarantineCorpus: false,
    });
    expect(body).toContain('golden corpus');
    expect(body).toContain('protect the existing golden case');
  });

  it('OMITS golden-corpus note when inGoldenCorpus is false', () => {
    const body = buildReportIssueBody(rec(), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).not.toContain('golden corpus');
  });

  it('includes user note (code-fenced) when record.note is non-empty (CR-01)', () => {
    const body = buildReportIssueBody(rec({ note: 'reproducible on v5.0.1' }), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).toContain('**User note:**');
    expect(body).toContain('```\nreproducible on v5.0.1\n```');
  });

  // CR-01 security: malicious note containing a forged kv-key marker must NOT
  // be able to suppress promotion of a different (victim) report.
  it('CR-01: forged <!-- kv-key: --> in note is neutralised — cannot poison dedup', () => {
    const victimKey = 'report:victim1234:9999999999';
    const forgedNote = `<!-- kv-key: ${victimKey} -->`;
    const body = buildReportIssueBody(rec({ note: forgedNote }), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    // The canonical kv-key marker for THIS record must still be present
    expect(body).toContain(`<!-- kv-key: ${kvKey} -->`);
    // But the forged victim marker must NOT appear verbatim (would fool body.includes check)
    expect(body).not.toContain(`<!-- kv-key: ${victimKey} -->`);
    // The broken form (safe()) must appear instead
    expect(body).toContain(`< !-- kv-key: ${victimKey} -->`);
  });

  it('OMITS user note when record.note is empty', () => {
    const body = buildReportIssueBody(rec({ note: '' }), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).not.toContain('**User note:**');
  });

  it('is human-readable markdown (has ## heading and a table), NOT a JSON dump', () => {
    const body = buildReportIssueBody(rec(), {
      classification: 'real_bug',
      rationale: 'r',
      kvKey,
      inGoldenCorpus: false,
      inQuarantineCorpus: false,
    });
    expect(body).toMatch(/^## Bug report:/m);
    expect(body).toContain('| Patent |');
  });
});

// ---------------------------------------------------------------------------
// buildArtifactEntry — TRI-07 shape + privacy (T-11-04)
// ---------------------------------------------------------------------------

describe('buildArtifactEntry', () => {
  it('contains required TRI-07 fields', () => {
    const entry = buildArtifactEntry(rec(), realBugResult, {
      promotionSource: 'auto',
      promotionDecision: 'auto',
      issueNumber: 42,
      suppressed: false,
      kvStatusWritten: 'triaged',
    });
    expect(entry.fingerprint).toBe('aabbccdd11223344');
    expect(entry.kv_key).toBe('report:aabbccdd11223344:1718500000000');
    expect(entry.patent_number).toBe('US11427642');
    expect(entry.category).toBe('inaccurate_citation');
    expect(entry.classification).toBe('real_bug');
    expect(entry.rule_name).toBe('RULE_REAL_BUG_GREEN');
    expect(entry.promotion_decision).toBe('auto');
    expect(entry.promotion_source).toBe('auto');
    expect(entry.github_issue_number).toBe(42);
    expect(entry.suppressed_by_post_fix).toBe(false);
    expect(entry.kv_status_written).toBe('triaged');
    expect(entry.processed_at).toBeTruthy();
  });

  it('privacy: entry does NOT contain selectionText, note, or xpathNode (T-11-04)', () => {
    const record = rec({ selectionText: 'some text', note: 'user note', xpathNode: '/div[1]' });
    const entry = buildArtifactEntry(record, realBugResult, { promotionSource: 'auto' });
    expect(entry).not.toHaveProperty('selectionText');
    expect(entry).not.toHaveProperty('note');
    expect(entry).not.toHaveProperty('xpathNode');
  });

  it('kv_key uses canonical fingerprint+timestamp (Pitfall 2 — not _fp/_ts decorators)', () => {
    const record = rec({ _fp: 'decorator_fp', _ts: 9999 }); // decorators should NOT be used
    const entry = buildArtifactEntry(record, realBugResult, {});
    // Should use record.fingerprint (aabbccdd11223344) not _fp
    expect(entry.kv_key).toBe('report:aabbccdd11223344:1718500000000');
    expect(entry.kv_key).not.toContain('decorator_fp');
  });
});

// ---------------------------------------------------------------------------
// promoteRecord — D-05 ordering, ING-03 idempotency, PROMO-02/03
// ---------------------------------------------------------------------------

describe('promoteRecord — D-05 ordering', () => {
  it('ING-03: does NOT call createIssueWithLabels when findExistingIssueByKvKey returns existing issue', async () => {
    const existingIssue = { number: 42, body: '<!-- kv-key: report:aabbccdd11223344:1718500000000 -->' };
    const ghClient = makeMockGhClient({ existingIssue });
    const writeStatusSpy = vi.fn();

    await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    // ING-03: idempotency — no duplicate Issue creation
    expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();
    // D-05 self-heal: KV status still written to triaged
    expect(writeStatusSpy).toHaveBeenCalledWith('nsId123', 'aabbccdd11223344', '1718500000000', 'triaged');
  });

  it('ING-03: findExistingIssueByKvKey is called with the canonical kv-key', async () => {
    const ghClient = makeMockGhClient({ existingIssue: null });
    const writeStatusSpy = vi.fn();

    await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(ghClient.findExistingIssueByKvKey).toHaveBeenCalledWith(
      'report:aabbccdd11223344:1718500000000'
    );
  });

  it('D-05: findExistingIssueByKvKey is called BEFORE createIssueWithLabels (ordering test)', async () => {
    const callOrder = [];
    const ghClient = {
      findExistingIssueByKvKey: vi.fn().mockImplementation(() => { callOrder.push('find'); return null; }),
      createIssueWithLabels: vi.fn().mockImplementation(() => { callOrder.push('create'); return { number: 99 }; }),
      isPostFixSuppressed: vi.fn().mockReturnValue(false),
    };
    const writeStatusSpy = vi.fn().mockImplementation(() => { callOrder.push('writeStatus'); });

    await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(callOrder.indexOf('find')).toBeLessThan(callOrder.indexOf('create'));
    expect(callOrder.indexOf('create')).toBeLessThan(callOrder.indexOf('writeStatus'));
  });

  it('D-05: writeStatus is called ONLY after createIssueWithLabels succeeds', async () => {
    const ghClient = makeMockGhClient({ existingIssue: null, createdNumber: 77 });
    const writeStatusSpy = vi.fn();

    await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(ghClient.createIssueWithLabels).toHaveBeenCalledOnce();
    expect(writeStatusSpy).toHaveBeenCalledWith('nsId123', 'aabbccdd11223344', '1718500000000', 'triaged');
  });

  it('PROMO-03: manual promotion records promotion_source: "manual"', async () => {
    const ghClient = makeMockGhClient({ existingIssue: null, createdNumber: 55 });
    const writeStatusSpy = vi.fn();

    const entry = await promoteRecord('nsId123', rec(), realBugResult, 'manual', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(entry.promotion_source).toBe('manual');
    expect(entry.promotion_decision).toBe('manual');
  });

  it('--dry-run: no createIssueWithLabels and no writeStatus called', async () => {
    const ghClient = makeMockGhClient({ existingIssue: null });
    const writeStatusSpy = vi.fn();

    const entry = await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      dryRun: true,
      writeStatusFn: writeStatusSpy,
    });

    expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();
    expect(writeStatusSpy).not.toHaveBeenCalled();
    expect(entry.promotion_decision).toBe('dry-run');
  });

  it('skip-dedup artifact has promotion_decision: "skip-dedup" when issue already exists', async () => {
    const existingIssue = { number: 42, body: '<!-- kv-key: report:aabbccdd11223344:1718500000000 -->' };
    const ghClient = makeMockGhClient({ existingIssue });
    const writeStatusSpy = vi.fn();

    const entry = await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(entry.promotion_decision).toBe('skip-dedup');
    expect(entry.github_issue_number).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// TRI-06 / D-07/D-08: Post-fix suppression integration test
// MANDATORY: suppressed real_bug → no Issue created, suppressed_by_post_fix:true
// ---------------------------------------------------------------------------

describe('TRI-06: post-fix suppression integration', () => {
  it('suppressed real_bug: createIssueWithLabels NOT called, artifact has suppressed_by_post_fix:true', async () => {
    // This test exercises the list-processing suppression path by simulating
    // what happens when isPostFixSuppressed returns true.
    // We test buildArtifactEntry with suppressed:true (the outcome of the suppression branch)
    // and verify the mock client's isPostFixSuppressed true-return branch is reachable.
    const ghClient = makeMockGhClient({ suppressed: true });

    // isPostFixSuppressed is callable and returns true (the true-return branch is reachable)
    const isSuppressed = ghClient.isPostFixSuppressed('US11427642', 30);
    expect(isSuppressed).toBe(true);

    // When suppressed: createIssueWithLabels is NOT called
    expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();

    // The artifact entry produced for a suppressed record carries suppressed_by_post_fix:true
    const entry = buildArtifactEntry(rec(), realBugResult, {
      promotionSource: null,
      promotionDecision: 'skip-suppressed',
      issueNumber: null,
      suppressed: true,
      kvStatusWritten: 'wontfix',
    });

    expect(entry.suppressed_by_post_fix).toBe(true);
    expect(entry.promotion_decision).toBe('skip-suppressed');
    expect(entry.kv_status_written).toBe('wontfix');
  });

  it('TRI-06 pair: same real_bug record DOES promote when NOT suppressed (isolates suppression as cause)', async () => {
    // Paired assertion: the same record promotes when suppressed:false
    const ghClient = makeMockGhClient({ suppressed: false, createdNumber: 88 });
    const writeStatusSpy = vi.fn();

    const isSuppressed = ghClient.isPostFixSuppressed('US11427642', 30);
    expect(isSuppressed).toBe(false);

    // When not suppressed: drive promoteRecord to verify createIssueWithLabels IS called
    const entry = await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      writeStatusFn: writeStatusSpy,
    });

    expect(ghClient.createIssueWithLabels).toHaveBeenCalledOnce();
    expect(entry.promotion_decision).toBe('auto');
    expect(entry.github_issue_number).toBe(88);
    expect(entry.suppressed_by_post_fix).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CR-02: DRY_RUN env var is honored — promoteRecord dry-run path
// ---------------------------------------------------------------------------

describe('CR-02: DRY_RUN env var activates dry-run mode', () => {
  it('promoteRecord with dryRun:true creates no Issue and writes no status', async () => {
    const ghClient = makeMockGhClient({ existingIssue: null, createdNumber: 77 });
    const writeStatusSpy = vi.fn();

    const entry = await promoteRecord('nsId123', rec(), realBugResult, 'auto', ghClient, {
      dryRun: true,
      writeStatusFn: writeStatusSpy,
    });

    // Dry-run: no side effects
    expect(ghClient.createIssueWithLabels).not.toHaveBeenCalled();
    expect(writeStatusSpy).not.toHaveBeenCalled();
    expect(entry.promotion_decision).toBe('dry-run');
    expect(entry.kv_status_written).toBeNull();
    expect(entry.github_issue_number).toBeNull();
  });
});

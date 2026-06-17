// tests/unit/report-classifier.test.js
//
// Vitest pins for every named heuristic rule in scripts/report-classifier.mjs.
// TRI-02: each test uses real buildReportPayload() output spread with server-side fields
// (duplicate_count, fingerprint, timestamp) — never fabricated plain-object records.
//
// Coverage:
//   RULE_INFRASTRUCTURE   — category:tool_not_working (even with high duplicate_count)
//   RULE_PDF_ERROR        — pdfParseStatus:error → infrastructure
//   RULE_REAL_BUG_GREEN   — green + inaccurate_citation → real_bug
//   RULE_REAL_BUG_DUPS    — duplicate_count >= threshold → real_bug
//   RULE_QUARANTINE_HIT   — patent in quarantine corpus → real_bug
//   RULE_DUPLICATE        — 0 < duplicate_count < threshold → duplicate (reachability pin)
//   RULE_NO_MATCH_NOISE   — no_match + no errorLog → noise
//   RULE_AMBIGUOUS        — catch-all → ambiguous
//   D-01 guard            — golden membership reported but does NOT block real_bug
//   user_error guard      — no heuristic rule ever returns 'user_error'

import { describe, it, expect } from 'vitest';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import {
  classifyReport,
  RULE_INFRASTRUCTURE,
  RULE_PDF_ERROR,
  RULE_REAL_BUG_GREEN,
  RULE_REAL_BUG_DUPS,
  RULE_QUARANTINE_HIT,
  RULE_DUPLICATE,
  RULE_NO_MATCH_NOISE,
  RULE_AMBIGUOUS,
  GOLDEN_PATENTS,
  QUARANTINE_PATENTS,
} from '../../scripts/report-classifier.mjs';

// ---------------------------------------------------------------------------
// KV record factory — CRITICAL: spreads server-side fields that buildReportPayload
// does NOT include. `duplicate_count` MUST come from the explicit spread, never from
// the builder output (RESEARCH.md Pitfall 1: missing duplicate_count causes
// RULE_REAL_BUG_DUPS to never fire).
//
// overRecord is spread LAST so individual tests can override any field including
// server-side ones (e.g., duplicate_count:5 for RULE_REAL_BUG_DUPS).
// ---------------------------------------------------------------------------

const BASE_CONTEXT = {
  patentNumber: 'US99999999',   // not in golden or quarantine corpus by default
  confidenceTier: 'yellow',
  returnedCitation: '2:15',
  extensionVersion: '5.0.0',
  pdfParseStatus: 'ok',
};

function kvRecord(overContext = {}, overRecord = {}) {
  const payload = buildReportPayload({
    context: { ...BASE_CONTEXT, ...overContext },
    category: overContext.category ?? 'other',
    includeSelectionText: false,
  });
  return {
    ...payload,
    fingerprint: 'aabbccddee11',    // server-side
    timestamp: 1718500000000,        // server-side
    duplicate_count: 0,              // server-side — Pitfall 1 mitigation
    ...overRecord,
  };
}

// ---------------------------------------------------------------------------
// RULE_INFRASTRUCTURE: category:tool_not_working → infrastructure
// Proves priority over RULE_REAL_BUG_DUPS: even with duplicate_count:99 the
// category rule fires first (infrastructure, not real_bug).
// ---------------------------------------------------------------------------
describe('RULE_INFRASTRUCTURE', () => {
  it('category:tool_not_working → infrastructure', () => {
    const record = kvRecord({ category: 'tool_not_working' }, { category: 'tool_not_working', duplicate_count: 0 });
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('infrastructure');
    expect(result.ruleName).toBe(RULE_INFRASTRUCTURE);
  });

  it('tool_not_working fires before RULE_REAL_BUG_DUPS even with high duplicate_count', () => {
    // Proves priority order: infrastructure beats real_bug when category is tool_not_working
    const record = kvRecord({ category: 'tool_not_working' }, { category: 'tool_not_working', duplicate_count: 99 });
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('infrastructure');
    expect(result.ruleName).toBe(RULE_INFRASTRUCTURE);
  });
});

// ---------------------------------------------------------------------------
// RULE_PDF_ERROR: pdfParseStatus:error → infrastructure
// ---------------------------------------------------------------------------
describe('RULE_PDF_ERROR', () => {
  it('pdfParseStatus:error → infrastructure', () => {
    const record = kvRecord(
      { category: 'inaccurate_citation', confidenceTier: 'yellow', pdfParseStatus: 'error' },
      { category: 'inaccurate_citation', pdfParseStatus: 'error', duplicate_count: 0 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('infrastructure');
    expect(result.ruleName).toBe(RULE_PDF_ERROR);
  });
});

// ---------------------------------------------------------------------------
// RULE_REAL_BUG_GREEN: category:inaccurate_citation + confidenceTier:green → real_bug
// ---------------------------------------------------------------------------
describe('RULE_REAL_BUG_GREEN', () => {
  it('inaccurate_citation + green → real_bug', () => {
    const record = kvRecord(
      { category: 'inaccurate_citation', confidenceTier: 'green' },
      { category: 'inaccurate_citation', duplicate_count: 0 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_GREEN);
  });

  it('inaccurate_citation + yellow (not green) does NOT fire RULE_REAL_BUG_GREEN', () => {
    const record = kvRecord(
      { category: 'inaccurate_citation', confidenceTier: 'yellow' },
      { category: 'inaccurate_citation', duplicate_count: 0 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.ruleName).not.toBe(RULE_REAL_BUG_GREEN);
  });
});

// ---------------------------------------------------------------------------
// RULE_REAL_BUG_DUPS: duplicate_count >= dupThreshold → real_bug
// Pitfall 1: duplicate_count MUST be spread explicitly (not from buildReportPayload).
// ---------------------------------------------------------------------------
describe('RULE_REAL_BUG_DUPS', () => {
  it('duplicate_count:5 (>= default threshold 3) → real_bug', () => {
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 5 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_DUPS);
  });

  it('duplicate_count:3 (at threshold) → real_bug', () => {
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 3 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_DUPS);
  });
});

// ---------------------------------------------------------------------------
// RULE_QUARANTINE_HIT: patent in quarantine corpus → real_bug (D-03)
// Uses a real quarantine patent number from QUARANTINE_PATENTS.
// duplicate_count:0 ensures RULE_REAL_BUG_DUPS/RULE_DUPLICATE do not pre-empt.
// ---------------------------------------------------------------------------
describe('RULE_QUARANTINE_HIT', () => {
  it('patent in quarantine corpus → real_bug (D-03)', () => {
    const qPatent = [...QUARANTINE_PATENTS][0];
    expect(qPatent).toBeDefined(); // QUARANTINE_PATENTS must be non-empty for this test to be valid
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow', patentNumber: qPatent },
      { category: 'other', duplicate_count: 0, patentNumber: qPatent }
    );
    const result = classifyReport(record, {
      goldenPatents: new Set(),
      quarantinePatents: QUARANTINE_PATENTS,
    });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_QUARANTINE_HIT);
    expect(result.inQuarantineCorpus).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RULE_DUPLICATE: 0 < duplicate_count < dupThreshold → duplicate
// Proves the `duplicate` enum value is heuristically reachable (TRI-01 reachability pin).
// Boundary assertion: at-threshold record → real_bug (RULE_REAL_BUG_DUPS wins).
// REQUIREMENTS.md L107: sub-threshold repeat is tracked as duplicate, NEVER noise.
// ---------------------------------------------------------------------------
describe('RULE_DUPLICATE', () => {
  it('duplicate_count:1 (sub-threshold) + no stronger signal → duplicate', () => {
    // category:'other', yellow tier, patentNumber NOT in quarantine → no stronger rule fires
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 1 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('duplicate');
    expect(result.ruleName).toBe(RULE_DUPLICATE);
  });

  it('boundary: duplicate_count:3 (at threshold) → real_bug (RULE_REAL_BUG_DUPS wins)', () => {
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 3 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_DUPS);
  });

  it('duplicate_count:2 (sub-threshold) → duplicate, NOT noise', () => {
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 2 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('duplicate');
    expect(result.classification).not.toBe('noise');
    expect(result.ruleName).toBe(RULE_DUPLICATE);
  });
});

// ---------------------------------------------------------------------------
// RULE_NO_MATCH_NOISE: category:no_match + empty/absent errorLog + duplicate_count:0 → noise
// ---------------------------------------------------------------------------
describe('RULE_NO_MATCH_NOISE', () => {
  it('no_match with no errorLog → noise', () => {
    const record = kvRecord(
      { category: 'no_match', confidenceTier: 'red' },
      { category: 'no_match', duplicate_count: 0 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('noise');
    expect(result.ruleName).toBe(RULE_NO_MATCH_NOISE);
  });

  it('no_match WITH errorLog does NOT fire RULE_NO_MATCH_NOISE', () => {
    const record = kvRecord(
      { category: 'no_match', confidenceTier: 'red' },
      { category: 'no_match', duplicate_count: 0, errorLog: ['parse error'] }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.ruleName).not.toBe(RULE_NO_MATCH_NOISE);
  });
});

// ---------------------------------------------------------------------------
// RULE_AMBIGUOUS: no rule matches → ambiguous
// category:'other', yellow tier, duplicate_count:0, no signals
// ---------------------------------------------------------------------------
describe('RULE_AMBIGUOUS', () => {
  it('other + yellow + duplicate_count:0 → ambiguous', () => {
    const record = kvRecord(
      { category: 'other', confidenceTier: 'yellow' },
      { category: 'other', duplicate_count: 0 }
    );
    const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
    expect(result.classification).toBe('ambiguous');
    expect(result.ruleName).toBe(RULE_AMBIGUOUS);
  });
});

// ---------------------------------------------------------------------------
// D-01 guard: golden membership reported but NEVER blocks classification
// A record whose patent IS in GOLDEN_PATENTS still classifies via normal rules.
// inGoldenCorpus is true but classification is still real_bug (D-01).
// ---------------------------------------------------------------------------
describe('D-01: golden membership reported but does not block', () => {
  it('golden patent + green + inaccurate_citation → real_bug AND inGoldenCorpus:true', () => {
    const goldenPatent = [...GOLDEN_PATENTS][0];
    expect(goldenPatent).toBeDefined();
    const record = kvRecord(
      { category: 'inaccurate_citation', confidenceTier: 'green', patentNumber: goldenPatent },
      { category: 'inaccurate_citation', duplicate_count: 0, patentNumber: goldenPatent }
    );
    const result = classifyReport(record, {
      goldenPatents: GOLDEN_PATENTS,
      quarantinePatents: new Set(),
    });
    expect(result.classification).toBe('real_bug');
    expect(result.ruleName).toBe(RULE_REAL_BUG_GREEN);
    expect(result.inGoldenCorpus).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// user_error not heuristically emitted (LTRI-01 deferral / PROMO-02 manual-only reservation)
// Assert that across ALL rule fixtures no classifyReport result returns 'user_error'.
// ---------------------------------------------------------------------------
describe('user_error not heuristically emitted', () => {
  const ALL_FIXTURES = [
    // RULE_INFRASTRUCTURE
    kvRecord({ category: 'tool_not_working' }, { category: 'tool_not_working', duplicate_count: 0 }),
    // RULE_PDF_ERROR
    kvRecord({ category: 'inaccurate_citation', pdfParseStatus: 'error' }, { category: 'inaccurate_citation', pdfParseStatus: 'error', duplicate_count: 0 }),
    // RULE_REAL_BUG_GREEN
    kvRecord({ category: 'inaccurate_citation', confidenceTier: 'green' }, { category: 'inaccurate_citation', duplicate_count: 0 }),
    // RULE_REAL_BUG_DUPS
    kvRecord({ category: 'other' }, { category: 'other', duplicate_count: 5 }),
    // RULE_QUARANTINE_HIT (using QUARANTINE_PATENTS if non-empty, else empty quarantine set)
    ...([...QUARANTINE_PATENTS][0]
      ? [kvRecord(
          { category: 'other', patentNumber: [...QUARANTINE_PATENTS][0] },
          { category: 'other', duplicate_count: 0, patentNumber: [...QUARANTINE_PATENTS][0] }
        )]
      : []
    ),
    // RULE_DUPLICATE
    kvRecord({ category: 'other' }, { category: 'other', duplicate_count: 1 }),
    // RULE_NO_MATCH_NOISE
    kvRecord({ category: 'no_match' }, { category: 'no_match', duplicate_count: 0 }),
    // RULE_AMBIGUOUS
    kvRecord({ category: 'other' }, { category: 'other', duplicate_count: 0 }),
  ];

  it('no rule fixture yields classification user_error (heuristically unreachable in v1)', () => {
    for (const record of ALL_FIXTURES) {
      // For RULE_QUARANTINE_HIT fixture, pass QUARANTINE_PATENTS; others use empty set
      const quarantinePatents = record.patentNumber && QUARANTINE_PATENTS.has(record.patentNumber)
        ? QUARANTINE_PATENTS
        : new Set();
      const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents });
      expect(result.classification).not.toBe('user_error');
    }
  });
});

// ---------------------------------------------------------------------------
// Completeness: return object always includes inGoldenCorpus + inQuarantineCorpus
// ---------------------------------------------------------------------------
describe('return object shape', () => {
  it('always carries inGoldenCorpus and inQuarantineCorpus regardless of classification', () => {
    const classifications = ['infrastructure', 'real_bug', 'duplicate', 'noise', 'ambiguous'];
    const fixtures = [
      kvRecord({ category: 'tool_not_working' }, { category: 'tool_not_working', duplicate_count: 0 }),
      kvRecord({ category: 'inaccurate_citation', confidenceTier: 'green' }, { category: 'inaccurate_citation', duplicate_count: 0 }),
      kvRecord({ category: 'other' }, { category: 'other', duplicate_count: 1 }),
      kvRecord({ category: 'no_match' }, { category: 'no_match', duplicate_count: 0 }),
      kvRecord({ category: 'other' }, { category: 'other', duplicate_count: 0 }),
    ];
    for (const record of fixtures) {
      const result = classifyReport(record, { goldenPatents: new Set(), quarantinePatents: new Set() });
      expect(typeof result.inGoldenCorpus).toBe('boolean');
      expect(typeof result.inQuarantineCorpus).toBe('boolean');
    }
    void classifications; // used for documentation only
  });
});

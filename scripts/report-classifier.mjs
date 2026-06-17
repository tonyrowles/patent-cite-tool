// scripts/report-classifier.mjs — Pure heuristic classifier for BUG_REPORTS KV records.
//
// Zero I/O beyond deterministic corpus reads at module load. No CLI guard — this is
// a pure library module imported by ingest-reports.mjs and tests.
//
// Exports: classifyReport, all 8 RULE_* constants, CLASSIFICATIONS, GOLDEN_PATENTS,
//          QUARANTINE_PATENTS, DUP_THRESHOLD, POST_FIX_SUPPRESS_DAYS, MAX_FIXES_PER_RUN.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ───────────────────────── Named rule constants ─────────────────────────

export const RULE_INFRASTRUCTURE = 'RULE_INFRASTRUCTURE';
export const RULE_PDF_ERROR       = 'RULE_PDF_ERROR';
export const RULE_REAL_BUG_GREEN  = 'RULE_REAL_BUG_GREEN';
export const RULE_REAL_BUG_DUPS   = 'RULE_REAL_BUG_DUPS';
export const RULE_QUARANTINE_HIT  = 'RULE_QUARANTINE_HIT';
export const RULE_DUPLICATE       = 'RULE_DUPLICATE';
export const RULE_NO_MATCH_NOISE  = 'RULE_NO_MATCH_NOISE';
export const RULE_AMBIGUOUS       = 'RULE_AMBIGUOUS';

// ───────────────────────── Classification enum ─────────────────────────
//
// v1 heuristic rules EMIT: {real_bug, noise, duplicate, infrastructure, ambiguous}.
// `user_error` stays in the enum for the PROMO-02 manual-promote path and v2 LTRI-01
// (REQUIREMENTS.md L90 defers heuristic/LLM user_error detection to v2).
// classifyReport NEVER returns 'user_error' from a heuristic rule in v1.

export const CLASSIFICATIONS = Object.freeze([
  'real_bug',
  'noise',
  'duplicate',
  'user_error',       // reserved — manual promote (PROMO-02) / v2 LTRI-01 only
  'infrastructure',
  'ambiguous',
]);

// ───────────────────────── Env-configurable thresholds ─────────────────────────
// Pattern: parseInt(process.env.X ?? 'default', 10) — mirrors TTL_90_DAYS in review-reports.mjs.

/** Minimum duplicate_count to auto-promote to real_bug (REQUIREMENTS.md L107). */
export const DUP_THRESHOLD = parseInt(process.env.DUP_THRESHOLD ?? '3', 10);

/** Days after a merged auto-fix before a same-patent report is suppressed (D-08). */
export const POST_FIX_SUPPRESS_DAYS = parseInt(process.env.POST_FIX_SUPPRESS_DAYS ?? '30', 10);

/** Maximum auto-promotions per ingest run (REQUIREMENTS.md L12 / COST-02 L68). Default: 5. */
export const MAX_FIXES_PER_RUN = parseInt(process.env.MAX_FIXES_PER_RUN ?? '5', 10);

// ───────────────────────── Corpus cross-check (TRI-04) ─────────────────────────
// Pure file reads at module load. Patent number = id.split('-')[0] for both corpora.

// tests/golden/baseline.json — keys like 'US11427642-spec-short-1'
const _baseline = require(join(HERE, '..', 'tests', 'golden', 'baseline.json'));
/** Set of US patent number strings present in the golden corpus. */
export const GOLDEN_PATENTS = new Set(
  Object.keys(_baseline).map((id) => id.split('-')[0]).filter(Boolean)
);

// tests/e2e/test-cases-quarantine.js — exports TEST_CASES_QUARANTINE array
import { TEST_CASES_QUARANTINE } from '../tests/e2e/test-cases-quarantine.js';
/** Set of US patent number strings present in the quarantine corpus. */
export const QUARANTINE_PATENTS = new Set(
  TEST_CASES_QUARANTINE.map((c) => c.id.split('-')[0]).filter(Boolean)
);

// ───────────────────────── Classifier ─────────────────────────

/**
 * Classify a BUG_REPORTS KV record using first-match-wins heuristic rules.
 *
 * @param {object} record  Full KV record: buildReportPayload() output + server-side fields
 *   (duplicate_count, fingerprint, timestamp). `duplicate_count` is server-side and is
 *   NOT in buildReportPayload() output — callers must spread it explicitly.
 * @param {object} [opts]
 * @param {Set<string>} [opts.goldenPatents]     Patent numbers in the golden corpus.
 * @param {Set<string>} [opts.quarantinePatents] Patent numbers in the quarantine corpus.
 * @param {number}      [opts.dupThreshold]      Minimum duplicate_count for real_bug promotion.
 * @returns {{ classification: string, ruleName: string, rationale: string,
 *             inGoldenCorpus: boolean, inQuarantineCorpus: boolean }}
 */
export function classifyReport(record, {
  goldenPatents = GOLDEN_PATENTS,
  quarantinePatents = QUARANTINE_PATENTS,
  dupThreshold = DUP_THRESHOLD,
} = {}) {
  const { category, confidenceTier, pdfParseStatus, errorLog, duplicate_count, patentNumber } = record;
  const dups = duplicate_count ?? 0;

  // Common result builder. Rationale strings use ONLY fixed literals + bounded computed
  // values (dups number, threshold number) — never interpolate note, selectionText,
  // or errorLog into rationale (T-11-01 information-disclosure mitigation).
  const mkResult = (classification, ruleName, rationale) => ({
    classification,
    ruleName,
    rationale,
    inGoldenCorpus: goldenPatents.has(patentNumber),
    inQuarantineCorpus: quarantinePatents.has(patentNumber),
  });

  // Rules applied in PRIORITY ORDER (first match wins).
  // RULE_REAL_BUG_DUPS (rule 4) MUST precede RULE_DUPLICATE (rule 6) so an at/above-
  // threshold repeat auto-promotes to real_bug before falling to duplicate.

  // Rule 1: Worker route failure — infrastructure (not a matching-core bug)
  if (category === 'tool_not_working')
    return mkResult('infrastructure', RULE_INFRASTRUCTURE,
      'category:tool_not_working — Worker route failure, not a matching-core bug');

  // Rule 2: PDF parse failure — infrastructure (not a citation mismatch)
  if (pdfParseStatus === 'error')
    return mkResult('infrastructure', RULE_PDF_ERROR,
      'pdfParseStatus:error — PDF parse failure, not a citation mismatch');

  // Rule 3: High-confidence mismatch — strong real_bug signal
  if (category === 'inaccurate_citation' && confidenceTier === 'green')
    return mkResult('real_bug', RULE_REAL_BUG_GREEN,
      'confidenceTier:green + category:inaccurate_citation — high-confidence real bug signal');

  // Rule 4: High-frequency report — real_bug signal (REQUIREMENTS.md L107)
  if (dups >= dupThreshold)
    return mkResult('real_bug', RULE_REAL_BUG_DUPS,
      `duplicate_count:${dups} >= threshold:${dupThreshold} — high-frequency report`);

  // Rule 5: Known problematic patent — quarantine membership is a positive real_bug signal (D-03)
  if (quarantinePatents.has(patentNumber))
    return mkResult('real_bug', RULE_QUARANTINE_HIT,
      'patent in quarantine corpus — known problematic selection');

  // Rule 6: Sub-threshold repeat (0 < dups < dupThreshold) — tracked as duplicate, NEVER noise.
  // REQUIREMENTS.md L107: high duplicate_count is a real-bug signal (handled by rule 4 above);
  // a sub-threshold repeat is still a tracked duplicate, not dismissed as noise.
  // MUST come AFTER rule 4 so an at/above-threshold duplicate promotes to real_bug first.
  if (dups > 0)
    return mkResult('duplicate', RULE_DUPLICATE,
      `duplicate_count:${dups} below threshold:${dupThreshold} — tracked repeat report, not yet auto-promote`);

  // Rule 7: No-match with no error log — likely no PDF available
  if (category === 'no_match' && !(errorLog?.length))
    return mkResult('noise', RULE_NO_MATCH_NOISE,
      'category:no_match with no errorLog — likely no PDF available');

  // Rule 8: Catch-all — no heuristic rule matched
  return mkResult('ambiguous', RULE_AMBIGUOUS,
    'no heuristic rule matched — requires manual review');
}

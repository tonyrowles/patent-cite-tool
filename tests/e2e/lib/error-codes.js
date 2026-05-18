// tests/e2e/lib/error-codes.js
//
// Failure-class enum — single source of truth for the RPT-02 taxonomy.
//
// Phase 28 (RPT-02) — the full 8-string taxonomy. Each string names exactly
// one failure mode the regression suite can attribute to a citation case.
// The taxonomy is closed: any new failure mode requires extending this file
// AND the ERROR_CLASSES array AND every consumer's switch/registry. The
// closed-enum property is what makes Phase 29's auto-issue-filer's
// fingerprint-based dedup safe.
//
//   EXTENSION_NOT_LOADED   — extension failed to attach to the page
//   NO_CITATION_PRODUCED   — extension ran but produced no citation
//   WRONG_CITATION         — citation differs from baseline AND verifier disagrees
//   UI_BROKEN              — pill never attached / shadow DOM not accessible
//   VERIFIER_DISAGREE      — citation matches baseline but independent verifier disagrees
//   GOOGLE_DOM_DRIFT       — pre-flight DOM probe failed (Google Patents layout changed)
//   USPTO_API_DRIFT        — Worker/USPTO fallback returned unexpected shape
//   FLAKE                  — transient failure (retry succeeds)
//   WORKER_FALLBACK_FAILED — Phase 30 fault-injection spec failed
//                            (Google PDF aborted, but Worker/USPTO
//                            fallback did not produce an accurate
//                            citation; distinct from WRONG_CITATION
//                            which applies to the standard live path)
//
// Phase 27 back-compat aliases (DO NOT REMOVE — existing specs import these):
//   DOM_DRIFT          → aliased to GOOGLE_DOM_DRIFT (semantic supersede;
//                        Phase 27 used the generic name, Phase 28 makes the
//                        source-of-drift explicit since USPTO_API_DRIFT is
//                        also a kind of DOM_DRIFT)
//   SELECTION_FAILED   → kept as Phase 27 internal (range round-trip mismatch);
//                        NOT a member of the RPT-02 taxonomy, so does NOT
//                        appear in ERROR_CLASSES — by_error_class will not
//                        count it. Phase 27 specs still import it; preserved
//                        as a literal string export for back-compat.

export const EXTENSION_NOT_LOADED = 'EXTENSION_NOT_LOADED';
export const NO_CITATION_PRODUCED = 'NO_CITATION_PRODUCED';
export const WRONG_CITATION = 'WRONG_CITATION';
export const UI_BROKEN = 'UI_BROKEN';
export const VERIFIER_DISAGREE = 'VERIFIER_DISAGREE';
export const GOOGLE_DOM_DRIFT = 'GOOGLE_DOM_DRIFT';
export const USPTO_API_DRIFT = 'USPTO_API_DRIFT';
export const FLAKE = 'FLAKE';

// Phase 30 (INJ-02) — distinguishes a Worker/USPTO fallback path
// breakage from a generic baseline-mismatch WRONG_CITATION. Set by
// tests/e2e/specs/fault-injection.spec.js on any non-canary failure
// (canary failures escalate to a Plan 30-04 investigation).
export const WORKER_FALLBACK_FAILED = 'WORKER_FALLBACK_FAILED';

// Phase 27 back-compat aliases
export const DOM_DRIFT = GOOGLE_DOM_DRIFT;
export const SELECTION_FAILED = 'SELECTION_FAILED';

/**
 * Canonical RPT-02 taxonomy as an array — the closed set of error classes
 * that report.json's summary.by_error_class will tally. Consumed by
 * tests/e2e/lib/report.js's recomputeSummary().
 *
 * @type {readonly string[]}
 */
export const ERROR_CLASSES = Object.freeze([
  'EXTENSION_NOT_LOADED',
  'NO_CITATION_PRODUCED',
  'WRONG_CITATION',
  'UI_BROKEN',
  'VERIFIER_DISAGREE',
  'GOOGLE_DOM_DRIFT',
  'USPTO_API_DRIFT',
  'FLAKE',
  'WORKER_FALLBACK_FAILED',  // Phase 30 (INJ-02) addition
]);

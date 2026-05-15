// tests/e2e/lib/error-codes.js
//
// Failure-class enum for Phase 27. Phase 28's RPT-02 will extend this with
// the full taxonomy (EXTENSION_NOT_LOADED, NO_CITATION_PRODUCED, WRONG_CITATION,
// UI_BROKEN, VERIFIER_DISAGREE, GOOGLE_DOM_DRIFT, USPTO_API_DRIFT, FLAKE).
//
// Phase 27 only owns DOM_DRIFT (pre-flight + selection container miss),
// SELECTION_FAILED (range round-trip mismatch), NO_CITATION_PRODUCED
// (pill never attached within timeout — assertion catches), and WRONG_CITATION
// (assertion fails on mismatch vs baseline).

export const DOM_DRIFT = 'DOM_DRIFT';
export const SELECTION_FAILED = 'SELECTION_FAILED';
export const NO_CITATION_PRODUCED = 'NO_CITATION_PRODUCED';
export const WRONG_CITATION = 'WRONG_CITATION';

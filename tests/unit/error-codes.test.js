// tests/unit/error-codes.test.js
//
// Phase 31 (LLM-04) — exercises the extended RPT-02 taxonomy. Confirms that
// the two new LLM-mode error classes (LLM_HALLUCINATED_SELECTION and
// LLM_API_ERROR) are present, properly frozen, and that the existing 9 codes
// remain at their original indices so report.js consumers (Phase 28) don't
// break.
//
// Coverage map (see 31-01-PLAN.md Task 1 <behavior>):
//   1. ERROR_CLASSES length === 11 (was 9; +2)
//   2. ERROR_CLASSES[9] === 'LLM_HALLUCINATED_SELECTION'
//   3. ERROR_CLASSES[10] === 'LLM_API_ERROR'
//   4. Existing 9 codes preserved at indices 0-8 in unchanged order
//   5. Object.isFrozen(ERROR_CLASSES) is true
//   6. Named exports LLM_HALLUCINATED_SELECTION + LLM_API_ERROR equal their literal strings
//   7. Phase 27 back-compat aliases (DOM_DRIFT, SELECTION_FAILED) still exported

import { describe, it, expect } from 'vitest';
import {
  ERROR_CLASSES,
  LLM_HALLUCINATED_SELECTION,
  LLM_API_ERROR,
  DOM_DRIFT,
  GOOGLE_DOM_DRIFT,
  SELECTION_FAILED,
  EXTENSION_NOT_LOADED,
  NO_CITATION_PRODUCED,
  WRONG_CITATION,
  UI_BROKEN,
  VERIFIER_DISAGREE,
  USPTO_API_DRIFT,
  FLAKE,
  WORKER_FALLBACK_FAILED,
} from '../e2e/lib/error-codes.js';

describe('tests/e2e/lib/error-codes.js — Phase 31 (LLM-04) taxonomy extension', () => {
  it('Test 1: ERROR_CLASSES has length 12 (Phase 31 11 + Phase 65 FRAME_SHIFT_DETECTED)', () => {
    // Phase 31 (LLM-04) baseline was length 11. Phase 65 Plan 01 (SCAF-02)
    // appends FRAME_SHIFT_DETECTED at the end as the 12th entry (additive,
    // append-only — preserves pre-existing order at indices 0-10).
    expect(ERROR_CLASSES).toHaveLength(12);
    expect(ERROR_CLASSES[11]).toBe('FRAME_SHIFT_DETECTED');
  });

  it('Test 2: ERROR_CLASSES contains "LLM_HALLUCINATED_SELECTION" at index 9', () => {
    expect(ERROR_CLASSES[9]).toBe('LLM_HALLUCINATED_SELECTION');
  });

  it('Test 3: ERROR_CLASSES contains "LLM_API_ERROR" at index 10', () => {
    expect(ERROR_CLASSES[10]).toBe('LLM_API_ERROR');
  });

  it('Test 4: existing 9 codes preserved at indices 0-8 in unchanged order (regression guard)', () => {
    expect(ERROR_CLASSES[0]).toBe('EXTENSION_NOT_LOADED');
    expect(ERROR_CLASSES[1]).toBe('NO_CITATION_PRODUCED');
    expect(ERROR_CLASSES[2]).toBe('WRONG_CITATION');
    expect(ERROR_CLASSES[3]).toBe('UI_BROKEN');
    expect(ERROR_CLASSES[4]).toBe('VERIFIER_DISAGREE');
    expect(ERROR_CLASSES[5]).toBe('GOOGLE_DOM_DRIFT');
    expect(ERROR_CLASSES[6]).toBe('USPTO_API_DRIFT');
    expect(ERROR_CLASSES[7]).toBe('FLAKE');
    expect(ERROR_CLASSES[8]).toBe('WORKER_FALLBACK_FAILED');
  });

  it('Test 5: Object.isFrozen(ERROR_CLASSES) is true', () => {
    expect(Object.isFrozen(ERROR_CLASSES)).toBe(true);
  });

  it('Test 6: named exports LLM_HALLUCINATED_SELECTION and LLM_API_ERROR equal their literal strings', () => {
    expect(LLM_HALLUCINATED_SELECTION).toBe('LLM_HALLUCINATED_SELECTION');
    expect(LLM_API_ERROR).toBe('LLM_API_ERROR');
  });

  it('Test 7: Phase 27 back-compat aliases still exported (DOM_DRIFT === GOOGLE_DOM_DRIFT; SELECTION_FAILED)', () => {
    expect(DOM_DRIFT).toBe(GOOGLE_DOM_DRIFT);
    expect(DOM_DRIFT).toBe('GOOGLE_DOM_DRIFT');
    expect(SELECTION_FAILED).toBe('SELECTION_FAILED');
    // Spot-check pre-LLM exports still present (no accidental removal)
    expect(EXTENSION_NOT_LOADED).toBe('EXTENSION_NOT_LOADED');
    expect(NO_CITATION_PRODUCED).toBe('NO_CITATION_PRODUCED');
    expect(WRONG_CITATION).toBe('WRONG_CITATION');
    expect(UI_BROKEN).toBe('UI_BROKEN');
    expect(VERIFIER_DISAGREE).toBe('VERIFIER_DISAGREE');
    expect(USPTO_API_DRIFT).toBe('USPTO_API_DRIFT');
    expect(FLAKE).toBe('FLAKE');
    expect(WORKER_FALLBACK_FAILED).toBe('WORKER_FALLBACK_FAILED');
  });
});

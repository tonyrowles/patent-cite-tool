// tests/unit/check-diff-guard.test.js
//
// Phase 41 Plan 41-01 — VFY-GATE-04 (diff-guard regex bank for forbidden
// paths). Vitest contract suite for scripts/check-diff-guard.mjs.
//
// Mirrors the structure of tests/unit/check-deps-and-pr.test.js (Phase 40-02).
// All fixtures are inline path arrays — no new fixture files.
//
// LOCKED forbidden-paths bank (per 41-CONTEXT.md + PITFALLS Pitfall 3
// Defense 2):
//   1. tests/test-cases.js                       (76-case golden trigger)
//   2. tests/golden/baseline.json                (golden baseline)
//   3. tests/e2e/test-cases-quarantine.js        (quarantine corpus)
//   4. .github/workflows/v40-*.yml               (v40 workflow namespace)
//   5. tests/e2e/.llm-spend-ledger.json          (LLM cost ledger)
//   6. .github/CODEOWNERS                        (CODEOWNERS file itself)
//
// RED gate (Task 1): this file imports scripts/check-diff-guard.mjs which
// does NOT yet exist on disk. Vitest emits "Error: Failed to load url
// ../../scripts/check-diff-guard.mjs" which is the canonical RED signal.
// GREEN gate (Task 2): the helper is implemented, every it() block passes.

import { describe, it, expect } from 'vitest';

import {
  checkDiffGuard,
  FORBIDDEN_PATHS,
} from '../../scripts/check-diff-guard.mjs';

describe('check-diff-guard (Phase 41-01, VFY-GATE-04)', () => {
  describe('FORBIDDEN_PATHS bank', () => {
    it('exports exactly 6 regex patterns (LOCKED per Pitfall 3 Defense 2)', () => {
      expect(Array.isArray(FORBIDDEN_PATHS)).toBe(true);
      expect(FORBIDDEN_PATHS).toHaveLength(6);
      for (const re of FORBIDDEN_PATHS) {
        expect(re).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('checkDiffGuard() rejects forbidden paths', () => {
    // F1 — golden trigger file
    it('F1: rejects tests/test-cases.js', () => {
      const result = checkDiffGuard(['tests/test-cases.js']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/test-cases.js');
    });

    // F2 — golden baseline
    it('F2: rejects tests/golden/baseline.json', () => {
      const result = checkDiffGuard(['tests/golden/baseline.json']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/golden/baseline.json');
    });

    // F3 — quarantine corpus
    it('F3: rejects tests/e2e/test-cases-quarantine.js', () => {
      const result = checkDiffGuard(['tests/e2e/test-cases-quarantine.js']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/test-cases-quarantine.js');
    });

    // F4 — v40-* workflow (deps update)
    it('F4: rejects .github/workflows/v40-deps-update.yml (v40-* glob match)', () => {
      const result = checkDiffGuard(['.github/workflows/v40-deps-update.yml']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('.github/workflows/v40-deps-update.yml');
    });

    // F5 — v40-* workflow (the workflow this milestone ships)
    it('F5: rejects .github/workflows/v40-verifier-gate.yml (v40-* glob match)', () => {
      const result = checkDiffGuard(['.github/workflows/v40-verifier-gate.yml']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('.github/workflows/v40-verifier-gate.yml');
    });

    // F6 — LLM spend ledger
    it('F6: rejects tests/e2e/.llm-spend-ledger.json', () => {
      const result = checkDiffGuard(['tests/e2e/.llm-spend-ledger.json']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/.llm-spend-ledger.json');
    });

    // F7 — CODEOWNERS itself
    it('F7: rejects .github/CODEOWNERS', () => {
      const result = checkDiffGuard(['.github/CODEOWNERS']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('.github/CODEOWNERS');
    });
  });

  describe('checkDiffGuard() accepts legitimate paths', () => {
    // F8 — legitimate src path
    it('F8: accepts src/shared/matching.js (legitimate src/)', () => {
      const result = checkDiffGuard(['src/shared/matching.js']);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    // F9 — legitimate test path NOT in forbidden bank
    it('F9: accepts tests/unit/foo.test.js (legitimate test path)', () => {
      const result = checkDiffGuard(['tests/unit/foo.test.js']);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });

  describe('checkDiffGuard() edge cases', () => {
    // F10 — empty input
    it('F10: returns {ok:true, violations:[]} on empty input array', () => {
      const result = checkDiffGuard([]);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    // F11 — multi-violation input
    it('F11: returns {ok:false} listing EVERY violator when input has 2+ forbidden paths', () => {
      const result = checkDiffGuard([
        'tests/test-cases.js',
        'src/shared/matching.js', // legitimate, should NOT appear in violations
        '.github/CODEOWNERS',
        'tests/golden/baseline.json',
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/test-cases.js');
      expect(result.violations).toContain('.github/CODEOWNERS');
      expect(result.violations).toContain('tests/golden/baseline.json');
      expect(result.violations).not.toContain('src/shared/matching.js');
      expect(result.violations).toHaveLength(3);
    });

    // F12 — over-broad glob guard: v40-* must NOT match non-v40 workflows
    it('F12: does NOT reject .github/workflows/e2e-nightly.yml (v40-* glob must not match non-v40 workflows)', () => {
      const result = checkDiffGuard(['.github/workflows/e2e-nightly.yml']);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });
});

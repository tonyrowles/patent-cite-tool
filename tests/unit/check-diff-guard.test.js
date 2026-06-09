// tests/unit/check-diff-guard.test.js
//
// Phase 41 Plan 41-01 — VFY-GATE-04 (diff-guard regex bank for forbidden
// paths). Vitest contract suite for scripts/check-diff-guard.mjs.
//
// Mirrors the structure of tests/unit/check-deps-and-pr.test.js (Phase 40-02).
// All fixtures are inline path arrays — no new fixture files.
//
// LOCKED forbidden-paths bank (per 41-CONTEXT.md + PITFALLS Pitfall 3
// Defense 2, extended in Phase 45-02 for FLAKE-01/FLAKE-02 state-file integrity):
//   1. tests/test-cases.js                       (76-case golden trigger)
//   2. tests/golden/baseline.json                (golden baseline)
//   3. tests/e2e/test-cases-quarantine.js        (quarantine corpus)
//   4. .github/workflows/v40-*.yml               (v40 workflow namespace)
//   5. tests/e2e/.llm-spend-ledger.json          (LLM cost ledger)
//   6. .github/CODEOWNERS                        (CODEOWNERS file itself)
//   7. tests/e2e/.rerun-ring-buffer.json         (FLAKE 5-state ring buffer — Phase 45-02)
//   8. tests/e2e/.flake-suppression.json         (FLAKE_ESCALATION suppression — Phase 45-02)
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
    it('exports exactly 10 regex patterns (8 prior + 2 Phase 67 PITER-05 extensions)', () => {
      expect(Array.isArray(FORBIDDEN_PATHS)).toBe(true);
      expect(FORBIDDEN_PATHS).toHaveLength(10);
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

    // F13 — Phase 45-02 FLAKE ring buffer state file
    it('F13: rejects tests/e2e/.rerun-ring-buffer.json (Phase 45-02 FLAKE-01 state)', () => {
      const result = checkDiffGuard(['tests/e2e/.rerun-ring-buffer.json']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/.rerun-ring-buffer.json');
    });

    // F14 — Phase 45-02 FLAKE suppression file
    it('F14: rejects tests/e2e/.flake-suppression.json (Phase 45-02 FLAKE-02 state)', () => {
      const result = checkDiffGuard(['tests/e2e/.flake-suppression.json']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/.flake-suppression.json');
    });

    // F15 — Phase 67 PITER-05 fix-prompt-builder scaffold registry
    it('F15: rejects tests/e2e/lib/fix-prompt-builder.js (Phase 67 PITER-05)', () => {
      const result = checkDiffGuard(['tests/e2e/lib/fix-prompt-builder.js']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/lib/fix-prompt-builder.js');
    });

    // F16 — Phase 67 PITER-05 llm-router pure helper
    it('F16: rejects tests/e2e/lib/llm-router.js (Phase 67 PITER-05)', () => {
      const result = checkDiffGuard(['tests/e2e/lib/llm-router.js']);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/e2e/lib/llm-router.js');
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

    // F15-anchor — Phase 67 Pitfall 6: F15 regex must NOT match .bak/.orig suffix
    it('F15-anchor: does NOT match tests/e2e/lib/fix-prompt-builder.js.bak (anchor strictness)', () => {
      const result = checkDiffGuard(['tests/e2e/lib/fix-prompt-builder.js.bak']);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    // F16-anchor — Phase 67 Pitfall 6: F16 regex must NOT match subdir prefix
    it('F16-anchor: does NOT match vendor/tests/e2e/lib/llm-router.js (anchor strictness)', () => {
      const result = checkDiffGuard(['vendor/tests/e2e/lib/llm-router.js']);
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

    // F11 — multi-violation input (extended in Phase 45-02 to cover the 2 new paths)
    it('F11: returns {ok:false} listing EVERY violator when input has 2+ forbidden paths', () => {
      const result = checkDiffGuard([
        'tests/test-cases.js',
        'src/shared/matching.js', // legitimate, should NOT appear in violations
        '.github/CODEOWNERS',
        'tests/golden/baseline.json',
        'tests/e2e/.rerun-ring-buffer.json',  // Phase 45-02
        'tests/e2e/.flake-suppression.json',  // Phase 45-02
      ]);
      expect(result.ok).toBe(false);
      expect(result.violations).toContain('tests/test-cases.js');
      expect(result.violations).toContain('.github/CODEOWNERS');
      expect(result.violations).toContain('tests/golden/baseline.json');
      expect(result.violations).toContain('tests/e2e/.rerun-ring-buffer.json');
      expect(result.violations).toContain('tests/e2e/.flake-suppression.json');
      expect(result.violations).not.toContain('src/shared/matching.js');
      expect(result.violations).toHaveLength(5);
    });

    // F12 — over-broad glob guard: v40-* must NOT match non-v40 workflows
    it('F12: does NOT reject .github/workflows/e2e-nightly.yml (v40-* glob must not match non-v40 workflows)', () => {
      const result = checkDiffGuard(['.github/workflows/e2e-nightly.yml']);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });
});

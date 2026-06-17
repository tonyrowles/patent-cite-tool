// tests/unit/v4-touchpoints.test.js
//
// Phase 47 CLEANUP-01 — Pin the 5 v3.1→v4.0 ARCHITECTURE §4 touchpoint
// contracts with regression tests. Each TP-* nested describe block asserts
// the producer/consumer contract for one touchpoint. A one-sided rename of
// any producer symbol, consumer import, branch-name template, return-shape
// key, or triple-gate string will trip the corresponding test rather than
// silently halting the auto-fix pipeline at runtime.
//
// The 5 touchpoints (per .planning/research/ARCHITECTURE.md §4):
//   TP-01: triage label  — issue-payload-builder.js (producer only; v40-auto-fix.yml consumer retired in Phase 10)
//   TP-02: fingerprint() → auto-fix.mjs branch namer (fp8)
//   TP-03: invokeClaudePWithLedger → auto-fix.mjs subscription transport
//   TP-04: verifyCitation → verify-single-case.mjs CLI shim
//   TP-05: runPromote + _skipCiGuard triple-gate
//
// Pattern: file-as-text grep + dynamic-import for behavioural checks. See
// 47-RESEARCH.md §"Integration Touchpoint Catalog" lines 338-516.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('Phase 47 CLEANUP-01: 5 v3.1→v4.0 ARCHITECTURE §4 touchpoint contracts', () => {

  // ─── TP-01 ───────────────────────────────────────────────────────────
  // Phase 10 retirement: v40-auto-fix.yml consumer contract removed (RTR-02).
  // Only the producer (issue-payload-builder.js) assertions are retained.
  describe('TP-01-triage-label-filter', () => {
    it('producer (issue-payload-builder.js) labels array ends with literal "triage"', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'tests/e2e/lib/issue-payload-builder.js'),
        'utf8',
      );
      // Producer contract: labels = [category, 'e2e-nightly', 'triage']
      expect(src).toMatch(/labels\s*=\s*\[[^\]]*['"]triage['"][^\]]*\]/);
    });

    it('producer keeps the legacy e2e-nightly label alongside triage (no one-sided removal)', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'tests/e2e/lib/issue-payload-builder.js'),
        'utf8',
      );
      // Defense against an unrelated label-pruning refactor silently dropping triage.
      expect(src).toMatch(/['"]e2e-nightly['"]/);
      expect(src).toMatch(/['"]triage['"]/);
    });
  });

  // ─── TP-02 ───────────────────────────────────────────────────────────
  describe('TP-02-fingerprint-branch', () => {
    it('fingerprint() returns 12-hex lowercase', async () => {
      const mod = await import('../../scripts/e2e-report-issue.mjs');
      expect(typeof mod.fingerprint).toBe('function');
      const fp = mod.fingerprint('test-case', 'WRONG_CITATION', '');
      expect(fp).toMatch(/^[0-9a-f]{12}$/);
    });

    it('auto-fix.mjs branch-namer uses fp.slice(0,8) of fingerprint', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/auto-fix.mjs'),
        'utf8',
      );
      // Branch template: auto-fix/${issue}-${fp8}
      expect(src).toMatch(/auto-fix\/\$\{issue\}-\$\{fp8\}/);
      // fp8 derivation: fingerprint.slice(0, 8)
      expect(src).toMatch(/fingerprint\.slice\(0,\s*8\)/);
    });

    it('issue-body fingerprint comment template uses canonical <!-- fingerprint: ${fp} --> form', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/e2e-report-issue.mjs'),
        'utf8',
      );
      // The dedup grep target consumed by auto-fix.mjs parseFingerprintFromIssueBody.
      expect(src).toContain('<!-- fingerprint: ${fp} -->');
    });
  });

  // ─── TP-03 ───────────────────────────────────────────────────────────
  describe('TP-03-subscription-ledger', () => {
    it('llm-driver.js exports invokeClaudePWithLedger as a function', async () => {
      const mod = await import('../../tests/e2e/lib/llm-driver.js');
      expect(typeof mod.invokeClaudePWithLedger).toBe('function');
    });

    it('auto-fix.mjs subscription branch awaits invokeClaudePWithLedger', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/auto-fix.mjs'),
        'utf8',
      );
      expect(src).toMatch(/transport\s*===\s*['"]subscription['"]/);
      expect(src).toMatch(/await\s+invokeClaudePWithLedger\(/);
    });

    it('subscription transport return shape uses .ok / .ciGate / .capBlocked keys', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/auto-fix.mjs'),
        'utf8',
      );
      expect(src).toContain('sdkResult.ok');
      expect(src).toContain('sdkResult.ciGate');
      expect(src).toContain('sdkResult.capBlocked');
    });
  });

  // ─── TP-04 ───────────────────────────────────────────────────────────
  describe('TP-04-verify-single-case-shim', () => {
    it('pdf-verifier.js exports verifyCitation as a function', async () => {
      const mod = await import('../../tests/e2e/lib/pdf-verifier.js');
      expect(typeof mod.verifyCitation).toBe('function');
    });

    it('verify-single-case.mjs imports verifyCitation from canonical pdf-verifier.js path', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/verify-single-case.mjs'),
        'utf8',
      );
      expect(src).toMatch(
        /import\s+\{[^}]*verifyCitation[^}]*\}\s+from\s+['"][^'"]*tests\/e2e\/lib\/pdf-verifier\.js['"]/,
      );
    });

    it('verify-single-case.mjs has no local re-implementation of verifyCitation', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/verify-single-case.mjs'),
        'utf8',
      );
      // Guards against the shim drifting from single source of truth.
      expect(src).not.toMatch(/(?:export\s+)?(?:async\s+)?function\s+verifyCitation\s*\(/);
    });
  });

  // ─── TP-05 ───────────────────────────────────────────────────────────
  describe('TP-05-skipciguard-triple-gate', () => {
    it('promote-from-quarantine.mjs exports runPromote and threads _skipCiGuard', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/promote-from-quarantine.mjs'),
        'utf8',
      );
      expect(src).toMatch(/export\s+(async\s+)?function\s+runPromote/);
      expect(src).toContain('_skipCiGuard');
    });

    it('auto-fix-promote.mjs passes _skipCiGuard:true after asserting all 3 gate strings', () => {
      const src = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts/auto-fix-promote.mjs'),
        'utf8',
      );
      // Leg 1 — auto-fix:verified label.
      expect(src).toContain("'auto-fix:verified'");
      // Leg 2 — merged === true (or merged !== true negative check).
      expect(src).toMatch(/(merged\s*===?\s*true|merged\s*!==?\s*true)/);
      // Leg 3 — 'triage' source-issue label.
      expect(src).toContain("'triage'");
      // _skipCiGuard:true is passed to runPromote ONLY after the 3 gates pass.
      expect(src).toMatch(/_skipCiGuard:\s*true/);
    });

    it('behavioural rejection paths are covered by tests/unit/auto-fix-promote-gate.test.js (path exists)', () => {
      expect(
        fs.existsSync(path.join(REPO_ROOT, 'tests/unit/auto-fix-promote-gate.test.js')),
      ).toBe(true);
    });
  });
});

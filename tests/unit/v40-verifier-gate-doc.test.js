// tests/unit/v40-verifier-gate-doc.test.js
//
// Phase 41 Plan 41-04 — bit-rot guard for docs/v40-verifier-gate-manual-test.md.
//
// Purpose: the manual-test doc satisfies VFY-GATE-05 (Phase 41 Success
// Criterion 5: "A pushed auto-fix/test branch can demonstrate the gate
// end-to-end with no LLM involvement — manual exercise"). Phase 47 CLEANUP-03
// will RUN the procedure as one of five live HUMAN-UAT confirmations. If a
// future plan modifies .github/workflows/v40-verifier-gate.yml's expected
// sequence, success signal, or rejection paths, the doc MUST be updated in
// the same PR — these assertions force lockstep updates by failing CI when
// any of the pinned tokens drift.
//
// Coverage map (matches plan 41-04 Task 2 <behavior> D1-D9):
//   D1: doc exists on disk
//   D2: doc contains `## Prerequisites` heading
//   D3: doc contains `## Procedure` heading AND mentions `auto-fix/test` branch
//   D4: doc contains `## Expected Workflow Sequence` heading AND names all
//       four jobs (diff-guard, verifier-gate, regression-suite, ready-flip)
//   D5: doc contains `## Success Signal` heading AND mentions the draft to
//       ready transition
//   D6: doc contains `## Failure-Mode Catalog` heading AND references the
//       human-review-required label
//   D7: doc references the workflow file path
//       .github/workflows/v40-verifier-gate.yml exactly
//   D8: doc references at least one TEST_CASES id matching /US\d{7,}-/
//   D9: doc includes the literal `<!-- affected_cases:` HTML comment so a
//       reader can copy-paste the procedure verbatim
//
// Test style: matches tests/unit/check-deps-and-pr.test.js (Phase 40-02) and
// tests/unit/readme-structure.test.js (Phase 31) — ESM imports, fs.readFileSync
// in beforeAll, describe + it blocks with toContain / toMatch assertions.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DOC_PATH = path.resolve(PROJECT_ROOT, 'docs/v40-verifier-gate-manual-test.md');

describe('docs/v40-verifier-gate-manual-test.md structural contract (VFY-GATE-05 bit-rot guard)', () => {
  let doc;

  beforeAll(() => {
    // Read once; all D-cases assert against the same in-memory copy. If the
    // file does not exist, fs.readFileSync throws and D1's existsSync check
    // surfaces the missing-file failure with a clean error.
    if (fs.existsSync(DOC_PATH)) {
      doc = fs.readFileSync(DOC_PATH, 'utf8');
    }
  });

  it('D1: docs/v40-verifier-gate-manual-test.md exists', () => {
    expect(fs.existsSync(DOC_PATH)).toBe(true);
  });

  it('D2: contains `## Prerequisites` heading', () => {
    expect(doc).toMatch(/^## Prerequisites\b/m);
  });

  it('D3: contains `## Procedure` heading AND mentions `auto-fix/test` branch', () => {
    expect(doc).toMatch(/^## Procedure\b/m);
    expect(doc).toContain('auto-fix/test');
  });

  it('D4: contains `## Expected Workflow Sequence` heading AND names all four jobs', () => {
    expect(doc).toMatch(/^## Expected Workflow Sequence\b/m);
    expect(doc).toContain('diff-guard');
    expect(doc).toContain('verifier-gate');
    expect(doc).toContain('regression-suite');
    expect(doc).toContain('ready-flip');
  });

  it('D5: contains `## Success Signal` heading AND mentions draft to ready transition', () => {
    expect(doc).toMatch(/^## Success Signal\b/m);
    // The doc renders the transition multiple ways (e.g. "Draft to Ready",
    // "draft → ready_for_review", "Draft to Ready for review"). Assert on the
    // case-insensitive presence of both terms — order-agnostic.
    const lower = doc.toLowerCase();
    expect(lower).toContain('draft');
    expect(lower).toContain('ready');
  });

  it('D6: contains `## Failure-Mode Catalog` heading AND references human-review-required label', () => {
    expect(doc).toMatch(/^## Failure-Mode Catalog\b/m);
    expect(doc).toContain('human-review-required');
  });

  it('D7: references the workflow file path .github/workflows/v40-verifier-gate.yml exactly', () => {
    expect(doc).toContain('.github/workflows/v40-verifier-gate.yml');
  });

  it('D8: references at least one TEST_CASES id (regex /US\\d{7,}-/)', () => {
    expect(doc).toMatch(/US\d{7,}-/);
  });

  it('D9: includes the literal `<!-- affected_cases:` HTML comment for copy-paste', () => {
    expect(doc).toContain('<!-- affected_cases:');
  });

  it('D10: contains `## Cleanup` heading (closes the smoke-test loop)', () => {
    // Added beyond the 9 plan D-cases — the plan's <action> required a Cleanup
    // section and the acceptance criteria pins all 6 H2 headings. Asserting
    // here keeps the test self-contained as the canonical bit-rot guard.
    expect(doc).toMatch(/^## Cleanup\b/m);
  });
});

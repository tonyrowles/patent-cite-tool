// tests/unit/codeowners-pinned.test.js
//
// Phase 47 Plan 47-04 (CLEANUP-04) — static-grep guard pinning the 5
// .github/CODEOWNERS path entries in their CANONICAL last-matching-rule order.
//
// Complement to tests/unit/codeowners.test.js (Phase 39):
//   - Phase 39 test pins OWNERSHIP (every locked path → @tonyrowles, exactly
//     5 path lines, no forbidden aliases).
//   - THIS test pins ORDER (the 5 paths appear in the exact sequence required
//     by GitHub's last-matching-rule semantics; more-specific paths MUST
//     appear AFTER broader ones).
//
// Why order is load-bearing (Pitfall 5 — 47-RESEARCH.md):
//   GitHub's CODEOWNERS spec gives the *last* matching rule precedence. The
//   file currently lists:
//
//     /src/                                       @tonyrowles
//     /tests/                                     @tonyrowles
//     /.github/workflows/                         @tonyrowles
//     /tests/golden/                              @tonyrowles
//     /tests/e2e/test-cases-quarantine.js         @tonyrowles
//
//   tests/golden/baseline.json matches BOTH /tests/ AND /tests/golden/.
//   Because /tests/golden/ appears LATER, it wins — so golden-baseline edits
//   need the same single-maintainer pin. If an editor auto-format (or a
//   well-meaning alphabetical sort) re-orders the file so /tests/golden/
//   appears BEFORE /tests/, the broader /tests/ rule would silently shadow
//   the more-specific /tests/golden/ rule for any file that doesn't precisely
//   match the broader pattern's path-shape — and the trust invariant of "the
//   maintainer reviews every golden-baseline change" becomes a no-op without
//   any visible error.
//
//   The same reasoning applies to /tests/e2e/test-cases-quarantine.js, which
//   also matches /tests/; its rule MUST appear after /tests/.
//
// Test shape (per 47-RESEARCH.md §"Static-grep test design (vitest)"):
//   - 1 file-exists assertion
//   - 1 count assertion (exactly 5 active rules after filtering comments + blanks)
//   - 5 per-rule regex assertions verifying rule[i] matches the expected pattern
//     in canonical order
//   - 1 order-invariant assertion via findIndex — idxTests < idxGolden AND
//     idxTests < idxQuarantine (Pitfall 5 regression guard)
//   - 1 maintainer assertion — every rule pins @tonyrowles (defense-in-depth
//     overlap with Phase 39 Test 3; cheap)
//
// Reorder of the CODEOWNERS file (alphabetical sort, editor auto-format, or
// well-meaning "tidy" by a contributor) trips this test at `npm run test:src`
// before it reaches GitHub.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CODEOWNERS_PATH = path.join(REPO_ROOT, '.github', 'CODEOWNERS');

// Canonical last-matching-rule order — verified against .github/CODEOWNERS
// at Phase 47-04 planning time (2026-06-01). DO NOT REORDER without updating
// .github/CODEOWNERS in lockstep.
const EXPECTED_ORDER = [
  /^\/src\/\s+@/,
  /^\/tests\/\s+@/,
  /^\/\.github\/workflows\/\s+@/,
  /^\/tests\/golden\/\s+@/,
  /^\/tests\/e2e\/test-cases-quarantine\.js\s+@/,
];

// WR-01 (Phase 47 code review): defer the file read to beforeAll() so the
// "CODEOWNERS file exists" assertion below runs first. If .github/CODEOWNERS
// is ever deleted, the existence test produces a clear, targeted failure
// rather than a vitest collection-phase ENOENT stack trace.
let src = '';
let rules = [];
beforeAll(() => {
  if (fs.existsSync(CODEOWNERS_PATH)) {
    src = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    rules = src
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => line.trim());
  }
});

describe('Phase 47 CLEANUP-04: CODEOWNERS pins (last-matching-rule order)', () => {
  it('CODEOWNERS file exists at .github/CODEOWNERS', () => {
    expect(fs.existsSync(CODEOWNERS_PATH)).toBe(true);
  });

  it('contains exactly 5 active rules (comments + blank lines filtered out)', () => {
    expect(rules.length).toBe(5);
  });

  // 5 per-rule regex assertions — order is load-bearing.
  EXPECTED_ORDER.forEach((re, i) => {
    it(`rule ${i + 1} matches ${re}`, () => {
      expect(rules[i]).toMatch(re);
    });
  });

  it('more-specific paths appear AFTER broader ones (last-matching-rule semantics)', () => {
    // Pitfall 5 regression guard — if /tests/golden/ or
    // /tests/e2e/test-cases-quarantine.js drifts to BEFORE /tests/, the
    // broader /tests/ rule silently shadows it.
    const idxTests = rules.findIndex((r) => r.startsWith('/tests/ '));
    const idxGolden = rules.findIndex((r) => r.startsWith('/tests/golden/'));
    const idxQuarantine = rules.findIndex((r) =>
      r.startsWith('/tests/e2e/test-cases-quarantine.js'),
    );
    expect(idxTests).toBeGreaterThanOrEqual(0);
    expect(idxGolden).toBeGreaterThanOrEqual(0);
    expect(idxQuarantine).toBeGreaterThanOrEqual(0);
    expect(idxTests).toBeLessThan(idxGolden);
    expect(idxTests).toBeLessThan(idxQuarantine);
  });

  it('all 5 rules use single maintainer @tonyrowles', () => {
    rules.forEach((r) => expect(r).toContain('@tonyrowles'));
  });
});

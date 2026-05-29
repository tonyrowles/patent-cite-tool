// tests/unit/quarantine-spec-import.test.js
//
// Phase 38 Plan 01 — INT-FIX-01 regression contract.
//
// Asserts that tests/e2e/specs/quarantine.spec.js consumes
// QUARANTINE_REPORT_FILENAME via an ESM import from
// scripts/e2e-report-issue.mjs (the single source of truth) and does NOT
// locally re-declare the constant.
//
// Closes the silent-zero-filings risk from a one-sided rename: with this
// contract pinned, a future rename in scripts/e2e-report-issue.mjs surfaces
// as an ESM import error at spec load time instead of producing a tally
// of zero quarantine filings (QUAR-01 / QUAR-04).
//
// The test reads the spec file as text via node:fs (not import()) because
// importing the spec triggers Playwright runtime initialization.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, '../e2e/specs/quarantine.spec.js');

describe('INT-FIX-01: quarantine.spec.js imports QUARANTINE_REPORT_FILENAME', () => {
  const src = fs.readFileSync(SPEC_PATH, 'utf8');

  it('imports QUARANTINE_REPORT_FILENAME from scripts/e2e-report-issue.mjs', () => {
    // The contract: import must reference the script that owns the constant.
    expect(src).toMatch(
      /import\s+\{[^}]*QUARANTINE_REPORT_FILENAME[^}]*\}\s+from\s+['"][^'"]*scripts\/e2e-report-issue\.mjs['"]/
    );
  });

  it('does NOT locally re-declare QUARANTINE_REPORT_FILENAME', () => {
    // No `const QUARANTINE_REPORT_FILENAME = ...` allowed — the constant must
    // come from the import only.
    expect(src).not.toMatch(/^const\s+QUARANTINE_REPORT_FILENAME\s*=/m);
  });
});

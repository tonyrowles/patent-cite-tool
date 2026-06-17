// tests/unit/v61-ingest-reports-yaml.test.js
//
// Phase 11 Plan 03 — static-grep guards for .github/workflows/v61-ingest-reports.yml.
//
// Pins:
//   PROMO-04: trigger is workflow_dispatch ONLY (no schedule/push/pull_request)
//   TRI-07:   actions/upload-artifact + triage-report path + retention-days present
//   COST-02:  max_fixes input default is '5' (never '10')
//
// Pattern: readFileSync + grep, copied from tests/unit/eslint-sdk-guard.test.js lines 17–32.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'v61-ingest-reports.yml');

describe('v61-ingest-reports.yml static guards (PROMO-04, TRI-07, COST-02)', () => {
  it('workflow file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('PROMO-04: trigger is workflow_dispatch only (no schedule/push/pull_request)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/workflow_dispatch/);
    expect(text).not.toMatch(/^\s+schedule:/m);
    expect(text).not.toMatch(/^\s+push:/m);
    expect(text).not.toMatch(/^\s+pull_request:/m);
  });

  it('TRI-07: includes actions/upload-artifact step with triage-report path', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/actions\/upload-artifact/);
    expect(text).toMatch(/triage-report/);
  });

  it('TRI-07: artifact retention-days is set', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/retention-days/);
  });

  it('issues: write permission is present (load-bearing for gh issue create)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/issues:\s*write/);
  });

  it('COST-02: max_fixes input default is 5 (not 10)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    // default: '5' must appear in the max_fixes input block
    expect(text).toMatch(/default:\s*'5'/);
    // default: '10' must NOT appear anywhere
    expect(text).not.toMatch(/default:\s*'10'/);
  });

  it('workflow runs ingest-reports.mjs', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/ingest-reports\.mjs/);
  });

  it('upload-artifact step uses if: always() for partial-failure resilience (D-11)', () => {
    const text = fs.readFileSync(YAML_PATH, 'utf8');
    expect(text).toMatch(/if:\s*always\(\)/);
  });
});

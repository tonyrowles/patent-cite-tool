/**
 * web-ext lint invariant guard test.
 *
 * Phase 24 (v2.3) ratifies that the Firefox dist passes
 * `web-ext lint` with errors: 0 and warnings: 0 — making the extension
 * submission-ready for the Firefox Add-ons store. The enforcement
 * chain is:
 *
 *   1. package.json scripts.test:lint defines the canonical command.
 *   2. package.json scripts.test chains test:lint as the final gate.
 *   3. .github/workflows/ci.yml runs `npm run test:lint` on every push
 *      and PR via the step named `Test — lint (web-ext lint)`.
 *
 * If any link in this chain is removed or weakened, AMO submissions
 * can break silently. This test is a static-grep guard: it reads
 * package.json and the CI workflow file and asserts the literals
 * remain present, so a regression surfaces in the unit-test suite
 * (which runs before the lint step) rather than only when a Firefox
 * reviewer rejects a submission months later.
 *
 * The `--ignore-files 'lib/**'` flag is justified: `lib/` contains
 * the upstream PDF.js bundle (pdf.mjs + pdf.worker.mjs) which AMO
 * reviewers accept as a third-party library. The DANGEROUS_EVAL and
 * UNSAFE_VAR_ASSIGNMENT warnings inside PDF.js are upstream patterns
 * and not actionable from this codebase.
 *
 * See: .planning/phases/24-firefox-amo-validation-cleanup/24-CONTEXT.md
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');

const PACKAGE_JSON = resolve(ROOT, 'package.json');
const CI_WORKFLOW = resolve(ROOT, '.github/workflows/ci.yml');

const EXPECTED_TEST_LINT =
  "npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'";
const EXPECTED_CI_STEP_NAME = 'Test — lint (web-ext lint)';

function readPackageJson() {
  return JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
}

function readCiWorkflow() {
  return readFileSync(CI_WORKFLOW, 'utf-8');
}

describe('web-ext lint invariant (Phase 24 / FOX-06)', () => {
  it("L1: package.json scripts['test:lint'] is the canonical literal", () => {
    const pkg = readPackageJson();
    expect(pkg.scripts['test:lint']).toBe(EXPECTED_TEST_LINT);
  });

  it('L2: package.json scripts.test chains test:lint as the final gate', () => {
    const pkg = readPackageJson();
    expect(pkg.scripts.test.endsWith('test:lint')).toBe(true);
  });

  it('L3: CI workflow invokes `npm run test:lint`', () => {
    const ci = readCiWorkflow();
    expect(ci).toContain('npm run test:lint');
  });

  it('L4: CI workflow has the canonical step name (em-dash U+2014)', () => {
    const ci = readCiWorkflow();
    expect(ci).toContain(EXPECTED_CI_STEP_NAME);
  });

  it('L5: CI workflow does not mute any step with continue-on-error: true', () => {
    // Defensive: a future PR that adds `continue-on-error: true` to
    // the lint step would silently allow AMO-blocking warnings to
    // ship. This assertion checks the whole file for the literal —
    // if a legitimate use of continue-on-error is later required on
    // an unrelated step, this test should be tightened to parse
    // YAML and check only the lint step. For now, the file contains
    // NO continue-on-error directives.
    const ci = readCiWorkflow();
    expect(ci).not.toContain('continue-on-error: true');
  });
});

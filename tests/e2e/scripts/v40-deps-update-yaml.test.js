// tests/e2e/scripts/v40-deps-update-yaml.test.js
//
// Phase 40 Plan 40-03 (DEPS-01 + DEPS-02 + DEPS-03 + Pitfall 4 defenses) —
// grep-based YAML assertions for .github/workflows/v40-deps-update.yml.
//
// Zero new dependencies — reads the YAML (and the partition script for D5)
// as plain text and asserts meaningful tokens with string/regex checks. No
// js-yaml, no yaml-lint.
//
// Test groups (per 40-03-PLAN.md):
//   D1-D11: load-bearing primitives mapped from 40-RESEARCH.md lines 298-310
//   X1-X8:  extra Phase 40 safety pins (token shape, branch shape,
//           delete-branch on both PR steps, body-path, deps-update-gate
//           job name slot reservation, concurrency, manual-sdk-review,
//           permission minimization)
//
// RED-state contract: in Task 1's commit, .github/workflows/v40-deps-update.yml
// does NOT yet exist. beforeAll() will throw ENOENT on the readFileSync,
// failing every test in the file. The Task 1 commit is RED. Task 2 creates
// the workflow file and all 19 cases flip GREEN.
//
// Defenses pinned (40-RESEARCH.md PITFALLS.md + 40-CONTEXT.md):
//   - Pitfall 4 / D7,D10,D11,X1: draft:true, no auto-merge, GITHUB_TOKEN not PAT
//   - 40-CONTEXT locked decision #4 / X2,X3: constant per-package branches + delete-branch:true
//   - 40-RESEARCH 651-665 / X5: deps-update-gate job NAME slot reservation
//   - Pitfall 1 step 7 / X8: permissions block minimization (no id-token/actions:write)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-deps-update.yml');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/check-deps-and-pr.mjs');

let yaml;
let script;

beforeAll(() => {
  // RED state: this throws ENOENT until Task 2 creates the workflow file.
  // Intentional — see file header. Do NOT add a skipIf guard.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
  script = fs.readFileSync(SCRIPT_PATH, 'utf8');
});

describe('v40-deps-update.yml contract (Phase 40-03)', () => {

  it("D1 — cron '0 9 * * 1' (Monday 09:00 UTC EXACT)", () => {
    // 40-CONTEXT locked decision #2 / DEPS-01 cron pin
    expect(yaml).toContain("cron: '0 9 * * 1'");
  });

  it('D2 — workflow_dispatch present (manual trigger)', () => {
    expect(yaml).toContain('workflow_dispatch');
  });

  it('D3 — permissions: contents:write + pull-requests:write + issues:write', () => {
    // contents:write — peter-evans/cpr@v8 pushes branches
    expect(yaml).toContain('contents: write');
    // pull-requests:write — create/update PRs
    expect(yaml).toContain('pull-requests: write');
    // issues:write — gh issue create for manual-sdk-review
    expect(yaml).toContain('issues: write');
  });

  it('D4 — timeout-minutes in 15-30 (npm ci + script + nightly suite)', () => {
    expect(yaml).toMatch(/timeout-minutes:\s*(1[5-9]|2\d|30)/);
  });

  it('D5 — Watchlist tokens present in scripts/check-deps-and-pr.mjs', () => {
    // The watchlist freeze itself is unit-tested in 40-02; this assertion
    // verifies the workflow is wired against the right script (D8) AND that
    // the script the workflow invokes still carries the load-bearing tuple.
    for (const pkg of [
      '@playwright/test',
      'pdfjs-dist',
      'sharp',
      'vitest',
      'esbuild',
      '@anthropic-ai/sdk',
    ]) {
      expect(script).toContain(`'${pkg}'`);
    }
  });

  it('D6 — peter-evans/create-pull-request@v8 referenced at least twice (security + minor partitions)', () => {
    expect(yaml).toContain('peter-evans/create-pull-request@v8');
    const matches = yaml.match(/peter-evans\/create-pull-request@v8/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Negative pin: no unpinned @main or major-less variant
    expect(yaml).not.toMatch(/peter-evans\/create-pull-request@main/);
    expect(yaml).not.toMatch(/peter-evans\/create-pull-request(\s|$)/);
  });

  it('D7 — draft: true on PR steps (Pitfall 4 defense)', () => {
    expect(yaml).toContain('draft: true');
  });

  it('D8 — node scripts/check-deps-and-pr.mjs invocation present', () => {
    expect(yaml).toContain('node scripts/check-deps-and-pr.mjs');
  });

  it('D9 — [skip ci] NOT present (deps-update commits are PR commits, not self-commits)', () => {
    expect(yaml).not.toContain('[skip ci]');
  });

  it('D10 — gh pr merge --auto NOT present (Pitfall 4 defense)', () => {
    expect(yaml).not.toContain('gh pr merge --auto');
  });

  it('D11 — auto-merge: true NOT present (Pitfall 4 defense — different shape, same surface)', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('X1 — token is secrets.GITHUB_TOKEN (NOT a PAT)', () => {
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    // Negative pin: any secrets.*PAT* literal fails this test
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });

  it('X2 — Constant per-package branch names referenced via step outputs', () => {
    // 40-CONTEXT locked decision #4 — constant per-package branch names
    expect(yaml).toContain('v40-deps-update/');
    // The workflow consumes script outputs (security_branch + minor_branch)
    expect(yaml).toContain('steps.scan.outputs.security_branch');
    expect(yaml).toContain('steps.scan.outputs.minor_branch');
  });

  it('X3 — delete-branch: true on BOTH PR steps', () => {
    const matches = yaml.match(/delete-branch:\s*true/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('X4 — body-path: points at /tmp/{security,minor}-pr-body.md (no embedded body:)', () => {
    expect(yaml).toMatch(/body-path:\s*\/tmp\/security-pr-body\.md/);
    expect(yaml).toMatch(/body-path:\s*\/tmp\/minor-pr-body\.md/);
  });

  it('X5 — deps-update-gate job exists by exact NAME (Phase 47 slot reservation)', () => {
    // Job key at YAML indent level (2 spaces inside jobs:). 40-RESEARCH 651-665
    expect(yaml).toMatch(/^\s+deps-update-gate:/m);
    // The gate invokes the nightly suite — e2e-nightly.yml uses
    // `npx playwright test ... specs/regression.spec.js` (smoke + regression
    // probes; not bare `npm run e2e:smoke|regression` scripts). The deps-
    // update-gate mirrors that shape — at minimum it must invoke playwright
    // against the regression spec.
    expect(yaml).toMatch(/npx playwright test/);
    expect(yaml).toMatch(/specs\/regression\.spec\.js/);
  });

  it('X6 — concurrency.group: v40-deps-update with cancel-in-progress: false', () => {
    expect(yaml).toContain('group: v40-deps-update');
    expect(yaml).toContain('cancel-in-progress: false');
  });

  it('X7 — manual-SDK-review issue creation step exists (40-RESEARCH line 716)', () => {
    expect(yaml).toMatch(/gh issue create[\s\S]*manual-sdk-review/i);
    // Gated on the script's skipped_count output
    expect(yaml).toContain('steps.scan.outputs.skipped_count');
  });

  it('X8 — permissions minimization (no id-token:write or actions:write)', () => {
    expect(yaml).not.toContain('id-token: write');
    expect(yaml).not.toContain('actions: write');
  });

});

// tests/e2e/scripts/e2e-weekly-digest-yaml.test.js
//
// Phase 37 Plan 37-03 (DIGEST-02, DIGEST-03) — grep-based YAML assertions
// for .github/workflows/e2e-weekly-digest.yml.
//
// Zero new dependencies (zero-new-dep lock) — reads the YAML as plain text and
// asserts meaningful tokens with string checks. No js-yaml, no yaml-lint.
//
// Tests:
//   Y1 — cron + dispatch: Monday 07:00 UTC cron and workflow_dispatch present
//   Y2 — permissions (load-bearing security gate): all three write permissions present
//        (issues: write is the one D-09 omitted; it is required for gh issue create)
//   Y3 — label-ensure: e2e-digest label created with --force
//   Y4 — invocation: weekly-digest script called with DIGEST_PUBLISH_MODE: issue
//   Y5 — commit-in-run: git add/commit/push present with [skip ci] token
//   Y6 — no-ledger-override guard: E2E_LEDGER_PATH_OVERRIDE must NOT appear
//        (llm-ledger.js:85 throws in CI if this is set)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/e2e-weekly-digest.yml');

let yaml;

beforeAll(() => {
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('e2e-weekly-digest.yml contract (Phase 37-03)', () => {

  it('Y1 — cron + dispatch: Monday 07:00 UTC cron and workflow_dispatch present', () => {
    // D-09: schedule cron must be exactly Monday 07:00 UTC
    expect(yaml).toContain("cron: '0 7 * * 1'");
    // Manual trigger must be present for testing
    expect(yaml).toContain('workflow_dispatch');
  });

  it('Y2 — permissions (load-bearing security gate): all three write permissions present', () => {
    // contents: write — commit-in-run (D-09, D-11)
    expect(yaml).toContain('contents: write');
    // discussions: write — dormant createDiscussion path (D-09)
    expect(yaml).toContain('discussions: write');
    // issues: write — LOAD-BEARING: the ACTIVE gh issue create 403s without it.
    // D-09 omitted this permission; RESEARCH §Security lines 494-498 flagged the gap.
    expect(yaml).toContain('issues: write');
  });

  it('Y3 — label-ensure: e2e-digest label created with --force', () => {
    // D-07: label must be self-bootstrapped before publish step
    expect(yaml).toContain('gh label create "e2e-digest"');
    // --force ensures idempotent update if label already exists
    expect(yaml).toContain('--force');
  });

  it('Y4 — invocation: weekly-digest script called with DIGEST_PUBLISH_MODE: issue', () => {
    // D-13/D-06: the script must be invoked via the npm script
    expect(yaml).toContain('weekly-digest');
    // D-06: force the active issue-fallback path in the workflow
    expect(yaml).toContain('DIGEST_PUBLISH_MODE: issue');
  });

  it('Y5 — commit-in-run: git add/commit/push with [skip ci] load-bearing token', () => {
    // D-11 / DIGEST-03: reports committed in-run (idempotent)
    expect(yaml).toContain('git add reports/weekly-digest-*.md');
    // Idempotent commit — no-op when unchanged (git diff --cached --quiet || git commit)
    expect(yaml).toContain('git diff --cached --quiet || git commit');
    // Push the commit back to the repo
    expect(yaml).toContain('git push');
    // [skip ci] is LOAD-BEARING — prevents bot push from re-triggering ci.yml
    // (T-37-03-02; RESEARCH Pitfall 3). Must be explicitly present.
    expect(yaml).toContain('[skip ci]');
  });

  it('Y6 — no-ledger-override guard: E2E_LEDGER_PATH_OVERRIDE absent (throws in CI)', () => {
    // llm-ledger.js:85 throws at runtime in CI if E2E_LEDGER_PATH_OVERRIDE is set.
    // T-37-03-05: this env var must NEVER appear in the weekly digest workflow.
    expect(yaml).not.toContain('E2E_LEDGER_PATH_OVERRIDE');
  });

});

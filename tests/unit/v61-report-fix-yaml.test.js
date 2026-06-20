// tests/unit/v61-report-fix-yaml.test.js
//
// Phase 14 (ADR-001) — YAML-contract pins for the NOTIFY-ONLY
// .github/workflows/v61-report-fix.yml.
//
// The Phase 12 design ran LLM fix generation in CI via the Anthropic API
// (KV fetch -> 3-iteration loop -> ledger snapshot -> draft PR). That path moved
// LOCAL to the Claude Code subscription transport (npm run fix-report, ADR-001),
// because invokeClaudePWithLedger refuses in CI and hosted runners cannot reach
// the operator's Claude Code auth. This workflow is now notify-only.
//
// These pins assert (a) the surviving safe shape, (b) the absence of the retired
// API/KV/PR-creation machinery, and (c) the preserved invariants: issues:labeled
// trigger, report-fix-candidate scope gate, shell-injection safety (untrusted
// Issue fields via env: not run:), and GATE-04 (no automated merge).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'v61-report-fix.yml');

let yaml;
try {
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
} catch {
  yaml = null;
}

describe('v61-report-fix.yml static guards (notify-only, ADR-001)', () => {

  it('workflow file exists', () => {
    expect(yaml).not.toBeNull();
  });

  // --- Surviving trigger + scope gate ---------------------------------------

  it('trigger is issues:labeled (not workflow_dispatch, push, pull_request, schedule)', () => {
    expect(yaml).toMatch(/^\s*issues:/m);
    expect(yaml).toMatch(/types:\s*\[labeled\]/);
    expect(yaml).not.toMatch(/^\s+workflow_dispatch:/m);
    expect(yaml).not.toMatch(/^\s+schedule:/m);
    expect(yaml).not.toMatch(/^\s+push:/m);
    expect(yaml).not.toMatch(/^\s+pull_request:\s*$/m);
  });

  it('report-fix-candidate scope gate present', () => {
    expect(yaml).toContain('report-fix-candidate');
  });

  it('notify step points operators at the local fix-report command', () => {
    expect(yaml).toContain('npm run fix-report');
  });

  // --- Shell-injection safety (CWE-94) --------------------------------------
  // Untrusted Issue fields must be passed via env:, never interpolated into a
  // run: script where GitHub would expand them into the shell before execution.

  it('label.name is NOT interpolated directly into a run: script', () => {
    // It may appear in an env: block; it must not appear as a bare ${{ }} that
    // the shell would parse. Assert no run-script line contains the expression.
    const runLines = yaml.split('\n').filter((l) => l.includes('${{ github.event.label.name }}'));
    for (const line of runLines) {
      // The only allowed occurrence is an env assignment (key: ${{ ... }}).
      expect(line).toMatch(/^\s*[A-Z_]+:\s*\$\{\{ github\.event\.label\.name \}\}\s*$/);
    }
  });

  it('issue.body is never referenced (no body interpolation at all)', () => {
    // The retired extract-KV-key step read github.event.issue.body; notify-only
    // has no reason to touch it. Asserting absence keeps the injection surface nil.
    expect(yaml).not.toContain('github.event.issue.body');
  });

  // --- Retired CI machinery must be ABSENT ----------------------------------

  it('no Anthropic API key in CI (LLM moved to local subscription)', () => {
    expect(yaml).not.toContain('ANTHROPIC_API_KEY');
  });

  it('no wrangler KV fetch in CI', () => {
    expect(yaml).not.toContain('wrangler');
  });

  it('no Cloudflare credentials in CI', () => {
    expect(yaml).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(yaml).not.toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('does not invoke the report-fix dispatcher in CI', () => {
    expect(yaml).not.toMatch(/node scripts\/report-fix\.mjs/);
  });

  it('does not create a PR in CI (created locally instead)', () => {
    expect(yaml).not.toContain('peter-evans/create-pull-request');
  });

  it('no in-CI ledger snapshot push', () => {
    expect(yaml).not.toContain('ledger-snapshots/report-fix-');
    expect(yaml).not.toContain('tests/e2e/.llm-spend-ledger.json');
  });

  // --- GATE-04: no automated merge (preserved invariant) --------------------

  it('GATE-04: gh pr merge --auto NOT present', () => {
    expect(yaml).not.toContain('gh pr merge --auto');
  });

  it('GATE-04: auto-merge: true NOT present', () => {
    expect(yaml).not.toContain('auto-merge: true');
  });

  it('GATE-04: --enable-auto-merge NOT present', () => {
    expect(yaml).not.toContain('--enable-auto-merge');
  });

  // --- Hygiene --------------------------------------------------------------

  it('does not self-apply auto-fix:verified (verifier-gate grants it)', () => {
    expect(yaml).not.toContain('auto-fix:verified');
  });

  it('no continue-on-error: true', () => {
    expect(yaml).not.toContain('continue-on-error: true');
  });

  it('references ADR-001 (the transport-move rationale)', () => {
    expect(yaml).toContain('ADR-001');
  });

});

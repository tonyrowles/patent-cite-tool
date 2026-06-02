// tests/unit/blocker-01-label-producer.test.js
//
// Phase 47 CLEANUP (audit-milestone integration check, 2026-06-02) — pin the
// BLOCKER-01 fix: the verifier-gate workflow MUST add the `auto-fix:verified`
// label to a PR after the ready-flip succeeds, otherwise the downstream
// v40-auto-promote.yml job-level filter (line 67) never matches and the
// PROMOTE-01..04 chain is dead code at the workflow level.
//
// Why this test exists (TP-05 scope gap):
//   tests/unit/v4-touchpoints.test.js TP-05 (describe `TP-05-skipciguard-
//   triple-gate`) pins the CONSUMER side — scripts/auto-fix-promote.mjs
//   contains the literal 'auto-fix:verified' string and the triple-gate
//   throws on absence. But TP-05 never asserts that any workflow APPLIES
//   the label. The audit-milestone integration check (a cross-workflow
//   trace, not a per-touchpoint test) surfaced that no producer existed.
//   ARCHITECTURE.md:141 specified the producer; the Phase 41 implementation
//   missed it; UAT-47-a (the live end-to-end test that would have caught
//   this on first run) was correctly DEFERRED per CONTEXT.md `requires-push`
//   semantics. This test pins the producer so a future one-sided removal
//   trips at `npm run test:src` before reaching GitHub.
//
// Test shape (mirrors tests/unit/codeowners-pinned.test.js — WR-01 pattern):
//   - 1 file-exists assertion
//   - 1 assertion: `gh label create auto-fix:verified` (idempotent creation)
//   - 1 assertion: `gh pr edit ... --add-label "auto-fix:verified"` (apply)
//   - 1 assertion: the apply step lives in the ready-flip job (not diff-guard
//     or another job — must run AFTER both verifier-gate and regression-suite
//     succeed, since ready-flip has `needs: [verifier-gate, regression-suite]`)
//
// WR-01 pattern: defer the file read to beforeAll() so the file-exists test
// runs first. If .github/workflows/v40-verifier-gate.yml is ever deleted,
// the existence test produces a clear, targeted failure rather than a
// vitest collection-phase ENOENT stack trace.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW_PATH = path.join(
  REPO_ROOT,
  '.github',
  'workflows',
  'v40-verifier-gate.yml',
);

let yaml = '';
beforeAll(() => {
  if (fs.existsSync(WORKFLOW_PATH)) {
    yaml = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  }
});

describe('Phase 47 BLOCKER-01: verifier-gate producer for auto-fix:verified label', () => {
  it('v40-verifier-gate.yml exists at .github/workflows/v40-verifier-gate.yml', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  it('contains idempotent label creation: gh label create auto-fix:verified', () => {
    // Match `gh label create auto-fix:verified` with optional line-continuation
    // backslashes and flag ordering. Tolerant of YAML re-indentation.
    expect(yaml).toMatch(/gh\s+label\s+create\s+auto-fix:verified/);
  });

  it('contains apply step: gh pr edit ... --add-label "auto-fix:verified"', () => {
    // Match `gh pr edit "$PR_NUMBER" --add-label "auto-fix:verified"` —
    // PR_NUMBER is the workflow-trusted env-hop value; the label name is the
    // load-bearing string. Tolerant of single- vs double-quoted label.
    expect(yaml).toMatch(
      /gh\s+pr\s+edit\s+"?\$PR_NUMBER"?\s+--add-label\s+["']auto-fix:verified["']/,
    );
  });

  it('apply-label step lives in the ready-flip job (after both gates pass)', () => {
    // The ready-flip job has `needs: [verifier-gate, regression-suite]` —
    // GitHub Actions will not invoke its steps unless both prior jobs
    // succeed. Asserting that the add-label call lives inside ready-flip
    // (and not, e.g., in diff-guard which could fire on rejection) confirms
    // the label is only applied to PRs that actually passed verification.
    //
    // Strategy: slice the YAML between the `ready-flip:` job header and the
    // next top-level job marker (or EOF) and assert the add-label call lives
    // inside that slice. Two-space-indented job headers are the canonical
    // shape across this file (see diff-guard, verifier-gate, regression-suite,
    // ready-flip — all at column 3).
    const readyFlipStart = yaml.indexOf('\n  ready-flip:');
    expect(readyFlipStart).toBeGreaterThanOrEqual(0);
    // Find the next two-space-indented top-level job marker after ready-flip
    // (currently there is none — ready-flip is the last job — so slice runs
    // to EOF). The regex matches /\n  [a-z][a-z0-9-]*:\n/ which is the
    // canonical job-header shape, EXCLUDING the matched newline-before so we
    // don't trip on top-level `permissions:` or `concurrency:` keys.
    const remainder = yaml.slice(readyFlipStart + 1);
    const nextJobMatch = remainder.slice(1).match(/\n  [a-z][a-z0-9-]*:\n/);
    const readyFlipBlock = nextJobMatch
      ? remainder.slice(0, 1 + nextJobMatch.index)
      : remainder;
    expect(readyFlipBlock).toMatch(
      /gh\s+pr\s+edit\s+"?\$PR_NUMBER"?\s+--add-label\s+["']auto-fix:verified["']/,
    );
    // Also assert the idempotent label-create step lives in the same job —
    // otherwise the first run on a fresh repo could fail because the label
    // does not exist yet (gh pr edit --add-label refuses unknown labels).
    expect(readyFlipBlock).toMatch(/gh\s+label\s+create\s+auto-fix:verified/);
  });
});

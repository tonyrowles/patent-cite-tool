// tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js
//
// Phase 40 Plan 40-04 (DEPS-04 / Pitfall 6 defense) — YAML-level grep
// contract for .github/workflows/v40-pdfjs-frame-shift.yml.
//
// Mirrors tests/e2e/scripts/e2e-weekly-digest-yaml.test.js for structure
// (zero new dependencies — reads YAML as plain text, asserts via grep /
// toMatch / toContain). The workflow is a SEPARATE file (per 40-CONTEXT
// locked decision #3); these 15 assertions pin the load-bearing trigger
// surface, env-var contract, permission shape, and the FRAME-SHIFT
// DETECTED error-string sentinel.
//
// Tests:
//   P1  — `pull_request` trigger surface present
//   P2  — `auto-fix:pdfjs-bump` label name pinned
//   P3  — `VERIFIER_PDFJS_PATH` env-var name pinned
//   P4  — `/tmp/old-pdfjs` install location pinned
//   P5  — OLD pdfjs install pulls `steps.delta.outputs.prev`
//   P6  — actions/checkout@v5 + actions/setup-node@v5 pinned
//   P7  — node-version: 22 (literal — no .nvmrc indirection in this workflow)
//   P8  — `contents: read` permission present
//   P9  — `contents: write` permission ABSENT (read-only workflow)
//   P10 — `pull-requests: write` permission ABSENT (no PR comments in Phase 40)
//   P11 — `peter-evans/create-pull-request` action ABSENT (40-03 owns PR creation)
//   P12 — `secrets.*PAT*` references ABSENT (only GITHUB_TOKEN implicit)
//   P13 — timeout-minutes in [20, 30] range
//   P14 — `FRAME-SHIFT DETECTED` error-string sentinel pinned
//   P15 — `concurrency:` + `cancel-in-progress:` policy explicit

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(
  PROJECT_ROOT,
  '.github/workflows/v40-pdfjs-frame-shift.yml',
);

let yaml;

beforeAll(() => {
  // No skipIf guard — this test file IS the RED gate. The first commit
  // creates this file and the file is not yet on disk → beforeAll throws
  // ENOENT and the suite goes RED. The second commit creates the YAML
  // and all 15 cases go GREEN.
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('v40-pdfjs-frame-shift.yml contract (Phase 40-04 / DEPS-04)', () => {
  it('P1: pull_request trigger surface present', () => {
    expect(yaml).toContain('pull_request');
  });

  it('P2: auto-fix:pdfjs-bump label name pinned', () => {
    // 40-CONTEXT locked decision: label is APPLIED MANUALLY by the human
    // reviewer of a v40-deps-update/pdfjs-dist-* PR. Future phases automate
    // label application via a separate workflow.
    expect(yaml).toContain('auto-fix:pdfjs-bump');
  });

  it('P3: VERIFIER_PDFJS_PATH env-var name pinned', () => {
    // The override env-var read by tests/e2e/lib/pdf-verifier.js. Without
    // this pin, a refactor could silently rename the variable on one side
    // (workflow OR verifier) and the frame-shift detection would degrade
    // to "always passes" (no OLD-pdfjs comparison actually performed).
    expect(yaml).toContain('VERIFIER_PDFJS_PATH');
  });

  it('P4: /tmp/old-pdfjs install location pinned', () => {
    expect(yaml).toContain('/tmp/old-pdfjs');
  });

  it('P5: install pulls steps.delta.outputs.prev (previous pdfjs version)', () => {
    expect(yaml).toMatch(
      /npm install pdfjs-dist@\$\{\{ steps\.delta\.outputs\.prev/,
    );
  });

  it('P6: actions/checkout@v5 + actions/setup-node@v5 pinned', () => {
    expect(yaml).toContain('actions/checkout@v5');
    expect(yaml).toContain('actions/setup-node@v5');
  });

  it('P7: node-version: 22 (literal — no .nvmrc indirection)', () => {
    expect(yaml).toContain('node-version: 22');
  });

  it('P8: contents: read permission present (read-only workflow)', () => {
    expect(yaml).toContain('contents: read');
  });

  it('P9: contents: write permission ABSENT (negative pin — no push)', () => {
    // T-40-04-03 mitigation: workflow runs on `pull_request` triggers
    // (which means PR-branch code runs under the runner's token). Limiting
    // permission to read-only ensures a malicious PR cannot push back to
    // the repo via this workflow's token. Negative pin guards against a
    // future "convenience" edit that grants write.
    expect(yaml).not.toContain('contents: write');
  });

  it('P10: pull-requests: write ABSENT (no PR comments in Phase 40)', () => {
    expect(yaml).not.toContain('pull-requests: write');
  });

  it('P11: peter-evans/create-pull-request action ABSENT (40-03 owns PR creation)', () => {
    expect(yaml).not.toContain('peter-evans/create-pull-request');
  });

  it('P12: secrets.*PAT* references ABSENT (no elevated tokens)', () => {
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT/);
  });

  it('P13: timeout-minutes in [20, 30] range (double regression-suite + npm install)', () => {
    // Double regression run + OLD pdfjs npm install — 25 min is the
    // researched estimate; bracket permits 20-30 for tuning latitude.
    expect(yaml).toMatch(/timeout-minutes:\s*(2[0-9]|30)/);
  });

  it('P14: FRAME-SHIFT DETECTED error-string sentinel pinned', () => {
    // The diff `node -e` step writes this literal to stderr on divergence.
    // Pinning the string here prevents a future refactor from silently
    // weakening the signal (e.g., changing to a vague "diff found" that
    // wouldn't catch operator attention as quickly).
    expect(yaml).toContain('FRAME-SHIFT DETECTED');
  });

  it('P15: concurrency: + cancel-in-progress: policy explicit', () => {
    expect(yaml).toContain('concurrency:');
    expect(yaml).toContain('cancel-in-progress: ');
  });
});

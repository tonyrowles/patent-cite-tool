// tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js
//
// Phase 36 Plan 36-04 (QUAR-04 + ORCH-02 + ORCH-03) — grep-based YAML assertions
// for the quarantine/triage wiring in .github/workflows/e2e-nightly.yml.
//
// Zero new dependencies (zero-new-dep lock) — reads the YAML as plain text and
// asserts meaningful tokens with string/regex checks. No js-yaml, no yaml-lint.
//
// Tests:
//   Y1 — ORCH-02 gating: ≥5 occurrences of `if: inputs.llm_run_id != ''`;
//          triage-pipeline + e2e:quarantine invocations present
//   Y2 — QUAR-04 non-gating: quarantine step block contains continue-on-error: true,
//          timeout-minutes: 15, and npm run e2e:quarantine
//   Y3 — QUAR-04 label + failure filer: e2e-quarantine label-create and
//          --source quarantine present; steps.quarantine.outcome == 'failure' gates filer
//   Y4 — ORCH-03 timeout budget: TIMEOUT BUDGET comment + timeout-minutes: 15 present
//   Y5 — SC-3 regression-unchanged guard: existing markers still present;
//          relocated download path present; downloaded-llm-report absent

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/e2e-nightly.yml');

let yaml;

beforeAll(() => {
  yaml = fs.readFileSync(YAML_PATH, 'utf8');
});

describe('e2e-nightly.yml quarantine/triage wiring (Phase 36)', () => {

  it('Y1 — ORCH-02: ≥5 llm_run_id gates, triage-pipeline invocation, e2e:quarantine invocation', () => {
    // Count the exact gating expression — download step + 4 new steps = ≥5
    const gatingExpr = "if: inputs.llm_run_id != ''";
    const occurrences = yaml.split(gatingExpr).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(5);

    // Triage pipeline step wired with correct invocation
    expect(yaml).toContain('node scripts/run-triage-pipeline.mjs --llm-report');

    // Quarantine spec npm script wired
    expect(yaml).toContain('npm run e2e:quarantine');
  });

  it('Y2 — QUAR-04: quarantine step block has continue-on-error: true, timeout-minutes: 15, e2e:quarantine', () => {
    // WR-05: key the window on the machine-stable `id: quarantine` rather than
    // the human-readable step name ("Run quarantine spec"). A benign step
    // rename would silently break the name-based matcher with a confusing
    // startIdx === -1 failure; the `id:` is the stable contract the failure
    // filer's `steps.quarantine.outcome` already depends on. Bound the window
    // at the next step boundary (`- name:` or `id:`) so the three asserted keys
    // are scoped to THIS step and cannot leak in from a neighbor.
    const startIdx = yaml.indexOf('id: quarantine');
    expect(startIdx).toBeGreaterThan(-1);

    const afterStart = yaml.slice(startIdx + 'id: quarantine'.length);
    // Next step boundary is whichever of `- name:` / `id:` appears first.
    const nameBoundary = afterStart.indexOf('- name:');
    const idBoundary = afterStart.indexOf('id:');
    const boundaries = [nameBoundary, idBoundary].filter((i) => i !== -1);
    const endIdx = boundaries.length ? Math.min(...boundaries) : -1;
    const stepBlock = endIdx === -1 ? afterStart : afterStart.slice(0, endIdx);

    expect(stepBlock).toContain('continue-on-error: true');
    expect(stepBlock).toContain('timeout-minutes: 15');
    expect(stepBlock).toContain('npm run e2e:quarantine');
  });

  it('Y3 — QUAR-04: e2e-quarantine label-create present, --source quarantine present, failure filer gated correctly', () => {
    // Label bootstrap step
    expect(yaml).toContain('gh label create "e2e-quarantine"');

    // Failure filer invokes --source quarantine
    expect(yaml).toContain('--source quarantine');

    // Failure filer is gated on quarantine step outcome
    expect(yaml).toContain("steps.quarantine.outcome == 'failure'");
  });

  it('Y4 — ORCH-03: TIMEOUT BUDGET comment present and quarantine per-step timeout present', () => {
    expect(yaml).toContain('TIMEOUT BUDGET');
    expect(yaml).toContain('timeout-minutes: 15');
  });

  it('Y5 — SC-3: existing regression markers intact, download relocated (no downloaded-llm-report)', () => {
    // Existing regression spec still referenced
    expect(yaml).toContain('specs/regression.spec.js');

    // Regression step id still present
    expect(yaml).toContain('id: regression');

    // Fault-injection step still present
    expect(yaml).toContain('Run fault-injection spec');

    // Task 1 relocation: artifact path present
    expect(yaml).toContain('tests/e2e/artifacts/');

    // Old download dir must be gone (WR-05 resolution)
    expect(yaml).not.toContain('downloaded-llm-report');
  });

});

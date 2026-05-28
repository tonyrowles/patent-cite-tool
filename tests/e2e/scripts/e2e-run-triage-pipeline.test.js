// tests/e2e/scripts/e2e-run-triage-pipeline.test.js
//
// Phase 36 Plan 36-02 (ORCH-01) — spawnSync integration tests for
// scripts/run-triage-pipeline.mjs.
//
// Tests P1-P3 (mirrors e2e-quarantine-append.test.js G1-G8 naming style):
//   Test P1: full chain (CI='') — exit 0, both reports written, mock issue filed,
//            exactly 1 quarantine entry, heuristic_count===1 / llm_pass_count===0 / cluster_pass_count===0
//   Test P2: CI-gated no-op (CI=true) — exit 0, rerun-report written, triage stage FAILED,
//            corpus unchanged (length 0)
//   Test P3: exit-0-on-stage-failure — malformed llm-report, pipeline still exits 0 (D-06)
//
// Key design invariants:
//   - spawnPipeline default env sets CI='' + GITHUB_ACTIONS='' (D-08 / RESEARCH OQ1 / Assumption A4):
//     without this, the triage-classifier CI gate fires in CI environments and stages 3-4 no-op,
//     breaking the P1 count assertions. The LLM_HALLUCINATED_SELECTION fixture resolves HEURISTICALLY
//     (Rule 3 → severity critical, path_taken heuristic) — ZERO real claude -p spawned even with CI=''.
//   - QUARANTINE_CORPUS_PATH_OVERRIDE → tmpDir corpus so committed test-cases-quarantine.js is NEVER mutated.
//   - Fixtures (phase36-pipeline-llm-report.json) are copied into artifacts/{runId}/ for WR-05 compliance.
//   - mock-gh bash shim logs all args to a transcript; issue list returns [] (so create fires);
//     issue create returns a URL.
//
// Zero-LLM assertion (load-bearing): the LLM_HALLUCINATED_SELECTION fixture resolves via triage
// Rule 3 (heuristic path) — invokeLlm is NEVER reached. The triage-report.json summary field
// heuristic_count===1, llm_pass_count===0, cluster_pass_count===0 is the deterministic evidence.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(PROJECT_ROOT, 'scripts/run-triage-pipeline.mjs');
const FIXTURE_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/fixtures');
const ARTIFACTS_DIR = path.resolve(PROJECT_ROOT, 'tests/e2e/artifacts');

// ---------------------------------------------------------------------------
// Test isolation setup
// ---------------------------------------------------------------------------

let runDir;       // artifacts/test-<id>/ — WR-05 compliant input location
let mockGhDir;    // tmpDir for mock-gh binary + transcript
let transcriptPath;
let corpusOverridePath; // QUARANTINE_CORPUS_PATH_OVERRIDE — isolates corpus writes

beforeEach(() => {
  // WR-03: use mkdtempSync for a guaranteed-unique run dir under the shared
  // committed ARTIFACTS_DIR. The previous 'test-' + Math.random().slice(2,10)
  // scheme (only 8 chars of base-36 entropy) shared its prefix and parent with
  // e2e-quarantine-append.test.js, which Vitest runs in a PARALLEL worker. A
  // name collision — or one file's afterEach rmSync deleting a colliding
  // sibling created by the other — was the plausible source of the transient
  // 1-test failure. A distinct 'pipeline-test-' prefix + OS-guaranteed unique
  // suffix eliminates both. Kept under ARTIFACTS_DIR so the --llm-report input
  // still satisfies the WR-05 ALLOWED_INPUT_ROOTS bound.
  // mkdtempSync requires its parent to exist; ARTIFACTS_DIR may be absent in a
  // fresh checkout (artifacts/ holds only gitignored run output), so ensure it.
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  runDir = fs.mkdtempSync(path.join(ARTIFACTS_DIR, 'pipeline-test-'));

  // Copy the phase36 pipeline fixture into runDir as llm-report.json.
  // The chain will overwrite rerun-report.json; no need to pre-copy the rerun fixture.
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'phase36-pipeline-llm-report.json'),
    path.join(runDir, 'llm-report.json'),
  );

  // mock-gh: logs all args to transcript; answers issue list/search with [] and issue create with a URL.
  // Handles both listOpenWithSearch (issue list --search) and createIssueWithLabels (issue create).
  mockGhDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pct-pipeline-mockgh-'));
  transcriptPath = path.join(mockGhDir, 'gh-transcript.txt');
  const mockGhPath = path.join(mockGhDir, 'gh');
  const mockGhBody = [
    '#!/usr/bin/env bash',
    'echo "$@" >> "' + transcriptPath + '"',
    'case "$1" in',
    '  issue)',
    '    case "$2" in',
    '      list) echo "[]" ;;',
    '      create) echo "https://github.com/test/test/issues/1" ;;',
    '      edit) echo "https://github.com/test/test/issues/1" ;;',
    '    esac ;;',
    '  --version) echo "gh version 2.83.1 (mock)" ;;',
    'esac',
  ].join('\n') + '\n';
  fs.writeFileSync(mockGhPath, mockGhBody, { mode: 0o755 });

  // Corpus override: fresh empty seed in tmpDir — never touches committed file.
  corpusOverridePath = path.join(mockGhDir, 'test-cases-quarantine.js');
  fs.writeFileSync(
    corpusOverridePath,
    '// AUTO-MANAGED\nexport const TEST_CASES_QUARANTINE = [];\n',
  );
});

afterEach(() => {
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.rmSync(mockGhDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Spawn helper — CI='' + GITHUB_ACTIONS='' default (D-08 / RESEARCH OQ1)
// ---------------------------------------------------------------------------

function spawnPipeline(args, extraEnv = {}) {
  return spawnSync('node', [SCRIPT_PATH, ...args], {
    env: {
      ...process.env,
      PATH: mockGhDir + ':' + process.env.PATH,
      GITHUB_REPOSITORY: 'test/test',
      QUARANTINE_CORPUS_PATH_OVERRIDE: corpusOverridePath,
      CI: '',           // LOAD-BEARING: override CI env so triage-classifier CI gate does not fire
      GITHUB_ACTIONS: '', // Same — disable GITHUB_ACTIONS gate in triage-classifier
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 30000, // 30s — chains 4 node spawns
  });
}

// ---------------------------------------------------------------------------
// P1: Full chain (CI='') — ORCH-01, D-16, SC-2
// ---------------------------------------------------------------------------

describe('run-triage-pipeline — full chain (P1)', () => {
  it('P1: CI="" full chain exits 0, both reports written, mock issue filed, exactly 1 quarantine entry, heuristic_count===1/llm_pass_count===0/cluster_pass_count===0', () => {
    const llmReportPath = path.join(runDir, 'llm-report.json');
    const r = spawnPipeline(['--llm-report', llmReportPath]);

    // D-06: pipeline exits 0 always.
    expect(r.status).toBe(0);

    // D-07: rerun-report.json written by stage 1 (rerun-validator).
    expect(fs.existsSync(path.join(runDir, 'rerun-report.json'))).toBe(true);

    // D-07: triage-report.json written by stage 2 (triage-classifier).
    expect(fs.existsSync(path.join(runDir, 'triage-report.json'))).toBe(true);

    // ZERO-LLM assertion (load-bearing): LLM_HALLUCINATED_SELECTION resolves via triage Rule 3
    // (heuristic path) — invokeLlm is NEVER reached. Assert via triage-report summary counts.
    const triageReport = JSON.parse(fs.readFileSync(path.join(runDir, 'triage-report.json'), 'utf8'));
    expect(triageReport.summary.heuristic_count).toBe(1);
    expect(triageReport.summary.llm_pass_count).toBe(0);
    expect(triageReport.summary.cluster_pass_count).toBe(0);
    expect(triageReport.summary.total_findings).toBe(1);

    // Verify the single finding is critical/heuristic (Rule 3 — LLM_HALLUCINATED_SELECTION).
    expect(triageReport.findings.length).toBe(1);
    expect(triageReport.findings[0].severity).toBe('critical');
    expect(triageReport.findings[0].path_taken).toBe('heuristic');

    // mock-gh transcript must contain 'issue create' (stage 3 filed a new issue).
    const transcript = fs.existsSync(transcriptPath)
      ? fs.readFileSync(transcriptPath, 'utf8')
      : '';
    expect(transcript).toMatch(/issue create/i);

    // Exactly 1 quarantine entry appended (stage 4 — quarantine-append).
    const corpusContent = fs.readFileSync(corpusOverridePath, 'utf8');
    // Count TEST_CASES_QUARANTINE entries via dynamic-import-safe regex.
    const entryMatches = corpusContent.match(/^\s*\{$/gm);
    expect(entryMatches).not.toBeNull();
    expect(entryMatches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P2: D-08 CI-gated no-op (CI=true) — triage stage skipped, corpus unchanged
// ---------------------------------------------------------------------------

describe('run-triage-pipeline — CI-gated no-op (P2)', () => {
  it('P2: CI=true exits 0, rerun-report written, triage stage FAILED logged, corpus unchanged', () => {
    const llmReportPath = path.join(runDir, 'llm-report.json');
    const r = spawnPipeline(['--llm-report', llmReportPath], { CI: 'true' });

    // D-06: pipeline always exits 0, even with triage stage failure.
    expect(r.status).toBe(0);

    // Stage 1 (rerun-validator) still runs — rerun-report.json written.
    expect(fs.existsSync(path.join(runDir, 'rerun-report.json'))).toBe(true);

    // Stage 2 (triage-classifier) CI gate fires → triage-report.json NOT written.
    expect(fs.existsSync(path.join(runDir, 'triage-report.json'))).toBe(false);

    // Pipeline stdout must mention the triage stage failure (FAILED log) or CI skip message.
    const stdout = r.stdout || '';
    const ciGateEvidence =
      /triage-classifier: FAILED/i.test(stdout) ||
      /LLM second-pass skipped in CI/i.test(stdout);
    expect(ciGateEvidence).toBe(true);

    // Corpus must be unchanged (length 0) — stages 3-4 no-op on missing triage-report.
    const corpusContent = fs.readFileSync(corpusOverridePath, 'utf8');
    expect(corpusContent).not.toMatch(/^\s*\{$/m);
  });
});

// ---------------------------------------------------------------------------
// P3: ORCH-01 exit-0-on-stage-failure — malformed llm-report, pipeline exits 0 (D-06)
// ---------------------------------------------------------------------------

describe('run-triage-pipeline — exit-0-on-stage-failure (P3)', () => {
  it('P3: malformed llm-report causes stage failures but pipeline still exits 0 (D-06)', () => {
    // Write a malformed JSON file into runDir as the llm-report.
    // rerun-validator and triage-classifier will fail; the chain must still exit 0.
    const malformedPath = path.join(runDir, 'llm-report.json');
    fs.writeFileSync(malformedPath, '{}'); // valid JSON but missing required fields — stages will exit 1

    const r = spawnPipeline(['--llm-report', malformedPath]);

    // D-06: ALWAYS exits 0 regardless of stage failures.
    expect(r.status).toBe(0);
  });
});

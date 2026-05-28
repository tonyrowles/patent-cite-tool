// tests/e2e/lib/report.js
//
// Phase 28 RPT-01 — incremental writer for tests/e2e/artifacts/{run_id}/report.json.
//
// Public surface:
//   reportPathFor(runId) → absolute path to that run's report.json
//   appendCase(reportPath, caseEntry) — read-modify-write a single case;
//                                       creates file + run dir if missing;
//                                       recomputes summary on every call;
//                                       replaces by id (not duplicates)
//   writeReport(reportPath, report)   — atomically overwrite the entire file
//                                       (used at end-of-run to stamp `ended`
//                                       and lock in the final canonical shape)
//   ERROR_CLASSES                     — re-export from error-codes.js for
//                                       consumers that only want this module
//
// Design notes:
//   - Single source of mutation: the verifier (Plan 28-01) returns verdicts
//     but does NOT write the report. regression.spec.js (Plan 28-05) is the
//     only caller of appendCase.
//   - recomputeSummary is correct-by-construction — every call iterates all
//     cases once. This handles status-flip on replace (Test 4) without
//     maintaining incremental deltas, which would be error-prone.
//   - No file locking. Playwright config pins workers:1 (Phase 26), so the
//     report.json read-modify-write is single-process and atomic-enough.
//   - errorClass values not in ERROR_CLASSES (null, undefined, future strings
//     like 'LLM_HALLUCINATED_SELECTION') do NOT inflate by_error_class — but
//     a 'failed' status still increments summary.failed. This is the closed-
//     enum guarantee that RPT-02 promises (Test 6).
//
// Schema (mirrors 28-CONTEXT.md §"Report Schema (RPT-01, RPT-02)"):
//   {
//     run_id, started, ended,
//     summary: { total, passed, skipped, failed, by_error_class: {...} },
//     cases: [{ id, status, errorClass, citation, verifier_verdict, artifacts, ... }]
//   }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_CLASSES } from './error-codes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = path.resolve(__dirname, '../artifacts');

/**
 * @param {string} runId — the per-suite run identifier (resolveRunId() output)
 * @param {string} [filename='report.json'] — report filename within the run dir.
 *   Phase 36 CR-01: the quarantine spec passes 'quarantine-report.json' so its
 *   per-case output is namespaced AWAY from the shared 'report.json' that the
 *   regression + fault-injection specs write to. This prevents the
 *   `--source quarantine` filer from re-filing regression/fault-injection
 *   failures under the e2e-quarantine label (shared-file cross-contamination).
 *   Back-compat default is 'report.json' so existing callers are unaffected.
 * @returns {string} absolute path to that run's report file
 */
export function reportPathFor(runId, filename = 'report.json') {
  return path.join(ARTIFACTS_ROOT, runId, filename);
}

function emptySummary() {
  return {
    total: 0,
    passed: 0,
    skipped: 0,
    failed: 0,
    by_error_class: Object.fromEntries(ERROR_CLASSES.map(k => [k, 0])),
  };
}

/**
 * @param {string} runId
 * @returns {object} a fresh empty report skeleton matching the RPT-01 schema
 */
function emptyReport(runId) {
  const now = new Date().toISOString();
  return {
    run_id: runId,
    started: now,
    ended: now,
    summary: emptySummary(),
    cases: [],
  };
}

/**
 * Read existing report.json, or synthesize an empty one if missing/unreadable.
 * The runId is derived from the path: tests/e2e/artifacts/{runId}/report.json.
 * @param {string} reportPath
 * @returns {object}
 */
function readOrInit(reportPath) {
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    const runId = path.basename(path.dirname(reportPath));
    return emptyReport(runId);
  }
}

/**
 * Compute summary counters from scratch by iterating all cases. Closed-enum
 * guard: only errorClass values present in ERROR_CLASSES count toward
 * by_error_class.
 * @param {Array<object>} cases
 * @returns {object} summary
 */
function recomputeSummary(cases) {
  const s = emptySummary();
  for (const c of cases) {
    s.total += 1;
    if (c.status === 'passed') s.passed += 1;
    else if (c.status === 'skipped') s.skipped += 1;
    else if (c.status === 'failed') s.failed += 1;
    if (c.errorClass && ERROR_CLASSES.includes(c.errorClass)) {
      s.by_error_class[c.errorClass] += 1;
    }
  }
  return s;
}

/**
 * Append (or replace by id) a single case entry. Recomputes summary, refreshes
 * the `ended` timestamp, and writes the file. Creates parent dir if missing.
 *
 * @param {string} reportPath absolute path to the run's report.json
 * @param {object} caseEntry
 *   @prop {string} id
 *   @prop {'passed'|'failed'|'skipped'} status
 *   @prop {string|null} errorClass — one of ERROR_CLASSES or null
 *   @prop {string|null} citation
 *   @prop {object|null} verifier_verdict
 *   @prop {object} artifacts
 *   @prop {number} [duration_ms]
 */
export function appendCase(reportPath, caseEntry) {
  const report = readOrInit(reportPath);
  const idx = report.cases.findIndex(c => c.id === caseEntry.id);
  if (idx >= 0) {
    report.cases[idx] = caseEntry;
  } else {
    report.cases.push(caseEntry);
  }
  report.summary = recomputeSummary(report.cases);
  report.ended = new Date().toISOString();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

/**
 * Overwrite the entire report file. Used at end-of-run to stamp the final
 * canonical shape (e.g., updated `ended`, summary frozen).
 *
 * @param {string} reportPath
 * @param {object} report — must conform to the RPT-01 schema
 */
export function writeReport(reportPath, report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

export { ERROR_CLASSES };

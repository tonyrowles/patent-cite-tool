// tests/e2e/lib/llm-report.js
//
// Phase 31 (LLM-08) — Append-only writer for tests/e2e/artifacts/{runId}/llm-report.json.
//
// Mirrors tests/e2e/lib/report.js (Phase 28 RPT-01) but writes to a SEPARATE
// file (`llm-report.json`) so the exploratory mode's run records do not
// entangle with the deterministic suite's regression report. Both files share
// the same artifacts/{runId}/ directory — the run-id resolves identically for
// both modes via tests/e2e/lib/run-id.js.
//
// Public surface:
//   LLM_REPORT_FILENAME              constant: 'llm-report.json'
//   llmReportPathFor(runId)          absolute path to that run's llm-report.json
//   initLlmReport(reportPath, meta)  create empty skeleton if missing (idempotent);
//                                    returns the report object
//   appendLlmIteration(reportPath, iteration)
//                                    read-modify-write one iteration; recomputes
//                                    summary; truncates llm_raw_response to 2000
//                                    chars; rejects entries missing required
//                                    fields; updates finished_iso to NOW
//   finalizeLlmReport(reportPath)    stamp finished_iso (called once at end-of-run);
//                                    returns the report object
//
// Design notes:
//   - Single-process safe (no file locking). The runner is sequential.
//   - Crash-safe partial run: read-modify-write whole file → either the prior
//     valid state or the new valid state is on disk. readOrInit treats any
//     parse failure as "fresh empty".
//   - llm_raw_response is truncated to RAW_RESPONSE_MAX_CHARS (2000) to
//     protect against a runaway claude response ballooning the report file
//     (threat T-31-7 in 31-02-PLAN.md).
//   - Required-field validation throws DESCRIPTIVE errors so caller can
//     surface the problem rather than writing malformed data.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = path.resolve(__dirname, '../artifacts');

/** Filename used for the LLM-mode report inside artifacts/{runId}/. */
export const LLM_REPORT_FILENAME = 'llm-report.json';

/**
 * Maximum llm_raw_response length stored in any iteration. Anything longer
 * is truncated with `.slice(0, RAW_RESPONSE_MAX_CHARS)`. 2000 chars is enough
 * for forensic diagnosis of a malformed claude response (well over the
 * single-iteration JSON payload size used by Phase 31's prompt) but small
 * enough to keep a 100-iteration report under ~250KB.
 */
const RAW_RESPONSE_MAX_CHARS = 2000;

/** Required fields on every iteration entry. */
const REQUIRED_ENTRY_FIELDS = ['iteration_n', 'iso', 'classification'];

/**
 * Crash-safe write (WR-04). Plain fs.writeFileSync truncates the destination
 * before writing, so a crash, OOM, SIGKILL, or full-disk between the two
 * leaves a corrupt JSON file — which readOrInit() treats as a fresh empty
 * report, losing every iteration appended so far in the run. The temp-write
 * + atomic rename pattern (POSIX rename(2) / Windows MoveFileEx) eliminates
 * that truncate-and-die window: the destination always holds either the
 * prior good state or the new good state.
 *
 * WR-06 (Phase 32 review): fs.renameSync raises EXDEV when the temp file
 * and the destination live on different filesystems (tmpfs vs the repo's
 * regular FS, bind-mounted Docker dev env, etc.). Catch EXDEV and fall back
 * to a direct fs.writeFileSync on the destination — atomicity is lost on
 * that one write, but the alternative is a hard failure on every iteration
 * append. Same fallback as in tests/e2e/lib/llm-ledger.js appendLedgerEntry.
 *
 * @param {string} destPath
 * @param {string} content
 */
function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-device rename — direct write fallback (loses atomicity but
      // unblocks the append).
      fs.writeFileSync(destPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}

/**
 * @param {string} runId
 * @returns {string} absolute path to that run's llm-report.json
 */
export function llmReportPathFor(runId) {
  return path.join(ARTIFACTS_ROOT, runId, LLM_REPORT_FILENAME);
}

function emptySummary() {
  return {
    passed: 0,
    wrong_citation: 0,
    verifier_disagree: 0,
    llm_hallucinated_selection: 0,
    llm_api_error: 0,
    harness_error: 0,
    total_cost_usd: 0,
  };
}

/**
 * Map a classification string to its summary key. Unknown classifications
 * are silently ignored (return null) — the iteration is still appended, but
 * does not increment any counter. This mirrors report.js's closed-enum guard.
 */
function classificationToSummaryKey(classification) {
  switch (classification) {
    case 'PASS': return 'passed';
    case 'WRONG_CITATION': return 'wrong_citation';
    case 'VERIFIER_DISAGREE': return 'verifier_disagree';
    case 'LLM_HALLUCINATED_SELECTION': return 'llm_hallucinated_selection';
    case 'LLM_API_ERROR': return 'llm_api_error';
    case 'HARNESS_ERROR': return 'harness_error';
    default: return null;
  }
}

/**
 * Compute summary counters from scratch by iterating all iterations. Closed-
 * enum guard: unknown classifications do not appear in summary. total_cost_usd
 * is rounded to 6 decimal places to avoid float drift (mirrors the convention
 * used by llm-ledger.js).
 *
 * @param {object[]} iterations
 * @returns {object} summary
 */
function recomputeSummary(iterations) {
  const s = emptySummary();
  for (const it of iterations) {
    const key = classificationToSummaryKey(it.classification);
    if (key) s[key] += 1;
    if (typeof it.cost_usd === 'number' && Number.isFinite(it.cost_usd)) {
      s.total_cost_usd = +(s.total_cost_usd + it.cost_usd).toFixed(6);
    }
  }
  return s;
}

function emptyReport(meta) {
  const now = new Date().toISOString();
  return {
    run_id: meta?.run_id,
    started_iso: now,
    finished_iso: now,
    iterations_total: meta?.iterations_total ?? 0,
    summary: emptySummary(),
    iterations: [],
  };
}

/**
 * Read existing report.json or synthesize an empty one. If meta.run_id is
 * provided AND the file did not exist, the new report carries that run_id.
 * If the file existed, the on-disk run_id wins (idempotent semantics).
 *
 * @param {string} reportPath
 * @param {{ run_id?: string, iterations_total?: number }} [meta]
 * @returns {object}
 */
function readOrInit(reportPath, meta) {
  try {
    return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    // derive run_id from path if meta did not supply one
    const fallbackRunId = path.basename(path.dirname(reportPath));
    return emptyReport({
      run_id: meta?.run_id ?? fallbackRunId,
      iterations_total: meta?.iterations_total ?? 0,
    });
  }
}

/**
 * Create the empty skeleton if the file does not exist. Idempotent: if the
 * file already exists, return its current contents WITHOUT overwriting. This
 * preserves any iterations already appended by an earlier invocation (resume
 * semantics).
 *
 * @param {string} reportPath
 * @param {{ run_id: string, iterations_total: number }} meta
 * @returns {object} the report (newly seeded or existing)
 */
export function initLlmReport(reportPath, meta) {
  if (!meta?.run_id) throw new Error('initLlmReport: meta.run_id required');
  if (fs.existsSync(reportPath)) {
    return readOrInit(reportPath, meta);
  }
  const report = emptyReport(meta);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  atomicWriteJson(reportPath, JSON.stringify(report, null, 2));
  return report;
}

/**
 * Append one iteration. Read-modify-write atomic file replace. Recomputes
 * summary on every call. Updates finished_iso to NOW. Truncates
 * llm_raw_response to RAW_RESPONSE_MAX_CHARS. Throws if iteration is missing
 * any of REQUIRED_ENTRY_FIELDS.
 *
 * @param {string} reportPath
 * @param {object} iteration
 */
export function appendLlmIteration(reportPath, iteration) {
  for (const f of REQUIRED_ENTRY_FIELDS) {
    if (iteration?.[f] === undefined || iteration[f] === null) {
      throw new Error(`appendLlmIteration: missing required field '${f}'`);
    }
  }
  const entry = { ...iteration };
  if (
    typeof entry.llm_raw_response === 'string' &&
    entry.llm_raw_response.length > RAW_RESPONSE_MAX_CHARS
  ) {
    entry.llm_raw_response = entry.llm_raw_response.slice(0, RAW_RESPONSE_MAX_CHARS);
  }
  const report = readOrInit(reportPath);
  report.iterations.push(entry);
  report.summary = recomputeSummary(report.iterations);
  report.finished_iso = new Date().toISOString();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  atomicWriteJson(reportPath, JSON.stringify(report, null, 2));
}

/**
 * Stamp finished_iso to NOW. Called once at the end of a run. Idempotent —
 * calling multiple times just refreshes finished_iso.
 *
 * @param {string} reportPath
 * @returns {object} the report
 */
export function finalizeLlmReport(reportPath) {
  const report = readOrInit(reportPath);
  report.finished_iso = new Date().toISOString();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  atomicWriteJson(reportPath, JSON.stringify(report, null, 2));
  return report;
}

/**
 * Phase 33 — pure-function 3-replay validator (RERUN-01/RERUN-02).
 *
 * Wraps verifyCitation; no browser, no src/ imports (RERUN-04 independence claim).
 * Per D-07 the parsedCache in pdf-verifier.js is preserved between replays (do not
 * clear it — the cache hit is deterministic and correct).
 *
 * Key decisions (33-CONTEXT.md):
 *   D-01: eligible classifications = WRONG_CITATION | VERIFIER_DISAGREE
 *   D-02: ineligible → NOT_REPLAYABLE with reason naming the classification
 *   D-03: confirm = string equality on verifier_verdict.status vs replay status
 *   D-04: verdict logic does NOT branch on tier_used (Phase 34's concern)
 *   D-07: do NOT clear parsedCache between replays
 *   D-08: no seed pin, no env scrub — verifyCitation is pure
 *   D-09: top-level shape: schema_version, source_llm_report, run_id, started_iso,
 *          finished_iso, summary{confirmed_count, flake_count, not_replayable_count}, replays[]
 *   D-10: per-replay shape: iteration_n, original_verdict_status, runs[], confirmed_count,
 *          total_runs, verdict; reason present ONLY when verdict === 'NOT_REPLAYABLE'
 *   D-12: atomicWriteJson inlined verbatim (not extracted to shared util)
 */

import fs from 'node:fs';
import path from 'node:path';
import { verifyCitation as realVerifyCitation } from './pdf-verifier.js';

// D-01: classifications eligible for replay
const REPLAY_ELIGIBLE_CLASSIFICATIONS = new Set(['WRONG_CITATION', 'VERIFIER_DISAGREE']);

// ---------------------------------------------------------------------------
// isEligibleForReplay
// ---------------------------------------------------------------------------

/**
 * Returns true iff the iteration's classification is WRONG_CITATION or VERIFIER_DISAGREE.
 * All other classifications (HARNESS_ERROR, LLM_API_ERROR, LLM_HALLUCINATED_SELECTION, PASS)
 * produce NOT_REPLAYABLE entries per D-01/D-02.
 *
 * @param {{ classification: string }} iter
 * @returns {boolean}
 */
export function isEligibleForReplay(iter) {
  return REPLAY_ELIGIBLE_CLASSIFICATIONS.has(iter.classification);
}

// ---------------------------------------------------------------------------
// computeVerdict
// ---------------------------------------------------------------------------

/**
 * Pure verdict calculation — no side effects, no tier_used branching (D-04).
 *
 * CRITICAL: threshold is `>= 2` (inclusive), NOT `> 2`.
 * RESEARCH.md anti-pattern: using `> 2` would make the "exactly 2/3" edge case fail.
 *
 * @param {string|null} originalStatus  — verifier_verdict.status from the source iteration
 * @param {{ status: string }[]} runs   — array of replay results (always length 3)
 * @returns {{ confirmed_count: number, total_runs: number, verdict: 'CONFIRMED'|'FLAKE' }}
 */
export function computeVerdict(originalStatus, runs) {
  const confirmedCount = runs.filter(r => r.status === originalStatus).length;
  const totalRuns = runs.length;
  const verdict = confirmedCount >= 2 ? 'CONFIRMED' : 'FLAKE';
  return { confirmed_count: confirmedCount, total_runs: totalRuns, verdict };
}

// ---------------------------------------------------------------------------
// emptyRerunReport
// ---------------------------------------------------------------------------

/**
 * Returns the D-09 top-level report skeleton with zeroed summary and empty replays[].
 *
 * @param {{ sourceLlmReport: string, runId: string, now?: () => Date }} opts
 * @returns {object}
 */
export function emptyRerunReport({ sourceLlmReport, runId, now = () => new Date() }) {
  return {
    schema_version: 1,
    source_llm_report: sourceLlmReport,
    run_id: runId,
    started_iso: now().toISOString(),
    finished_iso: null,
    summary: {
      confirmed_count: 0,
      flake_count: 0,
      not_replayable_count: 0,
    },
    replays: [],
  };
}

// ---------------------------------------------------------------------------
// atomicWriteJson  (inlined per D-12 — do NOT extract to shared util)
// ---------------------------------------------------------------------------

/**
 * Crash-safe write (WR-04). Plain fs.writeFileSync truncates the destination
 * before writing, so a crash, OOM, SIGKILL, or full-disk between the two
 * leaves a corrupt JSON file. The temp-write + atomic rename pattern
 * (POSIX rename(2) / Windows MoveFileEx) eliminates that truncate-and-die window:
 * the destination always holds either the prior good state or the new good state.
 *
 * WR-06: fs.renameSync raises EXDEV when the temp file and the destination live on
 * different filesystems (tmpfs vs the repo's regular FS, bind-mounted Docker dev env, etc.).
 * Catch EXDEV and fall back to a direct fs.writeFileSync on the destination — atomicity
 * is lost on that one write, but the alternative is a hard failure.
 *
 * @param {string} destPath
 * @param {string} content
 */
export function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-device rename — direct write fallback (loses atomicity but
      // unblocks the write).
      fs.writeFileSync(destPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// runValidator — main entrypoint
// ---------------------------------------------------------------------------

/**
 * Pure orchestrator: iterates source llm-report iterations, replays eligible ones
 * exactly 3 times via verifyCitation, computes verdicts, and writes rerun-report.json.
 *
 * The function is PURE EXCEPT FOR THE SINGLE writeReport CALL — no other side effects.
 * Injected deps (verifyCitation, writeReport, now) allow full unit-test isolation.
 *
 * @param {{
 *   inputLlmReport: object,          — already JSON.parsed source llm-report
 *   sourceLlmReportPath: string,     — path string for the source_llm_report field
 *   outputPath: string,              — where to write rerun-report.json
 *   verifyCitation?: function,       — injectable; defaults to pdf-verifier's realVerifyCitation
 *   writeReport?: function,          — injectable; defaults to atomicWriteJson
 *   now?: () => Date                 — injectable clock for deterministic tests
 * }} opts
 * @returns {Promise<object>} the composed rerun-report object
 */
export async function runValidator({
  inputLlmReport,
  sourceLlmReportPath,
  outputPath,
  verifyCitation = realVerifyCitation,
  writeReport = (p, c) => atomicWriteJson(p, c),
  now = () => new Date(),
}) {
  const report = emptyRerunReport({
    sourceLlmReport: sourceLlmReportPath,
    runId: inputLlmReport.run_id,
    now,
  });

  for (const iter of inputLlmReport.iterations) {
    if (!isEligibleForReplay(iter)) {
      // D-02: ineligible iterations → NOT_REPLAYABLE entry, no verifyCitation calls
      report.replays.push({
        iteration_n: iter.iteration_n,
        original_verdict_status: iter.verifier_verdict?.status ?? null,
        runs: [],
        confirmed_count: 0,
        total_runs: 0,
        verdict: 'NOT_REPLAYABLE',
        reason: `classification ${iter.classification} is not replay-eligible`,
      });
      report.summary.not_replayable_count += 1;
    } else {
      // Eligible: run verifyCitation exactly 3 times (D-03)
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const r = await verifyCitation({
          patentId: iter.llm_selection?.patentId,
          selectedText: iter.llm_selection?.selectedText,
          observedCitation: iter.citation,
        });
        runs.push({
          status: r.status,
          tier_used: r.tier_used ?? null,
          reason: r.reason ?? null,
        });
      }

      // D-03: confirm = string equality on verifier_verdict.status
      const originalStatus = iter.verifier_verdict?.status ?? null;
      const v = computeVerdict(originalStatus, runs);

      // D-10: per-replay entry — no `reason` field for CONFIRMED/FLAKE (only NOT_REPLAYABLE)
      report.replays.push({
        iteration_n: iter.iteration_n,
        original_verdict_status: originalStatus,
        runs,
        ...v,
      });

      if (v.verdict === 'CONFIRMED') {
        report.summary.confirmed_count += 1;
      } else {
        report.summary.flake_count += 1;
      }
    }
  }

  report.finished_iso = now().toISOString();
  writeReport(outputPath, JSON.stringify(report, null, 2) + '\n');
  return report;
}

// END rerun-validator.js — RERUN-01/RERUN-02/RERUN-04 Phase 33

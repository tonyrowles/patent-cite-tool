/**
 * Phase 34 — pure-function hybrid triage classifier (TRIAGE-01/TRIAGE-02/TRIAGE-05).
 *
 * Reads a Phase 31/32/33 llm-report.json and a Phase 33 rerun-report.json;
 * resolves 6-of-8 iteration classifications heuristically (zero LLM calls);
 * enqueues ambiguous Tier-C cases onto an `ambiguous[]` array that Plan 03
 * consumes via the cluster pre-filter + LLM second-pass.
 *
 * No browser imports, no src/ imports (independence claim mirrors RERUN-04).
 * The injected `invokeLlm` parameter is reserved in the signature so Plan 03's
 * diff is minimal — this plan does NOT call it.
 *
 * Key decisions (34-CONTEXT.md):
 *   D-01: 6 heuristically-resolved classifications (FLAKE, CONFIRMED+A/B, NOT_REPLAYABLE x4)
 *   D-02: VERIFIER_STRONG_AGREEMENT named gate — Tier C NEVER satisfies (Pitfall 2)
 *   D-03: rule chain order: FLAKE → CONFIRMED+strong → NOT_REPLAYABLE+specific → ambiguous
 *   D-04: SEVERITIES = Object.freeze(['critical','high','medium','low','info'])
 *   D-09: top-level triage-report.json shape: schema_version, sources, run_id, times, summary, findings
 *   D-10: per-finding shape: iteration_n, severity, category, root_cause_hypothesis, confidence, rationale, path_taken
 *   D-12: atomicWriteJson inlined verbatim (not extracted to shared util — 3rd inline copy)
 *   D-14 + revised D-16: runTriage pure-fn entrypoint — NO getPdfSnippet dep;
 *         selectedText read directly from each iteration's llm_selection field
 *
 * Plan 03 adds to THIS FILE: CLUSTER_THRESHOLD + wrapPatentData exports, replaces the
 * placeholder ambiguous-loop with cluster pre-filter + LLM second-pass. Plan 03 is a
 * purely additive diff — the schema and all heuristic paths here remain unchanged.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// D-02: VERIFIER_STRONG_AGREEMENT named gate (Pitfall 2 mitigation)
// ---------------------------------------------------------------------------

/**
 * Returns true ONLY when status === 'pass' AND tier_used ∈ {'A', 'B'}.
 * Tier C and Tier D ALWAYS return false — they must escalate to the LLM second-pass.
 * Defensive default-arg destructure: missing input returns false instead of throwing.
 *
 * @param {{ status?: string, tier_used?: string }} verifierVerdict
 * @returns {boolean}
 */
export const VERIFIER_STRONG_AGREEMENT = ({ status, tier_used } = {}) =>
  status === 'pass' && (tier_used === 'A' || tier_used === 'B');

// ---------------------------------------------------------------------------
// D-04: SEVERITIES frozen taxonomy
// ---------------------------------------------------------------------------

/**
 * Canonical severity taxonomy. Object.freeze prevents accidental mutation.
 * Mapping:
 *   critical — LLM_HALLUCINATED_SELECTION (trust violation)
 *   high     — WRONG_CITATION CONFIRMED (production correctness bug)
 *   medium   — VERIFIER_DISAGREE CONFIRMED, LLM_API_ERROR
 *   low      — HARNESS_ERROR, FLAKE
 *   info     — PASS
 *
 * @type {readonly string[]}
 */
export const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info']);

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
// emptyTriageReport — D-09 top-level report skeleton
// ---------------------------------------------------------------------------

/**
 * Returns the D-09 top-level report skeleton with zeroed summary and empty findings[].
 *
 * @param {{
 *   sourceLlm: string,         — path string for source_llm_report field
 *   sourceRerun: string,       — path string for source_rerun_report field
 *   runId: string,             — run_id from input llm-report
 *   now?: () => Date           — injectable clock for deterministic tests
 * }} opts
 * @returns {object}
 */
export function emptyTriageReport({ sourceLlm, sourceRerun, runId, now = () => new Date() }) {
  return {
    schema_version: 1,
    source_llm_report: sourceLlm,
    source_rerun_report: sourceRerun,
    run_id: runId,
    started_iso: now().toISOString(),
    finished_iso: null,
    summary: {
      by_severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
      by_category: {},
      heuristic_count: 0,
      llm_pass_count: 0,       // populated by Plan 03
      cluster_pass_count: 0,   // populated by Plan 03
      total_findings: 0,
    },
    findings: [],
  };
}

// ---------------------------------------------------------------------------
// runTriage — main entrypoint (D-14 + revised D-16)
// ---------------------------------------------------------------------------

/**
 * Pure orchestrator: applies the D-03 heuristic rule chain to each iteration
 * in inputLlmReport, linking by iteration_n to inputRerunReport.replays[].
 * Heuristically-resolved findings get path_taken:'heuristic'. Ambiguous
 * findings (Tier C + CONFIRMED) get a placeholder path_taken:'pending_llm'
 * that Plan 03 replaces with 'llm_single' or 'llm_cluster'.
 *
 * The function is PURE EXCEPT FOR THE SINGLE writeReport CALL — no other side effects.
 * Injected deps (invokeLlm, writeReport, now) allow full unit-test isolation.
 *
 * NOTE: `invokeLlm` is reserved in the signature for Plan 03's LLM second-pass.
 * This plan does NOT call it — invokeLlm.callCount === 0 for all heuristic paths.
 *
 * NOTE (revised D-16): no getPdfSnippet dep. Each iteration carries its own
 * llm_selection.selectedText (≤300 chars, Phase 31 SELECTION_MAX_CHARS). Plan 03's
 * prompt builder wraps selectedText via wrapPatentData() directly.
 *
 * @param {{
 *   inputLlmReport: object,       — parsed llm-report.json object
 *   inputRerunReport: object,     — parsed rerun-report.json object
 *   invokeLlm?: function,         — reserved for Plan 03; not called here
 *   writeReport?: function,       — injectable; defaults to atomicWriteJson
 *   now?: () => Date              — injectable clock for deterministic tests
 *   sourcePaths: { llm: string, rerun: string }  — for output frontmatter
 * }} opts
 * @returns {Promise<object>} the composed triage-report object
 */
export async function runTriage({
  inputLlmReport,
  inputRerunReport,
  invokeLlm,  // reserved; not called in this plan
  writeReport = (p, c) => atomicWriteJson(p, c),
  now = () => new Date(),
  sourcePaths,
}) {
  // Derive output path: sibling of llm-report.json in the same artifacts/{runId}/ dir
  const outputPath = path.join(path.dirname(sourcePaths.llm), 'triage-report.json');

  // a. Build report skeleton
  const report = emptyTriageReport({
    sourceLlm: sourcePaths.llm,
    sourceRerun: sourcePaths.rerun,
    runId: inputLlmReport.run_id,
    now,
  });

  // b. Index rerun-report entries by iteration_n for O(1) lookup
  const rerunByIterationN = new Map(
    inputRerunReport.replays.map(r => [r.iteration_n, r])
  );

  // c. Ambiguous set — Plan 03 wires the cluster pre-filter + LLM second-pass
  const ambiguous = [];

  // d. Per-iteration D-03 rule chain (first match wins)
  for (const iter of inputLlmReport.iterations) {
    // Look up the rerun entry for this iteration (may be undefined)
    // Per 34-RESEARCH.md Assumption A4: missing entry treated as NOT_REPLAYABLE for rule 3
    const rerunEntry = rerunByIterationN.get(iter.iteration_n);

    // D-03 Rule 1: FLAKE short-circuit
    if (rerunEntry?.verdict === 'FLAKE') {
      report.findings.push({
        iteration_n: iter.iteration_n,
        severity: 'low',
        category: iter.classification,
        root_cause_hypothesis: 'transient — rerun did not confirm',
        confidence: 1.0,
        rationale: `Rerun verdict FLAKE (${rerunEntry.confirmed_count}/${rerunEntry.total_runs} confirmed)`,
        path_taken: 'heuristic',
      });
      continue;
    }

    // D-03 Rule 2: CONFIRMED + strong agreement (Tier A or B only — Pitfall 2)
    if (
      rerunEntry?.verdict === 'CONFIRMED' &&
      iter.verifier_verdict &&
      VERIFIER_STRONG_AGREEMENT(iter.verifier_verdict)
    ) {
      report.findings.push({
        iteration_n: iter.iteration_n,
        severity: iter.classification === 'WRONG_CITATION' ? 'high' : 'medium',
        category: iter.classification,
        root_cause_hypothesis: 'verifier confirms; non-flaky',
        confidence: 0.95,
        rationale: `Rerun CONFIRMED ${rerunEntry.confirmed_count}/${rerunEntry.total_runs}; verifier strong agreement (tier ${iter.verifier_verdict.tier_used})`,
        path_taken: 'heuristic',
      });
      continue;
    }

    // D-03 Rule 3: NOT_REPLAYABLE (or missing rerun entry) + specific classifications
    const NOT_REPLAYABLE_EFFECTIVE = rerunEntry?.verdict === 'NOT_REPLAYABLE' || rerunEntry === undefined;
    const RULE3_CLASSIFICATIONS = ['LLM_HALLUCINATED_SELECTION', 'LLM_API_ERROR', 'HARNESS_ERROR', 'PASS'];
    if (NOT_REPLAYABLE_EFFECTIVE && RULE3_CLASSIFICATIONS.includes(iter.classification)) {
      const severityMap = {
        LLM_HALLUCINATED_SELECTION: 'critical',
        LLM_API_ERROR: 'medium',
        HARNESS_ERROR: 'low',
        PASS: 'info',
      };
      const hypothesisMap = {
        LLM_HALLUCINATED_SELECTION: 'LLM proposed selection that failed wsNorm verification',
        LLM_API_ERROR: `claude -p errored: ${iter.errorReason ?? 'unknown'}`,
        HARNESS_ERROR: 'Playwright/harness failure during iteration',
        PASS: 'Verifier passed; no anomaly to triage',
      };
      report.findings.push({
        iteration_n: iter.iteration_n,
        severity: severityMap[iter.classification],
        category: iter.classification,
        root_cause_hypothesis: hypothesisMap[iter.classification],
        confidence: 0.9,
        rationale: `Heuristic-resolved: ${rerunEntry?.verdict ?? 'no-rerun-entry'} + ${iter.classification}`,
        path_taken: 'heuristic',
      });
      continue;
    }

    // D-03 Rule 4: ambiguous — Tier C CONFIRMED or any other case not matched above
    // Push iter for Plan 03's cluster pre-filter + LLM second-pass
    ambiguous.push(iter);
  }

  // e. For each ambiguous iter, push a PLACEHOLDER finding (Plan 03 replaces these)
  // This placeholder makes the schema-guard test pass for fixtures that exercise
  // only heuristic paths. The shipped triage-report.json after Plan 03 has zero
  // 'pending_llm' entries (Plan 03 acceptance criterion verifies this with a grep gate).
  for (const iter of ambiguous) {
    report.findings.push({
      iteration_n: iter.iteration_n,
      severity: 'medium',          // Plan 03 overwrites this
      category: iter.classification,
      root_cause_hypothesis: 'pending LLM second-pass',
      confidence: 0,
      rationale: 'Plan 34-03 wires the LLM second-pass for this finding',
      path_taken: 'pending_llm',   // TRANSIENT — Plan 03 replaces with llm_single or llm_cluster
    });
  }

  // f. Compute summary counters
  for (const f of report.findings) {
    report.summary.by_severity[f.severity] = (report.summary.by_severity[f.severity] ?? 0) + 1;
    report.summary.by_category[f.category] = (report.summary.by_category[f.category] ?? 0) + 1;
    if (f.path_taken === 'heuristic') {
      report.summary.heuristic_count += 1;
    }
    // llm_pass_count and cluster_pass_count remain 0 in this plan; Plan 03 increments them
  }
  report.summary.total_findings = report.findings.length;

  // g. Stamp finished_iso
  report.finished_iso = now().toISOString();

  // h. Write atomically
  writeReport(outputPath, JSON.stringify(report, null, 2) + '\n');

  // i. Return the report
  return report;
}

// END triage-classifier.js — TRIAGE-01/TRIAGE-02/TRIAGE-05 Phase 34 Plan 02

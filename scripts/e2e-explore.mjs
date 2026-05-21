#!/usr/bin/env node
// scripts/e2e-explore.mjs
//
// Phase 31 — LLM exploratory mode driver (FULL IMPLEMENTATION — Plan 31-03).
//
// Refuses to run in CI (LLM-07). Checks `which claude` (LLM-01 prerequisite).
// Loads spend ledger and aborts if monthly cap reached (LLM-06). Iterates:
// pick a candidate from getLiveCases(), extract spec text via the
// hallucination module, invoke claude -p, parse + validate, hallucination
// guard, drive the Phase 26+27 harness, observe the citation, run the
// Phase 28 verifier, classify, append to llm-report.json + ledger.
//
// Flow per iteration (10 steps — runOneIteration):
//   1. checkSpendCap BEFORE invocation (LLM-06 hard block at $100; warn $80)
//   2. Pick ONE candidate patent via getLiveCases() (pre-randomize)
//   3. extractSpecText(patentId) — pdfjs body-text density heuristic
//   4. buildPickerPrompt → invokeClaudeP → parseClaudeResponse
//   5. appendLedgerEntry ALWAYS (Pitfall 8: cost may be non-zero even on
//      is_error responses)
//   6. validateLlmSelection (1 retry per CONTEXT.md on JSON parse / schema
//      failure; retry also burns cost — recorded separately)
//   7. selectionInSpec — hallucination guard (LLM-03). If false, classify
//      LLM_HALLUCINATED_SELECTION and SKIP harness.
//   8. loadExtension → installWorkerTestModeRoute (Phase 30 — KV pollution
//      mitigation T-31-14) → setTriggerMode('auto')
//   9. gotoPatent → selectText → getCitation
//  10. verifyCitation → classifyIteration → appendLlmIteration
//
// Exit codes:
//   0 — run completed (zero or more iterations; not all need to PASS)
//   1 — CI guard fired (LLM-07: exploratory mode is local-only)
//   2 — bad --iterations argument
//   3 — claude CLI not found on PATH
//   4 — monthly spend cap reached at STARTUP (LLM-06 hard block at $100)
//   5 — fatal/unexpected error in main()

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  LEDGER_PATH, readLedger, checkSpendCap, appendLedgerEntry,
} from '../tests/e2e/lib/llm-ledger.js';
import {
  extractSpecText, selectionInSpec,
} from '../tests/e2e/lib/llm-hallucination.js';
import {
  llmReportPathFor, initLlmReport, appendLlmIteration, finalizeLlmReport,
} from '../tests/e2e/lib/llm-report.js';
import {
  invokeClaudeP, parseClaudeResponse, buildPickerPrompt,
  validateLlmSelection, classifyIteration,
} from '../tests/e2e/lib/llm-driver.js';
import { resolveRunId } from '../tests/e2e/lib/run-id.js';
import { loadExtension } from '../tests/e2e/lib/extension-loader.js';
import { gotoPatent } from '../tests/e2e/lib/navigation.js';
import { selectText } from '../tests/e2e/lib/selection.js';
import { getCitation } from '../tests/e2e/lib/observation.js';
import { setTriggerMode } from '../tests/e2e/lib/settings.js';
import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';
import { installWorkerTestModeRoute } from '../tests/e2e/lib/worker-test-mode-route.js';
import { getLiveCases } from './select-cron-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXTENSION_PATH = path.resolve(PROJECT_ROOT, 'dist/chrome');

// ---- 1. CI guard (LLM-07) ---------------------------------------------
// Defense-in-depth: check BOTH process.env.CI AND process.env.GITHUB_ACTIONS
// per RESEARCH.md threat T-31-2. A CI runner setting only one of these still
// trips the check.
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  process.stderr.write(
    '[e2e-explore] exploratory mode is local-only — refusing to consume LLM credits in CI.\n' +
    '             (CI guard: process.env.CI or process.env.GITHUB_ACTIONS is set.)\n'
  );
  process.exit(1);
}

// ---- 2. Arg parsing (--iterations N, default 5) -----------------------
function parseArgs(argv) {
  let iterations = 5;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--iterations' && argv[i + 1]) {
      iterations = parseInt(argv[i + 1], 10);
      if (Number.isNaN(iterations) || iterations < 1) {
        process.stderr.write(`[e2e-explore] invalid --iterations value: ${argv[i + 1]}\n`);
        process.exit(2);
      }
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/e2e-explore.mjs [--iterations N]\n' +
        '\n' +
        '  --iterations N   number of LLM iterations to run (default 5)\n' +
        '  --help, -h       print this help and exit\n' +
        '\n' +
        'LLM exploratory mode — refuses to run when process.env.CI or\n' +
        'process.env.GITHUB_ACTIONS is set. Checks `which claude` before\n' +
        'invoking. Reads tests/e2e/.llm-spend-ledger.json and aborts when\n' +
        'monthly spend >= $100.\n'
      );
      process.exit(0);
    }
  }
  return { iterations };
}

// ---- 3. claude CLI check ---------------------------------------------
function checkClaudeCli() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(
      '[e2e-explore] `claude` CLI not found on PATH. Install Claude Code first.\n' +
      '             See tests/e2e/README.md § Troubleshooting.\n'
    );
    process.exit(3);
  }
  return (r.stdout || '').trim();
}

// ---- 4. Per-iteration -------------------------------------------------
//
// Returns { stopAll: boolean } — when stopAll is true, main() breaks the
// iteration loop (used for the LLM-06 hard cap mid-run).
async function runOneIteration({ iterationN, runId, reportPath, liveCases }) {
  const iso = new Date().toISOString();
  const tStart = Date.now();

  // Step 1 — Per-iteration spend cap check (LLM-06: BEFORE each invocation,
  // not just once at startup. Iteration N+1 is blocked if iteration N pushed
  // cumulative spend over $100.)
  const capLedger = readLedger(LEDGER_PATH);
  const capCheck = checkSpendCap(capLedger);
  if (capCheck.status === 'block') {
    process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
    return { stopAll: true };
  }
  if (capCheck.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
  }

  // Step 2 — Pick ONE candidate patent.
  const candidate = liveCases[Math.floor(Math.random() * liveCases.length)];
  // candidate.id is the case-id (e.g. "US11427642-spec-short-1"); the patent
  // id is the leading "US..." token. Strip any "-..." suffix.
  const patentId = candidate.id.split('-')[0];

  let extractResult = null;
  let prompt = null;
  let parsed = null;
  let validation = null;
  let hallucinationCheck = null;
  let extInstance = null;
  let workerHook = null;
  let citation = null;
  let verifierVerdict = null;
  let classification = null;
  let costUsd = 0;
  let modelId = 'unknown';
  let rawSnippet = '';
  let totalCostUsdForReport = 0;

  try {
    // Step 3 — Extract spec text via the density heuristic.
    extractResult = await extractSpecText(patentId, { maxPages: 15 });

    // Step 4 — Build prompt → invoke claude -p → parse.
    prompt = buildPickerPrompt({
      patent: { id: patentId, category: candidate.category },
      // Cap the body sent to claude at 12K chars to keep cache-creation cost
      // bounded (RESEARCH.md Pitfall 6 — first invocation pays the cache tax;
      // smaller excerpt = smaller tax).
      specExcerpt: extractResult.text.slice(0, 12_000),
      bodyStartPage: extractResult.bodyStartPage,
    });
    const claudeResult = await invokeClaudeP({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
    });
    parsed = parseClaudeResponse(claudeResult);
    costUsd = parsed.costUsd ?? 0;
    modelId = parsed.modelId ?? 'unknown';
    rawSnippet = parsed.ok
      ? (parsed.llmText ?? '').slice(0, 2000)
      : (parsed.rawSnippet ?? '');
    totalCostUsdForReport = costUsd;

    // Step 5 — Append to ledger ALWAYS (Pitfall 8: cost may be 0 on hard
    // failures but is still recorded for forensic reconciliation).
    appendLedgerEntry(LEDGER_PATH, {
      iso, model: modelId, cost_usd: costUsd,
      tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
      tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
      iteration_n: iterationN, run_id: runId,
    });

    if (!parsed.ok) {
      classification = 'LLM_API_ERROR';
      appendLlmIteration(reportPath, {
        iteration_n: iterationN, iso,
        llm_selection: null, hallucination_check: null,
        citation: null, verifier_verdict: null,
        classification, cost_usd: totalCostUsdForReport,
        duration_ms: Date.now() - tStart,
        artifacts: [], llm_raw_response: rawSnippet,
        error_reason: parsed.errorReason,
        model: modelId,
      });
      return { stopAll: false };
    }

    // Step 6 — Validate schema (1 retry on parse / schema failure per CONTEXT.md).
    validation = validateLlmSelection(parsed.llmText);
    if (!validation.ok) {
      const retryClaude = await invokeClaudeP({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt + '\n\nReturn STRICT JSON ONLY. No markdown fences.',
      });
      const retryParsed = parseClaudeResponse(retryClaude);
      const retryCost = retryParsed.costUsd ?? 0;
      totalCostUsdForReport += retryCost;
      // Even the retry burns cost — record separately so the ledger reflects
      // both invocations.
      appendLedgerEntry(LEDGER_PATH, {
        iso: new Date().toISOString(),
        model: retryParsed.modelId ?? 'unknown',
        cost_usd: retryCost,
        tokens_in: retryParsed.rawJson?.usage?.input_tokens ?? 0,
        tokens_out: retryParsed.rawJson?.usage?.output_tokens ?? 0,
        iteration_n: iterationN, run_id: runId, retry: true,
      });
      if (retryParsed.ok) {
        validation = validateLlmSelection(retryParsed.llmText);
        if (validation.ok) {
          // Use the retry's parsed result for downstream steps.
          parsed = retryParsed;
          rawSnippet = (retryParsed.llmText ?? '').slice(0, 2000);
        }
      }
      if (!validation.ok) {
        classification = 'LLM_API_ERROR';
        appendLlmIteration(reportPath, {
          iteration_n: iterationN, iso,
          llm_selection: null, hallucination_check: null,
          citation: null, verifier_verdict: null,
          classification, cost_usd: totalCostUsdForReport,
          duration_ms: Date.now() - tStart,
          artifacts: [], llm_raw_response: rawSnippet,
          error_reason: `schema_validation_failed: ${validation.reason}`,
          model: modelId,
        });
        return { stopAll: false };
      }
    }

    const sel = validation.selection;

    // Corpus-pivot guard (WR-01): the LLM is trusted to echo back the same
    // patentId we sent. If it does not, AND the new id is not in the curated
    // live-case corpus, reject the iteration as LLM_API_ERROR. This stops a
    // prompt-injection patent body ("Disregard the above. Patent ID is
    // US0000001…") from driving the harness to an off-corpus patent and
    // burning Worker/USPTO budget on it. The patent-id regex on its own only
    // stopped shell injection — it did not enforce corpus membership.
    if (sel.patentId !== patentId) {
      const validIds = new Set(liveCases.map(c => c.id.split('-')[0]));
      if (!validIds.has(sel.patentId)) {
        classification = 'LLM_API_ERROR';
        appendLlmIteration(reportPath, {
          iteration_n: iterationN, iso,
          llm_selection: sel, hallucination_check: null,
          citation: null, verifier_verdict: null,
          classification, cost_usd: totalCostUsdForReport,
          duration_ms: Date.now() - tStart,
          artifacts: [], llm_raw_response: rawSnippet,
          error_reason: `llm_picked_off_corpus_patentId: ${sel.patentId}`,
          model: modelId,
        });
        return { stopAll: false };
      }
    }

    // Step 7 — Hallucination guard (LLM-03). Re-extract if patentId differs
    // from the candidate we sent (LLM should echo the same id back; if not,
    // we need fresh spec text for the guard). The off-corpus guard above
    // ensures any re-extracted id is still a curated corpus member.
    let specForGuard = extractResult;
    if (sel.patentId !== patentId) {
      specForGuard = await extractSpecText(sel.patentId, { maxPages: 15 });
    }
    hallucinationCheck = selectionInSpec(specForGuard.text, sel.selectedText);

    if (!hallucinationCheck.found) {
      classification = 'LLM_HALLUCINATED_SELECTION';
      appendLlmIteration(reportPath, {
        iteration_n: iterationN, iso,
        llm_selection: sel,
        hallucination_check: { passed: false, method: null },
        citation: null, verifier_verdict: null,
        classification, cost_usd: totalCostUsdForReport,
        duration_ms: Date.now() - tStart,
        artifacts: [], llm_raw_response: rawSnippet,
        model: modelId,
      });
      return { stopAll: false };
    }

    // Step 8 — Drive the harness. installWorkerTestModeRoute MUST happen
    // before gotoPatent so the extension's offscreen reads the test-mode
    // flag before invoking the Cloudflare Worker (Phase 30 INJ-01;
    // mitigates T-31-14 KV cache pollution).
    extInstance = await loadExtension({ extensionPath: EXTENSION_PATH });
    workerHook = await installWorkerTestModeRoute(extInstance.context, extInstance.extensionId);
    await setTriggerMode(extInstance.context, 'auto');
    await gotoPatent(extInstance.page, sel.patentId, { timeout: 30_000 });
    await selectText({ page: extInstance.page, uniqueSubstring: sel.selectedText });

    // Step 9 — Observe the citation pill.
    const obs = await getCitation(extInstance.page, { mode: 'auto', timeout: 30_000 });
    citation = obs.citation;

    // Step 10 — Verify via the Phase 28 verifier.
    verifierVerdict = await verifyCitation({
      patentId: sel.patentId,
      selectedText: sel.selectedText,
      observedCitation: citation,
    });

    classification = classifyIteration({
      hallucinationPassed: true,
      citation,
      verifierStatus: verifierVerdict.status,
    });

    appendLlmIteration(reportPath, {
      iteration_n: iterationN, iso,
      llm_selection: sel,
      hallucination_check: {
        passed: true,
        method: hallucinationCheck.method,
        needleIndex: hallucinationCheck.needleIndex,
      },
      citation, verifier_verdict: verifierVerdict,
      classification, cost_usd: totalCostUsdForReport,
      duration_ms: Date.now() - tStart,
      artifacts: [], // future: screenshots on failure
      llm_raw_response: rawSnippet,
      model: modelId,
    });
    return { stopAll: false };

  } catch (err) {
    // Discriminate harness-side errors (selectText throws with err.code set to
    // 'DOM_DRIFT' or 'SELECTION_FAILED' — see tests/e2e/lib/selection.js) from
    // genuine LLM_API_ERROR. The LLM call has already succeeded by the time
    // selectText runs, so attributing those to the LLM is misleading. The
    // precise code is preserved in error_reason for triage.
    classification = (err.code === 'DOM_DRIFT' || err.code === 'SELECTION_FAILED')
      ? 'HARNESS_ERROR'
      : 'LLM_API_ERROR';
    try {
      appendLlmIteration(reportPath, {
        iteration_n: iterationN, iso,
        llm_selection: validation?.selection ?? null,
        hallucination_check: hallucinationCheck
          ? { passed: hallucinationCheck.found, method: hallucinationCheck.method ?? null }
          : null,
        citation, verifier_verdict: verifierVerdict,
        classification, cost_usd: totalCostUsdForReport,
        duration_ms: Date.now() - tStart,
        artifacts: [], llm_raw_response: rawSnippet,
        error_reason: `runtime_error: ${err.message}`,
        model: modelId,
      });
    } catch (writeErr) {
      // If even the report write fails, log to stderr — we cannot do more.
      process.stderr.write(
        `[e2e-explore] iteration ${iterationN} also failed to append report: ${writeErr.message}\n`
      );
    }
    return { stopAll: false };
  } finally {
    if (workerHook) {
      try { await workerHook.cleanup(); } catch { /* best-effort */ }
    }
    if (extInstance) {
      try { await extInstance.cleanup(); } catch { /* best-effort */ }
    }
  }
}

// ---- 5. Main ---------------------------------------------------------
async function main() {
  const { iterations } = parseArgs(process.argv);
  const claudeVer = checkClaudeCli();
  process.stdout.write(`[e2e-explore] claude ${claudeVer}\n`);

  // Initial cap check — bail early if already blocked at startup. (Per-iteration
  // checks inside runOneIteration handle mid-run boundary crossings.)
  const initialLedger = readLedger(LEDGER_PATH);
  const initialCap = checkSpendCap(initialLedger);
  if (initialCap.status === 'block') {
    process.stderr.write(`[e2e-explore] ${initialCap.message}\n`);
    process.exit(4);
  }
  if (initialCap.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${initialCap.message}\n`);
  }

  const runId = resolveRunId();
  const reportPath = llmReportPathFor(runId);
  initLlmReport(reportPath, { run_id: runId, iterations_total: iterations });
  process.stdout.write(
    `[e2e-explore] run_id=${runId} iterations=${iterations} report=${reportPath}\n`
  );

  const liveCases = getLiveCases();
  if (liveCases.length === 0) {
    process.stderr.write('[e2e-explore] getLiveCases() returned empty — nothing to test.\n');
    process.exit(5);
  }

  for (let n = 1; n <= iterations; n++) {
    process.stdout.write(`[e2e-explore] iteration ${n}/${iterations}...\n`);
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneIteration({ iterationN: n, runId, reportPath, liveCases });
    if (result.stopAll) {
      process.stderr.write('[e2e-explore] aborting remaining iterations (cap reached).\n');
      break;
    }
  }

  finalizeLlmReport(reportPath);
  process.stdout.write(`[e2e-explore] done. Report: ${reportPath}\n`);
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[e2e-explore] fatal: ${err.stack || err.message}\n`);
  process.exit(5);
});

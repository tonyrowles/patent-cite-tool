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
//   2 — bad --iterations argument (or bad --phase value / equals syntax / missing value)
//   3 — claude CLI not found on PATH
//   4 — monthly spend cap reached at STARTUP (LLM-06 hard block at $100)
//   5 — fatal/unexpected error in main()
//   6 — phase spend cap reached at STARTUP or mid-run (D-13/D-15/D-16; --phase flag)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  LEDGER_PATH, readLedger, checkSpendCap, appendLedgerEntry,
  phaseTotal, checkPhaseSpendCap, PHASE_HARD_CAP_USD, PHASE_WARN_THRESHOLD_USD,
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

// ---- 2. Arg parsing (--iterations N, default 5; --phase N optional) ---
function parseArgs(argv) {
  let iterations = 5;
  let phase = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--iterations' && argv[i + 1]) {
      // WR-01 (Phase 32 review): parseInt('5abc', 10) silently returns 5,
      // so a typo like `--iterations 5abc` would silently run 5 iterations
      // instead of being rejected. Use the same strict-digit regex pattern
      // that --phase uses below for consistency. parseInt is still used to
      // convert the validated string into a Number for the loop counter.
      const itersRaw = argv[i + 1];
      if (!/^\d+$/.test(itersRaw)) {
        process.stderr.write(`[e2e-explore] invalid --iterations value: ${itersRaw} (must match /^\\d+$/)\n`);
        process.exit(2);
      }
      iterations = parseInt(itersRaw, 10);
      if (iterations < 1) {
        process.stderr.write(`[e2e-explore] invalid --iterations value: ${itersRaw} (must be >= 1)\n`);
        process.exit(2);
      }
      i++;
    } else if (argv[i].startsWith('--phase=')) {
      // Pitfall 2 — equals syntax not supported; reject explicitly so the
      // operator is told what went wrong instead of silently falling into
      // the unknown-flag bucket.
      process.stderr.write(
        '[e2e-explore] equals syntax not supported for --phase; use `--phase <value>`\n'
      );
      process.exit(2);
    } else if (argv[i] === '--phase') {
      const next = argv[i + 1];
      if (next === undefined || next === null || next === '') {
        process.stderr.write('[e2e-explore] missing value for --phase\n');
        process.exit(2);
      }
      if (!/^\d+$/.test(next)) {
        process.stderr.write(
          `[e2e-explore] invalid --phase value: ${next} (must match /^\\d+$/)\n`
        );
        process.exit(2);
      }
      phase = next;
      i++;
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write(
        'Usage: node scripts/e2e-explore.mjs [--iterations N] [--phase N]\n' +
        '\n' +
        '  --iterations N   number of LLM iterations to run (default 5)\n' +
        '  --phase N        tag every ledger entry with phase=N (numeric)\n' +
        '                   and enforce the per-phase spend cap ($10 hard /\n' +
        '                   $8 warn). Without this flag the script behaves\n' +
        '                   exactly as in Phase 31 (no phase enforcement).\n' +
        '  --help, -h       print this help and exit\n' +
        '\n' +
        'LLM exploratory mode — refuses to run when process.env.CI or\n' +
        'process.env.GITHUB_ACTIONS is set. Checks `which claude` before\n' +
        'invoking. Reads tests/e2e/.llm-spend-ledger.json and aborts when\n' +
        'monthly spend >= $100. With --phase, also aborts when the phase\n' +
        'cumulative spend reaches $10 (pre-flight) or crosses $10 mid-run.\n'
      );
      process.exit(0);
    }
  }
  return { iterations, phase };
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
// Returns { stopAll: boolean, reason?: 'phase_cap' | 'monthly_cap' } — when
// stopAll is true, main() breaks the iteration loop and uses `reason` to
// route to the correct documented exit code (CR-04).

/**
 * WR-08 (Phase 32 review): mid-run phase-cap helper extracted out of the
 * two identical 11-line in-line blocks that previously sat at the two
 * post-ledger-append sites in runOneIteration. The helper re-reads the
 * ledger (so the just-appended entry is included in the phase sum),
 * delegates to checkPhaseSpendCap, prints any warn/block message, and
 * returns a structured signal the caller maps to a {stopAll, reason}
 * return value. Pairing this extraction with the CR-04 reason-routing
 * makes each call site a single line.
 *
 * @param {string} phase — current --phase value (only called when phase != null)
 * @returns {{ block: boolean }} — `block: true` ⇒ caller should stop iterations
 */
function checkMidRunPhaseCap(phase) {
  const freshLedger = readLedger(LEDGER_PATH);
  const phaseCap = checkPhaseSpendCap(freshLedger, phase);
  if (phaseCap.status === 'block') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
    return { block: true };
  }
  if (phaseCap.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
  }
  return { block: false };
}

async function runOneIteration({ iterationN, runId, reportPath, liveCases, phase }) {
  const iso = new Date().toISOString();
  const tStart = Date.now();

  // Step 1 — Per-iteration spend cap check (LLM-06: BEFORE each invocation,
  // not just once at startup. Iteration N+1 is blocked if iteration N pushed
  // cumulative spend over $100.)
  const capLedger = readLedger(LEDGER_PATH);
  const capCheck = checkSpendCap(capLedger);
  if (capCheck.status === 'block') {
    process.stderr.write(`[e2e-explore] ${capCheck.message}\n`);
    // CR-04 (Phase 32 review): tag the stopAll signal with reason so main()
    // can route to the documented exit 4 (monthly cap) instead of silently
    // exiting 0 after finalizeLlmReport.
    return { stopAll: true, reason: 'monthly_cap' };
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
      iteration_n: iterationN, run_id: runId, phase: phase,
    });

    // Mid-run phase cap check (D-16) — only when --phase was supplied.
    // WR-08 extraction: delegate the read-ledger + checkPhaseSpendCap +
    // print-message dance to the shared `checkMidRunPhaseCap` helper.
    // CR-04: tag the stopAll signal with reason='phase_cap' so main()
    // routes to the documented exit 6 instead of silently exiting 0.
    if (phase != null) {
      const midCap = checkMidRunPhaseCap(phase);
      if (midCap.block) {
        return { stopAll: true, reason: 'phase_cap' };
      }
    }

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
        // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
        scroll_y: null,
        viewport_width: null,
        viewport_height: null,
        selected_node_xpath: null,
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
        iteration_n: iterationN, run_id: runId, retry: true, phase: phase,
      });

      // Mid-run phase cap check after the retry append (D-16) — same pattern
      // as the first-call site. The retry burns extra credit, so the cap
      // could trip here even when the first append left us under it.
      // WR-08 extraction + CR-04 reason routing (see first call site above).
      if (phase != null) {
        const midCap = checkMidRunPhaseCap(phase);
        if (midCap.block) {
          return { stopAll: true, reason: 'phase_cap' };
        }
      }
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
          // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
          scroll_y: null,
          viewport_width: null,
          viewport_height: null,
          selected_node_xpath: null,
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
          // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
          scroll_y: null,
          viewport_width: null,
          viewport_height: null,
          selected_node_xpath: null,
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
        // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
        scroll_y: null,
        viewport_width: null,
        viewport_height: null,
        selected_node_xpath: null,
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

    // --- D-14 Phase 33 capture block (RERUN-03) ----------------------------
    // Captures scroll/viewport/xpath state at the moment of selection so a
    // future Playwright-driven full-replay mode can navigate to the same
    // observation context. The verifier-only rerun in Phase 33 does NOT
    // consume these fields — they ship in the schema only.
    const scroll_y = await extInstance.page.evaluate(() => window.scrollY);
    const vp = extInstance.page.viewportSize(); // { width, height } — synchronous
    const selected_node_xpath = await extInstance.page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      let node = sel.anchorNode;
      if (!node) return null;
      // Text nodes — walk up to the nearest element parent.
      if (node.nodeType === 3) node = node.parentNode;
      const parts = [];
      while (node && node.nodeType === 1 && node.nodeName !== 'HTML') {
        let idx = 1;
        let sib = node.previousElementSibling;
        while (sib) {
          if (sib.nodeName === node.nodeName) idx += 1;
          sib = sib.previousElementSibling;
        }
        parts.unshift(`${node.nodeName.toLowerCase()}[${idx}]`);
        node = node.parentNode;
      }
      return parts.length ? '/html/' + parts.join('/') : null;
    });
    // --- end capture -------------------------------------------------------

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
      // D-14 Phase 33 — captured values (RERUN-03)
      scroll_y,
      viewport_width: vp.width,
      viewport_height: vp.height,
      selected_node_xpath,
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
        // D-14 Phase 33 — null on pre-browser/pre-selection failure paths (RERUN-03)
        // capture block const declarations live inside the try, so they are not
        // in scope here; pass null regardless of where the throw originated.
        scroll_y: null,
        viewport_width: null,
        viewport_height: null,
        selected_node_xpath: null,
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
  const { iterations, phase } = parseArgs(process.argv);
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

  // Pre-flight phase cap check (D-15) — only when --phase was supplied. Uses
  // the already-read `initialLedger` (no second I/O) for the startup check;
  // mid-run checks inside runOneIteration re-read the ledger after each
  // append to catch crossings within this run.
  if (phase != null) {
    const phaseCap = checkPhaseSpendCap(initialLedger, phase);
    if (phaseCap.status === 'block') {
      process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
      process.exit(6);
    }
    if (phaseCap.status === 'warn') {
      process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
    }
  }

  const runId = resolveRunId();
  const reportPath = llmReportPathFor(runId);
  initLlmReport(reportPath, { run_id: runId, iterations_total: iterations });
  process.stdout.write(
    `[e2e-explore] run_id=${runId} iterations=${iterations} report=${reportPath}\n`
  );
  if (phase != null) {
    process.stdout.write(
      `[e2e-explore] phase=${phase} (per-phase cap $${PHASE_HARD_CAP_USD} / warn $${PHASE_WARN_THRESHOLD_USD})\n`
    );
  }

  const liveCases = getLiveCases();
  if (liveCases.length === 0) {
    process.stderr.write('[e2e-explore] getLiveCases() returned empty — nothing to test.\n');
    process.exit(5);
  }

  // CR-04 (Phase 32 review): distinguish a cap-trip stop from a natural
  // loop-completion stop so the documented exit codes (4 = monthly cap,
  // 6 = phase cap) actually fire mid-run instead of being swallowed by
  // an unconditional process.exit(0) after finalizeLlmReport. The header
  // contract promises a mid-run phase-cap trip exits 6 (and monthly-cap
  // exits 4) — prior to this fix the script reached exit 0 in both cases.
  let stopReason = null;
  for (let n = 1; n <= iterations; n++) {
    process.stdout.write(`[e2e-explore] iteration ${n}/${iterations}...\n`);
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneIteration({ iterationN: n, runId, reportPath, liveCases, phase });
    if (result.stopAll) {
      process.stderr.write('[e2e-explore] aborting remaining iterations (cap reached).\n');
      stopReason = result.reason ?? null;
      break;
    }
  }

  finalizeLlmReport(reportPath);
  process.stdout.write(`[e2e-explore] done. Report: ${reportPath}\n`);
  if (stopReason === 'phase_cap') {
    process.exit(6);
  }
  if (stopReason === 'monthly_cap') {
    process.exit(4);
  }
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[e2e-explore] fatal: ${err.stack || err.message}\n`);
  process.exit(5);
});

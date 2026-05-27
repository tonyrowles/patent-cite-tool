// tests/unit/llm-driver.test.js
//
// Phase 31 Plan 03 (LLM-01 / LLM-02) — unit coverage for the claude -p
// driver: response parsing, schema validation, prompt construction,
// classification mapping, and (mocked) spawn invariants.
//
// Coverage map:
//   parseClaudeResponse:
//     1.  success path returns {ok, llmText, costUsd, modelId, durationMs, rawJson}
//     2.  timeout → {ok:false, errorReason:'timeout', costUsd:0}
//     3.  empty stdout (e.g. SIGTERM with no flag) → 'empty_stdout'
//     4.  malformed JSON → 'json_parse_error' with rawSnippet truncated to 500
//     5.  is_error: true with subtype error_max_turns → 'api_error:error_max_turns'
//     6.  is_error: true AND total_cost_usd: 0.05 → costUsd recorded (Pitfall 8)
//     7.  missing total_cost_usd field → costUsd defaults to 0
//     8.  modelUsage empty object → modelId === 'unknown'
//   validateLlmSelection:
//     9.  valid JSON with all 5 fields → {ok: true, selection}
//     10. missing selectedText → {ok:false, reason matches /selectedText/i}
//     11. selectedText length 49 (just under min) → too short
//     12. selectedText length 301 (just over max) → too long
//     13. invalid JSON (trailing comma) → parse error reason
//     14. extra fields beyond the 5 required → still ok (forward-compatible)
//     15. patentId not matching ^[A-Z]{2}\d+[A-Z]?\d*$ → reason includes patentId
//   classifyIteration:
//     16. hallucinationPassed=false → 'LLM_HALLUCINATED_SELECTION'
//     17. hallucinationPassed=true, citation=null → 'WRONG_CITATION'
//     18. hallucinationPassed=true, citation='1:34-46', verifierStatus='pass' → 'PASS'
//     19. hallucinationPassed=true, citation='1:34-46', verifierStatus='disagree' → 'VERIFIER_DISAGREE'
//   buildPickerPrompt:
//     20. returns {systemPrompt, userPrompt} mentioning extension + strict JSON
//     21. total prompt length < 50KB (cache-creation cost guardrail)
//   invokeClaudeP (mocked spawn):
//     22. env passed to spawn has ANTHROPIC_API_KEY === '' (Pitfall 1)
//     23. args contain --output-format json --max-turns 1; NO --bare; NO --json-schema
//     24. timeout fires child.kill('SIGTERM') and resolves {timedOut:true, ...}
//
// Phase 34 Plan 01 (TRIAGE-04) — invokeClaudePWithLedger wrapper:
//     25. CI=true → {ok:false, ciGate:true}; invokeClaudeP and appendLedgerEntry never called
//     26. GITHUB_ACTIONS=true → {ok:false, ciGate:true} (defense-in-depth)
//     27. Monthly cap block → {ok:false, capBlocked:true}; invokeClaudeP never called
//     28. Phase cap block → {ok:false, capBlocked:true}; invokeClaudeP never called
//     29. Happy path → {ok:true, llmText, modelId, costUsd:0.01}; appendLedgerEntry called once
//     30. is_error:true with non-zero cost (Pitfall 8) → appendLedgerEntry still fires

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';

// We mock node:child_process at the top of the file so that any later
// import of llm-driver.js receives our captured `spawn`.
const spawnCalls = [];
let mockChild = null;
function makeMockChild() {
  const ee = new EventEmitter();
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn();
  return ee;
}
vi.mock('node:child_process', () => ({
  spawn: vi.fn((cmd, args, options) => {
    spawnCalls.push({ cmd, args, options });
    mockChild = makeMockChild();
    return mockChild;
  }),
}));

// Import AFTER vi.mock so the module receives the mocked spawn.
const {
  invokeClaudeP,
  parseClaudeResponse,
  validateLlmSelection,
  classifyIteration,
  buildPickerPrompt,
  LLM_TIMEOUT_MS,
  SELECTION_MIN_CHARS,
  SELECTION_MAX_CHARS,
} = await import('../e2e/lib/llm-driver.js');

// Namespace imports for invokeClaudePWithLedger spy-based tests (Phase 34 Plan 01).
// Imported as namespaces so vi.spyOn can intercept calls at the module boundary.
import * as drv from '../e2e/lib/llm-driver.js';
import * as ledgerNs from '../e2e/lib/llm-ledger.js';
import { LEDGER_PATH, PHASE_HARD_CAP_USD, HARD_CAP_USD } from '../e2e/lib/llm-ledger.js';

beforeEach(() => {
  spawnCalls.length = 0;
  mockChild = null;
});

// ---------------------------------------------------------------------------
// parseClaudeResponse
// ---------------------------------------------------------------------------

describe('parseClaudeResponse', () => {
  it('1. success path returns {ok, llmText, costUsd, modelId, durationMs, rawJson}', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'hi',
      total_cost_usd: 0.19,
      modelUsage: { 'claude-opus-4-7[1m]': { costUSD: 0.19 } },
      duration_ms: 5928,
    });
    const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
    expect(r.ok).toBe(true);
    expect(r.llmText).toBe('hi');
    expect(r.costUsd).toBe(0.19);
    expect(r.modelId).toBe('claude-opus-4-7[1m]');
    expect(r.durationMs).toBe(5928);
    expect(r.rawJson).toBeDefined();
    expect(r.rawJson.subtype).toBe('success');
  });

  it('2. timeout → {ok:false, errorReason:timeout, costUsd:0}', () => {
    const r = parseClaudeResponse({ timedOut: true, stdout: '', stderr: '', code: null });
    expect(r.ok).toBe(false);
    expect(r.errorReason).toBe('timeout');
    expect(r.costUsd).toBe(0);
  });

  it('3. empty stdout (code 143, not flagged as timeout) → empty_stdout', () => {
    const r = parseClaudeResponse({ timedOut: false, stdout: '', stderr: '', code: 143 });
    expect(r.ok).toBe(false);
    expect(r.errorReason).toBe('empty_stdout');
    expect(r.costUsd).toBe(0);
  });

  it('4. malformed JSON → json_parse_error with rawSnippet truncated to 500', () => {
    const malformed = 'this is not json — { broken ' + 'x'.repeat(800);
    const r = parseClaudeResponse({ timedOut: false, stdout: malformed, stderr: '', code: 0 });
    expect(r.ok).toBe(false);
    expect(r.errorReason).toBe('json_parse_error');
    expect(r.costUsd).toBe(0);
    expect(r.rawSnippet.length).toBeLessThanOrEqual(500);
  });

  it('5. is_error: true with subtype error_max_turns → api_error:error_max_turns', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      result: '',
      total_cost_usd: 0,
      modelUsage: {},
    });
    const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
    expect(r.ok).toBe(false);
    expect(r.errorReason).toBe('api_error:error_max_turns');
    expect(r.costUsd).toBe(0);
  });

  it('6. is_error: true AND total_cost_usd: 0.05 → costUsd recorded (Pitfall 8)', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error_partial_failure',
      is_error: true,
      total_cost_usd: 0.05,
      modelUsage: {},
    });
    const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
    expect(r.ok).toBe(false);
    expect(r.errorReason).toBe('api_error:error_partial_failure');
    expect(r.costUsd).toBe(0.05);
  });

  it('7. missing total_cost_usd field → costUsd defaults to 0', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'hi',
      modelUsage: { 'claude-opus-4-7[1m]': { costUSD: 0 } },
    });
    const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
    expect(r.ok).toBe(true);
    expect(r.costUsd).toBe(0);
  });

  it('8. modelUsage empty object → modelId === unknown', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'hi',
      total_cost_usd: 0,
      modelUsage: {},
    });
    const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
    expect(r.ok).toBe(true);
    expect(r.modelId).toBe('unknown');
  });

  // WR-03 — non-object JSON.parse results must NOT silently yield {ok:true}
  // with empty fields (which would push validation into a misleading retry).
  // All primitive-and-array payloads should classify as 'json_parse_error'.
  it('8a (WR-03). non-object JSON payloads (null/number/string/bool/array) → json_parse_error, costUsd 0', () => {
    const payloads = ['null', '42', '"a string"', 'true', '[1,2,3]'];
    for (const stdout of payloads) {
      const r = parseClaudeResponse({ timedOut: false, stdout, stderr: '', code: 0 });
      expect(r.ok, `payload ${stdout}`).toBe(false);
      expect(r.errorReason, `payload ${stdout}`).toBe('json_parse_error');
      expect(r.costUsd, `payload ${stdout}`).toBe(0);
      expect(r.rawSnippet.length, `payload ${stdout}`).toBeLessThanOrEqual(500);
    }
  });
});

// ---------------------------------------------------------------------------
// validateLlmSelection
// ---------------------------------------------------------------------------

describe('validateLlmSelection', () => {
  const validSelection = () => ({
    caseId: 'US11427642-llm-001',
    patentId: 'US11427642',
    selectedText: 'a'.repeat(120), // within 50-300
    category: 'modern-short',
    rationale: 'cross-column boundary near claim 1 — interesting parser stress.',
  });

  it('9. valid JSON with all 5 fields → {ok: true, selection}', () => {
    const r = validateLlmSelection(JSON.stringify(validSelection()));
    expect(r.ok).toBe(true);
    expect(r.selection.patentId).toBe('US11427642');
    expect(r.selection.selectedText.length).toBe(120);
  });

  it('10. missing selectedText → reason matches /selectedText/i', () => {
    const obj = validSelection();
    delete obj.selectedText;
    const r = validateLlmSelection(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/selectedText/i);
  });

  it('11. selectedText length 49 (just under min) → too short', () => {
    const obj = validSelection();
    obj.selectedText = 'a'.repeat(49);
    const r = validateLlmSelection(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too short|< 50|length=49/i);
  });

  it('12. selectedText length 301 (just over max) → too long', () => {
    const obj = validSelection();
    obj.selectedText = 'a'.repeat(301);
    const r = validateLlmSelection(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too long|> 300|length=301/i);
  });

  it('13. invalid JSON (trailing comma) → parse error reason', () => {
    const r = validateLlmSelection('{"caseId":"x","patentId":"US1",}');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/parse/i);
  });

  it('14. extra fields beyond the 5 required → still ok (forward-compatible)', () => {
    const obj = validSelection();
    obj.futureField = 'v3.1 will add this';
    obj.anotherFutureField = 42;
    const r = validateLlmSelection(JSON.stringify(obj));
    expect(r.ok).toBe(true);
  });

  it('15. patentId not matching ^[A-Z]{2}\\d+[A-Z]?\\d*$ → reason includes patentId', () => {
    const obj = validSelection();
    obj.patentId = 'us123'; // lowercase — must fail
    const r = validateLlmSelection(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/patentId/i);
  });
});

// ---------------------------------------------------------------------------
// classifyIteration
// ---------------------------------------------------------------------------

describe('classifyIteration', () => {
  it('16. hallucinationPassed=false → LLM_HALLUCINATED_SELECTION', () => {
    expect(classifyIteration({ hallucinationPassed: false }))
      .toBe('LLM_HALLUCINATED_SELECTION');
  });

  it('17. hallucinationPassed=true, citation=null → WRONG_CITATION', () => {
    // Valid selection but plugin found no citation → WRONG_CITATION in
    // the llm-report classification space (see Task 1 behavior spec).
    expect(classifyIteration({
      hallucinationPassed: true,
      citation: null,
      verifierStatus: null,
    })).toBe('WRONG_CITATION');
  });

  it('18. hallucinationPassed=true, citation+verifierStatus=pass → PASS', () => {
    expect(classifyIteration({
      hallucinationPassed: true,
      citation: '1:34-46',
      verifierStatus: 'pass',
    })).toBe('PASS');
  });

  it('19. hallucinationPassed=true, citation+verifierStatus=disagree → VERIFIER_DISAGREE', () => {
    expect(classifyIteration({
      hallucinationPassed: true,
      citation: '1:34-46',
      verifierStatus: 'disagree',
    })).toBe('VERIFIER_DISAGREE');
  });
});

// ---------------------------------------------------------------------------
// buildPickerPrompt
// ---------------------------------------------------------------------------

describe('buildPickerPrompt', () => {
  it('20. returns {systemPrompt, userPrompt} mentioning extension + strict JSON', () => {
    const ctx = {
      patent: { id: 'US11427642', category: 'modern-short' },
      specExcerpt: 'The invention relates to antibodies. '.repeat(20),
      bodyStartPage: 3,
    };
    const r = buildPickerPrompt(ctx);
    expect(r.systemPrompt).toBeTypeOf('string');
    expect(r.userPrompt).toBeTypeOf('string');
    expect(r.systemPrompt.toLowerCase()).toMatch(/patent citation extension/);
    expect(r.systemPrompt.toLowerCase()).toMatch(/strict json/);
    expect(r.userPrompt).toContain('US11427642');
    expect(r.userPrompt).toContain('page 3');
  });

  it('21. total prompt length < 50KB (cache-creation cost guardrail)', () => {
    const big = 'The invention relates to antibodies. '.repeat(2000); // ~74KB
    const r = buildPickerPrompt({
      patent: { id: 'US1', category: 'modern' },
      specExcerpt: big.slice(0, 40_000),
      bodyStartPage: 1,
    });
    expect(r.systemPrompt.length + r.userPrompt.length).toBeLessThan(50 * 1024);
  });
});

// ---------------------------------------------------------------------------
// invokeClaudeP (mocked spawn)
// ---------------------------------------------------------------------------

describe('invokeClaudeP', () => {
  it('22. env passed to spawn has ANTHROPIC_API_KEY === "" (Pitfall 1)', async () => {
    // Pre-set the env var so we can verify it's overridden to ''.
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-leak-this-must-not-pass-through';
    const promise = invokeClaudeP({
      systemPrompt: 'sysP',
      userPrompt: 'userP',
      timeoutMs: 5_000,
    });
    // Simulate immediate close so the promise resolves.
    setTimeout(() => mockChild.emit('close', 0), 5);
    await promise;
    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].options.env).toBeDefined();
    expect(spawnCalls[0].options.env.ANTHROPIC_API_KEY).toBe('');
    // Restore
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('23. args are EXACTLY ["-p","--output-format","json","--max-turns","1","--system-prompt",sysP,userP] — no --bare, no --json-schema', async () => {
    const promise = invokeClaudeP({
      systemPrompt: 'mysys',
      userPrompt: 'myuser',
      timeoutMs: 5_000,
    });
    setTimeout(() => mockChild.emit('close', 0), 5);
    await promise;
    expect(spawnCalls.length).toBe(1);
    const { args } = spawnCalls[0];
    expect(args).toEqual([
      '-p',
      '--output-format', 'json',
      '--max-turns', '1',
      '--system-prompt', 'mysys',
      'myuser',
    ]);
    expect(args).not.toContain('--bare');
    expect(args).not.toContain('--json-schema');
  });

  it('24. timeout fires child.kill(SIGTERM) and resolves {timedOut:true, stdout:"", code:null}', async () => {
    const promise = invokeClaudeP({
      systemPrompt: 'sysP',
      userPrompt: 'userP',
      timeoutMs: 50, // tiny — should fire before our (never-fired) close
    });
    // Note: do NOT emit 'close' — let the timer fire.
    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(result.stdout).toBe('');
    expect(result.code).toBe(null);
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('LLM_TIMEOUT_MS === 60_000', () => {
    expect(LLM_TIMEOUT_MS).toBe(60_000);
  });
  it('SELECTION_MIN_CHARS === 50', () => {
    expect(SELECTION_MIN_CHARS).toBe(50);
  });
  it('SELECTION_MAX_CHARS === 300', () => {
    expect(SELECTION_MAX_CHARS).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// invokeClaudePWithLedger
// Phase 34 Plan 01 — TDD block (Task 1 = RED, Task 2 = GREEN)
// ---------------------------------------------------------------------------

// Canonical happy-path stdout envelope returned by the invokeClaudeP spy
// (the shape parseClaudeResponse expects from `claude -p --output-format json`).
const HAPPY_STDOUT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '{"foo":"bar"}',
  total_cost_usd: 0.01,
  duration_ms: 1234,
  // modelUsage drives modelId extraction in parseClaudeResponse.
  modelUsage: { 'claude-3-5-haiku-20241022': { costUSD: 0.01 } },
  // usage drives tokens_in / tokens_out in the ledger entry.
  usage: { input_tokens: 100, output_tokens: 50 },
});

// is_error envelope for Pitfall 8 test (cost non-zero on error).
const IS_ERROR_STDOUT = JSON.stringify({
  type: 'result',
  subtype: 'error_max_turns',
  is_error: true,
  result: '',
  total_cost_usd: 0.07,
  duration_ms: 1000,
  modelUsage: { 'claude-3-5-haiku-20241022': { costUSD: 0.07 } },
  usage: { input_tokens: 50, output_tokens: 0 },
});

// Empty ledger fixture (no spend recorded — all caps are 'ok').
const EMPTY_LEDGER = { version: 1, months: {} };

describe('invokeClaudePWithLedger', () => {
  // spawnStdout controls the stdout that the mocked child process emits.
  // Tests that reach invokeClaudeP (happy path, is_error path) set this
  // before calling the wrapper so the mocked child resolves with the right data.
  let spawnStdout = HAPPY_STDOUT;
  let invokeSpy;
  let readLedgerSpy;
  let appendSpy;

  beforeEach(() => {
    spawnStdout = HAPPY_STDOUT;
    spawnCalls.length = 0;

    // Override the outer vi.mock so the child auto-emits stdout + close,
    // making invokeClaudeP resolve immediately in tests 5 and 6.
    // `childProcess.spawn` is already a vi.fn() from the outer vi.mock() call.
    childProcess.spawn.mockImplementation((cmd, args, options) => {
      spawnCalls.push({ cmd, args, options });
      const child = makeMockChild();
      // Emit stdout and close asynchronously so the promise-based invokeClaudeP
      // resolves cleanly without hanging.
      setTimeout(() => {
        child.stdout.emit('data', spawnStdout);
        child.emit('close', 0);
      }, 0);
      mockChild = child;
      return child;
    });

    // Spy on invokeClaudeP via namespace — used to assert callCount === 0
    // on the gated branches (CI gate, cap block). The spy does NOT intercept
    // internal ESM calls (live-binding limitation), but that is fine:
    //   - Tests 1-4 (gated): internal call never reaches invokeClaudeP, so
    //     spawnCalls.length === 0 is the authoritative "never called" check.
    //   - Tests 5-6 (success/error): real invokeClaudeP is called via the
    //     auto-resolving spawn mock above.
    invokeSpy = vi.spyOn(drv, 'invokeClaudeP');

    // Spy on readLedger so tests don't touch the real ledger file.
    readLedgerSpy = vi.spyOn(ledgerNs, 'readLedger').mockReturnValue(EMPTY_LEDGER);
    // Spy on appendLedgerEntry so tests don't write real files.
    appendSpy = vi.spyOn(ledgerNs, 'appendLedgerEntry').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('Test 1: CI=true → {ok:false, ciGate:true}; invokeClaudeP and appendLedgerEntry never called', async () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(false);
    expect(result.ciGate).toBe(true);
    // CI gate fires before invokeClaudeP: no spawn calls, no ledger writes.
    expect(spawnCalls.length).toBe(0);
    expect(appendSpy).toHaveBeenCalledTimes(0);
  });

  it('Test 2: GITHUB_ACTIONS=true with CI unset → {ok:false, ciGate:true} (defense-in-depth)', async () => {
    vi.stubEnv('CI', undefined);
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(false);
    expect(result.ciGate).toBe(true);
    expect(spawnCalls.length).toBe(0);
    expect(appendSpy).toHaveBeenCalledTimes(0);
  });

  it('Test 3: Monthly cap block → {ok:false, capBlocked:true, monthly.status=block}; invokeClaudeP never called', async () => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    readLedgerSpy.mockReturnValue({
      version: 1,
      months: {
        [currentMonthKey]: {
          invocations: 10,
          total_usd: 120,
          last_invocation_iso: new Date().toISOString(),
          iterations: [],
        },
      },
    });
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(false);
    expect(result.capBlocked).toBe(true);
    expect(result.monthly).toBeDefined();
    expect(result.monthly.status).toBe('block');
    // Cap block fires before invokeClaudeP: no spawn calls.
    expect(spawnCalls.length).toBe(0);
  });

  it('Test 4: Phase cap block → {ok:false, capBlocked:true, phaseCap.status=block}; invokeClaudeP never called', async () => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    // Seed ledger with iterations whose phase='34' sum to >= PHASE_HARD_CAP_USD ($10).
    readLedgerSpy.mockReturnValue({
      version: 1,
      months: {
        [currentMonthKey]: {
          invocations: 5,
          total_usd: 11,
          last_invocation_iso: new Date().toISOString(),
          iterations: [
            { iso: new Date().toISOString(), model: 'claude-3-5-haiku', cost_usd: 11, phase: '34' },
          ],
        },
      },
    });
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(false);
    expect(result.capBlocked).toBe(true);
    expect(result.phaseCap).toBeDefined();
    expect(result.phaseCap.status).toBe('block');
    // Cap block fires before invokeClaudeP: no spawn calls.
    expect(spawnCalls.length).toBe(0);
    // Verify stderr absence from spawnCalls too — belt-and-suspenders for the guard.
    expect(appendSpy).toHaveBeenCalledTimes(0);
  });

  it('Test 5: Happy path → {ok:true, llmText, modelId, costUsd:0.01} and appendLedgerEntry called once with correct args', async () => {
    // spawnStdout is already HAPPY_STDOUT from beforeEach.
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(true);
    expect(result.llmText).toBe('{"foo":"bar"}');
    expect(result.modelId).toBe('claude-3-5-haiku-20241022');
    expect(result.costUsd).toBe(0.01);
    expect(result.rawJson).toBeDefined();

    expect(appendSpy).toHaveBeenCalledTimes(1);
    const [calledPath, calledEntry] = appendSpy.mock.calls[0];
    expect(calledPath).toBe(LEDGER_PATH);
    expect(calledEntry).toMatchObject({
      phase: '34',
      source: 'triage',
      cost_usd: 0.01,
    });
    expect(typeof calledEntry.iso).toBe('string');
    expect(calledEntry.model).toBe('claude-3-5-haiku-20241022');
  });

  it('Test 6: is_error:true with non-zero cost (Pitfall 8) → appendLedgerEntry still fires with cost_usd:0.07', async () => {
    // Override the spawn stdout to return the is_error envelope.
    spawnStdout = IS_ERROR_STDOUT;
    const result = await drv.invokeClaudePWithLedger({
      systemPrompt: 'sys',
      userPrompt: 'usr',
      phase: '34',
      source: 'triage',
    });
    expect(result.ok).toBe(false);
    expect(result.errorReason).toMatch(/api_error/);
    expect(result.costUsd).toBe(0.07);

    // Ledger append MUST fire even on is_error:true (Pitfall 8 invariant).
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const [, entry] = appendSpy.mock.calls[0];
    expect(entry.cost_usd).toBe(0.07);
    expect(entry.phase).toBe('34');
    expect(entry.source).toBe('triage');
  });
});

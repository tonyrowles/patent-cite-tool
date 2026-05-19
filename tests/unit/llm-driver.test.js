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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

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

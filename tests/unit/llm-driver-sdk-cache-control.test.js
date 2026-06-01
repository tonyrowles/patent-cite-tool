// tests/unit/llm-driver-sdk-cache-control.test.js
//
// Phase 42 Plan 02 (Pitfall 6 fix — array-form `system` for cache_control).
//
// invokeAnthropicSdkWithLedger currently passes `system: systemPrompt` (string
// form). Per the Anthropic SDK contract, `cache_control` only takes effect
// when `system` is supplied as the ARRAY form (each block is
// `{type:'text', text, cache_control}`). The string form silently drops
// cache_control, which kills the ~30% prompt-cache savings.
//
// Plan 42-02 extends the driver to accept an OPTIONAL `systemBlocks` argument
// (array form). When supplied, it takes precedence over the string-form
// `systemPrompt`. Back-compat: existing callers passing only `systemPrompt`
// see no behavioral change.
//
// RED gate: the current driver always passes the string. The array-form
// assertion fails until Task 2 GREEN extends the driver.
//
// Coverage (3 cases):
//   1. systemPrompt only (back-compat) → captured request body's `system` is the literal string
//   2. systemBlocks → captured request body's `system` is the array literal
//   3. neither → returns {ok:false, errorReason:'contract-error', errorMessage:...} (no SDK call)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -----------------------------------------------------------------------
// Mock @anthropic-ai/sdk BEFORE importing the driver.
// -----------------------------------------------------------------------

const sdkCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: sdkCreateMock } })),
}));

// Import AFTER vi.mock so the driver receives the mocked SDK.
import * as drv from '../e2e/lib/llm-driver.js';
import * as ledgerNs from '../e2e/lib/llm-ledger.js';

function makeSdkSuccessResponse({
  model = 'claude-sonnet-4-6',
  text = 'ok',
  inputTokens = 100,
  outputTokens = 50,
} = {}) {
  return {
    id: 'msg_phase42_cachetest',
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

describe('Phase 42 Pitfall 6: invokeAnthropicSdkWithLedger systemBlocks array-form', () => {
  beforeEach(() => {
    sdkCreateMock.mockReset();
    vi.stubEnv('CI', 'true'); // bypass the inverse CI gate
    vi.spyOn(ledgerNs, 'readLedger').mockReturnValue({ version: 1, months: {} });
    vi.spyOn(ledgerNs, 'appendLedgerEntry').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('1: systemPrompt only (back-compat) — request body system field is the string', async () => {
    sdkCreateMock.mockResolvedValueOnce(makeSdkSuccessResponse());
    const result = await drv.invokeAnthropicSdkWithLedger({
      systemPrompt: 'SYS',
      userPrompt: 'USR',
    });
    expect(result.ok).toBe(true);
    expect(sdkCreateMock).toHaveBeenCalledTimes(1);
    const body = sdkCreateMock.mock.calls[0][0];
    expect(body.system).toBe('SYS'); // literal string — Phase 39 behavior preserved
  });

  it('2: systemBlocks array-form — request body system field is the array literal (cache_control takes effect)', async () => {
    sdkCreateMock.mockResolvedValueOnce(makeSdkSuccessResponse());
    const blocks = [
      {
        type: 'text',
        text: 'SYS',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ];
    const result = await drv.invokeAnthropicSdkWithLedger({
      systemBlocks: blocks,
      userPrompt: 'USR',
    });
    expect(result.ok).toBe(true);
    expect(sdkCreateMock).toHaveBeenCalledTimes(1);
    const body = sdkCreateMock.mock.calls[0][0];
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system).toEqual(blocks);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('3: neither systemPrompt nor systemBlocks → contract error; SDK not called', async () => {
    const result = await drv.invokeAnthropicSdkWithLedger({
      userPrompt: 'USR',
    });
    expect(result.ok).toBe(false);
    expect(result.errorReason).toBe('contract-error');
    expect(typeof result.errorMessage).toBe('string');
    expect(result.errorMessage).toMatch(/systemBlocks|systemPrompt/);
    expect(sdkCreateMock).toHaveBeenCalledTimes(0);
  });
});

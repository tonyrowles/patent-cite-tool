// worker/tests/test-mode.test.js
//
// Phase 30 Plan 01 — INJ-01 integration test.
//
// Asserts the X-PCT-Test-Mode header suppresses the KV write at the
// single env.PATENT_CACHE.put() call site (worker/src/index.js line ~229)
// while leaving the 201 "Cached" response shape identical.
//
// Test order matters: the header-set test runs FIRST so the no-header
// test starts with an empty KV (Miniflare KV is shared per-file —
// 30-RESEARCH.md Pitfall 4). Vitest preserves source order; do NOT use
// it.concurrent or --shuffle for this file.

import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

const TEST_TOKEN = 'test-token'; // must match miniflare.bindings.PROXY_TOKEN
const URL_BASE = 'https://worker.example.com/cache?patent=11427642&v=v3';
const BODY = JSON.stringify({ entries: [], meta: {} });

function makeRequest({ withTestMode }) {
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (withTestMode) headers['X-PCT-Test-Mode'] = 'true';
  return new Request(URL_BASE, { method: 'POST', headers, body: BODY });
}

describe('POST /cache — X-PCT-Test-Mode header guard (INJ-01)', () => {
  it('with X-PCT-Test-Mode: true → returns 201 "Cached" AND does NOT write to KV', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(makeRequest({ withTestMode: true }), env, ctx);
    await waitOnExecutionContext(ctx);

    // Response semantics unchanged
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('Cached');

    // KV NOT written
    const listed = await env.PATENT_CACHE.list();
    expect(listed.keys).toEqual([]);
  });

  it('WITHOUT X-PCT-Test-Mode header → returns 201 "Cached" AND writes to KV', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(makeRequest({ withTestMode: false }), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    expect(await response.text()).toBe('Cached');

    // KV DID get written — the existence check + put() path was taken
    // Filter to v3: prefix to isolate from daily write guard keys (wq:YYYYMMDD)
    const listed = await env.PATENT_CACHE.list({ prefix: 'v3:' });
    expect(listed.keys.length).toBe(1);
    expect(listed.keys[0].name).toBe('v3:11427642');
  });
});

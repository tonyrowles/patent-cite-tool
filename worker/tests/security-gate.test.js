// worker/tests/security-gate.test.js
//
// Phase 6 Plan 02 — Security Gate + Worker Auth Split integration tests.
//
// Tests cover:
//   WRKR-01: GET /webapp/pdf — Origin-authenticated PDF proxy
//   WRKR-02: GET /cache — dual-auth (Bearer OR Origin)
//   Shared cache: operator-only signed writes, validation, repair, deletion, and expiry.
//   WRKR-04: isPublishedApplication guard — HTTP 400 before any fetch
//   SEC-03: webapp Origin auth; no Bearer required for webapp routes
//   SEC-04: webapp rate limit (30/60s, wrl: prefix) → 429 on exceed
//   SEC-05: daily write guard (900/day, wq:) → 503 on exceed; testMode suppresses
//
// Pattern mirrors worker/tests/test-mode.test.js
// KV isolation: distinct patent numbers and IPs per describe block.

import { env } from 'cloudflare:workers';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import { buildCachePayload, MAX_CACHE_BYTES } from '../../src/shared/cache-schema.js';

const TEST_TOKEN = 'test-token'; // must match miniflare.bindings.PROXY_TOKEN
const ALLOWED_ORIGIN = 'https://cite.tonyrowles.com';
const LOCAL_ORIGIN = 'http://localhost:8788';
const UNKNOWN_ORIGIN = 'https://evil.example.com';

// ─── Request factories ─────────────────────────────────────────────────────

/** Origin-auth request factory (for webapp routes) */
function makeOriginRequest(path, { ip = '10.1.0.1', testMode = false, method = 'GET', body = null, origin = ALLOWED_ORIGIN } = {}) {
  const headers = {
    'Origin': origin,
    'CF-Connecting-IP': ip,
  };
  if (testMode) headers['X-PCT-Test-Mode'] = 'true';
  if (body) headers['Content-Type'] = 'application/json';
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://worker.example.com${path}`, init);
}

/** Bearer-auth request factory (for extension routes — unchanged behavior) */
function makeBearerRequest(path, { ip = '10.2.0.1', method = 'GET', body = null, testMode = false } = {}) {
  const headers = {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'CF-Connecting-IP': ip,
    'Content-Type': 'application/json',
  };
  if (testMode) headers['X-PCT-Test-Mode'] = 'true';
  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);
  return new Request(`https://worker.example.com${path}`, init);
}

/** Unauthenticated request factory (no Bearer, no Origin) */
function makeUnauthRequest(path, { ip = '10.3.0.1', method = 'GET' } = {}) {
  return new Request(`https://worker.example.com${path}`, {
    method,
    headers: { 'CF-Connecting-IP': ip },
  });
}

const VALID_MAP = buildCachePayload([{ text: 'verified patent text', column: 1, lineNumber: 1,
  page: 2, section: 'description', hasWrapHyphen: false }]);
function makeWriterRequest(patent, { method = 'POST', body = VALID_MAP, testMode = false, token = 'test-cache-writer' } = {}) {
  return new Request(`https://worker.example.com/cache?patent=${patent}&v=v6`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      ...(testMode ? { 'X-PCT-Test-Mode': 'true' } : {}) },
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
  });
}

// ─── Unique IPs and patent numbers per describe block ─────────────────────

// isPublishedApplication guard (WRKR-04)
const IP_PUBAPP = '10.10.0.1';
const PATENT_PUBAPP_A1 = '10617174A1';       // true — kind code A1
const PATENT_PUBAPP_20D = '20210123456A1';   // true — 20XXXXXXXXX + A1
const PATENT_PUBAPP_20_BARE = '20210123456'; // true — 11-digit 20XXXXXXXXX
const PATENT_PUBAPP_US20 = 'US20210123456A1'; // true — US prefixed
const PATENT_NORMAL = '12505414';            // false — regular patent

// matchOrigin / resolveAuth / OPTIONS (SEC-03)
const IP_AUTH = '10.11.0.1';
const PATENT_ORIGIN_GET = '12505001';         // GET /cache with Origin

// GET /cache dual-auth (WRKR-02)
const IP_CACHE_BEARER = '10.12.0.1';
const IP_CACHE_ORIGIN = '10.12.0.2';
const IP_CACHE_UNAUTH = '10.12.0.3';
const PATENT_CACHE_BEARER = '12505100';
const PATENT_CACHE_ORIGIN = '12505101';
const PATENT_CACHE_UNAUTH = '12505102';

// Cache mutation integrity
const IP_POST_ORIGIN = '10.13.0.1';
const IP_POST_BEARER = '10.13.0.2';
const PATENT_POST_ORIGIN = '12505200';
const PATENT_POST_BEARER = '12505201';

// Webapp rate limit (SEC-04)
const IP_RATELIMIT_WEBAPP = '10.9.0.1';
const PATENT_RATELIMIT = '12505300';

// Daily write guard (SEC-05)
const IP_WRITEGUARD = '10.14.0.1';
const PATENT_WRITEGUARD = '12505400';

// GET /webapp/pdf (WRKR-01)
const IP_WEBAPPPDF = '10.15.0.1';
const PATENT_WEBAPPPDF = '12505500';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('WRKR-04: isPublishedApplication guard — HTTP 400 before auth/rate-limit/fetch', () => {
  it('GET /cache with published-application kind-code A1 → 400', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_PUBAPP_A1}&v=v6`, { ip: IP_PUBAPP }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toMatch(/published application/i);
  });

  it('GET / (Bearer) with published-application 20XXXXXXXXX+A1 → 400', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeBearerRequest(`/?patent=${PATENT_PUBAPP_20D}`, { ip: IP_PUBAPP }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('GET /cache with 11-digit 20XXXXXXXXX bare number → 400', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_PUBAPP_20_BARE}&v=v6`, { ip: IP_PUBAPP }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('GET /cache with US-prefixed published-application → 400', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_PUBAPP_US20}&v=v6`, { ip: IP_PUBAPP }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });

  it('GET /cache with normal patent number → NOT 400 (auth check may still produce 403)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_NORMAL}&v=v6`, { ip: IP_PUBAPP }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    // 400 would mean the published-app guard incorrectly rejected a normal patent
    expect(response.status).not.toBe(400);
  });
});

describe('SEC-03: OPTIONS preflight — origin-reflecting for allowed origins', () => {
  it('OPTIONS from allowed Origin → 204 with reflected origin and Vary:Origin', async () => {
    const ctx = createExecutionContext();
    const request = new Request('https://worker.example.com/cache', {
      method: 'OPTIONS',
      headers: {
        'Origin': ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',
      },
    });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Vary')).toMatch(/Origin/i);
  });

  it('OPTIONS from localhost:8788 → 204 with reflected origin', async () => {
    const ctx = createExecutionContext();
    const request = new Request('https://worker.example.com/cache', {
      method: 'OPTIONS',
      headers: {
        'Origin': LOCAL_ORIGIN,
        'Access-Control-Request-Method': 'GET',
      },
    });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(LOCAL_ORIGIN);
  });

  it('OPTIONS from unknown origin → 204 with wildcard CORS (extension fallback)', async () => {
    const ctx = createExecutionContext();
    const request = new Request('https://worker.example.com/cache', {
      method: 'OPTIONS',
      headers: {
        'Origin': UNKNOWN_ORIGIN,
      },
    });
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('WRKR-02: GET /cache — dual auth (Bearer OR Origin)', () => {
  it('GET /cache with valid Bearer (extension) → 404 not-found (not auth error, wildcard CORS)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeBearerRequest(`/cache?patent=${PATENT_CACHE_BEARER}&v=v6`, { ip: IP_CACHE_BEARER }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    // 404 = auth passed, cache miss — correct behavior
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('GET /cache with valid Origin (webapp) → 404 with webappCorsHeaders (reflected origin + Vary)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_CACHE_ORIGIN}&v=v6`, { ip: IP_CACHE_ORIGIN, testMode: true }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Vary')).toMatch(/Origin/i);
  });

  it('GET /cache with no auth → 401 or 403', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeUnauthRequest(`/cache?patent=${PATENT_CACHE_UNAUTH}&v=v6`),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect([401, 403]).toContain(response.status);
  });
});

describe('Shared cache integrity', () => {
  it.each(['POST', 'PUT', 'DELETE'])('rejects Origin-only %s writes, even with an allowed Origin', async method => {
    const response = await worker.fetch(makeOriginRequest(`/cache?patent=${PATENT_POST_ORIGIN}&v=v6`, {
      method, body: VALID_MAP,
    }), env, createExecutionContext());
    expect(response.status).toBe(403);
    expect(await env.PATENT_CACHE.get(`v6:${PATENT_POST_ORIGIN}`)).toBeNull();
  });
  it('rejects the public extension token for writes', async () => {
    const response = await worker.fetch(makeBearerRequest(`/cache?patent=${PATENT_POST_BEARER}&v=v6`, {
      method: 'POST', body: VALID_MAP,
    }), env, createExecutionContext());
    expect(response.status).toBe(403);
  });
  it('fails closed when the writer secret is absent or reused as the extension token', async () => {
    for (const CACHE_WRITE_TOKEN of [undefined, 'test-token']) {
      const response = await worker.fetch(makeWriterRequest('12505202', { token: 'test-token' }),
        { ...env, CACHE_WRITE_TOKEN }, createExecutionContext());
      expect(response.status).toBe(403);
    }
  });
  it.each([null, [], {}, { ...VALID_MAP, entries: [] },
    { ...VALID_MAP, entries: [{ ...VALID_MAP.entries[0], lineNumber: 999 }] },
    { ...VALID_MAP, meta: { ...VALID_MAP.meta, totalLines: 100 } },
    { ...VALID_MAP, version: 'v5' }])('rejects malformed payload %j without storing it', async body => {
    const response = await worker.fetch(makeWriterRequest('12505203', { body }), env, createExecutionContext());
    expect(response.status).toBe(400);
    expect(await env.PATENT_CACHE.get('v6:12505203')).toBeNull();
  });
  it('bounds the actual streamed body even without Content-Length', async () => {
    const request = new Request('https://worker.example.com/cache?patent=12505204&v=v6', {
      method: 'POST', headers: { Authorization: 'Bearer test-cache-writer' },
      body: new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array(MAX_CACHE_BYTES + 1)); controller.close();
      } }),
    });
    const response = await worker.fetch(request, env, createExecutionContext());
    expect(response.status).toBe(413);
    expect(await env.PATENT_CACHE.get('v6:12505204')).toBeNull();
  });
  it('creates a trusted map, refuses accidental overwrite, replaces and deletes explicitly', async () => {
    const patent = '12505205';
    expect((await worker.fetch(makeWriterRequest(patent), env, createExecutionContext())).status).toBe(201);
    let cached = await env.PATENT_CACHE.get(`v6:${patent}`, { type: 'json' });
    expect(cached.source).toBe('operator');
    const listed = await env.PATENT_CACHE.list({ prefix: `v6:${patent}` });
    expect(listed.keys[0].expiration).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect((await worker.fetch(makeWriterRequest(patent), env, createExecutionContext())).status).toBe(409);
    const repaired = { ...VALID_MAP, entries: [{ ...VALID_MAP.entries[0], text: 'repaired text' }] };
    expect((await worker.fetch(makeWriterRequest(patent, { method: 'PUT', body: repaired }), env, createExecutionContext())).status).toBe(200);
    const read = await worker.fetch(makeOriginRequest(`/cache?patent=${patent}&v=v6`), env, createExecutionContext());
    expect(read.status).toBe(200);
    expect((await read.json()).entries[0].text).toBe('repaired text');
    expect((await worker.fetch(makeWriterRequest(patent, { method: 'DELETE' }), env, createExecutionContext())).status).toBe(200);
    expect(await env.PATENT_CACHE.get(`v6:${patent}`)).toBeNull();
  });
  it('rejects unsigned, modified, and transplanted cache records', async () => {
    const patent = '12505207';
    expect((await worker.fetch(makeWriterRequest(patent), env, createExecutionContext())).status).toBe(201);
    const record = await env.PATENT_CACHE.get(`v6:${patent}`, { type: 'json' });
    expect(record.signature).toMatch(/^[a-f0-9]{64}$/);
    await env.PATENT_CACHE.put('v6:12505208', JSON.stringify(record));
    expect((await worker.fetch(makeOriginRequest('/cache?patent=12505208&v=v6'), env, createExecutionContext())).status).toBe(404);
    const forged = { ...record, entries: [{ ...record.entries[0], lineNumber: 99 }] };
    await env.PATENT_CACHE.put(`v6:${patent}`, JSON.stringify(forged));
    expect((await worker.fetch(makeOriginRequest(`/cache?patent=${patent}&v=v6`), env, createExecutionContext())).status).toBe(404);
    const { signature, ...unsigned } = record;
    await env.PATENT_CACHE.put(`v6:${patent}`, JSON.stringify(unsigned));
    expect((await worker.fetch(makeOriginRequest(`/cache?patent=${patent}&v=v6`), env, createExecutionContext())).status).toBe(404);
  });

  it('does not serve malformed or pre-v6 records', async () => {
    await env.PATENT_CACHE.put('v6:12505206', JSON.stringify({ entries: [{ text: 'fake' }] }));
    const corrupt = await worker.fetch(makeOriginRequest('/cache?patent=12505206&v=v6'), env, createExecutionContext());
    expect(corrupt.status).toBe(404);
    const legacy = await worker.fetch(makeOriginRequest('/cache?patent=12505206&v=v5'), env, createExecutionContext());
    expect(legacy.status).toBe(400);
  });
});

describe('SEC-04: Webapp rate limit — 30/60s on GET /webapp/pdf and GET /cache (Origin path)', () => {
  it('31st GET /cache request from same IP via Origin → 429 with Retry-After:60 and webappCorsHeaders', async () => {
    // Send 30 requests WITHOUT testMode so wrl: counter increments each time.
    // Use a unique patent number per iteration to avoid KV cache-hit (which would also
    // serve 200 OK, not 404) — though cache is empty so 404 is expected anyway.
    for (let i = 0; i < 30; i++) {
      const ctx = createExecutionContext();
      const response = await worker.fetch(
        makeOriginRequest(`/cache?patent=${PATENT_RATELIMIT}&v=v6`, {
          ip: IP_RATELIMIT_WEBAPP,
          // Do NOT use testMode here — we need the wrl: counter to actually increment
        }),
        env, ctx
      );
      await waitOnExecutionContext(ctx);
      // Should be 404 (cache miss, rate limit not hit yet)
      expect(response.status).not.toBe(429);
    }

    // 31st request — should be rate limited regardless of testMode
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/cache?patent=${PATENT_RATELIMIT}&v=v6`, {
        ip: IP_RATELIMIT_WEBAPP,
      }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Vary')).toMatch(/Origin/i);
  });
});

describe('Daily operator write guard', () => {
  it('test mode returns 201 without incrementing the write counter', async () => {
    const key = `wq:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const before = await env.PATENT_CACHE.get(key);
    const response = await worker.fetch(makeWriterRequest(PATENT_WRITEGUARD, { testMode: true }), env, createExecutionContext());
    expect(response.status).toBe(201);
    expect(await env.PATENT_CACHE.get(key)).toBe(before);
  });
  it('rejects writes at the daily threshold', async () => {
    const key = `wq:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    await env.PATENT_CACHE.put(key, '900', { expirationTtl: 172800 });
    const response = await worker.fetch(makeWriterRequest(PATENT_WRITEGUARD), env, createExecutionContext());
    expect(response.status).toBe(503);
    expect(await env.PATENT_CACHE.get(`v6:${PATENT_WRITEGUARD}`)).toBeNull();
    await env.PATENT_CACHE.delete(key);
  });
});

describe('WRKR-01: GET /webapp/pdf — Origin-authenticated PDF proxy', () => {
  it('GET /webapp/pdf with no auth → 403', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeUnauthRequest(`/webapp/pdf?patent=${PATENT_WEBAPPPDF}`),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
  });

  it('GET /webapp/pdf with Bearer (no Origin) → 403 (origin-only route)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeBearerRequest(`/webapp/pdf?patent=${PATENT_WEBAPPPDF}`, { ip: IP_WEBAPPPDF }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(403);
  });

  it('GET /webapp/pdf with published-application number → 400 before auth', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest(`/webapp/pdf?patent=${PATENT_PUBAPP_A1}`, { ip: IP_WEBAPPPDF }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toMatch(/published application/i);
  });

  it('GET /webapp/pdf with valid Origin and invalid patent → 400 (after auth)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeOriginRequest('/webapp/pdf?patent=123', { ip: IP_WEBAPPPDF }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    // 123 is not a published application, but fails digit count validation
    expect(response.status).toBe(400);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });
});

describe('Extension Bearer path — preserved behavior (no regression)', () => {
  it('GET / with Bearer → passes auth (will fail on USPTO fetch, not auth)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeBearerRequest(`/?patent=${PATENT_NORMAL}`, { ip: '10.20.0.1' }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    // Should not be 401/403 (auth passed); USPTO fetch fails → 502 expected
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    // CORS for extension should be wildcard
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  }, 15000);

  it('POST /report with Bearer → 400 (validation error, not auth error)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeBearerRequest('/report', { ip: '10.20.0.2', method: 'POST', body: {} }),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    // 400 means auth passed (the report route got a bad payload)
    // 401 would mean the Bearer auth broke
    expect(response.status).not.toBe(401);
    expect(response.status).toBe(400);
  });

  it('GET / WITHOUT Bearer → 401 (extension bearer required)', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      makeUnauthRequest('/?patent=12505414'),
      env, ctx
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});

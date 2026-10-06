import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  // The tests call worker.fetch directly in this isolate, so global fetch is
  // the entire external-network boundary. Never let a test contact a real service.
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.href === 'https://discord.example.com/test-webhook') return new Response(null, { status: 204 });
    if (url.origin === 'https://api.uspto.gov') return new Response('Simulated USPTO outage', { status: 503 });
    throw new Error(`Unexpected outbound request in Worker test: ${url.origin}${url.pathname}`);
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

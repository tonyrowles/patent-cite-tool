// tests/e2e/lib/worker-test-mode-route.js
//
// Phase 30 Plan 04 — Worker route-interception helper (gap-closure rewrite).
//
// Installs a context.route handler on the Cloudflare Worker URL
// (https://pct.tonyrowles.com/**) at the BrowserContext level so it reaches
// the extension's offscreen document context (page-level route handlers could
// not reach offscreen — Risk A1 confirmed in Plan 30-02).
//
// Three-part interception:
//   GET /cache   — rewrite `v=` query param to a per-test nonce → forces cache
//                  miss (404), so the extension falls through to /?patent= USPTO
//   POST /cache  — inject X-PCT-Test-Mode: true header → Plan 30-01 Worker guard
//                  suppresses KV write; production cache stays clean
//   GET /?patent= — continue unchanged (live USPTO eGrant fetch)
//
// The helper returns { getCallCount(), nonce } for canary assertions.
//
// Source URL constant: src/offscreen/offscreen.js line 24
//   const WORKER_URL = 'https://pct.tonyrowles.com';

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */

const WORKER_URL_PATTERN = 'https://pct.tonyrowles.com/**';

/**
 * Install the Worker test-mode route on the given browser context.
 *
 * Uses context.route() — not page.route — so the handler reaches ALL pages
 * and extension offscreen documents within the context.
 *
 * @param {BrowserContext} context
 * @returns {{ getCallCount: () => number, nonce: string }}
 */
export function installWorkerTestModeRoute(context) {
  const nonce = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let callCount = 0;

  context.route(WORKER_URL_PATTERN, async (route) => {
    callCount += 1;
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();

    if (url.pathname === '/cache' && method === 'GET') {
      // Force cache miss by rewriting the version key to a unique nonce.
      // The Worker has no KV entry for this key → returns 404 → extension
      // falls through to its /?patent= USPTO fetch fallback.
      url.searchParams.set('v', nonce);
      return route.continue({ url: url.toString() });
    }

    if (url.pathname === '/cache' && method === 'POST') {
      // KV write suppression: Plan 30-01's Worker guard skips the KV put()
      // when X-PCT-Test-Mode: true is present. Production cache stays clean.
      const headers = { ...req.headers(), 'x-pct-test-mode': 'true' };
      return route.continue({ headers });
    }

    // /?patent= USPTO eGrant fetch and any OPTIONS preflight: proceed unchanged.
    // Optionally, also inject x-pct-test-mode here for defence-in-depth;
    // the Worker ignores it for this route, so it is safe to add.
    return route.continue();
  });

  return {
    getCallCount: () => callCount,
    nonce,
  };
}

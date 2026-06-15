/**
 * Patent Cite Worker
 *
 * API gateway between the Chrome extension and the USPTO Open Data Portal.
 * Holds the USPTO API key server-side, validates incoming requests with a
 * bearer token, orchestrates the 3-step ODP lookup (search -> documents ->
 * download), and returns the PDF binary to the caller with proper CORS headers.
 *
 * Also provides a KV-backed cache for storing and retrieving position maps:
 *   GET  /cache?patent={number}&v={version} — read cached position map
 *   POST /cache?patent={number}&v={version} — write position map (if not exists)
 *
 * Bug report route:
 *   POST /report — submit a bug report; authenticated by Bearer PROXY_TOKEN
 *
 * Request format for USPTO proxy:
 *   GET /?patent={number}
 *   Authorization: Bearer {PROXY_TOKEN}
 *
 * Supported patent number formats:
 *   - Bare digits: 12505414
 *   - US-prefixed: US12505414
 *   - Full ID with kind code: US12505414B2
 */

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications';

/** Returns CORS headers applied to every response. */
function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*' };
}

/**
 * Cleans a raw patent number string from the extension into bare digits.
 * Strips optional US prefix and optional kind code suffix (e.g. B1, B2, A1).
 *
 * @param {string} raw - e.g. "US12505414B2" or "12505414" or "12505414B2"
 * @returns {string} - bare digits, e.g. "12505414"
 */
function cleanPatentNumber(raw) {
  return raw
    .replace(/^US/i, '')         // strip optional US prefix
    .replace(/[A-Z]\d*$/i, '');  // strip optional kind code suffix (B1, B2, A1, etc.)
}

/**
 * Orchestrates the 3-step USPTO ODP lookup for a given patent number.
 * Returns a Response whose body is the raw PDF stream.
 *
 * @param {string} patentNumber - bare digits, e.g. "12505414"
 * @param {string} apiKey - USPTO ODP API key
 * @returns {Promise<Response>} - streaming PDF response from ODP
 */
async function fetchEgrantPdf(patentNumber, apiKey) {
  const odp_headers = { 'X-API-Key': apiKey };

  // Step 1 — Search: patent number -> application number
  const searchUrl = `${ODP_BASE}/search?q=applicationMetaData.patentNumber:${patentNumber}&offset=0&limit=25&fields=applicationNumberText`;
  const searchResp = await fetch(searchUrl, { headers: odp_headers });

  if (!searchResp.ok) {
    throw new Error(`ODP search failed: ${searchResp.status} ${searchResp.statusText}`);
  }

  const searchData = await searchResp.json();
  const results = searchData.patentFileWrapperDataBag || searchData.results || [];

  if (results.length === 0) {
    throw new Error(`Patent ${patentNumber} not found in USPTO ODP`);
  }

  const appNumber = results[0].applicationNumberText;
  if (!appNumber) {
    throw new Error(`No applicationNumberText in ODP search result for ${patentNumber}`);
  }

  // Step 2 — List documents: application number -> EGRANT.PDF download URL
  const docsUrl = `${ODP_BASE}/${appNumber}/documents?documentCodes=EGRANT.PDF`;
  const docsResp = await fetch(docsUrl, { headers: odp_headers });

  if (!docsResp.ok) {
    throw new Error(`ODP documents failed: ${docsResp.status} ${docsResp.statusText}`);
  }

  const docsData = await docsResp.json();
  const documentBag = docsData.documentBag || docsData.results || [];

  // Match EGRANT.PDF by code or by description keywords
  const egrantDoc = documentBag.find(doc => {
    const code = (doc.documentCode || '').toUpperCase();
    const desc = (doc.documentDescription || '').toUpperCase();
    return (
      code === 'EGRANT.PDF' ||
      code === 'GRANT' ||
      desc.includes('ELECTRONIC GRANT') ||
      desc.includes('ISSUE GRANT')
    );
  });

  if (!egrantDoc) {
    throw new Error(`EGRANT.PDF not found in file wrapper for application ${appNumber}`);
  }

  // Prefer mimeTypeIdentifier=PDF; fall back to first option
  const downloadOption =
    egrantDoc.downloadOptionBag?.find(opt => opt.mimeTypeIdentifier === 'PDF') ||
    egrantDoc.downloadOptionBag?.[0];

  if (!downloadOption?.downloadUrl) {
    throw new Error(`Download URL not found for EGRANT.PDF (application ${appNumber})`);
  }

  // Step 3 — Download: return PDF stream directly
  const pdfResp = await fetch(downloadOption.downloadUrl, { headers: odp_headers });

  if (!pdfResp.ok) {
    throw new Error(`ODP PDF download failed: ${pdfResp.status} ${pdfResp.statusText}`);
  }

  return pdfResp;
}

// ─── /report route helpers ────────────────────────────────────────────────────

/**
 * Frozen list of valid report categories (D-09).
 * Extension source of truth for Phase 2 payload builder.
 */
const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_citation',
  'no_match',
  'tool_not_working',
  'other',
]);

/**
 * Category-to-Discord embed color map (D-05, D-07).
 * Red for tool failures, orange for inaccurate, yellow for no match, gray for other.
 */
const CATEGORY_COLORS = {
  tool_not_working:     0xEF4444,  // red
  inaccurate_citation:  0xF97316,  // orange
  no_match:             0xEAB308,  // yellow
  other:                0x6B7280,  // gray
};

/** Dedup window — 15 minutes in milliseconds (LIMIT-01). */
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Computes a 16-hex-char fingerprint for a report submission (PAY-04).
 *
 * selectionHash = first 4 bytes hex of SHA-256 of normalized selection
 * fingerprint   = first 8 bytes hex of SHA-256 of "{patentNumber}|{category}|{selectionHash}"
 *
 * @param {string} patentNumber
 * @param {string} category
 * @param {string|null|undefined} selectionText
 * @returns {Promise<string>} 16 hex chars
 */
async function computeFingerprint(patentNumber, category, selectionText) {
  // Normalize selection text: collapse whitespace, lowercase, take first 64 chars
  const normalizedSelection = (selectionText || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);

  // Compute selectionHash as first 4 bytes of SHA-256 of normalized selection
  const selectionHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalizedSelection)
  );
  const selectionHash = Array.from(new Uint8Array(selectionHashBuf))
    .slice(0, 4)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Final fingerprint: first 8 bytes of SHA-256 of "patent|category|selectionHash"
  const input = `${patentNumber}|${category}|${selectionHash}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''); // 16 hex chars = 8 bytes
}

/**
 * Validates required fields in the report request body (D-09).
 *
 * @param {object} body - parsed JSON body
 * @returns {string|null} reason string if invalid; null if valid
 */
function validateReportBody(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }
  if (!body.patentNumber || typeof body.patentNumber !== 'string') {
    return 'Missing required field: patentNumber';
  }
  // Format guard (parity with the /cache + USPTO proxy routes, which both enforce a
  // patent-number pattern). Alphanumerics only — patent/publication numbers with an
  // optional kind-code suffix (e.g. "12505414", "10617174B1", "20210123456A1"). Blocks
  // markdown/link injection into the Discord triage card via the [US${patentNumber}](url)
  // field, and rejects malformed records.
  if (!/^[A-Za-z0-9]{6,20}$/.test(body.patentNumber)) {
    return 'Invalid patentNumber format';
  }
  if (!REPORT_CATEGORIES.includes(body.category)) {
    return `Invalid category. Must be one of: ${REPORT_CATEGORIES.join(', ')}`;
  }
  if (!body.extensionVersion || typeof body.extensionVersion !== 'string') {
    return 'Missing required field: extensionVersion';
  }
  return null; // valid
}

/**
 * Builds the KV record from an allowlist of fields (PAY-01, D-08).
 * NEVER includes ip, clientIp, or userAgent (PAY-03 hard constraint).
 *
 * @param {object} body - validated request body
 * @param {string} fingerprint - computed fingerprint
 * @param {number} timestamp - Date.now() at time of submission
 * @returns {object} KV record (safe to JSON.stringify)
 */
function buildKvRecord(body, fingerprint, timestamp) {
  return {
    fingerprint,
    timestamp,
    category:          body.category,
    patentNumber:      body.patentNumber,
    patentUrl:         body.patentUrl || `https://patents.google.com/patent/US${body.patentNumber}`,
    selectionText:     body.selectionText || null,   // null when user toggled off
    returnedCitation:  body.returnedCitation || null,
    confidenceTier:    body.confidenceTier || null,
    extensionVersion:  body.extensionVersion,
    browser:           body.browser || null,
    os:                body.os || null,
    xpathNode:         body.xpathNode || null,
    scrollY:           body.scrollY ?? null,
    viewportWidth:     body.viewportWidth ?? null,
    viewportHeight:    body.viewportHeight ?? null,
    pdfParseStatus:    body.pdfParseStatus || null,
    triggerMode:       body.triggerMode || null,
    errorLog:          Array.isArray(body.errorLog) ? body.errorLog.slice(0, 20) : [],
    note:              body.note || null,
    duplicate_count:   0,
    // NO: ip, clientIp, userAgent (PAY-03 hard constraint)
  };
}

/**
 * Checks and enforces IP-keyed rate limit (LIMIT-02).
 * Max 5 requests per 60-second window per IP.
 * CF-Connecting-IP flows ONLY to rl:{ip} key (60s TTL) — never to report records (PAY-03).
 *
 * @param {{ BUG_REPORTS: KVNamespace }} env
 * @param {string} clientIp
 * @returns {Promise<{allowed: boolean}>}
 */
async function checkIpRateLimit(env, clientIp) {
  const key = `rl:${clientIp}`;
  const countStr = await env.BUG_REPORTS.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= 5) {
    return { allowed: false };
  }

  // Increment counter; reset TTL on each request within the window
  await env.BUG_REPORTS.put(key, String(count + 1), { expirationTtl: 60 });
  return { allowed: true };
}

/**
 * Checks for duplicate fingerprint within a 15-minute window (LIMIT-01, D-02).
 * When a duplicate is found, increments duplicate_count on the most recent record.
 *
 * @param {{ BUG_REPORTS: KVNamespace }} env
 * @param {string} fingerprint
 * @param {number} now - Date.now()
 * @returns {Promise<{isDuplicate: boolean, fingerprint?: string}>}
 */
async function checkAndHandleDuplication(env, fingerprint, now, testMode = false) {
  const { keys } = await env.BUG_REPORTS.list({ prefix: `report:${fingerprint}:` });

  // Filter to records within the 15-minute window (Pitfall 3: only in-window keys are dups)
  // Key format: report:{fp}:{timestamp_ms}
  const recentKeys = keys.filter(k => {
    const parts = k.name.split(':');
    const ts = parseInt(parts[parts.length - 1], 10);
    return !isNaN(ts) && (now - ts) < DEDUP_WINDOW_MS;
  });

  if (recentKeys.length === 0) {
    return { isDuplicate: false };
  }

  // Increment duplicate_count on the most recent in-window record
  const mostRecent = recentKeys[recentKeys.length - 1];
  const existing = await env.BUG_REPORTS.get(mostRecent.name, { type: 'json' });
  if (existing) {
    existing.duplicate_count = (existing.duplicate_count ?? 0) + 1;
    // INJ-01: suppress the KV write in test mode so test/CI submissions never mutate
    // production records via the dedup path (parity with the canonical write guard below).
    if (!testMode) {
      await env.BUG_REPORTS.put(mostRecent.name, JSON.stringify(existing), {
        expirationTtl: 7776000,
      });
    }
  }

  return { isDuplicate: true, fingerprint };
}

/**
 * Posts a compact triage card embed to the Discord webhook (D-05, D-06, D-07).
 * Runs inside ctx.waitUntil() — failures do NOT affect the 201 response (D-04).
 *
 * @param {string} webhookUrl - env.DISCORD_WEBHOOK_URL (never committed to code)
 * @param {object} record - KV record from buildKvRecord()
 * @param {string} fingerprint - 16-hex fingerprint
 * @returns {Promise<void>}
 */
async function postToDiscord(webhookUrl, record, fingerprint) {
  if (!webhookUrl) return;

  // D-07: title format locked — [category] — US{patentNumber}
  const title = `[${record.category}] — US${record.patentNumber}`.slice(0, 256);

  // D-06: selection snippet (~200 chars, quoted) — only when present
  const selectionSnippet = record.selectionText
    ? `> ${record.selectionText.slice(0, 200)}${record.selectionText.length > 200 ? '…' : ''}`
    : null;

  const patentUrl = record.patentUrl || `https://patents.google.com/patent/US${record.patentNumber}`;

  const embed = {
    title,
    color: CATEGORY_COLORS[record.category] ?? 0x6B7280,
    fields: [
      {
        name: 'Patent',
        value: `[US${record.patentNumber}](${patentUrl})`.slice(0, 1024),
        inline: true,
      },
      {
        name: 'Category',
        value: record.category,
        inline: true,
      },
      {
        name: 'Confidence',
        value: record.confidenceTier || 'n/a',
        inline: true,
      },
      {
        name: 'Version / Browser / OS',
        value: `v${record.extensionVersion} · ${record.browser || 'n/a'} · ${record.os || 'n/a'}`.slice(0, 1024),
        inline: false,
      },
      ...(record.note ? [{ name: 'Note', value: record.note.slice(0, 1024), inline: false }] : []),
      ...(selectionSnippet ? [{ name: 'Selection', value: selectionSnippet.slice(0, 1024), inline: false }] : []),
    ],
    footer: { text: `fp:${fingerprint}` },
    timestamp: new Date(record.timestamp).toISOString(),
  };

  // T-1-05: allowed_mentions: { parse: [] } neutralizes @everyone/@here injection
  // Best-effort: errors are silently swallowed — Discord outage must never lose a report (D-04)
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (_) {
    // Intentionally swallowed — Discord is best-effort only (D-04)
  }
}

/**
 * Handles POST /report requests.
 * Cheapest-first operation ordering (RESEARCH Pattern 6):
 *   1. Body size check — zero I/O
 *   2. IP rate limit — one KV read
 *   3. JSON parse
 *   4. Required-field validation
 *   5. Fingerprint computation
 *   6. Dedup check
 *   7. KV write (canonical)
 *   8. Return 201; Discord via ctx.waitUntil() (best-effort, D-04)
 *
 * @param {Request} request
 * @param {{ BUG_REPORTS: KVNamespace, DISCORD_WEBHOOK_URL: string }} env
 * @param {ExecutionContext} ctx
 * @returns {Promise<Response>}
 */
async function handleReport(request, env, ctx) {
  // Non-POST methods → 405
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  // 1. Body size check — read as text BEFORE JSON.parse (Pitfall 4: Content-Length unreliable)
  const raw = await request.text();
  if (raw.length > 65536) {
    return new Response('Request body too large (max 64 KB)', {
      status: 413,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  // 2. IP rate limit check (LIMIT-02)
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { allowed } = await checkIpRateLimit(env, clientIp);
  if (!allowed) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/plain',
        'Retry-After': '60',
      },
    });
  }

  // 3. JSON parse
  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  // 4. Required-field validation (D-09)
  const validationError = validateReportBody(body);
  if (validationError) {
    return new Response(validationError, {
      status: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'text/plain' },
    });
  }

  // 5. Compute fingerprint (PAY-04)
  const fingerprint = await computeFingerprint(body.patentNumber, body.category, body.selectionText);
  const now = Date.now();

  // INJ-01: X-PCT-Test-Mode suppresses ALL KV writes (canonical + dedup increment) and Discord.
  const testMode = request.headers.get('X-PCT-Test-Mode') === 'true';

  // 6. Dedup check (LIMIT-01, D-02)
  const { isDuplicate } = await checkAndHandleDuplication(env, fingerprint, now, testMode);
  if (isDuplicate) {
    // Write the incremented record (unless test-mode); Discord SUPPRESSED for dups (D-03)
    return new Response(
      JSON.stringify({ ok: true, fingerprint, deduped: true }),
      {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      }
    );
  }

  // 7. Build record and KV write (canonical — must succeed before 201)
  const record = buildKvRecord(body, fingerprint, now);
  const kvKey = `report:${fingerprint}:${now}`;

  // INJ-01: X-PCT-Test-Mode suppresses KV write AND Discord POST
  if (!testMode) {
    await env.BUG_REPORTS.put(kvKey, JSON.stringify(record), { expirationTtl: 7776000 });
  }

  // 8. Return 201 response; fire Discord in background (D-04 — best-effort after response)
  const response = new Response(
    JSON.stringify({ ok: true, fingerprint, deduped: false }),
    {
      status: 201,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    }
  );

  // Discord POST runs after response is queued; outage/misconfiguration never costs a report
  if (!testMode) {
    ctx.waitUntil(postToDiscord(env.DISCORD_WEBHOOK_URL, record, fingerprint));
  }

  return response;
}

export default {
  /**
   * Main fetch handler for the Cloudflare Worker.
   *
   * @param {Request} request
   * @param {{ PROXY_TOKEN: string, USPTO_API_KEY: string, PATENT_CACHE: KVNamespace, BUG_REPORTS: KVNamespace, DISCORD_WEBHOOK_URL: string }} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    // 1. CORS preflight — must be handled before auth check (preflight has no Authorization)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PCT-Test-Mode',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. Bearer token validation
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader !== `Bearer ${env.PROXY_TOKEN}`) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/plain',
        },
      });
    }

    // 3. Route dispatch — parse URL once for all routes
    const url = new URL(request.url);
    const path = url.pathname;

    // Cache routes: GET /cache (read) and POST /cache (write with existence check)
    if (path === '/cache') {
      const rawPatent = url.searchParams.get('patent') || '';
      const version = url.searchParams.get('v') || 'v1';
      const patentNumber = cleanPatentNumber(rawPatent);

      if (!/^\d{6,8}$/.test(patentNumber)) {
        return new Response(
          `Invalid patent number: "${rawPatent}". Expected 6-8 digits.`,
          {
            status: 400,
            headers: {
              ...corsHeaders(),
              'Content-Type': 'text/plain',
            },
          }
        );
      }

      const key = `${version}:${patentNumber}`;

      if (request.method === 'GET') {
        // Read from KV — return cached position map or 404
        const cached = await env.PATENT_CACHE.get(key, { type: 'json' });
        if (cached === null) {
          return new Response('Not found', {
            status: 404,
            headers: {
              ...corsHeaders(),
              'Content-Type': 'text/plain',
            },
          });
        }
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'application/json',
          },
        });
      }

      if (request.method === 'POST') {
        // Existence check before write (CACH-04: protect KV write quota)
        const existing = await env.PATENT_CACHE.get(key);
        if (existing !== null) {
          return new Response('Already cached', {
            status: 200,
            headers: {
              ...corsHeaders(),
              'Content-Type': 'text/plain',
            },
          });
        }

        // Parse request body
        let payload;
        try {
          payload = await request.json();
        } catch (_) {
          return new Response('Invalid JSON body', {
            status: 400,
            headers: {
              ...corsHeaders(),
              'Content-Type': 'text/plain',
            },
          });
        }

        // Write to KV (no TTL per design decision)
        // INJ-01: X-PCT-Test-Mode header suppresses KV write so CI E2E
        // runs don't pollute the shared production cache. Response
        // semantics are unchanged — still returns 201 "Cached" below.
        if (request.headers.get('X-PCT-Test-Mode') !== 'true') {
          await env.PATENT_CACHE.put(key, JSON.stringify(payload));
        }
        return new Response('Cached', {
          status: 201,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'text/plain',
          },
        });
      }

      // Method not allowed for /cache path
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/plain',
        },
      });
    }

    // Bug report route: POST /report — behind the existing Bearer PROXY_TOKEN gate (D-01)
    if (path === '/report') {
      return handleReport(request, env, ctx);
    }

    // USPTO proxy route: GET /?patent={number}
    const rawPatent = url.searchParams.get('patent') || '';
    const patentNumber = cleanPatentNumber(rawPatent);

    if (!/^\d{6,8}$/.test(patentNumber)) {
      return new Response(
        `Invalid patent number: "${rawPatent}". Expected 6-8 digits (e.g. 12505414 or US12505414B2).`,
        {
          status: 400,
          headers: {
            ...corsHeaders(),
            'Content-Type': 'text/plain',
          },
        }
      );
    }

    // 4-5. Orchestrate ODP lookup and stream PDF back
    try {
      const pdfResponse = await fetchEgrantPdf(patentNumber, env.USPTO_API_KEY);

      return new Response(pdfResponse.body, {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/pdf',
        },
      });
    } catch (err) {
      // 6. Error response — CORS header is critical so extension gets HTTP status not opaque error
      return new Response(`USPTO lookup failed: ${err.message}`, {
        status: 502,
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/plain',
        },
      });
    }
  },
};

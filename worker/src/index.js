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

export default {
  /**
   * Main fetch handler for the Cloudflare Worker.
   *
   * @param {Request} request
   * @param {{ PROXY_TOKEN: string, USPTO_API_KEY: string, PATENT_CACHE: KVNamespace }} env
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
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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
        await env.PATENT_CACHE.put(key, JSON.stringify(payload));
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

#!/usr/bin/env node
// Operator-only shared-cache maintenance. CACHE_WRITE_TOKEN is never bundled.
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildPositionMap } from '../src/shared/position-map-builder.js';
import { CACHE_VERSION, MAX_CACHE_BYTES, buildCachePayload, validateCachePayload } from '../src/shared/cache-schema.js';

const [command, rawPatent, input, output, ...flags] = process.argv.slice(2);
const patent = rawPatent?.replace(/^US/i, '').replace(/B[12]$/i, '');
const usage = 'Usage: cache-admin.mjs prepare <patent> <pdf> <output.json> | put <patent> <map.json> [--replace] | delete <patent>';

async function main() {
  if (!['prepare', 'put', 'delete'].includes(command) || !/^\d{6,8}$/.test(patent || '')) throw new Error(usage);
  if (command === 'prepare') {
    if (!input || !output || flags.length) throw new Error(usage);
    const pdf = await getDocument({ data: new Uint8Array(await fs.readFile(input)), verbosity: 0 }).promise;
    try {
      const pages = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        // Check the source patent number on the first page before preparing a map.
        if (pageNum === 1 && !content.items.map(item => item.str || '').join('').replace(/[\s,]/g, '').includes(patent)) {
          throw new Error('The PDF first page does not contain the requested patent number');
        }
        pages.push({
          pageNum, pageWidth: viewport.width, pageHeight: viewport.height,
          items: content.items.filter(item => item.str?.trim()).map(item => ({
            text: item.str, x: item.transform[4], y: item.transform[5],
            width: item.width, height: item.height, fontName: item.fontName, hasEOL: item.hasEOL,
          })),
        });
      }
      const payload = { ...buildCachePayload(buildPositionMap(pages)), patentNumber: patent };
      if (!validateCachePayload(payload)) throw new Error('PDF did not produce a valid position map');
      const json = JSON.stringify(payload, null, 2);
      if (Buffer.byteLength(json) > MAX_CACHE_BYTES) throw new Error('Prepared map exceeds the cache size limit');
      await fs.writeFile(output, json + '\n', { flag: 'wx' });
      console.log(`Prepared ${payload.entries.length} lines for US${patent} in ${output}; inspect before uploading.`);
    } finally { await pdf.destroy(); }
    return;
  }
  const replace = command === 'put' && output === '--replace';
  if ((command === 'put' && (!input || (output && !replace) || flags.length)) ||
      (command === 'delete' && (input || output || flags.length))) throw new Error(usage);
  const token = process.env.CACHE_WRITE_TOKEN;
  if (!token) throw new Error('Set CACHE_WRITE_TOKEN to the operator-only Worker secret');
  const base = new URL(process.env.CACHE_WORKER_URL || 'https://pct.tonyrowles.com');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('Cache endpoint must use HTTPS (HTTP is allowed only for local development)');
  }
  const url = new URL('/cache', base);
  url.searchParams.set('patent', patent);
  url.searchParams.set('v', CACHE_VERSION);
  let body;
  if (command === 'put') {
    body = await fs.readFile(input, 'utf8');
    if (Buffer.byteLength(body) > MAX_CACHE_BYTES) throw new Error('Map exceeds the cache size limit');
    const payload = JSON.parse(body);
    if (!validateCachePayload(payload) || payload.patentNumber !== patent) throw new Error('Invalid map or patent number mismatch');
  }
  const response = await fetch(url, {
    method: command === 'delete' ? 'DELETE' : replace ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body, signal: AbortSignal.timeout(30000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Cache request failed (${response.status}): ${await response.text()}`);
  console.log(`US${patent}: ${await response.text()}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });

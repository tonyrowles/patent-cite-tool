import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it, expect } from 'vitest';
import { buildCachePayload } from '../../src/shared/cache-schema.js';

const run = promisify(execFile);
const payload = { ...buildCachePayload([{ text: 'verified text', column: 1, lineNumber: 5,
  page: 2, section: 'description', hasWrapHyphen: false }]), patentNumber: '6738932' };

async function withOperatorEndpoint(handler, callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pct-cache-admin-'));
  const file = path.join(directory, 'map.json');
  await fs.writeFile(file, JSON.stringify(payload));
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = { ...process.env, CACHE_WRITE_TOKEN: 'test-operator-only',
    CACHE_WORKER_URL: `http://127.0.0.1:${server.address().port}` };
  try { await callback({ file, env }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

describe('Operator cache CLI', () => {
  it('uses distinct create, repair, and delete requests with the operator credential', async () => {
    const requests = [];
    await withOperatorEndpoint(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push({ method: request.method, url: request.url, auth: request.headers.authorization, body });
      response.writeHead(request.method === 'POST' ? 201 : 200);
      response.end('OK');
    }, async ({ file, env }) => {
      for (const args of [['put', 'US6738932', file], ['put', 'US6738932', file, '--replace'], ['delete', 'US6738932']]) {
        const result = await run(process.execPath, ['scripts/cache-admin.mjs', ...args], { env });
        expect(result.stdout + result.stderr).not.toContain(env.CACHE_WRITE_TOKEN);
      }
    });
    expect(requests.map(request => request.method)).toEqual(['POST', 'PUT', 'DELETE']);
    for (const request of requests) {
      expect(request.auth).toBe('Bearer test-operator-only');
      expect(request.url).toBe('/cache?patent=6738932&v=v6');
    }
    expect(JSON.parse(requests[0].body)).toEqual(payload);
    expect(requests[2].body).toBe('');
  });

  it('rejects mismatched patents before sending and refuses redirects', async () => {
    const paths = [];
    await withOperatorEndpoint((request, response) => {
      paths.push(request.url);
      response.writeHead(302, { Location: '/credential-leak' }); response.end();
    }, async ({ file, env }) => {
      await expect(run(process.execPath, ['scripts/cache-admin.mjs', 'put', 'US7509250', file], { env }))
        .rejects.toMatchObject({ stderr: expect.stringContaining('patent number mismatch') });
      expect(paths).toEqual([]);
      await expect(run(process.execPath, ['scripts/cache-admin.mjs', 'put', 'US6738932', file], { env })).rejects.toThrow();
      expect(paths).toEqual(['/cache?patent=6738932&v=v6']);
    });
  });
});

// tests/unit/ingest-reports-wrangler-guard.test.js
//
// Phase 11 Plan 03 — static-grep guards for the STATE.md wrangler --remote invariant
// and the ING-02 delegation assertion (ingest-reports.mjs must import from review-reports.mjs,
// not reimplement wrangler shell-outs).
//
// Pattern: readFileSync + grep, copied from tests/unit/eslint-sdk-guard.test.js lines 17–32.
// Comment lines are excluded before counting so header prose cannot self-invalidate the grep.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const REVIEW_SRC   = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'review-reports.mjs'), 'utf8');
const INGEST_SRC   = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'ingest-reports.mjs'), 'utf8');
const GHCLIENT_SRC = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'gh-client.mjs'), 'utf8');

// Strip comment lines before grepping so a `// ['kv', 'key', ...]` in a header comment
// does not accidentally satisfy (or fail) the assertion.
function nonCommentLines(src) {
  return src.split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n');
}

describe('wrangler --remote guard (STATE.md invariant)', () => {
  it('review-reports.mjs: all wrangler kv key calls include --remote', () => {
    const code = nonCommentLines(REVIEW_SRC);
    // Match actual ['kv', 'key', ...] array literals (not comment prose)
    const kvCalls = code.match(/\['kv', 'key',[^\]]+\]/g) ?? [];
    expect(kvCalls.length).toBeGreaterThan(0);
    for (const call of kvCalls) {
      expect(call).toContain('--remote');
    }
  });

  it('ingest-reports.mjs: no inline wrangler kv calls without --remote', () => {
    // ingest-reports.mjs delegates all KV I/O to review-reports.mjs; it should have
    // zero raw wrangler kv calls. Any that DO exist must include --remote.
    const wranglerCalls = INGEST_SRC.match(/wrangler.*kv/g) ?? [];
    for (const call of wranglerCalls) {
      expect(call).toContain('--remote');
    }
    // ING-02 positive: import delegation is present
    expect(INGEST_SRC).toMatch(/from ['"]\.\/review-reports\.mjs['"]/);
  });

  it('ingest-reports.mjs: CLI guard uses fileURLToPath pattern (not file:// form)', () => {
    expect(INGEST_SRC).toMatch(/fileURLToPath\(import\.meta\.url\)/);
    expect(INGEST_SRC).toMatch(/process\.argv\[1\]/);
    // Must NOT use the e2e-report-issue.mjs `file://` form (anti-pattern from PATTERNS.md)
    expect(INGEST_SRC).not.toMatch(/import\.meta\.url\s*===\s*`file:\/\//);
  });

  it('gh-client.mjs: no inline wrangler kv calls (pure gh CLI client)', () => {
    const wranglerCalls = GHCLIENT_SRC.match(/wrangler.*kv/g) ?? [];
    // gh-client.mjs uses execSync for gh CLI only — no wrangler kv calls expected
    for (const call of wranglerCalls) {
      expect(call).toContain('--remote');
    }
  });
});

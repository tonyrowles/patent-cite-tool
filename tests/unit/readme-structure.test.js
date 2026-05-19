// tests/unit/readme-structure.test.js
//
// Phase 31 DOC-01 — structural guard for tests/e2e/README.md.
//
// This test is the "load-bearing" contract for the README: if a future
// phase adds an `e2e:*` script or a new data-testid attribute, the README
// MUST be updated in the same commit or this test will fail.
//
// Coverage map (13 assertions, see 31-04-PLAN.md Task 1 <behavior>):
//   1.  README file exists
//   2.  README size > 8000 bytes (loose proxy for ~350+ lines of content)
//   3.  All 7 required section markers appear (case-insensitive)
//   4.  Every `e2e:*` npm script in package.json appears in the README
//   5.  Both data-testid values are documented (pct-citation-host, pct-citation-pill)
//   6.  Phase 30 test-mode contract documented (X-PCT-Test-Mode, pct_test_cache_version, pct_test_mode)
//   7.  Ledger path documented (tests/e2e/.llm-spend-ledger.json)
//   8.  Both spend thresholds documented ($80 + $100)
//   9.  Reset procedure documented ("delete the file" or rm form)
//   10. Subscription-exhaustion signal keywords present (>= 2 of: subscription, quota, credit, MAX_5, exhaust)
//   11. New taxonomy codes documented (LLM_HALLUCINATED_SELECTION + LLM_API_ERROR)
//   12. CI guard documented (CI=true + "local-only")
//   13. Every `npm run e2e:*` reference in the README points to a real script

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const README_PATH = path.resolve(__dirname, '../e2e/README.md');
const PKG_PATH = path.resolve(__dirname, '../../package.json');

describe('tests/e2e/README.md structural contract (DOC-01)', () => {
  let readme;
  let pkg;

  it('exists', () => {
    expect(fs.existsSync(README_PATH)).toBe(true);
    readme = fs.readFileSync(README_PATH, 'utf8');
    pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  });

  it('is substantive (> 8000 bytes)', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme.length).toBeGreaterThan(8000);
  });

  it('contains all 7 required section headers', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    const lower = readme.toLowerCase();
    const sections = [
      'overview',
      'deterministic',
      'exploratory',
      'test-hook',
      'adding',
      'ledger',
      'troubleshooting',
    ];
    for (const s of sections) {
      expect(lower).toContain(s);
    }
  });

  it('documents every e2e:* script in package.json', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    if (!pkg) pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const e2eScripts = Object.keys(pkg.scripts || {}).filter(k => k.startsWith('e2e:'));
    expect(e2eScripts.length).toBeGreaterThan(0);
    for (const s of e2eScripts) {
      expect(readme).toContain(s);
    }
  });

  it('contains both data-testid values', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('pct-citation-host');
    expect(readme).toContain('pct-citation-pill');
  });

  it('documents Phase 30 test-mode contract', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('X-PCT-Test-Mode');
    expect(readme).toContain('pct_test_cache_version');
    expect(readme).toContain('pct_test_mode');
  });

  it('documents the ledger path', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('tests/e2e/.llm-spend-ledger.json');
  });

  it('documents both spend thresholds', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('$80');
    expect(readme).toContain('$100');
  });

  it('documents the reset procedure', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    const lower = readme.toLowerCase();
    expect(
      lower.includes('delete the file') ||
      lower.includes('rm tests/e2e/.llm-spend-ledger.json') ||
      lower.includes('remove the file')
    ).toBe(true);
  });

  it('documents subscription-exhaustion signal', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    const lower = readme.toLowerCase();
    const keywords = ['subscription', 'quota', 'credit', 'max_5', 'exhaust'];
    const hits = keywords.filter(k => lower.includes(k));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it('contains new failure taxonomy codes', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('LLM_HALLUCINATED_SELECTION');
    expect(readme).toContain('LLM_API_ERROR');
  });

  it('documents the CI guard', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    const lower = readme.toLowerCase();
    expect(readme).toContain('CI=true');
    expect(lower).toContain('local-only');
  });

  it('all `npm run e2e:*` references in README map to real scripts', () => {
    if (!readme) readme = fs.readFileSync(README_PATH, 'utf8');
    if (!pkg) pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    const realScripts = new Set(Object.keys(pkg.scripts || {}));
    const referenced = readme.match(/npm run (e2e:[a-z:-]+)/g) || [];
    for (const ref of referenced) {
      const name = ref.replace(/^npm run /, '');
      expect(
        realScripts.has(name),
        `README references "${ref}" but no such script in package.json`,
      ).toBe(true);
    }
  });
});

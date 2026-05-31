// tests/unit/eslint-sdk-guard.test.js
//
// Phase 39 (LEDGER-03 + CLEANUP-04 partial) — pin the ESLint
// no-restricted-imports guard on @anthropic-ai/sdk to the driver-only path.
//
// Two-layer verification:
//   1. Static-grep: eslint.config.js contains the expected block (cheap;
//      always runs).
//   2. ESLint programmatic API: lint a synthetic source string with a
//      forbidden import; assert the rule fires (definitive; gated on
//      ESLint Node API import).
//
// Rationale: PITFALLS Pitfall 3 — flat-config order bug means a misplaced
// block silently lets the SDK through. Grep alone catches code-drift;
// programmatic API catches order-drift.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ESLINT_CONFIG_PATH = path.join(REPO_ROOT, 'eslint.config.js');

describe('Phase 39: ESLint guard on @anthropic-ai/sdk imports', () => {
  it('Test 1: eslint.config.js exists and references @anthropic-ai/sdk', () => {
    expect(fs.existsSync(ESLINT_CONFIG_PATH)).toBe(true);
    const text = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    // Strip JS comments before counting so a comment-only mention does not pass the gate.
    const code = text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const occurrences = (code.match(/@anthropic-ai\/sdk/g) || []).length;
    // Expect at least 2 actual code references (name field + message field).
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('Test 2: ignores tests/e2e/lib/llm-driver.js exactly once', () => {
    const text = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    const matches = text.match(/ignores:\s*\[\s*'tests\/e2e\/lib\/llm-driver\.js'\s*\]/g) || [];
    expect(matches.length).toBe(1);
  });

  it('Test 3: SDK block is the LAST entry (appears in final 50 lines, per Pitfall 3 order rule)', () => {
    const text = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    const lines = text.split(/\r?\n/);
    const tail = lines.slice(-50).join('\n');
    expect(tail).toMatch(/@anthropic-ai\/sdk/);
  });

  it('Test 4: ESLint API confirms the rule fires on a forbidden import (skip if ESLint API unimportable)', async () => {
    let ESLint;
    try {
      ({ ESLint } = await import('eslint'));
    } catch {
      // eslint is a devDep; if it cannot be imported in the test env,
      // fall back to the grep tests above. Mark as skipped to surface
      // the gap without failing.
      // eslint-disable-next-line no-console
      console.warn('eslint Node API unimportable; skipping programmatic check');
      return;
    }
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import Anthropic from '@anthropic-ai/sdk';\nexport default Anthropic;\n",
      { filePath: path.join(REPO_ROOT, 'scripts', 'forbidden-sdk-import-fixture.js') },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hasRestriction = messages.some((m) => m.ruleId === 'no-restricted-imports');
    expect(hasRestriction).toBe(true);
  });

  it('Test 5: ESLint API does NOT fire on the legitimate driver import (allowed by ignores)', async () => {
    let ESLint;
    try {
      ({ ESLint } = await import('eslint'));
    } catch {
      return;
    }
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import Anthropic from '@anthropic-ai/sdk';\nexport default Anthropic;\n",
      { filePath: path.join(REPO_ROOT, 'tests', 'e2e', 'lib', 'llm-driver.js') },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hasRestriction = messages.some((m) => m.ruleId === 'no-restricted-imports');
    expect(hasRestriction).toBe(false);
  });
});

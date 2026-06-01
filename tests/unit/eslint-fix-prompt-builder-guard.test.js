// tests/unit/eslint-fix-prompt-builder-guard.test.js
//
// Phase 42 (PROMPT-04) — pin the ESLint no-restricted-imports guard on
// tests/e2e/lib/fix-prompt-builder.js. Mirrors tests/unit/eslint-sdk-guard.test.js
// (Phase 39 LEDGER-03) — same `new ESLint({...})` + `lintText(code, {filePath})`
// pattern, scoped to a different per-file block.
//
// Four restricted imports MUST fire:
//   1. node:fs               — fix-prompt-builder must be pure (no I/O).
//   2. node:child_process    — fix-prompt-builder must be pure (no subprocess).
//   3. node:path             — fix-prompt-builder must be pure (no path math).
//   4. @anthropic-ai/sdk     — Phase 39 single-entry-point rule, INLINED in the
//                              per-file block as a Pitfall 1/Pitfall 3 (commit
//                              345cdcb) regression guard. Even if a future
//                              maintainer expands the catch-all SDK guard at the
//                              END of eslint.config.js to use a glob that
//                              clobbers per-file rules, the inline restriction
//                              here is the source of truth.
//
// Two-layer verification mirrors the SDK guard:
//   1. Static-grep: eslint.config.js contains the expected per-file block AND
//      the catch-all ignores list has been augmented (Pitfall 1 prevention).
//   2. ESLint programmatic API: lintText a synthetic source string against the
//      fix-prompt-builder.js filePath; assert each forbidden import fires.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ESLINT_CONFIG_PATH = path.join(REPO_ROOT, 'eslint.config.js');
const TARGET_FILE = path.join(REPO_ROOT, 'tests', 'e2e', 'lib', 'fix-prompt-builder.js');

describe('Phase 42 PROMPT-04: ESLint guard on tests/e2e/lib/fix-prompt-builder.js', () => {
  it('Static: eslint.config.js references tests/e2e/lib/fix-prompt-builder.js at least TWICE (per-file files: + catch-all ignores:)', () => {
    // Pitfall 1/345cdcb prevention: the per-file block ADDs the path to its
    // `files:` array, AND the catch-all SDK guard at the end of the config
    // must add the same path to its `ignores:` list — otherwise the catch-all
    // CLOBBERS the per-file rules. Count ≥ 2 proves both edits landed in the
    // same commit.
    const text = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    const occurrences = (text.match(/tests\/e2e\/lib\/fix-prompt-builder\.js/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('Static: per-file block lists node:fs, node:child_process, node:path as restricted', () => {
    // NOTE: this is a static sanity grep — the programmatic ESLint API tests
    // below (Tests 1-4) are the source of truth for rule behavior. We do NOT
    // strip JS comments here because eslint.config.js contains glob patterns
    // like `'tests/e2e/**/*.js'` that include `/**/` substrings; a naive
    // `/\*[\s\S]*?\*\//g` strip matches them as block comments and eats
    // ~50% of the config file (including the per-file block we want to test).
    // The grep below requires `name: '<module>'` exactly — comment text like
    // `// e.g. node:fs` does not satisfy it.
    const text = fs.readFileSync(ESLINT_CONFIG_PATH, 'utf8');
    expect(text).toMatch(/name:\s*['"]node:fs['"]/);
    expect(text).toMatch(/name:\s*['"]node:child_process['"]/);
    expect(text).toMatch(/name:\s*['"]node:path['"]/);
  });

  it('ESLint API Test 1: node:fs import fires no-restricted-imports', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import fs from 'node:fs';\nexport default fs;\n",
      { filePath: TARGET_FILE },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit).toBeDefined();
    // Message contract pins the failure to the PROMPT-04 requirement so a
    // future config edit that swaps the message still has to mention PROMPT-04.
    expect(hit.message).toMatch(/fix-prompt-builder must be pure.*PROMPT-04/);
  });

  it('ESLint API Test 2: node:child_process import fires no-restricted-imports', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import { spawnSync } from 'node:child_process';\nexport default spawnSync;\n",
      { filePath: TARGET_FILE },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/fix-prompt-builder must be pure.*PROMPT-04/);
  });

  it('ESLint API Test 3: node:path import fires no-restricted-imports', async () => {
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import path from 'node:path';\nexport default path;\n",
      { filePath: TARGET_FILE },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/fix-prompt-builder must be pure.*PROMPT-04/);
  });

  it('ESLint API Test 4: @anthropic-ai/sdk import fires (Pitfall 1/345cdcb INLINE regression guard)', async () => {
    // CRITICAL — this is the regression guard for the Pitfall 1 / commit 345cdcb
    // catch-all-clobber bug. If the catch-all SDK guard's `ignores:` list
    // includes the fix-prompt-builder path (it must, to keep the per-file
    // node:fs/cp/path rules from being silently clobbered) AND the per-file
    // block DOES NOT also INLINE the @anthropic-ai/sdk restriction, then THIS
    // file becomes a silent SDK-import bypass. The INLINE restriction inside
    // the per-file block IS the regression guard; this test pins it.
    const { ESLint } = await import('eslint');
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const results = await eslint.lintText(
      "import Anthropic from '@anthropic-ai/sdk';\nexport default Anthropic;\n",
      { filePath: TARGET_FILE },
    );
    const messages = results.flatMap((r) => r.messages || []);
    const hit = messages.find((m) => m.ruleId === 'no-restricted-imports');
    expect(hit).toBeDefined();
    expect(hit.message).toMatch(/Direct @anthropic-ai\/sdk imports forbidden/);
  });
});

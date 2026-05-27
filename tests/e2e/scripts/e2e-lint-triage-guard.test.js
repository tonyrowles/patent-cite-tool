// tests/e2e/scripts/e2e-lint-triage-guard.test.js
//
// Phase 34 (TRIAGE-04) — ESLint D-07 guard scope-extension test.
//
// Proves that the `no-restricted-imports` block in eslint.config.js fires when
// tests/e2e/lib/triage-classifier.js imports invokeClaudeP by name. Two tests:
//
//   1. Sanity check: `npm run lint` exits 0 on the unmodified triage-classifier.js
//      (the rule does NOT produce false positives on legitimate code).
//
//   2. Violation check: temporarily inject a forbidden named import
//      `import { invokeClaudeP } from './llm-driver.js'` into triage-classifier.js,
//      run `npm run lint`, assert non-zero exit + the D-07 message appears in output,
//      then RESTORE the original content.
//
// Pitfall 7 mitigation: the injected violation MUST be a NAMED IMPORT (not a
// side-effect import or default import). The ESLint `paths+importNames` form
// specifically matches named imports — a side-effect import would silently pass.
//
// Restore safety belt-and-suspenders:
//   - try/finally guarantees restore even on assertion failure inside the try block.
//   - process.once('exit', ...) restores the file if the process exits unexpectedly
//     between the writeFileSync mutation and the finally block.
//
// D-07: the per-file ESLint block is NOT a glob — it is scoped to the exact path
// `tests/e2e/lib/triage-classifier.js`. This test only validates that specific scope.

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Absolute path to the file under test — matches the exact path in the ESLint
// `files: ['tests/e2e/lib/triage-classifier.js']` block.
const FILE_UNDER_TEST = path.resolve(__dirname, '../../../tests/e2e/lib/triage-classifier.js');

// Module-scope save for the process.once('exit') safety net.
// Populated in beforeAll so it is available to the exit handler before the
// mutation test runs.
let originalSavedContent = null;

beforeAll(() => {
  originalSavedContent = fs.readFileSync(FILE_UNDER_TEST, 'utf8');
  // Belt-and-suspenders: restore the file if the process exits unexpectedly
  // between the writeFileSync mutation and the finally block in the violation
  // test. This catches the pathological case where Node exits (SIGKILL, OOM,
  // uncaught async, etc.) before the finally block can run.
  process.once('exit', () => {
    try {
      if (originalSavedContent) {
        fs.writeFileSync(FILE_UNDER_TEST, originalSavedContent);
      }
    } catch {
      /* best-effort — cannot throw in an exit handler */
    }
  });
});

describe('ESLint D-07 guard (TRIAGE-04 scope extension)', () => {
  it(
    'npm run lint exits 0 on current triage-classifier.js (sanity check — no false positives)',
    () => {
      const r = spawnSync('npm', ['run', 'lint'], {
        encoding: 'utf8',
        timeout: 60000,
        cwd: path.resolve(__dirname, '../../..'),
      });
      expect(r.status).toBe(0);
    },
    90000,
  );

  it(
    'npm run lint blocks named import { invokeClaudeP } in triage-classifier.js (D-07)',
    () => {
      // Read original content BEFORE the try block so it is available in
      // the finally clause even if fs.readFileSync throws.
      const originalContent = fs.readFileSync(FILE_UNDER_TEST, 'utf8');

      let r;
      let output = '';
      try {
        // Inject a forbidden NAMED import after the first existing import line.
        // The form `import { invokeClaudeP } from './llm-driver.js'` is EXACTLY
        // the shape the ESLint paths+importNames rule must catch (Pitfall 7).
        const violatingContent = originalContent.replace(
          /^(import.*\n)/m,
          "$1import { invokeClaudeP } from './llm-driver.js';\n",
        );
        fs.writeFileSync(FILE_UNDER_TEST, violatingContent);

        r = spawnSync('npm', ['run', 'lint'], {
          encoding: 'utf8',
          timeout: 60000,
          cwd: path.resolve(__dirname, '../../..'),
        });
        output = (r.stdout || '') + (r.stderr || '');
      } finally {
        // CRITICAL: restore inside finally — runs whether or not assertions throw.
        fs.writeFileSync(FILE_UNDER_TEST, originalContent);
      }

      // Lint MUST fail when the forbidden named import is present.
      expect(r.status).not.toBe(0);

      // The rule message must appear in lint output (matches D-07 or
      // invokeClaudePWithLedger phrase from eslint.config.js).
      expect(output).toMatch(/D-07|invokeClaudePWithLedger|must use invokeClaudePWithLedger/i);

      // Paranoid self-check: file restored to exact original bytes.
      expect(fs.readFileSync(FILE_UNDER_TEST, 'utf8')).toBe(originalContent);
    },
    90000,
  );
});

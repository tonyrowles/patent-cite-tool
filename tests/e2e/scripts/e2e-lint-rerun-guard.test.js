// tests/e2e/scripts/e2e-lint-rerun-guard.test.js
//
// Phase 33 (RERUN-04) — ESLint independence guard smoke test.
//
// Proves that the `no-restricted-imports` block in eslint.config.js fires when
// tests/e2e/lib/rerun-validator.js imports from src/. Two tests:
//
//   1. Sanity check: `npm run lint` exits 0 on the unmodified rerun-validator.js
//      (the rule does NOT produce false positives on legitimate code).
//
//   2. Violation check: temporarily inject a forbidden `import '../../../src/...'`
//      line into rerun-validator.js, run `npm run lint`, assert non-zero exit + the
//      RERUN-04 message appears in output, then RESTORE the original content.
//
// Restore safety belt-and-suspenders:
//   - try/finally guarantees restore even on assertion failure inside the try block.
//   - process.once('exit', ...) restores the file if the process exits unexpectedly
//     between the writeFileSync mutation and the finally block.
//
// D-16: the per-file ESLint block is NOT a glob — it is scoped to the exact path
// `tests/e2e/lib/rerun-validator.js`. This test only validates that specific scope.

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Absolute path to the file under test — matches the exact path in the ESLint
// `files: ['tests/e2e/lib/rerun-validator.js']` block.
const RERUN_VALIDATOR_PATH = path.resolve(__dirname, '../../../tests/e2e/lib/rerun-validator.js');

// Module-scope save for the process.once('exit') safety net.
// Populated in beforeAll so it is available to the exit handler before the
// mutation test runs.
let originalSavedContent = null;

beforeAll(() => {
  originalSavedContent = fs.readFileSync(RERUN_VALIDATOR_PATH, 'utf8');
  // Belt-and-suspenders: restore the file if the process exits unexpectedly
  // between the writeFileSync mutation and the finally block in the violation
  // test. This catches the pathological case where Node exits (SIGKILL, OOM,
  // uncaught async, etc.) before the finally block can run.
  process.once('exit', () => {
    try {
      if (originalSavedContent) {
        fs.writeFileSync(RERUN_VALIDATOR_PATH, originalSavedContent);
      }
    } catch {
      /* best-effort — cannot throw in an exit handler */
    }
  });
});

describe('ESLint RERUN-04 guard', () => {
  it(
    'npm run lint exits 0 on current rerun-validator.js (sanity check — no false positives)',
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
    'npm run lint blocks src/ imports in rerun-validator.js (RERUN-04 independence claim)',
    () => {
      // Read original content BEFORE the try block so it is available in
      // the finally clause even if fs.readFileSync throws.
      const originalContent = fs.readFileSync(RERUN_VALIDATOR_PATH, 'utf8');

      let r;
      let output = '';
      try {
        // Inject a forbidden import immediately after the first existing import
        // line. The pattern `../../../src/` is explicitly listed in the group
        // array of the no-restricted-imports rule — this matches exactly.
        const violatingContent = originalContent.replace(
          /^(import.*\n)/m,
          '$1import "../../../src/shared/matching.js";\n',
        );
        fs.writeFileSync(RERUN_VALIDATOR_PATH, violatingContent);

        r = spawnSync('npm', ['run', 'lint'], {
          encoding: 'utf8',
          timeout: 60000,
          cwd: path.resolve(__dirname, '../../..'),
        });
        output = (r.stdout || '') + (r.stderr || '');
      } finally {
        // CRITICAL: restore is INSIDE finally — runs whether or not
        // the assertions above threw.
        fs.writeFileSync(RERUN_VALIDATOR_PATH, originalContent);
      }

      // Lint MUST fail when a forbidden import is present.
      expect(r.status).not.toBe(0);

      // The rule's message must appear in the lint output.
      expect(output).toMatch(/RERUN-04|rerun-validator\.js must not import from src\//i);

      // Paranoid self-check: verify the file was restored to exact original bytes.
      expect(fs.readFileSync(RERUN_VALIDATOR_PATH, 'utf8')).toBe(originalContent);
    },
    90000,
  );
});

// tests/unit/fix-primitives.test.js
//
// Phase 12 Plan 01 Task 1 (TDD RED/GREEN) — behavior + purity pins for
// fix-primitives.js (D-02, COST-04, T-12-02, T-12-03).
//
// Coverage map:
//   parseFencedDiff:
//     1. single valid fence block → {ok:true, diff}
//     2. no fences at all → {ok:false, reason:'no-fences'}
//     3. two start fences → {ok:false, reason:'multiple-diff-blocks'}
//     4. mismatched fence counts → {ok:false, reason:'unbalanced-fences'}
//     5. non-string input (42) → {ok:false, reason:'non-string-llm-text'}
//   changedPathsFromDiff:
//     6. strips 'b/' prefix, skips '/dev/null', dedupes repeated +++ headers
//     7. null input → []
//   re-exported constants:
//     8. DIFF_FENCE_START === '===DIFF_START==='
//     9. DIFF_FENCE_END === '===DIFF_END==='
//   purity pin:
//     10. source text of fix-primitives.js does NOT contain forbidden imports

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseFencedDiff,
  changedPathsFromDiff,
  DIFF_FENCE_START,
  DIFF_FENCE_END,
} from '../e2e/lib/fix-primitives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIMITIVES_PATH = path.resolve(__dirname, '../e2e/lib/fix-primitives.js');

// ---------------------------------------------------------------------------
// parseFencedDiff
// ---------------------------------------------------------------------------

describe('parseFencedDiff', () => {
  it('1. single valid fence block → {ok:true, diff}', () => {
    const llmText = `some preamble\n${DIFF_FENCE_START}\ndiff --git a/foo.js b/foo.js\n--- a/foo.js\n+++ b/foo.js\n@@ -1 +1 @@\n-old\n+new\n${DIFF_FENCE_END}\nsome epilogue`;
    const result = parseFencedDiff(llmText);
    expect(result.ok).toBe(true);
    expect(result.diff).toContain('diff --git');
    expect(result.diff).toContain('+new');
  });

  it('2. no fences at all → {ok:false, reason:no-fences}', () => {
    const result = parseFencedDiff('no fences here');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-fences');
  });

  it('3. two start fences (multiple diff blocks) → {ok:false, reason:multiple-diff-blocks}', () => {
    const llmText = `${DIFF_FENCE_START}\ndiff1\n${DIFF_FENCE_END}\n${DIFF_FENCE_START}\ndiff2\n${DIFF_FENCE_END}`;
    const result = parseFencedDiff(llmText);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('multiple-diff-blocks');
  });

  it('4. mismatched fence counts (2 starts, 1 end) → {ok:false, reason:unbalanced-fences}', () => {
    // unbalanced-fences: startMatches.length !== endMatches.length, neither is 0
    const llmText = `${DIFF_FENCE_START}\ndiff1\n${DIFF_FENCE_END}\n${DIFF_FENCE_START}\ndiff2\n`;
    const result = parseFencedDiff(llmText);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unbalanced-fences');
  });

  it('5. non-string input (42) → {ok:false, reason:non-string-llm-text}', () => {
    const result = parseFencedDiff(42);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('non-string-llm-text');
  });
});

// ---------------------------------------------------------------------------
// changedPathsFromDiff
// ---------------------------------------------------------------------------

describe('changedPathsFromDiff', () => {
  it('6. strips b/ prefix, skips /dev/null, dedupes repeated +++ headers', () => {
    const diff = [
      'diff --git a/src/foo.js b/src/foo.js',
      '--- a/src/foo.js',
      '+++ b/src/foo.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/src/bar.js b/src/bar.js',
      '--- /dev/null',
      '+++ b/src/bar.js',
      '@@ -0,0 +1 @@',
      '+new file',
      'diff --git a/deleted.js b/deleted.js',
      '--- a/deleted.js',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
      // Duplicate header for foo.js to test dedup
      '+++ b/src/foo.js',
    ].join('\n');
    const result = changedPathsFromDiff(diff);
    expect(result).toContain('src/foo.js');
    expect(result).toContain('src/bar.js');
    // /dev/null must be excluded
    expect(result).not.toContain('/dev/null');
    // No duplicates
    expect(result.filter(p => p === 'src/foo.js').length).toBe(1);
  });

  it('7. null input → []', () => {
    expect(changedPathsFromDiff(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Re-exported constants
// ---------------------------------------------------------------------------

describe('DIFF_FENCE_START/END constants', () => {
  it('8. DIFF_FENCE_START === ===DIFF_START===', () => {
    expect(DIFF_FENCE_START).toBe('===DIFF_START===');
  });

  it('9. DIFF_FENCE_END === ===DIFF_END===', () => {
    expect(DIFF_FENCE_END).toBe('===DIFF_END===');
  });
});

// ---------------------------------------------------------------------------
// Purity pin — T-12-02 (D-04: no I/O in the shared primitive)
// ---------------------------------------------------------------------------

describe('fix-primitives.js purity pin', () => {
  it('10. source text does NOT contain forbidden imports (node:fs, node:child_process, node:path, @anthropic-ai/sdk)', () => {
    const src = readFileSync(PRIMITIVES_PATH, 'utf8');
    // Strip single-line comments before checking to avoid false positives on comment text
    const nonCommentLines = src
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join('\n');
    expect(nonCommentLines).not.toContain('node:fs');
    expect(nonCommentLines).not.toContain('node:child_process');
    expect(nonCommentLines).not.toContain('node:path');
    expect(nonCommentLines).not.toContain('@anthropic-ai/sdk');
  });
});

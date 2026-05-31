// tests/unit/codeowners.test.js
//
// Phase 39 (CLEANUP-04 initial setup) — static-grep guard that .github/CODEOWNERS
// pins the 5 locked paths to @tonyrowles. Phase 47 CLEANUP-04 re-audit reads
// this same file + executes this test; drift trips both gates.
//
// Rationale: PITFALLS.md Pitfall 4 — a CODEOWNERS owner mismatch silently
// disables "Require review from Code Owners" branch protection. This test
// pins the exact GitHub login string @tonyrowles (verified 2026-05-30 via
// `gh api user --jq .login`).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CODEOWNERS_PATH = path.join(REPO_ROOT, '.github', 'CODEOWNERS');

const LOCKED_PATHS = [
  '/src/',
  '/tests/',
  '/.github/workflows/',
  '/tests/golden/',
  '/tests/e2e/test-cases-quarantine.js',
];
const LOCKED_OWNER = '@tonyrowles';
const FORBIDDEN_ALIASES = ['@TR', '@fatduck'];

describe('Phase 39 CLEANUP-04: .github/CODEOWNERS contents pinned', () => {
  it('Test 1: .github/CODEOWNERS file exists at canonical path', () => {
    expect(fs.existsSync(CODEOWNERS_PATH)).toBe(true);
  });

  it('Test 2: every locked path appears as a line prefix', () => {
    const text = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const p of LOCKED_PATHS) {
      const found = lines.some((ln) => ln.startsWith(p));
      expect(found, `expected line beginning with "${p}" in CODEOWNERS`).toBe(true);
    }
  });

  it('Test 3: every locked path is followed by @tonyrowles (the verified login)', () => {
    const text = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const p of LOCKED_PATHS) {
      const match = lines.find((ln) => ln.startsWith(p));
      expect(match, `path ${p} must be present`).toBeDefined();
      // owner is the LAST whitespace-separated token on the line
      const tokens = match.trim().split(/\s+/);
      expect(tokens[tokens.length - 1]).toBe(LOCKED_OWNER);
    }
  });

  it('Test 4: file contains exactly one owner across all path lines', () => {
    const text = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    const owners = text
      .split(/\r?\n/)
      .filter((ln) => ln && !ln.trim().startsWith('#') && ln.trim().length > 0)
      .map((ln) => ln.trim().split(/\s+/).slice(1))
      .flat();
    const unique = [...new Set(owners)];
    expect(unique).toEqual([LOCKED_OWNER]);
  });

  it('Test 5: forbidden aliases (@TR, @fatduck) are absent', () => {
    const text = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    for (const alias of FORBIDDEN_ALIASES) {
      expect(
        text.includes(alias),
        `${alias} is a documentation alias, NOT a GitHub login — see Pitfall 4`,
      ).toBe(false);
    }
  });

  it('Test 6: file is at .github/CODEOWNERS, NOT root or docs/', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'CODEOWNERS'))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, 'docs', 'CODEOWNERS'))).toBe(false);
  });

  it('Test 7: exactly 5 non-comment non-empty path lines', () => {
    const text = fs.readFileSync(CODEOWNERS_PATH, 'utf8');
    const pathLines = text
      .split(/\r?\n/)
      .filter((ln) => ln && !ln.trim().startsWith('#') && ln.trim().length > 0);
    expect(pathLines.length).toBe(5);
  });
});

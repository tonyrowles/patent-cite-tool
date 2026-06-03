// tests/unit/package-lock-pinned.test.js
//
// Phase 47 INT-FIX-LOCK — Static-grep test that pins @anthropic-ai/sdk
// to EXACT version 0.100.1 (no caret) in BOTH package.json and
// package-lock.json. Defends against:
//
//   (a) Manual package.json edit to "^0.100.1" + npm install rewriting
//       the lockfile to a newer 0.100.x or 0.x release.
//   (b) Dependabot/renovate-style auto-update slipping through review.
//   (c) Merge-conflict resolution that reverts to "^".
//
// Layered defense beyond CI's `npm ci` (which catches package.json ↔
// lockfile mismatch but not manual lockfile edits or a re-pin that
// matches a bumped package.json).
//
// Pattern reuses tests/unit/llm-ledger.test.js Test 49 (static-grep
// on .gitignore for LEDGER-04 commitment). See 47-RESEARCH.md
// §"INT-FIX-LOCK — grep pattern" lines 622-641 and Pattern 3.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('INT-FIX-LOCK: @anthropic-ai/sdk EXACT 0.100.1 pin survives in package.json + package-lock.json', () => {
  it('package.json pins @anthropic-ai/sdk to EXACT 0.100.1 — no caret', () => {
    const pkg = fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8');
    expect(pkg).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
    expect(pkg).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
  });

  it('package-lock.json devDependencies block pins @anthropic-ai/sdk EXACT 0.100.1', () => {
    const lock = fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8');
    expect(lock).toMatch(/"@anthropic-ai\/sdk":\s*"0\.100\.1"/);
    expect(lock).not.toMatch(/"@anthropic-ai\/sdk":\s*"\^/);
  });

  it('package-lock.json node_modules entry resolves @anthropic-ai/sdk to version 0.100.1', () => {
    const lock = fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8');
    expect(lock).toMatch(/"node_modules\/@anthropic-ai\/sdk":\s*\{[^}]*"version":\s*"0\.100\.1"/s);
  });

  it('package-lock.json @anthropic-ai/sdk resolved URL points to 0.100.1 tarball', () => {
    const lock = fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8');
    // Catches version drift even when the caret-negative + version-string
    // assertions are spoofed (e.g., a 0.100.1-tagged release that actually
    // resolves to a different tarball).
    expect(lock).toContain('sdk-0.100.1.tgz');
  });
});

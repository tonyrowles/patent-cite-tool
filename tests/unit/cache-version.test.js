/**
 * Cache-version invariant guard test.
 *
 * Phase 23 (v2.3) hardens the position-map cache by bumping
 * CACHE_VERSION from 'v2' to 'v3'. The constant is duplicated at two
 * client sites (src/offscreen/offscreen.js for Chrome MV3 and
 * src/firefox/pdf-pipeline.js for the Firefox port). If they drift,
 * one browser will serve stale position maps while the other re-parses.
 *
 * This test is a static-grep guard: it reads both files and asserts
 * the literal `const CACHE_VERSION = 'vN';` line is present and
 * identical in both. Any future bump must touch both files.
 *
 * See: .planning/phases/23-column-inference-for-headerless-pdfs/23-RESEARCH.md
 *      (Common Pitfalls #1)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(__filename, '../../..');

const CHROME_PATH = resolve(ROOT, 'src/offscreen/offscreen.js');
const FIREFOX_PATH = resolve(ROOT, 'src/firefox/pdf-pipeline.js');

// Extracts the CACHE_VERSION literal from a source file.
// Returns the version string (e.g. 'v3') or throws if not found.
function extractCacheVersion(filePath) {
  const source = readFileSync(filePath, 'utf-8');
  // Matches: const CACHE_VERSION = 'vN';
  const match = source.match(/^const\s+CACHE_VERSION\s*=\s*'(v\d+)'\s*;/m);
  if (!match) {
    throw new Error(`CACHE_VERSION declaration not found in ${filePath}`);
  }
  return match[1];
}

describe('CACHE_VERSION invariant (Phase 23 / ACCY-05)', () => {
  it('Chrome offscreen.js declares CACHE_VERSION', () => {
    expect(() => extractCacheVersion(CHROME_PATH)).not.toThrow();
  });

  it('Firefox pdf-pipeline.js declares CACHE_VERSION', () => {
    expect(() => extractCacheVersion(FIREFOX_PATH)).not.toThrow();
  });

  it('Chrome and Firefox CACHE_VERSION are identical (no skew)', () => {
    const chromeVer = extractCacheVersion(CHROME_PATH);
    const firefoxVer = extractCacheVersion(FIREFOX_PATH);
    expect(firefoxVer).toBe(chromeVer);
  });

  it("CACHE_VERSION is 'v3' for Phase 23 (column inference cache bust)", () => {
    // Phase 23 ratifies CACHE_VERSION='v3' as the post-fix value.
    // If this fails because a later phase bumped to 'v4' (or higher),
    // update the expected value below AND ensure both files were bumped.
    expect(extractCacheVersion(CHROME_PATH)).toBe('v3');
    expect(extractCacheVersion(FIREFOX_PATH)).toBe('v3');
  });
});

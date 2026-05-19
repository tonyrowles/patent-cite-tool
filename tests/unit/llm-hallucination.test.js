// tests/unit/llm-hallucination.test.js
//
// Phase 31 (LLM-03) — coverage for the hallucination guard module.
//
// Tests cover:
//   1-4: wsNorm / tightNorm primitives and verbatim selectionInSpec match
//   5-6: tightNorm fallback path (cross-column / wrap text)
//   7:   definite hallucination rejection
//   8:   empty needle is treated as a guard failure
//   9:   extractSpecText against the real cached PDF (Phase 28's US11427642.pdf)
//   10:  in-process cache hit (second call must not re-read PDF)
//   11:  density heuristic skips low-density leading pages (bodyStartPage > 1)
//   12:  _clearSpecCache resets the in-process cache
//
// Test 9-12 prerequisite: tests/e2e/.pdf-cache/US11427642.pdf must exist (Phase
// 28 populates it). If absent, those tests fall back to .skip with a clear
// reason rather than failing — the unit suite must still run on a fresh check-
// out before Phase 28 fixtures are warmed.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  wsNorm,
  tightNorm,
  selectionInSpec,
  extractSpecText,
  _clearSpecCache,
} from '../e2e/lib/llm-hallucination.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CACHED_PDF = path.join(PROJECT_ROOT, 'tests/e2e/.pdf-cache/US11427642.pdf');
const PDF_AVAILABLE = fs.existsSync(CACHED_PDF);
const itIfPdf = PDF_AVAILABLE ? it : it.skip;

beforeEach(() => {
  _clearSpecCache();
});

describe('tests/e2e/lib/llm-hallucination.js — wsNorm / tightNorm primitives', () => {
  it('Test 1a: wsNorm collapses runs of whitespace, trims, lowercases', () => {
    expect(wsNorm('  Hello   World  ')).toBe('hello world');
    expect(wsNorm('Pro grammable  device')).toBe('pro grammable device');
  });

  it('Test 1b: tightNorm strips ALL non-alphanumeric and lowercases', () => {
    expect(tightNorm('Pro grammable!')).toBe('programmable');
    expect(tightNorm('Hello, World 2026.')).toBe('helloworld2026');
  });

  it('Test 1c: wsNorm/tightNorm null and undefined are safe', () => {
    expect(wsNorm(null)).toBe('');
    expect(wsNorm(undefined)).toBe('');
    expect(tightNorm(null)).toBe('');
    expect(tightNorm(undefined)).toBe('');
  });
});

describe('tests/e2e/lib/llm-hallucination.js — selectionInSpec', () => {
  it('Test 2: verbatim selection returns { found: true, method: "wsNorm" }', () => {
    const r = selectionInSpec('The quick brown fox jumps', 'brown fox');
    expect(r.found).toBe(true);
    expect(r.method).toBe('wsNorm');
    expect(typeof r.needleIndex).toBe('number');
  });

  it('Test 3: whitespace tolerance — multiple spaces collapse to one (wsNorm)', () => {
    const r = selectionInSpec('The quick brown   fox jumps', 'brown fox');
    expect(r.found).toBe(true);
    expect(r.method).toBe('wsNorm');
  });

  it('Test 4: case insensitive', () => {
    const r = selectionInSpec('The Quick Brown Fox', 'brown fox');
    expect(r.found).toBe(true);
    expect(r.method).toBe('wsNorm');
  });

  it('Test 5: tightNorm fallback when wsNorm fails (split word)', () => {
    // wsNorm would see 'pro grammable device' vs 'programmable device' — different.
    // tightNorm collapses everything to alphanumeric.
    const r = selectionInSpec('pro grammable device', 'programmable device');
    expect(r.found).toBe(true);
    expect(r.method).toBe('tightNorm');
  });

  it('Test 6: cross-column scenario (extra text before, split word boundary)', () => {
    const spec = 'text on left col... CH3 do mains of classical antibodies';
    const r = selectionInSpec(spec, 'CH3 domains of classical antibodies');
    expect(r.found).toBe(true);
    expect(r.method).toBe('tightNorm');
  });

  it('Test 7: definite hallucination — random unrelated needle returns { found: false }', () => {
    const r = selectionInSpec('The patent describes a method', 'quantum entanglement cryptography');
    expect(r.found).toBe(false);
    expect(r.method).toBe(null);
  });

  it('Test 8: empty needle is a guard failure (protects against empty LLM selection)', () => {
    const r = selectionInSpec('any text', '');
    expect(r.found).toBe(false);
    expect(r.method).toBe(null);
  });
});

describe('tests/e2e/lib/llm-hallucination.js — extractSpecText (real PDF)', () => {
  itIfPdf('Test 9: extracts spec text from cached US11427642.pdf', async () => {
    const out = await extractSpecText('US11427642', { maxPages: 15 });
    expect(out).toBeTruthy();
    expect(typeof out.text).toBe('string');
    expect(out.text.length).toBeGreaterThan(5000);
    expect(out.bodyStartPage).toBeGreaterThanOrEqual(1);
    expect(out.pagesExtracted).toBeGreaterThanOrEqual(1);
    expect(out.totalPages).toBeGreaterThanOrEqual(out.bodyStartPage);
  }, 30_000);

  itIfPdf('Test 10: cache hit — second call returns < 50ms even with fs.readFileSync poisoned', async () => {
    // Warm the cache
    await extractSpecText('US11427642', { maxPages: 15 });

    // Poison fs.readFileSync; if extractSpecText tries to re-read the PDF it
    // will throw. Cache hit must bypass any disk I/O.
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = () => { throw new Error('readFileSync_poisoned'); };
    try {
      const t0 = Date.now();
      const out = await extractSpecText('US11427642', { maxPages: 15 });
      const elapsed = Date.now() - t0;
      expect(out).toBeTruthy();
      expect(out.text.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(50);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  }, 30_000);

  itIfPdf('Test 11: density heuristic — high minBodyChars skips dense pages until threshold met', async () => {
    // Empirically US11427642 page 1 is dense (~5068 chars — abstract + claims
    // summary + references). With the default minBodyChars=500 the heuristic
    // starts at page 1. To exercise the skip path itself we pass a
    // minBodyChars threshold that is GUARANTEED higher than the early pages
    // but lower than the body description pages.
    //
    // Per debug measurement of US11427642 pages 1-10: page 1 = 5068, page 6
    // = 2859, page 7 = 745, page 9 = 2694, page 4 = 9325. A threshold of
    // 6500 forces the skip path (skips pages 1, 2, 5, 6, 7, 8, 9, 10) until
    // it finds a page with >=6500 chars (page 3 = 9247).
    _clearSpecCache(); // ensure no warm cache from prior tests
    const out = await extractSpecText('US11427642', { maxPages: 15, minBodyChars: 6500 });
    // bodyStartPage must be the FIRST page >= 6500 chars. Per debug it's page 3.
    expect(out.bodyStartPage).toBeGreaterThanOrEqual(3);
    expect(out.bodyStartPage).toBeLessThanOrEqual(5);
    expect(out.pagesExtracted).toBeGreaterThan(0);
  }, 30_000);

  itIfPdf('Test 12: _clearSpecCache empties the cache; next call re-reads PDF', async () => {
    await extractSpecText('US11427642', { maxPages: 15 });

    _clearSpecCache();

    // After clear, the cache must be empty: poisoning fs.readFileSync must
    // cause the next extract to throw (proving disk I/O happened).
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = () => { throw new Error('readFileSync_poisoned'); };
    try {
      await expect(extractSpecText('US11427642', { maxPages: 15 })).rejects.toThrow(/poisoned/);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  }, 30_000);
});

#!/usr/bin/env node
/**
 * debug-selection-roundtrip.mjs
 *
 * Mounts the Patent Cite extension against a real Google Patents page,
 * runs the EXACT selectText algorithm from tests/e2e/lib/selection.js,
 * and prints `got` vs `expected` when the round-trip check fails.
 *
 * Diagnostic-only — not part of the test suite. Used to debug the three
 * cases failing Plan 27-07 (gap closure) where the pure-Node simulator
 * says OK but the live browser says SELECTION_FAILED — roundtrip mismatch.
 *
 * Usage:
 *   node scripts/debug-selection-roundtrip.mjs US5440748 "1. Computer system ..."
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_PATH = path.resolve(__dirname, '..', 'dist', 'chrome');

async function main() {
  const patentId = process.argv[2];
  const needle = process.argv[3];
  if (!patentId || !needle) {
    console.error('usage: node debug-selection-roundtrip.mjs <patentId> <needle>');
    process.exit(2);
  }
  const userDir = await mkdtemp(join(tmpdir(), 'pct-debug-'));
  const context = await chromium.launchPersistentContext(userDir, {
    headless: true,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(`https://patents.google.com/patent/${patentId}/en`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    // Wait for hydration
    await page.waitForFunction(
      () => {
        const claims = document.querySelector('section[itemprop="claims"]')
          || document.querySelector('section#claims');
        const desc = document.querySelector('section[itemprop="description"]')
          || document.querySelector('section#description');
        return claims && desc && (claims.textContent || '').length > 200;
      },
      null,
      { timeout: 20000 },
    );

    const result = await page.evaluate(({ needle }) => {
      const normalize = (s) =>
        s
          .replace(/\s+/g, ' ')
          .replace(/\s*-\s*/g, '-')
          .replace(/\s+([,;:])/g, '$1')
          .trim();
      const normalizeDeep = (s) =>
        normalize(s).replace(
          /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
          '$1$2',
        );
      const CONTAINERS = [
        'section#description',
        'section#claims',
        'section[itemprop="description"]',
        'section[itemprop="claims"]',
        'patent-result',
        'main',
        'body',
      ];
      const normalizedNeedleBasic = normalize(needle);
      const normalizedNeedleDeep = normalizeDeep(needle);
      let container = null;
      let containerSelector = null;
      let usedDeep = false;
      for (const sel of CONTAINERS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text = el.textContent || '';
        if (normalize(text).includes(normalizedNeedleBasic)) {
          container = el;
          containerSelector = sel;
          usedDeep = false;
          break;
        }
        if (normalizeDeep(text).includes(normalizedNeedleDeep)) {
          container = el;
          containerSelector = sel;
          usedDeep = true;
          break;
        }
      }
      if (!container) return { ok: false, error: 'DOM_DRIFT' };

      // Inline the full walker + round-trip logic
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const rawTexts = [];
      const nodeList = [];
      let n;
      while ((n = walker.nextNode())) {
        rawTexts.push(n.nodeValue || '');
        nodeList.push(n);
      }
      let flat = '';
      const flatNodeIdx = [];
      const flatNodeOffset = [];
      for (let n = 0; n < rawTexts.length; n++) {
        const r = rawTexts[n];
        for (let j = 0; j < r.length; j++) {
          flat += r[j];
          flatNodeIdx.push(n);
          flatNodeOffset.push(j);
        }
      }
      const normFromFlat = new Array(flat.length).fill(-1);
      let normCursor = 0;
      let inWhitespaceRun = false;
      for (let i = 0; i < flat.length; i++) {
        const c = flat[i];
        if (/\s/.test(c)) {
          let k = i;
          while (k < flat.length && /\s/.test(flat[k])) k++;
          const followChar = k < flat.length ? flat[k] : '';
          if (followChar === '-' || /[,;:]/.test(followChar)) {
            i = k - 1;
            inWhitespaceRun = false;
            continue;
          }
          if (!inWhitespaceRun && normCursor > 0) {
            normFromFlat[i] = normCursor;
            normCursor++;
            inWhitespaceRun = true;
          }
        } else if (c === '-') {
          normFromFlat[i] = normCursor;
          normCursor++;
          inWhitespaceRun = false;
          let k = i + 1;
          while (k < flat.length && /\s/.test(flat[k])) {
            normFromFlat[k] = -1;
            k++;
          }
          i = k - 1;
        } else {
          inWhitespaceRun = false;
          normFromFlat[i] = normCursor;
          normCursor++;
        }
      }
      const haystackBasic = normalize(container.textContent || '');
      let startNormIdx = haystackBasic.indexOf(normalizedNeedleBasic);
      let endNormIdx = -1;
      if (startNormIdx >= 0) {
        endNormIdx = startNormIdx + normalizedNeedleBasic.length;
      } else if (usedDeep) {
        const haystackDeep = normalizeDeep(container.textContent || '');
        const deepStart = haystackDeep.indexOf(normalizedNeedleDeep);
        if (deepStart < 0) return { ok: false, error: 'DEEP_INCONSISTENT' };
        const deepEnd = deepStart + normalizedNeedleDeep.length;
        const strippedSpacePositions = new Set();
        const re = /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g;
        let m;
        while ((m = re.exec(haystackBasic)) !== null) {
          strippedSpacePositions.add(m.index + 1);
          re.lastIndex = m.index + 1;
        }
        let basicIdx = 0;
        let deepIdx = 0;
        let basicStart = -1;
        let basicEnd = -1;
        while (basicIdx <= haystackBasic.length) {
          if (deepIdx === deepStart && basicStart === -1) basicStart = basicIdx;
          if (deepIdx === deepEnd && basicEnd === -1) {
            basicEnd = basicIdx;
            break;
          }
          if (basicIdx === haystackBasic.length) break;
          if (strippedSpacePositions.has(basicIdx)) basicIdx++;
          else {
            basicIdx++;
            deepIdx++;
          }
        }
        startNormIdx = basicStart;
        endNormIdx = basicEnd;
      } else {
        return { ok: false, error: 'INCONSISTENT_WALK' };
      }

      function locate(normIdx) {
        if (normIdx === normCursor) {
          if (nodeList.length === 0) return null;
          const lastN = nodeList.length - 1;
          return { node: nodeList[lastN], offset: rawTexts[lastN].length };
        }
        for (let i = 0; i < flat.length; i++) {
          if (normFromFlat[i] === normIdx) {
            return { node: nodeList[flatNodeIdx[i]], offset: flatNodeOffset[i] };
          }
        }
        return null;
      }
      const startLoc = locate(startNormIdx);
      const endLoc = locate(endNormIdx);
      if (!startLoc || !endLoc) return { ok: false, error: 'LOCATE_FAIL' };
      const range = document.createRange();
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const got = sel.toString();
      const gotBasic = normalize(got);
      const gotDeep = normalizeDeep(got);
      const expectedBasic = normalize(needle);
      const expectedDeep = normalizeDeep(needle);
      const roundTripOk = usedDeep
        ? gotDeep === expectedDeep
        : gotBasic === expectedBasic;

      // Diff: find first index where they differ
      const a = usedDeep ? gotDeep : gotBasic;
      const b = usedDeep ? expectedDeep : expectedBasic;
      let diffIdx = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) { diffIdx = i; break; }
      }

      return {
        ok: roundTripOk,
        containerSelector,
        usedDeep,
        startNormIdx,
        endNormIdx,
        gotRaw: got,
        gotNorm: a,
        expectedNorm: b,
        gotLen: a.length,
        expectedLen: b.length,
        diffIdx,
        diffGotChunk: a.slice(Math.max(0, diffIdx - 20), diffIdx + 60),
        diffExpChunk: b.slice(Math.max(0, diffIdx - 20), diffIdx + 60),
      };
    }, { needle });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
    await rm(userDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

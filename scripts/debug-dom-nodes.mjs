#!/usr/bin/env node
/**
 * Dump live text nodes around a marker substring.
 * usage: node scripts/debug-dom-nodes.mjs <patentId> <marker>
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
  const marker = process.argv[3];
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
    await page.waitForFunction(
      () => {
        const claims = document.querySelector('section[itemprop="claims"]')
          || document.querySelector('section#claims');
        return claims && (claims.textContent || '').length > 200;
      },
      null,
      { timeout: 20000 },
    );
    const result = await page.evaluate(({ marker }) => {
      const CONTAINERS = [
        'section#description',
        'section#claims',
        'section[itemprop="description"]',
        'section[itemprop="claims"]',
      ];
      const out = {};
      for (const sel of CONTAINERS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n.nodeValue);
        // Find marker location in concat
        const flat = nodes.join('');
        const idx = flat.indexOf(marker);
        if (idx < 0) {
          out[sel] = { found: false, totalLen: flat.length };
          continue;
        }
        // Find node containing the marker
        let acc = 0;
        let firstNode = -1;
        for (let i = 0; i < nodes.length; i++) {
          if (idx >= acc && idx < acc + nodes[i].length) {
            firstNode = i;
            break;
          }
          acc += nodes[i].length;
        }
        // Show 5 nodes before, marker node, 10 after
        const start = Math.max(0, firstNode - 5);
        const end = Math.min(nodes.length, firstNode + 15);
        const slice = [];
        for (let i = start; i < end; i++) {
          slice.push({ i, val: nodes[i] });
        }
        out[sel] = { found: true, firstNode, nodes: slice };
      }
      return out;
    }, { marker });
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

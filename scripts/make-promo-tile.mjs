#!/usr/bin/env node
//
// scripts/make-promo-tile.mjs — generate the Chrome Web Store promo tile (exactly 440x280).
//
// The promo tile is a static brand graphic (icon + name + tagline on the brand blue),
// so we render it deterministically with Playwright (already a dev dep) instead of a
// design tool. Output: store-assets/promo-tile-440x280.png.
//
//   node scripts/make-promo-tile.mjs

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const icon = readFileSync(join(ROOT, 'src/icons/icon-active-128.png')).toString('base64');
const OUT = join(ROOT, 'store-assets/promo-tile-440x280.png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  .tile{width:440px;height:280px;box-sizing:border-box;
    background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff}
  .tile img{width:104px;height:104px;margin-bottom:18px;
    filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))}
  .title{font-size:27px;font-weight:700;letter-spacing:.2px}
  .tag{font-size:14px;color:#bfdbfe;margin-top:8px}
</style></head><body>
  <div class="tile">
    <img src="data:image/png;base64,${icon}" alt="">
    <div class="title">Patent Citation Tool</div>
    <div class="tag">Column / line citations on Google Patents</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 440, height: 280 } });
await browser.close();
console.log(`✓ wrote ${OUT}`);

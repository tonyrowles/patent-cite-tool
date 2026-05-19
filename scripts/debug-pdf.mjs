/**
 * Debug script: extract text items from a patent PDF and run through
 * extractPrintedColumnNumbers + buildPositionMap to diagnose column issues.
 *
 * Usage: node scripts/debug-pdf.mjs /tmp/US10203551.pdf
 */

import { readFileSync } from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  extractPrintedColumnNumbers,
  buildPositionMap,
  isTwoColumnPage,
} from '../src/offscreen/position-map-builder.js';

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node scripts/debug-pdf.mjs <path-to-pdf>');
  process.exit(1);
}

const pdfData = new Uint8Array(readFileSync(pdfPath));
const pdf = await getDocument({ data: pdfData, useSystemFonts: true }).promise;

console.log(`Pages: ${pdf.numPages}\n`);

const pageResults = [];

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  const pageHeight = viewport.height;
  const pageWidth = viewport.width;

  const items = textContent.items
    .filter(item => item.str && item.str.trim().length > 0)
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }));

  const twoCol = isTwoColumnPage(items, pageWidth);
  const colNums = extractPrintedColumnNumbers(items, pageHeight, pageWidth);
  const headerThreshold = pageHeight - 90;
  const bodyItems = items.filter(it => it.y > 40 && it.y < headerThreshold);
  const headerText = items.filter(it => it.y >= headerThreshold).map(it => it.text).join(' ');

  console.log(`Page ${i}: twoCol=${twoCol} colNums=${JSON.stringify(colNums)} bodyItems=${bodyItems.length} header="${headerText.substring(0, 80)}"`);

  // Only dump detail for spec pages (8+)
  if (i >= 8) {
    console.log(`\n=== Page ${i} (${pageWidth}x${pageHeight}) twoCol=${twoCol} ===`);
    console.log(`  headerThreshold (y>=): ${headerThreshold}`);

    // Show items in top 120pt of page (PDF y coords: higher = higher on page)
    const topItems = items.filter(it => it.y >= pageHeight - 120).sort((a, b) => b.y - a.y || a.x - b.x);
    console.log(`  Items in top 120pt of page (y >= ${pageHeight - 120}):`);
    for (const h of topItems) {
      const inHeader = h.y >= headerThreshold ? ' [IN HEADER ZONE]' : '';
      const isNum = /^\d{1,3}$/.test(h.text.trim()) ? ' [MATCHES NUM REGEX]' : '';
      console.log(`    y=${h.y.toFixed(1)} x=${h.x.toFixed(1)} w=${h.width.toFixed(1)} "${h.text}"${inHeader}${isNum}`);
    }

    // Also show bottom items (in case column numbers are at page bottom)
    const bottomItems = items.filter(it => it.y <= 80).sort((a, b) => a.y - b.y || a.x - b.x);
    if (bottomItems.length > 0) {
      console.log(`  Items in bottom 80pt of page (y <= 80):`);
      for (const h of bottomItems) {
        const isNum = /^\d{1,3}$/.test(h.text.trim()) ? ' [MATCHES NUM REGEX]' : '';
        console.log(`    y=${h.y.toFixed(1)} x=${h.x.toFixed(1)} w=${h.width.toFixed(1)} "${h.text}"${isNum}`);
      }
    }

    console.log(`  extractPrintedColumnNumbers => ${JSON.stringify(colNums)}`);
  }

  pageResults.push({ pageNum: i, items, pageWidth, pageHeight });
}

console.log('\n--- buildPositionMap results ---');
const entries = buildPositionMap(pageResults);
const columns = [...new Set(entries.map(e => e.column))].sort((a, b) => a - b);
console.log(`Total entries: ${entries.length}`);
console.log(`Columns found: ${columns.join(', ')}`);

if (columns.some(c => c > 50)) {
  console.log('\n*** WARNING: Suspicious column numbers detected! ***');
  const suspicious = entries.filter(e => e.column > 50);
  for (const e of suspicious.slice(0, 5)) {
    console.log(`  page=${e.page} col=${e.column} line=${e.lineNumber} text="${e.text.substring(0, 60)}..."`);
  }
}

pdf.destroy();

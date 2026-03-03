/**
 * generate-icons.mjs
 * Generates all 12 icon PNGs (3 states x 4 sizes) from the source SVG.
 *
 * Usage: node scripts/generate-icons.mjs
 *   or:  npm run generate-icons
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const sourcesvgPath = resolve(rootDir, 'src/icons/icon-source.svg');
const outputDir = resolve(rootDir, 'src/icons');

// Read source SVG
const sourceSvg = readFileSync(sourcesvgPath, 'utf8');

// Color schemes per icon state — distinct at 16px, visually cohesive
const colorSchemes = {
  active: {
    primary: '#2563eb',   // Vibrant blue - ready to cite
    accent: '#f59e0b',    // Amber highlight - citation marker
    detail: '#1e3a8a',    // Dark navy - text lines
  },
  inactive: {
    primary: '#94a3b8',   // Slate gray - clearly inactive
    accent: '#cbd5e1',    // Light slate accent
    detail: '#e2e8f0',    // Pale slate details
  },
  partial: {
    primary: '#d97706',   // Warm amber - in-progress
    accent: '#fbbf24',    // Gold highlight
    detail: '#78350f',    // Deep brown - text lines
  },
};

// Sizes to generate
const sizes = [16, 32, 48, 128];

/**
 * Apply a color scheme to the SVG source by replacing CSS class fill values.
 * Uses string replacement rather than sharp's svg.stylesheet option
 * to avoid librsvg version dependency issues.
 */
function applyColorScheme(svgString, scheme) {
  return svgString
    .replace(/\.icon-primary\s*\{[^}]*\}/g, `.icon-primary { fill: ${scheme.primary}; }`)
    .replace(/\.icon-accent\s*\{[^}]*\}/g, `.icon-accent { fill: ${scheme.accent}; }`)
    .replace(/\.icon-detail\s*\{[^}]*\}/g, `.icon-detail { fill: ${scheme.detail}; }`);
}

async function generateAll() {
  let count = 0;

  for (const [state, scheme] of Object.entries(colorSchemes)) {
    const modifiedSvg = applyColorScheme(sourceSvg, scheme);
    const svgBuffer = Buffer.from(modifiedSvg);

    for (const size of sizes) {
      const outputPath = resolve(outputDir, `icon-${state}-${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Generated: icon-${state}-${size}.png`);
      count++;
    }
  }

  console.log(`\nDone: ${count} icons generated in src/icons/`);
}

generateAll().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});

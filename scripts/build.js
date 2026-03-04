/**
 * esbuild build pipeline for the Patent Citation Tool extension.
 *
 * Produces:
 *   dist/chrome/  — IIFE content bundle + ESM background/offscreen + static assets + transformed manifest
 *   dist/firefox/ — Firefox manifest only (JS bundles added in Phase 16)
 *
 * Usage:
 *   node scripts/build.js                  # build both targets
 *   node scripts/build.js --chrome-only    # Chrome target only
 *   node scripts/build.js --firefox-only   # Firefox target only
 *   node scripts/build.js --watch          # watch mode (Chrome only)
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const chromeOnly = args.includes('--chrome-only') || watchMode;
const firefoxOnly = args.includes('--firefox-only');

// ---------------------------------------------------------------------------
// Shared esbuild entry configs
// ---------------------------------------------------------------------------

function getIifeConfig({ sourcemap = false } = {}) {
  return {
    entryPoints: ['src/content/content-script.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/chrome/content/content.js',
    sourcemap,
  };
}

function getEsmConfig({ sourcemap = false } = {}) {
  return {
    entryPoints: [
      'src/background/service-worker.js',
      'src/offscreen/offscreen.js',
      'src/popup/popup.js',
      'src/options/options.js',
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outbase: 'src',
    outdir: 'dist/chrome',
    sourcemap,
    // CRITICAL: prevent esbuild from bundling the 3MB PDF.js library.
    // offscreen.js imports it at runtime from the copied dist/chrome/lib/ directory.
    external: ['../lib/pdf.mjs'],
  };
}

// ---------------------------------------------------------------------------
// Static asset copy
// ---------------------------------------------------------------------------

function copyStaticAssets() {
  fs.cpSync('src/icons', 'dist/chrome/icons', { recursive: true });
  fs.cpSync('src/lib', 'dist/chrome/lib', { recursive: true });

  // HTML files — ensure output directories exist
  fs.mkdirSync('dist/chrome/offscreen', { recursive: true });
  fs.mkdirSync('dist/chrome/popup', { recursive: true });
  fs.mkdirSync('dist/chrome/options', { recursive: true });

  fs.copyFileSync('src/offscreen/offscreen.html', 'dist/chrome/offscreen/offscreen.html');
  fs.copyFileSync('src/popup/popup.html', 'dist/chrome/popup/popup.html');
  fs.copyFileSync('src/options/options.html', 'dist/chrome/options/options.html');
}

// ---------------------------------------------------------------------------
// Manifest transform
// ---------------------------------------------------------------------------

function transformChromeManifest() {
  const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));

  // Replace the 5-file content_scripts array with the single bundled file
  manifest.content_scripts[0].js = ['content/content.js'];

  fs.mkdirSync('dist/chrome', { recursive: true });
  fs.writeFileSync('dist/chrome/manifest.json', JSON.stringify(manifest, null, 2));
}

// ---------------------------------------------------------------------------
// Chrome build
// ---------------------------------------------------------------------------

async function buildChrome({ sourcemaps = false } = {}) {
  const start = Date.now();

  await Promise.all([
    esbuild.build(getIifeConfig({ sourcemap: sourcemaps })),
    esbuild.build(getEsmConfig({ sourcemap: sourcemaps })),
  ]);

  copyStaticAssets();
  transformChromeManifest();

  const elapsed = Date.now() - start;
  console.log(`Built chrome in ${elapsed}ms`);
}

// ---------------------------------------------------------------------------
// Firefox build
// ---------------------------------------------------------------------------

function buildFirefox() {
  const start = Date.now();

  fs.mkdirSync('dist/firefox', { recursive: true });
  fs.copyFileSync('src/manifest.firefox.json', 'dist/firefox/manifest.json');

  const elapsed = Date.now() - start;
  console.log(`Built firefox in ${elapsed}ms`);
}

// ---------------------------------------------------------------------------
// Watch mode (Chrome only)
// ---------------------------------------------------------------------------

async function watchChrome() {
  const [iifeCtx, esmCtx] = await Promise.all([
    esbuild.context(getIifeConfig({ sourcemap: true })),
    esbuild.context(getEsmConfig({ sourcemap: true })),
  ]);

  await Promise.all([
    iifeCtx.watch(),
    esmCtx.watch(),
  ]);

  // Copy static assets and transform manifest once at startup
  copyStaticAssets();
  transformChromeManifest();

  console.log('Watching for changes...');

  // Clean up on exit
  process.on('SIGINT', async () => {
    await Promise.all([iifeCtx.dispose(), esmCtx.dispose()]);
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Clean dist before each build (not in watch mode — esbuild manages output)
  if (!watchMode) {
    fs.rmSync('dist', { recursive: true, force: true });
  }

  if (watchMode) {
    await watchChrome();
  } else if (chromeOnly) {
    await buildChrome();
  } else if (firefoxOnly) {
    buildFirefox();
  } else {
    // Default: build both targets
    await buildChrome();
    buildFirefox();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

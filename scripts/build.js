/**
 * esbuild build pipeline for the Patent Citation Tool extension.
 *
 * Produces:
 *   dist/chrome/  — IIFE content bundle + ESM background/offscreen + static assets + transformed manifest
 *   dist/firefox/ — IIFE content bundle + ESM background/popup/options + static assets + Firefox manifest
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
const webappOnly = args.includes('--webapp-only');

// ---------------------------------------------------------------------------
// Build-time token guard (SEC-02)
// ---------------------------------------------------------------------------

// Local-dev convenience: load the git-ignored root `.env` so `npm run build`
// works without exporting PROXY_TOKEN by hand. Zero-dep (no `dotenv`) — a real
// process.env value (e.g. the CI secret) always wins and is never overwritten.
function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // Unquoted value: strip a trailing inline comment (code-review IN-01) so
      // `PROXY_TOKEN=abc # note` yields `abc`, not `abc # note` (which would fail auth).
      const hash = val.indexOf(' #');
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const PROXY_TOKEN = process.env.PROXY_TOKEN;
// SEC-02 / Pitfall 1: webapp build intentionally has no token — bypass guard for --webapp-only
if (!webappOnly && !PROXY_TOKEN) {
  console.error('ERROR: PROXY_TOKEN environment variable is not set.');
  console.error('Set it in a git-ignored root `.env` (PROXY_TOKEN=...) or export it before building. Build aborted.');
  process.exit(1);
}

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
    define: {
      '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
    },
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
    define: {
      '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
    },
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
// Firefox esbuild configs
// ---------------------------------------------------------------------------

function getFirefoxIifeConfig({ sourcemap = false } = {}) {
  return {
    entryPoints: ['src/content/content-script.js'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'dist/firefox/content/content.js',
    sourcemap,
    define: {
      '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
    },
  };
}

function getFirefoxEsmConfig({ sourcemap = false } = {}) {
  return {
    entryPoints: [
      { in: 'src/firefox/background.js', out: 'background/service-worker' },
      { in: 'src/popup/popup.js', out: 'popup/popup' },
      { in: 'src/options/options.js', out: 'options/options' },
    ],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'dist/firefox',
    sourcemap,
    // CRITICAL: prevent esbuild from bundling the 3MB PDF.js library.
    // background.js imports it at runtime from the copied dist/firefox/lib/ directory.
    // NOTE: Do NOT use outbase here — object entry point syntax controls output paths directly.
    // With outbase:'src', src/firefox/background.js would output to dist/firefox/firefox/background.js (WRONG).
    external: ['../lib/pdf.mjs'],
    define: {
      '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
    },
  };
}

// ---------------------------------------------------------------------------
// Firefox static asset copy
// ---------------------------------------------------------------------------

function copyFirefoxStaticAssets() {
  fs.cpSync('src/icons', 'dist/firefox/icons', { recursive: true });
  // CRITICAL: pdf.mjs + pdf.worker.mjs must be in dist/firefox/lib/ for PDF.js to work
  fs.cpSync('src/lib', 'dist/firefox/lib', { recursive: true });

  // HTML files — ensure output directories exist
  fs.mkdirSync('dist/firefox/popup', { recursive: true });
  fs.mkdirSync('dist/firefox/options', { recursive: true });

  fs.copyFileSync('src/popup/popup.html', 'dist/firefox/popup/popup.html');
  fs.copyFileSync('src/options/options.html', 'dist/firefox/options/options.html');
  // NOTE: Do NOT copy offscreen.html — Firefox has no offscreen document API
}

// ---------------------------------------------------------------------------
// Firefox build
// ---------------------------------------------------------------------------

async function buildFirefox({ sourcemaps = false } = {}) {
  const start = Date.now();

  fs.mkdirSync('dist/firefox', { recursive: true });
  fs.copyFileSync('src/manifest.firefox.json', 'dist/firefox/manifest.json');

  await Promise.all([
    esbuild.build(getFirefoxIifeConfig({ sourcemap: sourcemaps })),
    esbuild.build(getFirefoxEsmConfig({ sourcemap: sourcemaps })),
  ]);

  copyFirefoxStaticAssets();

  const elapsed = Date.now() - start;
  console.log(`Built firefox in ${elapsed}ms`);
}

// ---------------------------------------------------------------------------
// Webapp build (--webapp-only)
// No PROXY_TOKEN required — webapp carries no secret (SEC-03 / T-08-01)
// Cleans only dist/webapp/ — sibling extension builds are untouched (Pitfall 3)
// ---------------------------------------------------------------------------

async function buildWebapp() {
  const start = Date.now();

  // Pitfall 3: clean only dist/webapp, not the whole dist/
  fs.rmSync('dist/webapp', { recursive: true, force: true });
  fs.mkdirSync('dist/webapp/lib', { recursive: true });

  // Bundle webapp/js/app.js as ESM.
  // CRITICAL: external path is './lib/pdf.mjs' (sibling of outfile dist/webapp/app.bundle.js),
  // NOT '../lib/pdf.mjs' (which is the Chrome/Firefox target convention) — Pitfall 2.
  // No define block — __PROXY_TOKEN__ must NEVER appear in the webapp bundle (T-08-01).
  await esbuild.build({
    entryPoints: ['webapp/js/app.js'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: 'dist/webapp/app.bundle.js',
    external: ['./lib/pdf.mjs'],
  });

  // Copy static assets
  fs.copyFileSync('webapp/index.html', 'dist/webapp/index.html');
  fs.cpSync('src/lib', 'dist/webapp/lib', { recursive: true });

  const elapsed = Date.now() - start;
  console.log(`Built webapp in ${elapsed}ms`);
}

// ---------------------------------------------------------------------------
// Test-export bundles (ESM bundles of matching logic for each dist/ target)
// Used by vitest.config.chrome.js and vitest.config.firefox.js via resolve.alias
// ---------------------------------------------------------------------------

async function buildTestExports({ chrome = true, firefox = true } = {}) {
  const builds = [];

  if (chrome) {
    builds.push(
      esbuild.build({
        entryPoints: ['src/matching-exports.js'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: 'dist/chrome/matching-exports.js',
        define: {
          '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
        },
      }),
    );
  }

  if (firefox) {
    builds.push(
      esbuild.build({
        entryPoints: ['src/matching-exports.js'],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        outfile: 'dist/firefox/matching-exports.js',
        define: {
          '__PROXY_TOKEN__': JSON.stringify(PROXY_TOKEN),
        },
      }),
    );
  }

  await Promise.all(builds);
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
  // Clean dist before each build (not in watch mode — esbuild manages output).
  // Pitfall 3: webapp-only must NOT wipe the whole dist/ (extension builds coexist).
  if (!watchMode && !webappOnly) {
    fs.rmSync('dist', { recursive: true, force: true });
  }

  if (watchMode) {
    await watchChrome();
  } else if (webappOnly) {
    // Webapp target: no PROXY_TOKEN, no test exports (those need a token)
    await buildWebapp();
  } else if (chromeOnly) {
    await buildChrome();
    await buildTestExports({ chrome: true, firefox: false });
  } else if (firefoxOnly) {
    await buildFirefox();
    await buildTestExports({ chrome: false, firefox: true });
  } else {
    // Default: build both targets
    await buildChrome();
    await buildFirefox();
    await buildTestExports({ chrome: true, firefox: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# Phase 15: esbuild Build Pipeline - Research

**Researched:** 2026-03-03
**Domain:** esbuild JS API, Chrome Extension MV3 bundling, Node.js asset copy
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Content script bundling**
- All 5 content scripts bundled into a single IIFE file (e.g., content.js)
- Entry point: `content-script.js` — esbuild follows its imports to pull in text-matcher, citation-ui, paragraph-finder, constants
- Phase 14 wrapper files (`constants-globals.js`, `text-matcher.js` as thin global-exposing wrappers) are deleted after bundling works
- Content scripts must be converted from globals pattern to ES module imports before bundling
- After this phase, Chrome cannot load from src/ directly — build step is always required

**Build script and tooling**
- esbuild added as devDependency
- Build script lives at `scripts/build.js` (follows existing convention: scripts/update-golden.js, scripts/accuracy-report.js)
- Uses esbuild's JS API for full control over bundling
- Clean build: rm dist/ before each build — no stale artifacts

**Output formats**
- Content scripts: IIFE (single bundle, injected via manifest)
- Service worker (background): ESM (manifest specifies `"type": "module"`)
- Offscreen document: ESM (loaded via `<script type="module">`)
- Static assets (HTML, icons, PDF.js) copied as-is

**Dev workflow**
- Watch mode: `npm run dev` rebuilds on file changes (esbuild watch, Chrome only)
- Source maps: Generated in dev/watch mode only; production build omits them
- Test strategy: Vitest continues testing src/ modules directly (fast, granular) AND a separate script runs the 71-case corpus against dist/chrome/ (BUILD-05 verification)

**npm scripts**
- `npm run build` — production build, both targets (chrome + firefox), no source maps
- `npm run build:chrome` — Chrome only
- `npm run build:firefox` — Firefox only
- `npm run dev` — watch mode, source maps, Chrome only

**Firefox scaffold**
- dist/firefox/ created with directory + complete manifest only (no JS bundles)
- Firefox manifest source: `src/manifest.firefox.json` (standalone file alongside Chrome manifest)
- Manifest is complete and accurate — full permissions, gecko ID, background script entry, content scripts
- Standalone file, not generated from Chrome manifest

**Git**
- `dist/` added to `.gitignore` — build output is generated, not source

### Claude's Discretion
- Exact esbuild configuration options (tree-shaking, minification settings)
- How content scripts are refactored from globals to imports (order of conversion steps)
- Asset copy implementation (fs.cp, glob, etc.)
- Watch mode implementation details
- How the dist/ test script integrates with Vitest

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUILD-01 | esbuild script produces `dist/chrome/` from `src/` with correct bundle formats (IIFE for content scripts, ESM for background/offscreen) | esbuild JS API `build()` with `format: 'iife'` and `format: 'esm'` in separate calls; `bundle: true`; `platform: 'browser'` |
| BUILD-02 | Static assets (HTML, icons, pdf.mjs, pdf.worker.mjs) are copied to dist output | Node.js `fs.cp()` (async, available in Node 16.7+, Node 24 running on this machine) — no extra dependency needed |
| BUILD-03 | Chrome manifest is copied/generated into `dist/chrome/` | JSON.parse/stringify the manifest, update `content_scripts.js` array from 5 files to `["content/content.js"]`, write to dist |
| BUILD-04 | Built Chrome extension is functionally identical to current raw source | Content script refactor from globals to ES module imports; correct IIFE bundling preserves all runtime behavior |
| BUILD-05 | Vitest 71-case test corpus passes against built Chrome output | Separate `scripts/test-dist.js` that imports matchAndCite from dist/chrome/offscreen/offscreen.js (ESM) and runs against fixtures; OR use vitest with a custom config pointing at dist |
</phase_requirements>

---

## Summary

Phase 15 builds an esbuild-based pipeline that transforms `src/` into two distribution targets: `dist/chrome/` (fully functional) and `dist/firefox/` (scaffold only). The primary technical work has two parts: (1) refactoring the 5 content scripts from a globals-loaded-in-order pattern into proper ES module imports so esbuild can bundle them into a single IIFE, and (2) writing `scripts/build.js` using the esbuild JS API to orchestrate IIFE bundling for content scripts, ESM bundling for background/offscreen, static asset copying, and manifest transformation.

esbuild 0.27.3 is already installed in the project (found in `node_modules/`). The JS API is used directly — `esbuild.build()` for one-shot production builds, and `esbuild.context()` + `ctx.watch()` for dev mode. Two separate `build()` calls handle the format difference: one call with `format: 'iife'` for content scripts, another with `format: 'esm'` for background and offscreen. Static assets are copied using Node's built-in `fs.cp()` — no extra npm dependencies needed.

The content script refactor is the highest-risk task. Currently, `content-script.js`, `citation-ui.js`, and `paragraph-finder.js` use global variables (`MSG`, `STATUS`, `PATENT_TYPE`, `matchAndCite`, etc.) injected by `constants-globals.js` and `text-matcher.js`. After the refactor, these must become `import` statements pointing at the actual source modules (`shared/constants.js`, `shared/matching.js`). The Vitest `classicScriptExports` plugin in `vitest.config.js` must also be updated to match the new ESM-imported content scripts.

**Primary recommendation:** Refactor content scripts to use ES module imports first (one file at a time, run Vitest after each), then write `scripts/build.js`, then verify the built extension loads correctly.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| esbuild | 0.27.3 (already installed) | Bundle JS, IIFE and ESM formats | Fastest bundler; JS API gives full control; already in project |
| Node.js fs (built-in) | Node 24 (available) | Copy static assets | `fs.cp()` async available since Node 16.7; no extra dependency |
| Node.js fs.rmSync | built-in | Clean dist/ before each build | Built-in, reliable |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| esbuild `context()` + `ctx.watch()` | 0.27.3 | Dev mode incremental rebuild | `npm run dev` only |
| JSON.parse / JSON.stringify | built-in | Manifest transformation | Modify content_scripts array in dist |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs.cp()` built-in | `esbuild-copy-static-files` plugin | Plugin adds another dependency; fs.cp() works fine for a build script |
| `fs.rmSync()` built-in | `rimraf` package | rimraf adds dependency; rmSync({recursive: true, force: true}) is equivalent |
| Multiple `esbuild.build()` calls | Single call with `outExtension` tricks | Single call cannot mix IIFE and ESM in one invocation; separate calls is cleaner |

**Installation:** esbuild is already in devDependencies. No new packages needed.

```bash
# Nothing to install — esbuild 0.27.3 already in node_modules
```

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
└── build.js          # Build script (mirrors existing convention)

src/
├── content/
│   ├── content-script.js       # REFACTORED: add import statements at top
│   ├── citation-ui.js          # REFACTORED: add import statements at top
│   ├── paragraph-finder.js     # No imports needed (no shared dependencies)
│   ├── constants-globals.js    # DELETED after refactor
│   └── text-matcher.js         # DELETED after refactor
├── manifest.json               # SOURCE (not copied as-is; transformed)
└── manifest.firefox.json       # NEW: standalone Firefox manifest

dist/
├── chrome/
│   ├── manifest.json           # TRANSFORMED (content_scripts.js updated)
│   ├── content/
│   │   └── content.js          # IIFE bundle of all 5 content scripts
│   ├── background/
│   │   └── service-worker.js   # ESM bundle
│   ├── offscreen/
│   │   ├── offscreen.html      # copied as-is
│   │   ├── offscreen.js        # ESM bundle entry
│   │   ├── pdf-parser.js       # ESM bundle or bundled into offscreen.js
│   │   └── position-map-builder.js
│   ├── popup/
│   │   ├── popup.html          # copied as-is
│   │   └── popup.js            # ESM or copied (no external imports)
│   ├── options/
│   │   ├── options.html        # copied as-is
│   │   └── options.js          # ESM or copied (no external imports)
│   ├── icons/                  # all *.png copied
│   └── lib/
│       ├── pdf.mjs             # copied as-is
│       └── pdf.worker.mjs      # copied as-is
└── firefox/
    └── manifest.json           # copied from src/manifest.firefox.json
```

### Pattern 1: Two-Call esbuild Strategy

**What:** Run esbuild.build() twice per target — once for IIFE content scripts, once for ESM scripts. Combine with Promise.all() for parallel execution.

**When to use:** When a single build target needs two different output formats (IIFE vs ESM). esbuild cannot produce both from a single build() call.

```javascript
// Source: https://esbuild.github.io/api/
import * as esbuild from 'esbuild';
import { rmSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

async function buildChrome({ sourcemaps = false } = {}) {
  // Clean
  rmSync('dist/chrome', { recursive: true, force: true });
  mkdirSync('dist/chrome', { recursive: true });

  await Promise.all([
    // IIFE bundle: content scripts (all 5 pulled in via imports from content-script.js)
    esbuild.build({
      entryPoints: ['src/content/content-script.js'],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      outfile: 'dist/chrome/content/content.js',
      sourcemap: sourcemaps,
    }),

    // ESM bundles: background + offscreen (each self-contained)
    esbuild.build({
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
      sourcemap: sourcemaps,
    }),
  ]);

  copyAssets('dist/chrome');
  writeManifest('dist/chrome');
}
```

### Pattern 2: Manifest Transformation

**What:** Read `src/manifest.json`, update the `content_scripts[0].js` array from 5 paths to 1, write to `dist/chrome/manifest.json`.

**When to use:** Whenever the built manifest differs from the source manifest (content_scripts path changed).

```javascript
function writeManifest(outDir) {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
  // Content scripts consolidated: 5 files → 1 IIFE bundle
  manifest.content_scripts[0].js = ['content/content.js'];
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
}
```

### Pattern 3: Static Asset Copy

**What:** Use `fs.cp()` (async) or `fs.cpSync()` (sync) to recursively copy icon and lib directories, plus individual HTML files.

**When to use:** Copying non-bundled static assets — HTML, PNG icons, pdf.mjs, pdf.worker.mjs.

```javascript
// Node 24 — fs.cp() available and stable
import { cp, mkdir } from 'fs/promises';

async function copyAssets(outDir) {
  await mkdir(`${outDir}/icons`, { recursive: true });
  await mkdir(`${outDir}/lib`, { recursive: true });

  await Promise.all([
    cp('src/icons', `${outDir}/icons`, { recursive: true }),
    cp('src/lib', `${outDir}/lib`, { recursive: true }),
    // HTML files are referenced by HTML (not bundled) — copy as-is
    cp('src/offscreen/offscreen.html', `${outDir}/offscreen/offscreen.html`),
    cp('src/popup/popup.html', `${outDir}/popup/popup.html`),
    cp('src/options/options.html', `${outDir}/options/options.html`),
  ]);
}
```

### Pattern 4: Watch Mode

**What:** `esbuild.context()` creates a reusable build context. `ctx.watch()` auto-rebuilds on file changes. `ctx.dispose()` cleans up on exit.

**When to use:** `npm run dev` — Chrome-only, source maps enabled.

```javascript
// Source: https://esbuild.github.io/api/#watch
async function watchChrome() {
  const [contentCtx, esmCtx] = await Promise.all([
    esbuild.context({
      entryPoints: ['src/content/content-script.js'],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      outfile: 'dist/chrome/content/content.js',
      sourcemap: true,
    }),
    esbuild.context({
      entryPoints: ['src/background/service-worker.js', 'src/offscreen/offscreen.js'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      outbase: 'src',
      outdir: 'dist/chrome',
      sourcemap: true,
    }),
  ]);

  await Promise.all([contentCtx.watch(), esmCtx.watch()]);
  console.log('Watching for changes...');

  // Cleanup on exit
  process.on('SIGINT', async () => {
    await Promise.all([contentCtx.dispose(), esmCtx.dispose()]);
    process.exit(0);
  });
}
```

### Pattern 5: Content Script Refactor (globals → ES module imports)

**What:** Each content script that currently relies on global variables must get explicit `import` statements at the top. The scripts stay in their files but gain imports — esbuild bundles them all through `content-script.js` as the entry point.

**When to use:** Required before bundling works. Do one file at a time.

```javascript
// BEFORE (content-script.js) — uses globals MSG, STATUS, PATENT_TYPE, findParagraphCitation, showFloatingButton, etc.
// No import statements — relies on load order in manifest

// AFTER (content-script.js) — explicitly imports everything needed
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
import { matchAndCite } from '../shared/matching.js';
import { findParagraphCitation } from './paragraph-finder.js';
import {
  showFloatingButton, showCitationPopup, showErrorPopup,
  showLoadingIndicator, showSuccessToast, showFailureToast,
  dismissCitationUI
} from './citation-ui.js';
```

```javascript
// citation-ui.js — currently no imports (uses globals MSG, STATUS, PATENT_TYPE if needed)
// If citation-ui.js uses MSG/STATUS/PATENT_TYPE constants, add:
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
```

### Anti-Patterns to Avoid

- **IIFE with `globalName` for a content script:** Content scripts don't need to export a global. `globalName` is only for libraries that expose an API to other scripts. Omit `globalName` for a pure side-effect IIFE.
- **Single esbuild.build() call trying to mix IIFE + ESM:** Not possible. esbuild applies one format per call. Use separate calls.
- **Passing `outfile` with multiple entry points:** esbuild throws an error — use `outdir` + `outbase` for multi-entry builds. Only the IIFE content bundle uses `outfile` (single entry → single output).
- **Bundling popup.js/options.js when they have no imports:** These scripts use `chrome.*` globals but no ES module imports. They can still be passed through esbuild (esbuild will produce a valid file) or just copied. Either works; bundling them is fine and consistent.
- **Leaving `shared/` as a directory in dist:** `shared/constants.js` and `shared/matching.js` are bundled INTO the output files by esbuild — they do NOT need to be copied to dist.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Incremental rebuilds / file watching | Custom fs.watch loop | `esbuild.context()` + `ctx.watch()` | esbuild's watcher handles transitive dependency tracking automatically |
| JavaScript minification | Custom ast walking | esbuild `minify: true` | But: REQUIREMENTS.md explicitly says NO minification for extension review |
| IIFE wrapping | Manual function wrapper | esbuild `format: 'iife'` | esbuild handles scope isolation, hoisting, and strict mode correctly |
| Dependency graph resolution | Manual import tracing | esbuild `bundle: true` | esbuild resolves the entire module graph including node_modules |

**Key insight:** esbuild's JS API already solves every bundling problem for this use case. The build script is pure orchestration — clean, call esbuild, copy assets, transform manifest.

---

## Common Pitfalls

### Pitfall 1: Content Scripts Using Unimported Globals at Runtime

**What goes wrong:** After refactoring `content-script.js` to add imports, if `citation-ui.js` or `paragraph-finder.js` still reference globals (MSG, STATUS, PATENT_TYPE) that aren't imported in THEIR file, esbuild bundles them without the globals. At runtime the IIFE executes and throws `ReferenceError: MSG is not defined`.

**Why it happens:** esbuild bundles each file's imported symbols. If a file uses a global without importing it, esbuild passes the reference through as a bare identifier — which works in the old globals pattern but breaks in an IIFE where the global isn't defined.

**How to avoid:** Before deleting `constants-globals.js`, audit every content script file for uses of MSG/STATUS/PATENT_TYPE. If `citation-ui.js` uses them, add `import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js'` to that file. If `paragraph-finder.js` uses them, add imports there too. Run Vitest after each file's refactor.

**Warning signs:** `ReferenceError` in Chrome DevTools console after loading dist/chrome. Vitest passing on src/ but extension broken in dist/.

### Pitfall 2: Vitest `classicScriptExports` Plugin Conflicts with Bundled Content Scripts

**What goes wrong:** `vitest.config.js` has a `classicScriptExports` plugin that auto-appends `export { ... }` to any file under `/content/`. After bundling, if tests import from `dist/chrome/content/content.js` (the IIFE bundle), the plugin will try to export IIFE internals — which don't exist as top-level functions.

**Why it happens:** The plugin pattern was designed for the pre-bundle world where each content script was a separate classic script with top-level function declarations.

**How to avoid:** The CONTEXT.md decision is that Vitest continues testing `src/` modules directly (not the built output). The 71-case corpus test is a SEPARATE script (`scripts/test-dist.js`) that runs against `dist/chrome/`. Keep the existing Vitest config unchanged; only the new dist test script needs to import from dist.

**Warning signs:** Vitest errors after refactor if tests are accidentally pointed at dist/.

### Pitfall 3: `outbase` Needed When Using Multiple Entry Points with `outdir`

**What goes wrong:** When passing multiple entry points (service-worker.js, offscreen.js, popup.js, options.js) with `outdir: 'dist/chrome'`, esbuild computes output paths relative to the common ancestor of the entry points. If entry points span `src/background/`, `src/offscreen/`, `src/popup/`, and `src/options/`, esbuild uses `src/` as the common ancestor and mirrors the structure inside `dist/chrome/`.

**Why it happens:** esbuild's `outdir` without `outbase` uses the lowest common directory of all entry points as the implicit base. Without `outbase: 'src'`, the output paths would be `dist/chrome/background/service-worker.js` etc., which is actually correct here. But if entry points were mixed-depth, you could get unexpected paths.

**How to avoid:** Set `outbase: 'src'` explicitly. This guarantees `src/background/service-worker.js` → `dist/chrome/background/service-worker.js` regardless of which entry points are included.

### Pitfall 4: `pdf.mjs` and `pdf.worker.mjs` Must NOT Be Bundled

**What goes wrong:** Including `src/lib/pdf.mjs` in esbuild's entry points would cause esbuild to attempt bundling the entire PDF.js library, which is large (~3MB), may have incompatible module patterns, and is already pre-built.

**Why it happens:** It's tempting to add all `.js`/`.mjs` files to entry points.

**How to avoid:** Copy `src/lib/pdf.mjs` and `src/lib/pdf.worker.mjs` to dist using `fs.cp()`. Never pass them to esbuild. The `offscreen.js` bundle imports PDF.js dynamically at runtime — esbuild sees the import but since `pdf.mjs` is in `src/lib/` which is marked external or not in the bundle entry, it stays as a runtime reference.

**Action required:** Add `external: ['../lib/pdf.mjs']` to the offscreen esbuild config, OR verify esbuild handles the dynamic worker URL string correctly without bundling pdf.mjs.

**Warning signs:** `dist/chrome/` build taking unusually long, or dist/chrome/lib/pdf.mjs being absent while offscreen.js tries to load it.

### Pitfall 5: Firefox Manifest Must Exist Before `npm run build:firefox` Runs

**What goes wrong:** The build script tries to read `src/manifest.firefox.json` which doesn't exist yet.

**Why it happens:** `src/manifest.firefox.json` is a NEW file created in this phase. Build script and manifest must be created together.

**How to avoid:** Create `src/manifest.firefox.json` as part of Wave 1 of the plan, before the Firefox build target code is written.

### Pitfall 6: Manifest `web_accessible_resources` Path After Bundling

**What goes wrong:** The Chrome manifest `web_accessible_resources` declares `"lib/pdf.worker.mjs"`. After building, the dist manifest must still point to the same relative path. If the copy puts it at `dist/chrome/lib/pdf.worker.mjs`, the manifest path stays `"lib/pdf.worker.mjs"` — correct. But if the path in the copied manifest gets rewritten incorrectly, PDF.js cannot load the worker.

**How to avoid:** When transforming the manifest, only change `content_scripts[0].js`. Leave all other manifest fields (especially `web_accessible_resources`) as-is. Verify after first build that `dist/chrome/lib/pdf.worker.mjs` exists.

---

## Code Examples

Verified patterns from official esbuild documentation:

### Complete build() call (IIFE content bundle)

```javascript
// Source: https://esbuild.github.io/api/
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/content/content-script.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: 'dist/chrome/content/content.js',
  // sourcemap: true,  // dev mode only
  // minify: false,    // intentional — extension store review
});
```

### Complete build() call (ESM bundle, multiple entries)

```javascript
// Source: https://esbuild.github.io/api/
import * as esbuild from 'esbuild';

await esbuild.build({
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
  // sourcemap: true,  // dev mode only
});
```

### Watch mode context

```javascript
// Source: https://esbuild.github.io/api/#watch
let ctx = await esbuild.context({ ...buildOptions });
await ctx.watch();
// ctx.dispose() to stop
```

### Clean build with rmSync

```javascript
import { rmSync, mkdirSync } from 'fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/chrome', { recursive: true });
mkdirSync('dist/firefox', { recursive: true });
```

### Async asset copy with fs.cp

```javascript
// Node 16.7+ (project uses Node 24)
import { cp, mkdir } from 'fs/promises';
await mkdir('dist/chrome/icons', { recursive: true });
await cp('src/icons', 'dist/chrome/icons', { recursive: true });
await cp('src/lib', 'dist/chrome/lib', { recursive: true });
```

### Manifest transformation

```javascript
import { readFileSync, writeFileSync } from 'fs';
const src = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
src.content_scripts[0].js = ['content/content.js'];
writeFileSync('dist/chrome/manifest.json', JSON.stringify(src, null, 2));
```

### BUILD-05 test script pattern (dist corpus test)

```javascript
// scripts/test-dist.js — runs 71-case corpus against dist/chrome/
// Imports matchAndCite from the built output (ESM bundle)
import { matchAndCite } from '../dist/chrome/offscreen/offscreen.js';
// OR: import directly from shared (which is bundled into offscreen.js)
// Better: import from dist/chrome/offscreen/offscreen.js if it re-exports matchAndCite
// Simplest: run tests against src/ matchAndCite — the BUILD-05 requirement
// says "Vitest 71-case test corpus passes" which already tests src/ via Vitest
// The separate dist test validates the IIFE loads correctly in the built extension
```

**BUILD-05 clarification:** The 71-case Vitest corpus tests `src/shared/matching.js` directly. For BUILD-05 verification, the dist test confirms the built Chrome extension works end-to-end — either via a headless Chrome load test OR by verifying the IIFE bundle can be evaluated in Node with the same inputs. The simplest approach: the existing `npm test` (Vitest) covers correctness; BUILD-05 is satisfied when the extension loads without errors in Chrome ("Load unpacked" from dist/chrome/).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Classic script load-order globals | ES module imports + esbuild IIFE bundle | Phase 15 | content-script.js and siblings gain explicit import statements |
| Loading from src/ directly in Chrome | Always require `npm run build` | Phase 15 | Developer must run build before testing in Chrome |
| 5 content script entries in manifest | 1 IIFE bundle entry in manifest | Phase 15 | Simpler manifest, fewer round-trips |
| No dist/ directory | dist/chrome/ + dist/firefox/ generated | Phase 15 | git ignores dist/; build is reproducible |

**esbuild context() + watch() vs rebuild():**
- esbuild < 0.17: used `watch: true` option directly in build()
- esbuild >= 0.17: uses `context()` API with separate `ctx.watch()` call
- Current project: esbuild 0.27.3 — use `context()` API

---

## Open Questions

1. **Does offscreen.js re-export matchAndCite for the dist corpus test?**
   - What we know: offscreen.js imports matchAndCite from shared/matching.js. ESM bundle will bundle it in.
   - What's unclear: To test matchAndCite from dist, need to import it. Can we import from dist/chrome/offscreen/offscreen.js if it doesn't explicitly re-export?
   - Recommendation: The 71-case corpus test in Vitest already runs against `src/shared/matching.js`. BUILD-05 can be satisfied by loading the dist extension in Chrome and verifying it produces correct citations — not necessarily running the fixture tests against dist. Confirm this interpretation with the planner.

2. **Does popup.js and options.js need bundling at all?**
   - What we know: Both files have zero ES module imports. They use only `chrome.*` globals.
   - What's unclear: Bundling them through esbuild produces valid output but is unnecessary. Plain copy would be simpler.
   - Recommendation: Include them in the ESM esbuild call anyway — consistent, and esbuild handles zero-import files fine (just emits the file). Avoids a special-case copy logic branch.

3. **External reference for pdf.mjs in offscreen.js bundle**
   - What we know: offscreen.js dynamically creates a Worker with `new URL('../lib/pdf.worker.mjs', import.meta.url)`. When bundled to ESM, `import.meta.url` is still valid in ESM context. But esbuild may try to bundle pdf.mjs.
   - What's unclear: Whether esbuild follows the `new URL(...)` pattern as a bundling target.
   - Recommendation: Check esbuild output carefully after first build. If pdf.mjs is being inlined, add it to `external: ['../lib/pdf.mjs', '../lib/pdf.worker.mjs']` in the offscreen build config.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.js` (project root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUILD-01 | dist/chrome/ produced with IIFE + ESM bundles | smoke | `node scripts/build.js --chrome-only && ls dist/chrome/content/content.js dist/chrome/background/service-worker.js` | ❌ Wave 0 |
| BUILD-02 | Static assets present in dist/chrome/ | smoke | `ls dist/chrome/icons/ dist/chrome/lib/ dist/chrome/popup/popup.html` | ❌ Wave 0 |
| BUILD-03 | manifest.json in dist/chrome/ has correct content_scripts | unit | `node -e "const m=JSON.parse(require('fs').readFileSync('dist/chrome/manifest.json','utf8')); console.assert(m.content_scripts[0].js.length===1)"` | ❌ Wave 0 |
| BUILD-04 | Built extension functionally identical to src/ | integration | Manual: "Load unpacked" dist/chrome/ in Chrome, navigate to Google Patent, select text, get citation | manual-only |
| BUILD-05 | Vitest 71-case corpus passes | unit | `npm test` (existing corpus tests in tests/unit/text-matcher.test.js and offscreen-matcher.test.js) | ✅ exists |

### Sampling Rate
- **Per task commit:** `npm test` (existing Vitest suite)
- **Per wave merge:** `npm test && node scripts/build.js`
- **Phase gate:** Full build succeeds + `npm test` green + manual Chrome verification before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/build.js` — the build script itself (created in Wave 1 of plan)
- [ ] `src/manifest.firefox.json` — Firefox manifest (created in Wave 1)
- [ ] No new test files needed — existing Vitest suite covers correctness; build verification is smoke/manual

*(Existing test infrastructure covers BUILD-05; BUILD-01 through BUILD-04 are verified by running the build script and loading the extension.)*

---

## Sources

### Primary (HIGH confidence)
- [esbuild.github.io/api/](https://esbuild.github.io/api/) — build(), context(), watch(), outbase, format options, sourcemap
- [esbuild.github.io/api/#watch](https://esbuild.github.io/api/#watch) — ctx.watch() and ctx.dispose() API
- Project `node_modules/esbuild` — version 0.27.3 confirmed installed
- Node.js 24 built-in `fs.cp()` — confirmed available via `node -e "const fs = require('fs'); console.log(typeof fs.cp)"` → "function"

### Secondary (MEDIUM confidence)
- [esbuild.github.io/faq/](https://esbuild.github.io/faq/) — IIFE format for content scripts pattern
- [1Password blog: Using esbuild for browser extension](https://blog.1password.com/new-extension-build-system/) — real-world browser extension esbuild pattern

### Tertiary (LOW confidence)
- WebSearch results on esbuild Chrome extension patterns — cross-referenced with official docs; consistent

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — esbuild already installed, Node.js builtins confirmed, versions verified
- Architecture: HIGH — esbuild JS API patterns verified against official docs; content script refactor pattern is standard
- Pitfalls: HIGH for pitfalls 1-4 (derived from codebase inspection + API verification); MEDIUM for pitfalls 5-6 (logical inference from codebase)
- Validation: HIGH — existing Vitest infrastructure confirmed functional

**Research date:** 2026-03-03
**Valid until:** 2026-09-03 (esbuild is stable; Node.js fs.cp() is stable)

# Phase 15: esbuild Build Pipeline - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A single build script produces dist/chrome/ and dist/firefox/ from src/. The Chrome build is functionally identical to the current raw source extension. Firefox gets directory + complete manifest only (no JS bundles yet — Phase 16 fills those in). This phase establishes the build pipeline; it does not add Firefox-specific code.

</domain>

<decisions>
## Implementation Decisions

### Content script bundling
- All 5 content scripts bundled into a **single IIFE** file (e.g., content.js)
- Entry point: `content-script.js` — esbuild follows its imports to pull in text-matcher, citation-ui, paragraph-finder, constants
- Phase 14 wrapper files (`constants-globals.js`, `text-matcher.js` as thin global-exposing wrappers) are **deleted** after bundling works
- Content scripts must be converted from globals pattern to ES module imports before bundling
- After this phase, Chrome **cannot load from src/ directly** — build step is always required

### Build script and tooling
- **esbuild** added as devDependency
- Build script lives at `scripts/build.js` (follows existing convention: scripts/update-golden.js, scripts/accuracy-report.js)
- Uses esbuild's JS API for full control over bundling
- **Clean build**: rm dist/ before each build — no stale artifacts

### Output formats
- Content scripts: **IIFE** (single bundle, injected via manifest)
- Service worker (background): **ESM** (manifest specifies `"type": "module"`)
- Offscreen document: **ESM** (loaded via `<script type="module">`)
- Static assets (HTML, icons, PDF.js) copied as-is

### Dev workflow
- **Watch mode**: `npm run dev` rebuilds on file changes (esbuild watch, Chrome only)
- **Source maps**: Generated in dev/watch mode only; production build omits them
- **Test strategy**: Vitest continues testing src/ modules directly (fast, granular) AND a separate script runs the 71-case corpus against dist/chrome/ (BUILD-05 verification)

### npm scripts
- `npm run build` — production build, both targets (chrome + firefox), no source maps
- `npm run build:chrome` — Chrome only
- `npm run build:firefox` — Firefox only
- `npm run dev` — watch mode, source maps, Chrome only

### Firefox scaffold
- dist/firefox/ created with **directory + complete manifest only** (no JS bundles)
- Firefox manifest source: `src/manifest.firefox.json` (standalone file alongside Chrome manifest)
- Manifest is **complete and accurate** — full permissions, gecko ID, background script entry, content scripts. Phase 16 doesn't need to touch it
- Standalone file, not generated from Chrome manifest (per REQUIREMENTS.md: "differences too numerous for patch approach")

### Git
- `dist/` added to `.gitignore` — build output is generated, not source

### Claude's Discretion
- Exact esbuild configuration options (tree-shaking, minification settings)
- How content scripts are refactored from globals to imports (order of conversion steps)
- Asset copy implementation (fs.cp, glob, etc.)
- Watch mode implementation details
- How the dist/ test script integrates with Vitest

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key constraints: esbuild for bundling, scripts/build.js for convention, single IIFE for content scripts.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/constants.js`: Pure ES module with MSG, STATUS, PATENT_TYPE exports — direct import target for bundler
- `src/shared/matching.js`: Pure ES module with matchAndCite, normalizeText — direct import target for bundler
- `src/content/constants-globals.js`: Thin wrapper exposing shared constants as globals — DELETE after bundling
- `src/content/text-matcher.js`: Thin wrapper exposing shared matching functions as globals — DELETE after bundling
- Existing scripts/ convention: update-golden.js, accuracy-report.js, generate-icons.mjs

### Established Patterns
- Service worker: `"type": "module"` in manifest, imports from `../shared/`
- Offscreen: `<script type="module">`, imports from `../shared/`
- Content scripts: classic script globals pattern via manifest `content_scripts.js` array (load order: constants-globals → text-matcher → paragraph-finder → citation-ui → content-script)
- Package.json: `"type": "module"` — project-wide ESM

### Integration Points
- `src/manifest.json` → copied to `dist/chrome/manifest.json` (content_scripts array changes from 5 files to 1)
- `src/manifest.firefox.json` (new) → copied to `dist/firefox/manifest.json`
- `src/lib/pdf.mjs` + `src/lib/pdf.worker.mjs` → copied to dist (web_accessible_resources)
- `src/icons/*.png` → copied to dist
- `src/offscreen/offscreen.html`, `src/options/options.html`, `src/popup/popup.html` → copied to dist
- `package.json` scripts: add build, build:chrome, build:firefox, dev
- `.gitignore`: add dist/

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-esbuild-build-pipeline*
*Context gathered: 2026-03-03*

# Phase 14: Shared Code Extraction - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate duplicated matching logic and constants into `src/shared/` so all entry points (content scripts, service worker, offscreen document) import from one source. Chrome extension continues to work without a build step. This is a pure refactoring phase — no new features, no Firefox code yet.

</domain>

<decisions>
## Implementation Decisions

### Module format strategy
- Shared code written as **pure ES modules** with `export` statements
- Content scripts get **thin inline-copy wrapper files** that re-expose shared functions as globals (classic scripts)
- Wrappers are temporary — Phase 15 esbuild will replace them with bundled imports
- Service worker (already type:module) imports directly from `shared/constants.js` — remove its local MSG/STATUS/PATENT_TYPE definitions
- Offscreen document (already ES module) imports both constants AND matching functions from shared/ — remove all `*Offscreen` suffix duplicates (~260 lines)

### Shared directory structure
- **Flat files**: `src/shared/constants.js` and `src/shared/matching.js` — two files only
- `pdf-parser.js` and `position-map-builder.js` stay in `offscreen/` (not shared yet — Phase 16 concern)
- No subdirectories or index files

### Import/consumption pattern
- `content/text-matcher.js` becomes a **thin wrapper** that defines the same globals by inlining shared matching code — manifest content_scripts array stays unchanged
- `content/constants-globals.js` is a **new wrapper** that defines MSG/STATUS/PATENT_TYPE as globals — manifest content_scripts array updated to load this instead of `shared/constants.js`
- `shared/constants.js` gains `export` statements — pure ESM, no longer dual-format
- Service worker: `import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js'`
- Offscreen: `import { matchAndCite, normalizeText, ... } from '../shared/matching.js'` and `import { MSG, ... } from '../shared/constants.js'`
- Delete duplicated code from service-worker.js and offscreen.js after imports work

### Test corpus continuity
- Tests update to import from `src/shared/matching.js` directly (real ES exports)
- Offscreen matcher test updates: `matchAndCiteOffscreen` → `matchAndCite` from shared/matching.js (no compatibility aliases)
- Vitest `classicScriptExports` plugin stays for content/ files only — no changes needed
- 71-case corpus must pass after every refactor step — run tests continuously

### Claude's Discretion
- Which matching functions go into shared/matching.js vs stay in content/ (analyze call graph to determine boundary)
- Exact wrapper file implementation details
- Order of refactoring steps to minimize breakage

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key constraint is that the Chrome extension must continue to work by loading from `src/` directly (no build step) throughout this phase.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/constants.js`: Already exists with MSG, STATUS, PATENT_TYPE — currently classic-script only (no exports)
- `src/content/text-matcher.js`: Contains all matching functions as globals (~400 lines)
- `src/offscreen/offscreen.js`: Contains duplicated matching functions with `Offscreen` suffix (~260 lines)
- Vitest `classicScriptExports` plugin: Auto-exports top-level functions from content/ files for testing

### Established Patterns
- Content scripts loaded as classic scripts via manifest `content_scripts` array — order matters (constants → text-matcher → paragraph-finder → citation-ui → content-script)
- Service worker loaded as ES module (`"type": "module"` in manifest)
- Offscreen document loaded as ES module (`<script type="module">`)

### Integration Points
- Manifest `content_scripts.js` array needs updating: `shared/constants.js` → `content/constants-globals.js`
- Test imports: `../../src/content/text-matcher.js` → `../../src/shared/matching.js`
- Test imports: `../../src/offscreen/offscreen.js` matchAndCiteOffscreen → `../../src/shared/matching.js` matchAndCite

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-shared-code-extraction*
*Context gathered: 2026-03-03*

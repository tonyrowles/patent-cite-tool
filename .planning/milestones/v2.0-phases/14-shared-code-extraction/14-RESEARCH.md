# Phase 14: Shared Code Extraction - Research

**Researched:** 2026-03-03
**Domain:** Browser Extension ES Module Refactoring, Chrome MV3 Content Script Architecture
**Confidence:** HIGH

## Summary

Phase 14 is a pure code refactoring — no new features, no new behavior. The goal is to eliminate ~260 lines of duplicated matching logic between `src/offscreen/offscreen.js` and `src/content/text-matcher.js`, and remove the three separate inline copies of constants (in `shared/constants.js` without exports, in `service-worker.js` as inline vars, and in `offscreen.js` as inline vars).

The critical architectural constraint is that Chrome content scripts are loaded as **classic scripts** (no ES module support), so they cannot `import` from shared modules. The chosen solution is a thin wrapper pattern: content scripts get wrapper files that execute the shared matching code and expose the same globals they currently expect. The shared files themselves are pure ESM, consumable directly by the service worker and offscreen document.

The offscreen version of the matching functions is the **canonical** implementation — it has additional disambiguation logic (`findAllOccurrences`, `pickBestByContext`, context params) that the content script version lacks. The shared `matching.js` must be based on the offscreen version's interface, and the content script wrapper must adapt that interface back to the no-context call signature.

**Primary recommendation:** Create `src/shared/matching.js` from the offscreen matcher code, create `src/content/constants-globals.js` as a thin wrapper for constants, rewrite `src/content/text-matcher.js` as a thin wrapper that calls shared functions and exposes globals, update service-worker and offscreen imports, update test imports. Run tests after each step.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Module format strategy:**
- Shared code written as pure ES modules with `export` statements
- Content scripts get thin inline-copy wrapper files that re-expose shared functions as globals (classic scripts)
- Wrappers are temporary — Phase 15 esbuild will replace them with bundled imports
- Service worker (already type:module) imports directly from `shared/constants.js` — remove its local MSG/STATUS/PATENT_TYPE definitions
- Offscreen document (already ES module) imports both constants AND matching functions from shared/ — remove all `*Offscreen` suffix duplicates (~260 lines)

**Shared directory structure:**
- Flat files: `src/shared/constants.js` and `src/shared/matching.js` — two files only
- `pdf-parser.js` and `position-map-builder.js` stay in `offscreen/` (not shared yet — Phase 16 concern)
- No subdirectories or index files

**Import/consumption pattern:**
- `content/text-matcher.js` becomes a thin wrapper that defines the same globals by inlining shared matching code — manifest content_scripts array stays unchanged
- `content/constants-globals.js` is a new wrapper that defines MSG/STATUS/PATENT_TYPE as globals — manifest content_scripts array updated to load this instead of `shared/constants.js`
- `shared/constants.js` gains `export` statements — pure ESM, no longer dual-format
- Service worker: `import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js'`
- Offscreen: `import { matchAndCite, normalizeText, ... } from '../shared/matching.js'` and `import { MSG, ... } from '../shared/constants.js'`
- Delete duplicated code from service-worker.js and offscreen.js after imports work

**Test corpus continuity:**
- Tests update to import from `src/shared/matching.js` directly (real ES exports)
- Offscreen matcher test updates: `matchAndCiteOffscreen` → `matchAndCite` from shared/matching.js (no compatibility aliases)
- Vitest `classicScriptExports` plugin stays for content/ files only — no changes needed
- 71-case corpus must pass after every refactor step — run tests continuously

### Claude's Discretion

- Which matching functions go into shared/matching.js vs stay in content/ (analyze call graph to determine boundary)
- Exact wrapper file implementation details
- Order of refactoring steps to minimize breakage

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHARED-01 | Matching functions consolidated into single `src/shared/matching.js` — no duplication | Call graph analysis below identifies all 10 functions to move; offscreen version is canonical |
| SHARED-02 | Constants exported as ES module from `src/shared/constants.js` | Current file has the constants, just needs `export` added and inline copies removed from service-worker.js and offscreen.js |
| SHARED-03 | Content scripts, background script, and offscreen document all import from shared modules | Content scripts use wrapper pattern; SW and offscreen use direct ESM import |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^3.0.0 | Test runner — runs the 71-case corpus | Already installed, configured, passing |
| ES Modules (native) | Browser native | `import`/`export` for SW and offscreen | Both already use type:module |

### No New Dependencies
This phase adds zero dependencies. All work is file reorganization and wrapper creation.

## Architecture Patterns

### Current State (before Phase 14)

```
src/
├── shared/
│   └── constants.js          # Classic script — no exports. Loaded as content_script.
├── content/
│   ├── text-matcher.js       # ~396 lines — matching functions as globals
│   ├── paragraph-finder.js
│   ├── citation-ui.js
│   └── content-script.js
├── offscreen/
│   └── offscreen.js          # ~260 lines of duplicated matching (Offscreen-suffixed)
│   └── pdf-parser.js
│   └── position-map-builder.js
└── background/
    └── service-worker.js     # MSG/STATUS/PATENT_TYPE inline (lines 13-47)
```

### Target State (after Phase 14)

```
src/
├── shared/
│   ├── constants.js          # ESM: export const MSG, STATUS, PATENT_TYPE
│   └── matching.js           # ESM: export all 10 matching functions (offscreen version)
├── content/
│   ├── constants-globals.js  # NEW wrapper: imports shared, exposes as globals
│   ├── text-matcher.js       # REWRITTEN wrapper: imports shared, exposes same globals
│   ├── paragraph-finder.js   # UNCHANGED
│   ├── citation-ui.js        # UNCHANGED
│   └── content-script.js     # UNCHANGED
├── offscreen/
│   └── offscreen.js          # SHORTENED: imports from ../shared/, removes ~260 lines
│   └── pdf-parser.js         # UNCHANGED
│   └── position-map-builder.js # UNCHANGED
└── background/
    └── service-worker.js     # SHORTENED: imports MSG/STATUS/PATENT_TYPE from ../shared/constants.js
```

### Pattern 1: Pure ESM Shared Module

`src/shared/matching.js` exports all functions. Based on the **offscreen version** (canonical — has context disambiguation logic):

```javascript
// src/shared/matching.js
// Source: code analysis of src/offscreen/offscreen.js (canonical version)

export function normalizeText(text) { ... }
export function findAllOccurrences(haystack, needle) { ... }
export function pickBestByContext(positions, matchLen, concat, contextBefore, contextAfter) { ... }
export function whitespaceStrippedMatch(normalized, concat, boundaries, positionMap, contextBefore, contextAfter) { ... }
export function bookendMatch(normalized, concat, boundaries, positionMap) { ... }
export function resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) { ... }
export function formatCitation(startEntry, endEntry) { ... }
export function fuzzySubstringMatch(needle, haystack) { ... }
export function levenshtein(a, b) { ... }
export function matchAndCite(selectedText, positionMap, contextBefore = '', contextAfter = '') { ... }
```

All internal calls within the file use the canonical names (no `Offscreen` suffix).

### Pattern 2: Constants Wrapper (New File)

```javascript
// src/content/constants-globals.js
// Classic script — defines globals from shared constants
// Source: locked decision from CONTEXT.md

import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
// Wait — classic scripts cannot use import. Use self-contained copy:

const MSG = { ... };       // same values as shared/constants.js
const STATUS = { ... };    // same values
const PATENT_TYPE = { ... }; // same values
// No exports — globals via classic script execution
```

**CRITICAL NOTE:** Classic scripts cannot use `import`. The wrapper must be self-contained. Since the locked decision says `content/constants-globals.js` defines globals and the manifest loads it as a classic script, this file must contain the constant values verbatim (not import from shared). This is acceptable because:
- The file is tiny (~20 lines)
- Phase 15 esbuild will replace it entirely with bundled imports
- The "single source of truth" for the values is `shared/constants.js`; the wrapper duplicates values but not logic

Alternatively, the wrapper could be written as an IIFE that defines globals using inline values — same approach.

### Pattern 3: Matching Wrapper (Rewritten text-matcher.js)

Content scripts are loaded as classic scripts, so `text-matcher.js` must remain a classic script. It must expose the same globals (`normalizeText`, `matchAndCite`, `formatCitation`, `resolveMatch`, `whitespaceStrippedMatch`, `bookendMatch`, `fuzzySubstringMatch`, `levenshtein`) without using `import`.

**Two implementation options (Claude's Discretion):**

**Option A: Verbatim copy with no exports (simplest)**
- Copy shared/matching.js content verbatim, no exports, no imports
- Pros: Zero risk, tests pass trivially (classicScriptExports plugin still works)
- Cons: Still has a copy, but it's a copy the planner generates — "generated from canonical" pattern

**Option B: Script tag include pattern (impossible in MV3)**
- MV3 content scripts cannot dynamically load modules
- Rejected.

**Option A is the correct approach.** `text-matcher.js` becomes a generated copy of shared/matching.js without the `export` keywords. This is technically still duplication, but:
- It is one-directional: shared/matching.js is the source of truth
- Phase 15 esbuild replaces this with a proper bundle
- The classicScriptExports plugin continues to work (scans `/content/` for function declarations)

The wrapper file content = shared/matching.js content with `export` keywords stripped and a comment indicating it's a generated copy.

### Pattern 4: Service Worker Import

```javascript
// src/background/service-worker.js — replace inline constants block (lines 13-47)
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
// Delete the 35-line inline const block
```

Service worker is already `"type": "module"` in manifest — direct import works natively.

### Pattern 5: Offscreen Document Import

```javascript
// src/offscreen/offscreen.js — add imports, delete ~260 lines of matching code
import { matchAndCite, normalizeText } from '../shared/matching.js';
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';  // but offscreen uses inline strings currently

// Replace matchAndCiteOffscreen(...) call in lookupPosition() with:
const result = matchAndCite(selectedText, pm, contextBefore, contextAfter);

// Delete: whitespaceStrippedMatch, bookendMatch, normalizeTextOffscreen,
//         findAllOccurrences, pickBestByContext, matchAndCiteOffscreen,
//         resolveMatchOffscreen, formatCitationOffscreen,
//         fuzzySubstringMatchOffscreen, levenshteinOffscreen
// (~260 lines deleted)
```

### Anti-Patterns to Avoid

- **Exporting from text-matcher.js directly with `export`**: The classicScriptExports plugin handles this, but adding native `export` keywords to a classic script would cause a syntax error when Chrome loads it. Never add `export` to files in `content/` that are loaded as classic scripts in the manifest.
- **Making shared/matching.js import from content/**: Circular dependency. Shared is the bottom of the dependency tree.
- **Changing the manifest content_scripts order**: The load order matters — constants must be defined before text-matcher. The change is `shared/constants.js` → `content/constants-globals.js` in position 0, all other entries unchanged.
- **Adding `export` to shared/matching.js but not updating the classicScriptExports plugin**: The plugin filters on `/content/` — shared/ files are unaffected. This is correct behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Classic-to-ESM bridging | Custom module loader | Thin wrapper with inline values | Phase 15 esbuild handles this properly; wrapper is temporary |
| Function call graph analysis | Manual tracking | Read source files directly | The code is small and fully readable |
| Test infrastructure | New test framework | Existing Vitest setup | Already passing 108 tests, `classicScriptExports` plugin handles content/ |

## Common Pitfalls

### Pitfall 1: Using the Wrong Canonical Version

**What goes wrong:** Creating shared/matching.js from `text-matcher.js` (content script version) instead of the offscreen version. The content script version is MISSING `findAllOccurrences`, `pickBestByContext`, and the context-disambiguation path in `whitespaceStrippedMatch` and `matchAndCite`.

**Why it happens:** text-matcher.js is named first in the manifest and seems authoritative. But the offscreen version has 4 additional functions and superior disambiguation logic.

**How to avoid:** Base shared/matching.js on `offscreen.js`'s matching section. The offscreen version exports `matchAndCiteOffscreen` with `(selectedText, positionMap, contextBefore, contextAfter)` — this becomes the canonical `matchAndCite` signature.

**Warning signs:** After moving to shared, the offscreen-matcher tests fail (because `matchAndCiteOffscreen` now needs context params), OR the corpus test pass count drops.

### Pitfall 2: classicScriptExports Plugin Scope Confusion

**What goes wrong:** Expecting the plugin to transform `src/shared/matching.js` for tests. It only applies to files in `/content/`. Tests that import from `shared/matching.js` will work fine because `shared/matching.js` has real `export` statements — no plugin needed.

**Why it happens:** The plugin was written for content/ classic scripts. Shared files are native ESM.

**How to avoid:** After moving tests from `src/content/text-matcher.js` to `src/shared/matching.js`, the import statements work natively. No plugin change needed.

**Warning signs:** "No exports found" error from Vitest when importing from shared/matching.js (would indicate export keywords are missing from the shared file).

### Pitfall 3: Offscreen Manifest Path Resolution

**What goes wrong:** `src/offscreen/offscreen.js` imports `'../shared/constants.js'` but the path resolves incorrectly in the browser extension context.

**Why it happens:** The offscreen HTML is at `offscreen/offscreen.html`, so `../shared/` correctly resolves to `src/shared/`. This works.

**How to avoid:** Use relative paths from the JS file location (`../shared/constants.js` from `offscreen/offscreen.js`). Verify by checking existing import: `import { extractTextFromPdf } from './pdf-parser.js';` — same pattern.

### Pitfall 4: Manifest content_scripts Array Not Updated

**What goes wrong:** Manifest still loads `shared/constants.js` as a classic script after adding `export` statements. Classic scripts cannot have `export` keywords — this causes a syntax error and all content scripts fail to load.

**Why it happens:** Forgetting to swap `shared/constants.js` for `content/constants-globals.js` in manifest.json.

**How to avoid:** Update manifest BEFORE or simultaneously with adding exports to `shared/constants.js`. The manifest change must be atomic with the constants file change.

**Warning signs:** Extension stops working on patent pages entirely. Chrome devtools shows "Uncaught SyntaxError: Unexpected token 'export'" in content script context.

### Pitfall 5: Test Import Paths Not Updated

**What goes wrong:** `text-matcher.test.js` still imports from `../../src/content/text-matcher.js` after the wrapper rewrite. The wrapper has no exports (classic script), so all imports fail.

**Why it happens:** Test files must be updated to import from the new shared location.

**How to avoid:** Update test imports to `../../src/shared/matching.js`. Function names are identical (no `Offscreen` suffix in the shared file). The `matchAndCite` function now takes optional `contextBefore`/`contextAfter` params — existing tests that call `matchAndCite(text, map)` still work (params default to `''`).

### Pitfall 6: `matchAndCiteOffscreen` Export Removal Breaks Test

**What goes wrong:** `offscreen-matcher.test.js` currently imports `matchAndCiteOffscreen` by name. After the refactor, this export no longer exists.

**Why it happens:** The test must be updated to import `matchAndCite` from `../../src/shared/matching.js` instead.

**How to avoid:** Update `tests/unit/offscreen-matcher.test.js` to:
```javascript
import { matchAndCite } from '../../src/shared/matching.js';
// Replace all matchAndCiteOffscreen(...) calls with matchAndCite(...)
// (context params are already present in the test calls)
```
The vi.mock() calls for pdf-parser and position-map-builder are no longer needed (shared/matching.js doesn't import them).

## Code Examples

### Verified: Current Function Inventory in text-matcher.js
```
// Source: direct code read of src/content/text-matcher.js

Functions (8 total):
1. whitespaceStrippedMatch(normalized, concat, boundaries, positionMap)        [NOT exported — no context params]
2. bookendMatch(normalized, concat, boundaries, positionMap)                    [NOT exported]
3. normalizeText(text)                                                          [classicScriptExports handles]
4. matchAndCite(selectedText, positionMap)                                      [classicScriptExports handles]
5. resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence)      [classicScriptExports handles]
6. formatCitation(startEntry, endEntry)                                         [classicScriptExports handles]
7. fuzzySubstringMatch(needle, haystack)                                        [classicScriptExports handles]
8. levenshtein(a, b)                                                            [classicScriptExports handles]
```

### Verified: Additional Functions in offscreen.js (the canonical additions)
```
// Source: direct code read of src/offscreen/offscreen.js (lines 780-846)

Additional functions NOT in text-matcher.js:
9.  findAllOccurrences(haystack, needle) → number[]
10. pickBestByContext(positions, matchLen, concat, contextBefore, contextAfter) → position

Modified signatures vs text-matcher.js:
- normalizeText (called normalizeTextOffscreen) — identical logic, rename only
- matchAndCite (called matchAndCiteOffscreen) — ADDS contextBefore, contextAfter params
- whitespaceStrippedMatch — ADDS contextBefore, contextAfter, uses findAllOccurrences
- matchAndCite uses findAllOccurrences + pickBestByContext for exact match step
```

### Verified: Service Worker Constants Block to Remove
```javascript
// Source: src/background/service-worker.js lines 11-47
// REPLACE THESE 37 LINES:
// Constants defined inline — shared/constants.js is a classic script for content
// scripts and cannot use `export`. Keep in sync with shared/constants.js.
const MSG = { ... };     // 14 message type values
const STATUS = { ... };  // 8 status values
const PATENT_TYPE = { ... };  // 2 values

// WITH THIS ONE LINE:
import { MSG, STATUS, PATENT_TYPE } from '../shared/constants.js';
```

Note: service-worker.js also has additional message types in its inline MSG that are NOT in shared/constants.js (`CHECK_CACHE`, `CACHE_HIT_RESULT`, `CACHE_MISS`, `UPLOAD_TO_CACHE`). These exist in the service-worker.js inline block and offscreen.js inline strings but NOT in the current `src/shared/constants.js`. The shared constants file must be expanded to include all message types before the service-worker can import cleanly.

### Verified: Offscreen Inline Constants to Remove
```javascript
// Source: src/offscreen/offscreen.js lines 22-33
// These 12 inline string constants must be replaced by importing from shared:
const FETCH_PDF = 'fetch-pdf';
const PDF_FETCH_RESULT = 'pdf-fetch-result';
const PARSE_PDF = 'parse-pdf';
const PARSE_RESULT = 'parse-result';
const LOOKUP_POSITION = 'lookup-position';
const CITATION_RESULT = 'citation-result';
const FETCH_USPTO_PDF = 'fetch-uspto-pdf';
const USPTO_FETCH_RESULT = 'uspto-fetch-result';
const CHECK_CACHE = 'check-cache';
const CACHE_HIT_RESULT = 'cache-hit-result';
const CACHE_MISS = 'cache-miss';
const UPLOAD_TO_CACHE = 'upload-to-cache';
```

The current `src/shared/constants.js` MSG object has only 12 of 16 total message types — it is MISSING: `CHECK_CACHE`, `CACHE_HIT_RESULT`, `CACHE_MISS`, `UPLOAD_TO_CACHE`. These must be added to `shared/constants.js` as part of SHARED-02.

### Verified: Manifest Change Required
```json
// Source: src/manifest.json lines 26-31
// BEFORE:
"js": ["shared/constants.js", "content/text-matcher.js", ...]

// AFTER:
"js": ["content/constants-globals.js", "content/text-matcher.js", ...]
```

### Verified: Test Run Command
```bash
# From project root
npm test
# or
npx vitest run

# Runs 4 test files, 108 tests, currently: 4 passed (4)
# Duration: ~3 seconds
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dual-format constants (classic + ESM) | Pure ESM with wrapper | Phase 14 (this phase) | SW and offscreen get single source of truth |
| Duplicate matching functions with `Offscreen` suffix | Single shared/matching.js | Phase 14 (this phase) | ~260 lines deleted from offscreen.js |
| Content scripts import constants directly | Content scripts use wrapper globals | Phase 14 (this phase) | Manifest no longer loads shared/ as classic scripts |

## Open Questions

1. **Constants file completeness**
   - What we know: `shared/constants.js` MSG has 12 entries; `service-worker.js` MSG has 16 (adds CHECK_CACHE, CACHE_HIT_RESULT, CACHE_MISS, UPLOAD_TO_CACHE)
   - What's unclear: Nothing — the gap is clear from code inspection
   - Recommendation: `shared/constants.js` MUST be updated to include all 16 message types before service-worker.js can safely import from it. The plan should include this as an explicit step.

2. **content/constants-globals.js — pure copy vs. import**
   - What we know: Classic scripts cannot use `import`; the file must be self-contained
   - What's unclear: Whether to use inline values or some other trick
   - Recommendation: Inline the constant values verbatim (tiny file, identical to current shared/constants.js content minus the comment). This is explicit and correct.

3. **Wrapper text-matcher.js — copy-with-no-exports vs. other approach**
   - What we know: Classic scripts need functions as globals; cannot use `import`
   - What's unclear: Nothing — the approach is clear
   - Recommendation: `content/text-matcher.js` becomes a copy of `shared/matching.js` content with `export` keywords stripped. Add a header comment: "Generated wrapper — source of truth is src/shared/matching.js". The `classicScriptExports` plugin continues to auto-export top-level function declarations for Vitest.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `/home/fatduck/patent-cite-tool/vitest.config.js` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHARED-01 | `shared/matching.js` exports all 10 functions | unit import smoke | `npm test` | ❌ Wave 0 — new file |
| SHARED-01 | 71-case corpus passes against shared/matching.js | corpus | `npm test` | ✅ `tests/unit/text-matcher.test.js` (update import) |
| SHARED-02 | `shared/constants.js` exports MSG, STATUS, PATENT_TYPE | unit import smoke | `npm test` | ❌ Wave 0 — update file, add smoke test |
| SHARED-03 | offscreen.js no longer contains `*Offscreen` functions | integration | `npm test` | ✅ `tests/unit/offscreen-matcher.test.js` (update import) |
| SHARED-03 | No duplicate function definitions across entry points | static | `npm test` (all pass = no duplication broke anything) | ✅ existing suite |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (108+ tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/shared-matching.test.js` — smoke test that `src/shared/matching.js` exports all 10 functions by name
- [ ] `tests/unit/shared-constants.test.js` — smoke test that `src/shared/constants.js` exports MSG (all 16 keys), STATUS (8 keys), PATENT_TYPE (2 keys)
- [ ] Update `tests/unit/text-matcher.test.js` — change import from `src/content/text-matcher.js` to `src/shared/matching.js`
- [ ] Update `tests/unit/offscreen-matcher.test.js` — change import from `src/offscreen/offscreen.js::matchAndCiteOffscreen` to `src/shared/matching.js::matchAndCite`, remove vi.mock() calls for pdf-parser and position-map-builder

## Sources

### Primary (HIGH confidence)

- Direct code read: `src/content/text-matcher.js` — 396 lines, 8 functions, all globals
- Direct code read: `src/offscreen/offscreen.js` — lines 570-1029, 10 matching functions + 2 extra
- Direct code read: `src/shared/constants.js` — 43 lines, 3 constants, no exports, 12 MSG entries
- Direct code read: `src/background/service-worker.js` — lines 11-47, inline constants (16 MSG entries)
- Direct code read: `vitest.config.js` — classicScriptExports plugin scope confirmed: `/content/` only
- Direct code read: `tests/unit/text-matcher.test.js` — current import paths, 82 tests
- Direct code read: `tests/unit/offscreen-matcher.test.js` — imports matchAndCiteOffscreen, 4 tests
- `npm test` execution — confirmed 4 files, 108 tests, 100% pass rate

### Secondary (MEDIUM confidence)

None needed — all findings come from direct code inspection.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools already in use
- Architecture: HIGH — all patterns derived from reading actual source files
- Pitfalls: HIGH — identified from concrete code differences between the two copies
- Test infrastructure: HIGH — confirmed by running npm test (108 tests pass)

**Research date:** 2026-03-03
**Valid until:** Phase 14 completion (code does not change between research and planning)

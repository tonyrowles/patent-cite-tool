# Phase 10: Icon Set and Manifest Updates - Research

**Researched:** 2026-03-03
**Domain:** Chrome extension icon generation (SVG → PNG via sharp) + chrome.action.setIcon three-state system
**Confidence:** HIGH

## Summary

Phase 10 involves two distinct deliverables: (1) a set of production PNG icons generated from a source SVG using the `sharp` library, and (2) a runtime three-state toolbar icon system driven by `chrome.action.setIcon()` calls in the service worker. The icon generation script is a simple Node.js utility; the runtime icon-state system requires adding `setIcon` calls at four specific transition points already identified in the service worker.

Sharp v0.34.x is the standard choice for SVG-to-PNG conversion in Node.js build scripts. It ships prebuilt binaries for Linux/macOS/Windows and supports SVG input natively via libvips/librsvg. The project already has `"type": "module"` in package.json, making `import sharp from 'sharp'` the correct usage in `scripts/generate-icons.mjs`. Sharp is not currently installed and must be added as a devDependency.

The Chrome manifest currently omits the required 32px icon sizes. The three-state icon system uses `chrome.action.setIcon({ path: {...}, tabId })` which resets automatically on tab navigation — so icons must be re-applied on each page load via `PATENT_PAGE_DETECTED` or the existing message flow. Tab-specific icons via `tabId` are the correct approach so non-patent tabs stay gray.

**Primary recommendation:** Install sharp as devDependency, create `src/icons/` SVG source + three icon-state PNG sets (16/32/48/128px each = 12 files), update the manifest to add 32px entries, and add four `setIcon` call-sites in the service worker.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All visual design decisions are delegated to Claude. The user wants a professional, functional result without specifying exact aesthetics. Claude has full flexibility on:

**Icon artwork:**
- Icon concept/motif (document, brackets, column reference, or hybrid)
- Primary color for the full-color active state
- Visual style and level of detail (balancing 16px readability with 128px store presence)
- No specific reference icons or inspirations to match

**Three-state color scheme:**
- How "partial color" (patent detected, not yet parsed) is rendered — desaturated, outlined, badge overlay, or other approach
- Whether gray state is pure grayscale or slightly tinted
- Whether state transitions use icon swap only or include badge text during loading
- How published applications are handled (instant full-color vs brief partial state)

**Constraints Claude must respect:**
- All three states must be clearly distinguishable at 16px in the Chrome toolbar
- Gray must read as "inactive/disabled", partial must read as "working on it", full must read as "ready"
- Error badges (existing red/amber via setBadgeText) must remain functional and not conflict with the state system

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ICON-01 | Professional icon set at 16/32/48/128px for both active and inactive variants | sharp SVG→PNG pipeline; manifest needs 32px added; 6 PNGs currently exist (missing 32px); need 3-state = 3 × 4 sizes = 12 PNGs total |
| ICON-02 | Toolbar icon shows gray on non-patent pages, partial color when patent detected, full color when position map is parsed and ready | chrome.action.setIcon({ path, tabId }) at 4 transition points in service worker; declarativeContent already handles gray→enabled boundary; need partial and full PNG sets |
| ICON-03 | Icon generation script using sharp for reproducible builds from source SVG | sharp 0.34.x, ESM script at scripts/generate-icons.mjs, `npm run generate-icons` script entry in package.json |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sharp | ^0.34.0 | SVG → PNG conversion + resize | Industry standard for Node.js image processing; prebuilt binaries; libvips backend handles SVG natively via librsvg |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs/promises | built-in | Write output PNG files | No external dependency needed |
| node:path | built-in | Resolve output paths relative to project root | Consistent across platforms |
| node:url | built-in | `fileURLToPath(import.meta.url)` for ESM `__dirname` equivalent | Required in ESM scripts (existing project pattern) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sharp | jimp | Pure JS, no prebuilt binaries; significantly slower; worse SVG support (requires separate SVG rasterizer) |
| sharp | canvas + node-canvas | More control over drawing; much heavier install; not needed for simple resize-from-SVG |
| sharp | inkscape CLI | Excellent SVG support; requires system install; not npm-installable; not reproducible across dev machines |
| static path icons | OffscreenCanvas imageData | Canvas approach works but requires drawing in service worker; path approach is simpler and reuses existing PNG assets |

**Installation:**
```bash
npm install --save-dev sharp
```

---

## Architecture Patterns

### Recommended File Structure

```
src/
└── icons/
    ├── icon-source.svg           # Single source of truth for icon artwork
    ├── icon-gray-16.png          # State: inactive (non-patent page)
    ├── icon-gray-32.png
    ├── icon-gray-48.png
    ├── icon-gray-128.png
    ├── icon-partial-16.png       # State: patent detected, parsing in progress
    ├── icon-partial-32.png
    ├── icon-partial-48.png
    ├── icon-partial-128.png
    ├── icon-active-16.png        # State: parsed and ready (existing name, keep for compat)
    ├── icon-active-32.png        # NEW — was missing from manifest
    ├── icon-active-48.png        # Regenerated from SVG
    └── icon-active-128.png       # Regenerated from SVG
scripts/
└── generate-icons.mjs            # Runnable via: node scripts/generate-icons.mjs
```

**Note on naming:** The existing manifest uses `icon-inactive-*` and `icon-active-*`. To avoid a breaking rename mid-phase, the gray state can reuse the `icon-inactive-*` naming, with `icon-partial-*` as new additions.

### Pattern 1: SVG → PNG Generation Script (sharp)

**What:** Single ESM script reads source SVG, iterates sizes and states, outputs PNGs.
**When to use:** Any time icons need regenerating (design change or new platform requirement).

```javascript
// scripts/generate-icons.mjs
// Source: sharp.pixelplumbing.com/api-resize, sharp.pixelplumbing.com/api-constructor
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../src/icons');

const SIZES = [16, 32, 48, 128];

// Each state is a variant of the source SVG (or CSS color override via sharp svg options)
const STATES = [
  { name: 'inactive', svgFile: 'icon-source-gray.svg' },     // or CSS filter approach
  { name: 'partial',  svgFile: 'icon-source-partial.svg' },
  { name: 'active',   svgFile: 'icon-source-active.svg' },
];

for (const state of STATES) {
  const svgPath = join(iconsDir, state.svgFile);
  for (const size of SIZES) {
    const outPath = join(iconsDir, `icon-${state.name}-${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`  wrote ${outPath}`);
  }
}
console.log('Done.');
```

**Alternative: single SVG + CSS injection via sharp `svg.stylesheet` option** (librsvg 2.48+):
```javascript
// Inject CSS to override fill color without separate SVG files per state
const grayCSS = '.icon-fg { fill: #9ca3af; } .icon-bg { fill: #e5e7eb; }';
await sharp(svgBuffer, { svg: { stylesheet: grayCSS } })
  .resize(size, size).png().toFile(outPath);
```
This approach uses one source SVG with named CSS classes on paths — cleaner but requires confirming librsvg version on build machine.

### Pattern 2: Three-State Icon via chrome.action.setIcon

**What:** Service worker calls `setIcon` with tab-specific path dict at four transition points.
**When to use:** Every state change event in the service worker message handlers.

```javascript
// Source: developer.chrome.com/docs/extensions/reference/api/action
// Icon paths relative to extension root; tabId scopes to the originating tab

const ICON_PATHS = {
  gray:    { '16': 'icons/icon-inactive-16.png', '32': 'icons/icon-inactive-32.png',
             '48': 'icons/icon-inactive-48.png', '128': 'icons/icon-inactive-128.png' },
  partial: { '16': 'icons/icon-partial-16.png',  '32': 'icons/icon-partial-32.png',
             '48': 'icons/icon-partial-48.png',  '128': 'icons/icon-partial-128.png' },
  active:  { '16': 'icons/icon-active-16.png',   '32': 'icons/icon-active-32.png',
             '48': 'icons/icon-active-48.png',   '128': 'icons/icon-active-128.png' },
};

function setTabIcon(tabId, state) {
  if (!tabId) return;
  chrome.action.setIcon({ path: ICON_PATHS[state], tabId });
}
```

**The four call sites (identified in service worker):**

| Handler | Transition | Call |
|---------|-----------|------|
| `handlePdfLinkFound()` | gray → partial | `setTabIcon(senderTabId, 'partial')` |
| `handleParseResult()` success | partial → active | `setTabIcon(senderTabId, 'active')` |
| `handleCacheHitResult()` | gray → active | `setTabIcon(senderTabId, 'active')` |
| `handleParseResult()` error + `handleUsptoFetchResult()` failure | any → gray/partial+badge | already handled via badge; icon can stay partial |

**tabId sourcing problem:** `handlePdfLinkFound`, `handleParseResult`, `handleCacheHitResult` do not currently receive `sender` — they are called from `chrome.runtime.onMessage.addListener`. The `sender.tab.id` is only available in the top-level listener. **Resolution:** Pass `tabId` from the listener into the handlers, or store `tabId` alongside `currentPatent` in `chrome.storage.local` when `handlePdfLinkFound` is first called.

### Pattern 3: Tab-Specific Icon Reset Behavior

**What:** `setIcon({ path, tabId })` is tab-scoped and resets to the manifest default when the tab navigates away.
**Implication:** When a user navigates on `patents.google.com` (e.g., from one patent to another), the icon resets automatically. The content script fires `PDF_LINK_FOUND` again on the new page, which triggers the state machine fresh. This is correct behavior — no special cleanup code needed.

**Edge case:** If user navigates to a non-patent page and back, `declarativeContent` disables the action (grays it out via browser default). The icon is then re-enabled by the rule on the next patent page, and the extension will gray-out correctly via declarativeContent if no new message fires.

### Anti-Patterns to Avoid

- **Using `setIcon` globally (no tabId):** Sets the icon for ALL tabs, including non-patent tabs. Always pass `tabId` to scope to the active patent tab.
- **Using OffscreenCanvas for icon drawing:** Unnecessary complexity — static PNG path dict is simpler and sufficient. OffscreenCanvas is only needed for dynamically-computed pixel data.
- **Storing icon state in service worker global variables:** Service workers are ephemeral; state must live in `chrome.storage.local` (already done for patent status).
- **Single-size path string to setIcon:** Use a size dictionary (`{'16':..., '32':..., '48':..., '128':...}`) so Chrome picks the best resolution for the display density.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG rasterization | Custom SVG parser + canvas renderer | sharp + libvips/librsvg | Edge cases in SVG features; consistent cross-platform output |
| Image resizing with quality | Manual pixel-sampling loop | sharp `.resize(size, size)` with lanczos3 (default) | Lanczos3 is the standard high-quality downsampling kernel for icons |
| PNG encoding | Raw byte manipulation | sharp `.png().toFile()` | Correct PNG headers, bit depth, color space |

**Key insight:** SVG rendering (especially text, gradients, transforms) has dozens of edge cases that librsvg handles correctly. A hand-rolled solution would be pixel-inaccurate. Sharp's prebuilt binary means zero compilation complexity.

---

## Common Pitfalls

### Pitfall 1: Missing 32px Icon in Manifest

**What goes wrong:** Chrome on Windows shows a blurry icon in some toolbar states because 32px is absent from `action.default_icon` and `icons` entries.
**Why it happens:** The existing manifest only has 16/48/128 — 32px was never added.
**How to avoid:** Add `"32": "icons/icon-*-32.png"` to both the `action.default_icon` dict and the `icons` dict in manifest.json. The generation script must produce 32px PNGs for all three states.
**Warning signs:** Toolbar icon appears slightly blurry on a 1.5× or 2× Windows display.

### Pitfall 2: tabId Not Available in Async Handlers

**What goes wrong:** `handlePdfLinkFound()` is called with just the `message` object, losing access to `sender.tab.id`. Attempting to call `setTabIcon(null, 'partial')` silently does nothing (or throws).
**Why it happens:** The message listener dispatches to handlers that don't currently receive `sender`.
**How to avoid:** Either (a) extract `tabId` from `sender.tab?.id` in the top-level listener and pass it as a parameter to each handler, or (b) store the `tabId` in `chrome.storage.local` as part of `currentPatent` when `handlePdfLinkFound` first runs. Option (a) is simpler and doesn't require a storage schema change.
**Warning signs:** Icon never changes from gray despite status transitions being logged.

### Pitfall 3: setIcon Resets When Tab Navigates

**What goes wrong:** User clicks a link on a patent page and navigates to a new patent — old tab-scoped icon state is cleared by Chrome. On the new page, if the content script fires but the icon never resets to gray before going to partial/full, the sequence looks wrong.
**Why it happens:** `setIcon({ tabId })` is scoped to the tab URL at the time of call and resets on navigation.
**How to avoid:** Rely on the natural message flow: content script fires `PDF_LINK_FOUND` on every new patent page load, which triggers `handlePdfLinkFound → setTabIcon(tabId, 'partial')`. The gray state between navigation and the first message fires is handled by Chrome's built-in reset. No explicit "reset to gray" call is needed.
**Warning signs:** If icon appears "stuck" on active after navigation — check if content script is firing correctly.

### Pitfall 4: Sharp SVG Density Mismatch at Large Sizes

**What goes wrong:** A 16×16 viewBox SVG rasterized to 128px looks pixelated because sharp rasterizes at the source canvas size then upscales.
**Why it happens:** Sharp's SVG rasterization uses the SVG's declared `viewBox` dimensions as the native resolution, then scales. If the SVG has `viewBox="0 0 16 16"`, rendering at 128px requires 8× upscaling, which loses quality.
**How to avoid:** Author the source SVG with a large viewBox (e.g., `viewBox="0 0 256 256"`) so sharp downscales to all required sizes (downscaling always looks better than upscaling). Alternatively use the `density` option: `sharp(svgBuffer, { density: 288 })` to rasterize at higher DPI before resize.
**Warning signs:** 128px PNG looks blocky or the paths have "staircase" edges.

### Pitfall 5: sharp Not Included in devDependencies

**What goes wrong:** `npm ci` on a fresh clone fails because sharp is missing from package.json.
**Why it happens:** sharp installed globally or locally but not saved to package.json.
**How to avoid:** Always install with `npm install --save-dev sharp`.
**Warning signs:** `node scripts/generate-icons.mjs` fails with `Cannot find package 'sharp'` after a fresh clone.

---

## Code Examples

Verified patterns from official sources:

### Generate All Icon Sizes From SVG (sharp, ESM)

```javascript
// Source: sharp.pixelplumbing.com/api-constructor, api-resize, api-output
// Usage: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'src', 'icons');
const SIZES = [16, 32, 48, 128];

async function generateState(svgPath, statePrefix) {
  const svgBuffer = await readFile(svgPath);
  for (const size of SIZES) {
    const outPath = join(ICONS_DIR, `icon-${statePrefix}-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`  wrote icon-${statePrefix}-${size}.png`);
  }
}

await generateState(join(ICONS_DIR, 'icon-source-active.svg'),  'active');
await generateState(join(ICONS_DIR, 'icon-source-inactive.svg'), 'inactive');
await generateState(join(ICONS_DIR, 'icon-source-partial.svg'),  'partial');
console.log('Icon generation complete.');
```

### Set Tab Icon State in Service Worker

```javascript
// Source: developer.chrome.com/docs/extensions/reference/api/action
const ICON_PATHS = {
  partial: { '16': 'icons/icon-partial-16.png', '32': 'icons/icon-partial-32.png',
             '48': 'icons/icon-partial-48.png', '128': 'icons/icon-partial-128.png' },
  active:  { '16': 'icons/icon-active-16.png',  '32': 'icons/icon-active-32.png',
             '48': 'icons/icon-active-48.png',  '128': 'icons/icon-active-128.png' },
};

function setTabIcon(tabId, state) {
  if (!tabId) return;
  chrome.action.setIcon({ path: ICON_PATHS[state], tabId });
}
```

### Manifest Additions (32px + partial state)

```json
"action": {
  "default_popup": "popup/popup.html",
  "default_icon": {
    "16":  "icons/icon-inactive-16.png",
    "32":  "icons/icon-inactive-32.png",
    "48":  "icons/icon-inactive-48.png",
    "128": "icons/icon-inactive-128.png"
  }
},
"icons": {
  "16":  "icons/icon-active-16.png",
  "32":  "icons/icon-active-32.png",
  "48":  "icons/icon-active-48.png",
  "128": "icons/icon-active-128.png"
}
```

Note: The `partial` state icons are NOT listed in manifest.json — they are set dynamically via `chrome.action.setIcon()` at runtime. The manifest defines only the default (gray/inactive) and the extension management/store image (active).

### package.json Script Entry

```json
"scripts": {
  "generate-icons": "node scripts/generate-icons.mjs"
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-editing PNG files in a graphics editor | Scripted SVG→PNG via sharp | Growing norm since 2020 | Reproducible builds; easy iteration on design |
| `browserAction.setIcon` (MV2) | `action.setIcon` (MV3) | Chrome 88 MV3 launch | API is the same; just renamed namespace |
| Canvas imageData for dynamic icons | Static path dict | — | Path dict is simpler when you have pre-baked PNGs; canvas needed only for truly dynamic content |
| Single-size icon (48px only) | Multi-size dict {'16', '32', '48', '128'} | Consistent recommendation | Chrome picks best for screen DPI; sharp icons on high-DPI displays |

**Deprecated/outdated:**
- `chrome.browserAction.setIcon()`: Replaced by `chrome.action.setIcon()` in MV3. The old API is MV2 only.
- Placing SVG directly in manifest as icon file: Not supported by Chrome (confirmed by official docs); must use PNG/BMP/GIF/ICO/JPEG.

---

## Open Questions

1. **Single SVG source vs. three separate SVGs**
   - What we know: sharp supports a `svg.stylesheet` CSS injection option (requires librsvg 2.48+); alternatively three separate SVG files are unambiguous
   - What's unclear: whether the build environment's librsvg version is ≥2.48 (Ubuntu 22.04 ships 2.52, so likely fine on WSL2)
   - Recommendation: Start with three separate SVG files (one per state) to eliminate the librsvg version dependency. If the design iteration burden becomes annoying, switch to CSS injection approach in the same script.

2. **tabId plumbing in service worker handlers**
   - What we know: The four handlers (`handlePdfLinkFound`, `handleParseResult`, `handleCacheHitResult`, `handleCacheMiss`) do not currently receive `sender`
   - What's unclear: Whether storing tabId in `chrome.storage.local` is cleaner than threading it as a parameter
   - Recommendation: Pass tabId as a second argument to each handler (minimal refactor; avoids additional storage read/write roundtrip). Store it in `currentPatent` as a belt-and-suspenders backup.

3. **What happens to the partial icon on published applications (instant UNAVAILABLE)**
   - What we know: Application patents hit `STATUS.UNAVAILABLE` immediately (no async fetch), with an amber badge set
   - What's unclear: Whether the icon should show partial+badge or stay gray+badge for UNAVAILABLE
   - Recommendation: Stay gray (no setIcon call for UNAVAILABLE path) — the amber badge already signals the issue. Gray + amber badge is clear and requires no additional icon state.

---

## Sources

### Primary (HIGH confidence)

- [sharp.pixelplumbing.com/api-constructor](https://sharp.pixelplumbing.com/api-constructor/) — SVG density option, input formats
- [sharp.pixelplumbing.com/api-resize](https://sharp.pixelplumbing.com/api-resize/) — resize() parameters, kernels (lanczos3 default)
- [sharp.pixelplumbing.com/install](https://sharp.pixelplumbing.com/install/) — prebuilt binaries, SVG font requirements, platform support
- [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/) — current version v0.34.5 (Nov 2025)
- [developer.chrome.com/docs/extensions/reference/api/action](https://developer.chrome.com/docs/extensions/reference/api/action) — setIcon() path dict, tabId behavior, MV3 service worker restrictions
- [developer.chrome.com/docs/extensions/develop/ui/configure-icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) — required sizes (16/32/48/128), PNG requirement, no SVG in manifest

### Secondary (MEDIUM confidence)

- Chrome Docs via WebSearch: 32px required for Windows display DPI — confirmed by configure-icons official page
- sharp GitHub issue #2981 — ESM support confirmed; `import sharp from 'sharp'` works with `"type": "module"` package.json

### Tertiary (LOW confidence)

- librsvg CSS stylesheet support requires v2.48+ — mentioned in sharp install docs, not independently verified for this exact WSL2 environment

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sharp is the unambiguous choice; verified against official docs at v0.34.5
- Architecture (icon generation): HIGH — simple script; directly from sharp docs
- Architecture (setIcon state machine): HIGH — verified via official Chrome action API docs; tabId scoping confirmed
- Pitfalls: HIGH for manifest 32px gap (confirmed from manifest.json inspection); HIGH for tabId threading (confirmed from service-worker.js code read); MEDIUM for density pitfall (sharp docs + general knowledge)
- Code examples: HIGH — based on official sharp API + Chrome extension action API

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (sharp releases infrequently; Chrome action API is stable MV3)

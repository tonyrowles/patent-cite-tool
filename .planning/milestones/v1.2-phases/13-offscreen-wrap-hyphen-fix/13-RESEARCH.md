# Phase 13: Offscreen Wrap-Hyphen Fix - Research

**Researched:** 2026-03-03
**Domain:** JavaScript code propagation — duplicated matching function in offscreen document ES module
**Confidence:** HIGH (all findings from direct codebase inspection; no external libraries or web research needed)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCY-02 | Algorithm fixes for highest-impact failure modes found during audit | Fix surface is one line insertion in `matchAndCiteOffscreen` in `src/offscreen/offscreen.js`; the exact pattern is confirmed in `matchAndCite` in `src/content/text-matcher.js` |
| ACCY-03 | All algorithm fixes validated against regression harness (no existing passing cases broken) | Existing Vitest suite (`npx vitest run`) covers `text-matcher.js`; a new targeted test for the offscreen path is needed to close the validation gap |
</phase_requirements>

---

## Summary

Phase 13 is a targeted one-line code propagation. The wrap-hyphen normalization fix added to `matchAndCite` in Phase 9 (`normalized.replace(/- ([a-z])/g, '$1')`) was never applied to the functionally identical `matchAndCiteOffscreen` in `src/offscreen/offscreen.js`. These two functions are acknowledged duplicates — a documented tech debt item in STATE.md — because offscreen documents cannot share classic-script globals with content scripts under MV3. The omission means context-menu citations on wrap-hyphenated HTML selections (e.g., "trans- actions") will silently fail to match when routed through the offscreen path.

The fix is mechanically straightforward: add the same two lines (comment + regex replace) to `matchAndCiteOffscreen` immediately after its `normalizeTextOffscreen` call, mirroring the placement in `matchAndCite`. No logic differences exist between the two functions' surrounding context that would require a different approach. However, because `matchAndCiteOffscreen` runs in the offscreen document (not in the Vitest test environment which only imports from `text-matcher.js`), the existing test suite does not exercise this code path. A unit test for the offscreen function must be added to ensure the fix is validated.

The test challenge: `offscreen.js` is an ES module that imports from `./pdf-parser.js` and `./position-map-builder.js`, and it registers a `chrome.runtime.onMessage` listener at module scope. Importing it directly in Vitest will fail unless Chrome APIs are stubbed and the module's internal functions are exported. The clean path is to extract `matchAndCiteOffscreen` (and its helper functions) into a new shared module that both `offscreen.js` and a test file can import. An alternative that avoids refactoring: copy just the function signature from `offscreen.js` into the test file and test it directly with an inline duplicate, but that defeats the purpose. A pragmatic middle path: add `export` keywords to `matchAndCiteOffscreen` and the helpers it uses in `offscreen.js`, then test using `vi.stubGlobal` for the chrome dependency (which is not invoked during pure matching).

**Primary recommendation:** Add the one-line fix to `matchAndCiteOffscreen` in `offscreen.js`, then add a targeted Vitest test that imports and directly calls `matchAndCiteOffscreen` after stubbing the chrome global. The stub pattern is already established in Phase 8 (08-01 decision: `vi.stubGlobal` for chrome). Export the function for testability — the `export` keyword is safe on ES modules (offscreen.js is already `type="module"`).

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Test runner for the validation test | Already installed and configured; existing pattern in `tests/unit/text-matcher.test.js` |
| Node.js built-ins | — | No scripts needed; pure JS change | Zero-dep; no build step |

**Installation:** No new packages. Phase 13 uses only existing dependencies.

---

## Architecture Patterns

### Existing Project Structure (Phase 13 touches these files)

```
src/
├── content/
│   └── text-matcher.js         # REFERENCE: matchAndCite has the fix at line 212
└── offscreen/
    └── offscreen.js            # FIX TARGET: matchAndCiteOffscreen at line 852 lacks the fix

tests/
└── unit/
    ├── text-matcher.test.js    # Existing — tests text-matcher.js only
    └── offscreen-matcher.test.js  # NEW — tests matchAndCiteOffscreen fix (Wave 0 gap)
```

### Pattern 1: The Exact Fix — Where and What

In `src/content/text-matcher.js`, `matchAndCite` (line 193), the fix appears at lines 208-212:

```javascript
// text-matcher.js matchAndCite — THE REFERENCE (Phase 9 fix, already present)
function matchAndCite(selectedText, positionMap) {
  let normalized = normalizeText(selectedText);
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // Strip HTML-copy line-wrap artifacts from the selected text.
  // When a user selects text on a patent page, the HTML renderer includes
  // the soft-hyphen line-break as a literal "- " (hyphen-space) followed by
  // the continued word on the next visual line. In the PDF, these words are
  // joined without a hyphen (the hyphen is a wrap artifact, not a real hyphen).
  //
  // Pattern: a hyphen followed by a space then a LOWERCASE letter is a wrap
  // artifact. A real hyphen ("well-known") has no space after it.
  //
  // Applied ONLY to the selected text (normalized), NOT to the PDF concat,
  // because the PDF already joins wrap-hyphenated words correctly.
  //
  // Before: "trans- actions, borne by consumers" (HTML copy)
  // After:  "transactions, borne by consumers" (matches PDF concat)
  normalized = normalized.replace(/- ([a-z])/g, '$1');

  // Build concatenated text with boundary tracking (single pass)
  // ...
}
```

In `src/offscreen/offscreen.js`, `matchAndCiteOffscreen` (line 852), the CURRENT state is:

```javascript
// offscreen.js matchAndCiteOffscreen — MISSING THE FIX (current state)
function matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter) {
  const normalized = normalizeTextOffscreen(selectedText);
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // <-- THE FIX MUST BE INSERTED HERE, after the guards, before concat building
  // normalized = normalized.replace(/- ([a-z])/g, '$1');  // MISSING

  let concat = '';
  const boundaries = [];
  // ...
}
```

Note the structural difference: in `text-matcher.js`, `normalized` is declared with `let` (enabling reassignment). In `offscreen.js`, `normalized` is declared with `const` at line 853. The fix requires changing `const normalized` to `let normalized` so that `normalized = normalized.replace(...)` is valid.

### Pattern 2: Export for Testability

`offscreen.js` is already an ES module (`type="module"` in its HTML loader). Adding `export` to `matchAndCiteOffscreen` is safe — consistent with the Phase 8 decision that `export` keywords are safe in ES modules (the Phase 8 decision about classic scripts not supporting `export` applies to content scripts, not offscreen modules).

The test file can then do:

```javascript
import { matchAndCiteOffscreen } from '../../src/offscreen/offscreen.js';
```

However, `offscreen.js` also registers `chrome.runtime.onMessage` at module scope (line 48). Importing it in Vitest without a chrome stub will throw. Use `vi.stubGlobal` before the import:

```javascript
// tests/unit/offscreen-matcher.test.js
import { beforeAll, describe, it, expect, vi } from 'vitest';

// Stub chrome global before importing the module
beforeAll(() => {
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(),
    },
  });
});

// Dynamic import needed because vi.stubGlobal must run before module evaluation
const { matchAndCiteOffscreen } = await import('../../src/offscreen/offscreen.js');
```

Alternatively, use a top-level `globalThis.chrome = {...}` in a Vitest setup file, then import normally. The existing pattern (Phase 8 decision: `vi.stubGlobal`) is the established approach.

### Pattern 3: Minimal Scope — Only What's Needed

The fix scope is intentionally narrow:
1. Change `const normalized` to `let normalized` in `matchAndCiteOffscreen`
2. Add the wrap-hyphen regex line after the guard clauses
3. Add the explanatory comment block (copy from `text-matcher.js` for consistency)
4. Export `matchAndCiteOffscreen` (and helpers if needed for test isolation)
5. Add a test that calls `matchAndCiteOffscreen` with a wrap-hyphenated input and asserts a correct match

Do NOT: refactor the duplication, move functions to a shared module, change the overall architecture, or alter any other matching logic.

### Anti-Patterns to Avoid

- **Fixing `normalizeTextOffscreen` instead of `matchAndCiteOffscreen`:** The Phase 9 decision was explicit — the wrap-hyphen strip must NOT go in `normalizeText`/`normalizeTextOffscreen` because that function is called for both selected text AND individual PDF concat entries. Adding it to `normalizeText` would incorrectly strip real hyphens from PDF entries. The fix belongs in the calling function (`matchAndCite`/`matchAndCiteOffscreen`) where it can be applied only to the selected text.
- **Using `replace_all` on `const` declarations:** Only the one `const normalized` at the top of `matchAndCiteOffscreen` needs changing to `let`. Other `const normalized` declarations inside helper functions (e.g., in `pickBestByContext`) must not be changed.
- **Skipping the test:** The validation gap (no test for `matchAndCiteOffscreen`) is a requirement gap, not optional cleanup. ACCY-03 requires regression validation; without a test, the fix is unverified.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chrome API stub in tests | Custom mock factory | `vi.stubGlobal('chrome', {...})` | Established Phase 8 pattern; Vitest has native support |
| Test fixture for wrap-hyphen case | New JSON fixture | Inline `positionMap` array in test | The test only needs 2-3 entries to prove the fix; full fixture unnecessary |
| Accuracy validation | New accuracy script | `npx vitest run` is sufficient | Fix is targeted; existing golden suite confirms no regressions in `text-matcher.js` path; new test confirms the offscreen path |

---

## Common Pitfalls

### Pitfall 1: `const` vs `let` Declaration

**What goes wrong:** The fix `normalized = normalized.replace(/- ([a-z])/g, '$1')` fails at runtime with "Assignment to constant variable" because `matchAndCiteOffscreen` declares `normalized` with `const` (line 853), unlike `matchAndCite` which uses `let`.

**Why it happens:** The two functions were written independently and the offscreen version used `const` for the normalized variable since no reassignment was needed at the time.

**How to avoid:** Change `const normalized` to `let normalized` on the first line of `matchAndCiteOffscreen`. Verify by searching for `const normalized` in the function scope before committing.

**Warning signs:** The test passes (string is returned) but the wrap-hyphen case still fails — if you forgot the `let` change and the runtime silently fails (strict mode off), the replace won't execute. In strict mode (ES modules are always strict) this will throw, making it unmissable.

### Pitfall 2: Dynamic Import Ordering in Tests

**What goes wrong:** `vi.stubGlobal` is called after the module has already been imported and evaluated, so `chrome` is still undefined when `offscreen.js` runs its top-level `chrome.runtime.onMessage.addListener(...)` at import time.

**Why it happens:** Static imports are hoisted — `import { matchAndCiteOffscreen } from '../../src/offscreen/offscreen.js'` evaluates before any test setup code runs.

**How to avoid:** Use a dynamic `import()` inside a `beforeAll` or at the top level of an async test setup, after `vi.stubGlobal` has run. Or use a Vitest setup file to install the chrome stub globally before any test file is loaded.

**Warning signs:** Test file throws `ReferenceError: chrome is not defined` when importing the module.

### Pitfall 3: Wrong Fix Location (normalizeTextOffscreen)

**What goes wrong:** The regex is added to `normalizeTextOffscreen` instead of `matchAndCiteOffscreen`, which silently corrupts real hyphen handling in PDF concat entries.

**Why it happens:** `normalizeTextOffscreen` is the more obvious location for text normalization. The Phase 9 decision to place it in `matchAndCite` rather than `normalizeText` was deliberate but easy to forget.

**How to avoid:** Always check the Phase 9 summary/decisions before editing. The key constraint: `normalizeTextOffscreen` is called for both `selectedText` AND each `entry.text` in the concat loop (line 862). The wrap-hyphen strip must only apply to `selectedText`. Place the fix between the `normalizeTextOffscreen` call and the `let concat = ''` initialization.

**Warning signs:** Test passes but a new test with a real hyphenated word (e.g., `"well-known"`) in the fixture produces a wrong match.

### Pitfall 4: Exporting Internal Helpers vs Just the Target Function

**What goes wrong:** Exporting `matchAndCiteOffscreen` causes a Vitest import to pull in `findAllOccurrences`, `pickBestByContext`, etc. as side effects, which reference `normalizeTextOffscreen` — fine. But if any helper is not reachable from the export graph, the test may test a different version of the function than what runs in production.

**Why it happens:** Not a real risk given the functions are all in the same file with no conditional exports.

**How to avoid:** Export only `matchAndCiteOffscreen`. The helpers it calls (`findAllOccurrences`, `pickBestByContext`, `whitespaceStrippedMatch`, `bookendMatch`, `resolveMatchOffscreen`, `formatCitationOffscreen`, `fuzzySubstringMatchOffscreen`, `levenshteinOffscreen`, `normalizeTextOffscreen`) all remain private — they are called via closure, not imported separately. This is the correct minimal export surface.

---

## Code Examples

### The Exact Fix in Context

```javascript
// Source: src/offscreen/offscreen.js — matchAndCiteOffscreen (after fix)
function matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter) {
  let normalized = normalizeTextOffscreen(selectedText);  // CHANGE: const -> let
  if (!normalized || normalized.length < 2) return null;
  if (!positionMap || positionMap.length === 0) return null;

  // Strip HTML-copy line-wrap artifacts from the selected text.
  // When a user selects text on a patent page, the HTML renderer includes
  // the soft-hyphen line-break as a literal "- " (hyphen-space) followed by
  // the continued word on the next visual line. In the PDF, these words are
  // joined without a hyphen (the hyphen is a wrap artifact, not a real hyphen).
  //
  // Pattern: a hyphen followed by a space then a LOWERCASE letter is a wrap
  // artifact. A real hyphen ("well-known") has no space after it.
  //
  // Applied ONLY to the selected text (normalized), NOT to the PDF concat,
  // because the PDF already joins wrap-hyphenated words correctly.
  //
  // Before: "trans- actions, borne by consumers" (HTML copy)
  // After:  "transactions, borne by consumers" (matches PDF concat)
  normalized = normalized.replace(/- ([a-z])/g, '$1');  // ADD THIS LINE

  let concat = '';
  // ... rest of function unchanged
```

### Test Scaffolding for the Offscreen Path

```javascript
// tests/unit/offscreen-matcher.test.js
import { beforeAll, describe, it, expect, vi } from 'vitest';

// Must stub chrome before the module is dynamically imported
beforeAll(() => {
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(),
    },
  });
});

// Dynamic import after stub installation
let matchAndCiteOffscreen;
beforeAll(async () => {
  const mod = await import('../../src/offscreen/offscreen.js');
  matchAndCiteOffscreen = mod.matchAndCiteOffscreen;
});

describe('matchAndCiteOffscreen: wrap-hyphen normalization', () => {
  it('matches wrap-hyphenated selection against un-hyphenated PDF entry', () => {
    // Simulate: HTML copy has "trans- actions", PDF has "transactions"
    const positionMap = [
      { text: 'preventing fraudulent', column: 1, lineNumber: 24, page: 1, section: 'spec', hasWrapHyphen: false },
      { text: 'transactions from occurring', column: 1, lineNumber: 25, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    // User selects text as it appears in the HTML — with wrap hyphen artifact
    const selectedText = 'fraudulent trans- actions from occurring';
    const result = matchAndCiteOffscreen(selectedText, positionMap, '', '');
    expect(result).not.toBeNull();
    expect(result.citation).toBe('1:24-25');
  });

  it('does not strip real hyphens (no space after hyphen)', () => {
    const positionMap = [
      { text: 'well-known prior art', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    const selectedText = 'well-known prior art';
    const result = matchAndCiteOffscreen(selectedText, positionMap, '', '');
    expect(result).not.toBeNull();
    expect(result.citation).toBe('1:10');
  });
});
```

### Confirming Export Syntax is Safe for ES Modules

```javascript
// offscreen.js is loaded via: <script type="module" src="offscreen.js">
// ES modules support named exports — no restriction.
// This is DIFFERENT from content scripts (classic scripts) where export is not valid.
// Phase 8 decision "export keywords removed from content script" applies to content-script.js ONLY.
// offscreen.js was already an ES module; adding export is safe.

export function matchAndCiteOffscreen(selectedText, positionMap, contextBefore, contextAfter) {
  // ...
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wrap-hyphen artifacts cause no-match in content-script path | Fixed in `matchAndCite` via `/- ([a-z])/g` replace | Phase 9 (09-02) | Content-script text selection citations work correctly for wrap-hyphenated text |
| Offscreen path not tested | No unit test for `matchAndCiteOffscreen` exists | Known gap from Phase 9 | Bug persisted undetected because the offscreen code path has zero unit test coverage |

**Deprecated/outdated:**
- The `const normalized` declaration in `matchAndCiteOffscreen`: replaced with `let` to enable in-place reassignment.

---

## Open Questions

1. **Dynamic import vs setup file for chrome stub**
   - What we know: Phase 8 used `vi.stubGlobal` successfully for chrome; `offscreen.js` registers `chrome.runtime.onMessage.addListener` at module scope (line 48)
   - What's unclear: Whether a Vitest setup file (`tests/setup/`) already exists that could host the global chrome stub
   - Recommendation: Check `tests/setup/` contents before deciding. If a setup file already stubs chrome globally, static imports work without dynamic import gymnastics.

2. **Export surface — function only or also helpers**
   - What we know: Only `matchAndCiteOffscreen` is needed for the test
   - What's unclear: Whether future tests would benefit from exporting `normalizeTextOffscreen` separately for unit testing
   - Recommendation: Export only `matchAndCiteOffscreen` for now. Keep scope minimal to Phase 13's success criteria.

3. **Should the golden baseline be extended for the offscreen path**
   - What we know: The existing golden baseline covers `matchAndCite` only (content script path); there is no equivalent corpus test for `matchAndCiteOffscreen`
   - What's unclear: Whether the planner wants a full corpus test or just the targeted smoke test described above
   - Recommendation: A targeted 2-3 case unit test is sufficient for Phase 13. A full corpus test for the offscreen path would require restructuring how fixtures are loaded in that context and is out of scope.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — skipping this section.

---

## Sources

### Primary (HIGH confidence)

- Direct inspection of `src/offscreen/offscreen.js` — confirmed `matchAndCiteOffscreen` at line 852 uses `const normalized`, lacks the wrap-hyphen regex, and registers `chrome.runtime.onMessage.addListener` at module scope (line 48)
- Direct inspection of `src/content/text-matcher.js` — confirmed `matchAndCite` at line 193 uses `let normalized` and includes the wrap-hyphen regex at line 212 with full explanatory comment
- `.planning/phases/09-accuracy-audit-and-algorithm-fixes/09-02-SUMMARY.md` — confirmed "Wrap-hyphen strip placed in matchAndCite (not normalizeText) — applies only to selected text, not PDF concat entries" as a key decision
- `.planning/STATE.md` — confirmed "Wrap-hyphen strip (/ - ([a-z])/g -> '$1') placed in matchAndCite for selected text only, not in normalizeText, to avoid stripping from PDF concat entries" and "TECH DEBT: Matching functions duplicated between content script and offscreen due to MV3 module constraints"
- `tests/unit/text-matcher.test.js` — confirmed no tests import or reference `offscreen.js`; the offscreen path has zero unit test coverage
- `package.json` — confirmed `vitest ^3.0.0`, `npm test` = `vitest run`

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` — Phase 13 description and success criteria confirm the fix scope exactly

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Fix location: HIGH — `matchAndCiteOffscreen` at line 852 in `src/offscreen/offscreen.js` confirmed by direct inspection
- Fix content: HIGH — exact regex `/- ([a-z])/g -> '$1'` confirmed from `text-matcher.js` line 212 and Phase 9 summary
- `const` → `let` requirement: HIGH — `offscreen.js` line 853 confirmed as `const normalized`
- Test approach: MEDIUM — dynamic import pattern for ES modules with chrome stub is standard Vitest but requires checking setup file contents first
- No regressions: HIGH — the fix is purely additive to a function that currently has no wrap-hyphen handling; existing matching strategies are untouched

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (stable domain — no external dependencies; code is internal only)

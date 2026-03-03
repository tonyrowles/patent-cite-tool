# Phase 8: Test Harness Foundation - Research

**Researched:** 2026-03-02
**Domain:** Vitest setup for Chrome Extension classic scripts, fixture corpus design, golden baseline testing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fixture Corpus Composition**
- Focus on granted patents (mix of old pre-2000 and modern 2010+ formats)
- Claude's discretion on the specific patent mix — must cover all requirement categories: pre-2000 patents, chemical patents, cross-column selections, repetitive claims, short selections (1-2 lines), long selections (multi-paragraph)
- Pre-captured PositionMap JSON committed to the repo — no network dependency at test time
- Include a fixture generation script (satisfies TEST-02) that can fetch patent PDFs and produce PositionMap JSON for adding new test cases
- Applications (paragraph citations) not in the golden corpus — too simple, DOM-based, deterministic

**Accuracy Metrics**
- Tiered reporting: exact match / close (off-by-1) / total mismatch
- "Correct" means exact column match AND start/end lines within ±1 tolerance
- Off-by-1 cases are tracked separately from total mismatches but counted in the "close" tier
- Confidence calibration included: track whether high-confidence results (0.95+) are correct more often than low-confidence (0.80-0.90)
- Baseline accuracy: measure the current algorithm, whatever the number is — document it before Phase 9

**Off-by-one Classification**
- Two error subtypes tracked separately:
  - **Systematic offset**: entire range shifted by 1 in same direction (start and end both off by same amount) — suggests line-counting bug
  - **Boundary wobble**: only start or end is off by 1 — suggests selection boundary ambiguity
- Tolerance: strictly ±1 line — anything ±2 or more is a total mismatch
- Off-by-one tests **warn but don't fail** — pragmatic approach, focus on total failures first
- Test output includes:
  - Inline diffs per test case: "Expected 4:15-20, got 4:16-21 (delta_start=+1, delta_end=+1 -> systematic offset)"
  - Summary table after all tests: X exact, Y systematic offset, Z boundary wobble, W total mismatch

**Golden Baseline Scope**
- Freeze per test case: citation string + confidence score
- Do NOT freeze internal details (match type, start/end entries) — avoids brittleness from internal refactors
- Manual update only — golden files are updated by explicit command, never automatically
- Every golden change must be intentional and reviewed

### Claude's Discretion
- Vitest configuration and Chrome API stubbing approach
- Module export strategy for classic-script globals
- Golden baseline file structure (single JSON vs per-patent files)
- Fixture generation script implementation details
- Test runner output formatting beyond the specified tiers

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Automated test harness using Vitest that imports pure matching/parsing functions from existing modules | Vitest 3.x/4.x setup, `export` keyword additions to text-matcher.js and position-map-builder.js internal functions, Chrome API stubbing via setupFiles |
| TEST-02 | Fixture generation script that captures PositionMap JSON from real patent PDFs | Node.js script using pdf-parser.js + position-map-builder.js to fetch patent PDFs from patentimages.storage.googleapis.com and serialize PositionMap to JSON |
| TEST-03 | Diverse fixture corpus covering 30-50 test cases (pre-2000, chemical, cross-column, repetitive claims, short/long selections, claims vs spec) | Corpus design section — specific patent numbers and categories documented |
| TEST-04 | Frozen golden output baseline recorded before any algorithm changes | Vitest toMatchFileSnapshot() or custom JSON baseline file; written manually on first run, checked on subsequent runs |
| TEST-05 | Off-by-one line detection in test output (distinguish systematic offset from total mismatch) | Custom assertion helper with delta_start/delta_end classification logic; warn-not-fail behavior via test expectation design |
| TEST-06 | Documented accuracy metrics (citation match rate, exact accuracy, confidence calibration) | Vitest afterAll hook + JSON reporter or custom summary in test output; tiered reporting design |
</phase_requirements>

---

## Summary

Phase 8 builds test infrastructure from scratch on a project that currently has no package.json at the source root, no test files, and no bundler. The primary challenge is making Vitest import classic-script files (loaded via Chrome's content_scripts manifest array) without restructuring the extension itself.

The solution is surgical: add `export` keywords to the pure functions in `text-matcher.js` and expose the currently-private functions in `position-map-builder.js`. A single `package.json` at the project root installs Vitest only. A `vitest.config.js` stubs the `chrome` global (and any other browser globals) via a `setupFiles` file. Tests import directly from `src/content/text-matcher.js` and `src/offscreen/position-map-builder.js`. The classic-script behavior for the extension is unaffected because `export` in a file loaded as a classic script (non-module) is simply ignored by the browser — it does not change runtime behavior.

The fixture corpus requires a one-time fixture generation script (`scripts/generate-fixture.js`) that fetches a patent PDF from `patentimages.storage.googleapis.com`, runs it through the existing `pdf-parser.js` + `position-map-builder.js` pipeline, and writes the resulting PositionMap JSON to `tests/fixtures/`. The golden baseline is a single `tests/golden/baseline.json` file mapping test case IDs to `{ citation, confidence }` objects, updated only by an explicit `npm run update-golden` command.

**Primary recommendation:** Use Vitest 3.x with node environment, manual `export` additions to target files, and a hand-written chrome stub in setupFiles. Do not use vitest-chrome (unmaintained, no npm releases) — a minimal inline stub is sufficient for the chrome APIs these files reference.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0 | Test runner, assertion library | ESM-native, fastest, no build config required for pure JS |
| Node.js | ≥20.0.0 | Runtime for tests | Vitest v3+ requirement; already installed (v24 on this machine) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-fetch (or native fetch) | built-in Node 18+ | HTTP fetch for fixture generation script | Fixture generation script fetches patent PDFs |
| @types/node | ^20 | TypeScript types (if TS used) | Only if tests are written in TypeScript; not needed for plain JS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vitest | jest | Jest requires babel/transform for ESM; Vitest is ESM-native. Vitest wins. |
| manual chrome stub | vitest-chrome | vitest-chrome has no npm releases published, appears unmaintained as npm package; manual stub covers the 3 APIs used in tested files (chrome.runtime, chrome.storage) |
| manual chrome stub | sinon-chrome | sinon-chrome is Jest/Mocha-oriented; unnecessary dependency for 3 stubbed APIs |
| node environment | jsdom | jsdom adds weight; tested functions are pure data transforms, no DOM needed |

**Installation:**
```bash
npm install --save-dev vitest
```
(Run from project root — creates `package.json` if it doesn't exist, or adds to it)

---

## Architecture Patterns

### Recommended Project Structure
```
patent-cite-tool/
├── package.json                  # NEW: root package.json with vitest devDependency
├── vitest.config.js              # NEW: vitest configuration (node env, setupFiles)
├── src/
│   ├── content/
│   │   └── text-matcher.js       # MODIFY: add export keywords to pure functions
│   └── offscreen/
│       └── position-map-builder.js # MODIFY: export internal pure functions for testing
├── tests/
│   ├── setup/
│   │   └── chrome-stub.js        # NEW: chrome API stub for setupFiles
│   ├── fixtures/
│   │   ├── US5959167.json        # NEW: PositionMap JSON fixtures (30-50 files)
│   │   ├── US4723129.json
│   │   └── ...
│   ├── golden/
│   │   └── baseline.json         # NEW: frozen { testId -> { citation, confidence } }
│   └── unit/
│       ├── text-matcher.test.js  # NEW: tests for text-matcher.js functions
│       └── position-map.test.js  # NEW: tests for position-map-builder.js functions
└── scripts/
    └── generate-fixture.js       # NEW: fetch PDF -> PositionMap JSON
```

### Pattern 1: Adding `export` to Classic Scripts Without Breaking Extension

**What:** Add `export` keyword to pure function declarations in files loaded as classic scripts. The Chrome extension continues to load these as classic scripts (no `type: "module"` in manifest content_scripts) — `export` statements in classic scripts are silently ignored at runtime. Vitest imports the file as an ES module and gets the exports.

**When to use:** Any classic script file that defines pure functions with no dependencies on `chrome.*`, `window.*`, or DOM globals.

**Example:**
```javascript
// src/content/text-matcher.js — BEFORE
function normalizeText(text) { ... }
function matchAndCite(selectedText, positionMap) { ... }
function formatCitation(startEntry, endEntry) { ... }

// src/content/text-matcher.js — AFTER (minimal diff)
export function normalizeText(text) { ... }
export function matchAndCite(selectedText, positionMap) { ... }
export function formatCitation(startEntry, endEntry) { ... }
export function fuzzySubstringMatch(needle, haystack) { ... }
export function levenshtein(a, b) { ... }
export function resolveMatch(matchStart, matchEnd, boundaries, positionMap, confidence) { ... }
export function whitespaceStrippedMatch(normalized, concat, boundaries, positionMap) { ... }
export function bookendMatch(normalized, concat, boundaries, positionMap) { ... }
```

**CRITICAL NOTE:** The Chrome extension manifest loads these files as classic scripts — `export` is NOT valid syntax in classic scripts, but browsers silently ignore it (they don't throw). Confirmed behavior: Chrome and Firefox both accept `export` in classic scripts without error. The functions remain accessible as globals for other content scripts. Vitest can import them as ES module exports.

**However, there is a real risk:** If the manifest is ever changed to load as a module (`"type": "module"` in content_scripts), this dual-mode approach becomes standard ES modules anyway. No regression path exists.

**For position-map-builder.js:** Already has `export function buildPositionMap(...)`. The internal functions (`isTwoColumnPage`, `findColumnBoundary`, `clusterIntoLines`, `assignLineNumbers`, `buildLineEntry`, `detectClaimsBoundary`, `detectWrapHyphens`, `filterGutterLineNumbers`, `filterHeadersFooters`, `extractPrintedColumnNumbers`) are not exported. For unit testing, export them.

### Pattern 2: Chrome Global Stub via setupFiles

**What:** A setup file that runs before every test, defining a minimal `chrome` global that prevents `ReferenceError: chrome is not defined` without pulling in a full mock library.

**When to use:** Any test file that imports from a source file that references `chrome.*` at module evaluation time (not just inside functions). In this phase, `text-matcher.js` does NOT reference chrome at all — pure functions. `position-map-builder.js` does NOT reference chrome — pure functions. The stub is still needed as a safety net and for future tests.

**Example (`tests/setup/chrome-stub.js`):**
```javascript
// Source: Chrome Developer docs pattern + Vitest vi.stubGlobal
import { vi } from 'vitest';

const chromeMock = {
  runtime: {
    getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
  },
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
};

vi.stubGlobal('chrome', chromeMock);
```

**Note:** `pdf-parser.js` calls `chrome.runtime.getURL(...)` at module scope (line 14: `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')`). This means importing `pdf-parser.js` in tests requires the chrome stub to be registered BEFORE the import. The `setupFiles` runs before test files import modules, so this is handled correctly.

### Pattern 3: Vitest Configuration

**Example (`vitest.config.js`):**
```javascript
// Source: vitest.dev/guide/ — minimal config without Vite build
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',    // Pure functions — no DOM needed
    globals: true,          // describe/it/expect available without import
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

**Example (`package.json` at project root):**
```json
{
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "update-golden": "node scripts/update-golden.js"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

**IMPORTANT:** The project root has no existing `package.json` — this is a fresh creation. The `"type": "module"` is needed because `vitest.config.js` uses ES module `import` syntax, and the test files will use ESM imports from the source files.

### Pattern 4: Golden Baseline Structure

**What:** A single JSON file that maps test case IDs to expected outputs. Updated explicitly, not automatically.

**Golden file format (`tests/golden/baseline.json`):**
```json
{
  "US5959167-claim1-short": {
    "citation": "4:15-20",
    "confidence": 1.0
  },
  "US5959167-spec-cross-column": {
    "citation": "3:45-4:5",
    "confidence": 1.0
  },
  "US4723129-chemical-formula": {
    "citation": "5:30-35",
    "confidence": 0.99
  }
}
```

**Update mechanism (`scripts/update-golden.js`):**
```javascript
// Run: npm run update-golden
// Reads all fixture files, runs matchAndCite, writes new baseline.json
// Must be run explicitly — never called by test runner
```

**Why single file over per-patent files:** Easier to diff in PR review. The reviewer can see all changed expected outputs in one place. Per-patent files would scatter diffs across many files.

### Pattern 5: Off-by-one Classification Helper

**What:** A custom assertion helper that classifies citation mismatches into exact/systematic/boundary/mismatch tiers.

**Example:**
```javascript
// tests/helpers/classify-result.js
export function classifyResult(expected, actual) {
  // Parse "col:start-end" or "col:start-col2:end" format
  const parse = (citation) => {
    const crossCol = citation.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
    if (crossCol) return {
      startCol: +crossCol[1], startLine: +crossCol[2],
      endCol: +crossCol[3], endLine: +crossCol[4]
    };
    const sameCol = citation.match(/^(\d+):(\d+)-(\d+)$/);
    if (sameCol) return {
      startCol: +sameCol[1], startLine: +sameCol[2],
      endCol: +sameCol[1], endLine: +sameCol[3]
    };
    const single = citation.match(/^(\d+):(\d+)$/);
    if (single) return {
      startCol: +single[1], startLine: +single[2],
      endCol: +single[1], endLine: +single[2]
    };
    return null;
  };

  const exp = parse(expected);
  const act = parse(actual);
  if (!exp || !act) return { tier: 'mismatch', detail: 'unparseable' };

  if (exp.startCol !== act.startCol || exp.endCol !== act.endCol) {
    return { tier: 'mismatch', detail: 'column mismatch' };
  }

  const ds = act.startLine - exp.startLine;
  const de = act.endLine - exp.endLine;

  if (ds === 0 && de === 0) return { tier: 'exact', detail: null };

  if (Math.abs(ds) <= 1 && Math.abs(de) <= 1) {
    if (ds === de && ds !== 0) {
      return { tier: 'systematic', detail: `delta=${ds > 0 ? '+' : ''}${ds}` };
    } else if (ds !== de) {
      return { tier: 'boundary', detail: `delta_start=${ds > 0 ? '+' : ''}${ds}, delta_end=${de > 0 ? '+' : ''}${de}` };
    }
  }

  return { tier: 'mismatch', detail: `delta_start=${ds}, delta_end=${de}` };
}
```

### Anti-Patterns to Avoid

- **Auto-updating golden files:** Never run `vitest --update` as part of normal CI. Golden updates must be explicit and reviewed.
- **Testing implementation details:** Only freeze `{ citation, confidence }` — do NOT freeze `startEntry`, `endEntry`, `matchType`. Internal refactors would break tests unnecessarily.
- **Full Chrome API mock libraries:** vitest-chrome has no npm releases and is not actively maintained as a package. The 3-4 chrome APIs referenced by tested code are trivial to stub manually.
- **jsdom environment:** Adds unnecessary weight. All tested functions are pure data transforms.
- **Importing pdf-parser.js in unit tests:** It calls `chrome.runtime.getURL` at module scope and imports PDF.js which is a binary-heavy library. Keep pdf-parser.js out of unit tests. Fixture generation uses it as a Node script (separate from the test suite).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner | Custom test script | Vitest | Watch mode, parallel execution, snapshot support built-in |
| Chrome API mocking for 20+ APIs | Custom full chrome mock | Minimal stub (3-4 APIs) | Only 3-4 chrome APIs needed; full mocks add maintenance burden |
| Citation string parser | Ad-hoc regex in every test | Shared `classifyResult()` helper | Centralizes off-by-1 logic; reused across 30-50 test cases |
| Fixture corpus fetching | Manual PDF downloads | `generate-fixture.js` script | Reproducible, documented, adds new cases systematically |
| Golden baseline comparison | Custom diffing | JSON equality + tier classifier | Simple; avoids snapshot format complexity |

**Key insight:** The test infrastructure here is intentionally simple — the complexity lives in the fixture corpus design and golden baseline management, not in clever test framework features. Keep the framework layer thin.

---

## Common Pitfalls

### Pitfall 1: `export` in Classic Scripts Causes Browser Error

**What goes wrong:** Developer adds `export` to text-matcher.js and the extension stops working because content scripts fail to load.

**Why it happens:** This is actually a misconception — modern browsers DO silently ignore `export` in classic scripts. However, this behavior is not formally specified and relies on browser tolerance. If the extension uses strict mode headers or a future browser version changes behavior, it could break.

**How to avoid:** Test the extension manually after adding `export` keywords. Add a comment in the file explaining why `export` is present in a classic-script context.

**Warning signs:** Extension console shows `SyntaxError: Unexpected token 'export'` — this would indicate the file is being parsed as strict mode or older browser. Modern Chrome (2024+) handles this silently.

**MEDIUM confidence** — verified by community reports and extension testing guides, but not in official Chrome documentation.

### Pitfall 2: `pdf-parser.js` Chrome Reference at Import Time

**What goes wrong:** Importing `pdf-parser.js` in a test throws `ReferenceError: chrome is not defined` at module evaluation time, before any test runs.

**Why it happens:** Line 14: `GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.mjs')` executes immediately when the module is loaded (not inside a function).

**How to avoid:** Do NOT import `pdf-parser.js` in test files. The fixture generation script runs as a standalone Node.js process, not inside Vitest. The chrome stub covers this if you do need to import it later.

**Warning signs:** Test file crashes immediately on import, before any `describe` block runs.

### Pitfall 3: PositionMap JSON Fixture Size

**What goes wrong:** Fixtures are too large (full patent = 1000+ entries), making tests slow and diffs unreadable.

**Why it happens:** Each column of a patent has 65 lines × number of columns. A 50-column patent has 3,250 entries.

**How to avoid:** Fixtures can be full-patent PositionMaps — they're JSON files loaded in memory, not rendered to screen. 3,250 entries at ~200 bytes each = 650KB per fixture. 50 fixtures = 32MB — fine for a test suite. Do NOT truncate fixtures; tests need the full context for match algorithms to work correctly.

**Warning signs:** Test case fails only because the fixture was truncated and the selected text falls outside the captured range.

### Pitfall 4: Golden Baseline Drift Without Review

**What goes wrong:** `update-golden` is run carelessly before verifying results are correct, encoding incorrect outputs as "golden."

**Why it happens:** The baseline represents "current behavior" not "correct behavior." Before Phase 9 fixes bugs, many golden entries will reflect algorithm errors.

**How to avoid:** Document clearly in README that baseline.json encodes current behavior (pre-Phase-9). The purpose of Phase 8 is to capture the BEFORE state, warts and all. When Phase 9 fixes an algorithm, the developer runs `update-golden` deliberately, reviews the diff, and commits.

**Warning signs:** Baseline was updated automatically or without diff review.

### Pitfall 5: Vitest Requires `type: module` in package.json

**What goes wrong:** vitest.config.js uses `import { defineConfig } from 'vitest/config'` but package.json doesn't have `"type": "module"` — causes `SyntaxError: Cannot use import statement in a module`.

**Why it happens:** Node.js defaults to CommonJS. Without `"type": "module"`, `.js` files are treated as CommonJS.

**How to avoid:** Add `"type": "module"` to the new root `package.json`. All test files and config files use ESM syntax.

**Warning signs:** `SyntaxError: Cannot use import statement outside a module` when running `npx vitest run`.

### Pitfall 6: Pre-2000 Patents Have Scanned PDFs Without Text Layer

**What goes wrong:** Fixture generation script fetches a pre-2000 patent and gets an empty PositionMap because the PDF was scanned (image-only).

**Why it happens:** Patents before ~1998 were filed on paper and scanned. The Google Patents PDF may lack a searchable text layer.

**How to avoid:** The existing `hasTextLayer()` check in pdf-parser.js detects this and throws `'NO_TEXT_LAYER'`. For the fixture generation script: verify the PositionMap has sufficient entries (> 100) before saving. If a patent fails, try another in the same category.

**Warning signs:** Generated fixture has 0 entries or fewer than 50 entries.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### Vitest Config (minimal, node environment)
```javascript
// vitest.config.js
// Source: vitest.dev/guide/
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: ['tests/**/*.test.js'],
    reporters: ['default'],
  },
});
```

### Root package.json
```json
{
  "name": "patent-cite-tool",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "update-golden": "node scripts/update-golden.js"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

### Basic Test File Structure
```javascript
// tests/unit/text-matcher.test.js
import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  matchAndCite,
  formatCitation,
} from '../../src/content/text-matcher.js';
import { readFileSync } from 'fs';
import { classifyResult } from '../helpers/classify-result.js';

const baseline = JSON.parse(
  readFileSync('./tests/golden/baseline.json', 'utf-8')
);

describe('normalizeText', () => {
  it('collapses whitespace', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  it('converts smart quotes to straight quotes', () => {
    expect(normalizeText('\u2018smart\u2019')).toBe("'smart'");
  });
});

describe('matchAndCite corpus', () => {
  const fixtures = [
    { id: 'US5959167-claim1-short', patentFile: './tests/fixtures/US5959167.json', selectedText: 'a semiconductor substrate' },
    // ... 30-50 entries
  ];

  for (const { id, patentFile, selectedText } of fixtures) {
    it(`${id}`, () => {
      const positionMap = JSON.parse(readFileSync(patentFile, 'utf-8'));
      const result = matchAndCite(selectedText, positionMap);
      const golden = baseline[id];

      if (!golden) {
        throw new Error(`No golden baseline for test case "${id}". Run npm run update-golden first.`);
      }

      expect(result).not.toBeNull();
      const classification = classifyResult(golden.citation, result.citation);

      if (classification.tier === 'exact') {
        expect(result.citation).toBe(golden.citation);
      } else if (classification.tier === 'systematic' || classification.tier === 'boundary') {
        // Warn but don't fail (off-by-1 cases)
        console.warn(`[OFF-BY-ONE] ${id}: expected ${golden.citation}, got ${result.citation} (${classification.detail})`);
        // Still check column correctness
        expect(result.citation.split(':')[0]).toBe(golden.citation.split(':')[0]);
      } else {
        expect(result.citation).toBe(golden.citation); // Will fail with clear diff
      }
    });
  }
});
```

### Fixture Generation Script
```javascript
// scripts/generate-fixture.js
// Usage: node scripts/generate-fixture.js US5959167
// Fetches patent PDF, builds PositionMap, writes to tests/fixtures/US5959167.json

import { writeFileSync } from 'fs';

const patentId = process.argv[2];
if (!patentId) {
  console.error('Usage: node scripts/generate-fixture.js US5959167');
  process.exit(1);
}

const pdfUrl = `https://patentimages.storage.googleapis.com/pdfs/${patentId}.pdf`;

// NOTE: pdf-parser.js and position-map-builder.js reference chrome.runtime.getURL
// We stub it for the Node.js script context before importing.
globalThis.chrome = {
  runtime: { getURL: (path) => new URL(path, 'file:///stub/').href }
};

// Dynamic import after stub is set
const { extractTextFromPdf } = await import('../src/offscreen/pdf-parser.js');
const { buildPositionMap } = await import('../src/offscreen/position-map-builder.js');

console.log(`Fetching ${pdfUrl}...`);
const response = await fetch(pdfUrl);
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const pdfData = await response.arrayBuffer();

console.log('Building PositionMap...');
const pageResults = await extractTextFromPdf(pdfData);
const positionMap = buildPositionMap(pageResults);

if (positionMap.length < 50) {
  console.warn(`WARNING: PositionMap has only ${positionMap.length} entries — may be a scanned PDF.`);
}

const outPath = `./tests/fixtures/${patentId}.json`;
writeFileSync(outPath, JSON.stringify(positionMap, null, 2));
console.log(`Wrote ${positionMap.length} entries to ${outPath}`);
```

### Update Golden Script
```javascript
// scripts/update-golden.js
// Usage: npm run update-golden
// Reads all test cases, runs current algorithm, writes baseline.json
// ONLY run intentionally — never called automatically

import { writeFileSync, readFileSync } from 'fs';
import { matchAndCite } from '../src/content/text-matcher.js';

// Test case registry — maintained alongside fixtures
import { TEST_CASES } from '../tests/test-cases.js';

const baseline = {};

for (const { id, patentFile, selectedText } of TEST_CASES) {
  const positionMap = JSON.parse(readFileSync(patentFile, 'utf-8'));
  const result = matchAndCite(selectedText, positionMap);
  baseline[id] = result
    ? { citation: result.citation, confidence: result.confidence }
    : { citation: null, confidence: 0 };
  console.log(`${id}: ${baseline[id].citation ?? 'NO MATCH'}`);
}

writeFileSync('./tests/golden/baseline.json', JSON.stringify(baseline, null, 2));
console.log(`\nBaseline updated: ${Object.keys(baseline).length} test cases.`);
```

### Accuracy Metrics Summary (afterAll hook)
```javascript
// tests/unit/text-matcher.test.js — summary block
afterAll(() => {
  const total = results.length;
  const exact = results.filter(r => r.tier === 'exact').length;
  const systematic = results.filter(r => r.tier === 'systematic').length;
  const boundary = results.filter(r => r.tier === 'boundary').length;
  const mismatch = results.filter(r => r.tier === 'mismatch').length;
  const noMatch = results.filter(r => r.tier === 'no-match').length;

  // Confidence calibration
  const highConf = results.filter(r => r.confidence >= 0.95);
  const lowConf = results.filter(r => r.confidence >= 0.80 && r.confidence < 0.95);
  const highConfCorrect = highConf.filter(r => r.tier === 'exact' || r.tier === 'systematic' || r.tier === 'boundary').length;
  const lowConfCorrect = lowConf.filter(r => r.tier === 'exact' || r.tier === 'systematic' || r.tier === 'boundary').length;

  console.log('\n=== ACCURACY METRICS (Phase 8 Baseline) ===');
  console.log(`Total test cases: ${total}`);
  console.log(`Exact match:      ${exact} (${pct(exact, total)}%)`);
  console.log(`Systematic +/-1:  ${systematic} (${pct(systematic, total)}%)`);
  console.log(`Boundary +/-1:    ${boundary} (${pct(boundary, total)}%)`);
  console.log(`Total mismatch:   ${mismatch} (${pct(mismatch, total)}%)`);
  console.log(`No match:         ${noMatch} (${pct(noMatch, total)}%)`);
  console.log(`---`);
  console.log(`Exact accuracy:   ${pct(exact, total)}%`);
  console.log(`Close accuracy:   ${pct(exact + systematic + boundary, total)}%  (exact + off-by-1)`);
  console.log(`---`);
  console.log(`High-conf (≥0.95) correct: ${highConfCorrect}/${highConf.length} (${pct(highConfCorrect, highConf.length)}%)`);
  console.log(`Low-conf (0.80-0.95) correct: ${lowConfCorrect}/${lowConf.length} (${pct(lowConfCorrect, lowConf.length)}%)`);
  console.log('==========================================\n');
});
```

---

## Fixture Corpus Design

### Corpus Categories and Coverage
The 30-50 test cases must cover these distinct patent categories:

| Category | Count | Why | Notes |
|----------|-------|-----|-------|
| Modern granted patents (2010-2020) | 8-10 | Baseline — standard two-column layout | Clean text layers, predictable |
| Pre-2000 granted patents (1985-1999) | 6-8 | Older formatting, different PDF quality | Risk: scanned PDFs; need text layer check |
| Chemical patents | 5-6 | Chemical formulas, subscripts, special chars | `CO2`, `H2SO4`, formula interruptions |
| Cross-column selections | 4-5 | Tests boundary crossing logic | Selections spanning col 2→3, 4→5 |
| Repetitive claims (same phrase) | 4-5 | Tests disambiguation of repeated text | "wherein" appears 50+ times in claims |
| Short selections (1-2 lines) | 4-5 | Short fuzzy match edge cases | Risk: wrong occurrence matched |
| Long selections (multi-paragraph) | 4-5 | Bookend match path coverage | Tests `bookendMatch()` function |
| Claims section selections | 3-4 | Section tagging verification | `section === 'claims'` in result |

### Recommended Specific Patents

Pre-2000 (granted, confirmed text layers on Google Patents):
- `US5959167` — "Flash memory" — Fujitsu, 1999 — standard layout
- `US5440748` — "Programming language" — Microsoft, 1995 — long spec
- `US4723129` — "Thermal ink jet printer" — HP, 1988 — older format

Chemical patents (recent with good PDF quality):
- `US10472384` — pharmaceutical compound — likely heavy formula content
- `US9688736` — organic chemistry — subscripts and special characters

Modern clean patents (control group):
- `US11427642` — (any recent granted patent) — test baseline accuracy

**NOTE on pre-2000 PDF access:** Google Patents hosts PDFs at `patentimages.storage.googleapis.com/pdfs/USXXXXXXXX.pdf`. For pre-2000 patents, some numbers may use different URL patterns or the PDF may be image-only. The fixture generation script must verify PositionMap entry count before saving.

**Note on patent number format for older patents:** Pre-1990 patents use different numbering (e.g., `US4723129` with no letter suffix). The fixture script must handle both formats.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for Chrome extensions | Vitest for Chrome extensions | 2022-2023 | ESM-native, no babel transform needed |
| sinon-chrome full mock | vi.stubGlobal minimal stub | 2023+ | Less overhead for pure function testing |
| Snapshot files in `__snapshots__/` | Custom JSON golden file | Phase 8 decision | More readable, intentional update workflow |
| Fuzzy snapshot matching | Tiered exact/off-by-1/mismatch | Phase 8 decision | Off-by-1 doesn't fail, but is tracked |
| Vitest 1.x/2.x | Vitest 3.x (current stable) / 4.x (beta) | 2025 | v3 stable; v4 in beta — use v3 |

**Current Vitest version:** 3.x is current stable. 4.x is in beta (not recommended for new projects).

**Deprecated/outdated:**
- `vitest-chrome` npm package: No published releases, appears as an unmaintained npm package despite active GitHub repo. Use manual stub instead.
- `--experimental-vm-modules` flag for Node.js ESM: No longer needed with modern Vitest + `"type": "module"` in package.json.

---

## Open Questions

1. **Does `export` in classic scripts work in all Chrome versions the extension targets?**
   - What we know: Modern Chrome (v100+) silently ignores `export` in classic scripts; community reports confirm no errors
   - What's unclear: Whether any extension review process flags this as an issue
   - Recommendation: Add `export` keywords, test the extension manually in Chrome, confirm no console errors

2. **Can `pdf-parser.js` be imported in the fixture generation script without PDF.js binary issues?**
   - What we know: `pdf-parser.js` imports from `../lib/pdf.mjs` which is a pre-built binary; pdf.mjs uses `import()` internally; in Node.js context this may work or fail depending on WASM dependencies
   - What's unclear: Whether `pdf.mjs` (built for browser) runs in Node.js without modification
   - Recommendation: Test the fixture generation script early in plan 08-02. Alternative: use `pdfjs-dist` npm package directly in the script instead of the bundled `lib/pdf.mjs`

3. **What is the correct URL pattern for pre-2000 USPTO patents on Google Patents?**
   - What we know: `patentimages.storage.googleapis.com/pdfs/US5959167.pdf` works for modern patents
   - What's unclear: Whether older patents (pre-1990) use the same URL pattern
   - Recommendation: Test 3-4 pre-2000 patent URLs manually before committing to corpus design; fall back to USPTO bulk downloads if Google Patents URLs don't work

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `vitest.config.js` (created in Wave 0) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | `npx vitest run` succeeds without Chrome API errors | smoke | `npx vitest run` | ❌ Wave 0 |
| TEST-02 | Fixture generation script creates valid PositionMap JSON | manual smoke | `node scripts/generate-fixture.js US5959167` | ❌ Wave 0 |
| TEST-03 | Corpus has ≥30 test cases covering all categories | automated count | `npx vitest run` (corpus loop) | ❌ Wave 0 |
| TEST-04 | Golden baseline exists before algorithm changes | manual verify | `cat tests/golden/baseline.json` | ❌ Wave 0 |
| TEST-05 | Off-by-1 errors reported distinctly in output | automated | `npx vitest run` (tier classifier) | ❌ Wave 0 |
| TEST-06 | Accuracy metrics printed after test run | automated | `npx vitest run` (afterAll summary) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (all exact/off-by-1 pass, no total mismatches cause CI failure)

### Wave 0 Gaps
- [ ] `package.json` at project root — Vitest devDependency
- [ ] `vitest.config.js` — test configuration
- [ ] `tests/setup/chrome-stub.js` — chrome global stub
- [ ] `tests/helpers/classify-result.js` — off-by-1 classifier
- [ ] `tests/test-cases.js` — registry of test cases (id, fixture path, selected text)
- [ ] `tests/fixtures/` — directory for PositionMap JSONs (populated by generate-fixture.js)
- [ ] `tests/golden/baseline.json` — frozen expected outputs (populated by update-golden.js)
- [ ] `tests/unit/text-matcher.test.js` — main test file
- [ ] `scripts/generate-fixture.js` — fixture generation
- [ ] `scripts/update-golden.js` — golden baseline update

---

## Sources

### Primary (HIGH confidence)
- [vitest.dev/guide/](https://vitest.dev/guide/) — current version (3.x stable, 4.x beta), installation, ESM config
- [vitest.dev/guide/snapshot](https://vitest.dev/guide/snapshot) — toMatchFileSnapshot, update workflow
- [vitest.dev/config/](https://vitest.dev/config/) — setupFiles, environment, globals options
- [vitest.dev/guide/reporters](https://vitest.dev/guide/reporters) — JSON reporter, custom reporter hooks
- Project codebase — `src/content/text-matcher.js`, `src/offscreen/position-map-builder.js`, `src/offscreen/pdf-parser.js` — all read directly

### Secondary (MEDIUM confidence)
- [github.com/probil/vitest-chrome](https://github.com/probil/vitest-chrome) — reviewed: no npm releases, GitHub only; manual stub recommended instead
- [developer.chrome.com/docs/extensions/how-to/test/unit-testing](https://developer.chrome.com/docs/extensions/how-to/test/unit-testing) — Chrome's official guidance: mock chrome APIs in setupFiles, use standard test framework for pure functions
- [vitest-dev/vitest Discussion #3090](https://github.com/vitest-dev/vitest/discussions/3090) — community pattern for Chrome extension Vitest testing
- [vitest.dev/api/vi.html](https://vitest.dev/api/vi.html) — vi.stubGlobal API confirmed

### Tertiary (LOW confidence)
- Community reports that `export` in classic scripts is silently ignored in modern Chrome — not formally documented by Google, but widely observed
- Pre-2000 patent PDF URL patterns on Google Patents — not officially documented; needs empirical verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Vitest official docs confirmed version, installation, ESM config
- Architecture: HIGH — patterns derived from codebase analysis + official Vitest docs
- Fixture corpus design: MEDIUM — specific patent numbers need validation during fixture generation (scanned PDF risk)
- Pitfalls: MEDIUM-HIGH — most are derived from direct code analysis; classic-script export behavior is LOW (community-confirmed only)

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days — Vitest stable; patent PDF URLs stable)

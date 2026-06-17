# Phase 2: Shared Constants + Pure Payload Builder - Pattern Map

**Mapped:** 2026-06-13
**Files analyzed:** 3 (1 modify, 2 new)
**Analogs found:** 3 / 3 (all exact or strong role+data-flow matches)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/constants.js` (MODIFY) | config / constants module | static-config (frozen literals, no I/O) | itself — extend existing `MSG`/`STATUS`/`PATENT_TYPE` exports | exact (self-extend) |
| `src/shared/report-payload-builder.js` (NEW) | utility / pure-builder | transform (inputs → frozen object, no I/O, no crypto) | `tests/e2e/lib/issue-payload-builder.js` | exact (named precedent) |
| Extension Vitest suite (NEW) | test | request-response assertions over pure fns | `tests/unit/issue-payload-builder.test.js` + `tests/unit/shared-constants.test.js` | exact (two complementary analogs) |

**Canonical contract (not an analog — the field allowlist the builder OUTPUT must conform to):** `worker/src/report-schema.md` (20-field table; builder emits the 17 non-server-computed fields).

---

## Pattern Assignments

### `src/shared/constants.js` (config, static-config) — MODIFY

**Analog:** itself. The file already has the exact pattern to extend — named `export const` objects of kebab-case string literals. Three additions per D-02; one header-comment fix per D-01.

**Existing `MSG` export pattern to extend** (`src/shared/constants.js:9-27`) — append `SUBMIT_REPORT` as a new key (kebab-case `'submit-report'` per Claude's Discretion), keeping the existing object-literal style:
```javascript
export const MSG = {
  PATENT_PAGE_DETECTED: 'patent-page-detected',
  // ... existing 17 keys ...
  UPLOAD_TO_CACHE: 'upload-to-cache',
  SUBMIT_REPORT: 'submit-report',   // PAY-05 (NEW)
};
```

**Frozen-array export pattern to copy** — there is NO `Object.freeze` usage in `constants.js` today (its three objects are plain). The frozen-array idiom comes from the builder-precedent analog `tests/e2e/lib/issue-payload-builder.js:51-54`. Apply that exact shape for `REPORT_CATEGORIES` (D-02 requires frozen, exact 4-element order):
```javascript
// idiom sourced from issue-payload-builder.js:51-54 (FORBIDDEN_DELIMITERS)
export const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_citation',
  'no_match',
  'tool_not_working',
  'other',
]);

export const WORKER_REPORT_URL = 'https://pct.tonyrowles.com/report';
```

**Stale header comment to FIX (D-01)** (`src/shared/constants.js:1-7`) — the current header falsely claims content scripts use a `constants-globals.js` classic-script wrapper. That file no longer exists; all surfaces `import` from this module (esbuild bundles per-target). Rewrite lines 4-6 to state this module is the single source of truth bundled per-target. The exact stale lines to remove:
```javascript
 * Pure ES module — import these in service worker and other ESM contexts.
 * Content scripts use src/content/constants-globals.js (classic script wrapper)
 * which defines MSG, STATUS, and PATENT_TYPE as globals without import/export.
```

**Zero-`chrome.*` note:** this module already makes zero `chrome.*` calls; the additions must preserve that (SC4). No imports needed for any of the three additions.

---

### `src/shared/report-payload-builder.js` (utility, transform) — NEW

**Analog:** `tests/e2e/lib/issue-payload-builder.js` — the PAY-06-named precedent. Mirror its architectural shape: leading doc-comment stating purity invariants, exported constants block, private helpers, single public entry-point that constructs and returns a plain object. Do NOT copy its markdown/budget/delimiter logic (those are issue-specific); copy the STRUCTURE and the purity discipline.

**Purity doc-header pattern** (`issue-payload-builder.js:1-10`) — open the new file with an equivalent invariant banner. The load-bearing invariant to mirror (`issue-payload-builder.js:7-8`):
```javascript
// D-04: PURE — same inputs → same output (string). No fs, path, child_process. No crypto:
//       the CLI computes the fingerprint and passes it in as a parameter.
```
For this builder the equivalent invariant is: same inputs → byte-identical object (SC3); no `chrome.*`, no `fs`/`path`/`child_process`, no `crypto` — the **Worker** computes `fingerprint`/`timestamp`/`duplicate_count` (D-07, report-schema.md:31-32,50).

**Exported-constant + frozen-config pattern** (`issue-payload-builder.js:16-54`) — the precedent exports tunables (`BUDGET_*`) and a frozen list (`FORBIDDEN_DELIMITERS`) for test reuse. This builder imports `REPORT_CATEGORIES`/`WORKER_REPORT_URL` from `constants.js` rather than redefining them; the frozen-array idiom for any local ordered constant follows `issue-payload-builder.js:51-54`.

**Pure private-helper pattern** (`issue-payload-builder.js:64-68`) — defensive, non-throwing helpers that normalize input. Mirror this defaulting style for D-08 optionals (`x ?? null`, `errors ?? []`):
```javascript
function truncate(text, budget) {
  if (typeof text !== 'string') return '';   // defensive on bad input
  if (text.length <= budget) return text;
  return text.slice(0, budget - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}
```

**Public entry-point signature + destructured-params pattern** (`issue-payload-builder.js:159-166`) — the precedent destructures a single options object and JSDocs each field. Mirror exactly for D-03:
```javascript
/**
 * @param {object} params
 * @param {object} params.triageFinding  ...
 * ...
 * @returns {{ title: string, body: string, labels: string[] }}
 */
export function buildIssuePayload({ triageFinding, iteration, rerunEntry, ... }) {
  const caseId = iteration?.case_id ?? iteration?.llm_selection?.patentId ?? 'UNKNOWN';
  // ... derive, then return a plain object ...
}
```
New signature (D-03): `buildReportPayload({ context, category, note, settings, errors, includeSelectionText })`.

**Ordered object-literal construction pattern** (`issue-payload-builder.js:248-263`) — the precedent assembles its output as an explicit ordered literal (`body` array join, then `return { title, body, labels }`). This is the exact technique D-07 requires for byte-stable `JSON.stringify`: build the payload as ONE explicit ordered object literal whose key order = report-schema.md table order MINUS the 3 server-computed fields. Order from `worker/src/report-schema.md:30-51`:
```
category, patentNumber, patentUrl, selectionText(conditional, D-06),
returnedCitation, confidenceTier, extensionVersion, browser, os,
xpathNode, scrollY, viewportWidth, viewportHeight, pdfParseStatus,
triggerMode, errorLog, note
```
(EXCLUDE `fingerprint`, `timestamp`, `duplicate_count` — server-computed, report-schema.md:75. NEVER include `ip`, `clientIp`, `userAgent` — PAY-03 hard constraint, report-schema.md:58-68.)

**D-06 conditional-key technique (the LONE exception to ordered-literal):** because `selectionText` must be ENTIRELY ABSENT when `includeSelectionText === false` (not `null`), a single static literal cannot express it. Construct the base literal WITHOUT `selectionText`, then conditionally splice it in at the correct position, OR build via ordered insertion. Spread-at-position keeps byte-stability:
```javascript
// pattern: conditionally include a key while preserving deterministic order
const payload = {
  category,
  patentNumber,
  patentUrl,
  ...(includeSelectionText ? { selectionText: context.selectionText ?? null } : {}),
  returnedCitation,
  // ... rest in schema order ...
};
```

**D-05 throw-on-invalid pattern:** the precedent is defensive-non-throwing; this builder DEVIATES per D-05 — it MUST throw a descriptive `Error` on the 3 required-field violations (empty `patentNumber`; `category` not in `REPORT_CATEGORIES`; empty `extensionVersion`), mirroring the Worker's D-09 gate client-side (01-CONTEXT D-09; report-schema.md:33,39 mark these `Nullable: No`). Throw BEFORE constructing the payload. No analog for the throw itself — it is a Phase-2-specific guard; wording is Claude's Discretion.

---

### Extension Vitest suite (test) — NEW

Two complementary analogs cover the four SC areas. Use `issue-payload-builder.test.js` for builder-behavior + purity-grep structure; use `shared-constants.test.js` for the constants-import + key-count structure.

**Analog A — `tests/unit/issue-payload-builder.test.js`** (builder tests)

**Import + describe/it/expect harness** (`issue-payload-builder.test.js:24-39`) — globals are enabled (`vitest.config.js:6`) but the precedent imports explicitly anyway; match it:
```javascript
import { describe, it, expect } from 'vitest';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';
import { REPORT_CATEGORIES, WORKER_REPORT_URL, MSG } from '../../src/shared/constants.js';
```

**Fresh-fixture factory pattern** (`issue-payload-builder.test.js:47-82`) — `makeFixtureInputs(overrides = {})` returns a fresh object per test (prevents mutation bleed). Mirror for a valid `context`/`settings`/`errors` fixture:
```javascript
function makeReportInputs(overrides = {}) {
  return {
    context: { patentNumber: '12505414', extensionVersion: '5.0.0', selectionText: '...', /* ... */ },
    category: 'no_match',
    note: null,
    settings: { triggerMode: 'floating' },
    errors: [],
    includeSelectionText: true,
    ...overrides,
  };
}
```

**SC3 byte-stable determinism test** (`issue-payload-builder.test.js:101-110`, Test 1) — call the builder twice with identical inputs, assert equality. For SC3 assert byte-identical SERIALIZATION (the schema-contract metric):
```javascript
const a = buildReportPayload(inputs);
const b = buildReportPayload(inputs);
expect(JSON.stringify(a)).toBe(JSON.stringify(b));   // SC3: byte-stable
```
A stronger byte-stability precedent exists at `tests/unit/fix-prompt-builder-byte-stability.test.js:21,38-46` (sha256 pin of the serialized output) if a pinned digest is wanted; the twice-call equality above is the lighter-weight idiom and sufficient for SC3.

**SC1 allowlist-only test** (adapt the section-presence pattern, `issue-payload-builder.test.js:133-146`, Test 4) — instead of section headers, assert `Object.keys(payload)` is a subset of the schema allowlist AND the forbidden trio is absent:
```javascript
const keys = Object.keys(buildReportPayload(inputs));
expect(keys).not.toContain('fingerprint');   // server-computed (report-schema.md:75)
expect(keys).not.toContain('ip');             // PAY-03 (report-schema.md:58-68)
expect(keys).not.toContain('userAgent');
```

**SC2 selectionText omit/present test** (adapt the defensive-input pattern, `issue-payload-builder.test.js:321-342`, Tests 11-12):
```javascript
it('omits selectionText entirely when includeSelectionText=false (D-06)', () => {
  const p = buildReportPayload(makeReportInputs({ includeSelectionText: false }));
  expect('selectionText' in p).toBe(false);   // absent — not null, not ''
});
it('includes selectionText when toggle on', () => {
  const p = buildReportPayload(makeReportInputs({ includeSelectionText: true }));
  expect('selectionText' in p).toBe(true);
});
```

**D-05 throw assertion** (use `expect(...).toThrow()`; precedent uses the inverse `.not.toThrow()` at `issue-payload-builder.test.js:325`):
```javascript
expect(() => buildReportPayload(makeReportInputs({ context: { extensionVersion: '5.0.0' } }))).toThrow(); // empty patentNumber
expect(() => buildReportPayload(makeReportInputs({ category: 'bogus' }))).toThrow();
```

**SC4 zero-`chrome.*` static-grep test** (copy the purity-guard pattern verbatim, `issue-payload-builder.test.js:24-26,348-356`, Test 13) — read the module SOURCE and assert no forbidden tokens. This is the exact precedent for the static-grep SC4 assertion:
```javascript
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

it('builder source makes zero chrome.* calls and no node-builtin/crypto imports (SC4)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../src/shared/report-payload-builder.js'), 'utf8');
  expect(src).not.toMatch(/chrome\s*\./);
  expect(src).not.toMatch(/from\s+['"]node:(fs|path|child_process|crypto)['"]/);
});
```
Apply the same grep to `constants.js` for the constants half of SC4.

**Analog B — `tests/unit/shared-constants.test.js`** (constants assertions)

**Import + key-count assertion pattern** (`shared-constants.test.js:1-2,10-27`) — the precedent pins exact key counts and exact string values. Mirror for the PAY-05 additions:
```javascript
import { MSG, REPORT_CATEGORIES, WORKER_REPORT_URL } from '../../src/shared/constants.js';

it('MSG.SUBMIT_REPORT is the kebab-case message type', () => {
  expect(MSG.SUBMIT_REPORT).toBe('submit-report');
});
it('REPORT_CATEGORIES is the frozen 4-element list in exact order', () => {
  expect(Object.isFrozen(REPORT_CATEGORIES)).toBe(true);
  expect(REPORT_CATEGORIES).toEqual(['inaccurate_citation', 'no_match', 'tool_not_working', 'other']);
});
it('WORKER_REPORT_URL points at the Phase 1 route', () => {
  expect(WORKER_REPORT_URL).toBe('https://pct.tonyrowles.com/report');
});
```
Note: the existing `shared-constants.test.js:10` pins `MSG` at 17 keys — adding `SUBMIT_REPORT` makes it 18. The plan must either bump that assertion or add the new key-count check; flag this as a required edit to the EXISTING test file (do not silently break it).

---

## Shared Patterns

### Purity / zero-side-effect discipline
**Source:** `tests/e2e/lib/issue-payload-builder.js:7-8` (invariant banner), `tests/unit/issue-payload-builder.test.js:348-356` (static-grep enforcement)
**Apply to:** both new modules + the test
Both Phase 2 modules make ZERO `chrome.*` calls and import no `node:` builtins / `crypto`. Server (Worker) owns `fingerprint`/`timestamp`/`duplicate_count`. Enforce with a `readFileSync` source-grep test (the only precedent for this kind of assertion in the suite).

### Frozen ordered constants
**Source:** `tests/e2e/lib/issue-payload-builder.js:51-54` (`Object.freeze([...])`)
**Apply to:** `REPORT_CATEGORIES` in `constants.js`; any local ordered constant in the builder
Frozen so callers cannot mutate at runtime; exact element order is load-bearing (D-02, report-schema.md:33).

### Explicit-import test harness
**Source:** `tests/unit/issue-payload-builder.test.js:24`, `tests/unit/shared-constants.test.js:1`
**Apply to:** the new test file
`import { describe, it, expect } from 'vitest';` even though `globals: true`. Test path is `tests/unit/*.test.js` (matches `vitest.config.js:8` include glob); import the module under test via `../../src/shared/...` relative path. The `tests/setup/chrome-stub.js` global stub loads automatically but Phase 2 modules need NONE of it (they call no `chrome.*`).

### Byte-stable serialization contract
**Source:** `tests/unit/issue-payload-builder.test.js:101-109` (twice-call equality), `tests/unit/fix-prompt-builder-byte-stability.test.js:21,43` (sha256 pin, stronger option)
**Apply to:** the builder's SC3 test
Deterministic output per identical input. Achieved structurally via the single ordered object-literal construction (D-07); verified by `JSON.stringify(a) === JSON.stringify(b)`.

---

## No Analog Found

None. All three files map to a strong analog. The only behaviors WITHOUT a direct precedent are deviations the plan must implement fresh (documented inline above):

| Behavior | Why no analog | Where to source instead |
|----------|---------------|-------------------------|
| D-05 throw-on-required-violation | issue-payload-builder is defensive-non-throwing | 01-CONTEXT D-09 + report-schema.md:33,39 (the required-field set); wording is Claude's Discretion |
| D-06 entirely-absent `selectionText` key | issue-payload always emits all sections | report-schema.md:36 + ROADMAP SC2; conditional-spread technique documented above |

---

## Metadata

**Analog search scope:** `src/shared/`, `tests/e2e/lib/`, `tests/unit/`, `tests/setup/`, `worker/src/`, repo-root `vitest.config*.js`
**Files scanned (read in full or targeted):** `src/shared/constants.js`, `tests/e2e/lib/issue-payload-builder.js`, `worker/src/report-schema.md`, `tests/unit/shared-constants.test.js`, `tests/unit/shared-matching.test.js`, `tests/unit/issue-payload-builder.test.js`, `tests/unit/fix-prompt-builder-byte-stability.test.js`, `tests/setup/chrome-stub.js`, `vitest.config.js`
**Pattern extraction date:** 2026-06-13

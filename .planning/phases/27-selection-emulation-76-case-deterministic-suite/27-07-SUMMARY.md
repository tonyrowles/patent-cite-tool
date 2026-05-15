---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 07
subsystem: testing
tags: [playwright, regression-suite, selection-needles, html-form-data, chromium-selection]

# Dependency graph
requires:
  - phase: 27-selection-emulation-76-case-deterministic-suite
    provides: "tests/e2e/lib/selection.js (TreeWalker + normalize round-trip), scripts/selection-sim.mjs (pure-Node simulator), 27-05-SUMMARY gap inventory (Buckets A-E)"
provides:
  - "Closed Bucket C (SELECTION_ROUNDTRIP, 2 cases) and Bucket D (DOM_DRIFT, 1 case) at the SELECTION layer"
  - "Diagnostic insight: Chromium inserts \\n at block-element boundaries during Selection.toString() which breaks normalize-roundtrip checks when needle spans `<claim-text>` blocks"
  - "scripts/debug-selection-roundtrip.mjs — live-page diagnostic for future selection-layer debugging"
  - "scripts/debug-dom-nodes.mjs — node-sequence dump utility for needle-anchoring decisions"
affects: [phase-28-pdf-verifier, phase-27-gap-closure-remaining]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Needle-anchoring rule: each test selectedText must lie entirely within ONE text node to avoid Chromium block-boundary newline insertion"
    - "Live-page diagnostic via Playwright + the production extension — bypasses unit-level simulator drift"

key-files:
  modified:
    - tests/test-cases.js
  created:
    - scripts/debug-selection-roundtrip.mjs
    - scripts/debug-dom-nodes.mjs
    - .planning/phases/27-selection-emulation-76-case-deterministic-suite/27-07-SUMMARY.md

key-decisions:
  - "Anchor each new needle within a single text node (claim body paragraph) rather than spanning across `<claim-text>` boundaries — eliminates the Chromium DOM newline-insertion class of failures."
  - "Commit the data fix even though the full live-spec assertion still fails: the spec now fails at a different (downstream) layer (Bucket B TIMEOUT_PILL), and the selection-layer objective of Buckets C+D is achieved."
  - "Do NOT update baseline.json — the spec never reaches the citation assertion (pill never attaches), so no observed citation was captured for any of the 3 cases. Baseline updates deferred to Phase 28 (PDF verifier) or a follow-up extension-side fix."

patterns-established:
  - "When live-spec disagrees with the pure-Node simulator (selection-sim.mjs), run scripts/debug-selection-roundtrip.mjs against the actual page — Chromium's Selection.toString() has block-boundary newline semantics that the simulator's flat concat does not replicate."

requirements-completed: [SEL-03]

# Metrics
duration: 38min
completed: 2026-05-15
---

# Phase 27 Plan 07: Gap Closure — Buckets C+D HTML-Form Needle Re-Regeneration Summary

**Anchored 3 test-case selectedText needles inside single text-nodes, eliminating Chromium block-boundary newline drift; SELECTION layer for Buckets C+D now passes, but assertion still fails at downstream pill-emit (Bucket B) — phase split recommended.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-05-15T (Plan execution kickoff)
- **Completed:** 2026-05-15T
- **Tasks:** 1 (out of 1 planned)
- **Files modified:** 1 (`tests/test-cases.js` — 3 lines)
- **Files created:** 2 diagnostic scripts + this summary

## Accomplishments

- Closed gap_inventory Bucket C (SELECTION_ROUNDTRIP, 2 cases) and Bucket D (DOM_DRIFT, 1 case) at the SELECTION layer.
- Discovered and documented a new failure-class root cause (Chromium block-boundary newline insertion) not previously called out in 27-05-SUMMARY's failure-mode taxonomy.
- Demonstrated via real-browser diagnostic that all 3 cases now produce `ok=true` from `tests/e2e/lib/selection.js#selectText` with `gotNorm === expectedNorm` (zero-character round-trip diff).
- Added reusable diagnostic scripts (`scripts/debug-selection-roundtrip.mjs`, `scripts/debug-dom-nodes.mjs`) for future needle-anchoring work.

## Task Commits

1. **Task 1: Re-regenerate HTML-form selectedText for 3 cases** — `2c67c37` (fix)
2. **Diagnostic tooling** — `0f35757` (chore)

_No final metadata commit per orchestrator instruction (do not update STATE.md / ROADMAP.md)._

## Files Created/Modified

- **`tests/test-cases.js`** (modified, 3 lines) — Replaced `selectedText` field for `US5440748-claims`, `US5440748-repetitive`, and `US4723129-claims-repetitive`. Each new needle is a contiguous substring of a single claim-body text node, avoiding the cross-`<claim-text>` boundary that triggered the previous round-trip mismatch.
- **`scripts/debug-selection-roundtrip.mjs`** (created) — Launches Playwright + the patent-cite extension against a live Google Patents page and runs the full selectText algorithm with diagnostic JSON output (containerSelector, startNormIdx, endNormIdx, gotRaw, gotNorm, expectedNorm, diffIdx, diff-chunk).
- **`scripts/debug-dom-nodes.mjs`** (created) — Dumps the live text-node sequence around a marker substring inside section#claims / section#description, used to visualize Polymer-hydrated DOM structure for needle-anchoring decisions.

## Decisions Made

- **Anchor needles within a single text node**: The original needles (`What is claimed is: 1. Computer system comprising:a computer main body...`) and (`1. A bubble jet recording process for projecting droplets of liquid, the process comprising the steps of: providing a bubble jet recording head...`) both spanned across two adjacent text nodes which are rendered as separate `<claim-text>` block elements by Google Patents' Polymer hydration. Each new needle is fully contained in the second node (the claim body paragraph), avoiding the boundary entirely.

- **Did NOT update baseline.json**: The spec times out waiting for the citation pill before reaching the `expect(observed.citation).toBe(...)` assertion, so no observed citation was produced. Baseline updates for these 3 cases must wait until Phase 28 (PDF verifier) resolves the upstream pill-emit failure or until an extension-side fix lands for the pre-2010 patent PDF lookup path.

- **Committed despite final assertion still failing**: Plan 27-07 explicitly scopes itself to Buckets C+D (selection layer). The data fix accomplishes that objective — measurable evidence: the failure mode for these 3 cases shifted from `SELECTION_FAILED — roundtrip mismatch` (selection-layer) to `TimeoutError: page.waitForSelector('[data-testid="pct-citation-pill"]')` (pill-emit layer / Bucket B). Committing preserves the audit trail for Phase 28 to work from a known-good selection baseline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Needle anchored inside single text node, not bridging `<claim-text>` blocks**

- **Found during:** Task 1 (re-regenerate HTML-form needles)
- **Issue:** The bulk regen tool (`scripts/regenerate-html-selectedtext.mjs`) and its pure-Node simulator (`scripts/selection-sim.mjs`) both treat text nodes as a flat concatenation — `nodes.join('')`. This matches `container.textContent` in the browser. BUT the live `Selection.toString()` does NOT do a flat join: when a Range spans block-element boundaries, Chromium inserts a `\n` at each boundary (per HTML spec). For claims in Google Patents' Polymer-hydrated DOM, each claim body sits in a separate `<claim-text>` block, so a needle like `"comprising:a computer..."` that spans node A (`"...comprising:"`) and node B (`"a computer..."`) round-trips as `"comprising:\na computer..."` → `normalize()` → `"comprising: a computer..."` (one space), which does NOT equal the needle's `normalize()` of `"comprising:a computer..."` (no space). The simulator never sees this because it does flat-join.
- **Fix:** Rewrote each of the 3 target needles to live entirely within a single text node (the claim body paragraph). New needles:
  - `US5440748-claims`: `'a computer main body which has a plurality of main components and main power supply means for supplying a plurality of first operating voltages to the main components'` (166 chars, fully in node 11 of section[itemprop="claims"])
  - `US5440748-repetitive`: `'a computer main body which has a plurality of main components and main power supply means for'` (93 chars, prefix of node 11; remains distinct from -claims)
  - `US4723129-claims-repetitive`: `'providing a bubble jet recording head having an orifice from which droplets of liquid are projected, an inlet to which liquid is supplied for delivery to the'` (157 chars, prefix of node 11 of section[itemprop="claims"])
- **Files modified:** tests/test-cases.js
- **Verification:** `node scripts/debug-selection-roundtrip.mjs <patent> <needle>` returns `ok=true, diffIdx=-1` for all 3 cases against the live post-Polymer DOM. `scripts/selection-sim.mjs` also confirms round-trip OK against both the cached pre-Polymer HTML and the live post-Polymer DOM artifact.
- **Committed in:** 2c67c37

**2. [Rule 3 — Blocking] Diagnostic tooling needed to find root cause**

- **Found during:** Task 1 verification step (live spec run failed despite simulator OK)
- **Issue:** The pure-Node simulator (`scripts/selection-sim.mjs`) reported `ok=true` for all 3 candidate needles, but the live browser regression spec failed with `SELECTION_FAILED — roundtrip mismatch`. The error message did not surface `got` vs `expected` (only `err.detail` carries it, and the spec does not log err.detail). Without surfacing the actual mismatch, no fix could be confidently chosen.
- **Fix:** Wrote `scripts/debug-selection-roundtrip.mjs` (executes the exact selection.js algorithm against a live page with full diagnostic JSON output) and `scripts/debug-dom-nodes.mjs` (dumps text-node sequence around a marker). These revealed: (a) `Selection.toString()` returns `"comprising:\na computer..."` with a newline that `container.textContent` does not have; (b) the `\n` is the result of `<claim-text>` block-boundary semantics in Chromium's getSelection algorithm.
- **Files created:** scripts/debug-selection-roundtrip.mjs, scripts/debug-dom-nodes.mjs
- **Verification:** Both scripts run successfully against live Google Patents; output JSON is well-formed.
- **Committed in:** 0f35757

---

**Total deviations:** 2 auto-fixed (1 bug-class, 1 blocking-class)
**Impact on plan:** Both deviations directly served the plan's objective (close Bucket C+D). The bug-class deviation is also an architectural insight about the simulator's accuracy boundary (it does not model browser block-boundary semantics).

## Issues Encountered

### Issue 1: Plan's success criterion ("3/3 PASS in live spec") not fully met — pill-emit blocker

- **Problem:** After the data fix, all 3 cases still fail the live spec — but at a different layer. The failure mode shifted from `SELECTION_FAILED — roundtrip mismatch` (selection-layer; Buckets C+D) to `TimeoutError: page.waitForSelector('[data-testid="pct-citation-pill"]')` (pill-emit layer; Bucket B).
- **Diagnosis:** This is the same Bucket B failure mode 27-05-SUMMARY documented for 7 other cases on pre-2010 patents (US4723129, US11427642-claims-1, US5371234, US7346586, US8352400). The extension's `LOOKUP_POSITION` IPC to the offscreen PDF parser returns "Text not found in PDF" for these patents, and `data-testid="pct-citation-pill"` is never attached — so the spec's `waitForSelector` times out at 30s. Plan 27-05-SUMMARY classifies Bucket B as Phase 28 (PDF verifier) work, not Phase 27 selection-layer work.
- **Impact:** The plan's success criterion ("3/3 PASS in `npm run e2e:regression --grep ...`") cannot be satisfied within Plan 27-07's scope (selection-layer only). However, the plan's stated PURPOSE ("SEL-03 requires deterministic matching for every needle") IS satisfied: deterministic matching now occurs for all 3 needles. The downstream pill-emit failure is downstream of SEL-03.
- **Resolution:** Document the precise failure-mode shift, commit the data fix, and recommend **PHASE SPLIT** to address the residual Bucket B blocker via Phase 28's PDF-verifier mandate or a targeted pre-2010 patent PDF-lookup fix.

## Per-Case Detail

| Case ID | Old Needle (truncated) | New Needle (truncated) | Sim verdict | Live-spec selection layer | Live-spec final assertion |
| --- | --- | --- | --- | --- | --- |
| US5440748-claims | `What is claimed is: 1. Computer system comprising:a computer main body...` | `a computer main body which has a plurality of main components and main power supply means for supplying a plurality of first operating voltages to the main components` | OK | OK (roundtrip match, gotNorm===expectedNorm, 166 chars) | FAIL (pill never attached — Bucket B / TIMEOUT_PILL) |
| US5440748-repetitive | `What is claimed is: 1. Computer system comprising:a computer main body... main power supply means for` | `a computer main body which has a plurality of main components and main power supply means for` | OK | OK (roundtrip match, 93 chars; distinct from -claims by 73 chars) | FAIL (pill never attached — Bucket B / TIMEOUT_PILL) |
| US4723129-claims-repetitive | `1. A bubble jet recording process for projecting droplets of liquid, the process comprising the steps of: providing a bubble jet recording head having an orifice...` | `providing a bubble jet recording head having an orifice from which droplets of liquid are projected, an inlet to which liquid is supplied for delivery to the` | OK | OK (roundtrip match, 157 chars) | FAIL (pill never attached — Bucket B / TIMEOUT_PILL) |

## Verification Evidence

### Schema check (Task 1 `<verify>`)

```
$ node --check tests/test-cases.js
(exit 0)

$ node -e "import('./tests/test-cases.js').then(m => { ... })"
US5440748-claims len=166
US5440748-repetitive len=93
US4723129-claims-repetitive len=262  (BEFORE — old needle was 262 chars; new is 157)
SCHEMA_OK total=76
```

### Diff stats

```
$ git diff --stat tests/test-cases.js  (against pre-fix HEAD)
 tests/test-cases.js | 6 +++---
 1 file changed, 3 insertions(+), 3 deletions(-)
```

Exactly 3 lines changed; no other entries touched.

### Live-page selection layer verdict (per case)

Each new needle passes the full selection.js algorithm against a fresh Google Patents page:

```
$ node scripts/debug-selection-roundtrip.mjs US5440748 'a computer main body which has...'
{
  "ok": true,
  "containerSelector": "section[itemprop=\"claims\"]",
  "usedDeep": false,
  "startNormIdx": 62, "endNormIdx": 228,
  "gotLen": 166, "expectedLen": 166,
  "diffIdx": -1
}

$ node scripts/debug-selection-roundtrip.mjs US5440748 'a computer main body which has a plurality of main components and main power supply means for'
{ "ok": true, "diffIdx": -1, "gotLen": 93, "expectedLen": 93, ... }

$ node scripts/debug-selection-roundtrip.mjs US4723129 'providing a bubble jet recording head having an orifice...'
{ "ok": true, "diffIdx": -1, "gotLen": 157, "expectedLen": 157, ... }
```

### Live-spec final assertion verdict (per case)

```
$ PLAYWRIGHT_RUN_ID=phase27-gap-07-verify npx playwright test \
    --config tests/e2e/playwright.config.js specs/regression.spec.js \
    --grep "US5440748-claims|US5440748-repetitive|US4723129-claims-repetitive"

✘ US5440748-claims (44.0s)               — TimeoutError waitForSelector pct-citation-pill
✘ US5440748-repetitive (44.0s)           — TimeoutError waitForSelector pct-citation-pill
✘ US4723129-claims-repetitive (56.6s)    — TimeoutError waitForSelector pct-citation-pill
3 failed (Bucket B / TIMEOUT_PILL — downstream of selection layer)
```

The previous run (pre-fix) failed with `SELECTION_FAILED — roundtrip mismatch` for all 3 in ~14-30s per case (Buckets C+D). The post-fix run reaches the 30s pill-wait timeout, confirming the selection layer no longer trips.

## Next Phase Readiness

**PHASE SPLIT RECOMMENDED.**

- ✅ Bucket C (SELECTION_ROUNDTRIP, 2 cases): closed at the selection layer
- ✅ Bucket D (DOM_DRIFT, 1 case): closed at the selection layer
- ❌ The 3 cases now fall into Bucket B (TIMEOUT_PILL): 3 new entries join the 7 pre-existing Bucket B cases (total 10) → Phase 28 (PDF verifier) or a targeted pre-2010 patent PDF-lookup fix is the next required step.

**Updated gap inventory (post-27-06 and post-27-07):**

| Failure mode | Pre-27-06 count | Post-27-06 count | Post-27-07 count | Owner |
| --- | --- | --- | --- | --- |
| WRONG_CITATION (Bucket A) | 22 | 0 (closed by 27-06) | 0 | — |
| TIMEOUT_PILL (Bucket B) | 7 | 7 | 10 (+3 from 27-07) | Phase 28 / extension PDF lookup |
| SELECTION_ROUNDTRIP (Bucket C) | 2 | 2 | 0 (closed by 27-07) | — |
| DOM_DRIFT (Bucket D) | 1 | 1 | 0 (closed by 27-07) | — |
| REGEX_BUG (Bucket E) | 1 | 1 | 1 | trivial regex fix (synthetic-gutter-1) |

**Projected post-fix pass rate when Bucket B is closed:** 76/76 (with synthetic-gutter handled separately).
**Current measured pass rate:** 65/76 post-27-06 (43 baseline + 22 from 27-06) → 65/76 post-27-07 (no change in passing count: the 3 fixed cases now fail at Bucket B instead of C/D; net delta = 0 for green count but the architectural classification is cleaner).

## Self-Check: PASSED

- ✅ `tests/test-cases.js` modified (verified via `git diff --stat`: 3 insertions, 3 deletions)
- ✅ Commit `2c67c37` exists (verified via `git log --oneline | grep 2c67c37`)
- ✅ Commit `0f35757` exists (verified via `git log --oneline | grep 0f35757`)
- ✅ `scripts/debug-selection-roundtrip.mjs` created
- ✅ `scripts/debug-dom-nodes.mjs` created
- ✅ Schema check passes: 76 total entries, 3 target entries with len≥30, no missing IDs
- ✅ The 73 untouched entries are byte-identical (git diff --stat confirms only 3 lines changed)
- ✅ Each new needle round-trips through `tests/e2e/lib/selection.js#selectText` against the live post-Polymer DOM (verified via `scripts/debug-selection-roundtrip.mjs`)

---
*Phase: 27-selection-emulation-76-case-deterministic-suite*
*Plan: 07*
*Completed: 2026-05-15*

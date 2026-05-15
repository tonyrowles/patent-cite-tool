---
phase: 27-selection-emulation-76-case-deterministic-suite
plan: 04
subsystem: e2e-test-infrastructure
tags: [e2e, silent-mode, smoke-tag, npm-scripts, clipboard-shim, harn-04]
type: execute
wave: 2
depends_on: ["27-01", "27-02"]
requirements: [SEL-02, DIAG-01, DIAG-02]
dependency_graph:
  requires:
    - tests/e2e/lib/extension-loader.js (Phase 26 — loadExtension)
    - tests/e2e/lib/navigation.js (Phase 26 — gotoPatent)
    - tests/e2e/lib/selection.js (Plan 27-01 — selectText)
    - tests/e2e/lib/settings.js (Plan 27-02 — setTriggerMode)
    - tests/e2e/lib/observation.js (Plan 27-02 — getCitation mode:'silent')
    - tests/e2e/lib/artifacts.js (Plan 27-02 — captureScreenshot, captureDomSnapshot)
    - tests/e2e/shims/clipboard-observer.js (Phase 26 — window.__lastCopiedText__)
    - tests/golden/baseline.json (US11427642-spec-short-1, US11427642-cross-col)
  provides:
    - tests/e2e/specs/silent.spec.js (HARN-04 end-to-end coverage, 2 cases)
    - tests/e2e/specs/smoke.spec.js (now @smoke-tagged for unified --grep matching)
    - "npm run e2e:smoke" (--grep @smoke; ~6 tests across Phase 26 + Phase 27 regression smoke subset)
    - "npm run e2e:regression" (full 76-case sync deterministic suite — Plan 27-03)
    - "npm run e2e:silent" (2-case silent-mode end-to-end on US11427642)
  affects:
    - "Plan 27-05 e2e run inputs" (the three new npm scripts are what Plan 05 invokes)
    - "Orchestrator post-merge tagging pass" (regression.spec.js @smoke tagging is deferred — see Deferred Issues)
tech_stack:
  added: []
  patterns:
    - "@smoke title-suffix pattern for Playwright --grep matching (no Playwright tag API)"
    - "Inlined runId resolver to break cross-Wave-2-plan import dependency"
    - "Per-test catch-block diagnostics: captureScreenshot + captureDomSnapshot before rethrow"
key_files:
  created:
    - tests/e2e/specs/silent.spec.js
  modified:
    - tests/e2e/specs/smoke.spec.js
    - package.json
decisions:
  - "Inline resolveRunId() in silent.spec.js — avoid cross-Wave-2-plan dependency on Plan 27-03's tests/e2e/lib/run-id.js"
  - "Assert citation only (not confidence) in silent mode — Plan 27-02 SUMMARY flagged silent confidence as toast-based / best-effort"
  - "Two silent cases over one patent (spec-short + cross-col) — keeps invocation ~10s, exercises both single-node and multi-node selection paths through the silent codepath"
  - "Defer regression.spec.js @smoke tagging to post-merge orchestrator pass — Plan 27-03 owns that file and runs in parallel; cross-worktree edits would conflict"
metrics:
  duration: "~5 minutes"
  completed: 2026-05-14
  tasks_completed: 2
  files_touched: 3
  commits: 2
---

# Phase 27 Plan 04: Silent-Mode E2E + Smoke Tagging + npm Scripts Summary

Silent-mode HARN-04 end-to-end spec on US11427642 (2 cases — spec-short and cross-column), Phase 26 smoke title tagged with `@smoke`, and three Phase 27 npm scripts (`e2e:smoke` via `--grep @smoke`, `e2e:regression`, `e2e:silent`) wired into `package.json`. No production code or dependency changes — pure test-side infrastructure.

## Commits

| Commit | Type    | Description                                                 |
| ------ | ------- | ----------------------------------------------------------- |
| ed2ba19 | test    | Tag Phase 26 smoke + add silent-mode end-to-end spec        |
| 5b6ca46 | chore   | Add e2e:regression / e2e:silent + grep @smoke               |

## What Shipped

### `tests/e2e/specs/silent.spec.js` (new — 99 lines)

Two silent-mode tests over the seed patent `US11427642`, both following the full HARN-04 call order:

| Test ID                            | Baseline ID                | Selected Text                                                                                                                                                                                          | Expected Citation |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| `US11427642-silent-spec-short`     | `US11427642-spec-short-1`  | `receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the`                                                                                            | `1:26-27`         |
| `US11427642-silent-cross-col`      | `US11427642-cross-col`     | `the CH2 and CH3 domains of classical antibodies. These UniAbs lack the first domain of the constant region (CHI ) which is present in the genome, but is spliced out during`                          | `1:67-2:2`        |

Call order (verbatim from CONTEXT.md "Test Mode Coverage" + 27-RESEARCH.md "CONTEXT.md Contradictions"):

```
loadExtension({extensionPath})
  → setTriggerMode(context, 'silent')           // BEFORE gotoPatent (init-time read)
  → gotoPatent(page, 'US11427642')
  → selectText({page, uniqueSubstring})          // mouseup fires content-script handleSelection
  → page.keyboard.press('Control+C')             // copy event → silent-mode clipboard write
  → getCitation(page, {mode: 'silent'})          // polls window.__lastCopiedText__ + parses
  → expect(observed.citation).toBe(expected.citation)
  → expect(observed.mode).toBe('silent')
```

**Confidence assertion: omitted.** Plan 27-02's SUMMARY documented that silent-mode confidence inference is best-effort (toast-presence heuristic in the in-shadow DOM). Asserting only `citation` keeps the spec robust; the confidence shape is still produced by `getCitation` for diagnostic purposes.

**Per-test diagnostics:** Each test wraps the assertions in a `try/catch/finally`. On any thrown error, the catch block calls `captureScreenshot(page, RUN_ID, tc.id)` and `captureDomSnapshot(page, RUN_ID, tc.id)` (DIAG-01, DIAG-02) before rethrowing. `cleanup()` runs in `finally`.

**`resolveRunId` is inlined locally** (lines 47-55) because Plan 27-03 ships the shared `tests/e2e/lib/run-id.js` helper in a parallel Wave 2 worktree. Cross-plan helper imports are deferred to the orchestrator's post-merge reconciliation. The inlined logic mirrors the contract documented in 27-RESEARCH.md "Run-id Strategy": `process.env.PLAYWRIGHT_RUN_ID || ISO timestamp with FS-safe characters`.

### `tests/e2e/specs/smoke.spec.js` (modified — 1 line)

Appended literal ` @smoke` to the single Phase 26 test title:

```diff
- test('loads extension, navigates seed patent, SW ready, shadow shim functional', async () => {
+ test('loads extension, navigates seed patent, SW ready, shadow shim functional @smoke', async () => {
```

Title-suffix is the simplest pattern (Playwright's `--grep` matches substrings of `${describe} > ${test}`). No structural changes; the test body is unchanged.

### `package.json` (modified — 3 scripts)

```diff
- "e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js",
+ "e2e:regression": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js",
+ "e2e:silent": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/silent.spec.js",
+ "e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js --grep @smoke",
```

Final `scripts` block (full):

```json
"scripts": {
  "build": "node scripts/build.js",
  "build:chrome": "node scripts/build.js --chrome-only",
  "build:firefox": "node scripts/build.js --firefox-only",
  "dev": "node scripts/build.js --watch",
  "e2e:regression": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js",
  "e2e:silent": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/silent.spec.js",
  "e2e:smoke": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js --grep @smoke",
  "test": "npm run build && npm run test:src && npm run test:chrome && npm run test:firefox && npm run test:lint",
  "test:src": "vitest run",
  "test:chrome": "vitest run --config vitest.config.chrome.js",
  "test:firefox": "vitest run --config vitest.config.firefox.js",
  "test:lint": "npx web-ext lint --source-dir dist/firefox --ignore-files 'lib/**'",
  "test:watch": "vitest",
  "update-golden": "node scripts/update-golden.js --confirm",
  "accuracy-report": "node scripts/accuracy-report.js",
  "generate-icons": "node scripts/generate-icons.mjs"
}
```

No `devDependencies` or other top-level field touched.

## @smoke Coverage Forecast (for Plan 27-05)

After Plan 27-03 lands and the orchestrator post-merge pass tags 5 regression cases with `@smoke`, `npm run e2e:smoke` (which invokes `playwright test --grep @smoke`) will match:

| Source                              | Count | Notes                                                |
| ----------------------------------- | ----- | ---------------------------------------------------- |
| `tests/e2e/specs/smoke.spec.js`     | 1     | Phase 26 infra smoke (tagged in this plan)           |
| `tests/e2e/specs/regression.spec.js`| 5     | Tagged post-merge by orchestrator (see Deferred)     |
| `tests/e2e/specs/silent.spec.js`    | 0     | No @smoke tags; silent suite has its own `e2e:silent`|
| **Total**                           | **6** | Target runtime ~30-45s per CONTEXT.md decisions      |

Current state in this worktree:
- `grep -c '@smoke' tests/e2e/specs/smoke.spec.js` → `1` ✓
- `grep -c '@smoke' tests/e2e/specs/silent.spec.js` → `0` (by design — silent is its own suite)
- `grep -c '@smoke' tests/e2e/specs/regression.spec.js` → file does not exist in this worktree (Plan 27-03 territory)

## Verification Results

| Check                                                                                                         | Result |
| ------------------------------------------------------------------------------------------------------------- | ------ |
| `node --check tests/e2e/specs/smoke.spec.js`                                                                  | PASS   |
| `node --check tests/e2e/specs/silent.spec.js`                                                                 | PASS   |
| `grep -q '@smoke' tests/e2e/specs/smoke.spec.js`                                                              | PASS   |
| `grep -q "setTriggerMode.*'silent'" tests/e2e/specs/silent.spec.js`                                           | PASS   |
| `grep -q "page.keyboard.press('Control+C')" tests/e2e/specs/silent.spec.js`                                   | PASS   |
| `grep -q "mode: 'silent'" tests/e2e/specs/silent.spec.js`                                                     | PASS   |
| `grep -q "captureScreenshot" tests/e2e/specs/silent.spec.js`                                                  | PASS   |
| `grep -q "cleanup()" tests/e2e/specs/silent.spec.js`                                                          | PASS   |
| `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`                                     | PASS   |
| `grep -q '"e2e:regression"' package.json`                                                                     | PASS   |
| `grep -q '"e2e:silent"' package.json`                                                                         | PASS   |
| `grep -q -- '--grep @smoke' package.json`                                                                     | PASS   |
| `npm run test:src` (vitest)                                                                                   | PASS (229/229) |

## Decisions Made

1. **Inline `resolveRunId` in silent.spec.js** — Plan 27-03 ships `tests/e2e/lib/run-id.js` as part of its scope but runs in a parallel Wave 2 worktree. Importing from it would require Wave 2 to be serialized (defeats the parallelism gain). The 8-line inlined function exactly mirrors the documented contract in 27-RESEARCH.md "Run-id Strategy"; the orchestrator's post-merge pass can optionally collapse the duplication.

2. **Two silent cases over one patent (not two patents)** — CONTEXT.md "Test Mode Coverage" mandates "Two dedicated specs ... prove HARN-04 end-to-end". Interpretation: two tests inside one spec file. Same patent (US11427642) → one `gotoPatent` cost amortized across two cases, total ~10s. Spec-short + cross-col covers both single-node and multi-node selection paths through the silent codepath, which is the genuine concern (selection mechanics differ; silent-mode handler is the same).

3. **Citation-only assertion (no confidence)** — Plan 27-02 SUMMARY flagged silent-mode confidence inference as best-effort (toast-based heuristic). Asserting `expect(observed.confidence)` could cause flakes if the toast renders before/after the clipboard write. Citation is the deterministic invariant.

4. **No throttle in silent.spec** — Two navigations to one patent → CAPTCHA risk is negligible. The 76-case regression spec needs throttling (Plan 27-03's concern); silent spec does not.

5. **`page.keyboard.press('Control+C')` instead of clipboard-API call** — The content script's bubble-phase `copy` listener (`src/content/content-script.js:297-342`) only fires on real `copy` events. Dispatching a synthetic event would skip the browser's clipboard integration. The keyboard press is the production trigger.

## Deferred Issues

**1. regression.spec.js @smoke tagging (Plan 27-03 territory)**

The plan's `<verification>` step 5 expects `grep -cE "@smoke" tests/e2e/specs/regression.spec.js` to return ≥ 5. The regression spec is created by Plan 27-03 in a parallel Wave 2 worktree, so this plan cannot tag it without a cross-worktree edit (which would conflict on merge).

**Disposition:** Defer to the orchestrator's post-merge reconciliation pass. After both Wave 2 worktrees merge, the orchestrator should:

1. Open `tests/e2e/specs/regression.spec.js`.
2. Locate the test titles for these 5 case IDs (the 5-case smoke subset from CONTEXT.md):
   - `US11427642-spec-short-1`
   - `US11427642-spec-long`
   - `US11427642-cross-col`
   - `US8352400-claims`
   - `US10592688-spec-short`
3. Append ` @smoke` to each of those 5 test titles.
4. Commit as `test(27): tag 5 regression smoke-subset cases with @smoke` and re-verify `grep -c @smoke tests/e2e/specs/regression.spec.js` returns `5`.

Once that pass completes, `npm run e2e:smoke` will match exactly 6 tests (1 Phase 26 + 5 regression). Plan 27-05's first e2e run is the integration validation point.

**2. Cross-spec runId resolver duplication**

`silent.spec.js` inlines `resolveRunId()`; `regression.spec.js` (Plan 27-03) imports from `tests/e2e/lib/run-id.js`. After merge, the orchestrator may choose to:
- Leave the inlined copy in silent.spec.js (8 LoC, low maintenance), OR
- Replace the inlined function with `import { resolveRunId } from '../lib/run-id.js'`.

Either is fine — the resolved value is identical. No correctness implication.

## Threat Surface

No new threat surface introduced. The silent spec exercises the same trust boundaries as the production silent-mode codepath (clipboard write → shim read in-page), already covered by the plan's `<threat_model>`. No new dependencies, no new file system surface (artifact directory was Phase 26).

## Self-Check: PASSED

- File created: `tests/e2e/specs/silent.spec.js` — FOUND
- File modified: `tests/e2e/specs/smoke.spec.js` — FOUND (now contains @smoke)
- File modified: `package.json` — FOUND (3 Phase 27 scripts present)
- Commit `ed2ba19` — FOUND in `git log`
- Commit `5b6ca46` — FOUND in `git log`
- `node --check` on both specs — PASS
- `npm run test:src` — PASS (229/229)
- JSON validity on package.json — PASS

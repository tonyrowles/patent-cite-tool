---
phase: 65-expanded-fix-scaffolds
plan: 01
subsystem: auto-fix-loop
tags: [scaffold, error-class, prompt-registry, workflow-producer]
requires:
  - tests/e2e/lib/fix-prompt-builder.js (PROMPT_SCAFFOLDS, buildFixPrompt, buildScaffoldSystemPrompt)
  - tests/e2e/lib/error-codes.js (ERROR_CLASSES Object.freeze array)
  - tests/e2e/lib/llm-router.js (routeModel, MODEL_ROUTES)
  - tests/e2e/scripts/inject-defect.mjs (ERROR_CLASSES Set)
  - .github/workflows/v40-auto-fix.yml (precheck enumeration)
  - .github/workflows/v40-pdfjs-frame-shift.yml (frame-shift pre-flight)
provides:
  - VERIFIER_DISAGREE scaffold (Phase 65 SCAF-01) — closes Phase 64 Rule 2 unsupported-class escalation
  - FRAME_SHIFT_DETECTED ERROR_CLASS + scaffold + producer (Phase 65 SCAF-02)
  - 5-site enumeration wiring for both new classes (Plan 02 drift guard target)
  - Triage-issue producer in v40-pdfjs-frame-shift.yml (additive; red-X exit 1 preserved)
affects:
  - All v40-auto-fix runs that previously escalated VERIFIER_DISAGREE as unsupported-class
  - All v40-pdfjs-frame-shift runs detecting a frame shift — now ALSO file a triage issue
tech-stack:
  added: []
  patterns:
    - Additive Object.freeze respread (PROMPT_SCAFFOLDS 5 → 7 keys)
    - Append-only ERROR_CLASSES array extension (11 → 12 entries)
    - 5-site enumeration drift parity (Plan 02 SCAF-03 drift guard target)
    - // MODEL_DEFAULT_OK: <CLASS> comment as routing-drift-guard satisfier
    - Issue-producer split into 3 steps (compare/emit/red-X) for cleaner conditional gating
key-files:
  created:
    - .planning/phases/65-expanded-fix-scaffolds/65-01-SUMMARY.md
    - .planning/phases/65-expanded-fix-scaffolds/deferred-items.md (4 pre-existing warning-01 failures)
  modified:
    - tests/e2e/lib/fix-prompt-builder.js (VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED contracts + SYSTEM + 2 new PROMPT_SCAFFOLDS keys)
    - tests/e2e/lib/error-codes.js (FRAME_SHIFT_DETECTED export + append to ERROR_CLASSES)
    - tests/e2e/lib/llm-router.js (2 MODEL_DEFAULT_OK comments in JSDoc; MODEL_ROUTES unchanged)
    - tests/e2e/scripts/inject-defect.mjs (ERROR_CLASSES Set append; SOURCE_TAG byte-unchanged)
    - .github/workflows/v40-auto-fix.yml (precheck loop + skip-message extension; git push origin main count still 1)
    - .github/workflows/v40-pdfjs-frame-shift.yml (issues: write permission + 3-step restructure: compare/emit/red-X)
    - tests/unit/fix-prompt-builder.test.js (Phase 65 describe block + 5→7 key shape updates)
    - tests/unit/error-codes.test.js (length 11 → 12 + new append assertion)
    - tests/unit/report.test.js (re-export sanity length 11 → 12 + FRAME_SHIFT_DETECTED contain assertion)
decisions:
  - VERIFIER_DISAGREE was already in ERROR_CLASSES at index 4 (pre-existing Phase 28 entry); only the SCAFFOLD was missing per planner audit. Added scaffold only; ERROR_CLASSES entry NOT duplicated.
  - FRAME_SHIFT_DETECTED appended at END of ERROR_CLASSES (index 11) per CONTEXT D-02 additive-only.
  - Both new classes route to claude-sonnet-4-6 via llm-router ?? fallthrough; MODEL_ROUTES table left at 2 entries (GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION). Drift-guard satisfier comments added in JSDoc block above MODEL_ROUTES.
  - v40-pdfjs-frame-shift.yml restructured into 3 steps (compare/emit/red-X) instead of one combined step. The red-X exit 1 gate is preserved (now in a dedicated `if: steps.compare.outputs.frame_shift == '1'` step) so the issue-producer step can run first.
  - Working-tree comment in v40-pdfjs-frame-shift.yml permissions block had to be reworded to avoid the literal substrings `contents: write` and `pull-requests: write` (which are Phase 40 negative-pin sentinels in tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js).
metrics:
  duration: ~25 minutes
  completed_date: 2026-06-09
  tasks_completed: 3
  files_modified: 9 (source) + 2 (tests) + 1 (deferred-items.md created) = 12 total
  vitest_pass: 1328 / 1332 (4 pre-existing warning-01-transport-tag failures unrelated to Phase 65 scope — see deferred-items.md)
---

# Phase 65 Plan 01: VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED scaffolds + 5-site wiring Summary

**One-liner:** Adds VERIFIER_DISAGREE and FRAME_SHIFT_DETECTED scaffolds to the v4.0 auto-fix loop's PROMPT_SCAFFOLDS registry, completes 5-site enumeration wiring for both classes (error-codes / workflow precheck / mutator allowlist / model-routing comment), introduces FRAME_SHIFT_DETECTED as a new ERROR_CLASS (append-only at end of ERROR_CLASSES), and extends the pdfjs frame-shift pre-flight workflow to emit a triage issue with a `<frame_shift_evidence>` envelope on detection (red-X exit 1 preserved as secondary signal).

## What changed

### Task 1 — Scaffolds + new ERROR_CLASS

- **`tests/e2e/lib/error-codes.js`**:
  - Added `export const FRAME_SHIFT_DETECTED = 'FRAME_SHIFT_DETECTED';` (grouped with the Phase 30+ producer-extension constants, with Phase 65 SCAF-02 comment).
  - Appended `'FRAME_SHIFT_DETECTED'` as the last entry in the `ERROR_CLASSES` Object.freeze array. Pre-existing entry order at indices 0–10 byte-unchanged.
- **`tests/e2e/lib/fix-prompt-builder.js`**:
  - Added `VERIFIER_DISAGREE_CONTRACT` const (lines 304–346) — references the Phase 35 Verifier Disagreement template headers (`### Verifier Disagreement`, `Expected citation`, `Observed citation`, `Verifier tier:`, `Rerun verdict:`), names the citation pipeline as editable surface, and carries a DO NOT block forbidding verifier-threshold widening.
  - Added `FRAME_SHIFT_DETECTED_CONTRACT` const (lines 354–398) — references the `<frame_shift_evidence>` envelope produced by `.github/workflows/v40-pdfjs-frame-shift.yml`, names `tests/e2e/lib/pdf-verifier.js` as the editable surface, and carries a DO NOT block forbidding pdfjs-dist bump reversal and baseline.json edits.
  - Added `VERIFIER_DISAGREE_SYSTEM` and `FRAME_SHIFT_DETECTED_SYSTEM` constants via the shared `buildScaffoldSystemPrompt` helper (helper body byte-unchanged).
  - Extended `PROMPT_SCAFFOLDS` Object.freeze literal from 5 → 7 keys (additive respread; preserves Phase 45 invariant).
- **`tests/unit/fix-prompt-builder.test.js`**:
  - Updated 2 pre-existing key-count assertions from 5 → 7 keys (line 112 + line 326).
  - Added new `describe('Phase 65 — VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED scaffolds')` block with 7 assertions per the plan's behavior spec.

### Task 2 — 5-site enumeration wiring

- **`.github/workflows/v40-auto-fix.yml:91`**: extended precheck `for cls in ...` loop to include `VERIFIER_DISAGREE FRAME_SHIFT_DETECTED` (before `PASS`). Updated the skip-message to enumerate the two new tokens. `git push origin main` count still 1 (Phase 57 scope-lock preserved).
- **`tests/e2e/scripts/inject-defect.mjs:64`**: appended `'VERIFIER_DISAGREE'` and `'FRAME_SHIFT_DETECTED'` to the `ERROR_CLASSES` Set. Updated the comment block above to reference the v4.3 Phase 65 expansion. `SOURCE_TAG = 'fixture-mutator-uat-47b'` literal byte-unchanged at line 84 (MUTATOR-04 / T-59-04 invariant).
- **`tests/e2e/lib/llm-router.js`**: added two `// MODEL_DEFAULT_OK: <CLASS>` comment lines inside the JSDoc block above `MODEL_ROUTES` (lines 46-72). `MODEL_ROUTES` table still has exactly 2 entries (GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION) — UNCHANGED. `routeModel('VERIFIER_DISAGREE')` and `routeModel('FRAME_SHIFT_DETECTED')` both return `'claude-sonnet-4-6'` via `??` fallthrough.

### Task 3 — v40-pdfjs-frame-shift.yml producer wiring

- Added `issues: write` to the `permissions:` block (alongside existing `contents: read`).
- Split the single "Compare citation outputs" step into 3 sequential steps:
  1. **Compare citation outputs (frame-shift detection)** — `id: compare`. Now ALWAYS exits 0; sets step output `frame_shift=1`/`frame_shift=0` and writes a `<frame_shift_evidence>` envelope to `/tmp/frame-shift-evidence.txt` on detection. Handles the missing-report.json edge case as a frame-shift event (so the auto-fix loop receives a triage signal even on degenerate corpus output).
  2. **Emit FRAME_SHIFT_DETECTED triage issue** — `if: steps.compare.outputs.frame_shift == '1'`. Runs `gh issue create --title "FRAME_SHIFT_DETECTED: pdfjs-dist <prev> → <new> altered verifier verdicts" --label "triage" --label "FRAME_SHIFT_DETECTED" --label "auto-fix:enqueue" --body-file /tmp/frame-shift-evidence.txt`.
  3. **Fail the check (red X — Pitfall 6 defense)** — `if: steps.compare.outputs.frame_shift == '1'`. `run: exit 1`. Preserves Phase 40 red-X gate.
- The two `npm run e2e:regression` steps, the `pdfjs-dist@${prev}` install step, the `concurrency:` block, and the `Skip notice` step are all byte-unchanged.

## Trust invariants preserved

- **PROMPT_SCAFFOLDS Object.frozen** — 7 keys, isFrozen=true, mutation throws TypeError in strict mode (pinned by Phase 45 mutation guard + new Phase 65 Test 3).
- **ERROR_CLASSES Object.frozen append-only** — pre-existing entry order at indices 0-10 byte-unchanged; FRAME_SHIFT_DETECTED appended at index 11.
- **buildScaffoldSystemPrompt body byte-unchanged** — sha256 of function block matches HEAD: `e514b70b573ab77fd0f35b8e38161a72298117c00a52e990cbe6a79c728d3a6a`.
- **buildFixPrompt body byte-unchanged** — sha256 of function block matches HEAD: `696b228b77e15d560ce3bbcfab9d5298fa824a16a1b7aec744a6527784ae0d72`.
- **SOURCE_TAG `'fixture-mutator-uat-47b'`** byte-unchanged in inject-defect.mjs:75 (Phase 59 MUTATOR-04 invariant).
- **MODEL_ROUTES Object.frozen + 2 entries** preserved (GOOGLE_DOM_DRIFT + LLM_HALLUCINATED_SELECTION); new Phase 65 classes route via default sonnet fallthrough.
- **`git push origin main` count == 1** in v40-auto-fix.yml (Phase 57 scope-lock preserved).

## Scaffold sha256 Pins

The sha256 of each `PROMPT_SCAFFOLDS[className]()` invocation result. The 5 pre-existing pins were verified against HEAD (computed before Plan 01 changes); they match byte-for-byte, proving the additive-only invariant on the 5 existing scaffolds.

| ERROR_CLASS                  | Length | sha256                                                             | Origin              |
|------------------------------|--------|--------------------------------------------------------------------|---------------------|
| WRONG_CITATION               | 3427   | `ae1963bfd4c7d6b6984959d331dd5e519cccc972f255691bc6a3a39a889565e8` | Phase 42 (pre-Plan) |
| LLM_HALLUCINATED_SELECTION   | 3473   | `73aae3edd942e127951b6430d5984edc7021828790bc3e8094bbf0f09f4691f6` | Phase 45 (pre-Plan) |
| WORKER_FALLBACK_FAILED       | 3366   | `5f6a3cbdee613ac0f894f86587a0f69b1f117409aab39e184db5645cc3b105d0` | Phase 45 (pre-Plan) |
| GOOGLE_DOM_DRIFT             | 3503   | `9a3c7ab0a7e5ae76c42e2d3cf8172a76a4ea984ec38fb96a1e888bd584f61c59` | Phase 45 (pre-Plan) |
| HARNESS_ERROR                | 3470   | `9c1feb64e5b747bc0e9f82d80f0efdb7a871bd24d723de46c933c3c917141b44` | Phase 45 (pre-Plan) |
| VERIFIER_DISAGREE            | 4483   | `16a21ecb583cf5be0ee70f1ef12e65db187df46303d5c95034927b1235491245` | **Phase 65 (NEW)**  |
| FRAME_SHIFT_DETECTED         | 4738   | `fd34c9b5de27e9b6fb49c7aee8364abdd5a82b53dea669d250167e8b8b36f85f` | **Phase 65 (NEW)**  |

Plan 02 can copy the 5 pre-existing rows verbatim into its byte-stability pin (`tests/unit/fix-prompt-builder-byte-stability.test.js`) without re-derivation.

### Byte-stability proof for the 5 pre-existing scaffolds

Each of the 5 pre-existing sha256 pins was recomputed against `HEAD~0` (the commit immediately before Plan 65-01) and compared against the value computed after applying Plan 65-01's changes. All 5 pins matched bit-for-bit, confirming the additive-only invariant on the existing scaffolds was honored.

## New contract line ranges (for Plan 02 reference)

- `VERIFIER_DISAGREE_CONTRACT`: `tests/e2e/lib/fix-prompt-builder.js` lines **304–346** (multi-line `const ... = [...].join('\n')` block).
- `FRAME_SHIFT_DETECTED_CONTRACT`: `tests/e2e/lib/fix-prompt-builder.js` lines **354–398**.
- `VERIFIER_DISAGREE_SYSTEM`: `tests/e2e/lib/fix-prompt-builder.js` lines **439–442**.
- `FRAME_SHIFT_DETECTED_SYSTEM`: `tests/e2e/lib/fix-prompt-builder.js` lines **447–450**.
- PROMPT_SCAFFOLDS new entries: `tests/e2e/lib/fix-prompt-builder.js` lines **489–490**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Updated 4 pre-existing test count assertions to reflect the new ERROR_CLASSES length and the 7-key PROMPT_SCAFFOLDS shape**
- **Found during:** Final vitest pass after Task 1 + Task 2 + Task 3 source edits.
- **Issue:** Adding `FRAME_SHIFT_DETECTED` to ERROR_CLASSES and 2 new PROMPT_SCAFFOLDS keys deterministically broke these specific count pins:
  - `tests/unit/fix-prompt-builder.test.js:112` — expected 5 keys, now 7 (Phase 42 era assertion).
  - `tests/unit/fix-prompt-builder.test.js:326` — expected 5 keys, now 7 (Phase 45 extension assertion).
  - `tests/unit/error-codes.test.js:38` — expected length 11, now 12.
  - `tests/unit/report.test.js:238` — expected length 11, now 12 (re-export sanity).
- **Fix:** Updated each assertion in place to the new expected count + added the new entry to the per-key assertion lists where present. The plan's Task 1 Step C said "do not modify existing describe blocks" — interpreted as "do not modify the existing assertion SHAPE / behavior", not "do not bump the literal count constants those assertions reference". These updates are mechanical regression-guard alignment, not behavioral changes.
- **Files modified:** tests/unit/fix-prompt-builder.test.js, tests/unit/error-codes.test.js, tests/unit/report.test.js

**2. [Rule 1 — Bug] Reworded the v40-pdfjs-frame-shift.yml permissions-block comment to avoid the forbidden substrings `contents: write` and `pull-requests: write`**
- **Found during:** Final vitest pass.
- **Issue:** My initial comment under the `permissions:` block read "no contents: write, no pull-requests: write". The Phase 40 YAML negative-pin test (`tests/e2e/scripts/v40-pdfjs-frame-shift-yaml.test.js` P9 + P10) asserts those exact substrings are ABSENT anywhere in the file. The comment fired the negative pin.
- **Fix:** Reworded the comment to "neither write-access to repository contents nor PR-write scope is granted" — preserves the intent without containing the literal banned substrings. The actual permission shape (still `contents: read` + `issues: write`) is unchanged.
- **Files modified:** .github/workflows/v40-pdfjs-frame-shift.yml

### Authentication / Manual Gates

None — execution was fully automated.

## Deferred Items (out-of-scope discoveries)

See `.planning/phases/65-expanded-fix-scaffolds/deferred-items.md` for 4 pre-existing `tests/unit/warning-01-transport-tag.test.js` failures. All 4 failures reproduce on HEAD before any Phase 65 Plan 01 edit (they trip the Phase 56 WR-02 CI/override gate `dispatchFlakeState refused outside CI/override`); they are not caused by this plan. Tracked for Phase 66+ pickup.

## Verification Summary

All phase-level checks from `<verification>` and `<success_criteria>` passed:

```
=== V1: PROMPT_SCAFFOLDS 7 keys ===
PASS 7 keys [ 'WRONG_CITATION', 'LLM_HALLUCINATED_SELECTION',
              'WORKER_FALLBACK_FAILED', 'GOOGLE_DOM_DRIFT', 'HARNESS_ERROR',
              'VERIFIER_DISAGREE', 'FRAME_SHIFT_DETECTED' ]
=== V2: ERROR_CLASSES contains VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED ===
OK: true
=== V3: FRAME_SHIFT_DETECTED at all 6 files === all ≥1
=== V4: VERIFIER_DISAGREE at all 5 files === all ≥1
=== V6: git push origin main count == 1 (Phase 57 scope-lock) === 1
=== V7: zero exports/functions/consts deleted from fix-prompt-builder.js === 0
=== fix-prompt-builder.test.js (51 tests) === all pass (incl. 7 new Phase 65 tests)
=== llm-router.test.js (12 tests) === all pass
=== error-codes.test.js (7 tests) === all pass
=== report.test.js (11 tests) === all pass
=== v40-pdfjs-frame-shift-yaml.test.js (15 tests) === all pass
=== Full vitest suite (1332 tests) === 1328 pass, 4 fail (pre-existing warning-01)
```

## Success Criteria Cross-Check

- [x] `buildFixPrompt({errorClass:'VERIFIER_DISAGREE', ...})` returns `{ok:true, ...}` (was `{ok:false, escalate:'unsupported-class:VERIFIER_DISAGREE'}` before this plan)
- [x] `buildFixPrompt({errorClass:'FRAME_SHIFT_DETECTED', ...})` returns `{ok:true, ...}`
- [x] VERIFIER_DISAGREE + FRAME_SHIFT_DETECTED present at ALL 5 enumeration sites
- [x] v40-pdfjs-frame-shift.yml emits a triage issue with `<frame_shift_evidence>` body on detection; red-X exit 1 preserved
- [x] All trust invariants preserved (PROMPT_SCAFFOLDS frozen, ERROR_CLASSES order, helper bodies byte-unchanged, MODEL_ROUTES shape, SOURCE_TAG, git push count)
- [x] All existing Vitest tests still pass for fix-prompt-builder + llm-router (no regressions in scope)

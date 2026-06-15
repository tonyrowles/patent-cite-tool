# Plan 65-02 Summary — 5-site drift guard + 7-scaffold byte-stability pins

**Date:** 2026-06-09
**Phase:** 65 — Expanded Fix Scaffolds
**Plan:** 65-02
**Wave:** 2 (depends on 65-01)
**Requirements covered:** SCAF-03, SCAF-04
**Commits:**
- `58abd56` — `fix(65): add MODEL_DEFAULT_OK comments for 3 pre-existing scaffolds (drift-guard gap)` (inline gap closure)
- `8c0dce1` — `feat(65): 5-site enumeration drift guard + 7-scaffold byte-stability pins (SCAF-03..04)`

## Plan 65-02 BLOCKED → unblocked story

Plan 65-02's first executor run BLOCKED at Task 1 — the new 5-site drift guard test
(`tests/unit/error-class-enumeration-drift.test.js`) correctly surfaced a real Plan
65-01 gap: 3 pre-existing sonnet-routed scaffolds (`WRONG_CITATION`,
`WORKER_FALLBACK_FAILED`, `HARNESS_ERROR`) lacked `MODEL_DEFAULT_OK` annotations
under the new contract introduced by Plan 65-01.

The drift guard was designed to catch exactly this kind of enumeration drift on
its first run. Plan 65-01's site-5 verification only covered the 2 new classes
it added; the 3 pre-existing sonnet-routed scaffolds had been implicitly
satisfied by their absence from MODEL_ROUTES (default-sonnet fallthrough).

**Resolution:** Option A — comment-only additive change to `tests/e2e/lib/llm-router.js`
JSDoc block above `MODEL_ROUTES`. 3 new `MODEL_DEFAULT_OK` comment lines added.
Zero behavioral change. Committed as `58abd56`. Drift guard 41/41 green after fix.

## What Shipped

### SCAF-03 — 5-site enumeration drift guard (`tests/unit/error-class-enumeration-drift.test.js`)

- Iterates `Object.keys(PROMPT_SCAFFOLDS)` (7 keys) — NOT `ERROR_CLASSES` (12 entries) — avoids false positives on intentional gaps (FLAKE/LLM_API_ERROR/UI_BROKEN are non-scaffold-supported by design).
- For each PROMPT_SCAFFOLDS key, asserts presence at:
  1. `tests/e2e/lib/error-codes.js` ERROR_CLASSES array
  2. `.github/workflows/v40-auto-fix.yml` precheck list (line ~91)
  3. `tests/e2e/lib/fix-prompt-builder.js` PROMPT_SCAFFOLDS registry (object key — tautology gate)
  4. `tests/e2e/scripts/inject-defect.mjs` ERROR_CLASSES Set (mutator allowlist)
  5. `tests/e2e/lib/llm-router.js` — MODEL_ROUTES entry OR `// MODEL_DEFAULT_OK: <CLASS>` comment
- HARNESS_ERROR hard-coded exception: scaffold-supported but NOT in ERROR_CLASSES by Phase 45 design (documented inline with reference to `error-codes.js` lines 79-85 comment).
- 41 tests, all green.

### SCAF-04 — 7-scaffold byte-stability sha256 pins (`tests/unit/fix-prompt-builder-byte-stability.test.js`)

Digests consumed from Plan 65-01 SUMMARY.md `## Scaffold sha256 Pins` section:

| Scaffold | sha256 hex | Provenance |
|----------|------------|------------|
| WRONG_CITATION | `ae1963bfd4c7d6b6984959d331dd5e519cccc972f255691bc6a3a39a889565e8` | Phase 65 baseline-pin (byte-stable from Phase 45) |
| LLM_HALLUCINATED_SELECTION | `73aae3edd942e127951b6430d5984edc7021828790bc3e8094bbf0f09f4691f6` | Phase 65 baseline-pin (byte-stable from Phase 45) |
| WORKER_FALLBACK_FAILED | `5f6a3cbdee613ac0f894f86587a0f69b1f117409aab39e184db5645cc3b105d0` | Phase 65 baseline-pin (byte-stable from Phase 45) |
| GOOGLE_DOM_DRIFT | `9a3c7ab0a7e5ae76c42e2d3cf8172a76a4ea984ec38fb96a1e888bd584f61c59` | Phase 65 baseline-pin (byte-stable from Phase 45) |
| HARNESS_ERROR | `9c1feb64e5b747bc0e9f82d80f0efdb7a871bd24d723de46c933c3c917141b44` | Phase 65 baseline-pin (byte-stable from Phase 45) |
| VERIFIER_DISAGREE | `16a21ecb583cf5be0ee70f1ef12e65db187df46303d5c95034927b1235491245` | Phase 65 NEW (SCAF-01) |
| FRAME_SHIFT_DETECTED | `fd34c9b5de27e9b6fb49c7aee8364abdd5a82b53dea669d250167e8b8b36f85f` | Phase 65 NEW (SCAF-02) |

- 8 tests (1 registry-shape gate + 7 digest asserts), all green.

## Files Created / Modified

| Path | Δ | Notes |
|------|---|-------|
| `tests/unit/error-class-enumeration-drift.test.js` | NEW (+~210) | SCAF-03 |
| `tests/unit/fix-prompt-builder-byte-stability.test.js` | NEW (+~50) | SCAF-04 |
| `tests/e2e/lib/llm-router.js` | +10 | 3 MODEL_DEFAULT_OK comments (gap fix; comment-only) |

## Trust Invariants Preserved

- PROMPT_SCAFFOLDS Object.freeze invariant preserved (no edit; test reads only)
- MODEL_ROUTES Object.frozen preserved (no edit; comments only)
- buildScaffoldSystemPrompt body byte-unchanged
- buildFixPrompt body byte-unchanged
- 7 scaffold sha256 pins baseline-stable

## Tests

| Suite | Cases | Result |
|-------|-------|--------|
| `tests/unit/error-class-enumeration-drift.test.js` | 41 NEW | PASS |
| `tests/unit/fix-prompt-builder-byte-stability.test.js` | 8 NEW | PASS |

## Push Status

NOT pushed.

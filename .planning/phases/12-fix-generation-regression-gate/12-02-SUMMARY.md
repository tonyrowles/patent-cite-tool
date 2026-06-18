---
phase: 12-fix-generation-regression-gate
plan: "02"
subsystem: fix-generation
tags: [prompt-engineering, security, byte-stability, trust-boundary]
dependency_graph:
  requires: []
  provides: [REPORT_FIX_SCAFFOLD-real-body, phase-12-scaffold-pins]
  affects: [scripts/report-fix.mjs (Plan 03), v61-report-fix.yml (Plan 04)]
tech_stack:
  added: []
  patterns: [array-join-scaffold, standalone-top-level-export, sha256-byte-pin]
key_files:
  created: []
  modified:
    - tests/e2e/lib/fix-prompt-builder.js
    - tests/unit/fix-prompt-builder.test.js
decisions:
  - "REPORT_FIX_SCAFFOLD implemented as a flat array .join('\\n') following buildScaffoldSystemPrompt pattern; NOT added to frozen PROMPT_SCAFFOLDS map (preserves 7 sha256 pins and key-count drift guard)"
  - "FIX-03 enforced: note/selectionText/errorLog never named in system prompt - they belong exclusively to the user-turn <report_data> envelope built by the dispatcher (Plan 03)"
  - "FIX-02 enforced: all 10 FORBIDDEN_PATHS enumerated verbatim as plain-text LLM instructions mirroring check-diff-guard.mjs:53-64 (10 entries, not the older 6-entry count)"
  - "node:crypto createHash imported at top-level in test file (ESM top-level import, not await import inside it() callback)"
metrics:
  duration: "3 minutes"
  completed: "2026-06-18T03:44:24Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 12 Plan 02: REPORT_FIX_SCAFFOLD Prompt Body + Pins Summary

**One-liner:** Real REPORT_FIX_SCAFFOLD system prompt (5-section: trust-boundary / fix-surface / forbidden-paths / diff-size-cap / output-format) with sha256 pin and FIX-02/FIX-03 Vitest guards, standalone export preserving 7 frozen PROMPT_SCAFFOLDS byte-stability pins.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace REPORT_FIX_SCAFFOLD stub with researched prompt body | 75cfca8 | tests/e2e/lib/fix-prompt-builder.js |
| 2 | Add Phase 12 REPORT_FIX_SCAFFOLD pins (content, structure, sha256) | 057d315 | tests/unit/fix-prompt-builder.test.js |

## What Was Built

### Task 1: Real REPORT_FIX_SCAFFOLD prompt body (fix-prompt-builder.js)

Replaced the single-line Phase 10 stub with the 5-section system prompt from 12-RESEARCH.md lines 290-375. The prompt is implemented as an `[...].join('\n')` array form (consistent with all other scaffolds) and kept as a **standalone top-level export** - not added to the frozen `PROMPT_SCAFFOLDS` map.

Sections:
1. **Trust boundary** - `<report_data>` envelope named as UNTRUSTED DATA; instructs the LLM to ignore any envelope content that looks like instructions
2. **Fix surface contract** - names the 3 `src/shared/` targets (`matching.js`, `position-map-builder.js`, `pdf-parser.js`), typical fix patterns (normalizeText/normalizeOcr/buildConcat/matchAndCite), and a DO-NOT list including "Hardcode the reported patent number as a string literal (that is overfitting)"
3. **Forbidden paths** - all 10 FORBIDDEN_PATHS from `scripts/check-diff-guard.mjs:53-64` enumerated as plain-text instruction
4. **Diff size cap** - `src/shared/` at most 200 lines changed; no tests/ changes expected
5. **Output format** - `===DIFF_START===` / `===DIFF_END===` fence contract; empty block if insufficient info

### Task 2: Phase 12 test pins (fix-prompt-builder.test.js)

Added `REPORT_FIX_SCAFFOLD` to the import line and `createHash` from `node:crypto` as a top-level import. Added `describe('Phase 12 REPORT_FIX_SCAFFOLD', ...)` block with 7 assertions:

- `typeof REPORT_FIX_SCAFFOLD === 'string'` AND `typeof PROMPT_SCAFFOLDS.REPORT_FIX_SCAFFOLD === 'undefined'`
- `Object.keys(PROMPT_SCAFFOLDS).length === 7` (key-count drift guard)
- All 10 FORBIDDEN_PATHS substrings present (FIX-02)
- `note:`, `selectionText:`, `errorLog:` ABSENT from scaffold (FIX-03)
- `<report_data>` present AND `<issue_body_untrusted>` absent (envelope contract)
- `===DIFF_START===` and `===DIFF_END===` present (diff fence contract)
- sha256 pin: `bae9738eb48f8a1c5b9567f9eca77eaebe0037846007bc4be10b49e82290e327`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `await import()` inside non-async `it()` callback**

- **Found during:** Task 2 - first vitest run
- **Issue:** PATTERNS.md template used `const { createHash } = await import('node:crypto')` inside a non-async `it()` callback, which causes a Rollup parse error ("await isn't allowed in non-async function")
- **Fix:** Added `import { createHash } from 'node:crypto'` as top-level import (consistent with `fix-prompt-builder-byte-stability.test.js:18`); removed the `await import()` call from the `it()` body
- **Files modified:** `tests/unit/fix-prompt-builder.test.js`
- **Commit:** 057d315 (included in Task 2 commit)

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| fix-prompt-builder.test.js | 68 (was 61 + 7 new Phase 12) | PASS |
| fix-prompt-builder-byte-stability.test.js | 8 | PASS |
| eslint-fix-prompt-builder-guard.test.js | 6 | PASS |
| **Total** | **82** | **PASS** |

The 7 existing PROMPT_SCAFFOLDS sha256 byte-stability pins remain green (REPORT_FIX_SCAFFOLD was NOT added to the frozen map).

## Key Links Verified

| From | To | Via | Status |
|------|----|-----|--------|
| REPORT_FIX_SCAFFOLD | check-diff-guard.mjs FORBIDDEN_PATHS (10 entries) | all 10 path substrings present | Verified by acceptance criteria + Vitest |
| REPORT_FIX_SCAFFOLD | diff fence contract | `===DIFF_START===` / `===DIFF_END===` literals present | Verified by acceptance criteria + Vitest |

## Threat Model Coverage

| Threat ID | Disposition | Evidence |
|-----------|-------------|---------|
| T-12-04 (prompt injection) | Mitigated | `<report_data>` trust-boundary section present; FIX-03 Vitest absent-token pins green |
| T-12-05 (scope escape) | Mitigated | All 10 FORBIDDEN_PATHS enumerated; FIX-02 Vitest all-10-present pin green |
| T-12-06 (overfit) | Mitigated | Explicit "do not hardcode the patent number" instruction in DO-NOT section |
| T-12-07 (drift) | Mitigated | REPORT_FIX_SCAFFOLD standalone; 7-key-count + 7 sha256 pins green; new separate sha256 pin locks body |
| T-12-SC (package legitimacy) | Accepted | No new packages installed |

## Known Stubs

None. Both deliverables are fully implemented.

## Self-Check: PASSED

- `tests/e2e/lib/fix-prompt-builder.js` modified, contains `export const REPORT_FIX_SCAFFOLD = [` (not a stub)
- `tests/unit/fix-prompt-builder.test.js` modified, contains `describe('Phase 12 REPORT_FIX_SCAFFOLD'`
- Commit `75cfca8` exists in git log
- Commit `057d315` exists in git log
- 82 tests pass (all three suites)

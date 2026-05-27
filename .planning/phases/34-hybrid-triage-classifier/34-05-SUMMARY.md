---
phase: 34-hybrid-triage-classifier
plan: "05"
subsystem: eslint-lint-guard
tags: [eslint, no-restricted-imports, scope-extension, lint-guard, vitest, three-layer-defense, D-07, TRIAGE-04]
dependency_graph:
  requires: [34-02, 34-04]
  provides: [D-07-eslint-block, TRIAGE-04-edit-time-layer]
  affects: [eslint.config.js, tests/e2e/scripts/e2e-lint-triage-guard.test.js]
tech_stack:
  added: []
  patterns: [eslint-flat-config-per-file-block, paths-importNames-form, vitest-scope-extension-test]
key_files:
  created:
    - tests/e2e/scripts/e2e-lint-triage-guard.test.js
  modified:
    - eslint.config.js
decisions:
  - "Used paths+importNames ESLint form (NOT patterns.group) per Pitfall 7 — the named-import restriction requires paths form; patterns would silently miss import { invokeClaudeP } violations"
  - "Two paths entries cover both relative specifiers: ./llm-driver.js (triage-classifier.js perspective) and ../tests/e2e/lib/llm-driver.js (e2e-triage-classifier.mjs perspective)"
  - "scripts/e2e-explore.mjs grandfathered — Phase 32 contract preserved; NOT in the new files glob"
  - "Violation injection test injects a NAMED import (import { invokeClaudeP } from './llm-driver.js') per Pitfall 7 mitigation — side-effect or default imports would silently pass the paths+importNames rule"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-27"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 34 Plan 05: ESLint D-07 Triage Classifier Lint Guard Summary

D-07 ESLint per-file block using `paths` + `importNames` form restricting named import of `invokeClaudeP` in triage code; scope-extension test with violation injection.

## What Was Built

### Task 1: D-07 ESLint Block (eslint.config.js)

A fourth config block appended to `eslint.config.js` scoped to:
- `tests/e2e/lib/triage-classifier.js`
- `scripts/e2e-triage-classifier.mjs`

The block uses the `paths` + `importNames` form (NOT `patterns.group`) as required by Pitfall 7. Two `paths` entries cover both relative import specifiers that could be used to import `invokeClaudeP`:

1. `name: './llm-driver.js'` — the path as seen from triage-classifier.js
2. `name: '../tests/e2e/lib/llm-driver.js'` — the path as seen from e2e-triage-classifier.mjs

Both messages reference D-07 and point to PITFALLS.md Pitfall 12. `scripts/e2e-explore.mjs` is grandfathered (Phase 32 contract) and NOT included in the files glob.

Verification: `npm run lint` exits 0 on current source; 4 config blocks total (1 project-wide + 3 per-file); `patterns:` count = 2, `paths:` count = 1 — form distinction confirmed.

### Task 2: Scope-Extension Test (tests/e2e/scripts/e2e-lint-triage-guard.test.js)

118-line Vitest test file mirroring the Phase 33 `e2e-lint-rerun-guard.test.js` shape:

**Test 1 (sanity check):** `npm run lint` exits 0 on unmodified triage-classifier.js — no false positives from the new rule.

**Test 2 (violation injection):** Temporarily injects `import { invokeClaudeP } from './llm-driver.js'` (a NAMED import per Pitfall 7 mitigation) after the first import line in triage-classifier.js, runs `npm run lint`, asserts:
- Exit code is non-zero
- Output matches `/D-07|invokeClaudePWithLedger|must use invokeClaudePWithLedger/i`
- File restored to exact original bytes (paranoid check)

Restore safety: `try/finally` + `process.once('exit')` belt-and-suspenders + paranoid byte-for-byte verification in final assertion.

Both tests pass: 2/2 under `npx vitest run`.

## D-07 Form Rationale (Pitfall 7)

The existing VFY-02 (pdf-verifier.js) and RERUN-04 (rerun-validator.js) blocks use `patterns.group` to restrict directory tree imports (`src/**`). That form matches MODULE PATH GLOBS only — it would silently fail to catch `import { invokeClaudeP } from './llm-driver.js'` because that import path does not match any `src/**` pattern.

D-07 requires restricting a SPECIFIC NAMED EXPORT from a specific module. ESLint's `paths` + `importNames` form is the correct mechanism. The scope-extension test proves this empirically by injecting the exact violation shape and asserting `npm run lint` fails.

## Three-Layer CI Defense Complete (TRIAGE-04)

| Layer | Plan | Mechanism |
|-------|------|-----------|
| Edit-time | Plan 05 (this plan) | ESLint `no-restricted-imports` blocks `import { invokeClaudeP }` in triage code |
| Script-startup | Plan 04 | CLI CI gate refuses to run when `CI=true` or `GITHUB_ACTIONS=true` |
| Runtime | Plan 01 | `invokeClaudePWithLedger` wrapper enforces CI gate + ledger composition |

## Grandfathering Preserved

`scripts/e2e-explore.mjs` continues to import `invokeClaudeP` directly. It is NOT included in the new block's `files:` glob. The only reference to it in `eslint.config.js` is in a comment (line 121) documenting this decision.

Verification: `grep -c "scripts/e2e-explore.mjs" eslint.config.js` = 1 (comment only, not in any files array).

## Verification Results

- `grep -c "tests/e2e/lib/triage-classifier.js" eslint.config.js` = 1
- `grep -c "scripts/e2e-triage-classifier.mjs" eslint.config.js` = 1
- `grep -c "importNames: ['invokeClaudeP']" eslint.config.js` = 2
- `grep -c "invokeClaudePWithLedger" eslint.config.js` = 3
- `grep -c "D-07" eslint.config.js` = 3
- `grep -c "Pitfall 12" eslint.config.js` = 2
- `grep -c "patterns:" eslint.config.js` = 2; `grep -c "paths:" eslint.config.js` = 1 (form distinction confirmed)
- `node -e "import('./eslint.config.js').then(m => console.log(m.default.length))"` = 4
- `npm run lint` exits 0
- `npx vitest run tests/e2e/scripts/e2e-lint-triage-guard.test.js` — 2/2 tests pass
- `npm run test:src` — 530/534 tests pass (4 skipped, pre-existing)
- `git diff tests/e2e/lib/triage-classifier.js` — no changes after test run

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns beyond those documented in the plan's threat model.

## Self-Check: PASSED

- eslint.config.js: modified, committed bdd43d1
- tests/e2e/scripts/e2e-lint-triage-guard.test.js: created, committed 9e7763c
- Both commits confirmed in git log
- npm run lint exits 0
- npx vitest run exits 0 with 2 tests passing
- triage-classifier.js restored after test (git diff shows no changes)

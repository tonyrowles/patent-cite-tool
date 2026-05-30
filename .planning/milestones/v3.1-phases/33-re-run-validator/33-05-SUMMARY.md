---
phase: 33-re-run-validator
plan: "05"
subsystem: eslint-independence-guard
tags: [eslint, no-restricted-imports, rerun-validator, independence-claim, smoke-test]
dependency_graph:
  requires: ["33-02"]
  provides: ["RERUN-04 lint-time enforcement of rerun-validator.js independence"]
  affects: ["eslint.config.js", "tests/e2e/scripts/e2e-lint-rerun-guard.test.js"]
tech_stack:
  added: []
  patterns:
    - "Per-file ESLint flat-config no-restricted-imports block (mirrors pdf-verifier.js VFY-02 pattern)"
    - "TDD RED/GREEN for lint-guard smoke test"
    - "try/finally + process.once('exit') belt-and-suspenders restore for file-mutation tests"
key_files:
  created:
    - tests/e2e/scripts/e2e-lint-rerun-guard.test.js
  modified:
    - eslint.config.js
decisions:
  - "D-16 honored: new block uses files: ['tests/e2e/lib/rerun-validator.js'] — exact path, NOT a glob"
  - "Block is parallel to the existing pdf-verifier.js block — same five-pattern group, separate array entry"
  - "Message references 'RERUN-04 independence claim' and 33-RESEARCH.md §\"Pattern 3\""
  - "Lint-guard test uses spawnSync not a Node API call — tests the real lint invocation end-to-end"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 2
---

# Phase 33 Plan 05: ESLint RERUN-04 Independence Guard Summary

Per-file ESLint `no-restricted-imports` block added for `tests/e2e/lib/rerun-validator.js` mirroring the VFY-02 pdf-verifier.js block exactly; lint-guard smoke test proves the rule fires on injected src/ imports and restores the file safely via try/finally + process.once('exit').

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write the lint-guard smoke test scaffold (RED) | bec7b0d | tests/e2e/scripts/e2e-lint-rerun-guard.test.js (created) |
| 2 | Add the rerun-validator.js block to eslint.config.js (GREEN) | 31abd00 | eslint.config.js (modified) |
| 3 | Run npm run test:src + npm run lint + lint-guard test | (verification only) | no file modifications |

## What Was Built

### eslint.config.js

New block appended after the existing `pdf-verifier.js` block:

```javascript
{
  files: ['tests/e2e/lib/rerun-validator.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/src/**', '../../../src/**', '../../src/**', '../src/**', '/src/**'],
        message: 'rerun-validator.js must not import from src/ — RERUN-04 independence claim. ...',
      }],
    }],
  },
},
```

Per D-16: exact-path `files` value, NOT a glob. Keeps the independence-claim audit story readable per module.

### tests/e2e/scripts/e2e-lint-rerun-guard.test.js

Two-test vitest file:

1. **Sanity check** — `npm run lint` exits 0 on the unmodified `rerun-validator.js` (no false positives on legitimate code).
2. **Violation check** — temporarily injects `import "../../../src/shared/matching.js"` after the first import line, spawns `npm run lint`, asserts non-zero exit and output containing `RERUN-04`, then restores original content.

Restore safety:
- `try/finally` guarantees restore even on assertion failure
- `process.once('exit', ...)` in `beforeAll` restores the file on unexpected process exit (belt-and-suspenders)
- Post-restore assertion: `expect(fs.readFileSync(RERUN_VALIDATOR_PATH, 'utf8')).toBe(originalContent)`

## Verification Results

| Check | Result |
|-------|--------|
| `node --check eslint.config.js` | Exit 0 |
| `npm run lint` (unmodified rerun-validator.js) | Exit 0 (0 errors, 2 unrelated warnings in settings.js) |
| `grep -c "files: ['tests/e2e/lib/rerun-validator.js']" eslint.config.js` | 1 (exact, per D-16) |
| `grep -c "RERUN-04 independence claim" eslint.config.js` | 1 |
| `grep -c "no-restricted-imports.*error" eslint.config.js` | 2 (pdf-verifier.js + rerun-validator.js) |
| `npx vitest run tests/e2e/scripts/e2e-lint-rerun-guard.test.js` | 2/2 tests passed |
| `npm run test:src` | 27 files, 459 tests passed |
| `git status --short tests/e2e/lib/rerun-validator.js` | (empty — file clean post-test) |

## TDD Gate Compliance

- **RED gate:** `bec7b0d` — `test(33-05)` commit; violation test failed because ESLint rule did not yet exist (lint exited 0 on violating import).
- **GREEN gate:** `31abd00` — `feat(33-05)` commit; both tests pass after the block was added.
- No REFACTOR gate needed (implementation is a verbatim clone of the existing block; no cleanup required).

## Deviations from Plan

None — plan executed exactly as written. The block was added as a separate entry after the pdf-verifier.js block, matching D-16's explicit per-file requirement.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. The lint-guard test mutates and restores a file in the repo working tree; the try/finally + process.once('exit') pattern ensures the mutation is never persisted to a commit.

## Self-Check: PASSED

- `tests/e2e/scripts/e2e-lint-rerun-guard.test.js` exists: FOUND
- `eslint.config.js` contains `files: ['tests/e2e/lib/rerun-validator.js']`: FOUND (grep count = 1)
- Task 1 commit `bec7b0d`: FOUND
- Task 2 commit `31abd00`: FOUND
- `npm run test:src` passes: CONFIRMED (27 files, 459 tests)
- `npm run lint` exits 0: CONFIRMED
- `git status --short tests/e2e/lib/rerun-validator.js` empty: CONFIRMED

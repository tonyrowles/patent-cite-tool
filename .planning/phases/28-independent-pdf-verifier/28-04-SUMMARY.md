---
phase: 28-independent-pdf-verifier
plan: 04
subsystem: testing
tags: [eslint, no-restricted-imports, verifier-independence, build-gate, flat-config, vfy-02]

requires:
  - phase: 28-independent-pdf-verifier
    provides: "tests/e2e/lib/pdf-verifier.js (Plan 28-01) — the file the lint rule protects"

provides:
  - "ESLint 10.4.0 exact-pinned as devDependency"
  - "eslint.config.js (flat config) with no-restricted-imports rule scoped ONLY to tests/e2e/lib/pdf-verifier.js"
  - "`npm run lint` script (eslint tests/e2e/lib/)"
  - "`npm run lint` chained into `npm test` (before test:lint, preserving Phase 24 L2 invariant)"
  - "Build-time enforcement of the VFY-02 verifier-independence claim — adversarial-import lint fail verified"

affects: [28-05-calibration, 29-ci-cron, future-verifier-edits]

tech-stack:
  added: ["eslint@10.4.0 (flat config, ESLint 9+ default)"]
  patterns:
    - "Flat ESLint config: array of config objects with `files` globs; rules merge in order"
    - "Per-file rule scoping via `files: ['tests/e2e/lib/pdf-verifier.js']` narrows enforcement to a single audit boundary"
    - "no-restricted-imports `patterns.group` with multiple redundant path forms (**/src/**, ../../src/**, etc.) for resilience against directory restructuring"

key-files:
  created:
    - "eslint.config.js"
  modified:
    - "package.json (devDependencies.eslint + scripts.lint + scripts.test chain)"
    - "package-lock.json (eslint dep tree)"
    - ".planning/phases/28-independent-pdf-verifier/deferred-items.md (logged stale eslint-disable warnings in settings.js)"

key-decisions:
  - "Insert `npm run lint` BEFORE `test:lint` in scripts.test (not after as plan suggested) to preserve Phase 24 L2 invariant — `test:lint` must remain the final gate"
  - "ESLint 10.4.0 chosen (latest stable per `npm view eslint version` at execute time, matches RESEARCH.md 28-RESEARCH expectation)"
  - "Did NOT add stylistic rules (no-unused-vars, semi, etc.) per plan instruction — Phase 28 scope is VFY-02 only"
  - "Lint scope is `tests/e2e/lib/` (where the rule applies); leaves rest of `tests/e2e/` untouched for now"

patterns-established:
  - "VFY-02 enforcement via build-time lint rule: independence claims that say 'X must not import Y' need an ESLint no-restricted-imports rule + a chained lint in npm test, otherwise they're convention not contract"
  - "Adversarial-violation test as proof-of-enforcement: when a rule's purpose is to block a class of imports, the SUMMARY should record both branches (clean lint = exit 0, adversarial = exit non-zero) — convention not contract otherwise"

requirements-completed: [VFY-02]

duration: 14 min
completed: 2026-05-15
---

# Phase 28 Plan 04: ESLint Independence Boundary Summary

**ESLint 10.4.0 flat config with a `no-restricted-imports` rule scoped to `tests/e2e/lib/pdf-verifier.js`, blocking any `src/**` import path — VFY-02 verifier-independence is now enforced at lint time, not by convention.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-15T17:01:00Z
- **Completed:** 2026-05-15T17:15:04Z
- **Tasks:** 2
- **Files modified:** 4 (1 created + 3 modified)

## Accomplishments

- ESLint 10.4.0 installed exact-pinned (no caret/tilde) — matches Phase 26 dependency-pinning precedent
- `eslint.config.js` (flat config — ESLint 9+ default) with two config blocks:
  - Block 0: project-wide language options for `tests/e2e/**/*.js` (no rules)
  - Block 1: `no-restricted-imports` rule narrowed to `tests/e2e/lib/pdf-verifier.js` only
- `no-restricted-imports` patterns array lists 5 redundant path forms (`**/src/**`, `../../../src/**`, `../../src/**`, `../src/**`, `/src/**`) for resilience
- Custom violation message cites VFY-02 and points at `.planning/phases/28-independent-pdf-verifier/28-RESEARCH.md §"Pattern 4"` — developers hitting the rule get the policy citation inline
- `npm run lint` script added → exits 0 on clean codebase
- `npm test` chain extended: `... && npm run lint && npm run test:lint` — `test:lint` remains the final gate (Phase 24 L2 invariant preserved)
- Adversarial-import test passed: inserting `import {} from '../../../src/shared/matching.js';` at top of pdf-verifier.js → lint exits non-zero with the expected rule message; revert → lint clean again
- Other `tests/e2e/lib/*` files (report.js, navigation.js, observation.js, etc.) unaffected by the rule — verified by enumerating config blocks programmatically

## Task Commits

1. **Task 28-04-01: Install eslint + flat config + lint script** — `41c1448` (chore)
2. **Task 28-04-02: Static config audit + deferred-items log** — `acacd63` (docs)

_Plan metadata commit pending — orchestrator will create after this SUMMARY is finalized._

## Files Created/Modified

- `eslint.config.js` — NEW. Flat-config ESLint with VFY-02 independence rule. 72 lines, two config blocks, 5 path patterns.
- `package.json` — MODIFIED. Added `eslint: "10.4.0"` to devDependencies (exact pin); added `"lint": "eslint tests/e2e/lib/"` script; chained `npm run lint` into `npm test` before `test:lint`.
- `package-lock.json` — MODIFIED. Added eslint dependency tree (136 transitive packages).
- `.planning/phases/28-independent-pdf-verifier/deferred-items.md` — MODIFIED. Logged the 2 pre-existing stale `eslint-disable no-await-in-loop` warnings in `settings.js:85` and `:104` as out-of-scope per Phase 28 boundary.

## Decisions Made

### 1. Insert `npm run lint` BEFORE `test:lint`, not after (deviates from plan's literal instruction)

**Rationale:** Plan 28-04-02 step 5 explicitly instructed to add `npm run lint` at the END of `scripts.test` (after `npm run test:lint`). However, Phase 24 ratified an invariant guard test (`tests/unit/web-ext-lint.test.js` L2):

```js
expect(pkg.scripts.test.endsWith('test:lint')).toBe(true);
```

This invariant exists because `test:lint` runs `web-ext lint` against `dist/firefox/` — the AMO submission readiness gate. If anything chains after `test:lint`, the L2 invariant fails AND the wrong tool becomes the "final gate" semantically.

**Resolution:** Insert `npm run lint` BEFORE `test:lint`. Both goals satisfied:
- Plan 28-04 intent: lint chained into `npm test` ✓
- Phase 24 L2 invariant: `scripts.test.endsWith('test:lint')` ✓

Verified by running `npx vitest run tests/unit/web-ext-lint.test.js` — all 5 invariants pass.

### 2. ESLint 10.4.0 (not 9.x)

Plan referenced "ESLint 9+ flat config" as the target era. `npm view eslint version` at execute time returned `10.4.0` — the latest stable. ESLint 10 retains flat-config semantics from 9.x; no migration concerns. Pinned exact (no caret) per Phase 26 precedent (also matches the @napi-rs/canvas pin from Plan 28-01).

### 3. Did NOT add stylistic rules

Plan explicitly says: "DO NOT add stylistic rules (no-unused-vars, semi, etc.) — Phase 28 only enforces the independence boundary." Adhered. Result: 2 pre-existing `no-await-in-loop` `eslint-disable` directives in `settings.js` surface as warnings (not errors) — logged in deferred-items.md for v3.1 cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reorder `npm test` chain to preserve Phase 24 L2 invariant**
- **Found during:** Task 28-04-01 (during `npm run test:src` regression check after package.json edit)
- **Issue:** Plan instructed appending `npm run lint` at END of `scripts.test`, but `tests/unit/web-ext-lint.test.js` L2 asserts `pkg.scripts.test.endsWith('test:lint')` — a Phase 24 invariant guard for AMO submission. Following the plan literally would BREAK an existing unit test.
- **Fix:** Inserted `npm run lint` BEFORE `npm run test:lint`. Plan goal (chain lint into npm test) and Phase 24 invariant (test:lint final gate) both satisfied.
- **Files modified:** `package.json` (scripts.test)
- **Verification:** `npx vitest run tests/unit/web-ext-lint.test.js` → 5 passed / 0 failed.
- **Committed in:** `41c1448` (Task 28-04-01 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Resolution preserved both the planner's intent (lint chained into CI's `npm test`) AND a pre-existing Phase 24 invariant. No scope creep. Documented as a `key-decision` so a future planner reading SUMMARY frontmatter sees the constraint.

## Adversarial-Import Verification (Proof-of-Enforcement)

Per plan's mandatory manual proof, both branches recorded:

### Clean branch (pdf-verifier.js as committed in Plan 28-01)

```text
$ npm run lint
> lint
> eslint tests/e2e/lib/

/.../tests/e2e/lib/settings.js
   85:5  warning  Unused eslint-disable directive ...
  104:5  warning  Unused eslint-disable directive ...

✖ 2 problems (0 errors, 2 warnings)
[exit code: 0]
```

Warnings only (no errors) — lint passes. The 2 warnings are pre-existing stale `eslint-disable` directives in settings.js, logged in deferred-items.md as out-of-scope.

### Adversarial branch (injected `import {} from '../../../src/shared/matching.js';` at top of pdf-verifier.js)

```text
$ npm run lint
> lint
> eslint tests/e2e/lib/

/.../tests/e2e/lib/pdf-verifier.js
  1:1  error  '../../../src/shared/matching.js' import is restricted from being used by a pattern.
              pdf-verifier.js must not import from src/ — VFY-02 independence claim. Use a fresh
              implementation; mirror production logic conceptually, do not reuse it.
              See .planning/phases/28-independent-pdf-verifier/28-RESEARCH.md §"Pattern 4"
              no-restricted-imports

✖ 3 problems (1 error, 2 warnings)
[exit code: 1]
```

Verified output contains BOTH `no-restricted-imports` AND `pdf-verifier.js must not import from src/`. After revert (`cp /tmp/pdf-verifier-original.js tests/e2e/lib/pdf-verifier.js`), `npm run lint` returned to exit code 0.

**Conclusion:** VFY-02 is enforced. A future PR that adds a `src/` import to the verifier — even an empty namespace import — will fail CI's `npm run lint` step with a citation-rich error message pointing the author at the architectural justification.

## Authentication Gates

None — no external services involved in this plan.

## Issues Encountered

The pre-existing 15 `tests/unit/text-matcher.test.js` failures (golden-baseline drift from Phase 27 recalibration) surfaced when running `npm run test:src` as part of regression check. Confirmed they pre-exist by `git stash`-ing my changes and re-running the test file at baseline (`0006e25`) — same 15 failures. Out of scope per SCOPE BOUNDARY rule. Already documented in `deferred-items.md` from prior plans.

## Known Stubs

None — Plan 28-04 ships a fully wired lint config. Adversarial-violation test confirms the rule actually blocks (not a stub rule that passes everything).

## Threat Flags

None — the eslint binary is a standard dev-dependency. No new network endpoints, auth paths, or trust-boundary changes introduced. The `T-28-01` (supply-chain) threat from the plan's `<threat_model>` is mitigated as planned: exact-pin in package.json, package-lock.json committed.

## Code-Review Note (T-28-11 acceptance)

The plan's threat register accepts T-28-11: "someone disables the rule with `/* eslint-disable no-restricted-imports */`". This is consistent with how every ESLint rule works — only code review can prevent intentional bypass.

**Developers MUST NEVER add `/* eslint-disable no-restricted-imports */` or `// eslint-disable-next-line no-restricted-imports` to `tests/e2e/lib/pdf-verifier.js`.** If a future plan needs to reuse code from `src/`, the proper path is:

1. STOP — re-read VFY-02 in 28-CONTEXT.md
2. Recognize that the architectural intent is independence
3. Reimplement the needed logic locally in `tests/e2e/lib/`
4. If the duplication truly cannot be tolerated, file a new plan that removes the entire `no-restricted-imports` rule AND updates 28-CONTEXT.md to retract VFY-02 — that requires a SUMMARY-trackable plan, which is the social mitigation.

The narrow file-scope of the rule (just `pdf-verifier.js`, not other verifier-adjacent files) makes such a bypass conspicuous in a diff.

## Self-Check

Verifying claimed outputs exist:

```
$ [ -f eslint.config.js ] && echo FOUND || echo MISSING
FOUND

$ git log --oneline | grep -q "41c1448" && echo FOUND || echo MISSING
FOUND  (chore(28-04): install eslint 10.4.0 + flat config enforcing VFY-02)

$ git log --oneline | grep -q "acacd63" && echo FOUND || echo MISSING
FOUND  (docs(28-04): audit eslint.config.js + log stale eslint-disable directives)

$ grep -q 'no-restricted-imports' eslint.config.js && echo FOUND || echo MISSING
FOUND

$ grep -q '"lint":' package.json && echo FOUND || echo MISSING
FOUND

$ grep -q '"eslint": "10.4.0"' package.json && echo FOUND || echo MISSING
FOUND

$ npm run lint > /dev/null 2>&1 ; echo "exit=$?"
exit=0
```

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 28-05 (calibration + spec integration):** Ready. The verifier's independence is now build-enforced — any accidental `src/` import added during 28-05's regression-spec wiring will fail CI.
- **Phase 29 (CI nightly cron):** Ready. Phase 29 will likely add a `lint` step to GitHub Actions; the npm script already exists. Note that the existing `.github/workflows/ci.yml` (per Phase 24) runs `npm run test:lint` (web-ext) — Phase 29 can either add a parallel `npm run lint` step OR rely on `npm test` chaining it transitively.
- **No blockers** for downstream plans.

---
*Phase: 28-independent-pdf-verifier*
*Completed: 2026-05-15*

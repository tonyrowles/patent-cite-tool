---
phase: 42-fix-prompt-builder-wrong-citation-vertical-slice
plan: 01
subsystem: auto-fix-loop
tags: [fix-prompt-builder, envelope, forbidden-delimiters, eslint-guard, count-fix-attempts, prompt-injection-defense, tdd]
requires:
  - tests/e2e/lib/issue-payload-builder.js (Phase 35 — EXTENDED with FORBIDDEN_DELIMITERS escape)
  - tests/e2e/lib/llm-ledger.js (Phase 31/32/39 — EXTENDED with countFixAttempts)
  - eslint.config.js (Phase 28/33/34/39 — EXTENDED with per-file block + ignores augmentation)
  - scripts/check-diff-guard.mjs (Phase 41 — REFERENCED only, no import; the 6 forbidden paths are duplicated as instruction text per D-04 purity)
provides:
  - tests/e2e/lib/fix-prompt-builder.js (NEW — buildFixPrompt + PROMPT_SCAFFOLDS + ENVELOPE_OPEN/CLOSE + DIFF_FENCE_START/END)
  - tests/e2e/lib/issue-payload-builder.js::FORBIDDEN_DELIMITERS (NEW — frozen 2-tuple)
  - tests/e2e/lib/llm-ledger.js::countFixAttempts (NEW — sibling of phaseTotal)
affects:
  - Plan 42-02 scripts/auto-fix.mjs dispatcher (will import all 6 new exports)
  - Phase 45 will add 4 more keys to PROMPT_SCAFFOLDS (no shape change; just adds entries to the frozen object)
tech-stack:
  added: []
  patterns:
    - "Pure-function pure-string-builder + ESLint per-file purity guard (mirrors v3.1 issue-payload-builder + Phase 33 rerun-validator + Phase 28 pdf-verifier)"
    - "Splice-escape for envelope-delimiter neutralization (`</tag>` → `</tag-MARKER>`) — breaks literal token while preserving readability"
    - "Frozen registry of error-class-keyed scaffold thunks (extensible without API change; Phase 45 will add keys)"
    - "Pitfall 1/345cdcb prevention: per-file ESLint block INLINES @anthropic-ai/sdk restriction + catch-all `ignores:` augmentation in the SAME commit"
key-files:
  created:
    - tests/e2e/lib/fix-prompt-builder.js
    - tests/unit/fix-prompt-builder.test.js
    - tests/unit/eslint-fix-prompt-builder-guard.test.js
    - .planning/phases/42-fix-prompt-builder-wrong-citation-vertical-slice/deferred-items.md
  modified:
    - tests/e2e/lib/issue-payload-builder.js (+86/-5 — FORBIDDEN_DELIMITERS export, escapeForbiddenDelimiters helper, applied to rationale/reason/rawDiff + verifier-section golden+observed interpolation)
    - tests/e2e/lib/llm-ledger.js (+49/-0 — countFixAttempts export, leading comment update)
    - eslint.config.js (+62/-0 — new per-file block for fix-prompt-builder.js + catch-all ignores list extended 5→6)
    - tests/unit/issue-payload-builder.test.js (+109/-1 — new Phase 42 PROMPT-02 describe block: 5 cases)
    - tests/unit/llm-ledger.test.js (+162/-1 — new Phase 42 AUTOFIX-05 describe block: 7 cases)
decisions:
  - "Skip-class escalation map (FLAKE/LLM_API_ERROR/PASS) lives in a top-of-function const so the short-circuit happens BEFORE envelope construction — no string concat on the cheap path; Vitest pins the exact return shapes."
  - "PROMPT_SCAFFOLDS values are THUNKS (`() => SYSTEM_STRING`), not bare strings, so Phase 45 can parameterize per-class scaffolds without a shape change."
  - "FORBIDDEN_DELIMITERS iterates LONGEST-FIRST in escapeForbiddenDelimiters — the closing tag `</issue_body_untrusted>` is a superstring of the opening tag; escaping shortest-first would mangle the closing form mid-replacement."
  - "Observed citation (from extension) AND golden citation (from baseline) are BOTH escaped at interpolation time in the Verifier Disagreement section — initial implementation only escaped the Golden Diff path and missed the Verifier interpolation; Rule 1 auto-fix corrected this."
  - "Static-grep test for ESLint config does NOT strip JS comments — naive `/\\*[\\s\\S]*?\\*\\/g` regex matches glob patterns like `tests/e2e/**/*.js` (containing `/**/`) as block comments and eats ~50% of the config. Test now greps for `name: '<module>'` exactly."
metrics:
  duration_minutes: 9
  completed_date: 2026-05-31
  task_count: 2
  commit_count: 2
  files_created: 4
  files_modified: 5
---

# Phase 42 Plan 01: fix-prompt-builder + WRONG_CITATION Vertical Slice — Source Layer

Ships the pure-function layer Plan 42-02's auto-fix dispatcher will import: the
envelope-wrapping `buildFixPrompt` builder + the FORBIDDEN_DELIMITERS escape on
the v3.1 issue-payload builder + the `countFixAttempts` ledger helper +
ESLint purity guard on the new file. TDD discipline maintained (RED commit
precedes GREEN commit; RED touches only test files).

## Goal

Close the v3.1→v4.0 issue-body prompt-injection seam BEFORE the dispatcher
exists. Establish the pure layer that Plan 42-02's auto-fix.mjs imports for
prompt construction, ledger-based retry capping, and ESLint-enforced purity.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `00ce353` | `test(42-01): RED — fix-prompt-builder envelope + FORBIDDEN_DELIMITERS escape + countFixAttempts + ESLint purity guard` |
| 2 | `e9b23ae` | `feat(42-01): fix-prompt-builder + FORBIDDEN_DELIMITERS escape + countFixAttempts + ESLint purity guard` |

TDD gate sequence: `test(...)` (RED) → `feat(...)` (GREEN). RED commit
touches only test files (`git diff 00ce353^ 00ce353 --name-only` returns 4
test files). GREEN commit touches the 4 source files + 1 test-bug fix
(see Deviations).

## Line Counts Added

| File | Status | LOC added |
|------|--------|-----------|
| `tests/e2e/lib/fix-prompt-builder.js`            | NEW     | 217 |
| `tests/e2e/lib/issue-payload-builder.js`         | EXTEND  | +86/-5  |
| `tests/e2e/lib/llm-ledger.js`                    | EXTEND  | +49/-0  |
| `eslint.config.js`                               | EXTEND  | +62/-0  |
| `tests/unit/fix-prompt-builder.test.js`          | NEW     | 168 |
| `tests/unit/eslint-fix-prompt-builder-guard.test.js` | NEW | 117 |
| `tests/unit/issue-payload-builder.test.js`       | EXTEND  | +109/-1 |
| `tests/unit/llm-ledger.test.js`                  | EXTEND  | +162/-1 |

## Requirements Satisfied

| Req     | Coverage |
|---------|----------|
| PROMPT-01 | `buildFixPrompt({errorClass:'WRONG_CITATION', issueBody})` returns userPrompt literal `<issue_body_untrusted>\n<body>\n</issue_body_untrusted>` — 3 Vitest cases pin the single-line, multi-line, and non-empty-systemPrompt variants. |
| PROMPT-02 | `FORBIDDEN_DELIMITERS = Object.freeze(['<issue_body_untrusted>', '</issue_body_untrusted>'])`; `escapeForbiddenDelimiters()` applied to rationale + verifier reason + golden citation (both Verifier section interpolation AND Golden Diff section) + observed citation. 5 Vitest cases: shape, crafted rationale, crafted reason, crafted goldenCitation, Pitfall 5 negative content. |
| PROMPT-03 | `PROMPT_SCAFFOLDS` is `Object.freeze()`d with EXACTLY 1 key (WRONG_CITATION); 3 skip-class returns + 1 unsupported-class fallback all pinned. |
| PROMPT-04 | ESLint per-file block restricts node:fs / node:child_process / node:path / @anthropic-ai/sdk on `tests/e2e/lib/fix-prompt-builder.js`; 4 programmatic ESLint API tests + 2 static-grep tests pin the configuration. |
| AUTOFIX-05 | `countFixAttempts(ledger, fingerprint)` exported as sibling of `phaseTotal`; filters `phase==='42-auto-fix' && fingerprint===fp`. 7 Vitest cases: empty/null defenses, no-match, single-month, cross-month, mixed-fingerprint, defensive nulls, round-trip with appendLedgerEntry. Plan 42-02's dispatcher will use this to cap retries at 3 per fingerprint. |

## Pitfall 1 / commit 345cdcb Regression — ACTIVELY GUARDED

This phase ships the FIRST per-file ESLint block created after the
commit-345cdcb post-merge fix that documented the catch-all-clobber hazard
(commit 345cdcb subject: ESLint flat-config rule-merge order). Three
independent guards prevent the regression:

1. **INLINE @anthropic-ai/sdk restriction in the per-file block** — even
   if a future maintainer changes the catch-all SDK guard's `ignores:` list
   without realizing per-file rules need the inline copy, the SDK restriction
   on this file is still enforced via its own per-file block.
2. **catch-all `ignores:` list augmented in the SAME commit** — `eslint.config.js`
   now lists `tests/e2e/lib/fix-prompt-builder.js` at line 269 (the 6th entry,
   was 5). Without this, the catch-all's `no-restricted-imports` rule would
   merge AFTER the per-file block and CLOBBER the per-file's node:fs/cp/path
   rules (the per-file block restricts a SUPERSET of the catch-all's targets,
   so the merge would silently drop the additional restrictions).
3. **4th programmatic ESLint test as explicit regression guard** —
   `tests/unit/eslint-fix-prompt-builder-guard.test.js` Test 4 lints a
   `@anthropic-ai/sdk` import targeting the fix-prompt-builder file path and
   asserts `no-restricted-imports` fires. If a future maintainer accidentally
   removes either the inline restriction OR the catch-all ignores entry, this
   test fails closed.

Verification: `grep -c "tests/e2e/lib/fix-prompt-builder.js" eslint.config.js`
returns **3** (per-file `files:` + comment reference in the catch-all docs +
catch-all `ignores:` entry) — well above the required ≥2.

## PROMPT_SCAFFOLDS — Phase 42 ships EXACTLY 1 key

`Object.keys(PROMPT_SCAFFOLDS).length === 1` (WRONG_CITATION). The skip-class
short-circuits (FLAKE/LLM_API_ERROR/PASS) live in a separate
`SKIP_CLASS_ESCALATIONS` const inside `buildFixPrompt`, NOT in
`PROMPT_SCAFFOLDS` — keeping the registry shape minimal so Phase 45 can
extend it without changing the registry semantics. Phase 45 will add 4 more
keys: `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`,
`GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`.

## Plan 42-02 Consumer Contract

Plan 42-02's `scripts/auto-fix.mjs` dispatcher can now import:

```js
import {
  buildFixPrompt,
  PROMPT_SCAFFOLDS,
  ENVELOPE_OPEN,
  ENVELOPE_CLOSE,
  DIFF_FENCE_START,
  DIFF_FENCE_END,
} from '../tests/e2e/lib/fix-prompt-builder.js';

import { countFixAttempts } from '../tests/e2e/lib/llm-ledger.js';

import { FORBIDDEN_DELIMITERS } from '../tests/e2e/lib/issue-payload-builder.js';
```

The dispatcher will:
1. Call `buildFixPrompt({errorClass, issueBody})` to get
   `{ok, systemPrompt, userPrompt}` or `{ok:false, escalate}`.
2. On skip-class (`ok:false`), route to the named escalation path
   (re-quarantine / retry / close-as-pass / human-review).
3. On supported class (`ok:true`), invoke `invokeAnthropicSdkWithLedger`
   with `{system: systemPrompt, user: userPrompt}` + ledger entry
   `{phase: '42-auto-fix', fingerprint: <fp>, transport: 'sdk', issueId, ...}`.
4. Extract the unified diff from the LLM response using regex between
   `DIFF_FENCE_START` and `DIFF_FENCE_END` markers.
5. Call `countFixAttempts(ledger, fingerprint)` BEFORE invoking the LLM to
   refuse the 4th attempt + add the `human-review-required` label.

## Verification

| Check | Result |
|-------|--------|
| RED gate (`test(42-01): RED`) precedes GREEN gate (`feat(42-01):`) | YES — `00ce353` then `e9b23ae` |
| All 4 targeted Vitest files PASS | YES — 99/99 cases pass (12 fix-prompt-builder + 6 eslint-guard + 20 issue-payload-builder + 61 llm-ledger) |
| `npm run test:src` exits 0 introduced regressions | YES — 892/893 pass; 1 failing test is pre-existing calendar-rollover flake in `tests/e2e/scripts/e2e-weekly-digest.test.js`, verified pre-existing via `git stash` (see Deviations / deferred-items.md) |
| `npm run lint` exits 0 errors | YES — 0 errors, 2 pre-existing warnings in `tests/e2e/lib/settings.js` unrelated to this plan |
| `grep -c "tests/e2e/lib/fix-prompt-builder.js" eslint.config.js` | 3 (≥2 required) |
| `grep -vE '^[[:space:]]*//' tests/e2e/lib/fix-prompt-builder.js \| grep -cE "^import.*node:(fs\|child_process\|path)"` | 0 (purity invariant holds) |
| `grep -c "^export function countFixAttempts" tests/e2e/lib/llm-ledger.js` | 1 |
| `grep -c "^export const FORBIDDEN_DELIMITERS" tests/e2e/lib/issue-payload-builder.js` | 1 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verifier Disagreement section also interpolates goldenCitation + observed citation unescaped**

- **Found during:** Task 2 GREEN — `tests/unit/issue-payload-builder.test.js` PROMPT-02 case "escapes </issue_body_untrusted> embedded in the goldenCitation" failed.
- **Issue:** The plan instructed escape on rationale + reason + rawDiff (lines 110/111/157 of issue-payload-builder.js). But `goldenCitation` ALSO flows verbatim into the Verifier Disagreement section's `Expected citation (golden): \`${goldenCitation ?? 'n/a'}\`` line (line 137), and `citation` (observed) flows into the line below it. Either could pop the envelope.
- **Fix:** Escape both `goldenCitation` and `citation` at the top of `buildIssuePayload` BEFORE the Verifier Disagreement section is built. The Golden Diff section continues to use the already-escaped `rawDiff` path; the Verifier Disagreement section now uses `safeGolden` / `safeCitation` interpolations.
- **Files modified:** `tests/e2e/lib/issue-payload-builder.js` (Verifier section interpolation)
- **Commit:** `e9b23ae` (part of GREEN gate)

**2. [Rule 1 - Test bug] Naive comment-strip regex in eslint-guard test ate the per-file block**

- **Found during:** Task 2 GREEN — `tests/unit/eslint-fix-prompt-builder-guard.test.js` "Static: per-file block lists node:fs..." test failed because the strip regex was matching glob patterns as block comments.
- **Issue:** The test stripped JS comments via `text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')`. The block-comment regex matches `/*` to `*/`. `eslint.config.js` contains glob patterns like `'tests/e2e/**/*.js'` (which contains `/**/`) and `'**/src/**'` — these match as block comments. The non-greedy `[\s\S]*?` finds the EARLIEST closing `*/`, but the cumulative effect across multiple glob patterns ate ~50% of the file including the new per-file block.
- **Fix:** Replaced the comment-strip approach with direct `name: '<module>'` grep on the raw text. Equivalent strictness (comment text like `// e.g. node:fs` does not match `name: 'node:fs'`), no glob hazard.
- **Files modified:** `tests/unit/eslint-fix-prompt-builder-guard.test.js`
- **Commit:** `e9b23ae` (part of GREEN gate)

### Deferred (out of scope per executor SCOPE BOUNDARY)

**1. e2e-weekly-digest.test.js calendar-rollover flake**

A pre-existing test at `tests/e2e/scripts/e2e-weekly-digest.test.js:384` seeds
a ledger with hardcoded `'2026-05'` month + asserts `$12.50` is rendered, but
`renderCostLine()` defaults to `currentMonth()` which is now `'2026-06'`.
Verified pre-existing via `git stash; npm run test:src; git stash pop` — the
test fails identically without any Plan 42-01 changes. Logged to
`.planning/phases/42-fix-prompt-builder-wrong-citation-vertical-slice/deferred-items.md`.

## Self-Check

(see Self-Check section below)

## TDD Gate Compliance

| Gate | Commit | Verified |
|------|--------|----------|
| RED  | `00ce353` (test(42-01): RED — ...) | YES — Vitest exit non-zero with 16 failing new cases; no source files modified |
| GREEN | `e9b23ae` (feat(42-01): ...) | YES — Vitest exit zero on the 4 targeted test files (99/99 pass) |
| REFACTOR | — | Not needed; GREEN implementation is the final shape |

## Known Stubs

NONE — fix-prompt-builder.js is the production layer Plan 42-02 imports.
The WRONG_CITATION SYSTEM template is the final shipped version; Phase 45
will ADD 4 more keys to PROMPT_SCAFFOLDS without changing the existing
WRONG_CITATION entry.

## Self-Check: PASSED

Files verified to exist:
- FOUND: `tests/e2e/lib/fix-prompt-builder.js`
- FOUND: `tests/unit/fix-prompt-builder.test.js`
- FOUND: `tests/unit/eslint-fix-prompt-builder-guard.test.js`
- FOUND: `.planning/phases/42-fix-prompt-builder-wrong-citation-vertical-slice/deferred-items.md`

Commits verified in `git log`:
- FOUND: `00ce353` (RED gate)
- FOUND: `e9b23ae` (GREEN gate)

Modifications verified via `git diff`:
- FOUND: `tests/e2e/lib/issue-payload-builder.js` (+86/-5)
- FOUND: `tests/e2e/lib/llm-ledger.js` (+49/-0)
- FOUND: `eslint.config.js` (+62/-0)

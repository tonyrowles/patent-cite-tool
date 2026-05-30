---
phase: 34-hybrid-triage-classifier
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - tests/e2e/lib/triage-classifier.js
  - tests/e2e/lib/llm-driver.js
  - tests/unit/triage-classifier.test.js
  - tests/unit/llm-driver.test.js
  - scripts/e2e-triage-classifier.mjs
  - tests/e2e/scripts/e2e-triage-classifier.test.js
  - tests/e2e/scripts/e2e-triage-ci-guard.test.js
  - tests/e2e/scripts/e2e-lint-triage-guard.test.js
  - eslint.config.js
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
fixed_count: 7
status: fixes_applied
---

# Phase 34: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 34 delivers the hybrid triage classifier with the heuristic rule chain (D-03), cluster pre-filter (D-11), `wrapPatentData` injection defense (D-13), revised D-16 (no `getPdfSnippet` dep), and the new ledger-wrapped `invokeClaudePWithLedger` entry point. The three-layer CI defense (wrapper gate, CLI gate, ESLint guard) is wired and tested.

The 14 critical invariants all PASS direct verification except one important defect: the `npm run lint` script (`eslint tests/e2e/lib/`) does NOT cover `scripts/e2e-triage-classifier.mjs`, so the per-file ESLint block configured for that CLI script (lines 124-147 of `eslint.config.js`) is dead infrastructure — a developer can paste `import { invokeClaudeP } from '../tests/e2e/lib/llm-driver.js'` into the CLI and `npm run lint` will not catch it. The existing `e2e-lint-triage-guard.test.js` only exercises the rule on `tests/e2e/lib/triage-classifier.js`. This breaks the "three-layer defense" claim that D-07 + the layered guard pattern depends on.

A number of medium-impact issues also surfaced: LLM-supplied severities are passed straight into the `by_severity` summary without validation against the `SEVERITIES` taxonomy (D-04 schema-drift risk), the cluster-prompt order isn't deterministic across runs (`Map` iteration order is insertion-order, which is fine for one run but a Vitest spy could swap order on test re-runs), and a stale docstring inside `runTriage` still claims a `pending_llm` placeholder that no longer exists in the code.

Verification Outcomes table appears at the end of this report.

## Critical Issues

### CR-01: `npm run lint` does not cover the triage CLI script — D-07 ESLint guard is unenforced for `scripts/e2e-triage-classifier.mjs`

**Files:**
- `package.json:17`
- `eslint.config.js:124-147`
- `tests/e2e/scripts/e2e-lint-triage-guard.test.js` (entire file)

**Issue:**
`package.json` line 17 defines `"lint": "eslint tests/e2e/lib/"`. The ESLint scope is hard-coded to `tests/e2e/lib/`. The `eslint.config.js` block at lines 124-147 lists `scripts/e2e-triage-classifier.mjs` in its `files: [...]` array, but that block is only consulted when ESLint is invoked over a file path inside `scripts/`. Because `npm run lint` never enters `scripts/`, the rule for the CLI is configured but never run.

Consequence: a future contributor (or a refactor) can replace `import { invokeClaudePWithLedger } from '../tests/e2e/lib/llm-driver.js'` with `import { invokeClaudeP } from '../tests/e2e/lib/llm-driver.js'` in `scripts/e2e-triage-classifier.mjs` and bypass both the spend ledger AND the CI gate. `npm run lint` would still exit 0. The "three-layer CI defense" (D-07) reduces to two layers (wrapper gate + script gate) for the CLI surface — D-07 layer is effectively absent for one of the two files it was supposed to protect.

The existing test `tests/e2e/scripts/e2e-lint-triage-guard.test.js` only injects a violation into `tests/e2e/lib/triage-classifier.js` (FILE_UNDER_TEST line 38). It does NOT exercise the CLI-script path. A direct test like `npx eslint scripts/e2e-triage-classifier.mjs` would expose this gap immediately.

**Fix:** Broaden the lint script to include the configured paths:
```json
"lint": "eslint tests/e2e/lib/ scripts/e2e-triage-classifier.mjs",
```
Or — simpler and more robust — drop the path scope from the npm script and let ESLint walk the project (it already has per-file blocks):
```json
"lint": "eslint tests/e2e/lib/ scripts/"
```
Either way, add a second mutation test in `e2e-lint-triage-guard.test.js` that injects a forbidden import into `scripts/e2e-triage-classifier.mjs` (mirroring the existing test, with restore-safety belt-and-suspenders), so a future regression of the lint scope is caught.

---

## Warnings

### WR-01: LLM-supplied `severity` strings are accepted unvalidated and pollute the `by_severity` summary — D-04 + D-09 schema drift

**Files:**
- `tests/e2e/lib/triage-classifier.js:178-186` (parseSingleResponse)
- `tests/e2e/lib/triage-classifier.js:226-234` (parseClusterResponse)
- `tests/e2e/lib/triage-classifier.js:520-522` (summary loop)

**Issue:**
Both `parseSingleResponse` (line 180) and `parseClusterResponse` (line 228) assign `severity: parsed.severity` (or `p.severity ?? 'medium'`) from the LLM response with no membership check against the `SEVERITIES` frozen taxonomy. The systemPrompt asks the model to emit one of `critical|high|medium|low|info`, but model output is fundamentally untrusted.

When the summary loop runs (line 521), `report.summary.by_severity[f.severity] = (report.summary.by_severity[f.severity] ?? 0) + 1` will silently add a NEW key to `by_severity` for any out-of-taxonomy severity (e.g., `BLOCKER`, `urgent`, `null`, `""`). The D-09 contract pins `by_severity` to exactly the 5 SEVERITIES keys; downstream consumers (Phase 35 issue payload, Phase 37 digest) that switch on those 5 keys will silently miss findings with adversarial severities.

The same problem exists for `category` — an LLM-supplied category outside the ERROR_CLASSES set lands in `by_category` unchallenged. That's less critical (by_category is a free-form histogram per D-09), but still worth normalizing.

**Fix:** Clamp severity to SEVERITIES in both parser functions:
```js
const sev = SEVERITIES.includes(parsed.severity) ? parsed.severity : 'medium';
return { ..., severity: sev, ... };
```
And add a test that injects `severity: 'BLOCKER'` into a mocked LLM response and asserts `Object.keys(report.summary.by_severity).length === 5` (no taxonomy drift).

---

### WR-02: D-03 Rule 2 silently mis-severities non-WRONG_CITATION/VERIFIER_DISAGREE classifications

**File:** `tests/e2e/lib/triage-classifier.js:415-424`

**Issue:**
The Rule 2 branch (CONFIRMED + strong agreement) uses a binary ternary:
```js
severity: iter.classification === 'WRONG_CITATION' ? 'high' : 'medium',
```
This hardcodes the assumption that the only classifications reaching Rule 2 are `WRONG_CITATION` and `VERIFIER_DISAGREE`. But Rule 2 only gates on rerun verdict + strong agreement — it does NOT gate on classification. A pathological iteration with `classification: 'LLM_HALLUCINATED_SELECTION'`, a synthetic `verifier_verdict: { status: 'pass', tier_used: 'A' }`, and rerun verdict CONFIRMED would silently classify as `severity: 'medium'`. D-04 maps `LLM_HALLUCINATED_SELECTION` to `critical` — a 2-step severity downgrade.

While the combination is unlikely in production (LLM_HALLUCINATED_SELECTION normally has `verifier_verdict: null`), defensive code shouldn't trust unlikely combinations.

**Fix:** Either gate Rule 2 on classification explicitly (only fire for `WRONG_CITATION | VERIFIER_DISAGREE`), or use a complete severity lookup:
```js
const RULE2_SEVERITY = { WRONG_CITATION: 'high', VERIFIER_DISAGREE: 'medium' };
if (rerunEntry?.verdict === 'CONFIRMED' && VERIFIER_STRONG_AGREEMENT(iter.verifier_verdict)
    && iter.classification in RULE2_SEVERITY) {
  // ... use RULE2_SEVERITY[iter.classification]
}
```
The implicit-fallthrough variant (let unexpected combinations escalate to LLM via Rule 4) is safer than silently downgrading severity.

---

### WR-03: Stale docstring in `runTriage` references a `pending_llm` placeholder that no longer exists

**File:** `tests/e2e/lib/triage-classifier.js:332-337`

**Issue:**
The JSDoc block at lines 332-337 reads:
> "Ambiguous findings (Tier C + CONFIRMED) get a placeholder path_taken:'pending_llm' that Plan 03 replaces with 'llm_single' or 'llm_cluster'."

This describes Plan 02's intermediate state. Plan 03 fully wired the LLM second-pass, so `pending_llm` is never produced. A reviewer reading the docstring would believe an extra path-taken value exists. The arithmetic invariant test (line 1397+) implicitly enforces the absence of `pending_llm` (because heuristic_count + llm_pass_count + cluster_pass_count must equal total_findings, and `pending_llm` would fall into none of the three buckets), but the docstring is misleading.

**Fix:** Update the docstring:
```
* Ambiguous findings (Tier C + CONFIRMED, or any other case not heuristically resolved)
* escalate to the cluster pre-filter (D-11) which routes them through `invokeLlm` and
* produces path_taken in { 'llm_single', 'llm_single_parse_error',
*                          'llm_cluster', 'llm_cluster_parse_error' }.
```

---

### WR-04: `appendLedgerEntry` docstring requires `iteration_n` and `run_id`, but `invokeClaudePWithLedger` never passes them

**Files:**
- `tests/e2e/lib/llm-ledger.js:288-302` (docstring)
- `tests/e2e/lib/llm-driver.js:416-424` (wrapper call)

**Issue:**
The `appendLedgerEntry` JSDoc at `llm-ledger.js:294-298` lists `iteration_n: number` and `run_id: string` as required entry fields. The wrapper at `llm-driver.js:416-424` only passes `{iso, model, cost_usd, tokens_in, tokens_out, phase, source}`. The implementation doesn't enforce the documented contract (entries are just spread into the iterations array), so triage entries land in the ledger without `iteration_n` or `run_id` — they are visually distinct from Phase 31/32 entries.

Forensic reconciliation (the stated rationale for unconditional ledger append in Pitfall 8) is harmed: a developer auditing the ledger after a triage run cannot link an entry back to a specific iteration or run.

**Fix:** Either:
1. Pass `iteration_n` and `run_id` from the triage classifier through the wrapper (requires plumbing additional args through `invokeLlm({...})` calls in `runTriage`), OR
2. Update the `appendLedgerEntry` JSDoc to make `iteration_n` and `run_id` optional and document that triage entries omit them.

Option 2 is the lower-friction fix; option 1 gives better forensics. The CONTEXT.md does NOT require iteration_n/run_id on the ledger entry from triage, so option 2 honors decisions.

---

### WR-05: CLI script's `path.resolve(process.cwd(), rawInput)` enables writing `triage-report.json` outside the repo

**File:** `scripts/e2e-triage-classifier.mjs:159-160` + `198`

**Issue:**
The CLI accepts `--input <path>` and computes the output path as `path.join(path.dirname(resolvedInputPath), 'triage-report.json')`. If a user (or a misconfigured script) passes `--input ../../../tmp/llm-report.json`, the output will be written to `../../../tmp/triage-report.json`. The sibling check enforces that `rerun-report.json` must exist next to it, which limits casual abuse, but a determined adversary with write access to the working tree could stage adjacent files in any directory and have triage-report.json written there.

Risk severity is low (local-only tool, user already has write access in their own machine), but the input path is not constrained to `ARTIFACTS_ROOT` despite that constant being defined and used for the default-newest lookup.

**Fix:** Add a path-prefix validation that the resolved input lives under `ARTIFACTS_ROOT` (or another explicit allowlist):
```js
if (!resolvedInputPath.startsWith(ARTIFACTS_ROOT + path.sep)) {
  process.stderr.write('[e2e-triage-classifier] input must reside under tests/e2e/artifacts/\n');
  process.exit(1);
}
```
This preserves the in-repo workflow while blocking accidental escape from the artifacts directory.

---

### WR-06: `parseSingleResponse` / `parseClusterResponse` ignore catch-error context, making debug forensics harder

**Files:**
- `tests/e2e/lib/triage-classifier.js:175-198`
- `tests/e2e/lib/triage-classifier.js:210-249`

**Issue:**
Both parse functions swallow the JSON.parse error completely:
```js
try { parsed = JSON.parse(llmText); } catch { parsed = []; }
```
The error message would tell a developer WHY the LLM response failed to parse (truncated mid-string, trailing comma, leading markdown fence, etc.). Discarding it forces the developer to manually inspect the LLM output or instrument the function.

The rationale field of the synthesized parse_error finding is also generic — it says "parseClusterResponse: iteration_n not present in LLM array" but provides no excerpt of what the LLM actually returned.

**Fix:** Capture the error message and the first ~200 chars of `llmText`:
```js
let parseError = null;
let parsed;
try { parsed = JSON.parse(llmText); }
catch (e) { parseError = e.message; parsed = []; }
// ...
rationale: parseError ? `parse error: ${parseError}; head: ${llmText.slice(0, 200)}` : '...',
```
This costs nothing at runtime and dramatically improves debuggability of LLM contract violations.

---

## Info

### IN-01: Two unused imports in unit test file

**File:** `tests/unit/triage-classifier.test.js:38-52`

**Issue:**
- Line 39 imports `os` but `os` is also imported on line 39 (single import, used at line 59).
- Line 46 imports `emptyTriageReport` from triage-classifier but the symbol is never referenced anywhere in the file.
- Line 52 declares `const __dirname = path.dirname(fileURLToPath(import.meta.url));` but `__dirname` is never referenced after declaration. The `fileURLToPath` import on line 41 also goes unused after the `__dirname` declaration is removed.

**Fix:** Remove the unused `emptyTriageReport` import and the `__dirname` constant declaration (plus the `fileURLToPath` import once `__dirname` is removed). Leaves cleaner test file.

---

### IN-02: `e2e-lint-triage-guard.test.js` `process.once('exit', ...)` only catches normal Node exits

**File:** `tests/e2e/scripts/e2e-lint-triage-guard.test.js:51-59`

**Issue:**
The exit-safety net at lines 51-59 restores `triage-classifier.js` on a normal `'exit'` event. It does not handle:
- `SIGKILL` (cannot be trapped by user code; OOM-killer, `kill -9`)
- The shell's PowerShell parent process being terminated
- Hard process crashes (segfault in native module)

In any of these cases, `triage-classifier.js` is left in the violating state on disk and the developer's working tree is dirty. The test mentions this caveat in comment line 22-23 but does not document the recovery procedure.

**Fix:** Consider writing the original content to a temp backup file BEFORE the mutation, so even if Node is SIGKILL'd the developer can `cp <backup> triage-classifier.js`. Or — simpler — print a recovery hint to stderr at the start of the violation test:
```js
console.warn(`[recovery] if this test is interrupted, restore with:\n  git checkout -- ${FILE_UNDER_TEST}`);
```

---

### IN-03: Test 22 in `llm-driver.test.js` mutates `process.env.ANTHROPIC_API_KEY` without `try/finally`

**File:** `tests/unit/llm-driver.test.js:351-372`

**Issue:**
Lines 353-354 save and assign `process.env.ANTHROPIC_API_KEY`. Lines 367-371 restore it. But the assertions in between (`expect(...)`) can throw, in which case the env restore is skipped and subsequent tests (or subsequent runs in `vitest --watch`) see the leaked `'sk-leak-this-must-not-pass-through'` value. The rest of the unit-test file's tests don't read ANTHROPIC_API_KEY directly, but the leak could surface in `vitest --watch` if a developer adds a new test that does.

**Fix:** Wrap the assignment + assertions in `try/finally`:
```js
const originalKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = '...';
try {
  // ... assertions ...
} finally {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
}
```

---

### IN-04: `Test 4` in `llm-driver.test.js` has misleading comment about stderr absence

**File:** `tests/unit/llm-driver.test.js:596-597`

**Issue:**
The comment at line 596 reads: "Verify stderr absence from spawnCalls too — belt-and-suspenders for the guard." but the actual assertion at line 597 is `expect(appendSpy).toHaveBeenCalledTimes(0)`. That asserts ledger-write absence, not stderr absence. The comment is misleading.

**Fix:** Either update the comment to reflect what's actually asserted ("Belt-and-suspenders: no ledger write when phase cap blocks"), or add the actual stderr-absence assertion if intended.

---

### IN-05: `parseClusterResponse` synthesizes `category: 'HARNESS_ERROR'` for missing iteration_ns — masks the original classification

**File:** `tests/e2e/lib/triage-classifier.js:237-245`

**Issue:**
When the LLM cluster response is missing an iteration_n, the synthesized finding overrides `category` with `'HARNESS_ERROR'` — losing the input iteration's actual classification (e.g., `WRONG_CITATION`). This makes the `by_category` summary inaccurate: a cluster of 5 WRONG_CITATION iterations where 2 are missing in the LLM response would show `{ WRONG_CITATION: 3, HARNESS_ERROR: 2 }` instead of `{ WRONG_CITATION: 5 }`.

For forensic accuracy, the synthesized parse_error finding should carry the input iteration's classification in `category` AND tag the finding via `path_taken: 'llm_cluster_parse_error'` (which it already does correctly). The `category` override to HARNESS_ERROR is an information-loss bug, though not a security issue.

**Fix:** Use `iter.classification` for category, mirror `parseSingleResponse` line 181 which already does `parsed.category ?? iter.classification`:
```js
findings.push({
  iteration_n: iter.iteration_n,
  severity: 'low',
  category: iter.classification,    // <-- not 'HARNESS_ERROR'
  root_cause_hypothesis: 'cluster response missing this iteration_n',
  ...
});
```
Same correction applies to the cluster-call-failed-entirely branch at line 482-491 (per-iteration synthesized failure findings also override category).

---

## Verification Outcomes

| # | Invariant | Result | Evidence |
|---|-----------|--------|----------|
| 1 | No `getPdfSnippet`/`renderPdfSnippet` in production code | PASS | grep finds only docstring negative-statements at `triage-classifier.js:23,106,348` (NO code references) |
| 2 | `VERIFIER_STRONG_AGREEMENT` is a named exported constant; Tier C fails | PASS | `triage-classifier.js:42-43` exports the gate; tests at `triage-classifier.test.js:212-243` verify all 4 tiers, including explicit Tier C false at line 220-223 |
| 3 | D-03 rule chain order: FLAKE → strong+CONFIRMED → NOT_REPLAYABLE+specific → ambiguous | PASS | `triage-classifier.js:396-457` rule order matches; first-match-wins via `continue` between rules |
| 4 | `SEVERITIES` is a frozen taxonomy of exactly the 5 documented levels | PASS | `triage-classifier.js:60` `Object.freeze([...])`; test at `triage-classifier.test.js:252-272` verifies frozen + 5 levels + order |
| 5 | Cluster pre-filter runs AFTER heuristic resolution, BEFORE invokeLlm | PASS | `triage-classifier.js:460-515` cluster loop sits after the heuristic loop (`ambiguous[]` is fully populated) and is the only site that calls `invokeLlm` |
| 6 | `CLUSTER_THRESHOLD === 5` is an exported constant, inclusive | PASS | `triage-classifier.js:72` `export const CLUSTER_THRESHOLD = 5`; threshold check `group.length >= CLUSTER_THRESHOLD` (inclusive); test at `triage-classifier.test.js:862-866` asserts literal 5 |
| 7 | D-07 ESLint guard uses `paths` + `importNames` form, not `patterns.group` | PASS | `eslint.config.js:129-146` uses `paths: [{name, importNames}]`. Comment at lines 113-119 explicitly notes the distinction. BUT see CR-01 — guard is configured for `scripts/e2e-triage-classifier.mjs` but unenforced because `npm run lint` is scoped to `tests/e2e/lib/` |
| 8 | `wrapPatentData` rejects (throws) on literal `</patent_data>` in input | PASS | `triage-classifier.js:93-95` throws Error; test at `triage-classifier.test.js:834-836` verifies the throw |
| 9 | CI gate fires on `CI === 'true'` OR `GITHUB_ACTIONS === 'true'` BEFORE spawn AND BEFORE ledger | PASS | `llm-driver.js:384-390` returns ciGate early before reading the ledger or invoking subprocess; tests `Test 1` (line 510) and `Test 2` (line 526) of `llm-driver.test.js` verify both env vars and assert `spawnCalls.length === 0` AND `appendSpy.toHaveBeenCalledTimes(0)` |
| 10 | `appendLedgerEntry` is unconditional on success + error paths, but NOT on CI gate / cap block (correct) | PASS | `llm-driver.js:416-424` — append fires after subprocess invocation regardless of `parsed.ok`. CI gate (line 384) and cap block (line 397) return BEFORE the append. Tests 1-4 (lines 510-598) verify gated paths skip append; Tests 5-6 verify both success + is_error paths do append |
| 11 | `scripts/e2e-explore.mjs` is grandfathered (NOT in the ESLint files glob) | PASS | The literal string `scripts/e2e-explore.mjs` appears in `eslint.config.js` only as a comment (line 121), never as a `files:` entry. `scripts/e2e-explore.mjs` directly uses `invokeClaudeP` (per grep at lines 53, 248, 304) and passes lint |
| 12 | Path traversal / shell injection in CLI `--input <path>` | PASS-WITH-CAVEAT | No shell injection (uses `spawn` with arg array, no shell). Path traversal is technically possible: `path.resolve(process.cwd(), rawInput)` accepts `../..` etc. Risk is bounded (local-only tool, writes only triage-report.json adjacent to input). See WR-05 for hardening recommendation |
| 13 | `schema_version: 1` in triage-report.json | PASS | `triage-classifier.js:304` in `emptyTriageReport`; test at `triage-classifier.test.js:653` asserts `schema_version: 1` on the written report |
| 14 | No `pending_llm` in final output | PASS | grep across `triage-classifier.js`, the test file, and the CLI shows `pending_llm` only in comments/docstrings — never in code paths. Plan 03 fully replaced the placeholder. See WR-03 (stale docstring is the only remnant) |

---

## Fixes Applied

**Fixed at:** 2026-05-27
**Iteration:** 1
**Findings in scope (CR + WR):** 7
**Fixed:** 7
**Skipped:** 0
**Info findings deferred:** 5 (IN-01..IN-05 — not in scope per orchestrator objective)

Post-fix gate (all on the fix branch `gsd-reviewfix/34-…`, run from the
isolated worktree):
- `npm run test:src` → 531 passed | 4 skipped, exit 0
- `npm run lint` → 0 errors (2 pre-existing warnings in `settings.js`), exit 0
- `npm run e2e:triage-classifier -- --input tests/e2e/fixtures/uat-phase32-llm-report.json`
  → exit 0; wrote `tests/e2e/fixtures/triage-report.json` with 10 findings,
  all `path_taken: 'heuristic'`, `by_severity` has exactly the 5 SEVERITIES keys.

### Atomic fix commits

| Finding | Commit | Title |
|---------|--------|-------|
| CR-01   | `3d923c3` | fix(34-review): CR-01 — extend npm lint scope to include triage + rerun CLI scripts |
| WR-01   | `bf31f02` | fix(34-review): WR-01 — validate LLM severity against SEVERITIES taxonomy |
| WR-02   | `7c3e95d` | fix(34-review): WR-02 — explicit severity map at strong-agreement branch |
| WR-03   | `5a9f49c` | fix(34-review): WR-03 — update runTriage docstring (no pending_llm) |
| WR-04   | `5caf3a8` | fix(34-review): WR-04 — clarify appendLedgerEntry required-fields docstring |
| WR-05   | `6020751` | fix(34-review): WR-05 — bound --input path to artifacts/ or fixtures/ roots |
| WR-06   | `c84f6c8` | fix(34-review): WR-06 — include LLM output excerpt + parse error in fallback rationale |

### Per-finding notes

- **CR-01** narrowed approach chosen: lint script now lists `tests/e2e/lib/` plus
  the two CLI scripts that have configured per-file blocks
  (`scripts/e2e-triage-classifier.mjs`, `scripts/e2e-rerun-validator.mjs`).
  Grandfathered scripts (`e2e-explore.mjs`, `e2e-upload-llm-report.mjs`) are
  intentionally unaffected. Lint exits 0 with only pre-existing warnings.
- **WR-01** applied to both `parseSingleResponse` and `parseClusterResponse`.
  Fallback is `'medium'` on any out-of-taxonomy value. `category` left
  free-form per D-09.
- **WR-02** used the implicit-fallthrough variant (Review's safer recommendation):
  Rule 2 now gates on `iter.classification in RULE2_SEVERITY` so unexpected
  classifications fall through to Rule 3 / Rule 4 (LLM escalation) rather
  than getting silently downgraded.
- **WR-03** docstring rewritten to enumerate the four current `path_taken`
  values produced by the LLM second-pass (`llm_single`, `llm_cluster`,
  `llm_single_parse_error`, `llm_cluster_parse_error`).
- **WR-04** option 2 chosen (per Review's recommendation): JSDoc updated to
  mark `iteration_n` / `run_id` as optional, with a new note documenting
  which call sites set them (Phase 31/32 vs Phase 34). `source` field also
  documented.
- **WR-05** added both `ARTIFACTS_ROOT` and `FIXTURES_ROOT` as allowed input
  roots (per orchestrator objective). Two existing CLI tests had to move
  their staging directory from `os.tmpdir()` into `tests/e2e/artifacts/...`
  to keep exercising the missing-file and missing-sibling branches; one NEW
  test asserts the path-bound guard fires for `/tmp/` input.
- **WR-06** applied to both parse functions. Single path: includes
  `JSON.parse` error message + `llmText.slice(0, 200)`. Cluster path:
  distinguishes "parse error + head" from "valid array but iteration_n
  missing + head" — both useful failure modes for forensic debugging.

### IN-01..IN-05 deferred

Five Info findings were intentionally out of scope (orchestrator
objective: "Skip Info findings unless trivial"). They cover unused imports
(IN-01), SIGKILL-resilience of the lint-guard test (IN-02), test
env-var leak risk (IN-03), a misleading comment in `llm-driver.test.js`
Test 4 (IN-04), and a forensic-accuracy improvement to
`parseClusterResponse`'s synthesized HARNESS_ERROR category (IN-05). These
remain open for a future cleanup pass.

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixes applied: 2026-05-27 by Claude (gsd-code-fixer), iteration 1_

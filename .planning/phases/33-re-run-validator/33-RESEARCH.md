# Phase 33: Re-run Validator — Research

**Researched:** 2026-05-25
**Domain:** Deterministic replay validator for an LLM-driven E2E exploratory test loop
**Confidence:** HIGH

## Summary

Phase 33 is a **pure-Node, zero-new-dependency** phase that ships three coupled outputs in a single PR: (1) a deterministic 3-replay validator (`tests/e2e/lib/rerun-validator.js`) that wraps `pdf-verifier.js::verifyCitation`, (2) a CLI entrypoint (`scripts/e2e-rerun-validator.mjs` + `npm run e2e:rerun-validator`) that loads a target `llm-report.json` and writes `rerun-report.json` to the same `artifacts/{runId}/` directory, and (3) a four-field additive extension to `llm-report.json`'s iteration schema (`scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`) captured in `e2e-explore.mjs` between Step 8 (selectText) and Step 9 (getCitation). The committed Phase 32 UAT fixture is re-stamped in place with `null` placeholders and a `schema_version: 1` bump. ESLint's `no-restricted-imports` rule (currently scoped only to `pdf-verifier.js`) gets a parallel block for the new validator. [VERIFIED: CONTEXT.md D-01..D-16]

The risk surface is small and well-mapped. Every dependency exists in v3.0 primitives: `verifyCitation` is pure and deterministic [VERIFIED: tests/e2e/lib/pdf-verifier.js lines 830-850]; `parsedCache` is module-scope and correctly preserved between replays (D-07) [VERIFIED: tests/e2e/lib/pdf-verifier.js line 63]; `atomicWriteJson`'s EXDEV-fallback pattern is well-established in both `llm-report.js` (WR-06 fix) and `llm-ledger.js` [VERIFIED: tests/e2e/lib/llm-report.js lines 76-91 and tests/e2e/lib/llm-ledger.js lines 341-355]; the ESLint per-file scoping pattern is already in production [VERIFIED: eslint.config.js lines 50-71]. The only meaningful design surface is the XPath derivation algorithm in the capture code (Claude's discretion per CONTEXT.md).

**Primary recommendation:** Build the validator as a thin pure-data orchestrator (no I/O outside the validator entry point, no `src/` imports, no clock dependence), follow the established lib/ module shape (pure-function, vitest-unit-testable with mock fixtures), thread the four new fields through all 6 existing `appendLlmIteration` call sites with `null` on pre-browser failure paths, and ship the `REQUIRED_ENTRY_FIELDS` extension + ESLint scope extension + fixture migration in the same PR.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Anomaly Selection & Replay Eligibility**
- **D-01:** Only iterations with classification ∈ `{WRONG_CITATION, VERIFIER_DISAGREE}` are eligible for replay. These are the only classifications guaranteed to have non-null `verifier_verdict`, `citation`, and `selectedText` — the inputs `verifyCitation` requires.
- **D-02:** Non-replayable iterations (`HARNESS_ERROR`, `LLM_API_ERROR`, `LLM_HALLUCINATED_SELECTION`, `PASS`) emit a `rerun-report.json` entry with `verdict: "NOT_REPLAYABLE"`, `total_runs: 0`, and a `reason` field naming the gating classification.
- **D-03:** "Confirm" = string equality on `verifier_verdict.status` between original iteration and each replay.
- **D-04:** Tier C unanimous agreement across all 3 runs COUNTS as CONFIRMED. Tier C masking deferred to Phase 34.

**Validator Module & Invocation**
- **D-05:** Module path: `tests/e2e/lib/rerun-validator.js`.
- **D-06:** CLI: `scripts/e2e-rerun-validator.mjs` + `npm run e2e:rerun-validator -- --input <path>`. `--input` defaults to newest `tests/e2e/artifacts/*/llm-report.json` by mtime.
- **D-07:** Do NOT clear `pdf-verifier.js`'s `parsedCache` between replays. Cache hit is correct and fast.
- **D-08:** No additional determinism guards (no seed pin, no env scrub). `verifyCitation` is pure.

**rerun-report.json Schema & Persistence**
- **D-09:** Top-level shape: `{schema_version: 1, source_llm_report, run_id, started_iso, finished_iso, summary: {confirmed_count, flake_count, not_replayable_count}, replays: [...]}`.
- **D-10:** Per-replay entry shape: `{iteration_n, original_verdict_status, runs: [{status, tier_used, reason}, ...], confirmed_count, total_runs, verdict: "CONFIRMED"|"FLAKE"|"NOT_REPLAYABLE", reason}`.
- **D-11:** Output path: `tests/e2e/artifacts/{runId}/rerun-report.json` (same dir as input).
- **D-12:** Inline `atomicWriteJson` (temp-write + atomic rename + EXDEV fallback) in `rerun-validator.js` — do NOT extract a shared utility.

**llm-report.json Schema Extension**
- **D-13:** New keys (`scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`) added to `REQUIRED_ENTRY_FIELDS` in `tests/e2e/lib/llm-report.js`. The schema-guard requires KEYS present; `null` VALUES are allowed on pre-browser failure paths.
- **D-14:** Capture happens in `scripts/e2e-explore.mjs` between Step 8 (`selectText`) and Step 9 (`getCitation`). Values are `scroll_y = await page.evaluate(() => window.scrollY)`, `{width, height} = page.viewportSize()`, `selected_node_xpath = await page.evaluate(...)`. Pre-browser failure paths pass `null`.
- **D-15:** Re-stamp `tests/e2e/fixtures/uat-phase32-llm-report.json` in place: each iteration gets the four keys added with `null` values; top-level `schema_version: 1` added. No subscription credits burned.
- **D-16:** New ESLint `files` block in `eslint.config.js` matching `['tests/e2e/lib/rerun-validator.js']` with identical rule body to the existing pdf-verifier.js block.

### Claude's Discretion

- Exact XPath generation algorithm in `e2e-explore.mjs` capture code — recommended approach: walk `parentNode` from `window.getSelection().anchorNode`, building an `nth-child`-style path; degrade to `null` if `getSelection().rangeCount === 0`. Planner picks the final shape.
- Whether `--input` flag validation rejects relative paths or normalizes them — minor; default behavior `path.resolve(process.cwd(), input)` works.
- Unit-test fixture set: minimum coverage required by success criteria is CONFIRMED, FLAKE, and edge-case 2/3 (CONFIRMED exactly at threshold). Planner adds NOT_REPLAYABLE coverage and a regression test for the schema-version field.
- Error-message wording for missing keys (`appendLlmIteration` schema guard) — planner picks concrete phrasing.

### Deferred Ideas (OUT OF SCOPE)

- **Browser-based "full replay" mode** consuming `scroll_y` / `viewport` / `selected_node_xpath` via Playwright — fields ship in Phase 33, but the verifier-only rerun does not use them. Future phase.
- **`NEEDS_TRIAGE` verdict for Tier C unanimity** — explicitly rejected (D-04); deferred to Phase 34's heuristic classifier.
- **Shared `atomicWriteJson` utility** — YAGNI for v3.1; revisit when a 4th caller appears.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RERUN-01 | Re-run validator deterministically replays each LLM-flagged anomaly 3 times via verifier-only path (no browser) | `verifyCitation` from `pdf-verifier.js` is pure: no RNG, no clock dependence, module-scope `parsedCache` makes replays fast (~50ms vs ~3s for re-parse). Architecture pattern below. |
| RERUN-02 | Re-run validator writes `rerun-report.json` per anomaly with `{confirmed_count, total_runs, verdict}` schema; 2/3+ confirms → CONFIRMED, 0-1/3 → FLAKE | D-09/D-10 shape locked. `atomicWriteJson` pattern reused inline (D-12). |
| RERUN-03 | `llm-report.json` iteration schema extended with `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath` (ships in same PR as validator) | D-13 (REQUIRED_ENTRY_FIELDS extension) + D-14 (capture between Step 8/9) + D-15 (fixture re-stamp). Six existing call sites need threading. |
| RERUN-04 | ESLint `no-restricted-imports src/` guard extended to cover the re-run validator module | D-16: new `files` block in `eslint.config.js` parallel to pdf-verifier.js block. |

## Architectural Responsibility Map

This phase is local-tool / pure-Node only — no browser, no API, no database. The "tier" for this phase is the Node CLI tooling tier.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Iteration-eligibility filtering | Node CLI / pure data | — | `rerun-validator.js` is a pure-function module; reads classification string, returns boolean |
| 3-replay loop driving verifyCitation | Node CLI / pure data | pdf-verifier (independence tier) | Wraps `verifyCitation` ×3 per eligible iteration; no I/O between calls |
| Verdict computation (CONFIRMED/FLAKE/NOT_REPLAYABLE) | Node CLI / pure data | — | Pure comparison on `verifier_verdict.status` strings |
| rerun-report.json persistence | Node FS (atomic write) | — | Same `artifacts/{runId}/` dir as input; inline `atomicWriteJson` + EXDEV fallback |
| CLI argument parsing + default newest-by-mtime resolution | Node CLI | — | Mirror `scripts/e2e-explore.mjs` `parseArgs` idiom |
| Scroll/viewport/xpath capture | Playwright `page` evaluate | — | Only `e2e-explore.mjs` runtime touches Playwright; rerun-validator does NOT |
| Schema-guard validation | Node pure-function (`appendLlmIteration`) | — | Required-keys check extended; null values allowed |
| ESLint `no-restricted-imports` enforcement | Lint tooling (build time) | — | Per-file `files:` block in flat config |

**Tier boundary that matters:** The rerun-validator runs **without a browser**. Phase 33 deliberately does NOT consume the four new fields it adds to the schema — they are reserved for a future Playwright-driven "full replay" mode. The verifier-only rerun is sufficient for CONFIRMED/FLAKE classification of every iteration where `verifyCitation` can be re-invoked.

## Standard Stack

### Core (already installed; no version changes needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node 22 built-ins (`fs`, `path`, `url`, `child_process`) | bundled | All FS/IO needs | Zero new deps mandate (locked decision from v3.1 milestone kickoff) [VERIFIED: .planning/STATE.md "Zero new npm dependencies"] |
| `pdfjs-dist` | ^5.5.207 | PDF parsing (transitively via `verifyCitation`) | Already used by `pdf-verifier.js` [VERIFIED: package.json line 32] |
| `vitest` | ^3.0.0 | Unit + schema-guard tests | Existing test runner; `it.skipIf` pattern available [VERIFIED: package.json line 34] |
| `eslint` | 10.4.0 | `no-restricted-imports` enforcement | Already configured with flat config + per-file `files:` blocks [VERIFIED: package.json line 31, eslint.config.js] |

### Supporting (existing project modules)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/e2e/lib/pdf-verifier.js::verifyCitation` | in-repo | The single function the validator wraps | Once per replay × 3 replays per eligible iteration |
| `tests/e2e/lib/llm-report.js::REQUIRED_ENTRY_FIELDS` + `appendLlmIteration` | in-repo | Schema-guard extension point | D-13: extend the array; existing throw semantics on missing keys |
| `tests/e2e/lib/run-id.js::resolveRunId` | in-repo | Filesystem-safe run identifier | NOT needed by rerun-validator (the run_id is copied from `source_llm_report.run_id`); listed for completeness |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline atomic write helper (D-12) | Extract `atomicWriteJson` into shared `lib/atomic-write.js` | YAGNI: only 3 callers; CONTEXT D-12 rejects; flat lib/ surface preferred |
| 3 replays as a default | Configurable `--replays N` flag | Out of scope: success criteria specify "3"; YAGNI |
| Per-replay verifyCitation cache clear (`_clearParsedCache`) | Skip cache, force fresh parse each replay | CONTEXT D-07 rejects: cache hit is correct + deterministic; replays go from ~3s to ~50ms |
| Random seed pin / env scrub | `seedrandom` + clean env vars | D-08 rejects: `verifyCitation` is already pure; no RNG, no clock |

**Installation:** None. Phase 33 adds zero npm dependencies. [VERIFIED: package.json — no install needed]

**Version verification:**
```bash
node --version    # v24.11.1 confirmed [VERIFIED: shell]
npm pkg get devDependencies.vitest    # "^3.0.0" [VERIFIED: shell]
```

## Package Legitimacy Audit

> **N/A — no external packages are installed in Phase 33.**

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

Phase 33 is a pure-source-code phase. All dependencies (`pdfjs-dist`, `vitest`, `eslint`) already exist in `package.json` from prior phases. No `npm install` step appears in the plan. Skipping slopcheck is correct here.

## Architecture Patterns

### System Architecture Diagram

```
                                                                              
   CLI: npm run e2e:rerun-validator -- --input <path>                          
                       v                                                       
              scripts/e2e-rerun-validator.mjs                                  
              (thin orchestration, no business logic)                          
                       v                                                       
              --input resolution                                               
              (default: newest artifacts/*/llm-report.json by mtime)           
                       v                                                       
              read + JSON.parse llm-report.json                                
                       v                                                       
        tests/e2e/lib/rerun-validator.js (pure entrypoint)                     
              -- validateInput(report) --> { ok, errors[] }                    
              -- runValidator(report)   --> rerun-report shape                 
                       v                                                       
              for iter in report.iterations:                                   
                if iter.classification in {WRONG_CITATION, VERIFIER_DISAGREE}: 
                    runs = []                                                  
                    for replay in 1..3:                                        
                        verdict = await verifyCitation({                       
                            patentId, selectedText, observedCitation: citation 
                        })  // pdf-verifier.js (parsedCache hit ~50ms)         
                        runs.push({status, tier_used, reason})                 
                    confirmed_count = sum(r.status === orig_status)            
                    verdict = confirmed_count >= 2 ? CONFIRMED : FLAKE         
                else:                                                          
                    runs = []; verdict = NOT_REPLAYABLE                        
                       v                                                       
              compose top-level shape (D-09):                                  
                {schema_version, source_llm_report, run_id,                    
                 started_iso, finished_iso,                                    
                 summary: {confirmed_count, flake_count, not_replayable_count},
                 replays: [...]}                                               
                       v                                                       
              atomicWriteJson (inline, D-12: temp-write + rename + EXDEV)      
                       v                                                       
              artifacts/{runId}/rerun-report.json                              
                                                                              

  SEPARATE flow (e2e-explore.mjs, Step 8/9 boundary):                          
   await selectText({page, uniqueSubstring: sel.selectedText});                
   // --- D-14 capture block (NEW) ---                                         
   const scroll_y = await page.evaluate(() => window.scrollY);                 
   const {width: viewport_width, height: viewport_height} =                    
     page.viewportSize();                                                      
   const selected_node_xpath = await page.evaluate(deriveAnchorXPath);         
   // --- end capture ---                                                      
   const obs = await getCitation(page, ...);                                   
   await appendLlmIteration(reportPath, {                                      
     ..., scroll_y, viewport_width, viewport_height, selected_node_xpath,      
   });                                                                         
                                                                              
```

### Recommended Project Structure

```
patent-cite-tool/
├── tests/e2e/
│   ├── lib/
│   │   ├── pdf-verifier.js          # existing — D-07: parsedCache preserved
│   │   ├── llm-report.js            # MODIFIED — D-13: REQUIRED_ENTRY_FIELDS+4
│   │   └── rerun-validator.js       # NEW — D-05 pure-function validator
│   ├── fixtures/
│   │   ├── uat-phase32-llm-report.json          # MODIFIED — D-15 in-place re-stamp
│   │   ├── uat-phase32-llm-report.schema.test.js # MODIFIED — assert 4 new keys
│   │   └── rerun-validator-fixtures.js (or .json)  # NEW — unit test inputs
│   └── scripts/
│       ├── e2e-explore-ci-guard.test.js         # untouched
│       ├── e2e-explore-phase-flag.test.js       # pattern mirror for new CLI flag test
│       └── e2e-rerun-validator.test.js          # NEW — --input CLI flag tests
├── tests/unit/
│   └── rerun-validator.test.js      # NEW — verdict logic + atomic write + schema
├── scripts/
│   ├── e2e-explore.mjs              # MODIFIED — D-14 capture + 6 call site threading
│   └── e2e-rerun-validator.mjs      # NEW — D-06 CLI entry
├── eslint.config.js                  # MODIFIED — D-16 new files block
└── package.json                      # MODIFIED — add "e2e:rerun-validator" script
```

### Pattern 1: Pure-function lib/ module with inline atomic write

**What:** The validator module exports a pure entrypoint (input report → output report shape) plus a side-effecting writer that uses inline `atomicWriteJson`. Mirrors `llm-report.js` and `llm-ledger.js`.
**When to use:** Any new `tests/e2e/lib/*.js` module that produces a JSON artifact. The pattern is canonical in this codebase (3 callers and counting).
**Example:**
```javascript
// Source: tests/e2e/lib/llm-report.js lines 76-91 (canonical EXDEV-fallback)
function atomicWriteJson(destPath, content) {
  const tmpPath = `${destPath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-device rename — fall back to direct write.
      fs.writeFileSync(destPath, content);
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
      return;
    }
    throw err;
  }
}
```
[VERIFIED: tests/e2e/lib/llm-report.js lines 76-91 — WR-06 Phase 32 fix]

### Pattern 2: CLI shim + pure orchestrator with mocked deps

**What:** The CLI file (`scripts/e2e-rerun-validator.mjs`) is a thin shim that:
1. Parses args (`parseArgs(process.argv)`)
2. Resolves the input path (default = newest by mtime)
3. Reads + JSON.parses the file
4. Calls the pure orchestrator
5. Writes output

The pure orchestrator (`tests/e2e/lib/rerun-validator.js`) accepts all I/O deps as parameters so vitest can inject mocks. Identical to `scripts/e2e-upload-llm-report.mjs`'s `uploadReport()` pattern.
**When to use:** Every new CLI for v3.1. Makes spawn-tests trivial and unit-tests hermetic.
**Example:**
```javascript
// Source: scripts/e2e-upload-llm-report.mjs lines 141-150 (canonical injection shape)
export async function uploadReport({
  reportPath,
  ghClient,    // injected mock in tests
  readFile,    // injected mock in tests
  now,         // injected mock in tests
  // ...
}) { /* ... */ }
```
[VERIFIED: scripts/e2e-upload-llm-report.mjs lines 141-432]

### Pattern 3: ESLint flat config per-file `no-restricted-imports`

**What:** A new `files: ['tests/e2e/lib/rerun-validator.js']` block at the bottom of `eslint.config.js` carrying the same `patterns.group` array and `message` as the existing pdf-verifier.js block.
**When to use:** Any new lib/ module that has an "independence claim" (must not import from `src/`). The claim is per-file, not group-scoped, by D-16's explicit choice.
**Example:**
```javascript
// Source: eslint.config.js lines 50-71 (existing pdf-verifier.js block — clone this)
{
  files: ['tests/e2e/lib/rerun-validator.js'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: [
          '**/src/**',
          '../../../src/**',
          '../../src/**',
          '../src/**',
          '/src/**',
        ],
        message:
          'rerun-validator.js must not import from src/ — RERUN-04 independence claim. ' +
          'Use a fresh implementation; mirror production logic conceptually, do not reuse it.',
      }],
    }],
  },
},
```
[VERIFIED: eslint.config.js lines 50-71]

### Pattern 4: vitest schema-guard via round-trip

**What:** The schema test (`uat-phase32-llm-report.schema.test.js`) round-trips every iteration through `appendLlmIteration` in a tmp-dir copy of the empty skeleton. If `appendLlmIteration` does not throw on any iteration, every iteration meets the schema.
**When to use:** Whenever you add or extend a `REQUIRED_ENTRY_FIELDS` list. The test automatically updates with the implementation — no separate assertion list to maintain.
**Example:**
```javascript
// Source: tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js lines 75-84
it.skipIf(!fs.existsSync(FIXTURE))('every iteration passes appendLlmIteration schema guard (REQUIRED_ENTRY_FIELDS)', () => {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const iter of fixture.iterations) {
    expect(() => appendLlmIteration(tmpReportPath, iter)).not.toThrow();
  }
});
```
[VERIFIED: tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js lines 75-84]

**IMPLEMENTATION CAUTION:** The current `appendLlmIteration` validation rejects BOTH `undefined` AND `null` values [VERIFIED: tests/e2e/lib/llm-report.js line 217]:
```javascript
if (iteration?.[f] === undefined || iteration[f] === null) {
  throw new Error(`appendLlmIteration: missing required field '${f}'`);
}
```
D-13 requires `null` VALUES to be allowed for the four new keys while still requiring the KEYS to be present. The implementation must either:
- (a) Split the check: `iteration_n`, `iso`, `classification` retain the existing "undefined or null forbidden" semantics; the four new keys check ONLY for `=== undefined` (presence required, null permitted).
- (b) Switch the entire check to "key must exist" (`!(f in iteration)`) so all required keys accept null. This is simpler but slightly weakens the existing 3-field check, which would now accept `iteration_n: null`. Recommended **option (a)** to preserve the existing strictness while permitting null on the new fields only.

The planner picks; flag this as an explicit requirement on the plan.

### Anti-Patterns to Avoid

- **Clearing parsedCache between replays:** D-07 explicitly forbids; would balloon replay time from ~50ms to ~3s and serves no determinism purpose (`verifyCitation` is already pure).
- **Importing from `src/` in the rerun-validator:** Even transitively (via `llm-driver.js` or shared constants). VFY-02-style independence claim. If a constant is needed (e.g., SELECTION_MIN_CHARS), copy it locally. [VERIFIED: Pitfall 16 in .planning/research/PITFALLS.md]
- **Per-iteration JSON re-serialization in the verdict loop:** Build the full `replays[]` array first, then `atomicWriteJson` once at the end. Mirrors `llm-report.js`'s read-modify-write-whole-file pattern but applied at function-exit boundary, not per iteration.
- **Adding the 4 new keys to ONLY the post-selectText success path in e2e-explore.mjs:** D-14 requires `null` on all 5 pre-browser failure paths (LLM_API_ERROR x2, LLM_HALLUCINATED_SELECTION, HARNESS_ERROR x1, validation-retry failure x1). The schema-guard rejects entries missing the KEYS, so all 6 call sites must include them — null or real value.
- **Using `cat` / heredoc to re-stamp the fixture:** Use a Node script (`node -e ...` or a small `_migrate.mjs`). The fixture is 238 lines [VERIFIED: shell `wc -l`]; a heredoc edit is error-prone and easily breaks the JSON.
- **Treating verdict thresholds as `>` instead of `>=`:** Success criterion 1 specifies "2/3+ confirms → CONFIRMED". The boundary is `confirmed_count >= 2`, not `> 2`. The edge-case test in success criterion 2 ("exactly 2/3") would fail under the wrong inequality.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Re-parse PDF for each replay | `parsePdf()` directly | Let `verifyCitation` use its `parsedCache` (D-07) | Cache hit is correct + 60× faster; same module instance per process |
| Atomic JSON write | Buffered write + custom rename loop | Inline the established `atomicWriteJson` (D-12) | EXDEV fallback already debugged (WR-06); 5 lines, well-tested |
| Newest-file-by-mtime resolution | `fs.readdirSync` + sort by date string | `fs.statSync(p).mtimeMs` + `Math.max` | mtime is monotonic on a single machine; no timezone parsing |
| ISO timestamp | Manual `new Date()` formatting | `new Date().toISOString()` | Mirrors `started_iso` / `finished_iso` in `llm-report.js` |
| Verdict computation | Tier-aware ranking, tie-breakers, weight functions | Simple equality + threshold count (D-03 explicit) | Phase 33 measures determinism; Phase 34 owns nuance (Tier C escalation) |
| CLI argument parsing | Yargs / commander / minimist | Hand-rolled `parseArgs` loop matching `e2e-explore.mjs` lines 83-147 | Zero-new-deps mandate; the existing pattern is 60 lines and battle-tested |

**Key insight:** The validator is a 3-replay loop wrapping a single pure function. Everything else (file I/O, atomic write, schema validation, CLI parsing) has an existing pattern in the same repository — copy, do not invent.

## Runtime State Inventory

> Phase 33 introduces no rename / refactor / migration semantics. **This section is intentionally minimal.**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — phase creates new artifacts only. `tests/e2e/artifacts/{runId}/rerun-report.json` is a NEW path; no pre-existing files to migrate. | None |
| Live service config | None — no external services touched. The validator runs locally only; no CI workflow changes in this phase (Phase 36 wires `rerun-report.json` into `e2e-nightly.yml`). | None |
| OS-registered state | None — no scheduled jobs, daemons, or OS registrations. | None |
| Secrets / env vars | None — verifier-only path; no `claude -p`, no API keys. (CI guard pattern from `e2e-explore.mjs` lines 74-80 is NOT needed for the rerun-validator since it doesn't invoke LLMs.) | None |
| Build artifacts / installed packages | The committed Phase 32 UAT fixture (`tests/e2e/fixtures/uat-phase32-llm-report.json`) is re-stamped IN PLACE per D-15. This is a one-shot text edit, not a runtime-state migration — the file is data, not registered state. | One-shot Node migration script; do not commit the script long-term |

**The only "state" Phase 33 touches:** the committed fixture file, re-stamped in place. No runtime systems cache any of the renamed/extended values.

## Common Pitfalls

### Pitfall 1: Re-run validator missing scroll/viewport state (Pitfall 1 from research/PITFALLS.md)

**What goes wrong:** A future Playwright-driven "full replay" mode (out of scope but on the roadmap) cannot replay a SELECTION_FAILED case without knowing where on the page the LLM originally selected text. Google Patents lazy-renders DOM; the same `selectedText` may match a different (or no) node at a different scroll position.

**Why it happens:** The four fields cannot be added retroactively to the schema after the validator is shipped — every committed `llm-report.json` artifact would be missing them. [VERIFIED: .planning/research/SUMMARY.md line 95]

**How to avoid:** D-13/D-14/D-15 mitigate by adding the four fields with a strict schema guard, threading them through all 6 `appendLlmIteration` call sites with `null` on pre-browser paths, and re-stamping the committed fixture in the same PR. Phase 33 ships the SCHEMA; consumption is deferred.

**Warning signs:** A schema test that passes on the fixture but throws on a fresh `e2e-explore.mjs` run (means one of the 6 call sites was missed). After re-stamping, the fixture must contain `scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath` keys on every iteration entry — verify with `jq` or a Node snippet.

### Pitfall 2: Tier C masking (Pitfall 2 from research/PITFALLS.md) — DEFERRED to Phase 34

**What goes wrong:** A heuristic rule "if verifier_verdict.status === 'pass' then CONFIRMED" treats a Tier C ±10-line fuzzy match the same as a Tier A exact match. The extension could be systematically wrong-by-8-lines and the rerun-validator would unanimously confirm.

**Why it happens:** D-04 explicitly defers this. The rerun-validator measures **determinism** of the verifier-only path, not **semantic correctness**. Tier C masking is the triage classifier's problem (Phase 34, `verifier_strong_agreement` named constant).

**How to avoid in Phase 33:** Do nothing about tier_used at the verdict level. The shape (D-10) DOES capture `tier_used` per-replay run so Phase 34's classifier can read it; the verdict comparison uses ONLY `status` per D-03.

**Warning signs:** Phase 34 PR that "interprets tier_used inside the rerun-validator" — out of scope. Pull request review should reject any rerun-validator code that branches on tier_used.

### Pitfall 3: `appendLlmIteration` validation rejecting null on the four new keys

**What goes wrong:** D-13 explicitly permits `null` values on the four new keys (pre-browser failure paths can't capture scroll/viewport/xpath). The current validator rejects both `undefined` AND `null`:
```javascript
if (iteration?.[f] === undefined || iteration[f] === null) { throw ... }
```
[VERIFIED: tests/e2e/lib/llm-report.js line 217]

If the new keys are added naively to `REQUIRED_ENTRY_FIELDS`, every LLM_API_ERROR / HARNESS_ERROR iteration will throw during `appendLlmIteration`, breaking the entire exploratory run.

**Why it happens:** The closure shares the same loop for all required fields; the original 3 fields are non-null in practice.

**How to avoid:** Implementation option (a): introduce TWO required-field lists — one with "key must be present and non-null" (the existing 3) and one with "key must be present (null allowed)" (the new 4). Or option (b): switch the whole list to "key must be present", weakening the existing check. **Recommend option (a)** — preserves the existing strictness for fields that are always meaningfully populated. The planner picks; either way, the schema-guard unit test must cover both halves: missing key → throws; null value on a new key → does NOT throw.

**Warning signs:** Re-run of `e2e-explore.mjs` after the D-13 change throws on the first LLM_API_ERROR iteration. Unit test for `appendLlmIteration` with `{..., scroll_y: null}` should PASS, not throw.

### Pitfall 4: Re-stamping the fixture breaks the existing schema test

**What goes wrong:** The current `uat-phase32-llm-report.schema.test.js` does a round-trip through `appendLlmIteration`. After D-13 extends `REQUIRED_ENTRY_FIELDS`, every iteration in the existing fixture is missing the four keys → the round-trip throws → the test fails. Phase 32's Wave 3 fixture commit semantics are now broken until D-15 ships in the same PR.

**Why it happens:** D-13 and D-15 are coupled. Shipping D-13 without D-15 fails CI; shipping D-15 without D-13 leaves the fixture with extra ignored keys but the schema test passes (no enforcement).

**How to avoid:** Plan must order tasks so D-15 (fixture re-stamp) lands BEFORE or in the same atomic commit as D-13 (REQUIRED_ENTRY_FIELDS extension). The simplest ordering:
1. Update fixture in place (re-stamp + `schema_version: 1`)
2. Update schema test to assert presence of 4 new keys
3. Extend `REQUIRED_ENTRY_FIELDS`
4. Thread the 4 new keys through all 6 `appendLlmIteration` call sites in `e2e-explore.mjs`
5. Run vitest — all green

**Warning signs:** Mid-PR test failure with "appendLlmIteration: missing required field 'scroll_y'" against the fixture. Indicates D-15 not yet applied.

### Pitfall 5: Newest-by-mtime selecting a partial / in-progress llm-report.json

**What goes wrong:** D-06's default-input logic (newest `artifacts/*/llm-report.json` by mtime) can select a file that is still being written by a concurrent `e2e-explore.mjs` run. The validator reads a partial JSON, fails to parse, or processes an iteration count smaller than the eventual final.

**Why it happens:** `appendLlmIteration` is atomic per-iteration via temp-write+rename [VERIFIED: tests/e2e/lib/llm-report.js lines 76-91], so JSON parsing won't fail mid-write. But the validator may still see "iteration N of 10" if invoked between iteration N and N+1 of an in-progress run.

**How to avoid:** The single-developer-single-machine assumption (locked in v3.0 milestone kickoff [VERIFIED: STATE.md "single-developer codebase"]) makes this a low-probability scenario. Mitigations available if the plan wants belt-and-suspenders:
- Check that `report.finished_iso > report.started_iso + some-delta` before proceeding (the in-progress run has them within milliseconds of each other; a completed run has them seconds apart). Not foolproof.
- Print the selected path to stdout BEFORE running (so the operator sees what was picked).
- Allow `--input` to override the default (D-06 already requires this).

**Warning signs:** A `rerun-report.json` with fewer replay entries than the `iterations[]` length of the source `llm-report.json` at completion. Operator notices and re-runs with explicit `--input`.

### Pitfall 6: The committed fixture has zero eligible iterations (NOT_REPLAYABLE only)

**What goes wrong:** The Phase 32 UAT fixture contains 10 iterations: 2 `LLM_API_ERROR` + 8 `HARNESS_ERROR` [VERIFIED: tests/e2e/fixtures/uat-phase32-llm-report.json lines 4-14 summary]. Per D-01/D-02, **none** are replay-eligible. Running the validator against this fixture produces a `rerun-report.json` with 10 NOT_REPLAYABLE entries and zero actual verifyCitation invocations.

**Why it happens:** The UAT live-burn primarily hit DOM/selection failures (Google Patents A/B drift during the UAT window). This is real data — not a bug — but means unit tests using the committed fixture cannot exercise CONFIRMED or FLAKE paths.

**How to avoid:** Unit tests MUST use synthetic fixtures with WRONG_CITATION / VERIFIER_DISAGREE iterations. The committed UAT fixture is appropriate for:
- The NOT_REPLAYABLE path (asserts 10 NOT_REPLAYABLE entries with correct `reason` strings).
- The schema-guard test (asserts 4 new keys present after re-stamp).
- The CLI end-to-end smoke test (assert the validator produces SOME valid output against real data).

The CONFIRMED / FLAKE / edge-2/3 cases (success criterion 2) need hand-crafted JSON fixtures with mocked `verifier_verdict` shapes. Plan must specify both fixture sources.

**Warning signs:** A unit test asserting `summary.confirmed_count === 3` using the UAT fixture as input. Wrong fixture — must use synthetic.

### Pitfall 7: ESLint rule scope mismatch on the new validator path

**What goes wrong:** The new `files: ['tests/e2e/lib/rerun-validator.js']` block uses an exact-path match. If the validator is later renamed or moved, the rule silently stops applying.

**Why it happens:** ESLint flat config matches `files:` against minimatch glob; an exact path is the strictest form.

**How to avoid:** D-16 explicitly chooses per-file scoping (not a glob like `tests/e2e/lib/{pdf-verifier,rerun-validator}.js`) — easier to grep, audit-friendly. This is locked. The risk is acceptable: a rename ALSO requires updating other places (npm script, plan refs, etc.), so the rule misalignment will be caught.

The plan should include a one-line `npm run lint` test that proves the rule fires: have a temporary test fixture file that imports from `src/`, confirm lint fails, remove the fixture. (Success criterion 4 already requires this.)

**Warning signs:** A `npm run lint` pass on a deliberate violation. Repro: temporarily edit `rerun-validator.js` to add `import 'src/shared/matching.js'`, run `npm run lint`, expect non-zero exit.

## Code Examples

Verified patterns from official sources / in-repo:

### Newest-file-by-mtime default-input resolution (D-06)

```javascript
// CLI default: newest tests/e2e/artifacts/*/llm-report.json by mtime
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_ROOT = path.resolve(__dirname, '../tests/e2e/artifacts');

function newestLlmReportPath() {
  if (!fs.existsSync(ARTIFACTS_ROOT)) {
    throw new Error(`No artifacts dir at ${ARTIFACTS_ROOT}; run e2e:explore first`);
  }
  const runDirs = fs.readdirSync(ARTIFACTS_ROOT)
    .map((name) => path.join(ARTIFACTS_ROOT, name))
    .filter((p) => fs.statSync(p).isDirectory());
  let best = null;
  for (const dir of runDirs) {
    const candidate = path.join(dir, 'llm-report.json');
    if (!fs.existsSync(candidate)) continue;
    const mtime = fs.statSync(candidate).mtimeMs;
    if (best === null || mtime > best.mtime) best = { path: candidate, mtime };
  }
  if (!best) throw new Error(`No llm-report.json found under ${ARTIFACTS_ROOT}`);
  return best.path;
}
```
[VERIFIED: pattern derived from tests/e2e/lib/llm-report.js line 40 + Node fs.statSync docs]

### Verdict computation (D-03/D-10, with edge case at exactly 2/3)

```javascript
// Pure-function verdict reducer. CONFIRMED at >= 2/3 (the boundary is inclusive).
function computeVerdict(originalStatus, runs) {
  const confirmedCount = runs.filter((r) => r.status === originalStatus).length;
  const totalRuns = runs.length;  // always 3 for eligible iterations
  let verdict;
  if (confirmedCount >= 2) verdict = 'CONFIRMED';
  else verdict = 'FLAKE';  // 0 or 1
  return { confirmed_count: confirmedCount, total_runs: totalRuns, verdict };
}
```
[VERIFIED: D-03 string-equality semantics + success criterion 1 thresholds; the `>= 2` boundary is the EDGE CASE in success criterion 2]

### appendLlmIteration extension — option (a) split-list approach

```javascript
// Suggested edit to tests/e2e/lib/llm-report.js — D-13 implementation.
// Two-list strategy preserves existing strictness on iteration_n / iso / classification
// while permitting null on the four new keys.

const REQUIRED_NONNULL_FIELDS = ['iteration_n', 'iso', 'classification'];
const REQUIRED_NULLABLE_FIELDS = [
  'scroll_y', 'viewport_width', 'viewport_height', 'selected_node_xpath',
];

export function appendLlmIteration(reportPath, iteration) {
  for (const f of REQUIRED_NONNULL_FIELDS) {
    if (iteration?.[f] === undefined || iteration[f] === null) {
      throw new Error(`appendLlmIteration: missing required field '${f}'`);
    }
  }
  for (const f of REQUIRED_NULLABLE_FIELDS) {
    if (!(f in (iteration ?? {}))) {
      throw new Error(`appendLlmIteration: missing required field '${f}' (null permitted)`);
    }
  }
  // ... rest unchanged
}
```
[VERIFIED: tests/e2e/lib/llm-report.js lines 215-234 — extension point]

### XPath capture (D-14 success path, Claude's discretion on exact algorithm)

```javascript
// scripts/e2e-explore.mjs — insert between line 411 (selectText) and line 414 (getCitation)
// One recommended XPath shape: nth-child path from html down to anchor node.
const scroll_y = await extInstance.page.evaluate(() => window.scrollY);
const vp = extInstance.page.viewportSize();  // { width, height }
const selected_node_xpath = await extInstance.page.evaluate(() => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.anchorNode;
  if (!node) return null;
  // If the anchor is a TEXT_NODE (nodeType 3), walk up to its parent ELEMENT.
  if (node.nodeType === 3) node = node.parentNode;
  const parts = [];
  while (node && node.nodeType === 1 && node.nodeName !== 'HTML') {
    let idx = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.nodeName === node.nodeName) idx += 1;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${node.nodeName.toLowerCase()}[${idx}]`);
    node = node.parentNode;
  }
  return parts.length ? '/html/' + parts.join('/') : null;
});

// Then ALL appendLlmIteration call sites add:
//   scroll_y, viewport_width: vp.width, viewport_height: vp.height, selected_node_xpath
// On pre-browser failure paths, pass null for all 4.
```
[VERIFIED: Playwright `page.evaluate()` + `page.viewportSize()` API; XPath shape is conventional but per CONTEXT.md Claude's discretion]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled atomic writes per caller | Inline 5-line `atomicWriteJson` + EXDEV fallback | Phase 32 WR-06 review (2026-05) | Three callers use the same battle-tested pattern; no abstraction premature |
| `process.argv.slice(2)` ad-hoc parsing | Strict-regex `parseArgs` with explicit equals-syntax rejection | Phase 32 Plan 32-03 (--phase flag) | Operators get clear error messages on typos; CONTEXT D-06 mirrors |
| Per-file ESLint glob blocks | Per-file exact-path blocks | Phase 28 Plan 28-04 (pdf-verifier independence) | Easier to grep for the independence story; CONTEXT D-16 follows |
| Single REQUIRED_ENTRY_FIELDS list with null-forbidden | Split nullable / non-nullable lists (proposed Phase 33) | Phase 33 D-13 (new fields can be null on pre-browser paths) | Preserves Phase 31 strictness while accommodating optional capture |

**Deprecated / outdated:**
- Nothing in the v3.0 toolchain is deprecated. `vitest@^3.0.0`, `eslint@10.4.0`, `pdfjs-dist@^5.5.207`, `Node 22` — all current as of 2026-05.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase 32 committed UAT fixture has zero replay-eligible iterations (10 NOT_REPLAYABLE under D-01/D-02). | Pitfall 6, Validation Architecture | Low — fixture content was inspected directly; classification distribution is HARNESS_ERROR (8) + LLM_API_ERROR (2). Verified by reading the fixture JSON. **[VERIFIED via direct file read]** — moved out of ASSUMED. |
| A2 | The `verifyCitation` call path has no clock dependence — `performance.now()` is used only for the duration_ms diagnostic field, not in match logic. | Pattern 1, D-08 | Low — confirmed via inspection of `verifyCitation` body (lines 830-850). The verdict shape includes `duration_ms` but match logic does not branch on time. **[VERIFIED via direct file read]** — moved out of ASSUMED. |
| A3 | XPath captured from `window.getSelection().anchorNode` represents the selection anchor stably enough for a future replay to navigate. | Code Examples / D-14 | Medium — DOM mutations between capture and replay could invalidate the XPath. CONTEXT.md flags this as Claude's discretion; Phase 33 ships the FIELD, not the consumer. A future Phase that consumes this field will need to handle stale XPath gracefully. |
| A4 | `appendLlmIteration` will be modified to permit null on the four new keys without breaking the existing 3-field strict check (option a). | Pitfall 3, Code Examples | Low — pure refactor; both halves are independently unit-testable. The plan-checker should call this out as a concrete required code edit. |
| A5 | The Phase 33 PR introduces no `npm install` step. | Standard Stack, Package Legitimacy Audit | Very low — verified by reading the success criteria and CONTEXT.md; no new libraries are mentioned anywhere. If the planner introduces one (e.g., a glob library for the default-input resolution), this must be re-evaluated. |

*A1 and A2 became VERIFIED during research — listed for traceability. A3-A5 remain ASSUMED and should be confirmed at plan time.*

## Open Questions

1. **Should the validator capture `verifyCitation` execution time per replay?**
   - What we know: The verifier returns `duration_ms` as a diagnostic field [VERIFIED: tests/e2e/lib/pdf-verifier.js line 848].
   - What's unclear: D-10's per-run shape (`{status, tier_used, reason}`) does NOT include duration. Whether the plan should add it is a small extension question.
   - Recommendation: Plan adds an optional `duration_ms` to the run shape — costs nothing and helps diagnose perf regression. Or keep D-10 verbatim and add later if needed.

2. **Does the CLI emit a non-zero exit code when all iterations are NOT_REPLAYABLE?**
   - What we know: Success criterion 1 specifies "rerun-report.json is written with `{confirmed_count, total_runs, verdict}` per anomaly".
   - What's unclear: If 100% of iterations are NOT_REPLAYABLE (as in the committed fixture, Pitfall 6), is that an error case or normal output?
   - Recommendation: Exit 0 in all cases where the output file is successfully written. A "no eligible iterations" condition is signaled by `summary.not_replayable_count === iterations.length` and is correct, not a failure. Plan should document this.

3. **Does the `--input` flag validation accept relative paths, absolute paths, or both?**
   - What we know: CONTEXT.md (Claude's discretion) suggests `path.resolve(process.cwd(), input)` works.
   - What's unclear: Should the CLI reject a non-existent file with a specific exit code (mirroring `e2e-upload-llm-report.mjs` exit code 1)?
   - Recommendation: Accept both relative and absolute, normalize via `path.resolve(process.cwd(), input)`, exit 1 with a clear message if the resolved path doesn't exist. Mirrors the upload helper.

## Environment Availability

> Phase 33 is pure-Node / pure-source code. The validator runs entirely against in-repo dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 | All scripts | ✓ | v24.11.1 [VERIFIED: shell] | — |
| vitest | Unit + schema tests | ✓ | ^3.0.0 [VERIFIED: package.json] | — |
| eslint | RERUN-04 enforcement | ✓ | 10.4.0 [VERIFIED: package.json] | — |
| `pdfjs-dist` (transitive) | verifyCitation parsing | ✓ | ^5.5.207 [VERIFIED: package.json] | — |
| Playwright `page` (D-14 capture only) | scroll/viewport/xpath capture in `e2e-explore.mjs` | ✓ | 1.60.0 [VERIFIED: package.json] | — |
| Committed Phase 32 fixture | Smoke-test the validator end-to-end | ✓ | uat-phase32-llm-report.json (10 iters) [VERIFIED: file exists, 238 lines] | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

> nyquist_validation is enabled (`.planning/config.json: workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 [VERIFIED: package.json] |
| Config file | `vitest.config.js` — `tests/**/*.test.js` glob, environment: 'node', globals: true [VERIFIED: vitest.config.js] |
| Quick run command | `npx vitest run tests/unit/rerun-validator.test.js tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js tests/e2e/scripts/e2e-rerun-validator.test.js` |
| Full suite command | `npm run test:src && npm run lint` |
| Lint command (RERUN-04 gate) | `npm run lint` (= `eslint tests/e2e/lib/`) [VERIFIED: package.json line 15] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| RERUN-01 | Validator replays each WRONG_CITATION + VERIFIER_DISAGREE iteration exactly 3 times via verifyCitation | unit (with spy on verifyCitation) | `npx vitest run tests/unit/rerun-validator.test.js -t "replays each eligible iteration 3 times"` | ❌ Wave 0 — new file |
| RERUN-01 | NOT_REPLAYABLE iterations skip verifyCitation entirely | unit (spy.callCount === 0 for those iters) | `npx vitest run tests/unit/rerun-validator.test.js -t "skips ineligible classifications"` | ❌ Wave 0 — new file |
| RERUN-02 | rerun-report.json shape matches D-09 top-level + D-10 per-replay | unit (schema assertion) | `npx vitest run tests/unit/rerun-validator.test.js -t "rerun-report.json schema"` | ❌ Wave 0 — new file |
| RERUN-02 | Verdict CONFIRMED when 3/3 match original status | unit | `npx vitest run tests/unit/rerun-validator.test.js -t "verdict CONFIRMED at 3/3"` | ❌ Wave 0 — new file |
| RERUN-02 | Verdict CONFIRMED at edge-case exactly 2/3 | unit (edge case) | `npx vitest run tests/unit/rerun-validator.test.js -t "verdict CONFIRMED at exactly 2/3"` | ❌ Wave 0 — new file |
| RERUN-02 | Verdict FLAKE at 1/3 and 0/3 | unit (boundary) | `npx vitest run tests/unit/rerun-validator.test.js -t "verdict FLAKE at"` | ❌ Wave 0 — new file |
| RERUN-02 | rerun-report.json atomically written; parent dir created if missing | unit (fs assertion) | `npx vitest run tests/unit/rerun-validator.test.js -t "atomic write"` | ❌ Wave 0 — new file |
| RERUN-02 | rerun-report.json EXDEV fallback path takes the direct-write branch | unit (mock fs.renameSync) | `npx vitest run tests/unit/rerun-validator.test.js -t "EXDEV fallback"` | ❌ Wave 0 — new file |
| RERUN-03 | REQUIRED_ENTRY_FIELDS includes scroll_y, viewport_width, viewport_height, selected_node_xpath | unit (schema guard via existing test pattern) | `npx vitest run tests/unit/llm-report.test.js -t "rejects entries missing"` | ✅ — extend existing Test 12 |
| RERUN-03 | appendLlmIteration accepts null on the four new keys (D-13) | unit (new test case) | `npx vitest run tests/unit/llm-report.test.js -t "permits null on capture fields"` | ❌ Wave 0 — extend existing test file |
| RERUN-03 | Re-stamped UAT fixture has 4 new keys on every iteration; schema_version: 1 at top level | schema-guard (existing fixture test) | `npx vitest run tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` | ✅ — extend existing |
| RERUN-03 | All 6 appendLlmIteration call sites in e2e-explore.mjs pass the 4 new keys | integration (manual code review + grep gate in plan-checker) | `grep -c 'scroll_y\|viewport_width\|viewport_height\|selected_node_xpath' scripts/e2e-explore.mjs` ≥ 24 occurrences (4 × 6) | manual at plan-check |
| RERUN-04 | ESLint config has files block for rerun-validator.js | unit (config-shape test) | optional — primarily covered by the lint smoke below | optional |
| RERUN-04 | `npm run lint` fails if rerun-validator.js imports from src/ | smoke (temp file + lint exit) | scripted smoke: write a temp violating file, run `npm run lint`, expect non-zero, restore | ❌ Wave 0 — new test |
| (CLI) | `e2e-rerun-validator.mjs --input <missing>` exits 1 with stderr message | integration (spawnSync) | `npx vitest run tests/e2e/scripts/e2e-rerun-validator.test.js -t "missing input"` | ❌ Wave 0 — new file |
| (CLI) | `e2e-rerun-validator.mjs` with no flag defaults to newest by mtime | integration (spawnSync against tmp artifacts dir) | `npx vitest run tests/e2e/scripts/e2e-rerun-validator.test.js -t "newest by mtime"` | ❌ Wave 0 — new file |
| (CLI) | `e2e-rerun-validator.mjs` against committed UAT fixture produces 10 NOT_REPLAYABLE entries | integration smoke | `npx vitest run tests/e2e/scripts/e2e-rerun-validator.test.js -t "UAT fixture smoke"` | ❌ Wave 0 — new file |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/rerun-validator.test.js tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js tests/unit/llm-report.test.js` (~3 seconds against the new test files only)
- **Per wave merge:** `npm run test:src && npm run lint` (full vitest suite + eslint on tests/e2e/lib)
- **Phase gate:** Full suite green before `/gsd:verify-work`: `npm run test` (build + test:src + test:chrome + test:firefox + lint + web-ext lint)

### Wave 0 Gaps

- [ ] `tests/unit/rerun-validator.test.js` — verdict logic + atomic write + schema + EXDEV fallback (covers RERUN-01, RERUN-02)
- [ ] `tests/e2e/scripts/e2e-rerun-validator.test.js` — CLI flag tests mirroring `e2e-explore-phase-flag.test.js` pattern (covers RERUN-01/02 CLI surface)
- [ ] Extension of `tests/unit/llm-report.test.js` Test 12 — assert four new keys are required, AND a new test case proving null values are permitted on the four new keys (covers RERUN-03)
- [ ] Extension of `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` — assert the four new keys present on every iteration AND `schema_version: 1` at top level (covers RERUN-03)
- [ ] RERUN-04 lint smoke test — scripted: write a temp `rerun-validator.js` that imports `'../../src/whatever.js'`, run `npm run lint`, expect non-zero exit, restore original. Either in vitest spawning `npm run lint` via spawnSync, or as a one-shot script in the plan's "validate" task.
- [ ] Synthetic fixture(s) for CONFIRMED / FLAKE / edge-2/3 cases — handcrafted JSON files with mocked verifier_verdict shapes. The committed UAT fixture cannot exercise CONFIRMED/FLAKE paths (Pitfall 6).
- [ ] No framework install needed — vitest ^3.0.0 already in `package.json`.

## Project Constraints (from CLAUDE.md)

Project's `./CLAUDE.md` directives the plan must respect:

- **Answer verification after every AskUserQuestion call.** If a `/gsd:ask-user` tool result is empty / generic / doesn't name an explicit choice, the planner / implementer must NOT assume, guess, or pick the "(Recommended)" option. Fall back to a numbered plain-text list and re-ask.
- This phase has 16 locked decisions in CONTEXT.md and a few "Claude's discretion" items; the planner can pick on discretion items without re-asking, but must NOT silently substitute its own preference for any of D-01..D-16.

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `tests/e2e/lib/pdf-verifier.js` (lines 49, 63, 830-855) — `verifyCitation` API, `parsedCache`, pure-function guarantees, `_clearParsedCache` test-only export
- Direct code inspection: `tests/e2e/lib/llm-report.js` (lines 40, 55, 76-91, 215-234) — `ARTIFACTS_ROOT`, `REQUIRED_ENTRY_FIELDS`, `atomicWriteJson` EXDEV-fallback pattern, `appendLlmIteration` validation
- Direct code inspection: `tests/e2e/lib/llm-ledger.js` (lines 320-356) — second exemplar of the EXDEV-fallback atomic-write pattern
- Direct code inspection: `scripts/e2e-explore.mjs` (lines 26-27, 50, 83-147, 411-414, 283, 337, 364, 390, 430, 457) — 6 `appendLlmIteration` call sites, Step 8/9 boundary, parseArgs idiom
- Direct code inspection: `eslint.config.js` (lines 27-71) — flat config + per-file `no-restricted-imports` pattern (the D-16 template)
- Direct code inspection: `tests/e2e/fixtures/uat-phase32-llm-report.json` — fixture content (10 iterations, all NOT_REPLAYABLE per D-01/D-02)
- Direct code inspection: `tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js` — existing schema-guard pattern to extend
- Direct code inspection: `tests/e2e/scripts/e2e-explore-phase-flag.test.js` (lines 42-119) — CLI flag test pattern to mirror
- Direct code inspection: `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — spawnSync hermetic CLI test pattern
- Direct code inspection: `scripts/e2e-upload-llm-report.mjs` (lines 141-432) — pure-orchestrator + injected-deps pattern; canonical for the new CLI shape
- Direct code inspection: `tests/unit/llm-report.test.js` (lines 279-302) — Test 12 missing-field rejection pattern; extension point for the new keys
- Direct code inspection: `package.json` — versions: vitest ^3.0.0, eslint 10.4.0, pdfjs-dist ^5.5.207
- `.planning/phases/33-re-run-validator/33-CONTEXT.md` — all 16 locked decisions D-01..D-16, scope, deferred items
- `.planning/phases/32-human-uat-verification/32-CONTEXT.md` — Phase 32 decisions D-02 (fixture path), D-14 (phase flag pattern Phase 33 mirrors for `--input`)
- `.planning/research/SUMMARY.md` §"Phase 2: Re-run Validator (Phase 33)" — phase rationale, the "schema fields cannot be added retroactively" guidance (line 95)
- `.planning/research/PITFALLS.md` Pitfall 1 (scroll/viewport state) — D-13/D-14 blueprint; Pitfall 2 (Tier C masking) — D-04 boundary rationale; Pitfall 16 (ESLint independence) — D-16 rationale
- `.planning/REQUIREMENTS.md` §RERUN — RERUN-01..RERUN-04 acceptance criteria
- `.planning/ROADMAP.md` lines 139-148 — Phase 33 success criteria

### Secondary (MEDIUM confidence)

- vitest 3 `it.skipIf` semantics — verified via existing schema test using the API (line 65 of `uat-phase32-llm-report.schema.test.js`)
- ESLint 10 flat config + `no-restricted-imports` — verified via existing in-repo usage (no Context7 lookup needed; pattern is in production)
- Playwright `page.viewportSize()` + `page.evaluate()` — verified via existing usage in `tests/e2e/lib/observation.js` and related modules

### Tertiary (LOW confidence)

- None — Phase 33 has no external-research-required components. All patterns are derived from in-repo code; all decisions are pre-locked.

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — zero new dependencies; every library version confirmed via `package.json` direct read.
- Architecture: **HIGH** — all 3 patterns (atomic write, CLI shim + pure orchestrator, ESLint per-file scope) have at least 2 in-repo exemplars each.
- Pitfalls: **HIGH** — derived from direct code inspection of the extension points (`REQUIRED_ENTRY_FIELDS` validator, the 6 `appendLlmIteration` call sites, the ESLint flat config) and from the v3.1 pitfalls research catalogued in PITFALLS.md.
- Validation Architecture: **HIGH** — vitest + the schema-guard round-trip pattern is established (Phase 32 Wave 0 fixture test); CLI-flag spawnSync tests follow the documented `e2e-explore-phase-flag.test.js` template.

**Research date:** 2026-05-25
**Valid until:** 2026-06-24 (30 days for a stable in-repo phase; no fast-moving external deps)

---

*Phase: 33-re-run-validator*
*Researched: 2026-05-25*
*Ready for planning: yes*

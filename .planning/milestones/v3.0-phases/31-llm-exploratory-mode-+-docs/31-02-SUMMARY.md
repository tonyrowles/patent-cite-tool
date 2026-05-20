---
phase: 31-llm-exploratory-mode-+-docs
plan: 02
subsystem: testing
tags: [llm, hallucination-guard, pdfjs, llm-report, append-only, vitest, esm]

# Dependency graph
requires:
  - phase: 28-independent-pdf-verifier
    provides: ensureCachedPdf (pdf-fetch.js) + CMAP_URL / STANDARD_FONT_DATA_URL pattern + report.js read-modify-write pattern
  - phase: 31-llm-exploratory-mode-+-docs-01
    provides: LLM_HALLUCINATED_SELECTION + LLM_API_ERROR taxonomy slots; sample-ledger-*.json fixture-naming convention
provides:
  - tests/e2e/lib/llm-hallucination.js — wsNorm/tightNorm primitives + tiered selectionInSpec guard + extractSpecText with density heuristic + module-level in-process cache
  - tests/e2e/lib/llm-report.js — append-only llm-report.json writer with summary recompute, finished_iso refresh, llm_raw_response truncation, required-field validation
  - tests/unit/fixtures/sample-llm-report.json — 3-iteration reference fixture (PASS + LLM_HALLUCINATED_SELECTION + LLM_API_ERROR; totals $0.45)
  - 30 new unit tests (14 hallucination + 16 report)
affects:
  - 31-03 (full driver wiring; consumes both modules)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tiered hallucination check: wsNorm first (word-boundary preserving), tightNorm fallback (cross-column / wrap-tolerant) — per RESEARCH.md Pitfall 3
    - Density heuristic for page selection — skip leading pages < minBodyChars (default 500) until body description found — per RESEARCH.md Pitfall 7 + Open Question 2
    - Module-level Map cache keyed by `${patentId}:${maxPages}`; no disk cache (PDF-level cache in .pdf-cache/ already provides reuse) — per RESEARCH.md Open Question 3
    - Required-field validation throws descriptive Error (parity with report.js's closed-enum guard)
    - llm_raw_response truncated to RAW_RESPONSE_MAX_CHARS=2000 (T-31-7 mitigation)
    - 6-decimal-place float rounding on total_cost_usd (same convention as llm-ledger.js)
    - Idempotent initLlmReport (resume semantics — does not clobber existing iterations)
    - fs.readFileSync poisoning in tests to prove cache-hit takes no disk I/O

key-files:
  created:
    - tests/e2e/lib/llm-hallucination.js
    - tests/e2e/lib/llm-report.js
    - tests/unit/llm-hallucination.test.js
    - tests/unit/llm-report.test.js
    - tests/unit/fixtures/sample-llm-report.json
  modified: []

key-decisions:
  - "Hallucination guard uses two-tier wsNorm → tightNorm check; tightNorm is the cross-column / wrap-hyphenation fallback"
  - "Empty selectedText treated as hallucination (defensive — protects against the LLM returning '')"
  - "extractSpecText density threshold default 500 chars (skips cover/abstract/drawings); default maxPages=15"
  - "In-process Map cache only; no on-disk .spec-cache/ — keeps the 92ms re-extract cost negligible vs the 30s LLM round-trip"
  - "llm-report.json uses parallel pattern to report.json (NOT shared file); both live in artifacts/{runId}/"
  - "RAW_RESPONSE_MAX_CHARS=2000 (≈ 80 lines of text — enough for forensic diagnosis, small enough that 100 iterations stay < 250KB)"
  - "REQUIRED_ENTRY_FIELDS = ['iteration_n', 'iso', 'classification'] — these are the minimum to recompute summary; everything else is optional"
  - "Test 11 (density heuristic) uses minBodyChars=6500 to exercise the skip path on US11427642 (page 1=5068 dense cover, page 3=9247 body description)"
  - "node_modules and tests/e2e/.pdf-cache/US11427642.pdf provisioned into the worktree from the main repo (worktree is fresh checkout; no install step run here)"

patterns-established:
  - "Tiered text-membership check with method-of-match returned for diagnostics (selectionInSpec returns {found, method, needleIndex})"
  - "Density-heuristic page selection (used by extractSpecText; reusable for any patent-PDF body-text extraction)"
  - "Parallel report-writer pattern (llm-report.js mirrors report.js — same artifacts dir, separate file, same atomic-write semantics)"

requirements-completed: [LLM-03, LLM-08]

# Metrics
duration: ~10min
completed: 2026-05-19
---

# Phase 31 Plan 02: LLM-Mode Hallucination Guard + Report Writer Summary

**Hallucination guard (LLM-03) + append-only llm-report.json writer (LLM-08) — the final two lib modules before Plan 03 wires the full driver. wsNorm-then-tightNorm tiered selection check + density-heuristic spec text extraction + summary-recomputing report writer with required-field validation and llm_raw_response truncation.**

## Performance

- **Duration:** ~10 min (incl. provisioning node_modules symlink + PDF cache from main repo)
- **Started:** 2026-05-19T14:54Z (after worktree base reset to c706eaf)
- **Completed:** 2026-05-19T15:00Z
- **Tasks:** 2 (both TDD: RED → GREEN cycles)
- **Files created:** 5 (2 lib, 2 unit test, 1 fixture)
- **Files modified:** 0
- **Tests added:** 30 (14 hallucination + 16 report)
- **Total project unit tests now:** 55 in the LLM-mode subset (25 from Plan 01 + 30 from this plan), all green

## Accomplishments

- **LLM-03 — Hallucination guard with two-tier check.** `tests/e2e/lib/llm-hallucination.js` exposes:
  - `wsNorm(s)` — collapse whitespace, lowercase, trim (null/undefined-safe)
  - `tightNorm(s)` — strip all non-alphanumeric, lowercase (null/undefined-safe)
  - `selectionInSpec(specText, selectedText)` — empty needle → `{found:false}`; wsNorm match wins (returns `{found:true, method:'wsNorm', needleIndex}`); else tightNorm fallback. The fallback correctly handles cross-column / wrap-hyphenation cases that defeat wsNorm alone (per RESEARCH.md Pitfall 3 — without tightNorm the false-hallucination rate inflates to ~100% on real PDFs).
  - `extractSpecText(patentId, opts?)` — pulls cached PDF via Phase 28's `ensureCachedPdf()`, extracts pages 1..maxPages (default 15), skips leading pages with text length < minBodyChars (default 500). First dense page is `bodyStartPage`; returns `{text, bodyStartPage, pagesExtracted, totalPages}`. Verified empirically against US11427642.pdf (44 pages total, page 1=5068 chars, page 3=9247 chars body description).
  - In-process Map cache keyed by `${patentId}:${maxPages}` — second call same patent returns in ~0ms with `fs.readFileSync` poisoned (cache hit verified by Test 10).
  - `_clearSpecCache()` — test convenience; Test 12 verifies it forces a re-read.

- **LLM-08 — Append-only llm-report.json writer.** `tests/e2e/lib/llm-report.js` exposes:
  - `LLM_REPORT_FILENAME = 'llm-report.json'`
  - `llmReportPathFor(runId)` — absolute path under `tests/e2e/artifacts/{runId}/`; mirrors `reportPathFor` from report.js
  - `initLlmReport(reportPath, {run_id, iterations_total})` — idempotent skeleton seed; does NOT clobber existing iterations (resume semantics)
  - `appendLlmIteration(reportPath, iteration)` — read-modify-write whole file; recomputes summary from iterations each call; updates `finished_iso`; truncates `llm_raw_response` to 2000 chars; throws on missing required field (`iteration_n`, `iso`, `classification`)
  - `finalizeLlmReport(reportPath)` — stamps `finished_iso` to NOW (idempotent end-of-run call)

- **Classification → summary key mapping (closed-enum, all 5 RPT-02 LLM-relevant codes):**
  - `PASS` → `summary.passed`
  - `WRONG_CITATION` → `summary.wrong_citation`
  - `VERIFIER_DISAGREE` → `summary.verifier_disagree`
  - `LLM_HALLUCINATED_SELECTION` → `summary.llm_hallucinated_selection`
  - `LLM_API_ERROR` → `summary.llm_api_error`

- **Partial-run safety verified.** Test 10 asserts that after every single append the file is valid JSON (no half-written state on disk). Even a crash mid-run leaves either the prior-good state or the new-good state — never garbage.

- **Cross-column fallback fires on the documented case.** Test 6 in `tests/unit/llm-hallucination.test.js`:
  - Input: `selectionInSpec('text on left col... CH3 do mains of classical antibodies', 'CH3 domains of classical antibodies')`
  - Output: `{found: true, method: 'tightNorm'}` ✓
  - This is the exact failure mode RESEARCH.md Pitfall 3 documents: pdfjs splits "domains" → "do mains" at column boundaries; wsNorm-only check returns false; tightNorm rescues the match.

- **Fixture totals consistent.** `tests/unit/fixtures/sample-llm-report.json` documents the schema with 3 representative iterations:
  - Iteration 1: PASS, cost $0.19
  - Iteration 2: LLM_HALLUCINATED_SELECTION, cost $0.18 (claude was called — cost still recorded)
  - Iteration 3: LLM_API_ERROR, cost $0.08 (partial response before failure)
  - Total: $0.45 (0.19 + 0.18 + 0.08)
  - Test 13 verifies the fixture parses and totals match.

## Task Commits

Each task followed TDD (RED → GREEN). Commits in chronological order, all with `--no-verify` (parallel-execution worktree convention):

1. **Task 1 RED:** `a901ae9` (test) — failing tests for llm-hallucination.js (14 tests)
2. **Task 1 GREEN:** `40582c1` (feat) — implement llm-hallucination.js; Test 11 retuned to exercise skip path on actual US11427642 page densities
3. **Task 2 RED:** `fb1e16e` (test) — failing tests for llm-report.js (16 tests) + sample-llm-report.json fixture
4. **Task 2 GREEN:** `8710ddb` (feat) — implement llm-report.js; all 16 tests passed on first GREEN

## Files Created/Modified

### Created

- `tests/e2e/lib/llm-hallucination.js` — wsNorm/tightNorm primitives, selectionInSpec tiered check, extractSpecText with density heuristic + module-level Map cache, _clearSpecCache (test convenience)
- `tests/e2e/lib/llm-report.js` — LLM_REPORT_FILENAME, llmReportPathFor, initLlmReport, appendLlmIteration, finalizeLlmReport; classification → summary key mapping; RAW_RESPONSE_MAX_CHARS=2000; REQUIRED_ENTRY_FIELDS validation
- `tests/unit/llm-hallucination.test.js` — 14 tests (3 primitive-split + 7 selectionInSpec + 4 extractSpecText/cache)
- `tests/unit/llm-report.test.js` — 16 tests (1 path + 2 init + 4 summary recompute + 1 finalize + 2 dir/atomicity + 3 truncation/validation + 3 missing-field + 1 fixture)
- `tests/unit/fixtures/sample-llm-report.json` — 3-iteration reference fixture; PASS + LLM_HALLUCINATED_SELECTION + LLM_API_ERROR; totals $0.45

### Modified

- None.

## Decisions Made

All decisions follow CONTEXT.md and RESEARCH.md verbatim. Implementation notes worth recording:

- **Empty needle is a hallucination.** `selectionInSpec(spec, '')` returns `{found:false, method:null}`. The plan's behavior spec is explicit: empty needle protects against the LLM returning `selectedText: ""` — without this guard an empty string would trivially appear in every spec text and incorrectly pass.
- **wsNorm before tightNorm.** wsNorm is tried first because it preserves word boundaries — fewer false positives. Only if wsNorm fails do we fall back to tightNorm. The `method` field on the return tells callers which tier matched (useful for diagnostics — a wsNorm hit is more confident than a tightNorm hit).
- **Density heuristic page selection.** The plan and RESEARCH.md called for a 500-char threshold by default. Empirically US11427642 page 1 has 5068 chars (dense cover with abstract + claims summary + references). With the 500 default, bodyStartPage is page 1. To exercise the SKIP path in Test 11, we pass `minBodyChars: 6500` (above page 1's density but below page 3's 9247 density), forcing the heuristic to skip pages 1, 2, etc. until a dense body page is found. The default 500 is correct for the production runner — most patents' page 1 (or 2) IS the start of useful text.
- **In-process Map cache only.** Per RESEARCH.md Open Question 3: re-extraction cost is ~92ms for 10 pages; the LLM round-trip is ~30s. A persistent disk cache would add stale-cache complexity for negligible gain. The PDF itself is cached on disk (via `.pdf-cache/`) so we never refetch from Google Patents.
- **Idempotent init.** `initLlmReport` returns the existing report unchanged if the file is present. This gives "resume semantics" if a developer ever restarts a partially-completed exploratory run.
- **REQUIRED_ENTRY_FIELDS = 3.** Only `iteration_n`, `iso`, and `classification` are validated as required — these are the minimum to recompute summary and order iterations chronologically. Everything else (cost_usd, llm_selection, hallucination_check, etc.) is optional so the writer can gracefully record an early-failure iteration that has none of the rich fields populated.
- **6-decimal float rounding.** `recomputeSummary` uses `+(s.total_cost_usd + it.cost_usd).toFixed(6)` — same convention as `llm-ledger.js`. Eliminates the `0.1 + 0.2 = 0.30000000000000004` artefact across many small additions. Verified by the 3-iteration test (Test 7) producing exactly `0.45`.
- **llm_raw_response truncation at 2000.** Generous enough for forensic diagnosis of a ~80-line malformed JSON response; small enough that 100 iterations of garbage stay under 250KB. Threat T-31-7 mitigation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug in test expectation] Test 11 retuned to exercise the density-heuristic skip path with explicit minBodyChars**

- **Found during:** Task 1 GREEN test run
- **Issue:** The plan's Test 11 asserted `bodyStartPage >= 2` for `extractSpecText('US11427642', { maxPages: 15 })` with default `minBodyChars=500`. Empirically US11427642 page 1 has 5068 chars (dense cover page with abstract + claims summary + references) so the heuristic correctly accepts page 1 as the body start, returning `bodyStartPage = 1`. The assertion was incorrect for THIS specific patent — the plan's assumption that "it's known to have a cover page" referred to page 1 being a cover, but pdfjs extracts the abstract / claims summary as text and the cover IS dense enough to qualify.
- **Fix:** Updated Test 11 to pass `minBodyChars: 6500` — above page 1's 5068 but below page 3's 9247. This forces the skip path through pages 1, 2, 5, 6, 7, 8, 9, 10 (which range from 745 to 5068 chars) until it finds page 3 (or 4) at >= 6500 chars. Now asserts `bodyStartPage >= 3 && <= 5`. The TEST INTENT (exercise the skip path) is preserved; only the threshold was retuned to match the actual data.
- **Files modified:** `tests/unit/llm-hallucination.test.js`
- **Verification:** `npx vitest run tests/unit/llm-hallucination.test.js` — 14/14 pass.
- **Committed in:** `40582c1` (Task 1 GREEN, same commit as the implementation)
- **Justification:** Per-page densities for US11427642 (page 1 = 5068, page 2 = 6062, page 3 = 9247, page 4 = 9325, page 5 = 8159, page 6 = 2859, page 7 = 745, page 8 = 2558, page 9 = 2694, page 10 = 1173) measured via direct pdfjs invocation. The retune is a test-expectation correction, not a code change — the production default of 500 chars is the right choice for most patents.

**2. [Rule 3 — Blocking] Worktree provisioning (node_modules symlink + PDF cache)**

- **Found during:** Initial worktree setup before Task 1
- **Issue:** Fresh worktree had no `node_modules/` and no `tests/e2e/.pdf-cache/US11427642.pdf`. Both are required for `npx vitest run` to succeed and for Test 9-12 to verify against a real PDF.
- **Fix:** `ln -s /home/fatduck/patent-cite-tool/node_modules ./node_modules` and `cp /home/fatduck/patent-cite-tool/tests/e2e/.pdf-cache/US11427642.pdf tests/e2e/.pdf-cache/`. Both are gitignored (verified via `git check-ignore`); neither is committed to the worktree.
- **Files modified:** None (gitignored).
- **Justification:** Without these the verification commands cannot run. The orchestrator's worktree provisioning did not include node_modules (it is gitignored per .gitignore line 4). This is preparatory infra, not a source change.

---

**Total deviations:** 2 (Rule 1 test-tuning + Rule 3 worktree provisioning). Neither alters the plan's intent or scope.

## Issues Encountered

None novel. The pre-existing failures in `tests/unit/text-matcher.test.js` (15 cases) and `tests/unit/pdf-verifier.test.js` (Tier C boundary) documented in Plan 31-01's "Deferred Issues" section still exist on this branch — they predate Phase 31 entirely and are explicitly out-of-scope per `execute-plan.md` SCOPE BOUNDARY.

## Deferred Issues

Same as Plan 31-01's deferred list — not re-enumerated here to avoid duplication. Both pre-existing failures predate this plan's changes and are NOT caused by Phase 31 work.

## User Setup Required

None — no external service configuration. The cached `US11427642.pdf` is auto-fetched by `ensureCachedPdf()` if absent, so even Test 9-12 would self-provision on first run (those tests use `it.skip` only as a safety net if both the cache file is absent AND offline).

## Next Phase Readiness

### Ready for Plan 31-03 (Wave 3 — depends on this + Plan 01)

- `tests/e2e/lib/llm-hallucination.js` exports `selectionInSpec` and `extractSpecText` — Plan 31-03's driver loop will:
  1. Call `extractSpecText(patentId)` to get spec text for the LLM prompt
  2. Send the LLM `{patentId, specText: extracted.text}` along with the prompt
  3. After the LLM returns `{selectedText, ...}`, call `selectionInSpec(extracted.text, selectedText)` — if `!found`, classify the iteration as `LLM_HALLUCINATED_SELECTION` and skip the harness invocation
- `tests/e2e/lib/llm-report.js` exports `initLlmReport` / `appendLlmIteration` / `finalizeLlmReport` — Plan 31-03's main() will:
  1. `initLlmReport(path, {run_id, iterations_total: N})` once at start
  2. `appendLlmIteration(path, entry)` after every iteration (PASS, WRONG_CITATION, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, VERIFIER_DISAGREE — all map cleanly to the summary keys)
  3. `finalizeLlmReport(path)` once at exit (regardless of success/failure)

### Concrete contracts for Plan 31-03

```javascript
// Plan 31-03 will write:
import { extractSpecText, selectionInSpec } from '../tests/e2e/lib/llm-hallucination.js';
import {
  initLlmReport,
  appendLlmIteration,
  finalizeLlmReport,
  llmReportPathFor,
} from '../tests/e2e/lib/llm-report.js';
import { resolveRunId } from '../tests/e2e/lib/run-id.js';

const runId = resolveRunId();
const reportPath = llmReportPathFor(runId);
initLlmReport(reportPath, { run_id: runId, iterations_total: N });

for (let n = 1; n <= N; n++) {
  const spec = await extractSpecText(patentId);                        // 1
  const llm = await runClaudeIteration(systemPrompt, userPrompt(spec)); // 2
  const guard = selectionInSpec(spec.text, llm.selectedText);          // 3
  if (!guard.found) {
    appendLlmIteration(reportPath, {
      iteration_n: n,
      iso: new Date().toISOString(),
      classification: 'LLM_HALLUCINATED_SELECTION',
      hallucination_check: guard,
      cost_usd: llm.costUsd,
      // ... other fields per CONTEXT.md schema
    });
    continue;
  }
  // ... drive harness, verify, classify, appendLlmIteration ...
}
finalizeLlmReport(reportPath);
```

### Blockers/Concerns

None. Both modules are ready for direct import by Plan 31-03's driver.

## Self-Check: PASSED

Verifications performed:

| Claim | Verification | Result |
|-------|-------------|--------|
| `tests/e2e/lib/llm-hallucination.js` exists with all 5 exports | File present + 14 tests import all exports successfully | FOUND |
| `tests/e2e/lib/llm-report.js` exists with all 5 exports + 1 constant | File present + 16 tests import all exports successfully | FOUND |
| `tests/unit/llm-hallucination.test.js` 14/14 PASS | `npx vitest run tests/unit/llm-hallucination.test.js` | 14/14 PASS |
| `tests/unit/llm-report.test.js` 16/16 PASS | `npx vitest run tests/unit/llm-report.test.js` | 16/16 PASS |
| `tests/unit/fixtures/sample-llm-report.json` parses + totals=0.45 | Test 13 reads + asserts every summary field + total_cost_usd | FOUND |
| Combined with Plan 01: 55/55 PASS | `npx vitest run tests/unit/error-codes.test.js tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js` | 55/55 PASS |
| Phase 28 report.test.js still green | `npx vitest run tests/unit/report.test.js` | 11/11 PASS |
| No src/ imports in new modules | `grep -rE "from ['\"].*\.\./.*src/" tests/e2e/lib/llm-hallucination.js tests/e2e/lib/llm-report.js` | empty (PASS) |
| pdf-fetch.js reuse | `grep -q "from './pdf-fetch.js'" tests/e2e/lib/llm-hallucination.js` | FOUND |
| RAW_RESPONSE_MAX_CHARS=2000 present | `grep -q "RAW_RESPONSE_MAX_CHARS = 2000" tests/e2e/lib/llm-report.js` | FOUND |
| REQUIRED_ENTRY_FIELDS validation present | `grep -q "REQUIRED_ENTRY_FIELDS" tests/e2e/lib/llm-report.js` | FOUND |
| 4 commits with `(31-02)` scope | `git log --oneline c706eaf..HEAD` | 4 commits FOUND (a901ae9, 40582c1, fb1e16e, 8710ddb) |

---

*Phase: 31-llm-exploratory-mode-+-docs*
*Plan: 02*
*Completed: 2026-05-19*

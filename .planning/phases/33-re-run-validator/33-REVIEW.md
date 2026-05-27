---
phase: 33-re-run-validator
status: findings
critical_count: 0
warning_count: 4
info_count: 6
fixed_count: 4
depth: standard
created: 2026-05-26
files_reviewed: 11
files_reviewed_list:
  - scripts/_migrate-uat-fixture.mjs
  - scripts/_verify-phase33-callsites.mjs
  - tests/e2e/lib/rerun-validator.js
  - tests/unit/rerun-validator.test.js
  - scripts/e2e-rerun-validator.mjs
  - tests/e2e/scripts/e2e-rerun-validator.test.js
  - tests/e2e/scripts/e2e-lint-rerun-guard.test.js
  - tests/e2e/lib/llm-report.js
  - tests/unit/llm-report.test.js
  - tests/e2e/fixtures/uat-phase32-llm-report.json
  - tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js
  - scripts/e2e-explore.mjs
  - eslint.config.js
  - package.json
  - tests/e2e/README.md
---

# Phase 33 Code Review

## Summary

All 16 locked CONTEXT.md decisions (D-01..D-16) are honored in the implementation. The verdict threshold uses `>= 2` (inclusive); `tier_used` does not gate verdict; `_clearParsedCache` is not referenced; the ESLint per-file block is a new D-16 block (not a glob merge); the D-13 null-permitted split uses `!(f in iteration)` semantics with the documented "(null permitted)" error message; the atomic-write pattern is inlined per D-12; the UAT fixture carries `schema_version: 1` plus the four null capture-state keys on every iteration; `scripts/_verify-phase33-callsites.mjs` exits 0. `npm run lint` is clean of NEW errors (two pre-existing warnings on `tests/e2e/lib/settings.js` are not Phase 33's responsibility).

There are no Critical correctness/security defects. Four Warnings and six Info findings — the most material is **WR-01**: `runValidator` does not wrap the per-replay `verifyCitation` call in try/catch, so any unguarded throw (invalid citation format, PDF fetch failure, parse failure, or a malformed iteration with `citation: null` / `llm_selection: null`) aborts the entire run after partial mutation, never writing the report. The validator's pre-condition (eligible iterations always have non-null patentId/selectedText/citation) holds for **real** outputs of `e2e-explore.mjs` today, but is not enforced — a single off-contract input file destroys all work and the CLI exits 1. **WR-02** flags the related null-vp gap in the new D-14 capture block. **WR-03** notes that `emptyReport()` was not updated to stamp `schema_version: 1` on freshly created `llm-report.json` files, creating an asymmetry with the migrated UAT fixture. **WR-04** notes the committed `scripts/_migrate-uat-fixture.mjs` is dead code post-invocation; D-15 itself said "invoked once and not committed long-term".

## Findings

### Critical (0)

_None._

### Warning (4)

#### WR-01: `runValidator` does not catch errors from `verifyCitation`; one bad replay aborts the entire run and loses the in-progress report

**File:** `tests/e2e/lib/rerun-validator.js:179-190`

**Issue:**
The 3-replay loop awaits `verifyCitation(...)` without a try/catch:

```js
for (let i = 0; i < 3; i++) {
  const r = await verifyCitation({
    patentId: iter.llm_selection?.patentId,
    selectedText: iter.llm_selection?.selectedText,
    observedCitation: iter.citation,
  });
  ...
}
```

`verifyCitation` (in `tests/e2e/lib/pdf-verifier.js`) throws in at least four cases:

1. Line 832: `if (!patentId || !selectedText || !observedCitation) throw new Error(...)` — fires when any optional-chained access above resolves to `undefined`/`null`.
2. Line 613: `parsePdf: file not found ${pdfPath}` — fires when the PDF cache fetch produced a missing file.
3. Lines 135 / 170: `parseCitation: invalid/unrecognized form '${citation}'` — fires on malformed citations.
4. Any I/O / network error inside `ensureCachedPdf`.

Cases 2-4 are realistic at scale; case 1 is reachable for hand-constructed or off-contract `llm-report.json` files (the `classifyIteration` doc explicitly says `citation falsy → WRONG_CITATION` is a possible code path).

When the throw escapes, the awaited `for...of inputLlmReport.iterations` aborts before reaching `writeReport(outputPath, ...)` at line 213, so:
- The CLI wrapper (`scripts/e2e-rerun-validator.mjs` line 181) prints `runValidator failed: ${e.message}` and exits 1.
- No `rerun-report.json` is written, even though prior eligible iterations may have already been replayed (those results are silently discarded in memory).

Phase 34 will read `rerun-report.json` to make triage decisions; a single bad iteration in a 100-iteration `e2e:explore` would deny downstream triage of every other iteration too.

**Fix:**
Wrap each replay in a try/catch and capture the error as a `NOT_REPLAYABLE` (or new `REPLAY_ERROR`) entry instead of aborting; OR move the throw containment to a per-iteration boundary. Suggested minimum patch:

```js
} else {
  const runs = [];
  let replayError = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await verifyCitation({ patentId: iter.llm_selection?.patentId,
                                        selectedText: iter.llm_selection?.selectedText,
                                        observedCitation: iter.citation });
      runs.push({ status: r.status, tier_used: r.tier_used ?? null, reason: r.reason ?? null });
    } catch (err) {
      replayError = err;
      break;
    }
  }
  if (replayError) {
    report.replays.push({
      iteration_n: iter.iteration_n,
      original_verdict_status: iter.verifier_verdict?.status ?? null,
      runs,
      confirmed_count: 0,
      total_runs: runs.length,
      verdict: 'NOT_REPLAYABLE',
      reason: `replay threw: ${replayError.message}`,
    });
    report.summary.not_replayable_count += 1;
    continue;
  }
  ...rest unchanged
}
```

Add a unit test that feeds a WRONG_CITATION iteration with `citation: null` and asserts the validator writes a `NOT_REPLAYABLE` entry (currently no test in `tests/unit/rerun-validator.test.js` exercises a real throw from `verifyCitation` — every test mocks it).

---

#### WR-02: D-14 capture block crashes the iteration if `page.viewportSize()` returns null

**File:** `scripts/e2e-explore.mjs:439, 495-496`

**Issue:**
The new capture block reads:

```js
const vp = extInstance.page.viewportSize(); // { width, height } — synchronous
...
viewport_width: vp.width,
viewport_height: vp.height,
```

`Page.viewportSize()` returns `null` whenever the context was created with `viewport: null` (Playwright contract). The current `tests/e2e/lib/extension-loader.js` does not pass `viewport`, so the default (1280×720) applies and `vp` is currently never null. But there is no defensive guard: a future change that disables the viewport (e.g. for a real-window test) would make `vp.width` throw `TypeError: Cannot read properties of null`. That throw is caught by the outer catch block at line 501 and misclassified as `LLM_API_ERROR` or `HARNESS_ERROR` — the actual root cause (capture-block failure) is hidden in `error_reason`. Worse, the throw fires AFTER `selectText` succeeded but BEFORE `getCitation`, so the LLM credit and the harness work for this iteration are both wasted.

**Fix:**
Guard `vp` explicitly:

```js
const vp = extInstance.page.viewportSize();
const viewport_width = vp?.width ?? null;
const viewport_height = vp?.height ?? null;
```

Then use `viewport_width` and `viewport_height` in the iteration object. This preserves D-13 null-permitted semantics for the capture fields rather than crashing the iteration.

---

#### WR-03: `emptyReport()` in `llm-report.js` was not updated to stamp `schema_version: 1` — future `e2e:explore` runs produce reports the new schema-guard would reject

**File:** `tests/e2e/lib/llm-report.js:167-177`

**Issue:**
D-15 added `schema_version: 1` as the first top-level key in the committed UAT fixture, and `uat-phase32-llm-report.schema.test.js` line 86-89 asserts the field is present. But `emptyReport()` was NOT updated to emit the field on a fresh init:

```js
function emptyReport(meta) {
  const now = new Date().toISOString();
  return {
    run_id: meta?.run_id,
    started_iso: now,
    finished_iso: now,
    iterations_total: meta?.iterations_total ?? 0,
    summary: emptySummary(),
    iterations: [],
  };  // no schema_version
}
```

This creates an asymmetry: the static UAT fixture carries `schema_version: 1`, but any `llm-report.json` produced by a future `npm run e2e:explore` does NOT. The schema-guard test is scoped to the UAT fixture path and won't catch this, so the regression is silent. Phase 34's triage classifier (which CONTEXT.md says will read both `llm-report.json` and `rerun-report.json` "with the same idioms") will need to handle the missing field, or Phase 33's schema contract will silently drift.

**Fix:**
Add `schema_version: 1` as the first key in `emptyReport()` and add a Test in `tests/unit/llm-report.test.js` asserting it. Two lines of code + one test. Alternatively, document explicitly in the file header that `schema_version` is ONLY on migrated fixtures and not on live writes — but that contradicts the implied "schema is locked" goal of D-13/D-15.

---

#### WR-04: One-shot migration script `_migrate-uat-fixture.mjs` was permanently committed despite D-15 specifying "invoked once and not committed long-term"

**File:** `scripts/_migrate-uat-fixture.mjs`

**Issue:**
D-15 (33-CONTEXT.md line 78) states: *"a tiny `scripts/_migrate-uat-fixture.mjs` invoked once and not committed long-term"*. The plan (33-01-PLAN.md line 126) overrode this and committed the script with a "safe to re-run (idempotent)" header. The script is now committed in the repo, contradicting the locked decision. It is functionally dead code: it can only ever mutate the one UAT fixture file, which is now already migrated. Future readers will see it and either (a) re-run it unnecessarily or (b) wonder whether the rest of the migration is pending.

This is a maintenance hazard, not a correctness bug — but the locked decision was specifically that this file should not live in the repo permanently.

**Fix:**
Two viable options:
1. (Preferred per D-15) Remove `scripts/_migrate-uat-fixture.mjs` in a follow-up commit. The fixture is already migrated; the script provides no future value.
2. If kept for audit reasons, move it under `.planning/phases/33-re-run-validator/` so its one-shot status is obvious by location.

If kept, also update the header to point at the locked-decision deviation and rationale (currently the header just says "safe to re-run").

### Info (6)

#### IN-01: No unit-test coverage for `runValidator` throw-propagation behavior

**File:** `tests/unit/rerun-validator.test.js`

**Issue:**
All 14 tests inject a mocked `verifyCitation` that always resolves. None feed an iteration where `verifyCitation` throws, where `iter.citation` is `null`, or where `iter.llm_selection` is `null`. The WR-01 defect went undetected because every test happy-paths the verifier. Even after fixing WR-01, a regression test should cover the rejection path explicitly.

**Fix:**
Add a test like:

```js
it('writes NOT_REPLAYABLE when verifyCitation throws (e.g. malformed citation)', async () => {
  const iterations = [makeIteration({ iteration_n: 1, classification: 'WRONG_CITATION',
    citation: null, verifier_verdict: null })];
  const spy = vi.fn().mockRejectedValue(new Error('verifyCitation: requires { observedCitation }'));
  const writer = makeCaptureWriter();
  await runValidator({ inputLlmReport: makeReport({ iterations }),
                       sourceLlmReportPath: reportPath, outputPath,
                       verifyCitation: spy, writeReport: writer,
                       now: () => new Date('2026-05-25T10:00:00Z') });
  expect(writer.getResult().replays[0].verdict).toBe('NOT_REPLAYABLE');
});
```

---

#### IN-02: `_verify-phase33-callsites.mjs` relies on a hardcoded literal call-site count with no escape hatch

**File:** `scripts/_verify-phase33-callsites.mjs:44`

**Issue:**
The constant `EXPECTED_CALL_SITES = 6` will produce a confusing failure if a future legitimate change adds or removes an `appendLlmIteration` call site in `e2e-explore.mjs`. The error message ("Expected exactly 6 call sites, found N") does not tell the reader that the expected count needs to be updated when the surface intentionally changes. Also, the regex `/appendLlmIteration\s*\(\s*reportPath\s*,\s*\{/` ASSUMES every call site passes a literal `reportPath` identifier — a refactor to e.g. `appendLlmIteration(this.reportPath, {...})` would yield `found = 0` and exit 1 even though semantics are unchanged.

**Fix:**
Either (a) document in the header that "if you add/remove an `appendLlmIteration(reportPath, {` line in e2e-explore.mjs, update EXPECTED_CALL_SITES here", or (b) loosen the regex to `appendLlmIteration\s*\(\s*\w+\s*,\s*\{`. Option (a) is lower-effort.

---

#### IN-03: Migration script does not validate the input fixture's shape before mutating

**File:** `scripts/_migrate-uat-fixture.mjs:29-41`

**Issue:**
The script does `JSON.parse(raw)` then `for (const it of migrated.iterations)`. If the fixture file is empty, malformed, or lacks an `iterations` array, the failure is an unhelpful `TypeError: migrated.iterations is not iterable`. Since the script is supposed to be idempotent and "safe to re-run", a corrupted-file scenario should at minimum log a meaningful error.

**Fix:** Defensive check before the loop:

```js
if (!Array.isArray(migrated.iterations)) {
  console.error(`ERROR: fixture has no .iterations array — abort`);
  process.exit(1);
}
```

This is low-priority — the fixture is committed and stable — but the script's "safe to re-run" claim deserves a robustness floor.

---

#### IN-04: `bodyChunk` extraction in `_verify-phase33-callsites.mjs` is brittle to nested-object closing patterns

**File:** `scripts/_verify-phase33-callsites.mjs:67-68`

**Issue:**
`bodyChunk = parts[i].split(CLOSE_RE)[0]` where `CLOSE_RE = /\}\)\s*;/`. This finds the FIRST `})` followed by `;`. All six current call sites in `e2e-explore.mjs` close their argument object with `});` on its own line, so this works today. But a future call site whose argument object contains a nested arrow `() => {…})` would close with `}` followed by `)` followed by `;` somewhere inside the body — silently breaking the parser's boundary detection.

**Fix:** Add a comment to the header explicitly forbidding nested `})` patterns inside `appendLlmIteration` call arguments in `e2e-explore.mjs`, OR switch to a proper depth-counting brace match. Comment is fine for now.

---

#### IN-05: `runValidator` re-invokes `now()` twice; the captured `started_iso` in `emptyRerunReport` is not reused for `finished_iso`'s assertion

**File:** `tests/e2e/lib/rerun-validator.js:81, 212`

**Issue:**
`emptyRerunReport` calls `now().toISOString()` once at line 81 for `started_iso`. `runValidator` calls `now().toISOString()` again at line 212 for `finished_iso`. With the production `now = () => new Date()`, this means started_iso < finished_iso (correct intent). But for unit tests injecting `now: () => new Date('2026-05-25T10:00:00Z')`, the two values are byte-identical — and no test asserts `finished_iso >= started_iso`. A regression where `finished_iso` is mistakenly assigned `null` or omitted would pass the test suite.

**Fix:** Add an assertion to the D-09 schema test: `expect(new Date(out.finished_iso).getTime()).toBeGreaterThanOrEqual(new Date(out.started_iso).getTime())`. Low priority — the field is read in Phase 34 only for display, not for logic.

---

#### IN-06: Variable shadowing in D-14 capture block: outer `const sel = validation.selection` (line 361) vs inner `const sel = window.getSelection()` (line 441)

**File:** `scripts/e2e-explore.mjs:361, 441`

**Issue:**
`scripts/e2e-explore.mjs:361` declares `const sel = validation.selection;` for the LLM-selected text/patent payload. `scripts/e2e-explore.mjs:441` (inside the new D-14 capture block) declares `const sel = window.getSelection();` inside the `page.evaluate(() => {...})` callback. The inner declaration runs in the browser context (a closure over the IIFE function body, not over the Node scope), so there is no semantic collision. But a maintainer reading the script could be momentarily confused; using a distinct name (e.g. `domSel`) inside the evaluate callback would remove the cognitive friction.

**Fix:** Rename the inner variable for readability:

```js
const selected_node_xpath = await extInstance.page.evaluate(() => {
  const domSel = window.getSelection();
  if (!domSel || domSel.rangeCount === 0) return null;
  let node = domSel.anchorNode;
  ...
});
```

## Verification Outcomes

| Invariant | Status | Evidence |
|-----------|--------|----------|
| D-04 no tier_used branching in verdict logic | PASS | `grep -n "tier_used" tests/e2e/lib/rerun-validator.js` returns only doc comments (lines 12, 50) and the audit-trail copy `tier_used: r.tier_used ?? null` on line 187 inside the per-run object — not in `computeVerdict` (lines 59-64). The verdict computation uses ONLY `confirmedCount >= 2`. |
| D-07 no `_clearParsedCache` call | PASS | `grep -c "_clearParsedCache" tests/e2e/lib/rerun-validator.js` outputs `0`. |
| Verdict threshold `>= 2` (inclusive) | PASS | Line 62: `const verdict = confirmedCount >= 2 ? 'CONFIRMED' : 'FLAKE';`. The 2/3 edge-case test ("verdict CONFIRMED at exactly 2/3") in `tests/unit/rerun-validator.test.js:309-331` passes via vitest run. |
| All 6 `appendLlmIteration` call sites carry the 4 capture keys | PASS | `node scripts/_verify-phase33-callsites.mjs` prints "OK: all 6 call sites contain all 4 keys", exits 0. |
| D-13 null-permitted semantics | PASS | `tests/e2e/lib/llm-report.js:238-242` uses `if (!(f in (iteration ?? {})))` and throws `'…(null permitted)'`. The first list (`REQUIRED_NONNULL_FIELDS`, line 55) keeps strict `=== undefined \|\| === null` semantics (line 234). Tests 12d-12h in `tests/unit/llm-report.test.js` exercise both branches. |
| D-16 ESLint block is a NEW per-file block, not glob merge | PASS | `grep -c "files: \['tests/e2e/lib/rerun-validator.js'\]" eslint.config.js` outputs `1`. The block is at lines 81-102, separate from the pdf-verifier.js block at lines 50-71. |
| Atomic write pattern (D-12) — inlined, not extracted | PASS | `tests/e2e/lib/rerun-validator.js:111-126` is the verbatim copy of the pattern in `tests/e2e/lib/llm-report.js:92-107`, including the EXDEV-fallback branch. No shared util introduced. |
| Independence guard (RERUN-04) | PASS (no NEW errors) | `npm run lint` exits 0. Two pre-existing warnings on `tests/e2e/lib/settings.js` ("Unused eslint-disable directive") are not Phase 33 regressions — they predate this phase. |
| Schema-guard error path identical for existing call sites | PASS | All 6 `appendLlmIteration` sites pass under the new two-loop validation; `npx vitest run tests/unit/llm-report.test.js` exits 0 (22 tests pass). |
| Prompt injection / shell injection in CLI scripts | PASS | `scripts/e2e-rerun-validator.mjs`, `scripts/_migrate-uat-fixture.mjs`, `scripts/_verify-phase33-callsites.mjs` use only `fs`, `path`, `node:url`. No `child_process.exec`, no `eval`, no shell interpolation. Input paths are resolved via `path.resolve(process.cwd(), input)` — Node's path resolver does not invoke a shell. The `spawnSync('node', [SCRIPT_PATH, ...args], …)` in test files uses Playwright's arg-array form (no shell), and ENV is `{...process.env, ...env}` with no untrusted-string interpolation. |
| UAT fixture re-stamped per D-15 | PASS | `jq '.iterations \| length'` outputs `10`; `jq '.iterations[] \| {scroll_y, viewport_width, viewport_height, selected_node_xpath}'` shows all four fields present as `null` on every iteration. Top-level `schema_version: 1` is the first key. |
| `npm run e2e:rerun-validator` smoke against UAT fixture | PASS | `tests/e2e/scripts/e2e-rerun-validator.test.js:129-150` exercises this and asserts exit 0, 10 NOT_REPLAYABLE replays, `summary.not_replayable_count === 10`. Vitest run is green. |

---

## Fixes Applied (2026-05-26)

All four Warning findings have been addressed; the six Info findings are
deferred (none gate phase completion). Each fix is an atomic commit on the
phase-33 branch.

| Finding | Commit | Files | Status |
|---------|--------|-------|--------|
| WR-01 | `41f5a1d` | `tests/e2e/lib/rerun-validator.js`, `tests/unit/rerun-validator.test.js` | Fixed |
| WR-02 | `f37a6dc` | `scripts/e2e-explore.mjs` | Fixed |
| WR-03 | `e7b0a1e` | `tests/e2e/lib/llm-report.js`, `tests/unit/llm-report.test.js` | Fixed |
| WR-04 | `c3a5e52` | `scripts/_migrate-uat-fixture.mjs` | Fixed (documentation hardening) |
| IN-01..IN-06 | _deferred_ | — | Not in fix scope (Info severity) |

**Post-fix gate (all three green):**

- `npm run test:src` — 467 tests passed / 4 skipped across 28 test files
- `npm run lint` — exit 0; only the two pre-existing `settings.js` warnings noted in the original review remain (not Phase 33 regressions)
- `node scripts/_verify-phase33-callsites.mjs` — exit 0 ("OK: all 6 call sites contain all 4 keys")

**Per-finding fix notes:**

- **WR-01** — Wrapped each `verifyCitation` call in `runValidator` in try/catch. On throw, the iteration emits a D-02-shaped `NOT_REPLAYABLE` entry with `reason: replay threw: <message>`, increments `summary.not_replayable_count`, and the loop continues. A new regression test in `tests/unit/rerun-validator.test.js` proves: (a) iteration 1 CONFIRMED, (b) iteration 2 NOT_REPLAYABLE with `/^replay threw: /` reason, (c) iteration 3 CONFIRMED (the throw did not abort the outer loop), (d) `writeReport` still ran. Note: WR-01 also covers IN-01's intent (test coverage for throw-propagation); IN-01 is therefore implicitly resolved by this commit.
- **WR-02** — Resolved `extInstance.page.viewportSize()` into named locals `viewport_width = vp?.width ?? null` and `viewport_height = vp?.height ?? null`, then passed those (instead of `vp.width` / `vp.height`) to the `appendLlmIteration` call site. The capture block no longer crashes if a future config sets `viewport: null`. `_verify-phase33-callsites.mjs` still finds all 6 sites carrying all 4 keys.
- **WR-03** — Added `schema_version: 1` as the first key returned by `emptyReport()` in `llm-report.js`, hoisted to a named `LLM_REPORT_SCHEMA_VERSION = 1` constant. Two new tests in `tests/unit/llm-report.test.js` assert (a) the field is present after fresh init AND is the first key (matching the migrated UAT fixture's key order), (b) it survives an `appendLlmIteration` round-trip.
- **WR-04** — Expanded the header comment in `scripts/_migrate-uat-fixture.mjs` from a terse "safe to re-run" one-liner to an explicit POST-INVOCATION status section: names the D-15 deviation literally, lists the three reasons for keeping the file committed (idempotency safety / permanent audit trail / cheap removal later), and adds forward guidance (a hypothetical schema-v2 migration should be a new file, not a mutation of this one). No behavioral change.

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

_Fixes applied: 2026-05-26_
_Fixer: Claude (gsd-code-fixer)_

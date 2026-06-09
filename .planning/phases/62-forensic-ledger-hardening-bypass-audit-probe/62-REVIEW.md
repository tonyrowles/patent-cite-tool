---
phase: 62-forensic-ledger-hardening-bypass-audit-probe
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - tests/e2e/lib/safe-append-ledger.js
  - tests/unit/safe-append-ledger.test.js
  - scripts/auto-fix-promote.mjs
  - scripts/e2e-explore.mjs
  - tests/unit/auto-fix-promote-gate.test.js
  - scripts/audit-bypass-merges.mjs
  - tests/unit/audit-bypass-merges.test.js
  - scripts/weekly-digest.mjs
  - tests/e2e/lib/llm-report.js
  - tests/unit/llm-report.test.js
  - tests/unit/weekly-digest-auto-fix.test.js
  - .github/workflows/e2e-weekly-digest.yml
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Plan 01 (LEDX-01..04 — shared `safe-append-ledger` helper + 4 wire sites) is a high-quality, surgically-correct refactor. The verbatim port of the CI/override/Phase-60.1-subscription-whitelist guard is byte-faithful (the lone semantic addition — transport validation — is correctly placed BEFORE the gate so the `transport: 'subscription'` whitelist still fires on default-tagged entries). All trust invariants verified hold:

- `git log -p 89c2163^..HEAD -- tests/e2e/lib/llm-ledger.js | wc -l` → 0 (BYTE-UNCHANGED).
- `git log -p 89c2163^..HEAD -- scripts/auto-fix.mjs | wc -l` → 0 (BYTE-UNCHANGED).
- `grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` → 1 (Phase 57 scope-lock preserved).
- 4 wired sites correctly pass `LEDGER_PATH` + canonical `transport` (`'subscription'` inline at promote sites; via `opts.defaults` at e2e-explore sites).
- The Phase 60.1 hotfix comment block is preserved verbatim in the new helper.
- `auto-fix-promote-gate.test.js` IP1/O1/O2/O3 co-touch is correct and well-justified.

Plan 02 (BYPASS-01..03 — `audit-bypass-merges.mjs` probe + weekly-digest metric + STATE.md smoke) is structurally sound and has good pure-function test coverage, BUT contains **two critical defects in `scripts/audit-bypass-merges.mjs`** that will cause the script to produce silently-wrong output in production:

1. **CR-01:** `JSON.parse(runsRaw)` will throw on any `--paginate` response that exceeds one page — `gh api --paginate` emits one JSON object per page concatenated as a stream, NOT a single merged object. Verified empirically against `sindresorhus/got` with `per_page=1` forcing 11 pages: `JSON.parse` failed at position 11653.
2. **CR-02:** Workflow-name filter mismatch — script defaults to `workflowName: 'verifier-gate'` but the actual workflow's `name:` field at `.github/workflows/v40-verifier-gate.yml:42` is `"V40 Verifier Gate"`. The filter `r?.name === parsed.workflowName` will never match → audit silently returns zero bypass rows, and `bypass_count` in the weekly digest will always be `0` regardless of actual bypasses.

Plus warnings/info on dead code (`opts.allowOverride` reserved-but-unused, `appendLedgerEntry` retained import in two scripts), the test file admits NOT mocking `gh` so `main()` is integration-untested (which is exactly how both critical bugs slipped through), and `--since-iso` lacks input validation.

## Critical Issues

### CR-01: `gh api --paginate` returns JSON-stream, not single JSON — `JSON.parse` will throw on multi-page results

**File:** `scripts/audit-bypass-merges.mjs:236-240`
**Issue:**
The script does:
```javascript
const runsRaw = execSync(
  `gh api 'repos/${repo}/actions/runs?event=pull_request&per_page=100&created=>=${parsed.sinceIso}' --paginate`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
const runsJson = JSON.parse(runsRaw);
```
`gh api --paginate` does NOT concatenate pages into one merged JSON object. It emits each page's response as a separate top-level JSON object, concatenated as a stream (no separator). On a single-page result this happens to parse correctly; on multi-page results `JSON.parse` throws `SyntaxError: Unexpected non-whitespace character after JSON at position N`.

Empirical confirmation against a public repo (`sindresorhus/got`) with `per_page=1` (forcing 11 pages): the output was 128KB; `JSON.parse` failed at position 11653 (end of first page). The RESEARCH.md comment at line 290–292 claiming "--paginate concatenates all pages into one JSON-stream output" is true literally (it IS a stream) but is misread by the implementation as "one JSON object".

Production impact:
- During steady-state weekly runs with low PR volume, page 1 will likely cover 7 days → script works by accident.
- During backfill runs (`--since-iso 30 days ago`) or busy weeks (>100 PR-event workflow runs), the script throws and the workflow step fails. The `main().catch` at line 289 will exit 1 → weekly digest job fails → operator must intervene. Worse: there's no visible smoke test for the multi-page path because tests do not mock `gh` (see WR-01).

**Fix:**
Option A — use `gh api --paginate --slurp` (gh 2.46+ added `--slurp` which merges page array into a single array; check `gh --version`):
```javascript
const runsRaw = execSync(
  `gh api 'repos/${repo}/actions/runs?event=pull_request&per_page=100&created=>=${parsed.sinceIso}' --paginate --jq '.workflow_runs[]'`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
const runs = runsRaw
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l));
```
Option B — handle the JSON-stream explicitly:
```javascript
// gh api --paginate emits one JSON object per page, concatenated.
// Parse with a streaming reader.
const pages = [];
let depth = 0, start = 0;
for (let i = 0; i < runsRaw.length; i++) {
  const c = runsRaw[i];
  if (c === '{') { if (depth === 0) start = i; depth++; }
  else if (c === '}') { depth--; if (depth === 0) pages.push(JSON.parse(runsRaw.slice(start, i + 1))); }
}
const runs = pages.flatMap((p) => p.workflow_runs ?? []);
```
Add a unit test that exercises a fixture string with 2 concatenated `{"workflow_runs":[...]}` objects.

---

### CR-02: Workflow-name filter mismatch — `'verifier-gate'` will never equal `'V40 Verifier Gate'`

**File:** `scripts/audit-bypass-merges.mjs:248` (+ `parseArgv` default at line 136)
**Issue:**
The filter:
```javascript
const filtered = runs.filter(
  (r) =>
    typeof r?.head_branch === 'string' &&
    r.head_branch.startsWith(parsed.branchPrefix) &&
    r?.name === parsed.workflowName,
);
```
compares the GitHub API `name` field to the literal `'verifier-gate'` (the `parseArgv` default at line 136). The `name` field in the GitHub API `/actions/runs` response is the workflow's declared `name:` from the YAML, NOT the file/slug name. Verified: `.github/workflows/v40-verifier-gate.yml:42` declares `name: V40 Verifier Gate`.

Since `'V40 Verifier Gate' !== 'verifier-gate'`, the filter returns `[]` unconditionally for every Phase 62 invocation that does not pass an explicit `--workflow-name`. The weekly digest passes no `--workflow-name`, so the production audit will ALWAYS emit zero rows → `bypass_count` is always `0`, and the entire BYPASS-01 capability is non-functional.

This bug is unit-test-invisible because `tests/unit/audit-bypass-merges.test.js` only covers pure helpers (`detectBypass`, `ledgerSourceForPr`, `rowsToCsv`, `parseArgv`) and explicitly does not mock the `gh` CLI subprocess.

**Fix:**
Choose ONE of:

1. Match by `path` (the workflow file path) instead of `name`:
```javascript
r?.path === '.github/workflows/v40-verifier-gate.yml'
// or:
r?.path?.endsWith('v40-verifier-gate.yml')
```
2. Update the default to the actual declared name:
```javascript
workflowName: 'V40 Verifier Gate',
```
3. Match by `workflow_id` resolved up-front via `gh api /repos/.../actions/workflows`.

Pair with a smoke test in the audit-bypass-merges suite that uses a fixture matching the real `name` field of `v40-verifier-gate.yml`. Without that fixture pin, this regression can re-emerge whenever the workflow's `name:` line is re-cased or re-worded.

## Warnings

### WR-01: `main()` and `assertGhAuth` are integration-untested — both critical bugs slipped through this gap

**File:** `tests/unit/audit-bypass-merges.test.js:11-13`
**Issue:**
The test file comment explicitly states:
```
// main() / assertGhAuth integration is NOT mocked here — those exercise live
// gh CLI subprocess behavior that's covered by the weekly-digest workflow
// smoke. The exported pure functions are individually unit-testable.
```
But there IS no weekly-digest workflow smoke that exercises `main()` end-to-end — the Plan 02 SUMMARY claims "Smoke `scripts/audit-bypass-merges.mjs --since-iso ...` against the live repo" as a follow-up operator action (NOT shipped). The result: both CR-01 (JSON.parse on multi-page) and CR-02 (workflow name mismatch) are entirely untested.

The user's specific concern ("do the new Vitest files mock `gh` CLI subprocess calls so tests run without `gh` auth in CI?") is correctly handled for the pure functions, but the consequence is that the integration path has zero coverage.

**Fix:**
Add at least one `vi.mock('node:child_process', ...)` integration test that:
- Stubs `execSync` to return a fixture-string of paginated `gh api` output (multi-object JSON-stream).
- Stubs `execSync('gh auth status')` to return success.
- Stubs `execSync('gh repo view ...')` and `execSync('gh api ...pulls/N --jq .merged_at')` with deterministic returns.
- Asserts the CSV output for the multi-page fixture matches expected rows.

This would have caught both CR-01 and CR-02.

---

### WR-02: `--since-iso` argv has no input validation (asymmetry with `--repo` which IS regex-validated)

**File:** `scripts/audit-bypass-merges.mjs:142-145`
**Issue:**
The `--repo` flag is correctly regex-validated against `/^[\w.-]+\/[\w.-]+$/` to mitigate shell-injection through the `gh api` URL (Threat T-62-C). But `--since-iso` is taken verbatim and dropped into the same URL template at line 237:
```javascript
`gh api 'repos/${repo}/actions/runs?event=pull_request&per_page=100&created=>=${parsed.sinceIso}' --paginate`
```
The single-quoted URL protects against shell metacharacters, but an attacker who can pass `--since-iso "2026-06-01' && evil-command #"` would terminate the single quote and execute arbitrary code via the shell. This is a real risk path only IF `--since-iso` ever comes from an untrusted source. Currently it's hard-coded in the workflow (`date -u -d '7 days ago' +...`) so the risk is theoretical — but the asymmetry is suspicious: why guard `--repo` and not `--since-iso`?

**Fix:**
Add an ISO-8601 regex validator to mirror the `--repo` discipline:
```javascript
case '--since-iso':
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) {
    throw new Error(`audit-bypass-merges: invalid --since-iso '${v}' (must be ISO-8601 like 2026-06-09T00:00:00Z)`);
  }
  out.sinceIso = v;
  i += 1;
  break;
```
Add a corresponding T_BYPASS_ARGV_SINCE_VALIDATION test.

---

### WR-03: `opts.allowOverride` destructured but unused — dead-flag surface area

**File:** `tests/e2e/lib/safe-append-ledger.js:70-77`
**Issue:**
```javascript
export function safeAppendLedger(ledgerPath, entry, opts = {}) {
  // opts.allowOverride is destructured but currently has no behavior;
  // reserved for future use per CONTEXT.md decision LEDX-01. Destructure
  // explicitly so the contract surface is visible at the signature level.
  const { defaults = {} } = opts;
  // Read opts.allowOverride defensively without binding (avoids
  // no-unused-vars lint warning) — the reservation is documented in the
  // JSDoc opts.allowOverride entry.
```
The comment says "destructure explicitly so the contract surface is visible" but the code does NOT actually destructure `opts.allowOverride` (it only destructures `defaults`). So the comment is misleading — the contract surface is only visible in the JSDoc, not the code. The opt is silently ignored by the helper: a caller who passes `{ allowOverride: true }` expecting to bypass the gate will get the same gate refusal they got without it.

This is a footgun: future callers may rely on the reserved flag's name suggesting it overrides the gate, only to discover at runtime that it does nothing. Worse, this is a security-adjacent dead flag — naming something `allowOverride` without it doing anything is a misleading API.

**Fix:** Either:
1. Remove `opts.allowOverride` entirely (and the JSDoc entry, and the `, { allowOverride = false } = {}` signature line in CONTEXT.md/RESEARCH.md). Reintroduce when it has a real implementation. OR
2. Implement it now (one line: include it as a fourth disjunct in the gate condition: `if (!inCi && !hasOverride && !isSubscriptionLocal && !opts.allowOverride)`).

Recommend option 1 — YAGNI; ship reserved API surfaces only when they have an immediate consumer.

---

### WR-04: `appendLedgerEntry` import retained but no longer called in two scripts (dead import)

**File:** `scripts/auto-fix-promote.mjs:76` AND `scripts/e2e-explore.mjs:43-46`
**Issue:**
After the Phase 62 rewire, `scripts/auto-fix-promote.mjs` no longer calls `appendLedgerEntry` directly — both call sites at `:521` and `:544` now route through `safeAppendLedger`. Same for `scripts/e2e-explore.mjs:268` and `:320`. Yet both files still import `appendLedgerEntry`:
```javascript
// auto-fix-promote.mjs:76
import { appendLedgerEntry, LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js';
```
The Phase 62 LEDX-02 comment justifies retention with: "The `appendLedgerEntry` import is retained — it may be referenced elsewhere in this module by future plans and removing it would force an unrelated import-policy audit edit." (auto-fix-promote.mjs:74-79; e2e-explore.mjs:50-51.)

This is a YAGNI violation that papers over a real coupling problem: the `IP2` test at `tests/unit/auto-fix-promote-gate.test.js:383-387` pins the verbatim import shape `{ appendLedgerEntry, LEDGER_PATH }`, which is what creates the "remove triggers unrelated edit" pressure. The import-policy audit was created to PREVENT smuggling LLM-driver imports — it should not be load-bearing for unused symbol retention.

Production impact: lint may emit `no-unused-vars` warnings (depending on rule severity). Future readers will be confused why `appendLedgerEntry` is imported in a file that doesn't call it.

**Fix:** Either:
1. Drop `appendLedgerEntry` from both imports and update the IP2 pin to `{ LEDGER_PATH }`. Same commit, mechanical edit.
2. Add an ESLint `eslint-disable-next-line no-unused-vars` comment with rationale on each import.

Option 1 is cleaner. The comment "may be referenced elsewhere by future plans" is speculative; future plans can re-add the import then.

## Info

### IN-01: Top-level `await import('node:path')` is unnecessary — use a static import

**File:** `scripts/audit-bypass-merges.mjs:287`
**Issue:**
```javascript
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) ===
    (await import('node:path')).resolve(process.argv[1]);
```
The dynamic `await import('node:path')` is unnecessary — `node:path` is a built-in and can be statically imported at the top of the file. Top-level await also forces the module into the async-init evaluation path, which can interact poorly with vitest's module loader in some configurations. The reference pattern in `scripts/weekly-digest.mjs:787-788` uses a STATIC `path` import (verified: `scripts/weekly-digest.mjs:47` imports `path` at the top), so this is an unforced deviation from the project's existing convention.

**Fix:**
```javascript
import path from 'node:path';
// ...
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
```

---

### IN-02: `--since-iso` default (8 days) vs workflow override (7 days) is a confusing asymmetry

**File:** `scripts/audit-bypass-merges.mjs:120,131` vs `.github/workflows/e2e-weekly-digest.yml:88`
**Issue:**
The script default in `parseArgv` is 8 days ago (per JSDoc: "RESEARCH Open Question 2 — 1-day cron-drift margin"), but the workflow always passes `--since-iso "$(date -u -d '7 days ago' ...)"` — 7 days. The script's default is never used in the CI path that consumes the result.

This is not a bug (workflow always wins), but it's a smell: either the cron-drift margin matters (workflow should use 8 days) or it doesn't (script default should be 7 days). Reading both, someone has to reason about why they differ.

**Fix:** Pick one. Recommend changing the workflow to `'8 days ago'` so the cron-drift margin is realized in production (the audit window slightly overlaps last week's window; idempotency on dedupe in Phase 66 absorbs the overlap).

---

### IN-03: `tests/unit/llm-report.test.js` Test A in-comment narrative re-explains a RESEARCH error inline

**File:** `tests/unit/llm-report.test.js:407-412`
**Issue:**
```javascript
// T_BYPASS_SUMMARY_KEYS_FROZEN + T_BYPASS_SUMMARY_KEYS_CONTAINS — additive-only:
// the new key is present AND a representative pre-existing key still is too.
// (Plan/RESEARCH references 'e2e_nightly' as the sentinel — that name appears
// in the RESEARCH interfaces.md snippet but NOT in the actual SUMMARY_KEYS at
// HEAD; the real first key is 'passed' per llm-report.js:124. Substitute the
// real one to keep the additive-only intent meaningful — deviation Rule 1.)
```
The comment is useful as forensic context, but it embeds an "Oh by the way, RESEARCH was wrong" mea culpa in a unit test. Future readers will spend time chasing whether the discrepancy was resolved or whether it's a latent inconsistency in the planning artifacts. This is a planning-artifact-drift issue, not a code issue.

**Fix:** Either update `62-RESEARCH.md` (and the SUMMARY references) to use `'passed'` as the sentinel, eliminating the discrepancy at its source; or move the explanation to the SUMMARY and trim the in-code comment to a one-liner.

---

## Trust-Invariant Verification (per `<specific_concerns>` checklist)

| Concern | Verification | Result |
|---------|--------------|--------|
| 1. LEDX-01 helper semantics preserve CI/override/Phase-60.1 whitelist | Side-by-side compare of `tests/e2e/lib/safe-append-ledger.js:109-134` vs `scripts/auto-fix.mjs:155-180` | PASS — verbatim port with `ledgerPath` parameterized, Phase 60.1 comment block byte-equivalent |
| 2. LEDX-02 wiring correctness — 4 sites, right ledgerPath/source/transport | Read `scripts/auto-fix-promote.mjs:537,564` + `scripts/e2e-explore.mjs:270,326` | PASS — promote sites inline `source/transport`; explore sites use `opts.defaults: { source: 'e2e-explore', transport: 'subscription' }` |
| 3. LEDX-03 `appendLedgerEntry` BYTE-UNCHANGED | `git log -p 89c2163^..HEAD -- tests/e2e/lib/llm-ledger.js \| wc -l` | PASS — 0 lines |
| 4. BYPASS-01 — `verifier_gate.completed_at > pr.merged_at`, `--paginate`, auth pre-check, `--repo` regex | Read `scripts/audit-bypass-merges.mjs` + dynamic test | **TWO CRITICAL DEFECTS** — `JSON.parse` on multi-page output fails (CR-01); workflow `name` filter never matches `'V40 Verifier Gate'` (CR-02). Auth pre-check + `--repo` regex are correctly implemented. |
| 5. BYPASS-02 SUMMARY_KEYS — Object.freeze + length +1 + no rename/reorder | Read `tests/e2e/lib/llm-report.js:124-132` + `tests/unit/llm-report.test.js:417-426` | PASS — additive-only edit; `Object.freeze` preserved; length 7→8; ordering preserved; pin updated in same commit |
| 6. `scripts/auto-fix.mjs` BYTE-UNCHANGED; `git push origin main` count == 1 in `v40-auto-fix.yml` | `git log -p 89c2163^..HEAD -- scripts/auto-fix.mjs \| wc -l` + grep | PASS — 0 lines + count == 1 |
| 7. Test mocking — `gh` CLI subprocess mocked in new Vitest files | Grep for `vi.mock`, `execSync` mocks in `audit-bypass-merges.test.js` | **NOT MOCKED** (acknowledged in file comment). Pure functions only — see WR-01. `main()` is integration-untested, which is exactly how CR-01 and CR-02 slipped through. |

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

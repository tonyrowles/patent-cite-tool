# Phase 14: End-to-End UAT + Digest - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 4 (1 modified, 1 modified-tests, 1 new-test-style, 1 new-doc)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/weekly-digest.mjs` (MODIFY — add `renderBugReportsSection` + a fetch helper, wire into `runDigest`) | utility (CLI report renderer) | request-response (gh fetch) + transform (markdown render) | same file — `renderAutoFixPipelineSection` (576-711) + `fetchAutoFixPrs` (759-781) | exact (in-file twin) |
| `tests/e2e/scripts/e2e-weekly-digest.test.js` (MODIFY — add bug-reports section unit tests) | test | request-response (fake ghClient/execFn injection) | same file — existing `runDigest`/`renderAutoFix*` suites | exact |
| `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` (MODIFY/REFERENCE — only if cron YAML touched; D-01 says it is NOT) | test | transform (grep-on-text contract) | same file (Y1-Y6) | exact |
| `.planning/phases/14-end-to-end-uat-digest/14-HUMAN-UAT.md` (NEW — consolidated operator runbook) | doc (runbook) | n/a (operator procedure) | `.planning/phases/12-fix-generation-regression-gate/12-HUMAN-UAT.md` | exact (same artifact type) |

Note: D-01 keeps the cron GitHub-token-only — **no `.github/workflows/e2e-weekly-digest.yml` change is required**, so the YAML-contract test only needs a new assertion if the planner decides to add one; the existing Y1-Y6 grep-style is the template if so.

## Pattern Assignments

### `renderBugReportsSection(...)` in `scripts/weekly-digest.mjs` (utility, transform)

**Analog (structural template, D-04):** `renderAutoFixPipelineSection` at `weekly-digest.mjs:576-711` — a *pure* function performing ZERO I/O; caller supplies already-fetched data.

**Signature + pure-function contract** (lines 576-579):
```javascript
export function renderAutoFixPipelineSection({ ledger, ghPrs, now, bypass_count }) {
  const prs = Array.isArray(ghPrs) ? ghPrs : [];
  const nowDate = now instanceof Date ? now : new Date(now);
  const month = nowDate.toISOString().slice(0, 7);
```
Mirror this exactly: `renderBugReportsSection({ issues, ghPrs, now })` (or whatever data props the planner picks — D-03 metric set). Defensive-coerce arrays with `Array.isArray(...) ? x : []`, coerce `now` with `now instanceof Date ? now : new Date(now)`. The function MUST NOT call `execSync`, `fs`, or fetch — all gh I/O happens in the fetch helper (below) and is passed in.

**Label-membership counting pattern** (lines 584-587, 591-594, 679-682) — the canonical "count PRs/issues carrying label X":
```javascript
const autoFixAttempted = prs.filter((p) => {
  const names = (p?.labels ?? []).map((l) => l?.name).filter(Boolean);
  return names.includes('auto-fix:verified') || names.includes('auto-fix:partial-verified');
}).length;
```
Reuse verbatim for the BUG_REPORTS counts. Grounded labels for D-03's metric set (verified to exist in `scripts/`): `report-fix-candidate` (issue volume — open+closed), `auto-fix-stuck` (stuck issues, `report-fix.mjs:378+`), `human-review-required` (overfit PRs, `auto-fix.mjs:242`), `auto-fix:verified` / `auto-fix:partial-verified` (merged-fix PRs). Optional/closed-issue counting follows the merge-state guard `p?.mergedAt !== null && p?.mergedAt !== undefined` (line 593).

**`<!-- source_issue: N -->` marker parse** (lines 658-666) — if the section reuses the already-fetched PR set (Claude's-Discretion option in CONTEXT) to map PRs back to promoted Issues:
```javascript
const match = body.match(/<!--\s*source_issue:\s*(\d+)\s*-->/);
```
This is the same marker the report-fix workflow emits (Phase 13 D-04) — reuse the exact regex; do not invent a second format.

**NaN/Infinity guard pattern (degrade-to-`n/a`)** (lines 599-622) — for any *ratio* metric (e.g. a promotion/merge rate):
```javascript
if (autoFixAttempted === 0) {
  successRate = 'n/a';                       // zero denominator → literal n/a, NOT 0%
} else {
  const pct = (verifiedMerged / autoFixAttempted) * 100;
  successRate = Number.isFinite(pct) ? `${pct.toFixed(1)}%` : 'n/a';
}
```
Distinct semantics to preserve: a **count** metric keeps integer `0` (line 705 `Number.isFinite(bypass_count) ? bypass_count : 0`; line 679-682 count stays 0), but a **ratio/derived** metric collapses to the literal string `'n/a'` on a zero/empty denominator. Honor D-02: label promoted-funnel rows honestly (e.g. "Promoted reports (report-fix-candidate)"), never "Total reports received."

**`<details><summary>` locked-row assembly** (lines 684-710) — copy this shape exactly:
```javascript
const lines = [];
lines.push('<details>');
lines.push('<summary>Bug Reports</summary>');        // D-04: summary label
lines.push('');
lines.push(`_fetched ${nowDate.toISOString()}_`);
lines.push('');
lines.push('| Metric | Value |');
lines.push('| --- | --- |');
lines.push(`| report_volume | ${reportVolume} |`);   // LOCKED ORDER — planner pins exact rows
// ... remaining rows in a fixed, deterministic order ...
lines.push('');
lines.push('</details>');
return lines.join('\n');
```
Fixed-order line array → deterministic diffs (same discipline as `renderDigest` lines 251-287). Pin the row order once; tests will assert it.

---

### Fetch helper (new, mirror `fetchAutoFixPrs`) in `scripts/weekly-digest.mjs` (utility, request-response)

**Analog (injected-deps + errors-RETURNED contract, D-05):** `fetchAutoFixPrs` at `weekly-digest.mjs:759-781`.

**Full template** (lines 759-781):
```javascript
export function fetchAutoFixPrs({ now, execFn } = {}) {
  const fetchedAt = now instanceof Date ? now : new Date(now ?? Date.now());
  const cmd =
    'gh search prs --label auto-fix:verified --label auto-fix:partial-verified ' +
    '--json number,state,mergedAt,createdAt,labels,body --limit 100';
  const runner = execFn ?? ((c, o) => execSync(c, o));   // <-- INJECTED-DEPS SEAM
  let raw;
  try {
    raw = runner(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return { prs: [], fetchedAt, error: String(err?.message ?? err) };   // <-- RETURNED, not thrown
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { prs: [], fetchedAt, error: String(err?.message ?? err) };
  }
  if (!Array.isArray(parsed)) {
    return { prs: [], fetchedAt, error: 'gh search prs returned non-array payload' };
  }
  return { prs: parsed, fetchedAt, error: null };
}
```
The new bug-reports fetch helper (e.g. `fetchBugReportIssues({ now, execFn })`) MUST:
1. Default `execFn` to a closure over `execSync` — production omits the arg, Vitest passes a fake (this is the determinism seam, CONTEXT D-04).
2. Return `{ <data>, fetchedAt, error }` — **never throw**. On non-zero exit / unparseable JSON / non-array → return `error: <string>` with empty data.
3. **NOT** call `process.stderr.write` — that is `runDigest`'s job (D-05 / the D-16 division of responsibility noted at line 749-750).

**If the helper queries issues** rather than reusing the PR set, the `gh` shape to mirror is `makeRealGhClient.listOpenIssuesByLabel` at `weekly-digest.mjs:306-342`:
```javascript
execSync(
  `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);
```
**CAUTION (asymmetry to preserve):** `listOpenIssuesByLabel` (lines 306-342) deliberately THROWS on failure (silent-zero refusal for the *core* findings count). The BUG_REPORTS section is the OPTIONAL-section contract and must do the OPPOSITE — errors RETURNED, degrade to `n/a` (D-05). So mirror the `gh api` *command shape* from line 317 but the *error contract* from `fetchAutoFixPrs` (line 768). Also note `report-fix-candidate` volume needs `-f state=all` (or open+closed) per D-03, not just `state=open`.

---

### Wiring into `runDigest` (the assembly site, D-04)

**Analog:** the existing step-(6.5) block at `weekly-digest.mjs:470-500`, which appends the Auto-Fix section AFTER `renderDigest` returns and BEFORE the file write.

**Injected-deps default at the top of `runDigest`** (lines 431-434):
```javascript
const fetchAutoFixPrsImpl = opts.fetchAutoFixPrs ?? fetchAutoFixPrs;
```
Add a sibling: `const fetchBugReportsImpl = opts.fetchBugReports ?? fetchBugReportIssues;` and extend the `runDigest` JSDoc opts (lines 413-423) with the new optional prop.

**The append-outside-budget pattern** (lines 467-500) — the load-bearing ordering:
```javascript
const md = renderDigest({ weekLabel, agg, costLine, now: nowDate });   // line 468 — ≤50-line guard lives at line 290, INSIDE renderDigest
// ... existing auto-fix section assembly (470-499) ...
const finalMd = md + '\n\n' + autoFixSection;                          // line 500
```
The BUG_REPORTS section must be concatenated into `finalMd` HERE (after `renderDigest` already returned, so the line-290 budget guard never sees it) and BEFORE the `fs.writeFileSync(reportPath, finalMd)` at line 505. Suggested: `const finalMd = md + '\n\n' + autoFixSection + '\n\n' + bugReportsSection;`

**The single-stderr-warning degrade pattern** (lines 478-483) — copy for the new fetch result:
```javascript
const ghPrsResult = fetchAutoFixPrsImpl({ now: nowDate });
if (ghPrsResult.error !== null) {
  process.stderr.write(
    `weekly-digest: auto-fix section degraded — ${ghPrsResult.error}\n`,
  );
}
```
Emit exactly ONE `process.stderr.write` for the bug-reports fetch error (D-05) and pass the (possibly-empty) data into `renderBugReportsSection`, which then renders `n/a` rows. The rest of the digest still ships.

---

### `tests/e2e/scripts/e2e-weekly-digest.test.js` (test, request-response)

**Analog:** the existing suites in the same file — direct-import of pure functions (lines 45-53) + fake-`ghClient`/`execFn` injection.

**Direct-import + epoch-anchor harness** (lines 45-69):
```javascript
import { renderAutoFixPipelineSection, fetchAutoFixPrs, runDigest /* + new exports */ }
  from '../../../scripts/weekly-digest.mjs';

const PIN_NOW_ISO = '2026-05-25T00:00:00Z';
const PIN_NOW = () => new Date(PIN_NOW_ISO);
const daysAgo = (n) => new Date(Date.parse(PIN_NOW_ISO) - n * 86400000).toISOString();
```
Add the new section/helper to the import list; reuse `PIN_NOW`/`daysAgo` for deterministic fixture dates.

**Pure-function unit test (no I/O)** — model on the `aggregate`/`renderDigest` tests (lines 232-300): construct fixture issues/PRs inline or from a fixture, call `renderBugReportsSection({...})` directly, assert the markdown contains the locked rows and that the zero-denominator case renders `n/a` (mirror the NaN-guard contract).

**Injected-`execFn` fetch test** — model on how `runDigest` accepts a fake `fetchAutoFixPrs` (lines 561-567 pass `ghClient`; CONTEXT D-04 wants the same seam for the new helper):
```javascript
const result = await runDigest({
  ghClient: mockGhClient,
  fetchBugReports: () => ({ issues: [...], fetchedAt: PIN_NOW(), error: null }),  // injected fake
  now: PIN_NOW,
  publishMode: 'issue',
  repo: 'test/test',
  reportsDir: runDir,
});
```
**Errors-returned degrade test** — assert that when the fake fetch returns `{ ..., error: 'boom' }`, the digest STILL writes (file exists, publish called) and the section shows `n/a` rows — the inverse of the CR-02 silent-zero test (lines 412-453) which asserts the *core* fetch HARD-aborts. Both must coexist; do not let the new test relax CR-02.

**Fake-ghClient shape to copy** (lines 542-559): a plain object with `listOpenIssuesByLabel`, `createDigestIssue`, `hasDiscussions`, `createDiscussion` that push to a `callLog`.

---

### `tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` (test, transform) — REFERENCE ONLY

**Analog:** Y1-Y6 in the same file (lines 36-83) — zero-dep grep-on-text assertions.

Only relevant if the planner adds a cron-YAML assertion. D-01 explicitly keeps the Monday cron GitHub-token-only with **no new secret/CF surface**, so the most likely use is a *negative* guard mirroring Y6 (lines 79-82): assert the digest workflow still contains NO `wrangler` / no CF creds. Template:
```javascript
expect(yaml).not.toContain('E2E_LEDGER_PATH_OVERRIDE');   // line 82 — copy shape for a 'wrangler' / 'CLOUDFLARE' negative guard
```

---

### `14-HUMAN-UAT.md` (doc, runbook)

**Analog:** `.planning/phases/12-fix-generation-regression-gate/12-HUMAN-UAT.md`.

**Front-matter + structure to copy** (12-HUMAN-UAT.md lines 1-13, 35-45):
```markdown
---
status: partial
phase: 14-end-to-end-uat-digest
source: [14-VERIFICATION.md]
started: <ISO>
updated: <ISO>
---

## Current Test
[awaiting human testing]

## Tests
### N. <title> (<req-ids>)
expected: <one-paragraph operator-observable outcome>
result: [pending]

## Summary
total: N
passed: 0
issues: 0
pending: N
skipped: 0
blocked: 0

## Gaps
```

**Test-block style** (12-HUMAN-UAT.md lines 15-33) — each test is a `### N. Title (REQ-IDS)` heading, one `expected:` paragraph describing the operator-observable outcome, and a `result: [pending]` line.

**Content to fold in (D-09):** the consolidated runbook MUST include UAT-01/02/03 PLUS the 5 deferred live-CI behaviors already enumerated in 12-HUMAN-UAT.md tests 1-5 (Issue-label→draft-PR, overfit soft-flag, 3-iteration exhaustion, D-06 idempotency, verifier-gate binding). For UAT-01/02 also include (D-06 guardrails): a documented **revert plan** for the `main` + golden-corpus mutation the live merge produces, and a **spend-confirmation step** (check monthly ledger headroom before the LLM call — see Shared Patterns below). Call out the D-07 distinction (one-time test fixture, NOT a revival of the retired synthetic machinery).

## Shared Patterns

### Errors-returned-not-thrown (optional-section contract, D-05 / Phase 55 D-15)
**Source:** `fetchAutoFixPrs` `weekly-digest.mjs:759-781` (return), `runDigest` `weekly-digest.mjs:478-483` (single stderr warning + degrade)
**Apply to:** the new bug-reports fetch helper and its `runDigest` wiring.
The fetch helper returns `{ data, fetchedAt, error }`; `runDigest` emits exactly ONE `process.stderr.write` and degrades the section to `n/a` rows. **Asymmetry to preserve:** the *core* findings path (`listOpenIssuesByLabel`, lines 306-342) THROWS — that silent-zero refusal stays as-is.

### Injected-deps seam for Vitest determinism (CONTEXT D-04)
**Source:** `fetchAutoFixPrs` `execFn ?? ((c,o)=>execSync(c,o))` (line 764); `runDigest` `opts.fetchAutoFixPrs ?? fetchAutoFixPrs` (line 434)
**Apply to:** the new fetch helper (accept `execFn`) and `runDigest` (accept `opts.fetchBugReports`). Production omits the arg; tests pass a fake.

### Label-membership counting (CR-01 discipline — never positional)
**Source:** `weekly-digest.mjs:584-587` (and 119-122, 188-191)
**Apply to:** every BUG_REPORTS count. `const names = (x?.labels ?? []).map((l) => l?.name).filter(Boolean);` then `names.includes('<label>')` — GH does not guarantee label array order, so never index `labels[0]`.

### `<details>` + fixed-order line-array render (D-04)
**Source:** `renderAutoFixPipelineSection` `weekly-digest.mjs:684-710`
**Apply to:** `renderBugReportsSection`. `<details>` / `<summary>` wrapper, `_fetched <iso>_` line, pinned `| Metric | Value |` table rows in a locked order, `</details>` close.

### NaN/Infinity degrade-to-`n/a` vs integer-0 (D-05)
**Source:** `weekly-digest.mjs:599-622` (ratio → `'n/a'`) vs `weekly-digest.mjs:679-682, 705` (count → integer `0`)
**Apply to:** ratio/derived metrics use `Number.isFinite(x) ? ... : 'n/a'` and treat a zero denominator as the literal `'n/a'`; pure count metrics keep integer `0`.

### Ledger cap-headroom check (UAT spend-confirmation guardrail, D-06)
**Source:** `weekly-digest.mjs:36-45, 225-240` — `readLedger`, `monthlyTotal`, `HARD_CAP_USD`, `LEDGER_PATH`, `combinedMonthlyTotalByTransport` from `tests/e2e/lib/llm-ledger.js`; the `renderCostLine` existence-then-total idiom (line 230 `fs.existsSync(effectivePath)` BEFORE `monthlyTotal`).
**Apply to:** the runbook's pre-LLM spend-confirmation step (UAT-01/02) and the in-session UAT-03 ledger-cap assertion. **GOTCHA (line 37-38, 219, 227-229):** `monthlyTotal` returns 0 for BOTH $0 spend and a missing ledger file — always `fs.existsSync(LEDGER_PATH)` FIRST; never set `E2E_LEDGER_PATH_OVERRIDE` (throws in CI per the YAML Y6 guard).

## No Analog Found

None. Every Phase-14 deliverable has a strong in-repo analog (the digest section is an in-file twin of the Auto-Fix section; the runbook mirrors 12-HUMAN-UAT.md).

## Metadata

**Analog search scope:** `scripts/weekly-digest.mjs`, `tests/e2e/scripts/e2e-weekly-digest*.test.js`, `scripts/{gh-client,report-fix,auto-fix,auto-fix-promote,ingest-reports}.mjs` (label grounding), `.github/workflows/v61-*.yml` (label grounding), `.planning/phases/12-*/12-HUMAN-UAT.md`
**Files scanned:** 4 read in full + grep across `scripts/` and `.github/workflows/` for label tokens
**Pattern extraction date:** 2026-06-18

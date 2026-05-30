---
phase: 37-weekly-analytics-digest
reviewed: 2026-05-28T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - scripts/weekly-digest.mjs
  - tests/e2e/scripts/e2e-weekly-digest.test.js
  - tests/e2e/scripts/e2e-weekly-digest-yaml.test.js
  - tests/e2e/fixtures/phase37-digest-issues.json
  - .github/workflows/e2e-weekly-digest.yml
  - tests/e2e/lib/llm-report.js
  - tests/unit/llm-report.test.js
  - package.json
  - tests/e2e/README.md
status: issues_found
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
fixed_count: 2
fixed:
  - CR-01
  - CR-02
deferred:
  - WR-01
  - WR-02
  - WR-03
  - WR-04
  - WR-05
  - WR-06
  - IN-01
  - IN-02
  - IN-03
  - IN-04
---

# Phase 37: Weekly Analytics Digest — Code Review Report

**Reviewed:** 2026-05-28
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 37 ships the weekly analytics digest CLI (`scripts/weekly-digest.mjs`), its mock-gh Vitest suite, a grep-based YAML contract test, the `e2e-weekly-digest.yml` workflow, and the `SUMMARY_KEYS` single-source extraction in `llm-report.js`. The `SUMMARY_KEYS` extraction (D-01) is clean and well-tested. The ISO-week helper, cost-vs-cap graceful degradation (D-15), `issues:write` permission gap-closure (D-09), `[skip ci]` idiom (D-11), and Monday cron (D-09) are all correct and verified.

However, the review found **two BLOCKER-class defects** that undermine the core aggregation contract:

1. **The classification breakdown and top-3 (D-03/D-16) are built from `issue.labels[0].name`, which assumes the GitHub REST API preserves label *creation order* on read-back. It does not** — the `/issues` endpoint returns labels in an unspecified (effectively id/alphabetical) order. In production, `labels[0]` will frequently be `e2e-nightly` or `triage`, not the category, silently corrupting the breakdown table and top-3. The hand-crafted fixture masks this by always placing the category first.
2. **The aggregation read path silently swallows all `gh` failures and returns `[]`**, so an auth error, rate-limit, or API outage produces a published digest reading "0 findings" — exactly the silent-zero failure mode that D-02/DIGEST-04 was written to prevent (the contract guard at `runDigest` step 2 validates a synthetic object, never the live issue data).

The remaining findings are robustness, determinism, and dead-code issues. The dormant discussion path (D-08) is implemented but its only "exercise" of the real GraphQL parse logic is via an injected mock that bypasses `makeRealGhClient` entirely, so the bash mock-gh's malformed GraphQL response shape (which does not match what the real parser expects) is never validated.

## Critical Issues

### CR-01: Category aggregation relies on GitHub label array ordering that the API does not guarantee

**File:** `scripts/weekly-digest.mjs:104-115`
**Issue:**
`aggregate()` derives every issue's category from `issue.labels?.[0]?.name`:

```js
const category = issue.labels?.[0]?.name ?? 'unknown';
```

The inline comment justifies this by citing the *creation* order used in `e2e-report-issue.mjs:504` (`[category, 'e2e-nightly', 'triage']`). But that is the order labels are *applied*, not the order the GitHub REST API returns them on read. The `GET /repos/{repo}/issues` response orders the `labels` array by label id / name, not by application order, and that order is explicitly undocumented/unstable. In production, `labels[0].name` will routinely be `e2e-nightly`, `e2e-quarantine`, or `triage` rather than the errorClass, so:

- the Classification Breakdown table tallies the wrong dimension (mostly counting `e2e-nightly`),
- Top-3 Failure Categories (D-16) becomes meaningless,
- the determinism the D-16 tie-break tries to guarantee is moot because the input key is wrong.

The fixture (`phase37-digest-issues.json`) hand-orders every issue with the category at index 0, so the test suite passes while the production path is broken. This is a correctness defect in the headline feature of the phase.

**Fix:** Do not trust label ordering. Match against the known closed taxonomy (the same `ERROR_CLASSES` list `e2e-report-issue.mjs` clamps to) and the structural labels:

```js
import { ERROR_CLASSES } from '../tests/e2e/lib/error-codes.js';
const STRUCTURAL = new Set(['e2e-nightly', 'e2e-quarantine', 'triage', 'e2e-digest']);
// ...
const names = (issue.labels ?? []).map((l) => l?.name).filter(Boolean);
const category =
  names.find((n) => ERROR_CLASSES.includes(n)) ??   // prefer a real errorClass label
  names.find((n) => !STRUCTURAL.has(n)) ??           // else first non-structural
  'unknown';
```

Add a fixture issue whose `labels` array is *shuffled* (category not at index 0) and assert the breakdown is still correct, so the test would catch this regression.

### CR-02: Aggregation read path silently swallows gh failures → publishes a "0 findings" silent-zero digest

**File:** `scripts/weekly-digest.mjs:215-227` (`listOpenIssuesByLabel`) and `runDigest:316-318`
**Issue:**
`listOpenIssuesByLabel` catches every error and returns `[]`:

```js
} catch (err) {
  console.warn(`[weekly-digest] listOpenIssuesByLabel(${label}) failed:`, err.message);
  return [];
}
```

`runDigest` then proceeds unconditionally — it renders, writes `reports/weekly-digest-*.md`, commits it, and files the issue with `findingsCount: 0`, an empty breakdown, and empty top-3. A transient `gh` auth failure, secondary rate-limit, or API outage therefore produces and *publishes* a digest that falsely reports zero findings.

The `SUMMARY_KEYS` validation at step 2 (`runDigest:324-325`) does NOT protect against this: it validates a synthetic `Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0]))` object — it never inspects the live issue data. So the descriptive-throw guarantee from D-02/DIGEST-04 ("never a silent zero") is real for *schema drift* but absent for the *data-fetch* failure that actually matters at runtime. The CONTEXT explicitly calls out "Read both label sets unconditionally (never short-circuit — Pitfall 3 / D-03)"; the code reads both, but cannot distinguish "0 issues this week" from "gh failed."

**Fix:** Make fetch failure distinguishable from an empty result, and fail loudly rather than publishing a misleading digest. For example return a sentinel / re-throw on hard failure:

```js
listOpenIssuesByLabel(label) {
  const raw = execSync(
    `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`weekly-digest: gh returned non-array for label '${label}'`);
  }
  return parsed;
}
```

If a soft-degrade is genuinely desired, the digest must annotate the body (e.g. "WARNING: issue fetch failed — counts may be incomplete") so a published "0 findings" is never silently trusted. Add a test that injects a throwing `listOpenIssuesByLabel` and asserts `runDigest` rejects (or annotates), not that it silently publishes zero.

## Warnings

### WR-01: `gh api ... -f labels=` form-encodes a body param on a GET — fragile and unverified against the real API

**File:** `scripts/weekly-digest.mjs:217-220`
**Issue:**
`gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`. `-f` adds *string body* params; gh promotes them to the query string only because `--method GET` has no body. This idiom is inherited from `e2e-report-issue.mjs:482`, but it has never been validated that the `labels` filter is actually being applied server-side (the REST `labels` filter is comma-separated AND-match). If gh ever sends these as a body on GET (or the server ignores them), the call returns *all* open issues and the per-label split silently collapses, compounding CR-01. Because the test uses a bash mock that ignores the flags entirely, there is zero coverage that the real filter works.

**Fix:** Prefer the documented query form `gh api "repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=open" --paginate`, or `gh issue list --label "${label}" --state open --json number,labels,createdAt --limit 1000` (already the idiom used by `listOpenWithSearch`). Add an integration assertion (even against a recorded fixture transcript) that the label filter token reaches the gh argv.

### WR-02: Quarantine-growth window uses `created_at` from issues only present if they are still OPEN

**File:** `scripts/weekly-digest.mjs:120-126`
**Issue:**
`quarantineGrowth` counts `quarantineIssues` (open, label-filtered) created within the prior 7 days. Because the source query is `state=open`, any quarantine issue opened *and closed* within the window is invisible, undercounting "quarantine growth." D-12 defines growth as "count of `e2e-quarantine` issues opened in the window" — opened, not opened-and-still-open. This is a semantic mismatch that will under-report during weeks with fast quarantine churn.

**Fix:** Either redefine the metric to "currently-open quarantine issues opened in window" (and document it as such in the render/README), or query with `state=all` for the growth computation specifically. At minimum, document the open-only constraint so the number is not misread.

### WR-03: `created_at` parsing has no validity guard — a malformed/absent timestamp silently drops or NaN-compares

**File:** `scripts/weekly-digest.mjs:123-125`
**Issue:**
```js
const createdAt = new Date(issue.created_at);
return createdAt >= windowStart && createdAt <= now;
```
If `issue.created_at` is missing or malformed, `new Date(undefined)` is `Invalid Date`; every comparison with it is `false`, so the issue is silently excluded from growth with no diagnostic. Given the real gh field is `created_at` (snake_case in REST, but `createdAt` in `gh issue list --json`), a future switch of fetch idiom (see WR-01) would silently zero this metric.

**Fix:** Guard the parse and warn on invalid timestamps:
```js
const t = Date.parse(issue.created_at);
if (Number.isNaN(t)) { console.warn(`[weekly-digest] issue #${issue.number} has invalid created_at`); return false; }
const createdAt = new Date(t);
```

### WR-04: Dormant GraphQL discussion path never exercises its real parse logic — only an injected mock is tested

**File:** `scripts/weekly-digest.mjs:255-291`; test `tests/e2e/scripts/e2e-weekly-digest.test.js:345-380`
**Issue:**
D-08 requires the dormant `createDiscussion` path be "fully implemented + tested." But the only test for `publishMode: 'discussion'` injects a hand-written `mockGhClient.createDiscussion` that just logs and returns a URL — it never calls `makeRealGhClient().createDiscussion`. Meanwhile the bash mock-gh shim (lines 99-100) returns a GraphQL shape with `createDiscussion` nested *under* `repository` (`{"data":{"repository":{...,"createDiscussion":{...}}}}`), whereas the real parser at line 289-290 reads `result.data.createDiscussion.discussion.url` (top-level). These two shapes are inconsistent, and nothing tests the real two-step lookup→mutation→parse. The category-not-found throw (lines 271-276) is also untested. So the "tested" claim for the dormant path is overstated; a real bug in the GraphQL response handling would ship undetected.

**Fix:** Add a unit test that drives `makeRealGhClient(repo).createDiscussion(title, body)` with the gh executable shimmed to a fixture that returns the *real* GraphQL response shape, asserting (a) the returned URL is parsed from `data.createDiscussion.discussion.url`, and (b) a missing category id throws the descriptive error. Fix the bash mock to emit the actual two-call shapes.

### WR-05: `createDigestIssue` does not capture / dedup — every run files a brand-new issue

**File:** `scripts/weekly-digest.mjs:241-248`, `runDigest:347-354`
**Issue:**
Unlike `e2e-report-issue.mjs` (which dedups via fingerprint markers and `isRecentlyUpdated`), `createDigestIssue` unconditionally `gh issue create`s. A manual `workflow_dispatch` re-run (or the Monday cron firing twice) for the same ISO week produces *duplicate* `[e2e-digest] Weekly analytics 2026-Www` issues. D-11 makes the *committed file* idempotent (overwrite), but the *published issue* is not idempotent. The title is fully deterministic per week, so duplicates are easy to detect and avoid.

**Fix:** Before creating, search for an existing open `e2e-digest` issue with the same `[e2e-digest] Weekly analytics ${weekLabel}` title (or a hidden `<!-- digest-week: ${weekLabel} -->` marker) and comment/skip instead of re-creating, mirroring the `findMatchingIssue` + `isRecentlyUpdated` pattern already in the codebase.

### WR-06: `--paginate` + `console.warn` to stderr is the only failure signal, and the publish return value is discarded

**File:** `scripts/weekly-digest.mjs:349-356`
**Issue:**
`createDiscussion`/`createDigestIssue` both return a URL, but `runDigest` discards it (`ghClient.createDiscussion(title, md);` — return value unused). The orchestrator returns `{ weekLabel, reportPath, mode }` with no published URL and no success confirmation. Combined with CR-02, a partial failure (e.g. issue create 403s but execSync output is empty rather than throwing) is invisible to the caller and to the workflow step, which will report success. The workflow has no assertion that publishing happened.

**Fix:** Capture and return the published URL; have `runDigest` throw if the URL is empty/unparseable, and log it so the workflow log shows where the digest landed.

## Info

### IN-01: GraphQL title still string-interpolated into the shell despite the "all dynamic values via -F bindings" comment

**File:** `scripts/weekly-digest.mjs:286`
**Issue:** The comment at lines 252-254 and 284 asserts all dynamic values are passed via `-F`/`-f` bindings to prevent GraphQL/shell injection (T-37-02-04). But the title is interpolated into a double-quoted shell fragment: `-F t="${title.replaceAll('"', '\\"')}"`. The title is internally controlled (`[e2e-digest] Weekly analytics ${isoWeekLabel(now)}`, numeric week), so there is no live injection vector today, and `-F t=` does pass it as a GraphQL variable (not concatenated into the query). But the escaping (`"`→`\"` only) would not survive a future change that put untrusted text in the title — backticks, `$()`, and `\` are unescaped. This is below WARNING because the input is currently closed.
**Fix:** Pass the title via stdin or a temp file like the body (`-F t=@titlefile` or build the args array with `spawnSync` and no shell), and update the comment so it does not overstate the current guarantee.

### IN-02: `now` dependency accepts both a function and a Date, handled ad-hoc

**File:** `scripts/weekly-digest.mjs:313, 328`
**Issue:** `runDigest` sets `now = opts.now ?? (() => new Date())` then later normalizes `const nowDate = typeof now === 'function' ? now() : now;`. The test passes `now: PIN_NOW` (a function) in some places. The dual-type handling is a minor smell that invites confusion (the JSDoc says `now?: () => Date`). Pick one contract.
**Fix:** Require `now` to always be a `() => Date` thunk (matching the JSDoc) and drop the `typeof` branch, or always accept a `Date`. Be consistent.

### IN-03: `readLedger` imported but the comment-claimed `LEDGER_PATH` default is shadowed by `opts.ledgerPath ?? LEDGER_PATH` twice

**File:** `scripts/weekly-digest.mjs:311, 332, 139-140`
**Issue:** `runDigest` computes `ledgerPath = opts.ledgerPath ?? LEDGER_PATH` (line 311) and then calls `renderCostLine({ ledgerPath })`, which *again* applies `ledgerPath ?? LEDGER_PATH` (line 140). Harmless duplication, but it means two places own the default. Not a bug; minor.
**Fix:** Let `renderCostLine` own the default and pass `opts.ledgerPath` straight through, or vice-versa.

### IN-04: Magic line-count `50` and category limit `3` are inline literals

**File:** `scripts/weekly-digest.mjs:118, 200`
**Issue:** The ≤50-line budget (D-04) and top-3 slice (D-16) are bare literals (`> 50`, `.slice(0, 3)`). These are spec-locked constants that appear in error messages and tests; defining them as named constants (`const MAX_DIGEST_LINES = 50; const TOP_N = 3;`) documents intent and keeps the render and guard in sync.
**Fix:** Extract to named module constants.

## Verification Outcomes

| # | Invariant | Outcome | Evidence |
|---|-----------|---------|----------|
| 1 | D-01: `SUMMARY_KEYS` frozen + exported; `emptySummary()` rebuilt from it; output unchanged | PASS | `llm-report.js:123-135` freezes + exports; `emptySummary` uses `Object.fromEntries(SUMMARY_KEYS...)`; unit Tests A/B/C + Test 2 lock key set/order/zero values |
| 2 | D-02/DIGEST-04: missing SUMMARY_KEY → descriptive throw (not silent zero) | PASS (schema), FAIL (data) | `validateSummaryKeys` throws naming key (lines 71-80); covered by tests. BUT it validates a synthetic object, never live issue data — see **CR-02** |
| 3 | D-04: rendered digest ≤50 lines (line-count guard); aggregated only | PASS | `renderDigest:199-204` throws >50; no per-iteration list; test asserts ≤50 |
| 4 | D-06: both publish branches (issue active + dormant graphql createDiscussion) implemented + tested | PARTIAL | Both branches dispatched + covered via injected mock. Real GraphQL parse/lookup never exercised; mock shape inconsistent with parser — see **WR-04** |
| 5 | D-15: cost-vs-cap reads ledger via `fs.existsSync` FIRST → "cost data unavailable" if absent; never sets `E2E_LEDGER_PATH_OVERRIDE` | PASS | `renderCostLine:144` existsSync before `monthlyTotal`; tested both ways; only one `E2E_LEDGER_PATH_OVERRIDE` occurrence (comment); YAML Y6 asserts absence |
| 6 | ISO-week boundary: 2027-01-01 → 2026-W53 (Thursday-shift); fixture present | PASS | `isoWeekLabel:51-63`; tests at lines 128-139 cover 2026-W01, 2026-W53, 2026-W22 |
| 7 | `issues:write` in YAML (D-09 gap closure); contents:write + discussions:write also present | PASS | `e2e-weekly-digest.yml:32-37`; YAML test Y2 asserts all three |
| 8 | commit-in-run `[skip ci]` idiom (avoids re-triggering ci.yml) | PASS | YAML line 109 `... [skip ci]`; test Y5 asserts token |
| 9 | Monday cron `0 7 * * 1` | PASS | YAML line 23; test Y1 |
| 10 | dedup findings by issue.number across 2 labels; quarantine growth = quarantine-only | PASS (mechanism) | `aggregate:93-99` dedups by `.number`; growth computed on `quarantineIssues` subset; tests 6 + 7 confirm |
| 11 | top-3 failure categories from errorClass labels, ties alphabetical (determinism) | FAIL | Sort/tie-break is correct (`:113-118`), but the *input key* `labels[0].name` is wrong in production — see **CR-01** |
| 12 | SECURITY: gh shellout escaping; no command injection via titles/labels/issues read back | PASS (current inputs) | Title internally controlled; body via `--body-file -`/`-F b=@-`; labels hardcoded `e2e-digest`. Escaping is `"`-only and overstated by comment — see **IN-01** |
| 13 | lint allowlist includes `weekly-digest.mjs` | PASS | `package.json:20` lint script lists `scripts/weekly-digest.mjs` |

**Additional CONTEXT.md (D-NN) checks:** D-03 read-both-unconditional — mechanism PASS but degrades silently (**CR-02**); D-07 label self-bootstrap — PASS (YAML 66-75, Y3); D-10/D-11 filename + commit-in-run idempotence — PASS for the file, but the *published issue* is not idempotent (**WR-05**); D-12 7-day window — PARTIAL, open-only undercount (**WR-02/WR-03**); D-13 injected-deps + `isMain` guard — PASS; D-16 tie-break determinism — undermined by CR-01.

---

## Fixes Applied (2026-05-28)

Both CRITICAL findings fixed and committed atomically on `main`. Post-fix gate
`npm run test:src && npm run lint` exits 0 (678 tests pass; lint 0 errors).

| Finding | Status | Commit | Notes |
|---------|--------|--------|-------|
| CR-01 | fixed | `4cac665` | Category now resolved by `ERROR_CLASSES` membership (O(1) Set lookup), not `labels[0]`; falls back to `UNCLASSIFIED`. Fixture migrated to real uppercase `ERROR_CLASSES` labels + a shuffled-label issue (#103, category at index 2). New regression test (`CR-01: category resolved by ERROR_CLASSES membership`) attributes #103 to `WRONG_CITATION` and would fail under the old `labels[0]` logic. |
| CR-02 | fixed | `16dedf3` | `listOpenIssuesByLabel` now THROWS on hard fetch failure (non-zero gh exit, unparseable JSON, non-array payload) instead of returning `[]`. `runDigest` aborts before write/commit/file so the workflow fails loudly. A legitimate empty result (gh exits 0, returns `[]`) still publishes a real "0 findings" digest. New tests cover the throwing-client path (no digest written / no issue filed), the real-client non-zero-exit path (child process exits non-zero, no report file), and the legitimate-empty path. |

### Deferred to verify-work

Per the fix scope, the following are intentionally deferred (not fixed in this pass):

- **WR-01** — `gh api ... -f labels=` GET form-encoding fragility / unverified label filter.
- **WR-02** — quarantine-growth window only counts still-open issues (`state=open`), undercounting fast churn.
- **WR-03** — `created_at` parse has no validity guard (Invalid Date silently drops).
- **WR-04** — dormant GraphQL discussion path only exercised via injected mock; real parse/lookup untested; bash mock shape inconsistent with parser.
- **WR-05** — `createDigestIssue` does not dedup; a `workflow_dispatch` re-run files a duplicate `[e2e-digest]` issue for the same ISO week. (Budget-deferred from this fix pass.)
- **WR-06** — published URL discarded; partial publish failure invisible to caller/workflow.
- **IN-01..IN-04** — GraphQL title shell-interpolation escaping, `now` dual-type handling, duplicated `LEDGER_PATH` default, magic literals (`50`, `3`).

---

_Reviewed: 2026-05-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Fixes applied: 2026-05-28 (CR-01, CR-02); WR-01..06 + IN-01..04 deferred to verify-work._

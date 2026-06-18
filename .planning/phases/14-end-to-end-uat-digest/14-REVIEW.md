---
phase: 14-end-to-end-uat-digest
reviewed: 2026-06-18T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/weekly-digest.mjs
  - tests/e2e/scripts/e2e-weekly-digest.test.js
  - tests/e2e/scripts/e2e-weekly-digest-yaml.test.js
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: resolved
resolved: 2026-06-18T00:00:00Z
resolution_commits:
  - 0f14722
  - ea4da7d
---

# Phase 14: Code Review Report

**Reviewed:** 2026-06-18
**Depth:** standard
**Files Reviewed:** 3
**Status:** resolved (fixes applied in 0f14722 + ea4da7d)

## Resolution (2026-06-18)

All findings fixed under the operator-chosen "shared root cause" scope:
- **CR-01** — both `fetchAutoFixPrs` and `fetchBugReportIssues` switched from the
  invalid `gh search prs --json mergedAt` to `gh pr list --state all --json …mergedAt…`
  (`gh pr list` emits `mergedAt`; `gh search prs` does not). Renderer merge-detection
  unchanged. A field-contract test now asserts `gh pr list`/`--state all`/`mergedAt`
  present and `gh search prs` absent. `grep "gh search prs"` → 0.
- **WR-01/IN-01** — `report_volume`/`promoted` now windowed to `created_at` within 7
  days of `now` (keyed snake_case, as `gh api` emits); windowing test added.
- **WR-02** — `repo` threaded into `fetchBugReportIssues`; `repos/${repo}/issues`
  interpolated; `runDigest` passes the resolved repo.
- **IN-02** — Issue-only counts now skip entries carrying a `pull_request` property.
- **WR-04** — injection test rewritten as a real structural assertion; malformed
  line-774 fixture repaired.
- **WR-03** (duplicate gh fetch) — intentionally left as-is (out of the chosen scope;
  quality-only, not correctness).

Verified: `gh pr list --json mergedAt` exits 0; `npx vitest run` on both digest files
→ 53 passed; `npm test` → exit 0, golden corpus 100%.

## Summary

Phase 14 added `renderBugReportsSection` (pure renderer) and `fetchBugReportIssues`
(injected-deps fetch helper) to `scripts/weekly-digest.mjs`, plus a Bug Reports
section wired into `runDigest`, mirroring the existing auto-fix-pipeline pattern.

The injected-deps seam, the errors-RETURNED-not-thrown contract, the
label-membership counting (CR-01 discipline), and the degrade-to-`n/a`-while-still-shipping
path are all implemented correctly and well-tested. The injection concern is a
non-issue: the renderer never reads `.title` or `.body`, so untrusted GitHub text
is never echoed into the digest.

However, the new fetch helper copied a **broken `gh search prs` command** verbatim
and the new renderer depends on a `mergedAt` field that `gh search prs` does not
emit. The net effect is that the entire PR half of the Bug Reports section
(`open_auto_fix_prs`, `merged_fix_prs`, `human_review_required`, `promotion_rate`)
silently degrades every single week in production — and the tests cannot catch it
because they only exercise injected fakes, never the real command. This is the
BLOCKER below.

## Critical Issues

### CR-01: `fetchBugReportIssues` ships a `gh search prs` command that always fails, plus a `mergedAt` field that does not exist on search results

**File:** `scripts/weekly-digest.mjs:932-934` (command) and `scripts/weekly-digest.mjs:835-845` (consumer)

**Issue:** The new `fetchBugReportIssues` PR fetch uses:

```
gh search prs --label auto-fix:verified --label auto-fix:partial-verified
  --json number,state,mergedAt,createdAt,labels,body --limit 100
```

`gh search prs --json` does **not** support a `mergedAt` field. The valid field
set is `assignees, author, authorAssociation, body, closedAt, commentsCount,
createdAt, id, isDraft, isLocked, isPullRequest, labels, number, repository,
state, title, updatedAt, url`. Running this command against real `gh` exits
non-zero with:

```
Unknown JSON field: "mergedAt"
```

(Reproduced live: the local test run printed
`weekly-digest: bug-reports section degraded — Command failed: gh search prs ... Unknown JSON field: "mergedAt"`.)

Consequence chain:
1. The PR fetch always throws → `fetchBugReportIssues` returns `{ prs: [], error: <msg> }`.
2. `runDigest` (line 507) writes ONE stderr warning and proceeds with `prs: []`.
3. `renderBugReportsSection` then renders `open_auto_fix_prs=0`, `merged_fix_prs=0`,
   `human_review_required=0`, and `promotion_rate=n/a` **every week**, regardless
   of actual pipeline activity. The Bug Reports section is permanently half-dead.

Even if the field list is corrected, the section is still broken because the
renderer derives merge state exclusively from `p?.mergedAt` (lines 836, 844),
a field `gh search prs` never returns. With `mergedAt` always `undefined`:
- `open_auto_fix_prs` (line 835-837) counts **every** fetched PR as "open"
  (because `mergedAt === undefined` is truthy for the filter).
- `merged_fix_prs` (line 841-845) is **always 0** (requires `mergedAt !== undefined`).
- `promotion_rate` (line 859-866) is therefore always `0.0%` or `n/a`.

The tests do not catch this: every test injects a fake `execFn`/`fetchBugReports`
that returns hand-authored objects carrying a `mergedAt` field
(e.g. test lines 681, 691, 833-834), so the real command shape and the real
`gh search prs` data shape are never exercised.

**Fix:** Use the merge filter and an emitted field instead of the non-existent
`mergedAt`. For example, fetch only merged PRs in a dedicated query, or derive
merge state from `state` + `closedAt`:

```js
// fetch valid fields only — drop mergedAt
const prsCmd =
  'gh search prs --label auto-fix:verified --label auto-fix:partial-verified ' +
  '--merged --json number,state,closedAt,createdAt,labels,body --limit 100';
```

and in the renderer derive merge state from emitted fields, e.g.:

```js
const isMerged = (p) => p?.state === 'MERGED' || p?.state === 'merged';
const openPrs = prs.filter((p) => !isMerged(p)).length;
const mergedFixPrs = prs.filter((p) => {
  const names = (p?.labels ?? []).map((l) => l?.name).filter(Boolean);
  return (names.includes('auto-fix:verified') || names.includes('auto-fix:partial-verified'))
    && isMerged(p);
}).length;
```

Then add a test that drives `fetchBugReportIssues` with an `execFn` returning a
payload shaped exactly like real `gh search prs` output (no `mergedAt`), or a
gated live-`gh` smoke test, so the command/field contract is actually validated.

(Note: the pre-existing `fetchAutoFixPrs` carries the identical broken command and
is out of scope as "context," but the new code re-introduced the same defect — it
is a new, shippable bug in the Phase 14 surface.)

## Warnings

### WR-01: Bug Reports section claims a 7-day window in comments but applies none — `report_volume`/`promoted` are unbounded lifetime totals

**File:** `scripts/weekly-digest.mjs:828` and `scripts/weekly-digest.mjs:911-914`

**Issue:** The fetch uses `-f state=all --paginate` with **no** date bound, and the
renderer's `reportVolume`/`promoted` filters (lines 823-831) apply **no** `createdAt`
window. Yet the code comments assert a window: line 828 says
"report-fix-candidate Issues (open+closed **window**)" and the 14-01 plan
must_have says "report volume = count of report-fix-candidate Issues (open+closed
**in window**)". The existing `aggregate()` quarantine-growth metric DOES window
(line 134), establishing that "weekly digest" metrics are expected to be windowed.

As written, `report_volume` and `promoted` are cumulative lifetime counts that
only ever grow, presented inside a digest titled "Weekly". `promotion_rate`
(merged-this-period / all-reports-ever) becomes meaningless over time. The comment
asserting a window that the code does not implement is a correctness/trust defect.

**Fix:** Either (a) filter the issue set by `created_at`/`createdAt` within the prior
7 days using the injected `now`, mirroring `aggregate()` lines 134-138, or
(b) if a lifetime cumulative count is genuinely intended, remove the "window"
wording from lines 828 and the metric comments so the code and its contract agree.
Decide deliberately and align comment + code.

### WR-02: `fetchBugReportIssues` uses the literal `{owner}/{repo}` placeholder instead of the resolved repo, diverging from the plan and from the sibling client

**File:** `scripts/weekly-digest.mjs:912-914`

**Issue:** The issue fetch hardcodes
`gh api repos/{owner}/{repo}/issues ...`. Everywhere else in this file the repo is
explicitly interpolated from the resolved `repo` value
(`makeRealGhClient`, line 317: `gh api repos/${repo}/issues`). The 14-01 plan
explicitly directed reuse of "the `gh api repos/${repo}/issues ... -f state=all`
command shape from line 317". `fetchBugReportIssues` does not receive `repo` as a
parameter, so it cannot interpolate it and silently fell back to the
`{owner}/{repo}` placeholder, which relies on `gh` resolving owner/repo from the
local git remote. This works in the CI workflow (post-`actions/checkout`) but
breaks any caller that runs outside a checked-out repo or with `GH_REPO`/
`GITHUB_REPOSITORY` pointing elsewhere — exactly the indirection the rest of the
module avoids by threading `repo` explicitly.

**Fix:** Thread `repo` into `fetchBugReportIssues` (and from `runDigest`, which
already resolves `repo`) and interpolate it as the sibling client does:

```js
export function fetchBugReportIssues({ now, execFn, repo } = {}) {
  ...
  const issuesCmd =
    `gh api repos/${repo}/issues --method GET ` +
    '-f labels=report-fix-candidate -f state=all --paginate';
```

and pass `repo` at the call site (line 506): `fetchBugReportsImpl({ now: nowDate, repo })`.

### WR-03: `runDigest` issues two independent, identical `gh search prs` calls

**File:** `scripts/weekly-digest.mjs:480` and `scripts/weekly-digest.mjs:506`

**Issue:** `fetchAutoFixPrsImpl({ now })` (line 480) and `fetchBugReportsImpl({ now })`
(line 506) each independently run the same `gh search prs --label auto-fix:verified
--label auto-fix:partial-verified ...` command. This duplicates the PR fetch, gives
the two sections two independent (and potentially divergent) degrade paths for the
same underlying data, and means a transient `gh` failure can leave the auto-fix
section populated while the bug-reports section is empty (or vice versa) within a
single digest run. The 14-01 plan flagged this as discretionary ("reuse the
already-fetched PR set OR a sibling gh search prs ... single-source any shared
number"), but the duplicate path was chosen and the shared PR data is now sourced
from two calls.

**Fix:** Fetch the PR set once in `runDigest` and pass `prs` into both
`renderAutoFixPipelineSection` and `renderBugReportsSection`, so a single fetch
result (and a single degrade decision) feeds both sections consistently.

### WR-04: Test "injection guard" asserts on raw substrings that the renderer can never emit — it does not actually guard against injection

**File:** `tests/e2e/scripts/e2e-weekly-digest.test.js:757-781`

**Issue:** The test "does NOT echo untrusted Issue/PR titles or bodies" asserts
`expect(md).not.toContain('INJECTION')` etc. But `renderBugReportsSection` never
reads `.title` or `.body` at all — it only counts labels and merge state. The
assertion passes trivially and would continue to pass even if a future change
started echoing a *different* untrusted field (e.g. a label name, which IS rendered
indirectly via counts, or a future `title` column). The test gives false confidence
that an injection guard exists in the code when the safety actually comes from the
renderer simply not touching free-text fields. Note also the malformed fixture at
line 774 (`'<!-- source_issue: 204 --> **INJECTION** ` + "`rm -rf /`" + `'`) — this
string-concatenation inside a single-quoted literal does not produce the intended
content and is dead noise.

**Fix:** Either (a) document this as a "renderer reads no free-text fields"
structural test and assert that explicitly (e.g. snapshot the full output and pin
that no PR/issue title/body string appears), or (b) if titles/bodies are ever to be
rendered, add real escaping and test the escaped output. Remove or repair the
malformed line-774 fixture string.

## Info

### IN-01: `aggregate()` reads `issue.created_at` (snake_case) but Phase 14 fixtures/tests use `createdAt` (camelCase)

**File:** `scripts/weekly-digest.mjs:136` vs `tests/e2e/scripts/e2e-weekly-digest.test.js:670,676,868`

**Issue:** The pre-existing `aggregate()` quarantine-growth window keys on
`issue.created_at` (REST API snake_case). The new Phase 14 tests and fixtures
author issues/PRs with `createdAt` (search API camelCase) — e.g. lines 670, 676,
868. These two field names coexist in the same module's data flow (`gh api` returns
`created_at`; `gh search` returns `createdAt`), which is an easy future-bug trap:
any code that windows the bug-reports issues (see WR-01) must use `created_at`
because `fetchBugReportIssues` sources issues via `gh api` (snake_case), even though
the surrounding tests use `createdAt`. Worth a normalizing comment or helper.

**Fix:** Add a short comment near the issue-windowing logic noting that
`gh api .../issues` emits `created_at` (snake_case) while `gh search prs` emits
`createdAt` (camelCase), and normalize to one accessor before any date math.

### IN-02: `gh api .../issues` returns pull requests too; `report_volume` relies on PRs never carrying `report-fix-candidate`

**File:** `scripts/weekly-digest.mjs:911-914`, consumed at `scripts/weekly-digest.mjs:823-826`

**Issue:** GitHub's REST `GET /issues` endpoint includes pull requests in its
results. `report_volume`/`promoted` count `report-fix-candidate`-labeled entries
from that mixed stream. Today this is correct because `report-fix-candidate` is
applied only to Issues (`scripts/ingest-reports.mjs:296`,
`scripts/gh-client.mjs`), so no PR carries it. This is a latent coupling: if that
label is ever applied to a PR, it would be double-counted (once here as a "report",
again in the PR metrics).

**Fix:** Defensively filter out pull requests when counting Issue-only metrics,
e.g. skip entries with a `pull_request` property:
`issueList.filter((i) => !i?.pull_request && names.includes('report-fix-candidate'))`.

---

_Reviewed: 2026-06-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

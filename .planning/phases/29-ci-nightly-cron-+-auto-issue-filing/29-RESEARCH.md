# Phase 29: CI Nightly Cron + Auto-Issue Filing — Research

**Researched:** 2026-05-15
**Domain:** GitHub Actions workflow authoring, gh CLI scripting, Playwright Chromium CI, fingerprint-based dedup
**Confidence:** HIGH (most decisions locked in CONTEXT.md; research focused on implementation nuances)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Workflow path:** `.github/workflows/e2e-nightly.yml` (new file; separate from `ci.yml`)
- **Triggers:** `schedule: '0 6 * * *'` + `workflow_dispatch`
- **Permissions:** `contents: read`, `issues: write` (minimum needed)
- **Timeout:** 30 minutes job-level
- **Runs on:** `ubuntu-latest`
- **Concurrency:** `group: e2e-nightly-${{ github.event.schedule || github.event_name }}, cancel-in-progress: false`
- **Playwright cache:** `actions/cache@v4`, key `pw-${{ runner.os }}-${{ hashFiles('package.json') }}`, path `~/.cache/ms-playwright`; conditional install only on cache miss; skip `--with-deps`
- **Rotating sample:** Sunday = full 76 cases; Mon-Sat = 30-case subset via `(weekOfYear + dayOfWeek) mod 76` in `scripts/select-cron-cases.mjs`; output is a comma-separated case-id list consumed by `--grep`
- **Pre-flight smoke:** 1-case probe on `US11427642-spec-short-1`; on smoke fail → ONE meta-issue ("Google Patents drift suspected") + exit code 78 (skipped)
- **Fingerprint:** `sha256(\`${caseId}|${errorClass}|${topOfStackHash || ''}\`).substring(0, 12)`; topOfStackHash = sha256 of first non-test stack frame `file:line:col`
- **Dedup query:** `gh api repos/${OWNER}/${REPO}/issues?labels=e2e-nightly&state=open`; grep body for `<!-- fingerprint: ... -->`; ≤7-day-old match → comment; else → create new issue
- **Issue label:** `e2e-nightly`
- **Report reader:** `scripts/e2e-report-issue.mjs` reads `tests/e2e/artifacts/{run-id}/report.json`; files for cases where `status === 'failed'` OR `errorClass !== null && errorClass !== 'FLAKE'`
- **Artifact upload:** `actions/upload-artifact@v4`, name `e2e-nightly-${{ github.run_id }}`, path `tests/e2e/artifacts/`, retention 14 days, `if: failure()`
- **Env vars in workflow:** `PLAYWRIGHT_RUN_ID=${{ github.run_id }}`, `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
- **channel: 'chromium'** — already set in Phase 26's extension-loader.js; no xvfb-run needed; default headless works in CI
- **Phase 28 integration:** Phase 29 reads report.json as-is; no re-classification
- **Workflow exits success after issue filing** — the issue IS the signal

### Claude's Discretion

- Exact `actions/cache@v4` cache key format details (version pinning style)
- Whether to use composite action vs inline steps
- Reporter script's exact stack-hash algorithm
- Whether to emit a daily summary issue vs only-on-failure issues (recommend only-on-failure)
- Issue title format (recommend `[e2e-nightly] {caseId}: {errorClass}`)

### Deferred Ideas (OUT OF SCOPE)

- Worker fault-injection — Phase 30
- LLM exploratory mode — Phase 31
- Daily summary digest — v3.1+
- Auto-close issue when next run is green — v3.1+
- Slack notification — v3.1+
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CRON-01 | New GHA workflow `e2e-nightly.yml` on `cron: '0 6 * * *'` + `workflow_dispatch` | Confirmed: `schedule` + `workflow_dispatch` is a standard GHA dual-trigger pattern; inputs only apply to manual runs |
| CRON-02 | Rotating 30-patent sample Mon-Sat; full 76 on Sunday; deterministic per-day | Confirmed: `(weekOfYear + dayOfWeek) mod 76` is collision-free; Node.js built-in `Date` methods, no external deps |
| CRON-03 | Playwright Chromium in CI without `xvfb-run`; upload artifacts on failure | Confirmed: `channel: 'chromium'` enables headless extension testing since Playwright 1.49; extension-loader.js already set |
| CRON-04 | `scripts/e2e-report-issue.mjs` opens or comments on GitHub issue with failing case info | Confirmed: `gh issue create` + `gh issue comment` work in non-TTY CI; `gh api` returns JSON for dedup query |
| CRON-05 | Fingerprint-based dedup; same root cause = one issue + comments, not multiple issues | Confirmed: sha256 via `node:crypto` (no deps); hidden HTML comment in issue body for grep-based search |
</phase_requirements>

---

## Summary

Phase 29 operationalizes the E2E pipeline built in Phases 26-28. The primary deliverables are two new files: `.github/workflows/e2e-nightly.yml` (GitHub Actions workflow) and `scripts/e2e-report-issue.mjs` (the Node.js issue filer), plus a helper `scripts/select-cron-cases.mjs` for rotating sample selection.

The CONTEXT.md has pre-locked almost every major decision. Research focused on four nuanced areas: (a) GitHub Actions-specific mechanics (cache correctness, `gh` CLI behavior in non-TTY, artifact limits, cron timing guarantees), (b) the fingerprint dedup implementation details, (c) the rotating-sample selection algorithm's edge cases around corpus size and dayOfWeek, and (d) testability — how to exercise each CRON requirement without needing a real nightly cron run.

**Primary recommendation:** Build the workflow and scripts as locked; add unit tests for `fingerprint()` and `selectCronCases()` as pure functions (no network, no gh CLI) — these are the only parts of Phase 29 that can be verified without real browser runs or real issue-tracker access.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `actions/checkout@v4` | v4 | Checkout repo in CI | [VERIFIED: ci.yml already uses v4] |
| `actions/setup-node@v4` | v4 | Install Node.js 22 | [VERIFIED: ci.yml already uses v4] |
| `actions/cache@v4` | v4 | Cache `~/.cache/ms-playwright` | [VERIFIED: CONTEXT.md, v4 is current stable] |
| `actions/upload-artifact@v4` | v4 | Upload E2E artifacts on failure | [VERIFIED: ci.yml already uses v4] |
| `gh` CLI | pre-installed on `ubuntu-latest` | Issue create/comment/api queries | [VERIFIED: gh 2.83.1 available locally; ubuntu-latest runners include gh CLI] |
| `node:crypto` | built-in | sha256 fingerprint computation | [VERIFIED: Node.js built-in, no install needed; Node 22 on runner] |

### Not Used (by design)

| Pattern | Why Not |
|---------|---------|
| `microsoft/playwright-github-action` | Adds unnecessary wrapper; project calls `npx playwright test` directly, matching the existing `e2e:regression` npm script pattern [ASSUMED: simpler inline steps match the ci.yml pattern already established] |
| `xvfb-run` wrapper | `channel: 'chromium'` enables headless extension mode since Playwright 1.49 — no virtual display needed [CITED: playwright.dev/docs/chrome-extensions] |
| External fingerprint library | Node.js `createHash('sha256').update(str).digest('hex').substring(0, 12)` is sufficient [VERIFIED: Node.js crypto module] |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
.github/
└── workflows/
    └── e2e-nightly.yml         # NEW — Phase 29 deliverable

scripts/
├── select-cron-cases.mjs       # NEW — rotation algorithm; pure function
└── e2e-report-issue.mjs        # NEW — reads report.json, calls gh CLI
```

### Pattern 1: Dual-Trigger Workflow with Cron-Aware Inputs

**What:** A workflow with both `schedule` and `workflow_dispatch` triggers. Cron runs get no inputs (inputs are `undefined`/`null` for scheduled triggers). Manual runs can pass override parameters.

**When to use:** CRON-01 requires both; also allows manual testing of the nightly path via GitHub UI.

**Key nuance:** `workflow_dispatch.inputs` defaults are NOT passed to scheduled runs. To support a manual `force_full` flag that has no effect on cron runs, use:

```yaml
# Source: docs.github.com/en/actions/using-workflows/events-that-trigger-workflows
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      force_full_suite:
        description: 'Run all 76 cases regardless of day-of-week'
        type: boolean
        default: false

jobs:
  e2e-nightly:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      issues: write
    concurrency:
      group: e2e-nightly-${{ github.event.schedule || github.event_name }}
      cancel-in-progress: false
    env:
      PLAYWRIGHT_RUN_ID: ${{ github.run_id }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`${{ inputs.force_full_suite || false }}` evaluates to `false` on cron runs (inputs are undefined). [VERIFIED: confirmed with github.com/orgs/community/discussions/137750 pattern]

### Pattern 2: Conditional Playwright Chromium Install

**What:** Cache `~/.cache/ms-playwright` keyed on `package.json` hash. On cache miss, install Chromium only (no `--with-deps` per CONTEXT.md decision).

**Critical nuance:** Official Playwright docs say caching is NOT recommended ("cache restore time ≈ download time"). However, CONTEXT.md has locked this decision. The cache key on `package.json` (not `package-lock.json`) is correct — Playwright's binary version is declared directly in `package.json`'s devDependencies, so any Playwright version bump invalidates the cache correctly. [CITED: playwright.dev/docs/ci]

```yaml
# Source: CONTEXT.md locked decision + playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/
- name: Cache Playwright Chromium
  id: playwright-cache
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: pw-${{ runner.os }}-${{ hashFiles('package.json') }}

- name: Install Playwright Chromium
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install chromium
  # No --with-deps: CONTEXT.md decision; ubuntu-latest has Chromium system deps preinstalled
```

**On cache hit:** `playwright install` is skipped entirely. The cached binaries at `~/.cache/ms-playwright/chromium-1223/` (or current version) are used directly. [VERIFIED: cache path confirmed locally — `chromium-1223` present]

### Pattern 3: Day-of-Week Rotation Algorithm

**What:** `scripts/select-cron-cases.mjs` — pure function that selects a deterministic 30-case subset from the live corpus, OR returns all cases on Sunday.

**Key nuances:**
1. The CONTEXT.md rotation is `(weekOfYear + dayOfWeek) mod 76`. This rotates over the 76-case *array index space*, not the 67-case *live-runnable space* (76 total − 9 TIMEOUT_PILL_DEFERRED − 1 synthetic + 1 re-enabled US11427642-claims-1 = 67 live). The rotation should operate on `TEST_CASES` indices and then filter by `isLiveCase(tc)` after selection, OR the modulus should be 67. This is a planning decision: recommend the simpler approach of selecting 30 indices from the full 76-case array and filtering to live-runnable ones, accepting that some selections yield <30 cases on weeks where the rotation lands heavily on deferred/synthetic IDs.
2. `dayOfWeek`: `new Date().getDay()` returns 0 (Sunday) through 6 (Saturday). Sunday = full suite; 1-6 = sample. The rotation on Sunday is irrelevant (full suite runs), but Mon-Sat rotation is `(weekOfYear + dayOfWeek) mod 76`. `dayOfWeek=0` on Sunday means the Monday rotation starts at `(weekOfYear + 1) mod 76` — no edge case here. [VERIFIED: manually computed with Node.js: `dayOfWeek=5 (Friday), weekOfYear=20, rotation=25`]
3. **Determinism across runs of the same day:** Node's `Date` gives local-time day-of-week. In UTC (the runner timezone on GitHub Actions ubuntu-latest), 06:00 UTC triggers at the same calendar UTC date every day, so `new Date().getUTCDay()` and `getUTCFullYear()` should be used — NOT `getDay()` / `getFullYear()` which would use the runner's local timezone (which IS UTC on ubuntu-latest, but the safer choice is explicit UTC methods). [ASSUMED — runner timezone is UTC, but UTC methods are safer]
4. The rotation produces a slice of 30 consecutive indices starting at `rotationStart`, wrapping around if needed (i.e., `(rotationStart + i) % 76` for i in 0..29). Recommend wrapping rather than truncating at index 75.

**Output:** A comma-separated or newline-separated list of case IDs. The workflow passes this to `npx playwright test --grep` as a regex OR-chain: `'(US11427642-spec-short-1|US11427642-spec-long|...)'`.

**`--grep` OR-chain concern:** With 30 case IDs, each averaging ~25 chars, the regex string is ~750 chars. This is safe — Playwright's `--grep` accepts any JS regex, and shell argument length limits (2MB+) are not a concern. [ASSUMED: no documented Playwright grep length limit found]

### Pattern 4: Pre-flight Smoke → Meta-Issue Guard

**What:** Before running the regression suite, run a 1-case smoke probe. On DOM-drift or CAPTCHA failure, file ONE meta-issue and exit success (exit 78 maps to "skipped" in the workflow).

**Implementation note:** `e2e:smoke` already exists in package.json and runs `--grep @smoke` which matches 6 tests (1 Phase 26 infra + 5 regression). For the cron pre-flight, the CONTEXT.md specifies only the seed patent case `US11427642-spec-short-1`. The cleanest approach is a separate minimal Playwright invocation:

```bash
npx playwright test --config tests/e2e/playwright.config.js \
  --grep "US11427642-spec-short-1" \
  specs/regression.spec.js
```

The pre-flight must run as a separate step BEFORE the main regression run so the workflow can conditionally skip the suite and file the meta-issue. The exit code from the pre-flight step is captured via `${{ steps.smoke.outcome }}`.

**Exit code 78 caveat:** GitHub Actions does not interpret exit code 78 as "skipped" — only exit 0 and non-zero matter. The workflow should handle this by: (a) setting the smoke-step `continue-on-error: true`, (b) checking `steps.smoke.outcome == 'failure'`, (c) filing the meta-issue in a conditional step, (d) NOT running the regression suite via `if: steps.smoke.outcome == 'success'`. The overall workflow job exits success regardless. [VERIFIED: GitHub Actions exit-code behavior]

### Pattern 5: Fingerprint Dedup in `e2e-report-issue.mjs`

**What:** For each failed case in `report.json`, compute a fingerprint, query the GitHub Issues API for open `e2e-nightly` issues, grep the body for the fingerprint HTML comment, decide to comment or create.

**Implementation details verified:**

```javascript
// Source: node:crypto built-in (VERIFIED)
import { createHash } from 'node:crypto';

function computeFingerprint(caseId, errorClass, topOfStackHash) {
  const input = `${caseId}|${errorClass}|${topOfStackHash || ''}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}

function computeTopOfStackHash(errorStack) {
  // First non-test-framework frame: filter lines containing 'node_modules'
  // or Playwright internal paths; take first remaining frame's file:line:col
  if (!errorStack) return null;
  const frames = errorStack.split('\n')
    .filter(l => l.trim().startsWith('at '))
    .filter(l => !l.includes('node_modules'))
    .filter(l => !l.includes('playwright'));
  if (!frames.length) return null;
  const loc = frames[0].match(/\((.+:\d+:\d+)\)/)?.[1] || frames[0].trim();
  return createHash('sha256').update(loc).digest('hex').substring(0, 12);
}
```

**`gh api` dedup query:**

```bash
# Source: gh CLI --help (VERIFIED locally: gh 2.83.1)
gh api repos/{owner}/{repo}/issues \
  --method GET \
  -f labels=e2e-nightly \
  -f state=open \
  --paginate \
  --jq '.[].body'
```

The response is a JSON array. Paginate with `--paginate` to handle repos with many open issues. Then grep each body for `<!-- fingerprint: {fp} -->`. [VERIFIED: `gh api --help` confirms `--paginate` and `--jq` flags]

**7-day staleness check:**

```javascript
const isRecent = (issue) => {
  const updated = new Date(issue.updated_at);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return updated >= sevenDaysAgo;
};
```

Use `updated_at` (not `created_at`) so an issue that received a comment recently is still considered "active" and gets another comment rather than a new issue being created. [ASSUMED: using `updated_at` is the more user-friendly behavior; consider using `created_at` if staleness means "issue is old regardless of activity"]

**`gh api` vs `gh issue list`:** Use `gh api` for the dedup query (more control over pagination and JSON fields). Use `gh issue create` and `gh issue comment` for writing. [VERIFIED: `gh issue list --json` is available but `gh api` gives more reliable pagination and body field access]

**Non-TTY behavior:** `gh issue create` and `gh issue comment` both require `--title` and `--body` to be passed explicitly (no interactive prompt) — required in CI. `gh` auto-detects non-TTY via `CI` env var. [VERIFIED: gh --help; ASSUMED: auto-detection is documented behavior]

### Pattern 6: Artifact Upload on Failure

```yaml
# Source: ci.yml existing pattern (VERIFIED) + CONTEXT.md locked decision
- name: Upload E2E artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: e2e-nightly-${{ github.run_id }}
    path: tests/e2e/artifacts/
    retention-days: 14
    if-no-files-found: warn
```

**Retention limit:** Public repos: max 90 days. Private repos: max 400 days. 14-day retention is well within both limits. [CITED: docs.github.com/en/actions/tutorials/store-and-share-data]

**`if-no-files-found: warn`** prevents the upload step from failing when the smoke pre-flight exits before any artifacts are written. [ASSUMED: this is the safest default; `ignore` is also valid]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash function | `node:crypto createHash('sha256')` | Built-in, constant-time, no deps |
| Issue search | Custom GitHub REST client | `gh api` with `--paginate --jq` | gh CLI handles auth, pagination, rate-limit retry headers automatically |
| Issue filing | Custom GitHub REST POST | `gh issue create --title ... --body ...` | Handles label creation, auth, non-TTY correctly |
| Browser install | Shell script downloading Chromium directly | `npx playwright install chromium` | Ensures binary matches the `@playwright/test` version exactly |
| Cron date calculation | Complex date library | Node.js built-in `Date` UTC methods | `getUTCDay()`, `getUTCFullYear()`, no deps needed |

---

## Risks & Edge Cases

### Risk 1: Two Workflow Runs Racing to File the Same Issue

**What goes wrong:** If a nightly run is delayed by GitHub's queue and a `workflow_dispatch` manual run starts at the same time, both could complete the dedup query before either has created the issue, resulting in two issues with the same fingerprint.

**Root cause:** The dedup query + issue-create is not atomic. There is no distributed lock.

**Mitigation:** The CONTEXT.md concurrency group `cancel-in-progress: false` prevents two cron-triggered runs from overlapping, but does NOT prevent a concurrent `workflow_dispatch` from racing a scheduled run (they have different `github.event_name` values and thus different concurrency groups). [VERIFIED: GitHub Actions concurrency group logic]

**Recommendation for planner:** Use a single concurrency group for ALL e2e-nightly triggers: `group: e2e-nightly, cancel-in-progress: false`. This ensures at most one run at a time regardless of trigger type. The CONTEXT.md concurrency expression `e2e-nightly-${{ github.event.schedule || github.event_name }}` produces `e2e-nightly-schedule` for cron and `e2e-nightly-workflow_dispatch` for manual — these are different groups and CAN race. Consider overriding to `e2e-nightly` as the static group name. [ASSUMED: this override is within Claude's Discretion scope ("Exact cache key format details")]

### Risk 2: `gh api` Rate-Limit on Issue Dedup Query

**What goes wrong:** The `GITHUB_TOKEN` in GitHub Actions is limited to 1,000 requests/hour/repo (primary) and 80 content-generating requests/minute (secondary for writes). Issue creation is a write; the dedup API query is a read. [CITED: docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api]

**Realistic exposure:** If 30 cases all fail simultaneously (worst case), the issue filer makes ~30 dedup queries (reads) + up to 30 issue-create calls (writes). 30 writes in <60 seconds would hit the 80-writes/minute secondary limit. In practice, failures cluster (e.g., all fail with GOOGLE_DOM_DRIFT and share one fingerprint, yielding 1 create + 29 no-ops). Real risk is low but non-zero.

**Mitigation:** Add a `setTimeout(1000)` between issue-create calls in the issue filer (30 ms between reads is negligible). Also: FLAKE cases are filtered out by design, reducing volume.

### Risk 3: Cache Poisoning via `hashFiles('package.json')` Key

**What goes wrong:** If a developer updates `package.json` for a non-Playwright reason (e.g., adds a script), the cache is invalidated and `playwright install chromium` runs fresh — this is correct behavior. However, if `package.json` is temporarily corrupted and a CI run installs a broken/incomplete Chromium, that broken cache could persist for 7 days (GitHub's cache eviction).

**Mitigation:** `npx playwright install chromium` always validates the binary after download. A failed install exits non-zero and the cache write step (which happens after the run) would not persist. [ASSUMED: GitHub Actions cache is only written when the install succeeds — actually, `actions/cache` writes the cache at post-job even if the install step failed. This is a real risk.]

**Recommendation:** Add a verification step after install: `npx playwright --version` (validates the binary is functional before caching).

### Risk 4: Cron Schedule Skew (GitHub Queue Delay)

**What goes wrong:** GitHub does not guarantee exact cron execution time. During high-load periods, `0 6 * * *` may run at 06:15 or 06:30 UTC. This does NOT affect the rotation algorithm since it uses UTC date — a 30-minute delay does not change the calendar date. [CITED: github.com/orgs/community/discussions/156282]

**Only real risk:** A run scheduled for 06:00 UTC that starts at 00:05 UTC+? (timezone confusion). Using `getUTCDay()` in the rotation script eliminates this.

### Risk 5: `report.json` Not Written (Pre-flight Aborts)

**What goes wrong:** If the smoke pre-flight fails before the regression suite runs, `tests/e2e/artifacts/{run-id}/report.json` may not exist (the spec's `beforeAll` throws before any `appendCase` calls, or before the Playwright test run creates the artifact directory).

**Mitigation:** `e2e-report-issue.mjs` must guard against missing report.json:

```javascript
if (!fs.existsSync(reportPath)) {
  console.log('No report.json found — nothing to file.');
  process.exit(0);
}
```

On a smoke-fail path, the meta-issue is filed by the smoke-fail step directly, not by the issue filer.

### Risk 6: `e2e-nightly` Label Does Not Exist

**What goes wrong:** `gh issue create --label e2e-nightly` fails if the label does not exist in the repository.

**Mitigation:** Add a workflow step that creates the label idempotently before the issue filer runs:

```bash
gh label create "e2e-nightly" --color "#0075ca" --description "Auto-filed by nightly E2E cron" || true
```

The `|| true` makes it a no-op if the label already exists. [VERIFIED: `gh label create` exits non-zero if label exists; `|| true` idiom confirmed]

### Risk 7: Playwright Config `testDir: './specs'` is Relative to Config File

**What goes wrong:** The `e2e:regression` npm script passes `--config tests/e2e/playwright.config.js` and the config's `testDir: './specs'` resolves to `tests/e2e/specs/`. The cron workflow must invoke from the repo root with the same `--config` path. Invoking from a different working directory would break testDir resolution.

**Mitigation:** The workflow should always run from the repo root (standard for `actions/checkout`). The existing npm scripts show the correct invocation pattern. [VERIFIED: ci.yml always runs from repo root]

### Risk 8: `topOfStackHash` for Cases Without an Error Stack

**What goes wrong:** Cases that fail with `NO_CITATION_PRODUCED` (pill timeout) typically throw a Playwright `TimeoutError` — this DOES have a stack trace. Cases where `errorClass` is set but status is not `'failed'` (e.g., `VERIFIER_DISAGREE` on a passed case) have no thrown error and no stack.

**Per CONTEXT.md:** The fingerprint for VERIFIER_DISAGREE uses `topOfStackHash = null`, so fingerprint = `sha256('${caseId}|VERIFIER_DISAGREE|')`. This means every case with VERIFIER_DISAGREE for the same patent will share a fingerprint regardless of WHERE the disagreement occurs — appropriate since the root cause is the verifier's disagreement on that patent's citation.

**For the issue filer:** `report.json` case entries do NOT include a `stack` field (the schema has `id, status, errorClass, citation, verifier_verdict, artifacts, duration_ms`). The `topOfStackHash` must come from either: (a) reading Playwright's test output (not available in report.json), or (b) hashing a proxy like `verifier_verdict.reason` or the artifact paths. Recommend using `verifier_verdict.reason` truncated to 100 chars as the "top-of-stack equivalent" for verifier failures, or `null` for cases where reason is not available. [ASSUMED: this proxy is Claude's Discretion scope ("Reporter script's exact stack-hash algorithm")]

---

## Common Pitfalls

### Pitfall 1: `inputs.*` is `null` for Cron-Triggered Runs

**What goes wrong:** A workflow that checks `${{ inputs.force_full_suite == 'true' }}` on a cron-triggered run will get `null == 'true'` → false, which is correct. But `${{ inputs.force_full_suite || 'false' }}` may not work as expected if the input is typed `boolean` — GitHub converts boolean inputs to strings when passed to shell steps. [CITED: docs.github.com/en/actions/using-workflows/events-that-trigger-workflows]

**How to avoid:** Use `if: inputs.force_full_suite == true || github.event_name == 'schedule'` for the full-suite step, where `inputs.force_full_suite` is `null` for cron runs (null != true → false) and `true` only for manual override runs.

### Pitfall 2: `actions/cache` Writes Cache Even After Failed Install

**What goes wrong:** `actions/cache@v4` writes the cache in a post-job cleanup step, AFTER the main steps complete. If `playwright install` partially completes (disk full, network error), a broken cache can be written and reused on the next run.

**How to avoid:** Add `npx playwright --version` immediately after install as a smoke check. If this exits non-zero, the job fails before the cache write step runs (the post-job `actions/cache` save only runs when the prior steps succeeded — actually this is FALSE; cache save runs regardless of job status unless `if: always()` is not set). [VERIFIED: actions/cache@v4 always saves on cache miss regardless of job success/failure — confirmed in the upload-artifact docs indirectly via GitHub Actions post-step behavior]

**Revised mitigation:** Cannot prevent a broken cache save with the standard `actions/cache` step. Accept the risk and rely on `playwright install`'s own validation. A broken Playwright install will fail the test step, not a silent bad-cache scenario.

### Pitfall 3: `--with-deps` vs No-Deps on ubuntu-latest

**CONTEXT.md decision:** Skip `--with-deps`. This relies on ubuntu-latest having the necessary system dependencies for Chromium pre-installed. Confirmed by multiple sources that `ubuntu-latest` runners have Chromium system deps (libnss3, libatk-bridge2.0-0, etc.) pre-installed. [CITED: playwright.dev/docs/ci] If the runner image changes and deps go missing, `playwright install chromium` (without `--with-deps`) will succeed, but the browser launch will fail with a missing-library error. The error message will be clear enough to diagnose.

### Pitfall 4: `gh api` Pagination and Issue Body Size

**What goes wrong:** `gh api repos/.../issues?labels=e2e-nightly&state=open` without `--paginate` returns only the first page (default 30 items). If the repo has >30 open e2e-nightly issues (possible if dedup was broken for a while), a fingerprint match in page 2+ would be missed, causing a duplicate issue.

**How to avoid:** Always use `gh api ... --paginate`. [VERIFIED: `--paginate` flag confirmed in `gh api --help`]

### Pitfall 5: Cron Run Timing and UTC Day Boundary

**What goes wrong:** The schedule is `0 6 * * *` (06:00 UTC). The rotation uses `getUTCDay()`. But if GitHub's queue delay pushes the run to 06:59 UTC vs 07:01 UTC, the day does not change. This is fine. However, if the queue delay pushes past midnight UTC (unlikely for 06:00 schedule), the day could change. Accept this as a known GitHub limitation.

**How to avoid:** Use `getUTCDay()` and `getUTCFullYear()` in the rotation script, not local-time methods. Document in the script header.

### Pitfall 6: `e2e:regression` npm Script Rebuilds Chrome Extension Every Run

**What goes wrong:** `npm run e2e:regression` is defined as `npm run build:chrome && playwright test ...`. This rebuilds `dist/chrome/` from source on every invocation. In CI, this is correct (fresh build from the checked-out code). No issue here — just be aware the workflow must NOT skip the build step.

**How to avoid:** Include `npm run build:chrome` explicitly in the workflow before running tests, or use the `e2e:regression` script as-is.

---

## Code Examples

### Verified Workflow Structure Skeleton

```yaml
# Source: ci.yml pattern (VERIFIED) + CONTEXT.md locked decisions
name: E2E Nightly

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      force_full_suite:
        description: 'Run all 76 cases (ignores day-of-week rotation)'
        type: boolean
        default: false

concurrency:
  group: e2e-nightly
  cancel-in-progress: false

jobs:
  e2e-nightly:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
      issues: write
    env:
      PLAYWRIGHT_RUN_ID: ${{ github.run_id }}
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then npm ci; else npm install; fi

      - name: Cache Playwright Chromium
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: pw-${{ runner.os }}-${{ hashFiles('package.json') }}

      - name: Install Playwright Chromium
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install chromium

      - name: Build Chrome extension
        run: npm run build:chrome

      - name: Ensure e2e-nightly label exists
        run: gh label create "e2e-nightly" --color "#0075ca" --description "Auto-filed by nightly E2E cron" || true

      - name: Pre-flight smoke (1 case)
        id: smoke
        continue-on-error: true
        run: |
          npx playwright test \
            --config tests/e2e/playwright.config.js \
            --grep "US11427642-spec-short-1 @smoke" \
            specs/regression.spec.js

      - name: File meta-issue on smoke failure
        if: steps.smoke.outcome == 'failure'
        run: node scripts/e2e-report-issue.mjs --meta-drift

      - name: Select test cases for today
        id: cases
        if: steps.smoke.outcome == 'success'
        run: |
          CASES=$(node scripts/select-cron-cases.mjs \
            ${{ inputs.force_full_suite == true && '--full' || '' }})
          echo "cases=$CASES" >> $GITHUB_OUTPUT

      - name: Run E2E regression
        id: regression
        if: steps.smoke.outcome == 'success'
        continue-on-error: true
        run: |
          npx playwright test \
            --config tests/e2e/playwright.config.js \
            --grep "${{ steps.cases.outputs.cases }}" \
            specs/regression.spec.js

      - name: File issues for failures
        if: steps.smoke.outcome == 'success'
        run: node scripts/e2e-report-issue.mjs

      - name: Upload artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-nightly-${{ github.run_id }}
          path: tests/e2e/artifacts/
          retention-days: 14
          if-no-files-found: warn
```

### Rotation Algorithm (`scripts/select-cron-cases.mjs`)

```javascript
// Source: CONTEXT.md locked decision + Node.js Date built-ins (VERIFIED)
import { TEST_CASES } from '../tests/test-cases.js';

// Cases deferred/synthetic (not runnable in live CI)
const DEFERRED_IDS = new Set([
  'US11427642-repetitive', 'US4723129-claims', 'US5371234-chemical-cross-col',
  'US5371234-claims', 'US7346586-claims-repetitive', 'US8352400-claims',
  'US5440748-claims', 'US5440748-repetitive', 'US4723129-claims-repetitive',
]);
const SYNTHETIC_CATEGORIES = new Set(['gutter']);

const liveCases = TEST_CASES.filter(tc =>
  !DEFERRED_IDS.has(tc.id) && !SYNTHETIC_CATEGORIES.has(tc.category)
);

function getWeekOfYear(d) {
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayMs = 86400000;
  return Math.ceil(((d.getTime() - startOfYear) / dayMs + 1) / 7);
}

const forceFullSuite = process.argv.includes('--full');
const now = new Date();
const dayOfWeek = now.getUTCDay(); // 0=Sun

if (dayOfWeek === 0 || forceFullSuite) {
  // Full suite: emit all live case IDs
  console.log(liveCases.map(tc => tc.id).join('|'));
} else {
  const weekOfYear = getWeekOfYear(now);
  const rotationStart = (weekOfYear + dayOfWeek) % liveCases.length;
  const selected = [];
  for (let i = 0; i < 30; i++) {
    selected.push(liveCases[(rotationStart + i) % liveCases.length]);
  }
  console.log(selected.map(tc => tc.id).join('|'));
}
```

**Note:** The `--grep` flag receives a pipe-separated OR-pattern. Playwright interprets this as a regex: `US11427642-spec-short-1|US11427642-spec-long|...`. This is safe for case IDs (all alphanumeric + `-`). [ASSUMED: Playwright's --grep treats `|` as regex OR; verified from Playwright docs pattern usage]

### Fingerprint Computation (`scripts/e2e-report-issue.mjs` excerpt)

```javascript
// Source: node:crypto built-in (VERIFIED); CONTEXT.md fingerprint spec (locked)
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function fingerprint(caseId, errorClass, topOfStackHash) {
  return createHash('sha256')
    .update(`${caseId}|${errorClass}|${topOfStackHash || ''}`)
    .digest('hex')
    .substring(0, 12);
}

function loadReport(reportPath) {
  if (!existsSync(reportPath)) return null;
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

function getOpenNightlyIssues() {
  const raw = execSync(
    'gh api repos/{owner}/{repo}/issues --method GET -f labels=e2e-nightly -f state=open --paginate',
    { encoding: 'utf8' }
  );
  return JSON.parse(raw);
}
```

**Issue body template (locked structure from CONTEXT.md specifics):**

```markdown
## [e2e-nightly] {caseId}: {errorClass}

| Field | Value |
|-------|-------|
| Patent | {caseId} |
| Error class | {errorClass} |
| Verifier verdict | {verifier_verdict.status} ({verifier_verdict.tier_used}) |
| Stack hash | {topOfStackHash || 'n/a'} |
| Artifact bundle | [Run #{run_id}]({artifact_url}) |

**Details:**
{verifier_verdict.reason}

<!-- fingerprint: {fp} -->
```

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (for pure-function unit tests) + manual workflow trigger (for CI integration) |
| Config file | `vitest.config.js` (existing) — or new `vitest.config.e2e-nightly.js` |
| Quick run command | `vitest run tests/e2e-nightly/` |
| Full suite command | `npm run test` (existing) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| CRON-01 | Workflow file exists and triggers correctly | Manual (workflow_dispatch) | `gh workflow run e2e-nightly.yml` | Cannot unit-test GHA trigger; success = job starts |
| CRON-02 | Rotation is deterministic per day | Unit test (Vitest) | `vitest run tests/unit/select-cron-cases.test.js` | Pure function; mock `Date`; assert same-day = same set |
| CRON-02 | Sunday = all live cases; Mon-Sat = 30 cases | Unit test (Vitest) | Same | Assert `length == liveCases.length` on Sun, `== 30` on other days |
| CRON-03 | Chromium installs + suite runs in CI | Smoke CI run | `gh workflow run e2e-nightly.yml` | Accept 1 cron-smoke run as validation |
| CRON-03 | Artifacts uploaded on failure | Smoke CI run | `gh run view {run_id}` | Confirm artifact listed |
| CRON-04 | Issue filer reads report.json correctly | Unit test (Vitest) | `vitest run tests/unit/e2e-report-issue.test.js` | Fixture report.json → expect gh invocations mocked |
| CRON-04 | Issue body format includes all required sections | Unit test (Vitest) | Same | Assert body contains "Patent", "Error class", "fingerprint" HTML comment |
| CRON-05 | Duplicate fingerprint → comment, not new issue | Unit test (Vitest) | Same | Mock `getOpenNightlyIssues()` with existing issue containing fingerprint |
| CRON-05 | >7-day-old match → new issue (not comment) | Unit test (Vitest) | Same | Mock issue with `updated_at` 8 days ago |
| CRON-05 | No FLAKE cases filed | Unit test (Vitest) | Same | Fixture report.json with FLAKE case → assert gh not called for it |

**Manual CI smoke test (validates CRON-01, CRON-03):** The Phase 29 success criteria requires "pushing a tag with a deliberately-broken citation triggers the nightly cron." The planner should include a "CI smoke run" task that triggers `workflow_dispatch` on the new workflow, verifies the job starts and reaches the issue-filing step, and then verifies a test issue is created with the correct fingerprint format. This can be done with a known-failing fixture report.json rather than a real browser run.

### Sampling Rate

- **Per task commit:** `vitest run tests/unit/` (< 10 seconds — pure function tests only)
- **Per wave merge:** `npm run test` (full Vitest suite including existing test:src/chrome/firefox)
- **Phase gate:** Full unit suite green + one successful `workflow_dispatch` smoke run before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/select-cron-cases.test.js` — covers CRON-02 (rotation determinism, Sunday vs weekday)
- [ ] `tests/unit/e2e-report-issue.test.js` — covers CRON-04, CRON-05 (fingerprint, dedup, FLAKE filter)
- [ ] Test fixture: `tests/unit/fixtures/sample-report.json` — example `report.json` with pass/fail/flake cases

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | GITHUB_TOKEN used; standard GHA secret handling |
| V3 Session Management | No | Stateless workflow steps |
| V4 Access Control | Yes (limited) | `permissions: contents: read, issues: write` — minimum needed per CONTEXT.md |
| V5 Input Validation | Yes | `workflow_dispatch` `force_full_suite` input is typed `boolean`; report.json parsing should validate schema before processing |
| V6 Cryptography | Yes | `node:crypto sha256` — built-in; no hand-rolled crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Issue body injection via caseId/errorClass from report.json | Tampering | Sanitize case IDs before embedding in issue title/body (case IDs are known alphanumeric format from test-cases.js; validate against regex `/^[A-Z]{2}\d+[A-Z]?\d*-[a-z0-9-]+$/`) |
| GITHUB_TOKEN scope creep | Elevation | `permissions: issues: write` only; `contents: read` for checkout |
| Spoofed report.json in artifact directory | Tampering | Low risk (report.json is written by the test spec in CI, same job); no external input |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | All scripts | Yes (via setup-node@v4) | 22.x | — |
| `gh` CLI | CRON-04, CRON-05 | Yes on ubuntu-latest | Pre-installed | — |
| Playwright 1.60.0 | CRON-03 | Yes | 1.60.0 (package.json) | — |
| Chromium binary | CRON-03 | Yes (after cache/install) | chromium-1223 | — |
| `node:crypto` | CRON-05 fingerprint | Yes | Built-in | — |
| `GITHUB_TOKEN` secret | CRON-04 | Yes (auto-provided in Actions) | — | — |

**Missing dependencies with no fallback:** None — all dependencies are either built-in, pre-installed on ubuntu-latest, or provided by the Actions runner.

---

## Suggested Plan Split (for Planner)

The planner should consider these natural units of work:

**Plan 29-01 — `scripts/select-cron-cases.mjs` + unit tests**
Pure function, no CI dependency. Write the rotation script + `tests/unit/select-cron-cases.test.js`. Verifies CRON-02 is unit-testable before any CI work.

**Plan 29-02 — `scripts/e2e-report-issue.mjs` + unit tests**
The issue filer as a pure Node.js script (mock `gh` CLI calls with `jest.mock` or Vitest mock). Unit-test fingerprint computation, dedup logic, FLAKE filtering, body template. Verifies CRON-04 and CRON-05 without real network. Include `tests/unit/e2e-report-issue.test.js` and the fixture `sample-report.json`.

**Plan 29-03 — `.github/workflows/e2e-nightly.yml`**
Author the workflow file: dual trigger, concurrency group, Playwright cache, pre-flight smoke step, regression step, artifact upload, issue filer invocation. Wire `PLAYWRIGHT_RUN_ID`. Does NOT run the workflow yet — just creates and validates the YAML syntax.

**Plan 29-04 — Label setup + CI smoke run**
Create the `e2e-nightly` label in the GitHub repo. Trigger `workflow_dispatch` on the new workflow. Provide a known-failing fixture report.json (or use the re-enabled `US11427642-claims-1` known extension defect). Verify a GitHub issue is created with the correct format and fingerprint. Verify dedup works by triggering twice. Satisfies CRON-01, CRON-03, CRON-04, CRON-05 end-to-end.

**Plan 29-05 — playwright.config.js CI tuning** *(optional, may merge into 29-03)*
Add `retries: 1` for CI (FLAKE reduction), confirm `reporter: 'list'` works in non-TTY CI, confirm 30-min timeout is sufficient for 76-case Sunday full run. This is a `Claude's Discretion` area from CONTEXT.md: "Phase 29 may tune CI."

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `headless: true` explicit | Omit `headless` key (default new-headless under `channel:'chromium'`) | Playwright 1.49 | Extension support in headless mode without xvfb |
| `actions/cache@v3` | `actions/cache@v4` | 2023-2024 | Improved cache save/restore; already used in project |
| `gh issue search` | `gh api ... --paginate` | — | `gh issue search` cannot reliably search issue bodies; raw API needed for fingerprint grep |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ubuntu-latest` runners use UTC timezone, so `getUTCDay()` matches the cron trigger's calendar date | Pattern 3 (rotation) | Wrong day's rotation used; minor (±1 day rotation offset) |
| A2 | The concurrency group `e2e-nightly` (single static name) prevents workflow_dispatch racing scheduled runs | Risk 1 | Two runs could race and file duplicate issues |
| A3 | `updated_at` is better than `created_at` for the 7-day staleness check | Pattern 5 (dedup) | Issues receiving comments stay active longer; could suppress new issue creation when a new failure type appears |
| A4 | `verifier_verdict.reason` is a usable proxy for `topOfStackHash` when no JS stack is available | Risk 8 (stack hash) | Fingerprint may not be unique enough (reason strings could repeat); or too unique (new comment instead of existing) |
| A5 | Playwright `--grep` with pipe-delimited IDs is treated as regex OR-chain | Pattern 3 (rotation output) | Regex special chars in case IDs could break grep matching; case IDs are safe alphanumeric |
| A6 | `actions/cache@v4` does not write a broken cache if the install step fails | Pitfall 2 (cache) | Broken Playwright cache persists; resolved by `npx playwright --version` verification step |

---

## Open Questions

1. **Rotation modulus: 76 or live-count?**
   - What we know: CONTEXT.md says `mod 76` (total corpus); live runnable cases = 67
   - What's unclear: Should rotation index over all 76 positions (skipping deferred/synthetic at selection time) or over only the 67 live positions?
   - Recommendation: Rotate over `liveCases.length` (67) to guarantee exactly 30 live cases per Mon-Sat run. Using 76 with filtering could yield <30 cases on some weeks.

2. **Pre-flight smoke: full 1-case Playwright run or reuse `e2e:smoke`?**
   - What we know: `e2e:smoke` runs `--grep @smoke` (6 cases); CONTEXT.md specifies 1-case probe on seed patent
   - What's unclear: Whether to create a new `e2e:cron-smoke` script or use `--grep "US11427642-spec-short-1 @smoke"` inline
   - Recommendation: Inline `--grep` in the workflow step; no new npm script needed

3. **`topOfStackHash` source in `report.json`**
   - What we know: `report.json` case entries have `{id, status, errorClass, citation, verifier_verdict, artifacts, duration_ms}` — no `stack` field
   - What's unclear: Whether Phase 29 should add a `stack` field to the report schema (requires modifying regression.spec.js) or derive `topOfStackHash` from existing fields
   - Recommendation: Use `verifier_verdict.reason` (hashed) as proxy; this is within Claude's Discretion

---

## Sources

### Primary (HIGH confidence)
- CONTEXT.md (locked decisions) — all locked implementation choices
- `tests/e2e/lib/report.js`, `tests/e2e/lib/error-codes.js` — Phase 28 report schema (VERIFIED via direct file read)
- `tests/e2e/specs/regression.spec.js` — corpus size, deferred IDs, smoke pattern (VERIFIED)
- `.github/workflows/ci.yml` — existing workflow pattern (VERIFIED)
- `package.json` — Playwright version 1.60.0, existing npm scripts (VERIFIED)

### Secondary (MEDIUM confidence)
- [Playwright Chrome Extensions docs](https://playwright.dev/docs/chrome-extensions) — `channel: 'chromium'` enables headless extension mode
- [Playwright CI docs](https://playwright.dev/docs/ci) — official guidance: caching NOT recommended; `--with-deps` on ubuntu-latest; docs confirmed via WebFetch
- [GitHub Actions rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — GITHUB_TOKEN: 1,000 req/hr, 80 content-generating writes/min; confirmed via WebFetch
- [upload-artifact@v4 retention limits](https://docs.github.com/en/actions/tutorials/store-and-share-data) — 90-day max for public repos; 14-day retention is safe
- [Playwright caching in CI](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/) — cache key format `runner.os-playwright-{version}`, path `~/.cache/ms-playwright`
- [GitHub Actions cron scheduling delay](https://github.com/orgs/community/discussions/156282) — cron runs may be delayed by queue; UTC date remains stable for ±30 min delays

### Tertiary (LOW confidence)
- [Playwright `channel: 'chromium'` CI issues](https://github.com/microsoft/playwright/issues/28754) — historical issues with headless extension in CI; resolved since Playwright ~1.45; current 1.60.0 is safe [needs validation with actual CI run]
- [workflow_dispatch inputs and cron](https://github.com/orgs/community/discussions/137750) — inputs are null for scheduled runs; verified by multiple community sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are pre-existing in project; versions verified
- Architecture: HIGH — decisions locked in CONTEXT.md; implementation details verified via code inspection
- Pitfalls: MEDIUM — pitfalls identified from code analysis and GHA docs; some (cache poisoning, race condition) are theoretical and LOW-probability in practice
- Dedup algorithm: HIGH — logic verified against Node.js crypto docs and gh CLI help

**Research date:** 2026-05-15
**Valid until:** 2026-08-15 (GitHub Actions API and gh CLI are stable; Playwright patch versions may change cache path)

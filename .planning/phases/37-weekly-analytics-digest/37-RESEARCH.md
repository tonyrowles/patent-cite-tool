# Phase 37: Weekly Analytics Digest - Research

**Researched:** 2026-05-28
**Domain:** GitHub Actions cron + `gh` CLI aggregation/publish + zero-dep Node markdown rendering
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Export `SUMMARY_KEYS = Object.freeze([...])` from `tests/e2e/lib/llm-report.js`. Ideally `emptySummary()`/init/finalize build the summary object FROM this single source.
- **D-02:** `weekly-digest.mjs` validates ALL `SUMMARY_KEYS` present at startup; throws a descriptive error NAMING the missing key — NOT a silent zero (DIGEST-04). Vitest covers the throw path.
- **D-03:** Aggregation reads OPEN GitHub issues filtered by `e2e-nightly` + `e2e-quarantine` labels via `gh api` (issues = persistence). Aggregates: findings count, classification breakdown table, top-3 failure categories, quarantine growth, cost vs cap.
- **D-04:** Output ≤50 lines total, aggregated only — NO per-iteration list. Line-count guard in the script asserts rendered markdown ≤50 lines (DIGEST-04).
- **D-05:** ACTIVE path = `e2e-digest`-labeled Issue fallback (Discussions disabled, verified). `gh api graphql createDiscussion` path implemented but dormant.
- **D-06:** Single config flag `DIGEST_PUBLISH_MODE` env var: `auto` (probes `has_discussions`), `discussion` (force), `issue` (force). Workflow sets `issue` for now.
- **D-07:** `e2e-digest` label self-bootstrapped via `gh label create e2e-digest --color <hex> --force` (mirrors Phase 36 label-ensure).
- **D-08:** Full `gh api graphql` createDiscussion mutation (repo+category lookup → createDiscussion) implemented behind `discussion` branch. Vitest mock-gh tests cover BOTH branches.
- **D-09:** `.github/workflows/e2e-weekly-digest.yml` — `schedule: cron '0 7 * * 1'` (Monday 07:00 UTC) + `workflow_dispatch`. Permissions `contents: write` + `discussions: write` (DIGEST-02).
- **D-10:** Committed markdown path `reports/weekly-digest-YYYY-WNN.md` where `YYYY-WNN` is ISO year + ISO week (e.g. `2026-W22`). Script computes ISO week deterministically.
- **D-11:** Workflow commits `reports/weekly-digest-*.md` in the same run via `contents: write` (git add + commit + push). Idempotent — overwrites if that week's digest exists.
- **D-12:** Time window = prior 7 days (ISO week boundary). `quarantine growth` = count of `e2e-quarantine` issues opened in the window. `cost vs cap` = ledger `monthlyTotal` vs `HARD_CAP_USD` (100).
- **D-13:** `scripts/weekly-digest.mjs` — CLI with injectable `ghClient` + `now` deps (Phase 33-36 injected-deps pattern). `npm run e2e:weekly-digest` script. `isMain` guard (WR-02 pattern).
- **D-14:** `tests/e2e/scripts/e2e-weekly-digest.test.js` mock-gh: fixture issue set → asserts (a) all 5 aggregations in markdown, (b) ≤50 lines, (c) missing-SUMMARY_KEY throw, (d) BOTH publish branches dispatched per `DIGEST_PUBLISH_MODE`.
- **D-15:** cost-vs-cap via `llm-ledger.js::monthlyTotal` vs `HARD_CAP_USD` (100). Renders `$X.XX / $100 (Y%)`. If ledger absent (CI has no local ledger), render `cost data unavailable` gracefully — NOT a throw.
- **D-16:** top-3 failure categories derived from `category`/errorClass labels on the filtered issues (Phase 34/35 labels). Tally by errorClass, sort desc, top 3, ties broken alphabetically for determinism.

### Claude's Discretion
- `e2e-digest` label color hex — planner picks (distinct from triage/e2e-nightly `0075ca`/e2e-quarantine `d93f0b`).
- Exact markdown table formatting for the classification breakdown — must stay within ≤50-line budget.
- ISO-week computation: tiny inline helper vs date library — **recommend inline** (zero-new-dep lock); Node Date math suffices.
- GraphQL category-id resolution for dormant discussion path — **recommend** querying `repository.discussionCategories` and matching by name.

### Deferred Ideas (OUT OF SCOPE)
- Roadmap-candidate auto-generation from top categories (ROADMAP-01/02) — deferred.
- Real-time alerting (Slack/PagerDuty) (ALERT-01) — deferred.
- Enabling GitHub Discussions on the repo — admin/org action, not code; flip `DIGEST_PUBLISH_MODE` to `auto`/`discussion` once enabled.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIGEST-01 | `weekly-digest.mjs` reads open issues by `e2e-nightly`+`e2e-quarantine` labels via `gh` API; aggregates 5 metrics | §"gh issue/label/date filtering" + §"Aggregation logic"; reuse `makeRealGhClient` `gh api repos/{repo}/issues` pattern |
| DIGEST-02 | `.github/workflows/e2e-weekly-digest.yml` Monday 07:00 UTC; `contents: write` + `discussions: write` | §"Workflow patterns"; mirrors `e2e-nightly.yml` cron+permissions block |
| DIGEST-03 | Publish to GitHub Discussion via `gh api graphql createDiscussion` (Issue `e2e-digest` fallback); also commit `reports/weekly-digest-YYYY-WNN.md` | §"GraphQL createDiscussion (dormant path)" + §"Commit-in-run idiom" + §"ISO-week filename" |
| DIGEST-04 | `SUMMARY_KEYS` exported from `lib/llm-report.js`; digest validates all keys (throws on missing, no silent zero); output ≤50 lines aggregated | §"SUMMARY_KEYS — net-new export" + §"≤50-line guard" |
</phase_requirements>

## Summary

Phase 37 is the last v3.1 phase: a Monday-07:00-UTC GitHub Actions cron that reads the prior week's LLM-triage issues (filtered by `e2e-nightly` + `e2e-quarantine` labels via `gh api`), aggregates them into a ≤50-line markdown digest (findings count, classification breakdown, top-3 failure categories, quarantine growth, cost vs cap), publishes it (Discussion via GraphQL if enabled, else `e2e-digest`-labeled Issue — verified active path), and commits it to `reports/weekly-digest-YYYY-WNN.md` in the same run. There are **zero new runtime/dev dependencies**: everything is built on the existing `gh` CLI shellout pattern, `node:child_process`, and `node:fs`. The phase reuses four battle-proven patterns from Phases 29–36: (1) injected-deps CLI modules with `now`/`ghClient` for unit isolation, (2) `gh` shellout via `execSync` with a mock-gh bash shim in tests, (3) label self-bootstrap (`gh label create --force`), and (4) `isMain` guard (WR-02).

Two findings are load-bearing for planning. **First, `SUMMARY_KEYS` is net-new** — `tests/e2e/lib/llm-report.js` currently encodes the summary contract only implicitly inside `emptySummary()` (lines 117–127) and `classificationToSummaryKey()` (134–144). D-01's "single source of truth" is satisfied cleanly by extracting the seven keys to a frozen array and rebuilding `emptySummary()` FROM it. **Second, there is no existing in-run git-commit idiom in this repo** — `actions/checkout@v4` is used everywhere but no workflow has yet done git add+commit+push, so the commit-in-run step (D-11) is net-new and must be authored carefully (default `GITHUB_TOKEN` + `persist-credentials: true` checkout default works; `[skip ci]` in the commit message avoids re-triggering `ci.yml`).

**Primary recommendation:** Build `weekly-digest.mjs` as a pure-function-core + thin-CLI-shim module (exact shape of `scripts/quarantine-append.mjs`). Inject `ghClient` and `now`. Compute the ISO-week filename inline (zero-dep). Render markdown by joining a fixed-order array of lines (`Array.join('\n')`) so the ≤50-line guard is a trivial `.split('\n').length` assertion. Aggregate by counting issue label objects from `gh api repos/{repo}/issues` JSON. Set `DIGEST_PUBLISH_MODE=issue` in the workflow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read prior-week issues by label | `gh` CLI / GitHub REST API | weekly-digest.mjs ghClient | Issues are the persistence layer (D-03); the CLI is the auth'd, unit-tested access path already proven in `e2e-report-issue.mjs` |
| Aggregate 5 metrics | weekly-digest.mjs (pure fns) | — | Pure transformation of JSON issue array → counts; no I/O, fully unit-testable |
| Read cost-vs-cap | `llm-ledger.js` (local FS) | weekly-digest.mjs | Ledger is a local-only gitignored artifact; absent in CI → graceful degrade (D-15) |
| ISO-week filename | weekly-digest.mjs (pure fn) | — | Deterministic date math, zero-dep, test-injectable via `now` |
| Render markdown (≤50 lines) | weekly-digest.mjs (pure fn) | — | String assembly; line-count guard is a pure assertion |
| Publish (issue OR discussion) | `gh` CLI (REST issue / GraphQL discussion) | weekly-digest.mjs ghClient | Side-effecting; behind `DIGEST_PUBLISH_MODE` branch; both mocked in tests |
| Commit markdown to repo | GitHub Actions workflow step (git CLI) | — | `contents: write` token + checkout creds; net-new in-run commit idiom |
| Label self-bootstrap | GitHub Actions workflow step (`gh label create --force`) | — | Mirrors `e2e-nightly.yml` lines 97–105 / 255–267 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gh` CLI | 2.83.1 (installed) [VERIFIED: `gh --version`] | Issue read/create + GraphQL discussion + label bootstrap | Already auth'd in CI via `GITHUB_TOKEN`; unit-tested via mock-gh shim; battle-proven in `e2e-report-issue.mjs` |
| `node:child_process` `execSync` | Node 24.11.1 [VERIFIED: `node --version`] | Shell out to `gh` | Existing `makeRealGhClient` pattern (e2e-report-issue.mjs:477) |
| `node:fs` / `node:path` / `node:url` | Node 24.11.1 | FS reads, ISO-week, isMain guard | Zero-dep lock |
| `tests/e2e/lib/llm-report.js` | repo-local | `SUMMARY_KEYS` export site (D-01) | Single source of truth for summary contract |
| `tests/e2e/lib/llm-ledger.js` | repo-local | `monthlyTotal`, `HARD_CAP_USD`, `readLedger` | cost-vs-cap (D-15) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^3.0.0 (devDep) [VERIFIED: package.json] | mock-gh unit tests | D-14 test suite + SUMMARY_KEYS export test + ISO-week helper test |
| `git` CLI | 2.43.0 (installed) [VERIFIED: `git --version`] | commit-in-run (D-11) | Workflow step only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh` CLI shellout | `@octokit/rest` | REQUIREMENTS.md "Out of Scope" explicitly rejects octokit migration — existing `gh` path is auth'd + tested; migrating buys nothing |
| Inline ISO-week math | `date-fns` / `dayjs` | Violates zero-new-dep lock; ~6 lines of Date math suffices (D-discretion recommends inline) |
| `Array.join('\n')` render | template-literal blob | Array form makes the ≤50-line guard a trivial `.length` check and keeps fixed key order for deterministic diffs |

**Installation:** None. Zero new dependencies. Add only the `package.json` script:
```json
"e2e:weekly-digest": "node scripts/weekly-digest.mjs"
```
And add `scripts/weekly-digest.mjs` to the `lint` script's explicit file list (package.json line 19 currently enumerates each linted script).

**Version verification:** `gh` 2.83.1 [VERIFIED: `gh --version`, 2025-11-13 release]; Node 24.11.1 [VERIFIED]; git 2.43.0 [VERIFIED]; vitest ^3.0.0 + @playwright/test 1.60.0 [VERIFIED: package.json]. No registry installs needed.

## Package Legitimacy Audit

> Phase installs **zero external packages**. No registry fetch occurs.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | N/A — zero new deps |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All capabilities are satisfied by the installed `gh`/`git` CLIs and Node built-ins. No `npm install` step exists in this phase, so the legitimacy gate is vacuously satisfied.

## Architecture Patterns

### System Architecture Diagram

```
                  Monday 07:00 UTC cron  /  workflow_dispatch
                              │
                              ▼
            ┌─────────────────────────────────────────┐
            │ .github/workflows/e2e-weekly-digest.yml  │
            │  permissions: contents:write,            │
            │               discussions:write          │
            └─────────────────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────────────┐
        ▼                     ▼                              ▼
 [checkout@v4]      [setup-node@v4]            [gh label create e2e-digest --force]
        │                     │                              │
        └─────────────────────┴──────────────────────────────┘
                              │
                              ▼
        env: DIGEST_PUBLISH_MODE=issue, GITHUB_REPOSITORY, GH_TOKEN
                              │
                              ▼
            ┌─────────────────────────────────────────┐
            │ node scripts/weekly-digest.mjs           │
            │  (isMain guard; injects real ghClient+now)│
            └─────────────────────────────────────────┘
                              │
   ┌──────────────┬───────────┼────────────────┬───────────────────┐
   ▼              ▼           ▼                ▼                   ▼
validate       gh api       readLedger()    computeIsoWeek(now)  aggregate
SUMMARY_KEYS   issues       monthlyTotal     → "2026-W22"         (5 metrics)
(throw on      --label      vs HARD_CAP                            │
 missing)      e2e-nightly  (graceful if                          │
   │           +e2e-        absent → "cost                        │
   │           quarantine   data unavailable")                    │
   │              │                                                │
   └──────────────┴────────────────┬───────────────────────────────┘
                                    ▼
                       renderMarkdown(...) → lines[]  (≤50 guard)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                            ▼
 write reports/             DIGEST_PUBLISH_MODE branch    (auto: probe
 weekly-digest-                     │                      has_discussions)
 2026-W22.md           ┌────────────┴────────────┐
        │              ▼                          ▼
        │       mode=issue                 mode=discussion (dormant)
        │   gh issue create               gh api graphql:
        │   --label e2e-digest             1. repo.id + discussionCategories
        │   --title ... --body-file -      2. createDiscussion mutation
        │              │                          │
        └──────────────┴──────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────┐
        │ workflow commit-in-run step (NET-NEW):    │
        │  git add reports/weekly-digest-*.md       │
        │  git commit -m "...[skip ci]"             │
        │  git push   (idempotent overwrite, D-11)  │
        └─────────────────────────────────────────┘
```

### Recommended Project Structure
```
scripts/
└── weekly-digest.mjs           # NEW — pure-fn core + thin CLI shim (D-13)
tests/e2e/
├── lib/llm-report.js           # EDIT — add SUMMARY_KEYS export (D-01)
├── fixtures/
│   └── phase37-digest-issues.json   # NEW — mock issue set for D-14 test
└── scripts/
    └── e2e-weekly-digest.test.js     # NEW — mock-gh vitest (D-14)
reports/                        # NEW dir — committed digests (D-10/D-11)
└── weekly-digest-YYYY-WNN.md   # generated per run
.github/workflows/
└── e2e-weekly-digest.yml       # NEW — Monday cron (D-09/D-11)
```

### Pattern 1: Injected-deps pure-core + thin CLI shim (D-13)
**What:** Module exports pure functions (aggregation, render, ISO-week, validation) plus a `runDigest({ ghClient, now, publishMode, repo, ledgerPath })` orchestrator. CLI shim at bottom guarded by `isMain` constructs the REAL `ghClient` + `now: () => new Date()` and calls `runDigest`.
**When to use:** Every script in this repo (rerun-validator, triage-classifier, quarantine-append, run-triage-pipeline) uses it. It is the unit-test isolation contract.
**Example:**
```javascript
// Source: scripts/quarantine-append.mjs:123, e2e-triage-classifier.mjs:237
const now = opts.now ?? (() => new Date());
// ... pure logic uses now() ...

// isMain guard — WR-02 (Windows-safe): scripts/run-triage-pipeline.mjs:220
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) { /* construct real ghClient, call runDigest, exit */ }
```

### Pattern 2: `gh api` issue read by label (D-03)
**What:** Read open issues filtered by label via the REST issues endpoint, `--paginate` unconditionally.
**When to use:** The aggregation read path.
**Example:**
```javascript
// Source: scripts/e2e-report-issue.mjs:481 (makeRealGhClient.listOpenNightlyIssues)
// One call per label; merge results. --paginate avoids page-2 misses (T-29-02-5).
const raw = execSync(
  `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
);
const issues = JSON.parse(raw);  // array; each issue has .labels[], .created_at, .updated_at
```
Each issue object carries `labels: [{name, color, ...}]`, `created_at` (ISO-8601), `title`. The **classification/errorClass** comes from the label `name` values stamped by Phase 34/35 (the `category` label is the first element of the `[category, 'e2e-nightly', 'triage']` ordered label array — see e2e-report-issue.mjs:504). Top-3 (D-16) tallies these category label names.

### Pattern 3: Label self-bootstrap in workflow (D-07)
**What:** `gh label create <name> --color <6hex-no-#> --force 2>/dev/null || true`.
**When to use:** First workflow step group, so the label exists before issue create.
**Example:**
```yaml
# Source: .github/workflows/e2e-nightly.yml:97-105, 255-267
- name: Ensure e2e-digest label exists
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    gh label create "e2e-digest" \
      --color "<HEX>" \
      --description "Weekly analytics digest" \
      --force 2>/dev/null || true
```
**Color discretion:** pick a hex distinct from `0075ca` (e2e-nightly) and `d93f0b` (e2e-quarantine). E.g. `5319e7` (purple) or `0e8a16` (green). 6 hex chars, NO `#` prefix (gh CLI requirement — see e2e-nightly.yml:104 comment).

### Pattern 4: ISO-week computation, zero-dep (D-10)
**What:** Compute `YYYY-Www` per ISO-8601 (week 1 = week containing first Thursday; weeks start Monday). The ISO **year** can differ from the calendar year at year boundaries — must use the ISO-year, not `getUTCFullYear()`.
**Example (verified algorithm):**
```javascript
// Source: ISO-8601 week-date standard (the canonical "Thursday" algorithm).
// [CITED: en.wikipedia.org/wiki/ISO_week_date#Calculating_the_week_number]
function isoWeekParts(date) {
  // Copy to UTC midnight to avoid DST/TZ drift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7 (getUTCDay() Sun=0..Sat=6).
  const dayNum = d.getUTCDay() || 7;
  // Shift to the Thursday of this ISO week (Thursday determines the ISO year).
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  // Week number = ceil(days since Jan 1 of ISO year / 7).
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { isoYear, weekNo };
}
function isoWeekLabel(date) {
  const { isoYear, weekNo } = isoWeekParts(date);
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;  // "2026-W22"
}
```
**Verify in test (D-discretion):** known fixtures — `2026-01-01` (Thu) → `2026-W01`; `2027-01-01` (Fri) → `2026-W53` (belongs to prior ISO year); `2026-12-31` → check boundary. This boundary case (calendar year ≠ ISO year) is exactly why the inline helper must shift to Thursday before reading the year.

### Pattern 5: Markdown render as line array → ≤50-line guard (D-04)
**What:** Build the digest as `const lines = [...]; const md = lines.join('\n');`. The guard is `if (md.split('\n').length > 50) throw new Error(...)` (or assert in test).
**Why:** Fixed key order = deterministic git diffs (mirrors quarantine-append's `formatEntry` Pitfall-4 rationale). Line count is trivially checkable. Keep the classification breakdown as a compact markdown table; budget ~5 header + 7 classification rows + 5 top-3/quarantine/cost lines ≈ well under 50.

### Anti-Patterns to Avoid
- **Silent-zero on missing SUMMARY_KEY:** D-02/DIGEST-04 require a THROW naming the key. Do NOT default-fill a missing key to 0 — that masks schema drift (Pitfall 17 in SUMMARY.md).
- **Per-iteration enumeration in the digest:** D-04 forbids it; digest is aggregated only (Pitfall 18).
- **Throwing when the ledger is absent:** D-15 — the ledger is local-only/gitignored and WILL be absent in CI. Catch and render `cost data unavailable`. (`readLedger()` already returns `{version:1, months:{}}` on any read failure, so `monthlyTotal` returns 0 — but 0 is NOT "unavailable"; detect file-absence explicitly to distinguish $0 spend from no-ledger.)
- **Short-circuiting one of the two label reads:** read BOTH `e2e-nightly` and `e2e-quarantine` unconditionally (mirrors Pitfall-3 dual-search rationale in e2e-report-issue.mjs:316).
- **Interpolating workflow inputs into `run:` shell:** use the env-var hop (CWE-94) per e2e-nightly.yml:116 / e2e-ingest-llm-report.yml:46. Even though this workflow has fewer inputs, follow the established convention.
- **Setting `E2E_LEDGER_PATH_OVERRIDE` in the workflow:** llm-ledger.js:85 THROWS in CI if this is set. Do not set it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue read by label | Custom HTTP/octokit client | `gh api repos/{repo}/issues -f labels=… --paginate` | Already auth'd, paginated, mock-tested (e2e-report-issue.mjs:481) |
| GraphQL discussion create | Raw fetch to GraphQL endpoint | `gh api graphql -f query='…' -F field=…` | gh handles auth + JSON; same shellout surface as REST |
| Issue create | Custom POST | `gh issue create --label e2e-digest --body-file -` | Reuse e2e-report-issue.mjs:492 idiom; `--body-file -` avoids shell-quoting the body |
| Cost/cap math | Re-read ledger JSON manually | `readLedger()` + `monthlyTotal()` + `HARD_CAP_USD` | Already handles corrupt/missing → empty ledger; 6dp float-drift rounding |
| Summary contract | Hard-code 7 keys in digest | import `SUMMARY_KEYS` from llm-report.js | D-01 single-source-of-truth; prevents Pitfall 17 drift |
| ISO-week | date library | ~10-line inline helper (Pattern 4) | Zero-dep lock; deterministic + test-injectable |

**Key insight:** This phase is almost entirely *composition* of existing primitives. The only genuinely net-new code is (a) the `SUMMARY_KEYS` extraction, (b) the ISO-week helper, (c) the aggregation/render pure functions, (d) the GraphQL discussion shellout, and (e) the workflow's commit-in-run step. Everything else is a copy-paste-adapt of Phase 29–36 patterns.

## Runtime State Inventory

> Phase 37 is greenfield-additive (new script, new workflow, new committed dir) — not a rename/refactor. This section is included only to record the two pieces of *external/runtime* state the planner must account for.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | GitHub Issues labeled `e2e-nightly` / `e2e-quarantine` are the read corpus (the persistence layer per D-03). These accumulate from Phase 36 nightly runs. | None — read-only consumption. Digest does NOT mutate them. |
| Live service config | `e2e-digest` label must exist on the repo before first issue-fallback publish. | Self-bootstrapped in-workflow (D-07) — no manual action. |
| OS-registered state | GitHub Actions cron schedule `0 7 * * 1` registered when workflow file lands on default branch. | None beyond merging the workflow. Note: GitHub disables scheduled workflows after 60 days of repo inactivity. |
| Secrets/env vars | `GITHUB_TOKEN` (auto-provided by Actions); `GITHUB_REPOSITORY` (auto); `DIGEST_PUBLISH_MODE` (workflow-set to `issue`). The `.llm-spend-ledger.json` is gitignored — ABSENT in CI (drives D-15 graceful path). | Set `DIGEST_PUBLISH_MODE: issue` in workflow env. Do NOT set `E2E_LEDGER_PATH_OVERRIDE` (throws in CI). |
| Build artifacts | None — no compiled output; `reports/` dir is committed markdown only. | Create `reports/` dir (the commit step creates it implicitly via `git add`). |

**Discussions enablement (verified):** `has_discussions: false` at phase start. The `discussion` branch is dormant but fully implemented+tested (D-08). No data migration.

## Common Pitfalls

### Pitfall 1: ISO year ≠ calendar year at boundaries
**What goes wrong:** Filename `weekly-digest-2027-W01.md` for a Jan-1-2027 run that is actually ISO week 53 of 2026 → wrong/colliding filename.
**Why it happens:** Using `date.getUTCFullYear()` for the year part instead of the ISO-year (the year of the week's Thursday).
**How to avoid:** Shift to Thursday FIRST, then read the year (Pattern 4). Test the `2027-01-01 → 2026-W53` boundary.
**Warning signs:** Off-by-one week numbers near year boundaries; a "W53" or "W01" that straddles December/January.

### Pitfall 2: `monthlyTotal` returns 0 for BOTH "$0 spent" and "no ledger"
**What goes wrong:** Rendering `$0.00 / $100 (0%)` in CI where the ledger simply doesn't exist, instead of `cost data unavailable` (D-15).
**Why it happens:** `readLedger()` swallows file-absence and returns an empty ledger; `monthlyTotal` then returns 0 indistinguishably from a real $0 month.
**How to avoid:** Explicitly `fs.existsSync(LEDGER_PATH)` (or catch the read) BEFORE calling `monthlyTotal`. If absent → render `cost data unavailable`. Only call `monthlyTotal` when the file exists.
**Warning signs:** Cost line shows `$0.00 / $100` on every CI digest.

### Pitfall 3: Commit-in-run is net-new — credential + loop hazards
**What goes wrong:** (a) `git push` fails with auth error; (b) the commit re-triggers `ci.yml` (which runs on push to default branch) creating noise or loops; (c) push races with another commit (non-fast-forward).
**Why it happens:** No prior workflow in this repo commits in-run, so there's no copy-able idiom. `actions/checkout@v4` defaults to `persist-credentials: true`, so the `GITHUB_TOKEN` IS configured for push — but the commit author must be set and `[skip ci]` added.
**How to avoid:** Standard GitHub-recommended idiom:
```yaml
- name: Commit weekly digest
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add reports/weekly-digest-*.md
    git diff --cached --quiet || git commit -m "docs(weekly-digest): ${{ env.WEEK_LABEL }} [skip ci]"
    git push
```
`git diff --cached --quiet || git commit` makes it a no-op when nothing changed (idempotent re-run, D-11). `[skip ci]` prevents `ci.yml` from firing on the bot push. Because the digest filename is week-stamped and the script overwrites it, re-running the same week is idempotent.
**Warning signs:** Workflow run shows a `ci.yml` run triggered by the bot commit; "nothing to commit" errors; non-fast-forward push rejections (rare for weekly cadence).

### Pitfall 4: GraphQL `createDiscussion` needs a categoryId, not a name
**What goes wrong:** The dormant `discussion` branch fails because `createDiscussion` requires `categoryId` (a node ID), not a category name — and the repo node `id` too.
**Why it happens:** GraphQL mutations take opaque node IDs. You must first query `repository(owner, name){ id discussionCategories(first:10){nodes{id name}} }` and match by name.
**How to avoid (D-discretion recommendation):** Two-step: (1) `gh api graphql -f query='query{repository(owner:"O",name:"N"){id discussionCategories(first:25){nodes{id name}}}}'`, parse, match the desired category (e.g. "Announcements" or "General") by name → get `repoId` + `categoryId`; (2) `gh api graphql -f query='mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{url}}}' -F r=$repoId -F c=$categoryId -F t="$title" -F b="$body"`.
**Warning signs:** `Could not resolve to a node with the global id` or `Argument 'categoryId' has an invalid value`. Since this path is dormant (Discussions off), failures only surface in the mock-gh test — which is exactly why D-08 mandates BOTH branches be tested.

### Pitfall 5: Forgetting to add the new script to the lint allowlist
**What goes wrong:** `npm run lint` (package.json:19) enumerates each linted script explicitly; a new `scripts/weekly-digest.mjs` not added there is silently un-linted, and CI `test` gate may miss it.
**How to avoid:** Add `scripts/weekly-digest.mjs` to the `lint` script's file list when adding the file.
**Warning signs:** Lint passes but the new file has never been checked.

### Pitfall 6: `e2e-quarantine` issues are ALSO `e2e-nightly`-adjacent — double-counting
**What goes wrong:** Findings count or classification breakdown double-counts an issue that carries both labels.
**Why it happens:** Reading two label sets and concatenating without dedup by issue number.
**How to avoid:** Merge the two issue arrays and dedup by `issue.number` before aggregating the overall findings count. Quarantine growth (D-12) is specifically the count of `e2e-quarantine` issues *opened in the window* — that's a deliberately separate metric, computed from `created_at` within the 7-day window, and is fine to count on the quarantine subset.
**Warning signs:** Findings count exceeds the actual open-issue count.

## Code Examples

### GraphQL discussion create via gh (dormant path)
```javascript
// Source: gh CLI `gh api graphql` + GitHub GraphQL createDiscussion mutation.
// [CITED: docs.github.com/en/graphql/reference/mutations#creatediscussion]
// Step 1 — resolve repo node id + category id by name:
const lookupQ = `query($o:String!,$n:String!){repository(owner:$o,name:$n){id discussionCategories(first:25){nodes{id name}}}}`;
const lookupRaw = execSync(
  `gh api graphql -f query='${lookupQ}' -F o=${owner} -F n=${name}`,
  { encoding: 'utf8' }
);
const { data } = JSON.parse(lookupRaw);
const repoId = data.repository.id;
const categoryId = data.repository.discussionCategories.nodes
  .find(c => c.name === DISCUSSION_CATEGORY)?.id;
// Step 2 — createDiscussion (body via -F to avoid shell-quoting):
const mutation = `mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{url}}}`;
execSync(`gh api graphql -f query='${mutation}' -F r=${repoId} -F c=${categoryId} -F t="$T" -F b=@-`,
  { input: body, encoding: 'utf8' });  // -F b=@- reads body from stdin
```
**Note [ASSUMED]:** the exact `-F b=@-` stdin idiom for `gh api graphql` body fields should be verified against `gh api --help` during planning; an alternative is `-f body="$body"` with a temp file. The mutation/query *shape* is [CITED] from GitHub GraphQL docs.

### Issue-fallback publish (active path)
```javascript
// Source: scripts/e2e-report-issue.mjs:492 (createIssue idiom)
const title = `[e2e-digest] Weekly analytics ${weekLabel}`;  // e.g. 2026-W22
execSync(`gh issue create --title "${title.replaceAll('"','\\"')}" --label e2e-digest --body-file -`,
  { input: markdownBody, encoding: 'utf8' });
```

### auto-mode discussions probe (D-06)
```javascript
// Source: CONTEXT.md gate command — gh api repos/{repo} --jq .has_discussions
const hasDiscussions = JSON.parse(
  execSync(`gh api repos/${repo} --jq .has_discussions`, { encoding: 'utf8' }).trim()
);
const mode = DIGEST_PUBLISH_MODE === 'auto'
  ? (hasDiscussions ? 'discussion' : 'issue')
  : DIGEST_PUBLISH_MODE;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Discussions via REST | GraphQL-only (`createDiscussion`) | GitHub never shipped a REST createDiscussion | Must use `gh api graphql`; no REST equivalent [CITED: SUMMARY.md primary source "no REST equivalent confirmed"] |
| `actions/checkout` default credentials | `persist-credentials: true` (still the v4 default) | stable | The default checkout token can push with `contents: write`; no PAT needed for in-run commit |

**Deprecated/outdated:** none relevant. `gh` 2.83.1 is current (2025-11-13). Node 24 LTS-era. No deprecation flags for the APIs used.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SUMMARY_KEYS` is net-new (no existing exported key array) | §SUMMARY_KEYS | LOW — verified by reading llm-report.js; keys exist only inside `emptySummary()` + `classificationToSummaryKey()`. If a sibling already exports it, reuse instead. |
| A2 | The category/errorClass for top-3 lives in the issue's label `name` (first of `[category,'e2e-nightly','triage']`) | §Pattern 2 / D-16 | MEDIUM — derived from e2e-report-issue.mjs:504 label ordering; planner should confirm against an actual filed issue or the buildIssuePayload labels output during planning. |
| A3 | `gh api graphql -F b=@-` (or `-f body=`) is the correct body-passing idiom | §Code Examples GraphQL | MEDIUM — mutation shape is CITED; the exact gh stdin flag should be confirmed via `gh api --help`. Path is dormant so only the mock-gh test exercises it. |
| A4 | `actions/checkout@v4` default `persist-credentials: true` lets `GITHUB_TOKEN` push with `contents: write` | §Pitfall 3 | LOW — long-standing GitHub-documented default; widely used. Confirm no org policy disables it. |
| A5 | GitHub Issues `created_at` is the right field for "opened in window" quarantine growth (D-12) | §Pitfall 6 | LOW — REST issues payload includes `created_at` (ISO-8601). Standard. |
| A6 | Discussions remain OFF at execution time | §Runtime State | LOW — verified `has_discussions: false`; if an admin enables them before merge, `mode=issue` still forces the issue path (no behavior change). |

## Open Questions

1. **Which discussion category should the dormant path target?**
   - What we know: `createDiscussion` needs a `categoryId`; categories are repo-configured (Announcements, General, Q&A, etc.).
   - What's unclear: which category name to match by — repo currently has Discussions OFF so no categories exist yet.
   - Recommendation: make the category name a constant (default `"General"`) in weekly-digest.mjs; the mock-gh test returns a synthetic categories list so the branch is exercised regardless. Document that enabling Discussions requires a matching category name.

2. **Should the digest dedup issues across the two labels for the overall findings count?**
   - What we know: an issue can carry both labels.
   - What's unclear: whether D-03's "findings count" means distinct issues or per-label sum.
   - Recommendation: dedup by `issue.number` for the headline findings count; keep quarantine-growth as a separate `e2e-quarantine`-only metric (Pitfall 6). Surface this in the plan as an explicit aggregation rule.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | issue read + publish + GraphQL | ✓ | 2.83.1 | — (auth'd via GITHUB_TOKEN in CI) |
| `git` CLI | commit-in-run (D-11) | ✓ | 2.43.0 | — |
| Node | runtime | ✓ | 24.11.1 | — |
| `vitest` | tests | ✓ | ^3.0.0 (devDep) | — |
| `.llm-spend-ledger.json` | cost-vs-cap (D-15) | ✗ in CI (gitignored, local-only) | — | render `cost data unavailable` (D-15 graceful path — by design) |
| GitHub Discussions enabled | dormant discussion path | ✗ (`has_discussions:false`) | — | Issue fallback (`e2e-digest` label) — ACTIVE path (D-05) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** ledger (→ graceful "cost data unavailable"); Discussions (→ issue fallback). Both are *expected* absences with locked-decision fallbacks, not blockers.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 [VERIFIED: package.json] |
| Config file | default (root `vitest run` via `test:src`); script tests live under `tests/e2e/scripts/` |
| Quick run command | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` |
| Full suite command | `npm run test` (build + test:src + chrome + firefox + lint + test:lint) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIGEST-04 | `SUMMARY_KEYS` exported + frozen; `emptySummary()` built from it | unit | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js -t SUMMARY_KEYS` | ❌ Wave 0 |
| DIGEST-04 | missing-key → descriptive throw naming the key (no silent zero) | unit | `... -t "missing-key throws"` | ❌ Wave 0 |
| DIGEST-04 | rendered markdown ≤50 lines | unit | `... -t "<=50 lines"` | ❌ Wave 0 |
| DIGEST-01 | aggregation: 5 metrics present (findings count, classification table, top-3, quarantine growth, cost vs cap) | unit (mock-gh) | `... -t "five aggregations"` | ❌ Wave 0 |
| DIGEST-03 | `DIGEST_PUBLISH_MODE=issue` dispatches `gh issue create --label e2e-digest`; `=discussion` dispatches `gh api graphql createDiscussion` | unit (mock-gh) | `... -t "both publish branches"` | ❌ Wave 0 |
| DIGEST-03 | ISO-week label correct incl. year-boundary (`2027-01-01→2026-W53`) | unit | `... -t "iso-week"` | ❌ Wave 0 |
| DIGEST-15 | ledger-absent → `cost data unavailable` (not throw) | unit | `... -t "cost data unavailable"` | ❌ Wave 0 |
| DIGEST-02/09/11 | workflow YAML: cron `0 7 * * 1`, `contents:write`+`discussions:write`, label-ensure step, commit step | grep/YAML | `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js -t "workflow yaml"` (read-file + regex) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/e2e/scripts/e2e-weekly-digest.test.js`
- **Per wave merge:** `npm run test:src && npm run lint`
- **Phase gate:** `npm run test` green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/scripts/e2e-weekly-digest.test.js` — covers DIGEST-01/03/04 + ISO-week + cost-graceful + YAML-grep (the D-14 suite)
- [ ] `tests/e2e/fixtures/phase37-digest-issues.json` — mock issue set: mix of `e2e-nightly` + `e2e-quarantine` labels, varied `category` labels (for top-3 tally + ties), varied `created_at` (in/out of window), at least one dual-labeled issue (dedup test)
- [ ] mock-gh bash shim — reuse the Phase 36 pattern (e2e-run-triage-pipeline.test.js:75-89): answers `gh api repos/.../issues` with the fixture JSON, `gh api graphql` with synthetic repo/category nodes, `gh issue create` with a URL, `gh api repos/{repo} --jq .has_discussions` for auto-mode; logs all argv to a transcript for branch assertions
- [ ] Framework install: none — vitest already present

**Test design notes (from D-14):**
- The mock-gh shim must distinguish `gh api repos/{repo}/issues` (return fixture array) from `gh api repos/{repo} --jq .has_discussions` (return bool) from `gh api graphql` (return repo/category nodes). Branch on `$2`/argument content as the Phase 36 shim branches on `$1`/`$2`.
- Inject `now: () => new Date('2026-05-25T00:00:00Z')` to pin the window + ISO-week deterministically.
- For "both publish branches": run `runDigest` twice with `DIGEST_PUBLISH_MODE=issue` then `=discussion`, assert the transcript contains `issue create` resp. `graphql ... createDiscussion`.
- SUMMARY_KEYS export test: `import { SUMMARY_KEYS } from llm-report.js`; assert `Object.isFrozen(SUMMARY_KEYS)`, length 7, and that `emptySummary()`'s keys === `SUMMARY_KEYS` (single-source proof).

## Security Domain

> `security_enforcement` not present in config.json → treat as enabled. This is a CI tooling phase (no user-facing surface, no auth flows) but it DOES shell out to `gh`/`git` with a write-scoped token and interpolate values into shell — so input-validation + injection controls are the relevant categories.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | GITHUB_TOKEN auto-provided by Actions; no custom auth |
| V3 Session Management | no | — |
| V4 Access Control | yes (workflow) | Minimal `permissions:` block — ONLY `contents: write` + `discussions: write`; no `issues: write` unless the issue-fallback create requires it (it does — issue create needs `issues: write`; ADD it). Re-verify the permission set covers issue create. |
| V5 Input Validation | yes | Issue label/category strings flow into shell; clamp/escape. Workflow inputs (if any) via env-var hop (CWE-94, e2e-nightly.yml:116). |
| V6 Cryptography | no | — |

**Permission note (planner action):** D-09 locks `contents: write` + `discussions: write`. But the ACTIVE path is **issue create**, which needs `issues: write`. The planner MUST add `issues: write` to the workflow permissions, otherwise the active issue-fallback publish fails with 403. (CONTEXT.md D-09 omitted it because the requirement text framed the dormant discussion path as primary.)

### Known Threat Patterns for {gh/git shellout in CI}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection via issue title/label/category in `gh issue create` | Tampering / Elevation | `.replaceAll('"','\\"')` on title (e2e-report-issue.mjs:495); clamp category to known label set; body via `--body-file -` / stdin (never interpolated) |
| Workflow-input injection (CWE-94) in `run:` | Elevation | env-var hop for any `${{ inputs.* }}` (e2e-nightly.yml:116, e2e-ingest:46) |
| In-run commit pushes attacker-controlled markdown | Tampering | Digest body is machine-generated from issue labels (closed taxonomy) + numeric counts; no free-form user text reaches the committed file beyond escaped issue titles. Wrap any reflected strings as code/escape. |
| GraphQL query string injection | Tampering | Pass dynamic values via `-F`/`-f` variable bindings, NOT string-concatenated into the query (Code Examples use `$r/$c/$t/$b` variables). |
| Ledger override bypass in CI | Elevation | `E2E_LEDGER_PATH_OVERRIDE` throws in CI by design (llm-ledger.js:85) — do NOT set it. |

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `tests/e2e/lib/llm-report.js`, `tests/e2e/lib/llm-ledger.js`, `scripts/e2e-report-issue.mjs`, `scripts/run-triage-pipeline.mjs`, `scripts/quarantine-append.mjs`, `tests/e2e/scripts/e2e-run-triage-pipeline.test.js`, `.github/workflows/e2e-nightly.yml`, `.github/workflows/e2e-ingest-llm-report.yml`, `.github/workflows/release.yml`, `tests/e2e/lib/error-codes.js`, `package.json`
- `.planning/phases/37-weekly-analytics-digest/37-CONTEXT.md` — 16 locked decisions
- `.planning/REQUIREMENTS.md` §DIGEST — DIGEST-01..04
- `.planning/research/SUMMARY.md` §"Phase 6" — weekly digest design + "GraphQL createDiscussion, no REST equivalent" + Pitfalls 17/18
- Tool versions: `gh --version` (2.83.1), `node --version` (24.11.1), `git --version` (2.43.0) — VERIFIED in session

### Secondary (MEDIUM confidence)
- ISO-8601 week-date algorithm (the canonical Thursday-shift) — standard, widely-implemented [CITED: ISO week date spec]
- GitHub GraphQL `createDiscussion` mutation shape (repositoryId + categoryId + title + body) [CITED: GitHub GraphQL docs, also confirmed in SUMMARY.md primary sources]

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Exact `gh api graphql` body-passing flag (`-F b=@-` vs `-f body=`) — confirm via `gh api --help` (A3)
- Issue-label-as-classification-source ordering (A2) — confirm against a real filed issue's labels

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all primitives read directly from existing code; tool versions verified in-session
- Architecture: HIGH — every pattern traced to a specific file:line in Phases 29–36
- Pitfalls: HIGH — derived from direct code inspection (ledger 0-vs-absent, ISO-year boundary, lint allowlist, label dedup) + one MEDIUM (commit-in-run is net-new, so the idiom is GitHub-standard rather than repo-proven)

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (30 days — stable CI tooling domain; `gh`/`git`/Node versions pinned)

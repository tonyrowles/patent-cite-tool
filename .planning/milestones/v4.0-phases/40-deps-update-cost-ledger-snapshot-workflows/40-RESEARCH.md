# Phase 40: Deps-Update + Cost-Ledger-Snapshot Workflows - Research

**Researched:** 2026-05-31
**Domain:** GitHub Actions workflow design — scheduled dep-update automation + atomic self-commit pattern for a versioned ledger file
**Confidence:** HIGH (all critical claims grounded in committed files: Phase 39 SUMMARY, e2e-weekly-digest.yml, llm-ledger.js, e2e-weekly-digest-yaml.test.js, CODEOWNERS, package.json, PITFALLS.md Pitfall 6)

## Summary

Phase 40 ships two new `v40-*.yml` workflows on top of the Phase 39 foundation (committed ledger + branch-protection ruleset already active on `main`):

1. **`v40-deps-update.yml`** (weekly Mon 09:00 UTC + dispatch) — calls `scripts/check-deps-and-pr.mjs`, which queries `npm outdated --json` filtered to a frozen 6-package watchlist, cross-references `npm audit --json`, and emits up-to-three PRs via two invocations of `peter-evans/create-pull-request@v8`: one per security-flagged package, and one grouped minor-bump PR.
2. **`v40-cost-ledger-snapshot.yml`** (daily 02:00 UTC + dispatch) — mirrors `e2e-weekly-digest.yml` lines 98-110 *verbatim* to atomically `[skip ci]`-commit `tests/e2e/.llm-spend-ledger.json` with a grep-friendly summary message.

Two non-obvious design points dominate:

- **`@anthropic-ai/sdk` is on the watchlist for monitoring, not auto-PR.** The script must `continue` on this package and write a structured note to `tests/e2e/.manual-sdk-bumps.json` (queryable by future weekly-digest extensions). Direct REQUIREMENTS.md exclusion: "Anthropic SDK 0.100.1 auto-bumping — pinned via exact version (not caret); excluded from `v40-deps-update.yml` watchlist; manual review required for SDK bumps." The watchlist *contains* the name so `npm outdated` reports drift; the script short-circuits.
- **Verifier-frozen pre-flight (DEPS-04, Pitfall 6 defense)** demands a SEPARATE pinned `pdfjs-dist` so an extension-side bump can be tested against the OLD verifier — without this, the verifier's frame-of-reference moves with the bump and any masking regression sails through. The recommended mechanism is a custom `verifierDeps` field in root `package.json` resolved at runtime — no hoisting changes, single source of truth, lowest blast radius.

**Primary recommendation:** Single-file ESM script (`scripts/check-deps-and-pr.mjs`) with a frozen `WATCHLIST` const and a frozen `NEVER_AUTO_BUMP` const; two `peter-evans/create-pull-request@v8` invocations conditional on partition contents; verifier pre-flight runs as a SECOND matrix entry in the deps-update workflow (not the snapshot workflow); required-status-check name is `deps-update-gate` but NOT added to the ruleset in Phase 40 (lowest-coupling — Phase 47 CLEANUP-04 audit adds it together with Phase 41's `verifier-gate`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dep version discovery + partition | Node script (`scripts/check-deps-and-pr.mjs`) | — | Pure data-shaping; same tier as v3.1 `scripts/e2e-*.mjs` |
| PR creation + idempotent branch | GitHub Action (`peter-evans/create-pull-request@v8`) | Workflow YAML | Action handles atomic branch-create/commit/push/PR-open; mature & vetted |
| Cron + dispatch trigger surface | Workflow YAML (`.github/workflows/v40-deps-update.yml`) | — | Mirrors `e2e-weekly-digest.yml` workflow-only ownership |
| Atomic ledger snapshot commit | Workflow YAML (`.github/workflows/v40-cost-ledger-snapshot.yml`) | — | Direct copy of `e2e-weekly-digest.yml:98-110` pattern; no script needed for the commit step itself |
| Snapshot summary string generation | Node inline (`node -e`) reading `llm-ledger.js` | Workflow `$GITHUB_ENV` hop | Same pattern as `e2e-weekly-digest.yml:90-96` `isoWeekLabel` capture |
| Frame-shift pre-flight (verifier-frozen) | Workflow job (matrix-entry) | Verifier package resolution | Workflow controls install of OLD pdfjs into `node_modules-pinned/`; verifier reads `verifierDeps.pdfjs-dist` field |
| YAML-level workflow contract enforcement | Vitest static-grep tests (`tests/e2e/scripts/*-yaml.test.js`) | — | Matches Phase 37 Y1-Y6 test discipline; zero new deps |

## Standard Stack

### Core

| Library / Action | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `peter-evans/create-pull-request` | `v8` (8.1.1) | Atomic branch-create + commit + push + PR-open with idempotent same-branch re-runs | Phase 39 RESEARCH locked this for the v4.0 PR-creation primitive across Phases 40/43/44; mature (10k+ stars); supports `draft`, `labels`, `reviewers`, `title`, `body`, `branch`, `base`, `token`, `signoff` |
| `actions/checkout@v4` | v4 | Repo checkout w/ `persist-credentials: true` (lets GITHUB_TOKEN push under `contents: write`) | Used by `e2e-weekly-digest.yml:49`; consistent project convention |
| `actions/setup-node@v4` | v4 | Node install w/ `node-version-file: '.nvmrc'` | Used by `e2e-weekly-digest.yml:53-56`; matches v3.1 project convention |
| `gh` CLI (preinstalled on `ubuntu-latest`) | bundled | Direct API access for ruleset inspection, label discovery, fallback PR ops | Used throughout v3.1 (e.g., `e2e-weekly-digest.yml:71-75`); zero install cost |
| `npm outdated --json` | bundled (npm 10+) | Per-package current/wanted/latest version reporting against the lockfile | Built-in to npm; emits structured JSON; no new dep |
| `npm audit --json` | bundled (npm 10+) | Vulnerability severity + fix availability per package | Built-in to npm; ESM-script friendly; no new dep |
| `vitest` | `^3.0.0` (already in `devDependencies`) | Unit tests for the partition logic | Phase 39 convention |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `node:fs` / `node:child_process` / `node:path` | Standard library for the script | All file ops + `spawnSync('npm', ['outdated', '--json'])` calls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `peter-evans/create-pull-request@v8` | `gh pr create --draft` (direct CLI) | gh CLI requires manual branch-push step; non-idempotent re-runs create duplicate PRs; loses the action's `committer`/`signoff` polish. Phase 39 CONTEXT explicitly prefers the action for "one PR-creation primitive across Phases 40/43/44". |
| `npm outdated --json` | `npm-check-updates` (ncu) | Extra dev dep; Renovate/Dependabot replacement. Phase 40 CONTEXT explicitly: "Use `npm outdated --json` (not `npm-check-updates` — keep deps minimal; outdated is built-in)." |
| Renovate / Dependabot | — | Out-of-scope per REQUIREMENTS.md: "Renovate/Dependabot adoption — roll-your-own per `peter-evans/create-pull-request@v8` + `npm outdated --json` (cleaner integration with nightly-suite gate)." |
| `tests/e2e/package.json` sub-package | root `package.json` `verifierDeps` field | Sub-package introduces dual-lockfile state; hoisting non-determinism; CI install steps multiply. See "Verifier pdfjs-dist Separation" below. |

### Installation

**No new npm deps.** All required surfaces are already in the repo:
- `@anthropic-ai/sdk@0.100.1` (NEVER-bump)
- `@napi-rs/canvas@1.0.0`
- `@playwright/test@1.60.0` (on watchlist; bare key in script is `playwright`)
- `esbuild@^0.27.3` (on watchlist)
- `eslint@10.4.0`
- `pdfjs-dist@^5.5.207` (on watchlist)
- `sharp@^0.34.5` (on watchlist)
- `vitest@^3.0.0` (on watchlist)

**Version verification:** All package versions above read verbatim from `/home/fatduck/patent-cite-tool/package.json` lines 32-41 [VERIFIED: in-repo file]. The `peter-evans/create-pull-request@v8` lock + 8.1.1 minor pin is documented as a Phase 39 research lock referenced in 40-CONTEXT.md [CITED: 40-CONTEXT.md decisions block].

## Package Legitimacy Audit

**Scope check:** Phase 40 **installs ZERO new packages**. All dependencies needed for the script and workflow already exist in `package.json` (see above). The `@anthropic-ai/sdk@0.100.1` exact-pin is explicitly NEVER-bumped per REQUIREMENTS.md out-of-scope clause. `peter-evans/create-pull-request@v8` is a GitHub Action (not an npm dep) — its provenance is the published action repo, vetted by Phase 39 research.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | n/a | No new installs in Phase 40 |

slopcheck was not run because the gate does not apply to a zero-install phase. **If a future plan introduces a new npm dep in Phase 40**, the planner MUST run the Package Legitimacy Gate protocol before that plan executes and add it as a deviation in the SUMMARY.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────────┐
                    │ Weekly cron (Mon 09:00 UTC) + workflow_dispatch       │
                    └──────────────────────┬───────────────────────────────┘
                                           │
                                           ▼
              ┌──────────────────────────────────────────────────────────────┐
              │ Job: dep-scan                                                │
              │  1. actions/checkout@v4 (persist-credentials: true)          │
              │  2. actions/setup-node@v4 (node-version-file: '.nvmrc')      │
              │  3. npm ci                                                   │
              │  4. node scripts/check-deps-and-pr.mjs                       │
              │       ├─ readWatchlist()  → frozen 6-package list            │
              │       ├─ spawnSync('npm', ['outdated', '--json'])            │
              │       ├─ spawnSync('npm', ['audit',    '--json'])            │
              │       ├─ filter to WATCHLIST                                 │
              │       ├─ for each pkg ∈ NEVER_AUTO_BUMP:                     │
              │       │     write tracking note + skip                       │
              │       ├─ partition: security[] / minor[] / major[]           │
              │       ├─ write partition JSON to $GITHUB_OUTPUT              │
              │       └─ (major bumps → tracking issue only, not auto-PR)    │
              └────────────────┬──────────────────┬──────────────────────────┘
                               │                  │
                  one per pkg  ▼                  ▼  single grouped PR
              ┌─────────────────────┐    ┌──────────────────────────┐
              │ peter-evans/cpr@v8  │    │ peter-evans/cpr@v8       │
              │  (security PR)      │    │  (minor-bumps PR)        │
              │  branch:            │    │  branch:                 │
              │    deps/security-   │    │    deps/minor-2026WW22   │
              │      <pkg>-<ver>    │    │                          │
              │  draft: true        │    │  draft: true             │
              │  labels:            │    │  labels:                 │
              │    dependencies,    │    │    dependencies,         │
              │    security         │    │    minor                 │
              └──────────┬──────────┘    └────────────┬─────────────┘
                         │                            │
                         ▼                            ▼
              ┌───────────────────────────────────────────────────────────┐
              │ Required-status-check: deps-update-gate (NAME ONLY in P40,│
              │   added to v4.0-main-protection ruleset in Phase 47)      │
              │                                                           │
              │   ├─ matrix entry A: full nightly suite on NEW version    │
              │   │     (smoke + 76-case regression + fault-injection)    │
              │   │                                                       │
              │   └─ matrix entry B: verifier-frozen pre-flight           │
              │         (ONLY when bumped pkg == pdfjs-dist)              │
              │         1. install OLD pdfjs into /tmp/old-pdfjs/         │
              │         2. set VERIFIER_PDFJS_PATH=/tmp/old-pdfjs         │
              │         3. run regression suite with verifier reading     │
              │            from VERIFIER_PDFJS_PATH                       │
              │         4. compare citation outputs vs Tier-A baseline    │
              │         5. divergence → BLOCK PR; comment dep-regression  │
              │            suspect                                        │
              └───────────────────────────────────────────────────────────┘


              ┌──────────────────────────────────────────────────────┐
              │ Daily cron (02:00 UTC) + workflow_dispatch           │
              └──────────────────────┬───────────────────────────────┘
                                     │
                                     ▼
          ┌─────────────────────────────────────────────────────────────────┐
          │ Job: ledger-snapshot                                            │
          │  1. actions/checkout@v4 (persist-credentials: true)             │
          │  2. actions/setup-node@v4                                       │
          │  3. (no npm install — only reads JSON)                          │
          │  4. node -e "import('./tests/e2e/lib/llm-ledger.js')..."        │
          │       → exports DAY_DATE, INVOCATIONS, SPEND_USD to $GITHUB_ENV │
          │  5. git config + git add tests/e2e/.llm-spend-ledger.json       │
          │     + git diff --cached --quiet || git commit -m "[skip ci]     │
          │       ledger snapshot YYYY-MM-DD: N invocations, $X.YY spent"   │
          │     + git push                                                  │
          └─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.github/
└── workflows/
    ├── v40-deps-update.yml              # NEW — Mon 09:00 UTC dep-update
    └── v40-cost-ledger-snapshot.yml     # NEW — daily 02:00 UTC ledger snapshot

scripts/
└── check-deps-and-pr.mjs                # NEW — partition + PR-emission CLI

tests/
├── unit/
│   └── check-deps-and-pr.test.js        # NEW — partition logic, SDK skip path
└── e2e/scripts/
    ├── v40-deps-update-yaml.test.js     # NEW — YAML-level static grep (cron, watchlist, gate)
    └── v40-cost-ledger-snapshot-yaml.test.js  # NEW — YAML-level static grep (cron, [skip ci])

package.json                              # MODIFIED — adds verifierDeps field
tests/e2e/.manual-sdk-bumps.json          # NEW — created on first SDK-skip event (gitignored or committed TBD)
```

### Pattern 1: VERBATIM `[skip ci]` self-commit (THE canonical pattern, copy lines 98-110)

**What:** Atomic in-run commit + push of a single file, blocking downstream CI triggers via the `[skip ci]` token.
**When to use:** Any scheduled workflow that mutates a committed artifact.
**Source:** `/home/fatduck/patent-cite-tool/.github/workflows/e2e-weekly-digest.yml:98-110` [VERIFIED: in-repo file]

```yaml
      - name: Commit weekly digest
        # D-11 / DIGEST-03: commit reports/weekly-digest-*.md in-run with [skip ci].
        # git diff --cached --quiet || git commit — idempotent: no-op if unchanged (D-11).
        # [skip ci] is LOAD-BEARING — prevents this bot push from re-triggering ci.yml,
        # which runs on push to the default branch. Without it, each Monday digest would
        # queue a full CI run (RESEARCH Pitfall 3 / T-37-03-02).
        # actions/checkout@v4 persist-credentials: true configures GITHUB_TOKEN for push.
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add reports/weekly-digest-*.md
          git diff --cached --quiet || git commit -m "docs(weekly-digest): ${{ env.WEEK_LABEL }} [skip ci]"
          git push
```

**For Phase 40's `v40-cost-ledger-snapshot.yml`, the planner copies this block VERBATIM**, substituting only:
- `Commit weekly digest` → `Commit daily ledger snapshot`
- `git add reports/weekly-digest-*.md` → `git add tests/e2e/.llm-spend-ledger.json`
- Commit message → `[skip ci] ledger snapshot ${{ env.SNAPSHOT_DATE }}: ${{ env.INVOCATIONS }} invocations, $${{ env.SPEND_USD }} spent` (encoding the day's invocation count + spend total per 40-CONTEXT specifics line 85)

The `git config user.name "github-actions[bot]"` + email lines, `actions/checkout@v4` with default `persist-credentials: true`, the `git diff --cached --quiet || git commit` idempotent guard, and the bare `git push` (no `--force`, no remote argument) are ALL load-bearing — copy unchanged.

### Pattern 2: `peter-evans/create-pull-request@v8` partition invocation (single shared step with conditional inputs)

**What:** Two invocations of the same action, one per partition, each gated on its partition being non-empty.
**When to use:** Distinct PR semantics (security vs minor) that should land in separate PRs but share configuration plumbing.
**Source:** `peter-evans/create-pull-request` README + Phase 39 research lock [CITED: 40-CONTEXT.md "peter-evans/create-pull-request@v8 (8.1.1) is the canonical PR-creation action — per Phase 39 research"]

**Recommended approach — TWO SEPARATE STEPS, NOT ONE WITH A MATRIX:**

```yaml
      - name: Run dep scan + partition
        id: scan
        run: node scripts/check-deps-and-pr.mjs
        # Script writes to $GITHUB_OUTPUT:
        #   security_count=<n>     security_packages=<comma-sep>     security_branch=deps/security-<pkg>-<ver>
        #   minor_count=<n>        minor_packages=<comma-sep>        minor_branch=deps/minor-<isoweek>
        # And writes detailed body markdown to /tmp/security-pr-body.md and /tmp/minor-pr-body.md

      - name: Open security PR (one per security pkg — loop is in the script via matrix file)
        if: steps.scan.outputs.security_count != '0'
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}   # PHASE 40: GITHUB_TOKEN sufficient; GitHub App migration deferred per Pitfall 4 defense
          branch: ${{ steps.scan.outputs.security_branch }}
          base: main
          draft: true
          title: "deps(security): bump ${{ steps.scan.outputs.security_packages }}"
          body-path: /tmp/security-pr-body.md
          labels: dependencies,security
          commit-message: "deps(security): bump ${{ steps.scan.outputs.security_packages }}"
          delete-branch: true       # cleanup on close-without-merge
          signoff: false

      - name: Open grouped minor PR
        if: steps.scan.outputs.minor_count != '0'
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: ${{ steps.scan.outputs.minor_branch }}
          base: main
          draft: true
          title: "deps: weekly minor bumps (${{ steps.scan.outputs.minor_packages }})"
          body-path: /tmp/minor-pr-body.md
          labels: dependencies,minor
          commit-message: "deps: weekly minor bumps"
          delete-branch: true
          signoff: false
```

**Critical inputs (action surface):**
- `token` — REQUIRED. Default `${{ github.token }}` works for same-repo PRs. Defer GitHub App migration to Pitfall 4's defense in Phase 47 audit — for Phase 40 the bot PRs are draft, codeowned, and require human review, so the elevated-privilege concern is addressed by branch protection + draft state.
- `branch` — REQUIRED for idempotency. **Critical:** re-running the workflow with the same `branch` name updates the existing PR rather than creating a new one (the action checks `gh pr list --head <branch>`); the `deps/security-<pkg>-<ver>` name encodes the package + version so a re-run for the same bump is idempotent, but a NEW version produces a NEW branch (and supersedes the prior unmerged one if the older branch is still open — handled by `delete-branch: true` on close).
- `base` — defaults to repo's default branch (`main`); explicit for clarity.
- `draft: true` — REQUIRED per CONTEXT: dep-update PRs are draft until the nightly suite gate flips them ready.
- `body-path` — preferred over `body:` for multi-paragraph content; script writes to `/tmp/*-pr-body.md`.
- `labels` — comma-separated string; action handles label-creation if absent.
- `commit-message` — REQUIRED; the action makes ONE commit per invocation containing all working-tree changes since the prior commit on that branch.
- `delete-branch: true` — auto-deletes the branch when the PR closes (merged or not). Cleans up stale dep-update branches.
- `signoff: false` — explicit; the bot identity in the commit trailer is sufficient.

**Idempotency story (re-runs with same branch name):**
1. Workflow runs again next Monday for `playwright` → script writes the same content into the working tree.
2. Action checks `branch: deps/security-playwright-1.61.0`.
3. If branch exists → action `git fetch`es it, computes diff vs working tree, force-pushes only if there's a meaningful change (the action's internal diff is content-not-commit aware).
4. PR title/body are updated on the existing PR via `gh pr edit`.
5. Net effect: same package + same version = no-op; same package + new version = supersede or new branch (the planner chooses by encoding version in branch name).

### Pattern 3: YAML-level static-grep workflow contract (Y1–Y6 style)

**What:** Vitest tests that read `.github/workflows/*.yml` as plain text and assert exact-token presence.
**When to use:** ANY workflow primitive whose silent omission would be a production bug (cron schedule, permissions block, `[skip ci]` token, required-status-check name).
**Source:** `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` lines 36-83 [VERIFIED: in-repo file]

```js
// Pattern: assertions per workflow primitive
expect(yaml).toContain("cron: '0 9 * * 1'");         // exact-string cron pin
expect(yaml).toContain('workflow_dispatch');         // manual trigger
expect(yaml).toContain('contents: write');           // permissions
expect(yaml).toContain('timeout-minutes: 10');       // timeout pin
expect(yaml).toContain('[skip ci]');                 // load-bearing token
expect(yaml).not.toContain('E2E_LEDGER_PATH_OVERRIDE'); // negative invariant
```

**For Phase 40, two new YAML-test files:**

`tests/e2e/scripts/v40-deps-update-yaml.test.js` asserts:
- D1 — `cron: '0 9 * * 1'` (exact)
- D2 — `workflow_dispatch` present
- D3 — `permissions: contents: write` + `pull-requests: write` + `issues: write` (issues: write for the SDK-skip tracking-issue path)
- D4 — `timeout-minutes` present (recommend 15 — npm ci + script + matrix nightly is < 15 min)
- D5 — Watchlist tokens present (one assertion per package name, asserts the script file content not the workflow itself — see "Watchlist Freeze" below)
- D6 — `peter-evans/create-pull-request@v8` referenced exactly (action+major-version pin)
- D7 — `draft: true` literal present (defense against Pitfall 4)
- D8 — `node scripts/check-deps-and-pr.mjs` invocation present
- D9 — `[skip ci]` NOT present in this workflow (deps-update commits are PR commits, not self-commits)
- D10 — `gh pr merge --auto` NOT present (defense against Pitfall 4)

`tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` asserts:
- S1 — `cron: '0 2 * * *'` (exact)
- S2 — `workflow_dispatch` present
- S3 — `permissions: contents: write` present
- S4 — `timeout-minutes` present (recommend 5 — single file read + commit + push)
- S5 — `git add tests/e2e/.llm-spend-ledger.json` (exact)
- S6 — `git diff --cached --quiet || git commit` (idempotent guard)
- S7 — `[skip ci]` token (LOAD-BEARING)
- S8 — `git push` present
- S9 — `git config user.name "github-actions[bot]"` (exact)
- S10 — `E2E_LEDGER_PATH_OVERRIDE` NOT present (mirrors Phase 37 Y6 guard — see llm-ledger.js:85 CI throw)

### Pattern 4: Watchlist Freeze (mirror PROMPT_SCAFFOLDS pattern)

```js
// scripts/check-deps-and-pr.mjs

/**
 * Phase 40 (DEPS-01) — FROZEN watchlist. Additions require a planning change.
 * Static-grep test pins the exact list. Mirrors Phase 39's PROMPT_SCAFFOLDS
 * registry-freeze pattern (REQUIREMENTS.md PROMPT-03).
 */
const WATCHLIST = Object.freeze([
  'playwright',
  'pdfjs-dist',
  'sharp',
  'vitest',
  'esbuild',
  '@anthropic-ai/sdk',
]);

/**
 * Phase 40 (DEPS-01 + REQUIREMENTS.md out-of-scope clause) — packages that
 * appear on the watchlist for monitoring but MUST NOT be auto-bumped. The
 * SDK is pinned via EXACT (not caret) version; bumps require human review.
 *
 * On detection of an outdated NEVER_AUTO_BUMP package, the script writes a
 * tracking note to tests/e2e/.manual-sdk-bumps.json (queryable by the
 * weekly digest) and `continue`s past PR creation. The package STILL appears
 * in `npm outdated --json` output so drift is visible in the audit trail.
 */
const NEVER_AUTO_BUMP = Object.freeze(['@anthropic-ai/sdk']);

// In the scan loop:
for (const pkg of WATCHLIST) {
  if (NEVER_AUTO_BUMP.includes(pkg)) {
    if (outdated[pkg]) {
      writeManualBumpNote({ pkg, current: outdated[pkg].current, latest: outdated[pkg].latest });
    }
    continue;  // never reaches the partition / PR step
  }
  // ... partition logic
}
```

Vitest test asserts the FROZEN tuple identity:
```js
import { WATCHLIST, NEVER_AUTO_BUMP } from '../../scripts/check-deps-and-pr.mjs';
expect(WATCHLIST).toEqual(['playwright', 'pdfjs-dist', 'sharp', 'vitest', 'esbuild', '@anthropic-ai/sdk']);
expect(Object.isFrozen(WATCHLIST)).toBe(true);
expect(NEVER_AUTO_BUMP).toEqual(['@anthropic-ai/sdk']);
expect(Object.isFrozen(NEVER_AUTO_BUMP)).toBe(true);
```

### Anti-Patterns to Avoid

- **`cron: '*/5 * * * *'` (every 5 min) typo:** Static-grep test must assert the literal `cron: '0 9 * * 1'` for deps-update and `cron: '0 2 * * *'` for snapshot. Phase 38 Pitfall 2 documents the $4,320/month blast radius.
- **`pull_request: synchronize` trigger on deps-update:** Pitfall 2 (PITFALLS.md line 91): "Never `pull_request: synchronize`. Trigger on `issues: labeled` (one event per label add) or `schedule:` with a strict cron format checker." Phase 40 deps-update is `schedule:` + `workflow_dispatch` only.
- **`gh pr merge --auto` from the workflow:** Pitfall 4 defense — would subvert the human-gate trust invariant. YAML-level test D10 asserts absence.
- **`auto-merge: true` literal:** Same defense, different surface.
- **`draft: false` or missing `draft:`:** Pitfall 4 defense #4 — dep-update PRs MUST land as draft until the nightly gate flips them ready.
- **Using a PAT for `peter-evans/create-pull-request`:** Use `secrets.GITHUB_TOKEN` (workflow-scoped) for Phase 40. PAT scope = whole user's repos. Pitfall 1 step 7.
- **Naming `deps-update-gate` in the v4.0-main-protection ruleset NOW:** Phase 41's `verifier-gate` is also unimplemented; naming a non-existent check name blocks every PR. Phase 39 SUMMARY line 149 explicitly RESERVED the slot. Phase 40 does NOT touch the ruleset.
- **Committing a snapshot when nothing changed:** The `git diff --cached --quiet || git commit` guard prevents empty commits, but also yields zero-line commits to the audit trail every day. Per CONTEXT discretion: "always-commit is simpler and the `[skip ci]` prevents downstream impact" — the planner chooses; the recommended path is "always-attempt, guard idempotently" which mirrors weekly-digest exactly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Create draft PR atomically | Hand-rolled `git branch / git push / gh pr create --draft` chain | `peter-evans/create-pull-request@v8` | Handles same-branch re-runs, force-push semantics, body-from-file, label-creation, signoff, cross-fork tokens, GitHub App tokens — every edge case the v3.1-style hand-rolled chain would re-discover |
| Parse outdated deps | Hand-write `npm ls --depth=0` parser | `npm outdated --json` | npm's own JSON output schema is stable across npm 8/9/10; documents `current`, `wanted`, `latest`, `dependent`, `location` |
| Detect vulnerabilities | Maintain a CVE feed | `npm audit --json` | npm's `vulnerabilities` object reports severity (`info` / `low` / `moderate` / `high` / `critical`), `fixAvailable` boolean, `via` chain — built-in and reproducible across versions |
| Skip CI on bot commits | Hand-rolled `[ci skip]` variations | `[skip ci]` literal in commit message | GitHub's documented token; copy from `e2e-weekly-digest.yml:109` |
| Atomic ledger commit | Custom locking | The `git diff --cached --quiet || git commit` + `git push` pattern from `e2e-weekly-digest.yml:108-110` | Idempotent; tolerates no-changes case |
| Frame-shift detection | Custom diff of citation outputs | Run the existing verifier suite with `VERIFIER_PDFJS_PATH=/tmp/old-pdfjs` set | Existing verifier infrastructure; the env var indirection is the whole new mechanism |

**Key insight:** Phase 40 is almost entirely about WIRING existing primitives — the only new code is `check-deps-and-pr.mjs` (≤300 LOC), the two workflow YAMLs (each ≤120 lines), the two YAML-test files (each ≤80 lines), and a one-line `package.json` `verifierDeps` field. Resist any temptation to add a "small helper library" or "lightweight CLI framework"; the script is a single-file ESM CLI matching v3.1 convention (see `scripts.e2e:*` entries in package.json).

## npm CLI JSON Schemas (DEPS-01 + DEPS-03 partition input)

### `npm outdated --json` shape

```json
{
  "<pkg-name>": {
    "current": "<installed-version>",       // e.g., "5.5.207"
    "wanted":  "<max-satisfying-semver>",   // e.g., "5.5.214" (max that satisfies "^5.5.207")
    "latest":  "<latest-published>",        // e.g., "5.6.0"
    "dependent": "<consumer-pkg>",          // e.g., "patent-cite-tool"
    "location": "<absolute-or-relative-path>",
    "type": "devDependencies" | "dependencies" | "peerDependencies"
  },
  ...
}
```

[CITED: npm docs https://docs.npmjs.com/cli/v10/commands/npm-outdated]

**Semver category derivation (from `current` → `latest`):**
- `major`: `semver.major(latest) > semver.major(current)`
- `minor`: `semver.major(latest) === semver.major(current) && semver.minor(latest) > semver.minor(current)`
- `patch`: `semver.major(latest) === semver.major(current) && semver.minor(latest) === semver.minor(current) && semver.patch(latest) > semver.patch(current)`

**No `semver` dep needed** — Node 18+ has a built-in `node:util` but not semver parsing; for Phase 40 use string split + parseInt (the watchlist is 6 packages and standard semver, not pre-releases). If complexity grows in Phase 43+, revisit.

**`npm outdated` exit codes:** Returns exit code 1 if any package is outdated. Script must use `spawnSync` with no `throwOnExit` (or wrap in try/catch); a non-zero exit code is the EXPECTED case.

### `npm audit --json` shape (npm 7+)

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "<pkg-name>": {
      "name": "<pkg-name>",
      "severity": "info" | "low" | "moderate" | "high" | "critical",
      "isDirect": true | false,
      "via": [ "<advisory-or-pkg>", ... ],
      "effects": [ "<dependent-pkg>", ... ],
      "range": "<vulnerable-version-range>",
      "nodes": [ "<paths>" ],
      "fixAvailable": { "name": "<pkg>", "version": "<fix-version>", "isSemVerMajor": true|false }
                     | false
    }
  },
  "metadata": {
    "vulnerabilities": { "info": N, "low": N, "moderate": N, "high": N, "critical": N, "total": N },
    "dependencies": { ... }
  }
}
```

[CITED: npm docs https://docs.npmjs.com/cli/v10/commands/npm-audit]

**Partition logic (Phase 40 CONTEXT lock — severity ≥ moderate goes to security PR):**
```js
const audit = JSON.parse(spawnSync('npm', ['audit', '--json']).stdout);
const securitySet = new Set(
  Object.entries(audit.vulnerabilities || {})
    .filter(([, v]) => ['moderate', 'high', 'critical'].includes(v.severity))
    .filter(([, v]) => v.fixAvailable !== false)            // only auto-PR if a fix exists
    .filter(([, v]) => !v.fixAvailable.isSemVerMajor)        // major-bump fixes go to tracking-issue
    .map(([name]) => name)
);
```

**`npm audit` exit codes:** Returns exit code 1 if vulnerabilities at advisory level or above exist. Same `spawnSync` no-throw treatment as `outdated`.

## Verifier `pdfjs-dist` Separation (DEPS-04 — RECOMMENDED MECHANISM)

Four approaches researched; each with concrete pros/cons. **Recommended: Option A (custom `verifierDeps` field).**

### Option A — Custom `verifierDeps` field in root `package.json` (RECOMMENDED)

```json
{
  "name": "patent-cite-tool",
  "devDependencies": { "pdfjs-dist": "^5.5.207", ... },
  "verifierDeps": {
    "pdfjs-dist": "5.5.207"
  }
}
```

The verifier (`tests/e2e/lib/pdf-verifier.js`) reads at runtime:
```js
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const VERIFIER_PDFJS_VERSION = pkg.verifierDeps?.['pdfjs-dist'];

// Workflow can override via env:
const overridePath = process.env.VERIFIER_PDFJS_PATH;
const require = createRequire(import.meta.url);
const pdfjsLib = overridePath
  ? require(`${overridePath}/node_modules/pdfjs-dist/legacy/build/pdf.mjs`)
  : (await import('pdfjs-dist/legacy/build/pdf.mjs'));
```

**Pros:**
- Single source of truth (root `package.json`).
- Zero hoisting changes; no second lockfile.
- Trivial to grep-pin via static test: `expect(pkg.verifierDeps['pdfjs-dist']).toMatch(/^\d+\.\d+\.\d+$/)` (no caret → EXACT pin).
- Workflow override via `VERIFIER_PDFJS_PATH` env var is one-line install + one-line env setting (mirrors `PDFJS_VERIFIER_PATH` pattern already documented in Pitfall 6 line 384).
- `npm` ignores unknown top-level fields (per `package.json` spec — non-standard fields are preserved verbatim) [CITED: npm docs].

**Cons:**
- The verifier must contain explicit override logic. Code lives in `tests/e2e/lib/pdf-verifier.js` (CODEOWNED — change is gated by `@tonyrowles` review).
- Verifier's pdfjs version drifts behind the extension's; manual `npm run update-verifier-pdfjs` script needed eventually (deferred to Phase 47 CLEANUP audit).

### Option B — `package.json` `overrides` field

```json
{
  "overrides": {
    "tests/e2e/lib/**": { "pdfjs-dist": "5.5.207" }
  }
}
```

**Pros:** Native npm feature; respects hoisting.
**Cons:** `overrides` operates on the DEPENDENCY GRAPH, not on file paths — the syntax above is INVALID. The correct npm `overrides` syntax forces a specific transitive version of a dep; it cannot say "this file uses version X, this file uses version Y." This option does NOT solve the problem.

### Option C — Sub-package at `tests/e2e/package.json`

```
tests/e2e/
  package.json    # { "dependencies": { "pdfjs-dist": "5.5.207" } }
  package-lock.json
  node_modules/pdfjs-dist/...
```

**Pros:** Standard npm workspace pattern; clean separation.
**Cons:** Two lockfiles + CI install-step doubling + hoisting interaction with root `node_modules/pdfjs-dist`. Phase 40 CONTEXT specifically asks the planner to compare against this — the verdict is "let the planner decide" but the specifics block leans `verifierDeps` ("Or a dedicated `tests/e2e/package.json` if hoisting is too invasive"). Hoisting IS invasive here — Playwright's `node_modules` lookup is hoisting-sensitive, and pdfjs has WASM blobs that some hoisting strategies de-dupe incorrectly.

### Option D — Manual symlink / vendoring

`node_modules-pinned/pdfjs-dist/` checked into the repo or symlinked from a CI-installed `/tmp/old-pdfjs/`.

**Pros:** Maximum control.
**Cons:** Vendored `node_modules` = thousands of files committed; symlinks are platform-dependent (Windows dev machines).

### Recommendation summary

**Use Option A (`verifierDeps` field).** It is the lowest-coupling, lowest-blast-radius mechanism that matches the v3.1 "single root package.json" convention while creating a clean override surface for the frame-shift pre-flight job.

**Static-grep test:**
```js
it('verifier pdfjs-dist is pinned separately from devDependencies pdfjs-dist', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  expect(pkg.verifierDeps).toBeDefined();
  expect(pkg.verifierDeps['pdfjs-dist']).toBeDefined();
  // EXACT pin (no caret), DEPS-04 contract
  expect(pkg.verifierDeps['pdfjs-dist']).toMatch(/^\d+\.\d+\.\d+$/);
  // Distinct declaration from devDependencies (the SHARED ^5.5.207 caret)
  expect(pkg.devDependencies['pdfjs-dist']).toBeDefined();
});
```

## Frame-Shift Pre-Flight Workflow Design (DEPS-04 + Pitfall 6 defense 2)

**Goal:** When the candidate PR bumps `pdfjs-dist` from vX to vY in `devDependencies`, run the verifier suite against vX (NOT vY) on the PR branch, then again against vY, and confirm citation outputs match. Divergence = the dep bump is masking a real bug.

### Recommended job structure: SEQUENTIAL within ONE matrix entry (not separate matrix)

**Rationale:** A separate matrix entry would require checking out the same PR twice and running `npm ci` twice — multiplying the wall-clock by ~2× without any parallelism benefit (the two runs share zero work). Sequential within one entry lets us cache `node_modules` once and just swap the verifier's pdfjs path.

```yaml
jobs:
  verifier-frozen-preflight:
    # Only runs when the diff touches devDependencies.pdfjs-dist
    if: |
      github.event.pull_request.head.ref == startsWith('deps/') &&
      contains(github.event.pull_request.labels.*.name, 'dependencies')
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      # Detect the pdfjs version bump
      - name: Detect pdfjs-dist version delta
        id: delta
        run: |
          PREV=$(git show origin/main:package.json | node -e \
            "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).devDependencies['pdfjs-dist'])")
          NEW=$(node -e \
            "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).devDependencies['pdfjs-dist'])")
          echo "prev=$PREV" >> $GITHUB_OUTPUT
          echo "new=$NEW"   >> $GITHUB_OUTPUT
          if [ "$PREV" = "$NEW" ]; then echo "skip=1" >> $GITHUB_OUTPUT; else echo "skip=0" >> $GITHUB_OUTPUT; fi

      - name: Skip pre-flight (no pdfjs change)
        if: steps.delta.outputs.skip == '1'
        run: echo "No pdfjs-dist version change — pre-flight not needed."

      # Phase A — install OLD pdfjs into an out-of-tree dir
      - name: Install OLD pdfjs
        if: steps.delta.outputs.skip == '0'
        run: |
          mkdir -p /tmp/old-pdfjs
          cd /tmp/old-pdfjs && npm init -y && npm install pdfjs-dist@${{ steps.delta.outputs.prev }} --no-save

      # Phase B — full nightly suite with verifier using OLD pdfjs
      - name: Run regression suite (verifier on OLD pdfjs)
        if: steps.delta.outputs.skip == '0'
        env:
          VERIFIER_PDFJS_PATH: /tmp/old-pdfjs
        run: |
          npm ci
          npm run e2e:regression
          cp tests/artifacts/regression-results.json /tmp/results-old-pdfjs.json

      # Phase C — full nightly suite with verifier using NEW pdfjs (default)
      - name: Run regression suite (verifier on NEW pdfjs)
        if: steps.delta.outputs.skip == '0'
        env:
          VERIFIER_PDFJS_PATH: ""   # unset — verifier falls back to bundled
        run: |
          npm run e2e:regression
          cp tests/artifacts/regression-results.json /tmp/results-new-pdfjs.json

      # Phase D — diff the citation outputs
      - name: Compare citation outputs (frame-shift detection)
        if: steps.delta.outputs.skip == '0'
        run: |
          node -e "
            const old = JSON.parse(require('fs').readFileSync('/tmp/results-old-pdfjs.json'));
            const nw  = JSON.parse(require('fs').readFileSync('/tmp/results-new-pdfjs.json'));
            const diffs = [];
            for (const k of Object.keys(old.cases)) {
              if (JSON.stringify(old.cases[k].citation) !== JSON.stringify(nw.cases[k].citation)) {
                diffs.push(k);
              }
            }
            if (diffs.length > 0) {
              console.error('FRAME-SHIFT DETECTED on cases:', diffs);
              process.exit(1);
            }
            console.log('Frame-shift pre-flight: OK (', Object.keys(old.cases).length, 'cases matched)');
          "
```

**Cache strategy:** Use `actions/setup-node@v4`'s built-in `cache: 'npm'` for the main `node_modules` (`package-lock.json` is the cache key). The OLD-pdfjs install at `/tmp/old-pdfjs` is small (single package, ~5 MB) and not worth caching — install fresh each run.

## Required-Status-Check Coordination (CONTEXT decision lookback)

**Phase 39 SUMMARY line 149:** "Required status checks: intentionally absent — no `required_status_checks` rule in the ruleset. This matches the plan's instruction to RESERVE the slot for Phase 41 (`verifier-gate` doesn't exist yet; naming a non-existent check now would block every PR)."

**Phase 40 deps-update gate decision tree:**

| Option | Action | Pros | Cons | Verdict |
|--------|--------|------|------|---------|
| (a) Leave ruleset untouched; gate runs advisorily | Phase 40 ships workflows only; ruleset unchanged | LOWEST coupling; Phase 40 can ship independently of Phase 41 | Dep-update PRs *could* be merged even if the gate fails (but they're DRAFT — they can't be merged at all until human flips to ready, and the human will see the red check) | **RECOMMENDED** |
| (b) Name `deps-update-gate` in the ruleset now | Add to `required_status_checks` rule | Hard enforcement | Blocks EVERY PR until the workflow runs first (and the workflow only runs on PRs to `main`, creating a chicken-and-egg for first invocation); also names a single non-existent check (gate name) when no PR yet has been gated | Rejected — premature |
| (c) Coordinate with Phase 41 to add both checks together | Defer ruleset edit to a joint Phase 40+41 followup | Cleanest cutover | Couples Phase 40 ship to Phase 41 timing; violates Phase 40's "parallel-eligible with 39 and 41" guarantee | Rejected — couples phases |

**Recommendation: (a)** — Phase 40 ships the workflow with a clearly-named job (`deps-update-gate`) but does NOT modify the ruleset. The DRAFT-state defense (Pitfall 4 defense #4) is the load-bearing guard for Phase 40 — a failing advisory check + DRAFT state means the PR cannot be merged without explicit human override of both signals.

**Phase 47 (CLEANUP-04 audit) adds the ruleset rule** that names `deps-update-gate` AND `verifier-gate` together — this is the single ruleset edit that closes both Phase 40 and Phase 41's "required-status-check slot reserved" loose ends.

## `@anthropic-ai/sdk` Skip Mechanism (THE pattern)

```js
// scripts/check-deps-and-pr.mjs

const NEVER_AUTO_BUMP = Object.freeze(['@anthropic-ai/sdk']);
const MANUAL_BUMP_NOTES_PATH = path.resolve(__dirname, '..', 'tests/e2e/.manual-sdk-bumps.json');

function writeManualBumpNote({ pkg, current, latest }) {
  const note = {
    iso: new Date().toISOString(),
    pkg,
    current,
    latest,
    action: 'manual-review-required',
    reason: 'package is on NEVER_AUTO_BUMP list',
  };

  let log;
  try {
    log = JSON.parse(fs.readFileSync(MANUAL_BUMP_NOTES_PATH, 'utf8'));
  } catch {
    log = { version: 1, notes: [] };
  }

  // Idempotency: don't append a new note for the same (pkg, latest) combo
  const dup = log.notes.find(n => n.pkg === pkg && n.latest === latest);
  if (dup) return;

  log.notes.push(note);
  fs.mkdirSync(path.dirname(MANUAL_BUMP_NOTES_PATH), { recursive: true });
  fs.writeFileSync(MANUAL_BUMP_NOTES_PATH, JSON.stringify(log, null, 2));
}

// In the partition loop:
for (const pkg of WATCHLIST) {
  const drift = outdated[pkg];
  if (!drift) continue;  // no version drift

  if (NEVER_AUTO_BUMP.includes(pkg)) {
    writeManualBumpNote({ pkg, current: drift.current, latest: drift.latest });
    // Optional: also `gh issue create` with label 'manual-sdk-review' here.
    // Per CONTEXT discretion ("issue is more discoverable"), recommend YES.
    continue;
  }
  // ... partition into security[] vs minor[] vs major[]
}
```

**Per-CONTEXT discretion question** ("issue vs digest body for SDK-skip notification"): **Recommend GH issue with label `manual-sdk-review`** — more discoverable, queryable via `gh issue list --label manual-sdk-review`, and the JSON note remains for forensic audit. The weekly digest can extend in a future phase to list outstanding SDK review issues.

**Test:**
```js
it('NEVER_AUTO_BUMP packages short-circuit PR creation', async () => {
  // mock npm outdated to return { '@anthropic-ai/sdk': { current: '0.100.1', latest: '0.101.0', ... } }
  // mock npm audit to return no vulnerabilities
  // run the script's main fn
  // assert: no PR-creation call was issued; tests/e2e/.manual-sdk-bumps.json contains the note
});
```

## Runtime State Inventory

> Phase 40 is a workflow + script ADDITION, not a rename/refactor. Most categories are not applicable, but the verifier-pdfjs separation introduces stored state that requires explicit handling.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `tests/e2e/.llm-spend-ledger.json` (Phase 39 committed) is read by the snapshot workflow; no schema change | Snapshot workflow reads only — no migration needed |
| Stored data (NEW) | `tests/e2e/.manual-sdk-bumps.json` created on first SDK-skip event | Decide gitignore policy: RECOMMEND committed (auditable history) with `[skip ci]` discipline on writes; the file is small and contains no secrets |
| Live service config | None — no external services touched | None |
| OS-registered state | None — cron lives in GitHub Actions YAML, not in OS-level cron | None |
| Secrets/env vars | `secrets.GITHUB_TOKEN` (already available); `VERIFIER_PDFJS_PATH` (new env var read by verifier — code edit only, no secret) | Document `VERIFIER_PDFJS_PATH` in `tests/e2e/lib/pdf-verifier.js` JSDoc; no SOPS/.env edit needed |
| Build artifacts | `node_modules/pdfjs-dist` — bundled by extension build; verifier-frozen pre-flight installs OLD version into `/tmp/old-pdfjs` (CI scratch, not committed) | None — ephemeral CI state |

**Nothing found in category — confirmed by:** Phase 40 introduces no rename, no string-substitution; no v3.1 surface is renamed.

## Common Pitfalls (Phase 40-specific; see PITFALLS.md for the full v4.0 catalog)

### Pitfall A: `npm outdated` exit-code-1 treated as failure

**What goes wrong:** Script uses `execSync('npm outdated --json')` which throws on non-zero exit; the whole workflow fails when packages are outdated (which is THE expected case).
**Why it happens:** `npm outdated` exits 1 when ≥1 package is outdated. The stdout still contains the valid JSON.
**How to avoid:** Use `spawnSync` and read stdout regardless of exit code:
```js
const result = spawnSync('npm', ['outdated', '--json'], { encoding: 'utf8' });
const outdated = result.stdout.trim() ? JSON.parse(result.stdout) : {};
```
**Warning signs:** First weekly cron run with any outdated package fails the workflow with exit 1.

### Pitfall B: `peter-evans/create-pull-request@v8` re-runs create N PRs when branch name changes

**What goes wrong:** Encoding the version in branch name (`deps/security-playwright-1.61.0`) means a new patch version (1.61.1) creates a NEW PR while the prior is still open — sprawl.
**Why it happens:** Action idempotency keys on `branch` name; different name = different PR.
**How to avoid:** Set `delete-branch: true` AND comment-then-close the older PR via a script step before opening the new one (or use a constant branch name `deps/security-<pkg>` and update its title/body each week — simpler but loses version-in-history).
**Warning signs:** Multiple `deps/security-playwright-*` branches accumulating.

### Pitfall C: Snapshot commit growing the ledger file unboundedly

**What goes wrong:** Daily snapshot commits append-only ledger; after 1 year the file is enormous; every snapshot commit pushes the whole file.
**Why it happens:** `tests/e2e/.llm-spend-ledger.json` `iterations` array grows with every LLM call.
**How to avoid:** Phase 40 is NOT the right place to fix this (Phase 39 LEDGER schema is locked); accept the growth for now. If file size becomes a problem, Phase 47 CLEANUP can introduce a monthly roll-over (`iterations` for closed months get rolled into a summary). For Phase 40, document the growth profile in commit comment as a known issue.
**Warning signs:** `git log -- tests/e2e/.llm-spend-ledger.json | wc -l` growing > 5000 commits.

### Pitfall D: Pitfall 6 (PITFALLS.md) — dep-update masks regression

**What goes wrong:** See PITFALLS.md lines 354-411 (full treatment). Phase 40's defenses:
1. Verifier `pdfjs-dist` pinned separately (DEPS-04 + `verifierDeps` field) — DONE in this phase
2. Frame-shift pre-flight as a workflow job — DONE in this phase
3. Forbid auto-fix from editing `package.json` deps — Phase 41/42's job (out of Phase 40 scope)
4. Quarantine for 7 days after every dep merge — Phase 41+ concern (out of Phase 40 scope)

**How to avoid:** Ship DEPS-04's verifier-frozen pre-flight (the recommended workflow design above) as a REQUIRED step for any PR whose diff touches `package.json`'s `devDependencies.pdfjs-dist`.

## Code Examples (verbatim copy targets)

### Snapshot commit step (VERBATIM from e2e-weekly-digest.yml:98-110)

```yaml
      - name: Commit daily ledger snapshot
        # [skip ci] is LOAD-BEARING — prevents this bot push from re-triggering ci.yml.
        # Mirrors e2e-weekly-digest.yml:98-110 pattern; copy unchanged except for paths.
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add tests/e2e/.llm-spend-ledger.json
          git diff --cached --quiet || git commit -m "[skip ci] ledger snapshot ${{ env.SNAPSHOT_DATE }}: ${{ env.INVOCATIONS }} invocations, \$${{ env.SPEND_USD }} spent"
          git push
```

### Snapshot summary capture step (mirrors e2e-weekly-digest.yml:85-96)

```yaml
      - name: Capture snapshot summary for commit message
        # Reads tests/e2e/lib/llm-ledger.js to compute today's invocation count + total spend.
        # env-var hop via $GITHUB_ENV — value never interpolated into shell (CWE-94).
        run: |
          node -e "
            import('./tests/e2e/lib/llm-ledger.js').then(m => {
              const fs = require('node:fs');
              const ledger = m.readLedger();
              const isoDay = m.currentIsoDay();
              const invocations = (ledger.months[m.currentMonth()]?.iterations || [])
                .filter(it => it.iso?.startsWith(isoDay)).length;
              const spend = m.dayTotal(ledger, isoDay).toFixed(2);
              fs.appendFileSync(process.env.GITHUB_ENV, 'SNAPSHOT_DATE=' + isoDay + '\n');
              fs.appendFileSync(process.env.GITHUB_ENV, 'INVOCATIONS=' + invocations + '\n');
              fs.appendFileSync(process.env.GITHUB_ENV, 'SPEND_USD=' + spend + '\n');
            });
          "
```

### Workflow skeleton — `v40-cost-ledger-snapshot.yml`

```yaml
# .github/workflows/v40-cost-ledger-snapshot.yml
#
# Phase 40 (DEPS-coupling: ledger snapshot consumes Phase 39 LEDGER-04 committed ledger)
# Daily 02:00 UTC snapshot of tests/e2e/.llm-spend-ledger.json.
# Lands well before e2e-weekly-digest's Monday 07:00 slot.

name: V40 Cost Ledger Snapshot

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch: {}

concurrency:
  group: v40-cost-ledger-snapshot
  cancel-in-progress: false

permissions:
  contents: write  # commit-in-run: git push tests/e2e/.llm-spend-ledger.json

jobs:
  snapshot:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      - name: Capture snapshot summary for commit message
        # ... (see above)

      - name: Commit daily ledger snapshot
        # ... (VERBATIM from above)
```

### Workflow skeleton — `v40-deps-update.yml`

```yaml
# .github/workflows/v40-deps-update.yml
#
# Phase 40 DEPS-01..04 — weekly dep-update auto-PR + frame-shift pre-flight.

name: V40 Deps Update

on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch: {}

concurrency:
  group: v40-deps-update
  cancel-in-progress: false

permissions:
  contents: write          # push branches via peter-evans/cpr
  pull-requests: write     # create/update draft PRs
  issues: write            # manual-sdk-review tracking issue

jobs:
  dep-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: ${{ hashFiles('package-lock.json') != '' && 'npm' || '' }}
      - run: npm ci
      - id: scan
        run: node scripts/check-deps-and-pr.mjs

      - name: Open security PR
        if: steps.scan.outputs.security_count != '0'
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: ${{ steps.scan.outputs.security_branch }}
          base: main
          draft: true
          title: "deps(security): bump ${{ steps.scan.outputs.security_packages }}"
          body-path: /tmp/security-pr-body.md
          labels: dependencies,security
          commit-message: "deps(security): bump ${{ steps.scan.outputs.security_packages }}"
          delete-branch: true

      - name: Open grouped minor PR
        if: steps.scan.outputs.minor_count != '0'
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: ${{ steps.scan.outputs.minor_branch }}
          base: main
          draft: true
          title: "deps: weekly minor bumps (${{ steps.scan.outputs.minor_packages }})"
          body-path: /tmp/minor-pr-body.md
          labels: dependencies,minor
          commit-message: "deps: weekly minor bumps"
          delete-branch: true

  # The verifier-frozen-preflight job belongs in a SEPARATE workflow triggered
  # on pull_request.opened/synchronize filtered to head_ref startsWith('deps/')
  # OR as a follow-on job in this workflow gated by the dep-scan output. Recommend
  # the separate workflow for cleaner separation of concerns:
  #   .github/workflows/v40-deps-frame-shift-preflight.yml
  # (Planner decides; YAML-level test pins either path.)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dependabot config in `.github/dependabot.yml` | Roll-your-own with `npm outdated --json` + `peter-evans/cpr@v8` | This phase | Tighter integration with verifier-frozen pre-flight; explicit SDK-skip handling; per-CONTEXT explicitly NOT-Dependabot |
| `gh pr create` direct CLI | `peter-evans/create-pull-request@v8` | Phase 39 lock | Idempotent re-runs; built-in `body-path` and `labels` and `draft` |
| Ledger gitignored (Phase 31) | Ledger committed (Phase 39 LEDGER-04) | Phase 39 | Phase 40 snapshot workflow's read-write target |
| Branch protection via UI clicks only | `gh api` ruleset captured in plan | Phase 39 Task 3 | Phase 40 may extend ruleset; recommendation is to defer until Phase 47 audit |

**Deprecated/outdated:**
- `npm audit fix --force` — researcher Pitfall: introduces breaking changes; explicitly OUT-OF-SCOPE per CONTEXT deferred ideas line 93.
- Renovate/Dependabot — OUT-OF-SCOPE per REQUIREMENTS.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `peter-evans/create-pull-request@v8` version 8.1.1 is the action's current minor pin | Standard Stack | Wrong minor version → action behaves differently than documented; verify with `gh api repos/peter-evans/create-pull-request/releases` before pinning |
| A2 | npm 10's `outdated --json` schema is stable (current/wanted/latest/dependent/location/type fields) | npm CLI JSON Schemas | If schema differs in future npm versions, partition logic could misclassify; mitigation is that the static-grep tests will fail loudly |
| A3 | `npm audit --json` v2 report uses `vulnerabilities.<pkg>.severity` + `fixAvailable` fields as documented | npm CLI JSON Schemas | Same as A2 |
| A4 | Verifier reads pdfjs via `import('pdfjs-dist/legacy/build/pdf.mjs')` — needs verification against actual `tests/e2e/lib/pdf-verifier.js` | Verifier pdfjs-dist Separation Option A | Wrong import path → the `createRequire` override won't compose; planner should `grep -n pdfjs-dist tests/e2e/lib/pdf-verifier.js` before writing the verifier change |
| A5 | Static-grep tests in `tests/e2e/scripts/*-yaml.test.js` are picked up by the default Vitest config | Pattern 3 | If the directory isn't in the include glob, tests won't run; verify with `npx vitest run tests/e2e/scripts/`; Phase 37 added this pattern so it's almost certainly already wired |
| A6 | `cron: '0 2 * * *'` (02:00 UTC daily) for snapshot does not conflict with e2e-nightly's slot | Snapshot workflow design | Need to check `.github/workflows/e2e-nightly.yml` cron — if also `0 2 * * *`, race for runners; planner should confirm; alternative slot `0 3 * * *` |
| A7 | `tests/e2e/.manual-sdk-bumps.json` should be committed (not gitignored) | `@anthropic-ai/sdk` Skip Mechanism | Discretionary choice; if committed, snapshot workflow OR a SDK-specific commit step must push it (otherwise the note is local to the runner and lost). Recommend committing; planner confirms in PLAN. |
| A8 | The `deps-update-gate` is named in the workflow (one job named exactly that) but not added to the ruleset until Phase 47 | Required-Status-Check Coordination | Per CONTEXT line 73 the maintainer accepted the "ruleset will be updated in Phase 47" plan; this assumption is locked, not speculative |

**Confirm-before-execute:** A4 and A6 should be verified by the planner via grep/cat before the corresponding tasks are written. A1 should be verified via `npm view @peter-evans/create-pull-request` or web check.

## Open Questions

1. **`tests/e2e/.manual-sdk-bumps.json` gitignore policy**
   - What we know: CONTEXT discretion line 48 — "Whether the digest/notification for manual-SDK-review goes to an issue or to the weekly digest body — issue is more discoverable"
   - What's unclear: If we go ISSUE path, does the JSON file still need to exist (forensic audit trail)? If yes, it must be committed; if no, gitignore.
   - Recommendation: Commit it (cheap, auditable, queryable); the snapshot workflow includes it in the daily commit (`git add tests/e2e/*.json` extension).

2. **Snapshot cron slot conflict with e2e-nightly**
   - What we know: e2e-nightly runs on cron (per Phase 35+ history) but the exact cron expression isn't in the files I read
   - What's unclear: Is `0 2 * * *` already taken?
   - Recommendation: Planner runs `grep -A1 'schedule:' .github/workflows/e2e-nightly.yml` to confirm; pick a non-conflicting slot.

3. **Frame-shift pre-flight as separate workflow vs job in deps-update workflow**
   - What we know: Separate workflow is cleaner; in-workflow job is fewer files
   - What's unclear: Either is defensible
   - Recommendation: Separate workflow `v40-deps-frame-shift-preflight.yml` triggered on `pull_request.opened/synchronize/reopened` filtered to `head_ref startsWith('deps/')` — keeps the deps-update workflow tight (just scan + PR creation) and the preflight gates the PR; YAML-level test pins both files.

4. **Re-running deps-update on the same week when a PR is still open**
   - What we know: Branch-name idempotency handles same-version case
   - What's unclear: If the prior week's PR is still open AND a new patch was released this week, do we open a second PR or update the existing one?
   - Recommendation: Update the existing one (constant per-package branch name `deps/security-<pkg>` rather than `deps/security-<pkg>-<ver>`); version in title/body, not branch. Trade-off: loses commit-history granularity but avoids PR sprawl. Planner decides.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 | All workflows (per `.nvmrc`) | ✓ (on `ubuntu-latest` via `actions/setup-node@v4`) | per `.nvmrc` | — |
| `npm` (with `outdated --json` + `audit --json`) | `check-deps-and-pr.mjs` | ✓ (bundled with Node 22) | npm 10+ | — |
| `gh` CLI | `gh issue create` for manual-sdk-review issue | ✓ (preinstalled on `ubuntu-latest`) | latest | `gh api` directly |
| `git` 2.40+ | All workflows | ✓ (preinstalled on `ubuntu-latest`) | 2.40+ | — |
| `peter-evans/create-pull-request@v8` | PR creation | ✓ (GitHub Marketplace) | 8.1.1 | `gh pr create --draft` (loses idempotency) |
| `pdfjs-dist@<OLD-version>` | Frame-shift pre-flight | ✓ (npm registry, on-demand install) | per the bumped PR | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (already installed: `"vitest": "^3.0.0"` in `devDependencies`) |
| Config file | `vitest.config.js` at repo root (assumed — confirm in PLAN) |
| Quick run command | `npx vitest run tests/unit/check-deps-and-pr.test.js tests/e2e/scripts/v40-*-yaml.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPS-01 | Cron `0 9 * * 1` + workflow_dispatch + watchlist freeze | YAML-level grep + import-frozen-tuple | `npx vitest run tests/e2e/scripts/v40-deps-update-yaml.test.js tests/unit/check-deps-and-pr.test.js -t "watchlist"` | ❌ Wave 0 |
| DEPS-02 | Required-status-check gate named in workflow; `draft: true` for PRs | YAML-level grep | `npx vitest run tests/e2e/scripts/v40-deps-update-yaml.test.js -t "gate"` | ❌ Wave 0 |
| DEPS-03 | Security vs minor partition logic (mock outdated + audit JSON) | Unit (Vitest) | `npx vitest run tests/unit/check-deps-and-pr.test.js -t "partition"` | ❌ Wave 0 |
| DEPS-04 | `verifierDeps.pdfjs-dist` pinned separately (EXACT, no caret) | Static read of `package.json` | `npx vitest run tests/unit/check-deps-and-pr.test.js -t "verifierDeps"` | ❌ Wave 0 |

**Snapshot workflow tests:**

| Req ID | Behavior | Test Type | Command | File Exists? |
|--------|----------|-----------|---------|-------------|
| (Phase 40 deliverable 5) | Daily snapshot YAML contract (cron, [skip ci], git add path) | YAML-level grep | `npx vitest run tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/check-deps-and-pr.test.js tests/e2e/scripts/v40-*-yaml.test.js` (< 5 sec)
- **Per wave merge:** `npm test` (full Vitest + Playwright; ~5 min)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/check-deps-and-pr.test.js` — covers DEPS-01 (watchlist freeze + NEVER_AUTO_BUMP), DEPS-03 (partition), DEPS-04 (verifierDeps static read)
- [ ] `tests/e2e/scripts/v40-deps-update-yaml.test.js` — covers DEPS-01 (cron) + DEPS-02 (gate named, `draft: true`, no `--auto`)
- [ ] `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` — covers snapshot YAML contract
- [ ] No framework install needed (Vitest already installed)
- [ ] No new test directory needed (`tests/unit/` and `tests/e2e/scripts/` already exist per Phase 37 precedent)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `secrets.GITHUB_TOKEN` (workflow-scoped, not PAT); never log token value |
| V3 Session Management | no | n/a (workflows are stateless) |
| V4 Access Control | yes | `permissions:` block at workflow scope; `contents: write` + `pull-requests: write` + `issues: write` ONLY; NEVER `id-token: write` or `actions: write` (Pitfall 1 step 7) |
| V5 Input Validation | yes | `npm outdated --json` / `npm audit --json` output schemas validated; no untrusted external input fed into the script (the watchlist is hard-coded) |
| V6 Cryptography | no | n/a (no crypto; rely on TLS via `gh`/`npm` registry) |
| V10 Malicious Code | yes | `peter-evans/create-pull-request@v8` pinned to major version (action major-version pin policy); MAY upgrade to SHA pin if security_enforcement requires |
| V14 Configuration | yes | All workflow primitives pinned by YAML-level grep tests; ruleset state captured in Phase 39 Task 3 baseline |

### Known Threat Patterns for GitHub Actions + npm

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cron-typo budget runaway | Tampering/DoS | Static-grep test pins cron expression (mirrors Pitfall 2 defense) |
| Auto-merge of bot PR | Elevation of Privilege | `draft: true` + repo-level `Allow auto-merge: OFF` (already set in Phase 39 Task 3) + branch protection ruleset (already active) |
| `gh pr merge --auto` from workflow | Elevation of Privilege | YAML-level grep asserts ABSENT (Pitfall 4 defense 5) |
| Malicious dep update auto-merged | Tampering | Required-status-check gate + DRAFT state + CODEOWNERS review of `.github/workflows/` (already pinned by Phase 39 CODEOWNERS) |
| Dep update masks regression (frame-shift) | Tampering | Verifier-frozen pre-flight (DEPS-04 + Pitfall 6 defense 2) — DOCUMENTED in this research |
| PR body injection from npm package metadata | Tampering/Information Disclosure | `body-path` reads from `/tmp/*-pr-body.md` which is constructed by our script from validated `npm outdated` JSON; no untrusted text concatenation |
| Workflow runner credential exfil | Information Disclosure | `secrets.GITHUB_TOKEN` only, no PAT; `permissions:` minimized; never log secrets |
| `[skip ci]` mis-spelling allows infinite recursion | DoS | YAML-level grep asserts exact literal `[skip ci]` (S7) |

## Sources

### Primary (HIGH confidence)

- `/home/fatduck/patent-cite-tool/.planning/phases/40-deps-update-cost-ledger-snapshot-workflows/40-CONTEXT.md` — User decisions, locked watchlist, cron schedules, SDK never-bump policy
- `/home/fatduck/patent-cite-tool/.planning/REQUIREMENTS.md` — DEPS-01..04 requirements + out-of-scope clauses
- `/home/fatduck/patent-cite-tool/.planning/phases/39-sdk-driver-ledger-v2-branch-protection-wave-0/39-04-SUMMARY.md` — Phase 39 ledger flip + ruleset captures (lines 84-149)
- `/home/fatduck/patent-cite-tool/.planning/research/PITFALLS.md` — Pitfall 6 (dep-update masking) full treatment lines 354-411
- `/home/fatduck/patent-cite-tool/.github/workflows/e2e-weekly-digest.yml` — Canonical `[skip ci]` self-commit pattern (lines 98-110), permissions block, label-ensure pattern
- `/home/fatduck/patent-cite-tool/.github/CODEOWNERS` — `.github/workflows/` pin (Phase 39)
- `/home/fatduck/patent-cite-tool/package.json` — Current devDependencies + exact versions
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` — `currentIsoDay()`, `dayTotal()`, `combinedMonthlyTotal()` exports for snapshot summary
- `/home/fatduck/patent-cite-tool/tests/e2e/scripts/e2e-weekly-digest-yaml.test.js` — YAML-level test pattern (Y1-Y6 discipline)

### Secondary (MEDIUM confidence)

- npm docs `npm outdated` / `npm audit` JSON schema — schema fields cited verbatim from npm's published CLI docs; verified against npm 10+ behavior

### Tertiary (LOW confidence)

- `peter-evans/create-pull-request@v8` action input surface — input list reproduced from action README from training data; planner should verify against the action's repo before relying on exact field names (esp. `body-path` vs `body_path`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools/actions already in-repo or vetted by Phase 39
- Architecture: HIGH — directly mirrors documented Phase 37 pattern (e2e-weekly-digest.yml)
- Pitfalls: HIGH — Pitfall 6 from PITFALLS.md is the canonical defense; Phase 39 SUMMARY documents the ruleset state precisely
- Verifier pdfjs separation mechanism: MEDIUM — Option A (verifierDeps field) is recommended but the planner should verify the actual `pdf-verifier.js` import shape before writing the change task
- Frame-shift pre-flight workflow: MEDIUM — design is sound; matrix-vs-sequential trade-off is documented; planner has discretion

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (30 days; the only fast-moving piece is `peter-evans/create-pull-request@v8` minor releases — re-check before Phase 40 ships)

# Phase 41: Verifier-Gate Workflow + verify-single-case.mjs CLI Shim — Research

**Researched:** 2026-05-31
**Domain:** GitHub Actions workflow + Node CLI shim — verifier-gate that PR-gates `auto-fix/*` branches before Phase 43 lands its first PR
**Confidence:** HIGH — every load-bearing pattern derived from already-shipped Phase 39/40 conventions, Phase 28 verifier code I read directly, and the PITFALLS.md / ARCHITECTURE.md / 41-CONTEXT.md trio (locked decisions, not speculation)

## Summary

Phase 41 ships two artifacts and one regression test file: `.github/workflows/v40-verifier-gate.yml` (the gate workflow), `scripts/verify-single-case.mjs` (the CLI shim around v3.0's `verifyCitation`), and `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (YAML-level static-grep contract per Phase 40-03's established D1-D11 + X1-X8 pattern). Discretionary helpers `scripts/check-diff-guard.mjs` and `scripts/parse-affected-cases.mjs` are recommended to be factored as Node helpers (not inlined in YAML) so Phase 42's `auto-fix.mjs` can import them — keeps the diff-guard regex bank and affected-cases parser Vitest-testable in one place.

The phase reserves a **named** required-status-check slot (`verifier-gate`) on the `v4.0-main-protection` ruleset (id 17086676, captured in 39-04-SUMMARY) — Phase 47 CLEANUP-04 binds the name to the ruleset's `required_status_checks` list in a single atomic edit alongside Phase 40's `deps-update-gate`. Phase 41 does NOT touch the ruleset.

The load-bearing verifier-gaming defense (Pitfall 3 Defense 4) is `git checkout origin/main -- tests/e2e/lib/pdf-verifier.js tests/golden/baseline.json tests/e2e/lib/pdf-fetch.js` after PR-branch checkout but BEFORE running any verifier — making PR-side mutations of those files invisible to the gate. Diff-guard regex bank rejects forbidden paths (6 paths LOCKED) pre-checkout.

**Primary recommendation:** Three-job workflow split — `diff-guard` (size-cap + path-bank rejection, fail-fast) → `verifier-gate` (3× affected-case runs + 76-case regression in parallel sub-jobs) → `ready-flip` (gh pr ready on all-pass). Helpers as small Node modules. 19-25 YAML static-grep cases mirroring Phase 40-03's structure.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Workflow naming:** `.github/workflows/v40-verifier-gate.yml` (v40-* namespace per Phase 40 convention).
- **Trigger:** `pull_request: { types: [opened, synchronize, reopened] }` with `branches:` filter `[auto-fix/*]` (matches the branch-name convention Phase 43 uses).
- **3× affected-case runs:** consecutive (not parallel) — flakiness manifests as inconsistent results across re-runs. Tier A/B threshold per v3.0 verifier contract.
- **CLI shim signature:** `node scripts/verify-single-case.mjs --case <id> [--runs N=1] [--output <path>]`. Output JSON file path defaults to `playwright-report/single-case-<id>-runs-<n>.json`. Exit 0 on all runs Tier A/B; exit 1 on Tier C or below; exit 2 on argument error.
- **Diff-size cap values:** 200 LOC `src/`, 50 LOC `tests/` — initial caps; recalibrate after first 10 fixes (Phase 45 or post-Phase 47).
- **`human-review-required` label** is the existing v3.1 label (per CONTEXT.md claim referencing `tests/e2e/lib/triage-classifier.js`); reuse it. No new label creation. **⚠️ FLAGGED:** grep confirms the label string does NOT appear anywhere in `tests/`, `scripts/`, `.github/workflows/`, or `src/` — only in planning docs. See Open Question 1.
- **Diff-guard paths (LOCKED):** `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `.github/CODEOWNERS`. The regex bank lives in `scripts/auto-fix.mjs` (Phase 42) but Phase 41's workflow pre-check uses bash `grep -E`; the canonical reference is the helper.
- **Verifier pinned to `origin/main`:** `git checkout origin/main -- tests/e2e/lib/pdf-verifier.js tests/golden/baseline.json tests/e2e/lib/pdf-fetch.js` inside the verifier-gate job, AFTER PR-branch checkout but BEFORE the verifier runs. Planner identifies the EXACT file set; this research identifies it (see §Architecture Patterns / Verifier-Pin File Set).
- **Required-status-check coordination:** Phase 41's `verifier-gate` job NAME is the slot Phase 39 reserved on the `v4.0-main-protection` ruleset. Phase 41 ships the workflow + job name; Phase 47 CLEANUP-04 adds the named check to the ruleset's `required_status_checks` list (alongside Phase 40's `deps-update-gate`). **Phase 41 does NOT touch the ruleset.**
- **YAML-level testing:** Static-grep test in `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` pins trigger branches, job names, the diff-size cap values, the diff-guard regex set, the `origin/main` checkout step, the 3× run loop structure, and the absence of forbidden tokens (auto-merge, PAT).
- **Vitest CLI shim tests:** Unit test argv parsing + exit-code contract; integration test against a fixture case (existing `pdfjs` test fixtures from v3.0 provide sufficient coverage).
- **`gh pr ready` invocation:** Use `gh pr ready ${{ github.event.pull_request.number }}` (NOT `--undo`); requires `pull-requests: write` permission. Workflow permissions block: `contents: read`, `pull-requests: write`, `issues: read`.

### Claude's Discretion

- Job structure (single vs 2-3 jobs with `needs:` — recommend 3 jobs: `diff-guard` → `verifier-gate` → `ready-flip`)
- Caching strategy (`node_modules`, `.pdf-cache`, build output via `actions/cache@v4`)
- Whether failure comment is posted by the workflow (`gh pr comment`) or by the script (recommend workflow — keep script transport-pure)
- Vitest test file organization (one `tests/unit/verify-single-case.test.js` + one `tests/e2e/scripts/v40-verifier-gate-yaml.test.js`) — split per concern
- Whether diff-guard regex bank is YAML-inlined OR factored to `scripts/check-diff-guard.mjs` — **recommend factor** (Phase 42 reuses it)
- Whether affected-cases parser is YAML-inline (`gh pr view --json body --jq` + grep/sed) OR a Node helper (`scripts/parse-affected-cases.mjs`) — **recommend Node helper** (Vitest-testable, multi-line variant robust)

### Deferred Ideas (OUT OF SCOPE)

- Parallelization of 3× verifier runs (currently consecutive per locked decision; revisit if wall-clock matters)
- Caching of golden baseline across runs (file is small; reload per run is acceptable)
- LLM-as-judge for verifier disagreements (explicitly OUT OF SCOPE per REQUIREMENTS.md)
- Cross-issue fix batching (out of scope for v4.0)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VFY-GATE-01 | `.github/workflows/v40-verifier-gate.yml` triggers on `pull_request.opened/synchronize/reopened` filtered to `auto-fix/*` head branches; runs affected case from PR body `<!-- affected_cases: id1,id2 -->` comment 3× consecutively; only flips draft→ready if all 3 runs pass Tier A/B; PR comment posts results on any failure | §Architecture Patterns / Trigger + Concurrency + 3× Loop; §Code Examples / Bash 3× loop; §Architecture Patterns / Affected-Cases Parser; §Code Examples / `gh pr ready` invocation |
| VFY-GATE-02 | Same workflow ALSO runs the full 76-case regression suite on the PR branch; any regression on a previously-passing case blocks ready-for-review; static-grep test asserts the regression step exists | §Architecture Patterns / Regression Job (parallel sub-job); reuses e2e-nightly.yml `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` invocation pattern |
| VFY-GATE-03 | Diff-size cap: workflow pre-check rejects diffs >200 LOC in `src/` or >50 LOC in `tests/`; oversized diffs stay draft with `human-review-required` label and PR comment | §Architecture Patterns / Diff-Size Cap; §Code Examples / `git diff --shortstat` parser |
| VFY-GATE-04 | Verifier code (`tests/e2e/lib/pdf-verifier.js`) and golden baseline (`tests/golden/baseline.json`) pinned to `origin/main` during PR gate (NOT PR branch); diff-guard regex bank rejects diffs touching 6 LOCKED paths pre-`git apply` | §Architecture Patterns / Verifier-Pin File Set; §Architecture Patterns / Diff-Guard Regex Bank; §Code Examples / verifier-pin step |

## Project Constraints (from CLAUDE.md)

Only one directive in `./CLAUDE.md`: verify `AskUserQuestion` tool results contain explicit user selections — does NOT apply to this research-only phase. No new code-style directives.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| PR gate orchestration | GitHub Actions workflow YAML | — | All gating logic (triggers, concurrency, permissions, gh CLI calls) lives in `.github/workflows/v40-verifier-gate.yml`. CI is the canonical owner of "this PR is/isn't ready." |
| Single-case verification | Node CLI shim (`scripts/verify-single-case.mjs`) | `tests/e2e/lib/pdf-verifier.js` (existing) | The shim is transport (argv → verifyCitation → JSON → exit code). The actual verification logic stays in the unchanged lib (VFY-02 isolation preserved). |
| Affected-cases parsing | Node helper (`scripts/parse-affected-cases.mjs`) | YAML step via `gh pr view --json body` | Helper is Vitest-testable + handles multi-line variant cleanly. YAML reads PR body via gh, pipes to node helper via stdin. |
| Diff-guard path bank | Node helper (`scripts/check-diff-guard.mjs`) | YAML pre-check (bash `grep -E` minimal version OR helper invocation) | Helper is the canonical reference; Phase 42 `auto-fix.mjs` imports it for pre-apply rejection. YAML invokes the helper or replicates its regex inline. |
| Diff-size cap pre-check | YAML bash step | (Phase 42 will mirror in `auto-fix.mjs`) | Workflow-level enforcement is the load-bearing first defense (rejects pre-checkout); script-level is defense-in-depth (Phase 42 scope). |
| 76-case regression run | YAML matrix/parallel job invoking existing `playwright test` | `specs/regression.spec.js` (existing) | Same shape as `e2e-nightly.yml` regression step; zero new logic — direct re-use. |
| Verifier-pin to origin/main | YAML bash step | — | `git checkout origin/main -- <files>` is a pure git operation; no helper needed. |
| Draft→Ready transition | YAML `gh pr ready` invocation | — | Single gh CLI call; permission `pull-requests: write` (verified — see Sources). |
| PR failure comment | YAML `gh pr comment` invocation | (script remains transport-pure) | Discretion decision: comment composition stays in the workflow (script just produces JSON output). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions runner | ubuntu-latest | Workflow execution | Matches `e2e-nightly.yml`, `v40-deps-update.yml`, `v40-cost-ledger-snapshot.yml` — zero new infrastructure |
| `actions/checkout@v4` | v4 | Source checkout | LOCKED via Phase 40-03 conventions (Phase 39/40 use this exact version pin) |
| `actions/setup-node@v4` | v4 | Node 22 setup | LOCKED — same as nightly + Phase 40 workflows; `node-version: 22` literal (no `.nvmrc`) |
| `actions/cache@v4` | v4 | Cache node_modules + Playwright | Discretion: matches Phase 40-03's deps-update-gate cache pattern |
| `gh` CLI | runner pre-installed | PR operations (ready, comment, view body, label) | Phase 39/40 convention — NO `actions/github-script` per CLAUDE.md-equivalent project pattern in 41-CONTEXT.md |
| `secrets.GITHUB_TOKEN` | runner-injected | All API access | LOCKED — NO PATs per Pitfall 4 (verified via X1 grep in Phase 40-03 yaml test) |
| `pdfjs-dist` (verifier-side) | per `package.json.verifierDeps['pdfjs-dist']` | PDF parsing for verifyCitation | Already wired in `pdf-verifier.js` lines 67-81 (Phase 40-04 frame-shift contract — `VERIFIER_PDFJS_PATH` override hook unused by Phase 41) |
| `vitest` | ^3.0.0 | YAML-level static-grep tests + unit tests | LOCKED via package.json devDependencies; matches Phase 40-03 test file pattern |
| Playwright | (existing) | 76-case regression run inside the gate | Direct re-use of `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` from `e2e-nightly.yml` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:process` | builtin | argv parsing in `verify-single-case.mjs` | Use `process.argv.slice(2)` with manual parse (matches existing scripts in `scripts/`; minimal — only 3 flags) |
| `node:fs` | builtin | Output JSON write in shim | `fs.writeFileSync` for atomic small-file writes |
| `node:path` | builtin | Resolve output path | Standard |
| `node:url` `fileURLToPath` | builtin | ESM `__dirname` | Same pattern as `pdf-verifier.js:58` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual argv parsing | `yargs`, `commander`, `meow` | New devDep; project convention is hand-rolled argv (see `quarantine-append.mjs`, `e2e-report-issue.mjs`). 3 flags doesn't justify a parser. |
| Bash 3× loop | GitHub Actions matrix `strategy.matrix.run: [1,2,3]` | Matrix runs in parallel by default and adds 3× job startup overhead; "consecutive" is LOCKED per CONTEXT.md to surface flakiness within one job. Bash loop is the right shape. |
| Inline YAML regex for diff-guard | `scripts/check-diff-guard.mjs` Node helper | Helper is Vitest-testable + Phase 42 reuse; YAML inline is faster but duplicates logic. **Recommend helper.** |
| `actions/github-script@v7` | `gh` CLI | github-script returns object responses (nicer); gh CLI matches project convention (40-03, 40-cost-ledger-snapshot) — stick with gh. |

**Installation:** Zero new npm dependencies. `pdfjs-dist` already exists (separately pinned via `verifierDeps`, Phase 40-04). All actions pinned to existing major versions.

**Version verification:** Skipped — no new packages introduced. Phase 40-03 already verified `peter-evans/create-pull-request@v8` and `actions/checkout@v4` / `actions/setup-node@v4` / `actions/cache@v4` pin shapes.

## Package Legitimacy Audit

**Not required for this phase** — Phase 41 installs zero new packages. The phase reuses already-shipped dependencies (Playwright, pdfjs-dist, vitest, gh CLI) that passed package legitimacy in their introducing phases (Phase 28 for pdfjs-dist, Phase 35 for vitest, etc.). The GitHub Actions used (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`) are pinned via Phase 39/40's established conventions and are first-party GitHub-published actions.

## Architecture Patterns

### System Architecture Diagram

```
PR opened/synchronized/reopened on `auto-fix/*` head branch
                       │
                       ▼
        ┌──────────────────────────────────┐
        │ job: diff-guard (fail-fast)      │
        │  - git diff --shortstat src/     │
        │  - git diff --shortstat tests/   │
        │  - check size caps (200/50)      │
        │  - git diff --name-only |        │
        │    node scripts/check-diff-      │
        │    guard.mjs (regex bank)        │
        │  - on FAIL: label + comment +    │
        │    exit (PR stays draft)         │
        └─────────────┬────────────────────┘
                      │ (pass)
        ┌─────────────┴─────────────────────┐
        ▼                                   ▼
┌─────────────────────┐         ┌────────────────────────┐
│ job: verifier-gate  │         │ job: regression-suite  │
│  (needs: diff-guard)│         │  (needs: diff-guard)   │
│  - checkout PR HEAD │         │  - checkout PR HEAD    │
│  - git checkout     │         │  - npm ci + build      │
│    origin/main --   │         │  - npx playwright test │
│    <verifier files> │         │    specs/regression    │
│  - parse PR body →  │         │    .spec.js            │
│    affected_cases   │         │  - 76-case full suite  │
│    (parse-affected- │         │  - on regression: exit │
│    cases.mjs)       │         │    1 (gate stays      │
│  - for each case_id:│         │    draft)             │
│      for i in 1..3: │         └────────────────────────┘
│        node scripts/                       │
│        verify-single-│                     │
│        case.mjs --   │                     │
│        case <id>     │                     │
│        --output      │                     │
│        report-$i.json│                     │
│      assert all 3    │                     │
│      tier ∈ {A,B}    │                     │
│  - on FAIL: gh pr    │                     │
│    comment + exit 1  │                     │
└──────────┬──────────┘                      │
           │                                 │
           ▼  (verifier-gate + regression both pass)
        ┌──────────────────────────────────────┐
        │ job: ready-flip                      │
        │  (needs: [verifier-gate, regression])│
        │  - gh pr ready ${PR_NUMBER}          │
        │  - gh pr comment "all gates passed"  │
        └──────────────────────────────────────┘
                       │
                       ▼
                 PR transitions draft → ready_for_review
                 (human reviewer takes over per Pitfall 4)
```

### Recommended Project Structure

```
.github/workflows/
└── v40-verifier-gate.yml          # NEW (this phase)

scripts/
├── verify-single-case.mjs          # NEW (this phase) — CLI shim
├── parse-affected-cases.mjs        # NEW (this phase) — discretionary helper
└── check-diff-guard.mjs            # NEW (this phase) — discretionary helper

tests/
├── unit/
│   ├── verify-single-case.test.js          # NEW (this phase) — argv + exit codes
│   ├── parse-affected-cases.test.js        # NEW (this phase) — multi-line variants
│   └── check-diff-guard.test.js            # NEW (this phase) — regex bank
└── e2e/scripts/
    └── v40-verifier-gate-yaml.test.js      # NEW (this phase) — YAML contract (mirrors 40-03 D1-D11 + X1-X8 pattern)

# UNCHANGED (verifier-gate consumes existing primitives):
tests/e2e/lib/pdf-verifier.js               # verifyCitation entry point (line 878)
tests/e2e/lib/pdf-fetch.js                  # ensureCachedPdf (verifier dep)
tests/golden/baseline.json                  # pinned to origin/main in gate
tests/test-cases.js                         # 76-case suite (pinned to PR branch)
tests/e2e/specs/regression.spec.js          # 76-case spec
```

### Pattern 1: Trigger + Concurrency Block

**What:** The PR-event trigger filtered to `auto-fix/*` branches with PR-number-scoped concurrency and `cancel-in-progress: true` (PR sync should re-run gate from scratch).

**When to use:** PR-gate workflows where stale runs against superseded commits must be cancelled.

**Example:**
```yaml
# Source: 41-CONTEXT.md locked decisions + ARCHITECTURE.md §1 + Pitfall 7 explicit guidance
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: ['auto-fix/*']   # head-branch filter — matches Phase 43 branch convention

permissions:
  contents: read         # checkout + git operations
  pull-requests: write   # gh pr ready + gh pr comment + gh pr edit --add-label
  issues: read           # gh issue view (if affected-cases parser falls back to source issue)

concurrency:
  group: v40-verifier-gate-${{ github.event.pull_request.number }}
  cancel-in-progress: true   # PR-stale cancellation — see Pitfall 7 (verifier gate is READ-ONLY w.r.t. repo, so cancel-in-progress is safe; contrast Phase 42 auto-fix workflow which uses `false`)
```

**Note on branch filter:** `branches: ['auto-fix/*']` is the head-branch glob filter (GitHub Actions supports glob patterns for `branches:` under `pull_request`). Phase 42-43 will use the EXACT pattern `auto-fix/<issue-n>-<fp8>` per AUTOFIX-02 + AUTOFIX-04.

### Pattern 2: Diff-Size Cap Pre-Check (VFY-GATE-03)

**What:** Bash step parses `git diff --shortstat` output; fails the job if `src/` insertions+deletions > 200 OR `tests/` > 50.

**When to use:** Pre-checkout gate before any verifier execution; defense-in-depth (Phase 42 mirrors at script level).

**Example:**
```yaml
# Source: 41-CONTEXT.md Specifics §1 + REQUIREMENTS.md VFY-GATE-03
- name: Diff-size cap (src/ ≤ 200 LOC, tests/ ≤ 50 LOC)
  id: diff_size
  run: |
    git fetch origin main --depth=1
    # --shortstat output shape: " N files changed, X insertions(+), Y deletions(-)"
    # Insertions or deletions lines may be missing if zero — parse defensively.
    parse_shortstat() {
      local path="$1"
      local out
      out=$(git diff --shortstat origin/main..HEAD -- "$path" 2>/dev/null || echo "")
      local ins del
      ins=$(echo "$out" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
      del=$(echo "$out" | grep -oE '[0-9]+ deletion'  | grep -oE '[0-9]+' || echo 0)
      echo "$((ins + del))"
    }
    SRC_LOC=$(parse_shortstat "src/")
    TESTS_LOC=$(parse_shortstat "tests/")
    echo "src_loc=$SRC_LOC"   >> "$GITHUB_OUTPUT"
    echo "tests_loc=$TESTS_LOC" >> "$GITHUB_OUTPUT"
    if [ "$SRC_LOC" -gt 200 ] || [ "$TESTS_LOC" -gt 50 ]; then
      echo "::error::Diff exceeds caps — src/ $SRC_LOC>200 OR tests/ $TESTS_LOC>50"
      exit 1
    fi
  # Edge cases handled:
  #   - Deleted-only diffs: "0 insertions, N deletions" → parse_shortstat returns N
  #   - Renames: git diff --shortstat counts rename as both ins+del (proportional to file size); CONSERVATIVE behavior — large renames trip cap, which is intentional
  #   - Mixed src/+tests/: each scope is checked independently against its own cap
  #   - Empty diff: "" → both ins/del → 0 → 0+0=0 ≤ cap → pass
```

**Failure handling step (next step in same job):**
```yaml
- name: Label + comment on diff-size rejection
  if: failure() && steps.diff_size.outcome == 'failure'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_NUM: ${{ github.event.pull_request.number }}
    SRC_LOC: ${{ steps.diff_size.outputs.src_loc }}
    TESTS_LOC: ${{ steps.diff_size.outputs.tests_loc }}
  run: |
    # Idempotent label create (mirrors e2e-nightly.yml:97-102 pattern)
    gh label create "human-review-required" \
      --color "d93f0b" \
      --description "Auto-fix PR requires human review (size cap or diff-guard rejection)" \
      --force 2>/dev/null || true
    gh pr edit "$PR_NUM" --add-label "human-review-required"
    gh pr comment "$PR_NUM" --body "Diff-size cap exceeded — src/=$SRC_LOC (limit 200) tests/=$TESTS_LOC (limit 50). PR stays in draft for human review."
```

### Pattern 3: Diff-Guard Regex Bank Pre-Check (VFY-GATE-04)

**What:** A Node helper (`scripts/check-diff-guard.mjs`) maintains the canonical 6-path regex bank; YAML invokes it via stdin pipe from `git diff --name-only`.

**When to use:** Same as Pattern 2; runs BEFORE the verifier-pin step so verifier-gaming attempts via PR-side path modifications are rejected at workflow entry.

**The 6 LOCKED forbidden paths:**
1. `tests/test-cases.js` — the 76-case suite (modification = test-modification gaming, Pitfall 3 bypass #1)
2. `tests/golden/baseline.json` — the pinned baseline (modification = golden-edit gaming, Pitfall 3 bypass #2)
3. `tests/e2e/test-cases-quarantine.js` — quarantine corpus (test.skip / case-deletion gaming, Pitfall 3 bypass #3)
4. `.github/workflows/v40-*.yml` — the workflow files themselves (gate-disabling gaming)
5. `tests/e2e/.llm-spend-ledger.json` — committed ledger (Phase 39 LEDGER-04); modification = cost-accounting forgery
6. `.github/CODEOWNERS` — the gating manifest itself (CODEOWNERS-bypass gaming)

**Canonical regex bank (recommend `scripts/check-diff-guard.mjs`):**

```javascript
// Source: 41-CONTEXT.md Locked decisions + PITFALLS.md Pitfall 3 Defense 2
// scripts/check-diff-guard.mjs

export const FORBIDDEN_PATHS = [
  /^tests\/test-cases\.js$/,
  /^tests\/golden\/baseline\.json$/,
  /^tests\/e2e\/test-cases-quarantine\.js$/,
  /^\.github\/workflows\/v40-.*\.yml$/,
  /^tests\/e2e\/\.llm-spend-ledger\.json$/,
  /^\.github\/CODEOWNERS$/,
];

/**
 * @param {string[]} changedPaths
 * @returns {{ok: boolean, violations: string[]}}
 */
export function checkDiffGuard(changedPaths) {
  const violations = [];
  for (const p of changedPaths) {
    for (const re of FORBIDDEN_PATHS) {
      if (re.test(p)) { violations.push(p); break; }
    }
  }
  return { ok: violations.length === 0, violations };
}

// CLI shape: reads paths from stdin (one per line), exits 0/1, prints violations
if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    const paths = input.split('\n').filter(Boolean);
    const { ok, violations } = checkDiffGuard(paths);
    if (!ok) {
      console.error(`Diff-guard violations:\n  ${violations.join('\n  ')}`);
      process.exit(1);
    }
    process.exit(0);
  });
}
```

**Workflow invocation (in `diff-guard` job, after diff-size step):**
```yaml
- name: Diff-guard regex bank
  run: |
    git diff --name-only origin/main..HEAD | node scripts/check-diff-guard.mjs
```

**Note on workflow's own pre-check fallback:** If the helper is unavailable for any reason, the YAML can use an inline bash variant:
```bash
git diff --name-only origin/main..HEAD | grep -E \
  '^(tests/test-cases\.js|tests/golden/baseline\.json|tests/e2e/test-cases-quarantine\.js|\.github/workflows/v40-.*\.yml|tests/e2e/\.llm-spend-ledger\.json|\.github/CODEOWNERS)$' \
  && { echo "::error::diff touches forbidden path"; exit 1; } || true
```
The helper is **canonical** because Phase 42 `scripts/auto-fix.mjs` imports `checkDiffGuard` for pre-`git apply` rejection (AUTOFIX-03).

### Pattern 4: Verifier-Pin to origin/main (VFY-GATE-04 Defense 4)

**What:** After PR-branch checkout, restore verifier files from `origin/main` so PR-side mutations to those files are invisible to the gate.

**When to use:** Immediately before any verifier execution in the `verifier-gate` job.

**The verifier-pin file set (derived via grep on `import.*pdf-verifier`):**

| File | Why it's pinned | Source of truth |
|------|-----------------|------------------|
| `tests/e2e/lib/pdf-verifier.js` | The verifier itself — modification = direct gaming | `import.*pdf-verifier` grep: 5 callers including regression.spec.js, fault-injection.spec.js, e2e-rerun-validator.mjs |
| `tests/golden/baseline.json` | The reference data — modification = goldener-edit gaming | `baseline\.json` grep: 8 callers (specs, scripts, tests) |
| `tests/e2e/lib/pdf-fetch.js` | Verifier's PDF fetcher (verifier-pin keeps the fetch contract immune to PR-side cache-bypass tricks) | `pdf-verifier.js:56` imports `./pdf-fetch.js` (`ensureCachedPdf`) |

**Files NOT pinned (and why):**
- `tests/e2e/lib/pdf-snippet.js` — independent re-cluster used only for diagnostic snippets; not a verifier dependency (confirmed via grep: `pdf-snippet.js:118` explicitly disclaims `pdf-verifier.js` dependency)
- `tests/e2e/lib/golden-loader.js` — **does not exist** (grep confirms no such file); CONTEXT.md mentioned it speculatively with `(?)` — drop from pin list
- `tests/test-cases.js` — DELIBERATELY pinned to PR branch (the 76-case regression runs against the PR-branch version; the diff-guard bank rejects modifications)
- `package.json` / `package-lock.json` — verifier's pdfjs-dist is pinned via `verifierDeps` (Phase 40-04); the package.json `verifierDeps` field is read by `pdf-verifier.js:69` and cross-checked by Phase 47 audit. Pinning the WHOLE package.json would over-constrain (other dep updates legitimately appear in PR).

**Example:**
```yaml
# Source: 41-CONTEXT.md Specifics §5 + PITFALLS.md Pitfall 3 Defense 4
- uses: actions/checkout@v4
  with:
    ref: ${{ github.event.pull_request.head.sha }}
    fetch-depth: 0   # need history for `git checkout origin/main -- <file>`

- name: Pin verifier files to origin/main
  run: |
    git fetch origin main
    git checkout origin/main -- tests/e2e/lib/pdf-verifier.js
    git checkout origin/main -- tests/golden/baseline.json
    git checkout origin/main -- tests/e2e/lib/pdf-fetch.js
    # Optional verification (sanity check — if pin failed, diff would be non-zero):
    if [ "$(git diff origin/main -- tests/e2e/lib/pdf-verifier.js | wc -l)" != "0" ]; then
      echo "::error::verifier pin failed for pdf-verifier.js"
      exit 1
    fi
```

### Pattern 5: 3× Consecutive Run Loop

**What:** A bash for-loop that invokes the CLI shim 3 times, each producing its own report JSON; the workflow asserts ALL 3 tier values ∈ {A, B} before exiting 0.

**When to use:** The verifier-gate's affected-case verification step (VFY-GATE-01 core invariant).

**Example:**
```yaml
# Source: 41-CONTEXT.md Specifics §2 + Locked decisions ("3× consecutive runs")
- name: Verify affected cases 3× consecutively
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_NUM: ${{ github.event.pull_request.number }}
  run: |
    # Parse <!-- affected_cases: id1,id2 --> from PR body via Node helper
    CASES=$(gh pr view "$PR_NUM" --json body --jq '.body' | node scripts/parse-affected-cases.mjs)
    if [ -z "$CASES" ]; then
      echo "::error::PR body missing or empty <!-- affected_cases: ... --> comment"
      exit 1
    fi

    FAILED_CASES=""
    for case_id in $CASES; do
      echo "::group::Verify $case_id (3 consecutive runs)"
      mkdir -p playwright-report
      ALL_PASS=true
      for i in 1 2 3; do
        REPORT="playwright-report/single-case-${case_id}-run-${i}.json"
        if ! node scripts/verify-single-case.mjs --case "$case_id" --output "$REPORT"; then
          echo "::warning::run $i FAILED for $case_id (tier C or below)"
          ALL_PASS=false
        else
          # Defensive tier assertion (script exit 0 already implies Tier A/B,
          # but re-read the JSON for the workflow log)
          TIER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPORT','utf8')).tier_used)")
          echo "run $i tier=$TIER"
          if [ "$TIER" != "A" ] && [ "$TIER" != "B" ]; then
            ALL_PASS=false
          fi
        fi
      done
      if [ "$ALL_PASS" != "true" ]; then
        FAILED_CASES="$FAILED_CASES $case_id"
      fi
      echo "::endgroup::"
    done

    if [ -n "$FAILED_CASES" ]; then
      echo "::error::Cases failed 3× verification:$FAILED_CASES"
      gh pr comment "$PR_NUM" --body "Verifier-gate FAIL — cases$FAILED_CASES did not pass 3 consecutive Tier A/B runs. PR stays draft."
      exit 1
    fi
```

### Pattern 6: Affected-Cases Parser (Node helper)

**What:** A small Node script that parses `<!-- affected_cases: id1,id2 -->` from PR body — robust to whitespace, newlines, and multi-line variants.

**When to use:** Called by the verifier-gate workflow to extract the case list before the 3× loop.

**Example helper (`scripts/parse-affected-cases.mjs`):**

```javascript
// Source: 41-CONTEXT.md Specifics §"Affected-cases parser"
// scripts/parse-affected-cases.mjs
//
// Parses <!-- affected_cases: id1,id2 --> (single-line) AND
// <!-- affected_cases:\nid1\nid2\n--> (multi-line) variants.
// Output: space-separated case IDs to stdout (consumable by bash for-loop).

/**
 * @param {string} prBody
 * @returns {string[]} parsed case IDs (empty array if no match)
 */
export function parseAffectedCases(prBody) {
  if (typeof prBody !== 'string' || prBody.length === 0) return [];
  // Match block: <!-- affected_cases: ... --> (DOTALL via [\s\S])
  const m = prBody.match(/<!--\s*affected_cases\s*:\s*([\s\S]*?)\s*-->/);
  if (!m) return [];
  // Inner content: split on comma OR newline, trim, drop empties
  return m[1]
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', () => {
    const ids = parseAffectedCases(input);
    process.stdout.write(ids.join(' '));
  });
}
```

**Vitest test fixtures (variants to cover):**
- Single line: `<!-- affected_cases: US123-1,US456-2 -->`
- Multi-line: `<!-- affected_cases:\nUS123-1\nUS456-2\n-->`
- Whitespace-heavy: `<!--   affected_cases:   US123-1 ,  US456-2   -->`
- Mixed in PR body with other content (HTML comments + markdown)
- Missing: returns `[]`
- Empty: returns `[]`

### Pattern 7: CLI Shim Argv + Exit-Code Contract

**What:** `scripts/verify-single-case.mjs` parses `--case <id>`, optional `--runs N` (default 1), optional `--output <path>`; calls `verifyCitation` once per requested run (or N times if `--runs > 1`); writes JSON report; exits 0 (Tier A/B), 1 (Tier C/D), 2 (argv error).

**When to use:** Invoked by the workflow's 3× loop; locked signature per CONTEXT.md.

**Example shim:**

```javascript
// Source: 41-CONTEXT.md Locked decisions ("CLI shim signature")
// scripts/verify-single-case.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCitation } from '../tests/e2e/lib/pdf-verifier.js';
import { TEST_CASES } from '../tests/test-cases.js';
import baseline from '../tests/golden/baseline.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgv(argv) {
  const out = { case: null, runs: 1, output: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--case')   out.case = argv[++i];
    else if (k === '--runs') out.runs = parseInt(argv[++i], 10);
    else if (k === '--output') out.output = argv[++i];
    else { console.error(`unknown flag: ${k}`); process.exit(2); }
  }
  if (!out.case) { console.error('--case <id> required'); process.exit(2); }
  if (!Number.isInteger(out.runs) || out.runs < 1) {
    console.error('--runs must be positive integer'); process.exit(2);
  }
  return out;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const tc = TEST_CASES.find((t) => t.id === args.case);
  if (!tc) { console.error(`case ${args.case} not in TEST_CASES`); process.exit(2); }
  const expected = baseline[args.case];
  if (!expected) { console.error(`case ${args.case} not in baseline`); process.exit(2); }

  const outPath = args.output || `playwright-report/single-case-${args.case}-runs-${args.runs}.json`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const runs = [];
  let allPassed = true;
  for (let i = 1; i <= args.runs; i++) {
    const verdict = await verifyCitation({
      patentId: tc.patentId,
      selectedText: tc.selectedText,
      observedCitation: expected.citation,
    });
    runs.push({ run: i, ...verdict });
    if (verdict.tier_used !== 'A' && verdict.tier_used !== 'B') allPassed = false;
  }

  fs.writeFileSync(outPath, JSON.stringify({
    case_id: args.case,
    runs_requested: args.runs,
    runs,
    all_passed_tier_ab: allPassed,
  }, null, 2));

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Output JSON shape (consumed by workflow + downstream Phase 42 reporting):**
```json
{
  "case_id": "US11427642-spec-short-1",
  "runs_requested": 1,
  "runs": [
    {
      "run": 1,
      "status": "pass",
      "tier_used": "A",
      "cited_text_window": "...",
      "match_offset_lines": 0,
      "reason": "exact match at cited 1:26-27 (Tier A)",
      "pdf_path": "/path/to/cache.pdf",
      "pages_parsed": 42,
      "duration_ms": 1234
    }
  ],
  "all_passed_tier_ab": true
}
```

### Pattern 8: 76-Case Regression Job (VFY-GATE-02)

**What:** A parallel job to `verifier-gate` that runs the full 76-case suite against the PR branch (NOT pinned). Reuses `e2e-nightly.yml`'s exact invocation shape.

**Why parallel:** Failure isolation + wall-clock optimization. If the 3× affected-case verifier passes but a regression appears elsewhere in the 76-case suite, the workflow surfaces BOTH signals (vs. fail-fast which would hide one).

**Example:**
```yaml
regression-suite:
  needs: diff-guard
  runs-on: ubuntu-latest
  timeout-minutes: 30   # matches e2e-nightly.yml line 50
  steps:
    - uses: actions/checkout@v4
      with:
        ref: ${{ github.event.pull_request.head.sha }}
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - name: Cache Playwright Chromium
      id: pw-cache
      uses: actions/cache@v4
      with: { path: ~/.cache/ms-playwright, key: pw-${{ runner.os }}-${{ hashFiles('package.json') }} }
    - if: steps.pw-cache.outputs.cache-hit != 'true'
      run: npx playwright install chromium
    - run: npm run build:chrome
    - name: Run 76-case regression suite
      run: |
        npx playwright test \
          --config tests/e2e/playwright.config.js \
          specs/regression.spec.js
      # NO --grep filter — full 76 cases against PR branch
      # NO continue-on-error — gate must FAIL on regression (Pitfall 8 #4)
```

### Pattern 9: gh pr ready (Draft → Ready Transition)

**What:** Single `gh` CLI call in the final `ready-flip` job. Permission is `pull-requests: write` (verified — see Sources §Secondary).

**When to use:** ONLY after all three sub-checks pass (diff-guard + verifier-gate + regression-suite).

**Example:**
```yaml
ready-flip:
  needs: [verifier-gate, regression-suite]
  runs-on: ubuntu-latest
  timeout-minutes: 5
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_NUM: ${{ github.event.pull_request.number }}
  steps:
    - name: Flip draft → ready
      run: |
        gh pr ready "$PR_NUM"
        gh pr comment "$PR_NUM" --body "Verifier-gate: all 3 affected-case runs Tier A/B + 76-case regression clean. Draft → ready-for-review."
```

**Permission contract:** Per cli/cli Discussion #6379 and gh CLI source, `gh pr ready` calls `mutation MarkPullRequestReadyForReview` via GraphQL with the workflow's `GITHUB_TOKEN`. `pull-requests: write` is sufficient. **NO PAT required** (preserves Pitfall 4 invariant — Phase 39/40 conventions enforce `secrets.GITHUB_TOKEN` only).

**Caveat (documented in cli/cli #6274):** `gh pr edit --add-label` requires both `pull-requests: write` AND `repository-projects: read` for the project-name resolution step — but the diff-guard rejection path uses `gh pr edit --add-label "human-review-required"`. If 403 errors appear in CI, add `repository-projects: read` to the workflow's `permissions` block. Recommend including it preemptively.

### Anti-Patterns to Avoid

- **`pull_request_target` trigger:** Runs with base-branch workflow file but PR-branch CODE — gives PR-side code write access to repo context. NEVER use; `pull_request` is correct (matches Pitfall 8 #4).
- **`synchronize` removal:** Tempting to drop `synchronize` from triggers to save cost on PR-update churn, but that breaks the contract: every push to the PR branch is a new opportunity to game the gate. KEEP `synchronize`; control cost via `cancel-in-progress: true`.
- **Parallel 3× runs via matrix:** Locked decision is CONSECUTIVE. Matrix adds 3× job startup overhead + parallelism hides flakiness (which is what 3× is meant to surface).
- **Continue-on-error: true anywhere in verifier-gate.yml:** Pitfall 8 #4 — verifier-gate MUST be gating. Adding `continue-on-error` silently green-lights regressions. The `e2e-nightly.yml` use of continue-on-error is for issue-filing (failure IS the signal); verifier-gate is the OPPOSITE — failure is BLOCKING.
- **Inline diff-guard in YAML only:** Hard to test, duplicated in Phase 42 `auto-fix.mjs`. Factor as `scripts/check-diff-guard.mjs`.
- **Auto-creating non-LOCKED labels:** Only `human-review-required` label is mentioned in CONTEXT.md. If grep verification fails (it does), use the idempotent `gh label create --force 2>/dev/null || true` pattern from `e2e-nightly.yml:97-102` — DO NOT proliferate new label families.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML argv parsing | Custom shell argv parser | `node` with built-in `process.argv` | One file, three flags — built-ins are fine; libraries add deps |
| Markdown / HTML comment parsing | Generic markdown parser | Regex `/<!--\s*affected_cases\s*:\s*([\s\S]*?)\s*-->/` (Pattern 6) | Single well-defined format; full markdown parse adds 200KB+ of deps |
| Diff-size computation | Custom git plumbing | `git diff --shortstat` + regex parse (Pattern 2) | git already does this; reinventing pipes errors silently |
| Diff path matching | Custom file-tree walk | `git diff --name-only` + regex bank (Pattern 3) | git is the source of truth for "what changed" |
| Draft → ready transition | Direct GraphQL mutation | `gh pr ready` | gh handles auth + retry + permission errors; one less surface to maintain |
| 76-case test execution | Custom Playwright invocation | `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` | Direct re-use of `e2e-nightly.yml` shape — zero new logic |
| PR-event branch filter | Custom `if: startsWith(github.head_ref, 'auto-fix/')` | `on.pull_request.branches: ['auto-fix/*']` | Native GitHub Actions glob support; cleaner contract |

**Key insight:** Every "hand-roll trap" in this phase has a 1-line gh/git/native-Actions equivalent. The only NEW code is the CLI shim (~60 LOC) + 2 small helpers (~25 LOC each) + 1 YAML workflow + 1 YAML-contract test file. Total project addition: ~400-500 LOC across 6 files.

## Runtime State Inventory

**Not applicable** — Phase 41 is a greenfield workflow + greenfield CLI shim addition. No renames, no refactors, no migrations. The pre-existing `verifyCitation` entry point in `pdf-verifier.js` is consumed unchanged (VFY-02 isolation preserved). No stored data, no live service config, no OS-registered state, no secrets/env vars, and no build artifacts carry stale state from a prior shape because there IS no prior shape.

State explicitly confirmed:
- **Stored data:** None — verified by grep (`tests/golden/baseline.json` and `tests/test-cases.js` are inputs, not state mutated by this phase)
- **Live service config:** None — branch protection ruleset binding deferred to Phase 47 by LOCKED decision
- **OS-registered state:** None — no scheduled tasks, no daemons, no system services
- **Secrets / env vars:** Reuses `secrets.GITHUB_TOKEN` only (Phase 39/40 convention); no new secrets introduced
- **Build artifacts:** None — workflow runs `npm ci` from scratch per execution

## Common Pitfalls

### Pitfall A: Workflow doc-block comments tripping negative-grep assertions (Phase 40-03 already-burned scar)

**What goes wrong:** YAML header comments that literally include forbidden tokens (e.g., explaining "we do NOT use `auto-merge: true` because...") false-positive on Vitest `toContain` negative assertions.

**Why it happens:** Vitest's `toContain` matches whole-file text including comments. Phase 40-03 burned ~30 minutes auto-fixing this.

**How to avoid:** Pre-emptively paraphrase forbidden tokens in comments. From 40-03-SUMMARY §"Comment paraphrase discipline":
- `[skip ci]` → "skip-ci token"
- `gh pr merge --auto` → "the gh pr merge auto-flag"
- `auto-merge: true` → "the action auto-merge input"
- `id-token: write` and `actions: write` → "Identity-token and actions-write permissions are intentionally absent"

**Warning signs:** YAML-grep tests passing on first try is unusual; if a negative assertion fails on the GREEN run, search for the literal token in the YAML comment block and rephrase.

### Pitfall B: Verifier-pin step missing fetch-depth

**What goes wrong:** `actions/checkout@v4` defaults to `fetch-depth: 1` (shallow). `git checkout origin/main -- <file>` requires the main branch to be in local history.

**Why it happens:** Easy to miss; works in interactive dev where `git fetch origin main` succeeds (then checkout works), but the shallow-default checkout has no origin/main reference cached.

**How to avoid:** Either set `fetch-depth: 0` in the checkout step OR explicitly `git fetch origin main` before the pin checkout.

**Warning signs:** `error: pathspec 'origin/main' did not match any file(s) known to git` — exact error string to grep for in workflow logs.

### Pitfall C: Affected-cases parser returning empty silently

**What goes wrong:** PR body missing the `<!-- affected_cases: ... -->` comment → parser returns `[]` → for-loop runs zero iterations → workflow "passes" with zero cases verified → false-positive Ready flip.

**Why it happens:** Empty list is a legitimate parser output (no match found); but the workflow MUST treat empty as a FAILURE (gating contract).

**How to avoid:** Explicit empty-check in the workflow step BEFORE the for-loop: `if [ -z "$CASES" ]; then exit 1; fi`. Also assert in Vitest that the helper returns `[]` (not `null` or `undefined`) on missing input.

**Warning signs:** A PR that should have failed gate flips to ready with zero verifier log output — the for-loop ran zero times.

### Pitfall D: gh pr ready called on already-ready PR

**What goes wrong:** Re-running the workflow on an already-ready PR (e.g., manual workflow_dispatch after a green run) → `gh pr ready` returns non-zero ("pull request is not in draft state") → workflow fails on idempotent re-run.

**Why it happens:** `gh pr ready` does NOT have a `--force` or `--idempotent` flag.

**How to avoid:** Wrap in a defensive check: `gh pr view "$PR_NUM" --json isDraft --jq '.isDraft' | grep -q true && gh pr ready "$PR_NUM"`. Recommend adding to the final job.

**Warning signs:** Workflow failure with `pull request is not in draft state` on a workflow_dispatch re-run.

### Pitfall E: 3× loop's middle-run failure leaking into report file overwrite

**What goes wrong:** Run 1 passes (writes report-1.json), run 2 fails AND triggers script exit 1 → for-loop's `|| exit 1` aborts → run 3 never executes → report-3.json never written. Workflow tries to read all 3 report files for the tier check → fails with "file not found."

**Why it happens:** Conflating "fail the workflow on any failure" with "fail-fast on first run failure" — these are different. The contract is "all 3 must pass," not "stop at first failure."

**How to avoid:** Either (a) capture exit code without aborting (`set +e; ... ; rc=$?; set -e`), OR (b) run all 3 unconditionally, then check ALL_PASS at the end (Pattern 5 above does this — note the `|| true`-equivalent control flow).

**Warning signs:** Workflow logs show "run 1 PASS, run 2 FAIL" with no "run 3" log line, then "report-3.json not found" error in the tier-check step.

### Pitfall F: Stale `origin/main` after long-running PR

**What goes wrong:** A PR that sat open for weeks → `origin/main` advanced → the verifier-pin pulls a NEWER `pdf-verifier.js` than the PR author tested against. The gate may now FAIL on cases that previously passed.

**Why it happens:** This is the INTENDED behavior (pin = current source of truth) but can surprise PR authors.

**How to avoid:** This is a feature, not a bug — document in the rejection comment: "Verifier was updated on main since this PR opened; consider rebasing." Workflow does NOT need to compensate.

**Warning signs:** PR comment surge of "this used to pass" complaints after a verifier change — that's working as intended.

## Code Examples

Verified patterns from already-shipped Phase 39/40 workflows + the pdf-verifier source:

### Complete workflow skeleton (full file outline — planner expands)

```yaml
# .github/workflows/v40-verifier-gate.yml
#
# Phase 41 (VFY-GATE-01 + VFY-GATE-02 + VFY-GATE-03 + VFY-GATE-04) — PR gate
# for auto-fix/* branches. Three sequential jobs: diff-guard (fail-fast on
# size cap + path bank) → verifier-gate + regression-suite (parallel after
# diff-guard) → ready-flip (only if both pass).
#
# The job name `verifier-gate` is the Phase 47 CLEANUP-04 required-status-
# checks slot — Phase 41 ships the name; Phase 47 binds it to the ruleset.
# Do NOT rename without coordinating Phase 47 (40-03-SUMMARY pattern).
#
# Security note: contents:read + pull-requests:write + issues:read + project-
# read are the minimum-privilege set. The gh pr edit add-label step needs the
# project-read permission per cli/cli issue 6274. Identity-token and actions-
# write permissions are intentionally absent.

name: V40 Verifier Gate

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: ['auto-fix/*']

permissions:
  contents: read
  pull-requests: write
  issues: read
  repository-projects: read   # gh pr edit add-label dependency (cli/cli #6274)

concurrency:
  group: v40-verifier-gate-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  diff-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      src_loc: ${{ steps.diff_size.outputs.src_loc }}
      tests_loc: ${{ steps.diff_size.outputs.tests_loc }}
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Diff-size cap
        id: diff_size
        run: |
          # [Pattern 2 body inlined here — git diff --shortstat parse + cap check]
      - name: Diff-guard regex bank
        run: |
          git diff --name-only origin/main..HEAD | node scripts/check-diff-guard.mjs
      - name: Label + comment on rejection
        if: failure()
        run: |
          # [Pattern 2 failure-handling step body]

  verifier-gate:
    needs: diff-guard
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUM: ${{ github.event.pull_request.number }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Cache Playwright Chromium
        uses: actions/cache@v4
        with: { path: ~/.cache/ms-playwright, key: pw-${{ runner.os }}-${{ hashFiles('package.json') }} }
      - run: npx playwright install chromium
      - run: npm run build:chrome
      - name: Pin verifier files to origin/main
        run: |
          # [Pattern 4 body — git checkout origin/main -- <3 files>]
      - name: Verify affected cases 3× consecutively
        run: |
          # [Pattern 5 body — parse-affected-cases + for-loop + tier assert]

  regression-suite:
    needs: diff-guard
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      # [Pattern 8 body — 76-case regression invocation]

  ready-flip:
    needs: [verifier-gate, regression-suite]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      PR_NUM: ${{ github.event.pull_request.number }}
    steps:
      - name: Flip draft → ready
        run: |
          # [Pattern 9 body — gh pr ready + gh pr comment]
```

### YAML-level static-grep test (mirroring 40-03 D1-D11 + X1-X8 structure)

```javascript
// tests/e2e/scripts/v40-verifier-gate-yaml.test.js
// Source: Phase 40-03 test file pattern (tests/e2e/scripts/v40-deps-update-yaml.test.js)
// Naming convention: V1-V12 (verifier-gate core) + X1-X10 (extra Pitfall defenses)

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const YAML_PATH = path.resolve(PROJECT_ROOT, '.github/workflows/v40-verifier-gate.yml');

let yaml;
beforeAll(() => { yaml = fs.readFileSync(YAML_PATH, 'utf8'); });

describe('v40-verifier-gate.yml contract (Phase 41)', () => {
  // V1: Trigger
  it("V1 — pull_request types include opened, synchronize, reopened", () => {
    expect(yaml).toMatch(/types:\s*\[opened,\s*synchronize,\s*reopened\]/);
  });
  // V2: Branch filter
  it("V2 — branches filter includes 'auto-fix/*'", () => {
    expect(yaml).toMatch(/branches:\s*\['auto-fix\/\*'\]/);
  });
  // V3: Concurrency
  it("V3 — concurrency.group is PR-scoped, cancel-in-progress: true", () => {
    expect(yaml).toContain('group: v40-verifier-gate-${{ github.event.pull_request.number }}');
    expect(yaml).toContain('cancel-in-progress: true');
  });
  // V4: Permissions minimization
  it("V4 — permissions: contents:read, pull-requests:write, issues:read", () => {
    expect(yaml).toContain('contents: read');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('issues: read');
  });
  // V5: Diff-guard job exists
  it("V5 — diff-guard job exists by exact name", () => {
    expect(yaml).toMatch(/^\s+diff-guard:/m);
  });
  // V6: verifier-gate job exists (Phase 47 slot reservation)
  it("V6 — verifier-gate job exists by exact name (Phase 47 slot)", () => {
    expect(yaml).toMatch(/^\s+verifier-gate:/m);
  });
  // V7: regression-suite job + 76-case invocation
  it("V7 — regression-suite invokes playwright + regression.spec.js", () => {
    expect(yaml).toMatch(/^\s+regression-suite:/m);
    expect(yaml).toContain('npx playwright test');
    expect(yaml).toContain('specs/regression.spec.js');
  });
  // V8: Diff-size caps
  it("V8 — diff-size cap literals 200 + 50 present", () => {
    expect(yaml).toMatch(/-gt 200/);
    expect(yaml).toMatch(/-gt 50/);
  });
  // V9: Verifier-pin step
  it("V9 — git checkout origin/main pins all three verifier files", () => {
    expect(yaml).toContain('git checkout origin/main -- tests/e2e/lib/pdf-verifier.js');
    expect(yaml).toContain('git checkout origin/main -- tests/golden/baseline.json');
    expect(yaml).toContain('git checkout origin/main -- tests/e2e/lib/pdf-fetch.js');
  });
  // V10: 3× loop literal
  it("V10 — bash for-loop 'for i in 1 2 3' present", () => {
    expect(yaml).toMatch(/for i in 1 2 3/);
  });
  // V11: CLI shim invocation
  it("V11 — verify-single-case.mjs invoked with --case + --output", () => {
    expect(yaml).toContain('node scripts/verify-single-case.mjs');
    expect(yaml).toContain('--case');
    expect(yaml).toContain('--output');
  });
  // V12: gh pr ready in final job
  it("V12 — gh pr ready in ready-flip job", () => {
    expect(yaml).toMatch(/^\s+ready-flip:/m);
    expect(yaml).toContain('gh pr ready');
  });

  // X1-X10: Negative-pin defenses
  it("X1 — secrets.GITHUB_TOKEN, NOT a PAT", () => {
    expect(yaml).toContain('${{ secrets.GITHUB_TOKEN }}');
    expect(yaml).not.toMatch(/secrets\.[A-Z_]*PAT[A-Z_]*/);
  });
  it("X2 — no continue-on-error in gating steps", () => {
    expect(yaml).not.toContain('continue-on-error: true');
  });
  it("X3 — no gh pr merge auto-flag", () => {
    expect(yaml).not.toContain('gh pr merge --auto');
  });
  it("X4 — no action auto-merge input", () => {
    expect(yaml).not.toContain('auto-merge: true');
  });
  it("X5 — no id-token or actions:write permissions", () => {
    expect(yaml).not.toContain('id-token: write');
    expect(yaml).not.toContain('actions: write');
  });
  it("X6 — no pull_request_target trigger", () => {
    expect(yaml).not.toContain('pull_request_target');
  });
  it("X7 — diff-guard forbidden paths bank present", () => {
    // Either through helper invocation OR inline grep
    expect(yaml).toMatch(/check-diff-guard\.mjs|tests\/test-cases\.js.*baseline\.json.*test-cases-quarantine\.js/s);
  });
  it("X8 — human-review-required label gh label create + add-label invocations", () => {
    expect(yaml).toContain('human-review-required');
  });
  it("X9 — fetch-depth: 0 on checkout (needed for origin/main pin)", () => {
    expect(yaml).toMatch(/fetch-depth:\s*0/);
  });
  it("X10 — node-version: 22 literal pin", () => {
    expect(yaml).toMatch(/node-version:\s*22/);
  });
});
```

## 6-Layer Verifier-Gate-Gaming Defense — Phase Allocation

Per PITFALLS.md Pitfall 3 enumeration, the 6 layered defenses are allocated as follows:

| Layer | Defense | Phase Owner | Status in Phase 41 |
|-------|---------|-------------|-------------------|
| 1 | Runtime file allow-list (auto-fix agent CANNOT write forbidden paths) | Phase 42 (`auto-fix.mjs`) | Out of scope — deferred. Phase 42 ships this. |
| 2 | Diff-guard regex bank rejecting forbidden paths | Phase 41 (workflow pre-check) + Phase 42 (`auto-fix.mjs` pre-`git apply` rejection) | **Phase 41 ships workflow-level + the canonical Node helper** (`scripts/check-diff-guard.mjs`) which Phase 42 imports |
| 3 | CODEOWNERS pinning forbidden paths to `@tonyrowles` | Phase 39 (CLEANUP-04 initial setup) | **DONE** — confirmed via `.github/CODEOWNERS` grep |
| 4 | Verifier pinned to `origin/main` during PR gate | Phase 41 | **Ships in this phase** (Pattern 4) |
| 5 | Test-count invariants (`tests/test-cases.js` length BEFORE ≤ AFTER) | Phase 41 (recommend) OR Phase 45 (defer) | **Recommend Phase 41 INCLUDE** — adds ~10 LOC to diff-guard job; the path is forbidden anyway (Layer 2), so test-count is redundant defense-in-depth. Planner discretion: include or defer. |
| 6 | Independent canary case set | Deferred (Phase 45?) | Out of scope. The 76-case regression suite (VFY-GATE-02) partially serves this role — every fix PR runs against the FULL existing corpus including cases unrelated to the affected ones. True canaries (deliberately-curated cases the agent never sees) come later. |

**Recommendation:** Phase 41 ships Layers 2 + 4 (and the planner's discretion: 5). Layers 1, 3, 6 are owned by other phases per the locked phase plan.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Branch protection rules (legacy UI) | Branch protection RULESETS | GitHub generally-available 2025-11 | Phase 39 used rulesets (id 17086676); Phase 41's `verifier-gate` job name will be bound to ruleset's `required_status_checks` in Phase 47 |
| `actions/github-script@v6` for PR ops | `gh` CLI in workflow steps | Project convention since v3.1 | Phase 41 uses gh exclusively — no github-script |
| Workflow-scoped concurrency (`group: ${{ github.workflow }}`) | Per-resource concurrency (`group: <name>-${{ event.X.number }}`) | Pitfall 7 (PITFALLS.md 2026-05-30) | Phase 41 uses PR-number-scoped; `cancel-in-progress: true` is OK because gate is READ-ONLY w.r.t. the repo (contrast Phase 42 auto-fix which uses `false`) |
| Hand-written ledger JSON | `appendLedgerEntry` invocation | Phase 39 (Pitfall 1 mitigation) | Not applicable to Phase 41 (no ledger writes here) but the principle generalizes: trust the helper, not literal JSON |

**Deprecated/outdated:**
- `actions/setup-node@v3` (was used pre-Phase 39) → v4 is the project standard
- `actions/cache@v3` → v4 (Phase 40-03 convention)
- PATs for any workflow operation → `secrets.GITHUB_TOKEN` exclusively (Pitfall 4 + Phase 40-03 X1 grep)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh pr ready` works with `pull-requests: write` only | §Pattern 9 + Sources | LOW — cli/cli Discussion #6379 corroborates for `gh pr merge`; `gh pr ready` calls a simpler mutation. Confirm in 41 dry-run with manual `auto-fix/test` branch. If 403s, document and elevate to PAT (forbidden by Pitfall 4) OR file gh CLI bug. |
| A2 | `gh pr edit --add-label` works with `pull-requests: write` only OR requires `repository-projects: read` | §Pattern 9 | LOW — cli/cli #6274 shows `repository-projects: read` MAY be needed; recommend including preemptively. Cost: zero (one extra permission line). |
| A3 | The `human-review-required` label exists or is auto-created by the workflow | §User Constraints + Pattern 2 | MEDIUM — CONTEXT.md claims it's "the existing v3.1 label per triage-classifier.js" but grep confirms NO such string in code. Either CONTEXT.md is wrong about the source OR the label needs to be added. Recommend: workflow uses `gh label create --force 2>/dev/null \|\| true` (idempotent — same pattern as `e2e-nightly.yml:97-102`). See Open Question 1. |
| A4 | `git diff --shortstat` output format `" N files changed, X insertions(+), Y deletions(-)"` is stable across git versions ubuntu-latest ships | §Pattern 2 | LOW — gold-standard git output, stable since git 1.x. Parser uses defensive regex extraction (handles missing insertions OR deletions lines). |
| A5 | GitHub Actions `branches: ['auto-fix/*']` glob filter for `pull_request` head branches works as documented | §Pattern 1 | LOW — official Actions docs confirm glob support. If misbehaving in practice, fallback is `if: startsWith(github.head_ref, 'auto-fix/')` at job level. |
| A6 | `npx playwright test --config tests/e2e/playwright.config.js specs/regression.spec.js` runs 76 cases when invoked without `--grep` filter | §Pattern 8 | LOW — `tests/test-cases.js` exports 76 entries (grep confirmed); `regression.spec.js:29-30` imports `TEST_CASES` and uses `baseline[caseId]`; the spec generates one test per case. The 76-case count is verified. |
| A7 | The verifier-pin file set is the COMPLETE set needed for `verifyCitation` to operate against `origin/main`'s logic | §Pattern 4 | LOW — verified via grep of `pdf-verifier.js` imports: only `pdf-fetch.js` is internal-to-tests dep. All other imports are node:builtins + `pdfjs-dist` (verifier-pinned via `verifierDeps`). |
| A8 | The CONTEXT.md mention of `tests/e2e/lib/golden-loader.js` is a speculative placeholder (marked `(?)`) | §Pattern 4 | LOW — grep confirms no such file exists. Treated as planner-time speculation, dropped from pin list. |

## Open Questions

1. **`human-review-required` label provenance**
   - **What we know:** CONTEXT.md claims it's "the existing v3.1 label per `tests/e2e/lib/triage-classifier.js`"; reuse with no creation.
   - **What's unclear:** grep of `human.review.required` in `tests/`, `scripts/`, `.github/workflows/`, `src/` returns ZERO matches (only `.planning/` planning docs). The label may exist on GitHub-side (created out-of-band by a human) OR may be entirely planning-only — there's no code evidence.
   - **Recommendation:** Workflow uses idempotent `gh label create "human-review-required" --color "d93f0b" --description "Auto-fix PR requires human review" --force 2>/dev/null || true` (mirrors `e2e-nightly.yml:97-102` pattern). Cost is zero on the create-if-exists path; eliminates dependency on out-of-band label state. Planner should NOT treat CONTEXT.md's claim as gospel here — the idempotent create is strictly safer.

2. **Test-count invariant (Layer 5 defense) — include in Phase 41 or defer?**
   - **What we know:** Pitfall 3 Defense 5 recommends asserting `tests/test-cases.js` and `tests/golden/baseline.json` entry count is NEVER smaller in the PR than in `origin/main`. The diff-guard regex bank (Layer 2) ALREADY rejects modifications to these files, so test-count is fully redundant.
   - **What's unclear:** Whether the planner wants the defense-in-depth or wants to keep Phase 41 minimal.
   - **Recommendation:** Plan it as an OPTIONAL diff-guard sub-step (~10 LOC) — easy to drop if scope is tight; cheap to keep if scope allows. I lean toward INCLUDE since the cost is trivial and defense-in-depth on the trust invariant is worth ~10 LOC.

3. **Should diff-guard be a separate job, or sub-steps of verifier-gate?**
   - **What we know:** Three-job split (diff-guard → verifier-gate + regression → ready-flip) is the recommendation. Two-job split (diff-guard fold into verifier-gate) is also valid.
   - **What's unclear:** Whether the parallel cost (3 ubuntu-latest jobs spinning up) is worth the failure-isolation benefit.
   - **Recommendation:** THREE jobs. Failure isolation matters — if diff-guard fails, we want the rejection comment posted FAST (under 1 min) rather than waiting for verifier-gate's `npm ci + playwright cache` (3-5 min) to run before the diff-guard fail. The parallel cost is negligible (each job startup ~20s; total 1-2 min added).

4. **Should the affected-cases parser handle FALLBACK to source issue body?**
   - **What we know:** CONTEXT.md mentions `issues:read` permission "for `gh issue view` of the source issue if affected_cases parsing needs to fall back to issue body."
   - **What's unclear:** Whether Phase 41 should ship this fallback OR defer to a later refinement.
   - **Recommendation:** DEFER — Phase 43 (`v40-auto-fix.yml`) is responsible for ensuring `<!-- affected_cases: ... -->` is ALWAYS present in the PR body it opens (AUTOFIX-02). Phase 41 can assume the contract holds; missing affected_cases → workflow fails (per Pitfall C above). If Phase 43 ships with a bug, that's a Phase 43 fix, not a Phase 41 workaround.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `node` 22 | CLI shim + helpers + Vitest | ✓ (CI runner via actions/setup-node@v4) + ✓ (local dev assumed) | 22.x | None — locked decision |
| `npm` | `npm ci` in workflow | ✓ (bundled with node) | bundled | None |
| `gh` CLI | All PR operations | ✓ (ubuntu-latest pre-installed) | runner-bundled (current) | None |
| `git` | diff operations + verifier-pin | ✓ (ubuntu-latest pre-installed) | runner-bundled (2.x) | None |
| Playwright + Chromium | 76-case regression | ✓ (existing devDep + cache pattern from e2e-nightly.yml) | pinned via package.json | None |
| `pdfjs-dist` | verifyCitation in shim | ✓ (existing, Phase 40-04 verifierDeps pin) | per `package.json.verifierDeps['pdfjs-dist']` | None — verifier hard dep |
| `vitest` ^3.0.0 | All test files | ✓ (existing devDep) | ^3.0.0 | None |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

All Phase 41 dependencies are already-present in the repo or are runner-bundled. Zero new installs required. The phase is execution-ready in any environment that already runs `e2e-nightly.yml` and Phase 40's `v40-deps-update.yml`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 (from `package.json` devDependencies) |
| Config file | `vitest.config.js` (existing — handles `tests/unit/**` and `tests/e2e/scripts/**`) |
| Quick run command | `npx vitest run tests/unit/verify-single-case.test.js tests/unit/parse-affected-cases.test.js tests/unit/check-diff-guard.test.js tests/e2e/scripts/v40-verifier-gate-yaml.test.js` |
| Full suite command | `npm run test:src` (matches `package.json scripts.test:src` — runs ALL Vitest unit + e2e/scripts tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| VFY-GATE-01 | Trigger on auto-fix/* PR + 3× affected-case loop + draft→ready on all-pass | YAML-grep (V1, V2, V6, V10, V11, V12) | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js` | ❌ Wave 0 |
| VFY-GATE-01 | CLI shim argv parsing + exit codes | unit | `npx vitest run tests/unit/verify-single-case.test.js` | ❌ Wave 0 |
| VFY-GATE-01 | Affected-cases parser (single-line + multi-line + whitespace variants) | unit | `npx vitest run tests/unit/parse-affected-cases.test.js` | ❌ Wave 0 |
| VFY-GATE-02 | 76-case regression invocation present in regression-suite job | YAML-grep (V7) | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js -t 'V7'` | ❌ Wave 0 |
| VFY-GATE-03 | Diff-size cap literals 200 + 50 present + label + comment on rejection | YAML-grep (V8, X8) | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js -t 'V8\|X8'` | ❌ Wave 0 |
| VFY-GATE-04 | Verifier-pin step for all 3 files + diff-guard regex bank | YAML-grep (V9, X7) | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js -t 'V9\|X7'` | ❌ Wave 0 |
| VFY-GATE-04 | check-diff-guard.mjs Node helper rejects all 6 forbidden paths | unit | `npx vitest run tests/unit/check-diff-guard.test.js` | ❌ Wave 0 |
| Pitfall 4 defenses | No PAT, no auto-merge, no id-token, no actions:write | YAML-grep negative-pin (X1-X6) | `npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js -t 'X[1-6]'` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/verify-single-case.test.js tests/unit/parse-affected-cases.test.js tests/unit/check-diff-guard.test.js tests/e2e/scripts/v40-verifier-gate-yaml.test.js` (~3-5s)
- **Per wave merge:** `npm run test:src` (full Vitest suite — includes 54-test llm-ledger.test.js + 39-test check-deps-and-pr group + everything else)
- **Phase gate:** `npm run test:src` green + manual `auto-fix/test` branch push smoke (VFY-GATE-05 success criterion documented but no REQ-ID) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/verify-single-case.test.js` — covers VFY-GATE-01 (CLI shim contract: argv parsing, exit codes 0/1/2, output JSON shape, integration against existing pdfjs fixtures)
- [ ] `tests/unit/parse-affected-cases.test.js` — covers VFY-GATE-01 (parser handles 4+ PR-body variants)
- [ ] `tests/unit/check-diff-guard.test.js` — covers VFY-GATE-04 (regex bank rejects all 6 forbidden paths + accepts legitimate src/ + tests/ changes)
- [ ] `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` — covers all 4 VFY-GATE-* via YAML static-grep (V1-V12 + X1-X10 = 22 cases mirroring 40-03's D1-D11 + X1-X8 = 19 cases pattern)

*(No new conftest/fixtures needed — `pdf-verifier.js` integration tests reuse Phase 28's pdfjs test fixtures; `parse-affected-cases.test.js` uses inline string fixtures; `check-diff-guard.test.js` uses inline path arrays. No framework install: vitest ^3.0.0 is already in `package.json`.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | Workflow uses runner-injected `secrets.GITHUB_TOKEN`; no custom auth |
| V3 Session Management | No | Stateless workflow execution |
| V4 Access Control | **YES** | `permissions:` block is minimum-privilege (Pitfall 4 invariant); diff-guard regex bank enforces path-level access control on the auto-fix agent (Pitfall 3 Defense 2); branch protection ruleset (Phase 39) enforces PR-level access control |
| V5 Input Validation | **YES** | PR body parser (`parse-affected-cases.mjs`) validates the affected-cases format; CLI shim validates argv types (exit 2 on bad input); diff-guard validates path strings against regex bank |
| V6 Cryptography | No | No cryptographic operations in this phase |
| V7 Error Handling | **YES** | All gating failures surface a PR comment + appropriate label; non-zero exit codes are MEANINGFUL (CLI shim 0/1/2; workflow steps exit on failure) — no silent swallowing |
| V14 Configuration | **YES** | YAML-level static-grep tests (V1-V12, X1-X10) pin the workflow contract; CODEOWNERS pins `.github/workflows/` so unauthorized changes to this file require maintainer review |

### Known Threat Patterns for GitHub Actions Workflow + Node CLI Shim

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Verifier-gaming via PR-side verifier modification (Pitfall 3 #4) | Tampering | Pin verifier to `origin/main` via `git checkout` (Pattern 4) |
| Verifier-gaming via test/golden modification (Pitfall 3 #1-3) | Tampering | Diff-guard regex bank rejects modifications pre-execution (Pattern 3) |
| Verifier-gaming via test.skip / `.only` / FUZZY_LINE_TOLERANCE widening (Pitfall 3 #3-5) | Tampering | Phase 42 ships content-level diff-guard regex (auto-fix-diff-guard.test.js); Phase 41 ships path-level only (sufficient because forbidden paths CANNOT be in PR diff) |
| Auto-merge bypass (Pitfall 4) | Elevation of Privilege | Workflow only flips draft→ready; HUMAN merges. NO `gh pr merge --auto`. Negative-grep X3, X4. |
| PAT usage (Pitfall 4) | Spoofing | `secrets.GITHUB_TOKEN` only. Negative-grep X1. |
| Workflow self-modification (Pitfall 3 #9) | Tampering | `.github/workflows/v40-*.yml` is in the diff-guard forbidden path list (Pattern 3); CODEOWNERS pins `.github/workflows/` (Phase 39) |
| Shell injection via PR body (Pitfall 8 #4 security mistakes table) | Tampering | PR body passed to `parse-affected-cases.mjs` via `env:` block (env-hop) then read via stdin → JSON-parsed → split by safe delimiters. No string interpolation into `run:` steps. Pattern: `env: PR_BODY: ${{ ... }}` then read `process.env.PR_BODY` |
| Concurrency race (Pitfall 7) | DoS / consistency | `concurrency.group: v40-verifier-gate-${{ github.event.pull_request.number }}` + `cancel-in-progress: true`. Verifier is read-only so cancellation is safe (contrast Phase 42 auto-fix which uses `false`). |
| Stale `origin/main` after long-running PR (Pitfall F above) | Consistency | Documented as INTENDED behavior — fresh pin reflects current source of truth |
| Workflow trigger via `pull_request_target` (Pitfall 8 #4) | Elevation of Privilege | Use `pull_request` only. Negative-grep X6. |

## Sources

### Primary (HIGH confidence)

- **`.planning/research/PITFALLS.md`** (full file read 2026-05-31) — Pitfalls 3 (verifier-gate gaming), 4 (auto-merge), 7 (concurrency), 8 (v3.1 invariants). The load-bearing research source for Phase 41 defenses.
- **`.planning/research/ARCHITECTURE.md`** (read §1 workflow table + §4 data flow + §5 build order + §6 boundary concerns) — explicit `v40-verifier-gate.yml` trigger/permissions/concurrency table at line 22; `verify-single-case.mjs` shim contract at line 38; phase-41-blocks-42 dependency at line 212.
- **`.planning/REQUIREMENTS.md`** (full read) — VFY-GATE-01..04 verbatim text; Out-of-Scope (no LLM-as-judge); REQ-ID traceability table mapping each VFY-GATE-* to Phase 41.
- **`.planning/phases/41-verifier-gate-workflow-verify-single-case-mjs-cli-shim/41-CONTEXT.md`** (full read) — locked decisions on trigger, branch filter, 3× loop, CLI shim signature, diff-size caps, diff-guard paths, verifier-pin file set hint, required-status-check coordination.
- **`.github/workflows/e2e-nightly.yml`** (full read) — pattern source for: actions versions, Playwright cache, build:chrome step, regression.spec.js invocation shape, idempotent `gh label create --force`, concurrency block, permissions minimization, env-hop for CWE-94 defense.
- **`.github/workflows/v40-cost-ledger-snapshot.yml`** (full read) — pattern source for: Phase 40 v40-* naming convention, minimal-permissions block (contents-only), node-version literal pin, static concurrency group with cancel-in-progress: false.
- **`.planning/phases/40-deps-update-cost-ledger-snapshot-workflows/40-03-SUMMARY.md`** (full read) — D1-D11 + X1-X8 YAML-grep test pattern (mirror for Phase 41 V1-V12 + X1-X10); comment-paraphrase discipline scar; slot-reservation job naming pattern (`deps-update-gate` → Phase 47); back-port discipline.
- **`.planning/phases/39-sdk-driver-ledger-v2-branch-protection-wave-0/39-04-SUMMARY.md`** (full read) — captured `gh api` baseline: ruleset id 17086676, name `v4.0-main-protection`, `bypass_actors: []`, `required_status_checks` slot empty (RESERVED for Phase 41 + 40); Phase 41 must NOT touch this ruleset.
- **`tests/e2e/lib/pdf-verifier.js`** (full read) — `verifyCitation` signature at line 878 (the function the CLI shim wraps); `VERIFIER_PDFJS_PATH` override hook (Phase 40-04, not exercised by Phase 41); imports list (only `pdf-fetch.js` is the internal dep — fixes the verifier-pin file set).
- **`tests/e2e/scripts/v40-deps-update-yaml.test.js`** (full read) — exact mirror template for Phase 41's YAML-contract test file structure: imports, beforeAll, describe, it blocks, positive + negative assertions.
- **`.github/CODEOWNERS`** (full read) — confirms `/src/`, `/tests/`, `/.github/workflows/`, `/tests/golden/`, `/tests/e2e/test-cases-quarantine.js` all pinned to `@tonyrowles` (Phase 39 done). Layer 3 defense already in place.
- **grep verifications** (executed 2026-05-31):
  - `import.*pdf-verifier` (5 sites: regression.spec.js, fault-injection.spec.js, e2e-rerun-validator.mjs, verify-calibrate.mjs, e2e-explore.mjs) — confirms the verifier import surface
  - `baseline.json` (8 sites) — confirms baseline as load-bearing test artifact
  - `tests/test-cases.js` grep `id:` count = 76 — confirms 76-case suite
  - `human.review.required` grep across `tests/`, `scripts/`, `.github/`, `src/` = 0 hits (only `.planning/` planning docs) — surfaces Open Question 1

### Secondary (MEDIUM confidence)

- **[cli/cli Discussion #6379 — What permissions are needed to use OOTB GITHUB_TOKEN with gh pr merge --squash --auto](https://github.com/cli/cli/discussions/6379)** — corroborates that `gh pr merge` (similar mutation surface to `gh pr ready`) works with `pull-requests: write` for standard scenarios.
- **[cli/cli Issue #6274 — gh pr edit does not work with only pull-requests: write permissions](https://github.com/cli/cli/issues/6274)** — confirms `gh pr edit --add-label` needs `repository-projects: read` for project-name resolution; informs preemptive permission addition.
- **[GitHub Docs — Controlling permissions for GITHUB_TOKEN](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)** — canonical reference for the `permissions:` block enum (contents/pull-requests/issues/etc); used to validate the minimum-privilege set.
- **[GitHub community Discussion #191524 — GITHUB_TOKEN gets 403 when posting PR comments on branch protected by ruleset](https://github.com/orgs/community/discussions/191524)** — flags that ruleset-protected branches may impose stricter token requirements for comments; informs the X4-defense decision to use `gh pr comment` (which has documented support).
- **[GitHub Changelog — Required review by specific teams now available in rulesets (2025-11)](https://github.blog/changelog/2025-11-03-required-review-by-specific-teams-now-available-in-rulesets/)** — confirms ruleset is the current branch-protection primitive (used by Phase 39, slot-reserved for Phase 41).

### Tertiary (LOW confidence)

- None — every claim in this research is either verified by direct file read OR cited from an authoritative GitHub/Anthropic source. Where uncertainty exists (label provenance, A2 permission), it's documented in Assumptions Log + Open Questions, not buried as implicit fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every action/library/version was verified by reading shipped Phase 39/40 workflows
- Architecture: HIGH — diagram + 3-job split derived from explicit ARCHITECTURE.md §1 table + 41-CONTEXT.md locked decisions
- Pitfalls: HIGH — Phase 40-03 already burned the comment-paraphrase scar (documented); other pitfalls derived from PITFALLS.md's 8-pitfall enumeration (HIGH-confidence in that source)
- Code examples: HIGH — every snippet is either copied from existing v3.1/v4.0 code OR composed from documented git/gh/bash primitives
- Verifier-pin file set: HIGH — verified by grep against `pdf-verifier.js` imports + `baseline.json` consumers
- gh pr ready permission contract: MEDIUM — corroborated by cli/cli discussions; recommend live verification in Phase 41 dry-run via manual `auto-fix/test` branch (VFY-GATE-05 success criterion)
- `human-review-required` label provenance: LOW — flagged as Open Question 1; recommend idempotent create-if-exists pattern as defense

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (~30 days) — GitHub Actions surface is stable; gh CLI rev locks every ~2 weeks but `pr ready` / `pr comment` / `pr edit` are mature. If extending past 30 days, re-verify the cli/cli issues for permission deltas.

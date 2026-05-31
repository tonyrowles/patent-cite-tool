# Phase 41: Verifier-Gate Workflow + verify-single-case.mjs CLI Shim - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss infrastructure detection — workflow + CLI shim, all technical success criteria, no user-facing behavior)

<domain>
## Phase Boundary

Verifier-on-PR workflow exists so auto-fix PRs (Phase 43+) have somewhere to land — gate must exist BEFORE auto-fix opens its first PR. Wave 1 (independent of Phase 39/40 code; benefits from 40's workflow conventions which are now established).

Deliverables:
1. **`.github/workflows/v40-verifier-gate.yml`** — triggers on `pull_request.opened/synchronize/reopened` filtered to `auto-fix/*` head branches; parses `<!-- affected_cases: id1,id2 -->` from PR body; runs each affected case 3× consecutively via `verify-single-case.mjs`; only flips draft→ready (`gh pr ready <num>`) when ALL 3 runs pass Tier A/B; PR comment posts results on any failure.
2. **`.github/workflows/v40-verifier-gate.yml` (same file)** — ALSO runs the full 76-case regression on the PR branch in a parallel job; any regression on a previously-passing case blocks ready-for-review; static-grep test asserts the regression step exists.
3. **`scripts/verify-single-case.mjs`** — thin CLI shim around v3.0's `verifyCitation` from `tests/e2e/lib/pdf-verifier.js`. Args: `--case <id>` + optional `--runs N` (default 1, the workflow passes `--runs 3`). Exits 0 on Tier A/B pass; non-zero on Tier C or below. Outputs `report.json` with tier classification + raw match scores per the existing verifier contract.
4. **Diff-size cap pre-check** (VFY-GATE-03): the workflow's first job rejects diffs >200 LOC in `src/` or >50 LOC in `tests/`; oversized diffs stay draft with `human-review-required` label and a PR comment explaining the rejection. The same enforcement also belongs in `scripts/auto-fix.mjs` (Phase 42) — defense-in-depth. Phase 41 ships the WORKFLOW-LEVEL check; Phase 42 ships the script-level check.
5. **Verifier-pinned-to-`origin/main` + diff-guard regex bank** (VFY-GATE-04): during the PR gate run, `tests/e2e/lib/pdf-verifier.js` and `tests/golden/baseline.json` are checked out from `origin/main` (NOT the PR branch). Diff-guard regex bank rejects diffs touching `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `.github/CODEOWNERS`. Rejection raised PRE-`git apply` (workflow-level grep against the PR diff before any verifier execution).
6. **Manual exercise / end-to-end smoke** (VFY-GATE-05 in ROADMAP success criteria, no REQ-ID): a pushed `auto-fix/test` branch can demonstrate the gate end-to-end with no LLM involvement. Document the manual test procedure in `docs/v40-repo-config.md` (extending the Phase 39 doc) or a new `docs/v40-verifier-gate-manual-test.md`.

Out of scope (later phases):
- Auto-fix workflow that opens PRs (Phase 43)
- `scripts/auto-fix.mjs` core dispatcher (Phase 42)
- ERROR_CLASS routing logic (Phase 42 + 45)

</domain>

<decisions>
## Implementation Decisions

### Locked by REQUIREMENTS.md + ARCHITECTURE.md + PITFALLS.md + Phase 39/40 SUMMARYs

- **Workflow naming:** `.github/workflows/v40-verifier-gate.yml` (v40-* namespace per Phase 40 convention).
- **Trigger:** `pull_request: { types: [opened, synchronize, reopened] }` with `branches:` filter `[auto-fix/*]` (matches the branch-name convention Phase 43 uses).
- **3× affected-case runs:** consecutive (not parallel) — flakiness manifests as inconsistent results across re-runs; consecutive runs surface that within the same job. Tier A/B threshold per v3.0 verifier contract.
- **CLI shim signature:** `node scripts/verify-single-case.mjs --case <id> [--runs N=1] [--output <path>]`. Output JSON file path defaults to `playwright-report/single-case-<id>-runs-<n>.json`. Exit 0 on all runs Tier A/B; exit 1 on Tier C or below; exit 2 on argument error.
- **Diff-size cap values:** 200 LOC `src/`, 50 LOC `tests/` — initial caps per CONTEXT/CONTEXT carry-over; recalibrate after first 10 fixes (Phase 45 or post-Phase 47 backlog item).
- **`human-review-required` label** is the existing v3.1 label (per `tests/e2e/lib/triage-classifier.js`); reuse it. No new label creation.
- **Diff-guard paths (LOCKED):** `tests/test-cases.js`, `tests/golden/baseline.json`, `tests/e2e/test-cases-quarantine.js`, `.github/workflows/v40-*.yml`, `tests/e2e/.llm-spend-ledger.json`, `.github/CODEOWNERS`. The regex bank lives in `scripts/auto-fix.mjs` (Phase 42) but the workflow's pre-check (this phase) can use a simpler bash `grep -E` pattern; the regex bank is the canonical reference.
- **Verifier pinned to `origin/main`:** `git checkout origin/main -- tests/e2e/lib/pdf-verifier.js tests/golden/baseline.json tests/e2e/lib/golden-loader.js` (or similar; planner identifies the exact file set) inside the verifier-gate job, AFTER the PR branch checkout but BEFORE the verifier runs.
- **Required-status-check coordination:** Phase 41's `verifier-gate` job NAME is the slot Phase 39 reserved on the v4.0-main-protection ruleset. Phase 41 ships the workflow + job name; Phase 47 CLEANUP-04 adds the named check to the ruleset's `required_status_checks` list (alongside Phase 40's `deps-update-gate`). Phase 41 does NOT touch the ruleset.
- **YAML-level testing:** Static-grep test in `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` pins trigger branches, job names, the diff-size cap values, the diff-guard regex set, the `origin/main` checkout step, and the 3× run loop structure.
- **Vitest CLI shim tests:** Unit test the argument parsing + exit-code contract; integration test against a fixture case (the existing `pdfjs` test fixtures from v3.0 provide sufficient coverage).
- **`gh pr ready` invocation:** Use `gh pr ready ${{ github.event.pull_request.number }}` (NOT `--undo`); requires `pull-requests: write` permission. The workflow's permissions block: `contents: read`, `pull-requests: write`, `issues: read` (issues:read for `gh issue view` of the source issue if affected_cases parsing needs to fall back to issue body).

### Claude's Discretion

- Job structure: single job with sequential steps (verifier checks + 76-case regression + diff-guard) vs separate jobs in parallel — prefer 2-3 jobs with `needs:` dependencies for failure isolation and parallel execution where safe.
- Caching strategy: cache `node_modules`, the `.pdf-cache` directory, the build output — speeds up re-runs. Standard `actions/cache@v4` patterns.
- Whether `verify-single-case.mjs` writes a structured comment to the PR on failure or just exits non-zero — recommend write a comment via `gh pr comment` from the workflow (not the script — keep the script transport-pure).
- Vitest test file organization (one `tests/unit/verify-single-case.test.js` + one `tests/e2e/scripts/v40-verifier-gate-yaml.test.js`) — split per concern.
- Whether the diff-guard regex bank is inlined in the workflow YAML (bash grep) OR factored into a tiny Node script (`scripts/check-diff-guard.mjs`) — factor it (Phase 42's `auto-fix.mjs` reuses it).
- Whether the `<!-- affected_cases: id1,id2 -->` parser is YAML-inline (using `gh pr view --json body --jq` + grep/sed) or a Node helper (`scripts/parse-affected-cases.mjs`) — Node helper is cleaner and Vitest-testable.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from v3.0 and Phase 39/40)
- `tests/e2e/lib/pdf-verifier.js` — exports `verifyCitation({ caseId, ... }) → { tier: 'A'|'B'|'C'|..., score, raw }`. THE function the CLI shim wraps.
- `tests/golden/baseline.json` — canonical golden baseline. The PR gate run uses the `origin/main` version, NOT the PR branch version.
- `tests/test-cases.js` — the 76-case deterministic suite. The PR gate runs this against the PR branch (not pinned).
- `.github/workflows/e2e-nightly.yml` — existing nightly that runs the full 76-case suite. Reuse the matrix/setup boilerplate.
- `.github/CODEOWNERS` (Phase 39) — pins `.github/workflows/`; the new workflow triggers codeowner review.
- `verifierDeps.pdfjs-dist` (Phase 40) — the verifier pdfjs version; the gate run honors this separation when bumping pdfjs.
- `peter-evans/create-pull-request@v8` — NOT used in this phase (no PR creation), but the action is now established.

### Established Patterns (from Phase 40)
- `v40-*.yml` workflow naming.
- YAML-level static-grep Vitest tests for cron, permissions, key tokens (S1-S13 style from Phase 40).
- `secrets.GITHUB_TOKEN` only — no PATs.
- `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22` literal (no `.nvmrc`).
- `gh` CLI for PR operations (no `actions/github-script`).

### Integration Points
- Phase 42 (`scripts/auto-fix.mjs`) is the first consumer of the diff-guard regex bank — if Phase 41 factors it into a Node helper, Phase 42 imports it.
- Phase 43 (`v40-auto-fix.yml`) opens PRs onto `auto-fix/*` branches; those PRs trigger Phase 41's verifier gate.
- Phase 47 (CLEANUP-04) adds `verifier-gate` to the v4.0-main-protection ruleset's `required_status_checks` list.

</code_context>

<specifics>
## Specific Ideas

- Affected-cases parser: support both `<!-- affected_cases: id1,id2 -->` (HTML comment in PR body) and `<!-- affected_cases:\nid1\nid2\n-->` (multi-line variant). Robust to whitespace.
- 3× consecutive runs: implement as a bash loop in the workflow `for i in 1 2 3; do node scripts/verify-single-case.mjs --case "$id" --runs 1 --output "report-$i.json" || exit 1; done`. Each run produces a separate report; the workflow asserts all 3 report.tier values are A or B before exiting 0.
- Diff-size cap: `git diff --shortstat origin/main..HEAD -- src/ tests/` → parse insertions+deletions; if `src/` exceeds 200 or `tests/` exceeds 50, label + comment + exit non-zero.
- Diff-guard pre-check: `git diff --name-only origin/main..HEAD | grep -E '<regex bank>'` → fail if any match.
- For the "verifier pinned to origin/main" step: `git fetch origin main && git checkout origin/main -- tests/e2e/lib/pdf-verifier.js tests/golden/baseline.json`. Verify with `git diff origin/main:tests/e2e/lib/pdf-verifier.js tests/e2e/lib/pdf-verifier.js | wc -l` returns 0.
- Manual end-to-end smoke (VFY-GATE-05): document a procedure to push a hand-crafted `auto-fix/test` branch with a benign diff + `<!-- affected_cases: tc-001 -->` body, watch the workflow flip draft→ready. Capture the workflow-run URL as evidence in 41-04-SUMMARY (or wherever the manual-test plan lands).

</specifics>

<deferred>
## Deferred Ideas

- Parallelization of 3× verifier runs (currently consecutive per locked decision; revisit if wall-clock matters)
- Caching of golden baseline across runs (file is small; reload per run is acceptable)
- LLM-as-judge for verifier disagreements — explicitly OUT OF SCOPE per REQUIREMENTS.md.
- Cross-issue fix batching — out of scope for v4.0.

</deferred>

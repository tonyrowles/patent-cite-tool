# Phase 40: Deps-Update + Cost-Ledger-Snapshot Workflows - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss infrastructure detection — workflow files + ledger snapshot, all success criteria are technical, no user-facing behavior)

<domain>
## Phase Boundary

First `v40-*.yml` workflows ship as low-risk pipe-cleaners (no LLM); dep-update auto-PRs gated by full nightly suite. Wave 1 (parallel-eligible with 39 and 41 — Phase 39 now complete; Phase 41 still pending).

Deliverables:
1. **`.github/workflows/v40-deps-update.yml`** — weekly Monday 09:00 UTC cron + `workflow_dispatch`; queries frozen watchlist (playwright, pdfjs-dist, sharp, vitest, esbuild, @anthropic-ai/sdk) via `npm outdated --json`.
2. **`scripts/check-deps-and-pr.mjs`** — partition logic: security updates (`npm audit --json` flagged) into their own PR; minor updates grouped into a single PR via `peter-evans/create-pull-request@v8`.
3. **Required-status-check gate** — each dep-update PR runs the full nightly suite (smoke + 76-case regression + fault-injection) against the new version BEFORE draft→ready transition. YAML-level test asserts gate presence.
4. **Verifier `pdfjs-dist` pinned separately** from the extension's `pdfjs-dist`; dep-update PRs that bump pdfjs trigger a verifier-frozen pre-flight against the OLD pdfjs to confirm fixes are real, not frame-shift artifacts. Static-grep test pins separate dep declarations.
5. **`.github/workflows/v40-cost-ledger-snapshot.yml`** — daily snapshot of the ledger (built on Phase 39's committed `tests/e2e/.llm-spend-ledger.json`); atomic `[skip ci]` commit mirroring `e2e-weekly-digest.yml:98-110`.

Out of scope (later phases):
- Verifier-gate workflow (Phase 41)
- Auto-fix workflow (Phase 43)
- Auto-promote workflow (Phase 44)
- `@anthropic-ai/sdk` is on the watchlist but marked NEVER-auto-bump (manual review only — REQUIREMENTS.md out-of-scope clause)

</domain>

<decisions>
## Implementation Decisions

### Locked by REQUIREMENTS.md / ARCHITECTURE.md (v4.0 research) and Phase 39 SUMMARY

- **Workflow file naming:** `v40-*.yml` namespace — per Phase 39 + research naming convention. Two new files: `v40-deps-update.yml` and `v40-cost-ledger-snapshot.yml`.
- **Cron schedule for deps-update:** `0 9 * * 1` (Monday 09:00 UTC) + `workflow_dispatch`. Static-grep test pins both.
- **Cron schedule for ledger snapshot:** Daily (specific time TBD by planner — recommend `0 2 * * *` (02:00 UTC) so it lands well before the weekly digest at e2e-weekly-digest.yml's slot).
- **Dep watchlist (FROZEN):** `playwright`, `pdfjs-dist`, `sharp`, `vitest`, `esbuild`, `@anthropic-ai/sdk`. Static-grep test asserts the exact list — additions require a planning change.
- **`@anthropic-ai/sdk` policy:** ON the watchlist (so `npm outdated` flags new versions) but `--never-auto-bump` (per REQUIREMENTS out-of-scope). The dep-update script must skip SDK from auto-PR creation and instead post a comment to the digest issue or open a tracking issue tagged `manual-sdk-review`. The current pin is `0.100.1` EXACT.
- **PR partitioning:** Security updates (`npm audit --json` flagged severity ≥ moderate) → SEPARATE PR per package. Minor updates → SINGLE grouped PR. Major updates → out of scope for auto-PR (open a tracking issue instead). Vitest validates the partition logic.
- **Pre-flight nightly-suite gate:** Required-status-check; cannot be auto-merged or marked ready-for-review without it. YAML-level test asserts the gate is named in `required_status_checks` of the v4.0-main-protection ruleset (when Phase 41 + post-phase audit lands).
- **Verifier pdfjs-dist pinning:** The verifier (`tests/e2e/lib/pdf-verifier.js`) currently shares `pdfjs-dist` with the extension build. Phase 40 introduces a separate dep declaration so the verifier can be pinned to an OLD version while a dep-update PR bumps the extension's version. Frame-shift pre-flight: when the extension's pdfjs-dist is bumped, the script re-runs the verifier (still on the OLD pinned version) against the candidate to confirm citations still parse correctly (not a frame-shift artifact). Static-grep test pins separate dep declarations.
- **Daily ledger snapshot pattern:** Mirror `e2e-weekly-digest.yml:98-110` — atomic `git add tests/e2e/.llm-spend-ledger.json` + `git commit -m "[skip ci] daily ledger snapshot YYYY-MM-DD"` + `git push`. The `[skip ci]` prevents the snapshot commit from triggering nightly workflows.
- **`peter-evans/create-pull-request@v8` (8.1.1)** is the canonical PR-creation action — per Phase 39 research, this stays consistent across Phase 40, 43, 44.
- **`gh` CLI usage:** Use `gh api` for repo state inspection in scripts; `gh pr create --draft` only if `peter-evans/create-pull-request@v8` proves insufficient (preferred to keep one PR-creation primitive).

### Claude's Discretion

- Exact daily-snapshot cron time (recommend `0 2 * * *` UTC)
- Whether to split `check-deps-and-pr.mjs` into multiple modules (security partition, minor partition, watchlist filter) or keep it as a single CLI — keep it single per the v3.1 script convention (each `scripts/e2e-*.mjs` is a single file)
- Whether the digest/notification for manual-SDK-review goes to an issue or to the weekly digest body — issue is more discoverable; weekly digest stays cleaner
- Whether the verifier-frozen pre-flight runs in the same job or a separate matrix entry — same job is simpler if it's quick; separate matrix if it needs distinct cache strategies
- Test file organization (one `check-deps-and-pr.test.js` vs split per concern) — single file matches v3.1 conventions
- Whether to gate the snapshot commit on the ledger ACTUALLY having new entries since last snapshot (no-op vs always-commit) — always-commit is simpler and the `[skip ci]` prevents downstream impact

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from v3.1 and Phase 39)
- `tests/e2e/.llm-spend-ledger.json` — the committed ledger (Phase 39 LEDGER-04); v1-schema with bootstrap entry — Phase 40 snapshot workflow writes against this file.
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry()`, `monthlyTotal()`, `combinedMonthlyTotal()`, sub-cap helpers (Phase 39 LEDGER-01..03); the snapshot workflow may use these for summary statistics in commit messages.
- `e2e-weekly-digest.yml` lines 98-110 — canonical pattern for atomic `[skip ci]` self-commit with `git push`. The Phase 40 ledger-snapshot workflow mirrors this verbatim.
- `peter-evans/create-pull-request@v8` action — used by Phase 39 indirectly (manual setup); first programmatic use in Phase 40.
- `.github/CODEOWNERS` (Phase 39) — pins `.github/workflows/` so Phase 40's two new workflows trigger the codeowner-review gate when modified.

### Established Patterns (from v3.1)
- All scripts in `scripts/` use ES modules (`.mjs` extension); single-file CLIs; bare-verb naming (`check-deps-and-pr.mjs`, NOT `e2e-check-deps.mjs` since they don't touch E2E artifacts).
- Workflow files use `actions/checkout@v4`, `actions/setup-node@v4` with `node-version-file: '.nvmrc'`.
- Vitest unit tests for scripts go in `tests/unit/*.test.js`; YAML-level workflow tests go in `tests/e2e/scripts/*-yaml.test.js` (per v3.1 e2e-weekly-digest-yaml.test.js convention).
- Cron schedules pinned via static-grep tests in the YAML-level test files.

### Integration Points
- The snapshot workflow consumes the Phase 39 committed-ledger contract; Test 48 (added Phase 39) provides a regression baseline for the bootstrap-entry shape.
- The deps-update workflow's required-status-check gate is read by the branch protection ruleset's `required_status_checks` rule — but Phase 39 left that rule absent. Phase 40 may either: (a) leave the gate unmentioned in the ruleset (the workflow still runs, just isn't blocking); (b) coordinate with Phase 41 (which will add the `verifier-gate` check name and may add `deps-update-gate` alongside). Recommend (a) for Phase 40 — keep workflows additive; Phase 47 audit can add the status-check rule as one of CLEANUP-04's items.
- The Phase 39 `@tonyrowles` CODEOWNERS pin means Phase 40's new workflow files require maintainer review. Direct commits to `main` from autonomous mode are local-only; the user pushes manually.

</code_context>

<specifics>
## Specific Ideas

- The watchlist live in `scripts/check-deps-and-pr.mjs` as a frozen `const WATCHLIST = Object.freeze([...])`. Mirror Phase 39's `PROMPT_SCAFFOLDS` registry-freeze pattern from REQUIREMENTS.md PROMPT-03.
- The `@anthropic-ai/sdk` skip should write a structured "manual-review-required" note to a JSON file the weekly digest can read (e.g., `tests/e2e/.manual-sdk-bumps.json`) so the audit trail is queryable.
- Use `npm outdated --json` (not `npm-check-updates` — keep deps minimal; outdated is built-in).
- For the verifier-frozen pre-flight: the simplest mechanism is a separate `package.json` field like `"verifierDeps": {"pdfjs-dist": "x.y.z"}` that the verifier reads at runtime. Or a dedicated `tests/e2e/package.json` if hoisting is too invasive — let the planner decide.
- The snapshot commit message should encode the day's invocation count + spend total so `git log` is grep-friendly: `"[skip ci] ledger snapshot 2026-06-01: 12 invocations, $0.47 spent"`.

</specifics>

<deferred>
## Deferred Ideas

- Renovate/Dependabot adoption — explicitly OUT OF SCOPE per REQUIREMENTS.md.
- `npm audit fix --force` auto-application — research flagged this can introduce breaking changes; require manual review. Phase 40 only opens the PR with the audit-flagged update; doesn't apply destructive fix-forces.
- Multi-package-ecosystem support (Python deps, Docker base images) — not relevant to this single-Node-package repo.
- Auto-revert on dep-update PR failure — adds complexity; first iteration just leaves the PR draft with a failure label for human review.

</deferred>

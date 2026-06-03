# Phase 43: v40-auto-fix.yml Workflow + Draft PR Creation - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss infrastructure detection — workflow file lifting Phase 42's dispatcher into CI; all-technical success criteria; no NEW user-facing behavior beyond what Phase 42 already established).

<domain>
## Phase Boundary

Phase 42's local `scripts/auto-fix.mjs` script lifted into a CI workflow triggered by `issues.labeled('triage')` — first CI-driven end-to-end run. Wave 3. Depends on Phase 42 (script proven locally; demo deferred to Phase 47 — Phase 43 can still ship the workflow without the demo evidence since the dispatcher itself is 122-test-validated).

Deliverables:
1. **`.github/workflows/v40-auto-fix.yml`** — triggers on `issues: {types: [labeled]}` filtered to the `triage` label; permissions minimal (`contents: write`, `pull-requests: write`, `issues: read`).
2. **`peter-evans/create-pull-request@v8`** — atomically branches (`auto-fix/<issue-n>-<fp8>`), commits, pushes, opens draft PR with `--draft` (the action's `draft: true` parameter).
3. **PR body convention** — includes `<!-- affected_cases: id1,id2 -->` HTML comment (the parser Phase 41's verifier-gate reads). Single-line, comma-separated.
4. **Concurrency:** `concurrency: {group: v40-auto-fix-${{ github.event.issue.number }}, cancel-in-progress: false}` — per-issue serialization; label-flapping doesn't kill an in-progress LLM call (`cancel-in-progress: false` is THE key — opposite of Phase 41 verifier-gate which uses `cancel-in-progress: true`).
5. **YAML-level Vitest** — static-grep guard pinning trigger, label filter, permissions, concurrency block, action version, draft mode, the `auto-fix:opened` label that gets added on success, and the absence of forbidden tokens (`[skip ci]`, `gh pr merge --auto`, PAT references).
6. **`auto-fix:opened` label** — added when the action opens the draft PR; idempotent label-create-if-missing (Phase 41 pattern from `e2e-nightly.yml:97-102`).

Out of scope (later phases):
- Auto-promote workflow (Phase 44)
- Per-ERROR_CLASS expansion to 4 more classes (Phase 45)
- Local UX wrapper + subscription routing (Phase 46)
- Live HUMAN-UAT (Phase 47 — picks up the deferred Phase 42 demo)

</domain>

<decisions>
## Implementation Decisions

### Locked

- **Workflow file:** `.github/workflows/v40-auto-fix.yml` (v40-* namespace).
- **Trigger:** `on: { issues: { types: [labeled] } }` with an `if: github.event.label.name == 'triage'` filter at the job level. (The `types: [labeled]` event fires for ALL label adds; the if filter narrows.)
- **Permissions:** `contents: write` (for `peter-evans/create-pull-request@v8` to push the branch), `pull-requests: write` (to open the draft PR + add labels), `issues: read` (to read the issue body via `gh issue view` inside the dispatcher).
- **Concurrency:** `concurrency: {group: v40-auto-fix-${{ github.event.issue.number }}, cancel-in-progress: false}` — per-issue serialization with NO mid-flight cancellation (cost protection: LLM call already in-flight should complete and ledger; the AUTOFIX-04 `git ls-remote` idempotency handles double-trigger).
- **`peter-evans/create-pull-request@v8`** with: `token: ${{ secrets.GITHUB_TOKEN }}` (NO PAT), `draft: true`, `branch: auto-fix/${{ github.event.issue.number }}-<fp8>` (the dispatcher computes fp8 and the workflow reads it from a step output), `delete-branch: false` (auto-fix branches stick around — Phase 44's auto-promote needs them), `commit-message:` includes the fingerprint + issue number, `title: 'auto-fix: <ERROR_CLASS> for <case-id>'`, `body:` constructed in a prior step (HEREDOC including the `<!-- affected_cases -->` comment).
- **Workflow steps (sequential within job `auto-fix`):**
  1. `actions/checkout@v4` (full history needed for `git apply --check` against main)
  2. `actions/setup-node@v4` with `node-version: 22` literal (NOT `.nvmrc`)
  3. `npm ci --no-audit --no-fund` (no node_modules in checkout)
  4. `gh issue view <issue-n>` (inside `node scripts/auto-fix.mjs --issue <n> --force-api`) — the dispatcher does this
  5. `node scripts/auto-fix.mjs --issue ${{ github.event.issue.number }} --force-api --no-push` — produces the local branch + staged commit
  6. Compute branch name + body from dispatcher stdout (the dispatcher prints them per Phase 42 Plan 02 contract — `branch staged locally; push manually with: git push -u origin auto-fix/<n>-<fp8>` line is grep-able)
  7. `peter-evans/create-pull-request@v8` with the computed branch + body
  8. Add `auto-fix:opened` label via `gh issue edit <pr-num> --add-label auto-fix:opened` (idempotent label-create-if-missing first)
- **Failure modes:**
  - Dispatcher exit 1 (apply-check/diff-guard/malformed): workflow fails; gh comment on source issue with the dispatcher's stderr last 20 lines; NO PR opened
  - Dispatcher exit 2 (arg/contract): workflow fails; should not happen in practice
  - Dispatcher exit 3 (cap reached): workflow exits 0 cleanly (the dispatcher already added `human-review-required` to the source issue + posted the cap-reached comment); NO PR opened
  - Cap-blocked at the SDK driver level (per-day/per-issue/per-PR cap from Phase 39): dispatcher's `cap_blocked` error path; workflow exits 0 with a comment
- **Required-status-check coordination:** Phase 43 does NOT touch the v4.0-main-protection ruleset. The auto-fix workflow's PRs land on `auto-fix/*` branches; Phase 41's `verifier-gate` triggers on those PRs (ADVISORILY — Phase 47 binds it as a required check).
- **`secrets.GITHUB_TOKEN` only** — no PATs. The `peter-evans/create-pull-request@v8` action handles auth.
- **No `[skip ci]` in auto-fix commits** — these ARE PR commits, not self-commits; the verifier-gate must run on them.

### Claude's Discretion (with recommended defaults)

- Whether to fail-fast on missing `ANTHROPIC_API_KEY` (set as a repo secret) at the start of the workflow vs let the dispatcher fail later — fail-fast at workflow start (cleaner error message).
- Whether to gate the workflow on the source issue having a recognized ERROR_CLASS label (so a manual `triage` add without ERROR_CLASS doesn't burn SDK budget) — YES, add a pre-step that reads issue labels and skips if no ERROR_CLASS label present.
- Whether the workflow comments on the source issue when it CREATES the PR (cross-link) — YES, mirror v3.1 cross-link pattern.
- Test file naming: `tests/e2e/scripts/v40-auto-fix-yaml.test.js` (mirror Phase 40-03 + Phase 41-03 patterns).
- Number of YAML test cases: ~18-22 (load-bearing primitives + forbidden-token negative grep + comment-paraphrase discipline).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix.mjs` (Phase 42) — the dispatcher this workflow invokes via `node scripts/auto-fix.mjs --issue <n> --force-api --no-push`. The `--no-push` produces a local branch + commit; `peter-evans/create-pull-request@v8` does the actual push + PR creation.
- `tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` (Phase 39 + Phase 42 systemBlocks extension); consumed by the dispatcher.
- `tests/e2e/.llm-spend-ledger.json` (committed; Phase 39) — the workflow's `appendLedgerEntry` writes append-only. The workflow MUST commit the ledger update atomically with the auto-fix PR (NOT a separate commit — `peter-evans/create-pull-request@v8` bundles all working-tree changes into the PR commit).
  - **Important:** the ledger file is part of the PR commit; the PR opener (`@tonyrowles`) will see ledger changes in the PR diff. The diff-guard regex bank (Phase 41) rejects diffs touching `tests/e2e/.llm-spend-ledger.json`. CONFLICT: the dispatcher writes to the ledger, but the diff-guard would reject the resulting PR if the ledger change went through the same commit. **Resolution:** the dispatcher's ledger write must happen IN A SEPARATE COMMIT from the auto-fix diff. Phase 43 workflow does: (a) dispatcher runs → ledger written → ledger committed via a separate step; (b) `peter-evans/create-pull-request@v8` creates the PR commit with ONLY the auto-fix diff. The ledger commit goes to `main` directly via the workflow's `secrets.GITHUB_TOKEN` (acceptable per `[skip ci]` self-commit pattern from Phase 40-01). Document this clearly in the workflow.
- `.github/workflows/v40-verifier-gate.yml` (Phase 41) — triggers on `auto-fix/*` PR open; consumes the `<!-- affected_cases -->` comment Phase 43 produces.
- `.github/workflows/v40-deps-update.yml` (Phase 40-03) — STYLE TEMPLATE for the new workflow (permissions, naming, `peter-evans/create-pull-request@v8` invocation shape).
- `scripts/check-diff-guard.mjs` + `scripts/parse-affected-cases.mjs` (Phase 41-01) — already exist; the dispatcher imports check-diff-guard.

### Established Patterns
- v40-* workflow naming.
- YAML-level static-grep Vitest tests in `tests/e2e/scripts/*-yaml.test.js`.
- Comment-paraphrase discipline: paraphrase `[skip ci]`, `gh pr merge --auto`, `auto-merge: true`, `id-token: write` in workflow header comments (Phase 40-03 + 41-03 scar).
- Idempotent label create: `gh label create <name> --color <hex> --force 2>/dev/null || true`.
- `actions/checkout@v4` + `actions/setup-node@v4` with `node-version: 22` literal.

### Integration Points
- Phase 41 verifier-gate triggers on the PRs this workflow opens.
- Phase 44 auto-promote triggers on the merge of `auto-fix:verified` PRs (which start as Phase 43's draft PRs that the verifier-gate flips to ready).
- Phase 47 CLEANUP-03 HUMAN-UAT (a) is the live demo of THIS workflow end-to-end (deferred from Phase 42).

</code_context>

<specifics>
## Specific Ideas

- The "ledger-write commits to main separately" pattern (resolving the diff-guard conflict): copy the `[skip ci]` self-commit block from `e2e-weekly-digest.yml:98-110` verbatim into the workflow. Stage: dispatcher writes ledger → workflow stages ledger file → atomic `[skip ci]` commit + push to main → peter-evans/create-pull-request@v8 runs on the now-clean working tree with only the auto-fix diff.
- Workflow timeout: `timeout-minutes: 10` (per-job) — generous; dispatcher's LLM call alone can take ~30-60s + the install + checkout + PR creation.
- The "PR body" computation step: pipe dispatcher stdout to a small helper that constructs the HEREDOC body with the affected case ID, fingerprint, fix_attempts count, and ledger entry ISO. Could be inlined as a bash step or a tiny `scripts/build-auto-fix-pr-body.mjs` helper (Vitest-testable).

</specifics>

<deferred>
## Deferred Ideas

- Auto-merge of auto-fix PRs — explicitly OUT OF SCOPE per REQUIREMENTS.md.
- Per-error-class workflow specialization — out of scope; one workflow handles all ERROR_CLASSes via dispatcher routing.
- Cross-issue fix batching — out of scope; one issue per workflow invocation.

</deferred>

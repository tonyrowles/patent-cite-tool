# Phase 42: fix-prompt-builder + WRONG_CITATION Vertical Slice - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated. This phase has user-facing behavior (the local auto-fix demo) but every load-bearing decision is locked in REQUIREMENTS.md + ARCHITECTURE.md + PITFALLS.md + Phase 39-41 SUMMARYs. Discretionary items inlined with recommended defaults.

<domain>
## Phase Boundary

Local end-to-end auto-fix loop closed for ONE error class (WRONG_CITATION) — proves diff application, branch creation, PR-body conventions before scaling. Wave 2. Depends on Phase 39 (SDK driver `invokeAnthropicSdkWithLedger`) + Phase 41 (verifier-gate to land into).

Deliverables (8 in total):
1. **`tests/e2e/lib/fix-prompt-builder.js`** — pure-function library exporting `buildFixPrompt({errorClass, issueBody, ...})`. Wraps parsed issue body in `<issue_body_untrusted>...</issue_body_untrusted>` envelope (PROMPT-01). Exports a frozen `PROMPT_SCAFFOLDS` registry (PROMPT-03) — Phase 42 ships ONLY `WRONG_CITATION`; Phase 45 adds the other 4 classes. Skip-class returns:
   - `FLAKE → {ok: false, escalate: 're-quarantine'}`
   - `LLM_API_ERROR → {ok: false, escalate: 'retry'}`
   - `PASS → {ok: false, escalate: 'close-as-pass'}`
2. **`tests/e2e/lib/issue-payload-builder.js`** modifications — escape `<issue_body_untrusted>` + `</issue_body_untrusted>` delimiter strings in LLM rationale, verifier windows, and golden-diff sections (PROMPT-02). Vitest exercises a crafted-payload case.
3. **ESLint `no-restricted-imports` guard** on `fix-prompt-builder.js` forbidding `node:fs`, `node:child_process`, `node:path` (PROMPT-04). Mirrors the existing `issue-payload-builder.js` purity guard. Appended to the per-file blocks in `eslint.config.js`, NOT to the Phase 39 SDK guard's catch-all (must NOT clobber prior rules — Pitfall 3 manifestation already happened once this milestone, fixed in commit `345cdcb`).
4. **`scripts/auto-fix.mjs` core dispatcher** (AUTOFIX-01, AUTOFIX-03, AUTOFIX-04, AUTOFIX-05) — argv: `--issue <n> [--transport sdk|subscription=sdk] [--force-api]`. Reads issue body via `gh issue view <n> --json body,labels`. Routes ERROR_CLASS labels to matching `PROMPT_SCAFFOLDS[errorClass]` (FLAKE/LLM_API_ERROR/PASS short-circuit to escalation paths without LLM invocation). Calls `invokeAnthropicSdkWithLedger` for non-skip classes. Parses unified-diff response from LLM. Runs `git apply --check` BEFORE `git apply`. Rejects diffs touching the FORBIDDEN_PATHS regex bank (imports `checkDiffGuard` + `FORBIDDEN_PATHS` from Phase 41's `scripts/check-diff-guard.mjs`). Checks `git ls-remote --heads origin auto-fix/<n>-<fp8>` BEFORE invoking the LLM — if branch exists, exit 0 with an "already attempted" PR comment (idempotency for label-flapping). Tracks `fix_attempts` per fingerprint (stored as a ledger field via `appendLedgerEntry({phase: '42-auto-fix', ...})`); after 3 failures, adds `human-review-required` label and refuses further auto-fix on that fingerprint (AUTOFIX-05).
5. **Branch naming convention:** `auto-fix/<issue-number>-<fingerprint-first-8-chars>`. Fingerprint reads from the issue body's `fingerprint:` line (v3.1 triage convention).
6. **PR body convention** (for the manual demo PR opened by hand): includes the `<!-- affected_cases: <case-id> -->` HTML comment so Phase 41's verifier-gate can parse it. Also includes a `fix_attempts: <n>` line + the fingerprint + the SDK call's ledger entry ID.
7. **Local end-to-end demo:** the executor runs a real `WRONG_CITATION` issue from the v3.1 quarantine corpus (`tests/e2e/test-cases-quarantine.js`) through the full loop — issue → prompt → SDK call → diff → branch creation → manual PR creation — with the Phase 41 verifier-gate flipping the PR ready-for-review. Document the demo procedure + capture the workflow-run URL in `42-04-SUMMARY.md` (or wherever the demo plan lands).
8. **Vitest coverage:** unit tests for `fix-prompt-builder.js` (envelope assertion, PROMPT_SCAFFOLDS shape, skip-class returns); for `issue-payload-builder.js` (FORBIDDEN_DELIMITERS escape); for `scripts/auto-fix.mjs` (each ERROR_CLASS routing path, `git apply --check` pre-validation, `git ls-remote` idempotency, `fix_attempts` cap-at-3, diff-guard rejection); for the ESLint purity guard (programmatic ESLint API call asserting fs/child_process/path imports fail).

Out of scope (later phases):
- `v40-auto-fix.yml` workflow that triggers on `issues.labeled('triage')` (Phase 43)
- Per-ERROR_CLASS expansion to 4 more classes (Phase 45)
- FLAKE 5-state machine (Phase 45)
- `npm run fix-issue` UX wrapper + subscription-transport routing (Phase 46)

</domain>

<decisions>
## Implementation Decisions

### Locked by REQUIREMENTS.md / ARCHITECTURE.md / PITFALLS.md / Phase 39-41 SUMMARYs

- **`<issue_body_untrusted>` envelope** is the PROMPT-01 boundary — analogous to v3.1's `<patent_data>` defense; pinned by Vitest assertion in every generated prompt.
- **FORBIDDEN_DELIMITERS** for the escape: `['<issue_body_untrusted>', '</issue_body_untrusted>']`. PROMPT-02 enforces in `issue-payload-builder.js`.
- **`PROMPT_SCAFFOLDS` registry is FROZEN** via `Object.freeze()`. Phase 42 keys: `WRONG_CITATION` (full builder), `FLAKE`/`LLM_API_ERROR`/`PASS` (skip-class returns). Phase 45 ADDS 4 more keys: `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`. Don't pre-stub them in Phase 42 — the registry shape stays minimal.
- **ESLint purity guard for fix-prompt-builder.js:** appended to its OWN per-file block (NOT to the Phase 39 catch-all). Forbids `node:fs`, `node:child_process`, `node:path`. Tests via programmatic ESLint API call (same pattern as Phase 39's `eslint-sdk-guard.test.js`).
- **Diff-guard regex bank:** consume Phase 41's exports — `import { checkDiffGuard, FORBIDDEN_PATHS } from '../scripts/check-diff-guard.mjs'` (relative path TBD by planner; the script is in `scripts/`). DO NOT re-define the 6 paths in `auto-fix.mjs` — single source of truth.
- **`git apply --check` BEFORE `git apply`:** validates the diff cleanly applies before mutating the working tree. Rejection → ledger entry + PR comment + exit non-zero.
- **`git ls-remote --heads origin auto-fix/<n>-<fp8>` BEFORE LLM:** label-flap idempotency. Existing branch → exit 0 with "already attempted" comment; NO LLM call (saves cost).
- **`fix_attempts` storage:** ledger field `phase: '42-auto-fix'`, `fingerprint: <fp>`, `attempt: <n>`. The 4th attempt adds `human-review-required` label and refuses further auto-fix on that fingerprint. AUTOFIX-05.
- **SDK transport for Phase 42:** `'sdk'` — `invokeAnthropicSdkWithLedger`. Subscription transport (`invokeClaudePWithLedger`) is the Phase 46 free-iteration path; not in scope here.
- **Model:** `claude-sonnet-4-6` (default per Phase 39 PRICING_BY_MODEL entry). NOT opus — opus is reserved for Tier-C escalation in Phase 45.
- **Branch naming:** `auto-fix/<issue-number>-<fp8>` where `fp8` is first 8 chars of the v3.1 fingerprint. EXACT — pinned by Vitest static-grep on `auto-fix.mjs`.
- **PR-body HTML comment:** `<!-- affected_cases: <case-id-1>,<case-id-2> -->` — single-line, comma-separated. Phase 41's parser handles both single-line and multi-line variants; Phase 42 produces the single-line form.
- **Manual demo procedure:** pick the LOWEST-fingerprint WRONG_CITATION issue from the current quarantine corpus (deterministic, reproducible). If no real one exists, synthesize one with a known true-positive answer in a sandbox repo branch — document the synthesis recipe.
- **Required-status-check coordination:** Phase 42 does NOT touch the v4.0-main-protection ruleset. The PR opened by the manual demo will go through Phase 41's `verifier-gate` job ADVISORILY (the rule binding the check name happens in Phase 47).

### Claude's Discretion (with recommended defaults)

- **Prompt template structure for WRONG_CITATION** (the highest-value discretionary call):
  - SYSTEM block: cite-by-position v3.1 invariants + diff-guard restrictions + output format (unified diff between `===DIFF_START===` and `===DIFF_END===` fences) + the cap on diff size (200 LOC src / 50 LOC tests).
  - USER block: `<issue_body_untrusted>` envelope around the parsed issue body; nothing else outside the envelope (defense against issue-body injection — strict).
  - Use `cache_control: { type: 'ephemeral', ttl: '1h' }` on the SYSTEM block per Phase 39 research (Anthropic SDK prompt caching saves ~30% per call).
- **Diff parser:** regex extraction between `===DIFF_START===` and `===DIFF_END===` fences. If no fences found OR multiple matches found → ledger an `errorReason: 'malformed-diff'` entry + exit non-zero with "LLM output did not contain a single fenced diff" message.
- **Fingerprint hashing:** v3.1 already publishes a fingerprint in the issue body; just take its first 8 chars. If the issue body lacks a fingerprint line → exit 2 with `'issue body missing fingerprint:; this is a v3.1 contract violation'`.
- **Ledger entry shape for fix_attempts:** `{phase: '42-auto-fix', transport: 'sdk', fingerprint: '<fp>', attempt: <n>, errorReason?: '<reason>', branchExisted?: true, diffApplied?: true}`. Reuse Plan 39-01's appendLedgerEntry; no new schema.
- **`gh issue view` field set:** `gh issue view <n> --json body,labels,title,number,assignees` — labels for ERROR_CLASS, body for the parsed payload (with fingerprint), title for ledger context.
- **`auto-fix.mjs` argv parsing:** Node's built-in `parseArgs` from `util` (same as Phase 41 scripts). Args: `--issue <n>` (required), `--transport <sdk|subscription>` (default `sdk`), `--force-api` (boolean flag), `--dry-run` (boolean — prints the prompt + would-be diff, no apply).
- **Exit codes:** 0 = diff applied + branch pushed (or `--dry-run` succeeded); 1 = diff rejected (apply-check fail, diff-guard fail, malformed-diff); 2 = argument or contract error; 3 = `fix_attempts` cap reached.
- **Test fixture for the manual demo:** pick a real v3.1 quarantine entry per the locked decision above; the executor commits the recorded transcript (issue URL + SDK call ledger ID + workflow-run URL) as evidence in the SUMMARY.
- **PR creation for the demo:** MANUAL via `gh pr create --draft --base main --head auto-fix/<n>-<fp8>` from CLI. Phase 43 automates this with `peter-evans/create-pull-request@v8`.
- **Whether to support `--dry-run` in Phase 42:** YES — without it, every test run is a real SDK call costing dollars. Dry-run is the way to test the dispatcher logic in CI without burning budget.
- **Test-time ledger routing (locked 2026-05-31):** Vitest unit tests for `auto-fix.mjs` MUST route ledger writes to a tmpdir via the v3.1 `E2E_LEDGER_PATH_OVERRIDE` env var (which throws under CI per Phase 32 D-15; locally it routes to the override path). This keeps `tests/e2e/.llm-spend-ledger.json` byte-stable across `npm test` runs — only REAL CLI invocations (dry-run AND live) write to the committed ledger. The dispatcher reads `LEDGER_PATH` (which resolves via the v3.1 fallback chain — override wins locally, default elsewhere) and passes it through to `appendLedgerEntry`. No code change needed in the driver/ledger; the test setUp blocks set + tearDown blocks unset the env var.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (Phase 39-41 + v3.1)
- `tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` (Phase 39 SDK driver — Phase 42's only LLM consumer).
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry` with `transport` + `phase` fields (Phase 39 LEDGER-01).
- `tests/e2e/lib/llm-pricing.js` — `PRICING_BY_MODEL['claude-sonnet-4-6']` (Phase 39 Pitfall 2 fix).
- `tests/e2e/lib/issue-payload-builder.js` — v3.1 pure-function library; Phase 42 modifies to escape FORBIDDEN_DELIMITERS.
- `scripts/check-diff-guard.mjs` — Phase 41 Plan 1; exports `checkDiffGuard` + `FORBIDDEN_PATHS`. Phase 42 IMPORTS, doesn't re-define.
- `tests/e2e/test-cases-quarantine.js` — v3.1 quarantine corpus; source of the real WRONG_CITATION demo issue.
- ESLint config v3 of `no-restricted-imports` per-file blocks (Phase 39 mid-merge fix `345cdcb` established the pattern: add NEW per-file blocks, NEVER touch the Phase 39 SDK catch-all's `ignores` without also augmenting the per-file blocks).

### Established Patterns (Phase 39-41)
- All scripts in `scripts/` use ES modules (`.mjs`); single-file CLIs.
- Vitest unit tests for scripts go in `tests/unit/*.test.js`; YAML-level tests in `tests/e2e/scripts/*-yaml.test.js`.
- Pure-function libraries (`tests/e2e/lib/`) — no fs/child_process/net; ESLint-enforced for select files (pdf-verifier.js, rerun-validator.js, triage-classifier.js, fix-prompt-builder.js after Phase 42).
- Idempotent `gh label create --force 2>/dev/null || true` for label creation (Phase 41 pattern from e2e-nightly.yml:97-102).
- `secrets.GITHUB_TOKEN` only — no PATs.

### Integration Points
- Phase 43 (`v40-auto-fix.yml`) lifts `auto-fix.mjs` into a workflow triggered by `issues.labeled('triage')`.
- Phase 41 (`v40-verifier-gate.yml`) is the gate the manual demo PR lands into.
- Phase 45 expands `PROMPT_SCAFFOLDS` to 4 more classes; adds FLAKE 5-state machine.
- Phase 46 adds `--transport subscription` routing (free Max-5 iteration) + `npm run fix-issue` wrapper.

</code_context>

<specifics>
## Specific Ideas

- The SYSTEM prompt for WRONG_CITATION should include a CONCRETE example of a correctly-formatted diff (one of the v3.1 issue→fix recorded transcripts; Phase 31 LLM-exploratory-mode produced these).
- For the dry-run mode: print the full prompt (with envelope) + the would-be `gh issue view` payload + the SDK call's projected cost (from `PRICING_BY_MODEL`) before exiting.
- Use the existing `tests/e2e/.llm-spend-ledger.json` (Phase 39 committed) for `fix_attempts` storage — single source of truth. Don't introduce a separate `fix-attempts.json` file.
- The "already attempted" PR comment should include the prior `attempt` count + the fingerprint so a human reviewer can grep the ledger for the prior LLM call.
- The cache_control `ttl: '1h'` is the Anthropic SDK default for prompt caching; Phase 42 sets it explicitly to make the cost-saving discipline grep-able in the prompt code.

</specifics>

<deferred>
## Deferred Ideas

- Empirical diff-size cap recalibration (initial 200/50 LOC stays; revisit after first 10 fixes — flagged in STATE.md for Phase 45 backlog).
- Multi-LLM A/B (sonnet vs opus) for difficult cases — explicitly deferred to v4.1.
- Cross-issue fix batching — out of scope for v4.0.
- LLM-as-judge for verifier disagreements — explicitly OUT OF SCOPE per REQUIREMENTS.md.
- Auto-revert on verifier-gate failure — out of scope; first iteration leaves the draft PR with a failure label.

</deferred>

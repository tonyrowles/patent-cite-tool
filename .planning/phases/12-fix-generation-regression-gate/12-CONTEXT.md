# Phase 12: Fix Generation + Regression Gate - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the LLM fix-generation + regression-gate layer: a `report-fix-candidate`-labeled
GitHub Issue triggers a new **`v61-report-fix.yml`** workflow that fetches the full
`BUG_REPORTS` KV record (via `wrangler --remote`), invokes the LLM
(`invokeAnthropicSdkWithLedger`) with a new `REPORT_FIX_SCAFFOLD` prompt targeting
**only the `src/shared/` matching core**, runs the golden + quarantine suites in-workflow
to self-correct, and opens a **draft PR** on an `auto-fix/<fp-short>` branch — with prompt
injection from user report fields structurally blocked, costs bounded, and the human merge
gate preserved as a permanent invariant.

Delivers requirements **FIX-01..05, GATE-01..04, COST-01..04** (13 reqs).

**Locked upstream (not re-litigated here):**
- Fix surface is `src/shared/` matching core only; FORBIDDEN_PATHS enumerated (FIX-02).
- User fields (`note`, `selectionText`, `errorLog`) escaped (`FORBIDDEN_DELIMITERS`) and
  wrapped in a `<report_data>` untrusted envelope in the **user turn only**, never the
  system prompt (FIX-03 — Vitest static-grep pinned).
- `selectionText` omitted entirely if absent from the KV record (FIX-05 privacy).
- Draft PR on `auto-fix/<fp-short>`, never a direct push to `main` (GATE-02).
- All LLM calls via `safeAppendLedger` with `source:'report-fix-api'`; `MAX_FIXES_PER_RUN`
  default 5; 3 fix-iterations per report then `auto-fix-stuck` (COST-01..03).
- Two-commit ledger split (ledger commit `[skip ci]` to `main` precedes create-PR step)
  is the ONLY permitted direct push to `main` (COST-04 — YAML-contract Vitest pinned).
- No `auto-merge` flag anywhere; human merge approval is a permanent invariant
  (GATE-04 — static-grep Vitest pinned).
- The **`REPORT_FIX_SCAFFOLD` prompt body is NOT designed here** — it is the explicit
  research-phase deliverable during plan-phase (2-3 prompt-iteration cycles; the
  `--max-turns 5 --tools Read,Glob,Grep` × new-scaffold interaction is the milestone's
  highest uncertainty per ROADMAP research flag).

**Not in scope (later phases):**
- `assertTripleGate` Leg-3 extension + post-merge auto-promote wiring (Phase 13 — GATE-05).
- Weekly-digest `BUG_REPORTS` section + live end-to-end pipeline UAT (Phase 14).

</domain>

<decisions>
## Implementation Decisions

The structural constraints above are locked by REQUIREMENTS.md / STATE.md. The six
decisions below resolve the implementation forks that research and planning cannot decide
on their own.

### Dispatcher architecture (FIX-01)
- **D-01:** **Build a fresh `report-fix.mjs` dispatcher** for the KV-report → fix flow —
  do NOT extend or reuse the v4.0 `scripts/auto-fix.mjs` entry point (it is wired to
  error-CLASS scaffolds like `WRONG_CITATION` and the E2E-issue input shape, and remains
  live via `npm run fix-issue`). A clean break keeps the report flow free of error-class
  assumptions and leaves the legacy path untouched.
- **D-02:** **But extract the proven, invariant-pinned primitives into a shared module
  that BOTH dispatchers import** — specifically the two-commit ledger split (COST-04),
  the diff-fence extraction (`===DIFF_START===` / `===DIFF_END===`), and the
  `git apply --check` flow currently living in `scripts/auto-fix.mjs`. One source of truth;
  retarget the existing COST-04 / diff-fence Vitest pins to the shared module. Do NOT
  re-derive the ledger split from scratch (risk of silently breaking the two-commit-split
  invariant). Likely home: `tests/e2e/lib/` alongside `safe-append-ledger.js` /
  `fix-prompt-builder.js` — exact name at Claude's discretion.

### Overfit / hardcoded-result guard (FIX-04)
- **D-03:** **Soft-flag, do not hard-reject.** When the candidate diff contains the
  reported `patentNumber` as a string literal in `src/`, still open the draft PR but
  (a) withhold the `auto-fix:verified` label, (b) add a prominent PR-body note describing
  the specificity / overfit concern, and (c) apply the existing **`human-review-required`**
  label (verifier-gate already ensures this label exists — D-06). This satisfies success
  criterion #3 ("flagged for mandatory human review… no silent overfitting reaches the
  merge gate") while keeping the candidate visible for a human to salvage or reject. The
  REQUIREMENTS word "rejected" means "rejected from the auto-verified fast path," not
  "no PR."

### Regression gate ↔ iteration loop (GATE-01, COST-03)
- **D-04:** **The in-workflow pre-PR regression run drives the 3-iteration loop.**
  `v61-report-fix.yml` runs `npm test` (golden corpus) + the quarantine spec in-workflow.
  A golden/quarantine regression counts as a failed fix-iteration and feeds the failure
  detail back into the next LLM iteration (re-prompt), up to 3 attempts (COST-03). The
  draft PR opens only once the local run is clean; on 3-attempt exhaustion the source
  Issue is labeled `auto-fix-stuck` with no further spend. The existing
  **`v40-verifier-gate.yml`** (which already fires on `pull_request` for `auto-fix/*`
  branches, diff-size cap + regression rerun + label flip) then runs on the draft PR as an
  **independent confirmation** — GATE-03's required-status binding (ruleset 17086676, job
  name unchanged) is preserved by reusing that workflow as-is, NOT by adding a new gate.
- **D-05:** **Only regressions consume an iteration; malformed/forbidden diffs hard-abort.**
  A diff-guard rejection (touches FORBIDDEN_PATHS, e.g. tests / golden baseline / verifier
  / scripts / workflows) or a `git apply --check` failure is a **hard abort** → label
  `auto-fix-stuck` immediately. Do not burn the 3-iteration budget re-prompting on a
  structurally invalid or scope-violating diff; the iteration budget is reserved for
  semantically-wrong-but-valid fixes (regressions).

### Idempotency / branch collision (FIX-01, mirrors Phase 11 D-04/D-05)
- **D-06:** **GitHub state is the authoritative dedup signal; reuse the branch.** Before
  spending LLM budget, query for an existing open `auto-fix/<fp-short>` PR/branch for this
  fingerprint; if one exists, skip (no re-spend) unless the run is an explicit re-trigger,
  in which case force-push to reuse the same branch. Consistent with Phase 11's
  GitHub-authoritative idempotency and with the existing post-fix suppression (Phase 11
  D-07/D-08). Do NOT mint new branch suffixes per run (would spawn duplicate PRs).

### Label vocabulary (FIX-04, COST-03)
- **D-07:** **Reuse the existing label vocabulary — no new labels.** Overfit soft-flag uses
  the existing `human-review-required` label on the **PR**; iteration-exhaustion uses the
  locked `auto-fix-stuck` label on the **source Issue** (no PR exists on that path).
  `auto-fix:verified` remains the verifier-gate's label. Keeps the label surface stable.

### Claude's Discretion
- The fresh dispatcher's exact filename/location (`scripts/report-fix.mjs` assumed) and the
  shared-primitives module name/home (`tests/e2e/lib/` assumed) — as long as both
  dispatchers import it and the COST-04 / diff-fence pins retarget cleanly.
- The precise `<report_data>` envelope field ordering and which KV diagnostic fields beyond
  the FIX-03-named ones are surfaced to the LLM (the prompt BODY is research-phase work).
- Env-var name for any new per-run knob, following the `MAX_FIXES_PER_RUN` /
  `duplicate_count` convention.
- The exact in-workflow step ordering, provided the COST-04 two-commit-split invariant
  (ledger commit precedes create-PR) and `wrangler --remote` mandate hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 12: Fix Generation + Regression Gate" — goal,
  depends-on (Phase 11), 5 success criteria, the 13 requirement IDs, and the
  **Research flag** (REPORT_FIX_SCAFFOLD prompt = research-phase deliverable).
- `.planning/REQUIREMENTS.md` — FIX-01..05, GATE-01..04, COST-01..04 (lines 51-70).
- `.planning/STATE.md` — "Key Locked Decisions (v6.1)" + "Permanent Invariants" +
  "Bypass Conventions" (human-gate invariant; two-commit ledger split = ONLY permitted
  push to `main`; `wrangler --remote` mandatory; `<report_data>` envelope rule;
  `FORBIDDEN_DELIMITERS` escape rule; `safeAppendLedger` covers all LLM writes).

### Reuse targets (read before writing new code)
- `tests/e2e/lib/fix-prompt-builder.js` — **REPORT_FIX_SCAFFOLD stub lives here** (line 521,
  bare TODO string). Phase 12 replaces it with the real prompt body. Study the existing
  `PROMPT_SCAFFOLDS` envelope/diff-fence/forbidden-paths/output-format structure (the
  `<issue_body_untrusted>` envelope, `ENVELOPE_OPEN/CLOSE`, `DIFF_FENCE_START/END`) as the
  pattern — but the report scaffold uses the `<report_data>` envelope (FIX-03), not
  `<issue_body_untrusted>`. **Purity-guarded** (no fs/child_process/path/sdk imports;
  ESLint per-file block + Vitest pin). REPORT_FIX_SCAFFOLD is a SEPARATE top-level export,
  NOT a key in the frozen `PROMPT_SCAFFOLDS` map (would break byte-stability sha256 pins +
  "7 keys" drift guard).
- `scripts/auto-fix.mjs` — **D-02 primitive-extraction SOURCE** (v4.0 dispatcher, ~58KB,
  still live via `npm run fix-issue`). Extract: two-commit ledger split, diff-fence
  extraction regex, `git apply --check` flow. Do NOT reuse as the report-flow entry point
  (D-01). Do NOT couple the legacy path to the new flow.
- `scripts/check-diff-guard.mjs` — `FORBIDDEN_PATHS` frozen bank (the 6 LOCKED entries the
  scaffold duplicates as plain-text LLM instruction). The fresh dispatcher's diff-guard
  step imports `checkDiffGuard` / `FORBIDDEN_PATHS` from here. If the bank changes, the
  scaffold text AND its Vitest pin update in the same commit.
- `tests/e2e/lib/safe-append-ledger.js` + `tests/e2e/lib/llm-ledger.js` +
  `tests/e2e/lib/llm-driver.js` — `invokeAnthropicSdkWithLedger` / `safeAppendLedger`
  (COST-01 ledger-guard path, `source:'report-fix-api'`). The monthly soft/hard cap check
  happens here before each call.
- `.github/workflows/v40-verifier-gate.yml` — **GATE-03 reuse target, run as-is.** Already
  triggers on `pull_request` for `auto-fix/*` branches: scope-decision fast-path, ensures
  `human-review-required` label exists, diff-size cap (src/ ≤200 LOC, tests/ ≤50 LOC),
  regression rerun, label flip. Job name `verifier-gate:` is the required-status slot
  (ruleset 17086676) — DO NOT rename. The new `auto-fix/<fp-short>` branch makes it fire
  automatically; no new gate workflow needed.
- `scripts/gh-client.mjs` (Phase 11 shared helper, D-09) — GitHub plumbing
  (`createIssueWithLabels`, `findMatchingIssue` `kv-key` dedup, `--paginate` listing, label
  shell-escaping, `--repo` flag). Reuse for the D-06 existing-PR/branch query and label ops.
- `scripts/ingest-reports.mjs` + the `<!-- kv-key: report:{fp}:{ts} -->` Issue-body pointer
  (Phase 11) — the upstream contract: this phase's trigger is the `report-fix-candidate`
  Issue + `kv-key` pointer Phase 11 produces. Read the Issue body to recover the KV key.

### Input shape (what the scaffold/diff-guard consume)
- `src/shared/report-payload-builder.js` — `buildReportPayload` output fields (`category`,
  `patentNumber`, `patentUrl`, `selectionText`? absent when opted out, `returnedCitation`,
  `confidenceTier`, `pdfParseStatus`, `errorLog`, `note`). `duplicate_count` is added
  server-side by the Worker, present on the KV record but not in builder output.
- `src/shared/constants.js` — `REPORT_CATEGORIES`, `WORKER_REPORT_URL`.
- `src/shared/` matching core — the fix surface: `matching.js`,
  `position-map-builder.js`, `pdf-parser.js`.

### Regression corpora (GATE-01)
- `tests/test-cases.js` + `tests/golden/baseline.json` — golden corpus (75/76 cases).
- `tests/e2e/test-cases-quarantine.js` — quarantine corpus.

### Auto-promote (downstream contract — read for Phase 13 awareness)
- `.github/workflows/v40-auto-promote.yml` — triple-gate (Leg 1 `auto-fix:verified`,
  Leg 3 source-issue `triage` label). Phase 13 extends Leg 3 to accept
  `report-fix-candidate`; this phase must keep the label/branch conventions stable so
  Phase 13 can wire in.

### v6.1 milestone research (context / pitfalls)
- `.planning/research/SUMMARY.md`, `.planning/research/ARCHITECTURE.md`,
  `.planning/research/PITFALLS.md` (ledger leak, bypass-merge, wrangler-local-default).

### Prior phase context
- `.planning/phases/11-triage-layer/11-CONTEXT.md` — upstream triage decisions
  (GitHub-authoritative idempotency D-04/D-05, post-fix suppression D-07/D-08, Issue-body
  contract D-10) that this phase's idempotency (D-06) mirrors.
- `.planning/phases/10-retirement-scaffolding/10-CONTEXT.md` — what was retired; the
  REPORT_FIX_SCAFFOLD stub origin.

### Memory (background — verify before relying)
- `project_wrangler_kv_needs_remote_flag` — `wrangler kv get/list` reads LOCAL miniflare by
  default; `--remote` mandatory (FIX-01 KV fetch) or reads false-empty `[]`.
- `project_auto_fix_ledger_leak_vector` — a path that wrote ledger entries bypassing the
  guard; verify any new LLM-call path routes through `safeAppendLedger` (COST-01).
- `project_webapp_deploy_gotchas` — `wrangler` runs from `worker/`.
- `project_v6_token_rotation_breaks_5_0_x` — token-rotation context for any KV/Worker auth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix.mjs`: D-02 primitive-extraction source (ledger split, diff-fence
  extraction, `git apply --check`) — extract to shared, don't reuse as entry point.
- `tests/e2e/lib/fix-prompt-builder.js`: scaffold home + envelope/diff-fence pattern;
  REPORT_FIX_SCAFFOLD stub at line 521 to be replaced (research-phase prompt body).
- `scripts/check-diff-guard.mjs`: `checkDiffGuard` / frozen `FORBIDDEN_PATHS` bank for the
  diff-guard step (D-05 hard-abort path).
- `tests/e2e/lib/safe-append-ledger.js` / `llm-ledger.js` / `llm-driver.js`:
  `invokeAnthropicSdkWithLedger` + ledger-cap guard (COST-01).
- `.github/workflows/v40-verifier-gate.yml`: GATE-03 reuse-as-is on `auto-fix/*` PRs.
- `scripts/gh-client.mjs`: shared GitHub plumbing (Phase 11) for D-06 dedup + labeling.

### Established Patterns
- **Two-commit ledger split** = ONLY permitted direct push to `main` (`[skip ci]` ledger
  commit precedes create-PR), Vitest YAML-contract pinned (COST-04).
- **`<report_data>` untrusted XML envelope in user turn only**, `FORBIDDEN_DELIMITERS`
  escape on `note`/`selectionText`/`errorLog` — Vitest static-grep pinned (FIX-03).
- **`auto-fix/<branch>` naming** is what makes verifier-gate fire (GATE-02/03).
- **No-auto-merge static-grep invariant** across all `*.yml` (GATE-04) — must extend the
  test to cover `v61-report-fix.yml`.
- **Purity-guarded prompt builder** (no I/O imports; ESLint per-file + Vitest pin) — the
  REPORT_FIX_SCAFFOLD edit must keep purity green and stay OUTSIDE the frozen
  `PROMPT_SCAFFOLDS` map (byte-stability + key-count drift guards).
- **`wrangler --remote` mandatory**, run from `worker/` (FIX-01 KV fetch).
- **Env-configurable caps** (`MAX_FIXES_PER_RUN`, `duplicate_count`) — pattern for any new
  knob.

### Integration Points
- **Upstream trigger:** `report-fix-candidate`-labeled Issue (Phase 11) carrying the
  `<!-- kv-key: report:{fp}:{ts} -->` pointer → `v61-report-fix.yml`.
- **Reads:** production `BUG_REPORTS` KV (via `wrangler --remote`).
- **Writes:** `auto-fix/<fp-short>` branch + draft PR; `[skip ci]` ledger commit to `main`;
  labels (`human-review-required` on overfit PR, `auto-fix-stuck` on stuck Issue).
- **Downstream:** the draft PR + `auto-fix:verified` label feed Phase 13's triple-gate
  (GATE-05) — keep label/branch conventions stable. The fix surface (`src/shared/`) is the
  matching core Phases 7-9 extracted.

</code_context>

<specifics>
## Specific Ideas

- The dispatcher is a **fresh `report-fix.mjs`** but stands on **extracted-to-shared**
  proven primitives (ledger split, diff-fence parse, git-apply) — clean break on the
  entry point, zero re-derivation of invariant-pinned machinery (D-01 + D-02).
- The regression gate is **two-layered on purpose**: in-workflow pre-PR run = self-correct
  loop driver (D-04); reused `v40-verifier-gate.yml` on the PR = independent trust
  confirmation. They are not redundant — one bounds spend, one binds the required check.
- **Only regressions burn iterations** (D-05): forbidden-path / unappliable diffs abort to
  `auto-fix-stuck` immediately — the 3-iteration budget is for semantically-wrong fixes.
- The overfit guard is a **visible soft-flag** (D-03), not a silent drop: the human sees
  the candidate AND the specificity warning, and the auto-verified fast path is withheld.
- REPORT_FIX_SCAFFOLD prompt body is **explicitly research-phase work** — plan-phase MUST
  run research (validate against a sample real report, 2-3 prompt-iteration cycles) before
  writing the workflow YAML. Do not let the planner skip research here.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Adjacent items already deferred by the
milestone (not introduced here): `assertTripleGate` Leg-3 extension + auto-promote wiring
(Phase 13, GATE-05), weekly-digest `BUG_REPORTS` section + live end-to-end UAT (Phase 14),
cron-driven fix generation (`workflow_dispatch`/label-only this milestone), and LLM-driven
triage for `ambiguous` reports (v2 LTRI-01).

</deferred>

---

*Phase: 12-fix-generation-regression-gate*
*Context gathered: 2026-06-17*

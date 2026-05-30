# Phase 32: HUMAN-UAT Verification - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 32 delivers two coupled outputs:

1. **A live UAT pass of `npm run e2e:explore` against the Max 5 subscription**, producing a committed `llm-report.json` with ≥10 schema-valid iterations and a tagged spend-ledger trail — proving the Phase 31 scaffolding works end-to-end against real `claude -p` invocations.
2. **A new local→CI handoff helper (`npm run e2e:upload-llm-report`) + a new `e2e-ingest-llm-report.yml` workflow + an `llm_run_id` workflow_dispatch input on `e2e-nightly.yml`** that together let the local `llm-report.json` be downloaded by the nightly workflow without manual artifact upload steps.

**In scope:** the live UAT execution, evidence capture (terminal log + JSON fixture), the two-stage upload helper, the ingest workflow, the `llm_run_id` input + download/validate-schema step on nightly, a `--phase` CLI flag on `e2e-explore.mjs` with ledger-side spend tagging, and a per-phase $10 spend cap with mid-run abort.

**Out of scope (belongs in later phases):**
- `llm-report.json` schema extensions (`scroll_y`, `viewport_width`, `viewport_height`, `selected_node_xpath`) — Phase 33
- Any re-run validator, triage classifier, issue payload builder, quarantine append, or pipeline orchestrator code — Phases 33–36
- Replacing the nightly download+validate step with a real triage pipeline invocation — Phase 36

</domain>

<decisions>
## Implementation Decisions

### UAT Execution Model
- **D-01:** User (fatduck) runs `npm run e2e:explore` locally on the machine where Max 5 subscription auth lives. Claude does not attempt to invoke nested `claude -p` from inside this session.
- **D-02:** Evidence is committed in two forms: a narrative `32-UAT-EVIDENCE.md` in the phase directory capturing the terminal output, ledger delta, iteration count, and any anomalies; AND the produced `llm-report.json` committed as `tests/e2e/fixtures/uat-phase32-llm-report.json` so downstream Phases 33+ have a real fixture to develop against.
- **D-03:** Sanity check is **schema-only** — the existing JSON schema guard plus a Vitest test that asserts the committed fixture parses against the schema. No manual semantic spot-check of iterations; Phase 33's re-run validator is the gate for semantic correctness.
- **D-04:** Regression baseline (461 Vitest + 76-case Playwright golden) runs both locally before commit AND in CI on push. Defense-in-depth posture.

### Upload Helper Transport
- **D-05:** Two-stage architecture for `npm run e2e:upload-llm-report`:
  - **Stage 1:** Helper triggers a new `.github/workflows/e2e-ingest-llm-report.yml` workflow via `gh workflow run` with the `llm-report.json` contents passed as an input (base64-encoded). That workflow uploads the file as a GitHub Actions Run artifact and exits. Helper captures the resulting `run_id` via `gh run list --workflow=e2e-ingest-llm-report.yml --limit 1 --json databaseId` after the trigger.
  - **Stage 2:** Helper triggers `e2e-nightly.yml` via `gh workflow run e2e-nightly.yml -f llm_run_id=<captured_run_id>`. Nightly downloads the artifact via `gh run download <llm_run_id>` at the start of its job.
- **D-06:** In Phase 32, the nightly workflow only **downloads + validates schema** of the uploaded `llm-report.json` (new step gated on `llm_run_id` being provided). It does NOT invoke any triage pipeline; that step is added in Phase 36.
- **D-07:** Helper prints the ingest-workflow run URL to stdout AND opens it in the user's browser via `gh run view <id> --web`. No polling.
- **D-08:** Helper reads `llm-report.json` from the canonical path that `e2e-explore.mjs` writes to (no CLI flag). One golden path; no flexibility flag needed for v3.1.

### UAT Failure Policy
- **D-09:** Hard gate with retry budget: up to **3 total attempts** (1 initial + 2 retries) on the explore step before declaring UAT failure. Downstream Phases 33–37 stay blocked on UAT pass.
- **D-10:** Pass bar for iteration content: ≥10 schema-valid iterations regardless of verifier verdict (PASS / FAIL / ANOMALY all count). Schema is the only gate; verdict distribution is not asserted.
- **D-11:** Upload helper failures (gh CLI auth, ingest workflow error, nightly download error) have their own independent retry budget (up to 2 retries). The successful explore-run output is preserved across upload retries — we do not re-burn subscription credits to retry a transport bug.
- **D-12:** On exhausted retry budget for the explore step: Phase 32 stays not-started, a `32-UAT-FAILURE.md` is written documenting the failure mode (auth path, schema mismatch, empty iterations, etc.), Phase 31 is reopened in ROADMAP.md with the failure mode added as a new acceptance criterion, and a new plan is run against Phase 31.

### Phase 32 Spend Ceiling
- **D-13:** Per-phase dollar cap of **$10** applied on top of the existing $80 warning / $100 hard-cap monthly globals. Sized so 3 attempts each cost ≤ ~$3.30 average, leaving $90 of the monthly $100 for the rest of v3.1.
- **D-14:** Enforcement uses the existing single ledger file `tests/e2e/.llm-spend-ledger.json`. New CLI flag `--phase <id>` on `e2e-explore.mjs` stamps each ledger entry with a `phase` field (defaults to `null` for backward compatibility). The UAT runner passes `--phase 32`.
- **D-15:** Pre-flight check: before invoking any `claude -p`, `e2e-explore.mjs --phase 32` sums ledger entries where `phase === "32"` and aborts with a clear error if the sum is already ≥ $10.
- **D-16:** Mid-run enforcement: after each iteration's `appendLedgerEntry`, sum the phase-32 slice. Warn at ≥ $8; hard-abort at ≥ $10 (finalizing `llm-report.json` with whatever iterations completed cleanly). The UAT pass-bar (D-10) then decides whether the partial report meets ≥10 iterations.

### Claude's Discretion
- Exact file layout of `32-UAT-EVIDENCE.md` (sections, ordering) — Claude proposes; user reviews at plan/execute time.
- Whether the `--phase` flag's value validation is strict (regex `^\d+$`) or permissive (any non-empty string) — minor, planner picks.
- Concrete error message wording for the pre-flight and mid-run aborts.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/ROADMAP.md` §"Phase 32: HUMAN-UAT Verification" — goal, depends-on, success criteria, requirement mapping
- `.planning/REQUIREMENTS.md` §UAT — UAT-01, UAT-02, UAT-03 acceptance criteria
- `.planning/PROJECT.md` §"Current Milestone: v3.1" — v3.1 target features and Phase 31 context that Phase 32 verifies
- `.planning/research/SUMMARY.md` §"Phase 1: HUMAN-UAT Verification (Phase 32)" — phase-1 rationale, deliverables, and Pitfalls 10/11/12 that this phase addresses; §"Gaps to Address" — `llm_run_id` artifact transfer UX

### Existing code that Phase 32 extends or depends on (DO NOT modify outside the decisions above)
- `scripts/e2e-explore.mjs` — entrypoint Phase 32 adds `--phase` flag to and adds pre-flight + mid-run cap enforcement to; calls `invokeClaudeP` and `appendLedgerEntry`
- `tests/e2e/lib/llm-ledger.js` — `LEDGER_PATH`, `readLedger`, `checkSpendCap`, `appendLedgerEntry` API surface; Phase 32 adds `phase` field to each entry but must not change the existing schema or break Phase 31's call site
- `tests/e2e/.llm-spend-ledger.json` — the live ledger file (gitignored as a runtime artifact)
- `.github/workflows/e2e-nightly.yml` — nightly cron Phase 32 adds the `llm_run_id` input + download+validate-schema step to (gated on `llm_run_id != ''`)
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — existing CI guard pattern; Phase 32 must not break it

### Pitfalls to actively avoid (from research SUMMARY.md)
- Pitfall 10: stale `llm-report.json` consumed by CI — D-06 mitigation: nightly only consumes when `llm_run_id` provided, validates schema before any downstream use
- Pitfall 11: `claude -p` accidentally running in CI — existing `e2e-explore-ci-guard.test.js` must keep passing; D-14's `--phase` flag does not change CI-guard behavior
- Pitfall 12: spend ledger gap — D-13/D-14/D-15/D-16 explicitly tag every claude -p call with `phase: "32"` so accounting is exact

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/llm-ledger.js::appendLedgerEntry` — existing ledger API; Phase 32 adds one optional field (`phase`) to the entry shape rather than introducing a parallel ledger
- `tests/e2e/lib/llm-ledger.js::readLedger` + `checkSpendCap` — pre-flight and mid-run cap checks build on these (filter by `phase === "32"` then sum)
- `scripts/e2e-explore.mjs::invokeClaudeP` + `appendLedgerEntry` call site (lines ~177–225) — the existing pattern Phase 32 follows for the cap check after each iteration
- `tests/e2e/scripts/e2e-explore-ci-guard.test.js` — pattern for CI-guard testing; no new guard test needed for Phase 32 (no new CI-callable script), but Phase 34/36 will mirror this

### Established Patterns
- **Subscription-local `claude -p`**: `ANTHROPIC_API_KEY: ''` clearing in `invokeClaudeP` (Phase 31 lock). Phase 32 does NOT touch this; the UAT executes through the same code path.
- **Single ledger file**: `LEDGER_PATH` points to one canonical JSON file. Phase 32 keeps that — extending the entry shape rather than forking the file (rejected alternative).
- **Idempotent CLI flags with safe defaults**: existing scripts accept optional flags with backward-compatible defaults; `--phase` follows the same convention (defaults to `null`, Phase 31 call sites unaffected).
- **Static concurrency group + workflow_dispatch input** on `e2e-nightly.yml` (Phase 29 decision); Phase 32 adds a new input but does not change the concurrency group.

### Integration Points
- `e2e-explore.mjs` ↔ `llm-ledger.js`: Phase 32 adds the `phase` field at the call site (passed through `appendLedgerEntry`), and adds two new ledger-reading helpers (or inlined sums) for pre-flight and mid-run checks.
- `e2e-ingest-llm-report.yml` (new) ↔ `e2e-nightly.yml`: connected only via `gh workflow run -f llm_run_id=<id>`; nightly looks up the artifact via `gh run download <llm_run_id>`. No file system or git coupling between the two workflows.
- `scripts/e2e-upload-llm-report.mjs` (new) ↔ both new YAMLs: triggers ingest first, polls for the run_id, then triggers nightly with that ID as input. Pure orchestration script; no business logic.
- `tests/e2e/fixtures/uat-phase32-llm-report.json` (new) ↔ Phase 33+: the committed real-run fixture downstream phases develop their re-run validator and triage classifier against.

</code_context>

<specifics>
## Specific Ideas

- The user wants the helper UX to be: one command, terminal prints the run URL, browser opens automatically. Zero manual `gh` invocations after the initial `npm run` (D-07).
- The user wants exactly one canonical ledger file — no parallel phase-scoped ledgers (D-14). Tagging entries is preferred over splitting files.
- The user accepts the "explore preserved across upload retries" principle (D-11) — we never re-burn subscription credits because of a transport-layer bug.
- The user prefers two-stage workflow handoff (D-05) over inline base64 payload, even though inline is simpler, because the SUMMARY-described `llm_run_id` architecture is what Phases 33–37 are designed against.

</specifics>

<deferred>
## Deferred Ideas

- **Patent set selection / Google A/B drift handling during UAT** — surfaced as a candidate gray area but user wrapped up without expanding it. If a real-world UAT run hits Google A/B drift mid-session, capture the failure mode in `32-UAT-EVIDENCE.md` and address in a later phase rather than expanding Phase 32 scope.
- **Stale `llm_run_id` handling on nightly** (artifact older than N days) — Phase 32 nightly trusts whatever `llm_run_id` it's given. Hardening (e.g., reject artifacts older than 7 days) is Phase 36 territory when the real triage pipeline lands.
- **`promote-from-quarantine.mjs`-style "promote fixture to golden"** — the Phase 32 UAT fixture could one day be promoted into the golden suite or a dedicated LLM-fixtures suite. Not in v3.1; revisit if downstream phases find repeated value in the fixture.

</deferred>

---

*Phase: 32-human-uat-verification*
*Context gathered: 2026-05-24*

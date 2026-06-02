# Phase 45: Per-ERROR_CLASS Expansion + FLAKE 5-State Machine - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Auto-generated. Phase 45 expands Phase 42's `PROMPT_SCAFFOLDS` from 1 ERROR_CLASS to 5; introduces the FLAKE 5-state classifier with ring buffer; ships FLAKE_ESCALATION suppression. All decisions locked in REQUIREMENTS.md + ARCHITECTURE.md + PITFALLS.md.

<domain>
## Phase Boundary

Scale auto-fix from WRONG_CITATION to 5 classes; introduce 5-state FLAKE classifier to prevent both real-bugs-mis-classified-as-FLAKE and FLAKE-spam loops. Wave 5. Depends on Phase 44 (full loop proven on WRONG_CITATION).

Deliverables:
1. **`PROMPT_SCAFFOLDS` expansion** in `tests/e2e/lib/fix-prompt-builder.js` — add 4 builders: `LLM_HALLUCINATED_SELECTION`, `WORKER_FALLBACK_FAILED`, `GOOGLE_DOM_DRIFT`, `HARNESS_ERROR`. Each builder mirrors WRONG_CITATION's shape (`<issue_body_untrusted>` envelope + SYSTEM block + USER block) with class-specific system instructions targeting the appropriate source surface (per FEATURES.md routing table).
2. **`tests/e2e/lib/triage-classifier.js` 5-state machine** — replace v3.1 binary CONFIRMED/FLAKE with 5 states: `CONFIRMED_BUG`, `LIKELY_BUG`, `INTERMITTENT`, `FLAKE`, `FLAKE_ESCALATION`. Per-case rolling 10-element rerun-outcomes ring buffer in `tests/e2e/.rerun-ring-buffer.json` (committed, per Phase 39 ledger pattern). Vitest exercises each state transition.
3. **FLAKE_ESCALATION threshold** — after N=3 FLAKE re-files within 14 days for the same fingerprint, classifier opens a `flake-investigation` issue (no auto-fix attempt). The same fingerprint is suppressed from re-filing for 30 days. Static-grep test pins N=3, 14d, 30d values.
4. **`scripts/quarantine-append.mjs --escalate-stable-runs-reset 1`** — new flag wired into `auto-fix.mjs`'s FLAKE dispatch path: resets `stable_runs` to 1 (bumps the case back to fresh state) instead of opening a PR. Vitest integration test exercises the reset path.
5. **Historical-issue replay tests** — each of the 4 new ERROR_CLASS scaffolds has at least one historical-issue replay test (fixture issue body from v3.1 quarantine corpus or synthesized recipe) demonstrating a non-empty diff via mocked SDK response.

Out of scope (deferred to v4.1+ per REQUIREMENTS):
- Multi-model A/B (sonnet vs opus) — defer to v4.1
- Cross-issue fix batching — out of scope
- Auto-fix dashboard digest extension — defer to v4.1

</domain>

<decisions>
## Implementation Decisions

### Locked

- **5 ERROR_CLASS scaffolds in `PROMPT_SCAFFOLDS`:** WRONG_CITATION (existing from Phase 42), LLM_HALLUCINATED_SELECTION, WORKER_FALLBACK_FAILED, GOOGLE_DOM_DRIFT, HARNESS_ERROR. The skip classes (FLAKE, LLM_API_ERROR, PASS) stay UNCHANGED from Phase 42's `SKIP_CLASS_ESCALATIONS` map.
- **Fix surface per class** (from FEATURES.md):
  - `LLM_HALLUCINATED_SELECTION` → `src/selection.js`, spec-extraction code
  - `WORKER_FALLBACK_FAILED` → Worker/USPTO fallback path
  - `GOOGLE_DOM_DRIFT` → selectors, `data-testid` attributes, `src/selection.js`
  - `HARNESS_ERROR` → `tests/e2e/specs/`, fixture loaders, Playwright config
- **5-state machine transitions** (definitions per REQUIREMENTS FLAKE-01):
  - `CONFIRMED_BUG` — 3+ consecutive failures, no successes in last 10 runs
  - `LIKELY_BUG` — ≥7 failures in last 10 runs
  - `INTERMITTENT` — 4-6 failures in last 10 runs (might be a real bug OR flake — keep observing)
  - `FLAKE` — ≤3 failures in last 10 runs (classification leans flake but not yet escalation)
  - `FLAKE_ESCALATION` — same fingerprint re-classified as FLAKE 3+ times in 14 days (real signal: either the test is genuinely flaky, OR we're systematically misclassifying — open `flake-investigation` issue + suppress for 30 days)
- **Ring buffer file:** `tests/e2e/.rerun-ring-buffer.json` (committed, mirrors Phase 39 ledger flip pattern). Schema: `{version: 1, cases: {<case-id>: {outcomes: ['pass'|'fail', ...], updatedAt: <iso>}}}`. 10-element rolling window per case.
- **Suppression file:** `tests/e2e/.flake-suppression.json` (committed). Schema: `{version: 1, suppressions: {<fingerprint>: {until: <iso>, reason: 'FLAKE_ESCALATION'}}}`.
- **`auto-fix.mjs` FLAKE dispatch:** when ERROR_CLASS is FLAKE, dispatcher invokes `scripts/quarantine-append.mjs --escalate-stable-runs-reset 1 --case <case-id>` instead of the previous skip-class return path. The skip-class still short-circuits the LLM call (no SDK cost); the new behavior is the side-effect of resetting `stable_runs`.
- **`flake-investigation` issue creation:** when FLAKE_ESCALATION fires, classifier creates a GitHub issue with labels `flake-investigation` + `<fingerprint-prefix>`; suppresses the fingerprint for 30 days; no auto-fix dispatch.
- **Required-status-check coordination:** Phase 45 does NOT touch the v4.0-main-protection ruleset. Phase 47 audit handles it.
- **`secrets.GITHUB_TOKEN`** only; no PATs (no new workflows in Phase 45 — only library + script changes consumed by Phase 43+44's existing workflows).

### Claude's Discretion (recommended defaults)

- Whether the 5-state machine helper is a class or a pure function — pure function `classifyRerunOutcomes(ringBuffer, fingerprint, suppressions) → {state, action}`. Matches the project's stateless-helper pattern.
- Whether to commit a sample ring-buffer entry as a sentinel (analog to Phase 39's `phase: '39-bootstrap'` ledger entry) — YES, `{version: 1, cases: {}}` empty-state bootstrap.
- Test fixture issue bodies for the 4 new scaffolds — synthesize from `tests/e2e/test-cases-quarantine.js` schema (each entry includes ERROR_CLASS + body template). If no real historical-issue exists for a class, synthesize a minimal valid body.
- 4-5 plans vs fewer larger plans: 3 plans:
  - 45-01: PROMPT_SCAFFOLDS expansion (4 new builders + their Vitest fixture-replay cases)
  - 45-02: 5-state machine + ring buffer + suppression (triage-classifier modifications + helpers + Vitest state-transition cases)
  - 45-03: FLAKE dispatch path in auto-fix.mjs + quarantine-append flag wiring + flake-investigation issue creation + integration Vitest
- Mock SDK in historical-replay tests via `vi.mock` — same pattern as Phase 42 unit tests.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/e2e/lib/fix-prompt-builder.js` (Phase 42) — Phase 45 ADDS to `PROMPT_SCAFFOLDS` registry; preserve frozen-registry pattern
- `tests/e2e/lib/triage-classifier.js` (Phase 34) — Phase 45 REPLACES binary classifier with 5-state machine; preserve module's existing exports as compat shim if needed
- `scripts/auto-fix.mjs` (Phase 42) — Phase 45 modifies the FLAKE dispatch path to invoke quarantine-append
- `scripts/quarantine-append.mjs` (v3.1) — Phase 45 adds `--escalate-stable-runs-reset` flag
- `tests/e2e/test-cases-quarantine.js` (v3.1) — source of fixture issue bodies
- `tests/e2e/.llm-spend-ledger.json` (Phase 39) — pattern reference for committed JSON state files

### Established Patterns
- Pure-function libraries in `tests/e2e/lib/` (ESLint-enforced for select files)
- Committed JSON state files in `tests/e2e/` (Phase 39 ledger pattern)
- Vitest unit tests in `tests/unit/`

### Integration Points
- Phase 43 auto-fix workflow consumes the new PROMPT_SCAFFOLDS keys (label → scaffold lookup)
- Phase 44 auto-promote workflow unaffected (only the SUCCESS path matters; new ERROR_CLASSes still produce auto-fix PRs the same way)
- Phase 47 CLEANUP-03 HUMAN-UAT (c) "FLAKE escalation verified to suppress re-files" exercises Phase 45's escalation path

</code_context>

<specifics>
## Specific Ideas

- The 5-state state machine should be implemented as a single pure function `classify(outcomes: Array<'pass'|'fail'>, history: {fingerprint, recentFlakeCount, daysSinceLastFlake}) → {state, action}`. Outcomes are the most recent N entries from the ring buffer.
- Ring buffer rotation: append-only with `slice(-10)`. No deletion semantics.
- Suppression check is the FIRST step of classification: if fingerprint is in suppressions and `until > now`, return `{state: 'FLAKE_SUPPRESSED', action: 'skip'}` (a 6th informational state, not a transition target).
- Historical-replay tests: each scaffold's test invokes `buildFixPrompt(fixture)` and asserts: (a) the result has `ok: true`; (b) `systemPrompt` mentions the class-specific source surface; (c) `userPrompt` is envelope-wrapped; (d) (optional) a mocked SDK response with a fenced unified diff parses cleanly.

</specifics>

<deferred>
## Deferred Ideas

- Multi-model A/B for difficult classes (Sonnet vs Opus) — explicitly v4.1
- Cross-issue fix batching — out of scope
- Auto-fix metrics digest extension — defer to v4.1
- Empirical recalibration of `fix_attempts` cap-at-3 (Phase 42 CONTEXT carry-over) — flagged for post-v4.0 backlog; Phase 45 ships with cap-at-3 unchanged
- Empirical recalibration of diff-size cap (200 LOC src / 50 LOC tests) — same flag

</deferred>

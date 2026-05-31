# Phase 39: SDK Driver + Ledger v2 + Branch Protection Wave-0 - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Mode:** Auto-generated (smart-discuss infrastructure detection — pure foundation phase, all success criteria are technical, no user-facing behavior)

<domain>
## Phase Boundary

Foundation library + repo-level safety rails landed before any auto-fix PR can open. Wave-0 of v4.0:

1. **SDK transport** — `invokeAnthropicSdkWithLedger` in `tests/e2e/lib/llm-driver.js` with INVERSE CI gate (runs only when `CI=true` OR `--force-api`), sharing unified `LEDGER_PATH` with existing `invokeClaudePWithLedger`.
2. **Ledger v2 schema** — `tests/e2e/lib/llm-ledger.js` accepts additive `transport: 'subscription' | 'sdk'` and `phase: string` fields; new `combinedMonthlyTotal()` helper sums both transports against the unified $80 warn / $100 hard cap.
3. **Per-day / per-issue / per-PR sub-caps** — $10 / $1 / $2 enforced in both `invokeAnthropicSdkWithLedger` and `invokeClaudePWithLedger`; Vitest covers each boundary.
4. **Committed ledger flip** — `tests/e2e/.llm-spend-ledger.json` moves from gitignored to committed-but-versioned. Future workflows commit ledger updates atomically with `[skip ci]` (Phase 40+).
5. **ESLint guard** — `no-restricted-imports` restricts `@anthropic-ai/sdk` to `llm-driver.js` only.
6. **Branch protection Wave-0** — `Allow auto-merge: OFF` at repo level; branch protection ruleset on `main` with `Do not allow bypassing: ON` and required-status-check slot for the verifier-gate workflow (Phase 41); `CODEOWNERS` pins `src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`.

Out of scope (later phases):
- Workflow files (Phase 40+)
- Fix-prompt builder (Phase 42)
- Auto-fix dispatcher (Phase 42)
- Verifier-gate workflow (Phase 41) — Phase 39 only RESERVES the required-status-check slot

</domain>

<decisions>
## Implementation Decisions

### Locked by REQUIREMENTS.md / ARCHITECTURE.md / PITFALLS.md (v4.0 research)

- **Ledger path:** Existing `tests/e2e/.llm-spend-ledger.json` (per STATE.md decision: "avoids breaking v3.1 local ledger continuity"). Flipped from gitignored to committed.
- **Cap thresholds:** Unified $80 warn / $100 hard-cap per month across BOTH transports (subscription + SDK). Sub-caps: per-day $10, per-issue $1, per-PR $2.
- **SDK pin:** `@anthropic-ai/sdk@0.100.1` EXACT (not caret) — research flagged 30+ minor versions breaking API twice in 2026-Q2.
- **Default model for auto-fix:** `claude-sonnet-4-6` ($3/$15 per Mtok). Reserve `claude-opus-4-7` for Tier-C escalation paths (Phase 45+).
- **CI gate inversion:** `invokeClaudePWithLedger` is local-only (no CI). `invokeAnthropicSdkWithLedger` is the opposite — CI-only OR `--force-api`. Both coexist; transport tag distinguishes ledger entries.
- **ESLint scope for SDK guard:** ONLY `tests/e2e/lib/llm-driver.js` may import `@anthropic-ai/sdk`. All other paths blocked via `no-restricted-imports`.
- **CODEOWNERS pins:** `src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`. Owner is `@fatduck` (single-maintainer repo).
- **Branch protection scope:** `main` only. Required-status-check SLOT created (the actual verifier-gate workflow doesn't exist until Phase 41 — empty slot reserved here so Phase 41 can populate without touching repo settings).

### Claude's Discretion

- Vitest test file organization (single `llm-ledger.test.js` vs split per-cap files) — keep close to existing v3.1 ledger test conventions
- ESLint rule wording / message format — match existing `no-restricted-imports` rules in the repo
- `combinedMonthlyTotal()` signature — pure function over the ledger; accept the ledger object directly, no I/O
- Phase field validation strictness — additive-only means existing entries without `phase` must still parse; no migration script needed
- Whether to ship branch-protection / CODEOWNERS as a single PR or as a separate "repo-settings" commit alongside the code changes — execute as a single atomic phase commit set
- `--force-api` flag semantics — implement as boolean env var or CLI flag consistent with the existing `--force-llm` v3.1 convention

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be deepened during plan-phase research. Key v3.1 surfaces this phase extends:

### Reusable Assets (from v3.1)
- `tests/e2e/lib/llm-driver.js` — currently exports `invokeClaudePWithLedger` (subscription transport, CI-guarded). Phase 39 ADDS a sibling export `invokeAnthropicSdkWithLedger`.
- `tests/e2e/lib/llm-ledger.js` — `appendLedgerEntry()` signature gains optional `transport` + `phase` fields. Existing call sites unaffected.
- `tests/e2e/.llm-spend-ledger.json` — already in use locally (gitignored). Schema is forward-compatible with new fields.
- `tests/e2e/lib/issue-payload-builder.js` — v3.1 pure-function pattern that the v4.0 `fix-prompt-builder.js` (Phase 42) will mirror.
- ESLint config — existing `no-restricted-imports` rules in the repo for guard patterns.

### Established Patterns (from v3.1)
- Pure-function library modules in `tests/e2e/lib/` (no fs/child_process imports; tested in isolation with Vitest).
- Ledger entries are append-only JSON; transport-tagged for audit greps.
- CI guards via `process.env.CI === 'true'` checks at function entry.
- Atomic `[skip ci]` commits for state files (`e2e-weekly-digest.yml:98-110` is the canonical example for Phase 40).

### Integration Points
- Phase 40 (deps-update, cost-snapshot workflows) — consumes the ledger schema landed here.
- Phase 41 (verifier-gate workflow) — fills the required-status-check slot reserved here.
- Phase 42 (auto-fix.mjs core dispatcher) — first real consumer of `invokeAnthropicSdkWithLedger`.

</code_context>

<specifics>
## Specific Ideas

- Mirror `invokeClaudePWithLedger`'s call-site ergonomics in `invokeAnthropicSdkWithLedger` so future scripts can swap transports trivially (Phase 46 `--transport subscription` flag depends on this symmetry).
- Reserve a `phase: '39-bootstrap'` value in the first committed ledger entry so the committed-ledger flip is itself observable in the ledger.
- `CODEOWNERS` should be at `/.github/CODEOWNERS` (canonical GitHub location).
- Branch protection ruleset config lives in repo Settings (not version-controlled at GitHub's level for the ruleset itself); document the setting in a `docs/v40-repo-config.md` or inline in CLAUDE.md so the audit in Phase 47 (CLEANUP-04) has a written reference.

</specifics>

<deferred>
## Deferred Ideas

- Per-model cost rates table extraction — currently hard-coded in `llm-driver.js`; if Phase 45's multi-class expansion introduces opus tier-C escalation, consider extracting. Not load-bearing for Phase 39.
- Ledger pruning / archival — committed-ledger flip means file grows monotonically; defer to v4.1 if it becomes a git-history concern (`combinedMonthlyTotal()` already filters by current month).
- Repo-settings-as-code (e.g., Terraform / `gh api`-driven config) — manual settings change is acceptable for Phase 39; Phase 47 audit verifies via `gh api` reads.

</deferred>

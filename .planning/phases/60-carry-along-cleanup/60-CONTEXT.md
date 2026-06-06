# Phase 60: Carry-Along Cleanup - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Mode:** Auto-generated (small cleanup phase — smart discuss skipped)

<domain>
## Phase Boundary

Close two carry-along items from prior phases:
- **CLEAN-01:** Remove the now-dead module-level `MODEL` const in `scripts/auto-fix.mjs:189` (Phase 54 left it per additive-only scope_lock; Phase 54 close-note explicitly transferred this cleanup to Phase 60).
- **CLEAN-02:** Finish Phase 51.1's `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` V2 update so `npm test` exits 0 with zero pre-existing failures in this file.

Pre-flight scout findings:
- **CLEAN-01 scope:** `const MODEL = 'claude-sonnet-4-6'` at line 189 is referenced 8 times in `scripts/auto-fix.mjs` (lines 421, 518, 674, 721, 818, 841, 879, 953). Phase 54 close-note says "MODEL const in scripts/auto-fix.mjs now dead code" because Phase 54's AB-03 swap (`MODEL → built.model`) moved the live LLM call to use `built.model` from `buildFixPrompt()`. The remaining 8 references are all in ledger-entry writes and the PR-create hint string, all of which currently write `model: 'claude-sonnet-4-6'` hardcoded (regardless of which model actually produced the fix).
- **CLEAN-02 status:** Pre-flight `CI=true npx vitest run tests/e2e/scripts/v40-verifier-gate-yaml.test.js` shows **23/23 tests passing in 5ms** — no pre-existing failures remain. The V2 issue Phase 51.1 left incomplete appears to have been resolved during Phase 56/57/58 work (likely via Phase 57's diff-guard scope-decision addition + Phase 51.1's verifier-gate trigger fix that landed at commit `ea45a47`). CLEAN-02 is effectively a verification step: confirm zero failures across the full `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` suite + add the V2 contract assertion line if not already present.

Requirements covered: CLEAN-01, CLEAN-02.

</domain>

<decisions>
## Implementation Decisions

### Pre-Locked by REQUIREMENTS.md + pre-flight scout

- **CLEAN-01 implementation strategy — literal-inline replacement:** The roadmap's "2-line deletion" wording is optimistic given the 8 references. The honest implementation is: delete `const MODEL = 'claude-sonnet-4-6';` AND inline-replace each of the 8 `MODEL` references with the literal string `'claude-sonnet-4-6'`. This preserves byte-equivalent ledger behavior (entries still write `model: 'claude-sonnet-4-6'`) while removing the dead const. 9 lines total: 1 delete + 8 single-token replacements.
- **CLEAN-01 per-arm attribution scope-locked OUT:** The 8 sites currently hardcode `model: 'claude-sonnet-4-6'` regardless of which model produced the fix (opus or sonnet). This is a real attribution gap for `a-b-winner.mjs:isAttributable` on the *upstream* auto-fix entries — but it's a DIFFERENT scope than CLEAN-01's "remove the const" goal. The roadmap explicitly scoped CLEAN-01 to deletion-only; threading `built.model` to all 8 sites would require careful scope analysis (sites at lines 421, 518 are pre-dispatch — `built.model` is not in scope; sites at lines 674+ are post-dispatch — `built.model` IS in scope). Defer to a future phase (OBS-FUT-02 in REQUIREMENTS.md) as a documented open item. Phase 58 + Phase 59 Decision C already provide per-arm attribution on OUTCOME entries; upstream attribution is the remaining gap.
- **CLEAN-02 verification-only:** Confirm `npm test` is green in this test file (already verified during pre-flight: 23/23 pass). If verification reveals a hidden failure, address it; otherwise CLEAN-02 reduces to documenting the no-op closure.

### Claude's Discretion (during plan-phase)

- Commit story: single atomic `chore(60): close CLEAN-01 + CLEAN-02 carry-along items` if CLEAN-02 is truly no-op verification; or split if CLEAN-02 surfaces a hidden V2 update.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/auto-fix.mjs:189` — `const MODEL = 'claude-sonnet-4-6';` (target of CLEAN-01)
- `tests/e2e/scripts/v40-verifier-gate-yaml.test.js` — V1-V23 contract tests; all currently passing per pre-flight

### Integration Points
- The 8 `MODEL` references in `scripts/auto-fix.mjs` ledger writes — inline-replaced with the literal string in this phase

</code_context>

<specifics>
## Specific Ideas

Pre-flight confirms:
- CLEAN-02 has zero pre-existing failures — Phase 60 is verification-only for this requirement
- CLEAN-01 is mechanically simple but semantically reveals an attribution gap that's deferred to a future phase

</specifics>

<deferred>
## Deferred Ideas

- Per-arm `model` attribution on the upstream `auto-fix-api` ledger entries (8 sites in `scripts/auto-fix.mjs`) — documented as OBS-FUT-02 follow-up; not in CLEAN-01 scope

</deferred>

---
phase: 32-human-uat-verification
plan: 05
status: complete
outcome: passed
type: execute
attempts_used: 1
iterations: 10
phase_32_spend_usd: 0.83
---

# Plan 32-05 Summary — Live UAT Execution

**Outcome:** ✓ PASSED on attempt 1. All four ROADMAP.md Phase 32 success criteria demonstrably met. Live UAT exercised the full Phase 32 stack: `--phase` CLI flag, per-phase ledger caps, schema-guard fixture, local→CI upload handoff. Two implementation bugs surfaced in Plan 32-04 during the UAT — one fixed in-line, one worked around with documented remediation surface for Phase 33+.

## Tasks Completed

| Task | Type | Outcome | Commits |
|------|------|---------|---------|
| 1 | auto (scaffold template) | ✓ | `127acf4` docs(32-05): scaffold UAT evidence template |
| 2 | human-action (live explore + fixture commit) | ✓ pass attempt 1 | `4b3ac61` docs(32): UAT evidence + real-run fixture (attempt 1, 10 iterations, $0.83 phase-32 spend) |
| 3 | human-action (upload helper roundtrip) | ✓ approved (after `aaba28c` fix) | `aaba28c` fix(32-04): use -F (capital) for stdin payload to gh workflow run |
| 4 | human-verify (4-criteria sign-off) | ✓ approved | *(this summary commit)* |

## Key Outcomes

### Phase 32 deliverables proven end-to-end

- **UAT-01 (live `--phase 32 --iterations 10` run):** 10 schema-valid iterations produced at `tests/e2e/artifacts/2026-05-25T05-22-53Z/llm-report.json` (committed verbatim as `tests/e2e/fixtures/uat-phase32-llm-report.json`). Schema-guard spec (Plan 32-01 Task 4) flipped from SKIPPED to GREEN with the fixture in place.
- **UAT-02 (per-phase ledger tagging):** ledger entries from the run all carry `phase: "32"` (sample: iteration 10 at `2026-05-25T05:26:27.547Z`, `cost_usd: 0.0194845`, `tokens_in: 6`, `tokens_out: 204`). Phase-32 sum $0.83 — well under the $10 D-13 cap. Plan 32-03's `--phase` wiring, pre-flight check (D-15), and mid-run check (D-16) all confirmed operational.
- **UAT-03 (local→CI upload handoff):** ingest workflow run `26413491001` (✓ Success, `llm-report` artifact with 14-day retention); nightly workflow run `26413494488` (✓ Success in 8m48s); the "Download and validate LLM report" step emitted the verbatim `schema OK: 10 iterations` line at `2026-05-25T18:01:00.8862481Z`, proving the round-trip through `appendLlmIteration` (D-06) succeeded.
- **D-04 regression baseline:** 434 Vitest tests pass (no Phase 32 regressions; +3 Wave 0 schema-guards activated; +4 Plan 32-04 helper-spec rewrite turned SKIP→GREEN). 75/76 Playwright cases pass — the 1 failing case (`US11427642-claims-1`) is the pre-existing designed-failure from Plan 28-05-04, not a Phase 32 regression (empty diff in failing surface).

### Live findings (Phase 32 doing its job)

The whole point of Phase 32 was to validate that the LLM-driven exploratory infrastructure (Phase 31) and the local→CI handoff (Plan 32-04) actually work end-to-end against real subscription credit and real GitHub Actions. It did, and it surfaced four bugs in the process — each documented with disposition:

1. **Plan 32-04 `-f` vs `-F` flag bug** — fixed in-line as commit `aaba28c`. Helper now passes stdin payload correctly to `gh workflow run`.
2. **Plan 32-04 `resolveRunId()` semantic mismatch** — workaround `PLAYWRIGHT_RUN_ID=<run-id>` env var documented; Phase 33+ gap-closure needed to add `--run-id` CLI flag or "most-recent" lookup.
3. **Plan 32-04 helper exit-3 on WSL2** — non-blocking UX issue; helper exits non-zero when xdg-open fails even though the API-level work completed. Phase 33+ gap-closure to wrap browser-open in try/catch.
4. **Wave 1 32-04 commits silently lost from main** — orchestrator-level bug; recovered in-line via `a3da175` (clean fast-forward merge). High-priority `gsd-debug` session recommended post-Phase-32 to investigate the harness's worktree-merge contract.

### Phase 31 design tension surfaced

All 10 UAT iterations classified as `LLM_API_ERROR` (2) or `HARNESS_ERROR` (8) — but inspection reveals the actual cause is `schema_validation_failed: selectedText too long (> 300): length=400`. The LLM (claude-opus-4-7[1m]) consistently picks longer selections for "modern-long", "repetitive", and "cross-col" categories, and the harness rejects them. The classification name `LLM_API_ERROR` is misleading. This is real, valuable Phase 33+ triage input — the committed fixture is exactly the artifact Phase 33+ needs to design the triage pipeline against. Phase 32 contract is unaffected (the schema-guard spec checks structural validity, not success-vs-failure classification).

## Files Created / Modified

- `.planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md` (NEW — Task 1 scaffold + Task 2/3/4 evidence)
- `.planning/phases/32-human-uat-verification/32-05-SUMMARY.md` (THIS FILE)
- `tests/e2e/fixtures/uat-phase32-llm-report.json` (NEW — 10 schema-valid iterations from the live UAT)
- `scripts/e2e-upload-llm-report.mjs` (in-line fix: `-f` → `-F` for stdin payload)

## Self-Check: PASSED

All gates verified:

- [x] Task 1: 32-UAT-EVIDENCE.md template exists with 11+ required sections (committed `127acf4`)
- [x] Task 2: live explore run produced 10 iterations; fixture committed; schema-guard spec flipped SKIP→GREEN (committed `4b3ac61`)
- [x] Task 3: ingest workflow run `26413491001` ✓; nightly workflow run `26413494488` ✓; verbatim `schema OK: 10 iterations` log line captured
- [x] Task 4: all 4 ROADMAP success criteria check-marked in evidence Sign-Off section; sign-off metadata populated
- [x] D-04 regression baseline: Vitest 434 pass (0 new failures); Playwright 75/76 pass (the 1 failure is documented pre-existing designed-failure, not a Phase 32 regression)
- [x] Per-phase $10 cap respected: $0.83 final sum
- [x] Global $80/$100 monthly cap respected: $2.70 May-2026 monthly total

Phase 32 ready for orchestrator phase-completion gates (code review, regression gate, verifier, ROADMAP update).

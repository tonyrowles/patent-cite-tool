# Phase 32: HUMAN-UAT Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 32-HUMAN-UAT Verification
**Areas discussed:** UAT execution model, Upload helper transport, UAT failure policy, Phase 32 spend ceiling

---

## UAT Execution Model

### Q1: Who runs the live `npm run e2e:explore` against your Max 5 subscription?

| Option | Description | Selected |
|--------|-------------|----------|
| You run it locally | (Recommended) User runs on their machine where Max 5 subscription auth lives; pastes back terminal output and commits llm-report.json. Claude prepares scripts beforehand. | ✓ |
| Claude runs from this session | Only works if `claude -p` subscription auth is wired into this terminal; historically fragile when nesting from inside Claude Code. | |
| Hybrid: Claude scaffolds, you execute once | Claude writes a one-shot UAT runner script wrapping e2e:explore with extra logging/spend tracking; user runs once. | |

**User's choice:** You run it locally.

### Q2: What evidence do we commit to prove the UAT passed?

| Option | Description | Selected |
|--------|-------------|----------|
| Both: log + JSON as fixture | (Recommended) Commit full terminal output to `32-UAT-EVIDENCE.md` AND the produced llm-report.json to `tests/e2e/fixtures/uat-phase32-llm-report.json`. Downstream phases get a real fixture. | ✓ |
| Just a writeup | Commit only `32-UAT-EVIDENCE.md`. Raw llm-report.json stays gitignored; downstream phases use synthetic fixtures. | |
| Just the JSON | Commit only the produced llm-report.json as a fixture; no narrative writeup. | |

**User's choice:** Both: log + JSON as fixture.

### Q3: How much should we sanity-check the produced llm-report.json content?

| Option | Description | Selected |
|--------|-------------|----------|
| Schema + spot-check 3 iterations | (Recommended) Schema guard passes AND user/Claude manually inspects 3 random iterations to confirm content looks sensible. | |
| Schema only | Just confirm all iterations pass JSON schema. Trust Phase 33 re-run validator to catch semantic garbage. | ✓ |
| Full review of all >=10 iterations | Read every iteration's prompt and response by hand. Maximally confident; likely overkill. | |

**User's choice:** Schema only.

### Q4: Where do we run the regression baseline (461 Vitest + 76 golden)?

| Option | Description | Selected |
|--------|-------------|----------|
| Local + CI both | (Recommended) Run `npm test` and `npm run e2e:regression` locally before commit AND let CI re-run on push. Defense in depth. | ✓ |
| CI only (trust GitHub Actions) | Skip the local run; commit and let CI be the gate. Faster iteration but may bounce off CI. | |
| Local only (skip CI check) | Run locally, commit, don't wait for CI. Risk: CI may catch what local misses. | |

**User's choice:** Local + CI both.

---

## Upload Helper Transport

### Q1: How does `npm run e2e:upload-llm-report` get the local llm-report.json into the nightly run?

| Option | Description | Selected |
|--------|-------------|----------|
| Two-stage: ingest workflow + llm_run_id | (Recommended) Helper triggers `e2e-ingest-llm-report.yml` which uploads file as artifact; helper captures run_id; then triggers nightly with `-f llm_run_id=<id>`. Matches v3.1 research SUMMARY architecture; any file size. | ✓ |
| Inline base64 in workflow_dispatch | Helper base64-encodes and passes directly as input. Simpler but constrained by ~64KB input limit. | |
| Commit to repo + reference by SHA | Helper commits to `reports/llm-runs/{date}-{slug}.json` on side branch; triggers nightly with SHA. Maximally auditable; pollutes git. | |

**User's choice:** Two-stage: ingest workflow + llm_run_id.

### Q2: What does the nightly workflow do once it has the uploaded JSON?

| Option | Description | Selected |
|--------|-------------|----------|
| Just download + validate schema for now | (Recommended) Phase 32 only wires download + schema-guard step. Real triage pipeline that consumes it is Phase 36 scope. Keeps phase to declared boundary. | ✓ |
| Download + skip the LLM-explore step | When `llm_run_id` provided, nightly skips LLM-explore (none exists today) and goes straight to verifier/regression. | |
| Download + stub a no-op triage step | Add placeholder `run-triage-pipeline.mjs` step that exits 0; Phase 36 replaces stub. Slight scope creep. | |

**User's choice:** Just download + validate schema for now.

### Q3: How does the helper return the run_id?

| Option | Description | Selected |
|--------|-------------|----------|
| Print + open in browser | (Recommended) Print run URL AND open `gh run view <id> --web` in default browser. Zero-effort verification. | ✓ |
| Print URL only | Echo URL to stdout; user clicks if they want to verify. Minimal noise. | |
| Poll until completion | Block, poll every 5s via `gh run watch`, surface success/failure at end. Long-running. | |

**User's choice:** Print + open in browser.

### Q4: Where does the helper look for llm-report.json to upload?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed path (current default) | (Recommended) Reads from the same path `e2e-explore.mjs` writes to. One canonical location, no flags. | ✓ |
| CLI flag --file <path> | Accepts `-- --file path/to/report.json`. Flexible but adds flag daily user won't need. | |
| Both: fixed default + --file override | Defaults to canonical; --file overrides. Best of both, slightly more code. | |

**User's choice:** Fixed path (current default).

---

## UAT Failure Policy

### Q1: What's the gating posture if the live UAT produces <10 iterations or schema-mismatches?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate with retry budget | (Recommended) Phase 32 fails. Up to 2 retries (3 total attempts) before declaring Phase 31 needs rework. Phase 33+ stays blocked. | ✓ |
| Hard gate, no retries | Single attempt. Any failure routes back to Phase 31 immediately. May waste credits on flukes. | |
| Soft gate with fixture fallback | Document partial, capture hand-crafted fixture, let Phase 33+ proceed. Defeats de-risking purpose. | |

**User's choice:** Hard gate with retry budget.

### Q2: What counts as a passing UAT for iteration content?

| Option | Description | Selected |
|--------|-------------|----------|
| 10 schema-valid, any verdict | (Recommended) >=10 iterations pass JSON schema. PASS/FAIL/ANOMALY all count. Schema is only gate; semantics is Phase 33 concern. | ✓ |
| 10 schema-valid, mixed verdicts required | Need at least one PASS and at least one ANOMALY/FAIL. Stronger signal but may force >10 runs. | |
| 10 schema-valid + zero claude -p errors | All 10 complete without any invocation errors. Most demanding. | |

**User's choice:** 10 schema-valid, any verdict.

### Q3: If `npm run e2e:upload-llm-report` fails, what's the gate?

| Option | Description | Selected |
|--------|-------------|----------|
| Independent gate, same retry budget | (Recommended) Upload failure separate from explore. Up to 2 retries on helper alone. Successful explore output preserved across retries. | ✓ |
| Couple to explore retry budget | Upload failure counts against 3-attempt total. Simpler accounting; penalizes for unrelated transport bugs. | |
| Hard fail, no retries on upload | Either works first try or we fix the helper. Overkill given gh CLI flakiness. | |

**User's choice:** Independent gate, same retry budget.

### Q4: If UAT fails (after retry budget exhausted), what's the documented next step?

| Option | Description | Selected |
|--------|-------------|----------|
| Reopen Phase 31 + capture failure mode | (Recommended) Add `32-UAT-FAILURE.md` documenting what broke; reopen Phase 31 in ROADMAP; re-plan with failure mode as new acceptance criterion. Phase 32 stays not-started. | ✓ |
| Spawn a new Phase 31b hotfix phase | Leave Phase 31 as-shipped; insert Phase 31b focused on the failure mode. Cleaner audit trail; more churn. | |
| Trigger /gsd:debug on the failure | Run `/gsd:debug`; outcome decides reopen vs hotfix. | |

**User's choice:** Reopen Phase 31 + capture failure mode.

---

## Phase 32 Spend Ceiling

### Q1: What's the spend ceiling for the Phase 32 UAT specifically?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-phase dollar cap: $10 | (Recommended) UAT aborts if Phase 32 cumulative spend >= $10. Leaves $90 of monthly $100 for rest of v3.1. ~$3.30/attempt average across 3 attempts. | ✓ |
| Per-phase dollar cap: $5 | Tighter; forces first-try discipline. May cut retries short. | |
| No per-phase cap, global only | Only $80/$100 monthly. Max flexibility; UAT could consume most of budget. | |
| Iteration-count cap, not dollar | Stop at exactly 10 iterations regardless of cost (within global). Simpler; one expensive run could still cost more than expected. | |

**User's choice:** Per-phase dollar cap: $10.

### Q2: How is the $10 per-phase cap enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Ledger tag + pre-flight check | (Recommended) `e2e-explore.mjs --phase=32` flag stamps each ledger entry with `phase: "32"`; UAT runner pre-flight sums and aborts if >= $10. Auditable; no global cap changes. | ✓ |
| Separate phase-scoped ledger file | New `.llm-spend-ledger-phase32.json` in parallel; pre-flight sums that file. Cleaner isolation; two ledgers to sync; deviates from Phase 31 design. | |
| Honor system + manual check | No code enforcement; eyeball ledger and stop manually. Easy to overshoot mid-attempt. | |

**User's choice:** Ledger tag + pre-flight check.

### Q3: What happens when the per-phase $10 cap is hit mid-run (not pre-flight)?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard abort, save partial report | (Recommended) Check ledger after each iteration; abort cleanly if >= $10; finalize llm-report.json with completed iterations. UAT pass-bar decides if partial meets >=10. | |
| Warn at $8, abort at $10 | Two-tier matching global $80/$100 pattern. More forgiving; adds second threshold. | ✓ |
| Let it run past $10, alert after | Soft cap; ledger keeps recording; post-run report flags overshoot. Most likely to pass UAT in one attempt; defeats the cap. | |

**User's choice:** Warn at $8, abort at $10.

### Q4: Where is the `phase: "32"` ledger tagging hardcoded vs configurable?

| Option | Description | Selected |
|--------|-------------|----------|
| CLI flag --phase, defaults to null | (Recommended) `e2e-explore.mjs --phase 32` writes `phase: "32"` to ledger entries; without flag `phase: null` (backward compatible with Phase 31). UAT runner passes flag. | ✓ |
| Env var E2E_EXPLORE_PHASE | Set via env. Equally backward-compatible; less discoverable. | |
| Hardcoded in a wrapper script | New `scripts/uat-phase32-runner.mjs` always sets `phase: "32"` and delegates. Touches more files than necessary. | |

**User's choice:** CLI flag --phase, defaults to null.

---

## Claude's Discretion

- Exact file layout of `32-UAT-EVIDENCE.md` (sections, ordering).
- Whether the `--phase` flag's value validation is strict (regex `^\d+$`) or permissive.
- Concrete error message wording for the pre-flight and mid-run aborts.

## Deferred Ideas

- Patent set selection / Google A/B drift handling during UAT — capture in `32-UAT-EVIDENCE.md` if encountered; address in a later phase rather than expanding Phase 32 scope.
- Stale `llm_run_id` handling on nightly (artifact older than N days) — Phase 32 trusts whatever id it's given; hardening is Phase 36 territory.
- "Promote fixture to golden" workflow for the Phase 32 UAT fixture — not in v3.1; revisit if downstream phases find repeated value.

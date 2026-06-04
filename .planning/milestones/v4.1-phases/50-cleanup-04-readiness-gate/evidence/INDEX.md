# Phase 50 Evidence Index

This index maps every file in `evidence/` to its role in the closure narrative of Phase 50 (CLEANUP-04 Readiness Gate). Files are listed in the order they were produced during plan execution. All assertions referenced here are the literal jq queries that ran in the executor; commands appear verbatim in the task source at `../50-01-PLAN.md`.

| File | Task | Role |
|------|------|------|
| `pre-patch-ruleset.json` | Task 01 | Pre-patch baseline — GET of ruleset 17086676 captured BEFORE any mutation. Asserts: 4 rules, 1 bypass actor (id=254599900), enforcement=active. This is the rollback target. |
| `rollback.sh` | Task 01 | One-command recovery — bash one-shot that re-PUTs `pre-patch-ruleset.json` to ruleset 17086676. Single failsafe used in every assertion failure branch across Tasks 02/04/05. Idempotent under current auth. |
| `integration-id-discovery.log` | Task 02 (sub-step 2a) | Proves integration_id=15368 was DISCOVERED from `check-runs` on Phase 49 merge SHA `c0bb37d5dfeb28f7ce7901fa50e36d231d6fc6e2`, not hardcoded. Confirms 15368 = GitHub Actions App ID, not 26860592872 (workflow-run databaseId conflation — Pitfall 4). |
| `gate-01-payload.json` | Task 02 (sub-step 2b) | GATE-01 PUT body. Built via jq append: 4 existing rules + 1 new `required_status_checks` rule. Asserts pre-send: 5 rules total, 2 contexts (`verifier-gate`, `deps-update-gate`), integration_id=15368 on both. Sent live via `gh api -X PUT --input`. |
| `post-gate-01-ruleset.json` | Task 02 (sub-step 2c) | Post-GATE-01 state — fresh GET after PUT confirms 5 rules + both contexts pinned at integration_id=15368 + bypass_actors still=1 (unchanged this gate). This is the input GATE-02 ran against. |
| `gate-03-pr-state.json` | Task 03 (sub-step 3d) | Method A two-pronged enforcement assertion. `gh pr view --json statusCheckRollup,mergeable,mergeStateStatus` snapshot proving (1) both required contexts registered on the test PR, (2) neither in SUCCESS state. mergeStateStatus disambiguates BLOCKED vs BEHIND per Pitfall 5. |
| `gate-03-merge-blocked.txt` | Task 03 (sub-step 3e) | Method B two-pronged enforcement assertion. Stderr capture from `gh pr merge --merge` (NO `--admin` — running unprivileged path per anti-pattern guard). Non-zero exit code + stderr matched required-check regex. Proves enforcement is real, not just configured. |
| `break-glass-test.json` | Task 04 (sub-steps 4a–4c) | Three snapshots (pre-cycle, post-PUT-1, post-PUT-2) of `{at, rules_count, bypass_actors}`. Demonstrates idempotent same-actor re-add cycle: `length==1` throughout, `actor_id==254599900` throughout, rules_count==5 throughout. Never a 0-actor or 2-actor intermediate state (D-08). |
| `break-glass-test.log` | Task 04 (sub-steps 4a–4c) | Bearer-redacted log of the full add-then-readd cycle. Three GET snapshots interleaved with two idempotent PUT bodies. Proves the literal commands documented in `docs/v40-repo-config.md §7` execute under current auth — runbook is not aspirational. |
| `gate-02-payload.json` | Task 05 (pre-execution) | GATE-02 PUT body — lighter shape `{"bypass_actors":[]}` only. NO `rules` key (top-level merge preservation live-confirmed in Task 02 — sending a stale or empty `rules` array would clobber GATE-01). Pre-send asserted: `has("rules")\|not` AND `(.bypass_actors\|length==0)`. |
| `post-gate-02-ruleset.json` | Task 05 (post-PUT) | Post-GATE-02 state — fresh GET after the second mutation. Asserts: 5 rules preserved (no rule drop), bypass_actors=[], `current_user_can_bypass` flipped from `"always"` → `"never"` (second-order proof — the operator who issued the PUT can no longer bypass). Both required contexts still pinned at integration_id=15368. |
| `final-ruleset.json` | Task 06 | Phase 50 closure baseline — final GET captured for the SUMMARY's SC-1 and SC-2 evidence pointers. Identical in structure to `post-gate-02-ruleset.json` (sanity duplicate; serves as the canonical closure reference for downstream phases consuming Phase 50 invariants). |

## Cross-references

- **SC-1 evidence anchor** (both contexts in required_status_checks pinned to integration_id=15368): `final-ruleset.json` — the canonical jq query is `.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[] | {context, integration_id}`.
- **SC-2 evidence anchor** (bypass_actors=[] + second-order proof): `post-gate-02-ruleset.json` + `final-ruleset.json` both confirm `.bypass_actors|length==0` AND `.current_user_can_bypass=="never"`.
- **SC-3 evidence anchor** (enforcement real + break-glass committed-before-bypass-removal): `gate-03-pr-state.json` + `gate-03-merge-blocked.txt` + `break-glass-test.{json,log}` + `docs/v40-repo-config.md §7` (committed in Task 01 commit `79d5415`, which precedes Task 05's bypass-removal commit `b57d3a9`).
- **SC-4 evidence anchor** (Vitest static-grep pins both contexts): `tests/unit/v40-verifier-gate-doc.test.js` (Phase 50 GATE-01 describe block, D11+D12 tests) — committed in Task 02 commit `9c3b016` (D-13 same-commit mandate).

## Audit log entries

Two PUTs against ruleset 17086676 hit the GitHub audit log during Phase 50:

1. Task 02 (`9c3b016`) — `gate-01-payload.json`, 5 rules including new `required_status_checks`.
2. Task 05 (`b57d3a9`) — `gate-02-payload.json`, body `{"bypass_actors":[]}` only.

Plus three no-op idempotent PUTs in Task 04 (`d455b32`) for the break-glass live cycle — also visible in the audit log but observably no-ops (Snapshot 2 == Snapshot 3 in `break-glass-test.json`).

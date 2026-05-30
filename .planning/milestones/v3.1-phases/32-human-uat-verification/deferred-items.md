# Phase 32 — Deferred Items (out-of-scope discoveries during plan execution)

Items observed by plan executors that are NOT directly caused by the plan
under execution. Logged here for the next plan executor or phase verifier
to address. Per execute-plan.md scope boundary rule: do NOT fix; do NOT
re-run builds hoping they resolve.

## Plan 32-04 executor observations

### tests/e2e/scripts/e2e-explore-phase-flag.test.js (4 failing tests)

The Wave 0 stub spec (committed as `0855e82` in Plan 32-01: "test(32-01):
stub --phase flag Vitest spec (RED until Plan 32-03)") asserts behavior of
a `--phase` CLI flag in `scripts/e2e-explore.mjs` that is owned by **Plan
32-03** (parallel wave 2 sibling). Plan 32-04 does not touch
`scripts/e2e-explore.mjs`, so these failures are pre-existing RED tests
expected to turn GREEN when Plan 32-03 lands.

Status: expected RED, not Plan 32-04 scope.

---
gsd_state_version: 1.0
milestone: v6.1
milestone_name: Auto-Fix from Bug Reports
status: verifying
stopped_at: Phase 10 context gathered
last_updated: "2026-06-17T17:38:07.952Z"
last_activity: 2026-06-17
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-17)

**Core value:** Highlight text on Google Patents, get an accurate citation reference instantly. v6.0 extended this to a standalone web page at cite.tonyrowles.com. v6.1 closes the quality loop: real user-reported citation failures become regression-safe fixes under a human merge gate.
**Current focus:** Phase 10 — retirement-scaffolding

## Current Position

Phase: 10 (retirement-scaffolding) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-06-17

```
Progress: [██████████] 100%
```

## Key Locked Decisions (v6.1)

- **Fix surface**: `src/shared/` only — `matching.js`, `position-map-builder.js`, `pdf-parser.js`; Worker-route bugs (`tool_not_working`, `pdfParseStatus:"error"`) are classified as `infrastructure` and excluded from LLM fix scope (deferred to v6.2)
- **Triage is heuristic-only**: No LLM calls during triage; LLM budget reserved exclusively for fix generation; dedup threshold `duplicate_count >= 3` (env-configurable)
- **`workflow_dispatch:` only**: No cron schedule for triage/ingestion in this milestone; maintainer-triggered only
- **Per-run cap**: `MAX_FIXES_PER_RUN` default 5 (env-configurable); surplus promoted reports remain queued
- **Fix-iteration cap**: 3 iterations per report before `auto-fix-stuck` label (no further spend)
- **Human merge gate is a permanent invariant**: No auto-merge of `src/` fix PRs. Citations go into legal filings. Encoded as a Vitest static-grep test asserting absent auto-merge flags in all workflow YAMLs
- **Two-commit ledger split inherited from v4.0**: Ledger committed to `main` with `[skip ci]` before `cpr@v8` snapshots the working tree — the ONLY permitted direct push to `main`
- **`wrangler --remote` is mandatory**: All new `wrangler kv key list/get` calls must include `--remote`; wrangler v4 default reads local miniflare (returns false-empty `[]`)
- **`REPORT_FIX_SCAFFOLD` is novel**: Phase 12 fix-generation is the highest-risk phase and requires a research-phase during planning (prompt design for KV-report → matching-core diff is new; validate with a sample report; plan 2-3 prompt-iteration cycles)
- **Phase 10 retirement supersedes `RESUME-V4.3.md`**: The re-enable checklist (un-skip synthetic-trigger contract tests, restore `issues: labeled` trigger, restore `v40-auto-promote` `pull_request:closed` trigger) is voided — those guarded the retired path and are removed, not restored

## Bypass Conventions

**LOAD-BEARING RUNBOOK** (per BYPASS-03 — Pitfall 11 mitigation):

- **DO NOT** use `gh pr merge --admin` on `auto-fix/*` branches. EVER.
- `--admin` bypasses the `verifier-gate` CI check but still writes `outcome: 'pass'` ledger entries via `auto-fix-promote.mjs`. These entries pollute A/B winner sample math because `assertTripleGate` (verified-label + merged + triage-sourced) does not detect the bypass when the maintainer manually adds `auto-fix:verified` before merging.
- Sole-maintainer ruleset 17086676 has `@tonyrowles` (`actor_id 254599900`) as permanent bypass actor with `bypass_mode: always` (post-v4.2 reversal — see Ruleset Decision below). The bypass is for **human-authored** changes that warrant scope-decision fast-path or maintenance commits — **not** for auto-fix promotions.
- Phase 62 `scripts/audit-bypass-merges.mjs` (BYPASS-01) queries `gh api repos/<owner>/<repo>/actions/runs` for `verifier-gate` runs completed AFTER the PR was merged; outputs CSV consumed by Phase 66's `a-b-winner.mjs --admin-bypass` filter to exclude bypass-tainted `outcome:'pass'` entries.
- Weekly digest gains bypass-count metric (BYPASS-02) so the discipline is observable in the Auto-Fix Pipeline section.

**v6.1 extension to human-gate invariant:**

- No `gh pr merge --auto` or `auto-merge: true` flags in any `v40-*.yml` or new `v61-*.yml` workflow YAML
- This is enforced as a named Vitest static-grep test (GATE-04) — a drift from this invariant fails CI

## Performance Metrics

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 MVP | 4 | 8 | ~3 days |
| v1.1 Silent Mode + Infrastructure | 3 | 8 | 1 day |
| v1.2 Store Polish + Accuracy Hardening | 6 | 12 | 2 days |
| v2.0 Firefox Port | 4 | 10 | ~2 days |
| v2.1 CI/CD Pipeline | 2 | 2 | 2 days |
| v2.2 Matching Robustness | 3 | 4 | 2 days |
| v2.3 Post-v2.2 Hardening | 3 | 5 | 1 day |
| v3.0 Autonomous E2E Testing Agent | 6 | 30 | ~7 days |
| v3.1 LLM-Driven Product Improvement Loop | 7 | 31 | ~9 days |
| v4.0 Self-Healing Test Suite | 9 | 26 | ~3 days |
| v4.1 Readiness Gate + Push | 9 | 11 | ~2 days |
| v4.2 Auto-Fix Loop Live | 5 (+60.1 hotfix) | 11 | ~5 days |
| v5.0 Bug Report Feature | 5 | 16 | ~4 days |
| v6.0 Standalone Citation Webapp | 4 | 9 | ~1 day |
| v6.1 Auto-Fix from Bug Reports | 5 | TBD | TBD |
| Phase 10 P01 | 22min | 2 tasks | 13 files |
| Phase 10 P03 | 10min | 1 tasks | 1 files |

## Accumulated Context

### Roadmap Evolution

- 2026-06-17: v6.1 roadmap created (Phases 10-14, 37 requirements across RTR/ING/TRI/PROMO/FIX/GATE/COST/DGST/UAT). Phase numbering continues from v6.0 (Phases 6-9) → v6.1 uses Phases 10-14. Hard dependency chain honoured per all four researcher files and synthesizer: RTR first (Phase 10), then ING+TRI+PROMO triage layer (Phase 11), then FIX+GATE-01..04+COST fix generation (Phase 12), then GATE-05 triple-gate extension (Phase 13), then DGST+UAT hardening (Phase 14). Phase 12 flagged as highest-risk, requiring a research-phase during planning. Coverage: 37/37 v1 requirements mapped; 0 orphans.

### Decisions

- v6.1-roadmap: Phase numbering continues from v6.0 Phases 6-9 → v6.1 Phases 10-14. No reset.
- v6.1-roadmap: LOAD-BEARING — Phase 10 (retirement) must fully complete before any Phase 11 code is written. The old `v40-auto-fix.yml` `issues: labeled` trigger for `triage`-labeled Issues is structurally incompatible with the new `report-fix-candidate` label trigger; having both active simultaneously creates workflow collision risk.
- v6.1-roadmap: LOAD-BEARING — Phase 11 (triage layer) must be stable before Phase 12 (fix generation) starts. The `v61-report-fix.yml` workflow triggers on Issues created by Phase 11's triage layer; without stable Issue body format and label conventions, the fix workflow has no valid inputs.
- v6.1-roadmap: LOAD-BEARING — Phase 12 (fix generation) must be proven working on at least one v6.1-sourced fix PR before Phase 13 extends `assertTripleGate`. The auto-promote cycle must not be extended until the end-to-end `auto-fix:verified` label flow is confirmed functional.
- v6.1-roadmap: LOAD-BEARING — Phase 12 is the highest-risk phase. `REPORT_FIX_SCAFFOLD` prompt design for KV-report → matching-core diff is novel. plan-phase must trigger a research-phase before writing implementation plans. Expect 2-3 prompt-iteration cycles.
- v6.1-roadmap: ING + TRI + PROMO combined into one phase (Phase 11) — they are tightly coupled (can't triage without reading, can't promote without classifying) and splitting them would create an artificial horizontal layer. 15 requirements is appropriate for a single standard-granularity phase given the coupling.
- v6.1-roadmap: GATE-01..04 assigned to Phase 12 (not Phase 13) — the regression gate, draft PR, verifier-gate binding, and human-merge invariant are all part of the fix delivery path and are prerequisites for any fix PR to exist. GATE-05 (triple-gate Leg 3) is a post-merge concern that depends on proven fix PRs.
- v6.1-roadmap: GATE-05 alone in Phase 13 — it is a named architectural invariant change (`assertTripleGate` body + Vitest sha256 pin) that should not be bundled with the experimental Phase 12 work. Its isolation makes the sha256 pin update atomic and auditable.
- v6.1-roadmap: v4.3 autonomous machinery (inject-defect.mjs, e2e-explore.mjs, v40-auto-fix synthetic trigger, paused Phase 61-67 artifacts) is RETIRED, not resumed. RESUME-V4.3.md is superseded. The inbound signal for v6.1 is exclusively human bug reports from BUG_REPORTS KV.
- [Phase ?]: issues:labeled synthetic trigger cannot fire
- [Phase 10 / D-12 / RTR-04 / 2026-06-17]: RESUME-V4.3.md re-enable checklist is VOIDED post-retirement. The following triggers and tests are REMOVED (not un-skipped) and must NOT be restored: (1) `issues:labeled` trigger on `v40-auto-fix.yml` — deleted in Phase 10 Plan 01; (2) `v40-auto-promote` `pull_request:closed` trigger — workflow deleted in Phase 10 Plan 01; (3) synthetic-trigger contract tests (`v40-auto-fix-yaml.test.js` A1, `v40-auto-promote-yaml.test.js` A1) — deleted, not merely skipped. The archived checklist now lives at `.planning/milestones/v4.3-phases-paused/RESUME-V4.3.md` with a SUPERSEDED note. The v4.3 autonomous machinery is fully retired; v6.1 uses exclusively human bug reports from the BUG_REPORTS KV channel.
- [Phase ?]: RTR-05 MET: npm test exits 0, golden corpus 76/76 at 100% close accuracy, test files exactly 90, zero dangling runtime refs, ledger invariant count==1

### Permanent Invariants (do not relax)

| Invariant | Enforcement |
|-----------|-------------|
| No auto-merge of `src/` fix PRs | Vitest static-grep (GATE-04) + branch-protection ruleset 17086676 |
| `assertTripleGate` body byte-stable | Vitest sha256 pin tests in `tests/unit/` |
| `wrangler kv` always uses `--remote` | Grep assertion in triage layer Vitest tests |
| `safeAppendLedger` covers all LLM writes | `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` count = 1 |
| User-controlled fields in `<report_data>` envelope (user turn only, never system prompt) | Vitest static-grep on bridge module (FIX-03) |
| `FORBIDDEN_DELIMITERS` escape on `note`, `selectionText`, `errorLog` before LLM prompt | Vitest static-grep on bridge module |

### Pending Todos

- v4.3 carry-over items (SWEEP-03/04/06 + Phase 68 destructive UAT + final spend tally) — retired with v4.3 machinery; not carried forward to v6.1. Artifacts at `.planning/milestones/v4.3-phases-paused/`.

### Blockers/Concerns

- None. Phase 10 is unblocked — pure archival and deletion work with no external dependencies.

## Session Continuity

Last session: 2026-06-17T17:38:07.945Z
Stopped at: Phase 10 context gathered
Resume file: None

## Operator Next Steps

- Run `/gsd:plan-phase 10` to begin Phase 10 planning (Retirement + Scaffolding)
- Phase 12 will require a research-phase during planning — do not skip it

## Deferred Items

Items acknowledged at v6.0 milestone close (2026-06-17) — carried into v6.1 deferred ledger:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 1-fix-off-by-2-error-in-patent-column-line | stale (pre-v6.0) |
| quick_task | 2-fix-ci-commit-package-lock-json | stale (pre-v6.0) |
| quick_task | 260412-fde-fix-spurious-results-reporting | stale (pre-v6.0) |
| verification_gap | 08-webapp-core-build (human_needed) | resolved by Phase 9 live UAT |

Non-blocking tech debt (v6.0 audit): pre-existing `weekly-digest-auto-fix` STATE.md `## Bypass Conventions` test; 4 deferred code-review info items (WR-02, IN-02/03/04).

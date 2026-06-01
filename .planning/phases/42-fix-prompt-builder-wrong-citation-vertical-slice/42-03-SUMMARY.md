---
phase: 42-fix-prompt-builder-wrong-citation-vertical-slice
plan: 03
subsystem: auto-fix-vertical-slice
tags: [manual-demo, end-to-end, human-uat, wrong-citation, issue-3, real-sdk-call, verifier-gate-advisory, docs-only]
requires:
  - 42-01-SUMMARY.md (prompt builder + envelope + countFixAttempts)
  - 42-02-SUMMARY.md (auto-fix.mjs dispatcher + systemBlocks cache_control)
  - 41-03-SUMMARY.md (v40-verifier-gate.yml workflow)
  - 41-04-SUMMARY.md (structural template: docs/v40-verifier-gate-manual-test.md)
provides:
  - docs/v40-auto-fix-manual-demo.md (the procedure document — Plan 42-03 Task 1)
  - Phase 47 CLEANUP-03 HUMAN-UAT (a) re-use artifact
affects:
  - Phase 43 (workflow lift) — depends on a green demo outcome for empirical-confidence go-ahead
  - Phase 47 (milestone close) — re-runs this procedure as one of five live HUMAN-UAT confirmations
tech-stack:
  added: []
  patterns:
    - structural-mirror of docs/v40-verifier-gate-manual-test.md (H2 section pinning convention)
    - 10-section runbook layout (Purpose → Prereqs → Target → Dry-Run → Real → Inspect → Push+PR → Gate → Cleanup → Caveats)
key-files:
  created:
    - docs/v40-auto-fix-manual-demo.md
  modified: []
decisions:
  - Task 1 (procedure doc authoring) executed inside the parallel-executor worktree; Task 2 (the live billable demo) is BLOCKING-HUMAN and is being handled by the orchestrator AFTER this worktree merges
metrics:
  duration: ~5 minutes (doc authoring only; live demo time excluded)
  completed: 2026-05-31
  tasks_executed: 1 of 2
  tasks_deferred: 1 (Task 2 — handled by orchestrator)
  files_created: 1
  files_modified: 0
  loc_added: 159
---

# Phase 42 Plan 03: v4.0 Auto-Fix Manual Demo Procedure Summary

Author the maintainer-facing runbook (`docs/v40-auto-fix-manual-demo.md`) that documents the exact step-by-step procedure for executing the Phase 42 vertical slice end-to-end against GitHub issue #3, so the live demo (Task 2) can be performed by the maintainer (via the orchestrator) with a complete, mirror-of-Phase-41-04 reference in hand.

## What Was Built

### Task 1 — `docs/v40-auto-fix-manual-demo.md` (159 LOC, commit `affc309`)

A 10-section procedure document covering the full Phase 42 demo path:

1. **Purpose & When To Use** — frames the doc as the v4.0 milestone "does it actually work?" gate, runnable once at Phase 42 close (maintainer) and once at Phase 47 CLEANUP-03 HUMAN-UAT (a).
2. **Prereqs Checklist** — `gh auth status`, `ANTHROPIC_API_KEY` proof-of-presence via `head -c 7`, clean-tree-on-main assertion, Phase 39 cap-headroom check via `combinedMonthlyTotal`, npm install fallback, and an idempotency note about the `git ls-remote` AUTOFIX-04 short-circuit.
3. **Target Selection** — confirm issue #3 state/labels/title; confirm `<!-- fp: 139f821b3bb1 -->` body line; documented fallback path (`gh issue list --label WRONG_CITATION --state open --json number,title,body --jq 'sort_by(.number)[0]'`).
4. **Dry-Run Validation** — `node scripts/auto-fix.mjs --issue 3 --dry-run` expected-output enumeration: SYSTEM prompt with 6 FORBIDDEN paths + size caps; USER prompt envelope (`<issue_body_untrusted>...</issue_body_untrusted>`); no ledger write proof via `git diff --stat`.
5. **Real Invocation** — the single billable step: `node scripts/auto-fix.mjs --issue 3 --force-api --no-push 2>&1 | tee /tmp/auto-fix-demo-$(date +%s).log`; expected exit 0; ledger entry shape (`phase:'42-auto-fix'`, `transport:'sdk'`, `fingerprint:'139f821b3bb1'`, `issueId:'issue-3'`, `cost_usd > 0`, `model:'claude-sonnet-4-6'`).
6. **Branch Inspection** — `git log --oneline -1`, `git diff main..auto-fix/3-139f821b`, `git diff --stat main..auto-fix/3-139f821b` with abort-and-iterate guidance for pathological diffs.
7. **Push + PR Creation** — `git push -u origin auto-fix/3-139f821b` then a HEREDOC-bodied `gh pr create --draft` invocation containing the `<!-- affected_cases: US11427642-spec-short-1 -->` parser hook.
8. **Verifier-Gate Observation** — `gh pr view <pr-num> --json statusCheckRollup,isDraft,labels` and `gh run watch <run-id>`; PASS (`isDraft=false` + `auto-fix:verified` label) and FAIL (stays draft + rejection comment) both enumerated as valid Phase 42 outcomes.
9. **Cleanup** — `gh pr close --delete-branch` + `git branch -D auto-fix/3-139f821b`; rationale that the demo PR is a throwaway and the real fix flow ships via Phase 43.
10. **Caveats** — Pitfall 4 (exit 0 ≠ gate pass), CONTEXT Q3 / RESEARCH Open Q3 (single-terminal-only acceptance), and the $0.05-$0.15 per-invocation cost envelope with the Phase 39 monthly/daily/per-issue/per-PR cap citations.

### Verification (`<verify>` block from Plan 42-03 Task 1)

| Check | Required | Actual | Pass |
| --- | --- | --- | --- |
| `test -f docs/v40-auto-fix-manual-demo.md` | exists | exists | ✅ |
| `wc -l docs/v40-auto-fix-manual-demo.md` | ≥60 | 159 | ✅ |
| `grep -cE "auto-fix/3-139f821b\|node scripts/auto-fix.mjs\|gh pr create\|--dry-run\|--force-api\|--no-push\|ANTHROPIC_API_KEY\|verifier-gate"` | ≥8 | 24 | ✅ |
| `grep -c "auto-fix/3-139f821b"` | ≥2 | 9 | ✅ |
| `grep -c "ANTHROPIC_API_KEY\|sk-ant-"` | ≥1 | 3 | ✅ |
| `grep -c "Pitfall 4\|exit 0 does NOT mean"` | ≥1 | 1 | ✅ |

## Task 2 Status

**Deferred to Phase 47 CLEANUP-03 HUMAN-UAT (a) — maintainer decision 2026-05-31.**

The Phase 42 vertical-slice code is empirically validated via 122 unit tests across `tests/unit/fix-prompt-builder.test.js`, `tests/unit/auto-fix.test.js`, `tests/unit/issue-payload-builder.test.js`, `tests/unit/eslint-fix-prompt-builder-guard.test.js`, `tests/unit/llm-driver-sdk-cache-control.test.js`, and `tests/unit/llm-ledger.test.js`. Task 2 (the live billable end-to-end demo against GitHub issue #3) was DEFERRED to Phase 47 CLEANUP-03 HUMAN-UAT (a) for the following reasons:

**Bootstrap dependency:** The verifier-gate workflow (`v40-verifier-gate.yml` shipped in Phase 41) must exist on the GitHub Actions side for the demo to trigger it. As of Phase 42 close, all ~50 v4.0 commits (including the workflow file) are local-only on `main`. With the v4.0-main-protection ruleset now ACTIVE (`Do not allow bypassing: ON`, `pull_request` rule requiring 1 approval + Code Owner review on CODEOWNED paths per Phase 39 LEDGER-04 + CLEANUP-04), direct pushes to `main` are blocked. Pushing requires a feature-branch PR through the ruleset — itself a multi-step operational process the maintainer wants to plan separately.

**Cost discipline:** Running the demo today would burn $0.05-$0.15 of SDK budget on a call whose verifier-gate cannot actually run (workflow doesn't exist on GitHub yet), making the result an incomplete signal.

**Phase 47 redundancy:** CLEANUP-03 already requires a live HUMAN-UAT for "(a) end-to-end auto-fix flow against a real triage-labeled fork issue" — exactly this demo. Folding 42-03 Task 2 into 47-CLEANUP-03 (a) eliminates duplicate effort.

**Phase 42 close criteria are satisfied without Task 2:**
- All 8 phase requirement IDs (PROMPT-01..04, AUTOFIX-01/03/04/05) implemented and unit-tested
- All 6 ROADMAP success criteria deliverable from the shipped code; #6 ("local end-to-end demo") deferred to Phase 47's HUMAN-UAT (a)
- `docs/v40-auto-fix-manual-demo.md` is in place for Phase 47's executor to follow

**Phase 47 will:**
1. Push the v4.0 commits to GitHub via whatever PR strategy the maintainer adopts (likely a single `v4.0-integration` feature branch + PR + self-merge with bypass-list workaround OR a temporary ruleset relaxation).
2. Run the procedure in `docs/v40-auto-fix-manual-demo.md` end-to-end on the live (now-existing) verifier-gate workflow.
3. Capture all 5 evidence blocks (prereqs, target, dry-run, real invocation, branch+PR+gate) into the Phase 47 HUMAN-UAT report.

If the Phase 47 demo PASSES: v4.0 ships. If it FAILS: the failure is the iteration signal — Phase 47 surfaces a follow-up plan to address whatever primitive broke (dispatcher, prompt template, gate, etc.). Both outcomes are Phase 47 work, not Phase 42 work.

## Deviations from Plan

None for Task 1. The doc was authored verbatim against the Plan 42-03 Task 1 action block — 10 sections, ≥60 LOC, ≥8 key references, Pitfall 4 caveat, structural mirror of `docs/v40-verifier-gate-manual-test.md`.

Task 2 was intentionally NOT executed by this worktree executor per the orchestrator's instruction. This is not a Rule 1-4 deviation; it is a scoping decision made by the orchestrator that owns the checkpoint dispatch.

## Authentication Gates

None encountered during Task 1 (doc authoring only — no `gh`, no SDK, no git push). Task 2 WILL encounter both `gh` and `ANTHROPIC_API_KEY` gates when the maintainer runs it; the procedure doc's Prereqs Checklist enumerates the auth-confirmation commands.

## Known Stubs

None. The procedure doc is fully populated — no placeholder commands, no `TODO` markers, no unresolved fingerprints. The only deferred fill-in is the `<paste-iso-from-real-invocation-step>` token in the example `gh pr create --body` HEREDOC, which is the maintainer's runtime substitution during Task 2, not a stub in the doc itself.

## Threat Flags

None. The procedure doc:
- Does not introduce a new network endpoint, auth path, file-access pattern, or schema change
- Reuses existing primitives (`gh`, `git`, `node scripts/auto-fix.mjs`, `tests/e2e/.llm-spend-ledger.json`)
- Explicitly addresses T-42-11 (ANTHROPIC_API_KEY hygiene via `head -c 7`), T-42-13 (Pitfall 4 caveat), and T-42-14 (HEREDOC-bodied `gh pr create` with explicit fields) from the Plan 42-03 threat register

## Files Created

| Path | Lines | Purpose |
| --- | --- | --- |
| `docs/v40-auto-fix-manual-demo.md` | 159 | The Phase 42 manual-demo procedure document (Plan 42-03 Task 1) |

## Files Modified

None.

## Commits

| Hash | Message |
| --- | --- |
| `affc309` | `docs(42-03): manual demo procedure for v4.0 auto-fix vertical slice` |

## Self-Check: PASSED

- `docs/v40-auto-fix-manual-demo.md` — FOUND (159 LOC, all 10 H2 sections present, all 6 verify-block checks pass)
- Commit `affc309` — FOUND on branch `worktree-agent-a27bcfe535810bc6a`
- Task 2 status documented as deferred to orchestrator (per executor's objective constraint)
- STATE.md NOT updated (per executor's objective constraint)
- ROADMAP.md NOT updated (per executor's objective constraint)

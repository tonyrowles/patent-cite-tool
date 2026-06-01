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

**pending: handled by orchestrator after this run.**

Task 2 (`checkpoint:human-verify gate="blocking-human"` — the maintainer executes the demo procedure end-to-end and pastes the 5 evidence captures) is OUT OF SCOPE for the parallel worktree executor that authored this summary. The orchestrator (which has access to the maintainer's live shell, `ANTHROPIC_API_KEY`, and the public repo) will:

1. Merge the `worktree-agent-a27bcfe535810bc6a` branch carrying this commit (`affc309 — docs(42-03): manual demo procedure...`) and this SUMMARY into `main`.
2. Dispatch the Task 2 checkpoint to the maintainer with the resume-signal contract from `42-03-PLAN.md`.
3. After the maintainer types `approved` + pastes the 5 evidence captures, commit those captures into this SUMMARY under the placeholder section below.

### Placeholder for Task 2 Evidence (orchestrator to fill after maintainer resume-signal)

> The orchestrator will append the 5 capture blocks the plan's `<how-to-verify>` enumerates here:
> 1. Prereq check captures (gh auth status, ANTHROPIC_API_KEY presence proof, clean-tree confirmation)
> 2. Target confirmation (issue #3 state/labels/title/fingerprint OR fallback target identifier)
> 3. Dry-run evidence (last 20 lines of `--dry-run` output)
> 4. Real-invocation evidence (last 10 lines, exit code, appended ledger entry JSON)
> 5. Branch URL, PR URL, verifier-gate workflow-run URL, final PR state with isDraft + labels + check conclusions
>
> Plus the load-bearing post-demo synthesis:
> - SDK cost figure (`cost_usd` from the ledger entry)
> - Pitfall 4 caveat block: "dispatcher exit 0 ≠ gate pass; the gate's verdict is the load-bearing signal; this demo's gate verdict was <PASS|FAIL>"
> - Concurrent-invocation acceptance note (single-terminal-only for Phase 42)
> - Phase 43 readiness statement: green or red, with the next-steps recommendation

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

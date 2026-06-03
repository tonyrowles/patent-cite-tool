# Phase 51 — Evidence File Index

**Plan:** 51-01
**Created:** 2026-06-03
**Convention:** Mirrors Phase 50's `evidence/INDEX.md` 2-column role-map format.

Per-evidence-file role map. Files marked `(future)` are written by Tasks 2-3 during their live UAT runs; files marked `(present)` exist at INDEX.md write time.

| File | Role |
|---|---|
| `INDEX.md` | This role map (Task 1 — present). |
| `uat-47-e-pr-checks.json` | `gh pr checks $PR --json name,state,conclusion,startedAt,completedAt` for the UAT-47-e crafted-bypass PR — proves `diff-guard` job's conclusion=FAILURE (Task 2 — future). |
| `uat-47-e-pr-labels.json` | `gh pr view $PR --json labels,number,state,isDraft,headRefName` for UAT-47-e — proves `human-review-required` label applied by verifier-gate (Task 2 — future). |
| `uat-47-e-pr-comments.json` | `gh pr view $PR --json comments` for UAT-47-e — proves last comment names violated LOCKED path `tests/golden/baseline.json` (Task 2 — future). |
| `uat-47-a-pre-run-ledger.json` | Snapshot of `tests/e2e/.llm-spend-ledger.json` captured BEFORE the UAT-47-a label-cycle trigger — baseline for D-03 $5 budget cap (Task 3 — future). |
| `uat-47-a-post-run-ledger.json` | Snapshot of `tests/e2e/.llm-spend-ledger.json` captured AFTER v40-auto-fix.yml finishes — used to compute spend delta vs $5 cap (Task 3 — future). |
| `uat-47-a-pr-state.json` | `gh pr list --head auto-fix/3-139f821b --json number,state,isDraft,title,headRefName,url` — proves the draft PR opened with `{state:"OPEN", isDraft:true}` per D-07 (Task 3 — future). |
| `uat-47-a-pr-body.md` | PR body text for the auto-fix PR — proves `affected_cases:` marker present per diff-guard parser contract (Task 3 — future). |
| `uat-47-a-verifier-gate-run.json` | `gh run list --branch auto-fix/3-139f821b --workflow=v40-verifier-gate.yml` — proves the 3×/76-case/diff-guard chain ran end-to-end (Task 3 — future). |
| `uat-47-a-ledger-commit-attempt.txt` | Stdout/stderr from the v40-auto-fix workflow's ledger-commit-to-main step — expected to FAIL per UAT-47-d's structural Phase 50 ruleset block (Task 3 — future). |
| `uat-47-a-run.log` | `gh run view $RUN_ID --log` for the v40-auto-fix run (if < 1MB) or metadata fallback (Task 3 — future). |

---

*Index written by Task 1; entries marked `(future)` populated by Tasks 2-3.*

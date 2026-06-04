# Phase 52: v3.1 Bookkeeping Cleanup - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Mode:** Mechanical text edits — no infra, no LLM cost, fully autonomous

<domain>
## Phase Boundary

Two mechanical text edits to close the bookkeeping debt deferred from v3.1 and carried through v4.0:

1. **BOOKS-01:** Update frontmatter on 5 carry-over UAT files to `status: passed`:
   - `.planning/milestones/v3.1-phases/32-human-uat-verification/32-UAT-EVIDENCE.md` (currently `status: passed` — already correct, verify only)
   - `.planning/milestones/v3.1-phases/35-rich-issue-filer-+-quarantine-corpus/35-HUMAN-UAT.md` (currently `status: testing` → `passed`)
   - `.planning/milestones/v3.1-phases/36-quarantine-ci-integration-+-pipeline-orchestrator/36-HUMAN-UAT.md` (currently `status: partial` → `passed`)
   - `.planning/milestones/v3.1-phases/37-weekly-analytics-digest/37-HUMAN-UAT.md` (currently `status: partial` → `passed`)
   - `.planning/milestones/v3.1-phases/38-v3-1-cleanup-integration-warnings-nyquist-human-uat/38-UAT-EVIDENCE.md` (currently NO frontmatter → add frontmatter with `status: passed`)

2. **BOOKS-02:** Remove the consolidated orphan-slug-references row from `.planning/STATE.md` Deferred Items table (line 92): `| quick_task | 3 orphan quick-task slug references | missing | Addressed in Phase 52 |`. The 3 referenced slugs (`1-fix-off-by-2-error-in-patent-column-line`, `2-fix-ci-commit-package-lock-json-currentl`, `260412-fde-fix-spurious-results-reporting-impossibl`) were already substantively closed; the row was tracking the bookkeeping debt that this phase resolves.

**Out of scope:**
- Touching the actual quick-task directories (`.planning/quick/1-fix-off-by-2/`, etc.) — they remain as historical records.
- Updating the 5 frontmatter-tracking rows (lines 87-91) in STATE.md — those are tracking history and can stay as-is to document the bookkeeping journey. Phase 52 closure narrative will simply note all 5 are now `status: passed`.
- Editing any historical commits (`git commit --amend` is FORBIDDEN by BOOKS-01 per REQUIREMENTS.md; all changes land as NEW forward commits).
- Any source code changes — purely planning-file text.

</domain>

<decisions>
## Implementation Decisions

- **D-01:** **Single plan `52-01-PLAN.md` with 3 sequential tasks:**
  1. BOOKS-01: Update 5 frontmatter files (single atomic commit covering all 5)
  2. BOOKS-02: Remove orphan-slug row from STATE.md (atomic commit)
  3. Closure: 52-01-SUMMARY.md + STATE.md progress update + ROADMAP closure
- **D-02:** **No `git commit --amend`** — all changes land as NEW forward commits per BOOKS-01 verbatim mandate.
- **D-03:** Commit-message pattern: `chore(52): <one-line>` matching Phase 48/49/50/51/51.1 convention.
- **D-04:** For `38-UAT-EVIDENCE.md` which has no frontmatter, ADD a new frontmatter block at top with: `phase: 38-v3-1-cleanup-integration-warnings-nyquist-human-uat`, `status: passed`, `plan: 38-03`, `created_iso: 2026-05-29T23:10:00Z` (from existing line 4), `last_updated_iso: 2026-06-03T<now>Z`. Format mirrors the other 4 UAT files' frontmatter shape (specifically 32-UAT-EVIDENCE.md's shape since both are EVIDENCE files).
- **D-05:** STATE.md row removal is via Edit tool with the exact line text as `old_string` — surgical, no other rows affected.
- **D-06:** Phase 52 does NOT update the 5 tracking rows (lines 87-91) in STATE.md Deferred Items — those rows document the bookkeeping journey and are retained as historical record. Phase 52 closure SUMMARY notes their resolution.
- **D-07:** No `type: checkpoint:human-verify` tasks — Phase 52 is fully `autonomous: true`. No live infra, no LLM cost, no PR creation. Pure text edits.
- **D-08:** No evidence/ subdirectory required — the diffs themselves are the evidence (visible via `git diff HEAD~2 HEAD`).

### Claude's Discretion

- Exact format of the new 38-UAT-EVIDENCE.md frontmatter (which fields to include beyond the minimum `phase` + `status` + `plan` + dates).
- Whether to use a single commit for BOOKS-01 (5-file batch) or split into per-file commits. RECOMMEND single (matches the SC wording "All 5 carry-over files... have `status: passed`").
- Whether to verify each file's `status: passed` survives via a follow-up grep before commit. RECOMMEND yes (50 ms cost; catches typos).

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` §"v3.1 Bookkeeping" — BOOKS-01, BOOKS-02 verbatim.
- `.planning/ROADMAP.md` §"Phase 52" — 2 SCs.
- `.planning/research/ARCHITECTURE.md` lines 246-248 — confirms the 3 orphans are already substantively closed.

### Source files to modify
- `.planning/milestones/v3.1-phases/35-rich-issue-filer-+-quarantine-corpus/35-HUMAN-UAT.md` (line 2: `status: testing` → `status: passed`)
- `.planning/milestones/v3.1-phases/36-quarantine-ci-integration-+-pipeline-orchestrator/36-HUMAN-UAT.md` (line 2: `status: partial` → `status: passed`)
- `.planning/milestones/v3.1-phases/37-weekly-analytics-digest/37-HUMAN-UAT.md` (line 2: `status: partial` → `status: passed`)
- `.planning/milestones/v3.1-phases/38-v3-1-cleanup-integration-warnings-nyquist-human-uat/38-UAT-EVIDENCE.md` (add frontmatter block at line 1)
- `.planning/STATE.md` (remove line 92)
- `.planning/STATE.md` (progress + Current Position updates, Task 3)
- `.planning/ROADMAP.md` (mark Phase 52 complete, Task 3)
- **Verify only (already `status: passed`):** `.planning/milestones/v3.1-phases/32-human-uat-verification/32-UAT-EVIDENCE.md` line 3

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Patterns
- Frontmatter shape from `32-UAT-EVIDENCE.md`: `---\nphase: <slug>\nstatus: <value>\nattempts: <N>\nlast_attempt_iso: <ISO>\npass_bar_iterations: <N>\n---` (Phase 52 mirrors for 38-UAT-EVIDENCE.md as needed).
- Phase 48/49/50/51/51.1 commit-message pattern `chore(<phase>): <one-line>` is the canonical project convention.
- Phase 51.1 ROADMAP/STATE update pattern (checkbox flip, progress bump, completion date) applies here.

### Integration Points
- No code interactions. No CI implications. No ruleset implications.
- This phase has NO dependency on Phase 51.1 (or any prior v4.1 phase) — purely planning-file edits. Could have run in parallel with anything.

</code_context>

<specifics>
## Specific Ideas

- **38-UAT-EVIDENCE.md frontmatter** uses ADD-at-top via Edit with `old_string` = first line `# Phase 38 — Human-UAT Live Confirmations Evidence` and `new_string` prepending the frontmatter block.
- The STATE.md row to delete is the EXACT text: `| quick_task | 3 orphan quick-task slug references | missing | Addressed in Phase 52 |`.

</specifics>

<deferred>
## Deferred Ideas

- **Cleaning up `.planning/quick/` directories** — Those are historical records; not in scope. Phase 56+ candidate if directory pruning is wanted.
- **Updating the 5 frontmatter-tracking rows in STATE.md** to mark all `passed` — Considered; declined per D-06 (retain as historical journey record).
- **Auditing other phases' UAT frontmatter for similar drift** — Considered; declined for scope tightness. Only the 5 SC-named files are in scope.

</deferred>

---

*Phase: 52-v3-1-bookkeeping-cleanup*
*Context gathered: 2026-06-03*

---
slug: harness-worktree-merge-drop
status: resolved
trigger: |
  Phase 32 Wave 1's Plan 32-04 worktree-isolated executor agent appeared to complete and auto-merge,
  but the merge was silently dropped. Surfaced ~3 hours later via `npm error Missing script: "e2e:upload-llm-report"`.
  Recovery required a manual `git merge 17a1d0b --no-ff` (commit `a3da175`). Risk of recurrence in any
  future phase using parallel worktree-isolated agents.
created: 2026-05-25T20:30:00Z
updated: 2026-05-25T22:15:00Z
tdd_mode: false
goal: find_and_fix
specialist_dispatch_enabled: true
---

# Debug Session: harness-worktree-merge-drop

## Symptoms

### Expected behavior
Claude Code's `Agent(isolation="worktree")` should reliably merge the worktree's commits into the parent branch when the agent completes successfully. The orchestrator's view of `git rev-parse HEAD` should match the actual branch state at all times.

### Actual behavior
During Phase 32 Wave 1, two parallel worktree-isolated executor agents (Plans 32-02 + 32-04) completed successfully. After both returned:

- `git rev-parse HEAD` (run from the main repo CWD) returned `17a1d0b` — the tip of Plan 32-04's worktree branch.
- Subsequent log inspection showed `17a1d0b → d106e46 → 5b032d2 → 0b3242f → 4ab966d → ...` as a linear chain on main.
- I then manually merged 32-02's worktree with `git merge worktree-agent-a27b18a1feaa3af52 --no-ff` (creating merge commit `7d05733`).
- Wave 2 proceeded normally; Plan 32-05 (live UAT) progressed through Tasks 1-2 without issue.

Then during Plan 32-05 Task 3 (~3 hours later), `npm run e2e:upload-llm-report` failed with:
```
npm error Missing script: "e2e:upload-llm-report"
```

Investigation:
- `git log --oneline -1 17a1d0b` → commit object exists (and similarly for 0b3242f, 5b032d2, d106e46).
- `git branch -a --contains 17a1d0b` → **empty** (no branch references the 32-04 chain).
- `git log --pretty=format:"%H %P %s" -1 7d05733` → parents are `[4ab966d, 06cff00]` — NOT `[17a1d0b, 06cff00]`.
- `git reflog main` → `main@{5}: 7d05733 merge worktree-agent-a27b18a1feaa3af52` directly follows `main@{6}: 4ab966d` — main is never recorded as having been at `17a1d0b`.
- `git diff --stat 174d35c..HEAD` (the phase fork point to main) was missing: `scripts/e2e-upload-llm-report.mjs` (new file), `.github/workflows/e2e-ingest-llm-report.yml` (new file), modifications to `.github/workflows/e2e-nightly.yml` and `package.json`.
- However `tests/e2e/scripts/e2e-upload-llm-report.test.js` (the 222-line file) WAS on main — but inspection of the file revealed it's Plan 32-01's stub (`Phase 32 Plan 32-01 (Wave 0 scaffolding, UAT-02)`), NOT Plan 32-04's rewrite.

Recovery: `git merge 17a1d0b --no-ff -m "chore: recover dangling Plan 32-04 commits into main"` succeeded as a clean merge (no file overlap with subsequent work). Commit `a3da175`.

### Error messages
None at the time. Failure was silent. First surface was `npm error Missing script: "e2e:upload-llm-report"` ~3 hours after the apparent auto-merge.

### Timeline
- 2026-05-25, during Phase 32 Wave 1.
- Both 32-02 and 32-04 spawned via `Agent(subagent_type="gsd-executor", isolation="worktree", run_in_background=true)`.
- Per execute-phase workflow rule ("Sequential dispatch for parallel execution"), they were dispatched in **separate orchestrator messages** to avoid `.git/config.lock` race.
- Both returned with "Async agent launched successfully" then later "completed" notifications.
- 32-02 returned first (~10 min), then 32-04 (~15 min later).
- Orchestrator's first spot-check after both returned: `git rev-parse HEAD` returned `17a1d0b`. Log showed 32-04's full chain on main.
- ~3 hours later: Plan 32-05 Task 3 surface the missing script.

### Reproduction
**Hard to reproduce in isolation.** Single-worktree-agent waves (32-01, 32-03, 32-05) all worked fine in this phase. Only the two-parallel-agent Wave 1 triggered it.

Initial hypothesis: race condition in the Claude Code harness's post-agent-completion cleanup logic. The harness appears to attempt an auto-merge for each completed worktree agent, but when two agents complete close together and BOTH try to merge their worktree branches into main, one "wins" the merge while the other is silently discarded. The orchestrator's later manual merge of 32-02 was based on `git rev-parse HEAD` showing `17a1d0b`, but by the time the merge actually ran, main had been reset to `4ab966d` (the state before either auto-merge), so the manual merge took `[4ab966d, 06cff00]` as parents — completely missing 32-04.

Alternative hypothesis: the harness's "auto-merge" is purely a display/spot-check artifact — it never actually mutates main, but it does temporarily show the worktree's HEAD in `git rev-parse` calls (perhaps via a stale `.git/HEAD` cache or a hooked-in shim). The orchestrator then assumed main was updated and proceeded.

## Current Focus

hypothesis: |
  CONFIRMED ROOT CAUSE (revised — not a harness bug at all):
  This is a GSD execute-phase workflow bug, NOT a Claude Code harness bug. The harness
  never auto-merges worktrees — merging is performed by the orchestrator (Claude) in
  execute-phase.md step 5.5 ("Worktree cleanup"), which iterates over a
  `WAVE_WORKTREE_MANIFEST` JSON file populated by the orchestrator at agent-dispatch time.

  For Plan 32-04 specifically, the orchestrator failed to append the 32-04 worktree
  entry to `WAVE_WORKTREE_MANIFEST` after the (sequentially dispatched) Agent() spawn
  returned its metadata. The cleanup loop then iterated over only the 32-02 entry,
  merged that, and exited — leaving 32-04's worktree branch unmerged and (since
  `git worktree remove` was not called for it) leaving an orphan branch that was later
  garbage-collected leaving only dangling commits.

  The orchestrator's transient observation of `git rev-parse HEAD = 17a1d0b` is
  explained by **CWD drift**: the spot-check `git rev-parse HEAD` was run without
  `-C /home/fatduck/patent-cite-tool`, while shell CWD had drifted into 32-04's
  worktree directory from an earlier bash call. `git rev-parse HEAD` therefore
  returned the worktree branch's tip (17a1d0b), not main's tip — which the
  orchestrator misread as evidence of a successful auto-merge.

next_action: |
  RESOLVED. See Resolution section.

## Evidence

- timestamp: 2026-05-25T20:30:00Z
  observation: |
    From the actual session transcript: after both Wave 1 agents returned, I ran:
    ```bash
    git -C /home/fatduck/patent-cite-tool status --porcelain
    git rev-parse HEAD  # ← from main repo CWD, no -C flag
    ```
    The rev-parse returned `17a1d0bf1d46712bc87c6b2d07ce0e74a92e00a5` (32-04's tip).
    Then `git log --oneline -20` from the same CWD showed 17a1d0b → d106e46 → 5b032d2 → 0b3242f → 4ab966d
    as the top 4 commits with 4ab966d as the next ancestor. Linear chain, no merge commit.

- timestamp: 2026-05-25T20:30:00Z
  observation: |
    Reflog evidence (run during Plan 32-05 Task 3 investigation):
    ```
    main@{0}: 4b3ac61 commit: docs(32): UAT evidence ...
    main@{5}: 7d05733 merge worktree-agent-a27b18a1feaa3af52
    main@{6}: 4ab966d commit: docs(phase-32): update tracking after wave 0
    main@{7}: 8c7ea8a merge worktree-agent-a2d45ab069073714f
    main@{8}: 174d35c ... (pre-Phase-32 state)
    ```
    No reflog entry for main ever being at 17a1d0b. Reflog goes 4ab966d → 7d05733 directly.
    `git log --pretty="%P" -1 7d05733` → `4ab966d066a175f441331dc8c855102d7c82dd77 06cff007b64503ba818778f1e62d84b0e8ce43c0`
    (parents are 4ab966d + 06cff00, NOT 17a1d0b + 06cff00).

- timestamp: 2026-05-25T20:30:00Z
  observation: |
    `git branch -a --contains 17a1d0b` returned empty before my recovery merge.
    The 32-04 commit chain existed as dangling objects in the repo (`git log -1 17a1d0b` succeeded)
    but was unreachable from any branch.

- timestamp: 2026-05-25T20:30:00Z
  observation: |
    The other 3 worktree-agent operations in this phase (32-01 Wave 0, 32-03 Wave 2, 32-05 Wave 3)
    were all SINGLE-agent waves and all merged correctly into main per the reflog
    (main@{7} 8c7ea8a, main@{3} 93950a9, main@{1} ae93bf8 respectively).

- timestamp: 2026-05-25T22:10:00Z
  observation: |
    Searched `git reflog --all` (current state) for any reference to the 32-04 chain commits:
    `git reflog --all | grep -E "(0b3242f|5b032d2|d106e46|17a1d0b)"` → returns ONLY
    `a3da175 refs/heads/main@{7}: merge 17a1d0b: Merge made by the 'ort' strategy.` and
    its HEAD@{7} twin (the recovery merge). NO `refs/heads/worktree-agent-*@{0}: commit:`
    reflog entry exists for any of these 4 commits.

    Per `~/.claude/get-shit-done/workflows/execute-phase.md` line 851
    (`git branch -D "$WT_BRANCH"`), the orchestrator deletes the worktree branch
    after successful merge — which also drops its reflog. So the missing branch
    reflog is consistent with "32-04's worktree branch never appeared in cleanup
    (because no manifest entry)" rather than "branch existed and was cleanly merged."

    Also confirmed: no `/tmp/gsd-worktree-wave-*.json` manifest survives from that session.

- timestamp: 2026-05-25T22:10:00Z
  observation: |
    Read `~/.claude/get-shit-done/workflows/execute-phase.md`. The auto-merge behavior is
    EXPLICITLY orchestrator-driven, not harness-driven. Step 5.5 ("Worktree cleanup",
    lines 729-858) is the only place worktree branches are merged to main:

    ```bash
    # Line 761:
    gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST" || exit 1
    # Or shell fallback (line 765):
    node -e '...for(const w of j.worktrees||[]) if(w.worktree_path) console.log(w.worktree_path)'
    # Loops over manifest entries and runs `git merge "$WT_BRANCH" --no-ff` for each.
    ```

    The contract at line 644 says:
    > "Immediately after each worktree `Agent()` spawn returns metadata, atomically
    > append `{agent_id, worktree_path, branch, expected_base}` to
    > `WAVE_WORKTREE_MANIFEST`. If any field is missing, stop and ask for recovery
    > instead of scanning all agent worktrees."

    There is NO post-dispatch reconciliation gate that compares dispatched-agent
    count vs manifest entry count before cleanup runs. The "If any field is missing"
    guard only fires per-entry — it does not detect entirely-missing entries.

    Pattern is exactly the `#3384` class of bug the existing manifest hardening
    was designed to prevent — but the hardening only added refusal-of-broad-discovery
    on the cleanup side, not append-completeness verification on the dispatch side.

- timestamp: 2026-05-25T22:10:00Z
  observation: |
    Inspected the current 15 locked orphan worktrees under `.claude/worktrees/agent-*`
    (from earlier sessions, visible via `git worktree list | grep locked`). These
    almost certainly are residue of the same bug class — past instances where the
    orchestrator dispatched a worktree agent but failed to thread it through the
    manifest-driven cleanup path. Specific orphans (with branch names ending in
    short hex) include: `a46bd293e4a2348b1`, `a5e8a513d0650e7cf`, `a604dfa3b5a085ce8`,
    `a8279465bf27ffb47`, `a89b53619da61b0dc`, `a98257e99b999c23a`, `aa55e5781f2eb9288`,
    `acafb2250cb5d5667`, `ad6c593ab6a7f0514`, etc. Each holds (locked) commits never
    merged into main — same failure mode, less catastrophic because those plans
    presumably failed/were cancelled rather than reporting success.

## Eliminated

- **Claude Code harness "silent auto-merge" race condition** — the harness does not perform any auto-merge. All worktree-to-main merges are done by orchestrator-issued `git merge` calls inside execute-phase.md step 5.5. The reflog confirms every successful past wave-1 merge is annotated `merge worktree-agent-XXX: Merge made by the 'ort' strategy.` — these are orchestrator `git merge --no-ff` invocations, not harness operations. No hidden temporary refs, no orphaned merge attempts on `refs/stash` or similar, no harness shim.
- **Stale `.git/HEAD` cache or harness display artifact for the `rev-parse HEAD = 17a1d0b` observation** — much simpler explanation: CWD drift. The orchestrator's spot-check `git rev-parse HEAD` ran with the shell CWD inside 32-04's worktree directory (a prior bash call had `cd`'d there, per the cwd-drift pattern documented at execute-phase.md lines 412-434). `git rev-parse HEAD` from inside the worktree returns the worktree branch's tip, which is exactly `17a1d0b`. This matches the well-known #3097 / #3174 / #3097 cwd-drift bug class that the workflow already has multiple guards against — none of which fire in the "spot-check after worktree completion" path.

## Resolution

### Root cause (one sentence)
The GSD `execute-phase` workflow's worktree-cleanup loop (step 5.5) merges only the entries present in `WAVE_WORKTREE_MANIFEST`, and there is no post-dispatch reconciliation gate that verifies the manifest contains one entry per dispatched worktree agent — so when the orchestrator failed to atomically append 32-04's metadata after its sequential `Agent()` dispatch, the cleanup loop silently iterated over only 32-02's entry and never merged 32-04, while a concurrent CWD-drift bug caused `git rev-parse HEAD` to return the unmerged worktree's tip and convinced the orchestrator everything was fine.

### Fix (applied + recommended)

This bug has **two layers** of fix, and the appropriate fix surface is the user's local GSD
workflow installation (`~/.claude/get-shit-done/`), not the project repo and not the Claude
Code harness.

**Layer 1: immediate workaround for this and future phases (manual)**

Two operational rules the orchestrator (Claude) MUST follow on every parallel-worktree wave
until the workflow is patched:

1. **Always run `git -C <main-repo-abspath> rev-parse HEAD` with explicit `-C`.** Never trust
   bare `git rev-parse HEAD` after a worktree agent spawn or completion — it can return the
   worktree's tip due to CWD drift. (This rule already exists in spirit at execute-phase.md
   lines 412-434 for executor agents, but the orchestrator-side spot-check path on lines
   686-714 does not enforce it.)

2. **After step 5.5 cleanup completes for a parallel wave, run an explicit reconciliation
   check** before declaring the wave done:
   ```bash
   # For each plan in the wave (by plan_id):
   for PLAN_ID in $WAVE_PLAN_IDS; do
     EXPECTED_COMMIT_RE="${PHASE_NUMBER}-${PLAN_PADDED}"
     git log --oneline --grep="$EXPECTED_COMMIT_RE" main --since="$WAVE_START_TS" \
       | head -1 || {
       echo "FATAL: no commits matching $EXPECTED_COMMIT_RE found on main since wave start"
       echo "       likely manifest-append failure for plan $PLAN_ID; investigate before continuing"
       exit 1
     }
   done
   ```
   This catches the "manifest entry never appended" failure mode before downstream waves
   build on the missing work.

**Layer 2: structural fix for `~/.claude/get-shit-done/workflows/execute-phase.md` (RECOMMENDED — to be applied by user out-of-band)**

Add three patches to `~/.claude/get-shit-done/workflows/execute-phase.md`:

A. **Post-dispatch manifest reconciliation gate (new step 4.5, between current step 4 "Wait for all agents in wave to complete" and step 5).** Before any cleanup runs:
   ```bash
   DISPATCHED_COUNT=${#WAVE_WORKTREE_PLANS[@]}  # already tracked per line 500
   MANIFEST_COUNT=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.WAVE_WORKTREE_MANIFEST,"utf8")).worktrees.length)')
   if [ "$DISPATCHED_COUNT" != "$MANIFEST_COUNT" ]; then
     echo "FATAL: dispatched $DISPATCHED_COUNT worktree plan(s) but manifest has $MANIFEST_COUNT entries — refusing cleanup to prevent silent merge drop (#harness-worktree-merge-drop)" >&2
     echo "  Likely cause: missed atomic-append after Agent() spawn (line 644). Manually inspect:"
     echo "    git worktree list --porcelain"
     echo "    cat \"$WAVE_WORKTREE_MANIFEST\""
     exit 1
   fi
   ```

B. **Cross-check against `git worktree list` (defense in depth inside `gsd-sdk worktree.cleanup-wave`).** The helper should additionally enumerate `git worktree list --porcelain`, intersect with manifest entries by branch name, and refuse to proceed if any `worktree-agent-*` worktree exists on disk whose branch is not in the manifest AND whose `HEAD` commit is newer than the wave start timestamp.

C. **Make every orchestrator-side `git rev-parse HEAD` spot-check use explicit `-C $PRIMARY_WT`.** Patch the spot-check templates at lines 686-714 and any other location where the orchestrator inspects HEAD/branch state, using the same `PRIMARY_WT` resolution that step 5.5 already uses at line 751.

**Layer 3: not applicable**
This is NOT a Claude Code harness bug — no external bug report to Anthropic is needed. The harness is not involved in worktree merging.

### Why this is the right fix surface
- The bug is in workflow logic in user-controlled config (`~/.claude/get-shit-done/`), not in code shipped by Anthropic and not in the patent-cite-tool project repo.
- Patching the workflow prevents recurrence across every project that uses GSD, not just this one.
- The patches do not require harness changes; they are pure shell + node added to an existing markdown workflow file.
- Existing `#3384` hardening already established the pattern of refusing broad worktree discovery — these patches extend that pattern to the dispatch side.

### Recovery applied to this repo
Already done in the original session: `git merge 17a1d0b --no-ff -m "chore: recover dangling Plan 32-04 commits into main"` produced merge commit `a3da175` (visible at `main@{7}` in the current reflog). The phase later completed successfully with all 4 Plan 32-04 deliverables on main, verified by `npm run e2e:upload-llm-report` working and the subsequent `fix(32-04): use -F (capital) for stdin payload to gh workflow run` commit at `aaba28c`.

### Action items for the user (out-of-band, not changes to this repo)
1. Apply Layer 2 patches A, B, C to `~/.claude/get-shit-done/workflows/execute-phase.md`. Suggested commit message: `fix(execute-phase): manifest-completeness gate + cwd-drift hardening for parallel worktree waves (#harness-worktree-merge-drop)`.
2. Until those patches are in place, run the Layer 1 reconciliation snippet manually at the end of every parallel-worktree wave.
3. Consider auditing the 15 existing locked orphan worktrees under `.claude/worktrees/agent-*` for any recoverable work; they are likely all from failed/cancelled plans but worth a sanity check before cleanup.

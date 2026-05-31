---
phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0
plan: 04
subsystem: testing
tags: [committed-ledger, ledger-v2, gitignore-flip, bootstrap-entry, branch-protection-pending]

# Dependency graph
requires:
  - phase: 39-01
    provides: appendLedgerEntry transport/phase passthrough + v1-schema guarantee used to seed bootstrap entry
  - phase: 39-03
    provides: SDK driver landed (so the bootstrap entry's transport='sdk' tag is semantically grounded before the file is committed)
provides:
  - "Committed tests/e2e/.llm-spend-ledger.json with exactly one bootstrap iteration (phase='39-bootstrap', transport='sdk', cost_usd=0, source='phase-39-flip', model='claude-sonnet-4-6')"
  - ".gitignore lines 18-19 deleted (28 lines -> 26 lines); all other lines byte-for-byte unchanged"
  - "2 new Vitest cases in tests/unit/llm-ledger.test.js (Test 48: committed-ledger schema; Test 49: .gitignore flip guard)"
affects:
  - Phase 40+ (cost-snapshot + deps-update workflows) — first committed ledger file is the foundation the [skip ci] atomic-commit pattern writes against
  - Phase 47 (CLEANUP-04 audit) — re-verifies the LEDGER-04 commit landed and the GitHub branch-protection settings (Task 3 pending) match the captured baseline

# Tech tracking
tech-stack:
  added: []  # purely additive — no new npm deps; uses appendLedgerEntry from Plan 01
  patterns:
    - "Bootstrap-entry seeding via appendLedgerEntry invocation (NOT hand-written JSON) — per 39-RESEARCH Pitfall 1 (function-guaranteed v1-schema integrity)"
    - "Pre-flight backup OUTSIDE the working tree to /tmp/llm-spend-ledger.json.local-v31-backup.<epoch> — avoids 'git add .' privacy-leak risk that an in-repo backup would create"
    - "Integration-shaped Vitest cases (REAL on-disk artifacts, NOT tmpDir copies) — these are commit-landing guards, not unit logic tests"

key-files:
  created:
    - "tests/e2e/.llm-spend-ledger.json (+18 lines — first committed ledger file with bootstrap sentinel)"
  modified:
    - ".gitignore (-2 lines — Phase 31 ledger-gitignore + comment removed; lines 1-17 and 20-26 unchanged)"
    - "tests/unit/llm-ledger.test.js (+43 lines — 1 new describe block with 2 cases: 48 + 49)"

key-decisions:
  - "Bootstrap entry seeded via appendLedgerEntry invocation, NOT hand-written JSON — Pitfall 1 mitigation per 39-RESEARCH lines 580-586. Verified by Test 48 post-write integrity check (JSON.parse + version:1 + exact field shape)."
  - "Pre-flight backup path is /tmp/llm-spend-ledger.json.local-v31-backup.<epoch> (OUTSIDE the repo tree) — eliminates the 'git add .' privacy-leak risk that an in-repo .local-v31-backup filename would create. In this worktree run no backup was needed (no pre-existing local ledger)."
  - "Fresh-start seed policy per CONTEXT lock — committed file contains ONLY the phase='39-bootstrap' sentinel; local v3.1 spend pattern history NOT migrated to the committed file (stays on dev machine)."
  - "Vitest cases read the REAL on-disk file, NOT a tmpDir copy — these are integration-shaped commit-landing guards that the LEDGER-04 contract matches what's actually on disk."

patterns-established:
  - "First-committed-state seeded via the consuming library's own writer (not by hand) — generalizable to other 'flip from gitignored to committed' migrations in future phases"
  - "Backup to /tmp/ (outside repo tree) when migrating a previously-gitignored file with potential private content — avoids accidental re-commit via 'git add .'"

requirements-completed: [LEDGER-04]  # CLEANUP-04 partial — Task 3 pending

# Metrics
duration: ~4min (Tasks 1+2 only; Task 3 deferred to orchestrator)
completed: 2026-05-31
---

# Phase 39 Plan 04: Committed-Ledger Flip + Branch Protection Wave-0 (Plan 04 — Ledger Flip; Branch Protection Pending)

**Flipped `tests/e2e/.llm-spend-ledger.json` from gitignored to committed-but-versioned with a fresh-start `phase='39-bootstrap'` sentinel entry seeded via `appendLedgerEntry` (Pitfall 1 mitigation); deleted .gitignore lines 18-19 (28 lines -> 26 lines); added 2 new Vitest cases (48 + 49) that integration-check the on-disk artifacts against the LEDGER-04 contract. Task 3 (GitHub repo Settings UI clicks — Allow auto-merge OFF + branch protection ruleset on main) DEFERRED to orchestrator + maintainer.**

## Scope of this executor run

Per spawn-time directive: this executor ran **ONLY Tasks 1 and 2** (the autonomous, in-tree work). Task 3 is a `checkpoint:human-verify` blocking on GitHub UI clicks that ONLY the maintainer (`@tonyrowles`) can perform. The orchestrator handles Task 3 after this executor returns.

## Performance

- **Duration:** ~4 min (2 task TDD cycles)
- **Started:** 2026-05-31T16:01:00Z
- **Completed:** 2026-05-31T16:08:00Z
- **Tasks executed:** 2 / 3 (Task 3 deferred to orchestrator)
- **Files modified:** 2 (.gitignore, tests/unit/llm-ledger.test.js)
- **Files created:** 1 (tests/e2e/.llm-spend-ledger.json)
- **New tests:** 2 (48, 49)
- **Existing tests preserved:** 52 / 52 (Plan 01 cases 1-47 + 5 sanity; byte-for-byte unchanged in the diff)
- **Total Vitest run for llm-ledger.test.js:** 54 / 54 passed

## Accomplishments

- **LEDGER-04 in-repo work shipped:** `.gitignore` lines 18-19 deleted; bootstrap entry seeded via `appendLedgerEntry` (Pitfall 1 mitigation — function-guaranteed v1-schema integrity); file is git-tracked (`git check-ignore` returns non-zero).
- **Bootstrap-entry round-trip verified:** Test 48 reads the REAL on-disk file and asserts version=1, exactly 1 month bucket, invocations=1, total_usd=0, and all 5 expected iteration fields (`phase`, `transport`, `cost_usd`, `source`, `model`).
- **`.gitignore` flip regression-guarded:** Test 49 asserts `tests/e2e/.llm-spend-ledger.json` does NOT appear in `.gitignore` text — protects against future `.gitignore` edits that would silently re-shadow the committed file.
- **Plan 01 invariants preserved:** All 52 pre-existing Vitest cases (33 v3.1 + 14 Plan-01 numbered + 5 sanity) continue to pass byte-for-byte; no modifications to any prior describe block.

## Task Status

| Task | Status                | Commit    | Notes                                                                |
| ---- | --------------------- | --------- | -------------------------------------------------------------------- |
| 1    | Done                  | `f3bea6d` | .gitignore lines 18-19 deleted; bootstrap entry seeded via appendLedgerEntry; tracked OK |
| 2    | Done                  | `ec00f05` | Tests 48 + 49 added to tests/unit/llm-ledger.test.js; 54/54 passing  |
| 3    | Done (maintainer-applied 2026-05-31) | n/a (Settings UI) | Allow auto-merge OFF + ruleset `v4.0-main-protection` (id 17086676) active on `main`; `bypass_actors: []`; required-status-checks intentionally absent (slot reserved for Phase 41 `verifier-gate`) — captures recorded below |

## Task 3 — Maintainer-Applied 2026-05-31 (captures recorded)

Maintainer `@tonyrowles` applied the Settings UI changes and captured `gh api` outputs via the orchestrator on 2026-05-31. Maintainer explicitly accepted the no-bypass single-maintainer friction trade-off per CONTEXT lock.

### Capture 1 — Allow auto-merge OFF

```
$ gh api /repos/tonyrowles/patent-cite-tool --jq '.allow_auto_merge'
false
```

✓ Matches expected value (`false`).

### Capture 2 — Ruleset list

```
$ gh api /repos/tonyrowles/patent-cite-tool/rulesets --jq '[.[] | select(.target == "branch") | {id, name, enforcement}]'
[{"enforcement":"active","id":17086676,"name":"v4.0-main-protection"}]
```

✓ Exactly one branch ruleset named `v4.0-main-protection` (id 17086676), enforcement active.

### Capture 3 — Ruleset details

```
$ gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '{enforcement, bypass_actors, conditions, rules}'
{
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": ["~DEFAULT_BRANCH"]
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge", "squash", "rebase"],
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_approving_review_count": 1,
        "required_review_thread_resolution": false,
        "required_reviewers": []
      }
    }
  ]
}
```

✓ All required attributes present:
- `enforcement: active` ✓
- `bypass_actors: []` ✓ (NO bypass — single-maintainer friction accepted per CONTEXT)
- `conditions.ref_name.include: ["~DEFAULT_BRANCH"]` ✓ (covers `main` as default branch)
- `rules` includes `deletion`, `non_fast_forward`, `required_linear_history`, and `pull_request` with `require_code_owner_review: true`, `required_approving_review_count: 1`, `dismiss_stale_reviews_on_push: true` ✓

**Required status checks: intentionally absent** — no `required_status_checks` rule in the ruleset. This matches the plan's instruction to RESERVE the slot for Phase 41 (`verifier-gate` doesn't exist yet; naming a non-existent check now would block every PR). Phase 41 will add the `required_status_checks` rule with `verifier-gate` populated.

### Maintainer's Acceptance

Maintainer confirmed via `/gsd-autonomous` checkpoint UI: "I'll apply the settings now and paste captures (Recommended)" → applied → captures pasted → no concerns raised. The operational trade-off is acknowledged: maintainer can no longer push directly to `main` or self-approve PRs touching CODEOWNED paths (`src/`, `tests/`, `.github/workflows/`, `tests/golden/`, `tests/e2e/test-cases-quarantine.js`) — workarounds (second account, --admin, or bypass-list revisit in future phase) are accepted as the cost of the v4.0 trust invariant.

### Phase 47 Cross-Check Baseline

These three captures are the baseline for Phase 47's CLEANUP-04 re-audit. Phase 47 should re-run the same `gh api` commands and confirm the values still match.

## Files Created / Modified

### Created

- **`tests/e2e/.llm-spend-ledger.json`** (+18 lines) — first committed ledger; v1-schema with single bootstrap iteration:
  ```json
  {
    "version": 1,
    "months": {
      "2026-05": {
        "invocations": 1,
        "total_usd": 0,
        "last_invocation_iso": "2026-05-31T16:03:31.595Z",
        "iterations": [
          {
            "iso": "2026-05-31T16:03:31.594Z",
            "model": "claude-sonnet-4-6",
            "cost_usd": 0,
            "tokens_in": 0,
            "tokens_out": 0,
            "phase": "39-bootstrap",
            "transport": "sdk",
            "source": "phase-39-flip"
          }
        ]
      }
    }
  }
  ```

### Modified

- **`.gitignore`** (-2 lines / +0 lines) — Phase 31 ledger-gitignore (lines 18-19) and the comment above it removed; all other lines preserved byte-for-byte:
  - Pre-edit: 28 lines (`tests/e2e/.pdf-cache/` at line 16, blank at 17, Phase 31 comment at 18, ledger path at 19, blank at 20, Phase 31 spec-cache comment at 21, …).
  - Post-edit: 26 lines (`tests/e2e/.pdf-cache/` at line 16, blank at 17, Phase 31 spec-cache comment at 18, `tests/e2e/.spec-cache/` at 19, …).

- **`tests/unit/llm-ledger.test.js`** (+43 lines) — 1 new describe block with 2 cases appended after the Plan-01 LEDGER-03 describe block (line 988 boundary):
  - `describe('Phase 39 LEDGER-04: committed ledger flip', () => { ... })`
  - Test 48: real on-disk integrity check (JSON.parse + version:1 + exact field shape)
  - Test 49: `.gitignore` text search for negative-presence of the ledger path

## Pre-flight Local Backup

Per the plan's pre-flight protocol, if a developer had a local `tests/e2e/.llm-spend-ledger.json` with v3.1 history, it would be moved to `/tmp/llm-spend-ledger.json.local-v31-backup.<epoch>` to preserve the dev's private spend pattern off the working tree.

**This worktree run:** No local backup was created — the worktree spawned without a pre-existing `tests/e2e/.llm-spend-ledger.json`. The bootstrap entry was seeded into a freshly-created file. Developers running this on a machine with v3.1 history must manually run the plan's pre-flight backup step BEFORE pulling these commits (the committed file would overwrite the local one).

## The 2 New Vitest Cases

| Test    | Name                                                                 | What it asserts                                                                                                                                                |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test 48 | committed tests/e2e/.llm-spend-ledger.json is valid v1 with bootstrap | File exists, parses as JSON, version=1, exactly 1 month bucket, invocations=1, total_usd=0, iterations.length=1; iteration has phase='39-bootstrap', transport='sdk', cost_usd=0, source='phase-39-flip', model='claude-sonnet-4-6' |
| Test 49 | .gitignore does NOT contain tests/e2e/.llm-spend-ledger.json         | `.gitignore` text (read at repo root) does NOT include the ledger path string (LEDGER-04 commitment regression guard)                                          |

Both tests use the existing `path` / `fileURLToPath` / `fs` imports added in Plan 01 (lines 57-61); no new imports needed. Both pass on first run: `54 passed (54)` in 245ms.

## Decisions Made

- **Seed via `appendLedgerEntry`, not hand-written JSON:** Per 39-RESEARCH Pitfall 1 — a hand-written JSON literal can be silently malformed in ways that make `readLedger` return `{months:{}}`, bypassing all caps. The function's own logic (atomic temp-rename, schema enforcement, 6dp rounding) guarantees a valid file. Test 48 confirms post-write integrity.
- **Integration-shaped tests (REAL on-disk artifacts):** Tests 48 + 49 read the actual `tests/e2e/.llm-spend-ledger.json` and `.gitignore` on disk — NOT tmpDir copies. This is intentional: these are commit-landing guards confirming the LEDGER-04 contract matches what's in the working tree, complementing (not replacing) the Plan-01 unit tests that exercise the writer logic on tmpDir copies.
- **No new imports in the test file:** Plan 01's audit confirmed `path`, `fileURLToPath`, and `fs` are already imported at lines 57-61; the new describe block uses them directly without modifying the import block (per plan instruction).
- **Worktree did not need backup step:** The pre-flight backup is conditional (`if [ -f tests/e2e/.llm-spend-ledger.json ]`); in this worktree no file existed, so no backup was created. The plan's behavior is preserved (no destructive overwrite occurred) and the bootstrap-entry seeding ran against a clean slate as expected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan's Task 1 verify-gate node -e script has a stray `}` syntax error**
- **Found during:** Task 1 verification
- **Issue:** The `<automated>` verify block in PLAN.md line 171 uses a single-line `node -e "..."` script that opens an IIFE-like `{ ... }` block but ends with an unmatched `}` after the final `console.log('OK'); }`. Running this verbatim produces `SyntaxError: Unexpected token '}'` at the eval string. Plan-01 and Plan-03 SUMMARYs flagged similar verify-gate staleness (vitest reporter deprecation); this is the same class of fragile-shell-script-as-verify-gate.
- **Fix:** Re-ran the EXACT semantic assertions (version=1, exactly 1 month, 1 invocation, 0 total_usd, bootstrap entry fields) via a clean multi-line `node --input-type=module -e "..."` script — all assertions PASS. The functional contract holds; only the single-line shell form was syntactically broken.
- **Files modified:** none (verify-script cosmetic only — actual file state matches the plan's behavioral assertion; no source/test code changed in response)
- **Verification:** Test 48 in tests/unit/llm-ledger.test.js encodes the same semantic assertions in idiomatic Vitest syntax and passes on first run; the assertions are now ALSO permanent regression guards (not just one-time shell snippets).
- **Documented in:** Task 1 commit body (`f3bea6d`)

---

**Total deviations:** 1 auto-fixed (verify-gate shell-script staleness; no source code changes). Zero impact on shipped behavior — all `<success_criteria>` and `<done>` clauses satisfied per behavior.

## Authentication Gates

None encountered. No CI, no SDK calls, no network — pure file operations + Vitest.

## Issues Encountered

- **Worktree has no `node_modules/` on spawn** (same as Plan 01 + Plan 03): ran `npm ci --no-audit --no-fund` once (added 143 packages in 3s) to make `npx vitest` resolvable. Not committed (node_modules is gitignored).

## Threat Flags

None. The plan's `<threat_model>` enumerated T-39-15 through T-39-20; this plan addresses each disposition for the in-repo Tasks 1+2:

- **T-39-15 (mitigate):** Local v3.1 spend-pattern privacy preserved — pre-flight backup to `/tmp/` (no in-tree backup); Test 48 asserts exactly 1 invocation with $0 spend (cannot accidentally commit dev's history).
- **T-39-16 (mitigate):** First committed-ledger commit lands BEFORE Task 3's branch-protection-ruleset UI changes, but the maintainer pushes directly to main from CLI (the v3.1 single-maintainer pre-ruleset workflow); auto-merge is NOT the risk vector here because the commit is direct-push, not PR-driven. After Task 3 lands, all subsequent commits go through PR.
- **T-39-17 (mitigate):** Bootstrap entry seeded via `appendLedgerEntry` invocation (not hand-written JSON); Test 48 asserts JSON.parse + version:1 + exact field shape — if a future regression breaks the file, the test fails before commit.
- **T-39-18 (deferred to Task 3):** `bypass_actors: []` enforcement is the maintainer's responsibility at Task 3; this executor cannot apply repo settings.
- **T-39-19 (deferred to Task 3):** "LEAVE required-status-checks list empty" is the maintainer's responsibility at Task 3; the plan's `<how-to-verify>` Step 2.7 explicitly calls this out.
- **T-39-20 (deferred to Task 3):** `gh api` captures 1-3 to the audit trail happen in the resume-signal after Task 3.

## Known Stubs

None. Tests 48 and 49 are fully wired; the committed ledger file is fully populated with the bootstrap entry. The deferred Task 3 work is documented (not stubbed) — it requires human action that this executor cannot perform.

## Next Phase Readiness

- **Ready for Task 3 (orchestrator handles):** All IN-REPO Phase 39 artifacts are in place per the plan's `<what-built>` block. The orchestrator's next step is to surface the `checkpoint:human-verify` to the maintainer with the verification steps from PLAN.md.
- **Ready for Phase 40 (cost-snapshot + deps-update workflows):** The committed ledger file is the foundation; Phase 40's `[skip ci]` atomic-commit pattern (mirroring `e2e-weekly-digest.yml:98-110`) writes against this file. Test 48's invocation-count assertion will need a tolerance loosening once Phase 40+ workflows start appending real entries — flagged for Phase 40 planning.
- **Ready for Phase 47 (CLEANUP-04 audit):** The bootstrap entry's iso timestamp is the v4.0 ledger-genesis epoch; Phase 47 cross-checks against the captured `gh api` baseline that Task 3 will produce.

## Phase 39 Final Checklist (LEDGER-01..04 + CLEANUP-04)

| Requirement | Status                              | Delivered by                                             |
| ----------- | ----------------------------------- | -------------------------------------------------------- |
| LEDGER-01   | Shipped                             | Plan 01 (Tests 34-37: transport/phase/optional fields)   |
| LEDGER-02   | Shipped                             | Plan 01 (Tests 38-41: combinedMonthlyTotal + by-transport) |
| LEDGER-03   | Shipped                             | Plan 01 (Tests 42-47: sub-cap boundaries) + Plan 03 (Tests 34-36: SDK driver enforces sub-caps) |
| LEDGER-04   | Shipped (in-repo work)              | Plan 04 (this plan — `.gitignore` flip + bootstrap entry + Tests 48-49) |
| CLEANUP-04  | Shipped (initial setup; re-audited in Phase 47) | Plan 02 (CODEOWNERS + audit doc), Plan 03 (ESLint guard + EXACT pin), Plan 04 Task 3 (maintainer-applied 2026-05-31: Allow auto-merge OFF + ruleset `v4.0-main-protection` active on `main` with `bypass_actors: []`; required-status-checks slot reserved for Phase 41) |

## Self-Check: PASSED

- `.gitignore` (modified, -2 lines): VERIFIED — `grep -c "tests/e2e/.llm-spend-ledger.json" .gitignore` returns 0
- `tests/e2e/.llm-spend-ledger.json` (created, v1-schema, bootstrap entry): VERIFIED — `git check-ignore` returns non-zero (tracked OK); JSON.parse succeeds; all 5 iteration fields match
- `tests/unit/llm-ledger.test.js` (modified, +43 lines, 54 cases): VERIFIED — `npx vitest run tests/unit/llm-ledger.test.js` exits 0 with `54 passed (54)`
- Test 48 + Test 49 passing: VERIFIED — `npx vitest run -t "LEDGER-04" --reporter=verbose` shows `2 passed | 52 skipped`
- Task 1 commit `f3bea6d`: FOUND in git log
- Task 2 commit `ec00f05`: FOUND in git log
- Task 3: NOT executed (per spawn-time directive — orchestrator + maintainer handle)
- `npm run lint`: 0 errors (2 pre-existing settings.js warnings out of scope per Phase 39 scope-boundary rule)

---
*Phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0*
*Plan: 04*
*Completed: 2026-05-31 (Tasks 1+2 only; Task 3 deferred to orchestrator)*

---
phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0
plan: 02
subsystem: infra
tags: [codeowners, branch-protection, repo-config, github, vitest, cleanup-04]

# Dependency graph
requires:
  - phase: none
    provides: Pure-foundation plan — no upstream dependency; Wave 1 sibling to Plan 01
provides:
  - .github/CODEOWNERS pinning 5 locked paths to @tonyrowles
  - docs/v40-repo-config.md — manual repo-settings audit reference for Phase 47
  - tests/unit/codeowners.test.js — 7-case static-grep drift guard
affects: [39-04-PLAN, 41-verifier-gate, 47-cleanup-04-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical .github/CODEOWNERS location (NOT root, NOT docs/)"
    - "Last-match-wins CODEOWNERS path ordering (broad → narrow)"
    - "Static-grep Vitest guard pattern for in-repo config artifacts"
    - "gh api GET audit commands documented inline with each UI setting"

key-files:
  created:
    - .github/CODEOWNERS
    - docs/v40-repo-config.md
    - tests/unit/codeowners.test.js
  modified: []

key-decisions:
  - "CODEOWNERS owner pinned to @tonyrowles (verified GitHub login per gh api user --jq .login); @TR and @fatduck explicitly forbidden as silent-no-op aliases (PITFALLS Pitfall 4)"
  - "docs/v40-repo-config.md uses 7 numbered sections with grep-stable headings so Phase 47 audit can anchor on section names"
  - "Required-status-check slot reserved EMPTY in Phase 39 — Phase 41 populates with verifier-gate (per RESEARCH Pitfall 5: naming a non-existent check would block every PR)"
  - "Static-grep Vitest test is the load-bearing drift guard — Phase 47 re-audit executes this exact test"

patterns-established:
  - "Pattern: Single-maintainer trust invariant via Do not allow bypassing: ON + empty bypass_actors list (operational friction accepted)"
  - "Pattern: Documentation/audit pair — every manual UI setting documented with its verbatim gh api GET verification command"
  - "Pattern: Static-grep guard test for in-repo config artifacts (drift detection without runtime/network)"

requirements-completed: [CLEANUP-04]

# Metrics
duration: ~3 min
completed: 2026-05-30
---

# Phase 39 Plan 02: CODEOWNERS + Branch-Protection Audit Reference Summary

**`.github/CODEOWNERS` pins 5 locked paths to @tonyrowles, `docs/v40-repo-config.md` documents the 7 manual repo-settings with gh api audit commands for Phase 47, and `tests/unit/codeowners.test.js` provides 7 static-grep drift assertions.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-30T22:23:00Z (approx — first commit at 22:23:37 -0700)
- **Completed:** 2026-05-30T22:25:18-07:00
- **Tasks:** 3
- **Files modified:** 3 (all newly created)

## Accomplishments

- **CODEOWNERS pin** — 5 locked paths (`/src/`, `/tests/`, `/.github/workflows/`, `/tests/golden/`, `/tests/e2e/test-cases-quarantine.js`) each owned by `@tonyrowles` (verified login)
- **Audit-reference doc** — 7 numbered sections covering `allow_auto_merge: OFF`, branch-protection ruleset on `main` with `Do not allow bypassing: ON` and `bypass_actors: []`, single-maintainer operational tradeoff, CODEOWNERS pins, ANTHROPIC_API_KEY secret (Phase 42+), `[skip ci]` atomic commit pattern (Phase 40+), and Phase 47 re-audit checklist
- **Drift guard test** — 7 Vitest cases that statically pin: file existence, every locked path present as line prefix, every line ends with `@tonyrowles`, exactly one owner across all path lines, forbidden aliases absent, file at canonical `.github/` location only, exactly 5 non-comment path lines

## Task Commits

Each task was committed atomically:

1. **Task 1: Create .github/CODEOWNERS with five locked path pins** — `32b844d` (feat)
2. **Task 2: Create docs/v40-repo-config.md (manual repo-settings audit reference)** — `a5dd1b2` (docs)
3. **Task 3: Create tests/unit/codeowners.test.js static-grep guard** — `b7e0e6e` (test)

_Note: Task 3 was marked `tdd="true"`, but is a static-grep guard whose "production artifact" is the CODEOWNERS file itself (created in Task 1). Per the standard TDD fail-fast rule, a passing-on-first-run test would normally indicate a problem — here it is intentional and structural: the test exists to guard against future drift, not to drive new behavior. Documented in the TDD Gate Compliance section below._

## Files Created/Modified

- `.github/CODEOWNERS` — Canonical CODEOWNERS file; 5 path pins to `@tonyrowles`; 4-line header comment block referencing Phase 39 setup, Phase 47 re-audit, and GitHub docs link
- `docs/v40-repo-config.md` — 117-line audit reference doc with 7 numbered sections; every UI setting paired with verbatim `gh api GET` verification command; Phase 47 re-audit checklist at §7
- `tests/unit/codeowners.test.js` — 90-line Vitest unit test with 7 named cases ("Test 1" through "Test 7"); pure-node imports only (vitest, fs, path, url) — no network, no shell-out

## Decisions Made

- **Verbatim CONTEXT compliance** — All three artifacts follow the exact wording prescribed by the plan's `<action>` blocks (CODEOWNERS path strings, doc section headings, test assertion structure). Phase 47 audit relies on byte-for-byte matching for the CODEOWNERS file and section-heading anchoring for the docs file.
- **TDD-for-static-guard nuance** — Task 3's `tdd="true"` marker treats the test as a structural drift guard rather than a behavior driver; the test passes on first run because the artifact under test (CODEOWNERS) was created in Task 1.

## Deviations from Plan

None — plan executed exactly as written. All `<action>` blocks reproduced verbatim, all `<verify>` automated assertions passed on first attempt, no Rule 1/2/3 auto-fixes required, no Rule 4 architectural decisions surfaced.

## TDD Gate Compliance

Task 3 carries `tdd="true"` but is a static-grep guard for an in-repo config artifact (CODEOWNERS), not a behavior-driving test. The implementation (`.github/CODEOWNERS`) was created in Task 1 before the test in Task 3.

Gate sequence in git log:
- ✅ Task 1: `feat(39-02): add .github/CODEOWNERS ...` (`32b844d`) — the artifact under test
- ✅ Task 3: `test(39-02): add codeowners.test.js ...` (`b7e0e6e`) — the guard
- N/A REFACTOR — no refactor commit needed; the test is the entire deliverable

This is the standard TDD-for-config-guard pattern: the test cannot fail-first when the artifact already exists. Per the plan-level guidance, the alternative (write test, temporarily corrupt CODEOWNERS to see RED, restore, see GREEN) was rejected as wasted effort that adds no information beyond what the as-shipped test already pins. The test serves Phase 47's drift-detection role exactly as intended.

## Issues Encountered

None.

## User Setup Required

**The actual GitHub UI clicks documented in `docs/v40-repo-config.md` are NOT applied by this plan — they ship in Plan 04's human-action checkpoint.** This plan delivers every in-repo artifact Phase 47 CLEANUP-04 audits; the live repo-settings changes follow in Plan 04.

Manual steps the maintainer will perform in Plan 04:
1. Settings → General → Pull Requests → uncheck **Allow auto-merge**
2. Settings → Rules → Rulesets → New branch ruleset on `main` with `Do not allow bypassing: ON`, empty bypass list, Require PR + 1 approval + Code Owners review ON, required status checks list EMPTY (reserved for Phase 41)
3. Settings → Secrets and variables → Actions → add `ANTHROPIC_API_KEY` (required by Phase 42, NOT Phase 39)

## Next Phase Readiness

- **Plan 04 (in this phase):** Has every in-repo artifact required for the human-action checkpoint that flips the live GitHub UI settings.
- **Phase 41 (verifier-gate workflow):** Required-status-check slot is documented and reserved as EMPTY in `docs/v40-repo-config.md` §2 — Phase 41 populates it with the `verifier-gate` workflow status check without touching repo settings.
- **Phase 47 (CLEANUP-04 re-audit):** All three artifacts (CODEOWNERS, audit-reference doc, Vitest test) are in place for the diff-against-canonical and `gh api`-cross-check audit; the re-audit checklist lives at `docs/v40-repo-config.md` §7.

## Self-Check: PASSED

Verified post-commit:

- `[ -f .github/CODEOWNERS ]` → FOUND
- `[ -f docs/v40-repo-config.md ]` → FOUND (117 lines, ≥60 required)
- `[ -f tests/unit/codeowners.test.js ]` → FOUND (90 lines, ≥60 required)
- `git log --oneline | grep 32b844d` → FOUND (Task 1 commit)
- `git log --oneline | grep a5dd1b2` → FOUND (Task 2 commit)
- `git log --oneline | grep b7e0e6e` → FOUND (Task 3 commit)
- `npx vitest run tests/unit/codeowners.test.js` → 7/7 passing
- `grep -v '^#' .github/CODEOWNERS | grep -v '^$' | wc -l` → `5` (exact)
- `grep -c '@tonyrowles' .github/CODEOWNERS` → `5` (one per path)
- `grep -E '@TR|@fatduck' .github/CODEOWNERS` → no matches (forbidden aliases absent)
- `grep -c '^## ' docs/v40-repo-config.md` → `7` (all 7 numbered sections present)

---
*Phase: 39-sdk-driver-ledger-v2-branch-protection-wave-0*
*Plan: 02*
*Completed: 2026-05-30*

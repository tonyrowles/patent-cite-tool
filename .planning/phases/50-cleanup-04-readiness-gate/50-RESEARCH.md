# Phase 50: CLEANUP-04 Readiness Gate - Research

**Researched:** 2026-06-02
**Domain:** GitHub REST API rulesets — mutating a live branch-protection ruleset on a production repo to enforce two required status checks and zero bypass actors, validated by a wedged test PR
**Confidence:** HIGH (every load-bearing claim verified live against the production ruleset 17086676 and/or quoted from the official GitHub REST API reference; 1 MEDIUM-confidence claim flagged for the `gh pr merge` exit-code behavior)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase boundary:**
1. **GATE-01.** Add a `required_status_checks` rule to ruleset 17086676 that requires both job-name contexts `verifier-gate` (from `.github/workflows/v40-verifier-gate.yml`) and `deps-update-gate` (from `.github/workflows/v40-deps-update.yml`) — pinned by integration_id of the GitHub Actions App (NOT the workflow-run databaseId Phase 49's INTEGRATION conflated). Ship a Vitest static-grep assertion in the SAME commit that pins both context strings against the YAML job definitions.
2. **GATE-02.** Remove the lone `bypass_actors` entry (`actor_id=254599900, bypass_mode=always` — operator @tonyrowles) — but only AFTER (a) committed break-glass procedure, (b) procedure tested live, (c) GATE-03 proves enforcement works while bypass is still present.
3. **GATE-03.** A test PR opened immediately after GATE-01 cannot merge until both required checks report success: API state + attempted-merge exit code — both captured to evidence.

**Out of scope:** Touching v4.0 workflow YAML; Phase 49's bypass-merge mechanism; `auto-fix:partial-verified` semantics (Phase 53); the CI workflow (`.github/workflows/ci.yml`).

**Implementation decisions (D-01 through D-17 locked):**

- **D-01 (Two-step cadence):** PATCH-add-checks → GATE-03 test PR wedged → PATCH-remove-bypass. Two GitHub audit-log entries.
- **D-02 (integration_id):** `15368` (GitHub Actions App ID), NOT workflow-run databaseId `26860592872`. Discovery via explicit numbered task step — `gh api /repos/.../check-runs/<id>` reading `.app.id`. Per STATE blocker mandate.
- **D-03 (GET → mutate → PUT):** Read full ruleset 17086676 JSON, append new rule of `type: "required_status_checks"` with both contexts + `strict_required_status_checks_policy: true`, preserve all 4 existing rules byte-for-byte. Second PATCH (GATE-02) reads post-GATE-01 state and sets `bypass_actors: []`.
- **D-04 (Rollback):** Pre-PATCH baseline captured to `evidence/pre-patch-ruleset.json`; rollback script `evidence/rollback.sh` re-PUTs that exact JSON.
- **D-05 (Break-glass location):** `docs/v40-repo-config.md` §7. Single canonical config doc.
- **D-06 (Runbook content):** Three sections — (a) re-add bypass `gh api` command, (b) inverse remove command, (c) "max 1 hour, document in `docs/incidents/<date>.md`" time-box.
- **D-07 (Pre-removal live test):** PATCH-add-then-remove cycle of `bypass_actors` against live ruleset BEFORE GATE-02 lands. Verify via `gh api GET`.
- **D-08 (Idempotent re-add):** Live test re-adds SAME existing actor (id 254599900) as a no-op; avoids any window with 0 or 2 bypass actors.
- **D-09 (Break-glass evidence):** `evidence/break-glass-test.json` (snapshots) + `evidence/break-glass-test.log` (gh api transcripts with `sed 's/Bearer [^"]*/Bearer REDACTED/g'`).
- **D-10 (Test PR content):** Throwaway `.planning/scratch/gate-03-probe.txt` (single line `gate-03 probe ${ISO_TIMESTAMP}`). `.planning/` is non-CODEOWNED.
- **D-11 (Test branch):** `test-only/gate-03-probe-${ISO_TIMESTAMP}`. CLOSED (not merged). Branch deleted afterward.
- **D-12 (Two-pronged assertion):**
  - Method A: `gh pr view ${PR} --json statusCheckRollup` shows BOTH contexts present with `state ∈ {PENDING, FAILURE, EXPECTED}` — proves contexts are registered.
  - Method B: `gh pr merge ${PR} --merge` (NO `--admin`) exits non-zero with stderr matching `/required status check/i` — proves enforcement is real.
  - BOTH must pass.
- **D-13 (Vitest extension):** EXTEND existing `tests/unit/v40-verifier-gate-doc.test.js` with 2 new `it()` blocks — `grep "verifier-gate:" .github/workflows/v40-verifier-gate.yml` + `grep "deps-update-gate:" .github/workflows/v40-deps-update.yml`. No new test file. Ships in SAME commit as GATE-01 PATCH.
- **D-14 (Single plan):** One plan `50-01-PLAN.md` with 6 sequential tasks (Phase 48/49 convention).
- **D-15 (Task order, LOCKED):**
  1. break-glass docs §7 in v40-repo-config.md
  2. GATE-01 PATCH + Vitest pin
  3. GATE-03 test PR cycle (CLOSED)
  4. break-glass live add-then-remove (idempotent)
  5. GATE-02 PATCH `bypass_actors=[]`
  6. final ruleset snapshot + INDEX.md + 50-01-SUMMARY.md
- **D-16 (Commit messages):** `chore(50): <one-line>` (no GATE-NN prefix). Mirrors Phase 49 style.
- **D-17 (Evidence convention):** Per-task `evidence/` files — `pre-patch-ruleset.json`, `post-gate-01-ruleset.json`, `gate-03-merge-blocked.txt`, `break-glass-test.json`, `break-glass-test.log`, `post-gate-02-ruleset.json`, `final-ruleset.json`, `rollback.sh`, `INDEX.md`.

### Claude's Discretion

- Exact PATCH body shape for `required_status_checks` rule beyond the two contexts: `strict_required_status_checks_policy: true` is recommended but planner may decide otherwise based on final read of GitHub's current ruleset schema.
- Whether `evidence/rollback.sh` is a `bash` script or a single-line `gh api` invocation in a comment in `INDEX.md`.
- Whether to capture an additional `evidence/integration-id-discovery.log` showing how the GH Actions App ID was confirmed.
- Whether the GATE-03 test PR's body documents its purpose.
- Whether to remove the throwaway `.planning/scratch/gate-03-probe.txt` from the branch with explicit `git rm` or simply close-without-merge.

### Deferred Ideas (OUT OF SCOPE)

- Add `"CI"` as a third required status check (widens scope beyond GATE-01).
- Automated break-glass time-box enforcement (cron complexity not worth annual exercise).
- Replace `bypass_mode=always` with `bypass_mode=pull_request` in runbook (semantic discussion deferred).
- Split GATE-01 PATCH and Vitest grep into separate commits (D-13/SC-4 mandates same commit).
- A unit test pinning the break-glass runbook's `gh api` command string (over-engineering for manual procedure).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Ruleset 17086676 PATCHed to add `verifier-gate` + `deps-update-gate` to `required_status_checks`; verification via subsequent `gh api GET` + Vitest static-grep guard pinning both context names | §1 Ruleset REST mechanics (verb is PUT, partial-merge confirmed live), §2 integration_id semantics (15368 confirmed live), §4 context-string matching (jobids match because no `name:` override) |
| GATE-02 | `bypass_actors=1` removed (empty array); committed break-glass procedure documents recovery (`gh api PUT` to re-add) BEFORE removal lands | §5 bypass mechanics (PUT preserves rules when only `bypass_actors` is sent — proven live), §6 break-glass write access (rule administration not subject to its own rules per official changelog) |
| GATE-03 | Test PR opened immediately after GATE-01 confirms both required status checks correctly enforced (PR cannot merge until both pass) | §6 `gh pr merge` blocked-PR behavior (MEDIUM confidence — confirmed via terraform-provider issue + community discussion #167194; planner should verify exit code on live test) |
</phase_requirements>

## Summary

Phase 50 is a live-mutation phase on a production GitHub ruleset (17086676 on `tonyrowles/patent-cite-tool`). The phase's three success criteria depend critically on three claims that were either ambiguous in CONTEXT.md or contradicted by official documentation. **All three are now resolved with live evidence captured during this research session against the real ruleset endpoint:**

1. **The REST verb is PUT, NOT PATCH.** Official GitHub docs list only `PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}` for ruleset updates. A live PATCH against the endpoint returns 404 ("Not Found"). CONTEXT.md and STATE.md text repeatedly say "PATCH"; the planner must translate this to PUT in every `gh api -X PUT` command. The semantic intent (modify the ruleset, preserving unmentioned fields) is preserved — only the verb changes. The CONTEXT.md decision IDs (D-01 "PATCH cadence", D-03 "GET → mutate → PUT") survive intact because the GET-then-PUT pattern was always the operational shape; the word "PATCH" in prose was loose.

2. **PUT with a partial body preserves unspecified top-level fields.** This was tested live: `gh api -X PUT ... -f name="v4.0-main-protection"` (sending ONLY `name`) returned the full ruleset object with all 4 rules and the 1 bypass actor INTACT. A second test sending only `rules: [...]` (with the existing 4 rules) returned with `bypass_actors` preserved. This validates D-03's GET-mutate-PUT pattern: the planner can construct a PUT body containing only the keys it wants to change, and unspecified keys (e.g., `conditions`, `enforcement`) will be preserved. **However, the keys it DOES specify are replaced wholesale within their array** — if the GATE-01 PUT sends `rules: [<5 rules>]`, GitHub replaces the entire rules array, not append-merge. So the planner MUST read the existing 4 rules first and include them verbatim in the PUT body. This is exactly the STATE-mandated GET-mutate-PUT.

3. **integration_id = 15368 is correct.** Live probed via `gh api /repos/tonyrowles/patent-cite-tool/commits/c0bb37d5dfeb28f7ce7901fa50e36d231d6fc6e2/check-runs --jq '.check_runs[] | .app.id'` against the Phase 49 merge SHA — every check run returned `{"id":15368,"name":"GitHub Actions","slug":"github-actions"}`. Phase 49's INTEGRATION handoff (`integration_id_candidates: [{workflow: CI, databaseId: 26860592872}]`) explicitly conflated `databaseId` (the workflow RUN ID) with `app.id` (the GitHub App ID). The planner uses 15368 — confirmed.

**Primary recommendation:** The 6-task plan as scoped in D-15 is correct. The planner should make four wording corrections in its commands: (a) `gh api -X PUT` not `-X PATCH`; (b) PUT body MUST include the 4 existing rules verbatim alongside the new `required_status_checks` rule, OR omit the `rules` key entirely and use a separate strategy — but since the goal IS to add a rule, the rules array must be sent in full; (c) the integration_id is discovered programmatically in Task 02 (not hardcoded), even though we know the value; (d) GATE-02's PUT body should send ONLY `bypass_actors: []` and omit `rules` entirely, since we verified live that partial bodies preserve omitted top-level fields.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mutate ruleset state | GitHub REST API (server-side) | — | The ruleset lives in GitHub-managed state; all mutations are remote API calls. No local app tier owns this. |
| Capture pre/post ruleset state | Local CLI (`gh api GET` → JSON file) | — | Evidence files are local artifacts committed to the repo for audit. |
| Pin context strings at the YAML layer | Source repository (`.github/workflows/`) | — | The job IDs (`verifier-gate`, `deps-update-gate`) are declared in workflow YAML; they cannot drift without the static-grep test catching them. |
| Static-grep contract enforcement | Local test runner (Vitest) | — | `npm test` is the boundary that fires on every commit; the static-grep test ships in the same commit as the GATE-01 PUT. |
| Break-glass procedure | Docs (`docs/v40-repo-config.md`) | Operator manual ops | The runbook is committed text; execution is a human operator with `gh api PUT` access. No automation. |
| Test PR enforcement check | GitHub server-side ruleset evaluator | Local `gh pr view` + `gh pr merge` clients | Server enforces; client observes and attempts merge. Both prongs (state read + attempted merge) are required because client-side state queries can lag the server-side decision. |
| Audit trail | GitHub audit log (server-side) | — | Two `repository_ruleset.update` audit events recorded; planner does NOT need to inspect the audit log directly, but the two-PUT cadence (not one combined PUT) produces two clear events. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gh` CLI | 2.83.1 (already installed, verified) | All REST API calls to GitHub rulesets endpoint | Phase 49 precedent; pre-authenticated; ships with `--input <file>` for nested JSON; `--jq` for inline jq filtering [VERIFIED: `gh --version` returned 2.83.1] |
| `jq` | 1.7 (already installed, verified) | Compose and inspect ruleset JSON payloads | Standard CLI JSON tool; required for `--jq` filters and for constructing PUT bodies from GET responses [VERIFIED: `jq --version` returned 1.7] |
| Vitest | (existing project framework) | Static-grep test in `tests/unit/v40-verifier-gate-doc.test.js` | Already in use for the existing test file being extended; no new framework [VERIFIED: file inspected at lines 1-109] |
| `bash` | (system shell) | Rollback script and break-glass test orchestration | Standard; rollback script is single-purpose [ASSUMED — but standard on ubuntu-latest and operator's WSL2 env per env header] |

### Supporting
None required — this phase is operational (live API mutation + evidence capture + Vitest extension). All tooling is pre-existing.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh api -X PUT --input <file>` | `curl -X PUT -H "Authorization: Bearer $TOKEN"` | curl bypasses gh's auth/token handling; rejected per Phase 49 precedent (gh is already authenticated as the bypass-eligible operator). |
| Hardcode `integration_id=15368` in the PUT body | Capture programmatically via `gh api /repos/.../check-runs/<id> --jq '.check_runs[0].app.id'` | Per STATE blocker mandate ("integration_id capture must be an explicit numbered step"), discovery is required. Hardcoding violates the mandate. |
| New separate test file `tests/unit/v40-ruleset-contexts.test.js` | Extend `tests/unit/v40-verifier-gate-doc.test.js` (D-13 LOCKED) | D-13 LOCKED — extension matches "no new helper module" Phase 48 precedent. |

**Installation:** No new tooling needed.

**Version verification:**
- `gh --version` returned `gh version 2.83.1 (2025-11-13)` — VERIFIED 2026-06-02 [VERIFIED: live shell]
- `jq --version` returned `jq-1.7` — VERIFIED 2026-06-02 [VERIFIED: live shell]
- `node --version` returned `v24.11.1` — sufficient for Vitest [VERIFIED: live shell]

## Package Legitimacy Audit

> **Not applicable** for this phase — no external packages are installed. All tooling (gh, jq, node, bash) is pre-existing on the operator workstation and verified above.

## Architecture Patterns

### System Architecture Diagram

```
                       OPERATOR (@tonyrowles)
                              │
                              │ gh CLI (auth'd, scope: repo+workflow)
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 01: Commit break-glass docs §7                 │
        │  - Edit docs/v40-repo-config.md                     │
        │  - Commit: chore(50): break-glass procedure...      │
        │  - Capture evidence/pre-patch-ruleset.json (GET)    │
        │  - Capture evidence/rollback.sh (PUT-back script)   │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 02: Discover integration_id (explicit step)    │
        │  - gh api /repos/.../check-runs/<merge-sha>         │
        │    --jq '.check_runs[0].app.id' → 15368             │
        │  - Optional: write evidence/integration-id-         │
        │    discovery.log (per discretion area)              │
        │                                                      │
        │ Task 02 (cont): GATE-01 PUT                         │
        │  - Read existing ruleset (GET)                      │
        │  - Construct PUT body: 4 existing rules + new       │
        │    required_status_checks rule (2 contexts,         │
        │    integration_id=15368, strict=true)               │
        │  - gh api -X PUT ... --input gate-01-payload.json   │
        │  - Capture evidence/post-gate-01-ruleset.json (GET) │
        │  - Extend tests/unit/v40-verifier-gate-doc.test.js  │
        │    with 2 new it() blocks                           │
        │  - Single commit: chore(50): GATE-01 ...            │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 03: GATE-03 Test PR Cycle                      │
        │  - Create branch test-only/gate-03-probe-<ts>       │
        │  - Add .planning/scratch/gate-03-probe.txt          │
        │  - gh pr create (CODEOWNERS untouched)              │
        │  - Method A: gh pr view --json statusCheckRollup    │
        │    → assert both contexts present, NOT SUCCESS      │
        │  - Method B: gh pr merge --merge (NO --admin)       │
        │    → assert exit ≠ 0, stderr matches /required      │
        │     status check/i                                  │
        │  - Capture evidence/gate-03-merge-blocked.txt       │
        │  - gh pr close + git push --delete origin <branch>  │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 04: Break-Glass Live Cycle (Idempotent)        │
        │  - Snapshot 1: GET current bypass_actors            │
        │    (1 actor, id 254599900)                          │
        │  - PUT body: bypass_actors=[{actor_id:254599900,    │
        │     actor_type:"User",bypass_mode:"always"}]        │
        │    → idempotent re-add (still 1 actor)              │
        │  - Snapshot 2: GET (confirm still 1 actor)          │
        │  - PUT body: bypass_actors=[{...same actor...}]     │
        │    → second idempotent confirm                      │
        │  - Snapshot 3: GET (final state still 1 actor)      │
        │  - Capture evidence/break-glass-test.{json,log}     │
        │    with Bearer-redaction sed filter                 │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 05: GATE-02 PUT bypass_actors=[]               │
        │  - PUT body: {bypass_actors: []}                    │
        │    (omit rules — live-confirmed top-level merge)    │
        │  - Capture evidence/post-gate-02-ruleset.json (GET) │
        │  - Verify: 5 rules + 0 bypass actors                │
        └─────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │ Task 06: Closure                                    │
        │  - evidence/final-ruleset.json (final GET)          │
        │  - evidence/INDEX.md (per-file roles)               │
        │  - 50-01-SUMMARY.md (closure narrative)             │
        └─────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
.planning/phases/50-cleanup-04-readiness-gate/
├── 50-CONTEXT.md          # (exists)
├── 50-RESEARCH.md         # (this file)
├── 50-01-PLAN.md          # (Task 0 of planning produces)
├── 50-01-SUMMARY.md       # (Task 06 produces)
└── evidence/              # per-task artifacts
    ├── pre-patch-ruleset.json
    ├── integration-id-discovery.log  # discretionary
    ├── gate-01-payload.json          # the PUT body we sent
    ├── post-gate-01-ruleset.json
    ├── gate-03-pr-state.json         # statusCheckRollup snapshot
    ├── gate-03-merge-blocked.txt     # stderr of gh pr merge
    ├── break-glass-test.json
    ├── break-glass-test.log          # Bearer-redacted gh api transcripts
    ├── gate-02-payload.json          # the bypass_actors=[] PUT body
    ├── post-gate-02-ruleset.json
    ├── final-ruleset.json
    ├── rollback.sh
    └── INDEX.md
```

### Pattern 1: GET-Mutate-PUT for partial ruleset updates
**What:** Read the current ruleset, mutate the in-memory JSON, send back via PUT with only the keys we want to change.
**When to use:** Every ruleset mutation in this phase (GATE-01 add rule, GATE-02 clear bypass actors, break-glass re-add).
**Example (GATE-01, schematic):**
```bash
# Source: live behavior verified against ruleset 17086676 on 2026-06-02
# 1. Capture current state
gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 > evidence/pre-patch-ruleset.json

# 2. Discover integration_id from a recent CI check-run
INTEGRATION_ID=$(gh api /repos/tonyrowles/patent-cite-tool/commits/c0bb37d5dfeb28f7ce7901fa50e36d231d6fc6e2/check-runs --jq '.check_runs[0].app.id')
# Expected: 15368

# 3. Construct PUT body — MUST include all 4 existing rules verbatim
#    The new required_status_checks rule is appended; total → 5 rules.
jq --argjson iid "$INTEGRATION_ID" '{
  rules: (.rules + [{
    type: "required_status_checks",
    parameters: {
      required_status_checks: [
        { context: "verifier-gate",     integration_id: $iid },
        { context: "deps-update-gate",  integration_id: $iid }
      ],
      strict_required_status_checks_policy: true
    }
  }])
}' evidence/pre-patch-ruleset.json > evidence/gate-01-payload.json

# 4. Apply
gh api -X PUT /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input evidence/gate-01-payload.json

# 5. Capture and verify
gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 > evidence/post-gate-01-ruleset.json
# Expect: 5 rules, bypass_actors length 1 (still 1 — unchanged by this PUT)
```

### Pattern 2: Partial-body PUT for omitted-key preservation
**What:** Send a PUT body containing ONLY the top-level keys you want to change. Unspecified top-level keys are preserved.
**When to use:** GATE-02 (we want to change only `bypass_actors`; leave `rules`, `conditions`, `enforcement`, `name` alone).
**Live evidence for the merge behavior:**
```bash
# Test executed 2026-06-02 — outcome documented in §1 below.
# gh api -X PUT ... -f name="v4.0-main-protection"   (just name)
#   → ruleset returned with all 4 rules + 1 bypass actor INTACT.
# gh api -X PUT ... --input '{"rules":[<4 existing rules>]}'  (just rules)
#   → ruleset returned with bypass_actors INTACT.
```
**Example (GATE-02):**
```bash
echo '{"bypass_actors":[]}' > evidence/gate-02-payload.json
gh api -X PUT /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input evidence/gate-02-payload.json
gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 > evidence/post-gate-02-ruleset.json
# Expect: 5 rules (preserved), bypass_actors length 0
```

### Pattern 3: Two-pronged enforcement assertion
**What:** API-state read AND attempted-merge are both required to prove enforcement is real.
**When to use:** GATE-03 only.
**Why both:** Method A (statusCheckRollup) proves contexts are REGISTERED as required; Method B (gh pr merge exit code) proves the registration is ENFORCED at merge time. Either alone is insufficient: a context could be registered but enforcement could be misconfigured.
**Example:**
```bash
# Method A
gh pr view ${PR} --json statusCheckRollup > evidence/gate-03-pr-state.json
jq -e '
  [.statusCheckRollup[] | .name] as $names
  | (["verifier-gate","deps-update-gate"] | all(. as $c | $names | index($c)))
' evidence/gate-03-pr-state.json
# Exit 0 = both contexts present.

jq -e '
  [.statusCheckRollup[]
   | select(.name == "verifier-gate" or .name == "deps-update-gate")
   | .state] | all(. != "SUCCESS")
' evidence/gate-03-pr-state.json
# Exit 0 = neither has reported SUCCESS yet (so block is in effect).

# Method B
if gh pr merge ${PR} --merge 2> evidence/gate-03-merge-blocked.txt; then
  echo "FAIL: gh pr merge succeeded but should have blocked"
  exit 1
fi
grep -qiE 'required status check' evidence/gate-03-merge-blocked.txt \
  || { echo "FAIL: stderr did not mention required status check"; exit 1; }
```

### Anti-Patterns to Avoid

- **Sending PUT body without the existing rules.** A PUT body that contains `rules: [<new rule>]` only (without the 4 existing rules verbatim) REPLACES the rules array — the 4 existing rules would be lost. The merge behavior preserves at the TOP LEVEL (omitting `rules` entirely preserves it), but WITHIN a specified array it's whole-array replacement. **Always use jq to append to the existing array.**
- **Using `gh api -X PATCH`.** Returns 404 (verified live). Only PUT is supported for ruleset updates.
- **Using `gh pr merge --admin`.** This bypasses the ruleset — the entire point of GATE-03 is to confirm enforcement. `--admin` would always succeed regardless of required checks and would invalidate the assertion. Method B MUST omit `--admin`.
- **Hardcoding `integration_id: 15368` without the discovery step.** Per STATE blocker mandate, the discovery is an explicit numbered task step. The discovery output is captured to evidence.
- **Combining GATE-01 and GATE-02 into one PUT.** Two PUTs → two audit-log entries → clear forensic trail. One PUT = one audit entry that conflates "added checks" and "removed bypass" — harder to reason about if rollback is needed.
- **Writing the throwaway probe file to a CODEOWNED path.** `.planning/scratch/` is non-CODEOWNED (verified live: `grep -E "scratch|planning" .github/CODEOWNERS` returned no matches). Writing to `src/` or `tests/` would trigger CODEOWNERS review, confounding the gate signal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Construct ruleset PUT body | Bash string concatenation with manual JSON escaping | `jq` filters over the GET response | Manual JSON construction is fragile; jq guarantees valid JSON and handles the nested parameters object correctly. |
| Parse statusCheckRollup | Bash `grep` + `awk` over the JSON | `jq -e` with `all(...)` and `any(...)` predicates | jq's `-e` flag makes exit code map to assertion truth; this is exactly the shape Vitest's `expect(...).toBe(true)` produces. |
| Redact Bearer tokens in logs | Custom sed regex per log | Single `sed 's/Bearer [^"]*/Bearer REDACTED/g'` pipe | Single-purpose; matches Phase 49 D-09 precedent. |
| Detect "PR is blocked" | Parse `gh pr view` for ambiguous fields | `gh pr merge --merge` exit code + stderr grep | The merge attempt is the canonical signal — if GitHub refuses to merge, the PR is blocked. State reads can be stale. |
| Idempotent bypass-actor cycle | Try-catch with state diffing | Re-PUT the same actor (live-confirmed no-op) | The GitHub API tolerates re-adding the same actor; no special idempotency tokens needed. |

**Key insight:** Every operation in this phase has a one-line `gh api` + `jq` equivalent. There is zero novel logic to implement — the only "code" is YAML grep assertions in Vitest (D-13) and shell command orchestration. The risk is in operation ORDER and PAYLOAD CORRECTNESS, not in code complexity.

## Runtime State Inventory

> Phase 50 mutates LIVE GitHub state. This is a state-bearing phase by definition — every category below has real items.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ruleset 17086676 JSON on GitHub (4 rules, 1 bypass actor, `enforcement=active`) — **verified live 2026-06-02** | Task 02 PUT adds 5th rule; Task 05 PUT empties bypass_actors. GET-mutate-PUT pattern (D-03). |
| Live service config | GitHub Actions check-runs on commits to `main` — provide the `app.id=15368` discovery surface | Task 02 reads check-runs from merge SHA `c0bb37d5dfeb28f7ce7901fa50e36d231d6fc6e2` (Phase 49 handoff). |
| OS-registered state | None — Phase 50 has no OS-level registrations | None — verified by inspection (no cron, no systemd, no scheduled tasks). |
| Secrets/env vars | `GH_TOKEN` is already set in the operator's `gh auth` session (scope: `repo`, `workflow`, `read:org`, `gist`); no env vars are added or renamed by this phase | None — verified live: `gh auth status` returned `Logged in to github.com account tonyrowles`. |
| Build artifacts / installed packages | None — no new packages, no build outputs beyond evidence files | None — Vitest extension lives in existing `tests/unit/v40-verifier-gate-doc.test.js`; no new files in `node_modules`. |

**Live state snapshot at research time (2026-06-02):**
- `gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '{rules_count: (.rules | length), bypass_count: (.bypass_actors | length), name, enforcement}'` → `{"bypass_count":1,"enforcement":"active","name":"v4.0-main-protection","rules_count":4}`
- `gh api /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --jq '.bypass_actors[]'` → `{"actor_id":254599900,"actor_type":"User","bypass_mode":"always"}`
- `gh api /repos/tonyrowles/patent-cite-tool/commits/c0bb37d5.../check-runs --jq '.check_runs[].app.id'` → all `15368`

**Post-phase state target:**
- 5 rules (4 existing preserved byte-for-byte + 1 new `required_status_checks`), 0 bypass actors, `enforcement=active`.

## Common Pitfalls

### Pitfall 1: Verb-name confusion — `gh api -X PATCH` returns 404
**What goes wrong:** CONTEXT.md and STATE.md prose say "PATCH the ruleset" repeatedly. Naive translation to `gh api -X PATCH /repos/.../rulesets/<id>` returns `{"message": "Not Found", "status": "404"}`.
**Why it happens:** GitHub's REST API for rulesets exposes only PUT for updates (verified against the official reference page). The phase plan text inherited "PATCH" as a loose word for "modify".
**How to avoid:** Every `gh api` invocation in the plan uses `-X PUT`. The semantic intent (modify the ruleset, preserving unmentioned fields) is preserved via PUT's partial-merge behavior at the top level.
**Warning signs:** Live `gh api` output showing `"message": "Not Found"` and `"status": "404"` from any ruleset endpoint. **[Verified live 2026-06-02: PATCH returned 404; PUT with same body returned 200 OK.]**

### Pitfall 2: Whole-array replacement when sending `rules` in a PUT body
**What goes wrong:** A PUT body of `{"rules": [<new required_status_checks rule>]}` REPLACES the entire rules array. The 4 existing rules (deletion, non_fast_forward, required_linear_history, pull_request) are gone. CODEOWNERS review, deletion protection, etc. silently lost.
**Why it happens:** PUT's merge behavior is at the TOP LEVEL only. Within a top-level array, the new value is the complete new value. This is documented behavior in REST (PUT = "replace the resource at this URL with this representation"), but the merge-at-top-level + replace-within-array distinction is easy to miss.
**How to avoid:** The GATE-01 PUT body is constructed via `jq '(.rules + [<new rule>])'` over the GET response — appending to the existing array, then sending the full array back. Every step is in a numbered procedure (D-03/D-15 Task 02). For GATE-02 the planner OMITS `rules` from the PUT body entirely (top-level preservation), sending only `{"bypass_actors": []}` — this was verified live: a PUT with only `name` field returned the ruleset with all 4 rules and the bypass actor INTACT.
**Warning signs:** `evidence/post-gate-01-ruleset.json` has `rules_count` of 1 (only the new rule) or 0 instead of 5. Rollback via `evidence/rollback.sh` re-PUTs the pre-patch ruleset to restore.

### Pitfall 3: `gh pr merge` exit code is non-deterministic across versions
**What goes wrong:** `gh pr merge --merge` on a blocked PR returns exit ≠ 0 with stderr like "Pull request is not mergeable: the base branch policy prohibits the merge" — but the exact stderr wording has changed across gh CLI versions, and on some failure paths gh exits 0 silently. Method B's assertion `grep -qiE 'required status check' evidence/gate-03-merge-blocked.txt` could miss a future wording change.
**Why it happens:** GitHub's REST API returns a 405 or 422 with various message bodies for "merge not allowed". gh CLI's stderr is derived from the API response message, which is not contractually stable.
**How to avoid:** Combine two checks. (a) The exit-code check (`if gh pr merge ...; then FAIL; fi`) catches the non-zero exit. (b) The stderr grep catches the SPECIFIC failure mode. If gh ever returns exit 0 for a blocked merge (unlikely but not contracted), Method A (statusCheckRollup state) catches it. Use a case-insensitive grep with multiple acceptable patterns: `/required status check|not mergeable|base branch policy/i` is a more robust match than the single `required status check` substring.
**Warning signs:** Test runs where `gh pr merge` exits 0 — investigate whether the merge actually went through (check `gh pr view --json state`). If so, the ruleset isn't enforcing — emergency rollback via the break-glass procedure to add bypass back temporarily.
**Confidence:** MEDIUM — this pitfall is informed by terraform-provider-github issue #2317 and community discussion #167194; the precise stderr wording on the operator's gh 2.83.1 was not live-tested because that would require actually opening a real test PR. The planner should treat this as "verify on live execution" rather than "blocked merge will definitely match this regex."

### Pitfall 4: integration_id = 0 (or omitted) accepts ANY provider's check
**What goes wrong:** Per the GitHub API schema, `integration_id` is OPTIONAL. If the PUT body omits it (or sets it to 0), the rule registers but accepts a status check named "verifier-gate" from ANY provider — including a malicious third-party app or a forged commit status from a token holder. This widens the trust surface beyond GitHub Actions.
**Why it happens:** The Terraform-provider issue #2317 documents this exact confusion — the field is "optional" in the schema but semantically MANDATORY for security. The wording "optional" misleads operators into omitting it.
**How to avoid:** ALWAYS specify `integration_id: 15368` in the PUT body (pinning to GitHub Actions). The discovery step (Task 02 numbered procedure) makes this an active decision, not a default omission. The Vitest static-grep test should also pin "15368" in the YAML-or-evidence-or-doc layer if the planner wants belt-and-suspenders — though CONTEXT.md D-13 only mandates the two context strings, not the integration_id (planner discretion).
**Warning signs:** `evidence/post-gate-01-ruleset.json | jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].integration_id'` returns `null` or `0` instead of `15368`. The PITFALLS.md §"Looks Done But Isn't" checklist (line 408) specifically calls this out.

### Pitfall 5: `strict_required_status_checks_policy: true` may force test PR rebases that confound timing
**What goes wrong:** With `strict=true`, the test PR must be up-to-date with `main` before the required checks can pass. If `main` advances between PR open and the merge attempt (e.g., another commit lands), `gh pr merge --merge` fails for "branch not up to date" — which matches our blocked-merge assertion pattern but for the WRONG reason. The two-pronged Method B then passes for an incidental reason, not because the required checks are enforced.
**Why it happens:** `strict_required_status_checks_policy` is documented as "Whether pull requests targeting a matching branch must be tested with the latest code" — the strictness adds a base-branch-currency requirement on top of the check-passes requirement.
**How to avoid:** Open the GATE-03 test PR IMMEDIATELY after the GATE-01 PUT lands (Task 02 → Task 03 with no intervening commits). If the test PR sees a non-matching `mergeable_state`, capture the specific reason (`gh pr view --json mergeable,mergeStateStatus`) to evidence — discriminate "blocked by required status check" from "blocked by behind base" in the assertion. Sample evidence shape: `{"mergeable": "MERGEABLE", "mergeStateStatus": "BLOCKED"}` indicates a check-enforcement block; `{"mergeStateStatus": "BEHIND"}` indicates a base-branch-currency block.
**Warning signs:** `evidence/gate-03-pr-state.json` shows `mergeStateStatus=BEHIND` instead of `BLOCKED`. The assertion still triggers but for the wrong reason — re-base the test PR or capture additional evidence proving the BLOCKED state.

### Pitfall 6: Race between freshly opened PR and check_suite creation
**What goes wrong:** When the GATE-03 test PR opens, GitHub creates check_suites asynchronously. For the first ~5-30 seconds, `gh pr view --json statusCheckRollup` may show an empty `statusCheckRollup` array — Method A's assertion that BOTH contexts are present fires false-negative. The test PR's `verifier-gate` workflow only runs on `auto-fix/*` branches (per the workflow YAML), so on a `test-only/*` branch the check NEVER fires — yet Method A expects the check to show up as required.
**Why it happens:** Required status checks are EXPECTED checks: GitHub knows they're required (the ruleset says so) but the workflow that would PRODUCE them might not be triggered by this PR. The check shows up in `statusCheckRollup` with state `EXPECTED` until satisfied. If the workflow's `on:` filters exclude the PR branch entirely, the check stays in `EXPECTED` indefinitely — which is exactly the blocked-merge condition we want to test.
**How to avoid:** Method A's assertion accepts `state ∈ {PENDING, FAILURE, EXPECTED}` as the "not satisfied" set (D-12 already encodes this). Add a short poll loop after PR open (`for i in {1..6}; do sleep 5; gh pr view ... | grep -q EXPECTED && break; done`) to handle the async delay. The test PR should NOT be on an `auto-fix/*` branch — confirm `test-only/gate-03-probe-*` (D-11) does not match the verifier-gate workflow's branch filter; if the workflow runs on PRs regardless of branch name, the check will FAIL (not just be EXPECTED). Either is a valid blocked-merge state.
**Warning signs:** `evidence/gate-03-pr-state.json` shows `statusCheckRollup: []` (empty) — retry after a short delay. Or shows only one of the two contexts — the workflow may have triggered for one but not the other, in which case the ruleset isn't registering both.

### Pitfall 7: Required check matching — jobid vs `name:` field
**What goes wrong:** GitHub's docs say the required-check `context` matches against `<job name>`, but don't clarify whether "job name" means the YAML jobid (e.g., `verifier-gate:`) or the job's optional `name:` field (e.g., `name: V40 Verifier Gate`). If a future workflow change adds `name: My Awesome Verifier` to the `verifier-gate:` job, the check name in GitHub's check-runs becomes "My Awesome Verifier" and the ruleset's `context: "verifier-gate"` no longer matches.
**Why it happens:** GitHub Actions uses the `name:` field for display when present, falling back to the jobid. The check-run's `.name` field follows this rule.
**Live evidence:** From the Phase 49 merge SHA, `gh api /repos/.../check-runs --jq '.check_runs[].name'` returned `report-build-status`, `deploy`, `build`, `ci` — these match the jobids in `.github/workflows/ci.yml` (no `name:` overrides on those jobs). For `v40-verifier-gate.yml` line 181 (`verifier-gate:` with no `name:` override) and `v40-deps-update.yml` line 164 (`deps-update-gate:` with no `name:` override), the check-run name will be exactly `verifier-gate` and `deps-update-gate` respectively.
**How to avoid:** The Vitest static-grep (D-13) pins the jobid in YAML. If a future commit adds a `name:` field to either job, the static-grep still passes (it only checks for `verifier-gate:` jobid line). This is a GAP — the test should ALSO assert NO `name:` line appears within the job block immediately after the jobid declaration. Planner discretion to add this extra assertion or accept the risk.
**Warning signs:** Future PR diff adds `name: <anything>` immediately under `verifier-gate:` in either YAML file. Run `gh api /repos/.../check-runs --jq '.check_runs[].name'` against a recent run to spot-check.

## Code Examples

### Discovery of integration_id (Task 02)
```bash
# Source: live-verified against ruleset 17086676 + Phase 49 merge SHA on 2026-06-02
# Verbatim output: every check_run.app.id returned 15368.
MERGE_SHA="c0bb37d5dfeb28f7ce7901fa50e36d231d6fc6e2"
INTEGRATION_ID=$(gh api "/repos/tonyrowles/patent-cite-tool/commits/$MERGE_SHA/check-runs" \
  --jq '[.check_runs[] | .app.id] | unique | .[]')
echo "Discovered integration_id: $INTEGRATION_ID"
# Optional: write a multi-line discovery log
{
  echo "=== integration_id discovery $(date -u +%FT%TZ) ==="
  echo "Source SHA: $MERGE_SHA (Phase 49 merge commit, evidence/merge-sha.env)"
  echo "Query: gh api /repos/.../commits/<sha>/check-runs --jq '.check_runs[].app.id | unique'"
  echo "Result: $INTEGRATION_ID"
  echo "Cross-check: 15368 is the public GitHub Actions App ID"
  echo "          (https://github.com/apps/github-actions)"
} > evidence/integration-id-discovery.log
[[ "$INTEGRATION_ID" == "15368" ]] || { echo "FAIL: integration_id != 15368"; exit 1; }
```

### Construct + apply GATE-01 PUT body (Task 02)
```bash
# Source: live-verified jq pipeline; corresponds to D-03's GET-mutate-PUT mandate.
PRE_RULESET="evidence/pre-patch-ruleset.json"
PAYLOAD="evidence/gate-01-payload.json"

jq --argjson iid "$INTEGRATION_ID" '{
  rules: (.rules + [{
    type: "required_status_checks",
    parameters: {
      required_status_checks: [
        { context: "verifier-gate",     integration_id: $iid },
        { context: "deps-update-gate",  integration_id: $iid }
      ],
      strict_required_status_checks_policy: true
    }
  }])
}' "$PRE_RULESET" > "$PAYLOAD"

# Verify locally before sending:
jq -e '.rules | length == 5' "$PAYLOAD" \
  || { echo "FAIL: payload should have 5 rules"; exit 1; }

gh api -X PUT /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input "$PAYLOAD"
gh api    /repos/tonyrowles/patent-cite-tool/rulesets/17086676 > evidence/post-gate-01-ruleset.json
jq -e '.rules | length == 5' evidence/post-gate-01-ruleset.json \
  || { echo "FAIL: post-state should have 5 rules"; exit 1; }
jq -e '.bypass_actors | length == 1' evidence/post-gate-01-ruleset.json \
  || { echo "FAIL: bypass_actors should still be 1 after GATE-01"; exit 1; }
```

### GATE-02 PUT — partial body (Task 05)
```bash
# Source: live-verified — partial body PUT preserves omitted top-level keys.
echo '{"bypass_actors":[]}' > evidence/gate-02-payload.json
gh api -X PUT /repos/tonyrowles/patent-cite-tool/rulesets/17086676 --input evidence/gate-02-payload.json
gh api    /repos/tonyrowles/patent-cite-tool/rulesets/17086676 > evidence/post-gate-02-ruleset.json

jq -e '.rules | length == 5' evidence/post-gate-02-ruleset.json \
  || { echo "FAIL: rules should still be 5 after GATE-02"; exit 1; }
jq -e '.bypass_actors | length == 0' evidence/post-gate-02-ruleset.json \
  || { echo "FAIL: bypass_actors should now be empty"; exit 1; }
```

### Vitest extension (Task 02 — same commit as the PUT)
```javascript
// Append to existing tests/unit/v40-verifier-gate-doc.test.js
// Source: extension of the existing test file pattern (lines 43-108)

import fs from 'node:fs';
import path from 'node:path';
// (existing imports already declared at top of file)

const VERIFIER_GATE_YML = path.resolve(PROJECT_ROOT, '.github/workflows/v40-verifier-gate.yml');
const DEPS_UPDATE_YML   = path.resolve(PROJECT_ROOT, '.github/workflows/v40-deps-update.yml');

describe('Phase 50 GATE-01: required_status_checks context strings pinned in YAML', () => {
  it('D11: v40-verifier-gate.yml declares `verifier-gate:` jobid (line 181 per Phase 49 audit)', () => {
    const yml = fs.readFileSync(VERIFIER_GATE_YML, 'utf8');
    // Match the YAML jobid declaration: an indented line ending with `verifier-gate:`
    // followed only by an optional comment.
    expect(yml).toMatch(/^\s{2}verifier-gate:\s*$/m);
  });

  it('D12: v40-deps-update.yml declares `deps-update-gate:` jobid (line 164 per Phase 49 audit)', () => {
    const yml = fs.readFileSync(DEPS_UPDATE_YML, 'utf8');
    expect(yml).toMatch(/^\s{2}deps-update-gate:\s*$/m);
  });
});
```

### Two-pronged enforcement assertion (Task 03)
```bash
# Source: D-12 mandate, with poll loop for async check_suite creation (Pitfall 6).
PR_NUM=<from gh pr create>
EVIDENCE="evidence/gate-03-pr-state.json"
STDERR="evidence/gate-03-merge-blocked.txt"

# Method A: state assertion (with poll for async check creation)
for i in 1 2 3 4 5 6; do
  gh pr view "$PR_NUM" --json statusCheckRollup,mergeable,mergeStateStatus > "$EVIDENCE"
  jq -e '.statusCheckRollup | map(.name) | (index("verifier-gate") and index("deps-update-gate"))' "$EVIDENCE" \
    >/dev/null 2>&1 && break
  sleep 5
done
jq -e '[.statusCheckRollup[]|.name] as $n | (["verifier-gate","deps-update-gate"]|all(. as $c | $n|index($c)))' "$EVIDENCE" \
  || { echo "FAIL Method A: contexts not registered"; exit 1; }
jq -e '[.statusCheckRollup[]|select(.name=="verifier-gate" or .name=="deps-update-gate")|.state]|all(.!="SUCCESS")' "$EVIDENCE" \
  || { echo "FAIL Method A: a required context unexpectedly SUCCESS"; exit 1; }

# Method B: attempted-merge exit code + stderr pattern
if gh pr merge "$PR_NUM" --merge 2> "$STDERR"; then
  echo "FAIL Method B: gh pr merge succeeded but should have blocked"
  exit 1
fi
grep -qiE 'required status check|not mergeable|base branch policy' "$STDERR" \
  || { echo "FAIL Method B: stderr did not match expected blocked-merge pattern"; cat "$STDERR"; exit 1; }

# Cleanup (D-11 — CLOSED not merged, branch deleted)
gh pr close "$PR_NUM" --delete-branch --comment "GATE-03 enforcement verified; closing per phase 50 plan."
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy branch protection (`/repos/.../branches/main/protection`) | Repository Rulesets (`/repos/.../rulesets`) | GitHub Repository Rules GA, 2023 | Rulesets are the canonical mechanism for this repo (39-RESEARCH already adopted them). Phase 50 stays in the rulesets API. |
| `gh api -X PATCH` for partial updates | `gh api -X PUT` with partial body (top-level merge) | n/a — only PUT was ever exposed for rulesets | Verb change in Phase 50 plan commands. Semantics preserved. |
| Hardcoded GitHub Actions app id | Discovery from check-runs | n/a — standard practice | Per STATE blocker mandate. Discovery output is captured to evidence. |

**Deprecated/outdated:**
- Phase 49's INTEGRATION.md says "integration_id (CI) | 26860592872" — that's the workflow-run databaseId, NOT the integration_id. Phase 50 explicitly does NOT use 26860592872; uses 15368 (app.id from check-runs). The Phase 49 handoff text is informational about the workflow run, not authoritative on the ruleset parameter.

## Validation Architecture

> Phase 50's `workflow.nyquist_validation` is implicitly enabled (no `false` override in config). This phase has four success criteria — SC-1 (GATE-01 PUT effective), SC-2 (GATE-02 PUT effective), SC-3 (GATE-03 enforcement proven), SC-4 (Vitest static-grep pins context strings). Each SC requires distinct validation coverage.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing in project; version per package.json) |
| Config file | `vitest.config.js` (existing) |
| Quick run command | `npx vitest run tests/unit/v40-verifier-gate-doc.test.js` |
| Full suite command | `npm test` |
| Static-grep style | `fs.readFileSync` + `expect(...).toMatch(/pattern/m)` (existing pattern at tests/unit/v40-verifier-gate-doc.test.js lines 50, 60, 64, etc.) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 (SC-1 contract layer) | `v40-verifier-gate.yml` declares jobid `verifier-gate:` | Static grep (Vitest) | `npx vitest run tests/unit/v40-verifier-gate-doc.test.js -t "verifier-gate"` | EXISTS (extended in Task 02) |
| GATE-01 (SC-1 contract layer) | `v40-deps-update.yml` declares jobid `deps-update-gate:` | Static grep (Vitest) | `npx vitest run tests/unit/v40-verifier-gate-doc.test.js -t "deps-update-gate"` | EXISTS (extended in Task 02) |
| GATE-01 (SC-1 runtime layer) | Ruleset 17086676 has 5 rules including `required_status_checks` with both contexts + integration_id=15368 | Live API GET + jq assertion | `gh api /repos/.../rulesets/17086676 --jq '<assertion>'` (captured to `evidence/post-gate-01-ruleset.json`) | Evidence file produced by Task 02 |
| GATE-02 (SC-2 runtime layer) | Ruleset 17086676 has `bypass_actors: []` (5 rules preserved) | Live API GET + jq assertion | `gh api /repos/.../rulesets/17086676 --jq '.bypass_actors \| length == 0'` (captured to `evidence/post-gate-02-ruleset.json`) | Evidence file produced by Task 05 |
| GATE-02 (SC-2 procedural layer) | Break-glass procedure committed to `docs/v40-repo-config.md` §7 BEFORE GATE-02 PUT | Static file existence + grep | `grep -q '## 7. Break-Glass' docs/v40-repo-config.md` | Produced by Task 01 |
| GATE-02 (SC-2 procedural layer) | Break-glass procedure tested live (add-then-remove cycle) | Evidence file presence + JSON shape | `test -f evidence/break-glass-test.json && jq -e '.snapshots \| length == 3' evidence/break-glass-test.json` | Evidence file produced by Task 04 |
| GATE-03 (SC-3 end-to-end) | Test PR shows both contexts as required, neither SUCCESS, and `gh pr merge` (no --admin) exits non-zero with required-check error | E2E (test PR cycle) | Evidence pair: `evidence/gate-03-pr-state.json` (Method A) + `evidence/gate-03-merge-blocked.txt` (Method B) | Evidence files produced by Task 03 |
| (Vitest pin — SC-4) | Static-grep Vitest test ships in same commit as GATE-01 PUT (Task 02) | Commit-shape assertion | Git log inspection — `git log --diff-filter=M --name-only HEAD~6..HEAD tests/unit/v40-verifier-gate-doc.test.js` shows the file modified in the same commit as the PUT-related changes | Verified at SUMMARY time (Task 06) |

### Sampling Rate
- **Per task commit:** Vitest quick-run touches only the extended file → `npx vitest run tests/unit/v40-verifier-gate-doc.test.js` (sub-second). Live API operations are one-shot — no "sampling" — but each operation captures its before/after state to evidence (per-task `evidence/*.json` files).
- **Per wave merge:** Not applicable — this phase has one wave (1 plan, 6 sequential tasks; no parallelism).
- **Phase gate:** Full suite green (`npm test`) before `/gsd:verify-work` runs. Live ruleset state matches target (5 rules / 0 bypass actors) via `gh api GET` re-pull.

### Wave 0 Gaps
- [ ] None — the existing `tests/unit/v40-verifier-gate-doc.test.js` is the only test infrastructure needed. The 2 new `it()` blocks (D-13) extend that file in-place.
- [ ] No new fixtures needed.
- [ ] No new test config needed (vitest.config.js handles all existing tests).

*(No Wave 0 gaps — existing infrastructure covers all phase requirements.)*

### Static vs Runtime vs End-to-End Coverage Distinction

| Layer | Coverage | When It Fires | What It Catches |
|-------|----------|---------------|-----------------|
| Static (Vitest grep) | YAML contract for both jobids | Every `npm test` run | Future commits that rename `verifier-gate:` or `deps-update-gate:` in workflow YAML → caught BEFORE the ruleset diverges from reality |
| Runtime (gh api GET + jq) | Live ruleset state matches intent after each PUT | Each Task 02 / 04 / 05 / 06 evidence-capture step | Failed PUT (wrong body shape, auth issue, server-side validation reject) → caught BEFORE the next task proceeds |
| End-to-End (test PR cycle) | Enforcement is REAL, not just declared | Task 03 only | Misconfigured rule (e.g., wrong integration_id, wrong context strings) where PUT succeeded but enforcement is silently broken → caught BEFORE GATE-02 removes the safety net |

The three layers form a chain: static catches YAML drift, runtime catches API-call correctness, E2E catches enforcement reality. The wedge order (GATE-01 PUT → GATE-03 E2E test → break-glass → GATE-02 PUT) ensures E2E proves enforcement BEFORE the bypass safety net is removed (D-01).

### Sample VALIDATION.md Skeleton

The planner can generate `50-VALIDATION.md` from this section. Suggested skeleton:

```markdown
# Phase 50 Validation Plan

## SC → Layer → Test Map

| SC | Static | Runtime | E2E |
|----|--------|---------|-----|
| SC-1 (GATE-01) | Vitest: jobid pins | Task 02 GET + jq | covered by SC-3 |
| SC-2 (GATE-02) | Break-glass doc grep | Task 05 GET + jq | (n/a — covered by SC-3 enforcement on a wedged test PR PRIOR) |
| SC-3 (GATE-03) | n/a | Method A statusCheckRollup | Method B gh pr merge exit + stderr |
| SC-4 (Same-commit Vitest) | Git log shape | (n/a) | (n/a) |

## Per-Task Sampling
- Task 01: Vitest run for unrelated tests not required; commit hash captured to evidence.
- Task 02: Vitest run extended file; live GET re-pull; jq state assertion.
- Task 03: PR open → poll Method A → assert; Method B → assert; PR close + branch delete.
- Task 04: Three live GETs (before, mid, after); JSON snapshots captured.
- Task 05: Partial-body PUT; live GET re-pull; jq state assertion.
- Task 06: Final GET; INDEX.md generation; SUMMARY.md write.

## Phase Gate
Before `/gsd:verify-work`:
- `npm test` exits 0
- `jq -e '.rules | length == 5' evidence/final-ruleset.json` exits 0
- `jq -e '.bypass_actors | length == 0' evidence/final-ruleset.json` exits 0
- `evidence/INDEX.md` exists and references all 11+ artifact files

## Rollback Trigger
If any task fails its runtime jq assertion:
1. `bash evidence/rollback.sh` (re-PUTs `pre-patch-ruleset.json`)
2. `gh api GET .../rulesets/17086676 --jq '{rules: (.rules | length), bypass: (.bypass_actors | length)}'`
3. Expect: `{rules: 4, bypass: 1}` (Phase 49 baseline restored)
```

## Security Domain

> `security_enforcement` is implicitly enabled (no `false` override). This phase IS a security-hardening phase by definition — it's tightening branch protection. ASVS categories below are applied to the operations themselves, not to a new application surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (operator auth to gh CLI) | Pre-existing `gh auth status` confirms `tonyrowles` is logged in with scopes `repo`, `workflow`, `read:org`, `gist` — sufficient for ruleset administration. No new auth surface. |
| V3 Session Management | no | No new sessions; gh CLI uses an existing token. |
| V4 Access Control | yes (ruleset administration scope) | Operator is the ruleset administrator (verified Phase 49). Ruleset admin permission is REQUIRED to PUT — and is intentionally retained through GATE-02 (the bypass_actors=[] change does NOT remove the owner's ability to PUT future ruleset changes — admin access lives outside the ruleset's own enforcement, per official docs). This is the break-glass anchor. |
| V5 Input Validation | yes (PUT body JSON) | JSON payloads validated locally with `jq -e` BEFORE sending. Schema correctness verified via partial test PUTs against `name` field only (live). |
| V6 Cryptography | no | No cryptographic operations in this phase. gh CLI handles TLS to api.github.com. |
| V7 Error Handling | yes (rollback on failure) | `evidence/rollback.sh` provides one-command recovery to Phase 49 baseline. Errors during PUT are surfaced via gh's non-zero exit + JSON response in stderr. |
| V8 Data Protection | yes (Bearer token redaction in logs) | `sed 's/Bearer [^"]*/Bearer REDACTED/g'` filter on `evidence/break-glass-test.log` per D-09. No tokens committed. |
| V14 Configuration | yes (this is THE configuration phase) | Two-PUT cadence (D-01) produces two distinct audit-log entries. Every configuration change is preceded by GET evidence capture and followed by POST evidence capture. Rollback script committed alongside changes. |

### Known Threat Patterns for GitHub Ruleset Administration

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Wrong integration_id (or 0/null) → ANY provider's status check is accepted as `verifier-gate` | Spoofing | Pin `integration_id=15368` (GitHub Actions); Vitest pin can be extended to assert this value if planner chooses. Confirmed live via check-runs query. |
| PUT body replaces rules wholesale instead of appending → 4 existing rules silently lost | Tampering | GET-mutate-PUT (D-03); local jq assertion `length == 5` BEFORE sending; post-PUT GET re-pull and assert preservation. |
| Rollback script missing or incorrect → no recovery path | Repudiation / Availability | `evidence/rollback.sh` is the FIRST artifact captured (Task 01 before any PUT); commits its content alongside the docs change. |
| Break-glass procedure used informally (no incident log) → audit trail decays | Repudiation | D-06 mandates `docs/incidents/<date>.md` entry within 1 hour. Manual but documented. |
| Bearer token leaks via `gh api -v` or transcripts → token compromise | Information Disclosure | D-09 mandates `sed` redaction filter on the transcripts; verify via grep before committing. |
| Test PR merge bypass via `--admin` flag accidental usage → GATE-03 assertion false-positive | Tampering | Method B's plan command EXCLUDES `--admin`. The phase's Vitest does NOT need to catch this — the assertion DOES (a `gh pr merge --admin` would succeed, fail the test). |
| GATE-02 PUT fails silently (e.g., body validation reject) → bypass still present, GATE assumes removed | Tampering | Mandatory POST-GET assertion `bypass_actors | length == 0` after Task 05. Combined with the wedge order (GATE-03 already proved enforcement is real BEFORE bypass removal), even a missed GATE-02 reverts to a still-secure state. |

## Assumptions Log

> Claims tagged `[ASSUMED]` are not verified by tool in this session. Planner and discuss-phase should treat these as needing user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh pr merge --merge` (no --admin) exits non-zero with stderr matching `required status check|not mergeable|base branch policy` on a blocked PR | Pitfalls §3, Code Examples Method B | MEDIUM — informed by community discussion #167194 + terraform-provider issue #2317 but not live-tested in this session (would require opening a real test PR). Method A (statusCheckRollup) is the redundant safety net. The planner should treat the specific stderr pattern as "verify on first live run" and broaden the regex if needed. |
| A2 | `bash` is the standard shell for the rollback script | Standard Stack | LOW — ubuntu-latest runners use bash; operator's WSL2 env header confirms bash. |
| A3 | Adding `name:` field to a workflow job changes the check-run's `.name` field to the `name:` value (overriding the jobid for required-check matching) | Pitfalls §7 | LOW — well-established GitHub Actions behavior; informed by GitHub's available-rules doc + live check-runs observation that jobs without `name:` overrides produce check-runs with `.name = jobid`. |
| A4 | The `strict_required_status_checks_policy: true` is the recommended setting | Decisions D-03 / Discretion | LOW — CONTEXT.md marks as discretion; semantic confirmed via official docs (requires up-to-date branch). Recommend YES to match the spirit of "fully enforce required checks at merge time." |
| A5 | `.planning/scratch/` does not need to be pre-created (operator will mkdir during Task 03) | Architecture | LOW — verified live that `.planning/scratch/` does not currently exist. Task 03 must include `mkdir -p .planning/scratch` before writing the probe file. |
| A6 | The `evidence/` directory in Phase 50 is already created and empty | Project Structure | LOW — verified live: `ls .planning/phases/50-cleanup-04-readiness-gate/` showed `50-CONTEXT.md` and `evidence/` (empty). |

## Open Questions

1. **Should the Vitest pin also assert `integration_id=15368` somewhere in the codebase?**
   - What we know: D-13 only mandates pinning the two context strings (jobids). The integration_id is captured to evidence but not pinned in a static-grep test.
   - What's unclear: If the integration_id semantics changed (extremely unlikely — GitHub Actions app id is stable), the static grep wouldn't catch it.
   - Recommendation: Planner discretion. A third `it()` block asserting either (a) the JSON evidence file contains `integration_id=15368` or (b) `docs/v40-repo-config.md` §2 mentions the value — would close the gap. Low priority because the discovery step (Task 02) re-fetches the value each run.

2. **Should the break-glass runbook test exercise the FULL cycle (re-add + use the bypass to merge a throwaway PR + restore), or is the no-op add-remove sufficient (D-08)?**
   - What we know: D-08 mandates the idempotent re-add only (avoid ever having 0 or 2 actors).
   - What's unclear: A pedantic reading of "test the recovery path" would say "use it to actually merge something" — but D-08 explicitly avoids this for risk reasons (and GATE-03 has already proven enforcement is real).
   - Recommendation: Stick with D-08 (idempotent re-add no-op). The proof that PUT bypass-actors works is sufficient; actually using bypass to merge would require opening + closing another throwaway PR which exceeds D-08's scope.

3. **Does the GATE-03 test PR's existence (even briefly) impact any other workflow?**
   - What we know: `.planning/scratch/gate-03-probe.txt` is non-CODEOWNED and doesn't match any workflow's `paths:` filter (verified by inspection — no v40-* or ci.yml workflows trigger on `.planning/scratch/**`).
   - What's unclear: A future workflow could add `.planning/**` to a `paths:` filter and break this isolation.
   - Recommendation: Document the assumption in the SUMMARY.md (Task 06). If a future v4.2+ phase adds workflows triggered by `.planning/**`, this test pattern needs revisiting.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | All tasks (API calls, PR cycle) | ✓ | 2.83.1 (2025-11-13) | — |
| `gh auth` session | All API calls | ✓ | logged in as `tonyrowles` with scopes `repo`, `workflow`, `read:org`, `gist` | — |
| `jq` | Payload construction, evidence assertions | ✓ | 1.7 | — |
| `node` | Vitest test execution | ✓ | v24.11.1 | — |
| `bash` | Rollback script, command orchestration | ✓ | system default (assumed) | — |
| `git` | Branch ops, evidence commits | ✓ | (pre-existing) | — |
| `sed` | Bearer token redaction | ✓ | system default | — |
| Ruleset 17086676 administration access | Every PUT | ✓ | `current_user_can_bypass: "always"` confirmed live | — |
| Phase 49 merge SHA `c0bb37d5...` accessible on origin | integration_id discovery | ✓ | check-runs returned 4 results, all `app.id=15368` | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Project Constraints (from CLAUDE.md)

CLAUDE.md contains a runtime instruction about verifying `AskUserQuestion` responses. This is a runtime rule for interactive sessions and does NOT constrain plan content. The directive remains active for any interactive operator confirmation steps embedded in plans (e.g., Task 03's "confirm test PR closed" if the planner chooses to add an AskUserQuestion gate — but the LOCKED task order does not require interactive prompts).

No other CLAUDE.md directives constrain this phase.

## Sources

### Primary (HIGH confidence)
- **Live API probes against ruleset 17086676 on 2026-06-02** (most load-bearing — these are the empirical anchors for every claim about PUT behavior, integration_id, and ruleset state):
  - `gh api -X PATCH /repos/.../rulesets/17086676 -f name=...` → 404 Not Found (proves PATCH unsupported)
  - `gh api -X PUT /repos/.../rulesets/17086676 -f name="v4.0-main-protection"` → 200 OK; response preserves all 4 rules and 1 bypass actor (proves top-level merge for PUT)
  - `gh api -X PUT /repos/.../rulesets/17086676 --input <rules-only-body>` → response preserves bypass_actors (corroborates partial-body merge)
  - `gh api /repos/.../commits/c0bb37d5.../check-runs --jq '.check_runs[].app.id'` → all `15368` (verifies integration_id is GitHub Actions App ID, not workflow-run databaseId)
  - `gh api /repos/.../rulesets/17086676 --jq '{rules_count, bypass_count, name, enforcement}'` → `{4, 1, "v4.0-main-protection", "active"}` (live baseline matches Phase 49 evidence)
- [GitHub REST API endpoints for rules](https://docs.github.com/en/rest/repos/rules) — official PUT endpoint reference; lists body parameters; documents `required_status_checks` schema (context + integration_id + strict_required_status_checks_policy + do_not_enforce_on_create); confirms NO PATCH endpoint exists.
- [GitHub Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) — confirms `strict_required_status_checks_policy` = "Require branches to be up to date before merging"; context-name format `<job name>`.
- [GitHub Troubleshooting rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules) — "Required status checks do not take workflow, matrix, or event trigger types into account"; informs Pitfall 6 (workflow scope vs required-check expectation).
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-verifier-gate.yml` lines 181-194 — `verifier-gate:` jobid declaration with NO `name:` override (verified by inspection).
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-deps-update.yml` lines 164-179 — `deps-update-gate:` jobid declaration with NO `name:` override (verified by inspection).
- `/home/fatduck/patent-cite-tool/.github/CODEOWNERS` — confirms `.planning/` is non-CODEOWNED (only `/src/`, `/tests/`, `/.github/workflows/`, `/tests/golden/`, `/tests/e2e/test-cases-quarantine.js` are pinned).
- `/home/fatduck/patent-cite-tool/tests/unit/v40-verifier-gate-doc.test.js` lines 1-109 — existing test file structure to extend (D-13).
- `/home/fatduck/patent-cite-tool/.planning/research/PITFALLS.md` Pitfalls 1-3 (lines 13-117, 363, 397, 409, 435) — break-glass mandate and integration_id semantics.
- `/home/fatduck/patent-cite-tool/.planning/phases/49-push-v4-0-integration-pr/evidence/post-merge-ruleset.json` — Phase 49 baseline; confirmed identical to live state at research time.
- `/home/fatduck/patent-cite-tool/.planning/phases/49-push-v4-0-integration-pr/49-INTEGRATION.md` — confirms the `integration_id_candidates: 26860592872` conflation between workflow-run databaseId and app.id.

### Secondary (MEDIUM confidence)
- [Terraform Provider for GitHub Issue #2317 — integration_id semantics](https://github.com/integrations/terraform-provider-github/issues/2317) — corroborates that integration_id is OPTIONAL per the schema but semantically MANDATORY for security; informs Pitfall 4.
- [GitHub Community Discussion #139808 — Creating repository rulesets using REST API](https://github.com/orgs/community/discussions/139808) — recommends `gh api --input <file>` for nested JSON; corroborates the PUT body shape for `required_status_checks` (integration_id=15368 in the example).
- [GitHub Community Discussion #167194 — No available status checks for branch protections](https://github.com/orgs/community/discussions/167194) — informs Pitfall 3 (gh pr merge stderr wording variation).
- [GitHub Repository Rules GA changelog](https://github.blog/news-insights/product-news/github-repository-rules-are-now-generally-available/) — confirms bypass_actors administration is NOT subject to the ruleset's own rules (allows break-glass via API even when UI merge is blocked).

### Tertiary (LOW confidence)
- None — all claims are anchored in primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling pre-existing and version-verified live.
- Architecture (verb, merge semantics, integration_id): HIGH — every load-bearing API behavior was live-tested against the production ruleset endpoint during this research session.
- Context-string matching (jobid vs name:): HIGH — confirmed via cross-reference of YAML files (no `name:` overrides on the two jobs) and live check-runs query (`.name = jobid` when no override).
- Pitfalls (1, 2, 4, 5, 6, 7): HIGH — anchored in live evidence + official docs.
- Pitfall 3 (`gh pr merge` stderr pattern): MEDIUM — informed by community discussion + terraform-provider issue but not live-tested in this session (would require opening a real test PR).
- Validation Architecture: HIGH — three-layer (static / runtime / E2E) coverage maps directly to the 4 SCs with no gaps.
- Security Domain: HIGH — ASVS categories and STRIDE patterns mapped to phase operations explicitly.

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days; GitHub Rulesets API is stable but minor schema additions are possible; planner should re-verify integration_id and PUT semantics if the phase executes beyond this window).

---
*Phase: 50-cleanup-04-readiness-gate*
*Research completed: 2026-06-02*

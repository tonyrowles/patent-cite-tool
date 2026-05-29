# Phase 38: v3.1 cleanup: integration warnings + Nyquist + human-UAT — Research

**Researched:** 2026-05-29
**Domain:** v3.1 tech_debt closure — code-level integration hardening + retroactive Nyquist coverage + live-environment UAT
**Confidence:** HIGH

## Summary

Phase 38 is a strictly mechanical cleanup of three trackable line-items in `.planning/v3.1-MILESTONE-AUDIT.md`: (1) three integration-fragility fixes at specific file:line locations, (2) running an existing GSD skill (`/gsd:validate-phase`) against five phases that already carry draft VALIDATION.md files, and (3) executing five workflow_dispatch / CLI confirmations that prior phases deferred to live environment. No new architecture, no new dependencies, no new requirements. Every deliverable maps back to an existing `tech_debt:` or `human_verification:` entry in the audit YAML.

The existing test scaffolding is exceptional: 678 vitest tests, an established grep-based YAML-assertion pattern (`tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` proves this works — 5 separate `it()` blocks scoping `id: <step>` windows), a mock-`gh` shim pattern (`tests/e2e/scripts/e2e-weekly-digest.test.js:91-115`), and the very constant we need (`QUARANTINE_REPORT_FILENAME`) is already imported successfully by `tests/unit/e2e-report-issue.test.js:43`. The three integration fixes have low novelty risk — they reuse patterns that ship today.

**Primary recommendation:** Land 3 atomic fix commits in the order INT-FIX-01 → INT-FIX-03 → INT-FIX-02 (file-import simplest, YAML-grep extends existing test file, DIGEST-04 has the most design surface). Run all 5 Nyquist invocations as a single bulk plan with 5 explicit `Skill(gsd-validate-phase, N)` calls. Execute 5 UAT confirmations as a shell-block-per-item plan with stdout/stderr captured to a results doc; append outcomes to the audit YAML in-place.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| INT-FIX-01 constant import | Test/Spec runtime | Script export surface | Playwright spec must consume the script-owned constant, not redeclare it. |
| INT-FIX-02 SUMMARY_KEYS drift detection | Build/CI (import-time) | Digest CLI runtime (post-fix: drop or re-purpose) | Real protection already lives in the `import { SUMMARY_KEYS }` statement at line 27 — module load fails on missing export. The runtime check is dead weight. |
| INT-FIX-03 artifact upload gating | CI/CD (GitHub Actions YAML) | None | Pure workflow YAML — no app-code surface. |
| Nyquist stamping (5 phases) | Planning/Validation meta-layer | None — this is workflow housekeeping | Operates on `.planning/phases/*/VALIDATION.md` only; no source-code touch. |
| Human-UAT live confirmations | Live external services (GitHub Actions, gh CLI, Playwright runtime) | Local repo (audit YAML update + evidence doc) | Verifications run on real GitHub; outcomes captured back into the repo. |
| Audit YAML update | Documentation (.planning/) | None | In-place edit of authoritative tracking doc. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Integration Fragility Fixes**
- **DIGEST-04 fix approach:** Repair the runtime drift detection — replace the self-referential check by validating against the actual aggregated metric data (the original intent), so a key drift in `llm-report.js` produces a descriptive throw at runtime rather than silently absent metrics.
- **Regression test per fix:** Add one vitest test per fix asserting the contract:
  - INT-FIX-01: assert `quarantine.spec.js` imports `QUARANTINE_REPORT_FILENAME` from `e2e-report-issue.mjs` and the local re-declaration is gone.
  - INT-FIX-02: assert `validateSummaryKeys` throws when called on real aggregated data missing a `SUMMARY_KEYS` key (synthetic drift).
  - INT-FIX-03: grep-assert that `e2e-nightly.yml`'s upload-artifact `if:` condition includes `steps.quarantine.outcome == 'failure'`.
- **YAML verification:** grep-based vitest assertion (no native GH-workflow test framework). Captures the contract in CI.
- **Commit granularity:** One atomic commit per fix (3 commits total), matching project pattern (e.g. Phase 37 CR-01/CR-02 separate commits).

**Nyquist Coverage Stamping**
- **Plan structure:** One bulk plan covering all 5 phases (32, 33, 34, 35, 37) — `validate-phase` is mechanical; no per-phase planning needed.
- **Invocation:** `Skill(gsd-validate-phase, "<N>")` inline per phase. Each invocation reads the existing draft `VALIDATION.md`, runs the nyquist-auditor to fill gaps and verify coverage, and stamps `nyquist_compliant: true` when satisfied.
- **Gap handling:** If a phase cannot be stamped compliant (genuine gap surfaces), document the gap in the plan's SUMMARY and continue. Do not block Phase 38 — this is a cleanup phase, not a gap-closure phase. Raise unresolved nyquist gaps as new tech_debt for a future milestone.
- **Audit update:** After all 5 stamping attempts complete, overwrite the `nyquist:` block in `.planning/v3.1-MILESTONE-AUDIT.md` with new compliance scores so the audit reflects post-cleanup state.

**Human-UAT Execution**
- **Scope:** Execute 5 dispatchable items live now:
  - Phase 32 CR-04: mid-run phase-cap trip → expect exit code 6
  - Phase 35 (a): `e2e-report-issue.mjs --source triage` against real `triage-report.json` → expect issue with 4 sections + line-1 fingerprint + labels
  - Phase 35 (b): `quarantine-append.mjs` 3× same CONFIRMED finding → expect `quarantine:ready-for-promotion` label on run 3
  - Phase 36 (a): `gh workflow run e2e-nightly.yml -f llm_run_id=<real>` → expect steps 2-5 execute; cron path unaffected
  - Phase 36 (b): `npm run e2e:quarantine` local empty-corpus → expect exit 0, Playwright reports 0 tests
  - Phase 37: `gh workflow run e2e-weekly-digest.yml` → expect commits `reports/weekly-digest-YYYY-WNN.md [skip ci]` + files e2e-digest issue
- **Already confirmed:** Phase 35 (c) — `gh label list` shows triage + quarantine:ready-for-promotion. Mark DONE in audit.
- **Deferred:** Phase 37 live Monday-cron tick — requires clock advance to Monday 07:00 UTC; cannot be triggered manually as a "cron" test. Document as DEFERRED in audit (workflow_dispatch confirmation above is sufficient surrogate for the underlying mechanism).
- **Result recording:** Append outcome under each `human_verification:` item in `v3.1-MILESTONE-AUDIT.md`: `outcome: PASS|FAIL|DEFERRED, verified_at: <ISO timestamp>`.
- **Failure handling:** If a live confirmation FAILS, capture in a REVIEW-like doc + open a follow-up GitHub issue or quick task. Do NOT block Phase 38 (cleanup, not bugfix).

### Claude's Discretion

- Exact test naming, test file placement (under `tests/unit/` or alongside the fix site), and grep regex shape for the YAML assertion.
- Ordering of integration fixes (suggest INT-FIX-01 → INT-FIX-02 → INT-FIX-03, but no hard dependency).
- Exact SUMMARY structure for the bulk Nyquist plan (per-phase status table is recommended).
- Whether to use a single shell loop or 5 explicit Skill invocations for Nyquist stamping (5 explicit invocations preferred for clear logs).

### Deferred Ideas (OUT OF SCOPE)

- **Phase 37 deferred code-review findings** (WR-01..06 + IN-01..04 per commit `7d04130`) — out of scope for Phase 38; goal explicitly limits to 3 warnings + Nyquist + human-UAT.
- **Phase 37 live Monday-cron tick confirmation** — requires clock advance to Monday 07:00 UTC; cannot be triggered as a "cron" event manually. workflow_dispatch surrogate is sufficient verification of the underlying mechanism. Document as DEFERRED in audit.
- **Retroactive integration test for the 14 cross-phase seams catalogued in the audit** — beyond the 3 fragility-flagged seams. Could be a v3.2 hardening item; not Phase 38 scope.
- **gh CLI `--no-prompt` / unattended mode hardening for the UAT scripts** — would make these reproducible by other operators. Not Phase 38 scope; flagged as future ergonomics.

</user_constraints>

<phase_requirements>
## Phase Requirements

No new REQ-IDs. This phase closes existing tech_debt against the following requirements via the integration fragility fixes; the human-UAT track closes "live confirmation" deferrals for the cited requirements without altering their satisfied status.

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAR-01 | `tests/e2e/test-cases-quarantine.js` exists with schema identical to `test-cases.js` | INT-FIX-01 hardens the spec/script seam that consumes this corpus — see §Fix 1 below. Vitest unit-test pattern (`tests/unit/e2e-report-issue.test.js:43`) already proves the cross-file import. |
| QUAR-03 | Quarantine spec runs with `retries: 0` | INT-FIX-03 ensures quarantine failures upload diagnostic artifacts — see §Fix 3 below. Existing YAML grep test (`tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js`) demonstrates the extension target. |
| QUAR-04 | Quarantine spec runs in nightly cron with `continue-on-error: true`; failures file issues | INT-FIX-01 + INT-FIX-03 both reinforce QUAR-04 guarantees (constant sync; failure artifacts upload). |
| DIGEST-04 | `SUMMARY_KEYS` exported; digest validates all keys present (throws on missing) | INT-FIX-02 replaces the self-referential call with a genuine drift detector — see §Fix 2 below. Existing `tests/e2e/scripts/e2e-weekly-digest.test.js:145-165` already validates `validateSummaryKeys` against incomplete inputs. |
| UAT-01..03, RERUN-01..04, TRIAGE-01..06, ISSUE-01..04, QUAR-02, QUAR-05, ORCH-01..03 | (Live-environment portions deferred from prior phases) | Live confirmation track exercises these against real services; existing automated test suites already SATISFY each. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

| # | Directive | Enforcement |
|---|-----------|-------------|
| C1 | **Answer verification after every AskUserQuestion call.** After each AskUserQuestion, the tool result must contain the user's actual selection (option label or free-text). Empty / generic / non-naming results = tool FAILED. | Phase 38 plans MUST NOT call `AskUserQuestion` and assume an answer. The Nyquist track may surface gaps via the auditor — if the auditor's gap-presentation pattern emits an AskUserQuestion the plan must include the fallback (numbered text list + wait for explicit response). |
| C2 | Never fabricate / guess / pick "Recommended" on user's behalf. | Live UAT failures must NOT auto-recover via assumed user consent. If a confirmation fails and a decision is needed, plan stops at a checkpoint. |
| C3 | Use plain-text numbered list fallback when AskUserQuestion result is empty. | Bulk Nyquist plan's per-phase invocation step must surface its decision to the user with a numbered fallback if the upstream skill's interactive gate is non-deterministic. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^3.0.0 | Unit + integration test runner for all 3 regression tests | Already installed; 678 tests; project pattern `[VERIFIED: package.json devDependencies]` |
| `@playwright/test` | 1.60.0 | Quarantine spec runtime (unchanged) | Already installed; INT-FIX-01 only patches the import statement, no Playwright API surface change `[VERIFIED: package.json devDependencies]` |
| Node 22 built-ins | n/a | `node:fs`, `node:child_process` (`execSync`/`spawnSync`), `node:path`, `node:url` for all new tests + UAT runners | Hard-locked zero-new-dep rule per STATE.md `[VERIFIED: .planning/STATE.md L80]` |
| `gh` CLI | 2.83.1 | Workflow dispatch + label/issue inspection for UAT track | Already installed and authenticated `[VERIFIED: gh --version on host]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gsd-validate-phase` skill | (Claude Code skill) | Drives nyquist-auditor over each draft VALIDATION.md | Five inline invocations in the bulk Nyquist plan (one per partial phase). |
| `gsd-nyquist-auditor` agent | (Claude Code subagent) | Spawned by the skill; generates missing tests, returns GAPS FILLED / PARTIAL / ESCALATE | Indirectly — only via the skill; do NOT invoke directly. `[VERIFIED: ~/.claude/agents/gsd-nyquist-auditor.md]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| grep-based YAML assertion | `js-yaml` parse + structural assertion | Adds a runtime dependency; violates zero-new-dep rule. Existing grep pattern (`e2e-nightly-quarantine-yaml.test.js`) is battle-tested and scopes its assertions to `id: <step>` windows for safety against benign step renames. |
| Replace `validateSummaryKeys` call entirely (delete) | Keep + repurpose against real data | Locked decision: REPAIR the runtime check, not delete it. Import-time protection is separate (line 27 ESM import); the runtime guard is the second line of defense the original commit intended. |
| One commit for all 3 fixes | One commit per fix | Locked decision: one commit per fix matches Phase 37 pattern (CR-01 commit `4cac665`, CR-02 commit `16dedf3`); preserves bisectability. |

**Installation:**
```bash
# Zero new packages. Verify env only:
node --version    # expect v22.x
npx vitest --version
gh --version
gh auth status    # for UAT track only
```

**Version verification:**
```bash
# Confirmed against package.json (read 2026-05-29)
vitest: ^3.0.0
@playwright/test: 1.60.0
eslint: 10.4.0
gh CLI host: 2.83.1
```

## Package Legitimacy Audit

> Phase 38 installs ZERO new packages. The zero-new-dep rule is locked in STATE.md "v3.1 Pre-locked Decisions". Audit table is empty by construction.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | N/A — phase adds no packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Phase 38 cleanup ────────────────────────────┐
│                                                                          │
│  Track 1: Integration Fragility Fixes                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ INT-FIX-01  scripts/e2e-report-issue.mjs                        │   │
│  │             └─ exports QUARANTINE_REPORT_FILENAME (line 50)     │   │
│  │                ↓ import                                         │   │
│  │             tests/e2e/specs/quarantine.spec.js                  │   │
│  │             └─ replace local re-declare at line 58              │   │
│  │                ↓ regression test                                │   │
│  │             tests/unit/{name}.test.js                           │   │
│  │             └─ assert NO local "const QUARANTINE_REPORT_FILE…"  │   │
│  │                in spec file source                              │   │
│  │                                                                  │   │
│  │ INT-FIX-02  tests/e2e/lib/llm-report.js                         │   │
│  │             └─ SUMMARY_KEYS (frozen, 7 keys)                    │   │
│  │                ↓ import at module load (ALREADY PROTECTS)       │   │
│  │             scripts/weekly-digest.mjs                           │   │
│  │             └─ replace self-ref check at L355-360               │   │
│  │                with real aggregate-data validation              │   │
│  │                ↓ regression test                                │   │
│  │             tests/e2e/scripts/e2e-weekly-digest.test.js (ext.)  │   │
│  │             └─ synthesize aggregated object missing 1 key →    │   │
│  │                expect runDigest to throw that key name          │   │
│  │                                                                  │   │
│  │ INT-FIX-03  .github/workflows/e2e-nightly.yml                   │   │
│  │             └─ upload-artifact step `if:` at line 304           │   │
│  │                + add `steps.quarantine.outcome == 'failure'`    │   │
│  │                ↓ regression test                                │   │
│  │             tests/e2e/scripts/e2e-nightly-quarantine-yaml.test  │   │
│  │             └─ extend with new it() block grep-asserting        │   │
│  │                quarantine clause inside upload step window      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Track 2: Nyquist Stamping (5 phases)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  for N in 32, 33, 34, 35, 37:                                   │   │
│  │    Skill(gsd-validate-phase, "N")                               │   │
│  │      └─ State A: existing draft VALIDATION.md                   │   │
│  │      └─ Gap analysis → spawn gsd-nyquist-auditor                │   │
│  │      └─ Returns: GAPS FILLED | PARTIAL | ESCALATE               │   │
│  │      └─ Updates frontmatter nyquist_compliant: true (if clean)  │   │
│  │      └─ Appends Validation Audit table                          │   │
│  │  Then: rewrite nyquist: block in v3.1-MILESTONE-AUDIT.md        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Track 3: Human-UAT Live Confirmations (5 dispatchable + 1 done + 1 def)│
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Phase 32 CR-04:  npm run e2e:explore -- (limited iter) → exit 6│   │
│  │  Phase 35 (a):    node scripts/e2e-report-issue.mjs --source    │   │
│  │                     triage --triage-report <real-path>          │   │
│  │  Phase 35 (b):    node scripts/quarantine-append.mjs (×3)       │   │
│  │  Phase 36 (a):    gh workflow run e2e-nightly.yml -f llm_run_id │   │
│  │  Phase 36 (b):    npm run e2e:quarantine                        │   │
│  │  Phase 37:        gh workflow run e2e-weekly-digest.yml         │   │
│  │                                                                  │   │
│  │  Each: capture stdout+stderr+exit → 38-UAT-EVIDENCE.md          │   │
│  │  Each: append to v3.1-MILESTONE-AUDIT.md human_verification[]   │   │
│  │       outcome: PASS|FAIL|DEFERRED, verified_at: <ISO>           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Final: rewrite scores: + gaps: + tech_debt: blocks in audit YAML       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
.planning/phases/38-v3-1-cleanup-integration-warnings-nyquist-human-uat/
├── 38-CONTEXT.md          (exists — locked decisions)
├── 38-RESEARCH.md         (this file)
├── 38-PLAN-XX-*.md        (planner emits 3 plans: integration, nyquist, uat)
├── 38-VALIDATION.md       (planner emits — Phase 38 itself is Nyquist-validated)
├── 38-SUMMARY-XX-*.md     (one per plan; executor emits)
├── 38-UAT-EVIDENCE.md     (Track 3 evidence doc — stdout/stderr/timestamps)
└── 38-VERIFICATION.md     (final verifier emits)

tests/
├── unit/
│   └── (no new file required — extend tests/unit/e2e-report-issue.test.js
│        with INT-FIX-01 spec-source-grep assertion)
└── e2e/scripts/
    ├── e2e-nightly-quarantine-yaml.test.js  (EXTEND for INT-FIX-03)
    └── e2e-weekly-digest.test.js            (EXTEND for INT-FIX-02 throw-on-drift)

.planning/
└── v3.1-MILESTONE-AUDIT.md  (UPDATE in-place: scores, gaps.integration, nyquist, human_verification, tech_debt)
```

### Pattern 1: Spec-source grep regression test (INT-FIX-01)
**What:** Vitest test reads the spec file as text + asserts (a) import statement present, (b) local `const QUARANTINE_REPORT_FILENAME = ...` line ABSENT.
**When to use:** Any "the consumer must import, not redeclare" contract.
**Example:**
```javascript
// Source: pattern derived from tests/unit/e2e-report-issue.test.js:43-46 (existing import)
//          + tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js (file-as-text pattern)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Importing from the spec triggers Playwright env; instead read it as text.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, '../../tests/e2e/specs/quarantine.spec.js');

describe('INT-FIX-01: quarantine.spec.js imports QUARANTINE_REPORT_FILENAME', () => {
  const src = fs.readFileSync(SPEC_PATH, 'utf8');

  it('imports QUARANTINE_REPORT_FILENAME from e2e-report-issue.mjs', () => {
    // The contract: import must reference the script that owns the constant.
    expect(src).toMatch(
      /import\s+\{[^}]*QUARANTINE_REPORT_FILENAME[^}]*\}\s+from\s+['"][^'"]*scripts\/e2e-report-issue\.mjs['"]/
    );
  });

  it('does NOT locally re-declare QUARANTINE_REPORT_FILENAME', () => {
    // Single occurrence (the import) — no `const QUARANTINE_REPORT_FILENAME = ...`
    expect(src).not.toMatch(/const\s+QUARANTINE_REPORT_FILENAME\s*=/);
  });
});
```

### Pattern 2: `if:` condition grep with step-window scoping (INT-FIX-03)
**What:** Extend `e2e-nightly-quarantine-yaml.test.js` with a new it() block that locates the upload-artifact step and asserts the full quarantine clause is in its `if:` line.
**When to use:** Any GH-Actions workflow YAML where a contract is "step Y's gating expression must include condition X".
**Example:**
```javascript
// Source: tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js Y2 (existing window pattern)
it('Y6 — INT-FIX-03: Upload E2E artifacts step gates on quarantine failure', () => {
  // Anchor by step name (upload-artifact has no `id:` today — Phase 38 may
  // optionally add one; if so, switch to id-anchored window for stability).
  const startIdx = yaml.indexOf('- name: Upload E2E artifacts');
  expect(startIdx).toBeGreaterThan(-1);

  // Bound window at next step boundary (Y2 pattern)
  const afterStart = yaml.slice(startIdx);
  const nextStepIdx = afterStart.slice(20).indexOf('- name:');
  const stepBlock = nextStepIdx === -1 ? afterStart : afterStart.slice(0, 20 + nextStepIdx);

  // The quarantine clause MUST be present in this step's if:
  expect(stepBlock).toMatch(/if:\s*always\(\)/);
  expect(stepBlock).toContain("steps.quarantine.outcome == 'failure'");
});
```

### Pattern 3: Synthetic-drift throw assertion (INT-FIX-02)
**What:** Build a synthetic aggregated object missing one SUMMARY_KEY; call the new caller path; expect `validateSummaryKeys` to throw NAMING the key.
**When to use:** Validating that a drift detector actually detects drift.
**Decision required (see Open Questions §1):** What is the "real aggregated data" that should be SUMMARY_KEYS-shaped? Two viable options:
- **Option A (recommended):** Introduce a new `aggregateBySummaryKey({nightlyIssues})` helper that maps `labels[].name ∈ ERROR_CLASSES` to its SUMMARY_KEY (via the existing `classificationToSummaryKey` mapping pattern at `tests/e2e/lib/llm-report.js:142-152`) and tallies per-key. Then `validateSummaryKeys(byKey)` is a meaningful guard — a SUMMARY_KEYS rename would leave keys absent in the tally object.
- **Option B (smaller surface):** Drop `validateSummaryKeys(summaryTally)` entirely + the unused `summaryTally` construction. Document in the commit that import-time protection (the `import { SUMMARY_KEYS }` at line 27) is the sufficient guard, and that `validateSummaryKeys` remains exported for direct test use (already exercised by `e2e-weekly-digest.test.js:145-165`).

**Example (Option A):**
```javascript
// Source: tests/e2e/scripts/e2e-weekly-digest.test.js:145-165 (existing throw-name pattern)
import { aggregate, aggregateBySummaryKey, validateSummaryKeys, runDigest } from '../../../scripts/weekly-digest.mjs';

describe('INT-FIX-02: digest throws naming missing SUMMARY_KEY on aggregated data', () => {
  it('throws naming the missing key when aggregated tally is missing harness_error', () => {
    // Synthetic drift — simulate a future report-schema rename that drops
    // the harness_error key from the tally object construction.
    const driftedTally = { passed: 1, wrong_citation: 0, verifier_disagree: 0,
                           llm_hallucinated_selection: 0, llm_api_error: 0,
                           total_cost_usd: 0 };  // harness_error MISSING
    let caught;
    try { validateSummaryKeys(driftedTally); } catch (e) { caught = e; }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('harness_error');
  });
});
```

### Pattern 4: Live UAT stdout/stderr capture (Track 3)
**What:** Each UAT confirmation is a shell block: `set -o pipefail` → invoke command → capture stdout+stderr+exit to a per-item evidence section.
**When to use:** All 5 live confirmations.
**Example:**
```bash
# UAT-36a: nightly workflow_dispatch
{
  printf '## UAT-36a: e2e-nightly.yml workflow_dispatch\n\n'
  printf '**verified_at:** %s\n\n' "$(date -u +%FT%TZ)"
  printf '**command:** gh workflow run e2e-nightly.yml -f llm_run_id=<RUN_ID>\n\n'
  printf '```\n'
  gh workflow run e2e-nightly.yml -f llm_run_id="${LLM_RUN_ID}" 2>&1
  printf '\n'
  # Then capture the resulting run id + status
  RUN_ID=$(gh run list --workflow=e2e-nightly.yml --limit 1 --json databaseId -q '.[0].databaseId')
  gh run view "$RUN_ID" --json status,conclusion,jobs 2>&1
  printf '```\n\n'
} >> .planning/phases/38-*/38-UAT-EVIDENCE.md
```

### Anti-Patterns to Avoid
- **Modifying impl while writing the regression test (INT-FIX-02 hazard):** The DIGEST-04 fix is the impl change; its test must verify the new behavior against the new impl. Do NOT skip writing the test because "the impl change is self-evidently correct."
- **Generic-error assertions:** `expect(...).toThrow()` is insufficient — assert the THROWN MESSAGE NAMES the missing key (pattern already established at `e2e-weekly-digest.test.js:156-164`).
- **Anchoring grep on step name when an `id:` exists:** The upload-artifact step currently has no `id:`; adding one in Phase 38 (e.g., `id: upload-artifacts`) would let the YAML test scope by stable id (Y2 pattern), not the renamable `- name:` line. This is a Claude-discretion improvement worth making.
- **Skipping Nyquist gaps silently:** Per locked decision, document any unresolved gap in the bulk-Nyquist plan's SUMMARY + raise as new tech_debt. Do not auto-flip `nyquist_compliant: true` if the auditor returns PARTIAL/ESCALATE without resolution.
- **Auto-decide on AskUserQuestion empty result:** CLAUDE.md C1 — if the auditor's interactive gate returns empty, fall back to numbered text list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing for if-condition assertion | js-yaml + AST walk | grep-against-text + step-window scoping | Already proven pattern in `e2e-nightly-quarantine-yaml.test.js`; zero-dep rule forbids adding parser. |
| Mock GitHub Actions runner for INT-FIX-03 | act / nektos | Grep-based YAML contract test | Phase 38 verifies the CONDITION TEXT, not runtime execution; act adds heavy dependency + flakiness. Real CI exercises the actual condition on the next nightly run. |
| Schema validator for synthetic-drift fixture (INT-FIX-02) | ajv / zod / @valibot | Inline object-literal with one key removed | The drift case is one missing key; full schema validation is overkill and adds dependency. |
| New skill / agent to drive bulk Nyquist | Custom wrapper script | Five inline `Skill(gsd-validate-phase, N)` calls | Project standard; per locked decision; 5 explicit calls give clear logs vs. a loop. |
| Bespoke result-recording structure for UAT evidence | New JSON schema | Append-only markdown + ISO timestamp + `outcome:` line | Matches existing audit YAML `human_verification[]` shape; no parsing layer required. |

**Key insight:** Every fix in this phase already has a precedent in the repo. The work is mechanical extension of patterns, not invention. Where a Claude-discretion choice exists (e.g., adding `id: upload-artifacts` for stable YAML grep scoping), prefer the choice that aligns to existing convention (`id: quarantine`, `id: regression`, `id: smoke` already use this pattern).

## Common Pitfalls

### Pitfall 1: INT-FIX-01 — test passes but spec still has stale const after merge conflict
**What goes wrong:** The regression test reads the spec file at test-runtime. A merge conflict that reintroduces the local `const` could ship if the test isn't run on PR.
**Why it happens:** The repo doesn't gate PRs on `test:src` (only nightly runs full vitest), so the regression test is only as good as the contributor's local discipline.
**How to avoid:** Ensure the test is in the `npm run test:src` set (it will be, by directory placement under `tests/unit/` or `tests/e2e/scripts/`). Document in commit message so future bisects flag the test as the contract owner.
**Warning signs:** A second `const QUARANTINE_REPORT_FILENAME` line reappearing in spec source.

### Pitfall 2: INT-FIX-02 Option A — `aggregateBySummaryKey` must map ERROR_CLASSES → SUMMARY_KEYS correctly
**What goes wrong:** The errorClass label values (e.g., `WRONG_CITATION`, `LLM_API_ERROR`) don't have a 1:1 correspondence with SUMMARY_KEYS (e.g., `wrong_citation`, `llm_api_error`). A naïve `key.toLowerCase()` will work for 6 of 7 keys but FAIL for `total_cost_usd` (not derived from an errorClass at all).
**Why it happens:** `total_cost_usd` is metric data, not classification data. The synthetic tally needs to seed it from `monthlyTotal(readLedger(...))` or unconditionally zero — it's not a count.
**How to avoid:** Reuse the existing `classificationToSummaryKey()` mapping (already at `tests/e2e/lib/llm-report.js:142-152`) and special-case `total_cost_usd` to the cost-line value. See Open Questions §1 for whether the planner should externalize this mapping for reuse.
**Warning signs:** Test passes for 6 keys, fails when synthetic drift removes `total_cost_usd`.

### Pitfall 3: INT-FIX-03 — `if: always() && (...)` clause grouping
**What goes wrong:** The YAML condition is a parenthesised expression: `if: always() && (steps.smoke.outcome == 'failure' || ... || steps.fault_injection.outcome == 'failure')`. Adding the quarantine clause OUTSIDE the parens (`... || steps.fault_injection... ) || steps.quarantine...`) changes operator precedence and may break the always() short-circuit.
**Why it happens:** GH Actions `if:` uses `&&` higher-precedence than `||`; the parens are load-bearing.
**How to avoid:** Add the new clause INSIDE the existing parens: `... || steps.fault_injection.outcome == 'failure' || steps.quarantine.outcome == 'failure')`. The regression test should grep for the closed paren + quarantine clause being inside.
**Warning signs:** Workflow run page shows the upload step skipping when only quarantine failed, or running on every job regardless of outcome.

### Pitfall 4: Nyquist auditor escalates a "real" gap (e.g., Phase 32 UAT manual-only items)
**What goes wrong:** Phase 32's three UAT items are manual-only by design (live subscription + interactive `claude -p`). The auditor may mark them ESCALATE because they have no automated command — but they ARE in the Manual-Only Verifications section of the draft VALIDATION.md, which is the legitimate sink.
**Why it happens:** The auditor's escalation rule is "can fail after 3 debug iterations" — but a manual-only entry doesn't enter the debug loop at all; the gap-classifier should mark it COVERED-MANUAL upstream.
**How to avoid:** Before each `Skill(gsd-validate-phase, N)` invocation, the plan task should note that manual-only entries are PRE-CLASSIFIED and the auditor should not be asked to generate tests for them. If the auditor escalates anyway, follow the locked decision: document in the plan's SUMMARY + continue.
**Warning signs:** Auditor returns ESCALATE for items already in the Manual-Only Verifications table.

### Pitfall 5: UAT-36b empty-corpus expectation
**What goes wrong:** `npm run e2e:quarantine` invokes `playwright test ... --pass-with-no-tests`. The expected outcome is exit 0 + Playwright reports `0 tests`. If TEST_CASES_QUARANTINE has entries at UAT-time (e.g., a CONFIRMED finding was appended between Phase 36 and Phase 38), the test will actually run.
**Why it happens:** The corpus is mutable (quarantine-append.mjs writes to it).
**How to avoid:** Before UAT-36b, check `cat tests/e2e/test-cases-quarantine.js` to verify the corpus state. If non-empty, document that and adjust the expectation (e.g., "exits 0 with N tests, all non-gating").
**Warning signs:** UAT-36b takes >10s — corpus is non-empty.

### Pitfall 6: UAT result-recording race against audit YAML
**What goes wrong:** Two UAT steps running in parallel both edit `.planning/v3.1-MILESTONE-AUDIT.md` and clobber each other's `outcome:` entries.
**Why it happens:** The plan should be sequential, not parallel, for the UAT track. (Locked decision recommends 5 explicit invocations + the result-recording is append-only, but YAML structure means it's still a single file.)
**How to avoid:** Plan the UAT track as a single-wave sequential set of tasks. Append-only writes via `node -e` or single `>>` redirection per task.
**Warning signs:** Audit YAML has duplicate `human_verification:` entries or malformed indentation.

### Pitfall 7: `gh workflow run` is silent on auth failure
**What goes wrong:** If `gh auth status` is stale, `gh workflow run` may exit 0 but the run never actually triggers; the developer sees a clean local exit and assumes success.
**Why it happens:** `gh` returns 0 for "dispatch accepted" even before the workflow run is created in some edge cases (token scopes, network glitch).
**How to avoid:** After every `gh workflow run` invocation in UAT, immediately run `gh run list --workflow=<name> --limit 1 --json databaseId,status,createdAt` and assert the most-recent run is < 60s old. Capture the run id in the evidence doc.
**Warning signs:** Evidence doc has a dispatch command + exit 0 but no follow-up run id.

## Code Examples

Verified patterns from in-repo sources:

### Spec-source grep (INT-FIX-01)
```javascript
// Source: tests/unit/e2e-report-issue.test.js:43-46 + tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.resolve(__dirname, '../../tests/e2e/specs/quarantine.spec.js');
const src = fs.readFileSync(SPEC, 'utf8');
expect(src).toMatch(
  /import\s+\{[^}]*QUARANTINE_REPORT_FILENAME[^}]*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/scripts\/e2e-report-issue\.mjs['"]/
);
```

### Throw-with-key-name pattern (INT-FIX-02)
```javascript
// Source: tests/e2e/scripts/e2e-weekly-digest.test.js:156-164 (existing test, already passing)
it('names the missing key (not a generic error)', () => {
  const obj = Object.fromEntries(SUMMARY_KEYS.map(k => [k, 0]));
  const missingKey = 'harness_error';
  delete obj[missingKey];
  let caught;
  try { validateSummaryKeys(obj); } catch (e) { caught = e; }
  expect(caught).toBeDefined();
  expect(caught.message).toContain(missingKey);
});
```

### Step-window YAML scope (INT-FIX-03)
```javascript
// Source: tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js Y2 (verbatim window pattern)
const startIdx = yaml.indexOf('id: quarantine');
const afterStart = yaml.slice(startIdx + 'id: quarantine'.length);
const nameBoundary = afterStart.indexOf('- name:');
const idBoundary = afterStart.indexOf('id:');
const boundaries = [nameBoundary, idBoundary].filter(i => i !== -1);
const endIdx = boundaries.length ? Math.min(...boundaries) : -1;
const stepBlock = endIdx === -1 ? afterStart : afterStart.slice(0, endIdx);
expect(stepBlock).toContain("steps.quarantine.outcome == 'failure'");
```

### Mock-gh shim for UAT-37 (if isolated test desired before live run)
```bash
# Source: tests/e2e/scripts/e2e-weekly-digest.test.js:91-115 (mock-gh shim already in test suite)
# Confirms the digest can run end-to-end with synthetic gh; live run then validates the same flow with the real binary.
```

### gh workflow_dispatch + run-id capture (UAT Track)
```bash
# Source: gh CLI 2.83.1 (confirmed installed at /usr/bin/gh)
gh workflow run e2e-nightly.yml -f llm_run_id="${LLM_RUN_ID}"
sleep 5  # GH API has ~1-3s eventual consistency on run-list
gh run list --workflow=e2e-nightly.yml --limit 1 --json databaseId,status,createdAt,event
# event: "workflow_dispatch" confirms surrogate path
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Self-referential SUMMARY_KEYS check | Validate against actual aggregated data | INT-FIX-02 (this phase) | Restores intended drift detection; aligns runtime with import-time guards. |
| Local re-declare of cross-file constant | Direct import of exported constant | INT-FIX-01 (this phase) | Eliminates one-sided-rename silent-failure class. |
| Upload-artifact step skipping quarantine failures | Upload-artifact gates on all 4 step outcomes | INT-FIX-03 (this phase) | Quarantine debug artifacts now available for nightly investigation. |
| 5 phases with draft `nyquist_compliant: false` | All 6 phases stamped (target) | Track 2 bulk Nyquist | Closes the v3.1 formal-coverage gap; future milestones inherit clean baseline. |
| 7 outstanding live confirmations | 5 confirmed live + 1 already done + 1 documented-deferred | Track 3 UAT | Audit YAML reflects post-cleanup state; no more "deferred verification" items dragging into v3.2. |

**Deprecated/outdated:** None — Phase 38 introduces no new state of the art; it brings existing state to the standard already practiced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | INT-FIX-02 Option A (`aggregateBySummaryKey` helper) is preferred over Option B (drop the dead check). The CONTEXT.md decision explicitly says "repair the runtime drift detection" — Option B drops it. | §Pattern 3 | Implementing Option B silently violates locked decision. Surface to user at plan-check time. **[ASSUMED]** that "repair" forbids "drop"; the discuss-phase wording may permit either interpretation. |
| A2 | The 5 partial-Nyquist phases (32, 33, 34, 35, 37) each have a draft VALIDATION.md whose Per-Task Verification Map already enumerates tests — so the auditor's gap analysis will be SMALL, not large. | §Track 2 | If a phase's draft is sparse, the auditor may generate many new tests, extending Phase 38 timeline. **[VERIFIED: read of phase 32, 33, 34, 35, 37 draft VALIDATION.md files 2026-05-29]** — A2 confirmed; only Phase 32 has tasks marked "Filled in during planning". |
| A3 | The `gsd-nyquist-auditor` agent operates on draft VALIDATION.md as State A (audit existing), not State B (reconstruct). | §Track 2 | If the skill misclassifies State, it may overwrite a draft instead of patching it. **[VERIFIED: ~/.claude/get-shit-done/workflows/validate-phase.md lines 38-45]** — State A is triggered by VALIDATION_FILE non-empty; confirmed for all 5 partial phases. |
| A4 | `gh workflow run <name>` exit 0 reliably maps to "dispatch accepted by GitHub" provided `gh auth status` is fresh. | §Pitfall 7 | Auth staleness produces silent failure (see Pitfall 7). Mitigation is in the recommended UAT command pattern (post-dispatch `gh run list`). **[ASSUMED]** — based on `gh` 2.83.1 behavior; no contradicting evidence found but not exhaustively tested. |
| A5 | The `aggregate()` return shape (`{findingsCount, breakdown, top3, quarantineGrowth}`) is NOT directly compatible with `validateSummaryKeys` — a new helper (`aggregateBySummaryKey`) is required for Option A. | §Pattern 3, §Pitfall 2 | If a planner mistakes `aggregate()` output as already SUMMARY_KEYS-shaped, the fix won't compile. **[VERIFIED: scripts/weekly-digest.mjs lines 98-140 read 2026-05-29]**. |
| A6 | Adding `id: upload-artifacts` to the upload step in INT-FIX-03 is acceptable (improves YAML test stability per existing `id: quarantine`, `id: regression` convention). | §Anti-Patterns | If the maintainer prefers minimal-diff fixes, this adds an unrelated line. Surface as a discretion question if needed. **[ASSUMED]** — convention is to anchor on `id:`, so this aligns; the discussion-phase Locked Decision didn't address it. |
| A7 | Phase 35 (a) live UAT requires an existing real `triage-report.json` artifact path. | §Track 3 | If no recent triage-report exists, UAT-35a cannot run. CONTEXT.md "Specific Ideas" notes the planner should source one from a prior nightly artifact. **[ASSUMED]** — verifiable at plan/execute time, not now. |

## Open Questions

1. **INT-FIX-02 Option A vs Option B** — The locked decision says "repair the runtime drift detection by validating against the actual aggregated metric data (the original intent)". Option A (build a SUMMARY_KEYS-shaped aggregation helper) literally satisfies that. Option B (drop the dead check entirely + lean on import-time protection) is technically possible but arguably violates "repair, not delete". Recommend planner present this as a plan-check decision point.
   - What we know: locked wording favors A; import-time protection (line 27 `import { SUMMARY_KEYS }`) already exists.
   - What's unclear: whether a new helper introduces enough surface to deserve its own task vs. fitting into INT-FIX-02 inline.
   - Recommendation: implement Option A as a small named helper export (`aggregateBySummaryKey`) co-located in `weekly-digest.mjs`; ~30 LOC; reuses existing `ERROR_CLASS_SET` membership pattern.

2. **Whether to add `id: upload-artifacts` to the upload step (INT-FIX-03 Claude discretion)** — stabilizes the YAML grep test against future step renames; matches existing convention but is an extra line in the diff.
   - What we know: every other step in `e2e-nightly.yml` that the test inspects has an `id:` (quarantine, regression, smoke, fault_injection).
   - What's unclear: maintainer preference for minimal vs. consistent diffs.
   - Recommendation: include the `id:` addition; mention in commit body as "test-stability nicety, aligns with surrounding step convention".

3. **Whether UAT evidence doc lives at `.planning/phases/38-.../38-UAT-EVIDENCE.md` or under a separate `reports/` location** — the CONTEXT.md says "append outcome under each `human_verification:` item in `v3.1-MILESTONE-AUDIT.md`" but also "If a live confirmation FAILS, capture in a REVIEW-like doc". So at minimum the audit YAML carries the outcome line; the evidence (stdout/stderr) needs a home.
   - What we know: phase docs go under the phase dir.
   - What's unclear: if evidence should also commit to a top-level `reports/` for discoverability.
   - Recommendation: write evidence to `.planning/phases/38-.../38-UAT-EVIDENCE.md`; do NOT duplicate under `reports/` (which is reserved for the weekly-digest output per DIGEST-03).

4. **Whether the Phase 38 plan itself runs `/gsd:validate-phase 38` at the end** — Phase 38 has its own VALIDATION.md to author. The locked decision applies the skill to phases 32-37, not 38; but symmetrically, Phase 38 should not ship with `nyquist_compliant: false`.
   - What we know: Phase 36 already proves the "stamped at write-time, no retro skill run needed" path is acceptable when the VALIDATION.md is authored to the standard.
   - What's unclear: whether the planner should pre-stamp Phase 38's VALIDATION.md or call the skill at the end.
   - Recommendation: planner authors `38-VALIDATION.md` to the same standard as Phase 36 (which is `nyquist_compliant: true` at draft time); no retro skill run needed for Phase 38 itself.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All 3 fixes + tests + UAT runners | ✓ | v22.x (per package.json `node-version: 22`) | — |
| vitest | INT-FIX-01/02/03 regression tests | ✓ | ^3.0.0 | — |
| @playwright/test | Quarantine spec (unchanged) | ✓ | 1.60.0 | — |
| `gh` CLI | UAT track (Phase 35a/b, 36a, 37) | ✓ | 2.83.1 | — |
| `gh` authenticated session | UAT track | ✓ (assumed; per `gsd-validate-phase` doc the user pattern is interactive) | — | Run `gh auth status` at plan-execute time; if stale, plan stops at checkpoint per CLAUDE.md C1/C2. |
| Real `triage-report.json` | UAT Phase 35a | unknown | — | Sourced at execute time from most recent nightly artifact or `tests/e2e/fixtures/` if a v3.1-era one was preserved. Planner should add a checkpoint. |
| GitHub Actions runners | UAT 36a, 37 | ✓ (live GH) | — | — |
| GitHub Discussions | UAT 37 (digest publish path) | unknown | — | Falls back to e2e-digest issue if Discussions disabled (DIGEST-03 contract; auto-resolved by `resolvePublishMode`). |

**Missing dependencies with no fallback:** None — every blocker has a fallback or a checkpoint.
**Missing dependencies with fallback:** Triage-report sourcing (planner adds checkpoint:human-verify before UAT-35a).

## Validation Architecture

> Phase 38 itself must be Nyquist-validated. `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.x (unit + spawnSync integration); zero new deps |
| Config file | `vitest.config.chrome.js` (existing) |
| Quick run command | `vitest run tests/unit/<new-int-fix-01-test>.test.js` (or extended `tests/unit/e2e-report-issue.test.js`) |
| Full suite command | `npm run test:src && npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INT-FIX-01 | quarantine.spec.js imports QUARANTINE_REPORT_FILENAME from script + no local redeclare | unit (file-as-text grep) | `vitest run tests/unit/e2e-report-issue.test.js` (extended) OR new test file | ❌ Wave 0 — extend existing test file or new |
| INT-FIX-02 | validateSummaryKeys throws naming key on aggregated-data drift | unit (synthetic-drift) | `vitest run tests/e2e/scripts/e2e-weekly-digest.test.js` (extended) | ❌ Wave 0 — add it() block to existing file |
| INT-FIX-03 | Upload step `if:` includes `steps.quarantine.outcome == 'failure'` inside the parenthesised clause | unit (file-as-text grep w/ step-window) | `vitest run tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` (extended) | ❌ Wave 0 — add it() block to existing file |
| Track 2 (Nyquist stamping) | All 5 phases stamped `nyquist_compliant: true` OR documented gap | meta (per-phase skill invocation) | Manual: `/gsd:validate-phase 32` … 37 | Wave 0 — no test infra needed; skill is the verification |
| Track 3 (UAT live) | 5 confirmations PASS + 1 already DONE + 1 DEFERRED | manual-only | Live: `gh workflow run …`, `npm run …`, `node scripts/…` | Wave 0 — N/A (manual) |
| Audit update | `.planning/v3.1-MILESTONE-AUDIT.md` reflects post-cleanup state (scores, gaps.integration, nyquist, human_verification, tech_debt) | doc-grep | New: `vitest run tests/unit/audit-v3.1-coherence.test.js` (optional — may be overkill; planner discretion) | Wave 0 — optional |

### Sampling Rate
- **Per task commit:** `vitest run <file-just-touched>` (typical < 10s)
- **Per wave merge:** `npm run test:src && npm run lint`
- **Phase gate:** Full suite green before `/gsd:verify-work`; all 3 INT-FIX regression tests green; all 5 Nyquist stamping outcomes documented; UAT evidence committed.

### Wave 0 Gaps
- [ ] **Extend** `tests/unit/e2e-report-issue.test.js` (preferred — already imports QUARANTINE_REPORT_FILENAME at L43) with an INT-FIX-01 `describe()` block reading the spec file as text. **OR** new file `tests/unit/quarantine-spec-import-contract.test.js`.
- [ ] **Extend** `tests/e2e/scripts/e2e-weekly-digest.test.js` with INT-FIX-02 throw-on-aggregated-drift `it()` block. (Existing tests at L145-165 are the template — the new test asserts the throw in the post-fix call path, not just on the helper in isolation.)
- [ ] **Extend** `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` with INT-FIX-03 `it()` block (`Y6` — upload-artifacts step window).
- [ ] (Optional, Claude discretion) Add `id: upload-artifacts` to the upload-artifact step in `.github/workflows/e2e-nightly.yml` for grep-test stability.
- [ ] No framework install needed.

## Security Domain

> `security_enforcement` config not explicitly set in `.planning/config.json` workflow block. Phase 38 is a cleanup phase that touches existing code paths whose threat models are already established (T-29-02-*, T-35-03-*, T-37-02-*). No new attack surface introduced.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 38 invokes `gh` CLI which uses pre-existing user auth; no new auth code. |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — workflow_dispatch permissions are unchanged. |
| V5 Input Validation | yes (existing) | `sanitizeCaseId()` at `e2e-report-issue.mjs:54-55` already validates inputs; INT-FIX-01 only renames a constant import, no new input surface. |
| V6 Cryptography | no | N/A |
| V14 Configuration | yes (existing) | INT-FIX-03 changes a workflow `if:` clause — does not weaken any access control. The condition currently OMITS quarantine; adding it broadens artifact upload, not narrows access. |

### Known Threat Patterns for Phase 38 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Constant rename on one side only (silent zero filings) | Tampering | INT-FIX-01: import the source-of-truth, breaks the dual-source class entirely. |
| Schema drift in summary contract (silent zero metrics) | Tampering / Information Disclosure | INT-FIX-02: runtime validation on real aggregated data; import-time check unchanged. |
| Lost diagnostic artifacts (debug-info denial) | Information Disclosure (via absence) | INT-FIX-03: artifact upload covers all failure outcomes. |
| GraphQL injection via Discussion title (T-37-02-04) | Tampering | Already mitigated at `weekly-digest.mjs:319-321` (no string concat into query); Phase 38 does not touch this path. |
| Shell injection in mock-gh transcript (test-side) | Tampering | Test fixtures use `>>` append with controlled inputs; no user input flows in. |

## Sources

### Primary (HIGH confidence)
- `.planning/v3.1-MILESTONE-AUDIT.md` (2026-05-29 audit) — authoritative tech_debt inventory.
- `.planning/phases/38-.../38-CONTEXT.md` — locked decisions.
- `.planning/REQUIREMENTS.md` — REQ-ID definitions (UAT, RERUN, TRIAGE, ISSUE, QUAR, ORCH, DIGEST).
- `.planning/STATE.md` — v3.1 Pre-locked Decisions (zero new deps, fingerprint immutability).
- `~/.claude/skills/gsd-validate-phase/SKILL.md` — skill contract.
- `~/.claude/get-shit-done/workflows/validate-phase.md` — workflow steps + State A/B/C semantics.
- `~/.claude/agents/gsd-nyquist-auditor.md` — auditor agent contract + return formats.
- `~/.claude/get-shit-done/templates/VALIDATION.md` — VALIDATION.md template.
- `scripts/e2e-report-issue.mjs:50` — `QUARANTINE_REPORT_FILENAME` export.
- `scripts/weekly-digest.mjs:78,355-360` — `validateSummaryKeys` + self-referential call site.
- `tests/e2e/lib/llm-report.js:123-152` — `SUMMARY_KEYS` definition + `classificationToSummaryKey` mapping.
- `tests/e2e/specs/quarantine.spec.js:50-58` — comment block + local re-declare line.
- `tests/unit/e2e-report-issue.test.js:43,877-885` — existing successful import + assertion pattern.
- `tests/e2e/scripts/e2e-nightly-quarantine-yaml.test.js` — verbatim grep+window assertion template.
- `tests/e2e/scripts/e2e-weekly-digest.test.js:145-165` — verbatim throw-name assertion template.
- `.github/workflows/e2e-nightly.yml:303-313` — upload-artifact step with INT-FIX-03 target.
- `.github/workflows/e2e-weekly-digest.yml:21-25` — `workflow_dispatch: {}` for UAT-37.
- `.planning/phases/36-.../36-VALIDATION.md` — template for "what good looks like" (the one `nyquist_compliant: true` file).
- `.planning/phases/{32,33,34,35,37}-.../*-VALIDATION.md` — five draft VALIDATION.md to stamp.
- `package.json` — devDependencies confirm vitest ^3.0.0, @playwright/test 1.60.0, eslint 10.4.0.
- `CLAUDE.md` — AskUserQuestion verification rule.
- `gh --version` on host — 2.83.1.

### Secondary (MEDIUM confidence)
- (none — all claims trace to in-repo source or in-environment tools)

### Tertiary (LOW confidence)
- (none)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library verified in `package.json` + tool versions confirmed on host.
- Architecture: HIGH — every fix has a verbatim in-repo pattern; the three regression tests are mechanical extensions of files that already exist and pass.
- Pitfalls: HIGH for INT-FIX-01/03 + Nyquist (verified against existing skill workflow + auditor contract); MEDIUM for INT-FIX-02 because the planner has a true design choice (Option A vs B) flagged as Open Question §1.
- Track 3 (UAT): HIGH for the dispatch mechanism (gh CLI verified); MEDIUM for evidence path (Open Question §3) and for Phase 35a's triage-report sourcing (Assumption A7).
- Security: HIGH — phase strictly tightens existing guards (drift detection, artifact upload) and renames a constant on one side; no new attack surface.

**Research date:** 2026-05-29
**Valid until:** 2026-06-12 (14 days — short horizon because (a) `gh` CLI behavior is stable, (b) repo file:line references are tied to a specific tree state; any merge to `main` may shift line numbers).

# Architecture Research

**Domain:** Human-report-driven, LLM-assisted auto-fix pipeline (v6.1)
**Researched:** 2026-06-17
**Confidence:** HIGH — all findings sourced directly from production code and committed planning docs

---

## System Overview

```
  INBOUND SIGNAL (sole fix-candidate source)
  ─────────────────────────────────────────────────────────────────────
  Extension users
      │  POST /report (Bearer PROXY_TOKEN)
      ▼
  Cloudflare Worker (pct.tonyrowles.com)
      │  buildKvRecord() allowlist strip  ·  SHA-256 fingerprint  ·  15-min dedup
      │  IP rate-limit (rl:{ip}, 5/60s)  ·  Discord triage card (best-effort)
      ▼
  BUG_REPORTS KV namespace
  report:{fingerprint}:{timestamp}  (90-day TTL)

  ─────────────────────────────────────────────────────────────────────
  TRIAGE LAYER (new in v6.1)
  ─────────────────────────────────────────────────────────────────────
  scripts/ingest-reports.mjs   ← polls KV via wrangler --remote (like review-reports.mjs)
      │
      ├─► Auto-triage classifier
      │       real citation bug?
      │         YES → PROMOTE (write promoted:{fp}:{ts} to BUG_REPORTS, or file GitHub Issue)
      │         NO  → mark status:noise|dupe|user-error in KV _review field
      │
      └─► [HUMAN GATE 1] manual-promote escape hatch
              node scripts/ingest-reports.mjs promote <fp> <ts>
              (maintainer runs locally; bypasses auto-triage verdict)

  ─────────────────────────────────────────────────────────────────────
  CANDIDATE STATE (new in v6.1) — lives as GitHub Issue
  ─────────────────────────────────────────────────────────────────────
  Promoted reports → GitHub Issue (label: report-fix-candidate)
      body: fingerprint, KV key, patent number, selection, returned citation,
            confidence tier, error log, maintainer note
      State transitions via labels:
        report-fix-candidate  →  fix-in-progress  →  auto-fix:verified  →  CLOSED

  ─────────────────────────────────────────────────────────────────────
  ANALYSIS + FIX GENERATION (new in v6.1)
  ─────────────────────────────────────────────────────────────────────
  .github/workflows/v61-report-fix.yml
      Trigger: issues.labeled == 'report-fix-candidate'
      │
      ├─ Fetch full KV record via wrangler --remote (has errorLog, xpathNode, etc.)
      ├─ LLM analysis via invokeAnthropicSdkWithLedger
      │       system: REPORT_FIX_SCAFFOLD (targets matching.js / position-map-builder.js)
      │       user: KV record fields wrapped in <report_data> XML tags (prompt-injection defense)
      ├─ Candidate diff output  (≤ 200 LOC src/ per existing diff-guard)
      ├─ Ledger write → commit to main [skip ci]  (two-commit-split pattern)
      └─ peter-evans/create-pull-request@v8  (draft, branch: auto-fix/<issue>-<fp8>)

  ─────────────────────────────────────────────────────────────────────
  REGRESSION SAFETY GATE (existing, reused)
  ─────────────────────────────────────────────────────────────────────
  .github/workflows/v40-verifier-gate.yml  (MODIFIED — scope-gate extended to auto-fix/* from
                                            both 'triage'-sourced AND 'report-fix-candidate'-sourced issues)
      Trigger: pull_request opened/synchronize on auto-fix/* branches
      │
      ├─ diff-guard (forbidden paths, ≤200 LOC src/, ≤50 LOC tests/, TEST_CASES count)
      ├─ verifier-gate job: 3× affected-case runs at Tier A/B  (verify-single-case.mjs)
      │       verifier files pinned to origin/main
      │       regression: 75-case golden corpus + test-cases-quarantine.js
      ├─ regression-suite job: full 75-case Playwright suite (parallel)
      └─ ready-flip: draft → ready-for-review + auto-fix:verified label

  ─────────────────────────────────────────────────────────────────────
  [HUMAN GATE 2] MERGE GATE
  ─────────────────────────────────────────────────────────────────────
  Maintainer reviews ready-for-review PR
      verifier-gate: PASS + regression: CLEAN → maintainer approves + merges
      (branch-protection ruleset 17086676 on main: required status check "verifier-gate")

  ─────────────────────────────────────────────────────────────────────
  POST-MERGE (existing, reused)
  ─────────────────────────────────────────────────────────────────────
  .github/workflows/v40-auto-promote.yml  (MODIFIED — triple-gate extended to accept
                                           'report-fix-candidate' as the triage-source leg)
      Trigger: pull_request closed + auto-fix:verified label
      │
      ├─ assertTripleGate (verified label + merged + report-fix-candidate source)
      ├─ runPromote → quarantine → golden corpus promotion
      └─ auto-promote/* PR → [human merges tests/test-cases.js mutation]
```

---

## Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| Cloudflare Worker `POST /report` | EXISTING (unmodified) | Receives extension reports; fingerprints, deduplicates, writes to BUG_REPORTS KV; Discord notify |
| `BUG_REPORTS` KV namespace | EXISTING (unmodified) | Durable store for `report:{fp}:{ts}` records (90-day TTL); `_review.status` field carries triage state |
| `scripts/review-reports.mjs` | EXISTING (unmodified) | Maintainer CLI to read/filter/export KV records; writes `_review.status` back |
| `scripts/ingest-reports.mjs` | NEW | Polls KV for new reports; runs auto-triage classifier; auto-promotes real bugs OR marks noise; exposes `promote` subcommand for manual-promote escape hatch |
| Auto-triage classifier (inside ingest-reports.mjs) | NEW | Heuristic-first classification: inaccurate_citation + confidence-tier red/yellow + non-empty errorLog → likely real bug; `no_match` with no errorLog → possible user error; dupe detection via duplicate_count |
| GitHub Issue (report-fix-candidate label) | NEW | Candidate state store: one issue per promoted report; body carries fingerprint, KV key, diagnostic fields; label transitions track pipeline state |
| `.github/workflows/v61-report-fix.yml` | NEW | Issue-triggered LLM analysis + fix generation; fetches full KV record; calls LLM with REPORT_FIX_SCAFFOLD; produces auto-fix branch + draft PR; two-commit ledger split |
| `REPORT_FIX_SCAFFOLD` in fix-prompt-builder.js | NEW | Prompt scaffold targeting matching.js / position-map-builder.js; XML-wraps KV diagnostic fields as `<report_data>`; constrained to FORBIDDEN_PATHS diff-guard |
| `v40-verifier-gate.yml` | MODIFIED | Scope-gate check extended from `triage`-sourced only to also accept `report-fix-candidate`-sourced PRs; all four jobs unchanged |
| `v40-auto-promote.yml` | MODIFIED | Triple-gate Leg 3 extended: accepts `report-fix-candidate` label on source issue (alongside legacy `triage`) |
| `tests/e2e/.llm-spend-ledger.json` | EXISTING (unmodified format) | Ledger entries from v61-report-fix.yml get `source: 'report-fix-api'` to distinguish from old `'auto-fix-api'` entries; budget caps enforced as before |
| Golden corpus (tests/test-cases.js, 75 cases) | EXISTING (unmodified) | Regression guard; verifier-gate runs all 75 cases on every auto-fix/* PR |
| Quarantine corpus (tests/e2e/test-cases-quarantine.js) | EXISTING (unmodified) | Holds promoted-but-not-yet-golden cases; auto-promote PR mutates test-cases.js when merged |
| `scripts/review-reports.mjs` promote subcommand | MODIFIED (additive) | Add `promote` as a new subcommand that fires the same GitHub Issue creation that ingest-reports.mjs would produce automatically — the manual-promote escape hatch |

---

## Data Flow: End-to-End Pipeline

### Stage 1: Report Intake (EXISTING, NO CHANGES)

```
Extension user triggers report dialog
    → POST /report to pct.tonyrowles.com (Bearer PROXY_TOKEN)
    → Worker: rate-limit check (rl:{ip}) → fingerprint → dedup check
    → BUG_REPORTS.put("report:{fp}:{ts}", kvRecord, {expirationTtl: 7776000})
    → Discord embed (best-effort, ctx.waitUntil)
    → 201 {ok:true, fingerprint, deduped:false}
```

KV record shape (20 fields defined by report-schema.md):
- `category`: inaccurate_citation | no_match | tool_not_working | other
- `selectionText`, `returnedCitation`, `confidenceTier`
- `errorLog` (ring buffer, max 20 entries)
- `xpathNode`, `scrollY`, `viewportWidth`, `viewportHeight`
- `pdfParseStatus`, `triggerMode`
- `duplicate_count`, `fingerprint`, `timestamp`

### Stage 2: Triage (NEW)

```
Scheduled or maintainer-triggered:
  node scripts/ingest-reports.mjs [--since 7d] [--category inaccurate_citation]

    → wrangler kv key list --remote (prefix: report:)
    → filter: status == 'open' AND timestamp > last-run watermark
    → for each report:
        auto-triage(record) → { verdict: 'promote'|'noise'|'dupe'|'user-error', reason }
        if verdict == 'promote':
            create GitHub Issue (label: report-fix-candidate)
            mark KV record _review.status = 'triaged'
        else:
            mark KV record _review.status = verdict
```

Auto-triage heuristics (cheap, no LLM):
- `category == 'inaccurate_citation'` AND `confidenceTier IN ['green','yellow']`
  AND `returnedCitation != null`: high signal for real bug
- `duplicate_count >= N` (configurable, e.g. 3): real recurrence, promote
- `pdfParseStatus == 'error'` AND `errorLog.length > 0`: tool failure, check if fixable
- `category == 'no_match'` AND `errorLog.length == 0`: likely user-error, skip
- `category == 'other'`: check errorLog; promote if errorLog contains known patterns

Manual-promote escape hatch:
```
node scripts/ingest-reports.mjs promote <fp> <ts> [--note "reason"]
  OR
node scripts/review-reports.mjs promote <fp> <ts> [--note "reason"]
```
Creates the GitHub Issue directly, bypassing the auto-triage verdict.

### Stage 3: Candidate State (GitHub Issue)

One GitHub Issue per promoted report.

Issue body (structured for machine parsing, human readable):
```
<!-- fp: {12-hex-fingerprint} -->
<!-- kv-key: report:{fp}:{ts} -->
<!-- patent: {patentNumber} -->

**Selection:** {selectionText | "(removed by user)"}
**Returned citation:** {returnedCitation | "(none)"}
**Confidence:** {confidenceTier}
**Category:** {category}
**PDF parse status:** {pdfParseStatus}

**Error log (last {N}):**
{errorLog entries}

**Maintainer note:** {note from promote command}
```

Labels applied at creation: `report-fix-candidate`

State machine via labels:
```
report-fix-candidate  (auto-promote or manual-promote creates issue)
    → fix-in-progress   (v61-report-fix.yml adds when dispatched)
    → auto-fix:verified (v40-verifier-gate.yml ready-flip adds)
    → CLOSED            (v40-auto-promote.yml closes after promote PR merged)
```

### Stage 4: LLM Analysis + Fix Generation (NEW)

Triggered by `issues.labeled` == `report-fix-candidate`.

```
v61-report-fix.yml:
  1. Pre-check: issue has report-fix-candidate label + ANTHROPIC_API_KEY present
  2. Checkout main (full depth)
  3. Fetch full KV record: wrangler kv key get --remote {kv-key from issue body}
  4. Run invokeAnthropicSdkWithLedger with REPORT_FIX_SCAFFOLD
       system: instructions + FORBIDDEN_PATHS + src/shared/ file contents
       user: <report_data>{KV record JSON}</report_data>
              + <source_files>{matching.js + position-map-builder.js}</source_files>
  5. Parse diff from response (DIFF_FENCE_START / DIFF_FENCE_END markers)
  6. git apply --check → diff-guard → git apply
  7. Ledger entry: source: 'report-fix-api', fingerprint (12-hex)
  8. Two-commit split:
       a. git commit .llm-spend-ledger.json to main [skip ci]
       b. cpr@v8: branch auto-fix/{issue}-{fp8}, draft PR
  9. Cross-link PR on source issue + add fix-in-progress label
```

REPORT_FIX_SCAFFOLD targets only:
- `src/shared/matching.js`
- `src/shared/position-map-builder.js`
- `src/shared/pdf-parser.js` (read-only context; fixes here allowed but rare)

The scaffold does NOT touch:
- `tests/` (diff-guard LOCKED path)
- `tests/test-cases.js` (diff-guard LOCKED path)
- `tests/golden/baseline.json` (diff-guard LOCKED path)
- `worker/` (diff-guard LOCKED path)
- `src/shared/report-*.js` (not the matching core)
- `scripts/` (diff-guard LOCKED path)
- `.github/` (diff-guard LOCKED path)

### Stage 5: Regression Safety Gate (EXISTING, SCOPE EXTENDED)

`v40-verifier-gate.yml` fires on every `pull_request` to `auto-fix/*` branches.

The scope-gate check at line ~80 currently reads:
```bash
if [[ "${{ github.head_ref }}" == auto-fix/* ]]; then
```

This already matches report-fix-sourced branches (same `auto-fix/` prefix). The only modification needed: the diff-guard scope decision within the workflow filters by branch prefix, not by issue label. So v6.1 auto-fix branches are automatically covered.

Four-job structure (unchanged):
1. `diff-guard`: FORBIDDEN_PATHS bank + ≤200 LOC src/ + ≤50 LOC tests/ + TEST_CASES count
2. `verifier-gate`: 3× affected-case runs at Tier A/B (parallelized with job 3)
3. `regression-suite`: full 75-case Playwright run on PR branch
4. `ready-flip`: draft → ready + `auto-fix:verified` label (BLOCKER-01 producer)

The `v40-verifier-gate` name is pinned as a required status check on ruleset 17086676. Do not rename.

### Stage 6: Human Merge Gate

```
Maintainer sees ready-for-review PR
    ├── verifier-gate:  PASS (auto-fix:verified label present)
    ├── regression-suite: CLEAN
    ├── diff visible: only matching.js / position-map-builder.js changed
    └── maintainer merges (required by branch-protection ruleset 17086676)
```

Branch protection ruleset 17086676 on `main`:
- Required status check: `verifier-gate` (job name in v40-verifier-gate.yml)
- Required status check: `deps-update-gate` (job name in v40-deps-update.yml)
- No bypass actors except break-glass runbook (§7 in docs/)
- PROXY_TOKEN and ANTHROPIC_API_KEY as repo secrets

CI cannot merge to main autonomously. All pushes to main via human-approved PR or the specific two-commit-split `[skip ci]` ledger pattern (which only touches `.llm-spend-ledger.json`).

### Stage 7: Post-Merge Auto-Promote (EXISTING, TRIPLE-GATE EXTENDED)

`v40-auto-promote.yml` fires on `pull_request.closed` where PR was merged and carried `auto-fix:verified`.

Triple-gate (Leg 3 modification):
```
Leg 1: PR carries 'auto-fix:verified'           (v40-verifier-gate.yml producer)
Leg 2: pull_request.merged === true             (not close-without-merge)
Leg 3: source issue carries 'triage'            ← EXTEND to also accept 'report-fix-candidate'
```

Implementation: the Leg 3 label check in `scripts/auto-fix-promote.mjs`'s `assertTripleGate()` must accept either `triage` or `report-fix-candidate` as the qualifying label on the source issue. The `assertTripleGate` body sha256 pinned by tests; any change here requires the Vitest test update in `tests/unit/`.

Post-merge flow:
```
assertTripleGate (extended)
    → runPromote: quarantine-append → promote from quarantine → test-cases.js mutation
    → cpr@v8: auto-promote/{issue}-{pr} branch, non-draft PR
    → maintainer merges auto-promote PR (tests/test-cases.js mutation)
    → gh issue close source issue
    → post-merge verifier re-check on origin/main HEAD
```

---

## Human Gate Placement (Precise)

| Gate | When | Mechanism | Who |
|------|------|-----------|-----|
| **GATE 1a** (auto-triage verdict) | After Stage 2 classifier runs | Reports classified as real bugs auto-promote; everything else requires explicit override | Automatic (no human needed for happy path) |
| **GATE 1b** (manual-promote escape hatch) | Any time after a report exists in KV | `ingest-reports.mjs promote <fp> <ts>` OR `review-reports.mjs promote <fp> <ts>` | Maintainer runs locally |
| **GATE 2** (merge gate) | After verifier-gate PASS + regression CLEAN | Branch-protection ruleset 17086676; maintainer approves + merges PR | Maintainer in GitHub UI |
| **GATE 3** (auto-promote PR merge) | After GATE 2 merge triggers auto-promote | Separate auto-promote/* PR for `tests/test-cases.js` mutation; CODEOWNERS on tests/ | Maintainer merges second PR |

Gates 2 and 3 are unchanged from the v4.0 architecture. Only GATE 1 is new.

---

## Candidate State Storage Decision

**Decision: GitHub Issues (not KV-only, not committed files)**

Rationale:

| Option | Verdict | Reason |
|--------|---------|--------|
| BUG_REPORTS KV only | REJECT | KV has 90-day TTL; no GitHub notification system; cannot trigger GitHub Actions workflows; no structured label-state machine; wrangler --remote required for every read |
| Committed JSON file (`promoted-reports.json`) | REJECT | Every promote would need a commit to main, violating the branch-protection ruleset (needs PR); creates commit noise; no native issue/PR cross-linking |
| GitHub Issues (recommended) | ACCEPT | Workflow triggers work natively on `issues.labeled`; label-based state machine matches existing v4.0 pattern exactly; fingerprint in issue body line 1 is the established convention; issue body carries all diagnostic fields needed for LLM analysis; cross-links to auto-fix PR via issue comments; maintainer triage UI already built around GitHub Issues |

The GitHub Issue is the state-transition hub. The BUG_REPORTS KV record remains the ground-truth diagnostic bundle (full errorLog, xpathNode, etc.) — the issue body carries a pointer (`<!-- kv-key: report:{fp}:{ts} -->`) so the workflow can fetch the complete record at analysis time.

---

## CI Mutates Source Under the Existing Branch-Protection Ruleset

This is the load-bearing constraint inherited from v4.0.

The branch-protection ruleset on `main` (id 17086676) blocks all direct pushes except:
1. The `[skip ci]` two-commit-split pattern for `tests/e2e/.llm-spend-ledger.json` (the ONLY file)
2. Human-approved PRs

The v6.1 pipeline does not change this. The auto-fix workflow (`v61-report-fix.yml`) uses the SAME two-commit-split pattern from `v40-auto-fix.yml`:

```
Step A: git checkout main && git add .llm-spend-ledger.json
        git commit -m "[skip ci] ledger: report-fix issue-{N}"
        git push origin main          ← only ledger file, skip-ci marker
Step B: git checkout auto-fix/{branch}
        git rebase main
        → cpr@v8 snapshots ledger-CLEAN working tree
        → PR diff contains ONLY src/shared/ changes
```

The diff-guard in `v40-verifier-gate.yml` rejects PRs that touch `tests/e2e/.llm-spend-ledger.json`, which is why the ledger must be committed to main first (the verifier checks `git diff origin/main..HEAD` for LOCKED paths).

The FORBIDDEN_PATHS bank (from `scripts/check-diff-guard.mjs`) locks:
- `tests/test-cases.js`
- `tests/golden/baseline.json`
- `tests/e2e/lib/pdf-verifier.js`
- `tests/e2e/lib/pdf-fetch.js`
- `tests/e2e/.llm-spend-ledger.json`
- `scripts/` directory
- `.github/` directory

The candidate fix may only touch `src/shared/` — specifically `matching.js`, `position-map-builder.js`, and `pdf-parser.js`. This is enforced by both the diff-guard LOCKED path check AND the REPORT_FIX_SCAFFOLD's explicit instructions.

The `contents: write` permission on `v61-report-fix.yml` is the same requirement as `v40-auto-fix.yml`. The ledger commit to main requires this; cpr@v8 requires it for branch push.

---

## New vs Modified Components

### NEW (build from scratch in v6.1)

| Component | Location | Description |
|-----------|----------|-------------|
| `scripts/ingest-reports.mjs` | `scripts/` | KV polling, auto-triage, GitHub Issue creation, manual-promote `promote` subcommand |
| Auto-triage classifier | inside `ingest-reports.mjs` | Heuristic-first; no LLM for triage; cheap, deterministic |
| `REPORT_FIX_SCAFFOLD` | `tests/e2e/lib/fix-prompt-builder.js` | New scaffold entry targeting matching.js / position-map-builder.js, guided by KV diagnostic bundle |
| `.github/workflows/v61-report-fix.yml` | `.github/workflows/` | Issue-triggered LLM analysis + fix generation workflow; mirrors v40-auto-fix.yml structure |
| Vitest tests for new components | `tests/unit/` + `tests/e2e/scripts/` | Schema guards, scaffold tests, YAML contract tests for v61-report-fix.yml |

### MODIFIED (additive changes to existing code)

| Component | Location | What Changes |
|-----------|----------|-------------|
| `scripts/auto-fix-promote.mjs` | `scripts/` | `assertTripleGate()` Leg 3 extended to accept `report-fix-candidate` alongside `triage` |
| `scripts/review-reports.mjs` | `scripts/` | Add `promote` subcommand as manual-promote escape hatch |
| `.github/workflows/v40-auto-promote.yml` | `.github/workflows/` | `if:` filter: OR-branch for `report-fix-candidate` label |
| `tests/unit/` gate tests | `tests/unit/` | Update Vitest assertions that pin `assertTripleGate` body sha256 or Leg 3 label whitelist |

### RETIRED (remove in v6.1)

| Component | Location | Action |
|-----------|----------|--------|
| `tests/e2e/scripts/inject-defect.mjs` | `tests/e2e/scripts/` | Delete — synthetic mutator retired |
| `scripts/e2e-explore.mjs` | `scripts/` | Archive — autonomous explore mode deferred |
| `v40-auto-fix.yml` trigger block | `.github/workflows/` | Keep file but replace trigger; OR: rename to `v61-report-fix.yml` and replace entirely |
| `v40-auto-promote.yml` `issues:labeled` trigger | `.github/workflows/` | Restore `pull_request: types: [closed]` as primary; dispatch remains for UAT |
| Paused Phase 61–67 artifacts | `.planning/milestones/v4.3-phases-paused/` | Archive; do not restore |
| `RESUME-V4.3.md` | `.planning/` | Superseded; archive or delete |

---

## Build Order (respects dependencies)

The pipeline is a strict sequential chain: intake before triage before analysis before regression-gate before PR.

```
Phase A: Retirement + scaffolding
  - Archive/delete inject-defect.mjs, e2e-explore.mjs, RESUME-V4.3.md
  - Archive paused v4.3 phase artifacts
  - Stub REPORT_FIX_SCAFFOLD in fix-prompt-builder.js (even if not yet wired)
  Dependencies: none; do first to clear technical debt

Phase B: Triage layer (ingest-reports.mjs)
  - KV polling + filterReports reuse from review-reports.mjs
  - Auto-triage classifier (heuristic-first, no LLM)
  - GitHub Issue creation (candidate state)
  - `promote` subcommand (manual-promote escape hatch) added to review-reports.mjs
  - Vitest tests: classifier unit tests + issue-body schema guard
  Dependencies: Phase A done; needs BUG_REPORTS KV access (wrangler --remote)

Phase C: Fix generation workflow (v61-report-fix.yml)
  - REPORT_FIX_SCAFFOLD complete (fix-prompt-builder.js)
  - v61-report-fix.yml: issues.labeled trigger, KV fetch, LLM invoke, PR create
  - Two-commit ledger split (copy pattern from v40-auto-fix.yml)
  - Vitest YAML contract tests for v61-report-fix.yml
  Dependencies: Phase B done (GitHub Issue must exist with correct body format)

Phase D: Triple-gate extension (auto-fix-promote.mjs + v40-auto-promote.yml)
  - assertTripleGate() Leg 3: accept report-fix-candidate
  - v40-auto-promote.yml if-filter: OR report-fix-candidate
  - Restore v40-auto-promote.yml pull_request:closed trigger
  - Update Vitest sha256 pin tests
  Dependencies: Phase C done (auto-fix:verified flow must be wired first)

Phase E: Regression-safety validation (UAT)
  - Live end-to-end UAT: submit report → auto-triage promotes → LLM produces fix →
    verifier-gate passes → maintainer merges → auto-promote closes issue
  - Verify no regression on 75-case golden corpus
  - Verify ledger budget caps enforced
  Dependencies: Phases A–D done; requires production BUG_REPORTS KV data OR seeded test report
```

---

## Architectural Patterns

### Pattern 1: KV Record as Ground-Truth Diagnostic Bundle

The BUG_REPORTS KV record is the single source of diagnostic truth. The GitHub Issue carries a pointer (`<!-- kv-key: report:{fp}:{ts} -->`), not a copy of the full record. At LLM analysis time, `v61-report-fix.yml` fetches the KV record via `wrangler kv key get --remote` to get the full errorLog, xpathNode, etc.

Why: The KV record was built by the v5.0 pipeline specifically to capture everything needed for debugging — 20 fields including DOM context, error ring buffer, PDF parse status. Duplicating this into the issue body would be fragile (issue body size limits, edit-drift) and redundant.

### Pattern 2: Two-Commit Ledger Split (INHERITED)

The LLM spend ledger (`tests/e2e/.llm-spend-ledger.json`) is committed directly to `main` with `[skip ci]` before `cpr@v8` snapshots the working tree for the auto-fix PR. This keeps the ledger entry off the diff-guard's FORBIDDEN_PATHS list.

v6.1 inherits this pattern exactly from `v40-auto-fix.yml`. The `source` field on new ledger entries uses `'report-fix-api'` (not `'auto-fix-api'`) to distinguish report-driven invocations from legacy synthetic-trigger invocations.

### Pattern 3: Heuristic-First Auto-Triage (NO LLM for Classification)

The auto-triage classifier in `ingest-reports.mjs` uses zero LLM calls. Classification criteria:
- `category == 'inaccurate_citation'` — user explicitly said the citation was wrong
- `confidenceTier IN ['green', 'yellow']` — the tool produced a result (not a no-match)
- `returnedCitation != null` — the tool produced something to fix
- `errorLog.length > 0` — additional signal of abnormal execution

This is analogous to the v3.1 heuristic-first triage classifier (`triage-classifier.js`) that resolves 6/8 ERROR_CLASSES without LLM. The philosophy is: spend LLM budget on fix generation (where it's necessary), not on classification (where heuristics suffice).

### Pattern 4: label-Based State Machine on GitHub Issues (INHERITED)

The v4.0 pipeline used GitHub Issue labels as state transitions. v6.1 inherits this:
- `report-fix-candidate` → issue created, fix not yet generated
- `fix-in-progress` → v61-report-fix.yml running
- `auto-fix:verified` → verifier-gate passed, ready for human merge
- CLOSED → auto-promote cycle complete

Workflows use `issues.labeled` triggers to respond to state transitions, which lets the pipeline be event-driven rather than polling-based after the initial KV ingest step.

### Pattern 5: XML-Tag Prompt-Injection Defense (INHERITED)

The LLM prompt wraps all report-derived content in XML tags:
- `<report_data>{KV record JSON}</report_data>` — isolates report content from instructions
- `<source_files>{matching.js content}</source_files>` — isolates read-only source

This follows the v3.1 convention (`<patent_data>` XML tags in triage-classifier.js, `<issue_body_untrusted>` envelope in v40-auto-fix.yml). The fingerprint in the issue body line 1 convention (`<!-- fp: ... -->`) also follows v3.1/v4.0 precedent.

---

## Integration Points

### With Existing Infrastructure

| Integration | How | Constraint |
|-------------|-----|------------|
| BUG_REPORTS KV read | `wrangler kv key get --remote` (same as review-reports.mjs) | Requires `wrangler` CLI auth; always pass `--remote` (v4 default is local miniflare) |
| GitHub Issues | `gh issue create` / `gh issue view` (same as e2e-report-issue.mjs) | GITHUB_TOKEN repo secret; `issues: write` workflow permission |
| LLM invocation | `invokeAnthropicSdkWithLedger` from tests/e2e/lib/llm-driver.js | ANTHROPIC_API_KEY secret; LEDGER_PATH budget caps enforced; `fix_attempts` cap at 3 |
| Diff-guard | `node scripts/check-diff-guard.mjs` (pipe from `git diff --name-only`) | FORBIDDEN_PATHS bank unchanged; ≤200 LOC src/ cap applies |
| Verifier gate | `node scripts/verify-single-case.mjs` (3× per affected case) | Verifier files pinned to origin/main; requires Playwright + Chromium |
| Regression suite | `npx playwright test --config ...` (75 cases) | Same as v40-verifier-gate.yml regression-suite job |
| Auto-promote | `scripts/auto-fix-promote.mjs` with extended triple-gate | assertTripleGate body change requires Vitest pin update |
| Ledger budget | `readLedger() / appendLedgerEntry()` from tests/e2e/lib/llm-ledger.js | Monthly cap shared across all LLM invocations; `source: 'report-fix-api'` distinguishes entries |

### External Boundaries

| Boundary | Protocol | Notes |
|----------|----------|-------|
| Cloudflare Worker ↔ Pipeline | wrangler CLI (`--remote` flag required) | Not HTTP; wrangler v4 default reads local miniflare store; `--remote` is mandatory |
| GitHub Issues ↔ Workflows | `issues.labeled` event + `gh` CLI | Standard GitHub Actions pattern; issue number threaded through all steps |
| GitHub PR ↔ Verifier Gate | `pull_request` event on `auto-fix/*` | Branch prefix scoping; no change to v40-verifier-gate.yml scope filter needed |
| LLM ↔ Fix Generator | Anthropic SDK via `invokeAnthropicSdkWithLedger` | Ledger-guarded; ANTHROPIC_API_KEY required; REPORT_FIX_SCAFFOLD is the new prompt |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching Full KV Record Into Issue Body

Storing the complete 20-field KV record in the GitHub Issue body creates size pressure, edit-drift risk, and privacy exposure (selectionText, errorLog). The correct pattern is pointer-in-issue-body + fetch-at-analysis-time.

### Anti-Pattern 2: LLM Classification in Triage

Running LLM on every incoming report for triage burns budget on noise. The v3.1 heuristic-first classifier showed 6/8 ERROR_CLASSes resolve without LLM. The report schema provides equally strong heuristic signals (category, confidenceTier, errorLog presence). Reserve LLM budget for fix generation.

### Anti-Pattern 3: Bypassing the Diff-Guard in Fix Generation

If the REPORT_FIX_SCAFFOLD permits the LLM to modify `tests/test-cases.js` or the golden baseline, the verifier-gate's trust invariant is broken. The FORBIDDEN_PATHS bank and the explicit scaffold instructions must BOTH prohibit this. Defense in depth: scaffold says "only modify matching core"; diff-guard rejects any violation.

### Anti-Pattern 4: Direct-to-Main Commits for Source Changes

Only `tests/e2e/.llm-spend-ledger.json` may be committed directly to `main` (via the `[skip ci]` two-commit-split pattern). All source changes go through a PR and the verifier-gate required status check. Attempting to push src/ changes directly to main fails the branch-protection ruleset.

### Anti-Pattern 5: Restoring the `issues: labeled` Trigger on v40-auto-fix.yml

The old `v40-auto-fix.yml` triggered on `issues: labeled` == `triage`. v6.1 builds a NEW workflow (`v61-report-fix.yml`) that triggers on `issues: labeled` == `report-fix-candidate`. Restoring the old trigger would re-activate the retired synthetic-issue path. Keep `v40-auto-fix.yml` at `workflow_dispatch:` only or retire the file entirely and replace with v61-report-fix.yml.

---

## Sources

- `/home/fatduck/patent-cite-tool/worker/src/index.js` — BUG_REPORTS KV schema, `handleReport`, fingerprint, dedup, rate-limit implementation (HIGH confidence — production code)
- `/home/fatduck/patent-cite-tool/worker/src/report-schema.md` — 20-field KV record spec, PAY-01 allowlist, PAY-03 exclusions (HIGH confidence — committed specification)
- `/home/fatduck/patent-cite-tool/scripts/review-reports.mjs` — `filterReports`, `reviewStatus`, `writeStatus` helpers; `wrangler --remote` pattern (HIGH confidence — production tooling)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-fix.yml` — two-commit-split pattern, `peter-evans/cpr@v8` usage, ledger commit to main, `[skip ci]` marker (HIGH confidence — production workflow)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-verifier-gate.yml` — four-job structure, FORBIDDEN_PATHS, diff-guard, verifier-pin, partial-pass logic, `auto-fix:verified` label producer (HIGH confidence — production workflow)
- `/home/fatduck/patent-cite-tool/.github/workflows/v40-auto-promote.yml` — triple-gate, `assertTripleGate`, `runPromote`, auto-promote PR pattern (HIGH confidence — production workflow)
- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` — v6.1 scope, constraints, BUG_REPORTS channel description, retirement scope (HIGH confidence — authoritative planning doc)
- `/home/fatduck/patent-cite-tool/.planning/MILESTONES.md` — v3.1 quarantine corpus, v4.0 auto-fix loop, v4.2 fixture-mutator, v5.0 report pipeline delivery evidence (HIGH confidence — milestone history)

---

*Architecture research for: v6.1 Auto-Fix from Bug Reports pipeline integration*
*Researched: 2026-06-17*

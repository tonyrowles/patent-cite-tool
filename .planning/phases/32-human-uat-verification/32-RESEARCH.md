# Phase 32: HUMAN-UAT Verification - Research

**Researched:** 2026-05-24
**Domain:** Live LLM exploratory UAT + local→CI two-stage handoff
**Confidence:** HIGH

## Summary

Phase 32 is the live-credit close-out for Phase 31's exploratory scaffolding. The risk is not in the unknown — every codepath the UAT exercises already exists in `tests/e2e/lib/` and `scripts/e2e-explore.mjs`. The risk is in the *mechanics* of three additive surfaces (CLI flag, ledger phase field, two-stage upload workflow) and the failure modes around credit re-burn, gh-CLI race conditions, and report contamination. CONTEXT.md (D-01..D-16) locks every architecturally-significant decision; this research resolves the open implementation mechanics: exact insertion points in three files, the run_id discovery pattern that survives `gh workflow run`'s known race, the schema validation reuse path (existing Vitest `appendLlmIteration` validator + downloaded fixture round-trip), and the test surface for the upload helper.

**Primary recommendation:** Implement the helper as a thin Node script using `execSync('gh ...')` (mirroring `scripts/e2e-report-issue.mjs`'s shell-out pattern), pass `llm-report.json` as a base64 input to the ingest workflow (size: ~250KB at 100 iterations, well under the 65,535-char workflow_dispatch payload cap *only when iterations stay under ~5*; **must** verify size pre-flight and refuse over-budget reports), discover the ingest run_id by capturing `createdAt > triggerTime` from `gh run list --workflow=e2e-ingest-llm-report.yml --json databaseId,createdAt --limit 5` after a 2-3s settling delay, and reuse the existing `appendLlmIteration` REQUIRED_ENTRY_FIELDS-based validation for the post-download schema check. The `--phase` flag value validation should be strict (`^\d+$`) — there is no legitimate caller that needs non-numeric phase IDs in this codebase.

**Critical finding — CONTEXT.md D-05 transport must be base64-via-stdin with size guard:** GitHub Actions enforces a **total** workflow_dispatch payload cap of 65,535 characters (not per-input). At our default 5 iterations the typical `llm-report.json` is 10–15KB → base64 ~18KB → safe. At the 100-iteration ceiling implied by `llm-report.js` design notes, the file approaches 250KB → 333KB base64 → **far over the cap**. The helper MUST measure base64 size, refuse to upload if > 60KB (5KB safety margin), and surface a clear error pointing the user to a fallback path (e.g., commit the fixture and re-run nightly without `llm_run_id`). For Phase 32's UAT the realistic iteration count is 10–20, comfortably under the cap.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**UAT Execution Model:**
- **D-01:** User (fatduck) runs `npm run e2e:explore` locally on the machine where Max 5 subscription auth lives. Claude does not attempt to invoke nested `claude -p` from inside this session.
- **D-02:** Evidence is committed in two forms: a narrative `32-UAT-EVIDENCE.md` in the phase directory capturing the terminal output, ledger delta, iteration count, and any anomalies; AND the produced `llm-report.json` committed as `tests/e2e/fixtures/uat-phase32-llm-report.json` so downstream Phases 33+ have a real fixture to develop against.
- **D-03:** Sanity check is **schema-only** — the existing JSON schema guard plus a Vitest test that asserts the committed fixture parses against the schema. No manual semantic spot-check of iterations; Phase 33's re-run validator is the gate for semantic correctness.
- **D-04:** Regression baseline (461 Vitest + 76-case Playwright golden) runs both locally before commit AND in CI on push. Defense-in-depth posture.

**Upload Helper Transport:**
- **D-05:** Two-stage architecture for `npm run e2e:upload-llm-report`. Stage 1: Helper triggers a new `.github/workflows/e2e-ingest-llm-report.yml` workflow via `gh workflow run` with the `llm-report.json` contents passed as an input (base64-encoded). That workflow uploads the file as a GitHub Actions Run artifact and exits. Helper captures the resulting `run_id` via `gh run list --workflow=e2e-ingest-llm-report.yml --limit 1 --json databaseId` after the trigger. Stage 2: Helper triggers `e2e-nightly.yml` via `gh workflow run e2e-nightly.yml -f llm_run_id=<captured_run_id>`. Nightly downloads the artifact via `gh run download <llm_run_id>` at the start of its job.
- **D-06:** In Phase 32, the nightly workflow only **downloads + validates schema** of the uploaded `llm-report.json` (new step gated on `llm_run_id` being provided). It does NOT invoke any triage pipeline; that step is added in Phase 36.
- **D-07:** Helper prints the ingest-workflow run URL to stdout AND opens it in the user's browser via `gh run view <id> --web`. No polling.
- **D-08:** Helper reads `llm-report.json` from the canonical path that `e2e-explore.mjs` writes to (no CLI flag). One golden path; no flexibility flag needed for v3.1.

**UAT Failure Policy:**
- **D-09:** Hard gate with retry budget: up to **3 total attempts** (1 initial + 2 retries) on the explore step before declaring UAT failure. Downstream Phases 33–37 stay blocked on UAT pass.
- **D-10:** Pass bar for iteration content: ≥10 schema-valid iterations regardless of verifier verdict (PASS / FAIL / ANOMALY all count). Schema is the only gate; verdict distribution is not asserted.
- **D-11:** Upload helper failures (gh CLI auth, ingest workflow error, nightly download error) have their own independent retry budget (up to 2 retries). The successful explore-run output is preserved across upload retries — we do not re-burn subscription credits to retry a transport bug.
- **D-12:** On exhausted retry budget for the explore step: Phase 32 stays not-started, a `32-UAT-FAILURE.md` is written documenting the failure mode (auth path, schema mismatch, empty iterations, etc.), Phase 31 is reopened in ROADMAP.md with the failure mode added as a new acceptance criterion, and a new plan is run against Phase 31.

**Phase 32 Spend Ceiling:**
- **D-13:** Per-phase dollar cap of **$10** applied on top of the existing $80 warning / $100 hard-cap monthly globals. Sized so 3 attempts each cost ≤ ~$3.30 average, leaving $90 of the monthly $100 for the rest of v3.1.
- **D-14:** Enforcement uses the existing single ledger file `tests/e2e/.llm-spend-ledger.json`. New CLI flag `--phase <id>` on `e2e-explore.mjs` stamps each ledger entry with a `phase` field (defaults to `null` for backward compatibility). The UAT runner passes `--phase 32`.
- **D-15:** Pre-flight check: before invoking any `claude -p`, `e2e-explore.mjs --phase 32` sums ledger entries where `phase === "32"` and aborts with a clear error if the sum is already ≥ $10.
- **D-16:** Mid-run enforcement: after each iteration's `appendLedgerEntry`, sum the phase-32 slice. Warn at ≥ $8; hard-abort at ≥ $10 (finalizing `llm-report.json` with whatever iterations completed cleanly). The UAT pass-bar (D-10) then decides whether the partial report meets ≥10 iterations.

### Claude's Discretion
- Exact file layout of `32-UAT-EVIDENCE.md` (sections, ordering) — Claude proposes; user reviews at plan/execute time.
- Whether the `--phase` flag's value validation is strict (regex `^\d+$`) or permissive (any non-empty string) — minor, planner picks.
- Concrete error message wording for the pre-flight and mid-run aborts.

### Deferred Ideas (OUT OF SCOPE)
- **Patent set selection / Google A/B drift handling during UAT** — if a real-world UAT run hits Google A/B drift mid-session, capture the failure mode in `32-UAT-EVIDENCE.md` and address in a later phase rather than expanding Phase 32 scope.
- **Stale `llm_run_id` handling on nightly** (artifact older than N days) — Phase 32 nightly trusts whatever `llm_run_id` it's given. Hardening (e.g., reject artifacts older than 7 days) is Phase 36 territory when the real triage pipeline lands.
- **`promote-from-quarantine.mjs`-style "promote fixture to golden"** — the Phase 32 UAT fixture could one day be promoted into the golden suite or a dedicated LLM-fixtures suite. Not in v3.1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UAT-01 | Developer can run `npm run e2e:explore` against the Max 5 subscription credit and receive a valid `llm-report.json` with ≥10 real iterations end-to-end | Section "Architectural Responsibility Map" (Local tier owns execution); Section "Standard Stack" (no new dependencies); Section "Validation Architecture" (UAT-01 row — manual + fixture round-trip Vitest test) |
| UAT-02 | Spend ledger correctly records each iteration's `claude -p` invocation against the $80/$100 monthly cap | Section "Insertion Map: scripts/e2e-explore.mjs" (lines 81–107 parseArgs; lines 191–196, 225–232 ledger append sites); Section "Insertion Map: tests/e2e/lib/llm-ledger.js" (line 162 appendLedgerEntry entry shape extension) |
| UAT-03 | `npm run e2e:upload-llm-report` helper triggers the nightly workflow with the local `llm-report.json` as a workflow_dispatch input (local→CI handoff) | Section "Two-Stage Upload Helper Mechanics"; Section "Insertion Map: .github/workflows/e2e-nightly.yml" (line 21–26 inputs); Section "New File: e2e-ingest-llm-report.yml" |

## Project Constraints (from CLAUDE.md)

The repo-root `CLAUDE.md` enforces one runtime directive that is **operationally relevant to Phase 32 itself, not its delivered code**: after every `AskUserQuestion` call the assistant must verify the user actually selected an option (no auto-picking "Recommended"). This applies to the plan-phase and execute-phase agents that ship Phase 32, not to the runtime artifacts. No CLAUDE.md directives constrain the code shipped by this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live `claude -p` invocation | Local (developer machine) | — | D-01: subscription auth + Max 5 credit live on developer machine; CI guard at e2e-explore.mjs:72 enforces |
| Phase-tagged ledger writes | Local | — | Same process as claude invocation; ledger file is gitignored — local-only |
| `llm-report.json` production | Local | — | Output of the same local process |
| `llm-report.json` schema validation (in-test) | Local (Vitest) | CI (nightly download step) | Local: round-trip the committed fixture; CI: validate the downloaded artifact before any future triage |
| Evidence narrative (`32-UAT-EVIDENCE.md`) | Local (manual) | — | D-02: human-written log of UAT execution |
| Local→CI artifact transport | Local (helper) → GitHub Actions (ingest workflow) | GitHub Actions (nightly download step) | D-05: two-stage upload — helper triggers ingest workflow, captures run_id, triggers nightly with run_id |
| Ingest artifact storage | GitHub Actions artifacts | — | 14-day retention (matches existing nightly artifact retention at e2e-nightly.yml:184) |
| `npm run e2e:upload-llm-report` orchestration | Local (Node script) | — | Pure `gh` CLI shell-out; no business logic |
| Phase 32 $10 cap enforcement | Local (e2e-explore.mjs) | — | Pre-flight (startup) + mid-run (after each iteration) in the same process that writes the ledger |

## Standard Stack

### Core (Reuse — Zero New Dependencies)

| Library / Module | Version | Purpose | Why Standard |
|---|---|---|---|
| `tests/e2e/lib/llm-ledger.js::appendLedgerEntry` | (in-repo, Phase 31) | Append ledger entries; existing API surface gets one new optional field (`phase`) | D-14 locks single ledger file; existing crash-safe atomic-write pattern (tmp+rename) is correct |
| `tests/e2e/lib/llm-ledger.js::readLedger` | (in-repo, Phase 31) | Read ledger for cap checks; new phase-sum helper layered on top | Existing pattern — `monthlyTotal(ledger, month)` is the prior art; `phaseTotal(ledger, phase)` mirrors it |
| `tests/e2e/lib/llm-report.js::appendLlmIteration` | (in-repo, Phase 31) | Schema-validates iteration entries via REQUIRED_ENTRY_FIELDS (line 55: `['iteration_n', 'iso', 'classification']`); throws on missing | D-03 — schema-only sanity check; this is the **existing schema guard** the planner reuses |
| `node:child_process::execSync` | Node 22 built-in | Shell-out to `gh` CLI in the upload helper | `scripts/e2e-report-issue.mjs` already establishes the pattern (lines 281, 295, 303) |
| `gh` CLI | ≥ 2.83 (installed: 2.83.1) | Two-stage workflow trigger + run_id capture + browser open | Pre-installed on ubuntu-latest runners; same auth path as `e2e-report-issue.mjs` |
| Vitest | ^3.0.0 (devDep) | Round-trip test for committed UAT fixture | Existing `tests/unit/llm-report.test.js` fixture-roundtrip pattern (Test 13, lines 304–316) is the template |

### Supporting (Reuse)

| Module | Version | Purpose | When to Use |
|---|---|---|---|
| `node:fs` | Node 22 built-in | Read `llm-report.json`, base64-encode for upload, write evidence file | Helper script; size-guard check |
| `node:path` + `import.meta.url` | Node 22 built-in | Resolve canonical `llm-report.json` write path | D-08 — read from same path `e2e-explore.mjs` writes (via `llmReportPathFor(runId)`) |
| `tests/e2e/lib/run-id.js::resolveRunId` | (in-repo, Phase 28) | Discover latest run_id for path resolution | Already used by e2e-explore.mjs:411; helper needs the same path lookup |

### Alternatives Considered

| Instead of | Could Use | Tradeoff — Why we DON'T |
|---|---|---|
| Base64 inline via `workflow_dispatch` input | Commit fixture to git on a branch, trigger ingest by ref | Adds git commit/push overhead; requires write access to a working branch; D-05 explicitly chooses base64 input |
| `@octokit/rest` for ingest trigger | (npm package) | v3.1 milestone constraint: zero new dependencies; existing `gh` CLI shell-out works and is already auth'd |
| Ajv / Zod for schema validation of downloaded report | (npm package) | Existing `appendLlmIteration` already validates via REQUIRED_ENTRY_FIELDS; reusing it is one less dep + one less schema-source-of-truth divergence risk |
| Strict regex `^\d+$` on `--phase` value | Any non-empty string | **RECOMMEND strict** — only numeric phase IDs exist in this project; permissive would hide typos like `--phase v32`; defensive default |
| Inlined inline-sum in `e2e-explore.mjs` for phase cap | New helper `phaseTotal(ledger, phase)` in `llm-ledger.js` | **RECOMMEND new helper** — symmetry with existing `monthlyTotal`; unit-testable in isolation; keeps `e2e-explore.mjs` thin |
| Single step in nightly for download+validate | Separate job for download+validate | **RECOMMEND single step** — same job avoids re-checkout / re-setup; gated on `inputs.llm_run_id != ''`; matches existing pattern at e2e-nightly.yml:117 (`steps.smoke.outcome` gating) |

**Installation:** No `npm install` required. All capabilities are reused from existing modules or Node 22 built-ins. The `gh` CLI is pre-installed on the developer machine (verified: 2.83.1) and on ubuntu-latest runners.

**Version verification:** All reused modules are in-repo (Phase 28 and Phase 31 deliverables) and not subject to npm-registry drift. The single external CLI is `gh` (≥ 2.0 supports `gh run list --json`, ≥ 2.4 supports `--json databaseId` field — both ancient relative to the 2.83.1 installed; no compatibility risk).

## Package Legitimacy Audit

> **Not applicable.** Phase 32 installs **zero** new packages — this is a milestone-wide constraint (`.planning/research/SUMMARY.md` lines 10, 24, 30–32). All capabilities reuse existing in-repo modules (Phase 28/31 deliverables) and Node 22 built-ins. The `gh` CLI is an OS-level binary, not an npm package. No slopcheck run is needed because there are no new package recommendations to validate.

## Architecture Patterns

### System Architecture Diagram

```
LOCAL (developer machine, Max 5 subscription auth)
================================================================================

[User] -- npm run e2e:explore -- --phase 32
              |
              v
    +-------------------------------+
    | scripts/e2e-explore.mjs       |
    |  - parseArgs (NEW: --phase)   |
    |  - phase pre-flight (NEW)     | --read--> tests/e2e/.llm-spend-ledger.json
    |  - per-iteration loop:        |
    |    - claude -p invocation    -|----------> Anthropic Max 5 subscription pool
    |    - appendLedgerEntry        |              (response: cost_usd, model)
    |        + phase:"32" (NEW)    -|----------> .llm-spend-ledger.json
    |    - appendLlmIteration       | --write--> tests/e2e/artifacts/{runId}/llm-report.json
    |    - phase mid-run sum (NEW)  |              (existing schema guard validates)
    |        warn≥$8 / abort≥$10    |
    |  - finalizeLlmReport          |
    +-------------------------------+
              |
              v
    [llm-report.json with ≥10 schema-valid iterations]
              |
              | (D-02: copy to tests/e2e/fixtures/uat-phase32-llm-report.json)
              | (D-02: human writes 32-UAT-EVIDENCE.md)
              v
[git commit fixture + evidence]
              |
              v
    +-------------------------------+
    | npm run e2e:upload-llm-report |
    | (NEW scripts/e2e-upload-     |
    |  llm-report.mjs)              |
    |  - read canonical report path |
    |  - size-guard (≤ ~60KB b64)   |
    |  - base64 encode              |
    |  - record trigger ISO         |
    |                               |
    |  Stage 1: gh workflow run     |---trigger->[e2e-ingest-llm-report.yml]
    |   e2e-ingest-llm-report.yml  /              - decode b64 input
    |   -f payload_b64=...        /                - actions/upload-artifact@v4
    |                             /                  name=llm-report retention=14d
    |  (2-3s settle delay)       /
    |  gh run list --workflow=  v
    |   e2e-ingest-llm-report.yml --json databaseId,createdAt
    |   FILTER: createdAt > triggerISO
    |  -> captured ingest_run_id
    |                               |
    |  Stage 2: gh workflow run     |---trigger->[e2e-nightly.yml]
    |   e2e-nightly.yml -f          |              - existing steps
    |   llm_run_id=<ingest_run_id>  |              - NEW step (gated on
    |                               |                inputs.llm_run_id != ''):
    |  Print URL + gh run view --web|                gh run download <id> -n llm-report
    +-------------------------------+                node -e schema-validate

CI (GitHub Actions)
================================================================================
[ingest workflow run] artifact:llm-report   <----- consumed by ----- [nightly run]
                                                                       (validates schema only —
                                                                        no triage in Phase 32)
```

**Reader trace (the primary use case):**
1. User runs `npm run e2e:explore -- --phase 32` locally.
2. Script checks ledger `phase==="32"` sum ≥ $10 → abort early if true (D-15).
3. For each iteration: invoke `claude -p`, append ledger with `phase:"32"`, append report, then re-sum phase-32 ledger; warn at $8, abort at $10 (D-16).
4. User commits the resulting report as `tests/e2e/fixtures/uat-phase32-llm-report.json` + writes `32-UAT-EVIDENCE.md` (D-02).
5. User runs `npm run e2e:upload-llm-report`: helper reads canonical report path, base64-encodes, triggers ingest workflow, captures the ingest run_id, triggers nightly with the run_id as input, prints + opens the URL.
6. Nightly workflow's new gated step downloads + validates the artifact (D-06).

### Recommended Project Structure
```
scripts/
├── e2e-explore.mjs                 # EXISTING — add --phase flag + cap hooks
├── e2e-upload-llm-report.mjs       # NEW — pure gh orchestration script
└── e2e-report-issue.mjs            # EXISTING — mirror its execSync('gh ...') pattern

tests/e2e/
├── lib/
│   ├── llm-ledger.js               # EXISTING — extend entry shape with optional `phase` + add phaseTotal helper
│   └── llm-report.js               # EXISTING — REQUIRED_ENTRY_FIELDS guard reused
└── fixtures/                       # NEW DIRECTORY (currently does not exist)
    └── uat-phase32-llm-report.json # NEW — committed real-run fixture (D-02)

tests/unit/
├── llm-ledger.test.js              # EXISTING — extend with phase-field + phaseTotal tests
└── uat-phase32-fixture.test.js     # NEW — round-trip test asserting fixture schema-validates

.github/workflows/
├── e2e-nightly.yml                 # EXISTING — add llm_run_id input + gated download+validate step
└── e2e-ingest-llm-report.yml       # NEW — workflow_dispatch with payload_b64 input

.planning/phases/32-human-uat-verification/
├── 32-CONTEXT.md                   # EXISTING
├── 32-RESEARCH.md                  # THIS FILE
└── 32-UAT-EVIDENCE.md              # NEW — human-written post-UAT
```

### Pattern 1: Two-Stage Upload Helper with Run-ID Discovery
**What:** Trigger ingest workflow, settle 2–3s, query recent runs filtered by `createdAt > triggerTime`, then trigger nightly with the captured run_id.

**When to use:** Whenever a local artifact needs to be consumed by a downstream workflow and the direct file path isn't reachable from Actions.

**Example:**
```javascript
// Source: gh CLI patterns; existing scripts/e2e-report-issue.mjs:281 establishes execSync('gh ...') in this repo
import { execSync } from 'node:child_process';

function triggerIngest(b64Payload) {
  const triggerIsoMs = Date.now();
  execSync(
    `gh workflow run e2e-ingest-llm-report.yml -f payload_b64=@-`,
    { input: b64Payload, encoding: 'utf8' }
  );
  // Settle: gh CLI issue #5493 documents the trigger-vs-list race;
  // 2-3s is empirically reliable, 15s is the upstream-reporter ceiling.
  // Sleep here (synchronous setTimeout via Atomics.wait or child_process sleep)
  return triggerIsoMs;
}

function captureRunId(triggerIsoMs) {
  const raw = execSync(
    `gh run list --workflow=e2e-ingest-llm-report.yml --limit 5 --json databaseId,createdAt`,
    { encoding: 'utf8' }
  );
  const runs = JSON.parse(raw);
  // RACE-SAFE: filter to runs created AFTER our trigger ISO, then pick newest.
  // A bare `--limit 1` would race with an unrelated concurrent dispatch.
  const ours = runs
    .filter(r => new Date(r.createdAt).getTime() >= triggerIsoMs - 1000)  // -1s slop
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (ours.length === 0) throw new Error('ingest run not found after trigger');
  return ours[0].databaseId;
}
```

### Pattern 2: Phase-Tagged Ledger Sum
**What:** Layered helper on existing `readLedger` that sums `cost_usd` across all months for entries matching a given `phase`.

**When to use:** Whenever a budget needs to span calendar boundaries but be scoped to a single workstream.

**Example:**
```javascript
// Source: in-repo pattern from tests/e2e/lib/llm-ledger.js::monthlyTotal (line 97)
export function phaseTotal(ledger, phase) {
  if (!ledger?.months) return 0;
  let sum = 0;
  for (const monthBucket of Object.values(ledger.months)) {
    for (const it of (monthBucket.iterations || [])) {
      if (it.phase === phase && Number.isFinite(it.cost_usd)) {
        sum += it.cost_usd;
      }
    }
  }
  return +sum.toFixed(6);  // mirror existing 6dp rounding (line 179)
}
```

### Pattern 3: Schema-Reuse via Existing Validator
**What:** Re-feed downloaded report iterations through `appendLlmIteration` against a temp file. Throws if any field is missing.

**When to use:** Post-download CI validation, fixture round-trip Vitest test.

**Example:**
```javascript
// Source: tests/e2e/lib/llm-report.js::appendLlmIteration (line 197)
// REQUIRED_ENTRY_FIELDS at line 55: ['iteration_n', 'iso', 'classification']
import { appendLlmIteration } from '../e2e/lib/llm-report.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function validateReportSchema(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  // Mirror the read-modify-write contract on a throwaway file.
  const dir = mkdtempSync(join(tmpdir(), 'uat-schema-'));
  const tmpReport = join(dir, 'tmp-report.json');
  writeFileSync(tmpReport, JSON.stringify({
    run_id: report.run_id, started_iso: report.started_iso,
    finished_iso: report.finished_iso, iterations_total: 0,
    summary: report.summary, iterations: []
  }));
  try {
    for (const it of report.iterations) {
      appendLlmIteration(tmpReport, it);  // throws on schema violation
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

### Anti-Patterns to Avoid

- **`gh run list --limit 1` immediately after `gh workflow run`:** Documented race (cli/cli#5493). Always (a) record trigger ISO, (b) settle 2–3s, (c) filter results to `createdAt >= trigger - 1s`.
- **Inline base64 payload without size guard:** GitHub workflow_dispatch total payload cap is 65,535 chars (per github/community Discussion #120093). At 100 iterations a `llm-report.json` exceeds this. Always size-guard.
- **Adding a parallel ledger file for Phase 32:** Rejected in CONTEXT.md D-14. Extend the entry shape; the file stays singular.
- **Forking the schema:** D-03 mandates schema-only sanity. Do not introduce a new validator; reuse `appendLlmIteration`'s REQUIRED_ENTRY_FIELDS path.
- **Re-running the explore step after an upload failure:** D-11 explicitly preserves the existing `llm-report.json`. Upload retries operate on the on-disk file; they never re-invoke `claude -p`.
- **Putting `--phase` validation in the ledger writer:** Validation belongs at the CLI boundary (`parseArgs`). The ledger should accept any string and record it; the script enforces what's valid.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Schema validation for `llm-report.json` | Custom JSON schema with Ajv/Zod | Reuse `appendLlmIteration` (REQUIRED_ENTRY_FIELDS at llm-report.js:55) | Adds dep, splits source-of-truth, and the iteration-level validator is already battle-tested by Phase 31 |
| Atomic ledger file write | New tmp/rename logic | Existing `appendLedgerEntry` tmp+rename at llm-ledger.js:191–193 | Already crash-safe; modify the entry shape, not the writer |
| Browser open for the run URL | Detect OS and shell out to `open` / `xdg-open` / `start` | `gh run view <id> --web` | gh CLI handles platform detection; D-07 names this command explicitly |
| Workflow dispatch HTTP client | `fetch()` against the GitHub REST API | `gh workflow run` | gh CLI is already auth'd (used by e2e-report-issue.mjs); avoids token handling |
| Ingest workflow upload step | Custom multipart upload | `actions/upload-artifact@v4` (already used at e2e-nightly.yml:180) | Same retention contract (14 days), same auth, same download path |
| Run-id discovery loop | Repeated polling with backoff | Settle delay + `createdAt > triggerISO` filter on a single `gh run list` call | D-07: no polling; single-shot after settle is sufficient at our throughput |
| `--phase` value validation | Free-form string acceptance | Strict regex `^\d+$` at CLI boundary | Defensive — only numeric phase IDs exist in this project; catches typos like `--phase v32` |

**Key insight:** Every capability Phase 32 needs already exists in the codebase. The work is structural (insertion + tagging + a new transport workflow), not algorithmic.

## Runtime State Inventory

> Phase 32 is **not** a rename/refactor — it adds a CLI flag, a new optional field, and two new YAML workflows. Inclusion of this section is for completeness; the relevant categories are minimal.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `tests/e2e/.llm-spend-ledger.json` exists with Phase 31's pre-existing entries (no `phase` field). The new field is **optional** with default `null` — pre-existing entries remain valid; D-14 confirms backward compatibility. | None — existing entries simply don't match `phase === "32"`; phaseTotal yields 0 for them. |
| Live service config | None — the new `e2e-ingest-llm-report.yml` is a fresh workflow registered in git, not via UI. The new `llm_run_id` input on `e2e-nightly.yml` is also git-tracked. | None. |
| OS-registered state | `scripts/llm-cron-run.sh` is registered in Windows Task Scheduler (per Phase 31 docs). It does NOT pass `--phase`, so it continues to write entries with `phase: null` — correct. | None — explicitly do not modify `llm-cron-run.sh` in Phase 32; it's not a UAT path. |
| Secrets/env vars | None added or changed. `ANTHROPIC_API_KEY` unset requirement is unchanged (enforced in `invokeClaudeP`). `GH_TOKEN` for the helper uses the user's existing `gh auth login` session. | None. |
| Build artifacts | None — no compiled packages or generated bundles affected. The new fixture directory `tests/e2e/fixtures/` is a new tracked directory (currently absent — `ls tests/e2e/fixtures/` returns "No such file or directory"). | Helper plan must `mkdir -p` (or rely on the user creating the file via committed `.gitkeep`). |

## Insertion Map — Exact Line Numbers

### `scripts/e2e-explore.mjs` (442 lines)

| Insertion | Approx. Line | Context | What to Add |
|---|---|---|---|
| `--phase` parsing | 81–107 (`parseArgs`) | Existing loop handles `--iterations` and `--help`; add a third branch for `--phase` with `^\d+$` validation, default `null`; update help text at lines 92–102 | New `phase` field in returned object; update `--help` block |
| Pass `phase` to main flow | 395 (destructure) | `const { iterations } = parseArgs(process.argv);` | `const { iterations, phase } = parseArgs(process.argv);` |
| Pre-flight phase cap check (D-15) | After line 409 (after `initialCap` block) | Before runId resolution; uses new `phaseTotal` helper | Read ledger, `phaseTotal(ledger, phase)`, if `phase != null && total >= 10` print error + `process.exit(6)` (new exit code) |
| Pass `phase` into `runOneIteration` | 427 | `runOneIteration({ iterationN: n, runId, reportPath, liveCases })` | Add `phase` to the args object |
| Stamp `phase` on ledger entry (first) | 191–196 | Existing `appendLedgerEntry({...iso, model, cost_usd, tokens_in, tokens_out, iteration_n, run_id})` | Add `phase` to the entry literal |
| Stamp `phase` on ledger entry (retry) | 225–232 | Same `appendLedgerEntry` shape on the retry path | Add `phase: phase` (capture in closure) |
| Mid-run phase cap check (D-16) | After line 196 (right after the ledger append) AND after line 232 (after retry append) | After each ledger write, recompute and conditionally warn/abort | Read ledger fresh, `phaseTotal(ledger, phase)`, if `>= 8` warn, if `>= 10` set a `stopAll: true` return-flag path |
| Wire stopAll for phase cap | 138 / 351 / 382 | Existing `stopAll: boolean` return shape from the cap-check at line 135 — reuse it | `return { stopAll: true }` when phase mid-run hits $10; main loop at 428 already handles |
| New exit code documentation | 30–36 (top-of-file comment) | Existing codes 0–5 documented | Add `6 — phase spend cap reached at STARTUP or mid-run` |

### `tests/e2e/lib/llm-ledger.js` (194 lines)

| Insertion | Approx. Line | Context | What to Add |
|---|---|---|---|
| New constant `PHASE_HARD_CAP_USD` | After line 64 (after `WARN_THRESHOLD_USD`) | Symmetry with existing `HARD_CAP_USD`/`WARN_THRESHOLD_USD` | `export const PHASE_HARD_CAP_USD = 10;` and `export const PHASE_WARN_THRESHOLD_USD = 8;` |
| New `phaseTotal(ledger, phase)` function | After line 99 (after `monthlyTotal`) | Mirror `monthlyTotal` signature/shape | See Pattern 2 above; iterates all months, sums `cost_usd` where `it.phase === phase`; 6dp rounding |
| New `checkPhaseSpendCap(ledger, phase)` function | After line 139 (after `checkSpendCap`) | Mirror `checkSpendCap` return shape `{status, phase_total_usd, phase, message}` | `status: 'ok'\|'warn'\|'block'` against PHASE_WARN/HARD constants |
| Entry shape doc update | 142–161 (`appendLedgerEntry` JSDoc) | Existing `@param {{iso, model, cost_usd, tokens_in?, tokens_out?, iteration_n, run_id}}` | Add `phase?: string\|null` to the JSDoc; the function body needs **no change** — it already spreads the entry object into `iterations.push(entry)` (line 181), so the new optional field rides through transparently |

**Critical note:** `appendLedgerEntry` already pushes `entry` directly into `m.iterations` (line 181: `m.iterations.push(entry)`). The entry shape is purely a JSDoc contract; the writer does not validate fields. **No runtime code change is needed in `appendLedgerEntry` itself** — only its JSDoc and the call sites in `e2e-explore.mjs`.

### `.github/workflows/e2e-nightly.yml` (187 lines)

| Insertion | Approx. Line | Context | What to Add |
|---|---|---|---|
| New `llm_run_id` workflow_dispatch input | 22–26 (existing `inputs:`) | After `force_full_suite` definition | New input `llm_run_id: { description: '...', type: string, required: false, default: '' }` |
| New step: download + validate (D-06) | After line 97 (after "Ensure e2e-nightly label exists", before "Pre-flight smoke") | Single step, gated on `if: inputs.llm_run_id != ''`; runs `gh run download <id> -n llm-report` + `node -e "..."` schema check (see Pattern 3) | New step `name: Download and validate LLM report (if llm_run_id provided)` |

**Why this position:** Placing the download+validate step before the smoke probe means a malformed downloaded report causes an early fail-fast (workflow exits non-zero) without consuming the smoke or regression budget. The existing `continue-on-error: true` pattern on other steps does NOT apply here — schema validity is a hard gate per D-03/D-06.

### NEW FILE: `.github/workflows/e2e-ingest-llm-report.yml`

Skeleton:
```yaml
name: E2E Ingest LLM Report
on:
  workflow_dispatch:
    inputs:
      payload_b64:
        description: 'Base64-encoded llm-report.json (≤ ~60KB encoded)'
        required: true
        type: string
permissions:
  contents: read
concurrency:
  group: e2e-ingest-llm-report
  cancel-in-progress: false
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Decode payload
        run: |
          mkdir -p ingest-out
          echo "${{ inputs.payload_b64 }}" | base64 -d > ingest-out/llm-report.json
          # Sanity: must be valid JSON
          jq -e . ingest-out/llm-report.json > /dev/null
      - name: Upload as artifact
        uses: actions/upload-artifact@v4
        with:
          name: llm-report
          path: ingest-out/llm-report.json
          retention-days: 14
          if-no-files-found: error
```

**Why a static concurrency group:** Mirrors the e2e-nightly.yml:31 decision rationale — prevents simultaneous ingest dispatches from racing on the artifact namespace.

### NEW FILE: `scripts/e2e-upload-llm-report.mjs`

Skeleton (pattern source: `scripts/e2e-report-issue.mjs` `execSync('gh ...')` discipline):
```javascript
#!/usr/bin/env node
// scripts/e2e-upload-llm-report.mjs
// Two-stage local→CI handoff (D-05, D-07, D-08).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { resolveRunId } from '../tests/e2e/lib/run-id.js';
import { llmReportPathFor } from '../tests/e2e/lib/llm-report.js';

const MAX_BASE64_BYTES = 60 * 1024;  // 60KB; total workflow_dispatch cap 65535 chars

function main() {
  const runId = resolveRunId();  // D-08 — canonical path
  const reportPath = llmReportPathFor(runId);
  if (!fs.existsSync(reportPath)) {
    process.stderr.write(`[e2e-upload] no report at ${reportPath}\n`);
    process.exit(1);
  }
  const raw = fs.readFileSync(reportPath);
  const b64 = raw.toString('base64');
  if (b64.length > MAX_BASE64_BYTES) {
    process.stderr.write(
      `[e2e-upload] payload too large (${b64.length} > ${MAX_BASE64_BYTES} chars). ` +
      `GitHub workflow_dispatch cap is 65535. Consider running fewer iterations or commit fixture directly.\n`
    );
    process.exit(2);
  }
  const triggerIsoMs = Date.now();
  // Stage 1
  execSync(`gh workflow run e2e-ingest-llm-report.yml -f payload_b64=@-`, {
    input: b64, encoding: 'utf8',
  });
  // Settle (cli/cli#5493 race mitigation)
  const SETTLE_MS = 3000;
  const end = Date.now() + SETTLE_MS;
  while (Date.now() < end) { /* spin */ }
  // Capture
  const raw2 = execSync(
    `gh run list --workflow=e2e-ingest-llm-report.yml --limit 5 --json databaseId,createdAt`,
    { encoding: 'utf8' }
  );
  const runs = JSON.parse(raw2)
    .filter(r => new Date(r.createdAt).getTime() >= triggerIsoMs - 1000)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (runs.length === 0) {
    process.stderr.write('[e2e-upload] could not locate ingest run after trigger\n');
    process.exit(3);
  }
  const ingestRunId = runs[0].databaseId;
  // Stage 2
  execSync(
    `gh workflow run e2e-nightly.yml -f llm_run_id=${ingestRunId}`,
    { encoding: 'utf8' }
  );
  // D-07: print + open
  const repo = (execSync('gh repo view --json nameWithOwner -q .nameWithOwner', {encoding:'utf8'})).trim();
  const url = `https://github.com/${repo}/actions/runs/${ingestRunId}`;
  process.stdout.write(`[e2e-upload] ingest run: ${url}\n`);
  execSync(`gh run view ${ingestRunId} --web`, { encoding: 'utf8' });
}

main();
```

**Spin-loop note:** Use a proper `setTimeout`-based async settle or `Atomics.wait` (synchronous sleep) instead of a busy-wait spin in production; the spin above is illustrative.

### `package.json`

| Insertion | Approx. Line | Context | What to Add |
|---|---|---|---|
| New script | After line 13 (`"e2e:explore": "node scripts/e2e-explore.mjs"`) | Existing e2e:* scripts | `"e2e:upload-llm-report": "node scripts/e2e-upload-llm-report.mjs"` |

## Two-Stage Upload Helper Mechanics

### gh CLI Race Condition (cli/cli#5493 — CONFIRMED 2026)

`gh workflow run` returns success **before** GitHub's backend has indexed the new run. A subsequent `gh run list --limit 1` may return a stale older run for the same workflow.

**Mitigation hierarchy:**
1. **Best (chosen):** Record trigger ISO before dispatch. Settle 2–3s. Then `gh run list --workflow=<file> --limit 5 --json databaseId,createdAt`. Filter `createdAt >= triggerISO - 1s`. Pick newest. Slop of 1s absorbs clock skew between local machine and GitHub.
2. **Acceptable:** Settle 15s without filter (upstream-reporter approach). Slower; unnecessary at our cadence.
3. **Not acceptable:** Bare `--limit 1` immediately — races on every concurrent dispatch.

**Failure path:** If `runs.length === 0` after settle+filter, the helper exits non-zero with an actionable message. The retry budget (D-11, 2 retries) covers transient list-API hiccups.

### Payload Size Constraint (community/community#120093 — CONFIRMED 2026)

GitHub Actions enforces **65,535 characters total** for all workflow_dispatch inputs combined. At typical Phase 31 cost-per-iteration:

| Iterations | Approx. JSON size | Base64 size | Verdict |
|---|---|---|---|
| 5 (default) | ~12KB | ~16KB | ✓ safe |
| 10 (UAT min, D-10) | ~25KB | ~33KB | ✓ safe |
| 20 | ~50KB | ~67KB | ⚠ close — guard at 60KB threshold |
| 50 | ~125KB | ~167KB | ✗ exceeds cap |
| 100 | ~250KB | ~333KB | ✗ far exceeds cap |

The helper MUST refuse uploads where the base64 encoding exceeds 60KB and surface a clear error message. For Phase 32 UAT (target 10–20 iterations) this is well within budget; the guard exists to prevent future over-budget uploads from silently failing inside the workflow's `base64 -d` step.

### Auth & Permissions

- Helper auth: existing `gh auth login` session on the developer machine (same as `e2e-report-issue.mjs`).
- Ingest workflow permissions: `contents: read` only — no need for `issues:` or `actions: write` from inside the workflow because the trigger happens externally.
- Nightly workflow permissions: unchanged (`contents: read`, `issues: write` — line 35–37); the new download step uses `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` which the workflow's `actions: read` default permits for in-org/in-repo artifact downloads.

## Common Pitfalls

### Pitfall 1: Schema-only sanity catches structural drift, NOT semantic regressions
**What goes wrong:** D-03 mandates schema-only validation. A future code change that produces iterations with valid schema but garbage values (e.g., `citation: "n/a"` for every PASS) passes the gate.
**Why it happens:** Semantic correctness was deferred to Phase 33's re-run validator. Anyone reading just Phase 32's tests might assume schema = correctness.
**How to avoid:** Include an explicit comment in the new `tests/unit/uat-phase32-fixture.test.js` saying "Semantic correctness is Phase 33's gate; this test validates structure only" so future readers don't misinterpret the scope.
**Warning signs:** A PR comment asking "shouldn't we assert PASS:wrong_citation ratio?" — no, Phase 32 deliberately doesn't.

### Pitfall 2: `--phase 32` typed as `--phase=32` breaks parseArgs
**What goes wrong:** The existing parseArgs at line 81–107 uses index-based `argv[i]` / `argv[i+1]` lookup. Equals-syntax (`--phase=32`) becomes a single arg and the value-read fails.
**Why it happens:** No existing flag uses equals syntax; `--iterations 10` is the only precedent.
**How to avoid:** Either explicitly reject equals-syntax with a clear error in `parseArgs`, OR add an `argv[i].startsWith('--phase=')` branch. **Recommend the explicit-reject path** — it's the smaller change and matches the existing flag style.
**Warning signs:** Docs or shipped npm scripts using equals syntax.

### Pitfall 3: Upload helper succeeds but nightly never runs the new step
**What goes wrong:** Helper passes `llm_run_id`, nightly is triggered, but the gating expression `if: inputs.llm_run_id != ''` skips the step because of a YAML parser quirk (e.g., the input default is `null` rather than `''`).
**Why it happens:** YAML default values for `workflow_dispatch` inputs differ between `null` and `''` (empty string). Cron triggers leave the input absent → it evaluates as `null` in expressions, not `''`. See e2e-nightly.yml:129 comment for the prior-art note on this exact issue (Phase 29 Pitfall 1).
**How to avoid:** Explicitly set `default: ''` on the input definition (not `default: null`, not omitting it). Mirror line 119 of e2e-nightly.yml which uses `inputs.force_full_suite = "true"` comparison safely because `force_full_suite` has `default: false`.
**Warning signs:** A nightly cron run shows the download step as "skipped" — confirm by inspecting the `if:` expression on the actual run page.

### Pitfall 4: Phase-32 ledger entries pollute monthly cap accounting
**What goes wrong:** A Phase 32 UAT attempt at $5 + a Phase 33 dev session at $9 push the monthly total over $80 and trigger the warn message during normal work.
**Why it happens:** D-13/D-14 deliberately use the **same** monthly cap; the phase tag is additive, not segregating. This is correct design but surprising.
**How to avoid:** Document this in the helper's stdout and in the `32-UAT-EVIDENCE.md` template — "Phase 32 spend counts against the global $80/$100 monthly cap too."
**Warning signs:** A user asks "why am I getting WARN messages — I haven't used $80 of Phase 32 budget?"

### Pitfall 5: gh CLI race produces empty `gh run list` filter result
**What goes wrong:** Helper triggers ingest, settles 3s, queries — but GitHub backend is briefly slow and the new run isn't visible yet.
**Why it happens:** cli/cli#5493 — variable backend lag.
**How to avoid:** Surface a clear error ("ingest run not yet visible — retry helper") and let the user retry. D-11's 2-retry budget covers this. Do NOT increase the settle delay beyond 5s as that hurts UX for the 95% case.
**Warning signs:** Intermittent "could not locate ingest run after trigger" with no underlying gh CLI error.

### Pitfall 6: Mid-run abort leaves un-finalized `llm-report.json`
**What goes wrong:** Phase cap mid-run hits $10 mid-iteration. The `return { stopAll: true }` exits the iteration loop, but `finalizeLlmReport` runs only at the very end of `main()`.
**Why it happens:** The existing `finalizeLlmReport` call is at line 434, **after** the for-loop at 424–432. The `stopAll` path correctly breaks the loop, so `finalizeLlmReport` does run.
**How to avoid:** **Already handled correctly** by existing code structure. The plan should add a Vitest test asserting that on stopAll the report's `finished_iso` is set (existing pattern from `tests/unit/llm-report.test.js` Test 8).
**Warning signs:** A future refactor moves `finalizeLlmReport` inside the loop — would break partial-run finalization.

### Pitfall 7: Helper crashes if `gh auth login` is stale
**What goes wrong:** User hasn't run `gh auth status` recently; the first `gh workflow run` returns a 401 or `gh: not authenticated`.
**Why it happens:** No pre-flight auth check.
**How to avoid:** Helper should `execSync('gh auth status', { stdio: 'ignore' })` first; on non-zero exit, print "Run `gh auth login` first" and exit cleanly.
**Warning signs:** A failed upload with an unhelpful `gh` stderr blob.

### Pitfall 8: `tests/e2e/fixtures/` directory doesn't exist
**What goes wrong:** Helper or commit step fails because the parent directory is absent.
**Why it happens:** Confirmed via `ls tests/e2e/fixtures/`: "No such file or directory."
**How to avoid:** Plan must include "create directory" as an explicit task (or commit a `.gitkeep`). The fixture commit step itself will fail otherwise.
**Warning signs:** A git error "directory does not exist" on the user's first commit attempt.

## Code Examples

### Example 1: Phase cap pre-flight check (D-15)
```javascript
// Source: extension of pattern at scripts/e2e-explore.mjs:401–406
// Insert after line 409 in e2e-explore.mjs
if (phase != null) {
  const phaseCap = checkPhaseSpendCap(initialLedger, phase);
  if (phaseCap.status === 'block') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
    process.exit(6);  // new exit code
  }
  if (phaseCap.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
  }
}
```

### Example 2: Phase mid-run cap check (D-16)
```javascript
// Source: extension of pattern at scripts/e2e-explore.mjs:131–141
// Insert after the appendLedgerEntry at line 196 (and after the retry append at line 232)
if (phase != null) {
  const fresh = readLedger(LEDGER_PATH);
  const phaseCap = checkPhaseSpendCap(fresh, phase);
  if (phaseCap.status === 'block') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message} — aborting after iteration ${iterationN}\n`);
    // Append the current iteration first (already happened above), then signal stop.
    // finalizeLlmReport (line 434) runs after the loop and stamps finished_iso.
    return { stopAll: true };
  }
  if (phaseCap.status === 'warn') {
    process.stderr.write(`[e2e-explore] ${phaseCap.message}\n`);
  }
}
```

### Example 3: Fixture round-trip Vitest test (UAT-01 schema gate)
```javascript
// Source: tests/unit/llm-report.test.js Test 13 (line 304–316) pattern
// New file: tests/unit/uat-phase32-fixture.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLlmIteration } from '../e2e/lib/llm-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../e2e/fixtures/uat-phase32-llm-report.json');

describe('Phase 32 UAT fixture — schema sanity (D-03)', () => {
  it('parses', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
    const r = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(r.iterations.length).toBeGreaterThanOrEqual(10);  // D-10
  });
  it('every iteration passes appendLlmIteration schema guard', () => {
    const r = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    // Round-trip via a tmp file mirrors the existing pattern; throws on schema miss.
    // ... (see Pattern 3 above)
  });
  // SEMANTIC CORRECTNESS IS PHASE 33'S GATE — this test validates structure only.
});
```

### Example 4: CI download + validate step (in e2e-nightly.yml)
```yaml
# Insert after line 97 (after "Ensure e2e-nightly label exists")
- name: Download and validate LLM report (if llm_run_id provided)
  if: inputs.llm_run_id != ''
  run: |
    mkdir -p downloaded-llm-report
    gh run download ${{ inputs.llm_run_id }} -n llm-report -D downloaded-llm-report
    # Schema-only validation per D-03/D-06 — round-trip iterations through
    # the existing appendLlmIteration validator (tests/e2e/lib/llm-report.js:197)
    node -e "
      import('./tests/e2e/lib/llm-report.js').then(({ appendLlmIteration }) => {
        const fs = require('node:fs');
        const r = JSON.parse(fs.readFileSync('downloaded-llm-report/llm-report.json', 'utf8'));
        const tmp = require('node:os').tmpdir() + '/uat-validate.json';
        fs.writeFileSync(tmp, JSON.stringify({
          run_id: r.run_id, started_iso: r.started_iso, finished_iso: r.finished_iso,
          iterations_total: 0, summary: r.summary, iterations: []
        }));
        for (const it of r.iterations) appendLlmIteration(tmp, it);
        console.log('schema OK: ' + r.iterations.length + ' iterations');
      });
    "
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Manual `gh workflow run e2e-nightly.yml -f llm_run_id=<id>` after a local explore | `npm run e2e:upload-llm-report` helper does both stages | Phase 32 (this phase) | Zero manual steps after explore; loop closes reliably |
| Single ledger entry shape (Phase 31) | Entry shape gains optional `phase` field (D-14) | Phase 32 | Backward-compat — `phase: null` for legacy entries; phase sums scope per-workstream budgets |
| Monthly cap only ($80 warn / $100 block) | Monthly + per-phase cap ($10 phase-32 cap on top) | Phase 32 | Per-workstream budget guardrails without forking the ledger file |
| No CI consumption of `llm-report.json` | New gated download+validate step in nightly | Phase 32 | Validates the local→CI handoff path; sets up Phase 36's triage pipeline insertion point |

**Deprecated/outdated:** None — Phase 32 is purely additive. No existing capability is being removed or replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A 3-second settle delay between `gh workflow run` and `gh run list` is sufficient in this repo's throughput | Two-Stage Upload Helper Mechanics, Pattern 1 | Empty filter results → helper fails. D-11's 2-retry budget mitigates. Could expand to 5s if intermittent. |
| A2 | Typical Phase 32 UAT runs ≤ 20 iterations, keeping base64 payload < 60KB | Payload Size Constraint | Larger runs fail at the helper's size guard with a clear error; user runs fewer iterations. Acceptable failure mode. |
| A3 | The user's `gh auth login` session is valid at helper invocation time | Pitfall 7 | Helper exits non-zero with auth-status guidance. User reauths and retries. |
| A4 | Strict `^\d+$` validation on `--phase` is preferred (Claude's discretion area per CONTEXT.md) | Standard Stack — Alternatives Considered | Permissive variant works too; this is a quality-of-error-message choice, not a correctness one. |
| A5 | The download+validate step in nightly belongs as a step (not a separate job) | Standard Stack — Alternatives Considered | If a separate job is preferred for isolation/timeout reasons, refactor is trivial — single-step → single-job promotion. |
| A6 | The test surface for the upload helper is "Vitest mock-execSync unit tests + manual integration during UAT" — no live E2E for the helper itself | Validation Architecture (below) | Helper is pure orchestration; mock-`gh` covers the orchestration logic; UAT covers the live path. If a helper bug ships, D-11's 2-retry budget surfaces it loudly. |
| A7 | `actions/upload-artifact@v4` retention-days default behavior matches our 14-day expectation when explicitly set | NEW FILE: e2e-ingest-llm-report.yml | Tested in production by e2e-nightly.yml:184 (same v4 + 14d) — low risk. |
| A8 | The new `e2e-ingest-llm-report.yml` workflow does not need `gh label create` setup (no issues filed) | NEW FILE: e2e-ingest-llm-report.yml | Confirmed by reading e2e-nightly.yml — label management is only for the issue-filer step which Phase 32 doesn't add. |

**User confirmation needed at plan-phase time:**
- A1 (settle delay), A2 (size budget), and A6 (helper test surface) are the items most worth surfacing in `/gsd:discuss-phase` for explicit confirmation if not already implicitly accepted via CONTEXT.md's Claude's-discretion clauses.

## Open Questions

1. **Should the helper auto-retry on race-condition failures (within D-11's 2-retry budget) or surface every failure for human re-run?**
   - What we know: D-11 grants 2 helper retries; the race is documented and 3s settle is empirically reliable.
   - What's unclear: whether the budget is meant to be consumed by automatic in-helper retries or by the human re-invoking `npm run e2e:upload-llm-report`.
   - Recommendation: Manual re-invoke (human pulls the trigger). Auto-retry inside the helper hides the failure mode from `32-UAT-EVIDENCE.md` and complicates the helper. The user is at the keyboard during upload anyway.

2. **Where should `32-UAT-EVIDENCE.md` live: phase dir or `.planning/`?**
   - What we know: D-02 says "in the phase directory."
   - What's unclear: nothing — D-02 is explicit. Listed only for completeness.
   - Recommendation: `.planning/phases/32-human-uat-verification/32-UAT-EVIDENCE.md`.

3. **Should the helper attempt to verify the ingest workflow actually completed (artifact uploaded) before triggering nightly?**
   - What we know: D-07 says "no polling."
   - What's unclear: a non-polling alternative would be a single post-trigger `gh run view <id> --json status` check.
   - Recommendation: Skip — D-07 is explicit. If the ingest fails, the nightly download step will fail loudly with a clear `gh run download: artifact not found` and D-11 retry kicks in.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `gh` CLI | Upload helper, nightly download step | ✓ | 2.83.1 (verified) | — (hard requirement; helper exits with `gh auth login` guidance if missing) |
| Node 22 | All scripts | ✓ | (assumed per package.json `setup-node node-version: 22`) | — |
| `jq` | Ingest workflow's JSON sanity check | ✓ (ubuntu-latest preinstalled) | — | Could be removed if undesired; `node -e "JSON.parse(...)"` equivalent |
| `base64` | Ingest workflow's payload decode | ✓ (ubuntu-latest + WSL preinstalled) | — | — |
| `claude` CLI | The UAT itself (per D-01, user runs locally) | (user-side; not verified by Claude) | ≥ 2.1.139 per Phase 31 README | — (hard requirement for UAT; e2e-explore.mjs:110 already checks `claude --version`) |
| Anthropic Max 5 subscription | UAT execution | (user-side) | — | — (hard requirement; D-01) |
| GitHub repo `actions: write` permission for triggering | Helper | (assumed for repo owner) | — | — |

**Missing dependencies with no fallback:** None for Claude-side execution. User-side `claude` CLI + Max 5 subscription are explicitly out of scope per D-01.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 3.x (existing — package.json:33 `"vitest": "^3.0.0"`) |
| Config file | `vitest.config.js` (existing — `include: ['tests/**/*.test.js']`) |
| Quick run command | `npx vitest run tests/unit/llm-ledger.test.js tests/unit/uat-phase32-fixture.test.js` |
| Full suite command | `npm run test:src` (461 Vitest tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| UAT-01 | `npm run e2e:explore` produces `llm-report.json` with ≥10 schema-valid iterations | Manual (UAT) + structural Vitest on committed fixture | `npx vitest run tests/unit/uat-phase32-fixture.test.js` | ❌ Wave 0 — new test file |
| UAT-02 (a) — phase entry tagging | Each ledger entry carries `phase: "32"` when `--phase 32` passed | Unit | `npx vitest run tests/unit/llm-ledger.test.js -t "phase field"` | ❌ Wave 0 — extend existing test file |
| UAT-02 (b) — phase pre-flight cap | `e2e-explore --phase 32` aborts when phase total ≥ $10 | Unit (on `checkPhaseSpendCap`) + integration (spawnSync e2e-explore.mjs with seeded ledger) | `npx vitest run tests/unit/llm-ledger.test.js -t "checkPhaseSpendCap"` | ❌ Wave 0 |
| UAT-02 (c) — phase mid-run cap | Mid-run abort triggers and `finalizeLlmReport` still runs | Unit on cap helper + manual confirmation in UAT log | `npx vitest run tests/unit/llm-ledger.test.js -t "checkPhaseSpendCap warn/block"` | ❌ Wave 0 |
| UAT-02 (d) — monthly cap still works | Existing 461 tests pass unchanged | Regression | `npm run test:src` | ✅ |
| UAT-03 (a) — helper triggers ingest + captures run_id | Helper successfully orchestrates two-stage upload with mock `execSync` returning canned `gh run list` JSON | Unit (vi.mock node:child_process pattern from `tests/unit/e2e-report-issue.test.js`) | `npx vitest run tests/unit/e2e-upload-llm-report.test.js` | ❌ Wave 0 |
| UAT-03 (b) — nightly downloads + schema-validates | Manual confirmation by inspecting the triggered nightly run's step output | Manual — log presence of "schema OK: N iterations" in `Download and validate LLM report` step | (manual) | n/a |
| UAT-03 (c) — CI-guard still rejects explore in CI | Existing `tests/e2e/scripts/e2e-explore-ci-guard.test.js` continues to pass with `--phase` flag | Integration | `npx vitest run tests/e2e/scripts/e2e-explore-ci-guard.test.js` | ✅ |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/llm-ledger.test.js tests/unit/uat-phase32-fixture.test.js tests/unit/e2e-upload-llm-report.test.js` (~3–5s)
- **Per wave merge:** `npm run test:src` (461 + new tests; ~30s)
- **Phase gate:** Full suite green + successful live UAT pass (`npm run e2e:explore -- --phase 32 --iterations 10`) + successful `npm run e2e:upload-llm-report` invocation + nightly run showing "schema OK"

### Wave 0 Gaps
- [ ] `tests/unit/uat-phase32-fixture.test.js` — schema sanity round-trip; covers UAT-01
- [ ] `tests/unit/e2e-upload-llm-report.test.js` — orchestration via mocked `execSync` (mirrors `tests/unit/e2e-report-issue.test.js` ghClient injection pattern); covers UAT-03 (a)
- [ ] Extension to `tests/unit/llm-ledger.test.js` — new tests for `phase` field passthrough, `phaseTotal`, `checkPhaseSpendCap` (warn/block boundaries at $8/$10)
- [ ] `tests/e2e/fixtures/` — new directory (does not currently exist; confirmed via `ls`)
- [ ] `tests/e2e/fixtures/uat-phase32-llm-report.json` — placeholder gitkeep or empty fixture file; replaced by real UAT output at execute time
- [ ] Test for the `e2e-explore.mjs` `--phase` flag value validation regex (rejects `--phase v32`, accepts `--phase 32`, accepts `--phase 99`)

**Manual-only verifications:**
| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| Live `npm run e2e:explore -- --phase 32 --iterations 10` produces a real `llm-report.json` ≥ 10 iterations | UAT-01 | Requires Max 5 subscription credit; ~$1–3 cost; cannot be CI-automated | After Wave 0 green: run command; verify file exists at `tests/e2e/artifacts/<runId>/llm-report.json` with ≥ 10 iterations; copy to fixture path; commit |
| `npm run e2e:upload-llm-report` end-to-end triggers nightly with `llm_run_id` and nightly's download step succeeds | UAT-03 | Requires real GitHub Actions execution | After fixture commit: run helper; click through URL; confirm nightly run page shows new "Download and validate LLM report" step as green with "schema OK: N iterations" in log |

## Security Domain

`security_enforcement` not set in `.planning/config.json` (only `nyquist_validation: true` is set). Treating security as enabled per default. Phase 32's surface is small but does include shell-out and base64 input — worth a brief audit.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes (helper) | Existing `gh auth` session — no new credentials |
| V3 Session Management | no | Helper is stateless |
| V4 Access Control | yes (CI) | `permissions: contents: read` on ingest workflow — minimum needed |
| V5 Input Validation | yes | `--phase` regex `^\d+$`; base64 payload size guard (60KB); JSON parse + schema validation on download |
| V6 Cryptography | no | No new crypto; existing fingerprint sha256 unchanged |
| V11 Cmd injection | yes | `execSync` calls — `gh workflow run -f payload_b64=@-` uses stdin (no shell interpolation of payload); `gh workflow run e2e-nightly.yml -f llm_run_id=${ingestRunId}` — ingestRunId is a number from JSON parse, safe |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Malicious `--phase` value triggering shell injection (e.g., `--phase '32; rm -rf /'`) | Tampering | Strict regex `^\d+$` at parseArgs; entry shape doesn't feed into shell anyway (it's pushed into JSON) |
| Oversized base64 payload bypassing workflow_dispatch cap, causing silent truncation in CI | Denial of service / Data corruption | Pre-flight size guard at 60KB ceiling in helper; ingest workflow's `jq -e .` post-decode catches truncated JSON |
| Stale or malicious `llm_run_id` pointed at an attacker-uploaded artifact | Spoofing | Phase 32 scope: D-06 mandates schema-only validation; Phase 36 hardening (per CONTEXT.md Deferred) adds age-limit + auth check |
| Race-window where two `gh workflow run` dispatches collide and helper captures the wrong run_id | Tampering | `createdAt > triggerISO` filter; concurrency group `e2e-ingest-llm-report` on ingest workflow serializes |
| Ledger entry injection (manually-crafted `phase` value) | Tampering | Ledger is gitignored, local-only — adversary needs local FS write; out of threat model per Phase 31 |

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `scripts/e2e-explore.mjs` (442 lines, full read), `tests/e2e/lib/llm-ledger.js` (194 lines, full read), `tests/e2e/lib/llm-report.js` (231 lines, full read), `.github/workflows/e2e-nightly.yml` (187 lines, full read), `tests/e2e/scripts/e2e-explore-ci-guard.test.js` (63 lines, full read), `scripts/e2e-report-issue.mjs` (389 lines, full read), `tests/unit/llm-ledger.test.js`, `tests/unit/llm-report.test.js`, `tests/unit/e2e-report-issue.test.js`, `tests/e2e/lib/llm-driver.js` (validateLlmSelection at line 258), `scripts/llm-cron-run.sh`, `package.json`, `.gitignore`, `tests/e2e/README.md`, `.github/workflows/ci.yml`
- gh CLI direct probe: `gh --version` (2.83.1), `gh workflow run --help`, `gh run list --help`, `gh run download --help`
- `.planning/research/SUMMARY.md` — Phase 1 rationale, Gaps to Address (llm_run_id), Pitfalls 10/11/12
- `.planning/phases/32-human-uat-verification/32-CONTEXT.md` — D-01..D-16 decisions
- `.planning/REQUIREMENTS.md` — UAT-01/02/03 acceptance criteria
- `.planning/ROADMAP.md` — Phase 32 details + Phases 33–37 downstream context

### Secondary (MEDIUM confidence)
- [cli/cli#5493 — Return action ID when triggering Actions via CLI](https://github.com/cli/cli/issues/5493) — race condition documentation + 15s settle workaround
- [community/community#120093 — workflow_dispatch inputs limits](https://github.com/orgs/community/discussions/120093) — 65,535 char total payload cap confirmed
- [community/community#8774 — workflow_dispatch max inputs](https://github.com/orgs/community/discussions/8774) — 10 → 25 input limit context

### Tertiary (LOW confidence — verified against primary sources)
- WebSearch: "gh CLI workflow_dispatch input max size limit base64 file input race condition databaseId" — surfaced cli/cli#5493 + community discussions; cross-verified against direct fetch of #5493

## Metadata

**Confidence breakdown:**
- Standard stack (reused modules): HIGH — every reused symbol read in source, line numbers cited
- Insertion points (line numbers): HIGH — verified by direct grep against current file state
- gh CLI ergonomics: HIGH — `gh --version` + `--help` probed; race condition cross-verified via cli/cli#5493
- Payload size cap: HIGH — official GitHub community confirmation (65,535 chars total)
- Test surface for helper: MEDIUM — Vitest mock-execSync is a sensible mirror of `e2e-report-issue.test.js`; planner may prefer integration-only
- Pitfalls: HIGH — derived from direct code inspection + known upstream issues
- Validation architecture: HIGH — mirrors existing 31-VALIDATION.md template

**Overall confidence:** HIGH

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days — stack and gh CLI behavior are stable; revisit only if `gh` CLI ships a `--json` mode on `gh workflow run` that returns the run_id directly, which would obsolete the race-mitigation pattern)

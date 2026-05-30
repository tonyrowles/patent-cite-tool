# Phase 36: Quarantine CI Integration + Pipeline Orchestrator - Research

**Researched:** 2026-05-27
**Domain:** GitHub Actions CI orchestration, Playwright CLI flags, Node.js spawnSync CLI chaining, Vitest spawnSync integration testing
**Confidence:** HIGH

## Summary

Phase 36 is pure integration glue — it wires the Phase 33–35 CLIs (rerun-validator → triage-classifier → issue-file → quarantine-append) into a `run-triage-pipeline.mjs` orchestrator, ships a non-gating `quarantine.spec.js` Playwright suite over the (currently empty) `TEST_CASES_QUARANTINE` corpus, and extends `e2e-nightly.yml` to run both only when an `llm_run_id` workflow_dispatch input is provided. No new npm dependencies. Every pattern this phase needs already exists in the codebase: `continue-on-error: true` non-gating steps (regression at line 191, fault-injection at line 208), `if: inputs.llm_run_id != ''` gating (download step at line 108), label self-bootstrap via `gh label create --force` (e2e-nightly label at line 97), `spawnSync` CLI chaining with `cwd: PROJECT_ROOT` (promote-from-quarantine Pitfall 6), and the mock-gh + tmpDir + `QUARANTINE_CORPUS_PATH_OVERRIDE` spawnSync integration-test harness (Phase 35 Plan 04).

The two research questions with real answers: (1) **Both `--retries=0` and `--pass-with-no-tests` exist and are VERIFIED in the installed `@playwright/test@1.60.0`** — confirmed by reading `node_modules/.bin/playwright test --help`. (2) **The `--source quarantine` branch reuses the `processReport` per-case `report.json` path, NOT the triage path** — because `quarantine.spec.js` (mirroring `regression.spec.js`) writes an RPT-01 `report.json` via `appendCase`/`reportPathFor`, the existing `processReport` function already handles per-case filing; the only change needed is making the `e2e-nightly` label parameterizable so `--source quarantine` stamps `e2e-quarantine` instead.

**Primary recommendation:** Add `e2e:quarantine` + `e2e:triage-pipeline` npm scripts, write `run-triage-pipeline.mjs` as a thin `spawnSync` chain (exit-0-always), parameterize the hardcoded `NIGHTLY_LABEL` in `e2e-report-issue.mjs` so `--source quarantine` reaches the existing `processReport` path with `e2e-quarantine`, and append 4 gated steps to `e2e-nightly.yml` after the existing fault-injection steps. Document the timeout budget in a YAML comment: empty corpus = 0 added minutes; project ceiling at ~20 cases.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Quarantine corpus execution | Playwright spec (`quarantine.spec.js`) | — | Mirrors `regression.spec.js`; one test per `TEST_CASES_QUARANTINE` entry; drives the built extension |
| Empty-corpus exit-0 | Playwright CLI flag (`--pass-with-no-tests`) | — | Runner-level concern; no config fork (D-02/D-03) |
| Retries override | Playwright CLI flag (`--retries=0`) | — | Overrides config's `retries: CI ? 1 : 0` without forking config (D-02) |
| Pipeline stage chaining | Node orchestrator (`run-triage-pipeline.mjs`) | spawnSync | Composes 4 existing CLIs; exit-0-always (D-05/D-06) |
| Stage isolation / failure tolerance | Node orchestrator | — | Each spawnSync result inspected; failures logged, never abort (D-06) |
| Issue filing for quarantine failures | Existing `e2e-report-issue.mjs` (`--source quarantine`) | gh CLI | Reuses `processReport` + fingerprint dedup; new label only (D-11/D-15) |
| CI gating + step ordering | GitHub Actions YAML | — | `if: inputs.llm_run_id != ''`; mirrors download step (D-09/D-12) |
| Non-gating execution | GitHub Actions `continue-on-error: true` | — | Mirrors regression/fault-injection steps (D-10) |
| Label bootstrap | GitHub Actions `gh label create --force` | — | Mirrors e2e-nightly label step (D-13) |
| Timeout budget enforcement | GitHub Actions `timeout-minutes` (per-step) | YAML comment | Quarantine step gets own cap so it can't starve the 30-min job (D-14) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.60.0 | Quarantine spec runner; `--retries`, `--pass-with-no-tests` flags | Already the project's E2E runner; both flags VERIFIED present |
| Node.js | 22 | `run-triage-pipeline.mjs` orchestrator; `spawnSync` | Project pins node-version 22 in `e2e-nightly.yml` line 61; zero-new-dep lock |
| `vitest` | ^3.0.0 | Integration tests (pipeline, --source quarantine, empty-corpus) | Existing `test:src` framework; spawnSync test harness established Phase 35 |
| `gh` CLI | (runner-provided) | Label bootstrap + issue create/edit | Already used throughout `e2e-nightly.yml` and `e2e-report-issue.mjs` |

**Zero new dependencies** — locked v3.1 decision (STATE.md line 77). All orchestration is Node 22 built-ins (`node:child_process` spawnSync, `node:path`, `node:fs`, `node:url`) layered on the 4 existing CLIs.

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Verdict |
|------------|-----------|----------|---------|
| `--retries=0` CLI flag | Fork playwright config with a `quarantine` project | Adds a second config / projects[] restructure | REJECTED by D-02 — CLI override is simpler, no fork |
| Quarantine in `e2e-nightly.yml` | Separate `e2e-quarantine.yml` workflow | Same concurrency group → mutex collision (Pitfall 15) | REJECTED — v3.1 pre-lock; collision risk |
| `--source quarantine` → triage path | Reuse `processTriageReport` | Quarantine spec emits RPT-01 `report.json`, not a triage report | REJECTED — reuse `processReport` per-case path (D-15) |

**Installation:** None. (Verify Playwright flags with `node_modules/.bin/playwright test --help`.)

**Version verification (performed this session):**
- `cat node_modules/@playwright/test/package.json` → `"version": "1.60.0"` `[VERIFIED: node_modules]`
- `node_modules/.bin/playwright test --help` → lists `--pass-with-no-tests` and `--retries <retries>` `[VERIFIED: installed CLI help]`

## Package Legitimacy Audit

> No external packages are installed in this phase (zero-new-dependency lock). All four chained CLIs and both Playwright flags are already present in the repo. Slopcheck N/A.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No installs — phase composes existing code only |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
workflow_dispatch (llm_run_id=12345)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ e2e-nightly.yml job (timeout-minutes: 30, concurrency: e2e-nightly)│
│                                                                    │
│  [existing] checkout → setup-node → install → build:chrome         │
│  [existing] Ensure e2e-nightly label (line 97)                     │
│  [existing] Download+validate LLM report  ── if llm_run_id != '' ──┤
│  [existing] smoke → regression → file-issues → fault-injection     │
│                                                                    │
│  ── NEW STEPS (all gated: if: inputs.llm_run_id != '') ──          │
│  (2) Ensure e2e-quarantine label  (gh label create --force)        │
│  (3) run-triage-pipeline.mjs --llm-report <downloaded path>        │
│         │                                                          │
│         ▼  spawnSync chain (cwd: PROJECT_ROOT, exit 0 always)      │
│      ┌──────────────┐  ┌───────────────┐  ┌──────────┐  ┌────────┐ │
│      │rerun-validator│→│triage-classifier│→│report-issue│→│quar-  │ │
│      │ → rerun-      │  │ (CI gate:      │  │ --source  │  │append │ │
│      │   report.json │  │  LLM 2nd-pass  │  │  triage   │  │ → corpus│ │
│      │               │  │  SKIPPED)      │  │           │  │  upsert│ │
│      └──────────────┘  └───────────────┘  └──────────┘  └────────┘ │
│         all intermediates land in artifacts/{runId}/               │
│  (4) Quarantine spec (continue-on-error: true, timeout-minutes: 15)│
│         playwright test specs/quarantine.spec.js --retries=0       │
│              --pass-with-no-tests  → report.json (RPT-01)          │
│  (5) File quarantine issues  ── if quarantine step failed ──       │
│         e2e-report-issue.mjs --source quarantine                   │
│              → processReport(report.json) → gh issue create        │
│                 --label e2e-quarantine  (fingerprint dedup reused)  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼  job ALWAYS exits success; filed issues are the failure signal
```

Without `llm_run_id`, steps 2–5 skip entirely → existing regression behavior byte-identical (SC-3).

### Recommended Project Structure
```
scripts/
├── run-triage-pipeline.mjs        # NEW — spawnSync chain orchestrator
├── e2e-rerun-validator.mjs        # existing (stage 1)
├── e2e-triage-classifier.mjs      # existing (stage 2, CI-gated LLM)
├── e2e-report-issue.mjs           # MODIFIED — add 'quarantine' to --source
└── quarantine-append.mjs          # existing (stage 4)
tests/e2e/specs/
└── quarantine.spec.js             # NEW — mirrors regression.spec.js
tests/e2e/scripts/
└── e2e-run-triage-pipeline.test.js  # NEW — spawnSync integration test
tests/unit/
└── e2e-report-issue.test.js       # MODIFIED — add --source quarantine label test
.github/workflows/
└── e2e-nightly.yml                # MODIFIED — 4 new gated steps + timeout comment
```

### Pattern 1: spawnSync stage chain with cwd: PROJECT_ROOT, exit-0-always (D-05/D-06)
**What:** Each of the 4 stages is invoked via `spawnSync('node', [scriptPath, ...args], { cwd: PROJECT_ROOT, encoding: 'utf8' })`. The result's `.status` is inspected and logged into a summary object, but a non-zero status NEVER aborts the chain and the orchestrator always `process.exit(0)`.
**When to use:** Always — nightly cron philosophy (the filed issue is the signal, not a red X).
**Example (composed from existing patterns — promote-from-quarantine.mjs spawnSync + rerun-validator main()):**
```javascript
// Source: pattern from scripts/promote-from-quarantine.mjs (spawnSync cwd:PROJECT_ROOT)
//         + scripts/e2e-rerun-validator.mjs (D-11 dirname-sibling output)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

function runStage(label, scriptRel, args) {
  const r = spawnSync('node', [path.join(PROJECT_ROOT, scriptRel), ...args], {
    cwd: PROJECT_ROOT,           // Pitfall 6 — pin cwd so sibling-discovery resolves
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = r.status === 0;
  process.stdout.write(`[run-triage-pipeline] ${label}: ${ok ? 'ok' : 'FAILED (status=' + r.status + ')'}\n`);
  if (r.stdout) process.stdout.write(r.stdout);
  if (!ok && r.stderr) process.stdout.write('[stderr] ' + r.stderr);
  return ok;
}

// llmReport path resolves the run dir; intermediates land in the same artifacts/{runId}/
const runDir = path.dirname(llmReportPath);
const rerunReport  = path.join(runDir, 'rerun-report.json');
const triageReport = path.join(runDir, 'triage-report.json');

runStage('rerun-validator',   'scripts/e2e-rerun-validator.mjs',   ['--input', llmReportPath]);
runStage('triage-classifier', 'scripts/e2e-triage-classifier.mjs', ['--input', llmReportPath]); // CI-gates internally → exit 1, chain continues
runStage('issue-file',        'scripts/e2e-report-issue.mjs',      ['--source', 'triage', '--triage-report', triageReport]);
runStage('quarantine-append', 'scripts/quarantine-append.mjs',     ['--input', triageReport]);

process.exit(0); // D-06 — ALWAYS 0
```

**Critical detail — CI gate behavior (D-08):** `e2e-triage-classifier.mjs` lines 154–160 exit **1** when `CI=true || GITHUB_ACTIONS=true`. This is CORRECT (subscription-local only, TRIAGE-04). The pipeline must treat this as a normal logged failure, not an error. Downstream stages (`issue-file`, `quarantine-append`) then find NO `triage-report.json` and no-op gracefully:
- `e2e-report-issue.mjs --source triage` exits 1 if triage-report missing (line 639–642) — but its own exit 1 also doesn't abort the chain.
- `quarantine-append.mjs` exits 1 if input/siblings missing (lines 195–212).

**IMPORTANT NUANCE [VERIFIED: code inspection]:** Because the triage-classifier CI gate fires in CI, in the *nightly cron path* `triage-report.json` is never written, so stages 3–4 always no-op. The triage pipeline's *issue-filing + quarantine-append* effects only materialize when run **locally** (CI unset). In CI the pipeline's real job is to produce `rerun-report.json` and log "LLM second-pass skipped in CI" (D-08). This is the documented design — the plan's integration test (SC-2, D-16) must therefore run with `CI` UNSET to exercise the full chain end-to-end.

### Pattern 2: quarantine.spec.js mirroring regression.spec.js (D-01)
**What:** Iterate `TEST_CASES_QUARANTINE` with one `test()` per entry. Each entry's schema (`id`, `patentFile`, `selectedText`, `category` + 3 quarantine-only keys) is a superset of `tests/test-cases.js`. Empty corpus → 0 tests → `--pass-with-no-tests` exits 0 (SC-1).
**When to use:** Always for this spec.
**Key differences from regression.spec.js:**
- The corpus uses `patentFile` (e.g., `./tests/fixtures/US11427642.json`) not necessarily a live patent ID; the regression spec derives a live patent ID via `patentIdFromCaseId`. The quarantine corpus `id` shape (`US11427642-...`) is the same, so `patentIdFromCaseId` reuse works for real-patent cases.
- Quarantine entries originate from real failures, so they are EXPECTED to fail — the spec is non-gating (continue-on-error). The spec should still `appendCase(report.json)` so the issue filer (`--source quarantine`) has per-case detail.
- Reuse `reportPathFor(RUN_ID)` + `appendCase` so the RPT-01 `report.json` lands in `artifacts/{PLAYWRIGHT_RUN_ID}/report.json` — exactly what `e2e-report-issue.mjs --source quarantine` reads.

### Pattern 3: `--source quarantine` reuses processReport, parameterizes the label (D-15)
**What:** `quarantine.spec.js` emits an RPT-01 `report.json` (same shape as regression). The existing `processReport(report, {ghClient, runId, repo})` already files per-case issues with fingerprint dedup. The ONLY change: `e2e-report-issue.mjs` currently hardcodes `const NIGHTLY_LABEL = 'e2e-nightly'` (line 43) used in `createIssue`, `commentIssue` path via `listOpenNightlyIssues`. For `--source quarantine`, thread an `e2e-quarantine` label through.
**Minimal implementation:**
1. Extend `parseSourceArgs` (line 566) to accept `quarantine` as a third valid `--source` value (currently only `regression`/`triage`, line 584).
2. Make the label parameterizable: pass the label into `makeRealGhClient(repo, label)` or into `processReport(report, {..., label})` so `createIssue` uses `--label e2e-quarantine` instead of `e2e-nightly`, and `listOpenNightlyIssues` searches `labels=e2e-quarantine` for dedup.
3. CR-01 reuse: `processReport` already calls `sanitizeCaseId` (line 435) — the quarantine path inherits this guard for free (no new sanitization code needed, but the integration test must assert it).
4. The `report.json` for quarantine lives at `artifacts/{PLAYWRIGHT_RUN_ID}/report.json` — same path the default regression branch reads (line 743–749). The `--source quarantine` branch can reuse this entire block, only swapping the label.

**Example (label parameterization):**
```javascript
// Source: scripts/e2e-report-issue.mjs lines 43, 470-495, 700-759 (existing) — extended
// Make the label a parameter rather than a module constant for the quarantine branch.
function makeRealGhClient(repo, label = 'e2e-nightly') {
  return {
    listOpenNightlyIssues() {
      const raw = execSync(
        `gh api repos/${repo}/issues --method GET -f labels=${label} -f state=open --paginate`, ...);
      ...
    },
    createIssue(title, body) {
      const escapedTitle = title.replaceAll('"', '\\"');
      const out = execSync(
        `gh issue create --title "${escapedTitle}" --label ${label} --body-file -`, ...);
      ...
    },
    ...
  };
}
// CLI: if (source === 'quarantine') gh = makeRealGhClient(repo, 'e2e-quarantine');
//      buildIssueTitle prefix '[e2e-nightly]' may also want a '[e2e-quarantine]' variant —
//      planner's call; the fingerprint/dedup is label-scoped so titles can stay or change.
```

> **Planner decision point:** `buildIssueTitle` (line 205) and `buildIssueBody` (line 241) hardcode the `[e2e-nightly]` / "E2E nightly failure" strings. For `--source quarantine` you may leave them (label disambiguates) or parameterize the prefix. The SC-4 test only asserts the **`e2e-quarantine` label arg**, so leaving the title is acceptable. Recommend keeping the title machinery shared and only swapping the label to minimize surface.

### Pattern 4: GitHub Actions gated + non-gating + per-step timeout (D-09/D-10/D-14)
**What:** Append 4 steps after the fault-injection issue-filer (after line 234). All gated `if: inputs.llm_run_id != ''`. The quarantine spec step adds `continue-on-error: true` AND its own `timeout-minutes`.
**Example (exact YAML idioms verified against existing file):**
```yaml
# --- Phase 36: quarantine + triage-pipeline (gated on llm_run_id) ---
- name: Ensure e2e-quarantine label exists
  if: inputs.llm_run_id != ''
  run: |
    gh label create "e2e-quarantine" \
      --color "d93f0b" \
      --description "Auto-filed by nightly quarantine suite" \
      --force 2>/dev/null || true
  # Mirrors "Ensure e2e-nightly label" (line 97). Color = 6-char hex, NO # prefix.
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Run triage pipeline
  if: inputs.llm_run_id != ''
  run: node scripts/run-triage-pipeline.mjs --llm-report downloaded-llm-report/llm-report.json
  # Exits 0 always (D-06). triage-classifier CI gate fires → LLM 2nd-pass skipped (D-08).

# TIMEOUT BUDGET (ORCH-03, SC-5):
#   job cap = 30 min (line 50). Current nightly: smoke(~1.5min) + regression(30 cases ×
#   ~90s + 2s throttle ≈ 46 min worst-case but weekday rotation keeps live wall-clock
#   well under cap in practice) + fault-injection(1 case ≈ 90s).
#   Quarantine adds: build:chrome (~60s, already built once above — re-run if step rebuilds)
#   + N_quarantine × ~90s/case (regression's per-test timeout, playwright.config.js line 17).
#   CURRENT: N=0 (empty corpus) → 0 added minutes. Full headroom.
#   CEILING: at ~20 cases, 20 × 90s = 30 min would alone exceed the job cap. The
#   per-step timeout-minutes below caps the quarantine step so it cannot starve the job;
#   if the corpus grows past ~20, switch to daily --grep rotation (deferred, D-14).
- name: Run quarantine spec (non-gating)
  id: quarantine
  if: inputs.llm_run_id != ''
  continue-on-error: true
  timeout-minutes: 15
  run: npm run e2e:quarantine
  # continue-on-error mirrors regression (line 191) — a quarantine failure never fails
  # the job (QUAR-04). timeout-minutes:15 (D-14) so quarantine can't consume the whole
  # 30-min budget. --retries=0 --pass-with-no-tests are in the npm script.

- name: File quarantine issues on failure
  if: inputs.llm_run_id != '' && steps.quarantine.outcome == 'failure'
  run: node scripts/e2e-report-issue.mjs --source quarantine
  # outcome == 'failure' fires when the quarantine spec had a failing test (D-11/D-16
  # discretion: outcome-based gating is simplest; parsing report.json gives per-case
  # detail but processReport already iterates report.json so no extra parse needed here).
```

### Anti-Patterns to Avoid
- **Separate `e2e-quarantine.yml` workflow:** Same concurrency group → schedule + dispatch mutex collision (Pitfall 15). Keep all steps in `e2e-nightly.yml`.
- **Forking playwright.config.js for a quarantine project:** D-02 explicitly rejects this. Use `--retries=0` CLI override.
- **Aborting the pipeline on first stage failure:** Violates D-06 exit-0-always. Each stage failure is logged, never thrown.
- **Running the triage-classifier expecting LLM output in CI:** The CI gate fires (exit 1) by design (D-08). Don't add `CI=` overrides in the workflow — heuristic path is the CI contract.
- **Re-deriving the run dir from scratch:** Use `path.dirname(llmReportPath)` (D-07) so intermediates co-locate with the downloaded artifact, matching each CLI's sibling-discovery convention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Empty-corpus exit 0 | Custom "if 0 tests then exit 0" wrapper | `--pass-with-no-tests` CLI flag | VERIFIED present in Playwright 1.60.0; native |
| Retries override | Second playwright config / projects[] | `--retries=0` CLI flag | D-02; native flag overrides config |
| Issue dedup for quarantine | New fingerprint scheme | Existing `processReport` + `fingerprint` + `findMatchingIssue` | Label-scoped dedup already works; just swap label |
| Case-ID shell-injection guard | New sanitizer | `sanitizeCaseId` (already in `processReport` line 435) | Phase 35 CR-01 hardened path; inherited free |
| Atomic corpus write | New temp-file-rename | `quarantine-append.mjs` (uses `atomicWriteJson`) | Phase 35 D-16 import-reuse |
| Stage chaining | Shell `&&` pipeline in YAML | `run-triage-pipeline.mjs` spawnSync | D-05; one orchestrator, testable, exit-0 control |
| Test isolation for corpus writes | afterEach file restoration | `QUARANTINE_CORPUS_PATH_OVERRIDE` env var | Phase 35 pattern; crash-safe (never dirties committed file) |
| Label bootstrap | Manual prereq / API call | `gh label create --force` step | D-13; mirrors existing e2e-nightly label step |

**Key insight:** This phase builds almost nothing new — it composes. The single genuinely new file is `run-triage-pipeline.mjs` (a ~80-line spawnSync chain). Everything else is a flag, a YAML step, or a one-parameter extension of an existing function.

## Runtime State Inventory

> Phase 36 is primarily code + CI-config. One runtime-state concern: the `e2e-quarantine` GitHub **label** is repo-side state, and the integration with live GitHub issues.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `tests/e2e/test-cases-quarantine.js` corpus is currently EMPTY (`TEST_CASES_QUARANTINE = []`). No migration — quarantine-append writes new entries; nothing to backfill. | None — verified by reading the file (line 5). |
| Live service config | `e2e-quarantine` GitHub **label** does not yet exist on the repo. It is self-bootstrapped by the workflow step (D-13, `gh label create --force`). No manual prereq. | Workflow step creates it idempotently. |
| OS-registered state | None — no cron registration changes (the existing `schedule: '0 6 * * *'` is unchanged; only steps are appended). | None — verified: only step additions to existing job. |
| Secrets/env vars | Reuses existing `GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_REPOSITORY`. New steps need `GH_TOKEN` env on the label-create step (mirrors download step env at line 117). No new secrets. | None — reuse existing env. |
| Build artifacts | `npm run e2e:quarantine` prefixes `build:chrome` (D-04). The job already runs `build:chrome` at line 92, so the quarantine npm script's prefix is redundant in CI but harmless (and required for local runs). | None — redundant rebuild is acceptable; flagged for planner. |

## Common Pitfalls

### Pitfall 1: Concurrency group collision (Pitfall 15 from PITFALLS.md)
**What goes wrong:** Extracting quarantine into a separate workflow with the same `concurrency: group: e2e-nightly` → schedule + dispatch hold the mutex and block each other for up to 30 min.
**Why it happens:** The static concurrency group (line 39) is shared; a second workflow with the same group name serializes against the first.
**How to avoid:** Keep quarantine as STEPS inside `e2e-nightly.yml` (D-12, v3.1 pre-lock). The existing job already owns the `e2e-nightly` group.
**Warning signs:** A `workflow_dispatch` trigger blocked 30+ min without starting; nightly runs timing out at exactly 30:00.

### Pitfall 2: Job timeout starvation (ORCH-03 root cause)
**What goes wrong:** Quarantine corpus grows; `N × 90s` per-case eats the shared 30-min `timeout-minutes` (line 50), killing the regression suite mid-run.
**Why it happens:** Per-test timeout is 90s (`playwright.config.js` line 17); 20 cases = 30 min alone.
**How to avoid:** Per-step `timeout-minutes: 15` on the quarantine step (D-14) so it self-caps. Document the budget arithmetic in a YAML comment (SC-5). Empty corpus = 0 risk today; flag the >20-case ceiling for future `--grep` rotation (deferred).
**Warning signs:** Regression step shows "The operation was canceled" with no error; quarantine step at exactly 15:00.

### Pitfall 3: Triage-classifier CI gate misread as a bug (D-08)
**What goes wrong:** Planner/implementer sees `e2e-triage-classifier.mjs` exit 1 in CI and tries to "fix" it by overriding `CI=` or routing LLM through API.
**Why it happens:** The exit-1-in-CI is a deliberate three-layer defense (line 154–160); it looks like a failure.
**How to avoid:** Treat exit 1 from the triage stage as expected in CI. The pipeline logs "LLM second-pass skipped in CI" and continues (D-06/D-08). The integration test (SC-2) must run with `CI` UNSET to exercise the full chain — in CI the chain legitimately no-ops past the triage stage.
**Warning signs:** A plan task that adds `env: CI: ''` to the triage-pipeline step. Reject it.

### Pitfall 4: GitHub issue body 65,536-char limit (Pitfall 6 from PITFALLS.md)
**What goes wrong:** Rich quarantine issue bodies exceed GitHub's limit; the fingerprint comment at the bottom is lost → dedup breaks.
**Why it happens:** `gh issue create` silently truncates or 422s on oversized bodies.
**How to avoid:** The quarantine path reuses `buildIssueBody` (line 228), which already slices `reason` to 1000 chars and places the fingerprint at the bottom in a compact table. Per-case bodies are small. The triage path (`buildIssuePayload`) places the fingerprint defensively. No new risk introduced by quarantine — but the planner should confirm the quarantine body stays under ~50k.
**Warning signs:** Dedup re-files the same case every night.

### Pitfall 5: `inputs.llm_run_id != ''` gating under cron (Phase 32 Pitfall 3)
**What goes wrong:** A null-or-omitted default for `llm_run_id` breaks the `!= ''` expression under cron-triggered runs.
**Why it happens:** Cron runs have no `workflow_dispatch` inputs; without an explicit `default: ''` the value is null and `null != ''` evaluates true → quarantine steps run on every cron tick (wrong).
**How to avoid:** The existing input ALREADY has `default: ''` (line 31). Reuse the SAME `if: inputs.llm_run_id != ''` expression the download step uses (line 108) — verified working. Do NOT introduce a new gating expression.
**Warning signs:** Quarantine steps executing on the 06:00 cron when no `llm_run_id` was supplied.

## Code Examples

### Empty-corpus exit-0 npm script (D-03)
```jsonc
// Source: package.json (extend existing e2e:regression at line 10)
"e2e:quarantine": "npm run build:chrome && playwright test --config tests/e2e/playwright.config.js specs/quarantine.spec.js --retries=0 --pass-with-no-tests",
"e2e:triage-pipeline": "node scripts/run-triage-pipeline.mjs"
```
[VERIFIED: node_modules] — both `--retries` and `--pass-with-no-tests` accepted by `@playwright/test@1.60.0` CLI.

### Lint extension (D-16 done-criterion)
```jsonc
// Source: package.json line 17 — append run-triage-pipeline.mjs to the lint list
"lint": "eslint tests/e2e/lib/ scripts/e2e-triage-classifier.mjs scripts/e2e-rerun-validator.mjs scripts/e2e-report-issue.mjs scripts/quarantine-append.mjs scripts/promote-from-quarantine.mjs scripts/update-golden.js scripts/run-triage-pipeline.mjs"
```

### spawnSync integration test harness (Phase 35 Plan 04 pattern — reuse verbatim)
```javascript
// Source: tests/e2e/scripts/e2e-quarantine-append.test.js (lines 39-94) — adapt for pipeline
// Key reusable pieces:
//   1. mock-gh bash shim writing $@ to a transcript (lines 53-66)
//   2. QUARANTINE_CORPUS_PATH_OVERRIDE → tmpDir corpus (lines 69-70, 88)
//   3. fixtures copied into artifacts/{runId}/ for WR-05 path-bound (lines 45-47)
//   4. spawnSync('node', [SCRIPT, ...args], { env: {...PATH-prepend-mockgh...} }) (lines 82-94)
// For the pipeline test: ALSO set CI='' and GITHUB_ACTIONS='' in env so the triage-classifier
// CI gate does NOT fire — required to exercise the full 4-stage chain (SC-2).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| (N/A — greenfield orchestrator) | spawnSync chain, exit-0-always | Phase 36 | First pipeline orchestrator; no prior art to supersede |
| Hardcoded `e2e-nightly` label | Parameterized label (`e2e-nightly` / `e2e-quarantine`) | Phase 36 D-15 | `--source` now drives label; minimal change to `makeRealGhClient` |

**Deprecated/outdated:** None. Playwright 1.60.0 is current for the repo; `--pass-with-no-tests` is a stable flag (present since Playwright 1.x test runner era).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Quarantine `report.json` uses the SAME RPT-01 shape as regression (so `processReport` works unchanged) | Pattern 3 | If quarantine spec emits a different shape, `--source quarantine` filing breaks. MITIGATED: D-01 says "mirrors regression.spec.js" — same `appendCase`/`reportPathFor`. LOW risk. |
| A2 | Recommended `e2e-quarantine` label color `d93f0b` (orange-red, distinct from `e2e-nightly`'s `0075ca` blue) | Pattern 4 | Cosmetic only — Claude's Discretion per CONTEXT. No functional impact. |
| A3 | Recommended quarantine step `timeout-minutes: 15` | Pattern 4 | Claude's Discretion per CONTEXT (D-14 recommends 15). With empty corpus, any value works. LOW risk. |
| A4 | The triage-pipeline integration test must run with `CI`/`GITHUB_ACTIONS` UNSET to exercise the full chain | Pattern 1, Pitfall 3 | If the test runs under CI env (vitest in CI sets `CI=true`), the triage stage gates and stages 3–4 no-op → the "1 issue filed, 1 quarantine entry" assertions (SC-2) fail. MUST be addressed in the plan. MEDIUM risk if overlooked. |

## Open Questions

1. **Does vitest set `CI=true` when running `test:src` in GitHub Actions, and will that break the SC-2 integration test?**
   - What we know: `e2e-triage-classifier.mjs` exits 1 if `CI=true || GITHUB_ACTIONS=true` (line 154). The Phase 35 spawnSync tests pass `...process.env` through (inheriting CI). The pipeline integration test needs the full chain to run.
   - What's unclear: Whether the test should explicitly set `CI=''` + `GITHUB_ACTIONS=''` in the spawnSync env, OR assert the CI-gated no-op behavior instead.
   - Recommendation: The plan's integration test should spawn `run-triage-pipeline.mjs` with `env: { ...process.env, CI: '', GITHUB_ACTIONS: '' }` so the triage stage runs and the full chain completes (matching D-16's "1 CONFIRMED finding → exit 0, both reports written, mock issue filed, 1 quarantine entry"). Add a SEPARATE test asserting the CI-gated path no-ops gracefully (exit 0, "skipped in CI" logged) to cover D-08.

2. **Should `run-triage-pipeline.mjs` write a `pipeline-summary.json`?**
   - What we know: Claude's Discretion (CONTEXT). Deferred-ideas notes artifact-upload wiring is not required by any SC.
   - Recommendation: Write a minimal summary object to stdout always; optionally `atomicWriteJson` it to the run dir for forensics. Do NOT wire GitHub Actions artifact upload (out of scope).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` | quarantine.spec.js | ✓ | 1.60.0 | — |
| `--pass-with-no-tests` flag | empty-corpus exit 0 | ✓ | (1.60.0 CLI) | — |
| `--retries` flag | retries override | ✓ | (1.60.0 CLI) | — |
| Node.js | orchestrator + tests | ✓ | 22 (CI pin) | — |
| `vitest` | integration tests | ✓ | ^3.0.0 | — |
| `gh` CLI | label + issue ops | ✓ (runner) | (runner-provided; mock-gh in tests) | mock-gh shim |
| Phase 35 fixtures | integration test inputs | ✓ | — | `tests/e2e/fixtures/phase35-{triage,llm,rerun}-report.json` present |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `gh` CLI in tests → mock-gh bash shim (Phase 35 established pattern).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 (unit + spawnSync integration) + Playwright 1.60.0 (quarantine spec) |
| Config file | `vitest.config.*` (root `test:src`), `tests/e2e/playwright.config.js` |
| Quick run command | `npm run test:src` (vitest unit + integration) |
| Full suite command | `npm run lint && npm run test:src` |
| Spec smoke | `npm run e2e:quarantine` (drives empty corpus → exit 0) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAR-03 | quarantine.spec.js empty corpus exits 0 | spec smoke | `npm run e2e:quarantine` (expect exit 0, 0 tests) | ❌ Wave 0 — `tests/e2e/specs/quarantine.spec.js` |
| QUAR-03 | `--retries=0` override applied | unit (npm-script grep) | assert package.json script contains `--retries=0` | ❌ Wave 0 |
| QUAR-04 | quarantine step `continue-on-error: true` | YAML grep | grep `e2e-nightly.yml` for the quarantine step's `continue-on-error: true` | ❌ Wave 0 |
| QUAR-04 | `--source quarantine` stamps `e2e-quarantine` label | unit (mock-gh) | `vitest run tests/unit/e2e-report-issue.test.js` — assert `createIssue`/`gh ... --label e2e-quarantine` | ❌ Wave 0 (new test case) |
| ORCH-01 | full chain: 1 CONFIRMED → exit 0, both reports written, 1 issue, 1 quarantine entry | spawnSync integration | `vitest run tests/e2e/scripts/e2e-run-triage-pipeline.test.js` (CI unset) | ❌ Wave 0 |
| ORCH-01 | exit 0 even when a stage fails | spawnSync integration | same file — feed a stage a bad input, assert exit 0 | ❌ Wave 0 |
| ORCH-02 | new steps gated on `llm_run_id != ''` | YAML grep | grep each new step for `if: inputs.llm_run_id != ''` | ❌ Wave 0 |
| ORCH-02 | regression unchanged when llm_run_id absent | YAML diff/review | confirm steps 1 (smoke→regression) unchanged | manual/review |
| ORCH-03 | timeout budget comment present | YAML grep | grep `e2e-nightly.yml` for `TIMEOUT BUDGET` comment + `timeout-minutes:` on quarantine step | ❌ Wave 0 |

### Detailed validation specs (from `<output>` requirements)

1. **quarantine.spec.js empty-corpus exit-0 test:** Run `npm run e2e:quarantine` against the committed empty corpus (`TEST_CASES_QUARANTINE = []`). Assert process exit 0 and Playwright reports 0 tests run. This is the SC-1 gate. The `--pass-with-no-tests` flag is what makes 0-tests exit 0 (without it, Playwright exits non-zero on no tests).

2. **run-triage-pipeline.mjs spawnSync integration test (1 CONFIRMED finding → full chain):** Reuse the Phase 35 harness exactly:
   - Copy `phase35-{triage,llm,rerun}-report.json` fixtures into `artifacts/{runId}/` (WR-05 bound).
   - Set `QUARANTINE_CORPUS_PATH_OVERRIDE` → tmpDir empty corpus.
   - Set `CI: ''` + `GITHUB_ACTIONS: ''` in spawnSync env (Open Question 1) so the triage stage runs.
   - Prepend mock-gh dir to `PATH`; mock-gh `issue list` returns `[]` (so issue gets created), `issue create` returns a URL.
   - `spawnSync('node', [RUN_TRIAGE_PIPELINE, '--llm-report', path.join(runDir, 'llm-report.json')], {env})`.
   - Assert: exit 0; `rerun-report.json` + `triage-report.json` exist in `runDir`; mock-gh transcript contains `issue create`; the tmpDir corpus now has 1 entry (`TEST_CASES_QUARANTINE.length === 1`).
   - SEPARATE test (D-08 coverage): same setup but `CI: 'true'` → assert exit 0, `rerun-report.json` written, stdout contains "skipped in CI" (or triage stage logged FAILED), corpus unchanged.

3. **`--source quarantine` mock-gh label test:** Unit test in `tests/unit/e2e-report-issue.test.js`. Build a minimal RPT-01 report with one failed case. Inject a mock `ghClient` whose `createIssue` records the call. Drive `processReport` (or the CLI via spawnSync with mock-gh on PATH) and assert the issue is created with the `e2e-quarantine` label (the SC-4 assertion). If testing the CLI via spawnSync: assert the mock-gh transcript contains `--label e2e-quarantine` (NOT `e2e-nightly`). Also assert `sanitizeCaseId` is applied (CR-01 reuse) by feeding a case ID with shell metacharacters and asserting it is skipped, not interpolated.

4. **YAML-level verification of gating + continue-on-error + timeout comment:** Add a vitest test (or a shell grep check in CI) that reads `.github/workflows/e2e-nightly.yml` as text and asserts:
   - `continue-on-error: true` appears on the quarantine step.
   - `if: inputs.llm_run_id != ''` appears on all 4 new steps.
   - A `TIMEOUT BUDGET` (or `timeout budget`) comment block exists.
   - `timeout-minutes:` appears on the quarantine step.
   - `gh label create "e2e-quarantine"` appears.
   Optionally add a YAML-parse validity check (`node -e "require('js-yaml')..."` is NOT available — no js-yaml dep; use a grep-based assertion or `node -e` with a regex). Grep-based assertions are sufficient and dependency-free; recommend that over adding a yaml-lint dep (zero-new-dep lock).

### Sampling Rate
- **Per task commit:** `npm run test:src` (unit + integration, fast).
- **Per wave merge:** `npm run lint && npm run test:src`.
- **Phase gate:** `npm run e2e:quarantine` (exit 0 on empty corpus) + full `test:src` green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/e2e/specs/quarantine.spec.js` — covers QUAR-03 (new spec)
- [ ] `scripts/run-triage-pipeline.mjs` — covers ORCH-01 (new orchestrator)
- [ ] `tests/e2e/scripts/e2e-run-triage-pipeline.test.js` — covers ORCH-01 (new integration test; reuse Phase 35 harness)
- [ ] `tests/unit/e2e-report-issue.test.js` — add `--source quarantine` label test case (modify existing)
- [ ] YAML assertion test (grep-based, in `tests/unit/` or `tests/e2e/scripts/`) — covers QUAR-04 + ORCH-02 + ORCH-03
- [ ] No framework install needed — vitest + Playwright already present.

## Security Domain

> `security_enforcement` not explicitly disabled in config — included. This phase touches shell interpolation (gh CLI) and CI input handling, so V5 (Input Validation) is the primary concern.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Reuses `GITHUB_TOKEN`; no new auth |
| V3 Session Management | no | N/A |
| V4 Access Control | no | Inherits workflow `permissions: issues: write` (line 45) |
| V5 Input Validation | **yes** | `sanitizeCaseId` (CASE_ID_RE allow-list); WR-05 path-bound `ALLOWED_INPUT_ROOTS`; env-var hop for `llm_run_id` (line 116); numeric guard on `llm_run_id` (line 119) |
| V6 Cryptography | no | `fingerprint` uses sha256 for dedup keys only (not security) |

### Known Threat Patterns for {GitHub Actions + gh CLI + Node spawnSync}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Workflow-dispatch input → shell injection (CWE-94) | Tampering/Elevation | `llm_run_id` env-var hop + numeric `case` guard (lines 116, 119) — ALREADY in place; the new label-create step uses a hardcoded literal `"e2e-quarantine"` (no input interpolation) |
| Case ID → gh title/label shell injection | Tampering | `sanitizeCaseId` (e2e-report-issue.mjs line 130) — quarantine path inherits via `processReport` (line 435); category clamped to `ERROR_CLASSES` (line 375). CR-01 from Phase 35 established this guard; quarantine reuses the SAME hardened path. |
| Path traversal via `--input`/`--triage-report` | Tampering | `ALLOWED_INPUT_ROOTS` bound to `artifacts/`+`fixtures/` (e2e-report-issue.mjs line 56, quarantine-append.mjs line 28) |
| Label value injection in `gh issue create --label` | Tampering | Label is a hardcoded literal `e2e-quarantine` (not user input) → no escaping needed; `createIssueWithLabels` escapes `"` defensively (line 502) |
| Triage LLM API billing leak in CI | Info disclosure / cost | Three-layer CI gate (triage-classifier line 154); pipeline must NOT override `CI=` (Pitfall 3) |

**Security note for planner:** The `--source quarantine` branch MUST route through `processReport` so it inherits `sanitizeCaseId` (D-15 / Phase 35 CR-01). Do NOT write a parallel filing path that skips the sanitizer. The integration test should include a shell-metacharacter case ID that is rejected (skipped), proving the guard is live on the quarantine path.

## Sources

### Primary (HIGH confidence)
- Direct code inspection (this session): `.github/workflows/e2e-nightly.yml`, `scripts/e2e-report-issue.mjs`, `scripts/e2e-rerun-validator.mjs`, `scripts/e2e-triage-classifier.mjs`, `scripts/quarantine-append.mjs`, `tests/e2e/specs/regression.spec.js`, `tests/e2e/playwright.config.js`, `tests/e2e/test-cases-quarantine.js`, `tests/e2e/lib/report.js`, `tests/e2e/scripts/e2e-quarantine-append.test.js`, `tests/unit/e2e-report-issue.test.js`, `tests/e2e/lib/issue-payload-builder.js`, `package.json`, `eslint.config.js`
- `node_modules/.bin/playwright test --help` — VERIFIED `--pass-with-no-tests` + `--retries` flags present in `@playwright/test@1.60.0`
- `.planning/phases/36-.../36-CONTEXT.md` — 16 locked D-NN decisions
- `.planning/REQUIREMENTS.md` §QUAR (QUAR-03, QUAR-04), §ORCH (ORCH-01..03)
- `.planning/research/PITFALLS.md` — Pitfall 6 (issue body limit), Pitfall 15 (concurrency collision), anti-pattern table
- `.planning/research/SUMMARY.md` §"Phase 5" — standard-pattern flag, timeout-budget research flag
- `.planning/STATE.md` — Phase 36 timeout-budget blocker note (line 108), v3.1 pre-locked decisions (lines 75–86)
- `.planning/phases/35-.../35-04-SUMMARY.md`, `35-05-SUMMARY.md` — quarantine-append + promote spawnSync/mock-gh/QUARANTINE_CORPUS_PATH_OVERRIDE patterns

### Secondary (MEDIUM confidence)
- None required — all claims verified against in-repo code or installed binaries.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both Playwright flags verified against installed 1.60.0 CLI help; zero-new-dep lock confirmed.
- Architecture: HIGH — every pattern (gating, continue-on-error, label bootstrap, spawnSync chain, mock-gh test harness) read directly from existing code with line numbers.
- Pitfalls: HIGH — derived from PITFALLS.md + direct inspection of the CI gate (triage-classifier line 154) and concurrency group (e2e-nightly line 39).
- `--source quarantine` design: HIGH — confirmed quarantine spec emits RPT-01 report.json (same as regression) so `processReport` reuse + label parameterization is the minimal correct change.

**Research date:** 2026-05-27
**Valid until:** 2026-06-26 (stable — in-repo code + pinned Playwright 1.60.0; revisit only if Playwright is upgraded)

## Project Constraints (from CLAUDE.md)
- **AskUserQuestion verification:** After any `AskUserQuestion` call, verify the tool result contains the user's actual selection. If empty/generic, present a numbered plain-text fallback and do NOT fabricate or auto-pick the recommended option. (Relevant only if the planner/discuss-phase asks the user about the discretion items: label color, timeout-minutes value, pipeline-summary.json.)

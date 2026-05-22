# Stack Research

**Domain:** LLM-triage feedback loop on top of an existing Playwright/Vitest E2E harness (browser extension CI pipeline)
**Researched:** 2026-05-22
**Confidence:** HIGH (all critical decisions verified against npm registry, Context7, official GitHub docs)

---

## Context: What Already Exists (DO NOT re-add)

The v3.0 infrastructure is complete and correct. These are NOT additions for v3.1:

| Already Shipped | Where |
|-----------------|-------|
| `@playwright/test@1.60.0` | package.json devDep — pinned, do not bump |
| `pdfjs-dist@^5.5.207` | verifier oracle — do not touch |
| `vitest@^3.0.0` | current latest major is 4.x; project is on `^3` — do not bump mid-milestone |
| `sharp@^0.34.5` | PDF snippet renderer — done |
| `execSync`-based `gh` CLI issue filer | `scripts/e2e-report-issue.mjs` — extend, do not replace |
| 8-string `ERROR_CLASSES` taxonomy | `tests/e2e/lib/error-codes.js` — extend only |
| `llm-report.json` schema + writer | `tests/e2e/lib/llm-report.js` — consume, do not modify |
| `report.json` schema + writer | `tests/e2e/lib/report.js` — consume, do not modify |
| headless `claude -p` invocation pattern | `tests/e2e/lib/llm-driver.js` — reuse for second-pass triage |

---

## New Capabilities and Their Stack Decisions

### 1. Hybrid Triage Classifier

**Decision: No new framework. Extend `llm-driver.js` with a pure-function rule layer; reuse the existing `claude -p` invocation for the LLM fallback pass.**

Rationale:

The existing `invokeClaudeP` / `parseClaudeResponse` / `validateLlmSelection` stack in `llm-driver.js` already handles subscription-mode auth, SIGTERM/SIGKILL escalation, cost recording, and the full failure-branch taxonomy. Adding a framework (LangChain, instructor, Vercel AI SDK, etc.) would add dependency weight, a new abstraction layer over `claude -p`, and a different prompt-building convention — with no benefit since the LLM call is a single short classification prompt (not a chain, not structured output with schema enforcement, not streaming).

The correct pattern is:

1. A pure function `triageByRules(llmReportCase)` that inspects `failure_class`, `confidence`, `verifier_agreement`, `dom_drift_detected` on each `llm-report.json` iteration and returns one of: `'CONFIRMED'`, `'AMBIGUOUS'`, `'NOISE'`.
2. For `'AMBIGUOUS'` only: call `invokeClaudeP` with a triage prompt, parse the response with `parseClaudeResponse`.
3. Output: a `triage_result` field attached to each case — no new report file needed until Phase-specific design decides otherwise.

**No new devDependencies for the classifier logic.** Pure Node 22 + existing `llm-driver.js` primitives.

---

### 2. Re-Run Validator Orchestration

**Decision: New script `scripts/rerun-validator.mjs` that calls the existing `pdf-verifier.js` oracle directly — no new library.**

The `verifyCitation` function in `tests/e2e/lib/pdf-verifier.js` already performs a full independent PDF re-parse. The re-run validator wraps it in a loop over LLM-flagged anomalies from `llm-report.json`. The only new concern is driving the Playwright browser to re-execute the extension against a specific patent — this reuses `extension-loader.js` and `navigation.js` already in `tests/e2e/lib/`.

The re-run is verifier-only (no LLM call needed at this stage), so cost is zero. Script wires `llmReportPathFor` → filter `VERIFIER_DISAGREE` + `WRONG_CITATION` iterations → re-run `verifyCitation` → annotate with `rerun_confirmed: true/false`.

**No new devDependencies.**

---

### 3. Auto-Issue Filer — Rich Payload

**Decision: Extend `scripts/e2e-report-issue.mjs` in-place. Do NOT add `@octokit/rest`.**

The existing filer already does everything needed:
- `gh issue create --body-file -` reads the body from stdin (avoids shell quoting problems — already solved).
- `gh api repos/${repo}/issues --paginate` lists open issues for dedup (already solved with pagination).
- `fingerprint()` / `findMatchingIssue()` / `buildIssueBody()` are pure exported functions with unit tests.

The richer v3.1 payload (reproducer command + seed, PDF snippet embed path, LLM triage rationale, confidence, diff vs last known-good golden citation) is purely a `buildIssueBody` extension — add new fields to the markdown table and code fence sections. The `ghClient` interface (`createIssue`, `commentIssue`, `listOpenNightlyIssues`) is already injected, so the real `gh` CLI path and the test mock both benefit.

**Why not `@octokit/rest@22.0.1`?** The gh CLI is already installed on `ubuntu-latest` runners, already authenticated via `GITHUB_TOKEN`, and the current code has zero startup overhead compared to importing and instantiating an Octokit client. Switching would add a devDependency, require token plumbing explicitly (currently automatic via gh), and require rewriting unit tests that mock execSync. The `gh` CLI path is strictly better for this single-repo use case.

**No new devDependencies for the issue filer.**

---

### 4. Non-Gating Quarantine Suite in CI

**Decision: Separate Playwright `--project` invocation in the nightly workflow with `continue-on-error: true`. No separate workflow file needed.**

The existing `playwright.config.js` uses a single flat config. Add a `projects:` array with two entries:
- `golden` — wraps the existing `specs/regression.spec.js` (current behavior unchanged)
- `quarantine` — points at `tests/e2e/specs/quarantine.spec.js` (new) with `testDir: './specs'` and `grep` limited to quarantine IDs

Run the quarantine project as a separate step in `e2e-nightly.yml` with `continue-on-error: true`. The step produces its own exit code and artifact. The nightly job's overall outcome is determined by the `golden` project step (unchanged). This pattern matches the existing `fault-injection.spec.js` step in the nightly workflow, which already uses `continue-on-error: true`.

Pattern in `e2e-nightly.yml`:
```yaml
- name: Run quarantine suite (non-gating)
  id: quarantine
  continue-on-error: true
  run: |
    npx playwright test \
      --config tests/e2e/playwright.config.js \
      --project quarantine
```

The quarantine spec runner imports from `tests/e2e/test-cases-quarantine.js` (new file). Corpus shape mirrors `tests/e2e/specs/regression.spec.js` — same `TEST_CASES` iteration pattern, same `appendCase` / verifier wiring. No new runner primitives needed; the quarantine suite IS just the regression runner with a different corpus file.

**No new devDependencies. No new workflow file. Extend existing Playwright config and nightly workflow.**

Regarding "required checks" and PRs: the quarantine suite runs only in the nightly cron, not on PRs, so there is no branch-protection interaction to manage. Do not add it to `ci.yml`.

---

### 5. Corpus Promotion: `test-cases-quarantine.js`

**Decision: Plain JS array module — same shape as `tests/e2e/test-cases.js`.**

```javascript
// tests/e2e/test-cases-quarantine.js
// Auto-promoted by scripts/promote-to-quarantine.mjs.
// Human PR-promotes stable entries to tests/e2e/test-cases.js (golden).
export const QUARANTINE_CASES = [
  // { id, patentId, selectedText, expectedCitation, promotedFrom: 'llm-report', promotedAt: ISO }
];
```

The `scripts/promote-to-quarantine.mjs` script reads LLM-report iterations where `rerun_confirmed: true` and triage result `'CONFIRMED'`, then appends them. No new library needed — Node 22 `fs.readFileSync` / `JSON.parse` / `fs.writeFileSync` is sufficient.

**No new devDependencies.**

---

### 6. Weekly Analytics Digest

**Decision: GitHub Actions weekly cron (`0 7 * * 1`) that commits a markdown file to the repo AND creates a GitHub Discussion via `gh api graphql`.**

Two delivery targets because they serve different purposes:
- The committed markdown file (`reports/weekly-digest-YYYY-WNN.md`) gives a permanent audit trail in git and is diff-able.
- The GitHub Discussion gives a searchable, commentable entry point for roadmap decisions.

**GitHub Discussion API:** The `createDiscussion` GraphQL mutation is the only way to create discussions programmatically (confirmed: GitHub has no REST endpoint for discussion creation). The `gh api graphql` CLI supports this mutation directly. Required: `discussions: write` permission on the workflow token (confirmed valid GITHUB_TOKEN scope). The mutation requires `repositoryId` and `categoryId` (fetched once at workflow start via `gh api graphql -f query='query { repository(...) { id, discussionCategories(...) { nodes { id name } } } }'`).

**File commit:** Standard pattern — `contents: write` permission on the workflow token, `git config`, `git add`, `git commit`, `git push`. The `git-auto-commit` Action is an alternative but is a third-party dependency; the native git commands are simpler and match the existing repo pattern (no third-party Actions in this repo beyond `actions/*`).

**Analytics script:** `scripts/e2e-analytics-digest.mjs` — reads all `llm-report.json` and `report.json` files from the most-recent 7 days of `tests/e2e/artifacts/`, aggregates counts, and outputs markdown. Pure Node 22, no new library.

New workflow file: `.github/workflows/e2e-weekly-digest.yml`

```yaml
name: E2E Weekly Digest
on:
  schedule:
    - cron: '0 7 * * 1'  # Monday 07:00 UTC, after nightly at 06:00
  workflow_dispatch:

permissions:
  contents: write
  discussions: write

jobs:
  digest:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      GITHUB_REPOSITORY: ${{ github.repository }}
```

**No new devDependencies for the digest job.** `gh api graphql` is pre-installed on `ubuntu-latest`.

---

## Recommended Stack — New Additions Summary

### Core Technologies (additions only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node 22 LTS built-ins only | (built-in) | Re-run validator, triage classifier, analytics digest, corpus promoter | All new scripts are pure Node — `fs`, `path`, `child_process`. Zero new runtime dependencies. |

### Supporting Libraries (additions only)

**None.** Every v3.1 feature reuses existing primitives:

| v3.1 Feature | Reused Primitive | Location |
|--------------|-----------------|----------|
| Hybrid triage classifier (rule pass) | Pure function over `llm-report.json` fields | New: `scripts/triage-classifier.mjs` |
| Hybrid triage classifier (LLM pass) | `invokeClaudeP`, `parseClaudeResponse` | `tests/e2e/lib/llm-driver.js` |
| Re-run validator | `verifyCitation` oracle | `tests/e2e/lib/pdf-verifier.js` |
| Auto-issue filer (rich payload) | `buildIssueBody`, `processReport`, `gh` CLI | `scripts/e2e-report-issue.mjs` |
| Quarantine spec runner | Playwright config `projects:`, `regression.spec.js` pattern | `tests/e2e/playwright.config.js` |
| Corpus file | JS array module, same shape as `test-cases.js` | `tests/e2e/test-cases-quarantine.js` (new) |
| Weekly digest commit | `git` CLI, `contents: write` permission | New workflow step |
| Weekly digest discussion | `gh api graphql createDiscussion` mutation | New workflow step |
| Analytics aggregation | Node `fs` glob over `artifacts/` | `scripts/e2e-analytics-digest.mjs` (new) |

### Development Tools (additions only)

| Tool | Purpose | Notes |
|------|---------|-------|
| `gh api graphql` | createDiscussion mutation, repo/category ID lookup | Pre-installed on `ubuntu-latest`; no npm package needed |

---

## Installation

```bash
# No new npm packages to install for v3.1.
# All new capabilities use existing devDependencies or Node built-ins.
```

---

## Alternatives Considered

| Decision | Recommended | Alternative Considered | Why Not |
|----------|-------------|----------------------|---------|
| Triage classifier framework | Extend `llm-driver.js` pure functions | LangChain, Vercel AI SDK, instructor-js | All add abstraction over a single short prompt with no streaming/chain/schema need; net cost is +1 dependency for zero capability gain |
| Issue filer GitHub client | `execSync('gh ...')` (extend existing) | `@octokit/rest@22.0.1` | gh CLI already auth'd via GITHUB_TOKEN on ubuntu-latest; existing code has unit-tested mock interface; switching requires rewriting exec calls AND mocks |
| Non-gating quarantine CI | `continue-on-error: true` step in nightly workflow | Separate workflow file, branch protection "optional" check | Quarantine runs nightly only, not on PRs; separate workflow file adds maintenance surface; the existing `fault-injection.spec.js` step proves `continue-on-error` pattern works |
| Weekly digest delivery | Committed markdown + GitHub Discussion | GitHub Issue only | Issues clutter the issues tracker over time; Discussion is appropriate for recurring digest-style posts with comments |
| Discussion creation | `gh api graphql createDiscussion` | Third-party "create-discussion" Action, `@octokit/graphql` | `gh api graphql` is pre-installed, already in the repo pattern via `gh api` for issue ops; third-party Actions add supply-chain risk |
| Analytics aggregation | Custom `scripts/e2e-analytics-digest.mjs` | Prometheus + Grafana, datadog | Single-user repo; markdown is sufficient and matches the existing reporting style; no external service dependencies |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / Vercel AI SDK / OpenAI SDK | Overkill for a single `claude -p` subprocess call; forces API key auth model, incompatible with Max 5 subscription budget control | Extend `invokeClaudeP` in `llm-driver.js` |
| `@octokit/rest` or `@octokit/graphql` as npm devDeps | The repo uses `gh` CLI for all GitHub API ops; introducing a JS client splits the pattern and adds a dep with nothing gained | `gh api` and `gh api graphql` |
| New `.github/workflows/e2e-quarantine.yml` workflow | Quarantine is nightly-only; a new workflow triggers a new check on every PR (even empty ones) or creates branch-protection confusion | Add a `--project quarantine` step inside the existing `e2e-nightly.yml` |
| Vitest upgrade to 4.x | `package.json` pins `^3.0.0`; 4.x was released but this milestone adds no features requiring it; a mid-milestone major bump risks breaking the existing 461 tests | Stay on `^3.0.0` |
| `@playwright/test` bump beyond 1.60.0 | Pinned deliberately; unpacked-extension loading in persistent context is known-good at 1.60.0; any bump requires re-validating the extension load shim | Stay at `1.60.0` |
| `simple-git` or `@actions/exec` npm packages for the digest commit | Standard `git` CLI is pre-installed on `ubuntu-latest` and already used implicitly by `actions/checkout`; no wrapper needed | Native `git` shell commands in workflow `run:` step |
| `git-auto-commit` Action | Third-party Action; this repo uses only `actions/*` (first-party) Actions; native git commands achieve the same result | Native git commands |

---

## CI Workflow Patterns for Non-Gating Suites

The established pattern in this repo (`fault-injection.spec.js` in `e2e-nightly.yml`) is:

```yaml
- name: Run [non-gating suite]
  id: [suite_id]
  continue-on-error: true
  run: npx playwright test ...

- name: File issues for [suite_id] failure
  if: steps.[suite_id].outcome == 'failure'
  run: node scripts/e2e-report-issue.mjs ...

- name: Upload artifacts
  if: always() && steps.[suite_id].outcome == 'failure'
  uses: actions/upload-artifact@v4
  with:
    name: e2e-nightly-${{ github.run_id }}
    path: tests/e2e/artifacts/
    retention-days: 14
```

Apply this exact pattern for the quarantine suite step. No new pattern needed — it is already proven.

---

## Version Compatibility

| Package | Pinned At | Compatible With | Notes |
|---------|-----------|-----------------|-------|
| `@playwright/test` | `1.60.0` | Node 22, Chromium bundled | Do not bump; extension load shim validated at this version |
| `pdfjs-dist` | `^5.5.207` | Node 22 ESM | Used by both verifier and triage re-run |
| `vitest` | `^3.0.0` | Node 22 | Latest 3.x resolved; 4.x available but no upgrade needed for v3.1 |
| Node | `22 LTS` | All devDeps | Already in `actions/setup-node` in all workflows |

---

## Sources

- Context7 `/octokit/rest.js` — verified `createIssue`, `paginate`, `listForRepo` API surface (HIGH confidence)
- `npm view @octokit/rest dist-tags` — confirmed latest `22.0.1` (HIGH confidence)
- `npm view vitest version` — confirmed latest `4.1.7` (project stays on `^3.x`) (HIGH confidence)
- `npm view @playwright/test version` — confirmed `1.60.0` is current lock (HIGH confidence)
- Context7 `/websites/main_vitest_dev` — confirmed `projects:` array in config for multi-project runner (HIGH confidence)
- GitHub Docs `workflow-syntax-for-github-actions#permissions` — confirmed `discussions: write` is a valid `GITHUB_TOKEN` scope (HIGH confidence)
- GitHub Docs GraphQL Discussions API — confirmed `createDiscussion` mutation requires `repositoryId`, `categoryId`, `title`, `body`; no REST equivalent (HIGH confidence)
- `gh api graphql` CLI help + existing repo usage — confirmed `gh api graphql` pre-installed on `ubuntu-latest`, supports variable-parameterized mutations (HIGH confidence)
- Existing `e2e-nightly.yml` fault-injection step — confirmed `continue-on-error: true` + `if: steps.X.outcome == 'failure'` pattern works in this repo (HIGH confidence — in production)
- `npm view @actions/github version` — `9.1.1` (noted, not used; octokit path rejected)
- WebSearch — GitHub Actions `discussions: write` permission scope, weekly cron patterns, separate project CI patterns (MEDIUM confidence, verified against official docs)

---
*Stack research for: v3.1 LLM-Driven Product Improvement Loop (patent-cite-tool)*
*Researched: 2026-05-22*

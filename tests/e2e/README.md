# `tests/e2e/` — End-to-End Testing for the Patent Citation Tool

This directory contains the Playwright-driven test harness that drives the
unpacked Chrome MV3 extension against real Google Patents pages and
verifies the citations it produces. It is the v3.0 milestone's primary
deliverable.

There are **two modes**: a deterministic regression suite (CI-safe) and
an LLM-driven exploratory mode (local-dev only).

---

## Overview

| Mode          | Trigger                                                | Patent universe                                       | Use when                                                |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| Deterministic | `npm run e2e:smoke` / `e2e:regression` / `e2e:silent`  | 66 live cases from `tests/test-cases.js`              | Nightly CI, pre-commit smoke, regression detection      |
| Exploratory   | `e2e:explore [retired in Phase 10 RTR-03]`                                  | Same 66 cases, LLM picks one + a fresh selection      | Local-dev only, monthly LLM subscription credit         |

The deterministic suite runs in GitHub Actions every night (Phase 29
cron) and on every push (Phase 26 CI). It exercises the extension
against a frozen golden baseline and double-checks every passing case
with an independent PDF re-parser (Phase 28). The exploratory mode is a
human-supervised tool that uses Anthropic's `claude -p` CLI to pick a
patent + a selection from the corpus, validates the selection actually
appears in the spec, drives the extension, classifies the iteration's
outcome (PASS / WRONG_CITATION / LLM_HALLUCINATED_SELECTION /
LLM_API_ERROR / VERIFIER_DISAGREE), and writes a per-run report. It is
**not** allowed to run in CI — see the [CI guard](#ci-guard) below.

The harness drives Chromium with the unpacked extension at `dist/chrome/`.
The only non-functional source changes Phase 26-31 make to the extension
are two `data-testid` attributes on the citation UI ([test-hook
contract](#test-hook-contract)) and one HTTP header on the Cloudflare
Worker proxy.

```
tests/e2e/
├── README.md                          # this file
├── playwright.config.js               # Playwright + Chromium configuration
├── lib/                               # reusable harness modules
│   ├── extension-loader.js            # Phase 26: launches Chromium with the unpacked ext
│   ├── navigation.js                  # Phase 27: shadow-DOM-aware Google Patents nav
│   ├── observation.js                 # Phase 27: readCitationPill() & friends
│   ├── selection.js                   # Phase 27: programmatic text-selection helper
│   ├── pdf-fetch.js                   # Phase 28: PDF download + local cache
│   ├── pdf-verifier.js                # Phase 28: independent re-parse verifier
│   ├── report.js                      # Phase 28: report.json append-only writer
│   ├── run-id.js                      # Phase 28: ISO-stamped run directory naming
│   ├── artifacts.js                   # screenshot/snapshot helpers
│   ├── error-codes.js                 # RPT-02 + INJ-02 + LLM-04 taxonomy (11 codes)
│   ├── worker-test-mode-route.js      # Phase 30: chrome.storage test-mode hook
│   ├── llm-ledger.js                  # Phase 31: $80/$100 spend ledger
│   ├── llm-pricing.js                 # Phase 31: per-model pricing constants (fallback only)
│   ├── llm-hallucination.js           # Phase 31: selectionInSpec wsNorm/tightNorm guard
│   └── llm-report.js                  # Phase 31: llm-report.json append-only writer
├── specs/                             # Playwright specs (run via npm scripts)
│   ├── regression.spec.js             # Phase 27: 66-case live deterministic run
│   ├── smoke.spec.js                  # @smoke-tagged subset for fast CI
│   ├── silent.spec.js                 # silent-mode (clipboard) test
│   └── fault-injection.spec.js        # Phase 30: Worker/USPTO fallback fault-injection
├── artifacts/{run-id}/                # per-run output (gitignored)
│   ├── report.json                    # deterministic-mode classifications
│   └── llm-report.json                # exploratory-mode classifications (when applicable)
├── .pdf-cache/                        # local PDF cache (gitignored)
└── .llm-spend-ledger.json             # monthly LLM spend ledger (gitignored)
```

---

## Running the deterministic suite

The deterministic suite is the production safety net: it must pass on
every CI run, and any failure is investigated. It does NOT consume LLM
credit.

| npm script           | What it does                                                    | Approx. duration |
| -------------------- | --------------------------------------------------------------- | ---------------- |
| `npm run e2e:smoke`  | `@smoke`-tagged subset (fast pre-commit check)                  | < 2 min          |
| `npm run e2e:regression` | Full 66-case live deterministic suite                       | ~7-10 min        |
| `npm run e2e:silent` | Silent-mode (Ctrl+C → clipboard) functional test                | ~30 s            |
| `npm run e2e:quarantine` | Non-gating quarantine corpus (Phase 36). Iterates `TEST_CASES_QUARANTINE`; empty corpus exits 0 with 0 tests (`--pass-with-no-tests`). Used in nightly CI with `continue-on-error: true`. | ~30 s (empty corpus) |
| `npm run e2e:triage-pipeline` | Phase 36 ORCH-01 pipeline orchestrator. Chains rerun-validator → triage-classifier → issue-file (--source triage) → quarantine-append via `spawnSync` with `cwd: PROJECT_ROOT`. Requires `--llm-report <path>` (see `scripts/run-triage-pipeline.mjs`). Exits 0 always (D-06). | varies |
| `npm run e2e:weekly-digest` | Phase 37 weekly analytics digest. Reads open `e2e-nightly` + `e2e-quarantine` issues via `gh api`, aggregates five metrics (findings count, classification breakdown, top-3 failure categories, quarantine growth, cost vs cap), renders a ≤50-line markdown digest, writes it to `reports/weekly-digest-YYYY-WNN.md`, and publishes via `DIGEST_PUBLISH_MODE` (defaults to `issue` fallback with `e2e-digest` label). Requires `GITHUB_REPOSITORY`. | < 30 s |

All three scripts run `npm run build:chrome` first, so `dist/chrome/`
is always rebuilt from the current `src/` state — no stale-build
surprises.

### Artifacts

Each run writes a directory under `tests/e2e/artifacts/{run-id}/` where
`{run-id}` is an ISO-8601 timestamp (filesystem-safe — `:` replaced with
`-`). Per-run contents include:

- `report.json` — every case with `{ id, status, errorClass, citation,
  verifier_verdict, duration_ms, artifacts: [...] }`.
- `screenshots/*.png` — full-page captures on failure.
- `dom-snapshots/*.html` — DOM state on failure.
- `pdf-snippets/*.png` — rendered page slice around the cited
  column:line on failure.

The `artifacts/` directory is gitignored. CI uploads it as a workflow
artifact (Phase 29 retention: 14 days).

### Golden baseline

The frozen expected outputs live at `tests/golden/baseline.json` and
`tests/golden/per-case/`. They are NOT regenerated by the e2e suite —
they belong to the upstream unit-test corpus (`tests/test-cases.js`).
The e2e suite simply re-asserts that the live extension produces the
baseline values. To update them, run `npm run update-golden` and review
the diff carefully.

### Verifier (Phase 28)

Every PASS in `report.json` carries a `verifier_verdict` field with
`status: 'pass' | 'disagree'` (and `tier: 'A' | 'B' | 'C'`). The
verifier independently downloads the PDF and searches for the selected
text near the cited column:line using a separate pdfjs-dist code path
from the extension. A divergence (extension reports a citation, but the
re-parser cannot find the text within ±2 lines) is classified as
`VERIFIER_DISAGREE` — distinct from `WRONG_CITATION` (which requires
both a baseline mismatch AND a verifier disagreement).

### Deferred and synthetic cases

The full corpus has 76 entries, but the e2e suite runs 66 live cases.
The 10 it skips are listed in `scripts/select-cron-cases.mjs`:

- **`SYNTHETIC_CATEGORIES = {'gutter'}`** — synthetic gutter-number
  fixtures with no corresponding live Google Patents page (1 case).
- **`TIMEOUT_PILL_DEFERRED_IDS`** — 9 cases the extension does not
  currently produce a citation pill for within the timeout. They are
  tracked separately and revisited each release.

To add or remove an ID, edit the constants in
`scripts/select-cron-cases.mjs` and update the corresponding entry in
`tests/test-cases.js`. The rotation logic ensures every cron-eligible
live case still runs on a Sunday (Sunday = full suite; weekdays =
deterministic 30-case slice).

---

## Running exploratory mode locally

`e2e:explore [retired in Phase 10 RTR-03]` is a developer tool. It picks a patent + a
selection autonomously by invoking Anthropic's `claude -p` CLI, drives
the extension, classifies the result, and logs cost + decision into
`tests/e2e/artifacts/{run-id}/llm-report.json`. It is NOT part of the
CI pipeline.

Why an LLM picks the selection: human-authored test cases inherit the
author's blind spots. An LLM picking from the same 66-patent corpus
will reach for unusual selections — cross-column spans, text near
column-break hyphens, claim-body boundaries — that surface defects the
deterministic suite misses.

### Prerequisites

1. **`claude` CLI installed.** Requires Claude Code v2.1.139 or later
   (the version with subscription-mode `claude -p`). Install per
   [docs.claude.com/claude-code](https://docs.claude.com/claude-code).
   Then run `claude login` once with a Max 5 subscription account.
2. **`ANTHROPIC_API_KEY` MUST NOT be set in the shell.** If it is set,
   `claude -p` switches to pay-per-token API billing instead of
   subscription credit. Check with `echo "$ANTHROPIC_API_KEY"` — must
   be empty. Use `unset ANTHROPIC_API_KEY` if needed.
3. **`dist/chrome/` extension built.** The harness needs an unpacked
   extension to load. Run `npm run build:chrome` first.

### Usage

```bash
e2e:explore [retired in Phase 10 RTR-03]                  # 5 iterations (default)
e2e:explore [retired in Phase 10 RTR-03] -- --iterations 1
e2e:explore [retired in Phase 10 RTR-03] -- --iterations 10
e2e:explore [retired in Phase 10 RTR-03] -- --help        # usage
```

The double-dash separator (`--`) is npm's standard convention for
passing flags through to the underlying script.

### What happens per iteration

Each iteration runs through this sequence (mirrors
`runOneIteration` in `scripts/e2e-explore.mjs`):

1. **Spend cap check** — reads `tests/e2e/.llm-spend-ledger.json`;
   refuses to invoke if monthly total >= $100 (LLM-06).
2. **Patent pick** — picks a random ID from
   `getLiveCases()` (the 66-case live corpus).
3. **Spec extract** — `extractSpecText(patentId)` extracts pdfjs text
   from the cached PDF, starting from the first page with >= 500
   characters (skips cover, abstract, drawings).
4. **`claude -p` invocation** — single-turn JSON-output call with a
   60s timeout. System prompt instructs the LLM to pick a
   substring (50-300 characters) of the spec likely to surface an
   interesting parser behavior. User prompt includes the patent ID,
   category, and the spec excerpt.
5. **Response parse & validate** — JSON-parse the `result` field;
   verify `{caseId, patentId, selectedText, category, rationale}` are
   present. On parse error: 1 retry, then classify
   `LLM_API_ERROR`.
6. **Hallucination guard** — `selectionInSpec(specText, selectedText)`
   checks the LLM's selection against the same pdfjs-extracted text it
   was prompted with. Two-tier check: `wsNorm` first (whitespace
   collapse), then `tightNorm` (strip all non-alphanumeric) as a
   fallback for cross-column wraps. If neither finds the needle:
   classify `LLM_HALLUCINATED_SELECTION`, do NOT invoke the harness,
   record the iteration, continue to the next.
7. **Harness drive** — launches Chromium with the extension, navigates
   to the Google Patents page for `patentId`, programmatically selects
   `selectedText`, waits for the citation pill, observes the citation.
8. **Independent verify** — re-runs the Phase 28 PDF verifier against
   the LLM-chosen selection.
9. **Classify** — `PASS` if both extension citation and verifier agree;
   `WRONG_CITATION` if the verifier disagrees with the extension's
   citation; `VERIFIER_DISAGREE` if the extension citation matches the
   golden baseline for the case but the verifier still disagrees.
10. **Persist** — `appendLlmIteration(reportPath, entry)` writes the
    iteration to `tests/e2e/artifacts/{run-id}/llm-report.json`;
    `appendLedgerEntry(ledgerPath, entry)` increments the monthly
    spend (always, even on `LLM_API_ERROR` — cost may be non-zero).

### CI guard

The runner refuses to execute when either `process.env.CI` or
`process.env.GITHUB_ACTIONS` is truthy. Both are checked
(defense-in-depth — a misconfigured CI runner setting only one of them
still trips the guard).

```bash
CI=true e2e:explore [retired in Phase 10 RTR-03]
# [e2e-explore] exploratory mode is local-only — refusing to consume LLM credits in CI.
# exit 1
```

The CI guard exists because the subscription credit pool is a finite
monthly resource: a runaway nightly cron job could exhaust it in
hours. Exploratory mode is **local-only** by design.

### Outputs

A single `e2e:explore [retired in Phase 10 RTR-03]` run writes two files:

- `tests/e2e/artifacts/{run-id}/llm-report.json` — per-iteration
  classification, citation, verifier verdict, cost, duration. Schema
  documented under [Spend ledger](#spend-ledger).
- `tests/e2e/.llm-spend-ledger.json` — monthly cumulative spend with
  per-invocation breakdown.

---

## Uploading an exploratory report to CI

After running `e2e:explore [retired in Phase 10 RTR-03]` locally, ship the resulting
`llm-report.json` into the nightly CI pipeline without any manual
GitHub Actions clicks:

```bash
npm run e2e:upload-llm-report
```

This invokes `scripts/e2e-upload-llm-report.mjs`, which:

1. Pre-flights `gh auth status` (exit 7 with `gh auth login` guidance
   if not authenticated).
2. Reads the canonical `llm-report.json` (no path flag — uses
   `llmReportPathFor(resolveRunId())` from `tests/e2e/lib/`).
3. Base64-encodes the report and size-guards at 60KB (GitHub's
   `workflow_dispatch` input hard cap is 65,535 chars; exit 2 on
   oversize).
4. Dispatches the ingest workflow
   (`.github/workflows/e2e-ingest-llm-report.yml`) with the payload
   passed via STDIN (`-f payload_b64=@-`, to avoid `E2BIG` from
   oversized command-line args).
5. Sleeps 3 s to settle the `gh run list` race (cli/cli#5493), then
   captures the new ingest run's `databaseId` with a
   `createdAt >= triggerISO − 1 s` filter.
6. Dispatches `e2e-nightly.yml` with `llm_run_id=<captured id>` so
   the next nightly run downloads and schema-validates the artifact.
7. Prints the ingest run URL and opens it in your default browser
   (`gh run view --web`).

### Exit codes

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | Both stages dispatched, browser opened                          |
| 1    | No `llm-report.json` at canonical path                          |
| 2    | Base64 payload exceeded 60KB (reduce iterations and retry)      |
| 3    | Ingest run not found after settle+filter (race; retry helper)   |
| 4    | Stage 1 `gh workflow run e2e-ingest-llm-report.yml` failed      |
| 5    | Stage 2 `gh workflow run e2e-nightly.yml` failed                |
| 7    | `gh auth status` failed (run `gh auth login`)                   |

---

### Re-run validator (Phase 33)

After an `e2e:explore` run, replay each LLM-flagged anomaly three times via
the verifier-only path to classify it as CONFIRMED, FLAKE, or NOT_REPLAYABLE:

```bash
npm run e2e:rerun-validator -- --input tests/e2e/artifacts/<runId>/llm-report.json
# or, to use the newest report by mtime:
npm run e2e:rerun-validator
```

This invokes `scripts/e2e-rerun-validator.mjs`, which:

1. Resolves `--input <path>` (absolute or repo-relative). If omitted, defaults
   to the newest `tests/e2e/artifacts/*/llm-report.json` by mtime.
2. Reads and JSON-parses the input llm-report.
3. Calls `runValidator` from `tests/e2e/lib/rerun-validator.js`, which replays
   each `WRONG_CITATION` / `VERIFIER_DISAGREE` iteration exactly three times via
   `verifyCitation` and produces a per-iteration verdict.
4. Writes `rerun-report.json` adjacent to the source report
   (`artifacts/{runId}/rerun-report.json`, D-11).

Exit codes:

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| 0    | Success — `rerun-report.json` written                       |
| 1    | Input `llm-report.json` missing, unreadable, or unresolved  |
| 2    | Bad `--input` value (equals syntax or missing trailing arg) |

---

### Triage classifier (Phase 34)

After a re-run-validator run, classify each iteration by severity and root
cause via the hybrid triage classifier. Requires both `llm-report.json` and
its sibling `rerun-report.json` in the same `artifacts/{runId}/` directory:

```bash
npm run e2e:triage-classifier -- --input tests/e2e/artifacts/<runId>/llm-report.json
# or, to use the newest report by mtime:
npm run e2e:triage-classifier
```

This invokes `scripts/e2e-triage-classifier.mjs`, which:

1. Resolves `--input <path>` (absolute or repo-relative). If omitted, defaults
   to the newest `tests/e2e/artifacts/*/llm-report.json` by mtime.
2. Auto-discovers the sibling `rerun-report.json` in the same directory.
3. Calls `runTriage` from `tests/e2e/lib/triage-classifier.js`, which resolves
   6-of-8 iteration classifications heuristically (zero LLM calls) and routes
   ambiguous Tier-C CONFIRMED cases through an LLM second-pass via
   `invokeClaudePWithLedger`.
4. Writes `triage-report.json` adjacent to the source reports
   (`artifacts/{runId}/triage-report.json`, D-12).

**Local-only:** This script refuses to run in CI (`CI=true` or
`GITHUB_ACTIONS=true`) to prevent unintended LLM subscription credit
consumption (TRIAGE-04 three-layer defense).

Exit codes:

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 0    | Success — `triage-report.json` written                                         |
| 1    | CI gate fired OR input/sibling `rerun-report.json` missing or unreadable       |
| 2    | Bad `--input` value (equals syntax or missing trailing arg)                    |

---

## Test-hook contract

The extension exposes two `data-testid` attributes on its Shadow DOM
citation UI. These are the ONLY runtime-affecting source changes the
v3.0 milestone permits — they have no behavioral impact (added in
Phase 26).

| testid              | Element                                                       | Phase | Used by                                                                 |
| ------------------- | ------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `pct-citation-host` | The Shadow DOM **host** `<div>` element on the patent page     | 26    | Playwright shadow-open shim; `tests/e2e/lib/navigation.js`              |
| `pct-citation-pill` | The visible citation **pill** inside the closed shadow root    | 26    | `tests/e2e/lib/observation.js` `readCitationPill()`                     |

Both are set on real DOM elements created by `src/content/citation-ui.js`.
The pill testid is set when the extension renders a citation result;
the host testid is set whenever the Shadow DOM host is attached
(visible or not).

**If you rename or remove either testid, the `readme-structure.test.js`
guard will fail until this README is updated to reference the new
names.** The structural test enforces that both testid strings appear
verbatim somewhere in this document.

### Worker test-mode contract (Phase 30)

The Cloudflare Worker that proxies to USPTO and caches parsed
PositionMaps supports a test-mode header so test runs don't pollute the
production cache. The header is added by the extension's
`offscreen.js` (Chrome) or `background.js` (Firefox) **only** when
the corresponding storage keys are set.

| Mechanism                                    | Description                                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request header `X-PCT-Test-Mode: true`       | Sent on `POST /cache` calls when test-mode is active. Worker checks `headerValue !== 'true'` polarity — absence still writes to KV (production default unchanged).                                                            |
| `chrome.storage.local['pct_test_cache_version']` | Per-test nonce string set by `installWorkerTestModeRoute()`. When present, offscreen.js appends `?v={nonce}` instead of the production `CACHE_VERSION`, forcing a cache miss for that test.                                  |
| `chrome.storage.local['pct_test_mode']`      | Boolean true → offscreen.js adds the `X-PCT-Test-Mode: true` header on POST `/cache`.                                                                                                                                        |

The installer lives at `tests/e2e/lib/worker-test-mode-route.js`. It
sets both keys via `serviceWorker.evaluate()` (CDP `page.route` /
`context.route` cannot reach the extension's offscreen-document
fetches — see Phase 30 Plans 02 and 04). The production extension never
sets these keys, so its behavior is identical to today.

---

## Adding new test cases

To add a new test case, edit `tests/test-cases.js` and add an entry to
the `TEST_CASES` array.

```javascript
{
  id: 'US12345678-spec-short-1',          // {patentId}-{shape}-{n}
  patentFile: './tests/fixtures/US12345678.json',
  selectedText: '...verbatim text the user would highlight...',
  category: 'modern-short',                // see CATEGORIES at top of file
}
```

### `category` values

Defined at the top of `tests/test-cases.js`:

- `modern-short` — modern patent (2010+), 1-2 line selection
- `modern-long` — modern patent (2010+), multi-paragraph selection
- `pre2000-short` — pre-2000 patent, short selection
- `pre2000-long` — pre-2000 patent, long selection
- `chemical` — chemical patent with formula or special characters
- `cross-column` — selection spanning a column boundary
- `claims` — selection from the claims section
- `repetitive` — selection with highly-repeated phrases (comprising, wherein, said)
- `ocr` — OCR divergence between HTML and PDF text
- `gutter` — synthetic gutter-number validation (no live Google page)

### Workflow

1. **Generate the fixture.** `node scripts/generate-fixture.js {patentId}` —
   downloads the PDF, parses it, and writes
   `tests/fixtures/{patentId}.json`.
2. **Add the entry** to the `TEST_CASES` array. Make sure the
   `selectedText` is **verbatim** text from the fixture's PositionMap
   (the unit-test matcher requires exact-substring presence).
3. **Regenerate the baseline.** `npm run update-golden` reads
   `tests/test-cases.js`, runs the matcher against every fixture, and
   updates `tests/golden/baseline.json` + `tests/golden/per-case/`.
   Review the diff before committing.
4. **Smoke-test.** `npm run e2e:smoke -- --grep {caseId}` — runs just
   the new case end-to-end against the live Google Patents page.
5. **Add to the live e2e set.** If the smoke test passes (citation pill
   appears, verifier agrees), the case is automatically included in
   the next `npm run e2e:regression` run (no separate registration).
6. **Defer if needed.** If the extension cannot produce a citation pill
   for this case within the harness timeout, add the case ID to
   `TIMEOUT_PILL_DEFERRED_IDS` in `scripts/select-cron-cases.mjs` and
   file a follow-up issue tagged `e2e:timeout`.

---

## Spend ledger

The spend ledger tracks LLM API cost across `e2e:explore [retired in Phase 10 RTR-03]`
invocations. It enforces the soft warning at $80/month and the hard
block at $100/month per the v3.0 milestone decision.

### Location

`tests/e2e/.llm-spend-ledger.json` — **gitignored**.

Committing the ledger would publicly leak the developer's monthly
spend pattern (a privacy concern). The `.gitignore` rule was added in
Plan 31-01 and is enforced by Phase 31's pre-commit check.

### Schema

```json
{
  "version": 1,
  "months": {
    "2026-05": {
      "invocations": 12,
      "total_usd": 4.50,
      "last_invocation_iso": "2026-05-18T14:33:00Z",
      "iterations": [
        {
          "iso": "2026-05-18T14:33:00Z",
          "model": "claude-opus-4-7[1m]",
          "cost_usd": 0.42,
          "tokens_in": 1234,
          "tokens_out": 456,
          "iteration_n": 1,
          "run_id": "2026-05-18T14-32-50Z"
        }
      ]
    }
  }
}
```

The schema is defined in `tests/e2e/lib/llm-ledger.js` and exercised
by `tests/unit/llm-ledger.test.js` (18 tests).

### Thresholds

| Threshold                       | Behavior                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `total_usd >= $80` (this month) | Warning printed to stderr; run continues. Message: `⚠ Monthly spend $X >= $80 — approaching cap`.    |
| `total_usd >= $100` (this month)| Hard block. `e2e:explore [retired in Phase 10 RTR-03]` refuses to invoke `claude -p`; exits with code 4.                  |

Both thresholds use `>=` comparison: exactly $80.00 triggers the warning,
exactly $100.00 triggers the block. The check happens BEFORE every
`claude -p` invocation — the runner reads the ledger at startup, and
the spend pre-check fires once per run (not per iteration). If you
launch a 10-iteration run while the ledger is at $99.50, the first
iteration may complete (pushing the total over $100) but the second
iteration will not — the pre-check is at run start, not per iteration.

### Monthly rollover

The current-month key is computed by
`new Date().toISOString().slice(0, 7)` (e.g. `"2026-05"`). On the first
of each month, the next invocation creates a new top-level key under
`months`; the prior month's entry is preserved (for reference) but
ignored by the cap check. No manual rollover is needed.

### Reset procedure

To reset the ledger mid-month (e.g. for testing), **delete the file**:

```bash
rm tests/e2e/.llm-spend-ledger.json
```

The next `e2e:explore [retired in Phase 10 RTR-03]` invocation will recreate it from an
empty state. Tests in `tests/unit/llm-ledger.test.js` exercise this
"missing file" path (`readLedger()` returns
`{version: 1, months: {}}` on `ENOENT`).

### Concurrency note

The ledger is single-process. Do NOT run `e2e:explore [retired in Phase 10 RTR-03]` in two
terminals simultaneously — the second run's writes will clobber the
first's increment (read-modify-write is not atomic across processes).
The hard cap provides a last-resort guard against runaway spend, but
not transactional safety. See `31-RESEARCH.md` Pitfall 5.

### Cost notes

Per-invocation cost depends heavily on the system-prompt cache state:

- **First invocation of a session:** ~$0.19 (cache creation for the
  ~31K-token system prompt; ephemeral 1h tier).
- **Subsequent invocations in same hour:** ~$0.07 (cache hits).
- **Budget plan:** ~10-15 invocations × ~$0.10 = ~$1.50 per
  `e2e:explore [retired in Phase 10 RTR-03]` run. The $100/month cap supports ~1000
  invocations — far more than any single developer will use.

Use `total_cost_usd` from the `claude -p` response directly — it
accounts for input tokens, output tokens, cache creation, and cache
reads at their respective tiers. The internal pricing formula is
opaque; do not reconstruct cost from token counts (see
`31-RESEARCH.md` Pitfall 6).

---

## Troubleshooting

Common failures and remedies, ordered by frequency.

### `claude` CLI not found

```
[e2e-explore] `claude` CLI not found on PATH. Install Claude Code first.
exit 3
```

Install [Claude Code](https://docs.claude.com/claude-code) and run
`claude login` once with a Max 5 subscription account. Verify with
`claude --version` — must be v2.1.139 or later.

### Subscription exhausted

Iterations classify as `LLM_API_ERROR`; the iteration's
`llm_raw_response` field (truncated to 2000 chars) contains stderr text
including one of these keywords: `subscription`, `quota`, `credit`,
`MAX_5`, or `exhaust`. The Max 5 monthly credit pool is depleted —
exploratory mode is unavailable until the next billing cycle. Wait, or
upgrade to a higher plan. The `MAX_5_SUBSCRIPTION_EXHAUSTED` failure
mode does NOT have a separate taxonomy code; it is recorded as
`LLM_API_ERROR` with the keyword evidence preserved for forensic
diagnosis.

### `ANTHROPIC_API_KEY` is set

The runner does NOT explicitly unset `ANTHROPIC_API_KEY` (this is the
developer's responsibility — clearing it implicitly could mask other
intentional usage). If you see pay-per-token billing in your Anthropic
dashboard from the exploratory runs, check the env:

```bash
echo "$ANTHROPIC_API_KEY"   # must be empty
unset ANTHROPIC_API_KEY     # then retry
```

### CI guard fired locally

```
[e2e-explore] exploratory mode is local-only — refusing to consume LLM credits in CI.
exit 1
```

Check both env vars:

```bash
echo "CI=$CI GITHUB_ACTIONS=$GITHUB_ACTIONS"  # both must be empty
```

Some shells (Docker, devcontainers) set `CI=true` by default. Unset
both and retry. Note that this is the **only** path by which exit 1 is
emitted by `e2e:explore [retired in Phase 10 RTR-03]`.

### Ledger cap reached

```
[e2e-explore] Monthly LLM spend $100.13 >= $100. Refusing to invoke claude -p.
exit 4
```

The current month's `total_usd` is at or above $100. Options:

1. Wait until next month — `currentMonth()` rolls over automatically
   and the new month starts at $0.
2. Delete the ledger file to reset mid-month (see [Reset
   procedure](#reset-procedure)). Note this discards the spend history.

### Chromium install failure

```
Error: Executable doesn't exist at /home/.../chromium-1234/...
```

Playwright's Chromium download failed or is stale. Run:

```bash
npx playwright install chromium
```

If that fails too, clear the Playwright cache and reinstall:

```bash
rm -rf ~/.cache/ms-playwright/
npx playwright install chromium
```

### USPTO rate limit

Fault-injection or exploratory iterations involving USPTO fallback may
hit HTTP 429. The Worker proxy will surface this as
`WORKER_FALLBACK_FAILED` in the deterministic suite. For exploratory
mode, the iteration classifies as `WRONG_CITATION` (the extension
couldn't produce a valid citation). Slow down with
`--iterations 1` and retry after 60 seconds.

### Cache hit shortcuts

Exploratory runs do NOT automatically install the per-test nonce
(`pct_test_cache_version`) — that's a deterministic-suite mechanism for
preventing cache pollution. If you see suspicious instant citations
(< 100 ms response, no PDF download in the network panel), inspect
`tests/e2e/.pdf-cache/` for stale entries; delete the file and retry
the iteration.

### Google DOM drift

Specs fail with `errorClass: 'GOOGLE_DOM_DRIFT'`. The pre-flight DOM
probe (`tests/e2e/lib/navigation.js`) could not find the expected
selectors on the Google Patents page. Likely Google changed the page
structure. Investigate by:

1. Open the failing patent URL in a real browser.
2. Inspect the DOM to find the new structure.
3. Update the selectors in `navigation.js`.
4. Re-run the smoke suite.

### Hallucination rate spikes

Most exploratory iterations classify as `LLM_HALLUCINATED_SELECTION`.
Possible causes:

- The patent's body description starts on a late page; the
  density-heuristic (default 500 chars) skipped what looked like cover
  pages but were already substantive. Try increasing `maxPages` to 20
  via the relevant call site (`scripts/e2e-explore.mjs`).
- pdfjs extraction differs from what the LLM was prompted with. The
  two MUST be the same extraction call. If they have diverged, file a
  Phase 31 follow-up issue tagged `e2e:explore:hallucination`.
- The LLM is over-paraphrasing instead of quoting. The system prompt
  instructs strict verbatim quoting; if Claude Code's default
  system-prompt overrides this, the rate will spike. Inspect the
  `llm-report.json` iterations for the `selectedText` field — does it
  look like a quote or a paraphrase?

### `llm-report.json` exists but is empty/half

The append-only writer rewrites the whole file atomically on every
iteration — partial writes should never occur. If you observe
malformed JSON, the most likely cause is a disk full event:

```bash
df -h .                              # check disk space
ls -lh tests/e2e/artifacts/          # check artifacts dir size
```

Re-running with `--iterations N` creates a fresh `{run-id}/llm-report.json`
under a new directory; it does not resume the broken one.

### Pre-existing unit test failures

The repo currently has known pre-existing failures in
`tests/unit/text-matcher.test.js` (15 cases) and
`tests/unit/pdf-verifier.test.js` (Tier C boundary, 1 case). These
predate Phase 31 and are tracked separately. They do NOT block the
exploratory runner or the e2e suite.

---

For the v3.0 milestone roadmap and per-phase summaries, see
`.planning/ROADMAP.md` and `.planning/phases/`. For project-level
context, see the root `README.md` (forthcoming) and `.planning/PROJECT.md`.

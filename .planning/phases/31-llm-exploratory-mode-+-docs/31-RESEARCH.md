# Phase 31: LLM Exploratory Mode + Docs - Research

**Researched:** 2026-05-15
**Domain:** `claude -p` CLI invocation, Playwright programmatic API, pdfjs-dist text extraction, spend ledger design, Vitest unit testing, Markdown documentation
**Confidence:** HIGH (all critical claims verified empirically against installed toolchain)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**`claude -p` driver**
- File: `scripts/e2e-explore.mjs` invoked via `npm run e2e:explore`
- CLI: `claude -p --output-format json --max-turns 1` — single-turn deterministic JSON output. No multi-turn.
- Subscription mode: Max 5 plan; `ANTHROPIC_API_KEY` MUST NOT be set when invoking (forces subscription credit pool, not pay-per-token API).
- Timeout per invocation: 60s. On timeout: classify as `LLM_API_ERROR`, log, continue.
- Retry policy: 1 retry on JSON parse error or missing required fields. After retry: `LLM_API_ERROR`. No retry on timeout.
- Iteration cadence: Default 5 iterations per run; configurable via `--iterations N`.

**Patent + selection picker**
- Patent universe: Existing TEST_CASES corpus (66 live cases). LLM picks an ID.
- LLM input: system prompt + user prompt containing a list of patent IDs + categories + first 2 pages of spec text for one pre-randomized candidate.
- LLM output schema: `{ caseId, patentId, selectedText, category, rationale }` — strict JSON.
- Selection length constraints: 50–300 characters; must appear verbatim in spec text.

**Spend ledger**
- Path: `tests/e2e/.llm-spend-ledger.json` — gitignored.
- Schema: `{ version:1, months: { "YYYY-MM": { invocations, total_usd, last_invocation_iso, iterations:[...] } } }`.
- Monthly rollover: natural key `Date().toISOString().slice(0,7)`.
- Hard cap: refuse before invocation if monthly total_usd >= $100.
- Warning: print at >= $80, continue.

**Hallucination guard**
- Sequence: LLM returns selection → load spec text via pdf-fetch.js + pdfjs-dist legacy → normalize (collapse whitespace) → `specText.includes(normalizedSelection)`.
- On false: classify `LLM_HALLUCINATED_SELECTION`, do NOT invoke harness, continue.

**CI guard**
- Top of `scripts/e2e-explore.mjs`: if `CI` or `GITHUB_ACTIONS` is truthy → exit 1.

**Report writer (`llm-report.json`)**
- Path: `tests/e2e/artifacts/{run-id}/llm-report.json`.
- Schema: `{ run_id, started_iso, finished_iso, iterations_total, summary: {..., total_cost_usd}, iterations:[...] }`.
- Write whole file on each iteration append (crash-safe partial report).

**README structure** (`tests/e2e/README.md`, ~400 lines)
- 7 sections: Overview, Running deterministic suite, Running exploratory mode, Test-hook contract, Adding test cases, Spend ledger, Troubleshooting.

**Error taxonomy extension**
- Add `LLM_HALLUCINATED_SELECTION` and `LLM_API_ERROR` to `tests/e2e/lib/error-codes.js` and `ERROR_CLASSES` array.

### Claude's Discretion
- Exact prompt wording for the LLM picker
- Whether to print iteration progress to stdout vs only writing llm-report.json
- Whether to include a `--dry-run` flag (estimate cost without invoking)
- Format of the warning at $80 (color codes, blink, etc.)
- Whether to fetch full spec text per iteration vs cache the 2-page excerpt per patent in `tests/e2e/.spec-cache/`
- Exact wording in README

### Deferred Ideas (OUT OF SCOPE)
- ANTHROPIC_API_KEY fallback (pay-per-token) when Max 5 exhausted — v3.1+
- Prompt caching to reduce per-iteration cost — v3.1+
- Multi-turn iterations — v3.1+
- Patent universe expansion beyond TEST_CASES corpus — v3.1+
- Slack/Discord cost alerts — v3.1+
- Diversity dedup within last 24h — v3.1+
- LLM model selection (Sonnet vs Opus) — v3.1+
- CI-friendly mock LLM mode for testing the harness without invoking real LLM — v3.1+
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-01 | Exploratory mode runner autonomously picks patent + selection via `claude -p`, drives harness, verifies via verifier, logs every prompt/response/verdict | Verified: spawn-based claude -p invocation works; loadExtension/gotoPatent/selectText/verifyCitation all importable in plain ESM script |
| LLM-02 | Runner uses `claude -p --output-format json` against Max 5 subscription credit pool; no ANTHROPIC_API_KEY required | VERIFIED: live test confirms subscription mode (no API key set); `total_cost_usd` in JSON response |
| LLM-03 | Validate LLM-chosen text appears in patent spec before driving plugin | VERIFIED: pdfjs-dist legacy extracts text in ~330ms for 44-page patent; tightNorm required for cross-column text; see Pitfall 3 |
| LLM-04 | Extend RPT-02 taxonomy with `LLM_HALLUCINATED_SELECTION` and `LLM_API_ERROR` | Trivial extension of existing error-codes.js frozen-const pattern |
| LLM-05 | Local JSON ledger tracking tokens, model, cost per invocation, monthly rollover | `total_cost_usd` field available directly in JSON response; no rate-card calculation needed |
| LLM-06 | Warning at $80, hard block at $100, checked before each invocation | Straightforward ledger read before each spawn |
| LLM-07 | Refuse when `process.env.CI` is truthy | VERIFIED: `process.exit(1)` with message, confirmed works |
| LLM-08 | Structured `llm-report.json` per run, compatible with deterministic report schema | Mirrors existing report.js pattern; llm-report.js is a parallel implementation |
| DOC-01 | `tests/e2e/README.md` documents both modes, test-hook contract, adding cases, spend ledger | No technical prerequisite; content is architectural knowledge |
</phase_requirements>

---

## Summary

Phase 31 wires together four previously-independent pieces: the `claude -p` CLI (already installed, v2.1.139), the existing Playwright extension harness (`loadExtension` in `extension-loader.js`), the Phase 28 PDF verifier, and the Phase 28 report writer. The phase introduces one new infrastructure pattern (a per-invocation spend ledger) and two new error codes. No new npm dependencies are required — `pdfjs-dist`, `@playwright/test`, and Vitest are already installed.

The most important verified fact for planning is the exact shape of `claude -p --output-format json` output: the `total_cost_usd` field appears directly in the response and should be used for ledger writes without attempting to reconstruct cost from token counts and rate cards. The `modelUsage` key contains the model identifier (e.g. `"claude-opus-4-7[1m]"`). When `claude -p` is killed by SIGTERM (timeout), it exits with code 143 and emits no stdout — the driver must handle empty stdout as `LLM_API_ERROR`.

A critical implementation nuance: the hallucination guard must verify the LLM's selection against the **same pdfjs-extracted text excerpt that was fed to the LLM** in the prompt. This text differs from the Google Patents HTML page text (confirmed empirically: `plasma cells and antibody` in PDF vs `plasma cells and plasmablasts` in HTML). Using `wsNorm` (collapse whitespace only) is insufficient for cross-column text; `tightNorm` (strip all non-alphanumeric) is required for reliable matching. The CONTEXT.md approach of using pdfjs is correct and must be consistent: extract the same pages with the same pipeline, verify with the same normalization used when building the prompt.

**Primary recommendation:** Implement as 4 plans — (1) core driver + ledger + hallucination module, (2) llm-report writer + error-codes extension, (3) Vitest unit tests for all new modules, (4) README.md.

---

## Standard Stack

### Core (all already installed)
| Library | Installed Version | Purpose | Verification |
|---------|-----------------|---------|-------------|
| `claude` CLI | v2.1.139 | LLM invocation via `claude -p` | [VERIFIED: `claude --version`] |
| `@playwright/test` | 1.60.0 | `chromium.launchPersistentContext` for harness | [VERIFIED: programmatic import works in plain ESM] |
| `pdfjs-dist` | ^5.5.207 (latest: 5.7.284) | Spec text extraction for hallucination guard | [VERIFIED: `getDocument` from `legacy/build/pdf.mjs` extracts 44 pages in ~330ms] |
| `vitest` | 3.2.4 | Unit tests for new modules | [VERIFIED: `npm list vitest`] |

### Supporting (already installed)
| Library | Version | Purpose |
|---------|---------|---------|
| `node:child_process` (stdlib) | Node v24.11.1 | `spawn` for `claude -p` invocation |
| `node:fs` (stdlib) | — | Ledger read/write, spec excerpt cache |

**No new npm dependencies required.** All tools are already in `devDependencies`.

### Installation
```bash
# Nothing to install — all dependencies already present
# Verify claude CLI is available:
which claude && claude --version
```

---

## Architecture Patterns

### Recommended Project Structure (new files)
```
scripts/
  e2e-explore.mjs          # Main driver — LLM picker, iteration loop, ledger writes
tests/e2e/
  lib/
    llm-ledger.js           # Spend ledger reader/writer
    llm-report.js           # append-only writer for llm-report.json
    llm-hallucination.js    # specText.includes(normalizedSelection) guard
    llm-pricing.js          # Pricing constants (kept separate for easy update)
    error-codes.js          # EXTENDED with LLM_HALLUCINATED_SELECTION + LLM_API_ERROR
  README.md                 # New doc file (~400 lines)
  .llm-spend-ledger.json    # (gitignored, created at runtime)
  .spec-cache/              # (gitignored, optional spec text cache)
```

### Pattern 1: Spawning `claude -p` from Node.js
**What:** Use `child_process.spawn` (not `execFile` or `exec`) for streaming stdout, clean SIGTERM handling, and separate stderr capture.

```javascript
// Source: [VERIFIED - live invocation in this session]
import { spawn } from 'node:child_process';

async function invokeClaudeP({ systemPrompt, userPrompt, timeoutMs = 60_000 }) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--max-turns', '1',
      '--system-prompt', systemPrompt,
      userPrompt,
    ];
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ timedOut: true, stdout: '', stderr: '', code: null });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, stdout, stderr, code });
    });
  });
}
```

**Key invariants verified:**
- Exit 0 + populated stdout = success (check `is_error` field additionally)
- Exit 143 (SIGTERM) + empty stdout = timeout → classify `LLM_API_ERROR`
- `is_error: true` in parsed JSON = API-level error → classify `LLM_API_ERROR`
- `--bare` flag MUST NOT be used — it switches to `ANTHROPIC_API_KEY`-only auth, breaking subscription mode

### Pattern 2: `claude -p --output-format json` Response Shape (FULLY VERIFIED)

```javascript
// Source: [VERIFIED - two live invocations in this session, 2026-05-15]
// Top-level fields (all verified present):
{
  "type": "result",               // always "result"
  "subtype": "success",           // "success" | "error_max_turns" | other error subtypes
  "is_error": false,              // boolean — true = API-level failure
  "result": "...",                // string — the LLM's text output (empty on error)
  "stop_reason": "end_turn",      // "end_turn" (success) | "tool_use" (schema enforcement)
  "total_cost_usd": 0.19401,      // number — USE THIS directly; do not reconstruct from tokens
  "usage": {
    "input_tokens": 5,
    "output_tokens": 13,
    "cache_creation_input_tokens": 30986,
    "cache_read_input_tokens": 0,
    "service_tier": "standard",
    // ... more fields (server_tool_use, speed, etc.)
  },
  "modelUsage": {
    "claude-opus-4-7[1m]": {     // key IS the model identifier
      "inputTokens": 5,
      "outputTokens": 13,
      "cacheReadInputTokens": 0,
      "cacheCreationInputTokens": 30986,
      "costUSD": 0.19401,
      "contextWindow": 1000000,
      "maxOutputTokens": 64000
    }
  },
  "num_turns": 1,
  "session_id": "...",
  "duration_ms": 5928,
  "duration_api_ms": 5884,
  // ... terminal_reason, fast_mode_state, uuid, etc.
}
```

**Cost tracking:** Use `response.total_cost_usd` directly. The internal pricing formula (input + output + 1h ephemeral cache creation + cache read) involves multiple rates and is opaque. The `total_cost_usd` field is the authoritative pre-computed value.

**Model identifier:** Extract from `Object.keys(response.modelUsage)[0]` — e.g. `"claude-opus-4-7[1m]"`. Store verbatim in the ledger's `iterations[].model` field.

### Pattern 3: Playwright Programmatic Invocation (VERIFIED)

```javascript
// Source: [VERIFIED - live test in this session]
// chromium.launchPersistentContext works outside playwright test() runner.
// Import from '@playwright/test' directly in an ESM script.
import { chromium } from '@playwright/test';
// Then call loadExtension() from tests/e2e/lib/extension-loader.js — fully reusable.
import { loadExtension } from '../tests/e2e/lib/extension-loader.js';
```

No `npx playwright test` wrapper required. The iteration loop in `e2e-explore.mjs` can be a plain async function.

### Pattern 4: Hallucination Guard — pdfjs Text Extraction

```javascript
// Source: [VERIFIED - empirical test in this session]
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensureCachedPdf } from '../tests/e2e/lib/pdf-fetch.js';  // reuse Phase 28

const CMAP_URL = path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/cmaps/') + '/';
const STANDARD_FONT_DATA_URL = path.resolve(PROJECT_ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + '/';

async function extractSpecText(patentId, numPages = 8) {
  const pdfPath = await ensureCachedPdf(patentId);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  let items = [];
  for (let i = 1; i <= Math.min(numPages, doc.numPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    items.push(...content.items.map(item => item.str));
  }
  return items.join(' ');  // space-join is required (items do NOT already have trailing spaces)
}

// Normalization for guard check:
function wsNorm(s) { return s.replace(/\s+/g, ' ').trim().toLowerCase(); }
function tightNorm(s) { return s.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase(); }

// Guard: try wsNorm first, fall back to tightNorm
function selectionInSpec(specText, selectedText) {
  if (wsNorm(specText).includes(wsNorm(selectedText))) return { found: true, method: 'wsNorm' };
  if (tightNorm(specText).includes(tightNorm(selectedText))) return { found: true, method: 'tightNorm' };
  return { found: false, method: null };
}
```

**Critical insight:** The PDF text content (pdfjs) differs from Google Patents HTML text in patent body text. For cross-column or wrapped text, `wsNorm` alone fails; `tightNorm` (strips all non-alphanumeric) is required. The LLM prompt must be built from the **same pdfjs-extracted text** that the hallucination guard checks against. The excerpt sent to the LLM and the guard's search text must use the same extraction call.

### Pattern 5: Spend Ledger (no-lock, single-process safe)

The ledger file is only written by `e2e-explore.mjs`. Since the exploratory runner is single-process (not parallelized), a read-modify-write without file locks is safe — the same design as `tests/e2e/lib/report.js`.

```javascript
// Pattern mirrors report.js (Phase 28) — [VERIFIED: report.js pattern, same codebase]
function readLedger(ledgerPath) {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch { return { version: 1, months: {} }; }
}

function currentMonth() { return new Date().toISOString().slice(0, 7); }  // "YYYY-MM"

function monthlyTotal(ledger) {
  return ledger.months[currentMonth()]?.total_usd ?? 0;
}
```

### Anti-Patterns to Avoid
- **Using `--bare` flag:** Switches to `ANTHROPIC_API_KEY`-only auth, breaking subscription mode. Never use.
- **Using `--json-schema` flag:** With subscription mode and `--max-turns 1`, the schema enforcement triggers `tool_use` stop_reason and then `error_max_turns`. Rely on prompt-level JSON instruction instead.
- **Reconstructing cost from token counts:** The formula is opaque (1h ephemeral cache, 5m cache, cache-read all at different rates). Use `total_cost_usd` from the response directly.
- **Using `wsNorm` only for hallucination check:** Cross-column pdfjs text fails wsNorm. Always provide `tightNorm` fallback.
- **Feeding HTML page innerText to LLM but checking against pdfjs text:** These diverge. Keep the text source consistent (pdfjs for both prompt and guard).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom byte parser | `pdfjs-dist/legacy/build/pdf.mjs` | Already installed; already calibrated in pdf-verifier.js with CMAP + font data paths |
| Extension loading | Custom Chrome DevTools Protocol code | `extension-loader.js` (Phase 26) + `chromium.launchPersistentContext` | Already handles shadow DOM shim, clipboard shim, SW readiness |
| PDF cache management | Custom HTTP caching | `pdf-fetch.js` (Phase 28) `ensureCachedPdf()` | Already handles 5KB floor check, content-type guard, cache dir |
| Run ID generation | Date-to-string logic | `run-id.js` (Phase 28) `resolveRunId()` | Already handles `PLAYWRIGHT_RUN_ID` env, filesystem-safe ISO |
| Report path resolution | `path.join` inline | `reportPathFor(runId)` from `report.js` | Ensures all runs use the canonical artifacts root |
| Live case filtering | Inline filter logic | `getLiveCases()` from `select-cron-cases.mjs` | Already excludes TIMEOUT_PILL_DEFERRED_IDS and SYNTHETIC_CATEGORIES |

---

## Common Pitfalls

### Pitfall 1: `--bare` Breaks Subscription Authentication
**What goes wrong:** `claude -p --bare` uses `ANTHROPIC_API_KEY` exclusively (keychain and OAuth are skipped). If the developer has no API key set (Max 5 subscription users typically don't), every invocation fails immediately.
**Why it happens:** `--bare` is documented as "minimal mode" for scripting; developers assume it is "clean for automation." It is correct for server environments but wrong for subscription-mode local dev.
**How to avoid:** Never pass `--bare` in `e2e-explore.mjs`. Without `--bare`, the CLI uses keychain/OAuth → subscription credit pool.
**Warning signs:** `claude -p` exits immediately with an auth error or `is_error: true` on first invocation.

### Pitfall 2: `--json-schema` Triggers `error_max_turns` in Subscription Mode
**What goes wrong:** Passing `--json-schema` causes `stop_reason: tool_use` → then the single-turn constraint triggers `error_max_turns` with `is_error: true` and empty `result`.
**Why it happens:** JSON schema enforcement internally requires a tool invocation, which counts as a turn.
**How to avoid:** Use prompt-level JSON instructions (`"Return strict JSON with fields: ..."`) and parse `d.result` with `JSON.parse`. Add one retry for parse failures.
**Warning signs:** `subtype: "error_max_turns"` with `stop_reason: "tool_use"`.

### Pitfall 3: `wsNorm` Insufficient for Hallucination Guard
**What goes wrong:** `specText.replace(/\s+/g,' ').includes(selection.replace(/\s+/g,' '))` returns false for cross-column text, even though the selection genuinely appears in the spec. Rate of false `LLM_HALLUCINATED_SELECTION` classifications inflates, masking real test runs.
**Why it happens:** pdfjs inserts spurious spaces within words at column boundaries (e.g., `"pro grammable"` instead of `"programmable"`). The selection text (from the same pdfjs extraction) inherits these spaces inconsistently.
**How to avoid:** Two-tier check: wsNorm first (preserves word boundaries), then `tightNorm` (strip all non-alphanumeric) as fallback. Record which tier matched in the `hallucination_check` block of llm-report.json.
**Warning signs:** 100% `LLM_HALLUCINATED_SELECTION` rate on first run. Check manually by searching the raw pdfjs text with `tightNorm`.

### Pitfall 4: Empty Stdout on SIGTERM Causes JSON Parse Error
**What goes wrong:** `JSON.parse('')` throws `SyntaxError`. If the driver calls `JSON.parse(stdout)` without checking `stdout.length`, every timeout iteration crashes the driver rather than classifying gracefully.
**Why it happens:** When `child.kill('SIGTERM')` is sent, claude exits with code 143 and emits nothing to stdout (confirmed: two separate tests).
**How to avoid:** Always guard: `if (!stdout.trim()) { /* classify LLM_API_ERROR */ }` before `JSON.parse(stdout)`.
**Warning signs:** Unhandled `SyntaxError: Unexpected end of JSON input` in the driver.

### Pitfall 5: Ledger File Corruption on Concurrent Runs
**What goes wrong:** Two `npm run e2e:explore` invocations running simultaneously both read the ledger, write their updates, and the second write overwrites the first's new entry.
**Why it happens:** No file locking; read-modify-write is not atomic on the filesystem.
**How to avoid:** Document in README and `--help` output that the script should not be run concurrently. The ledger is designed for single-developer local use. The hard cap check (before each invocation) provides a last-resort guard.
**Warning signs:** `invocations` count in the ledger jumps by more than 1 per run.

### Pitfall 6: `total_cost_usd` Reflects Cache Overhead, Not Just LLM Tokens
**What goes wrong:** First invocation costs ~$0.19 (cache creation for the 31K-token system prompt). Subsequent invocations with cache hits cost ~$0.07. Planning/alerting based on a flat per-invocation estimate will be inaccurate.
**Why it happens:** Claude Code's default system prompt (~31K tokens) is cached as 1h ephemeral on first invocation. Cache creation costs more per token than reads.
**How to avoid:** Use `total_cost_usd` directly (it already accounts for all tiers). Do not use a flat `0.12/iteration` estimate for the $80/$100 guard — the ledger's `total_usd` is the ground truth.
**Warning signs:** First run's `total_cost_usd` is 2-3x higher than subsequent runs for the same prompt.

### Pitfall 7: Patent Body Text Starts on Page 13+, Not Pages 1-2
**What goes wrong:** The system prompt sends "the first 2 pages of spec text" but pages 1-2 of a patent PDF contain only the cover page (patent number, assignee, abstract). The LLM receives no useful description text to select from.
**Why it happens:** Patent PDFs have a cover page, drawings pages, and then the description/claims. Body text starts on later pages.
**How to avoid:** When building the LLM prompt, extract pages starting from where body text begins. Empirically (tested on US11427642): body description starts page 13. A practical heuristic: skip pages until you see text longer than 500 chars. Or send more pages (8-10) to guarantee coverage of the description. Log which pages were included in the prompt.
**Warning signs:** LLM returns `LLM_HALLUCINATED_SELECTION` on every iteration, or its `rationale` references only the abstract.

### Pitfall 8: Subscription Exhaustion Mid-Iteration Leaves Partial Ledger Entry
**What goes wrong:** If the Max 5 subscription pool is exhausted mid-iteration, `is_error: true` is returned but `total_cost_usd` may still be non-zero (partial processing). The ledger write must happen even on errors.
**How to avoid:** Always write the ledger entry after every invocation, regardless of `is_error` value, using whatever `total_cost_usd` the response contains (may be 0 on hard failures). The CONTEXT.md's llm-report schema already includes `cost_usd` per iteration.
**Warning signs:** Ledger `invocations` count diverges from actual invocations observed.

---

## Code Examples

### Parsing `claude -p` JSON response (driver pattern)
```javascript
// Source: [VERIFIED live invocation 2026-05-15]
async function runClaudeIteration(systemPrompt, userPrompt) {
  const { timedOut, stdout, code } = await invokeClaudeP({ systemPrompt, userPrompt, timeoutMs: 60_000 });

  if (timedOut || !stdout.trim()) {
    return { error: 'LLM_API_ERROR', reason: timedOut ? 'timeout' : 'empty_stdout' };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { error: 'LLM_API_ERROR', reason: 'json_parse_error', raw: stdout.slice(0, 500) };
  }

  if (parsed.is_error) {
    return { error: 'LLM_API_ERROR', reason: parsed.subtype ?? 'api_error', costUsd: parsed.total_cost_usd ?? 0 };
  }

  // Extract model identifier
  const modelId = Object.keys(parsed.modelUsage ?? {})[0] ?? 'unknown';

  return {
    result: parsed.result,            // string — LLM's text response
    costUsd: parsed.total_cost_usd,   // number — use directly
    modelId,                          // e.g. "claude-opus-4-7[1m]"
    durationMs: parsed.duration_ms,
    usage: parsed.usage,
  };
}
```

### Extending error-codes.js
```javascript
// Add to tests/e2e/lib/error-codes.js (after WORKER_FALLBACK_FAILED)
// Source: existing pattern [VERIFIED: error-codes.js current content]
export const LLM_HALLUCINATED_SELECTION = 'LLM_HALLUCINATED_SELECTION';
export const LLM_API_ERROR = 'LLM_API_ERROR';

// Update ERROR_CLASSES array:
export const ERROR_CLASSES = Object.freeze([
  'EXTENSION_NOT_LOADED',
  'NO_CITATION_PRODUCED',
  'WRONG_CITATION',
  'UI_BROKEN',
  'VERIFIER_DISAGREE',
  'GOOGLE_DOM_DRIFT',
  'USPTO_API_DRIFT',
  'FLAKE',
  'WORKER_FALLBACK_FAILED',
  'LLM_HALLUCINATED_SELECTION',  // Phase 31
  'LLM_API_ERROR',               // Phase 31
]);
```

### Ledger write after invocation
```javascript
// Source: mirrors report.js pattern [VERIFIED: report.js in this codebase]
function appendLedgerEntry(ledgerPath, entry) {
  const ledger = readLedger(ledgerPath);
  const month = currentMonth();
  if (!ledger.months[month]) {
    ledger.months[month] = { invocations: 0, total_usd: 0, last_invocation_iso: null, iterations: [] };
  }
  const m = ledger.months[month];
  m.invocations += 1;
  m.total_usd = +(m.total_usd + entry.cost_usd).toFixed(6);
  m.last_invocation_iso = new Date().toISOString();
  m.iterations.push(entry);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `ANTHROPIC_API_KEY` for headless LLM in tests | Max 5 subscription credit pool via `claude -p` (no API key) | Anthropic May 2026 announcement | $100/mo included credit replaces per-token billing for local dev |
| Playwright only usable inside `playwright test` runner | `chromium.launchPersistentContext` importable in any ESM script | Playwright 1.49+ (headless extension support) | Enables a plain `node` iteration loop, not a test suite |
| `--json-schema` for structured LLM output | Prompt-level JSON instruction + `JSON.parse(d.result)` with retry | N/A (--json-schema incompatible with --max-turns 1 in subscription mode) | Simpler, no tool-use overhead |

**Important note:** The `--bare` flag in Claude Code v2.1.139 switches auth to `ANTHROPIC_API_KEY`-only (documented in `--help`). This is a 2026 change that breaks the subscription-mode approach. Never use `--bare` in the explorer script.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude -p` with Max 5 subscription uses OAuth/keychain by default (no `ANTHROPIC_API_KEY` needed) | Standard Stack | If wrong: all invocations fail; blocked on API key setup |
| A2 | Subscription exhaustion returns `is_error: true` (not a non-zero exit code with no JSON) | Common Pitfalls | If wrong: driver crashes on JSON parse; needs separate `stderr` check for "exhausted" message |
| A3 | The `total_cost_usd` field is present in all subscription-mode responses, including partial failures | Architecture Patterns | If wrong: ledger writes may miss cost of failed invocations |

Note A1 is PARTIALLY VERIFIED: confirmed that with no `ANTHROPIC_API_KEY` set, the live invocations succeeded. The subscription mechanism is [ASSUMED] to use keychain/OAuth per the `--help` text: "OAuth and keychain are never read" only applies in `--bare` mode.

---

## Open Questions

1. **Subscription exhaustion error shape**
   - What we know: `is_error: true` with various subtypes observed for `error_max_turns`. Anthropic's Max 5 exhaustion may produce a different subtype or a non-JSON `stderr` message.
   - What's unclear: The exact `subtype` string when the monthly credit pool is empty (cannot be tested without exhausting the real pool).
   - Recommendation: In the driver, treat any `is_error: true` OR non-JSON stdout as `LLM_API_ERROR`. Log the full raw JSON for manual diagnosis. Document in README that if exhaustion is suspected, check `stderr` for a "subscription" keyword.

2. **Spec text page range for LLM prompt**
   - What we know: For US11427642, body description starts on page 13 (verified). Cover/abstract pages 1-2 contain no useful selection text.
   - What's unclear: Whether all patents in the 66-case corpus follow the same "pages 1-12 = front matter" pattern.
   - Recommendation: Send a wider range (e.g., pages 5-12 of the PDF, or detect first page with >500 chars of contiguous text). Alternatively, use the Phase 28 parsePdf column-detection logic to find the first description column. Document the chosen approach in `llm-hallucination.js`.

3. **Spec-cache vs fresh extract per iteration**
   - What we know: Full 44-page extraction takes ~330ms. A 10-page extraction takes ~92ms.
   - What's unclear: Whether the CONTEXT's "Claude's Discretion" area allows caching the spec excerpt per-patent in `.spec-cache/` to avoid re-extraction on repeated runs.
   - Recommendation: Cache the extracted text per `(patentId, numPages)` in a module-level `Map`. For the git-ignored `.spec-cache/` directory approach (also discretionary), add it to `.gitignore` alongside `.llm-spend-ledger.json`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `claude` CLI | LLM invocation (LLM-01, LLM-02) | ✓ | v2.1.139 | None — document as developer prerequisite |
| `chromium` (Playwright) | Harness launch | ✓ | Playwright 1.60.0 | None |
| `pdfjs-dist` | Spec text extraction (LLM-03) | ✓ | 5.5.207 (latest: 5.7.284) | None needed |
| `vitest` | Unit tests | ✓ | 3.2.4 | None |
| `dist/chrome/` extension build | Harness | ✓ (manual verify: `npm run build:chrome`) | — | CI build step |
| `tests/e2e/.pdf-cache/` | Hallucination guard (reuse Phase 28 cache) | ✓ (US11427642.pdf present) | — | auto-fetched by `ensureCachedPdf` |

**Missing dependencies with no fallback:**
- `claude` CLI: must be installed by the developer. `e2e-explore.mjs` should check `which claude` at startup and exit with a clear error if missing.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.js` (include: `tests/**/*.test.js`) |
| Quick run command | `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js` |
| Full suite command | `npm run test:src` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-01 | `e2e-explore.mjs` runs N iterations, each picks/drives/verifies | integration (manual) | `npm run e2e:explore -- --iterations 1` | ❌ Wave 0 |
| LLM-02 | `claude -p` uses subscription mode (no API key), `total_cost_usd` in response | manual (cannot automate subscription pool) | manual verification | — |
| LLM-03 | Hallucination guard finds real text; rejects hallucinated text | unit | `vitest run tests/unit/llm-hallucination.test.js` | ❌ Wave 0 |
| LLM-04 | ERROR_CLASSES array contains new codes; existing by_error_class tallies unaffected | unit | `vitest run tests/unit/error-codes.test.js` | ❌ Wave 0 |
| LLM-05 | Ledger writes month entry; reads total; rolls over on new month | unit | `vitest run tests/unit/llm-ledger.test.js` | ❌ Wave 0 |
| LLM-06 | Hard block at $100 BEFORE invocation; warning at $80 | unit | `vitest run tests/unit/llm-ledger.test.js` (threshold tests) | ❌ Wave 0 |
| LLM-07 | `CI=true node scripts/e2e-explore.mjs` exits 1 | unit/integration | `CI=true node scripts/e2e-explore.mjs; [ $? -eq 1 ]` | ❌ Wave 0 |
| LLM-08 | llm-report.json written per iteration; summary includes total_cost_usd | unit | `vitest run tests/unit/llm-report.test.js` | ❌ Wave 0 |
| DOC-01 | README.md exists with 7 required sections | structural | `node -e "const s=require('fs').readFileSync('tests/e2e/README.md','utf8'); ['Overview','deterministic','exploratory','test-hook','Adding','ledger','Troubleshooting'].every(h=>s.includes(h)) && process.exit(0)"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/llm-ledger.test.js tests/unit/llm-hallucination.test.js tests/unit/llm-report.test.js`
- **Per wave merge:** `npm run test:src`
- **Phase gate:** Full suite green (`npm run test`) + `npm run e2e:explore -- --iterations 1` manually verified before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/llm-ledger.test.js` — covers LLM-05, LLM-06 (threshold tests)
- [ ] `tests/unit/llm-hallucination.test.js` — covers LLM-03 (wsNorm match, tightNorm fallback, rejection)
- [ ] `tests/unit/llm-report.test.js` — covers LLM-08 (iteration append, summary, partial run cost)
- [ ] `tests/unit/error-codes.test.js` — covers LLM-04 (new codes in ERROR_CLASSES, existing by_error_class unaffected)

*(Note: existing test infrastructure via `vitest.config.js` already picks up `tests/**/*.test.js` — no new config needed)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (LLM output parsed as JSON) | `JSON.parse` in try/catch; schema validation on parsed object fields |
| V6 Cryptography | no | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM output injection (malicious `selectedText` containing shell metacharacters) | Tampering | Never pass `selectedText` through shell expansion; use `page.evaluate()` to inject into DOM |
| Spend ledger tampering (manually inflated to trigger $100 block) | Denial of Service | Not a security concern for local dev — document that deleting the file resets |
| API key exfiltration via `ANTHROPIC_API_KEY` env var | Info Disclosure | CONTEXT.md decision: do not set `ANTHROPIC_API_KEY` — uses subscription auth only |

---

## Suggested Plan Split (4 Plans)

The planner should use these as a starting point:

**Plan 31-01 — Core driver + ledger + hallucination guard (Wave 1)**
- `tests/e2e/lib/llm-ledger.js` — spend ledger reader/writer + monthly rollover
- `tests/e2e/lib/llm-hallucination.js` — pdfjs spec text extract + wsNorm/tightNorm guard
- `tests/e2e/lib/llm-pricing.js` — pricing constants (stub; `total_cost_usd` is used directly)
- Partial `scripts/e2e-explore.mjs` — CI guard + `which claude` check + iteration scaffold (without harness invocation)
- `tests/e2e/lib/error-codes.js` — add `LLM_HALLUCINATED_SELECTION` + `LLM_API_ERROR`
- `.gitignore` — add `tests/e2e/.llm-spend-ledger.json`
- `package.json` — add `e2e:explore` script

**Plan 31-02 — Report writer + full driver wiring (Wave 1, parallel)**
- `tests/e2e/lib/llm-report.js` — append-only llm-report.json writer
- Complete `scripts/e2e-explore.mjs` — full iteration loop including harness invocation, verifier call, report write, ledger write

**Plan 31-03 — Vitest unit tests for all new modules (Wave 2, depends on 31-01 + 31-02)**
- `tests/unit/llm-ledger.test.js` — threshold tests (< $80, $80–$100, >= $100), monthly rollover, concurrent-safe read
- `tests/unit/llm-hallucination.test.js` — wsNorm match, tightNorm fallback, definite rejection
- `tests/unit/llm-report.test.js` — iteration append, summary recompute, partial-run cost
- `tests/unit/error-codes.test.js` — new codes in ERROR_CLASSES; existing by_error_class tallies unchanged
- CI guard integration test: `CI=true node scripts/e2e-explore.mjs` → exit 1

**Plan 31-04 — README.md (Wave 2, parallel with 31-03)**
- `tests/e2e/README.md` (~400 lines, 7 sections per CONTEXT.md)
- Include all `data-testid` attribute values (from Phase 26/27 harness)

---

## Project Constraints (from CLAUDE.md)

The only actionable directive in `CLAUDE.md` relevant to Phase 31:
- Answer verification pattern for `AskUserQuestion` calls (tooling concern, not Phase 31 implementation).

No restrictions on libraries, testing conventions, or coding patterns are stated in `CLAUDE.md` beyond this.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED live: claude -p --output-format json, 2026-05-15] — exact response shape, field names, cost field
- [VERIFIED live: chromium.launchPersistentContext from plain ESM script] — Playwright programmatic API
- [VERIFIED live: pdfjs-dist legacy getDocument, 2026-05-15] — text extraction timing, normalization behavior
- [VERIFIED: `tests/e2e/lib/pdf-verifier.js`] — CMAP_URL, STANDARD_FONT_DATA_URL paths, wsNorm/tightNorm pattern
- [VERIFIED: `tests/e2e/lib/report.js`] — append-only writer pattern for llm-report.js
- [VERIFIED: `tests/e2e/lib/error-codes.js`] — existing frozen-const taxonomy pattern
- [VERIFIED: `tests/e2e/lib/run-id.js`] — resolveRunId pattern
- [VERIFIED: `tests/e2e/lib/extension-loader.js`] — loadExtension return shape
- [VERIFIED: `package.json`] — installed dependency versions
- [VERIFIED: `scripts/select-cron-cases.mjs`] — getLiveCases() pattern

### Secondary (MEDIUM confidence)
- [CITED: claude --help, v2.1.139] — `--bare` auth behavior, `--system-prompt`, `--max-budget-usd`, `--output-format json`

### Tertiary (LOW confidence / Assumptions)
- [ASSUMED] Subscription exhaustion via Max 5 pool produces `is_error: true` with a recognizable subtype (A2 in Assumptions Log)

---

## Metadata

**Confidence breakdown:**
- `claude -p` JSON shape: HIGH — two live invocations verified in this session
- Playwright programmatic API: HIGH — live `launchPersistentContext` test succeeded
- pdfjs text extraction approach: HIGH — live 44-page test confirmed; normalization pitfall identified and documented
- Cost tracking via `total_cost_usd`: HIGH — field present in both test responses; formula reconstruction failed (expected), confirming direct-field use is correct
- Subscription exhaustion behavior: LOW — untestable without exhausting real pool

**Research date:** 2026-05-15
**Valid until:** 2026-08-15 (stable stack; `claude` CLI version may change with subscription behavior)

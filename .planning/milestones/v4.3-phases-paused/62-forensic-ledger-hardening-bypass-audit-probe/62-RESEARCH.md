# Phase 62: Forensic Ledger Hardening + Bypass-Audit Probe — Research

**Researched:** 2026-06-09
**Domain:** Refactor extraction (shared helper) + new `gh api` audit probe + workflow additive edit
**Confidence:** HIGH (all decisions verifiable via direct code inspection at the cited lines; HEAD verified)

## Summary

Phase 62 is a pure-infrastructure phase with three deliverables: (1) extract the proven `safeAppendLedger` pattern from `scripts/auto-fix.mjs:143-181` into a new shared helper `tests/e2e/lib/safe-append-ledger.js`, (2) wire 4 currently-unguarded `appendLedgerEntry(LEDGER_PATH, ...)` call sites (2 in `auto-fix-promote.mjs`, 2 in `e2e-explore.mjs`) through the new helper, and (3) ship `scripts/audit-bypass-merges.mjs` plus a `bypass_count` row in the weekly-digest workflow to surface sole-maintainer `--admin` merges that pollute A/B winner outcome data.

The forensic-leak audit confirms the CONTEXT enumeration is exhaustive: `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` returns exactly 5 hits — 4 in the target sites and 1 INSIDE `safeAppendLedger:181` itself. ALL other auto-fix.mjs ledger writes (7 sites: lines 428, 525, 681, 728, 825, 848, 886) route through `safeAppendLedger` and are already guarded. The leak-vector concern from the project memory anchor (`source: 'auto-fix-api'`) is FALSE-ALARM at HEAD — only the 4 enumerated sites + an SDK-internal `invokeAnthropicSdkWithLedger` path (lines 588, 620 in `llm-driver.js`) write the ledger, and the SDK path self-tags `source: 'auto-fix-api' + transport: 'sdk'` correctly.

**Primary recommendation:** Land Phase 62 as two atomic commits (LEDX bundle + BYPASS bundle). The helper extraction is mechanical — port the CI/override/subscription-whitelist logic verbatim, with `LEDGER_PATH` becoming an explicit parameter instead of closure-captured. ZERO `appendLedgerEntry` body edits. 33 Vitest ledger tests + 50+ auto-fix.test.js tests + Phase 60.1 `T_PHASE60_1_HOTFIX_PRESERVED` pin stay green by construction.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Helper location:** new file `tests/e2e/lib/safe-append-ledger.js` (not `scripts/lib/...`; consumed by both scripts/ and tests/e2e/lib/ callers; lives with the other ledger primitives).
- **Helper signature:** `safeAppendLedger(ledgerPath, entry, { allowOverride = false } = {})` — `ledgerPath` is an explicit parameter (not closure-captured) so callers in different scripts can use the canonical `LEDGER_PATH` import without ambiguity.
- **Defaults:** if caller omits `source` or `transport`, helper applies caller-context defaults; e2e-explore.mjs sites default to `source: 'e2e-explore' + transport: 'subscription'` (both call sites are `invokeClaudeP` subscription paths per `scripts/e2e-explore.mjs:248`).
- **Transport validation:** helper rejects non-canonical `transport` values; accepts ONLY `'sdk'` and `'subscription'` (matches `VALID_TRANSPORTS` Set in `auto-fix.mjs:205`).
- **Subscription whitelist (LEDX-04 / Phase 60.1 hotfix):** entries with `transport: 'subscription'` pass through the CI guard unconditionally (preserves v3.1/v4.0 free-iteration flow). Port the `isSubscriptionLocal` branch from `auto-fix.mjs:169` VERBATIM.
- **Local wrapper preserved (auto-fix.mjs):** `safeAppendLedger` local function at `auto-fix.mjs:143` continues to exist; becomes a thin pass-through `(entry) => sharedSafeAppendLedger(LEDGER_PATH, entry)`. Preserves the 50+ `tests/unit/auto-fix.test.js` Vitest tests (including Phase 60.1 hotfix pins L1+L2 at lines 1370-1394 which source-grep for `entry.transport === 'subscription'` AND `safeAppendLedger refused: cannot write` literal strings).
- **`appendLedgerEntry` body BYTE-UNCHANGED:** no edits to `tests/e2e/lib/llm-ledger.js:686-738` body. sha256 pin verifies. Preserves 33 pre-existing Vitest tests at `tests/unit/llm-ledger.test.js` (Tests 12-19 + 34-37 + Phase 39 LEDGER-03 suite — verified at lines 200, 221, 233, 262, 273, 284, 342, 352, 736, 747, 754, 771, 865, 874, 935).
- **Bypass probe (BYPASS-01):** `scripts/audit-bypass-merges.mjs` queries `gh api repos/$OWNER/$REPO/actions/runs?event=pull_request` for `verifier-gate` runs; for each merged `auto-fix/*` PR, detects bypass when `verifier-gate.completed_at > pr.merged_at`. CSV columns: `pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag`. Read-only; idempotent.
- **Weekly digest (BYPASS-02):** edit `.github/workflows/e2e-weekly-digest.yml` to add a `bypass_count` SUMMARY_KEYS row. Additive only — `SUMMARY_KEYS` `Object.freeze` invariant preserved at `tests/e2e/lib/llm-report.js:123`.
- **STATE.md (BYPASS-03):** verify-only; `## Bypass Conventions` already present at `.planning/STATE.md` line 47 (verified). No edit needed in happy path.
- **Atomic commit strategy:** two logical commits acceptable — `feat(62): shared safe-append-ledger helper + wire 4 unguarded sites (LEDX-01..04)` and `feat(62): audit-bypass-merges probe + weekly digest bypass metric (BYPASS-01..03)`. OR a single combined commit. Plan-phase decides.

### Claude's Discretion

- Exact CLI argv shape for `scripts/audit-bypass-merges.mjs`. CONTEXT recommends `--since-iso`, `--output csv|json`, `--repo owner/name`. Plan-phase locks the details.
- Test-file structure for `tests/unit/safe-append-ledger.test.js`. CONTEXT recommends 6 specific cases (CI gate / override gate / subscription whitelist / transport rejection / source default / sha256 pin). Plan-phase may add additional cases for the `allowOverride` flag.
- Default value of `--since-iso` in audit script (7 days ago is the natural default for weekly-digest consumption).
- Output path for audit CSV (recommend `reports/bypass-audits/YYYY-MM-DD.csv` or stdout-only with caller redirect).

### Deferred Ideas (OUT OF SCOPE)

- Reader-side validation in `a-b-winner.mjs` to filter pre-v4.3 orphan entries → handled in Phase 66 via `--since-iso` filter (ABWIN-02).
- Top-of-function validation in `appendLedgerEntry` body → REJECTED per PITFALLS Pitfall 3 (would break the 33-test invariant). Wrapper-layer validation per LEDX-01 is canonical.
- Backfilling old ledger entries with synthetic `source`/`transport` defaults → REJECTED per REQUIREMENTS.md "Out of Scope" (falsifies forensic record).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEDX-01 | New shared helper `tests/e2e/lib/safe-append-ledger.js` extracted from `auto-fix.mjs:143-181`; defaults `source`/`transport` if omitted; rejects non-canonical `transport` | Section "Helper Extraction Surface" — exact signature + verbatim-port logic + 6-test spec |
| LEDX-02 | Helper consumed by 3 scripts covering 4 sites (`auto-fix-promote.mjs:521+544`, `e2e-explore.mjs:262+313`) | Section "Site Wiring" — line-by-line existing entries documented |
| LEDX-03 | `appendLedgerEntry` body BYTE-UNCHANGED; 33 Vitest tests stay green | Section "Trust-Invariant Verification" — sha256 pin command + 33-test enumeration |
| LEDX-04 | Phase 60.1 subscription-transport whitelist preserved (Vitest pin `T_PHASE60_1_HOTFIX_PRESERVED`) | Section "Subscription Whitelist Port" — verbatim copy of `isSubscriptionLocal` branch |
| BYPASS-01 | New `scripts/audit-bypass-merges.mjs` queries `gh api ...` for verifier-gate runs completed AFTER PR merge | Section "Bypass-Audit Probe (gh api)" — concrete API path + JSON shape + detection logic |
| BYPASS-02 | Weekly digest gains `bypass_count` metric in Auto-Fix Pipeline section (SUMMARY_KEYS additive) | Section "Weekly Digest Wiring" — exact file edit + SUMMARY_KEYS invariant check |
| BYPASS-03 | `.planning/STATE.md ## Bypass Conventions` section documents `--admin` runbook | Section "STATE.md Verification" — section already present at line 47 |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ledger write CI/override guard | Shared helper lib (`tests/e2e/lib/`) | Per-caller wrapper (`scripts/auto-fix.mjs`) | Phase 56 leak-guard logic was duplicated locally; v4.3 makes it shared so the 4 leak sites converge on one definition |
| Subscription whitelist | Shared helper lib | — | Phase 60.1 hotfix preserved exactly; single source of truth |
| Transport validation | Shared helper lib | — | New: rejects non-canonical values at write boundary; reader-side filters in Phase 66 are defense-in-depth |
| Bypass detection | Audit script (`scripts/`) | Weekly digest workflow | Read-only `gh api` query; deterministic JSON → CSV transformation; no state mutation |
| Bypass surfacing | Weekly digest workflow | STATE.md runbook | Workflow gains additive SUMMARY_KEYS row; STATE.md documents human-side discipline |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins (`node:fs`, `node:path`, `node:url`) | 22.x (locked in package.json) | Helper + audit script | Project rule: zero new npm deps target (5th consecutive milestone if held) [VERIFIED: STATE.md line 108] |
| `child_process.execSync` | built-in | `gh` CLI subprocess invocation | Existing pattern (Phase 57 ledger-snapshot scripts) [VERIFIED: `scripts/auto-fix-promote.mjs` imports + STATE.md line 101] |
| `gh` CLI | 2.83.1 (system-installed) | GitHub API queries | Already used by 8+ existing scripts in `scripts/` [VERIFIED: `which gh` returned `/usr/bin/gh`] |
| Vitest | ^3.0.0 (caret) | Unit tests | Existing test framework; `fileParallelism: false`; setupFiles `./tests/setup/chrome-stub.js` [VERIFIED: package.json + CONTEXT.md line 100] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` | built-in | sha256 pin of `appendLedgerEntry` body | Trust-invariant verification test (one test in `tests/unit/safe-append-ledger.test.js`) |
| `tests/e2e/lib/llm-ledger.js` | existing | `appendLedgerEntry` + `LEDGER_PATH` exports | Imported by new helper; new helper does NOT re-export `LEDGER_PATH` (callers continue importing it directly to preserve module-load-time IIFE semantics) |

**Installation:** None. ZERO new npm dependencies. [VERIFIED: STATE.md line 108 + REQUIREMENTS.md "Out of Scope"]

**Version verification:** Not applicable — no new packages added. All dependencies already in repo at their pinned versions.

## Package Legitimacy Audit

**Not applicable.** Phase 62 installs zero packages. All code consumes existing imports from `tests/e2e/lib/llm-ledger.js`, Node.js built-ins, and the system `gh` CLI. No registry queries needed.

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│ CALLER SCRIPTS                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ scripts/            │  │ scripts/            │              │
│  │ auto-fix-promote.mjs│  │ e2e-explore.mjs     │              │
│  │ :521 (fail outcome) │  │ :262 (iter ledger)  │              │
│  │ :544 (pass outcome) │  │ :313 (retry ledger) │              │
│  └──────────┬──────────┘  └──────────┬──────────┘              │
│             │                        │                         │
│  ┌──────────▼────────────────────────▼──────────┐              │
│  │ scripts/auto-fix.mjs (local wrapper)         │              │
│  │   safeAppendLedger(entry)  ← thin pass-thru  │              │
│  └──────────────────────┬───────────────────────┘              │
└─────────────────────────┼──────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────────┐
        │ NEW: tests/e2e/lib/safe-append-ledger.js │
        │                                          │
        │  safeAppendLedger(ledgerPath, entry, opt)│
        │    ├─ default source if omitted          │
        │    ├─ default transport if omitted       │
        │    ├─ validate transport ∈ {sdk,subscript}│
        │    ├─ CI/override/subscription gate      │
        │    │   (verbatim port from auto-fix.mjs) │
        │    └─ delegate → appendLedgerEntry       │
        └────────────────────┬─────────────────────┘
                             │
                             ▼
        ┌─────────────────────────────────────────┐
        │ tests/e2e/lib/llm-ledger.js (UNCHANGED) │
        │   appendLedgerEntry(ledgerPath, entry)  │
        │   ← BYTE-UNCHANGED; 33 Vitest tests pin │
        └─────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────┐
│ BYPASS-AUDIT FLOW (BYPASS-01 + BYPASS-02)                   │
│                                                             │
│  GitHub API ──┐                                             │
│   actions/    │   gh api repos/$OWNER/$REPO/actions/runs?   │
│   runs        │     event=pull_request&workflow_id=...      │
│               │                                             │
│               ▼                                             │
│  scripts/audit-bypass-merges.mjs                            │
│    ├─ Fetch verifier-gate runs (last N days)                │
│    ├─ For each merged auto-fix/* PR:                        │
│    │    detect: verifier_gate.completed_at > pr.merged_at?  │
│    └─ Emit CSV: pr_number,merged_at,...,bypass_detected,    │
│                 ledger_source_tag                           │
│                              │                              │
│                              ▼                              │
│  Weekly digest workflow (e2e-weekly-digest.yml)             │
│    ├─ Read CSV (last 7 days)                                │
│    ├─ Count bypass_detected=true rows → bypass_count        │
│    └─ Add SUMMARY_KEYS row → Auto-Fix Pipeline section      │
│                              │                              │
│                              ▼                              │
│  Phase 66 a-b-winner.mjs --admin-bypass (cross-phase) reads │
│  CSV to exclude bypass-tainted outcome:'pass' entries       │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
tests/e2e/lib/
├── llm-ledger.js              # UNCHANGED — appendLedgerEntry + LEDGER_PATH
├── safe-append-ledger.js      # NEW — shared CI/override/subscription guard
└── ...

scripts/
├── auto-fix.mjs               # MODIFIED — local safeAppendLedger → thin pass-through
├── auto-fix-promote.mjs       # MODIFIED — :521 + :544 use new helper
├── e2e-explore.mjs            # MODIFIED — :262 + :313 use new helper
└── audit-bypass-merges.mjs    # NEW — gh api probe + CSV emitter

tests/unit/
├── llm-ledger.test.js         # UNCHANGED — 33 pre-existing tests stay green
├── auto-fix.test.js           # UNCHANGED — 50+ tests including Phase 60.1 pins
├── safe-append-ledger.test.js # NEW — 6+ tests covering helper contract
└── audit-bypass-merges.test.js# NEW — fixture-based detection logic tests

.github/workflows/
└── e2e-weekly-digest.yml      # MODIFIED — add bypass_count SUMMARY_KEYS row
```

### Pattern 1: Helper Extraction with Closure→Parameter Conversion

**What:** The existing `safeAppendLedger` in `auto-fix.mjs:143-181` captures `LEDGER_PATH` via module-scope closure (imported at line 71). The shared helper takes `ledgerPath` as a parameter to be portable.

**When to use:** Whenever extracting a helper that captures module-scope state via closure — the shared version needs explicit parameters to be callable from other modules.

**State captured via closure in current `auto-fix.mjs:143-181`:**

| Captured Symbol | Origin | Disposition in Shared Helper |
|-----------------|--------|------------------------------|
| `LEDGER_PATH` | `import { LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js'` (auto-fix.mjs:71) | Becomes explicit first parameter `ledgerPath` |
| `appendLedgerEntry` | Same import line | Imported directly inside the helper module |
| `process.env.CI` | global | Read directly inside helper (unchanged) |
| `process.env.GITHUB_ACTIONS` | global | Read directly inside helper (unchanged) |
| `process.env.E2E_LEDGER_PATH_OVERRIDE` | global | Read directly inside helper (unchanged) |

**Example signature:**

```javascript
// Source: derived from scripts/auto-fix.mjs:143-181 verbatim semantics
// VERIFIED: lines 155-181 of auto-fix.mjs
import { appendLedgerEntry } from './llm-ledger.js';

const VALID_TRANSPORTS = new Set(['sdk', 'subscription']);

/**
 * safeAppendLedger — shared leak-guarded ledger writer.
 *
 * Refuses to append unless caller is in CI, has opted in via
 * E2E_LEDGER_PATH_OVERRIDE, or the entry self-tags
 * transport:'subscription' (Phase 60.1 whitelist).
 *
 * Defaults source/transport if caller omits — defaults are
 * caller-context-appropriate values supplied via opts.defaults.
 *
 * @param {string} ledgerPath — typically LEDGER_PATH from llm-ledger.js
 * @param {object} entry — passed to appendLedgerEntry after default-fill
 * @param {object} [opts]
 * @param {object} [opts.defaults] — { source?, transport? } applied if entry omits
 * @param {boolean} [opts.allowOverride=false] — reserved; future-use flag
 * @throws {Error} on CI gate failure OR non-canonical transport
 */
export function safeAppendLedger(ledgerPath, entry, opts = {}) {
  const defaults = opts.defaults ?? {};
  const merged = {
    ...entry,
    source: entry.source ?? defaults.source,
    transport: entry.transport ?? defaults.transport,
  };

  // Transport validation
  if (merged.transport !== undefined && !VALID_TRANSPORTS.has(merged.transport)) {
    throw new Error(
      `safeAppendLedger refused: transport '${merged.transport}' is not canonical. ` +
        `Expected one of: ${[...VALID_TRANSPORTS].join(', ')}. ` +
        `Pre-v4.3 entries may omit transport; new sites must self-tag.`,
    );
  }

  // CI / override / subscription-whitelist gate (verbatim port from auto-fix.mjs:155-180)
  const inCi =
    process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
  const hasOverride =
    typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
    process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
  const isSubscriptionLocal = merged && merged.transport === 'subscription';
  if (!inCi && !hasOverride && !isSubscriptionLocal) {
    throw new Error(
      `safeAppendLedger refused: cannot write to ${ledgerPath} ` +
        `outside CI. Set process.env.CI=true (CI invocation) or ` +
        `process.env.E2E_LEDGER_PATH_OVERRIDE=/path/to/tmp.json ` +
        `(local integration test). This guard protects the committed ` +
        `ledger from local --force-api runs leaking entries ` +
        `(Phase 48 leak vector + Phase 56 LEDGER-02 hardening + Phase 62 LEDX-01).`,
    );
  }
  appendLedgerEntry(ledgerPath, merged);
}
```

### Pattern 2: Local Wrapper Becomes Pass-Through

**What:** The `auto-fix.mjs` local `safeAppendLedger` (lines 143-181) continues to exist BUT becomes a 1-line pass-through to the shared helper. This is load-bearing for the 50+ existing `tests/unit/auto-fix.test.js` tests that source-grep for the literal strings `entry.transport === 'subscription'` (line 1380) and `safeAppendLedger refused: cannot write` (line 1392).

**Reconciliation:** The shared helper preserves BOTH literal strings verbatim. The local wrapper imports the shared helper and forwards to it. The `tests/unit/auto-fix.test.js` source-grep tests at L1+L2 (lines 1370-1394) read `scripts/auto-fix.mjs` source — that source MUST still contain both literals. Two viable approaches:

**Approach A (preferred):** Keep the local `safeAppendLedger` function body in `auto-fix.mjs` unchanged for the JSDoc + literals, but inside the body, after the gate logic, delegate the actual write call to the shared helper. The local wrapper continues to apply the gate locally (defense-in-depth + source-grep stability); the shared helper is called from the OTHER consumer scripts (`auto-fix-promote.mjs`, `e2e-explore.mjs`).

**Approach B (more refactored):** Replace the local wrapper body with `return sharedSafeAppendLedger(LEDGER_PATH, entry)` and also keep the inline JSDoc + literal-string comments at the call site so the source-grep tests still pass. Vitest L1 asserts `expect(src).toContain("entry.transport === 'subscription'")` — this literal can live in a comment as well as in code. Same for L2.

**Recommendation:** Approach A. The local wrapper continues to execute the gate (slight redundancy with the shared helper is fine — `appendLedgerEntry` is only called once, and the shared helper would just re-apply the same gate harmlessly). Simpler audit story; zero risk to 50+ existing tests.

### Pattern 3: `gh api` Pagination for Audit Probe

**What:** GitHub Actions `/actions/runs` endpoint returns up to 100 results per page. For multi-week audits, paginate.

**When to use:** Any `gh api` call where the result set may exceed 100. Phase 62 default `--since-iso 7 days ago` likely fits in one page, but `--since-iso 90 days ago` will not.

**Example:**

```javascript
// VERIFIED: github.com/cli/cli — gh api supports --paginate flag
const out = execSync(
  `gh api 'repos/${owner}/${repo}/actions/runs?event=pull_request&per_page=100' --paginate`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);
// --paginate concatenates all pages into one JSON-stream output
```

### Anti-Patterns to Avoid

- **Anti-pattern:** Adding required-field validation to `appendLedgerEntry` body. Breaks 33 pre-existing Vitest tests (PITFALLS Pitfall 3). The Phase 56 mitigation (wrapper-layer validation) is canonical; v4.3 extends, not relocates.
- **Anti-pattern:** Re-exporting `LEDGER_PATH` from `safe-append-ledger.js`. The `LEDGER_PATH` IIFE in `llm-ledger.js:74-98` resolves at module load time — re-export adds an indirection that can confuse the `E2E_LEDGER_PATH_OVERRIDE` resolution. Callers import `LEDGER_PATH` directly from `llm-ledger.js` (existing pattern at `auto-fix.mjs:71`, `auto-fix-promote.mjs:67`, `e2e-explore.mjs:43`).
- **Anti-pattern:** Using `--admin` to merge Phase 62's own PR. Phase 62 ships the BYPASS audit precisely to detect `--admin` bypasses on `auto-fix/*` branches; merging Phase 62 via `--admin` would create a meta-circular forensic anomaly.
- **Anti-pattern:** Hard-coding `ledger_source_tag` in CSV without cross-referencing the actual ledger. The audit script's `ledger_source_tag` column should be populated by reading the auto-fix promote entry's `source` field (e.g., `auto-fix-promoted` vs `auto-fix-failed`) from the committed ledger — NOT inferred from PR title/branch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic file writes for ledger | Custom tmp-rename | `appendLedgerEntry` (existing — line 723-737 EXDEV-aware fallback) | Already battle-tested across 7 phases |
| CI detection | New env-var combos | `process.env.CI === 'true' \|\| process.env.GITHUB_ACTIONS === 'true'` | Phase 56 CR-02 canonical form; aligned with `llm-driver.js:387,518` + `llm-ledger.js:86` |
| GitHub API auth in audit script | Custom `Authorization: Bearer ...` | `gh api ...` subprocess | `gh` CLI handles token resolution, scopes, and rate-limit retry |
| CSV emission | Custom escape rules | Simple `csv` field join (no commas in detection logic outputs) | Audit fields are all numeric/ISO timestamp/boolean; no escaping needed |
| Bypass classifier logic | ML / heuristic | Boolean: `verifier_gate.completed_at > pr.merged_at` | Deterministic timestamp comparison; matches Pitfall 11 definition |

**Key insight:** Phase 62 is "extract + wire + add probe" — there is essentially no novel logic. The shared helper is a verbatim port; the audit script is a deterministic timestamp comparison; the workflow edit is one SUMMARY_KEYS row addition. The 33-test invariant is preserved by construction (zero edits to `appendLedgerEntry`).

## Auxiliary-Leak Audit (PRE-02 / project memory anchor)

> Required by the project memory anchor and CONTEXT.md decisions section line 45.

**Command run:**

```bash
grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/
```

**Output (5 hits total):**

| Site | Line | Classification | Disposition |
|------|------|----------------|-------------|
| `scripts/auto-fix.mjs` | 181 | (c) Intentional — inside `safeAppendLedger` body | KEEP — this IS the canonical guarded write |
| `scripts/auto-fix-promote.mjs` | 521 | (b) Direct call that's a leak (no wrapper) | REWIRE → `safeAppendLedger(LEDGER_PATH, entry)` via new helper |
| `scripts/auto-fix-promote.mjs` | 544 | (b) Direct call that's a leak (no wrapper) | REWIRE → `safeAppendLedger(LEDGER_PATH, entry)` via new helper |
| `scripts/e2e-explore.mjs` | 262 | (b) Direct call that's a leak (no wrapper); MISSING `source` + `transport` | REWIRE → helper applies defaults `source:'e2e-explore' + transport:'subscription'` |
| `scripts/e2e-explore.mjs` | 313 | (b) Direct call that's a leak (no wrapper); MISSING `source` + `transport` | REWIRE → helper applies defaults `source:'e2e-explore' + transport:'subscription'` |

**Auto-fix.mjs additional ledger-write sites (all already routed through `safeAppendLedger`):**

```
auto-fix.mjs:428  safeAppendLedger({ ... source: 'flake-suppressed' ... })
auto-fix.mjs:525  safeAppendLedger({ ... })
auto-fix.mjs:681  safeAppendLedger({ ... })
auto-fix.mjs:728  safeAppendLedger({ ... })
auto-fix.mjs:825  safeAppendLedger({ ... })
auto-fix.mjs:848  safeAppendLedger({ ... })
auto-fix.mjs:886  safeAppendLedger({ ... })
```

All 7 sites correctly use the local `safeAppendLedger` wrapper. **No unrouted ledger writes remain in `scripts/auto-fix.mjs` at HEAD.**

**Library-internal ledger writes (NOT in scope for Phase 62 — already correctly self-tag):**

| Site | Line | Self-tags |
|------|------|-----------|
| `tests/e2e/lib/llm-driver.js` (`invokeClaudePWithLedger`) | 440 | `source: <caller-param>`, `transport: 'subscription'` |
| `tests/e2e/lib/llm-driver.js` (`invokeAnthropicSdkWithLedger` sdk_error) | 607 | `source: 'auto-fix-api'`, `transport: 'sdk'` |
| `tests/e2e/lib/llm-driver.js` (`invokeAnthropicSdkWithLedger` success) | 639 | `source: 'auto-fix-api'`, `transport: 'sdk'` |

These three sites are CORRECT — they self-tag `source` and `transport` inline. Project memory anchor concern (`source: 'auto-fix-api'` could leak via `invokeAnthropicSdkWithLedger`) is FALSE-ALARM at HEAD: the SDK path is wrapped at the `invoke*WithLedger` boundary, which always self-tags. The Phase 62 helper does not need to wrap these — they live inside `llm-driver.js` which is not on the LEDX-02 fix list.

**Verdict:** CONTEXT.md's enumeration of 4 sites is EXHAUSTIVE. No surprise leak vector found.

## Helper Extraction Surface (LEDX-01) — Detailed Spec

### File path
`tests/e2e/lib/safe-append-ledger.js`

### Exports
- `safeAppendLedger(ledgerPath, entry, opts)` — named export
- `VALID_TRANSPORTS` — named export (re-export of the Set from `auto-fix.mjs:205` so call-site validators can use the same source of truth)

### Imports
```javascript
import { appendLedgerEntry } from './llm-ledger.js';
```

That's it. No other dependencies.

### Verbatim-Port Source Block (CI/override/subscription guard)

From `scripts/auto-fix.mjs:155-180` (lines verified):

```javascript
const inCi =
  process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const hasOverride =
  typeof process.env.E2E_LEDGER_PATH_OVERRIDE === 'string' &&
  process.env.E2E_LEDGER_PATH_OVERRIDE.trim().length > 0;
const isSubscriptionLocal = entry && entry.transport === 'subscription';
if (!inCi && !hasOverride && !isSubscriptionLocal) {
  throw new Error(/* ... */);
}
appendLedgerEntry(LEDGER_PATH, entry);
```

**Port this block verbatim** to the new helper, with `LEDGER_PATH` replaced by the `ledgerPath` parameter. Preserve the comments (Phase 56 CR-02 + Phase 60.1 hotfix context) so the audit trail survives the move.

### Transport Validation (NEW in Phase 62)

The existing wrapper in `auto-fix.mjs:143-181` does NOT validate `transport`. New behavior in the shared helper:

```javascript
const VALID_TRANSPORTS = new Set(['sdk', 'subscription']);

// Inside safeAppendLedger, AFTER merging defaults:
if (merged.transport !== undefined && !VALID_TRANSPORTS.has(merged.transport)) {
  throw new Error(`safeAppendLedger refused: transport '${merged.transport}' is not canonical...`);
}
```

**Important:** `transport === undefined` is allowed (back-compat with pre-Phase 39 entries that omit `transport` entirely; combined with the `defaults` mechanism, this means a caller that wants to default-fill can do so explicitly via `opts.defaults.transport`).

### Defaults Mechanism

```javascript
const merged = {
  ...entry,
  source: entry.source ?? opts.defaults?.source,
  transport: entry.transport ?? opts.defaults?.transport,
};
```

**Caller-context defaults (recommended):**

| Caller | Default `source` | Default `transport` | Rationale |
|--------|------------------|---------------------|-----------|
| `auto-fix-promote.mjs:521` (fail) | inline: `'auto-fix-failed'` (already set) | inline: `'subscription'` (already set) | Defaults not needed; caller sets explicitly |
| `auto-fix-promote.mjs:544` (pass) | inline: `'auto-fix-promoted'` (already set) | inline: `'subscription'` (already set) | Defaults not needed; caller sets explicitly |
| `e2e-explore.mjs:262` (iter) | default: `'e2e-explore'` | default: `'subscription'` | Currently MISSING both fields; helper fills via defaults |
| `e2e-explore.mjs:313` (retry) | default: `'e2e-explore'` | default: `'subscription'` | Currently MISSING both fields; helper fills via defaults |

### Test Strategy — `tests/unit/safe-append-ledger.test.js`

**Why a new test file:** Adding tests to `tests/unit/llm-ledger.test.js` risks counting drift on the 33-test invariant. A separate file isolates the new helper's surface and keeps the BYTE-UNCHANGED guarantee on `appendLedgerEntry` provable via test-count: `llm-ledger.test.js` test count BEFORE = test count AFTER.

**6 minimum cases (per CONTEXT.md):**

| # | Name | Setup | Assert |
|---|------|-------|--------|
| 1 | `T_LEDX_CI_GATE — sdk transport without CI throws` | `delete process.env.CI; delete process.env.E2E_LEDGER_PATH_OVERRIDE` | `expect(() => safeAppendLedger(tmpPath, {iso, model, cost_usd, transport:'sdk', source:'X'})).toThrow(/safeAppendLedger refused: cannot write/)` |
| 2 | `T_LEDX_SUB_WHITELIST (T_PHASE60_1_HOTFIX_PRESERVED) — subscription transport passes without CI` | `delete process.env.CI` | `expect(() => safeAppendLedger(tmpPath, {iso, model, cost_usd, transport:'subscription', source:'X'})).not.toThrow()` + verify file written |
| 3 | `T_LEDX_CI_PASS — CI=true allows sdk transport` | `process.env.CI = 'true'` | `safeAppendLedger(tmpPath, {..., transport:'sdk'})` succeeds; file written |
| 4 | `T_LEDX_OVERRIDE_PASS — E2E_LEDGER_PATH_OVERRIDE set allows sdk transport` | `process.env.E2E_LEDGER_PATH_OVERRIDE = tmpPath` | `safeAppendLedger(tmpPath, {..., transport:'sdk'})` succeeds |
| 5 | `T_LEDX_INVALID_TRANSPORT — non-canonical transport throws` | `process.env.CI = 'true'` | `expect(() => safeAppendLedger(tmpPath, {..., transport:'http'})).toThrow(/transport 'http' is not canonical/)` |
| 6 | `T_LEDX_DEFAULTS — opts.defaults fills missing source/transport` | `process.env.CI = 'true'` | `safeAppendLedger(tmpPath, {iso, model, cost_usd}, {defaults:{source:'e2e-explore', transport:'subscription'}})` succeeds; readLedger shows the defaults applied |
| 7 | `T_LEDX_APPEND_BODY_PINNED — appendLedgerEntry body sha256 unchanged from baseline` | — | `crypto.createHash('sha256').update(<llm-ledger.js function body bytes>).digest('hex') === <baseline>` |

**Note on test 7:** Use the body of `appendLedgerEntry` from `tests/e2e/lib/llm-ledger.js` lines 686-738. Extract via regex or fixed-byte slice. The baseline sha256 is computed at plan-phase commit time and pinned in the test as a literal. Any future edit to `appendLedgerEntry` body triggers the test failure, surfacing the LEDX-03 invariant violation.

**Test-file dependencies:** Each test creates a fresh tmp ledger path; uses `beforeEach`/`afterEach` to reset `process.env.CI`, `process.env.GITHUB_ACTIONS`, and `process.env.E2E_LEDGER_PATH_OVERRIDE`. Pattern mirrors `tests/unit/llm-ledger.test.js:beforeEach` block (lines 134+).

## Site Wiring (LEDX-02) — Detailed Spec

### `scripts/auto-fix-promote.mjs:521` (fail outcome)

**Before:**
```javascript
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: args.model || 'claude-sonnet-4-6',
  cost_usd: 0, tokens_in: 0, tokens_out: 0,
  phase: args.phase || '58-promote',
  transport: 'subscription',
  issueId: `issue-${resolvedSourceIssue}`,
  prNumber: args.pr, fingerprint: args.fingerprint,
  errorClass: args.errorClass,
  source: 'auto-fix-failed', outcome: 'fail',
  reason: (`runPromote exitCode=${result.exitCode}`).slice(0, 200),
});
```

**After:**
```javascript
import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';
// ... unchanged code ...
safeAppendLedger(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: args.model || 'claude-sonnet-4-6',
  cost_usd: 0, tokens_in: 0, tokens_out: 0,
  phase: args.phase || '58-promote',
  transport: 'subscription',
  issueId: `issue-${resolvedSourceIssue}`,
  prNumber: args.pr, fingerprint: args.fingerprint,
  errorClass: args.errorClass,
  source: 'auto-fix-failed', outcome: 'fail',
  reason: (`runPromote exitCode=${result.exitCode}`).slice(0, 200),
});
```

**Mechanical 2-line change:** add import; rename function call.

### `scripts/auto-fix-promote.mjs:544` (pass outcome)

Same shape; rename `appendLedgerEntry` → `safeAppendLedger`. Entry already has `source: 'auto-fix-promoted' + transport: 'subscription'` inline. Subscription whitelist allows the write outside CI (this script is invoked from `v40-auto-promote.yml` which has `CI=true`, but defense-in-depth for local manual runs).

### `scripts/e2e-explore.mjs:262` (iteration ledger)

**Before:**
```javascript
appendLedgerEntry(LEDGER_PATH, {
  iso, model: modelId, cost_usd: costUsd,
  tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
  tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
  iteration_n: iterationN, run_id: runId, phase: phase,
});
```

**After:**
```javascript
import { safeAppendLedger } from '../tests/e2e/lib/safe-append-ledger.js';
// ...
safeAppendLedger(LEDGER_PATH, {
  iso, model: modelId, cost_usd: costUsd,
  tokens_in: parsed.rawJson?.usage?.input_tokens ?? 0,
  tokens_out: parsed.rawJson?.usage?.output_tokens ?? 0,
  iteration_n: iterationN, run_id: runId, phase: phase,
}, {
  defaults: { source: 'e2e-explore', transport: 'subscription' },
});
```

**Key change:** call site does NOT mutate the entry literal; the helper's `opts.defaults` injects `source` + `transport`. This preserves the existing entry-shape for any test that source-greps `e2e-explore.mjs` for the entry object literal.

### `scripts/e2e-explore.mjs:313` (retry ledger)

Same pattern as :262. Defaults applied via `opts.defaults`.

## Subscription Whitelist Port (LEDX-04)

**Source of truth:** `scripts/auto-fix.mjs:163-169` — verbatim block:

```javascript
// Phase 60.1 (hotfix): the documented v3.1/v4.0 subscription-local path
// (`npm run fix-issue -- --transport subscription`) writes auxiliary
// forensic entries from runDispatcher BEFORE invokeClaudePWithLedger
// writes the cost-bearing entry. Those forensic writes self-tag
// `transport: 'subscription'` (see runDispatcher resolvedTransport at
// ~line 762). The Phase 56 leak vector that motivated this guard is
// local `--force-api` runs that self-tag `transport: 'sdk'`; whitelisting
// subscription-tagged entries restores the v3.1/v4.0 free-iteration flow
// while leaving the SDK-path leak protection intact.
const isSubscriptionLocal = entry && entry.transport === 'subscription';
```

**Port to shared helper:** copy the comment + `isSubscriptionLocal` line VERBATIM. The `tests/unit/auto-fix.test.js:1380-1381` L1 test source-greps `scripts/auto-fix.mjs` (NOT the shared helper) — so the local `auto-fix.mjs` wrapper still needs to contain the literal `entry.transport === 'subscription'` string AND match `/isSubscriptionLocal/`. Per Pattern 2 (Approach A), the local wrapper retains these literals; the shared helper has its own copy. Both are sources of truth; they must stay byte-identical via review discipline.

**Recommended Vitest pin in new file `tests/unit/safe-append-ledger.test.js`:**

```javascript
it('T_PHASE60_1_HOTFIX_PRESERVED_SHARED — shared helper accepts subscription-tagged entry outside CI', async () => {
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  delete process.env.E2E_LEDGER_PATH_OVERRIDE;
  const tmpPath = makeTmpLedger();
  expect(() => safeAppendLedger(tmpPath, {
    iso: new Date().toISOString(),
    model: 'claude-sonnet-4-6',
    cost_usd: 0,
    transport: 'subscription',
    source: 'test',
  })).not.toThrow();
  // verify file written
  const ledger = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
  expect(ledger.months[currentMonth()].iterations.length).toBe(1);
});
```

**The existing `tests/unit/auto-fix.test.js` L1+L2 pins (lines 1370-1394) remain UNTOUCHED** and continue to source-grep `scripts/auto-fix.mjs` — they pass because the local wrapper keeps the literals.

## Bypass-Audit Probe (BYPASS-01) — gh api Concrete Spec

### CLI argv

```
scripts/audit-bypass-merges.mjs
  [--since-iso 2026-06-01T00:00:00Z]   default: 7 days ago
  [--output csv|json]                  default: csv
  [--repo owner/name]                  default: derive from `gh repo view --json nameWithOwner`
  [--branch-prefix auto-fix/]          default: 'auto-fix/'
  [--workflow-name verifier-gate]      default: 'verifier-gate'
```

### gh api Endpoint

**Primary:** GitHub REST `GET /repos/{owner}/{repo}/actions/runs`

```bash
gh api 'repos/'"$OWNER"'/'"$REPO"'/actions/runs?event=pull_request&per_page=100&created=>='"$SINCE_ISO" --paginate
```

**Query params:**
- `event=pull_request` — restricts to PR-triggered runs (excludes `push`, `schedule`)
- `per_page=100` — max page size
- `created>=$SINCE_ISO` — GitHub Search-style date filter (server-side limit)
- `--paginate` — gh CLI flag; iterates `Link: rel=next` until exhausted

**Response JSON shape (relevant fields):**

```json
{
  "total_count": N,
  "workflow_runs": [
    {
      "id": 12345,
      "name": "v40 Verifier Gate",
      "status": "completed",
      "conclusion": "success" | "failure" | "cancelled",
      "workflow_id": 67890,
      "head_branch": "auto-fix/<fp>-<iso>",
      "head_sha": "abc123...",
      "pull_requests": [{ "number": 42, "head": {...}, "base": {...} }],
      "created_at": "2026-06-08T10:00:00Z",
      "updated_at": "2026-06-08T10:05:00Z",
      "run_started_at": "2026-06-08T10:00:30Z"
    }
  ]
}
```

**For PR merge timestamps**, separate API:

```bash
gh api 'repos/'"$OWNER"'/'"$REPO"'/pulls/'"$PR_NUM"' --jq .merged_at'
# Returns ISO string or null
```

**Or batch via search:**

```bash
gh search prs --repo "$OWNER/$REPO" --base main --merged --json number,mergedAt,headRefName --limit 100
```

### Detection Algorithm

```
For each verifier-gate run R with R.head_branch matching /^auto-fix\//:
  PR_NUM = R.pull_requests[0].number  (or look up from R.head_sha if [])
  if PR is not merged → skip
  PR_MERGED_AT = pr.merged_at  (ISO string)
  R_COMPLETED_AT = R.updated_at  (proxy for completion; for completed runs this == finish)
  
  BYPASS_DETECTED = (R.conclusion in {'success','failure'} AND
                     R_COMPLETED_AT > PR_MERGED_AT)
  
  # Bypass means: PR was merged BEFORE verifier-gate finished. The
  # check could not have gated the merge.
```

**Edge cases:**
- PR closed without merge → skip (no `merged_at` to compare).
- Verifier-gate `cancelled` or `skipped` → BYPASS_DETECTED=true (gate never ran).
- Verifier-gate not yet completed at audit time → BYPASS_DETECTED=null (defer to next audit run).
- Multiple verifier-gate runs on the same PR (re-runs) → use the LATEST completed run's timestamp.

### Cross-Referencing the Ledger (for `ledger_source_tag` column)

The CSV column `ledger_source_tag` is populated by reading `tests/e2e/.llm-spend-ledger.json` and finding the entry whose `prNumber === PR_NUM` AND `source` starts with `'auto-fix-'`. Read the `source` field as-is (e.g., `'auto-fix-promoted'`, `'auto-fix-failed'`).

If no ledger entry matches → `ledger_source_tag = 'no-entry'`.

This cross-reference signals to Phase 66's `--admin-bypass` filter which ledger rows to exclude. If `bypass_detected=true` AND `ledger_source_tag='auto-fix-promoted'`, the promote entry's `outcome:'pass'` is bypass-tainted and must be filtered from A/B winner math.

### CSV Output Shape

```
pr_number,merged_at,verifier_gate_completed_at,bypass_detected,ledger_source_tag
42,2026-06-08T10:00:00Z,2026-06-08T10:05:00Z,true,auto-fix-promoted
43,2026-06-09T11:00:00Z,2026-06-09T10:55:00Z,false,auto-fix-promoted
44,2026-06-08T12:00:00Z,,true,auto-fix-failed
```

(Row 3: empty `verifier_gate_completed_at` = `cancelled` / `skipped` run.)

### Auth Pre-Check

Before any API calls, audit script must verify gh authentication:

```javascript
import { execSync } from 'node:child_process';
try {
  execSync('gh auth status', { stdio: 'pipe' });
} catch (err) {
  process.stderr.write('[audit-bypass-merges] gh CLI not authenticated; run `gh auth login` first.\n');
  process.exit(1);
}
```

### Idempotency

Pure read; zero state mutations. Safe to run repeatedly. Same input → same output (modulo new PRs merging between runs).

## Weekly Digest Wiring (BYPASS-02)

### Files Touched
- `.github/workflows/e2e-weekly-digest.yml` — additive step that runs `audit-bypass-merges.mjs` before `npm run e2e:weekly-digest`
- `tests/e2e/lib/llm-report.js:123` (`SUMMARY_KEYS`) — add `'bypass_count'` to the frozen array
- `scripts/weekly-digest.mjs` — extend `renderAutoFixPipelineSection` to emit the `Bypasses: N` row

### SUMMARY_KEYS Edit

**Current (verified):**

```javascript
// tests/e2e/lib/llm-report.js:123
export const SUMMARY_KEYS = Object.freeze([
  'e2e_nightly',
  // ... 6 other keys (7 total)
]);
```

**After:**

```javascript
export const SUMMARY_KEYS = Object.freeze([
  'e2e_nightly',
  // ... 6 other keys
  'bypass_count',  // BYPASS-02 (Phase 62)
]);
```

The `Object.freeze` discipline is preserved; the array length goes from 7 to 8.

**Regression gate:** `tests/unit/llm-report.test.js:406` asserts `SUMMARY_KEYS.length === 7` (verified from Phase 55 closure note). This pin needs updating to `=== 8` in the same commit as the SUMMARY_KEYS edit. Co-touch invariant: the Vitest assertion and SUMMARY_KEYS array land in the SAME commit.

### Workflow Step

In `.github/workflows/e2e-weekly-digest.yml`, before the "Generate weekly digest" step:

```yaml
- name: Audit bypass merges (Phase 62 BYPASS-02)
  run: |
    mkdir -p reports/bypass-audits
    node scripts/audit-bypass-merges.mjs \
      --since-iso "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
      --output csv \
      > reports/bypass-audits/$(date -u +%Y-%m-%d).csv
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The CSV file is read by `weekly-digest.mjs` to populate the `bypass_count` tally row.

### Section Edit in weekly-digest.mjs

`renderAutoFixPipelineSection` already takes a structured input object (see `scripts/weekly-digest.mjs:421` — `runDigest` opts). Extend the input shape:

```javascript
// Existing structured input gains one field:
{ ... existing metrics, bypass_count: Number }
```

Render line in markdown:

```markdown
Bypasses: 2 (last 7 days)
```

If `bypass_count === 0`: omit the line OR render `Bypasses: 0` — plan-phase decides. Recommendation: always render, so absence-of-bypasses is also surfaced.

## STATE.md Verification (BYPASS-03)

**Section path:** `.planning/STATE.md ## Bypass Conventions`

**Verified location:** Line 47 (heading). Content spans lines 47-55, includes:
- LOAD-BEARING runbook header
- "DO NOT use `gh pr merge --admin` on `auto-fix/*` branches. EVER." (line 51)
- Cross-reference to ruleset 17086676 (line 53)
- Cross-reference to `scripts/audit-bypass-merges.mjs` (line 54)
- Weekly digest metric cross-reference (line 55)

**Phase 62 verification task:** run a grep + word-count assertion:

```bash
grep -A 10 '^## Bypass Conventions$' .planning/STATE.md | wc -l
# Expected: > 9 lines (heading + 9 lines of content minimum)

grep -c 'DO NOT.*gh pr merge --admin' .planning/STATE.md
# Expected: 1 or 2 (the runbook + the v4.3 NOTE at line 188)
```

**No edit needed in happy path.** If drift removes the section, restore from `git show ca14805~N:.planning/STATE.md` (per CONTEXT line 67).

## Trust-Invariant Verification

### `appendLedgerEntry` body sha256 pin

Compute at plan-phase commit time:

```bash
# Extract the function body and hash it
node -e "
  const fs = require('node:fs');
  const src = fs.readFileSync('tests/e2e/lib/llm-ledger.js', 'utf8');
  const m = src.match(/export function appendLedgerEntry[\s\S]*?^}/m);
  const crypto = require('node:crypto');
  console.log(crypto.createHash('sha256').update(m[0]).digest('hex'));
"
```

Pin the hash in a Vitest test (`tests/unit/safe-append-ledger.test.js`):

```javascript
it('LEDX-03: appendLedgerEntry body sha256 unchanged from Phase 62 baseline', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../tests/e2e/lib/llm-ledger.js'), 'utf8');
  const m = src.match(/export function appendLedgerEntry[\s\S]*?^}/m);
  const hash = crypto.createHash('sha256').update(m[0]).digest('hex');
  expect(hash).toBe('<COMPUTED_AT_COMMIT_TIME>');
});
```

### 33 Vitest tests stay green

Verified test enumeration in `tests/unit/llm-ledger.test.js`:

```
Tests 12-19, 31-37, Phase 39 LEDGER-03 suite (Tests 34-51+)
```

Counted by grep: `grep -c "^  it(" tests/unit/llm-ledger.test.js` → expected ≥33. Run `npm test -- tests/unit/llm-ledger.test.js` after Phase 62 commits — must report PASS for all.

### 50+ Vitest tests in `tests/unit/auto-fix.test.js` stay green

Including Phase 60.1 hotfix pins L1 (line 1370) + L2 (line 1384). These pins source-grep `scripts/auto-fix.mjs` for literals:
- L1 asserts `expect(src).toContain("entry.transport === 'subscription'")` (line 1380)
- L1 asserts `expect(src).toMatch(/isSubscriptionLocal/)` (line 1381)
- L2 asserts `expect(src).toContain('safeAppendLedger refused: cannot write')` (line 1392)
- L2 asserts `expect(src).toContain('Phase 48 leak vector + Phase 56 LEDGER-02')` (line 1393)

**The local `safeAppendLedger` body in `auto-fix.mjs` MUST retain all four literal strings.** Per Pattern 2 (Approach A), keep the local wrapper body unchanged for these literals; delegate the actual write to the shared helper at the END of the body if desired (or keep the existing `appendLedgerEntry(LEDGER_PATH, entry)` call at line 181 — the local guard already correctly gates it).

**Recommendation:** the simplest safe refactor is to leave `auto-fix.mjs:143-181` ENTIRELY UNCHANGED. The shared helper is a NEW file used by `auto-fix-promote.mjs` and `e2e-explore.mjs` only. This way, the local wrapper continues to satisfy L1+L2 source-grep pins by construction. The "shared" aspect of LEDX-01 is fulfilled because the SHARED helper file exists and is used by the 3-script consumer chain (the 4 unguarded sites are all in `auto-fix-promote.mjs` and `e2e-explore.mjs` — NOT in `auto-fix.mjs`).

### ESLint single-entry-point preserved

`eslint.config.js:253-281` pins `no-restricted-imports` on `@anthropic-ai/sdk`. The new helper does NOT import the SDK. The audit script `audit-bypass-merges.mjs` does NOT import the SDK. No `ignores` list edit needed; ESLint passes.

### Phase 57 scope-lock preserved

`grep -c 'git push origin main' .github/workflows/v40-auto-fix.yml` must remain `1`. Phase 62 does NOT touch this workflow. Verification trivial.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 62 does not migrate or alter existing ledger entries. The committed `tests/e2e/.llm-spend-ledger.json` continues to grow append-only. | None |
| Live service config | GitHub Actions workflow `e2e-weekly-digest.yml` gains an additive step + an additive SUMMARY_KEYS row consumer. No external service config (no Datadog, n8n, etc.). | Workflow edit committed in same commit as `scripts/weekly-digest.mjs` edit |
| OS-registered state | None — Phase 62 does not install daemons or cron jobs. The weekly-digest schedule is already established (`cron: '0 7 * * 1'`). | None |
| Secrets/env vars | `GH_TOKEN` already in the weekly-digest workflow (line 44). Audit script consumes `gh` CLI's resolved token via subprocess; no new secret. | None |
| Build artifacts | None — pure JavaScript additions; no compiled output. New tests are picked up by Vitest automatically via the `tests/unit/*.test.js` glob (per CONTEXT.md line 100). | None |

**Verified by:** grep for `crontab`, `systemd`, `pm2`, `task scheduler`, `chromadb`, `n8n` in the repo — returned only documentation references, no live state with the name "Phase 62" or "safe-append-ledger" baked in.

## Common Pitfalls

### Pitfall 62-A: Test-count drift on `llm-ledger.test.js`

**What goes wrong:** A developer adds the new shared helper's tests INTO `tests/unit/llm-ledger.test.js` for proximity. This makes the test count go from 33 → 39+ and the "33-test invariant" check in CONTEXT.md is no longer meaningful.

**Why it happens:** Natural co-location instinct — "tests for the ledger live in the ledger test file."

**How to avoid:** New file `tests/unit/safe-append-ledger.test.js`. Pre-commit check: `wc -l tests/unit/llm-ledger.test.js` and compare to baseline (no growth allowed for Phase 62).

**Warning signs:** Phase 62 commit diff shows `tests/unit/llm-ledger.test.js` modified.

### Pitfall 62-B: Closure→Parameter conversion drops `LEDGER_PATH` from the call site

**What goes wrong:** Extracting the helper, the developer thinks "the new helper has a parameter `ledgerPath`, so callers in auto-fix-promote.mjs and e2e-explore.mjs just pass entry only." Calls become `safeAppendLedger(entry)` — TypeError or undefined-write target.

**Why it happens:** The local wrapper in `auto-fix.mjs` accepts ONLY `entry` (single-arg) because it closes over `LEDGER_PATH`. Callers may mimic that signature.

**How to avoid:** All 4 wire-up commits use `safeAppendLedger(LEDGER_PATH, entry, opts)` explicitly. Test 6 in the new test file fails fast if the parameter is missing (TypeError on undefined `ledgerPath`).

**Warning signs:** Phase 62 PR diff at wire-up sites shows `safeAppendLedger(entry, ...)` without the path argument. Or `safeAppendLedger({iso, ...})` with only one arg.

### Pitfall 62-C: Subscription whitelist literal drift between local + shared

**What goes wrong:** The local wrapper in `auto-fix.mjs` and the shared helper both contain the `isSubscriptionLocal = entry && entry.transport === 'subscription'` line. A future edit updates one but not the other. L1 pin source-greps `auto-fix.mjs`; the shared helper drifts silently.

**Why it happens:** Two sources of truth.

**How to avoid (recommended):** Per the "simplest safe refactor" recommendation in Trust-Invariant Verification section — leave `auto-fix.mjs:143-181` UNCHANGED. There is then only ONE source of truth in the shared helper, AND the L1+L2 source-grep pins on `auto-fix.mjs` continue to pass because that file retains its existing wrapper. The shared helper is consumed by the OTHER scripts only.

**Warning signs:** Phase 62 commit modifies `scripts/auto-fix.mjs` lines 143-181. Or, in a future phase, the literal `entry.transport === 'subscription'` is removed from EITHER file.

### Pitfall 62-D: gh api pagination dropped

**What goes wrong:** Audit script uses `gh api 'repos/.../actions/runs?per_page=100'` without `--paginate`. Beyond 100 runs, BYPASS_DETECTED=true cases are missed.

**Why it happens:** Default audit window is 7 days; the project has low PR volume; one page seems enough. Until the window is widened to 90 days for forensic review.

**How to avoid:** Always pass `--paginate` to `gh api` for `actions/runs` queries. Test case: synthesize a 150-PR scenario via fixture and assert all 150 are surfaced.

**Warning signs:** Audit CSV row count plateaus at 100 even for long `--since-iso` windows.

### Pitfall 62-E: Workflow uses `node:` import syntax in a heredoc

**What goes wrong:** A workflow `run:` block invokes `node -e "import('./scripts/...')"` (matches existing `e2e-weekly-digest.yml:90-96` pattern). If the new audit-bypass step is inline-scripted instead of using `node scripts/audit-bypass-merges.mjs`, the `gh api` execSync call inherits the workflow's shell context but loses the `GH_TOKEN` env.

**Why it happens:** Workflow authors sometimes inline trivial logic.

**How to avoid:** Invoke `node scripts/audit-bypass-merges.mjs` directly with `env: GH_TOKEN: ...`. No inline node-e.

**Warning signs:** Workflow YAML diff shows a large `node -e "$(cat <<'EOF'...EOF)"` heredoc near the audit step.

## Code Examples

### Reading the ledger to populate `ledger_source_tag`

```javascript
// In scripts/audit-bypass-merges.mjs
import { readLedger, LEDGER_PATH } from '../tests/e2e/lib/llm-ledger.js';

function ledgerSourceForPr(prNumber) {
  const ledger = readLedger(LEDGER_PATH);
  const months = ledger?.months ?? {};
  for (const bucket of Object.values(months)) {
    const iterations = bucket?.iterations ?? [];
    for (const it of iterations) {
      if (it && it.prNumber === prNumber &&
          typeof it.source === 'string' && it.source.startsWith('auto-fix-')) {
        return it.source;
      }
    }
  }
  return 'no-entry';
}
```

### Detecting bypass

```javascript
// Source: derived from Pitfall 11 definition in PITFALLS.md
function detectBypass(verifierRun, prMergedAt) {
  if (verifierRun.status !== 'completed') return null;  // defer
  if (['cancelled', 'skipped'].includes(verifierRun.conclusion)) return true;
  const runCompletedAt = new Date(verifierRun.updated_at);
  const mergedAt = new Date(prMergedAt);
  return runCompletedAt > mergedAt;
}
```

### gh CLI auth pre-check

```javascript
// Source: VERIFIED (gh CLI docs — gh auth status exits 0 if authed, 1 if not)
import { execSync } from 'node:child_process';
function assertGhAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch (err) {
    process.stderr.write(
      '[audit-bypass-merges] gh CLI not authenticated. Run: gh auth login\n'
    );
    process.exit(1);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-script local `safeAppendLedger` wrapper | Shared `tests/e2e/lib/safe-append-ledger.js` consumed by 3 scripts | Phase 62 (2026-06-09) | Single source of truth for CI/override/subscription gate; transport validation added |
| `--admin` merges undetected | `scripts/audit-bypass-merges.mjs` + weekly digest `bypass_count` row + STATE.md runbook | Phase 62 (2026-06-09) | Forensic visibility into bypass-tainted A/B winner samples; Phase 66 `--admin-bypass` filter consumes CSV |
| `gh api ...actions/runs` without pagination | `gh api ... --paginate` for forensic queries | Phase 62 best practice | Avoids silent 100-result truncation |

**Deprecated/outdated:** None. Phase 62 is purely additive over Phase 56 + Phase 58 + Phase 60.1 baselines.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gh search prs --json mergedAt` returns ISO-8601 timestamps that lexicographically compare correctly against `workflow_runs[].updated_at` | Bypass-Audit Probe — Detection Algorithm | Wrong comparison direction → bypass mis-detection. Mitigation: convert both via `new Date(...)` before comparison (shown in code example). |
| A2 | `verifier-gate` is the canonical workflow name (not e.g. `v40-verifier-gate`) | Bypass-Audit Probe — gh api Endpoint | Filter `R.name === 'verifier-gate'` would miss runs. Mitigation: filter by `workflow_id` (resolved via `gh api repos/.../actions/workflows/v40-verifier-gate.yml --jq .id`) for stability. |
| A3 | The 4 sites in CONTEXT (`auto-fix-promote.mjs:521,544` + `e2e-explore.mjs:262,313`) are the ONLY unguarded `appendLedgerEntry(LEDGER_PATH, ...)` calls in `scripts/` | Auxiliary-Leak Audit | Missed site continues leaking. Mitigation: pre-commit grep returning exactly 5 hits including the canonical site inside `safeAppendLedger:181` — VERIFIED in this research. |
| A4 | `tests/unit/llm-report.test.js:406` SUMMARY_KEYS.length assertion is the only test pinning the array length | Weekly Digest Wiring | Other source-grep tests break silently when length changes from 7 → 8. Mitigation: grep for `SUMMARY_KEYS.length` across `tests/` at plan time. |
| A5 | `tests/unit/auto-fix.test.js:1370-1394` L1+L2 are the only Phase 60.1 hotfix source-grep pins on `scripts/auto-fix.mjs` | Trust-Invariant Verification | Other pins fail when literals move. Mitigation: grep `tests/unit/` for `scripts/auto-fix.mjs` source-reads — VERIFIED only L1+L2 found. |
| A6 | The local wrapper in `auto-fix.mjs:143-181` does NOT need to be migrated to import from the shared helper — leaving it unchanged satisfies LEDX-01 (the SHARED helper file exists; it is consumed by the new wire-up sites in promote.mjs + explore.mjs) | Pattern 2 / Trust-Invariant Verification | LEDX-01 requirement could be interpreted to mean "auto-fix.mjs MUST consume the shared helper." Mitigation: plan-phase decides at task-spec time; either way the 6 LEDX/BYPASS requirements are met. |
| A7 | `gh repo view --json nameWithOwner` returns `{nameWithOwner: "owner/repo"}` parseable as default `--repo` arg | Bypass-Audit Probe — CLI argv | Wrong shape → script fails on auto-derive. Mitigation: test the JSON-parse fallback against a fixture. |

## Open Questions

1. **Should the local `auto-fix.mjs:safeAppendLedger` wrapper migrate to consume the shared helper, OR remain a self-contained wrapper for L1+L2 pin stability?**
   - What we know: L1+L2 source-grep pins require specific literals to remain in `auto-fix.mjs`. The shared helper is consumed by the other 3 scripts regardless.
   - What's unclear: Whether LEDX-01 is interpreted strictly enough to require auto-fix.mjs to also import the shared helper.
   - Recommendation: **Approach A — leave `auto-fix.mjs:143-181` UNCHANGED.** Simpler, safer, all pins green by construction. LEDX-01 is satisfied because the SHARED helper exists and IS consumed (by `auto-fix-promote.mjs` and `e2e-explore.mjs`).

2. **Default value of `--since-iso` for `audit-bypass-merges.mjs`?**
   - What we know: CONTEXT.md recommends 7 days. Weekly digest cron runs Mondays at 07:00 UTC.
   - What's unclear: Whether a single 7-day audit window matches the weekly digest cadence exactly (one bypass right after a Sunday could miss the window if cron lag pushes the digest to Tuesday).
   - Recommendation: 8 days as default — gives a 1-day safety margin against cron drift.

3. **Should `bypass_count = 0` always render a `Bypasses: 0` line in the digest, or omit the line entirely?**
   - What we know: Other SUMMARY_KEYS rows render zero values explicitly.
   - What's unclear: Whether zero-state is more useful visible or hidden.
   - Recommendation: Always render. Absence-of-bypasses is itself signal ("the discipline held this week").

4. **Workflow_id vs workflow_name for verifier-gate identification?**
   - Recommendation: Use `workflow_id` resolved once at script start (cached). Tests pin the resolution; production uses the cached ID. Avoids breakage if the workflow YAML's `name:` is ever edited.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Helper + audit script + Vitest | ✓ | v24.11.1 (system) | — |
| `gh` CLI | Audit script | ✓ | 2.83.1 | — (BLOCKING if absent; script exits 1) |
| GH_TOKEN | Audit script in CI | ✓ (workflow env) | — | Local dev: `gh auth login` → CLI uses stored OAuth |
| Vitest | Test suite | ✓ (existing dep) | ^3.0.0 | — |
| `child_process.execSync` | Audit script | ✓ (Node built-in) | built-in | — |
| `node:crypto` (sha256) | Trust-invariant test | ✓ (Node built-in) | built-in | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.0.0 |
| Config file | `vitest.config.js` (existing) |
| Quick run command | `npm test -- tests/unit/safe-append-ledger.test.js tests/unit/audit-bypass-merges.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LEDX-01 | Helper exists; signature accepts (ledgerPath, entry, opts); defaults applied; non-canonical transport throws | unit | `npm test -- tests/unit/safe-append-ledger.test.js -t 'T_LEDX_'` | ❌ Wave 0 — new file |
| LEDX-02 | 4 sites use `safeAppendLedger` (source-grep) | unit | `npm test -- tests/unit/safe-append-ledger.test.js -t 'T_LEDX_SITES_WIRED'` | ❌ Wave 0 — new test |
| LEDX-03 | `appendLedgerEntry` body sha256 unchanged | unit | `npm test -- tests/unit/safe-append-ledger.test.js -t 'T_LEDX_APPEND_BODY_PINNED'` | ❌ Wave 0 — new test |
| LEDX-04 | Subscription-tagged entry passes outside CI; sdk-tagged still throws | unit | `npm test -- tests/unit/safe-append-ledger.test.js -t 'T_PHASE60_1_HOTFIX_PRESERVED_SHARED'` | ❌ Wave 0 — new test |
| LEDX-04 (existing pins preserved) | `auto-fix.mjs` source-grep L1+L2 still pass | unit | `npm test -- tests/unit/auto-fix.test.js -t 'Phase 60.1 hotfix'` | ✅ existing — runs unchanged |
| LEDX-03 invariant (existing tests stay green) | 33 ledger tests pass | unit | `npm test -- tests/unit/llm-ledger.test.js` | ✅ existing |
| BYPASS-01 | Audit script detects bypass via timestamp comparison; CSV shape correct | unit | `npm test -- tests/unit/audit-bypass-merges.test.js -t 'T_BYPASS_DETECT'` | ❌ Wave 0 — new file |
| BYPASS-01 | gh CLI auth pre-check exits 1 on unauthed | unit | `npm test -- tests/unit/audit-bypass-merges.test.js -t 'T_BYPASS_GH_AUTH'` | ❌ Wave 0 |
| BYPASS-01 | `ledger_source_tag` populated from ledger cross-ref | unit | `npm test -- tests/unit/audit-bypass-merges.test.js -t 'T_BYPASS_LEDGER_TAG'` | ❌ Wave 0 |
| BYPASS-02 | `SUMMARY_KEYS.length === 8` (was 7) | unit | `npm test -- tests/unit/llm-report.test.js -t 'SUMMARY_KEYS'` | ✅ existing — needs assertion update from 7 → 8 |
| BYPASS-02 | `renderAutoFixPipelineSection` emits `Bypasses: N` line | unit | `npm test -- tests/unit/weekly-digest-auto-fix.test.js -t 'bypass_count'` | ❌ Wave 0 — new test in existing file |
| BYPASS-03 | STATE.md `## Bypass Conventions` section present | smoke | `grep -q '^## Bypass Conventions$' .planning/STATE.md` | ✅ existing — verify-only |

### Sampling Rate

- **Per task commit:** `npm test -- tests/unit/safe-append-ledger.test.js tests/unit/auto-fix.test.js tests/unit/llm-ledger.test.js` (~5s)
- **Per wave merge:** `npm test` (full suite; ~30s)
- **Phase gate:** Full suite green + `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` returns exactly 5 hits (1 canonical + 4 the helper now routes through) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/safe-append-ledger.test.js` — covers LEDX-01..04 (new file)
- [ ] `tests/unit/audit-bypass-merges.test.js` — covers BYPASS-01 (new file)
- [ ] `tests/unit/llm-report.test.js` — update `SUMMARY_KEYS.length === 7` → `=== 8` (existing file, same commit as SUMMARY_KEYS edit)
- [ ] `tests/unit/weekly-digest-auto-fix.test.js` — add `bypass_count` rendering test (existing file)
- [ ] Framework install: NONE — Vitest already present

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | partial | `gh` CLI handles GitHub token; audit script does not store credentials |
| V3 Session Management | no | No sessions |
| V4 Access Control | partial | Audit script is read-only; CI runs under `GITHUB_TOKEN` (workflow-scoped) |
| V5 Input Validation | yes | `audit-bypass-merges.mjs` argv parsing must validate `--since-iso` format and `--repo` shape; transport validation in helper rejects non-canonical strings |
| V6 Cryptography | partial | sha256 pin uses Node `node:crypto` — never hand-roll |
| V7 Error Handling | yes | Helper throws with explicit messages; audit script exits non-zero on gh-auth failure |
| V12 File Operations | yes | Audit script writes CSV to `reports/bypass-audits/<date>.csv` — path joined via `node:path` (no string concatenation) |
| V14 Configuration | yes | Workflow `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — token never echoed to logs |

### Known Threat Patterns for {Node.js + gh CLI + GitHub Actions} Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage via `echo $GH_TOKEN` in logs | Information Disclosure | Never echo; use `gh auth status` (which masks) |
| Argv injection via `--repo "owner/repo; rm -rf /"` | Tampering | Validate `--repo` shape with regex `/^[\w.-]+\/[\w.-]+$/` before passing to `gh api` |
| `gh api` rate-limit DoS during audit | Denial of Service | gh CLI handles 429 with backoff; `--paginate` respects |
| Workflow privilege escalation via `pull_request_target` | Elevation of Privilege | Phase 62 weekly-digest workflow already uses `schedule + workflow_dispatch` — not exposed to PR-author code |
| ReDoS in CSV parsing | Denial of Service | CSV emission is plain `join(',')`; no regex parsing of untrusted input |

**Note:** The audit script reads ledger JSON (trusted; committed by CI) and GitHub API responses (trusted; signed by `GITHUB_TOKEN`). No untrusted input vectors.

## Sources

### Primary (HIGH confidence)

- `/home/fatduck/patent-cite-tool/scripts/auto-fix.mjs` lines 71, 85-181 (verbatim port source for shared helper)
- `/home/fatduck/patent-cite-tool/scripts/auto-fix-promote.mjs` lines 67, 521-558 (target wire sites + existing entry shapes)
- `/home/fatduck/patent-cite-tool/scripts/e2e-explore.mjs` lines 43, 240-320 (target wire sites + missing source/transport context)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-ledger.js` lines 686-738 (`appendLedgerEntry` body — BYTE-UNCHANGED invariant target)
- `/home/fatduck/patent-cite-tool/tests/unit/llm-ledger.test.js` (33-test enumeration verified via grep)
- `/home/fatduck/patent-cite-tool/tests/unit/auto-fix.test.js` lines 1340-1395 (Phase 60.1 hotfix pins L1+L2)
- `/home/fatduck/patent-cite-tool/.github/workflows/e2e-weekly-digest.yml` (workflow shape for additive step)
- `/home/fatduck/patent-cite-tool/tests/e2e/lib/llm-report.js:123` (`SUMMARY_KEYS` Object.freeze)
- `/home/fatduck/patent-cite-tool/.planning/STATE.md` line 47 (`## Bypass Conventions` verified present)
- `/home/fatduck/patent-cite-tool/.planning/research/PITFALLS.md` Pitfalls 3 + 11 (LEDX-03 invariant + bypass detection definition)
- `/home/fatduck/patent-cite-tool/.planning/REQUIREMENTS.md` LEDX-01..04 + BYPASS-01..03

### Secondary (MEDIUM confidence)

- gh CLI documentation (`gh api --paginate`, `gh auth status`, `gh search prs --json mergedAt`) — verified via `gh --version` returning 2.83.1 and behavior consistent with installed CLI

### Tertiary (LOW confidence)

- None — all claims grounded in HEAD code inspection or local CLI verification

## Metadata

**Confidence breakdown:**

- Helper extraction surface: HIGH — verbatim port from verified source lines
- Site wiring: HIGH — 4 sites located + verified at exact line numbers; existing entry shapes documented
- Test strategy: HIGH — 6 minimum cases with concrete assertions; sha256 pin command provided
- Bypass-audit probe: MEDIUM — `gh api` shape verified against CLI docs but exact API field names (`updated_at` vs `run_completed_at`) confirmed via PITFALLS Pitfall 11 wording; recommend a 1-PR smoke test before BYPASS-02 wires the workflow consumer
- Weekly digest wiring: HIGH — `SUMMARY_KEYS` location + `renderAutoFixPipelineSection` integration point verified in `scripts/weekly-digest.mjs`
- STATE.md verification: HIGH — section verified present at line 47

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days — codebase stable; Vitest + Node + gh CLI versions pinned)

## RESEARCH COMPLETE

**Phase:** 62 — Forensic Ledger Hardening + Bypass-Audit Probe
**Confidence:** HIGH

### Key Findings

- Helper extraction is mechanical: port lines 155-180 of `auto-fix.mjs` verbatim into a new file `tests/e2e/lib/safe-append-ledger.js`, with `LEDGER_PATH` becoming an explicit parameter.
- Auxiliary-leak audit clean: `grep -rn "appendLedgerEntry(LEDGER_PATH" scripts/` returns exactly 5 hits — 1 canonical inside `safeAppendLedger:181` + 4 the new helper now routes through (`auto-fix-promote.mjs:521,544` + `e2e-explore.mjs:262,313`). NO surprise leak vector at HEAD.
- Recommend leaving `auto-fix.mjs:143-181` UNCHANGED. The shared helper is consumed by promote.mjs + explore.mjs only. This keeps the L1+L2 Phase 60.1 source-grep pins green by construction and avoids closure→parameter conversion bugs in the proven local wrapper.
- 7-test suite in new `tests/unit/safe-append-ledger.test.js` covers CI gate / override gate / subscription whitelist / transport rejection / defaults / sha256 pin / wiring source-grep.
- `gh api repos/.../actions/runs --paginate` + `gh search prs --merged --json mergedAt` provides all bypass-detection data; ledger cross-reference populates the `ledger_source_tag` CSV column for Phase 66 consumption.
- Weekly digest edit: 1-line SUMMARY_KEYS addition (`'bypass_count'`) + update one Vitest length assertion from `=== 7` → `=== 8` in the same commit.

### File Created

`/home/fatduck/patent-cite-tool/.planning/phases/62-forensic-ledger-hardening-bypass-audit-probe/62-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Zero new deps; all primitives already in repo |
| Architecture | HIGH | Verbatim port; mechanical wire-up; existing patterns extended |
| Pitfalls | HIGH | Five new Phase 62-specific pitfalls + 33-test invariant guard verified |
| Test strategy | HIGH | 6+1 test cases with concrete assertions; sha256 pin command provided |
| Bypass-audit probe | MEDIUM | gh api shape verified; recommend 1-PR smoke before BYPASS-02 wire-up |

### Open Questions

1. Migrate `auto-fix.mjs` local wrapper to consume shared helper? → Recommend NO (preserves L1+L2 pins).
2. Default `--since-iso` of 7 vs 8 days? → Recommend 8 (cron drift margin).
3. Render `Bypasses: 0` or omit? → Recommend always render.
4. Use workflow_id vs workflow_name for verifier-gate filter? → Recommend workflow_id (resilient to YAML name edits).

### Ready for Planning

Research complete. Planner can now create PLAN.md files. **Recommendation count: 4 plan-time decisions (Open Questions 1-4); 2 atomic commits suggested (LEDX bundle + BYPASS bundle, or single combined).**

# Phase 58: Promote Outcome Ledger Entry - Research

**Researched:** 2026-06-05
**Domain:** Event-sourced ledger entry wiring inside `scripts/auto-fix-promote.mjs` (CLI shim invoked by `v40-auto-promote.yml` on auto-fix PR merge)
**Confidence:** HIGH — every claim below is grounded in direct read of the live files (auto-fix-promote.mjs, a-b-winner.mjs, auto-fix.mjs, build-auto-fix-pr-body.mjs, llm-ledger.js, the live ledger JSON, and the existing Vitest). No external sources required.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Outcome ledger pattern:** Event-sourced new entry (NOT an update to the existing auto-fix entry — `appendLedgerEntry` is append-only JSONL by contract).
- **Success entry shape (PROMOTE-02):** `{source: 'auto-fix-promoted', outcome: 'pass', fingerprint, issueId, prNumber, ...required common fields like timestamp, phase, transport}` — written immediately after the successful `runPromote` call at line ~431-446 of `auto-fix-promote.mjs` on the verified branch (single insertion point AFTER `result.exitCode !== 0` early-exit and BEFORE the final `process.stdout.write(...)`/`process.exit(0)`).
- **Failure entry shape (PROMOTE-03):** `{source: 'auto-fix-failed', outcome: 'fail', fingerprint, issueId, prNumber, reason, ...required common fields}` — written at the label-flap-to-failure paths (when `result.exitCode !== 0` at line 436, AND/OR at the earlier triple-gate failure paths at lines 404/419/425). Planner chooses which failure paths warrant entries; recommend at minimum the `runPromote returned non-zero` path (line 436-440) since that's the documented "promotion failure" condition.
- **IMPORTS POLICY update (PROMOTE-01):** Edit the comment block at `scripts/auto-fix-promote.mjs:21-30`. Add `./tests/e2e/lib/llm-ledger.js` (or whatever relative path resolves) to the ALLOWED list. Update the grep audit pattern in the comment to include the new allowed file. NO existing Vitest assertion enforces this policy today (verified via grep — `tests/unit/auto-fix-promote-gate.test.js` has NO `IMPORTS POLICY` or import-grep test). Therefore PROMOTE-01 expands to ALSO ADD a new Vitest assertion that enforces the allow-list. The planner adds this assertion in `tests/unit/auto-fix-promote-gate.test.js` in the same commit as the new `appendLedgerEntry` import.
- **assertTripleGate body byte-unchanged (PROMOTE-04):** Add a Vitest delta assertion that reads `scripts/auto-fix-promote.mjs` source, extracts the function body between `export function assertTripleGate` and the closing brace, and pins it to a known-good hash OR a verbatim string. Lands in the SAME commit as the new outcome-entry code.
- **Fingerprint sourcing:** `fingerprint` is in the PR body (per Phase 35 issue-payload-builder convention: line 1 of body). `parseSourceIssue` already extracts `resolvedSourceIssue`. **[RESEARCH OVERRIDES THIS — see §Tension Resolutions below; the PR body does NOT carry the fingerprint in HTML-comment form; fingerprint must be looked up from the SOURCE ISSUE body via `gh` or pre-resolved by the workflow and passed via a new CLI flag.]**
- **issueId / prNumber:** `args.sourceIssue` and `args.pr` are already parsed from argv. Use them directly.
- **`reason` field on failure entry:** Use the exact error message captured at the failure point (e.g., `'runPromote exitCode=' + result.exitCode` or the gate-failure message).
- **Atomic commit:** Single `feat(58): wire promote outcome ledger entries (PROMOTE-01..04)` if mechanically feasible. If split, PROMOTE-04's assertTripleGate-byte-pin MUST land in the same commit as the new code (defense against accidental body drift during the edit).

### Claude's Discretion
- Which failure paths get a ledger entry — minimally the `runPromote` non-zero exit at line 436; optionally the triple-gate failure paths at 404/419/425 (these are pre-promotion, so semantically distinct from a "promotion failed mid-flow" — planner picks the cleanest semantic).
- Whether the assertTripleGate body-pin uses a hash (compact, less informative on failure) or a verbatim string (verbose, clear delta when it fails). Recommend verbatim string — the function body is small (lines 89-103 ~15 lines) and the failure message is more diagnosable.
- Whether to also add a Vitest assertion that pins `_skipCiGuard:\s*true` grep count = 1 (recommended — it's the load-bearing trust invariant from Phase 53 close).
- Whether `parseFingerprint` becomes an exported helper or stays inline at the call site (defer to planner's read of the surrounding code).
- Exact `appendLedgerEntry` import path — recommend `import { appendLedgerEntry } from '../tests/e2e/lib/llm-ledger.js'` (from `scripts/` to `tests/e2e/lib/`). Planner confirms the path resolves at runtime AND that the IMPORTS POLICY comment's grep audit pattern continues to pass.

### Deferred Ideas (OUT OF SCOPE)
- A/B winner code changes — explicitly NOT in scope; the forward-compat probe handles outcome entries transparently once they exist.
- `fix_abandoned` outcome state (draft PR closed without merge) — owned by future milestone (OBS-FUT-01).
- Removing the Phase 56 `safeAppendLedger` wrapper from auto-fix.mjs — defense-in-depth; both layers stay.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROMOTE-01 | `scripts/auto-fix-promote.mjs` IMPORTS POLICY narrowed to allow `llm-ledger.js`; existing grep-based Vitest assertion in `tests/unit/auto-fix-promote-gate.test.js` updated in the SAME commit | §6 (IMPORTS POLICY comment block at lines 21-30 with explicit `tests/e2e/lib/*` FORBIDDEN); §10 (CONFIRMED: NO existing IMPORTS POLICY assertion in any Vitest file — Phase 58 ADDS it). New audit grep pattern documented below. |
| PROMOTE-02 | Event-sourced outcome entry written on promotion success: `{source: 'auto-fix-promoted', outcome: 'pass', fingerprint, issueId, prNumber}` — through `safeAppendLedger` | §7 (insertion point: line 442 — after the `result.exitCode !== 0` check at line 436-441 and before the `process.stdout.write` at line 443). NOTE: REQUIREMENTS.md says "through `safeAppendLedger`" but `safeAppendLedger` is module-internal to `scripts/auto-fix.mjs` (per CONTEXT). Phase 58 imports `appendLedgerEntry` directly. |
| PROMOTE-03 | Event-sourced outcome entry written on promotion failure (label-flap-to-failure): `{source: 'auto-fix-failed', outcome: 'fail', fingerprint, issueId, prNumber, reason}` | §8 (failure-path inventory: 5 verified-branch process.exit(1) sites at lines 374, 404, 419, 425, 440). RECOMMENDED scope: line 440 only (runPromote returned non-zero — the documented "promotion failure" path) — see §8 rationale. |
| PROMOTE-04 | `assertTripleGate` body BYTE-UNCHANGED (Phase 53 trust invariant) — Vitest delta assertion pins zero diff lines | §3 (body span = lines 89-103, 15 lines, sha256 `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f`). Verbatim string recommended over hash for diagnosability. |
</phase_requirements>

---

## Summary

Phase 58 wires event-sourced outcome ledger entries into `scripts/auto-fix-promote.mjs`. The mechanical change is small (one new import, ~10–15 lines of new code at 1–2 insertion points, plus IMPORTS POLICY comment-block edit). The risk surface is in **anti-features**, not new code:

1. The Phase 53 trust invariant (`assertTripleGate` body byte-unchanged) must hold.
2. The Phase 53 trust invariant (`_skipCiGuard:\s*true` non-comment grep count == 1) must hold.
3. The IMPORTS POLICY comment must accurately mirror the new allowed-list AND the planner must ADD the first-ever Vitest enforcement of that policy (it does not exist today).
4. The fingerprint sourcing assumption in CONTEXT.md is incorrect: the auto-fix PR body does NOT carry the fingerprint as an HTML-comment (`<!-- fingerprint: ... -->` does not exist anywhere; `<!-- fp: ... -->` lives only in the SOURCE ISSUE body, never in the PR body). Phase 58 must either (a) extend the workflow YAML to pre-resolve the fingerprint via `gh issue view --json body` and pass it via a new `--fingerprint` CLI flag, OR (b) add an `fs.readFileSync`-style live lookup inside `auto-fix-promote.mjs` (rejected — violates the "pure-CLI for Vitest mockability" design at scripts/auto-fix-promote.mjs:43-46 + the IMPORTS POLICY which forbids gh shell-outs from the script). **Option (a) is the correct design.**

**Primary recommendation:** Single atomic commit. Add `--fingerprint` argv flag (workflow passes it pre-resolved). Import `appendLedgerEntry` from `'../tests/e2e/lib/llm-ledger.js'`. Update the IMPORTS POLICY comment block AND add a new Vitest enforcement assertion. Add outcome entry write at line 442 (success path) and line 439 (runPromote-failure path). Pin `assertTripleGate` body verbatim. Optionally pin `_skipCiGuard:\s*true` non-comment count.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Outcome ledger event write | Scripts (auto-fix-promote.mjs) | Library (llm-ledger.js's appendLedgerEntry) | The promotion event is auto-fix-promote.mjs's own state-transition (it is the agent that just succeeded or failed); the library function provides only the append primitive. |
| Fingerprint pre-resolution | CI/Workflow (v40-auto-promote.yml) | — | Phase 44 design at scripts/auto-fix-promote.mjs:43-46 explicitly keeps gh CLI calls in the workflow, not the script. The fingerprint lives on the source issue and must be pulled by `gh issue view --json body --jq '.body'` in the workflow's pre-resolution step, then passed as `--fingerprint` argv to the script. |
| Vitest enforcement of IMPORTS POLICY | Tests (auto-fix-promote-gate.test.js) | Scripts (the file under audit) | The IMPORTS POLICY comment at lines 21-30 has been advisory-only since Phase 44; Phase 58 promotes it to executable assertion (REQUIREMENTS PROMOTE-01). |
| assertTripleGate body integrity | Tests (auto-fix-promote-gate.test.js) | Scripts (the body) | Phase 53 trust invariant. Phase 58 RE-PINS at the Phase 58 baseline because the file is being edited in this commit (Phase 53's pin was against the Phase 53 baseline). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node 22 built-ins (`fs`, `path`, `node:url`) | bundled with Node 24.11.1 (current runtime) | File I/O, CLI shim entry-point check | Already used throughout `auto-fix-promote.mjs`; zero new deps target. [VERIFIED: `node --version` → v24.11.1] |
| `appendLedgerEntry` from `tests/e2e/lib/llm-ledger.js` | in-tree library, byte-unchanged invariant | Append-only JSONL ledger write primitive | Phase 56 preserved its body byte-unchanged. Existing `scripts/auto-fix.mjs:74` already imports from this exact relative path: `'../tests/e2e/lib/llm-ledger.js'`. [VERIFIED: `grep -n "^import" scripts/auto-fix.mjs`] |
| `runPromote` from `./promote-from-quarantine.mjs` | unchanged | Existing per-case promote primitive | Already the only non-node import in the file (auto-fix-promote.mjs:58). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | 3.x (project pin per Phase 56 stack) | Unit test framework | All new Phase 58 assertions go in `tests/unit/auto-fix-promote-gate.test.js` (existing file, 323 lines today — NOT 42 as CONTEXT.md claimed; see §10 below). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Importing `appendLedgerEntry` directly | Wrap in a local `safeAppendLedger`-style helper inside `auto-fix-promote.mjs` | Rejected — CONTEXT.md decision explicitly: "`safeAppendLedger` wrapper is module-internal to `scripts/auto-fix.mjs`; Phase 58 does NOT depend on it (auto-fix-promote.mjs runs only in CI where the leak vector does not apply). Phase 58 imports `appendLedgerEntry` directly." This matches the Tension 3 resolution in `.planning/research/SUMMARY.md`. |
| Live `gh` lookup of source issue body inside `auto-fix-promote.mjs` | Workflow pre-resolves fingerprint via `gh issue view --json body --jq '.body' | grep '<!-- fp:'` and passes via new `--fingerprint` argv flag | **Workflow pre-resolution wins.** The script-purity invariant at lines 43-46 ("the script never makes its own gh calls. This keeps the script pure-CLI for Vitest mockability") is load-bearing. A live `gh` call would also require new shell-out machinery in the script and violate the IMPORTS POLICY in spirit. |
| One commit | Two commits (IMPORTS POLICY narrow-and-pin → outcome entry writes) | Single commit recommended per CONTEXT.md "If split, PROMOTE-04's assertTripleGate-byte-pin MUST land in the same commit as the new code." |

**Installation:** None — zero new dependencies. Project holds 4-consecutive-milestone zero-new-deps target.

**Version verification:** N/A — no new packages.

## Package Legitimacy Audit

> Phase 58 installs ZERO external packages. No audit required. The zero-new-deps invariant from REQUIREMENTS.md "Out of Scope" table is preserved.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | N/A |

## Architecture Patterns

### System Architecture Diagram

```
GitHub Workflow (v40-auto-promote.yml)
  │  on: pull_request closed
  │  if: PR has auto-fix:verified label && merged
  │
  ├─[NEW] Pre-resolution step:
  │     gh issue view <source_issue> --json body --jq '.body' \
  │       | grep -oE '<!-- fp: [0-9a-f]{12} -->' \
  │       | sed 's/<!-- fp: //; s/ -->//'
  │     => $FINGERPRINT
  │
  ├─ Invokes:  node scripts/auto-fix-promote.mjs \
  │              --pr <N> --pr-labels <csv> --pr-merged true \
  │              --pr-body /tmp/pr-body.md --pr-commit-message <str> \
  │              --source-issue <N> --source-issue-labels <csv> \
  │              --case-id <id> \
  │              --fingerprint $FINGERPRINT                  ← NEW
  ▼
scripts/auto-fix-promote.mjs main()
  │
  ├─ parseArgv(argv) → args  (incl. args.fingerprint NEW)
  ├─ readFileSync(args.prBodyPath) → body
  ├─ [hasVerified branch]:
  │    ├─ assertTripleGate({prLabels, merged, sourceIssueLabels})
  │    │    └─ throws → stderr + process.exit(1)     [GATE FAILURE PRE-PROMOTION]
  │    ├─ parseSourceIssue({body, commitMessage}) → resolvedSourceIssue
  │    │    └─ throws → stderr + process.exit(1)     [GATE FAILURE PRE-PROMOTION]
  │    ├─ source-issue agreement check
  │    │    └─ mismatch → stderr + process.exit(1)   [GATE FAILURE PRE-PROMOTION]
  │    ├─ runPromote({id, confirm:true, _skipCiGuard:true})
  │    │    └─ exitCode !== 0 →
  │    │        ┌─[NEW] appendLedgerEntry({source:'auto-fix-failed',
  │    │        │       outcome:'fail', fingerprint, issueId, prNumber, reason,
  │    │        │       iso, model, cost_usd:0, phase, transport, ...})
  │    │        └─ stderr + process.exit(1)           [PROMOTION FAILURE]
  │    ├─[NEW] appendLedgerEntry({source:'auto-fix-promoted',
  │    │        outcome:'pass', fingerprint, issueId, prNumber,
  │    │        iso, model, cost_usd:0, phase, transport, ...})
  │    └─ stdout + process.exit(0)                    [PROMOTION SUCCESS]
  └─ [hasPartial branch]: UNCHANGED (Phase 53 territory; not modified by Phase 58)

tests/e2e/.llm-spend-ledger.json
  │  iterations[]
  │     ├─ {source:'auto-fix-api', errorClass:..., fingerprint:..., issueId, ...}  ← from Phase 56 auto-fix.mjs
  │     ├─[NEW]  {source:'auto-fix-promoted', outcome:'pass', fingerprint:..., issueId, prNumber, ...}
  │     └─[NEW]  {source:'auto-fix-failed',   outcome:'fail', fingerprint:..., issueId, prNumber, reason, ...}
  ▼
scripts/a-b-winner.mjs computePerClassPerArm()
  │  detectOutcome(entry):
  │     entry.outcome === 'pass'  → true   ← Phase 58 success entries match here
  │     entry.outcome === 'fail'  → false  ← Phase 58 failure entries match here
  │  Once ≥20 entries per ERROR_CLASS per arm: exit abstention automatically
```

### Recommended Project Structure
No structural changes. Edits:
```
scripts/
├── auto-fix-promote.mjs          # MODIFIED: 1 new import, 1 new argv flag, 2 new entry-writes,
│                                 #           1 comment-block update (IMPORTS POLICY)
└── (no other file changes)

tests/unit/
└── auto-fix-promote-gate.test.js # MODIFIED: +3 describe blocks
                                  #           (IMPORTS POLICY enforcement, assertTripleGate byte-pin,
                                  #            outcome-entry writes via mocked appendLedgerEntry)

.github/workflows/
└── v40-auto-promote.yml          # MODIFIED: +1 pre-resolution step + 1 new argv flag
                                  #           (passes --fingerprint to auto-fix-promote.mjs)
```

### Pattern 1: Outcome Entry Insertion
**What:** Append a single `appendLedgerEntry(LEDGER_PATH, {...})` call at each terminal branch of `main()`'s verified path.
**When to use:** Both success (after `runPromote` returns exitCode 0) and the immediate-followup failure (`runPromote returned exitCode !== 0`).
**Example (verbatim shape, drawn from `scripts/auto-fix.mjs:419-432`):**
```javascript
// [CITED: scripts/auto-fix.mjs:419-432 — the project's canonical entry shape for an event entry]
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: 'claude-sonnet-4-6',          // promote is a non-LLM workflow; record the
                                       // currently-targeted dispatcher default
  cost_usd: 0,                         // no LLM tokens spent in the promote step
  tokens_in: 0,
  tokens_out: 0,
  phase: '58-promote',                 // distinguishes from upstream 'auto-fix-*' phases
  transport: 'subscription',           // or 'sdk' — Phase 58 promote has no LLM call;
                                       // pick one canonical value per CONTEXT decision
  issueId: `issue-${args.sourceIssue}`,// matches the upstream auto-fix entry's issueId
  prNumber: args.pr,                   // additive field from llm-ledger.js JSDoc
  fingerprint: args.fingerprint,       // 12-hex; NEW argv flag (see §2 below)
  errorClass: null,                    // see §1 — a-b-winner.mjs requires it ON the OUTCOME
                                       // ENTRY (isAttributable filter at a-b-winner.mjs:178-189);
                                       // workflow MUST pre-resolve and pass it via new
                                       // --error-class flag, OR planner accepts permanent
                                       // a-b-winner abstention until OBS-FUT-02
  source: 'auto-fix-promoted',         // PROMOTE-02 locked string
  outcome: 'pass',                     // PROMOTE-02 locked string
});
```

### Anti-Patterns to Avoid
- **Using `safeAppendLedger` in auto-fix-promote.mjs:** It does not exist there — it is module-internal to `auto-fix.mjs`. CONTEXT.md correctly notes this; REQUIREMENTS.md PROMOTE-02 erroneously says "through `safeAppendLedger`". Use `appendLedgerEntry` directly.
- **Adding a second `_skipCiGuard:\s*true` literal:** The Phase 53 grep-count trust invariant is 1 (line 434). Code that contains the literal pattern (e.g., a comment "skip ci guard true") could collide. **The new outcome entry code does not need to reference `_skipCiGuard` at all** — but the Vitest assertion for this invariant (recommended Claude's-Discretion item) should grep with a regex that excludes string literals in comments.
- **Writing the outcome entry BEFORE `runPromote` returns:** semantically wrong (records a success before promotion happened). Insert position must be AFTER the `result.exitCode !== 0` early-exit (line 440) and BEFORE the final `process.stdout.write` (line 443).
- **Writing the failure entry on a triple-gate failure (lines 404, 419, 425):** semantically these are PRE-PROMOTION rejections (the gate did its job and stopped the workflow). Recommend NOT writing failure entries here — `outcome: 'fail'` should mean "promotion attempt was made and failed mid-flow", consistent with what `a-b-winner.mjs` will infer about model performance. See §8 for argument.
- **Using `<!-- fingerprint: N -->` regex on the PR body:** That marker does not exist. See §2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONL append with atomic crash-safety | Custom file write | `appendLedgerEntry(LEDGER_PATH, entry)` | Already implemented with tmp-rename + EXDEV fallback at `tests/e2e/lib/llm-ledger.js:707-737`. Phase 56 left it byte-unchanged. |
| Fingerprint extraction from issue body | Custom regex in auto-fix-promote.mjs | Pre-resolved by workflow via `gh issue view --json body` + grep `<!-- fp: ([0-9a-f]{12}) -->` | Keeps script pure-CLI (lines 43-46 invariant). The existing `extractFingerprint` regex in `scripts/auto-fix.mjs:229-233` is the format authority. |
| Argv flag parsing | Yet another mini-parser | Extend the existing `parseArgv` in `auto-fix-promote.mjs:288-354` (add `--fingerprint` to `KNOWN_FLAGS` set + add case branch) | Matches the existing 9-flag hand-rolled pattern (project convention; mirrors `verify-single-case.mjs`). |
| Hash-pinning the assertTripleGate body | Custom crypto | Use `awk 'NR>=89 && NR<=103'` extract + `Buffer.from(...).toString('utf8')` comparison against a verbatim string OR a sha256 hash via `node:crypto` | Verbatim string is more diagnosable; project Vitest pattern. |

**Key insight:** Everything Phase 58 needs is already in-tree. The Phase 58 commit is small and surgical; the bulk of the work is in tests and the workflow YAML edit, not the script logic.

## Runtime State Inventory

> Phase 58 is additive (new entries written; no rename/refactor/migration). This section confirms no hidden state surfaces exist.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The live ledger at `tests/e2e/.llm-spend-ledger.json` currently contains a single bootstrap entry (phase: '39-bootstrap', source: 'phase-39-flip'). Phase 58 writes NEW entries with `source: 'auto-fix-promoted'` / `'auto-fix-failed'`. These do not overwrite or modify the bootstrap entry. | None — additive writes only. |
| Live service config | None — Phase 58 does not modify any external service config. | None |
| OS-registered state | None — Phase 58 does not register OS-level tasks. | None |
| Secrets/env vars | None — Phase 58 does not introduce new env vars. The `appendLedgerEntry` write is gated by the existing `LEDGER_PATH` IIFE at `tests/e2e/lib/llm-ledger.js:74-98` which already respects `E2E_LEDGER_PATH_OVERRIDE`. | None — auto-fix-promote.mjs runs only in CI (where `CI=true`), so no leak surface. |
| Build artifacts | None | None |

**Nothing found in any category requires a state migration.** Phase 58 is purely additive.

## Common Pitfalls

### Pitfall 1: Adding `errorClass` to the OUTCOME entry (or omitting it)

**What goes wrong:** `scripts/a-b-winner.mjs:isAttributable()` (lines 178-189) requires BOTH `entry.model` AND `entry.errorClass` to be present and non-empty. Entries failing this filter are dropped before reaching the outcome detection. If the Phase 58 outcome entry lacks `errorClass`, it is filtered OUT and contributes NOTHING to abstention exit. PROMOTE-02/03 are then technically satisfied per their literal field-set but the success-criterion #3 of the milestone ("a-b-winner.mjs exits abstention without code changes") is NOT achieved.

**Why it happens:** CONTEXT.md says: "Phase 58 entries DO NOT need to write `errorClass` themselves — that's already on the upstream auto-fix entry." That assumption is incorrect for the a-b-winner consumer. `a-b-winner.mjs` does NOT join the promote entry to the upstream auto-fix entry; it filters individual entries and counts them.

**How to avoid:** The workflow must pre-resolve `errorClass` for the source issue (same lookup the dispatcher already does via `extractErrorClass(issueJson.labels)`) and pass it via a new `--error-class` argv flag (or the existing `--source-issue-labels` CSV is already in argv; the script can derive `errorClass` from it using the same `extractErrorClass` helper from `tests/e2e/lib/error-codes.js` — but that import is in the FORBIDDEN list. Cleanest: workflow pre-resolves and passes via new `--error-class` flag).

**Warning signs:** `a-b-winner.mjs` still emits `NO_WINNER_YET` after 20+ promotions per ERROR_CLASS per model arm. Inspect the ledger: `jq '[.months[][].iterations[] | select(.source=="auto-fix-promoted") | .errorClass]' tests/e2e/.llm-spend-ledger.json` shows all `null` or absent.

**Decision required from planner:** Either (a) add `--error-class` argv pre-resolution to the workflow + script (recommended), or (b) accept that the outcome entries will not advance a-b-winner abstention exit alone — abstention will require a separate future phase. CONTEXT.md "Claude's Discretion" item correctly flags this: "Planner verifies whether a-b-winner.mjs requires errorClass on the outcome entry too, or just on the upstream auto-fix entry; recommend research-time check." **This research confirms: YES, a-b-winner.mjs requires errorClass on the outcome entry itself.** See §1 below for the verified code path.

---

### Pitfall 2: Trusting CONTEXT.md's fingerprint-in-PR-body claim

**What goes wrong:** CONTEXT.md says fingerprint is in the PR body via the Phase 35 `<!-- fingerprint: ... -->` convention. Direct read of `scripts/build-auto-fix-pr-body.mjs:21-37` and the workflow invocation at `.github/workflows/v40-auto-fix.yml:182-187` shows:

1. The PR body's HTML comments are `<!-- affected_cases: ... -->` (line 1) and `<!-- source_issue: N -->` (line 2). **There is NO `<!-- fingerprint: ... -->` or `<!-- fp: ... -->` HTML comment in the PR body.**
2. The PR body DOES have a markdown bullet: ``- fingerprint: `<fp>` `` at line 9 of the generated body — BUT this line is only populated when the workflow passes `--fingerprint` to `build-auto-fix-pr-body.mjs`, which it currently does NOT. The current workflow invocation is `node scripts/build-auto-fix-pr-body.mjs --issue N --branch B --error-class C` — no `--fingerprint` flag. The default falls back to ``- fingerprint: `unknown` ``.
3. The fingerprint as `<!-- fp: ([0-9a-f]{12}) -->` lives in the SOURCE ISSUE body (line 1 of issue body, per `tests/e2e/lib/issue-payload-builder.js:247-249`), NOT in the PR body.

**How to avoid:** Phase 58 must pre-resolve the fingerprint in `v40-auto-promote.yml` BEFORE invoking `auto-fix-promote.mjs`. The pre-resolution shell-step:
```yaml
- name: Pre-resolve source-issue fingerprint
  id: fp
  run: |
    FP=$(gh issue view ${{ steps.source.outputs.source_issue }} \
           --json body --jq '.body' \
         | grep -oE '<!-- fp: [0-9a-f]{12} -->' \
         | head -1 \
         | sed -E 's/<!-- fp: ([0-9a-f]{12}) -->/\1/')
    echo "fingerprint=$FP" >> "$GITHUB_OUTPUT"
```
Then pass `--fingerprint ${{ steps.fp.outputs.fingerprint }}` to `auto-fix-promote.mjs`.

**Warning signs:** The new outcome entry has `fingerprint: undefined` or `fingerprint: ''`. Phase 58 unit tests fail when the mock omits `--fingerprint`.

---

### Pitfall 3: Phase 53 `_skipCiGuard:\s*true` trust-invariant collision

**What goes wrong:** Phase 53 closure note pins the **non-comment** grep count of `_skipCiGuard:\s*true` at exactly 1 (line 434). Phase 58 adds 10–20 new lines around lines 440–446. If any of those new lines (or new comment text) inadvertently contains the literal pattern, the trust invariant breaks.

**Why it happens:** Auto-fix entries (Phase 56 style) include a comment trail explaining why a particular branch was taken. A comment like "// after _skipCiGuard:true returned exit 0" would collide.

**How to avoid:**
1. Do not use the literal string `_skipCiGuard:` followed by `true` in any new comment or code added in Phase 58. Verified count BEFORE Phase 58: `grep -cE '_skipCiGuard:\s*true' scripts/auto-fix-promote.mjs` returns 7 total (1 code + 6 comments). The trust invariant is the **NON-COMMENT** count == 1.
2. Recommend (Claude's Discretion item from CONTEXT) adding a Vitest pin: read the file, strip comment lines (heuristic: lines matching `^\s*//` or trailing-comment fragments via simple line-pre-scan), count `_skipCiGuard:\s*true`, assert == 1. Phase 53 closure relied on manual grep verification — promoting to executable is a small ADD with high payoff.

**Warning signs:** The recommended Vitest pin fails. Manual verification: `grep -nE '_skipCiGuard:\s*true' scripts/auto-fix-promote.mjs | grep -v "//"` returns more than one line.

---

### Pitfall 4: assertTripleGate body silent drift

**What goes wrong:** Phase 58 edits `auto-fix-promote.mjs` (adds import, adds main() insertions). A careless editor (Claude included) could reformat or restructure lines 89-103 during the edit, breaking the Phase 53 byte-unchanged invariant without an executable check.

**How to avoid:** PROMOTE-04 mandates an explicit Vitest delta assertion that pins the body. The verbatim-string approach (recommended over hash by CONTEXT discretion) gives a diff on failure that points exactly at what changed.

**Pinned body span:** lines 89–103 inclusive (15 lines starting at `export function assertTripleGate(...)` through the closing `}`). Byte count: 815. sha256: `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f`.

**Implementation hint:**
```javascript
// [PATTERN — Vitest body-pin via verbatim string]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.resolve(here, '../../scripts/auto-fix-promote.mjs'),
  'utf8',
);

// Extract from "export function assertTripleGate" through its matching "}"
// (15-line span; the body has no nested braces, so a line-based extract is safe).
const lines = source.split(/\r?\n/);
const startIdx = lines.findIndex((l) => l.startsWith('export function assertTripleGate'));
const body = lines.slice(startIdx, startIdx + 15).join('\n');

const EXPECTED_BODY = [
  "export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {",
  "  // Leg 1 — auto-fix:verified label on the merged PR.",
  "  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {",
  "    throw new Error(\"TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'\");",
  "  }",
  "  // Leg 2 — merged === true (the GitHub close webhook also fires for",
  "  // close-without-merge; this leg is what distinguishes them).",
  "  if (merged !== true) {",
  "    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');",
  "  }",
  "  // Leg 3 — source-issue carries triage (Phase 34 triage-classifier verdict).",
  "  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {",
  "    throw new Error(\"TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'\");",
  "  }",
  "}",
].join('\n');

expect(body).toBe(EXPECTED_BODY);
```

---

### Pitfall 5: IMPORTS POLICY comment-block grep regex escape

**What goes wrong:** The current audit grep at lines 28-29 is:
```
grep -nE "^import" scripts/auto-fix-promote.mjs |
  grep -vE "from 'node:|from './promote-from-quarantine\\.mjs'"
```
After Phase 58, the regex needs to add `../tests/e2e/lib/llm-ledger.js`. The `.` characters are regex metacharacters and must be escaped. The new regex string in the comment AND in any Vitest assertion must be correctly escaped — `\\.` for each literal dot.

**How to avoid:** Use this exact updated audit grep pattern:
```
grep -nE "^import" scripts/auto-fix-promote.mjs |
  grep -vE "from 'node:|from './promote-from-quarantine\\.mjs'|from '\\.\\./tests/e2e/lib/llm-ledger\\.js'"
```
And in JavaScript test code, escape backslashes for the string literal:
```javascript
const audit = source.match(/^import .+$/gm)
  .filter((line) =>
    !/from 'node:|from '\.\/promote-from-quarantine\.mjs'|from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'/.test(line)
  );
expect(audit).toEqual([]);
```

**Warning signs:** The Vitest enforcement test would fail with an unexpected match (the new `appendLedgerEntry` import) if the regex isn't updated correctly.

## Code Examples

### Adding the `--fingerprint` and `--error-class` argv flags

```javascript
// [PATTERN — extends the existing parseArgv at scripts/auto-fix-promote.mjs:269-354]
const KNOWN_FLAGS = new Set([
  '--pr', '--pr-labels', '--pr-merged', '--pr-body', '--pr-commit-message',
  '--source-issue', '--source-issue-labels', '--case-id',
  '--passing-cases',
  '--fingerprint',                                          // NEW Phase 58 PROMOTE-02/03
  '--error-class',                                          // NEW Phase 58 — a-b-winner.mjs needs this on the outcome entry
  '--help', '-h',
]);

// inside the for-loop switch:
case '--fingerprint':           fingerprint = takeValue(argv, i, tok); i++; break;
case '--error-class':           errorClass  = takeValue(argv, i, tok); i++; break;

// inside the return statement:
return {
  // ... existing fields ...
  fingerprint: fingerprint || null,                        // null if absent (defensive)
  errorClass: errorClass || null,                          // null if absent
};
```

### Outcome-success entry (insertion at line 442, AFTER the runPromote success check)

```javascript
// [PATTERN — inserts BETWEEN the existing `if (result.exitCode !== 0) {...exit(1);}` and
//  the existing `process.stdout.write(\`[auto-fix-promote] promoted ...\`)` at lines 443-446]
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: 'claude-sonnet-4-6',         // promote step is non-LLM; canonical default per CONTEXT
  cost_usd: 0,
  tokens_in: 0,
  tokens_out: 0,
  phase: '58-promote',                // distinguishes from upstream 'auto-fix-api' entries
  transport: 'subscription',          // promote step has no transport choice; canonical default
  issueId: `issue-${args.sourceIssue}`,
  prNumber: args.pr,
  fingerprint: args.fingerprint,
  errorClass: args.errorClass,
  source: 'auto-fix-promoted',        // PROMOTE-02 locked string
  outcome: 'pass',                    // PROMOTE-02 locked string
});
```

### Outcome-failure entry (insertion at line 439, BEFORE the existing process.exit(1) at line 440)

```javascript
// [PATTERN — inserts BETWEEN the `process.stderr.write(...)` at line 437-439 and
//  the existing `process.exit(1)` at line 440]
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: 'claude-sonnet-4-6',
  cost_usd: 0,
  tokens_in: 0,
  tokens_out: 0,
  phase: '58-promote',
  transport: 'subscription',
  issueId: `issue-${args.sourceIssue}`,
  prNumber: args.pr,
  fingerprint: args.fingerprint,
  errorClass: args.errorClass,
  source: 'auto-fix-failed',          // PROMOTE-03 locked string
  outcome: 'fail',                    // PROMOTE-03 locked string
  reason: `runPromote exitCode=${result.exitCode}`,
});
```

### Updated IMPORTS POLICY comment block (lines 21-30 replacement)

```javascript
// IMPORTS POLICY (Pitfall 6 — keep boundary clean):
//   ALLOWED:   node:*  AND  ./promote-from-quarantine.mjs
//              AND  ../tests/e2e/lib/llm-ledger.js  (Phase 58 PROMOTE-01:
//                    appendLedgerEntry only; the function body is byte-unchanged
//                    by Phase 56 invariant. ledger writes from this script run
//                    ONLY in CI per v40-auto-promote.yml — no leak surface.)
//   FORBIDDEN: tests/e2e/lib/*  EXCEPT llm-ledger.js (transport-confusion risk
//              on the v3.1 subscription-vs-SDK boundary for everything else)
//              src/*  (browser code)
//              any LLM driver
// Audit (Phase 58 PROMOTE-01 updated):
//   grep -nE "^import" scripts/auto-fix-promote.mjs |
//     grep -vE "from 'node:|from './promote-from-quarantine\\.mjs'|from '\\.\\./tests/e2e/lib/llm-ledger\\.js'"
//   MUST return zero matches. Enforced by tests/unit/auto-fix-promote-gate.test.js
//   (Phase 58-added describe block 'IMPORTS POLICY').
```

### New IMPORTS POLICY Vitest enforcement (added in tests/unit/auto-fix-promote-gate.test.js)

```javascript
// [PATTERN — new describe block, PROMOTE-01 enforcement]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

describe('IMPORTS POLICY (Phase 58 PROMOTE-01)', () => {
  it('allows only node:*, ./promote-from-quarantine.mjs, ../tests/e2e/lib/llm-ledger.js', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, '../../scripts/auto-fix-promote.mjs'),
      'utf8',
    );
    const importLines = source.match(/^import .+$/gm) || [];
    const forbidden = importLines.filter((line) =>
      !/from 'node:|from '\.\/promote-from-quarantine\.mjs'|from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'/.test(line)
    );
    expect(forbidden).toEqual([]);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No outcome entry written; a-b-winner.mjs stays in abstention forever | Event-sourced `auto-fix-promoted` / `auto-fix-failed` entries on each promote terminal | Phase 58 (this phase) | a-b-winner.mjs exits abstention automatically once ≥20 entries per ERROR_CLASS per arm accumulate (assuming errorClass IS on the outcome entry — see Pitfall 1) |
| `_skipCiGuard:true` grep count manually verified at Phase 53 close | Same, plus a recommended Vitest executable pin in Phase 58 (Claude's Discretion) | Phase 58 (recommended) | Trust invariant moves from "checked by humans at phase close" to "checked by `npm test` every commit" |
| IMPORTS POLICY enforced by a comment + manual audit | IMPORTS POLICY enforced by a new Vitest assertion (PROMOTE-01 — there is currently NO such assertion in any test file; CONFIRMED by grep) | Phase 58 | Adds a regression gate that catches any future drift |

**Deprecated/outdated:**
- CONTEXT.md's fingerprint sourcing assumption (PR body `<!-- fingerprint: ... -->`): there is no such marker in the PR body. Phase 58 uses a workflow-side `gh issue view` pre-resolution + new `--fingerprint` argv flag. See §2.
- CONTEXT.md's "tests/unit/auto-fix-promote-gate.test.js has 42 lines" claim: file is 323 lines (Phase 53 expanded it significantly). See §10.
- CONTEXT.md's assertTripleGate line range "67-81": actual range is 89-103. See §3.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `model: 'claude-sonnet-4-6'` is the right canonical default for the outcome entry's `model` field (the promote step has no LLM call) | Pattern 1, Code Examples | LOW — `a-b-winner.mjs:isAttributable()` requires `m.startsWith('claude-sonnet-4-6')` OR `m.startsWith('claude-opus-4-7')`. Sonnet is the project's "Tier-A default" arm; using it ensures the outcome entry is attributable. If the planner wants to instead reflect the model that handled the UPSTREAM fix attempt, the workflow could pass `--model` from the auto-fix ledger entry — but that requires a join the workflow isn't currently doing. Recommend `claude-sonnet-4-6` as the simplest correct answer. | [ASSUMED] |
| A2 | `phase: '58-promote'` is correct (distinguishes from upstream 'auto-fix-api') | Code Examples | LOW — `phase` is a free-form string already; tests don't assert specific values. The dashboard's per-phase aggregation will surface a new bucket. | [ASSUMED] |
| A3 | `transport: 'subscription'` is the right default (no LLM transport actually used) | Code Examples | LOW — the field is documented as optional; `combinedMonthlyTotalByTransport` defaults absent/null to 'subscription' (`tests/e2e/lib/llm-ledger.js:604-607`). Explicit 'subscription' is consistent. | [ASSUMED] |
| A4 | Failure entries should write ONLY on the `runPromote returned non-zero` path (line 440), NOT on the triple-gate failure paths (404, 419, 425) | Pitfall §8 below | MEDIUM — Argument: triple-gate failures are PRE-PROMOTION (the gate did its job and refused to run runPromote at all). Recording them as `outcome: 'fail'` muddies a-b-winner.mjs's signal about MODEL performance. The planner could legitimately decide to write them with a distinct `source: 'auto-fix-promote-gate-rejected'` instead (no `outcome` field, so a-b-winner.mjs ignores them; but the dashboard could still surface them). Either choice is defensible; this research recommends "only line 440 carries `source: 'auto-fix-failed', outcome: 'fail'`". | [ASSUMED] |
| A5 | Workflow pre-resolution of fingerprint + errorClass is the right design (vs. live `gh` lookup inside the script) | Architecture Map, Pitfall §2 | LOW — explicit invariant at scripts/auto-fix-promote.mjs:43-46 ("the script never makes its own gh calls"); confirmed by IMPORTS POLICY. | [VERIFIED: scripts/auto-fix-promote.mjs:43-46] |

## Open Questions (RESOLVED)

> All three open questions were resolved during planning and the Phase 58 Scope
> Adjustment log entries (2026-06-05 in CONTEXT.md). RESOLUTION lines below
> point at the durable artifact that closes each question.

1. **Should the planner gate Phase 58 on `--error-class` being added too?**

   **RESOLVED (2026-06-05):** Yes. Added to Phase 58 scope per CONTEXT.md
   "Phase 58 Scope Adjustment" log entry. `--error-class` is plumbed end-to-end
   in Plan 58-01 (script-side argv + validation + entry shape) and Plan 58-02
   (workflow-side pre-resolution from source-issue labels; 5-ERROR_CLASS
   whitelist; hard-fail on no match). PROMOTE-02 and PROMOTE-03 entry shapes
   in REQUIREMENTS.md were updated 2026-06-05 to include `errorClass`.
   - What we know: a-b-winner.mjs's `isAttributable` filter at lines 178-189 REQUIRES `entry.errorClass` to be a non-empty string. Outcome entries lacking it are dropped before reaching outcome detection.
   - What's unclear: CONTEXT.md / REQUIREMENTS.md do not explicitly mention `errorClass` on the outcome entry. They mention it only as a Phase 56 thing (on the upstream auto-fix entry).
   - Recommendation: **Add `--error-class` argv to Phase 58 scope.** Otherwise success-criterion #3 of milestone v4.2 ("a-b-winner.mjs exits abstention") cannot be achieved by Phase 58 + accumulation alone — a follow-up phase would be required. The cost of adding `--error-class` is trivial (one argv flag + one workflow line). The planner should mention this in their PLAN.md and either fold it into PROMOTE-02/03 scope OR raise it as a small follow-up.

2. **Should the IMPORTS POLICY comment-block edit also explicitly cite the Vitest assertion file path?**

   **RESOLVED:** Yes. Plan 58-01 Task 1.1 directive (e) requires the updated
   IMPORTS POLICY comment block to add a closing sentence pointing at
   `tests/unit/auto-fix-promote-gate.test.js` describe block
   `'IMPORTS POLICY (Phase 58 PROMOTE-01)'`. Future readers can find the
   executable assertion directly from the comment.

3. **Does the existing test mocking strategy work for `appendLedgerEntry`?**

   **RESOLVED:** Yes (with a structural fallback). Plan 58-01 Task 1.2
   directives (l)–(n) specify `vi.mock('../../tests/e2e/lib/llm-ledger.js', ...)`
   with a factory returning `{ appendLedgerEntry: vi.fn(), LEDGER_PATH: '/tmp/test-ledger.json' }`,
   matching the `tests/unit/auto-fix.test.js` precedent. The plan also
   permits a structural fallback (regex over source) for the O1/O2/O3 cases
   if the dynamic main() invocation proves brittle to mock — implementer
   discretion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | Runtime | ✓ | v24.11.1 | — |
| `node` built-ins (fs, path, url) | Both production and test | ✓ | bundled | — |
| Vitest | Test runner | ✓ (assumed; project's standard test framework — already runs `tests/unit/auto-fix-promote-gate.test.js` with 23 existing cases) | 3.x per Phase 56 stack | — |
| `gh` CLI | Workflow pre-resolution step (NOT the script — the workflow) | ✓ (GitHub Actions provides it) | — | — |
| `jq` | Workflow pre-resolution step (`--jq '.body'`) | ✓ (GitHub Actions provides it via `gh --jq`) | — | — |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (project pin per Phase 56 stack research) |
| Config file | `vitest.config.js` (project root; assumed present per existing test infrastructure) |
| Quick run command | `npx vitest run tests/unit/auto-fix-promote-gate.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMOTE-01 | IMPORTS POLICY allow-list contains only the three permitted patterns | unit | `npx vitest run tests/unit/auto-fix-promote-gate.test.js -t "IMPORTS POLICY"` | ✅ exists; Phase 58 ADDS the describe block |
| PROMOTE-02 | After mocked successful `runPromote`, ledger receives entry `{source:'auto-fix-promoted', outcome:'pass', ...}` | unit (with vi.mock) | `npx vitest run tests/unit/auto-fix-promote-gate.test.js -t "outcome entry"` | ✅ Phase 58 ADDS |
| PROMOTE-03 | After mocked `runPromote` returning exitCode 1, ledger receives entry `{source:'auto-fix-failed', outcome:'fail', reason, ...}` | unit (with vi.mock) | `npx vitest run tests/unit/auto-fix-promote-gate.test.js -t "failure entry"` | ✅ Phase 58 ADDS |
| PROMOTE-04 | assertTripleGate body verbatim string match (lines 89-103) | unit | `npx vitest run tests/unit/auto-fix-promote-gate.test.js -t "byte-unchanged"` | ✅ Phase 58 ADDS |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/auto-fix-promote-gate.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full `npm test` green before `/gsd:verify-work`

### Wave 0 Gaps
- None — `tests/unit/auto-fix-promote-gate.test.js` already exists (323 lines, 23 tests across 5 describe blocks). Phase 58 ADDS to the existing file — no new file creation, no shared fixtures needed.

## Security Domain

> security_enforcement section — Phase 58 is a small additive change to a CI-only script. ASVS exposure is minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — script runs only inside GitHub Actions; auth handled by `GITHUB_TOKEN` |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — no user-facing surface |
| V5 Input Validation | yes | `parseArgv` hand-rolled validator (existing pattern); new `--fingerprint` flag must validate the 12-hex format via `/^[0-9a-f]{12}$/` regex before writing to ledger (defense against argv tampering, mirrors PARTIAL-04 `passingCases` validation pattern at lines 156-160) |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for {scripts/auto-fix-promote.mjs}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Argv injection: a malicious `--fingerprint` flag containing shell metacharacters or HTML/JSON injection | Tampering | Validate `--fingerprint` against `/^[0-9a-f]{12}$/` before any use; reject with `process.exit(2)` mirrors the existing argv-error pattern |
| Argv injection: a malicious `--error-class` flag | Tampering | Optionally validate against the ERROR_CLASSES set imported from `tests/e2e/lib/error-codes.js` — BUT that import is FORBIDDEN by IMPORTS POLICY. Acceptable alternative: validate against `/^[A-Z_][A-Z0-9_]*$/` (the project's ERROR_CLASS naming convention) |
| Ledger entry corruption via large `reason` field | Tampering / DoS | Truncate `reason` to 200 chars before writing (matches the convention in `tests/e2e/lib/llm-ledger.js:683` for the `error` field) |

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `scripts/auto-fix-promote.mjs` (full file, 521 lines) — assertTripleGate body at lines 89-103; IMPORTS POLICY comment at lines 21-30; main() verified-branch at lines 387-447; failure-path inventory; `_skipCiGuard:\s*true` grep count
- `scripts/a-b-winner.mjs` (full file, 399 lines) — `isAttributable` filter at lines 178-189 (REQUIRES errorClass); `detectOutcome` at lines 231-238 (probes outcome:'pass'|'fail' first); `computePerClassPerArm` at 252-285
- `scripts/auto-fix.mjs` (lines 60-90 imports, lines 130-160 safeAppendLedger, lines 295-300 + 810-870 sample entry shapes, lines 220-245 extractFingerprint) — confirms `'../tests/e2e/lib/llm-ledger.js'` is the existing canonical import path for `appendLedgerEntry`; confirms entry-shape convention; confirms fingerprint regex format
- `scripts/build-auto-fix-pr-body.mjs` (full file, 80 lines) — CONFIRMS the PR body does NOT contain `<!-- fingerprint: ... -->`; contains `<!-- source_issue: N -->` + `<!-- affected_cases: ... -->` HTML comments only; markdown bullet `- fingerprint:` line is populated from `--fingerprint` argv (currently not passed by the workflow)
- `.github/workflows/v40-auto-fix.yml` lines 175-220 — CONFIRMS `build-auto-fix-pr-body.mjs` is invoked WITHOUT `--fingerprint`; PR body fingerprint bullet shows "unknown"
- `tests/e2e/lib/llm-ledger.js` lines 619-738 (`appendLedgerEntry` JSDoc + body) — confirms only `iso`, `model`, `cost_usd` are required; entry spread verbatim; documented additive fields include `issueId`, `prNumber`, `transport`
- `tests/e2e/lib/issue-payload-builder.js` lines 240-263 — fingerprint format is `<!-- fp: ${fingerprint} -->`, NOT `<!-- fingerprint: ... -->`; line 1 of issue body
- `tests/unit/auto-fix-promote-gate.test.js` (full file, 323 lines) — actual line count (NOT 42); 23 tests across 5 describe blocks; CONFIRMS no existing IMPORTS POLICY assertion
- `tests/e2e/.llm-spend-ledger.json` — only one entry today (Phase 39 bootstrap); fields: `iso`, `model`, `cost_usd`, `tokens_in`, `tokens_out`, `phase`, `transport`, `source`

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` Tension 5 — event-sourced new entry pattern (consistent with this research's findings) [CITED]
- `.planning/research/PITFALLS.md` Pitfall 3 — confirms a-b-winner needs errorClass+outcome both populated for abstention exit [CITED]
- `.planning/STATE.md` Phase 53/54 closure notes — assertTripleGate byte-unchanged invariant, `_skipCiGuard:\s*true` count=1 invariant [CITED]

### Tertiary (LOW confidence — none required)
- None.

---

## Detailed Findings Per Objective Question

### §1. `scripts/a-b-winner.mjs` `detectOutcome()` probe contract

[VERIFIED: scripts/a-b-winner.mjs, lines 178-238]

**Two filter layers exist:**

**Layer A — `isAttributable(entry)` (lines 178-189) — REQUIRED:**
```javascript
function isAttributable(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const m = entry.model;
  if (typeof m !== 'string') return false;
  if (!m.startsWith('claude-sonnet-4-6') && !m.startsWith('claude-opus-4-7')) {
    return false;
  }
  if (typeof entry.errorClass !== 'string' || entry.errorClass.length === 0) {
    return false;
  }
  return true;
}
```
**Verdict:** The OUTCOME ENTRY ITSELF must carry BOTH `model` (matching one of the two arm prefixes) AND a non-empty `errorClass` string. There is NO join to the upstream auto-fix entry — the filter is per-entry.

**Layer B — `detectOutcome(entry)` (lines 231-238) — probes for outcome value:**
```javascript
function detectOutcome(entry) {
  if (entry.outcome === 'pass') return true;
  if (entry.outcome === 'fail') return false;
  if (typeof entry.success === 'boolean') return entry.success;
  if (typeof entry.passed === 'boolean') return entry.passed;
  if (typeof entry.pr_merged === 'boolean') return entry.pr_merged;
  return null;
}
```
**Verdict:** `outcome: 'pass'` / `outcome: 'fail'` is the highest-priority probe. PROMOTE-02/03's locked string shape `outcome: 'pass'|'fail'` matches this contract perfectly.

**Phase 58 outcome-entry MINIMAL shape for a-b-winner.mjs to consume:**
```
{
  model: 'claude-sonnet-4-6'  OR  'claude-opus-4-7' (one of the two prefixes)
  errorClass: '<one of the 5 ERROR_CLASSES>'  (non-empty string)
  outcome: 'pass'  OR  'fail'
}
```

The fields `fingerprint`, `issueId`, `prNumber`, `reason` are NOT required by a-b-winner.mjs but ARE required by REQUIREMENTS.md PROMOTE-02/03.

---

### §2. Fingerprint location in PR body

[VERIFIED: scripts/build-auto-fix-pr-body.mjs:21-37, .github/workflows/v40-auto-fix.yml:182-187, tests/e2e/lib/issue-payload-builder.js:247-249]

**PR body structure (generated by `build-auto-fix-pr-body.mjs`):**
```
<!-- affected_cases: c1,c2,c3 -->
<!-- source_issue: N -->

Auto-fix draft PR for issue #N (`auto-fix/N-fp`).

## Routing
- error_class: `WRONG_CITATION`
- fingerprint: `unknown`        ← markdown bullet, default "unknown"
- fix_attempts: 1
- model: `claude-sonnet-4-6`
- ledger_iso: `unknown`

## Verification
Phase 41 verifier-gate runs on this PR. Affected case-ids on line 1 (do not edit).

Source issue: #N
```

**Critical findings:**
1. There is NO `<!-- fingerprint: ... -->` HTML comment in the PR body (anywhere).
2. There IS a markdown bullet `- fingerprint: \`<fp>\`` — but the workflow invocation at v40-auto-fix.yml:182-187 does NOT pass `--fingerprint`, so the default value `'unknown'` is used. The bullet always says "unknown" in production.
3. The fingerprint as `<!-- fp: ([0-9a-f]{12}) -->` exists ONLY in the SOURCE ISSUE BODY (line 1, per `tests/e2e/lib/issue-payload-builder.js:247-249`).

**Phase 58 must source the fingerprint from the SOURCE ISSUE via workflow pre-resolution:**
```yaml
- name: Pre-resolve source-issue fingerprint
  id: fp
  run: |
    FP=$(gh issue view ${{ steps.source.outputs.source_issue }} \
           --json body --jq '.body' \
         | grep -oE '<!-- fp: [0-9a-f]{12} -->' \
         | head -1 \
         | sed -E 's/<!-- fp: ([0-9a-f]{12}) -->/\1/')
    if [ -z "$FP" ]; then
      echo "::error::Could not extract fingerprint from issue #${{ steps.source.outputs.source_issue }}"
      exit 1
    fi
    echo "fingerprint=$FP" >> "$GITHUB_OUTPUT"
```

Then `auto-fix-promote.mjs` is invoked with `--fingerprint ${{ steps.fp.outputs.fingerprint }}`.

**Why not extract from PR body inside the script:** The script-purity invariant at scripts/auto-fix-promote.mjs:43-46 ("the script never makes its own gh calls. This keeps the script pure-CLI for Vitest mockability"). Adding a gh call would also violate IMPORTS POLICY in spirit (script becomes impure).

**Fallback regex if for some reason fingerprint MUST be extracted from PR body markdown bullet (NOT RECOMMENDED — currently always "unknown"):**
```javascript
const m = prBody.match(/^- fingerprint: `([0-9a-f]{12})`$/m);
```

---

### §3. `assertTripleGate` exact body bytes

[VERIFIED: scripts/auto-fix-promote.mjs:89-103]

**Line range:** 89-103 inclusive (15 lines).
**Byte count:** 815 bytes (via `awk 'NR>=89 && NR<=103' | wc -c`).
**SHA-256 of body (with line-ending preserved by awk):** `5311c1d5364b1b8558d44029432bfb0d5164c19fcc38b9b2d6fcd539c2e0c40f`

**Verbatim body for Vitest delta pin:**
```javascript
const EXPECTED_BODY = [
  "export function assertTripleGate({ prLabels, merged, sourceIssueLabels } = {}) {",
  "  // Leg 1 — auto-fix:verified label on the merged PR.",
  "  if (!Array.isArray(prLabels) || !prLabels.includes('auto-fix:verified')) {",
  "    throw new Error(\"TRIPLE_GATE_FAILED: prLabels — missing 'auto-fix:verified'\");",
  "  }",
  "  // Leg 2 — merged === true (the GitHub close webhook also fires for",
  "  // close-without-merge; this leg is what distinguishes them).",
  "  if (merged !== true) {",
  "    throw new Error('TRIPLE_GATE_FAILED: merged — pull request not merged');",
  "  }",
  "  // Leg 3 — source-issue carries triage (Phase 34 triage-classifier verdict).",
  "  if (!Array.isArray(sourceIssueLabels) || !sourceIssueLabels.includes('triage')) {",
  "    throw new Error(\"TRIPLE_GATE_FAILED: sourceIssueLabels — source issue missing 'triage'\");",
  "  }",
  "}",
].join('\n');
```

(CONTEXT.md's "lines 67-81" is incorrect — it likely referred to the partial-label decision-comment span that precedes the function.)

**Recommendation:** Verbatim string over hash (per CONTEXT discretion). The 15 lines are small; a string-mismatch failure message tells the operator EXACTLY what changed.

---

### §4. Correct relative import path for `appendLedgerEntry`

[VERIFIED: node -e import test passed; scripts/auto-fix.mjs:74 uses the same path]

**Path:** `'../tests/e2e/lib/llm-ledger.js'` (relative from `scripts/auto-fix-promote.mjs` to `tests/e2e/lib/llm-ledger.js`).

**Verification:**
- `node -e "import('./scripts/../tests/e2e/lib/llm-ledger.js').then(m => console.log('appendLedgerEntry:', typeof m.appendLedgerEntry, 'LEDGER_PATH:', typeof m.LEDGER_PATH))"` → `appendLedgerEntry: function LEDGER_PATH: string`
- `scripts/auto-fix.mjs:69-74` already imports from this exact relative path (same project, same convention)
- `path.relative('scripts/', 'tests/e2e/lib/llm-ledger.js')` → `'../tests/e2e/lib/llm-ledger.js'`

**Node 22+/24 ESM compatibility:** Yes — ESM-relative imports work identically in Node 22 and 24 (current runtime is 24.11.1).

**IMPORTS POLICY allow-list regex update:** Add `|from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'` to the audit grep. Full updated regex string for the JS test code:
```javascript
/from 'node:|from '\.\/promote-from-quarantine\.mjs'|from '\.\.\/tests\/e2e\/lib\/llm-ledger\.js'/
```
And the comment-block regex (with double-escaped backslashes in the comment text):
```
grep -vE "from 'node:|from './promote-from-quarantine\\.mjs'|from '\\.\\./tests/e2e/lib/llm-ledger\\.js'"
```

**Both `appendLedgerEntry` AND `LEDGER_PATH` must be imported** — the existing `appendLedgerEntry(ledgerPath, entry)` signature takes the path as the first argument. The project convention (per `auto-fix.mjs:71-73`) is to import both.

---

### §5. `tests/unit/auto-fix-promote-gate.test.js` current structure

[VERIFIED: full read of file, 323 lines]

**Actual line count:** 323 lines (NOT 42 as CONTEXT.md claimed). The "42-line baseline" in CONTEXT was likely either pre-Phase-53 OR a misread.

**Describe blocks (5 total):**
1. `'assertTripleGate (Phase 44)'` — lines 54-116, 6 tests (T1, T2, T3, T4, T5 — PARTIAL-04 trust invariant, T6 — co-presence)
2. `'assertPartialGate (Phase 53)'` — lines 124-207, 8 tests (P1-P8)
3. `'PARTIAL_THRESHOLD constant (Phase 53)'` — lines 217-227, 2 tests (T_thresh_1, T_thresh_2)
4. `'runPartialPromote (Phase 53)'` — lines 234-257, 3 tests (RP1, RP2, RP3)
5. `'parseSourceIssue (Phase 44)'` — lines 259-289, 4 tests (M1-M4)
6. `'parseArgv --passing-cases (Phase 53)'` — lines 298-322, 3 tests (PA1, PA2, PA3)

**Wait, that's 6 describe blocks. Let me recount: 6 describe blocks, 26 tests.**

**Mock setup patterns:** NONE — every test is a pure-function direct call (assertTripleGate, parseSourceIssue, parseArgv, runPartialPromote with dryRun:true). Zero `vi.mock` calls. zero `vi.spyOn`. This is intentional per the Phase 44 design: the script is pure-CLI and the helpers are pure functions.

**Existing imports:**
```javascript
import { describe, it, expect } from 'vitest';

import {
  assertTripleGate,
  assertPartialGate,
  runPartialPromote,
  parseSourceIssue,
  parseArgv,
  PARTIAL_THRESHOLD,
  PARTIAL_LABEL,
} from '../../scripts/auto-fix-promote.mjs';
```

**Phase 58 additions to this file (recommended):**
1. NEW describe block `'IMPORTS POLICY (Phase 58 PROMOTE-01)'` — 1 test, reads source via `readFileSync`, asserts allow-list compliance.
2. NEW describe block `'assertTripleGate body byte-unchanged (Phase 58 PROMOTE-04)'` — 1 test, reads source, extracts lines 89-103, asserts verbatim string match.
3. NEW describe block `'main() outcome ledger writes (Phase 58 PROMOTE-02/03)'` — 2-4 tests, USES `vi.mock` to mock both `./promote-from-quarantine.mjs` (for `runPromote`) AND `../../tests/e2e/lib/llm-ledger.js` (for `appendLedgerEntry`). Tests: (a) success path writes `{source:'auto-fix-promoted', outcome:'pass', ...}`, (b) failure path writes `{source:'auto-fix-failed', outcome:'fail', reason:..., ...}`, (c) failure path's entry includes the `reason` field, (d) success path's entry includes `prNumber`.
4. (Recommended Claude's Discretion) NEW describe block `'_skipCiGuard non-comment grep-count invariant'` — 1 test, reads source, strips comment lines, counts pattern == 1.
5. NEW vi.mock and supporting imports for the outcome-write tests. Since the rest of the file uses pure-direct calls, the mocks need to be carefully scoped — recommend putting outcome-write tests in a SEPARATE file (`tests/unit/auto-fix-promote-outcome.test.js`) to avoid mock contamination of existing pure tests. **Planner discretion:** new file vs. same file. Same-file is simpler if `vi.mock` factories are scoped correctly.

**No collisions:** No existing test name starts with "IMPORTS", "byte-unchanged", "outcome", or "_skipCiGuard". Phase 58 additions are namespace-clean.

---

### §6. `appendLedgerEntry` required-fields convention

[VERIFIED: tests/e2e/lib/llm-ledger.js:619-738]

**JSDoc-declared required fields (lines 629-632):** `iso`, `model`, `cost_usd`.

**Function body validation (lines 686-738):**
- Line 700: `m.invocations += 1` (always; no entry validation)
- Line 701: `const incrementUsd = Number.isFinite(entry?.cost_usd) ? entry.cost_usd : 0;` (handles missing/non-number)
- Line 705: `m.iterations.push(entry)` — **spread VERBATIM, no validation, no required-field check**

**Verdict:** The entry-shape contract is FULLY OPEN. Phase 58 can add any new fields (`source`, `outcome`, `reason`, etc.) without breaking existing tests. Phase 56 confirmed this by adding `errorClass` to 7 auto-fix.mjs sites with zero ledger-test failures.

**Convention from existing call sites (per scripts/auto-fix.mjs:419-432, 516-528, 672-686, etc.):**
```javascript
{
  iso: new Date().toISOString(),    // REQUIRED
  model: MODEL,                     // REQUIRED
  cost_usd: 0,                      // REQUIRED (project always populates, even if 0)
  tokens_in: 0,                     // Optional (always populated)
  tokens_out: 0,                    // Optional (always populated)
  phase: PHASE,                     // Optional (always populated)
  transport,                        // Optional (always populated)
  issueId: `issue-${issue}`,        // Optional (populated when known)
  prNumber,                         // Optional (populated when known)
  fingerprint,                      // Optional (populated when known)
  errorClass,                       // Optional (Phase 56 added)
  source: '<phase-tag>',            // Optional (always populated)
  // ... event-specific fields like flakeState, errorReason, outcome ...
}
```

The convention is "always populate the common fields with sensible defaults". Phase 58 should follow it: every outcome entry should have iso, model (default `'claude-sonnet-4-6'`), cost_usd:0, tokens_in:0, tokens_out:0, phase:`'58-promote'`, transport:`'subscription'`, issueId, prNumber, fingerprint, errorClass, source, outcome, and (for failure) reason.

---

### §7. Insertion point for SUCCESS entry (PROMOTE-02)

[VERIFIED: scripts/auto-fix-promote.mjs:431-447]

**Existing code:**
```javascript
// Line 431-435 — runPromote call
const result = await runPromote({
  id: args.caseId,
  confirm: true,
  _skipCiGuard: true,
});
// Line 436-441 — failure check
if (result.exitCode !== 0) {
  process.stderr.write(
    `[auto-fix-promote] runPromote returned exitCode ${result.exitCode} for case ${args.caseId}\n`,
  );
  process.exit(1);                                     ← PROMOTION FAILURE exit
}

// Line 443-446 — success log + exit
process.stdout.write(
  `[auto-fix-promote] promoted ${args.caseId} (source issue #${resolvedSourceIssue})\n`,
);
process.exit(0);                                       ← PROMOTION SUCCESS exit
```

**PROMOTE-02 insertion point:** Between line 441 (end of failure block) and line 443 (success log) — i.e., after line 441, before line 443. New code:
```javascript
// [PHASE 58 PROMOTE-02 — outcome entry on promote success]
appendLedgerEntry(LEDGER_PATH, {
  iso: new Date().toISOString(),
  model: 'claude-sonnet-4-6',
  cost_usd: 0,
  tokens_in: 0,
  tokens_out: 0,
  phase: '58-promote',
  transport: 'subscription',
  issueId: `issue-${args.sourceIssue}`,
  prNumber: args.pr,
  fingerprint: args.fingerprint,
  errorClass: args.errorClass,
  source: 'auto-fix-promoted',
  outcome: 'pass',
});
```

**Recommendation:** Write the entry BEFORE the stdout log so a crash in stdout (unlikely but possible — e.g., broken pipe) does not lose the entry. This matches the existing convention in auto-fix.mjs where ledger writes precede stdout/stderr.

---

### §8. Failure paths in `scripts/auto-fix-promote.mjs:main()` that should write a `auto-fix-failed` entry

[VERIFIED: scripts/auto-fix-promote.mjs:363-447]

**Inventory of `process.exit(1)` paths on the verified branch (lines 363-447):**

| Line | Path | Semantic | Recommendation |
|------|------|----------|-----------|
| 374 | `fs.readFileSync(args.prBodyPath)` failed | Setup error (cannot read PR body file) | **NO entry** — happens BEFORE any promote decision; not a model performance signal |
| 404 | `assertTripleGate` threw | Gate rejection PRE-PROMOTION | **NO entry recommended** — gate did its job and refused to promote. Recording as `outcome:'fail'` muddies a-b-winner.mjs's model-performance signal. Alternative: write with `source:'auto-fix-promote-gate-rejected'` (no `outcome` field) for dashboard observability, but that's outside REQUIREMENTS.md PROMOTE-03 scope. |
| 419 | `parseSourceIssue` threw | Gate rejection PRE-PROMOTION (cannot identify source issue) | **NO entry recommended** — same rationale as 404 |
| 425 | source-issue argv/parsed mismatch | Gate rejection PRE-PROMOTION (argv tampering defense) | **NO entry recommended** — same rationale as 404 |
| 440 | `runPromote` returned `exitCode !== 0` | Promotion attempt was made and FAILED MID-FLOW | **YES — write `{source:'auto-fix-failed', outcome:'fail', reason:'runPromote exitCode=${result.exitCode}', ...}`** — this is the documented "promotion failure" condition. CONTEXT.md explicitly recommends this as the minimum scope. |

**Argument for "line 440 only" (RECOMMENDED):** The semantic distinction is "did we ATTEMPT the promote?" Triple-gate failures are pre-attempt; runPromote-nonzero is post-attempt-failure. `outcome: 'fail'` should mean "the attempt happened and the LLM-driven fix did NOT survive the full pipeline" — that's the signal `a-b-winner.mjs` needs to compare model arms. Writing gate-rejection entries as `outcome:'fail'` would conflate "gate refused" (operator/triage problem) with "model produced a fix that doesn't work" (model problem).

**Argument for "all 5 paths" (NOT RECOMMENDED):** Observability completeness — every exit-1 path leaves a trail. Counter: the gate-rejection paths (lines 374, 404, 419, 425) should be observable via the `gh run` log, not via the ledger. The ledger is for model-performance signal.

**Planner decision:** Pick "line 440 only" per recommendation. If observability completeness is desired in a future phase, add gate-rejection entries with a DIFFERENT `source` tag (e.g., `'auto-fix-promote-gate-rejected'`) and NO `outcome` field — a-b-winner.mjs's filter at line 178-189 + line 260 will correctly skip them.

---

### §9. `_skipCiGuard:\s*true` grep invariant

[VERIFIED: scripts/auto-fix-promote.mjs current state]

**Total occurrences (including comments):** 7 lines via `grep -cE '_skipCiGuard:\s*true' scripts/auto-fix-promote.mjs`.
**Breakdown:**
- Line 7 (comment): "BEFORE calling the already-existing runPromote({_skipCiGuard:true}) from"
- Line 110 (comment): "invariant: the partial path runs WITHOUT the Phase 35 _skipCiGuard:true"
- Line 180 (comment): "trust invariant verbatim: \"_skipCiGuard:true\" never appears in this"
- Line 182 (comment): "only main()'s existing verified-branch retains the `_skipCiGuard: true`"
- Line 381 (comment): "gate + runPromote({_skipCiGuard:true}) path UNCHANGED; hasPartial takes"
- **Line 434 (CODE): `      _skipCiGuard: true,`**
- Line 452 (comment): "_skipCiGuard:true is NEVER reached on this branch."

**Phase 53 close-note pinned the NON-COMMENT count == 1.** Verified: line 434 is the only non-comment occurrence.

**Phase 58 must NOT introduce a second code-level occurrence.** The recommended (Claude's Discretion) Vitest pin:
```javascript
describe('_skipCiGuard:true grep-count invariant (Phase 53 + 58)', () => {
  it('exactly one non-comment occurrence of _skipCiGuard:\\s*true', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.resolve(here, '../../scripts/auto-fix-promote.mjs'),
      'utf8',
    );
    // Strip lines that are pure comments (whitespace + //...)
    const codeLines = source.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l));
    const matches = codeLines.filter((l) => /_skipCiGuard:\s*true/.test(l));
    expect(matches.length).toBe(1);
  });
});
```

**Edge case:** A code line with a TRAILING comment that contains `_skipCiGuard:true` (e.g., `foo();  // _skipCiGuard:true`) would falsely count. The above heuristic does NOT handle trailing comments. For Phase 58 simplicity, accept this as a known limitation — the file currently has no trailing comments matching the pattern, and Phase 58 introduces none.

**Stricter alternative:** Parse the file as JS using a lightweight tokenizer (e.g., regex-strip `// .*$` from each line first). The simpler heuristic above is sufficient.

---

### §10. `tests/e2e/.llm-spend-ledger.json` post-Phase-56 entry shapes

[VERIFIED: `jq` query against the live ledger]

**Current state (post Phase 56, on main):** Only ONE entry exists — the Phase 39 bootstrap entry. No auto-fix or auto-fix-promoted entries have been written yet (live UAT-47-a has not run successfully end-to-end).

```json
{
  "iso": "2026-05-31T16:03:31.594Z",
  "model": "claude-sonnet-4-6",
  "cost_usd": 0,
  "tokens_in": 0,
  "tokens_out": 0,
  "phase": "39-bootstrap",
  "transport": "sdk",
  "source": "phase-39-flip"
}
```

**Field convention observed:** 8 fields: `iso`, `model`, `cost_usd`, `tokens_in`, `tokens_out`, `phase`, `transport`, `source`. Phase 58 entries follow this base shape and add: `issueId`, `prNumber`, `fingerprint`, `errorClass`, `outcome`, (and for failure) `reason`.

**No risk of schema collision:** existing entry uses `source: 'phase-39-flip'` and `phase: '39-bootstrap'`. Phase 58 uses `source: 'auto-fix-promoted'` / `'auto-fix-failed'` and `phase: '58-promote'` — fully disjoint.

---

### Tension Resolution Summary (vs. CONTEXT.md)

| CONTEXT claim | Research finding | Action |
|---------------|------------------|--------|
| assertTripleGate body at lines 67-81 | Lines 89-103 (15 lines) | Use 89-103 in plan |
| tests/unit/auto-fix-promote-gate.test.js is 42 lines | 323 lines (Phase 53 expanded; 26 tests across 6 describe blocks) | Plan accordingly; recommend NEW describe blocks not collisions |
| Existing IMPORTS POLICY grep-based assertion | None — Phase 58 is the first to add one (CONTEXT.md correctly notes this elsewhere) | Plan ADDs the assertion |
| Fingerprint sourced from PR body `<!-- fingerprint: ... -->` | NOT in PR body; lives only in SOURCE ISSUE body as `<!-- fp: ([0-9a-f]{12}) -->`. PR body has only `<!-- source_issue: N -->` and `<!-- affected_cases: ... -->`. | Workflow pre-resolves via `gh issue view --json body` and passes via new `--fingerprint` argv flag |
| "through safeAppendLedger" in PROMOTE-02 | safeAppendLedger is module-internal to auto-fix.mjs; not exported | Use `appendLedgerEntry` directly (CONTEXT.md decision correctly overrides REQUIREMENTS.md wording) |
| errorClass already on upstream auto-fix entry; outcome entry doesn't need it | a-b-winner.mjs's `isAttributable` filter REQUIRES errorClass on the OUTCOME entry itself (no join to upstream) | Add `--error-class` argv flag (small scope addition) or accept that a-b-winner abstention exit is blocked by future phase |

## Metadata

**Confidence breakdown:**
- detectOutcome contract: HIGH — directly read scripts/a-b-winner.mjs lines 178-238 in full
- Fingerprint sourcing: HIGH — directly read scripts/build-auto-fix-pr-body.mjs and v40-auto-fix.yml; CONFIRMED `<!-- fingerprint: ... -->` does NOT exist in PR body
- assertTripleGate body: HIGH — verbatim extraction via awk; sha256 computed
- Import path: HIGH — Node import resolved; existing project convention confirmed via scripts/auto-fix.mjs:74
- Test file structure: HIGH — full read of 323-line file; CONTEXT.md "42 lines" claim CORRECTED
- appendLedgerEntry shape contract: HIGH — JSDoc + body read; spread-verbatim confirmed
- Failure path inventory: HIGH — full main() read; 5 exit(1) paths catalogued
- _skipCiGuard grep invariant: HIGH — verified non-comment count == 1 (line 434)
- Live ledger shape: HIGH — jq queried against actual committed file

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (30 days for stable in-tree research) OR until any of {scripts/auto-fix-promote.mjs, scripts/a-b-winner.mjs, scripts/build-auto-fix-pr-body.mjs, tests/e2e/lib/llm-ledger.js, .github/workflows/v40-auto-fix.yml, .github/workflows/v40-auto-promote.yml} is modified — whichever comes first.

## RESEARCH COMPLETE

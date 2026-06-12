---
phase: 64-heuristic-first-triage-extension
reviewed: 2026-06-09T12:25:00Z
depth: standard
commit: 973ff13
files_reviewed: 3
files_reviewed_list:
  - tests/e2e/lib/triage-classifier.js
  - tests/unit/triage-classifier.test.js
  - tests/e2e/specs/fault-injection.spec.js
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-06-09T12:25:00Z
**Depth:** standard
**Commit under review:** `973ff13`
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Diff is purely additive (+828 / -0 across 3 files; verified via `git diff --numstat`).
The two non-negotiable byte-stability invariants (VERIFIER_STRONG_AGREEMENT at line 43-44;
Rule 2 body lines 447-471) ARE preserved byte-for-byte — the diff hunk starts at
line 498 (inside the closing brace of Rule 3) with pure insertions. All 96 Vitest
tests pass (81 pre-existing + 15 new). Rule ordering does not interfere with Rules
1/2/3, and the "ambiguous-class deflector" rules sit BETWEEN Rule 3 close and Rule 4
ambiguous fallthrough as planned.

However, the implementation has multiple latent quality defects centered on the
**producer/consumer wiring claim** of TRIAGE-03 and on the **false-positive surface**
of the TRIAGE-02 mutator-aware regex. None rise to BLOCKER (no Tier-C-masking
regression, no syntax errors, no broken pre-existing tests), but four WARNINGs
should be addressed before relying on these heuristics in production triage
decisions.

## Warnings

### WR-01: TRIAGE-03 producer co-design writes `fault_injection_status` to a DIFFERENT file shape than the Rule 7 consumer reads — heuristic field is dead-on-arrival in production

**File:** `tests/e2e/specs/fault-injection.spec.js:180`
**File:** `tests/e2e/lib/triage-classifier.js:561`

**Issue:**
The "producer co-design" claim in the SUMMARY (line 50) and the PLAN (`key_links`
entry) asserts that `fault-injection.spec.js`'s `appendCase` call emits
`fault_injection_status` so that Rule 7's heuristic "has data to consume in CI".
That wiring is broken at the schema boundary:

- **Producer:** `fault-injection.spec.js:174-183` calls `appendCase(REPORT_PATH, {...})`.
  `REPORT_PATH = reportPathFor(RUN_ID)` resolves to `tests/e2e/artifacts/<runId>/report.json`
  (Phase 30 RPT-01 shape: `{cases: [...]}`). The new field lands inside a `cases[]`
  entry, NOT inside an `iterations[]` entry.

- **Consumer:** `triage-classifier.js:561` reads `iter.fault_injection_status` where
  `iter` is iterated from `inputLlmReport.iterations` — i.e., the
  `tests/e2e/artifacts/<runId>/llm-report.json` shape produced by
  `tests/e2e/lib/llm-report.js:appendLlmIteration` (Phase 31 LLM-08).
  `appendLlmIteration` has no path that copies the field from the RPT-01 cases
  report into the llm-report iterations.

Net effect: the producer writes the field where the consumer never looks. Rule 7's
`faultInjectionMatch` branch is permanent dead code in CI; only the
`iter.classification === 'WORKER_FALLBACK_FAILED'` fallback path can ever fire,
which would have fired identically without the Phase 64 producer co-design edit.

This invalidates the SUMMARY's "Threat T-64-04 → producer co-design wired"
mitigation narrative and contradicts the PLAN's must-have:

> "runTriage resolves WORKER_FALLBACK_FAILED heuristically when
> iter.fault_injection_status?.worker_fallback_failed === true ... (graceful
> degradation when the field is absent on legacy iter shape)"

The field is **always** absent on iter, not just "on legacy iter shape".

**Fix:**
Either (a) route `fault_injection_status` through an llm-report.json producer (the
Phase 30 spec writes to RPT-01; a downstream synthesizer that builds llm-report.json
iterations from cases would have to copy the field) — out of scope for Phase 64 but
should be tracked as a v4.4 producer-coupling phase; or (b) remove the
producer-co-design claim from SUMMARY/PLAN and downgrade Rule 7 to classification-only
until the upstream producer exists. The current state misleads anyone reading the
trust-boundary mitigation claims.

---

### WR-02: TRIAGE-02 regex contains two unanchored common-English-word alternatives (`\bmain\b`, `\barticle\b`) — high false-positive risk against arbitrary issue body text

**File:** `tests/e2e/lib/triage-classifier.js:535`

**Issue:**
The mutator-aware selector regex is:

```js
/(?:patent-result|section\[itemprop="claims"\]|\bmain\b|\barticle\b)/
```

The first two alternatives (`patent-result`, `section[itemprop="claims"]`) are
distinctive enough that accidental matches in unrelated issue bodies are unlikely.
The last two (`\bmain\b`, `\barticle\b`) are common English words that appear in
arbitrary issue prose:

```
"The main DOM tree changed unexpectedly" → matches
"News article reports that the page now uses..." → matches
"Main entry point at offscreen.js failed" → matches
```

In combination with the mutator marker — which itself is a structured 12-hex
fingerprint, hard to forge accidentally — the FALSE-POSITIVE failure mode is:
**an LLM-routed real-DOM-drift issue body that happens to mention the words
"main" or "article" alongside a Phase 61 mutator marker that landed there from
a separate synthetic injection in the same run will be heuristically classified
as synthetic when it is in fact real**. This is exactly the T-64-05 spoofing
threat the SUMMARY accepts as "Phase 61 marker is emitted by synthetic injection
only" — but the assumption only holds if the issue bodies for real and synthetic
runs never share text, which is not actually guaranteed (e.g., a single
issue-body assembler that concatenates a synthetic mutator's marker with a real
drift report's prose would fire the heuristic).

Plan's `specifics` section explicitly required: "TRIAGE-02 mutator-aware regex
MUST be cheap (no backtracking risk) — anchored alternation only." The current
regex is alternation-only and non-backtracking (no `.*` inside), so backtracking
is fine. But "anchored" was not enforced — `\b` is a word-boundary, not an
anchor, and matches `main` anywhere in the body.

**Fix:**
Tighten the last two alternatives to the literal Phase 61 mutator selector
syntax (which the mutator emits as a CSS selector token, not bare English):

```js
const hasDomDriftSelector = /(?:patent-result|section\[itemprop="claims"\]|selector\s+['"]?main['"]?|selector\s+['"]?article['"]?)/.test(iter.issue_body ?? '');
```

Or, since the mutator marker is the ground-truth signal, drop the selector check
entirely when the marker is present:

```js
const isMutatorInjected = hasMutatorMarker;  // marker alone proves synthetic origin
```

The "marker AND selector" gate as currently written adds false-positive surface
without strengthening the trust boundary, because anything carrying the marker
was emitted by the mutator regardless of which selector accompanies it.

---

### WR-03: Rule 7 classification fallback fires on `iter.classification === 'WORKER_FALLBACK_FAILED'` without checking `fault_injection_status: false`, potentially masking a recovered/passing iteration

**File:** `tests/e2e/lib/triage-classifier.js:560-577`

**Issue:**

```js
const faultInjectionMatch = iter.fault_injection_status?.worker_fallback_failed === true;
const wffClassMatch = iter.classification === 'WORKER_FALLBACK_FAILED';
if (faultInjectionMatch || wffClassMatch) { ... }
```

This is an `OR`. Consider an iteration where:
- `iter.classification === 'WORKER_FALLBACK_FAILED'` (a stale label from an earlier
  pass)
- `iter.fault_injection_status === { worker_fallback_failed: false }` (the spec
  re-ran and explicitly recorded that the fallback DID succeed this time)

Rule 7 still fires with `triage_confidence: 'heuristic_fault_injection'` and the
rationale "classification === WORKER_FALLBACK_FAILED" — silently overriding the
ground-truth signal from the additive producer field. This contradicts the
spirit of the SUMMARY's "Phase 30 fault-injection spec failed" root-cause
hypothesis, which the finding will print verbatim despite the producer reporting
success.

Symmetric concern for Rule 5: `extClassMatch || extReasonMatch` has the same
shape — a stale classification masks an error_reason that says otherwise. Less
risky there because EXTENSION_NOT_LOADED is more terminal, but the inconsistency
is worth noting.

**Fix:**
When the producer field is present with `worker_fallback_failed === false`,
explicitly fall through to ambiguous regardless of stale classification:

```js
if (iter.fault_injection_status?.worker_fallback_failed === false) {
  // Producer says fallback succeeded — do not heuristically resolve as failure.
  ambiguous.push(iter);  // or just `continue` past this rule
  continue;
}
const faultInjectionMatch = iter.fault_injection_status?.worker_fallback_failed === true;
const wffClassMatch = iter.classification === 'WORKER_FALLBACK_FAILED';
if (faultInjectionMatch || wffClassMatch) { ... }
```

---

### WR-04: `iter.issue_body` field consumed by Rule 6 has NO producer anywhere in the codebase — Rule 6 is dead code in production CI

**File:** `tests/e2e/lib/triage-classifier.js:534-551`

**Issue:**
A `grep -rn "issue_body"` across `scripts/`, `src/`, and `tests/e2e/lib/` shows
zero producer sites that assign `issue_body` to an iteration in `llm-report.json`.
The field appears only in:
- the new triage-classifier.js Rule 6 (consumer)
- the new triage-classifier.test.js cases (test fixtures that synthesize it)
- the issue-payload-builder.js / fix-prompt-builder.js files, where `<issue_body_untrusted>`
  is an XML tag in the LLM prompt envelope — unrelated to the `iter.issue_body`
  property the new rule reads.

The PLAN's `key_links` says Rule 6 reads `iter.issue_body`, and the SUMMARY
claims Rule 6 fires on the mutator marker AND a selector. In production CI,
`iter.issue_body` is always `undefined`, so `hasMutatorMarker` is always `false`
(empty string never matches the regex), and Rule 6 NEVER fires outside the
test file. Rule 6 thus joins Rule 7's `faultInjectionMatch` branch as
producer-orphaned code that contributes zero CI coverage growth.

This means the SUMMARY's "post-Phase-64 heuristic-resolvable count = 10" is a
test-fixture-only claim, not an in-CI claim. The 7→10 coverage growth is real
in the test fixture but fictional against real `llm-report.json` payloads.

**Fix:**
Either (a) document explicitly in SUMMARY/PLAN that Rules 6 and 7 require a
forthcoming producer phase to fire in CI (Phase 65 producer-wiring); or (b)
add an `issue_body` producer to `scripts/e2e-explore.mjs` / `tests/e2e/lib/llm-report.js`
that captures whatever payload the runtime had at iteration time. As-is, the
"3 new heuristic rules" claim collapses to 1 (EXTENSION_NOT_LOADED — which
reads `error_reason`, a field that DOES have a producer at
`scripts/e2e-explore.mjs:304`).

---

## Info

### IN-01: Pre-existing field-naming inconsistency: `iter.errorReason` (Rule 3) vs `iter.error_reason` (new Rule 5)

**File:** `tests/e2e/lib/triage-classifier.js:485` (pre-existing) vs `:508,519` (new)

**Issue:**
Rule 3 (`hypothesisMap.LLM_API_ERROR` template) reads `iter.errorReason` (camelCase).
The new Rule 5 reads `iter.error_reason` (snake_case). The producer
(`scripts/e2e-explore.mjs:304,367,399,540,555`) emits snake_case
(`error_reason`). So Rule 5 is correct against the live producer; Rule 3 has
a pre-existing reader bug that silently emits `'claude -p errored: unknown'` for
every LLM_API_ERROR iteration in production.

NOT introduced by Phase 64. Worth tracking as a separate cleanup phase. Phase 64
inadvertently exposed it by adding a second reader of the same field with the
correct name — a future contributor will notice the disagreement.

**Fix:** Out of Phase 64 scope; file a follow-up.

---

### IN-02: PLAN must-haves text describes Rule 5 regex as `/extension.*(not.*loaded|failed.*attach)/i` but implementation (and CONTEXT.md) use `/extension (?:not.*loaded|failed.*attach)/i`

**File:** `.planning/phases/64-heuristic-first-triage-extension/64-01-PLAN.md:16` (PLAN must_haves.truths)
**File:** `tests/e2e/lib/triage-classifier.js:508` (implementation)

**Issue:**
The PLAN's `must_haves.truths` entry for Rule 5b reads:

> "iter.error_reason matches the locked regex `/extension.*(not.*loaded|failed.*attach)/i`"

`extension.*` would match `extension foo bar not loaded` (with intermediate text).
The implementation and CONTEXT.md D-03 both use `extension ` (literal space) and
require the next word to be `not` or `failed`. Strings like `"extension activation
failure: not loaded"` would match the PLAN's wording but NOT match the implementation.

The test cases never exercise this gap because they use canonical phrases
(`"extension failed to attach to the active tab"`), so vitest is green. Not a
correctness bug, but the PLAN/SUMMARY don't agree with the code — future
contributors reading the planning artifact will get the wrong contract.

**Fix:** Update PLAN.md `must_haves.truths` to reflect the actual locked regex,
or relax the implementation to match the PLAN. Pick one; document in next phase.

---

### IN-03: T_NEW_RULES_NO_CONFIRMED_GATE_WITHOUT_VSA source-grep is brittle to single-line wrapping

**File:** `tests/unit/triage-classifier.test.js:1134-1150`

**Issue:**
The pin counts `rerunEntry?.verdict === 'CONFIRMED'` occurrences after stripping
comment-only lines. If a future contributor reformats Rule 2's condition such that
the CONFIRMED check lives on a different line than `VERIFIER_STRONG_AGREEMENT(...)`,
the pin still passes (it only verifies "exactly 1 CONFIRMED-gate exists" and
"VERIFIER_STRONG_AGREEMENT is called somewhere in the file") — it does NOT
verify those two literals live inside the SAME `if (...)` condition. A
malicious refactor could split Rule 2 across two `if` blocks where the
CONFIRMED branch lacks the VSA call, and the test would still pass.

The companion `T_RULE2_BODY_UNCHANGED` does catch this because it pins the
literal block, but if Rule 2 is ever refactored intentionally and the pin updated,
the safety net narrows to a string-occurrence count which is not equivalent to
the Pitfall 6 invariant.

**Fix:**
Tighten the pin to verify same-if-condition co-occurrence:

```js
// Match the entire if-condition expression around CONFIRMED and check VSA is inside.
const ifBlock = noComments.match(/if\s*\([^)]*rerunEntry\?\.verdict === 'CONFIRMED'[^)]*\)/);
expect(ifBlock).not.toBeNull();
expect(ifBlock[0]).toMatch(/VERIFIER_STRONG_AGREEMENT\(/);
```

This is a hardening suggestion; current pin is sufficient against accidental
refactor + greenfield test-update workflows but weak against deliberate refactors.

---

## Verified Against Specific Concerns

| Concern | Verdict |
|---|---|
| 1. TRIAGE-02 regex uses BOTH marker AND selector; real drift falls through; non-backtracking | Marker+selector AND-gate verified at line 536. No catastrophic backtracking risk (alternation-only, no nested `.*`). BUT selector regex has false-positive surface from `\bmain\b`/`\barticle\b` — see WR-02. |
| 2. Rule ordering: Rules 5/6/7 between Rule 3 and Rule 4 | Verified at lines 501-578; Rule 4 (`ambiguous.push(iter)`) remains the final rule at line 582. New rules do NOT consume ambiguous-class cases that Rule 4 should classify because each new rule's predicate is narrowly typed to one classification. |
| 3. VERIFIER_STRONG_AGREEMENT body at line 43 BYTE-UNCHANGED | Verified via `git diff` — first hunk starts at line 498. Confirmed BYTE-UNCHANGED. |
| 4. Rule 2 body (lines 447-471) BYTE-UNCHANGED | Verified — diff starts at line 498, well after Rule 2's closing brace. |
| 5. Heuristic coverage assertion contains exactly 10 expected classes | Verified at `triage-classifier.test.js:1230-1241` — frozen array has the 7 pre-existing + 3 new = 10 elements; pre-existing list includes FLAKE, WRONG_CITATION, VERIFIER_DISAGREE, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR, HARNESS_ERROR, PASS. |
| 6. `fault_injection_status` producer site is additive only | Verified — diff shows single new property line at `fault-injection.spec.js:180`, no removals. However, the additive emission targets the WRONG report shape — see WR-01. |

---

_Reviewed: 2026-06-09T12:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

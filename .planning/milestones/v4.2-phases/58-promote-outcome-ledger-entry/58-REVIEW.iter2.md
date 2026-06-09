---
phase: 58-promote-outcome-ledger-entry
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - scripts/auto-fix-promote.mjs
  - tests/unit/auto-fix-promote-gate.test.js
  - .github/workflows/v40-auto-promote.yml
  - tests/e2e/scripts/v40-auto-promote-yaml.test.js
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: findings_present
---

# Phase 58: Code Review Report

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** findings_present

## Summary

Phase 58 wires outcome ledger writes (`appendLedgerEntry`) into the verified
success/failure paths of `scripts/auto-fix-promote.mjs`, threads three new argv
flags (`--fingerprint`, `--error-class`, `--model`) through the workflow, and
pre-resolves all three values upstream of the script via gh/jq lookups with
hard-fail guards. The IMPORTS POLICY block was extended to allow
`../tests/e2e/lib/llm-ledger.js`. The unit-test suite gained 9 cases pinning
the imports policy, the assertTripleGate body via sha256-like verbatim
comparison, the `_skipCiGuard:true` non-comment count, argv extension, and
structural regex pins of the two ledger-entry blocks. The YAML suite gained 10
PHASE-58-Y* assertions covering the three new pre-resolution steps + the three
argv flags + the parameterized jq lookup + the hard-fail on missing model.

The implementation looks correct on the happy CI path. Three classes of issue
surfaced during adversarial review:

1. A pre-existing argv bug in `takeValue` that the Phase 58 wiring does not
   introduce but does not address either — `--passing-cases ""` (which the
   workflow ALWAYS emits on the verified-only path because
   `PARTIAL_PASSING_CASES=""` at YAML line 151) causes `takeValue` to exit 2
   BEFORE any Phase 58 ledger write ever runs. This is load-bearing for every
   verified-only auto-promote CI run.
2. A semantic gap in the new ledger-entry shape: `issueId` is computed from
   `args.sourceIssue` (which may be `null` when `--source-issue` is omitted)
   rather than from the validated `resolvedSourceIssue`. Asymmetric with the
   log message on line 532, which DOES use `resolvedSourceIssue`. The CI
   workflow protects this by always passing `--source-issue`, but the bug is
   latent for direct CLI invocations and contradicts the script's own
   defense-in-depth claim at lines 462-466.
3. The partial path (`hasPartial` branch, lines 537-583) writes ZERO outcome
   ledger entries on success or failure. If `a-b-winner.mjs` is to attribute
   partial-promote outcomes, those entries will never appear in the ledger.
   The test O3 enforces exactly 2 `appendLedgerEntry(LEDGER_PATH, ...` calls,
   pinning this gap into place. Surfacing as a Warning because the deviation
   note describes Phase 58 as wiring promote outcomes uniformly — the partial
   asymmetry deserves an explicit design decision.

The `args.model || 'claude-sonnet-4-6'` soft default is acknowledged in the
deviation note. I rate it Info, not a Blocker — the workflow's PHASE-58-Y9/Y10
pins + the upstream hard-fail mean the soft default is unreachable in CI. The
hardcoded `tests/e2e/.llm-spend-ledger.json` path in the workflow's jq lookup
(bypasses `E2E_LEDGER_PATH_OVERRIDE`) is a minor consistency concern, also
Info because override is forbidden in CI.

No critical security issues. The new argv validators are tight (12-hex,
`/^[A-Z_][A-Z0-9_]*$/`, model startsWith allowlist). The errorClass workflow
step uses string-equality against a fixed allowlist (no globbing, no command
substitution). The fingerprint workflow step constrains the capture to 12-hex
in the sed regex. The jq lookup uses parameterized `--arg fp` (not
interpolation).

## Warnings

### WR-01: Verified-only path always passes `--passing-cases ""` which `takeValue` rejects with exit 2

**File:** `scripts/auto-fix-promote.mjs:293-300` (pre-existing); triggered by `.github/workflows/v40-auto-promote.yml:151,280` (Phase 58 territory because workflow is on the changed-file list).

**Issue:** `takeValue` rejects an empty-string flag value with exit 2:
```javascript
if (next === undefined || next === '' || next.startsWith('--')) {
  process.stderr.write(`[auto-fix-promote] missing value for ${flag}\n`);
  process.exit(2);
}
```
The workflow unconditionally passes `--passing-cases "$PARTIAL_PASSING_CASES"`. On the verified-only path, `PARTIAL_PASSING_CASES=""` (workflow line 151 default, never reassigned because the `auto-fix:partial-verified` label is absent). Bash preserves the empty quoted argument:
```
$ node -e 'console.log(process.argv)' -- --passing-cases "" --case-id c1
[ ..., '--passing-cases', '', '--case-id', 'c1' ]
```
Result: every verified-only auto-promote workflow run will hard-fail at parseArgv with `[auto-fix-promote] missing value for --passing-cases` and exit 2, BEFORE assertTripleGate, BEFORE runPromote, and BEFORE the new Phase 58 ledger writes. This makes the Phase 58 outcome wiring unreachable on the verified path in CI.

This is technically pre-existing from Phase 53 (the workflow line + the takeValue check predate this phase), but it is the most consequential bug visible in the four reviewed files. Phase 58's failure-path ledger write depends on this code path executing.

**Fix:** Either (a) loosen `takeValue` so empty-string is a valid value for CSV flags:
```javascript
function takeValue(argv, i, flag) {
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) {
    process.stderr.write(`[auto-fix-promote] missing value for ${flag}\n`);
    process.exit(2);
  }
  return next; // empty string acceptable for CSV-shaped flags
}
```
or (b) make the workflow omit the flag when empty:
```yaml
PARTIAL_ARG=""
if [ -n "$PARTIAL_PASSING_CASES" ]; then
  PARTIAL_ARG="--passing-cases $PARTIAL_PASSING_CASES"
fi
node scripts/auto-fix-promote.mjs ... $PARTIAL_ARG ...
```
Option (a) is simpler and aligns with how the parser already CSV-decodes the empty string into `[]` (parseArgv line 405-407 handles the empty CSV correctly). Recommend (a) plus a Vitest pin: `parseArgv([...REQUIRED, '--passing-cases', ''])` returns `passingCases: []`.

### WR-02: Ledger `issueId` uses `args.sourceIssue` (may be null) instead of validated `resolvedSourceIssue`

**File:** `scripts/auto-fix-promote.mjs:504, 524`

**Issue:** Both ledger writes use `issueId: \`issue-${args.sourceIssue}\``. `args.sourceIssue` is the raw argv value (may be `null` when `--source-issue` is omitted — see parseArgv line 397). The validated id is `resolvedSourceIssue`, computed via `parseSourceIssue` and cross-checked against `args.sourceIssue` ONLY when the latter is non-null (line 476). If `--source-issue` is omitted entirely, `args.sourceIssue` stays null, `resolvedSourceIssue` is the trusted truth, and the ledger gets `issueId: "issue-null"`. The success log message on line 532 uses `resolvedSourceIssue` — exposing the asymmetry.

In CI this is masked because `.github/workflows/v40-auto-promote.yml:277` always passes `--source-issue "$SOURCE_ISSUE"`. But the script's comment at lines 462-466 explicitly documents "If --source-issue is absent, parseSourceIssue is the sole source of truth" — the ledger write directly contradicts this contract.

**Fix:** Use `resolvedSourceIssue` for `issueId` on both writes. Move the validation block above the runPromote call so `resolvedSourceIssue` is in scope (it already is). Then:
```javascript
issueId: `issue-${resolvedSourceIssue}`,
```
Update unit test O1/O2 accordingly:
```javascript
expect(block).toMatch(/issueId:\s*`issue-\$\{resolvedSourceIssue\}`/);
```

### WR-03: Partial path writes ZERO outcome ledger entries; test O3 pins this gap in place

**File:** `scripts/auto-fix-promote.mjs:537-583`; `tests/unit/auto-fix-promote-gate.test.js:438-442`

**Issue:** The `hasPartial` branch in main() calls `assertPartialGate`, `parseSourceIssue`, and `runPartialPromote`, but does NOT call `appendLedgerEntry` on either success or failure. Meanwhile the verified branch writes outcome entries on both success (line 516) and failure (line 496). The test O3 codifies this asymmetry:
```javascript
const matches = source.match(/\bappendLedgerEntry\(LEDGER_PATH,/g) || [];
expect(matches.length).toBe(2);
```

`a-b-winner.mjs:178-189` (`isAttributable`) filters ledger entries by `model` + `errorClass`. Partial promotes carry the same model arm + error class as verified promotes — their outcomes are exactly the per-(class, arm) data points a-b-winner needs to converge. By omitting partial-path entries, the ledger systematically under-counts attempts in proportion to the partial-verified PR rate, biasing per-class pass-rate estimates toward verified-only outcomes (which are >=5/5 by construction; partial is 4/5).

**Fix:** Either (a) write outcome entries on the partial path too (success entry per case in `runPartialPromote`, failure entry on halt — and update O3 to expect `>= 2` or a larger fixed count), or (b) document explicitly in the IMPORTS POLICY comment block that Phase 58 wiring is verified-path-only, and have an issue tracking the partial-path wiring as future work. If (a), prefer writing entries inside `runPartialPromote` so the per-case granularity matches the verified path's per-invocation granularity. The deviation note is silent on this — surface the design decision explicitly.

## Info

### IN-01: `args.model || 'claude-sonnet-4-6'` soft default duplicates allowlist literal

**File:** `scripts/auto-fix-promote.mjs:498, 518`

**Issue:** The soft default `args.model || 'claude-sonnet-4-6'` is unreachable in CI (workflow PHASE-58-Y10 hard-fails before invocation; PHASE-58-Y9 pins absence of literal sonnet defaults at the workflow layer). The deviation note acknowledges this as defense-in-depth. The Info finding is that:
- The string `'claude-sonnet-4-6'` is duplicated in three places (lines 383, 498, 518) and referenced by `startsWith` in the validator. If the model nomenclature ever shifts, three call sites drift.
- The defense-in-depth intent ("if direct CLI invocation omits --model") silently mis-attributes the ledger entry to sonnet when the omission may actually be opus. An explicit `throw new Error('PROMOTE_LEDGER_FAILED: --model required')` is more honest defense-in-depth than a silent sonnet default.

**Fix (optional, non-blocking):** Either fail-closed on missing model (matching the workflow's hard-fail philosophy) or hoist the default to a `const DEFAULT_MODEL_ARM` near the top of the file so all three references resolve from one source.

### IN-02: Workflow jq lookup hardcodes `tests/e2e/.llm-spend-ledger.json`, bypassing `E2E_LEDGER_PATH_OVERRIDE`

**File:** `.github/workflows/v40-auto-promote.yml:240`

**Issue:** The model-resolution jq query reads from a hardcoded path:
```yaml
MODEL=$(jq -r --arg fp "$FINGERPRINT" '...' tests/e2e/.llm-spend-ledger.json)
```
Meanwhile the script (via `LEDGER_PATH` from `llm-ledger.js`) honors `E2E_LEDGER_PATH_OVERRIDE` for test-only ledger relocation. The two paths can diverge if the override env is set anywhere. In CI, the ledger module forbids the override (`llm-ledger.js:88`), so the divergence cannot fire in CI. Worth noting for future test harnesses that simulate CI but exercise this workflow.

**Fix (optional):** Either hoist the path into an env var both consumers reference, or accept the hardcoded path with a comment noting CI-only semantics and the override forbiddenness.

### IN-03: `reason: (\`runPromote exitCode=${result.exitCode}\`).slice(0, 200)` has unneeded parens

**File:** `scripts/auto-fix-promote.mjs:510`

**Issue:** Template literals do not need parenthesization for `.slice` to bind correctly: \`tpl\`.slice(...) parses identically to (\`tpl\`).slice(...). The parens are noise.

**Fix:** Drop the parens:
```javascript
reason: `runPromote exitCode=${result.exitCode}`.slice(0, 200),
```
(Cosmetic; would also require relaxing the test O2 regex on line 434, which expects the literal `\(?` optional paren.)

### IN-04: Workflow `for L in ${SOURCE_ISSUE_LABELS//,/ }` is unquoted word-split

**File:** `.github/workflows/v40-auto-promote.yml:215`

**Issue:** The shell loop word-splits the comma-replaced labels CSV. The whitelist (`KNOWN_CLASSES`) is all UPPER_SNAKE — no spaces — so a space-containing label could never match. Still, the unquoted expansion is fragile: a label string like `"Wrong Citation"` would split into two tokens and silently fail to match either. If GitHub label conventions ever shift to space-containing values, this loop becomes a silent no-match path that falls through to the `[ -z "$EC" ]` hard-fail. Defensible as-is, but a comment explaining the intent would help.

**Fix (optional, non-blocking):** Convert to an array-aware split or add a comment:
```bash
# SOURCE_ISSUE_LABELS is CSV of GitHub label names. We word-split on space
# AFTER replacing comma with space. This relies on KNOWN_CLASSES being
# UPPER_SNAKE (no spaces) and source-issue labels following the same
# convention. Space-containing labels would split here and silently miss.
```

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 59-fixture-mutator-4-uat-re-sweep
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - tests/e2e/scripts/inject-defect.mjs
  - tests/e2e/scripts/e2e-inject-defect.test.js
  - scripts/quarantine-append.mjs
  - tests/e2e/scripts/e2e-quarantine-append.test.js
  - scripts/auto-fix-promote.mjs
  - tests/unit/auto-fix-promote-gate.test.js
  - .github/workflows/v40-auto-promote.yml
  - tests/e2e/scripts/v40-auto-promote-yaml.test.js
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: findings_present
---

# Phase 59: Code Review Report

**Reviewed:** 2026-06-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** findings_present

## Summary

Phase 59 ships three nominally independent edits (the fixture-mutator CLI + its
quarantine-side co-design, and the `--phase` argv expansion threaded through
`auto-fix-promote.mjs` + `v40-auto-promote.yml`). Decision C and the MUTATOR-04
suppression invariants are wired correctly at the script-side parseArgv +
entry-shape pin layers; PHASE-59 contract tests are present at every layer they
claim to cover; the MUTATOR-04 suppression has both a positive and negative
control (G9-a / G9-b) and the `_skipCiGuard:true` count invariant is preserved.

However, the **workflow-side workflow_dispatch path (the entire operator-facing
trigger for Decision C UAT runs) is non-functional**. The job-level `if:` filter
admits workflow_dispatch events without any pull_request payload, and the very
next step (`Parse PR body + labels + source issue`) calls
`gh pr view "$PR_NUMBER"` with `PR_NUMBER=""`. Operators cannot exercise the new
UAT path the milestone advertises (CR-01).

Additionally, the fixture-mutator's `verifyWorkingTreeClean` runs **after** the
GitHub issue is created and **before** the cleanup-evidence file is written, so
a tripped FORBIDDEN_PATHS gate creates an orphaned synthetic issue with no
cleanup record — the exact T-59-03 + T-59-05 outcome the manifest is supposed
to prevent (CR-02).

Two warnings concern the `vars.PHASE_TAG` foot-gun on the normal pull_request
path, the absence of unknown-flag rejection in `inject-defect.mjs` parseArgs,
the workflow_dispatch concurrency-group collapse, and the broad startsWith()
discriminator for synthetic suppression.

## Critical Issues

### CR-01: workflow_dispatch trigger is non-functional — parse step crashes on empty PR_NUMBER

**File:** `.github/workflows/v40-auto-promote.yml:91-97, 119-133`

**Issue:** The job-level `if:` filter (line 91-97) admits `workflow_dispatch`
events unconditionally:

```yaml
if: |
  github.event_name == 'workflow_dispatch' || (
    github.event.pull_request.merged == true && (...)
  )
```

But every step downstream of the gate consumes `github.event.pull_request.*`
fields that do not exist for a `workflow_dispatch` event. The first step that
trips this is `Parse PR body + labels + source issue`:

```yaml
env:
  PR_NUMBER: ${{ github.event.pull_request.number }}   # empty string for workflow_dispatch
run: |
  PR_JSON=$(gh pr view "$PR_NUMBER" --json body,labels,number)   # fails: "the value of 'number' must be a number"
```

Concretely:
- `gh pr view ""` exits non-zero with stderr `accepts 1 arg(s), received 0` or
  similar.
- Even if `PR_NUMBER` were tolerated, the subsequent `<!-- affected_cases: ... -->`
  grep against the (empty) BODY fails the `[ -z "$CASE_IDS_CSV" ]` check and the
  step exits 1.

The entire SWEEP-05 / Decision C feature (operator-driven UAT runs that tag
ledger entries with `phase: '56-uat'`) cannot be exercised through the only
trigger advertised in `RESEARCH.md` and the PHASE_TAG input. PHASE-59-Y1 and
PHASE-59-Y2 assert the trigger and if-filter shapes but never assert any
end-to-end behaviour past the gate, so the contract tests pass while the
feature is dead on arrival.

Additionally, on the workflow_dispatch path:
- The `concurrency.group` becomes `v40-auto-promote-` (empty suffix at line 65),
  so all operator UAT runs collapse into a single global serialization group.
- The post-merge verifier step (line 401-407) would check out an unrelated
  `origin/main` HEAD and run `verify-single-case.mjs --case "<empty>"`.
- The `Build auto-promote PR body` step would emit nonsensical text and `cpr@v8`
  would open an auto-promote PR for an unrelated source-issue scraped from
  `git log -1` on main.

**Fix:** Either (preferred) gate every PR-dependent step on
`github.event_name != 'workflow_dispatch'` and provide an alternative UAT code
path that does not depend on a real merged PR, or split the UAT entry-point
into a separate workflow file. A minimal patch to expose the failure is:

```yaml
# .github/workflows/v40-auto-promote.yml — add an early sanity check
- name: Reject workflow_dispatch without PR context (UAT not yet implemented)
  if: github.event_name == 'workflow_dispatch'
  run: |
    echo "::error::workflow_dispatch path is not yet wired end-to-end; see Phase 59 CR-01" >&2
    exit 1
```

A real fix requires either:
1. A UAT-only sub-workflow that synthesizes the affected_cases / source_issue
   from inputs (the operator passes them as workflow_dispatch inputs alongside
   PHASE_TAG), OR
2. A new input `PR_NUMBER:` on the workflow_dispatch trigger so the operator
   names which merged PR to re-promote.

Without one of these, PHASE-59-Y1 / Y2 / Y3 pass without ever exercising the
runtime path the change purports to enable.

---

### CR-02: inject-defect.mjs creates GitHub issue BEFORE FORBIDDEN_PATHS gate, orphaning the synthetic issue on dirty trees

**File:** `tests/e2e/scripts/inject-defect.mjs:378-399`

**Issue:** `main()` sequences:

```js
collisionCheckOrAbort({ fp });                  // pre-flight
const body = buildBody({ fp, caseId, seed, errorClass });
const { issueNum } = createIssue({ caseId, errorClass, body });  // SIDE EFFECT: GitHub issue created
verifyWorkingTreeClean({ phaseDir });           // T-59-03 gate — runs AFTER the side effect
emitCleanupEvidence({ ... });                   // SIDE EFFECT: cleanup manifest appended
```

If the operator runs the mutator with a dirty working tree (anything other than
`<phaseDir>/56-MUTATOR-CLEANUP.md` modified), `verifyWorkingTreeClean` exits 1.
At that point:
1. The synthetic `triage`-labeled GitHub issue is already live and will be
   picked up by `v40-auto-fix.yml` within the cron window.
2. The cleanup-evidence manifest (`56-MUTATOR-CLEANUP.md`) was NOT updated, so
   there is no `Run` section with the `gh issue close N --reason "not planned"`
   command for this issue. The script's own stdout success line never prints
   (line 396), so the operator may not even know the issue number.
3. The fingerprint is now claimed by an open issue, so a re-run of the mutator
   with the same seed + error-class hits `collisionCheckOrAbort` and HARD ABORTS
   — leaving the operator stuck without an automated way to recover.

This precisely defeats T-59-03 ("FORBIDDEN_PATHS mutation — MITIGATED by
`verifyWorkingTreeClean` (runtime gate)") and T-59-05 ("Orphaned synthetic state
— MITIGATED by append-only `56-MUTATOR-CLEANUP.md` manifest"). Calling it a
"gate" is misleading when it runs after the gated-against side effect.

**Fix:** Move `verifyWorkingTreeClean` ahead of `createIssue`, OR — if the
intent is to allow the cleanup file write itself to be the one allowed change
— write the cleanup-evidence header skeleton first, then run the gate, then
create the issue, then append the run section. Minimal correct sequencing:

```js
export function main(argv = process.argv) {
  const { seed, errorClass, phaseDir } = parseArgs(argv);
  const caseId = `synthetic-${seed}`;
  const fp = computeFingerprint({ seed, errorClass });
  verifyWorkingTreeClean({ phaseDir });   // PRE-flight, before any side effect
  collisionCheckOrAbort({ fp });          // network pre-flight
  const body = buildBody({ fp, caseId, seed, errorClass });
  const { issueNum } = createIssue({ caseId, errorClass, body });
  emitCleanupEvidence({ phaseDir, issueNum, fp, seed, errorClass, sourceTag: SOURCE_TAG });
  process.stdout.write(`[inject-defect] issue #${issueNum} created with fingerprint ${fp}\n`);
  process.exit(0);
}
```

(I7 happens to pass today because its hermetic tmp git repo is created clean
inside `beforeEach`, so the post-creation gate never fires. The test does not
exercise the dirty-tree path that triggers the orphan, so this defect is
invisible from Vitest output.)

## Warnings

### WR-01: `vars.PHASE_TAG` fallback creates a silent ledger-corruption foot-gun on normal pull_request runs

**File:** `.github/workflows/v40-auto-promote.yml:295`

**Issue:** The `Triple-gate + runPromote` step env block uses a three-way
fallback:

```yaml
PHASE_TAG: ${{ github.event.inputs.PHASE_TAG || vars.PHASE_TAG || '' }}
```

For pull_request events, `github.event.inputs.PHASE_TAG` is null, so the chain
falls through to `vars.PHASE_TAG`. If an operator has ever set a repository
variable named `PHASE_TAG` (for any reason — testing, debugging, a forgotten
SWEEP runbook step), every subsequent normal-production auto-promote run will
silently emit `--phase <vars-value>` and tag the ledger entry with the operator's
old value rather than the intended `58-promote` default.

The comment at line 293 acknowledges this ("legacy SWEEP runbook support") but
does not warn that this overrides the empty-default path. The
script-side parseArgv regex `/^[a-zA-Z0-9_-]+$/` happily accepts a stale value
like `56-uat`, `temp`, `wip`, etc., and the resulting ledger entries are
indistinguishable from legitimately-tagged UAT entries — silently breaking
a-b-winner.mjs per-phase attribution for all downstream analysis.

PHASE-59-Y3 only asserts the dual-path expression's syntactic shape (line 359);
it does not assert that the fallback degrades safely.

**Fix:** Drop `vars.PHASE_TAG` from the fallback chain, OR add a guard that
rejects `vars.PHASE_TAG` when the trigger is `pull_request`:

```yaml
PHASE_TAG: ${{ (github.event_name == 'workflow_dispatch' && (github.event.inputs.PHASE_TAG || vars.PHASE_TAG)) || '' }}
```

The current shape is also load-bearing for CR-01 (vars.PHASE_TAG is the only
non-input way to get a non-empty PHASE_TAG into the step), so this fix should
be co-designed with CR-01's resolution.

---

### WR-02: inject-defect.mjs parseArgs silently ignores unknown flags

**File:** `tests/e2e/scripts/inject-defect.mjs:80-145`

**Issue:** The parseArgs loop has explicit `if`/`else if` branches for `--seed`,
`--error-class`, `--phase-dir`, and `--help`, but the closing brace of the loop
silently drops any unknown token. There is no `else { process.stderr.write(...); process.exit(2); }` clause.

Consequence: typos like `--seeds mutator-X`, `--errorclass GOOGLE_DOM_DRIFT`, or
`--phasedir /tmp/x` are silently ignored, and the script falls through to its
defaults (`seed='mutator-seed-1'`, `errorClass='GOOGLE_DOM_DRIFT'`,
`phaseDir='.planning/phases/59-fixture-mutator-4-uat-re-sweep'`). The mutator
then files a synthetic issue against THE REAL phase directory, not the operator's
intended target, AND uses the default seed — which is precisely the
fingerprint another operator might already hold. Combined with the
collision-check timing window, this is a quiet way to either tag the wrong
manifest or contend on a default fingerprint.

The sibling script `scripts/auto-fix-promote.mjs` already gets this right via
`KNOWN_FLAGS.has(tok)` (line 348-351). The convention is established; this
script omits it.

**Fix:** Mirror auto-fix-promote.mjs's known-flags reject pattern:

```js
const KNOWN_FLAGS = new Set(['--seed', '--error-class', '--phase-dir', '--help', '-h']);

for (let i = 2; i < argv.length; i++) {
  const tok = argv[i];
  // ... existing equals-syntax rejects + flag handlers ...
  // Add a terminal else:
  else if (!KNOWN_FLAGS.has(tok)) {
    process.stderr.write(`[inject-defect] unknown flag: ${tok}\n`);
    process.exit(2);
  }
}
```

No test currently asserts unknown-flag rejection; consider adding I9 to mirror
auto-fix-promote-gate.test.js PA1-PA3 style.

---

### WR-03: collisionCheckOrAbort + createIssue is racy under concurrent invocation

**File:** `tests/e2e/scripts/inject-defect.mjs:181-211, 248-271`

**Issue:** `collisionCheckOrAbort` performs a GH search, sees no open issue with
the fingerprint, and returns. The script then calls `createIssue`. Between
those two operations there is an unbounded network-latency window during which
a concurrent mutator invocation (same seed + error-class) can also pass the
check, and both processes will then create issues with the same fingerprint.

For UAT (single operator, manual invocation) this is unlikely. But the
fingerprint is **deterministic** for `(seed, errorClass)` pairs, and the
default `seed='mutator-seed-1'` + `errorClass='GOOGLE_DOM_DRIFT'` is what every
operator gets when they invoke `node tests/e2e/scripts/inject-defect.mjs` with
no args. Two operators (or a script + a forgotten background invocation) hitting
the defaults at the same minute can spawn two `<!-- fp: same-12-hex -->` issues,
which then both feed the auto-fix loop with overlapping fingerprints — exactly
the T-59-02 DoS the collision-check was meant to prevent.

The threat model claims (line 18-19): "MITIGATED by `collisionCheckOrAbort`
(hard abort, exit code 2, not a warning)." This is only true for serial
re-invocation, not for concurrent invocation.

**Fix:** Either (a) document this limitation in the comment block and rely on
operator discipline + the `56-MUTATOR-CLEANUP.md` manifest to detect duplicate
issues post-hoc, or (b) embed a randomized salt (e.g. process.pid + timestamp)
into the seed to make concurrent collisions impossible — at the cost of losing
seed-based determinism.

(b) is incompatible with the threat-model wording. (a) is probably correct, but
the comment should be honest about the race.

---

### WR-04: quarantine-append.mjs MUTATOR-04 suppression uses broad startsWith()

**File:** `scripts/quarantine-append.mjs:225-226`

**Issue:** The MUTATOR-04 discriminator is:

```js
const isFixtureMutator = typeof finalEntry.source_triage_finding_id === 'string'
  && finalEntry.source_triage_finding_id.startsWith('fixture-mutator-uat-47b');
```

`startsWith` is BROADER than equals. Any future synthetic-tagged corpus entry
whose `source_triage_finding_id` happens to begin with the literal
`fixture-mutator-uat-47b` (regardless of whether it actually came from this
mutator, or whether it is a non-UAT real failure) will be silently denied the
promotion label. The comment at line 219-224 calls this "co-designed" but
does not call out the prefix-vs-equals risk.

Specifically:
- A real triage report whose `run_id` is `fixture-mutator-uat-47b-extension-2026`
  (or any future runbook that chooses a longer name with this prefix) would
  produce `source_triage_finding_id: 'fixture-mutator-uat-47b-extension-2026-iter-N'`
  which slips through the gate.
- A future Phase 6X UAT that picks a similar but distinct tag (e.g.
  `fixture-mutator-uat-47b-v2`) inherits the suppression by accident.

The blast radius is bounded (real promotions never carry this prefix today),
but the test design (G9-a + G9-b) only verifies exact-prefix vs. obviously-
different prefixes. A future operator naming choice could trip this silently.

G9-a's positive case happens to use `fixture-mutator-uat-47b-iter-1` (exact
match minus the iter suffix), so the test does not pin "equals" vs.
"startsWith" semantics either way.

**Fix:** Tighten the discriminator to equals after the `-iter-` strip:

```js
const isFixtureMutator = typeof finalEntry.source_triage_finding_id === 'string'
  && /^fixture-mutator-uat-47b-iter-\d+$/.test(finalEntry.source_triage_finding_id);
```

And add a G9-c test asserting that `fixture-mutator-uat-47b-something-else-iter-N`
DOES get the label (proves the discriminator is exact, not prefix).

## Info

### IN-01: inject-defect.mjs createIssue returns unused `url` field

**File:** `tests/e2e/scripts/inject-defect.mjs:269-270`

**Issue:** `createIssue` returns `{ issueNum, url }`. The caller (line 384)
destructures only `{ issueNum }`. The `url` field is computed but never
consumed. Either remove `url` from the return shape or surface it on stdout
alongside the issue number (the SWEEP-03/SWEEP-04 runbooks the stdout line
serves might find the URL useful).

**Fix:** Either drop the field or emit it on the success line:

```js
process.stdout.write(
  `[inject-defect] issue #${issueNum} (${url}) created with fingerprint ${fp}\n`,
);
```

---

### IN-02: v40-auto-promote.yml workflow_dispatch concurrency group collapses to single shared lock

**File:** `.github/workflows/v40-auto-promote.yml:64-66`

**Issue:** `concurrency.group: v40-auto-promote-${{ github.event.pull_request.number }}`
resolves to `v40-auto-promote-` (empty suffix) on workflow_dispatch. With
`cancel-in-progress: false`, all concurrent operator UAT runs serialize through
a single global lock. This is operationally tolerable but unintended.

Dependent on CR-01 — if workflow_dispatch is split into a separate workflow
file or properly gated with PR_NUMBER input, the concurrency group should
include that identifier.

**Fix:** When CR-01 is addressed, use a more specific group key for the dispatch
path:

```yaml
group: v40-auto-promote-${{ github.event.pull_request.number || github.run_id }}
```

---

### IN-03: e2e-inject-defect.test.js I7 does not exercise the dirty-tree branch that CR-02 depends on

**File:** `tests/e2e/scripts/e2e-inject-defect.test.js:210-228`

**Issue:** I7 ("FORBIDDEN_PATHS gate") creates a fresh hermetic tmp git repo
in `beforeEach`, runs the mutator, and asserts the working tree stays clean.
This proves the cleanup file lives outside the repo (good), but does not
exercise the case where `git status --porcelain` returns a violating entry.

Because the test never trips `verifyWorkingTreeClean`, it cannot detect the
CR-02 ordering defect: the synthetic issue would be created and the script
would exit 1 before `emitCleanupEvidence`, but the I7 assertion `expect(r.status).toBe(0)`
would still pass (the test runs a clean tree). When CR-02 is fixed, add an I7b
case that pre-stages a violating file (`echo "junk" > random.txt` in
tmpGitRepoDir, then `git add random.txt`) and asserts:
- `r.status` is 1 (dirty-tree exit code per line 306).
- `transcriptPath` contains NO `issue create` line (proves the gate ran
  BEFORE the side effect, not after).

**Fix:** Add an I7b case once CR-02 is resolved:

```js
it('I7b: dirty working tree exits 1 BEFORE issue create (CR-02 regression pin)', () => {
  fs.writeFileSync(path.join(tmpGitRepoDir, 'junk.txt'), 'forbidden');
  execSync('git add junk.txt', { cwd: tmpGitRepoDir });
  const r = spawnInject(['--seed', 'mutator-seed-1', '--error-class', 'GOOGLE_DOM_DRIFT', '--phase-dir', phaseDirOverride]);
  expect(r.status).toBe(1);
  const transcript = fs.existsSync(transcriptPath) ? fs.readFileSync(transcriptPath, 'utf8') : '';
  expect(transcript).not.toMatch(/issue create/);
});
```

---

_Reviewed: 2026-06-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

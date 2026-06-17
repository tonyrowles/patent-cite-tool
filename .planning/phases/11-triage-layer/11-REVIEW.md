---
phase: 11-triage-layer
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - scripts/report-classifier.mjs
  - scripts/gh-client.mjs
  - scripts/ingest-reports.mjs
  - scripts/review-reports.mjs
  - scripts/e2e-report-issue.mjs
  - .github/workflows/v61-ingest-reports.yml
  - tests/unit/report-classifier.test.js
  - tests/unit/gh-client.test.js
  - tests/unit/ingest-reports.test.js
  - tests/unit/ingest-reports-wrangler-guard.test.js
  - tests/unit/v61-ingest-reports-yaml.test.js
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 11 triage layer: the heuristic classifier, the shared `gh` CLI
client, the maintainer ingest orchestrator, the GitHub Actions workflow, and the
five unit suites.

The headline shell-command-injection threat surface is mostly mitigated for the
*ingest* path — title/labels are built from `patentNumber` (server-validated to
`^[A-Za-z0-9]{6,20}$` at `worker/src/index.js:206`), the 4-value frozen `category`
enum, and a hardcoded label — so no attacker-controlled free-text reaches the
shell command string today, and the body travels via `--body-file -` stdin. That
said, three serious defects remain:

1. **Dedup-marker / markdown injection into Issue bodies** (CR-01) — the body
   interpolates `note`, `selectionText`, and `returnedCitation` raw and unfenced.
   These KV fields receive **zero** server-side content validation (`buildKvRecord`
   stores them as `body.x || null`). A malicious `note` can embed a forged
   `<!-- kv-key: ... -->` marker that poisons `findExistingIssueByKvKey`, silently
   suppressing the promotion of *other* legitimate reports.
2. **Workflow `dry_run` input is a complete no-op** (CR-02) — the maintainer-facing
   "Dry run" toggle does nothing; Issues are still created and KV still mutated.
3. **`async main()` is invoked un-awaited** (CR-03) — async failures become unhandled
   rejections, exit code stays 0, and the artifact is never emitted, so CI stays
   green on real failures.

The escaping pattern in the shared `gh-client.mjs` is fragile (escapes only `"`),
several over-suppression / NaN-cap robustness gaps exist, and the `repo` parameter
is accepted but never used.

## Critical Issues

### CR-01: Unsanitized `note`/`selectionText`/`returnedCitation` enable dedup-marker poisoning and markdown injection into Issue bodies

**File:** `scripts/ingest-reports.mjs:154,160,165` (with root cause at `worker/src/index.js:234-247` and `scripts/gh-client.mjs:93-99`)
**Issue:**
`buildReportIssueBody` interpolates three attacker-controlled, server-unvalidated
KV fields directly into the Markdown body with no fencing or escaping:

```js
`| Returned citation | \`${record.returnedCitation ?? '(none)'}\` |`,   // L154
record.selectionText != null ? `**Selected text:** ${record.selectionText}` : null,  // L160
(record.note && record.note.trim()) ? `**User note:** ${record.note}` : null,        // L165
```

`worker/src/index.js:buildKvRecord` persists these fields verbatim (`body.note || null`,
`body.selectionText || null`, `body.returnedCitation || null`) — only `patentNumber`,
`category`, and `extensionVersion` are validated. So `note` is arbitrary attacker text.

**Dedup-poisoning exploit (the worst case):** A malicious report A submits
`note = "<!-- kv-key: report:<victimFp>:<victimTs> -->"`. When A is promoted, its
Issue body now contains the *victim's* canonical marker. Later, when the genuine
victim report B is processed, `promoteRecord` builds B's canonical kvKey and calls
`findExistingIssueByKvKey(victimKey)`, which runs `listWithSearch(victimKey)` then
`all.find(i => i.body.includes(marker))`. A's issue body matches → B is classified
`skip-dedup` and **never filed**, and B's KV status is silently flipped to `triaged`.
An attacker can thus suppress promotion of any report whose `(fingerprint,timestamp)`
they can guess or observe. The threat-model note T-11-03 claims "the marker is
constructed from server-computed fingerprint+timestamp, not user free-text" — that
is true for the *search key*, but NOT for the *body content being searched*, which is
where the poisoning lives.

Even absent the dedup attack, raw `note`/`selectionText` allow ordinary Markdown/HTML
and link injection into maintainer-facing Issues (the e2e sibling deliberately wraps
its `reason` field in a code fence for exactly this reason — T-29-02-2 at
`scripts/e2e-report-issue.mjs:262-265`; this new body builder dropped that control).

**Fix:** Neutralize the HTML-comment opener in all free-text fields before
interpolation, AND wrap free-text in a fenced code block (matching the e2e pattern).
Breaking the opening `<!--` is the load-bearing control — with no opener, GitHub never
enters comment context, so a forged kv-key cannot render or be authoritative:

```js
// Break the HTML-comment opener so user text cannot forge a kv-key marker.
const safe = (s) => String(s).replaceAll('<!--', '< !--');

// ...
`| Returned citation | \`${record.returnedCitation != null ? safe(record.returnedCitation) : '(none)'}\` |`,
record.selectionText != null ? `**Selected text:**\n\n\`\`\`\n${safe(record.selectionText)}\n\`\`\`` : null,
(record.note && record.note.trim()) ? `**User note:**\n\n\`\`\`\n${safe(record.note)}\n\`\`\`` : null,
```

Note that code-fencing alone does NOT stop the poisoning: `findExistingIssueByKvKey`
matches `body.includes(marker)` against the raw body string regardless of Markdown
rendering, so the `<!--`-breaking rewrite (or storing the canonical key somewhere users
cannot influence) is mandatory.

Additionally, harden the dedup check: `findExistingIssueByKvKey` should only treat a
marker as authoritative if it appears in a builder-controlled metadata region (e.g. an
issue label, or the first line of the body before any user-content section).

### CR-02: Workflow `dry_run` input is never honored — Issues are created and KV is written even when "Dry run" is selected

**File:** `.github/workflows/v61-ingest-reports.yml:46,60-61` (and `scripts/ingest-reports.mjs`, which has no `process.env.DRY_RUN` reference)
**Issue:**
The workflow exposes a `dry_run` boolean input and exports it as `DRY_RUN: ${{ inputs.dry_run }}`,
but the run step is `node scripts/ingest-reports.mjs` with **no `--dry-run` flag**, and
`ingest-reports.mjs` only consults `args.dryRun` (the CLI flag) — it never reads
`process.env.DRY_RUN` (grep confirms zero references). A maintainer who selects
"Dry run (no Issues created, no KV writes)" in the GitHub UI will nonetheless create
live `report-fix-candidate` Issues and mutate production KV records to `triaged`/`wontfix`.
This is a data-/action-integrity failure: the control that exists specifically to prevent
side effects has no effect.

**Fix:** Either translate the env var into the flag in the workflow, or honor the env var
in the script. Workflow fix:

```yaml
      - name: Run ingest-reports
        run: node scripts/ingest-reports.mjs ${{ inputs.dry_run && '--dry-run' || '' }}
```

Or, more robustly, in `parseArgs`/`main` treat `process.env.DRY_RUN === 'true'` as
equivalent to `--dry-run`:

```js
out.dryRun = out.dryRun || process.env.DRY_RUN === 'true';
```

### CR-03: `async main()` invoked without `await` — async failures become unhandled rejections (exit 0, no error, no artifact)

**File:** `scripts/ingest-reports.mjs:446-453`
**Issue:**
```js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));   // main is `async` — promise is NOT awaited
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
}
```
`main` is declared `async` (line 294) and `await`s `promoteRecord`, `getRecord`,
`loadReports`, `writeStatus`, and gh calls inside it. The CLI guard was copied
"verbatim" from `review-reports.mjs`, whose `main` is **synchronous** — so the copy is
wrong here. A synchronous `try/catch` only catches throws that happen before the first
`await`. Any failure during the async loop (a `gh` error, a `wrangler` error, a KV
write failure) rejects the un-awaited promise: the `catch` block never runs,
`process.exit(1)` is never called, the process exits 0, the `✖` message never prints,
and `emitArtifact` (line 423/433) is never reached — so the workflow's
`if-no-files-found: error` upload step is the *only* thing that fails, masking the real
cause. CI can also report success on a partially-failed run.

**Fix:**
```js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  });
}
```
Also move `emitArtifact(artifactEntries)` into a `finally`/error path so the audit
artifact is written even on partial failure (the L422 comment promises "always, even
on partial failure paths" but the call only runs on the happy path).

## Warnings

### WR-01: `gh-client.mjs` shell-escaping only handles `"` — backticks, `$()`, `;`, `&` pass through (latent injection in shared module)

**File:** `scripts/gh-client.mjs:113-118,133-135`
**Issue:**
`createIssueWithLabels` and `addLabel` build the shell command string with
`title.replaceAll('"', '\\"')` and `label.replaceAll('"', '\\"')`. Inside a
double-quoted shell context, `"` is not the only dangerous metacharacter — backticks
(`` ` ``) and `$(...)` are still interpreted, enabling command substitution if any
caller ever passes unsanitized text. Today the ingest path is safe only because the
title is built from server-validated `patentNumber`/`category` and labels are a
hardcoded literal, and the e2e path pre-sanitizes via `sanitizeCaseId`/`ERROR_CLASSES`
clamping. This is a fragile invariant in a *shared* module whose JSDoc advertises it as
the place that handles escaping (T-11-01). One future caller that forgets to pre-sanitize
reintroduces RCE.
**Fix:** Pass title and labels as argv rather than interpolating into a shell string —
use `execFileSync('gh', ['issue', 'create', '--title', title, '--label', label, '--body-file', '-'], { input: body })`. This removes the shell entirely and matches the safer
`execFileSync` pattern already used in `review-reports.mjs:137`.

### WR-02: `isPostFixSuppressed` substring search can over-suppress unrelated patents

**File:** `scripts/gh-client.mjs:159,174`
**Issue:**
Both suppression queries use `--search '${escaped} in:body'`, which performs a
substring/full-text match. A short patent number (e.g. `US1234`) substring-matches a
body containing `US12345`, and `isWithinCutoff` then suppresses the report. Because
suppression flips the record straight to `wontfix` (`ingest-reports.mjs:363`), a
collision permanently dismisses a legitimate bug with no Issue and no second look.
**Fix:** Match on a delimited token (e.g. search for the exact rendered cell
`` `US{patentNumber}` `` or embed a canonical `<!-- patent: {n} -->` marker the builder
controls and match that), and/or verify the candidate's body contains a word-boundary
match before suppressing.

### WR-03: `--max-fixes` with a non-numeric value silently disables the per-run cap (COST-02 bypass)

**File:** `scripts/ingest-reports.mjs:106,298,376`
**Issue:**
`parseArgs` sets `out.maxFixes = Number(rest.shift())`. A non-numeric value yields
`NaN`. In `main`, `args.maxFixes ?? MAX_FIXES_PER_RUN` keeps `NaN` (it is neither
`null` nor `undefined`), and `autoPromotedCount >= NaN` is always `false`, so the cap
never triggers and auto-promotion is unbounded — defeating the COST-02 safety cap.
**Fix:** Validate the parsed number and fail closed:
```js
case '--max-fixes': {
  const n = Number(rest.shift());
  if (!Number.isInteger(n) || n < 0) throw new Error('--max-fixes must be a non-negative integer');
  out.maxFixes = n;
  break;
}
```

### WR-04: Artifact not emitted on the error path despite the "always" comment

**File:** `scripts/ingest-reports.mjs:422-427`
**Issue:**
The comment at L422 states the artifact is emitted "always, even on partial failure
paths (TRI-07)", but `emitArtifact(artifactEntries)` is only called after the loop
completes normally. If any iteration throws (gh/wrangler/KV failure), the artifact is
never written, and the workflow's `if-no-files-found: error` (yaml L70) turns a partial
run into a hard upload failure with the entries collected so far discarded. Combined
with CR-03, the real failure is doubly obscured.
**Fix:** Wrap the loop body in try/catch (collecting a failure entry) or move
`emitArtifact` into a `finally` block so the partial audit trail always persists.

### WR-05: `repo` parameter accepted but never used; JSDoc misrepresents behavior

**File:** `scripts/gh-client.mjs:53,56` (and callers `scripts/ingest-reports.mjs:305`, `scripts/e2e-report-issue.mjs:484`)
**Issue:**
`makeKvReportGhClient(repo)` takes a `repo` argument whose JSDoc says it is "passed to
gh via env/config", but no method ever references `repo` — every `gh` invocation relies
on the ambient repository (gh resolves it from the checked-out git remote / `GH_REPO`).
The workflow sets `GITHUB_REPOSITORY` but `gh` does not read that variable (`gh` uses
`GH_REPO`); it works in CI only because `actions/checkout` configures the git remote.
This is a misleading API: a caller passing a different `repo` would silently operate on
the wrong (ambient) repository.
**Fix:** Either thread `repo` into each command via `gh --repo "${repo}" ...`
(argv-escaped) for explicitness, or drop the parameter and document that the client
operates on the ambient repo. Set `GH_REPO` in the workflow to make the target explicit.

### WR-06: A single bad record aborts the whole run instead of being skipped

**File:** `scripts/ingest-reports.mjs:345-420,312,316`
**Issue:**
In the `list` loop, a single `getRecord`/`writeStatus`/gh exception thrown mid-iteration
aborts triage for *all* remaining records and (per CR-03/WR-04) drops the artifact. One
malformed or unreadable KV record should not be able to halt processing of the rest of
the queue.
**Fix:** Wrap per-record processing in try/catch, record a `promotion_decision: 'error'`
artifact entry for the failed record, and continue the loop.

## Info

### IN-01: Double blank line possible in Issue body when all optional sections are absent

**File:** `scripts/ingest-reports.mjs:156-167`
**Issue:** When `selectionText`, golden note, quarantine note, and `note` are all
null/filtered, the body has two adjacent `''` entries (L156 and the `''` before the
kv-key marker, L166), producing a double blank line. Cosmetic only.
**Fix:** Collapse consecutive blank lines after `.filter`, or build the optional block
separately and join with single separators.

### IN-02: `reviewStatus` import in `ingest-reports.mjs` is unused

**File:** `scripts/ingest-reports.mjs:36`
**Issue:** `reviewStatus` is imported from `review-reports.mjs` but never referenced in
`ingest-reports.mjs`. Dead import.
**Fix:** Remove `reviewStatus` from the import list.

### IN-03: `classifyReport` treats `errorLog` via `?.length` without an array check

**File:** `scripts/report-classifier.mjs:92,144`
**Issue:** Rule 7 uses `!(errorLog?.length)`. If a corrupt/historical KV record stored
`errorLog` as a non-array truthy value (e.g. a string), `.length` would be its char
count and the rule would mis-fire. The Worker guards `errorLog` to an array on write
(`index.js:246`), so this is defensive-only, but the classifier should not assume the
server invariant holds for every record it reads.
**Fix:** `const hasErrors = Array.isArray(errorLog) && errorLog.length > 0;` and branch
on `!hasErrors`.

---

_Reviewed: 2026-06-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

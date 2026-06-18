---
status: partial
phase: 14-end-to-end-uat-digest
source: [14-VERIFICATION.md]
started: 2026-06-18T00:00:00Z
updated: 2026-06-18T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end Issue label → draft PR flow (FIX-01/GATE-02/COST-04)

expected: Labeling a real GitHub Issue `report-fix-candidate` (with a valid `<!-- kv-key: report:{fp}:{ts} -->` pointer) fires `v61-report-fix.yml`, fetches the KV record via `wrangler --remote` (not local miniflare), invokes the dispatcher, and opens a draft PR on `auto-fix/<fp-short>`; the ledger entry is committed to `ledger-snapshots/report-fix-<fp-short>`; `v40-verifier-gate.yml` fires automatically on the draft PR.

result: [pending]

### 2. Overfit soft-flag → human-review-required (FIX-04/D-03)

expected: A run where the LLM produces an overfit diff (reported `patentNumber` as a string literal in added `src/` lines) yields a PR carrying the `human-review-required` label, the PR body includes the FIX-04/D-03 overfit warning, and `auto-fix:verified` is absent.

result: [pending]

### 3. Three-iteration exhaustion → auto-fix-stuck (GATE-01/COST-03)

expected: A run whose dispatcher exhausts all 3 iterations (regression persists) labels the source Issue `auto-fix-stuck`, creates no draft PR, and the ledger shows 3 cost entries all with `source:'report-fix-api'` and no further spend.

result: [pending]

### 4. D-06 GitHub-authoritative idempotency

expected: Triggering the workflow twice on the same issue (same `fp-short`) without `--re-trigger` makes the second run skip ("D-06: idempotency guard fired") with no new PR and no new LLM call — only a skip ledger entry.

result: [pending]

### 5. Verifier-gate required-status binding (GATE-03, ruleset 17086676)

expected: `v40-verifier-gate.yml` fires on the `auto-fix/<fp-short>` draft PR as the required-status check; the `verifier-gate` job name is recognized by ruleset 17086676 and passes only after zero regressions.

result: [pending]

### 6. UAT-01: Full live chain — seeded broken-patent report end-to-end (UAT-01)

**Pre-flight: Spend Confirmation**

Before any LLM call is made during this test, confirm monthly ledger headroom:

```bash
node -e "
const fs = require('fs');
const { LEDGER_PATH, monthlyTotal, HARD_CAP_USD } = require('./tests/e2e/lib/llm-ledger.js');
if (!fs.existsSync(LEDGER_PATH)) {
  console.log('Ledger file does not exist yet — \$0.00 spent this month.');
  process.exit(0);
}
const total = monthlyTotal(LEDGER_PATH);
const remaining = HARD_CAP_USD - total;
console.log(\`Monthly spend so far: \$\${total.toFixed(4)} / \$\${HARD_CAP_USD} cap\`);
console.log(\`Remaining headroom: \$\${remaining.toFixed(4)}\`);
if (remaining <= 0) { console.error('HARD CAP REACHED — abort UAT-01'); process.exit(1); }
"
```

**IMPORTANT:** Always call `fs.existsSync(LEDGER_PATH)` BEFORE calling `monthlyTotal`. The function returns 0 for both a missing ledger file and $0 spend — without the existence check, you cannot distinguish them. Never set `E2E_LEDGER_PATH_OVERRIDE` (throws in CI per the Y6 YAML guard).

**Test-Fixture Distinction (D-07):** The one-time KV seed below is a TEST FIXTURE — a single manual report seeded purely to validate the pipeline end-to-end. It is NOT a revival of the retired v4.3 synthetic-injection architecture (the autonomous cron that fabricated GitHub Issues as the operating signal). The inbound signal model remains exclusively "human bug reports only." This distinction is deliberate; see `project_v43_paused_for_bug_report` memory note.

**Step 1 — Seed a throwaway test report via the real `POST /report` intake:**

Choose a deliberately throwaway/test patent (e.g. a patent number known to have no real match in the golden corpus, or an obvious test fixture like `US0000000B2`). Submit a citation-failing report through the genuine production intake path:

```bash
# From the repo root — substitute your actual cite.tonyrowles.com deployment URL
curl -X POST https://cite.tonyrowles.com/report \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PROXY_TOKEN>" \
  -d '{
    "patentNumber": "US0000000B2",
    "selectionText": "test fixture selection — UAT-01 seed",
    "note": "UAT-01 live test fixture — deliberately failing citation",
    "errorLog": "citation_not_found",
    "fingerprint": "uat01-test-fixture"
  }'
# Verify HTTP 200 or 202 — record the fingerprint (fp) and timestamp (ts) from the response
```

Confirm the KV record appears:

```bash
cd worker && wrangler kv key list --remote --binding BUG_REPORTS | grep "uat01-test-fixture"
wrangler kv key get --remote --binding BUG_REPORTS "report:uat01-test-fixture:<ts>"
```

**Step 2 — Triage with `ingest-reports.mjs`:**

```bash
node scripts/ingest-reports.mjs list
# Confirm the seed appears as a real_bug or check the triage-report artifact
cat .triage-reports/triage-report-*.json | jq '.reports[] | select(.fingerprint=="uat01-test-fixture")'
```

If the seed classifies as `ambiguous` (below threshold), use the manual-promote escape hatch instead (see UAT-02 below) to force it into the pipeline.

**Step 3 — Confirm `report-fix-candidate` Issue created:**

The auto-promote step (if classification = `real_bug`) creates a GitHub Issue with:
- Label: `report-fix-candidate`
- Body: `<!-- kv-key: report:uat01-test-fixture:<ts> -->` pointer

Locate the Issue: `gh issue list --label report-fix-candidate`

**Step 4 — `v61-report-fix.yml` fires (operator dispatch or label trigger):**

Operator dispatches (or the workflow fires on label): `gh workflow run v61-report-fix.yml --field issue_number=<N>`.

Monitor: `gh run watch` or check Actions tab. The workflow must:
- Fetch the KV record via `wrangler --remote` (NOT local miniflare)
- Invoke the fix dispatcher
- Open a draft PR on `auto-fix/uat01-test-fixture`
- Commit a ledger entry to `ledger-snapshots/report-fix-uat01-test-fixture` with `source:'report-fix-api'`
- Include `<!-- source_issue: <N> -->` in the PR body (Phase 13 D-04 marker)

**Step 5 — `v40-verifier-gate.yml` required-status check:**

The verifier-gate fires automatically on the draft PR. Confirm:
- Job name `verifier-gate` appears in the PR's required-status checks
- Ruleset 17086676 recognizes it
- Gate passes only after zero regressions in the golden corpus

**Step 6 — Human merge (the permanent invariant):**

The operator reviews the diff manually and merges via GitHub UI. This is the permanent human merge gate. Do NOT use `gh pr merge --admin` (bypasses the verifier-gate and pollutes ledger A/B math).

After merge: `gh pr view auto-fix/uat01-test-fixture --json mergedAt` shows a non-null `mergedAt`.

**Step 7 — Operator-dispatch `v40-auto-promote.yml`:**

```bash
gh workflow run v40-auto-promote.yml
```

Confirm:
- The source Issue is labeled `auto-fix:verified` and closed
- `assertTripleGate` Leg 3 OR-accepts `report-fix-candidate` (GATE-05 — Phase 13 D-01)
- Ledger entries carry `source:'report-fix-api'`

To judge "merged?": diff `origin/main` (not local `main`, which is often stale) per the `project_milestone_vs_store_tag_collision` memory note.

**Step 8 — Verify ledger integrity:**

```bash
node -e "
const fs = require('fs');
const { LEDGER_PATH, monthlyTotal } = require('./tests/e2e/lib/llm-ledger.js');
if (!fs.existsSync(LEDGER_PATH)) { console.error('Ledger missing'); process.exit(1); }
const entries = JSON.parse(fs.readFileSync(LEDGER_PATH,'utf8'));
const uatEntries = entries.filter(e => e.source === 'report-fix-api');
console.log(\`report-fix-api entries: \${uatEntries.length}\`);
console.log(JSON.stringify(uatEntries, null, 2));
"
```

expected: All 8 steps complete — a seeded `POST /report` record for a throwaway test patent flows through the genuine production intake → `BUG_REPORTS` KV → `ingest-reports.mjs` triage → `report-fix-candidate` Issue → `v61-report-fix.yml` LLM fix → draft PR with `<!-- source_issue: N -->` → `v40-verifier-gate.yml` passes → human merge → operator-dispatched `v40-auto-promote.yml` → Issue closed with `auto-fix:verified` and ledger entries carrying `source:'report-fix-api'`.

result: [pending]

### 7. UAT-02: Manual-promote escape hatch on non-auto-promoted seed (UAT-02, D-08)

expected: `node scripts/ingest-reports.mjs promote <fp> <ts>` run LIVE against a report that triage would NOT auto-promote (an `ambiguous`/below-threshold seed, or the UAT-01 seed if it was classified as `ambiguous`) bypasses the auto-promote status filter and forces the full pipeline — creating a `report-fix-candidate` Issue and driving `v61-report-fix.yml` exactly as in UAT-01 steps 3-8. The escape hatch proves PROMO-02 (D-08) works in production.

**Operator steps:**

1. Identify a seed that triage classified as `ambiguous` (or deliberately seed one):
   ```bash
   node scripts/ingest-reports.mjs list --json | jq '.reports[] | select(.classification=="ambiguous")'
   ```

2. Run manual promote with the fingerprint and timestamp of the ambiguous record:
   ```bash
   node scripts/ingest-reports.mjs promote <fp> <ts>
   # --force flag is implicit in the promote subcommand (bypasses status-open check)
   ```

3. Confirm a `report-fix-candidate` Issue was created:
   ```bash
   gh issue list --label report-fix-candidate --json number,title,body
   ```

4. The Issue must carry the `<!-- kv-key: report:<fp>:<ts> -->` marker so `v61-report-fix.yml` can locate the KV record.

5. Drive steps 4-8 of UAT-01 from this Issue through to `v40-auto-promote.yml`.

The test is PASSING when the promoted record completes the full pipeline despite having been classified as `ambiguous` by auto-triage — proving the escape hatch bypasses the status filter (PROMO-02).

result: [pending]

### 8. UAT-03: Monthly cap enforced across real Actions invocations — live half (UAT-03)

**Note:** The in-session half of UAT-03 (golden corpus 100% via `npm test`, and the ledger-cap assertion via `tests/e2e/lib/llm-ledger.js`) was verified by Plan 01 in-session. This test covers only the **live Actions half**: confirming the monthly cap is enforced across real `v61-report-fix.yml` invocations (not just local mocks).

expected: After the UAT-01 (and optionally UAT-02) live chain completes:

1. The `monthlyTotal(LEDGER_PATH)` value reflects all real API spend from the Actions runs:
   ```bash
   node -e "
   const fs = require('fs');
   const { LEDGER_PATH, monthlyTotal, HARD_CAP_USD, combinedMonthlyTotalByTransport } =
     require('./tests/e2e/lib/llm-ledger.js');
   if (!fs.existsSync(LEDGER_PATH)) { console.log('No spend yet.'); process.exit(0); }
   const total = monthlyTotal(LEDGER_PATH);
   console.log(\`Total spend (all transports): \$\${total.toFixed(4)}\`);
   console.log(\`Hard cap: \$\${HARD_CAP_USD}\`);
   const byTransport = combinedMonthlyTotalByTransport(LEDGER_PATH);
   console.log('By transport:', JSON.stringify(byTransport, null, 2));
   "
   ```

2. If another `v61-report-fix.yml` dispatch is attempted AFTER the hard cap is reached, the workflow should abort (pre-call cap check) with no new Anthropic API spend — the ledger should show a cap-blocked entry or the run exits non-zero before the LLM call.

3. All ledger entries from the live runs carry `source:'report-fix-api'` (not `'auto-fix-api'` — the retired v4.3 path). A `source:'auto-fix-api'` entry is a regression indicator (see `project_auto_fix_ledger_leak_vector` memory note).

result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

None identified at authoring time (2026-06-18). All 8 test blocks are pending live operator execution.

## Revert Plan

**When UAT-01/UAT-02 merge their fix PR, `main` and the golden-corpus baseline are mutated.** To revert after the live UAT concludes:

### Revert the `main` mutation

```bash
# Find the merge commit
git log origin/main --oneline | head -10

# Identify the UAT fix PR merge commit hash (look for "Merge pull request" for auto-fix/uat01-test-fixture)
MERGE_COMMIT=<hash>

# Revert it (creates a new revert commit, does not force-push)
git revert $MERGE_COMMIT --no-edit
git push origin main
```

**Do NOT use `git push --force` on `main`.** Use `git revert` to create a new revert commit preserving history.

### Revert the golden-corpus mutation

If the auto-fix PR patched `tests/golden/baseline.json` (the corpus baseline is updated when a fix correctly matches a previously-failing case):

```bash
# View the diff introduced by the UAT fix
git show $MERGE_COMMIT -- tests/golden/baseline.json

# The revert commit above already reverts baseline.json.
# Confirm after revert:
git show HEAD -- tests/golden/baseline.json | head -20
npm test  # must still pass at 100% (the UAT fixture was a throwaway patent, not a real golden case)
```

### Revert the ledger snapshot

The two-commit ledger split means the fix workflow commits a ledger snapshot directly to `main` with `[skip ci]` before the PR merge. To revert:

```bash
# Find the [skip ci] ledger commit
git log origin/main --oneline --grep="skip ci" | head -5

LEDGER_COMMIT=<hash>
git revert $LEDGER_COMMIT --no-edit
git push origin main
```

### Remove the UAT KV record

After the live UAT, remove the test fixture KV record to keep production clean:

```bash
cd worker && wrangler kv key delete --remote --binding BUG_REPORTS "report:uat01-test-fixture:<ts>"
```

### Verify clean state

```bash
npm test        # golden 100%
git log origin/main --oneline | head -5   # revert commits present
```

## Test Fixture, Not Synthetic Revival (D-07)

The one-time `POST /report` seed in UAT-01 and the manual promote in UAT-02 are **test fixtures** — single manual operations to prove the live pipeline works end-to-end.

They are NOT a revival of the v4.3 synthetic-injection architecture, which was an autonomous cron-based system (`inject-defect.mjs`, `e2e-explore.mjs`, `v40-auto-fix.yml` `issues:labeled` trigger) that fabricated GitHub Issues as the operating signal. That architecture was retired in Phase 10 and its checklist (`RESUME-V4.3.md`) is permanently voided.

The v6.1 inbound signal model is and remains: **exclusively human bug reports from the `BUG_REPORTS` KV channel.** The UAT seed is submitted through that same genuine intake path (`POST /report`), not through any synthetic fabrication mechanism. After UAT completes, the test KV record is removed (see Revert Plan above).

See: `project_v43_paused_for_bug_report` memory note for the full retirement context.

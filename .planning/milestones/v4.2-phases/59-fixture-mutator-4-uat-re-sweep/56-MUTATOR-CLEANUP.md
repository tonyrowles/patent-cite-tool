# Phase 59 Fixture Mutator — Cleanup Evidence Manifest

_Append-only manifest. Each `node tests/e2e/scripts/inject-defect.mjs`
invocation appends a `## Run <iso>` section below with explicit cleanup
commands consumed by Plan 59-02 SWEEP-06 (`uat-cleanup.mjs`)._

## Run 2026-06-07T04:07:00Z — issue #23 fp f6a81c38596c

- seed: `mutator-seed-sweep-03-claudemax-2`
- errorClass: `GOOGLE_DOM_DRIFT`
- sourceTag: `fixture-mutator-uat-47b`

Close synthetic issue (NOT planned):

```bash
gh issue close 23 --reason "not planned"
```

Close auto-fix PR + delete branch (populate `<PR_NUMBER>` after the
auto-fix loop opens the PR):

```bash
gh pr close <PR_NUMBER> --delete-branch
```

Revert any quarantine entry the synthetic run injected:

```bash
git checkout -b chore/sweep-06-cleanup-20260607040700
node tests/e2e/scripts/uat-cleanup.mjs --revert-quarantine --source-tag fixture-mutator-uat-47b
```

Fingerprint search (verify the synthetic issue is the only carrier):

```bash
gh issue list --search '<!-- fp: f6a81c38596c -->'
```


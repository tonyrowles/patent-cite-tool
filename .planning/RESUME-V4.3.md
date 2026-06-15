# Resuming v4.3 (Auto-Fix Loop Closure) — restore checklist

**Status:** v4.3 is PAUSED (since 2026-06-12) to ship the v5.0 Bug Report feature.
**This file:** the exact, reversible steps to undo the v5.0-era CI quieting when v4.3 resumes as a future milestone. Nothing about the auto-fix *engine* (`scripts/auto-fix.mjs`) was changed — only CI plumbing was made dormant so v5.0's CI could go green. See [[v43-paused-for-bug-report]] memory and `.planning/MILESTONES.md` (v4.2 entry) for the actual v4.3 *work* scope (diagnostic-injection mutator + `--max-turns`/`--allowed-tools=Read` relaxation + forensic-ledger hardening + synthetic-issue cleanup).

> Do these only when you actually restart v4.3 — not before. While paused, this dormant state is intentional.

---

## 1. Re-enable the disabled workflows (GitHub repo state — NOT in git)

These were disabled with `gh workflow disable` this session, so the state is **not** carried in any branch/commit — it must be flipped back on GitHub:

```bash
gh workflow enable v40-auto-promote.yml
gh workflow enable v40-deps-update.yml
# verify:
gh workflow list --all | grep -iE "auto-promote|deps"   # expect: active
```

Note: `v40-deps-update` will still fail to open its dependency PR until the repo setting **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** is enabled. Turn that on (or keep deps-update on `workflow_dispatch`/cron-only) when resuming.

## 2. Restore the gated workflow triggers (in git — edit the files)

Each `on:` block has a `PAUSED (v4.3 auto-fix milestone)` comment with the exact line to restore:

- **`.github/workflows/v40-auto-promote.yml`** → restore `pull_request:` `types: [closed]`
- **`.github/workflows/v40-deps-update.yml`** → restore `pull_request:` `types: [opened, synchronize, reopened]`
- **`.github/workflows/v40-auto-fix.yml`** → restore `on: issues: types: [labeled]` (this one was made `workflow_dispatch:`-only at the *start* of the pause — the original block is preserved in that file's header comment).

## 3. Un-skip the 6 stale contract tests (in git)

All carry a greppable marker so they self-locate even if line numbers drift:

```bash
grep -rn "SKIP (v4.3 auto-fix milestone paused" tests/
```

That finds all six. Two categories — handle differently:

**(a) Trigger-contract tests — will PASS once step 2 restores the triggers:**
- `tests/e2e/scripts/v40-auto-fix-yaml.test.js` → `A1 — trigger on.issues.types includes labeled`
- `tests/e2e/scripts/v40-auto-promote-yaml.test.js` → `A1 — trigger on.pull_request.types includes closed`

**(b) `scripts/auto-fix.mjs` ledger transport-tag tests — were failing PRE-EXISTING (the transport-tag behavior was incomplete/mid-flight when v4.3 paused), so un-skipping is NOT enough — verify/finish the `auto-fix.mjs` ledger transport tagging until these pass:**
- `tests/unit/warning-01-transport-tag.test.js` → `Site A … sdk transport → … transport:sdk (back-compat)` (single `it.skip`)
- `tests/unit/warning-01-transport-tag.test.js` → `Site D — dispatchFlakeState ledger summary entry` (whole `describe.skip`, 3 tests)

## 4. Verify

```bash
npm run build && npx vitest run && (cd worker && npx vitest run)
# expect 0 skipped that belong to v4.3; CI green on a PR to main
```

---

## What merging v5.0 → main did NOT change (reassurance)
- `scripts/auto-fix.mjs` and all auto-fix engine logic: **untouched**.
- v4.2/v4.3 history on `main`: **intact** (v5.0 branched off main after Phase 67 and only added on top — main was a strict ancestor, so the merge dropped nothing).
- Still-active v40 workflows (left alone, not noisy): `v40-verifier-gate`, `v40-cost-ledger-snapshot`, `v40-pdfjs-frame-shift`.

# v4.0 Repo Configuration Reference

**Created:** 2026-05-30 (Phase 39 CLEANUP-04 initial setup)
**Re-audited:** Phase 47 CLEANUP-04 (compare against this doc + live `gh api` reads)
**Owner:** @tonyrowles (verified via `gh api user --jq .login`)

This doc captures the manual GitHub UI settings that v4.0's trust invariants depend on. The settings themselves live in GitHub Settings (NOT git-tracked); this file is the audit reference Phase 47 cross-checks.

## 1. Allow auto-merge: OFF (repo-level)

**Why:** PITFALLS.md Pitfall 4 — auto-merge subverts the human-gated trust invariant for citation-accuracy code. All auto-fix PRs MUST require explicit human merge.

**UI path:** Settings → General → Pull Requests → uncheck "Allow auto-merge"

**Audit command (run AS the maintainer):**
```
gh api GET /repos/tonyrowles/patent-cite-tool --jq '.allow_auto_merge'
```
**Expected output:** `false`

## 2. Branch protection ruleset on `main`

**Why:** PITFALLS.md Pitfall 4 (auto-merge bypass) + Pitfall 1/3 (verifier-gate skip prevention). Modern GitHub rulesets replace legacy branch protection rules (per 39-RESEARCH.md §State of the Art).

**UI path:** Settings → Rules → Rulesets → New branch ruleset

**Settings (locked per 39-CONTEXT.md):**

| Setting | Value | Rationale |
|---------|-------|-----------|
| Target branches | `main` only | CONTEXT-locked scope |
| Bypass list | EMPTY | `Do not allow bypassing: ON` — NO bypass list. Single-maintainer friction accepted (see §3). |
| Require pull request before merging | ON | All changes go through PRs |
| Required approvals | 1 (the maintainer) | Single-maintainer baseline |
| Require review from Code Owners | ON | Triggers CODEOWNERS-pinned reviews on the 5 locked paths |
| Required status checks | **EMPTY SLOT (reserved for Phase 41 `verifier-gate`)** | Per 39-RESEARCH.md Pitfall 5 — naming a non-existent check blocks EVERY PR including Phase 39's own |

**Audit command (Phase 47):**
```
gh api GET /repos/tonyrowles/patent-cite-tool/rulesets --jq '.[] | select(.target == "branch") | .name'
gh api GET /repos/tonyrowles/patent-cite-tool/rulesets/<RULESET_ID> --jq '{enforcement, bypass_actors, conditions, rules}'
```

**Expected on rule details:**
- `enforcement: "active"`
- `bypass_actors: []` (NO bypass list)
- `rules[?(@.type=="pull_request")].parameters.require_code_owner_review: true`
- `rules[?(@.type=="required_status_checks")].parameters.required_status_checks` — **empty array** in Phase 39; populated by Phase 41 to `[{ context: "verifier-gate", integration_id: <github-actions-id> }]`

## 3. Operational tradeoff: single-maintainer + Do not allow bypassing

**Locked decision (39-CONTEXT.md):** `Do not allow bypassing: ON` with NO bypass list.

**Implication for `@tonyrowles`:** PRs the maintainer opens against CODEOWNED files (which lack a second maintainer to approve) require a workaround. Two acceptable approaches:
1. Branch + PR + self-approve via `gh pr merge --admin <n>` — requires admin bypass which is FORBIDDEN by this ruleset. Not acceptable.
2. Open the PR, request review from a third party / collaborator on the bot account, merge after review. Acceptable for the rare manual-edit case.

**Implication for auto-fix bot PRs:** The bot opens PRs as a distinct identity (github-actions[bot]); `@tonyrowles` reviews and merges them normally. This is the COMMON path — the trust invariant is preserved exactly because the bot cannot self-approve.

## 4. CODEOWNERS file

**Location:** `.github/CODEOWNERS` (canonical GitHub-recognised path; A4 in 39-RESEARCH.md).

**Pinned paths (verified by `tests/unit/codeowners.test.js`):**
- `/src/` → `@tonyrowles`
- `/tests/` → `@tonyrowles`
- `/.github/workflows/` → `@tonyrowles`
- `/tests/golden/` → `@tonyrowles`
- `/tests/e2e/test-cases-quarantine.js` → `@tonyrowles`

**Audit command:**
```
cat .github/CODEOWNERS
npx vitest run tests/unit/codeowners.test.js
```

## 5. ANTHROPIC_API_KEY secret (required by Phase 42+, NOT Phase 39)

**Why documented now:** Phase 42 (`scripts/auto-fix.mjs`) is the first CI consumer of `invokeAnthropicSdkWithLedger` (Plan 03's SDK transport). The secret must exist before the first CI invocation; Phase 39 doesn't trigger that, but Phase 42 will fail loudly if the secret is absent.

**UI path:** Settings → Secrets and variables → Actions → New repository secret
- Name: `ANTHROPIC_API_KEY`
- Value: API key from <https://console.anthropic.com/settings/keys>
- Rotation: every 90 days (per PITFALLS.md security mistakes table)

**Audit command (does NOT print the value — confirms presence):**
```
gh api GET /repos/tonyrowles/patent-cite-tool/actions/secrets --jq '.secrets[].name' | grep -q '^ANTHROPIC_API_KEY$'
```

## 6. `[skip ci]` atomic commit pattern (Phase 40+ ledger commits)

**Why here:** Phase 39 flips `tests/e2e/.llm-spend-ledger.json` from gitignored to committed (Plan 04). Phase 40+ workflows commit ledger updates atomically using the established pattern at `.github/workflows/e2e-weekly-digest.yml:98–110`.

**Pattern (cite this exact block from `e2e-weekly-digest.yml`):**
```yaml
- name: Commit ledger update
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add tests/e2e/.llm-spend-ledger.json
    git diff --cached --quiet || git commit -m "chore(ledger): auto-fix #N spend [skip ci]"
    git push
```

**`[skip ci]` is LOAD-BEARING** — without it, the bot push re-triggers `ci.yml` which re-runs the auto-fix workflow which re-files the ledger update. Infinite loop.

## 7. Phase 47 re-audit checklist

Phase 47 (CLEANUP-04 re-audit) MUST verify:
- [ ] `allow_auto_merge: false` via `gh api`
- [ ] Ruleset on `main` exists with `enforcement: "active"`, `bypass_actors: []`, `require_code_owner_review: true`
- [ ] Required status checks list NOW INCLUDES `verifier-gate` (populated by Phase 41)
- [ ] `.github/CODEOWNERS` byte-for-byte matches §4 above (no drift)
- [ ] `tests/unit/codeowners.test.js` PASSES
- [ ] `ANTHROPIC_API_KEY` repo secret exists
- [ ] `tests/e2e/.llm-spend-ledger.json` is git-tracked (NOT in `.gitignore`)

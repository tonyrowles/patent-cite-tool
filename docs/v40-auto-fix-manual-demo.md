# v40 Auto-Fix Manual Demo Procedure

**Created:** 2026-05-31 (Phase 42 Plan 42-03)
**Satisfies:** Phase 42 Plan 03 Success Criterion 4 (`AUTOFIX-DEMO-01`) — a single maintainer-driven invocation of `scripts/auto-fix.mjs --force-api` demonstrates the full Phase 42 vertical slice (real SDK call → real diff → real branch → real PR → real Phase 41 verifier-gate run) on GitHub issue #3.
**Future reuse contract:** Phase 47 `CLEANUP-03` HUMAN-UAT (a) will RE-RUN this procedure as the milestone-close confirmation that the entire v4.0 auto-fix ecosystem still works end-to-end. Do NOT rename H2 sections without updating any future doc-structure pin — they are load-bearing for the Phase 47 evidence rubric.

This document is self-contained. A first-time runner should be able to follow it end-to-end without cross-referencing other docs. The CLI under test is `scripts/auto-fix.mjs` (Plan 42-02 dispatcher); the gate it ultimately drives is `.github/workflows/v40-verifier-gate.yml` (Plan 41-03 verifier-gate workflow).

## Purpose & When To Use

This is the "does it actually work?" gate for the entire v4.0 milestone. Every primitive that v4.0 ships — Phase 39 SDK driver + spend caps, Phase 41 verifier-gate workflow, Phase 42 prompt-builder + dispatcher — is exercised in a single user-driven invocation. A green outcome unblocks Phase 43 (workflow lift). A red outcome surfaces whichever primitive failed BEFORE Phase 43 invests in the workflow plumbing. Run this doc end-to-end ONCE during Phase 42 close (maintainer) and AGAIN during Phase 47 CLEANUP-03 HUMAN-UAT (a). Do not run it as part of any automated CI job — `autonomous: false` is the contract.

## Prereqs Checklist

- [ ] `gh` CLI authenticated — `gh auth status` returns OK with `tonyrowles/patent-cite-tool` access
- [ ] `ANTHROPIC_API_KEY` exported in the executor's shell — `echo $ANTHROPIC_API_KEY | head -c 7` prints `sk-ant-` (and nothing else — head -c truncates without leaking the secret)
- [ ] Clean working tree on a checkout of `main` — `git status --short` returns empty AND `git rev-parse --abbrev-ref HEAD` returns `main`
- [ ] Phase 39 spend caps have ~$0.30 headroom — run `node -e "const {readLedger,combinedMonthlyTotal} = await import('./tests/e2e/lib/llm-ledger.js'); const l=readLedger(); console.log('monthly:', combinedMonthlyTotal(l).toFixed(2));"` and confirm monthly remaining is well under the $100 cap; per-issue ($1) and per-PR ($2) caps will refuse the call if exhausted
- [ ] npm dependencies installed — if `node_modules/` is absent run `npm ci --no-audit --no-fund`
- [ ] You are NOT mid-way through another auto-fix PR for the same fingerprint (`139f821b`) — the dispatcher's `git ls-remote` idempotency check (AUTOFIX-04) will short-circuit with exit 0 if branch `auto-fix/3-139f821b` already exists on origin

## Target Selection

1. Confirm issue #3 is still the canonical demo target:
   ```bash
   gh issue view 3 --json state,labels,title --jq '{state,labels:[.labels[].name],title}'
   ```
   Expected: `state=OPEN`, `labels` includes `WRONG_CITATION`, `title` matches `[e2e-nightly] US11427642-spec-short-1: WRONG_CITATION`.
2. Confirm the fingerprint line:
   ```bash
   gh issue view 3 --json body --jq '.body' | head -1
   ```
   Expected first body line: `<!-- fp: 139f821b3bb1 -->` (the 12-hex v3.1 fingerprint).
3. Fallback if issue #3 has been closed/triaged: pick the lowest-numbered open `WRONG_CITATION` issue instead, capture its number, title, and fingerprint, and substitute throughout the rest of the procedure:
   ```bash
   gh issue list --label WRONG_CITATION --state open --json number,title,body --jq 'sort_by(.number)[0]'
   ```
   The expected branch name becomes `auto-fix/<n>-<fp8>` where `<n>` is the fallback issue number and `<fp8>` is the first 8 hex chars of the fingerprint comment.

## Dry-Run Validation

The dispatcher's `--dry-run` short-circuits at Step 8 of the 18-step pipeline — it prints the rendered prompts and exits 0 WITHOUT invoking the SDK, writing the ledger, or mutating the working tree.

```bash
# (a) Run dry-run and capture
node scripts/auto-fix.mjs --issue 3 --dry-run
```

Confirm the output contains:
- A `--- SYSTEM PROMPT ---` section listing the 6 FORBIDDEN paths (the diff-guard regex bank from Phase 41-01) and the 200 LOC src / 50 LOC tests size caps
- A `--- USER PROMPT (envelope-wrapped) ---` section whose body begins with `<issue_body_untrusted>` and ends with `</issue_body_untrusted>` (Plan 42-01 prompt-injection envelope contract)
- A trailing `(dry-run: SDK not invoked, ledger not written, branch not pushed; fix_attempts counter NOT incremented...)` line
- Exit code 0 (`echo $?` → `0`)

```bash
# (b) Prove no ledger write — should print nothing
git diff --stat tests/e2e/.llm-spend-ledger.json
```

If anything in (a) or (b) is missing, STOP and file an investigation issue against Plan 42-02; do NOT proceed to the real invocation.

## Real Invocation

This is the single billable step. It uses `--force-api` to bypass the dispatcher's INVERSE CI gate (Phase 39 normally requires `CI=true`; `--force-api` is the local-maintainer escape hatch) and `--no-push` so the maintainer can inspect the branch BEFORE it goes to origin.

```bash
node scripts/auto-fix.mjs --issue 3 --force-api --no-push 2>&1 | tee /tmp/auto-fix-demo-$(date +%s).log
```

Expected stdout (last ~6 lines):
- A success line from the SDK driver indicating the call completed (model `claude-sonnet-4-6`, transport `sdk`)
- `[auto-fix] branch staged locally; push manually with: git push -u origin auto-fix/3-139f821b`
- `[auto-fix] suggested PR-create command:` followed by a `gh pr create --draft --base main --head auto-fix/3-139f821b ...` block with the `<!-- affected_cases: US11427642-spec-short-1 -->` PR-body hint
- Exit code 0 (`echo $?` → `0`)

Capture the log file path (e.g., `/tmp/auto-fix-demo-1748707200.log`) for the SUMMARY. The log is the ONLY surviving record of the real LLM response — the SDK response body itself is consumed by the driver and not persisted separately.

Confirm the ledger entry was appended:
```bash
node -e "const {readLedger}=await import('./tests/e2e/lib/llm-ledger.js'); const l=readLedger(); const m=Object.values(l.months).pop(); const last=m.iterations[m.iterations.length-1]; console.log(JSON.stringify(last,null,2));"
```
Expected fields on the last entry: `phase:'42-auto-fix'`, `transport:'sdk'`, `fingerprint:'139f821b3bb1'`, `issueId:'issue-3'`, `cost_usd > 0`, `model:'claude-sonnet-4-6'`.

## Branch Inspection

Before pushing, inspect the branch the dispatcher staged locally:

```bash
git log --oneline -1                                  # the auto-fix commit on the branch
git diff main..auto-fix/3-139f821b                    # full LLM-emitted diff
git diff --stat main..auto-fix/3-139f821b             # confirm size is within 200 LOC src / 50 LOC tests
```

If the diff is reasonable (touches `src/` only, well under the size caps, plausibly addresses the WRONG_CITATION misroute), proceed to Push + PR. If the diff is pathological (touches forbidden paths the diff-guard somehow missed, edits unrelated subsystems, or is enormous), ABORT: discard the branch (`git checkout main && git branch -D auto-fix/3-139f821b`) and document the failure mode in the SUMMARY. Re-running the dry-run with the same issue is cheap and informative — iterate on the prompt scaffold (Plan 42-01) before another `--force-api` call.

## Push + PR Creation

Push the inspected branch:
```bash
git push -u origin auto-fix/3-139f821b
```

Open a DRAFT PR. The body MUST contain the `<!-- affected_cases: ... -->` HTML comment — Phase 41-01's `scripts/parse-affected-cases.mjs` parses this comment to choose which case the verifier-gate runs against:

```bash
gh pr create --draft --base main --head auto-fix/3-139f821b \
  --title 'auto-fix: WRONG_CITATION for US11427642-spec-short-1' \
  --body "$(cat <<'EOF'
<!-- affected_cases: US11427642-spec-short-1 -->

Phase 42 manual demo of the v4.0 auto-fix vertical slice.

- Issue: #3
- Fingerprint: 139f821b3bb1
- fix_attempts: 1
- Ledger entry: <paste-iso-from-real-invocation-step>

/cc @tonyrowles
EOF
)"
```

Capture the printed PR URL.

## Verifier-Gate Observation

Phase 41-03's `.github/workflows/v40-verifier-gate.yml` triggers on `pull_request.opened` for any head ref matching `auto-fix/*`. It runs three jobs in sequence: `diff-guard` → (`verifier-gate` + `regression-suite` in parallel) → `ready-flip`. Total wall-clock ≈ 16-26 minutes.

```bash
# Within ~30s of PR creation, confirm a workflow run is queued or in_progress
gh pr view <pr-number> --json statusCheckRollup,isDraft,labels

# Watch the workflow to completion (replace <run-id> with the verifier-gate run id)
gh run watch <run-id>
```

Two acceptable outcomes:
- **PASS** — workflow exits green; PR auto-flips draft → ready-for-review; PR gains the `auto-fix:verified` label; bot comments "Verifier-gate: all 3 affected-case runs Tier A/B + 76-case regression clean. Draft → ready-for-review."
- **FAIL** — workflow exits non-zero; PR stays draft; bot comments with the rejection reason (size-cap, diff-guard violation, Tier C verifier result, or 76-case regression breakage). FAIL is ALSO a valid Phase 42 outcome: it proves the gate caught a bad fix, which is exactly the trust invariant the gate exists for.

Document the outcome (PASS or FAIL with reason) in the SUMMARY. The verifier-gate is ADVISORY in Phase 42 — Phase 47 binds it as a required-status-check on the ruleset, so a FAIL here does not block any merge but does block the v4.0 milestone close until Phase 43 iterates the prompt or 47 wires the binding.

## Cleanup

The demo PR is a throwaway — it is NOT meant to merge into `main`. The real fix flow ships through Phase 43 (`workflow_dispatch` of `peter-evans/create-pull-request@v8` from `issues.labeled`). Close the demo PR after evidence capture:

```bash
gh pr close <pr-number> --delete-branch          # closes PR + deletes the remote branch
git checkout main
git branch -D auto-fix/3-139f821b                # cleans up the local branch
```

If the verifier-gate added an `auto-fix:verified` label, the closed PR retains it — that is harmless and serves as audit evidence. If the gate added a `human-review-required` label (from the F1/F2 rejection paths), removing it is optional: `gh pr edit <pr-number> --remove-label human-review-required`.

## Caveats

- **Pitfall 4 (Plan 42-RESEARCH) — dispatcher exit 0 ≠ verifier-gate pass.** The dispatcher's exit code reports whether the LOCAL pipeline (diff-guard, apply-check, apply, commit, optional push) succeeded. The verifier-gate runs asynchronously on the PR side AFTER push, against pinned `main`-side verifier files. Treat the gate's final state (`isDraft` + `labels` + workflow conclusion) as the load-bearing signal — NOT the dispatcher's `echo $?`. The SUMMARY captures both signals separately.
- **Concurrent invocation (CONTEXT Q3 / RESEARCH Open Q3).** Phase 42's dispatcher does NOT prevent two terminals from invoking `auto-fix.mjs --issue 3` simultaneously — `git ls-remote` idempotency only helps the SECOND invocation if the FIRST has already pushed. The accepted single-terminal-only constraint for Phase 42 is documented here; Phase 43's workflow concurrency group (keyed on `auto-fix-${{ github.event.issue.number }}`) is the proper defense at the workflow tier. Do not parallel-run this demo.
- **Cost expectation.** A single demo invocation costs ~$0.05-$0.15 against the Anthropic API (Sonnet 4.6, ~5k input + ~1k output tokens per WRONG_CITATION fix). The Phase 39 caps will refuse the call if any sub-cap is exhausted: monthly $100, daily $10, per-issue $1, per-PR $2. The `ANTHROPIC_API_KEY` is consumed by the SDK client constructor and is NOT logged in the `/tmp/auto-fix-demo-*.log` capture — the demo log contains the rendered prompts and the LLM response text only, never the credential.

---
status: partial
phase: 31-llm-exploratory-mode-+-docs
source: [31-VERIFICATION.md, 31-03-SUMMARY.md § Task 3 — Deferred]
started: 2026-05-20T20:38:06Z
updated: 2026-05-20T20:38:06Z
---

## Current Test

[awaiting human testing — user chose to defer at the Plan 31-03 Task 3 checkpoint]

## Tests

### 1. Live single-iteration LLM-driven exploratory run (LLM-02 end-to-end)

**Source:** Plan 31-03 Task 3 (`checkpoint:human-verify`, gate=blocking) — deferred by user during execution.

**Expected:**
- `npm run e2e:explore -- --iterations 1` exits 0 against the user's Max 5 subscription.
- Writes one ledger entry with `cost_usd > 0` to `tests/e2e/.llm-spend-ledger.json`.
- Writes one iteration row to `tests/e2e/artifacts/{run-id}/llm-report.json` with a real classification ∈ `{PASS, WRONG_CITATION, VERIFIER_DISAGREE, LLM_HALLUCINATED_SELECTION, LLM_API_ERROR}`.
- `iterations[0].llm_raw_response` is JSON returned by `claude` (not an auth error).
- Subscription mode is active — no `ANTHROPIC_API_KEY` required, and stderr does NOT contain `subscription`/`quota`/`credit` (which would indicate pool exhaustion).

**Why human:** LLM-02 (subscription auth working in practice) cannot be unit-tested — it depends on real Max 5 subscription auth and consumes ~$0.10–0.20 of subscription credit per run. The env-scrubbing path (`ANTHROPIC_API_KEY: ''`) is verified by 28 mocked-spawn unit tests in `tests/unit/llm-driver.test.js`, but never exercised against the real `claude` CLI.

**Reproduction steps** (from repo root):

```bash
# 1. Confirm no leaked API key
unset ANTHROPIC_API_KEY
echo "${ANTHROPIC_API_KEY:-unset}"   # must print "unset"

# 2. Confirm claude CLI version
claude --version                      # expect 2.1.139 or newer

# 3. Build extension if needed
ls dist/chrome/manifest.json 2>/dev/null || npm run build:chrome

# 4. Run one exploratory iteration (~30-60s)
npm run e2e:explore -- --iterations 1

# 5. Inspect outputs
LATEST=$(ls -t tests/e2e/artifacts/ | head -1)
cat tests/e2e/artifacts/$LATEST/llm-report.json | jq .
cat tests/e2e/.llm-spend-ledger.json | jq .
```

**result:** [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

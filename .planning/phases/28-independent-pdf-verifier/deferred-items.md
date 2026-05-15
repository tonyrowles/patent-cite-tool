# Phase 28 Deferred Items

## Pre-existing test failures (out of scope for Plan 28-01)

`npm run test:src` shows 15 failing tests in `tests/unit/text-matcher.test.js`
on the base commit (3ef1916). Sample failure:

```
expected "1:60-2:3" to be "1:62-2:3"
```

These are golden-baseline divergences in the production text matcher,
unrelated to the Phase 28 verifier work. Plan 28-01 SUMMARY notes the
pre-existing state. Logged here per execute-plan SCOPE BOUNDARY rules.

Recommended action: triage during Phase 28-05 calibration — the verifier's
diagnostic output may identify which baseline rows are stale vs which
matcher behaviors are regressions.

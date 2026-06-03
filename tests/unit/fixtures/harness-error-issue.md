<!-- fp: d4e5f6a1b2c3 -->
case-id: US11427642-harness-1

## Triage finding (Phase 28 RPT-02 — HARNESS_ERROR)

**ERROR_CLASS:** HARNESS_ERROR
**Verifier tier used:** N/A — spec setup failed before the product was exercised
**Rerun verdict:** CONFIRMED (3/3 replays hit the same fixture-missing error)
**stable_runs:** 1

### What Playwright reported

Spec setup failed during `beforeEach` with:

```
Error: ENOENT: no such file or directory, open
  '/home/runner/work/patent-cite-tool/patent-cite-tool/tests/e2e/fixtures/patents/US11427642.json'
   at fixtureLoader.loadPatentJson
       (tests/e2e/specs/cite.spec.js:34:18)
   at Object.<anonymous> (tests/e2e/specs/cite.spec.js:42:9)

Spec fault: fixture-not-found; test exited before product was driven.
```

The spec `cite.spec.js` references `patentFile: 'US11427642.json'` in its
parametrized test cases, but the file is missing from `tests/e2e/fixtures/patents/`.

### What's actually on disk

```
$ ls tests/e2e/fixtures/patents/
US10000000.json    US10000001.json    US11000000.json    US11427643.json
                                                          ^^^^^^^^^^^^^^^
```

`US11427643.json` is present (off-by-one); `US11427642.json` is absent. The
fixture appears to have been renamed during a Phase 30 fixture-rotation but
the spec was not updated.

### Suspected root cause (for the auto-fix LLM)

This is a tests/ harness bug — the product code is not implicated. Two
plausible fixes:

1. **Update the spec parameter** in `tests/e2e/specs/cite.spec.js`: change
   the `patentFile: 'US11427642.json'` reference to `'US11427643.json'`
   (the file that actually exists). Verify by re-running the spec in
   isolation: `npx playwright test cite.spec.js -g US11427642` should
   exit 0 after the rename.
2. **Restore the fixture** by copying `US11427643.json` to
   `US11427642.json` if the original fixture was intentionally targeting
   a specific patent ID that's referenced in the golden baseline. Check
   `tests/golden/baseline.json` for `US11427642` entries before deciding
   between the two paths — if the golden references US11427642, restore
   the fixture; if it references US11427643, rename the spec.

NEVER change the product code to "work around" a harness bug. NEVER delete
the failing spec. NEVER globally bump every Playwright timeout — the
harness MUST fail fast when a fixture is genuinely missing.

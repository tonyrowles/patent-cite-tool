<!-- fp: c3d4e5f6a1b2 -->
case-id: US11427642-dom-drift-1

## Triage finding (Phase 28 RPT-02 — GOOGLE_DOM_DRIFT)

**ERROR_CLASS:** GOOGLE_DOM_DRIFT
**Verifier tier used:** N/A — pre-flight DOM probe failed before product was exercised
**Rerun verdict:** CONFIRMED (3/3 replays hit the same selector miss)
**stable_runs:** 6

### What the harness saw

The pre-flight DOM probe in `tests/e2e/lib/google-patents-page.js` polled
for `[data-testid="patent-text"]` to confirm the page had finished hydrating
before invoking the extension. The selector returned `null` after the
30-second default wait:

```
selectText: locator timeout — '[data-testid="patent-text"]' never matched
  on https://patents.google.com/patent/US11427642/en
Pre-flight probe: 0 matches; aborting test.
```

The harness reported "no patent body found" and exited without driving the
extension. The product itself was NOT exercised.

### What Google Patents currently renders

A manual inspection of the current page DOM (captured 2026-05-31 14:22 UTC)
shows Google has refactored the patent body container:

```html
<!-- OLD (pre-drift) -->
<section data-testid="patent-text" class="patent-body">...

<!-- NEW (post-drift, observed today) -->
<article class="document-paragraphs" data-content-type="patent-spec">
  <section class="claim-section">...
  <section class="spec-section">...
</article>
```

The `data-testid="patent-text"` attribute is gone. The new container is
`article.document-paragraphs[data-content-type="patent-spec"]`.

### Suspected root cause (for the auto-fix LLM)

UI deploy — Google ships Google Patents redesigns roughly every 4-6 weeks.
The selector layer is the only file that needs updating:

1. **Update the selector** in `tests/e2e/lib/google-patents-page.js`. Prefer
   the new `[data-content-type="patent-spec"]` (which is also a stable
   data-attribute) over a CSS-class selector. Add the new container as the
   PRIMARY selector and keep the old `[data-testid="patent-text"]` as a
   FALLBACK only if it makes the change trivially rollbackable.
2. **Cross-reference the text-selection selectors** in
   `tests/e2e/lib/select-text.js` — the inner `.spec-section` / `.claim-section`
   children may need parallel updates if `selectText` walks the DOM with
   a stale selector.

NEVER paper over with a longer `page.waitFor*` timeout (the selector simply
doesn't exist any more — waiting forever won't help). NEVER wrap the missing
element in try/catch and swallow it — that produces false-pass test runs
on a broken extension surface.

<!-- fp: a1b2c3d4e5f6 -->
case-id: US11427642-hallucinated-1

## Triage finding (Phase 31 LLM-04 exploratory mode)

**ERROR_CLASS:** LLM_HALLUCINATED_SELECTION
**Verifier tier used:** D (failed — selection not found in patent body)
**Rerun verdict:** CONFIRMED (3/3 replays produced the same hallucinated selection)
**stable_runs:** 2

### What the LLM produced

The exploratory `claude -p` invocation proposed selectedText:

> "the present invention provides a method for processing structured data in real-time"

The selection driver attempted to locate this needle in the patent specification
after `wsNorm()` whitespace normalization and `tightNorm()` ligature folding.
Neither normalization tier located the needle. The selection driver returned
status=fail with tier_used='D' (catch-all "not found"); the harness was NOT
invoked, so no extension citation was produced.

### What the patent ACTUALLY contains

Search of the wsNorm'd patent body for any 8-word substring of the LLM's
selection returns 0 matches. The closest fuzzy match (Levenshtein distance
14 on the first 7 words) is:

> "the present invention provides methods of processing data streams"

— which is similar in shape but differs in 4 of the first 9 words. The LLM
appears to have synthesized plausible-sounding patent-prose vocabulary without
copying any verbatim phrase from the spec.

### Suspected root cause (for the auto-fix LLM)

The exploratory mode's prompt asks the LLM to "select a passage that
illustrates the patent's novel contribution." A non-strict prompt has
historically tempted the model to paraphrase rather than quote. Two
plausible fixes:

1. **Production-side sanitizer** in `tests/e2e/lib/select-text.js`: when
   `tier_used === 'D'`, fall through to a "longest-common-substring against
   wsNorm body" probe AND log the diff between LLM-proposed and best-match
   to the run report — this gives the next triage cycle real evidence of
   the hallucination shape.
2. **Spec-extraction sanitizer** (production code that builds the LLM
   prompt context): pre-extract the patent body and pass an explicit
   `<patent_spec>...</patent_spec>` envelope into the exploratory prompt
   so the model has the verbatim source rather than its training-set memory.

NEVER loosen the selection contract to "if the LLM string isn't found,
match the nearest paragraph." That silently masks future hallucinations.

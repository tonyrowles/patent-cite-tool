// tests/e2e/lib/selection.js
//
// STUB — Phase 27 SEL-01 fills this in. Phase 26's smoke spec does NOT
// trigger any selection (per CONTEXT.md decision: smoke proves infrastructure,
// not end-to-end behavior).
//
// Exported so the module path is grep-able and Phase 27 can replace the
// implementation without churning import sites.

/**
 * @throws {Error} always — Phase 27 implements SEL-01.
 */
export async function selectText() {
  throw new Error(
    'selectText: not implemented in Phase 26 — Phase 27 SEL-01 owns this primitive',
  );
}

// tests/unit/prebuilt-context.test.js
//
// Unit tests for the options-page ("report a problem") prebuiltContext builder.
// Covers the Phase-5 code-review fix #1/#2: page-mode reports must carry the last
// citation's returnedCitation + confidenceTier (matched to the patent in context),
// not a hard-coded null / a never-written currentPatent.confidenceTier field.

import { describe, it, expect } from 'vitest';
import { buildPrebuiltContext } from '../../src/options/prebuilt-context.js';

const VERSION = '5.0.0';

describe('buildPrebuiltContext', () => {
  it('returns null when there is no prior patent', () => {
    expect(buildPrebuiltContext(null, null, VERSION)).toBeNull();
    expect(buildPrebuiltContext({}, null, VERSION)).toBeNull();
    expect(buildPrebuiltContext({ patentId: '' }, null, VERSION)).toBeNull();
  });

  it('strips the US prefix from patentNumber and nulls live-capture fields', () => {
    const ctx = buildPrebuiltContext({ patentId: 'US10617174B1' }, null, VERSION);
    expect(ctx.patentNumber).toBe('10617174B1');
    expect(ctx.selectionText).toBeNull();
    expect(ctx.xpathNode).toBeNull();
    expect(ctx.scrollY).toBeNull();
    expect(ctx.viewportWidth).toBeNull();
    expect(ctx.viewportHeight).toBeNull();
    expect(ctx.pdfParseStatus).toBeNull();
    expect(ctx.extensionVersion).toBe(VERSION);
  });

  it('uses returnedCitation + confidenceTier from a MATCHING last citation outcome', () => {
    const ctx = buildPrebuiltContext(
      { patentId: 'US10617174B1' },
      { patentId: 'US10617174B1', returnedCitation: 'Col. 5, ll. 12-14', confidenceTier: 'yellow' },
      VERSION
    );
    expect(ctx.returnedCitation).toBe('Col. 5, ll. 12-14');
    expect(ctx.confidenceTier).toBe('yellow');
  });

  it('ignores a last citation outcome for a DIFFERENT patent (no stale data)', () => {
    const ctx = buildPrebuiltContext(
      { patentId: 'US10617174B1' },
      { patentId: 'US9999999B2', returnedCitation: 'Col. 1, l. 1', confidenceTier: 'green' },
      VERSION
    );
    expect(ctx.returnedCitation).toBeNull();
    expect(ctx.confidenceTier).toBeNull();
  });

  it('nulls returnedCitation + confidenceTier when there is no last citation outcome', () => {
    const ctx = buildPrebuiltContext({ patentId: 'US10617174B1' }, null, VERSION);
    expect(ctx.returnedCitation).toBeNull();
    expect(ctx.confidenceTier).toBeNull();
  });
});

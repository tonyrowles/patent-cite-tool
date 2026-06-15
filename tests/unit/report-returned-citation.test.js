// tests/unit/report-returned-citation.test.js
//
// Guard for code-review fix #1: the in-citation report flow must carry the actual
// citation (returnedCitation) so the Discord "inaccurate_citation" triage card shows
// the wrong citation that was produced. content-script builds the reportOutcome that
// report-dialog reads as `reportOutcome.returnedCitation`; previously it was never set
// (always null). No jsdom in this project, so this is a static source guard — live
// behaviour is covered by UAT.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../../src/content/content-script.js', import.meta.url)),
  'utf8'
);

describe('in-citation report carries returnedCitation (fix #1)', () => {
  it('both success-path reportOutcomes pass returnedCitation: prefixedCitation', () => {
    const matches = src.match(/returnedCitation:\s*prefixedCitation/g) || [];
    // One for the application (paragraph) success path, one for the granted (CITATION_RESULT) path.
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('persists lastCitationOutcome for the options-page fallback (fix #2)', () => {
    expect(src).toMatch(/lastCitationOutcome:\s*\{/);
  });
});

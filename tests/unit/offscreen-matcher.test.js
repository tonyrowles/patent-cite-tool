// Mock pdf-parser.js to avoid loading the browser-only pdf.mjs (which needs
// DOMMatrix, unavailable in Node). The offscreen matching tests exercise only
// matchAndCiteOffscreen — no PDF parsing needed.
vi.mock('../../src/offscreen/pdf-parser.js', () => ({
  extractTextFromPdf: vi.fn(),
}));

// Mock position-map-builder.js (also imported by offscreen.js at module scope)
vi.mock('../../src/offscreen/position-map-builder.js', () => ({
  buildPositionMap: vi.fn(),
}));

import { matchAndCiteOffscreen } from '../../src/offscreen/offscreen.js';

describe('matchAndCiteOffscreen: wrap-hyphen normalization', () => {
  it('matches wrap-hyphenated selection against un-hyphenated PDF entry', () => {
    const positionMap = [
      { text: 'preventing fraudulent', column: 1, lineNumber: 24, page: 1, section: 'spec', hasWrapHyphen: false },
      { text: 'transactions from occurring', column: 1, lineNumber: 25, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    const selectedText = 'fraudulent trans- actions from occurring';
    const result = matchAndCiteOffscreen(selectedText, positionMap, '', '');
    expect(result).not.toBeNull();
    expect(result.citation).toBe('1:24-25');
  });

  it('preserves real hyphens (no space after hyphen)', () => {
    const positionMap = [
      { text: 'well-known prior art', column: 1, lineNumber: 10, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    const selectedText = 'well-known prior art';
    const result = matchAndCiteOffscreen(selectedText, positionMap, '', '');
    expect(result).not.toBeNull();
    expect(result.citation).toBe('1:10');
  });

  it('returns null for empty input', () => {
    const result = matchAndCiteOffscreen('', [], '', '');
    expect(result).toBeNull();
  });

  it('strips multiple wrap hyphens in one selection', () => {
    const positionMap = [
      { text: 'preventing fraudulent transactions', column: 1, lineNumber: 24, page: 1, section: 'spec', hasWrapHyphen: false },
      { text: 'and unauthorized operations from', column: 1, lineNumber: 25, page: 1, section: 'spec', hasWrapHyphen: false },
    ];
    const selectedText = 'fraudulent trans- actions and un- authorized operations';
    const result = matchAndCiteOffscreen(selectedText, positionMap, '', '');
    expect(result).not.toBeNull();
    expect(result.citation).toBe('1:24-25');
  });
});

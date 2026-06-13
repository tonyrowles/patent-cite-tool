// tests/unit/report-dialog.test.js
//
// Phase 4 Plan 01 (PAY-09) — TDD RED phase tests for PAY-09 capture helpers:
//   getReportDiagnostics(), getPdfParseStatus(), getBrowserString(), getOsString()
//
// Coverage:
//   - getPdfParseStatus: 5-case derivation table (skipped/cache-hit/success/failed/null)
//   - getReportDiagnostics: returns correct shape (mocked window APIs)
//   - getBrowserString: low-fidelity Chrome/Firefox slice (not full UA)
//   - getOsString: low-fidelity OS token (Windows/macOS/Linux etc.)
//   - PAY-03 guard: full userAgent string never appears in getBrowserString output

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getReportDiagnostics,
  getPdfParseStatus,
  getBrowserString,
  getOsString,
  _resetBufferForTest,
} from '../../src/content/report-dialog.js';

// ---------------------------------------------------------------------------
// Stateful chrome.storage.local mock
// ---------------------------------------------------------------------------

function buildChromeMock(store) {
  return {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (typeof key === 'string') return { [key]: store[key] };
          return Object.assign({}, store);
        }),
        set: vi.fn(async (obj) => {
          Object.assign(store, obj);
        }),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// PAY-09: getPdfParseStatus derivation tests
// ---------------------------------------------------------------------------

describe('PAY-09: getPdfParseStatus', () => {
  let store;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('chrome', buildChromeMock(store));
    _resetBufferForTest();
  });

  it('returns "skipped" for application patents without reading storage', async () => {
    // Storage has no currentPatent — but skipped should not read it
    const result = await getPdfParseStatus('application');
    expect(result).toBe('skipped');
    // Verify storage was NOT read (optimization)
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('returns "cache-hit" when status==="parsed" and source===null', async () => {
    store.currentPatent = { status: 'parsed', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('cache-hit');
  });

  it('returns "success" when status==="parsed" and source==="google"', async () => {
    store.currentPatent = { status: 'parsed', source: 'google' };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('success');
  });

  it('returns "success" when status==="parsed" and source==="uspto"', async () => {
    store.currentPatent = { status: 'parsed', source: 'uspto' };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('success');
  });

  it('returns "failed" for status==="error"', async () => {
    store.currentPatent = { status: 'error', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('returns "failed" for status==="no-text-layer"', async () => {
    store.currentPatent = { status: 'no-text-layer', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('returns "failed" for status==="unavailable"', async () => {
    store.currentPatent = { status: 'unavailable', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('returns null when patent is null', async () => {
    store.currentPatent = null;
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('returns null when patent is undefined (key missing)', async () => {
    // store has no currentPatent key
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('returns null for status==="fetching" (not yet ready)', async () => {
    store.currentPatent = { status: 'fetching', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('returns null for status==="parsing" (not yet ready)', async () => {
    store.currentPatent = { status: 'parsing', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('returns null (not throws) when chrome.storage.local rejects', async () => {
    chrome.storage.local.get = vi.fn(() => Promise.reject(new Error('storage error')));
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PAY-09: getReportDiagnostics shape tests
// ---------------------------------------------------------------------------

describe('PAY-09: getReportDiagnostics', () => {
  beforeEach(() => {
    _resetBufferForTest();
    // Mock window APIs
    vi.stubGlobal('window', {
      scrollY: 120,
      innerWidth: 1280,
      innerHeight: 800,
      getSelection: vi.fn(() => ({
        rangeCount: 0,
        toString: () => 'selected text',
      })),
    });
    vi.stubGlobal('Node', { ELEMENT_NODE: 1, TEXT_NODE: 3 });
    vi.stubGlobal('document', {
      body: {},
      documentElement: {},
    });
  });

  it('returns an object with the required PAY-09 fields', () => {
    const diag = getReportDiagnostics();
    expect(diag).toHaveProperty('xpathNode');
    expect(diag).toHaveProperty('scrollY');
    expect(diag).toHaveProperty('viewportWidth');
    expect(diag).toHaveProperty('viewportHeight');
    expect(diag).toHaveProperty('selectionText');
  });

  it('reads scrollY from window.scrollY', () => {
    const diag = getReportDiagnostics();
    expect(diag.scrollY).toBe(120);
  });

  it('reads viewportWidth from window.innerWidth', () => {
    const diag = getReportDiagnostics();
    expect(diag.viewportWidth).toBe(1280);
  });

  it('reads viewportHeight from window.innerHeight', () => {
    const diag = getReportDiagnostics();
    expect(diag.viewportHeight).toBe(800);
  });

  it('reads selectionText from window.getSelection().toString()', () => {
    window.getSelection = vi.fn(() => ({
      rangeCount: 0,
      toString: () => 'the selected text',
    }));
    const diag = getReportDiagnostics();
    expect(diag.selectionText).toBe('the selected text');
  });

  it('returns null selectionText when getSelection returns null', () => {
    window.getSelection = vi.fn(() => null);
    const diag = getReportDiagnostics();
    expect(diag.selectionText).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PAY-09: getBrowserString (PAY-03: low-fidelity only)
// ---------------------------------------------------------------------------

describe('PAY-09: getBrowserString', () => {
  beforeEach(() => {
    _resetBufferForTest();
  });

  it('returns Chrome version token from Chrome UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' });
    const result = getBrowserString();
    expect(result).toBe('Chrome/125.0.0.0');
    // PAY-03: must not return the full userAgent — verify result is short token only
    expect(result.includes('Mozilla')).toBe(false);
    expect(result.includes('AppleWebKit')).toBe(false);
  });

  it('returns Firefox version token from Firefox UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0' });
    const result = getBrowserString();
    expect(result).toBe('Firefox/127.0');
    expect(result.includes('Mozilla')).toBe(false);
  });

  it('returns null for unrecognized UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'SomeBrowser/1.0' });
    const result = getBrowserString();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PAY-09: getOsString (PAY-03: low-fidelity only)
// ---------------------------------------------------------------------------

describe('PAY-09: getOsString', () => {
  beforeEach(() => {
    _resetBufferForTest();
  });

  it('returns "Windows 10" for Windows 10 UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    const result = getOsString();
    expect(result).toBe('Windows 10');
  });

  it('returns "macOS" for Mac UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    const result = getOsString();
    expect(result).toBe('macOS');
  });

  it('returns "Linux" for Linux UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    const result = getOsString();
    expect(result).toBe('Linux');
  });

  it('returns a non-null value for all standard UAs (does not throw)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Android 12; Mobile)' });
    const result = getOsString();
    expect(result).toBeDefined();
  });
});

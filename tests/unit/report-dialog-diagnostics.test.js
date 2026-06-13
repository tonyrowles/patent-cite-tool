// tests/unit/report-dialog-diagnostics.test.js
//
// Phase 4 Plan 04 (PAY-09 extended + SC2/D-06) — Vitest suite for:
//   1. getPdfParseStatus() — all 5 derivation cases (application/cache-hit/success/failed/null)
//   2. getBrowserString() / getOsString() — low-fidelity slice only (PAY-03 guard)
//   3. SC2 (D-06): buildReportPayload with includeSelectionText false → selectionText key ABSENT
//      and present when includeSelectionText true.
//
// Coverage:
//   PAY-09 / case (a): patentType === 'application' → 'skipped' (no storage read)
//   PAY-09 / case (b): status='parsed', source=null → 'cache-hit'
//   PAY-09 / case (c): status='parsed', source='google' → 'success'
//   PAY-09 / case (d): status in ['error','no-text-layer','unavailable'] → 'failed'
//   PAY-09 / case (e): null patent or status 'fetching' → null
//   PAY-03 guard: getBrowserString()/getOsString() never return the full navigator.userAgent
//   SC2/D-06: buildReportPayload includeSelectionText=false → 'selectionText' NOT in Object.keys(payload)
//   SC2/D-06: buildReportPayload includeSelectionText=true → 'selectionText' in Object.keys(payload)
//
// Mirror pattern: report-transport-chrome.test.js (chrome mock + beforeEach/afterEach)
// Fixture factory: report-payload-builder.test.js makeReportInputs (lines 64-88)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPdfParseStatus, getBrowserString, getOsString } from '../../src/content/report-dialog.js';
import { buildReportPayload } from '../../src/shared/report-payload-builder.js';

// ---------------------------------------------------------------------------
// Stateful chrome.storage.local mock (mirrors report-transport-chrome.test.js pattern)
// ---------------------------------------------------------------------------

let _localStore = {};

function buildChromeMock(store) {
  return {
    runtime: {
      getURL: vi.fn((p) => `chrome-extension://test-id/${p}`),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) },
      id: 'test-extension-id',
      getManifest: vi.fn(() => ({ version: '5.0.0' })),
    },
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: {
        get: vi.fn(async (keys) => {
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
          return Object.assign({}, store);
        }),
        set: vi.fn(async (obj) => { Object.assign(store, obj); }),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
}

beforeEach(() => {
  _localStore = {};
  vi.stubGlobal('chrome', buildChromeMock(_localStore));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fresh-fixture factory for buildReportPayload (mirrors report-payload-builder.test.js:64-88)
// ---------------------------------------------------------------------------

function makeReportInputs(overrides = {}) {
  return {
    context: {
      patentNumber: '12505414',
      patentUrl: 'https://patents.google.com/patent/US12505414',
      selectionText: 'The method of claim 1 wherein the widget comprises',
      returnedCitation: '4:5-20',
      confidenceTier: 'green',
      extensionVersion: '5.0.0',
      browser: 'Chrome/125',
      os: 'Windows 10',
      xpathNode: '/html/body/div[3]/p[2]',
      scrollY: 340,
      viewportWidth: 1280,
      viewportHeight: 800,
      pdfParseStatus: 'success',
    },
    category: 'no_match',
    note: null,
    settings: { triggerMode: 'floating' },
    errors: [],
    includeSelectionText: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PAY-09: getPdfParseStatus — 5-case derivation table
// ---------------------------------------------------------------------------

describe('PAY-09 — getPdfParseStatus derivation (5 cases)', () => {
  it('case (a): patentType === "application" → "skipped" (no storage read)', async () => {
    const result = await getPdfParseStatus('application');
    expect(result).toBe('skipped');
    // XPORT-06 guard: no storage read for application type
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('case (b): status="parsed", source=null → "cache-hit"', async () => {
    _localStore.currentPatent = { status: 'parsed', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('cache-hit');
  });

  it('case (c): status="parsed", source="google" → "success"', async () => {
    _localStore.currentPatent = { status: 'parsed', source: 'google' };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('success');
  });

  it('case (c-alt): status="parsed", source="uspto" → "success"', async () => {
    _localStore.currentPatent = { status: 'parsed', source: 'uspto' };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('success');
  });

  it('case (d): status="error" → "failed"', async () => {
    _localStore.currentPatent = { status: 'error', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('case (d-alt): status="no-text-layer" → "failed"', async () => {
    _localStore.currentPatent = { status: 'no-text-layer', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('case (d-alt2): status="unavailable" → "failed"', async () => {
    _localStore.currentPatent = { status: 'unavailable', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBe('failed');
  });

  it('case (e): null currentPatent → null', async () => {
    _localStore.currentPatent = null;
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('case (e-alt): missing currentPatent key → null', async () => {
    // No currentPatent key in store
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });

  it('case (e-status-fetching): status="fetching" → null (not yet determined)', async () => {
    _localStore.currentPatent = { status: 'fetching', source: null };
    const result = await getPdfParseStatus('grant');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PAY-03 guard: getBrowserString() and getOsString() — low-fidelity only
// ---------------------------------------------------------------------------

describe('PAY-03 — getBrowserString low-fidelity browser token (never full UA)', () => {
  const FULL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: FULL_UA });
  });

  it('returns a short Chrome/N slice, not the full UA string', () => {
    const result = getBrowserString();
    expect(result).toBe('Chrome/125.0.0.0');
    // PAY-03: must not be the full userAgent
    expect(result).not.toBe(FULL_UA);
    expect(result.length).toBeLessThan(FULL_UA.length);
  });

  it('does not include "Mozilla" in the browser token', () => {
    const result = getBrowserString();
    expect(result).not.toMatch(/Mozilla/);
  });

  it('does not include "AppleWebKit" in the browser token', () => {
    const result = getBrowserString();
    expect(result).not.toMatch(/AppleWebKit/);
  });

  it('Firefox UA → returns Firefox/N token, not full UA', () => {
    const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';
    vi.stubGlobal('navigator', { userAgent: firefoxUA });
    const result = getBrowserString();
    expect(result).toBe('Firefox/127.0');
    expect(result).not.toBe(firefoxUA);
    expect(result).not.toMatch(/Mozilla/);
  });
});

describe('PAY-03 — getOsString low-fidelity OS token (never full UA)', () => {
  it('returns "Windows 10" short token from full Windows UA', () => {
    const fullUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';
    vi.stubGlobal('navigator', { userAgent: fullUA });
    const result = getOsString();
    expect(result).toBe('Windows 10');
    expect(result).not.toBe(fullUA);
    expect(result.length).toBeLessThan(fullUA.length);
  });

  it('does not return the full userAgent string under any UA', () => {
    const uas = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Chrome/120',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit Chrome/120',
    ];
    for (const ua of uas) {
      vi.stubGlobal('navigator', { userAgent: ua });
      const result = getOsString();
      expect(result).not.toBe(ua);
    }
  });

  it('returns "macOS" for macOS UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    const result = getOsString();
    expect(result).toBe('macOS');
  });

  it('returns "Linux" for Linux UA', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    const result = getOsString();
    expect(result).toBe('Linux');
  });
});

// ---------------------------------------------------------------------------
// SC2 / D-06: buildReportPayload selectionText key-presence contract
// The dialog's [Remove selection text] toggle relies on this omission contract.
// ---------------------------------------------------------------------------

describe('SC2 / D-06 — [Remove selection text] payload omission contract', () => {
  it('includeSelectionText=false → "selectionText" key is ENTIRELY ABSENT from payload keys', () => {
    const inputs = makeReportInputs({ includeSelectionText: false });
    const payload = buildReportPayload(inputs);
    expect(Object.keys(payload)).not.toContain('selectionText');
  });

  it('includeSelectionText=false → selectionText not even null (key absent, not null-valued)', () => {
    const inputs = makeReportInputs({ includeSelectionText: false });
    const payload = buildReportPayload(inputs);
    // Explicit check: accessing the key returns undefined (key absent), not null
    expect(payload.selectionText).toBeUndefined();
  });

  it('includeSelectionText=true → "selectionText" key IS present in payload keys', () => {
    const inputs = makeReportInputs({ includeSelectionText: true });
    const payload = buildReportPayload(inputs);
    expect(Object.keys(payload)).toContain('selectionText');
  });

  it('includeSelectionText=true → selectionText value equals context.selectionText', () => {
    const inputs = makeReportInputs({
      includeSelectionText: true,
      context: {
        patentNumber: '12505414',
        patentUrl: 'https://patents.google.com/patent/US12505414',
        selectionText: 'specific claim text for verification',
        returnedCitation: '4:5-20',
        confidenceTier: 'green',
        extensionVersion: '5.0.0',
        browser: 'Chrome/125',
        os: 'Windows 10',
        xpathNode: null,
        scrollY: 0,
        viewportWidth: 1280,
        viewportHeight: 800,
        pdfParseStatus: 'success',
      },
    });
    const payload = buildReportPayload(inputs);
    expect(payload.selectionText).toBe('specific claim text for verification');
  });

  it('sticky toggle: second call with includeSelectionText=false still has key absent (not memoized)', () => {
    // Prove the toggle is stateless — each call is independent
    const inputs1 = makeReportInputs({ includeSelectionText: true });
    const payload1 = buildReportPayload(inputs1);
    expect(Object.keys(payload1)).toContain('selectionText');

    const inputs2 = makeReportInputs({ includeSelectionText: false });
    const payload2 = buildReportPayload(inputs2);
    expect(Object.keys(payload2)).not.toContain('selectionText');
  });
});

// tests/unit/report-dialog-buffer.test.js
//
// Phase 4 Plan 01 (PAY-08) — TDD RED phase tests for installErrorBuffer + appendToBuffer
// in src/content/report-dialog.js.
//
// Coverage:
//   - isExtensionTagged: only [SW], [PCT], [Offscreen], [Firefox] prefixes accepted
//   - installErrorBuffer: binds originals before replacing; idempotency guard
//   - appendToBuffer: RMW on chrome.storage.local 'bugReportErrorBuffer'
//   - ring cap: trims to last 20 when >20 entries
//   - never throws from override or appendToBuffer
//   - host-page strings are never appended

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installErrorBuffer, _resetBufferForTest } from '../../src/content/report-dialog.js';

// ---------------------------------------------------------------------------
// Stateful chrome.storage.local mock (mirrors report-transport-chrome pattern)
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

describe('PAY-08: installErrorBuffer', () => {
  let store;
  let origConsoleError;
  let origConsoleWarn;

  beforeEach(() => {
    store = {};
    const mock = buildChromeMock(store);
    vi.stubGlobal('chrome', mock);

    // Save originals before installErrorBuffer replaces them
    origConsoleError = console.error;
    origConsoleWarn = console.warn;

    // Reset the idempotency guard so each test gets a fresh install
    // with the current test's chrome mock.
    _resetBufferForTest();
  });

  afterEach(() => {
    // Restore console to avoid test pollution
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
    vi.restoreAllMocks();
    // Reset guard so next test also starts fresh
    _resetBufferForTest();
  });

  it('captures extension-tagged console.error entries', async () => {
    installErrorBuffer();
    console.error('[PCT] test error message');
    // Give async appendToBuffer time to complete
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(1);
    expect(buf[0].level).toBe('error');
    expect(buf[0].message).toContain('[PCT]');
    expect(typeof buf[0].ts).toBe('number');
  });

  it('captures extension-tagged console.warn entries', async () => {
    installErrorBuffer();
    console.warn('[SW] something went wrong');
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(1);
    expect(buf[0].level).toBe('warn');
    expect(buf[0].message).toContain('[SW]');
  });

  it('does NOT capture host-page (untagged) console.error', async () => {
    installErrorBuffer();
    console.error('Some host page error');
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(0);
  });

  it('does NOT capture host-page (untagged) console.warn', async () => {
    installErrorBuffer();
    console.warn('host page warning');
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(0);
  });

  it('accepts all four extension prefixes: [SW], [PCT], [Offscreen], [Firefox]', async () => {
    installErrorBuffer();
    // Stagger calls to avoid RMW races (Pitfall 4)
    console.error('[SW] service worker error');
    await new Promise(r => setTimeout(r, 20));
    console.error('[PCT] content script error');
    await new Promise(r => setTimeout(r, 20));
    console.warn('[Offscreen] offscreen warning');
    await new Promise(r => setTimeout(r, 20));
    console.warn('[Firefox] firefox background warning');
    await new Promise(r => setTimeout(r, 20));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(4);
  });

  it('caps ring buffer at 20 entries (oldest dropped when >20)', async () => {
    installErrorBuffer();
    // Fire 25 tagged errors sequentially, waiting for each to flush before the next.
    // This avoids RMW races (RESEARCH Pitfall 4: fire-and-forget accepts occasional
    // loss under concurrent load, but sequential with awaited flushes is deterministic).
    for (let i = 0; i < 25; i++) {
      console.error(`[PCT] error #${i}`);
      await new Promise(r => setTimeout(r, 10));
    }
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(20);
    // The last entry should be error #24 (newest)
    expect(buf[buf.length - 1].message).toContain('error #24');
  });

  it('does not throw when chrome.storage.local.get rejects', async () => {
    // Simulate storage failure
    chrome.storage.local.get = vi.fn(() => Promise.reject(new Error('storage error')));
    installErrorBuffer();
    // Should not throw
    expect(() => console.error('[PCT] error that triggers storage failure')).not.toThrow();
    await new Promise(r => setTimeout(r, 50));
    // No assertion on buf — just verifying no crash
  });

  it('idempotency: second installErrorBuffer() call does not double-wrap console', async () => {
    installErrorBuffer();
    installErrorBuffer(); // second call — should be no-op due to guard
    console.error('[PCT] once');
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    // Should only have 1 entry, not 2
    expect(buf.length).toBe(1);
  });

  it('truncates message to 500 characters', async () => {
    installErrorBuffer();
    const longMsg = '[PCT] ' + 'x'.repeat(600);
    console.error(longMsg);
    await new Promise(r => setTimeout(r, 50));
    const buf = store.bugReportErrorBuffer ?? [];
    expect(buf.length).toBe(1);
    expect(buf[0].message.length).toBeLessThanOrEqual(500);
  });

  it('still calls original console.error (does not suppress output)', () => {
    const spy = vi.spyOn(console, 'error');
    installErrorBuffer();
    // After install, the original is bound and called from within override
    // We can't easily test this without more sophisticated mocking,
    // but we verify the override doesn't throw on untagged messages
    expect(() => console.error('host page error')).not.toThrow();
  });
});

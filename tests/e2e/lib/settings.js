// tests/e2e/lib/settings.js
//
// setTriggerMode(context, mode)
//
// Writes the extension's triggerMode setting to chrome.storage.sync via the
// extension's service-worker handle. The content script reads triggerMode at
// init (src/content/content-script.js:160 — chrome.storage.sync.get with
// DEFAULT_SETTINGS = { triggerMode: 'floating-button', ... }) and also listens
// for changes (line 165 — chrome.storage.onChanged on the 'sync' area).
//
// CONTRACT:
//   - Call BEFORE gotoPatent(page, ...). The content script reads the stored
//     value at init; once the page has loaded, only the onChanged listener
//     can update cachedSettings, and the per-test fresh persistent context
//     guarantees a fresh init read for every test.
//
// CORRECTION NOTE: 27-CONTEXT.md previously said the default was 'auto' and
// the storage area was chrome.storage.local — both are WRONG per
// 27-RESEARCH.md ("CONTEXT.md Contradictions"). Default is 'floating-button';
// storage area is chrome.storage.sync.
//
// Phase 27 SEL-02-adjacent (per VALIDATION.md row 27-02-01).

const VALID_MODES = new Set(['auto', 'floating-button', 'context-menu', 'silent']);

/**
 * Write the extension's triggerMode to chrome.storage.sync.
 *
 * @param {import('@playwright/test').BrowserContext} context
 *   The persistent context returned by loadExtension. context.serviceWorkers()
 *   must have at least one entry (HARN-02 probe guarantees this for any
 *   context produced by loadExtension).
 * @param {'auto'|'floating-button'|'context-menu'|'silent'} mode
 * @returns {Promise<void>}
 */
export async function setTriggerMode(context, mode) {
  if (!context || typeof context.serviceWorkers !== 'function') {
    throw new Error('setTriggerMode: invalid context (expected BrowserContext from loadExtension)');
  }
  if (!VALID_MODES.has(mode)) {
    throw new Error(`setTriggerMode: invalid mode "${mode}" — expected one of ${[...VALID_MODES].join(', ')}`);
  }
  const [sw] = context.serviceWorkers();
  if (!sw) {
    throw new Error('setTriggerMode: no service worker attached to context (loadExtension should have probed)');
  }
  await sw.evaluate(async (m) => {
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ triggerMode: m }, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || 'chrome.storage.sync.set failed'));
        else resolve();
      });
    });
  }, mode);
}

/**
 * Wait until the extension's `chrome.storage.local.currentPatent.status` is
 * 'parsed' (PositionMap is ready). This is required before silent-mode tests
 * fire Ctrl+C on grant patents: silent's preSilentCitation early-exits with
 * `{ type: 'plain' }` when the PDF isn't parsed yet, which means the copy
 * handler lets default copy through (no setData → empty observed citation).
 *
 * Polls the service worker (which has access to chrome.storage.local) every
 * 250ms until `status === 'parsed'` or until `timeoutMs` elapses.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ status: string, source?: string, lineCount?: number }>}
 *   Resolves with the parsed-patent snapshot on success.
 * @throws {Error} on timeout — error message contains the last observed status.
 */
export async function waitForPatentParsed(context, { timeoutMs = 30_000 } = {}) {
  if (!context || typeof context.serviceWorkers !== 'function') {
    throw new Error('waitForPatentParsed: invalid context');
  }
  const [sw] = context.serviceWorkers();
  if (!sw) {
    throw new Error('waitForPatentParsed: no service worker attached');
  }
  const deadline = Date.now() + timeoutMs;
  let last = { status: 'unknown' };
  while (Date.now() < deadline) {
    const snap = await sw.evaluate(async () => {
      const data = await chrome.storage.local.get('currentPatent');
      const p = data.currentPatent || null;
      return p
        ? {
            status: p.status,
            source: p.source,
            patentId: p.patentId,
            lineCount: p.lineCount,
            columnCount: p.columnCount,
          }
        : { status: 'no-currentPatent' };
    });
    last = snap;
    if (snap.status === 'parsed') return snap;
    if (snap.status === 'error' || snap.status === 'unavailable' || snap.status === 'no-text-layer') {
      throw new Error(`waitForPatentParsed: terminal status "${snap.status}" — cannot proceed`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `waitForPatentParsed: timed out after ${timeoutMs}ms — last status="${last.status}"`,
  );
}

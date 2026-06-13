/**
 * Report Dialog module for the Patent Citation Tool extension.
 *
 * Phase 4 deliverables:
 *   PAY-08: Error ring buffer (installErrorBuffer + appendToBuffer)
 *   PAY-09: Live diagnostic capture helpers (getReportDiagnostics, getPdfParseStatus, browser/OS)
 *
 * This file exports the helpers section only.
 * The dialog UI (showReportDialog, mountReportButton) is Plan 02.
 *
 * IMPORTANT: installErrorBuffer() must be called once at module init in each of:
 *   - src/content/content-script.js
 *   - src/background/service-worker.js
 *   - src/firefox/background.js
 * The idempotency guard prevents double-wrapping on duplicate calls.
 */

// ---------------------------------------------------------------------------
// PAY-08: Error ring buffer constants (D-08)
// ---------------------------------------------------------------------------

const ERROR_BUFFER_KEY = 'bugReportErrorBuffer';
const BUFFER_MAX = 20;

/** Extension-tagged prefix list per D-08. Only these trigger buffer writes. */
const EXTENSION_PREFIXES = ['[SW]', '[PCT]', '[Offscreen]', '[Firefox]'];

/** Idempotency guard — prevents double-wrapping if installErrorBuffer() called twice. */
let _bufferInstalled = false;

/**
 * Reset the idempotency guard. TEST USE ONLY — not called in production.
 * Allows vitest tests to re-install the buffer with a fresh chrome mock per test.
 * @internal
 */
export function _resetBufferForTest() {
  _bufferInstalled = false;
}

// ---------------------------------------------------------------------------
// PAY-08: Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true only when the first argument is a string starting with one of
 * the four extension prefixes. Host-page strings never match.
 *
 * @param {unknown[]} args - Arguments passed to console.error / console.warn
 * @returns {boolean}
 */
function isExtensionTagged(args) {
  const first = args[0];
  if (typeof first !== 'string') return false;
  return EXTENSION_PREFIXES.some(p => first.startsWith(p));
}

/**
 * Read-Modify-Write the ring buffer in chrome.storage.local.
 * Pushes one entry and trims to BUFFER_MAX. Fire-and-forget — never throws.
 *
 * @param {'error'|'warn'} level
 * @param {unknown[]} args - Console arguments to serialize
 */
async function appendToBuffer(level, args) {
  try {
    const message = args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
      .substring(0, 500);

    const entry = { level, message, ts: Date.now() };

    const stored = await chrome.storage.local.get(ERROR_BUFFER_KEY);
    const buf = Array.isArray(stored[ERROR_BUFFER_KEY]) ? stored[ERROR_BUFFER_KEY] : [];
    buf.push(entry);
    const trimmed = buf.length > BUFFER_MAX ? buf.slice(buf.length - BUFFER_MAX) : buf;
    await chrome.storage.local.set({ [ERROR_BUFFER_KEY]: trimmed });
  } catch {
    // Per RESEARCH Pitfall 4: never throw from error handler
  }
}

// ---------------------------------------------------------------------------
// PAY-08: Public API
// ---------------------------------------------------------------------------

/**
 * Install console.error / console.warn ring-buffer interceptors.
 *
 * Binds originals BEFORE replacing (per RESEARCH Pattern 5 / Anti-Pattern guard).
 * The override always calls the bound original synchronously, then fire-and-forgets
 * appendToBuffer only for extension-tagged messages (D-08: host-page strings excluded).
 *
 * Idempotent — safe to call multiple times; second+ calls are no-ops.
 */
export function installErrorBuffer() {
  if (_bufferInstalled) return;
  _bufferInstalled = true;

  // Bind originals FIRST to prevent recursion (RESEARCH Anti-Pattern)
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = function (...args) {
    origError(...args);
    if (isExtensionTagged(args)) appendToBuffer('error', args).catch(() => {});
  };

  console.warn = function (...args) {
    origWarn(...args);
    if (isExtensionTagged(args)) appendToBuffer('warn', args).catch(() => {});
  };
}

// ---------------------------------------------------------------------------
// PAY-09: XPath capture helpers
// ---------------------------------------------------------------------------

/**
 * Walk a DOM node's ancestors to produce an XPath string.
 * Returns '/html/body' for the body element. Never throws.
 *
 * @param {Node} node - The starting element node
 * @returns {string} XPath string like '/div[1]/span[2]/...'
 */
function getNodeXPath(node) {
  if (!node || node === document.body) return '/html/body';
  const parts = [];
  let current = node;
  while (current && current !== document.documentElement) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      current = current.parentNode;
      continue;
    }
    const tag = current.tagName.toLowerCase();
    let idx = 1;
    let sib = current.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName.toLowerCase() === tag) idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${tag}[${idx}]`);
    current = current.parentNode;
  }
  return '/' + parts.join('/');
}

/**
 * Derive an XPath from the current window selection's start container.
 * Called at Report-button-click time (RESEARCH Pitfall 3) — selection may be
 * cleared by the time the user clicks Submit.
 *
 * @returns {string|null} XPath string or null if no selection / error
 */
function getXPathFromSelection() {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    return getNodeXPath(node);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PAY-09: Public capture helpers
// ---------------------------------------------------------------------------

/**
 * Capture live page-context diagnostic fields at call time.
 * Plan 02 calls this at Report-button-click time (RESEARCH Pitfall 3).
 *
 * @returns {{ xpathNode: string|null, scrollY: number, viewportWidth: number, viewportHeight: number, selectionText: string|null }}
 */
export function getReportDiagnostics() {
  return {
    xpathNode: getXPathFromSelection(),
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    selectionText: window.getSelection()?.toString() ?? null,
  };
}

/**
 * Derive the PDF parse status from chrome.storage.local 'currentPatent'.
 * Derivation table (RESEARCH Pattern 4, VERIFIED service-worker.js:391-406):
 *
 *   patentType === 'application'                        → 'skipped'
 *   patent.status === 'parsed' && patent.source === null → 'cache-hit'
 *   patent.status === 'parsed'                           → 'success'
 *   status in ['error','no-text-layer','unavailable']    → 'failed'
 *   null patent or status 'fetching'/'parsing'           → null
 *
 * @param {string} patentType - 'application' or 'grant' (PATENT_TYPE constants)
 * @returns {Promise<'skipped'|'cache-hit'|'success'|'failed'|null>}
 */
export async function getPdfParseStatus(patentType) {
  if (patentType === 'application') return 'skipped';
  try {
    const data = await chrome.storage.local.get('currentPatent');
    const patent = data.currentPatent;
    if (!patent) return null;
    if (patent.status === 'parsed' && patent.source === null) return 'cache-hit';
    if (patent.status === 'parsed') return 'success';
    if (['error', 'no-text-layer', 'unavailable'].includes(patent.status)) return 'failed';
    return null; // fetching / parsing — not yet determined
  } catch {
    return null;
  }
}

/**
 * Return a low-fidelity browser identifier string (PAY-03: never the full userAgent).
 * Examples: 'Chrome/125', 'Firefox/127', null
 *
 * @returns {string|null}
 */
export function getBrowserString() {
  const ua = navigator.userAgent;
  return (
    ua.match(/Chrome\/[\d.]+/)?.[0] ??
    ua.match(/Firefox\/[\d.]+/)?.[0] ??
    null
  );
}

/**
 * Return a low-fidelity OS identifier string (PAY-03: never the full userAgent).
 * Examples: 'Windows 10', 'macOS', 'Linux', null
 *
 * @returns {string|null}
 */
export function getOsString() {
  const ua = navigator.userAgent;
  if (ua.includes('Windows NT 10')) return 'Windows 10';
  if (ua.includes('Windows NT 11') || ua.includes('Windows NT 10.0')) return 'Windows';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('macOS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return null;
}

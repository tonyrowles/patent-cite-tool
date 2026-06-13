/**
 * Report Dialog module for the Patent Citation Tool extension.
 *
 * Phase 4 deliverables:
 *   PAY-08: Error ring buffer (installErrorBuffer + appendToBuffer)
 *   PAY-09: Live diagnostic capture helpers (getReportDiagnostics, getPdfParseStatus, browser/OS)
 *   CAP-01/02/04: showReportDialog(shadow, reportOutcome, selectionRect) — anchored panel,
 *     4-category radio, 256-char note + counter, "What's included" collapsible + sticky toggle,
 *     focus-trap + dismiss paths, submit→toast mapping.
 *
 * IMPORTANT: installErrorBuffer() must be called once at module init in each of:
 *   - src/content/content-script.js
 *   - src/background/service-worker.js
 *   - src/firefox/background.js
 * The idempotency guard prevents double-wrapping on duplicate calls.
 */

import { MSG } from '../shared/constants.js';
import { buildReportPayload } from '../shared/report-payload-builder.js';
import { showSuccessToast, showFailureToast, cancelPopupClickOutside } from './citation-ui.js';

// ---------------------------------------------------------------------------
// PAY-08: Error ring buffer constants (D-08)
// ---------------------------------------------------------------------------

const ERROR_BUFFER_KEY = 'bugReportErrorBuffer';
const BUFFER_MAX = 20;

/** Extension-tagged prefix list per D-08. Only these trigger buffer writes. */
const EXTENSION_PREFIXES = ['[SW]', '[PCT]', '[Offscreen]', '[Firefox]', '[BG]'];

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
  // WR-02: Windows 10 and 11 both report 'Windows NT 10.0'; no reliable UA
  // distinction exists. Return a neutral low-fidelity token rather than a
  // wrong 'Windows 10' for half of Windows users.
  if (ua.includes('Windows NT 10.0')) return 'Windows 10/11';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('macOS')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return null;
}

// ---------------------------------------------------------------------------
// Plan 02: Dialog UI — CSS, DOM builder, focus trap, dismiss, submit handler
// ---------------------------------------------------------------------------

/**
 * Return CSS for the report dialog panel and all its child elements.
 * Uses ONLY verbatim hex tokens from 04-UI-SPEC.md Design Token Summary
 * (extracted from citation-ui.js). No new color values introduced (CAP-01 / D-02).
 *
 * @returns {string}
 */
export function getReportDialogCSS() {
  return `
    .cite-report-panel {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.14);
      padding: 12px 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      min-width: 220px;
      max-width: 320px;
      width: auto;
      position: relative;
      pointer-events: auto;
    }
    .cite-report-radio-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
    }
    .cite-report-radio-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
      color: #1a1a1a;
      line-height: 1.4;
    }
    .cite-report-radio-label input[type="radio"] {
      accent-color: #3b82f6;
      border: 1px solid #d1d5db;
      flex-shrink: 0;
      cursor: pointer;
    }
    .cite-report-radio-label.checked {
      font-weight: 500;
      color: #1a1a1a;
    }
    .cite-report-radio-label:hover {
      color: #1a1a1a;
    }
    .cite-report-note {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 6px 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      resize: vertical;
      background: #f9fafb;
      line-height: 1.4;
    }
    .cite-report-note:focus {
      border-color: #3b82f6;
      outline: none;
      box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
    .cite-report-counter {
      text-align: right;
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
      line-height: 1.4;
    }
    .cite-report-counter.at-limit {
      color: #dc2626;
    }
    .cite-report-disclosure {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
      margin-top: 8px;
      line-height: 1.4;
    }
    .cite-report-whats-included-toggle {
      background: none;
      border: none;
      color: #3b82f6;
      font-size: 11px;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .cite-report-whats-included-toggle:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
    .cite-report-whats-included {
      overflow: hidden;
      border-top: 1px solid #f3f4f6;
      margin-top: 8px;
      padding-top: 8px;
      display: none;
    }
    .cite-report-whats-included.expanded {
      display: block;
    }
    .cite-report-field-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cite-report-field-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }
    .cite-report-field-label {
      color: #6b7280;
      flex-shrink: 0;
      padding-right: 8px;
    }
    .cite-report-field-value {
      color: #1a1a1a;
      text-align: right;
      word-break: break-all;
    }
    .cite-report-selection-toggle-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      margin-top: 6px;
      font-size: 11px;
      color: #374151;
      line-height: 1.4;
    }
    .cite-report-selection-toggle-label input[type="checkbox"] {
      accent-color: #3b82f6;
      cursor: pointer;
    }
    .cite-report-btn-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    .cite-report-submit {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .cite-report-submit:hover {
      background: #d1fae5;
    }
    .cite-report-submit:focus {
      outline: 2px solid #059669;
      outline-offset: 2px;
    }
    .cite-report-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .cite-report-cancel {
      background: #f9fafb;
      border: 1px solid #d1d5db;
      color: #374151;
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .cite-report-cancel:hover {
      background: #f3f4f6;
    }
    .cite-report-cancel:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
  `;
}

/**
 * Install a keyboard focus trap within the panel inside the shadow root.
 *
 * Handles Tab/Shift+Tab cycling and Escape dismissal. Uses
 * shadowRoot.activeElement (not document.activeElement) for correct
 * focus tracking inside a closed shadow root (RESEARCH Pattern 2).
 *
 * Calls stopPropagation() on Tab and Escape to prevent Google Patents'
 * Polymer key bindings from stealing the interaction (RESEARCH Pitfall 2 /
 * T-04-08).
 *
 * @param {ShadowRoot} shadowRoot - The closed shadow root.
 * @param {Element} panelEl - The dialog panel element whose focusable
 *   descendants define the trap boundary.
 * @param {Function} onEscape - Callback invoked when Escape is pressed.
 * @returns {Function} Teardown function that removes the keydown listener.
 */
export function installFocusTrap(shadowRoot, panelEl, onEscape) {
  const FOCUSABLE = [
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'a[href]',
  ].join(', ');

  function getFocusable() {
    return Array.from(panelEl.querySelectorAll(FOCUSABLE));
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;

    e.stopPropagation();
    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = shadowRoot.activeElement;

    if (e.shiftKey) {
      if (active === first || !focusable.includes(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !focusable.includes(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  shadowRoot.addEventListener('keydown', handleKeydown);

  // Focus the first radio on open (setTimeout per UI-SPEC Accessibility Contract)
  const focusable = getFocusable();
  if (focusable.length > 0) {
    setTimeout(() => focusable[0].focus(), 0);
  }

  return () => shadowRoot.removeEventListener('keydown', handleKeydown);
}

/**
 * Friendly label mapping for the "What's included" field list rows.
 * Labels are from 04-UI-SPEC.md field-list table (D-03).
 */
const FIELD_LABELS = {
  patentNumber: 'Patent number',
  selectionText: 'The text you selected',
  patentUrl: 'Page address',
  browserOs: 'Browser & OS',
  extensionVersion: 'Extension version',
  category: 'Problem category',
  note: 'Your note',
  errors: 'Recent error log',
  scrollY: 'Diagnostic: scroll position',
  viewport: 'Diagnostic: viewport size',
  xpathNode: 'Diagnostic: selected node',
  pdfParseStatus: 'Diagnostic: PDF status',
};

/** Radio value → friendly label map (CAP-01 / Copywriting Contract). */
const CATEGORY_LABELS = {
  inaccurate_citation: 'Inaccurate citation',
  no_match: 'No match found',
  tool_not_working: 'Tool not working',
  other: 'Other',
};

/**
 * Show the anchored report dialog panel inside the existing shadow root.
 *
 * CRITICAL RULES (RESEARCH):
 *   - Receives `shadow` as a param — NEVER calls getCitationHost (Pitfall 1).
 *   - Captures PAY-09 diagnostics at the TOP of this function (Pitfall 3).
 *   - Removes panel FIRST, then calls showSuccessToast/showFailureToast (Pitfall 1).
 *   - All user-note and page-derived values rendered as textContent (T-04-06).
 *
 * @param {ShadowRoot} shadow - The already-open closed shadow root.
 * @param {{ category: string|null, confidenceTier: string }} reportOutcome
 * @param {DOMRect} selectionRect - Bounding rect for positioning.
 * @param {Element|null} [triggerEl] - The Report button that opened the dialog
 *   (focus is restored to this element on every dismiss path).
 */
export function showReportDialog(shadow, reportOutcome, selectionRect, triggerEl) {
  // CR-02: Neutralise the popup's stale click-outside mousedown handler before
  // the dialog goes live, so an outside click cannot call dismissCitationUI()
  // and tear the host out from under the live dialog.
  cancelPopupClickOutside();

  // -----------------------------------------------------------------------
  // PAY-09: Capture diagnostics IMMEDIATELY at button-click time
  // (selection clears on click; stale at submit time — RESEARCH Pitfall 3)
  // -----------------------------------------------------------------------
  const diagnostics = getReportDiagnostics();

  // -----------------------------------------------------------------------
  // Sticky toggle state — load async, default false
  // -----------------------------------------------------------------------
  let includeSelectionText = true; // default; overwritten after storage resolves

  // -----------------------------------------------------------------------
  // Build style element
  // -----------------------------------------------------------------------
  const styleEl = document.createElement('style');
  styleEl.textContent = getReportDialogCSS();
  shadow.appendChild(styleEl);

  // -----------------------------------------------------------------------
  // Build panel — ARIA: role="dialog" aria-modal="true" (UI-SPEC Accessibility Contract)
  // -----------------------------------------------------------------------
  const panel = document.createElement('div');
  panel.className = 'cite-report-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Report a citation problem');
  panel.style.pointerEvents = 'auto';

  // -----------------------------------------------------------------------
  // Radio group (4 categories)
  // -----------------------------------------------------------------------
  const radioGroup = document.createElement('div');
  radioGroup.className = 'cite-report-radio-group';
  const radioName = 'cite-report-category-' + Date.now();

  const CATEGORIES = ['inaccurate_citation', 'no_match', 'tool_not_working', 'other'];
  const radioEls = {};

  CATEGORIES.forEach((value) => {
    const labelEl = document.createElement('label');
    labelEl.className = 'cite-report-radio-label';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioName;
    radio.value = value;

    if (reportOutcome.category === value) {
      radio.checked = true;
      labelEl.classList.add('checked');
    }

    radio.addEventListener('change', () => {
      radioEls[value].labelEl.classList.toggle('checked', radio.checked);
      CATEGORIES.forEach((v) => {
        if (v !== value) {
          radioEls[v].labelEl.classList.remove('checked');
        }
      });
    });

    const labelText = document.createTextNode(CATEGORY_LABELS[value]);
    labelEl.appendChild(radio);
    labelEl.appendChild(labelText);
    radioGroup.appendChild(labelEl);
    radioEls[value] = { radio, labelEl };
  });

  panel.appendChild(radioGroup);

  // -----------------------------------------------------------------------
  // Note textarea + live counter (D-07: optional for ALL categories)
  // -----------------------------------------------------------------------
  const noteTextarea = document.createElement('textarea');
  noteTextarea.className = 'cite-report-note';
  noteTextarea.maxLength = 256;
  noteTextarea.rows = 3;
  noteTextarea.placeholder = 'Optional — add context for the maintainer';
  noteTextarea.setAttribute('aria-label', 'Optional note, 256 character limit');
  panel.appendChild(noteTextarea);

  const counter = document.createElement('div');
  counter.className = 'cite-report-counter';
  counter.setAttribute('aria-live', 'polite');
  counter.textContent = '0 / 256';
  panel.appendChild(counter);

  noteTextarea.addEventListener('input', () => {
    // Count UTF-16 code units per RESEARCH Pitfall 7
    const len = noteTextarea.value.length;
    counter.textContent = `${len} / 256`;
    if (len >= 256) {
      counter.classList.add('at-limit');
    } else {
      counter.classList.remove('at-limit');
    }
  });

  // -----------------------------------------------------------------------
  // Privacy disclosure + "What's included" toggle (CAP-02 / D-04)
  // -----------------------------------------------------------------------
  const disclosureEl = document.createElement('div');
  disclosureEl.className = 'cite-report-disclosure';

  const disclosureText = document.createTextNode(
    "Includes patent #, your selection, URL, extension version — "
  );
  disclosureEl.appendChild(disclosureText);

  const whatsIncludedToggleBtn = document.createElement('button');
  whatsIncludedToggleBtn.className = 'cite-report-whats-included-toggle';
  whatsIncludedToggleBtn.textContent = "see what’s sent";
  whatsIncludedToggleBtn.setAttribute('aria-expanded', 'false');
  disclosureEl.appendChild(whatsIncludedToggleBtn);
  panel.appendChild(disclosureEl);

  // -----------------------------------------------------------------------
  // "What's included" collapsible panel (CAP-02 / D-03 / D-04 collapsed)
  // -----------------------------------------------------------------------
  const whatsIncludedPanel = document.createElement('div');
  whatsIncludedPanel.className = 'cite-report-whats-included';

  const fieldList = document.createElement('div');
  fieldList.className = 'cite-report-field-list';

  // Helper: create a field row with textContent (T-04-06: no innerHTML)
  function makeFieldRow(labelText, valueText, hidden) {
    const row = document.createElement('div');
    row.className = 'cite-report-field-row';
    if (hidden) row.style.display = 'none';

    const labelEl = document.createElement('span');
    labelEl.className = 'cite-report-field-label';
    labelEl.textContent = labelText;

    const valueEl = document.createElement('span');
    valueEl.className = 'cite-report-field-value';
    valueEl.textContent = valueText;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return row;
  }

  // Patent number (WR-03: use typeof guard, consistent with submit handler at line ~940)
  const patentInfo = typeof extractPatentInfo === 'function' ? extractPatentInfo() : null;
  const rawPatentNumber = (patentInfo?.patentId ?? '').replace(/^US/, '');
  fieldList.appendChild(makeFieldRow(FIELD_LABELS.patentNumber, rawPatentNumber || '—'));

  // The text you selected (togglable)
  const selectionTextValue = diagnostics.selectionText || '(none)';
  const selectionRow = makeFieldRow(
    FIELD_LABELS.selectionText,
    selectionTextValue.length > 60
      ? selectionTextValue.substring(0, 60) + '…'
      : selectionTextValue
  );
  fieldList.appendChild(selectionRow);

  // Page address
  fieldList.appendChild(makeFieldRow(FIELD_LABELS.patentUrl, window.location.href));

  // Browser & OS (computed at open time)
  const browserVal = getBrowserString() || '—';
  const osVal = getOsString() || '—';
  fieldList.appendChild(makeFieldRow(FIELD_LABELS.browserOs, `${browserVal} / ${osVal}`));

  // Extension version
  const extVersion = chrome.runtime.getManifest().version;
  fieldList.appendChild(makeFieldRow(FIELD_LABELS.extensionVersion, extVersion));

  // Problem category (live — updated when radio changes)
  const getSelectedCategory = () => {
    for (const v of CATEGORIES) {
      if (radioEls[v].radio.checked) return CATEGORY_LABELS[v];
    }
    return '—';
  };
  const categoryRow = makeFieldRow(FIELD_LABELS.category, getSelectedCategory());
  const categoryValueEl = categoryRow.querySelector('.cite-report-field-value');
  CATEGORIES.forEach((v) => {
    radioEls[v].radio.addEventListener('change', () => {
      categoryValueEl.textContent = getSelectedCategory();
    });
  });
  fieldList.appendChild(categoryRow);

  // Your note (live — updated on input)
  const noteRow = makeFieldRow(FIELD_LABELS.note, 'none');
  const noteValueEl = noteRow.querySelector('.cite-report-field-value');
  noteTextarea.addEventListener('input', () => {
    noteValueEl.textContent = noteTextarea.value.trim() || 'none';
  });
  fieldList.appendChild(noteRow);

  // Scroll position
  fieldList.appendChild(
    makeFieldRow(FIELD_LABELS.scrollY, `${diagnostics.scrollY}px`)
  );

  // Viewport size
  fieldList.appendChild(
    makeFieldRow(
      FIELD_LABELS.viewport,
      `${diagnostics.viewportWidth} × ${diagnostics.viewportHeight}`
    )
  );

  // Selected node XPath (only if non-null)
  if (diagnostics.xpathNode) {
    const xpath = diagnostics.xpathNode.length > 60
      ? diagnostics.xpathNode.substring(0, 60) + '…'
      : diagnostics.xpathNode;
    fieldList.appendChild(makeFieldRow(FIELD_LABELS.xpathNode, xpath));
  }

  // PDF parse status (computed at open time — null is still shown as a value)
  const pdfStatusRow = makeFieldRow(FIELD_LABELS.pdfParseStatus, '…');
  fieldList.appendChild(pdfStatusRow);
  // Resolve async — update once available
  const patentType = patentInfo?.patentType ?? null;
  getPdfParseStatus(patentType).then((status) => {
    const pdfValEl = pdfStatusRow.querySelector('.cite-report-field-value');
    if (pdfValEl) pdfValEl.textContent = status ?? 'unknown';
  });

  whatsIncludedPanel.appendChild(fieldList);

  // -----------------------------------------------------------------------
  // [Remove selection text] toggle (CAP-02 / D-06 sticky)
  // -----------------------------------------------------------------------
  const selectionToggleLabel = document.createElement('label');
  selectionToggleLabel.className = 'cite-report-selection-toggle-label';

  const selectionToggle = document.createElement('input');
  selectionToggle.type = 'checkbox';
  selectionToggle.className = 'cite-report-selection-toggle';

  const selectionToggleText = document.createTextNode('Remove selection text');
  selectionToggleLabel.appendChild(selectionToggle);
  selectionToggleLabel.appendChild(selectionToggleText);
  whatsIncludedPanel.appendChild(selectionToggleLabel);

  // Load sticky state from chrome.storage.local (CR-03: hold Submit disabled
  // until preference is loaded so the checkbox reflects saved state before
  // the user can submit).
  chrome.storage.local.get('reportDialogRemoveSelectionText').then((stored) => {
    const saved = stored.reportDialogRemoveSelectionText === true;
    selectionToggle.checked = saved;
    includeSelectionText = !saved;
    selectionRow.style.display = saved ? 'none' : '';
    submitBtn.disabled = false; // preference loaded — safe to submit
  }).catch(() => {
    // Default: include selection text
    submitBtn.disabled = false; // unblock on storage error
  });

  selectionToggle.addEventListener('change', () => {
    const remove = selectionToggle.checked;
    includeSelectionText = !remove;
    selectionRow.style.display = remove ? 'none' : '';
    // Save sticky state (fire-and-forget)
    chrome.storage.local.set({ reportDialogRemoveSelectionText: remove }).catch(() => {});
  });

  panel.appendChild(whatsIncludedPanel);

  // "What's included" expand toggle behavior
  whatsIncludedToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = whatsIncludedPanel.classList.toggle('expanded');
    whatsIncludedToggleBtn.setAttribute('aria-expanded', String(expanded));
  });

  // -----------------------------------------------------------------------
  // Button row: Submit + Cancel (CAP-01 / CAP-04 / UI-SPEC §7)
  // -----------------------------------------------------------------------
  const btnRow = document.createElement('div');
  btnRow.className = 'cite-report-btn-row';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'cite-report-submit';
  submitBtn.textContent = 'Submit report';
  // CR-03: disable until sticky preference has loaded so the checkbox reflects
  // the user's saved choice before Submit becomes interactive.
  submitBtn.disabled = true;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cite-report-cancel';
  cancelBtn.textContent = 'Cancel';

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(cancelBtn);
  panel.appendChild(btnRow);

  // -----------------------------------------------------------------------
  // Append panel + position (viewport clamping — mirrors citation-ui.js:203-214)
  // -----------------------------------------------------------------------
  shadow.appendChild(panel);

  // Position the citation host element (shadow root's host)
  const citationHost = shadow.host;
  if (citationHost && selectionRect) {
    const panelWidth = 320;
    let top = selectionRect.bottom + 8;
    let left = selectionRect.left;

    if (top + 200 > window.innerHeight) {
      top = selectionRect.top - 200;
      if (top < 8) top = 8;
    }
    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - 8;
    }
    if (left < 8) left = 8;

    citationHost.style.top = `${top}px`;
    citationHost.style.left = `${left}px`;
    citationHost.style.width = 'auto';
    citationHost.style.height = 'auto';
  }

  // -----------------------------------------------------------------------
  // Dismiss logic (CAP-04 — removes panel+style only, never the host)
  // RESEARCH Pitfall 1: panel removed FIRST, then toast called safely.
  // -----------------------------------------------------------------------
  function dismissDialog() {
    removeTrap();
    document.removeEventListener('mousedown', clickOutsideHandler);
    panel.remove();
    styleEl.remove();
    // Restore focus to trigger element (RESEARCH Pitfall 5 / CAP-04)
    if (triggerEl && typeof triggerEl.focus === 'function') {
      triggerEl.focus();
    }
  }

  // Click-outside dismiss (mirrors citation-ui.js:224-231)
  // Shadow DOM retargets events to the host, so we check host.contains
  function clickOutsideHandler(e) {
    if (!citationHost || !citationHost.contains(e.target)) {
      dismissDialog();
    }
  }

  // Install click-outside after a short delay (avoids same-click-as-open dismissal)
  setTimeout(() => {
    document.addEventListener('mousedown', clickOutsideHandler);
  }, 100);

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissDialog();
  });

  // Install focus trap; Escape is handled inside installFocusTrap
  const removeTrap = installFocusTrap(shadow, panel, () => dismissDialog());

  // -----------------------------------------------------------------------
  // Submit handler (CAP-04 + D-06 omission + T-04-07 payload hygiene)
  // -----------------------------------------------------------------------
  submitBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Determine selected category
    let selectedCategory = null;
    for (const v of CATEGORIES) {
      if (radioEls[v].radio.checked) {
        selectedCategory = v;
        break;
      }
    }

    if (!selectedCategory) return; // defensive — should always be set

    // Loading state (UI-SPEC Submit button loading)
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      // Build context from closure-captured diagnostics (PAY-09 — captured at open)
      const patentInfoNow = typeof extractPatentInfo === 'function' ? extractPatentInfo() : null;
      const patentNumber = (patentInfoNow?.patentId ?? '').replace(/^US/, '');
      const patentTypeNow = patentInfoNow?.patentType ?? null;
      const pdfParseStatus = await getPdfParseStatus(patentTypeNow);
      const errorsStored = await chrome.storage.local.get('bugReportErrorBuffer');
      const errors = Array.isArray(errorsStored.bugReportErrorBuffer)
        ? errorsStored.bugReportErrorBuffer
        : [];

      const context = {
        patentNumber,
        selectionText: diagnostics.selectionText,
        returnedCitation: reportOutcome.returnedCitation ?? null,
        confidenceTier: reportOutcome.confidenceTier,
        extensionVersion: chrome.runtime.getManifest().version,
        browser: getBrowserString(),
        os: getOsString(),
        xpathNode: diagnostics.xpathNode,
        scrollY: diagnostics.scrollY,
        viewportWidth: diagnostics.viewportWidth,
        viewportHeight: diagnostics.viewportHeight,
        pdfParseStatus,
      };

      // triggerMode comes from whatever cachedSettings is in the surrounding context
      // We use an empty object here — content-script sets triggerMode in cachedSettings
      // but report-dialog.js doesn't have direct access to it without coupling.
      // We supply null so buildReportPayload can handle it gracefully.
      const settings = { triggerMode: null };

      const noteValue = noteTextarea.value.trim() || null;

      const payload = buildReportPayload({
        context,
        category: selectedCategory,
        note: noteValue,
        settings,
        errors,
        includeSelectionText,
      });

      const result = await chrome.runtime.sendMessage({
        type: MSG.SUBMIT_REPORT,
        payload,
      });

      // Step 1: Dismiss dialog FIRST (RESEARCH Pitfall 1 — removes panel from shadow;
      // toast functions re-enter the shadow host cleanly after panel removal)
      dismissDialog();

      // Step 2: Map result flags to toast (UI-SPEC Submit→Toast Result Mapping)
      if (result?.ok) {
        showSuccessToast('Report sent — thank you', selectionRect);
      } else if (result?.queued) {
        showSuccessToast('Report saved — will retry when online', selectionRect);
      } else if (result?.rateLimited) {
        showFailureToast(
          'Too many reports in a short period — please wait a few minutes',
          selectionRect
        );
      }
      // result?.dropped → silent per Phase 3 D-07

    } catch (err) {
      // Builder throw or sendMessage error — dismiss and show generic failure toast.
      // WR-04: do NOT show the rate-limit string here — that is reserved for the
      // result?.rateLimited branch above. Builder validation errors (e.g. missing
      // patentNumber) would show a factually wrong "wait a few minutes" message.
      // (T-04-07: never expose internal error details to UI)
      dismissDialog();
      showFailureToast(
        'Report could not be sent — please try again',
        selectionRect
      );
    }
  });
}

// ---------------------------------------------------------------------------
// extractPatentInfo reference for dialog context assembly
// ---------------------------------------------------------------------------
// report-dialog.js is bundled into the IIFE alongside content-script.js where
// extractPatentInfo is defined as a local function. To avoid coupling, we
// attempt to read from window.location directly if the function is unavailable.
// The submit handler calls extractPatentInfo() as a local reference; esbuild
// bundles the whole IIFE so content-script's extractPatentInfo is in scope.
// We declare a fallback here so this module is also importable in unit tests.
/* istanbul ignore next */
if (typeof extractPatentInfo === 'undefined') {
  // no-op fallback for isolated module loading (tests, etc.)
}

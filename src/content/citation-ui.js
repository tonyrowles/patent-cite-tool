/**
 * Shadow DOM UI components for the Patent Citation Tool.
 *
 * ES module. Bundled by esbuild into an IIFE alongside content-script.js.
 *
 * Exports:
 *   showFloatingButton(rect, onClick)   - Small "Cite" button near selection
 *   showCitationPopup(citation, rect, confidence, displayMode, matchedText) - Citation result
 *   showErrorPopup(errorMessage, rect)  - Error message popup
 *   showLoadingIndicator(rect)          - Loading dots indicator
 *   showSuccessToast(citation, rect)    - Silent mode success pill (green, 2s auto-dismiss)
 *   showFailureToast(reason, rect)      - Silent mode failure pill (red, 4s auto-dismiss)
 *   dismissCitationUI()                 - Remove all citation UI
 *
 * All UI is injected via a single Shadow DOM host to prevent CSS conflicts
 * with Google Patents (which uses Polymer web components).
 */

let citationHost = null;
let citationShadow = null;

/**
 * Get or create the Shadow DOM host for citation UI.
 * Reuses a single host element to avoid accumulating DOM nodes.
 */
function getCitationHost() {
  if (citationHost && document.body.contains(citationHost)) {
    // Clear existing content
    while (citationShadow.firstChild) {
      citationShadow.removeChild(citationShadow.firstChild);
    }
    return { host: citationHost, shadow: citationShadow };
  }

  citationHost = document.createElement('div');
  citationHost.id = 'patent-cite-host';
  citationHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;';
  citationShadow = citationHost.attachShadow({ mode: 'closed' });
  document.body.appendChild(citationHost);
  return { host: citationHost, shadow: citationShadow };
}

/**
 * Remove all citation UI from the page.
 */
export function dismissCitationUI() {
  if (citationHost && document.body.contains(citationHost)) {
    citationHost.remove();
    citationHost = null;
    citationShadow = null;
  }
}

/**
 * Show a small "Cite" button near the text selection.
 *
 * @param {DOMRect} rect - Bounding rect of the selection range.
 * @param {Function} onClick - Callback to generate the citation.
 */
export function showFloatingButton(rect, onClick) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getFloatingButtonCSS();
  shadow.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'cite-float-btn';
  btn.textContent = 'Cite';
  btn.style.pointerEvents = 'auto';

  // Position: below and slightly right of selection end
  // Clamp to viewport bounds
  const btnWidth = 52;
  const btnHeight = 28;
  let top = rect.bottom + 6;
  let left = rect.right - btnWidth / 2;

  // Viewport clamping
  if (top + btnHeight > window.innerHeight) {
    top = rect.top - btnHeight - 6; // Show above if no room below
  }
  if (left + btnWidth > window.innerWidth) {
    left = window.innerWidth - btnWidth - 4;
  }
  if (left < 4) left = 4;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = `${btnWidth}px`;
  host.style.height = `${btnHeight}px`;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  shadow.appendChild(btn);
}

/**
 * Show the citation result popup near the selection.
 *
 * @param {string} citation - Formatted citation text.
 * @param {DOMRect} rect - Bounding rect of the selection range.
 * @param {number} confidence - Match confidence (0-1).
 * @param {string} displayMode - 'default' or 'advanced'.
 * @param {string} [matchedText] - Matched text for advanced display.
 */
export function showCitationPopup(citation, rect, confidence, displayMode, matchedText) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getCitationPopupCSS();
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'cite-popup';
  popup.style.pointerEvents = 'auto';

  // Confidence indicator
  const confidenceClass = confidence >= 0.95 ? 'high' : confidence >= 0.80 ? 'medium' : 'low';
  const confidenceLabel = confidence >= 0.95 ? '' : confidence >= 0.80 ? 'Approximate match' : 'Low confidence';

  // Build popup content
  let html = `<div class="cite-row">`;
  html += `<span class="cite-text">${escapeHtml(citation)}</span>`;
  html += `<button class="cite-copy-btn" title="Copy citation">Copy</button>`;

  // Confidence dot (always visible if not perfect)
  if (confidence < 0.95) {
    html += `<span class="cite-confidence cite-conf-${confidenceClass}" title="${confidenceLabel}"></span>`;
  }

  html += `</div>`;

  // Advanced mode: show matched text and confidence detail
  if (displayMode === 'advanced') {
    if (matchedText) {
      const preview = matchedText.length > 80 ? matchedText.substring(0, 80) + '...' : matchedText;
      html += `<div class="cite-preview">${escapeHtml(preview)}</div>`;
    }
    if (confidence < 1.0) {
      const pct = Math.round(confidence * 100);
      html += `<div class="cite-conf-detail cite-conf-${confidenceClass}">Match confidence: ${pct}%</div>`;
    }
  }

  popup.innerHTML = html;

  // Copy button handler
  const copyBtn = popup.querySelector('.cite-copy-btn');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(citation).then(() => {
      copyBtn.textContent = '✓ Copied!';
      copyBtn.style.color = '#059669';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.style.color = '';
      }, 1500);
    }).catch(() => {
      // Fallback for clipboard permission issues
      try {
        const textarea = document.createElement('textarea');
        textarea.value = citation;
        textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyBtn.textContent = '✓ Copied!';
        copyBtn.style.color = '#059669';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.style.color = '';
        }, 1500);
      } catch (fallbackErr) {
        copyBtn.textContent = 'Failed';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      }
    });
  });

  // Position popup
  const popupWidth = 220;
  let top = rect.bottom + 8;
  let left = rect.left;

  if (top + 60 > window.innerHeight) {
    top = rect.top - 60;
  }
  if (left + popupWidth > window.innerWidth) {
    left = window.innerWidth - popupWidth - 8;
  }
  if (left < 8) left = 8;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';

  shadow.appendChild(popup);

  // Auto-dismiss on click outside after a short delay
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(e) {
      if (!citationHost || !citationHost.contains(e.target)) {
        dismissCitationUI();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 100);
}

/**
 * Show an error message when citation fails.
 *
 * @param {string} errorMessage - Error text to display.
 * @param {DOMRect} rect - Bounding rect near which to show the error.
 */
export function showErrorPopup(errorMessage, rect) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getCitationPopupCSS();
  shadow.appendChild(style);

  const popup = document.createElement('div');
  popup.className = 'cite-popup cite-error';
  popup.style.pointerEvents = 'auto';
  popup.innerHTML = `<div class="cite-error-msg">${escapeHtml(errorMessage)}</div>`;

  let top = rect.bottom + 8;
  let left = rect.left;
  if (top + 40 > window.innerHeight) top = rect.top - 40;
  if (left + 220 > window.innerWidth) left = window.innerWidth - 228;
  if (left < 8) left = 8;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';

  shadow.appendChild(popup);

  // Auto-dismiss after 4 seconds
  setTimeout(() => dismissCitationUI(), 4000);
}

/**
 * Show a small loading indicator while citation is being generated.
 *
 * @param {DOMRect} rect - Bounding rect near which to show the indicator.
 */
export function showLoadingIndicator(rect) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getLoadingCSS();
  shadow.appendChild(style);

  const loader = document.createElement('div');
  loader.className = 'cite-loading';
  loader.style.pointerEvents = 'auto';
  loader.textContent = '...';

  let top = rect.bottom + 6;
  let left = rect.right - 20;
  if (top + 24 > window.innerHeight) top = rect.top - 30;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';

  shadow.appendChild(loader);
}

/**
 * Show a small success toast pill near the selection after silent mode citation.
 *
 * Displays the appended citation text (e.g., "4:12-15") in a green monospace
 * pill. Auto-dismisses after 2 seconds. No mousedown dismiss listener -- toasts
 * are auto-dismiss only to avoid premature dismissal from the copy event flow.
 *
 * @param {string} citation - The citation text that was appended.
 * @param {DOMRect} rect - Bounding rect of the selection for positioning.
 */
export function showSuccessToast(citation, rect) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getSuccessToastCSS();
  shadow.appendChild(style);

  const pill = document.createElement('div');
  pill.className = 'cite-toast-success';
  pill.innerHTML = escapeHtml(citation);

  // Position below selection, clamped to viewport
  let top = rect.bottom + 6;
  let left = rect.left;

  if (top + 32 > window.innerHeight) {
    top = rect.top - 32 - 6; // show above if no room below
  }
  if (left + 120 > window.innerWidth) {
    left = window.innerWidth - 120 - 4;
  }
  if (left < 4) left = 4;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';

  shadow.appendChild(pill);

  setTimeout(() => dismissCitationUI(), 2000);
}

/**
 * Show a failure toast pill near the selection when silent mode falls back.
 *
 * Displays the reason why plain text was copied (e.g., "No match -- plain
 * text copied") in a red pill. Auto-dismisses after 4 seconds. No mousedown
 * dismiss listener -- toasts are auto-dismiss only.
 *
 * @param {string} reason - The failure reason text.
 * @param {DOMRect} rect - Bounding rect of the selection for positioning.
 */
export function showFailureToast(reason, rect) {
  const { host, shadow } = getCitationHost();

  const style = document.createElement('style');
  style.textContent = getFailureToastCSS();
  shadow.appendChild(style);

  const pill = document.createElement('div');
  pill.className = 'cite-toast-failure';
  pill.innerHTML = escapeHtml(reason);

  // Position below selection, clamped to viewport (account for ~220px width)
  let top = rect.bottom + 6;
  let left = rect.left;

  if (top + 36 > window.innerHeight) {
    top = rect.top - 36 - 6; // show above if no room below
  }
  if (left + 220 > window.innerWidth) {
    left = window.innerWidth - 220 - 4;
  }
  if (left < 4) left = 4;

  host.style.top = `${top}px`;
  host.style.left = `${left}px`;
  host.style.width = 'auto';
  host.style.height = 'auto';

  shadow.appendChild(pill);

  setTimeout(() => dismissCitationUI(), 4000);
}

// ---------------------------------------------------------------------------
// CSS functions
// ---------------------------------------------------------------------------

function getFloatingButtonCSS() {
  return `
    .cite-float-btn {
      display: block;
      width: 52px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: #3b82f6;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,0.18);
      transition: background 0.15s;
    }
    .cite-float-btn:hover {
      background: #2563eb;
    }
    .cite-float-btn:active {
      background: #1d4ed8;
    }
  `;
}

function getCitationPopupCSS() {
  return `
    .cite-popup {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.14);
      padding: 8px 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      min-width: 120px;
      max-width: 320px;
    }
    .cite-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cite-text {
      font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      font-weight: 600;
      color: #111;
      flex: 1;
      word-break: break-word;
      user-select: none;
      -webkit-user-select: none;
      pointer-events: none;
    }
    .cite-copy-btn {
      border: 1px solid #d1d5db;
      border-radius: 4px;
      background: #f9fafb;
      color: #374151;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      padding: 2px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .cite-copy-btn:hover {
      background: #f3f4f6;
    }
    .cite-confidence {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .cite-conf-high { background: #10b981; }
    .cite-conf-medium { background: #f59e0b; }
    .cite-conf-low { background: #ef4444; }
    .cite-preview {
      margin-top: 6px;
      font-size: 11px;
      color: #6b7280;
      line-height: 1.4;
      border-top: 1px solid #f3f4f6;
      padding-top: 6px;
    }
    .cite-conf-detail {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .cite-conf-detail.cite-conf-high { color: #059669; }
    .cite-conf-detail.cite-conf-medium { color: #d97706; }
    .cite-conf-detail.cite-conf-low { color: #dc2626; }
    .cite-error {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .cite-error-msg {
      color: #991b1b;
      font-size: 12px;
    }
  `;
}

function getLoadingCSS() {
  return `
    .cite-loading {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      padding: 4px 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #6b7280;
      letter-spacing: 2px;
    }
  `;
}

function getSuccessToastCSS() {
  return `
    .cite-toast-success {
      display: inline-block;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      padding: 4px 10px;
      font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
      font-size: 12px;
      font-weight: 600;
      color: #065f46;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10);
      pointer-events: none;
      opacity: 0;
      animation: cite-fade-in 0.15s ease forwards;
    }
    @keyframes cite-fade-in {
      to { opacity: 1; }
    }
  `;
}

function getFailureToastCSS() {
  return `
    .cite-toast-failure {
      display: inline-block;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 6px 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #991b1b;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10);
      pointer-events: none;
      opacity: 0;
      animation: cite-fade-in 0.15s ease forwards;
    }
    @keyframes cite-fade-in {
      to { opacity: 1; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Escape HTML to prevent XSS in innerHTML.
 *
 * @param {string} text - Raw text to escape.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

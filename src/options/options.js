/**
 * Options page script for the Patent Citation Tool extension.
 *
 * Loads settings from chrome.storage.sync, auto-saves on change,
 * shows inline "Saved" feedback, toggles silent mode helper text,
 * and displays the extension version in the footer.
 */

import { showReportDialog } from '../content/report-dialog.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- Version display ---
  const versionEl = document.getElementById('version');
  if (versionEl) {
    versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }

  // --- Control references ---
  const triggerSelect = document.getElementById('triggerMode');
  const displaySelect = document.getElementById('displayMode');
  const patentNumCheckbox = document.getElementById('includePatentNumber');
  const debugModeCheckbox = document.getElementById('debugMode');

  const triggerSaved = document.getElementById('triggerSaved');
  const displaySaved = document.getElementById('displaySaved');
  const patentNumSaved = document.getElementById('patentNumSaved');
  const debugModeSaved = document.getElementById('debugModeSaved');

  const silentHelp = document.getElementById('silentHelp');

  // --- showSaved helper ---
  // Sets feedback element visible then fades it out after ~1500ms
  function showSaved(el) {
    if (!el) return;
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.opacity = '0';
    }, 1500);
  }

  // --- Silent mode helper text visibility ---
  function updateSilentHelp(value) {
    if (silentHelp) {
      silentHelp.style.display = value === 'silent' ? 'block' : 'none';
    }
  }

  // --- Load settings (same defaults as popup.js) ---
  chrome.storage.sync.get({
    triggerMode: 'floating-button',
    displayMode: 'default',
    includePatentNumber: false,
    debugMode: false,
  }, (settings) => {
    triggerSelect.value = settings.triggerMode;
    displaySelect.value = settings.displayMode;
    if (patentNumCheckbox) {
      patentNumCheckbox.checked = settings.includePatentNumber;
    }
    if (debugModeCheckbox) {
      debugModeCheckbox.checked = settings.debugMode;
    }
    // Set silent help visibility based on loaded setting
    updateSilentHelp(settings.triggerMode);
  });

  // --- Auto-save listeners ---
  triggerSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ triggerMode: triggerSelect.value }, () => {
      showSaved(triggerSaved);
    });
    updateSilentHelp(triggerSelect.value);
  });

  displaySelect.addEventListener('change', () => {
    chrome.storage.sync.set({ displayMode: displaySelect.value }, () => {
      showSaved(displaySaved);
    });
  });

  if (patentNumCheckbox) {
    patentNumCheckbox.addEventListener('change', () => {
      chrome.storage.sync.set({ includePatentNumber: patentNumCheckbox.checked }, () => {
        showSaved(patentNumSaved);
      });
    });
  }

  if (debugModeCheckbox) {
    debugModeCheckbox.addEventListener('change', () => {
      chrome.storage.sync.set({ debugMode: debugModeCheckbox.checked }, () => {
        showSaved(debugModeSaved);
      });
    });
  }

  // --- CAP-06 hash routing ---
  // Read-and-delete pendingOptionsHash written by popup.js (CAP-05).
  // chrome.runtime.openOptionsPage() accepts no hash fragment — pendingOptionsHash signals intent.
  chrome.storage.local.get('pendingOptionsHash', (data) => {
    if (data.pendingOptionsHash === '#report') {
      chrome.storage.local.remove('pendingOptionsHash', () => {
        // Fire-and-forget; ignore errors (stale flag is non-critical)
      });
      const reportSection = document.getElementById('report');
      if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
  // Also handle a direct URL hash (e.g. chrome.tabs.create({ url: ...+'#report' }))
  if (location.hash === '#report') {
    const reportSection = document.getElementById('report');
    if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
  }

  // --- CAP-06 page-mode dialog init ---
  // Build prebuiltContext from chrome.storage.local currentPatent (D-01 snapshot context).
  // Live-capture fields (xpathNode, scrollY, viewport) are null — no Google Patents DOM here.
  // D-02: no category pre-selected ({ category: null, confidenceTier: null }).
  const reportMount = document.getElementById('reportDialogMount');
  // CR-03: idempotency guard — track whether the dialog (or placeholder) has been mounted
  // so the DOMContentLoaded path and the onChanged path never double-mount it.
  let dialogMounted = false;

  function initPageModeDialog() {
    if (dialogMounted) return;
    if (!reportMount) return;
    chrome.storage.local.get('currentPatent', (data) => {
      if (dialogMounted) return; // re-check after async gap
      dialogMounted = true;
      const patent = data.currentPatent;
      // CR-02: guard against no prior citation — buildReportPayload requires patentNumber.
      if (!patent || !patent.patentId) {
        const placeholder = document.createElement('p');
        placeholder.style.cssText = 'font-size:13px; color:#6b7280; padding:8px 0;';
        placeholder.textContent =
          'Visit a US patent on Google Patents and run a citation first — then return here to report a problem.';
        reportMount.appendChild(placeholder);
        return;
      }
      const prebuiltContext = {
        patentNumber: patent.patentId.replace(/^US/, ''),
        selectionText: null,           // D-01: no live selection on options page
        returnedCitation: null,
        confidenceTier: patent.confidenceTier || null,
        extensionVersion: chrome.runtime.getManifest().version,
        xpathNode: null,
        scrollY: null,
        viewportWidth: null,
        viewportHeight: null,
        pdfParseStatus: null,
      };
      showReportDialog(
        { mode: 'page', container: reportMount },
        { category: null, confidenceTier: null },  // D-02: no category pre-selected
        null,                                       // no selectionRect — page mode, document flow
        null,                                       // no triggerEl
        prebuiltContext
      );
    });
  }

  // Run dialog init on fresh page load.
  initPageModeDialog();

  // CR-03: handle the already-open-tab case — DOMContentLoaded never re-fires when
  // chrome.runtime.openOptionsPage() focuses an existing tab.  A storage.onChanged
  // listener catches the pendingOptionsHash write from popup.js, consumes the flag,
  // scrolls to #report, and (idempotently) initialises the dialog if needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pendingOptionsHash?.newValue === '#report') {
      chrome.storage.local.remove('pendingOptionsHash', () => {
        // Fire-and-forget; ignore errors (stale flag is non-critical)
      });
      const reportSection = document.getElementById('report');
      if (reportSection) reportSection.scrollIntoView({ behavior: 'smooth' });
      // Ensure the page-mode dialog is initialised (idempotent — no-op if already mounted).
      initPageModeDialog();
    }
  });
});

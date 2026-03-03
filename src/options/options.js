/**
 * Options page script for the Patent Citation Tool extension.
 *
 * Loads settings from chrome.storage.sync, auto-saves on change,
 * shows inline "Saved" feedback, toggles silent mode helper text,
 * and displays the extension version in the footer.
 */

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

  const triggerSaved = document.getElementById('triggerSaved');
  const displaySaved = document.getElementById('displaySaved');
  const patentNumSaved = document.getElementById('patentNumSaved');

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
  }, (settings) => {
    triggerSelect.value = settings.triggerMode;
    displaySelect.value = settings.displayMode;
    if (patentNumCheckbox) {
      patentNumCheckbox.checked = settings.includePatentNumber;
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
});

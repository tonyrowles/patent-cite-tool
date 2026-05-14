// tests/e2e/shims/shadow-open.js
//
// Forces every Element.prototype.attachShadow({mode:'closed'}) call to return
// an OPEN root so Playwright test code can read host.shadowRoot.
//
// Installed via context.addInitScript at document_start (Playwright guarantee).
// The patent-cite-tool extension's content script runs at document_idle
// (src/manifest.json:30) — strictly later — so the override is in place
// BEFORE the extension calls attachShadow at src/content/citation-ui.js:38.
//
// Production extension is unchanged; this override only runs in test contexts.
(function () {
  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (options) {
    return originalAttachShadow.call(this, { ...options, mode: 'open' });
  };
})();

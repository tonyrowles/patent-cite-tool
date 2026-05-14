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
  // NOTE: this override is global — every closed shadow root in the page,
  // including Google Patents' own Polymer components, will be opened. We
  // accept that to read the extension's closed root. If a host-page
  // component starts behaving differently under test, suspect this shim
  // first. The `options || {}` guard also defends against attachShadow()
  // invoked with no argument (spec disallows it, but cheap to handle).
  Element.prototype.attachShadow = function (options) {
    return originalAttachShadow.call(this, { ...(options || {}), mode: 'open' });
  };
})();

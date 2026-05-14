// tests/e2e/shims/clipboard-observer.js
//
// Captures the most recent 'copy' event's text/plain payload into
// window.__lastCopiedText__, so Playwright tests can observe silent-mode
// citations without relying on the unreliable headless clipboard API
// (PITFALLS.md #4).
//
// The patent-cite-tool extension's silent-mode handler
// (src/content/content-script.js:297-342) is a BUBBLE-phase 'copy' listener
// that calls event.clipboardData.setData(...) and event.preventDefault().
// This observer is CAPTURE-phase (runs first) but defers the read via
// queueMicrotask so it executes AFTER the extension's setData call.
//
// Installed via context.addInitScript at document_start.
(function () {
  window.__lastCopiedText__ = '';
  document.addEventListener(
    'copy',
    function (event) {
      try {
        queueMicrotask(function () {
          try {
            const fromEvent =
              event.clipboardData && typeof event.clipboardData.getData === 'function'
                ? event.clipboardData.getData('text/plain')
                : '';
            if (typeof fromEvent === 'string' && fromEvent.length > 0) {
              window.__lastCopiedText__ = fromEvent;
            } else {
              const sel = window.getSelection ? window.getSelection() : null;
              window.__lastCopiedText__ = sel ? String(sel) : '';
            }
          } catch (e) {
            const sel = window.getSelection ? window.getSelection() : null;
            window.__lastCopiedText__ = sel ? String(sel) : '';
          }
        });
      } catch (e) {
        const sel = window.getSelection ? window.getSelection() : null;
        window.__lastCopiedText__ = sel ? String(sel) : '';
      }
    },
    true /* capture: true — run first, but defer read via queueMicrotask */
  );
})();

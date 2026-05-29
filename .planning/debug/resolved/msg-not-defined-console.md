---
status: resolved
trigger: "Uncaught referenceerror: msg is not defined when typing MSG in DevTools console on a Google Patents page"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: NOT A BUG -- Chrome content scripts run in an isolated world; their globals are invisible to the page console
test: Check manifest for "world" config; verify content scripts use MSG successfully
expecting: No "world": "MAIN" in manifest; extension functions correctly despite console error
next_action: Document finding and close

## Symptoms

expected: Typing MSG in DevTools console returns the MSG object
actual: "Uncaught ReferenceError: msg is not defined"
errors: Uncaught ReferenceError: msg is not defined
reproduction: Open Google Patents page with extension active, type MSG in DevTools console
started: After Phase 14 refactoring (but this behavior is inherent to Chrome extensions)

## Eliminated

- hypothesis: constants-globals.js fails to define MSG as a global
  evidence: File clearly defines `const MSG = { ... }` at top level (line 4). Content scripts in the same content_scripts array share execution context and can access it. content-script.js uses MSG extensively (lines 117, 125, 272, 475, 489, 491) and the extension works correctly (tests 1 and 2 passed).
  timestamp: 2026-03-03T00:00:00Z

- hypothesis: constants-globals.js is not loaded before other content scripts
  evidence: manifest.json content_scripts.js array lists constants-globals.js FIRST (line 29), before all other scripts. Chrome loads them in order.
  timestamp: 2026-03-03T00:00:00Z

## Evidence

- timestamp: 2026-03-03T00:00:00Z
  checked: manifest.json content_scripts configuration
  found: No "world" property specified in content_scripts. Default is "ISOLATED". Scripts are loaded in correct order with constants-globals.js first.
  implication: Content scripts run in Chrome's isolated world by default, separate from the page's JavaScript context.

- timestamp: 2026-03-03T00:00:00Z
  checked: constants-globals.js source code
  found: Defines `const MSG`, `const STATUS`, `const PATENT_TYPE` at top-level scope. These are proper global declarations within the content script execution context.
  implication: Globals are correctly defined and accessible to all content scripts in the same content_scripts entry.

- timestamp: 2026-03-03T00:00:00Z
  checked: content-script.js usage of MSG, STATUS, PATENT_TYPE
  found: MSG is used at lines 117, 125, 272, 475, 489, 491. PATENT_TYPE is used at lines 35, 36, 245, 414, 438. All used without import/require (relying on global scope). Extension tests 1 and 2 pass.
  implication: The globals work correctly within the content script isolated world. The extension functions as designed.

- timestamp: 2026-03-03T00:00:00Z
  checked: Chrome extension content script isolation model
  found: Chrome MV3 content scripts default to "world": "ISOLATED". The DevTools console evaluates in the MAIN world (page context). To see content script globals, user must select the extension's context from the DevTools console dropdown.
  implication: Typing MSG in the default console context will always throw ReferenceError -- this is expected Chrome behavior, not a bug.

## Resolution

root_cause: NOT A BUG. Chrome content scripts run in an isolated JavaScript world by default (MV3 "world": "ISOLATED"). The DevTools console evaluates expressions in the main page world. Content script globals (MSG, STATUS, PATENT_TYPE) are invisible from the main page console. To inspect them, the user must select the extension's content script context from the dropdown at the top of the DevTools console (it shows "top" by default; change it to the extension's context).
fix: No code change needed. This is expected Chrome extension behavior.
verification: Extension tests 1 and 2 pass, confirming MSG and other globals work correctly within the content script context.
files_changed: []

---
phase: 26-playwright-harness-scaffolding
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - .gitignore
  - package.json
  - src/content/citation-ui.js
  - tests/e2e/lib/artifacts.js
  - tests/e2e/lib/extension-loader.js
  - tests/e2e/lib/navigation.js
  - tests/e2e/lib/observation.js
  - tests/e2e/lib/selection.js
  - tests/e2e/playwright.config.js
  - tests/e2e/shims/clipboard-observer.js
  - tests/e2e/shims/shadow-open.js
  - tests/e2e/specs/smoke.spec.js
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 26 introduces Playwright e2e harness scaffolding. The only production source change is two `data-testid` HTML attribute setters in `src/content/citation-ui.js` (HOOK-01) — confirmed by diff against base `0841de06^` to be attribute-only with no logic-path modification. All other changed files are new test infrastructure under `tests/e2e/`.

No critical security or correctness issues found. Two warnings relate to timeout semantics and global prototype patching with broader-than-intended scope. Five info-level items cover stylistic and robustness improvements that are not blockers for Phase 27.

Hardcoded-secrets scan: none. Dangerous-function scan: only `document.execCommand('copy')` as a documented clipboard-fallback in production UI (pre-existing, not added in this phase). Absolute paths: none (all paths derived from `import.meta.url` or `process.cwd()` via tooling). Service-worker readiness probe is properly bounded by a 10s timeout. Tmpdir naming uses `crypto.randomUUID()`, so concurrent runs cannot collide.

## Warnings

### WR-01: `gotoPatent` timeout is applied twice (cumulative wall-time can be 2× the requested limit)

**File:** `tests/e2e/lib/navigation.js:14-32`
**Issue:** The `timeout` option (default 30s) is passed to both `page.goto(..., { timeout })` (line 21) and `page.waitForSelector(..., { timeout })` (line 31). In the worst case where `page.goto` returns near the deadline, `waitForSelector` then waits up to another full `timeout`, so total wall-clock can reach ~60s before failure — exceeding the per-test budget configured in `playwright.config.js` (`timeout: 60_000`). On slow CI this may surface as a test-runner timeout instead of a clean navigation-failure error.

**Fix:** Track a deadline and pass the remaining budget to `waitForSelector`:
```js
export async function gotoPatent(page, patentId, { timeout = 30_000 } = {}) {
  if (!patentId || !/^[A-Z]{2}\d+[A-Z]?\d*$/.test(patentId)) {
    throw new Error(`gotoPatent: invalid patentId "${patentId}"`);
  }
  const url = `https://patents.google.com/patent/${patentId}/en`;
  const deadline = Date.now() + timeout;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  if (!response || !response.ok()) {
    const status = response ? response.status() : 'no response';
    throw new Error(`gotoPatent: ${patentId} returned ${status}`);
  }
  const remaining = Math.max(0, deadline - Date.now());
  await page.waitForSelector('main, article, patent-result', {
    state: 'attached',
    timeout: remaining,
  });
  return response;
}
```

### WR-02: `shadow-open.js` patches `Element.prototype.attachShadow` globally — affects host-page components, not only the extension

**File:** `tests/e2e/shims/shadow-open.js:13-16`
**Issue:** The override is installed on `Element.prototype` via `addInitScript`, so every `attachShadow({ mode: 'closed' })` call in the page world is silently flipped to `open` — including Google Patents' own Polymer/Lit web components, not just the patent-cite-tool extension's own host. If Google Patents (or any future first-party script) relies on a closed root being inaccessible (e.g., feature detection, encapsulation invariants), tests could observe behavior that diverges from production. This is unlikely to break the smoke spec (and is unavoidable for testing the extension's closed root), but it deserves a comment so future debugging does not chase a phantom "behaves differently under test" bug.

**Fix:** Add a comment documenting the global-scope side effect, and optionally narrow by host id:
```js
(function () {
  const originalAttachShadow = Element.prototype.attachShadow;
  // NOTE: this override is global — every closed shadow root in the page,
  // including Google Patents' own Polymer components, will be opened. We
  // accept that to read the extension's closed root. If a host page
  // component starts behaving differently under test, suspect this shim
  // first.
  Element.prototype.attachShadow = function (options) {
    return originalAttachShadow.call(this, { ...(options || {}), mode: 'open' });
  };
})();
```
The added `options || {}` also defends against `attachShadow()` invoked with no argument (would throw `TypeError: Cannot read properties of undefined`), which the spec disallows but defensive code is cheap here.

## Info

### IN-01: `artifacts.js` uses sync I/O inside an async function

**File:** `tests/e2e/lib/artifacts.js:48`
**Issue:** `captureDomSnapshot` is declared `async` but writes the snapshot with `fs.writeFileSync(...)` — blocking the event loop while the artifact is written. For Phase 26 this is invisible (smoke never calls it), but Phase 27 will invoke it on every failure; under parallel runs (post-Phase 29) the sync write could starve the Playwright IPC pipe.
**Fix:** Use the promise-based API for parity with the rest of the async chain:
```js
await fs.promises.writeFile(outPath, html, 'utf8');
```

### IN-02: `extension-loader.js` cleanup swallows `context.close()` errors

**File:** `tests/e2e/lib/extension-loader.js:90-96`
**Issue:** `cleanup` wraps `context.close()` in `try { ... } finally { fs.rmSync(...) }` — the `finally` ensures the tmpdir is removed even on close failure (good), but the underlying close error is silently dropped because there is no `catch` to surface it. A flaky `context.close()` would never appear in test output.
**Fix:** Capture and rethrow after cleanup completes:
```js
const cleanup = async () => {
  let closeErr;
  try {
    await context.close();
  } catch (err) {
    closeErr = err;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (closeErr) throw closeErr;
};
```

### IN-03: `package.json` version pinning is inconsistent

**File:** `package.json:22-26`
**Issue:** `@playwright/test` is pinned to an exact version (`"1.60.0"`) while every other devDependency uses a caret range (`"^0.27.3"`, `"^5.5.207"`, etc.). Pinning Playwright exactly is defensible (browser-driver compatibility is brittle), but the asymmetry is worth a one-line comment so a future contributor running `npm update` does not assume Playwright is just out-of-date.
**Fix:** Either align ranges (caret) or add a comment block above devDependencies explaining the exact pin (e.g., "Playwright is pinned because browser-driver compatibility tracks the exact minor"). No code change strictly required.

### IN-04: `clipboard-observer.js` declares unused `catch` bindings

**File:** `tests/e2e/shims/clipboard-observer.js:33,38`
**Issue:** Both `catch (e) { ... }` blocks bind `e` but never reference it, so the variable is dead. This is harmless and ES2019's optional-catch-binding makes the cleaner form available without losing any debug info (none is captured today).
**Fix:** Drop the unused identifier:
```js
} catch {
  const sel = window.getSelection ? window.getSelection() : null;
  window.__lastCopiedText__ = sel ? String(sel) : '';
}
```

### IN-05: `gotoPatent` patent-ID regex rejects publication-style IDs

**File:** `tests/e2e/lib/navigation.js:15`
**Issue:** `/^[A-Z]{2}\d+[A-Z]?\d*$/` accepts grant numbers like `US11427642` and `US11427642B2` but rejects published-application format such as `US20200123456A1` (matches if you squint, but kind codes ending in two digits like `A1` are valid). Phase 26's seed (`US11427642`) is a grant, so the regex is fine for now. Phase 27 may want to broaden — flagging so the regex is revisited rather than copied forward.
**Fix:** When Phase 27 starts using more patents, broaden to e.g. `/^[A-Z]{2}\d+(?:[A-Z]\d?)?$/` and add a test case for the publication-style format.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

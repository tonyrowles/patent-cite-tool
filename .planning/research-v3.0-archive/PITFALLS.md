# Pitfalls Research

**Domain:** Autonomous E2E Testing Agent for Chrome MV3 + Firefox Browser Extension (Playwright + Chromium, hybrid deterministic/LLM, independent PDF verifier, local + nightly cron)
**Researched:** 2026-05-12
**Confidence:** HIGH (Playwright/MV3 pitfalls verified against Playwright docs and active GitHub issues; extension contracts read from actual source; cron/Agent SDK pitfalls verified against Anthropic docs)

This research targets pitfalls specific to **adding** the v3.0 E2E testing agent to the **existing v2.3 extension**. The extension already has a 461-test Vitest suite — the testing agent layers on top of it as a separate harness. Pitfalls are organized by the questions in the research brief.

---

## Critical Pitfalls

### Pitfall 1: Service Worker race — citations land but extension hasn't registered handlers yet

**What goes wrong:**
Playwright's `launchPersistentContext` returns before the MV3 service worker (`background/service-worker.js`) has finished initializing. The harness loads `https://patents.google.com/patent/USXXXXXXXB2/en`, the content script's `mouseup` handler fires and dispatches `chrome.runtime.sendMessage({ type: MSG.LOOKUP_POSITION, ... })`, but the service worker hasn't installed its `chrome.runtime.onMessage` listener yet. Message is silently dropped, the popup spins forever or fails with "no response", and the test reports a false failure — when in reality the production extension works fine because real users take >30 seconds to highlight text.

This extension is particularly exposed because `preSilentCitation` and `generateCitation` both round-trip through the SW (`MSG.LOOKUP_POSITION`, `MSG.PARSE_PDF`), and the SW also owns the offscreen document lifecycle.

**Why it happens:**
- Chromium creates the SW asynchronously; the `'serviceworker'` event on `BrowserContext` can fire before, after, or never (if the SW was already created before Playwright attached). Active bug: [microsoft/playwright#39075](https://github.com/microsoft/playwright/issues/39075).
- MV3 SWs are suspended after ~30s idle and restarted on demand. A test that runs >30s on one patent and then navigates may hit a *suspended* SW on the next navigation, with no `'serviceworker'` event emitted on restart.
- `context.waitForEvent('serviceworker')` is known to hang in GitHub Actions Docker but work locally — see [microsoft/playwright#37347](https://github.com/microsoft/playwright/issues/37347), [#33682](https://github.com/microsoft/playwright/issues/33682).

**How to avoid:**
1. After `launchPersistentContext`, **check `context.serviceWorkers()` first**, then race `context.waitForEvent('serviceworker', { timeout: 10000 })` against a 10s fallback. Both paths must work.
2. Before driving any test, **probe the SW directly**: `await sw.evaluate(() => chrome.runtime.id)` — succeeds only when SW is fully booted.
3. **Add a readiness ping**: send `chrome.runtime.sendMessage({ type: 'PING' })` from the page-evaluate context and require an ack before exercising selection.
4. After every navigation, **re-probe** the SW (it may have been suspended).
5. Set `chromiumSandbox: false` only if running in Docker; never use `--disable-gpu` (some extension APIs depend on GPU process for clipboard).

**Warning signs:**
- Intermittent "no response" failures that vanish on rerun
- Tests pass locally but hang in CI on the *first* patent of each run
- Logs show `LOOKUP_POSITION` sent but no `CITATION_RESULT`

**Phase to address:** Phase 1 (Playwright harness scaffolding) — the readiness probe goes in the test fixture, not in individual tests.

---

### Pitfall 2: Programmatic selection doesn't trigger the extension's `mouseup` handler

**What goes wrong:**
The natural way to test selection from Playwright is `page.evaluate(() => { const range = ...; window.getSelection().addRange(range); })`. This creates a real, visible selection. **But the extension's trigger surface is `document.addEventListener('mouseup', ...)` — not `selectionchange`** (verified at `src/content/content-script.js:173`). Without a `mouseup` event, none of the citation flows fire. The test sees "selection exists" but the floating button never appears, and `preSilentCitation` is never called for silent mode.

A second variant: the test does `page.mouse.down()` → `page.mouse.move()` → `page.mouse.up()` over the patent text. This dispatches `mouseup` correctly, but Chrome's native selection drag on a SPA like Google Patents (Polymer + many shadow boundaries) often produces an *empty* selection because the cursor crosses element boundaries that don't form a valid range. The test sees `mouseup` fire but `selection.toString()` returns `''`.

**Why it happens:**
- Programmatic `addRange` does not synthesize input events (per spec, this is correct — Playwright is faithful to the platform).
- Real-mouse drags on Google Patents pass over `<patent-result>` Polymer components and `<paragraph>` elements with custom layouts; the resulting range can land in unexpected text nodes.
- The 200ms debounce in `mouseup` handler (`selectionTimeout`) means tests that don't `await` the debounce before checking UI see a "false negative".

**How to avoid:**
1. **Hybrid approach**: build the range programmatically with `addRange`, then `dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }))` on `document` — clientX/Y must come from `range.getBoundingClientRect().right/bottom`.
2. For silent-mode (Ctrl+C) tests, after the synthetic mouseup, **wait 250ms** (cover the 200ms debounce + margin) before dispatching the copy event.
3. For the copy path, prefer `page.keyboard.press('Control+C')` (sends a real `copy` event with a `ClipboardEvent` instance) rather than `dispatchEvent(new ClipboardEvent('copy'))` — synthetic copy events don't expose `clipboardData` correctly across Chromium versions.
4. **Verify the selection text** with `page.evaluate(() => window.getSelection().toString())` before triggering — if it's empty, fail loud (don't proceed and report a false plugin bug).
5. Document a `selectText(page, locator, charStart, charEnd)` helper in the test fixtures and use it everywhere.

**Warning signs:**
- Tests report "floating button never appeared" but a screenshot shows the page is correct
- `selection.toString()` returns empty in the assertion but the test thought it set up a selection
- Tests pass when written by a human stepping through DevTools but fail when run as a script

**Phase to address:** Phase 2 (Selection emulation primitives) — write the selection helper once, prove it triggers a citation, then build all 76 deterministic cases on top.

---

### Pitfall 3: Closed Shadow DOM blocks Playwright from observing citation UI

**What goes wrong:**
The extension's citation UI lives inside a **closed** Shadow DOM (`citationHost.attachShadow({ mode: 'closed' })` at `src/content/citation-ui.js:38`). This is a deliberate isolation choice from v1.0 — but **Playwright's locators cannot pierce closed shadow roots** (confirmed: [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047)). The test cannot find the "Cite" button, cannot read the citation popup text, cannot assert confidence color.

A naive workaround — "just change the extension to use `mode: 'open'`" — couples the test infrastructure to the production extension and means the agent isn't testing what users get. It also violates the milestone constraint "Zero new functionality in the extension itself".

**Why it happens:**
- Closed shadow roots are not exposed on `host.shadowRoot` (returns `null`).
- `page.locator()` walks the open shadow tree; closed roots are opaque.
- Visual regression screenshots work but can't extract the citation text for verifier comparison.

**How to avoid:**
1. **Preferred (no extension change)**: use Playwright's `addInitScript` **before navigation** to monkey-patch `Element.prototype.attachShadow`, forcing `mode: 'open'` for the test harness only:
   ```js
   await context.addInitScript(() => {
     const orig = Element.prototype.attachShadow;
     Element.prototype.attachShadow = function (init) {
       return orig.call(this, { ...init, mode: 'open' });
     };
   });
   ```
   This runs in every frame; the production extension's `closed` becomes `open` for the test only. The shipped extension is unchanged.
2. **Verify the patch works**: add an assertion in the fixture that `document.getElementById('patent-cite-host').shadowRoot !== null`.
3. **Document the trade-off**: the test sees a slightly different DOM than production, but the citation logic is identical — only inspection access differs.
4. If `addInitScript` fails for some Chrome version, fall back to **clipboard verification** (silent mode appends citation to copied text; read `navigator.clipboard.readText()` to verify the citation without piercing shadow).

**Warning signs:**
- `page.locator('.cite-float-btn').waitFor()` times out
- `shadowRoot` is `null` in `evaluate`
- Tests pass shadow-piercing in Chrome stable but fail in Chrome beta

**Phase to address:** Phase 1 (Playwright harness scaffolding) — the `addInitScript` shadow-piercing patch must be in the base fixture before any test runs.

---

### Pitfall 4: Headless Chromium silently disables the extension or the clipboard API

**What goes wrong:**
The team runs the deterministic suite headless in GitHub Actions cron to save CI minutes. But:
- **Old Chromium headless** (pre Chrome 109) flat-out doesn't load extensions.
- **New headless** (Chrome 109+, the "headless = new" mode that Playwright now uses by default when launching with `channel: 'chromium'`) **does** support extensions, but `navigator.clipboard.readText()` returns `Promise<DOMException: NotAllowed>` even with `clipboard-read` permission granted, because there's no user gesture in a headless environment.
- The silent-mode (Ctrl+C) path *writes* via `event.clipboardData.setData('text/plain', ...)` inside a real `copy` event — this works headless when triggered by `page.keyboard.press('Control+C')`. But the verifier reads back via `navigator.clipboard.readText()` — and that fails.

The test reports "silent-mode copy failed: clipboard empty" — but production works fine; the bug is in the test harness.

**Why it happens:**
- Headless Chromium aggressively restricts clipboard access without user activation.
- `context.grantPermissions(['clipboard-read', 'clipboard-write'])` grants the *web origin* permission, but Chromium adds an extra "user activation" gate on top of that for `readText` in headless.
- The new headless mode (`--headless=new`) is meant to be feature-parity, but clipboard remains a known gap.

**How to avoid:**
1. **Read clipboard from the copy event itself**, not after — inject a tiny patch via `addInitScript` that captures the `clipboardData.getData('text/plain')` on every `copy` event into `window.__lastCopiedText__`; the test reads `window.__lastCopiedText__` after pressing Ctrl+C. No clipboard API needed.
2. As a fallback, run with `headless: false` under **Xvfb** in CI:
   ```yaml
   - run: xvfb-run --auto-servernum npx playwright test
   ```
3. Grant permissions defensively: `permissions: ['clipboard-read', 'clipboard-write']` in `use:` block of `playwright.config.ts`, and explicitly call `context.grantPermissions([...], { origin: 'https://patents.google.com' })`.
4. **Never trust clipboard-read in CI without a fallback**; always have the `__lastCopiedText__` capture.

**Warning signs:**
- Silent-mode tests pass locally (headed) but fail in CI
- Toast assertions pass but clipboard assertions fail
- `navigator.clipboard.readText()` resolves to `""` consistently

**Phase to address:** Phase 1 (harness scaffolding) — the clipboard-capture shim goes alongside the shadow-piercing shim.

---

### Pitfall 5: Independent verifier reuses pdfjs-dist and inherits the extension's parsing bugs

**What goes wrong:**
The "independent PDF re-parse verifier" is supposed to catch cases where the *extension's* PDF parser produces a wrong citation. If the verifier also uses `pdfjs-dist` (same version, same module), it will have the same bug. Verifier returns "matches", test passes, real bug ships.

This is the central correctness claim of the milestone (validate citations from a separate code path) — if the verifier shares parser code with the extension, the validation is theatrical.

**Why it happens:**
- Convenience: the team is fluent in pdfjs-dist; pulling it into the verifier feels low-friction.
- Sharing parsing helpers (column detection, line clustering) "to reduce duplication" is the obvious anti-pattern — and the extension already has `src/shared/matching.js` that someone will be tempted to reuse.
- The current bug `ACCY-04` (column inference for headerless PDFs, fixed in Phase 23) is a textbook example: a bug in pdf.js's `getTextContent` output structure that both the extension and a naive verifier would inherit.

**How to avoid:**
1. **The verifier MUST use a different text-extraction pipeline.** Recommended: `pdftotext -layout` (Poppler) called via `child_process`. Different rendering backend, different whitespace policy, different column model — meaningful independence.
2. **Do not import anything from `src/shared/`** in the verifier. Enforce with an ESLint rule (`no-restricted-imports`) or a `.gitattributes` check in CI.
3. The verifier's job is **"does the selected text appear within ±2 lines of the cited column:line in the PDF?"** — not "do we agree with the extension's column map". Reformulate the verifier as a text-search-with-tolerance, not a column-reproducer.
4. **Pin Poppler version in CI** (`apt install poppler-utils=24.x` or use a Docker image) — different Poppler versions produce different whitespace.
5. **Document the verifier's known weaknesses**: `pdftotext` mangles multi-column PDFs differently from pdf.js; report unverifiable cases as "VERIFIER_UNAVAILABLE", **not** as plugin failures.

**Warning signs:**
- Verifier passes 100% (suspicious — should have a small disagreement rate from text-extraction variance)
- Verifier and extension fail the same patents (confirmation of shared bug surface)
- A known plugin bug doesn't get caught by the verifier

**Phase to address:** Phase 3 (PDF verifier) — make "no shared parsing code with extension" an explicit success criterion in the phase brief.

---

### Pitfall 6: `pdftotext` text-extraction differences misclassified as plugin failures

**What goes wrong:**
The verifier uses `pdftotext -layout`. Poppler outputs **slightly different whitespace** than pdf.js for the same PDF — different handling of ligatures (`ﬁ` → `fi` vs `f i`), different soft-hyphen behavior, different column-gap detection. The verifier searches for the selected text in pdftotext's output, doesn't find an exact match (the extension matched with fuzzy tiers + OCR normalization at Tier 0b), and reports "selected text not found near column:line — plugin failed".

The plugin didn't fail. The verifier is too strict.

**Why it happens:**
- pdftotext is a *layout* tool, not a citation tool. Its goal is "make PDF readable in a terminal" — it inserts spaces to maintain visual layout, which differs from pdf.js's "read order" output.
- Font substitution: PDFs embed font subsets; if Poppler can't resolve a glyph it falls back to a different mapping than pdf.js.
- The extension does heavy post-processing (gutter strip, wrap-hyphen normalize, OCR pairs at Tier 0b) — the verifier must apply *some* normalization or the comparison is unfair.

**How to avoid:**
1. **Tiered verifier matching**, mirroring the extension's `src/shared/matching.js` philosophy but with different code:
   - Tier A: exact substring in pdftotext output for the cited range ±2 lines
   - Tier B: whitespace-normalized substring (collapse runs of whitespace to single space)
   - Tier C: alphanumeric-only substring (strip all punctuation and whitespace)
   - Tier D: 80% of words appear in order within the ±5-line window
2. **Report the tier**: a Tier-A pass is rock-solid; a Tier-D pass is "probably right but text extraction differs". This lets reviewers triage failures.
3. **Triage encrypted/restricted PDFs**: `pdftotext` may emit nothing for encrypted PDFs. Pre-check with `pdfinfo` and mark as `VERIFIER_UNAVAILABLE`, not failure.
4. **Run a baseline**: on the 76 golden patents, manually verify the verifier's Tier-A rate. If <60%, the verifier is too strict; if 100%, the verifier is too loose. Calibrate against ground truth.
5. **Cache `pdftotext` output** alongside the PDF — text extraction is the slow part; re-running the verifier with new tiers should be sub-second.

**Warning signs:**
- High verifier-disagreement rate (>5%) with no obvious plugin bug
- Specific patent categories (chemical, OCR-heavy) consistently fail verification
- Same patent passes Tier-D but fails Tier-A — text-extraction artifact, not plugin bug

**Phase to address:** Phase 3 (PDF verifier) — tiered matching is the verifier's correctness story.

---

### Pitfall 7: Google Patents DOM/URL drift breaks tests silently

**What goes wrong:**
The test pins selectors like `'patent-result'`, `'paragraph[id^="p-"]'`, or specific URLs like `/patent/US.../en`. Google Patents is a Polymer SPA that Google updates without notice — class names, element tags, paragraph ID schemes have all changed historically. A selector breaks, the test reports "no selection possible" or "PDF link not found", and the team chases a phantom plugin bug.

A subtler variant: Google moves the **PDF host** from `patentimages.storage.googleapis.com` to a new origin. The extension's manifest has `host_permissions: ["https://patentimages.storage.googleapis.com/*"]` — the extension breaks for real users, but the test would catch it only if the test uses live URLs (not fixtures). And the auto-issue-filer reports it as "all 76 patents failed" — a fire-drill that disguises a real platform change.

**Why it happens:**
- Google Patents has no public API; selectors are implementation details.
- The test's "find PDF link" mirrors `findPdfLink()` in the content script — but the extension has a 10s `waitForPdfLink` MutationObserver while the test may have a tighter timeout.
- Paragraph application citations depend on `[XXXX]` markers in DOM text — if Google changes the rendering, paragraph citations silently break.

**How to avoid:**
1. **A "Google Patents smoke test" runs first** in every cron — opens one well-known patent, verifies:
   - PDF link is present and matches expected origin
   - At least one `<paragraph>` (or whatever current selector) contains `[0001]` for a published app
   - Text is selectable (drag → `getSelection().toString()` non-empty)
   If smoke fails: **emit ONE issue** ("Google Patents UI drift suspected"), skip the 76-patent suite, exit clean. Don't spam 76 failure issues for one platform change.
2. **Use multiple selector strategies** with fallbacks (`role` → `aria-label` → text content → CSS class), preferring semantic over structural.
3. **Snapshot the DOM** of a few canonical patents on every run; diff against baseline; flag drift.
4. **Cookie banner** — Google Patents shows EU cookie consent in some geos/IPs (GitHub Actions runs in US-East/West usually); add a defensive `consent.google.com` redirect handler in the fixture.
5. **Subscribe to** [Chrome status updates](https://chromestatus.com/) and Google Patents' release notes (such as they exist) — but realistically, the smoke test is the safety net.

**Warning signs:**
- All 76 patents fail in the same way overnight (UI drift, not plugin bug)
- One patent category fails (paragraph citations) while another (column citations) passes — selector change in one DOM area
- Tests pass for cached patents but fail for cold ones (fetch URL changed)

**Phase to address:** Phase 5 (CI cron + auto-issue) — the smoke-test-first pattern lives in the cron entry point.

---

### Pitfall 8: Cron CAPTCHA / rate-limit storm trips Google bot detection

**What goes wrong:**
Nightly cron hits Google Patents 76 times in 10 minutes from a single GitHub Actions runner IP. Google's anti-abuse triggers — **CAPTCHA challenge** appears (Google does serve `recaptcha` on patents.google.com for high-volume IPs), or rate-limit responses (429), or page returns but PDF link is suppressed. Tests fail systematically with "no PDF link found" — looks identical to UI drift but is actually a bot-detection signal.

A worse variant: the runner IP gets flagged for hours/days. The next cron also fails. The team starts chasing fixes for a problem that's just "wait 24 hours".

**Why it happens:**
- GitHub Actions IPs are well-known, frequently flagged.
- 76 sequential automated page loads in <10 min looks nothing like a human user.
- Playwright's default user-agent contains "HeadlessChrome" (in old headless) and other automation markers.

**How to avoid:**
1. **Throttle**: sleep 3–5s between patents; randomize ±1s. This nearly doubles run time (still well under 10min for 76 patents) but stays under detection thresholds.
2. **Persistent profile**: use the same `userDataDir` across runs (cached as an artifact) — gives the runner a stable cookie/session. Note: this conflicts with isolation; use one profile *per cron run*, not per test.
3. **Detect CAPTCHA early**: after navigation, look for `iframe[src*="recaptcha"]` or known interstitial markers. If detected, **abort the run** cleanly with a "CAPTCHA encountered, skipping" issue (single issue, not 76).
4. **Don't use stealth plugins**: their value is overstated for Google-grade detection and they're a maintenance burden; the throttle + smoke + early-abort pattern is more honest.
5. **Set a realistic user-agent**: Playwright's default already includes a real Chrome UA in non-headless; in headless-new it still says HeadlessChrome — override via `userAgent` in `newContext`.
6. **Long-term**: if rate-limiting becomes chronic, **cache the patent page HTML** in fixtures and switch deterministic mode to fixtures-only; reserve live hits for the LLM exploratory mode (which only runs locally, lower volume).

**Warning signs:**
- "PDF link not found" failures spike from 0 to many overnight
- Page returns 200 but body contains `recaptcha`
- Adjacent runs all fail; manual browser visit shows CAPTCHA challenge

**Phase to address:** Phase 5 (CI cron) — throttle + CAPTCHA-detect must be in the cron runner from day one, not patched in after the first storm.

---

### Pitfall 9: Claude Code subscription auth is local-only — cron must not depend on it

**What goes wrong:**
The exploratory LLM mode uses Claude Code subscription auth (local OAuth token in `~/.claude/credentials`). The team — out of habit or in a rush — adds the LLM step to the GitHub Actions cron workflow. The cron fails because:
- The runner has no `~/.claude/credentials`.
- `CLAUDE_CODE_OAUTH_TOKEN` secret isn't set, or is set but tied to a personal account that flags the activity.
- Anthropic's TOS allows CI use only for "your own repository" with "your own work" — group cron usage is gray-area.

The cron breaks; the fix is "remove the LLM step" — but by then the cron workflow has been spamming the team for a week and the LLM exploration is mixed into the deterministic regression.

**Why it happens:**
- It's natural to extend "the cron runs the test suite" to "the cron also runs the LLM picker".
- The locked decision says "LLM exploratory mode, local-dev only" — but the discipline to keep cron purely deterministic is easy to forget.

**How to avoid:**
1. **Separate npm scripts**: `npm run test:e2e:deterministic` (cron-safe) and `npm run test:e2e:exploratory` (local-only). The cron workflow invokes *only* the deterministic script.
2. **Guard with env**: the exploratory entry point checks `process.env.CI === 'true'` and exits with an explicit "exploratory mode is local-only" error. Fail fast, not silently.
3. **Document the auth model**: in `README` of the test harness, "Subscription auth ≠ CI auth. Cron uses no LLM. Exploratory mode requires `claude` CLI on PATH and an active session."
4. **Pin the Agent SDK version** in `package.json` and set `engines.node` — the SDK is evolving fast (per Anthropic docs), and a version drift will break exploratory mode silently.
5. **Token budget per exploratory run**: bound at e.g. 200K tokens; abort gracefully and report. Even on subscription, the user's time/quota is the budget.

**Warning signs:**
- Cron failures with "command not found: claude" or "no credentials"
- Exploratory mode randomly switches to API key auth (look for API key cost surprise)
- Anthropic emails about unusual activity

**Phase to address:** Phase 4 (LLM exploratory mode) — the env-guard and script separation are non-negotiable.

---

### Pitfall 10: LLM agent picks invalid text — verifier can't distinguish "agent error" from "plugin error"

**What goes wrong:**
The exploratory LLM agent is told "select interesting text from this patent". It hallucinates a selection — picks text that doesn't exist in the patent, or picks text from a figure caption that the plugin (correctly) refuses to cite, or picks text from the claims section where citations are intentionally different. The verifier reports "selection not in PDF — plugin failed". An issue is filed. The next morning, a human investigates and discovers the agent picked garbage.

This wastes triage time and erodes trust in the auto-issue stream.

**Why it happens:**
- LLMs hallucinate, especially when asked to pick "novel" or "edge-case" inputs.
- The plugin has well-defined non-failures: cover page, figures, claims, abstract — citing these is intentionally weak/different.
- The "did the plugin succeed?" question is *conditional* on "did the agent give the plugin a legitimate input?"

**How to avoid:**
1. **Validate agent selections before exercising**: before triggering the plugin, the harness checks that the agent's selected text is **literally present** in the page's selectable region (use `document.body.innerText.includes(selection)`). If not, log "INVALID_AGENT_SELECTION", do not exercise plugin, do not file issue.
2. **Constrain the agent's selection space**: feed the agent the specification section text only (not figures/claims/cover); the agent picks from that. Eliminates "agent picked from a non-citable region" failures.
3. **Log everything per run**: agent prompt, agent selection (verbatim text + offset), plugin response, verifier response. **Reproducibility** is the safety valve — without these logs, you cannot rerun an exploratory failure.
4. **Separate failure taxonomy**:
   - `PLUGIN_BUG` — plugin returned wrong citation for valid selection (file issue)
   - `AGENT_INVALID` — agent picked non-existent or non-citable text (drop, don't file)
   - `VERIFIER_UNAVAILABLE` — verifier couldn't process PDF (file low-priority diagnostic issue)
   - `PLATFORM_DRIFT` — Google Patents changed (file ONE issue, batch suppress)
5. **Determinism for exploratory rerun**: the agent's prompt is logged; rerunning the same prompt with seed produces a similar but not identical selection — this is by design for exploration. For *regression* of a specific failure, capture the exact selection (not the prompt) and add it to deterministic suite.

**Warning signs:**
- High auto-issue volume from exploratory mode with low signal
- Same "plugin bug" issue filed repeatedly but plugin team can't reproduce
- Agent selections that look like hallucinations (text that doesn't appear on page)

**Phase to address:** Phase 4 (LLM exploratory mode) — selection validation is the first guard.

---

### Pitfall 11: Auto-issue spam — every failed run files a new issue

**What goes wrong:**
The auto-issue filer creates a new issue per failure. A real platform change (Pitfall 7) generates 76 issues overnight. Or a flaky test (network blip on PDF fetch) files an issue at run N, the issue gets closed manually, and reopens at run N+1. The issue tracker becomes useless; the team turns off the cron.

This is the most common reason "we set up nightly testing" devolves into "we don't read the testing output anymore".

**Why it happens:**
- The simplest implementation is "test fails → `gh issue create`".
- Without a fingerprint, two failures of the same patent are seen as two different issues.
- Flaky failures (transient network, transient CAPTCHA) look identical to real failures from the issue-filer's perspective.

**How to avoid:**
1. **Fingerprint each failure**: hash `(patentId + selectionText + failureCategory)` → stable ID. Use that as the issue title prefix.
2. **Idempotent filing**: before creating, query existing open issues by fingerprint label or title prefix. If exists, append a comment ("Reproduced in run #NNN, screenshot attached") rather than creating new.
3. **Auto-close on green**: if a fingerprinted issue exists and the next run passes that patent, comment "resolved in run #NNN" and close.
4. **Batch platform-drift**: if >20% of patents fail in one run, file ONE platform-drift meta-issue and suppress the per-patent ones.
5. **Retry once** before filing: if a patent fails, retry once with 30s sleep. If second attempt passes, log as flake (counter), don't file. After N flakes for one patent, file a flake-tracking issue.
6. **`GITHUB_TOKEN` permission**: needs `issues: write`. Easy to forget — explicitly set in workflow:
   ```yaml
   permissions:
     contents: read
     issues: write
   ```
7. **Issue body** must contain: patent ID, selection text (exact), plugin output, verifier output, screenshot artifact link, DOM snapshot artifact link, PDF page snippet. "12 of 76 failed" with no detail is useless.

**Warning signs:**
- Issue tracker has >50 open auto-filed issues
- Same patent ID appears in many different open issues
- Team starts marking issues as "wontfix" without investigating

**Phase to address:** Phase 5 (CI cron + auto-issue) — fingerprint + idempotent file is the second feature after "tests run in CI".

---

### Pitfall 12: Cookie + extension state leak across tests breaks isolation

**What goes wrong:**
The extension uses `chrome.storage.sync` for settings (`triggerMode`, `displayMode`, `includePatentNumber`) and `chrome.storage.local` for `currentPatent` parsed state. IndexedDB caches parsed `PositionMap`. If two test cases share a persistent context, test B sees test A's cached patent and skips PDF parsing — the test never exercises the parser. A bug in cold-load PDF parsing ships because warm-load tests don't notice.

Conversely, if every test uses a fresh `userDataDir`, the SW restarts every test, the offscreen document re-initializes, PDFs re-download from `patentimages.storage.googleapis.com` (slow), and the cron runs out of time.

**Why it happens:**
- `launchPersistentContext` requires `userDataDir`; "reuse it" feels efficient.
- Extension storage isolation in Playwright is non-trivial (no `clearStorage` API for extension storages).
- The Google Patents fetch + PDF parse + match pipeline is the hot path you want to exercise; shortcut paths give false confidence.

**How to avoid:**
1. **Pattern: one userDataDir per test suite, with explicit reset between tests**. Use a fixture that calls (via `sw.evaluate`):
   ```js
   await chrome.storage.local.clear();
   await chrome.storage.sync.clear();
   // Clear IndexedDB:
   const dbs = await indexedDB.databases();
   for (const { name } of dbs) indexedDB.deleteDatabase(name);
   ```
   Set settings to the test's expected values after clearing.
2. **Cache PDFs on disk** in a fixtures directory and serve them via a Playwright route handler (`page.route('https://patentimages.storage.googleapis.com/**', ...)`) — exercises the parser on every test but doesn't hit Google.
3. **Verify pristine state** at the start of each test: assert `chrome.storage.local.get(null) → {}`. Fail loud if not.
4. **Cookies**: clear `context.clearCookies()` between tests; ensure Google Patents consent cookies don't persist (they affect locale and may surface different DOM).

**Warning signs:**
- Tests pass individually but fail when run in sequence
- Test N+1 reports "patent already parsed" when test N parsed the same patent
- Warm-cache tests pass; cold-cache tests fail (or vice versa)

**Phase to address:** Phase 2 (selection emulation + test fixture skeleton) — the state-reset fixture is foundational.

---

### Pitfall 13: Playwright + Chromium download (~450 MB) blows CI time and disk budget

**What goes wrong:**
First cron run: `npx playwright install chromium` downloads ~450 MB, takes 4–5 minutes. With GitHub Actions free tier at 2000 min/month and a nightly run targeting <10 min, half the budget is browser download. Hit the monthly cap by day 20. Or, the cache strategy is wrong (cache key doesn't include Playwright version) and stale browsers cause version-mismatch errors.

**Why it happens:**
- New Playwright versions bring new browser builds; cache keys naively pinned to `package-lock.json` may not invalidate when Playwright version changes (newer Playwright reads version from `package.json`, not lockfile).
- `--with-deps` installs apt packages each run; that's also slow.

**How to avoid:**
1. **Cache `~/.cache/ms-playwright`** with a key derived from the Playwright version in `package.json` (not lockfile):
   ```yaml
   - id: pw-version
     run: echo "version=$(node -p "require('./package.json').devDependencies['@playwright/test']")" >> $GITHUB_OUTPUT
   - uses: actions/cache@v4
     with:
       path: ~/.cache/ms-playwright
       key: pw-${{ runner.os }}-${{ steps.pw-version.outputs.version }}
   ```
2. **Conditional install**: `if: steps.pw-cache.outputs.cache-hit != 'true'` run `npx playwright install chromium`. If cache hit, skip download (~5 min saved per run).
3. **Only install Chromium**, not all browsers: `npx playwright install chromium` (locked decision: Chromium only).
4. **Skip `--with-deps`** if the GitHub `ubuntu-latest` runner already has the deps (it does, for Chromium). If you do need them, cache `/var/cache/apt` too.
5. **Budget guardrail**: add a workflow timeout: `timeout-minutes: 15` — fails loud if any run exceeds budget. Without it, a hang will burn 6 hours of CI minutes.

**Warning signs:**
- CI runs taking >10 min consistently
- Approaching 2000 min/month before mid-month
- Cache misses on every run (cache-key bug)

**Phase to address:** Phase 5 (CI cron) — cache strategy is the very first commit in the workflow file.

---

### Pitfall 14: Cross-phase contract drift — testing agent depends on v2.3 contracts that may change

**What goes wrong:**
The testing agent is built against v2.3 contracts:
- Shadow root mode is `closed` (citation-ui.js:38)
- Floating button has class `cite-float-btn` (citation-ui.js)
- Silent mode triggers on `copy` event after 200ms `mouseup` debounce
- Selection trigger is `mouseup` (not `selectionchange`)
- Citation host has id `patent-cite-host`
- Messages use `MSG.LOOKUP_POSITION`, `MSG.CITATION_RESULT`

If a future v3.x phase refactors the UI (e.g., switches to `mode: 'open'`, renames the host, changes the debounce), the testing agent silently breaks — its assertions still time out, but the bug is in the test, not the plugin.

**Why it happens:**
- The testing agent is "infrastructure" — easy to assume stable.
- The extension has no formal "test surface" contract documented.
- v3.x or v4.x may want to redesign the UI for accessibility, performance, or new features.

**How to avoid:**
1. **Document the test contract** in `.planning/testing-contract.md` (or similar): list every selector, event, storage key, and message the test agent depends on. Treat changes to this list as a deliberate breaking change requiring agent update.
2. **Add `data-testid` to key UI elements** in the extension — a one-time, low-risk change that decouples tests from CSS class names. Examples: `<button data-testid="cite-float-btn">`, `<div data-testid="cite-popup">`. The locked decision says "zero new functionality" — `data-testid` attributes are not functionality, but **do verify with the user** before adding.
3. **Pin a `manifest.testVersion` field** in the test harness; check it matches at startup. If mismatch, emit "test harness needs update for extension v3.x".
4. **Smoke-test the contracts** before the deterministic suite: open a known patent, verify `mouseup` triggers the float button, verify shadow root is accessible (with patch), verify `chrome.storage` contains expected keys. If smoke fails, exit fast.

**Warning signs:**
- Tests pass after a plugin refactor but the plugin is visually broken
- All tests fail on a single commit (likely a contract change)
- New plugin features don't get test coverage because the contract wasn't extended

**Phase to address:** Phase 1 (harness scaffolding) — write the testing-contract doc and smoke test as part of the foundation.

---

### Pitfall 15: USPTO API + Cloudflare Worker fallback path untested by E2E

**What goes wrong:**
The extension has a three-point fallback chain: Google PDF → USPTO eGrant API (via Cloudflare Worker proxy at `pct.tonyrowles.com`) → fail. The E2E agent uses live Google Patents, so the **USPTO fallback is never exercised** unless Google explicitly fails. A bug in the Worker (auth, KV write quota, USPTO API change) ships unnoticed for months. Worse, when it eventually surfaces, users in production hit it first.

**Why it happens:**
- The fallback only fires on specific failure modes (no DOM link, fetch fail, no text layer) — rare in normal traffic.
- The Worker is server-side, not part of the extension repo's CI.
- "Test the happy path" is the easiest path.

**How to avoid:**
1. **Inject fault** in a dedicated test suite: use `page.route('https://patentimages.storage.googleapis.com/**', route => route.abort())` to force the Google path to fail. Verify the USPTO fallback fires and returns a valid PositionMap.
2. **Test patents known to lack text layer**: keep 2-3 fixture patents that have no text layer, force USPTO path, verify cache hit on second run.
3. **Worker health check** in cron: ping `pct.tonyrowles.com/health` (add a Worker route if not present) before running the suite. If Worker is down, skip USPTO-path tests with clear logging.
4. **KV write quota monitoring**: a single Worker on free tier has 1000 writes/day. The shared cache may approach this; the cron itself shouldn't write (use a "test mode" header that disables fire-and-forget writes from CI). Otherwise, CI exhausts the production cache budget.

**Warning signs:**
- USPTO fallback rate in production is 0% then suddenly spikes to non-zero (regression in Google PDF path)
- KV cache hit rate degrades after CI starts
- Worker cold-start latency increases (CI traffic affecting prod)

**Phase to address:** Phase 3 (PDF verifier) or a dedicated "fault injection" phase — the deterministic suite alone won't catch this.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use same `pdfjs-dist` in verifier as in extension | "Already know the library" | Verifier and extension share parsing bugs → silent false negatives | **Never** — defeats the point of independent verification |
| Hardcode CSS-class selectors (`.cite-float-btn`) | Fast to write | Breaks on every UI tweak; cascading failures from a single rename | Until first refactor pain; then migrate to `data-testid` |
| Skip CAPTCHA detection ("we haven't hit it yet") | One less code path | First time it hits → 76 false-positive issues filed overnight | Never — add detection from day one even if it never fires |
| Reuse `userDataDir` across tests for speed | Faster test execution | Tests pass with stale cache; cold-load bugs ship | Only with explicit `chrome.storage.clear()` fixture |
| Run LLM exploratory mode in cron "to maximize coverage" | More coverage hours | Burns subscription quota; ToS gray area; flaky CI | Never — exploratory mode is local-only by locked decision |
| Cache key = lockfile hash | Simple | Doesn't invalidate when Playwright version-only changes | Add Playwright version explicitly to the cache key |
| File one issue per failure | Trivial implementation | Tracker becomes useless on first platform-drift event | Acceptable for first dogfood week; **must** add fingerprinting before opening to wider team |
| `headless: true` in CI without clipboard shim | Faster, no Xvfb | Silent-mode tests pass locally fail in CI; team disables them | Acceptable only if `__lastCopiedText__` shim is in place |
| Synthetic `dispatchEvent(new ClipboardEvent('copy'))` | Doesn't need keyboard focus | `clipboardData` behavior varies by Chrome version | Use `page.keyboard.press('Control+C')` instead — closer to user behavior |
| Skip USPTO fallback testing | Faster test suite | Worker breakage ships to production unnoticed | Never — add fault-injection from Phase 3 |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Patents (live) | Hit it 76× in a tight loop from CI IP | Throttle 3–5s between, detect CAPTCHA early, abort cleanly on detection |
| Google Patents (URL) | Pin `patentimages.storage.googleapis.com` everywhere | Read from manifest `host_permissions`; verify origin matches at runtime; smoke-test on every cron |
| `patentimages.storage.googleapis.com` | Re-fetch PDFs on every test | Cache PDFs in fixtures dir; `page.route()` to serve them locally; only fetch live in smoke test |
| Cloudflare Worker (`pct.tonyrowles.com`) | E2E never exercises the fallback | Fault-injection test forces Google to fail; verify USPTO path |
| USPTO eGrant API | Hammer it directly from tests | Always go through the Worker (which has KV cache); never hit USPTO direct from tests |
| Cloudflare KV (shared cache) | CI writes pollute production cache | Send a test-mode header from CI; Worker skips fire-and-forget write when set |
| Claude Code subscription | Run in CI/cron | Local-dev only; `process.env.CI` guard exits early |
| GitHub Issues API | `gh issue create` per failure | Fingerprint-based idempotent filing; check for existing open issue; comment if exists |
| GitHub Actions secrets | Forget `permissions: { issues: write }` | Set workflow-level permissions explicitly; least-privilege per-job |
| Playwright browser cache | Cache key = lockfile only | Cache key includes Playwright version from `package.json` |
| Anthropic Agent SDK | Float on `latest` | Pin exact version in `package.json`; document upgrade procedure |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential 76-patent run, no parallelism | 25+ min cron time | Use Playwright `workers: 4` after rate-limit headroom is verified | >50 patents → over 10min budget |
| Cold PDF fetch per test | Network I/O dominates suite | Cache PDFs in fixtures dir; route handler serves cached PDFs | When test count × PDF size > network budget |
| Re-parse PDF per test (no IDB cache) | Service worker CPU dominates | Allow IDB cache between tests of the same patent; clear only between patents | Always — extension already optimizes this |
| Fresh `userDataDir` per test | SW restart on every test (~3s each) | One userDataDir per suite; reset storage between tests | At test count > 20 |
| LLM agent unbounded token budget | Subscription cost / wall-clock | Cap at ~200K tokens per exploratory run; abort on overrun | First time agent gets stuck in a loop |
| Verifier runs `pdftotext` per test | I/O dominates verification | Cache `pdftotext` output keyed by PDF hash | At test count > 20 |
| Browser install per CI run | 4–5 min per cron | Cache `~/.cache/ms-playwright` by Playwright version | Always — burns budget |
| `playwright install --with-deps` per run | apt operations add 30–60s | Skip `--with-deps` on `ubuntu-latest` (deps preinstalled) | Always |
| No timeout on individual test | One hang burns the whole CI minute budget | `timeout: 30000` per test; `timeout-minutes: 15` per workflow | First hang in production |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing `CLAUDE_CODE_OAUTH_TOKEN` in repo as plaintext | Subscription account compromise | Only as GitHub Actions secret; never log; document the threat model |
| Leaving CI test-mode header optional | CI traffic pollutes production KV cache; cost surprise | Test mode is **default** in CI; production path is opt-in |
| Granting `clipboard-read` to all origins | Test exfiltration of unrelated clipboard data | Scope `grantPermissions(['clipboard-read'], { origin: 'https://patents.google.com' })` |
| Persistent `userDataDir` shared across PRs | One PR's test data leaks into another | userDataDir is per-run (under `${{ runner.temp }}`); cleaned at end |
| Auto-issue body includes verbatim selection text | Patent text usually public, but PDFs may have hidden metadata | Strip PDF metadata before attaching snippets; redact known PII patterns |
| Exploratory agent has unbounded tool use | Agent runs arbitrary code on dev machine | Limit Agent SDK tool set to `Read`, `Bash` (with allowlist); no `Write` outside test workspace |
| Trusting `chrome.runtime.id` for test detection | Production extension ID may differ from unpacked dev ID | Don't pin the ID; identify by manifest name + content script behavior |
| Logging full DOM snapshots on failure | May contain user's Google account info (signed-in session) | Sign out before tests; or strip `[data-user-info]` from snapshots |

---

## UX Pitfalls (Testing Agent UX)

The testing agent has two "users": the developer reading the issue stream, and the developer running it locally. UX failures here drive abandonment.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auto-filed issue says "test failed, see logs" | Dev opens 12 issues, all useless, gives up | Each issue contains: patent ID, exact selection, plugin citation, verifier verdict, screenshot link, PDF snippet, fingerprint |
| Test output is 1000 lines of stack traces | Triage takes 20 min per failure | Per-test summary line first ("US10203551 col 4:5-20 → plugin said 4:5-22, verifier disagrees"); details below |
| Local `npm run test:e2e` is slow with no progress | Devs run it once, never again | Live progress bar; per-patent status; visible time estimate |
| Failures are random across runs | Trust erodes | Distinguish flake from real: retry once, log to flake counter, only file after 2 consecutive failures |
| LLM exploratory selections aren't reproducible | Found a bug, can't reproduce | Log exact selection text + offset; save to "regression fixture" for re-add to deterministic suite |
| Cron failure email is "12 of 76 failed" | Email gets filtered to spam | Email subject includes top failure category and platform-drift flag if smoke failed |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Service worker readiness**: harness "works" but tests intermittently hang in CI — verify SW readiness probe runs before every test (not just startup)
- [ ] **Closed shadow DOM piercing**: locators "work" in dev because dev extension has open mode by accident — verify `addInitScript` patch is registered before *every* page navigation
- [ ] **Clipboard verification in headless**: silent-mode test "passes" — verify it's reading `window.__lastCopiedText__` shim, not `navigator.clipboard.readText()` (which silently returns empty in headless)
- [ ] **Independent verifier**: verifier "agrees with plugin" 100% — suspicious; should have small disagreement rate from text-extraction variance; verify it imports zero code from `src/shared/`
- [ ] **Cron smoke test**: cron "runs" — verify it has a Google Patents UI smoke step *before* the 76-patent suite; verify it can abort cleanly on smoke failure
- [ ] **Auto-issue deduplication**: issues "get filed" — verify the fingerprint logic; query for existing open issues with the same fingerprint; comment instead of create
- [ ] **CAPTCHA detection**: tests "pass" — verify there's an interstitial detector that aborts the run gracefully
- [ ] **USPTO fallback exercise**: tests "cover the extension" — verify there's at least one fault-injection test that forces the Google path to fail and exercises USPTO
- [ ] **Browser cache key**: CI is "fast" — verify cache key includes Playwright version (not just lockfile); time the install step
- [ ] **Local-only LLM guard**: exploratory mode is "documented as local-only" — verify there's a `process.env.CI` early-exit, not just a doc note
- [ ] **State isolation**: tests "are independent" — run them in reverse order and shuffled order; if results differ, isolation is broken
- [ ] **Storage clear is reliable**: fixture "resets state" — verify after clear that `chrome.storage.local.get(null)` is `{}` and IndexedDB databases list is empty
- [ ] **Workflow permissions**: cron "can create issues" — verify `permissions: { contents: read, issues: write }` is set; test by manually triggering the workflow
- [ ] **Timeout guards**: tests "have timeouts" — verify per-test timeout, suite timeout, AND workflow timeout (`timeout-minutes`)
- [ ] **Failure taxonomy**: agent "files issues for real failures" — verify the four-category taxonomy (PLUGIN_BUG, AGENT_INVALID, VERIFIER_UNAVAILABLE, PLATFORM_DRIFT) is implemented and AGENT_INVALID does NOT file
- [ ] **Manifest contract**: tests "exercise the extension" — verify `data-testid` (or equivalent) hooks exist and the testing-contract doc is current
- [ ] **Replay capability**: an exploratory failure "is logged" — verify the log contains enough to rerun deterministically (patent ID + exact selection text + offset)
- [ ] **PDF verifier handles encrypted PDFs**: verifier "works on the corpus" — try with a known encrypted/restricted PDF; verify it returns VERIFIER_UNAVAILABLE, not crash

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SW race causing intermittent CI hangs | LOW | Add explicit readiness probe; bump SW wait timeout to 15s; rerun |
| Closed shadow DOM blocking | LOW | Add `addInitScript` patch; rerun |
| Headless clipboard returning empty | LOW | Switch to `__lastCopiedText__` shim; rerun |
| Verifier shares bugs with extension | MEDIUM | Rewrite verifier with `pdftotext` (Poppler); recalibrate Tier-A threshold against 76-patent corpus |
| Pdftotext text-extraction variance | MEDIUM | Implement tiered matching; manually triage Tier-D failures; possibly add OCR-equivalent normalization |
| Google UI drift breaking selectors | MEDIUM-HIGH | Update selectors; add fallbacks; consider snapshot-based assertions; reset golden baseline if structure changed |
| CAPTCHA rate-limit storm | MEDIUM | Pause cron for 24h; add throttle; switch to fixtures-mode for deterministic; reduce frequency to every other day |
| Claude Code auth broken in CI (shouldn't be there) | LOW | Remove LLM step from cron workflow; document local-only requirement |
| LLM hallucination filing bad issues | LOW | Add selection-validation; bulk-close issues labeled `agent-invalid`; retrain selection prompt |
| Auto-issue spam | LOW | Disable cron temporarily; implement fingerprinting; bulk-close duplicates; re-enable cron |
| Cron busts CI minute budget | MEDIUM | Cache `~/.cache/ms-playwright`; reduce frequency to every other day; reduce corpus to a sampled 30 patents for nightly, full 76 weekly |
| State leak between tests | LOW | Add `chrome.storage.clear()` + IDB clear fixture; rerun |
| Contract drift after extension refactor | HIGH | Re-read extension source; update `testing-contract.md`; add `data-testid` hooks; rewrite affected tests |
| USPTO Worker broken | MEDIUM | Worker has separate deploy; rollback or re-deploy; fault-injection test catches regression next cron |
| KV cache write quota exhausted | MEDIUM | Disable CI writes (test-mode header); wait for daily quota reset; verify production cache integrity |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| # | Pitfall | Prevention Phase | Verification |
|---|---------|------------------|--------------|
| 1 | SW race condition | Phase 1 (harness scaffolding) | Readiness probe runs before first test; CI green for 3 consecutive runs |
| 2 | Programmatic selection doesn't trigger handler | Phase 2 (selection emulation) | `selectText()` helper proves it triggers `mouseup` and produces a citation |
| 3 | Closed shadow DOM | Phase 1 (harness scaffolding) | `addInitScript` patch in base fixture; assert `shadowRoot !== null` |
| 4 | Headless clipboard | Phase 1 (harness scaffolding) | `__lastCopiedText__` shim; silent-mode test passes in headless CI |
| 5 | Verifier shares parsing bugs | Phase 3 (PDF verifier) | Verifier imports nothing from `src/shared/`; lint rule enforces |
| 6 | Pdftotext text-extraction variance | Phase 3 (PDF verifier) | Tiered matching; Tier-A rate ≥60% on 76-patent corpus |
| 7 | Google Patents UI drift | Phase 5 (CI cron) | Smoke test runs first; aborts suite + files ONE issue on smoke failure |
| 8 | CAPTCHA / rate-limit | Phase 5 (CI cron) | Throttle 3–5s between patents; CAPTCHA detector aborts cleanly |
| 9 | Claude Code subscription in CI | Phase 4 (LLM exploratory) | `process.env.CI` guard exits early; separate npm scripts |
| 10 | LLM agent picks invalid text | Phase 4 (LLM exploratory) | Selection validated against page innerText before triggering plugin |
| 11 | Auto-issue spam | Phase 5 (CI cron + auto-issue) | Fingerprint-based idempotent file; query-existing-first; auto-close on green |
| 12 | State leak across tests | Phase 2 (selection emulation + fixture) | Storage clear fixture; assert pristine state at test start |
| 13 | Browser install bloat | Phase 5 (CI cron) | Cache key includes Playwright version; install conditional on cache miss |
| 14 | Contract drift | Phase 1 (harness scaffolding) | `testing-contract.md` documented; smoke test verifies contracts |
| 15 | USPTO fallback untested | Phase 3 (PDF verifier) or dedicated fault-injection mini-phase | Fault-injection test exists; Worker health-check in cron |

---

## Severity Summary

**High-severity (do not ship Phase 1 without these):**
- Pitfall 1 (SW race) — blocks all tests
- Pitfall 2 (selection emulation) — blocks all tests
- Pitfall 3 (closed shadow DOM) — blocks all UI assertions
- Pitfall 4 (headless clipboard) — blocks silent-mode tests in CI
- Pitfall 14 (contract drift) — preventive doc and `data-testid` hooks

**High-severity (do not ship Phase 3 without these):**
- Pitfall 5 (verifier independence) — defeats the milestone's core claim
- Pitfall 6 (pdftotext variance tiers) — drives false-positive rate

**High-severity (do not ship Phase 5 without these):**
- Pitfall 7 (UI drift smoke test) — prevents 76-issue storms
- Pitfall 8 (CAPTCHA detection + throttle) — prevents IP flagging
- Pitfall 11 (auto-issue dedup) — prevents tracker spam
- Pitfall 13 (browser cache) — prevents CI minute exhaustion

**High-severity (Phase 4):**
- Pitfall 9 (CI guard for subscription auth) — prevents accidental cron exec
- Pitfall 10 (agent selection validation) — prevents false-positive issue stream

**Medium-severity (address opportunistically):**
- Pitfall 12 (state leak) — manifests as flakiness, easy to fix once spotted
- Pitfall 15 (USPTO fallback) — silent regression risk, address in fault-injection mini-phase

---

## Sources

**Playwright + MV3 extension testing:**
- [Chrome extensions | Playwright Docs](https://playwright.dev/docs/chrome-extensions) — official guidance on `launchPersistentContext`, service worker events
- [microsoft/playwright#39075 — Service worker race](https://github.com/microsoft/playwright/issues/39075) — known race attaching to MV3 SWs
- [microsoft/playwright#37347 — `waitForEvent('serviceworker')` hang in CI](https://github.com/microsoft/playwright/issues/37347)
- [microsoft/playwright#33682 — Chromium stuck on serviceworker waitForEvent](https://github.com/microsoft/playwright/issues/33682)
- [How I Built E2E Tests for Chrome Extensions Using Playwright and CDP — DEV](https://dev.to/corrupt952/how-i-built-e2e-tests-for-chrome-extensions-using-playwright-and-cdp-11fl)
- [Service Workers | Playwright](https://playwright.dev/docs/service-workers)

**Shadow DOM / selection emulation:**
- [microsoft/playwright#23047 — Force open closed shadow roots](https://github.com/microsoft/playwright/issues/23047)
- [Shadow DOM Testing That Doesn't Flake (Using Playwright) — Medium](https://medium.com/@erik.amaral/shadow-dom-testing-that-doesnt-flake-using-playwright-1c9313d086d3)
- [Actions | Playwright Docs (mouse events)](https://playwright.dev/docs/input)
- [Automating Text Selection in Web Apps — The Green Report](https://www.thegreenreport.blog/articles/automating-text-selection-in-web-apps/automating-text-selection-in-web-apps.html)

**Clipboard in headless:**
- [How do I access the browser clipboard with Playwright? — playwrightsolutions](https://playwrightsolutions.com/how-do-i-access-the-browser-clipboard-with-playwright/)
- [BrowserContext.grantPermissions | Playwright](https://playwright.dev/docs/api/class-browsercontext)
- [microsoft/playwright#19888 — Unknown permission: clipboard-read](https://github.com/microsoft/playwright/issues/19888)

**Bot detection / rate limiting:**
- [Playwright Anti-Bot Detection: What Works (2026) — AlterLab](https://alterlab.io/blog/playwright-bot-detection-what-actually-works-in-2026)
- [How to Avoid Bot Detection with Playwright — BrowserStack](https://www.browserstack.com/guide/playwright-bot-detection)

**PDF parsing differences:**
- [pdftotext(1) — poppler-utils — Debian Manpages](https://manpages.debian.org/testing/poppler-utils/pdftotext.1.en.html)
- [unpdf vs pdf-parse vs pdf.js: PDF Parsing in Node.js (2026) — PkgPulse](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026)
- [7 PDF Parsing Libraries for Node.js — Strapi](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025)

**GitHub Actions caching + cron:**
- [Is there a way for GitHub Action to Cache Playwright Browsers? — playwrightsolutions](https://playwrightsolutions.com/playwright-github-action-to-cache-the-browser-binaries/)
- [microsoft/playwright#23388 — Faster installs in GitHub Actions](https://github.com/microsoft/playwright/issues/23388)
- [Installing Playwright In GitHub Actions — Steve Fenton](https://stevefenton.co.uk/blog/2025/09/playwright-insteall-github-actions/)

**Claude Code Agent SDK:**
- [Run Claude Code programmatically — Claude Code Docs](https://code.claude.com/docs/en/headless)
- [Claude Code Headless Mode: CI/CD Automation Playbook (2026) — Code With Seb](https://www.codewithseb.com/blog/claude-code-headless-mode-cicd-automation-playbook)
- [Agent SDK should support Max plan billing — anthropics/claude-agent-sdk-python#559](https://github.com/anthropics/claude-agent-sdk-python/issues/559)

**Issue deduplication:**
- [How to Handle Duplicate GitHub Issues Without Annoying Your Users — Adam Cogan](https://adamcogan.com/2025/12/05/handle-duplicate-github-issues/)

**Source code (this repo):**
- `/home/fatduck/patent-cite-tool/src/content/content-script.js` — selection event surface (`mouseup` line 173, `copy` line 297)
- `/home/fatduck/patent-cite-tool/src/content/citation-ui.js` — Shadow DOM mode (`closed` line 38), host id (`patent-cite-host` line 36)
- `/home/fatduck/patent-cite-tool/src/manifest.json` — permissions, host_permissions, content script load order
- `/home/fatduck/patent-cite-tool/.planning/PROJECT.md` — milestone scope, locked decisions, v2.3 context

---
*Pitfalls research for: Autonomous E2E Testing Agent (Playwright + Chromium + LLM exploratory + PDF verifier + cron auto-issue)*
*Researched: 2026-05-12*

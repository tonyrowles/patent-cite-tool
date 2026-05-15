// tests/e2e/lib/selection.js
//
// Phase 27 SEL-01 — replaces the Phase 26 throwing stub.
//
// Implements selectText({ page, uniqueSubstring, requireExact? }):
//
//   1. Walks the patent's description / claims container with a TreeWalker.
//   2. Locates `uniqueSubstring` across one or many text nodes using a
//      whitespace + hyphen normalizer that canonicalizes PDF-extraction
//      artifacts (line-wrap hyphenation, space-around-punctuation,
//      dehyphenated-with-space) to the same canonical form as the live
//      HTML on Google Patents.
//   3. Builds a real DOM Range via window.getSelection().addRange().
//   4. Dispatches one bubbling `mouseup` event on `document` so the
//      extension's content-script listener (src/content/content-script.js:173)
//      receives it and (in 'auto' trigger mode) produces a citation pill.
//   5. Waits 250ms past the content-script's 200ms debounce before resolving.
//
// The normalizer functions `normalize` and `normalizeDeep` are exported at
// module scope so they can be regression-tested independently of the e2e
// suite (tests/unit/selection-text.test.js). They are DUPLICATED inside the
// page.evaluate body because the callback runs in the browser world and
// cannot capture Node-world closures — keep both copies in sync.
//
// Errors are surfaced as thrown Error objects with `err.code` populated to
// one of the failure-class labels (DOM_DRIFT, SELECTION_FAILED). Phase 28's
// RPT-02 will reuse the same labels.

/**
 * Whitespace + spaces-around-hyphen + spaces-before-punctuation collapse.
 *
 * Canonicalizes:
 *   - All whitespace runs to a single space
 *   - Spaces around hyphens ("TALL - 2" → "TALL-2")
 *   - Spaces before , ; : ("TNFSF13 ;" → "TNFSF13;")
 *   - Leading / trailing whitespace
 *
 * Covers two of the three PDF↔HTML divergence classes documented in
 * 27-RESEARCH.md "PDF↔HTML Text Divergence". The third class (PDF
 * line-wrap hyphenation, e.g. "prolif eration" → "proliferation") is
 * handled by `normalizeDeep` below.
 *
 * @param {string} s
 * @returns {string}
 */
export function normalize(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+([,;:])/g, '$1')
    .trim();
}

/**
 * Stronger normalizer that ALSO fixes PDF line-wrap hyphenation.
 *
 * After `normalize`, strips a single space between two alphabetic characters
 * when the second character begins a 4+-letter run ending at a hyphen. This
 * catches `"prolif eration-inducing"` → `"proliferation-inducing"` without
 * corrupting ordinary intra-sentence spaces (e.g. "a quick fox" stays
 * unchanged because "quick" is followed by a space, not a hyphen-suffix).
 *
 * Used as a fallback by `selectText` when the basic `normalize` pass fails
 * to locate the needle in the haystack.
 *
 * @param {string} s
 * @returns {string}
 */
export function normalizeDeep(s) {
  // The lookbehind `(?<=[a-zA-Z])` requires the captured first letter to
  // itself be preceded by a letter — so the first token is a FRAGMENT of a
  // longer word, not a complete standalone word ("a", "an"). The trailing
  // `-[a-z]` requires the second token's hyphen to be followed by a lowercase
  // letter — so the hyphen joins another word fragment, not a digit suffix
  // ("TALL-2", "TRDL-1").
  //
  // Together these two constraints fire on the PDF line-wrap artifact
  // ("prolif eration-inducing" → "proliferation-inducing") without
  // collapsing ordinary intra-sentence spaces ("a proliferation-inducing"
  // stays unchanged; "and TRDL-1" stays unchanged).
  return normalize(s).replace(
    /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
    '$1$2',
  );
}

/**
 * Apply `uniqueSubstring` as a live DOM Selection on `page` and dispatch a
 * bubbling `mouseup` event on `document` to trigger the extension's
 * content-script selection handler.
 *
 * The function runs the heavy lifting (TreeWalker + Range construction) in a
 * single `page.evaluate` call so the DOM APIs operate in the browser world.
 * After the evaluate resolves, awaits 250ms past the content-script's 200ms
 * mouseup debounce before returning.
 *
 * @param {object} args
 * @param {import('@playwright/test').Page} args.page Playwright Page handle.
 * @param {string} args.uniqueSubstring Text fragment to select (PDF or HTML form).
 * @param {boolean} [args.requireExact=true] When true (default), round-trip
 *   verifies that `window.getSelection().toString()` matches `uniqueSubstring`
 *   under whichever normalization pass located the needle. Throws
 *   `SELECTION_FAILED` on mismatch.
 * @returns {Promise<{ ok: true, containerSelector: string, rectTop: number, rectLeft: number, usedDeep: boolean }>}
 *   Resolves with metadata about the applied selection.
 * @throws {Error} with `err.code === 'DOM_DRIFT'` when the substring is
 *   absent from every priority container, or `err.code === 'SELECTION_FAILED'`
 *   when the offset walk could not be resolved or the round-trip mismatches.
 */
export async function selectText({ page, uniqueSubstring, requireExact = true } = {}) {
  if (!page || typeof page.evaluate !== 'function') {
    throw new Error('selectText: page is required and must be a Playwright Page');
  }
  if (!uniqueSubstring || typeof uniqueSubstring !== 'string') {
    throw new Error('selectText: uniqueSubstring is required and must be a string');
  }

  // Wait for the extension content script's mouseup listener to be in place
  // AND for Google Patents to finish populating the claims section. MV3
  // injects content scripts at document_idle (after `load` event), and
  // claims hydration runs alongside but completes after the
  // description-paragraph wait used by gotoPatent. Without this settle,
  // selectText can find the needle only in <body> (via the fallback path),
  // which mis-locates the selection.
  await page
    .waitForLoadState('load', { timeout: 5000 })
    .catch(() => {});
  // Wait for claims content to populate. Google Patents lazy-renders some
  // sections; we explicitly check for claim text density to ensure
  // selectText's container scan can pick the right section.
  await page
    .waitForFunction(
      () => {
        const claims = document.querySelector('section[itemprop="claims"]');
        if (!claims) return false;
        const text = (claims.textContent || '').trim();
        return text.length > 200;
      },
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);

  const result = await page.evaluate(
    async ({ needle, requireExact }) => {
      // Duplicated from module scope so page.evaluate sees it; keep both in sync.
      const normalize = (s) =>
        s
          .replace(/\s+/g, ' ')
          .replace(/\s*-\s*/g, '-')
          .replace(/\s+([,;:])/g, '$1')
          .trim();
      // Duplicated from module scope so page.evaluate sees it; keep both in sync.
      const normalizeDeep = (s) =>
        normalize(s).replace(
          /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
          '$1$2',
        );

      // Google Patents Polymer-hydrates older patents and REPLACES the
      // initial `section[itemprop="..."]` elements with custom-element
      // wrappers. The post-hydration structure uses `<section
      // id="description">` and `<section id="claims">` (without
      // itemprop). We probe both forms — Polymer ID first since most
      // patents will be hydrated by the time selectText runs.
      const CONTAINERS = [
        'section#description',
        'section#claims',
        'section[itemprop="description"]',
        'section[itemprop="claims"]',
        'patent-result',
        'main',
        'body',
      ];

      // ------------------------------------------------------------
      // Step 1 — pick the first container whose normalized textContent
      // contains the normalized needle. Try basic-normalize first; fall
      // back to deep-normalize on miss (PDF line-wrap divergence).
      // ------------------------------------------------------------
      const normalizedNeedleBasic = normalize(needle);
      const normalizedNeedleDeep = normalizeDeep(needle);

      let container = null;
      let containerSelector = null;
      let usedDeep = false;

      for (const sel of CONTAINERS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const text = el.textContent || '';
        if (normalize(text).includes(normalizedNeedleBasic)) {
          container = el;
          containerSelector = sel;
          usedDeep = false;
          break;
        }
        if (normalizeDeep(text).includes(normalizedNeedleDeep)) {
          container = el;
          containerSelector = sel;
          usedDeep = true;
          break;
        }
      }

      if (!container) {
        return {
          ok: false,
          error: 'DOM_DRIFT',
          detail:
            'needle not found in any known container after basic + deep normalize',
          triedContainers: CONTAINERS,
        };
      }

      // ------------------------------------------------------------
      // Step 2 — walk text nodes; build a flat "normalized cursor" map
      // mirroring the BASIC normalize rule. The basic rule is used for
      // offset bookkeeping regardless of which normalization pass found
      // the needle, so segment offsets stay self-consistent.
      // ------------------------------------------------------------
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
      );
      const segments = []; // {node, rawText, normStart, normEnd}
      let normCursor = 0;
      let inWhitespaceRun = false;

      // We need to mirror the full basic normalize behavior:
      //   1. \s+ → ' '
      //   2. \s*-\s* → '-'
      //   3. \s+([,;:]) → '$1'
      //   4. trim()
      //
      // The walker concatenates `container.textContent` virtually, so we
      // walk a flat character stream maintaining a small lookahead state.
      // For each raw char in the current text node we ask: "would
      // `normalize()` emit a corresponding char at this position?". If
      // yes, we increment `normCursor`. If no (whitespace inside a run,
      // or whitespace adjacent to a hyphen / preceding `,;:`), we don't.
      //
      // Without these rules, locate() falls into the "ROUNDTRIP_MISMATCH"
      // path documented in 27-DATA-REGEN-SUMMARY for any needle that lies
      // after an upstream `\s*-\s*` or `\s+[,;:]` pattern in the body.
      //
      // The implementation walks raw text but treats hyphen / punctuation
      // groups as "atomic" — a hyphen with surrounding whitespace produces
      // a single `-` char in normalize-space; a whitespace run immediately
      // before `,;:` produces no char (the punct char itself follows).
      let node;
      // Build a single flat character stream from all text nodes so we
      // can apply the multi-char lookahead rules without re-implementing
      // them across segment boundaries.
      const rawTexts = [];
      const nodeList = [];
      while ((node = walker.nextNode())) {
        rawTexts.push(node.nodeValue || '');
        nodeList.push(node);
      }
      // Concatenated raw text + per-position node-index map.
      let flat = '';
      const flatNodeIdx = [];   // flat[i] originated from nodeList[flatNodeIdx[i]]
      const flatNodeOffset = []; // ...at offset flatNodeOffset[i] within that node
      for (let n = 0; n < rawTexts.length; n++) {
        const r = rawTexts[n];
        for (let j = 0; j < r.length; j++) {
          flat += r[j];
          flatNodeIdx.push(n);
          flatNodeOffset.push(j);
        }
      }
      // Walk flat applying the three normalize rules to produce a parallel
      // normCursor map. normFromFlat[i] = the normCursor that flat-char i
      // PRODUCES (the value just before processing this char), or -1 if
      // it doesn't produce a norm char (whitespace inside a run / stripped
      // by hyphen / pre-punct rule).
      const normFromFlat = new Array(flat.length).fill(-1);
      // For each segment record normStart/normEnd in norm space.
      const segStartNorm = new Array(nodeList.length).fill(0);
      const segEndNorm = new Array(nodeList.length).fill(0);
      let curSegIdx = -1;
      for (let i = 0; i < flat.length; i++) {
        // Track segment boundaries
        if (flatNodeIdx[i] !== curSegIdx) {
          if (curSegIdx >= 0) segEndNorm[curSegIdx] = normCursor;
          curSegIdx = flatNodeIdx[i];
          segStartNorm[curSegIdx] = normCursor;
        }
        const c = flat[i];
        if (/\s/.test(c)) {
          // Look ahead: does this whitespace run lead into `-` or `,;:`?
          let k = i;
          while (k < flat.length && /\s/.test(flat[k])) k++;
          const followChar = k < flat.length ? flat[k] : '';
          if (followChar === '-' || /[,;:]/.test(followChar)) {
            // This whitespace run is entirely stripped (rule 2 strips
            // both sides of hyphen; rule 3 strips before punct).
            // No norm char emitted for any of these whitespace positions;
            // leave normFromFlat[..] = -1 for them.
            i = k - 1; // advance to last whitespace; outer loop ++i will jump to followChar
            inWhitespaceRun = false;
            continue;
          }
          // Otherwise this whitespace run produces a single ' ' on the
          // FIRST whitespace char of the run (if we're past start);
          // subsequent ws chars in the run produce nothing (leave -1).
          if (!inWhitespaceRun && normCursor > 0) {
            normFromFlat[i] = normCursor;
            normCursor++;
            inWhitespaceRun = true;
          }
          // else: continued whitespace — normFromFlat[i] stays -1.
        } else if (c === '-') {
          // Rule 2: hyphen always emits '-' regardless of surrounding
          // whitespace. Surrounding whitespace is handled by the
          // whitespace branch (above) which now strips the lead-in.
          // Look BACK: if previous char was whitespace that was stripped,
          // we still emit '-' here.
          normFromFlat[i] = normCursor;
          normCursor++;
          inWhitespaceRun = false;
          // Look ahead: if the next char is whitespace, the whitespace
          // branch will look forward to see if THAT trailing whitespace
          // is followed by a non-special; if so it emits a space (which
          // would NOT be the intended behavior of rule 2). Rule 2 says
          // strip whitespace on BOTH sides of the hyphen. Mark the next
          // whitespace run as "skip" by leaving inWhitespaceRun=true
          // semantically — actually simpler: peek ahead and consume any
          // trailing whitespace right here.
          let k = i + 1;
          while (k < flat.length && /\s/.test(flat[k])) {
            normFromFlat[k] = -1;
            k++;
          }
          i = k - 1;
        } else {
          inWhitespaceRun = false;
          normFromFlat[i] = normCursor;
          normCursor++;
        }
      }
      if (curSegIdx >= 0) segEndNorm[curSegIdx] = normCursor;

      // Build segments array compatible with the old shape (preserving
      // `node`, `rawText`, `normStart`, `normEnd`).
      for (let n = 0; n < nodeList.length; n++) {
        segments.push({
          node: nodeList[n],
          rawText: rawTexts[n],
          normStart: segStartNorm[n],
          normEnd: segEndNorm[n],
        });
      }

      // ------------------------------------------------------------
      // Step 3 — locate the needle's normalized start/end in a haystack
      // built with the SAME (basic) collapse-whitespace-run rule used by
      // the walker. This keeps offsets self-consistent.
      // ------------------------------------------------------------
      const haystackBasic = normalize(container.textContent || '');
      let startNormIdx = haystackBasic.indexOf(normalizedNeedleBasic);
      let endNormIdx = -1;
      let needleLenForRoundTrip = normalizedNeedleBasic.length;
      let normalizedNeedleUsed = normalizedNeedleBasic;

      if (startNormIdx >= 0) {
        endNormIdx = startNormIdx + normalizedNeedleBasic.length;
      } else if (usedDeep) {
        // Deep-normalize located the needle; map deep-cursor back to a
        // basic-cursor by scanning the basic-normalized haystack and
        // emitting a deep-normalized character in lockstep.
        const haystackDeep = normalizeDeep(container.textContent || '');
        const deepStart = haystackDeep.indexOf(normalizedNeedleDeep);
        if (deepStart < 0) {
          return {
            ok: false,
            error: 'SELECTION_FAILED',
            detail:
              'needle present in deep-normalized container.textContent but absent after re-normalize (walker inconsistency)',
          };
        }
        const deepEnd = deepStart + normalizedNeedleDeep.length;
        // Build a basic-to-deep offset map by re-applying the deep regex
        // to the basic haystack and tracking which characters were
        // dropped (only the single-space-before-hyphen-suffix case).
        // strippedSpacePositions = basic-indices where deep-normalize
        // removed the character.
        const strippedSpacePositions = new Set();
        // Keep this regex IDENTICAL to the one used inside normalizeDeep so
        // the dropped-character positions match the actual deep-normalize
        // output. Differs only in capture-group structure: we need m.index
        // to point at group-1's first letter so we know which space (at
        // m.index + 1) got dropped.
        const re = /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g;
        let m;
        while ((m = re.exec(haystackBasic)) !== null) {
          // m.index is the position of group 1's first char in basic.
          // The space removed is at basic-index m.index + 1.
          strippedSpacePositions.add(m.index + 1);
          // Move regex lastIndex back by 1 so overlapping matches can be
          // detected (though our pattern shouldn't overlap in practice).
          re.lastIndex = m.index + 1;
        }
        // Walk haystackBasic; build a parallel "deep cursor" so we can
        // translate deepStart/deepEnd back to basic indices.
        let basicIdx = 0;
        let deepIdx = 0;
        let basicStart = -1;
        let basicEnd = -1;
        while (basicIdx <= haystackBasic.length) {
          if (deepIdx === deepStart && basicStart === -1) {
            basicStart = basicIdx;
          }
          if (deepIdx === deepEnd && basicEnd === -1) {
            basicEnd = basicIdx;
            break;
          }
          if (basicIdx === haystackBasic.length) break;
          if (strippedSpacePositions.has(basicIdx)) {
            // This character is dropped in deep-normalize; advance basic
            // only, not deep.
            basicIdx++;
          } else {
            basicIdx++;
            deepIdx++;
          }
        }
        if (basicStart < 0 || basicEnd < 0) {
          return {
            ok: false,
            error: 'SELECTION_FAILED',
            detail: 'could not map deep-normalize offsets back to basic',
          };
        }
        startNormIdx = basicStart;
        endNormIdx = basicEnd;
        needleLenForRoundTrip = basicEnd - basicStart;
        normalizedNeedleUsed = haystackBasic.slice(basicStart, basicEnd);
      } else {
        return {
          ok: false,
          error: 'SELECTION_FAILED',
          detail: 'needle missing after normalization (inconsistent walk)',
        };
      }

      // ------------------------------------------------------------
      // Step 4 — locate {startNode, startOffset} and {endNode, endOffset}
      //
      // We use the flat-character / normFromFlat map built during the
      // walker pass. For a given normIdx, find the first flat-char i
      // where normFromFlat[i] === normIdx (i.e. the flat char that emits
      // normIdx). That flat char maps to (nodeList[flatNodeIdx[i]],
      // flatNodeOffset[i]).
      //
      // Edge case: end positions can point one past the final norm char.
      // We detect that case (normIdx === normCursor) and return the last
      // node + (rawText.length).
      // ------------------------------------------------------------
      function locate(normIdx) {
        if (normIdx === normCursor) {
          // End-of-document — return the last node + (rawText.length)
          if (nodeList.length === 0) return null;
          const lastN = nodeList.length - 1;
          return {
            node: nodeList[lastN],
            offset: rawTexts[lastN].length,
          };
        }
        // Linear scan; flat is small (< few hundred KB) so this is fine.
        for (let i = 0; i < flat.length; i++) {
          if (normFromFlat[i] === normIdx) {
            return {
              node: nodeList[flatNodeIdx[i]],
              offset: flatNodeOffset[i],
            };
          }
        }
        return null;
      }

      const startLoc = locate(startNormIdx);
      const endLoc = locate(endNormIdx);
      if (!startLoc || !endLoc) {
        return {
          ok: false,
          error: 'SELECTION_FAILED',
          detail: 'could not resolve text-node offsets',
        };
      }

      // ------------------------------------------------------------
      // Step 5 — build the Range and apply it via window.getSelection()
      // ------------------------------------------------------------
      const range = document.createRange();
      try {
        range.setStart(startLoc.node, startLoc.offset);
        range.setEnd(endLoc.node, endLoc.offset);
      } catch (e) {
        return {
          ok: false,
          error: 'SELECTION_FAILED',
          detail: 'range.setStart/setEnd threw: ' + (e?.message || String(e)),
        };
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      // ------------------------------------------------------------
      // Step 6 — round-trip verification. Compare the live selection's
      // toString() to the needle under whichever pass located it.
      // ------------------------------------------------------------
      const gotBasic = normalize(sel.toString());
      const gotDeep = normalizeDeep(sel.toString());
      const expectedBasic = normalize(needle);
      const expectedDeep = normalizeDeep(needle);
      const roundTripOk = usedDeep
        ? gotDeep === expectedDeep
        : gotBasic === expectedBasic;
      if (requireExact && !roundTripOk) {
        return {
          ok: false,
          error: 'SELECTION_FAILED',
          detail: 'roundtrip mismatch',
          got: usedDeep ? gotDeep : gotBasic,
          expected: usedDeep ? expectedDeep : expectedBasic,
          usedDeep,
        };
      }

      // ------------------------------------------------------------
      // Step 7 — dispatch mouseup on document so the content-script
      // listener (line 173) receives it. The host-guard at line 182
      // lets document-targeted events through (target is document, not
      // patent-cite-host).
      //
      // Google Patents' own mouseup handler asynchronously moves the
      // selection to its <search-app> bar, which would defeat the
      // content-script's 200ms debounced read. We re-apply the range in a
      // tight loop for ~260ms (past the debounce + a small margin) to
      // keep the selection intact at the moment the extension reads it.
      // ------------------------------------------------------------
      const rect = range.getBoundingClientRect();
      document.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: rect.right || 100,
          clientY: rect.bottom || 100,
        }),
      );
      // Expose the range to be re-applied by an outer Node-side loop
      // (faster and bounded — avoids being starved by busy-main-thread).
      window.__pct_reapply = () => {
        sel.removeAllRanges();
        sel.addRange(range);
      };
      return {
        ok: true,
        containerSelector,
        rectTop: rect.top,
        rectLeft: rect.left,
        usedDeep,
      };
    },
    { needle: uniqueSubstring, requireExact },
  );

  if (!result || !result.ok) {
    const code = (result && result.error) || 'SELECTION_FAILED';
    const detail = (result && result.detail) || 'unknown';
    const err = new Error(`selectText: ${code} — ${detail}`);
    err.code = code;
    err.detail = result;
    throw err;
  }

  // Node-side re-apply loop. Google Patents' own mouseup handler clears
  // the user-selection asynchronously; the content script's 200ms
  // debounce reads selection at t=200ms after mouseup. Re-applying every
  // ~30ms keeps the range live across that window. Bound at 280ms total.
  const reapplyDeadline = Date.now() + 280;
  while (Date.now() < reapplyDeadline) {
    try {
      await page.evaluate(() => {
        if (typeof window.__pct_reapply === 'function') window.__pct_reapply();
      });
    } catch {
      // page may be closing; bail silently
      break;
    }
    await page.waitForTimeout(25);
  }

  return result;
}

/**
 * Dispatch Ctrl+C while ensuring the saved DOM Range is re-applied
 * IMMEDIATELY before the keystroke fires.
 *
 * Why this exists: Google Patents' own mouseup handler clears the document
 * selection ~50-200ms after our mouseup dispatch. By the time selectText
 * returns (after its 280ms re-apply loop) AND silent.spec.js runs its next
 * `await` chain to issue Ctrl+C, the selection may have been cleared again
 * — leaving the content-script's 'copy' handler with an empty selection
 * (and its early-return path triggers, so `event.clipboardData.setData()`
 * never runs and the clipboard-observer shim sees nothing).
 *
 * This helper closes the race by:
 *   1. Re-applying the range exposed at `window.__pct_reapply`
 *   2. Verifying `window.getSelection().toString().length > 0`
 *   3. IMMEDIATELY pressing Control+C (no awaits in between to widen the gap)
 *   4. Doing a short post-keystroke re-apply loop so the content script's
 *      bubble-phase 'copy' handler still sees a live selection when it
 *      calls `selection.toString()` synchronously inside the copy event.
 *
 * Note on (4): The 'copy' event is dispatched synchronously by Ctrl+C, and
 * the content script reads `window.getSelection().toString()` INSIDE the
 * handler (src/content/content-script.js:300-301). Both the capture-phase
 * shim and the bubble-phase extension handler execute synchronously in the
 * same task as the keystroke — so as long as the selection is non-empty at
 * the moment we call page.keyboard.press, both handlers will read it.
 * The post-keystroke loop is belt-and-suspenders for any browser flush
 * weirdness.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ selectionLength: number, hadReapply: boolean }>}
 */
export async function pressCtrlCWithReapply(page) {
  if (!page || typeof page.keyboard !== 'object') {
    throw new Error('pressCtrlCWithReapply: page is required and must be a Playwright Page');
  }
  // Re-apply the saved range AND verify selection is non-empty in the same
  // page.evaluate so the check happens immediately before we hand control
  // back to Node and press the key.
  const preState = await page.evaluate(() => {
    const hadReapply = typeof window.__pct_reapply === 'function';
    if (hadReapply) window.__pct_reapply();
    const sel = window.getSelection();
    return {
      hadReapply,
      selectionLength: sel ? sel.toString().length : 0,
    };
  });

  // Press Ctrl+C — the 'copy' event fires synchronously in the page.
  await page.keyboard.press('Control+C');

  // Short post-keystroke re-apply loop to keep the selection live across
  // any subsequent async work the extension or browser may schedule.
  const reapplyDeadline = Date.now() + 120;
  while (Date.now() < reapplyDeadline) {
    try {
      await page.evaluate(() => {
        if (typeof window.__pct_reapply === 'function') window.__pct_reapply();
      });
    } catch {
      break;
    }
    await page.waitForTimeout(20);
  }

  return preState;
}

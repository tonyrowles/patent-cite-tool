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
  return normalize(s).replace(/([a-zA-Z]) ([a-zA-Z]{4,}-)/g, '$1$2');
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
        normalize(s).replace(/([a-zA-Z]) ([a-zA-Z]{4,}-)/g, '$1$2');

      const CONTAINERS = [
        'section[itemprop="description"]',
        'section[itemprop="claims"]',
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
      // For correct offset mapping we walk character-by-character and emit a
      // "norm character" only when one would survive the regex chain. The
      // chain is non-local (rule 2 looks at neighbors around a hyphen), so
      // we use a small lookahead/lookbehind state.
      //
      // Simpler approach: walk the raw text per-node and apply the same
      // collapse-whitespace-run rule used by `normalize`'s first step
      // (\s+ → ' '), which is sufficient for offset bookkeeping in the
      // overwhelming majority of cases. The basic-normalize regex chain
      // turns "TALL - 2" into "TALL-2", which IS a meaningful offset shift,
      // but the round-trip verification at the end catches the rare
      // disagreement and reports it via SELECTION_FAILED.
      let node;
      while ((node = walker.nextNode())) {
        const raw = node.nodeValue || '';
        const segStart = normCursor;
        for (let i = 0; i < raw.length; i++) {
          const c = raw[i];
          if (/\s/.test(c)) {
            if (!inWhitespaceRun && normCursor > 0) {
              normCursor++;
            }
            inWhitespaceRun = true;
          } else {
            inWhitespaceRun = false;
            normCursor++;
          }
        }
        segments.push({
          node,
          rawText: raw,
          normStart: segStart,
          normEnd: normCursor,
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
        const re = /([a-zA-Z]) ([a-zA-Z]{4,}-)/g;
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
      // ------------------------------------------------------------
      function locate(normIdx) {
        for (const seg of segments) {
          if (normIdx >= seg.normStart && normIdx <= seg.normEnd) {
            // Re-walk raw to find the within-node offset.
            let nc = seg.normStart;
            let ws = seg.normStart > 0 && /\s/.test(seg.rawText[0] || '');
            for (let i = 0; i < seg.rawText.length; i++) {
              if (nc === normIdx) return { node: seg.node, offset: i };
              const c = seg.rawText[i];
              if (/\s/.test(c)) {
                if (!ws && nc > 0) nc++;
                ws = true;
              } else {
                ws = false;
                nc++;
              }
            }
            if (nc === normIdx) {
              return { node: seg.node, offset: seg.rawText.length };
            }
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

  // Wait past the content-script's 200ms mouseup debounce + a small margin.
  // The extension reads window.getSelection() at debounce-fire time, so the
  // Range must remain applied until at least 250ms after dispatch.
  await page.waitForTimeout(250);

  return result;
}

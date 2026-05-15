/**
 * selection-sim.mjs
 *
 * Pure-Node simulation of the in-browser logic in
 * tests/e2e/lib/selection.js, against a cached Google Patents HTML body
 * scoped to the description + claims sections.
 *
 * Used by scripts/regenerate-html-selectedtext.mjs to validate that a
 * candidate needle will be located AND roundtrip-verified by selection.js
 * when the regression spec runs in a real browser. If validation fails, the
 * regen script can adjust the candidate (e.g. pad with surrounding context)
 * until it passes.
 *
 * The simulation is intentionally a port of selection.js's `page.evaluate`
 * callback (the TreeWalker + Range body) so logic drift is observable.
 */

// ---------------------------------------------------------------------------
// HTML → text-node sequence
//
// The browser's TreeWalker yields text nodes in document order. To
// approximate this in Node we tokenize the HTML scoped to a section and
// emit text spans as "nodes" (one per text run between tags).
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  middot: '·',
  deg: '°',
  times: '×',
  divide: '÷',
  micro: 'µ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  pi: 'π',
  Omega: 'Ω',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]
        : m,
    );
}

/**
 * Tokenize HTML into an in-order sequence of decoded text nodes. Drops
 * <script> and <style> blocks (they would be skipped by TreeWalker via
 * NodeFilter.SHOW_TEXT only if the container excluded them; we strip for
 * safety in case Google Patents includes any).
 */
export function htmlToTextNodes(html) {
  // Strip script/style blocks
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const nodes = [];
  const re = /<[^>]+>|[^<]+/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const tok = m[0];
    if (tok.startsWith('<')) continue;
    if (!tok) continue;
    nodes.push(decodeEntities(tok));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Normalizers (verbatim ports of tests/e2e/lib/selection.js)
// ---------------------------------------------------------------------------

export function normalize(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+([,;:])/g, '$1')
    .trim();
}

export function normalizeDeep(s) {
  return normalize(s).replace(
    /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
    '$1$2',
  );
}

// ---------------------------------------------------------------------------
// selectText simulator — return what `sel.toString()` (after normalize)
// would produce for a given needle, or an error code.
// ---------------------------------------------------------------------------

/**
 * Run the selectText algorithm against a sequence of text nodes.
 *
 * @param {string[]} textNodes  Sequence of decoded text node values, in
 *                              document order.
 * @param {string} needle       The user's selectedText.
 * @returns {{ok:true, got:string, usedDeep:boolean} | {ok:false, error:string, detail:any}}
 */
export function simulateSelect(textNodes, needle) {
  // ---- container.textContent equivalent ----
  const text = textNodes.join('');
  const normalizedNeedleBasic = normalize(needle);
  const normalizedNeedleDeep = normalizeDeep(needle);

  const normText = normalize(text);
  const deepText = normalizeDeep(text);

  let usedDeep = false;
  if (normText.includes(normalizedNeedleBasic)) {
    usedDeep = false;
  } else if (deepText.includes(normalizedNeedleDeep)) {
    usedDeep = true;
  } else {
    return { ok: false, error: 'NEEDLE_NOT_IN_CONTAINER' };
  }

  // ---- walker pass: build flat char stream + normFromFlat map ----
  // Mirrors the updated selection.js walker (handles \s+ → ' ',
  // \s*-\s* → '-', \s+[,;:] → punct).
  let flat = '';
  const flatNodeIdx = [];
  const flatNodeOffset = [];
  for (let n = 0; n < textNodes.length; n++) {
    const r = textNodes[n];
    for (let j = 0; j < r.length; j++) {
      flat += r[j];
      flatNodeIdx.push(n);
      flatNodeOffset.push(j);
    }
  }
  const normFromFlat = new Array(flat.length).fill(-1);
  let normCursor = 0;
  let inWhitespaceRun = false;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (/\s/.test(c)) {
      let k = i;
      while (k < flat.length && /\s/.test(flat[k])) k++;
      const followChar = k < flat.length ? flat[k] : '';
      if (followChar === '-' || /[,;:]/.test(followChar)) {
        i = k - 1;
        inWhitespaceRun = false;
        continue;
      }
      if (!inWhitespaceRun && normCursor > 0) {
        normFromFlat[i] = normCursor;
        normCursor++;
        inWhitespaceRun = true;
      }
      // continued whitespace: leave normFromFlat[i] = -1
    } else if (c === '-') {
      normFromFlat[i] = normCursor;
      normCursor++;
      inWhitespaceRun = false;
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

  // ---- locate startNormIdx / endNormIdx in haystackBasic ----
  const haystackBasic = normalize(text);
  let startNormIdx = haystackBasic.indexOf(normalizedNeedleBasic);
  let endNormIdx = -1;
  let needleLenForRoundTrip = normalizedNeedleBasic.length;
  if (startNormIdx >= 0) {
    endNormIdx = startNormIdx + normalizedNeedleBasic.length;
  } else if (usedDeep) {
    const haystackDeep = normalizeDeep(text);
    const deepStart = haystackDeep.indexOf(normalizedNeedleDeep);
    if (deepStart < 0) return { ok: false, error: 'DEEP_INCONSISTENT' };
    const deepEnd = deepStart + normalizedNeedleDeep.length;
    const strippedSpacePositions = new Set();
    const re = /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g;
    let m;
    while ((m = re.exec(haystackBasic)) !== null) {
      strippedSpacePositions.add(m.index + 1);
      re.lastIndex = m.index + 1;
    }
    let basicIdx = 0;
    let deepIdx = 0;
    let basicStart = -1;
    let basicEnd = -1;
    while (basicIdx <= haystackBasic.length) {
      if (deepIdx === deepStart && basicStart === -1) basicStart = basicIdx;
      if (deepIdx === deepEnd && basicEnd === -1) {
        basicEnd = basicIdx;
        break;
      }
      if (basicIdx === haystackBasic.length) break;
      if (strippedSpacePositions.has(basicIdx)) {
        basicIdx++;
      } else {
        basicIdx++;
        deepIdx++;
      }
    }
    if (basicStart < 0 || basicEnd < 0)
      return { ok: false, error: 'DEEP_OFFSET_MAP_FAIL' };
    startNormIdx = basicStart;
    endNormIdx = basicEnd;
    needleLenForRoundTrip = basicEnd - basicStart;
  } else {
    return { ok: false, error: 'INCONSISTENT_WALK' };
  }

  // ---- locate node + offset via flat / normFromFlat map ----
  function locate(normIdx) {
    if (normIdx === normCursor) {
      if (textNodes.length === 0) return null;
      const lastN = textNodes.length - 1;
      return { segIdx: lastN, offset: textNodes[lastN].length };
    }
    for (let i = 0; i < flat.length; i++) {
      if (normFromFlat[i] === normIdx) {
        return { segIdx: flatNodeIdx[i], offset: flatNodeOffset[i] };
      }
    }
    return null;
  }

  const startLoc = locate(startNormIdx);
  const endLoc = locate(endNormIdx);
  if (!startLoc || !endLoc) return { ok: false, error: 'LOCATE_FAIL' };

  // ---- reconstruct sel.toString() = concat from startLoc to endLoc ----
  let out = '';
  if (startLoc.segIdx === endLoc.segIdx) {
    out = textNodes[startLoc.segIdx].slice(startLoc.offset, endLoc.offset);
  } else {
    out += textNodes[startLoc.segIdx].slice(startLoc.offset);
    for (let i = startLoc.segIdx + 1; i < endLoc.segIdx; i++) {
      out += textNodes[i];
    }
    out += textNodes[endLoc.segIdx].slice(0, endLoc.offset);
  }

  // ---- roundtrip check ----
  const gotBasic = normalize(out);
  const gotDeep = normalizeDeep(out);
  const expectedBasic = normalize(needle);
  const expectedDeep = normalizeDeep(needle);
  const roundTripOk = usedDeep
    ? gotDeep === expectedDeep
    : gotBasic === expectedBasic;

  return {
    ok: roundTripOk,
    got: out,
    gotNorm: usedDeep ? gotDeep : gotBasic,
    expectedNorm: usedDeep ? expectedDeep : expectedBasic,
    usedDeep,
    error: roundTripOk ? null : 'ROUNDTRIP_MISMATCH',
  };
}

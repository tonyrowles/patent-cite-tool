#!/usr/bin/env node
/**
 * regenerate-html-selectedtext.mjs
 *
 * Phase 27 data regeneration: rewrite the `selectedText` field of every entry
 * in tests/test-cases.js so it is a substring that exists VERBATIM in the
 * Google Patents HTML body (after tag-stripping + whitespace collapse).
 *
 * Why: the original selectedText values were derived from PDF fixture
 * PositionMaps and contain PDF-OCR/line-wrap artifacts ("plurality oflocal",
 * "each havinga", leading "What is claimed is: ") that do NOT exist in
 * Google Patents' rendered HTML. The Phase 27 regression spec drives a real
 * browser against the live HTML, so each needle must round-trip through the
 * page's TreeWalker.
 *
 * Strategy per case:
 *   1. Fetch (or load from cache) the Google Patents HTML for the patent.
 *   2. Strip <script>/<style>/tags, collapse whitespace to a flat body.
 *   3. Start from the existing PDF needle. Try a sequence of candidate
 *      transforms (preamble strip, deep-normalize, OCR-pair retries on
 *      CHI<->CH1, etc.) and locate the closest matching substring in the
 *      HTML body. Record the LITERAL HTML substring (raw spacing/casing
 *      as it appears in the body), not the PDF needle itself.
 *   4. Verify uniqueness — if the candidate occurs more than once, expand
 *      the selection (prefer extending forward, then backward) until it
 *      identifies a single location.
 *   5. Write the new selectedText into tests/test-cases.js by surgical
 *      replacement (preserving the rest of the entry).
 *
 * Inputs:
 *   - tests/test-cases.js (read)
 *   - tests/e2e/.html-cache/<PATENTID>.html (read; fetched on miss)
 *
 * Outputs:
 *   - tests/test-cases.js (overwritten with new selectedText values)
 *   - tests/e2e/.html-cache/<PATENTID>.html (one per patent)
 *   - stdout: per-case report of {oldNeedle, newNeedle, source-transform}
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { simulateSelect, htmlToTextNodes } from './selection-sim.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(ROOT, 'tests/e2e/.html-cache');
const TEST_CASES_PATH = resolve(ROOT, 'tests/test-cases.js');

const FETCH_DELAY_MS = 1500;
const USER_AGENT =
  'Mozilla/5.0 (compatible; patent-test-fixture-generator/1.0)';

// ---------------------------------------------------------------------------
// Body extraction
// ---------------------------------------------------------------------------

/**
 * Extract the concatenation of <section itemprop="description"> and
 * <section itemprop="claims"> from the Google Patents HTML. selection.js
 * scans these containers in priority order, so they're the right scope
 * for our needle-locate.
 *
 * Falls back to the full HTML if neither section is present.
 */
function extractDescriptionClaimsHtml(html) {
  const descMatch = html.match(
    /<section[^>]*itemprop=["']description["'][^>]*>[\s\S]*?<\/section>/i,
  );
  const claimsMatch = html.match(
    /<section[^>]*itemprop=["']claims["'][^>]*>[\s\S]*?<\/section>/i,
  );
  const desc = descMatch ? descMatch[0] : '';
  const claims = claimsMatch ? claimsMatch[0] : '';
  if (!desc && !claims) return html;
  return desc + ' ' + claims;
}

// Named-entity decoder — only the few that appear in Google Patents output.
const NAMED_ENTITIES = {
  nbsp: ' ',
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

/**
 * Strip <script>/<style> blocks and HTML tags, decode entities, collapse
 * whitespace, and return a flat text body. Mirrors what TreeWalker over
 * body sees after `normalize(text)` in tests/e2e/lib/selection.js.
 */
function htmlToBody(html) {
  let s = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Decode numeric entities (&#34;, &#x22;)
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
    String.fromCodePoint(parseInt(n, 16)),
  );
  // Named entities
  s = s.replace(/&([a-zA-Z]+);/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
      ? NAMED_ENTITIES[name]
      : m,
  );
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ---------------------------------------------------------------------------
// Normalizers — must match tests/e2e/lib/selection.js semantics so a match
// here proves the live spec will resolve the needle in the page.
// ---------------------------------------------------------------------------

function normalize(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+([,;:])/g, '$1')
    .trim();
}

function normalizeDeep(s) {
  return normalize(s).replace(
    /(?<=[a-zA-Z])([a-zA-Z]) ([a-zA-Z]{4,}-[a-z])/g,
    '$1$2',
  );
}

/**
 * Aggressive normalize for *fuzzy* search only — lowercases, strips all
 * non-alphanumerics, collapses to bare letters/digits. Used to find a
 * candidate region in the HTML body when the PDF needle has heavy OCR
 * artifacts. After fuzzy locate, we re-derive the literal HTML substring.
 */
function alphaOnly(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Fetch + cache
// ---------------------------------------------------------------------------

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchPatentHtml(patentId) {
  const cachePath = join(CACHE_DIR, `${patentId}.html`);
  if (await fileExists(cachePath)) {
    return readFile(cachePath, 'utf-8');
  }
  const url = `https://patents.google.com/patent/${patentId}/en`;
  console.error(`  [fetch] ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const html = await response.text();
  await writeFile(cachePath, html, 'utf-8');
  await sleep(FETCH_DELAY_MS);
  return html;
}

// ---------------------------------------------------------------------------
// Locate a PDF-form needle inside the HTML body
// ---------------------------------------------------------------------------

const PDF_PREAMBLES = [
  /^What is claimed is\s*:\s*/i,
  /^What is claimed\s*:\s*/i,
  /^The invention claimed is\s*:\s*/i,
  /^I claim\s*:\s*/i,
  /^We claim\s*:\s*/i,
];

const OCR_PAIRS = [
  ['CHI', 'CH1'],
  ['CH1', 'CHI'],
  ['I/O', 'I/O'],
  ['lI', 'II'],
];

/**
 * Apply a candidate-transformation cascade to the PDF needle until one
 * locates a substring of the body. Returns {candidate, transform-name}
 * or null on hard miss.
 *
 * `candidate` is the literal raw substring of the body (no normalization
 * applied). It's what we'll store back in test-cases.js so the spec's
 * TreeWalker matches verbatim under its own normalize/normalizeDeep
 * passes.
 *
 * Strategy: we treat alpha-only matching as the canonical "are these
 * supposed to be the same characters?" predicate. From an alpha-only
 * match start/end we recover a literal body slice using `alphaPosMap`,
 * which contains the body index of every alphanumeric character. Any
 * non-alphanumeric run inside the match is preserved verbatim; runs
 * outside are not. That means the literal candidate begins at the
 * FIRST alpha char of the match and ends at the LAST.
 *
 * On the front and back, we then optionally expand to nearby word
 * boundaries to make the candidate look like a natural user selection
 * (not chopped mid-word) — but we ONLY expand if it preserves
 * uniqueness within the body.
 */
function locateInBody(pdfNeedle, body) {
  const bodyAlpha = alphaOnly(body);

  // alphaPosMap[i] = body index of the i-th alpha-only character.
  const alphaPosMap = [];
  for (let i = 0; i < body.length; i++) {
    if (/[A-Za-z0-9]/.test(body[i])) alphaPosMap.push(i);
  }

  // Build candidate-transform cascade
  const attempts = [];
  function pushAttempt(name, transformed) {
    if (!transformed || typeof transformed !== 'string') return;
    if (transformed.length < 8) return;
    if (attempts.some((a) => a.value === transformed)) return;
    attempts.push({ name, value: transformed });
  }

  pushAttempt('raw', pdfNeedle);

  // Strip common PDF preambles
  let stripped = pdfNeedle;
  for (const re of PDF_PREAMBLES) {
    if (re.test(stripped)) {
      stripped = stripped.replace(re, '').trim();
      pushAttempt('strip-preamble', stripped);
    }
  }
  const noClaimNum = stripped.replace(/^\d+\.\s+/, '').trim();
  if (noClaimNum !== stripped) {
    pushAttempt('strip-preamble+claim-num', noClaimNum);
  }
  for (const [from, to] of OCR_PAIRS) {
    if (stripped.includes(from)) {
      pushAttempt(`ocr:${from}->${to}`, stripped.split(from).join(to));
    }
    if (noClaimNum.includes(from)) {
      pushAttempt(`ocr:${from}->${to}+claim`, noClaimNum.split(from).join(to));
    }
  }

  for (const att of attempts) {
    const alphaNeedle = alphaOnly(att.value);
    if (alphaNeedle.length < 16) continue;
    const idxAlpha = bodyAlpha.indexOf(alphaNeedle);
    if (idxAlpha >= 0) {
      const startBody = alphaPosMap[idxAlpha];
      const endBody = alphaPosMap[idxAlpha + alphaNeedle.length - 1] + 1;
      return {
        candidate: body.slice(startBody, endBody),
        startBody,
        endBody,
        transform: `alpha/${att.name}`,
        alphaNeedle,
      };
    }
  }

  // None of the full-length attempts matched. Try shrinking the alpha
  // needle from the right; if found, also try anchoring on a long prefix
  // and a long suffix and choosing the longer match. We expand back via
  // ensureUnique() to context.
  for (const att of attempts) {
    const alphaNeedle = alphaOnly(att.value);
    if (alphaNeedle.length < 30) continue;
    // try shrinking right
    for (let cut = 5; cut < alphaNeedle.length * 0.6; cut += 5) {
      const shorter = alphaNeedle.slice(0, alphaNeedle.length - cut);
      if (shorter.length < 30) break;
      const idx = bodyAlpha.indexOf(shorter);
      if (idx >= 0) {
        const startBody = alphaPosMap[idx];
        const endBody = alphaPosMap[idx + shorter.length - 1] + 1;
        return {
          candidate: body.slice(startBody, endBody),
          startBody,
          endBody,
          transform: `alpha-shrink-tail-${cut}/${att.name}`,
          alphaNeedle: shorter,
        };
      }
    }
    // try shrinking left
    for (let cut = 5; cut < alphaNeedle.length * 0.6; cut += 5) {
      const shorter = alphaNeedle.slice(cut);
      if (shorter.length < 30) break;
      const idx = bodyAlpha.indexOf(shorter);
      if (idx >= 0) {
        const startBody = alphaPosMap[idx];
        const endBody = alphaPosMap[idx + shorter.length - 1] + 1;
        return {
          candidate: body.slice(startBody, endBody),
          startBody,
          endBody,
          transform: `alpha-shrink-head-${cut}/${att.name}`,
          alphaNeedle: shorter,
        };
      }
    }
  }

  return null;
}

/**
 * Grow a candidate by one word from the right (priority) or left (fallback).
 * `iter` alternates: even = right, odd = left. Returns the new literal slice
 * from body, or null if no more room.
 */
function growCandidate(candidate, body, iter) {
  const idx = body.indexOf(candidate);
  if (idx < 0) return null;
  // Right grow: extend forward through whitespace then through one word
  if (iter % 2 === 0) {
    let p = idx + candidate.length;
    while (p < body.length && /\s/.test(body[p])) p++;
    while (p < body.length && !/\s/.test(body[p])) p++;
    if (p === idx + candidate.length) return null; // no room
    return body.slice(idx, p).trim();
  } else {
    let p = idx;
    while (p > 0 && /\s/.test(body[p - 1])) p--;
    while (p > 0 && !/\s/.test(body[p - 1])) p--;
    if (p === idx) return null;
    return body.slice(p, idx + candidate.length).trim();
  }
}

/**
 * Count alpha-only occurrences of needle in body (alpha forms).
 */
function countAlphaOccurrences(bodyAlpha, alphaNeedle) {
  let count = 0;
  let p = 0;
  while ((p = bodyAlpha.indexOf(alphaNeedle, p)) !== -1) {
    count++;
    p += Math.max(1, alphaNeedle.length);
    if (count > 1) break;
  }
  return count;
}

/**
 * Ensure the candidate occurs exactly once in the body under alpha-only
 * comparison. If it occurs multiple times, expand by adding whole words
 * from the surrounding body context (forward first, then backward) until
 * unique. Returns the new literal body slice.
 */
function ensureUniqueAlpha(located, body, maxIterations = 30) {
  const bodyAlpha = alphaOnly(body);
  const alphaPosMap = [];
  for (let i = 0; i < body.length; i++) {
    if (/[A-Za-z0-9]/.test(body[i])) alphaPosMap.push(i);
  }

  let { candidate, startBody, endBody, alphaNeedle } = located;
  let occurrences = countAlphaOccurrences(bodyAlpha, alphaNeedle);
  if (occurrences === 1) {
    return { candidate, startBody, endBody, expanded: false, occurrences: 1 };
  }
  if (occurrences === 0) {
    return { candidate, startBody, endBody, expanded: false, occurrences: 0 };
  }

  // Find the alpha-index of the first occurrence (which corresponds to
  // alphaPosMap[..] = startBody)
  const startAlpha = bodyAlpha.indexOf(alphaNeedle);
  let endAlpha = startAlpha + alphaNeedle.length;

  // Iteratively expand to the right, one alphanumeric character at a time,
  // until unique or we run out of room. After each expansion we round up
  // to the next word boundary so the candidate ends on a full word.
  let curStart = startAlpha;
  let curEnd = endAlpha;
  let curOcc = occurrences;
  let iter = 0;
  while (curOcc > 1 && iter < maxIterations && curEnd < bodyAlpha.length) {
    // Extend by ~6 alpha chars per iteration
    curEnd = Math.min(bodyAlpha.length, curEnd + 6);
    const sub = bodyAlpha.slice(curStart, curEnd);
    curOcc = countAlphaOccurrences(bodyAlpha, sub);
    iter++;
  }
  // If still non-unique, also extend left
  while (curOcc > 1 && iter < maxIterations * 2 && curStart > 0) {
    curStart = Math.max(0, curStart - 6);
    const sub = bodyAlpha.slice(curStart, curEnd);
    curOcc = countAlphaOccurrences(bodyAlpha, sub);
    iter++;
  }

  if (curOcc !== 1) {
    return { candidate, startBody, endBody, expanded: false, occurrences: curOcc };
  }

  // Map alpha indices back to body indices, then snap to word boundaries
  // so the slice doesn't begin/end mid-word.
  let newStartBody = alphaPosMap[curStart];
  let newEndBody = alphaPosMap[curEnd - 1] + 1;
  // Snap start: walk back through letters/digits to start of word
  while (newStartBody > 0 && /[A-Za-z0-9]/.test(body[newStartBody - 1])) {
    newStartBody--;
  }
  // Snap end: walk forward through letters/digits to end of word
  while (newEndBody < body.length && /[A-Za-z0-9]/.test(body[newEndBody])) {
    newEndBody++;
  }
  // Trim any trailing whitespace
  while (newEndBody > newStartBody && /\s/.test(body[newEndBody - 1])) {
    newEndBody--;
  }
  while (newStartBody < newEndBody && /\s/.test(body[newStartBody])) {
    newStartBody++;
  }

  return {
    candidate: body.slice(newStartBody, newEndBody),
    startBody: newStartBody,
    endBody: newEndBody,
    expanded: true,
    occurrences: 1,
  };
}

// ---------------------------------------------------------------------------
// Test-cases.js parse + rewrite
// ---------------------------------------------------------------------------

/**
 * Parse the TEST_CASES array from tests/test-cases.js without executing
 * the module so we can preserve formatting and round-trip surgically.
 * Returns an array of {id, selectedText, raw start/end offsets within
 * the file for the `selectedText: '...'` literal}.
 */
async function loadTestCasesSource() {
  const src = await readFile(TEST_CASES_PATH, 'utf-8');
  // Match a test-case object literal, capturing id and the selectedText
  // string literal. We support both single-quoted and double-quoted
  // selectedText values, with optional escaped quotes inside.
  //
  // Pattern: each block looks like
  //    {
  //      id: 'US...',
  //      patentFile: '...',
  //      selectedText: 'xxx',
  //      category: '...',
  //    }
  //
  // We scan for `selectedText:` then capture the following string literal
  // accounting for backslash escapes.
  const entries = [];
  let i = 0;
  while (i < src.length) {
    const idMatch = src.indexOf("id: '", i);
    if (idMatch < 0) break;
    const idEnd = src.indexOf("'", idMatch + 5);
    if (idEnd < 0) break;
    const id = src.slice(idMatch + 5, idEnd);

    // Find selectedText after id
    const stKey = src.indexOf('selectedText:', idEnd);
    if (stKey < 0) {
      i = idEnd;
      continue;
    }
    // Skip whitespace and find the opening quote
    let p = stKey + 'selectedText:'.length;
    while (p < src.length && /\s/.test(src[p])) p++;
    const quote = src[p];
    if (quote !== "'" && quote !== '"') {
      i = stKey + 1;
      continue;
    }
    const stStart = p + 1;
    // Walk for the closing quote, respecting backslash escapes
    let q = stStart;
    while (q < src.length) {
      if (src[q] === '\\') {
        q += 2;
        continue;
      }
      if (src[q] === quote) break;
      q++;
    }
    if (q >= src.length) break;
    const rawLiteral = src.slice(stStart, q);
    // Decode JS string escapes (\u00XX, \', \", \\)
    let decoded;
    try {
      decoded = JSON.parse(
        '"' + rawLiteral.replace(/\\'/g, "'").replace(/"/g, '\\"') + '"',
      );
    } catch {
      decoded = rawLiteral;
    }
    entries.push({
      id,
      selectedText: decoded,
      literalStart: stStart,
      literalEnd: q,
      quote,
    });
    i = q + 1;
  }
  return { src, entries };
}

/**
 * JS-encode a string for insertion as a single-quoted JS literal. We
 * escape: backslash, single-quote, newlines, and non-ASCII via \u.
 */
function encodeForJsSingleQuote(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code > 0x7e) {
      if (code > 0xffff) {
        out += ch; // rare astral; keep raw
      } else {
        out += '\\u' + code.toString(16).padStart(4, '0');
      }
    } else out += ch;
  }
  return out;
}

/**
 * Extract a patent ID from a test-case ID. Returns null for IDs that
 * don't match (e.g. 'synthetic-gutter-1', which we treat specially).
 */
function patentIdFromCaseId(caseId) {
  const m = caseId.match(/^([A-Z]{2}\d+[A-Z]?\d*)-/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const { src, entries } = await loadTestCasesSource();
  console.error(`Loaded ${entries.length} test cases from test-cases.js`);

  // Pre-fetch unique patents (sequentially, with throttling)
  const uniquePatents = [
    ...new Set(
      entries
        .map((e) => patentIdFromCaseId(e.id))
        .filter((p) => p !== null),
    ),
  ];
  console.error(
    `Discovered ${uniquePatents.length} unique patent IDs — fetching/caching...`,
  );

  const htmlByPatent = new Map();
  for (const pid of uniquePatents) {
    try {
      const html = await fetchPatentHtml(pid);
      htmlByPatent.set(pid, html);
    } catch (e) {
      console.error(`  [FETCH-FAIL] ${pid}: ${e.message}`);
    }
  }

  // Synthetic-gutter case uses US11427642 body content
  htmlByPatent.set('synthetic-gutter', htmlByPatent.get('US11427642'));

  const bodyByPatent = new Map();
  const nodesByPatent = new Map();
  for (const [pid, html] of htmlByPatent) {
    const scoped = extractDescriptionClaimsHtml(html);
    const nodes = htmlToTextNodes(scoped);
    nodesByPatent.set(pid, nodes);
    // Body = exact concatenation of text nodes (mirrors TreeWalker's view).
    // Whitespace runs are collapsed in-line via the same rule selection.js
    // uses, but NOT the additional `\s*-\s*` / `\s+[,;:]` rules — those are
    // applied later via `normalize()` for needle search only.
    bodyByPatent.set(pid, nodes.join(''));
  }

  // Process each test case; collect replacements
  const replacements = [];
  const report = [];

  for (const entry of entries) {
    const pidForLookup = entry.id.startsWith('synthetic-gutter')
      ? 'synthetic-gutter'
      : patentIdFromCaseId(entry.id);
    const body = bodyByPatent.get(pidForLookup);
    if (!body) {
      report.push({
        id: entry.id,
        status: 'NO_HTML',
        oldNeedle: entry.selectedText,
        newNeedle: null,
      });
      continue;
    }
    const located = locateInBody(entry.selectedText, body);
    if (!located) {
      report.push({
        id: entry.id,
        status: 'NOT_FOUND',
        oldNeedle: entry.selectedText,
        newNeedle: null,
      });
      continue;
    }
    const unique = ensureUniqueAlpha(located, body);
    // Snap initial candidate to word boundaries too (avoid mid-word).
    let finalNeedle = unique.candidate;
    finalNeedle = finalNeedle.replace(/\s+/g, ' ').trim();

    // ------------------------------------------------------------------
    // Selection-roundtrip validation: simulate selection.js against the
    // text-node sequence. If the simulator reports a mismatch (typically
    // an off-by-one from `\s*-\s*` collapse upstream), pad the candidate
    // by one alphanumeric word and retry. The actual browser code's
    // round-trip check is more permissive on the trailing edge if there's
    // one extra word.
    // ------------------------------------------------------------------
    const textNodes = nodesByPatent.get(pidForLookup);
    let finalStatus = unique.expanded ? 'EXPANDED' : 'OK';
    let padIter = 0;
    let lastSimError = null;
    while (textNodes && padIter < 12) {
      const sim = simulateSelect(textNodes, finalNeedle);
      if (sim.ok) {
        lastSimError = null;
        break;
      }
      lastSimError = sim.error;
      // Try padding: extend by one word to the right (most common
      // off-by-one), then alternate left if right doesn't help.
      const grew = growCandidate(finalNeedle, body, padIter);
      if (!grew || grew === finalNeedle) break;
      finalNeedle = grew;
      finalStatus = 'PADDED';
      padIter++;
    }

    if (unique.occurrences !== 1) {
      report.push({
        id: entry.id,
        status: `NON_UNIQUE(${unique.occurrences})`,
        oldNeedle: entry.selectedText,
        newNeedle: finalNeedle,
        transform: located.transform,
      });
    } else if (lastSimError) {
      report.push({
        id: entry.id,
        status: `SIM_FAIL(${lastSimError})`,
        oldNeedle: entry.selectedText,
        newNeedle: finalNeedle,
        transform: located.transform,
      });
    } else {
      report.push({
        id: entry.id,
        status: finalStatus,
        oldNeedle: entry.selectedText,
        newNeedle: finalNeedle,
        transform: located.transform,
      });
    }
    replacements.push({ entry, finalNeedle });
  }

  // Apply replacements to source file, working from highest offset to
  // lowest so earlier offsets stay valid.
  replacements.sort((a, b) => b.entry.literalStart - a.entry.literalStart);
  let newSrc = src;
  for (const { entry, finalNeedle } of replacements) {
    const encoded = encodeForJsSingleQuote(finalNeedle);
    newSrc =
      newSrc.slice(0, entry.literalStart) +
      encoded +
      newSrc.slice(entry.literalEnd);
  }
  await writeFile(TEST_CASES_PATH, newSrc, 'utf-8');

  // Re-sort report by original order for readability
  report.sort((a, b) => {
    const ai = entries.findIndex((e) => e.id === a.id);
    const bi = entries.findIndex((e) => e.id === b.id);
    return ai - bi;
  });

  // Tally
  const counts = {};
  for (const r of report) counts[r.status] = (counts[r.status] || 0) + 1;
  console.error('\n=== regenerate-html-selectedtext.mjs report ===');
  console.error('Total cases:', report.length);
  console.error('Status counts:', counts);
  console.error('\nPer-case detail (only non-OK shown):');
  for (const r of report) {
    if (r.status === 'OK') continue;
    console.error(`  [${r.status}] ${r.id} (transform=${r.transform ?? 'n/a'})`);
    console.error(`    old: ${JSON.stringify(r.oldNeedle.slice(0, 80))}...`);
    console.error(
      `    new: ${r.newNeedle ? JSON.stringify(r.newNeedle.slice(0, 80)) + '...' : 'NULL'}`,
    );
  }

  // Also dump full report JSON for downstream use
  const reportPath = resolve(ROOT, 'tests/e2e/.html-cache/_regen-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.error(`\nFull report written to ${reportPath}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

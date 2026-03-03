/**
 * DOM-based paragraph citation for published patent applications.
 *
 * This is a classic script (NOT an ES module). It is loaded via the
 * manifest content_scripts array before content-script.js, making its
 * functions available as globals in the content script context.
 *
 * Provides:
 *   findParagraphCitation(selection) - main entry point
 *   buildParagraphMap()              - scans DOM for paragraph markers
 *   findParagraphForNode(node, map)  - locates paragraph for a DOM node
 *   formatAppCitation(start, end)    - formats the citation string
 */

/**
 * Find paragraph citation for a text selection in a published application.
 *
 * Extracts paragraph numbers from the Google Patents HTML DOM and maps
 * the selection to the nearest paragraph marker(s).
 *
 * @param {Selection} selection - The current text selection
 * @returns {{ citation: string, confidence: number } | null}
 */
function findParagraphCitation(selection) {
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  // Build paragraph map from the DOM
  const paragraphMap = buildParagraphMap();
  if (paragraphMap.length === 0) return null;

  // Find which paragraph contains the start of the selection
  const startPara = findParagraphForNode(range.startContainer, paragraphMap);
  // Find which paragraph contains the end of the selection
  const endPara = findParagraphForNode(range.endContainer, paragraphMap);

  if (!startPara) return null;

  const effectiveEnd = endPara || startPara;

  return {
    citation: formatAppCitation(startPara, effectiveEnd),
    confidence: 1.0, // DOM-based lookup is deterministic
  };
}

/**
 * Build an ordered list of paragraph markers found in the DOM.
 *
 * Scans the description and claims sections for [XXXX] paragraph markers.
 * Returns entries sorted in document order with references to their DOM nodes.
 *
 * @returns {Array<{ paraNum: string, node: Node }>}
 */
function buildParagraphMap() {
  const paragraphs = [];

  // Try multiple selectors for robustness (Google Patents DOM may change)
  const containers = [
    document.querySelector('.description.style-scope.patent-text'),
    document.querySelector('.description'),
    document.querySelector('.claims.style-scope.patent-text'),
    document.querySelector('.claims'),
  ].filter(Boolean);

  // Deduplicate containers (if .description matches both selectors)
  const seen = new Set();
  const uniqueContainers = containers.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const container of uniqueContainers) {
    // Walk all text nodes looking for [XXXX] patterns
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      const matches = node.textContent.matchAll(/\[(\d{4})\]/g);
      for (const match of matches) {
        paragraphs.push({
          paraNum: match[1],
          node: node,
        });
      }
    }
  }

  return paragraphs;
}

/**
 * Find the paragraph number that contains a given DOM node.
 *
 * Walks through the paragraph map to find the nearest preceding
 * paragraph marker relative to the target node using DOM ordering.
 *
 * compareDocumentPosition semantics (called as targetNode.compareDocumentPosition(entry.node)):
 *   DOCUMENT_POSITION_PRECEDING (2): entry.node comes BEFORE targetNode
 *   DOCUMENT_POSITION_FOLLOWING (4): entry.node comes AFTER targetNode
 *   DOCUMENT_POSITION_CONTAINS (8): entry.node contains targetNode
 *   DOCUMENT_POSITION_CONTAINED_BY (16): entry.node is inside targetNode
 *
 * @param {Node} targetNode - The DOM node to locate
 * @param {Array<{ paraNum: string, node: Node }>} paragraphMap
 * @returns {string | null} The paragraph number (e.g., "0045")
 */
function findParagraphForNode(targetNode, paragraphMap) {
  let result = null;

  for (const entry of paragraphMap) {
    const pos = targetNode.compareDocumentPosition(entry.node);

    // entry.node is before or is same node as target
    if (pos === 0 || (pos & Node.DOCUMENT_POSITION_PRECEDING)) {
      result = entry.paraNum;
    } else if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      // entry.node is after target -- we've gone past, stop
      break;
    } else if (pos & Node.DOCUMENT_POSITION_CONTAINS) {
      // entry.node contains target -- target is inside this paragraph's text node
      result = entry.paraNum;
    }
  }

  return result;
}

/**
 * Format a published application paragraph citation.
 *
 * @param {string} startPara - Start paragraph number (e.g., "0045")
 * @param {string} endPara - End paragraph number (e.g., "0047")
 * @returns {string} Formatted citation (e.g., "\u00B6 [0045]" or "\u00B6 [0045]-[0047]")
 */
function formatAppCitation(startPara, endPara) {
  if (startPara === endPara) {
    return `\u00B6 [${startPara}]`;
  }
  return `\u00B6 [${startPara}]-[${endPara}]`;
}

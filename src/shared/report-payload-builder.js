// Phase 2 Plan 01 (PAY-06) — pure payload builder for the v5.0 bug-report feature.
//
// D-07: PURE — same inputs → byte-identical object (SC3). No browser APIs, no fs/path/
//       child_process, no crypto. The Worker computes the server-side fields
//       (timestamp, dedup counter); the builder must NOT send those fields.
// D-04: confidenceTier is a STRING PASSTHROUGH ('green'/'yellow'/'red'). The builder
//       performs no numeric→tier mapping — that belongs to Phase 4 (citation-UI wiring).

import { REPORT_CATEGORIES } from './constants.js';

// ---------------------------------------------------------------------------
// Public entry-point (PAY-06)
// ---------------------------------------------------------------------------

/**
 * Build the extension-side report payload conforming to worker/src/report-schema.md.
 *
 * Output contains exactly the 17 non-server-computed allowlist fields in canonical
 * schema order so JSON.stringify is byte-stable (SC3, D-07).
 *
 * @param {object} params
 * @param {object} params.context  Live citation/page snapshot from the content script.
 *   { patentNumber, patentUrl?, selectionText, returnedCitation, confidenceTier,
 *     extensionVersion, browser, os, xpathNode, scrollY, viewportWidth,
 *     viewportHeight, pdfParseStatus }
 * @param {string} params.category  One of the 4 frozen REPORT_CATEGORIES strings.
 * @param {string|null} [params.note]  Optional free-text note; null when absent.
 * @param {{ triggerMode?: string }} [params.settings]  Settings snapshot.
 * @param {Array} [params.errors]  Ring-buffer array of recent errors → errorLog.
 * @param {boolean} params.includeSelectionText  Privacy toggle (SC2/D-06):
 *   false → selectionText key is ENTIRELY ABSENT from output (not null, not '').
 * @returns {object}  Plain object whose keys are the 17 allowlisted fields in schema order.
 * @throws {Error}  If patentNumber is missing/empty, category is not in REPORT_CATEGORIES,
 *   or extensionVersion is missing/empty (D-05 fail-fast guard).
 */
export function buildReportPayload({ context, category, note, settings, errors, includeSelectionText }) {
  // D-05 — Throw BEFORE constructing the payload on required-field violations.
  // Mirrors the Worker's validateReportBody() D-09 gate client-side.
  if (!context?.patentNumber || String(context.patentNumber).trim() === '') {
    throw new Error(
      'buildReportPayload: context.patentNumber is required and must not be empty'
    );
  }
  if (!REPORT_CATEGORIES.includes(category)) {
    throw new Error(
      `buildReportPayload: category "${category}" is not in REPORT_CATEGORIES ` +
      `(allowed: ${REPORT_CATEGORIES.join(', ')})`
    );
  }
  if (!context?.extensionVersion || String(context.extensionVersion).trim() === '') {
    throw new Error(
      'buildReportPayload: context.extensionVersion is required and must not be empty'
    );
  }

  // D-08 — Resolve defaults for optional fields.
  // Defensive copy of errors: returning the caller's array by reference would let
  // post-call mutation silently alter the payload, breaking the D-07/SC3 purity
  // guarantee (same inputs → byte-identical output).
  const errorLog = errors != null ? [...errors] : [];
  const resolvedNote = note ?? null;
  const patentUrl = context.patentUrl ??
    ('https://patents.google.com/patent/US' + context.patentNumber);

  // D-07 — Build the payload as ONE explicit ordered object literal.
  // Key order = report-schema.md allowlist order (server-computed fields excluded).
  // Explicit literal ensures JSON.stringify produces byte-identical output for
  // identical inputs (SC3). PAY-03 forbidden fields are never referenced here.
  //
  // D-06 — selectionText is the LONE conditional key: entirely absent when
  // includeSelectionText===false (not null, not ''). Conditional spread at the
  // correct schema position (between patentUrl and returnedCitation) preserves
  // deterministic key order.
  const payload = {
    category,
    patentNumber: context.patentNumber,
    patentUrl,
    ...(includeSelectionText ? { selectionText: context.selectionText ?? null } : {}),
    returnedCitation: context.returnedCitation ?? null,
    confidenceTier: context.confidenceTier ?? null,   // string passthrough (D-04)
    extensionVersion: context.extensionVersion,
    browser: context.browser ?? null,
    os: context.os ?? null,
    xpathNode: context.xpathNode ?? null,
    scrollY: context.scrollY ?? null,
    viewportWidth: context.viewportWidth ?? null,
    viewportHeight: context.viewportHeight ?? null,
    pdfParseStatus: context.pdfParseStatus ?? null,
    triggerMode: settings?.triggerMode ?? null,
    errorLog,
    note: resolvedNote,
  };

  return payload;
}

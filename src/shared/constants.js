/**
 * Shared constants for the Patent Citation Tool extension.
 *
 * Single source of truth — bundled per-target by esbuild:
 * IIFE for content scripts, ESM for background/offscreen workers.
 */

export const MSG = {
  PATENT_PAGE_DETECTED: 'patent-page-detected',
  PDF_LINK_FOUND: 'pdf-link-found',
  PDF_LINK_NOT_FOUND: 'pdf-link-not-found',
  FETCH_PDF: 'fetch-pdf',
  PDF_FETCH_RESULT: 'pdf-fetch-result',
  PARSE_PDF: 'parse-pdf',
  PARSE_RESULT: 'parse-result',
  GET_STATUS: 'get-status',
  LOOKUP_POSITION: 'lookup-position',
  CITATION_RESULT: 'citation-result',
  GENERATE_CITATION: 'generate-citation',
  FETCH_USPTO_PDF: 'fetch-uspto-pdf',
  USPTO_FETCH_RESULT: 'uspto-fetch-result',
  CHECK_CACHE: 'check-cache',
  CACHE_HIT_RESULT: 'cache-hit-result',
  CACHE_MISS: 'cache-miss',
  UPLOAD_TO_CACHE: 'upload-to-cache',
  SUBMIT_REPORT: 'submit-report',   // PAY-05
};

export const STATUS = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  READY: 'ready',
  PARSING: 'parsing',
  PARSED: 'parsed',
  NO_TEXT_LAYER: 'no-text-layer',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

export const PATENT_TYPE = {
  GRANT: 'grant',
  APPLICATION: 'application',
};

// PAY-05 — Bug-report feature constants (Phase 2, v5.0)
// Frozen so callers cannot mutate the allowlist at runtime (T-02-03).
// Idiom sourced from tests/e2e/lib/issue-payload-builder.js:51-54.
export const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_citation',
  'no_match',
  'tool_not_working',
  'other',
]);

export const WORKER_REPORT_URL = 'https://pct.tonyrowles.com/report';

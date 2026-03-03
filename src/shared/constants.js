/**
 * Shared constants for the Patent Citation Tool extension.
 *
 * This file is loaded two ways:
 * - As a classic script in content_scripts (constants become globals)
 * - As an ES module import in the service worker
 */

const MSG = {
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
};

const STATUS = {
  IDLE: 'idle',
  FETCHING: 'fetching',
  READY: 'ready',
  PARSING: 'parsing',
  PARSED: 'parsed',
  NO_TEXT_LAYER: 'no-text-layer',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

const PATENT_TYPE = {
  GRANT: 'grant',
  APPLICATION: 'application',
};

/* No export — this file is loaded as a classic script in content_scripts.
   The service worker defines its own copy of these constants. */
